import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const DIST = 'D:/Projects/ob-recover/dist';
const OUT = 'D:/Projects/ob-recover/test/acceptance/devtools-probe2.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9451;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-probe2-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SCAN = "(function(){var res={title:document.title,bodyKids:document.body?document.body.children.length:-1,tabs:[]};function walk(root,depth){if(depth>12)return;var all=root.querySelectorAll('*');for(var i=0;i<all.length;i++){var e=all[i];var al=e.getAttribute&&e.getAttribute('aria-label');var id=e.id||'';var role=e.getAttribute&&e.getAttribute('role');if(role==='tab'||/tab/i.test(id)){var b=e.getBoundingClientRect();res.tabs.push({id:id.slice(0,80),label:(al||e.textContent||'').trim().slice(0,40),x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),w:Math.round(b.width),h:Math.round(b.height)})}if(e.shadowRoot)walk(e.shadowRoot,depth+1)}}walk(document,0);res.more=[];document.querySelectorAll('[aria-label]').forEach(function(e){var a=e.getAttribute('aria-label');if(/more tabs|overflow|more panels/i.test(a)){var b=e.getBoundingClientRect();res.more.push({a:a,x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)})}});return res})()";

const EXPR = "(function(){var r={href:location.href,runtime:typeof chrome!=='undefined'&&!!chrome.runtime?typeof chrome.runtime.connect:'none',storage:typeof chrome!=='undefined'&&!!chrome.storage?typeof chrome.storage.local:'none',devtools:typeof chrome!=='undefined'?typeof chrome.devtools:'none'};try{r.tabId=chrome.devtools.inspectedWindow.tabId}catch(e){r.tabId='ERR '+e.message}try{localStorage.setItem('__t','1');r.ls=localStorage.getItem('__t');localStorage.removeItem('__t')}catch(e){r.ls='ERR '+e.message}try{r.dom={app:!!document.getElementById('app'),dock:!!document.getElementById('dock'),size:document.getElementById('app')&&document.getElementById('app').dataset.size,w:innerWidth,h:innerHeight}}catch(e){}return r})()";

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
  const out: any = { note: 'real Chrome DevTools frontend opened via Target.openDevTools; panel located and clicked by CDP mouse events on the DevTools frontend page' };
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
    out.openDevTools = await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(5000);
    let tg: any = await b.send('Target.getTargets');
    const dt = tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    out.devtoolsFound = !!dt;
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    const ev = async (sid: string, expr: string) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 200) };
      return r.result.value;
    };
    await b.send('Page.enable', {}, dsid).catch(() => {});
    out.devtoolsViewport = await ev(dsid, '({w:innerWidth,h:innerHeight})');
    out.scan1 = await ev(dsid, SCAN);
    const tabs: any[] = (out.scan1 && out.scan1.tabs) || [];
    const mine = tabs.find((t) => /OB-Recover/i.test(t.label) && t.w > 0 && t.h > 0);
    out.tabFound = mine || null;
    if (mine) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await b.send('Input.dispatchMouseEvent', { type, x: mine.x, y: mine.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 }, dsid);
      }
      await sleep(3000);
    }
    tg = await b.send('Target.getTargets');
    out.targetsAfter = tg.targetInfos.map((t: any) => ({ type: t.type, url: String(t.url).slice(0, 120) }));
    const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
    out.panelTargetFound = !!pt;
    if (pt) {
      const psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
      out.panelEnv = await ev(psid, EXPR);
    }
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out).slice(0, 6000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
