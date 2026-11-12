import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { recover } from '../src/core/pipeline.js';
import { createNodeSandboxContext } from '../src/core/sandbox-context.js';
import type { MappingEntry } from '../src/types/index.js';

const sandboxEval = (c: string) => vm.runInContext(c, vm.createContext(createNodeSandboxContext()), { timeout: 5000 });

function manual(callText: string, value: string): Record<string, MappingEntry> {
  return { [callText]: { callText, value, type: 'string', confidence: 'manual', source: 'runtime-capture' } };
}

const run = (code: string, callText: string, value: string) =>
  recover(code, { useSandbox: true, sandboxEval, externalMappings: manual(callText, value) });

const applied = (r: Awaited<ReturnType<typeof run>>) => r.transforms.filter((x) => x.source === 'runtime-capture');

describe('手动加入映射（右键求值 → 加入映射）', () => {
  const FN = "function _0xabc(i){return 'val'+i;}";
  const SRC = [FN, 'var r1=_0xabc(1);', 'var r2=_0xabc(2);', 'var r3=_0xabc(1);'].join('\n');

  it('替换与映射文本一致的调用，数量准确，其余调用保持原样', async () => {
    const r = await run(SRC, '_0xabc(1)', 'val1');
    expect(r.code).toContain('var r1 = "val1"');
    expect(r.code).toContain('var r3 = "val1"');
    expect(r.code).toContain('var r2 = _0xabc(2)');
    expect(applied(r)).toHaveLength(2);
  });

  it('映射文本在脚本里不存在时不替换任何内容', async () => {
    const r = await run(SRC, '_0xabc(9)', 'val9');
    expect(applied(r)).toHaveLength(0);
    expect(r.code).toContain('var r1 = _0xabc(1)');
    expect(r.code).toContain('var r2 = _0xabc(2)');
  });

  it('其他函数的同参数调用不受影响', async () => {
    const code = [FN, "function _0xdef(i){return 'def'+i;}", 'var a=_0xabc(1);', 'var b=_0xdef(1);'].join('\n');
    const r = await run(code, '_0xabc(1)', 'val1');
    expect(r.code).toContain('var a = "val1"');
    expect(r.code).toContain('var b = _0xdef(1)');
  });

  it('参数含变量的调用不套用显式映射', async () => {
    const code = [FN, 'var k=Math.random();', 'var r=_0xabc(k);'].join('\n');
    const r = await run(code, '_0xabc(k)', 'valX');
    expect(r.code).toContain('var r = _0xabc(k)');
    expect(applied(r)).toHaveLength(0);
  });

  it('调用位于成员表达式内部时同样替换', async () => {
    const code = [FN, 'var o={};', 'var x=o[_0xabc(1)];'].join('\n');
    const r = await run(code, '_0xabc(1)', 'val1');
    expect(r.code).toContain('o.val1');
    expect(applied(r)).toHaveLength(1);
  });
});
