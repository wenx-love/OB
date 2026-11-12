import { describe, it, expect } from 'vitest';
import { computeCapturePlan } from '../src/core/capture-plan.js';

const SRC = [
  'var _a = ["a","b","c","d","e"];',
  'function dec(i, key) {',
  '  var f = function () { return 1; };',
  '  i = i - 1;',
  '  return _a[i] + key;',
  '}',
  'var arrow = (i) => _a[i];',
  'var fe = function (i) {',
  '  var x = _a[i];',
  '};',
  'function destr({ a }) { return a; }',
].join('\n');

describe('computeCapturePlan', () => {
  it('FunctionDeclaration: entry/return/closing, nested function returns excluded', () => {
    const plan = computeCapturePlan(SRC, SRC.indexOf('function dec'));
    expect(plan.supported).toBe(true);
    expect(plan.paramNames).toEqual(['i', 'key']);
    // 入口是函数体第一条语句（`var f = function () {...};` 在第 3 行，第 3 行起）
    expect(plan.entry).toEqual({ lineNumber: 2, columnNumber: 2 });
    expect(plan.returns).toEqual([{ lineNumber: 4, columnNumber: 2 }]);
    expect(plan.closing).toEqual({ lineNumber: 5, columnNumber: 0 });
  });

  it('var fe = function: owner is the declarator, no return statement keeps closing brace', () => {
    const plan = computeCapturePlan(SRC, SRC.indexOf('fe = function'));
    expect(plan.supported).toBe(true);
    expect(plan.returns).toEqual([]);
    // 入口是 `var x = _a[i];`，不是 `var fe = function` 所在的行首
    expect(plan.entry).toEqual({ lineNumber: 8, columnNumber: 2 });
    expect(plan.closing).toEqual({ lineNumber: 9, columnNumber: 0 });
  });

  it('expression-bodied arrow is reported as unsupported with a reason', () => {
    const plan = computeCapturePlan(SRC, SRC.indexOf('arrow = '));
    expect(plan.supported).toBe(false);
    expect(plan.reason).toMatch(/expression-bodied/);
  });

  it('destructured parameter is reported as unsupported', () => {
    const plan = computeCapturePlan(SRC, SRC.indexOf('function destr'));
    expect(plan.supported).toBe(false);
    expect(plan.reason).toMatch(/non-identifier/);
  });

  it('unknown offset is reported as not found', () => {
    const plan = computeCapturePlan(SRC, 5);
    expect(plan.supported).toBe(false);
    expect(plan.reason).toMatch(/not found/);
  });
});
