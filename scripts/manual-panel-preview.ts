import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';
import { parseCode } from '../src/core/parser.js';
import { validateCaptures } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements } from '../src/core/verified-replacer.js';
import { planManualCapture, buildManualCapture, MANUAL_SEQ_BASE } from '../src/core/manual-capture-convert.js';

// Static + node:vm preview of the manual-mode chain (discovery -> plan -> frame eval -> validate -> dry-run -> apply).
// NOT a browser run: it gives no verdict about the panel UI, only whether a page's decoder can reach verified at all.
const FILE = process.env.PAGE_JS || 'D:/Projects/ob-recover/test-pages/phase4-manual-real.js';
const OUT = 'C:/Users/Administrator/TEMP/opencode/manual-panel-preview.json';
const NL = String.fromCharCode(10);
const src = readFileSync(FILE, 'utf8');
const script = { scriptId: '1', source: src, url: FILE };
const toRv = (v: unknown): any => (typeof v === 'string' ? { type: 'string', value: v } : typeof v === 'number' ? { type: 'number', value: v } : typeof v === 'boolean' ? { type: 'boolean', value: v } : v === null ? { type: 'null', value: null } : { type: typeof v });

async function main() {
  const out: any = { note: 'node:vm preview, not a browser run', file: FILE, candidates: [], plans: [], groups: [] };
  try {
    const sandbox: any = { atob: (s: string) => Buffer.from(s, 'base64').toString('latin1'), window: {}, document: { title: '', getElementById: () => ({ addEventListener() {}, textContent: '' }) } };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const d = discoverDecoders(src, '1', FILE);
    out.analyzed = d.analyzed;
    const ast = parseCode(src);
    const caps: any[] = [];
    let seq = MANUAL_SEQ_BASE;
    for (const c of d.candidates) {
      out.candidates.push({ name: c.name, confidence: c.confidence, callCount: c.callCount, literalCallSites: c.callSites.filter((s: any) => s.args.every((a: any) => a.isLiteral)).length, evidence: c.evidence });
      if (!c.name || (c.confidence !== 'high' && c.confidence !== 'medium')) continue;
      const cp = computeCapturePlan(src, c.location.start, ast);
      if (!cp.supported || !cp.entry) { out.plans.push({ fn: c.name, skipped: cp.reason }); continue; }
      for (const cs of c.callSites) {
        if (!cs.callText.startsWith(c.name + '(') || !cs.args.every((a: any) => a.isLiteral)) continue;
        const call = { lineNumber: cs.location.startLine - 1, columnNumber: cs.location.startColumn };
        const p: any = planManualCapture(script, cp.entry, c.name, call);
        if (!p.ok) { out.plans.push({ fn: c.name, call, rejected: p.code, message: p.message }); continue; }
        const probeValue = vm.runInContext(p.bindingProbe, sandbox);
        const value = vm.runInContext(p.expression, sandbox);
        const built: any = buildManualCapture(p, { success: true, result: { type: 'string', value: probeValue } }, { success: true, result: toRv(value) }, { scriptUrl: FILE, seq: ++seq, timestamp: Date.now() });
        if (!built.ok) { out.plans.push({ fn: c.name, call, expression: p.expression, rejected: built.code, message: built.message }); continue; }
        out.plans.push({ fn: c.name, call, expression: p.expression, value });
        caps.push(built.capture);
      }
    }
    const report = validateCaptures(caps, [script]);
    for (const g of report.groups) out.groups.push({ fn: g.functionName, args: g.arguments.map((a: any) => a.value), status: g.status, evidence: g.evidence, reasons: g.reasons.map((r: any) => r.code + ': ' + r.message.slice(0, 140)) });
    const dry = await dryRunReplacements(report, [script]);
    out.dryRun = { summary: dry.summary, candidates: dry.candidates.map((c) => c.callText + ' -> ' + c.replacement + ' @ ' + (c.position.lineNumber + 1) + ':' + (c.position.columnNumber + 1)), rejections: dry.rejections.map((r) => r.functionName + ': ' + r.reasons.map((x) => x.code).join(',')) };
    const applied = await applyVerifiedReplacements(dry, script);
    const a = src.split(NL);
    const b = applied.code.split(NL);
    out.applied = applied.applied.length;
    out.changedLines = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.changedLines.push((i + 1) + ': ' + String(a[i]).trim() + '  =>  ' + String(b[i]).trim());
  } catch (e: any) {
    out.fatal = e && e.message ? e.message : String(e);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
