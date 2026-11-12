import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const SHOTS = ROOT + '/test/acceptance/layout-screens';
const OUT = ROOT + '/test/acceptance/devtools-real-3.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9463;
const HTTP = 8773;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-real3-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SHOW = `(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);r.selected=iv.tabbedPane.selectedTabId}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()`;
const DOCK = `(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var dc=m.DockController.DockController.instance();dc.setDockSide('bottom');r.side=dc.dockSide()}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()`;
const RECTS = `(function(){function R(id){var e=document.getElementById(id);if(!e)return null;var b=e.getBoundingClientRect();return {l:Math.round(b.left),t:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),r:Math.round(b.right),b:Math.round(b.bottom)}}var o=document.getElementById('code-original');var cp=document.getElementById('code-panels');return {vw:innerWidth,vh:innerHeight,sidebar:R('sidebar'),handle: R('resize-sidebar'),panelsHandle:R('resize-panels'),dock:R('dock'),dockResize:R('resize-dock'),orig:R('panel-original'),rec:R('panel-recovered'),editors:R('editors'),code:{vbar:o.offsetWidth-o.clientWidth,hbar:o.offsetHeight-o.clientHeight,sh:o.scrollHeight,ch:o.clientHeight,sw:o.scrollWidth,cw:o.clientWidth},dockOpen:document.getElementById('dock').dataset.open,layout:cp.dataset.layout}})()`;
const CLICK = (id: string) => `document.getElementById('${id}').click();1`;
const WRITE = `navigator.clipboard.writeText('__probe__').then(function(){return 'ok'},function(e){return 'err ' + String(e)})`;
const CAPS = `(function(){var cards=document.querySelectorAll('#cap-list .decoder-card');var first=cards[0];var body=first?first.querySelector('.decoder-card-body'):null;return {cards:cards.length,firstOpen:first?first.classList.contains('open'):null,bodyH:body?Math.round(body.getBoundingClientRect().height):null,status:document.getElementById('cap-status').textContent,hits:document.getElementById('cap-hits').textContent}})()`;
const sampler = (b64: string, rects: any[]) => `(async function(){var img=new Image();img.src='data:image/png;base64,${b64}';await img.decode();var cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;var cx=cv.getContext('2d');cx.drawImage(img,0,0);var out=[];(${JSON.stringify(rects)}).forEach(function(q){var d=cx.getImageData(q.x,q.y,q.w,q.h).data;var n=d.length/4,w=0;for(var i=0;i<d.length;i+=4){if(Math.min(d[i],d[i+1],d[i+2])>=200)w++}out.push({name:q.name,px:n,nearWhite:w})});return {imgW:img.width,imgH:img.height,blocks:out}})()`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  try {
    const body = readFileSync(ROOT + '/test-pages/' + name);
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
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
  mkdirSync(SHOTS, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'real DevTools frontend + real panel.html iframe + real background. Panel shown via InspectorView.showPanel (programmatic). Drags use CDP Input.dispatchMouseEvent on the panel iframe (real mouse input events). Buttons use element.click() with userGesture. NOT a human-operated DevTools panel.', steps: {} };
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
    const pageSid = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const ev = async (sid: string, expr: string, awaitPromise = false, userGesture = false) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    const findPanel = async () => {
      const tg: any = await b.send('Target.getTargets');
      const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
      return pt ? (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId : '';
    };
    const step = async (name: string, fn: () => Promise<any>) => {
      try { out.steps[name] = await fn(); } catch (e: any) { out.steps[name] = { error: String(e && e.message ? e.message : e) }; }
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };
    const drag = async (sid: string, from: any, to: { x: number; y: number }) => {
      const sx = Math.round(from.l + from.w / 2);
      const sy = Math.round(from.t + from.h / 2);
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy, button: 'none' }, sid);
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', clickCount: 1 }, sid);
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(sx + ((to.x - sx) * i) / steps), y: Math.round(sy + ((to.y - sy) * i) / steps), button: 'left', buttons: 1 }, sid);
        await sleep(80);
      }
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }, sid);
      await sleep(400);
    };

    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    await step('show', async () => ev(dsid, SHOW, true));
    await sleep(2500);
    let psid = await findPanel();
    if (!psid) throw new Error('panel iframe not found');
    await step('dockBottom', async () => ev(dsid, DOCK, true));
    await sleep(2500);
    psid = await findPanel();
    await b.send('Page.enable', {}, psid).catch(() => {});
    await step('rectsBefore', async () => ev(psid, RECTS));

    await step('clipWrite', async () => ev(psid, WRITE, true, true));

    await step('dragSidebar', async () => {
      const before: any = await ev(psid, RECTS);
      if (!before.handle || before.handle.w === 0) return { skipped: 'sidebar handle not visible', before };
      await drag(psid, before.handle, { x: before.handle.l + 100, y: before.handle.t + before.handle.h / 2 });
      const after: any = await ev(psid, RECTS);
      return { beforeW: before.sidebar.w, afterW: after.sidebar.w };
    });
    await step('dragPanels', async () => {
      const before: any = await ev(psid, RECTS);
      if (!before.panelsHandle || before.panelsHandle.w === 0) return { skipped: 'panel handle not visible', before };
      await drag(psid, before.panelsHandle, { x: before.panelsHandle.l - 160, y: before.panelsHandle.t + before.panelsHandle.h / 2 });
      const after: any = await ev(psid, RECTS);
      return { beforeOrig: before.orig.w, afterOrig: after.orig.w, beforeRec: before.rec.w, afterRec: after.rec.w };
    });
    await step('dragDock', async () => {
      await ev(psid, CLICK('btn-rt-details'));
      await sleep(400);
      const before: any = await ev(psid, RECTS);
      if (!before.dockResize || before.dockResize.h === 0) return { skipped: 'dock resize handle not visible', before };
      await drag(psid, before.dockResize, { x: before.dockResize.l + 40, y: before.dockResize.t - 60 });
      const after: any = await ev(psid, RECTS);
      return { beforeDockH: before.dock.h, afterDockH: after.dock.h };
    });

    await step('pixelSample', async () => {
      const m: any = await ev(psid, RECTS);
      const o: any = m.code;
      if (!(o.vbar > 0 && o.hbar > 0)) return { skipped: 'no both scrollbars', vbar: o.vbar, hbar: o.hbar, panel: { w: m.vw, h: m.vh } };
      const x = m.orig.l + m.orig.w - o.vbar;
      const y = m.orig.t + m.orig.h - o.hbar;
      const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, psid);
      writeFileSync(SHOTS + '/real-panel-corner.png', Buffer.from(shot.data, 'base64'));
      const rect = [{ name: 'real-corner', x: x + 1, y: y + 1, w: o.vbar - 2, h: o.hbar - 2 }];
      return { panel: { w: m.vw, h: m.vh }, vbar: o.vbar, hbar: o.hbar, sample: await ev(psid, sampler(shot.data, rect), true) };
    });

    await step('reloadPage', async () => { await b.send('Page.reload', {}, pageSid); await sleep(5000); return ev(psid, `({scripts:document.querySelectorAll('#script-list li').length,status:document.getElementById('status').textContent})`); });
    await step('connect', async () => { await ev(psid, CLICK('btn-rt-connect')); await sleep(3000); return ev(psid, `document.getElementById('rt-debugger-status').textContent`); });
    await step('startCapture', async () => {
      await ev(psid, CLICK('btn-rt-details'));
      await sleep(300);
      await ev(psid, `document.querySelector('.dock-tab[data-pane="capture"]').click();1`);
      await sleep(300);
      await ev(psid, CLICK('btn-cap-start'));
      await sleep(500);
      await b.send('Page.reload', {}, pageSid);
      await sleep(8000);
      return ev(psid, CAPS);
    });
    await step('expandCard', async () => {
      const before: any = await ev(psid, CAPS);
      if (!before.cards) return { skipped: 'no capture cards', before };
      await ev(psid, `document.querySelector('#cap-list .decoder-card .decoder-card-header').click();1`, false, true);
      await sleep(500);
      const after: any = await ev(psid, CAPS);
      return { before, after };
    });
    await step('screenshotPanel', async () => {
      const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, psid);
      writeFileSync(SHOTS + '/real-panel-capture.png', Buffer.from(shot.data, 'base64'));
      return { bytes: shot.data.length };
    });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out).slice(0, 7000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
