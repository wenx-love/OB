import { readFileSync, writeFileSync } from 'node:fs';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';
import { selectTargets, DEFAULT_STRATEGY } from '../src/core/capture-strategy.js';

// 逐个函数核对每个环节：识别 -> 置信度 -> 捕获计划 -> 自动捕获选择
const files = process.argv.slice(2);
const out: any[] = [];

for (const f of files) {
  const src = readFileSync(f, 'utf-8');
  const d = discoverDecoders(src, 's', f);
  const byName = new Map<string, any>();
  for (const c of d.candidates) {
    const plan = computeCapturePlan(src, c.location.start);
    byName.set(c.name!, {
      name: c.name,
      kind: c.kind,
      confidence: c.confidence,
      paramCount: c.paramCount,
      staticCalls: c.callCount,
      stringArray: c.stringArrayName,
      hasIndexOffset: c.hasIndexOffset,
      planSupported: plan.supported,
      planReason: plan.reason,
      returns: plan.returns.length,
      selectedByDefault: selectTargets([c], DEFAULT_STRATEGY).length > 0,
      selectedMedium: selectTargets([c], { autoCaptureMinConfidence: 'medium' }).length > 0,
    });
  }
  // 记录所有函数声明（含非候选），用于标记"未被识别"
  const declared = d.functions.map((fn) => ({ name: fn.name, kind: fn.kind, isCandidate: byName.has(fn.name!) }));
  out.push({ file: f, analyzed: d.analyzed, functionCount: d.functions.length, candidateCount: d.candidates.length, high: d.candidates.filter((c) => c.confidence === 'high').length, medium: d.candidates.filter((c) => c.confidence === 'medium').length, low: d.candidates.filter((c) => c.confidence === 'low').length, candidates: Array.from(byName.values()), declared });
}
writeFileSync('D:/Projects/ob-recover/test/acceptance/phase3-1-coverage.json', JSON.stringify(out, null, 2));
for (const o of out) {
  console.log('=== ' + o.file.split('/').pop() + ' (functions=' + o.functionCount + ', candidates=' + o.candidateCount + ', high=' + o.high + ', medium=' + o.medium + ')');
  for (const c of o.candidates) console.log('  cand ' + JSON.stringify(c));
  const nonCand = o.declared.filter((x: any) => x.name && !x.isCandidate);
  if (nonCand.length) console.log('  NOT identified as candidate: ' + nonCand.map((x: any) => x.name).join(', '));
}
