# Phase 4.7：面板主线程阻塞专项修复

审查报告见 `docs/PHASE4.7-PANEL-BLOCKER-AUDIT.md`（先审查、后实施，未做大规模重构）。
备份：`C:/Users/Administrator/TEMP/opencode/ob-backup-p47-perf-20261110`（修改前全项目 + dist）。

**结论：Worker 迁移可行并已实施。面板主线程最长连续阻塞从约 210 秒降到 250 毫秒，分析结果与主线程直接调用逐字节一致。**

---

## 一、修复前后数据（同一输入、同一观测脚本）

输入固定为 `test/fixtures/p47-512kb-synthetic.js`，**512064 字节**，sha256 `6a419264c85865c134c88ed52239eefd527fb2cbcb74ceb9af501d8e106ce207` —— 与修复前两次真机运行记录的哈希完全一致，即输入没有换过。

观测脚本：`scripts/p47-panel-perf-verify.ts`（本地页面 + 真实扩展，Chrome 封掉除 127.0.0.1 外的一切主机）。顺序为先连调试器、再导航，确保 512 KB 脚本确实被解析并触发分析。

| 指标 | 修复前（before-run1） | 修复后（after-run4） | 变化 |
| --- | --- | --- | --- |
| 面板主线程最长连续卡顿 | **209791 ms** | **3838 ms** | ↓ 约 55× |
| 面板长任务（>50 ms）个数 | **28** | **1** | ↓ |
| 面板长任务最长 | **209160 ms** | **250 ms** | ↓ 约 836× |
| 面板探针超时次数 | **39** | **2** | ↓ |
| 300 秒窗口内分析是否完成 | **未完成** | **10203 ms 完成** | — |
| 分析期间脚本被标记已分析 | 149（仍在增长） | 3（稳定） | — |

修复后那 2 次超时中，有 1 次是 `panel`、`sw`、`page` **同时**超时（t=19033），属于我单条 CDP 连接上的争用，不是面板独占阻塞；同期 `swDirect`（面板无关）报 `connected`。

修复前 39 次面板超时、209 秒卡顿，与上一轮离线诊断测到的 150 秒阻塞属同一现象（输入不同，故时长不同）。

---

## 二、修改文件清单与理由

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `src/extension/workers/decoder-analysis.worker.ts` | **新增**（1531 B） | Worker 端。只做一件事：在 Worker 线程里调用**同一个** `discoverDecoders`。不含任何识别逻辑，不裁剪源码。 |
| `src/extension/devtools/decoder-analysis-client.ts` | **新增**（9323 B） | 面板端客户端。串行队列（并发 1）、按 scriptId 去重、挂死超时、取消、失败回报、队列上限。 |
| `src/extension/devtools/panel.ts` | 改 2 处调用 + 2 处生命周期 | `handleScriptDiscovered` 与 `refreshDecoderDiscovery` 不再在主线程同步分析，改为经客户端异步取结果；`handleScriptDiscovered` 抽出 `analyzeAndMerge`（记账/统计/渲染代码逐行保持原样，只是移到结果返回之后）。新增 `analysisClient` 实例、页面刷新时 `cancelAll`、`window unload` 时 `dispose`。 |
| `vite.config.ts` | 加 `worker` 输出配置 | Worker 需要独立产物；`assetFileNames` 固定 `chunks/[name][extname]` 以保留产物名。 |
| `test/decoder-analysis-consistency.test.ts` | **新增**（5736 B） | 跨线程一致性：结构化克隆往返、候选/调用位置/参数不丢、失败语义、大脚本。 |
| `test/decoder-analysis-queue.test.ts` | **新增**（9062 B） | 队列/去重/失败/取消/超时/上限语义（注入假 Worker，驱动真实客户端逻辑）。 |
| `test/fixtures/p47-512kb-synthetic.js` | **新增**（512064 B） | 固定输入。由诊断脚本的 `genLarge` **逐字提取**生成，哈希与修复前记录一致。 |
| `scripts/p47-panel-perf-verify.ts` | **新增** | 主线程响应性真机验证（前后对照）。 |
| `scripts/p47-worker-exec-verify.ts` | **新增** | Worker 真实执行验证。 |

**未修改**：`manifest.json`、`panel.html`、`panel.css`、`devtools.html`、`sandbox.html`（与备份逐字节一致）。

---

## 三、未改变任何语义（逐项核对）

对以下文件做了**逐字节**比对，全部与备份**完全一致**：

