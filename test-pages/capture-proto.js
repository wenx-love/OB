var _0xarr = ['Signature', 'hello', 'world', 'foo', 'bar', 'baz', 'qux', 'alpha', 'beta', 'gamma'];

function decOne(i) {
  i = i - 0x100;
  return _0xarr[i];
}

function decTwo(i, key) {
  i = i - 0x100;
  var s = _0xarr[i];
  return s + ':' + key;
}

function decThree(i, key, salt) {
  i = i - 0x100;
  var s = _0xarr[i];
  return s + '|' + key + '|' + salt;
}

function decNum(i) {
  return (i - 0x100) * 2;
}

function decUndef(i) {
  var x = _0xarr[i - 0x100];
}

function decNull(i) {
  return null;
}

function decThrow(i) {
  if (i > 0) {
    throw new Error('decoder failed: ' + i);
  }
  return 'unreachable';
}

function decNested(i, key) {
  var inner = decOne(i);
  return decTwo(i, key) + '+' + inner;
}

function decLoop(i, key) {
  var s = _0xarr[i - 0x100];
  var acc = 0;
  for (var j = 0; j < 300; j++) {
    acc = (acc + s.length * (j + 1) + key.length) % 256;
  }
  return s + '#' + acc;
}

function runAll() {
  var out = [];
  out.push(decOne(0x100));
  out.push(decOne(0x101));
  out.push(decOne(0x101));
  out.push(decTwo(0x103, 'yBNh'));
  out.push(decThree(0x104, 'k', 's'));
  out.push(decNum(0x105));
  out.push(decUndef(0x106));
  out.push(decNull(0x107));
  try { decThrow(1); } catch (e) { out.push('caught:' + e.message); }
  out.push(decNested(0x108, 'nk'));
  out.push(decLoop(0x109, 'abc'));
  window.__protoResult = out;
  document.title = 'done';
  return out;
}

setTimeout(runAll, 2500);
