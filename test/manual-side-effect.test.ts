import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ManualCapture } from '../src/extension/debugger/manual-capture.js';
import type { CaptureTransport, DecoderCapture } from '../src/extension/debugger/capture-engine.js';
import { computeCapturePlan, type CdpPosition } from '../src/core/capture-plan.js';
import { validateCaptures, type ValidationScript } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';
import { planManualCapture, buildManualCapture, MANUAL_SEQ_BASE, type ManualEvalOutcome, type ManualPlan } from '../src/core/manual-capture-convert.js';
import { drive } from './helpers/capture-driver.js';

// Phase 4.6.1: 手动求值固定使用 throwOnSideEffect: true，没有降级路径。
// 第一部分在 Node 内置的真实 V8 里（node:inspector，真实 Debugger.paused 暂停帧）经由 ManualCapture 求值，拒绝与否以 V8 实际返回为准。
// 第二部分用桩传输层检查发给 CDP 的参数。第三部分检查被拒绝的求值不会产生 verified 替换候选。
// 注意：这里是 Node 的 V8，不是 Chrome 的 Blink。atob、DOM 等宿主函数在 Chrome 里是否被放行，只能在真实 Chrome 里验证。

const NL = String.fromCharCode(10);
const V8_MESSAGE = 'Possible side-effect in debug-evaluate';
const INSPECTOR_MODULE: string = 'node:inspector';
const VM_MODULE: string = 'node:vm';

type Json = Record<string, unknown>;
interface PausedMessage { params: Json }
interface InspectorSessionLike {
  connect(): void;
  disconnect(): void;
  post(method: string, params: Json, callback: (err: { message: string } | null, result: Json) => void): void;
  on(event: string, listener: (message: PausedMessage) => void): void;
  off(event: string, listener: (message: PausedMessage) => void): void;
}
interface Sent { method: string; params: Json }
type Outcome = Awaited<ReturnType<ManualCapture['evaluateOnFrame']>>;

let session!: InspectorSessionLike;
let runInThisContext!: (code: string) => unknown;

beforeAll(async () => {
  const inspectorModule: { Session: new () => InspectorSessionLike } = await import(/* @vite-ignore */ INSPECTOR_MODULE);
  const vmModule: { runInThisContext: (code: string) => unknown } = await import(/* @vite-ignore */ VM_MODULE);
  session = new inspectorModule.Session();
  session.connect();
  runInThisContext = vmModule.runInThisContext;
});

afterAll(() => {
  session.disconnect();
});

// 检查器的回复在同一线程里同步到达：暂停处理函数里发出的命令会在暂停期间真实执行
function inspectorTransport(sent: Sent[]): CaptureTransport {
  return async (method, params) => {
    const p: Json = params ?? {};
    sent.push({ method, params: p });
    const box: { done: boolean; err: { message: string } | null; res: Json } = { done: false, err: null, res: {} };
    session.post(method, p, (err, res) => {
      box.done = true;
      box.err = err;
      box.res = res;
    });
    if (!box.done) throw new Error('inspector reply was not synchronous');
    if (box.err) throw new Error(box.err.message);
    return box.res;
  };
}

const PLAN_LINES = [`var _planArr = ['a', 'b', 'c'];`, 'function decPlan(i) { return _planArr[i]; }', 'var viaPlan = decPlan(1);'];
const CACHE_LINES = [
  `var _carr = ['a', 'b', 'c'];`,
  'var _ccache = {};',
  'function decCache(i) { if (!_ccache[i]) { _ccache[i] = _carr[i]; } return _ccache[i]; }',
  'var viaCache = decCache(1);',
];
const SETUP = [
  `var _arr = ['a', 'b', 'c'];`,
  'var _cache = {};',
  'var counter = 0;',
  'function pureDec(i) { return _arr[i]; }',
  'function cacheDec(i) { if (!_cache[i]) { _cache[i] = _arr[i]; } return _cache[i]; }',
  'function counterDec(i) { counter++; return _arr[i]; }',
  'function selfMemo(i) { selfMemo.c = selfMemo.c || {}; selfMemo.c[i] = 1; return _arr[i]; }',
  PLAN_LINES[0],
  PLAN_LINES[1],
  CACHE_LINES[0],
  CACHE_LINES[1],
  CACHE_LINES[2],
].join(NL);
const HOST = '(function host(seed) { var local = seed; var cache = {}; debugger; return local; })(7)';
const STATE = 'JSON.stringify({ counter: counter, cache: Object.keys(_cache), arr: _arr.length, memo: typeof selfMemo.c, ccache: Object.keys(_ccache) })';

