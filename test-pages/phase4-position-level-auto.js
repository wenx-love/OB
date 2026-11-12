// Phase 4 位置级替换验收脚本（自动化版本）
// 目标：自动执行测试，无需手动断点

// 混淆函数：模拟字符串解码表
var _0x123456 = (function () {
  var _table = {
    0x10: 'Signature',
    0x11: 'Document',
    0x12: 'License'
  };
  return function (index) {
    return _table[index];
  };
})();

// 冲突函数：返回值不稳定
var _conflictCount = 0;
var _0xabcdef = function (index) {
  _conflictCount++;
  return _conflictCount === 1 ? 'Conflict1' : 'Conflict2';
};

// ============================================================
// 测试场景 1：相同文本不同位置
// ============================================================

// 位置 A：被捕获并验证的调用（第 26 行）
// 预期替换为 "Signature"
var resultA = _0x123456(0x10);

// 位置 B：使用不同参数，模拟未被验证的场景（第 30 行）
// 预期保留原样（因为参数不同，不会匹配 0x10 的验证结果）
var resultB = _0x123456(0x11);

// 位置 C：被捕获并验证的调用（第 34 行）
// 预期替换为 "Signature"
var resultC = _0x123456(0x10);

// ============================================================
// 测试场景 2：冲突证据拒绝
// ============================================================

// 位置 D：有冲突证据的调用（第 42-43 行）
// 预期拒绝替换
var resultD1 = _0xabcdef(0x20);
var resultD2 = _0xabcdef(0x20);

// ============================================================
// 结果展示
// ============================================================

window.__phase4Results = {
  A: resultA,
  B: resultB,
  C: resultC,
  D1: resultD1,
  D2: resultD2
};

document.title = 'phase4-ready';

// 输出位置信息，用于验证
console.log('=== Phase 4 位置级替换验收 ===');
console.log('位置 A (第 26 行):', resultA, '← 应该被替换');
console.log('位置 B (第 30 行):', resultB, '← 保留原样（参数不同）');
console.log('位置 C (第 34 行):', resultC, '← 应该被替换');
console.log('位置 D1 (第 42 行):', resultD1, '← 应该被拒绝（冲突）');
console.log('位置 D2 (第 43 行):', resultD2, '← 应该被拒绝（冲突）');
console.log('==============================');

var actualEl = document.getElementById('actual');
if (actualEl) {
  actualEl.textContent = [
    '位置 A (第 26 行): ' + resultA + ' ← 应该被替换',
    '位置 B (第 30 行): ' + resultB + ' ← 保留原样（参数不同）',
    '位置 C (第 34 行): ' + resultC + ' ← 应该被替换',
    '',
    '位置 D1 (第 42 行): ' + resultD1 + ' ← 应该被拒绝（冲突）',
    '位置 D2 (第 43 行): ' + resultD2 + ' ← 应该被拒绝（冲突）'
  ].join('\n');
}
