import type { CapturePlan, CdpPosition } from '../../core/capture-plan.js';

export type CaptureStatus = 'success' | 'capture-failed';

export interface RuntimeValue {
  type: string;
  subtype?: string;
  value?: unknown;
  unserializable?: string;
  description?: string;
  truncated?: boolean;
}

export interface CaptureTarget {
  scriptId: string;
  scriptUrl: string;
  functionName: string;
  plan: CapturePlan;
}

/** 一次观测发生在捕获链的哪个阶段失败；只在 captureStatus !== 'success' 时有意义 */
export type CaptureFailureStage = 'openPending' | 'advance' | 'failPending' | 'stopNow';

/**
 * Phase 4.7 方案 D：逐条观测的运行时元数据。
 * 去重表按「参数 + 返回值」合并记录，但每条原始观测的栈帧信息必须可追溯，
 * 因此这些字段不进合并键，而是按观测逐条追加到 DecoderCapture.observations 里。
 * 取不到的字段一律缺失（undefined），不填猜测值。
 */
export interface CaptureObservationMeta {
  /** 全局观测序号（每次 record() 递增，与被合并成的记录序号无关） */
  seq: number;
  /** 实际匹配到的 CallFrame 深度：frames.length（栈深），来自该次暂停的真实栈 */
  depth: number;
  /** 实际匹配到的 CallFrame 的函数名，来自 frames[0].functionName */
  frameName: string;
  /** 真实命中的断点 ID；未命中任何本插件断点（例如单步归属）时缺失 */
  hitBreakpointId?: string;
  /** 命中断点的类型，与 hitBreakpointId 同时存在 */
  hitBreakpointKind?: BpKind;
  /** 调用方帧位置（frames[1]），取不到时为 undefined */
  callLocation?: CdpPosition;
  /** 入口观测时刻（来自入口暂停，不是记账时刻） */
  timestamp: number;
  /** 该次观测自身的状态 */
  status: CaptureStatus;
  /** 失败阶段；成功时缺失 */
  failureStage?: CaptureFailureStage;
  // 参数、返回值、失败原因不在这里：它们都在合并键里，同一条记录的所有观测必然相同，逐条再存一份只会让面板消息变大
}

export interface DecoderCapture {
  key: string;
  scriptId: string;
  scriptUrl: string;
  functionName: string;
  functionLocation: CdpPosition;
  callLocation: CdpPosition;
  /**
   * Phase 3.2：这条记录（同参数、同返回值）对应的全部不同调用位置。
   * 去重键不含调用位置，同一结果来自多个调用点时只合并计数；这里补全位置，
   * 让验证层能把记录绑定到 AST CallExpression。callLocation 保持原义（首次出现）。
   */
  callLocations: CdpPosition[];
  /** callLocations 超过上限被截断时为 true：位置列表不完整，不能据此断言「全部调用点」 */
  callLocationsTruncated?: boolean;
  arguments: RuntimeValue[];
  returnValue?: RuntimeValue;
  captureStatus: CaptureStatus;
  reason?: string;
  count: number;
  /**
   * 记录来源：'manual' = 手动断点模式在用户暂停的帧里求值得到（重新执行一次调用，不是原调用当时的返回值，也不是独立观测）；
   * 缺省或 'auto' = 自动捕获引擎在真实调用的入口和 return 处读到。验证层据此不让手动求值叠加观测次数。
   */
  origin?: 'auto' | 'manual';
  /** 全局捕获序号（首次/最近一次出现），用于区分数组旋转阶段与稳定阶段 */
  firstSeq: number;
  lastSeq: number;
  timestamp: number;
  /**
   * Phase 4.7 方案 D：这条合并记录包含的每一次原始观测的元数据（栈帧深度、帧名、命中断点等）。
   * 去重合并只合并「参数 + 返回值」，逐条观测的元数据在这里保留，因此同一组里不同 depth 的观测可以区分。
   * 超过 MAX_OBSERVATIONS 上限时只保留最早的若干条，并设置 observationsTruncated。
   * 字段缺失的旧记录（Phase 4.7 之前）读出来是 undefined，读取方必须容忍。
   */
  observations?: CaptureObservationMeta[];
  /** observations 被上限截断时为 true：不能据此断言「这条记录的全部观测深度」 */
  observationsTruncated?: boolean;
}

