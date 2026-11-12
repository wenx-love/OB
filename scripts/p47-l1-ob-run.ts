import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Phase 4.7 L1 stage B, next-page trigger run. The REAL OB-Recover extension in a real headful Chrome with its own dedicated profile.
// Budget of this run: ONE target page navigation (about:blank first, then a single Page.navigate) and ONE real next-page click (Input.dispatchMouseEvent).
// No reload, no second navigation, no API replay, no retry. Every gate failure stops the run and records an explicit stop reason in out.stop.
// The document is checked against the target host and path as soon as it is ready: a login page or any other page stops the run before anything is connected.
// It judges nothing: comparison happens offline against reference/, which was produced without OB-Recover.
// Never recorded: cookies, GuestId, request or response bodies, headers. Network records keep method, host+path, status and timing only.
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const SITE = ROOT + '/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou';
const RUN = SITE + '/run-20261110T1458Z';
const OBS = RUN + '/observed';
const RUN_ID = 'nextpage3';
const OUT = OBS + '/raw-run.nextpage3.json';
const LEDGER = SITE + '/budget-ledger.json';
const TARGET = 'https://hangzhou.qccqcc.com/list.html?keyword=%E5%86%B2%E9%94%8B%E8%A1%A3';
// Expected document identity: a login page or any other page on this site is not the target page. Checked as soon as the page is ready, before anything is connected.
const TARGET_HOST = 'hangzhou.qccqcc.com';
const TARGET_PATH = '/list.html';
const LOGIN_PATH_MARKER = '/login';
const TARGET_SCRIPT_URL = 'https://j.17qcc.com/combo?ajax-20&imglazy&pager-5&template-6&rollload&ajaxmethord-5&pluploadfull&qccer-1&hpaitop-5&hpailist-2';
const SCRIPT_SUFFIX = 'hpailist-2';
const GPL_PATH = '/api/services/app/SearchFactory/GetPageList';
const REF_SHA = readFileSync(RUN + '/script.sha256', 'utf8').trim();
const SCRIPT_TEXT = readFileSync(RUN + '/script.js', 'utf8');
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9470;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/l1-ob-profile';
const CMD_TIMEOUT_MS = 25000;
const PLANNED_UNITS = 2;
const CLICK_TAIL_MS = 10000;
const CLICK_HARD_CAP_MS = 60000;
const GLOBAL_CAP_MS = 12 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (b: any) => createHash('sha256').update(b).digest('hex');
const shaStr = (s: string) => sha(Buffer.from(s, 'utf8'));
const hostPath = (u: any): string => { try { const x = new URL(String(u)); return x.host + x.pathname; } catch { return 'unparsable'; } };
class Gate extends Error { gate: string; constructor(gate: string, message: string) { super(message); this.gate = gate; } }

// The next-page anchor class is read from the archived, hash-verified script (the pagination plugin default). Unknown or ambiguous: fall back to a structural heuristic and record that.
const DQ = String.fromCharCode(34);
const nextClsRe = new RegExp('nextCls *: *' + DQ + '([A-Za-z0-9_-]+)' + DQ, 'g');
const nextClsFound: string[] = [];
for (let m = nextClsRe.exec(SCRIPT_TEXT); m; m = nextClsRe.exec(SCRIPT_TEXT)) { if (nextClsFound.indexOf(m[1]) < 0) nextClsFound.push(m[1]); }
const NEXT_CLS: string | null = nextClsFound.length === 1 ? nextClsFound[0] : null;

const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const DEC = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};return {total:g('dec-total'),analyzed:g('dec-analyzed'),candidates:g('dec-candidates'),high:g('dec-high'),calls:g('dec-calls'),names:[].slice.call(document.querySelectorAll('#decoder-list .decoder-card .decoder-name')).slice(0,40).map(function(n){return n.textContent})}})()`;
const PANEL = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};return {status:g('cap-status'),hits:g('cap-hits'),success:g('cap-success'),failed:g('cap-failed'),bps:g('cap-bps'),verified:g('cap-verified'),vTotal:g('cap-v-total'),vInsufficient:g('cap-v-insufficient'),vUnstable:g('cap-v-unstable'),vFailed:g('cap-v-failed'),vPending:g('cap-v-pending'),cards:[].slice.call(document.querySelectorAll('#cap-list .decoder-card')).length,notice:(function(){var n=document.getElementById('cap-notice');return n.hidden?'':n.textContent})(),hint:g('cap-hint')}})()`;
const SCRIPTS = `(function(){return [].slice.call(document.querySelectorAll('#script-list li')).slice(0,40).map(function(l){return l.title+' | '+((l.querySelector('.script-size')||{}).textContent||'')})})()`;
const DRYRUN = `(function(){var d=document.getElementById('cap-dryrun');return {hidden:d.hidden,text:d.textContent}})()`;
const APPLY_STATE = `(function(){var b=document.getElementById('btn-cap-apply');var e=document.getElementById('cap-apply-result');return {disabled:b.disabled,hidden:e.hidden,text:e.textContent}})()`;
const PANES = `(function(){var rows=function(id){return [].map.call(document.querySelectorAll('#'+id+' .line-code'),function(e){return e.textContent})};return {orig:rows('code-original'),rec:rows('code-recovered')}})()`;
const SELECT_SCRIPT = `(function(){var items=[].slice.call(document.querySelectorAll('#script-list li'));var li=items.find(function(l){return String(l.title).indexOf(${JSON.stringify(SCRIPT_SUFFIX)})>=0});if(!li)return {found:false,titles:items.map(function(l){return l.title})};li.click();return {found:true,title:li.title,activeAfterClick:li.classList.contains('active'),titles:items.map(function(l){return l.title})}})()`;
// Panel connect state and the tail of the panel's own log (extension messages only), saved when the connect gate fails.
const PANEL_CONNECT = `(function(){var s=document.getElementById('rt-debugger-status');var b=document.getElementById('btn-rt-connect');var log=document.getElementById('runtime-log');var rows=log?[].slice.call(log.querySelectorAll('.rt-log-entry')):[];return {statusText:s?s.textContent:null,statusClass:s?s.className:null,connectDisabled:b?b.disabled:null,logCount:rows.length,logTail:rows.slice(-25).map(function(e){var t=e.querySelector('.rt-time');var m=e.querySelector('.rt-msg');return {level:e.className.replace('rt-log-entry','').trim(),time:t?t.textContent:null,msg:m?String(m.textContent).slice(0,300):null}})}})()`;
// Panel-free status read: the service worker finds the real tab id from its own chrome.debugger.getTargets, then asks the extension for that tab's status.
// Offline diagnosis showed the panel can hold its main thread for minutes while it analyses a large script, and every read that goes through the panel (including the lazy tab id read) then looks like a service worker timeout.
const SW_DIRECT_STATUS = `new Promise(function(res){try{chrome.debugger.getTargets(function(ts){var t=ts.filter(function(x){return x.type==='page'&&String(x.url).indexOf(${JSON.stringify(TARGET_HOST + TARGET_PATH)})>=0})[0];if(!t||typeof t.tabId!=='number'){res({noTab:true,count:ts.length,urls:ts.filter(function(x){return x.type==='page'}).map(function(x){return String(x.url).slice(0,120)})});return}var g=globalThis.__obRecoverTest;res({tabId:t.tabId,status:g?g.getStatus(t.tabId):'no-hook'})})}catch(e){res({thrown:String(e&&e.message?e.message:e)})}})`;
// In-page Resource Timing snapshot: counts and host+path only. Passive and read-only.
const RES_SNAPSHOT = `(function(){var e=performance.getEntriesByType('resource');var strip=function(n){try{var u=new URL(n);return u.host+u.pathname}catch(x){return 'unparsable'}};var gpl=e.filter(function(x){return x.name.indexOf(${JSON.stringify(GPL_PATH)})>=0}).map(function(x){return {start:Math.round(x.startTime),end:Math.round(x.responseEnd),status:x.responseStatus!==undefined?x.responseStatus:null,type:x.initiatorType}});return {total:e.length,gpl:gpl,names:e.map(function(x){return strip(x.name)}).slice(0,400),bufferMaybeFull:e.length>=250}})()`;
// Read-only DOM probe for the next-page anchor inside #page. Scrolls it into view (no request) and reports geometry, state and what is on top of it.
const nextProbe = (cls: string | null) => `(function(){var cls=${JSON.stringify(cls)};var box=document.querySelector('#page');if(!box)return {found:false,why:'no #page container'};var all=[].slice.call(box.querySelectorAll('a'));var cands;var method;if(cls){cands=[].slice.call(box.querySelectorAll('a.'+cls));method='class:'+cls;}else{var last=all[all.length-1];cands=last&&!last.hasAttribute('data-page')&&last.className?[last]:[];method='heuristic:last-anchor-without-data-page';}var summary=all.slice(0,12).map(function(a){return {cls:a.className,page:a.getAttribute('data-page'),text:(a.textContent||'').trim().slice(0,6)}});if(cands.length!==1)return {found:false,why:'expected exactly 1 next-button candidate, got '+cands.length,method:method,anchors:all.length,summary:summary};var a=cands[0];a.scrollIntoView({block:'center',inline:'center'});var r=a.getBoundingClientRect();var cs=getComputedStyle(a);var cx=r.left+r.width/2;var cy=r.top+r.height/2;var top=document.elementFromPoint(cx,cy);var disabled=a.classList.contains('disabled')||a.hasAttribute('disabled')||a.getAttribute('aria-disabled')==='true'||cs.pointerEvents==='none';var visible=r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none';return {found:true,method:method,cls:a.className,page:a.getAttribute('data-page'),text:(a.textContent||'').trim().slice(0,6),disabled:disabled,visible:visible,covered:!(top&&(top===a||a.contains(top))),x:cx,y:cy,w:r.width,h:r.height,vw:window.innerWidth,vh:window.innerHeight,anchors:all.length,summary:summary,activePage:(box.querySelector('span')||{}).textContent||null}})()`;

