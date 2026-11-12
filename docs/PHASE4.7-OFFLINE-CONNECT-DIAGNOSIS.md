# Phase 4.7：L1 连接故障离线诊断与运行器修正

本轮范围：**零预算离线诊断**（本地受控页面 + 真实扩展，不访问 17qcc.com）+ **运行器修正**（B1/B2/B3/B4）。
本轮未执行真实 L1，未点击真实下一页，未登录，未获取任何凭据。L1 仍为 `blocked`。

---

## 一、结论摘要

| 问题 | 结论 |
| --- | --- |
| nextpage2 连接超时的根因 | **部分证实**：超时读数来自**面板主线程阻塞**，不是 Service Worker 无响应、不是消息通道失败、不是 CDP attach 失败。 |
| 是否在离线环境复现 nextpage2 特征 | **是，1 次（B run4）**，且在加了面板无关探针后（run5）被解释为面板侧阻塞，不是后台故障。 |
| 大脚本与超时是否存在可重复关联 | **是，可重复**：约 500 KB 合成脚本使面板主线程同步阻塞约 **150 秒**，run2 与 run3 两次一致。 |
| L1 目标站（hpailist-2 / combo?font）的根因 | **unknown**：未对 L1 的脚本做面板侧 CPU 采样，不得外推。 |
| 是否对产品代码做了改动 | **没有**。`src/` 未改动，`dist/` 四个入口与开工前备份逐字节一致。 |

---

## 二、阶段 A：离线诊断装置

运行器：`scripts/p47-offline-connect-diag.ts`（本轮新增，仅本地使用）。

隔离措施：Chrome 以 `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` 启动，**除 127.0.0.1 外任何主机都无法解析**，结构上不可能访问目标站。页面由本机 HTTP 服务（8783）提供，CDP 端口 9473，有窗口模式（与 nextpage1/nextpage2 一致）。无重试、连接按钮只点一次、所有等待有上限、输出文件独占创建、绝不覆盖。

采集的诊断信息（逐层分离，避免只得到 read-timeout）：

1. Service Worker 目标生命周期（`Target.targetCreated/Destroyed/InfoChanged`）。
2. 面板连接按钮：点击时间、`Runtime.evaluate` 结果与异常。
3. 消息发送与响应：面板到后台的 `ping` 往返时延。
4. CDP attach 状态：`chrome.debugger.getTargets()` 的 attached 列表。
5. `Runtime.evaluate` 执行时间与超时。
6. discovery 执行时间与结果（面板 `dec-*` 读数）。
7. 面板主线程阻塞：页面内 100 ms 定时器滞后监测。
8. 脚本源码获取耗时。
9. 分析耗时：面板侧 CPU 采样（5 ms）+ 纯 Node 侧生产代码计时。

### 场景结果

| 场景 | 内容 | 结果 |
| --- | --- | --- |
| **A** | 最小 HTML + 小脚本（212 字节） | **成功**。连接在点击后 **501 ms** 成功；213 轮探针中 `panel`/`sw`/`ping` 全部成功，最慢 7 ms；面板最大卡顿 95 ms；无异常、无控制台输出。 |
| **B** | 最小 HTML + 本地生成约 500 KB、含真实语法的脚本（512064 字节，6875 个 `function`） | **成功连接，但面板被长时间阻塞**（见第四节）。 |
| **C** | 归档的 `combo?font` 脚本 | **不可用**。仓库内唯一候选文件 `test/fixtures/qcc-combo.js` 是 159 字节的 `403 Forbidden` HTML 页面（sha256 `eaa8865a…`），不含任何 JavaScript，全仓库无引用；不得为取该脚本再次访问原站。记录于 `p47-offline-connect-diag-C-run1.json`。 |

