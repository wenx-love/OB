import { describe, it, expect } from 'vitest';
import { validateCaptures, getScriptAst } from '../src/core/capture-validation.js';
import { dryRunReplacements, type DryRunResult } from '../src/core/replacement-dryrun.js';
import { generateCode } from '../src/core/generator.js';
import { parseCode } from '../src/core/parser.js';
import { drive } from './helpers/capture-driver.js';

// Phase 3.2：AST 替换前的 dry-run 测试。
// 数据来源同 capture-validation.test.ts：真实 CaptureEngine + node:vm 真实执行。
// 标注「篡改」的用例会改动捕获记录，用来构造位置过期、参数错配等真实运行里难以稳定复现的情形。

const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);
const lit = (v: string): string => JSON.stringify(v);

async function dry(source: string, wrap: string[] = ['dec'], extra: Record<string, unknown> = {}, dopts: Record<string, unknown> = {}, vopts: Record<string, unknown> = {}) {
  const d = await drive(source, { wrap, ...extra } as any);
  const report = validateCaptures(d.captures, [d.script], vopts);
  const result = await dryRunReplacements(report, [d.script], dopts);
  return { d, report, result };
}
const allCodes = (r: DryRunResult): string[] => r.rejections.flatMap((x) => x.reasons.map((y) => y.code));
const firstCodes = (r: DryRunResult): (string | undefined)[] => r.rejections.map((x) => x.reasons[0]?.code);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) deepFreeze((o as any)[k]);
  }
  return o;
}

const STABLE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');

describe('verified 映射可以进入 dry-run', () => {
  it('每个已观测的调用点生成一个候选：节点类型、替换文本、位置、父节点都准确', async () => {
    const { d, result } = await dry(STABLE);
    expect(result.candidates.length).toBe(4);
    expect(result.rejections).toEqual([]);
    for (const c of result.candidates) {
      expect(c.before).toBe('CallExpression');
      expect(c.after).toBe('StringLiteral');
      expect(d.script.source.slice(c.start, c.end)).toBe(c.callText);
      expect(c.replacement).toBe(lit(String(c.value)));
      expect(c.parentType).toBe('ExpressionStatement');
      expect(c.observations).toBe(2);
      expect(c.textKeyConflicts).toEqual([]);
      expect(c.value).toBe(c.callText === 'dec(0)' ? 'alpha' : 'beta');
    }
    expect(result.summary.candidates).toBe(4);
    expect(result.summary.rejections).toBe(0);
  });

  it('dry-run 不修改捕获记录、脚本、AST 和源码，并且结果可重复', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const snapshot = JSON.stringify({ c: d.captures, s: d.script });
    const before = generateCode(parseCode(d.script.source));
    deepFreeze(d.captures);
    deepFreeze(d.script);
    const r1 = await dryRunReplacements(validateCaptures(d.captures, [d.script]), [d.script]);
    const cached = getScriptAst(d.script).ast;
    expect(cached).not.toBeNull();
    expect(generateCode(cached as any)).toBe(before);
    const r2 = await dryRunReplacements(validateCaptures(d.captures, [d.script]), [d.script]);
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r1));
    expect(JSON.stringify({ c: d.captures, s: d.script })).toBe(snapshot);
    expect(d.script.source).toBe(STABLE);
    expect(r1.candidates.length).toBeGreaterThan(0);
  });
});

