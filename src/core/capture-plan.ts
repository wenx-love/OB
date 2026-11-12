import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import { parseCode } from './parser.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/** CDP 位置，行列均从 0 开始 */
export interface CdpPosition {
  lineNumber: number;
  columnNumber: number;
}

export interface CapturePlan {
  supported: boolean;
  /** supported=false 时说明原因 */
  reason?: string;
  /** 入口断点：读取实际调用参数 */
  entry?: CdpPosition;
  /** 本函数自身的 return 语句位置（不含嵌套函数） */
  returns: CdpPosition[];
  /** 函数体右花括号位置：用于没有 return 的隐式返回 */
  closing?: CdpPosition;
  paramNames: string[];
}

function pos(p: { line: number; column: number }): CdpPosition {
  return { lineNumber: p.line - 1, columnNumber: p.column };
}

/**
 * 根据候选函数的定义偏移（Phase 2 的 location.start）计算运行时断点位置。
 * ownerStart 可以是函数节点本身，或持有该函数的 VariableDeclarator / AssignmentExpression / ObjectProperty 的起点。
 */
export function computeCapturePlan(source: string, ownerStart: number, ast?: File): CapturePlan {
  const file = ast ?? parseCode(source);
  const found: { plan: CapturePlan | null } = { plan: null };

  traverse(file, {
    Function(path) {
      if (found.plan) {
        path.stop();
        return;
      }
      const node = path.node;
      const parent = path.parent;
      let owned = node.start === ownerStart;
      if (!owned) {
        const holds =
          (t.isVariableDeclarator(parent) && parent.init === node) ||
          (t.isAssignmentExpression(parent) && parent.right === node) ||
          (t.isObjectProperty(parent) && parent.value === node);
        owned = holds && (parent as t.Node).start === ownerStart;
      }
      if (!owned) return;

      const paramNames: string[] = [];
      for (const p of node.params) {
        if (t.isIdentifier(p)) paramNames.push(p.name);
        else {
          found.plan = { supported: false, reason: 'non-identifier parameter (destructuring/default/rest) is not supported', returns: [], paramNames };
          path.stop();
          return;
        }
      }
      if (!t.isBlockStatement(node.body) || !node.loc || !node.body.loc) {
        found.plan = { supported: false, reason: 'expression-bodied function has no block body to place return/closing breakpoints', returns: [], paramNames };
        path.stop();
        return;
      }

      const returns: CdpPosition[] = [];
      path.traverse({
        Function(inner) {
          inner.skip();
        },
        ReturnStatement(r) {
          if (r.node.loc) returns.push(pos(r.node.loc.start));
        },
      });
      const end = node.body.loc.end;
      // 入口取函数体第一条语句（函数体为空时取右花括号）：
      // 取函数节点起点时，V8 对 `var f = function(){}` 这类形式不会对齐到函数体内，只会在定义时命中一次
      const firstStmt = node.body.body[0];
      const entryLoc = firstStmt && firstStmt.loc ? firstStmt.loc.start : { line: end.line, column: Math.max(0, end.column - 1) };
      found.plan = {
        supported: true,
        entry: pos(entryLoc),
        returns,
        closing: pos({ line: end.line, column: Math.max(0, end.column - 1) }),
        paramNames,
      };
      path.stop();
    },
  });

  return found.plan ?? { supported: false, reason: 'function node not found at the given offset', returns: [], paramNames: [] };
}
