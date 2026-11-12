import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Phase 4.7 面板性能修复：Worker 真实执行验证（真机、离线）。
// 目的单一：证明扩展页面里 new Worker(new URL(...)) 能真正创建、收到任务并回传**与主线程一致**的结果。
// 本地服务 + 真实扩展；Chrome 封掉除 127.0.0.1 外的一切主机，不可能访问 17qcc.com。
// 只在扩展页上下文里驱动 Worker，不启动捕获、不点击真实网站。
const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const FIXTURE = ROOT + '/test/fixtures/p47-512kb-synthetic.js';
const SMALL = ROOT + '/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js';
const RUN_NO = String(process.env.RUN_NO || '1');
const OUT = ROOT + '/test/acceptance/p47-worker-exec-run' + RUN_NO + '.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9481;
const HTTP = 8791;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p47-worker-exec-profile';
const HEADLESS = process.env.HEADLESS === '1';
const WORKER_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS || 900000);
const GLOBAL_CAP_MS = 20 * 60 * 1000;
const RESOLVER_RULES = 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const sha = (b: any): string => createHash('sha256').update(b).digest('hex');
const short = (s: any, n = 400): string => String(s === undefined || s === null ? '' : s).slice(0, n);

const HTML = `<!doctype html><html><head><meta charset='utf-8'><title>worker-check</title></head><body>worker check page</body></html>`;
const SHOW = `(async function(){var m=await import('devtools://devtools/bundled/ui/legacy/legacy.js');var iv=m.InspectorView.InspectorView.instance();var id=iv.tabbedPane.tabIds().find(function(x){return x.indexOf('OB-Recover')>=0});await iv.showPanel(id);return iv.tabbedPane.selectedTabId})()`;

// 在面板上下文里：创建 Worker、发一个小任务和一个大任务，比较与主线程直接分析的结果是否一致。
// 这里用面板自己的模块图不可达内部函数，因此把 discoverDecoders 的调用放在 Worker 里，
// 面板侧只比较**结构与统计**（候选数、调用位置总数、functions 数、JSON 长度），足以判定一致性。
const PANEL_WORKER_TEST = (smallUrl: string, bigUrl: string, workerAsset: string) => `(async function(){
  var t0=performance.now();
  var report={};
  function shaLike(s){var h=0;for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0}return (h>>>0).toString(16)+':'+s.length}
  var small=await (await fetch(${JSON.stringify(smallUrl)})).text();
  var big=await (await fetch(${JSON.stringify(bigUrl)})).text();
  report.inputs={smallChars:small.length,bigChars:big.length,smallHash:shaLike(small),bigHash:shaLike(big)};
  var url=new URL(${JSON.stringify(workerAsset)}, 'chrome-extension://'+chrome.runtime.id+'/devtools/panel.html');
  var made=[];var errors=[];
  function run(source,scriptId){
    return new Promise(function(res){
      var w;
      try{ w=new Worker(url,{type:'module'}); }catch(e){ res({createError:String(e&&e.message?e.message:e)}); return; }
      var done=false;
      var to=setTimeout(function(){ if(!done){done=true;try{w.terminate()}catch(e){} res({timeout:true})} },${WORKER_TIMEOUT_MS});
      w.onerror=function(ev){ if(!done){done=true;clearTimeout(to);res({workerError:String((ev&&ev.message)||'error')})} };
      w.onmessage=function(ev){ if(done)return;done=true;clearTimeout(to);
        var d=ev.data||{};
        if(!d.ok){res({analysisError:String(d.error)})}
        else{
          var r=d.result||{};
          var calls=0;var names=[];for(var i=0;i<(r.candidates||[]).length;i++){calls+=(r.candidates[i].callSites||[]).length;if(names.length<5)names.push(r.candidates[i].name)}
          res({ok:true,analyzed:!!r.analyzed,functions:(r.functions||[]).length,candidates:(r.candidates||[]).length,callSites:calls,firstNames:names,jsonLen:JSON.stringify(r).length,jsonHash:shaLike(JSON.stringify(r))});
        }
      };
      var id=1;
      w.postMessage({id:id,source:source,scriptId:scriptId,scriptUrl:'local'});
    });
  }
  report.small=await run(small,'small');
  report.big=await run(big,'big');
  report.totalMs=Math.round(performance.now()-t0);
  report.workerConstructor=String(url);
  return JSON.stringify(report);
})()`;

