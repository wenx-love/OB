import { describe, it, expect } from 'vitest';
import type { CdpPosition } from '../src/core/capture-plan.js';
import { CATEGORIES, aggregateRuns, compareRun, parseLiteral, persistRun, type AppliedSite, type CompareInput, type Prim, type ReferenceSite } from './helpers/real-site-compare.js';

// Phase 4.7: self tests of the comparison module on synthetic data (no pipeline involved).
// They pin down the five-class partition, every metric formula of the plan, the n/a rule and the hash identity rules.

const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const BS = String.fromCharCode(92);
const pos = (n: number): CdpPosition => ({ lineNumber: 0, columnNumber: n });
const det = (n: number, value: Prim): ReferenceSite => ({ position: pos(n), callText: 'dec(' + n + ')', determinate: true, value, reason: 'test' });
const indet = (n: number): ReferenceSite => ({ position: pos(n), callText: 'dec(' + n + ')', determinate: false, reason: 'test' });
const app = (n: number, replaced: string): AppliedSite => ({ position: pos(n), original: 'dec(' + n + ')', replaced });

function input(sites: ReferenceSite[], applied: AppliedSite[] = [], over: Partial<CompareInput> = {}): CompareInput {
  return {
    runId: 'synthetic',
    sample: { id: 'synthetic', layer: 'L3', kind: 'synthetic', isRealSiteSample: false, title: 'synthetic' },
    reference: { capturedBy: 'test-oracle', method: 'synthetic', note: 'synthetic' },
    observed: { capturedBy: 'ob-recover', method: 'synthetic', note: 'synthetic' },
    referenceSites: sites,
    identity: { referenceSha256: H, observedSha256: H, afterApplySha256: H, basis: 'synthetic' },
    applied,
    rejections: [],
    businessParity: 'not-evaluated',
    ...over,
  };
}

const MISMATCH = { referenceSha256: H, observedSha256: H2, afterApplySha256: H2, basis: 'synthetic' };

describe('五类结果互斥且穷尽', () => {
  it('每个参考位置只落入一类：正确替换、证据不足、安全拒绝、错误替换各 1 个', () => {
    const r = compareRun(input([det(1, 'a'), det(2, 'b'), indet(3), indet(4)], [app(1, JSON.stringify('a')), app(4, JSON.stringify('x'))]));
    expect(r.counts).toEqual({ 'correct-replacement': 1, 'safe-rejection': 1, 'insufficient-evidence': 1, 'version-mismatch': 0, 'false-replacement': 1 });
    expect(r.sites).toHaveLength(4);
    expect(r.exhaustive).toBe(true);
    expect(CATEGORIES.reduce((n, c) => n + r.counts[c], 0)).toBe(r.sites.length);
    for (const s of r.sites) expect(CATEGORIES).toContain(s.category);
    expect(r.metrics.precision).toBe(0.5);
    expect(r.metrics.recall).toBe(0.5);
    expect(r.metrics.unresolved).toEqual({ count: 1, ratio: 0.5 });
    expect(r.metrics.safeRejectionRate).toBe(0.5);
    expect(r.hardConditions.falseReplacementIsZero).toBe(false);
    expect(r.verdict).toBe('not-pass');
  });

  it('版本不一致：所有参考位置标 version-mismatch，不做位置级结论，所有位置级指标是 n/a', () => {
    const r = compareRun(input([det(1, 'a'), indet(2)], [app(1, JSON.stringify('zzz')), app(2, JSON.stringify('x'))], { identity: MISMATCH }));
    expect(r.counts).toEqual({ 'correct-replacement': 0, 'safe-rejection': 0, 'insufficient-evidence': 0, 'version-mismatch': 2, 'false-replacement': 0 });
    expect(r.verdict).toBe('version-mismatch');
    expect(r.metrics.precision).toBe('n/a');
    expect(r.metrics.recall).toBe('n/a');
    expect(r.metrics.falseReplacement).toBe('n/a');
    expect(r.metrics.safeRejectionRate).toBe('n/a');
    expect(r.metrics.sourceIntegrity).toBe('n/a');
    expect(r.hardConditions).toEqual({ falseReplacementIsZero: 'n/a', sourceIntegrity: 'n/a', safeRejectionRateIs100: 'n/a', precisionIs100: 'n/a' });
    expect(r.identity.referenceEqualsObserved).toBe(false);
    for (const s of r.sites) {
      expect(s.observedValue).toBeUndefined();
      expect(s.observedText).toBeUndefined();
      expect(s.referenceDeterminate).toBeNull();
    }
  });

  it('哈希格式不合法同样按版本不一致处理，不会被当成一致', () => {
    const r = compareRun(input([det(1, 'a')], [], { identity: { referenceSha256: 'xyz', observedSha256: 'xyz', afterApplySha256: 'xyz', basis: 'synthetic' } }));
    expect(r.verdict).toBe('version-mismatch');
    expect(r.counts['version-mismatch']).toBe(1);
  });
});

