import type { File } from '@babel/types';
import { traverse, rec, type TransformRecord } from './_common.js';

export function hexNumericRestore(ast: File): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  traverse(ast, {
    NumericLiteral(path) {
      const extra = (path.node as any).extra;
      if (extra?.raw && /^0[xXoObB]/.test(extra.raw)) {
        transforms.push(rec(path.node, extra.raw as string, String(path.node.value)));
        delete (path.node as any).extra;
        count++;
      }
    },
  });

  return { count, transforms };
}
