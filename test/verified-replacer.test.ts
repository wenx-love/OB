import { describe, it, expect, vi } from 'vitest';
import { applyVerifiedReplacements, type ApplyResult } from '../src/core/verified-replacer.js';
import type { DryRunResult, ReplacementCandidate } from '../src/core/replacement-dryrun.js';
import type { ValidationScript } from '../src/core/capture-validation.js';
import type { CdpPosition } from '../src/core/capture-plan.js';
import { computeScriptHash } from '../src/core/hash-utils.js';
import { parseCode } from '../src/core/parser.js';

// Phase 4.6：替换引擎（verified-replacer）安全约束测试。
// 候选全部由 makeCandidate 构造，字段与 ReplacementCandidate 的真实类型完全一致（不再使用不存在的 status / reasons / 对象形式的 rejections）。
// 偏移量一律由源码计算，不手数；断言替换后的完整源码，而不是只看没有抛异常。
// 「整体回滚」用例通过 vi.mock 让替换后的解析在遇到标记字符串时失败，其余解析全部委托给真实解析器。

const hoisted = vi.hoisted(() => ({ MARK: '__FORCE_PARSE_FAIL__' }));

vi.mock('../src/core/parser.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/parser.js')>();
  return {
    ...actual,
    parseCode: (...args: Parameters<typeof actual.parseCode>) => {
      if (String(args[0]).includes(hoisted.MARK)) throw new Error('forced parse failure');
      return actual.parseCode(...args);
    },
  };
});

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
const src = (...lines: string[]): string => lines.join(NL);
type Value = ReplacementCandidate['value'];

function makeScript(source: string, scriptId = 's1'): ValidationScript {
  return { scriptId, url: 'http://test/' + scriptId + '.js', source, startLine: 0, startColumn: 0 };
}

function locate(source: string, needle: string, nth = 0): { index: number; pos: CdpPosition } {
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = source.indexOf(needle, index + 1);
    if (index < 0) throw new Error('needle not found: ' + needle);
  }
  const before = source.slice(0, index).split(NL);
  return { index, pos: { lineNumber: before.length - 1, columnNumber: before[before.length - 1].length } };
}

function splice(source: string, index: number, length: number, text: string): string {
  return source.slice(0, index) + text + source.slice(index + length);
}

function literalAfter(value: Value): ReplacementCandidate['after'] {
  if (typeof value === 'string') return 'StringLiteral';
  if (typeof value === 'number') return 'NumericLiteral';
  if (typeof value === 'boolean') return 'BooleanLiteral';
  return 'NullLiteral';
}

async function makeCandidate(source: string, needle: string, nth: number, value: Value, over: Partial<ReplacementCandidate> = {}): Promise<ReplacementCandidate> {
  const at = locate(source, needle, nth);
  return {
    groupId: 'g1',
    functionName: 'dec',
    scriptId: 's1',
    scriptUrl: 'http://test/s1.js',
    scriptHash: await computeScriptHash(source),
    position: at.pos,
    start: at.index,
    end: at.index + needle.length,
    callText: needle,
    before: 'CallExpression',
    after: literalAfter(value),
    replacement: JSON.stringify(value),
    value,
    parentType: 'VariableDeclarator',
    observations: 2,
    notes: [],
    textKeyConflicts: [],
    callLocationsTruncated: false,
    ...over,
  };
}

function dryOf(candidates: ReplacementCandidate[]): DryRunResult {
  return { candidates, rejections: [], summary: { candidates: candidates.length, rejections: 0, byReason: {} } };
}

async function apply(source: string, candidates: ReplacementCandidate[], scriptId = 's1'): Promise<ApplyResult> {
  return applyVerifiedReplacements(dryOf(candidates), makeScript(source, scriptId));
}

const codesOf = (r: ApplyResult): string[] => r.rejected.map((x) => x.groupId + ':' + x.reasons.map((y) => y.code).join(','));

function parses(code: string): boolean {
  try {
    parseCode(code);
    return true;
  } catch {
    return false;
  }
}

