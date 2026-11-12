import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptureEngine, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';

// Phase 4.6.1: stepOver 超时之后的认领期限计时器（stepExpiry）必须随 reset / softReset 一起清理。
// 静态阅读发现：reset 与 softReset 只清 stepRequested，不清这个计时器；设置新计时器之前也不清旧的。
// 旧计时器在重置之后触发，会把重置后新发出的单步标记清掉，那次本来归我们的单步暂停就会被当成外来暂停，不恢复页面，页面停在暂停上。
// 本文件先在未修复的代码上运行，留作复现证据：预期 3 个用例都失败。
// 注意：用桩传输层和假计时器复现机制，不是真实 Chrome。

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

function make(): { engine: CaptureEngine; hang: Set<string>; ids: string[] } {
  const hang = new Set<string>();
  const ids: string[] = [];
  const send = (method: string): Promise<unknown> => {
    if (hang.has(method)) return new Promise<unknown>(() => undefined);
    if (method === 'Debugger.setBreakpoint') {
      const id = 'bp' + (ids.length + 1);
      ids.push(id);
      return Promise.resolve({ breakpointId: id });
    }
    if (method === 'Runtime.getProperties') return Promise.resolve({ result: [{ name: 'i', value: { type: 'number', value: 1 } }] });
    return Promise.resolve({});
  };
  const engine = new CaptureEngine(send, () => undefined, { watchdogMs: 1000, commandTimeoutMs: 5000 });
  return { engine, hang, ids };
}

describe('stepOver 超时之后的认领期限计时器随重置清理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reset：认领期限计时器被清掉，不留任何待触发的计时器', async () => {
    const { engine, hang, ids } = make();
    await engine.start([target]);
    hang.add('Debugger.stepOver');
    void engine.onPaused(pausedEvent([ids[0]]));
    await vi.advanceTimersByTimeAsync(5_500);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(true);
    engine.reset('page navigated');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('softReset：只剩看门狗的 interval（它是保留的捕获意图的一部分），认领期限计时器被清掉', async () => {
    const { engine, hang, ids } = make();
    await engine.start([target]);
    hang.add('Debugger.stepOver');
    void engine.onPaused(pausedEvent([ids[0]]));
    await vi.advanceTimersByTimeAsync(5_500);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(true);
    engine.softReset('page navigated');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('重置之后新发出的单步：重置前遗留的旧计时器到期，也不会清掉新的单步标记', async () => {
    const { engine, hang, ids } = make();
    await engine.start([target]);
    const first = ids.length;
    hang.add('Debugger.stepOver');
    void engine.onPaused(pausedEvent([ids[0]]));
    // 5s：stepOver 超时，认领期限计时器设在 6s
    await vi.advanceTimersByTimeAsync(5_500);
    engine.reset('page navigated');
    hang.delete('Debugger.stepOver');
    await engine.start([target]);
    // 重置后的第一次暂停：stepOver 正常返回，等待这次单步的暂停到达
    void engine.onPaused(pausedEvent([ids[first]]));
    await vi.advanceTimersByTimeAsync(10);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(true);
    // 6.5s：旧计时器本来会在 6s 触发
    await vi.advanceTimersByTimeAsync(1_000);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(true);
  });
});
