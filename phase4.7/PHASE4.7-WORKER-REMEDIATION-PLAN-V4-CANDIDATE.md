# OB-Recover Phase 4.7 Worker 整改方案 V4（正式候选）

> **文档性质：** 以 V3 正式候选为基础、按 Codex 第三轮独立审查（`ab92008f…`）修订的 V4 正式候选。V3、V2、V1、原始方案、三轮审查报告和全部历史证据一律保留，不覆盖、不改写。
>
> **本轮边界：** 只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0。
>
> **输入校验（均 MATCH）：**
>
> - `PHASE4.7-WORKER-REMEDIATION-PLAN-V3-CANDIDATE.md`：73389 字节，1107 行，`2ed0fce1abd552109a3b46b2a49af94b0b4064c546b4e045eaad2589f99d9fd0`
> - `PHASE4.7-V3-CODEX-FINDINGS-TRACEABILITY.md`：10783 字节，106 行，`f43a6a3ed4d7be60513aa880432e8531b2d1396205075fd72390e95bf1ac99a2`
> - `CODEX-P47-V3-THIRD-INDEPENDENT-REVIEW.md`：31184 字节，359 行，`ab92008fa4ef8a4af6516344348eeb0b6e0980ef3cef51e4f5e7fd0df326bbdd`
>
> **证据标签：** `CONFIRMED` = 正文、源码或条款对照的直接支持；`INFERENCE` = 由设计推得、触发条件待验证；`UNVERIFIED` = 未取得实测；`UNKNOWN` = 根因不明。所有“将/必须/应”都是执行要求，不是已发生结果。

---

## 一、版本关系与修订目标

### 1.1 与旧版的关系

| 文件 | 处置 |
|---|---|
| 原始恢复方案、`rebuilt.md`、第一/二/三轮审查报告、V2/V3 及其追溯与自检 | 全部保留，不改 |
| 本文件、V4 追溯表、V4 自检 | 新建；V4 作为第四轮审查对象 |

### 1.2 第三轮结论与 V4 的定位

第三轮结论为 **APPROVED WITH CONDITIONS**：V3 具备申请“仅限 Phase 0 基线、隔离初始化和工具自测”的基础，但需补齐有限书面条件；后续状态机、渲染、完整结果 schema 仍有实质问题，不能按“自检通过”越过。

第三轮独立重评级：**11 CLOSED / 11 PARTIAL / 3 OPEN**，OPEN 为 **R01、R03、R16**；R13 已在方案层关闭。

V4 只做三件事：

1. 真正闭合 R01（Promise 结算生命周期）、R03（熔断计数）、R16（DOM 请求来源）的设计矛盾。
2. 按第三轮 E1—E6 补齐 Phase 0 的写入范围、读/写守卫矩阵、原生进程边界、预期/意外写入、删除“差异已归因即可通过”。
3. 修复第三轮 P1/P2 中与本轮范围直接相关的 R05、R18、R19、R23、E3、缓存命中/post-failed 等条款。

**状态目标：** 第三轮 11/11/3 → V4 **11 CLOSED / 14 PARTIAL / 0 OPEN**。R01、R03、R16 只从 OPEN 降为 **PARTIAL**，不升 CLOSED；它们的设计已闭合，但实现与动态验证仍 `UNVERIFIED`。不为了统计好看降低标准。

---

## 二、第三轮问题与 V4 响应

| 第三轮问题 | V4 位置 |
|---|---|
| R01：`analysis-succeeded` 仍未结算却在成功回复 `settleLogical`；交付与最终结算同一 Promise | §5 双 Promise 协议：resultReady + completion |
| R03：创建 Worker 成功即清零，熔断不可达 | §6 健康回复才清零；恢复探针保留阈值 |
| R16：DOM 签名无请求来源，同签名可冒认；整表重建/同内容刷新/零候选 | §7 测试专用 DOM 身份 + 容器渲染 tick/commit seq |
| R05：异步重键合并与 force 冲突 | §8.4 force 隔离贯穿异步定型；force 永不合并 |
| R18：deadline 漏 discovered/committed 未渲染/rejected 优先级/错误码路由 | §10 11 态 × 错误码 × 渲染状态完整表 |
| R19：候选集合与完整 DiscoveryResult schema 混用 | §13.5 两套 schema 分开比较 |
| R23：最终新 bundle 未要求重跑受影响验收 | §15.4 bundle 相同复用/不同重验 |
| E1：阶段出口“若要求才停”；M0 未明确先于实验 | §4.1 十步：M0/快照/副本核对先于任何测试；出口永远停 |
| E3：允许写入范围不明；“差异已归因即可通过” | §4.3 写入白名单；§4.3/§14.3 删除归因通过 |
| E4：读拒绝未测；Phase 0 启动 Chrome 与禁令冲突；原生边界未定义 | §4.4 读/写/FD/链接/原生矩阵；Phase 0 不启动 Chrome |
| R21/R22：预期拒写与意外写入范围；守卫读覆盖 | §4.3/§4.4/§14.3—14.4 |
| R17：共享代码不等于真实 panel 直采 | §13.3 五层证明范围；真实 panel 全文仍 UNVERIFIED |

---

## 三、已批准决策（不得重开）

### 3.1 D3：有界延后

- deferred ≤ **256 条**；源码累计 ≤ **64 MiB = 67,108,864 字节**；**≤64 KiB = 65,536 字节** 优先。
- 第四态 `deferred`；只持脚本对象引用；显式取消与纪元结算；禁止静默丢弃。
- 调度与展示顺序分离；严格小脚本优先，**不增加反饥饿/aging**；只记录 `overtakenBySmall` 与最大等待；改变优先级须另行决定。
- 容量用尽/单条超预算：显式 `deferred-full` / `source-too-large`，计入 rejected，不缓存。

### 3.2 D4：看门狗

- `clamp(120s + 1.0ms × UTF-8 字节数, 5min, 45min)`；毫秒形式 `clamp(120000 + bytes, 300000, 2700000)`。
- 测量前登记，测量后不改；最多自动重试 1 次；第二次失败显式失败。
- 50% 分子固定为**逻辑请求的累计执行时间**（所有尝试之和），不是最后一次尝试；首败不得隐藏。
- 示例：512064 字节 → 632064 ms，50% = 316032 ms（公式算例，不是实测）。
- 看门狗超时不计入熔断（另设 `watchdogTrips`）。

### 3.3 D10：只读钩子

