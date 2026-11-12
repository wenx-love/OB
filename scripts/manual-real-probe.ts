import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9477;
const HTTP = 8791;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ob-manual-real-profile';
const OUT = ROOT + '/test/acceptance/phase4-manual-real-probe.json';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

const PROBE = `(async function(){var r={};var base='devtools://devtools/bundled/';var names={bp:'models/breakpoints/breakpoints.js',ws:'models/workspace/workspace.js',bd:'models/bindings/bindings.js',sdk:'core/sdk/sdk.js',src:'panels/sources/sources.js',leg:'ui/legacy/legacy.js'};for(var k in names){try{var m=await import(base+names[k]);r[k]=Object.keys(m).slice(0,50)}catch(e){r[k]='ERR '+String(e&&e.message?e.message:e)}}try{var ws=await import(base+'models/workspace/workspace.js');var w=ws.Workspace.WorkspaceImpl.instance();r.uiSourceCodes=w.uiSourceCodes().map(function(u){return u.url()}).filter(function(u){return u.indexOf('phase4')>=0})}catch(e){r.wsErr=String(e&&e.message?e.message:e)}try{var lg=await import(base+'ui/legacy/legacy.js');var iv=lg.InspectorView.InspectorView.instance();r.tabIds=iv.tabbedPane.tabIds();r.selected=iv.tabbedPane.selectedTabId}catch(e){r.ivErr=String(e&&e.message?e.message:e)}return r})()`;

async function main() {
  const server = createServer((req, res) => {
    const name = String(req.url || '/').split('?')[0].replace('/', '');
    try {
      const body = readFileSync(ROOT + '/test-pages/' + name);
      res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'headed Chrome probe with a dedicated profile; exploration only, no pass/fail verdict', steps: {} };
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
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/phase4-manual-real.html' });
    await sleep(1500);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const tg: any = await b.send('Target.getTargets');
    out.targets = tg.targetInfos.map((t: any) => t.type + ' ' + String(t.url).slice(0, 110));
    const dt = tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    const r: any = await b.send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true }, dsid);
    out.steps.frontendProbe = r.exceptionDetails ? { error: String(r.exceptionDetails.text) } : r.result.value;
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
