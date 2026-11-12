import _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { CdpPosition } from './capture-plan.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/**
 * Phase 3.2：运行时位置（CDP，行列从 0 开始）与 AST 节点之间的只读定位工具。
 * Babel 的行号从 1 开始、列号从 0 开始，这里统一换算；不修改 AST。
 */

/** 与 computeCapturePlan 一致的入口位置：函数体第一条语句起点；空函数体取右花括号 */
export function entryPositionOf(fn: t.Function): CdpPosition | null {
  if (!t.isBlockStatement(fn.body) || !fn.body.loc) return null;
  const end = fn.body.loc.end;
  const first = fn.body.body[0];
  const loc = first && first.loc ? first.loc.start : { line: end.line, column: Math.max(0, end.column - 1) };
  return { lineNumber: loc.line - 1, columnNumber: loc.column };
}

/** 找出入口位置恰好等于 entry 的函数。正常只有一个；多于一个说明定位有歧义 */
export function findFunctionPathsByEntry(ast: File, entry: CdpPosition): NodePath<t.Function>[] {
  const hits: NodePath<t.Function>[] = [];
  traverse(ast, {
    Function(path) {
      const p = entryPositionOf(path.node);
      if (p && p.lineNumber === entry.lineNumber && p.columnNumber === entry.columnNumber) hits.push(path);
    },
  });
  return hits;
}

/** 与 Decoder Discovery 的命名规则保持一致，用来核对「捕获记录里的函数名」和「源码里该位置的函数」是不是同一个 */
export function resolveFunctionName(path: NodePath<t.Function>): string | null {
  const node = path.node;
  const parent = path.parent;
  if (t.isFunctionDeclaration(node)) return node.id?.name ?? null;
  if (t.isVariableDeclarator(parent) && parent.init === node && t.isIdentifier(parent.id)) return parent.id.name;
  if (t.isAssignmentExpression(parent) && parent.right === node) {
    if (t.isIdentifier(parent.left)) return parent.left.name;
    if (t.isMemberExpression(parent.left) && t.isIdentifier(parent.left.property)) return parent.left.property.name;
    return null;
  }
  if (t.isObjectProperty(parent) && parent.value === node) {
    if (t.isIdentifier(parent.key)) return parent.key.name;
    if (t.isStringLiteral(parent.key)) return parent.key.value;
  }
  return null;
}

export type CallMatchKind = 'call-start' | 'member-property';

export interface CallAtPosition {
  path: NodePath<t.CallExpression>;
  kind: CallMatchKind;
}

/**
 * 找出「调用位置」对应的 CallExpression。
 * 只接受两种精确命中：调用表达式起点，或非计算成员调用（obj.fn()）的属性名起点。
 * 不按调用文本匹配：文本相同的调用可能有多个，位置才是唯一依据。
 */
export function findCallPathsAt(ast: File, pos: CdpPosition): CallAtPosition[] {
  const line = pos.lineNumber + 1;
  const hits: CallAtPosition[] = [];
  traverse(ast, {
    CallExpression(path) {
      const n = path.node;
      const s = n.loc?.start;
      if (s && s.line === line && s.column === pos.columnNumber) {
        hits.push({ path, kind: 'call-start' });
        return;
      }
      const c = n.callee;
      if (t.isMemberExpression(c) && !c.computed && c.property.loc && c.property.loc.start.line === line && c.property.loc.start.column === pos.columnNumber) {
        hits.push({ path, kind: 'member-property' });
      }
    },
  });
  return hits;
}
