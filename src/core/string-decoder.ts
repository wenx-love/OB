import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { DecoderInfo, MappingEntry, RecoverOptions } from '../types/index.js';

// ESM compat: @babel/traverse default export may be wrapped
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/**
 * 扫描 AST 顶层，识别 OB 字符串解密模式：
 *   1. 大字符串数组声明
 *   2. 旋转 IIFE（push/shift）
 *   3. 解码器函数（引用了字符串数组）
 */
export function detectDecoders(ast: File, code: string): DecoderInfo[] {
  const decoders: DecoderInfo[] = [];

  // 第一遍：找字符串数组
  const stringArrays = new Map<string, { node: t.Node; elements: string[] }>();

  for (const node of ast.program.body) {
    if (
      t.isVariableDeclaration(node) &&
      node.declarations.length === 1
    ) {
      const decl = node.declarations[0];
      if (
        t.isIdentifier(decl.id) &&
        t.isArrayExpression(decl.init) &&
        decl.init.elements.length >= 5 &&
        decl.init.elements.every(e => t.isStringLiteral(e))
      ) {
        stringArrays.set(decl.id.name, {
          node,
          elements: decl.init.elements.map(e => (e as t.StringLiteral).value),
        });
      }
    }
    // 也检测函数声明返回数组的模式
    if (
      t.isFunctionDeclaration(node) &&
      node.id &&
      node.body.body.length >= 1
    ) {
      const lastStmt = node.body.body[node.body.body.length - 1];
      if (
        t.isReturnStatement(lastStmt) &&
        t.isArrayExpression(lastStmt.argument) &&
        lastStmt.argument.elements.length >= 5 &&
        lastStmt.argument.elements.every(e => t.isStringLiteral(e))
      ) {
        stringArrays.set(node.id.name, {
          node,
          elements: lastStmt.argument.elements.map(e => (e as t.StringLiteral).value),
        });
      }
    }
  }

  if (stringArrays.size === 0) return decoders;

  // 第二遍：找旋转 IIFE 和解码器函数
  for (const [arrayName, arrayInfo] of stringArrays) {
    let rotateNode: t.Node | null = null;
    let decoderNode: t.Node | null = null;
    let decoderName: string | null = null;

    for (const node of ast.program.body) {
      if (node === arrayInfo.node) continue;

      // 旋转 IIFE：(function(arr, n){ ... push(shift) ... })(arrayName, 0xNN)
      if (
        t.isExpressionStatement(node) &&
        t.isCallExpression(node.expression) &&
        t.isFunctionExpression(node.expression.callee)
      ) {
        const src = code.slice(node.start!, node.end!);
        if (src.includes('push') && src.includes('shift') && src.includes(arrayName)) {
          rotateNode = node;
          continue;
        }
      }

      // 解码器函数：function _0xNNNN(idx, key) { ... arrayName ... }
      if (t.isFunctionDeclaration(node) && node.id) {
        const src = code.slice(node.start!, node.end!);
        if (src.includes(arrayName) && node.params.length >= 1) {
          decoderNode = node;
          decoderName = node.id.name;
          break;
        }
      }

      // 也检测 var decoder = function(...) { ... }
      if (
        t.isVariableDeclaration(node) &&
        node.declarations.length === 1 &&
        t.isIdentifier(node.declarations[0].id) &&
        t.isFunctionExpression(node.declarations[0].init)
      ) {
        const src = code.slice(node.start!, node.end!);
        if (src.includes(arrayName) && node.declarations[0].init.params.length >= 1) {
          decoderNode = node;
          decoderName = node.declarations[0].id.name;
          break;
        }
      }
    }

    if (!decoderName || !decoderNode) continue;

    // 提取解码器相关的所有源码（数组 + 旋转 + 解码器）
    const snippets: string[] = [];
    snippets.push(code.slice(arrayInfo.node.start!, arrayInfo.node.end!));
    if (rotateNode) snippets.push(code.slice(rotateNode.start!, rotateNode.end!));
    snippets.push(code.slice(decoderNode.start!, decoderNode.end!));

    // 猜测算法
    const decoderSrc = code.slice(decoderNode.start!, decoderNode.end!);
    let algorithm: DecoderInfo['algorithm'] = 'unknown';
    if (decoderSrc.includes('atob') || decoderSrc.includes('charAt')) {
      algorithm = decoderSrc.includes('% 256') || decoderSrc.includes('charCodeAt') ? 'rc4' : 'base64';
    } else if (!decoderSrc.includes('atob') && !decoderSrc.includes('escape')) {
      algorithm = 'none';
    }

    decoders.push({
      name: decoderName,
      arrayName,
      arrayNode: arrayInfo.node,
      rotateNode,
      decoderNode,
      decoderSource: snippets.join('\n'),
      algorithm,
    });
  }

  return decoders;
}

/**
 * 通过沙箱执行解码器，建立 callText → 解码值的映射表。
 * 穷举 index 0~maxIndex，对每个 index 尝试调用解码器。
 */
export async function buildDecoderMappings(
  decoder: DecoderInfo,
  ast: File,
  code: string,
  options: RecoverOptions,
): Promise<Record<string, MappingEntry>> {
  const mappings: Record<string, MappingEntry> = {};

  if (!options.sandboxEval) return mappings;

  // 收集 AST 中所有对该解码器的调用及其参数
  const calls = new Map<string, { args: (string | number)[] }>();

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee) || callee.name !== decoder.name) return;

      const args = path.node.arguments;
      const staticArgs: (string | number)[] = [];
      let allStatic = true;

      for (const arg of args) {
        if (t.isNumericLiteral(arg)) {
          staticArgs.push(arg.value);
        } else if (t.isStringLiteral(arg)) {
          staticArgs.push(arg.value);
        } else if (
          t.isUnaryExpression(arg, { operator: '-' }) &&
          t.isNumericLiteral(arg.argument)
        ) {
          staticArgs.push(-arg.argument.value);
        } else {
          allStatic = false;
          break;
        }
      }

      if (!allStatic || staticArgs.length === 0) return;

      const callText = code.slice(path.node.start!, path.node.end!);
      calls.set(callText, { args: staticArgs });
    },
  });

  if (calls.size === 0) return mappings;

  // 在沙箱中执行解码器，批量求值
  const entries = [...calls.entries()];
  const batchSize = 200;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    const evalLines = batch.map(([, { args }], idx) => {
      const argsStr = args.map(a => typeof a === 'string' ? JSON.stringify(a) : String(a)).join(',');
      return `try{__r[${idx}]=${decoder.name}(${argsStr})}catch(e){__r[${idx}]=null}`;
    });

    const evalCode =
      decoder.decoderSource + '\n' +
      `var __r=[];\n` +
      evalLines.join(';\n') + ';\n' +
      `__r`;

    try {
      const results = await options.sandboxEval(evalCode) as unknown[];
      if (!Array.isArray(results)) continue;

      for (let j = 0; j < batch.length && j < results.length; j++) {
        const [callText] = batch[j];
        const val = results[j];
        if (typeof val === 'string') {
          mappings[callText] = {
            callText,
            value: val,
            type: 'string',
            confidence: 'confirmed',
            source: 'sandbox-eval',
          };
        } else if (typeof val === 'number') {
          mappings[callText] = {
            callText,
            value: val,
            type: 'number',
            confidence: 'confirmed',
            source: 'sandbox-eval',
          };
        }
      }
    } catch {
      // 沙箱执行失败，跳过该批次
    }
  }

  return mappings;
}
