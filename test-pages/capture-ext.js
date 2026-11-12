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

function runAll() {
  var out = [];
  out.push(decOne(0x100));
  out.push(decOne(0x101));
  out.push(decOne(0x101));
  out.push(decTwo(0x103, 'yBNh'));
  out.push(decNum(0x105));
  window.__extResult = out;
  window.__extRuns = (window.__extRuns || 0) + 1;
  document.title = 'done';
  return out;
}

// 延迟触发，给扩展时间 attach 并布置断点
window.__scheduled = true;
window.__extTimer = setTimeout(runAll, 3500);
