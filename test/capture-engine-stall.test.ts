import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptureEngine, type CaptureEvent, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';

// Phase 4.6.1: Phase 3 不明挂起排查。
// 静态阅读发现：引擎的所有 CDP 等待（setBreakpoint、getProperties、stepOver、resume、removeBreakpoint）都没有超时，
// 暂停事件又串在同一条 chain 上。一个永不返回的命令会让后面所有的暂停处理永久排队，页面会停在自己的断点上，
// 而看门狗只在 handle 开始之后才计时，排队中的暂停它看不到。
// 这个文件用桩传输层复现这个结构性卡死。注意：它复现的是机制，不等于证明了当时 20 分钟超时的实际原因。
// 任何可能永不返回的 promise 都不直接 await，而是用 track 观察是否在推进时间后结算，避免测试自己卡死。

const NL = String.fromCharCode(10);
const SOURCE = [`var _arr = ['a', 'b'];`, 'function dec(i) {', '  return _arr[i];', '}'].join(NL);
const plan = computeCapturePlan(SOURCE, SOURCE.indexOf('function dec'));
if (!plan.supported || !plan.entry) throw new Error('test plan unsupported: ' + String(plan.reason));
const entryLine = plan.entry.lineNumber;
const entryColumn = plan.entry.columnNumber;
const target: CaptureTarget = { scriptId: 's1', scriptUrl: 'http://t/s.js', functionName: 'dec', plan };

type Json = Record<string, unknown>;
const RET: Json = { type: 'string', value: 'b' };

function pausedEvent(hits: string[], returnValue?: Json): Json {
  const top: Json = {
    functionName: 'dec',
    location: { scriptId: 's1', lineNumber: entryLine, columnNumber: entryColumn },
    scopeChain: [{ type: 'local', object: { objectId: 'obj1' } }],
  };
  if (returnValue) top.returnValue = returnValue;
  const caller: Json = { functionName: 'run', location: { scriptId: 's1', lineNumber: 7, columnNumber: 2 }, scopeChain: [] };
  return { callFrames: [top, caller], hitBreakpoints: hits };
}

class StubCdp {
  calls: { method: string }[] = [];
  readonly hang = new Set<string>();
  readonly defer = new Set<string>();
  private resolvers: Array<() => void> = [];
  private bp = 0;

  private reply(method: string): unknown {
    if (method === 'Debugger.setBreakpoint') return { breakpointId: 'bp' + ++this.bp };
    if (method === 'Runtime.getProperties') return { result: [{ name: 'i', value: { type: 'number', value: 1 } }] };
    return {};
  }

  readonly send = (method: string, _params?: Record<string, unknown>): Promise<unknown> => {
    this.calls.push({ method });
    if (this.hang.has(method)) return new Promise<unknown>(() => undefined);
    if (this.defer.has(method)) {
      return new Promise<unknown>((resolve) => {
        this.resolvers.push(() => resolve(this.reply(method)));
      });
    }
    return Promise.resolve(this.reply(method));
  };

  flush(): void {
    for (const r of this.resolvers.splice(0)) r();
  }

  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }
}

function make(): { cdp: StubCdp; engine: CaptureEngine; events: CaptureEvent[] } {
  const cdp = new StubCdp();
  const events: CaptureEvent[] = [];
  const engine = new CaptureEngine(cdp.send, (e) => {
    events.push(e);
  });
  return { cdp, engine, events };
}

function track(p: Promise<unknown>): { settled: boolean } {
  const state = { settled: false };
  void p.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return state;
}

describe('Phase 3 捕获引擎：单个永不返回的 CDP 命令不能把引擎永久卡死', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Runtime.getProperties 永不返回：页面不会被留在自己的断点上，下一次自己的断点暂停仍然会被驱动', async () => {
    const { cdp, engine } = make();
    await engine.start([target]);
    cdp.hang.add('Runtime.getProperties');
    void engine.onPaused(pausedEvent(['bp1']));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cdp.count('Debugger.resume')).toBeGreaterThanOrEqual(1);

    cdp.hang.delete('Runtime.getProperties');
    const before = cdp.calls.length;
    void engine.onPaused(pausedEvent(['bp1']));
    await vi.advanceTimersByTimeAsync(60_000);
    const driven = cdp.calls.slice(before).some((c) => c.method === 'Debugger.resume' || c.method === 'Debugger.stepOver');
    expect(driven).toBe(true);
  });

  it('Debugger.stepOver 永不返回：随后的单步暂停仍然会被处理（恢复页面），不会永远排队', async () => {
    const { cdp, engine } = make();
    await engine.start([target]);
    cdp.hang.add('Debugger.stepOver');
    void engine.onPaused(pausedEvent(['bp1']));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cdp.count('Debugger.stepOver')).toBe(1);

    const before = cdp.calls.length;
    void engine.onPaused(pausedEvent([], RET));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cdp.calls.slice(before).some((c) => c.method === 'Debugger.resume')).toBe(true);
  });

  it('Debugger.setBreakpoint 永不返回：start 会结算并报告超时错误，不会永远挂起', async () => {
    const { cdp, engine } = make();
    cdp.hang.add('Debugger.setBreakpoint');
    const startP = engine.start([target]);
    const s = track(startP);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.settled).toBe(true);
    const result = await startP;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toContain('timed out');
  });

  it('Debugger.removeBreakpoint 永不返回：stop 会结算，本地断点状态被清空，并留下超时日志', async () => {
    const { cdp, engine, events } = make();
    await engine.start([target]);
    expect(engine.getBreakpointCount()).toBeGreaterThan(0);
    cdp.hang.add('Debugger.removeBreakpoint');
    const stopP = engine.stop();
    const s = track(stopP);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.settled).toBe(true);
    expect(engine.isActive()).toBe(false);
    expect(engine.getBreakpointCount()).toBe(0);
    expect(events.some((e) => e.kind === 'log' && e.message.includes('timed out'))).toBe(true);
  });

  it('超时之后迟到的回复被忽略：只留下一条读取参数失败的记录，不会重复处理', async () => {
    const { cdp, engine } = make();
    await engine.start([target]);
    cdp.defer.add('Runtime.getProperties');
    void engine.onPaused(pausedEvent(['bp1']));
    await vi.advanceTimersByTimeAsync(10_000);
    cdp.flush();
    await vi.advanceTimersByTimeAsync(1_000);
    const caps = engine.getCaptures();
    expect(caps).toHaveLength(1);
    expect(caps[0].captureStatus).toBe('capture-failed');
    expect(String(caps[0].reason)).toContain('timed out');
  });
});
