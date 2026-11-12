/**
 * Phase 3.2：AST 替换前的 dry-run（只检查，不替换，不修改 AST 和源码）
 *
 * 输入验证报告（capture-validation）和当前脚本集合，对每个 verified 映射的每个已知调用位置做安全检查，
 * 输出「可替换候选」和「拒绝项（含原因）」。任何一项不能确认的检查都算拒绝。
 *
 * 逐调用点检查：
 *   1. 位置能唯一对应一个 CallExpression（不按调用文本匹配）
 *   2. 被调用者是 Identifier，名字与记录一致，且作用域绑定解析到被捕获的那个函数（排除同名遮蔽）
 *   3. 函数名没有在外部被重新赋值
 *   4. 源码里的实参全是字面量，且与运行时捕获到的参数逐个一致（排除动态参数、参数错配）
 *   5. 返回值能安全表示为 StringLiteral / NumericLiteral / BooleanLiteral
 *   6. 替换位置的父节点不是 new 的 callee 或模板标签
 *   7. 函数调用的脚本内辅助函数能解析并通过静态检查（默认解析不了就拒绝）
 *
 * 已知限制：旧的 MappingManager / call-transformer 按调用文本替换，会替换同文本的所有调用。
 * 本模块把这类风险记录在 textKeyConflicts 里；Phase 4 必须按位置替换，不能按文本。
 */
import _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { CdpPosition } from './capture-plan.js';
import type { RuntimeValue } from '../extension/debugger/capture-engine.js';
import { findCallPathsAt, findFunctionPathsByEntry } from './ast-locate.js';
import { analyzeFunctionFeatures } from './function-features.js';
import { fmtValue, getScriptAst, type GroupValidation, type ValidationReason, type ValidationReport, type ValidationScript, type ValidationStatus } from './capture-validation.js';
import { tryStaticEval } from './deterministic.js';
import { MAX_HELPER_DEPTH, functionOfBinding, helperProblems, reassignedOutside, replacementOf, replacementParentProblem, type HelperReport } from './replacement-safety.js';

import { sha256 } from './hash-utils.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

export interface DryRunOptions {
  /** 被调用的脚本内辅助函数无法解析为函数体时是否拒绝，默认 true（不确定就拒绝） */
  rejectUnresolvedHelpers?: boolean;
}

export type ReplacementNodeType = 'StringLiteral' | 'NumericLiteral' | 'BooleanLiteral' | 'NullLiteral';

export interface SameTextCall {
  /** Babel 位置：行从 1 开始，列从 0 开始 */
  line: number;
  column: number;
  /** 这个位置是否在已捕获的调用位置里 */
  observed: boolean;
  /** 它的被调用者是否解析到同一个函数 */
  sameBinding: boolean;
}

export interface ReplacementCandidate {
  groupId: string;
  functionName: string;
  scriptId: string;
  scriptUrl: string;
  /** 脚本源码的 SHA-256 哈希（十六进制，64 字符），用于版本校验 */
  scriptHash: string;
  /** CDP 位置，行列从 0 开始 */
  position: CdpPosition;
  start: number;
  end: number;
  callText: string;
  before: 'CallExpression';
  after: ReplacementNodeType;
  /** 替换后的源码文本 */
  replacement: string;
  value: string | number | boolean | null;
  parentType: string;
  observations: number;
  notes: ValidationReason[];
  /** 同文本但没有证据支持的其他调用：按文本替换会误伤它们，Phase 4 必须按位置替换 */
  textKeyConflicts: SameTextCall[];
  /** 该组调用位置列表是否被截断（来自 Phase 3.2 的 GroupValidation）。dry-run 已整组拒绝截断的组，进入候选的恒为 false；保留该字段是为了让替换引擎能独立复核，而不是依赖调用方一定过滤过 */
  callLocationsTruncated: boolean;
}

export interface ReplacementRejection {
  groupId: string;
  functionName: string;
  scriptId: string;
  status: ValidationStatus;
  /** null 表示整组被拒绝（还没到逐个调用点） */
  position: CdpPosition | null;
  reasons: ValidationReason[];
}

export interface DryRunResult {
  candidates: ReplacementCandidate[];
  rejections: ReplacementRejection[];
  summary: { candidates: number; rejections: number; byReason: Record<string, number> };
}

