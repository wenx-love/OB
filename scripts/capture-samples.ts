import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';
import { CaptureEngine } from '../src/extension/debugger/capture-engine.js';

const ROOT = 'D:/Projects/ob-recover';
const SAMPLES = ROOT + '/test/fixtures/real-samples';
const WORK = 'C:/Users/Administrator/TEMP/opencode/sample-run';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/chrome-sample-profile';
const BASE = 'http://127.0.0.1:' + PORT;
const RUN_MS = Number(process.env.RUN_MS || 15000);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function connect(wsUrl: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    const handlers = new Map<string, ((p: any) => void)[]>();
    ws.onmessage = (ev: any) => {
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
      send(method: string, params: any = {}) {
        return new Promise((res, rej) => {
          const i = ++id;
          pending.set(i, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      },
      on(method: string, h: (p: any) => void) {
        if (!handlers.has(method)) handlers.set(method, []);
        handlers.get(method)!.push(h);
      },
      close() { ws.close(); },
    });
  });
}

async function runSample(name: string): Promise<any> {
  const dir = WORK + '/' + name;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  copyFileSync(SAMPLES + '/' + name + '/input.js', dir + '/input.js');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src file: 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:"><title>sample</title></head><body><script src="input.js"></script></body></html>`;
  writeFileSync(dir + '/index.html', html);

  const res: any = { sample: name, note: 'open-source sample (kuizuo/js-deobfuscator example), raw CDP + headless Chrome, isolated: CSP default-src none + Fetch blocks all non-file requests; NOT a third-party site script; NOT the chrome.debugger extension path' };
  const t: any = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
  const c = await connect(t.webSocketDebuggerUrl);
  const urls = new Map<string, string>();
  const logs: any[] = [];
  const st: any = { foreign: 0, foreignLocs: [] as any[], blocked: [] as string[], exceptions: 0, exList: [] as any[], bpLocs: [] as any[], pauseDiag: [] as any[], aborted: false, instrumentationPauses: 0 };
  const engine = new CaptureEngine((m, p) => { const pr = c.send(m, p); if (m === 'Debugger.setBreakpoint') return pr.then((r: any) => { st.bpLocs.push({ req: (p as any).location, actual: r.actualLocation }); return r; }); return pr; }, (ev) => { if (ev.kind !== 'capture') logs.push(ev); });
  let chain: Promise<void> = Promise.resolve();

  const setup = async (scriptId: string, url: string) => {
    const src: string = (await c.send('Debugger.getScriptSource', { scriptId })).scriptSource;
    res.bytes = src.length;
    const t0 = Date.now();
    const d = discoverDecoders(src, scriptId, url);
    res.discoveryMs = Date.now() - t0;
    res.functions = d.functions.length;
    res.candidates = d.candidates.length;
    const high = d.candidates.filter((x) => x.confidence === 'high' && x.name);
    res.highCandidates = high.map((x) => ({ name: x.name, kind: x.kind, params: x.paramCount, staticCalls: x.callCount, arr: x.stringArrayName, b64: x.hasBase64, rc4: x.hasRC4 }));
    const targets = high.map((x) => ({ scriptId, scriptUrl: url, functionName: x.name as string, plan: computeCapturePlan(src, x.location.start) }));
    res.plans = targets.map((tg) => { const lines = src.split('\n'); const e = tg.plan.entry; const line = e ? (lines[e.lineNumber] || '') : ''; return { fn: tg.functionName, entry: tg.plan.entry, returns: tg.plan.returns.slice(0, 3), closing: tg.plan.closing, snippet: e ? line.slice(Math.max(0, e.columnNumber - 30), e.columnNumber + 90) : null }; });
    res.startResult = await engine.start(targets);
  };

  c.on('Debugger.scriptParsed', (p: any) => { urls.set(p.scriptId, p.url); });
  c.on('Debugger.paused', (p: any) => {
    if (p.reason === 'instrumentation') {
      st.instrumentationPauses++;
      const sid = p.data && p.data.scriptId;
      const url = urls.get(sid) || '';
      chain = chain.then(async () => {
        try { if (url.endsWith('/input.js')) await setup(sid, url); } catch (e: any) { res.setupError = String(e && e.message ? e.message : e); }
        await c.send('Debugger.resume').catch(() => {});
      });
      return;
    }
    if (engine.ownsPause(p)) { if (st.pauseDiag.length < 4) { const f = p.callFrames[0]; st.pauseDiag.push({ reason: p.reason, hit: p.hitBreakpoints, fn: f.functionName, loc: f.location, scopes: f.scopeChain.map((s: any) => s.type), depth: p.callFrames.length }); } void engine.onPaused(p); return; }
    st.foreign++;
    if (st.foreignLocs.length < 5) st.foreignLocs.push({ reason: p.reason, hit: p.hitBreakpoints, fn: p.callFrames[0] && p.callFrames[0].functionName, line: p.callFrames[0] && p.callFrames[0].location.lineNumber, col: p.callFrames[0] && p.callFrames[0].location.columnNumber, scriptId: p.callFrames[0] && p.callFrames[0].location.scriptId, depth: p.callFrames.length, scopes: p.callFrames[0] && p.callFrames[0].scopeChain.map((s: any) => s.type), srcHead: (() => { const o: any = { v: 'pending' }; c.send('Debugger.getScriptSource', { scriptId: p.callFrames[0].location.scriptId }).then((r: any) => { o.v = String(r.scriptSource).slice(0, 200); }).catch((e: any) => { o.v = 'ERR ' + (e && e.message ? e.message : e); }); return o; })(), engineHitsSoFar: engine.getStats().hits, stack: p.callFrames.slice(0, 3).map((f: any) => ({ fn: f.functionName, line: f.location.lineNumber, col: f.location.columnNumber })) });
    if (st.foreign > 300) { st.aborted = true; return; }
    c.send('Debugger.resume').catch(() => {});
  });
  c.on('Fetch.requestPaused', (p: any) => {
    if (p.request.url.startsWith('file:')) c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
    else { st.blocked.push(p.request.url.slice(0, 80)); c.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); }
  });
  c.on('Runtime.exceptionThrown', (p: any) => { st.exceptions++; if (st.exList.length < 5) { const d = p.exceptionDetails || {}; st.exList.push({ text: d.text, desc: d.exception && d.exception.description ? String(d.exception.description).slice(0, 300) : null, line: d.lineNumber, col: d.columnNumber, url: d.url }); } });

  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await c.send('Debugger.enable');
  await c.send('Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptExecution' });
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  const t0 = Date.now();
  await c.send('Page.navigate', { url: pathToFileURL(dir + '/index.html').href });
  await sleep(RUN_MS);

  const probe: any = await Promise.race([c.send('Runtime.evaluate', { expression: '1+1', returnByValue: true }).then((r: any) => r.result.value), sleep(3000).then(() => 'timeout')]);
  res.pageResponsive = probe === 2;
  res.runMs = Date.now() - t0;
  res.stats = engine.getStats();
  res.breakpointsBeforeStop = engine.getBreakpointCount();
  await engine.stop();
  res.breakpointsAfterStop = engine.getBreakpointCount();
  res.foreignPauses = st.foreign;
  res.foreignSamples = st.foreignLocs;
  res.antiDebugAborted = st.aborted;
  res.blockedRequests = st.blocked.length;
  res.blockedSamples = st.blocked.slice(0, 5);
  res.pageExceptions = st.exceptions;
  res.exceptionDetails = st.exList;
  res.bpLocs = st.bpLocs;
  res.pauseDiag = st.pauseDiag;
  res.instrumentationPauses = st.instrumentationPauses;
  const caps = engine.getCaptures();
  res.distinctCaptures = caps.length;
  const total = res.stats.success + res.stats.failed;
  res.successRatePerCall = total ? Number((res.stats.success / total).toFixed(4)) : null;
  res.failureReasons = Array.from(new Set(caps.filter((x) => x.captureStatus === 'capture-failed').map((x) => x.reason)));
  const byFn: Record<string, any> = {};
  for (const x of caps) {
    const k = x.functionName;
    byFn[k] = byFn[k] || { distinct: 0, calls: 0, failed: 0 };
    byFn[k].distinct++; byFn[k].calls += x.count; if (x.captureStatus === 'capture-failed') byFn[k].failed += x.count;
  }
  res.byFunction = byFn;
  const byArgs = new Map<string, Set<string>>();
  for (const x of caps) {
    if (x.captureStatus !== 'success') continue;
    const k = x.functionName + '|' + JSON.stringify(x.arguments.map((a) => a.value));
    if (!byArgs.has(k)) byArgs.set(k, new Set());
    byArgs.get(k)!.add(JSON.stringify(x.returnValue));
  }
  const conflicts = Array.from(byArgs.entries()).filter((e) => e[1].size > 1);
  const fin = new Map<string, any>();
  for (const x of caps) {
    if (x.captureStatus !== 'success') continue;
    const k = x.functionName + '|' + JSON.stringify(x.arguments.map((a) => a.value));
    const rv = JSON.stringify(x.returnValue);
    const cur = fin.get(k);
    if (!cur) { fin.set(k, { first: rv, firstSeq: x.firstSeq, last: rv, lastSeq: x.lastSeq, lastFirstSeq: x.firstSeq }); continue; }
    if (x.firstSeq < cur.firstSeq) { cur.first = rv; cur.firstSeq = x.firstSeq; }
    if (x.lastSeq > cur.lastSeq) { cur.last = rv; cur.lastSeq = x.lastSeq; cur.lastFirstSeq = x.firstSeq; }
  }
  const finals = Array.from(fin.values());
  res.tuplesFirstDiffersFromLast = finals.filter((v) => v.first !== v.last).length;
  res.maxSeq = caps.reduce((m, x) => Math.max(m, x.lastSeq), 0);
  res.rotationEndEstimateSeq_heuristic = finals.filter((v) => v.first !== v.last).reduce((m, v) => Math.max(m, v.lastFirstSeq), 0);
  const thr = Number(res.rotationEndEstimateSeq_heuristic);
  const seenVals = new Map<string, Set<string>>();
  let newAfter = 0;
  for (const x of caps.filter((y) => y.captureStatus === 'success').sort((a, b) => a.firstSeq - b.firstSeq)) {
    const k = x.functionName + '|' + JSON.stringify(x.arguments.map((a) => a.value));
    const rv = JSON.stringify(x.returnValue);
    const set = seenVals.get(k);
    if (x.firstSeq > thr && set && !set.has(rv)) newAfter++;
    if (!set) seenVals.set(k, new Set([rv])); else set.add(rv);
  }
  res.newReturnValuesForKnownArgsAfterThreshold = newAfter;
  res.distinctArgTuples = byArgs.size;
  res.argsWithConflictingReturns = conflicts.length;
  res.conflictSamples = conflicts.slice(0, 8).map((e) => ({ key: e[0], returns: Array.from(e[1]) }));
  res.sample40 = caps.map((x) => ({ fn: x.functionName, args: x.arguments.map((a) => a.value !== undefined ? a.value : a.type), ret: x.returnValue ? (x.returnValue.value !== undefined ? x.returnValue.value : x.returnValue.type) : null, status: x.captureStatus, reason: x.reason, count: x.count, seq: [x.firstSeq, x.lastSeq] }));
  res.engineLogs = logs.slice(0, 10);
  try { c.close(); await fetch(BASE + '/json/close/' + t.id); } catch { /* ignore */ }
  writeFileSync(ROOT + '/test/acceptance/phase3-sample-run-' + name + '.json', JSON.stringify(res, null, 2));
  return res;
}

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) throw new Error('pass sample names, e.g. sample-01-obfuscator');
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  try {
    let version: any = null;
    for (let i = 0; i < 60 && !version; i++) {
      try { version = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); }
    }
    if (!version) throw new Error('Chrome remote debugging port not reachable');
    console.log('Chrome:', version.Browser);
    for (const n of names) {
      const r = await runSample(n);
      const brief = { ...r, sample40: undefined, byFunction: undefined, conflictSamples: undefined, plans: undefined, bpLocs: undefined, pauseDiag: undefined };
      console.log('=== ' + n); console.log(JSON.stringify(brief));
      console.log('byFunction:', JSON.stringify(r.byFunction));
      console.log('DIAG', JSON.stringify({ plans: r.plans, bpLocs: r.bpLocs, pauseDiag: r.pauseDiag }));
      for (const x of r.sample40.slice(0, 12)) console.log('CAP ' + JSON.stringify(x));
    }
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('sample run failed:', e); process.exit(1); });
