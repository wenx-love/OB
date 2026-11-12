import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Real OB sample end-to-end: real DevTools frontend (headless Chrome) + real panel.html + real service worker + real chrome.debugger.
// Panel shown by InspectorView.showPanel and buttons by element.click() (programmatic, NOT manual mouse).
// The sample is served byte-for-byte from test/fixtures/real-ob/obfuscated.js (generator output, never edited).
// Engine records are read as-is and saved unmodified; nothing is edited to make the run pass.
// With TARGET_URL set the same flow runs against that page instead (nothing served locally, no ground truth).
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const FIX = ROOT + '/test/fixtures/real-ob';
const TARGET = process.env.TARGET_URL || '';
const CONF = process.env.MIN_CONFIDENCE || '';
const OUT = ROOT + '/test/acceptance/' + (TARGET ? 'devtools-real-site-e2e' : 'devtools-real-ob-e2e') + (CONF ? '-' + CONF : '') + '.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9468;
const HTTP = 8778;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/devtools-real-ob-profile';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const OB_HTML = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>real-ob</title></head><body><script src='/obfuscated.js'></script></body></html>`;

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const SELECTED = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();return iv.tabbedPane.selectedTabId})()`;
const PANEL = `(function(){var cards=[].slice.call(document.querySelectorAll('#cap-list .decoder-card'));var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};var t=document.getElementById('cap-v-total');return {cards:cards.length,status:g('cap-status'),hits:g('cap-hits'),success:g('cap-success'),failed:g('cap-failed'),engineUnstable:g('cap-unstable'),verified:g('cap-verified'),vUnstable:g('cap-v-unstable'),vFailed:g('cap-v-failed'),vInsufficient:g('cap-v-insufficient'),vPending:g('cap-v-pending'),vTotal:g('cap-v-total'),vTotalTitle:t?t.title:null,hint:g('cap-hint'),notice:(function(){var n=document.getElementById('cap-notice');return n.hidden?'':n.textContent})(),items:cards.slice(0,80).map(function(c){var b=c.querySelector('.decoder-card-body');var s=c.querySelector('.cap-summary');var n=c.querySelector('.decoder-name');return {name:n?n.textContent:'',badges:[].map.call(c.querySelectorAll('.decoder-badge'),function(x){return x.textContent}),summary:s?s.textContent:'',body:b?b.textContent.slice(0,700):null}})}})()`;
const DECODERS = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};return {total:g('dec-total'),analyzed:g('dec-analyzed'),candidates:g('dec-candidates'),high:g('dec-high'),calls:g('dec-calls'),cards:[].slice.call(document.querySelectorAll('#decoder-list .decoder-card')).slice(0,60).map(function(c){var n=c.querySelector('.decoder-name');var bs=[].map.call(c.querySelectorAll('.decoder-badge'),function(x){return x.textContent}).join('/');var rows=[].map.call(c.querySelectorAll('.decoder-info-row'),function(r){return r.textContent}).join(' ; ');return (n?n.textContent:'')+' ['+bs+'] '+rows.slice(0,160)})}})()`;
const SCRIPTS = `(function(){return [].slice.call(document.querySelectorAll('#script-list li')).slice(0,40).map(function(l){return l.title+' | '+((l.querySelector('.script-size')||{}).textContent||'')})})()`;
const DRYRUN = `(function(){var d=document.getElementById('cap-dryrun');return {hidden:d.hidden,text:d.textContent}})()`;

