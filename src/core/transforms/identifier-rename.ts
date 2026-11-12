import * as t from '@babel/types';
import type { File } from '@babel/types';
import { traverse, rec, type TransformRecord } from './_common.js';

export function identifierRename(ast: File): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;
  const OB_PATTERN = /^_0x[a-f0-9]{4,}/i;

  let funcCounter = 0;
  let varCounter = 0;
  let paramCounter = 0;
  const processed = new WeakSet<t.Node>();

  traverse(ast, {
    Scope(path) {
      const names = Object.keys(path.scope.bindings);
      for (const name of names) {
        if (!OB_PATTERN.test(name)) continue;

        const binding = path.scope.getBinding(name);
        if (!binding) continue;
        if (processed.has(binding.path.node)) continue;
        processed.add(binding.path.node);

        let newName: string;
        const bNode = binding.path.node;
        if (
          t.isFunctionDeclaration(bNode) ||
          (t.isVariableDeclarator(bNode) && bNode.init && t.isFunctionExpression(bNode.init))
        ) {
          newName = `func${++funcCounter}`;
        } else if (binding.kind === 'param') {
          newName = `p${++paramCounter}`;
        } else {
          newName = `v${++varCounter}`;
        }

        transforms.push(rec(bNode, name, newName));
        path.scope.rename(name, newName);
        count++;
      }
    },
  });

  return { count, transforms };
}
