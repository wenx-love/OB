import type { NodePath, Binding } from '@babel/traverse';
import * as t from '@babel/types';

/**
 * Phase 3.2：函数静态特征（只读 AST 分析，不执行任何代码）。
 *
 * 用途：给「同参数不同返回值」提供线索，并在观测一致时拦截「看起来稳定、实际可能依赖时间/随机/外部状态」的函数。
 * 这些只是线索，不能用来断言具体原因。
 *
 * 局限：只分析函数体本身，不追踪它调用的脚本内其他函数。
 */

export type FeatureCategory =
  | 'time-source'
  | 'random-source'
  | 'environment-read'
  | 'io'
  | 'outer-state-write'
  | 'global-write'
  | 'self-memoization'
  | 'calls-script-function';

export interface FunctionFeature {
  category: FeatureCategory;
  message: string;
  /** Babel 位置：行从 1 开始，列从 0 开始 */
  line: number;
  column: number;
}

export interface FunctionFeatures {
  /** 会阻止验证与替换的特征 */
  blocking: FunctionFeature[];
  /** 仅提示，不阻止 */
  notes: FunctionFeature[];
  /** 函数体调用了的、声明在函数外部的脚本函数名（供 dry-run 解析并分析这些辅助函数） */
  calledScriptFunctions: string[];
  /** 函数体调用了的、没有任何声明的全局函数名（不在纯内置白名单里）：无法分析其行为，dry-run 默认按无法确认处理 */
  calledUnboundFunctions: string[];
}

