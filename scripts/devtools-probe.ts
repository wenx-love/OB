import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const DIST = 'D:/Projects/ob-recover/dist';
const OUT = 'D:/Projects/ob-recover/test/acceptance/devtools-probe' + (process.env.HEADED ? '-headed' : '-headless') + '.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9450;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-probe-profile';
const HEADED = !!process.env.HEADED;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const EXPR = "(function(){var r={href:location.href,runtime:typeof chrome!=='undefined'&&!!chrome.runtime?typeof chrome.runtime.connect:'none',storage:typeof chrome!=='undefined'&&!!chrome.storage?typeof chrome.storage.local:'none',devtools:typeof chrome!=='undefined'?typeof chrome.devtools:'none'};try{localStorage.setItem('__t','1');r.ls=localStorage.getItem('__t');localStorage.removeItem('__t')}catch(e){r.ls='ERR '+e.message}return r})()";

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
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const args = ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu'];
  if (!HEADED) args.push('--headless=new');
  args.push('about:blank');
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  const out: any = { headed: HEADED };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl);
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    out.extensionId = load.id;
    await sleep(1500);
    const page: any = await b.send('Target.createTarget', { url: 'about:blank' });
    await sleep(500);
    try { out.openDevTools = await b.send('Target.openDevTools', { targetId: page.targetId }); } catch (e: any) { out.openDevToolsError = String(e && e.message ? e.message : e); }
    await sleep(4000);
    const tg: any = await b.send('Target.getTargets');
    out.targets = tg.targetInfos.map((t: any) => ({ type: t.type, url: String(t.url).slice(0, 140) }));
    try {
      const ep: any = await b.send('Target.createTarget', { url: 'chrome-extension://' + load.id + '/panel.html' });
      await sleep(2000);
      const sid = (await b.send('Target.attachToTarget', { targetId: ep.targetId, flatten: true })).sessionId;
      const r: any = await b.send('Runtime.evaluate', { expression: EXPR, returnByValue: true }, sid);
      out.extPage = r.result ? r.result.value : r;
    } catch (e: any) { out.extPageError = String(e && e.message ? e.message : e); }
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
