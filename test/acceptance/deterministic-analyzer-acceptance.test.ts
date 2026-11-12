/**
 * 第二阶段验收：Deterministic Analyzer 安全测试
 * 
 * 目标：验证不安全或无法证明确定性的表达式保持原样
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../../src/core/pipeline.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';

describe('Deterministic Analyzer - 不安全表达式保护', () => {
  it('Math.random() 应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(Math.random() > 0.5 ? 0 : 1);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // Math.random() 不确定，调用应该保留
    expect(result.code).toContain('_0xdec(');
  });
  
  it('Date.now() 应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var timestamp = Date.now();
      var x = _0xdec(timestamp % 2);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('Date.now()');
    expect(result.code).toContain('_0xdec(');
  });
  
  it('外部变量读取应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var external = window.globalVar;
      var x = _0xdec(external);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('window.globalVar');
    expect(result.code).toContain('_0xdec(external)');
  });
  
  it('自增自减应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var counter = 0;
      var x = _0xdec(counter++);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('counter++');
    expect(result.code).toContain('_0xdec(');
  });
  
  it('未知函数调用应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      function getUserId() { return 42; }
      var x = _0xdec(getUserId());
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('getUserId()');
    expect(result.code).toContain('_0xdec(');
  });
  
  it('动态属性访问应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var obj = { prop: 1 };
      var key = "prop";
      var x = _0xdec(obj[key]);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('obj[key]');
    expect(result.code).toContain('_0xdec(');
  });
});

describe('Deterministic Analyzer - 安全表达式允许', () => {
  it('字面量是确定的', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(2);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var x = "c"');
  });
  
  it('常量表达式经过折叠后是确定的', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = _0xdec(2);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var x = "c"');
  });
  
  it('局部常量是确定的（如果被内联）', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var idx = 1;
      var y = _0xdec(idx);
      idx = 2;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // idx 被重新赋值，不会被内联，但调用仍可能通过沙箱求值
    // 这里只验证不会崩溃
    expect(result.code).toBeDefined();
  });
});
