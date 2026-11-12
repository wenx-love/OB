import type { DryRunResult, ReplacementCandidate } from './replacement-dryrun.js';
import type { ValidationScript } from './capture-validation.js';
import { computeScriptHash } from './hash-utils.js';
import { getScriptAst } from './capture-validation.js';
import { findCallPathsAt } from './ast-locate.js';
import { literalTextOf, replacementParentProblem } from './replacement-safety.js';
import { parseCode } from './parser.js';
import { generate } from '@babel/generator';
import * as t from '@babel/types';

/**
 * Phase 4: 位置级 AST 替换的应用结果
 */
export interface ApplyResult {
  /** 替换后的完整源码（任何整体失败都原样返回 script.source） */
  code: string;
  /** 实际替换的候选记录（按源码顺序） */
  applied: AppliedReplacement[];
  /** 未替换的候选记录 */
  rejected: RejectionWithReason[];
  /** 详细统计信息（与 applied / rejected 始终一致） */
  stats: {
    total: number;
    applied: number;
    rejected: number;
    byReason: Record<string, number>;
  };
}

/**
 * 已应用的替换记录
 */
export interface AppliedReplacement {
  scriptId: string;
  groupId: string;
  position: { lineNumber: number; columnNumber: number };
  original: string;
  replaced: string;
  start: number;
  end: number;
}

/**
 * 未替换的候选记录
 */
export interface RejectionWithReason {
  scriptId: string;
  groupId: string;
  position: { lineNumber: number; columnNumber: number };
  callText: string;
  reasons: Array<{ code: string; message: string }>;
}

type Reason = { code: string; message: string };

function rejectionOf(c: ReplacementCandidate, reasons: Reason[]): RejectionWithReason {
  return { scriptId: c.scriptId, groupId: c.groupId, position: c.position, callText: c.callText, reasons };
}

/**
 * Phase 4 核心：应用已验证的替换
 *
 * 约束（每一步失败都只拒绝对应候选，整体失败则整体回滚，原始源码字符串从不被修改）：
 * 0. callLocationsTruncated 只有明确为 false 才放行（缺失按截断处理），同一组只要有一个被截断，整组拒绝
 * 1. scriptId + scriptHash 双重校验（不能只依赖 SHA-256）
 * 2. 区间校验：整数、start < end、不越界；重叠或嵌套的候选整簇拒绝，不任意选一个
 * 3. 源码核对：callText 必须等于 source.slice(start, end)；AST 必须在 position 处唯一命中一个 CallExpression，
 *    且该节点的 start/end 与候选一致
 * 4. 字面量核对：只允许 string / boolean / null / 有限非负数字；数字、布尔、null 后面紧跟标识符字符或整数后紧跟 . 会改变词法，拒绝
 * 5. 从后往前应用：按 start 降序切片拼接
 * 6. 替换后整体重新解析，失败则整体回滚（所有已应用的候选都记为回滚，统计一致）
 */
