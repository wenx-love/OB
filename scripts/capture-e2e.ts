import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';
import { CaptureEngine } from '../src/extension/debugger/capture-engine.js';

const ROOT = 'D:/Projects/ob-recover';
const PAGE_URL = pathToFileURL(ROOT + '/test-pages/capture-proto.html').href;
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/chrome-e2e-profile';
const OUT = ROOT + (process.env.ALL ? '/test/acceptance/phase3-engine-e2e-all-result.json' : '/test/acceptance/phase3-engine-e2e-result.json');
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const EXPECTED: Record<string, any> = {
  'decOne|[256]': { type: 'string', value: 'Signature' },
  'decOne|[257]': { type: 'string', value: 'hello' },
  'decOne|[264]': { type: 'string', value: 'beta' },
  'decTwo|[259,"yBNh"]': { type: 'string', value: 'foo:yBNh' },
  'decTwo|[264,"nk"]': { type: 'string', value: 'beta:nk' },
  'decThree|[260,"k","s"]': { type: 'string', value: 'bar|k|s' },
  'decNum|[261]': { type: 'number', value: 10 },
  'decUndef|[262]': { type: 'undefined' },
  'decNull|[263]': { type: 'null', value: null },
  'decNested|[264,"nk"]': { type: 'string', value: 'beta:nk+beta' },
  'decLoop|[265,"abc"]': { type: 'string', value: 'gamma#90' },
  'decThrow|[1]': null,
};

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

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const res: any = { chrome: null, note: 'raw CDP + headless Chrome driving the real discoverDecoders/computeCapturePlan/CaptureEngine modules; NOT the chrome.debugger extension path' };
  try {
    let version: any = null;
    for (let i = 0; i < 60 && !version; i++) {
      try { version = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); }
    }
    if (!version) throw new Error('Chrome remote debugging port not reachable');
    res.chrome = version.Browser;
    const t: any = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
    const c = await connect(t.webSocketDebuggerUrl);

    const methods: Record<string, number> = {};
    const events: any[] = [];
    const engine = new CaptureEngine((m, p) => { methods[m] = (methods[m] || 0) + 1; return c.send(m, p); }, (e) => events.push(e));
    let paused = false;
    let ready: () => void = () => {};
    const readyP = new Promise<void>((r) => { ready = r; });
    const discovery: any[] = [];
    let startResult: any = null;

    c.on('Debugger.paused', (p: any) => { paused = true; void engine.onPaused(p); });
    c.on('Debugger.resumed', () => { paused = false; engine.onResumed(); });
    c.on('Debugger.scriptParsed', (p: any) => {
      if (!p.url.endsWith('capture-proto.js')) return;
      void (async () => {
        const src: string = (await c.send('Debugger.getScriptSource', { scriptId: p.scriptId })).scriptSource;
        const d = discoverDecoders(src, p.scriptId, p.url);
        const targets: any[] = [];
        for (const cand of d.candidates) {
          discovery.push({ name: cand.name, confidence: cand.confidence, calls: cand.callCount });
          if (cand.confidence !== 'high' || !cand.name) continue;
          targets.push({ scriptId: p.scriptId, scriptUrl: p.url, functionName: cand.name, plan: computeCapturePlan(src, cand.location.start) });
        }
        if (process.env.ALL) { for (const f of d.functions) { if (!f.name || f.name === 'runAll' || targets.some((x) => x.functionName === f.name)) continue; targets.push({ scriptId: p.scriptId, scriptUrl: p.url, functionName: f.name, plan: computeCapturePlan(src, f.location.start) }); } }
        startResult = await engine.start(targets);
        ready();
      })().catch((e) => { res.setupError = String(e); ready(); });
    });

    await c.send('Debugger.enable');
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    await c.send('Page.navigate', { url: PAGE_URL });
    await Promise.race([readyP, sleep(10000)]);

    const t0 = Date.now();
    let done = false;
    while (Date.now() - t0 < 30000) {
      if (!paused) {
        const r: any = await c.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
        if (r.result.value === 'done') { done = true; break; }
      }
      await sleep(300);
    }
    await sleep(500);
    res.pageFinished = done;
    res.durationMs = Date.now() - t0;

    try {
      const r: any = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__protoResult)', returnByValue: true });
      res.groundTruth = r.result.value;
    } catch (e) { res.groundTruthError = String(e); }

    res.stats = engine.getStats();
    res.breakpointsBeforeStop = engine.getBreakpointCount();
    await engine.stop();
    res.breakpointsAfterStop = engine.getBreakpointCount();
    res.pausedAfterStop = paused;
    res.cdpMethodsUsedByEngine = methods;
    res.discovery = discovery;
    res.startResult = startResult;

    const rows = engine.getCaptures().map((cap: any) => {
      const key = cap.functionName + '|' + JSON.stringify(cap.arguments.map((a: any) => a.value));
      const exp = EXPECTED[key];
      let v: string;
      if (cap.captureStatus === 'capture-failed') v = exp === null ? 'OK(failed-as-expected)' : 'MISSED';
      else if (exp === undefined || exp === null) v = 'UNEXPECTED';
      else v = JSON.stringify(cap.returnValue) === JSON.stringify(exp) ? 'OK' : 'WRONG';
      return { v, key, status: cap.captureStatus, ret: cap.returnValue, reason: cap.reason, count: cap.count, call: cap.callLocation };
    });
    const seen = new Set(rows.map((r: any) => r.key));
    res.rows = rows;
    res.notCapturedAtAll = Object.keys(EXPECTED).filter((k) => !seen.has(k));
    const tally: Record<string, number> = {};
    for (const r of rows) { const k = r.v.split('(')[0]; tally[k] = (tally[k] || 0) + 1; }
    res.tally = tally;
    res.engineEvents = events.filter((e) => e.kind !== 'capture');

    try { c.close(); await fetch(BASE + '/json/close/' + t.id); } catch { /* ignore */ }
  } catch (e: any) {
    res.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log('Chrome:', res.chrome, res.fatal ? ' FATAL: ' + res.fatal : '', res.setupError ? ' SETUP: ' + res.setupError : '');
  console.log('pageFinished=' + res.pageFinished + ' durationMs=' + res.durationMs + ' pausedAfterStop=' + res.pausedAfterStop);
  console.log('discovery:', JSON.stringify(res.discovery));
  console.log('startResult:', JSON.stringify(res.startResult));
  console.log('stats:', JSON.stringify(res.stats));
  console.log('breakpoints before/after stop:', res.breakpointsBeforeStop, res.breakpointsAfterStop);
  console.log('cdp methods used by engine:', JSON.stringify(res.cdpMethodsUsedByEngine));
  for (const r of res.rows || []) console.log('CAP ' + r.v + ' ' + r.key + ' -> ' + JSON.stringify(r.ret) + ' x' + r.count + (r.reason ? ' reason=' + r.reason : ''));
  console.log('tally:', JSON.stringify(res.tally));
  console.log('expected but not captured at all:', JSON.stringify(res.notCapturedAtAll));
  console.log('engine events (non-capture):', JSON.stringify(res.engineEvents));
  console.log('groundTruth:', res.groundTruth);
  console.log('full result: ' + OUT);
}

main().catch((e) => { console.error('e2e failed:', e); process.exit(1); });