type ArgCheck = { ok: true } | { ok: false; code: 'dynamic-arguments' | 'argument-mismatch'; message: string };

const STATIC_TYPES = ['string', 'number', 'boolean', 'null', 'undefined'];

function showStatic(v: unknown): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

/** 源码里第 i 个实参必须是字面量，并且与运行时捕获到的第 i 个参数一致 */
function checkArg(node: t.Node | undefined, rt: RuntimeValue, i: number): ArgCheck {
  let sv: unknown;
  let st: string;
  if (node === undefined) {
    sv = undefined;
    st = 'undefined';
  } else {
    const r = t.isSpreadElement(node) ? null : tryStaticEval(node);
    if (!r) return { ok: false, code: 'dynamic-arguments', message: `参数[${i}] 不是字面量（${node.type}）：同一调用点在别的运行状态下参数可能不同，不能固定替换` };
    sv = r.value;
    st = sv === null ? 'null' : typeof sv;
    if (!STATIC_TYPES.includes(st)) return { ok: false, code: 'dynamic-arguments', message: `参数[${i}] 的静态值类型是 ${st}，不支持` };
  }
  const rv = rt.type === 'undefined' ? undefined : rt.type === 'null' ? null : rt.value;
  if (rt.type !== st || !Object.is(rv, sv)) {
    return { ok: false, code: 'argument-mismatch', message: `参数[${i}] 在源码里是 ${showStatic(sv)}，运行时捕获到 ${fmtValue(rt)}：参数与调用点不匹配，记录可能绑错了调用点` };
  }
  return { ok: true };
}

interface CallEntry {
  node: t.CallExpression;
  path: NodePath<t.CallExpression>;
  line: number;
  column: number;
}

/** 只收集「被调用者是 names 里的 Identifier」的调用，按调用文本分组 */
function buildTextIndex(ast: File, source: string, names: Set<string>): Map<string, CallEntry[]> {
  const idx = new Map<string, CallEntry[]>();
  traverse(ast, {
    CallExpression(path) {
      const n = path.node;
      if (!t.isIdentifier(n.callee) || !names.has(n.callee.name) || n.start == null || n.end == null || !n.loc) return;
      const text = source.slice(n.start, n.end);
      const entry: CallEntry = { node: n, path, line: n.loc.start.line, column: n.loc.start.column };
      const arr = idx.get(text);
      if (arr) arr.push(entry);
      else idx.set(text, [entry]);
    },
  });
  return idx;
}