- 仅 `?obTest=1`；`obTest` 必须恰好一次且值严格 `1`；重复/多值/变体不挂载。
- 只返回九个元数据字段：`scriptId`、URL 哈希前缀、状态枚举、错误码、请求序号、已提交候选数、入队/开始/结算时间戳。
- 返回逐脚本记录数组；不提供 `epoch`、全局 counts、快照时间等额外字段。
- 不返回源码、候选内容、调用位置；不开放生产完整内容导出。
- 测试专用 DOM 属性（§7）不是 D10 字段，不返回内容；只在 `?obTest=1` 下存在。

### 3.4 D12：工作副本与一次性提升

- 原项目只在 Gate P 变化；工作副本实施；路径逆映射、碰撞检查、逐字节校验；最终候选树与构建产物一致；`dist` 不含工作副本绝对路径；构建戳只记录输入哈希 + Vite 版本。

### 3.5 D14：运行根与权限

- 正式根 `D:\P47RUN\<run>`；不得把 TEMP 当正式运行根。
- `WENX\Administrator` 完全控制、`SYSTEM` 完全控制、`CodexSandboxUsers` 读取与执行；关闭继承；读回 ACL。
- Codex 读哨兵成功、`acl-probe` 写哨兵拒绝；读不到不扩权，改“位置不可信 + 每次核对公布哈希”。
- 第二归档位置由用户指定；未指定不得关闭 Phase 0。

### 3.6 D15：静默窗口

- 每阶段记录起止、进程/ACL/USN 快照；用户与 Codex 不写原项目与运行根；未知变化 `source-unknown`，不归因、不自动还原。
- W2-B 在独立根内的写入需单独授权，不是默认例外。
- 日志导出是取证，不授权写入。

### 3.7 D6 边界

D6 仅身份/纪元守卫（后台发送前对象校验、`collectorEpoch`/`sessionNonce`、面板接收拒绝旧纪元、确定性测试）；**不**修改 `capture-engine` 的捕获时机/规则，**不**修改 `verified`/拒绝规则。真实频率 `UNVERIFIED`。

---

## 四、Phase 0 执行契约（E1—E6，按第三轮修订）

Phase 0 只做：基线冻结、运行环境隔离、ACL 验证、工具自测、实验副本准备、插件对照、证据归档。**不实施 Phase 1—6 代码整改。**

### 4.1 E1：初始化顺序

1. 用户批准 Phase 0 范围（仅基线/隔离/工具自测）并授权管理员初始化。
2. 授权管理员以已批准身份执行运行根初始化。
3. 创建 `D:\P47RUN\<run>`。
4. 创建探针目录与三个实验目录（原样、无插件、中和）。
5. 设置 ACL：`WENX\Administrator` 完全控制、`SYSTEM` 完全控制、`WENX\CodexSandboxUsers` 读取与执行、关闭继承、移除其他继承项。
6. 读回 ACL：SDDL、逐条 ACE、继承标志，与期望逐条比对。
7. Codex 只读验证：读哨兵成功；`acl-probe` 写哨兵拒绝。
8. **M0 + 来源快照 + 三副本派生与逐文件核对**：必须在任何测试/实验命令之前完成；来源快照哈希在派生时公布。
9. 工具自测（假目录树、守卫矩阵、检测器对照）→ 三副本实验（原样 `tsc`/Vitest、无插件对照、中和等价性）。
10. 阶段报告；**无条件停止，等待用户与 Codex 审查批准**。按路线下一阶段是 Phase 3，不得默认进入。

**关键：** 第 3—9 步是 Phase 0 内部工作，不得要求批准前完成；第 8 步先于第 9 步；第 10 步不存在“若要求才停”的例外。

### 4.2 E2：执行边界与三副本

- 三个副本来自**同一份哈希核验快照**；目录 `<run>\exp\pristine-<id>`、`<run>\exp\no-plugin-<id>`、`<run>\sandbox`；物理隔离、不共享可写目录。
- 每个副本记录：来源快照哈希、派生时间、目录、文件数、整树摘要、派生命令。
- 副本自带 `node_modules`/cache/TEMP/TMP/输出/profile；不得从原项目或链接加载可写依赖。
- 原项目不运行任何测试/构建；基线来自快照副本。
- 无插件副本不得把结果带回原样副本；中和副本不得把中和结果带回原样副本。

### 4.3 E3：允许写入、预期拒写与意外写入

**允许写入白名单（按对象）：**

| 对象 | 读 | 写 | 说明 |
|---|---|---|---|
| 原项目 | 允许 | **禁止** | 不建目录、不改文件、不改 ACL/属性 |
| `<run>\baseline` | 允许 | 只在建立时写一次，之后只读 | 基线工具写；写后校验 |
| `<run>\sandbox` | 允许 | 允许（自身根内） | 历史证据子目录只读 |
| 三个实验副本 | 允许 | 允许（各自根内） | 插件写自身 `dist` 是**预期观察**，不是违规 |
| `<run>\out`、`evidence`、`profiles`、`tmp`、`controls` | 允许 | 允许 | 新证据独占创建 |
| `<run>\acl-probe` | 允许 | 只允许登记探针写 | 预期拒绝测试 |
| 运行根之外 | 视具体对象 | **禁止** | 专用 TEMP/TMP 例外仅限 `<run>\tmp` |

**预期拒写（仅登记探针）：** 记录探针编号、对象、动作、预期、实际、时间、主体、命令 ID；未达预期按失败。

**意外写入：** 白名单之外、或保护区（原项目、历史证据、冻结 baseline、证据子目录）内的任何写入尝试/实际变化；立即停止、保留现场、报告 `unexpected-write`；不清理、不重跑覆盖、不关闭守卫、不换目录、不提权。

**删除“差异已归因即可通过”：** 对原项目/历史证据/冻结 baseline，任何实质差异都阻止阶段通过；归因只用于调查，不替代验收。只有事先声明的字段排除（如 LastAccessTime）或用户书面授权的例外可单独记录；授权例外也不得覆盖历史证据。

### 4.4 E4：守卫覆盖矩阵（读 + 写）

