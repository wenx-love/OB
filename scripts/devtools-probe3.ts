import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const DIST = 'D:/Projects/ob-recover/dist';
const OUT = 'D:/Projects/ob-recover/test/acceptance/devtools-probe3.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9452;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-probe3-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FIND = "(function(){var hits=[];var tabs=[];function walk(root,d){if(d>14)return;var all=root.querySelectorAll('*');for(var i=0;i<all.length;i++){var e=all[i];var t=(e.getAttribute&&(e.getAttribute('aria-label')||e.getAttribute('title')))||'';var own='';for(var c=e.firstChild;c;c=c.nextSibling){if(c.nodeType===3)own+=c.textContent}if(/OB-Recover/i.test(t+' '+own)){var b=e.getBoundingClientRect();hits.push({tag:e.tagName,id:(e.id||'').slice(0,60),cls:String(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className).slice(0,60),text:(t+' '+own).trim().slice(0,60),x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),w:Math.round(b.width),h:Math.round(b.height)})}if(e.getAttribute&&e.getAttribute('role')==='tab'){var b2=e.getBoundingClientRect();tabs.push({id:(e.id||'').slice(0,60),label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,30),w:Math.round(b2.width),h:Math.round(b2.height)})}if(e.shadowRoot)walk(e.shadowRoot,d+1)}}walk(document,0);return {hits:hits,tabCount:tabs.length,tabs:tabs.slice(0,40)}})()";

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
  const out: any = { note: 'read-only probe: does the real DevTools frontend list the OB-Recover panel tab; no clicks' };
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
    const ev = async (sid: string, expr: string) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 200) };
      return r.result.value;
    };
    const dt = tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (dt) {
      const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
      out.frontend = await ev(dsid, FIND);
    }
    const ifr = tg.targetInfos.find((t: any) => t.type === 'iframe' && String(t.url).includes(load.id + '/devtools.html'));
    out.devtoolsIframeFound = !!ifr;
    if (ifr) {
      const isid = (await b.send('Target.attachToTarget', { targetId: ifr.targetId, flatten: true })).sessionId;
      out.devtoolsPageEnv = await ev(isid, "({href:location.href,devtools:typeof chrome!=='undefined'?typeof chrome.devtools:'none',panels:typeof chrome!=='undefined'&&chrome.devtools?typeof chrome.devtools.panels:'none',tabId:(function(){try{return chrome.devtools.inspectedWindow.tabId}catch(e){return 'ERR '+e.message}})()})");
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
