/**
 * 安全保护测试：确保不安全的情况不被替换
 */
import { describe, it, expect } from 'vitest';
import { recover } from '../src/core/pipeline.js';
import { createNodeSandboxContext } from '../src/core/sandbox-context.js';
import { parseCode } from '../src/core/parser.js';
import { generateCode } from '../src/core/generator.js';
import {
  analyzeFunctionPurity,
  safeStaticEval,
} from '../src/core/deterministic.js';
import * as t from '@babel/types';
import vm from 'vm';

async function nodeSandboxEval(code: string): Promise<unknown> {
  const ctx = vm.createContext(createNodeSandboxContext());
  return vm.runInContext(code, ctx, { timeout: 5000 });
}

describe('safety: closures with mutable state', () => {
  it('should NOT replace call if function has mutable closure counter', () => {
    // 解码器内部有 counter++，每次调用结果可能不同
    const fn = t.functionExpression(
      null, [t.identifier('x')],
      t.blockStatement([
        t.expressionStatement(t.updateExpression('++', t.identifier('counter'))),
        t.returnStatement(t.identifier('x')),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(false);
    expect(result.reason).toContain('update');
  });

  it('should NOT replace call if function modifies external variable', () => {
    const fn = t.functionExpression(
      null, [],
      t.blockStatement([
        t.expressionStatement(
          t.assignmentExpression('=', t.identifier('globalState'), t.numericLiteral(1)),
        ),
        t.returnStatement(t.stringLiteral('ok')),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(false);
    expect(result.reason).toContain('assignment');
  });
});

describe('safety: dynamic expressions', () => {
  it('should NOT replace call with dynamic argument', async () => {
    // _0xdec(dynamicVar) — 参数不是字面量
    const code = `
      var _0xarr = ["aGVsbG8=", "d29ybGQ=", "dGVzdA==", "YWJj", "ZGVm"];
      function _0xdec(idx) { return atob(_0xarr[idx]); }
      var x = getIndex();
      var result = _0xdec(x);
    `;
    const result = await recover(code, {
      useSandbox: true,
      sandboxEval: nodeSandboxEval,
    });
    // _0xdec(x) 的 x 不是静态值，不应被替换
    expect(result.code).toContain('_0xdec(') || expect(result.code).toContain('func1(');
  });

  it('should preserve expressions with side effects', async () => {
    const code = `
      var a = someFunction() + "test";
    `;
    const result = await recover(code, { useSandbox: false });
    // someFunction() 有副作用，不应被折叠
    expect(result.code).toContain('someFunction()');
  });
});

describe('safety: getter/setter protection', () => {
  it('should NOT fold member expression with potential getter', () => {
    const fn = t.functionExpression(
      null, [t.identifier('obj')],
      t.blockStatement([
        t.returnStatement(
          t.memberExpression(t.identifier('obj'), t.identifier('value')),
        ),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(true);

    // safeStaticEval 不处理 MemberExpression，返回失败
    const memberNode = t.memberExpression(t.identifier('obj'), t.identifier('value'));
    const evalResult = safeStaticEval(memberNode);
    expect(typeof evalResult).toBe('symbol'); // EVAL_FAIL is a symbol
  });
});

describe('MemberExpression with nested CallExpression', () => {
  it('should replace _0x[_0xdec(n)] with _0x["decoded"]', async () => {
    const code = `
      var _0xarr = ["aGVsbG8=", "d29ybGQ=", "dGVzdA==", "YWJj", "ZGVm"];
      function _0xdec(idx) { idx = idx - 0; return atob(_0xarr[idx]); }
      var obj = {};
      obj[_0xdec(0)] = 1;
      obj[_0xdec(1)] = 2;
    `;
    const result = await recover(code, {
      useSandbox: true,
      sandboxEval: nodeSandboxEval,
    });
    // _0xdec(0) 和 _0xdec(1) 应该被替换为字符串字面量
    expect(result.code).not.toContain('_0xdec(0)');
    expect(result.code).not.toContain('_0xdec(1)');
  });
});

describe('multi-layer nested decoding', () => {
  it('should handle decoder call inside another expression', async () => {
    const code = `
      var _0xarr = ["bG9n", "Y29uc29sZQ==", "dGVzdA==", "YWJj", "ZGVm"];
      function _0xdec(idx) { idx = idx - 0; return atob(_0xarr[idx]); }
      console[_0xdec(0)](_0xdec(2));
    `;
    const result = await recover(code, {
      useSandbox: true,
      sandboxEval: nodeSandboxEval,
    });
    // console["log"]("test") → 进一步 computed→static → console.log("test")
    expect(result.code).toContain('console.log');
    expect(result.code).toContain('"test"');
  });
});
