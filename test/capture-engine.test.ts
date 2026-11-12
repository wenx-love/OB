import { describe, it, expect, afterEach } from 'vitest';
import { CaptureEngine, type CaptureEvent, type CaptureTarget } from '../src/extension/debugger/capture-engine.js';
import type { CapturePlan } from '../src/core/capture-plan.js';

const plan: CapturePlan = {
  supported: true,
  entry: { lineNumber: 1, columnNumber: 0 },
  returns: [{ lineNumber: 4, columnNumber: 2 }],
  closing: { lineNumber: 5, columnNumber: 0 },
  paramNames: ['i'],
};
const target: CaptureTarget = { scriptId: 's1', scriptUrl: 'http://x/a.js', functionName: 'dec', plan };

interface Sent { method: string; params?: Record<string, unknown> }

const engines: CaptureEngine[] = [];
afterEach(() => {
  for (const e of engines) e.reset('test cleanup');
  engines.length = 0;
});

function setup(options = {}) {
  const sent: Sent[] = [];
  const events: CaptureEvent[] = [];
  const state = { n: 0, hang: false, args: [{ name: 'i', value: { type: 'number', value: 256 } }] as any[] };
  const send = async (method: string, params?: Record<string, unknown>) => {
    sent.push({ method, params });
    if (method === 'Debugger.setBreakpoint') return { breakpointId: 'bp' + (++state.n) };
    if (method === 'Runtime.getProperties') {
      if (state.hang) return new Promise(() => {});
      return { result: state.args };
    }
    return {};
  };
  const engine = new CaptureEngine(send, (e) => events.push(e), options);
  engines.push(engine);
  return { engine, sent, events, state };
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
const count = (sent: Sent[], m: string) => sent.filter((s) => s.method === m).length;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function cycle(engine: CaptureEngine, ret: unknown) {
  await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
  await engine.onPaused({ callFrames: stack(frame('dec', { returnValue: ret })), hitBreakpoints: ['bp2'] });
}

describe('CaptureEngine: breakpoint management', () => {
  it('sets entry, return and closing breakpoints once and never duplicates', async () => {
    const { engine, sent } = setup();
    const r1 = await engine.start([target]);
    const r2 = await engine.start([target]);
    expect(r1.set).toBe(3);
    expect(r2.set).toBe(0);
    expect(engine.getBreakpointCount()).toBe(3);
    expect(count(sent, 'Debugger.setBreakpoint')).toBe(3);
  });

  it('skips unsupported function shapes and reports the reason', async () => {
    const { engine, sent } = setup();
    const bad: CaptureTarget = { scriptId: 's1', scriptUrl: 'u', functionName: 'arrow', plan: { supported: false, reason: 'expression-bodied function', returns: [], paramNames: [] } };
    const r = await engine.start([bad]);
    expect(r.set).toBe(0);
    expect(r.skipped.length).toBe(1);
    expect(r.skipped[0].reason).toMatch(/expression-bodied/);
    expect(count(sent, 'Debugger.setBreakpoint')).toBe(0);
  });

  it('stop removes only its own breakpoints and does not resume a page it did not pause', async () => {
    const { engine, sent } = setup();
    await engine.start([target]);
    await engine.stop();
    const removed = sent.filter((s) => s.method === 'Debugger.removeBreakpoint').map((s) => (s.params as any).breakpointId).sort();
    expect(removed).toEqual(['bp1', 'bp2', 'bp3']);
    expect(count(sent, 'Debugger.resume')).toBe(0);
    expect(engine.isActive()).toBe(false);
    expect(engine.getBreakpointCount()).toBe(0);
  });

  it('reset (page refresh or detach) clears local state without sending commands', async () => {
    const { engine, sent } = setup();
    await engine.start([target]);
    const before = sent.length;
    engine.reset('page navigated');
    expect(sent.length).toBe(before);
    expect(engine.getBreakpointCount()).toBe(0);
    expect(engine.isActive()).toBe(false);
  });
});

describe('CaptureEngine: arguments and return values', () => {
  it('entry hit reads actual arguments, return hit reads returnValue; no re-execution commands', async () => {
    const { engine, sent } = setup();
    await engine.start([target]);
    await cycle(engine, { type: 'string', value: 'Signature' });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].captureStatus).toBe('success');
    expect(caps[0].arguments).toEqual([{ type: 'number', value: 256 }]);
    expect(caps[0].returnValue).toEqual({ type: 'string', value: 'Signature' });
    expect(caps[0].callLocation).toEqual({ lineNumber: 54, columnNumber: 11 });
    expect(caps[0].functionLocation).toEqual({ lineNumber: 1, columnNumber: 0 });
    expect(count(sent, 'Runtime.getProperties')).toBe(1);
    expect(sent.some((s) => s.method === 'Runtime.evaluate' || s.method === 'Runtime.callFunctionOn')).toBe(false);
    expect(count(sent, 'Debugger.resume')).toBe(2);
  });

  it('return hit without returnValue steps over once, then reads it', async () => {
    const { engine, sent } = setup();
    await engine.start([target]);
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp2'] });
    expect(count(sent, 'Debugger.stepOver')).toBe(1);
    await engine.onPaused({ callFrames: stack(frame('dec', { returnValue: { type: 'number', value: 10 } })), hitBreakpoints: [] });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].returnValue).toEqual({ type: 'number', value: 10 });
    expect(count(sent, 'Debugger.resume')).toBe(2);
  });

  it('records undefined and null return values faithfully', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await cycle(engine, { type: 'undefined' });
    state.args = [{ name: 'i', value: { type: 'number', value: 7 } }];
    await cycle(engine, { type: 'object', subtype: 'null', value: null });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(2);
    expect(caps[0].returnValue).toEqual({ type: 'undefined' });
    expect(caps[1].returnValue).toEqual({ type: 'null', value: null });
  });

  it('a returnValue on a frame with a different function name is never attributed to the pending call', async () => {
    const { engine } = setup();
    await engine.start([target]);
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    await engine.onPaused({ callFrames: stack(frame('decNested', { returnValue: { type: 'string', value: 'outer' } })), hitBreakpoints: ['bp2'] });
    expect(engine.getCaptures().length).toBe(0);
    expect(engine.getStats().success).toBe(0);
  });

  it('a call that exits without a return pause (exception) becomes capture-failed with a reason', async () => {
    const { engine, state } = setup();
    await engine.start([target]);
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    state.args = [{ name: 'i', value: { type: 'number', value: 257 } }];
    await cycle(engine, { type: 'string', value: 'x' });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(2);
    const failed = caps.find((c) => c.captureStatus === 'capture-failed');
    expect(failed).toBeDefined();
    expect(failed!.reason).toMatch(/exited/);
    expect(failed!.arguments).toEqual([{ type: 'number', value: 256 }]);
    expect(caps.find((c) => c.captureStatus === 'success')!.returnValue).toEqual({ type: 'string', value: 'x' });
  });

  it('an entry hit whose top frame is not a function body is recorded as capture-failed, never silently dropped', async () => {
    const { engine, sent } = setup();
    await engine.start([target]);
    await engine.onPaused({ callFrames: [{ functionName: '', location: { scriptId: 's1', lineNumber: 1, columnNumber: 0 }, scopeChain: [{ type: 'global', object: { objectId: 'g1' } }] }], hitBreakpoints: ['bp1'] });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].captureStatus).toBe('capture-failed');
    expect(caps[0].reason).toMatch(/did not land inside the function body/);
    expect(count(sent, 'Runtime.getProperties')).toBe(0);
  });

  it('an entry position shared with a return position gets one breakpoint that acts as both entry and exit', async () => {
    const { engine, sent } = setup();
    const shared: CaptureTarget = { scriptId: 's1', scriptUrl: 'u', functionName: 'dec', plan: { supported: true, entry: { lineNumber: 1, columnNumber: 2 }, returns: [{ lineNumber: 1, columnNumber: 2 }], closing: { lineNumber: 2, columnNumber: 0 }, paramNames: ['i'] } };
    const r = await engine.start([shared]);
    expect(r.errors).toEqual([]);
    expect(count(sent, 'Debugger.setBreakpoint')).toBe(2);
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    await engine.onPaused({ callFrames: stack(frame('dec', { returnValue: { type: 'number', value: 10 } })), hitBreakpoints: [] });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].captureStatus).toBe('success');
    expect(caps[0].returnValue).toEqual({ type: 'number', value: 10 });
  });

  it('objects and arrays are described but never expanded', async () => {
    const { engine, sent, state } = setup();
    state.args = [{ name: 'i', value: { type: 'object', subtype: 'array', description: 'Array(3)', objectId: 'o1' } }];
    await engine.start([target]);
    await cycle(engine, { type: 'string', value: 'v' });
    expect(engine.getCaptures()[0].arguments).toEqual([{ type: 'object', subtype: 'array', description: 'Array(3)' }]);
    expect(count(sent, 'Runtime.getProperties')).toBe(1);
  });
});

