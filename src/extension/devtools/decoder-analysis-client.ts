/**
 * Phase 4.7 面板性能修复 — Decoder Discovery 面板侧客户端
 *
 * 把 discoverDecoders 从面板主线程挪到 Worker，并保证：
 *  - 串行队列、固定并发上限（1），不产生无界积压；
 *  - 同一 scriptId 结果复用，重复的 script-discovered 事件不会重复分析；
 *  - 失败、超时、取消、Worker 崩溃都**显式失败**，绝不把未分析的脚本标成已分析；
 *  - 取消/关闭时 terminate 并拒绝全部在飞行与排队任务。
 *
 * 本文件不含任何分析逻辑：分析永远发生在 Worker 里，且调用的是同一个 discoverDecoders。
 */
import type { DiscoveryResult } from '../../core/decoder-discovery.js';

export interface AnalysisJob {
  scriptId: string;
  source: string;
  scriptUrl?: string;
}

export type AnalysisOutcome =
  | { kind: 'result'; result: DiscoveryResult }
  | { kind: 'error'; error: string };

export interface AnalysisClientHooks {
  /** Worker 搭建失败或崩溃时调用（例如 DevTools 面板所在环境不允许 Worker） */
  onWorkerUnavailable?: (reason: string) => void;
  /**
   * 测试注入点：替换真实的 Worker 构造。
   * 生产环境不传，走 new Worker(new URL(...))。注入的实现只用于验证队列/去重/失败语义，
   * 不参与任何分析逻辑。
   */
  createWorker?: () => Worker;
  /** 测试注入点：超时阈值（毫秒）。生产不传，用 TIMEOUT_MS。 */
  timeoutMs?: number;
}

/** 队列上限：超出后新任务显式失败，不静默丢弃、不伪装成功 */
const MAX_QUEUE = 64;
/**
 * 超时是「挂死检测」而不是性能上限。
 * 实测 512 KB 脚本同步分析需约 145 s，因此阈值取得远高于它：只在 Worker 真的不再回应时触发。
 */
const TIMEOUT_MS = 10 * 60 * 1000;

// 面板主线程里没有 self（那是 Worker 的全局）；这里用两处都能用的取法。
const g: any = globalThis;

interface Pending {
  id: number;
  job: AnalysisJob;
  resolve: (o: AnalysisOutcome) => void;
  timer: number;
}

export class DecoderAnalysisClient {
  private worker: Worker | null = null;
  private hooks: AnalysisClientHooks;
  private nextId = 1;
  private queue: Pending[] = [];
  private inflight: Pending | null = null;
  /** scriptId → 已完成结果（含分析失败），用于去重 */
  private cache = new Map<string, AnalysisOutcome>();
  /** scriptId → 正在排队或正在执行 */
  private active = new Set<string>();
  private disposed = false;
  private workerBroken = false;

  constructor(hooks: AnalysisClientHooks = {}) {
    this.hooks = hooks;
    this.timeoutMs = hooks.timeoutMs ?? TIMEOUT_MS;
  }

  /** 挂死检测阈值；生产固定为 TIMEOUT_MS，测试可注入更短的值 */
  private timeoutMs: number;

  /**
   * 分析一个脚本。同一 scriptId 重复调用复用同一结果（force=true 时重新分析）。
   * 永远不 reject：结果与错误都通过 resolve 返回，调用方按显式分支处理。
   */
  analyze(job: AnalysisJob, opts: { force?: boolean } = {}): Promise<AnalysisOutcome> {
    if (this.disposed) return Promise.resolve({ kind: 'error', error: '分析客户端已关闭' });

    // 去重一：已有缓存结果
    if (!opts.force) {
      const hit = this.cache.get(job.scriptId);
      if (hit) return Promise.resolve(hit);
      // 去重二：同一 scriptId 已在排队或执行中，挂到同一结果上
      if (this.active.has(job.scriptId)) return this.attachToActive(job.scriptId);
    }

    if (this.workerBroken) {
      return Promise.resolve({ kind: 'error', error: '分析 Worker 不可用' });
    }
    if (this.queue.length + (this.inflight ? 1 : 0) >= MAX_QUEUE) {
      return Promise.resolve({ kind: 'error', error: `分析队列已满（上限 ${MAX_QUEUE}），该脚本未分析` });
    }

    return new Promise<AnalysisOutcome>((resolve) => {
      const p: Pending = { id: this.nextId++, job, resolve, timer: 0 };
      this.queue.push(p);
      this.active.add(job.scriptId);
      this.pump();
    });
  }

