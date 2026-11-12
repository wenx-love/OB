# OB-Recover Phase 4.7 Worker 整改方案 V5（正式候选）

> **文档性质：** 以 V4 正式候选为基础、按 Codex 第四轮独立审查（`ade4cb3b…`）完成 R01、R05 设计闭合与 Phase 0 书面准入补齐的 V5 正式候选。V4、V3、V2、V1、原始方案、四轮审查报告和全部历史证据一律保留，不覆盖、不改写。
>
> **本轮边界：** 只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0。
>
> **输入校验（均 MATCH）：**
>
> - `PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md`：59954 字节，1002 行，`a5d2d9b2fa124ea89987cf1c3f4583ea6afab1ab364155fa4a33e8e0f00355b3`
> - `PHASE4.7-V4-CODEX-FINDINGS-TRACEABILITY.md`：9945 字节，108 行，`258a8d3fcc795ad3e3aa466347169a77d337658fe5dd725b4457dcd43467b6f8`
> - `PHASE4.7-V4-SELFCHECK.md`：5588 字节，61 行，`a162b0a34399eef072562fc6e8ae1f0c4358f7fd5dcf5b6ec5cd089dc5128df8`
> - `CODEX-P47-V4-FOURTH-INDEPENDENT-REVIEW.md`：28193 字节，345 行，`ade4cb3b1336b545955fbe6f3955a2c0a573d0ac22b57748a8dba2edf96195dc`
>
> **证据标签：** `CONFIRMED` = 正文/源码/条款对照的直接支持；`INFERENCE` = 由设计推得的风险；`UNVERIFIED` = 未取得实测；`UNKNOWN` = 根因不明。所有“将/必须/应”都是执行要求，不是已发生结果。

---

## 一、版本关系与修订目标

### 1.1 与旧版的关系

| 文件 | 处置 |
|---|---|
| 原始方案、`rebuilt.md`、第一/二/三/四轮审查报告、V2/V3/V4 及其追溯与自检 | 全部保留，不改 |
| 本文件、V5 追溯表、V5 自检 | 新建；V5 作为第五轮审查对象 |

### 1.2 第四轮结论与 V5 定位

第四轮结论为 **APPROVED WITH CONDITIONS**：V4 可在补齐两项 Phase 0 书面条件后申请启动“仅限基线、隔离初始化、工具自测及副本对照”的 Phase 0；不是批准全流程实施。

第四轮按更严格口径重评：**0 CLOSED / 23 PARTIAL / 2 OPEN**，OPEN 为 **R01、R05**。V4 的“11 CLOSED”不被接受，因为设计完成但未动态验证的项目也必须记 PARTIAL。

V5 只做四件事：

1. 用统一 `finalizeRequest` 与逐路径矩阵闭合 R01 的双 Promise 取消/早期终态。
2. 恢复 V3 的无损源码身份、完整缓存键与非 force 去重规范，闭合 R05。
3. 补齐 Phase 0 的检测器自测顺序与禁止区读取判据。
4. 修正第四轮指出的 currentState 作用域、R16 纪元/逐卡 commit/零候选、R18 deadline 优先级、旁清单不得写入冻结 baseline 等 P1 条款。

**V5 状态：** 第四轮 0/23/2 → V5 **0 CLOSED / 25 PARTIAL / 0 OPEN**。R01、R05 从 OPEN 降为 PARTIAL（设计闭合，未实测）；不升 CLOSED。0 CLOSED 是严格口径的结果，不是设计回退。

---

## 二、第四轮问题与 V5 响应

| 第四轮问题 | V5 位置 |
|---|---|
| R01：deferred/retry-pending 取消未结束 resultReady；早期终态缺双 Promise 规则 | §5 `finalizeRequest` + 逐路径矩阵 |
| R05：V4 丢失 V3 无损身份/完整缓存键/非 force 去重 | §8.4 身份、缓存键、去重表完整恢复 |
| R16：旧纪元复用、逐卡 commitSeq、零候选自证 | §7 增加 pageEpoch/sessionNonce/commitToken、逐卡校验、零候选独立 token |
| R18：window-deadline 未进优先级、render-unverified 缺失、错误码当前/历史混用 | §10.5 完整优先级与错误码路由 |
| R13：completion 强绑脚本 currentState 与“旧请求不得覆盖”冲突 | §9.3 逻辑请求 state 与脚本 currentState 分离 |
| R15：旁清单写入冻结 baseline 冲突 | §12.2 改 append-only 信任锚目录 |
| E1：检测器自测与 M0 顺序冲突 | §4.1 检测器先自测，再权威 M0 |
| E4：禁止区读取“有日志即不失败” | §4.4 实际读取成功即 FAIL |
| R03：`ok:false` 可能代表内部异常；恢复探针超时未定义 | §6 健康回复限定 + 探针超时 |
| R19：schema 字段混入替换概念、schemaHash 未定义 | §13.4 真实类型/包络/hash 规则 |

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

## 四、Phase 0 执行契约（E1—E6，按第四轮修订）

Phase 0 只做：基线冻结、运行环境隔离、ACL 验证、工具自测、实验副本准备、插件对照、证据归档。**不实施 Phase 1—6 代码整改。**

### 4.1 E1：初始化顺序（检测器先于权威 M0）