describe('不稳定映射不能进入替换候选', () => {
  it('数组旋转：同参数不同值的组被拒绝；同函数里观测一致的组也因函数存疑被拒绝', async () => {
    const SRC = src(`var strings = ['hello', 'world', 'test'];`, 'function dec(i) {', '  return strings[i];', '}', 'function rotate() {', '  strings.push(strings.shift());', '}', 'function run() {', '  dec(1);', '  dec(1);', '  dec(0);', '  rotate();', '  dec(0);', '}');
    const { result } = await dry(SRC);
    expect(result.candidates).toEqual([]);
    expect(firstCodes(result).sort()).toEqual(['function-suspect', 'status-unstable']);
  });

  it('状态依赖、时间依赖、随机依赖：全部不进入候选', async () => {
    const state = src('var counter = 0;', 'function dec(i) {', '  counter++;', `  return i + '_' + counter;`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const time = src('function dec(i) {', `  return i + '_' + Date.now();`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const random = src('function dec(i) {', `  return i + '_' + Math.random();`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    for (const source of [state, time, random]) {
      const { result } = await dry(source);
      expect(result.candidates).toEqual([]);
      expect(firstCodes(result)).toEqual(['status-unstable']);
    }
  });

  it('多个解码器同时运行：只有稳定的那个进入候选', async () => {
    const SRC = src(ARR, 'var n = 0;', 'function decA(i) {', '  return _arr[i];', '}', 'function decB(i) {', '  n++;', '  return _arr[i] + n;', '}', 'function run() {', '  decA(0);', '  decA(0);', '  decB(1);', '  decB(1);', '}');
    const { result } = await dry(SRC, ['decA', 'decB']);
    expect(result.candidates.length).toBe(2);
    expect(result.candidates.every((c) => c.functionName === 'decA')).toBe(true);
    expect(result.rejections.length).toBe(1);
    expect(result.rejections[0].functionName).toBe('decB');
  });

  it('证据不足（只观测一次）不进入候选', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(2);', '}');
    const { result } = await dry(SRC, ['dec'], {}, {}, { allowSingleObservation: false });
    expect(result.candidates).toEqual([]);
    expect(firstCodes(result)).toEqual(['status-insufficient']);
  });

  it('脚本刷新后的旧记录不进入候选，新脚本的记录照常进入', async () => {
    const oldRun = await drive(STABLE, { wrap: ['dec'], scriptId: 's1' });
    const fresh = await drive(STABLE, { wrap: ['dec'], scriptId: 's2' });
    const report = validateCaptures([...oldRun.captures, ...fresh.captures], [fresh.script]);
    const result = await dryRunReplacements(report, [fresh.script]);
    expect(result.candidates.length).toBe(4);
    expect(result.candidates.every((c) => c.scriptId === 's2')).toBe(true);
    expect(result.rejections.length).toBe(2);
    expect(result.rejections.every((r) => r.scriptId === 's1' && r.status === 'failed')).toBe(true);
  });
});

describe('逐调用点安全检查', () => {
  it('参数是变量（dec(k)）：同一调用点在别的状态下参数可能不同 → 拒绝', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  var k = 1;', '  dec(k);', '  dec(k);', '}');
    const { report, result } = await dry(SRC);
    expect(report.groups[0].status).toBe('verified');
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['dynamic-arguments', 'dynamic-arguments']);
  });

  it('参数与调用点不匹配（记录绑错了调用点，位置是篡改的）→ 拒绝，且不会替换成别的值', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(1);', '  dec(1);', '  dec(2);', '  dec(2);', '}');
    const d = await drive(SRC, { wrap: ['dec'] });
    const two = d.captures.find((c) => (c.arguments[0] as any).value === 2) as any;
    const tampered = d.captures.map((c) => ((c.arguments[0] as any).value === 1 ? { ...c, callLocations: [two.callLocations[0]] } : c));
    const result = await dryRunReplacements(validateCaptures(tampered, [d.script]), [d.script]);
    expect(allCodes(result)).toContain('argument-mismatch');
    expect(result.candidates.every((c) => c.callText === 'dec(2)')).toBe(true);
    expect(result.candidates.every((c) => c.value === 'gamma')).toBe(true);
  });

  it('调用位置无法映射到 AST 节点（位置是篡改的）→ 拒绝并带上位置', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const tampered = d.captures.map((c) => ({ ...c, callLocations: [{ lineNumber: 0, columnNumber: 0 }] }));
    const result = await dryRunReplacements(validateCaptures(tampered, [d.script]), [d.script]);
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['call-site-not-found', 'call-site-not-found']);
    expect(result.rejections[0].position).toEqual({ lineNumber: 0, columnNumber: 0 });
  });

  it('同名函数遮蔽：只替换已观测的调用点，被遮蔽的同文本调用记入 textKeyConflicts，不会被选中', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function other() {', '  function dec(x) {', '    return x * 2;', '  }', '  return dec(1);', '}', 'function run() {', '  dec(1);', '  dec(1);', '  other();', '}');
    const { d, result } = await dry(SRC);
    expect(result.candidates.length).toBe(2);
    const shadowLine = d.script.source.split(NL).findIndex((l) => l.includes('return dec(1);'));
    for (const c of result.candidates) {
      expect(c.position.lineNumber).not.toBe(shadowLine);
      expect(c.textKeyConflicts.length).toBe(1);
      expect(c.textKeyConflicts[0].observed).toBe(false);
      expect(c.textKeyConflicts[0].sameBinding).toBe(false);
      expect(c.notes.map((n) => n.code)).toContain('text-keyed-replacement-unsafe');
    }
  });

  it('别名调用（alias 指向被捕获的函数）：不能确认两者等价 → 拒绝', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  var alias = dec;', '  alias(1);', '  alias(1);', '}');
    const { result } = await dry(SRC);
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['callee-name-mismatch', 'callee-name-mismatch']);
  });

  it('成员调用（obj.dec）：无法确认 obj 持有的就是被捕获的函数 → 拒绝', async () => {
    const SRC = src(ARR, 'var obj = {', '  dec: function (i) {', '    return _arr[i];', '  },', '};', 'function run() {', '  obj.dec(1);', '  obj.dec(1);', '}');
    const { report, result } = await dry(SRC, ['obj.dec']);
    expect(report.groups[0].status).toBe('verified');
    expect(result.candidates).toEqual([]);
    // 不同引擎版本对成员调用报告的位置可能是属性名或调用起点，两种都必须被拒绝
    expect(allCodes(result).every((c) => c === 'member-call-unverified' || c === 'callee-not-identifier')).toBe(true);
    expect(allCodes(result).length).toBe(2);
  });

  it('返回值不能安全表示为字面量（负数）→ 拒绝', async () => {
    const SRC = src('function dec(i) {', '  return -5 * (i + 1);', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { report, result } = await dry(SRC);
    expect(report.groups[0].status).toBe('verified');
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['unsupported-return-value']);
  });
});

