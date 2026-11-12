import { describe, it, expect, vi } from 'vitest';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { DecoderAnalysisClient } from '../src/extension/devtools/decoder-analysis-client.js';

// Phase 4.7 面板性能修复：队列、去重、失败、取消、超时的语义测试。
// 用假的 Worker 注入，验证真实的客户端逻辑；不做任何静态分析以外的浏览器操作，不访问外部站点。

/** 一个可编程的假 Worker：记录收到的任务，按模式回结果、回错误、或永不回复 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  /** 由测试在调用 analyze 之前设置：决定接下来这批任务的行为 */
  static mode: 'ok' | 'throw' | 'silent' = 'ok';
  onmessage: ((ev: { data: any }) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  received: any[] = [];
  terminated = false;

  constructor() { FakeWorker.instances.push(this); }

  postMessage(msg: any): void {
    if (this.terminated) throw new Error('worker terminated');
    this.received.push(msg);
    if (FakeWorker.mode === 'silent') return;
    const finish = (): void => {
      if (this.terminated) return;
      if (FakeWorker.mode === 'throw') { this.onmessage?.({ data: { id: msg.id, ok: false, error: '模拟 Worker 内部异常' } }); return; }
      const result = discoverDecoders(msg.source, msg.scriptId, msg.scriptUrl);
      this.onmessage?.({ data: { id: msg.id, ok: true, result } });
    };
    // 异步完成，模拟真实 Worker 的消息往返
    setTimeout(finish, 0);
  }

  terminate(): void { this.terminated = true; }
}

function makeClient(hooks: any = {}): { client: DecoderAnalysisClient; workers: FakeWorker[] } {
  FakeWorker.instances = [];
  FakeWorker.mode = 'ok';
  const client = new DecoderAnalysisClient({ createWorker: () => new FakeWorker() as any, ...hooks });
  return { client, workers: FakeWorker.instances };
}

const SRC = `var _0xc=['p','q'];function dec(i){return _0xc[i-1];}var z=dec(1)+dec(2);`;

