# OB-Recover Phase 4.7：Phase 0 V5 对第七轮 Q01—Q07 的逐项追溯表

日期：2026-11-11。性质：契约追溯，不是独立复核结论。状态列只描述 V5 文本是否给出唯一处置；“动态验证”一律 UNVERIFIED。

证据缩写：**M** = `PHASE4.7-PHASE0-START-CONDITIONS-V5.md`（行号）；**A** = `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md`（行号）；**R** = `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json`（字段路径）；**W** = `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv`（行号 = plan_order + 1）。

## Q01｜staged 首次执行与根路径绑定

| 第七轮要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| 1. 分别固定 ApprovedManifestPath、ReleaseSourceRoot、StagedRoot 与映射 | M 30—50；R `release.source_root`、`release.approved_manifest_path`、`release.staged_root`、`release.mapping` | 已处置 | 无 |
| 2. 最小方案：C05-FINAL 继续用 source dispatcher/verifier，显式读批准 manifest 与 staged 根，FINAL 后才切换 | M 66—74；R `C05-FINAL-E01.entry_path`（source）、`C06-E01.entry_path`（staged）、plan_order 53→54 | 已处置 | 实现未验证 |
| 3. 若先切换，须由 C04 外部可信入口读回；不得隐式加目标读权限 | 未采用先切换；C04 只写不读：R `C04-E01.reads.business` 不含 staged 子树，M 68 | 已处置 | 无 |
| 4. “19 个文件”改为“19 payload + 独立 manifest” | M 44—46 统一为 **20 payload + manifest**；R `counts.payload_files=20`、`staged_files=16`、`bootstrap_files=4` | 已处置 | 无 |
| 5. 定义首次运行 PowerShell、登记表文本、清单环境值的外部责任 | M 54—64 的 H1—H5；M 64 明确 C00 不是信任根 | 已处置 | H2/H3 需实际操作员执行 |

## Q02｜C03 管理员观察者唯一入口

| 第七轮要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| 观察者绑定工具哈希、argv、cwd、独占输出、先后关系、退出判据 | M 91—110；R `C03-OBS-E01.tool_files`（`p0-observe.ps1`）、`argv`、`cwd`、`stdin`、`deadline_seconds=900`；W 第 6 行 | 已处置 | 工具未实现 |
| Codex 身份只允许二选一，缺失/越界即失败 | M 96、105；R `identity.codex_accounts`；探针退出 51 | 已处置 | 账户是否存在未核对 |
| 观察者不代替探针、不授予 Codex 写权限 | M 105—110；R `C03-PROBE-E01` 零写、`C03-OBS-E01` 只写自己的输出；`identity.codex_write_allowed=false` | 已处置 | relay 来源不可证（U15） |
| 实时性留 Phase 0 | M 109、B5；A 88—96 | 已处置 | UNVERIFIED |

## Q03｜链头唯一写入主体与精确权限

| 第七轮要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| 登记唯一写入主体 | M 112—120；A 5—23；R `audit.chain_writer` | 已处置 | 实现未验证 |
| 精确文件权限与读许可 | R 每个 participant 的 `writes.control`（`file-append`）；genesis `file-create`；读者只读；W 对应行 | 已处置 | 无 |
| CreateNew/append 与串行关闭 | M 122—128；A 65—76（独占、读末条、校验 `chain_seq`/`prev_file_bytes`） | 已处置 | 独占语义未测 |
| 不得放宽整个 `OUT\audit` | M 127；检查器断言 C01 之外无 `OUT`/`AUDIT` 业务写；W 无宽根 | 已处置 | 无 |
| Codex 不写链头 | M 110；R `identity.codex_chain_access=false`；A 23 | 已处置 | 无 |

## Q04｜审计 schema 与封存顺序

| 第七轮要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| 1. `intent_id` 唯一、result 引用、逐事件必填/可空/禁填、动作前不填成功 | M 133—139；A 180—232；A 附录 A/B/C | 已处置 | 无 |
| 2. 固定“事件段封存 → summary → 链头关闭”的唯一顺序 | M 141—149；A 56—63 | 已处置 | 无 |
| 3. 独立链头 schema、规范化编码、并发序列化与失败处理 | M 145；A 65—76、89—113、115—124 | 已处置 | 并发未测 |
| 4. 编码向量；真实写入/失败注入留 Phase 0 | A 89—113、附录 D；独立向量文件 `dd32bc4f…e042` | 已处置 | 写入未测 |
| summary 自引用消除 | M 147；A 58—63（summary 不含自身哈希、不引用链） | 已处置 | 无 |
| `segment_close` 不在事件枚举的问题 | A 33（九类事件）与 A 65（三类链记录）分离 | 已处置 | 无 |

