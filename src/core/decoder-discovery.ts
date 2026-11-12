/**
 * OB Decoder Auto Discovery — Phase 2
 *
 * 纯静态 AST 分析，无任何代码执行。
 * 识别候选字符串解码函数，映射调用位置，分析依赖关系。
 */
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import { parseCode } from './parser.js';

const traverse = (
  typeof _traverse === 'function' ? _traverse : (_traverse as any).default
) as typeof _traverse;

// ─────────────────────────────────────────────────────────────
// 公共类型
// ─────────────────────────────────────────────────────────────

export type DecoderConfidence = 'high' | 'medium' | 'low';

export interface SourceLoc {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  /** 字符偏移（用于精确切片） */
  start: number;
  end: number;
}

export interface ArgumentInfo {
  /** AST 节点类型 */
  nodeType: string;
  /** 字面量值（仅当 isLiteral=true 时有效） */
  value?: string | number | boolean;
  isLiteral: boolean;
}

export interface CallSiteInfo {
  scriptId?: string;
  scriptUrl?: string;
  location: SourceLoc;
  /** 调用源文本，如 `_0xdec(0x31, "abc")` */
  callText: string;
  args: ArgumentInfo[];
  /** 父节点类型，如 MemberExpression / AssignmentExpression */
  parentNodeType: string;
}

export type DependencyKind =
  | 'string-array'
  | 'helper-function'
  | 'index-offset'
  | 'closure-variable'
  | 'global-object';

export interface DependencyInfo {
  name: string;
  kind: DependencyKind;
  description: string;
}

export interface DiscoveredFunction {
  /** 函数名称；匿名时为 null */
  name: string | null;
  /** 函数定义方式 */
  kind:
    | 'FunctionDeclaration'
    | 'FunctionExpression'
    | 'ArrowFunctionExpression'
    | 'ObjectMethod'
    | 'AssignedExpression';
  paramCount: number;
  paramNames: string[];
  location: SourceLoc;
}

export interface CandidateDecoder extends DiscoveredFunction {
  confidence: DecoderConfidence;
  /** 识别依据（文字描述列表） */
  evidence: string[];
  /** 内部特征 */
  hasIndexOffset: boolean;
  hasStringArrayAccess: boolean;
  /** 依赖的字符串数组名 */
  stringArrayName: string | null;
  hasBase64: boolean;
  hasRC4: boolean;
  hasRotation: boolean;
  hasMultipleReturn: boolean;
  /** 依赖关系 */
  dependencies: DependencyInfo[];
  /** 该函数在脚本中被调用的次数 */
  callCount: number;
  /** 所有调用位置（只在 name 非 null 时完整填充） */
  callSites: CallSiteInfo[];
}