export async function applyVerifiedReplacements(
  dryRunResult: DryRunResult,
  script: ValidationScript
): Promise<ApplyResult> {
  const rejected: RejectionWithReason[] = [];
  const candidates = dryRunResult.candidates;
  const unchanged = (): ApplyResult => ({ code: script.source, applied: [], rejected, stats: buildStats([], rejected) });

  if (candidates.length === 0) return unchanged();

  // 0. callLocationsTruncated 保守策略：只有明确为 false 才放行
  const truncatedGroups = new Set<string>();
  for (const c of candidates) {
    if (c.callLocationsTruncated !== false) truncatedGroups.add(c.groupId);
  }
  const notTruncated: ReplacementCandidate[] = [];
  for (const c of candidates) {
    if (truncatedGroups.has(c.groupId)) {
      rejected.push(rejectionOf(c, [{ code: 'call-locations-truncated', message: '该函数的调用位置列表被截断（或标记缺失），无法确认所有调用点，整组拒绝' }]));
    } else {
      notTruncated.push(c);
    }
  }
  if (notTruncated.length === 0) return unchanged();

  // 1. 脚本身份：scriptId + scriptHash
  const currentHash = await computeScriptHash(script.source);
  const identityOk: ReplacementCandidate[] = [];
  for (const c of notTruncated) {
    if (c.scriptId !== script.scriptId) {
      rejected.push(rejectionOf(c, [{ code: 'script-id-mismatch', message: `脚本 ID 不匹配：候选 ${c.scriptId} vs 当前 ${script.scriptId}` }]));
      continue;
    }
    if (c.scriptHash !== currentHash) {
      rejected.push(rejectionOf(c, [{ code: 'script-version-mismatch', message: '脚本版本不匹配：源码已变化' }]));
      continue;
    }
    identityOk.push(c);
  }
  if (identityOk.length === 0) return unchanged();

  // 2. 区间
  const intervals = validateIntervals(identityOk, script.source.length);
  rejected.push(...intervals.rejected);
  if (intervals.valid.length === 0) return unchanged();

  // 3. 源码文本与 AST 定位
  const located = validateASTPositions(intervals.valid, script);
  rejected.push(...located.rejected);
  if (located.valid.length === 0) return unchanged();

  // 4. 字面量
  const literals = validateLiterals(located.valid, script.source);
  rejected.push(...literals.rejected);
  if (literals.valid.length === 0) return unchanged();

  // 5. 从后往前应用（按 start 降序），每一步都基于同一份原始源码的偏移
  const sorted = [...literals.valid].sort((a, b) => b.start - a.start);
  const done: { candidate: ReplacementCandidate; record: AppliedReplacement }[] = [];
  try {
    let modified = script.source;
    for (const c of sorted) {
      let text: string;
      try {
        text = generateLiteral(c.value);
      } catch (err) {
        rejected.push(rejectionOf(c, [{ code: 'literal-generation-failed', message: `字面量生成失败: ${err}` }]));
        continue;
      }
      const original = modified.slice(c.start, c.end);
      modified = modified.slice(0, c.start) + text + modified.slice(c.end);
      done.push({ candidate: c, record: { scriptId: c.scriptId, groupId: c.groupId, position: c.position, original, replaced: text, start: c.start, end: c.end } });
    }

    // 6. 替换后整体重新解析：直接解析（不经过会吞掉解析错误的 getScriptAst，也不污染它的缓存）
    try {
      parseCode(modified);
    } catch (parseErr) {
      const all = [
        ...rejected,
        ...done.map((d) => rejectionOf(d.candidate, [{ code: 'parse-failed-after-replacement', message: `替换后代码解析失败，整体回滚：${parseErr}` }])),
      ];
      return { code: script.source, applied: [], rejected: all, stats: buildStats([], all) };
    }

    // done 是从后往前的顺序，反转回源码顺序
    const applied = done.map((d) => d.record).reverse();
    return { code: modified, applied, rejected, stats: buildStats(applied, rejected) };
  } catch (err) {
    const all: RejectionWithReason[] = [
      ...rejected,
      { scriptId: script.scriptId, groupId: '', position: { lineNumber: -1, columnNumber: -1 }, callText: '', reasons: [{ code: 'replacement-failed', message: `替换过程异常: ${err}` }] },
    ];
    return { code: script.source, applied: [], rejected: all, stats: buildStats([], all) };
  }
}

/**
 * 区间校验：整数、start < end、不越界；重叠或嵌套的候选整簇拒绝（相邻不算重叠）
 */
function validateIntervals(
  candidates: ReplacementCandidate[],
  sourceLength: number
): { valid: ReplacementCandidate[]; rejected: RejectionWithReason[] } {
  const wellFormed: ReplacementCandidate[] = [];
  const rejected: RejectionWithReason[] = [];

  for (const c of candidates) {
    const reasons: Reason[] = [];
    if (!Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start >= c.end) {
      reasons.push({ code: 'invalid-interval', message: `区间无效: start(${c.start}) 与 end(${c.end}) 不是 start < end 的整数` });
    }
    if (c.start < 0 || c.end > sourceLength) {
      reasons.push({ code: 'interval-out-of-range', message: `区间超出源码范围: [${c.start}, ${c.end}) vs [0, ${sourceLength})` });
    }
    if (reasons.length > 0) rejected.push(rejectionOf(c, reasons));
    else wellFormed.push(c);
  }

  // 重叠簇：按 start 排序后扫描，只要 start 落在当前簇已覆盖的范围内就并入该簇（包含式嵌套也会被并入）
  const sorted = [...wellFormed].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: ReplacementCandidate[][] = [];
  let clusterEnd = -1;
  for (const c of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && c.start < clusterEnd) {
      last.push(c);
      clusterEnd = Math.max(clusterEnd, c.end);
    } else {
      clusters.push([c]);
      clusterEnd = c.end;
    }
  }

  const valid: ReplacementCandidate[] = [];
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      valid.push(cluster[0]);
    } else {
      for (const c of cluster) {
        rejected.push(rejectionOf(c, [{ code: 'interval-overlapping', message: '区间与其他候选重叠或嵌套，重叠簇内的候选全部拒绝' }]));
      }
    }
  }
  return { valid, rejected };
}

/**
 * 源码文本与 AST 定位：callText 必须等于源码切片；position 处必须唯一命中一个以该位置为起点的 CallExpression，
 * 且该节点的 start/end 与候选一致。
 */
