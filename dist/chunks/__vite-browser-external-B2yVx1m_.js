import { _ as _traverse, l as libExports, p as parseCode } from "./parser-BGlb7RAx.js";
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
function entryPositionOf(fn) {
  if (!libExports.isBlockStatement(fn.body) || !fn.body.loc) return null;
  const end = fn.body.loc.end;
  const first = fn.body.body[0];
  const loc = first && first.loc ? first.loc.start : { line: end.line, column: Math.max(0, end.column - 1) };
  return { lineNumber: loc.line - 1, columnNumber: loc.column };
}
function findFunctionPathsByEntry(ast, entry) {
  const hits = [];
  traverse(ast, {
    Function(path) {
      const p = entryPositionOf(path.node);
      if (p && p.lineNumber === entry.lineNumber && p.columnNumber === entry.columnNumber) hits.push(path);
    }
  });
  return hits;
}
function resolveFunctionName(path) {
  const node = path.node;
  const parent = path.parent;
  if (libExports.isFunctionDeclaration(node)) return node.id?.name ?? null;
  if (libExports.isVariableDeclarator(parent) && parent.init === node && libExports.isIdentifier(parent.id)) return parent.id.name;
  if (libExports.isAssignmentExpression(parent) && parent.right === node) {
    if (libExports.isIdentifier(parent.left)) return parent.left.name;
    if (libExports.isMemberExpression(parent.left) && libExports.isIdentifier(parent.left.property)) return parent.left.property.name;
    return null;
  }
  if (libExports.isObjectProperty(parent) && parent.value === node) {
    if (libExports.isIdentifier(parent.key)) return parent.key.name;
    if (libExports.isStringLiteral(parent.key)) return parent.key.value;
  }
  return null;
}
function findCallPathsAt(ast, pos) {
  const line = pos.lineNumber + 1;
  const hits = [];
  traverse(ast, {
    CallExpression(path) {
      const n = path.node;
      const s = n.loc?.start;
      if (s && s.line === line && s.column === pos.columnNumber) {
        hits.push({ path, kind: "call-start" });
        return;
      }
      const c = n.callee;
      if (libExports.isMemberExpression(c) && !c.computed && c.property.loc && c.property.loc.start.line === line && c.property.loc.start.column === pos.columnNumber) {
        hits.push({ path, kind: "member-property" });
      }
    }
  });
  return hits;
}
const TIME_GLOBALS = /* @__PURE__ */ new Set(["Date", "performance"]);
const ENV_GLOBALS = /* @__PURE__ */ new Set(["document", "navigator", "location", "localStorage", "sessionStorage", "history"]);
const IO_GLOBALS = /* @__PURE__ */ new Set(["fetch", "XMLHttpRequest", "WebSocket", "setTimeout", "setInterval", "requestAnimationFrame", "console", "alert", "confirm", "prompt"]);
const MUTATING_METHODS = /* @__PURE__ */ new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "delete", "add", "clear"]);
const MAX_PER_LIST = 20;
const PURE_GLOBAL_CALLS = /* @__PURE__ */ new Set(["atob", "btoa", "parseInt", "parseFloat", "isNaN", "isFinite", "String", "Number", "Boolean", "BigInt", "Array", "Object", "Symbol", "RegExp", "Error", "TypeError", "RangeError", "decodeURIComponent", "encodeURIComponent", "decodeURI", "encodeURI", "escape", "unescape"]);
function rootOf(node) {
  let cur = node;
  while (cur && (libExports.isMemberExpression(cur) || libExports.isOptionalMemberExpression(cur))) cur = cur.object;
  if (cur && (libExports.isIdentifier(cur) || libExports.isThisExpression(cur))) return cur;
  return null;
}
function collectSelfNames(fnPath) {
  const names = /* @__PURE__ */ new Set();
  const node = fnPath.node;
  const parent = fnPath.parent;
  if ((libExports.isFunctionDeclaration(node) || libExports.isFunctionExpression(node)) && node.id) names.add(node.id.name);
  if (libExports.isVariableDeclarator(parent) && parent.init === node && libExports.isIdentifier(parent.id)) names.add(parent.id.name);
  if (libExports.isAssignmentExpression(parent) && parent.right === node) {
    if (libExports.isIdentifier(parent.left)) names.add(parent.left.name);
    else if (libExports.isMemberExpression(parent.left) && libExports.isIdentifier(parent.left.property)) names.add(parent.left.property.name);
  }
  return names;
}
function analyzeFunctionFeatures(fnPath) {
  const blocking = [];
  const notes = [];
  const selfNames = collectSelfNames(fnPath);
  const calledScriptFns = /* @__PURE__ */ new Set();
  const calledUnbound = /* @__PURE__ */ new Set();
  const add = (list, category, message, node) => {
    if (list.length >= MAX_PER_LIST) return;
    const loc = node.loc?.start;
    list.push({ category, message, line: loc?.line ?? 0, column: loc?.column ?? 0 });
  };
  const isLocal = (b) => {
    for (let p = b.scope.path; p; p = p.parentPath) {
      if (p.node === fnPath.node) return true;
    }
    return false;
  };
  const checkWrite = (root, viaMember, p, node, how) => {
    if (!root) return;
    if (libExports.isThisExpression(root)) {
      add(blocking, "outer-state-write", `${how}：写入 this 上的状态`, node);
      return;
    }
    const b = p.scope.getBinding(root.name);
    if (b && isLocal(b)) return;
    if (selfNames.has(root.name)) {
      add(notes, "self-memoization", `${how}：写入函数自身 ${root.name} 的缓存或属性（常见的解码结果缓存写法）`, node);
      return;
    }
    if (!b) add(blocking, "global-write", `${how}：写入全局 ${root.name}${viaMember ? " 的属性" : ""}`, node);
    else add(blocking, "outer-state-write", `${how}：写入函数外部变量 ${root.name}${viaMember ? " 的属性" : ""}`, node);
  };
  fnPath.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (p.scope.getBinding(name)) return;
      if (TIME_GLOBALS.has(name)) add(blocking, "time-source", `引用了全局 ${name}（时间来源）`, p.node);
      else if (name === "crypto") add(blocking, "random-source", "引用了全局 crypto（随机来源）", p.node);
      else if (ENV_GLOBALS.has(name)) add(blocking, "environment-read", `读取了运行环境 ${name}`, p.node);
      else if (IO_GLOBALS.has(name)) add(blocking, "io", `使用了全局 ${name}（有外部副作用）`, p.node);
    },
    MemberExpression(p) {
      const n = p.node;
      if (!libExports.isIdentifier(n.object, { name: "Math" }) || p.scope.getBinding("Math")) return;
      const prop = n.computed ? libExports.isStringLiteral(n.property) ? n.property.value : null : libExports.isIdentifier(n.property) ? n.property.name : null;
      if (prop === "random") add(blocking, "random-source", "调用了 Math.random（随机来源）", n);
    },
    AssignmentExpression(p) {
      const left = p.node.left;
      if (libExports.isMemberExpression(left) || libExports.isOptionalMemberExpression(left)) checkWrite(rootOf(left), true, p, p.node, "赋值");
      else if (libExports.isIdentifier(left)) checkWrite(left, false, p, p.node, "赋值");
      else for (const id of Object.values(libExports.getBindingIdentifiers(left))) checkWrite(id, false, p, p.node, "解构赋值");
    },
    UpdateExpression(p) {
      const arg = p.node.argument;
      if (libExports.isMemberExpression(arg) || libExports.isOptionalMemberExpression(arg)) checkWrite(rootOf(arg), true, p, p.node, "自增自减");
      else if (libExports.isIdentifier(arg)) checkWrite(arg, false, p, p.node, "自增自减");
    },
    UnaryExpression(p) {
      if (p.node.operator !== "delete") return;
      const arg = p.node.argument;
      if (libExports.isMemberExpression(arg) || libExports.isOptionalMemberExpression(arg)) checkWrite(rootOf(arg), true, p, p.node, "delete");
    },
    CallExpression(p) {
      const callee = p.node.callee;
      if (libExports.isMemberExpression(callee)) {
        const prop = callee.computed ? libExports.isStringLiteral(callee.property) ? callee.property.value : null : libExports.isIdentifier(callee.property) ? callee.property.name : null;
        if (prop && MUTATING_METHODS.has(prop)) checkWrite(rootOf(callee.object), true, p, p.node, `调用 .${prop}()`);
      } else if (libExports.isIdentifier(callee)) {
        const b = p.scope.getBinding(callee.name);
        if (b && !isLocal(b)) calledScriptFns.add(callee.name);
        else if (!b && !PURE_GLOBAL_CALLS.has(callee.name) && !TIME_GLOBALS.has(callee.name) && !ENV_GLOBALS.has(callee.name) && !IO_GLOBALS.has(callee.name) && callee.name !== "crypto") calledUnbound.add(callee.name);
      }
    }
  });
  if (calledScriptFns.size > 0) {
    add(notes, "calls-script-function", `调用了脚本内其他函数：${Array.from(calledScriptFns).slice(0, 8).join(", ")}（静态检查不追踪它们的内部行为）`, fnPath.node);
  }
  if (calledUnbound.size > 0) {
    add(notes, "calls-script-function", `调用了没有声明的全局函数：${Array.from(calledUnbound).slice(0, 8).join(", ")}（无法分析它们的行为）`, fnPath.node);
  }
  return { blocking, notes, calledScriptFunctions: Array.from(calledScriptFns), calledUnboundFunctions: Array.from(calledUnbound) };
}
const MAX_HELPER_DEPTH = 3;
function fmtValue(v) {
  if (!v) return "(无)";
  if (v.type === "undefined") return "undefined";
  if (v.type === "null") return "null";
  if (v.type === "string") {
    const s = String(v.value ?? "");
    return JSON.stringify(s.length > 40 ? s.slice(0, 40) + "…" : s);
  }
  if (v.unserializable) return v.unserializable;
  if (v.value !== void 0) return String(v.value);
  return v.description ?? v.type;
}
function replacementOf(v) {
  if (v && v.type === "string" && typeof v.value === "string" && !v.truncated) return { type: "StringLiteral", value: v.value, text: JSON.stringify(v.value) };
  if (v && v.type === "number" && typeof v.value === "number" && Number.isFinite(v.value) && v.value >= 0 && !Object.is(v.value, -0)) return { type: "NumericLiteral", value: v.value, text: String(v.value) };
  if (v && v.type === "boolean" && typeof v.value === "boolean") return { type: "BooleanLiteral", value: v.value, text: String(v.value) };
  if (v && v.type === "null") return { type: "NullLiteral", value: null, text: "null" };
  return { error: { code: "unsupported-return-value", message: `返回值 ${fmtValue(v)}（${v ? v.type : "无"}）不能安全表示为字面量：当前只支持字符串、非负有限数字、布尔值和 null` } };
}
const SEMANTIC_DIRECTIVES = /* @__PURE__ */ new Set(["use strict", "use asm"]);
function replacementParentProblem(node, parent, value) {
  if (libExports.isNewExpression(parent) && parent.callee === node || libExports.isTaggedTemplateExpression(parent) && parent.tag === node) {
    return { code: "unexpected-parent", message: `父节点是 ${parent.type}，替换为字面量会改变语义` };
  }
  if (libExports.isExpressionStatement(parent) && typeof value === "string" && SEMANTIC_DIRECTIVES.has(value)) {
    return { code: "unexpected-parent", message: `字符串 ${JSON.stringify(value)} 替换到表达式语句位置会变成指令序言（directive），可能让整个函数或脚本改变严格模式等语义，而替换后的整体解析校验拦不住` };
  }
  return null;
}
function literalTextOf(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && !Object.is(value, -0) ? String(value) : null;
  if (typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return null;
}
function functionOfBinding(binding) {
  if (!binding) return null;
  const p = binding.path;
  if (p.isFunctionDeclaration()) return p;
  if (p.isVariableDeclarator()) {
    const init = p.get("init");
    if (init && init.node && init.isFunction()) return init;
  }
  return null;
}
function reassignedOutside(binding, fn) {
  return binding.constantViolations.some((v) => !v.findParent((p) => p.node === fn.node));
}
function helperProblems(fn, depth, seen2, out) {
  const feats = analyzeFunctionFeatures(fn);
  for (const name of feats.calledUnboundFunctions) out.unresolved.push(`${name}（未声明的全局函数，无法分析其行为）`);
  for (const name of feats.calledScriptFunctions) {
    const binding = fn.scope.getBinding(name);
    const hp = functionOfBinding(binding);
    if (!binding || !hp) {
      out.unresolved.push(`${name}（无法解析为函数声明）`);
      continue;
    }
    if (reassignedOutside(binding, hp)) {
      out.unresolved.push(`${name}（在函数外被重新赋值）`);
      continue;
    }
    if (seen2.has(hp.node)) continue;
    seen2.add(hp.node);
    const hf = analyzeFunctionFeatures(hp);
    if (hf.blocking.length > 0) {
      out.blocking.push(`${name}：${hf.blocking[0].message}`);
      continue;
    }
    out.analyzed.push(name);
    if (hf.calledScriptFunctions.length > 0 || hf.calledUnboundFunctions.length > 0) {
      if (depth > 1) helperProblems(hp, depth - 1, seen2, out);
      else out.unresolved.push(`${name}（内部调用超出分析深度 ${MAX_HELPER_DEPTH}）`);
    }
  }
}
function insideFn(p, fn) {
  for (let c = p; c; c = c.parentPath) {
    if (c.node === fn.node) return true;
  }
  return false;
}
function outerMutableReads(fn) {
  const found = /* @__PURE__ */ new Map();
  const checked = /* @__PURE__ */ new Set();
  fn.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (checked.has(name)) return;
      checked.add(name);
      const b = p.scope.getBinding(name);
      if (!b || insideFn(b.scope.path, fn)) return;
      const owner = functionOfBinding(b);
      const exempt = (x) => insideFn(x, fn) || owner !== null && insideFn(x, owner);
      for (const v of b.constantViolations) {
        if (!exempt(v)) {
          found.set(name, `外部变量 ${name} 在函数外被重新赋值`);
          return;
        }
      }
      for (const ref of b.referencePaths) {
        if (exempt(ref)) continue;
        const m = ref.parentPath;
        if (!m || !(m.isMemberExpression() || m.isOptionalMemberExpression()) || m.node.object !== ref.node) continue;
        const g = m.parentPath;
        if (!g) continue;
        let how = null;
        if (g.isAssignmentExpression() && g.node.left === m.node) how = "属性赋值";
        else if (g.isUpdateExpression()) how = "自增自减";
        else if (g.isUnaryExpression({ operator: "delete" })) how = "delete";
        else if (g.isCallExpression() && g.node.callee === m.node) {
          const mm = m.node;
          const prop = mm.computed ? libExports.isStringLiteral(mm.property) ? mm.property.value : null : libExports.isIdentifier(mm.property) ? mm.property.name : null;
          if (prop && MUTATING_METHODS.has(prop)) how = `调用 .${prop}()`;
        }
        if (how) {
          found.set(name, `外部变量 ${name} 在函数外被修改（${how}）`);
          return;
        }
      }
    }
  });
  return Array.from(found.values());
}
const DEFAULT_MIN_OBSERVATIONS = 2;
const SAMPLE_LIMIT = 5;
const CACHE_MAX = 16;
function groupKey(c) {
  return [c.scriptId, c.functionLocation.lineNumber, c.functionLocation.columnNumber, c.functionName, JSON.stringify(c.arguments)].join("|");
}
function functionKey(c) {
  return [c.scriptId, c.functionLocation.lineNumber, c.functionLocation.columnNumber, c.functionName].join("|");
}
const COMPARABLE_TYPES = /* @__PURE__ */ new Set(["string", "number", "boolean", "undefined", "null", "bigint"]);
function isComparableValue(v) {
  return !!v && COMPARABLE_TYPES.has(v.type);
}
function findArgumentProblem(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.type === "missing") return { code: "argument-missing", message: `参数[${i}] 缺失：无法从函数局部作用域读取` };
    if (a.truncated) return { code: "argument-truncated", message: `参数[${i}] 被截断，不是完整值` };
    if (!isComparableValue(a)) return { code: "argument-not-comparable", message: `参数[${i}] 的类型是 ${a.type}，只有描述，无法判断两次调用是不是同一个值` };
  }
  return null;
}
function findReturnProblem(success) {
  for (const c of success) {
    const r = c.returnValue;
    if (!r) return { code: "return-missing", message: "成功记录里没有返回值" };
    if (r.truncated) return { code: "return-truncated", message: "返回值被截断，不是完整值" };
    if (!isComparableValue(r)) return { code: "return-not-comparable", message: `返回值类型是 ${r.type}，只有描述，无法验证` };
  }
  return null;
}
const analysisCache = /* @__PURE__ */ new Map();
const keyMemo = /* @__PURE__ */ new Map();
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function analysisOf(script) {
  let memo = keyMemo.get(script.scriptId);
  if (!memo || memo.source !== script.source) {
    if (keyMemo.size >= CACHE_MAX * 2) {
      const oldestKey = keyMemo.keys().next().value;
      if (oldestKey !== void 0) keyMemo.delete(oldestKey);
    }
    memo = { source: script.source, key: script.scriptId + ":" + script.source.length + ":" + hashString(script.source) };
    keyMemo.set(script.scriptId, memo);
  }
  const key = memo.key;
  const cached = analysisCache.get(key);
  if (cached) return cached;
  let ast = null;
  let error;
  try {
    ast = parseCode(script.source);
  } catch (e) {
    error = e && e.message ? e.message : String(e);
  }
  const a = { ast, error, fns: /* @__PURE__ */ new Map() };
  if (analysisCache.size >= CACHE_MAX) {
    const oldest = analysisCache.keys().next().value;
    if (oldest !== void 0) analysisCache.delete(oldest);
  }
  analysisCache.set(key, a);
  return a;
}
function getScriptAst(script) {
  const a = analysisOf(script);
  return { ast: a.ast, error: a.error };
}
function getFunctionInfo(script, entry) {
  const a = analysisOf(script);
  const k = entry.lineNumber + ":" + entry.columnNumber;
  const cached = a.fns.get(k);
  if (cached) return cached;
  let info;
  if (!a.ast) {
    info = { found: "not-found", name: null, features: null };
  } else {
    const hits = findFunctionPathsByEntry(a.ast, entry);
    if (hits.length === 0) info = { found: "not-found", name: null, features: null };
    else if (hits.length > 1) info = { found: "ambiguous", name: null, features: null };
    else info = { found: "found", name: resolveFunctionName(hits[0]), features: analyzeFunctionFeatures(hits[0]) };
  }
  a.fns.set(k, info);
  return info;
}
function checkSingleObservation(script, rec, locs, info, warnings) {
  const fails = [];
  const bad = (code, message) => {
    fails.push({ code: "single-obs:" + code, message });
  };
  if ((script.startLine ?? 0) !== 0 || (script.startColumn ?? 0) !== 0) {
    bad("script-identity", "脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证，脚本身份无法确认");
  }
  const rep = replacementOf(rec.returnValue);
  if ("error" in rep) bad("return-not-literal", rep.error.message);
  const { ast } = getScriptAst(script);
  if (!ast) {
    bad("ast-unavailable", "脚本源码无法解析为 AST，无法做静态分析");
    return fails;
  }
  if (locs.length !== 1) {
    bad("call-location", locs.length === 0 ? "没有可用的调用位置，无法绑定到源码中的调用点" : `有 ${locs.length} 个调用位置，单次观测只能对应一个调用点`);
  } else {
    const hits = findCallPathsAt(ast, locs[0]);
    if (hits.length !== 1) {
      bad("call-site", hits.length === 0 ? "调用位置映射不到任何 CallExpression" : `调用位置对应 ${hits.length} 个 CallExpression，无法唯一确定`);
    } else {
      const callee = hits[0].path.node.callee;
      if (hits[0].kind !== "call-start" || callee.type !== "Identifier" || callee.name !== rec.functionName) {
        bad("call-site", "调用位置对应的不是对解码函数的直接调用（别名、成员调用或其他形式），无法确认等价");
      }
    }
  }
  const fns = findFunctionPathsByEntry(ast, rec.functionLocation);
  if (info.found !== "found" || fns.length !== 1) {
    bad("function-analysis", "无法唯一定位并静态分析解码函数");
    return fails;
  }
  const fn = fns[0];
  for (const m of outerMutableReads(fn).slice(0, 3)) bad("outer-mutable-state", m);
  const h = { analyzed: [], unresolved: [], blocking: [] };
  helperProblems(fn, MAX_HELPER_DEPTH, /* @__PURE__ */ new Set([fn.node]), h);
  if (h.blocking.length > 0) bad("helper-side-effects", `被调用的辅助函数存在副作用或外部依赖：${h.blocking.slice(0, 3).join("；")}`);
  if (h.unresolved.length > 0) bad("helper-unresolved", `辅助函数无法完整解析：${h.unresolved.slice(0, 3).join("；")}。单次观测不接受无法解析的辅助函数`);
  if (fails.length === 0 && h.analyzed.length > 0) warnings.push({ code: "helpers-analyzed", message: `已静态分析的辅助函数：${h.analyzed.join(", ")}` });
  return fails;
}
function evaluateGroup(allRecs, script, minObs, captureActive, allowSingle) {
  const blockedManual = allRecs.filter((c) => c.origin === "manual" && c.captureStatus !== "success");
  const onlyBlocked = blockedManual.length > 0 && blockedManual.length === allRecs.length;
  const recs = blockedManual.length > 0 && !onlyBlocked ? allRecs.filter((c) => !blockedManual.includes(c)) : allRecs;
  const first = recs[0];
  const success = recs.filter((c) => c.captureStatus === "success").sort((a, b) => a.firstSeq - b.firstSeq);
  const failedRecs = recs.filter((c) => c.captureStatus !== "success");
  const reasons = [];
  const warnings = [];
  const autoObservations = success.filter((c) => c.origin !== "manual").reduce((s, c) => s + c.count, 0);
  const observations = autoObservations > 0 ? autoObservations : success.length > 0 ? 1 : 0;
  const failedObservations = failedRecs.reduce((s, c) => s + c.count, 0);
  if (blockedManual.length > 0 && !onlyBlocked) {
    warnings.push({ code: "manual-evaluation-blocked", message: `有 ${blockedManual.length} 个调用点的手动求值被 V8 的 throwOnSideEffect 拒绝：这些调用点没有证据，不参与判定，也不会被替换` });
  }
  const distinct = new Set(success.map((c) => JSON.stringify(c.returnValue))).size;
  const locs = [];
  for (const c of recs) {
    const list = c.callLocations ?? (c.callLocation.lineNumber >= 0 ? [c.callLocation] : []);
    for (const p of list) {
      if (!locs.some((q) => q.lineNumber === p.lineNumber && q.columnNumber === p.columnNumber)) locs.push({ lineNumber: p.lineNumber, columnNumber: p.columnNumber });
    }
  }
  const truncated = recs.some((c) => c.callLocationsTruncated === true);
  if (truncated) warnings.push({ code: "call-locations-truncated", message: "调用位置列表被截断：只列出了已记录的位置，不代表这是全部调用点" });
  if (script && ((script.startLine ?? 0) !== 0 || (script.startColumn ?? 0) !== 0)) {
    warnings.push({ code: "script-offset", message: "脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证，不会进入可替换候选" });
  }
  const info = script && success.length > 0 ? getFunctionInfo(script, first.functionLocation) : null;
  const blocking = info?.features?.blocking ?? [];
  let status;
  let evidence = "none";
  if (!script) {
    status = "failed";
    reasons.push({ code: "stale-script", message: `脚本 ${first.scriptId} 不在当前脚本集合中（页面已刷新或脚本已被替换），这条旧记录不参与验证` });
  } else if (onlyBlocked) {
    status = "insufficient";
    const why = Array.from(new Set(blockedManual.map((c) => c.reason ?? "side-effect-blocked"))).slice(0, 3).join("; ");
    reasons.push({ code: "side-effect-blocked", message: `手动求值被 V8 的 throwOnSideEffect 拒绝（可能有副作用），没有任何可用的观测：${why}。证据不足，不会进入替换候选` });
  } else if (success.length === 0) {
    status = "failed";
    const why = Array.from(new Set(failedRecs.map((c) => c.reason ?? "unknown"))).slice(0, 3).join("；");
    reasons.push({ code: "capture-failed", message: `没有任何一次成功捕获：${why}` });
  } else {
    const fi = info;
    const argProblem = findArgumentProblem(first.arguments);
    const retProblem = findReturnProblem(success);
    if (argProblem) {
      status = "failed";
      reasons.push(argProblem);
    } else if (retProblem) {
      status = "failed";
      reasons.push(retProblem);
    } else if (fi.found === "not-found") {
      status = "failed";
      reasons.push({ code: "function-not-found", message: "当前脚本源码里找不到入口位置对应的函数：脚本内容可能已变化，或位置不是这个脚本的" });
    } else if (fi.found === "ambiguous") {
      status = "insufficient";
      reasons.push({ code: "function-ambiguous", message: "入口位置对应多个函数，无法确定捕获的是哪一个" });
    } else if (fi.name !== first.functionName) {
      status = "failed";
      reasons.push({ code: "function-identity-mismatch", message: `记录里的函数名是 ${first.functionName}，源码该位置的函数是 ${fi.name ?? "(匿名)"}：可能捕获到了别的函数` });
    } else if (distinct > 1) {
      status = "unstable";
      const samples = success.slice(0, SAMPLE_LIMIT).map((c) => `${fmtValue(c.returnValue)}×${c.count}`).join("、");
      reasons.push({ code: "same-args-different-returns", message: `同一组参数出现 ${distinct} 个不同返回值：${samples}。原因未确定（可能是状态、时间或随机依赖，也可能是数组旋转前后），不能直接用于替换` });
      for (const f of blocking.slice(0, 3)) reasons.push({ code: "hint:" + f.category, message: `静态线索（仅供参考）：${f.message}` });
      const latest = success.reduce((a, b) => b.lastSeq > a.lastSeq ? b : a);
      const othersLast = Math.max(...success.filter((c) => c !== latest).map((c) => c.lastSeq));
      if (latest.firstSeq > othersLast && latest.count >= 2) {
        warnings.push({ code: "settled-tail", message: `最近 ${latest.count} 次观测都返回 ${fmtValue(latest.returnValue)}，此前出现过其他值：可能是状态变化后稳定，但不能据此认定为稳定映射` });
      }
    } else if (blocking.length > 0) {
      status = "unstable";
      reasons.push({ code: "dependency-suspected", message: `同参数的观测值一致，但静态检查发现：${blocking.slice(0, 3).map((f) => f.message).join("；")}。无法确认输出只取决于参数，按不稳定处理` });
    } else if (failedRecs.length > 0) {
      status = "insufficient";
      reasons.push({ code: "mixed-success-and-failed", message: `同参数既有成功观测（${observations} 次）也有失败捕获（${failedObservations} 次）：无法区分是函数行为还是捕获过程的问题` });
    } else if (observations < minObs || allowSingle && observations === 1) {
      const fails = allowSingle && observations === 1 ? checkSingleObservation(script, success[0], locs, fi, warnings) : null;
      if (fails && fails.length === 0) {
        status = "verified";
        evidence = "single-observation";
        reasons.push({ code: "single-observation-verified", message: `【单次观测】只观测到 1 次，没有多次一致观测作为佐证；以下条件已全部确认：调用位置唯一对应一个 CallExpression，参数完整，返回值完整且可表示为字面量，解码函数可被静态分析且辅助函数已完整解析，未发现状态、时间、随机或函数外可变状态依赖，同参数无冲突，脚本身份无偏移。这不等于多次观测验证：静态分析看不到的别名式修改（例如旋转函数通过别名改写字符串数组）无法排除。` });
      } else {
        status = allowSingle ? "insufficient" : captureActive ? "pending" : "insufficient";
        reasons.push({ code: "too-few-observations", message: `同参数只观测到 ${observations} 次，需要至少 ${minObs} 次一致观测${captureActive && !allowSingle ? "（捕获仍在进行，可能还会有新观测）" : ""}` });
        if (fails) reasons.push({ code: "single-observation-rejected", message: "【单次观测】只有 1 次观测，且未通过严格静态安全检查，按证据不足处理。未能确认的条件如下：" });
        for (const f of fails ?? []) reasons.push(f);
      }
    } else if (locs.length === 0) {
      status = "insufficient";
      reasons.push({ code: "call-location-unknown", message: "没有可用的调用位置（调用方栈帧缺失），无法绑定到源码中的调用点" });
    } else {
      status = "verified";
      evidence = observations > 1 ? "multiple-observations" : "single-observation";
      reasons.push({ code: "consistent-observations", message: `同参数 ${observations} 次观测均返回同一值，数据完整，静态检查未发现时间、随机或外部状态写入` });
    }
  }
  const group = {
    id: groupKey(first),
    functionId: functionKey(first),
    scriptId: first.scriptId,
    scriptUrl: first.scriptUrl,
    functionName: first.functionName,
    functionLocation: first.functionLocation,
    arguments: first.arguments,
    status,
    reasons,
    warnings,
    observations,
    failedObservations,
    distinctReturns: distinct,
    conflict: distinct > 1,
    returnSamples: success.slice(0, SAMPLE_LIMIT).map((c) => ({ value: c.returnValue, count: c.count, firstSeq: c.firstSeq, lastSeq: c.lastSeq })),
    callLocations: locs,
    callLocationsTruncated: truncated,
    lastCapturedAt: Math.max(...recs.map((c) => c.timestamp)),
    captureKeys: allRecs.map((c) => c.key),
    functionSuspect: false,
    evidence
  };
  return { group, info };
}
function emptyCounts() {
  return { pending: 0, verified: 0, unstable: 0, failed: 0, insufficient: 0 };
}
function validateCaptures(captures, scripts, options = {}) {
  const minObs = Math.max(1, options.minObservations ?? DEFAULT_MIN_OBSERVATIONS);
  const byId = new Map(scripts.map((s) => [s.scriptId, s]));
  const buckets = /* @__PURE__ */ new Map();
  for (const c of captures) {
    const k = groupKey(c);
    const arr = buckets.get(k);
    if (arr) arr.push(c);
    else buckets.set(k, [c]);
  }
  const groups = [];
  const infos = /* @__PURE__ */ new Map();
  for (const recs of buckets.values()) {
    const { group, info } = evaluateGroup(recs, byId.get(recs[0].scriptId), minObs, !!options.captureActive, options.allowSingleObservation !== false);
    groups.push(group);
    if (!infos.has(group.functionId) || infos.get(group.functionId) === null && info) infos.set(group.functionId, info);
  }
  const byFn = /* @__PURE__ */ new Map();
  for (const g of groups) {
    const arr = byFn.get(g.functionId);
    if (arr) arr.push(g);
    else byFn.set(g.functionId, [g]);
  }
  const functions = [];
  for (const [fid, gs] of byFn) {
    const info = infos.get(fid) ?? null;
    const blocking = info?.features?.blocking ?? [];
    const conflicted = gs.filter((g) => g.conflict);
    const suspect = conflicted.length > 0 || blocking.length > 0;
    const reasons = [];
    if (conflicted.length > 0) reasons.push({ code: "function-has-conflict", message: `${conflicted.length} 组参数出现同参不同值：该函数的输出可能依赖运行状态（原因未确定）` });
    for (const f of blocking.slice(0, 3)) reasons.push({ code: "function-feature:" + f.category, message: f.message });
    if (suspect) {
      for (const g of gs) {
        g.functionSuspect = true;
        g.warnings.push({ code: "function-suspect", message: "同一函数存在冲突或静态特征存疑：该函数的映射不会进入可替换候选" });
      }
    }
    const counts = emptyCounts();
    for (const g of gs) counts[g.status]++;
    const g0 = gs[0];
    functions.push({
      id: fid,
      scriptId: g0.scriptId,
      scriptUrl: g0.scriptUrl,
      functionName: g0.functionName,
      functionLocation: g0.functionLocation,
      groupCount: gs.length,
      statusCounts: counts,
      suspect,
      reasons,
      notes: (info?.features?.notes ?? []).map((f) => f.message)
    });
  }
  groups.sort((a, b) => a.functionName < b.functionName ? -1 : a.functionName > b.functionName ? 1 : (a.returnSamples[0]?.firstSeq ?? 0) - (b.returnSamples[0]?.firstSeq ?? 0));
  const byStatus = emptyCounts();
  for (const g of groups) byStatus[g.status]++;
  return { groups, functions, summary: { groups: groups.length, byStatus, suspectFunctions: functions.filter((f) => f.suspect).length } };
}
function analyzeCallDeterminism(path, decoders) {
  const callee = path.node.callee;
  if (!libExports.isIdentifier(callee)) {
    return { deterministic: false, reason: "callee is not an identifier" };
  }
  const decoder = decoders.find((d) => d.name === callee.name);
  if (!decoder) {
    return { deterministic: false, reason: `"${callee.name}" is not a known decoder` };
  }
  const args = path.node.arguments;
  for (let i = 0; i < args.length; i++) {
    if (!isStaticValue(args[i])) {
      return {
        deterministic: false,
        reason: `argument ${i} is not a static literal (type: ${args[i].type})`
      };
    }
  }
  return {
    deterministic: true,
    reason: `all arguments are static, callee "${callee.name}" is a confirmed decoder`
  };
}
function isStaticValue(node) {
  if (libExports.isStringLiteral(node)) return true;
  if (libExports.isNumericLiteral(node)) return true;
  if (libExports.isBooleanLiteral(node)) return true;
  if (libExports.isNullLiteral(node)) return true;
  if (libExports.isUnaryExpression(node, { operator: "-" }) && libExports.isNumericLiteral(node.argument)) return true;
  if (libExports.isUnaryExpression(node, { operator: "!" }) && isStaticValue(node.argument)) return true;
  if (libExports.isUnaryExpression(node, { operator: "typeof" }) && isStaticValue(node.argument)) return true;
  if (libExports.isUnaryExpression(node, { operator: "void" }) && libExports.isNumericLiteral(node.argument) && node.argument.value === 0) return true;
  if (libExports.isBinaryExpression(node) && isStaticValue(node.left) && isStaticValue(node.right)) return true;
  if (libExports.isLogicalExpression(node) && isStaticValue(node.left) && isStaticValue(node.right)) return true;
  if (libExports.isConditionalExpression(node) && isStaticValue(node.test) && isStaticValue(node.consequent) && isStaticValue(node.alternate)) return true;
  if (libExports.isTemplateLiteral(node) && node.expressions.length === 0) return true;
  return false;
}
const EVAL_FAIL = Symbol("EVAL_FAIL");
function safeStaticEval(node) {
  if (libExports.isStringLiteral(node)) return node.value;
  if (libExports.isNumericLiteral(node)) return node.value;
  if (libExports.isBooleanLiteral(node)) return node.value;
  if (libExports.isNullLiteral(node)) return null;
  if (libExports.isUnaryExpression(node, { operator: "void" }) && libExports.isNumericLiteral(node.argument) && node.argument.value === 0) return void 0;
  if (libExports.isUnaryExpression(node, { operator: "-" })) {
    const val = safeStaticEval(node.argument);
    if (typeof val === "number") return -val;
    return EVAL_FAIL;
  }
  if (libExports.isUnaryExpression(node, { operator: "+" })) {
    const val = safeStaticEval(node.argument);
    if (typeof val === "number") return +val;
    if (typeof val === "string") return +val;
    if (typeof val === "boolean") return +val;
    return EVAL_FAIL;
  }
  if (libExports.isUnaryExpression(node, { operator: "!" })) {
    const val = safeStaticEval(node.argument);
    if (val === EVAL_FAIL) return EVAL_FAIL;
    return !val;
  }
  if (libExports.isUnaryExpression(node, { operator: "typeof" })) {
    const val = safeStaticEval(node.argument);
    if (val === EVAL_FAIL) return EVAL_FAIL;
    return typeof val;
  }
  if (libExports.isBinaryExpression(node)) {
    const left = safeStaticEval(node.left);
    const right = safeStaticEval(node.right);
    if (left === EVAL_FAIL || right === EVAL_FAIL) return EVAL_FAIL;
    return evalBinary(node.operator, left, right);
  }
  if (libExports.isLogicalExpression(node)) {
    const left = safeStaticEval(node.left);
    if (left === EVAL_FAIL) return EVAL_FAIL;
    if (node.operator === "&&") return left ? safeStaticEval(node.right) : left;
    if (node.operator === "||") return left ? left : safeStaticEval(node.right);
    if (node.operator === "??") return left === null || left === void 0 ? safeStaticEval(node.right) : left;
    return EVAL_FAIL;
  }
  if (libExports.isConditionalExpression(node)) {
    const test = safeStaticEval(node.test);
    if (test === EVAL_FAIL) return EVAL_FAIL;
    return test ? safeStaticEval(node.consequent) : safeStaticEval(node.alternate);
  }
  if (libExports.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? EVAL_FAIL;
  }
  if (libExports.isSequenceExpression(node)) {
    let lastVal = void 0;
    for (const expr of node.expressions) {
      const val = safeStaticEval(expr);
      if (val === EVAL_FAIL) return EVAL_FAIL;
      lastVal = val;
    }
    return lastVal;
  }
  if (libExports.isArrayExpression(node)) {
    for (const el of node.elements) {
      if (el === null) {
        continue;
      }
      if (libExports.isSpreadElement(el)) return EVAL_FAIL;
      const val = safeStaticEval(el);
      if (val === EVAL_FAIL) return EVAL_FAIL;
    }
    return EVAL_FAIL;
  }
  if (libExports.isObjectExpression(node)) {
    for (const prop of node.properties) {
      if (libExports.isSpreadElement(prop)) return EVAL_FAIL;
      if (!libExports.isObjectProperty(prop)) return EVAL_FAIL;
      if (prop.computed) return EVAL_FAIL;
      if (libExports.isIdentifier(prop.key)) {
        prop.key.name;
      } else if (libExports.isStringLiteral(prop.key)) {
        prop.key.value;
      } else {
        return EVAL_FAIL;
      }
      const val = safeStaticEval(prop.value);
      if (val === EVAL_FAIL) return EVAL_FAIL;
    }
    return EVAL_FAIL;
  }
  if (libExports.isMemberExpression(node)) {
    return EVAL_FAIL;
  }
  return EVAL_FAIL;
}
function evalBinary(op, left, right) {
  if (left === EVAL_FAIL || right === EVAL_FAIL) return EVAL_FAIL;
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? EVAL_FAIL : left / right;
    case "%":
      return right === 0 ? EVAL_FAIL : left % right;
    case "**":
      return left ** right;
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
    case "|":
      return left | right;
    case "&":
      return left & right;
    case "^":
      return left ^ right;
    case "<<":
      return left << right;
    case ">>":
      return left >> right;
    case ">>>":
      return left >>> right;
    default:
      return EVAL_FAIL;
  }
}
function tryStaticEval(node) {
  const result = safeStaticEval(node);
  if (result === EVAL_FAIL) return null;
  return { value: result, type: typeof result };
}
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p) => Promise.resolve(p).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = allSettled2(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
async function sha256(text) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await __vitePreload(async () => {
    const { createHash: createHash2 } = await Promise.resolve().then(() => __viteBrowserExternal);
    return { createHash: createHash2 };
  }, true ? void 0 : void 0);
  return createHash("sha256").update(text, "utf8").digest("hex");
}
const computeScriptHash = sha256;
const __viteBrowserExternal = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null
}, Symbol.toStringTag, { value: "Module" }));
export {
  MAX_HELPER_DEPTH as M,
  analyzeFunctionFeatures as a,
  findCallPathsAt as b,
  functionOfBinding as c,
  reassignedOutside as d,
  replacementParentProblem as e,
  findFunctionPathsByEntry as f,
  getScriptAst as g,
  helperProblems as h,
  fmtValue as i,
  resolveFunctionName as j,
  analyzeCallDeterminism as k,
  isStaticValue as l,
  computeScriptHash as m,
  literalTextOf as n,
  replacementOf as r,
  sha256 as s,
  tryStaticEval as t,
  validateCaptures as v
};