async function runInRealPause(expressions: string[]): Promise<{ outcomes: Outcome[]; hostReturned: unknown; before: unknown; after: unknown; sent: Sent[]; paused: number }> {
  runInThisContext(SETUP);
  const sent: Sent[] = [];
  const mc = new ManualCapture(inspectorTransport(sent));
  const pending: Promise<Outcome>[] = [];
  let paused = 0;
  const onPaused = (message: PausedMessage): void => {
    paused++;
    void mc.onManualPause(message.params);
    for (const e of expressions) pending.push(mc.evaluateOnFrame({ frameIndex: 0 }, e));
    session.post('Debugger.resume', {}, () => undefined);
  };
  const before = runInThisContext(STATE);
  session.post('Debugger.enable', {}, () => undefined);
  session.on('Debugger.paused', onPaused);
  let hostReturned: unknown;
  try {
    hostReturned = runInThisContext(HOST);
  } finally {
    session.off('Debugger.paused', onPaused);
    session.post('Debugger.disable', {}, () => undefined);
  }
  const outcomes = await Promise.all(pending);
  const after = runInThisContext(STATE);
  return { outcomes, hostReturned, before, after, sent, paused };
}

describe('真实 V8：throwOnSideEffect 的实际拦截行为（经由 ManualCapture 在真实暂停帧里求值）', () => {
  it('纯表达式、读局部变量、调用纯解码函数、对临时对象的修改：允许求值，全局状态不变', async () => {
    const r = await runInRealPause(['local + 1', 'pureDec(local % 3)', '(function () { var o = {}; o.a = 1; return o.a; })()']);
    expect(r.paused).toBe(1);
    expect(r.outcomes.every((o) => o.success)).toBe(true);
    expect(r.outcomes[0].result).toEqual({ type: 'number', value: 8 });
    expect(r.outcomes[1].result).toEqual({ type: 'string', value: 'b' });
    expect(r.outcomes[2].result).toEqual({ type: 'number', value: 1 });
    expect(r.hostReturned).toBe(7);
    expect(r.after).toBe(r.before);
  });

  it('修改全局变量的表达式被 V8 拒绝（sideEffectBlocked），全局状态不变', async () => {
    const r = await runInRealPause(['counter = 5', 'counter++']);
    expect(r.outcomes).toHaveLength(2);
    for (const o of r.outcomes) {
      expect(o.success).toBe(false);
      expect(o.sideEffectBlocked).toBe(true);
      expect(String(o.error)).toContain(V8_MESSAGE);
    }
    expect(r.after).toBe(r.before);
    expect(r.hostReturned).toBe(7);
  });

  it('修改对象属性的表达式被拒绝：全局对象、全局数组、帧内对象、帧内局部变量赋值', async () => {
    const r = await runInRealPause(['_cache.k = 1', '_arr.push(1)', 'cache.x = 1', 'local = 9']);
    expect(r.outcomes).toHaveLength(4);
    for (const o of r.outcomes) {
      expect(o.success).toBe(false);
      expect(o.sideEffectBlocked).toBe(true);
    }
    expect(r.after).toBe(r.before);
    expect(r.hostReturned).toBe(7);
  });

  it('有缓存写入、计数副作用、自身缓存的解码函数不会被自动执行：V8 拒绝，缓存和计数都没有被写入', async () => {
    const r = await runInRealPause(['cacheDec(1)', 'counterDec(1)', 'selfMemo(1)']);
    for (const o of r.outcomes) {
      expect(o.success).toBe(false);
      expect(o.sideEffectBlocked).toBe(true);
    }
    expect(JSON.parse(String(r.after))).toEqual({ counter: 0, cache: [], arr: 3, memo: 'undefined', ccache: [] });
    expect(r.after).toBe(r.before);
  });

  it('求值失败不影响页面：宿主函数照常返回，被拒绝之后同一次暂停里的纯求值仍然可用', async () => {
    const r = await runInRealPause(['counter = 5', 'cacheDec(1)', 'local + 1']);
    expect(r.outcomes.map((o) => o.success)).toEqual([false, false, true]);
    expect(r.outcomes[2].result).toEqual({ type: 'number', value: 8 });
    expect(r.hostReturned).toBe(7);
    expect(r.paused).toBe(1);
    expect(r.after).toBe(r.before);
  });

  it('每一次发给 V8 的求值都是 throwOnSideEffect: true；被拒绝的表达式只发送一次，没有降级重试', async () => {
    const exprs = ['counter = 5', 'cacheDec(1)', 'pureDec(1)', '_cache.k = 1'];
    const r = await runInRealPause(exprs);
    const evals = r.sent.filter((s) => s.method === 'Debugger.evaluateOnCallFrame');
    expect(evals).toHaveLength(exprs.length);
    expect(evals.map((s) => s.params.expression)).toEqual(exprs);
    expect(evals.every((s) => s.params.throwOnSideEffect === true)).toBe(true);
    expect(evals.every((s) => s.params.silent === true)).toBe(true);
  });
});

