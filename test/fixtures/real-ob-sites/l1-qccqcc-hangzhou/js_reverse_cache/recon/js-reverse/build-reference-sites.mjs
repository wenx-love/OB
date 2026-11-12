import { parse } from '@babel/parser';
import { readFileSync, writeFileSync } from 'node:fs';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

// Independent reference builder, part 1: resolve every var alias that ultimately points at the global decoder _0x374d,
// then collect each call site of such an alias that passes exactly two literal arguments (the jsjiami v7 per-string cipher form).
// Babel only; no OB-Recover code; no target execution. Values are produced later by one read-only call in the browser.
const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;
const ROOT = 'D:/Projects/ob-recover/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache';
const src = readFileSync(ROOT + '/source/script.js', 'utf8');
const ast = parse(src, { sourceType: 'script', allowReturnOutsideFunction: true, errorRecovery: true });
const ROOT_NAME = '_0x374d';

// alias edges: localName -> targetName, only for `var X = Y;` and `var X = Y, ...` where both are _0x identifiers
const edges = new Map();
traverse(ast, {
  VariableDeclarator(path) {
    const n = path.node;
    if (t.isIdentifier(n.id) && t.isIdentifier(n.init) && /^_0x[0-9a-f]+$/.test(n.id.name) && /^_0x[0-9a-f]+$/.test(n.init.name)) {
      if (!edges.has(n.id.name)) edges.set(n.id.name, new Set());
      edges.get(n.id.name).add(n.init.name);
    }
  },
});

function resolvesToRoot(name, seen = new Set()) {
  if (name === ROOT_NAME) return true;
  if (seen.has(name)) return false;
  seen.add(name);
  const targets = edges.get(name);
  if (!targets) return false;
  for (const x of targets) if (resolvesToRoot(x, seen)) return true;
  return false;
}

const aliasNames = [...edges.keys()].filter((n) => resolvesToRoot(n));
const roots = new Set([ROOT_NAME, ...aliasNames]);

const sites = [];
traverse(ast, {
  CallExpression(path) {
    const n = path.node;
    if (!t.isIdentifier(n.callee) || !roots.has(n.callee.name)) return;
    if (n.arguments.length !== 2) return;
    const [a, b] = n.arguments;
    if (!t.isNumericLiteral(a) || !t.isStringLiteral(b)) return;
    if (n.start == null || !n.loc) return;
    sites.push({ callee: n.callee.name, line: n.loc.start.line - 1, col: n.loc.start.column, a: a.value, b: b.value, text: src.slice(n.start, Math.min(n.end, n.start + 60)) });
  },
});

sites.sort((x, y) => x.line - y.line || x.col - y.col);
const pairs = [...new Map(sites.map((s) => [s.a + '|' + s.b, { a: s.a, b: s.b }])).values()];
const out = {
  rootDecoder: ROOT_NAME,
  aliasCount: aliasNames.length,
  aliasSample: aliasNames.slice(0, 20),
  siteCount: sites.length,
  uniquePairs: pairs.length,
  positionsUnique: new Set(sites.map((s) => s.line + ':' + s.col)).size,
  sites,
  pairs,
};
writeFileSync(ROOT + '/recon/js-reverse/reference-sites.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ aliasCount: aliasNames.length, siteCount: sites.length, uniquePairs: pairs.length, aliasSample: aliasNames.slice(0, 8) }, null, 2));
