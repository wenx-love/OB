import _traverse from '@babel/traverse';
import { parse, parseExpression } from '@babel/parser';
import * as t from '@babel/types';
import type { CdpPosition } from '../../src/core/capture-plan.js';
import type { DecoderCapture } from '../../src/extension/debugger/capture-engine.js';
import { validateCaptures, type ValidationReport, type ValidationScript } from '../../src/core/capture-validation.js';
import { dryRunReplacements, type DryRunResult } from '../../src/core/replacement-dryrun.js';
import { applyVerifiedReplacements, type ApplyResult } from '../../src/core/verified-replacer.js';
import { computeScriptHash } from '../../src/core/hash-utils.js';

// Phase 4.7 comparison helpers. Test side only: nothing under src/ is added or changed.
// Provides (1) the five-class classification and the metric formulas of docs/PHASE4.7-REAL-SITE-PLAN.md sections 7.1 and 8.2,
// (2) an independent oracle reference builder (node:vm execution + @babel/parser, no OB-Recover analysis code),
// (3) a runner chaining the existing validateCaptures -> dryRunReplacements -> applyVerifiedReplacements,
// (4) a persister that keeps reference/ and observed/ physically separate and refuses wrong capturedBy labels.
// Rules enforced in code: duplicate reference positions throw; a reference site falls into exactly one category;
// a ratio with an empty denominator is the string n/a (never 0 or 100 percent); a hash mismatch yields no position-level conclusion.

type TraverseFn = typeof _traverse;
const traverse: TraverseFn = typeof _traverse === 'function' ? _traverse : (_traverse as unknown as { default: TraverseFn }).default;

export const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

