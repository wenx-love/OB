const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { findCallPathsAt } = require('./dist/core/ast-locate.js');

const source = "var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);";
const ast = parser.parse(source);

console.log('Source:', source);
console.log();

// 测试位置 { lineNumber: 0, columnNumber: 58 }
const pos = { lineNumber: 0, columnNumber: 58 };
console.log('Testing position:', pos);

const hits = findCallPathsAt(ast, pos);
console.log('findCallPathsAt result:', hits);
console.log('Number of hits:', hits.length);

if (hits.length > 0) {
  hits.forEach((hit, i) => {
    console.log(`\nHit ${i}:`);
    console.log('  kind:', hit.kind);
    console.log('  calleeName:', hit.calleeName);
    console.log('  start:', hit.start);
    console.log('  end:', hit.end);
  });
}
