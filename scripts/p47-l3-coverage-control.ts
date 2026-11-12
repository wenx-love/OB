import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Phase 4.7 L3 coverage CONTROL run. Same page and same Profiler.startPreciseCoverage / takePreciseCoverage calls as scripts/p47-l3-browser-replay.ts, but NO extension and NO debugger.
// Purpose: calibrate the independent execution evidence. In the replay run the probe reported _0x13d0 count=1 although two call sites (A and C) demonstrably ran at load.
// It answers: (1) what the probe reports for the same load-time calls without any extension, (2) whether the probe does see laterB / shadowD when they really run (positive control), (3) whether two direct calls count as 2.
// Raw evidence only; every judgement is made offline. Nothing under src/ is touched and the page files are served byte for byte.
const ROOT = 'D:/Projects/ob-recover';
const PAGES = ROOT + '/test-pages';
const HTML_NAME = 'real-site-l3-same-text.html';
const JS_NAME = 'real-site-l3-same-text.js';
const OUT = ROOT + '/test/acceptance/p47-l3-coverage-control.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9474;
const HTTP = 8784;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-l3-coverage-control-profile';
const PAGE_URL = 'http://127.0.0.1:' + HTTP + '/' + HTML_NAME;
const JS_URL = 'http://127.0.0.1:' + HTTP + '/' + JS_NAME;
const CMD_TIMEOUT_MS = 20000;
const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));
const sha = (b: any): string => createHash('sha256').update(b).digest('hex');

interface Cdp { send(method: string, params?: Record<string, any>, sessionId?: string): Promise<any>; close(): void }
interface Pending { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; method: string }

function connect(wsUrl: string): Promise<Cdp> {
  return new Promise<Cdp>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, Pending>();
    const failAll = (why: string): void => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: MessageEvent) => {
      const m: any = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = (ce: any) => { closeInfo = { code: ce && ce.code, reason: ce && ce.reason, wasClean: ce && ce.wasClean, atIso: new Date().toISOString() }; failAll('ws closed'); };
    ws.onopen = () => resolve({
      send(method: string, params: Record<string, any> = {}, sessionId?: string): Promise<any> {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT_MS + 'ms: ' + method)); }, CMD_TIMEOUT_MS);
          pending.set(i, { resolve: res, reject: rej, timer, method });
          const msg: Record<string, any> = { id: i, method, params };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
        });
      },
      close(): void { ws.close(); },
    });
  });
}

const servedLog: { name: string; sha256: string; bytes: number }[] = [];
let closeInfo: any = null;
const server = createServer((req: any, res: any) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === HTML_NAME || name === JS_NAME) {
    const body: any = readFileSync(PAGES + '/' + name);
    servedLog.push({ name, sha256: sha(body), bytes: body.length });
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('nf');
});

async function main(): Promise<void> {
  const htmlDisk: any = readFileSync(PAGES + '/' + HTML_NAME);
  const jsDisk: any = readFileSync(PAGES + '/' + JS_NAME);
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  let childExit: any = null;
  child.on('exit', (code: any, signal: any) => { childExit = { code, signal, atIso: new Date().toISOString() }; });
  const out: Record<string, any> = {
    schema: 'ob-recover.l3-coverage-control-raw/1',
    note: 'Control run: same page and same Profiler calls as the replay run, NO extension and NO debugger. Raw evidence only, judged offline.',
    isRealSiteSample: false,
    startedAt: new Date().toISOString(),
    pageUrl: PAGE_URL,
    pageFilesOnDisk: { html: { name: HTML_NAME, sha256: sha(htmlDisk), bytes: htmlDisk.length }, js: { name: JS_NAME, sha256: sha(jsDisk), bytes: jsDisk.length } },
    steps: {},
  };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    const b: Cdp = await connect(ver.webSocketDebuggerUrl);
    const created: any = await b.send('Target.createTarget', { url: PAGE_URL });
    await sleep(1500);
    const sid: string = (await b.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })).sessionId;
    await b.send('Page.enable', {}, sid);
    const ev = async (expr: string): Promise<any> => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    // a reload can still show the OLD document for a moment, so readiness also requires a new performance.timeOrigin
    const waitReady = async (oldOrigin: any, maxMs: number): Promise<any> => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        const t: any = await ev('document.title + "|" + performance.timeOrigin');
        if (typeof t === 'string') {
          const parts = t.split('|');
          if (parts[0] === 'l3-same-text-ready' && (oldOrigin === null || Number(parts[1]) !== Number(oldOrigin))) return { ready: true, ms: Date.now() - t0 };
        }
        await sleep(300);
      }
      return { ready: false, ms: Date.now() - t0 };
    };
    const take = async (label: string): Promise<any> => {
      const r: any = await b.send('Profiler.takePreciseCoverage', {}, sid);
      const all: any[] = Array.isArray(r.result) ? r.result : [];
      const mine = all.filter((s: any) => String(s.url) === JS_URL);
      return { label, scriptsInCoverage: all.length, matched: mine.length, functions: mine.flatMap((s: any) => s.functions.map((f: any) => ({ functionName: f.functionName, count: f.ranges && f.ranges[0] ? f.ranges[0].count : null, rangeCount: f.ranges ? f.ranges.length : 0 }))) };
    };
    const step = async (name: string, fn: () => Promise<any>): Promise<void> => {
      let v: any;
      const tStep = Date.now();
      try { v = await fn(); } catch (e: any) { v = { error: String(e && e.message ? e.message : e) }; }
      out.stepTimes = out.stepTimes || {};
      out.stepTimes[name] = { atIso: new Date().toISOString(), elapsedMs: Date.now() - tStep };
      out.steps[name] = v;
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };

    await step('firstLoad', async () => ({ ready: await waitReady(null, 20000) }));
    await step('coverageStart', async () => {
      await b.send('Profiler.enable', {}, sid);
      await b.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true }, sid);
      return { started: true };
    });
    await step('reload', async () => {
      const oldOrigin: any = await ev('performance.timeOrigin');
      await b.send('Page.reload', {}, sid);
      await sleep(1000);
      const ready = await waitReady(oldOrigin, 20000);
      await sleep(1000);
      return { oldOrigin, newOrigin: await ev('performance.timeOrigin'), ready, l3Result: await ev('JSON.stringify(window.__l3Result)'), typeofDecoder: await ev('typeof window._0x13d0') };
    });
    await step('coverageAfterLoad', () => take('after load: only the load-time calls A and C ran'));
    await step('callLaterB', async () => { const value = await ev('window.laterB()'); return { value, coverage: await take('after window.laterB()') }; });
    await step('callShadowD', async () => { const value = await ev('window.shadowD()'); return { value, coverage: await take('after window.shadowD()') }; });
    await step('callDecoderTwice', async () => {
      const v1 = await ev('window._0x13d0(1)');
      const v2 = await ev('window._0x13d0(1)');
      return { values: [v1, v2], coverage: await take('after two direct calls of window._0x13d0(1)') };
    });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    out.diagnostics = { wsClose: closeInfo, chromeExitBeforeKill: childExit };
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ }
    server.close();
    out.served = servedLog;
    out.finishedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log('done fatal=' + (out.fatal ?? 'none') + ' steps=' + Object.keys(out.steps).length + ' served=' + servedLog.length);
}

main().then(() => process.exit(0)).catch((e: any) => { console.error(e); process.exit(1); });
