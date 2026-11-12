import { c as computeCapturePlan } from "./chunks/capture-plan-ZmWOmY9y.js";
import { _ as _traverse, l as libExports, p as parseCode } from "./chunks/parser-BGlb7RAx.js";
import { v as validateCaptures, s as sha256, r as replacementOf, g as getScriptAst, f as findFunctionPathsByEntry, a as analyzeFunctionFeatures, h as helperProblems, M as MAX_HELPER_DEPTH, b as findCallPathsAt, c as functionOfBinding, d as reassignedOutside, e as replacementParentProblem, t as tryStaticEval, i as fmtValue, j as resolveFunctionName } from "./chunks/__vite-browser-external-B2yVx1m_.js";
const STORAGE_KEY = "ob_recover_layout_v1";
const DEFAULT_PREFS = {
  sidebar: "auto",
  mode: "auto",
  sync: true,
  dockOpen: false,
  dockPane: "runtime",
  dockHeight: null
};
const BREAK_LG = 1100;
const BREAK_MD = 700;
const SHORT_H = 500;
const NARROW_EDITORS = 560;
const MIN_COL_H = 440;
const MODES = ["auto", "row", "col", "tabs"];
const DOCK_PANES = ["runtime", "decoder", "capture", "report", "manual"];
const MODE_LABEL = { auto: "自动", row: "左右", col: "上下", tabs: "单栏" };
const LAYOUT_LABEL = { row: "左右", col: "上下", tabs: "单栏" };
function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        sidebar: ["auto", "open", "closed"].includes(p.sidebar) ? p.sidebar : "auto",
        mode: MODES.includes(p.mode) ? p.mode : "auto",
        sync: p.sync !== false,
        dockOpen: p.dockOpen === true,
        dockPane: DOCK_PANES.includes(p.dockPane) ? p.dockPane : "runtime",
        dockHeight: typeof p.dockHeight === "number" && p.dockHeight >= 100 ? p.dockHeight : null
      };
    }
  } catch {
  }
  return { ...DEFAULT_PREFS };
}
function savePrefs(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
  }
}
function clearPrefs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error("layout: missing #" + id);
  return el;
}
function shortName(url) {
  const clean = url.split("#")[0].split("?")[0];
  const last = clean.split("/").filter(Boolean).pop();
  return last || url;
}
function init() {
  const app = byId("app");
  const main = byId("main");
  const sidebar = byId("sidebar");
  const scriptList = byId("script-list");
  const editors = byId("editors");
  const tabsBar = byId("editor-tabs");
  const codePanels = byId("code-panels");
  const panelOriginal2 = byId("panel-original");
  const panelRecovered2 = byId("panel-recovered");
  const codeOriginal2 = byId("code-original");
  const codeRecovered2 = byId("code-recovered");
  const dock = byId("dock");
  const dockResize = byId("resize-dock");
  const dockBody = dock.querySelector(".dock-body");
  const dockTabs = Array.from(dock.querySelectorAll(".dock-tab"));
  const dockPanes = Array.from(dock.querySelectorAll(".dock-pane"));
  const edTabs = Array.from(tabsBar.querySelectorAll(".ed-tab"));
  const btnSidebar = byId("btn-toggle-sidebar");
  const btnCollapse = byId("btn-collapse-sidebar");
  const btnMode = byId("btn-layout-mode");
  const btnSync = byId("btn-sync-scroll");
  const btnReset = byId("btn-reset-layout");
  const btnDock = byId("btn-dock-toggle");
  const btnDetails = byId("btn-rt-details");
  let prefs = loadPrefs();
  let sizeClass = "lg";
  let isShort = false;
  let dockOpen = prefs.dockOpen;
  let smSidebarOpen = false;
  let activeEditor = "original";
  const sidebarVisible = () => {
    if (sizeClass === "sm") return smSidebarOpen;
    if (prefs.sidebar === "open") return true;
    if (prefs.sidebar === "closed") return false;
    return sizeClass === "lg";
  };
  const renderSidebar = () => {
    const v = sidebarVisible();
    app.dataset.sidebar = v ? "open" : "closed";
    btnSidebar.setAttribute("aria-pressed", String(v));
    btnSidebar.title = v ? "折叠文件列表" : "展开文件列表";
  };
  const toggleSidebar = () => {
    if (sizeClass === "sm") {
      smSidebarOpen = !smSidebarOpen;
    } else {
      prefs.sidebar = sidebarVisible() ? "closed" : "open";
      savePrefs(prefs);
    }
    renderSidebar();
  };
  const resolveLayout = () => {
    if (prefs.mode !== "auto") return prefs.mode;
    const w = editors.clientWidth;
    if (w === 0 || w >= NARROW_EDITORS) return "row";
    const h = editors.clientHeight + (tabsBar.hidden ? 0 : tabsBar.offsetHeight);
    return h >= MIN_COL_H ? "col" : "tabs";
  };
  const renderEditors = () => {
    const layout = resolveLayout();
    if (codePanels.dataset.layout !== layout) {
      codePanels.dataset.layout = layout;
      panelOriginal2.style.flex = "";
      panelRecovered2.style.flex = "";
    }
    tabsBar.hidden = layout !== "tabs";
    codePanels.dataset.active = activeEditor;
    edTabs.forEach((b) => b.classList.toggle("active", b.dataset.target === activeEditor));
    btnMode.textContent = MODE_LABEL[prefs.mode];
    btnMode.title = prefs.mode === "auto" ? "编辑器布局：自动（当前" + LAYOUT_LABEL[layout] + "），点击切换" : "编辑器布局：" + MODE_LABEL[prefs.mode] + "，点击切换";
  };
  const renderDock = () => {
    dock.dataset.open = String(dockOpen);
    dock.dataset.pane = prefs.dockPane;
    dockTabs.forEach((t) => {
      const on = dockOpen && t.dataset.pane === prefs.dockPane;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    dockPanes.forEach((p) => {
      p.hidden = p.dataset.pane !== prefs.dockPane;
    });
    btnDock.textContent = dockOpen ? "▾" : "▴";
    btnDock.title = dockOpen ? "折叠面板" : "展开面板";
    btnDetails.classList.toggle("active", dockOpen && prefs.dockPane === "runtime");
    if (prefs.dockHeight) dock.style.setProperty("--dock-h", prefs.dockHeight + "px");
    else dock.style.removeProperty("--dock-h");
  };
  const activateDock = (pane) => {
    if (dockOpen && prefs.dockPane === pane) {
      dockOpen = false;
    } else {
      prefs.dockPane = pane;
      dockOpen = true;
    }
    prefs.dockOpen = dockOpen;
    savePrefs(prefs);
    renderDock();
  };
  const measure = () => {
    const w = app.clientWidth;
    const h = app.clientHeight;
    if (w === 0 || h === 0) return;
    const next = w >= BREAK_LG ? "lg" : w >= BREAK_MD ? "md" : "sm";
    const short = h < SHORT_H;
    const becameShort = short && !isShort;
    sizeClass = next;
    isShort = short;
    app.dataset.size = next;
    app.dataset.short = String(short);
    if (becameShort && dockOpen) {
      dockOpen = false;
      renderDock();
    }
    renderSidebar();
    renderEditors();
  };
  let syncLock = false;
  const linkScroll = (src, dst) => {
    src.addEventListener(
      "scroll",
      () => {
        if (!prefs.sync || syncLock || codePanels.dataset.layout === "tabs") return;
        const sMax = src.scrollHeight - src.clientHeight;
        const dMax = dst.scrollHeight - dst.clientHeight;
        if (sMax <= 0 || dMax <= 0) return;
        syncLock = true;
        dst.scrollTop = src.scrollTop / sMax * dMax;
        requestAnimationFrame(() => {
          syncLock = false;
        });
      },
      { passive: true }
    );
  };
  linkScroll(codeOriginal2, codeRecovered2);
  linkScroll(codeRecovered2, codeOriginal2);
  const renderSync = () => {
    btnSync.classList.toggle("active", prefs.sync);
    btnSync.setAttribute("aria-pressed", String(prefs.sync));
    btnSync.title = prefs.sync ? "同步滚动：开" : "同步滚动：关";
  };
  btnSidebar.addEventListener("click", toggleSidebar);
  btnCollapse.addEventListener("click", toggleSidebar);
  scriptList.addEventListener("click", () => {
    if (sizeClass === "sm" && smSidebarOpen) {
      smSidebarOpen = false;
      renderSidebar();
    }
  });
  app.addEventListener("click", (e) => {
    if (e.target === app && sizeClass === "sm" && smSidebarOpen) {
      smSidebarOpen = false;
      renderSidebar();
    }
  });
  btnMode.addEventListener("click", () => {
    prefs.mode = MODES[(MODES.indexOf(prefs.mode) + 1) % MODES.length];
    savePrefs(prefs);
    renderEditors();
  });
  btnSync.addEventListener("click", () => {
    prefs.sync = !prefs.sync;
    savePrefs(prefs);
    renderSync();
  });
  edTabs.forEach(
    (b) => b.addEventListener("click", () => {
      activeEditor = b.dataset.target === "recovered" ? "recovered" : "original";
      renderEditors();
    })
  );
  dockTabs.forEach((t) => t.addEventListener("click", () => activateDock(t.dataset.pane)));
  btnDock.addEventListener("click", () => {
    dockOpen = !dockOpen;
    prefs.dockOpen = dockOpen;
    savePrefs(prefs);
    renderDock();
  });
  btnDetails.addEventListener("click", () => activateDock("runtime"));
  btnReset.addEventListener("click", () => {
    prefs = { ...DEFAULT_PREFS };
    clearPrefs();
    smSidebarOpen = false;
    dockOpen = false;
    activeEditor = "original";
    sidebar.style.width = "";
    panelOriginal2.style.flex = "";
    panelRecovered2.style.flex = "";
    reportQuery.value = "";
    reportScope.value = "all";
    applyReportFilter();
    renderDock();
    renderSync();
    measure();
  });
  dockResize.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockBody.getBoundingClientRect().height;
    dockResize.classList.add("dragging");
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      const max = Math.max(120, main.clientHeight - 220);
      const h = Math.round(Math.max(100, Math.min(max, startH + (startY - ev.clientY))));
      prefs.dockHeight = h;
      dock.style.setProperty("--dock-h", h + "px");
    };
    const onUp = () => {
      dockResize.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      savePrefs(prefs);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  const reportList = byId("transform-list");
  const reportQuery = byId("report-filter");
  const reportScope = byId("report-scope");
  const reportShown = byId("report-shown");
  const applyReportFilter = () => {
    const q = reportQuery.value.trim().toLowerCase();
    const scope = reportScope.value;
    const items = reportList.querySelectorAll(".transform-item");
    let shown = 0;
    items.forEach((it) => {
      let text;
      if (scope === "orig") text = it.querySelector(".transform-orig")?.textContent ?? "";
      else if (scope === "new") text = it.querySelector(".transform-new")?.textContent ?? "";
      else if (scope === "loc") text = it.querySelector(".transform-loc")?.textContent ?? "";
      else text = it.textContent ?? "";
      const hit = !q || text.toLowerCase().includes(q);
      it.hidden = !hit;
      if (hit) shown++;
    });
    reportShown.textContent = q ? "(显示 " + shown + "/" + items.length + ")" : "";
  };
  let filterTimer;
  const scheduleFilter = () => {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(applyReportFilter, 150);
  };
  reportQuery.addEventListener("input", scheduleFilter);
  reportScope.addEventListener("change", applyReportFilter);
  new MutationObserver(applyReportFilter).observe(reportList, { childList: true });
  const mirrorText = (srcId, apply) => {
    const src = document.getElementById(srcId);
    if (!src) return;
    const run = () => apply((src.textContent ?? "").trim());
    new MutationObserver(run).observe(src, { childList: true, characterData: true, subtree: true });
    run();
  };
  const tbCount = byId("tb-count");
  const badgeReport = byId("dock-rep-badge");
  const badgeDecoder = byId("dock-dec-badge");
  const badgeCapture = byId("dock-cap-badge");
  const capTab = dockTabs.find((t) => t.dataset.pane === "capture");
  mirrorText("transform-count", (t) => {
    const has = t !== "" && t !== "0";
    badgeReport.textContent = has ? t : "";
    tbCount.innerHTML = "<b>" + t.replace(/[^0-9]/g, "") + '</b><span class="lbl"> 处转换</span>';
    tbCount.hidden = !has;
  });
  mirrorText("dec-candidates", (t) => {
    badgeDecoder.textContent = t !== "" && t !== "0" ? t : "";
  });
  mirrorText("cap-hits", (t) => {
    badgeCapture.textContent = t !== "" && t !== "0" ? t : "";
  });
  mirrorText("cap-status", (t) => {
    capTab?.classList.toggle("live", t === "正在捕获");
  });
  const manTab = dockTabs.find((t) => t.dataset.pane === "manual");
  mirrorText("man-state", (t) => {
    manTab?.classList.toggle("live", t === "已暂停");
  });
  mirrorText("stats-recovered", (t) => {
    if (t.includes("次转换") && codePanels.dataset.layout === "tabs") {
      activeEditor = "recovered";
      renderEditors();
    }
  });
  mirrorText("status", (t) => {
    byId("status").title = t;
  });
  const tbFile = byId("tb-file");
  const updateFile = () => {
    const li = scriptList.querySelector("li.active");
    const full = li?.title ?? "";
    tbFile.textContent = full ? shortName(full) : "";
    tbFile.title = full;
  };
  new MutationObserver(updateFile).observe(scriptList, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"]
  });
  renderSync();
  renderDock();
  measure();
  const ro = new ResizeObserver(() => measure());
  ro.observe(app);
  ro.observe(editors);
}
try {
  init();
} catch (err) {
  console.error("[OB-Recover] layout init failed:", err);
}
function summarizeValidation(report, inputRecords) {
  const byStatus = { pending: 0, verified: 0, unstable: 0, failed: 0, insufficient: 0 };
  let records = 0;
  let single = 0;
  let multiple = 0;
  let stale = 0;
  for (const g of report.groups) {
    byStatus[g.status]++;
    records += g.captureKeys.length;
    if (g.evidence === "single-observation") single++;
    else if (g.evidence === "multiple-observations") multiple++;
    if (g.reasons.some((r) => r.code === "stale-script")) stale++;
  }
  const sum = byStatus.pending + byStatus.verified + byStatus.unstable + byStatus.failed + byStatus.insufficient;
  return {
    groups: report.groups.length,
    records,
    byStatus,
    byEvidence: { multiple, single },
    staleGroups: stale,
    consistent: sum === report.groups.length && (inputRecords === void 0 || records === inputRecords)
  };
}
function computeValidationStats(captures, scripts2, options = {}) {
  const report = validateCaptures(captures, scripts2, options);
  return { report, stats: summarizeValidation(report, captures.length) };
}
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
const STATIC_TYPES = ["string", "number", "boolean", "null", "undefined"];
function showStatic(v) {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}
function checkArg(node, rt, i) {
  let sv;
  let st;
  if (node === void 0) {
    sv = void 0;
    st = "undefined";
  } else {
    const r = libExports.isSpreadElement(node) ? null : tryStaticEval(node);
    if (!r) return { ok: false, code: "dynamic-arguments", message: `参数[${i}] 不是字面量（${node.type}）：同一调用点在别的运行状态下参数可能不同，不能固定替换` };
    sv = r.value;
    st = sv === null ? "null" : typeof sv;
    if (!STATIC_TYPES.includes(st)) return { ok: false, code: "dynamic-arguments", message: `参数[${i}] 的静态值类型是 ${st}，不支持` };
  }
  const rv = rt.type === "undefined" ? void 0 : rt.type === "null" ? null : rt.value;
  if (rt.type !== st || !Object.is(rv, sv)) {
    return { ok: false, code: "argument-mismatch", message: `参数[${i}] 在源码里是 ${showStatic(sv)}，运行时捕获到 ${fmtValue(rt)}：参数与调用点不匹配，记录可能绑错了调用点` };
  }
  return { ok: true };
}
function buildTextIndex(ast, source, names) {
  const idx = /* @__PURE__ */ new Map();
  traverse(ast, {
    CallExpression(path) {
      const n = path.node;
      if (!libExports.isIdentifier(n.callee) || !names.has(n.callee.name) || n.start == null || n.end == null || !n.loc) return;
      const text = source.slice(n.start, n.end);
      const entry = { node: n, path, line: n.loc.start.line, column: n.loc.start.column };
      const arr = idx.get(text);
      if (arr) arr.push(entry);
      else idx.set(text, [entry]);
    }
  });
  return idx;
}
async function dryRunReplacements(report, scripts2, options = {}) {
  const rejectUnresolved = options.rejectUnresolvedHelpers !== false;
  const byId2 = new Map(scripts2.map((s) => [s.scriptId, s]));
  const scriptHashes = /* @__PURE__ */ new Map();
  for (const script of scripts2) {
    const hash = await sha256(script.source);
    scriptHashes.set(script.scriptId, hash);
  }
  const candidates = [];
  const rejections = [];
  const reject2 = (g, position, reasons) => {
    rejections.push({ groupId: g.id, functionName: g.functionName, scriptId: g.scriptId, status: g.status, position, reasons });
  };
  const namesByScript = /* @__PURE__ */ new Map();
  for (const g of report.groups) {
    if (g.status !== "verified") continue;
    const set = namesByScript.get(g.scriptId);
    if (set) set.add(g.functionName);
    else namesByScript.set(g.scriptId, /* @__PURE__ */ new Set([g.functionName]));
  }
  const textIndexes = /* @__PURE__ */ new Map();
  for (const g of report.groups) {
    if (g.status !== "verified") {
      reject2(g, null, [{ code: "status-" + g.status, message: `验证状态是 ${g.status}，不是 verified，不进入替换候选` }, ...g.reasons]);
      continue;
    }
    if (g.functionSuspect) {
      reject2(g, null, [{ code: "function-suspect", message: "同一函数存在冲突或静态特征存疑，该函数的映射一律不进入替换候选" }]);
      continue;
    }
    if (g.warnings.some((w) => w.code === "script-offset")) {
      reject2(g, null, [{ code: "script-offset", message: "脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证" }]);
      continue;
    }
    const script = byId2.get(g.scriptId);
    if (!script) {
      reject2(g, null, [{ code: "stale-script", message: `脚本 ${g.scriptId} 不在当前脚本集合中` }]);
      continue;
    }
    const rep = replacementOf(g.returnSamples[0]?.value);
    if ("error" in rep) {
      reject2(g, null, [rep.error]);
      continue;
    }
    const { ast } = getScriptAst(script);
    if (!ast) {
      reject2(g, null, [{ code: "ast-unavailable", message: "脚本源码无法解析为 AST" }]);
      continue;
    }
    const fns = findFunctionPathsByEntry(ast, g.functionLocation);
    if (fns.length !== 1) {
      reject2(g, null, [{ code: "function-not-unique", message: `入口位置对应 ${fns.length} 个函数，无法确定捕获的是哪一个` }]);
      continue;
    }
    const fnPath = fns[0];
    const feats = analyzeFunctionFeatures(fnPath);
    const helpers = { analyzed: [], unresolved: [], blocking: [] };
    helperProblems(fnPath, MAX_HELPER_DEPTH, /* @__PURE__ */ new Set([fnPath.node]), helpers);
    if (helpers.blocking.length > 0) {
      reject2(g, null, [{ code: "helper-side-effects", message: `被调用的辅助函数存在副作用或外部依赖：${helpers.blocking.slice(0, 3).join("；")}` }]);
      continue;
    }
    if (helpers.unresolved.length > 0 && rejectUnresolved) {
      reject2(g, null, [{ code: "unanalyzed-helper", message: `无法确认辅助函数的副作用：${helpers.unresolved.slice(0, 3).join("；")}。无法确认安全就不进入替换候选` }]);
      continue;
    }
    if (g.callLocations.length === 0) {
      reject2(g, null, [{ code: "no-call-location", message: "没有已知调用位置，无法定位要替换的节点" }]);
      continue;
    }
    if (g.callLocationsTruncated) {
      reject2(g, null, [{ code: "location-list-truncated", message: "该函数的调用位置列表被截断（超过上限），无法确认所有调用点，整组拒绝" }]);
      continue;
    }
    const scriptHash = scriptHashes.get(g.scriptId);
    if (!scriptHash) {
      reject2(g, null, [{ code: "script-hash-unavailable", message: "脚本哈希计算失败" }]);
      continue;
    }
    let textIndex = textIndexes.get(g.scriptId);
    if (!textIndex) {
      textIndex = buildTextIndex(ast, script.source, namesByScript.get(g.scriptId) ?? /* @__PURE__ */ new Set());
      textIndexes.set(g.scriptId, textIndex);
    }
    for (const loc of g.callLocations) {
      const hits = findCallPathsAt(ast, loc);
      if (hits.length === 0) {
        reject2(g, loc, [{ code: "call-site-not-found", message: `源码 ${loc.lineNumber + 1}:${loc.columnNumber} 处没有调用表达式：位置无法映射到 AST 节点（脚本内容可能已变化）` }]);
        continue;
      }
      if (hits.length > 1) {
        reject2(g, loc, [{ code: "call-site-ambiguous", message: `源码 ${loc.lineNumber + 1}:${loc.columnNumber} 处对应 ${hits.length} 个调用表达式，无法唯一确定` }]);
        continue;
      }
      const { path, kind } = hits[0];
      const node = path.node;
      if (kind !== "call-start") {
        reject2(g, loc, [{ code: "member-call-unverified", message: "这是 obj.fn() 形式的成员调用：无法确认 obj 就是持有被捕获函数的对象，不进入替换候选" }]);
        continue;
      }
      const callee = node.callee;
      if (!libExports.isIdentifier(callee)) {
        reject2(g, loc, [{ code: "callee-not-identifier", message: `被调用者是 ${callee.type}，不是普通标识符，不进入替换候选` }]);
        continue;
      }
      if (callee.name !== g.functionName) {
        reject2(g, loc, [{ code: "callee-name-mismatch", message: `这里调用的是 ${callee.name}，记录里的解码函数是 ${g.functionName}（可能是别名或包装函数），不能确认两者等价` }]);
        continue;
      }
      const binding = path.scope.getBinding(callee.name);
      const target = functionOfBinding(binding);
      if (!binding || !target) {
        reject2(g, loc, [{ code: "callee-binding-unresolved", message: `${callee.name} 在该调用点的作用域里无法解析为函数声明` }]);
        continue;
      }
      if (target.node !== fnPath.node) {
        reject2(g, loc, [{ code: "callee-binding-mismatch", message: `${callee.name} 在该调用点解析到另一个同名函数，不是被捕获的那个` }]);
        continue;
      }
      if (reassignedOutside(binding, target)) {
        reject2(g, loc, [{ code: "binding-reassigned", message: `${callee.name} 在函数外部被重新赋值或重复声明，运行时指向的函数可能变化` }]);
        continue;
      }
      if (node.arguments.length > g.arguments.length) {
        reject2(g, loc, [{ code: "extra-arguments", message: `调用传了 ${node.arguments.length} 个参数，函数只有 ${g.arguments.length} 个形参：多出的参数可能通过 arguments 被读取，无法验证` }]);
        continue;
      }
      let bad = null;
      for (let i = 0; i < g.arguments.length && !bad; i++) {
        const r = checkArg(node.arguments[i], g.arguments[i], i);
        if (!r.ok) bad = r;
      }
      if (bad) {
        reject2(g, loc, [{ code: bad.code, message: bad.message }]);
        continue;
      }
      const parent = path.parent;
      const parentProblem = replacementParentProblem(node, parent, rep.value);
      if (parentProblem) {
        reject2(g, loc, [parentProblem]);
        continue;
      }
      const callText = script.source.slice(node.start, node.end);
      const others = (textIndex.get(callText) ?? []).filter((o) => o.node !== node);
      const conflicts = others.map((o) => {
        const observed = g.callLocations.some((l) => l.lineNumber + 1 === o.line && l.columnNumber === o.column);
        const ob = functionOfBinding(o.path.scope.getBinding(o.node.callee.name));
        return { line: o.line, column: o.column, observed, sameBinding: !!ob && ob.node === fnPath.node };
      }).filter((c) => !c.observed || !c.sameBinding);
      const notes = [];
      if (conflicts.length > 0) notes.push({ code: "text-keyed-replacement-unsafe", message: `还有 ${conflicts.length} 处同文本调用没有证据支持（未观测，或绑定到别的函数）：按调用文本替换会误伤它们，必须按位置替换` });
      if (helpers.analyzed.length > 0) notes.push({ code: "helpers-analyzed", message: `已静态分析的辅助函数：${helpers.analyzed.join(", ")}` });
      if (helpers.unresolved.length > 0) notes.push({ code: "helpers-unresolved", message: `未能分析的辅助函数（已按选项放行）：${helpers.unresolved.join("；")}` });
      if (feats.notes.some((f) => f.category === "self-memoization")) notes.push({ code: "removes-self-memoization", message: "函数内有对自身的缓存写入：替换后这些写入不再发生，若缓存在别处被读取需人工确认" });
      candidates.push({
        groupId: g.id,
        functionName: g.functionName,
        scriptId: g.scriptId,
        scriptUrl: g.scriptUrl,
        scriptHash,
        position: { lineNumber: loc.lineNumber, columnNumber: loc.columnNumber },
        start: node.start,
        end: node.end,
        callText,
        before: "CallExpression",
        after: rep.type,
        replacement: rep.text,
        value: rep.value,
        parentType: parent.type,
        observations: g.observations,
        notes,
        textKeyConflicts: conflicts,
        callLocationsTruncated: g.callLocationsTruncated
      });
    }
  }
  const byReason = {};
  for (const r of rejections) {
    const code = r.reasons[0]?.code ?? "unknown";
    byReason[code] = (byReason[code] ?? 0) + 1;
  }
  return { candidates, rejections, summary: { candidates: candidates.length, rejections: rejections.length, byReason } };
}
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const MAX_STRING_ARG = 2e3;
const MAX_EXPRESSION = 1e3;
const FINGERPRINT_EDGE = 120;
const MANUAL_SEQ_BASE = 1e9;
function reject(code, message) {
  return { ok: false, code, message };
}
function blockedCapture(plan, detail, meta) {
  const fl = plan.functionLocation;
  const cl = plan.callLocation;
  return {
    key: ["manual-blocked", plan.scriptId, fl.lineNumber, fl.columnNumber, cl.lineNumber, cl.columnNumber, JSON.stringify(plan.args)].join("|"),
    scriptId: plan.scriptId,
    scriptUrl: meta.scriptUrl,
    functionName: plan.functionName,
    functionLocation: { ...fl },
    callLocation: { ...cl },
    callLocations: [{ ...cl }],
    arguments: plan.args.map((a) => ({ ...a })),
    captureStatus: "capture-failed",
    reason: "side-effect-blocked: " + (detail ?? "V8 throwOnSideEffect rejected the evaluation"),
    origin: "manual",
    count: 1,
    firstSeq: meta.seq,
    lastSeq: meta.seq,
    timestamp: meta.timestamp
  };
}
function fingerprintOf(text) {
  return JSON.stringify([text.length, text.slice(0, FINGERPRINT_EDGE), text.slice(-FINGERPRINT_EDGE)]);
}
function bindsTo(declNode, fn) {
  if (declNode === fn) return true;
  return libExports.isVariableDeclarator(declNode) && declNode.init === fn;
}
function planManualCapture(script, functionEntry, functionName, callLocation) {
  if (!IDENT.test(functionName)) return reject("invalid-input", "解码函数名不是合法标识符：" + functionName);
  if (!script || !script.scriptId || typeof script.source !== "string") return reject("invalid-input", "脚本信息不完整（缺少 scriptId 或源码）");
  if ((script.startLine ?? 0) !== 0 || (script.startColumn ?? 0) !== 0) {
    return reject("script-offset", "脚本在文档中有起始偏移（内联脚本），运行时位置与源码位置的换算未验证，不支持手动求值替换");
  }
  const { ast } = getScriptAst(script);
  if (!ast) return reject("ast-unavailable", "脚本源码无法解析为 AST");
  const fns = findFunctionPathsByEntry(ast, functionEntry);
  if (fns.length === 0) return reject("function-not-found", "源码里找不到入口位置对应的函数");
  if (fns.length > 1) return reject("function-ambiguous", "入口位置对应多个函数，无法确定是哪一个");
  const fn = fns[0];
  if (resolveFunctionName(fn) !== functionName) {
    return reject("function-name-mismatch", `入口位置的函数名是 ${resolveFunctionName(fn) ?? "(匿名)"}，不是 ${functionName}`);
  }
  const hits = findCallPathsAt(ast, callLocation);
  if (hits.length === 0) return reject("call-not-found", "该位置不是任何 CallExpression 的起点");
  if (hits.length > 1) return reject("call-ambiguous", `该位置对应 ${hits.length} 个 CallExpression，无法唯一确定`);
  const hit = hits[0];
  const call = hit.path.node;
  if (hit.kind !== "call-start" || !libExports.isIdentifier(call.callee) || call.callee.name !== functionName) {
    return reject("not-direct-call", `该位置不是对 ${functionName} 的直接调用（别名、成员调用或其他形式）`);
  }
  const binding = hit.path.scope.getBinding(functionName);
  if (!binding || !bindsTo(binding.path.node, fn.node)) {
    return reject("binding-mismatch", `该调用点处的 ${functionName} 没有绑定到已分析的解码函数（被局部或闭包变量遮蔽，或不是 function / var 声明）`);
  }
  const args = [];
  for (let i = 0; i < call.arguments.length; i++) {
    const a = call.arguments[i];
    if (libExports.isStringLiteral(a)) {
      if (a.value.length > MAX_STRING_ARG) return reject("argument-too-long", `参数[${i}] 超过 ${MAX_STRING_ARG} 个字符，运行时记录会被截断`);
      args.push({ type: "string", value: a.value });
    } else if (libExports.isNumericLiteral(a)) {
      args.push({ type: "number", value: a.value });
    } else if (libExports.isBooleanLiteral(a)) {
      args.push({ type: "boolean", value: a.value });
    } else {
      return reject("non-literal-argument", `参数[${i}] 不是字符串、数字或布尔字面量，不能确定参数值`);
    }
  }
  if (call.start == null || call.end == null || fn.node.start == null || fn.node.end == null) {
    return reject("invalid-input", "AST 节点缺少偏移信息");
  }
  const expression = script.source.slice(call.start, call.end);
  if (expression.length === 0 || expression.length > MAX_EXPRESSION) {
    return reject("expression-too-long", `调用表达式长度 ${expression.length} 超出允许范围`);
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
    bindingFingerprint: fingerprint
  };
}
function buildManualCapture(plan, probe, evaluated, meta) {
  const pv = probe.success ? probe.result : void 0;
  if (!pv || pv.type !== "string" || typeof pv.value !== "string") {
    return reject("probe-failed", `无法在该帧确认 ${plan.functionName} 的绑定：${probe.error ?? "没有返回值"}`);
  }
  if (pv.truncated || pv.value !== plan.bindingFingerprint) {
    return reject("probe-mismatch", `该帧里的 ${plan.functionName} 与静态分析的解码函数不是同一个（函数文本指纹不一致）：可能被遮蔽、被重新赋值，或脚本已变化`);
  }
  if (evaluated.sideEffectBlocked === true) {
    return {
      ...reject("side-effect-blocked", `V8 的 throwOnSideEffect 拒绝了 ${plan.expression} 的求值（可能有副作用）：${evaluated.error ?? ""}。已记为证据不足，不会自动降级重试，也不会被替换`),
      blocked: blockedCapture(plan, evaluated.error, meta)
    };
  }
  const rv = evaluated.success ? evaluated.result : void 0;
  if (!rv) return reject("return-missing", `在帧中求值 ${plan.expression} 失败：${evaluated.error ?? "没有返回值"}`);
  if (rv.truncated) return reject("return-truncated", "返回值被截断，不是完整值");
  const literalType = rv.type === "string" || rv.type === "number" || rv.type === "boolean" || rv.type === "null";
  if (!literalType || rv.unserializable !== void 0 || rv.type !== "null" && rv.value === void 0) {
    return reject("return-not-literal", `返回值类型 ${rv.type} 不能表示为字面量`);
  }
  const returnValue = { ...rv };
  const fl = plan.functionLocation;
  const cl = plan.callLocation;
  const key = ["manual", plan.scriptId, fl.lineNumber, fl.columnNumber, cl.lineNumber, cl.columnNumber, JSON.stringify(plan.args), JSON.stringify(returnValue)].join("|");
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
      captureStatus: "success",
      origin: "manual",
      count: 1,
      firstSeq: meta.seq,
      lastSeq: meta.seq,
      timestamp: meta.timestamp
    }
  };
}
const NL = String.fromCharCode(10);
const REQUEST_TIMEOUT_MS = 15e3;
const MAX_CALLSITE_OPTIONS = 200;
const MAX_RECORDS_SHOWN = 30;
const MAX_RECORDS_KEPT = 100;
function noopPanel() {
  return {
    handleResponse() {
    },
    onPaused() {
    },
    onResumed() {
    },
    onPageReset() {
    },
    onModeChanged() {
    },
    syncMode() {
    },
    onRecord() {
    },
    getCaptures: () => []
  };
}
function errText(e) {
  return e && e.message ? String(e.message) : String(e);
}
function fmt(v) {
  if (!v) return "—";
  if (v.type === "undefined") return "undefined";
  if (v.type === "null") return "null";
  if (v.type === "string") return JSON.stringify(v.value) + (v.truncated ? " …(已截断)" : "");
  if (v.unserializable) return v.unserializable;
  if (v.value !== void 0) return String(v.value);
  const d = v.description ? String(v.description) : v.type;
  return d.length > 120 ? d.slice(0, 120) + "…" : d;
}
function fileOf(url, scriptId) {
  return url ? url.split("/").pop() || url : "script:" + scriptId;
}
function initManualPanel(ctx) {
  const section = document.getElementById("man-section");
  const modeSel = document.getElementById("man-mode");
  const stateEl = document.getElementById("man-state");
  const btnRefresh = document.getElementById("btn-man-refresh");
  const btnClear = document.getElementById("btn-man-clear");
  const frameSel = document.getElementById("man-frame");
  const btnScopes = document.getElementById("btn-man-scopes");
  const callSiteSel = document.getElementById("man-callsite");
  const btnEval = document.getElementById("btn-man-eval");
  const infoEl = document.getElementById("man-info");
  const scopesEl = document.getElementById("man-scopes");
  const resultEl = document.getElementById("man-result");
  const recordsEl = document.getElementById("man-records");
  if (!section || !modeSel || !stateEl || !btnRefresh || !btnClear || !frameSel || !btnScopes || !callSiteSel || !btnEval || !infoEl || !scopesEl || !resultEl || !recordsEl) {
    return noopPanel();
  }
  let mode = "manual";
  let lastActive = false;
  let paused = false;
  let busy = false;
  let frames = [];
  let choices = [];
  let seq = 0;
  let pending = null;
  let queue = Promise.resolve();
  const table = /* @__PURE__ */ new Map();
  const records = [];
  const astCache = /* @__PURE__ */ new Map();
  function request(msg, responseType) {
    const run = () => new Promise((resolve, reject2) => {
      const port = ctx.getPort();
      if (!port) {
        reject2(new Error("与 Background 的连接已断开"));
        return;
      }
      const timer = window.setTimeout(() => {
        if (pending && pending.timer === timer) pending = null;
        reject2(new Error("等待 Background 响应超时（" + responseType + "）"));
      }, REQUEST_TIMEOUT_MS);
      pending = {
        type: responseType,
        timer,
        resolve: (m) => {
          window.clearTimeout(timer);
          resolve(m);
        }
      };
      try {
        port.postMessage(Object.assign({ tabId: ctx.tabId }, msg));
      } catch (e) {
        window.clearTimeout(timer);
        pending = null;
        reject2(e);
      }
    });
    const p = queue.then(run, run);
    queue = p.catch(() => void 0);
    return p;
  }
  function handleResponse(msg) {
    if (!pending || pending.type !== msg.type) return;
    const p = pending;
    pending = null;
    p.resolve(msg);
  }
  async function evalInFrame(frameIndex, expression) {
    const r = await request({ type: "manual-capture-evaluate", frameIndex, expression }, "manual-capture-evaluate-response");
    return r && r.data || { success: false, error: "Background 没有返回结果" };
  }
  function setResult(text) {
    resultEl.textContent = text;
    resultEl.hidden = text === "";
  }
  function setInfo(text) {
    infoEl.textContent = text;
  }
  function renderState() {
    stateEl.textContent = paused ? "已暂停" : "运行中";
    stateEl.className = "rt-value rt-badge " + (paused ? "paused" : "running");
  }
  function updateControls() {
    const haveFrames = frames.length > 0;
    frameSel.disabled = !haveFrames || busy;
    btnScopes.disabled = !haveFrames || busy;
    callSiteSel.disabled = choices.length === 0 || busy;
    btnEval.disabled = !haveFrames || choices.length === 0 || busy;
    btnRefresh.disabled = busy;
  }
  function selectedFrame() {
    return frames[Number(frameSel.value)];
  }
  function astOf(script) {
    const key = script.scriptId + ":" + (script.source ? script.source.length : 0);
    let ast = astCache.get(key);
    if (!ast) {
      ast = parseCode(script.source);
      astCache.set(key, ast);
    }
    return ast;
  }
  function renderCallSites() {
    callSiteSel.textContent = "";
    choices = [];
    const frame = selectedFrame();
    if (!frame) {
      updateControls();
      return;
    }
    const script = ctx.getScript(frame.scriptId);
    if (!script || !script.source) {
      setInfo("帧所在脚本 " + frame.scriptId + " 不在已发现的脚本集合里，没有源码，无法静态定位调用点。");
      updateControls();
      return;
    }
    if (ctx.isRetired(script.scriptId)) {
      setInfo("脚本 " + script.scriptId + " 已过期（页面已刷新），不能用于手动求值。");
      updateControls();
      return;
    }
    const res = script.discoveryResult;
    if (!res || !res.analyzed) {
      setInfo("脚本 " + script.scriptId + " 还没有可用的静态分析结果。");
      updateControls();
      return;
    }
    const min = ctx.getMinConfidence();
    const cands = res.candidates.filter((c) => !!c.name && (c.confidence === "high" || min === "medium" && c.confidence === "medium"));
    if (cands.length === 0) {
      setInfo("该脚本没有满足当前门槛（" + min + "）的候选解码函数。门槛在 Capture 面板里切换，默认 high。");
      updateControls();
      return;
    }
    let ast;
    try {
      ast = astOf(script);
    } catch (e) {
      setInfo("脚本源码解析失败：" + errText(e));
      updateControls();
      return;
    }
    const sites = [];
    for (const cand of cands) {
      let entry;
      try {
        const plan = computeCapturePlan(script.source, cand.location.start, ast);
        if (plan.supported && plan.entry) entry = plan.entry;
      } catch {
        entry = void 0;
      }
      if (!entry) continue;
      for (const cs of cand.callSites) {
        if (!cand.name || !cs.callText.startsWith(cand.name + "(")) continue;
        if (!cs.args.every((a) => a.isLiteral)) continue;
        const call = { lineNumber: cs.location.startLine - 1, columnNumber: cs.location.startColumn };
        sites.push({
          cand,
          entry,
          call,
          dist: Math.abs(call.lineNumber - frame.location.lineNumber),
          label: "L" + (call.lineNumber + 1) + ":" + (call.columnNumber + 1) + "  " + cs.callText.slice(0, 80)
        });
      }
    }
    sites.sort((a, b) => a.dist - b.dist || a.call.lineNumber - b.call.lineNumber || a.call.columnNumber - b.call.columnNumber);
    choices = sites.slice(0, MAX_CALLSITE_OPTIONS);
    choices.forEach((c, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = c.label;
      callSiteSel.appendChild(o);
    });
    setInfo(sites.length === 0 ? "该脚本里没有字面量参数的直接调用点可选。" : "共 " + sites.length + " 个字面量参数的直接调用点" + (sites.length > choices.length ? "，列出离暂停行最近的 " + choices.length + " 个" : "") + "。");
    updateControls();
  }
  function renderFrames() {
    frameSel.textContent = "";
    frames.forEach((f) => {
      const o = document.createElement("option");
      o.value = String(f.index);
      o.textContent = "#" + f.index + " " + f.functionName + " @ " + fileOf(f.scriptUrl, f.scriptId) + ":" + (f.location.lineNumber + 1) + ":" + (f.location.columnNumber + 1);
      frameSel.appendChild(o);
    });
    renderCallSites();
    updateControls();
  }
  function renderRecords() {
    recordsEl.textContent = "";
    for (const r of records.slice(0, MAX_RECORDS_SHOWN)) {
      const row = document.createElement("div");
      row.className = "decoder-info-row";
      const strong = document.createElement("strong");
      strong.textContent = new Date(r.timestamp).toLocaleTimeString();
      const span = document.createElement("span");
      span.textContent = r.functionName + " @ " + fileOf(r.scriptUrl, r.scriptId) + ":" + (r.location.lineNumber + 1) + ":" + (r.location.columnNumber + 1) + "  栈深 " + r.stackDepth;
      row.append(strong, span);
      recordsEl.appendChild(row);
    }
  }
  async function refresh(quiet) {
    try {
      const r = await request({ type: "manual-capture-get-frames" }, "manual-capture-frames-response");
      const d = r && r.data;
      if (!d || !d.success) throw new Error(d && d.error || "读取调用栈失败");
      frames = d.frames;
      paused = true;
      renderState();
      renderFrames();
      if (!quiet) setResult("");
    } catch (e) {
      frames = [];
      choices = [];
      renderFrames();
      if (quiet) {
        setInfo(mode === "auto" ? "自动捕获模式下不读取暂停调用栈。" : "收到暂停，但没有保存到调用栈：" + errText(e));
      } else {
        setResult("读取调用栈失败：" + errText(e));
      }
    }
  }
  async function showScopes() {
    const frame = selectedFrame();
    if (!frame) {
      setResult("请先读取暂停调用栈并选择一帧。");
      return;
    }
    try {
      const r = await request({ type: "manual-capture-get-scopes", frameIndex: frame.index }, "manual-capture-scopes-response");
      const d = r && r.data;
      if (!d || !d.success) throw new Error(d && d.error || "读取作用域失败");
      const lines = ["帧 #" + frame.index + " " + d.functionName + " 的作用域（只读；页面传来的值按文本显示）"];
      for (const s of d.scopes) {
        lines.push("[" + s.type + (s.name ? " " + s.name : "") + "]" + (s.skipped ? "  " + s.skipped : ""));
        for (const [k, v] of Object.entries(s.variables)) lines.push("  " + k + " = " + fmt(v));
        if (s.truncated) lines.push("  …变量过多，已截断");
      }
      scopesEl.textContent = lines.join(NL);
      scopesEl.hidden = false;
    } catch (e) {
      setResult("读取作用域失败：" + errText(e));
    }
  }
  async function evalSelected() {
    if (busy) return;
    if (!paused || frames.length === 0) {
      setResult("当前没有处于暂停状态的调用栈。请先在 Sources 里自己设置断点并触发，再点“读取暂停调用栈”。");
      return;
    }
    const frame = selectedFrame();
    const choice = choices[Number(callSiteSel.value)];
    if (!frame || !choice) {
      setResult("请选择调用栈帧和调用点。");
      return;
    }
    const script = ctx.getScript(frame.scriptId);
    if (!script || !script.source) {
      setResult("帧所在脚本没有源码，不能求值。");
      return;
    }
    busy = true;
    updateControls();
    try {
      const vs = { scriptId: script.scriptId, source: script.source, url: script.url, startLine: script.startLine, startColumn: script.startColumn };
      const plan = planManualCapture(vs, choice.entry, choice.cand.name, choice.call);
      if (!plan.ok) {
        setResult("❌ 未加入验证：" + plan.code + "：" + plan.message);
        return;
      }
      const probe = await evalInFrame(frame.index, plan.bindingProbe);
      const evaluated = await evalInFrame(frame.index, plan.expression);
      const built = buildManualCapture(plan, probe, evaluated, { scriptUrl: script.url, seq: MANUAL_SEQ_BASE + ++seq, timestamp: Date.now() });
      if (!built.ok) {
        if (built.blocked) {
          table.set(built.blocked.key, built.blocked);
          ctx.onCapturesChanged();
          ctx.log("warn", "手动求值被 V8 拒绝（可能有副作用），已记为证据不足：" + plan.expression);
        }
        setResult("❌ 未加入验证：" + built.code + "：" + built.message);
        return;
      }
      table.set(built.capture.key, built.capture);
      ctx.onCapturesChanged();
      const pos = "L" + (plan.callLocation.lineNumber + 1) + ":" + (plan.callLocation.columnNumber + 1);
      setResult([
        "✅ 已加入验证（手动求值，只算 1 次观测）",
        plan.expression + " → " + fmt(built.capture.returnValue),
        "调用点 " + pos + "，在帧 #" + frame.index + " " + frame.functionName + " 中求值；绑定探针已确认该帧里的 " + plan.functionName + " 与静态分析的是同一个函数。",
        "这是在暂停时重新执行一次调用，不是读取原调用当时的返回值；能否替换由 Phase 3.2 验证和 dry-run 决定，未通过验证的不会被替换。"
      ].join(NL));
      ctx.log("info", "手动求值已加入验证：" + plan.expression + " → " + fmt(built.capture.returnValue));
    } catch (e) {
      setResult("❌ 求值出错：" + errText(e));
    } finally {
      busy = false;
      updateControls();
    }
  }
  function applyMode(next) {
    mode = next;
    modeSel.value = next;
  }
  function onPaused(info) {
    paused = true;
    renderState();
    setInfo("收到暂停（" + info.reason + "），正在读取调用栈…");
    void refresh(true);
  }
  function onResumed() {
    const was = paused || frames.length > 0;
    paused = false;
    frames = [];
    choices = [];
    renderState();
    renderFrames();
    scopesEl.hidden = true;
    scopesEl.textContent = "";
    if (was) setInfo("执行已恢复，保存的调用栈已失效。");
  }
  function onPageReset() {
    table.clear();
    astCache.clear();
    onResumed();
    ctx.onCapturesChanged();
  }
  function onRecord(record) {
    records.unshift(record);
    if (records.length > MAX_RECORDS_KEPT) records.length = MAX_RECORDS_KEPT;
    renderRecords();
  }
  function syncMode(active) {
    if (active === lastActive) return;
    lastActive = active;
    applyMode(active ? "auto" : "manual");
  }
  btnRefresh.addEventListener("click", () => {
    void refresh(false);
  });
  btnScopes.addEventListener("click", () => {
    void showScopes();
  });
  btnEval.addEventListener("click", () => {
    void evalSelected();
  });
  frameSel.addEventListener("change", () => {
    scopesEl.hidden = true;
    renderCallSites();
  });
  btnClear.addEventListener("click", () => {
    table.clear();
    records.length = 0;
    renderRecords();
    setResult("");
    ctx.getPort()?.postMessage({ type: "manual-capture-clear", tabId: ctx.tabId });
    ctx.onCapturesChanged();
  });
  modeSel.addEventListener("change", () => {
    const next = modeSel.value === "auto" ? "auto" : "manual";
    ctx.getPort()?.postMessage({ type: "capture-set-mode", tabId: ctx.tabId, mode: next });
  });
  renderState();
  updateControls();
  ctx.getPort()?.postMessage({ type: "capture-get-mode", tabId: ctx.tabId });
  return {
    handleResponse,
    onPaused,
    onResumed,
    onPageReset,
    onModeChanged: applyMode,
    syncMode,
    onRecord,
    getCaptures: () => Array.from(table.values())
  };
}
const MAX_QUEUE = 64;
const TIMEOUT_MS = 10 * 60 * 1e3;
class DecoderAnalysisClient {
  worker = null;
  hooks;
  nextId = 1;
  queue = [];
  inflight = null;
  /** scriptId → 已完成结果（含分析失败），用于去重 */
  cache = /* @__PURE__ */ new Map();
  /** scriptId → 正在排队或正在执行 */
  active = /* @__PURE__ */ new Set();
  disposed = false;
  workerBroken = false;
  constructor(hooks = {}) {
    this.hooks = hooks;
  }
  /**
   * 分析一个脚本。同一 scriptId 重复调用复用同一结果（force=true 时重新分析）。
   * 永远不 reject：结果与错误都通过 resolve 返回，调用方按显式分支处理。
   */
  analyze(job, opts = {}) {
    if (this.disposed) return Promise.resolve({ kind: "error", error: "分析客户端已关闭" });
    if (!opts.force) {
      const hit = this.cache.get(job.scriptId);
      if (hit) return Promise.resolve(hit);
      if (this.active.has(job.scriptId)) return this.attachToActive(job.scriptId);
    }
    if (this.workerBroken) {
      return Promise.resolve({ kind: "error", error: "分析 Worker 不可用" });
    }
    if (this.queue.length + (this.inflight ? 1 : 0) >= MAX_QUEUE) {
      return Promise.resolve({ kind: "error", error: `分析队列已满（上限 ${MAX_QUEUE}），该脚本未分析` });
    }
    return new Promise((resolve) => {
      const p = { id: this.nextId++, job, resolve, timer: 0 };
      this.queue.push(p);
      this.active.add(job.scriptId);
      this.pump();
    });
  }
  /** 同一 scriptId 的并发调用合并到队列里已存在的那一项上 */
  attachToActive(scriptId) {
    const inQueue = this.queue.find((p) => p.job.scriptId === scriptId);
    if (inQueue) {
      return new Promise((resolve) => {
        const orig = inQueue.resolve;
        inQueue.resolve = (o) => {
          orig(o);
          resolve(o);
        };
      });
    }
    return new Promise((resolve) => {
      const wait = () => {
        if (this.disposed) {
          resolve({ kind: "error", error: "分析客户端已关闭" });
          return;
        }
        const hit = this.cache.get(scriptId);
        if (hit) {
          resolve(hit);
          return;
        }
        if (!this.active.has(scriptId)) {
          resolve({ kind: "error", error: "分析任务已结束但没有结果" });
          return;
        }
        self.setTimeout(wait, 100);
      };
      wait();
    });
  }
  /** 串行推进队列：并发上限为 1 */
  pump() {
    if (this.disposed || this.inflight) return;
    const next = this.queue.shift();
    if (!next) return;
    const w = this.ensureWorker();
    if (!w) {
      this.finish(next, { kind: "error", error: "分析 Worker 不可用" });
      return;
    }
    this.inflight = next;
    next.timer = self.setTimeout(() => {
      this.breakWorker("分析超时");
      this.finish(next, { kind: "error", error: `分析超时（超过 ${TIMEOUT_MS} ms 无响应）` });
    }, TIMEOUT_MS);
    try {
      w.postMessage({ id: next.id, source: next.job.source, scriptId: next.job.scriptId, scriptUrl: next.job.scriptUrl });
    } catch (e) {
      this.breakWorker("postMessage 失败");
      this.finish(next, { kind: "error", error: `向 Worker 发送任务失败：${e?.message ?? e}` });
    }
  }
  ensureWorker() {
    if (this.worker) return this.worker;
    if (this.workerBroken) return null;
    try {
      const w = new Worker(new URL(
        /* @vite-ignore */
        "/assets/decoder-analysis.worker-CMwEr3ip.js",
        import.meta.url
      ), { type: "module" });
      w.onmessage = (ev) => this.onWorkerMessage(ev.data);
      w.onerror = (ev) => {
        this.breakWorker("Worker 错误：" + (ev?.message ?? "unknown"));
        this.drainQueueAsFailed("分析 Worker 出错");
      };
      this.worker = w;
      return w;
    } catch (e) {
      this.workerBroken = true;
      this.hooks.onWorkerUnavailable?.(String(e?.message ?? e));
      return null;
    }
  }
  onWorkerMessage(data) {
    const cur = this.inflight;
    if (!cur || !data || data.id !== cur.id) return;
    if (data.ok && data.result) this.finish(cur, { kind: "result", result: data.result });
    else this.finish(cur, { kind: "error", error: String(data.error ?? "Worker 未返回结果") });
  }
  finish(p, outcome) {
    if (p.timer) self.clearTimeout(p.timer);
    if (this.inflight === p) this.inflight = null;
    this.active.delete(p.job.scriptId);
    this.cache.set(p.job.scriptId, outcome);
    p.resolve(outcome);
    this.pump();
  }
  /** Worker 崩溃：丢弃它，后续任务重建一个新的 */
  breakWorker(reason) {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
      }
      this.worker = null;
    }
    if (this.queue.length > MAX_QUEUE) this.queue.length = MAX_QUEUE;
    this.hooks.onWorkerUnavailable?.(reason);
  }
  drainQueueAsFailed(reason) {
    const rest = this.queue;
    this.queue = [];
    for (const p of rest) {
      this.active.delete(p.job.scriptId);
      this.cache.set(p.job.scriptId, { kind: "error", error: reason });
      p.resolve({ kind: "error", error: reason });
    }
  }
  /**
   * 取消全部任务（页面刷新重置、面板关闭）。
   * 在飞行与排队的任务全部以显式错误结束；清空去重缓存，因为旧脚本已过期。
   */
  cancelAll(reason) {
    if (this.inflight) {
      const cur = this.inflight;
      this.inflight = null;
      this.active.delete(cur.job.scriptId);
      if (cur.timer) self.clearTimeout(cur.timer);
      cur.resolve({ kind: "error", error: reason });
    }
    this.drainQueueAsFailed(reason);
    this.cache.clear();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
      }
      this.worker = null;
    }
    this.workerBroken = false;
  }
  dispose() {
    this.disposed = true;
    this.cancelAll("面板已关闭");
  }
  /** 只读观测：队列状态，供测试与进度显示使用 */
  stats() {
    return { queued: this.queue.length, inflight: this.inflight !== null, cached: this.cache.size, workerBroken: this.workerBroken };
  }
}
const discoveredScripts = /* @__PURE__ */ new Map();
const allCandidates = [];
const candidateScript = /* @__PURE__ */ new WeakMap();
const analysisClient = new DecoderAnalysisClient({
  onWorkerUnavailable: (reason) => {
    rtLog("error", `分析 Worker 不可用：${reason}`);
  }
});
const scripts = [];
let activeScript = null;
async function getCacheKey() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval("location.origin", (result, exInfo) => {
      resolve("ob_recover_scripts_" + (exInfo?.isException ? "unknown" : result || "unknown"));
    });
  });
}
async function saveScriptsToCache() {
  const key = await getCacheKey();
  const data = scripts.map((s) => ({
    url: s.url,
    source: s.source,
    size: s.size,
    recovered: s.recovered || null,
    transforms: s.transforms || null,
    stats: s.stats || null
  }));
  await chrome.storage.local.set({
    [key]: {
      scripts: data,
      lastSelectedUrl: activeScript?.url || null,
      ts: Date.now()
    }
  });
}
async function loadScriptsFromCache() {
  const key = await getCacheKey();
  const result = await chrome.storage.local.get(key);
  const cached = result[key];
  if (!cached) return false;
  const arr = Array.isArray(cached) ? cached : cached.scripts;
  if (!arr || arr.length === 0) return false;
  if (cached.ts && Date.now() - cached.ts > 7 * 24 * 60 * 60 * 1e3) return false;
  for (const item of arr) {
    const s = {
      url: item.url,
      source: item.source,
      size: item.size || item.source?.length || 0,
      recovered: item.recovered || void 0,
      transforms: item.transforms || void 0,
      stats: item.stats || void 0
    };
    scripts.push(s);
    const li = document.createElement("li");
    li.innerHTML = `<span class="script-name">${esc(shortUrl(s.url))}</span><span class="script-size">${formatBytes(s.size)}</span>`;
    li.title = s.url;
    li.addEventListener("click", () => selectScript(s, li));
    scriptListEl.appendChild(li);
  }
  scriptCountEl.textContent = String(scripts.length);
  const lastUrl = cached.lastSelectedUrl;
  let target = scripts[0];
  if (lastUrl) {
    const found = scripts.find((s) => s.url === lastUrl);
    if (found) target = found;
  }
  const allLi = scriptListEl.querySelectorAll("li");
  let targetLi;
  allLi.forEach((li) => {
    if (li.title === target.url) targetLi = li;
  });
  selectScript(target, targetLi);
  setStatus(`缓存加载: ${scripts.length} 个脚本`);
  return true;
}
const scriptListEl = document.getElementById("script-list");
const scriptCountEl = document.getElementById("script-count");
const btnRecover = document.getElementById("btn-recover");
const btnCopyOriginal = document.getElementById("btn-copy-original");
const btnCopyRecovered = document.getElementById("btn-copy-recovered");
const statusEl = document.getElementById("status");
const codeOriginal = document.getElementById("code-original");
const codeRecovered = document.getElementById("code-recovered");
const statsOriginal = document.getElementById("stats-original");
const statsRecovered = document.getElementById("stats-recovered");
const transformCountEl = document.getElementById("transform-count");
const transformListEl = document.getElementById("transform-list");
const sandboxEl = document.createElement("iframe");
sandboxEl.style.display = "none";
sandboxEl.src = "sandbox.html";
document.body.appendChild(sandboxEl);
let sandboxReady = false;
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "sandbox-ready") {
    sandboxReady = true;
    setStatus("就绪");
  }
});
if (chrome.devtools?.network) {
  chrome.devtools.network.onRequestFinished.addListener((request) => {
    const url = request.request.url;
    const mime = request.response?.content?.mimeType || "";
    const isJS = mime.includes("javascript") || mime.includes("ecmascript") || /\.js(\?|$)/i.test(url);
    if (!isJS) return;
    if (scripts.some((s) => s.url === url)) return;
    request.getContent((body) => {
      if (!body || body.length < 100) return;
      addScript(url, body);
    });
  });
  chrome.devtools.network.onNavigated.addListener(() => {
    scripts.length = 0;
    activeScript = null;
    scriptListEl.innerHTML = "";
    scriptCountEl.textContent = "0";
    codeOriginal.textContent = "";
    codeRecovered.textContent = "";
    setStatus("页面已刷新，等待脚本...");
  });
}
function addScript(url, source) {
  const script = { url, source, size: source.length };
  scripts.push(script);
  scriptCountEl.textContent = String(scripts.length);
  const li = document.createElement("li");
  li.innerHTML = `<span class="script-name">${esc(shortUrl(url))}</span><span class="script-size">${formatBytes(source.length)}</span>`;
  li.title = url;
  li.addEventListener("click", () => selectScript(script, li));
  scriptListEl.appendChild(li);
  if (scripts.length === 1) selectScript(script, li);
  setStatus(`捕获: ${shortUrl(url)}`);
  saveScriptsToCache();
}
function selectScript(script, li) {
  activeScript = script;
  saveScriptsToCache();
  for (const el of scriptListEl.children) {
    el.classList.remove("active");
  }
  if (li) li.classList.add("active");
  renderCodeWithLineNumbers(codeOriginal, script.source);
  statsOriginal.textContent = formatBytes(script.size);
  if (script._formatted) {
    renderCodeWithLineNumbers(codeOriginal, script._formatted);
    statsOriginal.textContent = `${formatBytes(script._formatted.length)} (已格式化)`;
  } else {
    formatOriginal(script);
  }
  if (script.recovered) {
    renderCodeWithLineNumbers(codeRecovered, script.recovered);
    statsRecovered.textContent = `${formatBytes(script.recovered.length)} | ${script.transforms?.length || 0} 次转换`;
    showTransforms(script.transforms || []);
    btnCopyRecovered.disabled = false;
  } else {
    codeRecovered.textContent = '点击 "还原" 按钮处理该脚本';
    statsRecovered.textContent = "";
    transformCountEl.textContent = "0";
    transformListEl.innerHTML = "";
    btnCopyRecovered.disabled = true;
  }
  btnRecover.disabled = false;
  btnCopyOriginal.disabled = false;
}
(async () => {
  if (scripts.length === 0) {
    await loadScriptsFromCache();
  }
})();
btnRecover.addEventListener("click", async () => {
  if (!activeScript) return;
  btnRecover.disabled = true;
  btnRecover.textContent = "⏳ 处理中...";
  setStatus("正在还原...");
  try {
    const result = await callSandbox("recover", { code: activeScript.source });
    activeScript.recovered = result.code;
    activeScript.transforms = result.transforms;
    activeScript.stats = result.stats;
    renderCodeWithLineNumbers(codeRecovered, result.code);
    statsRecovered.textContent = `${formatBytes(result.code.length)} | ${result.transforms.length} 次转换`;
    showTransforms(result.transforms);
    btnCopyRecovered.disabled = false;
    const s = result.stats;
    setStatus(`✅ 完成 (${s.timeTaken.toFixed(0)}ms) — ${s.resolvedCalls} 处已还原`);
    saveScriptsToCache();
  } catch (err) {
    setStatus(`❌ 失败: ${err.message}`);
    codeRecovered.textContent = `错误:
${err.message}`;
  } finally {
    btnRecover.disabled = false;
    btnRecover.textContent = "还原";
  }
});
btnCopyOriginal.addEventListener("click", () => {
  if (activeScript) {
    navigator.clipboard.writeText(activeScript.source);
    setStatus("✅ 已复制原始代码");
  }
});
btnCopyRecovered.addEventListener("click", () => {
  if (activeScript?.recovered) {
    navigator.clipboard.writeText(activeScript.recovered);
    setStatus("✅ 已复制还原代码");
  }
});
function showTransforms(transforms) {
  transformCountEl.textContent = String(transforms.length);
  transformListEl.innerHTML = transforms.map((t) => {
    const loc = t.line > 1 ? `L${t.line}:${t.column}` : `Col:${t.column}`;
    const orig = t.original.length > 120 ? t.original.slice(0, 117) + "..." : t.original;
    const replaced = t.replaced.length > 120 ? t.replaced.slice(0, 117) + "..." : t.replaced;
    return `<div class="transform-item"><span class="transform-loc">${esc(loc)}</span><code class="transform-orig">${esc(orig)}</code><span class="transform-arrow">→</span><code class="transform-new">${esc(replaced)}</code></div>`;
  }).join("");
}
function callSandbox(method, params) {
  return new Promise((resolve, reject2) => {
    if (!sandboxEl.contentWindow) {
      reject2(new Error("Sandbox not loaded"));
      return;
    }
    const ch = new MessageChannel();
    const timer = setTimeout(() => reject2(new Error("Sandbox 超时 (60s)")), 6e4);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      if (e.data.error) reject2(new Error(e.data.error));
      else resolve(e.data.result);
    };
    sandboxEl.contentWindow.postMessage({ method, params }, "*", [ch.port2]);
  });
}
function formatOriginal(script) {
  const doFormat = () => {
    callSandbox("format", { code: script.source }).then((res) => {
      script._formatted = res.code;
      if (activeScript === script) {
        renderCodeWithLineNumbers(codeOriginal, res.code);
        statsOriginal.textContent = `${formatBytes(res.code.length)} (已格式化)`;
      }
    }).catch((err) => {
      console.warn("[OB-Recover] Format failed, using simple format:", err.message);
      const simple = simpleFormat(script.source);
      script._formatted = simple;
      if (activeScript === script) {
        renderCodeWithLineNumbers(codeOriginal, simple);
        statsOriginal.textContent = `${formatBytes(simple.length)} (简单格式化)`;
      }
    });
  };
  if (sandboxReady) {
    doFormat();
  } else {
    const check = setInterval(() => {
      if (sandboxReady) {
        clearInterval(check);
        doFormat();
      }
    }, 200);
    setTimeout(() => clearInterval(check), 1e4);
  }
}
function simpleFormat(code) {
  let result = "";
  let indent = 0;
  let inStr = false;
  let strCh = "";
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      result += ch;
      if (ch === "\\" && i + 1 < code.length) {
        result += code[++i];
        continue;
      }
      if (ch === strCh) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = true;
      strCh = ch;
      result += ch;
      continue;
    }
    if (ch === "{") {
      indent++;
      result += " {\n" + "    ".repeat(indent);
      continue;
    }
    if (ch === "}") {
      indent = Math.max(0, indent - 1);
      result += "\n" + "    ".repeat(indent) + "}";
      const next = code.slice(i + 1, i + 10).trimStart();
      if (!next.startsWith("else") && !next.startsWith("catch") && !next.startsWith("finally") && !next.startsWith(",") && !next.startsWith(")") && !next.startsWith(";")) {
        result += "\n" + "    ".repeat(indent);
      }
      continue;
    }
    if (ch === ";") {
      result += ";\n" + "    ".repeat(indent);
      continue;
    }
    result += ch;
  }
  return result;
}
function setStatus(text) {
  statusEl.textContent = text;
}
function shortUrl(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const filename = pathname.split("/").pop() || pathname;
    const query = u.search ? u.search.slice(0, 60) : "";
    const display = filename + query;
    return display.length > 80 ? display.slice(0, 77) + "..." : display;
  } catch {
    return url.length > 80 ? url.slice(0, 77) + "..." : url;
  }
}
function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function renderCodeWithLineNumbers(pre, code) {
  const lines = code.split("\n");
  const gutterWidth = String(lines.length).length;
  let html = '<table class="code-table"><tbody>';
  for (let i = 0; i < lines.length; i++) {
    const num = String(i + 1).padStart(gutterWidth, " ");
    html += `<tr class="code-row" data-ln="${i}"><td class="line-num">${num}</td><td class="line-code">${esc(lines[i]) || " "}</td></tr>`;
  }
  html += "</tbody></table>";
  pre.innerHTML = html;
}
let selHighlights = [];
function clearSelHighlights() {
  for (const el of selHighlights) {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ""), el);
      parent.normalize();
    }
  }
  selHighlights = [];
}
function highlightWordInPre(pre, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![a-zA-Z0-9_$])${escaped}(?![a-zA-Z0-9_$])`, "g");
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) textNodes.push(node);
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const tn = textNodes[i];
    const text = tn.textContent || "";
    re.lastIndex = 0;
    const parts = [];
    let lastIdx = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
      const span = document.createElement("span");
      span.className = "sel-highlight";
      span.textContent = m[0];
      parts.push(span);
      selHighlights.push(span);
      lastIdx = m.index + m[0].length;
    }
    if (parts.length === 0) continue;
    if (lastIdx < text.length) parts.push(text.slice(lastIdx));
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      frag.appendChild(typeof p === "string" ? document.createTextNode(p) : p);
    }
    tn.parentNode.replaceChild(frag, tn);
  }
}
let selTimer = null;
document.addEventListener("selectionchange", () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    clearSelHighlights();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = sel.toString().trim();
    if (!word || word.length < 2 || word.length > 60 || /\s/.test(word)) return;
    highlightWordInPre(codeOriginal, word);
    highlightWordInPre(codeRecovered, word);
  }, 150);
});
const searchStates = {
  original: {
    input: document.getElementById("search-original"),
    countEl: document.getElementById("search-count-original"),
    pre: codeOriginal,
    matches: [],
    current: -1
  },
  recovered: {
    input: document.getElementById("search-recovered"),
    countEl: document.getElementById("search-count-recovered"),
    pre: codeRecovered,
    matches: [],
    current: -1
  }
};
function doSearch(id) {
  const state = searchStates[id];
  clearSearch(id);
  const query = state.input.value;
  if (!query) {
    state.countEl.textContent = "";
    return;
  }
  const text = state.pre.textContent || "";
  const lowerQ = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const positions = [];
  let idx = 0;
  while ((idx = lowerText.indexOf(lowerQ, idx)) !== -1) {
    positions.push(idx);
    idx += query.length;
  }
  if (positions.length === 0) {
    state.countEl.textContent = "无结果";
    return;
  }
  const walker = document.createTreeWalker(state.pre, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) textNodes.push(node);
  const nodeRanges = [];
  let offset = 0;
  for (const tn of textNodes) {
    nodeRanges.push({ node: tn, start: offset, end: offset + tn.length });
    offset += tn.length;
  }
  for (let pi = positions.length - 1; pi >= 0; pi--) {
    const matchStart = positions[pi];
    const matchEnd = matchStart + query.length;
    for (let ni = 0; ni < nodeRanges.length; ni++) {
      const nr = nodeRanges[ni];
      if (nr.start <= matchStart && nr.end >= matchEnd) {
        const localStart = matchStart - nr.start;
        const localEnd = matchEnd - nr.start;
        const nodeText = nr.node.textContent || "";
        const before = nodeText.slice(0, localStart);
        const match = nodeText.slice(localStart, localEnd);
        const after = nodeText.slice(localEnd);
        const mark = document.createElement("span");
        mark.className = "search-highlight";
        mark.textContent = match;
        const parent = nr.node.parentNode;
        if (after) parent.insertBefore(document.createTextNode(after), nr.node.nextSibling);
        parent.insertBefore(mark, nr.node.nextSibling);
        nr.node.textContent = before;
        state.matches.unshift(mark);
        break;
      }
    }
  }
  if (state.matches.length > 0) {
    state.current = 0;
    state.matches[0].classList.add("current");
    state.matches[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }
  state.countEl.textContent = `${state.current + 1}/${state.matches.length}`;
}
function clearSearch(id) {
  const state = searchStates[id];
  if (state.matches.length === 0) return;
  for (const mark of state.matches) {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    }
  }
  state.matches = [];
  state.current = -1;
}
function navigateSearch(id, dir) {
  const state = searchStates[id];
  if (state.matches.length === 0) return;
  state.matches[state.current]?.classList.remove("current");
  if (dir === "next") {
    state.current = (state.current + 1) % state.matches.length;
  } else {
    state.current = (state.current - 1 + state.matches.length) % state.matches.length;
  }
  state.matches[state.current].classList.add("current");
  state.matches[state.current].scrollIntoView({ block: "center", behavior: "smooth" });
  state.countEl.textContent = `${state.current + 1}/${state.matches.length}`;
}
for (const [id, state] of Object.entries(searchStates)) {
  let timer;
  state.input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(id), 200);
  });
  state.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (state.matches.length === 0) doSearch(id);
      else navigateSearch(id, e.shiftKey ? "prev" : "next");
    }
    if (e.key === "Escape") {
      state.input.value = "";
      clearSearch(id);
      state.countEl.textContent = "";
      state.input.blur();
    }
  });
}
document.querySelectorAll(".search-nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    const dir = btn.dataset.dir;
    navigateSearch(target, dir);
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    const recoveredVisible = codeRecovered.textContent && codeRecovered.textContent !== '点击 "还原" 按钮处理该脚本';
    const target = recoveredVisible ? searchStates.recovered : searchStates.original;
    target.input.focus();
    target.input.select();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    const recoveredVisible = codeRecovered.textContent && codeRecovered.textContent !== '点击 "还原" 按钮处理该脚本';
    const target = recoveredVisible ? searchStates.recovered : searchStates.original;
    target.input.focus();
    target.input.select();
  }
});
function setupResize(handle, getTarget, direction, min, max, siblingEl) {
  let startX = 0;
  let startSize = 0;
  let siblingStartSize = 0;
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    const target = getTarget();
    startSize = target.getBoundingClientRect().width;
    if (siblingEl) siblingStartSize = siblingEl.getBoundingClientRect().width;
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const newSize = Math.max(min, Math.min(max, startSize + delta));
      if (direction === "width") {
        target.style.width = newSize + "px";
      } else if (siblingEl) {
        const total = startSize + siblingStartSize;
        const newSibling = total - newSize;
        target.style.flex = `0 0 ${newSize}px`;
        siblingEl.style.flex = `0 0 ${newSibling}px`;
      }
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
const sidebarEl = document.getElementById("sidebar");
const resizeSidebar = document.getElementById("resize-sidebar");
setupResize(resizeSidebar, () => sidebarEl, "width", 120, 600);
const panelOriginal = document.getElementById("panel-original");
const panelRecovered = document.getElementById("panel-recovered");
const resizePanels = document.getElementById("resize-panels");
setupResize(resizePanels, () => panelOriginal, "flex", 100, 2e3, panelRecovered);
const contextMenu = document.getElementById("context-menu");
const ctxEval = document.getElementById("ctx-eval");
const ctxAddMapping = document.getElementById("ctx-add-mapping");
const evalTooltip = document.getElementById("eval-tooltip");
let lastSelectedText = "";
let lastEvalResult = null;
codeOriginal.addEventListener("contextmenu", handleContextMenu);
codeRecovered.addEventListener("contextmenu", handleContextMenu);
function handleContextMenu(e) {
  const sel = window.getSelection();
  const text = sel?.toString().trim() || "";
  lastSelectedText = text;
  if (!text || text.length < 3 || text.length > 200) {
    contextMenu.classList.remove("visible");
    return;
  }
  e.preventDefault();
  ctxEval.classList.toggle("disabled", false);
  ctxAddMapping.classList.add("disabled");
  lastEvalResult = null;
  contextMenu.style.left = e.clientX + "px";
  contextMenu.style.top = e.clientY + "px";
  contextMenu.classList.add("visible");
}
document.addEventListener("click", () => {
  contextMenu.classList.remove("visible");
});
ctxEval.addEventListener("click", async () => {
  contextMenu.classList.remove("visible");
  if (!lastSelectedText) return;
  const expr = lastSelectedText;
  setStatus(`求值: ${expr.slice(0, 50)}...`);
  try {
    const result = await new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        `(function(){
          try {
            var __v = eval(${JSON.stringify(expr)});
            var __t = typeof __v;
            if (__v === null) return {v:"null",t:"null"};
            if (__v === undefined) return {v:"undefined",t:"undefined"};
            if (__t === "function") return {v:__v.toString().substring(0,300),t:"function"};
            if (__t === "object") {
              try { return {v:JSON.stringify(__v,null,2).substring(0,1500),t:(__v.constructor&&__v.constructor.name)||"object"}; }
              catch(e) { return {v:String(__v),t:"object"}; }
            }
            return {v:String(__v),t:__t};
          } catch(e) { return {v:e.message,t:"error"}; }
        })()`,
        (res, exInfo) => {
          if (exInfo) resolve({ v: exInfo.value || "eval error", t: "error" });
          else resolve(res || { v: "undefined", t: "undefined" });
        }
      );
    });
    lastEvalResult = { expr, value: result.v, type: result.t };
    showEvalTooltip(expr, result);
    setStatus(`求值完成: ${result.t}`);
  } catch (err) {
    setStatus(`求值失败: ${err.message}`);
  }
});
function showEvalTooltip(expr, result) {
  const isString = result.t === "string";
  const canAdd = isString && expr.match(/_0x[a-f0-9]+\s*\(/i);
  evalTooltip.innerHTML = `<div class="eval-expr">${esc(expr)}</div><div class="eval-type">${esc(result.t)}</div><div class="eval-result">${esc(result.v)}</div>` + (canAdd ? `<div class="eval-actions"><button class="eval-confirm" id="eval-add">✅ 加入映射</button><button class="eval-dismiss" id="eval-close">关闭</button></div>` : `<div class="eval-actions"><button class="eval-dismiss" id="eval-close">关闭</button></div>`);
  evalTooltip.classList.add("visible");
  evalTooltip.style.left = "50%";
  evalTooltip.style.top = "30%";
  evalTooltip.style.transform = "translate(-50%, -50%)";
  document.getElementById("eval-close")?.addEventListener("click", () => {
    evalTooltip.classList.remove("visible");
  });
  document.getElementById("eval-add")?.addEventListener("click", async () => {
    if (!lastEvalResult || !activeScript) return;
    try {
      setStatus("正在用新映射重新还原...");
      const mapping = {
        [lastEvalResult.expr]: {
          callText: lastEvalResult.expr,
          value: lastEvalResult.value,
          type: "string",
          confidence: "manual",
          source: "runtime-capture"
        }
      };
      const script = activeScript;
      const result2 = await callSandbox("recover", {
        code: script.source,
        externalMappings: mapping
      });
      const applied = result2.transforms.filter((x) => x.source === "runtime-capture" || x.original === expr).length;
      if (applied === 0) {
        setStatus(`❌ 映射未生效：原始脚本中没有可替换的 ${expr}（调用文本不一致，或参数不是字面量），还原代码未改动`);
        return;
      }
      script.recovered = result2.code;
      script.transforms = result2.transforms;
      script.stats = result2.stats;
      if (activeScript === script) {
        renderCodeWithLineNumbers(codeRecovered, result2.code);
        statsRecovered.textContent = `${formatBytes(result2.code.length)} | ${result2.transforms.length} 次转换`;
        showTransforms(result2.transforms);
      }
      saveScriptsToCache();
      setStatus(`✅ 映射已加入，${expr} 已替换 ${applied} 处`);
    } catch (err) {
      setStatus(`❌ 重新还原失败: ${err.message}`);
    }
    evalTooltip.classList.remove("visible");
  });
}
ctxAddMapping.addEventListener("click", () => {
  contextMenu.classList.remove("visible");
  ctxEval.click();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    evalTooltip.classList.remove("visible");
    contextMenu.classList.remove("visible");
  }
});
const rtTabIdEl = document.getElementById("rt-tab-id");
const rtDebuggerEl = document.getElementById("rt-debugger-status");
const rtRuntimeEl = document.getElementById("rt-runtime-status");
const rtPauseEl = document.getElementById("rt-pause-status");
const rtScriptIdEl = document.getElementById("rt-script-id");
const rtFunctionEl = document.getElementById("rt-function-name");
const rtLocationEl = document.getElementById("rt-location");
const rtLogEl = document.getElementById("runtime-log");
const btnRtConnect = document.getElementById("btn-rt-connect");
const btnRtDisconnect = document.getElementById("btn-rt-disconnect");
const btnRtResume = document.getElementById("btn-rt-resume");
const btnRtClear = document.getElementById("btn-rt-clear");
const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
let rtPort = null;
let rtStatus = "disconnected";
let rtIsPaused = false;
rtTabIdEl.textContent = String(inspectedTabId);
connectPort();
function connectPort() {
  if (rtPort) {
    try {
      rtPort.disconnect();
    } catch {
    }
    rtPort = null;
  }
  rtPort = chrome.runtime.connect({ name: `ob-recover-panel-${inspectedTabId}` });
  rtPort.onMessage.addListener((msg) => {
    if (msg.type === "debugger-event") {
      handleDebuggerEvent(msg);
    } else if (msg.type === "pong") ;
    else if (typeof msg.type === "string" && msg.type.startsWith("manual-capture-") && msg.type.endsWith("-response")) {
      manualPanel?.handleResponse(msg);
    }
  });
  rtPort.onDisconnect.addListener(() => {
    rtPort = null;
    rtLog("warn", "Background 已断开，正在重连...");
    setTimeout(connectPort, 1e3);
  });
  rtPort.postMessage({ type: "debugger-get-status", tabId: inspectedTabId });
}
window.addEventListener("unload", () => {
  analysisClient.dispose();
});
function handleDebuggerEvent(msg) {
  const ev = msg.event;
  switch (ev.kind) {
    case "status-changed": {
      rtStatus = ev.status;
      ev.status === "connected";
      updateRtStatusUI();
      if (ev.error) rtLog("error", `状态: ${ev.status} — ${ev.error}`);
      else rtLog("info", `状态: ${ev.status}`);
      break;
    }
    case "paused": {
      rtIsPaused = true;
      updateRtPauseUI(ev.info);
      manualPanel?.onPaused(ev.info);
      break;
    }
    case "resumed": {
      rtIsPaused = false;
      rtPauseEl.textContent = "运行中";
      rtPauseEl.className = "rt-value rt-badge running";
      rtScriptIdEl.textContent = "—";
      rtFunctionEl.textContent = "—";
      rtLocationEl.textContent = "—";
      btnRtResume.disabled = true;
      rtLog("event", "▶ 执行已恢复");
      manualPanel?.onResumed();
      break;
    }
    case "script-parsed": {
      const url = ev.info.url ? ev.info.url.split("/").pop() || ev.info.url : "(inline)";
      rtLog("event", `脚本已解析: [${ev.info.scriptId}] ${url}`);
      break;
    }
    case "context-created": {
      rtRuntimeEl.textContent = "已启用";
      rtRuntimeEl.className = "rt-value rt-badge enabled";
      rtLog("event", `执行上下文已创建: ${ev.context?.origin || ""}`);
      break;
    }
    case "log": {
      rtLog(ev.level, ev.message);
      break;
    }
    case "script-discovered": {
      handleScriptDiscovered(ev.script);
      break;
    }
    case "capture-event": {
      handleCaptureEvent(ev.event);
      break;
    }
    case "capture-state": {
      handleCaptureState(ev);
      break;
    }
    case "mode-changed": {
      manualPanel?.onModeChanged(ev.mode);
      break;
    }
    case "manual-capture": {
      manualPanel?.onRecord(ev.record);
      break;
    }
  }
}
function updateRtStatusUI() {
  const labels = {
    disconnected: "未连接",
    connecting: "连接中...",
    connected: "已连接",
    error: "错误"
  };
  rtDebuggerEl.textContent = labels[rtStatus] || rtStatus;
  rtDebuggerEl.className = `rt-value rt-badge ${rtStatus}`;
  const isConnected = rtStatus === "connected";
  btnRtConnect.disabled = isConnected || rtStatus === "connecting";
  btnRtDisconnect.disabled = !isConnected;
  if (isConnected) {
    rtRuntimeEl.textContent = "已启用";
    rtRuntimeEl.className = "rt-value rt-badge enabled";
  } else {
    rtRuntimeEl.textContent = "—";
    rtRuntimeEl.className = "rt-value rt-badge";
    rtIsPaused = false;
    manualPanel?.onResumed();
    rtPauseEl.textContent = "—";
    rtPauseEl.className = "rt-value rt-badge";
    btnRtResume.disabled = true;
  }
}
function updateRtPauseUI(info) {
  rtPauseEl.textContent = `已暂停 (${info.reason})`;
  rtPauseEl.className = "rt-value rt-badge paused";
  const topFrame = info.callFrames[0];
  if (topFrame) {
    rtScriptIdEl.textContent = topFrame.location.scriptId || "—";
    rtFunctionEl.textContent = topFrame.functionName || "(anonymous)";
    rtLocationEl.textContent = `L${topFrame.location.lineNumber + 1}:C${topFrame.location.columnNumber}`;
  }
  btnRtResume.disabled = false;
  rtLog("paused", `⏸ 已暂停 (${info.reason})`);
  info.callFrames.forEach((cf, i) => {
    const fn = cf.functionName || "(anonymous)";
    const loc = `L${cf.location.lineNumber + 1}:C${cf.location.columnNumber}`;
    const url = cf.url ? cf.url.split("/").pop() || cf.url : `script:${cf.location.scriptId}`;
    rtLog("info", `  ${i === 0 ? "▶" : " "} ${fn} @ ${url} ${loc}`);
  });
}
btnRtConnect.addEventListener("click", () => {
  if (!rtPort) {
    connectPort();
    return;
  }
  rtLog("info", `正在连接 tab ${inspectedTabId}...`);
  rtPort.postMessage({ type: "debugger-connect", tabId: inspectedTabId });
});
btnRtDisconnect.addEventListener("click", () => {
  if (!rtPort) return;
  rtPort.postMessage({ type: "debugger-disconnect", tabId: inspectedTabId });
});
btnRtResume.addEventListener("click", () => {
  if (!rtPort || !rtIsPaused) return;
  rtPort.postMessage({ type: "debugger-resume", tabId: inspectedTabId });
});
btnRtClear.addEventListener("click", () => {
  rtLogEl.innerHTML = "";
});
function rtLog(level, message) {
  const now = /* @__PURE__ */ new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const entry = document.createElement("div");
  entry.className = `rt-log-entry ${level}`;
  entry.innerHTML = `<span class="rt-time">${time}</span><span class="rt-msg">${esc(message)}</span>`;
  rtLogEl.appendChild(entry);
  while (rtLogEl.children.length > 300) {
    rtLogEl.removeChild(rtLogEl.firstChild);
  }
  rtLogEl.scrollTop = rtLogEl.scrollHeight;
}
const decTotalEl = document.getElementById("dec-total");
const decAnalyzedEl = document.getElementById("dec-analyzed");
const decCandidatesEl = document.getElementById("dec-candidates");
const decHighEl = document.getElementById("dec-high");
const decCallsEl = document.getElementById("dec-calls");
const decoderListEl = document.getElementById("decoder-list");
const btnRefreshEl = document.getElementById("btn-refresh-discovery");
btnRefreshEl.addEventListener("click", () => {
  void refreshDecoderDiscovery();
});
function handleScriptDiscovered(script) {
  discoveredScripts.set(script.scriptId, script);
  retiredScriptIds.delete(script.scriptId);
  scheduleValidationStats();
  rtLog("info", `发现脚本 [${script.scriptId}]: ${script.url || "(inline)"}`);
  const existingScript = scripts.find((s) => s.url === script.url);
  if (existingScript) {
    existingScript.scriptId = script.scriptId;
    existingScript.startLine = script.startLine;
    existingScript.startColumn = script.startColumn;
  }
  if (!script.source) {
    rtLog("warn", `脚本 ${script.scriptId} 源码为空`);
    updateDecoderStats();
    return;
  }
  void analyzeAndMerge(script, false);
}
async function analyzeAndMerge(script, force) {
  const outcome = await analysisClient.analyze(
    { scriptId: script.scriptId, source: script.source, scriptUrl: script.url },
    { force }
  );
  if (discoveredScripts.get(script.scriptId) !== script) return;
  if (outcome.kind === "error") {
    script.analysisError = outcome.error;
    rtLog("error", `脚本 ${script.scriptId} 分析失败: ${outcome.error}`);
    updateDecoderStats();
    return;
  }
  const result = outcome.result;
  script.analyzed = true;
  script.discoveryResult = result;
  if (!result.analyzed) {
    script.analysisError = result.error;
    rtLog("error", `脚本 ${script.scriptId} 分析失败: ${result.error}`);
    updateDecoderStats();
    return;
  }
  for (const cand of result.candidates) {
    allCandidates.push(cand);
    candidateScript.set(cand, script);
  }
  rtLog("info", `分析完成: ${result.candidates.length} 个候选解码器`);
  updateDecoderStats();
  renderDecoderList();
}
function updateDecoderStats() {
  const analyzed = Array.from(discoveredScripts.values()).filter((s) => s.analyzed).length;
  const high = allCandidates.filter((c) => c.confidence === "high").length;
  const totalCalls = allCandidates.reduce((sum, c) => sum + c.callSites.length, 0);
  decTotalEl.textContent = String(discoveredScripts.size);
  decAnalyzedEl.textContent = String(analyzed);
  decCandidatesEl.textContent = String(allCandidates.length);
  decHighEl.textContent = String(high);
  decCallsEl.textContent = String(totalCalls);
}
function renderDecoderList() {
  decoderListEl.innerHTML = "";
  if (allCandidates.length === 0) {
    decoderListEl.innerHTML = '<div class="empty-state">未发现候选解码函数</div>';
    return;
  }
  const sorted = [...allCandidates].sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[b.confidence] - order[a.confidence];
  });
  for (const cand of sorted) {
    const card = document.createElement("div");
    card.className = "decoder-card";
    const header = document.createElement("div");
    header.className = "decoder-card-header";
    header.onclick = () => card.classList.toggle("open");
    const left = document.createElement("div");
    left.className = "decoder-card-left";
    const name = document.createElement("span");
    name.className = "decoder-name";
    name.textContent = cand.name || "(anonymous)";
    const badges = document.createElement("div");
    badges.className = "decoder-badges";
    const confBadge = document.createElement("span");
    confBadge.className = `decoder-badge ${cand.confidence}`;
    confBadge.textContent = cand.confidence;
    const callBadge = document.createElement("span");
    callBadge.className = "decoder-badge";
    callBadge.textContent = `${cand.callCount} calls`;
    callBadge.style.background = "#3a3a5a";
    callBadge.style.color = "#a0a0e0";
    badges.appendChild(confBadge);
    badges.appendChild(callBadge);
    left.appendChild(name);
    left.appendChild(badges);
    const toggle = document.createElement("span");
    toggle.className = "decoder-toggle";
    toggle.textContent = "▶";
    header.appendChild(left);
    header.appendChild(toggle);
    const body = document.createElement("div");
    body.className = "decoder-card-body";
    body.innerHTML += `
      <div class="decoder-info-row"><strong>类型:</strong> ${cand.kind}</div>
      <div class="decoder-info-row"><strong>参数:</strong> ${cand.paramCount} (${cand.paramNames.join(", ")})</div>
      <div class="decoder-info-row"><strong>位置:</strong> ${cand.location.startLine}:${cand.location.startColumn}</div>
    `;
    if (cand.evidence.length > 0) {
      const evSection = document.createElement("div");
      evSection.className = "decoder-evidence";
      evSection.innerHTML = '<div class="decoder-evidence-title">识别依据:</div>';
      const evList = document.createElement("ul");
      evList.className = "evidence-list";
      for (const ev of cand.evidence) {
        const li = document.createElement("li");
        li.textContent = ev;
        evList.appendChild(li);
      }
      evSection.appendChild(evList);
      body.appendChild(evSection);
    }
    if (cand.dependencies.length > 0) {
      const depsSection = document.createElement("div");
      depsSection.className = "decoder-deps";
      depsSection.innerHTML = '<div class="decoder-evidence-title">依赖:</div>';
      for (const dep of cand.dependencies) {
        const depItem = document.createElement("div");
        depItem.className = "dep-item";
        depItem.innerHTML = `<code>${dep.name}</code> — ${dep.description}`;
        depsSection.appendChild(depItem);
      }
      body.appendChild(depsSection);
    }
    if (cand.callSites.length > 0) {
      const callsSection = document.createElement("div");
      callsSection.className = "decoder-calls";
      callsSection.innerHTML = `<div class="decoder-evidence-title">调用位置 (${cand.callSites.length}):</div>`;
      const limit = Math.min(5, cand.callSites.length);
      for (let i = 0; i < limit; i++) {
        const site = cand.callSites[i];
        const callItem = document.createElement("div");
        callItem.className = "call-item";
        callItem.innerHTML = `${site.location.startLine}:${site.location.startColumn} — <code>${site.callText}</code>`;
        callsSection.appendChild(callItem);
      }
      if (cand.callSites.length > 5) {
        callsSection.innerHTML += `<div class="call-item" style="color:#606060">... 还有 ${cand.callSites.length - 5} 个</div>`;
      }
      body.appendChild(callsSection);
    }
    card.appendChild(header);
    card.appendChild(body);
    decoderListEl.appendChild(card);
  }
}
async function refreshDecoderDiscovery() {
  allCandidates.length = 0;
  updateDecoderStats();
  renderDecoderList();
  for (const script of discoveredScripts.values()) {
    if (script.source) {
      script.analyzed = false;
      script.analysisError = void 0;
      await analyzeAndMerge(script, true);
    }
  }
  updateDecoderStats();
  renderDecoderList();
  rtLog("info", "已刷新解码器发现列表");
  scheduleValidationStats();
}
const capStatusEl = document.getElementById("cap-status");
const capBpsEl = document.getElementById("cap-bps");
const capHitsEl = document.getElementById("cap-hits");
const capSuccessEl = document.getElementById("cap-success");
const capFailedEl = document.getElementById("cap-failed");
const capNoticeEl = document.getElementById("cap-notice");
const capListEl = document.getElementById("cap-list");
const btnCapStart = document.getElementById("btn-cap-start");
const btnCapStop = document.getElementById("btn-cap-stop");
const btnCapClear = document.getElementById("btn-cap-clear");
const capUnstableEl = document.getElementById("cap-unstable");
const capMinConfEl = document.getElementById("cap-min-confidence");
const capVerifiedEl = document.getElementById("cap-verified");
const capVUnstableEl = document.getElementById("cap-v-unstable");
const capVFailedEl = document.getElementById("cap-v-failed");
const capVInsufficientEl = document.getElementById("cap-v-insufficient");
const capVPendingEl = document.getElementById("cap-v-pending");
const capVTotalEl = document.getElementById("cap-v-total");
const capDryrunEl = document.getElementById("cap-dryrun");
const btnCapDryrun = document.getElementById("btn-cap-dryrun");
const capApplyResultEl = document.getElementById("cap-apply-result");
const btnCapApply = document.getElementById("btn-cap-apply");
const VALIDATION_LABEL = { pending: "等待验证", verified: "已验证", unstable: "不稳定", failed: "验证失败", insufficient: "证据不足" };
let capIsActive = false;
let capValidationErrorLogged = false;
const retiredScriptIds = /* @__PURE__ */ new Set();
function currentValidationScripts() {
  const out = [];
  for (const s of discoveredScripts.values()) {
    if (!s.source || retiredScriptIds.has(s.scriptId)) continue;
    out.push({ scriptId: s.scriptId, source: s.source, url: s.url, startLine: s.startLine, startColumn: s.startColumn });
  }
  return out;
}
const capTable = /* @__PURE__ */ new Map();
let manualPanel = null;
function allCaptures() {
  return Array.from(capTable.values()).concat(manualPanel ? manualPanel.getCaptures() : []);
}
function runValidation() {
  const { report, stats } = computeValidationStats(allCaptures(), currentValidationScripts(), { captureActive: capIsActive });
  capVerifiedEl.textContent = String(stats.byStatus.verified);
  capVUnstableEl.textContent = String(stats.byStatus.unstable);
  capVFailedEl.textContent = String(stats.byStatus.failed);
  capVInsufficientEl.textContent = String(stats.byStatus.insufficient);
  capVPendingEl.textContent = String(stats.byStatus.pending);
  capVTotalEl.textContent = String(stats.groups) + (stats.consistent ? "" : "（统计不一致！）");
  capVTotalEl.title = `验证组 ${stats.groups}，对应捕获记录 ${stats.records} 条；单次观测通过 ${stats.byEvidence.single} 组，多次一致观测通过 ${stats.byEvidence.multiple} 组，脚本已过期 ${stats.staleGroups} 组`;
  return report;
}
let valStatsTimer = null;
function scheduleValidationStats() {
  if (valStatsTimer !== null) return;
  valStatsTimer = window.setTimeout(() => {
    valStatsTimer = null;
    try {
      runValidation();
    } catch (e) {
      if (!capValidationErrorLogged) {
        capValidationErrorLogged = true;
        rtLog("error", `结果验证出错：${e?.message ?? e}`);
      }
    }
  }, 150);
}
const capExpanded = /* @__PURE__ */ new Set();
const CAP_RENDER_LIMIT = 300;
let capRenderQueued = false;
let capPollTimer = null;
let capStabilityFull = [];
let capMinConfidence = "high";
btnCapStart.addEventListener("click", startRuntimeCapture);
btnCapStop.addEventListener("click", () => {
  rtPort?.postMessage({ type: "capture-stop", tabId: inspectedTabId });
});
btnCapClear.addEventListener("click", () => {
  capTable.clear();
  capExpanded.clear();
  capStabilityFull = [];
  capDryrunEl.hidden = true;
  rtPort?.postMessage({ type: "capture-clear", tabId: inspectedTabId });
  scheduleCapRender();
});
capMinConfEl.addEventListener("change", () => {
  capMinConfidence = capMinConfEl.value === "medium" ? "medium" : "high";
  rtLog("info", `捕获门槛已切换为 ${capMinConfidence}（下次开始捕获时生效）`);
});
manualPanel = initManualPanel({
  tabId: inspectedTabId,
  getPort: () => rtPort,
  getScript: (id) => discoveredScripts.get(id),
  isRetired: (id) => retiredScriptIds.has(id),
  getMinConfidence: () => capMinConfidence,
  log: (level, message) => rtLog(level, message),
  onCapturesChanged: () => scheduleCapRender()
});
rtPort?.postMessage({ type: "capture-get-state", tabId: inspectedTabId });
function setCapNotice(text) {
  capNoticeEl.textContent = text;
  capNoticeEl.hidden = text === "";
}
function startRuntimeCapture() {
  if (rtStatus !== "connected") {
    setCapNotice("调试器尚未连接，无法开始捕获。请先点击“连接”；若连接失败，请查看上方日志中的具体错误。");
    return;
  }
  const astCache = /* @__PURE__ */ new Map();
  const targets = [];
  const unusable = [];
  for (const cand of allCandidates) {
    if (!passesConfidence(cand.confidence, capMinConfidence)) continue;
    const script = candidateScript.get(cand);
    if (!cand.name || !script || !script.source) {
      unusable.push((cand.name || "(anonymous)") + ": 缺少名称或脚本源码");
      continue;
    }
    let ast = astCache.get(script.scriptId);
    if (!ast) {
      try {
        ast = parseCode(script.source);
        astCache.set(script.scriptId, ast);
      } catch (e) {
        unusable.push(cand.name + ": 源码解析失败 " + (e?.message ?? e));
        continue;
      }
    }
    const plan = computeCapturePlan(script.source, cand.location.start, ast);
    targets.push({ scriptId: script.scriptId, scriptUrl: script.url, functionName: cand.name, plan });
  }
  if (targets.length === 0) {
    setCapNotice(`没有可捕获的候选解码函数（当前门槛：${capMinConfidence}）。` + (unusable.length ? "\n" + unusable.join("\n") : "请先让 Decoder Discovery 发现候选（连接后刷新页面），或把捕获门槛切换为 medium。"));
    return;
  }
  setCapNotice(unusable.length ? "未纳入捕获：\n" + unusable.join("\n") : "");
  rtLog("info", `开始运行时捕获：${targets.length} 个候选（门槛 ${capMinConfidence}）`);
  rtPort?.postMessage({ type: "capture-start", tabId: inspectedTabId, targets, autoCaptureMinConfidence: capMinConfidence });
}
function passesConfidence(conf, min) {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[conf] >= rank[min];
}
function handleCaptureEvent(e) {
  switch (e.kind) {
    case "capture":
      capTable.set(e.capture.key, e.capture);
      scheduleCapRender();
      break;
    case "log":
      rtLog(e.level, e.message);
      break;
    case "limit-reached":
      rtLog("warn", `捕获达到上限 (${e.limit})，已自动停止`);
      setCapNotice(`捕获达到上限 (${e.limit})，已自动停止并移除本插件的断点。可清空记录后重新开始。`);
      break;
    case "foreign-pause":
      rtLog("warn", "检测到非本插件触发的暂停（例如你自己的断点，或页面自带的 debugger 反调试语句）：已保留，不会自动恢复，请在 DevTools 中手动继续或点击“▶ 恢复”");
      break;
  }
}
function handleCaptureState(ev) {
  capTable.clear();
  for (const c of ev.captures) capTable.set(c.key, c);
  capStabilityFull = ev.stability ?? [];
  if (ev.autoCaptureMinConfidence) capMinConfidence = ev.autoCaptureMinConfidence === "medium" ? "medium" : "high";
  capIsActive = ev.active;
  manualPanel?.syncMode(ev.active);
  capStatusEl.textContent = ev.active ? "正在捕获" : "已停止";
  capStatusEl.className = "rt-value rt-badge " + (ev.active ? "enabled" : "running");
  capBpsEl.textContent = String(ev.breakpoints);
  capHitsEl.textContent = String(ev.stats?.hits ?? 0);
  capSuccessEl.textContent = String(ev.stats?.success ?? 0);
  capFailedEl.textContent = String(ev.stats?.failed ?? 0);
  capUnstableEl.textContent = String(capStabilityFull.filter((s) => !s.stable).length);
  btnCapStart.disabled = ev.active;
  btnCapStop.disabled = !ev.active;
  if (ev.skipped !== void 0 || ev.errors !== void 0) {
    const lines = [];
    for (const s of ev.skipped ?? []) lines.push(`跳过 ${s.functionName}: ${s.reason}`);
    for (const err of ev.errors ?? []) lines.push(`断点设置失败: ${err}`);
    if (ev.active && ev.breakpoints === 0) lines.push("没有成功设置任何断点，捕获不会产生数据。");
    setCapNotice(lines.join("\n"));
  }
  if (ev.resetReason) {
    rtLog("warn", `运行时捕获已重置: ${ev.resetReason}`);
    if (ev.resetReason.startsWith("page")) for (const id of discoveredScripts.keys()) retiredScriptIds.add(id);
    if (ev.resetReason.startsWith("page")) manualPanel?.onPageReset();
    if (ev.resetReason.startsWith("page")) analysisClient.cancelAll("页面已刷新，分析任务已取消");
    if (!ev.active) {
      setCapNotice("捕获已重置：" + ev.resetReason);
    }
    if (ev.resetReason.startsWith("page") && !ev.active) {
      discoveredScripts.clear();
      allCandidates.length = 0;
      updateDecoderStats();
      renderDecoderList();
    }
  }
  if (ev.active && capPollTimer === null) {
    capPollTimer = window.setInterval(() => {
      rtPort?.postMessage({ type: "capture-get-state", tabId: inspectedTabId });
    }, 1e3);
  } else if (!ev.active && capPollTimer !== null) {
    window.clearInterval(capPollTimer);
    capPollTimer = null;
  }
  scheduleCapRender();
}
function scheduleCapRender() {
  scheduleValidationStats();
  if (capRenderQueued) return;
  capRenderQueued = true;
  requestAnimationFrame(renderCaptureList);
}
function fmtVal(v) {
  if (!v) return "—";
  if (v.type === "undefined") return "undefined";
  if (v.type === "null") return "null";
  if (v.type === "string") return JSON.stringify(v.value) + (v.truncated ? " …(已截断)" : "");
  if (v.unserializable) return v.unserializable;
  if (v.value !== void 0) return String(v.value);
  return v.description ?? v.type;
}
function fmtPos(p) {
  return p.lineNumber < 0 ? "未知" : `${p.lineNumber + 1}:${p.columnNumber + 1}`;
}
function capRow(label, text) {
  const row = document.createElement("div");
  row.className = "decoder-info-row";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = text;
  row.appendChild(strong);
  row.appendChild(span);
  return row;
}
function appendValidationRows(body, g) {
  body.appendChild(capRow("验证状态:", `${VALIDATION_LABEL[g.status]}（${g.status}）`));
  for (const r of g.reasons) body.appendChild(capRow(g.status === "verified" ? "通过依据:" : "原因:", r.message));
  for (const w of g.warnings) body.appendChild(capRow("提示:", w.message));
  body.appendChild(capRow("验证次数:", `成功 ${g.observations} 次，失败 ${g.failedObservations} 次`));
  body.appendChild(capRow("参数样本:", "(" + g.arguments.map(fmtVal).join(", ") + ")"));
  body.appendChild(capRow("返回值样本:", g.returnSamples.map((s) => `${fmtVal(s.value)} ×${s.count}`).join(" | ") || "—"));
  body.appendChild(capRow("冲突:", g.conflict ? `是（${g.distinctReturns} 个不同返回值）` : "否"));
  const locs = g.callLocations.slice(0, 8).map(fmtPos).join(", ");
  body.appendChild(capRow("全部调用位置:", g.callLocations.length === 0 ? "未知" : locs + (g.callLocations.length > 8 ? ` …共 ${g.callLocations.length} 个` : "") + (g.callLocationsTruncated ? "（位置列表被截断，不是全部）" : "")));
}
btnCapDryrun.addEventListener("click", async () => {
  try {
    const scripts2 = currentValidationScripts();
    const report = validateCaptures(allCaptures(), scripts2, { captureActive: capIsActive });
    const r = await dryRunReplacements(report, scripts2);
    const lines = [`替换前检查（dry-run，只检查，不修改任何代码）：可替换候选 ${r.summary.candidates} 个调用点，拒绝 ${r.summary.rejections} 项`];
    for (const c of r.candidates.slice(0, 5)) lines.push(`  可替换 ${c.callText} → ${c.replacement}（${fmtPos(c.position)}，已观测 ${c.observations} 次）`);
    if (r.candidates.length > 5) lines.push(`  …还有 ${r.candidates.length - 5} 个候选`);
    for (const [code, n] of Object.entries(r.summary.byReason)) lines.push(`  拒绝 ${n} 项：${code}`);
    for (const rj of r.rejections.slice(0, 5)) lines.push(`  ${rj.functionName}${rj.position ? " " + fmtPos(rj.position) : ""}：${(rj.reasons[1] ?? rj.reasons[0])?.message ?? ""}`);
    if (r.candidates.some((c) => c.textKeyConflicts.length > 0)) lines.push("注意：部分候选存在同文本但没有证据支持的调用，后续替换必须按位置进行，不能按调用文本");
    capDryrunEl.textContent = lines.join("\n");
    capDryrunEl.style.whiteSpace = "pre-wrap";
    capDryrunEl.hidden = false;
  } catch (e) {
    capDryrunEl.textContent = `替换前检查出错：${e?.message ?? e}`;
    capDryrunEl.hidden = false;
  }
});
btnCapApply.addEventListener("click", async () => {
  if (!activeScript) {
    capApplyResultEl.textContent = "请先选择一个脚本";
    capApplyResultEl.hidden = false;
    return;
  }
  try {
    btnCapApply.disabled = true;
    btnCapApply.textContent = "⏳ 应用中...";
    capApplyResultEl.textContent = "正在执行验证和替换...";
    capApplyResultEl.hidden = false;
    const scripts2 = currentValidationScripts();
    const report = validateCaptures(allCaptures(), scripts2, { captureActive: capIsActive });
    const dryRunResult = await dryRunReplacements(report, scripts2);
    const resolvedScripts = scripts2.filter((s) => s.url === activeScript.url && s.source === activeScript.source);
    if (resolvedScripts.length !== 1) {
      capApplyResultEl.textContent = resolvedScripts.length === 0 ? "当前选中的脚本没有对应的运行时脚本（URL 与源码都相同的已发现脚本）：可能调试器未连接、页面已刷新，或脚本内容与运行时不一致。不做任何替换，请连接调试器并刷新页面后重试。" : `当前选中的脚本对应 ${resolvedScripts.length} 个运行时脚本（URL 与源码都相同），无法唯一确定，不做任何替换。`;
      capApplyResultEl.style.whiteSpace = "pre-wrap";
      capApplyResultEl.hidden = false;
      return;
    }
    activeScript.scriptId = resolvedScripts[0].scriptId;
    activeScript.startLine = resolvedScripts[0].startLine;
    activeScript.startColumn = resolvedScripts[0].startColumn;
    const scriptCandidates = dryRunResult.candidates.filter((c) => c.scriptId === activeScript.scriptId);
    const scriptRejections = dryRunResult.rejections.filter((r) => r.scriptId === activeScript.scriptId);
    if (scriptCandidates.length === 0) {
      const lines2 = [`当前脚本没有可替换的候选（${scriptRejections.length} 个被拒绝）`];
      if (scriptRejections.length > 0) {
        lines2.push("");
        lines2.push("拒绝原因：");
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const r of scriptRejections) {
          for (const reason of r.reasons) {
            reasonCounts.set(reason.code, (reasonCounts.get(reason.code) || 0) + 1);
          }
        }
        for (const [code, count] of reasonCounts.entries()) {
          lines2.push(`  ${code}: ${count} 项`);
        }
      }
      capApplyResultEl.textContent = lines2.join("\n");
      capApplyResultEl.style.whiteSpace = "pre-wrap";
      capApplyResultEl.hidden = false;
      return;
    }
    const validationScript = {
      scriptId: activeScript.scriptId,
      source: activeScript.source,
      url: activeScript.url,
      startLine: activeScript.startLine,
      startColumn: activeScript.startColumn
    };
    const result = await callSandbox("apply-verified", {
      dryRunResult,
      script: validationScript
    });
    activeScript.recovered = result.code;
    renderCodeWithLineNumbers(codeRecovered, result.code);
    statsRecovered.textContent = `${formatBytes(result.code.length)} | Phase 4 位置级替换`;
    btnCopyRecovered.disabled = false;
    const lines = [
      `✅ Phase 4 位置级替换完成`,
      ``,
      `替换数量: ${result.applied.length} / ${scriptCandidates.length}`,
      `拒绝数量: ${result.rejected.length}`,
      ``
    ];
    if (result.applied.length > 0) {
      lines.push("已替换：");
      for (const a of result.applied.slice(0, 10)) {
        lines.push(`  ${fmtPos(a.position)}: ${a.original} → ${a.replaced}`);
      }
      if (result.applied.length > 10) {
        lines.push(`  …还有 ${result.applied.length - 10} 处替换`);
      }
      lines.push("");
    }
    if (result.rejected.length > 0) {
      lines.push("拒绝原因：");
      const reasonCounts = /* @__PURE__ */ new Map();
      for (const r of result.rejected) {
        for (const reason of r.reasons) {
          reasonCounts.set(reason.code, (reasonCounts.get(reason.code) || 0) + 1);
        }
      }
      for (const [code, count] of reasonCounts.entries()) {
        lines.push(`  ${code}: ${count} 项`);
      }
      lines.push("");
      lines.push("被拒绝的调用（前5个）：");
      for (const r of result.rejected.slice(0, 5)) {
        const reason = r.reasons[0];
        lines.push(`  ${fmtPos(r.position)}: ${r.callText} — ${reason?.message || reason?.code}`);
      }
    }
    lines.push("");
    lines.push("注意：原始源码保持不变，替换结果仅用于查看和复制。");
    capApplyResultEl.textContent = lines.join("\n");
    capApplyResultEl.style.whiteSpace = "pre-wrap";
    capApplyResultEl.hidden = false;
    setStatus(`✅ Phase 4 替换完成 — ${result.applied.length} 处已替换`);
    saveScriptsToCache();
  } catch (e) {
    capApplyResultEl.textContent = `应用替换失败：${e?.message ?? e}`;
    capApplyResultEl.hidden = false;
    setStatus(`❌ Phase 4 替换失败: ${e?.message ?? e}`);
  } finally {
    btnCapApply.disabled = false;
    btnCapApply.textContent = "应用已验证替换";
  }
});
function renderCaptureList() {
  capRenderQueued = false;
  capListEl.textContent = "";
  const rows = allCaptures().sort((a, b) => b.timestamp - a.timestamp);
  const vByKey = /* @__PURE__ */ new Map();
  try {
    const report = runValidation();
    for (const g of report.groups) for (const k of g.captureKeys) vByKey.set(k, g);
  } catch (e) {
    if (!capValidationErrorLogged) {
      capValidationErrorLogged = true;
      rtLog("error", `结果验证出错：${e?.message ?? e}`);
    }
  }
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无捕获记录";
    capListEl.appendChild(empty);
    return;
  }
  const stab = /* @__PURE__ */ new Map();
  for (const s of capStabilityFull) {
    const k = [s.scriptId, s.functionLocation.lineNumber, s.functionLocation.columnNumber, s.functionName, JSON.stringify(s.arguments)].join("|");
    stab.set(k, { stable: s.stable, distinctReturnCount: s.distinctReturnCount });
  }
  for (const cap of rows.slice(0, CAP_RENDER_LIMIT)) {
    const ok = cap.captureStatus === "success";
    const sk = [cap.scriptId, cap.functionLocation.lineNumber, cap.functionLocation.columnNumber, cap.functionName, JSON.stringify(cap.arguments)].join("|");
    const st = stab.get(sk);
    const card = document.createElement("div");
    card.className = "decoder-card" + (capExpanded.has(cap.key) ? " open" : "");
    const header = document.createElement("div");
    header.className = "decoder-card-header";
    header.onclick = () => {
      card.classList.toggle("open");
      if (card.classList.contains("open")) capExpanded.add(cap.key);
      else capExpanded.delete(cap.key);
    };
    const left = document.createElement("div");
    left.className = "decoder-card-left";
    const name = document.createElement("span");
    name.className = "decoder-name";
    name.textContent = cap.functionName;
    const badge = document.createElement("span");
    badge.className = "decoder-badge " + (ok ? "high" : "cap-fail");
    badge.textContent = ok ? "成功" : "失败";
    const cnt = document.createElement("span");
    cnt.className = "decoder-badge cap-count";
    cnt.textContent = "×" + cap.count;
    const summary = document.createElement("span");
    summary.className = "cap-summary";
    summary.textContent = `(${cap.arguments.map(fmtVal).join(", ")}) → ${ok ? fmtVal(cap.returnValue) : "捕获失败"}`;
    const vg = vByKey.get(cap.key);
    left.append(name, badge, cnt);
    if (vg) {
      const vb = document.createElement("span");
      vb.className = "decoder-badge val-" + vg.status;
      vb.textContent = VALIDATION_LABEL[vg.status];
      vb.title = vg.reasons.map((r) => r.message).join("\n");
      left.appendChild(vb);
    }
    if (ok && st && !st.stable) {
      const ub = document.createElement("span");
      ub.className = "decoder-badge cap-unstable-badge";
      ub.textContent = `引擎:同参多值×${st.distinctReturnCount}`;
      ub.title = "Phase 3.1 引擎的原始统计，不是 Phase 3.2 验证状态";
      left.appendChild(ub);
    }
    left.appendChild(summary);
    const toggle = document.createElement("span");
    toggle.className = "decoder-toggle";
    toggle.textContent = "▶";
    header.append(left, toggle);
    const body = document.createElement("div");
    body.className = "decoder-card-body";
    cap.arguments.forEach((a, i) => body.appendChild(capRow(`参数[${i}]:`, `${a.type}  ${fmtVal(a)}`)));
    body.appendChild(capRow("返回值:", ok ? `${cap.returnValue?.type ?? ""}  ${fmtVal(cap.returnValue)}` : "—"));
    body.appendChild(capRow("状态:", ok ? "success" : "capture-failed"));
    if (cap.reason) body.appendChild(capRow("失败原因:", cap.reason));
    if (st && ok) {
      body.appendChild(capRow("引擎稳定性(3.1原始):", st.stable ? "stable（同参数始终同结果）" : `unstable（同参数出现 ${st.distinctReturnCount} 个不同结果，不可直接用于替换）`));
      const rec = capStabilityFull.find((s) => [s.scriptId, s.functionLocation.lineNumber, s.functionLocation.columnNumber, s.functionName, JSON.stringify(s.arguments)].join("|") === sk);
      if (rec && !rec.stable) body.appendChild(capRow("历史值:", rec.values.map(fmtVal).join(" | ")));
    }
    if (vg) appendValidationRows(body, vg);
    const shortUrl2 = cap.scriptUrl ? cap.scriptUrl.split("/").pop() || cap.scriptUrl : "(inline/eval)";
    body.appendChild(capRow("函数位置:", `${shortUrl2}:${fmtPos(cap.functionLocation)}  [scriptId ${cap.scriptId}]`));
    body.appendChild(capRow("调用位置:", `${shortUrl2}:${fmtPos(cap.callLocation)}`));
    body.appendChild(capRow("捕获次数:", String(cap.count)));
    if (cap.scriptUrl) {
      const btn = document.createElement("button");
      btn.className = "btn btn-sm";
      btn.textContent = "查看源码位置";
      btn.onclick = () => chrome.devtools.panels.openResource(cap.scriptUrl, cap.functionLocation.lineNumber + 1, () => {
      });
      body.appendChild(btn);
    }
    card.append(header, body);
    capListEl.appendChild(card);
  }
  if (rows.length > CAP_RENDER_LIMIT) {
    const more = document.createElement("div");
    more.className = "empty-state";
    more.textContent = `仅显示最近 ${CAP_RENDER_LIMIT} 条，共 ${rows.length} 条`;
    capListEl.appendChild(more);
  }
}
