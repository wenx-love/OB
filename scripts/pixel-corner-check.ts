import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9460;
const HTTP = 8770;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/pixel-profile';
const SHOTS = ROOT + '/test/acceptance/layout-screens';
const OUT = ROOT + '/test/acceptance/pixel-corner-check.json';
const BASE = 'http://127.0.0.1:' + PORT;
const NL = String.fromCharCode(10);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const STUB = `<script>(function(){window.__sent=[];window.__netL=null;window.chrome={devtools:{inspectedWindow:{tabId:1,eval:function(e,cb){cb('http://127.0.0.1',{})}},panels:{openResource:function(){}},network:{onRequestFinished:{addListener:function(f){window.__netL=f}},onNavigated:{addListener:function(){}}}},storage:{local:{get:function(){return Promise.resolve({})},set:function(){return Promise.resolve()}}},runtime:{connect:function(){return{onMessage:{addListener:function(){}},onDisconnect:{addListener:function(){}},postMessage:function(m){window.__sent.push(m.type)},disconnect:function(){}}}}};})()</script>`;

function sample(n: number): string {
  const lines = ["var _0xa1b2=['hello','world','foo','bar'];", 'function _0x1c(a){a=a-0x0;return _0xa1b2[a];}'];
  for (let i = 0; i < n; i++) lines.push('var v' + i + '=_0x1c(' + (i % 4) + `)+'` + i + `';`);
  lines.push('var long1=' + JSON.stringify('x'.repeat(400)) + ';');
  lines.push('console.log(_0x1c(0),_0x1c(1));');
  return lines.join(NL);
}

const MEASURE = `(function(){function r(id){var e=document.getElementById(id);var b=e.getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom,vbar:e.offsetWidth-e.clientWidth,hbar:e.offsetHeight-e.clientHeight,sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight}}return {o:r('code-original'),c:r('code-recovered'),vw:innerWidth,vh:innerHeight,dpr:devicePixelRatio}})()`;

const sampler = (b64: string, rects: any[]) => `(async function(){var img=new Image();img.src='data:image/png;base64,${b64}';await img.decode();var cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;var cx=cv.getContext('2d');cx.drawImage(img,0,0);var rects=${JSON.stringify(rects)};var out=[];rects.forEach(function(q){var d=cx.getImageData(q.x,q.y,q.w,q.h).data;var n=d.length/4,white=0,mn=255,mx=0,sr=0,sg=0,sb=0;for(var i=0;i<d.length;i+=4){var r=d[i],g=d[i+1],b=d[i+2];sr+=r;sg+=g;sb+=b;var m=Math.min(r,g,b);if(m>=200)white++;if(m<mn)mn=m;var M=Math.max(r,g,b);if(M>mx)mx=M}out.push({name:q.name,x:q.x,y:q.y,w:q.w,h:q.h,pixels:n,nearWhite:white,avgRGB:[Math.round(sr/n),Math.round(sg/n),Math.round(sb/n)],minChannel:mn,maxChannel:mx})});return {imgW:img.width,imgH:img.height,blocks:out}})()`;

const server = createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  const name = u.pathname.replace('/', '');
  const nc = u.searchParams.get('nocorner') === '1';
  try {
    let body: any;
    let type = 'text/html; charset=utf-8';
    if (name === 'panel-harness.html') {
      body = readFileSync(DIST + '/panel.html', 'utf8').replace('</body>', STUB + '</body>');
      if (nc) body = body.replace(`href='panel-layout.css'`, `href='panel-layout.css?nocorner=1'`);
    } else {
      body = readFileSync(DIST + '/' + name);
      if (name.endsWith('.js')) type = 'text/javascript';
      else if (name.endsWith('.css')) type = 'text/css';
      if (name === 'panel-layout.css' && nc) body = body.toString('utf8').replace(/^.*scrollbar-corner.*$/m, '');
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('nf');
  }
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
      send(method: string, params: any = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); }); },
      close() { ws.close(); },
    });
  });
}

async function main() {
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });
  const out: any = { note: 'pixel sampling of the 800x600 editor bottom-right scrollbar corner. Environment: real built panel.html in a plain headless Chrome page with stubbed chrome.* (NOT the real DevTools panel). Control variant serves panel-layout.css with the scrollbar-corner rule removed, to prove the method can detect a white corner.', variants: {} };
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port not reachable');
    out.chrome = ver.Browser;
    const t: any = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    const ev = async (expr: string, awaitPromise = false): Promise<any> => {
      const r: any = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) return { error: String(r.exceptionDetails.text) + ' ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 200) };
      return r.result.value;
    };
    const waitFor = async (expr: string, ms: number) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ev(expr) === true) return true; await sleep(150); }
      return false;
    };
    await c.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
    for (const variant of ['fixed', 'control-corner-rule-removed']) {
      const nc = variant !== 'fixed';
      const rec: any = {};
      out.variants[variant] = rec;
      await c.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP + '/panel-harness.html?nocorner=' + (nc ? 1 : 0) });
      rec.ready = await waitFor(`typeof window.__netL==='function'`, 12000);
      await sleep(800);
      await ev(`window.__netL({request:{url:'http://127.0.0.1/app.js'},response:{content:{mimeType:'application/javascript'}},getContent:function(cb){cb(${JSON.stringify(sample(150))})}})`);
      await sleep(500);
      await ev(`document.getElementById('btn-recover').click()`);
      rec.recovered = await waitFor(`/完成|失败/.test(document.getElementById('status').textContent)`, 20000);
      await sleep(600);
      const m: any = await ev(MEASURE);
      rec.measure = m;
      const rects: any[] = [];
      const skipped: string[] = [];
      for (const k of ['o', 'c']) {
        const q = m[k];
        if (q.vbar > 0 && q.hbar > 0) {
          const x = Math.floor(q.r - q.vbar);
          const y = Math.floor(q.b - q.hbar);
          rects.push({ name: k + '-corner', x: x + 1, y: y + 1, w: q.vbar - 2, h: q.hbar - 2 });
          rects.push({ name: k + '-vtrack-above', x: x + 1, y: y - 40, w: q.vbar - 2, h: 20 });
        } else {
          skipped.push(k + ': no both scrollbars (vbar=' + q.vbar + ', hbar=' + q.hbar + ')');
        }
      }
      rec.skipped = skipped;
      const shot: any = await c.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(SHOTS + '/pixel-' + variant + '-800x600.png', Buffer.from(shot.data, 'base64'));
      rec.sample = rects.length ? await ev(sampler(shot.data, rects), true) : null;
      writeFileSync(OUT, JSON.stringify(out, null, 2));
    }
    c.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
    server.close();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
  const verdict: any = {};
  for (const v of Object.keys(out.variants)) {
    const bl = (out.variants[v].sample && out.variants[v].sample.blocks) || [];
    verdict[v] = bl.map((x: any) => x.name + ' px=' + x.pixels + ' nearWhite=' + x.nearWhite + ' avg=' + JSON.stringify(x.avgRGB) + ' min=' + x.minChannel + ' max=' + x.maxChannel);
    if (out.variants[v].skipped && out.variants[v].skipped.length) verdict[v].push('SKIPPED ' + out.variants[v].skipped.join('; '));
  }
  console.log('fatal=' + out.fatal + ' chrome=' + out.chrome);
  console.log(JSON.stringify(verdict, null, 1));
  console.log('measure fixed: ' + JSON.stringify(out.variants.fixed && out.variants.fixed.measure));
  console.log('result file: ' + OUT);
}

process.on('unhandledRejection', (e: any) => { console.log('unhandledRejection', e && e.message ? e.message : String(e)); });
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