1. 用户批准 Phase 0 范围（仅基线/隔离/工具自测）并授权管理员初始化。
2. 授权管理员以已批准身份执行初始化。
3. 创建 `D:\P47RUN\<run>`，同时创建探针目录、三个实验目录与 `trust` 信任锚目录。
4. 设置 ACL：`WENX\Administrator` 完全控制、`SYSTEM` 完全控制、`WENX\CodexSandboxUsers` 读取与执行、关闭继承、移除其他继承项。
5. 读回 ACL：SDDL、逐条 ACE、继承标志，与期望逐条比对。
6. Codex 只读验证：读哨兵成功；`acl-probe` 写哨兵拒绝。
7. **检测器初始化、自检与守卫验证**（见 §4.4）：加载检测器 → 自身完整性检查 → 安装守卫 → 假目录树阳性/阴性对照 → 预期拒写探针 → 禁止区读取测试 → 子进程边界测试。此步不接触原项目。
8. **权威 M0 + 来源快照 + 三副本派生与逐文件核对**：检测器通过后，才生成权威 M0、来源快照与三副本；逐文件核对后才允许产品实验。
9. **产品实验**：原样 `tsc`/Vitest、无插件对照、中和等价性、插件写自身 `dist` 的对照；全部在副本中。
10. 阶段报告；**无条件停止，等待用户与 Codex 审查批准**。下一阶段按路线是 Phase 3，不得默认进入。

**关键：** 检测器未通过前不得生成权威 M0，也不得开始产品实验；若先取临时 M0，必须在检测器通过后重取权威基线并记录差异。第 10 步没有“若要求才停”的例外。

### 4.2 E2：执行边界与三副本

- 三个副本来自**同一份哈希核验快照**；目录 `<run>\exp\pristine-<id>`、`<run>\exp\no-plugin-<id>`、`<run>\sandbox`；物理隔离、不共享可写目录。
- 每个副本记录：来源快照哈希、派生时间、目录、文件数、整树摘要、派生命令。
- 副本自带 `node_modules`/cache/TEMP/TMP/输出/profile；不得从原项目或链接加载可写依赖。
- 原项目不运行任何测试/构建；基线来自快照副本。
- 无插件副本不得把结果带回原样副本；中和副本不得把中和结果带回原样副本。

### 4.3 E3：允许写入、预期拒写与意外写入

**允许写入白名单（按对象与命令）：**

| 对象 | 读 | 写 | 说明 |
|---|---|---|---|
| 原项目 | 仅清单/归档工具按白名单读；产品测试**禁止读** | **禁止** | 不建目录、不改文件/ACL/属性 |
| `<run>\baseline` | 允许 | 只在建立时写一次，之后只读 | 检测器通过后才建立；后续旁清单不得写入 |
| `<run>\trust` | 允许 | 只追加、写一次、不发散 | 构建旁清单/信任锚；不得改写 |
| `<run>\sandbox` | 允许 | 允许（自身根内） | 历史证据子目录只读 |
| 三个实验副本 | 允许 | 允许（各自根内） | 插件写自身 `dist` 是**预期观察**，记录但不判违规 |
| `<run>\out`、`evidence`、`profiles`、`tmp`、`controls` | 允许 | 允许 | 新证据独占创建 |
| `<run>\acl-probe` | 允许 | 只允许登记探针写 | 预期拒绝测试 |
| 运行根之外 | 视对象 | **禁止** | 专用 TEMP/TMP 仅限 `<run>\tmp` |

**每命令可写路径：** 启动器在执行清单里逐条列出该命令允许写的目录；未列出的写入即意外写入。检测器自测的写入只允许发生在 `<run>\controls` 与 `<run>\acl-probe`，并登记为预期；不得写原项目、历史证据、冻结 baseline。

**预期拒写：** 只限登记探针；记录编号、对象、动作、预期、实际、时间、主体、命令 ID；未达预期按失败。

**意外写入：** 白名单之外，或保护区（原项目、历史证据、冻结 baseline、证据子目录）内的任何写入尝试/实际变化；立即停止、保留现场、报告 `unexpected-write`；不清理、不重跑覆盖、不关闭守卫、不换目录、不提权。

**删除“差异已归因即可通过”：** 原项目/历史证据/冻结 baseline 的任何实质差异都阻止阶段通过；归因只用于调查。只有事先声明的字段排除（如 LastAccessTime）或用户书面授权的例外可单独记录；授权例外不得覆盖历史证据。

### 4.4 E4：检测器顺序、守卫矩阵与禁止区读取判据

#### 4.4.1 检测器自测顺序（必须先于权威 M0）

1. **加载/初始化：** 记录检测器与守卫工具的文件哈希、版本、入口命令；初始化失败即 FAIL。
2. **自身完整性：** 复算工具哈希并核对已公布值；工具不得在自身目录外写入；任一不符即 FAIL。
3. **安装守卫：** 预加载守卫、设置允许根/禁止根；在工作进程做守卫标记探针；未进入工作进程即 FAIL 或按 §4.4.4 判 PARTIAL。
4. **假目录树对照：** 在 `<run>\controls` 做阳性/阴性对照（内容变化、增删、改名、同内容重写、时间/属性/ACL、ADS、硬链接）；对照未通过即 FAIL。
5. **预期拒写探针：** 在 `<run>\acl-probe` 触发登记拒写；逐条核对预期/实际；未达预期即 FAIL。
6. **禁止区读取测试：** 对原项目/历史证据/冻结 baseline 的专用哨兵发起读取；**读取成功即 FAIL**，不因有日志而通过。
7. **子进程边界：** Phase 0 不启动 Chrome；用 `cmd`/`node -e`/`esbuild` 在假目录测试；记录“Node 守卫不覆盖原生进程”；启动器必须拒绝越界目标；原生越界成功且无启动器阻止即 FAIL。Chrome/profile 继承测试留 Phase 3。
8. **判定：** 全部关键项通过 → PASS；非关键覆盖（如原生边界不可观测）缺失且有书面限制 → PARTIAL；任一关键项失败 → FAIL。

