import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Phase 4.7 offline connect diagnosis. LOCAL pages only: a local HTTP server on 127.0.0.1 and the real OB-Recover extension in a real, headful Chrome with its own profile.
// Chrome runs with host resolution switched off for everything except 127.0.0.1, so this run cannot reach any external site, the L1 target included.
// Observation only: nothing under src/ is touched, nothing is retried, the connect button is clicked once, every wait is bounded, and nothing is judged here.
// Scenario A = minimal page + small script. B = minimal page + a generated script of about 500 KB with real syntax. C = the archived combo?font script, which exists only if a legitimate archive does.
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const SCENARIO = String(process.env.SCENARIO || 'A').toUpperCase();
const RUN_NO = String(process.env.RUN_NO || '1');
const OUT = ROOT + '/test/acceptance/p47-offline-connect-diag-' + SCENARIO + '-run' + RUN_NO + '.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9473;
const HTTP = 8783;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-offline-diag-profile-' + SCENARIO;
const HEADLESS = process.env.HEADLESS === '1';
const PROFILE_PANEL = process.env.PROFILE_PANEL === '1';
const LAZY_TABID = process.env.LAZY_TABID === '1';
const CMD_TIMEOUT_MS = 8000;
const PROBE_TIMEOUT_MS = 3000;
const CONNECT_WINDOW_MS = 45000;
const GLOBAL_CAP_MS = 5 * 60 * 1000;
const PAGE_URL = 'http://127.0.0.1:' + HTTP + '/index.html';
const JS_URL = 'http://127.0.0.1:' + HTTP + '/app.js';
const RESOLVER_RULES = 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1';
const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));
const sha = (b: any): string => createHash('sha256').update(b).digest('hex');
const short = (s: any, n = 300): string => String(s === undefined || s === null ? '' : s).slice(0, n);
const slim = (v: any, n = 300): any => { if (v === undefined) return null; const s = typeof v === 'string' ? v : JSON.stringify(v); return s !== undefined && s.length <= n ? v : short(s, n); };
const NL = String.fromCharCode(10);

