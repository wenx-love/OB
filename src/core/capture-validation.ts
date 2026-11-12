/**
 * Phase 3.2：Runtime Capture 结果验证（数据层）
 *
 * 只消费引擎已经捕获的真实数据（参数、返回值、调用位置），不重新执行任何解码函数。
 * 验证分两层：
 *   1. 本文件：按「脚本 + 函数 + 参数」分组，给每组映射一个明确的验证状态。
 *   2. replacement-dryrun.ts：AST 层 dry-run，只检查 verified 映射能否安全替换，从不修改源码或 AST。
 *
 * 状态含义：
 *   pending      证据不够，但捕获仍在进行，可能还会有新观测
 *   verified     同参数观测一致、数据完整、静态检查未发现状态/时间/随机依赖、调用位置已知
 *   unstable     同参数出现不同返回值，或静态检查发现输出可能不只取决于参数
 *   failed       数据不完整、捕获失败、脚本已过期或函数身份对不上
 *   insufficient 观测不足以判断（次数不够、位置未知、成功与失败并存等）
 *
 * 证据不足一律不标 verified。
 */
import type { File } from '@babel/types';
// 仅类型引用：core 不依赖扩展运行时代码
import type { DecoderCapture, RuntimeValue } from '../extension/debugger/capture-engine.js';
import type { CdpPosition } from './capture-plan.js';
import { parseCode } from './parser.js';
import { findCallPathsAt, findFunctionPathsByEntry, resolveFunctionName } from './ast-locate.js';
import { analyzeFunctionFeatures, type FunctionFeatures } from './function-features.js';
import { fmtValue, helperProblems, MAX_HELPER_DEPTH, outerMutableReads, replacementOf, type HelperReport } from './replacement-safety.js';

export type ValidationStatus = 'pending' | 'verified' | 'unstable' | 'failed' | 'insufficient';

export interface ValidationReason {
  code: string;
  message: string;
}

export interface ValidationScript {
  scriptId: string;
  source: string;
  url?: string;
  /** 内联脚本在文档中的起始偏移；非 0 时运行时位置与源码位置的换算未验证 */
  startLine?: number;
  startColumn?: number;
}

export interface ValidationOptions {
  /** 判定 verified 所需的同参数一致观测次数，默认 2 */
  minObservations?: number;
  /** 捕获仍在进行：证据不足时标 pending 而不是 insufficient */
  captureActive?: boolean;
  /**
   * 允许单次观测在严格静态安全条件全部满足时进入 verified，默认 true。
   * 设为 false 时恢复旧行为：观测次数不足 minObservations 一律不是 verified。
   * 单次观测路径不接受任何放宽选项：辅助函数无法解析等情况一律判为 insufficient。
   */
  allowSingleObservation?: boolean;
}

export interface ReturnSample {
  value: RuntimeValue;
  count: number;
  firstSeq: number;
  lastSeq: number;
}

export interface GroupValidation {
  /** 分组键：脚本 + 函数位置 + 函数名 + 参数 */
  id: string;
  functionId: string;
  scriptId: string;
  scriptUrl: string;
  functionName: string;
  functionLocation: CdpPosition;
  /** 参数样本 */
  arguments: RuntimeValue[];
  status: ValidationStatus;
  /** 状态依据 */
  reasons: ValidationReason[];
  /** 不改变状态的提示 */
  warnings: ValidationReason[];
  /** 成功观测次数（验证次数） */
  observations: number;
  failedObservations: number;
  distinctReturns: number;
  /** 同参数是否出现过不同返回值 */
  conflict: boolean;
  /** 返回值样本（按首次出现顺序，最多 5 个） */
  returnSamples: ReturnSample[];
  callLocations: CdpPosition[];
  callLocationsTruncated: boolean;
  lastCapturedAt: number;
  captureKeys: string[];
  /** 同一函数的其他参数组合出现过冲突或静态特征存疑 */
  functionSuspect: boolean;
  /** verified 的证据类型：多次一致观测，或单次观测加严格静态检查；非 verified 为 none */
  evidence: 'multiple-observations' | 'single-observation' | 'none';
}

export interface FunctionValidation {
  id: string;
  scriptId: string;
  scriptUrl: string;
  functionName: string;
  functionLocation: CdpPosition;
  groupCount: number;
  statusCounts: Record<ValidationStatus, number>;
  suspect: boolean;
  reasons: ValidationReason[];
  notes: string[];
}

