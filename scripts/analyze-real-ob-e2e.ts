import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';

// Offline re-validation of the UNMODIFIED engine records saved by devtools-real-ob-e2e.ts (round 1) against the real sample source.
// The oracle runs obfuscated.js in node:vm and calls the decoder after the script finished. It only cross-checks the report; the product never does this.
const ROOT = 'D:/Projects/ob-recover';
const SUFFIX = process.env.SUFFIX || '';
const raw = JSON.parse(readFileSync(ROOT + '/test/acceptance/devtools-real-ob-e2e' + SUFFIX + '.json', 'utf8'));
const allCaps: any[] = raw.steps.round1EngineRaw.captures;
const caps: any[] = Array.isArray(allCaps) ? allCaps.filter((c) => String(c.scriptUrl).endsWith('/obfuscated.js')) : [];
if (!Array.isArray(caps) || caps.length === 0) throw new Error('no raw captures in round1EngineRaw');
const src = readFileSync(ROOT + '/test/fixtures/real-ob/obfuscated.js', 'utf8');
const lines = src.split(String.fromCharCode(10));
const foreign = allCaps.length - caps.length;
const scripts = Array.from(new Set(caps.map((c) => c.scriptId))).map((id) => ({ scriptId: id as string, source: src }));
const ctx: any = vm.createContext({ window: {}, document: { title: '' } });
new vm.Script(src, { filename: 'oracle.js' }).runInContext(ctx, { timeout: 5000 });
const iifeEnd = src.indexOf('}(_0xb31e,0x578ca));');
const rv = (v: any): unknown => (v && v.type === 'undefined' ? undefined : v ? v.value : undefined);
const report: any = validateCaptures(caps, scripts);
const rows = report.groups.map((g: any) => {
  const args = g.arguments.map(rv);
  let oracle: unknown;
  try { oracle = ctx[g.functionName](...args); } catch (e: any) { oracle = 'ERR ' + e.message; }
  const returns = g.returnSamples.map((s: any) => rv(s.value));
  return {
    fn: g.functionName,
    status: g.status,
    evidence: g.evidence,
    args,
    observations: g.observations,
    distinct: g.distinctReturns,
    returns: returns.slice(0, 5),
    oracle,
    allMatchOracle: returns.every((r: unknown) => r === oracle),
    sites: g.callLocations.length,
    sitesInRotationIife: g.callLocations.filter((p: any) => p.lineNumber === 0 && iifeEnd > 0 && p.columnNumber < iifeEnd).length,
    suspect: g.functionSuspect,
    siteText: g.callLocations.slice(0, 2).map((p: any) => (lines[p.lineNumber] || '').slice(p.columnNumber, p.columnNumber + 60)),
  };
});
const count = (list: any[], f: (r: any) => boolean): number => list.filter(f).length;
const verified = rows.filter((r: any) => r.status === 'verified');
const real = await dryRunReplacements(report, scripts);
const candCheck = real.candidates.map((c: any) => {
  let o: unknown;
  try { o = vm.runInContext(c.callText, ctx); } catch (e: any) { o = 'ERR ' + e.message; }
  return { fn: c.functionName, pos: c.position, callText: String(c.callText).slice(0, 80), replacement: c.replacement, oracle: JSON.stringify(o), match: JSON.stringify(o) === c.replacement };
});
const hypo = await dryRunReplacements({ ...report, groups: report.groups.map((g: any) => ({ ...g, functionSuspect: false })) }, scripts);
const out = {
  note: 'offline analysis of unmodified round-1 engine records; oracle = decoder called after the script finished (report cross-check only, never used by the product); hypotheticalDryRun clears functionSuspect on a COPY only to show which per-site check would reject next - diagnostic, not a pass criterion',
  records: caps.length,
  foreignRecords: foreign,
  iifeEnd,
  groups: rows.length,
  byStatus: report.summary.byStatus,
  verified: {
    total: verified.length,
    single: count(verified, (r) => r.evidence === 'single-observation'),
    multiple: count(verified, (r) => r.evidence === 'multiple-observations'),
    returnEqualsOracle: count(verified, (r) => r.allMatchOracle),
    returnDiffersFromOracle: count(verified, (r) => !r.allMatchOracle),
    withSiteInsideRotationIife: count(verified, (r) => r.sitesInRotationIife > 0),
  },
  realDryRun: real.summary,
  byFunctionStatus: rows.reduce((a: any, r: any) => { const k = r.fn + ' ' + r.status; a[k] = (a[k] || 0) + 1; return a; }, {}),
  unstable: { total: count(rows, (r: any) => r.status === 'unstable'), withSiteInsideRotationIife: count(rows, (r: any) => r.status === 'unstable' && r.sitesInRotationIife > 0) },
  candidateOracle: { total: candCheck.length, match: count(candCheck, (r: any) => r.match), mismatch: count(candCheck, (r: any) => !r.match), sample: candCheck.slice(0, 6) },
  hypotheticalDryRun: {
    summary: hypo.summary,
    firstRejections: hypo.rejections.slice(0, 5).map((r: any) => ({ fn: r.functionName, pos: r.position, codes: r.reasons.map((x: any) => x.code) })),
  },
  verifiedMismatch: verified.filter((r: any) => !r.allMatchOracle).slice(0, 6),
  verifiedSamples: verified.slice(0, 4),
};
writeFileSync(ROOT + '/test/acceptance/devtools-real-ob-analysis' + SUFFIX + '.json', JSON.stringify(out, null, 2));
console.log('analysis written: records=' + caps.length + ' groups=' + rows.length);
