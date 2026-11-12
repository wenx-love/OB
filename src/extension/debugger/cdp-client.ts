/**
 * CDP 客户端 - 封装 chrome.debugger API
 * 在 Background Service Worker 中运行
 */
import type {
  DebuggerConnectionStatus,
  DebuggerPausedInfo,
  ScriptParsedInfo,
  DebuggerPanelMessage,
} from './types.js';

// ── 全局状态（Service Worker 生命周期内有效）──

const attachedTabs = new Set<number>();
const tabStatus = new Map<number, DebuggerConnectionStatus>();
const eventListeners = new Set<(tabId: number, msg: DebuggerPanelMessage) => void>();

// ── 等待中的 CDP 命令：超时或调试器断开时统一拒绝，避免调用方永久挂起 ──
const SEND_TIMEOUT_MS = 30_000;
interface PendingCommand {
  method: string;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingCommands = new Map<number, Set<PendingCommand>>();

function rejectPending(tabId: number, reason: string): void {
  const set = pendingCommands.get(tabId);
  if (!set) return;
  pendingCommands.delete(tabId);
  for (const p of set) {
    clearTimeout(p.timer);
    p.reject(new Error(reason + '（' + p.method + ' 未得到回复）'));
  }
  set.clear();
}

// ── Phase 3: 运行时捕获钩子（由 background 注册）──
export interface CaptureHooks {
  /** 返回 true 表示这次暂停属于运行时捕获，不再转发给面板 */
  onPaused?: (tabId: number, params: any) => boolean;
  /** beforeScriptExecution 插桩暂停：在目标脚本执行前布置断点。无论成功或抛异常，cdp-client 都会随后 resume */
  onInstrumentation?: (tabId: number, params: any) => Promise<void>;
  onResumed?: (tabId: number) => void;
  onReset?: (tabId: number, reason: string) => void;
}
let hooks: CaptureHooks = {};
// 每个 tab 由本插件创建的插桩断点编号，detach 时只移除这一个
const instrumentationBps = new Map<number, string>();
export function setHooks(h: CaptureHooks): void {
  hooks = h;
}

// ── 监听 CDP 事件 ──

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (tabId === undefined || !attachedTabs.has(tabId)) return;

  if (method === 'Debugger.paused') {
    if ((params as any)?.reason === 'instrumentation') {
      void handleInstrumentation(tabId, params);
      return;
    }
    if (hooks.onPaused && hooks.onPaused(tabId, params)) return;
    handlePaused(tabId, params as any);
  } else if (method === 'Debugger.resumed') {
    hooks.onResumed?.(tabId);
    emit(tabId, { type: 'debugger-event', event: { kind: 'resumed' } });
  } else if (method === 'Debugger.globalObjectCleared' || method === 'Runtime.executionContextsCleared') {
    hooks.onReset?.(tabId, 'page navigated or reloaded');
  } else if (method === 'Debugger.scriptParsed') {
    handleScriptParsed(tabId, params as any);
  } else if (method === 'Runtime.executionContextCreated') {
    emit(tabId, {
      type: 'debugger-event',
      event: { kind: 'context-created', context: (params as any)?.context },
    });
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (tabId === undefined) return;
  
  log(tabId, 'warn', `调试器已断开: ${reason}`);
  hooks.onReset?.(tabId, 'debugger detached: ' + reason);
  attachedTabs.delete(tabId);
  rejectPending(tabId, '调试器已断开: ' + reason);
  // 外部断开（用户取消调试、目标关闭）时插桩断点已随目标失效：不清理这个编号，重新连接后 setInstrumentation 会以为已经设置过而不再布置插桩断点
  instrumentationBps.delete(tabId);
  tabStatus.set(tabId, 'disconnected');
  emit(tabId, {
    type: 'debugger-event',
    event: { kind: 'status-changed', status: 'disconnected', error: reason },
  });
});

// ── 公开 API ──

