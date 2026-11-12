/**
 * Phase 4.5：手动断点模式 → Phase 3.2 / Phase 4 验证流程的转换层。
 *
 * 纯函数，不碰 DOM，也不碰 chrome API。把「用户在暂停帧里对某个调用点求值」变成一条
 * 可交给 validateCaptures 的 DecoderCapture；每一步都宁可拒绝也不放宽：
 * 1. 调用位置必须被 AST 唯一定位到对解码函数的直接调用，参数必须全是字面量；
 * 2. 求值表达式一律取自源码里该调用节点的原文，不接受用户手输表达式；
 * 3. 求值前要在同一帧确认该标识符绑定的函数就是静态分析的那一个（函数文本指纹），
 *    防止局部或闭包变量遮蔽同名解码函数；
 * 4. 返回值必须完整、可表示为字面量。
 * 手动求值最多算一次观测：同一调用点重复求值只覆盖同一条记录，不累加观测次数。
 * 注意：这是在暂停时重新执行一次调用，不是读取原调用当时的返回值，状态依赖由后续验证层判断。
 */
import * as t from '@babel/types';
import type { CdpPosition } from './capture-plan.js';
import type { DecoderCapture, RuntimeValue } from '../extension/debugger/capture-engine.js';
import { findCallPathsAt, findFunctionPathsByEntry, resolveFunctionName } from './ast-locate.js';
import { getScriptAst, type ValidationScript } from './capture-validation.js';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const MAX_STRING_ARG = 2000;
const MAX_EXPRESSION = 1000;
const FINGERPRINT_EDGE = 120;

/** 手动记录的序号起点：远大于引擎序号，避免干扰数组旋转阶段与稳定阶段的先后判断 */
export const MANUAL_SEQ_BASE = 1000000000;

export type ManualRejectCode =
  | 'invalid-input'
  | 'script-offset'
  | 'ast-unavailable'
  | 'function-not-found'
  | 'function-ambiguous'
  | 'function-name-mismatch'
  | 'call-not-found'
  | 'call-ambiguous'
  | 'not-direct-call'
  | 'binding-mismatch'
  | 'non-literal-argument'
  | 'argument-too-long'
  | 'expression-too-long'
  | 'probe-failed'
  | 'probe-mismatch'
  | 'return-missing'
  | 'return-truncated'
  | 'return-not-literal'
  | 'side-effect-blocked';

export interface ManualReject {
  ok: false;
  code: ManualRejectCode;
  message: string;
  /** 仅 side-effect-blocked：把「V8 拒绝了这次求值」记成一条手动来源的失败记录。验证层判为证据不足，不进入替换候选，也不会拖累同一组里已有的自动观测 */
  blocked?: DecoderCapture;
}

export interface ManualPlan {
  ok: true;
  scriptId: string;
  functionName: string;
  /** 解码函数入口（与 Phase 3 的 functionLocation 同一口径，行列均从 0 开始） */
  functionLocation: CdpPosition;
  /** 调用点位置（CallExpression 起点，行列均从 0 开始） */
  callLocation: CdpPosition;
  /** 要在暂停帧里求值的表达式：源码里该调用节点的原文 */
  expression: string;
  args: RuntimeValue[];
  /** 在同一帧先求值的绑定探针：返回解码函数文本的指纹 */
  bindingProbe: string;
  /** 静态分析得到的解码函数文本指纹，探针结果必须与它完全相等 */
  bindingFingerprint: string;
}

export interface ManualEvalOutcome {
  success: boolean;
  result?: RuntimeValue;
  error?: string;
  /** V8 的 throwOnSideEffect 拒绝了这次求值（EvalError: Possible side-effect in debug-evaluate） */
  sideEffectBlocked?: boolean;
}

function reject(code: ManualRejectCode, message: string): ManualReject {
  return { ok: false, code, message };
}

