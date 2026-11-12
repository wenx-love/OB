import vm from 'node:vm';
import _traverse from '@babel/traverse';
import { CaptureEngine, type CaptureTarget, type DecoderCapture } from '../../src/extension/debugger/capture-engine.js';
import { computeCapturePlan, type CdpPosition } from '../../src/core/capture-plan.js';
import { parseCode } from '../../src/core/parser.js';
import { resolveFunctionName } from '../../src/core/ast-locate.js';
import { createNodeSandboxContext } from '../../src/core/sandbox-context.js';
import type { ValidationScript } from '../../src/core/capture-validation.js';

const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/**
 * Phase 3.2 测试用捕获驱动。
 *
 * 真实的部分：
 *   - 脚本在 node:vm 里真实执行，解码函数真实运行；
 *   - 参数、返回值来自这次真实执行；调用位置来自 V8 调用栈（调用方帧的行列）；
 *   - 捕获记录由真实的 CaptureEngine 生成：去重、callLocations、截断、失败处理都是引擎自己的逻辑。
 * 桩的部分：
 *   - CDP 传输层。没有真实的断点暂停，驱动按引擎期望的形状合成 Debugger.paused 事件。
 * 所以这是「引擎 + 验证层」的单元级测试，不是真实 Chrome 扩展测试，也不是原始 CDP 测试。
 *
 * 约定：被观测的函数必须是脚本里的函数声明或对象属性函数；脚本只声明、不自动执行，
 * 由驱动在安装观测包装之后调用全局入口函数（默认 run）。同名函数按源码顺序取第一个。
 */
export interface DriveOptions {
  scriptId?: string;
  /** 要观测的函数，如 dec 或 obj.dec */
  wrap: string[];
  /** 脚本加载后调用的全局入口函数，默认 run */
  entry?: string;
  /** 注入脚本全局作用域的额外对象 */
  globals?: Record<string, unknown>;
  /** 局部作用域读不到参数（引擎会记录 type: missing） */
  omitLocals?: boolean;
  /** 调用栈里没有调用方帧（调用位置未知） */
  omitCaller?: boolean;
}

export interface DriveResult {
  captures: DecoderCapture[];
  script: ValidationScript;
  stats: ReturnType<CaptureEngine['getStats']>;
  /** Phase 3.1 引擎自己的稳定性统计，仅供测试对照，验证统计不使用它 */
  stability: ReturnType<CaptureEngine['getStability']>;
}

const same = (a: CdpPosition, b: CdpPosition): boolean => a.lineNumber === b.lineNumber && a.columnNumber === b.columnNumber;
const posKey = (p: CdpPosition): string => p.lineNumber + ':' + p.columnNumber;

/** 按 CDP RemoteObject 的形状表示一个值：原始值带 value，对象和函数只有 description */
function remote(v: unknown): any {
  if (v === undefined) return { type: 'undefined' };
  if (v === null) return { type: 'object', subtype: 'null', value: null };
  if (typeof v === 'object' || typeof v === 'function') return { type: typeof v, description: typeof v === 'function' ? 'function' : 'Object' };
  return { type: typeof v, value: v };
}

/** 包装函数的调用方在 vm 脚本里的位置（CDP 约定：行列都从 0 开始） */
function callerPosition(fn: Function, filename: string): CdpPosition | null {
  const E = Error as any;
  const original = E.prepareStackTrace;
  try {
    E.prepareStackTrace = (_err: unknown, sites: unknown) => sites;
    const holder: any = {};
    E.captureStackTrace(holder, fn);
    const sites: any[] = holder.stack;
    const site = Array.isArray(sites) ? sites.find((s) => s.getFileName() === filename) : undefined;
    return site ? { lineNumber: site.getLineNumber() - 1, columnNumber: site.getColumnNumber() - 1 } : null;
  } finally {
    E.prepareStackTrace = original;
  }
}

