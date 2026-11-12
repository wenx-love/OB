import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'D:/Projects/ob-recover';
const DIST = ROOT + '/dist';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const PORT = 9404;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/ext-profile4';
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
      send(method: string, params: any = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); const msg: any = { id: i, method, params }; if (params && params.__sessionId) { msg.sessionId = params.__sessionId; delete msg.params.__sessionId; } ws.send(JSON.stringify(msg)); }); },
      close() { ws.close(); },
    });
  });
}

async function swEval(send: (m: string, p?: any) => Promise<any>, expr: string, awaitPromise = true) {
  const r: any = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' :: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return r.result.value;
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });
  const out: any = {};
  let c: any = null;
  try {
    let ver: any = null;
    for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(BASE + '/json/version')).json(); } catch { await sleep(300); } }
    out.chrome = ver.Browser;
    await sleep(1000);
    const events: any[] = [];
    const b = await connect(ver.webSocketDebuggerUrl, (m) => events.push(m));
    await b.send('Target.setDiscoverTargets', { discover: true });
    const loadRes: any = await b.send('Extensions.loadUnpacked', { path: DIST });
    const extId = loadRes.id;
    out.extensionId = extId;
    await sleep(1500);

    // create a real tab to attach to
    const { targetId: pageTargetId } = await b.send('Target.createTarget', { url: 'about:blank' });
    out.pageTargetId = pageTargetId;
    await sleep(500);
    // find its tabId via chrome.tabs in the SW

    const tg = await b.send('Target.getTargets');
    const swTarget = tg.targetInfos.find((t: any) => t.type === 'service_worker' && String(t.url).includes(extId));
    out.swFound = !!swTarget;
    const swAttach = await b.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true });
    const sessionId = swAttach.sessionId;
    const swSend = (method: string, params: any = {}) => b.send(method, { ...params, __sessionId: sessionId });

    out.swReady = await swEval(swSend, 'typeof chrome.debugger.attach');
    // map page target to tabId
    const tabId = await swEval(swSend, `new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => { resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))); });
    })`);
    out.tabs = tabId;
    const blankTab = Array.isArray(tabId) ? tabId[tabId.length - 1] : null;
    out.blankTab = blankTab;

    if (blankTab) {
      const attachRes = await swEval(swSend, `new Promise((resolve) => {
        chrome.debugger.attach({ tabId: ${blankTab.id} }, '1.3', () => {
          resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message });
        });
      })`);
      out.attach = attachRes;
      if (attachRes.ok) {
        const enableRes = await swEval(swSend, `new Promise((resolve) => {
          chrome.debugger.sendCommand({ tabId: ${blankTab.id} }, 'Debugger.enable', {}, (r) => {
            resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message, result: r });
          });
        })`);
        out.debuggerEnable = enableRes;
        const instrRes = await swEval(swSend, `new Promise((resolve) => {
          chrome.debugger.sendCommand({ tabId: ${blankTab.id} }, 'Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptExecution' }, (r) => {
            resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message, result: r });
          });
        })`);
        out.instrumentationBreakpoint = instrRes;
        const detachRes = await swEval(swSend, `new Promise((resolve) => {
          chrome.debugger.detach({ tabId: ${blankTab.id} }, () => { resolve({ ok: !chrome.runtime.lastError, err: chrome.runtime.lastError && chrome.runtime.lastError.message }); });
        })`);
        out.detach = detachRes;
      }
    }
    b.close();
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + '/T /F', { stdio: 'ignore' }); } catch { /* ignore */ }
  }
  writeFileSync(ROOT + '/test/acceptance/phase3-1-probe4.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
