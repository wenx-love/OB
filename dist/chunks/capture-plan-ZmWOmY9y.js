import { _ as _traverse, p as parseCode, l as libExports } from "./parser-BGlb7RAx.js";
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
function pos(p) {
  return { lineNumber: p.line - 1, columnNumber: p.column };
}
function computeCapturePlan(source, ownerStart, ast) {
  const file = ast ?? parseCode(source);
  const found = { plan: null };
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
        const holds = libExports.isVariableDeclarator(parent) && parent.init === node || libExports.isAssignmentExpression(parent) && parent.right === node || libExports.isObjectProperty(parent) && parent.value === node;
        owned = holds && parent.start === ownerStart;
      }
      if (!owned) return;
      const paramNames = [];
      for (const p of node.params) {
        if (libExports.isIdentifier(p)) paramNames.push(p.name);
        else {
          found.plan = { supported: false, reason: "non-identifier parameter (destructuring/default/rest) is not supported", returns: [], paramNames };
          path.stop();
          return;
        }
      }
      if (!libExports.isBlockStatement(node.body) || !node.loc || !node.body.loc) {
        found.plan = { supported: false, reason: "expression-bodied function has no block body to place return/closing breakpoints", returns: [], paramNames };
        path.stop();
        return;
      }
      const returns = [];
      path.traverse({
        Function(inner) {
          inner.skip();
        },
        ReturnStatement(r) {
          if (r.node.loc) returns.push(pos(r.node.loc.start));
        }
      });
      const end = node.body.loc.end;
      const firstStmt = node.body.body[0];
      const entryLoc = firstStmt && firstStmt.loc ? firstStmt.loc.start : { line: end.line, column: Math.max(0, end.column - 1) };
      found.plan = {
        supported: true,
        entry: pos(entryLoc),
        returns,
        closing: pos({ line: end.line, column: Math.max(0, end.column - 1) }),
        paramNames
      };
      path.stop();
    }
  });
  return found.plan ?? { supported: false, reason: "function node not found at the given offset", returns: [], paramNames: [] };
}
export {
  computeCapturePlan as c
};
