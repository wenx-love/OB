import { describe, it, expect, afterEach } from 'vitest';
import { CaptureEngine, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import type { CapturePlan } from '../src/core/capture-plan.js';

// Phase 4.7：getBreakpointsByScript() 是只读观测，只按 scriptId 汇总引擎真实持有的断点数。
// 用真实 CaptureEngine + 桩传输层；不改变断点、捕获、验证、替换语义。

const planA: CapturePlan = {
  supported: true,
  entry: { lineNumber: 1, columnNumber: 0 },
  returns: [{ lineNumber: 4, columnNumber: 2 }],
  closing: { lineNumber: 5, columnNumber: 0 },
  paramNames: ['i'],
};
const planB: CapturePlan = {
  supported: true,
  entry: { lineNumber: 10, columnNumber: 0 },
  returns: [],
  closing: { lineNumber: 12, columnNumber: 0 },
  paramNames: ['i'],
};
const planA2: CapturePlan = {
  supported: true,
  entry: { lineNumber: 20, columnNumber: 0 },
  returns: [],
  closing: { lineNumber: 22, columnNumber: 0 },
  paramNames: ['i'],
};
const unsupportedPlan: CapturePlan = { supported: false, reason: 'unsupported function shape', returns: [], paramNames: [] };

const targetA: CaptureTarget = { scriptId: 'sA', scriptUrl: 'http://x/a.js', functionName: 'decA', plan: planA };
const targetA2: CaptureTarget = { scriptId: 'sA', scriptUrl: 'http://x/a.js', functionName: 'decA2', plan: planA2 };
const targetB: CaptureTarget = { scriptId: 'sB', scriptUrl: 'http://x/b.js', functionName: 'decB', plan: planB };
const targetBSamePositions: CaptureTarget = { scriptId: 'sB', scriptUrl: 'http://x/b.js', functionName: 'decB', plan: planA };
const targetUnsupported: CaptureTarget = { scriptId: 'sC', scriptUrl: 'http://x/c.js', functionName: 'decC', plan: unsupportedPlan };

const engines: CaptureEngine[] = [];
afterEach(() => {
  for (const e of engines) e.reset('cleanup');
  engines.length = 0;
});

function setup(failLine?: number) {
  let n = 0;
  const calls: string[] = [];
  const send = async (method: string, params?: Record<string, unknown>) => {
    calls.push(method);
    if (method === 'Debugger.setBreakpoint') {
      const loc = (params as any).location;
      if (failLine !== undefined && loc.lineNumber === failLine) throw new Error('Could not resolve breakpoint');
      return { breakpointId: 'bp' + (++n) };
    }
    return {};
  };
  const engine = new CaptureEngine(send, () => {});
  engines.push(engine);
  return { engine, calls };
}

describe('getBreakpointsByScript：只读的按脚本断点汇总', () => {
  it('启动前是空对象，不是 null', () => {
    const { engine } = setup();
    expect(engine.getBreakpointsByScript()).toEqual({});
  });

  it('按 scriptId 汇总，总和等于 getBreakpointCount 与 breakpointsSet', async () => {
    const { engine } = setup();
    await engine.start([targetA, targetB]);
    const by = engine.getBreakpointsByScript();
    expect(by).toEqual({ sA: 3, sB: 2 });
    const sum = Object.values(by).reduce((a, b) => a + b, 0);
    expect(sum).toBe(engine.getBreakpointCount());
    expect(sum).toBe(engine.getStats().breakpointsSet);
  });

  it('同一脚本的多个目标累加；不同脚本上的相同位置分别计数', async () => {
    const { engine } = setup();
    await engine.start([targetA, targetA2]);
    expect(engine.getBreakpointsByScript()).toEqual({ sA: 5 });
    const other = setup();
    await other.engine.start([targetA, targetBSamePositions]);
    expect(other.engine.getBreakpointsByScript()).toEqual({ sA: 3, sB: 3 });
  });

  it('不支持的目标没有断点：不出现在结果里，也不记成 0', async () => {
    const { engine } = setup();
    const result = await engine.start([targetA, targetUnsupported]);
    const by = engine.getBreakpointsByScript();
    expect(by).toEqual({ sA: 3 });
    expect('sC' in by).toBe(false);
    expect(result.skipped.length).toBe(1);
  });

  it('setBreakpoint 失败的位置不计入', async () => {
    const { engine } = setup(4);
    const result = await engine.start([targetA]);
    expect(result.errors.length).toBe(1);
    expect(engine.getBreakpointsByScript()).toEqual({ sA: 2 });
    expect(engine.getStats().breakpointsSet).toBe(2);
  });

  it('停止捕获后断点被清空，汇总为空对象', async () => {
    const { engine } = setup();
    await engine.start([targetA, targetB]);
    expect(engine.getBreakpointsByScript()).toEqual({ sA: 3, sB: 2 });
    await engine.stop();
    expect(engine.getBreakpointsByScript()).toEqual({});
  });

  it('只读：不发送任何 CDP 命令，不改变计数、统计与记录；修改返回值不会泄漏回引擎', async () => {
    const { engine, calls } = setup();
    await engine.start([targetA]);
    const countBefore = engine.getBreakpointCount();
    const statsBefore = JSON.stringify(engine.getStats());
    const capsBefore = engine.getCaptures().length;
    const callsBefore = calls.length;
    const first = engine.getBreakpointsByScript();
    first['sA'] = 999;
    first['injected'] = 1;
    expect(engine.getBreakpointsByScript()).toEqual({ sA: 3 });
    expect(calls.length).toBe(callsBefore);
    expect(engine.getBreakpointCount()).toBe(countBefore);
    expect(JSON.stringify(engine.getStats())).toBe(statsBefore);
    expect(engine.getCaptures().length).toBe(capsBefore);
  });
});
