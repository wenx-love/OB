import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

// Phase 4.7 L3 diagnostic (read only): where does the Decoder tab number 38 in the replay screenshot come from? One discovery of the page script yields 2 candidates (1 high, 1 medium), so 38 is not one discovery.
// Same real Chrome + real DevTools + real panel flow as scripts/p47-l3-browser-replay.ts, but it only READS the Decoder statistics and the runtime log after each stage. Nothing under src/ is touched; the page files are served byte for byte. It judges nothing.
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const PAGES = ROOT + '/test-pages';
const HTML_NAME = 'real-site-l3-same-text.html';
const JS_NAME = 'real-site-l3-same-text.js';
const OUT = ROOT + '/test/acceptance/p47-l3-decoder-count-diag.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9476;
const HTTP = 8786;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-l3-decoder-diag-profile';
const PAGE_URL = 'http://127.0.0.1:' + HTTP + '/' + HTML_NAME;
const CMD_TIMEOUT_MS = 20000;
const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const DEC = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};var cards=[].slice.call(document.querySelectorAll('#decoder-list .decoder-card'));var log=[].map.call(document.querySelectorAll('#runtime-log .rt-msg'),function(e){return e.textContent});return {total:g('dec-total'),analyzed:g('dec-analyzed'),candidates:g('dec-candidates'),high:g('dec-high'),calls:g('dec-calls'),badge:g('dock-dec-badge'),cardCount:cards.length,cardNames:cards.slice(0,60).map(function(c){var n=c.querySelector('.decoder-name');return n?n.textContent:''}),discoverLog:log.filter(function(t){return t.indexOf('发现脚本')>=0||t.indexOf('分析完成')>=0||t.indexOf('分析失败')>=0||t.indexOf('已刷新')>=0}).slice(0,120),logTotal:log.length}})()`;

interface Cdp { send(method: string, params?: Record<string, any>, sessionId?: string): Promise<any>; close(): void }
interface Pending { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; method: string }

function connect(wsUrl: string): Promise<Cdp> {
  return new Promise<Cdp>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, Pending>();
    const failAll = (why: string): void => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: MessageEvent) => {
      const m: any = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: Record<string, any> = {}, sessionId?: string): Promise<any> {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT_MS + 'ms: ' + method)); }, CMD_TIMEOUT_MS);
          pending.set(i, { resolve: res, reject: rej, timer, method });
          const msg: Record<string, any> = { id: i, method, params };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
        });
      },
      close(): void { ws.close(); },
    });
  });
}

const server = createServer((req: any, res: any) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === HTML_NAME || name === JS_NAME) {
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(readFileSync(PAGES + '/' + name));
    return;
  }
  res.writeHead(404);
  res.end('nf');
});

async function main(): Promise<void> {
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: Record<string, any> = { schema: 'ob-recover.l3-decoder-count-diag/1', note: 'Read only diagnostic of the Decoder tab number. Raw observations, no judgement.', startedAt: new Date().toISOString(), pageUrl: PAGE_URL, stages: {} };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    const b: Cdp = await connect(ver.webSocketDebuggerUrl);
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    out.extensionId = load.id;
    await sleep(1500);
    const page: any = await b.send('Target.createTarget', { url: PAGE_URL });
    await sleep(1500);
    const pageSid: string = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const ev = async (sid: string, expr: string, awaitPromise = false, userGesture = false): Promise<any> => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    const evT = (sid: string, expr: string, ms = 10000): Promise<any> => Promise.race([ev(sid, expr), sleep(ms).then(() => ({ timeout: true }))]);
    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid: string = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    await ev(dsid, SHOW, true);
    await sleep(2500);
    const tg1: any = await b.send('Target.getTargets');
    const pt = tg1.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
    if (!pt) throw new Error('panel iframe not found');
    const psid: string = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    const click = (id: string): Promise<any> => ev(psid, `document.getElementById('${id}').click();1`, false, true);
    const stage = async (name: string): Promise<void> => {
      let v: any;
      try { v = await evT(psid, DEC); } catch (e: any) { v = { error: String(e && e.message ? e.message : e) }; }
      out.stages[name] = v;
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };
    const act = async (name: string, fn: () => Promise<void>): Promise<void> => {
      try { await fn(); } catch (e: any) { out.stages[name + '_actionError'] = String(e && e.message ? e.message : e); }
      await stage(name);
    };

    await b.send('Page.enable', {}, pageSid);
    await stage('afterPanelShown');
    await act('afterConnect', async () => { await click('btn-rt-connect'); await sleep(2500); });
    await act('afterStartCapture', async () => { await ev(psid, `document.querySelector('.dock-tab[data-pane=capture]').click();1`, false, true); await sleep(400); await click('btn-cap-start'); await sleep(800); });
    await act('afterCaptureReload1', async () => { await b.send('Page.reload', {}, pageSid); await sleep(6000); });
    await act('afterCaptureReload2', async () => { await b.send('Page.reload', {}, pageSid); await sleep(6000); });
    await act('afterStop', async () => { await click('btn-cap-stop'); await sleep(1500); });
    await act('afterRefreshDiscovery', async () => { await click('btn-refresh-discovery'); await sleep(1500); });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ }
    server.close();
    out.finishedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log('done fatal=' + (out.fatal ?? 'none') + ' stages=' + Object.keys(out.stages).length);
}

main().then(() => process.exit(0)).catch((e: any) => { console.error(e); process.exit(1); });
