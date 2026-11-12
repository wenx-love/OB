import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

// Phase 4.6.1 probe: observation only, no verdicts. Real Chrome (Blink plus V8), headless=new, page-level CDP.
// Question: which expressions does throwOnSideEffect: true reject in Chrome? The Phase 4.5 acceptance page decoder calls atob and every evaluation of it was rejected.
// Part A uses Runtime.evaluate (global scope). Part B uses Debugger.evaluateOnCallFrame on a real paused frame, the same CDP method the product uses.
// Nothing here is a pass criterion: it records what V8 returned. The product never falls back to throwOnSideEffect: false.
const ROOT = 'D:/Projects/ob-recover';
const PORT = 9479;
const PROFILE = 'C:/Users/Administrator/TEMP/opencode/p461-blink-probe-profile';
const OUT = ROOT + '/test/acceptance/p461-blink-probe.json';
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:' + PORT;
const CMD_TIMEOUT = 10000;
const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    const failAll = (why) => { for (const [i, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why + ': ' + p.method)); pending.delete(i); } };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); }
      } else if (m.method) {
        for (const l of listeners) l(m);
      }
    };
    ws.onerror = () => { reject(new Error('ws error')); failAll('ws error'); };
    ws.onclose = () => failAll('ws closed');
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const i = ++id;
          const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP timeout after ' + CMD_TIMEOUT + 'ms: ' + method)); }, CMD_TIMEOUT);
          pending.set(i, { resolve: res, reject: rej, timer, method });
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      },
      on(l) { listeners.push(l); },
      close() { ws.close(); },
    });
  });
}

function shape(r) {
  if (!r) return { ok: false, description: 'no result' };
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception && r.exceptionDetails.exception.description;
    return { ok: false, description: String(d || r.exceptionDetails.text || '').split(NL)[0] };
  }
  return { ok: true, type: r.result && r.result.type, value: r.result && r.result.value };
}

const SETUP = [
  `var _arr = ['Zm9v', 'YmFy', 'Y29va2ll'];`,
  `var counter = 0;`,
  `function pureDec(i) { return _arr[i]; }`,
  `function atobDec(i) { return atob(_arr[i]); }`,
  `function fromCharDec(i) { return String.fromCharCode(102 + i); }`,
  `function uriDec(i) { return decodeURIComponent('%66' + i); }`,
  `function counterDec(i) { counter++; return _arr[i]; }`,
].join(NL);
const STATE = `JSON.stringify({ counter: counter })`;

const CASES = [
  ['pure decoder (array lookup only)', `pureDec(0)`],
  ['atob called directly', `atob('Zm9v')`],
  ['decoder that calls atob (shape of the Phase 4.5 test page)', `atobDec(0)`],
  ['btoa called directly', `btoa('foo')`],
  ['String.fromCharCode directly', `String.fromCharCode(102)`],
  ['decoder using String.fromCharCode', `fromCharDec(0)`],
  ['decodeURIComponent directly', `decodeURIComponent('%66')`],
  ['decoder using decodeURIComponent', `uriDec(0)`],
  ['parseInt', `parseInt('10', 16)`],
  ['Math.floor', `Math.floor(1.5)`],
  ['string method charCodeAt', `'abc'.charCodeAt(1)`],
  ['control: decoder that increments a global', `counterDec(1)`],
  ['control: assign a global', `counter = 5`],
];

const FRAME_CASES = [
  ['read a frame local', `local`],
  ['arithmetic on a frame local', `local + 1`],
  ['pure decoder with a local', `pureDec(local % 3)`],
  ['decoder that calls atob', `atobDec(0)`],
  ['atob called directly', `atob('Zm9v')`],
  ['decoder using String.fromCharCode', `fromCharDec(0)`],
  ['control: assign a frame local', `local = 9`],
];

async function partA(c, out) {
  const snap = async () => shape(await c.send('Runtime.evaluate', { expression: STATE, returnByValue: true, silent: true })).value;
  await c.send('Runtime.evaluate', { expression: SETUP, silent: true });
  out.stateBefore = await snap();
  out.partA = [];
  for (const [label, expression] of CASES) {
    out.partA.push({ label, expression, ...shape(await c.send('Runtime.evaluate', { expression, throwOnSideEffect: true, silent: true, returnByValue: true })) });
  }
  out.stateAfterChecked = await snap();
  out.stateUnchanged = out.stateBefore === out.stateAfterChecked;
  out.controlAtobWithoutCheck = shape(await c.send('Runtime.evaluate', { expression: `atob('Zm9v')`, throwOnSideEffect: false, silent: true, returnByValue: true }));
}

async function partB(c, out) {
  out.partB = { frame: [] };
  const paused = new Promise((resolve) => { c.on((m) => { if (m.method === 'Debugger.paused') resolve(m.params); }); });
  await c.send('Debugger.enable');
  const host = c.send('Runtime.evaluate', { expression: `(function host(seed) { var local = seed; debugger; return local; })(7)`, returnByValue: true, silent: true }).then((r) => shape(r), (e) => ({ error: String(e.message) }));
  const p = await Promise.race([paused, sleep(8000).then(() => null)]);
  if (!p) { out.partB.noPause = true; return; }
  const id = p.callFrames[0].callFrameId;
  out.partB.pausedReason = p.reason;
  for (const [label, expression] of FRAME_CASES) {
    out.partB.frame.push({ label, expression, ...shape(await c.send('Debugger.evaluateOnCallFrame', { callFrameId: id, expression, throwOnSideEffect: true, silent: true, returnByValue: true })) });
  }
  await c.send('Debugger.resume');
  out.partB.hostReturned = await host;
  out.partB.stateAfter = await (async () => shape(await c.send('Runtime.evaluate', { expression: STATE, returnByValue: true, silent: true })).value)();
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--headless=new', 'about:blank'], { stdio: 'ignore' });
  const kill = () => { try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* already gone */ } };
  const watchdog = setTimeout(() => { kill(); console.log('probe watchdog fired'); process.exit(2); }, 90000);
  const out = { note: 'real Chrome headless=new, page-level CDP, observation only; throwOnSideEffect: true on every checked evaluation', cases: 'see partA and partB' };
  let c = null;
  try {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) {
      try { ver = await (await fetch(BASE + '/json/version', { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(300); }
    }
    if (!ver) throw new Error('chrome did not expose the debugging port');
    out.chrome = ver.Browser;
    let page = null;
    for (let i = 0; i < 40 && !page; i++) {
      try {
        const list = await (await fetch(BASE + '/json/list', { signal: AbortSignal.timeout(2000) })).json();
        page = list.find((t) => t.type === 'page');
      } catch { /* retry */ }
      if (!page) await sleep(250);
    }
    if (!page) throw new Error('no page target found');
    c = await connect(page.webSocketDebuggerUrl);
    await partA(c, out);
    await partB(c, out);
  } catch (e) {
    out.fatal = String(e && e.message ? e.message : e);
  } finally {
    if (c) { try { c.close(); } catch { /* ignore */ } }
    kill();
    clearTimeout(watchdog);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
