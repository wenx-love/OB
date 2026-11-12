// Phase 4 位置级替换验收脚本
// 目标：验证系统能够根据 scriptId + scriptHash + start/end 定位具体 AST 节点

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

// 冲突函数：返回值不稳定（用于测试冲突拒绝）
var _conflictCount = 0;
var _0xabcdef = function (index) {
  _conflictCount++;
  // 第一次返回 "Conflict1"，第二次返回 "Conflict2"
  return _conflictCount === 1 ? 'Conflict1' : 'Conflict2';
};

// ============================================================
// 测试场景 1：相同文本不同位置
// ============================================================

// 位置 A：被捕获并验证的调用
// 预期：应该被替换为 "Signature"
var resultA = _0x123456(0x10);

// 位置 B：相同文本，但未被捕获的调用
// 预期：必须保留原样 _0x123456(0x10)
// 注意：这个调用不会被 hook 捕获（我们会在 DevTools 中手动控制）
var resultB = _0x123456(0x10);

// 位置 C：被捕获并验证的调用
// 预期：应该被替换为 "Signature"
var resultC = _0x123456(0x10);

// ============================================================
// 测试场景 2：冲突证据拒绝
// ============================================================

// 位置 D：有冲突证据的调用
// 预期：因为返回值不一致，应该被拒绝替换
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

var actualEl = document.getElementById('actual');
if (actualEl) {
  actualEl.textContent = [
    '位置 A：' + resultA,
    '位置 B：' + resultB,
    '位置 C：' + resultC,
    '位置 D1：' + resultD1 + '（第一次调用）',
    '位置 D2：' + resultD2 + '（第二次调用，与第一次冲突）'
  ].join('\n');
}

document.title = 'phase4-ready';
console.log('Phase 4 验收页面加载完成');
console.log('结果：', window.__phase4Results);