**关键项（FAIL 即停止）：** 检测器完整性、守卫安装/工作进程生效、假目录对照、预期拒写、禁止区读取、启动器越界拒绝。**非关键项：** 原生子进程的 OS 级不可写能力（当前方案不声称存在）。

#### 4.4.2 读/写覆盖矩阵

| # | 范围 | 输入/对象 | 预期 | 记录 | 失败条件 |
|---|---|---|---|---|---|
| 1 | 普通读 API | `readFile/open/read/createReadStream` 对允许区/禁止区 | 允许区成功；禁止区拒绝并记日志 | `guard-matrix-1.json` | 禁止区读取成功即 FAIL |
| 2 | 普通写 API | `write/append/rename/unlink/mkdir/rmdir/truncate/chmod/utimes` | 允许区成功；禁止区拒绝 | 同上 | 禁止区写入成功 |
| 3 | 已开 FD/FileHandle | 打开后读/写/截断；打开后目录改名 | 句柄按真实目标判定；改名不绕过 | 句柄生命周期 | 句柄读取/写入禁止区成功 |
| 4 | 复制源/目标 | 源允许/禁止 × 目标允许/禁止 | 读禁止源拒绝；写禁止目标拒绝 | 逐调用源/目标 | 任一禁止侧成功 |
| 5 | 链接/别名 | 符号链接、硬链接、`realpath`、`\\?\`、8.3、`subst` | 解析真实路径后判定 | 别名+真实路径 | 别名读取/写入禁止区成功 |
| 6 | 原生子进程 | 非 Chrome 的 `cmd`/`node -e`/`esbuild` | 记录守卫不覆盖；启动器拒绝越界；不声称 OS 级写拒绝 | 进程/命令行/结果 | 越界成功且启动器未阻止 |
| 7 | 环境/工作进程 | `NODE_OPTIONS`、`TEMP/TMP`、`cwd`、Vitest worker、`worker_threads`、`fork` | 守卫/专用临时目录继承；工作进程生效或登记偏差 | 环境快照+标记 | 工作进程未生效且未登记 |

#### 4.4.3 禁止区与“实际读取”的判据

**禁止区：** 原项目（`D:\Projects\ob-recover`）、历史验收证据、冻结 baseline、其他用户目录、系统目录、网络共享、运行根之外的非授权位置。**允许读原项目的只有清单/归档工具**，按命令白名单；隔离产品测试不得回读原项目。

**实际读取（内容读取）的判定：**

- `open` + `read`/`readFile`/`createReadStream` 返回了禁止区文件的内容字节。
- `FileHandle.read` 通过已打开 FD 返回内容字节；FD 的目标按真实路径判定。
- `copyFile`/`cp` 的**源**在禁止区：读取源即实际读取；即使目标是允许区也算违规。
- 通过符号链接、硬链接、`realpath` 别名、`subst`、8.3 短名读取到禁止区内容。
- 子进程读取禁止区内容：如可观测（审计/探针/文件访问记录）即违规；不可观测时记录“未覆盖”，不得写成通过。
- 内存映射、共享内存等未列入的读取方式：标 `UNVERIFIED`，不得宣称覆盖。

**不算内容读取：** 目录元数据查询（`stat` 只取属性、`readdir` 只取名字）不算内容读取，但必须记录为“元数据查询”；`readdir` 返回文件名不等于读取文件内容。清单/归档工具读取原项目文件内容属于允许读取，必须登记工具、路径、命令与用途。

**记录与停止：** 每次读取尝试记录：路径、真实路径、方式（API/FD/复制/链接/子进程）、预期、实际、时间、主体、命令 ID。**禁止区内容读取成功即 FAIL**，即使有日志、即使能解释原因；不得用“差异已归因”豁免。失败时保留现场与证据哈希。

#### 4.4.4 PASS / PARTIAL / FAIL

| 结果 | 条件 |
|---|---|
| PASS | 关键项全部通过；无禁止区内容读取成功；预期拒写全部符合；守卫在工作进程生效；原生边界限制已记录 |
| PARTIAL | 关键项通过，但非关键覆盖（如原生进程不可观测）缺失，且有书面限制；PARTIAL 不得用于依赖该覆盖的实验，也不得声称完整守卫 |
| FAIL | 任一关键项失败、任一禁止区内容读取成功、守卫未安装/未生效、检测器完整性不符、预期拒写未达预期 |

## 五、R01：双 Promise 与统一终态结算

### 5.1 四个阶段

| 阶段 | 事件 | 逻辑状态 | Promise | 证据 |
|---|---|---|---|---|
| A Worker 成功返回 | 回复到达 | 尝试 `replied-success`；逻辑仍 `executing` | 不结算 | attemptId/回显匹配 |
| B 主线程收到并接受 | 客户端校验信封/缓存 | `awaiting-commit` | `resultReady` 结算 | requestId、sourceSha256、cacheSeq |
| C 面板接受并提交 | commitResult/rejectCommit | `committed`/`commit-rejected` | `completion` 结算 | D10 九字段、commit token |
| D 最终结算 | 终态记录 | 终态 | `completion` 已结算 | 终态审计 |

**核心：** Worker 成功 ≠ 主线程收到 ≠ 面板提交 ≠ 最终结算。

### 5.2 `finalizeRequest` 统一规则

任一终态（成功提交、提交拒绝、提交超时、取消、纪元、dispose、熔断、构造失败、第二次失败、未受理拒绝、缓存解析失败）都必须调用：

1. 若请求已终态：no-op，记录重复调用。
2. 若 `resultReady` 尚未结算：
   - 成功且可提交：以 `outcome.result` 结算；
   - 其他一切：以 `{kind:'error', code}` 结算（`cancelled`、`breaker-open`、`worker-unavailable`、`watchdog-…`、`commit-timeout`、`rejected-…`）。
3. 若 `resultReady` 已结算：**不改写**，只继续。
4. 置逻辑请求终态；`completion` 以对应结果结算一次。
5. 清 ack 计时器、等待者数组、请求索引、deferred/retry 引用。
6. 只有最新 `requestSeq` 才更新脚本 `currentState`；旧请求只更新自己的终态与历史计数。
7. 批量取消期间不 `pump`；普通终态可 `pump` 下一个。

### 5.3 逐路径结算矩阵

| # | 进入状态 | 触发事件 | resultReady | completion | 资源释放 | 再调度 |
|---|---|---|---|---|---|---|
| 1 | `deferred` | cancelAll/纪元 | 未结算则 resolve error `cancelled` | `cancelled` | 清等待者/索引/ref | 取消期间否；结束后可 |
| 2 | `deferred` | 熔断打开 | 未结算则 resolve error `breaker-open` | `failed(breaker-open)` | 清等待者/索引/ref | 否，待恢复 |
| 3 | `retry-pending` | cancelAll/纪元 | 未结算则 error `cancelled` | `cancelled` | 清重试计划/等待者 | 取消期间否 |
| 4 | `retry-pending` | 熔断打开 | 未结算则 error `breaker-open` | `failed(breaker-open)` | 清重试计划 | 否，待恢复 |
| 5 | `executing` | 首次看门狗 | 保持 pending | 保持 pending | 清旧看门狗；换 attempt | 是（重试一次） |
| 6 | `executing` | 第二次看门狗 | error `watchdog-timeout-retry-exhausted` | `failed(...)` | 清看门狗/等待者 | 是（同一逻辑请求结束后） |
| 7 | `executing` | 首次崩溃/协议错/发送失败 | 保持 pending | 保持 pending | 清旧处理器/看门狗 | 是（重试一次） |
| 8 | `executing` | 第二次崩溃/协议错/发送失败 | error `worker-crashed-retry-exhausted`/`protocol-error-retry-exhausted` | `failed(...)` | 清处理器/看门狗 | 是 |
| 9 | `executing` | cancelAll/纪元 | error `cancelled` | `cancelled` | terminate Worker、清处理器/看门狗/等待者 | 取消期间否 |
| 10 | `deferred`（构造前） | 构造失败 | error `worker-unavailable` | `failed(worker-unavailable)` | 无 attempt；清 ref | 是（若未熔断） |
| 11 | 未受理 | 容量/超预算/关闭 | error `deferred-full`/`source-too-large`/`closed` | `rejected(...)` | 无 | 否 |
| 12 | 缓存命中（成功） | 客户端交付 | resolve 缓存结果 | 保持 pending（等提交） | 新请求 id/seq/ack；无 attempt | 是 |
| 13 | 缓存命中（解析失败） | 客户端交付 | resolve `analysis-failed` | `analysis-failed` | 无 attempt；无 ack | 是 |
| 14 | `awaiting-commit` | commitResult 成功 | 已交付，不改写 | `committed` | 清 ack 计时器/等待者 | 是 |
| 15 | `awaiting-commit` | rejectCommit/校验失败 | 已交付，不改写 | `commit-rejected` | 清 ack 计时器/等待者 | 是 |
| 16 | `awaiting-commit` | 提交超时（10s） | 已交付，不改写 | `failed(commit-timeout)` | 清 ack 计时器/等待者；迟到提交忽略 | 是 |
| 17 | `awaiting-commit` | cancelAll/纪元/dispose | 已交付，不改写 | `cancelled` | 清 ack 计时器/等待者 | 取消期间否；dispose 永久否 |
| 18 | 任意非终态 | dispose | 未结算则 error `cancelled`；已结算不改写 | `cancelled` | 先置 `disposed=true`，再全清；永不再调度 | 否 |
| 19 | 任意终态 | 重复 cancel/commit | 不改写 | 不改写（no-op） | 已释放 | 不变 |
| 20 | 任意终态 | 迟到 commit/迟到事件 | 不改写 | 不改写 | 记日志 | 不变 |

### 5.4 关键规则

- `resultReady` 最多结算一次；`completion` 最多结算一次；终态时两者都必须已结算（`resultReady` 为结果或错误）。
- 提交超时从 `resultReady` 交付时开始计时；提交与超时同轮只有一个胜者。
- 缓存命中必须创建**新的逻辑请求 id/requestSeq/ack 计时器**，不得复用旧请求。
- `dispose` 先置 `disposed=true`，再执行取消；已终态不重写。
- 旧请求 `completion` 结算不得强制脚本 `currentState` 变终态；只有最新 `requestSeq` 可以更新脚本状态（§9.3）。
- 不允许“最多一次”代替“至少一次”；所有终态必须显式走 `finalizeRequest`。

### 5.5 不变量

1. 每个逻辑请求 `resultReady` 与 `completion` 各结算一次。
2. 终态时无 pending Promise。
3. 取消/熔断/dispose/拒绝/早期失败都不得留下未结算的 `resultReady`。
4. 旧事件/迟到提交不改写终态。
5. 缓存命中不创建 attempt、不启 D4 看门狗。

## 六、R03：熔断计数、健康回复与恢复探针

### 6.1 计数规则

| 事件 | 计数 | 说明 |
|---|---|---|
| 构造 Worker 失败 | ++ | 无 attempt |
| `onerror` | ++ | Worker 级 |
| `messageerror` | ++ | Worker 级 |
| `postMessage` 抛错 | ++ | Worker 级 |
| `protocol-error`（信封无效） | ++ | Worker 级 |
| `ok:false` 且 `errorKind='internal'` | ++ | Worker 内部异常，按 Worker 级失败；不缓存 |
| 看门狗超时 | **不计入** | 单独 `watchdogTrips` |
| `ok:false` 且 `errorKind='parse'` | **不计入** | 经信封校验的确定性解析失败，证明 Worker 健康执行 |
| 提交校验失败 | **不计入** | 面板层 |
| 用户取消 | **不计入** | — |

**健康回复定义：** 回复与 `attemptId`/`requestId` 匹配，信封字段（scriptId、sourceLength、sourceSha256）一致，且满足以下之一：

- `ok:true`；或
- `ok:false` 且 `errorKind='parse'`（确定性解析失败）。

只有健康回复才清零 `consecutiveWorkerFailures`。构造成功不清零；`ok:false` 内部异常不清零且计失败。

### 6.2 累计、重试与熔断

- 每次尝试失败按上表计数；一次重试失败再计一次。
- 计数达到 3（阈值不变）立即打开熔断，即使当前请求还有重试额度；当前请求按 `failed(breaker-open)` 结算（`finalizeRequest` 同时结束两个 Promise）。
- 熔断打开时：
  - `executing`：尝试结算；逻辑 `failed(breaker-open)`。
  - `retry-pending`：清重试计划；`failed(breaker-open)`。
  - `deferred`：清引用；`failed(breaker-open)`。
  - `awaiting-commit`：保留；提交不依赖 Worker，可继续 commit/reject/超时。
  - 等待者随逻辑请求结算。
- 任何进入 `failed` 的路径都必须走 `finalizeRequest`，不得只结束 `completion`。

### 6.3 恢复探针

- 触发：`refresh`、新纪元、`cancelAll`、显式重置。
- 动作：`breakerOpen=false`，`recovering=true`，保留 `consecutiveWorkerFailures` 在阈值。
- 下一次 Worker 尝试是探针：
  - 健康回复 → 计数清零、`recovering=false`，恢复正常调度。
  - 任一 Worker 级失败 → 计数保持/增加，立即重新熔断。
- **探针看门狗：** 按 D4 规则重试 1 次，但超时**不增加** Worker 失败计数。两次都超时 → `recovering=false`、`breakerOpen=true`，不自动继续调度；必须再次 refresh/新纪元才能重试探针。记录 `breaker-probe-timeout`。
- 探针失败/超时不得静默；面板显示。
- 恢复标志不得改变请求归属；旧请求仍按自己的 requestSeq 结算。

### 6.4 不变量

1. 连续 3 次 Worker 级失败必然熔断。
2. 构造成功不清零。
3. 看门狗不增加熔断计数。
4. 熔断后无需要 Worker 的 pending 请求。
5. 恢复必须经过健康回复或明确的探针超时终止。
6. 所有早期 `failed` 都经 `finalizeRequest` 结束双 Promise。

## 七、R16：真实面板渲染完成判据

### 7.1 问题

内容签名没有请求来源；同签名旧卡、其他脚本同签名卡、整表重建、同内容刷新、零候选、旧纪元复用都会造成假通过或假失败。V4 的 `requestSeq/commitSeq` 仍缺纪元与会话边界，且未要求逐卡 commit 一致、零候选独立 token。

### 7.2 测试专用 DOM 身份（仅在 `?obTest=1`）

| 位置 | 属性 | 含义 |
|---|---|---|
| 每个 `.decoder-card` | `data-obtest-script-id` | 来源脚本 |
| 每个 `.decoder-card` | `data-obtest-request-seq` | 来源请求 |
| 每个 `.decoder-card` | `data-obtest-page-epoch` | 页面纪元 |
| 每个 `.decoder-card` | `data-obtest-session-nonce` | 会话 nonce |
| 每个 `.decoder-card` | `data-obtest-commit-token` | 该卡所属提交 token（epoch + sessionNonce + commitSeq） |
| `#decoder-list` | `data-obtest-render-tick` | 完整渲染快照完成后递增 |
| `#decoder-list` | `data-obtest-render-commit-token` | 本次完整快照覆盖的最新提交 token |
| `#decoder-list` | `data-obtest-render-epoch` / `data-obtest-render-session` | 容器所属纪元/会话 |

