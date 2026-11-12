import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9403;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-profile3';
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
      send(method: string, params: any = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }); },
      close() { ws.close(); },
    });
  });
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--headless=new',
    'about:blank',
  ], { stdio: 'ignore' });
  const out: any = {};
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    out.chrome = ver.Browser;
    await sleep(1500);

    const events: any[] = [];
    const b = await connect(ver.webSocketDebuggerUrl, (m) => events.push(m));
    await b.send('Target.setDiscoverTargets', { discover: true });

    let loadRes: any = null;
    let loadErr: string | null = null;
    try {
      loadRes = await b.send('Extensions.loadUnpacked', { path: DIST });
    } catch (e: any) {
      loadErr = e && e.message ? e.message : String(e);
    }
    out.loadUnpacked = loadRes;
    out.loadUnpackedError = loadErr;
    await sleep(2500);

    const tg = await b.send('Target.getTargets');
    out.extensionTargets = tg.targetInfos.filter((t: any) => String(t.url).startsWith('chrome-extension://') && t.type !== 'background_page').map((t: any) => ({ type: t.type, url: t.url }));
    out.obTargets = tg.targetInfos.filter((t: any) => String(t.url).includes('ob') || String(t.title).includes('OB-Recover')).map((t: any) => ({ type: t.type, url: t.url, title: t.title }));

    const extId = loadRes && (loadRes.id || loadRes.extensionId);
    out.extensionId = extId;
    if (extId) {
      // try to wake the MV3 service worker with a target attach
      const swTarget = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(extId));
      out.swTargetFound = !!swTarget;
      if (!swTarget) {
        // create a tab and probe chrome-extension url to boot devtools page? just report
        out.note = 'service worker not started yet';
      }
    }
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + '/T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-probe3.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
