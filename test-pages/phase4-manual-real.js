var _0xa1 = ['Zm9v', 'YmFy', 'Y29va2ll', 'c2lnbg==', 'dG9rZW4='];
(function (arr, n) {
  var rot = function (k) { while (--k) { arr.push(arr.shift()); } };
  rot(++n);
})(_0xa1, 0x3);
function _0xdec(i) {
  return atob(_0xa1[i - 0x0]);
}
function makeSigner(seed) {
  var closureSalt = 'salt-' + seed;
  var closureCount = seed * 2;
  return function innerSign(payload) {
    var localLabel = _0xdec(0x0);
    var localToken = _0xdec(0x1);
    var combined = localLabel + ':' + payload + ':' + closureSalt + ':' + closureCount;
    return combined + '|' + localToken;
  };
}
function midLevel(signer, payload) {
  var midMarker = 'mid-' + payload;
  return signer(payload) + '#' + midMarker;
}
function topLevel() {
  var signer = makeSigner(21);
  var out = midLevel(signer, 'p1');
  window.__obResult = out;
  document.getElementById('out').textContent = out;
  return out;
}
window.runManualTest = topLevel;
document.getElementById('run').addEventListener('click', topLevel);