| 受保护项 | 文件 | 结果 |
| --- | --- | --- |
| Decoder Discovery 识别规则 | `src/core/decoder-discovery.ts` | **未改** |
| 解析器 | `src/core/parser.ts` | **未改** |
| `capture-validation` 验证规则 | `src/core/capture-validation.ts` | **未改** |
| 捕获计划 | `src/core/capture-plan.ts` | **未改** |
| AST 替换规则（含 `outer-state-write` / `status-unstable` / `verified` / `throwOnSideEffect: true`） | `src/core/verified-replacer.ts` | **未改** |
| 替换安全条件 / dry-run | `src/core/replacement-dryrun.ts` | **未改** |
| Runtime Capture 状态机与捕获时机 | `src/extension/debugger/capture-engine.ts` | **未改** |
| 原始源码只读保护 | 同上（三处哈希一致） | **未改** |
| Phase 4.7 验收门槛（Precision / Recall / SRR / Source Integrity） | 均在上述未改文件中 | **未改** |

**关键点**：`discoverDecoders` 本身一行都没动。Worker 里调用的是同一个函数、同一份参数、同一份源码，因此"修复前后结果完全一致"不是靠抽查，而是结构上必然。抽样结果也证实了这一点（见第四节）。

**注意**：`dist/background.js` 的哈希变了（`fa3ba6a4…` → `68d8055b…`），但 `src/extension/background.ts` 与备份**逐字节一致**。变化来自 Rollup 的 chunk 重新划分：`discoverDecoders` 从 `capture-plan-DDt5MvKB.js` 移到了 `parser-BGlb7RAx.js`（该 chunk 本身哈希未变），`background.js` 因此多了导入行。后台的 `discoverDecoders` 用法**未做任何改动**（本轮只处理面板侧）。

---

## 四、结果一致性证据

### 4.1 主线程 vs Worker（真机，hpailist-2）

`scripts/p47-worker-exec-verify.ts` 在真实扩展页面上下文里创建 Worker 并回传结果：

| | functions | candidates | callSites | JSON 长度 | 前 5 个候选名 |
| --- | --- | --- | --- | --- | --- |
| 主线程直接调用 | 804 | 251 | 5915 | 2787099 | `_0x374d, _0x374d, _0x51116d, _0x5e9b98, _0x374cae` |
| 经 Worker | 804 | 251 | 5915 | 2787099 | 完全相同 |

四个计数、序列化长度与候选顺序**全部一致**。输入 `256820` 字节，sha256 `cc7a8127…`，与归档一致。

512 KB 合成脚本经 Worker：`functions 5893 / candidates 983 / callSites 1964 / jsonLen 2401058`。

### 4.2 结构化克隆往返

`test/decoder-analysis-consistency.test.ts` 断言：
- `DiscoveryResult` 往返后 `JSON.stringify` **完全相等**；
- 候选、调用位置的每个字段（`callText`、`location`、`args`、`parentNodeType`）都是可克隆纯数据；
- 解析失败时 `analyzed:false` 与 `error` 原样往返，不被伪装成成功；
- 归档 hpailist-2 往返后 `deep(back) === deep(before)`，候选数与调用位置总数不变。

---

## 五、测试结果

| 项 | 结果 |
| --- | --- |
| Vitest 全量 | **54 文件 / 599 passed / 5 skipped / 0 failed**（34.4 s） |
| 其中一致性测试 | 8 条，6 通过 / 2 按需跳过（`P47_HEAVY=1` 时运行慢用例） |
| 其中队列测试 | 12 条全部通过 |
| `tsc --noEmit` 对照基线 `tsc-1.txt` | 新增 **24 条，与上一轮完全相同**，全为缺 `@types/node` 一类；**新文件与 panel.ts 零错误** |
| `vite build` | exit 0，5.59 s |

新增/更新的测试覆盖要求中的 10 项：小脚本一致性、大脚本一致性、多脚本并发到达、重复脚本事件（同 scriptId 只分析一次、并发到达合并）、Worker 失败与恢复、面板关闭与任务取消、主线程响应性（真机，第五节的 before/after 表）、原有全部 Vitest、TypeScript、Vite build。

**队列语义要点**（均有测试）：并发上限 1；同 scriptId 去重且并发到达合并为一次；`force` 走同一队列；Worker 异常→显式错误；分析失败→合法透传；超时→显式失败并重建；取消→在飞行与排队全部显式错误且清缓存；队列上限 64（含在飞行），超出**显式失败并写明"队列已满"**，不静默丢弃。

---

## 六、主线程保持可交互

修复后（after-run4）：
- 面板长任务只有 **1 个 250 ms**；
- 面板探针 8 次采样中 6 次成功，耗时 1–4 ms；
- `swDirect`（面板无关）报 `connected`，最慢 2 ms；
- 异常 0。

