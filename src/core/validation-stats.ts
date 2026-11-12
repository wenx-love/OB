/**
 * Phase 3.2 补充：验证统计的唯一来源。
 * 面板上的 verified / unstable / failed / insufficient / pending 数量全部来自 Phase 3.2 验证结果（validateCaptures），
 * 不使用 Phase 3.1 引擎 getStability() 的 unstable 数量。统计单位是验证组（脚本 + 函数 + 参数），不是捕获记录条数。
 */
import type { DecoderCapture } from '../extension/debugger/capture-engine.js';
import { validateCaptures, type ValidationOptions, type ValidationReport, type ValidationScript, type ValidationStatus } from './capture-validation.js';

export interface ValidationStats {
  /** 验证组数 */
  groups: number;
  /** 各组对应的捕获记录数之和 */
  records: number;
  byStatus: Record<ValidationStatus, number>;
  /** verified 的证据类型分布：多次一致观测 / 单次观测 */
  byEvidence: { multiple: number; single: number };
  /** 因脚本已过期（页面刷新后的旧记录）被判 failed 的组数 */
  staleGroups: number;
  /** 各状态之和等于验证组数；传入 inputRecords 时，records 也必须等于它 */
  consistent: boolean;
}

export function summarizeValidation(report: ValidationReport, inputRecords?: number): ValidationStats {
  const byStatus: Record<ValidationStatus, number> = { pending: 0, verified: 0, unstable: 0, failed: 0, insufficient: 0 };
  let records = 0;
  let single = 0;
  let multiple = 0;
  let stale = 0;
  for (const g of report.groups) {
    byStatus[g.status]++;
    records += g.captureKeys.length;
    if (g.evidence === 'single-observation') single++;
    else if (g.evidence === 'multiple-observations') multiple++;
    if (g.reasons.some((r) => r.code === 'stale-script')) stale++;
  }
  const sum = byStatus.pending + byStatus.verified + byStatus.unstable + byStatus.failed + byStatus.insufficient;
  return {
    groups: report.groups.length,
    records,
    byStatus,
    byEvidence: { multiple, single },
    staleGroups: stale,
    consistent: sum === report.groups.length && (inputRecords === undefined || records === inputRecords),
  };
}

export function computeValidationStats(captures: DecoderCapture[], scripts: ValidationScript[], options: ValidationOptions = {}): { report: ValidationReport; stats: ValidationStats } {
  const report = validateCaptures(captures, scripts, options);
  return { report, stats: summarizeValidation(report, captures.length) };
}
