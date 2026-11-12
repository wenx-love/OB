import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const DIST = 'D:/Projects/ob-recover/dist';
const OUT = 'D:/Projects/ob-recover/test/acceptance/devtools-probe5.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9454;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-probe5-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const EXPR = "(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');r.exports=Object.keys(m).slice(0,60);var iv=m.InspectorView.InspectorView.instance();r.tabIds=iv.tabbedPane&&iv.tabbedPane.tabIds?iv.tabbedPane.tabIds():'no tabbedPane.tabIds';}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()";
const HDR = "(function(){var out=[];function walk(root,d){if(d>14)return;root.querySelectorAll('*').forEach(function(e){var c=String(e.className);if(c.indexOf('tabbed-pane-header-tab')>=0&&c.indexOf('tabbed-pane-header-tabs')<0){out.push((e.id||'')+'|'+(e.textContent||'').trim().slice(0,30))}if(e.shadowRoot)walk(e.shadowRoot,d+1)})}walk(document,0);return out.slice(0,40)})()";

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
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'read-only probe: inspect real DevTools frontend InspectorView tab ids and tab header elements; no clicks' };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl);
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    out.extensionId = load.id;
    await sleep(1500);
    const page: any = await b.send('Target.createTarget', { url: 'about:blank' });
    await sleep(500);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const tg: any = await b.send('Target.getTargets');
    const dt = tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    const ev = async (expr: string, awaitPromise = false) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, dsid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    out.headerTabs = await ev(HDR);
    out.inspectorView = await ev(EXPR, true);
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out).slice(0, 5000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
