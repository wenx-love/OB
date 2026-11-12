# Phase 4.7：面板主线程阻塞 — 代码审查与最小修改方案

本文件是**审查报告**，在动手修改之前先固定事实与方案。实施结果见 `docs/PHASE4.7-PANEL-PERFORMANCE-FIX.md`。

先备份：`C:/Users/Administrator/TEMP/opencode/ob-backup-p47-perf-20261110`。

---

## 一、调用链追踪

```
Debugger.scriptParsed（后台）
  → cdp.addEventListener（background.ts:219）
  → collector.addScript()（script-collector.ts:17，按 scriptId 去重）
  → cdp.getScriptSource() → collector.setScriptSource()（:46）
  → port.postMessage({ kind: 'script-discovered' })（background.ts:236）
      ↓ 面板
  → handleScriptDiscovered（panel.ts:1046 → :1188）
  → discoverDecoders(script.source, scriptId, url)（panel.ts:1209）   ← 阻塞点
      → parseCode（decoder-discovery.ts:125 → parser.ts:1）
      → collectFunctions / countCallsPerName / indexFunctionNodes
      → analyzeFunction × N（:133，内部多次 traverse）
      → collectCallSites × 候选数（:140，每个候选一次全量 traverse）
  → allCandidates.push / candidateScript.set（:1221-1223）
  → updateDecoderStats（:1234）→ DOM 文本
  → renderDecoderList（:1249）→ DOM 卡片
```

第二条同源路径：`refreshDecoderDiscovery`（panel.ts:1372）对 `discoveredScripts` 里**每个**脚本循环调用 `discoverDecoders`（:1376），同样是同步全量分析。

### 测量（离线诊断，本地合成 512 KB 脚本）

| 项 | 值 |
| --- | --- |
| 采样总量 | 30165 样本 / 160809 ms |
| `handleScriptDiscovered` inclusive | 145947 ms |
| `discoverDecoders` inclusive | **144277 ms** |
| `traverse2` / `traverseNode$1` / `visitQueue` | 144046 / 144014 / 143994 ms |
| self time 前列 | `get` 25537、`shouldVisit` 17959、`visitQueue` 13988 ms |
| 面板主线程最大间隔 | 150027 ms（另一次运行 150139 ms） |

结论：**144277 / 145947 ≈ 98.9%** 的阻塞时间在 `discoverDecoders` 内部，其余为 DOM 渲染与统计。

---

## 二、七个问题的回答

### 1. 哪些操作运行在面板主线程？

| 操作 | 位置 | 是否阻塞 |
| --- | --- | --- |
| `discoverDecoders`（**全部** AST 分析） | panel.ts:1209、1376 | **是，144277 ms** |
| `parseCode`（解析脚本源码） | panel.ts:1534（`startRuntimeCapture`） | 是，但按脚本缓存，76 ms 量级 |
| `computeCapturePlan`（含 `traverse`） | panel.ts:1541（`capture-plan.ts:35`） | 是，按候选执行 |
| `validateCaptures` → `analysisOf` → `parseCode` | capture-validation.ts:202 | 是，按脚本缓存（`analysisCache`） |
| `computeValidationStats` | validation-stats.ts | 是，轻量 |
| `renderDecoderList` / `updateDecoderStats` / `renderCaptureList` | panel.ts:1234/1249/1631 | 是，DOM，轻量 |
| `rtLog` | panel.ts | 是，DOM，写 `innerHTML` 拼接 |

### 2. 哪些操作可以迁移到 Web Worker？

**`discoverDecoders` 可以，而且是唯一需要迁移的。**

理由（逐项核对依赖）：

- `decoder-discovery.ts` 的 import 只有三行：`@babel/traverse`、`@babel/types`、`./parser.js`（`parser.ts` 只 import `@babel/parser`）。**没有任何 DOM、Chrome API、面板状态依赖。**
- 函数签名 `discoverDecoders(source, scriptId?, scriptUrl?) → DiscoveryResult`：**纯函数**，输入是字符串，输出是普通对象。
- 函数体内不读写全局状态，不用 `window` / `document` / `chrome` / `localStorage`。

`computeCapturePlan`（capture-plan.ts）同样无 DOM 依赖，也可以迁移，但它只在点击「开始捕获」时对已选候选执行，且本轮测量未显示它是阻塞源。**按最小修改原则，本轮不迁移它**，列入未解决问题。

`validateCaptures`（capture-validation.ts）注册在 `scheduleValidationStats` 的 150 ms 定时器里，且有 `analysisCache` 缓存。**本轮不迁移**，列入未解决问题。

### 3. Babel AST、候选结果和错误信息是否可以安全序列化？

**可以。** 逐字段核对 `DiscoveryResult`：

