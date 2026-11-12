/**
 * CDP 调试器类型定义
 */

import type { CaptureTarget, CaptureEvent, CaptureStats, DecoderCapture, StabilityRecord } from './capture-engine.js';
import type { ManualCaptureRecord } from './manual-capture.js';

/** 调试器连接状态 */
export type DebuggerConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/** 调用帧 */
export interface CdpCallFrame {
  callFrameId: string;
  functionName: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  url: string;
}

/** 暂停信息（从 Debugger.paused 事件提取） */
export interface DebuggerPausedInfo {
  reason: string;
  callFrames: CdpCallFrame[];
  hitBreakpoints?: string[];
  /** 暂停位置脚本的源码（通过 Debugger.getScriptSource 获取） */
  scriptSource?: string;
}

/** 脚本解析信息 */
export interface ScriptParsedInfo {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  sourceMapURL?: string;
  executionContextId?: number;
  hash?: string;
}

/** Phase 2 — 已发现脚本的完整记录 */
export interface DiscoveredScript {
  scriptId: string;
  url: string;
  executionContextId?: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  sourceMapURL?: string;
  hash: string;
  isDynamic: boolean;
  source: string | null;
  analyzed: boolean;
  analysisError?: string;
  /** 分析结果（来自 decoder-discovery） */
  discoveryResult?: any;
}

/** Background → Panel 消息 */
export interface DebuggerPanelMessage {
  type: 'debugger-event';
  event:
    | { kind: 'status-changed'; status: DebuggerConnectionStatus; error?: string }
    | { kind: 'paused'; info: DebuggerPausedInfo }
    | { kind: 'resumed' }
    | { kind: 'script-parsed'; info: ScriptParsedInfo }
    | { kind: 'context-created'; context: any }
    | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
    | { kind: 'script-source'; scriptId: string; source: string | null; error?: string }
    | { kind: 'script-discovered'; script: DiscoveredScript }
    | { kind: 'capture-event'; event: CaptureEvent }
    | {
        kind: 'capture-state';
        active: boolean;
        breakpoints: number;
        stats: CaptureStats | null;
        captures: DecoderCapture[];
        stability?: StabilityRecord[];
        autoCaptureMinConfidence?: 'high' | 'medium' | 'low';
        skipped?: { functionName: string; scriptId: string; reason: string }[];
        errors?: string[];
        resetReason?: string;
      }
    | { kind: 'mode-changed'; mode: 'auto' | 'manual' }
    | { kind: 'manual-capture'; record: ManualCaptureRecord };
}

/** Panel → Background 命令 */
export type PanelCommand =
  | { type: 'debugger-connect'; tabId: number }
  | { type: 'debugger-disconnect'; tabId: number }
  | { type: 'debugger-resume'; tabId: number }
  | { type: 'debugger-get-source'; tabId: number; scriptId: string }
  | { type: 'debugger-get-status'; tabId: number }
  | { type: 'debugger-list-scripts'; tabId: number }
  | { type: 'capture-start'; tabId: number; targets: CaptureTarget[]; autoCaptureMinConfidence?: 'high' | 'medium' | 'low' }
  | { type: 'capture-stop'; tabId: number }
  | { type: 'capture-clear'; tabId: number }
  | { type: 'capture-get-state'; tabId: number }
  | { type: 'capture-set-mode'; tabId: number; mode: 'auto' | 'manual' }
  | { type: 'capture-get-mode'; tabId: number }
  | { type: 'manual-capture-get-records'; tabId: number }
  | { type: 'manual-capture-clear'; tabId: number }
  | { type: 'manual-capture-get-frames'; tabId: number }
  | { type: 'manual-capture-get-scopes'; tabId: number; frameIndex: number }
  | { type: 'manual-capture-evaluate'; tabId: number; callFrameId?: string; frameIndex?: number; expression: string }
  | { type: 'ping' };

/** Background → Panel 命令响应 */
export interface PanelCommandResponse {
  ok: boolean;
  error?: string;
  data?: any;
}
