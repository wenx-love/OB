import { parse } from '@babel/parser';
import { readFileSync, writeFileSync } from 'node:fs';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

// Independent structural analysis of the archived L1 script. Babel only: it imports nothing from OB-Recover, so it can serve as reference-side evidence.
// It reports function declarations, their sizes, call counts by name, and the call sites of the most called identifiers, without executing any target code.
const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;
const ROOT = 'D:/Projects/ob-recover/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache';
const src = readFileSync(ROOT + '/source/script.js', 'utf8');
const ast = parse(src, { sourceType: 'script', allowReturnOutsideFunction: true, errorRecovery: true });

const fns = [];
const callsByName = new Map();
const callSites = new Map();
const literals = [];
let strArrayDecl = null;
let rotateHit = null;

traverse(ast, {
  FunctionDeclaration(path) {
    const n = path.node;
    const name = n.id ? n.id.name : '(anonymous)';
    fns.push({ name, start: n.start, end: n.end, params: n.params.length, topLevel: path.parentPath.isProgram() });
  },
  CallExpression(path) {
    const n = path.node;
    let name = null;
    if (t.isIdentifier(n.callee)) name = n.callee.name;
    else if (t.isMemberExpression(n.callee) && !n.callee.computed && t.isIdentifier(n.callee.property)) name = '.' + n.callee.property.name;
    if (!name) return;
    callsByName.set(name, (callsByName.get(name) || 0) + 1);
    if (!callSites.has(name)) callSites.set(name, []);
    const arr = callSites.get(name);
    if (arr.length < 400 && n.start != null && n.end != null && n.loc) {
      const allLiteral = n.arguments.length > 0 && n.arguments.every((a) => t.isNumericLiteral(a) || t.isStringLiteral(a));
      arr.push({ line: n.loc.start.line - 1, col: n.loc.start.column, args: n.arguments.length, allLiteral, text: src.slice(n.start, Math.min(n.end, n.start + 90)) });
    }
  },
  VariableDeclarator(path) {
    const n = path.node;
    if (t.isIdentifier(n.id) && t.isArrayExpression(n.init) && n.init.elements.length > 200 && !strArrayDecl) {
      strArrayDecl = { name: n.id.name, elements: n.init.elements.length, start: n.start, end: n.end };
    }
  },
});

// rotation IIFE: a top-level expression statement whose subtree references both push and shift
function walk(node, visit) {
  if (Array.isArray(node)) { for (const c of node) walk(c, visit); return; }
  if (node && typeof node === 'object' && typeof node.type === 'string') {
    visit(node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      walk(node[k], visit);
    }
  }
}
for (const st of ast.program.body) {
  if (st.start == null || st.end == null) continue;
  const props = new Set();
  walk(st, (n) => {
    if (n.type !== 'MemberExpression') return;
    if (n.computed && n.property && n.property.type === 'StringLiteral') props.add(n.property.value);
    else if (!n.computed && n.property && n.property.type === 'Identifier') props.add(n.property.name);
  });
  if (props.has('push') && props.has('shift')) { rotateHit = { start: st.start, end: st.end }; break; }
}

const top = [...callsByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, count]) => ({ name, count }));
const decoderLike = fns.filter((f) => /^_0x[0-9a-f]+$/.test(f.name)).map((f) => ({ name: f.name, params: f.params, topLevel: f.topLevel, calls: callsByName.get(f.name) || 0, bytes: f.end - f.start }));

const out = {
  targetLength: src.length,
  parseErrors: ast.errors ? ast.errors.length : 0,
  topLevelStatements: ast.program.body.length,
  functionDeclarations: fns.length,
  hexNamedFunctions: decoderLike,
  stringArrayDecl: strArrayDecl,
  rotationIIFE: rotateHit,
  topCalls: top,
  samples: {
    _0x374d: (callSites.get('_0x374d') || []).slice(0, 40),
  },
};
writeFileSync(ROOT + '/recon/js-reverse/structure.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, fns: fns.length, hex: decoderLike.length, strArray: strArrayDecl ? strArrayDecl.elements : null, rotate: !!rotateHit, bytes: src.length }, null, 2));
