import { describe, it, expect, beforeAll } from 'vitest';
import type { CdpPosition } from '../src/core/capture-plan.js';
import { computeScriptHash } from '../src/core/hash-utils.js';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { CATEGORIES, NL, bytesOf, compareRun, loadFs, loadVm, locateCall, persistRun, projectRoot, writeJsonFile, type AppliedSite, type BusinessParity, type CompareInput, type CompareResult, type ReferenceSite } from './helpers/real-site-compare.js';

// Phase 4.7 L3 browser replay: OFFLINE JUDGEMENT of the raw evidence collected by scripts/p47-l3-browser-replay.ts.
// Evidence source: real Chrome 155 (headless=new) + real DevTools frontend + real panel.html + real service worker + real chrome.debugger.
// Operation was programmatic (element.click and Runtime.evaluate), NOT manual mouse. This file starts no browser: it reads the raw evidence and the no-extension coverage control and judges them.
// Page: test-pages/real-site-l3-same-text.{html,js}, a NEW page. phase4-position-level-auto.js is untouched.
// Positions: A and C run while the page loads. B (laterB) and D (shadowD, which holds a shadowed function with the same name) are not run until window.__l3Truth() is called AFTER capture has stopped.
// Reference = author annotation, cross-checked by the page own window.__l3Truth() (evaluated in Chrome after capture stopped) and by an independent node:vm evaluation. It never comes from OB-Recover output.
// Observed = what the real engine recorded and what the real panel reported. Applied replacements are parsed from the panel own apply report text.
// Not a real-site sample (isRealSiteSample=false), not L1 evidence, and it does not make Phase 4.7 pass.

const CALL = '_0x13d0(0x1)';
const SAMPLE_ID = 'l3-browser-same-text';
const RAW_FILE = 'test/acceptance/p47-l3-browser-replay.json';
const CONTROL_FILE = 'test/acceptance/p47-l3-coverage-control.json';
const DIAG_FILE = 'test/acceptance/p47-l3-decoder-count-diag.json';
const SHOT_FILE = 'test/acceptance/p47-l3-browser-replay-panel.png';
const PAGE_JS = 'test-pages/real-site-l3-same-text.js';
const PAGE_HTML = 'test-pages/real-site-l3-same-text.html';
const OUT_DIR = 'test/fixtures/real-ob-sites/l3-browser-replay';
const RUN_DIR = OUT_DIR + '/same-text/run-001';
const DIST_BASELINE: Record<string, string> = {
  'background.js': '8db17026db8f0493ac1bb7711bed47049874be29431f8e27d0b4ba3254c4a45e',
  'devtools.js': '870b0b747d5bfbe54af0fe8d81581f27bac8eb2a4ecea433f78f295c18edae65',
  'panel.js': '9cbc65a3bf78195d36bea0ea029df92c74c77ecd2a78ce4a8cc12fb68282fb73',
  'sandbox.js': '2df0c21289c5f8bfc6419f54d24e2fb2f99f9e4245acd71d6c4c52e7016f2be4',
};

interface Named { name: string; sha256: string; bytes: number }
interface Stats { breakpointsSet: number; hits: number; pauses: number; success: number; failed: number; forcedResumes: number; foreignPauses: number }
interface Engine { hook: boolean; active: boolean; breakpoints: number; stats: Stats; count: number }
interface RawCapture { functionName: string; scriptId: string; scriptUrl: string; arguments: { type: string; value: unknown }[]; returnValue: { type: string; value: unknown }; captureStatus: string; count: number; callLocations: CdpPosition[] }
interface SourceRead { ok: boolean; scriptId: string; chars: number; bytes: number; sha256: string; source: string }
interface Panes { orig: string[]; rec: string[] }
interface ApplyStep { label: string; result: { disabled: boolean; text: string }; panes: Panes }
interface Panel { status: string; hits: string; success: string; failed: string; verified: string; vUnstable: string; vFailed: string; vInsufficient: string; vPending: string; vTotal: string }
interface Raw {
  schema: string;
  isRealSiteSample: boolean;
  chrome: string;
  extensionId: string;
  minConfidence: string;
  pageUrl: string;
  captureScriptId: string;
  fatal?: string;
  pageFilesOnDisk: { html: Named; js: Named };
  distHashes: Record<string, string>;
  served: Named[];
  steps: {
    loadPage: { ready: { ready: boolean }; scripts: string[] };
    connect: string;
    startCapture: { panel: Panel; engine: Engine };
    captureReload: { ready: { ready: boolean }; stable: { stable: boolean; hits: number } };
    pageStateAtLoad: { title: string; l3Result: string; typeofLaterB: string; typeofShadowD: string };
    coverageAfterLoad: { matched: number; scripts: { url: string; functions: { functionName: string; ranges: { count: number }[] }[] }[] };
    engineRawAfterLoad: Engine & { captures: RawCapture[] };
    sourceBeforeApply: SourceRead;
    selectScript: { selection: { found: boolean; activeAfterClick: boolean; titles: string[] } };
    dryRun: { hidden: boolean; text: string };
    apply1: ApplyStep;
    apply2: ApplyStep;
    stopCapture: { panel: Panel; engine: Engine; pageResponsive: boolean };
    truthAfterStop: { truth: string; engineCountBefore: number; engineCountAfter: number; engineHitsBefore: number; engineHitsAfter: number; capturesAfter: RawCapture[] };
    sourceAfterApply: SourceRead;
    pageResourceAfterApply: { base64Encoded: boolean; bytes: number; sha256: string };
    panelScreenshot: { file: string; bytes: number; sha256: string };
  };
}
interface CtlFn { functionName: string; count: number | null }
interface CtlCov { matched: number; functions: CtlFn[] }
interface Control {
  fatal?: string;
  served: Named[];
  pageFilesOnDisk: { html: Named; js: Named };
  steps: {
    coverageAfterLoad: CtlCov;
    callLaterB: { value: string; coverage: CtlCov };
    callShadowD: { value: string; coverage: CtlCov };
    callDecoderTwice: { values: string[]; coverage: CtlCov };
  };
}
interface Truth { values: Record<string, string>; observedAtLoad: string[]; notExecutedAtLoad: string[] }
interface DryCand { from: string; to: string; position: CdpPosition; observed: number }
interface Pos { A: CdpPosition; B: CdpPosition; C: CdpPosition; D: CdpPosition }
interface Ctx {
  root: string;
  rawText: string;
  raw: Raw;
  control: Control;
  src: string;
  htmlSha: string;
  jsSha: string;
  pos: Pos;
  truth: Truth;
  refSites: ReferenceSite[];
  applied: AppliedSite[];
  dryCands: DryCand[];
  expectedRec: string[];
  recSource: string;
  base: { result: string; truth: string; title: string };
  rec: { result: string; truth: string; title: string };
  parity: BusinessParity;
  stepErrors: string[];
  input: CompareInput;
  result: CompareResult;
}

