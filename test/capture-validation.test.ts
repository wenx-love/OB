import { describe, it, expect } from 'vitest';
import { validateCaptures, type GroupValidation } from '../src/core/capture-validation.js';
import { drive } from './helpers/capture-driver.js';

// Phase 3.2：验证状态体系测试。
// 数据来源：真实 CaptureEngine + 在 node:vm 里真实执行的脚本（见 helpers/capture-driver.ts）。
// 个别用例会改动捕获记录来构造「真实运行里难以稳定复现」的情形，这些用例在注释里标明。

const ARR = `var _arr = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];`;
const NL = String.fromCharCode(10);
const src = (...lines: string[]): string => lines.join(NL);

const argOf = (g: GroupValidation): unknown => (g.arguments[0] as any).value;
const find = (groups: GroupValidation[], fn: string, arg: unknown): GroupValidation => {
  const g = groups.find((x) => x.functionName === fn && argOf(x) === arg);
  if (!g) throw new Error('group not found: ' + fn + '(' + String(arg) + ')');
  return g;
};
const codes = (g: GroupValidation): string[] => g.reasons.map((r) => r.code);
const retOf = (g: GroupValidation): unknown => (g.returnSamples[0].value as any).value;

async function validate(source: string, wrap: string[] = ['dec'], extra: Record<string, unknown> = {}, vopts: Record<string, unknown> = {}) {
  const d = await drive(source, { wrap, ...extra } as any);
  const report = validateCaptures(d.captures, [d.script], vopts);
  return { d, report };
}

describe('A. 稳定解码器', () => {
  const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');

  it('同参数始终同结果：每组都是 verified，样本、次数、调用位置完整', async () => {
    const { report } = await validate(SRC);
    expect(report.groups.length).toBe(2);
    for (const g of report.groups) {
      expect(g.status).toBe('verified');
      expect(g.observations).toBe(2);
      expect(g.distinctReturns).toBe(1);
      expect(g.conflict).toBe(false);
      expect(g.callLocations.length).toBe(2);
      expect(g.functionSuspect).toBe(false);
      expect(g.warnings).toEqual([]);
      expect(codes(g)).toEqual(['consistent-observations']);
    }
    expect(retOf(find(report.groups, 'dec', 0))).toBe('alpha');
    expect(retOf(find(report.groups, 'dec', 1))).toBe('beta');
    expect(report.summary.byStatus.verified).toBe(2);
    expect(report.summary.suspectFunctions).toBe(0);
  });

  it('捕获值来自真实执行，没有失败记录', async () => {
    const { d } = await validate(SRC);
    expect(d.captures.map((c) => (c.returnValue as any).value).sort()).toEqual(['alpha', 'beta']);
    expect(d.stats.success).toBe(4);
    expect(d.stats.failed).toBe(0);
  });
});

describe('B. 索引偏移解码', () => {
  const SRC = src(ARR, 'function dec(i) {', '  i = i - 0x100;', '  return _arr[i];', '}', 'function run() {', '  dec(0x100);', '  dec(0x100);', '  dec(0x102);', '  dec(0x102);', '}');

  it('对形参自身的赋值不算外部状态写入：verified', async () => {
    const { report } = await validate(SRC);
    expect(report.groups.length).toBe(2);
    const a = find(report.groups, 'dec', 256);
    const b = find(report.groups, 'dec', 258);
    expect(a.status).toBe('verified');
    expect(b.status).toBe('verified');
    expect(retOf(a)).toBe('alpha');
    expect(retOf(b)).toBe('gamma');
    expect(report.functions[0].suspect).toBe(false);
  });
});

