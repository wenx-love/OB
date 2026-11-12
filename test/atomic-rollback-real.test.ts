import { describe, it, expect } from 'vitest';
import { drive } from './helpers/capture-driver.js';
import { parseCode } from '../src/core/parser.js';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements, type DryRunResult } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';

// Phase 4.6.1: 真实触发的原子回滚，不使用 vi.mock。
// 脚本在 node:vm 里真实执行，由真实的 CaptureEngine 捕获，经真实的验证层和 dry-run，再由真实的替换引擎应用，替换后的整体解析用真实的 Babel。
// 触发方式：try { dec(0) = 1; } catch (e) {}。调用表达式作赋值目标时，原脚本能解析；运行时先执行 dec(0) 再抛 ReferenceError（被 catch 住），捕获照常成功。
// 替换成字面量后变成 一个字符串字面量 = 1，Babel 抛出真实的语法错误。dry-run 和替换引擎的前置检查都没有拒绝这个位置，所以它能走到替换后的整体解析。
// 上一版用 use strict 指令触发，被 Phase 4.6.1 新增的指令序言检查在更前面拦下，到不了整体解析，所以换了触发方式（没有放宽那条检查）。
// 这个测试同时记录一个事实：一个无法解析的候选会让同一脚本里其他有效候选一起回滚。安全，但粒度粗。
// 注意：桩的部分仍然是驱动里的 CDP 传输层（没有真实暂停），这里验证的是替换阶段的回滚，不是 Chrome 里的捕获。

const NL = String.fromCharCode(10);
const ALPHA = JSON.stringify('alpha');
const BETA = JSON.stringify('beta');
const GAMMA = JSON.stringify('gamma');

const BASE = [
  `var _arr = ['alpha', 'beta', 'gamma'];`,
  'function dec(i) {',
  '  return _arr[i];',
  '}',
  'function f() {',
  '  try {',
  '    dec(0) = 1;',
  '  } catch (e) {}',
  '  return dec(1);',
  '}',
  'function g() {',
  '  return dec(2);',
  '}',
  'function run() {',
  '  f();',
  '  f();',
  '  g();',
  '  g();',
  '}',
];

function build(over: Record<number, string>): string {
  return BASE.map((line, i) => (over[i] !== undefined ? over[i] : line)).join(NL);
}

const SRC = build({});
const CONTROL = build({ 8: '  return ' + BETA + ';', 11: '  return ' + GAMMA + ';' });
const ALL_REPLACED = build({ 6: '    ' + ALPHA + ' = 1;', 8: '  return ' + BETA + ';', 11: '  return ' + GAMMA + ';' });

async function prepare() {
  const d = await drive(SRC, { wrap: ['dec'] });
  const report = validateCaptures(d.captures, [d.script]);
  const dry = await dryRunReplacements(report, [d.script]);
  return { script: d.script, dry };
}

const posKey = (p: { lineNumber: number; columnNumber: number }): string => p.lineNumber + ':' + p.columnNumber;

describe('真实原子回滚：替换后的整体解析真实失败（不使用 mock）', () => {
  it('前提：真实流程产生 3 个候选，值各不相同，调用位置列表没有截断', async () => {
    const { script, dry } = await prepare();
    expect(script.source).toBe(SRC);
    expect(dry.candidates).toHaveLength(3);
    expect(dry.candidates.map((c) => c.value).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(dry.candidates.every((c) => c.callLocationsTruncated === false)).toBe(true);
  });

  it('触发条件是真实的 Babel 语法错误：全部替换后的源码解析失败；原脚本和对照源码都能解析', () => {
    expect(() => parseCode(SRC)).not.toThrow();
    expect(() => parseCode(CONTROL)).not.toThrow();
    expect(() => parseCode(ALL_REPLACED)).toThrow(/Invalid left-hand side/);
  });

  it('其中一个候选让整体校验失败：整体回滚，源码一字不动，没有部分替换，统计与结果一致，候选没有被修改', async () => {
    const { script, dry } = await prepare();
    const before = JSON.stringify(dry);
    const result = await applyVerifiedReplacements(dry, script);
    expect(result.code).toBe(SRC);
    expect(script.source).toBe(SRC);
    expect(result.code.includes(ALPHA)).toBe(false);
    expect(result.code.includes(BETA)).toBe(false);
    expect(result.code.includes(GAMMA)).toBe(false);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected.every((r) => r.reasons.length === 1 && r.reasons[0].code === 'parse-failed-after-replacement')).toBe(true);
    expect(new Set(result.rejected.map((r) => posKey(r.position)))).toEqual(new Set(dry.candidates.map((c) => posKey(c.position))));
    expect(result.stats).toEqual({ total: 3, applied: 0, rejected: 3, byReason: { 'parse-failed-after-replacement': 3 } });
    expect(result.stats.total).toBe(result.applied.length + result.rejected.length);
    expect(JSON.stringify(dry)).toBe(before);
  });

  it('对照：去掉会触发语法错误的那个候选，另外两个正常应用，结果等于预期源码', async () => {
    const { script, dry } = await prepare();
    const filtered: DryRunResult = { ...dry, candidates: dry.candidates.filter((c) => c.value !== 'alpha') };
    const ok = await applyVerifiedReplacements(filtered, script);
    expect(ok.code).toBe(CONTROL);
    expect(ok.applied).toHaveLength(2);
    expect(ok.rejected).toEqual([]);
    expect(ok.stats).toEqual({ total: 2, applied: 2, rejected: 0, byReason: {} });
    expect(script.source).toBe(SRC);
  });

  it('回滚之后同一个脚本对象仍然可以正常应用，没有留下被污染的状态', async () => {
    const { script, dry } = await prepare();
    const rolledBack = await applyVerifiedReplacements(dry, script);
    expect(rolledBack.code).toBe(SRC);
    const filtered: DryRunResult = { ...dry, candidates: dry.candidates.filter((c) => c.value !== 'alpha') };
    const ok = await applyVerifiedReplacements(filtered, script);
    expect(ok.code).toBe(CONTROL);
    expect(ok.stats.applied).toBe(2);
  });

  it('先有候选被提前拒绝（哈希不匹配），剩下的候选再整体回滚：两类拒绝都被统计，总数不丢', async () => {
    const { script, dry } = await prepare();
    const beta = dry.candidates.find((c) => c.value === 'beta');
    if (!beta) throw new Error('precondition failed: no beta candidate');
    const stale: DryRunResult = { ...dry, candidates: dry.candidates.map((c) => (c === beta ? { ...c, scriptHash: '0'.repeat(64) } : c)) };
    const result = await applyVerifiedReplacements(stale, script);
    expect(result.code).toBe(SRC);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(3);
    expect(result.stats).toEqual({ total: 3, applied: 0, rejected: 3, byReason: { 'script-version-mismatch': 1, 'parse-failed-after-replacement': 2 } });
  });
});
