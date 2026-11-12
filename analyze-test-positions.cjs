const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// 测试用例中的源码
const testCases = [
  { 
    name: '单个调用', 
    source: "var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);" 
  },
  { 
    name: '多个调用', 
    source: "var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } dec(0); dec(1);" 
  },
];

testCases.forEach(tc => {
  console.log(`\n=== ${tc.name} ===`);
  console.log('Source:', tc.source);
  console.log('Length:', tc.source.length);
  
  const ast = parser.parse(tc.source);
  const calls = [];
  
  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const loc = node.loc;
      if (loc && node.callee.type === 'Identifier') {
        calls.push({
          name: node.callee.name,
          line: loc.start.line,
          column: loc.start.column,
          linearStart: loc.start.index,
          linearEnd: loc.end.index,
          text: tc.source.slice(loc.start.index, loc.end.index),
        });
      }
    },
  });
  
  console.log('CallExpressions:');
  calls.forEach((c, i) => {
    console.log(`  [${i}] ${c.text}`);
    console.log(`      CDP position: { lineNumber: ${c.line - 1}, columnNumber: ${c.column} }`);
    console.log(`      start: ${c.linearStart}, end: ${c.linearEnd}`);
  });
});