| # | 范围 | 输入/对象 | 预期 | 记录 | 失败停止 |
|---|---|---|---|---|---|
| 1 | 普通读 API | `readFile/open/read/copyFile` 源 | 允许区成功；禁止区明确拒绝并记日志 | `guard-matrix-1.json` | 禁止区读取成功且无日志 |
| 2 | 普通写 API | `write/append/rename/unlink/mkdir/rmdir/truncate/chmod/utimes` | 允许区成功；禁止区拒绝 | 同上 | 禁止区写入成功 |
| 3 | 已开 FD/FileHandle | 打开后读/写/截断；打开后目录改名 | 句柄按真实目标判定；改名不绕过 | 句柄生命周期 | 句柄绕过判定 |
| 4 | 复制源/目标 | 源允许、目标禁止；反向 | 读源允许；写目标按目标判定 | 逐调用 | 目标禁止区写入成功 |
| 5 | 链接/别名 | 符号链接、硬链接、`realpath`、`\\?\`、8.3、`subst` | 解析真实路径后判定 | 别名+真实路径 | 别名写入禁止区成功 |
| 6 | 原生子进程 | **Phase 0 不启动 Chrome**；用 `cmd`/`node -e`/`esbuild` 在假目录测试 | 记录“Node 守卫不覆盖原生进程”；由启动器白名单/路径检查阻止越界；**不声称 OS 级写拒绝已存在** | 进程、命令行、结果 | 原生进程写禁止区成功且无启动器阻止 |
| 7 | 环境/工作进程 | `NODE_OPTIONS`、`TEMP/TMP`、`cwd`、Vitest worker、`worker_threads`、`fork` | 守卫与专用临时目录继承；外部注入不覆盖；工作进程生效或登记偏差 | 环境快照+标记 | 工作进程未生效且未登记 |

**原生边界的明确限制：** 实施者可写原项目且 Phase 0 不修改原项目 ACL；Node `fs` 包装不是原生进程安全边界。Phase 0 只验证“启动器拒绝越界目标 + 记录原生边界不覆盖”；若要求 OS 级写拒绝，必须另行提出、经用户批准的低权限执行方案，不能假设已存在。Chrome/profile 继承测试留 Phase 3，不扩大 Phase 0。

### 4.5 E5：基线与第二归档

- `<run>\baseline` 写后只读；逐文件哈希、整树摘要、生成时间、命令；原始清单+归档。
- 第二归档责任人与位置由用户指定；未指定不得关闭 Phase 0；不得默认用 TEMP 备份充当第二份。
- 第二归档与第一归档逐文件哈希一致；不一致失败；失败记录保留。

### 4.6 E6：原项目只读

- 禁止原地测试、构建、Vitest、`tsc`；禁止因失败提权/关守卫/换目录绕过；禁止自动还原无法归因变化。
- 未知变化 `source-unknown`，停止、保留现场；不归因。
- 原项目 ACL 在 Gate P 前不修改；只在基线记录。
- 差异归因不构成通过；见 4.3。

---

## 五、R01：Promise 结算生命周期

### 5.1 四个阶段不能合并

| 阶段 | 事件 | 客户端状态 | Promise | 证据 |
|---|---|---|---|---|
| A Worker 成功返回 | Worker 回复到达 | 尝试 `replied-success`；逻辑仍在 `executing` | 不结算 | 回复 `attemptId`/回显匹配 |
| B 主线程收到并接受 | 客户端校验信封、写缓存 | 逻辑 `awaiting-commit` | `resultReady` 结算 | `requestId`、`sourceSha256`、`cacheSeq` |
| C 面板接受并提交 | panel 调用 `commitResult`/`rejectCommit` | `committed`/`commit-rejected` | `completion` 结算 | D10 九字段、commit 序号 |
| D 逻辑请求最终结算 | 终态记录 | 终态 | `completion` 已结算 | 终态审计 |

**核心规则：** Worker 成功 ≠ 主线程收到 ≠ 面板提交 ≠ 逻辑请求最终结算。任何一个阶段都不得用后一阶段的证据冒充前一阶段。

### 5.2 双 Promise 协议

`analyze(job)` 返回 `AnalysisHandle`：

| 成员 | 结算时机 | 用途 |
|---|---|---|
| `resultReady: Promise<AnalysisOutcome>` | 阶段 B（客户端已校验信封/缓存） | 面板取得可提交的结果 |
| `completion: Promise<RequestCompletion>` | 阶段 D（提交/拒绝/失败/取消） | 最终审计、统计、调用方收尾 |

- `resultReady` 只表示“结果可用”，不表示“已提交”。
- `completion` 只结算一次；终态包括 `committed`、`commit-rejected`、`analysis-failed`、`failed`、`cancelled`、`rejected`。
- 面板必须在 `resultReady` 的同一异步续体里调用 `commitResult(requestId, outcome)` 或 `rejectCommit(requestId, code)`；异常由 `catch` 转为 `rejectCommit`。
- 缓存命中：不创建 attempt、不启看门狗；直接 `awaiting-commit`，`resultReady` 结算；缓存为解析失败时终态 `analysis-failed`，`completion` 立即结算。
- 取消/纪元/dispose：
  - `executing`：尝试 `cancelled`，`resultReady` 以错误结果 `cancelled` 结算，`completion` 结算 `cancelled`。
  - `awaiting-commit`：`completion` 结算 `cancelled`；迟到的 `commitResult` 记日志后忽略。
  - 已终态：取消不改写终态。
- 提交失败：`rejectCommit` → `commit-rejected`；`completion` 结算。
- 提交超时：`COMMIT_ACK_TIMEOUT_MS = 10_000`（**技术参数，不是产品决策；Phase 1 规格评审时确认并登记**）。超过后 `failed(commit-timeout)`，`completion` 结算；迟到的提交忽略。
- 幂等：`settleAttempt`、`settleLogical`、`commitResult`、`rejectCommit` 均可重复调用但只生效一次；重复调用只记日志。

**如果提交超时参数未获批准：** R01 不得关闭，`awaiting-commit` 只能靠取消/纪元/dispose 收尾；Phase 1 不得开始。不得用“面板一定会提交”作为无界等待的理由。

### 5.3 事件补充

| 事件 | 逻辑前态 | 尝试前态 | 结算责任 | 逻辑后态 | Promise | 缓存 |
|---|---|---|---|---|---|---|
| Worker 成功回复（信封有效） | `executing` | `dispatched` | 客户端：先校验，再 `settleAttempt`，转 `awaiting-commit` | `awaiting-commit` | `resultReady` 结算 | 是（按 requestSeq） |
| 缓存命中（成功） | `deferred`/`discovered` | 无 | 客户端 | `awaiting-commit` | `resultReady` 结算 | 否（读） |
| 缓存命中（解析失败） | `deferred`/`discovered` | 无 | 客户端 | `analysis-failed` | `resultReady` + `completion` 结算 | 否（读） |
| 面板 `commitResult` 成功 | `awaiting-commit` | 无 | 面板→客户端 | `committed` | `completion` 结算 | 否 |
| 面板 `rejectCommit` | `awaiting-commit` | 无 | 面板→客户端 | `commit-rejected` | `completion` 结算 | 否 |
| 提交超时 | `awaiting-commit` | 无 | 客户端定时器 | `failed(commit-timeout)` | `completion` 结算 | 否 |
| 取消/纪元 | `executing`/`awaiting-commit` | 相关 | 取消协议 | `cancelled` | 两者均结算 | 清空 |

### 5.4 不变量

1. 每个逻辑请求 `resultReady` 最多结算一次、`completion` 最多结算一次。
2. `completion` 结算时，`currentState` 必为终态；终态不再变化。
3. `awaiting-commit` 不得永久存在：提交、拒绝、超时、取消、纪元、dispose 六条路径任一生效。
4. 缓存命中不创建 attempt、不启看门狗。
5. 面板未提交前，`resultReady` 已结算但 `completion` 未结算；这是两个不同的完成概念，不得混用。

---

## 六、R03：熔断计数与恢复

### 6.1 计数规则

| 事件 | 计数 | 说明 |
|---|---|---|
| 构造 Worker 失败 | `consecutiveWorkerFailures++` | 无 attempt |
| `onerror` | ++ | Worker 级 |
| `messageerror` | ++ | Worker 级 |
| `postMessage` 抛错 | ++ | Worker 级 |
| `protocol-error`（信封无效） | ++ | Worker 级 |
| 看门狗超时 | **不计入** | 单独 `watchdogTrips` |
| 业务解析失败（`ok:false`） | **不计入** | 有效回复，证明 Worker 运行 |
| 提交校验失败 | **不计入** | 面板层 |
| 用户取消 | **不计入** | — |

**健康运行的定义：** 收到与当前 `attemptId`/`requestId` 匹配、信封字段一致、`ok:true` 或 `ok:false` 的回复。只有这种回复才能把 `consecutiveWorkerFailures` 清零。

**明确禁止：** 以“`new Worker` 构造成功”作为健康或清零依据。构造成功只证明对象创建成功。

### 6.2 累计、重试与熔断

- 每次尝试失败按上表计数；一次重试失败会再计一次。
- 计数达到 **3**（不改变已批准阈值）时立即打开熔断，即使当前请求还有重试额度：不再重试，按 `failed(breaker-open)` 结算当前请求。
- 熔断打开时原子结算：
  - `executing`：尝试 `cancelled`/`failed`，逻辑 `failed(breaker-open)`。
  - `retry-pending`：逻辑 `failed(breaker-open)`，清重试计划。
  - `deferred`：逻辑 `failed(breaker-open)`，清引用。
  - `awaiting-commit`：**保留**（提交不需要 Worker）；可继续 `commitResult`/`rejectCommit`/超时。
  - 等待者：随逻辑请求结算，不单独悬挂。

### 6.3 恢复

- 触发：`refresh`、新纪元、`cancelAll`、显式重置。
- 动作：`breakerOpen=false`，`recovering=true`，**保持** `consecutiveWorkerFailures` 在当前阈值（不清零）。
- 恢复确认：下一次 Worker 尝试作为探针；收到有效健康回复 → 计数清零、`recovering=false`；任何 Worker 级失败 → 计数保持/增加，立即重新熔断。
- 这样“构造成功”不会清零；“反复构造成功+崩溃”会按每次失败累计，3 次可达。
- 恢复探针失败不得静默；记录 `breaker-probe-failed`，面板显示。

### 6.4 不变量

1. 连续 3 次 Worker 级失败必然打开熔断。
2. 构造成功不改变计数。
3. 看门狗不改变熔断计数。
4. 熔断后不存在需要 Worker 的 pending 请求。
5. 恢复必须经过一次有效健康回复；仅重置标志不算恢复。

---

## 七、R16：真实面板渲染完成判据

### 7.1 问题

V3 的 DOM 签名只有函数名/置信度/调用数/首个调用文本，没有请求来源；同签名旧卡、其他脚本同签名卡、整表重建、同内容刷新、零候选都能造成假通过或假失败。

### 7.2 测试专用 DOM 身份

仅在 `?obTest=1` 时，由面板渲染代码写入以下属性（不写入内容、不进入 D10）：

| 位置 | 属性 | 含义 |
|---|---|---|
| 每个 `.decoder-card` | `data-obtest-script-id` | 该卡来自哪个脚本 |
| 每个 `.decoder-card` | `data-obtest-request-seq` | 该卡由哪个请求渲染 |
| 每个 `.decoder-card` | `data-obtest-commit-seq` | 提交序号 |
| `#decoder-list` | `data-obtest-render-tick` | 每次渲染完成递增 |
| `#decoder-list` | `data-obtest-render-commit-seq` | 本次渲染覆盖的最新提交序号 |

