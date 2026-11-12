/**
 * Background Service Worker (MV3)
 *
 * 负责：
 * 1. 静态还原消息路由（ping/pong）
 * 2. chrome.debugger API 封装（CDP 连接、事件转发）
 * 3. DevTools Panel 的长连接端口管理
 * 4. Phase 2 — 脚本自动发现与源码获取
 *
 * MV3 注意：Service Worker 可能被浏览器终止。
 * - chrome.debugger.onEvent / onDetach 在顶层注册，每次 SW 启动自动重新注册。
 * - panelPorts 是 ephemeral state，panel 通过 chrome.runtime.connect 重连。
 * - 只要 panel 保持 port 连接，SW 保持存活。
 */
import * as cdp from './debugger/cdp-client.js';
import { ScriptCollector } from './debugger/script-collector.js';
import { CaptureEngine } from './debugger/capture-engine.js';
import { ManualCapture } from './debugger/manual-capture.js';
import { discoverDecoders } from '../core/decoder-discovery.js';
import { computeCapturePlan } from '../core/capture-plan.js';
import { parseCode } from '../core/parser.js';
import { DEFAULT_STRATEGY, selectTargets, type CaptureStrategyConfig } from '../core/capture-strategy.js';
import type { PanelCommand, PanelCommandResponse, DebuggerPanelMessage } from './debugger/types.js';

// ── Port 管理 ──
// key: tabId, value: 与 panel 的长连接端口
const panelPorts = new Map<number, chrome.runtime.Port>();

// ── Phase 2: Script Collector（每个 tab 独立收集器）──
const scriptCollectors = new Map<number, ScriptCollector>();

function getOrCreateCollector(tabId: number): ScriptCollector {
  if (!scriptCollectors.has(tabId)) {
    scriptCollectors.set(tabId, new ScriptCollector());
  }
  return scriptCollectors.get(tabId)!;
}

// ── Phase 3: 运行时捕获引擎（每个 tab 独立）──
const captureEngines = new Map<number, CaptureEngine>();
// 每个 tab 的自动捕获策略（high 默认；medium/low 需用户显式开启）
const captureStrategies = new Map<number, CaptureStrategyConfig>();

// ── 手动断点捕获器（每个 tab 独立）──
const manualCaptures = new Map<number, ManualCapture>();
// 捕获模式：'auto' = 自动插桩和断点，'manual' = 只响应用户手动断点
const captureModes = new Map<number, 'auto' | 'manual'>();

function getOrCreateManualCapture(tabId: number): ManualCapture {
  let mc = manualCaptures.get(tabId);
  if (!mc) {
    mc = new ManualCapture(
      (method, params) => cdp.sendCommand(tabId, method, params),
      {},
      (scriptId) => getOrCreateCollector(tabId).getScript(scriptId)?.url ?? '',
    );
    manualCaptures.set(tabId, mc);
  }
  return mc;
}

function postPanel(tabId: number, msg: DebuggerPanelMessage): void {
  const port = panelPorts.get(tabId);
  if (!port) return;
  try {
    port.postMessage(msg);
  } catch {
    panelPorts.delete(tabId);
  }
}

function postCaptureState(tabId: number, extra: Record<string, unknown> = {}): void {
  const e = captureEngines.get(tabId);
  postPanel(tabId, {
    type: 'debugger-event',
    event: {
      kind: 'capture-state',
      active: e ? e.isActive() : false,
      breakpoints: e ? e.getBreakpointCount() : 0,
      stats: e ? e.getStats() : null,
      captures: e ? e.getCaptures() : [],
      stability: e ? e.getStability() : [],
      autoCaptureMinConfidence: captureStrategies.get(tabId)?.autoCaptureMinConfidence ?? 'high',
      ...extra,
    } as any,
  });
}

function getOrCreateEngine(tabId: number): CaptureEngine {
  let e = captureEngines.get(tabId);
  if (!e) {
    e = new CaptureEngine(
      (method, params) => cdp.sendCommand(tabId, method, params),
      (ev) => postPanel(tabId, { type: 'debugger-event', event: { kind: 'capture-event', event: ev } }),
    );
    captureEngines.set(tabId, e);
  }
  return e;
}