describe('指标计算定义', () => {
  it('Precision、Recall、Unresolved、Safe Rejection Rate 的公式', () => {
    const r = compareRun(input([det(1, 'a'), det(2, 'b'), det(3, 'c'), indet(4), indet(5)], [app(1, JSON.stringify('a')), app(2, JSON.stringify('b'))]));
    expect(r.detail).toEqual({ tp: 2, frWrongValue: 0, frOnIndeterminate: 0, frNotInReference: 0, frSourceMutation: 0, un: 1, sr: 2 });
    expect(r.metrics.precision).toBe(1);
    expect(r.metrics.recall as number).toBeCloseTo(2 / 3, 5);
    expect(r.metrics.unresolved.count).toBe(1);
    expect(r.metrics.unresolved.ratio as number).toBeCloseTo(1 / 3, 5);
    expect(r.metrics.safeRejectionRate).toBe(1);
    expect(r.metrics.rPos).toBe(3);
    expect(r.metrics.rNeg).toBe(2);
    expect(r.metrics.falseReplacement).toBe(0);
    expect(r.metrics.sourceIntegrity).toBe(true);
    expect(r.verdict).toBe('pass');
  });

  it('分母为 0 输出 n/a，而不是 0 或 100%；n/a 与 0 语义不同', () => {
    const none = compareRun(input([det(1, 'a')]));
    expect(none.metrics.precision).toBe('n/a');
    expect(none.metrics.recall).toBe(0);
    expect(none.metrics.safeRejectionRate).toBe('n/a');
    expect(none.verdict).toBe('inconclusive');
    const onlyNeg = compareRun(input([indet(1), indet(2)]));
    expect(onlyNeg.metrics.recall).toBe('n/a');
    expect(onlyNeg.metrics.unresolved).toEqual({ count: 0, ratio: 'n/a' });
    expect(onlyNeg.metrics.precision).toBe('n/a');
    expect(onlyNeg.metrics.safeRejectionRate).toBe(1);
    expect(onlyNeg.verdict).toBe('inconclusive');
    const empty = compareRun(input([]));
    expect(empty.metrics.precision).toBe('n/a');
    expect(empty.metrics.recall).toBe('n/a');
    expect(empty.metrics.safeRejectionRate).toBe('n/a');
    expect(empty.verdict).toBe('inconclusive');
  });

  it('Version Mismatch 比例 = 版本不一致的 run 数 / 总 run 数；不进入位置级指标', () => {
    const ok = compareRun(input([det(1, 'a'), indet(2)], [app(1, JSON.stringify('a'))]));
    const vm = compareRun(input([det(1, 'a')], [], { identity: MISMATCH }));
    const agg = aggregateRuns('mix', [ok, vm, ok]);
    expect(agg.runs).toBe(3);
    expect(agg.versionMismatchRuns).toBe(1);
    expect(agg.comparableRuns).toBe(2);
    expect(agg.metrics.versionMismatch.ratio as number).toBeCloseTo(1 / 3, 5);
    expect(agg.detail.tp).toBe(2);
    expect(agg.counts['version-mismatch']).toBe(1);
    expect(agg.metrics.precision).toBe(1);
  });

  it('汇总：单个 run 各自 inconclusive，合并后分母非空才得出 pass；全是版本不一致时不是 pass', () => {
    const a = compareRun(input([det(1, 'a'), det(2, 'b')], [app(1, JSON.stringify('a')), app(2, JSON.stringify('b'))]));
    const b = compareRun(input([indet(1), indet(2)]));
    expect(a.verdict).toBe('inconclusive');
    expect(b.verdict).toBe('inconclusive');
    const agg = aggregateRuns('combined', [a, b]);
    expect(agg.metrics.precision).toBe(1);
    expect(agg.metrics.safeRejectionRate).toBe(1);
    expect(agg.verdict).toBe('pass');
    const onlyVm = aggregateRuns('vm', [compareRun(input([det(1, 'a')], [], { identity: MISMATCH }))]);
    expect(onlyVm.verdict).toBe('version-mismatch');
    expect(onlyVm.metrics.precision).toBe('n/a');
    expect(aggregateRuns('empty', []).verdict).toBe('inconclusive');
  });
});

