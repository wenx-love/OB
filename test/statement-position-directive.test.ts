import { describe, it, expect } from 'vitest';
import { drive } from './helpers/capture-driver.js';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';

// Phase 4.6.1: 语句位置的替换。
// 原子回滚测试里发现：解码结果是字符串、调用本身是表达式语句（dec(0);）时，替换后它变成只有一个字符串的语句，位于函数开头就成了指令序言（directive）。
// 值是 'use strict' 时，在简单参数的函数里不会有任何语法错误，替换后的整体解析校验拦不住，函数会悄悄变成严格模式，this 等行为随之改变。
// 这个文件先在未修复的代码上运行，留作复现证据：预期 A、B、C 失败，前提和 D（对照：其他位置照常替换）通过。
// 注意：捕获部分使用驱动里的桩 CDP 传输层（没有真实暂停），验证的是 dry-run 与替换引擎，不是 Chrome 里的捕获。

const NL = String.fromCharCode(10);
const VM_MODULE: string = 'node:vm';
interface VmLike { runInNewContext(code: string): unknown }

async function evalIn(code: string, expression: string): Promise<unknown> {
  const vmModule: VmLike = await import(/* @vite-ignore */ VM_MODULE);
  return vmModule.runInNewContext(code + NL + expression);
}

const SRC = [
  `var _arr = ['use strict', 'beta', 'gamma'];`,
  'function dec(i) {',
  '  return _arr[i];',
  '}',
  'function f() {',
  '  dec(0);',
  '  return typeof this;',
  '}',
  'function g() {',
  '  return dec(1);',
  '}',
  'function run() {',
  '  f();',
  '  f();',
  '  g();',
  '  g();',
  '}',
].join(NL);
const CALL = 'dec(0)';

function positionOf(source: string, needle: string): { index: number; lineNumber: number; columnNumber: number } {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('needle not found: ' + needle);
  const before = source.slice(0, index).split(NL);
  return { index, lineNumber: before.length - 1, columnNumber: before[before.length - 1].length };
}

async function prepare() {
  const d = await drive(SRC, { wrap: ['dec'] });
  const report = validateCaptures(d.captures, [d.script]);
  const dry = await dryRunReplacements(report, [d.script]);
  return { script: d.script, dry };
}

describe('语句位置的替换：字符串字面量会变成指令序言，不得替换', () => {
  it('前提：原脚本里 f() 在非严格模式下运行；g() 里的 dec(1) 有真实的候选', async () => {
    const { script, dry } = await prepare();
    expect(script.source).toBe(SRC);
    expect(await evalIn(SRC, 'f()')).toBe('object');
    expect(dry.candidates.some((c) => c.callText === 'dec(1)' && c.value === 'beta')).toBe(true);
  });

  it('A dry-run 不为表达式语句位置的调用生成候选，并给出拒绝原因', async () => {
    const { dry } = await prepare();
    const pos = positionOf(SRC, CALL);
    expect(dry.candidates.some((c) => c.callText === CALL)).toBe(false);
    const rejection = dry.rejections.find((r) => r.position !== null && r.position.lineNumber === pos.lineNumber && r.position.columnNumber === pos.columnNumber);
    expect(rejection).toBeDefined();
    expect(rejection?.reasons[0].code).toBe('unexpected-parent');
  });

  it('B 替换引擎本身也拒绝该位置的候选（手工构造，不依赖 dry-run 是否已经过滤）', async () => {
    const { script, dry } = await prepare();
    const base = dry.candidates.find((c) => c.callText === 'dec(1)');
    if (!base) throw new Error('precondition failed: no candidate for dec(1)');
    const pos = positionOf(SRC, CALL);
    const forged = {
      ...base,
      position: { lineNumber: pos.lineNumber, columnNumber: pos.columnNumber },
      start: pos.index,
      end: pos.index + CALL.length,
      callText: CALL,
      value: 'use strict',
      replacement: JSON.stringify('use strict'),
      parentType: 'ExpressionStatement',
    };
    const result = await applyVerifiedReplacements({ ...dry, candidates: [forged] }, script);
    expect(result.code).toBe(SRC);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reasons[0].code).toBe('unexpected-parent');
  });

  it('C 完整流程之后 f() 的行为与原脚本一致，函数不会变成严格模式', async () => {
    const { script, dry } = await prepare();
    const result = await applyVerifiedReplacements(dry, script);
    expect(await evalIn(SRC, 'f()')).toBe('object');
    expect(await evalIn(result.code, 'f()')).toBe('object');
  });

  it('D 对照：其他位置照常替换（g 里的 return dec(1) 变成字符串），脚本对象没有被修改', async () => {
    const { script, dry } = await prepare();
    const result = await applyVerifiedReplacements(dry, script);
    expect(result.code).toContain('return ' + JSON.stringify('beta') + ';');
    expect(result.applied.some((a) => a.original === 'dec(1)')).toBe(true);
    expect(script.source).toBe(SRC);
  });
});
