import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9430;
const HTTP = 8768;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/panel-perf-profile';
const TAG = process.env.TAG || 'before';
const RUNS = Number(process.env.RUNS || 5);
const ACTIVE = process.env.MODE === 'active';
const OUT = ROOT + '/test/acceptance/panel-perf-' + TAG + '.json';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const STUB = `<script>(function(){var L=[];window.__sent=[];window.__stor={sets:0,bytes:0};window.chrome={devtools:{inspectedWindow:{tabId:1,eval:function(e,cb){cb('http://127.0.0.1',{})}},panels:{openResource:function(){}}},storage:{local:{get:function(k){return Promise.resolve({})},set:function(o){window.__stor.sets++;window.__stor.bytes+=JSON.stringify(o).length;return Promise.resolve()}}},runtime:{connect:function(){return{onMessage:{addListener:function(f){L.push(f)}},onDisconnect:{addListener:function(){}},postMessage:function(m){window.__sent.push(m.type)},disconnect:function(){}}}}};window.__feed=function(m){for(var i=0;i<L.length;i++)L[i](m)};window.__lt=[];try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__lt.push(Math.round(e.duration))})}).observe({entryTypes:['longtask']})}catch(e){}})()</script>`;

const PAGE_EXP = `(async function(){
 var NL=String.fromCharCode(10);
 function filler(kb,n){var s='',i=0;while(s.length<kb*1024){s+='function f'+n+'_'+i+'(a, b) { var t = a + b * '+i+'; if (t > '+i+') { return t - 1; } return t + 1; }'+NL;i++}return s}
 var arr=[];for(var q=0;q<10;q++)arr.push('a'+q);
 var dec='var _arr='+JSON.stringify(arr)+'; function decOne(i){ i=i-0x100; return _arr[i]; } decOne(0x100); decOne(0x101); decOne(0x102);';
 var raf=function(){return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})};
 var now=function(){return performance.now()};
 var sid=100;var res={refreshes:[]};function mkMsg(n,reset){var caps=[],stab=[];for(var i=0;i<n;i++){var args=[{type:'number',value:256+i}];caps.push({key:'k'+i,scriptId:'1',scriptUrl:'http://x/d.js',functionName:'decOne',functionLocation:{lineNumber:3,columnNumber:2},callLocation:{lineNumber:9,columnNumber:1},arguments:args,returnValue:{type:'string',value:'v'+i},captureStatus:'success',count:3,firstSeq:i,lastSeq:i,timestamp:Date.now()});stab.push({scriptId:'1',scriptUrl:'http://x/d.js',functionName:'decOne',functionLocation:{lineNumber:3,columnNumber:2},arguments:args,values:[{type:'string',value:'v'+i}],distinctReturnCount:1,callCount:3,stable:true,firstSeq:i,lastSeq:i})}var ev={kind:'capture-state',active:true,breakpoints:3,stats:{hits:900,pauses:2700,success:900,failed:0,forcedResumes:0,foreignPauses:0,breakpointsSet:3},captures:caps,stability:stab,autoCaptureMinConfidence:'high'};if(reset)ev.resetReason='page navigated or reloaded';return{type:'debugger-event',event:ev}}
 for(var r=0;r<${RUNS};r++){
  var per=[];var rs0=now();if(${ACTIVE}){window.__feed(mkMsg(300,true));window.__feed(mkMsg(300,true));}(res.resets=res.resets||[]).push(Math.round(now()-rs0));
  for(var k=0;k<4;k++){
   var src=k<3?filler(100,k):dec;
   var a=now();
   window.__feed({type:'debugger-event',event:{kind:'script-discovered',script:{scriptId:String(sid++),url:'http://x/s'+k+'.js',startLine:0,startColumn:0,endLine:0,endColumn:0,hash:'h',isDynamic:false,source:src,analyzed:false}}});
   per.push(Math.round(now()-a));
  }
  res.refreshes.push({n:r+1,handlerMs:per,totalMs:per.reduce(function(x,y){return x+y},0),candidatesShown:document.getElementById('dec-candidates').textContent,scriptsShown:document.getElementById('dec-total').textContent});
  await new Promise(function(r2){setTimeout(r2,50)});
 }
 var caps=[],stab=[];
 for(var i=0;i<300;i++){var args=[{type:'number',value:256+i}];caps.push({key:'k'+i,scriptId:'1',scriptUrl:'http://x/d.js',functionName:'decOne',functionLocation:{lineNumber:3,columnNumber:2},callLocation:{lineNumber:9,columnNumber:1},arguments:args,returnValue:{type:'string',value:'v'+i},captureStatus:'success',count:3,firstSeq:i,lastSeq:i,timestamp:Date.now()});stab.push({scriptId:'1',scriptUrl:'http://x/d.js',functionName:'decOne',functionLocation:{lineNumber:3,columnNumber:2},arguments:args,values:[{type:'string',value:'v'+i}],distinctReturnCount:1,callCount:3,stable:true,firstSeq:i,lastSeq:i})}
 var msg={type:'debugger-event',event:{kind:'capture-state',active:true,breakpoints:3,stats:{hits:900,pauses:2700,success:900,failed:0,forcedResumes:0,foreignPauses:0,breakpointsSet:3},captures:caps,stability:stab,autoCaptureMinConfidence:'high'}};
 res.captureState={captures:300,bytes:JSON.stringify(msg).length,runs:[]};
 for(var j=0;j<10;j++){var b0=now();window.__feed(msg);var h=Math.round(now()-b0);await raf();res.captureState.runs.push({handlerMs:h,withRenderMs:Math.round(now()-b0)})}
 res.cards=document.querySelectorAll('#cap-list .decoder-card').length;
 res.longtasks=window.__lt;
 var sent={};window.__sent.forEach(function(t){sent[t]=(sent[t]||0)+1});
 res.sentToBackground=sent;
 res.storage=window.__stor;
 return res;
})()`;

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
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });
  const out: any = { tag: TAG, runs: RUNS, note: 'real built panel.js loaded in a plain page with stubbed chrome.* APIs; measures panel main-thread logic only; NOT the real DevTools panel and excludes DevTools own rendering', pageErrors: [] };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    const t: any = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
    const c = await connect(t.webSocketDebuggerUrl, (m) => { if (m.method === 'Runtime.exceptionThrown') out.pageErrors.push(String(m.params.exceptionDetails.text) + ' ' + String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || '').slice(0, 200)); });
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/panel-harness.html' });
    await sleep(3000);
    const ready: any = await c.send('Runtime.evaluate', { expression: "typeof window.__feed + ' ' + !!document.getElementById('cap-list') + ' ' + !!document.getElementById('dec-candidates')", returnByValue: true });
    out.ready = ready.result.value;
    console.log('ready:', out.ready);
    if (String(out.ready).startsWith('function true true')) {
      const r: any = await c.send('Runtime.evaluate', { expression: PAGE_EXP, awaitPromise: true, returnByValue: true, timeout: 240000 });
      out.result = r.exceptionDetails ? { error: r.exceptionDetails.text + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300) } : r.result.value;
    }
    c.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