// 暂停归属：根据捕获模式决定如何处理
cdp.setHooks({
  onPaused: (tabId, params) => {
    const mode = captureModes.get(tabId) || 'manual'; // 默认手动模式
    const e = captureEngines.get(tabId);
    
    // 自动模式：只处理自己设置的断点
    if (mode === 'auto') {
      if (!e || !e.ownsPause(params)) return false;
      void e.onPaused(params);
      return true;
    }
    
    // 手动模式：处理用户手动断点
    if (mode === 'manual') {
      // 如果是自动引擎的断点，忽略（防止冲突）
      if (e && e.ownsPause(params)) return false;
      
      const mc = getOrCreateManualCapture(tabId);
      if (mc.isEnabled()) {
        void mc.onManualPause(params).then((result) => {
          if (result.handled && result.record) {
            postPanel(tabId, {
              type: 'debugger-event',
              event: {
                kind: 'manual-capture',
                record: result.record,
              } as any,
            });
          }
        }).catch((err: any) => {
          postPanel(tabId, {
            type: 'debugger-event',
            event: {
              kind: 'log',
              level: 'error',
              message: '手动断点捕获失败: ' + (err && err.message ? err.message : String(err)),
            },
          });
        });
      }
      
      // 返回 false，让暂停事件继续转发到面板（不自动 resume）
      return false;
    }
    
    return false;
  },
  // 插桩暂停：目标脚本即将执行。只在自动模式且引擎激活时启用
  onInstrumentation: async (tabId, params) => {
    const mode = captureModes.get(tabId) || 'manual';
    // 手动模式不使用插桩断点
    if (mode === 'manual') return;
    
    const e = captureEngines.get(tabId);
    if (!e || !e.isActive()) return;
    const scriptId: string | undefined = params?.data?.scriptId;
    if (!scriptId) {
      postPanel(tabId, { type: 'debugger-event', event: { kind: 'log', level: 'warn', message: '插桩暂停没有携带 scriptId，已跳过' } });
      return;
    }
    const url = getOrCreateCollector(tabId).getScript(scriptId)?.url ?? '';
    const source = await cdp.getScriptSource(tabId, scriptId);
    if (!source) {
      postPanel(tabId, { type: 'debugger-event', event: { kind: 'log', level: 'warn', message: `插桩：脚本 ${scriptId} 源码为空，已跳过` } });
      return;
    }
    const d = discoverDecoders(source, scriptId, url);
    if (!d.analyzed) {
      postPanel(tabId, { type: 'debugger-event', event: { kind: 'log', level: 'error', message: `插桩：脚本 ${scriptId} 分析失败：${d.error}` } });
      return;
    }
    const cfg = captureStrategies.get(tabId) ?? DEFAULT_STRATEGY;
    const picked = selectTargets(d.candidates, cfg);
    if (picked.length === 0) return;
    const ast = parseCode(source);
    const targets = picked.map((c) => ({
      scriptId,
      scriptUrl: url,
      functionName: c.name as string,
      plan: computeCapturePlan(source, c.location.start, ast),
    }));
    const r = await e.start(targets);
    postPanel(tabId, { type: 'debugger-event', event: { kind: 'log', level: 'info', message: `插桩：脚本 ${scriptId} 执行前布置了 ${r.set} 个断点（${picked.length} 个候选，${r.skipped.length} 个跳过，${r.errors.length} 个错误）` } });
    postCaptureState(tabId, { skipped: r.skipped, errors: r.errors });
  },
  onResumed: (tabId) => {
    captureEngines.get(tabId)?.onResumed();
    manualCaptures.get(tabId)?.onResumed();
  },
  onReset: (tabId, reason) => {
    // 页面刷新/导航：旧 scriptId 全部失效，清理脚本收集器（Phase 2 要求刷新后清理旧脚本状态）
    if (reason.startsWith('page')) scriptCollectors.get(tabId)?.clear();
    // 手动模式保存的暂停调用栈随页面重置 / 调试器断开一并失效
    manualCaptures.get(tabId)?.onReset();
    const e = captureEngines.get(tabId);
    if (e) {
      // 用户仍在捕获时，保留激活状态（否则新文档的插桩钩子会失效，顶层立即执行调用又会漏掉）
      if (captureStrategies.has(tabId)) e.softReset(reason);
      else e.reset(reason);
    }
    postCaptureState(tabId, { resetReason: reason });
  },
});

// 标签页关闭：清理引擎和脚本收集器
chrome.tabs.onRemoved.addListener((tabId) => {
  captureEngines.get(tabId)?.reset('tab closed');
  captureEngines.delete(tabId);
  scriptCollectors.delete(tabId);
  // 手动捕获器、捕获模式、捕获策略也按标签页保存：不清理会让已关闭的标签页一直占着这些 Map 里的条目
  manualCaptures.get(tabId)?.onReset();
  manualCaptures.delete(tabId);
  captureModes.delete(tabId);
  captureStrategies.delete(tabId);
});

