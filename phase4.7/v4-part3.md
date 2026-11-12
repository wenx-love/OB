
---

## 九、当前状态与历史累计（R13）

### 9.1 每个脚本一个 `currentState`

| currentState | 含义 |
|---|---|
| `discovered` | 已收到脚本，尚未提交分析 |
| `deferred` | 已受理，等待执行 |
| `executing` | 某次尝试在飞行 |
| `retry-pending` | 首次失败，等待第二次 |
| `awaiting-commit` | 结果已交付，等待面板提交 |
| `analysis-failed` | 解析失败（终态） |
| `commit-rejected` | 提交校验失败（终态） |
| `committed` | 提交成功（终态） |
| `failed` | 基础设施/提交超时等最终失败（终态） |
| `rejected` | 未受理（终态） |
| `cancelled` | 取消/纪元结算（终态） |

**守恒式：** 当前发现脚本集合中，11 个 currentState 的计数之和 = 当前脚本总数。每个脚本只有一个 currentState；转换原子；旧请求不得改写最新请求的 currentState。

### 9.2 历史 counters

`attemptFailures`、`watchdogTrips`、`retries`、`retrySucceeded`、`requestsCancelled`、`requestsRejected`、`commitsRejected`、`analysisParseFailures`、`staleEvents`、`cacheHits/Misses/Evictions/Skipped/Errors` 均为只增历史值，不进入守恒式。

`consecutiveWorkerFailures` 是连续计数（成功健康回复可清零），单独维护，不属于历史累计，也不进入守恒式。

### 9.3 终态映射

| 结果 | currentState | `analyzed` |
|---|---|---|
| Worker 成功 + 提交成功 | `committed` | true |
| Worker 成功 + 提交失败 | `commit-rejected` | false |
| Worker 解析失败 | `analysis-failed` | false |
| 基础设施失败/提交超时 | `failed` | false |
| 未受理 | `rejected` | false |
| 取消/纪元 | `cancelled` | false |

`awaiting-commit` 不是终态；必须由提交/拒绝/超时/取消/纪元/dispose 收尾，不得永久停留。

---

## 十、deadline、渲染与完成判据（R16、R18、N03）

### 10.1 三阶段

| 阶段 | 定义 | 记录 |
|---|---|---|
| 采集期 | 导航 → 目标 `commitCompleted` | 导航、请求序号、提交时刻、长任务、CPU |
| 渲染观察期 | 提交 → `render-completed` 或截止 | DOM 属性/tick/commit seq、观察器时间 |
| 事后核验期 | 截止后 | 完整结果导出、Node 复算、分类、失败审计 |

`resultUsable` 是事后核验状态，不是窗口终点；窗口终点是渲染完成时刻或截止。

### 10.2 渲染判据

- 目标身份：`scriptId` + `requestSeq` + `commitSeq`（§7 测试专用 DOM 属性）。
- `render-completed`：目标卡片数 = `committedCandidates`；容器 `render-commit-seq ≥ 目标 commitSeq`；提交后 `render-tick` 递增；零候选同样要求 tick/seq。
- 其他脚本同签名卡、旧 requestSeq 卡、旧纪元卡一律不计入目标。
- 若测试专用属性不可用：`render-unverified`，不得签发渲染通过。

### 10.3 四种耗时

| 指标 | 定义 |
|---|---|
| `attemptElapsed` | 单次尝试：`dispatched` → 回复/崩溃/看门狗 |
| `cumulativeExecutionMs` | 同一逻辑请求所有尝试 `attemptElapsed` 之和；**D4 50% 分子** |
| `schedulingWaitMs` | 受理 → 首次派发 + `retry-pending` 等待 |
| `endToEndUsableMs` | 导航 → `render-completed`（另记受理→渲染） |

首次超时+第二次快速成功：两次都计入 `cumulativeExecutionMs`；不得只取第二次。

### 10.4 50%

- 合法完成的逻辑请求：`cumulativeExecutionMs < 0.5 × threshold(source)`。
- 任一不满足：性能验收不通过；不得改阈值、删任务、标故障注入。
- 故障注入、取消、拒绝不参与 50%，但逐条列出。

### 10.5 deadline 完整分类（11 态 × 错误码 × 渲染）

