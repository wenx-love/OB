import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const OUT = ROOT + '/test/acceptance/devtools-real-1.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9461;
const HTTP = 8771;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-real-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SHOW = `(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);r.selected=iv.tabbedPane.selectedTabId}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()`;
const READ = `(function(){var t=function(id){var e=document.getElementById(id);return e?e.textContent:null};var logs=Array.prototype.map.call(document.querySelectorAll('#runtime-log .rt-log-entry'),function(e){return e.textContent}).slice(-8);return {debugger:t('rt-debugger-status'),runtime:t('rt-runtime-status'),tabId:t('rt-tab-id'),connectDisabled:document.getElementById('btn-rt-connect').disabled,disconnectDisabled:document.getElementById('btn-rt-disconnect').disabled,logs:logs,size:document.getElementById('app').dataset.size,w:innerWidth,h:innerHeight}})()`;
const CLICK = `(function(){document.getElementById('btn-rt-connect').click();return 1})()`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  try {
    const body = readFileSync(ROOT + '/test-pages/' + name);
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('nf');
  }
});

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
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'real DevTools frontend + real panel.html iframe + real background/chrome.debugger. Panel switched via InspectorView.showPanel (programmatic, not a mouse click on the tab). Connect is triggered by element.click() inside the real panel.' };
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
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/capture-ext.html' });
    await sleep(1500);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    let tg: any = await b.send('Target.getTargets');
    const ev = async (sid: string, expr: string, awaitPromise = false) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    const dt = tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    out.show = await ev(dsid, SHOW, true);
    await sleep(3000);
    tg = await b.send('Target.getTargets');
    const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
    out.panelTargetFound = !!pt;
    if (!pt) throw new Error('panel iframe target not found');
    const psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    out.before = await ev(psid, READ);
    out.click = await ev(psid, CLICK);
    await sleep(3000);
    out.afterConnect = await ev(psid, READ);
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out).slice(0, 5000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