export interface DiscoveryResult {
  scriptId?: string;
  scriptUrl?: string;
  /** 发现的所有函数定义（包括非候选） */
  functions: DiscoveredFunction[];
  /** 候选解码函数 */
  candidates: CandidateDecoder[];
  analyzed: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────

/**
 * 对 JavaScript 源码进行纯静态分析，识别候选 OB 字符串解码函数。
 * 不执行任何代码。
 */
export function discoverDecoders(
  source: string,
  scriptId?: string,
  scriptUrl?: string,
): DiscoveryResult {
  try {
    const ast = parseCode(source);
    const functions = collectFunctions(ast, source);
    const callCounts = countCallsPerName(ast);
    const fnIndex = indexFunctionNodes(ast);
    const candidates: CandidateDecoder[] = [];

    for (const fn of functions) {
      if (!fn.name) continue; // 匿名函数暂不追踪调用位置
      const candidate = analyzeFunction(fn, ast, source, callCounts, fnIndex);
      if (candidate) candidates.push(candidate);
    }

    // 对每个候选：补全调用位置
    for (const c of candidates) {
      if (c.name) {
        c.callSites = collectCallSites(ast, c.name, source, scriptId, scriptUrl);
        // 用真实调用数更新（可能比 countCallsPerName 更精确）
        c.callCount = c.callSites.length;
      }
    }

    return { scriptId, scriptUrl, functions, candidates, analyzed: true };
  } catch (err: any) {
    return {
      scriptId,
      scriptUrl,
      functions: [],
      candidates: [],
      analyzed: false,
      error: err.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 函数收集
// ─────────────────────────────────────────────────────────────

function collectFunctions(ast: File, source: string): DiscoveredFunction[] {
  const results: DiscoveredFunction[] = [];

  traverse(ast, {
    // function foo() {}
    FunctionDeclaration(path) {
      const node = path.node;
      results.push({
        name: node.id?.name ?? null,
        kind: 'FunctionDeclaration',
        paramCount: node.params.length,
        paramNames: node.params.map(p => (t.isIdentifier(p) ? p.name : '?')),
        location: nodeToLoc(node),
      });
    },

    // var x = function() {}  /  var x = function name() {}
    VariableDeclarator(path) {
      const node = path.node;
      if (!t.isIdentifier(node.id)) return;

      const init = node.init;
      if (!init) return;

      if (t.isFunctionExpression(init)) {
        results.push({
          name: node.id.name,
          kind: 'FunctionExpression',
          paramCount: init.params.length,
          paramNames: init.params.map(p => (t.isIdentifier(p) ? p.name : '?')),
          location: nodeToLoc(node),
        });
      } else if (t.isArrowFunctionExpression(init)) {
        results.push({
          name: node.id.name,
          kind: 'ArrowFunctionExpression',
          paramCount: init.params.length,
          paramNames: init.params.map(p => (t.isIdentifier(p) ? p.name : '?')),
          location: nodeToLoc(node),
        });
      }
    },

    // foo.bar = function() {}  /  obj = { bar: function() {} }
    AssignmentExpression(path) {
      const node = path.node;
      if (!t.isFunctionExpression(node.right) && !t.isArrowFunctionExpression(node.right)) return;
      const fn = node.right as t.FunctionExpression | t.ArrowFunctionExpression;
      let name: string | null = null;
      if (t.isIdentifier(node.left)) name = node.left.name;
      else if (t.isMemberExpression(node.left) && t.isIdentifier(node.left.property)) {
        name = node.left.property.name;
      }
      results.push({
        name,
        kind: 'AssignedExpression',
        paramCount: fn.params.length,
        paramNames: fn.params.map(p => (t.isIdentifier(p) ? p.name : '?')),
        location: nodeToLoc(node),
      });
    },

    // { method() {} }  or  { method: function() {} }
    ObjectProperty(path) {
      const node = path.node;
      const val = node.value;
      if (!t.isFunctionExpression(val) && !t.isArrowFunctionExpression(val)) return;
      let name: string | null = null;
      if (t.isIdentifier(node.key)) name = node.key.name;
      else if (t.isStringLiteral(node.key)) name = node.key.value;
      results.push({
        name,
        kind: 'ObjectMethod',
        paramCount: (val as t.FunctionExpression).params.length,
        paramNames: (val as t.FunctionExpression).params.map(p => (t.isIdentifier(p) ? p.name : '?')),
        location: nodeToLoc(node),
      });
    },
  });

  return results;
}

// ─────────────────────────────────────────────────────────────
// 函数分析（确定是否为候选解码器）
// ─────────────────────────────────────────────────────────────

function indexFunctionNodes(ast: File): Map<string, t.Function> {
  const index = new Map<string, t.Function>();
  traverse(ast, {
    FunctionDeclaration(path) {
      index.set('FunctionDeclaration:' + path.node.start, path.node);
    },
    VariableDeclarator(path) {
      const init = path.node.init;
      if (!t.isIdentifier(path.node.id)) return;
      if (t.isFunctionExpression(init)) index.set('FunctionExpression:' + path.node.start, init);
      else if (t.isArrowFunctionExpression(init)) index.set('ArrowFunctionExpression:' + path.node.start, init);
    },
    AssignmentExpression(path) {
      const right = path.node.right;
      if (t.isFunctionExpression(right) || t.isArrowFunctionExpression(right)) {
        index.set('AssignedExpression:' + path.node.start, right);
      }
    },
    ObjectProperty(path) {
      const value = path.node.value;
      if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
        index.set('ObjectMethod:' + path.node.start, value);
      }
    },
  });
  return index;
}

function analyzeFunction(
  fn: DiscoveredFunction,
  ast: File,
  source: string,
  callCounts: Map<string, number>,
  fnIndex: Map<string, t.Function>,
): CandidateDecoder | null {
  if (!fn.name) return null;

  // 找到该函数的 AST 节点
  const funcNode = fnIndex.get(fn.kind + ':' + fn.location.start) ?? findFunctionNodeByName(ast, fn.name);
  if (!funcNode) return null;

  const body = getFunctionBody(funcNode);
  if (!body) return null;

  const evidence: string[] = [];
  const deps: DependencyInfo[] = [];

  // ── 特征检测 ────────────────────────────────
  const hasIndexOffset = detectIndexOffset(body, fn.paramNames);
  const { hasAccess, arrayName } = detectStringArrayAccess(body, fn.paramNames, ast, source);
  const hasBase64 = detectBase64(body);
  const hasRC4 = detectRC4(body);
  const hasRotation = detectRotation(body);
  const hasReturn = detectReturn(body);
  const hasMultipleReturn = detectMultipleReturn(body);
  const callCount = callCounts.get(fn.name) ?? 0;

  // ── 积分 & 证据 ────────────────────────────────
  let score = 0;

  if (fn.paramCount >= 1 && fn.paramCount <= 3) {
    score += 1;
    evidence.push(`参数数量 ${fn.paramCount} 个（典型值 1-3）`);
  }
  if (hasAccess) {
    score += 3;
    evidence.push(`函数体内存在字符串数组访问 [${arrayName ?? '?'}]`);
    if (arrayName) {
      deps.push({ name: arrayName, kind: 'string-array', description: `通过参数索引访问字符串数组 ${arrayName}` });
    }
  }
  if (hasIndexOffset) {
    score += 2;
    evidence.push('参数存在索引偏移计算（param = param - offset 或 param -= offset）');
    deps.push({ name: 'indexOffset', kind: 'index-offset', description: '索引偏移运算' });
  }
  if (hasReturn) {
    score += 1;
    evidence.push('存在 return 语句返回推断值');
  }
  if (hasBase64) {
    score += 1;
    evidence.push('存在 Base64 解码调用（atob / String.fromCharCode 模式）');
    deps.push({ name: 'atob', kind: 'global-object', description: 'Base64 解码' });
  }
  if (hasRC4) {
    score += 1;
    evidence.push('存在 RC4 特征（charCodeAt / % 256 / XOR）');
  }
  if (hasRotation) {
    score += 1;
    evidence.push('内部含有旋转逻辑（push/shift 循环）');
  }
  if (callCount >= 10) {
    score += 3;
    evidence.push(`被调用 ${callCount} 次（高频调用）`);
  } else if (callCount >= 3) {
    score += 1;
    evidence.push(`被调用 ${callCount} 次`);
  }

  // ── 置信度 ────────────────────────────────
  let confidence: DecoderConfidence;
  if (score >= 6) confidence = 'high';
  else if (score >= 3) confidence = 'medium';
  else return null; // 分数太低，不认为是候选

  // 补充：分析闭包变量（只对通过评分的候选做，需要完整遍历 AST）
  const closureVars = detectClosureVariables(funcNode, ast, fn.paramNames);
  for (const v of closureVars) {
    if (v === arrayName) continue; // 已经记录为 string-array
    deps.push({ name: v, kind: 'closure-variable', description: `引用了外部作用域变量 ${v}` });
  }

  return {
    ...fn,
    confidence,
    evidence,
    hasIndexOffset,
    hasStringArrayAccess: hasAccess,
    stringArrayName: arrayName,
    hasBase64,
    hasRC4,
    hasRotation,
    hasMultipleReturn,
    dependencies: deps,
    callCount,
    callSites: [],
  };
}

// ─────────────────────────────────────────────────────────────
// 调用位置收集
// ─────────────────────────────────────────────────────────────

function collectCallSites(
  ast: File,
  funcName: string,
  source: string,
  scriptId?: string,
  scriptUrl?: string,
): CallSiteInfo[] {
  const sites: CallSiteInfo[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      let name: string | null = null;

      if (t.isIdentifier(callee)) {
        name = callee.name;
      } else if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        !callee.computed
      ) {
        // e.g. obj.method() — 只取属性名
        name = callee.property.name;
      }

      if (name !== funcName) return;

      // 尝试通过 scope 验证绑定
      if (t.isIdentifier(callee)) {
        const binding = path.scope.getBinding(funcName);
        // binding 为 null 表示全局或找不到，仍然记录（保守策略）
        if (binding && !isFunctionBinding(binding)) return;
      }

      const args: ArgumentInfo[] = path.node.arguments.map(arg => {
        if (t.isStringLiteral(arg)) {
          return { nodeType: 'StringLiteral', value: arg.value, isLiteral: true };
        }
        if (t.isNumericLiteral(arg)) {
          return { nodeType: 'NumericLiteral', value: arg.value, isLiteral: true };
        }
        if (t.isBooleanLiteral(arg)) {
          return { nodeType: 'BooleanLiteral', value: arg.value, isLiteral: true };
        }
        if (
          t.isUnaryExpression(arg, { operator: '-' }) &&
          t.isNumericLiteral(arg.argument)
        ) {
          return { nodeType: 'NegativeNumeric', value: -arg.argument.value, isLiteral: true };
        }
        return { nodeType: arg.type, isLiteral: false };
      });

      const parentPath = path.parentPath;
      const parentNodeType = parentPath?.node.type ?? 'Unknown';
      const callText = safeSlice(source, path.node.start!, path.node.end!);

      sites.push({
        scriptId,
        scriptUrl,
        location: nodeToLoc(path.node),
        callText,
        args,
        parentNodeType,
      });
    },
  });

