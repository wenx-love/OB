import * as t from '@babel/types';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import type { TransformRecord } from '../../types/index.js';

export const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;
export const generate = (typeof _generate === 'function' ? _generate : (_generate as any).default) as typeof _generate;

export function rec(node: t.Node, original: string, replaced: string): TransformRecord {
  return {
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
    original,
    replaced,
    source: 'ast-transform',
  };
}

export { t };
export type { TransformRecord };