- 属性只在 `?obTest=1` 下存在；普通面板无这些属性。
- 不返回源码、候选内容或调用位置；不是 D10 字段。
- 若用户/Codex 不接受测试专用 DOM 属性，则不得声称渲染完成；R16 保持 OPEN/`render-UNVERIFIED`，Phase 4 不得签发渲染通过。

### 7.3 渲染状态

| 状态 | 判定 |
|---|---|
| `render-completed` | 目标 `scriptId`+`requestSeq` 的卡片数 = `committedCandidates`；容器 `render-commit-seq ≥ 目标 commitSeq`；`render-tick` 在提交后递增；零候选时卡片数=0 且条件同样满足 |
| `render-partial` | 0 < 目标卡片数 < `committedCandidates` |
| `render-failed` | 目标卡片数 > `committedCandidates`，或存在目标请求的错误身份卡，或提交后 tick 未递增 |
| `render-timeout` | 截止时刻仍未达到 `render-completed` |
| `render-unverified` | 测试专用属性不可用，或观察器未能在提交前安装 |

### 7.4 必测反例

1. **旧同签名卡**：保留旧 `requestSeq` 的同签名卡，目标提交后不更新 DOM → 必须判 `render-partial`/`render-timeout`，不得因多重集合相同而通过。
2. **其他脚本同签名**：B 脚本产生与 T 相同的签名；T 未渲染，B 的卡存在 → 按 `scriptId` 归属，T 仍为 partial。
3. **同内容刷新**：`renderDecoderList` 整表清空重建，目标内容相同 → 必须通过 `render-tick`/`render-commit-seq` 证明本次渲染，不能按“净增 0”判失败。
4. **零候选**：目标提交 0 个候选 → 卡片数 0，但 tick 递增且 commit seq 匹配，判 completed。
5. **部分渲染**：目标 983 个候选只出现 500 个 → partial。
6. **渲染超时**：截止时 tick 未递增 → timeout。
7. **旧纪元卡**：旧 `pageEpoch` 的卡不得计入目标。

