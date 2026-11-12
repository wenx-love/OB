import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/Projects/ob-recover';
const PAGE_URL = pathToFileURL(ROOT + '/test-pages/capture-proto.html').href;
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/chrome-proto-profile';
const OUT = ROOT + '/test/acceptance/phase3-proto-result.json';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXPECTED = { 'decOne|[256]': { type: 'string', value: 'Signature' }, 'decOne|[257]': { type: 'string', value: 'hello' }, 'decOne|[264]': { type: 'string', value: 'beta' }, 'decTwo|[259,"yBNh"]': { type: 'string', value: 'foo:yBNh' }, 'decTwo|[264,"nk"]': { type: 'string', value: 'beta:nk' }, 'decThree|[260,"k","s"]': { type: 'string', value: 'bar|k|s' }, 'decNum|[261]': { type: 'number', value: 10 }, 'decUndef|[262]': { type: 'undefined' }, 'decNull|[263]': { type: 'null', value: null }, 'decNested|[264,"nk"]': { type: 'string', value: 'beta:nk+beta' }, 'decThrow|[1]': null, 'decLoop|[265,"abc"]': { type: 'string', value: 'gamma#90' } };
function verdict(cap) {
  const key = cap.fn + '|' + JSON.stringify((cap.arguments || []).map((a) => a.value));
  const exp = EXPECTED[key];
  if (cap.captureStatus === 'capture-failed') return exp === null ? 'OK(failed-as-expected)' : 'MISSED';
  if (exp === null || exp === undefined) return 'UNEXPECTED';
  return JSON.stringify(cap.returnValue) === JSON.stringify(exp) ? 'OK' : 'WRONG(expected ' + JSON.stringify(exp) + ')';
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const handlers = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
        }
      } else if (m.method) {
        (handlers.get(m.method) || []).forEach((h) => h(m.params));
      }
    };
    ws.onerror = () => reject(new Error('websocket error'));
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const i = ++id;
          pending.set(i, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      },
      on(method, h) {
        if (!handlers.has(method)) handlers.set(method, []);
        handlers.get(method).push(h);
      },
      close() { ws.close(); },
    });
  });
}

function posOf(src, idx) {
  const lines = src.slice(0, idx).split('\n');
  return { lineNumber: lines.length - 1, columnNumber: lines[lines.length - 1].length };
}

function findRets(src, bodyStart) {
  let d = 1;
  let q = bodyStart;
  while (q < src.length && d > 0) {
    if (src[q] === '{') d++;
    else if (src[q] === '}') d--;
    q++;
  }
  const body = src.slice(bodyStart, q);
  const rets = [];
  const rr = /\breturn\b/g;
  let mm;
  while ((mm = rr.exec(body))) rets.push(posOf(src, bodyStart + mm.index));
  rets.push(posOf(src, q - 1));
  return rets;
}

function findFunctions(src) {
  const re = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    let p = m.index + m[0].length;
    while (/\s/.test(src[p])) p++;
    out.push({
      name: m[1],
      params: m[2].split(',').map((s) => s.trim()).filter(Boolean),
      funcStart: posOf(src, m.index),
      firstStmt: posOf(src, p),
      rets: findRets(src, m.index + m[0].length),
    });
  }
  return out;
}

function rv(r) {
  if (!r || r.type === 'undefined') return { type: 'undefined' };
  if (r.subtype === 'null') return { type: 'null', value: null };
  if ('value' in r) return { type: r.type, value: r.value };
  if (r.unserializableValue) return { type: r.type, unserializable: r.unserializableValue };
  return { type: r.type, subtype: r.subtype, description: r.description };
}

async function readArgs(c, frame, names) {
  const scope = frame.scopeChain.find((s) => s.type === 'local');
  if (!scope) return { error: 'no local scope' };
  const res = await c.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
  const map = new Map(res.result.map((p) => [p.name, p.value]));
  return names.map((n) => (map.has(n) ? rv(map.get(n)) : { type: 'missing' }));
}

async function runStage(name, cfg) {
  if (process.env.ONLY && !process.env.ONLY.includes(name[0])) return { name, cfg, breakpoints: [], raw: [], captures: [], pauses: 0, skipped: true, groundTruth: 'skipped', durationMs: 0, errors: [], removed: 0 };
  return runStageImpl(name, cfg);
}

