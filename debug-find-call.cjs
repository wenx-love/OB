const parser = require('@babel/parser');
const { findCallPathsAt } = require('./test-output/core/ast-locate.js');

const source = "var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);";
const ast = parser.parse(source);

console.log('Source:', source);
console.log();

// 测试位置 { lineNumber: 0, columnNumber: 58 }
const pos = { lineNumber: 0, columnNumber: 58 };
console.log('Testing CDP position:', pos);

const hits = findCallPathsAt(ast, pos);
console.log('findCallPathsAt result:', hits.length, 'hits');

if (hits.length > 0) {
  hits.forEach((hit, i) => {
    console.log(`\nHit ${i}:`);
    console.log('  kind:', hit.kind);
    console.log('  path.node.loc:', hit.path.node.loc);
  });
} else {
  console.log('\n[ERROR] No hits found!');
  
  console.log('\nDEBUG: Walking AST to find CallExpressions manually:');
  const traverse = require('@babel/traverse').default;
  traverse(ast, {
    CallExpression(path) {
      const n = path.node;
      console.log('Found CallExpression:');
      console.log('  loc.start:', n.loc?.start);
      console.log('  loc.end:', n.loc?.end);
      
      // 手动匹配
      const line = pos.lineNumber + 1;
      const match = n.loc && n.loc.start.line === line && n.loc.start.column === pos.columnNumber;
      console.log('  matches?', match, `(line ${line}, column ${pos.columnNumber})`);
    }
  });
}