### 7.5 与 D10 的关系

- D10 仍只返回九字段，不扩展。
- DOM 属性只用于测试侧归属，不返回内容。
- 面板提交的完整内容仍按 §13 的五层范围报告；DOM 证明只覆盖“目标请求的卡片呈现”，不等于完整字段内容一致。

---

## 八、状态机、尝试与 force（R05、R10、R18 的前置）

### 8.1 逻辑状态（10 + discovered）

`discovered`、`deferred`、`executing`、`retry-pending`、`awaiting-commit`、`analysis-failed`、`commit-rejected`、`committed`、`failed`、`rejected`、`cancelled`。

- `awaiting-commit` 取代 V3 的 `analysis-succeeded`：结果已交付，等待面板提交。
- `analysis-failed` 是终态；`commit-rejected`/`committed` 是提交结果；`failed` 是基础设施/提交超时；`rejected` 未受理；`cancelled` 取消。

### 8.2 尝试状态（9）

`created`、`dispatched`、`replied-success`、`replied-error`、`protocol-error`、`timed-out`、`crashed`、`post-failed`、`cancelled`。

- 先创建 attempt 记录（`created`），`postMessage` 成功后才进入 `dispatched`；发送失败为 `post-failed`，不伪造“已派发”时刻。
- `ignored-*` 仍只是事件处理结果，不是尝试状态。

### 8.3 事件表补充

| 事件 | 逻辑前态 | 尝试前态 | 结算责任 | 尝试后态 | 逻辑后态 | 备注 |
|---|---|---|---|---|---|---|
| 派发前创建 attempt | `deferred`/`retry-pending` | 无 | `dispatch` | `created` | `executing` | 尚未发送 |
| 发送成功 | `executing` | `created` | `dispatch` | `dispatched` | `executing` | 看门狗开始 |
| 发送失败 | `executing` | `created` | `settleAttempt` | `post-failed` | 首次→`retry-pending`；二次→`failed` | 计数++ |
| 缓存命中 | `discovered`/`deferred` | 无 | 客户端 | 无 | `awaiting-commit` 或 `analysis-failed` | 无 attempt/无看门狗 |
| 熔断打开 | 任意 Worker 依赖态 | 任意 | `openBreaker` | 相关尝试结算 | `failed(breaker-open)` | `awaiting-commit` 保留 |
| 提交成功/拒绝/超时 | `awaiting-commit` | 无 | 面板/定时器 | 无 | `committed`/`commit-rejected`/`failed(commit-timeout)` | `completion` 结算 |

### 8.4 force 与异步定型（R05）

- **force 永不与非 force 合并**；force 之间也不合并；每个 force 创建独立逻辑请求与更高 `requestSeq`。
- 异步重键必须携带 `force` 隔离标识与请求 nonce；即使缓存键相同，也不得把不同 force 类的等待者合并。
- force 请求不取消旧请求；旧请求继续，但其结果只能更新自己的记录，只有最新 `requestSeq` 可以更新该脚本 `currentState` 与缓存。
- 缓存写入要求 `requestSeq >= entry.requestSeq`；旧请求的迟到结果不得覆盖新请求。
- 允许重复计算；不得默默合并 Promise。

### 8.5 最新请求独占更新

- 旧请求的取消/完成只更新自己的历史计数；不得把旧请求的状态写回该脚本的 `currentState`。
- 只有最新 `requestSeq` 的提交/取消可以改变当前状态。
- 页面重置清空当前集合；旧回调不得把旧脚本重新加回。

### 8.6 批量取消协议（R02）

`cancelAll(reason, { epochChanged })`：

1. `cancelling = true`；`schedulerGeneration++`；禁止 `pump`。
2. 若 `epochChanged`：`pageEpoch++`；旧纪元请求全部失效。
3. 结算 `executing`：清看门狗；尝试 `cancelled`；逻辑 `cancelled`；`resultReady` 以错误 `cancelled` 结算；`completion` 结算；终止 Worker、解除处理器。
4. 逐项结算 `retry-pending`：清重试计划；逻辑 `cancelled`；`completion` 结算。
5. 逐项结算 `deferred`：清引用；逻辑 `cancelled`；`completion` 结算。
6. 逐项结算 `awaiting-commit`：逻辑 `cancelled`；`completion` 结算；迟到提交忽略。
7. 清空 `active`、等待者、定时器、重试队列。
8. 清空缓存（纪元变化必须；面板关闭同样）。
9. `cancelling = false`；允许新请求重新 `pump`。`disposed` 时保持关闭。

**禁止：** 取消期间 `pump`；只清数组不结算 Promise；把 `retry-pending` 留在后台；取消后旧回调再次 `pump`。

### 8.7 旧代次与事件绑定（R04）

所有异步回调绑定：

- `workerGeneration`：每次创建/退役 Worker 递增。
- `pageEpoch`：页面纪元。
- `attemptId`：尝试编号。
- `logicalRequestId`：逻辑请求。
- `collectorEpoch`/`sessionNonce`：后台收集器会话。

`onmessage`、`onerror`、`messageerror`、看门狗、哈希 Promise、重试派发、延后补投、缓存写入都必须检查上述代次。失效事件结果为 `ignored-stale-generation`/`ignored-unknown-attempt`，只记日志，不改状态、不写缓存、不 `pump`。

### 8.8 缓存容量与淘汰（R06）

| 项 | 规定 |
|---|---|
| 条目上限 | 128 条 |
| 结果字节预算 | 32 MiB = 33,554,432 字节；`resultBytes` 用 UTF-8 字节数，不是 JSON 字符数 |
| 预算性质 | 估算上限，不是堆内存精确保证 |
| 单条超限 | `resultBytes > 32 MiB`：跳过缓存，分析成功；记 `cacheSkipped` |
| 淘汰 | LRU；不淘汰有等待者或在执行的条目；淘汰不足则跳过缓存，不失败分析；不得突破预算 |
| 失败缓存 | 只缓存确定性解析失败；基础设施/超时/崩溃/取消/熔断/容量拒绝不缓存 |
| 纪元变化 | 清空全部缓存 |
| 缓存异常 | 不得使分析失败；记 `cacheError` |
| 统计 | `cacheHits`、`cacheMisses`、`cacheEvictions`、`cacheSkipped`、`cacheErrors` |

