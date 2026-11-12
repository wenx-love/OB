/**
 * 确定性分析 + 受限表达式求值
 *
 * 三层分析：
 *   1. 字面量检测——节点本身是否为静态常量
 *   2. 变量追踪——通过 Babel Scope/Binding 追踪变量是否为常量
 *   3. 函数纯度——分析函数体是否有副作用
 *
 * 受限求值器：
 *   - 只对纯字面量运算求值（+, -, *, /, %, ===, !==, <, >, &&, ||, !）
 *   - 禁止调用任何函数
 *   - 禁止访问外部变量
 *   - 不使用 eval / new Function
 */

import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { DeterministicResult, DecoderInfo } from '../types/index.js';

// =========================================================================
//  1. 已知解码器确定性分析（保持原有功能）
// =========================================================================

export function analyzeCallDeterminism(
  path: NodePath<t.CallExpression>,
  decoders: DecoderInfo[],
): DeterministicResult {
  const callee = path.node.callee;

  if (!t.isIdentifier(callee)) {
    return { deterministic: false, reason: 'callee is not an identifier' };
  }

  const decoder = decoders.find(d => d.name === callee.name);
  if (!decoder) {
    return { deterministic: false, reason: `"${callee.name}" is not a known decoder` };
  }

  const args = path.node.arguments;
  for (let i = 0; i < args.length; i++) {
    if (!isStaticValue(args[i])) {
      return {
        deterministic: false,
        reason: `argument ${i} is not a static literal (type: ${args[i].type})`,
      };
    }
  }

  return {
    deterministic: true,
    reason: `all arguments are static, callee "${callee.name}" is a confirmed decoder`,
  };
}

// =========================================================================
//  2. 静态值检测——判断节点是否为编译期可确定的值
// =========================================================================

/** 判断一个 AST 节点是否为静态常量值（不依赖任何运行时状态） */
export function isStaticValue(node: t.Node): boolean {
  if (t.isStringLiteral(node)) return true;
  if (t.isNumericLiteral(node)) return true;
  if (t.isBooleanLiteral(node)) return true;
  if (t.isNullLiteral(node)) return true;

  // -number
  if (
    t.isUnaryExpression(node, { operator: '-' }) &&
    t.isNumericLiteral(node.argument)
  ) return true;

  // !literal
  if (t.isUnaryExpression(node, { operator: '!' }) && isStaticValue(node.argument)) return true;

  // typeof literal
  if (t.isUnaryExpression(node, { operator: 'typeof' }) && isStaticValue(node.argument)) return true;

  // void 0
  if (
    t.isUnaryExpression(node, { operator: 'void' }) &&
    t.isNumericLiteral(node.argument) && node.argument.value === 0
  ) return true;

  // literal OP literal（二元运算）
  if (t.isBinaryExpression(node) && isStaticValue(node.left) && isStaticValue(node.right)) return true;

  // literal && literal / literal || literal
  if (t.isLogicalExpression(node) && isStaticValue(node.left) && isStaticValue(node.right)) return true;

  // cond ? a : b（全静态）
  if (
    t.isConditionalExpression(node) &&
    isStaticValue(node.test) && isStaticValue(node.consequent) && isStaticValue(node.alternate)
  ) return true;

  // template literal without expressions: `hello`
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) return true;

  return false;
}

// =========================================================================
//  3. 变量追踪——通过 Scope/Binding 判断变量是否为常量
// =========================================================================

/** 追踪一个标识符的绑定，判断其值是否为静态常量 */
export function resolveStaticBinding(path: NodePath<t.Identifier>): { resolved: boolean; value?: t.Node } {
  const binding = path.scope.getBinding(path.node.name);
  if (!binding) return { resolved: false };

  // 有任何重新赋值 → 非常量
  if (binding.constantViolations.length > 0) return { resolved: false };

  // const/var/let 声明的初始值
  if (binding.path.isVariableDeclarator() && binding.path.node.init) {
    const init = binding.path.node.init;
    if (isStaticValue(init)) {
      return { resolved: true, value: init };
    }
  }

  return { resolved: false };
}

// =========================================================================
//  4. 函数纯度分析——检查函数体是否有副作用
// =========================================================================

const IMPURE_GLOBALS = new Set([
  'Date', 'Math', 'crypto', 'performance',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'fetch', 'XMLHttpRequest', 'console', 'alert', 'confirm', 'prompt',
  'document', 'window', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage',
]);