export interface ValidationReport {
  groups: GroupValidation[];
  functions: FunctionValidation[];
  summary: { groups: number; byStatus: Record<ValidationStatus, number>; suspectFunctions: number };
}

const DEFAULT_MIN_OBSERVATIONS = 2;
const SAMPLE_LIMIT = 5;
const CACHE_MAX = 16;

export function groupKey(c: Pick<DecoderCapture, 'scriptId' | 'functionLocation' | 'functionName' | 'arguments'>): string {
  return [c.scriptId, c.functionLocation.lineNumber, c.functionLocation.columnNumber, c.functionName, JSON.stringify(c.arguments)].join('|');
}

export function functionKey(c: Pick<DecoderCapture, 'scriptId' | 'functionLocation' | 'functionName'>): string {
  return [c.scriptId, c.functionLocation.lineNumber, c.functionLocation.columnNumber, c.functionName].join('|');
}

// ── 值检查 ──

const COMPARABLE_TYPES = new Set(['string', 'number', 'boolean', 'undefined', 'null', 'bigint']);

/** 只有原始值能可靠比较；对象和函数只保留了描述，无法判断两次是不是同一个值 */
export function isComparableValue(v: RuntimeValue | undefined): boolean {
  return !!v && COMPARABLE_TYPES.has(v.type);
}

// fmtValue 已移到 replacement-safety（验证层和 dry-run 共用），这里重新导出，原有导入路径不变
export { fmtValue };

function findArgumentProblem(args: RuntimeValue[]): ValidationReason | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.type === 'missing') return { code: 'argument-missing', message: `参数[${i}] 缺失：无法从函数局部作用域读取` };
    if (a.truncated) return { code: 'argument-truncated', message: `参数[${i}] 被截断，不是完整值` };
    if (!isComparableValue(a)) return { code: 'argument-not-comparable', message: `参数[${i}] 的类型是 ${a.type}，只有描述，无法判断两次调用是不是同一个值` };
  }
  return null;
}

function findReturnProblem(success: DecoderCapture[]): ValidationReason | null {
  for (const c of success) {
    const r = c.returnValue;
    if (!r) return { code: 'return-missing', message: '成功记录里没有返回值' };
    if (r.truncated) return { code: 'return-truncated', message: '返回值被截断，不是完整值' };
    if (!isComparableValue(r)) return { code: 'return-not-comparable', message: `返回值类型是 ${r.type}，只有描述，无法验证` };
  }
  return null;
}

// ── 脚本分析缓存（解析和静态特征都比较贵，按脚本内容缓存）──

export interface FunctionInfo {
  found: 'found' | 'not-found' | 'ambiguous';
  name: string | null;
  features: FunctionFeatures | null;
}

interface ScriptAnalysis {
  ast: File | null;
  error?: string;
  fns: Map<string, FunctionInfo>;
}

const analysisCache = new Map<string, ScriptAnalysis>();
// 同一脚本反复验证时（面板捕获期间每秒刷新），避免每次都对整份源码重新计算哈希：源码字符串相同就直接复用上次的键
const keyMemo = new Map<string, { source: string; key: string }>();

function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function analysisOf(script: ValidationScript): ScriptAnalysis {
  let memo = keyMemo.get(script.scriptId);
  if (!memo || memo.source !== script.source) {
    if (keyMemo.size >= CACHE_MAX * 2) {
      const oldestKey = keyMemo.keys().next().value;
      if (oldestKey !== undefined) keyMemo.delete(oldestKey);
    }
    memo = { source: script.source, key: script.scriptId + ':' + script.source.length + ':' + hashString(script.source) };
    keyMemo.set(script.scriptId, memo);
  }
  const key = memo.key;
  const cached = analysisCache.get(key);
  if (cached) return cached;
  let ast: File | null = null;
  let error: string | undefined;
  try {
    ast = parseCode(script.source);
  } catch (e: any) {
    error = e && e.message ? e.message : String(e);
  }
  const a: ScriptAnalysis = { ast, error, fns: new Map() };
  if (analysisCache.size >= CACHE_MAX) {
    const oldest = analysisCache.keys().next().value;
    if (oldest !== undefined) analysisCache.delete(oldest);
  }
  analysisCache.set(key, a);
  return a;
}

/** 供 dry-run 复用同一份解析结果；调用方不得修改返回的 AST */
export function getScriptAst(script: ValidationScript): { ast: File | null; error?: string } {
  const a = analysisOf(script);
  return { ast: a.ast, error: a.error };
}

