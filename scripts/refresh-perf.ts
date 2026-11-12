import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { parseCode } from '../src/core/parser.js';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9420;
const HTTP = 8767;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/refresh-perf-profile';
const BASE = 'http://127.0.0.1:' + PORT;
const FILLERS = Number(process.env.FILLERS || 3);
const TRACE = (process.env.TRACE || '').split(',');
const KB = Number(process.env.KB || 100);
const CALLS = Number(process.env.CALLS || 200);
const TAG = process.env.TAG || 'before';
const ONLY = (process.env.ONLY || 'B0,B0o,B1,S2').split(',');
const OUT = ROOT + '/test/acceptance/refresh-perf-' + TAG + '-' + ONLY.join('_') + '.json';
const NL = String.fromCharCode(10);
const URLX = 'http://127.0.0.1:' + HTTP + '/refresh-load.html?fillers=' + FILLERS + '&kb=' + KB + '&calls=' + CALLS;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clone = (o: any) => JSON.parse(JSON.stringify(o));

function filler(kb: number, n: number): string {
  let s = '';
  let i = 0;
  while (s.length < kb * 1024) {
    s += 'function f' + n + '_' + i + '(a, b) { var t = a + b * ' + i + '; if (t > ' + i + ') { return t - 1; } return t + 1; }' + NL;
    i++;
  }
  return s;
}

function decoder(calls: number): string {
  const arr: string[] = [];
  for (let i = 0; i < 10; i++) arr.push(`'a${i}'`);
  return [
    'var _arr = [' + arr.join(', ') + '];',
    'function userHook() {',
    '  var x = 1;',
    '  return x;',
    '}',
    'function decOne(i) {',
    '  i = i - 0x100;',
    '  return _arr[i];',
    '}',
    'var __out = [];',
    'for (var __k = 0; __k < ' + calls + '; __k++) { __out.push(decOne(0x100 + (__k % 10))); }',
    `if (location.hash === '#user') { userHook(); }`,
    'window.__out = __out;',
    `document.title = 'done';`,
    '',
  ].join(NL);
}