// ── CDP 事件 → Panel 转发 + 脚本收集 ──
cdp.addEventListener((tabId, msg) => {
  const port = panelPorts.get(tabId);

  // Phase 2: 拦截 script-parsed 事件，自动收集脚本
  if (msg.type === 'debugger-event' && msg.event.kind === 'script-parsed') {
    const collector = getOrCreateCollector(tabId);
    const script = collector.addScript(msg.event.info);
    if (script) {
      // 新脚本，自动获取源码
      cdp.getScriptSource(tabId, script.scriptId)
        .then(source => {
          collector.setScriptSource(script.scriptId, source);
          script.source = source;
          // 通知 panel
          if (port) {
            port.postMessage({
              type: 'debugger-event',
              event: { kind: 'script-discovered', script },
            } satisfies DebuggerPanelMessage);
          }
        })
        .catch(err => {
          console.warn(`[OB-Recover] 获取脚本 ${script.scriptId} 源码失败:`, err.message);
          collector.setScriptSource(script.scriptId, '');
        });
    }
  }

  if (port) {
    try {
      port.postMessage(msg);
    } catch {
      // port 已失效（SW 重启期间）
      panelPorts.delete(tabId);
    }
  }
});

// ── Panel Port 连接 ──
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('ob-recover-panel-')) return;

  const tabId = parseInt(port.name.replace('ob-recover-panel-', ''), 10);
  if (isNaN(tabId)) return;

  panelPorts.set(tabId, port);

  // Panel 断开时清理
  port.onDisconnect.addListener(() => {
    panelPorts.delete(tabId);
    // 不自动 detach：用户可能只是刷新 DevTools 面板
  });

  // 处理来自 panel 的命令
  port.onMessage.addListener(async (msg: PanelCommand) => {
    await handlePanelCommand(msg, port);
  });

  // 发送当前状态给刚连接的 panel
  const status = cdp.getStatus(tabId);
  port.postMessage({
    type: 'debugger-event',
    event: { kind: 'status-changed', status },
  } satisfies DebuggerPanelMessage);
});