- 只在测试模式存在；不返回内容；不是 D10 字段。
- `commitToken` 必须由 `pageEpoch + sessionNonce + 单调 commitSeq` 组成，跨文档/会话不复用。
- 每张计入卡必须与目标 `commitToken` **完全相同**；只比数量不够。
- `render-tick` 只在整次渲染快照完成后发布，不能在开始渲染时发布。

### 7.3 渲染状态

| 状态 | 判定 |
|---|---|
| `render-completed` | 目标 `commitToken` 的卡片数 = `committedCandidates`；每张目标卡 commitToken 完全相同；容器 `render-commit-token` = 目标 token；提交后 tick 递增；零候选时卡片数=0 且 token/tick 条件满足；旧目标 token 卡已清除 |
| `render-partial` | 0 < 目标 token 卡片数 < `committedCandidates` |
| `render-failed` | 目标 token 卡片数 > `committedCandidates`；或存在目标请求的错误 token 卡；或完整快照未发布却发布成功 token |
| `render-timeout` | 截止时仍未达到 `render-completed`，且无成功 token |
| `render-unverified` | 测试属性不可用/观察器未在提交前安装/无法独立取得目标 token |

**零候选的独立来源：** 目标 `commitToken` 必须来自 D10 的目标记录（requestSeq + committedCandidates=0）与协调器的 commit 记录，不得用待检容器自己的 `render-commit-token` 自证。容器 token 必须等于该独立 token，且 tick 在提交后递增；旧目标 token 卡必须已清除。

