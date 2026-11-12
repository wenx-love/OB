import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

// Phase 4.7 step 4: Service Worker recycling probe. Real Chrome, real extension, headless=new.
// Question (the main unverified assumption of Phase 4.6.1): when the extension service worker is recycled while the debugger session lives on,
// does our own breakpoint pause get dropped by chrome.debugger.onEvent because attachedTabs is only an in-memory Set, leaving the page paused forever?
// Evidence only: the script records what it observes and reports one of confirmed / not-confirmed / still-undetermined. It does not claim a root cause.
// Nothing under src/ is touched. The stopped page is always resumed and Chrome is always killed.
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9412;
const HTTP = 8766;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-sw-profile';
const BASE = 'http://127.0.0.1:' + PORT;
const PAGE = 'sw-recycle.html';
// Method A = close the worker target while capture is stopped (what earlier versions did).
// Method B = leave capture ACTIVE and let the worker idle out on its own, which is the case that actually matters:
// if the worker dies while our debugger session is still attached, nobody is left to answer its own breakpoint pauses.
// Method C was tried and REMOVED: it detached this probe's own page session to stop keeping the worker alive, and that same session was
// the only way to observe the page afterwards, so every later read returned "no page" instead of a page state. It produced no usable evidence.
const METHOD = process.env.METHOD || 'A';
const IDLE_WAIT_MS = Number(process.env.IDLE_WAIT_MS || 90000);
const OUT = ROOT + '/test/acceptance/p47-sw-recycle' + (METHOD === 'A' ? '' : '-method' + METHOD) + '.json';
const CMD_TIMEOUT_MS = Number(process.env.CMD_TIMEOUT_MS || 20000);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CdpSend { (method: string, params?: Record<string, any>, sessionId?: string): Promise<any> }
interface CdpConn { send: CdpSend; close(): void }
interface Pending { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; method: string }

function connect(wsUrl: string): Promise<CdpConn> {
  return new Promise<CdpConn>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, Pending>();
    const failAll = (why: string) => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: Record<string, any> = {}, sessionId?: string) {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT_MS + 'ms: ' + method)); }, CMD_TIMEOUT_MS);
          pending.set(i, { resolve: res, reject: rej, timer, method });
          const msg: Record<string, any> = { id: i, method, params };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
        });
      },
      close() { ws.close(); },
    });
  });
}