export type CaptureTransport = (method: string, params?: Record<string, unknown>) => Promise<any>;

export type CaptureEvent =
  | { kind: 'capture'; capture: DecoderCapture }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'limit-reached'; limit: string }
  | { kind: 'foreign-pause' };

export interface CaptureOptions {
  maxRecords?: number;
  maxHits?: number;
  maxPending?: number;
  maxReturnSteps?: number;
  watchdogMs?: number;
  maxStringLength?: number;
  /** 单个 CDP 命令的最长等待时间：超过后拒绝，避免一个永不返回的命令把串行链永久堵死 */
  commandTimeoutMs?: number;
}

export interface CaptureStats {
  breakpointsSet: number;
  hits: number;
  pauses: number;
  success: number;
  failed: number;
  forcedResumes: number;
  foreignPauses: number;
}

export interface StartResult {
  set: number;
  skipped: { functionName: string; scriptId: string; reason: string }[];
  errors: string[];
}

type BpKind = 'entry' | 'exit' | 'both';

interface BpInfo {
  target: CaptureTarget;
  kind: BpKind;
}

interface Pending {
  target: CaptureTarget;
  frameName: string;
  depth: number;
  args: RuntimeValue[];
  callLocation: CdpPosition;
  awaitRet: boolean;
  steps: number;
  /** 该次观测真实命中的断点（单步归属时可能没有）；原样带到记录里，不猜 */
  hitBreakpointId?: string;
  hitBreakpointKind?: BpKind;
  /** 入口观测的时间戳：成功/失败都带着，保证元数据时间来自观测时刻而不是记账时刻 */
  openedAt: number;
}

const DEFAULTS: Required<CaptureOptions> = {
  maxRecords: 2000,
  maxHits: 20000,
  maxPending: 100,
  maxReturnSteps: 20,
  watchdogMs: 8000,
  maxStringLength: 2000,
  commandTimeoutMs: 5000,
};

const MAX_CALL_LOCATIONS = 50;
/** 单条合并记录最多保留的逐条观测元数据条数（超出只截断元数据，不影响验证与替换语义） */
const MAX_OBSERVATIONS = 200;

/** 把调用位置并入记录：去重，有上限；超限时标记 truncated，让验证层知道列表不完整 */
function addCallLocation(cap: DecoderCapture, pos: CdpPosition): void {
  if (pos.lineNumber < 0) return;
  if (cap.callLocations.some((p) => p.lineNumber === pos.lineNumber && p.columnNumber === pos.columnNumber)) return;
  if (cap.callLocations.length >= MAX_CALL_LOCATIONS) {
    cap.callLocationsTruncated = true;
    return;
  }
  cap.callLocations.push({ lineNumber: pos.lineNumber, columnNumber: pos.columnNumber });
}

/** 把一次观测的元数据并入记录；超过上限只截断元数据并标记，不影响记录本身的计数与位置语义 */
function addObservation(cap: DecoderCapture, meta: CaptureObservationMeta): void {
  if (!cap.observations) cap.observations = [];
  if (cap.observations.length >= MAX_OBSERVATIONS) {
    cap.observationsTruncated = true;
    return;
  }
  cap.observations.push(meta);
}

function freshStats(): CaptureStats {
  return { breakpointsSet: 0, hits: 0, pauses: 0, success: 0, failed: 0, forcedResumes: 0, foreignPauses: 0 };
}

/**
 * 运行时捕获引擎（与 chrome.debugger 解耦，便于单元测试）。
 * 策略（由 scripts/capture-proto.mjs 在真实 Chrome 中验证）：
 *   入口断点读实际参数；return 断点 / 函数右花括号断点读 returnValue；
 *   returnValue 必须出现在与入口帧同名、同深度的帧上才算成功。
 * 绝不重新执行目标函数，不使用 Runtime.evaluate。
 */
