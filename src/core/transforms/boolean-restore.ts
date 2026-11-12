import * as t from '@babel/types';
import type { File } from '@babel/types';
import { traverse, rec, type TransformRecord } from './_common.js';

export function booleanRestore(ast: File): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  traverse(ast, {
    UnaryExpression(path) {
      if (path.node.operator !== '!') return;
      const arg = path.node.argument;

      // !0 → true
      if (t.isNumericLiteral(arg, { value: 0 })) {
        transforms.push(rec(path.node, '!0', 'true'));
        path.replaceWith(t.booleanLiteral(true));
        count++;
        return;
      }

      // !1 → false
      if (t.isNumericLiteral(arg, { value: 1 })) {
        transforms.push(rec(path.node, '!1', 'false'));
        path.replaceWith(t.booleanLiteral(false));
        count++;
        return;
      }

      // ![] → false
      if (t.isArrayExpression(arg) && arg.elements.length === 0) {
        transforms.push(rec(path.node, '![]', 'false'));
        path.replaceWith(t.booleanLiteral(false));
        count++;
        return;
      }

      // !"" → true
      if (t.isStringLiteral(arg) && arg.value === '') {
        transforms.push(rec(path.node, '!""', 'true'));
        path.replaceWith(t.booleanLiteral(true));
        count++;
        return;
      }

      // !!X → resolve double negation
      if (t.isUnaryExpression(arg, { operator: '!' })) {
        const inner = arg.argument;
        if (t.isArrayExpression(inner) && inner.elements.length === 0) {
          transforms.push(rec(path.node, '!![]', 'true'));
          path.replaceWith(t.booleanLiteral(true));
          count++;
          return;
        }
        if (t.isNumericLiteral(inner, { value: 0 })) {
          transforms.push(rec(path.node, '!!0', 'false'));
          path.replaceWith(t.booleanLiteral(false));
          count++;
          return;
        }
        if (t.isNumericLiteral(inner, { value: 1 })) {
          transforms.push(rec(path.node, '!!1', 'true'));
          path.replaceWith(t.booleanLiteral(true));
          count++;
          return;
        }
        if (t.isStringLiteral(inner) && inner.value === '') {
          transforms.push(rec(path.node, '!!""', 'false'));
          path.replaceWith(t.booleanLiteral(false));
          count++;
          return;
        }
        if (t.isStringLiteral(inner) && inner.value !== '') {
          transforms.push(rec(path.node, '!!"..."', 'true'));
          path.replaceWith(t.booleanLiteral(true));
          count++;
          return;
        }
      }
    },
  });

  return { count, transforms };
}