| currentState | 附加条件 | 目标层 | 运行层候选 |
|---|---|---|---|
| `discovered` | 截止仍未提交 | `target-not-submitted` | `setup-failed` |
| `deferred` | — | `target-not-started` | `queue-wait-timeout` |
| `retry-pending` | — | `target-retry-waiting` | `retry-wait-timeout` |
| `executing` | 错误码 `watchdog-*` | `target-executing-timeout` | `execution-timeout` |
| `executing` | 其他错误码 | `target-executing` | `window-deadline-during-execution` |
| `awaiting-commit` | 提交超时 | `target-commit-timeout` | `commit-timeout` |
| `awaiting-commit` | 其他 | `target-awaiting-commit` | `commit-pending-timeout` |
| `analysis-failed` | — | `target-analysis-failed` | `target-failed` |
| `commit-rejected` | — | `target-commit-rejected` | `target-failed` |
| `committed` | `render-completed` | `target-rendered` | `completed`/`partial`/`other-script-failed` |
| `committed` | `render-partial` | `target-render-partial` | `render-partial` |
| `committed` | `render-failed` | `target-render-failed` | `render-failed` |
| `committed` | `render-timeout` | `target-render-timeout` | `render-timeout` |
| `failed` | 错误码 `worker-unavailable`/`breaker-*`/`*-crashed-*`/`protocol-*` | `target-infrastructure-failed` | `infrastructure-failed` |
| `failed` | 错误码 `watchdog-*` | `target-execution-timeout` | `execution-timeout` |
| `failed` | 错误码 `commit-timeout` | `target-commit-timeout` | `commit-timeout` |
| `rejected` | — | `target-rejected-at-admission` | `target-rejected` |
| `cancelled` | — | `target-cancelled` | `cancelled` |

**运行层优先级（互斥，从高到低）：**

1. `setup-failed`（目标缺失/不唯一/哈希不符/观察器未安装/未提交）
2. `target-rejected`（受理阶段拒绝）
3. `cancelled`
4. `infrastructure-failed`
5. `execution-timeout`
6. `retry-wait-timeout`
7. `queue-wait-timeout`
8. `render-failed`
9. `render-partial`
10. `render-timeout`
11. `commit-timeout`
12. `commit-pending-timeout`
13. `target-failed`
14. `other-script-failed`
15. `partial`
16. `completed`

**规则：** 高优先级覆盖低优先级；`partial` 不得吞掉其他任务失败；`completed` 要求所有非故障注入脚本均 `committed` 且渲染完成（零候选同样满足），且没有任何脚本处于失败/拒绝/取消终态；“全部终态”不等于通过。

### 10.6 阶段出口

| 结论 | 条件 | 允许声明 |
|---|---|---|
| `completed` | 目标可用；所有非故障注入脚本 committed+rendered；无失败/拒绝/取消 | 全部任务性能通过 |
| `partial` | 目标可用；其他脚本仍未终态（不是失败） | 仅目标局部性能；列出未完成 |
| 其他 | 任一失败/渲染/提交/超时 | 不通过；按优先级报告 |

Phase 4 允许以 `partial` 通过“目标局部性能”；Phase 6 完整性能验收必须 `completed`；否则只能局部结论。

---

## 十一、安全指标（N05，不得重定义）

| 指标 | 定义 |
|---|---|
| FR | `frWrongValue + frOnIndeterminate + frNotInReference + frSourceMutation` |
| `R_pos` | `TP + frWrongValue + UN` |
| `R_neg` | `SR + frOnIndeterminate` |
| Precision | `TP / (TP + FR)`；分母 0 → `n/a` |
| Recall | `TP / R_pos`；分母 0 → `n/a` |
| SRR | `SR / R_neg`；按独立参考调用位置，不按验证组 |
| Source Integrity | 三处原始源码 SHA-256 一致 |

**三处：** `reference/` 归档原始源码；CDP `Debugger.getScriptSource` 捕获源码；替换完成后的 `activeScript.source`。排除格式化展示与 `recovered`。

**判定：** 任一 false → 不通过；任一 `n/a` → `inconclusive`，不自动通过；零替换不自动通过；`version-mismatch` 不做位置级比较；分母 0 显式 `n/a`。

引用：`docs/PHASE4.7-REAL-SITE-PLAN.md:18-23、43-48、320-353`；`test/helpers/real-site-compare.ts:139-187`。V4 只恢复口径，不改文件。

---

## 十二、构建与产物（N07，R14、R15）

### 12.1 戳与旁清单

| 对象 | 内容 |
|---|---|
| 构建戳（位置待 D2） | 只记录输入哈希 + Vite 版本；无时间戳/绝对路径/自身哈希/产物哈希/Worker 名 |
| 可信旁清单（`dist` 外） | Worker 名、完整文件集合、逐文件 SHA-256、Node/Vite/Rollup/TS 版本、依赖核验、构建命令 |

### 12.2 验证五项

1. 戳的输入哈希与当前源码逐文件一致。
2. 旁清单 Worker 名与实际产物一致。
3. 旁清单文件集合与实际 `dist` 完全相等。
4. 每实际产物 SHA-256 与旁清单相等。
5. 无主线程 `discoverDecoders(`；四入口齐全；Worker 格式与构造匹配。

**旁清单可信锚：** 旁清单一生成就公布 SHA-256，并存入 `<run>\baseline`；校验时先核对旁清单自身哈希，再核对产物。产物与旁文件一起被替换时，仍能用已公布哈希发现。

### 12.3 负例

- 同名改内容；文件缺失；多余文件；旁清单被改；戳被改。
- 任一未发现，Phase 3 不通过。

### 12.4 依赖

- lockfile 不证明 `node_modules` 实际内容；Phase 0 建依赖清单（路径/大小/SHA-256），Phase 3 关联旁清单。
- 依赖变化必须重新核对。

### 12.5 可复现

