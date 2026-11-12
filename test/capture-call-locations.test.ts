import { describe, it, expect, afterEach } from 'vitest';
import { CaptureEngine, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import type { CapturePlan } from '../src/core/capture-plan.js';

// Phase 3.2：DecoderCapture.callLocations（同一条记录的全部不同调用位置）。
// 用真实 CaptureEngine + 桩传输层；调用方栈帧的位置逐次变化，模拟不同调用点。

const plan: CapturePlan = {
  supported: true,
  entry: { lineNumber: 1, columnNumber: 0 },
  returns: [{ lineNumber: 4, columnNumber: 2 }],
  closing: { lineNumber: 5, columnNumber: 0 },
  paramNames: ['i'],
};
const target: CaptureTarget = { scriptId: 's1', scriptUrl: 'http://x/a.js', functionName: 'dec', plan };

const engines: CaptureEngine[] = [];
afterEach(() => {
  for (const e of engines) e.reset('cleanup');
  engines.length = 0;
});

function setup() {
  let n = 0;
  const state = { args: [{ name: 'i', value: { type: 'number', value: 256 } }] as any[] };
  const send = async (method: string) => {
    if (method === 'Debugger.setBreakpoint') return { breakpointId: 'bp' + (++n) };
    if (method === 'Runtime.getProperties') return { result: state.args };
    return {};
  };
  const engine = new CaptureEngine(send, () => {});
  engines.push(engine);
  return { engine, state };
}

function frame(name: string, extra: Record<string, unknown> = {}): any {
  return {
    functionName: name,
    location: { scriptId: 's1', lineNumber: 1, columnNumber: 0 },
    scopeChain: [{ type: 'local', object: { objectId: 'scope1' } }],
    ...extra,
  };
}
const callerAt = (line: number, col: number): any => frame('runAll', { location: { scriptId: 's1', lineNumber: line, columnNumber: col } });
const s = (v: string) => ({ type: 'string', value: v });

async function callFrom(engine: CaptureEngine, state: { args: any[] }, arg: number, ret: unknown, line: number, col: number) {
  state.args = [{ name: 'i', value: { type: 'number', value: arg } }];
  await engine.onPaused({ callFrames: [frame('dec'), callerAt(line, col)], hitBreakpoints: ['bp1'] });
  await engine.onPaused({ callFrames: [frame('dec', { returnValue: ret }), callerAt(line, col)], hitBreakpoints: ['bp2'] });
}

describe('callLocations：同一结果来自多个调用点', () => {
  it('同参数同返回值、不同调用点：合并为一条记录，位置全部保留，callLocation 仍是首次出现', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await callFrom(engine, state, 257, s('hello'), 56, 11);
    await callFrom(engine, state, 257, s('hello'), 57, 11);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].count).toBe(2);
    expect(caps[0].callLocation).toEqual({ lineNumber: 56, columnNumber: 11 });
    expect(caps[0].callLocations).toEqual([{ lineNumber: 56, columnNumber: 11 }, { lineNumber: 57, columnNumber: 11 }]);
    expect(caps[0].callLocationsTruncated).toBeUndefined();
  });

  it('同一调用点重复命中：位置去重，计数照常增加', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await callFrom(engine, state, 257, s('hello'), 56, 11);
    await callFrom(engine, state, 257, s('hello'), 56, 11);
    await callFrom(engine, state, 257, s('hello'), 56, 11);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].count).toBe(3);
    expect(caps[0].callLocations).toEqual([{ lineNumber: 56, columnNumber: 11 }]);
  });

  it('同一调用点得到不同返回值：分成两条记录，各自带这个位置', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await callFrom(engine, state, 256, s('Alice'), 70, 4);
    await callFrom(engine, state, 256, s('Bob'), 70, 4);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(2);
    for (const c of caps) expect(c.callLocations).toEqual([{ lineNumber: 70, columnNumber: 4 }]);
  });

  it('同参数、不同调用点各自得到不同返回值：位置不会串到对方的记录里', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await callFrom(engine, state, 256, s('Alice'), 70, 4);
    await callFrom(engine, state, 256, s('Bob'), 80, 4);
    const caps = engine.getCaptures();
    const alice = caps.find((c) => (c.returnValue as any).value === 'Alice')!;
    const bob = caps.find((c) => (c.returnValue as any).value === 'Bob')!;
    expect(alice.callLocations).toEqual([{ lineNumber: 70, columnNumber: 4 }]);
    expect(bob.callLocations).toEqual([{ lineNumber: 80, columnNumber: 4 }]);
  });

  it('超过上限：保留前 50 个位置，并标记 truncated，计数不丢', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    for (let i = 0; i < 60; i++) await callFrom(engine, state, 257, s('hello'), 100 + i, 4);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].count).toBe(60);
    expect(caps[0].callLocations.length).toBe(50);
    expect(caps[0].callLocations[0]).toEqual({ lineNumber: 100, columnNumber: 4 });
    expect(caps[0].callLocations[49]).toEqual({ lineNumber: 149, columnNumber: 4 });
    expect(caps[0].callLocationsTruncated).toBe(true);
  });

  it('栈上没有调用方帧：位置未知，callLocation 为 -1，callLocations 为空', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    state.args = [{ name: 'i', value: { type: 'number', value: 258 } }];
    await engine.onPaused({ callFrames: [frame('dec')], hitBreakpoints: ['bp1'] });
    await engine.onPaused({ callFrames: [frame('dec', { returnValue: s('x') })], hitBreakpoints: ['bp2'] });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].callLocation).toEqual({ lineNumber: -1, columnNumber: -1 });
    expect(caps[0].callLocations).toEqual([]);
  });
});
