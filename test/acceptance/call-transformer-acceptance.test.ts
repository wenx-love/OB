/**
 * 第二阶段验收：CallExpression Transformer
 * 
 * 目标：证明是真正的 AST 转换，不是文本替换
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../../src/core/pipeline.js';
import { parseCode } from '../../src/core/parser.js';
import { generateCode } from '../../src/core/generator.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';

describe('CallExpression Transformer - AST 转换验证', () => {
  it('证明：不是文本替换，是 AST 节点替换', async () => {
    // 关键测试：_0x27a7e9[_0x29ae5c(795, "yBNh")] → _0x27a7e9["Signature"]
    const code = `
      var _0xarr = ["Signature", "foo", "bar", "baz", "qux"];
      function _0xdec(i, key) {
        if (i === 795 && key === "yBNh") return "Signature";
        return _0xarr[i];
      }
      var obj = { x: 1 };
      var prop = obj[_0xdec(795, "yBNh")];
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 验证：AST 级别替换 CallExpression → StringLiteral
    const ast = parseCode(result.code);
    let found = false;
    
    // 找到 obj[...] 的 MemberExpression
    ast.program.body.forEach((node: any) => {
      if (node.type === 'VariableDeclaration') {
        node.declarations.forEach((d: any) => {
          if (d.id.name === 'prop' && d.init?.type === 'MemberExpression') {
            // 属性必须是 StringLiteral，不是 CallExpression
            expect(d.init.property.type).toBe('Identifier'); // 或 StringLiteral
            expect(d.init.property.name || d.init.property.value).toBe('Signature');
            found = true;
          }
        });
      }
    });
    
    expect(found).toBe(true);
    expect(result.code).toContain('obj.Signature');
  });
  
  it('MemberExpression 内部的调用替换', async () => {
    const code = `
      var _0xarr = ["console", "log", "warn", "error", "info"];
      function _0xdec(i) { return _0xarr[i]; }
      window[_0xdec(0)][_0xdec(1)]("test");
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 经过 member optimizer: window.console.log()
    expect(result.code).toContain('window.console.log');
  });
  
  it('函数参数中的调用替换', async () => {
    const code = `
      var _0xarr = ["hello", "world", "foo", "bar", "baz"];
      function _0xdec(i) { return _0xarr[i]; }
      console.log(_0xdec(0), _0xdec(1));
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('console.log("hello", "world")');
  });
  
  it('多层嵌套调用替换', async () => {
    const code = `
      var _0xarr = ["length", "toString", "foo", "bar", "baz"];
      function _0xdec(i) { return _0xarr[i]; }
      var x = arr[_0xdec(0)][_0xdec(1)]();
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('arr.length.toString()');
  });
  
  it('同一解码函数多次调用', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var x1 = _0xdec(0);
      var x2 = _0xdec(0);
      var y = _0xdec(1);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    const aCount = (result.code.match(/"a"/g) || []).length;
    expect(aCount).toBe(2);
    expect(result.code).toContain('var y = "b"');
  });
});

describe('CallExpression Transformer - 不确定的调用保护', () => {
  it('动态参数不应该被替换', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var idx = Math.random() > 0.5 ? 0 : 1;
      var x = _0xdec(idx);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 动态调用应该保持原样
    expect(result.code).toContain('_0xdec(idx)');
  });
  
  it('未知解码器不应该被触碰', async () => {
    const code = `
      function unknownFn(x) { return x * 2; }
      var y = unknownFn(5);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('unknownFn(5)');
  });
  
  it('真正不确定的表达式应该保持原样', async () => {
    const code = `
      var _0xarr = ["a", "b", "c", "d", "e"];
      function _0xdec(i) { return _0xarr[i]; }
      var runtime = Math.random();
      var x = _0xdec(runtime);
    `;
    
    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // Math.random() 不确定，应该保留原调用
    expect(result.code).toContain('_0xdec(runtime)');
  });
});