describe('CaptureEngine: dedupe, limits and safety', () => {
  it('identical calls are deduplicated and counted', async () => {
    const { engine } = setup();
    await engine.start([target]);
    await cycle(engine, { type: 'string', value: 'hello' });
    await cycle(engine, { type: 'string', value: 'hello' });
    const caps = engine.getCaptures();
    expect(caps.length).toBe(1);
    expect(caps[0].count).toBe(2);
    expect(caps[0].lastSeq).toBeGreaterThan(caps[0].firstSeq);
    expect(engine.getStats().success).toBe(2);
  });

  it('stops itself when maxRecords is reached and reports the limit', async () => {
    const { engine, events, state } = setup({ maxRecords: 1 });
    await engine.start([target]);
    await cycle(engine, { type: 'string', value: 'a' });
    state.args = [{ name: 'i', value: { type: 'number', value: 999 } }];
    await cycle(engine, { type: 'string', value: 'b' });
    expect(engine.getCaptures().length).toBe(1);
    expect(events.some((e) => e.kind === 'limit-reached')).toBe(true);
    expect(engine.isActive()).toBe(false);
  });

  it('a pause that is not ours is left alone (no resume, no step)', async () => {
    const { engine, sent, events } = setup();
    await engine.start([target]);
    await engine.onPaused({ callFrames: stack(frame('userFn')), hitBreakpoints: [] });
    expect(count(sent, 'Debugger.resume')).toBe(0);
    expect(count(sent, 'Debugger.stepOver')).toBe(0);
    expect(events.some((e) => e.kind === 'foreign-pause')).toBe(true);
    expect(engine.getStats().foreignPauses).toBe(1);
  });

  it('watchdog force-resumes our own stuck pause and fails the pending capture', async () => {
    const { engine, sent, state } = setup();
    await engine.start([target]);
    state.hang = true;
    void engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    await flush();
    await engine.checkWatchdog(Date.now() + 9000);
    expect(engine.getStats().forcedResumes).toBe(1);
    expect(count(sent, 'Debugger.resume')).toBe(1);
  });

  it('a pause that hits a breakpoint already removed by stop() is still resumed, not left hanging', async () => {
    const { engine, sent } = setup();
    await engine.start([target]);
    await engine.stop();
    expect(engine.ownsPause({ hitBreakpoints: ['bp1'] })).toBe(true);
    await engine.onPaused({ callFrames: stack(frame('dec')), hitBreakpoints: ['bp1'] });
    expect(count(sent, 'Debugger.resume')).toBe(1);
    expect(engine.getCaptures().length).toBe(0);
  });

  it('clear empties the capture table but keeps breakpoints', async () => {
    const { engine } = setup();
    await engine.start([target]);
    await cycle(engine, { type: 'string', value: 'hello' });
    engine.clear();
    expect(engine.getCaptures().length).toBe(0);
    expect(engine.getBreakpointCount()).toBe(3);
  });
});