const evalLiteral = (text: string): unknown => Function('return ' + text)();

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe('基础行为：断言替换后的完整源码', () => {
  it('空候选：原样返回源码，统计为 0', async () => {
    const source = 'var x = 1;';
    const result = await apply(source, []);
    expect(result.code).toBe(source);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.stats).toEqual({ total: 0, applied: 0, rejected: 0, byReason: {} });
  });

  it('单个候选：只替换调用表达式，其余字符一字不差', async () => {
    const source = src(`var _arr = ['hello'];`, 'function dec(i) { return _arr[i]; }', 'var out = dec(0);', 'console.log(out);');
    const at = locate(source, 'dec(0)');
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'hello')]);
    expect(result.code).toBe(splice(source, at.index, 6, `"hello"`));
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({ original: 'dec(0)', replaced: `"hello"`, start: at.index, end: at.index + 6 });
    expect(result.rejected).toEqual([]);
  });

  it('多个候选从后往前替换：前面的替换改变长度，不影响后面的偏移', async () => {
    const source = src('var a = dec(0);', 'var b = dec(1);', 'var c = dec(0);');
    const long = 'a-much-longer-replacement-value';
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, long, { groupId: 'g0' }),
      await makeCandidate(source, 'dec(1)', 0, 'b', { groupId: 'g1' }),
      await makeCandidate(source, 'dec(0)', 1, long, { groupId: 'g0' }),
    ]);
    expect(result.code).toBe(src(`var a = "${long}";`, `var b = "b";`, `var c = "${long}";`));
    const starts = result.applied.map((a) => a.start);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    expect(result.applied.map((a) => a.original)).toEqual(['dec(0)', 'dec(1)', 'dec(0)']);
  });
});

describe('callLocationsTruncated：只有明确为 false 才放行', () => {
  it('true：整个候选被拒绝，源码不变', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { callLocationsTruncated: true })]);
    expect(result.code).toBe(source);
    expect(result.applied).toEqual([]);
    expect(codesOf(result)).toEqual(['g1:call-locations-truncated']);
  });

  it('false：正常替换', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { callLocationsTruncated: false })]);
    expect(result.code).toBe(`var a = "A";`);
    expect(result.rejected).toEqual([]);
  });

  it('字段缺失（数据经过消息传递丢了字段）：按截断处理，拒绝', async () => {
    const source = 'var a = dec(0);';
    const c = await makeCandidate(source, 'dec(0)', 0, 'A');
    const loose: Partial<ReplacementCandidate> = c;
    delete loose.callLocationsTruncated;
    const result = await apply(source, [c]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:call-locations-truncated']);
  });

  it('同一组里只要有一个候选被标记截断，整组都拒绝；其他组不受影响', async () => {
    const source = src('var a = dec(0);', 'var b = dec(1);', 'var c = enc(2);');
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, 'A', { groupId: 'g-dec', callLocationsTruncated: true }),
      await makeCandidate(source, 'dec(1)', 0, 'B', { groupId: 'g-dec', callLocationsTruncated: false }),
      await makeCandidate(source, 'enc(2)', 0, 'C', { groupId: 'g-enc', functionName: 'enc' }),
    ]);
    expect(result.code).toBe(src('var a = dec(0);', 'var b = dec(1);', `var c = "C";`));
    expect(codesOf(result).sort()).toEqual(['g-dec:call-locations-truncated', 'g-dec:call-locations-truncated']);
    expect(result.applied.map((a) => a.groupId)).toEqual(['g-enc']);
  });

  it('JSON 往返（sandbox 消息传递）后字段仍然有效：false 放行，true 拒绝', async () => {
    const source = 'var a = dec(0);';
    const okDry: DryRunResult = JSON.parse(JSON.stringify(dryOf([await makeCandidate(source, 'dec(0)', 0, 'A')])));
    expect(okDry.candidates[0].callLocationsTruncated).toBe(false);
    expect((await applyVerifiedReplacements(okDry, makeScript(source))).code).toBe(`var a = "A";`);
    const badDry: DryRunResult = JSON.parse(JSON.stringify(dryOf([await makeCandidate(source, 'dec(0)', 0, 'A', { callLocationsTruncated: true })])));
    expect((await applyVerifiedReplacements(badDry, makeScript(source))).code).toBe(source);
  });
});

describe('脚本身份：scriptId 与 scriptHash 必须同时匹配', () => {
  it('scriptId 不匹配：拒绝', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { scriptId: 's2' })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:script-id-mismatch']);
  });

  it('scriptHash 不匹配（候选是在旧版源码上生成的）：拒绝', async () => {
    const original = 'var a = dec(0);';
    const modified = 'var a = dec(1);';
    const result = await apply(modified, [await makeCandidate(original, 'dec(0)', 0, 'A')]);
    expect(result.code).toBe(modified);
    expect(codesOf(result)).toEqual(['g1:script-version-mismatch']);
  });

  it('源码相同（哈希一致）但 scriptId 不同：仍然拒绝', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A')], 's2');
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:script-id-mismatch']);
  });
});

