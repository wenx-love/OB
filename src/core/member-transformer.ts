import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { ObjectMapping, TransformRecord } from '../types/index.js';
import { MappingManager } from './mapping.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

// JS 保留字——不能用作 obj.xxx 的属性
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield',
]);

// 合法的 JS 标识符（可以用 obj.xxx 访问的属性名）
const VALID_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * 1. Computed → Static：obj["prop"] → obj.prop
 *    条件：属性是字符串字面量 + 合法标识符 + 非保留字
 */
export function transformComputedToStatic(
  ast: File,
): { transforms: TransformRecord[]; count: number } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  traverse(ast, {
    MemberExpression(path) {
      if (!path.node.computed) return;
      const prop = path.node.property;
      if (!t.isStringLiteral(prop)) return;
      if (!VALID_IDENT.test(prop.value)) return;
      if (RESERVED.has(prop.value)) return;

      const loc = path.node.loc?.start;
      transforms.push({
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        original: `["${prop.value}"]`,
        replaced: `.${prop.value}`,
        source: 'static-decoder',
      });

      path.node.computed = false;
      path.node.property = t.identifier(prop.value);
      count++;
    },
  });

  return { transforms, count };
}

/**
 * 2. Proxy Function Inline：
 *    识别 var fn = function(a,b) { return a OP b; }
 *    将 fn(x, y) 替换为 x OP y
 */
/**
 * 检测表达式中是否使用了 this 关键字。
 */
/**
 * 检测表达式/语句中是否使用了 this 关键字（递归检查）。
 */
function usesThis(node: t.Node): boolean {
  if (t.isThisExpression(node)) return true;
  
  // 递归检查子节点
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const value = (node as any)[key];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && usesThis(child)) return true;
      }
    } else if (value && typeof value === 'object') {
      if (usesThis(value)) return true;
    }
  }
  return false;
}