async function main() {
  const server = createServer((req: any, res: any) => {
    const name = String(req.url || '/').split('?')[0].replace('/', '');
    try {
      const body = readFileSync(ROOT + '/test-pages/' + name);
      res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));

  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });

  const out: Record<string, any> = {
    note: 'Phase 4.7 SW recycle probe: real Chrome + real extension; observes whether a breakpoint pause survives a service worker recycle. Evidence only, no root-cause claim.',
    method: METHOD === 'A' ? 'A: capture stopped first, then the service worker target is closed' : 'B: capture stays ACTIVE while the service worker is allowed to idle out (the case that matters)',
    page: PAGE,
    steps: [] as any[],
    conclusion: 'still-undetermined',
  };
  let b: CdpConn | null = null;
  let swSid = '';
  let pageSid = '';
  let tab: number | null = null;
  let load: any = null;

  const B = (): CdpConn => {
    if (!b) throw new Error('no CDP connection');
    return b;
  };
  const swEval = async (expr: string): Promise<any> => {
    const r = await B().send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, swSid);
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' :: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 200) };
    return r.result.value;
  };
  const pgEval = async (expr: string): Promise<any> => {
    const r = await Promise.race([
      pageSid ? B().send('Runtime.evaluate', { expression: expr, returnByValue: true }, pageSid) : Promise.resolve({ result: { value: '__no_page__' } }),
      sleep(3000).then(() => ({ result: { value: '__timeout__' } })),
    ]);
    return r.result ? r.result.value : null;
  };
  const step = async (name: string, fn: () => Promise<any>): Promise<void> => {
    try {
      out.steps.push({ name, ...(await fn()) });
    } catch (e: any) {
      out.steps.push({ name, error: String(e && e.message ? e.message : e) });
    }
  };
  const findTargets = async (): Promise<any[]> => (await B().send('Target.getTargets')).targetInfos;

  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) {
      try { ver = await (await fetch(BASE + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); }
    }
    if (!ver) throw new Error('chrome did not expose the debugging port');
    out.chrome = ver.Browser;
    await sleep(800);
    b = await connect(ver.webSocketDebuggerUrl);
    await B().send('Target.setDiscoverTargets', { discover: true });
    load = await B().send('Extensions.loadUnpacked', { path: DIST });
    out.extensionId = load.id;
    await sleep(1500);

    const created = await B().send('Target.createTarget', { url: 'about:blank' });
    await sleep(500);
    const tg = await findTargets();
    const sw0 = tg.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id));
    out.swFoundInitially = !!sw0;
    if (!sw0) throw new Error('extension service worker target not found: cannot run this probe');
    swSid = (await B().send('Target.attachToTarget', { targetId: sw0.targetId, flatten: true })).sessionId;
    pageSid = (await B().send('Target.attachToTarget', { targetId: created.targetId, flatten: true })).sessionId;

    out.hookPresent = await swEval('typeof globalThis.__obRecoverTest');
    const tabs = await swEval('new Promise((resolve) => chrome.tabs.query({}, (t) => resolve(t.map((x) => x.id))))');
    tab = Array.isArray(tabs) ? tabs[tabs.length - 1] : null;
    out.tabId = tab;
    if (tab === null) throw new Error('no tab id from chrome.tabs.query');

    await step('connect-and-start', async () => swEval('(async () => { const t = globalThis.__obRecoverTest; globalThis.__msgs = []; const port = { postMessage: (m) => { globalThis.__msgs.push(m); } }; t.registerPort(' + tab + ', port); await t.handlePanelCommand({ type: "debugger-connect", tabId: ' + tab + ' }, port); await t.handlePanelCommand({ type: "capture-start", tabId: ' + tab + ', targets: [], autoCaptureMinConfidence: "high" }, port); return { status: t.getStatus(' + tab + '), state: t.getCaptureState(' + tab + ') }; })()'));

    await B().send('Page.enable', {}, pageSid);
    await B().send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/' + PAGE }, pageSid);
    await sleep(8000);
    await step('first-run', async () => ({ pageResult: await pgEval('JSON.stringify(window.__extResult)'), state: await swEval('globalThis.__obRecoverTest.getCaptureState(' + tab + ')') }));

    if (METHOD !== 'A') {
      // Method B: capture stays on; the worker is only kept alive by events. A quiet page plus a quiet worker is what makes Chrome stop it.
      await step('idle-until-sw-gone', async () => {
        const started = Date.now();
        let goneAt = null;
        let lastSeen = null;
        while (Date.now() - started < IDLE_WAIT_MS) {
          const found = (await findTargets()).find((t) => t.type === 'service_worker' && String(t.url).includes(load.id));
          if (!found) { goneAt = Date.now() - started; break; }
          lastSeen = found.targetId;
          await sleep(1000);
        }
        out.idleGoneAtMs = goneAt;
        return { waitedMs: Date.now() - started, swGone: goneAt !== null, lastTargetId: lastSeen, idleWaitBoundMs: IDLE_WAIT_MS };
      });

      await step('page-while-sw-gone', async () => ({
        responsive: (await pgEval('1+1')) === 2,
        pageResultStillReadable: await pgEval('JSON.stringify(window.__extResult)'),
      }));

      // A fresh page load with capture nominally active is where a dropped pause would show up: the worker that configured the breakpoints is gone.
      await step('reload-while-sw-gone', async () => {
        await B().send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/' + PAGE }, pageSid);
        await sleep(8000);
        return { pageResult: await pgEval('JSON.stringify(window.__extResult)'), responsiveAfter: await pgEval('1+1') };
      });

      // Does the worker come back once the extension is asked to do something? Chrome recreates it lazily on the next event.
      await step('wait-for-sw-restart', async () => {
        let after = null;
        for (let i = 0; i < 40 && !after; i++) {
          after = (await findTargets()).find((t) => t.type === 'service_worker' && String(t.url).includes(load.id));
          if (!after) await sleep(500);
        }
        out.swRestarted = !!after;
        if (after) {
          swSid = (await B().send('Target.attachToTarget', { targetId: after.targetId, flatten: true })).sessionId;
          await sleep(800);
        }
        const hook = after ? await swEval('typeof globalThis.__obRecoverTest') : 'no-sw';
        const state = hook === 'object' ? await swEval('(() => { const t = globalThis.__obRecoverTest; const s = t.getCaptureState(' + tab + '); return { status: t.getStatus(' + tab + '), active: s && s.active, breakpoints: s && s.breakpoints }; })()') : 'no-hook';
        return { restarted: !!after, newTargetId: after ? after.targetId : null, hook, state };
      });

      await step('final-state', async () => {
        const t = await findTargets();
        return { serviceWorkerTargets: t.filter((x) => x.type === 'service_worker').map((x) => x.url), pageStillResponsive: (await pgEval('1+1')) === 2 };
      });
    } else {

    // Stop capture first and confirm the page is running free (not paused) BEFORE touching the service worker.
    // Otherwise a page stuck after the recycle could be explained by "it was already paused", not by a dropped pause.
    await step('stop-capture-and-confirm-running', async () => {
      await swEval('(async () => { const t = globalThis.__obRecoverTest; await t.handlePanelCommand({ type: "capture-stop", tabId: ' + tab + ' }, { postMessage: () => {} }); return 1; })()');
      await sleep(1500);
      const baseline = await pgEval('window.__freeMarker = (window.__freeMarker || 0) + 1; window.__freeMarker');
      return { freeMarkerBefore: baseline, responsive: (await pgEval('1+1')) === 2, state: await swEval('(() => { const t = globalThis.__obRecoverTest; const s = t.getCaptureState(' + tab + '); return s && { active: s.active, breakpoints: s.breakpoints }; })()') };
    });

    // Recycle the service worker. Only ONE thing changes here: the extension service worker target is closed while the debugger session stays attached to the page.
    await step('recycle-sw', async () => {
      const before = (await findTargets()).find((t) => t.type === 'service_worker' && String(t.url).includes(load.id));
      await B().send('Target.closeTarget', { targetId: before.targetId });
      await sleep(3000);
      let after = (await findTargets()).find((t) => t.type === 'service_worker' && String(t.url).includes(load.id));
      if (after) {
        swSid = (await B().send('Target.attachToTarget', { targetId: after.targetId, flatten: true })).sessionId;
        await sleep(1000);
      }
      return { closedTarget: before.targetId, swPresentAfter: !!after, newTargetId: after ? after.targetId : null, hookAfter: after ? await swEval('typeof globalThis.__obRecoverTest') : 'no-sw' };
    });

    // A closed service worker target is recreated lazily by the browser. Waiting for it to come back is what makes the next step meaningful:
    // without the restart there is no new in-memory state and the run would only prove that a missing worker cannot drive anything.
    await step('wait-for-sw-restart', async () => {
      let after = null;
      for (let i = 0; i < 40 && !after; i++) {
        after = (await findTargets()).find((t) => t.type === 'service_worker' && String(t.url).includes(load.id));
        if (!after) await sleep(500);
      }
      out.swRestarted = !!after;
      if (after) {
        swSid = (await B().send('Target.attachToTarget', { targetId: after.targetId, flatten: true })).sessionId;
        await sleep(800);
      }
      const hook = after ? await swEval('typeof globalThis.__obRecoverTest') : 'no-sw';
      // The decisive question about in-memory state: does the restarted worker still consider this page attached?
      const statusAfterRestart = hook === 'object' ? await swEval('globalThis.__obRecoverTest.getStatus(' + tab + ')') : 'no-hook';
      return { restarted: !!after, newTargetId: after ? after.targetId : null, hook, debuggerStatusAfterRestart: statusAfterRestart };
    });

    await step('page-responsive-while-idle', async () => ({ responsive: (await pgEval('1+1')) === 2, freeMarkerNow: await pgEval('window.__freeMarker') }));

    // Drive a brand-new capture run from the restarted worker. If the restarted worker lost its in-memory attach state but chrome.debugger
    // still holds the session, this is exactly where a pause could be produced and never answered.
    await step('reconnect-and-run-after-recycle', async () => {
      const recon = await swEval('(async () => { const t = globalThis.__obRecoverTest; if (!t) return "no-hook"; const port = { postMessage: () => {} }; await t.handlePanelCommand({ type: "debugger-connect", tabId: ' + tab + ' }, port); await t.handlePanelCommand({ type: "capture-start", tabId: ' + tab + ', targets: [], autoCaptureMinConfidence: "high" }, port); return t.getStatus(' + tab + '); })()');
      await B().send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/' + PAGE }, pageSid);
      await sleep(8000);
      const result = await pgEval('JSON.stringify(window.__extResult)');
      const responsiveAfter = await pgEval('1+1');
      const state = await swEval('(() => { const t = globalThis.__obRecoverTest; if (!t) return "no-hook"; const s = t.getCaptureState(' + tab + '); return { status: t.getStatus(' + tab + '), active: s && s.active, breakpoints: s && s.breakpoints, hits: s && s.stats && s.stats.hits, captures: s && s.captures.length }; })()');
      return { reconnectStatus: recon, pageResult: result, responsiveAfter, state };
    });

    await step('final-state', async () => {
      const t = await findTargets();
      return { serviceWorkerTargets: t.filter((x) => x.type === 'service_worker').map((x) => x.url), pageStillResponsive: (await pgEval('1+1')) === 2 };
    });
    }
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { if (b && pageSid) await B().send('Debugger.resume', {}, pageSid); } catch { /* not paused */ }
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ }
    server.close();
  }

  const first = out.steps.find((s: any) => s.name === 'first-run');
  const firstOk = !!(first && first.pageResult && first.pageResult !== '__timeout__' && first.pageResult !== 'undefined');

  if (METHOD !== 'A') {
    const gone = out.steps.find((s: any) => s.name === 'idle-until-sw-gone');
    const whileGone = out.steps.find((s: any) => s.name === 'page-while-sw-gone');
    const reload = out.steps.find((s: any) => s.name === 'reload-while-sw-gone');
    const restart = out.steps.find((s: any) => s.name === 'wait-for-sw-restart');
    const swGone = !!(gone && gone.swGone === true);
    const stayedResponsive = !!(whileGone && whileGone.responsive === true);
    const reloadOk = !!(reload && reload.pageResult && reload.pageResult !== '__timeout__' && reload.pageResult !== 'undefined');
    const reloadResponsive = !!(reload && reload.responsiveAfter === 2);
    if (!firstOk) out.conclusion = 'still-undetermined: the first capture run never produced a page result, so the probe never reached the idle phase';
    else if (!swGone) out.conclusion = 'still-undetermined: the service worker never went away within the idle wait bound, so no recycle happened during this run';
    else if (stayedResponsive && reloadOk && reloadResponsive) out.conclusion = 'not-confirmed: the service worker went away while capture was active, the page stayed responsive, and a fresh load with capture still nominally active also finished normally';
    else if (!stayedResponsive) out.conclusion = 'observed-stall-while-sw-gone: the service worker went away while capture was active and the page stopped answering, consistent with a pause no live worker could resume';
    else out.conclusion = 'observed-stall-on-reload-while-sw-gone: the page stayed responsive while idle, but a fresh load with capture still nominally active never produced a result';
    out.swRestarted = restart ? restart.restarted === true : false;
  } else {
    const stopped = out.steps.find((s: any) => s.name === 'stop-capture-and-confirm-running');
    const restart = out.steps.find((s: any) => s.name === 'wait-for-sw-restart');
    const idle = out.steps.find((s: any) => s.name === 'page-responsive-while-idle');
    const after = out.steps.find((s: any) => s.name === 'reconnect-and-run-after-recycle');
    const freeBeforeRecycle = !!(stopped && stopped.responsive === true);
    const restarted = !!(restart && restart.restarted === true && restart.hook === 'object');
    const idleOk = !!(idle && idle.responsive === true);
    const afterOk = !!(after && after.pageResult && after.pageResult !== '__timeout__' && after.pageResult !== 'undefined');
    const afterResponsive = !!(after && after.responsiveAfter === 2);
    if (!firstOk) out.conclusion = 'still-undetermined: the first capture run never produced a page result, so the probe never reached the recycle step';
    else if (!freeBeforeRecycle) out.conclusion = 'still-undetermined: the page was not confirmed running free before the service worker was closed, so a later stall cannot be attributed to a dropped pause';
    else if (!restarted) out.conclusion = 'still-undetermined: the service worker target did not come back within the wait bound after being closed, so its restarted in-memory state could not be inspected';
    else if (!idleOk) out.conclusion = 'observed-stall-after-forced-sw-close: with the page confirmed running free beforehand, closing the service worker target was followed by an unresponsive page; consistent with the dropped-pause hypothesis but a forced close is NOT the same event as a browser-initiated recycle';
    else if (afterOk && afterResponsive) out.conclusion = 'not-confirmed: after the service worker was recycled and restarted, a fresh capture run through the restarted worker still finished and the page stayed responsive';
    else out.conclusion = 'still-undetermined: the fresh capture run after the recycle produced no page result and no responsive page';
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ conclusion: out.conclusion, fatal: out.fatal || null, steps: out.steps.map((s: any) => s.name + (s.error ? ':ERROR' : ':ok')) }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