export class CaptureEngine {
  private bps = new Map<string, BpInfo>();
  private setKeys = new Set<string>();
  /** 断点位置 -> 断点编号：同一位置只能设一个断点，入口和 return 重合时合并为 both */
  private locs = new Map<string, string>();
  /** 已被我们移除的断点编号：stop() 之后才到达的暂停事件仍可能引用它们 */
  private retired = new Set<string>();
  private seq = 0;
  /** 逐条观测序号：与合并记录的 seq 分开，保证元数据能追溯到第几次真实观测 */
  private obsSeq = 0;
  private pending: Pending[] = [];
  private table = new Map<string, DecoderCapture>();
  private chain: Promise<void> = Promise.resolve();
  private active = false;
  private stepRequested = false;
  private lastOwn = false;
  private limitHit = false;
  private pausedSince: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** stepOver 的回复被放弃等待后，对这次单步可能产生的迟到暂停的认领期限 */
  private stepExpiry: ReturnType<typeof setTimeout> | null = null;
  private stats: CaptureStats = freshStats();
  private opt: Required<CaptureOptions>;

  constructor(
    private send: CaptureTransport,
    private emit: (ev: CaptureEvent) => void,
    options: CaptureOptions = {},
  ) {
    this.opt = { ...DEFAULTS, ...options };
  }

  isActive(): boolean {
    return this.active;
  }

  /** 同步判断：这次暂停是否由我们的断点或我们发起的 stepOver 引起 */
  ownsPause(params: any): boolean {
    if (this.stepRequested) return true;
    return ((params?.hitBreakpoints ?? []) as string[]).some((id) => this.bps.has(id) || this.retired.has(id));
  }

  getStats(): CaptureStats {
    return { ...this.stats };
  }

  getCaptures(): DecoderCapture[] {
    return Array.from(this.table.values());
  }

  getBreakpointCount(): number {
    return this.bps.size;
  }

  /**
   * Phase 4.7：只读观测。按 scriptId 汇总本引擎当前真实持有的断点数（只统计 setBreakpoint 成功后登记在 bps 里的断点）。
   * 不改变断点、捕获、验证、替换语义；返回的是新对象，调用方修改它不会影响引擎。
   */
  getBreakpointsByScript(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const info of this.bps.values()) {
      const id = info.target.scriptId;
      out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  }