### 7.4 必测反例

1. 旧同签名卡（旧 token）保留 → 不得通过；旧 token 卡必须被清除或不计入。
2. 其他脚本同签名卡 → 按 scriptId/token 排除。
3. 同内容刷新（整表清空重建）→ tick 只在完整快照后递增；目标 token 匹配则通过。
4. 零候选 → 独立 token + tick + 旧卡清除；缺一即不得通过。
5. 部分渲染 → partial。
6. 渲染超时/中断 → 未发布成功 token 前保持 pending；截止唯一归 timeout。
7. 旧纪元/旧会话复用 requestSeq → pageEpoch/sessionNonce/token 必须拒绝。
8. 逐卡 token 不一致 → failed。

### 7.5 与 D10/产品边界

- D10 仍只返回九字段；DOM 属性不返回内容。
- 测试属性是新增产品观测代码，必须在 Phase 2/4 实施范围中明确接受，不因“不是 D10”自动扩张。
- 若用户不接受测试属性：`render-unverified`，Phase 4 不得签发渲染通过；R16 保持 PARTIAL/OPEN 视审查而定。

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

### 8.4 R05：无损源码身份、缓存键与去重

#### 8.4.1 三种身份不能混用

| 概念 | 用途 | 规则 |
|---|---|---|
| 字节计量 | D3 deferred 预算、D4 看门狗 | 源码按 UTF-8 编码后的字节数 |
| 源码身份 | 缓存/去重是否同一份源码 | 无损编码：UTF-16LE 码元序列的 SHA-256 + 原始字符串全等 |
| 请求身份 | 一次分析意图 | `pageEpoch + sessionNonce + scriptId + requestSeq` |