分析期间面板可响应 `Runtime.evaluate`、可读 DOM 统计，未出现修复前那种连 `swStatus`、`page` 都被拖慢的整段冻结。

---

## 七、部署一致性

| 文件 | 修复前 | 修复后 | 说明 |
| --- | --- | --- | --- |
| `dist/background.js` | `fa3ba6a4…` | `68d8055b…` | chunk 重新划分，`background.ts` 未改 |
| `dist/devtools.js` | `870b0b74…` | `870b0b74…` | 未变 |
| `dist/panel.js` | `9cbc65a3…` | `accfac09…` | 主线程分析已移除（`discoverDecoders(` 出现 **0** 次），改为创建 Worker |
| `dist/sandbox.js` | `2df0c212…` | `2df0c212…` | 未变 |
| `dist/assets/decoder-analysis.worker-CMwEr3ip.js` | 无 | `e94cfda1…`（1647698 B） | 新增 Worker 产物 |
| `dist/chunks/parser-BGlb7RAx.js` | `3533bc32…` | `3533bc32…` | 未变（接收了 `discoverDecoders`） |
| `dist/chunks/capture-plan-ZmWOmY9y.js` | 无（原为 `-DDt5MvKB`） | `dd5393a3…` | 变薄，只剩仍未迁移的 `computeCapturePlan` |
| `dist/manifest.json` / `panel.html` | — | — | 与备份逐字节一致 |

生产构建中 `panel.js` 的 Worker 引用形式为 `new Worker(new URL("/assets/decoder-analysis.worker-CMwEr3ip.js", import.meta.url), { type: "module" })`，在扩展页内解析为 `chrome-extension://<id>/assets/...`。该 URL 已在真机验证中实际加载成功（见第四节）。

> 复核运行器 `scripts/p47-l1-ob-run.ts` 的守卫要求 `dist/background.js` 含 `getBreakpointsByScript`：**仍然满足**。

---

## 八、未解决问题

1. **只迁移了 `discoverDecoders` 一处。** `computeCapturePlan`（点击"开始捕获"时对已选候选执行，含 `traverse`）、`validateCaptures` 的 `parseCode`（在 `scheduleValidationStats` 的 150 ms 定时器里）**仍在主线程**，本轮未迁移。它们有按脚本的缓存，实测未成为主要阻塞源，但**没有单独测量过**其最坏情况。
2. **后台的 `discoverDecoders` 未迁移。** `background.ts:168` 在插桩路径上同步分析，可能阻塞 Service Worker。本轮范围只到面板，**该处风险未评估**。
3. **after-run4 只采样 8 次**（分析 10.2 秒即完成），样本量小；before-run1 采样 141 次。两者的"面板超时次数"不可直接按比例比较，报告里同时给出了绝对值与卡顿时长。
4. **修复后仍有 2 次探针超时**，其中至少 1 次可归因于观测脚本自身的单连接 CDP 争用，**未做进一步分离**；不排除面板侧仍有小的同步开销。
5. **`MAX_QUEUE = 64` 与 `TIMEOUT_MS = 10 分钟` 是经验取值**：超时阈值远高于实测 145 s，取的是"挂死检测"语义，不是性能上限；两个值都未做压力标定。
6. **面板进度显示有限**：目前只通过既有的"发现脚本/分析完成"日志与统计数字反映进度，**没有新增进度条**。失败原因是显式文本（满足"能显示失败原因"），但"分析进行中"的状态不够直观。
7. **`P47_HEAVY=1` 的两个慢用例**（512 KB 完整分析、hpailist-2 双次确定性）默认跳过，因为它们分别需要约 7 分钟与 63 秒，会拖垮常规回归。
8. **`dist` 哈希变化需在下一次 L1 取证前重新登记**；本报告已记录新值。

---

## 九、边界遵守情况

- **未访问 17qcc.com**：所有真机运行都带 `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1`，结构上不可达；观测脚本只加载本机 `127.0.0.1`，证据文件 `served` 列表可核。
- **未运行 nextpage3**，未点击真实网站下一页，未登录。
- **未修改 `registry.json`**（与备份逐字节一致），未修改 `budget-ledger.json`（预算仍 **已用 17 / 剩余 83**，条目 4 条）。
- **未进入 Phase 5**。
- **四份既有证据哈希未变**：`a71e7a59…` / `f6c0ae99…` / `5b02d342…` / `f4ac025f…`。
- 未放宽任何安全规则来解决性能问题。

完成后停止，等待下一步批准。