| 字段 | 类型 | 可结构化克隆 |
| --- | --- | --- |
| `scriptId` / `scriptUrl` | `string` / `undefined` | 是 |
| `functions: DiscoveredFunction[]` | `{name, kind, paramCount, paramNames, location}` | 是 |
| `candidates: CandidateDecoder[]` | 见下 | 是 |
| `analyzed` | `boolean` | 是 |
| `error` | `string?` | 是 |
| `location: SourceLoc` | 6 个 `number` | 是 |
| `evidence: string[]` / `dependencies: DependencyInfo[]` | 纯字符串 | 是 |
| `callSites: CallSiteInfo[]` | `{scriptId?, scriptUrl?, location, callText: string, args: ArgumentInfo[], parentNodeType: string}` | 是 |
| `args: ArgumentInfo[]` | `{nodeType: string, value?: string\|number\|boolean, isLiteral: boolean}` | 是 |
| `hasIndexOffset` / `hasStringArrayAccess` / `hasBase64` / `hasRC4` / `hasRotation` / `hasMultipleReturn` | `boolean` | 是 |
| `stringArrayName` | `string \| null` | 是 |
| `callCount` | `number` | 是 |

**关键结论：`DiscoveryResult` 里不保存任何 AST 节点、函数引用、Map 或循环引用**（`callText` 是从源码切出的字符串，`args` 只保留字面量值，`nodeType` 只是类型名字符串）。因此结构化克隆不会丢信息。

**AST 本身不需要跨线程传输**：Worker 内部自己 `parseCode`，只回传结果对象。这是本方案能保持"零语义变化"的根本原因。

一个必须注意的点：`panel.ts:37` 的 `candidateScript = new WeakMap<CandidateDecoder, DiscoveredScript>()` 以**候选对象身份**为键。跨线程后候选是新对象，但 `candidateScript.set(cand, script)` 本来就在面板收到结果之后执行（:1223），身份在面板侧建立，因此不受影响。

### 4. 是否存在依赖 DOM、Chrome API 或面板状态的分析逻辑？

**分析本身没有。** 依赖只存在于调用方，且这些依赖**必须留在面板侧**：

| 面板状态 | 位置 | 是否属于分析 |
| --- | --- | --- |
| `discoveredScripts` / `retiredScriptIds` | :34 / :1426 | 否，面板生命周期 |
| `allCandidates` / `candidateScript` | :36 / :37 | 否，面板 UI 状态 |
| `rtLog` / `updateDecoderStats` / `renderDecoderList` | :1192 / :1234 / :1249 | 否，DOM |
| `scheduleValidationStats` | :1191 | 否，面板统计 |
| `chrome.devtools` / `rtPort` | :954 / :955 | 否，扩展 API |

**因此迁移边界很干净：只把 `discoverDecoders` 一个调用挪出去，其余全部保持在面板主线程。**

### 5. 多个脚本同时到达时，当前是否存在任务队列或重复分析？

**没有队列，也没有分析级去重。** 现状：

- `handleScriptDiscovered` 每收到一个 `script-discovered` 事件就**同步**跑一次分析。事件是异步到达的，所以多个脚本表现为**串行阻塞**：面板被第一个脚本占满，后续事件在事件队列里排队，面板一直不可交互。
- 去重**只存在于后台**：`ScriptCollector.addScript` 按 `scriptId` 去重（script-collector.ts:18），所以同一 scriptId 不会重复发事件。面板侧**没有**任何去重。
- `sourceHashMap`（script-collector.ts:12）记录了相同源码的多个 scriptId，但**不做跳过**（:53-58 注释明确写"当前实现：保留两者"）。因此同源码不同 scriptId 会被分析两次。
- 并发上限：**不存在**（没有并发概念，全同步）。

### 6. 如何保证迁移前后输出完全一致？

三层保证：

1. **同一份实现**。Worker 直接 `import { discoverDecoders } from '../../core/decoder-discovery.js'`，不是重写、不是拷贝。识别规则、遍历顺序、候选顺序、`confidence`、`evidence`、`callSites` 顺序、错误语义全部来自同一函数。
2. **同一份输入**。Worker 收到 `(source, scriptId, scriptUrl)` 三个参数原样传入，不裁剪、不截断、不改写。**不减少分析范围**。
3. **可验证的一致性断言**（测试实施）：
   - `structuredClone(result)` 与 `result` 深比较相等（证明跨线程边界无损）；
   - 对同一源码，直接调用与经 Worker 调用得到的结果 `JSON.stringify` 完全相同；
   - 大脚本（归档 hpailist-2，256820 字节）一致性用例；
   - 浏览器内对照：修复前 512 KB 合成脚本的面板日志是"分析完成: **0** 个候选解码器"，修复后必须仍是 **0**。

### 7. Worker 失败、超时、取消和面板关闭时如何处理？

设计（全部为**显式失败**，绝不伪装成功）：

