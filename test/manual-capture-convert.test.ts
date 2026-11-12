import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { computeCapturePlan, type CdpPosition } from '../src/core/capture-plan.js';
import { validateCaptures, type ValidationScript } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';
import { planManualCapture, buildManualCapture, fingerprintOf, type ManualPlan, type ManualEvalOutcome } from '../src/core/manual-capture-convert.js';

const NL = String.fromCharCode(10);

const DECODER = [
  `function _0xdec(i) {`,
  `  var a = ['x', 'y', 'z'];`,
  `  return a[i];`,
  `}`,
].join(NL);

const SRC = [DECODER, `var p = _0xdec(1);`, `var q = _0xdec(1);`, `console.log(p, q);`].join(NL);

function mk(source: string): ValidationScript {
  return { scriptId: '7', source, url: 'http://test/manual.js' };
}

function posOf(src: string, needle: string, nth = 0): CdpPosition {
  let idx = -1;
  for (let i = 0; i <= nth; i++) {
    idx = src.indexOf(needle, idx + 1);
    if (idx < 0) throw new Error('needle not found: ' + needle);
  }
  const lines = src.slice(0, idx).split(NL);
  return { lineNumber: lines.length - 1, columnNumber: lines[lines.length - 1].length };
}

function entryOf(src: string): CdpPosition {
  const plan = computeCapturePlan(src, src.indexOf('function _0xdec'));
  if (!plan.entry) throw new Error('no entry: ' + plan.reason);
  return plan.entry;
}

/** 在真实 V8 里对源码求值（node:vm），用来检查探针表达式与 Node 侧指纹是否一致 */
function evalIn(src: string, expr: string): string {
  return vm.runInNewContext(src + NL + ';' + expr, { console: { log() {} } }) as string;
}

function okPlan(src: string, call: CdpPosition): ManualPlan {
  const r = planManualCapture(mk(src), entryOf(src), '_0xdec', call);
  if (!r.ok) throw new Error(r.code + ': ' + r.message);
  return r;
}

function codeOf(src: string, call: CdpPosition, name = '_0xdec'): string {
  const r = planManualCapture(mk(src), entryOf(src), name, call);
  return r.ok ? 'ok' : r.code;
}

const probeOk = (p: ManualPlan): ManualEvalOutcome => ({ success: true, result: { type: 'string', value: p.bindingFingerprint } });
const META = { scriptUrl: 'http://test/manual.js', seq: 1000000001, timestamp: 1 };