- 两个独立目录、同一输入两次构建：逐文件哈希/集合/戳相同。
- 两个绝对路径构建：产物相同；差异说明绝对路径进入产物。
- `dist` 扫描无绝对路径/盘符/`file://`/用户名路径。

---

## 十三、取证、schema 与真实面板（N06、R17、R19）

### 13.1 五层证明

| 层 | 证明 | 当前结论 |
|---|---|---|
| Worker 结果 | 产品 Worker、完整无损输出 | 设计可验证，运行 UNVERIFIED |
| Coordinator 提交 | 共享模块真实提交集合 | harness 可直采，UNVERIFIED |
| Panel 状态 | D10 九字段、请求序号/数量 | 元数据可验证 |
| DOM 呈现 | §7 请求来源属性 + 渲染状态 | 设计可验证，运行 UNVERIFIED |
| Harness 结果 | 自己请求的完整结果 | 不能冒充 panel 直采 |

### 13.2 共享 coordinator

- 提交路径抽成 `decoder-analysis-coordinator`（无 DOM/无 `chrome.*`）。
- 面板与 harness 使用同一模块；harness 只替换 sink/时钟/日志。
- 同一模块只证明“代码同一”，不证明“真实 panel 实例同一次提交”。

### 13.3 真实面板全文

- D10 只证明元数据；DOM 只证明目标呈现。
- 若不能证明 panel 实例与 harness 同输入/同转换，必须分开报告两个范围；真实 panel 完整字段内容保持 `UNVERIFIED`。
- 不得写“真实面板全字段一致已验证”。

### 13.4 两套 schema（R19）

| schema | 内容 | 用途 |
|---|---|---|
| `DiscoveryResultV1` | `scriptId`、`scriptUrl`、`functions`、`candidates`、`analyzed`、`error` | 四方完整分析结果比较 |
| `CommittedCandidateSetV1` | coordinator 实际提交的候选集合（含位置/值/组键） | 提交集合比较 |

- 不得用候选数组代替完整 DiscoveryResult。
- 每个输出带 `schemaId` 与 `schemaHash`。
- 四方比较必须同 schema；coordinator 比较单独报告。
- 若某方只能提供候选集合，标“降级覆盖”，不得称四方完整通过。

### 13.5 四方与降级

- 四方：Node 主线程、Node 线程/进程真实 Worker、Chrome 主线程、Chrome 产品客户端驱动 `dist` Worker。
- 每方 `hashOrdered`/`hashSorted` 各自四方相等；不要求两种编码彼此相等。
- 类型保真：`undefined` vs 缺失、`-0`、`NaN`、`±Infinity`、孤立代理项；不可序列化即报错。
- 深比较定位首差异；不得投影/删字段。
- 子进程替代标“降级”，不得称四方原定义通过。

---

## 十四、历史证据、写入范围与“未变化”（R20、R21、R22、R24）

### 14.1 写入边界

沿用 §4.3 白名单：原项目/历史证据/冻结 baseline/证据子目录禁止写；实验副本自身根内允许写，插件写自身 `dist` 是预期观察；日志/cache/专用 TEMP 允许。

### 14.2 预期 vs 意外

- 预期拒写只限登记探针；记录编号/对象/预期/实际/时间/主体/命令 ID。
- 意外写入：白名单外或保护区内；立即停止、保留、报告；不清理/不提权/不关守卫。
- 二者分开统计；GU-5 的“拒绝数为 0”只约束正式运行。

### 14.3 删除“已归因即可通过”

- 原项目/历史证据/冻结 baseline 的任何实质差异都阻止阶段通过。
- 归因只用于调查；只有事先声明字段（如 LastAccessTime）或用户书面授权例外可单独记录。
- 授权例外不得覆盖历史证据；差异原因不明即 `source-unknown`，停止。

### 14.4 persistRun 与 D11

- D11 获批：默认只校验；外置输出；预检全部写项；保护 reference/observed/compare/meta/summary；断言不减少。
- D11 未批：不改测试；实验副本证据目录拒写；任何写入立即失败并保留现场。
- 两者都先预检，避免半写入。

### 14.5 路径中和（R22）

- 47/48 脚本含根字面量、40 个含 profile 删除（CONFIRMED）。
- 中和只改代码文件；残留 0；中和前后 `tsc`/Vitest 逐用例一致。
- 启动器白名单、真实路径、专用 TEMP/TMP/cache/profile、非 Node 边界、禁用清单/入口哈希。
- D16 未批：旧脚本只中和不运行；实验入口必须显式根/输出/profile/证据路径。

### 14.6 未变化证明

- 字段：路径集合、大小、内容 SHA-256（两套实现）、时间、属性、文件 ID、链接、USN、ChangeTime、SDDL 哈希。
- ADS 逐流内容哈希；不可读标 `ADS-UNVERIFIED` 并缩小声明。
- 判定：`unchanged`/`changed`/`cannot-determine`；`source-unknown` 不归因。
- 阳性对照覆盖内容/增删/改名/同内容重写/时间/属性/ACL/删除重建/空目录/ADS/硬链接。
- 分范围结论：源码、完整 `dist`、历史证据分别出摘要。