  return sites;
}

// ─────────────────────────────────────────────────────────────
// 辅助检测函数
// ─────────────────────────────────────────────────────────────

/** 检测索引偏移：param = param - n  /  param -= n  /  var x = param - n */
function detectIndexOffset(body: t.Statement[], paramNames: string[]): boolean {
  let found = false;
  const visitor = {
    AssignmentExpression(path: any) {
      const node = path.node as t.AssignmentExpression;
      // param -= offset
      if (
        (node.operator === '-=' || node.operator === '+=') &&
        isNumericConst(node.right) &&
        t.isIdentifier(node.left) &&
        paramNames.includes(node.left.name)
      ) {
        found = true;
        return;
      }
      // param = param - offset
      if (
        node.operator === '=' &&
        t.isIdentifier(node.left) &&
        paramNames.includes(node.left.name) &&
        t.isBinaryExpression(node.right) &&
        (node.right.operator === '-' || node.right.operator === '+') &&
        t.isIdentifier(node.right.left) &&
        isNumericConst(node.right.right) &&
        paramNames.includes(node.right.left.name)
      ) {
        found = true;
      }
    },
    // var idx = param - offset
    VariableDeclarator(path: any) {
      const node = path.node as t.VariableDeclarator;
      if (
        node.init &&
        t.isBinaryExpression(node.init) &&
        (node.init.operator === '-' || node.init.operator === '+') &&
        t.isIdentifier(node.init.left) &&
        isNumericConst(node.init.right) &&
        paramNames.includes(node.init.left.name)
      ) {
        found = true;
      }
    },
  };
  traverseBody(body, visitor);
  return found;
}