**A 场景的额外发现（与连接故障无关，但影响后续运行器闸门）**：面板 `#script-list` 只由 `chrome.devtools.network.onRequestFinished`（`panel.ts:145-157`）与缓存填充，调试器的 `script-discovered` 事件不会往里加条目。场景 A 在页面加载完成 6 秒后才打开 DevTools，因此该列表 60 秒内始终为 0 条，而后台脚本收集器有 224 条。**结论：`waitForScripts` 依赖"导航发生在 DevTools 打开之后"**——这正是 B2 改动（先开 DevTools 的空白页、再导航一次）的必要性所在。

---

## 三、首次异常出现的阶段（逐次）

### B run1：装置缺陷，非连接故障

`p47-offline-connect-diag-B-run1.json` 只有 1390 字节，`steps` 为空数组，最后写入时间与开始时间相同。它停在**启动浏览器之前**的"纯 Node 分析计时"步骤（生产 `parseCode` + `discoverDecoders` 对 512 KB 脚本），该步是同步的、在看门狗建立之前，因此看门狗未能触发，运行被外部 420 秒超时截断。

处理：**run1 原样归档，不覆盖**，作为装置缺陷记录；后续以 `NODE_TIMING=0` 重跑并以新编号保存。

### B run2：面板主线程阻塞 150 秒

- 点击后 **5626 ms** 报 connected（`swStatus` 走面板路径，此时尚未阻塞）。
- 面板主线程出现**一次连续 150139 ms 卡顿**，约在点击后 80 ms 开始。
- 点击后 41 轮探针：`panel`/`ping`/`panelState` 各 **26 次超时**；`page`/`devtools`/`sw`/`swStatus` **41/41 成功**，最慢 6 ms。
- 面板日志的"发现脚本""分析完成"几乎全部在卡顿结束后才出现。
- 无异常、无控制台输出。

### B run3：CPU 采样直接定位到阻塞函数

| 项 | 值 |
| --- | --- |
| 采样 | 30165 个样本 / 160809 ms |
| `handleScriptDiscovered`（`panel.js:2076`） | **145947 ms** |
| `discoverDecoders` | **144277 ms** |
| `traverse2` / `traverseNode$1` / `visitQueue`（Babel） | 144046 / 144014 / 143994 ms |
| self time top | `get` 25537 ms、`shouldVisit` 17959 ms、`visitQueue` 13988 ms |
| 面板主线程最大间隔 | **150027 ms**（run2：150139 ms，两次一致） |
| 页面内定时器 | 149 ticks / 165004 ms，仅 1 次超 500 ms |

**证实**：面板在一个 `script-discovered` 事件的处理函数里**同步**跑 Babel 遍历，占住主线程约 150 秒。这是本项目内首次对该阻塞的直接测量。

### B run4：nextpage2 特征首次复现（`LAZY_TABID=1`）

`reproduced=true`、`everConnected=false`、`swStatus` 8 次全部 read-timeout。但：

- 同一时间窗 `page`/`devtools`/`sw` 全部成功，最慢 5 ms；
- `swStatus` 要先经面板读 `chrome.devtools.inspectedWindow.tabId`（**这与 L1 运行器 `getSw()` 的顺序相同**），面板阻塞时它就跟着超时；
- run4 没有任何不经面板的读取路径，因此**"service worker 未连接"这一说法当时并不成立**。

### B run5：把"面板阻塞"与"后台无响应"分开（决定性）

新增 `swDirect` 探针：在 Service Worker 内用 `chrome.debugger.getTargets()` 自己找到本地页面的真实 `tabId`，再读扩展状态，**完全不经面板**。

| 探针 | 点击后 45 轮结果 |
| --- | --- |
| `swDirect`（面板无关） | **45/45 成功**，自 t=16260 起持续报 `connected tabId=2013068072`，最慢 4 ms |
| `panel` / `swStatus` / `ping` / `panelState` | 各 **25 次超时**（3003–5016 ms） |
| `page` / `devtools` / `sw` | 45/45 成功，最慢 5 ms |
| `everConnectedDirect` | **true** |
| `waitConnect` | 点击后 **5596 ms** connected |