export function getFunctionInfo(script: ValidationScript, entry: CdpPosition): FunctionInfo {
  const a = analysisOf(script);
  const k = entry.lineNumber + ':' + entry.columnNumber;
  const cached = a.fns.get(k);
  if (cached) return cached;
  let info: FunctionInfo;
  if (!a.ast) {
    info = { found: 'not-found', name: null, features: null };
  } else {
    const hits = findFunctionPathsByEntry(a.ast, entry);
    if (hits.length === 0) info = { found: 'not-found', name: null, features: null };
    else if (hits.length > 1) info = { found: 'ambiguous', name: null, features: null };
    else info = { found: 'found', name: resolveFunctionName(hits[0]), features: analyzeFunctionFeatures(hits[0]) };
  }
  a.fns.set(k, info);
  return info;
}

// ── 单次观测 ──

/**
 * 单次观测的严格静态安全检查：返回所有未能确认的条件，空数组表示全部确认。
 * 这里不接受任何放宽选项：位置映射不到唯一调用点、返回值不能表示为字面量、辅助函数无法解析等一律不通过。
 */
function checkSingleObservation(
  script: ValidationScript,
  rec: DecoderCapture,
  locs: CdpPosition[],
  info: FunctionInfo,
  warnings: ValidationReason[],
): ValidationReason[] {
  const fails: ValidationReason[] = [];
  const bad = (code: string, message: string): void => {
    fails.push({ code: 'single-obs:' + code, message });
  };
  if ((script.startLine ?? 0) !== 0 || (script.startColumn ?? 0) !== 0) {
    bad('script-identity', '脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证，脚本身份无法确认');
  }
  const rep = replacementOf(rec.returnValue);
  if ('error' in rep) bad('return-not-literal', rep.error.message);
  const { ast } = getScriptAst(script);
  if (!ast) {
    bad('ast-unavailable', '脚本源码无法解析为 AST，无法做静态分析');
    return fails;
  }
  if (locs.length !== 1) {
    bad('call-location', locs.length === 0 ? '没有可用的调用位置，无法绑定到源码中的调用点' : `有 ${locs.length} 个调用位置，单次观测只能对应一个调用点`);
  } else {
    const hits = findCallPathsAt(ast, locs[0]);
    if (hits.length !== 1) {
      bad('call-site', hits.length === 0 ? '调用位置映射不到任何 CallExpression' : `调用位置对应 ${hits.length} 个 CallExpression，无法唯一确定`);
    } else {
      const callee = hits[0].path.node.callee;
      if (hits[0].kind !== 'call-start' || callee.type !== 'Identifier' || callee.name !== rec.functionName) {
        bad('call-site', '调用位置对应的不是对解码函数的直接调用（别名、成员调用或其他形式），无法确认等价');
      }
    }
  }
  const fns = findFunctionPathsByEntry(ast, rec.functionLocation);
  if (info.found !== 'found' || fns.length !== 1) {
    bad('function-analysis', '无法唯一定位并静态分析解码函数');
    return fails;
  }
  const fn = fns[0];
  for (const m of outerMutableReads(fn).slice(0, 3)) bad('outer-mutable-state', m);
  const h: HelperReport = { analyzed: [], unresolved: [], blocking: [] };
  helperProblems(fn, MAX_HELPER_DEPTH, new Set<any>([fn.node]), h);
  if (h.blocking.length > 0) bad('helper-side-effects', `被调用的辅助函数存在副作用或外部依赖：${h.blocking.slice(0, 3).join('；')}`);
  if (h.unresolved.length > 0) bad('helper-unresolved', `辅助函数无法完整解析：${h.unresolved.slice(0, 3).join('；')}。单次观测不接受无法解析的辅助函数`);
  if (fails.length === 0 && h.analyzed.length > 0) warnings.push({ code: 'helpers-analyzed', message: `已静态分析的辅助函数：${h.analyzed.join(', ')}` });
  return fails;
}

// ── 分组判定 ──

