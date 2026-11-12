import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Phase 4.7 L3 browser replay: RAW EVIDENCE COLLECTOR. Real Chrome (headless=new) + real DevTools frontend + real panel.html + real service worker + real chrome.debugger.
// Page: test-pages/real-site-l3-same-text.html (existing file, served byte for byte, never edited). Positions A and C run while the page loads.
// Position B (laterB) and position D (shadowD, which holds a shadowed function with the same name) are NOT run until window.__l3Truth() is called AFTER capture has stopped.
// Operation is programmatic (element.click and Runtime.evaluate), NOT manual mouse. This script judges nothing: every verdict is made offline by test/real-site-l3-browser.test.ts.
// Nothing under src/ is touched. The output names are new and never collide with the evidence files that the L2 test reads.
// Deliberate choices: no registerPort (it would replace the real panel port), no Debugger.enable on the probe session (it could interfere with engine pauses).
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const PAGES = ROOT + '/test-pages';
const HTML_NAME = 'real-site-l3-same-text.html';
const JS_NAME = 'real-site-l3-same-text.js';
const CONF = process.env.MIN_CONFIDENCE || '';
const SUFFIX = CONF ? '-' + CONF : '';
const OUT = ROOT + '/test/acceptance/p47-l3-browser-replay' + SUFFIX + '.json';
const SHOT = ROOT + '/test/acceptance/p47-l3-browser-replay' + SUFFIX + '-panel.png';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9472;
const HTTP = 8782;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-l3-replay-profile';
const PAGE_URL = 'http://127.0.0.1:' + HTTP + '/' + HTML_NAME;
const JS_URL = 'http://127.0.0.1:' + HTTP + '/' + JS_NAME;
const CMD_TIMEOUT_MS = Number(process.env.CMD_TIMEOUT_MS || 20000);
const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));
const sha = (b: any): string => createHash('sha256').update(b).digest('hex');
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const until = async (fn: () => Promise<any>, maxMs: number, stepMs: number): Promise<any> => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const v: any = await fn();
    if (v) return v;
    await sleep(stepMs);
  }
  return null;
};

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const SELECTED = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();return iv.tabbedPane.selectedTabId})()`;
const PANEL = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};var cards=[].slice.call(document.querySelectorAll('#cap-list .decoder-card'));return {cards:cards.length,status:g('cap-status'),hits:g('cap-hits'),success:g('cap-success'),failed:g('cap-failed'),verified:g('cap-verified'),vUnstable:g('cap-v-unstable'),vFailed:g('cap-v-failed'),vInsufficient:g('cap-v-insufficient'),vPending:g('cap-v-pending'),vTotal:g('cap-v-total'),notice:(function(){var n=document.getElementById('cap-notice');return n.hidden?'':n.textContent})(),items:cards.slice(0,40).map(function(c){var n=c.querySelector('.decoder-name');var s=c.querySelector('.cap-summary');return {name:n?n.textContent:'',summary:s?s.textContent:''}})}})()`;
const SCRIPTS = `(function(){return [].slice.call(document.querySelectorAll('#script-list li')).slice(0,40).map(function(l){return l.title+' | '+((l.querySelector('.script-size')||{}).textContent||'')})})()`;
const DRYRUN = `(function(){var d=document.getElementById('cap-dryrun');return {hidden:d.hidden,text:d.textContent}})()`;
const APPLY_STATE = `(function(){var b=document.getElementById('btn-cap-apply');var e=document.getElementById('cap-apply-result');return {disabled:b.disabled,btnText:b.textContent,hidden:e.hidden,text:e.textContent}})()`;
const PANES = `(function(){var rows=function(id){return [].map.call(document.querySelectorAll('#'+id+' .line-code'),function(e){return e.textContent})};return {orig:rows('code-original'),rec:rows('code-recovered')}})()`;
const SELECT_JS = `(function(){var items=[].slice.call(document.querySelectorAll('#script-list li'));var li=items.find(function(l){return String(l.title).slice(-${JS_NAME.length + 1})==='/${JS_NAME}'});if(!li)return {found:false,titles:items.map(function(l){return l.title})};li.click();return {found:true,title:li.title,activeAfterClick:li.classList.contains('active'),titles:items.map(function(l){return l.title})}})()`;

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