describe('区间：合法、不越界、互不冲突', () => {
  it('start >= end：拒绝', async () => {
    const source = 'var a = dec(0);';
    const at = locate(source, 'dec(0)');
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { end: at.index })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:invalid-interval']);
  });

  it('end 超出源码长度：拒绝', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { end: source.length + 50 })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:interval-out-of-range']);
  });

  it('部分重叠：两个候选都拒绝', async () => {
    const source = 'var x = f(dec(0), dec(1));';
    const a = locate(source, 'dec(0)');
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, 'A', { groupId: 'gA', end: a.index + 10 }),
      await makeCandidate(source, 'dec(1)', 0, 'B', { groupId: 'gB' }),
    ]);
    expect(result.code).toBe(source);
    expect(codesOf(result).sort()).toEqual(['gA:interval-overlapping', 'gB:interval-overlapping']);
  });

  it('包含式嵌套：外层与被它包含的每一个候选都拒绝，不能只拒绝相邻的一对', async () => {
    const source = 'var x = f(dec(0), dec(1));';
    const result = await apply(source, [
      await makeCandidate(source, 'f(dec(0), dec(1))', 0, 'A', { groupId: 'gA', functionName: 'f' }),
      await makeCandidate(source, 'dec(0)', 0, 'B', { groupId: 'gB' }),
      await makeCandidate(source, 'dec(1)', 0, 'C', { groupId: 'gC' }),
    ]);
    expect(result.code).toBe(source);
    expect(result.applied).toEqual([]);
    expect(codesOf(result).sort()).toEqual(['gA:interval-overlapping', 'gB:interval-overlapping', 'gC:interval-overlapping']);
  });

  it('完全相同的区间出现两次：都拒绝', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, 'A', { groupId: 'g1' }),
      await makeCandidate(source, 'dec(0)', 0, 'B', { groupId: 'g2' }),
    ]);
    expect(result.code).toBe(source);
    expect(codesOf(result).sort()).toEqual(['g1:interval-overlapping', 'g2:interval-overlapping']);
  });

  it('相邻但不重叠（中间隔一个逗号）：都替换', async () => {
    const source = 'var x = [dec(0),dec(1)];';
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, 'a', { groupId: 'g0' }),
      await makeCandidate(source, 'dec(1)', 0, 'b', { groupId: 'g1' }),
    ]);
    expect(result.code).toBe(`var x = ["a","b"];`);
    expect(result.rejected).toEqual([]);
  });
});

describe('源码、位置与 AST 必须互相一致', () => {
  it('callText 与源码切片不一致：拒绝', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { callText: 'dec(1)' })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:source-text-mismatch']);
  });

  it('end 被截短（callText 同步改成切片）：AST 节点范围对不上，拒绝，不能把 dec 替换成字符串', async () => {
    const source = 'var a = dec(0) + 1;';
    const at = locate(source, 'dec(0)');
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { end: at.index + 3, callText: 'dec' })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:ast-range-mismatch']);
  });

  it('position 指向另一个调用、start/end 指向第一个：拒绝', async () => {
    const source = src('var a = dec(0);', 'var b = dec(1);');
    const other = locate(source, 'dec(1)');
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { position: other.pos })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:ast-range-mismatch']);
  });

  it('position 不是任何调用表达式的起点：拒绝', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A', { position: locate(source, 'var a').pos })]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:ast-position-not-found']);
  });

  it('同一起点有多个调用表达式（dec(0).toString() 的内外两层）：无法唯一确定，保守拒绝', async () => {
    const source = 'var s = dec(0).toString();';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'A')]);
    expect(result.code).toBe(source);
    expect(codesOf(result)).toEqual(['g1:ast-position-ambiguous']);
  });
});