function evaluateGroup(
  allRecs: DecoderCapture[],
  script: ValidationScript | undefined,
  minObs: number,
  captureActive: boolean,
  allowSingle: boolean,
): { group: GroupValidation; info: FunctionInfo | null } {
  // 手动求值被 V8 的 throwOnSideEffect 拒绝（origin 为 manual 且捕获失败）的记录，只表示「这个调用点无法安全求值」，
  // 不能把已有的自动观测拉成「成功与失败混合」。组里还有其他记录时，它们不参与判定（只加一条提示）；只剩它们时整组证据不足。
  const blockedManual = allRecs.filter((c) => c.origin === 'manual' && c.captureStatus !== 'success');
  const onlyBlocked = blockedManual.length > 0 && blockedManual.length === allRecs.length;
  const recs = blockedManual.length > 0 && !onlyBlocked ? allRecs.filter((c) => !blockedManual.includes(c)) : allRecs;
  const first = recs[0];
  const success = recs.filter((c) => c.captureStatus === 'success').sort((a, b) => a.firstSeq - b.firstSeq);
  const failedRecs = recs.filter((c) => c.captureStatus !== 'success');
  const reasons: ValidationReason[] = [];
  const warnings: ValidationReason[] = [];
  // 手动求值（origin: 'manual'）是在用户暂停的帧里重新执行一次调用，不是原调用当时的返回值，也不是独立观测：
  // 有自动观测时只数自动观测；只有手动记录时，无论求值多少个调用点都只算 1 次观测，不能叠加成多次一致观测去绕过单次观测的严格静态检查。
  // 同参数不同值的冲突判定（distinct）仍然包含手动记录。
  const autoObservations = success.filter((c) => c.origin !== 'manual').reduce((s, c) => s + c.count, 0);
  const observations = autoObservations > 0 ? autoObservations : success.length > 0 ? 1 : 0;
  const failedObservations = failedRecs.reduce((s, c) => s + c.count, 0);
  if (blockedManual.length > 0 && !onlyBlocked) {
    warnings.push({ code: 'manual-evaluation-blocked', message: `有 ${blockedManual.length} 个调用点的手动求值被 V8 的 throwOnSideEffect 拒绝：这些调用点没有证据，不参与判定，也不会被替换` });
  }
  const distinct = new Set(success.map((c) => JSON.stringify(c.returnValue))).size;

  const locs: CdpPosition[] = [];
  for (const c of recs) {
    const list = c.callLocations ?? (c.callLocation.lineNumber >= 0 ? [c.callLocation] : []);
    for (const p of list) {
      if (!locs.some((q) => q.lineNumber === p.lineNumber && q.columnNumber === p.columnNumber)) locs.push({ lineNumber: p.lineNumber, columnNumber: p.columnNumber });
    }
  }
  const truncated = recs.some((c) => c.callLocationsTruncated === true);
  if (truncated) warnings.push({ code: 'call-locations-truncated', message: '调用位置列表被截断：只列出了已记录的位置，不代表这是全部调用点' });
  if (script && ((script.startLine ?? 0) !== 0 || (script.startColumn ?? 0) !== 0)) {
    warnings.push({ code: 'script-offset', message: '脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证，不会进入可替换候选' });
  }

  const info = script && success.length > 0 ? getFunctionInfo(script, first.functionLocation) : null;
  const blocking = info?.features?.blocking ?? [];
  let status: ValidationStatus;
  let evidence: GroupValidation['evidence'] = 'none';

  if (!script) {
    status = 'failed';
    reasons.push({ code: 'stale-script', message: `脚本 ${first.scriptId} 不在当前脚本集合中（页面已刷新或脚本已被替换），这条旧记录不参与验证` });
  } else if (onlyBlocked) {
    status = 'insufficient';
    const why = Array.from(new Set(blockedManual.map((c) => c.reason ?? 'side-effect-blocked'))).slice(0, 3).join('; ');
    reasons.push({ code: 'side-effect-blocked', message: `手动求值被 V8 的 throwOnSideEffect 拒绝（可能有副作用），没有任何可用的观测：${why}。证据不足，不会进入替换候选` });
  } else if (success.length === 0) {
    status = 'failed';
    const why = Array.from(new Set(failedRecs.map((c) => c.reason ?? 'unknown'))).slice(0, 3).join('；');
    reasons.push({ code: 'capture-failed', message: `没有任何一次成功捕获：${why}` });
  } else {
    const fi = info as FunctionInfo;
    const argProblem = findArgumentProblem(first.arguments);
    const retProblem = findReturnProblem(success);
    if (argProblem) {
      status = 'failed';
      reasons.push(argProblem);
    } else if (retProblem) {
      status = 'failed';
      reasons.push(retProblem);
    } else if (fi.found === 'not-found') {
      status = 'failed';
      reasons.push({ code: 'function-not-found', message: '当前脚本源码里找不到入口位置对应的函数：脚本内容可能已变化，或位置不是这个脚本的' });
    } else if (fi.found === 'ambiguous') {
      status = 'insufficient';
      reasons.push({ code: 'function-ambiguous', message: '入口位置对应多个函数，无法确定捕获的是哪一个' });
    } else if (fi.name !== first.functionName) {
      status = 'failed';
      reasons.push({ code: 'function-identity-mismatch', message: `记录里的函数名是 ${first.functionName}，源码该位置的函数是 ${fi.name ?? '(匿名)'}：可能捕获到了别的函数` });
    } else if (distinct > 1) {
      status = 'unstable';
      const samples = success.slice(0, SAMPLE_LIMIT).map((c) => `${fmtValue(c.returnValue)}×${c.count}`).join('、');
      reasons.push({ code: 'same-args-different-returns', message: `同一组参数出现 ${distinct} 个不同返回值：${samples}。原因未确定（可能是状态、时间或随机依赖，也可能是数组旋转前后），不能直接用于替换` });
      for (const f of blocking.slice(0, 3)) reasons.push({ code: 'hint:' + f.category, message: `静态线索（仅供参考）：${f.message}` });
      const latest = success.reduce((a, b) => (b.lastSeq > a.lastSeq ? b : a));
      const othersLast = Math.max(...success.filter((c) => c !== latest).map((c) => c.lastSeq));
      if (latest.firstSeq > othersLast && latest.count >= 2) {
        warnings.push({ code: 'settled-tail', message: `最近 ${latest.count} 次观测都返回 ${fmtValue(latest.returnValue)}，此前出现过其他值：可能是状态变化后稳定，但不能据此认定为稳定映射` });
      }
    } else if (blocking.length > 0) {
      status = 'unstable';
      reasons.push({ code: 'dependency-suspected', message: `同参数的观测值一致，但静态检查发现：${blocking.slice(0, 3).map((f) => f.message).join('；')}。无法确认输出只取决于参数，按不稳定处理` });
    } else if (failedRecs.length > 0) {
      status = 'insufficient';
      reasons.push({ code: 'mixed-success-and-failed', message: `同参数既有成功观测（${observations} 次）也有失败捕获（${failedObservations} 次）：无法区分是函数行为还是捕获过程的问题` });
    } else if (observations < minObs || (allowSingle && observations === 1)) {
      const fails = allowSingle && observations === 1 ? checkSingleObservation(script, success[0], locs, fi, warnings) : null;
      if (fails && fails.length === 0) {
        status = 'verified';
        evidence = 'single-observation';
        reasons.push({ code: 'single-observation-verified', message: `【单次观测】只观测到 1 次，没有多次一致观测作为佐证；以下条件已全部确认：调用位置唯一对应一个 CallExpression，参数完整，返回值完整且可表示为字面量，解码函数可被静态分析且辅助函数已完整解析，未发现状态、时间、随机或函数外可变状态依赖，同参数无冲突，脚本身份无偏移。这不等于多次观测验证：静态分析看不到的别名式修改（例如旋转函数通过别名改写字符串数组）无法排除。` });
      } else {
        status = allowSingle ? 'insufficient' : captureActive ? 'pending' : 'insufficient';
        reasons.push({ code: 'too-few-observations', message: `同参数只观测到 ${observations} 次，需要至少 ${minObs} 次一致观测${captureActive && !allowSingle ? '（捕获仍在进行，可能还会有新观测）' : ''}` });
        if (fails) reasons.push({ code: 'single-observation-rejected', message: '【单次观测】只有 1 次观测，且未通过严格静态安全检查，按证据不足处理。未能确认的条件如下：' });
        for (const f of fails ?? []) reasons.push(f);
      }
    } else if (locs.length === 0) {
      status = 'insufficient';
      reasons.push({ code: 'call-location-unknown', message: '没有可用的调用位置（调用方栈帧缺失），无法绑定到源码中的调用点' });
    } else {
      status = 'verified';
      evidence = observations > 1 ? 'multiple-observations' : 'single-observation';
      reasons.push({ code: 'consistent-observations', message: `同参数 ${observations} 次观测均返回同一值，数据完整，静态检查未发现时间、随机或外部状态写入` });
    }
  }

  const group: GroupValidation = {
    id: groupKey(first),
    functionId: functionKey(first),
    scriptId: first.scriptId,
    scriptUrl: first.scriptUrl,
    functionName: first.functionName,
    functionLocation: first.functionLocation,
    arguments: first.arguments,
    status,
    reasons,
    warnings,
    observations,
    failedObservations,
    distinctReturns: distinct,
    conflict: distinct > 1,
    returnSamples: success.slice(0, SAMPLE_LIMIT).map((c) => ({ value: c.returnValue as RuntimeValue, count: c.count, firstSeq: c.firstSeq, lastSeq: c.lastSeq })),
    callLocations: locs,
    callLocationsTruncated: truncated,
    lastCapturedAt: Math.max(...recs.map((c) => c.timestamp)),
    captureKeys: allRecs.map((c) => c.key),
    functionSuspect: false,
    evidence,
  };
  return { group, info };
}