describe('辅助函数副作用', () => {
  it('调用的辅助函数是纯的：通过，并记录已分析的辅助函数', async () => {
    const SRC = src(ARR, 'function pad(i) {', '  return i + 1;', '}', 'function dec(i) {', '  return _arr[pad(i)];', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { result } = await dry(SRC);
    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0].value).toBe('beta');
    expect(result.candidates[0].notes.map((n) => n.code)).toContain('helpers-analyzed');
  });

  it('辅助函数会写外部状态：解码函数自身验证通过，但 dry-run 拒绝', async () => {
    const SRC = src('var _log = [];', ARR, 'function note(x) {', '  _log.push(x);', '  return x;', '}', 'function dec(i) {', '  return _arr[note(i)];', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { report, result } = await dry(SRC);
    expect(report.groups[0].status).toBe('verified');
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['helper-side-effects']);
  });

  it('调用未声明的全局辅助函数：无法确认其副作用，默认拒绝；显式放宽后才放行', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[externalIndex(i)];', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const globals = { externalIndex: (i: number) => i };
    const strict = await dry(SRC, ['dec'], { globals });
    expect(strict.result.candidates).toEqual([]);
    expect(allCodes(strict.result)).toContain('unanalyzed-helper');
    const loose = await dry(SRC, ['dec'], { globals }, { rejectUnresolvedHelpers: false });
    expect(loose.result.candidates.length).toBe(2);
  });

  it('atob 这类纯内置函数不影响通过', async () => {
    const SRC = src(`var _b64 = ['aGVsbG8=', 'd29ybGQ='];`, 'function dec(i) {', '  return atob(_b64[i]);', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { result } = await dry(SRC);
    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0].value).toBe('hello');
  });
});

describe('其他安全拒绝分支', () => {
  it('内联脚本（有起始偏移）：运行时位置与源码位置的换算未验证 → 整组拒绝', async () => {
    const d = await drive(STABLE, { wrap: ['dec'] });
    const inline = { ...d.script, startLine: 5, startColumn: 0 };
    const report = validateCaptures(d.captures, [inline]);
    expect(report.groups.every((g) => g.status === 'verified')).toBe(true);
    const result = await dryRunReplacements(report, [inline]);
    expect(result.candidates).toEqual([]);
    expect(firstCodes(result)).toEqual(['script-offset', 'script-offset']);
  });

  it('函数在外部被重新赋值（dec 之后被覆盖为另一个函数）→ 拒绝', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'dec = function (i) {', `  return 'x' + i;`, '};', 'function run() {', '  dec(1);', '  dec(1);', '}');
    const { report, result } = await dry(SRC);
    expect(report.groups[0].status).toBe('verified');
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['binding-reassigned', 'binding-reassigned']);
  });

  it('调用传入的参数比形参多：多出的参数可能通过 arguments 读取 → 拒绝', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', `  dec(1, 'extra');`, `  dec(1, 'extra');`, '}');
    const { result } = await dry(SRC);
    expect(result.candidates).toEqual([]);
    expect(allCodes(result)).toEqual(['extra-arguments', 'extra-arguments']);
  });
});

describe('Phase 4 基础：scriptHash 字段', () => {
  const SIMPLE = `var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } function run() { dec(0); dec(0); }`;

  it('dry-run 为每个候选生成 scriptHash', async () => {
    const d = await drive(SIMPLE, { wrap: ['dec'] });
    const report = validateCaptures(d.captures, [d.script]);
    const result = await dryRunReplacements(report, [d.script]);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.scriptHash).toBeDefined();
      expect(typeof c.scriptHash).toBe('string');
      expect(c.scriptHash.length).toBe(64); // SHA-256 hex 长度
    }
  });

  it('相同源码生成相同哈希', async () => {
    const d1 = await drive(SIMPLE, { wrap: ['dec'], scriptId: 's1' });
    const d2 = await drive(SIMPLE, { wrap: ['dec'], scriptId: 's2' });
    const r1 = await dryRunReplacements(validateCaptures(d1.captures, [d1.script]), [d1.script]);
    const r2 = await dryRunReplacements(validateCaptures(d2.captures, [d2.script]), [d2.script]);
    expect(r1.candidates[0].scriptHash).toBe(r2.candidates[0].scriptHash);
  });

  it('不同源码生成不同哈希', async () => {
    const SRC1 = `var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } function run() { dec(0); }`;
    const SRC2 = `var _arr = ['x', 'y']; function dec(i) { return _arr[i]; } function run() { dec(0); }`;
    const d1 = await drive(SRC1, { wrap: ['dec'] });
    const d2 = await drive(SRC2, { wrap: ['dec'] });
    const r1 = await dryRunReplacements(validateCaptures(d1.captures, [d1.script]), [d1.script]);
    const r2 = await dryRunReplacements(validateCaptures(d2.captures, [d2.script]), [d2.script]);
    expect(r1.candidates[0].scriptHash).not.toBe(r2.candidates[0].scriptHash);
  });
});