function connect(wsUrl: string, onEvent?: (method: string, params: any, sessionId?: string) => void) {
  const extraListeners = new Set<(method: string, params: any, sessionId?: string) => void>();
  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    const failAll = (why: string) => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } return; }
      if (m.method && onEvent) { try { onEvent(m.method, m.params || {}, m.sessionId); } catch { /* listener errors must not break CDP */ } }
      if (m.method) { for (const l of extraListeners) { try { l(m.method, m.params || {}, m.sessionId); } catch { /* listener errors must not break CDP */ } } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: any = {}, sessionId?: string) {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT_MS + 'ms: ' + method)); }, CMD_TIMEOUT_MS);
          pending.set(i, { resolve: res, reject: rej, timer, method });
          const msg: any = { id: i, method, params };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
        });
      },
      addListener(fn: (method: string, params: any, sessionId?: string) => void) { extraListeners.add(fn); },
      removeListener(fn: (method: string, params: any, sessionId?: string) => void) { extraListeners.delete(fn); },
      close() { ws.close(); },
    });
  });
}

async function main() {
  mkdirSync(OBS, { recursive: true });
  const refuse = (why: string): void => { console.log('REFUSED before any browser or site access: ' + why); process.exit(2); };

  // ---- guards: all of these run before Chrome starts and before the site is touched ----
  if (existsSync(OUT)) { refuse('output file already exists, existing raw-run files are never overwritten: ' + OUT); return; }
  const ledger: any = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const remainingBefore = Number(ledger.budget) - Number(ledger.used);
  if (!(remainingBefore >= PLANNED_UNITS)) { refuse('budget remaining ' + remainingBefore + ' is below the planned ' + PLANNED_UNITS + ' units'); return; }
  const distBackground = readFileSync(DIST + '/background.js', 'utf8');
  if (distBackground.indexOf('getBreakpointsByScript') < 0) { refuse('dist/background.js has no getBreakpointsByScript: rebuild and re-check deployment before running'); return; }
  let portBusy = false;
  try { await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(1500) }); portBusy = true; } catch { /* port is free */ }
  if (portBusy) { refuse('port ' + PORT + ' is already in use: this run only attaches to a browser it started itself'); return; }
  const rawFiles = () => readdirSync(OBS).filter((f: string) => f.indexOf('raw-run') === 0 && f.endsWith('.json') && OBS + '/' + f !== OUT).sort();
  const hashPrior = () => rawFiles().map((f: string) => ({ file: f, sha256: sha(readFileSync(OBS + '/' + f)) }));
  const priorBefore = hashPrior();

  const ref = { pageSid: '', mainFrameId: '', phase: 'pre' };
  const nav: any[] = [];
  const net: any = { enabled: false, enableNote: null, enableError: null, records: [] };
  const netById = new Map<string, any>();
  const budget: any = { unit: ledger.unit, ledgerRemainingBefore: remainingBefore, plannedUnits: PLANNED_UNITS, pageLoads: 0, clicks: 0, providerInitiatedBusinessReplays: 0 };
  const out: Record<string, any> = {
    schema: 'ob-recover.l1-observed-raw/3',
    kind: 'next-page-trigger-run',
    capturedBy: 'ob-recover',
    note: 'real extension, headful dedicated Chrome; programmatic panel operation (element.click) plus ONE real mouse click via Input.dispatchMouseEvent. No judgement here.',
    target: TARGET,
    targetScriptUrl: TARGET_SCRIPT_URL,
    referenceSha256: REF_SHA,
    nextButton: { classFromArchivedScript: NEXT_CLS, allNextClsValuesFound: nextClsFound },
    limits: { pageLoads: 1, clicks: 1, tailMs: CLICK_TAIL_MS, hardCapMs: CLICK_HARD_CAP_MS, globalCapMs: GLOBAL_CAP_MS },
    priorEvidence: { before: priorBefore, after: null, unchanged: null },
    dist: {},
    budget,
    steps: {},
    stop: null,
  };
  for (const f of ['background.js', 'devtools.js', 'panel.js', 'sandbox.js']) out.dist[f] = sha(readFileSync(DIST + '/' + f));

  const summarizeNet = (): any => {
    const byPhase: Record<string, any> = {};
    for (const r of net.records) {
      const p = byPhase[r.phase] || (byPhase[r.phase] = { total: 0, byMethod: {}, getPageList: 0, failed: 0 });
      p.total++;
      p.byMethod[r.method] = (p.byMethod[r.method] || 0) + 1;
      if (String(r.hostPath).indexOf(GPL_PATH) >= 0) p.getPageList++;
      if (r.failed) p.failed++;
    }
    const postClick = net.records.filter((r: any) => r.phase === 'postClick').map((r: any) => ({ method: r.method, hostPath: r.hostPath, type: r.type, status: r.status, finished: r.finished, failed: r.failed, errorText: r.errorText || null, ms: r.finishedAt ? r.finishedAt - r.at : null }));
    return { enabled: net.enabled, enableNote: net.enableNote, enableError: net.enableError, totalRequestsSeenAfterEnable: net.records.length, byPhase, postClickRequests: postClick, note: 'passive Network events only, listening from shortly after the page load started, so the load phase is a lower bound (see resourceTiming for the in-page count); method, host and path only, no headers, bodies or cookies' };
  };
  let firstSave = true;
  const loadNet: any = { records: [], note: 'requests seen from the moment Network.enable was called on the about:blank page, so the whole load of the target URL including any redirect is covered here; method, host and path only' };
  const save = (): void => {
    out.navigationLedger = nav;
    out.network = summarizeNet();
    out.loadNetwork = loadNet;
    writeFileSync(OUT, JSON.stringify(out, null, 2), { flag: firstSave ? 'wx' : 'w' });
    firstSave = false;
  };
  try { save(); } catch (e: any) { refuse('cannot create the output file exclusively: ' + String(e && e.message ? e.message : e)); return; }

  // Shared network record shape. Method, host and path only: never headers, bodies, cookies or query values.
  const makeNetRecord = (params: any, at: number): any => {
    const rq = params.request || {};
    const rec: any = { id: params.requestId, method: rq.method || null, hostPath: hostPath(rq.url), type: params.type || null, phase: ref.phase, at, status: null, finished: false, failed: false, redirectStatus: null };
    if (params.redirectResponse) rec.redirectStatus = params.redirectResponse.status;
    return rec;
  };
  const onEvent = (method: string, params: any, sessionId?: string): void => {
    if (!ref.pageSid || sessionId !== ref.pageSid) return;
    const at = Date.now();
    if (method === 'Page.frameNavigated') {
      if (params.frame && !params.frame.parentId) nav.push({ kind: 'frameNavigated', phase: ref.phase, frameId: params.frame.id, loaderId: params.frame.loaderId, url: params.frame.url, at });
    } else if (method === 'Page.navigatedWithinDocument') {
      if (!ref.mainFrameId || params.frameId === ref.mainFrameId) nav.push({ kind: 'navigatedWithinDocument', phase: ref.phase, frameId: params.frameId, url: params.url, navigationType: params.navigationType || null, at });
    } else if (method === 'Page.loadEventFired') {
      nav.push({ kind: 'loadEventFired', phase: ref.phase, at });
    } else if (method === 'Network.requestWillBeSent') {
      const rec: any = makeNetRecord(params, at);
      if (ref.phase === 'preNavigation') { loadNet.records.push(rec); return; }
      if (net.records.length >= 3000) return;
      net.records.push(rec);
      netById.set(String(params.requestId), rec);
    } else if (method === 'Network.responseReceived') {
      const rec = netById.get(String(params.requestId));
      if (rec && params.response) rec.status = params.response.status;
    } else if (method === 'Network.loadingFinished') {
      const rec = netById.get(String(params.requestId));
      if (rec) { rec.finished = true; rec.finishedAt = at; }
    } else if (method === 'Network.loadingFailed') {
      const rec = netById.get(String(params.requestId));
      if (rec) { rec.failed = true; rec.errorText = params.errorText || null; rec.finishedAt = at; }
    }
  };

  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
  let b: any = null;
  const killChrome = (): void => { try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ } };
  const watchdog = setTimeout(() => {
    if (!out.stop) out.stop = { gate: 'global-timeout', reason: 'run exceeded ' + GLOBAL_CAP_MS + ' ms', at: Date.now(), clicked: budget.clicks > 0 };
    try { save(); } catch { /* ignore */ }
    killChrome();
    process.exit(3);
  }, GLOBAL_CAP_MS);
  let captureStarted = false;
  let captureStopped = false;
  const anomalies: string[] = [];
  const recordStop = (e: any): void => {
    if (out.stop) return;
    out.stop = { gate: e instanceof Gate ? e.gate : 'unexpected-error', reason: String(e && e.message ? e.message : e), at: Date.now(), clicked: budget.clicks > 0, captureStarted };
    if (!(e instanceof Gate)) out.fatal = out.stop.reason;
  };

  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    if (!ver) throw new Gate('chrome-not-reachable', 'chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    b = await connect(ver.webSocketDebuggerUrl, onEvent);
    const load = await b.send('Extensions.loadUnpacked', { path: DIST });
    out.extensionId = load.id;
    await sleep(1500);

    // ---- the single navigation of this run ----
    // about:blank is created first so that Page and Network listeners are already subscribed when the target request starts: that is what makes the redirect chain visible.
    // The one navigation to the target happens in the Runtime Capture not-yet-started phase and is not a document switch inside the capture window. No reload and no second navigation follow.
    const page = await b.send('Target.createTarget', { url: 'about:blank' });
    save();
    await sleep(600);
    const pageSid: string = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    ref.pageSid = pageSid;
    ref.phase = 'preNavigation';
    await b.send('Page.enable', {}, pageSid);
    try {
      await b.send('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 }, pageSid);
      net.enabled = true;
    } catch (e1: any) {
      try { await b.send('Network.enable', {}, pageSid); net.enabled = true; net.enableNote = 'enabled without buffer limits after: ' + String(e1 && e1.message ? e1.message : e1); } catch (e2: any) { net.enableError = String(e2 && e2.message ? e2.message : e2); }
    }
    const loadNav: any[] = [];
    out.loadNavigation = { requestedUrl: TARGET, requestedAt: null, mainFrameId: null, navigations: loadNav, redirectChain: [], redirected: false, finalDocumentUrl: null, listenerPhase: 'preNavigation' };
    const loadListener = (method: string, params: any, sessionId?: string): void => {
      if (sessionId !== pageSid) return;
      if (method === 'Page.frameNavigated' && params.frame && !params.frame.parentId) loadNav.push({ kind: 'frameNavigated', url: params.frame.url, frameId: params.frame.id, loaderId: params.frame.loaderId, at: Date.now() });
      else if (method === 'Page.navigatedWithinDocument') loadNav.push({ kind: 'navigatedWithinDocument', url: params.url, at: Date.now() });
      else if (method === 'Page.loadEventFired') loadNav.push({ kind: 'loadEventFired', at: Date.now() });
    };
    b.addListener(loadListener);
    out.loadNavigation.requestedAt = Date.now();
    await b.send('Page.navigate', { url: TARGET }, pageSid);
    budget.pageLoads = 1;
    save();
    await sleep(5000);
    const ft = await b.send('Page.getFrameTree', {}, pageSid);
    ref.mainFrameId = ft.frameTree.frame.id;
    out.initialDocument = { frameId: ft.frameTree.frame.id, loaderId: ft.frameTree.frame.loaderId, url: ft.frameTree.frame.url, note: 'read through Page.getFrameTree after the single Page.navigate; the redirect chain is in loadNavigation' };
    b.removeListener(loadListener);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);

    const ev = async (sid: string, expr: string, awaitPromise = false, userGesture = false): Promise<any> => {
      const r = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    const evT = async (sid: string, expr: string, ms = 12000): Promise<any> => {
      try { return await Promise.race([ev(sid, expr), sleep(ms).then(() => ({ timeout: true }))]); } catch (e: any) { return { error: String(e && e.message ? e.message : e) }; }
    };
    const step = async (name: string, fn: () => Promise<any>): Promise<any> => {
      let v: any;
      const t0 = Date.now();
      try { v = await fn(); } catch (e: any) { v = { error: String(e && e.message ? e.message : e) }; if (e instanceof Gate) v.gate = e.gate; }
      const ms = Date.now() - t0;
      if (v && typeof v === 'object' && !Array.isArray(v)) v.ms = ms; else v = { value: v, ms };
      out.steps[name] = v;
      save();
      return v;
    };
    // A gate step: any error or timeout stops the run with an explicit stop reason. Nothing is retried.
    const must = async (name: string, fn: () => Promise<any>): Promise<any> => {
      const v = await step(name, fn);
      if (v && (v.error || v.timeout)) throw new Gate(v.gate || name, v.error ? String(v.error) : 'timeout');
      return v;
    };
    const srcMeta = (r: any): any => { if (!r || typeof r !== 'object') return r; const m = { ...r }; delete m.source; return m; };

    const tg0 = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    if (!dt) throw new Gate('devtools-frontend-missing', 'no devtools frontend target');
    const dsid: string = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    await step('show', () => ev(dsid, SHOW, true));
    await sleep(2500);
    const findPanel = async (): Promise<string> => { const tg = await b.send('Target.getTargets'); const pt = tg.targetInfos.find((t: any) => String(t.url).includes(load.id + '/panel.html')); return pt ? (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId : ''; };
    const psid: string = await findPanel();
    if (!psid) throw new Gate('panel-missing', 'panel iframe not found');
    const click = (id: string) => ev(psid, `document.getElementById('${id}').click();1`, false, true);
    const reshow = async (): Promise<void> => { await ev(dsid, SHOW, true); await sleep(1200); };

    let swSid = '';
    let tabId: any = null;
    const getSw = async (): Promise<string> => {
      if (!swSid) { const tg = await b.send('Target.getTargets'); const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id + '/background.js')); if (!sw) throw new Error('SW not found'); swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId; }
      if (tabId === null) tabId = await ev(psid, 'chrome.devtools.inspectedWindow.tabId');
      return swSid;
    };
    const engine = async (full: boolean): Promise<any> => {
      try {
        const sid = await getSw();
        const expr = `(function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var s=t.getCaptureState(${tabId});if(!s)return {hook:true,state:null};return {hook:true,active:s.active,breakpoints:s.breakpoints,breakpointsByScript:s.breakpointsByScript,stats:s.stats,count:s.captures.length${full ? ',captures:s.captures,stability:s.stability' : ''}}})()`;
        return await ev(sid, expr);
      } catch (e: any) { swSid = ''; return { error: String(e && e.message ? e.message : e) }; }
    };
    // Status reads are short and bounded: one hung read costs a few seconds, not the whole connect window. A failed or timed-out read drops the cached session so the next poll re-attaches.
    const swStatus = async (ms = 8000): Promise<string> => {
      const read = async (): Promise<any> => { const sid = await getSw(); return await ev(sid, `(function(){var t=globalThis.__obRecoverTest;return t?t.getStatus(${tabId}):'no-hook'})()`); };
      try {
        const r: any = await Promise.race([read(), sleep(ms).then(() => ({ readTimeout: true }))]);
        if (r && typeof r === 'object' && r.readTimeout) { swSid = ''; return 'read-timeout'; }
        if (r && typeof r === 'object' && r.error) { swSid = ''; return 'error:' + String(r.error); }
        return String(r);
      } catch (e: any) { swSid = ''; return 'error:' + String(e && e.message ? e.message : e); }
    };
    // Panel free status read. The panel main thread can be busy for minutes analysing a large script, and then every read that goes through it looks like a service worker timeout.
    const swStatusDirect = async (ms = 8000): Promise<any> => {
      try {
        const tg = await b.send('Target.getTargets');
        const sw = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(load.id + '/background.js'));
        if (!sw) return { status: 'sw-target-missing' };
        const sid: string = swSid || (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
        swSid = sid;
        const r: any = await Promise.race([ev(sid, SW_DIRECT_STATUS, true), sleep(ms).then(() => ({ readTimeout: true }))]);
        if (r && typeof r === 'object' && r.readTimeout) return { status: 'read-timeout', path: 'panel-free' };
        if (r && typeof r === 'object' && (r.error || r.thrown || r.noTab)) return { status: 'unavailable', detail: r.error || r.thrown || r };
        if (r && typeof r === 'object' && r.status !== undefined) return { status: String(r.status), tabId: r.tabId, path: 'panel-free' };
        return { status: 'unexpected', raw: r };
      } catch (e: any) { return { status: 'threw', error: String(e && e.message ? e.message : e) }; }
    };
    // The panel script list is fed by the background script collector: this asks it for the same list, without any source text.
    const listScripts = async (): Promise<any> => {
      const sid = await getSw();
      const expr = `(async function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var got=null;var port={postMessage:function(m){if(m&&m.type==='list-scripts-response')got=m}};await t.handlePanelCommand({type:'debugger-list-scripts',tabId:${tabId}},port);if(!got)return {ok:false,error:'no response'};var d=got.data||{};var s=d.scripts||[];return {ok:got.ok,error:got.error||null,count:s.length,scripts:s.map(function(x){return {scriptId:x.scriptId,url:x.url,startLine:x.startLine,startColumn:x.startColumn,sourceChars:typeof x.source==='string'?x.source.length:null}})}})()`;
      return await ev(sid, expr, true);
    };
    const readSource = async (scriptId: string): Promise<any> => {
      const sid = await getSw();
      const expr = `(async function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var got=null;var port={postMessage:function(m){if(m&&m.type==='get-source-response')got=m}};await t.handlePanelCommand({type:'debugger-get-source',tabId:${tabId},scriptId:'${scriptId}'},port);return got?{ok:got.ok,error:got.error||null,source:got.data&&typeof got.data.source==='string'?got.data.source:null}:{ok:false,error:'no response'}})()`;
      const r = await ev(sid, expr, true);
      if (r && typeof r.source === 'string') return { ok: r.ok, scriptId, chars: r.source.length, bytes: Buffer.byteLength(r.source, 'utf8'), sha256: shaStr(r.source), source: r.source };
      return { scriptId, result: r };
    };
    // Document identity is timeOrigin + loaderId + frameId. The address bar is NOT identity: pushState changes it inside one document.
    const docId = async (): Promise<any> => {
      const r = await evT(pageSid, `JSON.stringify({href:location.href,title:document.title,ready:document.readyState,timeOrigin:performance.timeOrigin})`);
      if (typeof r !== 'string') return { ok: false, reason: 'document identity unreadable', raw: r };
      let d: any;
      try { d = JSON.parse(r); } catch { return { ok: false, reason: 'document identity not JSON', raw: r }; }
      let frame: any = null;
      try { frame = (await b.send('Page.getFrameTree', {}, pageSid)).frameTree.frame; } catch (e: any) { return { ok: false, reason: 'frame tree unreadable: ' + String(e && e.message ? e.message : e), href: d.href }; }
      const href = String(d.href || '');
      const bad = href === 'about:blank' || href.startsWith('chrome-error://') || href === '';
      return { ok: !bad && d.ready === 'complete', bad, href, title: d.title, ready: d.ready, timeOrigin: d.timeOrigin, loaderId: frame.loaderId, frameId: frame.id };
    };
    const sameDoc = (a: any, c: any): boolean => !!a && !!c && a.timeOrigin === c.timeOrigin && a.loaderId === c.loaderId && a.frameId === c.frameId;

    let docBefore: any = null;
    let targetScriptId = '';
    let listedScripts: any[] = [];
    const sourceStrings: Record<string, any> = {};
    out.captureWindow = { startedAt: null, stoppedAt: null, docBefore: null, docAfter: null, navigationsDuringCapture: [] };

    const finalizeStop = async (): Promise<void> => {
      await step('stopCapture', async () => {
        await click('btn-cap-stop');
        await sleep(1500);
        out.captureWindow.stoppedAt = Date.now();
        const docAfter = await docId();
        out.captureWindow.docAfter = docAfter;
        const navDuring = nav.filter((n: any) => n.at >= (out.captureWindow.startedAt || 0));
        out.captureWindow.navigationsDuringCapture = navDuring;
        const fullNav = navDuring.filter((n: any) => n.kind === 'frameNavigated' || n.kind === 'loadEventFired').length;
        if (fullNav > 0) anomalies.push('full document navigation inside the capture window: ' + fullNav);
        return {
          panel: await evT(psid, PANEL),
          engine: await engine(false),
          pageResponsive: (await evT(pageSid, '1+1')) === 2,
          docAfter,
          sameDocumentAsBeforeCapture: sameDoc(docBefore, docAfter),
          fullDocumentNavigationsInCaptureWindow: fullNav,
          sameDocumentNavigationsInCaptureWindow: navDuring.filter((n: any) => n.kind === 'navigatedWithinDocument').length,
          durationMs: out.captureWindow.stoppedAt - (out.captureWindow.startedAt || out.captureWindow.stoppedAt),
        };
      });
      captureStopped = true;
    };

    try {
      // ---- before anything else: is this document actually the target page? A login page or any other page stops the run here, before connecting, before capture, before any click ----
      await must('targetDocumentIdentity', async () => {
        const t0 = Date.now();
        let d: any = null;
        while (Date.now() - t0 < 60000) {
          d = await docId();
          if (d.ok) break;
          // A document that is not the target page must not be waited on either: bail out as soon as the address says something else.
          if (d.href && d.href !== 'about:blank' && d.href.indexOf('chrome-error://') !== 0 && d.href.indexOf(TARGET_HOST + TARGET_PATH) < 0) break;
          await sleep(1000);
        }
        if (!d || !d.ok) throw new Gate('document-not-ready', 'target document never became ready: ' + JSON.stringify(d));
        let parsed: any = null;
        try { const u = new URL(String(d.href)); parsed = { protocol: u.protocol, host: u.host, pathname: u.pathname, search: u.search.length > 0 }; } catch { parsed = null; }
        const info: any = {
          href: d.href,
          title: d.title,
          loaderId: d.loaderId,
          frameId: d.frameId,
          parsed,
          identitySource: 'location.href read in the page plus Page.getFrameTree, after the single Page.navigate',
          expected: { host: TARGET_HOST, path: TARGET_PATH },
          waitedMs: Date.now() - t0,
          loadNavigation: out.loadNavigation,
        };
        out.targetDocument = info;
        out.loadNavigation.finalDocumentUrl = d.href;
        out.loadNavigation.redirectChain = loadNav.filter((n: any) => n.kind === 'frameNavigated').map((n: any) => ({ url: n.url, loaderId: n.loaderId, at: n.at }));
        out.loadNavigation.redirected = out.loadNavigation.redirectChain.length > 1;
        save();
        if (!parsed) throw new Gate('unexpected-document', 'the loaded document URL cannot be parsed as a URL: ' + d.href);
        if (parsed.host !== TARGET_HOST) throw new Gate('unexpected-document', 'loaded host ' + parsed.host + ' is not the target host ' + TARGET_HOST + ' (href ' + d.href + ', title ' + d.title + ')');
        if (parsed.pathname === LOGIN_PATH_MARKER + '.html' || parsed.pathname.indexOf(LOGIN_PATH_MARKER) === 0) throw new Gate('unexpected-document', 'the site served a login page instead of the target page: ' + d.href + ' (title ' + d.title + '); the run never logs in and never uses any credential');
        if (parsed.pathname !== TARGET_PATH) throw new Gate('unexpected-document', 'loaded path ' + parsed.pathname + ' is not the target path ' + TARGET_PATH + ' (href ' + d.href + ')');
        return { ...info, matched: true };
      });
      await step('pageInfo', () => evT(pageSid, `JSON.stringify({title:document.title,href:location.href,ready:document.readyState,scripts:[].map.call(document.scripts,function(s){return s.src||'(inline)'}).filter(function(s){return s.indexOf('hpailist')>=0||s.indexOf('combo')>=0}).slice(0,10)})`));

      await must('connect', async () => {
        const c = await ev(psid, `document.getElementById('btn-rt-connect').click();1`, false, true);
        if (c && c.error) throw new Gate('connect-failed', 'connect click failed: ' + c.error);
        const t0 = Date.now();
        let status = '';
        const trace: any[] = [];
        const diagnose = async (): Promise<void> => {
          const direct = await swStatusDirect(5000);
          const panelRead = await evT(psid, PANEL_CONNECT, 6000);
          out.connectDiagnostics = {
            trace,
            panelFreeStatus: direct,
            panel: panelRead,
            lastPanelStatusRead: status,
            panelReadThroughPanel: status,
            note: 'saved because the connect gate failed; the connect button was clicked once and is never clicked again. panelFreeStatus does not go through the panel main thread; the panel field is exactly the read that does.',
            stageReached: 'connect wait',
            connectButton: 'clicked once',
          };
          save();
        };
        while (Date.now() - t0 < 45000) {
          await sleep(1000);
          status = await swStatus(5000);
          const direct = await swStatusDirect(3000);
          if (trace.length < 200) trace.push({ atMs: Date.now() - t0, throughPanel: status, panelFree: direct });
          if (status === 'connected' || direct.status === 'connected') return { status: 'connected', ms: Date.now() - t0, polls: trace.length, throughPanel: status, panelFreeAtSuccess: direct };
          if (status === 'error' && direct.status === 'error') { await diagnose(); throw new Gate('connect-failed', 'debugger reported the error status after the single connect click (both the panel read and the panel-free read)'); }
        }
        await diagnose();
        if (trace.length > 0 && trace.every((x: any) => x.throughPanel === 'read-timeout') && trace.some((x: any) => x.panelFree === 'connected')) {
          throw new Gate('connect-timeout-panel-blocked', 'the panel-free status read reported connected while every read through the panel timed out: the debugger did connect, the panel main thread did not answer. last panel-free: ' + JSON.stringify(trace[trace.length - 1].panelFree));
        }
        throw new Gate('connect-timeout', 'debugger never reported connected within 45 s, last status through panel: ' + status + ', panel-free: ' + JSON.stringify(trace.length ? trace[trace.length - 1].panelFree : null) + ', polls: ' + trace.length);
      });
      await must('discovery', async () => {
        const r: any = await evT(psid, DEC, 24000);
        if (!r || r.timeout || r.error) {
          const direct = await swStatusDirect(5000);
          out.discoveryDiagnostics = {
            panelRead: r,
            panelFreeStatus: direct,
            interpretation: direct.status === 'connected' && r && r.timeout ? 'the panel main thread did not answer the discovery read while the panel-free status read reports connected: the blocked layer is the panel, not the debugger' : 'see panelRead and panelFreeStatus',
            note: 'saved because the discovery gate failed; nothing is retried',
          };
          save();
          throw new Gate(r && r.timeout ? 'discovery-failed-panel-blocked' : 'discovery-failed', 'discovery probe failed: ' + JSON.stringify(r) + ' panel-free status: ' + JSON.stringify(direct));
        }
        return r;
      });
      await must('waitForScripts', async () => {
        const t0 = Date.now();
        let last: any = [];
        while (Date.now() - t0 < 60000) {
          const r = await evT(psid, SCRIPTS, 12000);
          if (Array.isArray(r)) {
            last = r;
            if (r.some((t: any) => String(t).indexOf(TARGET_SCRIPT_URL + ' | ') === 0)) return { found: true, ms: Date.now() - t0, listCount: r.length };
          }
          await sleep(1000);
        }
        throw new Gate('target-script-missing', 'target script never appeared in the panel script list: ' + JSON.stringify(last));
      });
      await must('analysisSettle', async () => {
        const t0 = Date.now();
        let prev = '';
        let same = 0;
        let last: any = null;
        let reads = 0;
        while (Date.now() - t0 < 90000) {
          const r = await evT(psid, DEC, 15000);
          reads++;
          if (r && !r.timeout && !r.error) {
            last = r;
            const key = [r.analyzed, r.candidates, r.total].join('|');
            if (key === prev) same++; else { same = 0; prev = key; }
            if (same >= 3 && Number(r.candidates) > 0) return { stable: true, reads, last, ms: Date.now() - t0 };
          }
          await sleep(2000);
        }
        throw new Gate('analysis-not-settled', 'panel analysis never settled within 90 s: ' + JSON.stringify(last));
      });
      await must('targetScript', async () => {
        const r = await listScripts();
        if (!r || r.ok !== true || !Array.isArray(r.scripts)) throw new Gate('script-list-failed', JSON.stringify(r).slice(0, 300));
        listedScripts = r.scripts;
        const m = r.scripts.filter((s: any) => String(s.url) === TARGET_SCRIPT_URL);
        if (m.length !== 1) throw new Gate('target-script-not-unique', 'expected exactly one script with the target URL, found ' + m.length);
        if (Number(m[0].startLine || 0) !== 0 || Number(m[0].startColumn || 0) !== 0) throw new Gate('target-script-offset', 'target script has a start offset: ' + JSON.stringify(m[0]));
        targetScriptId = String(m[0].scriptId);
        return { scriptId: targetScriptId, totalScripts: r.count, matches: m.length, panelListChecked: true, source: 'background script collector, the data source of the panel script list' };
      });
      await must('sourceHashBeforeCapture', async () => {
        const r = await readSource(targetScriptId);
        if (!r || typeof r.sha256 !== 'string') throw new Gate('source-unreadable', JSON.stringify(r && r.result ? r.result : r).slice(0, 300));
        sourceStrings.before = r.source;
        const m = srcMeta(r);
        out.sourceCheck = { ...m, equalsReference: r.sha256 === REF_SHA };
        save();
        if (r.sha256 !== REF_SHA) throw new Gate('version-mismatch', 'hpailist-2 sha256 ' + r.sha256 + ' differs from the archived reference ' + REF_SHA + ' (chars ' + r.chars + ', bytes ' + r.bytes + '): stopped before capture and before the click');
        return { ...m, equalsReference: true };
      });
      docBefore = await docId();
      out.captureWindow.docBefore = docBefore;
      if (!docBefore.ok) throw new Gate('document-not-ready', 'document not ready right before capture: ' + JSON.stringify(docBefore));
      out.resourceTiming = { beforeCapture: await evT(pageSid, RES_SNAPSHOT, 8000) };
      save();

      // ---- capture ----
      ref.phase = 'captureIdle';
      await must('startCapture', async () => {
        await ev(psid, `document.querySelector('.dock-tab[data-pane=capture]').click();1`, false, true);
        await sleep(400);
        await click('btn-cap-start');
        captureStarted = true;
        out.captureWindow.startedAt = Date.now();
        const t0 = Date.now();
        let prev = -1;
        let same = 0;
        let st: any = null;
        while (Date.now() - t0 < 45000) {
          await sleep(1500);
          st = await engine(false);
          if (st && st.active && st.breakpoints > 0) {
            if (st.breakpoints === prev) same++; else { same = 0; prev = st.breakpoints; }
            if (same >= 2) break;
          }
        }
        return { panel: await evT(psid, PANEL), engine: st, waitedMs: Date.now() - t0 };
      });

      // ---- gates before the single click: any failure stops the run, no click, no retry, no reload ----
      const gates: any[] = [];
      out.preClickGates = gates;
      const gate = (name: string, ok: boolean, detail: any): void => {
        gates.push({ name, ok, detail });
        save();
        if (!ok) throw new Gate(name, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500));
      };
      const s1 = await swStatus();
      const s1d = await swStatusDirect();
      gate('cdp-connected', s1 === 'connected' || s1d.status === 'connected', { throughPanel: s1, panelFree: s1d, note: 'connected is accepted from either read; when only the panel-free read reports connected, the panel main thread is the blocked layer' });
      gate('discovery-ok', !!out.steps.discovery && !out.steps.discovery.error && !out.steps.discovery.timeout, { candidates: out.steps.discovery && out.steps.discovery.candidates });
      gate('target-script-unique', targetScriptId !== '', { scriptId: targetScriptId, url: TARGET_SCRIPT_URL });
      gate('source-hash-matches-reference', !!out.steps.sourceHashBeforeCapture && out.steps.sourceHashBeforeCapture.sha256 === REF_SHA, { sha256: out.steps.sourceHashBeforeCapture && out.steps.sourceHashBeforeCapture.sha256 });
      const stNow: any = await engine(false);
      const byScript: Record<string, number> = stNow && stNow.breakpointsByScript ? stNow.breakpointsByScript : {};
      const bpsTarget = Number(byScript[targetScriptId] || 0);
      out.breakpointCoverage = {
        scriptId: targetScriptId,
        targetScriptBreakpoints: bpsTarget,
        total: stNow && stNow.breakpoints,
        active: stNow && stNow.active,
        byScript: Object.keys(byScript).map((id: string) => { const s = listedScripts.find((x: any) => String(x.scriptId) === id); return { scriptId: id, url: s ? s.url : null, breakpoints: byScript[id] }; }),
        note: 'analysis of the target script is evidenced by candidates being selected and breakpoints being set on its scriptId',
      };
      gate('target-script-analysed-and-breakpoints-set', !!stNow && stNow.active === true && bpsTarget > 0, out.breakpointCoverage);
      const d1 = await docId();
      const fullSinceStart = nav.filter((n: any) => n.at >= (out.captureWindow.startedAt || 0) && (n.kind === 'frameNavigated' || n.kind === 'loadEventFired')).length;
      gate('document-identity-unchanged', d1.ok === true && sameDoc(docBefore, d1) && fullSinceStart === 0, { before: docBefore, now: d1, fullDocumentNavigationsSinceCaptureStart: fullSinceStart });
      const remainingAfterLoad = remainingBefore - budget.pageLoads;
      gate('budget-sufficient-for-one-click', remainingAfterLoad >= 1, { remainingBefore, pageLoads: budget.pageLoads, remainingAfterLoad, clickUnits: 1 });
      const resp = await evT(pageSid, '1+1', 8000);
      gate('page-responsive', resp === 2, { resp });
      const baseSnap: any = await evT(pageSid, RES_SNAPSHOT, 8000);
      const nb: any = await evT(pageSid, nextProbe(NEXT_CLS), 12000);
      out.nextButton.probe = nb;
      gate('next-button-present-and-enabled', !!nb && nb.found === true && nb.disabled === false && nb.visible === true && nb.covered === false && typeof nb.x === 'number' && typeof nb.y === 'number', nb);

      // ---- the one real click ----
      ref.phase = 'postClick';
      const clickAt = Date.now();
      budget.clicks = 1;
      out.click = { attempted: true, at: clickAt, method: 'Input.dispatchMouseEvent', x: nb.x, y: nb.y, events: [], note: 'one real mouse click at the center of the next-page anchor; never retried' };
      save();
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        try {
          const params: any = { type, x: nb.x, y: nb.y };
          if (type !== 'mouseMoved') { params.button = 'left'; params.clickCount = 1; }
          await b.send('Input.dispatchMouseEvent', params, pageSid);
          out.click.events.push({ type, ok: true, at: Date.now() });
        } catch (e: any) {
          out.click.events.push({ type, ok: false, error: String(e && e.message ? e.message : e), at: Date.now() });
          anomalies.push('mouse event ' + type + ' failed: the click may be incomplete and was not retried');
          break;
        }
      }
      save();

      // ---- wait for the GetPageList response, then a fixed tail, 60 s hard cap in total ----
      const deadline = clickAt + CLICK_HARD_CAP_MS;
      let completedAt: number | null = null;
      let signal: string | null = null;
      const baseGpl: number | null = baseSnap && Array.isArray(baseSnap.gpl) ? baseSnap.gpl.length : null;
      while (Date.now() < deadline && completedAt === null) {
        await sleep(500);
        const rec = net.records.find((r: any) => r.phase === 'postClick' && r.method === 'POST' && String(r.hostPath).indexOf(GPL_PATH) >= 0 && (r.finished || r.failed));
        if (rec) { completedAt = rec.finishedAt; signal = rec.failed ? 'network:loadingFailed' : 'network:loadingFinished'; break; }
        if (baseGpl !== null) {
          const snap: any = await evT(pageSid, RES_SNAPSHOT, 6000);
          if (snap && Array.isArray(snap.gpl) && snap.gpl.length > baseGpl && snap.gpl[snap.gpl.length - 1].end > 0) { completedAt = Date.now(); signal = 'resource-timing'; }
        }
      }
      const waitedMs = Date.now() - clickAt;
      const tailMs = completedAt === null ? 0 : Math.max(0, Math.min(CLICK_TAIL_MS, deadline - Date.now()));
      await sleep(tailMs);
      out.click.result = { completed: completedAt !== null, signal, completedAfterMs: completedAt === null ? null : completedAt - clickAt, waitedMs, tailMs, hardCapMs: CLICK_HARD_CAP_MS, hardCapReached: completedAt === null };
      if (completedAt === null) anomalies.push('no GetPageList completion within ' + CLICK_HARD_CAP_MS + ' ms of the click');
      if (signal === 'network:loadingFailed') anomalies.push('the GetPageList request failed');
      save();

      // ---- evidence only from here on: no further interaction with the site ----
      const docAfterClick = await docId();
      const navSince = nav.filter((n: any) => n.at >= clickAt);
      const cnt = (k: string): number => navSince.filter((n: any) => n.kind === k).length;
      const nv = { frameNavigated: cnt('frameNavigated'), loadEventFired: cnt('loadEventFired'), navigatedWithinDocument: cnt('navigatedWithinDocument') };
      const afterSnap: any = await evT(pageSid, RES_SNAPSHOT, 8000);
      out.afterClick = {
        document: docAfterClick,
        sameDocumentAsBeforeCapture: sameDoc(docBefore, docAfterClick),
        navigations: nv,
        expected: { fullDocumentNavigations: 0, sameDocumentNavigations: 1 },
        navigationAsExpected: nv.frameNavigated === 0 && nv.loadEventFired === 0 && nv.navigatedWithinDocument === 1,
        hrefChanged: !!docBefore && !!docAfterClick && docBefore.href !== docAfterClick.href,
      };
      out.resourceTiming.afterClick = afterSnap;
      out.resourceTiming.newEntriesHostPath = afterSnap && Array.isArray(afterSnap.names) && baseSnap && typeof baseSnap.total === 'number' ? afterSnap.names.slice(baseSnap.total) : null;
      if (nv.frameNavigated + nv.loadEventFired > 0) anomalies.push('full document navigation after the click');
      if (nv.navigatedWithinDocument !== 1) anomalies.push('same-document navigations after the click: ' + nv.navigatedWithinDocument + ', expected 1');
      if (!sameDoc(docBefore, docAfterClick)) anomalies.push('document identity changed after the click');
      save();

      await reshow();
      await step('scripts', async () => ({ list: await evT(psid, SCRIPTS) }));
      await step('engineRaw', () => engine(true));
      const raw = out.steps.engineRaw;
      const caps: any[] = raw && Array.isArray(raw.captures) ? raw.captures : [];
      const mine = caps.filter((c: any) => c.scriptUrl === TARGET_SCRIPT_URL);
      const ids = Array.from(new Set(mine.map((c: any) => String(c.scriptId))));
      out.scriptIdCrossCheck = { listedScriptId: targetScriptId, recordsForTarget: mine.length, scriptIdsInRecords: ids, result: mine.length === 0 ? 'no-records-for-target' : (ids.length === 1 && ids[0] === targetScriptId ? 'match' : 'MISMATCH') };
      if (out.scriptIdCrossCheck.result === 'MISMATCH') anomalies.push('scriptId in capture records does not match the scriptId from the script list');
      out.truncation = {
        truncatedRecords: caps.filter((c: any) => c.observationsTruncated).length,
        truncatedTargetRecords: mine.filter((c: any) => c.observationsTruncated).length,
        note: 'records with observationsTruncated=true are incomplete evidence and must not be counted as complete observations',
      };
      save();
      await step('sourceReadAfterClick', async () => { const r = await readSource(targetScriptId); sourceStrings.afterClick = r && r.source; return srcMeta(r); });
      await step('selectScript', async () => {
        await reshow();
        let sel: any = null;
        for (let i = 0; i < 20 && !sel; i++) { const r = await evT(psid, SELECT_SCRIPT); if (r && r.found) sel = r; else await sleep(400); }
        await sleep(1200);
        return { selection: sel, panes: await evT(psid, PANES) };
      });
      await step('dryRun', async () => { await click('btn-cap-dryrun'); await sleep(1200); return await evT(psid, DRYRUN); });
      await step('apply', async () => {
        await reshow();
        const before = await evT(psid, APPLY_STATE);
        await click('btn-cap-apply');
        await sleep(500);
        let st: any = null;
        for (let i = 0; i < 60; i++) {
          const r = await evT(psid, APPLY_STATE);
          if (r && r.disabled === false && typeof r.text === 'string' && r.text.indexOf('正在执行') < 0 && r.text.length > 0) { st = r; break; }
          await sleep(500);
        }
        return { before, after: st, panes: await evT(psid, PANES) };
      });
      await step('sourceReadAfterApply', async () => { const r = await readSource(targetScriptId); sourceStrings.afterApply = r && r.source; return srcMeta(r); });
      const h = (k: string): string | null => (out.steps[k] && out.steps[k].sha256) || null;
      out.sourceIntegrity = {
        listedScriptId: targetScriptId,
        referenceSha256: REF_SHA,
        beforeCapture: h('sourceHashBeforeCapture'),
        afterClick: h('sourceReadAfterClick'),
        afterApply: h('sourceReadAfterApply'),
        allEqualReference: [h('sourceHashBeforeCapture'), h('sourceReadAfterClick'), h('sourceReadAfterApply')].every((x) => x === REF_SHA),
        stringsIdenticalBeforeCaptureAndAfterApply: typeof sourceStrings.before === 'string' && sourceStrings.before === sourceStrings.afterApply,
      };
      save();
    } catch (e: any) {
      recordStop(e);
    }

    if (captureStarted && !captureStopped) {
      try { await finalizeStop(); } catch (e: any) { out.finalizeError = String(e && e.message ? e.message : e); }
    }
    if (!out.stop) {
      out.stop = { gate: budget.clicks > 0 ? (anomalies.length ? 'completed-with-anomalies' : 'completed') : 'no-click', anomalies, at: Date.now(), clicked: budget.clicks > 0, captureStarted };
    } else {
      out.stop.anomalies = anomalies;
    }
  } catch (e: any) {
    recordStop(e);
  } finally {
    clearTimeout(watchdog);
    try { if (b) b.close(); } catch { /* ignore */ }
    killChrome();
    const priorAfter = hashPrior();
    out.priorEvidence.after = priorAfter;
    out.priorEvidence.unchanged = JSON.stringify(out.priorEvidence.before) === JSON.stringify(priorAfter);
    budget.unitsConsumed = budget.pageLoads + budget.clicks;
    budget.ledgerRemainingAfter = remainingBefore - budget.unitsConsumed;
    if (budget.unitsConsumed > 0) {
      try {
        const lg: any = JSON.parse(readFileSync(LEDGER, 'utf8'));
        lg.entries.push({ id: RUN_ID, units: budget.unitsConsumed, source: 'written by the runner at the end of the run from its own counters: pageLoads ' + budget.pageLoads + ', clicks ' + budget.clicks, recordedBy: 'runner', stop: out.stop ? out.stop.gate : null, evidenceFile: 'run-20261110T1458Z/observed/raw-run.' + RUN_ID + '.json' });
        lg.used = Number(lg.used) + budget.unitsConsumed;
        lg.remaining = Number(lg.budget) - lg.used;
        writeFileSync(LEDGER, JSON.stringify(lg, null, 2));
        budget.ledgerWritten = true;
      } catch (e: any) { budget.ledgerWriteError = String(e && e.message ? e.message : e); }
    }
    try { save(); } catch { /* ignore */ }
  }
  console.log('done stop=' + (out.stop ? out.stop.gate : 'none') + ' fatal=' + (out.fatal ?? 'none') + ' pageLoads=' + budget.pageLoads + ' clicks=' + budget.clicks + ' steps=' + Object.keys(out.steps).length + ' out=' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