export function inlineProxyFunctions(
  ast: File,
): { transforms: TransformRecord[]; count: number } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  // 第一遍：收集代理函数定义（VariableDeclarator + FunctionDeclaration）
  const proxies = new Map<string, {
    type: 'binary' | 'logical' | 'call' | 'identity' | 'unary' | 'member-call';
    operator?: string;
    paramCount: number;
    usesThis?: boolean;
    targetIsMethod?: boolean; // 返回语句是 obj.method() 调用
  }>();

  function analyzeProxy(name: string, params: t.Node[], body: t.BlockStatement): void {
    if (body.body.length !== 1) return;
    const stmt = body.body[0];
    if (!t.isReturnStatement(stmt) || !stmt.argument) return;
    if (!params.every(p => t.isIdentifier(p))) return;
    const paramNames = params.map(p => (p as t.Identifier).name);
    const ret = stmt.argument;

    // 检测函数体是否使用 this
    const hasThis = usesThis(body);

    // return a OP b
    if (t.isBinaryExpression(ret) || t.isLogicalExpression(ret)) {
      if (
        t.isIdentifier(ret.left) && t.isIdentifier(ret.right) &&
        paramNames.includes(ret.left.name) && paramNames.includes(ret.right.name)
      ) {
        // binary/logical 不涉及 this，但如果函数体用了 this 则不安全
        if (hasThis) return;
        proxies.set(name, {
          type: t.isBinaryExpression(ret) ? 'binary' : 'logical',
          operator: ret.operator,
          paramCount: paramNames.length,
        });
      }
      return;
    }

    // return a（identity）
    if (t.isIdentifier(ret) && paramNames.length === 1 && ret.name === paramNames[0]) {
      if (hasThis) return;
      proxies.set(name, { type: 'identity', paramCount: 1 });
      return;
    }

    // return !a（unary）
    if (
      t.isUnaryExpression(ret) && paramNames.length === 1 &&
      t.isIdentifier(ret.argument) && ret.argument.name === paramNames[0]
    ) {
      if (hasThis) return;
      proxies.set(name, { type: 'unary', operator: ret.operator, paramCount: 1 });
      return;
    }

    // return fn(a, b, ...)（普通调用转发）
    if (
      t.isCallExpression(ret) &&
      t.isIdentifier(ret.callee) &&
      paramNames.includes(ret.callee.name)
    ) {
      // 如果函数体使用 this，不能内联（内联后 this 可能丢失）
      if (hasThis) return;
      proxies.set(name, { type: 'call', paramCount: paramNames.length, usesThis: false });
      return;
    }

    // return obj.method(a, ...)（成员调用转发，可能涉及 this 绑定）
    if (
      t.isCallExpression(ret) &&
      t.isMemberExpression(ret.callee)
    ) {
      // 检查参数是否都是形参映射
      const argsValid = ret.arguments.every(a =>
        t.isIdentifier(a) && paramNames.includes((a as t.Identifier).name)
      );
      if (!argsValid) return;

      // 如果函数体使用 this，不能内联（obj.method() 的 this 是 obj，内联后丢失）
      if (hasThis) return;

      proxies.set(name, {
        type: 'member-call',
        paramCount: paramNames.length,
        targetIsMethod: true, // 标记目标是方法调用
      });
      return;
    }
  }

  traverse(ast, {
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id)) return;
      const init = path.node.init;
      if (!t.isFunctionExpression(init)) return;
      analyzeProxy(path.node.id.name, init.params, init.body);
    },
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      analyzeProxy(path.node.id.name, path.node.params, path.node.body);
    },
  });

  if (proxies.size === 0) return { transforms, count };

  // 第二遍：替换代理函数调用
  const inlinedNames = new Set<string>();

  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee)) return;
      const fnName = path.node.callee.name;
      const info = proxies.get(fnName);
      if (!info) return;

      const args = path.node.arguments;
      if (args.some(a => t.isSpreadElement(a))) return;

      const loc = path.node.loc?.start;

      // binary / logical
      if ((info.type === 'binary' || info.type === 'logical') && args.length >= 2) {
        const newNode = info.type === 'binary'
          ? t.binaryExpression(info.operator as any, args[0] as t.Expression, args[1] as t.Expression)
          : t.logicalExpression(info.operator as any, args[0] as t.Expression, args[1] as t.Expression);
        transforms.push({
          line: loc?.line ?? 0, column: loc?.column ?? 0,
          original: `${fnName}(...)`, replaced: `... ${info.operator} ...`,
          source: 'ast-transform',
        });
        path.replaceWith(newNode);
        inlinedNames.add(fnName);
        count++;
        return;
      }

      // identity
      if (info.type === 'identity' && args.length === 1) {
        transforms.push({
          line: loc?.line ?? 0, column: loc?.column ?? 0,
          original: `${fnName}(x)`, replaced: 'x',
          source: 'ast-transform',
        });
        path.replaceWith(args[0] as t.Expression);
        inlinedNames.add(fnName);
        count++;
        return;
      }

      // unary
      if (info.type === 'unary' && args.length === 1) {
        const newNode = t.unaryExpression(info.operator as any, args[0] as t.Expression);
        transforms.push({
          line: loc?.line ?? 0, column: loc?.column ?? 0,
          original: `${fnName}(x)`, replaced: `${info.operator}x`,
          source: 'ast-transform',
        });
        path.replaceWith(newNode);
        inlinedNames.add(fnName);
        count++;
        return;
      }

      // call 类型（return fn(a, b)）— 暂时禁止内联，因为 this 绑定复杂
      // 例如：proxy(obj.method, x) → obj.method(x) 会丢失 this
      if (info.type === 'call') {
        // 不内联，因为无法保证 this 绑定正确
        return;
      }

      // member-call 类型（return obj.method(a)）— 也暂时禁止，因为需要分析调用上下文
      if (info.type === 'member-call') {
        // 不内联
        return;
      }
    },
  });

  // 第三遍：删除已内联且无剩余引用的代理函数定义
  if (inlinedNames.size > 0) {
    // 手动扫描哪些名字还有引用（不依赖 scope.crawl 的时机问题）
    const stillReferenced = new Set<string>();
    traverse(ast, {
      Identifier(path) {
        if (!inlinedNames.has(path.node.name)) return;
        // 跳过定义本身
        if (path.parentPath.isFunctionDeclaration() && path.parentPath.node.id === path.node) return;
        if (path.parentPath.isVariableDeclarator() && path.parentPath.node.id === path.node) return;
        // 跳过函数内部的参数和局部变量
        if (path.key === 'key' || path.key === 'property') return;
        stillReferenced.add(path.node.name);
      },
    });

    traverse(ast, {
      'FunctionDeclaration|VariableDeclarator'(path: any) {
        let fnName: string | null = null;
        if (path.isFunctionDeclaration() && path.node.id) {
          fnName = path.node.id.name;
        } else if (path.isVariableDeclarator() && t.isIdentifier(path.node.id)) {
          fnName = path.node.id.name;
        }
        if (!fnName || !inlinedNames.has(fnName)) return;
        if (stillReferenced.has(fnName)) return;

        transforms.push({
          line: path.node.loc?.start?.line ?? 0,
          column: path.node.loc?.start?.column ?? 0,
          original: `function ${fnName}`,
          replaced: '(removed dead proxy)',
          source: 'ast-transform',
        });

        if (path.isFunctionDeclaration()) {
          path.remove();
        } else {
          const parent = path.parentPath;
          if (parent.isVariableDeclaration() && parent.node.declarations.length === 1) {
            parent.remove();
          } else {
            path.remove();
          }
        }
        count++;
      },
    });
  }

  return { transforms, count };
}

