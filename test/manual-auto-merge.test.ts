import { describe, it, expect } from 'vitest';
import { computeCapturePlan, type CdpPosition } from '../src/core/capture-plan.js';
import { validateCaptures, type ValidationScript } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';
import { planManualCapture, buildManualCapture, MANUAL_SEQ_BASE } from '../src/core/manual-capture-convert.js';
import type { DecoderCapture } from '../src/extension/debugger/capture-engine.js';
import { drive } from './helpers/capture-driver.js';

// Phase 4.6：手动断点（Phase 4.5）产生的记录与自动捕获记录合并后，仍然完整经过 validateCaptures → dryRun → applyVerified。
// 重点：手动求值是在同一次暂停里重新执行调用，不是独立观测；它不能叠加观测次数去绕过单次观测的严格静态检查。

const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);
const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;

function locate(source: string, needle: string, nth = 0): { index: number; pos: CdpPosition } {
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = source.indexOf(needle, index + 1);
    if (index < 0) throw new Error('needle not found: ' + needle);
  }
  const before = source.slice(0, index).split(NL);
  return { index, pos: { lineNumber: before.length - 1, columnNumber: before[before.length - 1].length } };
}

function entryOf(source: string, fnName: string): CdpPosition {
  const plan = computeCapturePlan(source, source.indexOf('function ' + fnName));
  if (!plan.entry) throw new Error('no capture entry for ' + fnName + ': ' + String(plan.reason));
  return plan.entry;
}

function manual(script: ValidationScript, fnName: string, needle: string, nth: number, value: string, seq: number): DecoderCapture {
  const plan = planManualCapture(script, entryOf(script.source, fnName), fnName, locate(script.source, needle, nth).pos);
  if (!plan.ok) throw new Error(plan.code + ': ' + plan.message);
  const built = buildManualCapture(
    plan,
    { success: true, result: { type: 'string', value: plan.bindingFingerprint } },
    { success: true, result: { type: 'string', value } },
    { scriptUrl: script.url ?? '', seq: MANUAL_SEQ_BASE + seq, timestamp: 1 },
  );
  if (!built.ok) throw new Error(built.code + ': ' + built.message);
  return built.capture;
}

async function chain(captures: DecoderCapture[], script: ValidationScript) {
  const report = validateCaptures(captures, [script]);
  const dry = await dryRunReplacements(report, [script]);
  const applied = await applyVerifiedReplacements(dry, script);
  return { report, dry, applied };
}

function splice(source: string, index: number, length: number, text: string): string {
  return source.slice(0, index) + text + source.slice(index + length);
}

const MERGED = src(
  ARR, 'function dec(i) {', '  return _arr[i];', '}',
  'function run() {', '  dec(1);', '  dec(1);', '}',
  'function manualSite() {', '  return dec(1);', '}',
  'function neverSeen() {', '  return dec(1);', '}',
);

describe('手动记录与自动记录合并', () => {
  it('手动记录带 origin 标记，key 带 manual 前缀', async () => {
    const d = await drive(MERGED, { wrap: ['dec'] });
    const c = manual(d.script, 'dec', 'dec(1)', 2, 'beta', 1);
    expect(c.origin).toBe('manual');
    expect(c.key.startsWith('manual|')).toBe(true);
  });

  it('结果一致：观测次数只算自动观测（2 次），手动求值不加次数；调用位置并入；只替换已观测和已求值的位置', async () => {
    const d = await drive(MERGED, { wrap: ['dec'] });
    const baseline = validateCaptures(d.captures, [d.script]).groups[0];
    expect(baseline.status).toBe('verified');
    expect(baseline.observations).toBe(2);

    const m = manual(d.script, 'dec', 'dec(1)', 2, 'beta', 1);
    const { report, dry, applied } = await chain([...d.captures, m], d.script);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('verified');
    expect(report.groups[0].observations).toBe(2);
    expect(report.groups[0].callLocations).toHaveLength(3);
    expect(dry.candidates).toHaveLength(3);
    expect(dry.candidates.every((c) => c.textKeyConflicts.length === 1)).toBe(true);

    let expected = d.script.source;
    for (let n = 2; n >= 0; n--) {
      const at = locate(d.script.source, 'dec(1)', n);
      expected = splice(expected, at.index, 6, `"beta"`);
    }
    expect(applied.code).toBe(expected);
    const never = locate(d.script.source, 'dec(1)', 3);
    expect(applied.code.includes('return dec(1);')).toBe(true);
    expect(never.index).toBeGreaterThan(0);
  });

  it('手动值与历史观测冲突：同参不同值 → unstable，整组不进入候选，源码不变', async () => {
    const d = await drive(MERGED, { wrap: ['dec'] });
    const m = manual(d.script, 'dec', 'dec(1)', 2, 'WRONG', 1);
    const { report, dry, applied } = await chain([...d.captures, m], d.script);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('unstable');
    expect(report.groups[0].reasons.map((r) => r.code)).toContain('same-args-different-returns');
    expect(dry.candidates).toEqual([]);
    expect(applied.code).toBe(d.script.source);
  });
});

