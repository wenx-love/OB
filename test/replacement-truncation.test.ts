import { describe, it, expect } from 'vitest';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements, type DryRunResult } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';
import { drive } from './helpers/capture-driver.js';

// Phase 4.6：callLocationsTruncated 在 Phase 3.2（GroupValidation）→ dry-run（ReplacementCandidate）→ 替换引擎 这条链上的传递与保守拒绝。
// 此前字段在 dry-run 生成候选时丢失，替换引擎里的截断检查读到的永远是 undefined；dry-run 的 location-list-truncated 也没有任何测试。

const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);
const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const STABLE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');

describe('callLocationsTruncated 数据链', () => {
  it('未截断：每个候选都携带 callLocationsTruncated === false', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const dry = await dryRunReplacements(validateCaptures(d.captures, [d.script]), [d.script]);
    expect(dry.candidates).toHaveLength(4);
    expect(dry.candidates.every((c) => c.callLocationsTruncated === false)).toBe(true);
  });

  it('截断（记录被引擎标记）：验证仍是 verified 但带截断标记；dry-run 整组拒绝为 location-list-truncated，不产生任何候选', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const tampered = d.captures.map((c) => ({ ...c, callLocationsTruncated: true }));
    const report = validateCaptures(tampered, [d.script]);
    expect(report.groups).toHaveLength(2);
    expect(report.groups.every((g) => g.status === 'verified' && g.callLocationsTruncated)).toBe(true);
    const dry = await dryRunReplacements(report, [d.script]);
    expect(dry.candidates).toEqual([]);
    expect(dry.rejections.map((r) => r.reasons[0]?.code)).toEqual(['location-list-truncated', 'location-list-truncated']);
  });

  it('替换引擎独立复核：候选被标记为截断时，即使绕过 dry-run 也一个都不替换', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const dry = await dryRunReplacements(validateCaptures(d.captures, [d.script]), [d.script]);
    const flagged: DryRunResult = { ...dry, candidates: dry.candidates.map((c) => ({ ...c, callLocationsTruncated: true })) };
    const applied = await applyVerifiedReplacements(flagged, d.script);
    expect(applied.code).toBe(d.script.source);
    expect(applied.applied).toEqual([]);
    expect(applied.rejected).toHaveLength(dry.candidates.length);
    expect(applied.rejected.every((r) => r.reasons[0].code === 'call-locations-truncated')).toBe(true);
  });

  it('经过 JSON 往返（sandbox 消息传递）后，截断标记仍然有效', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const dry = await dryRunReplacements(validateCaptures(d.captures, [d.script]), [d.script]);
    const okClone: DryRunResult = JSON.parse(JSON.stringify(dry));
    expect(okClone.candidates.every((c) => c.callLocationsTruncated === false)).toBe(true);
    const applied = await applyVerifiedReplacements(okClone, d.script);
    expect(applied.applied).toHaveLength(4);
    const flaggedClone: DryRunResult = JSON.parse(JSON.stringify({ ...dry, candidates: dry.candidates.map((c) => ({ ...c, callLocationsTruncated: true })) }));
    const refused = await applyVerifiedReplacements(flaggedClone, d.script);
    expect(refused.applied).toEqual([]);
    expect(refused.code).toBe(d.script.source);
  });
});
