import { readFileSync, writeFileSync } from 'node:fs';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import { parseCode } from '../src/core/parser.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;
const ROOT = 'D:/Projects/ob-recover';
const src = readFileSync(ROOT + '/test-pages/capture-proto.js', 'utf8');
const result = JSON.parse(readFileSync(ROOT + '/test/acceptance/phase3-engine-e2e-result.json', 'utf8'));
const ast = parseCode(src);
const lines = src.split(/\r?\n/);

const calls: t.CallExpression[] = [];
traverse(ast, { CallExpression(path) { calls.push(path.node); } });

const at = (p: any, line: number, col: number) => !!p && p.line === line && p.column === col;
const contains = (loc: any, line: number, col: number) =>
  (loc.start.line < line || (loc.start.line === line && loc.start.column <= col)) &&
  (loc.end.line > line || (loc.end.line === line && loc.end.column >= col));
const text = (n: any) => src.slice(n.start, n.end).slice(0, 80);
const calleeName = (n: t.CallExpression) =>
  t.isIdentifier(n.callee) ? n.callee.name : (t.isMemberExpression(n.callee) && t.isIdentifier(n.callee.property) && !n.callee.computed ? n.callee.property.name : null);

const out: any[] = [];
for (const r of result.rows) {
  const line = r.call.lineNumber + 1;
  const col = r.call.columnNumber;
  const fn = String(r.key).split('|')[0];
  const exact: any[] = [];
  let enclosing: any = null;
  for (const n of calls) {
    const kinds: string[] = [];
    if (at(n.loc!.start, line, col)) kinds.push('callExpr.start');
    if (at(n.callee.loc!.start, line, col) && !kinds.includes('callExpr.start')) kinds.push('callee.start');
    if (t.isMemberExpression(n.callee) && at(n.callee.property.loc!.start, line, col)) kinds.push('member.property.start');
    if (at(n.callee.loc!.end, line, col)) kinds.push('callee.end');
    if (kinds.length) exact.push({ kinds, callee: calleeName(n), callText: text(n) });
    if (contains(n.loc!, line, col)) {
      const len = n.end! - n.start!;
      if (!enclosing || len < enclosing.len) enclosing = { len, callee: calleeName(n), callText: text(n) };
    }
  }
  const sameName = calls.filter((n) => calleeName(n) === fn).map((n) => n.loc!.start.line + ':' + n.loc!.start.column + ' ' + text(n));
  out.push({ key: r.key, count: r.count, callLocation: line + ':' + col, sourceLine: (lines[line - 1] || '').slice(0, 120), exact, enclosingInnermost: enclosing, sameNameCallSites: sameName.length, sameName });
}
writeFileSync(ROOT + '/test/acceptance/phase3-2-calllocation-probe.json', JSON.stringify({ note: 'static probe: compares e2e callLocation (from capture-engine) with Babel CallExpression positions in capture-proto.js; no browser', rows: out }, null, 2));
console.log(JSON.stringify(out));
