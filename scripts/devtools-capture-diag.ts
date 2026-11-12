import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const OUT = ROOT + '/test/acceptance/devtools-capture-diag.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9466;
const HTTP = 8776;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-capture-diag-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);

// 一个真正的 OB 样本：字符串数组 + 解码器，让 Decoder Discovery 能识别出候选
const OB_JS = [
  `var _0xarr=['Y29uc29sZQ==','bG9n','SGVsbG8gV29ybGQ=','dG9TdHJpbmc=','cmV0dXJu'];`,
  `(function(_0x1234,_0x5678){var _0xshift=function(_0xcount){while(--_0xcount){_0x1234['push'](_0x1234['shift']());}};_0xshift(++_0x5678);}(_0xarr,0x1a4));`,
  `function _0x29ae5c(_0xidx,_0xkey){_0xidx=_0xidx-0x0;var _0xval=_0xarr[_0xidx];var _0xdecoded=atob(_0xval);return _0xdecoded;}`,
  `var _0x27a7e9={};`,
  `_0x27a7e9[_0x29ae5c(0)]=function(_0xmsg){console[_0x29ae5c(1)](_0xmsg);};`,
  `_0x27a7e9[_0x29ae5c(0)](_0x29ae5c(2));`,
  `_0x29ae5c(1);_0x29ae5c(2);_0x29ae5c(3);_0x29ae5c(4);`,
].join(NL);
const OB_HTML = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>ob-test</title></head><body><script src='/ob.js'></script></body></html>`;

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const RAF = `new Promise(function(res){var done=false;var t=setTimeout(function(){if(!done)res('timeout')},2000);requestAnimationFrame(function(){done=true;clearTimeout(t);res('fired')})})`;
// 面板自身状态：DOM 卡片数 + 内部 capTable/capRenderQueued（未导出，用 DOM 与统计值推断）
const PANEL_STATE = `(function(){return {cards:document.querySelectorAll('#cap-list .decoder-card').length,empty:!!document.querySelector('#cap-list .empty-state'),hits:document.getElementById('cap-hits').textContent,success:document.getElementById('cap-success').textContent,failed:document.getElementById('cap-failed').textContent,status:document.getElementById('cap-status').textContent}})()`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === 'ob.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(OB_HTML); return; }
  if (name === 'ob.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(OB_JS); return; }
  res.writeHead(404); res.end('nf');
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
  const out: any = { note: 'DIAGNOSIS: data-link vs render. Real DevTools frontend + real panel iframe + real SW. Compares engine captures (via SW test hook) with panel DOM at each stage.', steps: {} };
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
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/ob.html' });
    await sleep(1500);
    const pageSid = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const ev = async (sid: string, expr: string, awaitPromise = false, userGesture = false) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    const step = async (name: string, fn: () => Promise<any>) => {
      try { out.steps[name] = await fn(); } catch (e: any) { out.steps[name] = { error: String(e && e.message ? e.message : e) }; }
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };
    const findPanel = async () => {
      const tg: any = await b.send('Target.getTargets');
      const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
      return pt ? (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId : '';
    };
    const engineState = async (psid: string) => {
      const tg: any = await b.send('Target.getTargets');
      const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id + '/background.js'));
      if (!sw) return { error: 'SW not found' };
      const ssid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
      const tabRes: any = await ev(psid, `chrome.devtools.inspectedWindow.tabId`);
      return ev(ssid, `(function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var s=t.getCaptureState(${tabRes});return s?{hook:true,active:s.active,breakpoints:s.breakpoints,captures:s.captures.length,stats:s.stats,first:s.captures[0]?{name:s.captures[0].functionName,status:s.captures[0].captureStatus,count:s.captures[0].count,args:s.captures[0].arguments.map(function(a){return a.type+':'+String(a.value).slice(0,40)}),ret:s.captures[0].returnValue?String(s.captures[0].returnValue.value).slice(0,40):null}:null}:{hook:true,state:null}})()`);
    };

    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;

    await step('show', async () => ev(dsid, SHOW, true));
    await sleep(2500);
    let psid = await findPanel();
    if (!psid) throw new Error('panel iframe not found');

    await step('rafBaseline', async () => ev(psid, RAF, true));
    await step('reload', async () => { await b.send('Page.reload', {}, pageSid); await sleep(4000); return ev(psid, `({scripts:document.querySelectorAll('#script-list li').length,decoders:document.querySelectorAll('#decoder-list .decoder-card').length})`); });
    await step('connect', async () => { await ev(psid, `document.getElementById('btn-rt-connect').click();1`, false, true); await sleep(2500); return ev(psid, `document.getElementById('rt-debugger-status').textContent`); });
    await step('decodersBeforeCapture', async () => ev(psid, `({cards:document.querySelectorAll('#decoder-list .decoder-card').length,analyzed:document.getElementById('dec-analyzed').textContent,candidates:document.getElementById('dec-candidates').textContent,calls:document.getElementById('dec-calls').textContent})`));

    await step('startCaptureAndReload', async () => {
      await ev(psid, `document.querySelector('.dock-tab[data-pane="capture"]').click();1`, false, true);
      await sleep(400);
      await ev(psid, `document.getElementById('btn-cap-start').click();1`, false, true);
      await sleep(600);
      const started = await ev(psid, PANEL_STATE);
      await b.send('Page.reload', {}, pageSid);
      await sleep(8000);
      return { started, panelAfter: await ev(psid, PANEL_STATE), engine: await engineState(psid) };
    });

    await step('rafAfterCapture', async () => ev(psid, RAF, true));
    await step('panelStateAfterCapture', async () => ev(psid, PANEL_STATE));
    await step('engineStateAfterCapture', async () => engineState(psid));
    // 强制渲染判定：手动调用一次 rAF 回调，看卡片是否出现（区分“数据没到”与“渲染没跑”）
    await step('frontendSelectedTab', async () => ev(dsid, `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();return {selected:iv.tabbedPane.selectedTabId}})()`, true));
    await step('afterReshow', async () => {
      await ev(dsid, SHOW, true);
      await sleep(1500);
      const vis = await ev(psid, `({vis:document.visibilityState,focus:document.hasFocus()})`);
      const raf = await ev(psid, RAF, true);
      return { vis, raf, panel: await ev(psid, PANEL_STATE), engine: await engineState(psid) };
    });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out).slice(0, 8000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