export async function attach(tabId: number, opts: { instrumentation?: boolean } = {}): Promise<void> {
  if (attachedTabs.has(tabId)) {
    log(tabId, 'info', '已连接');
    return;
  }

  tabStatus.set(tabId, 'connecting');
  emit(tabId, { type: 'debugger-event', event: { kind: 'status-changed', status: 'connecting' } });

  try {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    attachedTabs.add(tabId);

    // 启用 Debugger 和 Runtime 域
    await sendCommand(tabId, 'Debugger.enable', {});
    // 插桩断点只在自动捕获引擎激活期间才需要；手动断点模式不设置，避免页面每执行一个脚本就被暂停一次
    if (opts.instrumentation) await setInstrumentation(tabId, true);
    await sendCommand(tabId, 'Runtime.enable', {});

    tabStatus.set(tabId, 'connected');
    emit(tabId, { type: 'debugger-event', event: { kind: 'status-changed', status: 'connected' } });
    log(tabId, 'info', '已连接');
  } catch (err: any) {
    tabStatus.set(tabId, 'error');
    const message = err.message || '连接失败';
    emit(tabId, {
      type: 'debugger-event',
      event: { kind: 'status-changed', status: 'error', error: message },
    });
    log(tabId, 'error', message);
    throw err;
  }
}

/**
 * 开关 beforeScriptExecution 插桩断点（幂等）。
 * 仅自动捕获引擎激活期间需要；手动断点模式下不设置，避免页面每执行一个脚本就被暂停一次。
 */
export async function setInstrumentation(tabId: number, enabled: boolean): Promise<void> {
  if (!attachedTabs.has(tabId)) return;
  const existing = instrumentationBps.get(tabId);
  if (enabled && !existing) {
    try {
      const r = await sendCommand(tabId, 'Debugger.setInstrumentationBreakpoint', { instrumentation: 'beforeScriptExecution' });
      if (r && r.breakpointId) instrumentationBps.set(tabId, r.breakpointId);
      log(tabId, 'info', '已启用 beforeScriptExecution 插桩断点（自动捕获）');
    } catch (err: any) {
      log(tabId, 'warn', '插桩断点不可用，顶层立即执行的调用可能漏捕获: ' + err.message);
    }
  } else if (!enabled && existing) {
    instrumentationBps.delete(tabId);
    try {
      await sendCommand(tabId, 'Debugger.removeBreakpoint', { breakpointId: existing });
      log(tabId, 'info', '已移除 beforeScriptExecution 插桩断点');
    } catch {
      // 调试器已断开或页面已销毁时断点自然失效
    }
  }
}

