import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const source = "var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);";
const ast = parse(source);

console.log('Source:', source);
console.log('Length:', source.length);
console.log();

traverse(ast, {
  CallExpression(path) {
    const node = path.node;
    const loc = node.loc;
    const start = loc?.start;
    const end = loc?.end;
    console.log('CallExpression:');
    console.log('  node.callee:', node.callee.type, node.callee.type === 'Identifier' ? node.callee.name : '');
    console.log('  loc.start:', start);
    console.log('  loc.end:', end);
    if (start) {
      const linearPos = source.split('\n').slice(0, start.line - 1).join('\n').length + (start.line > 1 ? 1 : 0) + start.column;
      console.log('  Linear position:', linearPos);
      console.log('  Char at start:', source[linearPos]);
    }
  },
});
