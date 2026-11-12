import { _ as _traverse, p as parseCode, l as libExports } from "./chunks/parser-BGlb7RAx.js";
import { c as computeCapturePlan } from "./chunks/capture-plan-ZmWOmY9y.js";
const attachedTabs = /* @__PURE__ */ new Set();
const tabStatus = /* @__PURE__ */ new Map();
const eventListeners = /* @__PURE__ */ new Set();
const SEND_TIMEOUT_MS = 3e4;
const pendingCommands = /* @__PURE__ */ new Map();
function rejectPending(tabId, reason) {
  const set = pendingCommands.get(tabId);
  if (!set) return;
  pendingCommands.delete(tabId);
  for (const p of set) {
    clearTimeout(p.timer);
    p.reject(new Error(reason + "（" + p.method + " 未得到回复）"));
  }
  set.clear();
}
let hooks = {};
const instrumentationBps = /* @__PURE__ */ new Map();
function setHooks(h) {
  hooks = h;
}
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (tabId === void 0 || !attachedTabs.has(tabId)) return;
  if (method === "Debugger.paused") {
    if (params?.reason === "instrumentation") {
      void handleInstrumentation(tabId, params);
      return;
    }
    if (hooks.onPaused && hooks.onPaused(tabId, params)) return;
    handlePaused(tabId, params);
  } else if (method === "Debugger.resumed") {
    hooks.onResumed?.(tabId);
    emit(tabId, { type: "debugger-event", event: { kind: "resumed" } });
  } else if (method === "Debugger.globalObjectCleared" || method === "Runtime.executionContextsCleared") {
    hooks.onReset?.(tabId, "page navigated or reloaded");
  } else if (method === "Debugger.scriptParsed") {
    handleScriptParsed(tabId, params);
  } else if (method === "Runtime.executionContextCreated") {
    emit(tabId, {
      type: "debugger-event",
      event: { kind: "context-created", context: params?.context }
    });
  }
});
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (tabId === void 0) return;
  log(tabId, "warn", `调试器已断开: ${reason}`);
  hooks.onReset?.(tabId, "debugger detached: " + reason);
  attachedTabs.delete(tabId);
  rejectPending(tabId, "调试器已断开: " + reason);
  instrumentationBps.delete(tabId);
  tabStatus.set(tabId, "disconnected");
  emit(tabId, {
    type: "debugger-event",
    event: { kind: "status-changed", status: "disconnected", error: reason }
  });
});
async function attach(tabId, opts = {}) {
  if (attachedTabs.has(tabId)) {
    log(tabId, "info", "已连接");
    return;
  }
  tabStatus.set(tabId, "connecting");
  emit(tabId, { type: "debugger-event", event: { kind: "status-changed", status: "connecting" } });
  try {
    await new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    attachedTabs.add(tabId);
    await sendCommand(tabId, "Debugger.enable", {});
    if (opts.instrumentation) await setInstrumentation(tabId, true);
    await sendCommand(tabId, "Runtime.enable", {});
    tabStatus.set(tabId, "connected");
    emit(tabId, { type: "debugger-event", event: { kind: "status-changed", status: "connected" } });
    log(tabId, "info", "已连接");
  } catch (err) {
    tabStatus.set(tabId, "error");
    const message = err.message || "连接失败";
    emit(tabId, {
      type: "debugger-event",
      event: { kind: "status-changed", status: "error", error: message }
    });
    log(tabId, "error", message);
    throw err;
  }
}
async function setInstrumentation(tabId, enabled) {
  if (!attachedTabs.has(tabId)) return;
  const existing = instrumentationBps.get(tabId);
  if (enabled && !existing) {
    try {
      const r = await sendCommand(tabId, "Debugger.setInstrumentationBreakpoint", { instrumentation: "beforeScriptExecution" });
      if (r && r.breakpointId) instrumentationBps.set(tabId, r.breakpointId);
      log(tabId, "info", "已启用 beforeScriptExecution 插桩断点（自动捕获）");
    } catch (err) {
      log(tabId, "warn", "插桩断点不可用，顶层立即执行的调用可能漏捕获: " + err.message);
    }
  } else if (!enabled && existing) {
    instrumentationBps.delete(tabId);
    try {
      await sendCommand(tabId, "Debugger.removeBreakpoint", { breakpointId: existing });
      log(tabId, "info", "已移除 beforeScriptExecution 插桩断点");
    } catch {
    }
  }
}
async function detach(tabId) {
  if (!attachedTabs.has(tabId)) return;
  const instrId = instrumentationBps.get(tabId);
  instrumentationBps.delete(tabId);
  if (instrId) {
    try {
      await sendCommand(tabId, "Debugger.removeBreakpoint", { breakpointId: instrId });
    } catch {
    }
  }
  try {
    await new Promise((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    attachedTabs.delete(tabId);
    rejectPending(tabId, "调试器已断开（主动断开）");
    tabStatus.set(tabId, "disconnected");
    emit(tabId, { type: "debugger-event", event: { kind: "status-changed", status: "disconnected" } });
    log(tabId, "info", "已断开");
  } catch (err) {
    log(tabId, "error", `断开失败: ${err.message}`);
  }
}
function getStatus(tabId) {
  return tabStatus.get(tabId) || "disconnected";
}
async function sendCommand(tabId, method, params, timeoutMs = SEND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!attachedTabs.has(tabId)) {
      reject(new Error("调试器未连接"));
      return;
    }
    const owner = pendingCommands.get(tabId) ?? /* @__PURE__ */ new Set();
    pendingCommands.set(tabId, owner);
    const entry = {
      method,
      reject,
      timer: setTimeout(() => {
        owner.delete(entry);
        reject(new Error("CDP command timed out: " + method + " (" + timeoutMs + "ms)"));
      }, timeoutMs)
    };
    owner.add(entry);
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
      const lastError = chrome.runtime.lastError;
      clearTimeout(entry.timer);
      if (!owner.delete(entry)) return;
      if (lastError) {
        reject(new Error(lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}
async function resume(tabId) {
  try {
    await sendCommand(tabId, "Debugger.resume", {});
    log(tabId, "info", "已恢复执行");
  } catch (err) {
    log(tabId, "error", `恢复失败: ${err.message}`);
    throw err;
  }
}
async function getScriptSource(tabId, scriptId) {
  try {
    const result = await sendCommand(tabId, "Debugger.getScriptSource", { scriptId });
    return result.scriptSource || "";
  } catch (err) {
    log(tabId, "error", `获取脚本源码失败: ${err.message}`);
    return "";
  }
}
function addEventListener(listener) {
  eventListeners.add(listener);
}
async function handleInstrumentation(tabId, params) {
  try {
    if (hooks.onInstrumentation) await hooks.onInstrumentation(tabId, params);
  } catch (err) {
    log(tabId, "error", `插桩处理失败（已恢复页面执行）: ${err && err.message ? err.message : String(err)}`);
  } finally {
    try {
      await sendCommand(tabId, "Debugger.resume", {});
    } catch (err) {
      const msg = err && err.message ? String(err.message) : String(err);
      if (!msg.includes("while paused") && !msg.includes("未连接")) log(tabId, "error", `插桩暂停恢复失败: ${msg}`);
    }
  }
}
function emit(tabId, msg) {
  for (const listener of eventListeners) {
    listener(tabId, msg);
  }
}
function log(tabId, level, message) {
  emit(tabId, { type: "debugger-event", event: { kind: "log", level, message } });
}
function handlePaused(tabId, params) {
  const callFrames = params.callFrames || [];
  const reason = params.reason || "unknown";
  const info = {
    reason,
    callFrames: callFrames.map((cf) => ({
      callFrameId: cf.callFrameId,
      functionName: cf.functionName || "(anonymous)",
      location: {
        scriptId: cf.location?.scriptId || "",
        lineNumber: cf.location?.lineNumber || 0,
        columnNumber: cf.location?.columnNumber || 0
      },
      url: cf.url || ""
    }))
  };
  log(tabId, "info", `已暂停 (${reason})`);
  emit(tabId, { type: "debugger-event", event: { kind: "paused", info } });
}
function handleScriptParsed(tabId, params) {
  const info = {
    scriptId: params.scriptId,
    url: params.url || "",
    startLine: params.startLine || 0,
    startColumn: params.startColumn || 0,
    endLine: params.endLine || 0,
    endColumn: params.endColumn || 0,
    sourceMapURL: params.sourceMapURL
  };
  emit(tabId, { type: "debugger-event", event: { kind: "script-parsed", info } });
}
class ScriptCollector {
  scripts = /* @__PURE__ */ new Map();
  sourceHashMap = /* @__PURE__ */ new Map();
  // hash → scriptId（去重）
  /**
   * 记录新脚本（来自 Debugger.scriptParsed 事件）
   */
  addScript(info) {
    if (this.scripts.has(info.scriptId)) {
      return null;
    }
    const isDynamic = info.url.startsWith("eval:") || info.url === "" || info.url.includes("VM");
    const script = {
      scriptId: info.scriptId,
      url: info.url,
      executionContextId: info.executionContextId,
      startLine: info.startLine,
      startColumn: info.startColumn,
      endLine: info.endLine,
      endColumn: info.endColumn,
      sourceMapURL: info.sourceMapURL,
      hash: "",
      // 未获取源码时为空
      isDynamic,
      source: null,
      analyzed: false
    };
    this.scripts.set(info.scriptId, script);
    return script;
  }
  /**
   * 设置脚本源码（来自 Debugger.getScriptSource）
   */
  setScriptSource(scriptId, source) {
    const script = this.scripts.get(scriptId);
    if (!script) return;
    script.source = source;
    script.hash = this.hashSource(source);
    this.sourceHashMap.get(script.hash);
    this.sourceHashMap.set(script.hash, scriptId);
  }
  /**
   * 标记脚本分析完成
   */
  markAnalyzed(scriptId, result, error) {
    const script = this.scripts.get(scriptId);
    if (!script) return;
    script.analyzed = true;
    script.discoveryResult = result;
    if (error) script.analysisError = error;
  }
  /**
   * 获取脚本
   */
  getScript(scriptId) {
    return this.scripts.get(scriptId);
  }
  /**
   * 获取所有脚本列表
   */
  getAllScripts() {
    return Array.from(this.scripts.values());
  }
  /**
   * 获取未获取源码的脚本
   */
  getScriptsNeedingSource() {
    return Array.from(this.scripts.values()).filter((s) => s.source === null);
  }
  /**
   * 获取已获取源码但未分析的脚本
   */
  getScriptsNeedingAnalysis() {
    return Array.from(this.scripts.values()).filter(
      (s) => s.source !== null && !s.analyzed
    );
  }
  /**
   * 清空所有脚本（页面刷新时）
   */
  clear() {
    this.scripts.clear();
    this.sourceHashMap.clear();
  }
  /**
   * 统计信息
   */
  getStats() {
    const all = Array.from(this.scripts.values());
    return {
      total: all.length,
      withSource: all.filter((s) => s.source !== null).length,
      analyzed: all.filter((s) => s.analyzed).length,
      dynamic: all.filter((s) => s.isDynamic).length,
      failed: all.filter((s) => s.analysisError).length
    };
  }
  hashSource(source) {
    const sample = source.slice(0, 1e3);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      hash = (hash << 5) - hash + sample.charCodeAt(i) | 0;
    }
    return `${hash.toString(16)}_${source.length}`;
  }
}
const DEFAULTS = {
  maxRecords: 2e3,
  maxHits: 2e4,
  maxPending: 100,
  maxReturnSteps: 20,
  watchdogMs: 8e3,
  maxStringLength: 2e3,
  commandTimeoutMs: 5e3
};
const MAX_CALL_LOCATIONS = 50;
const MAX_OBSERVATIONS = 200;
function addCallLocation(cap, pos) {
  if (pos.lineNumber < 0) return;
  if (cap.callLocations.some((p) => p.lineNumber === pos.lineNumber && p.columnNumber === pos.columnNumber)) return;
  if (cap.callLocations.length >= MAX_CALL_LOCATIONS) {
    cap.callLocationsTruncated = true;
    return;
  }
  cap.callLocations.push({ lineNumber: pos.lineNumber, columnNumber: pos.columnNumber });
}
function addObservation(cap, meta) {
  if (!cap.observations) cap.observations = [];
  if (cap.observations.length >= MAX_OBSERVATIONS) {
    cap.observationsTruncated = true;
    return;
  }
  cap.observations.push(meta);
}
function freshStats() {
  return { breakpointsSet: 0, hits: 0, pauses: 0, success: 0, failed: 0, forcedResumes: 0, foreignPauses: 0 };
}
class CaptureEngine {
  constructor(send, emit2, options = {}) {
    this.send = send;
    this.emit = emit2;
    this.opt = { ...DEFAULTS, ...options };
  }
  bps = /* @__PURE__ */ new Map();
  setKeys = /* @__PURE__ */ new Set();
  /** 断点位置 -> 断点编号：同一位置只能设一个断点，入口和 return 重合时合并为 both */
  locs = /* @__PURE__ */ new Map();
  /** 已被我们移除的断点编号：stop() 之后才到达的暂停事件仍可能引用它们 */
  retired = /* @__PURE__ */ new Set();
  seq = 0;
  /** 逐条观测序号：与合并记录的 seq 分开，保证元数据能追溯到第几次真实观测 */
  obsSeq = 0;
  pending = [];
  table = /* @__PURE__ */ new Map();
  chain = Promise.resolve();
  active = false;
  stepRequested = false;
  lastOwn = false;
  limitHit = false;
  pausedSince = null;
  timer = null;
  /** stepOver 的回复被放弃等待后，对这次单步可能产生的迟到暂停的认领期限 */
  stepExpiry = null;
  stats = freshStats();
  opt;
  isActive() {
    return this.active;
  }
  /** 同步判断：这次暂停是否由我们的断点或我们发起的 stepOver 引起 */
  ownsPause(params) {
    if (this.stepRequested) return true;
    return (params?.hitBreakpoints ?? []).some((id) => this.bps.has(id) || this.retired.has(id));
  }
  getStats() {
    return { ...this.stats };
  }
  getCaptures() {
    return Array.from(this.table.values());
  }
  getBreakpointCount() {
    return this.bps.size;
  }
  /**
   * Phase 4.7：只读观测。按 scriptId 汇总本引擎当前真实持有的断点数（只统计 setBreakpoint 成功后登记在 bps 里的断点）。
   * 不改变断点、捕获、验证、替换语义；返回的是新对象，调用方修改它不会影响引擎。
   */
  getBreakpointsByScript() {
    const out = {};
    for (const info of this.bps.values()) {
      const id = info.target.scriptId;
      out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  }
  /**
   * 所有发往 CDP 的命令都经过这里：commandTimeoutMs 内没有回复就拒绝，避免一个永不返回的命令把串行链永久堵死。
   * 超时只表示不再等待，不代表命令没有生效；迟到的回复交给 onLate（例如撤销迟到才建立的断点），否则忽略。
   */
  cmd(method, params, onLate) {
    const ms = this.opt.commandTimeoutMs;
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("CDP command timed out: " + method + " (" + ms + "ms)"));
      }, ms);
      let call;
      try {
        call = Promise.resolve(this.send(method, params));
      } catch (e) {
        clearTimeout(timer);
        reject(e);
        return;
      }
      call.then(
        (result) => {
          clearTimeout(timer);
          if (!timedOut) resolve(result);
          else if (onLate) onLate(result);
        },
        (e) => {
          clearTimeout(timer);
          if (!timedOut) reject(e);
        }
      );
    });
  }
  /** setBreakpoint 超时之后才到达的回复：这个断点我们没有跟踪，但它已经在页面里。登记为已移除（它引起的暂停会被恢复）并尽力删除 */
  retireLate(late) {
    const id = late && late.breakpointId;
    if (typeof id !== "string") return;
    this.retired.add(id);
    this.cmd("Debugger.removeBreakpoint", { breakpointId: id }).catch(() => void 0);
  }
  clearStepExpiry() {
    if (this.stepExpiry !== null) {
      clearTimeout(this.stepExpiry);
      this.stepExpiry = null;
    }
  }
  async start(targets) {
    const result = { set: 0, skipped: [], errors: [] };
    this.active = true;
    this.limitHit = false;
    let stalled = false;
    for (const target of targets) {
      if (stalled) break;
      const plan = target.plan;
      if (!plan.supported || !plan.entry) {
        result.skipped.push({ functionName: target.functionName, scriptId: target.scriptId, reason: plan.reason ?? "unsupported function shape" });
        continue;
      }
      const jobs = [{ pos: plan.entry, kind: "entry" }];
      for (const r of plan.returns) jobs.push({ pos: r, kind: "exit" });
      if (plan.closing) jobs.push({ pos: plan.closing, kind: "exit" });
      for (const job of jobs) {
        const err = await this.setOne(target, job.pos, job.kind);
        if (err === "dup") continue;
        if (err) {
          result.errors.push(target.functionName + " " + job.kind + " " + job.pos.lineNumber + ":" + job.pos.columnNumber + " - " + err);
          if (err.includes("timed out")) {
            stalled = true;
            result.errors.push("Debugger.setBreakpoint 无回复，放弃布置剩余断点（调试通道可能已失效）");
            break;
          }
        } else {
          result.set++;
        }
      }
    }
    if (!this.timer) this.timer = setInterval(() => {
      void this.checkWatchdog();
    }, 1e3);
    this.emit({ kind: "log", level: "info", message: "runtime capture started: " + this.bps.size + " breakpoints, " + result.skipped.length + " skipped, " + result.errors.length + " errors" });
    return result;
  }
  async setOne(target, pos, kind) {
    const entry = target.plan.entry;
    const key = [target.scriptId, entry.lineNumber, entry.columnNumber, pos.lineNumber, pos.columnNumber, kind].join(":");
    if (this.setKeys.has(key)) return "dup";
    const lk = target.scriptId + ":" + pos.lineNumber + ":" + pos.columnNumber;
    const existingId = this.locs.get(lk);
    if (existingId) {
      const info = this.bps.get(existingId);
      if (info && info.kind !== kind && info.kind !== "both") info.kind = "both";
      this.setKeys.add(key);
      return "dup";
    }
    try {
      const r = await this.cmd("Debugger.setBreakpoint", { location: { scriptId: target.scriptId, lineNumber: pos.lineNumber, columnNumber: pos.columnNumber } }, (late) => this.retireLate(late));
      this.setKeys.add(key);
      this.bps.set(r.breakpointId, { target, kind });
      this.locs.set(lk, r.breakpointId);
      this.stats.breakpointsSet++;
      return null;
    } catch (e) {
      return e && e.message ? e.message : String(e);
    }
  }
  onPaused(params) {
    const wasStepping = this.stepRequested;
    if (wasStepping) {
      this.stepRequested = false;
      this.clearStepExpiry();
    }
    this.chain = this.chain.then(() => this.handle(params, wasStepping)).catch(async (e) => {
      const msg = e && e.message ? e.message : String(e);
      this.emit({ kind: "log", level: msg.includes("while paused") ? "warn" : "error", message: "capture handler error: " + msg });
      this.failPending(() => true, "capture handler error: " + msg);
      if (this.lastOwn) await this.safeResume();
    });
    return this.chain;
  }
  onResumed() {
    this.pausedSince = null;
  }
  async handle(p, wasStepping) {
    this.lastOwn = false;
    const frames = p.callFrames ?? [];
    const top = frames[0];
    const hits = (p.hitBreakpoints ?? []).map((id) => this.bps.get(id)).filter((x) => !!x);
    const retiredHit = (p.hitBreakpoints ?? []).some((id) => this.retired.has(id));
    if (!this.active) {
      if (hits.length > 0 || wasStepping || retiredHit) {
        this.lastOwn = true;
        await this.safeResume();
      } else {
        this.stats.foreignPauses++;
        this.emit({ kind: "foreign-pause" });
      }
      return;
    }
    if (!top || hits.length === 0 && !wasStepping) {
      this.stats.foreignPauses++;
      this.emit({ kind: "foreign-pause" });
      return;
    }
    this.lastOwn = true;
    this.pausedSince = Date.now();
    this.stats.pauses++;
    const depth = frames.length;
    const entryHit = hits.find((h) => h.kind === "entry" || h.kind === "both");
    const exitHit = hits.find((h) => h.kind === "exit" || h.kind === "both");
    const entryHitId = (p.hitBreakpoints ?? []).find((id) => {
      const info = this.bps.get(id);
      return !!info && info === entryHit;
    });
    if (entryHit) {
      this.stats.hits++;
      this.failPending((x) => x.depth >= depth, "function exited without a return pause (exception or abnormal exit)");
      await this.openPending(entryHit.target, frames, depth, entryHitId !== void 0 ? { ...entryHit, id: entryHitId } : void 0);
      if (this.stats.hits >= this.opt.maxHits && !this.limitHit) {
        this.limitHit = true;
        this.emit({ kind: "limit-reached", limit: "maxHits=" + this.opt.maxHits });
      }
    }
    const needStep = this.advance(top, depth, !!exitHit);
    if (needStep && this.active && !this.limitHit) {
      this.stepRequested = true;
      try {
        await this.cmd("Debugger.stepOver");
      } catch (e) {
        this.clearStepExpiry();
        this.stepExpiry = setTimeout(() => {
          this.stepRequested = false;
          this.stepExpiry = null;
        }, this.opt.watchdogMs);
        throw e;
      }
      this.pausedSince = null;
    } else {
      await this.cmd("Debugger.resume");
      this.pausedSince = null;
    }
    if (this.limitHit && this.active) await this.stopNow();
  }
  async openPending(target, frames, depth, hit) {
    const top = frames[0];
    const caller = frames[1];
    const callLocation = caller && caller.location ? { lineNumber: caller.location.lineNumber, columnNumber: caller.location.columnNumber } : { lineNumber: -1, columnNumber: -1 };
    const openedAt = Date.now();
    const meta = {
      hitBreakpointId: hit ? hit.id : void 0,
      hitBreakpointKind: hit ? hit.kind : void 0,
      openedAt
    };
    const hasLocal = (top.scopeChain ?? []).some((s) => s.type === "local");
    if (!top.functionName || !hasLocal) {
      this.record({ target, frameName: top.functionName || "", depth, args: [], callLocation, awaitRet: false, steps: 0, ...meta }, "capture-failed", void 0, "entry breakpoint did not land inside the function body (top frame is not the target function)", "openPending");
      return;
    }
    let args;
    try {
      args = await this.readArgs(top, target.plan.paramNames);
    } catch (e) {
      this.record({ target, frameName: top.functionName || "", depth, args: [], callLocation, awaitRet: false, steps: 0, ...meta }, "capture-failed", void 0, "could not read arguments: " + (e && e.message ? e.message : String(e)), "openPending");
      return;
    }
    this.pending.push({ target, frameName: top.functionName || "", depth, args, callLocation, awaitRet: false, steps: 0, ...meta });
    if (this.pending.length > this.opt.maxPending) {
      const dropped = this.pending.shift();
      this.record(dropped, "capture-failed", void 0, "pending queue overflow (maxPending=" + this.opt.maxPending + ")", "openPending");
    }
  }
  async readArgs(frame, names) {
    const scope = (frame.scopeChain ?? []).find((s) => s.type === "local");
    if (!scope || !scope.object || !scope.object.objectId) throw new Error("no local scope");
    const res = await this.cmd("Runtime.getProperties", { objectId: scope.object.objectId, ownProperties: true });
    const map = /* @__PURE__ */ new Map();
    for (const prop of res.result ?? []) map.set(prop.name, prop.value);
    return names.map((n) => map.has(n) ? this.toValue(map.get(n)) : { type: "missing" });
  }
  /** 只序列化原始值；对象/数组只保留类型和 description，不展开、不读 getter */
  toValue(r) {
    if (!r || r.type === "undefined") return { type: "undefined" };
    if (r.subtype === "null") return { type: "null", value: null };
    if (r.type === "string") {
      const s = String(r.value ?? "");
      if (s.length > this.opt.maxStringLength) return { type: "string", value: s.slice(0, this.opt.maxStringLength), truncated: true };
      return { type: "string", value: s };
    }
    if ("value" in r) return { type: r.type, value: r.value };
    if (r.unserializableValue) return { type: r.type, unserializable: r.unserializableValue };
    const d = r.description ? String(r.description) : void 0;
    return { type: r.type, subtype: r.subtype, description: d && d.length > 200 ? d.slice(0, 200) : d };
  }
  advance(top, depth, exitHit) {
    this.failPending((x) => x.depth > depth, "left the function without a returnValue pause (function may have thrown)", "advance");
    const name = top.functionName || "";
    let idx = -1;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].depth === depth && this.pending[i].frameName === name) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return false;
    const pd = this.pending[idx];
    if ("returnValue" in top) {
      this.pending.splice(idx, 1);
      this.record(pd, "success", this.toValue(top.returnValue));
      return false;
    }
    if (exitHit && !pd.awaitRet) {
      pd.awaitRet = true;
      return true;
    }
    if (pd.awaitRet) {
      pd.steps++;
      if (pd.steps >= this.opt.maxReturnSteps) {
        this.pending.splice(idx, 1);
        this.record(pd, "capture-failed", void 0, "no returnValue after " + this.opt.maxReturnSteps + " steps from the return statement", "advance");
        return false;
      }
      return true;
    }
    return false;
  }
  failPending(pred, reason, stage = "failPending") {
    const keep = [];
    for (const p of this.pending) {
      if (pred(p)) this.record(p, "capture-failed", void 0, reason, stage);
      else keep.push(p);
    }
    this.pending = keep;
  }
  record(pd, status, rv, reason, failureStage) {
    const t = pd.target;
    const loc = t.plan.entry;
    if (status === "success") this.stats.success++;
    else this.stats.failed++;
    const key = [t.scriptId, loc.lineNumber, loc.columnNumber, JSON.stringify(pd.args), status, status === "success" ? JSON.stringify(rv) : reason].join("|");
    const obsSeq = ++this.obsSeq;
    const seq = ++this.seq;
    const meta = {
      seq: obsSeq,
      depth: pd.depth,
      frameName: pd.frameName,
      timestamp: pd.openedAt,
      status
    };
    if (pd.hitBreakpointId !== void 0) {
      meta.hitBreakpointId = pd.hitBreakpointId;
      meta.hitBreakpointKind = pd.hitBreakpointKind;
    }
    if (pd.callLocation.lineNumber >= 0) meta.callLocation = { lineNumber: pd.callLocation.lineNumber, columnNumber: pd.callLocation.columnNumber };
    if (status !== "success" && failureStage !== void 0) meta.failureStage = failureStage;
    const existing = this.table.get(key);
    if (existing) {
      existing.count++;
      addCallLocation(existing, pd.callLocation);
      addObservation(existing, meta);
      existing.lastSeq = seq;
      existing.timestamp = Date.now();
      this.emit({ kind: "capture", capture: existing });
      return;
    }
    if (this.table.size >= this.opt.maxRecords) {
      if (!this.limitHit) {
        this.limitHit = true;
        this.emit({ kind: "limit-reached", limit: "maxRecords=" + this.opt.maxRecords });
      }
      return;
    }
    const cap = {
      key,
      scriptId: t.scriptId,
      scriptUrl: t.scriptUrl,
      functionName: t.functionName,
      functionLocation: loc,
      callLocation: pd.callLocation,
      callLocations: pd.callLocation.lineNumber >= 0 ? [{ lineNumber: pd.callLocation.lineNumber, columnNumber: pd.callLocation.columnNumber }] : [],
      arguments: pd.args,
      returnValue: rv,
      captureStatus: status,
      reason,
      count: 1,
      firstSeq: seq,
      lastSeq: seq,
      timestamp: Date.now(),
      observations: [meta]
    };
    this.table.set(key, cap);
    this.emit({ kind: "capture", capture: cap });
  }
  async safeResume() {
    this.pausedSince = null;
    try {
      await this.cmd("Debugger.resume");
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const benign = msg.includes("while paused");
      this.emit({ kind: "log", level: benign ? "info" : "error", message: benign ? "resume skipped: the page was no longer paused (navigation or already resumed)" : "resume failed: " + msg });
    }
  }
  /** 看门狗：我们自己的暂停超过 watchdogMs 仍未恢复则强制 resume；绝不动用户自己的暂停 */
  async checkWatchdog(now = Date.now()) {
    if (this.pausedSince === null || !this.lastOwn) return;
    if (now - this.pausedSince <= this.opt.watchdogMs) return;
    this.stats.forcedResumes++;
    this.emit({ kind: "log", level: "warn", message: "watchdog: forcing resume after " + this.opt.watchdogMs + "ms" });
    this.failPending(() => true, "watchdog forced resume");
    await this.safeResume();
  }
  /** 停止捕获：只移除自己创建的断点，恢复自己造成的暂停 */
  stop() {
    this.active = false;
    this.chain = this.chain.then(() => this.stopNow());
    return this.chain;
  }
  async stopNow() {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.failPending(() => true, "capture stopped before the function returned", "stopNow");
    let stalled = false;
    for (const id of Array.from(this.bps.keys())) {
      this.retired.add(id);
      if (stalled) continue;
      try {
        await this.cmd("Debugger.removeBreakpoint", { breakpointId: id });
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        this.emit({ kind: "log", level: "warn", message: "removeBreakpoint failed: " + msg });
        if (msg.includes("timed out")) {
          stalled = true;
          this.emit({ kind: "log", level: "warn", message: "removeBreakpoint timed out: 调试通道无回复，剩余断点不再逐个移除，已登记为已移除，它们引起的暂停会被自动恢复" });
        }
      }
    }
    this.bps.clear();
    this.setKeys.clear();
    this.locs.clear();
    if (this.pausedSince !== null && this.lastOwn) await this.safeResume();
  }
  /** 页面刷新 / 调试器断开：断点已随目标失效，不再发送命令，只清理本地状态 */
  reset(reason) {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearStepExpiry();
    this.failPending(() => true, reason);
    this.bps.clear();
    this.setKeys.clear();
    this.locs.clear();
    this.retired.clear();
    this.stepRequested = false;
    this.pausedSince = null;
    this.limitHit = false;
  }
  /**
   * 页面导航但用户仍在捕获：旧文档的断点已失效，清掉本地断点与待处理项，
   * 但保留 active（用户意图）与已捕获记录，让新文档的插桩暂停仍能布置断点。
   */
  softReset(reason) {
    this.clearStepExpiry();
    this.failPending(() => true, reason);
    this.bps.clear();
    this.setKeys.clear();
    this.locs.clear();
    this.retired.clear();
    this.stepRequested = false;
    this.pausedSince = null;
    this.limitHit = false;
  }
  clear() {
    this.table.clear();
    this.obsSeq = 0;
    const bp = this.stats.breakpointsSet;
    this.stats = freshStats();
    this.stats.breakpointsSet = bp;
    this.limitHit = false;
  }
  /**
   * 稳定性分析：同一函数 + 同一参数组合，是否出现过多个不同返回值。
   * 不做任何覆盖：去重表按「参数 + 返回值」分别保存，这里只是分组统计。
   * 只用序号（执行顺序）与脚本/函数位置判断，不依赖时间戳。
   */
  getStability() {
    const groups = /* @__PURE__ */ new Map();
    for (const cap of this.table.values()) {
      if (cap.captureStatus !== "success") continue;
      const gk = [cap.scriptId, cap.functionLocation.lineNumber, cap.functionLocation.columnNumber, cap.functionName, JSON.stringify(cap.arguments)].join("|");
      const arr = groups.get(gk);
      if (arr) arr.push(cap);
      else groups.set(gk, [cap]);
    }
    const out = [];
    for (const arr of groups.values()) {
      const ordered = [];
      const seen = /* @__PURE__ */ new Set();
      for (const c of arr.sort((a, b) => a.firstSeq - b.firstSeq)) {
        const k = JSON.stringify(c.returnValue);
        if (!seen.has(k)) {
          seen.add(k);
          ordered.push(c.returnValue);
        }
      }
      const callCount = arr.reduce((s, c) => s + c.count, 0);
      const seqs = arr.flatMap((c) => [c.firstSeq, c.lastSeq]);
      out.push({
        scriptId: arr[0].scriptId,
        scriptUrl: arr[0].scriptUrl,
        functionName: arr[0].functionName,
        functionLocation: arr[0].functionLocation,
        arguments: arr[0].arguments,
        values: ordered,
        distinctReturnCount: ordered.length,
        callCount,
        stable: ordered.length === 1,
        firstSeq: Math.min(...seqs),
        lastSeq: Math.max(...seqs)
      });
    }
    return out.sort((a, b) => a.firstSeq - b.firstSeq);
  }
}
const NOT_PAUSED = "当前没有处于暂停状态的调用栈（未收到用户断点暂停，或执行已恢复）";
const MAX_SCOPE_VARIABLES = 1e3;
class ManualCapture {
  constructor(send, options = {}, resolveScriptUrl = () => "") {
    this.send = send;
    this.resolveScriptUrl = resolveScriptUrl;
    this.options = {
      enabled: true,
      autoDetectCalls: true,
      captureLocals: false,
      ...options
    };
  }
  records = [];
  options;
  /** 当前暂停的完整 callFrames；恢复执行或页面重置后为 null */
  pausedFrames = null;
  isEnabled() {
    return this.options.enabled;
  }
  setEnabled(enabled) {
    this.options.enabled = enabled;
  }
  getOptions() {
    return { ...this.options };
  }
  setOptions(options) {
    this.options = { ...this.options, ...options };
  }
  getRecords() {
    return [...this.records];
  }
  clear() {
    this.records = [];
  }
  /** 当前是否持有一个有效的暂停调用栈 */
  isPaused() {
    return this.pausedFrames !== null;
  }
  /** Debugger.resumed：保存的调用栈失效 */
  onResumed() {
    this.pausedFrames = null;
  }
  /** 页面刷新 / 调试器断开：保存的调用栈失效 */
  onReset() {
    this.pausedFrames = null;
  }
  /**
   * 处理用户手动断点触发的暂停事件（不会 resume，不会 step）
   *
   * @param params Debugger.paused 事件参数
   */
  async onManualPause(params) {
    if (!this.options.enabled) {
      return { handled: false };
    }
    const callFrames = params.callFrames || [];
    if (callFrames.length === 0) {
      this.pausedFrames = null;
      return { handled: false };
    }
    this.pausedFrames = callFrames;
    const topFrame = callFrames[0];
    const location = topFrame.location;
    const functionName = topFrame.functionName || "(anonymous)";
    const scriptId = location?.scriptId || "";
    const scriptUrl = this.urlOf(scriptId, topFrame.url);
    const record = {
      timestamp: Date.now(),
      scriptId,
      scriptUrl,
      location: {
        lineNumber: location?.lineNumber ?? 0,
        columnNumber: location?.columnNumber ?? 0
      },
      functionName,
      expression: "",
      stackDepth: callFrames.length
    };
    if (this.options.captureLocals) {
      try {
        record.localVariables = await this.readLocals(topFrame);
      } catch (e) {
      }
    }
    if (this.options.autoDetectCalls) ;
    this.records.push(record);
    return { handled: true, record };
  }
  /** 当前暂停的调用栈（按 frameIndex 编号，0 = 栈顶） */
  getFrames() {
    if (!this.pausedFrames) return { success: false, error: NOT_PAUSED };
    return {
      success: true,
      frames: this.pausedFrames.map((cf, index) => this.frameInfo(cf, index))
    };
  }
  /** 读取指定帧的作用域链（Local / Closure / Block 等逐层展开，global 不展开） */
  async getScopes(frameIndex) {
    const p = this.pick(frameIndex);
    if (!p.frame) return { success: false, error: p.error };
    const frame = p.frame;
    const scopes = [];
    for (const s of frame.scopeChain ?? []) {
      const info = { type: s.type, variables: {} };
      if (s.name) info.name = s.name;
      if (s.type === "global") {
        info.skipped = "global 作用域不展开";
      } else if (s.object && s.object.objectId) {
        try {
          const r = await this.readObject(s.object.objectId);
          info.variables = r.variables;
          if (r.truncated) info.truncated = true;
        } catch (e) {
          info.skipped = "读取失败: " + (e && e.message ? e.message : String(e));
        }
      }
      scopes.push(info);
    }
    return { success: true, frameIndex, functionName: frame.functionName || "(anonymous)", scopes };
  }
  /**
   * 在指定帧中求值表达式。
   * frameIndex 优先（按当前暂停调用栈解析出 callFrameId）；只给 callFrameId 时直接使用。
   * 同时给出且互相矛盾时拒绝。
   */
  async evaluateOnFrame(target, expression) {
    if (typeof expression !== "string" || expression.trim() === "") {
      return { success: false, error: "表达式不能为空" };
    }
    let callFrameId = target.callFrameId;
    if (target.frameIndex !== void 0 && target.frameIndex !== null) {
      const p = this.pick(target.frameIndex);
      if (!p.frame) return { success: false, error: p.error };
      if (callFrameId && callFrameId !== p.frame.callFrameId) {
        return { success: false, error: "callFrameId 与 frameIndex 指向的帧不一致" };
      }
      callFrameId = p.frame.callFrameId;
    }
    if (!callFrameId) {
      return { success: false, error: "必须提供 callFrameId 或 frameIndex" };
    }
    return this.evaluateOnCallFrame(callFrameId, expression);
  }
  /**
   * 在指定 callFrameId 中求值表达式（不 resume，不 step）
   */
  async evaluateOnCallFrame(callFrameId, expression) {
    try {
      const res = await this.send("Debugger.evaluateOnCallFrame", {
        callFrameId,
        expression,
        silent: true,
        throwOnSideEffect: true
      });
      if (res.exceptionDetails) {
        const description = String(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "evaluation threw");
        if (description.includes("Possible side-effect in debug-evaluate")) {
          return { success: false, sideEffectBlocked: true, error: "V8 的 throwOnSideEffect 拒绝了这次求值（可能有副作用）：" + description };
        }
        return { success: false, error: description };
      }
      return {
        success: true,
        result: this.toValue(res.result)
      };
    } catch (e) {
      return {
        success: false,
        error: e && e.message ? e.message : String(e)
      };
    }
  }
  pick(frameIndex) {
    if (!this.pausedFrames) return { error: NOT_PAUSED };
    if (typeof frameIndex !== "number" || !Number.isInteger(frameIndex)) {
      return { error: "frameIndex 必须是整数" };
    }
    if (frameIndex < 0 || frameIndex >= this.pausedFrames.length) {
      return { error: `frameIndex 越界：${frameIndex}（当前共 ${this.pausedFrames.length} 帧）` };
    }
    return { frame: this.pausedFrames[frameIndex] };
  }
  frameInfo(cf, index) {
    const scriptId = cf.location?.scriptId || "";
    return {
      index,
      callFrameId: cf.callFrameId,
      functionName: cf.functionName || "(anonymous)",
      scriptId,
      scriptUrl: this.urlOf(scriptId, cf.url),
      location: {
        lineNumber: cf.location?.lineNumber ?? 0,
        columnNumber: cf.location?.columnNumber ?? 0
      },
      scopeTypes: (cf.scopeChain ?? []).map((s) => s.type)
    };
  }
  /** Chrome 的 callFrame.url 可能为空，此时用 scriptId 向脚本收集器反查 */
  urlOf(scriptId, fromFrame) {
    if (fromFrame) return fromFrame;
    if (!scriptId) return "";
    try {
      return this.resolveScriptUrl(scriptId) || "";
    } catch {
      return "";
    }
  }
  /** 读取指定 frame 的局部变量 */
  async readLocals(frame) {
    const scope = (frame.scopeChain ?? []).find((s) => s.type === "local");
    if (!scope || !scope.object || !scope.object.objectId) {
      return {};
    }
    return (await this.readObject(scope.object.objectId)).variables;
  }
  async readObject(objectId) {
    const res = await this.send("Runtime.getProperties", {
      objectId,
      ownProperties: true
    });
    const variables = {};
    let n = 0;
    let truncated = false;
    for (const prop of res.result ?? []) {
      if (!prop.name || !prop.value) continue;
      if (n >= MAX_SCOPE_VARIABLES) {
        truncated = true;
        break;
      }
      variables[prop.name] = this.toValue(prop.value);
      n++;
    }
    return { variables, truncated };
  }
  /** 将 CDP RemoteObject 转换为内部格式（与 CaptureEngine 一致） */
  toValue(r) {
    if (!r || r.type === "undefined") return { type: "undefined" };
    if (r.subtype === "null") return { type: "null", value: null };
    if (r.type === "string") {
      const s = String(r.value ?? "");
      const MAX_LEN = 2e3;
      if (s.length > MAX_LEN) {
        return { type: "string", value: s.slice(0, MAX_LEN), truncated: true };
      }
      return { type: "string", value: s };
    }
    if ("value" in r) return { type: r.type, value: r.value };
    if (r.unserializableValue) return { type: r.type, unserializable: r.unserializableValue };
    const d = r.description ? String(r.description) : void 0;
    return {
      type: r.type,
      subtype: r.subtype,
      description: d && d.length > 200 ? d.slice(0, 200) : d
    };
  }
}
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
function discoverDecoders(source, scriptId, scriptUrl) {
  try {
    const ast = parseCode(source);
    const functions = collectFunctions(ast, source);
    const callCounts = countCallsPerName(ast);
    const fnIndex = indexFunctionNodes(ast);
    const candidates = [];
    for (const fn of functions) {
      if (!fn.name) continue;
      const candidate = analyzeFunction(fn, ast, source, callCounts, fnIndex);
      if (candidate) candidates.push(candidate);
    }
    for (const c of candidates) {
      if (c.name) {
        c.callSites = collectCallSites(ast, c.name, source, scriptId, scriptUrl);
        c.callCount = c.callSites.length;
      }
    }
    return { scriptId, scriptUrl, functions, candidates, analyzed: true };
  } catch (err) {
    return {
      scriptId,
      scriptUrl,
      functions: [],
      candidates: [],
      analyzed: false,
      error: err.message
    };
  }
}
function collectFunctions(ast, source) {
  const results = [];
  traverse(ast, {
    // function foo() {}
    FunctionDeclaration(path) {
      const node = path.node;
      results.push({
        name: node.id?.name ?? null,
        kind: "FunctionDeclaration",
        paramCount: node.params.length,
        paramNames: node.params.map((p) => libExports.isIdentifier(p) ? p.name : "?"),
        location: nodeToLoc(node)
      });
    },
    // var x = function() {}  /  var x = function name() {}
    VariableDeclarator(path) {
      const node = path.node;
      if (!libExports.isIdentifier(node.id)) return;
      const init = node.init;
      if (!init) return;
      if (libExports.isFunctionExpression(init)) {
        results.push({
          name: node.id.name,
          kind: "FunctionExpression",
          paramCount: init.params.length,
          paramNames: init.params.map((p) => libExports.isIdentifier(p) ? p.name : "?"),
          location: nodeToLoc(node)
        });
      } else if (libExports.isArrowFunctionExpression(init)) {
        results.push({
          name: node.id.name,
          kind: "ArrowFunctionExpression",
          paramCount: init.params.length,
          paramNames: init.params.map((p) => libExports.isIdentifier(p) ? p.name : "?"),
          location: nodeToLoc(node)
        });
      }
    },
    // foo.bar = function() {}  /  obj = { bar: function() {} }
    AssignmentExpression(path) {
      const node = path.node;
      if (!libExports.isFunctionExpression(node.right) && !libExports.isArrowFunctionExpression(node.right)) return;
      const fn = node.right;
      let name = null;
      if (libExports.isIdentifier(node.left)) name = node.left.name;
      else if (libExports.isMemberExpression(node.left) && libExports.isIdentifier(node.left.property)) {
        name = node.left.property.name;
      }
      results.push({
        name,
        kind: "AssignedExpression",
        paramCount: fn.params.length,
        paramNames: fn.params.map((p) => libExports.isIdentifier(p) ? p.name : "?"),
        location: nodeToLoc(node)
      });
    },
    // { method() {} }  or  { method: function() {} }
    ObjectProperty(path) {
      const node = path.node;
      const val = node.value;
      if (!libExports.isFunctionExpression(val) && !libExports.isArrowFunctionExpression(val)) return;
      let name = null;
      if (libExports.isIdentifier(node.key)) name = node.key.name;
      else if (libExports.isStringLiteral(node.key)) name = node.key.value;
      results.push({
        name,
        kind: "ObjectMethod",
        paramCount: val.params.length,
        paramNames: val.params.map((p) => libExports.isIdentifier(p) ? p.name : "?"),
        location: nodeToLoc(node)
      });
    }
  });
  return results;
}
function indexFunctionNodes(ast) {
  const index = /* @__PURE__ */ new Map();
  traverse(ast, {
    FunctionDeclaration(path) {
      index.set("FunctionDeclaration:" + path.node.start, path.node);
    },
    VariableDeclarator(path) {
      const init = path.node.init;
      if (!libExports.isIdentifier(path.node.id)) return;
      if (libExports.isFunctionExpression(init)) index.set("FunctionExpression:" + path.node.start, init);
      else if (libExports.isArrowFunctionExpression(init)) index.set("ArrowFunctionExpression:" + path.node.start, init);
    },
    AssignmentExpression(path) {
      const right = path.node.right;
      if (libExports.isFunctionExpression(right) || libExports.isArrowFunctionExpression(right)) {
        index.set("AssignedExpression:" + path.node.start, right);
      }
    },
    ObjectProperty(path) {
      const value = path.node.value;
      if (libExports.isFunctionExpression(value) || libExports.isArrowFunctionExpression(value)) {
        index.set("ObjectMethod:" + path.node.start, value);
      }
    }
  });
  return index;
}
function analyzeFunction(fn, ast, source, callCounts, fnIndex) {
  if (!fn.name) return null;
  const funcNode = fnIndex.get(fn.kind + ":" + fn.location.start) ?? findFunctionNodeByName(ast, fn.name);
  if (!funcNode) return null;
  const body = getFunctionBody(funcNode);
  if (!body) return null;
  const evidence = [];
  const deps = [];
  const hasIndexOffset = detectIndexOffset(body, fn.paramNames);
  const { hasAccess, arrayName } = detectStringArrayAccess(body, fn.paramNames);
  const hasBase64 = detectBase64(body);
  const hasRC4 = detectRC4(body);
  const hasRotation = detectRotation(body);
  const hasReturn = detectReturn(body);
  const hasMultipleReturn = detectMultipleReturn(body);
  const callCount = callCounts.get(fn.name) ?? 0;
  let score = 0;
  if (fn.paramCount >= 1 && fn.paramCount <= 3) {
    score += 1;
    evidence.push(`参数数量 ${fn.paramCount} 个（典型值 1-3）`);
  }
  if (hasAccess) {
    score += 3;
    evidence.push(`函数体内存在字符串数组访问 [${arrayName ?? "?"}]`);
    if (arrayName) {
      deps.push({ name: arrayName, kind: "string-array", description: `通过参数索引访问字符串数组 ${arrayName}` });
    }
  }
  if (hasIndexOffset) {
    score += 2;
    evidence.push("参数存在索引偏移计算（param = param - offset 或 param -= offset）");
    deps.push({ name: "indexOffset", kind: "index-offset", description: "索引偏移运算" });
  }
  if (hasReturn) {
    score += 1;
    evidence.push("存在 return 语句返回推断值");
  }
  if (hasBase64) {
    score += 1;
    evidence.push("存在 Base64 解码调用（atob / String.fromCharCode 模式）");
    deps.push({ name: "atob", kind: "global-object", description: "Base64 解码" });
  }
  if (hasRC4) {
    score += 1;
    evidence.push("存在 RC4 特征（charCodeAt / % 256 / XOR）");
  }
  if (hasRotation) {
    score += 1;
    evidence.push("内部含有旋转逻辑（push/shift 循环）");
  }
  if (callCount >= 10) {
    score += 3;
    evidence.push(`被调用 ${callCount} 次（高频调用）`);
  } else if (callCount >= 3) {
    score += 1;
    evidence.push(`被调用 ${callCount} 次`);
  }
  let confidence;
  if (score >= 6) confidence = "high";
  else if (score >= 3) confidence = "medium";
  else return null;
  const closureVars = detectClosureVariables(funcNode, ast, fn.paramNames);
  for (const v of closureVars) {
    if (v === arrayName) continue;
    deps.push({ name: v, kind: "closure-variable", description: `引用了外部作用域变量 ${v}` });
  }
  return {
    ...fn,
    confidence,
    evidence,
    hasIndexOffset,
    hasStringArrayAccess: hasAccess,
    stringArrayName: arrayName,
    hasBase64,
    hasRC4,
    hasRotation,
    hasMultipleReturn,
    dependencies: deps,
    callCount,
    callSites: []
  };
}
function collectCallSites(ast, funcName, source, scriptId, scriptUrl) {
  const sites = [];
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      let name = null;
      if (libExports.isIdentifier(callee)) {
        name = callee.name;
      } else if (libExports.isMemberExpression(callee) && libExports.isIdentifier(callee.property) && !callee.computed) {
        name = callee.property.name;
      }
      if (name !== funcName) return;
      if (libExports.isIdentifier(callee)) {
        const binding = path.scope.getBinding(funcName);
        if (binding && !isFunctionBinding(binding)) return;
      }
      const args = path.node.arguments.map((arg) => {
        if (libExports.isStringLiteral(arg)) {
          return { nodeType: "StringLiteral", value: arg.value, isLiteral: true };
        }
        if (libExports.isNumericLiteral(arg)) {
          return { nodeType: "NumericLiteral", value: arg.value, isLiteral: true };
        }
        if (libExports.isBooleanLiteral(arg)) {
          return { nodeType: "BooleanLiteral", value: arg.value, isLiteral: true };
        }
        if (libExports.isUnaryExpression(arg, { operator: "-" }) && libExports.isNumericLiteral(arg.argument)) {
          return { nodeType: "NegativeNumeric", value: -arg.argument.value, isLiteral: true };
        }
        return { nodeType: arg.type, isLiteral: false };
      });
      const parentPath = path.parentPath;
      const parentNodeType = parentPath?.node.type ?? "Unknown";
      const callText = safeSlice(source, path.node.start, path.node.end);
      sites.push({
        scriptId,
        scriptUrl,
        location: nodeToLoc(path.node),
        callText,
        args,
        parentNodeType
      });
    }
  });
  return sites;
}
function detectIndexOffset(body, paramNames) {
  let found = false;
  const visitor = {
    AssignmentExpression(path) {
      const node = path.node;
      if ((node.operator === "-=" || node.operator === "+=") && isNumericConst(node.right) && libExports.isIdentifier(node.left) && paramNames.includes(node.left.name)) {
        found = true;
        return;
      }
      if (node.operator === "=" && libExports.isIdentifier(node.left) && paramNames.includes(node.left.name) && libExports.isBinaryExpression(node.right) && (node.right.operator === "-" || node.right.operator === "+") && libExports.isIdentifier(node.right.left) && isNumericConst(node.right.right) && paramNames.includes(node.right.left.name)) {
        found = true;
      }
    },
    // var idx = param - offset
    VariableDeclarator(path) {
      const node = path.node;
      if (node.init && libExports.isBinaryExpression(node.init) && (node.init.operator === "-" || node.init.operator === "+") && libExports.isIdentifier(node.init.left) && isNumericConst(node.init.right) && paramNames.includes(node.init.left.name)) {
        found = true;
      }
    }
  };
  traverseBody(body, visitor);
  return found;
}
function detectStringArrayAccess(body, paramNames, ast, source) {
  let hasAccess = false;
  let arrayName = null;
  const visitor = {
    MemberExpression(path) {
      const node = path.node;
      if (!node.computed) return;
      if (!libExports.isIdentifier(node.object)) return;
      const objName = node.object.name;
      if (!isIndexExpression(node.property, paramNames)) return;
      hasAccess = true;
      if (!arrayName) arrayName = objName;
    }
  };
  traverseBody(body, visitor);
  return { hasAccess, arrayName };
}
function detectBase64(body) {
  let found = false;
  const visitor = {
    CallExpression(path) {
      const node = path.node;
      if (libExports.isIdentifier(node.callee) && (node.callee.name === "atob" || node.callee.name === "btoa")) {
        found = true;
        return;
      }
      if (libExports.isMemberExpression(node.callee) && libExports.isIdentifier(node.callee.object, { name: "String" }) && libExports.isIdentifier(node.callee.property, { name: "fromCharCode" })) {
        found = true;
      }
    }
  };
  traverseBody(body, visitor);
  return found;
}
function detectRC4(body) {
  let hasCharCodeAt = false;
  let hasModulo = false;
  let hasXor = false;
  const visitor = {
    MemberExpression(path) {
      const node = path.node;
      if (libExports.isIdentifier(node.property, { name: "charCodeAt" })) hasCharCodeAt = true;
    },
    BinaryExpression(path) {
      const node = path.node;
      if (node.operator === "%") {
        if (libExports.isNumericLiteral(node.right) && node.right.value === 256) hasModulo = true;
      }
      if (node.operator === "^") hasXor = true;
    }
  };
  traverseBody(body, visitor);
  return hasCharCodeAt && (hasModulo || hasXor);
}
function detectRotation(body) {
  let found = false;
  const visitor = {
    CallExpression(path) {
      const node = path.node;
      if (libExports.isMemberExpression(node.callee) && libExports.isIdentifier(node.callee.property) && (node.callee.property.name === "push" || node.callee.property.name === "shift")) {
        found = true;
      }
    }
  };
  traverseBody(body, visitor);
  return found;
}
function detectReturn(body) {
  let found = false;
  traverseBody(body, { ReturnStatement() {
    found = true;
  } });
  return found;
}
function detectMultipleReturn(body) {
  let count = 0;
  traverseBody(body, { ReturnStatement() {
    count++;
  } });
  return count > 1;
}
function detectClosureVariables(funcNode, ast, paramNames) {
  const vars = /* @__PURE__ */ new Set();
  traverse(ast, {
    Function(path) {
      const node = path.node;
      if (node !== funcNode) return;
      const ownBindings = /* @__PURE__ */ new Set([...paramNames]);
      for (const [name] of Object.entries(path.scope.bindings || {})) {
        ownBindings.add(name);
      }
      path.traverse({
        Identifier(innerPath) {
          const name = innerPath.node.name;
          if (ownBindings.has(name)) return;
          if (GLOBAL_BUILTINS.has(name)) return;
          const binding = path.scope.getBinding(name);
          if (!binding) {
            if (!KNOWN_GLOBALS.has(name)) vars.add(name);
          } else if (binding.scope !== path.scope) {
            vars.add(name);
          }
        }
      });
      path.skip();
    }
  });
  return [...vars];
}
function countCallsPerName(ast) {
  const counts = /* @__PURE__ */ new Map();
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      let name = null;
      if (libExports.isIdentifier(callee)) name = callee.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  });
  return counts;
}
function nodeToLoc(node) {
  const loc = node.loc;
  return {
    startLine: loc?.start.line ?? 0,
    startColumn: loc?.start.column ?? 0,
    endLine: loc?.end.line ?? 0,
    endColumn: loc?.end.column ?? 0,
    start: node.start ?? 0,
    end: node.end ?? 0
  };
}
function safeSlice(source, start, end) {
  if (start < 0 || end > source.length || start >= end) return "";
  const s = source.slice(start, end);
  return s.length > 200 ? s.slice(0, 197) + "..." : s;
}
function isNumericConst(node) {
  return libExports.isNumericLiteral(node) || libExports.isUnaryExpression(node, { operator: "-" }) && libExports.isNumericLiteral(node.argument);
}
function isIndexExpression(node, paramNames) {
  if (!expressionUsesParams(node, paramNames)) return false;
  return isArithmeticIndex(node, paramNames);
}
function isArithmeticIndex(node, paramNames) {
  if (libExports.isIdentifier(node)) return paramNames.includes(node.name);
  if (isNumericConst(node)) return true;
  if (libExports.isBinaryExpression(node)) {
    return (node.operator === "+" || node.operator === "-") && isArithmeticIndex(node.left, paramNames) && isArithmeticIndex(node.right, paramNames);
  }
  if (libExports.isCallExpression(node)) return true;
  return false;
}
function expressionUsesParams(node, paramNames) {
  if (paramNames.length === 0) return false;
  if (libExports.isIdentifier(node)) return paramNames.includes(node.name);
  if (libExports.isBinaryExpression(node)) {
    return expressionUsesParams(node.left, paramNames) || expressionUsesParams(node.right, paramNames);
  }
  if (libExports.isCallExpression(node)) {
    return node.arguments.some((a) => expressionUsesParams(a, paramNames));
  }
  return false;
}
function findFunctionNodeByName(ast, name) {
  let found = null;
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id?.name === name && !found) {
        found = path.node;
        path.skip();
      }
    },
    VariableDeclarator(path) {
      if (libExports.isIdentifier(path.node.id, { name }) && (libExports.isFunctionExpression(path.node.init) || libExports.isArrowFunctionExpression(path.node.init)) && !found) {
        found = path.node.init;
        path.skip();
      }
    },
    AssignmentExpression(path) {
      const node = path.node;
      if ((libExports.isIdentifier(node.left, { name }) || libExports.isMemberExpression(node.left) && libExports.isIdentifier(node.left.property, { name })) && (libExports.isFunctionExpression(node.right) || libExports.isArrowFunctionExpression(node.right)) && !found) {
        found = node.right;
        path.skip();
      }
    }
  });
  return found;
}
function getFunctionBody(funcNode) {
  if (!libExports.isBlockStatement(funcNode.body)) return null;
  return funcNode.body.body;
}
function isFunctionBinding(binding) {
  if (!binding) return false;
  if (binding.kind === "hoisted") return true;
  if (binding.kind === "const" || binding.kind === "var" || binding.kind === "let") {
    const init = binding.path?.node?.init;
    if (init && (libExports.isFunctionExpression(init) || libExports.isArrowFunctionExpression(init))) return true;
  }
  return false;
}
function traverseBody(stmts, visitor) {
  for (const stmt of stmts) {
    libExports.traverseFast(stmt, (node) => {
      const fn = visitor[node.type];
      if (fn) fn({ node });
    });
  }
}
const GLOBAL_BUILTINS = /* @__PURE__ */ new Set([
  "undefined",
  "null",
  "true",
  "false",
  "NaN",
  "Infinity",
  "atob",
  "btoa",
  "escape",
  "unescape",
  "encodeURIComponent",
  "decodeURIComponent",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "String",
  "Number",
  "Boolean",
  "Array",
  "Object",
  "Function",
  "Math",
  "Date",
  "RegExp",
  "JSON",
  "Error",
  "TypeError",
  "RangeError",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Promise",
  "Symbol",
  "Uint8Array",
  "ArrayBuffer",
  "TextEncoder",
  "TextDecoder",
  "console",
  "window",
  "global",
  "globalThis",
  "self"
]);
const KNOWN_GLOBALS = /* @__PURE__ */ new Set([
  ...GLOBAL_BUILTINS,
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "XMLHttpRequest",
  "fetch",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "performance",
  "crypto",
  "module",
  "exports",
  "require",
  "__dirname",
  "__filename"
]);
const DEFAULT_STRATEGY = {
  autoCaptureMinConfidence: "high"
};
const RANK = { low: 0, medium: 1, high: 2 };
function shouldAutoCapture(candidate, config) {
  if (!candidate.name) return false;
  if (RANK[candidate.confidence] >= RANK[config.autoCaptureMinConfidence]) return true;
  if (!config.manualTargets) return false;
  return config.manualTargets.some(
    (m) => m.functionName === candidate.name && m.lineNumber === candidate.location.startLine && m.columnNumber === candidate.location.startColumn
  );
}
function selectTargets(candidates, config) {
  return candidates.filter((c) => shouldAutoCapture(c, config));
}
const panelPorts = /* @__PURE__ */ new Map();
const scriptCollectors = /* @__PURE__ */ new Map();
function getOrCreateCollector(tabId) {
  if (!scriptCollectors.has(tabId)) {
    scriptCollectors.set(tabId, new ScriptCollector());
  }
  return scriptCollectors.get(tabId);
}
const captureEngines = /* @__PURE__ */ new Map();
const captureStrategies = /* @__PURE__ */ new Map();
const manualCaptures = /* @__PURE__ */ new Map();
const captureModes = /* @__PURE__ */ new Map();
function getOrCreateManualCapture(tabId) {
  let mc = manualCaptures.get(tabId);
  if (!mc) {
    mc = new ManualCapture(
      (method, params) => sendCommand(tabId, method, params),
      {},
      (scriptId) => getOrCreateCollector(tabId).getScript(scriptId)?.url ?? ""
    );
    manualCaptures.set(tabId, mc);
  }
  return mc;
}
function postPanel(tabId, msg) {
  const port = panelPorts.get(tabId);
  if (!port) return;
  try {
    port.postMessage(msg);
  } catch {
    panelPorts.delete(tabId);
  }
}
function postCaptureState(tabId, extra = {}) {
  const e = captureEngines.get(tabId);
  postPanel(tabId, {
    type: "debugger-event",
    event: {
      kind: "capture-state",
      active: e ? e.isActive() : false,
      breakpoints: e ? e.getBreakpointCount() : 0,
      stats: e ? e.getStats() : null,
      captures: e ? e.getCaptures() : [],
      stability: e ? e.getStability() : [],
      autoCaptureMinConfidence: captureStrategies.get(tabId)?.autoCaptureMinConfidence ?? "high",
      ...extra
    }
  });
}
function getOrCreateEngine(tabId) {
  let e = captureEngines.get(tabId);
  if (!e) {
    e = new CaptureEngine(
      (method, params) => sendCommand(tabId, method, params),
      (ev) => postPanel(tabId, { type: "debugger-event", event: { kind: "capture-event", event: ev } })
    );
    captureEngines.set(tabId, e);
  }
  return e;
}
setHooks({
  onPaused: (tabId, params) => {
    const mode = captureModes.get(tabId) || "manual";
    const e = captureEngines.get(tabId);
    if (mode === "auto") {
      if (!e || !e.ownsPause(params)) return false;
      void e.onPaused(params);
      return true;
    }
    if (mode === "manual") {
      if (e && e.ownsPause(params)) return false;
      const mc = getOrCreateManualCapture(tabId);
      if (mc.isEnabled()) {
        void mc.onManualPause(params).then((result) => {
          if (result.handled && result.record) {
            postPanel(tabId, {
              type: "debugger-event",
              event: {
                kind: "manual-capture",
                record: result.record
              }
            });
          }
        }).catch((err) => {
          postPanel(tabId, {
            type: "debugger-event",
            event: {
              kind: "log",
              level: "error",
              message: "手动断点捕获失败: " + (err && err.message ? err.message : String(err))
            }
          });
        });
      }
      return false;
    }
    return false;
  },
  // 插桩暂停：目标脚本即将执行。只在自动模式且引擎激活时启用
  onInstrumentation: async (tabId, params) => {
    const mode = captureModes.get(tabId) || "manual";
    if (mode === "manual") return;
    const e = captureEngines.get(tabId);
    if (!e || !e.isActive()) return;
    const scriptId = params?.data?.scriptId;
    if (!scriptId) {
      postPanel(tabId, { type: "debugger-event", event: { kind: "log", level: "warn", message: "插桩暂停没有携带 scriptId，已跳过" } });
      return;
    }
    const url = getOrCreateCollector(tabId).getScript(scriptId)?.url ?? "";
    const source = await getScriptSource(tabId, scriptId);
    if (!source) {
      postPanel(tabId, { type: "debugger-event", event: { kind: "log", level: "warn", message: `插桩：脚本 ${scriptId} 源码为空，已跳过` } });
      return;
    }
    const d = discoverDecoders(source, scriptId, url);
    if (!d.analyzed) {
      postPanel(tabId, { type: "debugger-event", event: { kind: "log", level: "error", message: `插桩：脚本 ${scriptId} 分析失败：${d.error}` } });
      return;
    }
    const cfg = captureStrategies.get(tabId) ?? DEFAULT_STRATEGY;
    const picked = selectTargets(d.candidates, cfg);
    if (picked.length === 0) return;
    const ast = parseCode(source);
    const targets = picked.map((c) => ({
      scriptId,
      scriptUrl: url,
      functionName: c.name,
      plan: computeCapturePlan(source, c.location.start, ast)
    }));
    const r = await e.start(targets);
    postPanel(tabId, { type: "debugger-event", event: { kind: "log", level: "info", message: `插桩：脚本 ${scriptId} 执行前布置了 ${r.set} 个断点（${picked.length} 个候选，${r.skipped.length} 个跳过，${r.errors.length} 个错误）` } });
    postCaptureState(tabId, { skipped: r.skipped, errors: r.errors });
  },
  onResumed: (tabId) => {
    captureEngines.get(tabId)?.onResumed();
    manualCaptures.get(tabId)?.onResumed();
  },
  onReset: (tabId, reason) => {
    if (reason.startsWith("page")) scriptCollectors.get(tabId)?.clear();
    manualCaptures.get(tabId)?.onReset();
    const e = captureEngines.get(tabId);
    if (e) {
      if (captureStrategies.has(tabId)) e.softReset(reason);
      else e.reset(reason);
    }
    postCaptureState(tabId, { resetReason: reason });
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  captureEngines.get(tabId)?.reset("tab closed");
  captureEngines.delete(tabId);
  scriptCollectors.delete(tabId);
  manualCaptures.get(tabId)?.onReset();
  manualCaptures.delete(tabId);
  captureModes.delete(tabId);
  captureStrategies.delete(tabId);
});
addEventListener((tabId, msg) => {
  const port = panelPorts.get(tabId);
  if (msg.type === "debugger-event" && msg.event.kind === "script-parsed") {
    const collector = getOrCreateCollector(tabId);
    const script = collector.addScript(msg.event.info);
    if (script) {
      getScriptSource(tabId, script.scriptId).then((source) => {
        collector.setScriptSource(script.scriptId, source);
        script.source = source;
        if (port) {
          port.postMessage({
            type: "debugger-event",
            event: { kind: "script-discovered", script }
          });
        }
      }).catch((err) => {
        console.warn(`[OB-Recover] 获取脚本 ${script.scriptId} 源码失败:`, err.message);
        collector.setScriptSource(script.scriptId, "");
      });
    }
  }
  if (port) {
    try {
      port.postMessage(msg);
    } catch {
      panelPorts.delete(tabId);
    }
  }
});
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("ob-recover-panel-")) return;
  const tabId = parseInt(port.name.replace("ob-recover-panel-", ""), 10);
  if (isNaN(tabId)) return;
  panelPorts.set(tabId, port);
  port.onDisconnect.addListener(() => {
    panelPorts.delete(tabId);
  });
  port.onMessage.addListener(async (msg) => {
    await handlePanelCommand(msg, port);
  });
  const status = getStatus(tabId);
  port.postMessage({
    type: "debugger-event",
    event: { kind: "status-changed", status }
  });
});
async function handlePanelCommand(msg, port) {
  try {
    switch (msg.type) {
      case "ping": {
        port.postMessage({ type: "pong" });
        break;
      }
      case "debugger-connect": {
        await attach(msg.tabId, { instrumentation: !!captureEngines.get(msg.tabId)?.isActive() });
        break;
      }
      case "debugger-disconnect": {
        await detach(msg.tabId);
        break;
      }
      case "debugger-resume": {
        await resume(msg.tabId);
        break;
      }
      case "debugger-get-source": {
        const source = await getScriptSource(msg.tabId, msg.scriptId);
        const response = { ok: true, data: { source } };
        port.postMessage({ type: "get-source-response", ...response });
        break;
      }
      case "debugger-get-status": {
        const status = getStatus(msg.tabId);
        port.postMessage({
          type: "debugger-event",
          event: { kind: "status-changed", status }
        });
        break;
      }
      case "debugger-list-scripts": {
        const collector = getOrCreateCollector(msg.tabId);
        const scripts = collector.getAllScripts();
        const stats = collector.getStats();
        const response = { ok: true, data: { scripts, stats } };
        port.postMessage({ type: "list-scripts-response", ...response });
        break;
      }
      case "capture-start": {
        if (getStatus(msg.tabId) !== "connected") {
          throw new Error("调试器未连接，无法开始运行时捕获。请先点击“连接”；若连接失败，请查看日志中 Chrome 返回的具体错误（例如同一标签页已被另一个调试器客户端占用）。");
        }
        captureStrategies.set(msg.tabId, { autoCaptureMinConfidence: msg.autoCaptureMinConfidence ?? "high" });
        captureModes.set(msg.tabId, "auto");
        const engine = getOrCreateEngine(msg.tabId);
        const result = await engine.start(msg.targets);
        await setInstrumentation(msg.tabId, true);
        postCaptureState(msg.tabId, { skipped: result.skipped, errors: result.errors });
        break;
      }
      case "capture-stop": {
        captureStrategies.delete(msg.tabId);
        const engine = captureEngines.get(msg.tabId);
        if (engine) await engine.stop();
        captureModes.set(msg.tabId, "manual");
        await setInstrumentation(msg.tabId, false);
        postCaptureState(msg.tabId);
        break;
      }
      case "capture-clear": {
        captureEngines.get(msg.tabId)?.clear();
        postCaptureState(msg.tabId);
        break;
      }
      case "capture-get-state": {
        postCaptureState(msg.tabId);
        break;
      }
      case "capture-set-mode": {
        const newMode = msg.mode;
        captureModes.set(msg.tabId, newMode);
        if (newMode === "manual") {
          const running = captureEngines.get(msg.tabId);
          if (running && running.isActive()) {
            captureStrategies.delete(msg.tabId);
            await running.stop();
            postCaptureState(msg.tabId);
          }
          await setInstrumentation(msg.tabId, false);
        }
        postPanel(msg.tabId, {
          type: "debugger-event",
          event: {
            kind: "log",
            level: "info",
            message: `已切换到${newMode === "auto" ? "自动" : "手动"}捕获模式`
          }
        });
        postPanel(msg.tabId, {
          type: "debugger-event",
          event: {
            kind: "mode-changed",
            mode: newMode
          }
        });
        break;
      }
      case "capture-get-mode": {
        const currentMode = captureModes.get(msg.tabId) || "manual";
        postPanel(msg.tabId, {
          type: "debugger-event",
          event: {
            kind: "mode-changed",
            mode: currentMode
          }
        });
        break;
      }
      case "manual-capture-get-records": {
        const mc = manualCaptures.get(msg.tabId);
        const records = mc ? mc.getRecords() : [];
        const response = { ok: true, data: { records } };
        port.postMessage({ type: "manual-capture-records-response", ...response });
        break;
      }
      case "manual-capture-clear": {
        manualCaptures.get(msg.tabId)?.clear();
        postPanel(msg.tabId, {
          type: "debugger-event",
          event: { kind: "log", level: "info", message: "已清空手动捕获记录" }
        });
        break;
      }
      case "manual-capture-get-frames": {
        const mc = manualCaptures.get(msg.tabId);
        const data = mc ? mc.getFrames() : { success: false, error: "当前没有处于暂停状态的调用栈（未收到用户断点暂停）" };
        port.postMessage({ type: "manual-capture-frames-response", ok: true, data });
        break;
      }
      case "manual-capture-get-scopes": {
        const mc = manualCaptures.get(msg.tabId);
        const data = mc ? await mc.getScopes(msg.frameIndex) : { success: false, error: "当前没有处于暂停状态的调用栈（未收到用户断点暂停）" };
        port.postMessage({ type: "manual-capture-scopes-response", ok: true, data });
        break;
      }
      case "manual-capture-evaluate": {
        const mc = getOrCreateManualCapture(msg.tabId);
        const result = await mc.evaluateOnFrame({ callFrameId: msg.callFrameId, frameIndex: msg.frameIndex }, msg.expression);
        const response = { ok: true, data: result };
        port.postMessage({ type: "manual-capture-evaluate-response", ...response });
        break;
      }
      default: {
        console.warn("[OB-Recover background] Unknown command:", msg.type);
      }
    }
  } catch (err) {
    console.error("[OB-Recover background] Command error:", err.message);
    try {
      port.postMessage({
        type: "debugger-event",
        event: { kind: "log", level: "error", message: err.message }
      });
    } catch {
    }
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ type: "pong" });
  }
});
globalThis.__obRecoverTest = {
  handlePanelCommand,
  registerPort(tabId, port) {
    panelPorts.set(tabId, port);
  },
  unregisterPort(tabId) {
    panelPorts.delete(tabId);
  },
  getCaptureState(tabId) {
    const e = captureEngines.get(tabId);
    if (!e) return null;
    return {
      active: e.isActive(),
      breakpoints: e.getBreakpointCount(),
      breakpointsByScript: e.getBreakpointsByScript(),
      stats: e.getStats(),
      captures: e.getCaptures(),
      stability: e.getStability()
    };
  },
  getStatus(tabId) {
    return getStatus(tabId);
  }
};