export async function detach(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return;

  // 尽力移除本插件的插桩断点，避免 DevTools 等其他客户端继续被我们的插桩暂停打扰
  const instrId = instrumentationBps.get(tabId);
  instrumentationBps.delete(tabId);
  if (instrId) {
    try {
      await sendCommand(tabId, 'Debugger.removeBreakpoint', { breakpointId: instrId });
    } catch {
      // detach 本身会让断点失效，忽略
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    attachedTabs.delete(tabId);
    rejectPending(tabId, '调试器已断开（主动断开）');
    tabStatus.set(tabId, 'disconnected');
    emit(tabId, { type: 'debugger-event', event: { kind: 'status-changed', status: 'disconnected' } });
    log(tabId, 'info', '已断开');
  } catch (err: any) {
    log(tabId, 'error', `断开失败: ${err.message}`);
  }
}

export function getStatus(tabId: number): DebuggerConnectionStatus {
  return tabStatus.get(tabId) || 'disconnected';
}

export function isAttached(tabId: number): boolean {
  return attachedTabs.has(tabId);
}

export async function sendCommand(
  tabId: number,
  method: string,
  params?: Record<string, any>,
  timeoutMs: number = SEND_TIMEOUT_MS,
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!attachedTabs.has(tabId)) {
      reject(new Error('调试器未连接'));
      return;
    }

    const owner = pendingCommands.get(tabId) ?? new Set<PendingCommand>();
    pendingCommands.set(tabId, owner);
    const entry: PendingCommand = {
      method,
      reject,
      timer: setTimeout(() => {
        owner.delete(entry);
        reject(new Error('CDP command timed out: ' + method + ' (' + timeoutMs + 'ms)'));
      }, timeoutMs),
    };
    owner.add(entry);

    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
      // 先读取 lastError：即使回复已被忽略，也不留下未检查的 runtime.lastError
      const lastError = chrome.runtime.lastError;
      clearTimeout(entry.timer);
      // 已超时或已因断开被拒绝：迟到的回复直接忽略
      if (!owner.delete(entry)) return;
      if (lastError) {
        reject(new Error(lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

export async function resume(tabId: number): Promise<void> {
  try {
    await sendCommand(tabId, 'Debugger.resume', {});
    log(tabId, 'info', '已恢复执行');
  } catch (err: any) {
    log(tabId, 'error', `恢复失败: ${err.message}`);
    throw err;
  }
}

export async function getScriptSource(tabId: number, scriptId: string): Promise<string> {
  try {
    const result = await sendCommand(tabId, 'Debugger.getScriptSource', { scriptId });
    return result.scriptSource || '';
  } catch (err: any) {
    log(tabId, 'error', `获取脚本源码失败: ${err.message}`);
    return '';
  }
}

export function addEventListener(listener: (tabId: number, msg: DebuggerPanelMessage) => void): void {
  eventListeners.add(listener);
}

export function removeEventListener(listener: (tabId: number, msg: DebuggerPanelMessage) => void): void {
  eventListeners.delete(listener);
}

// ── 内部工具 ──

/**
 * 插桩暂停：脚本即将执行。先让 background 分析并布置断点，然后无条件恢复。
 * resume 放在 finally 里：分析抛异常、超时或没有注册钩子时，页面都不会被卡住。
 */
async function handleInstrumentation(tabId: number, params: any): Promise<void> {
  try {
    if (hooks.onInstrumentation) await hooks.onInstrumentation(tabId, params);
  } catch (err: any) {
    log(tabId, 'error', `插桩处理失败（已恢复页面执行）: ${err && err.message ? err.message : String(err)}`);
  } finally {
    try {
      await sendCommand(tabId, 'Debugger.resume', {});
    } catch (err: any) {
      const msg = err && err.message ? String(err.message) : String(err);
      if (!msg.includes('while paused') && !msg.includes('未连接')) log(tabId, 'error', `插桩暂停恢复失败: ${msg}`);
    }
  }
}

function emit(tabId: number, msg: DebuggerPanelMessage): void {
  for (const listener of eventListeners) {
    listener(tabId, msg);
  }
}

function log(tabId: number, level: 'info' | 'warn' | 'error', message: string): void {
  emit(tabId, { type: 'debugger-event', event: { kind: 'log', level, message } });
}

function handlePaused(tabId: number, params: any): void {
  const callFrames = params.callFrames || [];
  const reason = params.reason || 'unknown';
  
  const info: DebuggerPausedInfo = {
    reason,
    callFrames: callFrames.map((cf: any) => ({
      callFrameId: cf.callFrameId,
      functionName: cf.functionName || '(anonymous)',
      location: {
        scriptId: cf.location?.scriptId || '',
        lineNumber: cf.location?.lineNumber || 0,
        columnNumber: cf.location?.columnNumber || 0,
      },
      url: cf.url || '',
    })),
  };

  log(tabId, 'info', `已暂停 (${reason})`);
  emit(tabId, { type: 'debugger-event', event: { kind: 'paused', info } });
}

function handleScriptParsed(tabId: number, params: any): void {
  const info: ScriptParsedInfo = {
    scriptId: params.scriptId,
    url: params.url || '',
    startLine: params.startLine || 0,
    startColumn: params.startColumn || 0,
    endLine: params.endLine || 0,
    endColumn: params.endColumn || 0,
    sourceMapURL: params.sourceMapURL,
  };

  emit(tabId, { type: 'debugger-event', event: { kind: 'script-parsed', info } });
}
