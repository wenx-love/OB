var _arr = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];

var decTable = (function (arr) {
  var decode = function (i) {
    i = i - 0x100;
    return _arr[i];
  };
  return decode;
})();

// 旋转：每转一次，同一个索引取到不同的值
function rotate(n) {
  while (n--) _arr.push(_arr.shift());
}

function collect(rounds) {
  var out = [];
  for (var r = 0; r < rounds; r++) {
    out.push(decTable(0x100));
    out.push(decTable(0x101));
    rotate(1);
  }
  return out;
}

// 旋转前先取一次稳定值，旋转若干轮后再取（稳定 + 不稳定混合）
window.__stabResult = collect(6);
window.__stabStable = decTable(0x100);
document.title = 'done';