function emptyCounts(): Record<ValidationStatus, number> {
  return { pending: 0, verified: 0, unstable: 0, failed: 0, insufficient: 0 };
}

/**
 * 验证一批捕获记录。scripts 是「当前」脚本集合：记录里的 scriptId 不在其中，视为过期（页面刷新后的旧记录）。
 * 纯函数：不修改 captures、scripts，也不执行任何目标代码。
 */
export function validateCaptures(captures: DecoderCapture[], scripts: ValidationScript[], options: ValidationOptions = {}): ValidationReport {
  const minObs = Math.max(1, options.minObservations ?? DEFAULT_MIN_OBSERVATIONS);
  const byId = new Map(scripts.map((s) => [s.scriptId, s] as const));
  const buckets = new Map<string, DecoderCapture[]>();
  for (const c of captures) {
    const k = groupKey(c);
    const arr = buckets.get(k);
    if (arr) arr.push(c);
    else buckets.set(k, [c]);
  }

  const groups: GroupValidation[] = [];
  const infos = new Map<string, FunctionInfo | null>();
  for (const recs of buckets.values()) {
    const { group, info } = evaluateGroup(recs, byId.get(recs[0].scriptId), minObs, !!options.captureActive, options.allowSingleObservation !== false);
    groups.push(group);
    if (!infos.has(group.functionId) || (infos.get(group.functionId) === null && info)) infos.set(group.functionId, info);
  }

  const byFn = new Map<string, GroupValidation[]>();
  for (const g of groups) {
    const arr = byFn.get(g.functionId);
    if (arr) arr.push(g);
    else byFn.set(g.functionId, [g]);
  }

  const functions: FunctionValidation[] = [];
  for (const [fid, gs] of byFn) {
    const info = infos.get(fid) ?? null;
    const blocking = info?.features?.blocking ?? [];
    const conflicted = gs.filter((g) => g.conflict);
    const suspect = conflicted.length > 0 || blocking.length > 0;
    const reasons: ValidationReason[] = [];
    if (conflicted.length > 0) reasons.push({ code: 'function-has-conflict', message: `${conflicted.length} 组参数出现同参不同值：该函数的输出可能依赖运行状态（原因未确定）` });
    for (const f of blocking.slice(0, 3)) reasons.push({ code: 'function-feature:' + f.category, message: f.message });
    if (suspect) {
      for (const g of gs) {
        g.functionSuspect = true;
        g.warnings.push({ code: 'function-suspect', message: '同一函数存在冲突或静态特征存疑：该函数的映射不会进入可替换候选' });
      }
    }
    const counts = emptyCounts();
    for (const g of gs) counts[g.status]++;
    const g0 = gs[0];
    functions.push({
      id: fid,
      scriptId: g0.scriptId,
      scriptUrl: g0.scriptUrl,
      functionName: g0.functionName,
      functionLocation: g0.functionLocation,
      groupCount: gs.length,
      statusCounts: counts,
      suspect,
      reasons,
      notes: (info?.features?.notes ?? []).map((f) => f.message),
    });
  }

  groups.sort((a, b) => (a.functionName < b.functionName ? -1 : a.functionName > b.functionName ? 1 : (a.returnSamples[0]?.firstSeq ?? 0) - (b.returnSamples[0]?.firstSeq ?? 0)));
  const byStatus = emptyCounts();
  for (const g of groups) byStatus[g.status]++;
  return { groups, functions, summary: { groups: groups.length, byStatus, suspectFunctions: functions.filter((f) => f.suspect).length } };
}
