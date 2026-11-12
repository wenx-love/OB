import inspector from 'node:inspector';
import vm from 'node:vm';
import { writeFileSync } from 'node:fs';

// Phase 4.6.1 probe: observation only, no verdicts. Node's embedded V8 decides what throwOnSideEffect blocks; Chrome/Blink-only behaviour (atob, DOM) is NOT covered here.
const TMP = 'C:/Users/Administrator/TEMP/opencode/';
const session = new inspector.Session();
session.connect();

function post(method, params) {
  let done = false;
  let error = null;
  let result = null;
  session.post(method, params || {}, (err, res) => { done = true; error = err; result = res; });
  if (!done) return { notSynchronous: true };
  if (error) return { protocolError: String(error.message || error) };
  return result;
}

function shape(r) {
  if (!r || r.notSynchronous || r.protocolError) return { raw: r };
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception && r.exceptionDetails.exception.description;
    return { ok: false, text: r.exceptionDetails.text, description: String(d || '').split(String.fromCharCode(10))[0] };
  }
  return { ok: true, type: r.result.type, value: r.result.value };
}

const SETUP = [
  `var _arr = ['a', 'b', 'c'];`,
  `var _cache = {};`,
  `var counter = 0;`,
  `function pureDec(i) { return _arr[i]; }`,
  `function cacheDec(i) { if (!_cache[i]) { _cache[i] = _arr[i]; } return _cache[i]; }`,
  `function counterDec(i) { counter++; return _arr[i]; }`,
  `function mutateArr(i) { _arr.push('z'); return _arr[i]; }`,
  `function selfMemo(i) { selfMemo.c = selfMemo.c || {}; selfMemo.c[i] = 1; return _arr[i]; }`,
  `function viaB64(i) { return atob('Zm9v') + i; }`,
  `function usesDate(i) { return Date.now() > 0 ? _arr[i] : ''; }`,
  `function usesRandom(i) { return Math.random() >= 0 ? _arr[i] : ''; }`,
].join(String.fromCharCode(10));
vm.runInThisContext(SETUP);
const snap = () => vm.runInThisContext(`JSON.stringify({ counter: counter, cacheKeys: Object.keys(_cache), arrLen: _arr.length, memo: typeof selfMemo.c })`);

const EXPRS = [
  ['pure decoder call', `pureDec(1)`],
  ['pure arithmetic on a global', `_arr[1] + String(2)`],
  ['binding probe (as sent by planManualCapture)', `(function(f){var s=Function.prototype.toString.call(f);return JSON.stringify([s.length,s.slice(0,120),s.slice(-120)])})(pureDec)`],
  ['assign a global variable', `counter = 5`],
  ['increment a global variable', `counter++`],
  ['mutate a global array', `_arr.push('x')`],
  ['write a property on a global object', `_cache.k = 1`],
  ['mutate a fresh temporary object', `(function(){ var o = {}; o.a = 1; return o.a; })()`],
  ['decoder that increments a global', `counterDec(1)`],
  ['decoder with a cache write', `cacheDec(1)`],
  ['decoder that mutates its array', `mutateArr(1)`],
  ['decoder with self memoization', `selfMemo(1)`],
  ['decoder using Date.now', `usesDate(1)`],
  ['decoder using Math.random', `usesRandom(1)`],
  ['decoder using atob (Node implementation, not Blink)', `viaB64(1)`],
];

function runA() {
  const out = { note: 'node:inspector probe, Runtime.evaluate with throwOnSideEffect; observation only', node: process.version, before: snap(), blocked: [] };
  for (const [label, expression] of EXPRS) {
    out.blocked.push({ label, expression, ...shape(post('Runtime.evaluate', { expression, throwOnSideEffect: true, silent: true, returnByValue: true })) });
  }
  out.afterBlockedRun = snap();
  out.stateUnchanged = out.before === out.afterBlockedRun;
  out.control = [];
  for (const label of ['decoder that increments a global', 'decoder with a cache write', 'mutate a global array']) {
    const expression = EXPRS.find((x) => x[0] === label)[1];
    out.control.push({ label, expression, ...shape(post('Runtime.evaluate', { expression, throwOnSideEffect: false, silent: true, returnByValue: true })) });
  }
  out.afterControl = snap();
  return out;
}

function runB() {
  const out = { note: 'node:inspector probe, Debugger.evaluateOnCallFrame with throwOnSideEffect on a real paused frame', node: process.version, before: snap(), frame: [] };
  const events = [];
  post('Debugger.enable');
  session.on('Debugger.paused', (m) => {
    const id = m.params.callFrames[0].callFrameId;
    events.push({ reason: m.params.reason, frames: m.params.callFrames.length, top: m.params.callFrames[0].functionName });
    const cases = [
      ['read a local', `local`],
      ['arithmetic on locals', `local + 1`],
      ['call the pure decoder with a local', `pureDec(local % 3)`],
      ['assign a local variable of the frame', `local = 9`],
      ['write a property on an object created by the frame', `cache.x = 1`],
      ['decoder with a cache write', `cacheDec(1)`],
      ['decoder that increments a global', `counterDec(1)`],
    ];
    for (const [label, expression] of cases) {
      out.frame.push({ label, expression, ...shape(post('Debugger.evaluateOnCallFrame', { callFrameId: id, expression, throwOnSideEffect: true, silent: true, returnByValue: true })) });
    }
    post('Debugger.resume');
  });
  const hostResult = vm.runInThisContext(`(function host(seed) { var local = seed; var cache = {}; debugger; return local; })(7)`);
  out.hostReturned = hostResult;
  out.pauseEvents = events;
  out.after = snap();
  out.stateUnchanged = out.before === out.after;
  return out;
}

const part = process.env.PART_B ? 'B' : 'A';
let out;
try {
  out = part === 'B' ? runB() : runA();
} catch (e) {
  out = { fatal: String(e && e.message ? e.message : e) };
}
writeFileSync(TMP + 'p461-v8-probe-' + part + '.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);
