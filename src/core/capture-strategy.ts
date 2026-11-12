/**
 * Phase 3.1 — 捕获策略
 *
 * high   : 默认自动捕获
 * medium : 需要显式开启（默认关闭）
 * low    : 默认不捕获，仅允许用户手动选择的函数
 *
 * 不通过降低评分门槛来提升覆盖率，只决定「哪些置信度允许进入自动捕获」。
 */
import type { CandidateDecoder, DecoderConfidence } from './decoder-discovery.js';

export interface CaptureStrategyConfig {
  /** 自动捕获的最低置信度 */
  autoCaptureMinConfidence: DecoderConfidence;
  /** 用户手动指定的函数（名称 + 入口位置），不受置信度限制 */
  manualTargets?: { functionName: string; lineNumber: number; columnNumber: number }[];
}

export const DEFAULT_STRATEGY: CaptureStrategyConfig = {
  autoCaptureMinConfidence: 'high',
};

const RANK: Record<DecoderConfidence, number> = { low: 0, medium: 1, high: 2 };

/** 判断一个候选是否应进入自动捕获 */
export function shouldAutoCapture(
  candidate: CandidateDecoder,
  config: CaptureStrategyConfig,
): boolean {
  if (!candidate.name) return false;
  if (RANK[candidate.confidence] >= RANK[config.autoCaptureMinConfidence]) return true;
  if (!config.manualTargets) return false;
  return config.manualTargets.some(
    (m) => m.functionName === candidate.name
      && m.lineNumber === candidate.location.startLine
      && m.columnNumber === candidate.location.startColumn,
  );
}

/** 选出应进入自动捕获的候选 */
export function selectTargets(
  candidates: CandidateDecoder[],
  config: CaptureStrategyConfig,
): CandidateDecoder[] {
  return candidates.filter((c) => shouldAutoCapture(c, config));
}
