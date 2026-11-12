import * as t from '@babel/types';
import type { File } from '@babel/types';
import { traverse, rec, type TransformRecord } from './_common.js';

export function controlFlowRecovery(ast: File): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  traverse(ast, {
    WhileStatement(path) {
      const test = path.node.test;
      const isTruthy =
        t.isBooleanLiteral(test, { value: true }) ||
        (t.isUnaryExpression(test, { operator: '!' }) && t.isNumericLiteral(test.argument, { value: 0 })) ||
        t.isNumericLiteral(test, { value: 1 });

      if (!isTruthy) return;

      const body = path.node.body;
      if (!t.isBlockStatement(body)) return;

      const switchStmt = body.body.find((s): s is t.SwitchStatement => t.isSwitchStatement(s));
      if (!switchStmt) return;

      const disc = switchStmt.discriminant;
      if (!t.isMemberExpression(disc) || !t.isIdentifier(disc.object)) return;

      let indexIdent: t.Identifier | null = null;
      if (
        t.isUpdateExpression(disc.property, { operator: '++' }) &&
        t.isIdentifier((disc.property as t.UpdateExpression).argument)
      ) {
        indexIdent = (disc.property as t.UpdateExpression).argument as t.Identifier;
      }
      if (!indexIdent) return;

      const arrayName = disc.object.name;
      const binding = path.scope.getBinding(arrayName);
      if (!binding) return;

      const declNode = binding.path.node;
      if (!t.isVariableDeclarator(declNode) || !declNode.init) return;

      const init = declNode.init;
      if (
        !t.isCallExpression(init) ||
        !t.isMemberExpression(init.callee) ||
        !t.isStringLiteral(init.callee.object) ||
        !t.isIdentifier(init.callee.property, { name: 'split' }) ||
        init.arguments.length !== 1 ||
        !t.isStringLiteral(init.arguments[0], { value: '|' })
      ) {
        return;
      }

      const orderArray = init.callee.object.value.split('|');

      const caseMap = new Map<string, t.Statement[]>();
      for (const c of switchStmt.cases) {
        if (!c.test || !t.isStringLiteral(c.test)) continue;
        const stmts = c.consequent.filter(s => !t.isContinueStatement(s) && !t.isBreakStatement(s));
        caseMap.set(c.test.value, stmts);
      }

      const orderedStmts: t.Statement[] = [];
      for (const key of orderArray) {
        const stmts = caseMap.get(key);
        if (stmts) orderedStmts.push(...stmts);
      }

      transforms.push(rec(
        path.node,
        `while(true){switch(${arrayName}[...]){${switchStmt.cases.length} cases}}`,
        `${orderedStmts.length} statements inlined`,
      ));

      const arrayDeclPath = binding.path;
      const idxBinding = path.scope.getBinding(indexIdent.name);

      path.replaceWithMultiple(orderedStmts);

      try {
        if (arrayDeclPath.parentPath && t.isVariableDeclaration(arrayDeclPath.parentPath.node)) {
          if (arrayDeclPath.parentPath.node.declarations.length === 1) {
            arrayDeclPath.parentPath.remove();
          } else {
            arrayDeclPath.remove();
          }
        }
      } catch { /* already removed */ }

      try {
        if (idxBinding?.path.parentPath && t.isVariableDeclaration(idxBinding.path.parentPath.node)) {
          if (idxBinding.path.parentPath.node.declarations.length === 1) {
            idxBinding.path.parentPath.remove();
          } else {
            idxBinding.path.remove();
          }
        }
      } catch { /* already removed */ }

      count++;
    },
  });

  return { count, transforms };
}