/** 分析函数节点是否为纯函数（无副作用、不依赖外部可变状态） */
export function analyzeFunctionPurity(
  funcNode: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
  scope?: any,
): { pure: boolean; reason: string } {
  const paramNames = new Set(
    funcNode.params
      .filter((p): p is t.Identifier => t.isIdentifier(p))
      .map(p => p.name),
  );

  // 递归遍历函数体内所有节点
  const bodyNode = t.isBlockStatement(funcNode.body) ? funcNode.body : t.blockStatement([t.returnStatement(funcNode.body as t.Expression)]);
  const result = walkForImpurity(bodyNode, paramNames);
  return result ?? { pure: true, reason: 'function body has no side effects' };
}

function walkForImpurity(node: t.Node, safeNames: Set<string>): { pure: false; reason: string } | null {
  // 赋值
  if (t.isAssignmentExpression(node)) {
    return { pure: false, reason: `assignment expression (${node.operator})` };
  }
  // 函数调用
  if (t.isCallExpression(node)) {
    return { pure: false, reason: 'function call' };
  }
  // new
  if (t.isNewExpression(node)) {
    return { pure: false, reason: 'new expression' };
  }
  // delete
  if (t.isUnaryExpression(node, { operator: 'delete' })) {
    return { pure: false, reason: 'delete operator' };
  }
  // i++, ++i
  if (t.isUpdateExpression(node)) {
    return { pure: false, reason: 'update expression (++/--)' };
  }
  // 全局不纯变量
  if (t.isIdentifier(node) && IMPURE_GLOBALS.has(node.name) && !safeNames.has(node.name)) {
    return { pure: false, reason: `access to impure global "${node.name}"` };
  }
  // this
  if (t.isThisExpression(node)) {
    return { pure: false, reason: 'this expression' };
  }
  // yield/await
  if (t.isYieldExpression(node) || t.isAwaitExpression(node)) {
    return { pure: false, reason: 'yield/await expression' };
  }

  // 递归检查所有子节点
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const child = (node as any)[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && c.type) {
          const r = walkForImpurity(c, safeNames);
          if (r) return r;
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      const r = walkForImpurity(child, safeNames);
      if (r) return r;
    }
  }

  return null;
}

// =========================================================================
//  5. 受限表达式求值器——纯 AST 级别，不使用 eval
// =========================================================================

/** 求值失败的标记 */
const EVAL_FAIL = Symbol('EVAL_FAIL');

type SafeValue = string | number | boolean | null | undefined | typeof EVAL_FAIL;

/**
 * 受限静态求值器：只对纯字面量和安全运算求值。
 * 不执行任何函数调用，不访问任何变量。
 * 失败时返回 undefined。
 */