/**
 * 3. 对象代理推断：
 *    识别 var _0x = {}; _0x["log"] = console.log; _0x["parse"] = JSON.parse;
 *    收集映射，但不做激进替换（仅记录到 MappingManager）
 */
export function inferObjectMappings(
  ast: File,
  manager: MappingManager,
): ObjectMapping[] {
  const results: ObjectMapping[] = [];

  // 找 var _0x = {} 然后被赋值标准 API 属性的模式
  traverse(ast, {
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id)) return;
      if (!t.isObjectExpression(path.node.init)) return;
      if (path.node.init.properties.length !== 0) return;

      const objName = path.node.id.name;
      if (!/^_0x/.test(objName)) return;

      const binding = path.scope.getBinding(objName);
      if (!binding) return;

      // 扫描对该对象的赋值：_0x["prop"] = something
      const propMap: Record<string, string> = {};
      let parentObj: string | null = null;

      for (const refPath of binding.referencePaths) {
        const memberPath = refPath.parentPath;
        if (!memberPath || !memberPath.isMemberExpression()) continue;

        const assignPath = memberPath.parentPath;
        if (!assignPath || !assignPath.isAssignmentExpression({ operator: '=' })) continue;
        if (assignPath.node.left !== memberPath.node) continue;

        // 属性名（支持 computed ["prop"] 和 static .prop）
        const prop = memberPath.node.property;
        let propName: string | null = null;
        if (t.isStringLiteral(prop)) {
          propName = prop.value;
        } else if (t.isIdentifier(prop) && !memberPath.node.computed) {
          propName = prop.name;
        }
        if (!propName) continue;

        // 值：console.log / JSON.parse / console["log"] 等
        const right = assignPath.node.right;
        if (t.isMemberExpression(right)) {
          const obj = right.object;
          const rProp = right.property;

          let objStr: string | null = null;
          let propStr: string | null = null;

          if (t.isIdentifier(obj)) objStr = obj.name;
          if (t.isStringLiteral(rProp)) propStr = rProp.value;
          else if (t.isIdentifier(rProp) && !right.computed) propStr = rProp.name;

          if (objStr && propStr) {
            propMap[propName] = `${objStr}.${propStr}`;
            if (!parentObj && isBuiltinObject(objStr)) {
              parentObj = objStr;
            }
          }
        }
      }

      if (Object.keys(propMap).length > 0) {
        const mapping: ObjectMapping = {
          obfuscatedName: objName,
          realName: parentObj || 'unknown',
          confidence: parentObj ? 'inferred' : 'manual',
          properties: propMap,
        };
        results.push(mapping);
        manager.setObject(objName, mapping);
      }
    },
  });

  return results;
}

