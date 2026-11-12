/**
 * Phase 4.5：手动断点模式面板
 *
 * 只读取用户自己的暂停：调用栈、作用域，并在指定帧里对调用点求值，
 * 把结果转成 DecoderCapture 交给现有的 Phase 3.2 验证和 Phase 4 位置级替换。
 * 不设置断点，不 resume，不 step，不切换面板；页面传来的值一律只用 textContent 渲染。
 * 求值记录单独存放，不写进自动捕获的 capTable；能不能替换完全由验证层决定。
 */
import { computeCapturePlan, type CdpPosition } from '../../core/capture-plan.js';
import { parseCode } from '../../core/parser.js';
import type { CandidateDecoder, DiscoveryResult } from '../../core/decoder-discovery.js';
import type { ValidationScript } from '../../core/capture-validation.js';
import { planManualCapture, buildManualCapture, MANUAL_SEQ_BASE } from '../../core/manual-capture-convert.js';
import type { DecoderCapture, RuntimeValue } from '../debugger/capture-engine.js';
import type { ManualCaptureRecord, ManualFrameInfo, ManualScopeInfo } from '../debugger/manual-capture.js';
import type { DebuggerPausedInfo, DiscoveredScript } from '../debugger/types.js';

const NL = String.fromCharCode(10);
const REQUEST_TIMEOUT_MS = 15000;
const MAX_CALLSITE_OPTIONS = 200;
const MAX_RECORDS_SHOWN = 30;
const MAX_RECORDS_KEPT = 100;

export interface ManualPanelContext {
  tabId: number;
  getPort(): { postMessage(msg: any): void } | null;
  getScript(scriptId: string): DiscoveredScript | undefined;
  isRetired(scriptId: string): boolean;
  getMinConfidence(): 'high' | 'medium';
  log(level: 'info' | 'warn' | 'error', message: string): void;
  onCapturesChanged(): void;
}

export interface ManualPanel {
  handleResponse(msg: any): void;
  onPaused(info: DebuggerPausedInfo): void;
  onResumed(): void;
  onPageReset(): void;
  onModeChanged(mode: 'auto' | 'manual'): void;
  syncMode(captureActive: boolean): void;
  onRecord(record: ManualCaptureRecord): void;
  getCaptures(): DecoderCapture[];
}

interface CallSiteChoice {
  cand: CandidateDecoder;
  entry: CdpPosition;
  call: CdpPosition;
  label: string;
}

interface PendingRequest {
  type: string;
  timer: number;
  resolve: (m: any) => void;
}

type PanelMode = 'auto' | 'manual';

function noopPanel(): ManualPanel {
  return {
    handleResponse() {},
    onPaused() {},
    onResumed() {},
    onPageReset() {},
    onModeChanged() {},
    syncMode() {},
    onRecord() {},
    getCaptures: () => [],
  };
}

function errText(e: any): string {
  return e && e.message ? String(e.message) : String(e);
}

function fmt(v: RuntimeValue | undefined): string {
  if (!v) return '—';
  if (v.type === 'undefined') return 'undefined';
  if (v.type === 'null') return 'null';
  if (v.type === 'string') return JSON.stringify(v.value) + (v.truncated ? ' …(已截断)' : '');
  if (v.unserializable) return v.unserializable;
  if (v.value !== undefined) return String(v.value);
  const d = v.description ? String(v.description) : v.type;
  return d.length > 120 ? d.slice(0, 120) + '…' : d;
}

function fileOf(url: string, scriptId: string): string {
  return url ? (url.split('/').pop() || url) : 'script:' + scriptId;
}

