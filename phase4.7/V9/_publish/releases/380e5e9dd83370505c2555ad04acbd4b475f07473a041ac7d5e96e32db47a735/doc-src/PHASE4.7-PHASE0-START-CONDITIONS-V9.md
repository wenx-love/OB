# OB-Recover Phase 4.7：Phase 0 启动条件 V9（正式候选，待第十二轮独立复核）

日期：2026-11-12。性质：执行前契约修订，不是执行结果、独立复核通过记录或 Phase 0 启动授权。

本轮只整改 Codex 第十一轮报告（`CODEX-P47-PHASE0-V8-ELEVENTH-INDEPENDENT-REVIEW-20261112-104806.md`，26616 字节，SHA-256 `9f9b4c7ee4976312625a697c059b0692c20df07e9a8b748d4e0847092392f1bc`）的 F01—F14。不执行 C00—C20、Phase 0、Vitest、tsc、Vite build、浏览器或 L1；不创建 `D:\P47RUN`、`D:\P47TOOLS`；不改 ACL、产品源码、`dist` 或历史证据。

V4—V8 与全部历史报告原样保留；V9 在独立目录 `V9\` 中使用新文件名。

## 1. 输入与冻结结论

V8 二十六份文件与第十一轮报告哈希均已复算匹配（见自检）。R 冻结不变：**0 CLOSED / 23 PARTIAL / 2 OPEN**（R05、R16 OPEN，R01 PARTIAL）。D3、D4、D10、D12、D14、D15 不改；其余决策不代批。阶段顺序与安全门槛不变。

本轮不把 N 系列评级自动升级：F01—F14 的修复只消除第十一轮指出的设计缺陷；运行时工具未交付，N 系列仍按实际证据标注。

## 2. F01—F14 修复总览

| 编号 | 第十一轮问题 | V9 修复 |
|---|---|---|
| F01 | 20 行 sealed-full 含失败/跳过，与审计规范冲突 | 统一 `sealed-full` = 证据完整封存（staged complete + run completed + index/report present），允许 failed/skipped；`exit_status=complete` 严格要求无 failed/skipped/gate_failed 且 C18 bound；主文、审计规范、flow、checker、正负例同步 |
| F02 | no-chain 产生伪造链记录；非链执行计 open/close | 建链前一律 not-started、0 记录；只为 genesis/participant 记录链；C01 失败/孤立 = no-chain、0 记录；SEAL/REPORT 等 terminal 不产生链记录；pre-run 失败后续全部未开始 |
| F03 | 安全分类依赖 security_codes + 英文子串，trigger 误归因；C07 完整性失败未升级 | 57 个 reason 建立精确 reason→trigger 表，禁止子串；C07 的 ORIGINAL changed / diff / chain broken / 重跑 全部 security；`chain-broken` 只由 `SEC-CHAIN-MISMATCH` 触发 |
| F04 | recorded/settled 接受 orphaned/not-started；stop 直接覆盖；无复合故障 | 显式状态集合；stop 取等级 max 单调上升；新增 34 个复合场景（首错+after错、双 gate、security+finalizer） |
| F05 | source 执行错误登记 staged verifier；load_files 未全部进入 trusted 读取 | 按 entry_mode 选择 source/staged 根；全部 load_files 进入 dispatcher 读取并带加载前哈希责任 |
| F06 | optional_reads 在 TARGETS→ex 丢失 | 传递原始 optional；C17 全部 OUT 根与 m1.json、REPORT cutoff、C19/SEAL binding 显式 optional；检查器验证 producer 非 ok ⇒ 输入 optional |
| F07 | product preload policy 与登记值不符 | 向量在归一化后生成，preload 使用真实 product policy；checker 按 process_role 比较 guard/product policy；新增错误 policy 负例 |
| F08 | 操作级权限、rule 原始层、intent 配对、aborted after、skip 因果、seal 跨模型漏检 | 新增 OP_RULES 操作匹配、rule layer 原始身份、intent 恰一 result、aborted after、run-stopped 才允许 open 依赖、seal 与链尾/开放段/分区交叉验证、rename/copy src 可读、写保护、append 增量语义 |
| F09 | post gate 失败调用 recover 会保留新版本 | 新增 `undo()` 显式撤销 committed/verified 事务，恢复指针后复核旧 release 与物化树；build post gate 失败调用 undo，失败退出 3 |
| F10 | 新发布覆盖未恢复的 journal/backup | 单写者 LOCK；未完成事务一律 `E_UNFINISHED_TX`；txid 与 rid 分离，backup 按 txid 唯一，不删除未完成备份 |
| F11 | status/recover/check 对 release/指针校验不足 | 四方核验：CURRENT.files 重算 RID、release index 全量相等、release 每字节、物化每字节；status 有 issue 退出 1 |
| F12 | 短写、目录同步、rollback 顺序、路径边界、并发 | 循环写至全部字节 + fsync；目录 fsync 尝试并记录；rollback 先恢复文件与指针再整体复核；abs() 拒绝绝对/`..`/越界；LOCK 并发控制 |
| F13 | lab 只留计数、删现场、kill 未断言 | 17 场景逐场景保留 expected/actual/steps/前后哈希/journal/CURRENT/release 列表/代码 SHA；新增 post-gate undo、未完成事务、锁、短写、release/pointer 损坏 |
| F14 | doc-src 不在交付与 release，无法自复现 | 10 个 doc-src 模板进入 37 项交付与不可变 release；manifest 单列生成输入；checker 断言覆盖；构建优先读取包根 doc-src |

逐项根因、修改文件与验证见 `PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md`。

## 3. 执行模型

每个执行登记 `class`（pre-run/genesis/infra/baseline/target/before/after/bind/finalizer/seal）与结构化 `requires`。要求状态只有四种，且按**封闭集合**判定：

| 状态 | 允许的终态 |
|---|---|
| `ok` | ok |
| `terminal` | ok / failed / aborted（不含 skipped/orphaned/not-started） |
| `recorded` | ok / failed / aborted / skipped（不含 orphaned/not-started） |
| `settled` | ok / failed / aborted / skipped / orphaned（不含 not-started） |

执行顺序本身是隐式约束：模拟器沿选定顺序推进，前一项必须先有终态。`requires` 必须指向计划中更早的执行。

证据包装规则：

1. `C07-B(T)` 与目标共享 ok 依赖；依赖失败时 B 跳过，目标与 A 一起跳过。
2. 目标失败/中止时 `C07-A(T)` 必跑一次；这是 `terminal` 依赖。
3. 目标被跳过时 `C07-A(T)` 记 `segment_skip(reason=target-skipped)`，不伪造 close。
4. 硬死机留下的开放尾由 SEAL 记录为 orphan，不补记录。
5. 复合故障下停止级别只升不降；A 自身失败不会把 halt-all 降为 halt-business。

## 4. 权限模型（N01、N02、N04、N05）

四层，互不取并集：

| 层 | 主体 | 读 | 写 |
|---|---|---|---|
| trusted_load | dispatcher | manifest、实际 entry、同根 load_files、全部工具字节、`node.exe` | 无 |
| business | 工具/runner | 数据输入 + `load_files` | 本执行登记文件/目录 + 自己的审计分片 + 自己的 TEMP |
| control | `p0-audit.cjs` | 链尾 + 本段 parts/summary | 链头、summary、段目录、中间 `AUDIT\Cxx` |
| product | runner 子进程 | 副本子树 + 自己的 OUT + 预载模块 | 产品报告、dist 目标、缓存、`COPY\tmp`、产品分片 |

规则：

1. 同一层 `read_allow` 与 `deny_read` 双向不相交。
2. 每个文件输出单独许可；`dir-create` 只覆盖目录本身。
3. 审计父目录：genesis 与每个参与者都以 `dir-create-if-absent` 登记 `AUDIT\Cxx`。
4. TEMP：`redirected` 必须同层读+写；`forbidden` 不得写临时文件；`inherited` 为契约外副作用。
5. 审计分片角色：dispatcher 写 begin/end；OBS 为 dispatcher+observer；产品为 dispatcher+tool+product；其余 dispatcher+tool。
6. `acl-set-recursive` 是元数据写，仅 C02，必须 SDDL 回读；内容写与保护路径双向不相交。
7. C18 目标读回使用 `BINDING:c18_destination` 精确许可。

## 5. 失败与停止

优先级：**security > fatal > gate > informational**。停止级别：`none < continue < halt-business < halt-all < chain-broken`，只升不降。

- gate 失败：目标 close=failed(gate)，自己的 A 执行；B/T/A 三连的依赖者整体跳过；C17/M1/C19/REPORT 继续，封存为 sealed-full 但 `exit_status=exit-not-met`。
- fatal 非安全：target/baseline 失败进入 `halt-business`（finalizer/bind/seal 继续）；infra/finalizer/seal 失败进入 `halt-all`。
- security：一律 `halt-all`，只允许失败目标待跑的 A 与 SEAL；trigger 由精确映射表决定。
- 无链/引导失败：不写任何链记录，封存 no-chain，只留 launch record。
- dispatcher 硬死机：链尾停在 `segment_open`，SEAL 列 `open_segments`；模式按 staged 状态取 aborted 或 degraded-prefix。

## 6. 封存函数

| 模式 | 条件 | 允许的声明 |
|---|---|---|
| no-chain | genesis 未 ok | 只有 launch record；records=0 |
| seal-failed | C20-SEAL 自身失败 | 无权威封存，不重试 |
| chain-broken | 链完整性检查失败（`SEC-CHAIN-MISMATCH`） | 不写终端封存，外部记录 |
| degraded-prefix | staged_state=incomplete/absent，链完整 | 只声明实际前缀、缺失项、开放段 |
| aborted | staged_state=complete 且运行中止 | 披露 abort 执行、失败类/trigger、开放段、跳过/未开始 |
| sealed-full | staged_state=complete、run completed、index/report present | 允许 failed/skipped/gate_failed；只有列表全空且 C18 bound 才 `exit_status=complete` |

## 7. 绑定交接（N10）

1. 唯一路径：`D:\P47RUN\P47-20261111-01\binding\c18-binding.json`，只在 `p0v9-lib.cjs` 定义一次。
2. `C18-BIND-E01` 只读一次 `P0_SECOND_ARCHIVE`，CreateNew 写绑定文件，并把同一 sha256/目标写入 `segment_open`。
3. C18 只读绑定文件，环境不再出现在其 `required_env`。
4. C19 记录绑定文件哈希；REPORT 消费链记录并在文件存在时复核；SEAL 复核文件与 `segment_open` 一致。
5. 绑定文件已存在即失败；未绑定时 C18 三连写 `segment_skip(reason=c18-unbound)`。

## 8. 发布事务（F09—F13）

生成完整文件映射后：内存自检 → `_publish\prestage` → 独立检查器/PowerShell/解析/控制配置/lab → 不可变 release → 持久备份 → 逐文件 temp+rename → `CURRENT.json` 单指针 → 提交后复核。提交后门禁失败调用 `undo()` 显式回滚并复核旧 release。入口有 LOCK 与未完成事务闸门；status/recover 全量核验 RID、索引、release 字节与物化字节。真实磁盘错误/断电/外部 kill/多写者仍为 UNVERIFIED。详见 `PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md`。

## 9. 审计与向量（F07、F08）

- 事件 schema `p47-audit-event-v9`，链 `p47-chain-record-v9`，summary/seal `v9`，向量 `p47-audit-vectors-v9`。
- `segment_close` 带 `failure_class` 与 `security_trigger`；`segment_skip` reason 固定四种。
- 正例 58 项：canonical、分片、事件、链片段、summary、5 个 seal（含 sealed-full 带失败/跳过的正式正例）。
- 负例 41 条，每条只注入一个语义错误；新增 op 越权、intent 未配对、product 引用 business rule、错误 preload policy、aborted 缺 after、sealed-full+complete+skipped。
- 检查器不 import 生成器、spec、向量生成器或流模型；自带规范化、路径关系、操作权限、因果、状态机与 seal 跨模型验证。

## 10. 执行顺序与计数

21 命令、58 执行、54 链参与者；绑定顺序 58、未绑定 55；nominal 链记录 109/103。失败矩阵 **340** 个场景：两种顺序的逐执行 gate/fatal/security、逐执行 orphan、未绑定绑定参数、34 个复合故障。发生 gate 失败时每条 skip 增加记录，报告与封存使用实际链尾。

## 11. 准入条件

沿用 A1—A8/B1—B17/C1—C9，并新增：

- A9：第十一轮报告与 V8 二十六份的哈希核对记录。
- A10：V9 发布指针与交付清单逐项一致。
- B18：C06 guard policy 绑定与预载身份验证。
- B19：双向 allow/deny、TEMP 反查、写/保护交集均为 0 的静态记录。
- B20：340 行失败矩阵与检查器独立重算一致；no-chain records 全 0；sealed-full 语义一致。
- B21：发布事务 LOCK/未完成事务/undo/完整 release 核验的隔离证据。
- C10：封存模式与实际 staged 状态、跳过列表、开放段、报告截止点一致。

## 12. 停止与回滚

原项目只读；任一禁止读成功、未登记写成功、审计链断裂、路径越界、哈希不符即按第 5 节终止；保留现场，不提升权限、不换目录、不关守卫、不原地重试。C18 未绑定只能 `exit-not-met`。

## 13. 交付

V9 交付：主文档、白名单 TSV、注册表 JSON、审计规范、审计向量、失败模型、发布协议、生成器、独立检查器、验证脚本、发布事务、故障实验室及逐场景证据、卫生检查、控制配置检查、V8→V9 变更记录、N01—N12 追溯表、F01—F14 追踪矩阵、未决清单、自检、交付清单、运行时工具状态说明、10 个 doc-src 生成输入。

<!-- GENERATED:BEGIN (p0v9-build.cjs) -->
