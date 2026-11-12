import { describe, it, expect } from 'vitest';
import { computeValidationStats, summarizeValidation } from '../src/core/validation-stats.js';
import { validateCaptures } from '../src/core/capture-validation.js';
import { drive } from './helpers/capture-driver.js';

// Phase 3.2 补充：面板验证统计的唯一来源 validation-stats。
// 面板上的 verified / unstable / failed / insufficient / pending 数量全部来自 Phase 3.2 验证结果，
// 不使用 Phase 3.1 引擎 getStability() 的 unstable 数量。这里覆盖空记录、混合状态、刷新、清空、切换脚本和重新分析。
// 数据来源：真实 CaptureEngine + node:vm 里真实执行的脚本（见 helpers/capture-driver.ts）。
// 这里不测面板 DOM；面板接线（定时器刷新、元素更新）由真实 DevTools 流程验证。

const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);
const total = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);

const STABLE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');
const SINGLE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(2);', '}');
const ROTATING = src(`var strings = ['hello', 'world', 'test'];`, 'function dec(i) {', '  return strings[i];', '}', 'function rotate() {', '  strings.push(strings.shift());', '}', 'function run() {', '  dec(0);', '  rotate();', '  dec(0);', '  dec(1);', '  dec(1);', '}');
const MIXED = src(ARR, 'var n = 0;', 'function decA(i) {', '  return _arr[i];', '}', 'function decB(i) {', '  n++;', '  return _arr[i] + n;', '}', 'function decC(i) {', '  return _arr[i];', '}', 'function run() {', '  decA(0);', '  decA(0);', '  decB(1);', '  decB(1);', '  decC(2);', '}');

describe('验证统计：来源与一致性', () => {
  it('没有任何捕获记录：所有统计为 0 且一致', () => {
    const { stats } = computeValidationStats([], []);
    expect(stats.groups).toBe(0);
    expect(stats.records).toBe(0);
    expect(total(stats.byStatus)).toBe(0);
    expect(stats.byEvidence).toEqual({ multiple: 0, single: 0 });
    expect(stats.consistent).toBe(true);
  });

  it('混合脚本：状态之和等于验证组数，记录数等于参与统计的捕获记录数，单次与多次观测分开计数', async () => {
    const d = await drive(MIXED, { wrap: ['decA', 'decB', 'decC'] });
    const { stats } = computeValidationStats(d.captures, [d.script]);
    expect(stats.groups).toBe(3);
    expect(stats.byStatus).toEqual({ pending: 0, verified: 2, unstable: 1, failed: 0, insufficient: 0 });
    expect(total(stats.byStatus)).toBe(stats.groups);
    expect(stats.records).toBe(d.captures.length);
    expect(stats.byEvidence).toEqual({ multiple: 1, single: 1 });
    expect(stats.consistent).toBe(true);
  });

  it('一致性检查本身有效：声明的记录数与实际不符时 consistent 为 false', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const report = validateCaptures(d.captures, [d.script]);
    expect(summarizeValidation(report, d.captures.length).consistent).toBe(true);
    expect(summarizeValidation(report, d.captures.length + 1).consistent).toBe(false);
  });

  it('旧脚本里引擎认为不稳定的组：验证统计里是 failed（过期），不计入 unstable，二者是独立来源', async () => {
    const old = await drive(ROTATING, { wrap: ['dec'], scriptId: 's1' });
    const fresh = await drive(STABLE, { wrap: ['dec'], scriptId: 's2' });
    const engineUnstable = old.stability.filter((s) => !s.stable).length;
    expect(engineUnstable).toBeGreaterThan(0);
    const { stats } = computeValidationStats([...old.captures, ...fresh.captures], [fresh.script]);
    expect(stats.byStatus.unstable).toBe(0);
    expect(stats.byStatus.failed).toBe(2);
    expect(stats.byStatus.verified).toBe(2);
    expect(stats.staleGroups).toBe(2);
    expect(stats.groups).toBe(4);
    expect(stats.records).toBe(old.captures.length + fresh.captures.length);
    expect(stats.consistent).toBe(true);
  });
});