describe('分析客户端：队列、去重、失败与取消', () => {
  it('串行队列：并发上限为 1，任务按到达顺序执行', async () => {
    const { client, workers } = makeClient();
    workers.length = 0;
    const a = client.analyze({ scriptId: 'a', source: SRC });
    const b = client.analyze({ scriptId: 'b', source: SRC });
    const c = client.analyze({ scriptId: 'c', source: SRC });
    const r = await Promise.all([a, b, c]);
    expect(r.every((x) => x.kind === 'result')).toBe(true);
    expect(client.stats().queued).toBe(0);
    expect(client.stats().inflight).toBe(false);
    // 只创建了一个 Worker（串行复用）
    expect(FakeWorker.instances.length).toBe(1);
    expect(FakeWorker.instances[0].received.map((m) => m.scriptId)).toEqual(['a', 'b', 'c']);
    client.dispose();
  });

  it('去重：同一 scriptId 重复请求只分析一次，结果复用', async () => {
    const { client } = makeClient();
    const first = await client.analyze({ scriptId: 'dup', source: SRC });
    const second = await client.analyze({ scriptId: 'dup', source: SRC });
    expect(first.kind).toBe('result');
    expect(second.kind).toBe('result');
    expect(FakeWorker.instances[0].received.length).toBe(1);
    client.dispose();
  });

  it('去重：同一 scriptId 并发到达时合并成一次分析', async () => {
    const { client, workers } = makeClient();
    workers.length = 0;
    const p1 = client.analyze({ scriptId: 'same', source: SRC });
    const p2 = client.analyze({ scriptId: 'same', source: SRC });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.kind).toBe('result');
    expect(r2.kind).toBe('result');
    expect(FakeWorker.instances[0].received.length).toBe(1);
    client.dispose();
  });

  it('force=true 绕过缓存重新分析，但仍走同一队列且不阻塞调用方', async () => {
    const { client } = makeClient();
    await client.analyze({ scriptId: 'f', source: SRC });
    await client.analyze({ scriptId: 'f', source: SRC }, { force: true });
    expect(FakeWorker.instances[0].received.length).toBe(2);
    client.dispose();
  });

  it('Worker 内部异常 → 显式错误，不返回伪造的成功结果', async () => {
    const { client, workers } = makeClient();
    workers.length = 0;
    FakeWorker.mode = 'throw';
    const p = client.analyze({ scriptId: 'boom', source: SRC });
    const r = await p;
    expect(r.kind).toBe('error');
    expect(r.kind === 'error' && r.error).toContain('模拟 Worker 内部异常');
    client.dispose();
  }, 60000);

  it('分析本身失败（源码语法错误）→ 作为合法结果透传 analyzed:false', async () => {
    const { client } = makeClient();
    const r = await client.analyze({ scriptId: 'bad', source: 'function ( {' });
    expect(r.kind).toBe('result');
    expect(r.kind === 'result' && r.result.analyzed).toBe(false);
    expect(r.kind === 'result' && typeof r.result.error).toBe('string');
    client.dispose();
  });

  it('超时 → 显式失败并重建 Worker，后续任务仍可完成（失败后恢复）', async () => {
    vi.useFakeTimers();
    try {
      const { client } = makeClient({ timeoutMs: 50 });
      FakeWorker.mode = 'silent';
      const p = client.analyze({ scriptId: 'hang', source: SRC });
      await vi.advanceTimersByTimeAsync(60);
      const r = await p;
      expect(r.kind).toBe('error');
      expect(r.kind === 'error' && r.error).toContain('超时');
      // 恢复：新任务用新的 Worker 正常完成
      FakeWorker.mode = 'ok';
      const good = client.analyze({ scriptId: 'good', source: SRC });
      await vi.advanceTimersByTimeAsync(60);
      const r2 = await good;
      expect(r2.kind).toBe('result');
      client.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Worker 构造失败 → onWorkerUnavailable 且任务显式失败，不伪装成功', async () => {
    const events: string[] = [];
    const client = new DecoderAnalysisClient({
      createWorker: () => { throw new Error('Worker 不可用'); },
      onWorkerUnavailable: (r) => events.push(r),
    });
    const r = await client.analyze({ scriptId: 'w', source: SRC });
    expect(r.kind).toBe('error');
    expect(events.length).toBeGreaterThan(0);
    client.dispose();
  });

  it('取消：在飞行与排队的任务全部以显式错误结束，缓存被清空', async () => {
    const { client, workers } = makeClient();
    workers.length = 0;
    const p1 = client.analyze({ scriptId: 'k1', source: SRC });
    const p2 = client.analyze({ scriptId: 'k2', source: SRC });
    FakeWorker.mode = 'silent';
    client.cancelAll('页面已刷新，分析任务已取消');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.kind).toBe('error');
    expect(r2.kind).toBe('error');
    expect(r1.kind === 'error' && r1.error).toContain('取消');
    expect(client.stats().cached).toBe(0);
    expect(client.stats().queued).toBe(0);
    expect(client.stats().inflight).toBe(false);
    client.dispose();
  });

  it('面板关闭（dispose）：后续请求显式失败，Worker 被终止', async () => {
    const { client, workers } = makeClient();
    workers.length = 0;
    await client.analyze({ scriptId: 'd', source: SRC });
    const w = FakeWorker.instances[0];
    client.dispose();
    expect(w.terminated).toBe(true);
    const r = await client.analyze({ scriptId: 'after', source: SRC });
    expect(r.kind).toBe('error');
  });

  it('队列上限：超限的任务显式失败，不静默丢弃', async () => {
    const { client } = makeClient();
    FakeWorker.mode = 'silent'; // 队列不会推进，从而把上限真正压出来
    const ps: Promise<any>[] = [];
    for (let i = 0; i < 100; i++) ps.push(client.analyze({ scriptId: 'q' + i, source: SRC }));
    // 前 64 个被接受，其余立刻以显式错误结束（await Promise.all 会因在飞行任务永不结束而挂住）
    const settled = await Promise.all(ps.map((p) => Promise.race([p, Promise.resolve('pending')])));
    const failed = settled.filter((r: any) => r && r.kind === 'error');
    // 队列上限 64 含在飞行任务：1 个在飞行 + 63 个排队，其余显式失败
    expect(failed.length).toBe(36);
    expect(failed.every((r: any) => typeof r.error === 'string' && r.error.includes('队列已满'))).toBe(true);
    // 队列长度始终有界，没有被撑爆
    expect(client.stats().queued).toBeLessThanOrEqual(64);
    client.cancelAll('测试结束');
  }, 60000);

  it('无界积压防护：大量任务下队列长度始终有界', async () => {
    const { client, workers } = makeClient();
    workers.length = 0;
    FakeWorker.instances.length = 0;
    const ps: Promise<any>[] = [];
    for (let i = 0; i < 200; i++) ps.push(client.analyze({ scriptId: 'b' + i, source: SRC }));
    expect(client.stats().queued).toBeLessThanOrEqual(64);
    await Promise.all(ps);
    expect(client.stats().queued).toBe(0);
    client.dispose();
  }, 120000);
});
