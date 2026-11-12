/**
 * Phase 4.7 面板性能修复 — Decoder Discovery Worker
 *
 * 只做一件事：在 Worker 线程里调用**同一个** discoverDecoders。
 * 不重写识别规则、不裁剪源码、不改变返回结构：本文件不含任何分析逻辑。
 *
 * 输入：{ id, source, scriptId, scriptUrl }
 * 输出：{ id, ok: true, result: DiscoveryResult }
 *       { id, ok: false, error: string }          // Worker 内部异常（非分析失败）
 *
 * 注意：discoverDecoders 自己用 analyzed:false + error 表达「分析失败」，
 * 那是合法结果，按 ok:true 原样回传，不做任何包装或降级。
 */
import { discoverDecoders, type DiscoveryResult } from '../../core/decoder-discovery.js';

interface AnalysisRequest {
  id: number;
  source: string;
  scriptId?: string;
  scriptUrl?: string;
}

interface AnalysisResponse {
  id: number;
  ok: boolean;
  result?: DiscoveryResult;
  error?: string;
}

self.onmessage = (ev: MessageEvent<AnalysisRequest>) => {
  const req = ev.data;
  const id = req?.id;
  if (typeof id !== 'number') return;

  try {
    // 与面板此前完全相同的调用：同一函数、同一参数顺序、同一源码
    const result = discoverDecoders(req.source, req.scriptId, req.scriptUrl);
    const msg: AnalysisResponse = { id, ok: true, result };
    (self as any).postMessage(msg);
  } catch (err: any) {
    const msg: AnalysisResponse = { id, ok: false, error: err && err.message ? err.message : String(err) };
    (self as any).postMessage(msg);
  }
};
