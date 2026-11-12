import { describe, it, expect } from 'vitest';
import { validateCaptures, type GroupValidation, type ValidationOptions } from '../src/core/capture-validation.js';
import { dryRunReplacements } from '../src/core/replacement-dryrun.js';
import { drive, type DriveOptions } from './helpers/capture-driver.js';

// Phase 3.2 补充：单次观测验证策略。
// 数据来源同 capture-validation.test.ts：真实 CaptureEngine + 在 node:vm 里真实执行的脚本（见 helpers/capture-driver.ts）。
// 单次观测要进入 verified，必须同时确认全部严格静态条件；任何一项无法确认都是 insufficient。
// 可识别的时间、随机、状态依赖仍然是 unstable（不是 insufficient）。

const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);
const codes = (g: GroupValidation): string[] => g.reasons.map((r) => r.code);
const retOf = (g: GroupValidation): unknown => (g.returnSamples[0].value as any).value;

async function check(source: string, extra: Partial<DriveOptions> = {}, vopts: ValidationOptions = {}) {
  const d = await drive(source, { wrap: ['dec'], ...extra } as DriveOptions);
  const report = validateCaptures(d.captures, [d.script], vopts);
  return { d, report, g: report.groups[0] };
}

function expectRejected(g: GroupValidation, code: string): void {
  expect(g.status).toBe('insufficient');
  expect(g.evidence).toBe('none');
  expect(codes(g)).toContain('single-observation-rejected');
  expect(codes(g)).toContain(code);
}

const SAFE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(2);', '}');

describe('单次观测：严格静态条件全部满足 → verified，并在依据里明确标注', () => {
  it('稳定解码器只调用一次：verified，证据类型是 single-observation，依据带【单次观测】', async () => {
    const { g } = await check(SAFE);
    expect(g.status).toBe('verified');
    expect(g.evidence).toBe('single-observation');
    expect(g.observations).toBe(1);
    expect(g.conflict).toBe(false);
    expect(g.callLocations.length).toBe(1);
    expect(codes(g)).toEqual(['single-observation-verified']);
    expect(g.reasons[0].message).toContain('【单次观测】');
    expect(retOf(g)).toBe('gamma');
  });

  it('带索引偏移的解码器（对形参自身赋值）：verified', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  i = i - 0x100;', '  return _arr[i];', '}', 'function run() {', '  dec(0x102);', '}');
    const { g } = await check(SRC);
    expect(g.status).toBe('verified');
    expect(g.evidence).toBe('single-observation');
    expect(retOf(g)).toBe('gamma');
  });

  it('辅助函数是纯函数且能完整解析：verified，并记录已分析的辅助函数', async () => {
    const SRC = src(ARR, 'function pad(i) {', '  return i + 1;', '}', 'function dec(i) {', '  return _arr[pad(i)];', '}', 'function run() {', '  dec(0);', '}');
    const { g } = await check(SRC);
    expect(g.status).toBe('verified');
    expect(g.warnings.map((w) => w.code)).toContain('helpers-analyzed');
    expect(retOf(g)).toBe('beta');
  });

  it('atob 这类纯内置函数：verified', async () => {
    const SRC = src(`var _b64 = ['aGVsbG8=', 'd29ybGQ='];`, 'function dec(i) {', '  return atob(_b64[i]);', '}', 'function run() {', '  dec(1);', '}');
    const { g } = await check(SRC);
    expect(g.status).toBe('verified');
    expect(retOf(g)).toBe('world');
  });

  it('多次一致观测仍走原机制：证据类型是 multiple-observations', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(2);', '  dec(2);', '}');
    const { g } = await check(SRC);
    expect(g.status).toBe('verified');
    expect(g.evidence).toBe('multiple-observations');
    expect(codes(g)).toEqual(['consistent-observations']);
  });

  it('关闭单次观测（allowSingleObservation=false）后恢复旧行为：同样的安全样本是 insufficient，证据类型 none', async () => {
    const { g } = await check(SAFE, {}, { allowSingleObservation: false });
    expect(g.status).toBe('insufficient');
    expect(g.evidence).toBe('none');
    expect(codes(g)).toEqual(['too-few-observations']);
  });
});

