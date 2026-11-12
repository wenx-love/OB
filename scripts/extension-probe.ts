import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9401;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-profile';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function connect(wsUrl: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); }
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onopen = () => resolve({
      send(method: string, params: any = {}) {
        return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
      },
      close() { ws.close(); },
    });
  });
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const headless = process.env.HEADFUL ? [] : ['--headless=new'];
  const child = spawn(CHROME, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--load-extension=' + DIST,
    '--disable-extensions-except=' + DIST,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-unsafe-extension-debugging',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    ...headless,
    'about:blank',
  ], { stdio: 'ignore' });
  const out: any = {};
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('remote debugging port not reachable');
    out.chrome = ver.Browser;
    await sleep(2500);

    const targets = await (await fetch(BASE + '/json/list')).json();
    out.targets = targets.map((t: any) => ({ type: t.type, url: t.url, ws: !!t.webSocketDebuggerUrl }));
    const sw = targets.find((t: any) => t.type === 'service_worker' && String(t.url).includes('background.js'));
    out.serviceWorkerFound = !!sw;
    out.extensionId = sw ? String(sw.url).replace('chrome-extension://', '').replace('/background.js', '') : null;
    if (!sw) { writeFileSync(ROOT + '/test/acceptance/phase3-1-probe.json', JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 2)); return; }

    // attach to the extension service worker
    const c = await connect(sw.webSocketDebuggerUrl);
    out.swAttached = true;
    await c.send('Runtime.enable');
    const probe = async (expr: string, awaitPromise = false) => {
      const r: any = await c.send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
      return r.result.value;
    };
    out.hasChromeDebugger = await probe('typeof chrome.debugger');
    out.hasDebuggerAttach = await probe('typeof (chrome.debugger && chrome.debugger.attach)');
    out.runtimeId = await probe('chrome.runtime.id');
    out.manifestName = await probe('chrome.runtime.getManifest().name');

    // can we reach the background onConnect by connecting from the SW context to ourselves?
    out.connectProbe = await probe(`new Promise((resolve) => {
      let done = false;
      try {
        const port = chrome.runtime.connect({ name: 'ob-recover-panel-999' });
        port.onMessage.addListener((m) => { if (!done) { done = true; resolve({ got: true, msg: m }); } });
        port.onDisconnect.addListener(() => { if (!done) { done = true; resolve({ got: false, disconnected: true, err: chrome.runtime.lastError && chrome.runtime.lastError.message }); } });
        setTimeout(() => { if (!done) { done = true; resolve({ got: false, timeout: true }); } }, 3000);
      } catch (e) { resolve({ got: false, threw: String(e) }); }
    })`, true);

    try { c.close(); } catch { /* ignore */ }
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-probe.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error('probe failed:', e); process.exit(1); });
