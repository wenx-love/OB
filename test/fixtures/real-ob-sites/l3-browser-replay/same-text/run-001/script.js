// Phase 4.7 L3 controlled page: the same call text at several positions. NOT a real-site sample.
// New file. test-pages/phase4-position-level-auto.js is untouched. Created in the batch that wrote the L3 tests; NOT executed in that batch.
// Executed while the page loads (observable by the auto capture engine): positions A and C, same text _0x13d0(0x1).
// NOT executed while the page loads: position B (laterB) with the same text, and position D (shadowD) whose _0x13d0 is a different function.
// Expected recovery: A and C replaced by the observed value; B left as is (same text, never observed); D left as is (different binding).
// The truth is only computed on demand through window.__l3Truth(), so reading it never adds capture records during the capture window.
var _0x13a1 = ['Signature', 'Document', 'License', 'Header'];
(function (arr, n) {
  var rot = function (k) {
    while (--k) {
      arr.push(arr.shift());
    }
  };
  rot(++n);
})(_0x13a1, 0x3);
function _0x13d0(i) {
  return _0x13a1[i - 0x0];
}
var siteA = _0x13d0(0x1);
var siteC = _0x13d0(0x1);
function laterB() {
  return _0x13d0(0x1);
}
function shadowD() {
  function _0x13d0(i) {
    return 'SHADOW-' + i;
  }
  return _0x13d0(0x1);
}
window.laterB = laterB;
window.shadowD = shadowD;
window.__l3Result = { A: siteA, C: siteC };
window.__l3Truth = function () {
  return JSON.stringify({ values: { A: siteA, B: laterB(), C: siteC, D: shadowD() }, observedAtLoad: ['A', 'C'], notExecutedAtLoad: ['B', 'D'], mustStayUntouchedByRecovery: ['B', 'D'] });
};
document.title = 'l3-same-text-ready';