  /** 同一 scriptId 的并发调用合并到队列里已存在的那一项上 */
  private attachToActive(scriptId: string): Promise<AnalysisOutcome> {
    const inQueue = this.queue.find((p) => p.job.scriptId === scriptId);
    if (inQueue) {
      return new Promise<AnalysisOutcome>((resolve) => {
        const orig = inQueue.resolve;
        inQueue.resolve = (o) => { orig(o); resolve(o); };
      });
    }
    // 正在执行中：等它结束后的缓存结果
    return new Promise<AnalysisOutcome>((resolve) => {
      const wait = (): void => {
        if (this.disposed) { resolve({ kind: 'error', error: '分析客户端已关闭' }); return; }
        const hit = this.cache.get(scriptId);
        if (hit) { resolve(hit); return; }
        if (!this.active.has(scriptId)) { resolve({ kind: 'error', error: '分析任务已结束但没有结果' }); return; }
        g.setTimeout(wait, 100);
      };
      wait();
    });
  }

  /** 串行推进队列：并发上限为 1 */
  private pump(): void {
    if (this.disposed || this.inflight) return;
    const next = this.queue.shift();
    if (!next) return;

    const w = this.ensureWorker();
    if (!w) {
      this.finish(next, { kind: 'error', error: '分析 Worker 不可用' });
      return;
    }

    this.inflight = next;
    next.timer = g.setTimeout(() => {
      // 挂死检测：terminate 并重建，该任务显式失败
      this.breakWorker('分析超时');
      this.finish(next, { kind: 'error', error: `分析超时（超过 ${this.timeoutMs} ms 无响应）` });
    }, this.timeoutMs);

    try {
      w.postMessage({ id: next.id, source: next.job.source, scriptId: next.job.scriptId, scriptUrl: next.job.scriptUrl });
    } catch (e: any) {
      this.breakWorker('postMessage 失败');
      this.finish(next, { kind: 'error', error: `向 Worker 发送任务失败：${e?.message ?? e}` });
    }
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (this.workerBroken) return null;
    try {
      // Phase 4.7：Worker 作为独立产物输出（vite 的 new URL(..., import.meta.url) 形式），
      // 面板据此创建同源 ES module Worker；测试可注入替代实现。
      const w = this.hooks.createWorker
        ? this.hooks.createWorker()
        : new Worker(new URL('../workers/decoder-analysis.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<any>) => this.onWorkerMessage(ev.data);
      w.onerror = (ev: any) => {
        this.breakWorker('Worker 错误：' + (ev?.message ?? 'unknown'));
        this.drainQueueAsFailed('分析 Worker 出错');
      };
      this.worker = w;
      return w;
    } catch (e: any) {
      this.workerBroken = true;
      this.hooks.onWorkerUnavailable?.(String(e?.message ?? e));
      return null;
    }
  }

  private onWorkerMessage(data: any): void {
    const cur = this.inflight;
    if (!cur || !data || data.id !== cur.id) return; // 陈旧或无法识别的回复：忽略
    if (data.ok && data.result) this.finish(cur, { kind: 'result', result: data.result as DiscoveryResult });
    else this.finish(cur, { kind: 'error', error: String(data.error ?? 'Worker 未返回结果') });
  }

  private finish(p: Pending, outcome: AnalysisOutcome): void {
    if (p.timer) g.clearTimeout(p.timer);
    if (this.inflight === p) this.inflight = null;
    this.active.delete(p.job.scriptId);
    this.cache.set(p.job.scriptId, outcome);
    p.resolve(outcome);
    this.pump();
  }

  /** Worker 崩溃：丢弃它，后续任务重建一个新的 */
  private breakWorker(reason: string): void {
    if (this.worker) {
      try { this.worker.terminate(); } catch { /* ignore */ }
      this.worker = null;
    }
    if (this.queue.length > MAX_QUEUE) this.queue.length = MAX_QUEUE;
    this.hooks.onWorkerUnavailable?.(reason);
  }

  private drainQueueAsFailed(reason: string): void {
    const rest = this.queue;
    this.queue = [];
    for (const p of rest) {
      this.active.delete(p.job.scriptId);
      this.cache.set(p.job.scriptId, { kind: 'error', error: reason });
      p.resolve({ kind: 'error', error: reason });
    }
  }

  /**
   * 取消全部任务（页面刷新重置、面板关闭）。
   * 在飞行与排队的任务全部以显式错误结束；清空去重缓存，因为旧脚本已过期。
   */
  cancelAll(reason: string): void {
    if (this.inflight) {
      const cur = this.inflight;
      this.inflight = null;
      this.active.delete(cur.job.scriptId);
      if (cur.timer) g.clearTimeout(cur.timer);
      cur.resolve({ kind: 'error', error: reason });
    }
    this.drainQueueAsFailed(reason);
    this.cache.clear();
    if (this.worker) {
      try { this.worker.terminate(); } catch { /* ignore */ }
      this.worker = null;
    }
    this.workerBroken = false;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAll('面板已关闭');
  }

  /** 只读观测：队列状态，供测试与进度显示使用 */
  stats(): { queued: number; inflight: boolean; cached: number; workerBroken: boolean } {
    return { queued: this.queue.length, inflight: this.inflight !== null, cached: this.cache.size, workerBroken: this.workerBroken };
  }
}
