import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptureEngine, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';

// Phase 4.6.1: stepOver 超时之后的认领窗口。
// 给引擎加命令超时时引入了 stepExpiry：stepOver 的回复被放弃等待后，stepRequested 保持 true 一段时间（watchdogMs），继续认领这次单步可能产生的迟到暂停，过期后清掉，避免吞掉用户自己的暂停。
// 静态阅读发现一个窄窗口：cdp-client 的钩子在事件到达时同步调用 ownsPause 判断归属，暂停随后才进入串行链排队，handle 可能在过期之后才执行。
// 这时 handle 读到的 stepRequested 已经是 false，这次本来归我们的单步暂停会被当成外来暂停：不恢复页面，页面停在暂停上。
// 本文件先在未修复的代码上运行，留作复现证据：预期第一个用例失败，第二个用例通过。
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

function make(): { engine: CaptureEngine; hang: Set<string> } {
  const hang = new Set<string>();
  let bp = 0;
  const send = (method: string): Promise<unknown> => {
    if (hang.has(method)) return new Promise<unknown>(() => undefined);
    if (method === 'Debugger.setBreakpoint') return Promise.resolve({ breakpointId: 'bp' + ++bp });
    if (method === 'Runtime.getProperties') return Promise.resolve({ result: [{ name: 'i', value: { type: 'number', value: 1 } }] });
    return Promise.resolve({});
  };
  const engine = new CaptureEngine(send, () => undefined, { watchdogMs: 1000, commandTimeoutMs: 5000 });
  return { engine, hang };
}

describe('stepOver 超时之后的认领窗口', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('迟到的单步暂停在认领期限内到达（同步归属判断为我们），串行链忙到期限之后才处理它：仍按我们的暂停处理，不能当成外来暂停', async () => {
    const { engine, hang } = make();
    await engine.start([target]);
    hang.add('Debugger.stepOver');
    hang.add('Debugger.resume');
    void engine.onPaused(pausedEvent(['bp1']));
    // 5s：stepOver 超时，catch 里的 resume 也无回复，串行链被占到 10s；stepExpiry 在 6s 过期
    await vi.advanceTimersByTimeAsync(5_500);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(true);
    void engine.onPaused(pausedEvent([], RET));
    await vi.advanceTimersByTimeAsync(20_000);
    const s = engine.getStats();
    expect(s.foreignPauses).toBe(0);
    expect(s.pauses).toBe(2);
  });

  it('过期之后不再认领：认领期限内归我们，期限过后用户自己的暂停不会被当成我们的单步', async () => {
    const { engine, hang } = make();
    await engine.start([target]);
    hang.add('Debugger.stepOver');
    void engine.onPaused(pausedEvent(['bp1']));
    await vi.advanceTimersByTimeAsync(5_500);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(engine.ownsPause(pausedEvent([], RET))).toBe(false);
  });
});