const HTML = `<!doctype html><html><head><meta charset='utf-8'><title>diag-loading</title></head><body><p>offline diagnosis page</p><script src='/app.js'></script></body></html>`;
const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const PANEL_STATE = `(function(){var s=document.getElementById('rt-debugger-status');var b=document.getElementById('btn-rt-connect');var log=document.getElementById('runtime-log');var rows=log?[].slice.call(log.querySelectorAll('.rt-log-entry')):[];return {statusText:s?s.textContent:null,connectDisabled:b?b.disabled:null,logCount:rows.length,logTail:rows.slice(-25).map(function(e){var t=e.querySelector('.rt-time');var m=e.querySelector('.rt-msg');return {level:e.className.replace('rt-log-entry','').trim(),time:t?t.textContent:null,msg:m?String(m.textContent).slice(0,300):null}})}})()`;
const DEC = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};return {total:g('dec-total'),analyzed:g('dec-analyzed'),candidates:g('dec-candidates'),high:g('dec-high'),calls:g('dec-calls')}})()`;
const SCRIPTS = `(function(){return [].slice.call(document.querySelectorAll('#script-list li')).slice(0,40).map(function(l){return l.title+' | '+((l.querySelector('.script-size')||{}).textContent||'')})})()`;
const LAG_INSTALL = `(function(){if(window.__lag)return 'already';var s={start:performance.now(),last:performance.now(),maxGap:0,ticks:0,gaps:[]};window.__lag=s;setInterval(function(){var n=performance.now();var g=n-s.last-100;s.last=n;s.ticks++;if(g>s.maxGap)s.maxGap=g;if(g>500&&s.gaps.length<50)s.gaps.push({at:Math.round(n-s.start),gap:Math.round(g)});},100);return 'installed'})()`;
const LAG_READ = `(function(){var s=window.__lag;if(!s)return {installed:false};return {installed:true,now:Math.round(performance.now()-s.start),ticks:s.ticks,maxGapMs:Math.round(s.maxGap),gaps:s.gaps}})()`;
// Round trip of a plain runtime message from the panel to the service worker (the existing ping handler), independent of the CDP session on the worker.
const PING = `new Promise(function(res){var t0=performance.now();var done=false;var to=setTimeout(function(){if(!done){done=true;res({timeout:true,ms:Math.round(performance.now()-t0)})}},4000);try{chrome.runtime.sendMessage({type:'ping'},function(r){if(done)return;done=true;clearTimeout(to);var le=chrome.runtime.lastError;res({ok:!le&&!!r&&r.type==='pong',ms:Math.round(performance.now()-t0),lastError:le?String(le.message):null})});}catch(e){done=true;clearTimeout(to);res({thrown:String(e&&e.message?e.message:e)})}})`;
const SW_TARGETS = `new Promise(function(res){try{chrome.debugger.getTargets(function(t){res({count:t.length,attached:t.filter(function(x){return x.attached}).map(function(x){return {type:x.type,tabId:x.tabId===undefined?null:x.tabId,extensionId:x.extensionId||null}})})})}catch(e){res({thrown:String(e&&e.message?e.message:e)})}})`;
const swStatusExpr = (tab: number): string => `(function(){var t=globalThis.__obRecoverTest;return t?t.getStatus(${tab}):'no-hook'})()`;
// Panel-independent status read: finds the real tab id from the service worker's own chrome.debugger.getTargets (page target on the local origin), then asks the extension for that tab's status.
const SW_DIRECT = `new Promise(function(res){try{chrome.debugger.getTargets(function(ts){var t=ts.filter(function(x){return x.type==='page'&&String(x.url).indexOf('http://127.0.0.1:${HTTP}/')===0})[0];if(!t||typeof t.tabId!=='number'){res({noTab:true,count:ts.length});return}var g=globalThis.__obRecoverTest;res({tabId:t.tabId,status:g?g.getStatus(t.tabId):'no-hook'})})}catch(e){res({thrown:String(e&&e.message?e.message:e)})}})`;
const listScriptsExpr = (tab: number): string => `(async function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var got=null;var port={postMessage:function(m){if(m&&m.type==='list-scripts-response')got=m}};await t.handlePanelCommand({type:'debugger-list-scripts',tabId:${tab}},port);if(!got)return {ok:false,error:'no response'};var d=got.data||{};var s=d.scripts||[];return {ok:got.ok,error:got.error||null,count:s.length,scripts:s.map(function(x){return {scriptId:x.scriptId,url:x.url,sourceChars:typeof x.source==='string'?x.source.length:null}})}})()`;
const readSourceExpr = (tab: number, sid: string): string => `(async function(){var t=globalThis.__obRecoverTest;if(!t)return {hook:false};var got=null;var port={postMessage:function(m){if(m&&m.type==='get-source-response')got=m}};await t.handlePanelCommand({type:'debugger-get-source',tabId:${tab},scriptId:'${sid}'},port);return got?{ok:got.ok,error:got.error||null,source:got.data&&typeof got.data.source==='string'?got.data.source:null}:{ok:false,error:'no response'}})()`;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genSmall(): string {
  return `var _0xs=['alpha','beta','gamma','delta'];function _0xdec(n){n=n-10;return _0xs[n];}function add(a,b){return a+b;}function pick(i){return _0xdec(10+i%4);}var r=add(1,2)+pick(1).length;document.title='diag-ready';`;
}

// Deterministic, single line, real syntax (functions, loops, switch, try/catch, closures, a string array decoder), no network, no comment padding.
function genLarge(targetBytes: number): string {
  const r = rng(20261110);
  const strs: string[] = [];
  for (let i = 0; i < 300; i++) strs.push(JSON.stringify('s' + Math.floor(r() * 1e9).toString(36)));
  const parts: string[] = [`var _0xarr=[${strs.join(',')}];function _0xdec(n){n=n-100;return _0xarr[n];}`];
  let size = parts[0].length;
  let i = 0;
  while (size < targetBytes) {
    const k = Math.floor(r() * 1000);
    let p = '';
    switch (i % 5) {
      case 0: p = `function fn${i}(a,b){var s=0;for(var k=0;k<a;k++){s+=(k*b)%7;}if(s>10){return s-b;}else{switch(b%3){case 0:return 'x'+s;case 1:return s*2;default:return [s,b].join('-');}}}`; break;
      case 1: p = `var o${i}={m:function(x){try{return x.length+${k};}catch(e){return -1;}},n:${k},p:function(y,z){return y?z:_0xdec(${100 + (k % 300)});}};`; break;
      case 2: p = `function g${i}(t){var r=[];for(var j=0;j<t;j++){r.push(function(q){return q+j;}(j));}return r.length>${k % 9}?r:null;}`; break;
      case 3: p = `var h${i}=function(a,b,c){if(a>b){return c;}while(c<${k % 50}){c+=a;}return c+${k};};`; break;
      default: p = `function d${i}(e){return _0xdec(${100 + (k % 300)})+e;}`;
    }
    parts.push(p);
    size += p.length;
    i++;
  }
  parts.push(`var _0xr=fn0(3,4)+d4(1).length;document.title='diag-ready';`);
  return parts.join('');
}

function connect(wsUrl: string, onEvent?: (method: string, params: any, sessionId?: string) => void): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    const failAll = (why: string): void => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } return; }
      if (onEvent && m.method) { try { onEvent(m.method, m.params || {}, m.sessionId); } catch { /* listener errors must not break CDP */ } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: any = {}, sessionId?: string): Promise<any> {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT_MS + 'ms: ' + method)); }, CMD_TIMEOUT_MS);
          pending.set(i, { resolve: res, reject: rej, timer, method });
          const msg: any = { id: i, method, params };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
        });
      },
      close(): void { ws.close(); },
    });
  });
}

// Counts only. Which layer is at fault is decided from this evidence by the report, never here.
function classify(probes: any[], from: number, to: number): any {
  const sel = probes.filter((p: any) => p.t >= from && p.t < to);
  const keys = ['page', 'devtools', 'panel', 'sw', 'swStatus', 'ping', 'panelState', 'swDirect'];
  const per: Record<string, any> = {};
  for (const k of keys) {
    const xs = sel.map((p: any) => p[k]).filter((x: any) => !!x);
    per[k] = { samples: xs.length, ok: xs.filter((x: any) => x.ok).length, timeouts: xs.filter((x: any) => x.timeout).length, errors: xs.filter((x: any) => !x.ok && !x.timeout).length, maxMs: Math.max(0, ...xs.map((x: any) => x.ms || 0)) };
  }
  let firstBad: any = null;
  for (const p of sel) { const bad = keys.filter((k: string) => p[k] && !p[k].ok); if (bad.length > 0) { firstBad = { t: p.t, failing: bad }; break; } }
  const series: string[] = [];
  for (const p of sel) {
    const s = p.swStatus ? (p.swStatus.ok ? String(p.swStatus.v) : (p.swStatus.timeout ? 'timeout' : 'error')) : 'none';
    const last = series.length > 0 ? series[series.length - 1] : '';
    if (last.indexOf(s + ' x') === 0) { const n = Number(last.slice(s.length + 2)) + 1; series[series.length - 1] = s + ' x' + n; } else series.push(s + ' x1');
  }
  const dseries: string[] = [];
  for (const p of sel) {
    const d = p.swDirect;
    const s = d ? (d.ok ? (d.v && d.v.status !== undefined ? String(d.v.status) : (d.v && d.v.noTab ? 'noTab' : 'other')) : (d.timeout ? 'timeout' : 'error')) : 'none';
    const last = dseries.length > 0 ? dseries[dseries.length - 1] : '';
    if (last.indexOf(s + ' x') === 0) { const n = Number(last.slice(s.length + 2)) + 1; dseries[dseries.length - 1] = s + ' x' + n; } else dseries.push(s + ' x1');
  }
  return { samples: sel.length, per, firstProbeWithAnyFailure: firstBad, swDirectSeries: dseries, everConnectedDirect: dseries.some((s: string) => s.indexOf('connected x') === 0), swStatusSeries: series, everConnected: series.some((s: string) => s.indexOf('connected x') === 0), swStatusTimeouts: per.swStatus.timeouts, interpretation: 'counts only, no cause is stated here' };
}

function summarizeProfile(p: any): any {
  const nodes: any[] = p.nodes || [];
  const byId = new Map<number, any>();
  const parent = new Map<number, number>();
  for (const n of nodes) { byId.set(n.id, n); if (n.children) for (const ch of n.children) parent.set(ch, n.id); }
  const keyOf = (n: any): string => { const f = n.callFrame || {}; return (f.functionName || '(anonymous)') + ' @ ' + short(String(f.url || '').split('/').pop(), 60) + ':' + f.lineNumber + ':' + f.columnNumber; };
  const self = new Map<string, number>();
  const incl = new Map<string, number>();
  const samples: number[] = p.samples || [];
  const deltas: number[] = p.timeDeltas || [];
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = deltas[i] || 0;
    total += d;
    let id: number | undefined = samples[i];
    const leaf = byId.get(id);
    if (!leaf) continue;
    const kl = keyOf(leaf);
    self.set(kl, (self.get(kl) || 0) + d);
    const seen = new Set<string>();
    while (id !== undefined) { const n = byId.get(id); if (!n) break; const k = keyOf(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } id = parent.get(id); }
  }
  const top = (m: Map<string, number>, n: number): any[] => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => ({ fn: e[0], ms: Math.round(e[1] / 1000) }));
  return { samples: samples.length, totalMs: Math.round(total / 1000), topSelf: top(self, 25), topInclusive: top(incl, 25), note: 'approximate: the delta before each sample is attributed to that sample, sampling interval 5 ms; self time is time inside the function itself, inclusive counts each function once per sample' };
}

async function main(): Promise<void> {
  mkdirSync(ROOT + '/test/acceptance', { recursive: true });
  const refuse = (why: string): void => { console.log('REFUSED: ' + why); process.exit(2); };
  if (existsSync(OUT)) { refuse('output exists, never overwritten: ' + OUT); return; }
  if (SCENARIO !== 'A' && SCENARIO !== 'B' && SCENARIO !== 'C') { refuse('unknown scenario ' + SCENARIO); return; }
  const T0 = Date.now();
  const now = (): number => Date.now() - T0;
  const steps: any[] = [];
  const out: Record<string, any> = {
    schema: 'ob-recover.offline-connect-diag/1',
    scenario: SCENARIO,
    runNo: RUN_NO,
    startedAt: new Date(T0).toISOString(),
    note: 'local pages only, no external host is reachable, observation only, nothing is judged here',
    conditions: { headless: HEADLESS, resolverRules: RESOLVER_RULES, ports: { cdp: PORT, http: HTTP }, cmdTimeoutMs: CMD_TIMEOUT_MS, probeTimeoutMs: PROBE_TIMEOUT_MS, connectWindowMs: CONNECT_WINDOW_MS, globalCapMs: GLOBAL_CAP_MS, differencesFromL1Runs: ['local page instead of the L1 target', 'host resolver rules block every non-local host', 'Runtime domain enabled on the panel and service worker sessions to capture exceptions and console output', 'a 100 ms timer lag monitor injected into the panel page'].concat(PROFILE_PANEL ? ['CPU profile with 5 ms sampling running on the panel session'] : []).concat(LAZY_TABID ? ['tab id is not read before the connect click; the service worker status probe reads it through the panel after the click, as getSw() in scripts/p47-l1-ob-run.ts does'] : []) },
    dist: {},
    steps,
  };
  for (const f of ['background.js', 'devtools.js', 'panel.js', 'sandbox.js']) out.dist[f] = sha(readFileSync(DIST + '/' + f));
  let firstSave = true;
  const save = (): void => { writeFileSync(OUT, JSON.stringify(out, null, 2), { flag: firstSave ? 'wx' : 'w' }); firstSave = false; };
  try { save(); } catch (e: any) { refuse('cannot create the output file exclusively: ' + short(e && e.message ? e.message : e)); return; }

  if (SCENARIO === 'C') {
    const stub = ROOT + '/test/fixtures/qcc-combo.js';
    const info: Record<string, any> = { path: 'test/fixtures/qcc-combo.js' };
    try { const bb = readFileSync(stub); const tt = bb.toString('utf8'); info.bytes = bb.length; info.sha256 = sha(bb); info.containsFunctionKeyword = tt.indexOf('function') >= 0; info.looksLike403Page = tt.indexOf('403 Forbidden') >= 0; } catch (e: any) { info.error = short(e && e.message ? e.message : e); }
    out.status = 'unavailable';
    out.reason = 'no legitimately archived combo?font script exists in the repository; the only candidate file is a 403 error page and the site must not be contacted again to download one';
    out.candidateFile = info;
    out.searchedUnder = ['test/', 'test-pages/', 'scripts/ (js, mjs, txt files larger than 150000 bytes or named combo or font)'];
    out.finishedAt = new Date().toISOString();
    save();
    console.log('done scenario=C status=unavailable out=' + OUT);
    return;
  }

  for (const p of [PORT, HTTP]) {
    let busy = false;
    try { await fetch('http://127.0.0.1:' + p + '/json/version', { signal: AbortSignal.timeout(1000) }); busy = true; } catch { /* free */ }
    if (busy) { refuse('port ' + p + ' is already in use'); return; }
  }
  const appJs = SCENARIO === 'A' ? genSmall() : genLarge(500 * 1024);
  const appBuf = Buffer.from(appJs, 'utf8');
  out.script = { bytes: appBuf.length, chars: appJs.length, sha256: sha(appBuf), lines: appJs.split(NL).length, functionKeywords: (appJs.match(/function/g) || []).length };
  save();

  // Parse and discovery cost in plain Node with the production code. Not browser time: it only shows how heavy the analysis is.
  if (process.env.NODE_TIMING !== '0') {
    try {
      const pm: any = await import('file:///D:/Projects/ob-recover/src/core/parser.ts');
      const dm: any = await import('file:///D:/Projects/ob-recover/src/core/decoder-discovery.ts');
      const time = (label: string, src: string): any => {
        const t0 = Date.now();
        let parsed = true;
        let perr = '';
        try { pm.parseCode(src); } catch (e: any) { parsed = false; perr = short(e && e.message ? e.message : e); }
        const parseMs = Date.now() - t0;
        const t1 = Date.now();
        let cands = -1;
        let derr = '';
        try { const d = dm.discoverDecoders(src, '1', 'local:' + label); cands = d.candidates ? d.candidates.length : -1; if (!d.analyzed) derr = short(d.error); } catch (e: any) { derr = short(e && e.message ? e.message : e); }
        return { label, chars: src.length, parsed, parseError: perr, parseMs, discoverMs: Date.now() - t1, discoverIncludesItsOwnParse: true, candidates: cands, discoverError: derr };
      };
      const list: any[] = [time('scenario-' + SCENARIO, appJs)];
      try { list.push(time('archived-hpailist-2-read-only-never-executed', readFileSync(ROOT + '/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js', 'utf8'))); } catch (e: any) { list.push({ label: 'archived-hpailist-2', error: short(e && e.message ? e.message : e) }); }
      out.nodeAnalysisTiming = { note: 'plain Node, production parseCode and discoverDecoders, not browser time', results: list };
    } catch (e: any) { out.nodeAnalysisTiming = { error: short(e && e.message ? e.message : e) }; }
    save();
  }

  const served: any[] = [];
  const server = createServer((req: any, res: any) => {
    const name = String(req.url || '/').split('?')[0];
    let body: Buffer | null = null;
    let type = 'text/plain';
    if (name === '/index.html' || name === '/') { body = Buffer.from(HTML, 'utf8'); type = 'text/html; charset=utf-8'; } else if (name === '/app.js') { body = appBuf; type = 'text/javascript'; }
    served.push({ at: now(), path: name, status: body ? 200 : 404, bytes: body ? body.length : 0 });
    res.writeHead(body ? 200 : 404, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body || 'nf');
  });
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));

  const tl: any[] = [];
  const exceptions: any[] = [];
  const consoleLog: any[] = [];
  const probes: any[] = [];
  const logEvents: any[] = [];
  out.timeline = tl;
  out.exceptions = exceptions;
  out.console = consoleLog;
  out.probes = probes;
  out.panelLogEvents = logEvents;
  const labels: Record<string, string> = {};
  const addTl = (kind: string, data: any = {}): void => { if (tl.length < 1500) tl.push({ t: now(), kind, ...data }); };
  let clickAt: number | null = null;
  let b: any = null;
  let pageSid = '';
  let dsid = '';
  let psid = '';
  let swSid = '';
  let tabId = -1;

  const onEvent = (method: string, params: any, sessionId?: string): void => {
    if (method === 'Target.targetCreated' || method === 'Target.targetDestroyed' || method === 'Target.targetInfoChanged' || method === 'Target.targetCrashed') {
      const ti = params.targetInfo || {};
      if (method === 'Target.targetInfoChanged' && ti.type !== 'service_worker') return;
      addTl('target', { method, type: ti.type || null, url: short(ti.url, 100), targetId: short(params.targetId || ti.targetId, 12), status: params.status || null, errorCode: params.errorCode === undefined ? null : params.errorCode });
      return;
    }
    if (method === 'Target.attachedToTarget' || method === 'Target.detachedFromTarget') { addTl('session', { method, label: labels[params.sessionId] || null }); return; }
    const label = sessionId ? labels[sessionId] : undefined;
    if (!label) return;
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails || {};
      const frames = d.stackTrace && d.stackTrace.callFrames ? d.stackTrace.callFrames.slice(0, 5).map((f: any) => ({ fn: f.functionName, url: short(f.url, 80), line: f.lineNumber, col: f.columnNumber })) : [];
      if (exceptions.length < 100) exceptions.push({ t: now(), session: label, text: short(d.text, 200), description: short(d.exception && d.exception.description, 500), url: short(d.url, 80), frames });
    } else if (method === 'Runtime.consoleAPICalled') {
      if (consoleLog.length < 300) consoleLog.push({ t: now(), session: label, type: params.type, text: short((params.args || []).map((a: any) => (a.value !== undefined ? a.value : (a.description || a.type))).join(' '), 300) });
    }
  };

  const ev = async (sid: string, expr: string, awaitPromise = false, userGesture = false): Promise<any> => {
    const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture }, sid);
    if (r.exceptionDetails) return { error: short(r.exceptionDetails.text) + ' ' + short(r.exceptionDetails.exception && r.exceptionDetails.exception.description, 300) };
    return r.result.value;
  };
  const timed = async (name: string, fn: () => Promise<any>, ms: number): Promise<any> => {
    const t0 = Date.now();
    try {
      const r: any = await Promise.race([fn().then((v: any) => ({ v }), (e: any) => ({ err: short(e && e.message ? e.message : e) })), sleep(ms).then(() => ({ to: true }))]);
      const el = Date.now() - t0;
      if (r.to) return { name, ok: false, timeout: true, ms: el };
      if (r.err !== undefined) return { name, ok: false, error: r.err, ms: el };
      if (r.v && typeof r.v === 'object' && r.v.error) return { name, ok: false, error: short(r.v.error), ms: el };
      return { name, ok: true, ms: el, value: r.v };
    } catch (e: any) { return { name, ok: false, error: short(e && e.message ? e.message : e), ms: Date.now() - t0 }; }
  };
  const step = async (name: string, fn: () => Promise<any>): Promise<any> => {
    const start = now();
    let rec: any;
    try { const v = await fn(); rec = { name, startMs: start, endMs: now(), ok: true, result: v }; } catch (e: any) { rec = { name, startMs: start, endMs: now(), ok: false, error: short(e && e.message ? e.message : e, 400), stack: short(e && e.stack ? e.stack : '', 800) }; }
    steps.push(rec);
    addTl('step', { name, ok: rec.ok, ms: rec.endMs - rec.startMs });
    save();
    return rec;
  };
  const must = async (name: string, fn: () => Promise<any>): Promise<any> => {
    const r = await step(name, fn);
    if (!r.ok) throw new Error('step failed: ' + name + ': ' + r.error);
    return r.result;
  };
  const attach = async (id: string, label: string): Promise<string> => { const sid: string = (await b.send('Target.attachToTarget', { targetId: id, flatten: true })).sessionId; labels[sid] = label; return sid; };
  const c = (r: any): any => (r.ok ? { ok: true, ms: r.ms, v: slim(r.value) } : r.timeout ? { ok: false, timeout: true, ms: r.ms } : { ok: false, error: r.error, ms: r.ms });

  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const chromeArgs: string[] = ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--host-resolver-rules=' + RESOLVER_RULES];
  if (HEADLESS) chromeArgs.push('--headless=new');
  chromeArgs.push('about:blank');
  out.conditions.chromeArgs = chromeArgs.filter((a: string) => a.indexOf('--user-data-dir') !== 0);
  const child = spawn(CHROME, chromeArgs, { stdio: 'ignore' });
  const killChrome = (): void => { try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ } };
  const watchdog = setTimeout(() => {
    out.abortedBy = 'global cap ' + GLOBAL_CAP_MS + ' ms';
    try { out.afterClick = classify(probes, clickAt === null ? Infinity : clickAt, Infinity); save(); } catch { /* ignore */ }
    killChrome();
    process.exit(3);
  }, GLOBAL_CAP_MS);
  let probing = false;
  let probeLoop: Promise<void> = Promise.resolve();

  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    b = await connect(ver.webSocketDebuggerUrl, onEvent);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const extId: string = await must('loadExtension', async () => (await b.send('Extensions.loadUnpacked', { path: DIST })).id);
    out.extensionId = extId;
    await sleep(1500);
    const page: any = await must('createTarget', () => b.send('Target.createTarget', { url: PAGE_URL }));
    await sleep(1500);
    pageSid = await must('attachPage', () => attach(page.targetId, 'page'));
    await must('pageEnable', () => b.send('Page.enable', {}, pageSid));
    await must('pageReady', async () => {
      const t0 = now();
      while (now() - t0 < 30000) { const r = await timed('title', () => ev(pageSid, 'document.title'), 3000); if (r.ok && r.value === 'diag-ready') return { afterMs: now() - t0 }; await sleep(500); }
      throw new Error('local page never became ready');
    });
    await must('openDevTools', async () => { await b.send('Target.openDevTools', { targetId: page.targetId }); await sleep(6000); return { sleptMs: 6000 }; });
    const dt: any = await must('findDevtools', async () => {
      const tg: any = await b.send('Target.getTargets');
      const t = tg.targetInfos.find((x: any) => x.type === 'page' && String(x.url).indexOf('devtools://') === 0);
      if (!t) throw new Error('no devtools frontend target');
      return { targetId: t.targetId };
    });
    dsid = await must('attachDevtools', () => attach(dt.targetId, 'devtools'));
    await must('showPanel', async () => { const r = await timed('show', () => ev(dsid, SHOW, true), 10000); await sleep(2500); return slim(r); });
    const pt: any = await must('findPanel', async () => {
      const tg: any = await b.send('Target.getTargets');
      const t = tg.targetInfos.find((x: any) => String(x.url).indexOf(extId + '/panel.html') >= 0);
      if (!t) throw new Error('panel target not found');
      return { targetId: t.targetId };
    });
    psid = await must('attachPanel', () => attach(pt.targetId, 'panel'));
    const sw: any = await must('findServiceWorker', async () => {
      const tg: any = await b.send('Target.getTargets');
      const t = tg.targetInfos.find((x: any) => x.type === 'service_worker' && String(x.url).indexOf(extId + '/background.js') >= 0);
      if (!t) throw new Error('service worker target not found');
      return { targetId: t.targetId };
    });
    swSid = await must('attachServiceWorker', () => attach(sw.targetId, 'sw'));
    await must('runtimeEnable', async () => {
      const a = await timed('enablePanel', () => b.send('Runtime.enable', {}, psid), 6000);
      const s = await timed('enableSw', () => b.send('Runtime.enable', {}, swSid), 6000);
      return { panel: slim(a), sw: slim(s) };
    });
    tabId = await must('tabId', async () => {
      if (LAZY_TABID) return -1;
      const r = await timed('tabId', () => ev(psid, 'chrome.devtools.inspectedWindow.tabId'), 6000);
      if (!r.ok || typeof r.value !== 'number') throw new Error('tab id unreadable: ' + JSON.stringify(slim(r)));
      return r.value;
    });
    await must('lagInstall', async () => slim(await timed('lagInstall', () => ev(psid, LAG_INSTALL), 5000)));
    await step('preClick', async () => {
      const rs: any[] = await Promise.all([
        timed('panelState', () => ev(psid, PANEL_STATE), 5000),
        timed('swStatus', () => ev(swSid, swStatusExpr(tabId)), 5000),
        timed('swDebuggerTargets', () => ev(swSid, SW_TARGETS, true), 6000),
        timed('ping', () => ev(psid, PING, true), 6000),
      ]);
      const hasLog = !!(rs[0].ok && rs[0].value && Array.isArray(rs[0].value.logTail) && rs[0].value.logTail.length > 0);
      return { panelState: slim(rs[0], 3000), swStatus: slim(rs[1]), swDebuggerTargets: slim(rs[2], 1500), ping: slim(rs[3]), panelLogHasEntriesBeforeClick: hasLog };
    });

    // Probe loop: every tick samples each layer separately, so a hung layer shows up as its own timeouts.
    // Same dependency as the L1 runner's getSw(): without LAZY_TABID the id is already known and the status read never touches the panel.
    const swStatusProbe = async (): Promise<any> => {
      if (!LAZY_TABID) return ev(swSid, swStatusExpr(tabId));
      if (clickAt === null) return 'lazy-not-read-before-click';
      if (tabId < 0) {
        const id: any = await ev(psid, 'chrome.devtools.inspectedWindow.tabId');
        if (typeof id !== 'number') throw new Error('tab id through the panel unreadable: ' + short(JSON.stringify(id)));
        tabId = id;
      }
      return ev(swSid, swStatusExpr(tabId));
    };
    const logSeen = new Set<string>();
    probing = true;
    probeLoop = (async (): Promise<void> => {
      while (probing && probes.length < 600) {
        const t = now();
        const rs: any[] = await Promise.all([
          timed('page', () => ev(pageSid, '1+1'), PROBE_TIMEOUT_MS),
          timed('devtools', () => ev(dsid, '1+1'), PROBE_TIMEOUT_MS),
          timed('panel', () => ev(psid, 'Math.round(performance.now())'), PROBE_TIMEOUT_MS),
          timed('sw', () => ev(swSid, 'Date.now()'), PROBE_TIMEOUT_MS),
          timed('swStatus', () => swStatusProbe(), PROBE_TIMEOUT_MS),
          timed('ping', () => ev(psid, PING, true), PROBE_TIMEOUT_MS + 2000),
          timed('panelState', () => ev(psid, PANEL_STATE), PROBE_TIMEOUT_MS),
          timed('swDirect', () => ev(swSid, SW_DIRECT, true), PROBE_TIMEOUT_MS),
        ]);
        const ps = rs[6];
        if (ps.ok && ps.value && Array.isArray(ps.value.logTail)) {
          for (const e of ps.value.logTail) {
            const key = e.time + '|' + e.level + '|' + e.msg;
            if (!logSeen.has(key)) { logSeen.add(key); if (logEvents.length < 300) logEvents.push({ firstSeenAtMs: t, panelClock: e.time, level: e.level, msg: e.msg }); }
          }
        }
        probes.push({ t, page: c(rs[0]), devtools: c(rs[1]), panel: c(rs[2]), sw: c(rs[3]), swStatus: c(rs[4]), ping: c(rs[5]), swDirect: c(rs[7]), panelState: ps.ok ? { ok: true, ms: ps.ms, statusText: ps.value ? ps.value.statusText : null, connectDisabled: ps.value ? ps.value.connectDisabled : null, logCount: ps.value ? ps.value.logCount : null } : c(ps) });
        if (probes.length % 5 === 0) save();
        await sleep(700);
      }
    })();
    await sleep(2500);

    if (PROFILE_PANEL) {
      await step('panelProfilerStart', async () => {
        const e = await timed('profilerEnable', () => b.send('Profiler.enable', {}, psid), 6000);
        const i = await timed('profilerInterval', () => b.send('Profiler.setSamplingInterval', { interval: 5000 }, psid), 6000);
        const s = await timed('profilerStart', () => b.send('Profiler.start', {}, psid), 6000);
        return { enable: slim(e), interval: slim(i), start: slim(s), startedAtMs: now() };
      });
    }
    await step('clickConnect', async () => {
      clickAt = now();
      const r = await timed('click', () => ev(psid, `document.getElementById('btn-rt-connect').click();1`, false, true), 6000);
      return { clickedAtMs: clickAt, result: slim(r), note: 'single click, never repeated' };
    });
    const waited = await step('waitConnect', async () => {
      const t0 = now();
      while (now() - t0 < CONNECT_WINDOW_MS) {
        await sleep(500);
        const last: any = probes[probes.length - 1];
        const dv = last && last.swDirect && last.swDirect.ok && last.swDirect.v ? last.swDirect.v.status : undefined;
        const sv = last && last.swStatus && last.swStatus.ok ? String(last.swStatus.v) : null;
        const s = last && last.t >= (clickAt || 0) ? ((sv === 'connected' || sv === 'error') ? sv : ((dv === 'connected' || dv === 'error') ? String(dv) : null)) : null;
        if (s === 'connected' || s === 'error') return { reached: s, afterMs: now() - t0 };
      }
      return { reached: null, afterMs: now() - t0, note: 'connect window elapsed without a connected or error status' };
    });
    const reached: string | null = waited.ok && waited.result ? waited.result.reached : null;

    if (reached === 'connected') {
      await step('scriptListAppears', async () => {
        const t0 = now();
        const polls: any[] = [];
        while (now() - t0 < 60000) {
          const r = await timed('scripts', () => ev(psid, SCRIPTS), 6000);
          const found = !!(r.ok && Array.isArray(r.value) && r.value.some((s: any) => String(s).indexOf(JS_URL + ' | ') === 0));
          if (polls.length < 80) polls.push({ at: now() - t0, ok: r.ok, ms: r.ms, timeout: !!r.timeout, n: r.ok && Array.isArray(r.value) ? r.value.length : null, found });
          if (found) return { found: true, afterMs: now() - t0, polls };
          await sleep(1000);
        }
        return { found: false, afterMs: now() - t0, polls };
      });
      await step('analysisSettle', async () => {
        const t0 = now();
        const polls: any[] = [];
        let prev = '';
        let same = 0;
        while (now() - t0 < 90000) {
          const r = await timed('dec', () => ev(psid, DEC), 8000);
          if (polls.length < 80) polls.push({ at: now() - t0, ok: r.ok, ms: r.ms, timeout: !!r.timeout, v: r.ok ? slim(r.value) : null });
          if (r.ok && r.value) {
            const key = [r.value.analyzed, r.value.candidates, r.value.total].join('|');
            if (key === prev) same++; else { same = 0; prev = key; }
            if (same >= 3 && Number(r.value.candidates) > 0) return { settled: true, afterMs: now() - t0, polls };
          }
          await sleep(2000);
        }
        return { settled: false, afterMs: now() - t0, polls };
      });
      const listed: any = await step('swListScripts', async () => {
        const r = await timed('listScripts', () => ev(swSid, listScriptsExpr(tabId), true), 15000);
        const scripts: any[] = r.ok && r.value && Array.isArray(r.value.scripts) ? r.value.scripts : [];
        const m = scripts.filter((s: any) => String(s.url) === JS_URL);
        return { ok: r.ok, ms: r.ms, timeout: !!r.timeout, error: r.error || null, count: scripts.length, matches: m.length, scriptId: m.length === 1 ? String(m[0].scriptId) : null, sourceCharsInCollector: m.length === 1 ? m[0].sourceChars : null };
      });
      const sid2: string | null = listed.ok && listed.result ? listed.result.scriptId : null;
      if (sid2) {
        await step('sourceFetch', async () => {
          const r = await timed('getSource', () => ev(swSid, readSourceExpr(tabId, sid2), true), 20000);
          const src: string | null = r.ok && r.value && typeof r.value.source === 'string' ? r.value.source : null;
          const h = src === null ? null : sha(Buffer.from(src, 'utf8'));
          return { ok: r.ok, ms: r.ms, timeout: !!r.timeout, error: r.error || null, chars: src === null ? null : src.length, sha256: h, equalsServed: h === null ? null : h === out.script.sha256 };
        });
      }
    }

    probing = false;
    await probeLoop;
    if (PROFILE_PANEL) {
      await step('panelProfilerStop', async () => {
        const t0 = now();
        let alive = false;
        while (now() - t0 < 60000) { const a = await timed('alive', () => ev(psid, '1+1'), 3000); if (a.ok) { alive = true; break; } await sleep(1000); }
        const waitedMs = now() - t0;
        const r = await timed('profilerStop', () => b.send('Profiler.stop', {}, psid), 20000);
        if (!r.ok) return { ok: false, alive, waitedMs, result: slim(r) };
        const prof = r.value && r.value.profile ? r.value.profile : null;
        return { ok: !!prof, alive, waitedMs, summary: prof ? summarizeProfile(prof) : null };
      });
    }
    await step('finalState', async () => {
      const rs: any[] = await Promise.all([
        timed('lag', () => ev(psid, LAG_READ), 6000),
        timed('swStatus', () => ev(swSid, swStatusExpr(tabId)), 5000),
        timed('swDebuggerTargets', () => ev(swSid, SW_TARGETS, true), 6000),
        timed('panelState', () => ev(psid, PANEL_STATE), 5000),
        timed('ping', () => ev(psid, PING, true), 6000),
      ]);
      const direct: any = await timed('swDirect', () => ev(swSid, SW_DIRECT, true), 5000);
      return { swDirect: slim(direct, 400), note: 'swStatus below is read with the tab id known at that moment; with LAZY_TABID that id can still be -1, so swDirect is the valid status', panelMainThreadLag: rs[0].ok ? rs[0].value : slim(rs[0]), swStatus: slim(rs[1]), swDebuggerTargets: slim(rs[2], 1500), panelStatusText: rs[3].ok && rs[3].value ? rs[3].value.statusText : slim(rs[3]), ping: slim(rs[4]) };
    });
  } catch (e: any) {
    out.fatal = short(e && e.message ? e.message : e, 500);
    out.fatalStack = short(e && e.stack ? e.stack : '', 1000);
  } finally {
    clearTimeout(watchdog);
    probing = false;
    try { if (b) b.close(); } catch { /* ignore */ }
    killChrome();
    try { server.close(); } catch { /* ignore */ }
    out.served = served;
    const from = clickAt === null ? Infinity : clickAt;
    out.baselineBeforeClick = classify(probes, 0, from);
    out.afterClick = classify(probes, from, Infinity);
    out.reproduction = { reproducedNextpage2Signature: clickAt !== null && !out.afterClick.everConnected && out.afterClick.swStatusTimeouts >= 5, definition: 'never connected after the single click AND at least 5 service worker status reads timed out', everConnected: out.afterClick.everConnected, everConnectedDirect: out.afterClick.everConnectedDirect, firstProbeWithAnyFailureAfterClick: out.afterClick.firstProbeWithAnyFailure, rootCause: 'not determined by this script' };
    out.finishedAt = new Date().toISOString();
    try { save(); } catch { /* ignore */ }
  }
  console.log('done scenario=' + SCENARIO + ' fatal=' + (out.fatal ? out.fatal : 'none') + ' reproduced=' + (out.reproduction ? out.reproduction.reproducedNextpage2Signature : 'n/a') + ' everConnected=' + (out.reproduction ? out.reproduction.everConnected : 'n/a') + ' probes=' + probes.length + ' out=' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
