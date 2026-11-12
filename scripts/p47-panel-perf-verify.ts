import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Phase 4.7 面板性能修复：主线程响应性验证（真机、离线）。
// 本地 HTTP 服务 + 真实扩展 + 真实面板；Chrome 以 host-resolver-rules 封掉除 127.0.0.1 以外的一切主机，
// 因此不可能访问 17qcc.com。只做观测，不启动捕获，不点击真实网站，不访问外部站点。
//
// 固定输入：test/fixtures/p47-512kb-synthetic.js（sha256 必须与修复前两次真机运行一致）。
// 观测项：面板主线程卡顿、面板 Runtime.evaluate 往返、Service Worker 侧（面板无关）往返、队列状态、候选数。
const ROOT = 'D:/Projects/ob-recover';
const DIST = process.env.DIST_OVERRIDE || (ROOT + '/dist');
const FIXTURE = ROOT + '/test/fixtures/p47-512kb-synthetic.js';
const RUN_NO = String(process.env.RUN_NO || '1');
const LABEL = process.env.BUILD_LABEL || 'after';
const OUT = ROOT + '/test/acceptance/p47-panel-perf-' + LABEL + '-run' + RUN_NO + '.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9480;
const HTTP = 8790;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-panel-perf-profile';
const HEADLESS = process.env.HEADLESS === '1';
const ANALYZE_WINDOW_MS = Number(process.env.ANALYZE_WINDOW_MS || 240000);
const PROBE_TIMEOUT_MS = 3000;
const GLOBAL_CAP_MS = 8 * 60 * 1000;
const RESOLVER_RULES = 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const sha = (b: any): string => createHash('sha256').update(b).digest('hex');
const short = (s: any, n = 300): string => String(s === undefined || s === null ? '' : s).slice(0, n);
const NL = String.fromCharCode(10);

const HTML = `<!doctype html><html><head><meta charset='utf-8'><title>perf-loading</title></head><body><p>panel perf page</p><script src='/app.js'></script></body></html>`;
const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;
const DEC = `(function(){var g=function(id){var e=document.getElementById(id);return e?e.textContent:null};return {total:g('dec-total'),analyzed:g('dec-analyzed'),candidates:g('dec-candidates'),high:g('dec-high'),calls:g('dec-calls'),cards:[].slice.call(document.querySelectorAll('#decoder-list .decoder-card')).length}})()`;
// 面板主线程滞后监测：100 ms 定时器，记录最大间隔与超 500 ms 的间隔
const LAG_INSTALL = `(function(){if(window.__lag)return 'already';var s={start:performance.now(),last:performance.now(),maxGap:0,ticks:0,gaps:[]};window.__lag=s;setInterval(function(){var n=performance.now();var g=n-s.last-100;s.last=n;s.ticks++;if(g>s.maxGap)s.maxGap=g;if(g>500&&s.gaps.length<80)s.gaps.push({at:Math.round(n-s.start),gap:Math.round(g)});},100);return 'installed'})()`;
const LAG_READ = `(function(){var s=window.__lag;if(!s)return {installed:false};return {installed:true,now:Math.round(performance.now()-s.start),ticks:s.ticks,maxGapMs:Math.round(s.maxGap),gapCount:s.gaps.length,gaps:s.gaps.slice(-20)}})()`;
const PANEL_RT = `(function(){var t0=performance.now();var x=0;for(var i=0;i<1000;i++)x+=i;return {ok:true,ms:Math.round((performance.now()-t0)*1000)/1000}})()`;
// 面板侧直接观测分析客户端状态：经 window 暴露只读快照不可达，因此改用面板内的性能标记。
// 用 PerformanceObserver 记录长任务（>50 ms），长任务出现在面板主线程上，能判定是谁在占用它。
const LONGTASK_INSTALL = `(function(){if(window.__lt)return 'already';window.__lt={supported:typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes&&PerformanceObserver.supportedEntryTypes.indexOf('longtask')>=0,entries:[]};try{if(window.__lt.supported){var po=new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(window.__lt.entries.length<100)window.__lt.entries.push({start:Math.round(e.startTime),dur:Math.round(e.duration),name:e.name})})});po.observe({entryTypes:['longtask']});window.__lt.observer=po}}catch(e){window.__lt.error=String(e&&e.message?e.message:e)}return window.__lt.supported?'installed':'unsupported'})()`;
const LONGTASK_READ = `(function(){var s=window.__lt;if(!s)return {installed:false};return {installed:true,supported:s.supported,error:s.error||null,count:s.entries.length,maxMs:Math.max(0,Math.round(Math.max.apply(null,[0].concat(s.entries.map(function(e){return e.dur}))))),entries:s.entries.slice(-15)}})()`;
// 面板侧队列状态：通过面板模块暴露的实例不可达，这里用 DOM 统计间接判断进度
const SW_DIRECT = `new Promise(function(res){try{chrome.debugger.getTargets(function(ts){var t=ts.filter(function(x){return x.type==='page'&&String(x.url).indexOf('http://127.0.0.1:${HTTP}/')===0})[0];if(!t||typeof t.tabId!=='number'){res({noTab:true,count:ts.length});return}var g=globalThis.__obRecoverTest;res({tabId:t.tabId,status:g?g.getStatus(t.tabId):'no-hook'})})}catch(e){res({thrown:String(e&&e.message?e.message:e)})}})`;