export type Prim = string | number | boolean | null;
export type Ratio = number | 'n/a';
export type Tri = boolean | 'n/a';
export const CATEGORIES = ['correct-replacement', 'safe-rejection', 'insufficient-evidence', 'version-mismatch', 'false-replacement'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Counts = Record<Category, number>;
export type Layer = 'L1' | 'L2' | 'L3';
export type BusinessParity = 'pass' | 'fail' | 'not-evaluated';
export type Verdict = 'pass' | 'not-pass' | 'inconclusive' | 'version-mismatch';
export type LiteralParse = { ok: true; value: Prim } | { ok: false };

export interface SampleInfo { id: string; layer: Layer; kind: string; isRealSiteSample: boolean; title: string }
export interface Provenance { capturedBy: string; method: string; note: string }
export interface ReferenceSite { position: CdpPosition; callText: string; determinate: boolean; value?: Prim; reason: string }
export interface Identity { referenceSha256: string; observedSha256: string; afterApplySha256: string; basis: string }
export interface AppliedSite { position: CdpPosition; original: string; replaced: string }
export interface RejectionAt { position: CdpPosition; codes: string[]; stage: 'validation' | 'dry-run' | 'apply' }

export interface CompareInput {
  runId: string;
  sample: SampleInfo;
  reference: Provenance;
  observed: Provenance;
  referenceSites: ReferenceSite[];
  identity: Identity;
  applied: AppliedSite[];
  rejections: RejectionAt[];
  businessParity: BusinessParity;
}

export interface SiteResult {
  position: CdpPosition;
  callText: string;
  referenceDeterminate: boolean | null;
  referenceValue?: Prim;
  referenceReason?: string;
  category: Category;
  observedText?: string;
  observedValue?: Prim;
  rejectionCodes: string[];
  note?: string;
}

export interface Detail { tp: number; frWrongValue: number; frOnIndeterminate: number; frNotInReference: number; frSourceMutation: number; un: number; sr: number }

export interface Metrics {
  precision: Ratio;
  recall: Ratio;
  falseReplacement: number | 'n/a';
  unresolved: { count: number | 'n/a'; ratio: Ratio };
  versionMismatch: { runs: number; totalRuns: number; ratio: Ratio };
  safeRejectionRate: Ratio;
  sourceIntegrity: Tri;
  businessParity: BusinessParity;
  rPos: number | 'n/a';
  rNeg: number | 'n/a';
}

export interface HardConditions { falseReplacementIsZero: Tri; sourceIntegrity: Tri; safeRejectionRateIs100: Tri; precisionIs100: Tri }

export interface CompareResult {
  schema: string;
  runId: string;
  sample: SampleInfo;
  provenance: { reference: Provenance; observed: Provenance };
  identity: Identity & { referenceEqualsObserved: boolean; unchangedAfterApply: Tri };
  counts: Counts;
  detail: Detail;
  metrics: Metrics;
  hardConditions: HardConditions;
  verdict: Verdict;
  exhaustive: boolean;
  sites: SiteResult[];
}

export interface AggregateResult {
  label: string;
  runs: number;
  comparableRuns: number;
  versionMismatchRuns: number;
  counts: Counts;
  detail: Detail;
  metrics: Metrics;
  hardConditions: HardConditions;
  verdict: Verdict;
}

const SCHEMA = 'ob-recover.real-site-compare/1';
const HEX64 = /^[0-9a-f]{64}$/;
const keyOf = (p: CdpPosition): string => p.lineNumber + ':' + p.columnNumber;
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const ratio = (n: number, d: number): Ratio => (d === 0 ? 'n/a' : round6(n / d));
const emptyDetail = (): Detail => ({ tp: 0, frWrongValue: 0, frOnIndeterminate: 0, frNotInReference: 0, frSourceMutation: 0, un: 0, sr: 0 });
const zeroCounts = (): Counts => ({ 'correct-replacement': 0, 'safe-rejection': 0, 'insufficient-evidence': 0, 'version-mismatch': 0, 'false-replacement': 0 });
const byPos = (a: SiteResult, b: SiteResult): number => a.position.lineNumber - b.position.lineNumber || a.position.columnNumber - b.position.columnNumber;

export function countCategories(sites: SiteResult[]): Counts {
  const c = zeroCounts();
  for (const s of sites) c[s.category]++;
  return c;
}

/** Parse a replacement text as a JS literal; comparison is by parsed value, never by text, so escape style does not matter. */
export function parseLiteral(text: string): LiteralParse {
  try {
    const n = parseExpression(text);
    if (t.isStringLiteral(n) || t.isNumericLiteral(n) || t.isBooleanLiteral(n)) return { ok: true, value: n.value };
    if (t.isNullLiteral(n)) return { ok: true, value: null };
  } catch {
    /* not a literal */
  }
  return { ok: false };
}

export function metricsOf(d: Detail, integrity: Tri, parity: BusinessParity, vmRuns: number, totalRuns: number): Metrics {
  const fr = d.frWrongValue + d.frOnIndeterminate + d.frNotInReference + d.frSourceMutation;
  const rPos = d.tp + d.frWrongValue + d.un;
  const rNeg = d.sr + d.frOnIndeterminate;
  return {
    precision: ratio(d.tp, d.tp + fr),
    recall: ratio(d.tp, rPos),
    falseReplacement: fr,
    unresolved: { count: d.un, ratio: ratio(d.un, rPos) },
    versionMismatch: { runs: vmRuns, totalRuns, ratio: ratio(vmRuns, totalRuns) },
    safeRejectionRate: ratio(d.sr, rNeg),
    sourceIntegrity: integrity,
    businessParity: parity,
    rPos,
    rNeg,
  };
}

function naMetrics(vmRuns: number, totalRuns: number, parity: BusinessParity): Metrics {
  return {
    precision: 'n/a',
    recall: 'n/a',
    falseReplacement: 'n/a',
    unresolved: { count: 'n/a', ratio: 'n/a' },
    versionMismatch: { runs: vmRuns, totalRuns, ratio: ratio(vmRuns, totalRuns) },
    safeRejectionRate: 'n/a',
    sourceIntegrity: 'n/a',
    businessParity: parity,
    rPos: 'n/a',
    rNeg: 'n/a',
  };
}

function hardConditionsOf(m: Metrics): HardConditions {
  const hundred = (r: Ratio): Tri => (r === 'n/a' ? 'n/a' : r === 1);
  return {
    falseReplacementIsZero: m.falseReplacement === 'n/a' ? 'n/a' : m.falseReplacement === 0,
    sourceIntegrity: m.sourceIntegrity,
    safeRejectionRateIs100: hundred(m.safeRejectionRate),
    precisionIs100: hundred(m.precision),
  };
}

function verdictOf(h: HardConditions, parity: BusinessParity): Verdict {
  const vals: Tri[] = [h.falseReplacementIsZero, h.sourceIntegrity, h.safeRejectionRateIs100, h.precisionIs100];
  if (vals.includes(false) || parity === 'fail') return 'not-pass';
  if (vals.includes('n/a')) return 'inconclusive';
  return 'pass';
}

export function compareRun(input: CompareInput): CompareResult {
  const seen = new Set<string>();
  for (const s of input.referenceSites) {
    const k = keyOf(s.position);
    if (seen.has(k)) throw new Error('duplicate reference position ' + k + ': every reference site must be unique');
    seen.add(k);
    if (s.determinate && s.value === undefined) throw new Error('reference site ' + k + ' is determinate but carries no value');
  }
  const id = input.identity;
  const versionMismatch = !HEX64.test(id.referenceSha256) || !HEX64.test(id.observedSha256) || id.referenceSha256 !== id.observedSha256;
  const sites: SiteResult[] = [];
  const detail = emptyDetail();
  let integrity: Tri = 'n/a';
  const pseudo: SiteResult[] = [];

  if (versionMismatch) {
    for (const s of input.referenceSites) {
      sites.push({ position: s.position, callText: s.callText, referenceDeterminate: null, category: 'version-mismatch', rejectionCodes: [], note: 'script sha256 differs or is malformed: no position-level comparison is made' });
    }
  } else {
    if (!HEX64.test(id.afterApplySha256)) throw new Error('afterApplySha256 is malformed');
    const appliedBy = new Map<string, AppliedSite[]>();
    for (const a of input.applied) {
      const k = keyOf(a.position);
      const arr = appliedBy.get(k);
      if (arr) arr.push(a);
      else appliedBy.set(k, [a]);
    }
    const rejectedBy = new Map<string, string[]>();
    for (const r of input.rejections) {
      const k = keyOf(r.position);
      const cur = rejectedBy.get(k) ?? [];
      for (const c of r.codes) {
        const tag = r.stage + ':' + c;
        if (!cur.includes(tag)) cur.push(tag);
      }
      rejectedBy.set(k, cur);
    }
    const referenced = new Set(input.referenceSites.map((s) => keyOf(s.position)));

    for (const s of input.referenceSites) {
      const k = keyOf(s.position);
      const apps = appliedBy.get(k) ?? [];
      const codes = rejectedBy.get(k) ?? [];
      const base = { position: s.position, callText: s.callText, referenceDeterminate: s.determinate, referenceValue: s.value, referenceReason: s.reason, rejectionCodes: codes };
      if (apps.length === 0) {
        if (s.determinate) {
          detail.un++;
          sites.push({ ...base, category: 'insufficient-evidence', note: codes.length === 0 ? 'no capture or rejection record covers this position' : undefined });
        } else {
          detail.sr++;
          sites.push({ ...base, category: 'safe-rejection' });
        }
        continue;
      }
      const texts = Array.from(new Set(apps.map((a) => a.replaced)));
      const lit: LiteralParse = texts.length === 1 ? parseLiteral(texts[0]) : { ok: false };
      const observedText = texts.join(' | ');
      const observedValue: Prim | undefined = lit.ok ? lit.value : undefined;
      if (!s.determinate) {
        detail.frOnIndeterminate++;
        sites.push({ ...base, category: 'false-replacement', observedText, observedValue, note: 'the reference marks this position as not safely replaceable' });
      } else if (lit.ok && Object.is(lit.value, s.value)) {
        detail.tp++;
        sites.push({ ...base, category: 'correct-replacement', observedText, observedValue });
      } else {
        detail.frWrongValue++;
        sites.push({ ...base, category: 'false-replacement', observedText, observedValue, note: 'the replacement value differs from the independent reference value' });
      }
    }

    for (const [k, apps] of appliedBy) {
      if (referenced.has(k)) continue;
      detail.frNotInReference++;
      sites.push({ position: apps[0].position, callText: apps[0].original, referenceDeterminate: null, category: 'false-replacement', observedText: apps.map((a) => a.replaced).join(' | '), rejectionCodes: [], note: 'the position is absent from the reference: the reference does not recognise it as a decoder call' });
    }

    integrity = id.afterApplySha256 === id.referenceSha256;
    if (!integrity) {
      detail.frSourceMutation++;
      pseudo.push({ position: { lineNumber: -1, columnNumber: -1 }, callText: '<original script bytes>', referenceDeterminate: null, category: 'false-replacement', rejectionCodes: [], note: 'the original script bytes changed after apply: counted as a false replacement' });
    }
  }

  sites.sort(byPos);
  for (const p of pseudo) sites.push(p);
  const counts = countCategories(sites);
  const total = CATEGORIES.reduce((n, c) => n + counts[c], 0);
  const metrics = versionMismatch ? naMetrics(1, 1, input.businessParity) : metricsOf(detail, integrity, input.businessParity, 0, 1);
  const hardConditions: HardConditions = versionMismatch ? { falseReplacementIsZero: 'n/a', sourceIntegrity: 'n/a', safeRejectionRateIs100: 'n/a', precisionIs100: 'n/a' } : hardConditionsOf(metrics);
  return {
    schema: SCHEMA,
    runId: input.runId,
    sample: input.sample,
    provenance: { reference: input.reference, observed: input.observed },
    identity: { ...id, referenceEqualsObserved: !versionMismatch, unchangedAfterApply: versionMismatch ? 'n/a' : integrity },
    counts,
    detail,
    metrics,
    hardConditions,
    verdict: versionMismatch ? 'version-mismatch' : verdictOf(hardConditions, input.businessParity),
    exhaustive: total === sites.length,
    sites,
  };
}

/** Sum several runs. Version-mismatch runs only feed the Version Mismatch ratio and the category counts; they never enter a position-level metric. */
export function aggregateRuns(label: string, results: CompareResult[]): AggregateResult {
  const detail = emptyDetail();
  const counts = zeroCounts();
  let vm = 0;
  let comparable = 0;
  let integrity: Tri = 'n/a';
  let anyFail = false;
  let allPass = true;
  for (const r of results) {
    for (const c of CATEGORIES) counts[c] += r.counts[c];
    if (r.verdict === 'version-mismatch') {
      vm++;
      continue;
    }
    comparable++;
    for (const k of Object.keys(detail) as (keyof Detail)[]) detail[k] += r.detail[k];
    integrity = integrity === false || r.metrics.sourceIntegrity === false ? false : true;
    if (r.metrics.businessParity === 'fail') anyFail = true;
    if (r.metrics.businessParity !== 'pass') allPass = false;
  }
  const parity: BusinessParity = anyFail ? 'fail' : comparable > 0 && allPass ? 'pass' : 'not-evaluated';
  const metrics = comparable === 0 ? naMetrics(vm, results.length, 'not-evaluated') : metricsOf(detail, integrity, parity, vm, results.length);
  const hardConditions: HardConditions = comparable === 0 ? { falseReplacementIsZero: 'n/a', sourceIntegrity: 'n/a', safeRejectionRateIs100: 'n/a', precisionIs100: 'n/a' } : hardConditionsOf(metrics);
  const verdict: Verdict = comparable === 0 ? (vm > 0 ? 'version-mismatch' : 'inconclusive') : verdictOf(hardConditions, parity);
  return { label, runs: results.length, comparableRuns: comparable, versionMismatchRuns: vm, counts, detail, metrics, hardConditions, verdict };
}

// ───────── node:* access without @types/node ─────────
const VM_MODULE: string = 'node:vm';
const FS_MODULE: string = 'node:fs';
const URL_MODULE: string = 'node:url';

export interface VmLike {
  createContext(sandbox: object): object;
  runInContext(code: string, context: object): unknown;
  runInNewContext(code: string): unknown;
  Script: new (code: string, options?: { filename?: string }) => { runInContext(context: object, options?: { timeout?: number }): unknown };
}
export interface FsLike {
  readFileSync(path: string, encoding: string): string;
  writeFileSync(path: string, data: string): void;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  existsSync(path: string): boolean;
}
interface UrlLike { fileURLToPath(url: URL): string }

export async function loadVm(): Promise<VmLike> {
  const m: VmLike = await import(/* @vite-ignore */ VM_MODULE);
  return m;
}
export async function loadFs(): Promise<FsLike> {
  const m: FsLike = await import(/* @vite-ignore */ FS_MODULE);
  return m;
}
export async function projectRoot(): Promise<string> {
  const u: UrlLike = await import(/* @vite-ignore */ URL_MODULE);
  const p = u.fileURLToPath(new URL('../../', import.meta.url)).split(BS).join('/');
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

export function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function locateCall(source: string, needle: string, nth = 0): { index: number; pos: CdpPosition } {
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = source.indexOf(needle, index + 1);
    if (index < 0) throw new Error('needle not found: ' + needle + ' #' + nth);
  }
  const before = source.slice(0, index).split(NL);
  return { index, pos: { lineNumber: before.length - 1, columnNumber: before[before.length - 1].length } };
}

/** Evaluate js after the whole source in a fresh node:vm context and return the completion value. */
export async function evalIn(source: string, js: string): Promise<unknown> {
  const vm = await loadVm();
  return vm.runInNewContext(source + NL + ';' + js);
}

/** Same口径 as scripts/verify-real-ob-sample.mjs: run in node:vm with a window and a document, compare __obResult and the title. */
export async function windowOutcome(source: string, filename: string): Promise<{ result: string; title: string }> {
  const vm = await loadVm();
  const win: Record<string, unknown> = {};
  const doc = { title: '' };
  const ctx = vm.createContext({ window: win, document: doc });
  new vm.Script(source, { filename }).runInContext(ctx, { timeout: 5000 });
  return { result: String(JSON.stringify(win['__obResult'])), title: doc.title };
}

// ───────── independent oracle reference (no OB-Recover analysis code) ─────────
export const ORACLE_REASONS = {
  'oracle-after-finish': 'top-level hex-named function called with literal arguments after the whole script finished in node:vm; the result is a string',
  'inside-rotation-iife': 'the call lies inside the string-array rotation IIFE: its value depends on the rotation phase, so it is not safely replaceable',
} as const;

/** Hex-named function declarations that are nested inside another function are NOT decoder candidates. */
export interface OracleReference { sites: ReferenceSite[]; rotationRange: [number, number] | null; topLevelHexFunctions: string[]; callableHexFunctions: string[]; nestedHexFunctionsExcluded: string[] }

const HEX_NAME = /^_0x[0-9a-f]+$/;

function walk(node: unknown, visit: (n: t.Node) => void): void {
  if (Array.isArray(node)) {
    for (const c of node) walk(c, visit);
    return;
  }
  if (node && typeof node === 'object' && typeof (node as { type?: unknown }).type === 'string') {
    visit(node as t.Node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      walk((node as Record<string, unknown>)[k], visit);
    }
  }
}

function literalArg(a: t.Node): LiteralParse {
  if (t.isNumericLiteral(a) || t.isStringLiteral(a)) return { ok: true, value: a.value };
  if (t.isUnaryExpression(a) && (a.operator === '-' || a.operator === '+') && t.isNumericLiteral(a.argument)) return { ok: true, value: a.operator === '-' ? -a.argument.value : a.argument.value };
  return { ok: false };
}

/**
 * Build the reference for an OB-style sample whose decoder wrappers are hex named (javascript-obfuscator identifierNamesGenerator=hexadecimal).
 * A call site is certified (determinate) only when: hex-named callee that is a top-level function declaration, all arguments literal, the site is outside the rotation IIFE,
 * and the real call after the whole script finished returns a string. Anything else that looks like a decoder call is declared not certifiable (determinate=false).
 */
export async function buildOracleReference(source: string): Promise<OracleReference> {
  const vm = await loadVm();
  const ast = parse(source, { sourceType: 'script', allowReturnOutsideFunction: true });
  const ctx = vm.createContext({ window: {}, document: { title: '' } });
  new vm.Script(source, { filename: 'oracle.js' }).runInContext(ctx, { timeout: 5000 });
  const g = ctx as Record<string, unknown>;

  let rotationRange: [number, number] | null = null;
  for (const st of ast.program.body) {
    if (st.start == null || st.end == null || !t.isExpressionStatement(st)) continue;
    const props = new Set<string>();
    walk(st, (n) => {
      if (t.isMemberExpression(n)) {
        const p = n.property;
        if (n.computed && t.isStringLiteral(p)) props.add(p.value);
        else if (!n.computed && t.isIdentifier(p)) props.add(p.name);
      }
    });
    if (props.has('push') && props.has('shift')) {
      rotationRange = [st.start, st.end];
      break;
    }
  }
  const rot = rotationRange;

  // Hex-named declarations at Program level. Declarations nested inside another function (javascript-obfuscator emits several inside a single `greet` wrapper)
  // are not top-level bindings, cannot be called from outside, and are therefore not decoder candidates at all: they are excluded from the reference instead of being
  // labelled indeterminate, otherwise the safe-rejection bucket would be inflated by an oracle limitation rather than by a real reason.
  const topLevelHexFunctions: string[] = [];
  const nestedHexFunctionsExcluded: string[] = [];
  for (const st of ast.program.body) {
    if (t.isFunctionDeclaration(st) && st.id && HEX_NAME.test(st.id.name)) topLevelHexFunctions.push(st.id.name);
  }
  for (const top of topLevelHexFunctions) {
    const decl = ast.program.body.find((st) => t.isFunctionDeclaration(st) && st.id && st.id.name === top);
    if (!decl || decl.start == null || decl.end == null) continue;
    walk(decl, (n) => {
      if (n === decl) return;
      if (!t.isFunctionDeclaration(n) || !n.id || !HEX_NAME.test(n.id.name)) return;
      if (topLevelHexFunctions.includes(n.id.name)) return;
      if (!nestedHexFunctionsExcluded.includes(n.id.name)) nestedHexFunctionsExcluded.push(n.id.name);
    });
  }
  const callableHexFunctions = topLevelHexFunctions.filter((n) => typeof g[n] === 'function');

  const sites: ReferenceSite[] = [];
  traverse(ast, {
    CallExpression(path) {
      const n = path.node;
      if (!t.isIdentifier(n.callee) || n.start == null || n.end == null || !n.loc) return;
      const name = n.callee.name;
      if (!HEX_NAME.test(name) || n.arguments.length === 0) return;
      const binding = path.scope.getBinding(name);
      if (!binding || !binding.path.isFunctionDeclaration()) return;
      for (const a of n.arguments) {
        if (!literalArg(a).ok) return;
      }
      const callText = source.slice(n.start, n.end);
      const position: CdpPosition = { lineNumber: n.loc.start.line - 1, columnNumber: n.loc.start.column };
      if (rot !== null && n.start >= rot[0] && n.end <= rot[1]) {
        sites.push({ position, callText, determinate: false, reason: 'inside-rotation-iife' });
        return;
      }
      const parent = binding.path.parentPath;
      const topLevel = parent !== null && parent.isProgram();
      // Not a top-level binding: not a decoder candidate this oracle can certify, so it is left out of the reference entirely.
      if (!topLevel || typeof g[name] !== 'function') return;
      let value: unknown;
      try {
        value = vm.runInContext(callText, ctx);
      } catch (e) {
        sites.push({ position, callText, determinate: false, reason: 'oracle-error: ' + (e instanceof Error ? e.message : String(e)) });
        return;
      }
      if (typeof value !== 'string') return;
      sites.push({ position, callText, determinate: true, value, reason: 'oracle-after-finish' });
    },
  });
  sites.sort((a, b) => a.position.lineNumber - b.position.lineNumber || a.position.columnNumber - b.position.columnNumber);
  return { sites, rotationRange, topLevelHexFunctions, callableHexFunctions, nestedHexFunctionsExcluded };
}

/**
 * SUPPLEMENTARY cross-configuration coverage view. It is NOT a run result and NOT the performance of any capture threshold.
 * Several runs (for example the high and the medium threshold) are made over the SAME reference positions and each keeps its own formal compare result.
 * This view only answers which runs restored each reference position. It deliberately has no verdict, no hardConditions, no identity block and no Precision, Recall
 * or Safe Rejection Rate, so it cannot be read as the outcome of one configuration. Runs are never summed: that would count every position once per run.
 */
export interface CoverageCell { runId: string; category: Category; rejectionCodes: string[]; note?: string }
export interface CoverageSite { position: CdpPosition; callText: string; referenceDeterminate: boolean; referenceValue?: Prim; referenceReason: string; perRun: CoverageCell[]; restoredBy: string[] }
export interface CoverageSummary {
  schema: string;
  kind: 'supplementary-cross-configuration-coverage';
  isRunResult: false;
  disclaimer: string;
  runIds: string[];
  excludedVersionMismatchRuns: string[];
  referencePositions: number;
  determinatePositions: number;
  indeterminatePositions: number;
  restoredByAtLeastOneRun: number;
  restoredByAllRuns: number;
  restoredByNoRun: number;
  determinateCoverage: Ratio;
  replacedIndeterminatePositionsInAnyRun: number;
  falseReplacementCountPerRun: Record<string, number>;
  sites: CoverageSite[];
}

export function coverageAcrossRuns(results: CompareResult[], referenceSites: ReferenceSite[]): CoverageSummary {
  const comparable = results.filter((r) => r.verdict !== 'version-mismatch');
  const excluded = results.filter((r) => r.verdict === 'version-mismatch').map((r) => r.runId);
  const sites: CoverageSite[] = [];
  const replacedIndeterminate = new Set<string>();
  for (const rs of referenceSites) {
    const k = keyOf(rs.position);
    const perRun: CoverageCell[] = [];
    for (const r of comparable) {
      const s = r.sites.find((x) => keyOf(x.position) === k);
      if (!s) throw new Error('run ' + r.runId + ' has no site for reference position ' + k + ': the runs do not share one reference set');
      perRun.push({ runId: r.runId, category: s.category, rejectionCodes: s.rejectionCodes, note: s.note });
      if (!rs.determinate && s.category === 'false-replacement') replacedIndeterminate.add(k);
    }
    sites.push({ position: rs.position, callText: rs.callText, referenceDeterminate: rs.determinate, referenceValue: rs.value, referenceReason: rs.reason, perRun, restoredBy: perRun.filter((c) => c.category === 'correct-replacement').map((c) => c.runId) });
  }
  sites.sort((a, b) => a.position.lineNumber - b.position.lineNumber || a.position.columnNumber - b.position.columnNumber);
  const determinate = sites.filter((s) => s.referenceDeterminate);
  const atLeastOne = determinate.filter((s) => s.restoredBy.length > 0).length;
  const falseReplacementCountPerRun: Record<string, number> = {};
  for (const r of comparable) falseReplacementCountPerRun[r.runId] = r.counts['false-replacement'];
  return {
    schema: 'ob-recover.real-site-coverage/1',
    kind: 'supplementary-cross-configuration-coverage',
    isRunResult: false,
    disclaimer: 'Supplementary coverage only. This is not the result of any capture threshold: the formal metrics, hard conditions and verdict of each configuration are in its own compare.json and in perRun of the summary.',
    runIds: comparable.map((r) => r.runId),
    excludedVersionMismatchRuns: excluded,
    referencePositions: sites.length,
    determinatePositions: determinate.length,
    indeterminatePositions: sites.length - determinate.length,
    restoredByAtLeastOneRun: atLeastOne,
    restoredByAllRuns: comparable.length > 0 ? determinate.filter((s) => s.restoredBy.length === comparable.length).length : 0,
    restoredByNoRun: determinate.length - atLeastOne,
    determinateCoverage: ratio(atLeastOne, determinate.length),
    replacedIndeterminatePositionsInAnyRun: replacedIndeterminate.size,
    falseReplacementCountPerRun,
    sites,
  };
}

// ───────── pipeline runner (existing code only) ─────────
export interface PipelineRun {
  report: ValidationReport;
  dry: DryRunResult;
  applies: { scriptId: string; apply: ApplyResult }[];
  applied: AppliedSite[];
  rejections: RejectionAt[];
  afterHashes: Record<string, string>;
}

function collectRejections(report: ValidationReport, dry: DryRunResult, applies: { apply: ApplyResult }[]): RejectionAt[] {
  const out: RejectionAt[] = [];
  const groupById = new Map(report.groups.map((g) => [g.id, g] as const));
  for (const r of dry.rejections) {
    const codes = r.reasons.map((x) => x.code);
    if (r.position) {
      out.push({ position: r.position, codes, stage: 'dry-run' });
      continue;
    }
    const grp = groupById.get(r.groupId);
    if (grp) for (const loc of grp.callLocations) out.push({ position: loc, codes, stage: 'dry-run' });
  }
  for (const a of applies) {
    for (const r of a.apply.rejected) {
      if (r.position.lineNumber >= 0) out.push({ position: r.position, codes: r.reasons.map((x) => x.code), stage: 'apply' });
    }
  }
  return out;
}

/**
 * validateCaptures -> dryRunReplacements -> applyVerifiedReplacements, exactly the production functions.
 * Scripts are frozen first so any attempt to mutate the original source object throws. Candidates are filtered per script before apply
 * (the panel passes the whole dry-run and the engine rejects foreign candidates by script-id-mismatch; the filter only removes that noise).
 */
export async function runPipeline(captures: DecoderCapture[], scripts: ValidationScript[]): Promise<PipelineRun> {
  for (const s of scripts) Object.freeze(s);
  const report = validateCaptures(captures, scripts);
  const dry = await dryRunReplacements(report, scripts);
  const applies: { scriptId: string; apply: ApplyResult }[] = [];
  for (const s of scripts) {
    const own: DryRunResult = { ...dry, candidates: dry.candidates.filter((c) => c.scriptId === s.scriptId) };
    applies.push({ scriptId: s.scriptId, apply: await applyVerifiedReplacements(own, s) });
  }
  const applied: AppliedSite[] = [];
  const seen = new Set<string>();
  for (const a of applies) {
    for (const r of a.apply.applied) {
      const k = keyOf(r.position) + '|' + r.replaced;
      if (seen.has(k)) continue;
      seen.add(k);
      applied.push({ position: r.position, original: r.original, replaced: r.replaced });
    }
  }
  const afterHashes: Record<string, string> = {};
  for (const s of scripts) afterHashes[s.scriptId] = await computeScriptHash(s.source);
  return { report, dry, applies, applied, rejections: collectRejections(report, dry, applies), afterHashes };
}

// ───────── persistence: reference/ and observed/ stay physically separate ─────────
export interface RunBundle {
  meta: Record<string, unknown>;
  script?: string;
  reference: Record<string, Record<string, unknown>>;
  observed: Record<string, Record<string, unknown>>;
  compare: CompareResult;
}

export async function persistRun(dir: string, bundle: RunBundle): Promise<void> {
  for (const [name, body] of Object.entries(bundle.reference)) {
    const by = body['capturedBy'];
    if (typeof by !== 'string' || by.startsWith('ob-recover')) throw new Error('reference/' + name + ': capturedBy must be a string that is not ob-recover (the reference is produced independently of OB-Recover)');
  }
  for (const [name, body] of Object.entries(bundle.observed)) {
    const by = body['capturedBy'];
    if (typeof by !== 'string' || !by.startsWith('ob-recover')) throw new Error('observed/' + name + ': capturedBy must start with ob-recover');
  }
  const fs = await loadFs();
  const text = (x: unknown): string => JSON.stringify(x, null, 2) + NL;
  const put = (rel: string, data: string, immutable = false): void => {
    const path = dir + '/' + rel;
    fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    if (fs.existsSync(path)) {
      const old = fs.readFileSync(path, 'utf8');
      if (old === data) return;
      if (immutable) throw new Error(rel + ' is archived and must not change (a different script is a new run)');
    }
    fs.writeFileSync(path, data);
  };
  put('meta.json', text(bundle.meta));
  if (bundle.script !== undefined) {
    put('script.js', bundle.script, true);
    put('script.sha256', (await computeScriptHash(bundle.script)) + NL, true);
  }
  for (const [name, body] of Object.entries(bundle.reference)) put('reference/' + name, text(body));
  for (const [name, body] of Object.entries(bundle.observed)) put('observed/' + name, text(body));
  put('compare.json', text(bundle.compare));
}

export async function writeJsonFile(path: string, body: unknown): Promise<void> {
  const fs = await loadFs();
  const data = JSON.stringify(body, null, 2) + NL;
  fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  if (fs.existsSync(path) && fs.readFileSync(path, 'utf8') === data) return;
  fs.writeFileSync(path, data);
}