function validateASTPositions(
  candidates: ReplacementCandidate[],
  script: ValidationScript
): { valid: ReplacementCandidate[]; rejected: RejectionWithReason[] } {
  const valid: ReplacementCandidate[] = [];
  const rejected: RejectionWithReason[] = [];

  const { ast } = getScriptAst(script);
  if (!ast) {
    return { valid: [], rejected: candidates.map((c) => rejectionOf(c, [{ code: 'ast-unavailable', message: 'AST 不可用' }])) };
  }

  for (const c of candidates) {
    if (script.source.slice(c.start, c.end) !== c.callText) {
      rejected.push(rejectionOf(c, [{ code: 'source-text-mismatch', message: `候选的 callText 与当前源码 [${c.start}, ${c.end}) 处的文本不一致` }]));
      continue;
    }
    const hits = findCallPathsAt(ast, c.position);
    if (hits.length === 0) {
      rejected.push(rejectionOf(c, [{ code: 'ast-position-not-found', message: 'AST 定位失败：该位置没有 CallExpression' }]));
    } else if (hits.length > 1) {
      rejected.push(rejectionOf(c, [{ code: 'ast-position-ambiguous', message: 'AST 定位不唯一：该位置有多个 CallExpression' }]));
    } else {
      const hit = hits[0];
      const node = hit.path.node;
      if (hit.kind !== 'call-start' || node.start !== c.start || node.end !== c.end) {
        rejected.push(rejectionOf(c, [{ code: 'ast-range-mismatch', message: `AST 节点范围 [${node.start}, ${node.end}) 与候选区间 [${c.start}, ${c.end}) 不一致，或位置不是调用表达式的起点` }]));
      } else {
        const parentProblem = replacementParentProblem(node, hit.path.parent, c.value);
        if (parentProblem) rejected.push(rejectionOf(c, [parentProblem]));
        else valid.push(c);
      }
    }
  }
  return { valid, rejected };
}

/**
 * 字面量核对：只允许 string / boolean / null / 有限非负数字（NaN、Infinity、负数、-0 会变成表达式，改变优先级）；
 * 数字、布尔、null 后面紧跟标识符字符（5in obj）或整数后紧跟 .（5.length）会改变词法，一律拒绝。
 */
function validateLiterals(
  candidates: ReplacementCandidate[],
  source: string
): { valid: ReplacementCandidate[]; rejected: RejectionWithReason[] } {
  const valid: ReplacementCandidate[] = [];
  const rejected: RejectionWithReason[] = [];

  for (const c of candidates) {
    const v: unknown = c.value;
    let problem: Reason | null = null;
    let text = '';

    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v < 0 || Object.is(v, -0)) {
        problem = { code: 'unsupported-literal-value', message: `数字 ${String(v)} 不是有限非负数字，生成的不是普通字面量，不替换` };
      }
    } else if (typeof v !== 'string' && typeof v !== 'boolean' && v !== null) {
      problem = { code: 'unsupported-literal-value', message: `值类型 ${typeof v} 不能表示为字面量` };
    }

    if (!problem) {
      try {
        text = generateLiteral(c.value);
      } catch (err) {
        problem = { code: 'literal-generation-failed', message: `字面量生成失败: ${err}` };
      }
    }

    if (!problem && typeof v !== 'string') {
      const next = source.charAt(c.end);
      if (next !== '' && /[A-Za-z0-9_$\u0080-\uffff]/.test(next)) {
        problem = { code: 'token-boundary', message: `字面量 ${text} 后面紧跟 ${next}，替换会把两者连成一个词法单元，改变语义或造成语法错误` };
      } else if (next === '.' && /^[0-9]+$/.test(text)) {
        problem = { code: 'numeric-member-access', message: `整数字面量 ${text} 后面紧跟 .，会被解析成小数点，造成语法错误` };
      }
    }

    if (!problem && c.replacement !== literalTextOf(c.value)) {
      problem = { code: 'replacement-value-mismatch', message: `候选的 replacement（${JSON.stringify(c.replacement)}）与 value 按生成公式得到的字面量不一致：候选自相矛盾，可能被修改过，不替换` };
    }

    if (problem) rejected.push(rejectionOf(c, [problem]));
    else valid.push(c);
  }
  return { valid, rejected };
}

/**
 * 生成字面量文本（使用 Babel）
 */
function generateLiteral(value: string | number | boolean | null): string {
  const node = t.valueToNode(value);
  const result = generate(node, { concise: true });
  return result.code;
}

/**
 * 构建统计信息：始终由最终的 applied / rejected 计算，保证与返回值一致
 */
function buildStats(
  applied: AppliedReplacement[],
  rejected: RejectionWithReason[]
): ApplyResult['stats'] {
  const byReason: Record<string, number> = {};

  for (const r of rejected) {
    for (const reason of r.reasons) {
      byReason[reason.code] = (byReason[reason.code] || 0) + 1;
    }
  }

  return {
    total: applied.length + rejected.length,
    applied: applied.length,
    rejected: rejected.length,
    byReason,
  };
}