// ── 命令处理 ──
async function handlePanelCommand(
  msg: PanelCommand,
  port: chrome.runtime.Port,
): Promise<void> {
  try {
    switch (msg.type) {
      case 'ping': {
        port.postMessage({ type: 'pong' });
        break;
      }

      case 'debugger-connect': {
        // 插桩断点只在自动捕获引擎激活时需要；手动断点模式下连接不设置任何断点
        await cdp.attach(msg.tabId, { instrumentation: !!captureEngines.get(msg.tabId)?.isActive() });
        break;
      }

      case 'debugger-disconnect': {
        await cdp.detach(msg.tabId);
        break;
      }

      case 'debugger-resume': {
        await cdp.resume(msg.tabId);
        break;
      }

      case 'debugger-get-source': {
        const source = await cdp.getScriptSource(msg.tabId, msg.scriptId);
        const response: PanelCommandResponse = { ok: true, data: { source } };
        port.postMessage({ type: 'get-source-response', ...response });
        break;
      }

      case 'debugger-get-status': {
        const status = cdp.getStatus(msg.tabId);
        port.postMessage({
          type: 'debugger-event',
          event: { kind: 'status-changed', status },
        } satisfies DebuggerPanelMessage);
        break;
      }

      case 'debugger-list-scripts': {
        const collector = getOrCreateCollector(msg.tabId);
        const scripts = collector.getAllScripts();
        const stats = collector.getStats();
        const response: PanelCommandResponse = { ok: true, data: { scripts, stats } };
        port.postMessage({ type: 'list-scripts-response', ...response });
        break;
      }

      case 'capture-start': {
        if (cdp.getStatus(msg.tabId) !== 'connected') {
          throw new Error('调试器未连接，无法开始运行时捕获。请先点击“连接”；若连接失败，请查看日志中 Chrome 返回的具体错误（例如同一标签页已被另一个调试器客户端占用）。');
        }
        captureStrategies.set(msg.tabId, { autoCaptureMinConfidence: msg.autoCaptureMinConfidence ?? 'high' });
        // 用户显式开始自动捕获：切到自动模式，否则引擎自己的断点暂停会被手动分支放过，页面会卡住
        captureModes.set(msg.tabId, 'auto');
        const engine = getOrCreateEngine(msg.tabId);
        const result = await engine.start(msg.targets);
        await cdp.setInstrumentation(msg.tabId, true);
        postCaptureState(msg.tabId, { skipped: result.skipped, errors: result.errors });
        break;
      }

      case 'capture-stop': {
        captureStrategies.delete(msg.tabId);
        const engine = captureEngines.get(msg.tabId);
        if (engine) await engine.stop();
        // 停止自动捕获：回到手动断点模式，并移除插桩断点，不再打扰页面执行
        captureModes.set(msg.tabId, 'manual');
        await cdp.setInstrumentation(msg.tabId, false);
        postCaptureState(msg.tabId);
        break;
      }

      case 'capture-clear': {
        captureEngines.get(msg.tabId)?.clear();
        postCaptureState(msg.tabId);
        break;
      }

      case 'capture-get-state': {
        postCaptureState(msg.tabId);
        break;
      }

      case 'capture-set-mode': {
        const newMode = msg.mode as 'auto' | 'manual';
        captureModes.set(msg.tabId, newMode);
        if (newMode === 'manual') {
          // 切到手动模式：停掉自动引擎并移除插桩断点，否则引擎自己的断点暂停会让页面卡住
          const running = captureEngines.get(msg.tabId);
          if (running && running.isActive()) {
            captureStrategies.delete(msg.tabId);
            await running.stop();
            postCaptureState(msg.tabId);
          }
          await cdp.setInstrumentation(msg.tabId, false);
        }
        postPanel(msg.tabId, {
          type: 'debugger-event',
          event: {
            kind: 'log',
            level: 'info',
            message: `已切换到${newMode === 'auto' ? '自动' : '手动'}捕获模式`,
          },
        });
        // 同时发送模式状态
        postPanel(msg.tabId, {
          type: 'debugger-event',
          event: {
            kind: 'mode-changed',
            mode: newMode,
          } as any,
        });
        break;
      }

      case 'capture-get-mode': {
        const currentMode = captureModes.get(msg.tabId) || 'manual';
        postPanel(msg.tabId, {
          type: 'debugger-event',
          event: {
            kind: 'mode-changed',
            mode: currentMode,
          } as any,
        });
        break;
      }

      case 'manual-capture-get-records': {
        const mc = manualCaptures.get(msg.tabId);
        const records = mc ? mc.getRecords() : [];
        const response: PanelCommandResponse = { ok: true, data: { records } };
        port.postMessage({ type: 'manual-capture-records-response', ...response });
        break;
      }

      case 'manual-capture-clear': {
        manualCaptures.get(msg.tabId)?.clear();
        postPanel(msg.tabId, {
          type: 'debugger-event',
          event: { kind: 'log', level: 'info', message: '已清空手动捕获记录' },
        });
        break;
      }

      case 'manual-capture-get-frames': {
        const mc = manualCaptures.get(msg.tabId);
        const data = mc ? mc.getFrames() : { success: false, error: '当前没有处于暂停状态的调用栈（未收到用户断点暂停）' };
        port.postMessage({ type: 'manual-capture-frames-response', ok: true, data });
        break;
      }

      case 'manual-capture-get-scopes': {
        const mc = manualCaptures.get(msg.tabId);
        const data = mc ? await mc.getScopes(msg.frameIndex) : { success: false, error: '当前没有处于暂停状态的调用栈（未收到用户断点暂停）' };
        port.postMessage({ type: 'manual-capture-scopes-response', ok: true, data });
        break;
      }

      case 'manual-capture-evaluate': {
        const mc = getOrCreateManualCapture(msg.tabId);
        const result = await mc.evaluateOnFrame({ callFrameId: msg.callFrameId, frameIndex: msg.frameIndex }, msg.expression);
        const response: PanelCommandResponse = { ok: true, data: result };
        port.postMessage({ type: 'manual-capture-evaluate-response', ...response });
        break;
      }

      default: {
        console.warn('[OB-Recover background] Unknown command:', (msg as any).type);
      }
    }
  } catch (err: any) {
    console.error('[OB-Recover background] Command error:', err.message);
    try {
      port.postMessage({
        type: 'debugger-event',
        event: { kind: 'log', level: 'error', message: err.message },
      } satisfies DebuggerPanelMessage);
    } catch {
      // port 已断开，忽略
    }
  }
}

// ── 保留原有静态还原消息路由 ──
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ type: 'pong' });
  }
});

// ── 扩展集成测试钩子 ──
// 仅从本扩展的 service worker 上下文可达（外部需先 CDP attach 到 SW 才能看到），
// 不改变任何生产行为：它只是把既有的 handlePanelCommand / 引擎状态暴露出来，
// 供 scripts/extension-integration.ts 驱动真实代码路径（真实 chrome.debugger 调用）。
(globalThis as any).__obRecoverTest = {
  handlePanelCommand,
  registerPort(tabId: number, port: any) { panelPorts.set(tabId, port); },
  unregisterPort(tabId: number) { panelPorts.delete(tabId); },
  getCaptureState(tabId: number) {
    const e = captureEngines.get(tabId);
    if (!e) return null;
    return {
      active: e.isActive(),
      breakpoints: e.getBreakpointCount(),
      breakpointsByScript: e.getBreakpointsByScript(),
      stats: e.getStats(),
      captures: e.getCaptures(),
      stability: e.getStability(),
    };
  },
  getStatus(tabId: number) { return cdp.getStatus(tabId); },
};