### 8.9 页面纪元、URL 与刷新（R11）

- `pageEpoch` 只在导航/刷新/目标页关闭时递增；刷新不递增，只递增每脚本 `requestSeq`。
- `collectorEpoch` 是后台收集器会话；`sessionNonce` 区分 Service Worker 重启后的计数重置。
- URL 按原样字符串参与缓存键、提交校验与捕获目标校验；提交时必须核对 `result.scriptUrl === 当前 script.url`。
- 刷新：单飞；快照；逐脚本新 `requestSeq`；不清空全局候选；旧结果保留到该脚本新结果提交成功，再按脚本替换；源码/URL 变化使旧结果标 `stale-source`/`stale-url`；纪元变化中止刷新；失败逐脚本可见。
- 提交成功：清旧错误；更新 `committedSourceHash`、`committedUrl`、`requestSeq`。
- 捕获目标：`committed` + 当前源码哈希 + 当前 URL + 当前纪元 + 未退休（D7 若批准；未批只做身份失效排除）。

### 8.10 后台迟到事件守卫（R12，D6）

- 发送前：`collector.getScript(scriptId) === script` 且 `scriptCollectors.get(tabId) === collector`；否则丢弃。
- 消息携带 `collectorEpoch`；面板维护 `latestCollectorEpoch` 与 `sessionNonce`，拒绝旧值。
- Port 连接时后台先发当前 `collectorEpoch` 与 `sessionNonce`；SW 重启后计数可能重置，用 nonce 区分新会话，不能只比数字。
- 测试：异步取源码 → 重置 → 旧回调；正常脚本不被丢弃；SW 重启/重新附着重同步。

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

---

## 十五、最终提升树与权威产物（N08、R23）

### 15.1 定向映射

每条记录：`file`、`start`、`end`、`oldToken`、`newToken`、`occurrenceIndex`、映射前上下文哈希、映射后上下文哈希。

- 逆映射只在记录位置执行，不做全局替换。
- 编辑导致偏移时，用编辑映射表更新位置；每个位置逆映射前用上下文哈希复核。
- 位置无法追踪、上下文不匹配、碰撞 → 停止；不得自动退回全局替换。

### 15.2 双向校验

1. 基线 → 中和 → 工作副本；记录每步哈希与位置。
2. 工作副本 → 逆映射 → 最终提升树。
3. 每个映射位置反向后的原文与基线逐字节相同；上下文哈希相同。
4. 未映射区域与工作副本逐字节相同。
5. 旧前缀/新前缀/其他前缀两两碰撞检测；新出现的相同前缀不得误逆映射。

### 15.3 最终权威产物

- 最终树：`<run>\out\promotion\<id>\tree`。
- 在外部副本对最终树重新构建；记录戳、产物集合、逐文件 SHA-256。
- **权威产物是最终树构建的产物**，不是中和树产物。
- 允许差异：仅登记的逆映射；其余逐字节相同。
- 逆映射改变构建输入时，戳必须变化；不得要求戳相同。
- 最终树未通过双向校验与最终构建验证，不得 P。

### 15.4 bundle 相同/不同

| 情形 | 处理 |
|---|---|
| 最终树 bundle 哈希 = 工作副本 bundle 哈希 | 可按哈希复用已取得的真机/一致性结果；记录相同哈希 |
| 最终树 bundle 哈希 ≠ 工作副本 | **必须**在最终 bundle 上重跑受影响的真机/一致性验收；不得继承旧结果 |
| bundle 无法比较 | 按“不同”处理，重跑 |

### 15.5 提升清单

逐文件：动作、提升前哈希、提升后哈希、出处阶段、是否映射文件。不含历史证据、旧报告、`registry.json`、`budget-ledger.json`、`node_modules`。

---

## 十六、执行身份与 W2（R25）

| 角色 | 身份 | 可写 | 不可写 |
|---|---|---|---|
| 实施执行 | `WENX\Administrator` | `<run>\sandbox`、`out`、`evidence`、`profiles`、`tmp`、`controls`、`gitdir` | 原项目、`baseline`（写后只读）、Codex 的 W2 根 |
| Codex 只读审查 | 沙箱账户 | 无 | 全部 |
| 构建/测试子进程 | 继承实施身份 | 启动器/守卫限制 | 同上 |
| 提升执行 | 授权管理员 | 原项目批准清单 | 其余 |

- W2-A：Codex 只读审查，无独立运行结果。
- W2-B：用户单独授权的执行者，在 `D:\P47RUN\w2-<id>` 独立根运行；不增加 Codex 写权限。
- 必须明确哪个阶段要求独立实跑、由谁完成；默认只读不能替代独立重放。
- 不扩权、不复用 V0 TEMP 例外。

---

## 十七、阶段路线（N09）

顺序固定：**0 → 3 → 1 → 2 → 4 → 5 → 6 → P**。

**统一规则：** 进入前只要求规则、范围、接口、必要决策已批准；实现阶段内；出口实际验证；阶段出口无条件等待用户与 Codex 批准，不得默认进入下一阶段。

### 17.1 Phase 0：基线、隔离、ACL、工具自测

| 项 | 内容 |
|---|---|
| 1. 进入条件 | 用户批准 Phase 0 范围并授权管理员；E1—E6 已写入；D14/D15 已批准；D6 必修范围确认。**不要求根/ACL/实验已完成。** |
| 2. 实施内容 | §4.1 第 3—9 步：根、探针、三副本、ACL、Codex 验证、M0/快照/副本核对、工具矩阵、实验、归档。 |
| 3. 验证项目 | 检测器对照；守卫读/写/FD/链接/原生矩阵；tsc/Vitest 原样与无插件；中和等价；预期拒写；M0/M1；第二归档。 |
| 4. 通过标准 | M0 两套哈希一致；保护范围无实质差异；三副本同源隔离；ACL 读回一致；Codex 读成功/写拒绝；矩阵通过；第二归档已提供。 |
| 5. 失败处理 | 矩阵/ACL/拒写不符：停止；意外写入：`unexpected-write`；无法解释差异：`source-unknown`；不得提权/换目录/关守卫。 |
| 6. 回滚范围 | 原项目未写；丢弃副本；证据/失败记录保留。 |
| 7. 输出证据 | M0/M1、归档、ACL、Codex 验证、矩阵、三副本、实验日志、Phase 0 报告。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 0；D1/D2/D11/D16 有决定；D13 可选整树归档；否则不得进入 Phase 3。 |

