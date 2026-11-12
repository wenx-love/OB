import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9440;
const HTTP = 8769;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/layout-check-profile';
const SHOTS = ROOT + '/test/acceptance/layout-screens';
const OUT = ROOT + '/test/acceptance/layout-check.json';
const BASE = 'http://127.0.0.1:' + PORT;
const NL = String.fromCharCode(10);
const SIZES: number[][] = [[1842, 780], [1200, 700], [800, 600], [500, 600]];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const STUB = '<script>(function(){var L=[];window.__sent=[];window.__netL=null;window.__navL=null;' +
  'window.chrome={devtools:{inspectedWindow:{tabId:1,eval:function(e,cb){cb("http://127.0.0.1",{})}},panels:{openResource:function(){}},' +
  'network:{onRequestFinished:{addListener:function(f){window.__netL=f}},onNavigated:{addListener:function(f){window.__navL=f}}}},' +
  'storage:{local:{get:function(){return Promise.resolve({})},set:function(){return Promise.resolve()}}},' +
  'runtime:{connect:function(){return{onMessage:{addListener:function(f){L.push(f)}},onDisconnect:{addListener:function(){}},postMessage:function(m){window.__sent.push(m.type)},disconnect:function(){}}}}};' +
  'window.__feed=function(m){L.forEach(function(f){f(m)})};})()</script>';

function sample(n: number): string {
  const lines = ["var _0xa1b2=['hello','world','foo','bar'];", 'function _0x1c(a){a=a-0x0;return _0xa1b2[a];}'];
  for (let i = 0; i < n; i++) lines.push('var v' + i + '=_0x1c(' + (i % 4) + ")+'" + i + "';");
  lines.push('console.log(_0x1c(0),_0x1c(1));');
  return lines.join(NL);
}
const FILES = [
  { url: 'http://127.0.0.1/static/js/a-very-long-obfuscated-bundle-name-with-hash-3f9a2c7d1e8b4a6f5c0d9e2b7a1c3f84.chunk.min.js?v=20260101', body: sample(400) },
  { url: 'http://127.0.0.1/app.js', body: sample(150) },
  { url: 'http://127.0.0.1/vendor/lib.js', body: sample(120) },
];

const MEASURE = '(function(){' +
  'function R(id){var e=document.getElementById(id);if(!e)return null;var b=e.getBoundingClientRect();return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}}' +
  'function spill(sel){var host=document.querySelector(sel);if(!host)return null;var hb=host.getBoundingClientRect();var bad=[];var kids=host.children;for(var i=0;i<kids.length;i++){var c=kids[i];if(c.hidden)continue;var b=c.getBoundingClientRect();if(b.width===0&&b.height===0)continue;if(b.right>hb.right+1||b.left<hb.left-1)bad.push((c.id||c.className||c.tagName)+"@"+Math.round(b.right-hb.right))}return {scrollW:host.scrollWidth,clientW:host.clientWidth,spill:bad}}' +
  'var de=document.documentElement,app=document.getElementById("app"),cp=document.getElementById("code-panels"),dock=document.getElementById("dock");' +
  'var main=R("main"),ed=R("editors"),po=R("panel-original"),pr=R("panel-recovered"),tb=R("toolbar"),rs=R("rt-strip");' +
  'var vis=function(r){return !!r&&r.w>0&&r.h>0};var avail=main.h-tb.h-rs.h;' +
  'return {viewport:{w:innerWidth,h:innerHeight},pageOverflowX:de.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1,pageOverflowY:de.scrollHeight>innerHeight+1||document.body.scrollHeight>innerHeight+1,' +
  'state:{size:app.dataset.size,short:app.dataset.short,sidebar:app.dataset.sidebar,layout:cp.dataset.layout,active:cp.dataset.active,dockOpen:dock.dataset.open,dockPane:dock.dataset.pane},' +
  'rects:{sidebar:R("sidebar"),main:main,toolbar:tb,rtStrip:rs,editors:ed,original:po,recovered:pr,dock:R("dock")},' +
  'editorsPctOfMain:Math.round(ed.h/main.h*100),editorsPctBelowBars:Math.round(ed.h/avail*100),visibleEditors:(vis(po)?1:0)+(vis(pr)?1:0),' +
  'toolbar:spill("#toolbar"),rtStrip:spill("#rt-strip"),dockTabs:spill(".dock-tabs")}})()';

