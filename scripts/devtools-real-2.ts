import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const OUT = ROOT + '/test/acceptance/devtools-real-2.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9462;
const HTTP = 8772;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-real2-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);
const CTX_JS = [
  `function _0xabc(i){return 'val'+i;}`,
  `var r1=_0xabc(1);`,
  `var r2=_0xabc(2);`,
  `var r3=_0xabc(1);`,
  `console.log(r1,r2,r3,'padding so this script is longer than one hundred bytes and the panel keeps it');`,
].join(NL);
const CTX_HTML = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>ctx-test</title></head><body><script src='/ctx-test.js'></script></body></html>`;

const SHOW = `(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);r.selected=iv.tabbedPane.selectedTabId}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()`;
const DOCK = `(async function(){var r={};try{var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var dc=m.DockController.DockController.instance();r.before=dc.dockSide();dc.setDockSide('bottom');r.after=dc.dockSide()}catch(e){r.err=String(e&&e.message?e.message:e)}return r})()`;
const READ_ENV = `(function(){var a=document.getElementById('app');var cp=document.getElementById('code-panels');var s=document.getElementById('status');return {w:innerWidth,h:innerHeight,size:a.dataset.size,sidebar:a.dataset.sidebar,layout:cp.dataset.layout,scripts:document.querySelectorAll('#script-list li').length,status:s.textContent,statusTitle:s.title,dbg:document.getElementById('rt-debugger-status').textContent}})()`;
const CLIP = `navigator.clipboard.readText().then(function(t){return {len:t.length,text:t.slice(0,600)}},function(e){return {err:String(e)}})`;
const SEL = `(function(){var rows=document.querySelectorAll('#code-original .line-code');var td=null;for(var i=0;i<rows.length;i++){var tx=rows[i].textContent;if(tx.indexOf('_0xabc(1)')>=0&&tx.indexOf('function')<0){td=rows[i];break}}if(!td)return {err:'row not found',rows:rows.length};var w=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);var n;while((n=w.nextNode())){var k=n.textContent.indexOf('_0xabc(1)');if(k>=0){var r=document.createRange();r.setStart(n,k);r.setEnd(n,k+9);var s=window.getSelection();s.removeAllRanges();s.addRange(r);var b=td.getBoundingClientRect();td.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:Math.round(b.left+20),clientY:Math.round(b.top+5)}));return {selected:s.toString(),menuVisible:document.getElementById('context-menu').classList.contains('visible')}}}return {err:'text node not found'}})()`;
const TIP = `(function(){var t=document.getElementById('eval-tooltip');return {visible:t.classList.contains('visible'),text:t.textContent.slice(0,300),hasAdd:!!document.getElementById('eval-add')}})()`;
const REC = `(function(){var t=document.getElementById('code-recovered').textContent;var c=function(s){return t.split(s).length-1};return {call:c('_0xabc(1)'),call2:c('_0xabc(2)'),val1:c(String.fromCharCode(39)+'val1'+String.fromCharCode(39)),val1dq:c(String.fromCharCode(34)+'val1'+String.fromCharCode(34)),origCall:document.getElementById('code-original').textContent.split('_0xabc(1)').length-1,status:document.getElementById('status').textContent}})()`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === 'ctx-test.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(CTX_HTML); return; }
  if (name === 'ctx-test.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(CTX_JS); return; }
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
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'real DevTools frontend + real panel.html iframe. Panel switched by InspectorView.showPanel (programmatic). Clicks are element.click() with userGesture; contextmenu is a dispatched DOM event, NOT real mouse input. Scripts reach the panel through the real chrome.devtools.network listener after a real page reload.', steps: {} };
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
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/ctx-test.html' });
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
      if (!pt) return '';
      return (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    };
    const step = async (name: string, fn: () => Promise<any>) => {
      try { out.steps[name] = await fn(); } catch (e: any) { out.steps[name] = { error: String(e && e.message ? e.message : e) }; }
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };
    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    const click = (sid: string, id: string) => ev(sid, `document.getElementById('${id}').click();1`, false, true);

    await step('show', async () => ev(dsid, SHOW, true));
    await sleep(2500);
    let psid = await findPanel();
    if (!psid) throw new Error('panel iframe target not found');
    await step('envBeforeDock', async () => ev(psid, READ_ENV));
    await step('dock', async () => ev(dsid, DOCK, true));
    await sleep(3000);
    psid = await findPanel();
    await step('envAfterDock', async () => ev(psid, READ_ENV));

    await step('reload', async () => { await b.send('Page.reload', {}, pageSid); await sleep(4000); return ev(psid, READ_ENV); });
    await step('recover', async () => {
      await click(psid, 'btn-recover');
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) { const s: any = await ev(psid, READ_ENV); if (s && typeof s.status === 'string' && /完成|失败/.test(s.status)) return s; await sleep(300); }
      return { timeout: true, env: await ev(psid, READ_ENV) };
    });
    await step('statusTitle', async () => ev(psid, `(function(){var s=document.getElementById('status');return {text:s.textContent,title:s.title,equal:s.textContent.trim()===s.title}})()`));

    await step('grantClipboard', async () => { try { return await b.send('Browser.grantPermissions', { origin: 'chrome-extension://' + load.id, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }); } catch (e: any) { return { error: String(e && e.message ? e.message : e) }; } });
    await step('clipOriginal', async () => {
      await ev(psid, `navigator.clipboard.writeText('__sentinel__').catch(function(){})`, true, true);
      await click(psid, 'btn-copy-original');
      await sleep(800);
      const r: any = await ev(psid, CLIP, true, true);
      return { read: r, equalsSource: !!(r && r.text === CTX_JS), expectedLen: CTX_JS.length };
    });
    await step('clipRecovered', async () => {
      await ev(psid, `navigator.clipboard.writeText('__sentinel__').catch(function(){})`, true, true);
      await click(psid, 'btn-copy-recovered');
      await sleep(800);
      const r: any = await ev(psid, CLIP, true, true);
      return { read: r, notSentinel: !!(r && r.text && r.text !== '__sentinel__') };
    });

    await step('ctxSelect', async () => ev(psid, SEL, false, true));
    await step('ctxEval', async () => {
      await click(psid, 'ctx-eval');
      await sleep(2000);
      return ev(psid, TIP);
    });
    await step('recBeforeAdd', async () => ev(psid, REC));
    await step('ctxAddMapping', async () => {
      await click(psid, 'eval-add');
      await sleep(3000);
      return ev(psid, REC);
    });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out).slice(0, 6000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