export async function dryRunReplacements(report: ValidationReport, scripts: ValidationScript[], options: DryRunOptions = {}): Promise<DryRunResult> {
  const rejectUnresolved = options.rejectUnresolvedHelpers !== false;
  const byId = new Map(scripts.map((s) => [s.scriptId, s] as const));
  
  // Phase 4: 为每个脚本计算 SHA-256 哈希（scriptId + scriptHash 双重校验）
  const scriptHashes = new Map<string, string>();
  for (const script of scripts) {
    const hash = await sha256(script.source);
    scriptHashes.set(script.scriptId, hash);
  }
  
  const candidates: ReplacementCandidate[] = [];
  const rejections: ReplacementRejection[] = [];

  const reject = (g: GroupValidation, position: CdpPosition | null, reasons: ValidationReason[]): void => {
    rejections.push({ groupId: g.id, functionName: g.functionName, scriptId: g.scriptId, status: g.status, position, reasons });
  };

  const namesByScript = new Map<string, Set<string>>();
  for (const g of report.groups) {
    if (g.status !== 'verified') continue;
    const set = namesByScript.get(g.scriptId);
    if (set) set.add(g.functionName);
    else namesByScript.set(g.scriptId, new Set([g.functionName]));
  }
  const textIndexes = new Map<string, Map<string, CallEntry[]>>();

  for (const g of report.groups) {
    if (g.status !== 'verified') {
      reject(g, null, [{ code: 'status-' + g.status, message: `验证状态是 ${g.status}，不是 verified，不进入替换候选` }, ...g.reasons]);
      continue;
    }
    if (g.functionSuspect) {
      reject(g, null, [{ code: 'function-suspect', message: '同一函数存在冲突或静态特征存疑，该函数的映射一律不进入替换候选' }]);
      continue;
    }
    if (g.warnings.some((w) => w.code === 'script-offset')) {
      reject(g, null, [{ code: 'script-offset', message: '脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证' }]);
      continue;
    }
    const script = byId.get(g.scriptId);
    if (!script) {
      reject(g, null, [{ code: 'stale-script', message: `脚本 ${g.scriptId} 不在当前脚本集合中` }]);
      continue;
    }
    const rep = replacementOf(g.returnSamples[0]?.value);
    if ('error' in rep) {
      reject(g, null, [rep.error]);
      continue;
    }
    const { ast } = getScriptAst(script);
    if (!ast) {
      reject(g, null, [{ code: 'ast-unavailable', message: '脚本源码无法解析为 AST' }]);
      continue;
    }
    const fns = findFunctionPathsByEntry(ast, g.functionLocation);
    if (fns.length !== 1) {
      reject(g, null, [{ code: 'function-not-unique', message: `入口位置对应 ${fns.length} 个函数，无法确定捕获的是哪一个` }]);
      continue;
    }
    const fnPath = fns[0];

    const feats = analyzeFunctionFeatures(fnPath);
    const helpers: HelperReport = { analyzed: [], unresolved: [], blocking: [] };
    helperProblems(fnPath, MAX_HELPER_DEPTH, new Set<t.Node>([fnPath.node]), helpers);
    if (helpers.blocking.length > 0) {
      reject(g, null, [{ code: 'helper-side-effects', message: `被调用的辅助函数存在副作用或外部依赖：${helpers.blocking.slice(0, 3).join('；')}` }]);
      continue;
    }
    if (helpers.unresolved.length > 0 && rejectUnresolved) {
      reject(g, null, [{ code: 'unanalyzed-helper', message: `无法确认辅助函数的副作用：${helpers.unresolved.slice(0, 3).join('；')}。无法确认安全就不进入替换候选` }]);
      continue;
    }
    if (g.callLocations.length === 0) {
      reject(g, null, [{ code: 'no-call-location', message: '没有已知调用位置，无法定位要替换的节点' }]);
      continue;
    }
    // Phase 4 补充约束 3: callLocationsTruncated 保守策略
    if (g.callLocationsTruncated) {
      reject(g, null, [{ code: 'location-list-truncated', message: '该函数的调用位置列表被截断（超过上限），无法确认所有调用点，整组拒绝' }]);
      continue;
    }

    const scriptHash = scriptHashes.get(g.scriptId);
    if (!scriptHash) {
      reject(g, null, [{ code: 'script-hash-unavailable', message: '脚本哈希计算失败' }]);
      continue;
    }

    let textIndex = textIndexes.get(g.scriptId);
    if (!textIndex) {
      textIndex = buildTextIndex(ast, script.source, namesByScript.get(g.scriptId) ?? new Set<string>());
      textIndexes.set(g.scriptId, textIndex);
    }

    for (const loc of g.callLocations) {
      const hits = findCallPathsAt(ast, loc);
      if (hits.length === 0) {
        reject(g, loc, [{ code: 'call-site-not-found', message: `源码 ${loc.lineNumber + 1}:${loc.columnNumber} 处没有调用表达式：位置无法映射到 AST 节点（脚本内容可能已变化）` }]);
        continue;
      }
      if (hits.length > 1) {
        reject(g, loc, [{ code: 'call-site-ambiguous', message: `源码 ${loc.lineNumber + 1}:${loc.columnNumber} 处对应 ${hits.length} 个调用表达式，无法唯一确定` }]);
        continue;
      }
      const { path, kind } = hits[0];
      const node = path.node;
      if (kind !== 'call-start') {
        reject(g, loc, [{ code: 'member-call-unverified', message: '这是 obj.fn() 形式的成员调用：无法确认 obj 就是持有被捕获函数的对象，不进入替换候选' }]);
        continue;
      }
      const callee = node.callee;
      if (!t.isIdentifier(callee)) {
        reject(g, loc, [{ code: 'callee-not-identifier', message: `被调用者是 ${callee.type}，不是普通标识符，不进入替换候选` }]);
        continue;
      }
      if (callee.name !== g.functionName) {
        reject(g, loc, [{ code: 'callee-name-mismatch', message: `这里调用的是 ${callee.name}，记录里的解码函数是 ${g.functionName}（可能是别名或包装函数），不能确认两者等价` }]);
        continue;
      }
      const binding = path.scope.getBinding(callee.name);
      const target = functionOfBinding(binding);
      if (!binding || !target) {
        reject(g, loc, [{ code: 'callee-binding-unresolved', message: `${callee.name} 在该调用点的作用域里无法解析为函数声明` }]);
        continue;
      }
      if (target.node !== fnPath.node) {
        reject(g, loc, [{ code: 'callee-binding-mismatch', message: `${callee.name} 在该调用点解析到另一个同名函数，不是被捕获的那个` }]);
        continue;
      }
      if (reassignedOutside(binding, target)) {
        reject(g, loc, [{ code: 'binding-reassigned', message: `${callee.name} 在函数外部被重新赋值或重复声明，运行时指向的函数可能变化` }]);
        continue;
      }
      if (node.arguments.length > g.arguments.length) {
        reject(g, loc, [{ code: 'extra-arguments', message: `调用传了 ${node.arguments.length} 个参数，函数只有 ${g.arguments.length} 个形参：多出的参数可能通过 arguments 被读取，无法验证` }]);
        continue;
      }
      let bad: Extract<ArgCheck, { ok: false }> | null = null;
      for (let i = 0; i < g.arguments.length && !bad; i++) {
        const r = checkArg(node.arguments[i], g.arguments[i], i);
        if (!r.ok) bad = r;
      }
      if (bad) {
        reject(g, loc, [{ code: bad.code, message: bad.message }]);
        continue;
      }
      const parent = path.parent;
      const parentProblem = replacementParentProblem(node, parent, rep.value);
      if (parentProblem) {
        reject(g, loc, [parentProblem]);
        continue;
      }

      const callText = script.source.slice(node.start as number, node.end as number);
      const others = (textIndex.get(callText) ?? []).filter((o) => o.node !== node);
      const conflicts: SameTextCall[] = others
        .map((o) => {
          const observed = g.callLocations.some((l) => l.lineNumber + 1 === o.line && l.columnNumber === o.column);
          const ob = functionOfBinding(o.path.scope.getBinding((o.node.callee as t.Identifier).name));
          return { line: o.line, column: o.column, observed, sameBinding: !!ob && ob.node === fnPath.node };
        })
        .filter((c) => !c.observed || !c.sameBinding);

      const notes: ValidationReason[] = [];
      if (conflicts.length > 0) notes.push({ code: 'text-keyed-replacement-unsafe', message: `还有 ${conflicts.length} 处同文本调用没有证据支持（未观测，或绑定到别的函数）：按调用文本替换会误伤它们，必须按位置替换` });
      if (helpers.analyzed.length > 0) notes.push({ code: 'helpers-analyzed', message: `已静态分析的辅助函数：${helpers.analyzed.join(', ')}` });
      if (helpers.unresolved.length > 0) notes.push({ code: 'helpers-unresolved', message: `未能分析的辅助函数（已按选项放行）：${helpers.unresolved.join('；')}` });
      if (feats.notes.some((f) => f.category === 'self-memoization')) notes.push({ code: 'removes-self-memoization', message: '函数内有对自身的缓存写入：替换后这些写入不再发生，若缓存在别处被读取需人工确认' });

      candidates.push({
        groupId: g.id,
        functionName: g.functionName,
        scriptId: g.scriptId,
        scriptUrl: g.scriptUrl,
        scriptHash,
        position: { lineNumber: loc.lineNumber, columnNumber: loc.columnNumber },
        start: node.start as number,
        end: node.end as number,
        callText,
        before: 'CallExpression',
        after: rep.type,
        replacement: rep.text,
        value: rep.value,
        parentType: parent.type,
        observations: g.observations,
        notes,
        textKeyConflicts: conflicts,
        callLocationsTruncated: g.callLocationsTruncated,
      });
    }
  }

  const byReason: Record<string, number> = {};
  for (const r of rejections) {
    const code = r.reasons[0]?.code ?? 'unknown';
    byReason[code] = (byReason[code] ?? 0) + 1;
  }
  return { candidates, rejections, summary: { candidates: candidates.length, rejections: rejections.length, byReason } };
}
