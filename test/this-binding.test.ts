/**
 * 任务 5 强化测试：this 绑定和闭包变量保护
 */
import { describe, it, expect } from 'vitest';
import { parseCode } from '../src/core/parser.js';
import { generateCode } from '../src/core/generator.js';
import { inlineProxyFunctions } from '../src/core/member-transformer.js';

describe('this binding protection', () => {
  it('should NOT inline if function body uses this', () => {
    const code = `
      var _0xProxy = function(a, b) {
        this.count++;
        return a + b;
      };
      var r = _0xProxy(1, 2);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // 函数体使用 this，不应内联
    expect(count).toBe(0);
    expect(output).toContain('_0xProxy(1, 2)');
  });

  it('should NOT inline return fn(args) because of this binding risk', () => {
    const code = `
      var _0xCall = function(fn, x) {
        return fn(x);
      };
      var obj = { method: function(x) { return this.value + x; }, value: 10 };
      var r = _0xCall(obj.method, 5);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // _0xCall(obj.method, 5) → obj.method(5) 会丢失 this 绑定
    // 当前策略：禁止内联 call 类型
    expect(count).toBe(0);
    expect(output).toContain('_0xCall(');
  });

  it('should NOT inline return obj.method(args) because of this binding risk', () => {
    const code = `
      var _0xMethodCall = function(x) {
        return console.log(x);
      };
      _0xMethodCall("test");
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // return console.log(x) 内联后变成 console.log("test")，this 绑定不变
    // 但当前保守策略：禁止内联 member-call 类型
    expect(count).toBe(0);
    expect(output).toContain('_0xMethodCall(');
  });

  it('should inline simple operators that do not involve this', () => {
    const code = `
      var _0xAdd = function(a, b) { return a + b; };
      var r = _0xAdd(1, 2);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(output).toContain('1 + 2');
  });
});

describe('closure variable protection', () => {
  it('should NOT inline if function reads outer variable', () => {
    const code = `
      var outerVar = 10;
      var _0xClosure = function(x) {
        return x + outerVar;
      };
      var r = _0xClosure(5);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // 函数体引用 outerVar 闭包变量，当前简化策略：只内联单 return 纯表达式
    // return x + outerVar 涉及外部变量，不是纯参数映射，analyzeProxy 不会识别
    expect(count).toBe(0);
    expect(output).toContain('_0xClosure(5)');
  });

  it('should NOT inline multi-statement functions', () => {
    const code = `
      var _0xMulti = function(a) {
        var temp = a * 2;
        return temp + 1;
      };
      var r = _0xMulti(3);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // 多语句函数，analyzeProxy 第一条检查就拒绝
    expect(count).toBe(0);
    expect(output).toContain('_0xMulti(3)');
  });
});
