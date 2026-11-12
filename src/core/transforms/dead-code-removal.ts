import * as t from '@babel/types';
import type { File } from '@babel/types';
import { traverse, rec, type TransformRecord } from './_common.js';

export function deadCodeRemoval(ast: File): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  traverse(ast, {
    IfStatement(path) {
      const evaluated = path.get('test').evaluate();
      if (!evaluated.confident) return;

      if (evaluated.value) {
        const consequent = path.node.consequent;
        const r = rec(path.node, 'if(true){...}', '(consequent kept)');
        if (t.isBlockStatement(consequent)) {
          path.replaceWithMultiple(consequent.body);
        } else {
          path.replaceWith(consequent);
        }
        transforms.push(r);
        count++;
      } else {
        const r = path.node.alternate
          ? rec(path.node, 'if(false){...}else{...}', '(alternate kept)')
          : rec(path.node, 'if(false){...}', '(removed)');
        if (path.node.alternate) {
          const alt = path.node.alternate;
          if (t.isBlockStatement(alt)) {
            path.replaceWithMultiple(alt.body);
          } else {
            path.replaceWith(alt);
          }
        } else {
          path.remove();
        }
        transforms.push(r);
        count++;
      }
    },

    WhileStatement(path) {
      const evaluated = path.get('test').evaluate();
      if (evaluated.confident && !evaluated.value) {
        transforms.push(rec(path.node, 'while(false){...}', '(removed)'));
        path.remove();
        count++;
      }
    },

    ConditionalExpression(path) {
      const testResult = path.get('test').evaluate();
      if (!testResult.confident) return;
      if (testResult.value) {
        transforms.push(rec(path.node, 'cond ? A : B', 'A (truthy)'));
        path.replaceWith(path.node.consequent);
      } else {
        transforms.push(rec(path.node, 'cond ? A : B', 'B (falsy)'));
        path.replaceWith(path.node.alternate);
      }
      count++;
    },
  });

  return { count, transforms };
}