const server = createServer((req, res) => {
  const name = String(req.url || '/').split('?')[0].replace('/', '');
  try {
    let body: any;
    let type = 'text/html; charset=utf-8';
    if (name === 'panel-harness.html') {
      body = readFileSync(DIST + '/panel.html', 'utf8').replace('</body>', STUB + '</body>');
    } else {
      body = readFileSync(DIST + '/' + name);
      if (name.endsWith('.js')) type = 'text/javascript';
      else if (name.endsWith('.css')) type = 'text/css';
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('nf');
  }
});

function connect(wsUrl: string, onEvent: (m: any) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(ev.data);
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
      else if (m.method) onEvent(m);
    };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onopen = () => resolve({
      send(method: string, params: any = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }); },
      close() { ws.close(); },
    });
  });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'real built panel.html/panel.js/layout.ts loaded in a plain headless Chrome page with stubbed chrome.* APIs; NOT the real DevTools panel', sizes: {}, live: [], consoleErrors: [], pageErrors: [] };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    const t: any = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
    const c = await connect(t.webSocketDebuggerUrl, (m) => {
      if (m.method === 'Runtime.exceptionThrown') out.pageErrors.push(String(m.params.exceptionDetails.text) + ' ' + String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || '').slice(0, 200));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') out.consoleErrors.push(String((m.params.args || []).map((a: any) => a.value || a.description || '').join(' ')).slice(0, 200));
    });
    await c.send('Page.enable');
    await c.send('Runtime.enable');

    const ev = async (expr: string, awaitPromise = false): Promise<any> => {
      const r: any = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 200) };
      return r.result.value;
    };
    const click = (sel: string) => ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return "no element";e.click();return "ok"})()');
    const emulate = (w: number, h: number) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const shot = async (w: number, h: number, name: string) => {
      const r: any = await c.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(SHOTS + '/' + w + 'x' + h + '-' + name + '.png', Buffer.from(r.data, 'base64'));
    };
    const measure = async (w: number, h: number, name: string, store: any, doShot = true) => {
      await sleep(350);
      store[name] = await ev(MEASURE);
      if (doShot) await shot(w, h, name);
    };
    const waitFor = async (expr: string, ms: number) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ev(expr) === true) return true; await sleep(150); }
      return false;
    };

    for (const [w, h] of SIZES) {
      const key = w + 'x' + h;
      const rec: any = { states: {}, func: {} };
      out.sizes[key] = rec;
      await emulate(w, h);
      await c.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/panel-harness.html' });
      await sleep(1200);
      await ev('localStorage.clear()');
      await c.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/panel-harness.html' });
      rec.ready = await waitFor("typeof window.__feed==='function' && !!document.getElementById('dock') && !!window.__netL", 10000);
      await sleep(1000);
      if (!rec.ready) continue;

      // 载入 3 个脚本
      for (const f of FILES) {
        await ev('window.__netL({request:{url:' + JSON.stringify(f.url) + '},response:{content:{mimeType:"application/javascript"}},getContent:function(cb){cb(' + JSON.stringify(f.body) + ')}})');
      }
      await sleep(500);
      rec.func.scriptsListed = await ev("document.querySelectorAll('#script-list li').length");
      rec.func.recoverEnabled = await ev("!document.getElementById('btn-recover').disabled");
      rec.func.toolbarFile = await ev("document.getElementById('tb-file').textContent");
      rec.func.firstItemTitleHasFullUrl = await ev("(document.querySelector('#script-list li')||{}).title === " + JSON.stringify(FILES[0].url));

      await click('#btn-recover');
      rec.func.recoverDone = await waitFor("/完成|失败/.test(document.getElementById('status').textContent)", 20000);
      rec.func.recoverStatus = await ev("document.getElementById('status').textContent");
      rec.func.transformCount = await ev("document.getElementById('transform-count').textContent");
      rec.func.copyButtonsEnabled = await ev("[!document.getElementById('btn-copy-original').disabled, !document.getElementById('btn-copy-recovered').disabled]");
      rec.func.toolbarCountChip = await ev("(function(){var e=document.getElementById('tb-count');return e.hidden?'hidden':e.textContent})()");

      await measure(w, h, 'default', rec.states);
      rec.func.codeTopDelta = await ev("({layout:document.getElementById('code-panels').dataset.layout,delta:Math.round(document.getElementById('code-recovered').getBoundingClientRect().top-document.getElementById('code-original').getBoundingClientRect().top)})");

      // 搜索
      await ev("(function(){var i=document.getElementById('search-original');i.value='v1';i.dispatchEvent(new Event('input'))})()");
      await sleep(600);
      rec.func.searchCountOriginal = await ev("document.getElementById('search-count-original').textContent");
      await ev("(function(){var i=document.getElementById('search-original');i.value='';i.dispatchEvent(new Event('input'))})()");
      await sleep(400);

      // 同步滚动
      await ev("document.getElementById('code-original').scrollTop=0;document.getElementById('code-recovered').scrollTop=0;1");
      await sleep(150);
      await ev("document.getElementById('code-original').scrollTop=400;1");
      await sleep(300);
      rec.func.scrollSync = await ev("(function(){var o=document.getElementById('code-original'),r=document.getElementById('code-recovered');return {layout:document.getElementById('code-panels').dataset.layout,origTop:Math.round(o.scrollTop),origScrollable:o.scrollHeight>o.clientHeight,recTop:Math.round(r.scrollTop),recScrollable:r.scrollHeight>r.clientHeight}})()");

      // 原有按钮发出的消息
      await ev('window.__sent.length=0;1');
      for (const sel of ['#btn-rt-connect', '#btn-rt-clear', '#btn-refresh-discovery']) await click(sel);
      await click('.dock-tab[data-pane="runtime"]');
      await sleep(200);
      await click('.dock-tab[data-pane="capture"]');
      await sleep(200);
      await click('#btn-cap-start');
      await click('#btn-cap-clear');
      await sleep(300);
      rec.func.messagesSentToBackground = await ev("(function(){var s={};window.__sent.forEach(function(t){s[t]=(s[t]||0)+1});return s})()");
      await click('.dock-tab[data-pane="capture"]');
      await sleep(200);

      // 模拟已连接：喂入 status-changed / script-discovered / capture-state / paused 事件，覆盖连接后才可用的按钮
      const decSrc = "var _arr=['a0','a1','a2','a3','a4','a5','a6','a7','a8','a9'];function decOne(i){i=i-0x100;return _arr[i];}decOne(0x100);decOne(0x101);decOne(0x102);";
      const feed = (o: any) => ev('window.__feed(' + JSON.stringify(o) + ')');
      await feed({ type: 'debugger-event', event: { kind: 'status-changed', status: 'connected' } });
      await feed({ type: 'debugger-event', event: { kind: 'script-discovered', script: { scriptId: '900', url: 'http://x/dec.js', startLine: 0, startColumn: 0, endLine: 0, endColumn: 0, hash: 'h', isDynamic: false, source: decSrc, analyzed: false } } });
      await sleep(300);
      const en = (id: string) => ev("!document.getElementById('" + id + "').disabled");
      rec.func.connected = { badge: await ev("document.getElementById('rt-debugger-status').textContent"), connectEnabled: await en('btn-rt-connect'), disconnectEnabled: await en('btn-rt-disconnect'), candidates: await ev("document.getElementById('dec-candidates').textContent") };
      await ev('window.__sent.length=0;1');
      await click('#btn-rt-disconnect');
      await click('.dock-tab[data-pane="capture"]');
      await sleep(200);
      await click('#btn-cap-start');
      await sleep(300);
      await feed({ type: 'debugger-event', event: { kind: 'capture-state', active: true, breakpoints: 1, stats: { hits: 0, pauses: 0, success: 0, failed: 0, forcedResumes: 0, foreignPauses: 0, breakpointsSet: 1 }, captures: [], stability: [], autoCaptureMinConfidence: 'high' } });
      await sleep(200);
      rec.func.stopEnabledAfterActive = await en('btn-cap-stop');
      await click('#btn-cap-stop');
      await feed({ type: 'debugger-event', event: { kind: 'paused', info: { reason: 'other', callFrames: [{ callFrameId: '1', functionName: 'f', location: { scriptId: '9', lineNumber: 1, columnNumber: 2 }, url: 'http://x/a.js' }] } } });
      await sleep(200);
      rec.func.resumeEnabledWhenPaused = await en('btn-rt-resume');
      await click('#btn-rt-resume');
      await sleep(200);
      rec.func.connectedButtonMessages = await ev("(function(){var s={};window.__sent.forEach(function(t){s[t]=(s[t]||0)+1});return s})()");
      rec.func.captureNotice = await ev("(function(){var e=document.getElementById('cap-notice');return e.hidden?'':e.textContent})()");
      await feed({ type: 'debugger-event', event: { kind: 'resumed' } });
      await feed({ type: 'debugger-event', event: { kind: 'capture-state', active: false, breakpoints: 0, stats: null, captures: [], stability: [] } });
      // 转换报告：展开、筛选
      await click('.dock-tab[data-pane="report"]');
      await sleep(300);
      let n = await ev("document.querySelectorAll('#transform-list .transform-item').length");
      rec.func.reportItemsFromEngine = n;
      rec.func.reportItemsSynthetic = false;
      if (typeof n !== 'number' || n < 3) {
        await ev("(function(){var h='';for(var i=0;i<40;i++){h+='<div class=\"transform-item\"><span class=\"transform-loc\">L'+i+':1</span><code class=\"transform-orig\">_0xa'+i+'(0x'+i+')</code><span class=\"transform-arrow\">→</span><code class=\"transform-new\">\\'str'+i+'\\'</code></div>'}document.getElementById('transform-list').innerHTML=h})()");
        rec.func.reportItemsSynthetic = true;
        n = 40;
        await sleep(300);
      }
      await measure(w, h, 'report-open', rec.states);
      const filt = async (scope: string, q: string) => {
        await ev('(function(){var s=document.getElementById("report-scope");s.value=' + JSON.stringify(scope) + ';s.dispatchEvent(new Event("change"));var i=document.getElementById("report-filter");i.value=' + JSON.stringify(q) + ';i.dispatchEvent(new Event("input"))})()');
        await sleep(450);
        return ev("({shownText:document.getElementById('report-shown').textContent,visibleItems:Array.prototype.filter.call(document.querySelectorAll('#transform-list .transform-item'),function(e){return !e.hidden}).length,total:document.querySelectorAll('#transform-list .transform-item').length})");
      };
      rec.func.reportFilter = { all_a1: await filt('all', '_0xa1'), orig_a1: await filt('orig', '_0xa1'), new_str3: await filt('new', 'str3'), loc_L2: await filt('loc', 'L2'), cross_orig_str3_expect0: await filt('orig', 'str3'), cross_new_a1_expect0: await filt('new', '_0xa1'), cross_loc_str_expect0: await filt('loc', 'str'), all_str3_expect11: await filt('all', 'str3'), cleared: await filt('all', '') };

      // 捕获面板：灌入 30 条记录
      await ev('(function(){var caps=[],stab=[];for(var i=0;i<30;i++){var a=[{type:"number",value:256+i}];caps.push({key:"k"+i,scriptId:"1",scriptUrl:"http://x/d.js",functionName:"decOne",functionLocation:{lineNumber:3,columnNumber:2},callLocation:{lineNumber:9,columnNumber:1},arguments:a,returnValue:{type:"string",value:"v"+i},captureStatus:"success",count:3,firstSeq:i,lastSeq:i,timestamp:Date.now()});stab.push({scriptId:"1",scriptUrl:"http://x/d.js",functionName:"decOne",functionLocation:{lineNumber:3,columnNumber:2},arguments:a,values:[{type:"string",value:"v"+i}],distinctReturnCount:1,callCount:3,stable:i%7!==0,firstSeq:i,lastSeq:i})}window.__feed({type:"debugger-event",event:{kind:"capture-state",active:true,breakpoints:3,stats:{hits:90,pauses:270,success:30,failed:0,forcedResumes:0,foreignPauses:0,breakpointsSet:3},captures:caps,stability:stab,autoCaptureMinConfidence:"high"}})})()');
      await click('.dock-tab[data-pane="capture"]');
      await sleep(300);
      rec.func.captureCards = await ev("document.querySelectorAll('#cap-list .decoder-card').length");
      rec.func.captureExpand = await ev("(function(){var c=document.querySelector('#cap-list .decoder-card');if(!c)return {err:'no card'};var h=c.querySelector('.decoder-card-header');var b=c.querySelector('.decoder-card-body');h.click();var open1=c.classList.contains('open');var h1=Math.round(b.getBoundingClientRect().height);h.click();var open2=c.classList.contains('open');var h2=Math.round(b.getBoundingClientRect().height);return {open1:open1,bodyH1:h1,open2:open2,bodyH2:h2}})()");
      rec.func.captureTabLiveDot = await ev("document.querySelector('.dock-tab[data-pane=\"capture\"]').classList.contains('live')");
      await measure(w, h, 'capture-open', rec.states);

      await click('.dock-tab[data-pane="decoder"]');
      await measure(w, h, 'decoder-open', rec.states, false);
      await click('#btn-rt-details');
      await measure(w, h, 'runtime-open', rec.states);

      // 折叠抽屉，切换文件栏
      await click('#btn-dock-toggle');
      await measure(w, h, 'dock-collapsed', rec.states, false);
      await click('#btn-toggle-sidebar');
      await measure(w, h, 'sidebar-toggled', rec.states);
      if (w < 700) {
        const px = w - 20;
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: 300, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: 300, button: 'left', clickCount: 1 });
        await sleep(300);
        rec.func.overlayClickClosesSidebar = await ev(`document.getElementById('app').dataset.sidebar`);
      } else {
        await click('#btn-toggle-sidebar');
      }
      await sleep(250);

      // 布局切换：连续点四次，再点重置
      const modes: any[] = [];
      for (let i = 0; i < 4; i++) {
        await click('#btn-layout-mode');
        await sleep(250);
        modes.push(await ev("({btn:document.getElementById('btn-layout-mode').textContent,layout:document.getElementById('code-panels').dataset.layout,tabsBarVisible:!document.getElementById('editor-tabs').hidden,pageOverflowX:document.documentElement.scrollWidth>innerWidth+1})"));
      }
      rec.func.layoutModeCycle = modes;
      await click('#btn-sync-scroll');
      rec.func.syncToggledOff = await ev("document.getElementById('btn-sync-scroll').getAttribute('aria-pressed')");
      await click('.dock-tab[data-pane="report"]');
      await click('#btn-reset-layout');
      await sleep(500);
      rec.states['after-reset'] = await ev(MEASURE);
      rec.func.syncAfterReset = await ev("document.getElementById('btn-sync-scroll').getAttribute('aria-pressed')");
      const d = rec.states['default'].state;
      const a = rec.states['after-reset'].state;
      rec.func.resetRestoresDefault = d.size === a.size && d.sidebar === a.sidebar && d.layout === a.layout && a.dockOpen === 'false';
      writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log('done size ' + key);
    }

    // 不重载的连续缩放：检查布局是否自适应
    await emulate(1842, 780);
    await sleep(500);
    const live: any[] = [];
    const seq: number[][] = [[1842, 780], [1200, 700], [800, 600], [500, 600], [1842, 780]];
    for (const [w, h] of seq) {
      await emulate(w, h);
      await sleep(600);
      const m: any = await ev(MEASURE);
      live.push({ to: w + 'x' + h, state: m.state, pageOverflowX: m.pageOverflowX, editorsPctOfMain: m.editorsPctOfMain, visibleEditors: m.visibleEditors, toolbarSpill: m.toolbar && m.toolbar.spill, rtStripSpill: m.rtStrip && m.rtStrip.spill });
    }
    // 高度不足时自动折叠抽屉
    await emulate(1200, 700);
    await sleep(400);
    await click('.dock-tab[data-pane="report"]');
    await sleep(300);
    const before: any = await ev(MEASURE);
    await emulate(1200, 450);
    await sleep(600);
    const after: any = await ev(MEASURE);
    live.push({ to: '1200x450 (dock was open at 1200x700)', dockOpenBefore: before.state.dockOpen, dockOpenAfter: after.state.dockOpen, short: after.state.short, editorsPctOfMain: after.editorsPctOfMain, pageOverflowX: after.pageOverflowX });
    out.live = live;
    c.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
    console.log('FATAL', out.fatal);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }

  console.log('chrome=' + out.chrome + ' pageErrors=' + out.pageErrors.length + ' consoleErrors=' + out.consoleErrors.length);
  if (out.pageErrors.length) console.log('pageErrors: ' + JSON.stringify(out.pageErrors.slice(0, 5)));
  if (out.consoleErrors.length) console.log('consoleErrors: ' + JSON.stringify(out.consoleErrors.slice(0, 5)));
  for (const key of Object.keys(out.sizes)) {
    const s = out.sizes[key];
    console.log('== ' + key + ' ready=' + s.ready + ' func=' + JSON.stringify(s.func));
    for (const name of Object.keys(s.states || {})) {
      const m = s.states[name];
      if (!m || m.error) { console.log('  ' + name + ' ERR ' + JSON.stringify(m)); continue; }
      console.log('  ' + name + ' size=' + m.state.size + ' layout=' + m.state.layout + ' sidebar=' + m.state.sidebar + ' dock=' + m.state.dockOpen + '/' + m.state.dockPane + ' ovX=' + m.pageOverflowX + ' ovY=' + m.pageOverflowY + ' editors=' + m.rects.editors.h + 'px(' + m.editorsPctOfMain + '% of main, ' + m.editorsPctBelowBars + '% below bars) visEd=' + m.visibleEditors + ' tbSpill=' + JSON.stringify(m.toolbar.spill) + ' rtSpill=' + JSON.stringify(m.rtStrip.spill) + ' dockTabSpill=' + JSON.stringify(m.dockTabs.spill));
    }
  }
  console.log('LIVE ' + JSON.stringify(out.live));
  console.log('result file: ' + OUT);
}

process.on('unhandledRejection', (e: any) => { console.log('unhandledRejection', e && e.message ? e.message : String(e)); });
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
