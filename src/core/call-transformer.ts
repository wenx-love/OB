import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { DecoderInfo, MappingEntry, TransformRecord } from '../types/index.js';
import { analyzeCallDeterminism, isStaticValue } from './deterministic.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/**
 * 遍历 AST，将所有确定性的解码器调用替换为字面量。
 *
 * 流程：
 *   1. 遍历所有 CallExpression
 *   2. 对每个调用进行确定性判断
 *   3. 在映射表中查找对应的值
 *   4. 替换 AST 节点
 *   5. 记录转换
 */
export function transformCalls(
  ast: File,
  code: string,
  decoders: DecoderInfo[],
  mappings: Record<string, MappingEntry>,
): { transforms: TransformRecord[]; resolved: number; skipped: number } {
  const transforms: TransformRecord[] = [];
  let resolved = 0;
  let skipped = 0;

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee)) return;

      // 从映射表查找：键是调用表达式的原文，手动「加入映射」也用同一套键
      const callText = code.slice(path.node.start!, path.node.end!);
      const mapping = mappings[callText];
      const isDecoderCall = decoders.some(d => d.name === callee.name);

      // 既不是已知解码器，也没有该调用文本的显式映射 → 不是我们的目标
      if (!isDecoderCall && !mapping) return;

      // 解码器调用仍要通过确定性分析，避免替换掉参数不固定的动态调用
      if (isDecoderCall) {
        const result = analyzeCallDeterminism(path, decoders);
        if (!result.deterministic) {
          skipped++;
          return;
        }
      } else if (!path.node.arguments.every((a) => isStaticValue(a))) {
        // 非解码器调用只有在参数全是字面量时才套用显式映射：
        // 带变量的调用，运行时求值结果取决于变量当时的值，不能当作固定替换
        return;
      }

      if (!mapping) {
        skipped++;
        return;
      }

      // 构造替换节点
      let replacement: t.Expression;
      switch (mapping.type) {
        case 'string':
          replacement = t.stringLiteral(mapping.value as string);
          break;
        case 'number':
          replacement = t.numericLiteral(mapping.value as number);
          break;
        case 'boolean':
          replacement = t.booleanLiteral(mapping.value as boolean);
          break;
        default:
          skipped++;
          return;
      }

      // 记录转换
      const loc = path.node.loc?.start;
      transforms.push({
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        original: callText,
        replaced: mapping.type === 'string'
          ? JSON.stringify(mapping.value)
          : String(mapping.value),
        source: mapping.source,
      });

      // 替换节点
      path.replaceWith(replacement);
      resolved++;
    },
  });

  return { transforms, resolved, skipped };
}
