import { parse } from '@babel/parser';
import { readFileSync, writeFileSync } from 'node:fs';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

// Second independent pass: classify every top-level _0x-named declaration, count its literal-argument call sites, and report what the identifier really is.
// Babel only; no OB-Recover code; no target execution.
const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;
const ROOT = 'D:/Projects/ob-recover/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache';
const src = readFileSync(ROOT + '/source/script.js', 'utf8');
const ast = parse(src, { sourceType: 'script', allowReturnOutsideFunction: true, errorRecovery: true });
const HEX = /^_0x[0-9a-f]+$/;

const decls = new Map();
for (const st of ast.program.body) {
  if (t.isFunctionDeclaration(st) && st.id && HEX.test(st.id.name)) {
    decls.set(st.id.name, { kind: 'FunctionDeclaration', params: st.params.length, start: st.start, end: st.end });
  } else if (t.isVariableDeclaration(st)) {
    for (const d of st.declarations) {
      if (!t.isIdentifier(d.id) || !HEX.test(d.id.name)) continue;
      let kind = 'VariableDeclarator:other';
      if (t.isFunctionExpression(d.init)) kind = 'VariableDeclarator:FunctionExpression';
      else if (t.isArrowFunctionExpression(d.init)) kind = 'VariableDeclarator:Arrow';
      else if (t.isCallExpression(d.init)) kind = 'VariableDeclarator:CallExpression';
      else if (t.isArrayExpression(d.init)) kind = 'VariableDeclarator:Array';
      decls.set(d.id.name, { kind, params: d.init && d.init.params ? d.init.params.length : null, start: st.start, end: st.end });
    }
  }
}

const sites = new Map();
const totals = new Map();
traverse(ast, {
  CallExpression(path) {
    const n = path.node;
    if (!t.isIdentifier(n.callee) || !HEX.test(n.callee.name)) return;
    const name = n.callee.name;
    totals.set(name, (totals.get(name) || 0) + 1);
    if (!sites.has(name)) sites.set(name, []);
    const arr = sites.get(name);
    if (arr.length >= 600 || n.start == null || n.end == null || !n.loc) return;
    const allLiteral = n.arguments.length > 0 && n.arguments.every((a) => t.isNumericLiteral(a) || t.isStringLiteral(a));
    arr.push({
      line: n.loc.start.line - 1,
      col: n.loc.start.column,
      args: n.arguments.length,
      allLiteral,
      literalArgs: allLiteral ? n.arguments.map((a) => a.value) : null,
      text: src.slice(n.start, Math.min(n.end, n.start + 70)),
    });
  },
});

const rows = [...totals.entries()]
  .map(([name, calls]) => ({ name, calls, decl: decls.get(name) || null, literalSites: (sites.get(name) || []).filter((s) => s.allLiteral).length }))
  .sort((a, b) => b.calls - a.calls);

const out = { declarationCount: decls.size, calledHexNames: rows.length, rows: rows.slice(0, 30), literalSitesTop: {} };
for (const r of rows.slice(0, 6)) out.literalSitesTop[r.name] = (sites.get(r.name) || []).filter((s) => s.allLiteral).slice(0, 25);
writeFileSync(ROOT + '/recon/js-reverse/structure2.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.rows.slice(0, 12).map((r) => ({ name: r.name, calls: r.calls, decl: r.decl ? r.decl.kind : 'undeclared', params: r.decl ? r.decl.params : null, literalSites: r.literalSites })), null, 2));