describe('验证统计：刷新、清空、切换脚本、重新分析', () => {
  it('页面刷新：刷新前的脚本不再是当前脚本，旧记录计为 failed（过期），新记录从新脚本重新统计', async () => {
    const s1 = await drive(STABLE, { wrap: ['dec'], scriptId: 's1' });
    const s2 = await drive(STABLE, { wrap: ['dec'], scriptId: 's2' });
    const before = computeValidationStats(s1.captures, [s1.script]).stats;
    expect(before.byStatus.verified).toBe(2);
    expect(before.staleGroups).toBe(0);
    const during = computeValidationStats([...s1.captures, ...s2.captures], [s2.script]).stats;
    expect(during.byStatus).toEqual({ pending: 0, verified: 2, unstable: 0, failed: 2, insufficient: 0 });
    expect(during.staleGroups).toBe(2);
    expect(during.consistent).toBe(true);
    const after = computeValidationStats(s2.captures, [s2.script]).stats;
    expect(after.groups).toBe(2);
    expect(after.byStatus.verified).toBe(2);
    expect(after.staleGroups).toBe(0);
  });

  it('清空记录：统计归零；清空后重新捕获从 0 开始，不累加旧统计，没有跨调用的残留状态', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const full = computeValidationStats(d.captures, [d.script]).stats;
    expect(full.groups).toBe(2);
    const cleared = computeValidationStats([], [d.script]).stats;
    expect(cleared.groups).toBe(0);
    expect(total(cleared.byStatus)).toBe(0);
    expect(cleared.consistent).toBe(true);
    const again = computeValidationStats(d.captures.slice(0, 1), [d.script]).stats;
    expect(again.groups).toBe(1);
    expect(again.byStatus.verified).toBe(1);
    expect(again.consistent).toBe(true);
    expect(JSON.stringify(computeValidationStats(d.captures, [d.script]).stats)).toBe(JSON.stringify(full));
  });

  it('切换脚本：统计是所有当前脚本的合计，与正在查看哪个文件无关；脚本集合变化后按新集合重新统计', async () => {
    const a = await drive(STABLE, { wrap: ['dec'], scriptId: 'sa' });
    const b = await drive(SINGLE, { wrap: ['dec'], scriptId: 'sb' });
    const all = [...a.captures, ...b.captures];
    const both = computeValidationStats(all, [a.script, b.script]).stats;
    expect(both.groups).toBe(3);
    expect(both.byStatus.verified).toBe(3);
    expect(both.byEvidence).toEqual({ multiple: 2, single: 1 });
    const onlyA = computeValidationStats(all, [a.script]).stats;
    expect(onlyA.groups).toBe(3);
    expect(onlyA.byStatus.verified).toBe(2);
    expect(onlyA.byStatus.failed).toBe(1);
    const onlyB = computeValidationStats(all, [b.script]).stats;
    expect(onlyB.groups).toBe(3);
    expect(onlyB.byStatus.verified).toBe(1);
    expect(onlyB.byStatus.failed).toBe(2);
    for (const s of [both, onlyA, onlyB]) {
      expect(total(s.byStatus)).toBe(s.groups);
      expect(s.records).toBe(all.length);
      expect(s.consistent).toBe(true);
    }
  });

  it('重新分析：同一批记录换验证选项或脚本源码后重新统计，总和与记录数始终一致', async () => {
    const d = await drive(SINGLE, { wrap: ['dec'] });
    const normal = computeValidationStats(d.captures, [d.script]).stats;
    expect(normal.byStatus.verified).toBe(1);
    expect(normal.byEvidence.single).toBe(1);
    const noSingle = computeValidationStats(d.captures, [d.script], { allowSingleObservation: false }).stats;
    expect(noSingle.byStatus.insufficient).toBe(1);
    expect(noSingle.byStatus.verified).toBe(0);
    const active = computeValidationStats(d.captures, [d.script], { allowSingleObservation: false, captureActive: true }).stats;
    expect(active.byStatus.pending).toBe(1);
    const changed = computeValidationStats(d.captures, [{ ...d.script, source: NL + NL + d.script.source }]).stats;
    expect(changed.byStatus.failed).toBe(1);
    for (const s of [normal, noSingle, active, changed]) {
      expect(total(s.byStatus)).toBe(s.groups);
      expect(s.records).toBe(d.captures.length);
      expect(s.consistent).toBe(true);
    }
  });
});
