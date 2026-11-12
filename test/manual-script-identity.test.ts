import { describe, it, expect } from 'vitest';
import { computeCapturePlan, type CdpPosition } from '../src/core/capture-plan.js';
import { validateCaptures, type ValidationScript } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';
import { planManualCapture, buildManualCapture, MANUAL_SEQ_BASE } from '../src/core/manual-capture-convert.js';
import type { DecoderCapture } from '../src/extension/debugger/capture-engine.js';

// Phase 4.6：手动记录的脚本身份。页面刷新后旧记录失效、相同 URL 和相同源码但 scriptId 不同、同一 scriptId 的源码变化后，
// 旧记录或旧候选都必须被拒绝，源码保持原样；断言的是完整源码和拒绝原因，不只是没有抛异常。

const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);
const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'var p = dec(1);', 'var q = dec(1);');

function mk(scriptId: string, source: string = SRC): ValidationScript {
  return { scriptId, source, url: 'http://test/same.js', startLine: 0, startColumn: 0 };
}

function locate(source: string, needle: string, nth = 0): CdpPosition {
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = source.indexOf(needle, index + 1);
    if (index < 0) throw new Error('needle not found: ' + needle);
  }
  const before = source.slice(0, index).split(NL);
  return { lineNumber: before.length - 1, columnNumber: before[before.length - 1].length };
}

function manualCapture(script: ValidationScript, nth: number, value: string): DecoderCapture {
  const entryPlan = computeCapturePlan(script.source, script.source.indexOf('function dec'));
  if (!entryPlan.entry) throw new Error('no capture entry: ' + String(entryPlan.reason));
  const plan = planManualCapture(script, entryPlan.entry, 'dec', locate(script.source, 'dec(1)', nth));
  if (!plan.ok) throw new Error(plan.code + ': ' + plan.message);
  const built = buildManualCapture(
    plan,
    { success: true, result: { type: 'string', value: plan.bindingFingerprint } },
    { success: true, result: { type: 'string', value } },
    { scriptUrl: script.url ?? '', seq: MANUAL_SEQ_BASE + 1, timestamp: 1 },
  );
  if (!built.ok) throw new Error(built.code + ': ' + built.message);
  return built.capture;
}

describe('手动记录的脚本身份与失效', () => {
  it('页面刷新后旧 scriptId 不在当前脚本集合：旧记录判为 stale-script，不产生候选，源码不变', async () => {
    const old = mk('s1');
    const cap = manualCapture(old, 0, 'beta');
    const fresh = mk('s2');
    const report = validateCaptures([cap], [fresh]);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].status).toBe('failed');
    expect(report.groups[0].reasons.map((r) => r.code)).toContain('stale-script');
    const dry = await dryRunReplacements(report, [fresh]);
    expect(dry.candidates).toEqual([]);
    const applied = await applyVerifiedReplacements(dry, fresh);
    expect(applied.code).toBe(SRC);
    expect(applied.applied).toEqual([]);
  });

  it('同 URL、同源码、不同 scriptId：候选只属于求值的那个脚本，应用到另一个脚本被 scriptId 校验拒绝', async () => {
    const a = mk('s1');
    const b = mk('s2');
    const cap = manualCapture(a, 0, 'beta');
    const dry = await dryRunReplacements(validateCaptures([cap], [a, b]), [a, b]);
    expect(dry.candidates).toHaveLength(1);
    expect(dry.candidates.every((c) => c.scriptId === 's1')).toBe(true);
    const onB = await applyVerifiedReplacements(dry, b);
    expect(onB.code).toBe(SRC);
    expect(onB.applied).toEqual([]);
    expect(onB.rejected.map((r) => r.reasons[0].code)).toEqual(['script-id-mismatch']);
    const onA = await applyVerifiedReplacements(dry, a);
    expect(onA.code).toBe(src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'var p = ' + JSON.stringify('beta') + ';', 'var q = dec(1);'));
  });

  it('同一 scriptId 但源码已变化：旧候选被 scriptHash 校验拒绝，新源码不被改动', async () => {
    const original = mk('s1');
    const cap = manualCapture(original, 0, 'beta');
    const dryOld = await dryRunReplacements(validateCaptures([cap], [original]), [original]);
    expect(dryOld.candidates).toHaveLength(1);
    const changed = mk('s1', NL + NL + SRC);
    const report = validateCaptures([cap], [changed]);
    expect(report.groups[0].status).toBe('failed');
    const onChanged = await applyVerifiedReplacements(dryOld, changed);
    expect(onChanged.code).toBe(changed.source);
    expect(onChanged.applied).toEqual([]);
    expect(onChanged.rejected.map((r) => r.reasons[0].code)).toEqual(['script-version-mismatch']);
  });
});