describe('字面量：只允许 string / boolean / null / 有限非负数字', () => {
  const strings: string[] = [
    `a'b`,
    `c"d`,
    'back' + BS + 'slash',
    'line1' + NL + 'line2',
    '你好，世界',
    'sep' + String.fromCharCode(0x2028) + 'x' + String.fromCharCode(0x2029),
    String.fromCodePoint(0x1f600),
    'tab' + String.fromCharCode(9) + 'end',
    '',
  ];
  for (const value of strings) {
    it('字符串往返一致，替换后仍可解析：' + JSON.stringify(value), async () => {
      const source = 'var out = dec(0);';
      const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, value)]);
      expect(result.applied).toHaveLength(1);
      expect(parses(result.code)).toBe(true);
      expect(result.code).toBe('var out = ' + result.applied[0].replaced + ';');
      expect(evalLiteral(result.applied[0].replaced)).toBe(value);
    });
  }

  const exact: [Value, string][] = [[42, '42'], [3.14, '3.14'], [0, '0'], [true, 'true'], [false, 'false'], [null, 'null']];
  for (const [value, text] of exact) {
    it('字面量文本精确：' + text, async () => {
      const source = 'var out = dec(0);';
      const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, value)]);
      expect(result.code).toBe('var out = ' + text + ';');
    });
  }

  const unsupported: number[] = [NaN, Infinity, -Infinity, -5, -0];
  const hazardSources = ['var r = 1 / dec(0);', 'var r = a-dec(0);'];
  for (const value of unsupported) {
    for (const source of hazardSources) {
      it('拒绝不是普通字面量的数字 ' + (Object.is(value, -0) ? '-0' : String(value)) + '：' + source, async () => {
        const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, value)]);
        expect(result.code).toBe(source);
        expect(result.applied).toEqual([]);
        expect(codesOf(result)).toEqual(['g1:unsupported-literal-value']);
      });
    }
  }

  it('数字、布尔、null 后面紧跟标识符字符（5in obj）会改变词法：拒绝；字符串不受影响；有空格时照常替换', async () => {
    const tight = 'var r = dec(0)in obj;';
    for (const value of [5, true, null]) {
      const result = await apply(tight, [await makeCandidate(tight, 'dec(0)', 0, value)]);
      expect(result.code).toBe(tight);
      expect(codesOf(result)).toEqual(['g1:token-boundary']);
    }
    const str = await apply(tight, [await makeCandidate(tight, 'dec(0)', 0, 'x')]);
    expect(str.code).toBe(`var r = "x"in obj;`);
    const spaced = 'var r = dec(0) in obj;';
    const num = await apply(spaced, [await makeCandidate(spaced, 'dec(0)', 0, 5)]);
    expect(num.code).toBe('var r = 5 in obj;');
  });

  it('整数字面量后紧跟 .（5.length）是语法错误：拒绝；字符串可以', async () => {
    const source = 'var n = dec(0).length;';
    const num = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 5)]);
    expect(num.code).toBe(source);
    expect(codesOf(num)).toEqual(['g1:numeric-member-access']);
    const str = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'abc')]);
    expect(str.code).toBe(`var n = "abc".length;`);
    expect(parses(str.code)).toBe(true);
  });
});

describe('原子性：候选级拒绝不留下半截修改，整体失败整体回滚', () => {
  it('其中一个候选被拒绝：只有被接受的那个被替换，被拒绝的原文保持不变', async () => {
    const source = src('var a = dec(0);', 'var b = 1 / dec(1);', 'var c = dec(2);');
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, 'A', { groupId: 'gA' }),
      await makeCandidate(source, 'dec(1)', 0, Infinity, { groupId: 'gB' }),
      await makeCandidate(source, 'dec(2)', 0, 'C', { groupId: 'gC' }),
    ]);
    expect(result.code).toBe(src(`var a = "A";`, 'var b = 1 / dec(1);', `var c = "C";`));
    expect(codesOf(result)).toEqual(['gB:unsupported-literal-value']);
    expect(result.applied.map((a) => a.groupId)).toEqual(['gA', 'gC']);
    expect(result.stats.applied).toBe(2);
    expect(result.stats.rejected).toBe(1);
  });

  it('整体回滚：替换后的源码无法解析 → 返回原始源码，所有候选都记为回滚，统计一致', async () => {
    const source = src('var a = dec(0);', 'var b = dec(1);');
    const result = await apply(source, [
      await makeCandidate(source, 'dec(0)', 0, 'fine', { groupId: 'g-ok' }),
      await makeCandidate(source, 'dec(1)', 0, 'bad' + hoisted.MARK, { groupId: 'g-bad' }),
    ]);
    expect(result.code).toBe(source);
    expect(result.applied).toEqual([]);
    expect(codesOf(result).sort()).toEqual(['g-bad:parse-failed-after-replacement', 'g-ok:parse-failed-after-replacement']);
    expect(result.stats.applied).toBe(0);
    expect(result.stats.rejected).toBe(result.rejected.length);
    expect(result.stats.byReason['parse-failed-after-replacement']).toBe(2);
  });

  it('回滚不留状态：同样的引擎随后处理合法输入仍然正常', async () => {
    const source = 'var a = dec(0);';
    const result = await apply(source, [await makeCandidate(source, 'dec(0)', 0, 'ok')]);
    expect(result.code).toBe(`var a = "ok";`);
  });
});

describe('只读性', () => {
  it('输入（候选、脚本、源码）调用前后完全不变，深度冻结的输入也能正常工作', async () => {
    const source = src('var a = dec(0);', 'var b = dec(1);');
    const script = deepFreeze(makeScript(source));
    const dry = deepFreeze(dryOf([await makeCandidate(source, 'dec(0)', 0, 'A'), await makeCandidate(source, 'dec(1)', 0, 'B', { groupId: 'g2' })]));
    const snapshot = JSON.stringify({ script, dry });
    const result = await applyVerifiedReplacements(dry, script);
    expect(result.applied).toHaveLength(2);
    expect(result.code).toBe(src(`var a = "A";`, `var b = "B";`));
    expect(JSON.stringify({ script, dry })).toBe(snapshot);
    expect(script.source).toBe(source);
  });
});
