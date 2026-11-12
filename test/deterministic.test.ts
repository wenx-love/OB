import { describe, it, expect } from 'vitest';
import { parseCode } from '../src/core/parser.js';
import {
  isStaticValue,
  safeStaticEval,
  tryStaticEval,
  analyzeFunctionPurity,
} from '../src/core/deterministic.js';
import * as t from '@babel/types';

describe('isStaticValue', () => {
  it('string literal → true', () => {
    expect(isStaticValue(t.stringLiteral('hello'))).toBe(true);
  });
  it('number literal → true', () => {
    expect(isStaticValue(t.numericLiteral(42))).toBe(true);
  });
  it('boolean literal → true', () => {
    expect(isStaticValue(t.booleanLiteral(true))).toBe(true);
  });
  it('null → true', () => {
    expect(isStaticValue(t.nullLiteral())).toBe(true);
  });
  it('-42 → true', () => {
    expect(isStaticValue(t.unaryExpression('-', t.numericLiteral(42)))).toBe(true);
  });
  it('"a" + "b" → true', () => {
    const node = t.binaryExpression('+', t.stringLiteral('a'), t.stringLiteral('b'));
    expect(isStaticValue(node)).toBe(true);
  });
  it('variable reference → false', () => {
    expect(isStaticValue(t.identifier('x'))).toBe(false);
  });
  it('function call → false', () => {
    expect(isStaticValue(t.callExpression(t.identifier('fn'), []))).toBe(false);
  });
  it('void 0 → true', () => {
    expect(isStaticValue(t.unaryExpression('void', t.numericLiteral(0)))).toBe(true);
  });
  it('template literal no expressions → true', () => {
    const node = t.templateLiteral([t.templateElement({ raw: 'hello', cooked: 'hello' }, true)], []);
    expect(isStaticValue(node)).toBe(true);
  });
});

describe('safeStaticEval', () => {
  it('"hello" → "hello"', () => {
    expect(safeStaticEval(t.stringLiteral('hello'))).toBe('hello');
  });
  it('42 → 42', () => {
    expect(safeStaticEval(t.numericLiteral(42))).toBe(42);
  });
  it('true → true', () => {
    expect(safeStaticEval(t.booleanLiteral(true))).toBe(true);
  });
  it('null → null', () => {
    expect(safeStaticEval(t.nullLiteral())).toBe(null);
  });
  it('"a" + "b" → "ab"', () => {
    const node = t.binaryExpression('+', t.stringLiteral('a'), t.stringLiteral('b'));
    expect(safeStaticEval(node)).toBe('ab');
  });
  it('1 + 2 → 3', () => {
    const node = t.binaryExpression('+', t.numericLiteral(1), t.numericLiteral(2));
    expect(safeStaticEval(node)).toBe(3);
  });
  it('10 % 3 → 1', () => {
    const node = t.binaryExpression('%', t.numericLiteral(10), t.numericLiteral(3));
    expect(safeStaticEval(node)).toBe(1);
  });
  it('"ab" === "ab" → true', () => {
    const node = t.binaryExpression('===', t.stringLiteral('ab'), t.stringLiteral('ab'));
    expect(safeStaticEval(node)).toBe(true);
  });
  it('!false → true', () => {
    const node = t.unaryExpression('!', t.booleanLiteral(false));
    expect(safeStaticEval(node)).toBe(true);
  });
  it('typeof "hello" → "string"', () => {
    const node = t.unaryExpression('typeof', t.stringLiteral('hello'));
    expect(safeStaticEval(node)).toBe('string');
  });
  it('true && "yes" → "yes"', () => {
    const node = t.logicalExpression('&&', t.booleanLiteral(true), t.stringLiteral('yes'));
    expect(safeStaticEval(node)).toBe('yes');
  });
  it('false || "fallback" → "fallback"', () => {
    const node = t.logicalExpression('||', t.booleanLiteral(false), t.stringLiteral('fallback'));
    expect(safeStaticEval(node)).toBe('fallback');
  });
  it('division by zero → fails', () => {
    const node = t.binaryExpression('/', t.numericLiteral(1), t.numericLiteral(0));
    expect(tryStaticEval(node)).toBeNull();
  });
  it('function call → fails (never executes)', () => {
    const node = t.callExpression(t.identifier('evil'), []);
    expect(tryStaticEval(node)).toBeNull();
  });
  it('identifier → fails (no variable resolution)', () => {
    expect(tryStaticEval(t.identifier('x'))).toBeNull();
  });
  it('ternary: true ? 1 : 2 → 1', () => {
    const node = t.conditionalExpression(t.booleanLiteral(true), t.numericLiteral(1), t.numericLiteral(2));
    expect(safeStaticEval(node)).toBe(1);
  });
  it('void 0 → undefined', () => {
    const node = t.unaryExpression('void', t.numericLiteral(0));
    expect(safeStaticEval(node)).toBe(undefined);
  });
  it('bitwise: 5 & 3 → 1', () => {
    const node = t.binaryExpression('&', t.numericLiteral(5), t.numericLiteral(3));
    expect(safeStaticEval(node)).toBe(1);
  });
});

describe('analyzeFunctionPurity', () => {
  it('pure function: (a, b) => a + b', () => {
    const fn = t.arrowFunctionExpression(
      [t.identifier('a'), t.identifier('b')],
      t.binaryExpression('+', t.identifier('a'), t.identifier('b')),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(true);
  });

  it('impure: function with assignment', () => {
    const fn = t.functionExpression(
      null,
      [],
      t.blockStatement([
        t.expressionStatement(
          t.assignmentExpression('=', t.identifier('x'), t.numericLiteral(1)),
        ),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(false);
    expect(result.reason).toContain('assignment');
  });

  it('impure: function with console access', () => {
    const fn = t.functionExpression(
      null,
      [],
      t.blockStatement([
        t.expressionStatement(t.identifier('console')),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(false);
    expect(result.reason).toContain('console');
  });

  it('impure: function with function call', () => {
    const fn = t.functionExpression(
      null,
      [],
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.identifier('doSomething'), []),
        ),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(false);
    expect(result.reason).toContain('call');
  });

  it('impure: function with i++', () => {
    const fn = t.functionExpression(
      null,
      [t.identifier('i')],
      t.blockStatement([
        t.expressionStatement(
          t.updateExpression('++', t.identifier('i')),
        ),
      ]),
    );
    const result = analyzeFunctionPurity(fn);
    expect(result.pure).toBe(false);
    expect(result.reason).toContain('update');
  });
});