/** 检测字符串数组访问：identifier[expression-using-param] */
function detectStringArrayAccess(
  body: t.Statement[],
  paramNames: string[],
  ast: File,
  source: string,
): { hasAccess: boolean; arrayName: string | null } {
  let hasAccess = false;
  let arrayName: string | null = null;

  const visitor = {
    MemberExpression(path: any) {
      const node = path.node as t.MemberExpression;
      if (!node.computed) return;
      if (!t.isIdentifier(node.object)) return;

      const objName = node.object.name;

      // 检查索引表达式是否用到了参数
      if (!isIndexExpression(node.property, paramNames)) return;

      hasAccess = true;
      if (!arrayName) arrayName = objName;
    },
  };
  traverseBody(body, visitor);
  return { hasAccess, arrayName };
}

/** 检测 Base64：atob / String.fromCharCode + charCodeAt */
function detectBase64(body: t.Statement[]): boolean {
  let found = false;
  const visitor = {
    CallExpression(path: any) {
      const node = path.node as t.CallExpression;
      if (t.isIdentifier(node.callee) && (node.callee.name === 'atob' || node.callee.name === 'btoa')) {
        found = true;
        return;
      }
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.object, { name: 'String' }) &&
        t.isIdentifier(node.callee.property, { name: 'fromCharCode' })
      ) {
        found = true;
      }
    },
  };
  traverseBody(body, visitor);
  return found;
}

