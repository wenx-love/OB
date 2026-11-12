import { describe, it, expect, beforeAll } from 'vitest';
import { drive } from './helpers/capture-driver.js';
import { computeScriptHash } from '../src/core/hash-utils.js';
import { CATEGORIES, NL, aggregateRuns, bytesOf, compareRun, evalIn, locateCall, persistRun, projectRoot, runPipeline, writeJsonFile, type BusinessParity, type CompareInput, type CompareResult, type PipelineRun, type Prim, type ReferenceSite } from './helpers/real-site-compare.js';

// Phase 4.7 L3: controlled scenarios. Real CaptureEngine + real node:vm execution + STUB CDP transport (synthetic Debugger.paused events, test/helpers/capture-driver.ts).
// So this is not real Chrome and not a CDP pause capture; the browser replay page is test-pages/real-site-l3-same-text.html (created, not executed in this batch).
// Reference = author annotation per call site, each cross-checked by an independent node:vm evaluation in this file (annotation truthfulness), never taken from OB-Recover output.
// Reference policy: a decoder whose result depends on program state (array rotation, hidden counter, outer mutable read, observable side effect) is indeterminate at all its sites.
// Pass/fail is decided on categories and hard conditions, not on specific rejection codes.

interface Annot { needle: string; nth: number; determinate: boolean; value?: Prim; reason: string }
interface Oracle { label: string; js: string; expect: unknown }
interface Expected { tp: number; un: number; sr: number }
interface Scenario { id: string; title: string; source: string; annots: Annot[]; oracle: Oracle[]; probe: string; expected: Expected }
interface ScenarioRun { sc: Scenario; pipeline: PipelineRun; input: CompareInput; result: CompareResult }

const j = (...lines: string[]): string => lines.join(NL);
const d = (needle: string, nth: number, value: Prim, reason: string): Annot => ({ needle, nth, determinate: true, value, reason });
const u = (needle: string, nth: number, reason: string): Annot => ({ needle, nth, determinate: false, reason });
const ARR5 = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const DEC = ['function dec(i) {', '  return _arr[i];', '}'];