const server = createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  const q = (k: string, d: number) => Number(u.searchParams.get(k) || d);
  const send = (type: string, body: string) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (u.pathname === '/refresh-load.html') {
    let h = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>refresh-load</title></head><body>`;
    for (let i = 0; i < q('fillers', 3); i++) h += `<script src='/filler.js?kb=` + q('kb', 100) + `&n=` + i + `'></script>`;
    h += `<script src='/refresh-decoder.js?calls=` + q('calls', 200) + `'></script></body></html>`;
    send('text/html; charset=utf-8', h);
    return;
  }
  if (u.pathname === '/filler.js') { send('text/javascript', filler(q('kb', 100), q('n', 0))); return; }
  if (u.pathname === '/refresh-decoder.js') { send('text/javascript', decoder(q('calls', 200))); return; }
  res.writeHead(404);
  res.end('nf');
});

function connect(wsUrl: string, onEvent: (m: any) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(ev.data);
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
      else if (m.method) onEvent(m);
    };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onopen = () => resolve({
      send(method: string, params: any = {}, sessionId?: string) {
        return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); const msg: any = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); });
      },
      close() { ws.close(); },
    });
  });
}

// ---- 扩展 service worker 内的测量代码（只读监听 + 包装 sendCommand，不改扩展源码）----
const SW_INSTALL = (tab: number) => `(() => {
  const m = { ev: [], cmd: [], lag: [], inflight: 0, msgs: {}, bytes: {}, epoch: 0, scriptEpoch: {}, scriptUrl: {}, autoStop: false, stopped: 0, wrapOk: false };
  globalThis.__m = m;
  const TAB = ${tab};
  chrome.debugger.onEvent.addListener((s, method, params) => {
    if (s.tabId !== TAB) return;
    const t = performance.now();
    if (method === 'Runtime.executionContextsCleared') m.epoch++;
    if (method === 'Debugger.scriptParsed') { m.scriptEpoch[params.scriptId] = m.epoch; m.scriptUrl[params.scriptId] = params.url; }
    const e = { t: t, method: method, epoch: m.epoch, sid: method === 'Debugger.scriptParsed' ? params.scriptId : (method === 'Debugger.paused' && params.data ? params.data.scriptId : undefined), url: method === 'Debugger.scriptParsed' ? params.url : undefined };
    if (method === 'Debugger.paused' && params.reason === 'instrumentation') m.instrOpen = t;
    if (method === 'Debugger.paused') { e.reason = params.reason; e.hit = !!(params.hitBreakpoints && params.hitBreakpoints.length); }
    m.ev.push(e);
    if (method === 'Debugger.paused' && params.reason === 'instrumentation' && m.autoStop) {
      const sid = params.data && params.data.scriptId;
      if (sid && String(m.scriptUrl[sid] || '').indexOf('refresh-decoder') >= 0) {
        m.autoStop = false;
        m.stopped++;
        m.ev.push({ t: performance.now(), method: 'HARNESS capture-stop-called', epoch: m.epoch });
        globalThis.__obRecoverTest.handlePanelCommand({ type: 'capture-stop', tabId: TAB }, globalThis.__port).then(() => m.ev.push({ t: performance.now(), method: 'HARNESS capture-stop-resolved', epoch: m.epoch }));
      }
    }
  });
  let last = performance.now();
  setInterval(() => { const n = performance.now(); const d = n - last - 50; if (d > 20) m.lag.push({ t: n, d: d }); last = n; }, 50);
  setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); }, 20000);
  const rawSend = chrome.debugger.sendCommand;
  const wrapper = (target, method, params, cb) => {
    const t = performance.now();
    let sid = null;
    if (method === 'Debugger.setBreakpoint' && params && params.location) sid = params.location.scriptId;
    else if (method === 'Debugger.getScriptSource' && params) sid = params.scriptId;
    const stale = sid !== null && m.scriptEpoch[sid] !== undefined && m.scriptEpoch[sid] !== m.epoch;
    const unknown = sid !== null && m.scriptEpoch[sid] === undefined;
    const ins = method === 'Debugger.resume' && !!m.instrOpen;
    if (ins) m.instrOpen = 0;
    m.inflight++;
    return rawSend.call(chrome.debugger, target, method, params, (r) => {
      m.inflight--;
      const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
      m.cmd.push({ t: t, d: performance.now() - t, method: method, err: err || null, stale: stale, unknown: unknown, sid: sid, se: sid !== null ? m.scriptEpoch[sid] : undefined, ep: m.epoch, ins: ins });
      if (cb) cb(r);
    });
  };
  try { chrome.debugger.sendCommand = wrapper; } catch (e) { m.wrapErr = String(e); }
  m.wrapOk = chrome.debugger.sendCommand === wrapper;
  globalThis.__port = { postMessage: (x) => { const k = x && x.event ? x.event.kind : ((x && x.type) || '?'); m.msgs[k] = (m.msgs[k] || 0) + 1; if (k === 'capture-state' || k === 'script-discovered') m.bytes[k] = (m.bytes[k] || 0) + JSON.stringify(x).length; } };
  globalThis.__obRecoverTest.registerPort(TAB, globalThis.__port);
  return { ok: true, wrapOk: m.wrapOk, wrapErr: m.wrapErr || null };
})()`;

const MARK = () => `(() => { const m = globalThis.__m; if (!m) return { missing: true }; m.msgs = {}; m.bytes = {}; return { i: m.ev.length, c: m.cmd.length, l: m.lag.length }; })()`;

const SUMM = (i: number, c: number, l: number) => `((i0, c0, l0) => {
  const m = globalThis.__m;
  if (!m) return { missing: true };
  const ev = m.ev.slice(i0), cmd = m.cmd.slice(c0), lag = m.lag.slice(l0);
  const byMethod = {};
  for (const e of ev) byMethod[e.method] = (byMethod[e.method] || 0) + 1;
  const pausedBy = {};
  for (const e of ev) if (e.method === 'Debugger.paused') { const k = e.reason + (e.hit ? '/bp' : ''); pausedBy[k] = (pausedBy[k] || 0) + 1; }
  const durs = { instrumentation: [], breakpoint: [], other: [] };
  let open = null;
  for (const e of ev) {
    if (e.method === 'Debugger.paused') open = e;
    else if (e.method === 'Debugger.resumed' && open) { const k = open.reason === 'instrumentation' ? 'instrumentation' : (open.hit ? 'breakpoint' : 'other'); durs[k].push(e.t - open.t); open = null; }
  }
  const f = (v) => Math.round(v * 100) / 100;
  const st = (a) => { if (!a.length) return { n: 0 }; const s = a.slice().sort((x, y) => x - y); const sum = a.reduce((x, y) => x + y, 0); return { n: a.length, mean: f(sum / a.length), p50: f(s[Math.floor(s.length * 0.5)]), p95: f(s[Math.floor(s.length * 0.95)]), max: f(s[s.length - 1]), sum: f(sum) }; };
  const cmdBy = {};
  for (const c of cmd) { const o = cmdBy[c.method] || (cmdBy[c.method] = { n: 0, sum: 0, max: 0, err: 0, stale: 0, unknown: 0 }); o.n++; o.sum += c.d; o.max = Math.max(o.max, c.d); if (c.err) o.err++; if (c.stale) o.stale++; if (c.unknown) o.unknown++; }
  for (const k in cmdBy) { cmdBy[k].mean = f(cmdBy[k].sum / cmdBy[k].n); cmdBy[k].sum = f(cmdBy[k].sum); cmdBy[k].max = f(cmdBy[k].max); }
  const errs = {};
  for (const c of cmd) if (c.err) { const k = c.method + ': ' + String(c.err).slice(0, 80); errs[k] = (errs[k] || 0) + 1; }
  return { events: ev.length, byMethod: byMethod, pausedBy: pausedBy, pauseMs: { instrumentation: st(durs.instrumentation), breakpoint: st(durs.breakpoint), other: st(durs.other) }, openPause: !!open, cmd: cmdBy, cmdErrors: errs, staleCmds: cmd.filter((c) => c.stale).length, unknownCmds: cmd.filter((c) => c.unknown).length, swLag: { n: lag.length, max: f(lag.reduce((a, b) => Math.max(a, b.d), 0)), sum: f(lag.reduce((a, b) => a + b.d, 0)) }, inflight: m.inflight, msgs: Object.assign({}, m.msgs), bytes: Object.assign({}, m.bytes) };
})(${i}, ${c}, ${l})`;

const TL = (i: number, c: number) => `((i0, c0) => {
  const m = globalThis.__m;
  const rows = [];
  for (const e of m.ev.slice(i0)) {
    if (e.method === 'Debugger.resumed') continue;
    if (e.method === 'Debugger.paused' && e.reason !== 'instrumentation') continue;
    rows.push({ t: e.t, s: 'EV ' + e.method + (e.reason ? ' ' + e.reason : '') + (e.sid ? ' sid=' + e.sid : '') + (e.url ? ' ' + String(e.url).split('/').pop() : '') + ' ep=' + e.epoch });
  }
  for (const k of m.cmd.slice(c0)) {
    if (k.method === 'Debugger.stepOver' || k.method === 'Runtime.getProperties') continue;
    if (k.method === 'Debugger.resume' && !k.ins && !k.err) continue;
    rows.push({ t: k.t, s: 'CMD ' + k.method + (k.ins ? '(instr)' : '') + ' ' + k.d.toFixed(1) + 'ms' + (k.sid ? ' sid=' + k.sid + ' scriptEp=' + k.se : '') + ' epDone=' + k.ep + (k.err ? ' ERR=' + String(k.err).slice(0, 70) : '') });
  }
  rows.sort((a, b) => a.t - b.t);
  const base = rows.length ? rows[0].t : 0;
  return rows.slice(0, 150).map((r) => '+' + Math.round(r.t - base) + 'ms ' + r.s);
})(${i}, ${c})`;

let dSid = '';
let userHandler: (m: any) => void = () => {};
const obs: any = { paused: 0, resumed: 0, scriptParsed: 0, byReason: {} };
function onEvent(m: any) {
  if (!dSid || m.sessionId !== dSid) return;
  if (m.method === 'Debugger.paused') {
    obs.paused++;
    const p = m.params || {};
    const k = p.reason + (p.hitBreakpoints && p.hitBreakpoints.length ? '/bp' : '');
    obs.byReason[k] = (obs.byReason[k] || 0) + 1;
    userHandler(m);
  } else if (m.method === 'Debugger.resumed') {
    obs.resumed++;
    userHandler(m);
  } else if (m.method === 'Debugger.scriptParsed') {
    obs.scriptParsed++;
  }
}
function obsDiff(a: any, b: any) {
  const r: any = { paused: b.paused - a.paused, resumed: b.resumed - a.resumed, scriptParsed: b.scriptParsed - a.scriptParsed, byReason: {} };
  for (const k of Object.keys(b.byReason)) { const d = b.byReason[k] - (a.byReason[k] || 0); if (d) r.byReason[k] = d; }
  return r;
}
const slim = (s: any) => (s && !s.error && !s.missing ? { events: s.events, pausedBy: s.pausedBy, pauseMs: s.pauseMs, cmd: Object.fromEntries(Object.entries(s.cmd).map(([k, v]: any) => [k, v.n])), cmdErrors: s.cmdErrors, stale: s.staleCmds, swLag: s.swLag, openPause: s.openPause, inflight: s.inflight } : s);

async function main() {
  const out: any = { tag: TAG, only: ONLY, params: { FILLERS, KB, CALLS }, scenarios: {} };
  let tab = 0;
  let b: any = null;
  let pgSid = '';
  let swSid = '';
  let pageTargetId = '';
  try {
    const fsrc = filler(KB, 0);
    const dsrc = decoder(CALLS);
    let t = performance.now();
    parseCode(fsrc);
    const pf = performance.now() - t;
    t = performance.now();
    const df = discoverDecoders(fsrc);
    const tf = performance.now() - t;
    t = performance.now();
    const dd = discoverDecoders(dsrc);
    const td = performance.now() - t;
    out.analysisNode = { fillerBytes: fsrc.length, parseMs: Math.round(pf), discoverMs: Math.round(tf), fillerFunctions: df.functions.length, fillerCandidates: df.candidates.length, decoderBytes: dsrc.length, decoderDiscoverMs: Math.round(td), decoderCandidates: dd.candidates.map((c) => c.name + ':' + c.confidence) };
  } catch (e: any) {
    out.analysisNodeError = String(e);
  }
  console.log('analysisNode', JSON.stringify(out.analysisNode || out.analysisNodeError));

  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    b = await connect(ver.webSocketDebuggerUrl, onEvent);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const loaded: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    await sleep(1500);
    const created: any = await b.send('Target.createTarget', { url: 'about:blank' });
    pageTargetId = created.targetId;
    await sleep(500);
    const tg: any = await b.send('Target.getTargets');
    const sw = tg.targetInfos.find((x: any) => x.type === 'service_worker' && String(x.url).includes(loaded.id));
    swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
    pgSid = (await b.send('Target.attachToTarget', { targetId: pageTargetId, flatten: true })).sessionId;
    await b.send('Page.enable', {}, pgSid);

    const swEval = async (expr: string) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, swSid);
      if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' :: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
      return r.result.value;
    };
    const pgEval = async (expr: string, ms = 8000) => {
      try {
        const r: any = await Promise.race([b.send('Runtime.evaluate', { expression: expr, returnByValue: true }, pgSid), sleep(ms).then(() => ({ timeout: true }))]);
        if (r.timeout) return '__timeout__';
        return r.result ? r.result.value : null;
      } catch { return null; }
    };
    const cmd = (o: any) => swEval('globalThis.__obRecoverTest.handlePanelCommand(' + JSON.stringify(o) + ', globalThis.__port).then(() => 1)');
    const ST = () => `(() => { const s = globalThis.__obRecoverTest.getCaptureState(${tab}); if (!s) return null; return { active: s.active, bps: s.breakpoints, stats: s.stats, captures: s.captures.length, unstable: s.stability.filter((x) => !x.stable).length }; })()`;

    const tabs: any = await swEval('new Promise((resolve) => chrome.tabs.query({}, (t) => resolve(t.map((x) => x.id))))');
    tab = tabs[tabs.length - 1];
    out.tabId = tab;
    out.install = await swEval(SW_INSTALL(tab));
    console.log('install', JSON.stringify(out.install));

    const nav = () => b.send('Page.navigate', { url: URLX }, pgSid);
    const reload = () => b.send('Page.reload', {}, pgSid);

    const load = async (label: string, navigate: () => Promise<any>, timeoutMs = 90000) => {
      const old = String(await pgEval('String(performance.timeOrigin)', 3000));
      const t0 = performance.now();
      await navigate();
      let done = false;
      let maxLat = 0;
      let probes = 0;
      const slowP: number[] = [];
      while (performance.now() - t0 < timeoutMs) {
        const s = performance.now();
        const v = await pgEval(`document.title === 'done' ? String(performance.timeOrigin) : 'no'`);
        const lat = performance.now() - s;
        probes++;
        if (v !== null) { maxLat = Math.max(maxLat, lat); if (lat > 500) slowP.push(Math.round(lat)); }
        if (v !== null && v !== 'no' && v !== '__timeout__' && v !== old) { done = true; break; }
        await sleep(40);
      }
      return { label, done, ms: done ? Math.round(performance.now() - t0) : null, probes, maxProbeLatencyMs: Math.round(maxLat), slowProbeCount: slowP.length, slowProbes: slowP.slice(0, 8) };
    };

    const ensureObserver = async () => {
      if (dSid) return;
      dSid = (await b.send('Target.attachToTarget', { targetId: pageTargetId, flatten: true })).sessionId;
      await b.send('Debugger.enable', {}, dSid);
      await b.send('Runtime.enable', {}, dSid);
    };
    const ensureConnected = async () => {
      const s: any = await swEval('globalThis.__obRecoverTest.getStatus(' + tab + ')');
      if (s !== 'connected') await cmd({ type: 'debugger-connect', tabId: tab });
      return swEval('globalThis.__obRecoverTest.getStatus(' + tab + ')');
    };
    const restartCapture = async () => {
      await cmd({ type: 'capture-stop', tabId: tab });
      await sleep(300);
      await cmd({ type: 'capture-start', tabId: tab, targets: [], autoCaptureMinConfidence: 'high' });
    };

    const scenario = async (name: string, fn: () => Promise<any>) => {
      if (!ONLY.includes(name)) return;
      let status: any = null;
      if (name !== 'B0') await ensureObserver();
      if (name !== 'B0' && name !== 'B0o') status = await ensureConnected();
      const mk: any = await swEval(MARK());
      const o0 = clone(obs);
      const t0 = performance.now();
      let res: any;
      try { res = await fn(); } catch (e: any) { res = { error: String(e && e.message ? e.message : e) }; }
      await sleep(1500);
      const sum: any = await swEval(SUMM(mk.i, mk.c, mk.l));
      const eng = await swEval(ST());
      const tl: any = TRACE.includes(name) ? await swEval(TL(mk.i, mk.c)) : undefined;
      const rec = { timeline: tl, status, result: res, wallMs: Math.round(performance.now() - t0), observer: obsDiff(o0, clone(obs)), sw: sum, engine: eng };
      out.scenarios[name] = rec;
      writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log('--- ' + name + ' ' + JSON.stringify(rec));
      if (Array.isArray(tl)) console.log('TIMELINE ' + name + NL + tl.join(NL));
    };

    const threeLoads = async () => [await load('nav', nav), await load('reload-1', reload), await load('reload-2', reload)];

    await scenario('B0', threeLoads);
    await scenario('B0o', threeLoads);
    await scenario('B1', threeLoads);

    await scenario('S2', async () => {
      await restartCapture();
      const r1 = await load('load-with-capture', nav);
      await sleep(1500);
      const mid = await swEval(ST());
      const r2 = await load('refresh-after-capture-ran', reload);
      return { r1, mid, r2 };
    });

    await scenario('S3', async () => {
      await restartCapture();
      const r = await load('start-then-reload-after-150ms', async () => { await nav(); await sleep(150); await reload(); });
      return { r, engine: await swEval(ST()) };
    });

    await scenario('S4', async () => {
      await restartCapture();
      const recs: any[] = [];
      let userBp = '';
      userHandler = (m: any) => {
        if (m.method === 'Debugger.paused') {
          const hb = (m.params && m.params.hitBreakpoints) || [];
          if (hb.length && hb.indexOf(userBp) >= 0) recs.push({ ev: 'user-pause', t: performance.now() });
        } else if (m.method === 'Debugger.resumed') {
          recs.push({ ev: 'resumed', t: performance.now() });
        }
      };
      const bp: any = await b.send('Debugger.setBreakpointByUrl', { lineNumber: 2, urlRegex: 'refresh-decoder[.]js' }, dSid);
      userBp = bp.breakpointId;
      const waitUser = async (n: number, ms: number) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          if (recs.filter((r) => r.ev === 'user-pause').length >= n) return Math.round(performance.now() - t0);
          await sleep(50);
        }
        return null;
      };
      const res: any = {};
      await b.send('Page.navigate', { url: URLX + '&u=1#user' }, pgSid);
      res.msToUserPause1 = await waitUser(1, 120000);
      if (res.msToUserPause1 !== null) {
        await sleep(1500);
        const firstIdx = recs.findIndex((r) => r.ev === 'user-pause');
        res.resumedByAnyoneWithin1500ms = recs.slice(firstIdx + 1).some((r) => r.ev === 'resumed');
        res.pageProbeWhilePaused = await pgEval('1+1', 1500);
        res.engineDuringUserPause = await swEval(ST());
        await b.send('Page.reload', {}, pgSid);
        res.msToUserPause2 = await waitUser(2, 120000);
        res.userBpSurvivedReload = res.msToUserPause2 !== null;
        await b.send('Debugger.resume', {}, dSid);
        let done = false;
        const t1 = performance.now();
        while (performance.now() - t1 < 90000) {
          const v = await pgEval('document.title', 3000);
          if (v === 'done') { done = true; break; }
          await sleep(100);
        }
        res.finalDone = done;
      }
      res.userPauseCount = recs.filter((r) => r.ev === 'user-pause').length;
      try { await b.send('Debugger.removeBreakpoint', { breakpointId: userBp }, dSid); } catch { /* ignore */ }
      userHandler = () => {};
      return res;
    });

    await scenario('S5', async () => {
      await restartCapture();
      const r1 = await load('capture-active-load', nav);
      await sleep(800);
      const tStop = performance.now();
      await cmd({ type: 'capture-stop', tabId: tab });
      const stopMs = Math.round(performance.now() - tStop);
      const stAfterStop = await swEval(ST());
      const mk2: any = await swEval(MARK());
      const r2 = await load('reload-after-stop', reload);
      await sleep(1000);
      const sw2 = await swEval(SUMM(mk2.i, mk2.c, mk2.l));
      return { r1, stopMs, stAfterStop, r2, afterStopReload: slim(sw2) };
    });

    await scenario('S5b', async () => {
      await restartCapture();
      const r1 = await load('capture-active-load', nav);
      await sleep(500);
      const tStop = performance.now();
      const stopP = cmd({ type: 'capture-stop', tabId: tab }).then(() => Math.round(performance.now() - tStop));
      const r2 = await load('reload-during-stop', reload);
      const stopMs = await stopP;
      return { r1, stopMs, r2, engine: await swEval(ST()) };
    });

    await scenario('S6', async () => {
      await restartCapture();
      const r0 = await load('load', nav);
      const r = await load('double-reload-300ms-apart', async () => { await reload(); await sleep(300); await reload(); });
      return { r0, r, engine: await swEval(ST()) };
    });

    await scenario('S7', async () => {
      await restartCapture();
      const r1 = await load('load-1-capturing', nav);
      const sA = await swEval(ST());
      await cmd({ type: 'capture-stop', tabId: tab });
      const r2 = await load('load-2-stopped', reload);
      const sB = await swEval(ST());
      await cmd({ type: 'capture-start', tabId: tab, targets: [], autoCaptureMinConfidence: 'high' });
      const r3 = await load('load-3-restarted', reload);
      const sC = await swEval(ST());
      return { r1, sA, r2, sB, r3, sC };
    });

    await scenario('S8', async () => {
      await restartCapture();
      const before = await swEval(ST());
      await swEval('globalThis.__m.autoStop = true; 1');
      const r1 = await load('load-with-stop-fired-at-decoder-instrumentation', nav);
      await sleep(1000);
      const afterStop = await swEval(ST());
      const stoppedFired = await swEval('globalThis.__m.stopped');
      const mk2: any = await swEval(MARK());
      const r2 = await load('reload-after-supposed-stop', reload);
      await sleep(1000);
      const sw2 = await swEval(SUMM(mk2.i, mk2.c, mk2.l));
      return { before, stoppedFired, afterStopEngine: afterStop, r1, r2, afterSupposedStop: slim(sw2) };
    });

    try { await cmd({ type: 'capture-stop', tabId: tab }); await cmd({ type: 'debugger-disconnect', tabId: tab }); } catch { /* ignore */ }
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
    console.log('FATAL', out.fatal);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log('result file: ' + OUT);
}

process.on('unhandledRejection', (e: any) => { console.log('unhandledRejection', e && e.message ? e.message : String(e)); });
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
