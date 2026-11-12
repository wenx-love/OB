import { describe, it, expect, afterEach } from 'vitest';
import { CaptureEngine, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import type { CapturePlan } from '../src/core/capture-plan.js';
import { shouldAutoCapture, selectTargets, DEFAULT_STRATEGY } from '../src/core/capture-strategy.js';
import { discoverDecoders } from '../src/core/decoder-discovery.js';

const plan: CapturePlan = {
  supported: true,
  entry: { lineNumber: 1, columnNumber: 0 },
  returns: [{ lineNumber: 4, columnNumber: 2 }],
  closing: { lineNumber: 5, columnNumber: 0 },
  paramNames: ['i'],
};
const target: CaptureTarget = { scriptId: 's1', scriptUrl: 'http://x/a.js', functionName: 'dec', plan };

const engines: CaptureEngine[] = [];
afterEach(() => {
  for (const e of engines) e.reset('cleanup');
  engines.length = 0;
});

function setup() {
  let n = 0;
  const state = { args: [{ name: 'i', value: { type: 'number', value: 256 } }] as any[] };
  const send = async (method: string) => {
    if (method === 'Debugger.setBreakpoint') return { breakpointId: 'bp' + (++n) };
    if (method === 'Runtime.getProperties') return { result: state.args };
    return {};
  };
  const engine = new CaptureEngine(send, () => {});
  engines.push(engine);
  return { engine, state };
}

function frame(name: string, extra: Record<string, unknown> = {}): any {
  return {
    functionName: name,
    location: { scriptId: 's1', lineNumber: 1, columnNumber: 0 },
    scopeChain: [{ type: 'local', object: { objectId: 'scope1' } }],
    ...extra,
  };
}
const stack = (top: any): any[] => [top, frame('runAll', { location: { scriptId: 's1', lineNumber: 54, columnNumber: 11 } })];

async function call(engine: CaptureEngine, state: { args: any[] }, arg: number, ret: unknown) {
  state.args = [{ name: 'i', value: { type: 'number', value: arg } }];
  await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
  await engine.onPaused({ callFrames: stack(frame('dec', { returnValue: ret })), hitBreakpoints: ['bp2'] });
}

const s = (v: string) => ({ type: 'string', value: v });

describe('stability analysis (getStability)', () => {
  it('same arguments with different return values are unstable and every value is kept', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 256, s('Alice'));
    await call(engine, state, 256, s('Bob'));
    await call(engine, state, 256, s('Alice'));
    const st = engine.getStability();
    expect(st.length).toBe(1);
    expect(st[0].stable).toBe(false);
    expect(st[0].distinctReturnCount).toBe(2);
    expect(st[0].callCount).toBe(3);
    expect(st[0].values).toEqual([s('Alice'), s('Bob')]);
    expect(st[0].firstSeq).toBe(1);
    expect(st[0].lastSeq).toBe(3);
    expect(engine.getCaptures().length).toBe(2);
  });

  it('the earlier result is never overwritten by a later one', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 256, s('first'));
    await call(engine, state, 256, s('second'));
    const rets = engine.getCaptures().map((c) => (c.returnValue as any).value).sort();
    expect(rets).toEqual(['first', 'second']);
  });

  it('same arguments with identical return values are stable', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 257, s('hello'));
    await call(engine, state, 257, s('hello'));
    const st = engine.getStability();
    expect(st.length).toBe(1);
    expect(st[0].stable).toBe(true);
    expect(st[0].distinctReturnCount).toBe(1);
    expect(st[0].callCount).toBe(2);
  });

  it('different arguments are analysed independently', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await call(engine, state, 256, s('a'));
    await call(engine, state, 257, s('b'));
    await call(engine, state, 257, s('c'));
    const st = engine.getStability();
    expect(st.length).toBe(2);
    expect(st.find((r) => (r.arguments[0] as any).value === 256)?.stable).toBe(true);
    expect(st.find((r) => (r.arguments[0] as any).value === 257)?.stable).toBe(false);
  });

  it('failed captures are not part of the stability groups', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    state.args = [{ name: 'i', value: { type: 'number', value: 1 } }];
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    await engine.stop();
    expect(engine.getCaptures().some((c) => c.captureStatus === 'capture-failed')).toBe(true);
    expect(engine.getStability()).toEqual([]);
  });
});

const CODE = `var _arr = ['a','b','c','d','e','f','g','h','i','j']; function decHigh(i) { i = i - 0x100; return _arr[i]; } function decMed(i) { var x = _arr[i - 0x100]; } decHigh(0x100); decMed(0x101);`;

describe('capture strategy (high / medium / low)', () => {
  it('fixture has one high and one medium candidate', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(candidates.find((c) => c.name === 'decHigh')?.confidence).toBe('high');
    expect(candidates.find((c) => c.name === 'decMed')?.confidence).toBe('medium');
  });

  it('default strategy captures high only', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(selectTargets(candidates, DEFAULT_STRATEGY).map((c) => c.name)).toEqual(['decHigh']);
  });

  it('medium strategy also captures medium candidates', () => {
    const { candidates } = discoverDecoders(CODE);
    const names = selectTargets(candidates, { autoCaptureMinConfidence: 'medium' }).map((c) => c.name).sort();
    expect(names).toEqual(['decHigh', 'decMed']);
  });

  it('manual target pulls in a candidate below the threshold', () => {
    const { candidates } = discoverDecoders(CODE);
    const med = candidates.find((c) => c.name === 'decMed')!;
    const names = selectTargets(candidates, {
      autoCaptureMinConfidence: 'high',
      manualTargets: [{ functionName: 'decMed', lineNumber: med.location.startLine, columnNumber: med.location.startColumn }],
    }).map((c) => c.name).sort();
    expect(names).toEqual(['decHigh', 'decMed']);
  });

  it('low confidence is never auto-captured by default, but can be chosen manually', () => {
    const { candidates } = discoverDecoders(CODE);
    const med = candidates.find((c) => c.name === 'decMed')!;
    const low = { ...med, confidence: 'low' } as any;
    expect(shouldAutoCapture(low, DEFAULT_STRATEGY)).toBe(false);
    expect(shouldAutoCapture(low, { autoCaptureMinConfidence: 'medium' })).toBe(false);
    expect(shouldAutoCapture(low, { autoCaptureMinConfidence: 'high', manualTargets: [{ functionName: 'decMed', lineNumber: low.location.startLine, columnNumber: low.location.startColumn }] })).toBe(true);
    expect(shouldAutoCapture(low, { autoCaptureMinConfidence: 'low' })).toBe(true);
  });
});