describe('C. 数组旋转', () => {
  const SRC = src(
    `var strings = ['hello', 'world', 'test'];`,
    'function dec(i) {',
    '  return strings[i];',
    '}',
    'function rotate() {',
    '  strings.push(strings.shift());',
    '}',
    'function run() {',
    '  dec(1);',
    '  dec(1);',
    '  dec(0);',
    '  rotate();',
    '  dec(0);',
    '}',
  );

  it('旋转前后同参数不同返回值：unstable，所有值都保留', async () => {
    const { report } = await validate(SRC);
    const g = find(report.groups, 'dec', 0);
    expect(g.status).toBe('unstable');
    expect(g.conflict).toBe(true);
    expect(g.distinctReturns).toBe(2);
    expect(codes(g)).toContain('same-args-different-returns');
    expect(g.returnSamples.map((s) => (s.value as any).value)).toEqual(['hello', 'world']);
  });

  it('同一函数的其他参数组合：自身观测一致，但函数存疑，标记 functionSuspect', async () => {
    const { report } = await validate(SRC);
    const g = find(report.groups, 'dec', 1);
    expect(g.status).toBe('verified');
    expect(g.functionSuspect).toBe(true);
    expect(g.warnings.map((w) => w.code)).toContain('function-suspect');
    expect(report.functions.length).toBe(1);
    expect(report.functions[0].suspect).toBe(true);
    expect(report.functions[0].reasons.map((r) => r.code)).toContain('function-has-conflict');
  });
});

describe('D. 状态依赖', () => {
  it('每次调用修改外部计数器：同参数不同返回值 → unstable，并附静态线索', async () => {
    const SRC = src('var counter = 0;', 'function dec(i) {', '  counter++;', `  return i + '_' + counter;`, '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');
    const { report } = await validate(SRC);
    expect(report.groups.length).toBe(2);
    for (const g of report.groups) {
      expect(g.status).toBe('unstable');
      expect(codes(g)).toContain('same-args-different-returns');
      expect(codes(g)).toContain('hint:outer-state-write');
    }
  });

  it('观测值恰好一致，但函数会写外部状态：静态检查拦截，按 unstable 处理', async () => {
    const SRC = src('var hits = 0;', 'function dec(i) {', '  hits++;', `  return 'fixed' + i;`, '}', 'function run() {', '  dec(1);', '  dec(1);', '  dec(1);', '}');
    const { report } = await validate(SRC);
    const g = find(report.groups, 'dec', 1);
    expect(g.observations).toBe(3);
    expect(g.distinctReturns).toBe(1);
    expect(g.status).toBe('unstable');
    expect(codes(g)).toEqual(['dependency-suspected']);
  });
});