let served = 0;
const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === 'ob.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(OB_HTML); return; }
  if (name === 'obfuscated.js') { served++; res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(readFileSync(FIX + '/obfuscated.js')); return; }
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
  const fixtureBytes = readFileSync(FIX + '/obfuscated.js');
  const meta = JSON.parse(readFileSync(FIX + '/metadata.json', 'utf8'));
  if (!TARGET) await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: any = {
    note: 'real DevTools frontend (headless Chrome 155) + real panel + real SW + real chrome.debugger; programmatic operation, NOT manual mouse. Engine records saved unmodified.',
    target: TARGET || 'local fixture test/fixtures/real-ob/obfuscated.js',
    minConfidence: CONF || 'high (default)',
    fixture: TARGET ? null : { sha256: sha(fixtureBytes), metadataSha256: meta.obfuscatedSha256, unchanged: sha(fixtureBytes) === meta.obfuscatedSha256, bytes: fixtureBytes.length },
    steps: {},
  };
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
    const pageUrl = TARGET || 'http://127.0.0.1:' + HTTP + '/ob.html';
    const page: any = await b.send('Target.createTarget', { url: pageUrl });
    await sleep(TARGET ? 3000 : 1500);
    const pageSid = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const ev = async (sid: string, expr: string, awaitPromise = false, userGesture = false) => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    // a paused page never answers Runtime.evaluate, so every page-side read gets a timeout
    const evT = (sid: string, expr: string, ms = 10000): Promise<any> => Promise.race([ev(sid, expr), sleep(ms).then(() => ({ timeout: true }))]);
    const step = async (name: string, fn: () => Promise<any>) => {
      try { out.steps[name] = await fn(); } catch (e: any) { out.steps[name] = { error: String(e && e.message ? e.message : e) }; }
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    };
    const findPanel = async () => {
      const tg: any = await b.send('Target.getTargets');
      const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
      return pt ? (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId : '';
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

    let swSid = '';
    let tabId: any = null;
    const engine = async (full: boolean): Promise<any> => {
      try {
        if (!swSid) {
          const tg: any = await b.send('Target.getTargets');
          const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id + '/background.js'));
          if (!sw) return { error: 'SW not found' };
          swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
        }
        if (tabId === null) tabId = await ev(psid, 'chrome.devtools.inspectedWindow.tabId');
        const expr = `(function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var s=t.getCaptureState(${tabId});if(!s)return {hook:true,state:null};return {hook:true,active:s.active,breakpoints:s.breakpoints,stats:s.stats,count:s.captures.length${full ? ',captures:s.captures,stability:s.stability' : ''}}})()`;
        return await ev(swSid, expr);
      } catch (e: any) {
        swSid = '';
        return { error: String(e && e.message ? e.message : e) };
      }
    };
    const waitStable = async (maxMs = 60000): Promise<any> => {
      const t0 = Date.now();
      let last = -2;
      let same = 0;
      while (Date.now() - t0 < maxMs) {
        const st: any = await engine(false);
        const h = st && st.stats ? st.stats.hits : -1;
        if (h === last) same++; else same = 0;
        if (same >= 3) return { stable: true, hits: h, ms: Date.now() - t0 };
        last = h;
        await sleep(1500);
      }
      return { stable: false, hits: last, ms: Date.now() - t0 };
    };

    await step('loadPage', async () => { await b.send('Page.reload', {}, pageSid); await sleep(TARGET ? 10000 : 4000); return { scripts: await evT(psid, SCRIPTS) }; });
    await step('pageInfo', async () => evT(pageSid, `({title:document.title,href:location.href,ready:document.readyState,scriptTags:[].map.call(document.scripts,function(s){return s.src||'(inline)'}).slice(0,30),scriptResources:performance.getEntriesByType('resource').filter(function(r){return r.initiatorType==='script'}).slice(0,30).map(function(r){return r.name+' status='+r.responseStatus})})`));
    await step('connect', async () => { await click('btn-rt-connect'); await sleep(2500); return ev(psid, `document.getElementById('rt-debugger-status').textContent`); });
    await step('discovery', async () => evT(psid, DECODERS));
    await step('discoveredScriptLog', async () => evT(psid, `[].map.call(document.querySelectorAll('#runtime-log .rt-msg'),function(e){return e.textContent}).filter(function(t){return t.indexOf('发现脚本')>=0||t.indexOf('分析')>=0}).slice(0,40)`));
    await step('startCapture', async () => {
      await ev(psid, `document.querySelector('.dock-tab[data-pane=capture]').click();1`, false, true);
      await sleep(400);
      if (CONF) { await ev(psid, `var s=document.getElementById('cap-min-confidence');s.value='${CONF}';s.dispatchEvent(new Event('change'));1`, false, true); await sleep(300); }
      await click('btn-cap-start');
      await sleep(800);
      return evT(psid, PANEL);
    });

    const round = async (n: number) => {
      await step('round' + n + 'Reload', async () => {
        await b.send('Page.reload', {}, pageSid);
        await sleep(TARGET ? 6000 : 3000);
        const w = await waitStable();
        return { wait: w, selectedTab: await ev(dsid, SELECTED, true) };
      });
      await step('round' + n + 'GroundTruth', async () => (TARGET ? { skipped: 'no ground truth for an external site' } : evT(pageSid, 'JSON.stringify(window.__obResult)')));
      await step('round' + n + 'EngineRaw', async () => engine(true));
      await step('round' + n + 'PanelHidden', async () => ({ selectedTab: await ev(dsid, SELECTED, true), panel: await evT(psid, PANEL) }));
      await step('round' + n + 'PanelReshown', async () => { await reshow(); return evT(psid, PANEL); });
      await step('round' + n + 'DryRun', async () => { await click('btn-cap-dryrun'); await sleep(800); return evT(psid, DRYRUN); });
    };
    await round(1);
    await round(2);

    await step('clearRecords', async () => {
      await click('btn-cap-clear');
      await sleep(1500);
      return { panel: await evT(psid, PANEL), engine: await engine(false) };
    });
    await step('stopCapture', async () => { await click('btn-cap-stop'); await sleep(1500); return evT(psid, PANEL); });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    if (!TARGET) server.close();
    out.servedObfuscatedJs = served;
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log('done fatal=' + (out.fatal ?? 'none') + ' steps=' + Object.keys(out.steps).length + ' served=' + served);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