两条曲线（`swStatus` 与 `panel`）**完全重合**：它们超时/恢复的时刻一致。这证明超时读数由面板侧阻塞决定，与后台状态无关。

---

## 四、大脚本与超时的关联（可重复性）

| 运行 | 脚本 | 面板最大卡顿 | 面板超时数 | SW 侧是否 connected |
| --- | --- | --- | --- | --- |
| A run1 | 212 字节 | 95 ms | 0 | 是 |
| B run2 | 512064 字节 | 150139 ms | 26 | 是 |
| B run3 | 512064 字节 | 150027 ms | 26 | 是 |
| B run5 | 512064 字节 | （同期）| 25 | 是（`swDirect` 直接读到） |

**可重复**：两次独立运行给出几乎相同的卡顿时长（150.1 s / 150.0 s）和相同的失败探针集合。关联成立的对象是**本项目面板的同步分析路径**，不是 Service Worker。

**参照（纯 Node，非浏览器时间）**：对归档的 hpailist-2（255977 字符）执行生产 `discoverDecoders` 需 **28081 ms**（解析仅 76 ms）；对场景 B 合成脚本则超过 6 分钟未完成（run1 观察）。两者都远大于一次探针超时。

---

## 五、根因判定

### 已证实（有直接测量）

1. 面板在 `handleScriptDiscovered` → `discoverDecoders` → Babel `traverse` 中**同步**占用主线程，500 KB 脚本约 150 秒。
2. 面板阻塞期间，**任何经面板的读取都会超时**，包括 `Runtime.evaluate`、面板 `ping`、以及"经面板读 `tabId` 再读后台状态"这条链。
3. **不经面板**的读取（Service Worker 自身的 `getTargets` + `getStatus`）在同期**全部成功**，且报告 connected。
4. Service Worker、消息通道、CDP attach、页面主线程在上述场景中**均正常**。

### 尚未证实（标记 unknown）

1. **L1 目标站的根因仍是 unknown。** nextpage2 的 8 次 read-timeout 与本节现象相容，但 L1 三轮**从未做过面板侧测量**，且 nextpage2 加载的是登录页（脚本集合与症状可能不同）。不得把本地合成脚本的结论外推为 L1 的根因。
2. **nextpage2 是否真的连上了，无法判定。** run4 表明"经面板读不到"不等于"没连上"；nextpage2 没有面板无关探针，当时的实际连接状态已不可恢复。
3. **"大脚本导致超时"在原始症状层面不成立。** nextpage2 的页面是登录页，不含 hpailist-2；`combo?font` 包仍在，但把超时归因于它仅有猜测价值。
4. 场景 A/B 各只覆盖一轮主路径，run4/run5 只各一次；观测到的 150 秒时长与 512 KB 合成脚本绑定，**未验证其随脚本大小的增长曲线**。

---

## 六、阶段 B：运行器修正

文件：`scripts/p47-l1-ob-run.ts`（原 656 行 → 现 769 行）。**未改动 `src/` 任何文件。**

### B1 目标页面身份检查

- 新增 `TARGET_HOST = 'hangzhou.qccqcc.com'`、`TARGET_PATH = '/list.html'`、`LOGIN_PATH_MARKER = '/login'`。
- 新增步骤 `targetDocumentIdentity`，现在是**第一步**（在 `connect`、`waitForScripts`、`startCapture`、点击之前）。
- 核对 `hostname`、`pathname`、`title`，并把 `loadNavigation` 一并写入输出。
- 不匹配 → `throw new Gate('unexpected-document', …)`，**立即终止**：不连接扩展、不等待脚本、不启动捕获、不点击。
- `/login` 开头或 `login.html` → 专用停止原因，明示"从不登录、从不使用任何凭据"。
- 等待循环也在地址已明确指向别处时提前退出，避免在错误页面上多等 60 秒。

### B2 完整重定向记录