export function safeStaticEval(node: t.Node): SafeValue {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isBooleanLiteral(node)) return node.value;
  if (t.isNullLiteral(node)) return null;

  // void 0 → undefined
  if (
    t.isUnaryExpression(node, { operator: 'void' }) &&
    t.isNumericLiteral(node.argument) && node.argument.value === 0
  ) return undefined;

  // -number
  if (t.isUnaryExpression(node, { operator: '-' })) {
    const val = safeStaticEval(node.argument);
    if (typeof val === 'number') return -val;
    return EVAL_FAIL;
  }

  // +number (unary plus)
  if (t.isUnaryExpression(node, { operator: '+' })) {
    const val = safeStaticEval(node.argument);
    if (typeof val === 'number') return +val;
    if (typeof val === 'string') return +val;
    if (typeof val === 'boolean') return +val;
    return EVAL_FAIL;
  }

  // !value
  if (t.isUnaryExpression(node, { operator: '!' })) {
    const val = safeStaticEval(node.argument);
    if (val === EVAL_FAIL) return EVAL_FAIL;
    return !val;
  }

  // typeof literal
  if (t.isUnaryExpression(node, { operator: 'typeof' })) {
    const val = safeStaticEval(node.argument);
    if (val === EVAL_FAIL) return EVAL_FAIL;
    return typeof val;
  }

  // 二元运算
  if (t.isBinaryExpression(node)) {
    const left = safeStaticEval(node.left);
    const right = safeStaticEval(node.right);
    if (left === EVAL_FAIL || right === EVAL_FAIL) return EVAL_FAIL;
    return evalBinary(node.operator, left, right);
  }

  // 逻辑运算
  if (t.isLogicalExpression(node)) {
    const left = safeStaticEval(node.left);
    if (left === EVAL_FAIL) return EVAL_FAIL;
    if (node.operator === '&&') return left ? safeStaticEval(node.right) : left;
    if (node.operator === '||') return left ? left : safeStaticEval(node.right);
    if (node.operator === '??') return (left === null || left === undefined) ? safeStaticEval(node.right) : left;
    return EVAL_FAIL;
  }

  // 三元运算
  if (t.isConditionalExpression(node)) {
    const test = safeStaticEval(node.test);
    if (test === EVAL_FAIL) return EVAL_FAIL;
    return test ? safeStaticEval(node.consequent) : safeStaticEval(node.alternate);
  }

  // template literal without interpolation
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? EVAL_FAIL;
  }

  // SequenceExpression: (a, b, c) → 返回最后一个表达式的值
  if (t.isSequenceExpression(node)) {
    let lastVal: SafeValue = undefined;
    for (const expr of node.expressions) {
      const val = safeStaticEval(expr);
      if (val === EVAL_FAIL) return EVAL_FAIL;
      lastVal = val;
    }
    return lastVal;
  }

  // ArrayExpression: [1, 2, "a"] → 只在所有元素都是字面量时返回数组
  // 注意：不执行任何动态逻辑
  if (t.isArrayExpression(node)) {
    const result: any[] = [];
    for (const el of node.elements) {
      if (el === null) {
        result.push(undefined); // sparse array hole
        continue;
      }
      if (t.isSpreadElement(el)) return EVAL_FAIL; // 不支持 spread
      const val = safeStaticEval(el);
      if (val === EVAL_FAIL) return EVAL_FAIL;
      result.push(val);
    }
    // 返回数组本身（注意：后续使用需要小心，不能直接写入 AST）
    // 但这会导致类型问题，所以暂时禁止返回，安全优先
    return EVAL_FAIL; // 保守策略：数组太复杂，不支持
  }

  // ObjectExpression: { a: 1, b: "test" } → 只在所有 key/value 都是静态时支持
  // 限制：key 必须是标识符或字符串字面量，value 必须可静态求值
  if (t.isObjectExpression(node)) {
    const result: Record<string, any> = {};
    for (const prop of node.properties) {
      if (t.isSpreadElement(prop)) return EVAL_FAIL; // 不支持 spread
      if (!t.isObjectProperty(prop)) return EVAL_FAIL; // 不支持 method/getter/setter
      if (prop.computed) return EVAL_FAIL; // 不支持动态 key
      
      let key: string;
      if (t.isIdentifier(prop.key)) {
        key = prop.key.name;
      } else if (t.isStringLiteral(prop.key)) {
        key = prop.key.value;
      } else {
        return EVAL_FAIL;
      }

      const val = safeStaticEval(prop.value as t.Node);
      if (val === EVAL_FAIL) return EVAL_FAIL;
      result[key] = val;
    }
    // 同样，返回对象有风险，当前禁止
    return EVAL_FAIL; // 保守策略：对象太复杂，不支持
  }

  // MemberExpression: arr[0], obj.prop → 受限支持静态数组/对象访问
  // 前提：obj 和 property 都是静态可求值的
  if (t.isMemberExpression(node)) {
    // 暂时禁止，因为需要对象/数组的值，而我们不返回它们
    // 后续可增强：只处理极简单的 arr[0] 这种
    return EVAL_FAIL;
  }

  // 数组/对象字面量 → 暂时禁止（安全起见）
  // 函数调用 → 绝对不执行
  // 标识符 → 不解析（变量追踪由 resolveStaticBinding 负责）
  return EVAL_FAIL;
}

function evalBinary(op: string, left: SafeValue, right: SafeValue): SafeValue {
  // 只处理基本类型
  if (left === EVAL_FAIL || right === EVAL_FAIL) return EVAL_FAIL;

  switch (op) {
    case '+': return (left as any) + (right as any);
    case '-': return (left as any) - (right as any);
    case '*': return (left as any) * (right as any);
    case '/': return right === 0 ? EVAL_FAIL : (left as any) / (right as any);
    case '%': return right === 0 ? EVAL_FAIL : (left as any) % (right as any);
    case '**': return (left as any) ** (right as any);
    case '===': return left === right;
    case '!==': return left !== right;
    case '==': return left == right;
    case '!=': return left != right;
    case '<': return (left as any) < (right as any);
    case '>': return (left as any) > (right as any);
    case '<=': return (left as any) <= (right as any);
    case '>=': return (left as any) >= (right as any);
    case '|': return (left as any) | (right as any);
    case '&': return (left as any) & (right as any);
    case '^': return (left as any) ^ (right as any);
    case '<<': return (left as any) << (right as any);
    case '>>': return (left as any) >> (right as any);
    case '>>>': return (left as any) >>> (right as any);
    default: return EVAL_FAIL;
  }
}

/** 便捷函数：尝试安全求值，成功返回 { value, type }，失败返回 null */
export function tryStaticEval(node: t.Node): { value: any; type: string } | null {
  const result = safeStaticEval(node);
  if (result === EVAL_FAIL) return null;
  return { value: result, type: typeof result };
}