**SourceIdentityV1：**

- `source`：原始 JavaScript 字符串（保留，用于全等比较）。
- `utf16Length`：UTF-16 码元数。
- `sha256Utf16Le`：把每个 UTF-16 码元写成 2 字节小端，再算 SHA-256。
- `isWellFormed`：无孤立代理项。
- `sha256Utf8`：仅用于 D3/D4/展示，不得作为唯一身份。
- 两个孤立代理项、真实 U+FFFD 必须由 UTF-16LE 与原串全等区分。

#### 8.4.2 缓存键 `CacheKeyV1`

```text
cacheKey = hash(
  pageEpoch
  | sessionNonce
  | scriptId
  | scriptUrl            // 原样字符串，不归一化
  | sha256Utf16Le
  | analyzerVersion
  | optionsHash
)
```

- 命中后必须再校验 `entry.source === 当前 source`；哈希只做索引。
- `scriptId` 是 CDP 身份；`scriptUrl` 是 URL 身份；`pageEpoch/sessionNonce` 是页面/会话生命周期；`analyzerVersion/optionsHash` 是分析语义。
- 同 scriptId、不同源码 → 不同键；同源码、不同 URL → 不同键；同源码、不同页面/会话 → 不同键。
- 纪元变化清空缓存；源码变化新键；旧键按 LRU 淘汰。

#### 8.4.3 去重键 `ActiveKeyV1`

- 同步占位键：`scriptId | scriptUrl | utf16Length | forceFlag | placeholderSeq`。
- 占位值保存 `source` 引用与 `requestSeq`；只有 `source` 全等才允许合并等待者。
- 异步 `sha256Utf16Le` 完成后重键为 `CacheKeyV1`；重键时再次检查 `forceFlag`、`placeholderSeq`、原串全等，任一不符则不合并。
- 非 force 合并：同 `pageEpoch/sessionNonce/scriptId/url/source/options/version` → 一个逻辑请求，等待者挂同一 `resultReady`/`completion`。
- force：**永不合并**（与非 force 不合并，force 之间也不合并）；创建新逻辑请求与更高 `requestSeq`；旧请求继续，但只有最新请求更新脚本 `currentState` 与缓存。

#### 8.4.4 去重规则表

| 情形 | 同页面/会话 | 同 scriptId | 同源码 | 同 URL | force | 动作 |
|---|---|---|---|---|---|---|
| A | 是 | 是 | 是 | 是 | 否 | 合并为一个逻辑请求，等待者共享 |
| B | 是 | 是 | 否 | 是 | 否 | 不同键，新请求；最新 requestSeq 更新脚本状态 |
| C | 是 | 是 | 是 | 否 | 否 | 不同键（URL 身份不同），新请求 |
| D | 否 | 是 | 是 | 是 | 否 | 不同键（页面/会话不同），新请求 |
| E | 任意 | 任意 | 任意 | 任意 | 是 | 永不合并；新请求；旧请求继续 |
| F | 是 | 是 | 是 | 是 | 是+否 | 不合并；force 绕过缓存读取，独立分析 |
| G | 任意 | 任意 | 任意 | 任意 | 任意 | 缓存命中仍创建新请求 id/seq/ack，不复用旧请求 |

#### 8.4.5 缓存命中、失效与淘汰

- 非 force 命中：交付缓存结果；不建 attempt、不启 D4 看门狗；新请求 id/seq；成功结果进入 `awaiting-commit`，解析失败直接终态。
- force：跳过缓存读取，重新分析；成功且 `requestSeq >= entry.requestSeq` 才写缓存。
- 缓存容量：128 条 / 32 MiB（UTF-8 `resultBytes` 估算）；单条超限跳过；LRU 不足跳过；缓存异常不失败分析；纪元变化清空。
- 失败缓存只限 `errorKind='parse'` 的确定性解析失败；基础设施/超时/崩溃/取消/熔断/拒绝不缓存。
- 缓存淘汰不改变已提交的面板结果；缓存只是复用优化。

#### 8.4.6 不得修改受保护文件

`src/core/hash-utils.ts` 保持原口径；`sha256Utf16Le` 放在非受保护的身份工具/客户端模块中，不得以后者替换前者。

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

### 9.3 两级状态：逻辑请求与脚本 `currentState`

