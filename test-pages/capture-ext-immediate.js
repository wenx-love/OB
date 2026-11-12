var _arr = ['Signature', 'hello', 'world', 'foo', 'bar', 'baz', 'qux', 'alpha', 'beta', 'gamma'];

function decOne(i) {
  i = i - 0x100;
  return _arr[i];
}

function decTwo(i, key) {
  i = i - 0x100;
  var s = _arr[i];
  return s + ':' + key;
}

function decNum(i) {
  return (i - 0x100) * 2;
}

// 顶层立即执行：解码调用在脚本解析时同步发生，这是插桩断点必须覆盖的场景
var __immediate = [];
__immediate.push(decOne(0x100));
__immediate.push(decOne(0x101));
__immediate.push(decTwo(0x103, 'yBNh'));
__immediate.push(decNum(0x105));
window.__extResult = __immediate;
window.__extImmediateAt = performance.now();
document.title = 'done';