describe('E. 时间依赖', () => {
  it('返回值含 Date.now()：unstable（不管两次调用是否碰巧落在同一毫秒）', async () => {
    const SRC = src('function dec(i) {', `  return i + '_' + Date.now();`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { report } = await validate(SRC);
    const g = find(report.groups, 'dec', 0);
    expect(g.status).toBe('unstable');
    expect(codes(g).some((c) => c === 'hint:time-source' || c === 'dependency-suspected')).toBe(true);
    expect(report.functions[0].suspect).toBe(true);
  });
});

describe('F. 随机依赖', () => {
  it('返回值含 Math.random()：unstable', async () => {
    const SRC = src('function dec(i) {', `  return i + '_' + Math.random();`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { report } = await validate(SRC);
    const g = find(report.groups, 'dec', 0);
    expect(g.status).toBe('unstable');
    expect(codes(g).some((c) => c === 'hint:random-source' || c === 'dependency-suspected')).toBe(true);
  });
});

describe('G. 多个解码器同时运行', () => {
  it('稳定的和状态依赖的互不影响，按函数分别判定', async () => {
    const SRC = src(ARR, 'var n = 0;', 'function decA(i) {', '  return _arr[i];', '}', 'function decB(i) {', '  n++;', '  return _arr[i] + n;', '}', 'function run() {', '  decA(0);', '  decA(0);', '  decB(1);', '  decB(1);', '}');
    const { report } = await validate(SRC, ['decA', 'decB']);
    expect(find(report.groups, 'decA', 0).status).toBe('verified');
    expect(find(report.groups, 'decB', 1).status).toBe('unstable');
    expect(report.functions.length).toBe(2);
    expect(report.summary.suspectFunctions).toBe(1);
    expect(report.functions.find((f) => f.functionName === 'decA')?.suspect).toBe(false);
    expect(report.functions.find((f) => f.functionName === 'decB')?.suspect).toBe(true);
  });
});

describe('H. 不同参数相同返回值', () => {
  it('按参数分组，不会因为返回值相同而合并', async () => {
    const SRC = src(`function dec(i) {`, `  return ['same', 'same', 'other'][i];`, '}', 'function run() {', '  dec(0);', '  dec(0);', '  dec(1);', '  dec(1);', '}');
    const { d, report } = await validate(SRC);
    expect(d.captures.length).toBe(2);
    expect(report.groups.length).toBe(2);
    expect(new Set(report.groups.map((g) => g.id)).size).toBe(2);
    for (const g of report.groups) {
      expect(g.status).toBe('verified');
      expect(retOf(g)).toBe('same');
    }
  });
});

describe('重复捕获', () => {
  it('同一调用点循环 3 次：合并为一组，观测 3 次，位置只有一个', async () => {
    const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  for (var k = 0; k < 3; k++) {', '    dec(1);', '  }', '}');
    const { d, report } = await validate(SRC);
    expect(d.captures.length).toBe(1);
    expect(d.captures[0].count).toBe(3);
    expect(report.groups.length).toBe(1);
    const g = report.groups[0];
    expect(g.observations).toBe(3);
    expect(g.callLocations.length).toBe(1);
    expect(g.status).toBe('verified');
  });
});

describe('证据不足', () => {
  const ONE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(2);', '}');
  const TWICE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(1);', '  dec(1);', '}');

  it('关闭单次观测策略（allowSingleObservation=false）时，只观测一次：insufficient，不是 verified', async () => {
    const { report } = await validate(ONE, ['dec'], {}, { allowSingleObservation: false });
    const g = find(report.groups, 'dec', 2);
    expect(g.status).toBe('insufficient');
    expect(codes(g)).toEqual(['too-few-observations']);
  });

  it('捕获仍在进行：同样的证据标为 pending', async () => {
    const { report } = await validate(ONE, ['dec'], {}, { captureActive: true, allowSingleObservation: false });
    expect(find(report.groups, 'dec', 2).status).toBe('pending');
  });

  it('只有显式调低门槛 minObservations=1 才允许单次观测通过（默认门槛是 2）', async () => {
    const { report } = await validate(ONE, ['dec'], {}, { minObservations: 1 });
    expect(find(report.groups, 'dec', 2).status).toBe('verified');
  });

  it('调用位置未知（栈上没有调用方帧）：insufficient，原因是位置未知', async () => {
    const { d, report } = await validate(TWICE, ['dec'], { omitCaller: true });
    expect(d.captures[0].callLocations).toEqual([]);
    const g = find(report.groups, 'dec', 1);
    expect(g.status).toBe('insufficient');
    expect(codes(g)).toEqual(['call-location-unknown']);
  });

  it('成功与失败并存：insufficient（这条失败记录是篡改构造的）', async () => {
    const { d } = await validate(TWICE);
    const failed = { ...d.captures[0], key: 'tampered-failed', captureStatus: 'capture-failed' as const, returnValue: undefined, reason: 'could not read arguments', count: 1, firstSeq: 99, lastSeq: 99 };
    const report = validateCaptures([...d.captures, failed], [d.script]);
    const g = find(report.groups, 'dec', 1);
    expect(g.status).toBe('insufficient');
    expect(g.failedObservations).toBe(1);
    expect(codes(g)).toEqual(['mixed-success-and-failed']);
  });
});

