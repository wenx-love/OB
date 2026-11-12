import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Phase 4 manual-breakpoint acceptance: headed Chrome, dedicated profile, real extension, real chrome.debugger, real V8 pause.
// Breakpoint is set through the real DevTools frontend breakpoint manager; panel and DevTools controls are driven programmatically (NOT a human mouse).
// No Debugger.paused event is ever synthesized. Backend commands go through background handlePanelCommand (same function the panel port calls).
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9477;
const HTTP = 8791;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ob-manual-real-profile';
const OUT = ROOT + '/test/acceptance/phase4-manual-real.json';
const PAGE_URL = 'http://127.0.0.1:' + HTTP + '/phase4-manual-real.html';
const JS_URL = 'http://127.0.0.1:' + HTTP + '/phase4-manual-real.js';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const NL = String.fromCharCode(10);

const TITLES: Record<number, string> = {
  1: 'load current dist extension in real Chrome',
  2: 'open dedicated test page',
  3: 'set breakpoint in DevTools Sources',
  4: 'backend receives real Debugger.paused',
  5: 'real callFrames obtained',
  6: 'Local and Closure scope at frameIndex',
  7: 'OB decode expression evaluated in specified frame',
  8: 'returned values match real browser results',
  9: 'no auto breakpoints / no panel switch / no resume',
  10: 'user breakpoints, step and continue unaffected',
};
const items: Record<number, any> = {};
const item = (n: number) => (items[n] = items[n] || { n, title: TITLES[n], status: 'unverified', checks: [], notes: [], skipped: '', complete: false });
const chk = (n: number, name: string, ok: boolean, expected: any, actual: any) => { item(n).checks.push({ name, ok: !!ok, expected, actual }); };
const note = (n: number, s: string) => { item(n).notes.push(s); };
const skip = (n: number, why: string) => { item(n).skipped = why; };
const done = (n: number) => { item(n).complete = true; };

const srcText = readFileSync(ROOT + '/test-pages/phase4-manual-real.js', 'utf8');
const lines = srcText.split(NL);
const lineOf = (s: string) => { const i = lines.findIndex((l) => l.includes(s)); if (i < 0) throw new Error('marker not found in test page: ' + s); return i; };
const BP_LINE = lineOf('var combined');
const MID_LINE = lineOf('return signer(payload)');
const TOP_LINE = lineOf('var out = midLevel');
const sandbox: any = { atob: (s: string) => Buffer.from(s, 'base64').toString('latin1') };
vm.createContext(sandbox);
vm.runInContext(lines.slice(0, lineOf('function makeSigner')).join(NL), sandbox);
const EC: string[] = [0, 1, 2, 3, 4].map((i) => sandbox._0xdec(i));
const EXPECT_RESULT = EC[0] + ':p1:salt-21:42|' + EC[1] + '#mid-p1';

