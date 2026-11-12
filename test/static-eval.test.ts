/**
 * 任务 6 强化测试：SequenceExpression、ArrayExpression、ObjectExpression 静态求值
 */
import { describe, it, expect } from 'vitest';
import { parseCode } from '../src/core/parser.js';
import * as t from '@babel/types';
import { safeStaticEval } from '../src/core/deterministic.js';

describe('SequenceExpression static evaluation', () => {
  it('should evaluate (1, 2, 3) → 3', () => {
    const ast = parseCode('(1, 2, 3)');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(result).toBe(3);
  });

  it('should evaluate ("a", "b") → "b"', () => {
    const ast = parseCode('("a", "b")');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(result).toBe('b');
  });

  it('should fail on (1, someVar)', () => {
    const ast = parseCode('(1, someVar)');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    // someVar 无法求值，整个序列表达式失败
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });
});

describe('ArrayExpression static evaluation', () => {
  it('should NOT evaluate [1, 2, 3] (conservative policy)', () => {
    const ast = parseCode('[1, 2, 3]');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    // 当前策略：不支持数组，返回 EVAL_FAIL
    expect(result).not.toEqual([1, 2, 3]);
  });

  it('should fail on array with dynamic element', () => {
    const ast = parseCode('[1, someFunc()]');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });

  it('should fail on array with spread', () => {
    const ast = parseCode('[1, ...arr]');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });
});

describe('ObjectExpression static evaluation', () => {
  it('should NOT evaluate {a: 1, b: 2} (conservative policy)', () => {
    const ast = parseCode('({a: 1, b: 2})');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    // 当前策略：不支持对象，返回 EVAL_FAIL
    expect(result).not.toEqual({ a: 1, b: 2 });
  });

  it('should fail on object with computed key', () => {
    const ast = parseCode('({[key]: 1})');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });

  it('should fail on object with method', () => {
    const ast = parseCode('({foo() { return 1; }})');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });

  it('should fail on object with getter', () => {
    const ast = parseCode('({get foo() { return 1; }})');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });

  it('should fail on object with spread', () => {
    const ast = parseCode('({...obj})');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });
});

describe('MemberExpression safety', () => {
  it('should fail on arr[0] (no array value support)', () => {
    const ast = parseCode('arr[0]');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });

  it('should fail on obj.prop (no object value support)', () => {
    const ast = parseCode('obj.prop');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });
});

describe('function call safety', () => {
  it('should fail on any function call', () => {
    const ast = parseCode('someFunc(1, 2)');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL
  });

  it('should fail on Math.abs()', () => {
    const ast = parseCode('Math.abs(-5)');
    const expr = (ast.program.body[0] as t.ExpressionStatement).expression;
    const result = safeStaticEval(expr);
    expect(typeof result).toBe('symbol'); // EVAL_FAIL — 不执行任何函数
  });
});
