import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

// L1 diagnostic: can a plain headless Chrome 155 load the target page at all, with no extension involved?
// Read only: one navigation, then reads document.title and location.href. It answers whether headless itself is the blocker.
const CHROME = 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/l1-headless-probe2';
const PORT = 9231;
const URL_ = 'https://hangzhou.qccqcc.com/list.html?keyword=%E5%86%B2%E9%94%8B%E8%A1%A3';
const OUT = 'D:/Projects/ob-recover/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/headless-probe.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const out = { probe: 'plain headless Chrome 155, no extension, one navigation', url: URL_ };
try {
  let ver = null;
  for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); } catch { await sleep(300); } }
  if (!ver) throw new Error('devtools port not reachable');
  out.chrome = ver.Browser;
  const created = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(URL_), { method: 'PUT' })).json();
  await sleep(6000);
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(String(ev.data)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws error')); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result ? r.result.value : null; };
  out.state = await ev('JSON.stringify({title:document.title,href:location.href,ready:document.readyState,scripts:document.scripts.length})');
  out.scriptSrcs = await ev('JSON.stringify([].map.call(document.scripts,function(s){return s.src||"(inline)"}).slice(0,12))');
  ws.close();
} catch (e) {
  out.error = String(e && e.message ? e.message : e);
} finally {
  try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* gone */ }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
}
console.log(JSON.stringify(out, null, 2));
