import * as t from '@babel/types';
import type { File } from '@babel/types';
import { traverse, generate, rec, type TransformRecord } from './_common.js';

export function constantFolding(ast: File): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  traverse(ast, {
    BinaryExpression(path) {
      const result = path.evaluate();
      if (!result.confident) return;
      const val = result.value;

      let before: string;
      try {
        before = generate(path.node, { compact: true }).code;
      } catch {
        before = '(expression)';
      }

      if (typeof val === 'string') {
        transforms.push(rec(path.node, before, JSON.stringify(val)));
        path.replaceWith(t.stringLiteral(val));
        count++;
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        transforms.push(rec(path.node, before, String(val)));
        if (val < 0) {
          path.replaceWith(t.unaryExpression('-', t.numericLiteral(-val)));
        } else {
          path.replaceWith(t.numericLiteral(val));
        }
        count++;
      } else if (typeof val === 'boolean') {
        transforms.push(rec(path.node, before, String(val)));
        path.replaceWith(t.booleanLiteral(val));
        count++;
      }
    },
  });

  return { count, transforms };
}
