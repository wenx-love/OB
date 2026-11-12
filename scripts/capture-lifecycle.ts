import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';
import { CaptureEngine } from '../src/extension/debugger/capture-engine.js';

const ROOT = 'D:/Projects/ob-recover';
const PAGE = pathToFileURL(ROOT + '/test-pages/capture-life.html').href;
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/chrome-life-profile';
const OUT = ROOT + '/test/acceptance/phase3-lifecycle-e2e-result.json';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Check { name: string; pass: boolean; detail?: unknown }

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

async function until(f: () => boolean, ms: number): Promise<boolean> {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (f()) return true;
    await sleep(50);
  }
  return false;
}

async function runScenario(name: string, hash: string, withUserBp: boolean, body: (x: any) => Promise<Check[]>): Promise<any> {
  const out: any = { name, checks: [] as Check[] };
  let tabId = '';
  let c: any = null;
  try {
    const t: any = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
    tabId = t.id;
    c = await connect(t.webSocketDebuggerUrl);
    const events: any[] = [];
    const engine = new CaptureEngine((m, p) => c.send(m, p), (e) => events.push(e));
    const state: any = { paused: false, foreign: [] as any[], startedOnce: false, userBpId: null, armed: false, resets: 0, pausesAfterReset: 0, pausesAfterStop: 0, stopped: false, ownPauses: 0, startResult: null, nav: [] as string[] };
    let ready: () => void = () => {};
    const readyP = new Promise<void>((r) => { ready = r; });

    c.on('Debugger.paused', (p: any) => {
      state.paused = true;
      if (state.stopped) state.pausesAfterStop++;
      if (state.resets > 0) state.pausesAfterReset++;
      if (engine.ownsPause(p)) { state.ownPauses++; void engine.onPaused(p); }
      else state.foreign.push({ hit: p.hitBreakpoints, reason: p.reason, fn: p.callFrames[0] && p.callFrames[0].functionName });
    });
    c.on('Debugger.resumed', () => { state.paused = false; engine.onResumed(); });
    c.on('Runtime.executionContextsCleared', () => {
      if (!state.armed) return;
      state.resets++;
      engine.reset('page navigated or reloaded');
    });
    for (const evName of ['Debugger.globalObjectCleared', 'Runtime.executionContextsCleared', 'Page.frameNavigated']) {
      c.on(evName, () => { if (state.armed) state.nav.push(evName); });
    }
    c.on('Debugger.scriptParsed', (p: any) => {
      if (!p.url.endsWith('capture-life.js') || state.startedOnce) return;
      state.startedOnce = true;
      void (async () => {
        const src: string = (await c.send('Debugger.getScriptSource', { scriptId: p.scriptId })).scriptSource;
        const d = discoverDecoders(src, p.scriptId, p.url);
        const decA = d.functions.find((f) => f.name === 'decA');
        const userFn = d.functions.find((f) => f.name === 'userFn');
        if (withUserBp && userFn) {
          const plan = computeCapturePlan(src, userFn.location.start);
          const r = await c.send('Debugger.setBreakpoint', { location: { scriptId: p.scriptId, lineNumber: plan.entry!.lineNumber, columnNumber: plan.entry!.columnNumber } });
          state.userBpId = r.breakpointId;
        }
        const targets = decA ? [{ scriptId: p.scriptId, scriptUrl: p.url, functionName: 'decA', plan: computeCapturePlan(src, decA.location.start) }] : [];
        state.startResult = await engine.start(targets);
        ready();
      })().catch((e) => { out.setupError = String(e); ready(); });
    });

    const evalPage = async (expr: string): Promise<any> => {
      const r: any = await Promise.race([c.send('Runtime.evaluate', { expression: expr, returnByValue: true }), sleep(3000).then(() => ({ result: { value: '__timeout__' } }))]);
      return r.result.value;
    };
    const waitDone = async (ms: number): Promise<boolean> => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (!state.paused) {
          try { if ((await evalPage('document.title')) === 'done') return true; } catch { /* navigation in progress */ }
        }
        await sleep(200);
      }
      return false;
    };

    await c.send('Debugger.enable');
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    await c.send('Page.navigate', { url: PAGE + hash });
    await Promise.race([readyP, sleep(10000)]);
    state.armed = true;
    out.startResult = state.startResult;

    out.checks = await body({ c, engine, state, evalPage, waitDone, events });
    out.foreign = state.foreign;
    out.nav = state.nav;
    out.finalStats = engine.getStats();
    out.captureCount = engine.getCaptures().length;
    out.engineEvents = events.filter((e) => e.kind !== 'capture');
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { if (c) c.close(); if (tabId) await fetch(BASE + '/json/close/' + tabId); } catch { /* ignore */ }
  }
  return out;
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const result: any = { chrome: null, note: 'raw CDP + headless Chrome with the real CaptureEngine; targets chosen manually (lifecycle test, not discovery); NOT the chrome.debugger extension path', scenarios: [] };
  try {
    let version: any = null;
    for (let i = 0; i < 60 && !version; i++) {
      try { version = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); }
    }
    if (!version) throw new Error('Chrome remote debugging port not reachable');
    result.chrome = version.Browser;

    result.scenarios.push(await runScenario('S1 manual stop mid-run', '', false, async (x) => {
      const reached = await until(() => x.engine.getStats().hits >= 10, 15000);
      const hitsAtStop = x.engine.getStats().hits;
      await x.engine.stop();
      x.state.stopped = true;
      const done = await x.waitDone(20000);
      const hitsFinal = x.engine.getStats().hits;
      return [
        { name: 'capture reached 10 hits before stop', pass: reached, detail: hitsAtStop },
        { name: 'page finished after stop', pass: done },
        { name: 'page ran all 100 iterations', pass: (await x.evalPage('window.__count')) === 100 },
        { name: 'page is not left paused', pass: !x.state.paused },
        { name: 'engine breakpoints cleared', pass: x.engine.getBreakpointCount() === 0 },
        { name: 'no pauses after stop', pass: x.state.pausesAfterStop === 0, detail: x.state.pausesAfterStop },
        { name: 'no new hits after stop (<=2 in flight)', pass: hitsFinal - hitsAtStop <= 2, detail: { hitsAtStop, hitsFinal } },
        { name: 'captures kept', pass: x.engine.getCaptures().length > 0 },
      ];
    }));

    result.scenarios.push(await runScenario('S2 page refresh while capturing', '', false, async (x) => {
      const reached = await until(() => x.engine.getStats().hits >= 5, 15000);
      const capsBefore = x.engine.getCaptures().length;
      await x.c.send('Page.reload');
      const cleared = await until(() => x.state.resets >= 1, 10000);
      let done = false; for (let i = 0; i < 100 && !done; i++) { try { done = (await x.evalPage('document.title')) === 'done'; } catch { /* navigating */ } if (!done) await sleep(250); }
      return [
        { name: 'capture active before reload', pass: reached },
        { name: 'globalObjectCleared observed and engine reset', pass: cleared },
        { name: 'engine inactive after reset', pass: !x.engine.isActive() },
        { name: 'engine breakpoints cleared locally', pass: x.engine.getBreakpointCount() === 0 },
        { name: 'reloaded page finished', pass: done },
        { name: 'reloaded page not left paused (harness flag)', pass: !x.state.paused },
        { name: 'page responsive after reload (Runtime.evaluate answers)', pass: (await x.evalPage('1+1')) === 2 },
        { name: 'no pauses after reset (old breakpoints did not survive the reload)', pass: x.state.resets >= 1 && x.state.pausesAfterReset === 0, detail: x.state.pausesAfterReset },
        { name: 'captures from before reload kept', pass: x.engine.getCaptures().length === capsBefore && capsBefore > 0, detail: capsBefore },
      ];
    }));

    result.scenarios.push(await runScenario('S3 user debugger statement and user breakpoint', '#dbg', true, async (x) => {
      const gotForeign = await until(() => x.state.foreign.length >= 1, 15000);
      const first = x.state.foreign[0];
      await sleep(9500);
      const stillPaused = x.state.paused;
      const hitsBefore = x.engine.getStats().hits;
      await x.c.send('Debugger.resume');
      const progressed = await until(() => x.engine.getStats().hits >= hitsBefore + 5, 15000);
      await x.engine.stop();
      const userBpSurvivedStop = await until(() => x.state.foreign.length >= 2, 20000);
      const second = x.state.foreign[1];
      await x.c.send('Debugger.resume');
      const done = await x.waitDone(20000);
      return [
        { name: 'user debugger statement reported as foreign pause', pass: gotForeign, detail: first },
        { name: 'user pause NOT auto-resumed (held >8s watchdog window)', pass: stillPaused },
        { name: 'engine forced no resume', pass: x.engine.getStats().forcedResumes === 0 },
        { name: 'capture continued after user resumed', pass: progressed },
        { name: 'user breakpoint survived engine.stop()', pass: userBpSurvivedStop && !!x.state.userBpId && !!second && (second.hit || []).includes(x.state.userBpId), detail: second },
        { name: 'page finished after user resumed', pass: done },
      ];
    }));
  } catch (e: any) {
    result.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('Chrome:', result.chrome, result.fatal ? ' FATAL: ' + result.fatal : '');
  for (const s of result.scenarios) {
    console.log('\n=== ' + s.name + (s.fatal ? ' FATAL: ' + s.fatal : '') + (s.setupError ? ' SETUP: ' + s.setupError : '') + ' ===');
    console.log('startResult:', JSON.stringify(s.startResult), 'stats:', JSON.stringify(s.finalStats), 'captures:', s.captureCount);
    for (const k of s.checks) console.log((k.pass ? 'PASS ' : 'FAIL ') + k.name + (k.detail !== undefined ? '  ' + JSON.stringify(k.detail) : ''));
    console.log('foreign pauses:', JSON.stringify(s.foreign), 'nav events:', JSON.stringify(s.nav));
    console.log('engine events (non-capture):', JSON.stringify(s.engineEvents));
  }
  console.log('\nfull result: ' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error('lifecycle e2e failed:', e); process.exit(1); });
