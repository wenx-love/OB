import { describe, it, expect } from 'vitest';
import { drive } from './helpers/capture-driver.js';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements, type ReplacementCandidate } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';

// Phase 4.6.1: 父节点检查（replacementParentProblem）由 dry-run 与替换引擎共用。
// 替换引擎修复前没有任何父节点检查，也不应该信任候选自带的 parentType。这里覆盖两个分支：new 的 callee、模板标签。
// dry-run 部分走真实流程（node:vm 真实执行 + 真实 CaptureEngine，桩 CDP 传输层）；替换引擎部分用手工构造的候选，不依赖 dry-run 是否已经过滤，
// 并且把候选的 parentType 伪造成 ReturnStatement，验证替换引擎以 AST 里实际的父节点为准。

const NL = String.fromCharCode(10);
const SRC = [
  `var _arr = ['alpha', 'beta', 'gamma'];`,
  'function dec(i) {',
  '  return _arr[i];',
  '}',
  'function a() {',
  '  try { new (dec(0))(); } catch (e) {}',
  '}',
  'function b() {',
  '  try { dec(1)`x`; } catch (e) {}',
  '}',
  'function c() {',
  '  return dec(2);',
  '}',
  'function run() {',
  '  a();',
  '  a();',
  '  b();',
  '  b();',
  '  c();',
  '  c();',
  '}',
].join(NL);

function locate(needle: string): { index: number; lineNumber: number; columnNumber: number } {
  const index = SRC.indexOf(needle);
  if (index < 0) throw new Error('needle not found: ' + needle);
  const before = SRC.slice(0, index).split(NL);
  return { index, lineNumber: before.length - 1, columnNumber: before[before.length - 1].length };
}

async function prepare() {
  const d = await drive(SRC, { wrap: ['dec'] });
  const report = validateCaptures(d.captures, [d.script]);
  const dry = await dryRunReplacements(report, [d.script]);
  return { script: d.script, dry };
}

function forge(base: ReplacementCandidate, needle: string, value: string): ReplacementCandidate {
  const pos = locate(needle);
  return {
    ...base,
    position: { lineNumber: pos.lineNumber, columnNumber: pos.columnNumber },
    start: pos.index,
    end: pos.index + needle.length,
    callText: needle,
    value,
    replacement: JSON.stringify(value),
    parentType: 'ReturnStatement',
  };
}

describe('替换位置的父节点检查：dry-run 与替换引擎共用同一条规则', () => {
  it('dry-run：new 的 callee 和模板标签位置被拒绝（unexpected-parent），只有 return dec(2) 生成候选', async () => {
    const { dry } = await prepare();
    expect(dry.candidates.map((c) => c.callText)).toEqual(['dec(2)']);
    expect(dry.rejections.map((r) => r.reasons[0].code)).toEqual(['unexpected-parent', 'unexpected-parent']);
    const rejectedAt = dry.rejections.map((r) => (r.position ? r.position.lineNumber + ':' + r.position.columnNumber : 'group'));
    const a = locate('dec(0)');
    const b = locate('dec(1)');
    expect(new Set(rejectedAt)).toEqual(new Set([a.lineNumber + ':' + a.columnNumber, b.lineNumber + ':' + b.columnNumber]));
  });

  it('替换引擎：手工构造的 new callee 候选被拒绝（候选自称父节点是 ReturnStatement 也没用），源码不变', async () => {
    const { script, dry } = await prepare();
    const base = dry.candidates[0];
    if (!base) throw new Error('precondition failed: no real candidate');
    const result = await applyVerifiedReplacements({ ...dry, candidates: [forge(base, 'dec(0)', 'alpha')] }, script);
    expect(result.code).toBe(SRC);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0].code).toBe('unexpected-parent');
  });

  it('替换引擎：手工构造的模板标签候选被拒绝（候选自称父节点是 ReturnStatement 也没用），源码不变', async () => {
    const { script, dry } = await prepare();
    const base = dry.candidates[0];
    if (!base) throw new Error('precondition failed: no real candidate');
    const result = await applyVerifiedReplacements({ ...dry, candidates: [forge(base, 'dec(1)', 'beta')] }, script);
    expect(result.code).toBe(SRC);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0].code).toBe('unexpected-parent');
  });

  it('完整流程：只有 return dec(2) 被替换，new 和模板标签两处原样保留', async () => {
    const { script, dry } = await prepare();
    const result = await applyVerifiedReplacements(dry, script);
    expect(result.code).toBe(SRC.replace('return dec(2);', 'return ' + JSON.stringify('gamma') + ';'));
    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toEqual([]);
    expect(result.stats).toEqual({ total: 1, applied: 1, rejected: 0, byReason: {} });
    expect(script.source).toBe(SRC);
  });
});