let ctx!: Ctx;

const norm = (l: string): string => (l === '' ? ' ' : l);
const flip = (h: string): string => h.slice(0, 63) + (h.endsWith('0') ? '1' : '0');

function posOfCall(source: string, needle: string, nth: number, prefixLen: number): CdpPosition {
  const p = locateCall(source, needle, nth).pos;
  return { lineNumber: p.lineNumber, columnNumber: p.columnNumber + prefixLen };
}

function stepErrorsOf(loose: unknown): string[] {
  const out: string[] = [];
  const steps = (loose as { steps?: Record<string, unknown> }).steps ?? {};
  for (const [k, v] of Object.entries(steps)) {
    if (v && typeof v === 'object' && 'error' in v) out.push(k);
  }
  return out;
}

function recoverLines(src: string, sites: CdpPosition[], text: string): string[] {
  const lines = src.split(NL);
  for (const p of sites) {
    const l = lines[p.lineNumber];
    if (l.slice(p.columnNumber, p.columnNumber + CALL.length) !== CALL) throw new Error('call text not found at ' + p.lineNumber + ':' + p.columnNumber);
    lines[p.lineNumber] = l.slice(0, p.columnNumber) + text + l.slice(p.columnNumber + CALL.length);
  }
  return lines;
}

function parseApplied(text: string): AppliedSite[] {
  const out: AppliedSite[] = [];
  const re = /^\s*(\d+):(\d+): (.*?) → (.*)$/gm;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    out.push({ position: { lineNumber: Number(m[1]) - 1, columnNumber: Number(m[2]) - 1 }, original: m[3], replaced: m[4].trim() });
    m = re.exec(text);
  }
  return out;
}

function parseDry(text: string): DryCand[] {
  const out: DryCand[] = [];
  const re = /可替换 (.*?) → (.*?)（(\d+):(\d+)，已观测 (\d+) 次）/g;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    out.push({ from: m[1], to: m[2], position: { lineNumber: Number(m[3]) - 1, columnNumber: Number(m[4]) - 1 }, observed: Number(m[5]) });
    m = re.exec(text);
  }
  return out;
}

async function runPage(source: string): Promise<{ result: string; truth: string; title: string }> {
  const vm = await loadVm();
  const win: Record<string, unknown> = {};
  const doc = { title: '' };
  const c = vm.createContext({ window: win, document: doc });
  new vm.Script(source, { filename: 'page.js' }).runInContext(c, { timeout: 5000 });
  const fn = win['__l3Truth'];
  if (typeof fn !== 'function') throw new Error('window.__l3Truth is not a function after running the page script');
  return { result: String(JSON.stringify(win['__l3Result'])), truth: String(fn()), title: doc.title };
}

const replayFns = (): { functionName: string; count: number | undefined }[] => ctx.raw.steps.coverageAfterLoad.scripts.flatMap((s) => s.functions.map((f) => ({ functionName: f.functionName, count: f.ranges[0]?.count })));
const cnt = (fns: { functionName: string; count?: number | null }[], name: string): number | null | undefined => fns.find((f) => f.functionName === name)?.count;