export function initManualPanel(ctx: ManualPanelContext): ManualPanel {
  const section = document.getElementById('man-section');
  const modeSel = document.getElementById('man-mode') as HTMLSelectElement | null;
  const stateEl = document.getElementById('man-state') as HTMLSpanElement | null;
  const btnRefresh = document.getElementById('btn-man-refresh') as HTMLButtonElement | null;
  const btnClear = document.getElementById('btn-man-clear') as HTMLButtonElement | null;
  const frameSel = document.getElementById('man-frame') as HTMLSelectElement | null;
  const btnScopes = document.getElementById('btn-man-scopes') as HTMLButtonElement | null;
  const callSiteSel = document.getElementById('man-callsite') as HTMLSelectElement | null;
  const btnEval = document.getElementById('btn-man-eval') as HTMLButtonElement | null;
  const infoEl = document.getElementById('man-info') as HTMLDivElement | null;
  const scopesEl = document.getElementById('man-scopes') as HTMLPreElement | null;
  const resultEl = document.getElementById('man-result') as HTMLDivElement | null;
  const recordsEl = document.getElementById('man-records') as HTMLDivElement | null;
  if (!section || !modeSel || !stateEl || !btnRefresh || !btnClear || !frameSel || !btnScopes || !callSiteSel || !btnEval || !infoEl || !scopesEl || !resultEl || !recordsEl) {
    return noopPanel();
  }

  let mode: PanelMode = 'manual';
  let lastActive = false;
  let paused = false;
  let busy = false;
  let frames: ManualFrameInfo[] = [];
  let choices: CallSiteChoice[] = [];
  let seq = 0;
  let pending: PendingRequest | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const table = new Map<string, DecoderCapture>();
  const records: ManualCaptureRecord[] = [];
  const astCache = new Map<string, ReturnType<typeof parseCode>>();

  // 与 Background 的请求/响应：响应没有请求编号，所以所有请求串行发送，一次只等一个响应类型
  function request(msg: Record<string, unknown>, responseType: string): Promise<any> {
    const run = (): Promise<any> => new Promise<any>((resolve, reject) => {
      const port = ctx.getPort();
      if (!port) {
        reject(new Error('与 Background 的连接已断开'));
        return;
      }
      const timer = window.setTimeout(() => {
        if (pending && pending.timer === timer) pending = null;
        reject(new Error('等待 Background 响应超时（' + responseType + '）'));
      }, REQUEST_TIMEOUT_MS);
      pending = {
        type: responseType,
        timer,
        resolve: (m: any) => {
          window.clearTimeout(timer);
          resolve(m);
        },
      };
      try {
        port.postMessage(Object.assign({ tabId: ctx.tabId }, msg));
      } catch (e: any) {
        window.clearTimeout(timer);
        pending = null;
        reject(e);
      }
    });
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  }

  function handleResponse(msg: any): void {
    if (!pending || pending.type !== msg.type) return;
    const p = pending;
    pending = null;
    p.resolve(msg);
  }

  async function evalInFrame(frameIndex: number, expression: string): Promise<{ success: boolean; result?: RuntimeValue; error?: string; sideEffectBlocked?: boolean }> {
    const r = await request({ type: 'manual-capture-evaluate', frameIndex, expression }, 'manual-capture-evaluate-response');
    return (r && r.data) || { success: false, error: 'Background 没有返回结果' };
  }

  function setResult(text: string): void {
    resultEl!.textContent = text;
    resultEl!.hidden = text === '';
  }

  function setInfo(text: string): void {
    infoEl!.textContent = text;
  }

  function renderState(): void {
    stateEl!.textContent = paused ? '已暂停' : '运行中';
    stateEl!.className = 'rt-value rt-badge ' + (paused ? 'paused' : 'running');
  }

  function updateControls(): void {
    const haveFrames = frames.length > 0;
    frameSel!.disabled = !haveFrames || busy;
    btnScopes!.disabled = !haveFrames || busy;
    callSiteSel!.disabled = choices.length === 0 || busy;
    btnEval!.disabled = !haveFrames || choices.length === 0 || busy;
    btnRefresh!.disabled = busy;
  }

  function selectedFrame(): ManualFrameInfo | undefined {
    return frames[Number(frameSel!.value)];
  }

  function astOf(script: DiscoveredScript): ReturnType<typeof parseCode> {
    const key = script.scriptId + ':' + (script.source ? script.source.length : 0);
    let ast = astCache.get(key);
    if (!ast) {
      ast = parseCode(script.source as string);
      astCache.set(key, ast);
    }
    return ast;
  }

  // 调用点来自静态发现的候选解码函数：只列字面量参数的直接调用，按离暂停行的距离排序。最终是否可用由 planManualCapture 再检查一遍
  function renderCallSites(): void {
    callSiteSel!.textContent = '';
    choices = [];
    const frame = selectedFrame();
    if (!frame) {
      updateControls();
      return;
    }
    const script = ctx.getScript(frame.scriptId);
    if (!script || !script.source) {
      setInfo('帧所在脚本 ' + frame.scriptId + ' 不在已发现的脚本集合里，没有源码，无法静态定位调用点。');
      updateControls();
      return;
    }
    if (ctx.isRetired(script.scriptId)) {
      setInfo('脚本 ' + script.scriptId + ' 已过期（页面已刷新），不能用于手动求值。');
      updateControls();
      return;
    }
    const res = script.discoveryResult as DiscoveryResult | undefined;
    if (!res || !res.analyzed) {
      setInfo('脚本 ' + script.scriptId + ' 还没有可用的静态分析结果。');
      updateControls();
      return;
    }
    const min = ctx.getMinConfidence();
    const cands = res.candidates.filter((c) => !!c.name && (c.confidence === 'high' || (min === 'medium' && c.confidence === 'medium')));
    if (cands.length === 0) {
      setInfo('该脚本没有满足当前门槛（' + min + '）的候选解码函数。门槛在 Capture 面板里切换，默认 high。');
      updateControls();
      return;
    }
    let ast: ReturnType<typeof parseCode>;
    try {
      ast = astOf(script);
    } catch (e: any) {
      setInfo('脚本源码解析失败：' + errText(e));
      updateControls();
      return;
    }
    const sites: (CallSiteChoice & { dist: number })[] = [];
    for (const cand of cands) {
      let entry: CdpPosition | undefined;
      try {
        const plan = computeCapturePlan(script.source, cand.location.start, ast);
        if (plan.supported && plan.entry) entry = plan.entry;
      } catch {
        entry = undefined;
      }
      if (!entry) continue;
      for (const cs of cand.callSites) {
        if (!cand.name || !cs.callText.startsWith(cand.name + '(')) continue;
        if (!cs.args.every((a) => a.isLiteral)) continue;
        const call: CdpPosition = { lineNumber: cs.location.startLine - 1, columnNumber: cs.location.startColumn };
        sites.push({
          cand,
          entry,
          call,
          dist: Math.abs(call.lineNumber - frame.location.lineNumber),
          label: 'L' + (call.lineNumber + 1) + ':' + (call.columnNumber + 1) + '  ' + cs.callText.slice(0, 80),
        });
      }
    }
    sites.sort((a, b) => a.dist - b.dist || a.call.lineNumber - b.call.lineNumber || a.call.columnNumber - b.call.columnNumber);
    choices = sites.slice(0, MAX_CALLSITE_OPTIONS);
    choices.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = c.label;
      callSiteSel!.appendChild(o);
    });
    setInfo(sites.length === 0
      ? '该脚本里没有字面量参数的直接调用点可选。'
      : '共 ' + sites.length + ' 个字面量参数的直接调用点' + (sites.length > choices.length ? '，列出离暂停行最近的 ' + choices.length + ' 个' : '') + '。');
    updateControls();
  }

  function renderFrames(): void {
    frameSel!.textContent = '';
    frames.forEach((f) => {
      const o = document.createElement('option');
      o.value = String(f.index);
      o.textContent = '#' + f.index + ' ' + f.functionName + ' @ ' + fileOf(f.scriptUrl, f.scriptId) + ':' + (f.location.lineNumber + 1) + ':' + (f.location.columnNumber + 1);
      frameSel!.appendChild(o);
    });
    renderCallSites();
    updateControls();
  }

  function renderRecords(): void {
    recordsEl!.textContent = '';
    for (const r of records.slice(0, MAX_RECORDS_SHOWN)) {
      const row = document.createElement('div');
      row.className = 'decoder-info-row';
      const strong = document.createElement('strong');
      strong.textContent = new Date(r.timestamp).toLocaleTimeString();
      const span = document.createElement('span');
      span.textContent = r.functionName + ' @ ' + fileOf(r.scriptUrl, r.scriptId) + ':' + (r.location.lineNumber + 1) + ':' + (r.location.columnNumber + 1) + '  栈深 ' + r.stackDepth;
      row.append(strong, span);
      recordsEl!.appendChild(row);
    }
  }

  async function refresh(quiet: boolean): Promise<void> {
    try {
      const r = await request({ type: 'manual-capture-get-frames' }, 'manual-capture-frames-response');
      const d = r && r.data;
      if (!d || !d.success) throw new Error((d && d.error) || '读取调用栈失败');
      frames = d.frames as ManualFrameInfo[];
      paused = true;
      renderState();
      renderFrames();
      if (!quiet) setResult('');
    } catch (e: any) {
      frames = [];
      choices = [];
      renderFrames();
      if (quiet) {
        setInfo(mode === 'auto' ? '自动捕获模式下不读取暂停调用栈。' : '收到暂停，但没有保存到调用栈：' + errText(e));
      } else {
        setResult('读取调用栈失败：' + errText(e));
      }
    }
  }

  async function showScopes(): Promise<void> {
    const frame = selectedFrame();
    if (!frame) {
      setResult('请先读取暂停调用栈并选择一帧。');
      return;
    }
    try {
      const r = await request({ type: 'manual-capture-get-scopes', frameIndex: frame.index }, 'manual-capture-scopes-response');
      const d = r && r.data;
      if (!d || !d.success) throw new Error((d && d.error) || '读取作用域失败');
      const lines: string[] = ['帧 #' + frame.index + ' ' + d.functionName + ' 的作用域（只读；页面传来的值按文本显示）'];
      for (const s of d.scopes as ManualScopeInfo[]) {
        lines.push('[' + s.type + (s.name ? ' ' + s.name : '') + ']' + (s.skipped ? '  ' + s.skipped : ''));
        for (const [k, v] of Object.entries(s.variables)) lines.push('  ' + k + ' = ' + fmt(v));
        if (s.truncated) lines.push('  …变量过多，已截断');
      }
      scopesEl!.textContent = lines.join(NL);
      scopesEl!.hidden = false;
    } catch (e: any) {
      setResult('读取作用域失败：' + errText(e));
    }
  }

  async function evalSelected(): Promise<void> {
    if (busy) return;
    if (!paused || frames.length === 0) {
      setResult('当前没有处于暂停状态的调用栈。请先在 Sources 里自己设置断点并触发，再点“读取暂停调用栈”。');
      return;
    }
    const frame = selectedFrame();
    const choice = choices[Number(callSiteSel!.value)];
    if (!frame || !choice) {
      setResult('请选择调用栈帧和调用点。');
      return;
    }
    const script = ctx.getScript(frame.scriptId);
    if (!script || !script.source) {
      setResult('帧所在脚本没有源码，不能求值。');
      return;
    }
    busy = true;
    updateControls();
    try {
      const vs: ValidationScript = { scriptId: script.scriptId, source: script.source, url: script.url, startLine: script.startLine, startColumn: script.startColumn };
      const plan = planManualCapture(vs, choice.entry, choice.cand.name as string, choice.call);
      if (!plan.ok) {
        setResult('❌ 未加入验证：' + plan.code + '：' + plan.message);
        return;
      }
      const probe = await evalInFrame(frame.index, plan.bindingProbe);
      const evaluated = await evalInFrame(frame.index, plan.expression);
      const built = buildManualCapture(plan, probe, evaluated, { scriptUrl: script.url, seq: MANUAL_SEQ_BASE + (++seq), timestamp: Date.now() });
      if (!built.ok) {
        if (built.blocked) {
          // V8 的 throwOnSideEffect 不允许这次求值：记为证据不足，不自动降级重试，不进入替换候选
          table.set(built.blocked.key, built.blocked);
          ctx.onCapturesChanged();
          ctx.log('warn', '手动求值被 V8 拒绝（可能有副作用），已记为证据不足：' + plan.expression);
        }
        setResult('❌ 未加入验证：' + built.code + '：' + built.message);
        return;
      }
      table.set(built.capture.key, built.capture);
      ctx.onCapturesChanged();
      const pos = 'L' + (plan.callLocation.lineNumber + 1) + ':' + (plan.callLocation.columnNumber + 1);
      setResult([
        '✅ 已加入验证（手动求值，只算 1 次观测）',
        plan.expression + ' → ' + fmt(built.capture.returnValue),
        '调用点 ' + pos + '，在帧 #' + frame.index + ' ' + frame.functionName + ' 中求值；绑定探针已确认该帧里的 ' + plan.functionName + ' 与静态分析的是同一个函数。',
        '这是在暂停时重新执行一次调用，不是读取原调用当时的返回值；能否替换由 Phase 3.2 验证和 dry-run 决定，未通过验证的不会被替换。',
      ].join(NL));
      ctx.log('info', '手动求值已加入验证：' + plan.expression + ' → ' + fmt(built.capture.returnValue));
    } catch (e: any) {
      setResult('❌ 求值出错：' + errText(e));
    } finally {
      busy = false;
      updateControls();
    }
  }

  function applyMode(next: PanelMode): void {
    mode = next;
    modeSel!.value = next;
  }

  function onPaused(info: DebuggerPausedInfo): void {
    paused = true;
    renderState();
    setInfo('收到暂停（' + info.reason + '），正在读取调用栈…');
    void refresh(true);
  }

  function onResumed(): void {
    const was = paused || frames.length > 0;
    paused = false;
    frames = [];
    choices = [];
    renderState();
    renderFrames();
    scopesEl!.hidden = true;
    scopesEl!.textContent = '';
    if (was) setInfo('执行已恢复，保存的调用栈已失效。');
  }

  function onPageReset(): void {
    table.clear();
    astCache.clear();
    onResumed();
    ctx.onCapturesChanged();
  }

  function onRecord(record: ManualCaptureRecord): void {
    records.unshift(record);
    if (records.length > MAX_RECORDS_KEPT) records.length = MAX_RECORDS_KEPT;
    renderRecords();
  }

  function syncMode(active: boolean): void {
    if (active === lastActive) return;
    lastActive = active;
    applyMode(active ? 'auto' : 'manual');
  }

  btnRefresh.addEventListener('click', () => { void refresh(false); });
  btnScopes.addEventListener('click', () => { void showScopes(); });
  btnEval.addEventListener('click', () => { void evalSelected(); });
  frameSel.addEventListener('change', () => {
    scopesEl!.hidden = true;
    renderCallSites();
  });
  btnClear.addEventListener('click', () => {
    table.clear();
    records.length = 0;
    renderRecords();
    setResult('');
    ctx.getPort()?.postMessage({ type: 'manual-capture-clear', tabId: ctx.tabId });
    ctx.onCapturesChanged();
  });
  modeSel.addEventListener('change', () => {
    const next: PanelMode = modeSel!.value === 'auto' ? 'auto' : 'manual';
    ctx.getPort()?.postMessage({ type: 'capture-set-mode', tabId: ctx.tabId, mode: next });
  });

  renderState();
  updateControls();
  ctx.getPort()?.postMessage({ type: 'capture-get-mode', tabId: ctx.tabId });

  return {
    handleResponse,
    onPaused,
    onResumed,
    onPageReset,
    onModeChanged: applyMode,
    syncMode,
    onRecord,
    getCaptures: () => Array.from(table.values()),
  };
}
