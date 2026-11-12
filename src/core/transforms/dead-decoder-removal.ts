import * as t from '@babel/types';
import type { File } from '@babel/types';
import { traverse, rec, type TransformRecord } from './_common.js';
import type { DecoderInfo } from '../../types/index.js';

function isInsideInfra(refPath: any, infraNames: Set<string>): boolean {
  let current = refPath.parentPath;
  while (current) {
    const node = current.node;
    if (t.isFunctionDeclaration(node) && node.id && infraNames.has(node.id.name)) return true;
    if (t.isVariableDeclarator(node) && t.isIdentifier(node.id) && infraNames.has(node.id.name)) return true;
    if (
      t.isExpressionStatement(node) &&
      t.isCallExpression(node.expression) &&
      (t.isFunctionExpression(node.expression.callee) || t.isArrowFunctionExpression(node.expression.callee))
    ) {
      if (node.expression.arguments.some((a: any) => t.isIdentifier(a) && infraNames.has(a.name))) return true;
    }
    current = current.parentPath;
  }
  return false;
}

function removeDeclPath(declPath: any): void {
  if (t.isVariableDeclarator(declPath.node)) {
    const parent = declPath.parentPath;
    if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
      parent.remove();
    } else {
      declPath.remove();
    }
  } else {
    declPath.remove();
  }
}

export function deadDecoderRemoval(
  ast: File,
  decoders: DecoderInfo[],
): { count: number; transforms: TransformRecord[] } {
  const transforms: TransformRecord[] = [];
  let count = 0;

  const infraNames = new Set<string>();
  for (const d of decoders) {
    infraNames.add(d.name);
    infraNames.add(d.arrayName);
  }

  traverse(ast, {
    Program(programPath) {
      programPath.scope.crawl();

      for (const decoder of decoders) {
        const fnBinding = programPath.scope.getBinding(decoder.name);
        if (fnBinding) {
          const hasExternal = fnBinding.referencePaths.some(
            (ref: any) => !isInsideInfra(ref, infraNames),
          );
          if (!hasExternal) {
            transforms.push(rec(fnBinding.path.node, `function ${decoder.name}`, '(removed)'));
            removeDeclPath(fnBinding.path);
            count++;
            programPath.scope.crawl();
          }
        }

        const bodyPaths = programPath.get('body');
        for (const stmtPath of bodyPaths) {
          if (!stmtPath.isExpressionStatement()) continue;
          const expr = stmtPath.node.expression;
          if (!t.isCallExpression(expr)) continue;
          if (!t.isFunctionExpression(expr.callee) && !t.isArrowFunctionExpression(expr.callee)) continue;
          if (expr.arguments.some((a: any) => t.isIdentifier(a, { name: decoder.arrayName }))) {
            transforms.push(rec(stmtPath.node, '(rotation IIFE)', '(removed)'));
            stmtPath.remove();
            count++;
            programPath.scope.crawl();
            break;
          }
        }

        const arrBinding = programPath.scope.getBinding(decoder.arrayName);
        if (arrBinding) {
          const hasExternal = arrBinding.referencePaths.some(
            (ref: any) => !isInsideInfra(ref, infraNames),
          );
          if (!hasExternal) {
            transforms.push(rec(arrBinding.path.node, `var ${decoder.arrayName}`, '(removed)'));
            removeDeclPath(arrBinding.path);
            count++;
            programPath.scope.crawl();
          }
        }
      }

      programPath.stop();
    },
  });

  return { count, transforms };
}