export async function drive(source: string, opts: DriveOptions): Promise<DriveResult> {
  const scriptId = opts.scriptId ?? 's1';
  const filename = 'http://test/' + scriptId + '.js';
  const entryName = opts.entry ?? 'run';
  const ast = parseCode(source);

  // 1. 每个被观测函数：在源码里按名字找到函数，用真实的 computeCapturePlan 计算断点位置
  const targets = new Map<string, CaptureTarget>();
  for (const path of opts.wrap) {
    const leaf = path.split('.').pop() as string;
    let start = -1;
    traverse(ast, {
      Function(p) {
        if (start < 0 && resolveFunctionName(p) === leaf) start = p.node.start as number;
      },
    });
    if (start < 0) throw new Error('function not found in source: ' + path);
    const plan = computeCapturePlan(source, start, ast);
    if (!plan.supported) throw new Error('capture plan unsupported for ' + path + ': ' + plan.reason);
    targets.set(path, { scriptId, scriptUrl: filename, functionName: leaf, plan });
  }

  // 2. 真实引擎 + 桩传输层
  let bp = 0;
  const ids = new Map<string, string>();
  const scopes = new Map<string, { names: string[]; args: unknown[] }>();
  const send = async (method: string, params: any = {}): Promise<any> => {
    if (method === 'Debugger.setBreakpoint') {
      const id = 'bp' + ++bp;
      ids.set(params.location.lineNumber + ':' + params.location.columnNumber, id);
      return { breakpointId: id };
    }
    if (method === 'Runtime.getProperties') {
      const sc = scopes.get(params.objectId);
      if (!sc || opts.omitLocals) return { result: [] };
      return { result: sc.names.map((n, i) => ({ name: n, value: remote(sc.args[i]) })) };
    }
    return {};
  };
  const engine = new CaptureEngine(send, () => {});
  const started = await engine.start(Array.from(targets.values()));
  if (started.errors.length > 0 || started.skipped.length > 0) {
    throw new Error('engine start problems: ' + JSON.stringify({ errors: started.errors, skipped: started.skipped }));
  }

  // 3. 真实执行脚本，并给被观测函数装上记录用的包装
  const ctx = vm.createContext({ ...createNodeSandboxContext(), ...(opts.globals ?? {}) });
  new vm.Script(source, { filename }).runInContext(ctx);

  const events: any[] = [];
  let scopeSeq = 0;
  for (const path of opts.wrap) {
    const target = targets.get(path) as CaptureTarget;
    const plan = target.plan;
    const entry = plan.entry as CdpPosition;
    const parts = path.split('.');
    let holder: any = ctx;
    for (const part of parts.slice(0, -1)) holder = holder[part];
    const leaf = parts[parts.length - 1];
    const original = holder[leaf];
    if (typeof original !== 'function') throw new Error('not a function after loading the script: ' + path);

    const entryId = ids.get(posKey(entry)) as string;
    const entryAlsoReturns = plan.returns.some((r) => same(r, entry));
    const exitPos = plan.returns.find((r) => !same(r, entry)) ?? (plan.closing as CdpPosition);
    const exitId = ids.get(posKey(exitPos));
    // 入口断点同时是 return 断点时，引擎会请求 stepOver：返回值出现在随后的单步暂停里（没有命中断点）
    const exitHits = entryAlsoReturns || !exitId || exitId === entryId ? [] : [exitId];

    const wrapper = function (this: unknown, ...args: unknown[]) {
      const pos = opts.omitCaller ? null : callerPosition(wrapper, filename);
      const sid = 'scope#' + ++scopeSeq;
      scopes.set(sid, { names: plan.paramNames, args });
      const caller = pos
        ? [{ functionName: entryName, location: { scriptId, lineNumber: pos.lineNumber, columnNumber: pos.columnNumber }, scopeChain: [] }]
        : [];
      const top = (extra: Record<string, unknown>) => ({
        functionName: target.functionName,
        location: { scriptId, lineNumber: entry.lineNumber, columnNumber: entry.columnNumber },
        scopeChain: [{ type: 'local', object: { objectId: sid } }],
        ...extra,
      });
      events.push({ callFrames: [top({}), ...caller], hitBreakpoints: [entryId] });
      const result = (original as Function).apply(this, args);
      events.push({ callFrames: [top({ returnValue: remote(result) }), ...caller], hitBreakpoints: exitHits });
      return result;
    };
    holder[leaf] = wrapper;
  }

  try {
    const entryFn = (ctx as any)[entryName];
    if (typeof entryFn !== 'function') throw new Error('entry function not found: ' + entryName);
    entryFn();
    for (const ev of events) await engine.onPaused(ev);
  } finally {
    await engine.stop();
  }
  return { captures: engine.getCaptures(), script: { scriptId, source, url: filename }, stats: engine.getStats(), stability: engine.getStability() };
}