describe('错误替换的各种来源都被计入', () => {
  it('值错误、类型错误、字面量写法不同但值相同', () => {
    const wrong = compareRun(input([det(1, 'a')], [app(1, JSON.stringify('zzz'))]));
    expect(wrong.counts['false-replacement']).toBe(1);
    expect(wrong.detail.frWrongValue).toBe(1);
    const typeA = compareRun(input([det(1, 1)], [app(1, JSON.stringify('1'))]));
    expect(typeA.detail.frWrongValue).toBe(1);
    const typeB = compareRun(input([det(1, '1')], [app(1, '1')]));
    expect(typeB.detail.frWrongValue).toBe(1);
    const text = 'caf' + String.fromCharCode(233) + ' q' + NLX() + 'end';
    const escaped = '\'' + 'x' + '\'';
    expect(escaped.length).toBe(3);
    const same = compareRun(input([det(1, text)], [app(1, JSON.stringify(text))]));
    expect(same.counts['correct-replacement']).toBe(1);
    const babelStyle = compareRun(input([det(1, 'caf' + String.fromCharCode(233))], [app(1, '"caf' + BS + 'u00e9"')]));
    expect(babelStyle.counts['correct-replacement']).toBe(1);
    expect(compareRun(input([det(1, null)], [app(1, 'null')])).counts['correct-replacement']).toBe(1);
    expect(compareRun(input([det(1, true)], [app(1, 'true')])).counts['correct-replacement']).toBe(1);
    expect(compareRun(input([det(1, 20)], [app(1, '20')])).counts['correct-replacement']).toBe(1);
  });

  it('参考标注为不确定的位置被替换、参考里根本没有的位置被替换，都是错误替换', () => {
    const onIndet = compareRun(input([indet(1)], [app(1, JSON.stringify('x'))]));
    expect(onIndet.detail.frOnIndeterminate).toBe(1);
    expect(onIndet.metrics.safeRejectionRate).toBe(0);
    const extra = compareRun(input([det(1, 'a')], [app(1, JSON.stringify('a')), app(9, JSON.stringify('q'))]));
    expect(extra.detail.frNotInReference).toBe(1);
    expect(extra.counts['false-replacement']).toBe(1);
    expect(extra.metrics.precision).toBe(0.5);
    expect(extra.sites.find((s) => s.referenceDeterminate === null)?.category).toBe('false-replacement');
    expect(extra.verdict).toBe('not-pass');
  });

  it('原始源码字节变化：完整性为 false，按错误替换记录，判不通过', () => {
    const r = compareRun(input([det(1, 'a'), indet(2)], [app(1, JSON.stringify('a'))], { identity: { referenceSha256: H, observedSha256: H, afterApplySha256: H2, basis: 'synthetic' } }));
    expect(r.metrics.sourceIntegrity).toBe(false);
    expect(r.hardConditions.sourceIntegrity).toBe(false);
    expect(r.detail.frSourceMutation).toBe(1);
    expect(r.counts['false-replacement']).toBe(1);
    expect(r.sites[r.sites.length - 1].callText).toBe('<original script bytes>');
    expect(r.exhaustive).toBe(true);
    expect(r.verdict).toBe('not-pass');
    expect(r.identity.unchangedAfterApply).toBe(false);
  });

  it('业务一致性为 fail 时判不通过；not-evaluated 不算通过', () => {
    const sites = [det(1, 'a'), indet(2)];
    const applied = [app(1, JSON.stringify('a'))];
    expect(compareRun(input(sites, applied, { businessParity: 'fail' })).verdict).toBe('not-pass');
    expect(compareRun(input(sites, applied, { businessParity: 'pass' })).verdict).toBe('pass');
    expect(compareRun(input(sites, applied, { businessParity: 'not-evaluated' })).metrics.businessParity).toBe('not-evaluated');
  });
});

