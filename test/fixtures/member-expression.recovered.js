// 第二阶段测试 fixture：MemberExpression + 对象映射 + 标准 API 还原
// 模拟经过第一阶段 CallExpression 替换后的代码状态

// 场景1：computed → static
console.log("hello");
window.document.getElementById("app");
var x = Math.floor(3.14);
var y = JSON.stringify({
  a: 1
});
var z = Object.keys({
  b: 2
});

// 场景2：对象代理（OB 常见模式——把标准API赋值给变量）
var _0x27a7e9 = {};
_0x27a7e9.log = console.log;
_0x27a7e9.parse = JSON.parse;
_0x27a7e9.stringify = JSON.stringify;
_0x27a7e9.log("test");
_0x27a7e9.parse('{"a":1}');
var result = _0x27a7e9.stringify({
  b: 2
});

// 场景3：嵌套成员访问
var _0x1234 = window;
_0x1234.document.querySelector("#app");
_0x1234.location.href;

// 场景4：不应该转换的情况（动态属性、变量属性）
var prop = "log";
console[prop]("dynamic"); // 不转换：prop 不是字面量
var obj = {};
obj.custom_prop = 1; // 不转换：custom_prop 不是标准 API

// 场景5：函数代理（OB 常见：包装函数转发调用）
var _0xProxy1 = function (a, b) {
  return a + b;
};
var _0xProxy2 = function (a, b) {
  return a - b;
};
var _0xProxy3 = function (a, b) {
  return a === b;
};
var r1 = 1 + 2; // → 1 + 2
var r2 = 10 - 3; // → 10 - 3
var r3 = "a" === "a"; // → "a" === "a"