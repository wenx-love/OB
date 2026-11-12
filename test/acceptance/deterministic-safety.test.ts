/**
 * 第二阶段验收：Deterministic Analyzer 安全测试
 * 重点：不安全或无法证明确定性的表达式必须保持原样
 */
import { describe, it, expect } from 'vitest';
import { parseCode } from '../../src/core/parser.js';
import { recover } from '../../src/core/pipeline.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';
import * as t from '@babel/types';
import _traverse from '@babel/traverse';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

describe('Deterministic Safety - Math.random()', () => {
  it('Math.random() 调用必须保持原样', async () => {
    const code = `
      var x = Math.random();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('Math.random()');
  });

  it('包含 Math.random() 的表达式不应该被求值', async () => {
    const code = `
      var x = 1 + Math.random();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 不应该变成 var x = <某个数字>
    expect(result.code).toContain('Math.random()');
    expect(result.code).not.toMatch(/var x = \d+\.?\d*;/);
  });
});

describe('Deterministic Safety - Date.now()', () => {
  it('Date.now() 调用必须保持原样', async () => {
    const code = `
      var timestamp = Date.now();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('Date.now()');
  });

  it('new Date() 调用必须保持原样', async () => {
    const code = `
      var d = new Date();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('new Date()');
  });
});

describe('Deterministic Safety - 外部变量读取', () => {
  it('读取外部变量的表达式不应该被求值', async () => {
    const code = `
      var externalVar = 10;
      var _0xProxy = function(x) { return x + externalVar; };
      var r = _0xProxy(5);
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 代理函数引用外部变量，不应该被内联
    expect(result.code).toContain('_0xProxy(5)');
  });
});

describe('Deterministic Safety - 外部变量修改', () => {
  it('修改外部变量的函数不应该被内联', async () => {
    const code = `
      var counter = 0;
      var _0xIncrement = function() { counter++; return counter; };
      var a = _0xIncrement();
      var b = _0xIncrement();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 有副作用的函数不应该被内联
    expect(result.code).toContain('_0xIncrement()');
  });
});

describe('Deterministic Safety - 闭包', () => {
  it('使用闭包变量的函数不应该被内联', async () => {
    const code = `
      function makeCounter() {
        var count = 0;
        return function() { return ++count; };
      }
      var counter = makeCounter();
      var a = counter();
      var b = counter();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 闭包函数调用应该保持原样
    expect(result.code).toContain('counter()');
  });
});

describe('Deterministic Safety - 自增自减', () => {
  it('包含自增的函数不应该被内联', async () => {
    const code = `
      var i = 0;
      var _0xNext = function() { return i++; };
      var a = _0xNext();
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('_0xNext()');
  });
});

describe('Deterministic Safety - 未知函数调用', () => {
  it('调用未知函数的表达式不应该被求值', async () => {
    const code = `
      var x = unknownFunction(1, 2);
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('unknownFunction(1, 2)');
  });

  it('代理函数调用未知函数不应该被内联', async () => {
    const code = `
      var _0xCall = function(fn, x) { return fn(x); };
      var r = _0xCall(unknownFn, 10);
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // call 类型代理已经被禁止内联（this 绑定风险）
    expect(result.code).toContain('_0xCall(');
  });
});

describe('Deterministic Safety - getter', () => {
  it('访问可能有 getter 的属性不应该被求值', async () => {
    const code = `
      var obj = { get value() { return Math.random(); } };
      var x = obj.value;
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 属性访问应该保持原样
    expect(result.code).toContain('obj.value');
  });
});

describe('Deterministic Safety - 动态属性', () => {
  it('动态计算的属性访问不应该被求值', async () => {
    const code = `
      var obj = { a: 1, b: 2 };
      var key = "a";
      var x = obj[key];
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // obj[key] 应该保持原样
    expect(result.code).toContain('obj[key]');
  });
});

describe('Deterministic Safety - 函数副作用', () => {
  it('有副作用的函数不应该被重复执行', async () => {
    const code = `
      var log = [];
      var _0xLog = function(msg) { log.push(msg); return msg; };
      var a = _0xLog("test");
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    // 有副作用的函数调用应该保持原样
    expect(result.code).toContain('_0xLog("test")');
  });

  it('修改参数的函数不应该被内联', async () => {
    const code = `
      var _0xMutate = function(arr) { arr.push(1); return arr; };
      var myArr = [];
      var r = _0xMutate(myArr);
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('_0xMutate(myArr)');
  });
});

describe('Deterministic Safety - 全局状态依赖', () => {
  it('依赖全局状态的表达式不应该被求值', async () => {
    const code = `
      var x = window.innerWidth;
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('window.innerWidth');
  });

  it('document 访问不应该被求值', async () => {
    const code = `
      var el = document.getElementById("test");
    `;

    const ctx = vm.createContext(createNodeSandboxContext());
    const sandboxEval = (c: string) => vm.runInContext(c, ctx, { timeout: 5000 });
    
    const result = await recover(code, { useSandbox: true, sandboxEval });
    
    expect(result.code).toContain('document.getElementById');
  });
});