## Q05｜逐命令读写许可

| 命令/要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| C00 明列三件工具内容读 | R `C00-E01.reads.business` 含 dispatch/verify/audit；W 第 2 行 | 已处置 | 无 |
| C05-FINAL 的 TMP 唯一权限 | M 158—160；R `C05-FINAL-E01.writes.business` 含 `RUN\tmp`；无第二定义 | 已处置 | 无 |
| C11/C15 的 `copies.json` 内容读 | R `C11-E01.reads.business[3]`、`C15-E01...`；产品 `product.reads` 不含该文件 | 已处置 | 无 |
| C18 的 `m0.json` 精确读 | R `C18-E01.reads.business` 含 `D:\P47RUN\P47-20261111-01\baseline\m0.json` | 已处置 | 无 |
| C19/C20 的工具与审计读 | R `C19-E01`、`C20-REPORT-E01`、`C20-SEAL-E01` 的 `reads.business`；W 对应行 | 已处置 | 无 |
| C14 写根收窄 | R `C14-E01.writes.business` 仅 `map-listed-file-write`；M 165 | 已处置 | 映射工具未实现 |
| C10-S 不得被跳过 | M 271；R `C15-E01.gate`、`C16-E01.gate` 均含 C10-S；W 无“可选” | 已处置 | 无 |
| TSV/JSON/主文同源 | 同一生成器 `p0v5-build.cjs`；M 162；自检第 2、3 项 | 已处置 | 无 |

## Q06｜最终证据封存

| 第七轮要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| 定义报告覆盖截止点 | M 176—178；R `C19-E01` 写 `cutoff.json`、`C20-REPORT-E01` 写 `report-coverage.json` | 已处置 | 无 |
| 尾部证据独立封存 | M 180—184；R `C20-SEAL-E01` 只写 `terminal-seal.json`，`chain_role=terminal`；A 78—87 | 已处置 | 无 |
| 不得无限重跑 C19/C20 | M 182；R `plan.abort`；C19/C20 各一次 | 已处置 | 无 |
| 不得漏尾部证据 | M 184；R `C20-SEAL-E01.reads.business` 含全链与尾部输出 | 已处置 | 交叉校验未实测 |
| C07 目标不再包含 C20 整体 | M 174；R 目标末项 `C20-REPORT-E01`；15 目标各 1 次 before/after | 已处置 | 成本未测（自检 §6.4） |

## Q07｜启动/出口条件分类

| 第七轮要求 | V5 证据 | 状态 | 剩余 |
|---|---|---|---|
| 拆成启动前外部输入、Phase 0 内硬门、结束前条件 | M 198—245（A/B/C 三表） | 已处置 | 无 |
| SECOND_ARCHIVE 在 S8/C18 前绑定，未绑定 C18 DISABLED | M 190—196；R `plan.c18.when_unbound` | 已处置 | 用户未绑定 |
| 未绑定只能 `exit-not-met` | M 194；R `C18-E01.fail_closed[0]`；M 240 | 已处置 | 无 |
| 不自动选 TEMP 或备用路径 | M 194；R `plan.c18.when_unbound[2]` | 已处置 | 无 |
| “C05-PRE 能通过 / C01 能建链”不得写成 C00 前置 | M 245（能力契约 + S0 验收） | 已处置 | 无 |

## 汇总

| 项 | V5 处置计数 | 说明 |
|---|---|---|
| Q01 | 5/5 条已给出唯一处置 | 动态 UNVERIFIED |
| Q02 | 4/4 | relay 限制已披露 |
| Q03 | 5/5 | 独占语义未测 |
| Q04 | 6/6 | 向量已独立复算 |
| Q05 | 8/8 | 工具实现未验证 |
| Q06 | 5/5 | 封存未实测 |
| Q07 | 5/5 | 用户输入缺失 |

**本表不声称第七轮 Q01—Q07 已 CLOSED。** 是否闭合由第八轮独立复核判定；本表只提供可逐条定位的 V5 证据。
