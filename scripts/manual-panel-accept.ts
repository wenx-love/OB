import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Phase 4.5 panel UI acceptance: headed Chrome, dedicated profile, real extension, real panel iframe, real V8 pause.
// Breakpoint is set through the DevTools frontend breakpoint manager; panel controls are driven programmatically (NOT a human mouse).
// No Debugger.paused is synthesized. Backend negative-path commands go through background handlePanelCommand.
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9478;
const HTTP = 8792;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ob-manual-panel-profile';
const OUT = ROOT + '/test/acceptance/phase4-manual-panel.json';
const SHOT = ROOT + '/test/acceptance/phase4-manual-panel-';
const PAGE_URL = 'http://127.0.0.1:' + HTTP + '/phase4-manual-real.html';
const JS_URL = 'http://127.0.0.1:' + HTTP + '/phase4-manual-real.js';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const NL = String.fromCharCode(10);

const TITLES: Record<number, string> = {
  1: 'panel loads in real DevTools, manual section present, default manual mode, no uncaught exception',
  2: 'panel receives the real user-breakpoint pause and lists frames without switching tabs or resuming',
  3: 'panel reads Local and Closure scope of the selected frame',
  4: 'panel lists call sites from static discovery',
  5: 'panel evaluates the call site in the selected frame and adds it to validation',
  6: 'apply verified replacement replaces only the evaluated position',
  7: 'backend negative paths on a real pause',
  8: 'resume invalidates saved frames in panel and backend',
  9: 'mode round trip keeps user breakpoints working',
  10: 'extension issued no breakpoint/resume/step commands in the whole run',
};
const items: Record<number, any> = {};
const item = (n: number) => (items[n] = items[n] || { n, title: TITLES[n], status: 'unverified', checks: [], notes: [], complete: false });
const chk = (n: number, name: string, ok: boolean, expected: any, actual: any) => { item(n).checks.push({ name, ok: !!ok, expected, actual }); };
const note = (n: number, s: string) => { item(n).notes.push(s); };
const done = (n: number) => { item(n).complete = true; };
const has = (t: any, s: string) => typeof t === 'string' && t.indexOf(s) >= 0;

const srcLines = readFileSync(ROOT + '/test-pages/phase4-manual-real.js', 'utf8').split(NL);
const lineOf = (s: string) => { const i = srcLines.findIndex((l) => l.includes(s)); if (i < 0) throw new Error('marker not found in test page: ' + s); return i; };
const BP_LINE = lineOf('var combined');
const sandbox: any = { atob: (s: string) => Buffer.from(s, 'base64').toString('latin1') };
vm.createContext(sandbox);
vm.runInContext(srcLines.slice(0, lineOf('function makeSigner')).join(NL), sandbox);
const EC: string[] = [0, 1].map((i) => sandbox._0xdec(i));