describe('输入非法时抛错，而不是悄悄给出结论', () => {
  it('参考位置重复、确定位置没有值、可比较时 afterApply 哈希不合法', () => {
    expect(() => compareRun(input([det(1, 'a'), indet(1)]))).toThrow(/duplicate/);
    expect(() => compareRun(input([{ position: pos(1), callText: 'x', determinate: true, reason: 'test' }]))).toThrow(/no value/);
    expect(() => compareRun(input([det(1, 'a')], [], { identity: { referenceSha256: H, observedSha256: H, afterApplySha256: 'bad', basis: 'synthetic' } }))).toThrow(/afterApplySha256/);
  });

  it('parseLiteral 只接受字面量', () => {
    expect(parseLiteral(JSON.stringify('x'))).toEqual({ ok: true, value: 'x' });
    expect(parseLiteral('null')).toEqual({ ok: true, value: null });
    expect(parseLiteral('f(1)').ok).toBe(false);
    expect(parseLiteral('1 + 1').ok).toBe(false);
  });
});

describe('compare.json 内容', () => {
  it('可 JSON 往返，包含样本身份、来源、哈希三处和完整五类计数', () => {
    const r = compareRun(input([det(1, 'a')], [app(1, JSON.stringify('a'))]));
    const back = JSON.parse(JSON.stringify(r));
    expect(back).toEqual(r);
    expect(back.sample.id).toBe('synthetic');
    expect(back.provenance.reference.capturedBy).toBe('test-oracle');
    expect(back.provenance.observed.capturedBy).toBe('ob-recover');
    expect(back.identity.referenceSha256).toBe(H);
    expect(back.identity.observedSha256).toBe(H);
    expect(back.identity.afterApplySha256).toBe(H);
    expect(Object.keys(back.counts).sort()).toEqual([...CATEGORIES].sort());
  });

  it('persistRun 拒绝来源标注不实的文件（reference 不能标 ob-recover，observed 必须标 ob-recover）', async () => {
    const r = compareRun(input([det(1, 'a')], [app(1, JSON.stringify('a'))]));
    await expect(persistRun('does/not/exist', { meta: {}, reference: { 'x.json': { capturedBy: 'ob-recover' } }, observed: {}, compare: r })).rejects.toThrow(/capturedBy/);
    await expect(persistRun('does/not/exist', { meta: {}, reference: {}, observed: { 'y.json': { capturedBy: 'skill' } }, compare: r })).rejects.toThrow(/capturedBy/);
    await expect(persistRun('does/not/exist', { meta: {}, reference: { 'z.json': {} }, observed: {}, compare: r })).rejects.toThrow(/capturedBy/);
  });
});

function NLX(): string {
  return String.fromCharCode(10);
}
