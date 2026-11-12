/**
 * 第二阶段验收：语义保持测试
 * 
 * 目标：验证还原前后的代码在沙箱中执行结果一致
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../../src/core/pipeline.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import vm from 'vm';

describe('Semantic Preservation - 返回值一致性', () => {
  it('简单算术表达式', async () => {
    const obfuscated = `
      var _0xarr = ["result"];
      var _0xdec = function(i) { return _0xarr[i]; };
      function calculate() {
        var a = 10;
        var b = 20;
        return a + b;
      }
      var result = calculate();
    `;
    
    // 执行原始代码
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const originalResult = ctx1.result;
    
    // 还原后执行
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recoveredResult = ctx2.result;
    
    expect(recoveredResult).toBe(originalResult);
    expect(recoveredResult).toBe(30);
  });
  
  it('字符串拼接', async () => {
    const obfuscated = `
      var _0xarr = ["Hello", " ", "World"];
      function getString(i) { return _0xarr[i]; }
      var result = getString(0) + getString(1) + getString(2);
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const originalResult = ctx1.result;
    
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recoveredResult = ctx2.result;
    
    expect(recoveredResult).toBe(originalResult);
    expect(recoveredResult).toBe("Hello World");
  });
  
  it('条件分支', async () => {
    const obfuscated = `
      function test(x) {
        if (x > 10) {
          return "big";
        } else {
          return "small";
        }
      }
      var result1 = test(15);
      var result2 = test(5);
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const original1 = ctx1.result1;
    const original2 = ctx1.result2;
    
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recovered1 = ctx2.result1;
    const recovered2 = ctx2.result2;
    
    expect(recovered1).toBe(original1);
    expect(recovered2).toBe(original2);
    expect(recovered1).toBe("big");
    expect(recovered2).toBe("small");
  });
});

describe('Semantic Preservation - 异常一致性', () => {
  it('抛出相同异常', async () => {
    const obfuscated = `
      function throwError() {
        throw new Error("test error");
      }
      var result = null;
      try {
        result = throwError();
      } catch(e) {
        result = e.message;
      }
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const originalResult = ctx1.result;
    
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recoveredResult = ctx2.result;
    
    expect(recoveredResult).toBe(originalResult);
    expect(recoveredResult).toBe("test error");
  });
});

describe('Semantic Preservation - 副作用一致性', () => {
  it('变量修改副作用', async () => {
    const obfuscated = `
      var counter = 0;
      function increment() {
        counter++;
        return counter;
      }
      var r1 = increment();
      var r2 = increment();
      var r3 = increment();
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const original = { counter: ctx1.counter, r1: ctx1.r1, r2: ctx1.r2, r3: ctx1.r3 };
    
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recovered_res = { counter: ctx2.counter, r1: ctx2.r1, r2: ctx2.r2, r3: ctx2.r3 };
    
    expect(recovered_res).toEqual(original);
    expect(recovered_res.counter).toBe(3);
    expect(recovered_res.r1).toBe(1);
    expect(recovered_res.r2).toBe(2);
    expect(recovered_res.r3).toBe(3);
  });
  
  it('数组修改副作用', async () => {
    const obfuscated = `
      var arr = [1, 2, 3];
      function modify() {
        arr.push(4);
        arr[0] = 99;
        return arr.length;
      }
      var len = modify();
      var finalArr = arr;
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const original = { len: ctx1.len, finalArr: Array.from(ctx1.finalArr) };
    
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recovered_res = { len: ctx2.len, finalArr: Array.from(ctx2.finalArr) };
    
    expect(recovered_res).toEqual(original);
    expect(recovered_res.len).toBe(4);
    expect(recovered_res.finalArr).toEqual([99, 2, 3, 4]);
  });
});

describe('Semantic Preservation - 执行顺序', () => {
  it('函数调用顺序不变', async () => {
    const obfuscated = `
      var log = [];
      function a() { log.push('a'); return 1; }
      function b() { log.push('b'); return 2; }
      function c() { log.push('c'); return 3; }
      var result = a() + b() + c();
    `;
    
    const ctx1 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(obfuscated, ctx1, { timeout: 5000 });
    const originalLog = Array.from(ctx1.log);
    const originalResult = ctx1.result;
    
    const recovered = await recover(obfuscated, { 
      useSandbox: true, 
      sandboxEval: (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 })
    });
    
    const ctx2 = vm.createContext(createNodeSandboxContext());
    vm.runInContext(recovered.code, ctx2, { timeout: 5000 });
    const recoveredLog = Array.from(ctx2.log);
    const recoveredResult = ctx2.result;
    
    expect(recoveredLog).toEqual(originalLog);
    expect(recoveredLog).toEqual(['a', 'b', 'c']);
    expect(recoveredResult).toBe(originalResult);
    expect(recoveredResult).toBe(6);
  });
});