| 概念 | 范围 | 归属 |
|---|---|---|
| 逻辑请求 `state` | 一次分析意图（`requestSeq`） | 该请求自身；结束即终态 |
| 脚本 `currentState` | 当前页面上该脚本的最新状态 | 只有最新 `requestSeq` 可更新 |

规则：

1. 旧请求 `completion` 结算时，只把自己的逻辑请求置终态；**不得**强制脚本 `currentState` 变终态。
2. 只有该脚本最新的 `requestSeq` 的提交/取消/失败可以更新脚本 `currentState`。
3. 反例：旧 P 在 `executing`，新 force F 成为最新并 `deferred`；P 结束时脚本 `currentState` 必须仍是 F 的 `deferred`，不能变成 P 的终态。
4. 旧请求的失败/取消只进历史 counters；不改变当前状态守恒式。
5. 页面重置清空当前集合；旧回调不得把旧脚本加回。

**终态映射（对逻辑请求）：**

| 结果 | 请求终态 | `analyzed` |
|---|---|---|
| 提交成功 | `committed` | true（且为最新请求） |
| 提交拒绝 | `commit-rejected` | false |
| 解析失败 | `analysis-failed` | false |
| 基础设施/提交超时 | `failed` | false |
| 未受理 | `rejected` | false |
| 取消/纪元 | `cancelled` | false |

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
| `executing` | **当前尝试**错误码 `watchdog-*` | `target-executing-timeout` | `execution-timeout` |
| `executing` | 其他 | `target-executing` | `window-deadline-during-execution` |
| `awaiting-commit` | 提交超时 | `target-commit-timeout` | `commit-timeout` |
| `awaiting-commit` | 其他 | `target-awaiting-commit` | `commit-pending-timeout` |
| `analysis-failed` | — | `target-analysis-failed` | `target-failed` |
| `commit-rejected` | — | `target-commit-rejected` | `target-failed` |
| `committed` | `render-completed` | `target-rendered` | `completed`/`partial`/`other-script-failed` |
| `committed` | `render-partial` | `target-render-partial` | `render-partial` |
| `committed` | `render-failed` | `target-render-failed` | `render-failed` |
| `committed` | `render-timeout` | `target-render-timeout` | `render-timeout` |
| `committed` | `render-unverified` | `target-render-unverified` | `render-unverified` |
| `failed` | 错误码 `worker-unavailable`/`breaker-*`/`*-crashed-*`/`protocol-*` | `target-infrastructure-failed` | `infrastructure-failed` |
| `failed` | 错误码 `watchdog-*`（当前尝试） | `target-execution-timeout` | `execution-timeout` |
| `failed` | 错误码 `commit-timeout` | `target-commit-timeout` | `commit-timeout` |
| `rejected` | — | `target-rejected-at-admission` | `target-rejected` |
| `cancelled` | — | `target-cancelled` | `cancelled` |

**运行层优先级（互斥，从高到低）：**

1. `setup-failed`（目标缺失/不唯一/哈希不符/观察器未安装/未提交）
2. `target-rejected`
3. `cancelled`
4. `infrastructure-failed`
5. `execution-timeout`
6. `retry-wait-timeout`
7. `queue-wait-timeout`
8. `window-deadline-during-execution`
9. `render-failed`
10. `render-partial`
11. `render-timeout`
12. `render-unverified`
13. `commit-timeout`
14. `commit-pending-timeout`
15. `target-failed`
16. `other-script-failed`
17. `partial`
18. `completed`

**关键规则：**

- `watchdog-*` 只看**当前尝试**；首次超时后第二次正常执行，不得沿用旧错误码判 `execution-timeout`。
- `render-failed` 表示“已发布错误/不完整 token 或 token 不一致”；`render-timeout` 表示“截止前没有成功 token”；二者不得重叠。等待中的渲染是 pending，截止时才唯一归 timeout。
- `render-unverified` 不是通过；Phase 4 不得签发渲染通过。
- 目标观察终点是目标 `render-completed`；**整次运行终点**是全部非故障注入脚本到达终态或总截止；不能在目标完成时提前终止全任务验证。
- `completed` 要求所有非故障注入脚本 `committed` 且 `render-completed`（零候选同样满足），且无失败/拒绝/取消；`all-terminal` 不等于通过。
- `partial` 只允许“目标完成、其他脚本仍未终态且未失败”的局部结论；其他脚本失败 → `other-script-failed`，不得用 partial 吞掉。

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

### 12.2 验证五项与可信锚

1. 戳的输入哈希与当前源码逐文件一致。
2. 旁清单 Worker 名与实际产物一致。
3. 旁清单文件集合与实际 `dist` 完全相等。
4. 每实际产物 SHA-256 与旁清单相等。
5. 无主线程 `discoverDecoders(`；四入口齐全；Worker 格式与构造匹配。

**可信锚不得写入冻结 baseline：** 旁清单一生成，计算自身 SHA-256，写入 `<run>\trust\build\<id>\artifacts.json`（append-only，写一次，不改写），并把哈希写入阶段回复/证据索引。`<run>\baseline` 在 M0 后只读，不接收后续构建清单。校验时先核对 `trust` 旁清单自身哈希，再核对实际产物；产物与旁文件一起被替换时仍能用已公布哈希发现。

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

### 17.1 Phase 0：检测器、基线、隔离、工具自测