- 顺序改为：`Target.createTarget("about:blank")` → attach → `Page.enable` + `Network.enable` → 订阅事件 → **一次** `Page.navigate(TARGET)`。
- 新增 `loadNavigation`：`frameNavigated` 序列（含 `loaderId`）、`navigatedWithinDocument`、`loadEventFired`、`redirectChain`、`redirected`、`finalDocumentUrl`。
- 新增 `loadNetwork`：自 `Network.enable` 起的所有请求，含 `redirectStatus`。记录**仅**方法、主机、路径、状态码、时序。
- 明确**不记录** Cookie、请求头、请求体、GuestId 或任何敏感参数（测试断言 `getCookies` / `postData` / `Network.getResponseBody` / `*Headers` 均不存在）。
- 仍然只有一次导航：无 `Page.reload`，无第二次 `Page.navigate`。

### B3 连接失败诊断

- 新增 `SW_DIRECT_STATUS` 与 `swStatusDirect()`：面板无关的状态读取（`chrome.debugger.getTargets` 找真实 `tabId`）。
- connect 循环**同时**记录两条曲线：`throughPanel` 与 `panelFree`。
- 新增停止原因 `connect-timeout-panel-blocked`：当**所有经面板的读取都超时、而面板无关读取报 connected** 时使用——这正是本轮离线诊断测到的形态。
- `connectDiagnostics` 扩展为：`trace`（两条曲线）、`panelFreeStatus`、`panel`、`lastPanelStatusRead`、`stageReached`、`connectButton`。
- `discovery` 失败不再吞掉：保存 `discoveryDiagnostics`，超时用 `discovery-failed-panel-blocked`，其余用 `discovery-failed`，均在写明面板无关状态后中止。
- 点击前的 `cdp-connected` 闸门接受任一读取报 connected，并分别记录两条读数。
- 新增 `out.loadNetwork`；输出文件名改为 `raw-run.nextpage3.json`，运行号 `nextpage3`。

### B4 台账

`budget-ledger.json` 的 `plannedNextRun` 已更新为 `nextpage3`（planned, not executed），并新增 `previousRun` 记录 nextpage2 为 **attempted-aborted**（附实际停止原因）。

**预算口径未变**：`budget = 100`、`used = 17`、`remaining = 83`、`unit = "page navigation (original counting rule, unchanged)"`。历史条目一条未改；`nextpage2` 的 1 单位消耗保持原样。仅补记其被动 HTTP 计数（25 请求的下限值）。

---

## 七、测试与构建

| 项 | 结果 |
| --- | --- |
| Vitest（全量） | **52 文件 / 581 passed / 3 skipped / 0 failed** |
| 其中 `test/p47-l1-run-order.test.ts` | 25 条结构断言全部通过（原 20 条，新增/改写 B1、B2、B3、B4 与导航顺序共 5 条） |
| `tsc --noEmit` 对照基线 `tsc-1.txt` | 新增 24 条，**全部**为缺 `@types/node` 一类（`process` / `Buffer` / `node:*` / `file://` 动态导入的 TS2307），**无产品代码新错误** |
| `vite build` | exit 0，`✓ built in 2.33s` |

`tsc` 的 24 条分布：`scripts/p47-l1-ob-run.ts` 2、`scripts/p47-offline-connect-diag.ts` 21、`test/p47-l1-run-order.test.ts` 1。与基线的差异仅行号，故用 `tscdiff.cjs` 忽略行号比对。

---

## 八、dist 部署一致性

| 文件 | SHA-256 | 与开工前备份 |
| --- | --- | --- |
| `background.js` | `fa3ba6a45d02f8440d5d9f54708341e36429b13b695afb473433da39c1836509` | 一致 |
| `devtools.js` | `870b0b747d5bfbe54af0fe8d81581f27bac8eb2a4ecea433f78f295c18edae65` | 一致 |
| `panel.js` | `9cbc65a3bf78195d36bea0ea029df92c74c77ecd2a78ce4a8cc12fb68282fb73` | **逐字节一致**（112013 字节） |
| `sandbox.js` | `2df0c21289c5f8bfc6419f54d24e2fb2f99f9e4245acd71d6c4c52e7016f2be4` | 一致 |

