import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9405;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-profile5';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
      send(method: string, params: any = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); const msg: any = { id: i, method, params }; if (params && params.__sessionId) { msg.sessionId = params.__sessionId; delete msg.params.__sessionId; } ws.send(JSON.stringify(msg)); }); },
      close() { ws.close(); },
    });
  });
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });
  const out: any = {};
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl, () => {});
    await b.send('Target.setDiscoverTargets', { discover: true });
    const loadRes: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    const extId = loadRes.id;
    out.extensionId = extId;
    await sleep(1200);
    const tg = await b.send('Target.getTargets');
    const swTarget = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(extId));
    const att = await b.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true });
    const sid = att.sessionId;
    const send = (m: string, p: any = {}) => b.send(m, { ...p, __sessionId: sid });
    const ev = async (expr: string, awaitPromise = true) => {
      const r: any = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' :: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
      return r.result.value;
    };

    // Does connecting from the SW to itself trigger background's onConnect?
    out.selfConnect = await ev(`new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        const port = chrome.runtime.connect({ name: 'ob-recover-panel-777' });
        port.onMessage.addListener((m) => fin({ viaPort: true, firstMsg: m }));
        port.onDisconnect.addListener(() => fin({ viaPort: false, disconnected: true, err: chrome.runtime.lastError && chrome.runtime.lastError.message }));
        setTimeout(() => fin({ viaPort: false, timeout: true }), 2500);
      } catch (e) { fin({ threw: String(e) }); }
    })`);
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + '/T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-probe5.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