| 情况 | 处理 |
| --- | --- |
| Worker 抛异常 | Worker 内 `try/catch` → 回报 `{type:'failure', error}`；面板把 `script.analyzed` 保持为 false，写入 `script.analysisError`，`rtLog('error', ...)` |
| Worker 脚本自身加载失败 | `worker.onerror` → 拒绝该任务与队列中所有任务，**不标记 analyzed** |
| `discoverDecoders` 返回 `analyzed:false`（源码解析失败） | 这是**合法**的分析失败，原样透传 `result`（含 `error`），面板行为与现在完全一致 |
| 超时 | 超时是**挂死检测**，不是性能上限。默认阈值取足够大（远大于实测 145 s），触发时 terminate + 重建 Worker，拒绝该任务，**不标记 analyzed** |
| 取消（页面刷新/重置） | `cancelAll(reason)` → terminate，拒绝在飞行与排队任务，清空去重缓存；面板照旧走 `retiredScriptIds` / `discoveredScripts.clear()` 逻辑 |
| 面板关闭 | `dispose()` → terminate，拒绝全部；面板 `unload` 时调用 |
| 陈旧结果 | 结果回来时校验 `discoveredScripts.get(scriptId) === script`，否则丢弃，避免页面刷新后把旧结果合并进新状态 |
| 队列积压 | 队列长度有上限；**超限不静默丢弃，而是以显式错误失败**（写入 `analysisError`，面板可见），满足"不出现无界任务积压"且"不伪装成功" |

---

## 三、最小修改方案

### 边界

- **只迁移 `discoverDecoders` 一个调用**。不改 `decoder-discovery.ts`、`parser.ts`、`capture-validation.ts`、`capture-plan.ts` 的任何一行。
- 不改任何识别规则、捕获状态机、验证规则、拒绝规则、替换规则。
- 面板侧的记账、统计、渲染逻辑全部保持在原位。

### 新增文件

| 文件 | 职责 |
| --- | --- |
| `src/extension/workers/decoder-analysis.worker.ts` | Worker 端：收 `{id, source, scriptId, scriptUrl}`，调同一个 `discoverDecoders`，回 `{type:'result'}` 或 `{type:'failure'}` |
| `src/extension/devtools/decoder-analysis-client.ts` | 面板端客户端：Worker 生命周期、串行队列（并发 1）、按 scriptId 去重、超时、取消、失败回报、队列上限 |

### 修改文件

| 文件 | 修改 | 理由 |
| --- | --- | --- |
| `src/extension/devtools/panel.ts` | `handleScriptDiscovered` 与 `refreshDecoderDiscovery` 改为经客户端异步取结果；同步记账/DOM 代码不变 | 消除唯一被测量的阻塞点 |
| `vite.config.ts` | 增加 `worker: { format: 'es' }` 与 worker 产物命名 | Worker 需要独立 chunk |
| `test/p47-l1-run-order.test.ts` | 不受影响（只断言 L1 运行器） | — |

### 不改

`manifest.json`（MV3 扩展页可创建同源 Worker，无需 `web_accessible_resources`）、`panel.html`、四个入口的其余部分、所有 `src/core/*`。

### 并发与去重策略

- **并发 1**：一次只跑一个分析。面板始终可交互，代价是大脚本的墙钟时间不变。
- **按 scriptId 去重**：同一 scriptId 的结果复用，不再重复分析（满足要求 6）。
- **刷新按钮**：显式 `force`，绕过缓存重新分析，但仍走同一队列，面板不阻塞。
- **队列上限**：超出后新任务**显式失败**，不丢队列、不伪装成功。

---

## 四、验证计划

1. 原有全部 Vitest。
2. `tsc` 与基线 `tsc-1.txt` 对比。
3. `vite build`。
4. 小脚本一致性测试（直接调用 vs 经 Worker）。
5. 大脚本一致性测试（归档 hpailist-2 + 512 KB 合成脚本结构化克隆往返）。
6. 多脚本并发到达测试。
7. 重复脚本事件测试（同 scriptId 不重复分析）。
8. Worker 失败与恢复测试。
9. 面板关闭/任务取消测试。
10. 主线程响应性测试：**真机离线**（本地页面 + 真实扩展，不访问 17qcc.com）跑 512 KB 脚本，采样面板 `Runtime.evaluate` 延时。

保留原 512 KB 合成脚本作为固定输入（`test/fixtures/p47-512kb-synthetic.js`，sha256 必须等于 `6a419264c85865c134c88ed52239eefd527fb2cbcb74ceb9af501d8e106ce207`），用于修复前后对照。

---

## 五、审查结论

**Worker 迁移可行，且是本问题的正解。**

- 阻塞点单一且已被 CPU 采样定位（`discoverDecoders`，占 98.9%）。
- 被迁移的函数是纯函数，依赖零 DOM / 零 Chrome API。
- 返回值是可结构化克隆的纯数据，无 AST 引用、无循环引用。
- 迁移不需要改动任何分析语义代码，一致性可用"同一实现 + 同一输入 + 深比较"证明。

不需要退回替代方案。
