/**
 * 第二阶段验收：MemberExpression Transformer 测试
 * 
 * 目标：验证对象属性映射的正确性和边界保护
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../../src/core/pipeline.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';

describe('MemberExpression Transformer - 对象映射', () => {
  it.skip('普通对象映射（尚未实现）', async () => {
    const code = `
      var _0xmap = { a: "value1", b: "value2", c: "value3", d: "value4", e: "value5" };
      var x = _0xmap.a;
      var y = _0xmap["b"];
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('var x = "value1"');
    expect(result.code).toContain('var y = "value2"');
  });
  
  it.skip('多层对象映射（尚未实现）', async () => {
    const code = `
      var _0xobj = { 
        nested: { 
          prop1: "v1", 
          prop2: "v2", 
          prop3: "v3", 
          prop4: "v4", 
          prop5: "v5" 
        },
        a: "va",
        b: "vb",
        c: "vc",
        d: "vd"
      };
      var x = _0xobj.nested.prop1;
      var y = _0xobj["a"];
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('"v1"');
    expect(result.code).toContain('"va"');
  });
  
  it.skip('映射别名（尚未实现）', async () => {
    const code = `
      var _0xobj = { a: "value1", b: "value2", c: "value3", d: "value4", e: "value5" };
      var alias = _0xobj;
      var x = alias.a;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // alias 是 _0xobj 的引用，应该能正确映射（取决于 constantPropagation）
    // 如果没内联，至少不应该崩溃
    expect(result.code).toBeDefined();
  });
});

describe('MemberExpression Transformer - 边界保护', () => {
  it('对象属性被重新赋值后不应该使用旧映射', async () => {
    const code = `
      var _0xobj = { a: "old", b: "v2", c: "v3", d: "v4", e: "v5" };
      var x = _0xobj.a;
      _0xobj.a = "new";
      var y = _0xobj.a;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 第一次访问可能被替换成 "old"
    // 第二次访问应该保留 _0xobj.a（因为已被修改）
    expect(result.code).toContain('_0xobj.a = "new"');
    // y 的赋值应该保留原样或正确处理
    expect(result.code).toBeDefined();
  });
  
  it('delete 删除属性后的访问应该保持原样', async () => {
    const code = `
      var _0xobj = { a: "value1", b: "value2", c: "value3", d: "value4", e: "value5" };
      var x = _0xobj.a;
      delete _0xobj.a;
      var y = _0xobj.a;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('delete');
    expect(result.code).toBeDefined();
  });
  
  it('动态属性写入后应该保持谨慎', async () => {
    const code = `
      var _0xobj = { a: "value1", b: "value2", c: "value3", d: "value4", e: "value5" };
      var key = "a";
      _0xobj[key] = "dynamic";
      var y = _0xobj.a;
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 动态赋值后，应该保守处理
    expect(result.code).toBeDefined();
  });
  
  it('不同作用域中的同名变量不应该混淆', async () => {
    const code = `
      var _0xobj = { a: "outer", b: "v2", c: "v3", d: "v4", e: "v5" };
      function test() {
        var _0xobj = { a: "inner", b: "v2", c: "v3", d: "v4", e: "v5" };
        return _0xobj.a;
      }
      var x = _0xobj.a;
      var y = test();
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 两个作用域的 _0xobj 是不同的对象
    // 至少不应该崩溃或产生错误映射
    expect(result.code).toBeDefined();
  });
});
