/**
 * 手动断点捕获器
 *
 * 用户在 Sources 面板手动设置断点并触发暂停后，被动读取当前暂停上下文：
 * 调用栈（callFrames）、指定帧的 Local / Closure 作用域，以及在指定帧中求值表达式。
 *
 * 设计原则：
 * 1. 不自动设置任何断点
 * 2. 不自动 resume / step 用户的调试会话
 * 3. 只读取当前暂停状态；求值只通过 Debugger.evaluateOnCallFrame 在用户暂停的帧里进行，不重新执行目标代码
 * 4. 执行恢复或页面重置后立即丢弃保存的调用栈，绝不使用失效的 callFrameId
 */

import type { CaptureTransport } from './capture-engine.js';
import type { RuntimeValue } from './capture-engine.js';

const NOT_PAUSED = '当前没有处于暂停状态的调用栈（未收到用户断点暂停，或执行已恢复）';
const MAX_SCOPE_VARIABLES = 1000;

export interface ManualCaptureRecord {
  /** 捕获时间戳 */
  timestamp: number;
  /** 脚本 ID */
  scriptId: string;
  /** 脚本 URL（Chrome 的 callFrame.url 可能为空，此时由 scriptId 反查） */
  scriptUrl: string;
  /** 暂停位置 */
  location: {
    lineNumber: number;
    columnNumber: number;
  };
  /** 调用栈顶部的函数名 */
  functionName: string;
  /** 在当前 frame 中求值的表达式 */
  expression: string;
  /** 求值结果 */
  result?: RuntimeValue;
  /** 求值失败原因 */
  error?: string;
  /** 调用栈深度 */
  stackDepth: number;
  /** 局部变量快照（可选） */
  localVariables?: Record<string, RuntimeValue>;
}

export interface ManualCaptureOptions {
  /** 是否启用 */
  enabled: boolean;
  /** 是否自动分析当前位置附近的 OB 调用 */
  autoDetectCalls: boolean;
  /** 是否捕获局部变量 */
  captureLocals: boolean;
}

export interface ManualFrameInfo {
  index: number;
  callFrameId: string;
  functionName: string;
  scriptId: string;
  scriptUrl: string;
  location: { lineNumber: number; columnNumber: number };
  scopeTypes: string[];
}

export interface ManualScopeInfo {
  type: string;
  name?: string;
  variables: Record<string, RuntimeValue>;
  truncated?: boolean;
  skipped?: string;
}

export interface ManualFramesResult {
  success: boolean;
  frames?: ManualFrameInfo[];
  error?: string;
}

export interface ManualScopesResult {
  success: boolean;
  frameIndex?: number;
  functionName?: string;
  scopes?: ManualScopeInfo[];
  error?: string;
}

/**
 * 手动断点捕获器
 *
 * 不同于 CaptureEngine 的自动断点机制，这个类不设置任何断点，
 * 只在用户手动触发断点时被动响应，读取当前暂停状态，不干扰用户的调试流程。
 */
export class ManualCapture {
  private records: ManualCaptureRecord[] = [];
  private options: ManualCaptureOptions;
  /** 当前暂停的完整 callFrames；恢复执行或页面重置后为 null */
  private pausedFrames: any[] | null = null;

  constructor(
    private send: CaptureTransport,
    options: Partial<ManualCaptureOptions> = {},
    private resolveScriptUrl: (scriptId: string) => string = () => '',
  ) {
    this.options = {
      enabled: true,
      autoDetectCalls: true,
      captureLocals: false,
      ...options,
    };
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
  }

  getOptions(): ManualCaptureOptions {
    return { ...this.options };
  }

  setOptions(options: Partial<ManualCaptureOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getRecords(): ManualCaptureRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
  }

  /** 当前是否持有一个有效的暂停调用栈 */
  isPaused(): boolean {
    return this.pausedFrames !== null;
  }

  /** Debugger.resumed：保存的调用栈失效 */
  onResumed(): void {
    this.pausedFrames = null;
  }

  /** 页面刷新 / 调试器断开：保存的调用栈失效 */
  onReset(): void {
    this.pausedFrames = null;
  }