describe('桩传输层：发给 CDP 的参数与结果映射', () => {
  const pausedManual = (send: CaptureTransport): ManualCapture => {
    const mc = new ManualCapture(send);
    void mc.onManualPause({ callFrames: [{ callFrameId: 'f0', functionName: 'f', location: { scriptId: '1', lineNumber: 0, columnNumber: 0 }, scopeChain: [] }] });
    return mc;
  };
  const refusal = { exceptionDetails: { text: 'Uncaught', exception: { description: 'EvalError: ' + V8_MESSAGE } } };

  it('V8 拒绝：返回 sideEffectBlocked，只发送一次，throwOnSideEffect 为 true，不重试', async () => {
    const calls: Sent[] = [];
    const send: CaptureTransport = async (method, params) => {
      calls.push({ method, params: params ?? {} });
      return refusal;
    };
    const out = await pausedManual(send).evaluateOnFrame({ frameIndex: 0 }, 'counter++');
    expect(out.success).toBe(false);
    expect(out.sideEffectBlocked).toBe(true);
    expect(String(out.error)).toContain(V8_MESSAGE);
    expect(calls).toHaveLength(1);
    expect(calls[0].params.throwOnSideEffect).toBe(true);
  });

  it('其他异常（ReferenceError）不是副作用拒绝：不标 sideEffectBlocked，也不重试', async () => {
    const calls: Sent[] = [];
    const send: CaptureTransport = async (method, params) => {
      calls.push({ method, params: params ?? {} });
      return { exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: x is not defined' } } };
    };
    const out = await pausedManual(send).evaluateOnFrame({ frameIndex: 0 }, 'x');
    expect(out.success).toBe(false);
    expect(out.sideEffectBlocked).toBeUndefined();
    expect(String(out.error)).toContain('ReferenceError');
    expect(calls).toHaveLength(1);
  });

  it('传输层本身出错（CDP 协议错误）：失败但不标 sideEffectBlocked', async () => {
    const send: CaptureTransport = async () => {
      throw new Error('Cannot find context with specified id');
    };
    const out = await pausedManual(send).evaluateOnFrame({ frameIndex: 0 }, 'x');
    expect(out.success).toBe(false);
    expect(out.sideEffectBlocked).toBeUndefined();
    expect(String(out.error)).toContain('Cannot find context');
  });

  it('不管结果如何，所有求值请求的 throwOnSideEffect 都是 true，从不出现 false', async () => {
    const calls: Sent[] = [];
    const replies: unknown[] = [refusal, { result: { type: 'number', value: 1 } }, { exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: boom' } } }];
    let i = 0;
    const send: CaptureTransport = async (method, params) => {
      calls.push({ method, params: params ?? {} });
      return replies[i++ % replies.length];
    };
    const mc = pausedManual(send);
    for (let n = 0; n < 6; n++) await mc.evaluateOnFrame({ frameIndex: 0 }, '1 + ' + n);
    expect(calls).toHaveLength(6);
    expect(calls.every((c) => c.params.throwOnSideEffect === true)).toBe(true);
  });
});

function locate(source: string, needle: string, nth = 0): { index: number; pos: CdpPosition } {
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = source.indexOf(needle, index + 1);
    if (index < 0) throw new Error('needle not found: ' + needle);
  }
  const before = source.slice(0, index).split(NL);
  return { index, pos: { lineNumber: before.length - 1, columnNumber: before[before.length - 1].length } };
}

const splice = (source: string, index: number, length: number, text: string): string => source.slice(0, index) + text + source.slice(index + length);
const scriptOf = (source: string): ValidationScript => ({ scriptId: 's1', source, url: 'http://test/x.js', startLine: 0, startColumn: 0 });
const probeOk = (plan: ManualPlan): ManualEvalOutcome => ({ success: true, result: { type: 'string', value: plan.bindingFingerprint } });
const BLOCKED: ManualEvalOutcome = { success: false, sideEffectBlocked: true, error: 'EvalError: ' + V8_MESSAGE };
const META = { scriptUrl: 'http://test/x.js', seq: MANUAL_SEQ_BASE + 1, timestamp: 1 };

function planOf(source: string, fnName: string, needle: string, nth = 0): ManualPlan {
  const entryPlan = computeCapturePlan(source, source.indexOf('function ' + fnName));
  if (!entryPlan.entry) throw new Error('no capture entry: ' + String(entryPlan.reason));
  const plan = planManualCapture(scriptOf(source), entryPlan.entry, fnName, locate(source, needle, nth).pos);
  if (!plan.ok) throw new Error(plan.code + ': ' + plan.message);
  return plan;
}

function blockedOf(plan: ManualPlan, seq = META.seq): DecoderCapture {
  const built = buildManualCapture(plan, probeOk(plan), BLOCKED, { ...META, seq });
  if (built.ok) throw new Error('expected a side-effect-blocked rejection');
  if (built.code !== 'side-effect-blocked' || !built.blocked) throw new Error('unexpected rejection: ' + built.code);
  return built.blocked;
}

async function chain(captures: DecoderCapture[], script: ValidationScript) {
  const report = validateCaptures(captures, [script]);
  const dry = await dryRunReplacements(report, [script]);
  const applied = await applyVerifiedReplacements(dry, script);
  return { report, dry, applied };
}

const PURE_LINES = [`var _parr = ['alpha', 'beta', 'gamma'];`, 'function decP(i) {', '  return _parr[i];', '}', 'var p = decP(1);', 'var q = decP(1);', 'var r = decP(2);'];
const PURE = PURE_LINES.join(NL);

describe('被 V8 拒绝的求值不会产生 verified 替换候选', () => {
  it('只有被拒绝的手动求值：记为手动来源的失败记录，验证为证据不足，没有任何候选，源码不变', async () => {
    const blocked = blockedOf(planOf(PURE, 'decP', 'decP(1)', 0));
    expect(blocked.origin).toBe('manual');
    expect(blocked.captureStatus).toBe('capture-failed');
    expect(String(blocked.reason)).toContain('side-effect-blocked');
    const { report, dry, applied } = await chain([blocked], scriptOf(PURE));
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('insufficient');
    expect(report.groups[0].evidence).toBe('none');
    expect(report.groups[0].reasons.map((r) => r.code)).toContain('side-effect-blocked');
    expect(dry.candidates).toEqual([]);
    expect(dry.rejections[0].reasons[0].code).toBe('status-insufficient');
    expect(applied.code).toBe(PURE);
    expect(applied.applied).toEqual([]);
  });

  it('同一调用点重复被拒绝得到同一个 key，不累加', () => {
    const plan = planOf(PURE, 'decP', 'decP(1)', 0);
    expect(blockedOf(plan, MANUAL_SEQ_BASE + 1).key).toBe(blockedOf(plan, MANUAL_SEQ_BASE + 9).key);
  });

  it('绑定探针本身被拒绝：求值失败（probe-failed），不产生任何记录', () => {
    const plan = planOf(PURE, 'decP', 'decP(1)', 0);
    const built = buildManualCapture(plan, BLOCKED, { success: true, result: { type: 'string', value: 'beta' } }, META);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.code).toBe('probe-failed');
      expect(built.blocked).toBeUndefined();
    }
  });

  it('一个调用点被拒绝、另一个参数不同的调用点求值成功：各自成组，只替换成功的那个', async () => {
    const planOk = planOf(PURE, 'decP', 'decP(1)', 0);
    const okBuilt = buildManualCapture(planOk, probeOk(planOk), { success: true, result: { type: 'string', value: 'beta' } }, META);
    if (!okBuilt.ok) throw new Error(okBuilt.code + ': ' + okBuilt.message);
    const blocked = blockedOf(planOf(PURE, 'decP', 'decP(2)', 0));
    const { report, dry, applied } = await chain([okBuilt.capture, blocked], scriptOf(PURE));
    expect(report.groups).toHaveLength(2);
    const g1 = report.groups.find((g) => g.arguments[0].value === 1);
    const g2 = report.groups.find((g) => g.arguments[0].value === 2);
    expect(g1 && g1.status).toBe('verified');
    expect(g2 && g2.status).toBe('insufficient');
    expect(dry.candidates).toHaveLength(1);
    expect(applied.code).toBe([...PURE_LINES.slice(0, 4), 'var p = ' + JSON.stringify('beta') + ';', 'var q = decP(1);', 'var r = decP(2);'].join(NL));
  });

  const MERGED = [
    `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`,
    'function dec(i) {',
    '  return _arr[i];',
    '}',
    'function run() {',
    '  dec(1);',
    '  dec(1);',
    '}',
    'function manualSite() {',
    '  return dec(1);',
    '}',
  ].join(NL);

  it('已有自动观测的组里，另一个调用点的手动求值被拒绝：不拖累自动观测（仍然 verified），被拒绝的调用点不会被替换', async () => {
    const d = await drive(MERGED, { wrap: ['dec'] });
    const baseline = validateCaptures(d.captures, [d.script]).groups[0];
    expect(baseline.status).toBe('verified');
    expect(baseline.observations).toBe(2);
    const blocked = blockedOf(planOf(MERGED, 'dec', 'dec(1)', 2));
    const { report, dry, applied } = await chain([...d.captures, blocked], d.script);
    expect(report.groups).toHaveLength(1);
    const g = report.groups[0];
    expect(g.status).toBe('verified');
    expect(g.observations).toBe(2);
    expect(g.warnings.map((w) => w.code)).toContain('manual-evaluation-blocked');
    expect(g.callLocations).toHaveLength(2);
    expect(dry.candidates).toHaveLength(2);
    let expected = MERGED;
    for (const n of [1, 0]) expected = splice(expected, locate(MERGED, 'dec(1)', n).index, 6, JSON.stringify('beta'));
    expect(applied.code).toBe(expected);
    expect(applied.code.includes('return dec(1);')).toBe(true);
  });
});