function connect(wsUrl: string, onEvent?: (method: string, params: any, sessionId?: string) => void): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    const failAll = (why: string): void => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } return; }
      if (onEvent && m.method) { try { onEvent(m.method, m.params || {}, m.sessionId); } catch { /* ignore */ } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: any = {}, sessionId?: string): Promise<any> {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout: ' + method)); }, 20000);
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

async function main(): Promise<void> {
  mkdirSync(ROOT + '/test/acceptance', { recursive: true });
  if (existsSync(OUT)) { console.log('REFUSED: output exists: ' + OUT); process.exit(2); }
  const T0 = Date.now();
  const now = (): number => Date.now() - T0;
  const out: Record<string, any> = {
    schema: 'ob-recover.panel-perf/1',
    runNo: RUN_NO,
    buildLabel: LABEL,
    buildPath: DIST,
    startedAt: new Date(T0).toISOString(),
    note: 'local page only; every non-local host is unresolvable; observation only; no capture started, no real site touched',
    conditions: { headless: HEADLESS, resolverRules: RESOLVER_RULES, ports: { cdp: PORT, http: HTTP }, probeTimeoutMs: PROBE_TIMEOUT_MS, analyzeWindowMs: ANALYZE_WINDOW_MS },
    fixture: {},
    dist: {},
    steps: {},
  };
  const fixtureRaw = readFileSync(FIXTURE);
  out.fixture = { path: 'test/fixtures/p47-512kb-synthetic.js', bytes: fixtureRaw.length, sha256: sha(fixtureRaw) };
  for (const f of ['background.js', 'devtools.js', 'panel.js', 'sandbox.js']) out.dist[f] = sha(readFileSync(DIST + '/' + f));
  let firstSave = true;
  const save = (): void => { writeFileSync(OUT, JSON.stringify(out, null, 2), { flag: firstSave ? 'wx' : 'w' }); firstSave = false; };
  save();

  for (const p of [PORT, HTTP]) {
    let busy = false;
    try { await fetch('http://127.0.0.1:' + p + '/json/version', { signal: AbortSignal.timeout(1000) }); busy = true; } catch { /* free */ }
    if (busy) { console.log('REFUSED: port ' + p + ' busy'); process.exit(2); }
  }

  const appBuf = fixtureRaw;
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

  const probes: any[] = [];
  const rtLogs: any[] = [];
  out.probes = probes;
  out.panelLog = rtLogs;
  const labels: Record<string, string> = {};
  let b: any = null;
  let psid = '';
  let swSid = '';
  const exceptions: any[] = [];
  out.exceptions = exceptions;

  const onEvent = (method: string, params: any, sessionId?: string): void => {
    const label = sessionId ? labels[sessionId] : undefined;
    if (method === 'Runtime.exceptionThrown' && label) {
      const d = params.exceptionDetails || {};
      if (exceptions.length < 50) exceptions.push({ t: now(), session: label, text: short(d.text, 200), description: short(d.exception && d.exception.description, 400) });
    } else if (method === 'Runtime.consoleAPICalled' && label === 'panel') {
      const text = short((params.args || []).map((a: any) => (a.value !== undefined ? a.value : (a.description || a.type))).join(' '), 300);
      if (text.indexOf('分析') >= 0 || text.indexOf('脚本') >= 0) out.panelLog.push({ t: now(), type: params.type, text });
    }
  };

  const step = async (name: string, fn: () => Promise<any>): Promise<any> => {
    const t = now();
    let v: any;
    try { v = { ok: true, value: await fn() }; } catch (e: any) { v = { ok: false, error: short(e && e.message ? e.message : e) }; }
    out.steps[name] = { at: t, ms: now() - t, ...v };
    save();
    return out.steps[name];
  };

  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const args = ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--host-resolver-rules=' + RESOLVER_RULES];
  if (HEADLESS) args.push('--headless=new');
  args.push('about:blank');
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  const killChrome = (): void => { try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* gone */ } };
  const watchdog = setTimeout(() => {
    out.abortedBy = 'global cap';
    try { save(); } catch { /* ignore */ }
    killChrome();
    process.exit(3);
  }, GLOBAL_CAP_MS);

  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port unreachable');
    out.chrome = ver.Browser;
    await sleep(800);
    b = await connect(ver.webSocketDebuggerUrl, onEvent);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const extId: string = (await b.send('Extensions.loadUnpacked', { path: DIST })).id;
    out.extensionId = extId;
    await sleep(1500);
    // 顺序很关键：先建空白页 → 打开 DevTools → 连接调试器 → 才导航到目标页。
    // 这样 512 KB 脚本是「连接之后」才被解析的，后台会发出 script-discovered，面板才会真正开始分析。
    const page: any = await b.send('Target.createTarget', { url: 'about:blank' });
    await sleep(800);
    const pageSid: string = (await b.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    labels[pageSid] = 'page';
    await b.send('Page.enable', {}, pageSid);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);

    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    const dsid: string = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    labels[dsid] = 'devtools';
    await b.send('Runtime.evaluate', { expression: SHOW, awaitPromise: true, returnByValue: true }, dsid);
    await sleep(2500);

    const tg1: any = await b.send('Target.getTargets');
    const pt = tg1.targetInfos.find((t: any) => String(t.url).indexOf(extId + '/panel.html') >= 0);
    psid = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    labels[psid] = 'panel';
    const sw = tg1.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).indexOf(extId + '/background.js') >= 0);
    if (sw) { swSid = (await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).sessionId; labels[swSid] = 'sw'; }
    await b.send('Runtime.enable', {}, psid);
    if (swSid) await b.send('Runtime.enable', {}, swSid);

    const ev = async (sid: string, expr: string, awaitPromise = false): Promise<any> => {
      const r: any = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, sid);
      if (r.exceptionDetails) return { error: short(r.exceptionDetails.text) };
      return r.result.value;
    };
    const timed = async (name: string, fn: () => Promise<any>, ms = PROBE_TIMEOUT_MS): Promise<any> => {
      const t0 = Date.now();
      try {
        const r: any = await Promise.race([fn().then((v: any) => ({ v }), (e: any) => ({ err: short(e && e.message ? e.message : e) })), sleep(ms).then(() => ({ to: true }))]);
        const el = Date.now() - t0;
        if (r.to) return { name, ok: false, timeout: true, ms: el };
        if (r.err !== undefined) return { name, ok: false, error: r.err, ms: el };
        return { name, ok: true, ms: el, value: r.v };
      } catch (e: any) { return { name, ok: false, error: short(e && e.message ? e.message : e), ms: Date.now() - t0 }; }
    };

    await step('clickConnect', async () => {
      const r = await ev(psid, `document.getElementById('btn-rt-connect').click();1`, false);
      return { clicked: true, result: r };
    });
    // 连接完成后再导航：这是 512 KB 脚本会被分析的前提
    await step('waitConnected', async () => {
      const t0 = Date.now();
      let last: any = null;
      while (Date.now() - t0 < 45000) {
        await sleep(1000);
        const r = await timed('status', () => ev(psid, `(function(){var s=document.getElementById('rt-debugger-status');return s?s.textContent:null})()`), 5000);
        last = r;
        if (r.ok && String(r.value).indexOf('已连接') >= 0) return { status: r.value, ms: Date.now() - t0 };
      }
      return { status: last && last.value, ms: Date.now() - t0, note: 'connect status never showed connected' };
    });
    await ev(psid, LAG_INSTALL);
    await ev(psid, LONGTASK_INSTALL);
    await step('navigateToHeavyPage', async () => {
      await b.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/index.html' }, pageSid);
      return { navigatedAt: now() };
    });

    // 分析进行中：每 500 ms 采样面板往返、SW（面板无关）往返、页面往返与滞后读数
    const analyzeStart = now();
    let analysisDone = false;
    let lastDec: any = null;
    let stableCount = 0;
    while (now() - analyzeStart < ANALYZE_WINDOW_MS) {
      const t = now();
      const [p, s, pg, lag] = await Promise.all([
        timed('panel', () => ev(psid, PANEL_RT)),
        swSid ? timed('sw', () => ev(swSid, 'Date.now()')) : Promise.resolve({ name: 'sw', ok: false, error: 'no sw' } as any),
        timed('page', () => ev(pageSid, '1+1')),
        timed('lag', () => ev(psid, LAG_READ), 2000),
      ]);
      const dec = await timed('dec', () => ev(psid, DEC), 2000);
      if (dec.ok) lastDec = dec.value;
      probes.push({
        t,
        panel: { ok: p.ok, ms: p.ms, timeout: !!p.timeout },
        sw: { ok: s.ok, ms: s.ms, timeout: !!s.timeout },
        page: { ok: pg.ok, ms: pg.ms, timeout: !!pg.timeout },
        lag: lag.ok && lag.value ? { maxGapMs: lag.value.maxGapMs, ticks: lag.value.ticks, gapCount: lag.value.gapCount } : null,
        dec: dec.ok ? dec.value : null,
      });
      if (dec.ok && dec.value) {
        const key = [dec.value.analyzed, dec.value.candidates, dec.value.total].join('|');
        if (key === out.lastDecKey) stableCount++; else { stableCount = 0; out.lastDecKey = key; }
        // 分析完成的判据：候选数稳定且已分析脚本数不再增长
        if (stableCount >= 6 && Number(dec.value.candidates) > 0) { analysisDone = true; break; }
      }
      if (probes.length % 5 === 0) save();
      await sleep(500);
    }
    out.analysis = {
      done: analysisDone,
      windowMs: now() - analyzeStart,
      finalDecoderStats: lastDec,
      probeCount: probes.length,
      panelTimeouts: probes.filter((p: any) => p.panel.timeout).length,
      panelMaxMs: Math.max(0, ...probes.map((p: any) => p.panel.ms || 0)),
      swTimeouts: probes.filter((p: any) => p.sw.timeout).length,
      pageTimeouts: probes.filter((p: any) => p.page.timeout).length,
      pageMaxMs: Math.max(0, ...probes.map((p: any) => p.page.ms || 0)),
    };
    save();

    await step('finalLag', async () => await ev(psid, LAG_READ));
    await step('finalLongTasks', async () => await ev(psid, LONGTASK_READ));
    await step('finalDec', async () => await ev(psid, DEC));
    await step('swDirect', async () => (swSid ? await ev(swSid, SW_DIRECT, true) : { noSw: true }));
    const decAfter = out.steps.finalDec.value;
    out.verdict = {
      panelStayedResponsive: out.analysis.panelTimeouts === 0,
      candidatesFound: decAfter ? Number(decAfter.candidates) : null,
      analysisCompleted: !!analysisDone,
      note: 'counts and timings only; no judgement about capture, validation or replacement',
    };
  } catch (e: any) {
    out.fatal = short(e && e.message ? e.message : e, 500);
  } finally {
    clearTimeout(watchdog);
    try { if (b) b.close(); } catch { /* ignore */ }
    killChrome();
    try { server.close(); } catch { /* ignore */ }
    out.served = served;
    out.finishedAt = new Date().toISOString();
    try { save(); } catch { /* ignore */ }
  }
  console.log('done fatal=' + (out.fatal || 'none') + ' panelTimeouts=' + (out.analysis ? out.analysis.panelTimeouts : 'n/a') + ' candidates=' + (out.verdict ? out.verdict.candidatesFound : 'n/a') + ' out=' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