describe('L3 真实浏览器回放：同文本不同位置（真实 Chrome 155 + 真实扩展，程序化操作，不是手动鼠标）', () => {
  beforeAll(async () => {
    const root = await projectRoot();
    const fs = await loadFs();
    const rawText = fs.readFileSync(root + '/' + RAW_FILE, 'utf8');
    const loose: unknown = JSON.parse(rawText);
    const raw: Raw = JSON.parse(rawText);
    const control: Control = JSON.parse(fs.readFileSync(root + '/' + CONTROL_FILE, 'utf8'));
    const src = fs.readFileSync(root + '/' + PAGE_JS, 'utf8');
    const html = fs.readFileSync(root + '/' + PAGE_HTML, 'utf8');
    if (src.includes('\r')) throw new Error('page script contains CR: line based position checks would be wrong');
    const pos: Pos = {
      A: posOfCall(src, 'var siteA = ' + CALL + ';', 0, 'var siteA = '.length),
      C: posOfCall(src, 'var siteC = ' + CALL + ';', 0, 'var siteC = '.length),
      B: posOfCall(src, 'return ' + CALL + ';', 0, 'return '.length),
      D: posOfCall(src, 'return ' + CALL + ';', 1, 'return '.length),
    };
    const truth: Truth = JSON.parse(raw.steps.truthAfterStop.truth);
    const applied = parseApplied(raw.steps.apply1.result.text);
    const dryCands = parseDry(raw.steps.dryRun.text);
    const expectedRec = recoverLines(src, [pos.A, pos.C], JSON.stringify(truth.values.A));
    const recPane = raw.steps.apply1.panes.rec;
    const recSource = recPane.map((l, i) => (l === ' ' && expectedRec[i] === '' ? '' : l)).join(NL);
    const base = await runPage(src);
    const rec = await runPage(recSource);
    const parity: BusinessParity = base.result === rec.result && base.truth === rec.truth && base.title === rec.title ? 'pass' : 'fail';
    const jsSha = await computeScriptHash(src);
    const htmlSha = await computeScriptHash(html);
    const refSites: ReferenceSite[] = [
      { position: pos.A, callText: CALL, determinate: true, value: truth.values.A, reason: 'site A: top-level statement executed while the page loads; value from window.__l3Truth() evaluated in Chrome after capture stopped' },
      { position: pos.B, callText: CALL, determinate: true, value: truth.values.B, reason: 'site B: same global decoder and same call text inside laterB(), which does not run during the capture window; the value is determinate but no run observed it, so insufficient-evidence is the expected category' },
      { position: pos.C, callText: CALL, determinate: true, value: truth.values.C, reason: 'site C: top-level statement executed while the page loads; value from window.__l3Truth() evaluated in Chrome after capture stopped' },
      { position: pos.D, callText: CALL, determinate: false, reason: 'site D: same call text but a different binding, the shadowed function inside shadowD returns ' + truth.values.D + '; the value of the global decoder would be wrong here' },
    ];
    const observedSha = raw.steps.sourceBeforeApply.sha256;
    const afterSha = raw.steps.sourceAfterApply.sha256;
    const input: CompareInput = {
      runId: 'run-001',
      sample: { id: SAMPLE_ID, layer: 'L3', kind: 'controlled-browser-replay', isRealSiteSample: false, title: 'same call text at four positions (A, C run at load; B, D do not), real Chrome 155 + real extension, capture threshold ' + raw.minConfidence },
      reference: { capturedBy: 'test-oracle', method: 'author-annotated truth cross-checked by window.__l3Truth() evaluated in Chrome after capture stopped and by an independent node:vm evaluation (test/real-site-l3-browser.test.ts)', note: 'independent of OB-Recover output' },
      observed: { capturedBy: 'ob-recover', method: 'real Chrome 155 headless=new + real DevTools frontend + real panel + real service worker + real chrome.debugger; programmatic operation (element.click, Runtime.evaluate), NOT manual mouse; applied replacements parsed from the panel own apply report', note: 'raw evidence collected by scripts/p47-l3-browser-replay.ts and judged offline' },
      referenceSites: refSites,
      identity: { referenceSha256: jsSha, observedSha256: observedSha, afterApplySha256: afterSha, basis: 'reference = sha256 of the page script on disk read by this test; observed = source OB-Recover read from Chrome through its own debugger-get-source (CDP) before apply; afterApply = the same read after both apply clicks. activeScript.source of the panel is module private and cannot be read from outside: that it was not mutated is evidenced indirectly by the second apply passing the URL + source equality gate' },
      applied,
      rejections: [],
      businessParity: parity,
    };
    const result = compareRun(input);
    ctx = { root, rawText, raw, control, src, htmlSha, jsSha, pos, truth, refSites, applied, dryCands, expectedRec, recSource, base, rec, parity, stepErrors: stepErrorsOf(loose), input, result };

    await persistRun(root + '/' + RUN_DIR, {
      meta: { siteId: SAMPLE_ID, runId: 'run-001', layer: 'L3', kind: 'controlled-browser-replay', isRealSiteSample: false, url: raw.pageUrl, sha256: jsSha, bytes: bytesOf(src), fetchedAt: null, fetchedAtNote: 'local test page served byte for byte by the replay script', capturedBy: 'n/a-fixture-file', tooling: 'scripts/p47-l3-browser-replay.ts (raw evidence collector) + test/real-site-l3-browser.test.ts (offline judgement)', chrome: raw.chrome, extensionId: raw.extensionId, captureThreshold: raw.minConfidence, rawEvidenceFile: RAW_FILE, rawEvidenceSha256: await computeScriptHash(rawText), screenshotFile: SHOT_FILE, screenshotSha256: raw.steps.panelScreenshot.sha256 },
      script: src,
      reference: {
        'call-sites.json': { capturedBy: 'test-oracle', method: input.reference.method, note: input.reference.note, truthFromChrome: truth, sites: refSites },
        'coverage-control.json': { capturedBy: 'test-probe', method: 'same page and same Profiler.startPreciseCoverage / takePreciseCoverage calls as the replay run, but NO extension and NO debugger (scripts/p47-l3-coverage-control.ts)', note: 'calibration of the independent execution evidence; independent of OB-Recover', evidence: control },
      },
      observed: {
        'browser-raw.json': { capturedBy: 'ob-recover', method: input.observed.method, note: 'unmodified raw evidence of the real browser run', rawFile: RAW_FILE, evidence: raw },
        'apply.json': { capturedBy: 'ob-recover', method: input.observed.method, note: 'parsed from the panel own texts', dryRunText: raw.steps.dryRun.text, dryRunCandidates: dryCands, applyText: raw.steps.apply1.result.text, applied },
      },
      compare: result,
    });
  }, 120000);

  describe('取证来源与环境', () => {
    it('取证脚本没有 fatal，所有步骤无错误；真实 Chrome 155、32 位扩展 ID；不是真实网站样本', () => {
      expect(ctx.raw.fatal ?? null).toBeNull();
      expect(ctx.stepErrors).toEqual([]);
      expect(ctx.raw.schema).toBe('ob-recover.l3-browser-replay-raw/1');
      expect(ctx.raw.chrome).toContain('Chrome/155');
      expect(ctx.raw.extensionId).toHaveLength(32);
      expect(ctx.raw.isRealSiteSample).toBe(false);
    });

    it('回放使用的构建与第 1 步基线逐字节一致（dist 四个入口）', () => {
      for (const [f, h] of Object.entries(DIST_BASELINE)) expect(ctx.raw.distHashes[f], f).toBe(h);
    });

    it('页面文件：磁盘、取证时的记录、服务端实发三者一致；本测试现在读到的磁盘文件与取证时相同', () => {
      expect(ctx.jsSha).toBe(ctx.raw.pageFilesOnDisk.js.sha256);
      expect(ctx.htmlSha).toBe(ctx.raw.pageFilesOnDisk.html.sha256);
      expect(bytesOf(ctx.src)).toBe(ctx.raw.pageFilesOnDisk.js.bytes);
      expect(ctx.raw.served.length).toBeGreaterThanOrEqual(2);
      for (const s of ctx.raw.served) expect(s.sha256, s.name).toBe(s.name.endsWith('.js') ? ctx.jsSha : ctx.htmlSha);
    });

    it('面板截图存在，且取证记录里有它的哈希与大小', async () => {
      const fs = await loadFs();
      expect(fs.existsSync(ctx.root + '/' + SHOT_FILE)).toBe(true);
      expect(ctx.raw.steps.panelScreenshot.bytes).toBeGreaterThan(10000);
      expect(ctx.raw.steps.panelScreenshot.sha256).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('A、C 执行，B、D 未执行', () => {
    it('位置坐标：A=18:12，C=19:12（0 起算），面板按 1 起算显示 19:13 与 20:13；B、D 是另外两处 return 位置', () => {
      expect(ctx.pos.A).toEqual({ lineNumber: 18, columnNumber: 12 });
      expect(ctx.pos.C).toEqual({ lineNumber: 19, columnNumber: 12 });
      expect(ctx.pos.B.lineNumber).toBeGreaterThan(ctx.pos.C.lineNumber);
      expect(ctx.pos.D.lineNumber).toBeGreaterThan(ctx.pos.B.lineNumber);
    });

    it('页面加载期的结果只含 A 和 C；laterB 与 shadowD 此时只是函数，没有被调用', () => {
      const s = ctx.raw.steps.pageStateAtLoad;
      expect(s.title).toBe('l3-same-text-ready');
      expect(JSON.parse(s.l3Result)).toEqual({ A: 'Signature', C: 'Signature' });
      expect(s.typeofLaterB).toBe('function');
      expect(s.typeofShadowD).toBe('function');
    });

    it('独立覆盖率探针（探针自己的会话，没有 OB-Recover 代码）：加载后 laterB、shadowD、__l3Truth 为 0 次，rot 1 次，_0x13d0 至少 1 次', () => {
      expect(ctx.raw.steps.coverageAfterLoad.matched).toBe(1);
      const fns = replayFns();
      expect(cnt(fns, 'laterB')).toBe(0);
      expect(cnt(fns, 'shadowD')).toBe(0);
      expect(cnt(fns, 'window.__l3Truth')).toBe(0);
      expect(cnt(fns, 'rot')).toBe(1);
      expect(cnt(fns, '_0x13d0') ?? 0).toBeGreaterThanOrEqual(1);
    });

    it('探针校准（无扩展、无调试器的对照运行）：加载后 _0x13d0=2，B、D=0；真正调用 laterB 或 shadowD 时探针能看到 1 次（正向对照）；两次直接调用计 2', () => {
      const c = ctx.control;
      expect(c.fatal ?? null).toBeNull();
      expect(c.served.length).toBeGreaterThanOrEqual(2);
      for (const s of c.served) expect(s.sha256, s.name).toBe(s.name.endsWith('.js') ? ctx.jsSha : ctx.htmlSha);
      const a = c.steps.coverageAfterLoad;
      expect(a.matched).toBe(1);
      expect(cnt(a.functions, '_0x13d0')).toBe(2);
      expect(cnt(a.functions, 'laterB')).toBe(0);
      expect(cnt(a.functions, 'shadowD')).toBe(0);
      expect(cnt(a.functions, 'window.__l3Truth')).toBe(0);
      expect(c.steps.callLaterB.value).toBe('Signature');
      expect(cnt(c.steps.callLaterB.coverage.functions, 'laterB')).toBe(1);
      expect(c.steps.callShadowD.value).toBe('SHADOW-1');
      expect(cnt(c.steps.callShadowD.coverage.functions, 'shadowD')).toBe(1);
      expect(c.steps.callDecoderTwice.values).toEqual(['Signature', 'Signature']);
      expect(cnt(c.steps.callDecoderTwice.coverage.functions, '_0x13d0')).toBe(2);
    });

    it('已知差异（原因未查明，如实记录）：回放运行里探针对 _0x13d0 计 1 次，无扩展对照里计 2 次；所以探针读数只当作 B、D 执行与否的证据，不当作调用次数证据', () => {
      const replay = cnt(replayFns(), '_0x13d0');
      const control = cnt(ctx.control.steps.coverageAfterLoad.functions, '_0x13d0');
      expect(replay).not.toBe(control);
      expect(replay).toBe(1);
      expect(control).toBe(2);
    });

    it('OB-Recover 引擎只记录了 A、C：一条记录，调用位置恰为 18:12 与 19:12，没有 B、D 位置；命中 2 次', () => {
      const caps = ctx.raw.steps.engineRawAfterLoad.captures;
      expect(caps).toHaveLength(1);
      const c = caps[0];
      expect(c.functionName).toBe('_0x13d0');
      expect(c.scriptUrl.endsWith('/real-site-l3-same-text.js')).toBe(true);
      expect(c.scriptId).toBe(ctx.raw.captureScriptId);
      expect(c.arguments.map((a) => a.value)).toEqual([1]);
      expect(c.returnValue.value).toBe('Signature');
      expect(c.captureStatus).toBe('success');
      expect(c.count).toBe(2);
      expect(c.callLocations).toEqual([ctx.pos.A, ctx.pos.C]);
      expect(c.callLocations).not.toContainEqual(ctx.pos.B);
      expect(c.callLocations).not.toContainEqual(ctx.pos.D);
      expect(ctx.raw.steps.engineRawAfterLoad.stats.hits).toBe(2);
    });

    it('__l3Truth() 在停止捕获之后才调用：调用前引擎已停止（active=false，断点 0）；调用后引擎记录数与命中数不变', () => {
      const stop = ctx.raw.steps.stopCapture;
      expect(stop.engine.active).toBe(false);
      expect(stop.engine.breakpoints).toBe(0);
      expect(stop.pageResponsive).toBe(true);
      const t = ctx.raw.steps.truthAfterStop;
      expect(t.engineCountAfter).toBe(t.engineCountBefore);
      expect(t.engineHitsAfter).toBe(t.engineHitsBefore);
      expect(t.capturesAfter).toHaveLength(1);
    });

    it('浏览器给出的真值：A、B、C 都是 Signature，D 是 SHADOW-1（与全局解码器的值不同）；与独立 node:vm 求值逐字相同', () => {
      expect(ctx.truth.values).toEqual({ A: 'Signature', B: 'Signature', C: 'Signature', D: 'SHADOW-1' });
      expect(ctx.truth.observedAtLoad).toEqual(['A', 'C']);
      expect(ctx.truth.notExecutedAtLoad).toEqual(['B', 'D']);
      expect(ctx.base.truth).toBe(ctx.raw.steps.truthAfterStop.truth);
      expect(ctx.base.result).toBe(ctx.raw.steps.pageStateAtLoad.l3Result);
    });
  });

  describe('自动捕获', () => {
    it('由面板开始捕获启动：开始后断点 2、命中 0；加载后命中 2、成功 2、失败 0、强制恢复 0、外来暂停 0；面板已验证 1 组、无不稳定、无失败、无证据不足', () => {
      const s = ctx.raw.steps;
      expect(s.connect).toBe('已连接');
      expect(s.startCapture.engine.active).toBe(true);
      expect(s.startCapture.engine.breakpoints).toBe(2);
      expect(s.startCapture.engine.stats.hits).toBe(0);
      expect(s.captureReload.ready.ready).toBe(true);
      expect(s.captureReload.stable.stable).toBe(true);
      const st = s.engineRawAfterLoad.stats;
      expect(st.hits).toBe(2);
      expect(st.success).toBe(2);
      expect(st.failed).toBe(0);
      expect(st.forcedResumes).toBe(0);
      expect(st.foreignPauses).toBe(0);
      const p = s.stopCapture.panel;
      expect(p.verified).toBe('1');
      expect(p.vUnstable).toBe('0');
      expect(p.vFailed).toBe('0');
      expect(p.vInsufficient).toBe('0');
      expect(p.vPending).toBe('0');
    });
  });

  describe('位置级替换', () => {
    it('dry-run：候选恰为 A、C 两处（面板显示 19:13、20:13），每处已观测 2 次，拒绝 0 项；面板提示同文本无证据的调用必须按位置处理', () => {
      const text = ctx.raw.steps.dryRun.text;
      expect(ctx.dryCands.map((c) => c.position)).toEqual([ctx.pos.A, ctx.pos.C]);
      for (const c of ctx.dryCands) {
        expect(c.from).toBe(CALL);
        expect(c.to).toBe(JSON.stringify('Signature'));
        expect(c.observed).toBe(2);
      }
      expect(text).toContain('拒绝 0 项');
      expect(text).toContain('同文本');
      expect(text).toContain('按位置');
      expect(ctx.raw.steps.selectScript.selection.found).toBe(true);
    });

    it('应用：替换 2/2、拒绝 0；应用的位置恰为 A、C，并且恰等于引擎观测到的调用位置', () => {
      const text = ctx.raw.steps.apply1.result.text;
      expect(text).toContain('替换数量: 2 / 2');
      expect(text).toContain('拒绝数量: 0');
      expect(ctx.applied.map((a) => a.position)).toEqual([ctx.pos.A, ctx.pos.C]);
      expect(ctx.applied.map((a) => a.position)).toEqual(ctx.raw.steps.engineRawAfterLoad.captures[0].callLocations);
      for (const a of ctx.applied) {
        expect(a.original).toBe(CALL);
        expect(a.replaced).toBe(JSON.stringify('Signature'));
      }
      expect(ctx.applied).not.toContainEqual(expect.objectContaining({ position: ctx.pos.B }));
      expect(ctx.applied).not.toContainEqual(expect.objectContaining({ position: ctx.pos.D }));
    });

    it('还原面板逐行等于原文只在 A、C 两处换成字面量；B、D 所在行与原文完全相同，仍是 _0x13d0(0x1)', () => {
      const rec = ctx.raw.steps.apply1.panes.rec;
      const orig = ctx.src.split(NL);
      expect(rec).toHaveLength(ctx.expectedRec.length);
      for (let i = 0; i < rec.length; i++) expect(rec[i], 'line ' + (i + 1)).toBe(norm(ctx.expectedRec[i]));
      expect(rec[ctx.pos.B.lineNumber]).toBe(norm(orig[ctx.pos.B.lineNumber]));
      expect(rec[ctx.pos.D.lineNumber]).toBe(norm(orig[ctx.pos.D.lineNumber]));
      expect(rec.filter((l) => /^\s*return _0x13d0\(0x1\);$/.test(l))).toHaveLength(2);
      expect(rec.find((l) => l.includes('var siteA = '))).toBe('var siteA = ' + JSON.stringify('Signature') + ';');
      expect(rec.find((l) => l.includes('var siteC = '))).toBe('var siteC = ' + JSON.stringify('Signature') + ';');
    });

    it('原始面板没有被改：A、C 行仍是 _0x13d0(0x1)，两处 return _0x13d0(0x1) 仍在（原始面板是格式化副本，只做这种行级检查，不做字节比较）', () => {
      const orig = ctx.raw.steps.apply1.panes.orig;
      const a = orig.find((l) => l.includes('var siteA = '));
      const c = orig.find((l) => l.includes('var siteC = '));
      expect(a).toContain(CALL);
      expect(c).toContain(CALL);
      expect(a).not.toContain('Signature');
      expect(c).not.toContain('Signature');
      expect(orig.filter((l) => /^\s*return _0x13d0\(0x1\);$/.test(l))).toHaveLength(2);
    });

    it('还原后脚本与原脚本业务一致（node:vm：__l3Result、__l3Truth() 结果、title 全相同）', () => {
      expect(ctx.parity).toBe('pass');
      expect(ctx.rec.result).toBe(ctx.base.result);
      expect(ctx.rec.truth).toBe(ctx.base.truth);
      expect(ctx.rec.title).toBe(ctx.base.title);
    });

    it('第二次应用的结果文本与还原面板和第一次逐字相同（可重复）', () => {
      expect(ctx.raw.steps.apply2.result.text).toBe(ctx.raw.steps.apply1.result.text);
      expect(ctx.raw.steps.apply2.panes.rec).toEqual(ctx.raw.steps.apply1.panes.rec);
    });
  });

  describe('原始源码字节不变', () => {
    it('五处一致：磁盘文件、服务端实发、扩展经 CDP 在应用前读到的源码、应用后读到的源码、页面侧 Page.getResourceContent；并且两次读到的文本与磁盘文本逐字相等', () => {
      const s = ctx.raw.steps;
      expect(s.sourceBeforeApply.ok).toBe(true);
      expect(s.sourceAfterApply.ok).toBe(true);
      expect(s.sourceBeforeApply.scriptId).toBe(ctx.raw.captureScriptId);
      expect(s.sourceAfterApply.scriptId).toBe(ctx.raw.captureScriptId);
      for (const sha of [s.sourceBeforeApply.sha256, s.sourceAfterApply.sha256, s.pageResourceAfterApply.sha256]) expect(sha).toBe(ctx.jsSha);
      expect(s.sourceBeforeApply.source).toBe(ctx.src);
      expect(s.sourceAfterApply.source).toBe(ctx.src);
      expect(s.sourceBeforeApply.bytes).toBe(bytesOf(ctx.src));
      expect(s.sourceAfterApply.bytes).toBe(bytesOf(ctx.src));
      expect(s.pageResourceAfterApply.bytes).toBe(bytesOf(ctx.src));
      expect(s.pageResourceAfterApply.base64Encoded).toBe(false);
    });

    it('第二次点击应用仍通过 URL 加源码完全相等的闸门（若第一次应用改动了 activeScript.source，第二次会被拒绝而不做任何替换）', () => {
      expect(ctx.raw.steps.apply2.result.text).toContain('替换数量: 2 / 2');
      expect(ctx.raw.steps.apply2.result.text).not.toContain('不做任何替换');
    });
  });

  describe('截图里 Decoder 标签的数字 38（只读诊断 scripts/p47-l3-decoder-diag.ts：同一套真实 Chrome + 真实面板流程，另跑一次，不属于回放证据）', () => {
    type StageName = 'afterConnect' | 'afterStartCapture' | 'afterCaptureReload1' | 'afterCaptureReload2' | 'afterStop' | 'afterRefreshDiscovery';
    interface DiagStage { total: string; analyzed: string; candidates: string; cardCount: number; discoverLog: string[] }
    interface Diag { fatal?: string; chrome: string; stages: Record<StageName, DiagStage> }
    const names: StageName[] = ['afterConnect', 'afterStartCapture', 'afterCaptureReload1', 'afterCaptureReload2', 'afterStop', 'afterRefreshDiscovery'];
    const readDiag = async (): Promise<Diag> => {
      const fs = await loadFs();
      return JSON.parse(fs.readFileSync(ctx.root + '/' + DIAG_FILE, 'utf8'));
    };
    const pairs = (log: string[]): { url: string; candidates: number }[] => {
      const out: { url: string; candidates: number }[] = [];
      for (let i = 0; i + 1 < log.length; i++) {
        if (!log[i].startsWith('发现脚本 [') || !log[i + 1].startsWith('分析完成: ')) continue;
        out.push({ url: log[i].slice(log[i].indexOf(']: ') + 3), candidates: Number(log[i + 1].slice('分析完成: '.length).split(' ')[0]) });
      }
      return out;
    };
    const isPage = (url: string): boolean => url.endsWith('/real-site-l3-same-text.js');

    it('单次发现这个页面脚本只产出 2 个候选（_0x13d0 一个 high、一个 medium，同名但绑定不同）；面板日志里每次发现该脚本也都是 2 个', async () => {
      const r = discoverDecoders(ctx.src, 'offline', 'http://127.0.0.1/real-site-l3-same-text.js');
      expect(r.analyzed).toBe(true);
      expect(r.candidates.map((c) => c.name)).toEqual(['_0x13d0', '_0x13d0']);
      expect(r.candidates.map((c) => c.confidence).sort()).toEqual(['high', 'medium']);
      const diag = await readDiag();
      const mine = pairs(diag.stages.afterCaptureReload2.discoverLog).filter((p) => isPage(p.url));
      expect(mine).toHaveLength(3);
      for (const p of mine) expect(p.candidates).toBe(2);
    });

    it('Decoder 标签数字随页面加载累积：连接后 19，捕获中每刷新一次再加 19（38、57），停止和手动刷新发现后仍是 57；每次加载 = 页面脚本 2 + 一个来源未查明的内联脚本 17', async () => {
      const diag = await readDiag();
      expect(diag.fatal ?? null).toBeNull();
      expect(diag.chrome).toContain('Chrome/155');
      expect(names.map((n) => Number(diag.stages[n].candidates))).toEqual([19, 19, 38, 57, 57, 57]);
      expect(names.map((n) => Number(diag.stages[n].total))).toEqual([5, 5, 11, 17, 17, 17]);
      for (const n of names) {
        const s = diag.stages[n];
        expect(s.analyzed, n).toBe(s.total);
        expect(s.cardCount, n).toBe(Number(s.candidates));
        expect(pairs(s.discoverLog).reduce((sum, p) => sum + p.candidates, 0), n).toBe(Number(s.candidates));
      }
      const all = pairs(diag.stages.afterRefreshDiscovery.discoverLog);
      expect(all.filter((p) => isPage(p.url)).map((p) => p.candidates)).toEqual([2, 2, 2]);
      expect(all.filter((p) => !isPage(p.url) && p.candidates > 0).map((p) => p.candidates)).toEqual([17, 17, 17]);
    });
  });

  describe('对照结果 compare.json', () => {
    it('五类互斥且穷尽：正确替换 2（A、C）、证据不足 1（B）、安全拒绝 1（D）、误替换 0；Precision 1、Safe Rejection Rate 1、Recall 2/3、源码完整、业务一致，判通过', () => {
      const r = ctx.result;
      expect(r.counts).toEqual({ 'correct-replacement': 2, 'safe-rejection': 1, 'insufficient-evidence': 1, 'version-mismatch': 0, 'false-replacement': 0 });
      expect(r.exhaustive).toBe(true);
      expect(CATEGORIES.reduce((n, c) => n + r.counts[c], 0)).toBe(r.sites.length);
      expect(r.metrics.falseReplacement).toBe(0);
      expect(r.metrics.precision).toBe(1);
      expect(r.metrics.safeRejectionRate).toBe(1);
      expect(r.metrics.recall as number).toBeCloseTo(2 / 3, 5);
      expect(r.metrics.sourceIntegrity).toBe(true);
      expect(r.metrics.businessParity).toBe('pass');
      expect(r.hardConditions).toEqual({ falseReplacementIsZero: true, sourceIntegrity: true, safeRejectionRateIs100: true, precisionIs100: true });
      expect(r.verdict).toBe('pass');
      expect(r.identity.referenceSha256).toBe(r.identity.observedSha256);
      expect(r.identity.observedSha256).toBe(r.identity.afterApplySha256);
    });

    it('逐位置分类：B 因没有任何记录覆盖而是证据不足，D 因绑定不同而是安全拒绝', () => {
      const at = (p: CdpPosition) => ctx.result.sites.find((s) => s.position.lineNumber === p.lineNumber && s.position.columnNumber === p.columnNumber);
      expect(at(ctx.pos.A)?.category).toBe('correct-replacement');
      expect(at(ctx.pos.C)?.category).toBe('correct-replacement');
      expect(at(ctx.pos.B)?.category).toBe('insufficient-evidence');
      expect(at(ctx.pos.D)?.category).toBe('safe-rejection');
    });

    it('负向对照（真实回放数据上对照模块能发现问题）：在 D 上伪造替换、原始源码哈希被改、参考版本不一致', () => {
      const forged = compareRun({ ...ctx.input, applied: [...ctx.input.applied, { position: ctx.pos.D, original: CALL, replaced: JSON.stringify('Signature') }] });
      expect(forged.counts['false-replacement']).toBeGreaterThanOrEqual(1);
      expect(forged.hardConditions.falseReplacementIsZero).toBe(false);
      expect(forged.verdict).toBe('not-pass');
      const mutated = compareRun({ ...ctx.input, identity: { ...ctx.input.identity, afterApplySha256: flip(ctx.jsSha) } });
      expect(mutated.metrics.sourceIntegrity).toBe(false);
      expect(mutated.verdict).toBe('not-pass');
      const mismatch = compareRun({ ...ctx.input, identity: { ...ctx.input.identity, referenceSha256: flip(ctx.jsSha) } });
      expect(mismatch.verdict).toBe('version-mismatch');
      expect(mismatch.counts['version-mismatch']).toBe(4);
      expect(mismatch.metrics.precision).toBe('n/a');
    });

    it('可重复：同样的输入再比一次，结果逐字段相同；compare.json 已落盘并可回读，保留样本身份、来源、三处哈希和完整五类计数；写出 summary.json（含已知局限）', async () => {
      expect(compareRun(ctx.input)).toEqual(ctx.result);
      const fs = await loadFs();
      const back = JSON.parse(fs.readFileSync(ctx.root + '/' + RUN_DIR + '/compare.json', 'utf8'));
      expect(back).toEqual(JSON.parse(JSON.stringify(ctx.result)));
      expect(back.sample.id).toBe(SAMPLE_ID);
      expect(back.sample.isRealSiteSample).toBe(false);
      expect(back.provenance.reference.capturedBy).toBe('test-oracle');
      expect(back.provenance.observed.capturedBy).toBe('ob-recover');
      expect(back.identity.referenceSha256).toBe(ctx.jsSha);
      expect(Object.keys(back.counts).sort()).toEqual([...CATEGORIES].sort());
      const r = ctx.result;
      await writeJsonFile(ctx.root + '/' + OUT_DIR + '/summary.json', {
        schema: 'ob-recover.real-site-summary/2',
        layer: 'L3-browser-replay',
        sample: SAMPLE_ID,
        isRealSiteSample: false,
        formalPerConfiguration: [{ configuration: ctx.raw.minConfidence, runId: r.runId, compareFile: RUN_DIR + '/compare.json', provenance: r.provenance, identity: r.identity, counts: r.counts, detail: r.detail, metrics: r.metrics, hardConditions: r.hardConditions, verdict: r.verdict, exhaustive: r.exhaustive }],
        evidence: { rawFile: RAW_FILE, controlFile: CONTROL_FILE, screenshotFile: SHOT_FILE, decoderCountDiagFile: DIAG_FILE, failedControlRunArchive: 'test/acceptance/p47-l3-coverage-control.run1-ws-closed-no-data.json' },
        knownLimitations: [
          'operation was programmatic (element.click, Runtime.evaluate) in a real Chrome, NOT manual mouse operation',
          'Chrome ran headless=new with the real DevTools frontend, not as a headed window',
          'the independent coverage probe reports _0x13d0 count 1 in the replay run but 2 in the control run without the extension; the cause was not found, so probe counts are used only as executed or not executed evidence for B and D, never as call counts',
          'activeScript.source is private to the panel module: non-mutation is evidenced by the CDP source reads before and after apply, the page side resource hash, and the second apply passing the URL + source equality gate',
          'the original pane shows a formatted copy, so it is only checked line by line for the call text and never compared byte for byte',
          'one run on one fixed local page with the high confidence threshold; the first control run failed (websocket closed, cause unknown) and is archived, the second run is the one used',
          'the Decoder tab shows 38 in the replay screenshot: a read only diagnostic in a separate real Chrome run (p47-l3-decoder-count-diag.json) shows that candidates accumulate across page reloads while capture is active (19 per page load = 2 from this page script + 17 from an inline script whose origin was not identified, 38 after connect plus one reload, 57 after two reloads, still 57 after stop and a manual refresh); 38 is consistent with the replay sequence but the replay raw evidence has no Decoder pane readings, so it is inferred, not observed',
          'the accumulated Decoder candidate number is a display statistic and was not changed because src/ is frozen for this task: the apply step still resolved exactly one runtime script and replaced 2 of 2 while stale discovered scripts were retained',
        ],
        notes: ['it is not real-site evidence, it is not L1 evidence, and it does not make Phase 4.7 pass', 'the service worker recycle question stays still-undetermined and is not part of this run'],
      });
    });
  });
});