`dist/background.js` 仍含 `getBreakpointsByScript`（运行器守卫所需）。`src/` 本轮无改动；`src/extension/background.ts` 与 `src/extension/debugger/capture-engine.ts` 的修改时间（19:30）早于本轮（21:0x 起），属上一轮已批准的只读观测改动。

---

## 九、证据完整性（本轮全程未变）

| 文件 | SHA-256 | 字节 |
| --- | --- | --- |
| `raw-run.json` | `a71e7a59a80b5e4fe75d392fff823ce07c1c3bd9500abe71a04cfcb888426599` | 2410974 |
| `raw-run.clean1.json` | `f6c0ae9973ee3a97ed6995d1ef35c24de15b196bd9237f233d7e445920d7398b` | 1368021 |
| `raw-run.nextpage1.json` | `5b02d3426063b979caa68e8981dfe50fff01c4c24404efd1b804b943315eae9e` | 5937 |
| `raw-run.nextpage2.json` | `f4ac025fc3373a3fa3fda347bba2f1fff4f3711972dc6bf6fc4219a1cde3c3da` | 6938 |

`registry.json` 与开工前备份**逐字节一致**，L1 仍为 `status: "blocked"`。

---

## 十、本轮产物

| 文件 | 说明 |
| --- | --- |
| `scripts/p47-offline-connect-diag.ts` | 离线诊断运行器（新增，仅本地） |
| `test/acceptance/p47-offline-connect-diag-A-run1.json` | 场景 A 输出 |
| `test/acceptance/p47-offline-connect-diag-B-run1.json` | 场景 B 装置缺陷记录（保留，不覆盖） |
| `test/acceptance/p47-offline-connect-diag-B-run2.json` | 面板阻塞 150139 ms |
| `test/acceptance/p47-offline-connect-diag-B-run3.json` | 面板 CPU 采样，定位到 `discoverDecoders` |
| `test/acceptance/p47-offline-connect-diag-B-run4.json` | nextpage2 特征首次复现（经面板路径） |
| `test/acceptance/p47-offline-connect-diag-B-run5.json` | 面板无关探针，区分面板阻塞与后台无响应 |
| `test/acceptance/p47-offline-connect-diag-C-run1.json` | 场景 C 不可用记录 |

---

## 十一、未解决问题

1. **L1 根因 unknown**：未对 hpailist-2 与 `combo?font` 做面板侧 CPU 采样，不得外推本地合成脚本的结论。
2. **nextpage2 的实际连接状态不可恢复**：当时没有面板无关探针。
3. **面板 150 秒阻塞本身未修**：`handleScriptDiscovered` 仍在面板主线程同步分析。本轮禁止修改运行时捕获语义与解码器发现规则，故只观测、只加运行器侧探针。是否修复需另行批准。
4. **场景 C 缺失**：仓库无合法归档的 `combo?font` 脚本，场景 C 只留不可用记录。
5. **`waitForScripts` 的依赖被澄清但未改**：脚本列表依赖"DevTools 打开后的网络事件"，B2 的导航顺序正好满足，但该闸门本身仍以面板列表为准。
6. **B run4 与 run5 各一次**：复现与否的差异已被解释，但样本量为 1，未做重复性验证。
7. **未验证**：修正后的运行器（`raw-run.nextpage3.json` 路径）**一次都没有运行过**。B1/B2/B3 的改动只有结构断言覆盖，没有真机证据。

---

## 十二、停止位置

本轮到此结束：离线诊断完成，运行器修正完成，测试与构建通过，dist 一致性核对通过，台账已更新。

**未执行且不自行执行**：真实 L1 运行、真实下一页点击、登录、方案 A/B、Phase 5。等待批准。
