import { describe, it, expect, vi, afterEach } from 'vitest';

// Phase 4.6.1: cdp-client 的插桩断点编号在外部断开时必须清理。
// 修复前 onDetach 不清理 instrumentationBps：外部断开（用户取消调试、目标关闭）后重新连接，setInstrumentation(true) 以为已经设置过，不再布置插桩断点，顶层立即执行的调用会漏捕获。
// 注意：这个测试是修复之后才写的，没有在旧代码上验证过它会失败；桩 chrome.debugger 不是真实 Chrome。

type SendCallback = (result?: unknown) => void;
type DetachListener = (source: { tabId?: number }, reason: string) => void;

async function load() {
  vi.resetModules();
  const detachListeners: DetachListener[] = [];
  const sent: string[] = [];
  let bp = 0;
  vi.stubGlobal('chrome', {
    runtime: {},
    debugger: {
      onEvent: { addListener: () => undefined },
      onDetach: {
        addListener: (listener: DetachListener) => {
          detachListeners.push(listener);
        },
      },
      attach: (_target: unknown, _version: string, callback: () => void) => {
        callback();
      },
      detach: (_target: unknown, callback: () => void) => {
        callback();
      },
      sendCommand: (_target: unknown, method: string, _params: unknown, callback: SendCallback) => {
        sent.push(method);
        callback(method === 'Debugger.setInstrumentationBreakpoint' ? { breakpointId: 'ib' + ++bp } : {});
      },
    },
  });
  const cdp = await import('../src/extension/debugger/cdp-client.js');
  return { cdp, detachListeners, sent };
}

const count = (sent: string[], method: string): number => sent.filter((m) => m === method).length;
const SET = 'Debugger.setInstrumentationBreakpoint';

describe('cdp-client 的插桩断点登记在断开时的清理', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('外部断开之后重新连接：插桩断点会重新布置，不会因为旧编号还在而跳过', async () => {
    const { cdp, detachListeners, sent } = await load();
    await cdp.attach(1, { instrumentation: true });
    expect(count(sent, SET)).toBe(1);
    detachListeners[0]({ tabId: 1 }, 'target_closed');
    expect(cdp.isAttached(1)).toBe(false);
    await cdp.attach(1, { instrumentation: true });
    expect(count(sent, SET)).toBe(2);
  });

  it('没有断开时重复开启是幂等的：不会重复布置第二个插桩断点', async () => {
    const { cdp, sent } = await load();
    await cdp.attach(1, { instrumentation: true });
    await cdp.setInstrumentation(1, true);
    expect(count(sent, SET)).toBe(1);
  });

  it('主动 detach：先移除插桩断点，重新连接后再布置', async () => {
    const { cdp, sent } = await load();
    await cdp.attach(1, { instrumentation: true });
    await cdp.detach(1);
    expect(count(sent, 'Debugger.removeBreakpoint')).toBe(1);
    await cdp.attach(1, { instrumentation: true });
    expect(count(sent, SET)).toBe(2);
  });
});
