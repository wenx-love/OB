/**
 * 第二阶段验收：String Decoder 完整测试
 * 策略：使用完整的 recover() API 做集成测试
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../../src/core/pipeline.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';

describe('String Decoder Acceptance - 字符串数组提取', () => {
  it('应该解码简单字符串数组调用', async () => {
    const code = `
      var _0xarr = ["hello", "world", "test", "foo", "bar"];
      function _0xdec(i) { return _0xarr[i]; }
      var msg = _0xdec(0);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var msg = "hello"');
    expect(result.stats.resolvedCalls).toBeGreaterThan(0);
  });

  it('应该解码函数表达式形式的解码器', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      var _0xdec = function(i) { return _0xarr[i]; };
      var x = _0xdec(1);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var x = "b"');
  });
});

describe('String Decoder Acceptance - 数组旋转', () => {
  it('旋转后解码应该正确', async () => {
    const code = `
      var _0xarr = ["c", "a", "b", "d", "e"];
      (function(arr, n) {
        while(n--) arr.push(arr.shift());
      })(_0xarr, 1);
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(0);
      var y = _0xdec(1);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 旋转 1 次后：["a", "b", "c"]
    expect(result.code).toContain('var x = "a"');
    expect(result.code).toContain('var y = "b"');
  });
});

describe('String Decoder Acceptance - Base64 解码', () => {
  it('应该解码 Base64 编码的字符串', async () => {
    const code = `
      var _0xarr = ["aGVsbG8=", "d29ybGQ=", "dGVzdA==", "Zm9v", "YmFy"];
      function _0xdec(i) {
        var str = _0xarr[i];
        return atob(str);
      }
      var msg = _0xdec(0);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var msg = "hello"');
  });
});

describe('String Decoder Acceptance - RC4 双参数解码', () => {
  it('应该解码双参数调用', async () => {
    const code = `
      var _0xarr = ["data1", "data2", "data3", "data4", "data5"];
      function _0xdec(i, key) {
        var str = _0xarr[i];
        if (key === "k1") return "decoded1";
        if (key === "k2") return "decoded2";
        return str;
      }
      var a = _0xdec(0, "k1");
      var b = _0xdec(1, "k2");
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var a = "decoded1"');
    expect(result.code).toContain('var b = "decoded2"');
  });
});

describe('String Decoder Acceptance - 多层嵌套解码', () => {
  it('应该替换嵌套的解码调用', async () => {
    const code = `
      var _0xarr = ["console", "log", "warn", "error", "info"];
      function _0xdec(i) { return _0xarr[i]; }
      
      window[_0xdec(0)][_0xdec(1)]("test");
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('window.console.log');
    // 注：已经过 MemberExpression optimizer，["console"] → .console
  });
});

describe('String Decoder Acceptance - 索引偏移', () => {
  it('应该处理 i - offset 模式', async () => {
    const code = `
      var _0xarr = ["zero", "one", "two", "three", "four"];
      function _0xdec(i) { return _0xarr[i - 0]; }
      var msg = _0xdec(0);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var msg = "zero"');
  });
});

describe('String Decoder Acceptance - 不支持的情况', () => {
  it('IIFE 内部的解码器当前不支持', async () => {
    const code = `
      (function() {
        var _0xarr = ["a", "b"];
        function _0xdec(i) { return _0xarr[i]; }
        window.decoder = _0xdec;
      })();
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 当前不支持 IIFE 内部的解码器，代码应该保持原样
    expect(result.code).toContain('function _0xdec');
  });

  it('动态索引不应该被替换', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var idx = Math.random() > 0.5 ? 0 : 1;
      var r = _0xdec(idx);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 动态索引应该保持原样
    expect(result.code).toContain('_0xdec(idx)');
  });
});

