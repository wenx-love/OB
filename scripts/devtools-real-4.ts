import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const SHOTS = ROOT + '/test/acceptance/layout-screens';
const OUT = ROOT + '/test/acceptance/devtools-real-4.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9464;
const HTTP = 8774;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-real4-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);

function bigJs(): string {
  const arr = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
  const lines = ["var _arr=['" + arr.join("','") + "'];", 'function decOne(i){i=i-0x100;return _arr[i];}'];
  for (let i = 0; i < 220; i++) lines.push('var v' + i + '=decOne(0x100+' + (i % 10) + ")+'__" + i + "__' + '" + 'x'.repeat(70) + "';" );
  lines.push('console.log(decOne(0x100));');
  return lines.join(NL);
}
const BIG_HTML = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>big-test</title></head><body><script src='/big.js'></script></body></html>`;

const SHOW = `(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);r.selected=iv.tabbedPane.selectedTabId}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()`;
const RECTS = `(function(){function R(id){var e=document.getElementById(id);if(!e)return null;var b=e.getBoundingClientRect();return {l:Math.round(b.left),t:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),r:Math.round(b.right),b:Math.round(b.bottom)}}var o=document.getElementById('code-original');return {vw:innerWidth,vh:innerHeight,orig:R('panel-original'),code:{vbar:o.offsetWidth-o.clientWidth,hbar:o.offsetHeight-o.clientHeight,ch:o.clientHeight,sh:o.scrollHeight,cw:o.clientWidth,sw:o.scrollWidth}}})()`;
const CROP = `(function(){var out=[];function walk(root,d){if(d>14)return;root.querySelectorAll('iframe').forEach(function(e){var src=e.getAttribute('src')||'';if(src.indexOf('panel.html')>=0){var b=e.getBoundingClientRect();out.push({src:src,l:Math.round(b.left),t:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)})}if(e.shadowRoot)walk(e.shadowRoot,d+1)});root.querySelectorAll('*').forEach(function(e){if(e.shadowRoot)walk(e.shadowRoot,d+1)})}walk(document,0);return out})()`;
const CAPS = `(function(){var cards=document.querySelectorAll('#cap-list .decoder-card');var first=cards[0];var body=first?first.querySelector('.decoder-card-body'):null;return {cards:cards.length,firstOpen:first?first.classList.contains('open'):null,bodyH:body?Math.round(body.getBoundingClientRect().height):null,bodyDisplay:body?getComputedStyle(body).display:null,bodyChildren:body?body.children.length:null,dockOpen:document.getElementById('dock').dataset.open,dockPane:document.getElementById('dock').dataset.pane,dockBodyH:Math.round(document.querySelector('#dock .dock-body').getBoundingClientRect().height),listH:Math.round(document.getElementById('cap-list').getBoundingClientRect().height),status:document.getElementById('cap-status').textContent,hits:document.getElementById('cap-hits').textContent,success:document.getElementById('cap-success').textContent,failed:document.getElementById('cap-failed').textContent,notice:(function(){var n=document.getElementById('cap-notice');return n.hidden?'':n.textContent})()}})()`;
const sampler = (b64: string, rects: any[]) => `(async function(){var img=new Image();img.src='data:image/png;base64,${b64}';await img.decode();var cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;var cx=cv.getContext('2d');cx.drawImage(img,0,0);var out=[];(${JSON.stringify(rects)}).forEach(function(q){var d=cx.getImageData(q.x,q.y,q.w,q.h).data;var n=d.length/4,w=0,mn=255;for(var i=0;i<d.length;i+=4){var m=Math.min(d[i],d[i+1],d[i+2]);if(m>=200)w++;if(m<mn)mn=m}out.push({name:q.name,px:n,nearWhite:w,min:mn})});return {imgW:img.width,imgH:img.height,blocks:out}})()`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === 'big.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(BIG_HTML); return; }
  if (name === 'big.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(bigJs()); return; }
  res.writeHead(404);
  res.end('nf');
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
  const out: any = { note: 'real DevTools frontend + real panel.html iframe + real background. Panel shown via InspectorView.showPanel (programmatic). Buttons via element.click(); screenshots from the top-level DevTools frontend, cropped to the panel iframe rect.', steps: {} };
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
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/big.html' });
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

    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    await step('show', async () => ev(dsid, SHOW, true));
    await sleep(2500);
    let psid = await findPanel();
    if (!psid) throw new Error('panel iframe not found');
    await b.send('Page.enable', {}, dsid).catch(() => {});
    await step('reload', async () => { await b.send('Page.reload', {}, pageSid); await sleep(4000); return ev(psid, `({scripts:document.querySelectorAll('#script-list li').length,status:document.getElementById('status').textContent,w:innerWidth,h:innerHeight})`); });
    await step('recover', async () => {
      await ev(psid, `document.getElementById('btn-recover').click();1`, false, true);
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) { const s: any = await ev(psid, `document.getElementById('status').textContent`); if (typeof s === 'string' && /完成|失败/.test(s)) return s; await sleep(300); }
      return { timeout: true };
    });
    await step('rects', async () => ev(psid, RECTS));
    await step('pixelSample', async () => {
      const m: any = await ev(psid, RECTS);
      if (m.code.vbar <= 0 || m.code.hbar <= 0) return { skipped: 'no both scrollbars', code: m.code };
      const panels: any[] = await ev(dsid, CROP);
      const p = panels[0];
      if (!p) return { skipped: 'panel iframe rect not found in frontend DOM', panels };
      const cx = p.l + m.orig.r - m.code.vbar;
      const cy = p.t + m.orig.b - m.code.hbar;
      const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, dsid);
      writeFileSync(SHOTS + '/real-panel-frontend.png', Buffer.from(shot.data, 'base64'));
      const sample = await ev(dsid, sampler(shot.data, [{ name: 'panel-corner', x: cx + 1, y: cy + 1, w: m.code.vbar - 2, h: m.code.hbar - 2 }]), true);
      return { panel: { w: m.vw, h: m.vh }, iframe: p, code: m.code, sample };
    });

    await step('connect', async () => { await ev(psid, `document.getElementById('btn-rt-connect').click();1`, false, true); await sleep(3000); return ev(psid, `document.getElementById('rt-debugger-status').textContent`); });
    await step('startCapture', async () => {
      await ev(psid, `document.querySelector('.dock-tab[data-pane="capture"]').click();1`, false, true);
      await sleep(400);
      await ev(psid, `document.getElementById('btn-cap-start').click();1`, false, true);
      await sleep(500);
      await b.send('Page.reload', {}, pageSid);
      await sleep(8000);
      return ev(psid, CAPS);
    });
    await step('bringToFront', async () => {
      try { await b.send('Target.activateTarget', { targetId: dt.targetId }); } catch { /* ignore */ }
      try { await b.send('Page.bringToFront', {}, dsid); } catch { /* ignore */ }
      await sleep(3000);
      return ev(psid, CAPS);
    });
    await step('expandCard', async () => {
      const before: any = await ev(psid, CAPS);
      if (!before.cards) return { skipped: 'no capture cards', before };
      await ev(psid, `document.querySelector('#cap-list .decoder-card .decoder-card-header').click();1`, false, true);
      await sleep(600);
      const after: any = await ev(psid, CAPS);
      return { before, after };
    });
    await step('dockChain', async () => ev(psid, `(function(){var out=[];var e=document.getElementById('cap-list');while(e&&out.length<12){var cs=getComputedStyle(e);var b=e.getBoundingClientRect();out.push({id:e.id,cls:String(e.className).slice(0,40),hidden:e.hidden,display:cs.display,pos:cs.position,flex:cs.flex,h:Math.round(b.height),minH:cs.minHeight,maxH:cs.maxHeight,ov:cs.overflowY});e=e.parentElement}var a=document.getElementById('app');return {app:{size:a.dataset.size,short:a.dataset.short,clientH:a.clientHeight,innerH:innerHeight},chain:out}})()`));
    await step('screenshotFrontend', async () => {
      const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, dsid);
      writeFileSync(SHOTS + '/real-panel-frontend-capture.png', Buffer.from(shot.data, 'base64'));
      return { bytes: shot.data.length };
    });
    await step('frontendSelectedTab', async () => ev(dsid, `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();return {selected:iv.tabbedPane.selectedTabId}})()`, true));
    await step('reshowPanel', async () => {
      await ev(dsid, SHOW, true);
      await sleep(1500);
      const raf = await ev(psid, `new Promise(function(res){var t=setTimeout(function(){res('timeout')},2000);requestAnimationFrame(function(){clearTimeout(t);res('fired')})})`, true);
      return { raf, caps: await ev(psid, CAPS) };
    });
    await step('expandAfterReshow', async () => {
      const before: any = await ev(psid, CAPS);
      await ev(psid, `document.querySelector('#cap-list .decoder-card .decoder-card-header').click();1`, false, true);
      await sleep(600);
      return { before, after: await ev(psid, CAPS) };
    });
    await step('screenshotReshown', async () => {
      const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, dsid);
      writeFileSync(SHOTS + '/real-panel-frontend-capture-reshown.png', Buffer.from(shot.data, 'base64'));
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