async function runStageImpl(name, cfg) {
  const t = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
  const c = await connect(t.webSocketDebuggerUrl);
  const st = { name, cfg, breakpoints: [], raw: [], captures: [], stack: [], pauses: 0, forcedResumes: 0, errors: [], removed: 0 };
  const bpMap = new Map();
  let paused = false;
  let lastEvent = Date.now();
  let ready;
  const readyP = new Promise((r) => (ready = r));
  let chain = Promise.resolve();

  async function onPaused(p) {
    const frames = p.callFrames;
    const top = frames[0];
    const depth = frames.length;
    const hits = (p.hitBreakpoints || []).map((id) => bpMap.get(id)).filter(Boolean);
    const retHit = hits.find((h) => h.kind === 'ret');
    const hit = hits.find((h) => h.kind !== 'ret');
    st.raw.push({ reason: p.reason, fn: top.functionName, line: top.location.lineNumber, col: top.location.columnNumber, depth, hitBp: hit ? hit.name : null, hasReturnValue: 'returnValue' in top, returnValue: 'returnValue' in top ? rv(top.returnValue) : undefined });
    if (!hit && retHit) {
      const ri = st.stack.map((x) => x.fn + '@' + x.depth).lastIndexOf(retHit.name + '@' + depth);
      if (ri < 0) { await c.send('Debugger.resume'); return; }
      if ('returnValue' in top && top.functionName === retHit.name) {
        const ent = st.stack.splice(ri, 1)[0];
        ent.returnValue = rv(top.returnValue);
        ent.captureStatus = 'success';
        ent.capturedAt = 'return-bp-direct';
        st.captures.push(ent);
        await c.send(st.stack.some((x) => x.awaitRet) ? 'Debugger.stepOver' : 'Debugger.resume');
        return;
      }
      st.stack[ri].awaitRet = true;
      await c.send('Debugger.stepOver');
      return;
    }
    if (hit) {
      while (st.stack.length && st.stack[st.stack.length - 1].depth >= depth) {
        const dead = st.stack.pop();
        dead.captureStatus = 'capture-failed';
        dead.reason = 'function exited without a step pause (exception or abnormal exit)';
        st.captures.push(dead);
      }
      const cap = {
        fn: hit.name, depth, steps: 0,
        entry: { line: top.location.lineNumber, col: top.location.columnNumber },
        caller: frames[1] ? { fn: frames[1].functionName, line: frames[1].location.lineNumber, col: frames[1].location.columnNumber } : null,
        arguments: await readArgs(c, top, hit.params),
      };
      st.stack.push(cap);
      if (cfg.strategy === 'retBp') { cap.awaitRet = !!retHit; await c.send(retHit ? 'Debugger.stepOver' : 'Debugger.resume'); return; }
      await c.send(cfg.strategy === 'stepOver' ? 'Debugger.stepOver' : 'Debugger.stepOut');
      return;
    }
    if (cfg.strategy === 'retBp') {
      const waiting = () => st.stack.some((x) => x.awaitRet);
      const ri = st.stack.map((x) => x.fn + '@' + x.depth).lastIndexOf(top.functionName + '@' + depth);
      if (ri >= 0 && st.stack[ri].awaitRet) {
        const ent = st.stack[ri];
        ent.retSteps = (ent.retSteps || 0) + 1;
        if ('returnValue' in top) { st.stack.splice(ri, 1); ent.returnValue = rv(top.returnValue); ent.captureStatus = 'success'; st.captures.push(ent); }
        else if (ent.retSteps >= 20) { st.stack.splice(ri, 1); ent.captureStatus = 'capture-failed'; ent.reason = 'no returnValue after 20 steps from the return statement'; st.captures.push(ent); }
      } else {
        while (st.stack.length && st.stack[st.stack.length - 1].awaitRet && st.stack[st.stack.length - 1].depth > depth) {
          const dead = st.stack.pop();
          dead.captureStatus = 'capture-failed';
          dead.reason = 'left the function without a returnValue pause (function may have thrown)';
          st.captures.push(dead);
        }
      }
      await c.send(waiting() ? 'Debugger.stepOver' : 'Debugger.resume');
      return;
    }
    const cap = st.stack[st.stack.length - 1];
    if (!cap) { await c.send('Debugger.resume'); return; }
    if (cfg.strategy === 'stepOut') {
      st.stack.pop();
      cap.afterStep = { fn: top.functionName, line: top.location.lineNumber, col: top.location.columnNumber, depth };
      if ('returnValue' in top) { cap.returnValue = rv(top.returnValue); cap.captureStatus = 'success'; }
      else { cap.captureStatus = 'capture-failed'; cap.reason = 'no returnValue on callFrames[0] after stepOut (function may have thrown)'; }
      st.captures.push(cap);
      await c.send(st.stack.length ? 'Debugger.stepOut' : 'Debugger.resume');
      return;
    }
    cap.steps++;
    if ('returnValue' in top && depth === cap.depth && top.functionName === cap.fn) {
      st.stack.pop();
      cap.returnValue = rv(top.returnValue); cap.captureStatus = 'success'; cap.foundAfterSteps = cap.steps;
      st.captures.push(cap);
      await c.send(st.stack.length ? 'Debugger.stepOver' : 'Debugger.resume');
    } else if (depth < cap.depth || cap.steps >= 40) {
      st.stack.pop();
      cap.captureStatus = 'capture-failed';
      cap.reason = depth < cap.depth ? 'left the function without a returnValue pause (function may have thrown)' : 'step limit reached';
      st.captures.push(cap);
      await c.send(st.stack.length ? 'Debugger.stepOver' : 'Debugger.resume');
    } else {
      await c.send('Debugger.stepOver');
    }
  }

  c.on('Debugger.resumed', () => { paused = false; lastEvent = Date.now(); });
  c.on('Debugger.paused', (p) => {
    paused = true; lastEvent = Date.now(); st.pauses++;
    chain = chain.then(() => onPaused(p)).catch(async (e) => {
      st.errors.push('paused: ' + e.message);
      try { await c.send('Debugger.resume'); } catch { /* ignore */ }
    });
  });
  c.on('Debugger.scriptParsed', (p) => {
    if (!p.url.endsWith('capture-proto.js')) return;
    chain = chain.then(async () => {
      const src = (await c.send('Debugger.getScriptSource', { scriptId: p.scriptId })).scriptSource;
      for (const f of findFunctions(src).filter((x) => cfg.bpFns.includes(x.name))) {
        const loc = cfg.bpAt === 'funcStart' ? f.funcStart : f.firstStmt;
        const r = await c.send('Debugger.setBreakpoint', { location: { scriptId: p.scriptId, lineNumber: loc.lineNumber, columnNumber: loc.columnNumber } });
        bpMap.set(r.breakpointId, f);
        st.breakpoints.push({ fn: f.name, requested: loc, actual: r.actualLocation, id: r.breakpointId });
        if (cfg.strategy === 'retBp') {
          for (const rp of f.rets) {
            const r2 = await c.send('Debugger.setBreakpoint', { location: { scriptId: p.scriptId, lineNumber: rp.lineNumber, columnNumber: rp.columnNumber } });
            bpMap.set(r2.breakpointId, { name: f.name, params: f.params, kind: 'ret' });
            st.breakpoints.push({ fn: f.name + '(ret)', requested: rp, actual: r2.actualLocation, id: r2.breakpointId });
          }
        }
      }
      ready();
    }).catch((e) => st.errors.push('setup: ' + e.message));
  });

  const watchdog = setInterval(async () => {
    if (paused && Date.now() - lastEvent > 8000) {
      st.forcedResumes++; lastEvent = Date.now();
      try { await c.send('Debugger.resume'); } catch { /* ignore */ }
    }
  }, 1000);

  const t0 = Date.now();
  await c.send('Debugger.enable');
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: PAGE_URL });
  await Promise.race([readyP, sleep(10000)]);

  let done = false;
  while (Date.now() - t0 < 30000) {
    if (!paused) {
      const r = await c.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
      if (r.result.value === 'done') { done = true; break; }
    }
    await sleep(300);
  }
  await sleep(500);
  st.done = done;
  st.durationMs = Date.now() - t0;
  try {
    const r = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__protoResult)', returnByValue: true });
    st.groundTruth = r.result.value;
  } catch (e) { st.errors.push('truth: ' + e.message); }
  st.leftoverPending = st.stack.length;
  for (const id of bpMap.keys()) {
    try { await c.send('Debugger.removeBreakpoint', { breakpointId: id }); st.removed++; } catch (e) { st.errors.push('remove: ' + e.message); }
  }
  clearInterval(watchdog);
  try { await c.send('Debugger.disable'); } catch { /* ignore */ }
  c.close();
  try { await fetch(BASE + '/json/close/' + t.id); } catch { /* ignore */ }
  delete st.stack;
  return st;
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const result = { chrome: null, stages: [] };
  try {
    let version = null;
    for (let i = 0; i < 60 && !version; i++) {
      try { version = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); }
    }
    if (!version) throw new Error('Chrome remote debugging port not reachable');
    result.chrome = version.Browser;
    const all = ['decOne', 'decTwo', 'decThree', 'decNum', 'decUndef', 'decNull', 'decThrow', 'decNested'];
    result.stages.push(await runStage('A: entry bp + stepOut (all decoders, nested/throw included)', { bpFns: all, bpAt: 'firstStmt', strategy: 'stepOut' }));
    result.stages.push(await runStage('B: entry bp + stepOver probe (non-nesting decoders)', { bpFns: ['decOne', 'decNum', 'decUndef', 'decNull', 'decThrow'], bpAt: 'firstStmt', strategy: 'stepOver' }));
    result.stages.push(await runStage('C: bp at function keyword position (decOne) + stepOut', { bpFns: ['decOne'], bpAt: 'funcStart', strategy: 'stepOut' }));
    result.stages.push(await runStage('D: function-start bp + stepOver (ALL decoders, nested bps included)', { bpFns: all, bpAt: 'funcStart', strategy: 'stepOver' }));
    result.stages.push(await runStage('E: entry bp + return-statement bps + one stepOver (loop decoder, single-statement return, nested)', { bpFns: ['decOne', 'decTwo', 'decThree', 'decNum', 'decLoop', 'decNested'], bpAt: 'funcStart', strategy: 'retBp' }));
    result.stages.push(await runStage('F: stepOver strategy on loop decoder (expected to hit the step limit)', { bpFns: ['decLoop'], bpAt: 'funcStart', strategy: 'stepOver' }));
    result.stages.push(await runStage('G: entry bp + return bps + closing-brace bp, ALL decoders (undefined/null/throw/implicit return)', { bpFns: all.concat(['decLoop']), bpAt: 'funcStart', strategy: 'retBp' }));
  } catch (e) {
    result.fatal = e.message;
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('Chrome:', result.chrome, result.fatal ? ' FATAL: ' + result.fatal : '');
  for (const s of result.stages) {
    console.log('\n=== ' + s.name + ' ===');
    console.log('breakpoints:', s.breakpoints.map((b) => b.fn + ' req=' + b.requested.lineNumber + ':' + b.requested.columnNumber + ' actual=' + (b.actual ? b.actual.lineNumber + ':' + b.actual.columnNumber : 'none')).join(' | '));
    console.log('pauses=' + s.pauses + ' done=' + s.done + ' forcedResumes=' + s.forcedResumes + ' removedBps=' + s.removed + ' leftoverPending=' + s.leftoverPending + ' ms=' + s.durationMs + ' errors=' + JSON.stringify(s.errors));
    for (const cap of s.captures) console.log('CAP ' + verdict(cap) + ' ' + JSON.stringify({ fn: cap.fn, args: cap.arguments, ret: cap.returnValue, status: cap.captureStatus, reason: cap.reason, caller: cap.caller, afterStep: cap.afterStep, steps: cap.foundAfterSteps })); const tally = {}; for (const cap of s.captures) { const v = verdict(cap).split('(')[0]; tally[v] = (tally[v] || 0) + 1; } console.log('VERDICT TALLY ' + JSON.stringify(tally));
    if (s.name.startsWith('D')) for (const r of s.raw) console.log('RAW ' + JSON.stringify(r));
    console.log('groundTruth:', s.groundTruth);
  }
  console.log('\nfull result: ' + OUT);
}

main().catch((e) => { console.error('proto failed:', e); process.exit(1); });