const FE = 'devtools://devtools/bundled/';
const DM = `var sdk=await import('${FE}core/sdk/sdk.js');var tm=sdk.TargetManager.TargetManager.instance();var tg=tm.primaryPageTarget();var dm=tg&&tg.model(sdk.DebuggerModel.DebuggerModel);`;
const SHOW = (p: string) => `(async function(p){var m=await import('${FE}ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf(p)>=0});if(!id)return {error:'no tab '+p};await iv.showPanel(id);return {selected:iv.tabbedPane.selectedTabId}})(${JSON.stringify(p)})`;
const TABIDS = `(async function(){var m=await import('${FE}ui/legacy/legacy.js');return m.InspectorView.InspectorView.instance().tabbedPane.tabIds()})()`;
const FE_STATE = `(async function(){var lg=await import('${FE}ui/legacy/legacy.js');var iv=lg.InspectorView.InspectorView.instance();${DM}var d=dm&&dm.debuggerPausedDetails();var top=d&&d.callFrames&&d.callFrames[0];var loc=top&&top.location();return {selected:iv.tabbedPane.selectedTabId,paused:!!(dm&&dm.isPaused()),frames:d&&d.callFrames?d.callFrames.length:0,top:top?{fn:top.functionName,line:loc.lineNumber,col:loc.columnNumber}:null}})()`;
const FE_RESUME = `(async function(){${DM}if(!dm)return {error:'no debugger model'};await dm.resume();return {ok:true}})()`;
const SET_BP = (url: string, line: number) => `(async function(url,line){var ws=await import('${FE}models/workspace/workspace.js');var u=ws.Workspace.WorkspaceImpl.instance().uiSourceCodes().find(function(x){return x.url()===url});if(!u)return {error:'uiSourceCode not found: '+url};var bpm=await import('${FE}models/breakpoints/breakpoints.js');var m=bpm.BreakpointManager.BreakpointManager.instance();var origin=(bpm.BreakpointManager.BreakpointOrigin||{}).USER_ACTION;var bp=await m.setBreakpoint(u,line,undefined,'',true,false,origin);return {path:'BreakpointManager.setBreakpoint',returned:bp?typeof bp:String(bp)}})(${JSON.stringify(url)},${line})`;
const INSTALL = `(function(){if(globalThis.__obObsInstalled)return {already:true};globalThis.__obObs=[];globalThis.__cmds=[];chrome.debugger.onEvent.addListener(function(s,m,p){if(m==='Debugger.paused'){globalThis.__obObs.push({t:Date.now(),m:m,reason:p.reason,fn:(p.callFrames&&p.callFrames[0])?p.callFrames[0].functionName:''})}else if(m==='Debugger.resumed'){globalThis.__obObs.push({t:Date.now(),m:m})}});var orig=chrome.debugger.sendCommand.bind(chrome.debugger);chrome.debugger.sendCommand=function(target,method,params,cb){globalThis.__cmds.push({t:Date.now(),m:method,p:(method==='Debugger.evaluateOnCallFrame'&&params)?String(params.expression).slice(0,60):undefined});return orig(target,method,params,cb)};globalThis.__cmd=function(msg,wait){return new Promise(function(resolve){var got=[];var port={postMessage:function(x){got.push(x)}};Promise.resolve(globalThis.__obRecoverTest.handlePanelCommand(msg,port)).then(function(){setTimeout(function(){resolve(got)},wait||400)},function(e){resolve([{error:String(e&&e.message?e.message:e)}])})})};globalThis.__obObsInstalled=true;return {installed:true,hook:typeof globalThis.__obRecoverTest}})()`;

const TXT = (id: string) => `(function(){var e=document.getElementById(${JSON.stringify(id)});return e?e.textContent:null})()`;
const CLICK = (id: string) => `(function(){var e=document.getElementById(${JSON.stringify(id)});if(!e)return false;e.click();return true})()`;
const DISABLED = (id: string) => `(function(){var e=document.getElementById(${JSON.stringify(id)});return e?e.disabled:null})()`;
const OPTS = (id: string) => `(function(){var s=document.getElementById(${JSON.stringify(id)});return s?[].map.call(s.options,function(o){return o.textContent}):null})()`;
const SELECT = (id: string, v: string | number) => `(function(){var s=document.getElementById(${JSON.stringify(id)});if(!s)return null;s.value=${JSON.stringify(String(v))};s.dispatchEvent(new Event('change'));return s.value})()`;
const HIDDEN = (id: string) => `(function(){var e=document.getElementById(${JSON.stringify(id)});return e?e.hidden:null})()`;

