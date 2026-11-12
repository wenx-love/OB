import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const OUT = ROOT + '/test/acceptance/devtools-real-5.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9465;
const HTTP = 8775;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-real5-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);

function bigJs(): string {
  const arr = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
  const lines = ["var _arr=['" + arr.join("','") + "'];", 'function decOne(i){i=i-0x100;return _arr[i];}'];
  for (let i = 0; i < 60; i++) lines.push('var v' + i + '=decOne(0x100+' + (i % 10) + ")+'__" + i + "__';");
  lines.push('console.log(decOne(0x100));');
  return lines.join(NL);
}
const BIG_HTML = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>big-test</title></head><body><script src='/big.js'></script></body></html>`;

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const RAF = `new Promise(function(res){var done=false;var t=setTimeout(function(){if(!done)res('timeout')},2000);requestAnimationFrame(function(){done=true;clearTimeout(t);res('fired')})})`;
const CAPS = `({cards:document.querySelectorAll('#cap-list .decoder-card').length,status:document.getElementById('cap-status').textContent,hits:document.getElementById('cap-hits').textContent,success:document.getElementById('cap-success').textContent,failed:document.getElementById('cap-failed').textContent,tabId:(function(){try{return chrome.devtools.inspectedWindow.tabId}catch(e){return 'ERR'}})()})`;

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === 'big.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(BIG_HTML); return; }
  if (name === 'big.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(bigJs()); return; }
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
  const out: any = { note: 'diagnosis: is the empty capture list caused by rAF not firing, or by an empty captures[] in capture-state? Reads engine state through the extension SW test hook.', steps: {} };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
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
    const step = async (name: string, fn: () => Promise<any>) => {
      try { out.steps[name] = await fn(); } catch (e: any) { out.steps[name] = { error: String(e && e.message ? e.message : e) }; }
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };
    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    await step('show', async () => ev(dsid, SHOW, true));
    await sleep(2500);
    const tg1: any = await b.send('Target.getTargets');
    const pt = tg1.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
    if (!pt) throw new Error('panel iframe not found');
    const psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    await step('raf', async () => ev(psid, RAF, true));
    await step('reload', async () => { await b.send('Page.reload', {}, pageSid); await sleep(3500); return ev(psid, `({scripts:document.querySelectorAll('#script-list li').length})`); });
    await step('connect', async () => { await ev(psid, `document.getElementById('btn-rt-connect').click();1`, false, true); await sleep(2500); return ev(psid, `document.getElementById('rt-debugger-status').textContent`); });
    await step('capture', async () => {
      await ev(psid, `document.querySelector('.dock-tab[data-pane="capture"]').click();1`, false, true);
      await sleep(400);
      await ev(psid, `document.getElementById('btn-cap-start').click();1`, false, true);
      await sleep(400);
      await b.send('Page.reload', {}, pageSid);
      await sleep(7000);
      return ev(psid, CAPS);
    });
    await step('engineState', async () => {
      const tg: any = await b.send('Target.getTargets');
      const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id + '/background.js'));
      if (!sw) return { error: 'SW target not found' };
      const ssid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
      const tabRes: any = await ev(psid, `chrome.devtools.inspectedWindow.tabId`);
      const st: any = await ev(ssid, `(function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var s=t.getCaptureState(${tabRes});return s?{hook:true,active:s.active,breakpoints:s.breakpoints,captures:s.captures.length,stats:s.stats,keys:s.captures.slice(0,3).map(function(c){return c.functionName+':'+c.captureStatus+':'+c.count})}:{hook:true,state:null}})()`);
      return { tabId: tabRes, viaSW: st };
    });
    await step('rafAfter', async () => ev(psid, RAF, true));
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
