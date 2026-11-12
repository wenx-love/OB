import { describe, it, expect, afterEach } from 'vitest';
import { CaptureEngine, type CaptureTarget, type DecoderCapture } from '../src/extension/debugger/capture-engine.js';
import type { CapturePlan } from '../src/core/capture-plan.js';

// Phase 4.7 方案 D：逐条观测元数据（depth / frameName / hitBreakpointId / failureStage）。
// 用真实 CaptureEngine + 桩传输层。关键不变量：同一条合并记录里，来自不同深度的观测必须能逐条区分。

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

/** 一次完整调用：入口暂停（读参数）→ 返回暂停（读返回值）。extraFrames 用来制造更深的栈。 */
async function call(engine: CaptureEngine, state: { args: any[] }, arg: number, ret: unknown, line: number, col: number, extraFrames: any[] = [], entryBp = 'bp1', exitBp = 'bp2') {
  state.args = [{ name: 'i', value: { type: 'number', value: arg } }];
  await engine.onPaused({ callFrames: [frame('dec'), callerAt(line, col), ...extraFrames], hitBreakpoints: [entryBp] });
  await engine.onPaused({ callFrames: [frame('dec', { returnValue: ret }), callerAt(line, col), ...extraFrames], hitBreakpoints: [exitBp] });
}