describe('真实 V8 端到端：手动求值 → 验证 → dry-run → 替换', () => {
  it('纯解码函数：绑定探针和调用表达式都被 V8 放行，进入 verified，只替换这一处', async () => {
    const plan = planOf(PLAN_LINES.join(NL), 'decPlan', 'decPlan(1)', 0);
    const r = await runInRealPause([plan.bindingProbe, plan.expression]);
    expect(r.outcomes.map((o) => o.success)).toEqual([true, true]);
    const built = buildManualCapture(plan, r.outcomes[0], r.outcomes[1], META);
    if (!built.ok) throw new Error(built.code + ': ' + built.message);
    const { report, dry, applied } = await chain([built.capture], scriptOf(PLAN_LINES.join(NL)));
    expect(report.groups[0].status).toBe('verified');
    expect(dry.candidates).toHaveLength(1);
    expect(applied.code).toBe(PLAN_LINES[0] + NL + PLAN_LINES[1] + NL + 'var viaPlan = ' + JSON.stringify('b') + ';');
    expect(r.after).toBe(r.before);
  });

  it('带缓存写入的解码函数：调用表达式被 V8 拒绝，缓存没有被写入，记为证据不足，不进入候选，源码不变', async () => {
    const source = CACHE_LINES.join(NL);
    const plan = planOf(source, 'decCache', 'decCache(1)', 0);
    const r = await runInRealPause([plan.bindingProbe, plan.expression]);
    expect(r.outcomes[0].success).toBe(true);
    expect(r.outcomes[1].success).toBe(false);
    expect(r.outcomes[1].sideEffectBlocked).toBe(true);
    expect(JSON.parse(String(r.after)).ccache).toEqual([]);
    expect(r.after).toBe(r.before);
    expect(r.hostReturned).toBe(7);
    const built = buildManualCapture(plan, r.outcomes[0], r.outcomes[1], META);
    expect(built.ok).toBe(false);
    if (built.ok || !built.blocked) throw new Error('expected a blocked record');
    const { report, dry, applied } = await chain([built.blocked], scriptOf(source));
    expect(report.groups[0].status).toBe('insufficient');
    expect(dry.candidates).toEqual([]);
    expect(applied.code).toBe(source);
  });
});