describe('数据不完整 / 身份不符 → failed', () => {
  const TWICE = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(1);', '  dec(1);', '}');

  it('参数不完整：局部作用域读不到参数（引擎记录 missing）→ failed', async () => {
    const { d, report } = await validate(TWICE, ['dec'], { omitLocals: true });
    expect((d.captures[0].arguments[0] as any).type).toBe('missing');
    const g = report.groups[0];
    expect(g.status).toBe('failed');
    expect(codes(g)).toEqual(['argument-missing']);
  });

  it('返回值不完整：超长字符串被引擎截断 → failed', async () => {
    const SRC = src('function dec(i) {', `  return 'x'.repeat(3000) + i;`, '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { d, report } = await validate(SRC);
    expect((d.captures[0].returnValue as any).truncated).toBe(true);
    expect(find(report.groups, 'dec', 0).status).toBe('failed');
    expect(codes(find(report.groups, 'dec', 0))).toEqual(['return-truncated']);
  });

  it('返回值是对象：只有描述，无法验证 → failed', async () => {
    const SRC = src('function dec(i) {', '  return { v: i };', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');
    const { report } = await validate(SRC);
    expect(find(report.groups, 'dec', 0).status).toBe('failed');
    expect(codes(find(report.groups, 'dec', 0))).toEqual(['return-not-comparable']);
  });

  it('没有任何成功捕获 → failed（失败记录是篡改构造的）', async () => {
    const { d } = await validate(TWICE);
    const failed = { ...d.captures[0], key: 'tampered-failed', captureStatus: 'capture-failed' as const, returnValue: undefined, reason: 'entry breakpoint did not land inside the function body', count: 1 };
    const report = validateCaptures([failed], [d.script]);
    expect(report.groups[0].status).toBe('failed');
    expect(codes(report.groups[0])).toEqual(['capture-failed']);
  });

  it('记录里的函数名与源码该位置的函数不一致：可能捕获到外层或别的函数 → failed（函数名是篡改的）', async () => {
    const { d } = await validate(TWICE);
    const renamed = d.captures.map((c) => ({ ...c, functionName: 'outerWrapper' }));
    const report = validateCaptures(renamed, [d.script]);
    expect(report.groups[0].status).toBe('failed');
    expect(codes(report.groups[0])).toEqual(['function-identity-mismatch']);
  });
});

describe('脚本刷新与位置', () => {
  const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(0);', '  dec(0);', '}');

  it('脚本刷新后旧记录被隔离：旧 scriptId 不在当前脚本集合里 → failed(stale-script)，新记录不受影响', async () => {
    const oldRun = await drive(SRC, { wrap: ['dec'], scriptId: 's1' });
    const fresh = await drive(SRC, { wrap: ['dec'], scriptId: 's2' });
    const report = validateCaptures([...oldRun.captures, ...fresh.captures], [fresh.script]);
    expect(report.groups.length).toBe(2);
    const stale = report.groups.find((g) => g.scriptId === 's1');
    const live = report.groups.find((g) => g.scriptId === 's2');
    expect(stale?.status).toBe('failed');
    expect(stale ? codes(stale) : []).toEqual(['stale-script']);
    expect(live?.status).toBe('verified');
    expect(live?.observations).toBe(2);
  });

  it('同一 scriptId 但脚本内容变了（位置错位）：找不到入口位置对应的函数 → failed', async () => {
    const d = await drive(SRC, { wrap: ['dec'] });
    const shifted = { ...d.script, source: NL + NL + d.script.source };
    const report = validateCaptures(d.captures, [shifted]);
    expect(report.groups[0].status).toBe('failed');
    expect(codes(report.groups[0])).toEqual(['function-not-found']);
  });
});

describe('位置偏移与位置列表', () => {
  const SRC = src(ARR, 'function dec(i) {', '  return _arr[i];', '}', 'function run() {', '  dec(1);', '  dec(1);', '}');

  it('脚本有起始偏移（内联脚本）：状态仍按观测判定，但带 script-offset 提示', async () => {
    const d = await drive(SRC, { wrap: ['dec'] });
    const report = validateCaptures(d.captures, [{ ...d.script, startLine: 3, startColumn: 0 }]);
    expect(report.groups[0].status).toBe('verified');
    expect(report.groups[0].warnings.map((w) => w.code)).toContain('script-offset');
  });

  it('调用位置列表被引擎截断（记录被篡改成 truncated）：保留提示，不把已知位置当作全部调用点', async () => {
    const d = await drive(SRC, { wrap: ['dec'] });
    const tampered = d.captures.map((c) => ({ ...c, callLocationsTruncated: true }));
    const g = validateCaptures(tampered, [d.script]).groups[0];
    expect(g.callLocationsTruncated).toBe(true);
    expect(g.warnings.map((w) => w.code)).toContain('call-locations-truncated');
  });
});