describe('单次观测：任何一项无法确认 → insufficient（不是 verified）', () => {
  it('调用位置未知（栈上没有调用方帧）', async () => {
    const { g } = await check(SAFE, { omitCaller: true });
    expectRejected(g, 'single-obs:call-location');
  });

  it('调用位置对应的是别名调用，无法确认与解码函数等价', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  var alias = dec;', '  alias(1);', '}');
    const { g } = await check(SRC);
    expectRejected(g, 'single-obs:call-site');
  });

  it('脚本有起始偏移（内联脚本）：脚本身份无法确认', async () => {
    const d = await drive(SAFE, { wrap: ['dec'] });
    const report = validateCaptures(d.captures, [{ ...d.script, startLine: 3, startColumn: 0 }]);
    expectRejected(report.groups[0], 'single-obs:script-identity');
  });

  it('返回值不能表示为合法字面量（负数）', async () => {
    const SRC = src('function dec(i) {', '  return -5 * (i + 1);', '}', 'function run() {', '  dec(0);', '}');
    const { g } = await check(SRC);
    expectRejected(g, 'single-obs:return-not-literal');
  });

  it('函数读取的外部变量在函数外被修改（base++）', async () => {
    const SRC = src(ARR, 'var base = 0;', 'function dec(i) {', '  return _arr[i + base];', '}', 'function bump() {', '  base++;', '}', 'function run() {', '  dec(1);', '}');
    const { g } = await check(SRC);
    expectRejected(g, 'single-obs:outer-mutable-state');
  });

  it('函数读取的字符串数组在函数外被直接旋转（_arr.push(_arr.shift())）', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function rotate() {', '  _arr.push(_arr.shift());', '}', 'function run() {', '  dec(1);', '}');
    const { g } = await check(SRC);
    expectRejected(g, 'single-obs:outer-mutable-state');
  });

  it('辅助函数是条件赋值的变量，无法解析为函数声明', async () => {
    const SRC = src(ARR, 'var pick = Math.random() > 2 ? function (x) {', '  return x;', '} : function (x) {', '  return x + 1;', '};', 'function dec(i) {', '  return _arr[pick(i)];', '}', 'function run() {', '  dec(0);', '}');
    const { g } = await check(SRC);
    expectRejected(g, 'single-obs:helper-unresolved');
  });
});

describe('单次观测：可识别的依赖仍然是 unstable，不会变成 verified', () => {
  const CASES: [string, string][] = [
    ['时间依赖', src('function dec(i) {', `  return i + '_' + Date.now();`, '}', 'function run() {', '  dec(0);', '}')],
    ['随机依赖', src('function dec(i) {', `  return i + '_' + Math.random();`, '}', 'function run() {', '  dec(0);', '}')],
    ['状态依赖', src(ARR, 'var n = 0;', 'function dec(i) {', '  n++;', '  return _arr[i] + n;', '}', 'function run() {', '  dec(1);', '}')],
  ];
  for (const [name, source] of CASES) {
    it(`${name}：只观测一次也是 unstable`, async () => {
      const { g } = await check(source);
      expect(g.status).toBe('unstable');
      expect(g.evidence).toBe('none');
      expect(codes(g)).toEqual(['dependency-suspected']);
    });
  }
});

describe('单次观测与 dry-run', () => {
  it('单次观测 verified 的调用点能进入 dry-run 并生成候选', async () => {
    const { d, report } = await check(SAFE);
    const result = await dryRunReplacements(report, [d.script]);
    expect(result.rejections).toEqual([]);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].callText).toBe('dec(2)');
    expect(result.candidates[0].replacement).toBe('"gamma"');
    expect(result.candidates[0].observations).toBe(1);
  });

  it('无法解析的辅助函数（未声明的全局函数）：单次观测是 insufficient，dry-run 显式放宽 rejectUnresolvedHelpers 也不会放行', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[externalIndex(i)];', '}', 'function run() {', '  dec(0);', '}');
    const { d, report, g } = await check(SRC, { globals: { externalIndex: (i: number) => i } });
    expectRejected(g, 'single-obs:helper-unresolved');
    const result = await dryRunReplacements(report, [d.script], { rejectUnresolvedHelpers: false });
    expect(result.candidates).toEqual([]);
    expect(result.rejections[0].reasons[0].code).toBe('status-insufficient');
  });

  it('单次观测 verified，但调用点参数是变量：dry-run 仍然拒绝', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  var k = 2;', '  dec(k);', '}');
    const { d, report, g } = await check(SRC);
    expect(g.status).toBe('verified');
    expect(g.evidence).toBe('single-observation');
    const result = await dryRunReplacements(report, [d.script]);
    expect(result.candidates).toEqual([]);
    expect(result.rejections[0].reasons[0].code).toBe('dynamic-arguments');
  });

  it('同一函数的其他参数组出现冲突：即使这组单次观测 verified，dry-run 也整体拒绝（别名式旋转的间接保护）', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function rotate(a) {', '  a.push(a.shift());', '}', 'function run() {', '  dec(1);', '  dec(0);', '  rotate(_arr);', '  dec(0);', '}');
    const { d, report } = await check(SRC);
    const one = report.groups.find((x) => (x.arguments[0] as any).value === 1) as GroupValidation;
    const zero = report.groups.find((x) => (x.arguments[0] as any).value === 0) as GroupValidation;
    expect(one.status).toBe('verified');
    expect(one.evidence).toBe('single-observation');
    expect(one.functionSuspect).toBe(true);
    expect(zero.status).toBe('unstable');
    const result = await dryRunReplacements(report, [d.script]);
    expect(result.candidates).toEqual([]);
    expect(result.rejections.flatMap((r) => r.reasons.map((x) => x.code))).toContain('function-suspect');
  });
});