/** V8 拒绝求值时留下的记录：captureStatus 为 capture-failed，origin 为 manual；同一调用点重复被拒得到同一个 key，不累加 */
function blockedCapture(plan: ManualPlan, detail: string | undefined, meta: { scriptUrl: string; seq: number; timestamp: number }): DecoderCapture {
  const fl = plan.functionLocation;
  const cl = plan.callLocation;
  return {
    key: ['manual-blocked', plan.scriptId, fl.lineNumber, fl.columnNumber, cl.lineNumber, cl.columnNumber, JSON.stringify(plan.args)].join('|'),
    scriptId: plan.scriptId,
    scriptUrl: meta.scriptUrl,
    functionName: plan.functionName,
    functionLocation: { ...fl },
    callLocation: { ...cl },
    callLocations: [{ ...cl }],
    arguments: plan.args.map((a) => ({ ...a })),
    captureStatus: 'capture-failed',
    reason: 'side-effect-blocked: ' + (detail ?? 'V8 throwOnSideEffect rejected the evaluation'),
    origin: 'manual',
    count: 1,
    firstSeq: meta.seq,
    lastSeq: meta.seq,
    timestamp: meta.timestamp,
  };
}

/** 函数文本指纹：长度 + 头尾各 120 个字符。页面侧探针用同样的算法 */
export function fingerprintOf(text: string): string {
  return JSON.stringify([text.length, text.slice(0, FINGERPRINT_EDGE), text.slice(-FINGERPRINT_EDGE)]);
}

function bindsTo(declNode: t.Node, fn: t.Function): boolean {
  if (declNode === fn) return true;
  return t.isVariableDeclarator(declNode) && declNode.init === fn;
}

/**
 * 为「在暂停帧里对某个调用点求值」制定计划。任何一项对不上就拒绝，不做降级。
 * functionEntry 与 Phase 3 的 functionLocation 同一口径（computeCapturePlan 的 entry）。
 */
export function planManualCapture(
  script: ValidationScript,
  functionEntry: CdpPosition,
  functionName: string,
  callLocation: CdpPosition,
): ManualPlan | ManualReject {
  if (!IDENT.test(functionName)) return reject('invalid-input', '解码函数名不是合法标识符：' + functionName);
  if (!script || !script.scriptId || typeof script.source !== 'string') return reject('invalid-input', '脚本信息不完整（缺少 scriptId 或源码）');
  if ((script.startLine ?? 0) !== 0 || (script.startColumn ?? 0) !== 0) {
    return reject('script-offset', '脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证，不支持手动求值替换');
  }
  const { ast } = getScriptAst(script);
  if (!ast) return reject('ast-unavailable', '脚本源码无法解析为 AST');

  const fns = findFunctionPathsByEntry(ast, functionEntry);
  if (fns.length === 0) return reject('function-not-found', '源码里找不到入口位置对应的函数');
  if (fns.length > 1) return reject('function-ambiguous', '入口位置对应多个函数，无法确定是哪一个');
  const fn = fns[0];
  if (resolveFunctionName(fn) !== functionName) {
    return reject('function-name-mismatch', `入口位置的函数名是 ${resolveFunctionName(fn) ?? '(匿名)'}，不是 ${functionName}`);
  }

  const hits = findCallPathsAt(ast, callLocation);
  if (hits.length === 0) return reject('call-not-found', '该位置不是任何 CallExpression 的起点');
  if (hits.length > 1) return reject('call-ambiguous', `该位置对应 ${hits.length} 个 CallExpression，无法唯一确定`);
  const hit = hits[0];
  const call = hit.path.node;
  if (hit.kind !== 'call-start' || !t.isIdentifier(call.callee) || call.callee.name !== functionName) {
    return reject('not-direct-call', `该位置不是对 ${functionName} 的直接调用（别名、成员调用或其他形式）`);
  }
  const binding = hit.path.scope.getBinding(functionName);
  if (!binding || !bindsTo(binding.path.node, fn.node)) {
    return reject('binding-mismatch', `该调用点处的 ${functionName} 没有绑定到已分析的解码函数（被局部或闭包变量遮蔽，或不是 function / var 声明）`);
  }

  const args: RuntimeValue[] = [];
  for (let i = 0; i < call.arguments.length; i++) {
    const a = call.arguments[i];
    if (t.isStringLiteral(a)) {
      if (a.value.length > MAX_STRING_ARG) return reject('argument-too-long', `参数[${i}] 超过 ${MAX_STRING_ARG} 个字符，运行时记录会被截断`);
      args.push({ type: 'string', value: a.value });
    } else if (t.isNumericLiteral(a)) {
      args.push({ type: 'number', value: a.value });
    } else if (t.isBooleanLiteral(a)) {
      args.push({ type: 'boolean', value: a.value });
    } else {
      return reject('non-literal-argument', `参数[${i}] 不是字符串、数字或布尔字面量，不能确定参数值`);
    }
  }

  if (call.start == null || call.end == null || fn.node.start == null || fn.node.end == null) {
    return reject('invalid-input', 'AST 节点缺少偏移信息');
  }
  const expression = script.source.slice(call.start, call.end);
  if (expression.length === 0 || expression.length > MAX_EXPRESSION) {
    return reject('expression-too-long', `调用表达式长度 ${expression.length} 超出允许范围`);
  }
  const fingerprint = fingerprintOf(script.source.slice(fn.node.start, fn.node.end));
  const probe = `(function(f){var s=Function.prototype.toString.call(f);return JSON.stringify([s.length,s.slice(0,${FINGERPRINT_EDGE}),s.slice(-${FINGERPRINT_EDGE})])})(${functionName})`;

  return {
    ok: true,
    scriptId: script.scriptId,
    functionName,
    functionLocation: { lineNumber: functionEntry.lineNumber, columnNumber: functionEntry.columnNumber },
    callLocation: { lineNumber: callLocation.lineNumber, columnNumber: callLocation.columnNumber },
    expression,
    args,
    bindingProbe: probe,
    bindingFingerprint: fingerprint,
  };
}