  /**
   * 所有发往 CDP 的命令都经过这里：commandTimeoutMs 内没有回复就拒绝，避免一个永不返回的命令把串行链永久堵死。
   * 超时只表示不再等待，不代表命令没有生效；迟到的回复交给 onLate（例如撤销迟到才建立的断点），否则忽略。
   */
  private cmd(method: string, params?: Record<string, unknown>, onLate?: (result: any) => void): Promise<any> {
    const ms = this.opt.commandTimeoutMs;
    return new Promise<any>((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('CDP command timed out: ' + method + ' (' + ms + 'ms)'));
      }, ms);
      let call: Promise<any>;
      try {
        call = Promise.resolve(this.send(method, params));
      } catch (e) {
        clearTimeout(timer);
        reject(e);
        return;
      }
      call.then(
        (result) => {
          clearTimeout(timer);
          if (!timedOut) resolve(result);
          else if (onLate) onLate(result);
        },
        (e) => {
          clearTimeout(timer);
          if (!timedOut) reject(e);
        },
      );
    });
  }

  /** setBreakpoint 超时之后才到达的回复：这个断点我们没有跟踪，但它已经在页面里。登记为已移除（它引起的暂停会被恢复）并尽力删除 */
  private retireLate(late: any): void {
    const id = late && late.breakpointId;
    if (typeof id !== 'string') return;
    this.retired.add(id);
    this.cmd('Debugger.removeBreakpoint', { breakpointId: id }).catch(() => undefined);
  }

  private clearStepExpiry(): void {
    if (this.stepExpiry !== null) {
      clearTimeout(this.stepExpiry);
      this.stepExpiry = null;
    }
  }

  async start(targets: CaptureTarget[]): Promise<StartResult> {
    const result: StartResult = { set: 0, skipped: [], errors: [] };
    this.active = true;
    this.limitHit = false;
    let stalled = false;
    for (const target of targets) {
      if (stalled) break;
      const plan = target.plan;
      if (!plan.supported || !plan.entry) {
        result.skipped.push({ functionName: target.functionName, scriptId: target.scriptId, reason: plan.reason ?? 'unsupported function shape' });
        continue;
      }
      const jobs: { pos: CdpPosition; kind: BpKind }[] = [{ pos: plan.entry, kind: 'entry' }];
      for (const r of plan.returns) jobs.push({ pos: r, kind: 'exit' });
      if (plan.closing) jobs.push({ pos: plan.closing, kind: 'exit' });
      for (const job of jobs) {
        const err = await this.setOne(target, job.pos, job.kind);
        if (err === 'dup') continue;
        if (err) {
          result.errors.push(target.functionName + ' ' + job.kind + ' ' + job.pos.lineNumber + ':' + job.pos.columnNumber + ' - ' + err);
          if (err.includes('timed out')) {
            stalled = true;
            result.errors.push('Debugger.setBreakpoint 无回复，放弃布置剩余断点（调试通道可能已失效）');
            break;
          }
        } else {
          result.set++;
        }
      }
    }
    if (!this.timer) this.timer = setInterval(() => { void this.checkWatchdog(); }, 1000);
    this.emit({ kind: 'log', level: 'info', message: 'runtime capture started: ' + this.bps.size + ' breakpoints, ' + result.skipped.length + ' skipped, ' + result.errors.length + ' errors' });
    return result;
  }

  private async setOne(target: CaptureTarget, pos: CdpPosition, kind: BpKind): Promise<string | 'dup' | null> {
    const entry = target.plan.entry as CdpPosition;
    const key = [target.scriptId, entry.lineNumber, entry.columnNumber, pos.lineNumber, pos.columnNumber, kind].join(':');
    if (this.setKeys.has(key)) return 'dup';
    const lk = target.scriptId + ':' + pos.lineNumber + ':' + pos.columnNumber;
    const existingId = this.locs.get(lk);
    if (existingId) {
      const info = this.bps.get(existingId);
      if (info && info.kind !== kind && info.kind !== 'both') info.kind = 'both';
      this.setKeys.add(key);
      return 'dup';
    }
    try {
      const r = await this.cmd('Debugger.setBreakpoint', { location: { scriptId: target.scriptId, lineNumber: pos.lineNumber, columnNumber: pos.columnNumber } }, (late) => this.retireLate(late));
      this.setKeys.add(key);
      this.bps.set(r.breakpointId, { target, kind });
      this.locs.set(lk, r.breakpointId);
      this.stats.breakpointsSet++;
      return null;
    } catch (e: any) {
      return e && e.message ? e.message : String(e);
    }
  }

  onPaused(params: any): Promise<void> {
    // 单步归属在事件到达时同步确定并消费，不留到串行链里再读：串行链可能忙到认领期限（stepExpiry）过后才轮到这次暂停，那时 stepRequested 已被清掉，
    // 本来归我们的单步暂停会被当成外来暂停，不恢复页面，页面停在暂停上。ownsPause 与 onPaused 由钩子在同一个同步段里依次调用，两者看到的是同一个状态
    const wasStepping = this.stepRequested;
    if (wasStepping) {
      this.stepRequested = false;
      this.clearStepExpiry();
    }
    this.chain = this.chain.then(() => this.handle(params, wasStepping)).catch(async (e: any) => {
      const msg = e && e.message ? e.message : String(e);
      this.emit({ kind: 'log', level: msg.includes('while paused') ? 'warn' : 'error', message: 'capture handler error: ' + msg });
      this.failPending(() => true, 'capture handler error: ' + msg);
      if (this.lastOwn) await this.safeResume();
    });
    return this.chain;
  }

  onResumed(): void {
    this.pausedSince = null;
  }

  private async handle(p: any, wasStepping: boolean): Promise<void> {
    this.lastOwn = false;
    const frames: any[] = p.callFrames ?? [];
    const top = frames[0];
    const hits = ((p.hitBreakpoints ?? []) as string[]).map((id) => this.bps.get(id)).filter((x): x is BpInfo => !!x);
    const retiredHit = ((p.hitBreakpoints ?? []) as string[]).some((id) => this.retired.has(id));

    if (!this.active) {
      if (hits.length > 0 || wasStepping || retiredHit) {
        this.lastOwn = true;
        await this.safeResume();
      } else {
        this.stats.foreignPauses++;
        this.emit({ kind: 'foreign-pause' });
      }
      return;
    }
    if (!top || (hits.length === 0 && !wasStepping)) {
      this.stats.foreignPauses++;
      this.emit({ kind: 'foreign-pause' });
      return;
    }

    this.lastOwn = true;
    this.pausedSince = Date.now();
    this.stats.pauses++;
    const depth = frames.length;
    const entryHit = hits.find((h) => h.kind === 'entry' || h.kind === 'both');
    const exitHit = hits.find((h) => h.kind === 'exit' || h.kind === 'both');

    const entryHitId = ((p.hitBreakpoints ?? []) as string[]).find((id) => {
      const info = this.bps.get(id);
      return !!info && info === entryHit;
    });
    if (entryHit) {
      this.stats.hits++;
      this.failPending((x) => x.depth >= depth, 'function exited without a return pause (exception or abnormal exit)');
      await this.openPending(entryHit.target, frames, depth, entryHitId !== undefined ? { ...entryHit, id: entryHitId } : undefined);
      if (this.stats.hits >= this.opt.maxHits && !this.limitHit) {
        this.limitHit = true;
        this.emit({ kind: 'limit-reached', limit: 'maxHits=' + this.opt.maxHits });
      }
    }

    const needStep = this.advance(top, depth, !!exitHit);
    if (needStep && this.active && !this.limitHit) {
      this.stepRequested = true;
      try {
        await this.cmd('Debugger.stepOver');
      } catch (e) {
        // 放弃等待回复，但这次单步仍可能让页面再停一次：watchdogMs 内继续认领并恢复它，过期后不再认领，避免吞掉用户自己的暂停
        this.clearStepExpiry();
        this.stepExpiry = setTimeout(() => {
          this.stepRequested = false;
          this.stepExpiry = null;
        }, this.opt.watchdogMs);
        throw e;
      }
      this.pausedSince = null;
    } else {
      await this.cmd('Debugger.resume');
      this.pausedSince = null;
    }
    if (this.limitHit && this.active) await this.stopNow();
  }

  private async openPending(target: CaptureTarget, frames: any[], depth: number, hit?: BpInfo & { id: string }): Promise<void> {
    const top = frames[0];
    const caller = frames[1];
    const callLocation: CdpPosition = caller && caller.location
      ? { lineNumber: caller.location.lineNumber, columnNumber: caller.location.columnNumber }
      : { lineNumber: -1, columnNumber: -1 };
    const openedAt = Date.now();
    const meta = {
      hitBreakpointId: hit ? hit.id : undefined,
      hitBreakpointKind: hit ? hit.kind : undefined,
      openedAt,
    };
    const hasLocal = (top.scopeChain ?? []).some((s: any) => s.type === 'local');
    if (!top.functionName || !hasLocal) {
      this.record({ target, frameName: top.functionName || '', depth, args: [], callLocation, awaitRet: false, steps: 0, ...meta }, 'capture-failed', undefined, 'entry breakpoint did not land inside the function body (top frame is not the target function)', 'openPending');
      return;
    }
    let args: RuntimeValue[];
    try {
      args = await this.readArgs(top, target.plan.paramNames);
    } catch (e: any) {
      this.record({ target, frameName: top.functionName || '', depth, args: [], callLocation, awaitRet: false, steps: 0, ...meta }, 'capture-failed', undefined, 'could not read arguments: ' + (e && e.message ? e.message : String(e)), 'openPending');
      return;
    }
    this.pending.push({ target, frameName: top.functionName || '', depth, args, callLocation, awaitRet: false, steps: 0, ...meta });
    if (this.pending.length > this.opt.maxPending) {
      const dropped = this.pending.shift() as Pending;
      this.record(dropped, 'capture-failed', undefined, 'pending queue overflow (maxPending=' + this.opt.maxPending + ')', 'openPending');
    }
  }

  private async readArgs(frame: any, names: string[]): Promise<RuntimeValue[]> {
    const scope = (frame.scopeChain ?? []).find((s: any) => s.type === 'local');
    if (!scope || !scope.object || !scope.object.objectId) throw new Error('no local scope');
    const res = await this.cmd('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
    const map = new Map<string, any>();
    for (const prop of res.result ?? []) map.set(prop.name, prop.value);
    return names.map((n) => (map.has(n) ? this.toValue(map.get(n)) : { type: 'missing' }));
  }

  /** 只序列化原始值；对象/数组只保留类型和 description，不展开、不读 getter */
  private toValue(r: any): RuntimeValue {
    if (!r || r.type === 'undefined') return { type: 'undefined' };
    if (r.subtype === 'null') return { type: 'null', value: null };
    if (r.type === 'string') {
      const s = String(r.value ?? '');
      if (s.length > this.opt.maxStringLength) return { type: 'string', value: s.slice(0, this.opt.maxStringLength), truncated: true };
      return { type: 'string', value: s };
    }
    if ('value' in r) return { type: r.type, value: r.value };
    if (r.unserializableValue) return { type: r.type, unserializable: r.unserializableValue };
    const d = r.description ? String(r.description) : undefined;
    return { type: r.type, subtype: r.subtype, description: d && d.length > 200 ? d.slice(0, 200) : d };
  }

  private advance(top: any, depth: number, exitHit: boolean): boolean {
    this.failPending((x) => x.depth > depth, 'left the function without a returnValue pause (function may have thrown)', 'advance');
    const name = top.functionName || '';
    let idx = -1;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].depth === depth && this.pending[i].frameName === name) { idx = i; break; }
    }
    if (idx < 0) return false;
    const pd = this.pending[idx];
    if ('returnValue' in top) {
      this.pending.splice(idx, 1);
      this.record(pd, 'success', this.toValue(top.returnValue));
      return false;
    }
    if (exitHit && !pd.awaitRet) {
      pd.awaitRet = true;
      return true;
    }
    if (pd.awaitRet) {
      pd.steps++;
      if (pd.steps >= this.opt.maxReturnSteps) {
        this.pending.splice(idx, 1);
        this.record(pd, 'capture-failed', undefined, 'no returnValue after ' + this.opt.maxReturnSteps + ' steps from the return statement', 'advance');
        return false;
      }
      return true;
    }
    return false;
  }

  private failPending(pred: (p: Pending) => boolean, reason: string, stage: CaptureFailureStage = 'failPending'): void {
    const keep: Pending[] = [];
    for (const p of this.pending) {
      if (pred(p)) this.record(p, 'capture-failed', undefined, reason, stage);
      else keep.push(p);
    }
    this.pending = keep;
  }

  private record(pd: Pending, status: CaptureStatus, rv?: RuntimeValue, reason?: string, failureStage?: CaptureFailureStage): void {
    const t = pd.target;
    const loc = t.plan.entry as CdpPosition;
    if (status === 'success') this.stats.success++; else this.stats.failed++;
    const key = [t.scriptId, loc.lineNumber, loc.columnNumber, JSON.stringify(pd.args), status, status === 'success' ? JSON.stringify(rv) : reason].join('|');
    // 观测序号独立于记录序号：每次 record 调用都是一次真实观测，合并记录不会吞掉它
    const obsSeq = ++this.obsSeq;
    const seq = ++this.seq;
    const meta: CaptureObservationMeta = {
      seq: obsSeq,
      depth: pd.depth,
      frameName: pd.frameName,
      timestamp: pd.openedAt,
      status,
    };
    if (pd.hitBreakpointId !== undefined) {
      meta.hitBreakpointId = pd.hitBreakpointId;
      meta.hitBreakpointKind = pd.hitBreakpointKind;
    }
    if (pd.callLocation.lineNumber >= 0) meta.callLocation = { lineNumber: pd.callLocation.lineNumber, columnNumber: pd.callLocation.columnNumber };
    if (status !== 'success' && failureStage !== undefined) meta.failureStage = failureStage;

    const existing = this.table.get(key);
    if (existing) {
      existing.count++;
      addCallLocation(existing, pd.callLocation);
      addObservation(existing, meta);
      existing.lastSeq = seq;
      existing.timestamp = Date.now();
      this.emit({ kind: 'capture', capture: existing });
      return;
    }
    if (this.table.size >= this.opt.maxRecords) {
      if (!this.limitHit) {
        this.limitHit = true;
        this.emit({ kind: 'limit-reached', limit: 'maxRecords=' + this.opt.maxRecords });
      }
      return;
    }
    const cap: DecoderCapture = {
      key,
      scriptId: t.scriptId,
      scriptUrl: t.scriptUrl,
      functionName: t.functionName,
      functionLocation: loc,
      callLocation: pd.callLocation,
      callLocations: pd.callLocation.lineNumber >= 0 ? [{ lineNumber: pd.callLocation.lineNumber, columnNumber: pd.callLocation.columnNumber }] : [],
      arguments: pd.args,
      returnValue: rv,
      captureStatus: status,
      reason,
      count: 1,
      firstSeq: seq,
      lastSeq: seq,
      timestamp: Date.now(),
      observations: [meta],
    };
    this.table.set(key, cap);
    this.emit({ kind: 'capture', capture: cap });
  }

  private async safeResume(): Promise<void> {
    this.pausedSince = null;
    try {
      await this.cmd('Debugger.resume');
    } catch (e: any) {
      const msg = e && e.message ? e.message : String(e);
      const benign = msg.includes('while paused');
      this.emit({ kind: 'log', level: benign ? 'info' : 'error', message: benign ? 'resume skipped: the page was no longer paused (navigation or already resumed)' : 'resume failed: ' + msg });
    }
  }

  /** 看门狗：我们自己的暂停超过 watchdogMs 仍未恢复则强制 resume；绝不动用户自己的暂停 */
  async checkWatchdog(now: number = Date.now()): Promise<void> {
    if (this.pausedSince === null || !this.lastOwn) return;
    if (now - this.pausedSince <= this.opt.watchdogMs) return;
    this.stats.forcedResumes++;
    this.emit({ kind: 'log', level: 'warn', message: 'watchdog: forcing resume after ' + this.opt.watchdogMs + 'ms' });
    this.failPending(() => true, 'watchdog forced resume');
    await this.safeResume();
  }

  /** 停止捕获：只移除自己创建的断点，恢复自己造成的暂停 */
  stop(): Promise<void> {
    this.active = false;
    this.chain = this.chain.then(() => this.stopNow());
    return this.chain;
  }

  private async stopNow(): Promise<void> {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.failPending(() => true, 'capture stopped before the function returned', 'stopNow');
    let stalled = false;
    for (const id of Array.from(this.bps.keys())) {
      this.retired.add(id);
      if (stalled) continue;
      try {
        await this.cmd('Debugger.removeBreakpoint', { breakpointId: id });
      } catch (e: any) {
        const msg = e && e.message ? e.message : String(e);
        this.emit({ kind: 'log', level: 'warn', message: 'removeBreakpoint failed: ' + msg });
        if (msg.includes('timed out')) {
          stalled = true;
          this.emit({ kind: 'log', level: 'warn', message: 'removeBreakpoint timed out: 调试通道无回复，剩余断点不再逐个移除，已登记为已移除，它们引起的暂停会被自动恢复' });
        }
      }
    }
    this.bps.clear();
    this.setKeys.clear();
    this.locs.clear();
    if (this.pausedSince !== null && this.lastOwn) await this.safeResume();
  }

  /** 页面刷新 / 调试器断开：断点已随目标失效，不再发送命令，只清理本地状态 */
  reset(reason: string): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearStepExpiry();
    this.failPending(() => true, reason);
    this.bps.clear();
    this.setKeys.clear();
    this.locs.clear();
    this.retired.clear();
    this.stepRequested = false;
    this.pausedSince = null;
    this.limitHit = false;
  }

  /**
   * 页面导航但用户仍在捕获：旧文档的断点已失效，清掉本地断点与待处理项，
   * 但保留 active（用户意图）与已捕获记录，让新文档的插桩暂停仍能布置断点。
   */
  softReset(reason: string): void {
    this.clearStepExpiry();
    this.failPending(() => true, reason);
    this.bps.clear();
    this.setKeys.clear();
    this.locs.clear();
    this.retired.clear();
    this.stepRequested = false;
    this.pausedSince = null;
    this.limitHit = false;
  }

  clear(): void {
    this.table.clear();
    this.obsSeq = 0;
    const bp = this.stats.breakpointsSet;
    this.stats = freshStats();
    this.stats.breakpointsSet = bp;
    this.limitHit = false;
  }

  /**
   * 稳定性分析：同一函数 + 同一参数组合，是否出现过多个不同返回值。
   * 不做任何覆盖：去重表按「参数 + 返回值」分别保存，这里只是分组统计。
   * 只用序号（执行顺序）与脚本/函数位置判断，不依赖时间戳。
   */
  getStability(): StabilityRecord[] {
    const groups = new Map<string, DecoderCapture[]>();
    for (const cap of this.table.values()) {
      if (cap.captureStatus !== 'success') continue;
      const gk = [cap.scriptId, cap.functionLocation.lineNumber, cap.functionLocation.columnNumber, cap.functionName, JSON.stringify(cap.arguments)].join('|');
      const arr = groups.get(gk);
      if (arr) arr.push(cap); else groups.set(gk, [cap]);
    }
    const out: StabilityRecord[] = [];
    for (const arr of groups.values()) {
      const ordered: RuntimeValue[] = [];
      const seen = new Set<string>();
      for (const c of arr.sort((a, b) => a.firstSeq - b.firstSeq)) {
        const k = JSON.stringify(c.returnValue);
        if (!seen.has(k)) { seen.add(k); ordered.push(c.returnValue as RuntimeValue); }
      }
      const callCount = arr.reduce((s, c) => s + c.count, 0);
      const seqs = arr.flatMap((c) => [c.firstSeq, c.lastSeq]);
      out.push({
        scriptId: arr[0].scriptId,
        scriptUrl: arr[0].scriptUrl,
        functionName: arr[0].functionName,
        functionLocation: arr[0].functionLocation,
        arguments: arr[0].arguments,
        values: ordered,
        distinctReturnCount: ordered.length,
        callCount,
        stable: ordered.length === 1,
        firstSeq: Math.min(...seqs),
        lastSeq: Math.max(...seqs),
      });
    }
    return out.sort((a, b) => a.firstSeq - b.firstSeq);
  }
}

export interface StabilityRecord {
  scriptId: string;
  scriptUrl: string;
  functionName: string;
  functionLocation: CdpPosition;
  arguments: RuntimeValue[];
  /** 出现过的所有不同返回值（按首次出现顺序） */
  values: RuntimeValue[];
  distinctReturnCount: number;
  callCount: number;
  /** true = 同一参数始终返回同一值；false = 出现过多个不同返回值（unstable） */
  stable: boolean;
  firstSeq: number;
  lastSeq: number;
}
