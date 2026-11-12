import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const OUT = ROOT + '/test/acceptance/devtools-validation-e2e.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9467;
const HTTP = 8777;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-validation-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);

// 三个解码器：稳定 / 数组旋转 / 状态依赖。调用都在 run() 里，run() 在脚本加载时立即执行
const VAL_JS = [
  `var _arrS=['alpha','beta','gamma','delta','epsilon'];`,
  `function decStable(i){i=i-0x100;return _arrS[i];}`,
  `var _arrR=['red','green','blue','cyan','pink'];`,
  `function decRot(i){i=i-0x100;return _arrR[i];}`,
  `function rotate(){_arrR.push(_arrR.shift());}`,
  `var _cnt=0;`,
  `var _arrC=['c0','c1','c2','c3','c4'];`,
  `function decCount(i){i=i-0x100;_cnt++;return _arrC[i]+_cnt;}`,
  `function run(){`,
  `  var out=[];`,
  `  out.push(decStable(256));`,
  `  out.push(decStable(256));`,
  `  out.push(decStable(257));`,
  `  out.push(decStable(257));`,
  `  out.push(decRot(256));`,
  `  rotate();`,
  `  out.push(decRot(256));`,
  `  out.push(decCount(256));`,
  `  out.push(decCount(256));`,
  `  window.__valResult=out;`,
  `  document.title='done';`,
  `}`,
  `run();`,
].join(NL);
const VAL_HTML = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>val-test</title></head><body><script src='/val.js'></script></body></html>`;

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const SELECTED = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();return iv.tabbedPane.selectedTabId})()`;
const PANEL = `(function(){var cards=[].slice.call(document.querySelectorAll('#cap-list .decoder-card'));return {cards:cards.length,status:document.getElementById('cap-status').textContent,hits:document.getElementById('cap-hits').textContent,success:document.getElementById('cap-success').textContent,verified:document.getElementById('cap-verified').textContent,vUnstable:document.getElementById('cap-v-unstable').textContent,vFailed:document.getElementById('cap-v-failed').textContent,vInsufficient:document.getElementById('cap-v-insufficient').textContent,vPending:document.getElementById('cap-v-pending').textContent,vTotal:document.getElementById('cap-v-total').textContent,hint:document.getElementById('cap-hint').textContent,engineUnstable:document.getElementById('cap-unstable').textContent,items:cards.map(function(c){var b=c.querySelector('.decoder-card-body');var s=c.querySelector('.cap-summary');var n=c.querySelector('.decoder-name');return {name:n?n.textContent:'',badges:[].map.call(c.querySelectorAll('.decoder-badge'),function(x){return x.textContent}),summary:s?s.textContent:'',body:b?b.textContent.replace(/\s+/g,' ').slice(0,1100):null}})}})()`;
const DRYRUN = `(function(){var d=document.getElementById('cap-dryrun');return {hidden:d.hidden,text:d.textContent}})()`;
const DECODERS = `(function(){return {candidates:document.getElementById('dec-candidates').textContent,high:document.getElementById('dec-high').textContent,names:[].map.call(document.querySelectorAll('#decoder-list .decoder-card'),function(c){var n=c.querySelector('.decoder-name');var b=c.querySelector('.decoder-badge');return (n?n.textContent:'')+':'+(b?b.textContent:'')})}})()`;
const EXPAND = `(function(){var c=document.querySelector('#cap-list .decoder-card');if(!c)return {skipped:'no cards'};c.querySelector('.decoder-card-header').click();var b=c.querySelector('.decoder-card-body');return {open:c.classList.contains('open'),display:getComputedStyle(b).display,h:Math.round(b.getBoundingClientRect().height)}})()`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === 'val.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(VAL_HTML); return; }
  if (name === 'val.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(VAL_JS); return; }
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
  const out: any = { note: 'Phase 3.2 end-to-end: real DevTools frontend (headless Chrome) + real panel.html + real service worker + real chrome.debugger. Panel shown by InspectorView.showPanel and buttons by element.click() (programmatic, NOT manual mouse). Engine state read through the SW test hook. Page is a purpose-built test page, not a real website.', steps: {} };
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
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/val.html' });
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
      return ev(ssid, `(function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var s=t.getCaptureState(${tabRes});if(!s)return {hook:true,state:null};return {hook:true,active:s.active,breakpoints:s.breakpoints,stats:s.stats,captures:s.captures.map(function(c){return {fn:c.functionName,script:c.scriptId,status:c.captureStatus,count:c.count,args:c.arguments.map(function(a){return String(a.value)}),ret:c.returnValue?String(c.returnValue.value):null,locs:(c.callLocations||[]).map(function(p){return (p.lineNumber+1)+':'+p.columnNumber}),trunc:!!c.callLocationsTruncated}})}})()`);
    };

    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;

    await step('show', async () => ev(dsid, SHOW, true));
    await sleep(2500);
    const psid = await findPanel();
    if (!psid) throw new Error('panel iframe not found');
    const click = (id: string) => ev(psid, `document.getElementById('${id}').click();1`, false, true);
    const reshow = async () => { await ev(dsid, SHOW, true); await sleep(1500); };

    await step('reload', async () => { await b.send('Page.reload', {}, pageSid); await sleep(4000); return ev(psid, `({scripts:document.querySelectorAll('#script-list li').length})`); });
    await step('connect', async () => { await click('btn-rt-connect'); await sleep(2500); return ev(psid, `document.getElementById('rt-debugger-status').textContent`); });
    await step('discovery', async () => ev(psid, DECODERS));

    // ── 第一轮：开始捕获 → 刷新页面 → 页面脚本执行 ──
    await step('startCaptureAndReload', async () => {
      await ev(psid, `document.querySelector('.dock-tab[data-pane="capture"]').click();1`, false, true);
      await sleep(400);
      await click('btn-cap-start');
      await sleep(600);
      await b.send('Page.reload', {}, pageSid);
      await sleep(8000);
      return { selectedTabAfterCapture: await ev(dsid, SELECTED, true), engine: await engineState(psid) };
    });
    await step('groundTruthFromPage', async () => ev(pageSid, `JSON.stringify(window.__valResult)`));
    await step('panelWhileHidden', async () => ev(psid, PANEL));
    await step('reshowPanel', async () => { await reshow(); return ev(psid, PANEL); });
    await step('dryRunRound1', async () => { await click('btn-cap-dryrun'); await sleep(500); return ev(psid, DRYRUN); });
    await step('expandFirstCard', async () => { const r = await ev(psid, EXPAND); await sleep(400); return { r, after: await ev(psid, EXPAND) }; });

    // ── 第二轮：捕获仍在进行时再刷新一次，检查旧脚本的记录是否被隔离 ──
    await step('reloadAgainWhileCapturing', async () => {
      await b.send('Page.reload', {}, pageSid);
      await sleep(8000);
      return { selectedTab: await ev(dsid, SELECTED, true), engine: await engineState(psid) };
    });
    await step('reshowPanelRound2', async () => { await reshow(); return ev(psid, PANEL); });
    await step('dryRunRound2', async () => { await click('btn-cap-dryrun'); await sleep(500); return ev(psid, DRYRUN); });

    await step('stopCapture', async () => { await click('btn-cap-stop'); await sleep(1500); return ev(psid, PANEL); });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log('done fatal=' + (out.fatal ?? 'none') + ' steps=' + Object.keys(out.steps).length);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
