import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9411;
const HTTP = 8766;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-conflict-profile';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function connect(wsUrl: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(ev.data);
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
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

async function main() {
  const server = createServer((req, res) => {
    const name = String(req.url || '/').split('?')[0].replace('/', '');
    try {
      const body = readFileSync(ROOT + '/test-pages/' + name);
      res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));

  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'conflict reproduction: a browser-level CDP session with the Debugger domain enabled stands in for DevTools occupying the tab; then chrome.debugger.attach is attempted from the extension service worker' };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    await sleep(1500);
    const created: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/capture-ext-immediate.html' });
    await sleep(1500);
    const tg: any = await b.send('Target.getTargets');
    const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id));
    const swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
    const swEval = async (expr: string) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, swSid);
      if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' :: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
      return r.result.value;
    };
    const tabs: any = await swEval('new Promise((resolve) => chrome.tabs.query({}, (t) => resolve(t.map((x) => x.id))))');
    const tab = tabs[tabs.length - 1];
    out.tabId = tab;

    // 步骤 1：扩展先成功 attach，证明无冲突时可用
    out.attachClean = await swEval('new Promise((resolve) => chrome.debugger.attach({ tabId: ' + tab + ' }, "1.3", () => resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message })))');
    out.detach1 = await swEval('new Promise((resolve) => chrome.debugger.detach({ tabId: ' + tab + ' }, () => resolve({ ok: !chrome.runtime.lastError })))');

    // 步骤 2：模拟 DevTools 占用（浏览器级 CDP 对该页开启 Debugger 域）
    const pgSid = (await b.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })).sessionId;
    await b.send('Debugger.enable', {}, pgSid);
    out.devtoolsLikeSession = 'browser-level CDP attached with Debugger domain enabled';

    // 步骤 3：扩展再 attach，预期失败并给出明确错误
    out.attachUnderConflict = await swEval('new Promise((resolve) => chrome.debugger.attach({ tabId: ' + tab + ' }, "1.3", () => resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message })))');

    // 步骤 3b：上一步 attach 成功，说明并行 CDP 会话不会阻止 chrome.debugger.attach；先 detach，避免污染后续步骤
    out.detachAfterConflictAttempt = await swEval('new Promise((resolve) => chrome.debugger.detach({ tabId: ' + tab + ' }, () => resolve({ ok: !chrome.runtime.lastError })))');
    // 步骤 3c：真正的互斥冲突：标签页已被另一个 chrome.debugger 客户端持有。这里用扩展自己先 attach 一次来占用，再走真实的 handlePanelCommand，检查错误是否如实暴露
    out.heldByRawAttach = await swEval('new Promise((resolve) => chrome.debugger.attach({ tabId: ' + tab + ' }, "1.3", () => resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message })))');
    out.connectUnderRealConflict = await swEval('(async () => { const t = globalThis.__obRecoverTest; const msgs = []; const port = { postMessage: (m) => msgs.push(m) }; t.registerPort(' + tab + ', port); await t.handlePanelCommand({ type: "debugger-connect", tabId: ' + tab + ' }, port); await t.handlePanelCommand({ type: "capture-start", tabId: ' + tab + ', targets: [] }, port); const st = t.getCaptureState(' + tab + '); return { status: t.getStatus(' + tab + '), captureActive: st ? st.active : null, msgs: msgs.map((m) => m.event ? m.event.kind + ":" + (m.event.status || m.event.level || "") + ":" + (m.event.error || m.event.message || "") : JSON.stringify(m)) }; })()');
    out.detachHeld = await swEval('new Promise((resolve) => chrome.debugger.detach({ tabId: ' + tab + ' }, () => resolve({ ok: !chrome.runtime.lastError })))');
    // 步骤 4：释放占用后应恢复
    await b.send('Debugger.disable', {}, pgSid).catch(() => {});
    await b.send('Target.detachFromTarget', { sessionId: pgSid }).catch(() => {});
    await sleep(500);
    out.attachAfterRelease = await swEval('new Promise((resolve) => chrome.debugger.attach({ tabId: ' + tab + ' }, "1.3", () => resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message })))');

    // 截图：扩展驱动的测试页面（不是 DevTools 面板 UI）
    const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, pgSid).catch(() => null);
    if (shot && shot.data) { writeFileSync(ROOT + '/test/acceptance/phase3-1-page-screenshot.png', Buffer.from(shot.data, 'base64')); out.screenshot = 'phase3-1-page-screenshot.png (test page rendered by Chrome; NOT the DevTools panel UI)'; }
    await swEval('new Promise((resolve) => chrome.debugger.detach({ tabId: ' + tab + ' }, () => resolve(1)))');
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + '/T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-conflict.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