const servedLog: { name: string; sha256: string; bytes: number }[] = [];
const server = createServer((req: any, res: any) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  if (name === HTML_NAME || name === JS_NAME) {
    const body: any = readFileSync(PAGES + '/' + name);
    servedLog.push({ name, sha256: sha(body), bytes: body.length });
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('nf');
});

async function main(): Promise<void> {
  const htmlDisk: any = readFileSync(PAGES + '/' + HTML_NAME);
  const jsDisk: any = readFileSync(PAGES + '/' + JS_NAME);
  const distHashes: Record<string, string> = {};
  for (const f of ['background.js', 'devtools.js', 'panel.js', 'sandbox.js']) distHashes[f] = sha(readFileSync(DIST + '/' + f));
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: Record<string, any> = {
    schema: 'ob-recover.l3-browser-replay-raw/1',
    note: 'Raw evidence only. Real Chrome (headless=new) + real DevTools frontend + real panel + real service worker + real chrome.debugger; programmatic operation, NOT manual mouse. Judgements are made offline.',
    isRealSiteSample: false,
    startedAt: new Date().toISOString(),
    minConfidence: CONF || 'high (default)',
    pageUrl: PAGE_URL,
    pageFilesOnDisk: { html: { name: HTML_NAME, sha256: sha(htmlDisk), bytes: htmlDisk.length }, js: { name: JS_NAME, sha256: sha(jsDisk), bytes: jsDisk.length } },
    distHashes,
    steps: {},
  };
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
    // a paused page never answers Runtime.evaluate, so every page-side read gets a timeout
    const evT = (sid: string, expr: string, ms = 10000): Promise<any> => Promise.race([ev(sid, expr), sleep(ms).then(() => ({ timeout: true }))]);
    const step = async (name: string, fn: () => Promise<any>): Promise<any> => {
      let v: any;
      try { v = await fn(); } catch (e: any) { v = { error: String(e && e.message ? e.message : e) }; }
      out.steps[name] = v;
      writeFileSync(OUT, JSON.stringify(out, null, 2));
      return v;
    };
    const findPanel = async (): Promise<string> => {
      const tg: any = await b.send('Target.getTargets');
      const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html'));
      return pt ? (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId : '';
    };

    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Error('no devtools frontend target');
    const dsid: string = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;

    await step('show', () => ev(dsid, SHOW, true));
    await sleep(2500);
    const psid: string = await findPanel();
    if (!psid) throw new Error('panel iframe not found');
    const click = (id: string): Promise<any> => ev(psid, `document.getElementById('${id}').click();1`, false, true);
    const reshow = async (): Promise<void> => { await ev(dsid, SHOW, true); await sleep(1500); };

    let swSid = '';
    let tabId: any = null;
    const getSw = async (): Promise<string> => {
      if (!swSid) {
        const tg: any = await b.send('Target.getTargets');
        const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id + '/background.js'));
        if (!sw) throw new Error('SW not found');
        swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
      }
      if (tabId === null) tabId = await ev(psid, 'chrome.devtools.inspectedWindow.tabId');
      return swSid;
    };
    const engine = async (full: boolean): Promise<any> => {
      try {
        const sid = await getSw();
        const expr = `(function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var s=t.getCaptureState(${tabId});if(!s)return {hook:true,state:null};return {hook:true,active:s.active,breakpoints:s.breakpoints,stats:s.stats,count:s.captures.length${full ? ',captures:s.captures,stability:s.stability' : ''}}})()`;
        return await ev(sid, expr);
      } catch (e: any) {
        swSid = '';
        return { error: String(e && e.message ? e.message : e) };
      }
    };
    // OB-Recover's own CDP read path (debugger-get-source) with a LOCAL fake port that is NOT registered, so the real panel port is never replaced.
    const readSource = async (scriptId: string): Promise<any> => {
      const sid = await getSw();
      const expr = `(async function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var got=null;var port={postMessage:function(m){if(m&&m.type==='get-source-response')got=m}};await t.handlePanelCommand({type:'debugger-get-source',tabId:${tabId},scriptId:'${scriptId}'},port);return got?{ok:got.ok,error:got.error||null,source:got.data&&typeof got.data.source==='string'?got.data.source:null}:{ok:false,error:'no response'}})()`;
      const r: any = await ev(sid, expr, true);
      if (r && typeof r.source === 'string') return { ok: r.ok, scriptId, chars: r.source.length, bytes: utf8(r.source).length, sha256: sha(utf8(r.source)), source: r.source };
      return { scriptId, result: r };
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
    // the page script sets document.title to l3-same-text-ready as its LAST statement
    const waitReady = async (maxMs: number): Promise<any> => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        const t: any = await evT(pageSid, 'document.title', 3000);
        if (t === 'l3-same-text-ready') return { ready: true, ms: Date.now() - t0 };
        await sleep(500);
      }
      return { ready: false, ms: Date.now() - t0 };
    };
    const applyOnce = async (label: string): Promise<any> => {
      await reshow();
      const before: any = await evT(psid, APPLY_STATE);
      await click('btn-cap-apply');
      await sleep(400);
      const result: any = await until(async () => {
        const r: any = await evT(psid, APPLY_STATE);
        return r && r.disabled === false && typeof r.text === 'string' && r.text.length > 0 && r.text.indexOf('正在执行验证和替换') < 0 ? r : null;
      }, 30000, 400);
      return { label, before, result, panes: await evT(psid, PANES) };
    };

    await b.send('Page.enable', {}, pageSid);
    await step('loadPage', async () => {
      await b.send('Page.reload', {}, pageSid);
      const ready = await waitReady(20000);
      await sleep(1500);
      return { ready, scripts: await evT(psid, SCRIPTS) };
    });
    await step('connect', async () => {
      await click('btn-rt-connect');
      await sleep(2500);
      return ev(psid, `document.getElementById('rt-debugger-status').textContent`);
    });
    await step('startCapture', async () => {
      await ev(psid, `document.querySelector('.dock-tab[data-pane=capture]').click();1`, false, true);
      await sleep(400);
      if (CONF) { await ev(psid, `var s=document.getElementById('cap-min-confidence');s.value='${CONF}';s.dispatchEvent(new Event('change'));1`, false, true); await sleep(300); }
      await click('btn-cap-start');
      await sleep(800);
      return { panel: await evT(psid, PANEL), engine: await engine(false) };
    });
    // independent execution evidence: the probe's own session, no OB-Recover code involved, no Debugger.enable
    await step('coverageStart', async () => {
      await b.send('Profiler.enable', {}, pageSid);
      await b.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true }, pageSid);
      return { started: true };
    });
    await step('captureReload', async () => {
      await b.send('Page.reload', {}, pageSid);
      await sleep(3000);
      const ready = await waitReady(60000);
      const stable = await waitStable();
      return { ready, stable, selectedTab: await ev(dsid, SELECTED, true) };
    });
    await step('pageStateAtLoad', async () => ({
      title: await evT(pageSid, 'document.title'),
      l3Result: await evT(pageSid, 'JSON.stringify(window.__l3Result)'),
      typeofLaterB: await evT(pageSid, 'typeof window.laterB'),
      typeofShadowD: await evT(pageSid, 'typeof window.shadowD'),
    }));
    // taken BEFORE __l3Truth() is called: function call counts of the page script as the browser really executed it
    await step('coverageAfterLoad', async () => {
      const r: any = await b.send('Profiler.takePreciseCoverage', {}, pageSid);
      const all: any[] = Array.isArray(r.result) ? r.result : [];
      const mine = all.filter((s: any) => String(s.url) === JS_URL);
      return { scriptsInCoverage: all.length, matched: mine.length, scripts: mine.map((s: any) => ({ url: s.url, scriptId: s.scriptId, functions: s.functions.map((f: any) => ({ functionName: f.functionName, isBlockCoverage: f.isBlockCoverage, ranges: f.ranges })) })) };
    });
    const raw: any = await step('engineRawAfterLoad', () => engine(true));
    const caps: any[] = raw && Array.isArray(raw.captures) ? raw.captures : [];
    const mine = caps.find((c: any) => String(c.scriptUrl).endsWith('/' + JS_NAME));
    const scriptId: string = mine ? String(mine.scriptId) : '';
    out.captureScriptId = scriptId;
    await step('sourceBeforeApply', () => (scriptId ? readSource(scriptId) : Promise.resolve({ skipped: 'no capture record belongs to the page script' })));
    await step('panelAfterLoad', async () => { await reshow(); return { panel: await evT(psid, PANEL), scripts: await evT(psid, SCRIPTS) }; });
    await step('selectScript', async () => {
      await reshow();
      const selection: any = await until(async () => { const r: any = await evT(psid, SELECT_JS); return r && r.found ? r : null; }, 15000, 500);
      await sleep(1500);
      return { selection, panes: await evT(psid, PANES) };
    });
    await step('dryRun', async () => { await click('btn-cap-dryrun'); await sleep(1000); return evT(psid, DRYRUN); });
    await step('apply1', () => applyOnce('first apply'));
    // the second click must pass the same URL + source equality gate again: if the first apply had mutated activeScript.source it would be refused
    await step('apply2', () => applyOnce('second apply'));
    await step('stopCapture', async () => {
      await click('btn-cap-stop');
      await sleep(1500);
      return { panel: await evT(psid, PANEL), engine: await engine(false), pageResponsive: (await evT(pageSid, '1+1')) === 2 };
    });
    // B and D only run now, with capture stopped and the engine breakpoints removed
    await step('truthAfterStop', async () => {
      const before: any = await engine(false);
      const truth: any = await evT(pageSid, 'window.__l3Truth()', 10000);
      await sleep(1000);
      const after: any = await engine(true);
      return { truth, engineCountBefore: before && before.count, engineCountAfter: after && after.count, engineHitsBefore: before && before.stats ? before.stats.hits : null, engineHitsAfter: after && after.stats ? after.stats.hits : null, capturesAfter: after ? after.captures : null };
    });
    await step('sourceAfterApply', () => (scriptId ? readSource(scriptId) : Promise.resolve({ skipped: 'no capture record belongs to the page script' })));
    await step('pageResourceAfterApply', async () => {
      const ft: any = await b.send('Page.getFrameTree', {}, pageSid);
      const rc: any = await b.send('Page.getResourceContent', { frameId: ft.frameTree.frame.id, url: JS_URL }, pageSid);
      const bytes: Uint8Array = rc.base64Encoded ? Uint8Array.from(atob(String(rc.content)), (c: string) => c.charCodeAt(0)) : utf8(String(rc.content));
      return { base64Encoded: !!rc.base64Encoded, bytes: bytes.length, sha256: sha(bytes) };
    });
    await step('panelScreenshot', async () => {
      await reshow();
      const shot: any = await b.send('Page.captureScreenshot', { format: 'png' }, dsid);
      const bytes: Uint8Array = Uint8Array.from(atob(String(shot.data)), (c: string) => c.charCodeAt(0));
      writeFileSync(SHOT, bytes);
      return { file: SHOT, bytes: bytes.length, sha256: sha(bytes) };
    });
    b.close();
  } catch (e: any) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ }
    server.close();
    out.served = servedLog;
    out.finishedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  console.log('done fatal=' + (out.fatal ?? 'none') + ' steps=' + Object.keys(out.steps).length + ' served=' + servedLog.length + ' out=' + OUT);
}

main().then(() => process.exit(0)).catch((e: any) => { console.error(e); process.exit(1); });