const S0 = j(ARR5, ...DEC, 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');

const SCENARIOS: Scenario[] = [
  {
    id: 's0-positive-control',
    title: '稳定的纯解码函数，4 个调用点都被观测（正向对照）',
    source: S0,
    annots: [d('dec(0)', 0, 'alpha', 'pure decoder, observed'), d('dec(0)', 1, 'alpha', 'pure decoder, observed'), d('dec(1)', 0, 'beta', 'pure decoder, observed'), d('dec(1)', 1, 'beta', 'pure decoder, observed')],
    oracle: [],
    probe: 'run(); JSON.stringify([dec(0), dec(1)])',
    expected: { tp: 4, un: 0, sr: 0 },
  },
  {
    id: 's1-same-text-different-position',
    title: '同文本不同位置：只替换已观测位置；未观测位置和被遮蔽的同名函数必须保持原样',
    source: j(`var _arr = ['alpha', 'beta', 'gamma'];`, ...DEC, 'function run() {', '  dec(1);', '  dec(1);', '}', 'function later() {', '  return dec(1);', '}', 'function shadowed() {', '  function dec(i) {', `    return 'X' + i;`, '  }', '  return dec(1);', '}'),
    annots: [
      d('dec(1)', 0, 'beta', 'observed by run()'),
      d('dec(1)', 1, 'beta', 'observed by run()'),
      d('dec(1)', 2, 'beta', 'same global decoder but never executed by the entry function: determinate by oracle, unobserved'),
      u('dec(1)', 3, 'different binding: the inner dec returns X1, a literal beta would be wrong'),
    ],
    oracle: [{ label: 'unobserved site really evaluates to beta', js: 'later()', expect: 'beta' }, { label: 'shadowed site really evaluates to X1', js: 'shadowed()', expect: 'X1' }],
    probe: 'run(); JSON.stringify([later(), shadowed()])',
    expected: { tp: 2, un: 1, sr: 1 },
  },
  {
    id: 's2-array-rotation',
    title: '数组旋转：同参数在旋转前后返回不同值，整个函数的所有位置都不可确定',
    source: j(`var strings = ['hello', 'world', 'test'];`, 'function dec(i) {', '  return strings[i];', '}', 'function rotate() {', '  strings.push(strings.shift());', '}', 'function run() {', '  dec(1);', '  dec(1);', '  dec(0);', '  rotate();', '  dec(0);', '}'),
    annots: [u('dec(1)', 0, 'rotating-array-function'), u('dec(1)', 1, 'rotating-array-function'), u('dec(0)', 0, 'same args, different value after rotate()'), u('dec(0)', 1, 'same args, different value after rotate()')],
    oracle: [{ label: 'dec(0) before rotation', js: 'dec(0)', expect: 'hello' }, { label: 'dec(0) after rotation', js: 'rotate(); dec(0)', expect: 'world' }],
    probe: 'run(); JSON.stringify(strings)',
    expected: { tp: 0, un: 0, sr: 4 },
  },
  {
    id: 's3-same-args-different-returns',
    title: '同参数不同返回值（隐藏计数器）：不能被合并，不能替换',
    source: j('var counter = 0;', 'function dec(i) {', '  counter++;', `  return i + '_' + counter;`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}'),
    annots: [u('dec(0)', 0, 'hidden counter: first call 0_1'), u('dec(0)', 1, 'hidden counter: second call 0_2')],
    oracle: [{ label: 'two successive calls differ', js: '[dec(0), dec(0)].join()', expect: '0_1,0_2' }],
    probe: 'run(); String(counter)',
    expected: { tp: 0, un: 0, sr: 2 },
  },
  {
    id: 's4-state-dependent',
    title: '状态依赖（读取函数外部可变状态）：不可确定',
    source: j(`var _arr = ['a', 'b', 'c'];`, 'var offset = 0;', 'function dec(i) {', '  return _arr[i + offset];', '}', 'function setOffset(n) {', '  offset = n;', '}', 'function run() {', '  dec(0);', '  dec(0);', '  setOffset(1);', '  dec(0);', '}'),
    annots: [u('dec(0)', 0, 'reads outer mutable offset'), u('dec(0)', 1, 'reads outer mutable offset'), u('dec(0)', 2, 'reads outer mutable offset, value changed')],
    oracle: [{ label: 'dec(0) before offset change', js: 'dec(0)', expect: 'a' }, { label: 'dec(0) after offset change', js: 'setOffset(1); dec(0)', expect: 'b' }],
    probe: 'run(); String(offset)',
    expected: { tp: 0, un: 0, sr: 3 },
  },
  {
    id: 's5-side-effect-decoder',
    title: '带副作用的解码函数（lookups++ 被 report() 观察到）：替换会改变业务可见状态，不可替换',
    source: j(`var _arr = ['alpha', 'beta'];`, 'var lookups = 0;', 'function dec(i) {', '  lookups++;', '  return _arr[i];', '}', 'function report() {', '  return lookups;', '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}'),
    annots: [u('dec(0)', 0, 'observable side effect'), u('dec(0)', 1, 'observable side effect'), u('dec(1)', 0, 'observable side effect'), u('dec(1)', 1, 'observable side effect')],
    oracle: [{ label: 'no call, no side effect', js: 'report()', expect: 0 }, { label: 'one call changes observable state', js: 'dec(0); report()', expect: 1 }],
    probe: 'run(); String(report())',
    expected: { tp: 0, un: 0, sr: 4 },
  },
];

const V1 = S0;
const V2 = j(`var _arr = ['epsilon', 'delta', 'gamma', 'beta', 'alpha'];`, ...DEC, 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');

function referenceOf(sc: { source: string; annots: Annot[] }): ReferenceSite[] {
  return sc.annots.map((a) => ({ position: locateCall(sc.source, a.needle, a.nth).pos, callText: a.needle, determinate: a.determinate, value: a.value, reason: a.reason }));
}

const REFERENCE_PROV = { capturedBy: 'test-oracle', method: 'author-annotated truth, each annotation cross-checked by independent node:vm evaluation (oracle checks in test/real-site-l3.test.ts)', note: 'independent of OB-Recover output' };
const OBSERVED_PROV = { capturedBy: 'ob-recover', method: 'real CaptureEngine + real node:vm execution + stub CDP transport (synthetic Debugger.paused events, test/helpers/capture-driver.ts)', note: 'not real Chrome and not a CDP pause capture' };

let root = '';
const runs = new Map<string, ScenarioRun>();
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

async function runScenario(sc: Scenario): Promise<ScenarioRun> {
  const drv = await drive(sc.source, { wrap: ['dec'] });
  const pipeline = await runPipeline(drv.captures, [drv.script]);
  const sha = await computeScriptHash(sc.source);
  let parity: BusinessParity = 'not-evaluated';
  if (pipeline.applied.length > 0) {
    const base = JSON.stringify(await evalIn(sc.source, sc.probe));
    parity = 'pass';
    for (const a of pipeline.applies) {
      if (JSON.stringify(await evalIn(a.apply.code, sc.probe)) !== base) parity = 'fail';
    }
  }
  const input: CompareInput = {
    runId: 'run-001',
    sample: { id: sc.id, layer: 'L3', kind: 'controlled-replay', isRealSiteSample: false, title: sc.title },
    reference: REFERENCE_PROV,
    observed: OBSERVED_PROV,
    referenceSites: referenceOf(sc),
    identity: { referenceSha256: sha, observedSha256: await computeScriptHash(drv.script.source), afterApplySha256: pipeline.afterHashes[drv.script.scriptId], basis: 'the same source string is archived as script.js, executed by drive() and passed to the pipeline' },
    applied: pipeline.applied,
    rejections: pipeline.rejections,
    businessParity: parity,
  };
  const result = compareRun(input);
  await persistRun(root + '/test/fixtures/real-ob-sites/l3-controlled-scenarios/' + sc.id + '/run-001', {
    meta: { siteId: sc.id, runId: 'run-001', layer: 'L3', kind: 'controlled-replay', isRealSiteSample: false, url: null, sha256: sha, bytes: bytesOf(sc.source), fetchedAt: null, fetchedAtNote: 'synthetic script authored in test/real-site-l3.test.ts', capturedBy: 'n/a-synthetic', tooling: 'test/real-site-l3.test.ts', title: sc.title },
    script: sc.source,
    reference: { 'call-sites.json': { capturedBy: 'test-oracle', method: REFERENCE_PROV.method, note: REFERENCE_PROV.note, oracleChecks: sc.oracle, sites: input.referenceSites } },
    observed: { 'apply.json': { capturedBy: 'ob-recover', method: OBSERVED_PROV.method, note: OBSERVED_PROV.note, validation: pipeline.report.summary, dryRun: pipeline.dry.summary, applyStats: pipeline.applies.map((a) => ({ scriptId: a.scriptId, stats: a.apply.stats })), applied: pipeline.applied } },
    compare: result,
  });
  return { sc, pipeline, input, result };
}

const get = (id: string): ScenarioRun => {
  const r = runs.get(id);
  if (!r) throw new Error('scenario not run: ' + id);
  return r;
};

describe('L3 受控场景（真实 CaptureEngine + node:vm + 桩 CDP 传输层，不是真实 Chrome）', () => {
  beforeAll(async () => {
    root = await projectRoot();
    for (const sc of SCENARIOS) runs.set(sc.id, await runScenario(sc));
  }, 120000);

  for (const sc of SCENARIOS) {
    describe(sc.id + '：' + sc.title, () => {
      it('参考标注是真的：每个可确定位置的值都等于 node:vm 独立求值，附加 oracle 检查成立', async () => {
        for (const a of sc.annots.filter((x) => x.determinate)) expect(await evalIn(sc.source, a.needle)).toBe(a.value);
        for (const o of sc.oracle) expect(await evalIn(sc.source, o.js), o.label).toBe(o.expect);
      });

      it('五类计数与期望一致，错误替换 0，源码字节三处一致，还原前后业务探针一致，五类互斥且穷尽', () => {
        const { result } = get(sc.id);
        expect(result.counts).toEqual({ 'correct-replacement': sc.expected.tp, 'safe-rejection': sc.expected.sr, 'insufficient-evidence': sc.expected.un, 'version-mismatch': 0, 'false-replacement': 0 });
        expect(result.metrics.falseReplacement).toBe(0);
        expect(result.metrics.sourceIntegrity).toBe(true);
        expect(result.metrics.businessParity).not.toBe('fail');
        expect(result.exhaustive).toBe(true);
        expect(CATEGORIES.reduce((n, c) => n + result.counts[c], 0)).toBe(sc.annots.length);
      });
    });
  }

  describe('场景专项断言', () => {
    it('s1 同文本不同位置：run() 里的两处被替换，未观测的 later() 和被遮蔽的 shadowed() 里的同文本调用原样保留', () => {
      const { pipeline, result } = get('s1-same-text-different-position');
      const code = pipeline.applies[0].apply.code;
      expect(count(code, JSON.stringify('beta') + ';')).toBe(2);
      expect(count(code, 'return dec(1);')).toBe(2);
      expect(code.includes('return ' + JSON.stringify('beta'))).toBe(false);
      expect(result.sites.filter((s) => s.category === 'correct-replacement')).toHaveLength(2);
      expect(result.sites.filter((s) => s.category === 'insufficient-evidence')).toHaveLength(1);
      expect(result.sites.filter((s) => s.category === 'safe-rejection')).toHaveLength(1);
    });

    it('s2 数组旋转与 s3 同参数不同返回值：没有任何候选，源码不被修改', () => {
      for (const id of ['s2-array-rotation', 's3-same-args-different-returns']) {
        const { pipeline, input } = get(id);
        expect(pipeline.dry.candidates).toHaveLength(0);
        expect(pipeline.applied).toHaveLength(0);
        expect(pipeline.applies[0].apply.code).toBe(SCENARIOS.find((s) => s.id === id)?.source);
        expect(input.identity.afterApplySha256).toBe(input.identity.referenceSha256);
      }
    });

    it('s3 同参数的两条记录没有被合并：同一个参数组出现 2 个不同返回值并标记冲突', () => {
      const { pipeline } = get('s3-same-args-different-returns');
      const g = pipeline.report.groups.find((x) => x.arguments.length > 0 && x.arguments[0].value === 0);
      expect(g).toBeDefined();
      expect(g?.distinctReturns).toBe(2);
      expect(g?.conflict).toBe(true);
      expect(g?.status).not.toBe('verified');
    });

    it('s5 带副作用的解码函数：没有任何位置被替换（被替换就会让 report() 从 4 变成 0）', () => {
      const { pipeline, result } = get('s5-side-effect-decoder');
      expect(pipeline.applied).toHaveLength(0);
      expect(result.counts['safe-rejection']).toBe(4);
    });
  });

  describe('s6 动态下发的脚本：哈希不一致时不得做位置级对照', () => {
    it('参考来自 V1，OB-Recover 实际跑的是 V2：判 version-mismatch，所有位置级指标 n/a，没有任何观测侧结论', async () => {
      const drv = await drive(V2, { wrap: ['dec'] });
      const pipeline = await runPipeline(drv.captures, [drv.script]);
      expect(await computeScriptHash(V1)).not.toBe(await computeScriptHash(V2));
      const referenceSites = referenceOf({ source: V1, annots: SCENARIOS[0].annots });
      const base: CompareInput = {
        runId: 'run-001',
        sample: { id: 's6-dynamic-script', layer: 'L3', kind: 'controlled-replay', isRealSiteSample: false, title: 'reference archived from V1, observed run on V2' },
        reference: REFERENCE_PROV,
        observed: OBSERVED_PROV,
        referenceSites,
        identity: { referenceSha256: await computeScriptHash(V1), observedSha256: await computeScriptHash(drv.script.source), afterApplySha256: pipeline.afterHashes[drv.script.scriptId], basis: 'V1 archived as the reference script, V2 executed and recovered' },
        applied: pipeline.applied,
        rejections: pipeline.rejections,
        businessParity: 'not-evaluated',
      };
      const result = compareRun(base);
      expect(result.verdict).toBe('version-mismatch');
      expect(result.counts['version-mismatch']).toBe(4);
      expect(result.counts['correct-replacement'] + result.counts['false-replacement'] + result.counts['safe-rejection'] + result.counts['insufficient-evidence']).toBe(0);
      expect(result.metrics.precision).toBe('n/a');
      expect(result.metrics.recall).toBe('n/a');
      expect(result.metrics.falseReplacement).toBe('n/a');
      for (const s of result.sites) {
        expect(s.observedValue).toBeUndefined();
        expect(s.observedText).toBeUndefined();
      }
      expect(pipeline.applied.length).toBeGreaterThan(0);
      await persistRun(root + '/test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001', {
        meta: { siteId: 's6-dynamic-script', runId: 'run-001', layer: 'L3', kind: 'controlled-replay', isRealSiteSample: false, url: null, sha256: base.identity.referenceSha256, observedSha256: base.identity.observedSha256, bytes: bytesOf(V1), fetchedAt: null, fetchedAtNote: 'synthetic scripts authored in test/real-site-l3.test.ts', capturedBy: 'n/a-synthetic', tooling: 'test/real-site-l3.test.ts' },
        script: V1,
        reference: { 'call-sites.json': { capturedBy: 'test-oracle', method: REFERENCE_PROV.method, note: REFERENCE_PROV.note, sites: referenceSites } },
        observed: { 'apply.json': { capturedBy: 'ob-recover', method: OBSERVED_PROV.method, note: OBSERVED_PROV.note + '; the observed run used a different script version (V2) than the reference (V1)', applied: pipeline.applied } },
        compare: result,
      });
      runs.set('s6-dynamic-script', { sc: { id: 's6-dynamic-script', title: 'dynamic script', source: V1, annots: SCENARIOS[0].annots, oracle: [], probe: '', expected: { tp: 0, un: 0, sr: 0 } }, pipeline, input: base, result });
    });

    it('演示为什么必须先验哈希：假如强行把哈希当成一致，V2 的替换值与 V1 的参考值逐位置冲突，会被算成错误替换（仅演示，非有效结论）', async () => {
      const { pipeline, input } = get('s6-dynamic-script');
      const forced = compareRun({ ...input, identity: { ...input.identity, observedSha256: input.identity.referenceSha256, afterApplySha256: input.identity.referenceSha256, basis: 'FORCED same hash: invalid, demonstration only' } });
      expect(pipeline.applied.length).toBeGreaterThan(0);
      expect(forced.counts['false-replacement']).toBeGreaterThan(0);
      expect(forced.verdict).toBe('not-pass');
    });
  });

  describe('L3 汇总', () => {
    it('六个场景加动态脚本合并：误替换 0，源码完整，Precision 100%，Safe Rejection Rate 100%，版本不一致 1/7；写出 summary.json', async () => {
      const all: CompareResult[] = [...SCENARIOS.map((s) => get(s.id).result), get('s6-dynamic-script').result];
      const agg = aggregateRuns('l3-controlled-scenarios', all);
      expect(agg.runs).toBe(7);
      expect(agg.versionMismatchRuns).toBe(1);
      expect(agg.comparableRuns).toBe(6);
      expect(agg.metrics.falseReplacement).toBe(0);
      expect(agg.metrics.sourceIntegrity).toBe(true);
      expect(agg.metrics.precision).toBe(1);
      expect(agg.metrics.safeRejectionRate).toBe(1);
      expect(agg.metrics.versionMismatch.ratio as number).toBeCloseTo(1 / 7, 5);
      expect(agg.verdict).toBe('pass');
      await writeJsonFile(root + '/test/fixtures/real-ob-sites/l3-controlled-scenarios/summary.json', { schema: 'ob-recover.real-site-summary/2', layer: 'L3', isRealSiteSample: false, perScenario: all.map((r) => ({ scenario: r.sample.id, runId: r.runId, compareFile: 'test/fixtures/real-ob-sites/l3-controlled-scenarios/' + r.sample.id + '/' + r.runId + '/compare.json', identity: r.identity, counts: r.counts, detail: r.detail, metrics: r.metrics, hardConditions: r.hardConditions, verdict: r.verdict, exhaustive: r.exhaustive })), aggregateAcrossScenarios: agg, aggregateNote: 'the aggregate sums DIFFERENT scripts (one reference set per scenario), so no position is counted twice; the formal result of each scenario is its own entry in perScenario and its own compare.json, and the aggregate is not the performance of any single scenario', notes: ['L3 uses the real CaptureEngine over a stub CDP transport and real node:vm execution: it proves the comparison system and the pipeline on controlled scenarios only', 'it is not real Chrome evidence, it is not L1 evidence, and it does not make Phase 4.7 pass', 'the real Chrome replay of test-pages/real-site-l3-same-text.html was run separately: its own formal result is in l3-browser-replay/summary.json and is NOT part of this stub-transport aggregate'] });
    });
  });
});