/**
 * 用帧里的真实求值结果组装 DecoderCapture。绑定探针对不上、返回值不完整或不是字面量就拒绝。
 * key 带 manual 前缀；同一调用点同一结果的重复求值得到同一个 key，不会累加观测次数。
 */
export function buildManualCapture(
  plan: ManualPlan,
  probe: ManualEvalOutcome,
  evaluated: ManualEvalOutcome,
  meta: { scriptUrl: string; seq: number; timestamp: number },
): { ok: true; capture: DecoderCapture } | ManualReject {
  const pv = probe.success ? probe.result : undefined;
  if (!pv || pv.type !== 'string' || typeof pv.value !== 'string') {
    return reject('probe-failed', `无法在该帧确认 ${plan.functionName} 的绑定：${probe.error ?? '没有返回值'}`);
  }
  if (pv.truncated || pv.value !== plan.bindingFingerprint) {
    return reject('probe-mismatch', `该帧里的 ${plan.functionName} 与静态分析的解码函数不是同一个（函数文本指纹不一致）：可能被遮蔽、被重新赋值，或脚本已变化`);
  }
  if (evaluated.sideEffectBlocked === true) {
    return {
      ...reject('side-effect-blocked', `V8 的 throwOnSideEffect 拒绝了 ${plan.expression} 的求值（可能有副作用）：${evaluated.error ?? ''}。已记为证据不足，不会自动降级重试，也不会被替换`),
      blocked: blockedCapture(plan, evaluated.error, meta),
    };
  }
  const rv = evaluated.success ? evaluated.result : undefined;
  if (!rv) return reject('return-missing', `在帧中求值 ${plan.expression} 失败：${evaluated.error ?? '没有返回值'}`);
  if (rv.truncated) return reject('return-truncated', '返回值被截断，不是完整值');
  const literalType = rv.type === 'string' || rv.type === 'number' || rv.type === 'boolean' || rv.type === 'null';
  if (!literalType || rv.unserializable !== undefined || (rv.type !== 'null' && rv.value === undefined)) {
    return reject('return-not-literal', `返回值类型 ${rv.type} 不能表示为字面量`);
  }

  const returnValue: RuntimeValue = { ...rv };
  const fl = plan.functionLocation;
  const cl = plan.callLocation;
  const key = ['manual', plan.scriptId, fl.lineNumber, fl.columnNumber, cl.lineNumber, cl.columnNumber, JSON.stringify(plan.args), JSON.stringify(returnValue)].join('|');
  return {
    ok: true,
    capture: {
      key,
      scriptId: plan.scriptId,
      scriptUrl: meta.scriptUrl,
      functionName: plan.functionName,
      functionLocation: { ...fl },
      callLocation: { ...cl },
      callLocations: [{ ...cl }],
      arguments: plan.args.map((a) => ({ ...a })),
      returnValue,
      captureStatus: 'success',
      origin: 'manual',
      count: 1,
      firstSeq: meta.seq,
      lastSeq: meta.seq,
      timestamp: meta.timestamp,
    },
  };
}