describe('manual-capture-convert：手动求值转验证流程', () => {
  it('直接字面量调用得到计划：表达式取自源码原文，位置与参数正确', () => {
    const call = posOf(SRC, '_0xdec(1)', 0);
    const plan = okPlan(SRC, call);
    expect(plan.expression).toBe('_0xdec(1)');
    expect(plan.args).toEqual([{ type: 'number', value: 1 }]);
    expect(plan.callLocation).toEqual(call);
    expect(plan.functionLocation).toEqual(entryOf(SRC));
    expect(plan.bindingFingerprint).toBe(fingerprintOf(DECODER));
  });

  it('位置不是调用起点时拒绝', () => {
    expect(codeOf(SRC, posOf(SRC, 'var p'))).toBe('call-not-found');
  });

  it('参数不是字面量时拒绝', () => {
    const src = [DECODER, `var n = 1;`, `var r = _0xdec(n);`].join(NL);
    expect(codeOf(src, posOf(src, '_0xdec(n)'))).toBe('non-literal-argument');
  });

  it('成员调用不是对解码函数的直接调用，拒绝', () => {
    const src = [DECODER, `var o = {};`, `var r = o._0xdec(1);`].join(NL);
    expect(codeOf(src, posOf(src, '_0xdec(1)'))).toBe('not-direct-call');
  });

  it('同名局部函数遮蔽了解码函数时拒绝', () => {
    const src = [DECODER, `function outer() {`, `  function _0xdec(i) { return 'evil'; }`, `  return _0xdec(1);`, `}`].join(NL);
    expect(codeOf(src, posOf(src, '_0xdec(1)'))).toBe('binding-mismatch');
  });

  it('函数名与入口位置的函数对不上时拒绝', () => {
    expect(codeOf(SRC, posOf(SRC, '_0xdec(1)', 0), '_0xother')).toBe('function-name-mismatch');
  });

  it('内联脚本（有起始偏移）一律拒绝', () => {
    const r = planManualCapture({ ...mk(SRC), startLine: 3 }, entryOf(SRC), '_0xdec', posOf(SRC, '_0xdec(1)', 0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('script-offset');
  });

  it('组装记录：字段齐全，key 带 manual 前缀，调用位置只有一个', () => {
    const plan = okPlan(SRC, posOf(SRC, '_0xdec(1)', 0));
    const built = buildManualCapture(plan, probeOk(plan), { success: true, result: { type: 'string', value: 'y' } }, META);
    if (!built.ok) throw new Error(built.message);
    const c = built.capture;
    expect(c.key.startsWith('manual|7|')).toBe(true);
    expect(c.captureStatus).toBe('success');
    expect(c.count).toBe(1);
    expect(c.callLocations).toEqual([plan.callLocation]);
    expect(c.returnValue).toEqual({ type: 'string', value: 'y' });
    expect(c.arguments).toEqual(plan.args);
  });

  it('同一调用点同一结果重复求值得到同一个 key，不累加观测', () => {
    const plan = okPlan(SRC, posOf(SRC, '_0xdec(1)', 0));
    const ev: ManualEvalOutcome = { success: true, result: { type: 'string', value: 'y' } };
    const a = buildManualCapture(plan, probeOk(plan), ev, META);
    const b = buildManualCapture(plan, probeOk(plan), ev, { ...META, seq: META.seq + 5 });
    if (!a.ok || !b.ok) throw new Error('build failed');
    expect(a.capture.key).toBe(b.capture.key);
  });

  it('探针指纹对不上时拒绝（运行时函数被重新赋值）', () => {
    const plan = okPlan(SRC, posOf(SRC, '_0xdec(1)', 0));
    const probe = evalIn(SRC + NL + '_0xdec = function () { return 1; };', plan.bindingProbe);
    const built = buildManualCapture(plan, { success: true, result: { type: 'string', value: probe } }, { success: true, result: { type: 'string', value: 'y' } }, META);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe('probe-mismatch');
  });

  it('探针求值失败时拒绝', () => {
    const plan = okPlan(SRC, posOf(SRC, '_0xdec(1)', 0));
    const built = buildManualCapture(plan, { success: false, error: 'ReferenceError' }, { success: true, result: { type: 'string', value: 'y' } }, META);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe('probe-failed');
  });

  it('返回值缺失、截断、对象、NaN 一律拒绝', () => {
    const plan = okPlan(SRC, posOf(SRC, '_0xdec(1)', 0));
    const run = (ev: ManualEvalOutcome) => {
      const r = buildManualCapture(plan, probeOk(plan), ev, META);
      return r.ok ? 'ok' : r.code;
    };
    expect(run({ success: false, error: 'boom' })).toBe('return-missing');
    expect(run({ success: true, result: { type: 'string', value: 'y', truncated: true } })).toBe('return-truncated');
    expect(run({ success: true, result: { type: 'object', subtype: 'array', description: 'Array(2)' } })).toBe('return-not-literal');
    expect(run({ success: true, result: { type: 'number', unserializable: 'NaN' } })).toBe('return-not-literal');
  });

  it('Node 侧指纹与页面侧探针表达式在真实 V8 里结果一致', () => {
    const plan = okPlan(SRC, posOf(SRC, '_0xdec(1)', 0));
    expect(evalIn(SRC, plan.bindingProbe)).toBe(plan.bindingFingerprint);
    expect(evalIn(SRC, plan.expression)).toBe('y');
  });

  it('端到端：只替换被手动求值的那个调用点，同文本的另一个调用保持不变', async () => {
    const script = mk(SRC);
    const callA = posOf(SRC, '_0xdec(1)', 0);
    const plan = okPlan(SRC, callA);
    const probeValue = evalIn(SRC, plan.bindingProbe);
    const value = evalIn(SRC, plan.expression);
    const built = buildManualCapture(plan, { success: true, result: { type: 'string', value: probeValue } }, { success: true, result: { type: 'string', value } }, META);
    if (!built.ok) throw new Error(built.message);

    const report = validateCaptures([built.capture], [script]);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('verified');

    const dry = await dryRunReplacements(report, [script]);
    expect(dry.candidates).toHaveLength(1);
    expect(dry.candidates[0].position).toEqual(callA);

    const applied = await applyVerifiedReplacements(dry, script);
    expect(applied.applied).toHaveLength(1);
    const lines = applied.code.split(NL);
    expect(lines[4]).toMatch(/^var p = .y.;$/);
    expect(lines[5]).toBe('var q = _0xdec(1);');
  });
});