  /**
   * 处理用户手动断点触发的暂停事件（不会 resume，不会 step）
   *
   * @param params Debugger.paused 事件参数
   */
  async onManualPause(params: any): Promise<{ handled: boolean; record?: ManualCaptureRecord }> {
    if (!this.options.enabled) {
      return { handled: false };
    }

    const callFrames = params.callFrames || [];
    if (callFrames.length === 0) {
      this.pausedFrames = null;
      return { handled: false };
    }

    // 保存完整调用栈，供 getFrames / getScopes / evaluateOnFrame 使用（恢复执行时清空）
    this.pausedFrames = callFrames;

    const topFrame = callFrames[0];
    const location = topFrame.location;
    const functionName = topFrame.functionName || '(anonymous)';
    const scriptId = location?.scriptId || '';
    const scriptUrl = this.urlOf(scriptId, topFrame.url);

    // 基础记录（先创建，即使后续读取失败也要保留）
    const record: ManualCaptureRecord = {
      timestamp: Date.now(),
      scriptId,
      scriptUrl,
      location: {
        lineNumber: location?.lineNumber ?? 0,
        columnNumber: location?.columnNumber ?? 0,
      },
      functionName,
      expression: '',
      stackDepth: callFrames.length,
    };

    // 可选：捕获局部变量
    if (this.options.captureLocals) {
      try {
        record.localVariables = await this.readLocals(topFrame);
      } catch (e: any) {
        // 忽略失败，不影响主流程
      }
    }

    // 可选：自动检测 OB 调用并求值
    if (this.options.autoDetectCalls) {
      // TODO: 实现简单的表达式检测逻辑（目前不实现，等后续需求明确）
    }

    this.records.push(record);

    return { handled: true, record };
  }

  /** 当前暂停的调用栈（按 frameIndex 编号，0 = 栈顶） */
  getFrames(): ManualFramesResult {
    if (!this.pausedFrames) return { success: false, error: NOT_PAUSED };
    return {
      success: true,
      frames: this.pausedFrames.map((cf, index) => this.frameInfo(cf, index)),
    };
  }

  /** 读取指定帧的作用域链（Local / Closure / Block 等逐层展开，global 不展开） */
  async getScopes(frameIndex: number): Promise<ManualScopesResult> {
    const p = this.pick(frameIndex);
    if (!p.frame) return { success: false, error: p.error };
    const frame = p.frame;
    const scopes: ManualScopeInfo[] = [];
    for (const s of frame.scopeChain ?? []) {
      const info: ManualScopeInfo = { type: s.type, variables: {} };
      if (s.name) info.name = s.name;
      if (s.type === 'global') {
        info.skipped = 'global 作用域不展开';
      } else if (s.object && s.object.objectId) {
        try {
          const r = await this.readObject(s.object.objectId);
          info.variables = r.variables;
          if (r.truncated) info.truncated = true;
        } catch (e: any) {
          info.skipped = '读取失败: ' + (e && e.message ? e.message : String(e));
        }
      }
      scopes.push(info);
    }
    return { success: true, frameIndex, functionName: frame.functionName || '(anonymous)', scopes };
  }

  /**
   * 在指定帧中求值表达式。
   * frameIndex 优先（按当前暂停调用栈解析出 callFrameId）；只给 callFrameId 时直接使用。
   * 同时给出且互相矛盾时拒绝。
   */
  async evaluateOnFrame(
    target: { callFrameId?: string; frameIndex?: number },
    expression: string,
  ): Promise<{ success: boolean; result?: RuntimeValue; error?: string; sideEffectBlocked?: boolean }> {
    if (typeof expression !== 'string' || expression.trim() === '') {
      return { success: false, error: '表达式不能为空' };
    }
    let callFrameId = target.callFrameId;
    if (target.frameIndex !== undefined && target.frameIndex !== null) {
      const p = this.pick(target.frameIndex);
      if (!p.frame) return { success: false, error: p.error };
      if (callFrameId && callFrameId !== p.frame.callFrameId) {
        return { success: false, error: 'callFrameId 与 frameIndex 指向的帧不一致' };
      }
      callFrameId = p.frame.callFrameId;
    }
    if (!callFrameId) {
      return { success: false, error: '必须提供 callFrameId 或 frameIndex' };
    }
    return this.evaluateOnCallFrame(callFrameId, expression);
  }