/** 检测 RC4：charCodeAt + % 256 + XOR(^) */
function detectRC4(body: t.Statement[]): boolean {
  let hasCharCodeAt = false;
  let hasModulo = false;
  let hasXor = false;

  const visitor = {
    MemberExpression(path: any) {
      const node = path.node as t.MemberExpression;
      if (t.isIdentifier(node.property, { name: 'charCodeAt' })) hasCharCodeAt = true;
    },
    BinaryExpression(path: any) {
      const node = path.node as t.BinaryExpression;
      if (node.operator === '%') {
        if (t.isNumericLiteral(node.right) && node.right.value === 256) hasModulo = true;
      }
      if (node.operator === '^') hasXor = true;
    },
  };
  traverseBody(body, visitor);
  return hasCharCodeAt && (hasModulo || hasXor);
}

/** 检测旋转逻辑（push / shift 循环） */
function detectRotation(body: t.Statement[]): boolean {
  let found = false;
  const visitor = {
    CallExpression(path: any) {
      const node = path.node as t.CallExpression;
      if (
        t.isMemberExpression(node.callee) &&
        t.isIdentifier(node.callee.property) &&
        (node.callee.property.name === 'push' || node.callee.property.name === 'shift')
      ) {
        found = true;
      }
    },
  };
  traverseBody(body, visitor);
  return found;
}

/** 检测是否存在 return 语句 */
function detectReturn(body: t.Statement[]): boolean {
  let found = false;
  traverseBody(body, { ReturnStatement() { found = true; } });
  return found;
}

/** 检测是否存在多个 return 分支 */
function detectMultipleReturn(body: t.Statement[]): boolean {
  let count = 0;
  traverseBody(body, { ReturnStatement() { count++; } });
  return count > 1;
}

/** 检测闭包变量（函数体内引用了外部作用域的变量） */
function detectClosureVariables(funcNode: t.Node, ast: File, paramNames: string[]): string[] {
  const vars = new Set<string>();

  // 找到该函数的 path 来使用 scope
  traverse(ast, {
    Function(path: any) {
      const node = path.node as t.Function;
      if (node !== funcNode) return;

      const ownBindings = new Set<string>([...paramNames]);
      // 收集函数内部声明的变量
      for (const [name] of Object.entries(path.scope.bindings || {})) {
        ownBindings.add(name);
      }

      // 遍历函数体内所有 Identifier 使用
      path.traverse({
        Identifier(innerPath: any) {
          const name: string = innerPath.node.name;
          if (ownBindings.has(name)) return;
          // 不是全局内置
          if (GLOBAL_BUILTINS.has(name)) return;
          // 检查是否是外部绑定
          const binding = path.scope.getBinding(name);
          if (!binding) {
            // 找不到绑定 → 可能是闭包变量或全局
            // 只记录非常见全局
            if (!KNOWN_GLOBALS.has(name)) vars.add(name);
          } else if (binding.scope !== path.scope) {
            // 绑定在外部作用域
            vars.add(name);
          }
        },
      });

      path.skip();
    },
  });

  return [...vars];
}

// ─────────────────────────────────────────────────────────────
// 调用统计
// ─────────────────────────────────────────────────────────────

/** 统计整个 AST 中每个函数名被调用的次数 */
function countCallsPerName(ast: File): Map<string, number> {
  const counts = new Map<string, number>();

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      let name: string | null = null;
      if (t.isIdentifier(callee)) name = callee.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    },
  });

  return counts;
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────

function nodeToLoc(node: t.Node): SourceLoc {
  const loc = node.loc;
  return {
    startLine: loc?.start.line ?? 0,
    startColumn: loc?.start.column ?? 0,
    endLine: loc?.end.line ?? 0,
    endColumn: loc?.end.column ?? 0,
    start: node.start ?? 0,
    end: node.end ?? 0,
  };
}

function safeSlice(source: string, start: number, end: number): string {
  if (start < 0 || end > source.length || start >= end) return '';
  const s = source.slice(start, end);
  return s.length > 200 ? s.slice(0, 197) + '...' : s;
}

/** 数值常量（含负号）：索引偏移必须是常量；`param + 变量` 是普通运算，不是偏移 */
function isNumericConst(node: t.Node): boolean {
  return (
    t.isNumericLiteral(node) ||
    (t.isUnaryExpression(node, { operator: '-' }) && t.isNumericLiteral(node.argument))
  );
}

