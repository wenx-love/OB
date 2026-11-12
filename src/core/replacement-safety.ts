import type { Binding, NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { RuntimeValue } from '../extension/debugger/capture-engine.js';
import { analyzeFunctionFeatures, MUTATING_METHODS } from './function-features.js';

/**
 * Phase 3.2：替换安全检查的共享部分（只读 AST 分析，不执行任何代码）。
 * capture-validation（单次观测的严格检查）和 replacement-dryrun（逐调用点 dry-run）共用，
 * 保证两处对辅助函数能否解析、返回值能否表示为字面量的判断一致。
 */

export const MAX_HELPER_DEPTH = 3;

export function fmtValue(v: RuntimeValue | undefined): string {
  if (!v) return '(无)';
  if (v.type === 'undefined') return 'undefined';
  if (v.type === 'null') return 'null';
  if (v.type === 'string') {
    const s = String(v.value ?? '');
    return JSON.stringify(s.length > 40 ? s.slice(0, 40) + '…' : s);
  }
  if (v.unserializable) return v.unserializable;
  if (v.value !== undefined) return String(v.value);
  return v.description ?? v.type;
}

export type LiteralNodeType = 'StringLiteral' | 'NumericLiteral' | 'BooleanLiteral' | 'NullLiteral';

export type Replacement =
  | { type: LiteralNodeType; value: string | number | boolean | null; text: string }
  | { error: { code: string; message: string } };

/** 返回值能否安全表示为字面量：支持字符串、非负有限数字、布尔值和 null */
export function replacementOf(v: RuntimeValue | undefined): Replacement {
  if (v && v.type === 'string' && typeof v.value === 'string' && !v.truncated) return { type: 'StringLiteral', value: v.value, text: JSON.stringify(v.value) };
  if (v && v.type === 'number' && typeof v.value === 'number' && Number.isFinite(v.value) && v.value >= 0 && !Object.is(v.value, -0)) return { type: 'NumericLiteral', value: v.value, text: String(v.value) };
  if (v && v.type === 'boolean' && typeof v.value === 'boolean') return { type: 'BooleanLiteral', value: v.value, text: String(v.value) };
  if (v && v.type === 'null') return { type: 'NullLiteral', value: null, text: 'null' };
  return { error: { code: 'unsupported-return-value', message: `返回值 ${fmtValue(v)}（${v ? v.type : '无'}）不能安全表示为字面量：当前只支持字符串、非负有限数字、布尔值和 null` } };
}

/**
 * 把调用表达式换成字面量前，对父节点做语义检查。dry-run 与替换引擎共用：替换引擎不信任候选自带的 parentType，以 AST 里实际的父节点为准。
 * 1. new 的 callee、模板标签：换成字面量会改变语义。
 * 2. 表达式语句里的 'use strict' / 'use asm'：字符串语句位于函数或脚本开头时会被解析成指令序言，函数会悄悄变成严格模式。
 *    替换后的整体解析只在少数情况（例如非简单参数列表）才会报错，拦不住。这里不看位置，一律拒绝：位置取决于其他候选是否也被替换，宁可少替换。
 * 其他字符串变成指令序言在 ECMAScript 里没有语义效果，不拦截。这是已知指令的拒绝名单，不是对所有宿主或工具私有指令的保证。
 */
const SEMANTIC_DIRECTIVES = new Set(['use strict', 'use asm']);

export function replacementParentProblem(node: t.Node, parent: t.Node, value: unknown): { code: string; message: string } | null {
  if ((t.isNewExpression(parent) && parent.callee === node) || (t.isTaggedTemplateExpression(parent) && parent.tag === node)) {
    return { code: 'unexpected-parent', message: `父节点是 ${parent.type}，替换为字面量会改变语义` };
  }
  if (t.isExpressionStatement(parent) && typeof value === 'string' && SEMANTIC_DIRECTIVES.has(value)) {
    return { code: 'unexpected-parent', message: `字符串 ${JSON.stringify(value)} 替换到表达式语句位置会变成指令序言（directive），可能让整个函数或脚本改变严格模式等语义，而替换后的整体解析校验拦不住` };
  }
  return null;
}

/** 候选的 value 应当对应的字面量文本，公式与 replacementOf 一致：字符串用 JSON.stringify，数字和布尔值用 String，null 为 'null'。不是 string、有限非负数字、boolean、null 时返回 null。替换引擎用它核对候选的 replacement 与 value 是否一致（候选是普通对象，经 postMessage 传递，没有不可变保证） */
export function literalTextOf(value: unknown): string | null {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && !Object.is(value, -0) ? String(value) : null;
  if (typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return null;
}

export function functionOfBinding(binding: Binding | undefined): NodePath<t.Function> | null {
  if (!binding) return null;
  const p: NodePath<any> = binding.path;
  if (p.isFunctionDeclaration()) return p as NodePath<t.Function>;
  if (p.isVariableDeclarator()) {
    const init = p.get('init') as NodePath<any>;
    if (init && init.node && init.isFunction()) return init as NodePath<t.Function>;
  }
  return null;
}

/** 名字在函数外部被重新赋值或重复声明（函数内部给自己赋值的缓存写法不算） */
export function reassignedOutside(binding: Binding, fn: NodePath<t.Function>): boolean {
  return binding.constantViolations.some((v) => !v.findParent((p) => p.node === fn.node));
}

export interface HelperReport {
  analyzed: string[];
  unresolved: string[];
  blocking: string[];
}

export function helperProblems(fn: NodePath<t.Function>, depth: number, seen: Set<t.Node>, out: HelperReport): void {
  const feats = analyzeFunctionFeatures(fn);
  for (const name of feats.calledUnboundFunctions) out.unresolved.push(`${name}（未声明的全局函数，无法分析其行为）`);
  for (const name of feats.calledScriptFunctions) {
    const binding = fn.scope.getBinding(name);
    const hp = functionOfBinding(binding);
    if (!binding || !hp) {
      out.unresolved.push(`${name}（无法解析为函数声明）`);
      continue;
    }
    if (reassignedOutside(binding, hp)) {
      out.unresolved.push(`${name}（在函数外被重新赋值）`);
      continue;
    }
    if (seen.has(hp.node)) continue;
    seen.add(hp.node);
    const hf = analyzeFunctionFeatures(hp);
    if (hf.blocking.length > 0) {
      out.blocking.push(`${name}：${hf.blocking[0].message}`);
      continue;
    }
    out.analyzed.push(name);
    if (hf.calledScriptFunctions.length > 0 || hf.calledUnboundFunctions.length > 0) {
      if (depth > 1) helperProblems(hp, depth - 1, seen, out);
      else out.unresolved.push(`${name}（内部调用超出分析深度 ${MAX_HELPER_DEPTH}）`);
    }
  }
}

function insideFn(p: NodePath<any>, fn: NodePath<t.Function>): boolean {
  for (let c: NodePath<any> | null = p; c; c = c.parentPath) {
    if (c.node === fn.node) return true;
  }
  return false;
}

/**
 * 函数读取了、但在函数外部被修改的外部变量（可识别的可变外部状态）。
 * 识别范围：在函数外被重新赋值；在函数外被当作对象修改（属性赋值、自增自减、delete、push/shift 等修改方法）。
 * 函数自己给自己的属性写缓存、自己给自己重新赋值（OB 解码器常见）不算。
 * 局限：只能看到直接修改。通过别名修改（例如旋转函数拿到数组后在别处 push/shift）识别不了。
 */
export function outerMutableReads(fn: NodePath<t.Function>): string[] {
  const found = new Map<string, string>();
  const checked = new Set<string>();
  fn.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (checked.has(name)) return;
      checked.add(name);
      const b = p.scope.getBinding(name);
      if (!b || insideFn(b.scope.path, fn)) return;
      const owner = functionOfBinding(b);
      const exempt = (x: NodePath<any>): boolean => insideFn(x, fn) || (owner !== null && insideFn(x, owner));
      for (const v of b.constantViolations) {
        if (!exempt(v)) {
          found.set(name, `外部变量 ${name} 在函数外被重新赋值`);
          return;
        }
      }
      for (const ref of b.referencePaths) {
        if (exempt(ref)) continue;
        const m = ref.parentPath;
        if (!m || !(m.isMemberExpression() || m.isOptionalMemberExpression()) || (m.node as any).object !== ref.node) continue;
        const g = m.parentPath;
        if (!g) continue;
        let how: string | null = null;
        if (g.isAssignmentExpression() && g.node.left === m.node) how = '属性赋值';
        else if (g.isUpdateExpression()) how = '自增自减';
        else if (g.isUnaryExpression({ operator: 'delete' })) how = 'delete';
        else if (g.isCallExpression() && g.node.callee === m.node) {
          const mm = m.node as any;
          const prop = mm.computed ? (t.isStringLiteral(mm.property) ? mm.property.value : null) : (t.isIdentifier(mm.property) ? mm.property.name : null);
          if (prop && MUTATING_METHODS.has(prop)) how = `调用 .${prop}()`;
        }
        if (how) {
          found.set(name, `外部变量 ${name} 在函数外被修改（${how}）`);
          return;
        }
      }
    },
  });
  return Array.from(found.values());
}