  /**
   * 在指定 callFrameId 中求值表达式（不 resume，不 step）
   */
  async evaluateOnCallFrame(
    callFrameId: string,
    expression: string,
  ): Promise<{ success: boolean; result?: RuntimeValue; error?: string; sideEffectBlocked?: boolean }> {
    try {
      // throwOnSideEffect 固定为 true，没有任何降级为 false 的路径：V8 拒绝就是拒绝，调用方把它当作无法安全求值（insufficient），不得绕过
      const res = await this.send('Debugger.evaluateOnCallFrame', {
        callFrameId,
        expression,
        silent: true,
        throwOnSideEffect: true,
      });

      if (res.exceptionDetails) {
        const description: string = String(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'evaluation threw');
        // V8 的拒绝信息是 EvalError: Possible side-effect in debug-evaluate；以 V8 实际返回为准，不靠静态猜测
        if (description.includes('Possible side-effect in debug-evaluate')) {
          return { success: false, sideEffectBlocked: true, error: 'V8 的 throwOnSideEffect 拒绝了这次求值（可能有副作用）：' + description };
        }
        return { success: false, error: description };
      }

      return {
        success: true,
        result: this.toValue(res.result),
      };
    } catch (e: any) {
      return {
        success: false,
        error: e && e.message ? e.message : String(e),
      };
    }
  }

  private pick(frameIndex: unknown): { frame?: any; error?: string } {
    if (!this.pausedFrames) return { error: NOT_PAUSED };
    if (typeof frameIndex !== 'number' || !Number.isInteger(frameIndex)) {
      return { error: 'frameIndex 必须是整数' };
    }
    if (frameIndex < 0 || frameIndex >= this.pausedFrames.length) {
      return { error: `frameIndex 越界：${frameIndex}（当前共 ${this.pausedFrames.length} 帧）` };
    }
    return { frame: this.pausedFrames[frameIndex] };
  }

  private frameInfo(cf: any, index: number): ManualFrameInfo {
    const scriptId = cf.location?.scriptId || '';
    return {
      index,
      callFrameId: cf.callFrameId,
      functionName: cf.functionName || '(anonymous)',
      scriptId,
      scriptUrl: this.urlOf(scriptId, cf.url),
      location: {
        lineNumber: cf.location?.lineNumber ?? 0,
        columnNumber: cf.location?.columnNumber ?? 0,
      },
      scopeTypes: (cf.scopeChain ?? []).map((s: any) => s.type),
    };
  }

  /** Chrome 的 callFrame.url 可能为空，此时用 scriptId 向脚本收集器反查 */
  private urlOf(scriptId: string, fromFrame?: string): string {
    if (fromFrame) return fromFrame;
    if (!scriptId) return '';
    try {
      return this.resolveScriptUrl(scriptId) || '';
    } catch {
      return '';
    }
  }

  /** 读取指定 frame 的局部变量 */
  private async readLocals(frame: any): Promise<Record<string, RuntimeValue>> {
    const scope = (frame.scopeChain ?? []).find((s: any) => s.type === 'local');
    if (!scope || !scope.object || !scope.object.objectId) {
      return {};
    }
    return (await this.readObject(scope.object.objectId)).variables;
  }

  private async readObject(objectId: string): Promise<{ variables: Record<string, RuntimeValue>; truncated: boolean }> {
    const res = await this.send('Runtime.getProperties', {
      objectId,
      ownProperties: true,
    });
    const variables: Record<string, RuntimeValue> = {};
    let n = 0;
    let truncated = false;
    for (const prop of res.result ?? []) {
      if (!prop.name || !prop.value) continue;
      if (n >= MAX_SCOPE_VARIABLES) {
        truncated = true;
        break;
      }
      variables[prop.name] = this.toValue(prop.value);
      n++;
    }
    return { variables, truncated };
  }

  /** 将 CDP RemoteObject 转换为内部格式（与 CaptureEngine 一致） */
  private toValue(r: any): RuntimeValue {
    if (!r || r.type === 'undefined') return { type: 'undefined' };
    if (r.subtype === 'null') return { type: 'null', value: null };
    if (r.type === 'string') {
      const s = String(r.value ?? '');
      const MAX_LEN = 2000;
      if (s.length > MAX_LEN) {
        return { type: 'string', value: s.slice(0, MAX_LEN), truncated: true };
      }
      return { type: 'string', value: s };
    }
    if ('value' in r) return { type: r.type, value: r.value };
    if (r.unserializableValue) return { type: r.type, unserializable: r.unserializableValue };
    const d = r.description ? String(r.description) : undefined;
    return {
      type: r.type,
      subtype: r.subtype,
      description: d && d.length > 200 ? d.slice(0, 200) : d,
    };
  }
}
