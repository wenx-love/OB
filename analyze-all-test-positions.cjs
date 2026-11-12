const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const testCases = [
  `var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);`,
  `var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } dec(0); dec(1);`,
  `var x = 1;`,
  `var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } function enc(i) { return _arr[i]; } dec(0); enc(1);`,
  `var _arr = ["a'b", 'c"d']; function dec(i) { return _arr[i]; } dec(0); dec(1);`,
  `var _arr = [null]; function dec(i) { return _arr[i]; } dec(0);`,
  `var _arr = [42, 3.14]; function dec(i) { return _arr[i]; } dec(0); dec(1);`,
  `var _arr = [true, false]; function dec(i) { return _arr[i]; } dec(0); dec(1);`,
  `var _arr = ['你好', 'a\\nb']; function dec(i) { return _arr[i]; } dec(0); dec(1);`,
];

testCases.forEach((source, idx) => {
  console.log(`\n=== Case ${idx + 1}: ${source.slice(0, 40)}... ===`);
  
  const ast = parser.parse(source);
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
          text: source.slice(loc.start.index, loc.end.index),
        });
      }
    },
  });
  
  if (calls.length > 0) {
    console.log('CallExpressions:');
    calls.forEach((c, i) => {
      console.log(`  [${i}] ${c.text}`);
      console.log(`      position: { lineNumber: ${c.line - 1}, columnNumber: ${c.column} },`);
      console.log(`      start: ${c.linearStart}, end: ${c.linearEnd},`);
    });
  } else {
    console.log('No CallExpressions');
  }
});
