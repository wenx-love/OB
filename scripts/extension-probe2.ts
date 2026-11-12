import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9402;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-profile2';
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
  const args = [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--load-extension=' + DIST,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--headless=new',
    'about:blank',
  ];
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  const out: any = { args };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    out.chrome = ver.Browser;
    out.webSocketDebuggerUrl = ver.webSocketDebuggerUrl;
    await sleep(3000);

    const events: any[] = [];
    const b = await connect(ver.webSocketDebuggerUrl, (m) => { if (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged') events.push(m); });
    await b.send('Target.setDiscoverTargets', { discover: true });
    await sleep(1500);
    const tg = await b.send('Target.getTargets');
    out.allTargets = tg.targetInfos.map((t: any) => ({ type: t.type, url: t.url, id: t.targetId }));
    out.extensionTargets = tg.targetInfos.filter((t: any) => String(t.url).startsWith('chrome-extension://'));
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + '/T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-probe2.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ chrome: out.chrome, fatal: out.fatal, extensionTargets: out.extensionTargets, targetCount: out.allTargets ? out.allTargets.length : 0 }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