/**
 * 字符串数组的下标：只能是「参数」与「常量」的加减（或以参数为实参的调用）。
 * 含位运算、取模、成员访问、非参数变量的下标属于哈希/查表等数值计算，不是字符串解码。
 */
function isIndexExpression(node: t.Node, paramNames: string[]): boolean {
  if (!expressionUsesParams(node, paramNames)) return false;
  return isArithmeticIndex(node, paramNames);
}

function isArithmeticIndex(node: t.Node, paramNames: string[]): boolean {
  if (t.isIdentifier(node)) return paramNames.includes(node.name);
  if (isNumericConst(node)) return true;
  if (t.isBinaryExpression(node)) {
    return (
      (node.operator === '+' || node.operator === '-') &&
      isArithmeticIndex(node.left, paramNames) &&
      isArithmeticIndex(node.right, paramNames)
    );
  }
  if (t.isCallExpression(node)) return true; // arr[helper(i)]：实参是否用到参数已由 expressionUsesParams 检查
  return false;
}

/** 检查表达式是否引用了任意一个参数名 */
function expressionUsesParams(node: t.Node, paramNames: string[]): boolean {
  if (paramNames.length === 0) return false;
  if (t.isIdentifier(node)) return paramNames.includes(node.name);
  if (t.isBinaryExpression(node)) {
    return expressionUsesParams(node.left, paramNames) || expressionUsesParams(node.right, paramNames);
  }
  if (t.isCallExpression(node)) {
    return node.arguments.some(a => expressionUsesParams(a as t.Node, paramNames));
  }
  return false;
}

/** 找到指定名称函数的节点（只找一个） */
function findFunctionNodeByName(ast: File, name: string): t.Function | null {
  let found: t.Function | null = null;
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id?.name === name && !found) { found = path.node; path.skip(); }
    },
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id, { name }) &&
        (t.isFunctionExpression(path.node.init) || t.isArrowFunctionExpression(path.node.init)) &&
        !found
      ) {
        found = path.node.init as t.Function;
        path.skip();
      }
    },
    AssignmentExpression(path) {
      const node = path.node;
      if (
        (t.isIdentifier(node.left, { name }) ||
          (t.isMemberExpression(node.left) && t.isIdentifier(node.left.property, { name }))) &&
        (t.isFunctionExpression(node.right) || t.isArrowFunctionExpression(node.right)) &&
        !found
      ) {
        found = node.right as t.Function;
        path.skip();
      }
    },
  });
  return found;
}

/** 获取函数体语句列表 */
function getFunctionBody(funcNode: t.Function): t.Statement[] | null {
  if (!t.isBlockStatement(funcNode.body)) return null;
  return funcNode.body.body;
}

/** 判断 binding 是否指向函数定义 */
function isFunctionBinding(binding: any): boolean {
  if (!binding) return false;
  if (binding.kind === 'hoisted') return true; // FunctionDeclaration
  if (binding.kind === 'const' || binding.kind === 'var' || binding.kind === 'let') {
    const init = binding.path?.node?.init;
    if (init && (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init))) return true;
  }
  return false;
}

/** 对函数体语句列表做简单的 visitor 遍历（不需要完整的 scope 信息） */
function traverseBody(stmts: t.Statement[], visitor: Record<string, (path: any) => void>): void {
  for (const stmt of stmts) {
    t.traverseFast(stmt, (node) => {
      const fn = visitor[node.type];
      if (fn) fn({ node });
    });
  }
}

// 常见全局内置，不当作闭包变量
const GLOBAL_BUILTINS = new Set([
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
  'atob', 'btoa', 'escape', 'unescape', 'encodeURIComponent', 'decodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'Function',
  'Math', 'Date', 'RegExp', 'JSON', 'Error', 'TypeError', 'RangeError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol',
  'Uint8Array', 'ArrayBuffer', 'TextEncoder', 'TextDecoder',
  'console', 'window', 'global', 'globalThis', 'self',
]);

const KNOWN_GLOBALS = new Set([
  ...GLOBAL_BUILTINS,
  'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'XMLHttpRequest', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'crypto',
  'module', 'exports', 'require', '__dirname', '__filename',
]);