const TIME_GLOBALS = new Set(['Date', 'performance']);
const ENV_GLOBALS = new Set(['document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'history']);
const IO_GLOBALS = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'console', 'alert', 'confirm', 'prompt']);
export const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'delete', 'add', 'clear']);
const MAX_PER_LIST = 20;
/** 可以确认不依赖脚本状态、不产生外部副作用的内置函数：调用它们不算「无法分析的全局函数」 */
const PURE_GLOBAL_CALLS = new Set(['atob', 'btoa', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number', 'Boolean', 'BigInt', 'Array', 'Object', 'Symbol', 'RegExp', 'Error', 'TypeError', 'RangeError', 'decodeURIComponent', 'encodeURIComponent', 'decodeURI', 'encodeURI', 'escape', 'unescape']);

function rootOf(node: t.Node | null | undefined): t.Identifier | t.ThisExpression | null {
  let cur: t.Node | null | undefined = node;
  while (cur && (t.isMemberExpression(cur) || t.isOptionalMemberExpression(cur))) cur = cur.object;
  if (cur && (t.isIdentifier(cur) || t.isThisExpression(cur))) return cur;
  return null;
}

/** 函数引用自己的名字：自身名、持有它的变量名、赋值左侧的属性名 */
function collectSelfNames(fnPath: NodePath<t.Function>): Set<string> {
  const names = new Set<string>();
  const node = fnPath.node;
  const parent = fnPath.parent;
  if ((t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) && node.id) names.add(node.id.name);
  if (t.isVariableDeclarator(parent) && parent.init === node && t.isIdentifier(parent.id)) names.add(parent.id.name);
  if (t.isAssignmentExpression(parent) && parent.right === node) {
    if (t.isIdentifier(parent.left)) names.add(parent.left.name);
    else if (t.isMemberExpression(parent.left) && t.isIdentifier(parent.left.property)) names.add(parent.left.property.name);
  }
  return names;
}

export function analyzeFunctionFeatures(fnPath: NodePath<t.Function>): FunctionFeatures {
  const blocking: FunctionFeature[] = [];
  const notes: FunctionFeature[] = [];
  const selfNames = collectSelfNames(fnPath);
  const calledScriptFns = new Set<string>();
  const calledUnbound = new Set<string>();

  const add = (list: FunctionFeature[], category: FeatureCategory, message: string, node: t.Node): void => {
    if (list.length >= MAX_PER_LIST) return;
    const loc = node.loc?.start;
    list.push({ category, message, line: loc?.line ?? 0, column: loc?.column ?? 0 });
  };

  /** 绑定是否声明在这个函数内部（含参数和嵌套函数里的变量） */
  const isLocal = (b: Binding): boolean => {
    for (let p: NodePath<any> | null = b.scope.path; p; p = p.parentPath) {
      if (p.node === fnPath.node) return true;
    }
    return false;
  };

  const checkWrite = (root: t.Identifier | t.ThisExpression | null, viaMember: boolean, p: NodePath<any>, node: t.Node, how: string): void => {
    if (!root) return;
    if (t.isThisExpression(root)) {
      add(blocking, 'outer-state-write', `${how}：写入 this 上的状态`, node);
      return;
    }
    const b = p.scope.getBinding(root.name);
    if (b && isLocal(b)) return;
    if (selfNames.has(root.name)) {
      add(notes, 'self-memoization', `${how}：写入函数自身 ${root.name} 的缓存或属性（常见的解码结果缓存写法）`, node);
      return;
    }
    if (!b) add(blocking, 'global-write', `${how}：写入全局 ${root.name}${viaMember ? ' 的属性' : ''}`, node);
    else add(blocking, 'outer-state-write', `${how}：写入函数外部变量 ${root.name}${viaMember ? ' 的属性' : ''}`, node);
  };

  fnPath.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (p.scope.getBinding(name)) return;
      if (TIME_GLOBALS.has(name)) add(blocking, 'time-source', `引用了全局 ${name}（时间来源）`, p.node);
      else if (name === 'crypto') add(blocking, 'random-source', '引用了全局 crypto（随机来源）', p.node);
      else if (ENV_GLOBALS.has(name)) add(blocking, 'environment-read', `读取了运行环境 ${name}`, p.node);
      else if (IO_GLOBALS.has(name)) add(blocking, 'io', `使用了全局 ${name}（有外部副作用）`, p.node);
    },
    MemberExpression(p) {
      const n = p.node;
      if (!t.isIdentifier(n.object, { name: 'Math' }) || p.scope.getBinding('Math')) return;
      const prop = n.computed ? (t.isStringLiteral(n.property) ? n.property.value : null) : (t.isIdentifier(n.property) ? n.property.name : null);
      if (prop === 'random') add(blocking, 'random-source', '调用了 Math.random（随机来源）', n);
    },
    AssignmentExpression(p) {
      const left = p.node.left;
      if (t.isMemberExpression(left) || t.isOptionalMemberExpression(left)) checkWrite(rootOf(left), true, p, p.node, '赋值');
      else if (t.isIdentifier(left)) checkWrite(left, false, p, p.node, '赋值');
      else for (const id of Object.values(t.getBindingIdentifiers(left))) checkWrite(id as t.Identifier, false, p, p.node, '解构赋值');
    },
    UpdateExpression(p) {
      const arg = p.node.argument;
      if (t.isMemberExpression(arg) || t.isOptionalMemberExpression(arg)) checkWrite(rootOf(arg), true, p, p.node, '自增自减');
      else if (t.isIdentifier(arg)) checkWrite(arg, false, p, p.node, '自增自减');
    },
    UnaryExpression(p) {
      if (p.node.operator !== 'delete') return;
      const arg = p.node.argument;
      if (t.isMemberExpression(arg) || t.isOptionalMemberExpression(arg)) checkWrite(rootOf(arg), true, p, p.node, 'delete');
    },
    CallExpression(p) {
      const callee = p.node.callee;
      if (t.isMemberExpression(callee)) {
        const prop = callee.computed ? (t.isStringLiteral(callee.property) ? callee.property.value : null) : (t.isIdentifier(callee.property) ? callee.property.name : null);
        if (prop && MUTATING_METHODS.has(prop)) checkWrite(rootOf(callee.object), true, p, p.node, `调用 .${prop}()`);
      } else if (t.isIdentifier(callee)) {
        const b = p.scope.getBinding(callee.name);
        if (b && !isLocal(b)) calledScriptFns.add(callee.name);
        else if (!b && !PURE_GLOBAL_CALLS.has(callee.name) && !TIME_GLOBALS.has(callee.name) && !ENV_GLOBALS.has(callee.name) && !IO_GLOBALS.has(callee.name) && callee.name !== 'crypto') calledUnbound.add(callee.name);
      }
    },
  });

  if (calledScriptFns.size > 0) {
    add(notes, 'calls-script-function', `调用了脚本内其他函数：${Array.from(calledScriptFns).slice(0, 8).join(', ')}（静态检查不追踪它们的内部行为）`, fnPath.node);
  }
  if (calledUnbound.size > 0) {
    add(notes, 'calls-script-function', `调用了没有声明的全局函数：${Array.from(calledUnbound).slice(0, 8).join(', ')}（无法分析它们的行为）`, fnPath.node);
  }
  return { blocking, notes, calledScriptFunctions: Array.from(calledScriptFns), calledUnboundFunctions: Array.from(calledUnbound) };
}