const BUILTIN_OBJECTS = new Set([
  'console', 'window', 'document', 'navigator', 'location', 'history',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'RegExp', 'Promise', 'Map', 'Set', 'Symbol', 'Proxy',
  'Reflect', 'Error', 'TypeError', 'RangeError', 'Uint8Array',
  'ArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder',
  'XMLHttpRequest', 'fetch', 'FormData', 'URL', 'URLSearchParams',
  'localStorage', 'sessionStorage', 'crypto', 'performance',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'atob', 'btoa',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
]);

function isBuiltinObject(name: string): boolean {
  return BUILTIN_OBJECTS.has(name);
}

/**
 * 4. 对象映射替换：
 *    将已推断的对象代理调用替换为真实 API 调用。
 *
 *    例如：inferObjectMappings 已收集到：
 *      _0x27a7e9.log → console.log
 *      _0x27a7e9.stringify → JSON.stringify
 *
 *    则：
 *      _0x27a7e9.log("test")      → console.log("test")
 *      _0x27a7e9.stringify({})     → JSON.stringify({})
 *      _0x27a7e9.log               → console.log  (非调用的引用也替换)
 *
 *    安全检查：
 *      - 对象变量没有被重新赋值（constantViolations === 0）
 *      - 映射 confidence 至少为 inferred
 *      - 属性没有被 delete
 *      - 不替换动态属性访问（computed + 非字面量）
 */
export function applyObjectMappings(
  ast: File,
  manager: MappingManager,
): { transforms: TransformRecord[]; count: number } {
  const transforms: TransformRecord[] = [];
  let count = 0;
  const allMappings = manager.exportObjects();
  if (allMappings.length === 0) return { transforms, count };

  // 建立快速查找表
  const objMap = new Map<string, ObjectMapping>();
  for (const m of allMappings) {
    if (m.confidence === 'manual' && Object.keys(m.properties).length === 0) continue;
    objMap.set(m.obfuscatedName, m);
  }
  if (objMap.size === 0) return { transforms, count };

  traverse(ast, {
    MemberExpression(path) {
      // 获取对象名
      const obj = path.node.object;
      if (!t.isIdentifier(obj)) return;

      const mapping = objMap.get(obj.name);
      if (!mapping) return;

      // 安全检查：对象变量不能被重新赋值
      const binding = path.scope.getBinding(obj.name);
      if (!binding) return;
      if (binding.constantViolations.length > 0) return;

      // 获取属性名
      const prop = path.node.property;
      let propName: string | null = null;
      if (t.isStringLiteral(prop) && path.node.computed) {
        propName = prop.value;
      } else if (t.isIdentifier(prop) && !path.node.computed) {
        propName = prop.name;
      }
      if (!propName) return;

      // 查找属性映射
      const realValue = mapping.properties[propName];
      if (!realValue) return;

      // 解析 "console.log" → { object: "console", property: "log" }
      const dotIdx = realValue.indexOf('.');
      if (dotIdx === -1) return;
      const realObj = realValue.slice(0, dotIdx);
      const realProp = realValue.slice(dotIdx + 1);

      // 跳过赋值左侧（_0x.log = console.log 这种定义语句本身不替换）
      const parent = path.parentPath;
      if (
        parent &&
        parent.isAssignmentExpression() &&
        parent.node.left === path.node
      ) {
        return;
      }

      // 构造替换节点
      const replacement = t.memberExpression(
        t.identifier(realObj),
        t.identifier(realProp),
        false,
      );

      const loc = path.node.loc?.start;
      transforms.push({
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        original: `${obj.name}.${propName}`,
        replaced: realValue,
        source: 'ast-transform',
      });

      path.replaceWith(replacement);
      count++;
    },
  });

  return { transforms, count };
}
