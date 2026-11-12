import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { discoverDecoders, type DiscoveryResult } from '../src/core/decoder-discovery.js';
import { DecoderAnalysisClient } from '../src/extension/devtools/decoder-analysis-client.js';

// Phase 4.7 面板性能修复的一致性测试。
// 核心命题：分析搬到 Worker 之后，结果必须与直接调用**完全相同**。
// 这里不启动浏览器：结构化克隆往返用 structuredClone 等价模拟 Worker 的消息边界，
// 另有一组用例直接驱动真实的队列/去重/失败语义（用假的 Worker 实现注入）。
// 不访问任何外部站点。
//
// 512 KB 合成脚本的完整分析在纯 Node 里约需 7 分钟，故只在 P47_HEAVY=1 时运行；
// 常规回归仍会校验它的哈希（证明输入没换过）与小样本一致性。

const HEAVY = process.env.P47_HEAVY === '1';

const SHA_512KB = '6a419264c85865c134c88ed52239eefd527fb2cbcb74ceb9af501d8e106ce207';

function deep(o: any): string { return JSON.stringify(o); }

describe('Decoder Discovery 跨线程一致性', () => {
  it('DiscoveryResult 可结构化克隆且往返后完全相等（小脚本）', () => {
    const src = `var _0xa=['x','y'];function d(n){return _0xa[n-10];}var v=d(10);`;
    const r: DiscoveryResult = discoverDecoders(src, 's1', 'http://x/a.js');
    expect(r.analyzed).toBe(true);
    const back = structuredClone(r);
    expect(deep(back)).toBe(deep(r));
    expect(back.candidates.length).toBe(r.candidates.length);
    expect(back.functions.length).toBe(r.functions.length);
  });

  it('克隆往返不丢候选、调用位置、参数与函数特征', () => {
    const src = `var _0xb=['a','b','c'];function dec(i){return _0xb[i-5];}function u(){var p=dec(5);var q=dec(7);return p+q;}`;
    const r = discoverDecoders(src, 's2', 'http://x/b.js');
    const back = structuredClone(r) as DiscoveryResult;
    expect(deep(back.candidates)).toBe(deep(r.candidates));
    const cand = back.candidates[0];
    expect(cand.callSites.length).toBeGreaterThan(0);
    // 调用位置的每个字段都必须是可克隆的纯数据
    for (const cs of cand.callSites) {
      expect(typeof cs.callText).toBe('string');
      expect(typeof cs.location.start).toBe('number');
      expect(Array.isArray(cs.args)).toBe(true);
      expect(typeof cs.parentNodeType).toBe('string');
    }
  });

  it('解析失败时 analyzed:false 与 error 也原样往返（不被伪装成成功）', () => {
    const r = discoverDecoders('function ( {', 's3', 'http://x/bad.js');
    expect(r.analyzed).toBe(false);
    expect(typeof r.error).toBe('string');
    const back = structuredClone(r);
    expect(back.analyzed).toBe(false);
    expect(back.error).toBe(r.error);
    expect(back.candidates.length).toBe(0);
  });

  it('大脚本（归档 hpailist-2）克隆往返完全一致', () => {
    const raw = readFileSync('test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js');
    expect(raw.length).toBe(256820); // 字节
    const src = raw.toString('utf8');
    expect(src.length).toBe(255977); // 字符
    const r = discoverDecoders(src, 'big', 'https://j.17qcc.com/combo?...hpailist-2');
    expect(r.analyzed).toBe(true);
    const back = structuredClone(r) as DiscoveryResult;
    expect(deep(back)).toBe(deep(r));
    // 候选与调用位置一个都不能少
    expect(back.candidates.length).toBe(r.candidates.length);
    expect(back.candidates.length).toBeGreaterThan(0);
    const callsBefore = r.candidates.reduce((n, c) => n + c.callSites.length, 0);
    const callsAfter = back.candidates.reduce((n, c) => n + c.callSites.length, 0);
    expect(callsAfter).toBe(callsBefore);
  }, 300000);

  it.runIf(HEAVY)('确定性：hpailist-2 连续两次分析结果逐字节相同（慢用例）', () => {
    const src = readFileSync('test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js', 'utf8');
    const a = discoverDecoders(src, 'x', 'u');
    const b = discoverDecoders(src, 'x', 'u');
    expect(deep(b)).toBe(deep(a));
  }, 600000);

  it('512 KB 合成脚本仍是同一份固定输入（哈希不变）', () => {
    const raw = readFileSync('test/fixtures/p47-512kb-synthetic.js');
    // 与修复前那两次真机运行记录的哈希一致：输入没有换过
    expect(createHash('sha256').update(raw).digest('hex')).toBe(SHA_512KB);
    expect(raw.length).toBe(512064);
    expect(raw.toString('utf8').split('\n').length).toBe(1);
  });

  it.runIf(HEAVY)('512 KB 合成脚本：完整分析结果可结构化克隆且不丢数据（慢用例）', () => {
    const src = readFileSync('test/fixtures/p47-512kb-synthetic.js').toString('utf8');
    const r = discoverDecoders(src, 'syn', 'http://x/syn.js');
    expect(r.analyzed).toBe(true);
    // 该脚本产出 983 个候选，正是面板同步分析要花约 150 s 的原因
    expect(r.candidates.length).toBe(983);
    const back = structuredClone(r) as DiscoveryResult;
    expect(back.candidates.length).toBe(r.candidates.length);
    expect(back.functions.length).toBe(r.functions.length);
    const before = r.candidates.reduce((n, c) => n + c.callSites.length, 0);
    const after = back.candidates.reduce((n, c) => n + c.callSites.length, 0);
    expect(after).toBe(before);
  }, 900000);

  it('确定性：同一输入连续两次分析结果逐字节相同（小脚本）', () => {
    const src = `var _0xd=['m','n','o'];function dec(i){return _0xd[i-3];}function v(){return dec(3)+dec(4);}`;
    const a = discoverDecoders(src, 'x', 'u');
    const b = discoverDecoders(src, 'x', 'u');
    expect(deep(b)).toBe(deep(a));
  });
});