### 17.2 Phase 3：构建与测试卫生

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 0 批准；D1/D2/D11/D16 有决定；D13 可选。只要求规则/范围，不要求实现。 |
| 2. 实施内容 | 先修复制插件；顶层 worker；戳/旁清单；校验脚本；Vitest 不写 dist；D11/D16 若批准。 |
| 3. 验证项目 | A/B 独立构建/加载；双构建；绝对路径；旁清单/实际产物；五负例；Vitest 零写入；tsc。 |
| 4. 通过标准 | 产物逐文件哈希一致；集合相等；旁清单可信锚；无绝对路径；A/B 记录；D1 定案；不冒用旧 dist。 |
| 5. 失败处理 | 篡改未发现/不可复现/D1 未决：阶段失败；回滚 Phase 0 出口。 |
| 6. 回滚范围 | 工作副本恢复 Phase 0 出口；实验产物隔离归档，不删除唯一证据。 |
| 7. 输出证据 | 双构建、旁清单、戳、负例、A/B、测试。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 3；R01/R03/R05 规格评审通过；Phase 1 可实现。 |

### 17.3 Phase 1：状态机、结算、熔断、缓存

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 3 批准；R01/R03/R05 规格已按 §5—§8 评审通过；D3/D4 规则已批准（不要求实现）。 |
| 2. 实施内容 | 双 Promise；逻辑/尝试状态机；deferred；看门狗/重试；熔断计数/恢复；缓存；force；统计 gauges/counters。 |
| 3. 验证项目 | 事件表逐格；构造失败/崩溃/超时/取消/提交超时；熔断 3 次可达；恢复探针；缓存命中/超限；force；孤立代理项；守恒。 |
| 4. 通过标准 | `resultReady`/`completion` 各自一次；无永久 pending；熔断可达；deferred 边界；统计守恒；`hash-utils.ts` 未改。 |
| 5. 失败处理 | 任一格矛盾：阶段失败；需改受保护模块：停止上报；回滚 Phase 3。 |
| 6. 回滚范围 | Phase 3 出口；与 Phase 2 联合回滚点见 17.4。 |
| 7. 输出证据 | 状态表执行记录、故障注入、熔断/取消、缓存、身份、统计。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 1；Phase 2 接口冻结。 |

### 17.4 Phase 2：纪元、后台守卫、提交、捕获目标

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 1 批准；D5/D7 有决定或明确暂缓；D6 必修范围批准；D10 已批准。 |
| 2. 实施内容 | 共享 coordinator；pageEpoch/collectorEpoch/sessionNonce；迟到守卫；提交校验；刷新事务；URL；D5/D7 若批准；D10。 |
| 3. 验证项目 | 刷新竞态/重置/迟到/SW 重启；同 id 新对象；旧错误不覆盖；顺序；守恒；钩子九字段；捕获身份。 |
| 4. 通过标准 | 最新请求独占 currentState；刷新单飞；旧结果不提交；analyzed=committed；钩子严格；捕获带 URL/source/epoch。 |
| 5. 失败处理 | 竞态/钩子越界/合法脚本丢失：阶段失败；联合回滚。 |
| 6. 回滚范围 | Phase 1/2 联合恢复到 Phase 3 兼容快照；不只退 panel。 |
| 7. 输出证据 | 协调器单测、后台/SW、钩子、状态、捕获目标。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 2；R16/R18 规格评审通过；D8/D9 有决定/暂缓。 |

### 17.5 Phase 4：性能、渲染、deadline

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 2 批准；R16/R18 规格按 §7/§10 评审通过；D8/D9 有决定/暂缓；取证接口评审。**不要求工具已实现。** |
| 2. 实施内容 | 准备段：测试 DOM 身份/观察器/取证工具；正式段：无污染测量、三阶段、四耗时、50%、deadline、竞态；D9 若批准改 L1 闸门。 |
| 3. 验证项目 | R16 七类反例；deadline 全表；首败计入；completed/partial；50%；前后同口径。 |
| 4. 通过标准 | `render-completed` 带请求来源；目标可用；主线程样本 0；D8 若批准；50%；分类互斥；竞态 1×；失败披露。 |
| 5. 失败处理 | 渲染无法归属：`render-unverified`，不通过；50% 不达标：失败；D9 暂缓：`D9-deferred`。 |
| 6. 回滚范围 | Phase 2 出口；失败运行保留。 |
| 7. 输出证据 | 前后测量、DOM 属性/tick、四耗时、分类、完整输出、竞态、阈值。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 4；schema 规格冻结；D9 未批则 L1 后置。 |

### 17.6 Phase 5：四方完整一致性

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 4 批准；DiscoveryResultV1/CommittedCandidateSetV1 规格评审通过；不要求矩阵工具已实现。 |
| 2. 实施内容 | 两套 schema；四方矩阵；双哈希；深比较；浏览器落盘；降级标注。 |
| 3. 验证项目 | 四方各自 ordered/sorted；schema 不混用；深比较；孤立代理项；U+FFFD；嵌套；产品 Worker 哈希。 |
| 4. 通过标准 | 每输入两组哈希四方各自相等；浏览器=Node 复算；完整输出入档；不写 dist；降级明确。 |
| 5. 失败处理 | 任一不一致：逐项报告，不通过；降级只能降级结论。 |
| 6. 回滚范围 | Phase 4 出口；只测试/脚本。 |
| 7. 输出证据 | 两 schema 输出、双哈希、差异、矩阵、产物哈希。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 5；最终树规则可执行。 |

### 17.7 Phase 6：冻结、全量、最终提升树

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 5 批准；最终树/权威产物规则批准；D13 决定。 |
| 2. 实施内容 | 冻结；tsc noEmit；全量 Vitest；双构建；dist 校验；真机五项；最终树逆映射/重建/bundle 比较；报告/勘误/清单。 |
| 3. 验证项目 | 回归；构建；旁清单；安全指标；最终树双向；bundle 相同/不同重验；提升差异。 |
| 4. 通过标准 | 全部门槛；安全指标或 n/a（不自动通过）；最终树可追溯；提升清单完整；历史证据未变。 |
| 5. 失败处理 | 冻结后改源码：作废重跑；最终树未验证：不 P；bundle 不同未重验：不 P。 |
| 6. 回滚范围 | Phase 5 出口；失败证据保留。 |
| 7. 输出证据 | 冻结、测试、双构建、dist、真机、最终树、清单。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 6 与清单；新静默窗口；P 单独授权。 |

