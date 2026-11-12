import { describe, it, expect } from 'vitest';
import { drive } from './helpers/capture-driver.js';
import { parseCode } from '../src/core/parser.js';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements, type DryRunResult, type ReplacementCandidate } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';

// Phase 4.6.1: dry-run 候选的内部一致性。
// 替换引擎生成字面量时只读 c.value，不读 c.replacement，也不核对两者是否一致。候选是普通对象，经 postMessage 传给沙箱后是结构化克隆，没有任何不可变保证。
// 脚本身份（scriptId 加 SHA-256）、callText、AST 节点范围替换引擎已经核对，能被悄悄改掉的只是 value、replacement 这类派生字段。
// 本文件先在未修复的代码上运行，留作复现证据：预期 A、B 失败（候选内部不一致却被应用），前提、C、D 通过。
// 局限：value 和 replacement 被同时改成一致的另一个值，这里检测不到，只能靠候选来源可信（面板每次点击现生成现用）；本文件不对此做断言。
// 注意：捕获部分使用驱动里的桩 CDP 传输层（没有真实暂停），验证的是 dry-run 与替换引擎，不是 Chrome 里的捕获。

const NL = String.fromCharCode(10);
const SRC = [
  `var _arr = ['alpha', 'beta', 'gamma'];`,
  'function dec(i) {',
  '  return _arr[i];',
  '}',
  'function f() {',
  '  return dec(1);',
  '}',
  'function run() {',
  '  f();',
  '  f();',
  '}',
].join(NL);
const EXPECTED = SRC.replace('return dec(1);', 'return ' + JSON.stringify('beta') + ';');

async function prepare(source: string) {
  const d = await drive(source, { wrap: ['dec'] });
  const report = validateCaptures(d.captures, [d.script]);
  const dry = await dryRunReplacements(report, [d.script]);
  return { script: d.script, dry };
}

function pick(dry: DryRunResult, callText: string): ReplacementCandidate {
  const c = dry.candidates.find((x) => x.callText === callText);
  if (!c) throw new Error('precondition failed: no candidate for ' + callText);
  return c;
}

describe('dry-run 候选的内部一致性', () => {
  it('前提：真实流程给出 dec(1) 的候选，value 与 replacement 一致，源码未改', async () => {
    const { script, dry } = await prepare(SRC);
    const c = pick(dry, 'dec(1)');
    expect(c.value).toBe('beta');
    expect(c.replacement).toBe(JSON.stringify('beta'));
    expect(script.source).toBe(SRC);
  });

  it('A value 被改、replacement 没改：拒绝（候选自相矛盾），源码不变', async () => {
    const { script, dry } = await prepare(SRC);
    const forged: ReplacementCandidate = { ...pick(dry, 'dec(1)'), value: 'evil' };
    const result = await applyVerifiedReplacements({ ...dry, candidates: [forged] }, script);
    expect(result.code).toBe(SRC);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0].code).toBe('replacement-value-mismatch');
    expect(result.stats).toEqual({ total: 1, applied: 0, rejected: 1, byReason: { 'replacement-value-mismatch': 1 } });
  });

  it('B replacement 被改、value 没改：同样拒绝，源码不变', async () => {
    const { script, dry } = await prepare(SRC);
    const forged: ReplacementCandidate = { ...pick(dry, 'dec(1)'), replacement: JSON.stringify('evil') };
    const result = await applyVerifiedReplacements({ ...dry, candidates: [forged] }, script);
    expect(result.code).toBe(SRC);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0].code).toBe('replacement-value-mismatch');
  });

  it('C 对照：未被改动的真实候选照常应用', async () => {
    const { script, dry } = await prepare(SRC);
    const result = await applyVerifiedReplacements(dry, script);
    expect(result.code).toBe(EXPECTED);
    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toEqual([]);
    expect(script.source).toBe(SRC);
  });

  it('D 对照：非 ASCII、引号、换行的字符串，以及数字、布尔、null 的真实候选都不会被一致性检查误拒', async () => {
    const values: unknown[] = ['caf\u00e9 \u4e2d\u6587 "q"' + NL + 'end', 20, true, null];
    const source = [
      'var _arr = ' + JSON.stringify(values) + ';',
      'function dec(i) {',
      '  return _arr[i];',
      '}',
      'function run() {',
      '  var a1 = dec(0); var a2 = dec(0);',
      '  var b1 = dec(1); var b2 = dec(1);',
      '  var c1 = dec(2); var c2 = dec(2);',
      '  var d1 = dec(3); var d2 = dec(3);',
      '}',
    ].join(NL);
    const { script, dry } = await prepare(source);
    expect(dry.candidates).toHaveLength(8);
    const result = await applyVerifiedReplacements(dry, script);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(8);
    expect(() => parseCode(result.code)).not.toThrow();
    expect(script.source).toBe(source);
  });
});
