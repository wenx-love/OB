import { describe, it, expect, vi, afterEach } from 'vitest';

// Phase 4.6.1: cdp-client.sendCommand 的等待边界。
// 修复前 sendCommand 只在 Chrome 回调时才结算：回调永不到来（目标已销毁、调试器异常）就永远挂起，
// onDetach 也不清理还在等待的命令。这里用桩 chrome.debugger 检查：无回复时按时限超时，断开时立即拒绝所有等待中的命令，
// 正常回复后不留计时器，chrome.runtime.lastError 照常传递。

type SendCallback = (result?: unknown) => void;
type DetachListener = (source: { tabId?: number }, reason: string) => void;
interface Harness {
  sent: { method: string; callback: SendCallback }[];
  detachListeners: DetachListener[];
  runtime: { lastError?: { message: string } };
}

async function load() {
  vi.resetModules();
  const harness: Harness = { sent: [], detachListeners: [], runtime: {} };
  vi.stubGlobal('chrome', {
    runtime: harness.runtime,
    debugger: {
      onEvent: { addListener: () => undefined },
      onDetach: {
        addListener: (listener: DetachListener) => {
          harness.detachListeners.push(listener);
        },
      },
      attach: (_target: unknown, _version: string, callback: () => void) => {
        callback();
      },
      detach: (_target: unknown, callback: () => void) => {
        callback();
      },
      sendCommand: (_target: unknown, method: string, _params: unknown, callback: SendCallback) => {
        if (method === 'Debugger.enable' || method === 'Runtime.enable') {
          callback({});
          return;
        }
        harness.sent.push({ method, callback });
      },
    },
  });
  const cdp = await import('../src/extension/debugger/cdp-client.js');
  await cdp.attach(1);
  return { cdp, harness };
}

function track(p: Promise<unknown>): { settled: boolean; error: string; value: unknown } {
  const state: { settled: boolean; error: string; value: unknown } = { settled: false, error: '', value: undefined };
  void p.then(
    (v) => {
      state.settled = true;
      state.value = v;
    },
    (e: Error) => {
      state.settled = true;
      state.error = e.message;
    },
  );
  return state;
}

describe('cdp-client.sendCommand 的等待边界', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('回复永不到来：按时限超时拒绝，迟到的回复被忽略，不留计时器', async () => {
    vi.useFakeTimers();
    const { cdp, harness } = await load();
    const t = track(cdp.sendCommand(1, 'Debugger.getScriptSource', { scriptId: '1' }));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(t.settled).toBe(true);
    expect(t.error).toContain('timed out');
    harness.sent[0].callback({ scriptSource: 'late' });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.value).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('调试器断开：所有等待中的命令立即被拒绝，不必等超时', async () => {
    vi.useFakeTimers();
    const { cdp, harness } = await load();
    const a = track(cdp.sendCommand(1, 'Debugger.getScriptSource', { scriptId: '1' }));
    const b = track(cdp.sendCommand(1, 'Runtime.getProperties', { objectId: 'x' }));
    expect(a.settled || b.settled).toBe(false);
    harness.detachListeners[0]({ tabId: 1 }, 'target_closed');
    await vi.advanceTimersByTimeAsync(0);
    expect(a.settled).toBe(true);
    expect(b.settled).toBe(true);
    expect(a.error).toContain('断开');
    expect(b.error).toContain('断开');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('正常回复：解析出结果，并且不留计时器', async () => {
    vi.useFakeTimers();
    const { cdp, harness } = await load();
    const t = track(cdp.sendCommand(1, 'Debugger.getScriptSource', { scriptId: '1' }));
    harness.sent[0].callback({ scriptSource: 'ok' });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.settled).toBe(true);
    expect(t.value).toEqual({ scriptSource: 'ok' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('chrome.runtime.lastError 照常转成拒绝', async () => {
    vi.useFakeTimers();
    const { cdp, harness } = await load();
    const t = track(cdp.sendCommand(1, 'Debugger.getScriptSource', { scriptId: '1' }));
    harness.runtime.lastError = { message: 'Cannot find context with specified id' };
    harness.sent[0].callback();
    harness.runtime.lastError = undefined;
    await vi.advanceTimersByTimeAsync(0);
    expect(t.settled).toBe(true);
    expect(t.error).toContain('Cannot find context');
  });
});