### 17.8 提升闸门 P

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 6 通过；最终树已验证；清单逐项批准；新静默窗口；原项目内容与 M0 相同。 |
| 2. 实施内容 | 只写批准清单；不写历史证据/旧报告/registry/台账/node_modules。 |
| 3. 验证项目 | 逆映射碰撞/双向/逐字节；清单/输入哈希/最终树产物；提升后逐文件/M0 差异/dist 摘要/证据摘要。 |
| 4. 通过标准 | 差异恰好等于清单；dist=最终树产物；历史证据不变；无绝对路径；无意外文件。 |
| 5. 失败处理 | 任一不符：停止；按日志回滚；记录元数据差异。 |
| 6. 回滚范围 | 逆序撤销/归档还原；记录“内容相同但 USN/ChangeTime 不同”。 |
| 7. 输出证据 | 清单、映射、碰撞、哈希、进度、提升后清单。 |
| 8. 下一阶段准入 | 无下一阶段；停止。是否重跑由用户另行决定。 |

### 17.9 待批准决策的分支

| 决策 | 未批准 | 后果 |
|---|---|---|
| D1 | 不选 A/B，只验证 | Phase 3 不关闭 |
| D2 | 不选戳位置 | Phase 3 不关闭 |
| D5 | 不做 UI 计数/日志 | 报告“未采用” |
| D7 | 不做退休筛选，只排身份失效 | 报告“未采用” |
| D8 | 可测不记通过 | Phase 4 不关闭性能 |
| D9 | `D9-deferred` | Phase 6 不声称 L1；L1 前必须决定 |
| D11 | 证据目录拒写检测 | 报告“未采用” |
| D13 | 整树归档 | 不阻塞 |
| D16 | 不改造脚本；实验入口显式路径 | 报告“未采用” |

---

## 十八、决策状态

| 决策 | 状态 | V4 处理 | 闸门 |
|---|---|---|---|
| D1 | 待批准 | 不选 A/B | Phase 3 |
| D2 | 待批准 | 戳位置待定 | Phase 3 |
| D3 | 已批准 | §3.1 | Phase 1 |
| D4 | 已批准 | §3.2、§10.3 | Phase 1/4 |
| D5 | 待批准 | 未批不做 UI | Phase 2 |
| D6 | 按 M6 必修 | §3.7、§8 | Phase 2 |
| D7 | 待批准 | 未批不筛退休 | Phase 2 |
| D8 | 待批准 | 未批不记通过 | Phase 4 |
| D9 | 待批准 | D9-deferred | Phase 4 |
| D10 | 已批准 | §3.3、§13 | Phase 2/4 |
| D11 | 待批准 | §14.4 | Phase 3 |
| D12 | 已批准 | §3.4、§15 | 全程/P |
| D13 | 待批准 | 整树归档 | Phase 0/3 |
| D14 | 已批准 | §3.5、§4 | Phase 0 |
| D15 | 已批准 | §3.6 | 全程 |
| D16 | 待批准 | 未批不改造 | Phase 3 |

---

## 十九、R01—R25 状态摘要

| 状态 | 数量 | 编号 |
|---|---|---|
| CLOSED | 11 | R02、R04、R06、R07、R08、R09、R11、R12、R13、R20、R24 |
| PARTIAL | 14 | R01、R03、R05、R10、R14、R15、R16、R17、R18、R19、R21、R22、R23、R25 |
| OPEN | 0 | — |

- **R01、R03、R16 从 OPEN 降为 PARTIAL**：设计已闭合，但实现/动态测试 `UNVERIFIED`；不升 CLOSED。
- **R13 保持 CLOSED**（第三轮已确认 gauges/counters 分离）。
- **CLOSED 11 项不增加**；不为了统计好看把 PARTIAL 升 CLOSED。

---

## 二十、尚未解决与 `UNVERIFIED`

### 20.1 待用户决定

D1、D2、D5、D7、D8、D9、D11、D13、D16；第二归档位置；W2-B 执行者/授权；日志导出时间；Phase 0 批准与提升批准。

### 20.2 `UNVERIFIED`

| 项 | 现状 | 验证时点 |
|---|---|---|
| R01 双 Promise/提交超时 | 设计，未实现 | Phase 1 |
| R03 熔断计数/恢复探针 | 设计，未实现 | Phase 1 |
| R16 DOM 请求属性/渲染状态 | 设计，未实现 | Phase 4 |
| 守卫 7 类读/写矩阵 | 设计 | Phase 0 |
| 原生进程边界 | 设计/限制 | Phase 0（不启动 Chrome） |
| ACL/Codex 读 | 未实测 | Phase 0 |
| 三副本隔离 | 设计 | Phase 0 |
| 插件写 dist 频次 | 未实测 | Phase 0 |
| A/B 加载 | 未实测 | Phase 3 |
| 旁清单可信锚/依赖 | 设计 | Phase 0/3 |
| 真实 panel 完整内容 | 未直采 | Phase 4/5 |
| 最终树 bundle | 未构建 | Phase 6/P |
| L1 根因 | UNKNOWN | 下一次 L1 前 |
| 22:48 事件来源 | UNKNOWN | 日志导出；不归因 |

### 20.3 不宣称

不宣称任何修复已实现/通过；不宣称 A/B 定案；不宣称 Phase 0 已具备；不宣称历史证据绝对未改；不宣称 `D:\P47RUN` 已存在；不宣称真实 panel 全文一致已验证。

---

## 二十一、E1—E6 对照

| 条件 | V4 位置 | 状态 |
|---|---|---|
| E1 初始化顺序 | §4.1（M0 先于测试；出口永远停） | 已落实 |
| E2 三副本 | §4.2 | 已落实 |
| E3 写入范围/预期/意外/删除归因通过 | §4.3、§14.2—14.3 | 已落实 |
| E4 读/写矩阵/原生边界/不启动 Chrome | §4.4 | 已落实 |
| E5 基线/第二归档 | §4.5 | 已落实，位置待用户 |
| E6 原项目只读 | §4.6 | 已落实 |

---

## 二十二、文档层自检摘要

详细见 `PHASE4.7-V4-SELFCHECK.md`。16 项中 12 PASS、4 PARTIAL（R01/R03/R16 设计已闭合但未实测；真实 panel 全文未直采），0 FAIL。PARTIAL 不冒充通过。

---

## 二十三、附录

| 输入 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| V3 候选 | 73389 | 1107 | `2ed0fce1…` |
| V3 追溯 | 10783 | 106 | `f43a6a3e…` |
| 第三轮审查 | 31184 | 359 | `ab92008f…` |

### 23.1 本轮声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第四轮独立审查；不自动进入 Phase 0。**