const FE = 'devtools://devtools/bundled/';
const DM = `var sdk=await import('${FE}core/sdk/sdk.js');var tm=sdk.TargetManager.TargetManager.instance();var tg=tm.primaryPageTarget();var dm=tg&&tg.model(sdk.DebuggerModel.DebuggerModel);`;
const SHOW = (p: string) => `(async function(p){var m=await import('${FE}ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf(p)>=0});if(!id)return {error:'no tab '+p};await iv.showPanel(id);return {selected:iv.tabbedPane.selectedTabId}})(${JSON.stringify(p)})`;
const TABIDS = `(async function(){var m=await import('${FE}ui/legacy/legacy.js');return m.InspectorView.InspectorView.instance().tabbedPane.tabIds()})()`;
const FE_STATE = `(async function(){var lg=await import('${FE}ui/legacy/legacy.js');var iv=lg.InspectorView.InspectorView.instance();${DM}var d=dm&&dm.debuggerPausedDetails();var top=d&&d.callFrames&&d.callFrames[0];var loc=top&&top.location();return {selected:iv.tabbedPane.selectedTabId,paused:!!(dm&&dm.isPaused()),frames:d&&d.callFrames?d.callFrames.length:0,top:top?{fn:top.functionName,line:loc.lineNumber,col:loc.columnNumber}:null}})()`;
const FE_RESUME = `(async function(){${DM}if(!dm)return {error:'no debugger model'};await dm.resume();return {ok:true}})()`;
const FE_STEP = `(async function(){${DM}if(!dm)return {error:'no debugger model'};await dm.stepOver();return {ok:true}})()`;
const SET_BP = (url: string, line: number) => `(async function(url,line){var r={};var ws=await import('${FE}models/workspace/workspace.js');var u=ws.Workspace.WorkspaceImpl.instance().uiSourceCodes().find(function(x){return x.url()===url});if(!u)return {error:'uiSourceCode not found: '+url};r.uiSourceCode=u.url();try{var bpm=await import('${FE}models/breakpoints/breakpoints.js');var m=bpm.BreakpointManager.BreakpointManager.instance();var origin=(bpm.BreakpointManager.BreakpointOrigin||{}).USER_ACTION;var bp=await m.setBreakpoint(u,line,undefined,'',true,false,origin);r.path='BreakpointManager.setBreakpoint';r.returned=bp?typeof bp:String(bp);return r}catch(e){r.bpmError=String(e&&e.message?e.message:e)}try{${DM}var res=await dm.setBreakpointByURL(url,line,undefined,'');r.path='DebuggerModel.setBreakpointByURL';r.returned=res&&res.breakpointId?'breakpointId':'no id';return r}catch(e){r.dmError=String(e&&e.message?e.message:e);return {error:'both paths failed',detail:r}}})(${JSON.stringify(url)},${line})`;
const INSTALL = `(function(){if(globalThis.__obObsInstalled)return {already:true};globalThis.__obObs=[];globalThis.__cmds=[];chrome.debugger.onEvent.addListener(function(s,m,p){if(m==='Debugger.paused'){globalThis.__obObs.push({t:Date.now(),m:m,tabId:s.tabId,reason:p.reason,hit:p.hitBreakpoints||[],frames:(p.callFrames||[]).map(function(cf){return {callFrameId:cf.callFrameId,fn:cf.functionName,line:cf.location.lineNumber,col:cf.location.columnNumber,scriptId:cf.location.scriptId,url:cf.url,scopes:(cf.scopeChain||[]).map(function(sc){return sc.type})}})})}else if(m==='Debugger.resumed'){globalThis.__obObs.push({t:Date.now(),m:m,tabId:s.tabId})}});var orig=chrome.debugger.sendCommand.bind(chrome.debugger);chrome.debugger.sendCommand=function(target,method,params,cb){globalThis.__cmds.push({t:Date.now(),m:method});return orig(target,method,params,cb)};globalThis.__cmd=function(msg,wait){return new Promise(function(resolve){var got=[];var port={postMessage:function(x){got.push(x)}};Promise.resolve(globalThis.__obRecoverTest.handlePanelCommand(msg,port)).then(function(){setTimeout(function(){resolve(got)},wait||400)},function(e){resolve([{error:String(e&&e.message?e.message:e)}])})})};globalThis.__obObsInstalled=true;return {installed:true,patched:chrome.debugger.sendCommand.toString().indexOf('__cmds')>=0,hook:typeof globalThis.__obRecoverTest}})()`;

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
  const out: any = {
    note: 'headed Chrome + dedicated profile + real extension + real chrome.debugger + real V8 pause. Breakpoint set via the real DevTools frontend breakpoint manager; panel and DevTools controls driven programmatically (NOT a human mouse). No Debugger.paused is synthesized. Backend commands go through background handlePanelCommand.',
    page: PAGE_URL,
    bpLine: BP_LINE,
    expected: { decode: EC, result: EXPECT_RESULT },
    dist: { background: sha(DIST + '/background.js'), panel: sha(DIST + '/panel.js'), sandbox: sha(DIST + '/sandbox.js'), manifest: sha(DIST + '/manifest.json') },
    phases: {},
  };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl);
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
      try { return JSON.parse(s); } catch { return { ok: false, obs: [], cmds: [], parseError: true }; }
    };
    const cmd = async (msg: any, type: string): Promise<any> => {
      const got: any = await swEval('globalThis.__cmd(' + JSON.stringify(msg) + ',400)');
      const r = Array.isArray(got) ? got.find((m: any) => m && m.type === type) : null;
      return { response: r || null, raw: got };
    };
    const vv = (x: any) => (x && typeof x === 'object' && 'value' in x ? x.value : x && x.description ? x.description : x);
    const clickRun = async () => {
      await b.send('Page.bringToFront', {}, pgSid);
      const r: any = await pg(`(function(){var r=document.getElementById('run').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      if (!r || typeof r.x !== 'number') throw new Error('run button rect unavailable: ' + JSON.stringify(r));
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, button: 'none' }, pgSid);
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 }, pgSid);
      b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 }, pgSid).catch(() => {});
    };
    const waitPaused = (line: number) => until(async () => { const s: any = await fe(FE_STATE); return s && s.paused && s.top && s.top.line === line ? s : null; }, 10000);
    const waitDone = () => until(async () => (await pg('typeof window.__obResult')) === 'string', 10000);

    // ---- item 1: extension + panel
    const load: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    const extId: string = load.id;
    out.extensionId = extId;
    const sw: any = await until(async () => { const tg: any = await b.send('Target.getTargets'); return tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(extId + '/background.js')); }, 10000, 300);
    chk(1, 'extension loaded via Extensions.loadUnpacked', typeof extId === 'string' && extId.length === 32, '32-char extension id', extId);
    chk(1, 'background service worker target present', !!sw, 'present', sw ? sw.url : null);
    const manifest = JSON.parse(readFileSync(DIST + '/manifest.json', 'utf8'));
    note(1, 'dist manifest ' + manifest.name + ' ' + manifest.version + '; file hashes in out.dist');
    if (!sw) throw new Error('service worker not found');

    // ---- item 2: page
    const page: any = await b.send('Target.createTarget', { url: PAGE_URL });
    await sleep(1500);
    pgSid = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await b.send('Page.enable', {}, pgSid);
    const info: any = await pg(`JSON.stringify({title:document.title,run:typeof window.runManualTest,btn:!!document.getElementById('run'),url:location.href,state:document.readyState})`);
    const pi: any = typeof info === 'string' ? JSON.parse(info) : {};
    chk(2, 'dedicated test page loaded from local server', pi.url === PAGE_URL && pi.state === 'complete', PAGE_URL, pi);
    chk(2, 'page exposes run button and runManualTest', pi.btn === true && pi.run === 'function', 'button + function', pi);
    done(2);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    const dt: any = await until(async () => { const tg: any = await b.send('Target.getTargets'); return tg.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://')); }, 15000, 500);
    if (!dt) throw new Error('devtools frontend target not found');
    dsid = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    const tabIds: any = await until(async () => { const t: any = await fe(TABIDS); return Array.isArray(t) && t.some((x: string) => x.indexOf('OB-Recover') >= 0) ? t : null; }, 15000, 500);
    chk(1, 'OB-Recover panel registered in real DevTools', !!tabIds && tabIds.some((x: string) => x.indexOf('OB-Recover') >= 0), 'tab id containing OB-Recover', tabIds);
    done(1);

    // ---- observer inside the extension service worker (passive)
    swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId;
    const inst: any = await swEval(INSTALL);
    out.phases.observer = inst;
    chk(9, 'extension CDP command logger installed (chrome.debugger.sendCommand wrapper)', !!(inst && inst.patched), true, inst);
    if (!inst || inst.hook !== 'object') throw new Error('__obRecoverTest hook missing in service worker');

    // ---- item 3: breakpoint through DevTools frontend
    const bpRes: any = await fe(SET_BP(JS_URL, BP_LINE));
    out.phases.setBreakpoint = bpRes;
    chk(3, 'breakpoint set through DevTools frontend breakpoint manager', !!bpRes && !bpRes.error && !bpRes.timeout, 'no error', bpRes);
    note(3, 'method is DevTools frontend API, not a human mouse click on the gutter');

    // ---- control phase: extension loaded but NOT attached
    await fe(SHOW('console'));
    await clickRun();
    const ctlPause: any = await waitPaused(BP_LINE);
    await sleep(1500);
    const ctlState: any = await fe(FE_STATE);
    out.phases.control = { pause: ctlPause, after: ctlState };
    chk(3, 'breakpoint really hits in DevTools (control run, extension not attached)', !!ctlPause, 'paused at line ' + BP_LINE, ctlPause && ctlPause.top);
    done(3);
    if (!ctlPause) throw new Error('control run never paused: breakpoint is not working, stopping');
    const ctlSelected = ctlState && ctlState.selected;
    await fe(FE_RESUME);
    const ctlDone = await waitDone();
    chk(10, 'control: DevTools continue finishes the page run', !!ctlDone, 'window.__obResult is a string', ctlDone);

    // ---- connect through the real panel button
    await fe(SHOW('OB-Recover'));
    await sleep(2500);
    const ptg: any = await b.send('Target.getTargets');
    const pt = ptg.targetInfos.find((t: any) => String(t.url).includes(extId + '/panel.html'));
    if (!pt) throw new Error('panel iframe target not found');
    psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    const tabId: any = await pn('chrome.devtools.inspectedWindow.tabId');
    out.tabId = tabId;
    await pn(`document.getElementById('btn-rt-connect').click();1`, true);
    const connected = await until(async () => (await swEval('globalThis.__obRecoverTest.getStatus(' + tabId + ')')) === 'connected', 8000);
    const dbgText = await pn(`document.getElementById('rt-debugger-status').textContent`);
    chk(1, 'panel connect button attaches chrome.debugger (status connected)', !!connected, 'connected', { panelText: dbgText });
    await fe(SHOW('console'));
    await b.send('Page.reload', {}, pgSid);
    await until(async () => (await pg(`document.readyState==='complete'&&typeof window.runManualTest==='function'`)) === true, 15000);
    await sleep(500);

    // ---- connected phase: user breakpoint hit
    await clickRun();
    const fePause: any = await waitPaused(BP_LINE);
    const obsNow: any = await until(async () => { const o: any = await readObs(); return o && o.obs && o.obs.some((e: any) => e.m === 'Debugger.paused' && e.reason !== 'instrumentation' && e.frames.length > 0 && e.frames[0].fn === 'innerSign') ? o : null; }, 8000);
    const first: any = obsNow ? obsNow.obs.find((e: any) => e.m === 'Debugger.paused' && e.reason !== 'instrumentation' && e.frames.length > 0 && e.frames[0].fn === 'innerSign') : null;
    const stalled: any = await pg('1+1', 1500);
    const sel: any[] = [];
    for (let i = 0; i < 6; i++) { const s: any = await fe(FE_STATE); sel.push(s && s.selected); await sleep(500); }
    const stillPaused: any = await fe(FE_STATE);
    const panelRaw: any = await pn(`JSON.stringify({pause:document.getElementById('rt-pause-status').textContent,log:document.getElementById('runtime-log').textContent.slice(-1500)})`);
    const panelState: any = typeof panelRaw === 'string' ? JSON.parse(panelRaw) : {};
    out.phases.connectedPause = { fePause, first, stalled, selected: sel, panel: panelState };
    chk(4, 'DevTools shows the pause at the user breakpoint while extension is attached', !!fePause, 'paused at line ' + BP_LINE, fePause && fePause.top);
    chk(4, 'backend (extension session) received a real Debugger.paused for innerSign', !!first, 'Debugger.paused, top frame innerSign', first ? { reason: first.reason, hit: first.hit, depth: first.frames.length, top: first.frames[0] } : null);
    if (first) {
      chk(4, 'top frame is innerSign at the breakpoint line', first.frames[0].fn === 'innerSign' && first.frames[0].line === BP_LINE, 'innerSign @ ' + BP_LINE, first.frames[0]);
      chk(4, 'page really stopped (Runtime.evaluate stalls while paused)', !!(stalled && stalled.timeout), true, stalled);
      chk(4, 'panel shows paused state and innerSign from the real event', String(panelState.pause).includes('已暂停') && String(panelState.log).includes('innerSign'), 'paused badge + innerSign in log', panelState);
    }
    const recR: any = await cmd({ type: 'manual-capture-get-records', tabId }, 'manual-capture-records-response');
    const recs: any[] = recR.response && recR.response.data && Array.isArray(recR.response.data.records) ? recR.response.data.records : [];
    out.phases.records1 = recs;
    chk(4, 'ManualCapture recorded the pause (top frame, line, scriptId)', recs.length >= 1 && !!first && recs[0].functionName === 'innerSign' && recs[0].location && recs[0].location.lineNumber === BP_LINE && recs[0].scriptId === first.frames[0].scriptId, 'record for innerSign @ ' + BP_LINE, recs[0] || null);

    // ---- items 5-7 against the live pause
    let evalRes: any[] = [];
    const rawFrames: any[] = first ? first.frames : [];
    if (first) {
      const fr: any = await cmd({ type: 'manual-capture-get-frames', tabId }, 'manual-capture-frames-response');
      const bf: any[] = fr.response && fr.response.data && Array.isArray(fr.response.data.frames) ? fr.response.data.frames : [];
      out.phases.frames = fr;
      chk(5, 'raw callFrames from the real event: innerSign, midLevel, topLevel at expected lines', ['innerSign', 'midLevel', 'topLevel'].every((n, i) => rawFrames[i] && rawFrames[i].fn === n) && rawFrames[0].line === BP_LINE && rawFrames[1].line === MID_LINE && rawFrames[2].line === TOP_LINE, [BP_LINE, MID_LINE, TOP_LINE], rawFrames.slice(0, 4).map((f: any) => f.fn + '@' + f.line));
      chk(5, 'raw frames carry callFrameId and a scope chain with local and closure', !!rawFrames[0].callFrameId && rawFrames[0].scopes.includes('local') && rawFrames[0].scopes.includes('closure'), 'callFrameId + local + closure', { id: rawFrames[0].callFrameId, scopes: rawFrames[0].scopes });
      chk(5, 'backend exposes the frames (manual-capture-get-frames responded)', bf.length >= 3, '>=3 frames', fr.response ? bf.length : 'no response (command not implemented?)');
      chk(5, 'backend frames match the raw event by index (name, line, callFrameId)', bf.length >= 3 && [0, 1, 2].every((i) => bf[i].functionName === rawFrames[i].fn && bf[i].location && bf[i].location.lineNumber === rawFrames[i].line && bf[i].callFrameId === rawFrames[i].callFrameId), 'equal to raw', bf.slice(0, 3));
      done(5);

      const gs = async (fi: number) => { const r: any = await cmd({ type: 'manual-capture-get-scopes', tabId, frameIndex: fi }, 'manual-capture-scopes-response'); return r.response && r.response.data ? r.response.data : null; };
      const sv = (d: any, type: string) => { const arr = d && Array.isArray(d.scopes) ? d.scopes : null; if (!arr) return null; const vars: any = {}; let found = false; for (const s of arr) { if (s.type === type) { found = true; Object.assign(vars, s.variables || {}); } } return found ? vars : null; };
      const s0 = await gs(0);
      const s1 = await gs(1);
      out.phases.scopes = { frame0: s0, frame1: s1 };
      const l0 = sv(s0, 'local');
      const c0 = sv(s0, 'closure');
      const l1 = sv(s1, 'local');
      chk(6, 'frame 0 Local scope: localLabel, localToken, payload', !!l0 && vv(l0.localLabel) === EC[0] && vv(l0.localToken) === EC[1] && vv(l0.payload) === 'p1', { localLabel: EC[0], localToken: EC[1], payload: 'p1' }, l0 ? { localLabel: vv(l0.localLabel), localToken: vv(l0.localToken), payload: vv(l0.payload) } : (s0 ? 'no local scope in response' : 'no response (command not implemented?)'));
      chk(6, 'frame 0 Closure scope: closureSalt, closureCount', !!c0 && vv(c0.closureSalt) === 'salt-21' && vv(c0.closureCount) === 42, { closureSalt: 'salt-21', closureCount: 42 }, c0 ? { closureSalt: vv(c0.closureSalt), closureCount: vv(c0.closureCount) } : (s0 ? 'no closure scope in response' : 'no response (command not implemented?)'));
      chk(6, 'frame 1 Local scope: midMarker, payload', !!l1 && vv(l1.midMarker) === 'mid-p1' && vv(l1.payload) === 'p1', { midMarker: 'mid-p1', payload: 'p1' }, l1 ? { midMarker: vv(l1.midMarker), payload: vv(l1.payload) } : (s1 ? 'no local scope in response' : 'no response (command not implemented?)'));
      chk(6, 'frame isolation: frame 1 Local does not contain frame 0 localLabel', !!l1 && !('localLabel' in l1), 'absent', l1 ? Object.keys(l1) : null);
      done(6);

      const EXPRS: [number, string, any][] = [
        [0, '_0xdec(0x0)', EC[0]], [0, '_0xdec(0x1)', EC[1]], [0, '_0xdec(0x2)', EC[2]], [0, '_0xdec(0x3)', EC[3]], [0, '_0xdec(0x4)', EC[4]],
        [0, `localLabel + ':' + closureSalt + ':' + closureCount`, EC[0] + ':salt-21:42'],
        [1, `midMarker + ':' + payload`, 'mid-p1:p1'],
        [1, 'typeof localLabel', 'undefined'],
        [0, 'typeof midMarker', 'undefined'],
      ];
      for (const how of ['callFrameId', 'frameIndex']) {
        for (const [fi, expression, expected] of EXPRS) {
          const msg: any = { type: 'manual-capture-evaluate', tabId, expression };
          if (how === 'frameIndex') msg.frameIndex = fi; else msg.callFrameId = rawFrames[fi] ? rawFrames[fi].callFrameId : undefined;
          const r: any = await cmd(msg, 'manual-capture-evaluate-response');
          const d = r.response && r.response.data;
          const okEval = !!(d && d.success);
          const value = okEval ? vv(d.result) : null;
          evalRes.push({ how, fi, expression, expected, ok: okEval, value, error: d ? d.error || null : 'no response' });
          chk(7, how + ' frame ' + fi + ': ' + expression, okEval && value === expected, expected, okEval ? value : (d ? d.error : 'no response'));
        }
      }
      out.phases.evals = evalRes;
      done(7);
    } else {
      skip(5, 'backend never received the real pause');
      skip(6, 'backend never received the real pause');
      skip(7, 'backend never received the real pause');
    }

    // ---- item 10: user step over, then continue
    const stepFrom = (await readObs()).obs.length;
    await fe(FE_STEP);
    const stepped: any = await waitPaused(BP_LINE + 1);
    const afterStep: any = await readObs();
    const newEv: any[] = afterStep.obs.slice(stepFrom);
    const sawResumed = newEv.some((e: any) => e.m === 'Debugger.resumed');
    const sawPaused = newEv.some((e: any) => e.m === 'Debugger.paused' && e.frames.length > 0 && e.frames[0].line === BP_LINE + 1);
    out.phases.step = { stepped, newEvents: newEv.map((e: any) => ({ m: e.m, reason: e.reason, top: e.frames ? e.frames[0] : undefined })) };
    chk(10, 'DevTools Step over works while attached (paused on next line)', !!stepped, 'paused at line ' + (BP_LINE + 1), stepped && stepped.top);
    chk(10, 'extension session observed resumed then paused for the step', sawResumed && sawPaused, true, { sawResumed, sawPaused });
    await fe(FE_RESUME);
    const done1 = await waitDone();
    const truth: any = (() => null)();
    const truthRaw: any = await pg(`JSON.stringify({decode:[0,1,2,3,4].map(function(i){return _0xdec(i)}),result:window.__obResult,sum:1+1})`);
    const tr: any = typeof truthRaw === 'string' ? JSON.parse(truthRaw) : {};
    out.phases.truth = tr;
    chk(10, 'DevTools continue finishes the page run while attached', !!done1 && tr.sum === 2, 'page completes and stays responsive', tr);
    chk(10, 'page output equals the independently computed expected string', tr.result === EXPECT_RESULT, EXPECT_RESULT, tr.result);

    // ---- item 8: compare with the real browser result
    chk(8, 'browser _0xdec(0..4) equals the independent node:vm recomputation', JSON.stringify(tr.decode) === JSON.stringify(EC), EC, tr.decode);
    if (evalRes.length > 0) {
      for (const how of ['callFrameId', 'frameIndex']) {
        const dec = evalRes.filter((e: any) => e.how === how && e.fi === 0 && e.expression.startsWith('_0xdec'));
        chk(8, how + ': backend decode values equal browser _0xdec(0..4)', dec.length === 5 && dec.every((e: any, i: number) => e.ok && e.value === tr.decode[i]), tr.decode, dec.map((e: any) => (e.ok ? e.value : e.error)));
      }
      const comp = evalRes.filter((e: any) => e.how === 'callFrameId' && e.expression.startsWith('localLabel'))[0];
      chk(8, 'frame-0 expression value is consistent with the page final output', !!comp && comp.ok && String(tr.result).startsWith(comp.value.split(':')[0] + ':p1:' + 'salt-21:42'), 'page output starts with sign:p1:salt-21:42', { frameValue: comp && comp.value, pageResult: tr.result });
    } else {
      skip(8, 'no backend evaluation results to compare');
    }
    done(8);

    // ---- second hit: breakpoint survives step and continue
    await pg('window.__obResult=undefined');
    await clickRun();
    const hit2: any = await waitPaused(BP_LINE);
    chk(10, 'user breakpoint still hits a second time', !!hit2, 'paused at line ' + BP_LINE, hit2 && hit2.top);
    await sleep(800);
    await fe(FE_RESUME);
    const done2 = await waitDone();
    chk(10, 'second continue finishes the page run', !!done2, 'window.__obResult is a string', done2);
    done(10);

    // ---- item 9 + record count, from the extension command log
    await sleep(500);
    const fin: any = await readObs();
    const cmds: any[] = fin.cmds || [];
    const obsEv: any[] = fin.obs || [];
    const counts: Record<string, number> = {};
    for (const c of cmds) counts[c.m] = (counts[c.m] || 0) + 1;
    const MUT = ['Debugger.resume', 'Debugger.stepOver', 'Debugger.stepInto', 'Debugger.stepOut', 'Debugger.pause', 'Debugger.setBreakpoint', 'Debugger.setBreakpointByUrl', 'Debugger.setInstrumentationBreakpoint', 'Debugger.setBreakpointOnFunctionCall', 'Debugger.removeBreakpoint', 'Debugger.continueToLocation', 'Debugger.setBreakpointsActive', 'Debugger.setSkipAllPauses', 'Debugger.setPauseOnExceptions'];
    const mut = cmds.filter((c: any) => MUT.includes(c.m));
    const userPauses = obsEv.filter((e: any) => e.m === 'Debugger.paused' && e.reason !== 'instrumentation');
    const windows: number[][] = userPauses.map((p: any) => { const r = obsEv.find((e: any) => e.m === 'Debugger.resumed' && e.t > p.t); return [p.t, r ? r.t : Date.now()]; });
    const inWin = mut.filter((c: any) => windows.some((w) => c.t >= w[0] && c.t <= w[1]));
    out.phases.commands = { counts, mutating: mut, windows, userPauseCount: userPauses.length, instrumentationPauses: obsEv.filter((e: any) => e.reason === 'instrumentation').length };
    chk(9, 'command log has entries and the observer survived the whole run', !!fin.ok && cmds.length > 0, 'ok and >0 commands', { ok: fin.ok, n: cmds.length });
    chk(9, 'no breakpoint set by the extension (Debugger.setBreakpoint / setBreakpointByUrl)', (counts['Debugger.setBreakpoint'] || 0) + (counts['Debugger.setBreakpointByUrl'] || 0) === 0, 0, { setBreakpoint: counts['Debugger.setBreakpoint'] || 0, setBreakpointByUrl: counts['Debugger.setBreakpointByUrl'] || 0 });
    chk(9, 'no instrumentation breakpoint set in manual mode', (counts['Debugger.setInstrumentationBreakpoint'] || 0) === 0, 0, counts['Debugger.setInstrumentationBreakpoint'] || 0);
    chk(9, 'no extension-issued resume/step/pause/breakpoint command inside any user pause window', inWin.length === 0, 0, inWin);
    chk(9, 'no extension-issued Debugger.resume or step at any time', (counts['Debugger.resume'] || 0) + (counts['Debugger.stepOver'] || 0) + (counts['Debugger.stepInto'] || 0) + (counts['Debugger.stepOut'] || 0) === 0, 0, { resume: counts['Debugger.resume'] || 0, stepOver: counts['Debugger.stepOver'] || 0, stepInto: counts['Debugger.stepInto'] || 0, stepOut: counts['Debugger.stepOut'] || 0 });
    chk(9, 'page stayed paused until DevTools resumed it (sampled 3s, evaluate stalled)', !!stillPaused && stillPaused.paused === true && !!(stalled && stalled.timeout), true, { stillPaused: stillPaused && stillPaused.paused, stalled });
    chk(9, 'selected DevTools tab after pause equals the control run without the extension attached', sel.length > 0 && sel.every((x: any) => x === ctlSelected), ctlSelected, sel);
    note(9, 'static: chrome.devtools.panels.openResource only appears inside a button click handler (panel.ts:1887); pause handler never calls it');
    done(9);

    const recFinal: any = await cmd({ type: 'manual-capture-get-records', tabId }, 'manual-capture-records-response');
    const rf: any[] = recFinal.response && recFinal.response.data && Array.isArray(recFinal.response.data.records) ? recFinal.response.data.records : [];
    chk(4, 'backend recorded every real (non-instrumentation) pause', rf.length === userPauses.length, userPauses.length, rf.length);
    done(4);
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
  }
  for (const n of Object.keys(TITLES).map(Number)) {
    const it = item(n);
    const anyFail = it.checks.some((c: any) => !c.ok);
    if (anyFail) it.status = 'fail';
    else if (it.skipped) it.status = 'unverified';
    else if (it.complete && it.checks.length > 0) it.status = 'pass';
    else it.status = 'unverified';
  }
  out.items = Object.keys(TITLES).map((n) => items[Number(n)]);
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  for (const it of out.items) {
    const bad = it.checks.filter((c: any) => !c.ok).map((c: any) => c.name);
    console.log('[' + it.status.toUpperCase() + '] ' + it.n + ' ' + it.title + (it.skipped ? ' (skipped: ' + it.skipped + ')' : '') + (bad.length ? ' :: failed: ' + bad.join(' | ') : ''));
  }
  if (out.fatal) console.log('FATAL: ' + out.fatal);
  console.log('saved ' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
