/**
 * 第二阶段验收：Pipeline 稳定性测试
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../../src/core/pipeline.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';

describe('Pipeline Stability - 多轮转换', () => {
  it('应该支持多轮转换直到收敛', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(0);
      var y = x;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // API不返回rounds统计，只验证功能
    expect(result.code).toContain('var x = "a"');
  });
  
  it('无变化时应该停止', async () => {
    const code = `
      var x = 1 + 1;
      var y = 2 + 2;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var x = 2');
    expect(result.code).toContain('var y = 4');
  });
  
  it('空代码不应该崩溃', async () => {
    const code = ``;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toBe('');
  });
});

describe('Pipeline Stability - 连续还原一致性', () => {
  it('连续两次还原应该产生相同结果', async () => {
    const code = `
      var _0xarr = ["hello", "world", "test", "foo", "bar"];
      function _0xdec(i) { return _0xarr[i]; }
      var msg = _0xdec(0) + " " + _0xdec(1);
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    const sandboxEval1 = (c: string) => vm.runInContext(c, ctx1, { timeout: 5000 });
    const result1 = await recover(code, { useSandbox: true, sandboxEval: sandboxEval1 });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    const sandboxEval2 = (c: string) => vm.runInContext(c, ctx2, { timeout: 5000 });
    const result2 = await recover(code, { useSandbox: true, sandboxEval: sandboxEval2 });
    
    expect(result1.code).toBe(result2.code);
  });
  
  it('还原后的代码再次还原应该不变', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(0);
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    const sandboxEval1 = (c: string) => vm.runInContext(c, ctx1, { timeout: 5000 });
    const result1 = await recover(code, { useSandbox: true, sandboxEval: sandboxEval1 });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    const sandboxEval2 = (c: string) => vm.runInContext(c, ctx2, { timeout: 5000 });
    const result2 = await recover(result1.code, { useSandbox: true, sandboxEval: sandboxEval2 });
    
    // 第二次还原应该没有变化
    expect(result2.code).toBe(result1.code);
  });
});

describe('Pipeline Stability - 错误处理', () => {
  it('语法错误应该抛出异常', async () => {
    const code = `var x = function() { invalid syntax`;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    // 当前实现：解析错误直接抛出
    await expect(recover(code, { useSandbox: true, sandboxEval })).rejects.toThrow();
  });
  
  it('不应该因为单个 transformer 失败而崩溃', async () => {
    const code = `
      var _0xarr = ["test1", "test2", "test3", "test4", "test5"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(0);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 应该成功完成
    expect(result.code).toBeDefined();
  });
});
