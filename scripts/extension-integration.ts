import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9410;
const HTTP = 8765;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-int-profile';
const BASE = 'http://127.0.0.1:' + PORT;
const PAGE = process.env.PAGE || 'capture-ext.html';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// Phase 4.6.1: 每个 CDP 命令都有等待上限。修复前 send 只在回复到达时才结算：回复永不到来（页面被暂停卡住、socket 断开、SW 里的 promise 不结算）就永远挂起，
// 而结果 JSON 在 finally 之后才写，挂起时既没有输出也没有诊断。超时只用来把挂起变成带方法名的失败并保留现场，不重试，不掩盖原因。
const CMD_TIMEOUT_MS = Number(process.env.CMD_TIMEOUT_MS || 20000);

function connect(wsUrl: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    const failAll = (why: string): void => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(ev.data);
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: any = {}, sessionId?: string) {
        return new Promise((res, rej) => { const i = ++id; const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT_MS + 'ms: ' + method)); }, CMD_TIMEOUT_MS); pending.set(i, { resolve: res, reject: rej, timer, method }); const msg: any = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); });
      },
      close() { ws.close(); },
    });
  });
}

async function main() {
  const server = createServer((req, res) => {
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
  const out: any = { note: 'real extension loaded via Extensions.loadUnpacked; real chrome.debugger calls inside the extension service worker, driven through background handlePanelCommand; NOT manual mouse operation of the DevTools panel', page: PAGE, steps: [] as any[] };
  let diagnose: (() => Promise<any>) | null = null;
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    out.extensionId = load.id;
    await sleep(1500);
    const created: any = await b.send('Target.createTarget', { url: 'about:blank' });
    await sleep(500);
    const tg: any = await b.send('Target.getTargets');
    const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id));
    out.swFound = !!sw;
    const swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
    const pgSid = (await b.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })).sessionId;
    const swEval = async (expr: string) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, swSid);
      if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' :: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
      return r.result.value;
    };
    const pgEval = async (expr: string) => {
      const r: any = await Promise.race([b.send('Runtime.evaluate', { expression: expr, returnByValue: true }, pgSid), sleep(3000).then(() => ({ result: { value: '__timeout__' } }))]);
      return r.result ? r.result.value : null;
    };

    out.hook = await swEval('typeof globalThis.__obRecoverTest');
    const tabs: any = await swEval('new Promise((resolve) => chrome.tabs.query({}, (t) => resolve(t.map((x) => x.id))))');
    const tab = tabs[tabs.length - 1];
    out.tabId = tab;
    diagnose = async () => ({
      pageResponsive: (await pgEval('1+1')) === 2,
      sw: await swEval('(() => { const t = globalThis.__obRecoverTest; const s = t.getCaptureState(' + tab + '); return { status: t.getStatus(' + tab + '), capture: s && { active: s.active, breakpoints: s.breakpoints, stats: s.stats, captures: s.captures.length }, lastMessages: (globalThis.__msgs || []).slice(-15).map((m) => (m.event ? m.event.kind + ": " + (m.event.message || m.event.reason || "") : m.type)) }; })()'),
    });

    const minConf = process.env.MEDIUM ? 'medium' : 'high';
    out.autoCaptureMinConfidence = minConf;
    out.connectAndStart = await swEval('(async () => { const t = globalThis.__obRecoverTest; globalThis.__msgs = []; const port = { postMessage: (m) => { globalThis.__msgs.push(m); } }; t.registerPort(' + tab + ', port); await t.handlePanelCommand({ type: "debugger-connect", tabId: ' + tab + ' }, port); await t.handlePanelCommand({ type: "capture-start", tabId: ' + tab + ', targets: [], autoCaptureMinConfidence: "' + minConf + '" }, port); return { status: t.getStatus(' + tab + '), state: t.getCaptureState(' + tab + ') }; })()'.replace(/\"/g, "'"));

    await b.send('Page.enable', {}, pgSid);
    await b.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/' + PAGE }, pgSid);
    await sleep(8000);
    out.afterLoad = await swEval('globalThis.__obRecoverTest.getCaptureState(' + tab + ')');
    out.pageResult = await pgEval('JSON.stringify(window.__extResult)');
    out.pageTitle = await pgEval('document.title');
    out.panelMessages = await swEval('globalThis.__msgs.filter((m) => m.event && (m.event.kind === "log" || m.event.kind === "capture-state")).map((m) => m.event.kind === "log" ? m.event.level + ": " + m.event.message : "state active=" + m.event.active + " bps=" + m.event.breakpoints + (m.event.resetReason ? " reset=" + m.event.resetReason : "")).slice(0, 60)'.replace(/\"/g, "'"));

    await swEval('(async () => { const t = globalThis.__obRecoverTest; await t.handlePanelCommand({ type: "capture-stop", tabId: ' + tab + ' }, { postMessage: () => {} }); return 1; })()'.replace(/\"/g, "'"));
    out.afterStop = await swEval('(() => { const s = globalThis.__obRecoverTest.getCaptureState(' + tab + '); return s && { active: s.active, breakpoints: s.breakpoints }; })()');
    out.pageResponsiveAfterStop = (await pgEval('1+1')) === 2;

    if (process.env.RESTART) {
      // 清空记录后能否重新捕获：再次 connect+start，然后重新导航
      const mk = (expr: string) => expr.replace(/\"/g, "'");
      out.cleared = await swEval(mk('(() => { const t = globalThis.__obRecoverTest; t.handlePanelCommand({ type: "capture-clear", tabId: ' + tab + ' }, { postMessage: () => {} }); return t.getCaptureState(' + tab + ').captures.length; })()'));
      out.restart = await swEval(mk('(async () => { const t = globalThis.__obRecoverTest; await t.handlePanelCommand({ type: "capture-start", tabId: ' + tab + ', targets: [], autoCaptureMinConfidence: "high" }, { postMessage: () => {} }); return t.getCaptureState(' + tab + ').active; })()'));
      await b.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/' + PAGE }, pgSid);
      await sleep(8000);
      out.afterRestart = await swEval('globalThis.__obRecoverTest.getCaptureState(' + tab + ')');
      out.afterRestart.captured = out.afterRestart.captures.map((c: any) => c.functionName + '(' + JSON.stringify(c.arguments.map((a: any) => a.value)) + ')->' + JSON.stringify(c.returnValue && c.returnValue.value));
      await swEval(mk('(async () => { await globalThis.__obRecoverTest.handlePanelCommand({ type: "capture-stop", tabId: ' + tab + ' }, { postMessage: () => {} }); return 1; })()'));
    }
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
    if (diagnose) {
      try { out.diagnostics = await diagnose(); } catch (de: any) { out.diagnostics = { unavailable: de && de.message ? de.message : String(de) }; }
    }
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-extension-integration.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