const PURE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'var p = dec(1);', 'var q = dec(1);', 'var r = dec(2);');
const PURE_SCRIPT: ValidationScript = { scriptId: 's1', source: PURE, url: 'http://test/pure.js', startLine: 0, startColumn: 0 };

describe('只有手动记录：纯解码函数', () => {
  it('只求值一个调用点：单次观测通过严格静态检查，只替换这一处，同文本的其他调用保持原样', async () => {
    const c = manual(PURE_SCRIPT, 'dec', 'dec(1)', 0, 'beta', 1);
    const { report, dry, applied } = await chain([c], PURE_SCRIPT);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('verified');
    expect(report.groups[0].evidence).toBe('single-observation');
    expect(report.groups[0].observations).toBe(1);
    expect(dry.candidates).toHaveLength(1);
    expect(applied.code).toBe(src(ARR, 'function dec(i) {', '  return _arr[i];', '}', `var p = "beta";`, 'var q = dec(1);', 'var r = dec(2);'));
  });

  it('同参数的两个调用点只做手动求值：手动求值不叠加观测，单次观测只能对应一个调用点 → 证据不足，不替换', async () => {
    const c1 = manual(PURE_SCRIPT, 'dec', 'dec(1)', 0, 'beta', 1);
    const c2 = manual(PURE_SCRIPT, 'dec', 'dec(1)', 1, 'beta', 2);
    const { report, dry, applied } = await chain([c1, c2], PURE_SCRIPT);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('insufficient');
    expect(report.groups[0].observations).toBe(1);
    expect(report.groups[0].reasons.map((r) => r.code)).toContain('single-obs:call-location');
    expect(dry.candidates).toEqual([]);
    expect(applied.code).toBe(PURE);
  });

  it('参数不同的两个调用点各求值一次：各自一组、各自通过严格检查，只替换这两处，未求值的同文本调用保持原样', async () => {
    const c1 = manual(PURE_SCRIPT, 'dec', 'dec(1)', 0, 'beta', 1);
    const c2 = manual(PURE_SCRIPT, 'dec', 'dec(2)', 0, 'gamma', 2);
    const { report, applied } = await chain([c1, c2], PURE_SCRIPT);
    expect(report.groups).toHaveLength(2);
    expect(report.groups.every((g) => g.status === 'verified' && g.evidence === 'single-observation' && g.observations === 1)).toBe(true);
    expect(applied.code).toBe(src(ARR, 'function dec(i) {', '  return _arr[i];', '}', `var p = "beta";`, 'var q = dec(1);', `var r = "gamma";`));
  });

  it('同一个调用点先后两次求值得到不同结果（求值之间状态变了）：同参不同值 → unstable，不替换', async () => {
    const c1 = manual(PURE_SCRIPT, 'dec', 'dec(1)', 0, 'beta', 1);
    const c2 = manual(PURE_SCRIPT, 'dec', 'dec(1)', 0, 'zzz', 2);
    expect(c1.key).not.toBe(c2.key);
    const { report, dry, applied } = await chain([c1, c2], PURE_SCRIPT);
    expect(report.groups[0].status).toBe('unstable');
    expect(dry.candidates).toEqual([]);
    expect(applied.code).toBe(PURE);
  });
});

const STATE = src(`var _arr = ['a', 'b'];`, 'var off = 0;', 'function dec(i) {', '  return _arr[i + off];', '}', 'off = 1;', 'var x = dec(0);', 'var y = dec(0);');
const STATE_SCRIPT: ValidationScript = { scriptId: 's1', source: STATE, url: 'http://test/state.js', startLine: 0, startColumn: 0 };

describe('只有手动记录：函数读取了函数外被改写的状态', () => {
  it('单个调用点：证据不足，不替换', async () => {
    const c = manual(STATE_SCRIPT, 'dec', 'dec(0)', 0, 'b', 1);
    const { report, dry, applied } = await chain([c], STATE_SCRIPT);
    expect(report.groups[0].status).toBe('insufficient');
    expect(report.groups[0].evidence).toBe('none');
    expect(dry.candidates).toEqual([]);
    expect(applied.code).toBe(STATE);
  });

  it('两个调用点各求值一次也不能叠加成多次观测去绕过严格检查：仍然证据不足，不替换', async () => {
    const c1 = manual(STATE_SCRIPT, 'dec', 'dec(0)', 0, 'b', 1);
    const c2 = manual(STATE_SCRIPT, 'dec', 'dec(0)', 1, 'b', 2);
    const { report, dry, applied } = await chain([c1, c2], STATE_SCRIPT);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('insufficient');
    expect(report.groups[0].observations).toBe(1);
    expect(dry.candidates).toEqual([]);
    expect(applied.code).toBe(STATE);
  });
});