| 项 | 内容 |
|---|---|
| 1. 进入条件 | 用户批准 Phase 0 范围并授权管理员；E1—E6 已写入；D14/D15 已批准；D6 必修范围确认。**不要求根/ACL/实验已完成。** |
| 2. 实施内容 | §4.1 十步：根/探针/三副本/trust；ACL；Codex 验证；检测器初始化/完整性/守卫/假树对照/预期拒写/禁止读/子进程；权威 M0/快照/三副本核对；产品实验；报告。 |
| 3. 验证项目 | 检测器 PASS/PARTIAL/FAIL；守卫读/写/FD/链接/原生矩阵；禁止区读取成功即 FAIL；M0/M1；三副本；ACL；第二归档。 |
| 4. 通过标准 | 检测器 PASS；无禁止区内容读取成功；M0 两套哈希一致；保护范围无实质差异；三副本同源隔离；ACL 读回一致；Codex 读成功/写拒绝；第二归档已提供。 |
| 5. 失败处理 | 检测器 FAIL/禁止读成功/ACL 不符/意外写入：停止；不得提权/换目录/关守卫/归因豁免。 |
| 6. 回滚范围 | 原项目未写；丢弃副本；证据/失败记录保留。 |
| 7. 输出证据 | 检测器报告、矩阵、M0/M1、归档、ACL、三副本、实验日志、Phase 0 报告。 |
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

第四轮独立重评为：**0 CLOSED / 23 PARTIAL / 2 OPEN**（OPEN 为 R01、R05）。V5 只闭合 R01、R05 的设计缺口，因此：

| 状态 | 数量 | 编号 |
|---|---|---|
| CLOSED | 0 | — |
| PARTIAL | 25 | R01—R25 全部 |
| OPEN | 0 | — |

**说明：**

- **R01：OPEN → PARTIAL。** §5 的 `finalizeRequest` 与逐路径矩阵已覆盖 deferred/retry-pending/取消/熔断/构造失败/提交超时/缓存命中/重复取消；但未实现、未跑并发与故障注入，不能升 CLOSED。
- **R05：OPEN → PARTIAL。** §8.4 恢复 UTF-16LE 无损身份、原串全等、完整 `CacheKeyV1`/`ActiveKeyV1`、force 隔离与非 force 合并；但未实现、未跑孤立代理项与并发去重，不能升 CLOSED。
- **其余 23 项保持 PARTIAL。** 第四轮已明确：设计方向正确但动态结果 `UNVERIFIED` 的条目，按本轮更严格口径仍记 PARTIAL；V5 不把任何一项升 CLOSED，也不为了统计好看降低标准。
- **OPEN 为 0** 仅表示没有“按现文可直接构造的设计矛盾”被保留；不表示实现、并发、权限或性能已经通过。

---

## 二十、尚未解决与 `UNVERIFIED`

### 20.1 待用户决定

D1、D2、D5、D7、D8、D9、D11、D13、D16；第二归档位置；W2-B 执行者/授权；管理员日志导出时间；Phase 0 批准与提升批准；`COMMIT_ACK_TIMEOUT_MS` 作为 Phase 1 技术参数的确认。

### 20.2 `UNVERIFIED`

| 项 | 现状 | 验证时点 |
|---|---|---|
| R01 双 Promise/取消/熔断/提交超时 | 设计，未实现 | Phase 1 |
| R05 无损身份/缓存/去重/force | 设计，未实现 | Phase 1 |
| 检测器自测顺序/禁止区读取 | 设计 | Phase 0 |
| 守卫读/写/FD/链接/原生矩阵 | 设计 | Phase 0（不启动 Chrome） |
| ACL/Codex 读 | 未实测 | Phase 0 |
| 三副本隔离 | 设计 | Phase 0 |
| 插件写 dist 频次 | 未实测 | Phase 0 |
| A/B 加载 | 未实测 | Phase 3 |
| R16 DOM token/零候选 | 设计，未实现 | Phase 4 |
| R18 deadline 优先级 | 设计，未实测 | Phase 4 |
| R15 旁清单/依赖/trust | 设计 | Phase 0/3 |
| R19 两 schema/schemaHash | 设计 | Phase 5 |
| 真实 panel 全文 | 未直采 | Phase 4/5 |
| 最终树 bundle | 未构建 | Phase 6/P |
| L1 根因 | UNKNOWN | 下一次 L1 前 |
| 22:48 事件来源 | UNKNOWN | 日志导出；不归因 |

### 20.3 不宣称

不宣称任何修复已实现/通过；不宣称 R01/R05 已 CLOSED；不宣称 Phase 0 已具备；不宣称历史证据绝对未改；不宣称 `D:\P47RUN` 已存在；不宣称真实 panel 全文一致。

---

## 二十一、E1—E6 对照

| 条件 | V5 位置 | 状态 |
|---|---|---|
| E1 初始化顺序/检测器先于 M0 | §4.1、§17.1 | 已落实 |
| E2 三副本 | §4.2 | 已落实 |
| E3 写入范围/预期/意外/删除归因通过 | §4.3、§14.2—14.3 | 已落实 |
| E4 检测器顺序/读矩阵/禁止读判据/不启动 Chrome | §4.4 | 已落实 |
| E5 基线/第二归档/trust 分离 | §4.5、§12.2 | 已落实，位置待用户 |
| E6 原项目只读 | §4.6 | 已落实 |

---

## 二十二、文档层自检摘要

详细见 `PHASE4.7-V5-SELFCHECK.md`。16 项中 12 PASS、4 PARTIAL（R01/R05/R16/R18 未实测），0 FAIL。PARTIAL 不冒充通过；0 CLOSED 是严格口径的结果。

---

## 二十三、附录

| 输入 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| V4 候选 | 59954 | 1002 | `a5d2d9b2…` |
| V4 追溯 | 9945 | 108 | `258a8d3f…` |
| V4 自检 | 5588 | 61 | `a162b0a3…` |
| 第四轮审查 | 28193 | 345 | `ade4cb3b…` |

### 23.1 本轮声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第五轮独立审查；不自动进入 Phase 0。**