function connect(wsUrl: string, events: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(ev.data);
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
      else if (m.method === 'Runtime.exceptionThrown' || m.method === 'Runtime.consoleAPICalled') events.push(m);
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
  const events: any[] = [];
  const out: any = {
    note: 'headed Chrome + dedicated profile + real extension + real panel iframe + real V8 pause. Breakpoint set via the DevTools frontend breakpoint manager; panel controls driven programmatically (NOT a human mouse). No Debugger.paused is synthesized. Backend negative-path commands go through background handlePanelCommand.',
    page: PAGE_URL,
    bpLine: BP_LINE,
    expected: { decode: EC },
    dist: { background: sha(DIST + '/background.js'), panel: sha(DIST + '/panel.js'), panelHtml: sha(DIST + '/panel.html'), sandbox: sha(DIST + '/sandbox.js'), manifest: sha(DIST + '/manifest.json') },
    phases: {},
  };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl, events);
    let dsid = '';
    let pgSid = '';
    let psid = '';
    let swSid = '';
    const raceT = (p: Promise<any>, ms: number): Promise<any> => Promise.race([p, sleep(ms).then(() => ({ timeout: true }))]);
    const ev = async (sid: string, expr: string, userGesture = false): Promise<any> => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture }, sid);
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) };
      return r.result.value;
    };
    const fe = (expr: string) => raceT(ev(dsid, expr), 12000);
    const pg = (expr: string, ms = 3000) => raceT(ev(pgSid, expr), ms);
    const pn = (expr: string, g = false) => raceT(ev(psid, expr, g), 8000);
    const swEval = (expr: string) => raceT(ev(swSid, expr), 8000);
    const until = async (fn: () => Promise<any>, ms = 10000, stepMs = 250): Promise<any> => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { let v: any = null; try { v = await fn(); } catch { v = null; } if (v) return v; await sleep(stepMs); }
      return null;
    };
    const readObs = async (): Promise<any> => {
      const s: any = await swEval('JSON.stringify({ok:!!globalThis.__obObsInstalled,obs:globalThis.__obObs||[],cmds:globalThis.__cmds||[]})');
      try { return JSON.parse(s); } catch { return { ok: false, obs: [], cmds: [] }; }
    };
    const cmd = async (msg: any, type: string): Promise<any> => {
      const got: any = await swEval('globalThis.__cmd(' + JSON.stringify(msg) + ',400)');
      const r = Array.isArray(got) ? got.find((m: any) => m && m.type === type) : null;
      return r && r.data ? r.data : null;
    };
    const clickRun = async () => {
      await pg('window.__obResult=undefined;1');
      await b.send('Page.bringToFront', {}, pgSid);
      const r: any = await pg(`(function(){var r=document.getElementById('run').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      if (!r || typeof r.x !== 'number') throw new Error('run button rect unavailable: ' + JSON.stringify(r));
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none' }, pgSid);
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 }, pgSid);
      b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 }, pgSid).catch(() => {});
    };
    const waitPaused = (line: number) => until(async () => { const s: any = await fe(FE_STATE); return s && s.paused && s.top && s.top.line === line ? s : null; }, 10000);
    const waitDone = () => until(async () => (await pg('typeof window.__obResult')) === 'string', 10000);
    const shot = async (name: string) => {
      try { const r: any = await b.send('Page.captureScreenshot', { format: 'png' }, dsid); writeFileSync(SHOT + name + '.png', Buffer.from(r.data, 'base64')); out.phases['shot-' + name] = true; }
      catch (e: any) { out.phases['shot-' + name] = String(e && e.message ? e.message : e); }
    };

    // ---- extension, page, DevTools
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    const extId: string = load.id;
    out.extensionId = extId;
    const sw: any = await until(async () => { const tg: any = await b.send('Target.getTargets'); return tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(extId + '/background.js')); }, 10000, 300);
    if (!sw) throw new Error('service worker not found');
    const page: any = await b.send('Target.createTarget', { url: PAGE_URL });
    await sleep(1500);
    pgSid = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await b.send('Page.enable', {}, pgSid);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    const dt: any = await until(async () => { const tg: any = await b.send('Target.getTargets'); return tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://')); }, 15000, 500);
    if (!dt) throw new Error('devtools frontend target not found');
    dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    const tabIds: any = await until(async () => { const t: any = await fe(TABIDS); return Array.isArray(t) && t.some((x: string) => x.indexOf('OB-Recover') >= 0) ? t : null; }, 15000, 500);
    chk(1, 'OB-Recover panel registered in real DevTools', !!tabIds, 'tab id containing OB-Recover', tabIds);
    swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
    const inst: any = await swEval(INSTALL);
    chk(10, 'extension CDP command logger installed', !!(inst && inst.installed), true, inst);
    if (!inst || inst.hook !== 'object') throw new Error('__obRecoverTest hook missing in service worker');
    const bpRes: any = await fe(SET_BP(JS_URL, BP_LINE));
    out.phases.setBreakpoint = bpRes;
    chk(2, 'user breakpoint set through the DevTools frontend breakpoint manager', !!bpRes && !bpRes.error && !bpRes.timeout, 'no error', bpRes);

    // ---- control run: extension loaded, not attached
    await fe(SHOW('console'));
    await clickRun();
    const ctl: any = await waitPaused(BP_LINE);
    await sleep(1500);
    const ctlState: any = await fe(FE_STATE);
    chk(2, 'control: breakpoint hits with the extension loaded but not attached', !!ctl, 'paused at line ' + BP_LINE, ctl && ctl.top);
    if (!ctl) throw new Error('control run never paused: breakpoint is not working');
    const ctlSelected = ctlState && ctlState.selected;
    await fe(FE_RESUME);
    await waitDone();

    // ---- panel: connect through the real button
    await fe(SHOW('OB-Recover'));
    await sleep(2500);
    const ptg: any = await b.send('Target.getTargets');
    const pt = ptg.targetInfos.find((t: any) => String(t.url).includes(extId + '/panel.html'));
    if (!pt) throw new Error('panel iframe target not found');
    psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    await b.send('Runtime.enable', {}, psid);
    const tabId: any = await pn('chrome.devtools.inspectedWindow.tabId');
    out.tabId = tabId;
    const init: any = await pn(`(function(){var m=document.getElementById('man-mode');var s=document.getElementById('man-state');var d=document.getElementById('man-section');var e=document.getElementById('btn-man-eval');return {section:!!d,tag:d?d.tagName:null,mode:m?m.value:null,state:s?s.textContent:null,evalDisabled:e?e.disabled:null}})()`);
    out.phases.initialPanel = init;
    chk(1, 'manual section present with default mode manual and eval disabled before any pause', !!init && init.section === true && init.mode === 'manual' && init.evalDisabled === true && has(init.state, '运行中'), 'section + manual + disabled + running', init);
    await pn(CLICK('btn-rt-connect'), true);
    const connected = await until(async () => (await swEval('globalThis.__obRecoverTest.getStatus(' + tabId + ')')) === 'connected', 8000);
    chk(1, 'panel connect button attaches chrome.debugger', !!connected, 'connected', await pn(TXT('rt-debugger-status')));
    await pn(CLICK('btn-rt-clear'), true);
    await fe(SHOW('console'));
    await b.send('Page.reload', {}, pgSid);
    await until(async () => (await pg(`document.readyState==='complete'&&typeof window.runManualTest==='function'`)) === true, 15000);
    const found: any = await until(async () => { const t: any = await pn(TXT('runtime-log')); return has(t, 'phase4-manual-real.js') && has(t, '分析完成') ? true : null; }, 10000, 300);
    chk(5, 'panel discovered and statically analysed the page script after reload', !!found, true, found);
    await sleep(500);

    // ---- real pause with the extension attached
    await clickRun();
    const fePause: any = await waitPaused(BP_LINE);
    const sel: any[] = [];
    for (let i = 0; i < 6; i++) { const s: any = await fe(FE_STATE); sel.push(s && s.selected); await sleep(500); }
    const stalled: any = await pg('1+1', 1500);
    const stillPaused: any = await fe(FE_STATE);
    const listed: any = await until(async () => { const o: any = await pn(OPTS('man-frame')); return Array.isArray(o) && o.length === 3 ? o : null; }, 8000, 250);
    const manState: any = await pn(TXT('man-state'));
    out.phases.pause = { fePause, selected: sel, stalled, stillPaused, frameOptions: listed, manState };
    chk(2, 'real pause at the user breakpoint with the extension attached', !!fePause, 'paused at line ' + BP_LINE, fePause && fePause.top);
    chk(2, 'page really stopped (Runtime.evaluate stalls while paused)', !!(stalled && stalled.timeout), true, stalled);
    chk(2, 'panel lists the 3 frames of the real pause', !!listed && ['innerSign', 'midLevel', 'topLevel'].every((n, i) => has(listed[i], n)) && has(listed[0], ':' + (BP_LINE + 1) + ':'), 'innerSign, midLevel, topLevel with line ' + (BP_LINE + 1), listed);
    chk(2, 'panel state shows paused', has(manState, '已暂停'), 'paused badge', manState);
    chk(2, 'DevTools selected tab not switched by the extension (same as control run)', sel.length > 0 && sel.every((x: any) => x === ctlSelected), ctlSelected, sel);
    chk(2, 'page still paused after sampling (extension did not resume)', !!(stillPaused && stillPaused.paused === true), true, stillPaused && stillPaused.paused);
    await fe(SHOW('OB-Recover'));
    await sleep(800);
    await pn(`(function(){var d=document.getElementById('dock');if(d&&d.getAttribute('data-open')!=='true'){var t=document.getElementById('btn-dock-toggle');if(t)t.click()}var c=document.querySelector('.dock-tab[data-pane=manual]');if(c)c.click();return d?d.getAttribute('data-open'):null})()`, true);
    await sleep(800);
    await shot('1-paused');
    const vis: any = await pn(`(function(){var body=document.querySelector('#man-section .man-body');var br=body?body.getBoundingClientRect():null;var out={};['man-mode','btn-man-refresh','man-frame','btn-man-scopes','man-callsite','btn-man-eval'].forEach(function(id){var e=document.getElementById(id);if(!e){out[id]=null;return}var r=e.getBoundingClientRect();var cs=getComputedStyle(e);out[id]={top:Math.round(r.top),bottom:Math.round(r.bottom),w:Math.round(r.width),shown:cs.display!=='none'&&cs.visibility!=='hidden',inside:!!br&&r.width>0&&r.height>0&&r.top>=br.top-1&&r.bottom<=br.bottom+1}});var pane=document.getElementById('man-section');return {paneHidden:pane?pane.hidden:null,bodyRect:br?{top:Math.round(br.top),bottom:Math.round(br.bottom),h:Math.round(br.height)}:null,overflowY:body?getComputedStyle(body).overflowY:null,controls:out}})()`);
    const visBad: string[] = vis && vis.controls ? Object.keys(vis.controls).filter((k: string) => !vis.controls[k] || !vis.controls[k].shown || !vis.controls[k].inside) : ['no data'];
    out.phases.visibility = vis;
    chk(2, 'manual tab is its own dock tab: pane shown and every primary control is inside the visible scroll area (not clipped)', !!vis && vis.paneHidden === false && visBad.length === 0, 'pane visible, all 6 controls inside the visible area', { vis, visBad });
    done(2);

    // ---- scopes
    const scopesText = (needle: string) => until(async () => { const h = await pn(HIDDEN('man-scopes')); const t = await pn(TXT('man-scopes')); return h === false && has(t, needle) ? t : null; }, 8000, 250);
    await pn(SELECT('man-frame', 0));
    await pn(CLICK('btn-man-scopes'), true);
    const sc0: any = await scopesText('innerSign');
    await pn(SELECT('man-frame', 1));
    await pn(CLICK('btn-man-scopes'), true);
    const sc1: any = await scopesText('midLevel');
    out.phases.scopes = { frame0: sc0, frame1: sc1 };
    chk(3, 'frame 0 Local scope shown: localLabel, localToken, payload', has(sc0, 'localLabel = ' + JSON.stringify(EC[0])) && has(sc0, 'localToken = ' + JSON.stringify(EC[1])) && has(sc0, 'payload = ' + JSON.stringify('p1')), 'values from node:vm recomputation', sc0);
    chk(3, 'frame 0 Closure scope shown: closureSalt, closureCount', has(sc0, '[closure') && has(sc0, 'closureSalt = ' + JSON.stringify('salt-21')) && has(sc0, 'closureCount = 42'), 'salt-21 and 42', sc0);
    chk(3, 'frame 1 Local scope shown: midMarker, payload', has(sc1, 'midMarker = ' + JSON.stringify('mid-p1')) && has(sc1, 'payload = ' + JSON.stringify('p1')), 'mid-p1 and p1', sc1);
    chk(3, 'frame isolation: frame 1 output has no variable line for frame 0 variables (checked per variable line; the signer value preview legitimately mentions their names)', typeof sc1 === 'string' && !sc1.split('\n').some((l: string) => /^ {2}(localLabel|localToken|combined|closureSalt|closureCount) = /.test(l)) && !has(sc1, '[closure'), 'no such variable lines and no closure scope', sc1);
    done(3);

    // ---- call sites
    await pn(SELECT('man-frame', 0));
    const sites: any = await pn(OPTS('man-callsite'));
    const siteInfo: any = await pn(TXT('man-info'));
    out.phases.callSites = { sites, siteInfo };
    chk(4, 'call-site list has both literal direct calls of _0xdec', Array.isArray(sites) && sites.some((s: string) => has(s, '_0xdec(0x0)')) && sites.some((s: string) => has(s, '_0xdec(0x1)')), '_0xdec(0x0) and _0xdec(0x1)', sites);
    chk(4, 'info line states how many call sites were found', has(siteInfo, '共 2 个'), 'contains 共 2 个', siteInfo);
    done(4);

    // ---- evaluate in frame and add to validation
    const runEval = async (frameIdx: number, needle: string) => {
      await pn(SELECT('man-frame', frameIdx));
      const opts: any = await pn(OPTS('man-callsite'));
      const idx = Array.isArray(opts) ? opts.findIndex((s: string) => has(s, needle)) : -1;
      if (idx < 0) return { error: 'call site option not found', opts };
      await pn(SELECT('man-callsite', idx));
      await pn(CLICK('btn-man-eval'), true);
      await sleep(200);
      const idle = await until(async () => ((await pn(DISABLED('btn-man-eval'))) === false ? true : null), 15000, 200);
      return { idle: !!idle, result: await pn(TXT('man-result')) };
    };
    const eval1: any = await runEval(0, '_0xdec(0x0)');
    const verified1: any = await until(async () => ((await pn(TXT('cap-verified'))) === '1' ? true : null), 6000, 250);
    const total1: any = await pn(TXT('cap-v-total'));
    const cmds1: any[] = (await readObs()).cmds.filter((c: any) => c.m === 'Debugger.evaluateOnCallFrame');
    const pi = cmds1.findIndex((c: any) => typeof c.p === 'string' && c.p.indexOf('(function(f){var s=Function.prototype.toString') === 0);
    out.phases.eval1 = { eval1, verified1, total1, evalCmds: cmds1.map((c: any) => c.p) };
    chk(5, 'panel result says added to validation with the decoded value', !!eval1 && has(eval1.result, '已加入验证') && has(eval1.result, JSON.stringify(EC[0])) && has(eval1.result, '绑定探针已确认'), 'added + sign + probe confirmed', eval1);
    chk(5, 'extension issued the binding probe first, then the call expression, in the paused frame', pi >= 0 && !!cmds1[pi + 1] && cmds1[pi + 1].p === '_0xdec(0x0)', 'probe then _0xdec(0x0)', cmds1.map((c: any) => c.p));
    chk(5, 'validation counts the manual evaluation as verified', !!verified1 && has(total1, '1'), 'verified 1, groups 1', { verified: verified1, total: total1 });
    const eval2: any = await runEval(1, '_0xdec(0x0)');
    await sleep(500);
    const verified2: any = await pn(TXT('cap-verified'));
    const total2: any = await pn(TXT('cap-v-total'));
    out.phases.eval2 = { eval2, verified2, total2 };
    chk(5, 'same call site evaluated again in frame 1 does not add observations or groups', !!eval2 && has(eval2.result, '已加入验证') && verified2 === '1' && total2 === total1, 'verified 1, groups unchanged', { verified: verified2, total: total2 });
    await shot('2-evaluated');
    done(5);

    // ---- apply verified replacement through the panel button
    await pn(CLICK('btn-cap-apply'), true);
    await sleep(300);
    const applyText: any = await until(async () => { const d = await pn(DISABLED('btn-cap-apply')); const t = await pn(TXT('cap-apply-result')); return d === false && typeof t === 'string' && t.length > 0 ? t : null; }, 20000, 300);
    const recRaw: any = await pn(`JSON.stringify({rec:[].map.call(document.querySelectorAll('#code-recovered .line-code'),function(e){return e.textContent}),orig:[].map.call(document.querySelectorAll('#code-original .line-code'),function(e){return e.textContent})})`);
    const recObj: any = typeof recRaw === 'string' ? JSON.parse(recRaw) : { rec: [], orig: [] };
    const lineWith = (arr: string[], s: string) => arr.find((l) => l.indexOf(s) >= 0) || null;
    const recLabel = lineWith(recObj.rec, 'localLabel');
    const recToken = lineWith(recObj.rec, 'localToken');
    const origLabel = lineWith(recObj.orig, 'localLabel');
    out.phases.apply = { applyText, recLabel, recToken, origLabel };
    chk(6, 'apply report: 1 of 1 candidate replaced', has(applyText, '替换数量: 1 / 1'), 'contains 替换数量: 1 / 1', applyText);
    chk(6, 'evaluated position replaced: localLabel line holds the literal, call gone', !!recLabel && has(recLabel, JSON.stringify(EC[0])) && !has(recLabel, '_0xdec(0x0)'), 'var localLabel = sign literal', recLabel);
    chk(6, 'not evaluated position unchanged: localToken line still holds _0xdec(0x1)', !!recToken && has(recToken, '_0xdec(0x1)'), 'still _0xdec(0x1)', recToken);
    chk(6, 'original code pane untouched', !!origLabel && has(origLabel, '_0xdec(0x0)'), 'still _0xdec(0x0)', origLabel);
    done(6);

    // ---- backend negative paths on the live pause
    const fr: any = await cmd({ type: 'manual-capture-get-frames', tabId }, 'manual-capture-frames-response');
    const ids: string[] = fr && fr.frames ? fr.frames.map((f: any) => f.callFrameId) : [];
    const evBefore = (await readObs()).cmds.filter((c: any) => c.m === 'Debugger.evaluateOnCallFrame').length;
    const EV = 'manual-capture-evaluate-response';
    const n1: any = await cmd({ type: 'manual-capture-evaluate', tabId, frameIndex: 99, expression: '1+1' }, EV);
    const n2: any = await cmd({ type: 'manual-capture-evaluate', tabId, frameIndex: 0, callFrameId: ids[1], expression: '1+1' }, EV);
    const n3: any = await cmd({ type: 'manual-capture-evaluate', tabId, frameIndex: 0, expression: '   ' }, EV);
    const n4: any = await cmd({ type: 'manual-capture-evaluate', tabId, expression: '1+1' }, EV);
    const s1: any = await cmd({ type: 'manual-capture-get-scopes', tabId, frameIndex: -1 }, 'manual-capture-scopes-response');
    const s2: any = await cmd({ type: 'manual-capture-get-scopes', tabId, frameIndex: 1.5 }, 'manual-capture-scopes-response');
    const evAfter = (await readObs()).cmds.filter((c: any) => c.m === 'Debugger.evaluateOnCallFrame').length;
    out.phases.negatives = { n1, n2, n3, n4, s1, s2, evBefore, evAfter };
    const bad = (d: any, s: string) => !!d && d.success === false && has(d.error, s);
    chk(7, 'evaluate frameIndex 99 is rejected as out of range', bad(n1, '越界'), 'error contains 越界', n1);
    chk(7, 'evaluate with callFrameId and frameIndex pointing at different frames is rejected', bad(n2, '不一致'), 'error contains 不一致', n2);
    chk(7, 'evaluate with a blank expression is rejected', bad(n3, '表达式不能为空'), 'error contains 表达式不能为空', n3);
    chk(7, 'evaluate without callFrameId and frameIndex is rejected', bad(n4, '必须提供'), 'error contains 必须提供', n4);
    chk(7, 'get-scopes frameIndex -1 is rejected as out of range', bad(s1, '越界'), 'error contains 越界', s1);
    chk(7, 'get-scopes frameIndex 1.5 is rejected as not an integer', bad(s2, '必须是整数'), 'error contains 必须是整数', s2);
    chk(7, 'rejected requests never reached CDP', evAfter === evBefore, 'evaluateOnCallFrame count unchanged', { evBefore, evAfter });
    done(7);

    // ---- resume through DevTools: saved frames must be invalidated
    await fe(FE_RESUME);
    const done1 = await waitDone();
    const running: any = await until(async () => { const s = await pn(TXT('man-state')); return has(s, '运行中') ? s : null; }, 8000, 250);
    const framesAfter: any = await pn(OPTS('man-frame'));
    const evalDisabled: any = await pn(DISABLED('btn-man-eval'));
    const scopesHidden: any = await pn(HIDDEN('man-scopes'));
    const g1: any = await cmd({ type: 'manual-capture-get-frames', tabId }, 'manual-capture-frames-response');
    const g2: any = await cmd({ type: 'manual-capture-evaluate', tabId, frameIndex: 0, expression: '1+1' }, EV);
    const g3: any = await cmd({ type: 'manual-capture-get-scopes', tabId, frameIndex: 0 }, 'manual-capture-scopes-response');
    out.phases.afterResume = { done1, running, framesAfter, evalDisabled, scopesHidden, g1, g2, g3 };
    chk(8, 'DevTools continue finishes the page run', !!done1, 'window.__obResult is a string', done1);
    chk(8, 'panel shows running, no frames, eval disabled, scopes hidden', !!running && Array.isArray(framesAfter) && framesAfter.length === 0 && evalDisabled === true && scopesHidden === true, 'running + 0 frames + disabled + hidden', { running, frames: framesAfter, evalDisabled, scopesHidden });
    chk(8, 'backend get-frames refuses after resume', bad(g1, '暂停状态'), 'error mentions 暂停状态', g1);
    chk(8, 'backend evaluate refuses after resume', bad(g2, '暂停状态'), 'error mentions 暂停状态', g2);
    chk(8, 'backend get-scopes refuses after resume', bad(g3, '暂停状态'), 'error mentions 暂停状态', g3);
    done(8);

    // ---- mode round trip, then the user breakpoint again
    const logHas = (needle: string) => until(async () => { const t: any = await pn(TXT('runtime-log')); return has(t, needle) ? true : null; }, 6000, 250);
    await pn(SELECT('man-mode', 'auto'));
    const gotAuto = await logHas('已切换到自动捕获模式');
    await pn(SELECT('man-mode', 'manual'));
    const gotManual = await logHas('已切换到手动捕获模式');
    const modeNow: any = await pn(`document.getElementById('man-mode').value`);
    await fe(SHOW('console'));
    await clickRun();
    const hit2: any = await waitPaused(BP_LINE);
    const listed2: any = await until(async () => { const o: any = await pn(OPTS('man-frame')); return Array.isArray(o) && o.length === 3 ? o : null; }, 8000, 250);
    const state2: any = await pn(TXT('man-state'));
    await sleep(500);
    await fe(FE_RESUME);
    const done2 = await waitDone();
    out.phases.modeRoundTrip = { gotAuto, gotManual, modeNow, hit2, listed2, state2, done2 };
    chk(9, 'background confirmed the switch to auto and back to manual (log lines)', !!gotAuto && !!gotManual && modeNow === 'manual', 'both log lines + manual', { gotAuto, gotManual, modeNow });
    chk(9, 'user breakpoint still hits after the mode round trip', !!hit2, 'paused at line ' + BP_LINE, hit2 && hit2.top);
    chk(9, 'panel lists 3 frames again and shows paused', !!listed2 && has(state2, '已暂停'), '3 frames + paused', { listed2, state2 });
    chk(9, 'DevTools continue finishes the second page run', !!done2, 'window.__obResult is a string', done2);
    done(9);

    // ---- whole-run command log
    await sleep(500);
    const fin: any = await readObs();
    const cmds: any[] = fin.cmds || [];
    const counts: Record<string, number> = {};
    for (const c of cmds) counts[c.m] = (counts[c.m] || 0) + 1;
    const MUT = ['Debugger.resume', 'Debugger.stepOver', 'Debugger.stepInto', 'Debugger.stepOut', 'Debugger.pause', 'Debugger.setBreakpoint', 'Debugger.setBreakpointByUrl', 'Debugger.setInstrumentationBreakpoint', 'Debugger.setBreakpointOnFunctionCall', 'Debugger.removeBreakpoint', 'Debugger.continueToLocation', 'Debugger.setBreakpointsActive', 'Debugger.setSkipAllPauses', 'Debugger.setPauseOnExceptions'];
    const READ_ONLY = ['Debugger.enable', 'Runtime.enable', 'Debugger.getScriptSource', 'Runtime.getProperties', 'Debugger.evaluateOnCallFrame'];
    const mut = cmds.filter((c: any) => MUT.includes(c.m));
    const unexpected = Object.keys(counts).filter((k) => !READ_ONLY.includes(k));
    out.phases.commands = { counts, mutating: mut, unexpected };
    chk(10, 'observer survived the whole run with a non-empty command log', !!fin.ok && cmds.length > 0, 'ok and >0 commands', { ok: fin.ok, n: cmds.length });
    chk(10, 'no breakpoint, instrumentation, resume, step or pause command was issued by the extension', mut.length === 0, 0, mut.map((c: any) => c.m));
    chk(10, 'only read-only CDP commands were used', unexpected.length === 0, READ_ONLY, unexpected);
    done(10);

    // ---- panel exceptions over the whole run
    const exc = events.filter((e: any) => e.sessionId === psid && e.method === 'Runtime.exceptionThrown');
    const cerr = events.filter((e: any) => e.sessionId === psid && e.method === 'Runtime.consoleAPICalled' && e.params && e.params.type === 'error');
    out.phases.panelErrors = { exceptions: exc.map((e: any) => (e.params.exceptionDetails && (e.params.exceptionDetails.text + ' ' + ((e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || ''))).slice(0, 300)), consoleErrors: cerr.length };
    chk(1, 'no uncaught exception in the panel context during the whole run', exc.length === 0, 0, out.phases.panelErrors.exceptions);
    note(1, 'panel console.error count: ' + cerr.length + '; Runtime.enable replays stored messages, so load-time errors are included');
    done(1);
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
  }
  for (const n of Object.keys(TITLES).map(Number)) {
    const it = item(n);
    if (it.checks.some((c: any) => !c.ok)) it.status = 'fail';
    else if (it.complete && it.checks.length > 0) it.status = 'pass';
    else it.status = 'unverified';
  }
  out.items = Object.keys(TITLES).map((n) => items[Number(n)]);
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  for (const it of out.items) {
    const failed = it.checks.filter((c: any) => !c.ok).map((c: any) => c.name);
    console.log('[' + it.status.toUpperCase() + '] ' + it.n + ' ' + it.title + (failed.length ? ' :: failed: ' + failed.join(' | ') : ''));
  }
  if (out.fatal) console.log('FATAL: ' + out.fatal);
  console.log('saved ' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
