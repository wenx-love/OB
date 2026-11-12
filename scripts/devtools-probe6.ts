import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const DIST = 'D:/Projects/ob-recover/dist';
const OUT = 'D:/Projects/ob-recover/test/acceptance/devtools-probe6.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9455;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-probe6-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SHOW = "(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var ids=iv.tabbedPane.tabIds();var id=ids.find(function(x){return x.indexOf('OB-Recover')>=0});r.id=id;if(iv.showPanel){await iv.showPanel(id)}else{r.noShowPanel=true}r.selected=iv.tabbedPane.selectedTabId}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()";
const ENV = "(function(){var r={href:location.href,w:innerWidth,h:innerHeight,devtools:typeof chrome.devtools};try{r.tabId=chrome.devtools.inspectedWindow.tabId}catch(e){r.tabId='ERR '+e.message}try{localStorage.setItem('__t','1');r.ls=localStorage.getItem('__t');localStorage.removeItem('__t')}catch(e){r.ls='ERR '+e.message}var a=document.getElementById('app');var cp=document.getElementById('code-panels');r.dom={app:!!a,size:a&&a.dataset.size,layout:cp&&cp.dataset.layout};var b=document.getElementById('btn-layout-mode');if(b){b.click()}try{r.layoutPref=localStorage.getItem('ob_recover_layout_v1')}catch(e){r.layoutPref='ERR '+e.message}return r})()";

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
  const out: any = { note: 'real DevTools frontend: InspectorView.showPanel switches to the registered OB-Recover panel, then the real panel.html iframe is inspected. showPanel is a programmatic switch, not a mouse click on the tab.' };
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
    out.targetsAfter = tg.targetInfos.map((t: any) => ({ type: t.type, url: String(t.url).slice(0, 110) }));
    const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
    out.panelTargetFound = !!pt;
    if (pt) {
      const psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
      out.panelEnv = await ev(psid, ENV);
    }
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
