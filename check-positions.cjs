const parser = require('@babel/parser');

// 测试用例的源码
const source1 = `var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } dec(0); dec(1);`;

console.log('Source:', source1);
console.log('Length:', source1.length);
console.log();

for (let i = 58; i < 75; i++) {
  console.log(`[${i}]: '${source1[i]}'`);
}

console.log();

// 解析 AST
const ast = parser.parse(source1);
const traverse = require('@babel/traverse').default;

console.log('CallExpressions:');
traverse(ast, {
  CallExpression(path) {
    const n = path.node;
    console.log(`  ${n.callee.name}(...) at line ${n.loc.start.line}, col ${n.loc.start.column} - ${n.loc.end.column}`);
  }
});