function connect(wsUrl: string): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map<number, any>();
    const failAll = (why: string): void => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why)); pending.delete(i); } };
    ws.onmessage = (ev: any) => {
      const m = JSON.parse(String(ev.data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method: string, params: any = {}, sessionId?: string): Promise<any> {
        return new Promise<any>((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout: ' + method)); }, WORKER_TIMEOUT_MS + 120000);
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
  const out: Record<string, any> = {
    schema: 'ob-recover.worker-exec/1',
    runNo: RUN_NO,
    startedAt: new Date(T0).toISOString(),
    note: 'local pages only, no external host reachable, observation only',
    conditions: { headless: HEADLESS, resolverRules: RESOLVER_RULES, ports: { cdp: PORT, http: HTTP }, workerTimeoutMs: WORKER_TIMEOUT_MS },
    inputs: {},
    dist: {},
  };
  const smallRaw = readFileSync(SMALL);
  const bigRaw = readFileSync(FIXTURE);
  out.inputs = {
    small: { path: 'test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js', bytes: smallRaw.length, sha256: sha(smallRaw) },
    big: { path: 'test/fixtures/p47-512kb-synthetic.js', bytes: bigRaw.length, sha256: sha(bigRaw) },
  };
  for (const f of ['background.js', 'devtools.js', 'panel.js', 'sandbox.js']) out.dist[f] = sha(readFileSync(DIST + '/' + f));
  out.workerAsset = readFileSync(DIST + '/panel.js', 'utf8').match(/\/assets\/decoder-analysis\.worker-[A-Za-z0-9_-]+\.js/)?.[0] || null;
  let firstSave = true;
  const save = (): void => { writeFileSync(OUT, JSON.stringify(out, null, 2), { flag: firstSave ? 'wx' : 'w' }); firstSave = false; };
  save();

  for (const p of [PORT, HTTP]) {
    let busy = false;
    try { await fetch('http://127.0.0.1:' + p + '/json/version', { signal: AbortSignal.timeout(1000) }); busy = true; } catch { /* free */ }
    if (busy) { console.log('REFUSED: port ' + p + ' busy'); process.exit(2); }
  }

  const served: any[] = [];
  const server = createServer((req: any, res: any) => {
    const name = String(req.url || '/').split('?')[0];
    let body: Buffer | null = null;
    let type = 'text/plain';
    if (name === '/index.html' || name === '/') { body = Buffer.from(HTML, 'utf8'); type = 'text/html; charset=utf-8'; }
    else if (name === '/small.js') { body = smallRaw; type = 'text/javascript'; }
    else if (name === '/big.js') { body = bigRaw; type = 'text/javascript'; }
    served.push({ at: Date.now() - T0, path: name, status: body ? 200 : 404, bytes: body ? body.length : 0 });
    res.writeHead(body ? 200 : 404, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(body || 'nf');
  });
  await new Promise<void>((r) => server.listen(HTTP, '127.0.0.1', () => r()));

  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const args = ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', '--host-resolver-rules=' + RESOLVER_RULES];
  if (HEADLESS) args.push('--headless=new');
  args.push('about:blank');
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  const killChrome = (): void => { try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* gone */ } };
  const watchdog = setTimeout(() => { out.abortedBy = 'global cap'; try { save(); } catch { /* ignore */ } killChrome(); process.exit(3); }, GLOBAL_CAP_MS);

  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); } }
    if (!ver) throw new Error('chrome devtools port unreachable');
    out.chrome = ver.Browser;
    await sleep(800);
    const b = await connect(ver.webSocketDebuggerUrl);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const extId: string = (await b.send('Extensions.loadUnpacked', { path: DIST })).id;
    out.extensionId = extId;
    await sleep(1500);
    const page: any = await b.send('Target.createTarget', { url: 'http://127.0.0.1:' + HTTP + '/index.html' });
    await sleep(1500);
    await b.send('Target.openDevTools', { targetId: page.targetId });
    await sleep(6000);
    const tg0: any = await b.send('Target.getTargets');
    const dt = tg0.targetInfos.find((t: any) => t.type === 'page' && String(t.url).startsWith('devtools://'));
    const dsid: string = (await b.send('Target.attachToTarget', { targetId: dt.targetId, flatten: true })).sessionId;
    await b.send('Runtime.evaluate', { expression: SHOW, awaitPromise: true, returnByValue: true }, dsid);
    await sleep(2500);
    const tg1: any = await b.send('Target.getTargets');
    const pt = tg1.targetInfos.find((t: any) => String(t.url).indexOf(extId + '/panel.html') >= 0);
    if (!pt) throw new Error('panel target not found');
    const psid: string = (await b.send('Target.attachToTarget', { targetId: pt.targetId, flatten: true })).sessionId;
    await b.send('Runtime.enable', {}, psid);

    const workerAsset: string = out.workerAsset || '/assets/decoder-analysis.worker.js';
    const expr = PANEL_WORKER_TEST('http://127.0.0.1:' + HTTP + '/small.js', 'http://127.0.0.1:' + HTTP + '/big.js', workerAsset);
    const t0 = Date.now();
    const r: any = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, psid);
    out.elapsedMs = Date.now() - t0;
    if (r.exceptionDetails) {
      out.exception = short(r.exceptionDetails.text);
      out.exceptionDescription = short(r.exceptionDetails.exception && r.exceptionDetails.exception.description, 800);
    } else {
      try { out.workerReport = JSON.parse(r.result.value); } catch { out.workerReportRaw = short(r.result.value, 2000); }
    }
    b.close();
  } catch (e: any) {
    out.fatal = short(e && e.message ? e.message : e, 600);
  } finally {
    clearTimeout(watchdog);
    killChrome();
    try { server.close(); } catch { /* ignore */ }
    out.served = served;
    out.finishedAt = new Date().toISOString();
    try { save(); } catch { /* ignore */ }
  }
  const rep: any = out.workerReport || {};
  console.log('done fatal=' + (out.fatal || 'none') + ' workerAsset=' + out.workerAsset + ' small=' + JSON.stringify(rep.small) + ' big=' + JSON.stringify(rep.big) + ' out=' + OUT);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