describe('方案 D：捕获记录携带逐条观测元数据', () => {
  it('成功记录：每条观测都有 depth / frameName / hitBreakpointId / callLocation，且 depth 来自真实栈深', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 257, s('hello'), 56, 11);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    const obs = caps[0].observations;
    expect(Array.isArray(obs)).toBe(true);
    // 引擎语义（已按源码核实）：入口暂停只进 pending 不 record，只有返回值暂停才 record 成功记录。
    // 因此一次完整调用 = 恰好一条 observation。
    expect(obs!.length).toBe(1);
    for (const o of obs!) {
      // 真实栈深是 2（dec + 调用方），取自该次 record 时 pending 里保存的 frames.length
      expect(o.depth).toBe(2);
      expect(o.frameName).toBe('dec');
      expect(o.callLocation).toEqual({ lineNumber: 56, columnNumber: 11 });
      expect(o.status).toBe('success');
      expect(typeof o.seq).toBe('number');
    }
    // 命中断点 ID 必须来自真实 hitBreakpoints。成功记录由返回值暂停触发，其帧由入口帧配对而来，
    // 入口帧记录的 hitBreakpointId 是入口断点 bp1（record 用的是 pending 里保存的值，不是返回暂停的 bp2）
    expect(obs![0].hitBreakpointId).toBe('bp1');
    // 成功观测没有失败阶段
    expect(obs![0].failureStage).toBeUndefined();
  });

  it('不同 depth 的记录不会因为去重而丢失逐条信息', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    // 同一参数、同一返回值，但两次调用的栈深不同（一次 2 层，一次 4 层）→ 合并成一条记录
    await call(engine, state, 257, s('same'), 10, 5, []);
    await call(engine, state, 257, s('same'), 10, 5, [frame('mid'), frame('outer')]);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    const cap = caps[0];
    expect(cap.count).toBe(2);
    const depths = cap.observations!.map((o) => o.depth).sort((a, b) => a - b);
    // 关键：两个不同深度都保留下来了，没有只留一个汇总 depth
    expect(depths).toEqual([2, 4]);
    expect(new Set(cap.observations!.map((o) => o.depth)).size).toBe(2);
    // 逐条观测序号应当不同
    expect(new Set(cap.observations!.map((o) => o.seq)).size).toBe(2);
  });

  it('失败记录：仍然是逐条观测，且带上 failureStage 与真实栈信息', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    // 入口暂停里 top frame 没有函数名 → openPending 阶段失败
    await engine.onPaused({ callFrames: [{ ...frame('', {}), functionName: '' }, callerAt(70, 4)], hitBreakpoints: ['bp1'] });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].captureStatus).toBe('capture-failed');
    const obs = caps[0].observations!;
    expect(obs.length).toBe(1);
    expect(obs[0].failureStage).toBe('openPending');
    // 失败观测也保留了当时能取到的元数据
    expect(obs[0].depth).toBe(2);
    expect(obs[0].callLocation).toEqual({ lineNumber: 70, columnNumber: 4 });
    expect(obs[0].hitBreakpointId).toBe('bp1');
    expect(obs[0].status).toBe('capture-failed');
  });

  it('取不到的字段保持缺失，不被填成猜测值', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    // 构造：入口暂停时栈上只有目标函数一帧，没有调用方帧 → callLocation 取不到。
    // 必须走完整调用（入口 + 返回），否则 advance 找不到 pending 项（idx < 0），根本不会产生成功记录。
    state.args = [{ name: 'i', value: { type: 'number', value: 257 } }];
    await engine.onPaused({ callFrames: [frame('dec')], hitBreakpoints: ['bp1'] });
    await engine.onPaused({ callFrames: [frame('dec', { returnValue: s('v') })], hitBreakpoints: ['bp2'] });
    const caps = engine.getCaptures();
    const withRet = caps.filter((c) => c.returnValue !== undefined);
    expect(withRet.length).toBe(1);
    // 调用方帧缺失：位置取不到，必须是空数组与 -1，而不是填 0:0 之类的猜测值
    expect(withRet[0].callLocations).toEqual([]);
    expect(withRet[0].callLocation).toEqual({ lineNumber: -1, columnNumber: -1 });
    // callLocation 缺失时，逐条元数据里也不能出现编造的位置
    expect(withRet[0].observations!.length).toBe(1);
    for (const o of withRet[0].observations!) expect(o.callLocation).toBeUndefined();
    // 同一帧缺失场景下 depth 仍然是真实栈深 1
    expect(withRet[0].observations![0].depth).toBe(1);
  });

  it('历史记录（没有 observations 字段）仍然可以读取', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 257, s('hello'), 56, 11);
    const cap = engine.getCaptures()[0];
    // 模拟 Phase 4.7 之前保存的旧记录：把新增字段整条删掉
    const legacy: DecoderCapture = JSON.parse(JSON.stringify(cap));
    delete legacy.observations;
    delete legacy.observationsTruncated;
    // 旧字段语义不变，读取方对缺失的 observations 必须容忍
    expect(legacy.scriptId).toBe('s1');
    expect(legacy.functionName).toBe('dec');
    expect(legacy.callLocations).toEqual([{ lineNumber: 56, columnNumber: 11 }]);
    expect(legacy.count).toBe(1);
    expect(legacy.observations).toBeUndefined();
    expect((legacy.observations ?? []).length).toBe(0);
  });

  it('既有语义不变：去重计数、callLocations 合并、firstSeq/lastSeq 仍按原样工作', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 257, s('hello'), 56, 11);
    await call(engine, state, 257, s('hello'), 57, 11);
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].count).toBe(2);
    expect(caps[0].callLocation).toEqual({ lineNumber: 56, columnNumber: 11 });
    expect(caps[0].callLocations).toEqual([{ lineNumber: 56, columnNumber: 11 }, { lineNumber: 57, columnNumber: 11 }]);
    expect(caps[0].callLocationsTruncated).toBeUndefined();
    expect(caps[0].firstSeq).toBeLessThan(caps[0].lastSeq);
    // 逐条元数据的位置与合并后的 callLocations 一一对应：两次调用各产生一条 observation、各贡献一个位置
    expect(caps[0].observations!.length).toBe(2);
    expect(caps[0].observations!.map((o) => o.callLocation)).toEqual([
      { lineNumber: 56, columnNumber: 11 },
      { lineNumber: 57, columnNumber: 11 },
    ]);
    expect(caps[0].observations!.map((o) => o.callLocation)).toEqual(caps[0].callLocations);
  });

  it('失败观测的 failureStage 能区分 stopNow', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    // 只进入口、不返回，然后停止捕获 → 待处理项在 stopNow 阶段失败
    state.args = [{ name: 'i', value: { type: 'number', value: 257 } }];
    await engine.onPaused({ callFrames: [frame('dec'), callerAt(9, 1)], hitBreakpoints: ['bp1'] });
    await engine.stop();
    const failed = engine.getCaptures().filter((c) => c.captureStatus !== 'success');
    expect(failed.length).toBe(1);
    expect(failed[0].observations![0].failureStage).toBe('stopNow');
    expect(failed[0].observations![0].depth).toBe(2);
  });
});
