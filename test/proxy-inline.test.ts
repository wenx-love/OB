import { describe, it, expect } from 'vitest';
import { parseCode } from '../src/core/parser.js';
import { generateCode } from '../src/core/generator.js';
import { inlineProxyFunctions } from '../src/core/member-transformer.js';

describe('inlineProxyFunctions - enhanced', () => {
  it('should inline function declaration proxy', () => {
    const code = `
      function _0xAdd(a, b) { return a + b; }
      var r = _0xAdd(1, 2);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(output).toContain('1 + 2');
    expect(output).not.toContain('_0xAdd(1, 2)');
  });

  it('should inline unary proxy (return !a)', () => {
    const code = `
      var _0xNot = function(a) { return !a; };
      var r = _0xNot(true);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(output).toContain('!true');
    expect(output).not.toContain('_0xNot(true)');
  });

  it('should delete dead proxy definitions after inline', () => {
    const code = `
      var _0xAdd = function(a, b) { return a + b; };
      var r = _0xAdd(1, 2);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // 内联后 _0xAdd 无剩余引用，应被删除
    expect(output).not.toContain('function');
    expect(output).toContain('1 + 2');
    expect(count).toBeGreaterThanOrEqual(2); // 1 inline + 1 removal
  });

  it('should NOT delete proxy if still referenced', () => {
    const code = `
      var _0xAdd = function(a, b) { return a + b; };
      var r = _0xAdd(1, 2);
      otherFn(_0xAdd);
    `;
    const ast = parseCode(code);
    inlineProxyFunctions(ast);
    const output = generateCode(ast);

    // _0xAdd 还被 otherFn 引用，不删除定义
    expect(output).toContain('_0xAdd = function');
    expect(output).toContain('1 + 2');
  });

  it('should inline function declaration and delete it', () => {
    const code = `
      function _0xSub(a, b) { return a - b; }
      var r = _0xSub(10, 3);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(output).toContain('10 - 3');
    expect(output).not.toContain('function _0xSub');
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('should NOT inline multi-statement functions', () => {
    const code = `
      function _0xComplex(a) { console.log(a); return a; }
      var r = _0xComplex(1);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(count).toBe(0);
    expect(output).toContain('_0xComplex(1)');
  });
});
