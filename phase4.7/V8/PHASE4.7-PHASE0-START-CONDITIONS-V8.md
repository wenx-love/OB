# OB-Recover Phase 4.7：Phase 0 启动条件 V8（正式候选，待第十一轮独立复核）

日期：2026-11-11。性质：执行前契约修订，不是执行结果、独立复核通过记录或 Phase 0 启动授权。

本轮只整改 Codex 第十轮报告（`CODEX-P47-PHASE0-V7-TENTH-INDEPENDENT-REVIEW-20261111-202419.md`，24179 字节，SHA-256 `6d4825aff995d487cb0ad7b3b00944479cf579ed1482d3ffb061100bde650b32`）的 7 项 OPEN 与 5 项 PARTIAL。不执行 C00—C20、Phase 0、Vitest、tsc、Vite build、浏览器或 L1；不创建 `D:\P47RUN`、`D:\P47TOOLS`；不改 ACL、产品源码、`dist` 或历史证据。

V4—V7 与全部历史报告原样保留；V8 在独立目录 `V8\` 中使用新文件名。

## 1. 输入与冻结结论

V7 二十一份文件与第十轮报告哈希均已复算匹配（见自检）。R 冻结不变：**0 CLOSED / 23 PARTIAL / 2 OPEN**（R05、R16 OPEN，R01 PARTIAL）。D3、D4、D10、D12、D14、D15 不改；其余决策不代批。阶段顺序与安全门槛不变。

## 2. 第十轮 12 项修复总览

| 编号 | 第十轮问题 | V8 修复 |
|---|---|---|
| N01 | 真实路径/guard 未交付 | 静态登记保持双向交集 0；运行时仍未验证，状态 PARTIAL |
| N02 | `FileShare.Read` 与实际装载未运行 | 入口自读路径不变；增加“从环境反查写许可”的静态检查；运行验证仍缺，PARTIAL |
| N03 | C06 policy 无实际 guard | policy 与摘要保留；guard 运行实现仍缺，PARTIAL |
| N04 | genesis 缺 `AUDIT\C01` | C01 control 层新增 `AUDIT\C01` 的 `dir-create-if-absent`；检查器对 genesis 与普通参与者统一断言父目录、段目录、同段读取 |
| N05 | 9 个 runner 的 `RUN\tmp` 无写许可 | 9 个产品 runner 的 business 层同时登记 `RUN\tmp` 的读与写；产品 TEMP 单独为 `COPY\tmp`；新增 TEMP 反查检查（同层读+写；env 与 policy 一致） |
| N06 | validator 字段/权限/因果不完整 | 事件与链校验器补齐：角色枚举与逐执行允许角色、闭合字段、写意图/结果配对与类型、`durable`/`bytes_written`、读条目 rule_ref 解引用与 deny 交集、计数一致性、skip 因果、链物理字节、封存模式；35 条负例逐条只注入一个错误 |
| N07 | 安全分类执行器缺失 | 每个失败原因映射为 `code/class/trigger`；安全检查器和生成器都拒绝未绑定 trigger 的 security 模式；执行器仍缺，PARTIAL |
| N08 | 失败目标自身 after 被跳过；before/M1/C17 不兼容 skip | 引入 `requires` 状态 `ok/terminal/recorded/settled`；`C07-A(T)` 只依赖 `T` 的 terminal，失败目标自己的 after 必跑；被跳过目标的三连（B/T/A）一起跳过；C17/M1/C19/REPORT 消费 `recorded`（含 skip），不再要求成功 close |
| N09 | security-stop 固定 degraded-prefix | 封存模式改为状态函数：无链 no-chain、SEAL 自身失败 seal-failed、链完整性失败 chain-broken、staged 不完整 degraded-prefix、staged 完整且中止 aborted、否则 sealed-full；dispatcher 死亡留下的开放段由 SEAL 以 `open_segments` 记录（不补造 close/summary） |
| N10 | 绑定路径两种定义、后续消费者缺读许可 | `P.BINDING_FILE` 成为唯一常量；BIND 输出、C18/C19/REPORT/SEAL 读、审计记录、封存全部由它派生；C18/C19/REPORT/SEAL 精确登记绑定文件读取（REPORT/SEAL 可选）；`binding_handoff` 文本由常量生成 |
| N11 | CreateNew/映射执行未验证 | 静态登记保持；`CreateNew`、map-list 展开仍无运行实现，PARTIAL |
| N12 | 逐文件覆盖、吞回滚异常、无恢复协议 | 发布改为“内容寻址不可变 release + 持久备份 + 日志 + 单指针提交 + 提交后验证”；回滚失败显式 `rollback-failed` 并退出 3；新增隔离故障实验室（11 场景）与 `recover` |

## 3. 执行模型

每个执行登记 `class`（pre-run/genesis/infra/baseline/target/before/after/bind/finalizer/seal）与结构化 `requires`。要求状态只有四种：

| 状态 | 含义 |
|---|---|
| `ok` | 被引用执行必须以 ok close |
| `terminal` | 被引用执行以 ok/failed/aborted close（不含 skip） |
| `recorded` | 被引用执行有任意链记录，包括 `segment_skip`；用于报告路径消费“已被跳过”的终态 |
| `settled` | 被引用执行到达任意终态；用于绑定交接的顺序 |

执行顺序本身是隐式约束：模拟器沿选定顺序推进，前一项必须先有终态。`requires` 必须指向计划中更早的执行（检查器拒绝前向依赖）。

证据包装规则：

1. `C07-B(T)` 与目标共享 ok 依赖；依赖失败时 B 跳过，目标与 A 一起跳过，不产生“目标未跑却有 before 证据”。
2. 目标失败时 `C07-A(T)` 必跑一次；这是 `terminal` 依赖，不是成功依赖。
3. 目标被跳过时 `C07-A(T)` 记为 `segment_skip(reason=target-skipped)`，不执行、不伪造 close。
4. 计划中每个未执行项在停止时由 dispatcher 追加 `segment_skip`；硬死机留下的开放尾由 SEAL 记录为 orphan，不补记录。

## 4. 权限模型（N01、N02、N04、N05）

四层，互不取并集：

| 层 | 主体 | 读 | 写 |
|---|---|---|---|
| trusted_load | dispatcher | manifest、实际 entry、同根依赖、全部工具字节、`node.exe` | 无 |
| business | 工具/runner | 数据输入 + `load_files` | 本执行登记文件/目录 + 自己的审计分片 + 自己的 TEMP |
| control | `p0-audit.cjs` | 链尾 + 本段 parts/summary | 链头、summary、段目录、中间 `AUDIT\Cxx` |
| product | runner 子进程 | 副本子树 + 自己的 OUT + 预载模块 | 产品报告、dist 目标、缓存、`COPY\tmp`、产品分片 |

规则：

1. 同一层 `read_allow` 与 `deny_read` 双向不相交（读在禁止下、禁止在读子树下都算冲突）。
2. 每个文件输出单独许可；`dir-create` 只覆盖目录本身，不隐含文件写或子树写。
3. 审计父目录：genesis 与每个参与者都以 `dir-create-if-absent` 登记 `AUDIT\Cxx`，再 `dir-create` 自己的段目录；control 读自己的段子树。
4. TEMP：`redirected` 必须在同层同时有读与写；`forbidden` 不得写临时文件；`inherited` 明确为契约外副作用。9 个产品 runner 的 `RUN\tmp` 与产品进程的 `COPY\tmp` 分别登记。
5. 审计分片角色：dispatcher 写 `exec_begin/exec_end`；OBS 为 dispatcher+observer；产品执行为 dispatcher+tool+product；其余 dispatcher+tool。
6. `acl-set-recursive` 是元数据写，可遍历受保护路径但不得改内容，必须 SDDL 回读（仅 C02）；内容写与保护路径仍双向不相交。
7. C18 目标读回使用 `BINDING:c18_destination` 精确许可；不允许写权限自动推导读权限。

## 5. 失败与停止

优先级：**security > fatal > gate > informational**。停止级别：`none < continue < halt-business < halt-all < chain-broken`。

- gate 失败：目标 close=failed(gate)，自己的 A 执行；B/T/A 三连的依赖者整体跳过；C17/M1/C19/REPORT 继续，封存仍可为 sealed-full 但 `exit_status=exit-not-met`。
- fatal 非安全：target/baseline 失败进入 `halt-business`（finalizer/bind/seal 继续）；infra/finalizer/seal 失败进入 `halt-all`。
- security：一律 `halt-all`，只允许失败目标待跑的 A 与 SEAL。
- 无链/引导失败：不写任何链记录，封存为 no-chain，只留 launch record。
- dispatcher 硬死机：链尾停在 `segment_open`，SEAL 列 `open_segments`（parts 状态、summary missing、close missing、evidence unverified），模式按 staged 状态取 aborted 或 degraded-prefix。

## 6. 封存函数

| 模式 | 条件 | 允许的声明 |
|---|---|---|
| no-chain | genesis 未 ok | 只有 launch record |
| seal-failed | C20-SEAL 自身失败 | 无权威封存，不重试 |
| chain-broken | 链完整性检查失败 | 不写终端封存，外部记录 |
| degraded-prefix | staged_state=incomplete/absent，链完整 | 只声明实际前缀、缺失项、开放段；不做完整复核声明 |
| aborted | staged_state=complete 且运行中止 | 披露 abort 执行、失败类/trigger、开放段、跳过/未开始清单 |
| sealed-full | staged_state=complete 且运行到计划终点 | 完整 staged 复核；只有无 failed/skipped 且 C18 bound 才 `complete` |

## 7. 绑定交接（N10）

1. 唯一路径：`D:\P47RUN\P47-20261111-01\binding\c18-binding.json`，只在 `p0v8-lib.cjs` 定义一次。
2. `C18-BIND-E01` 只读一次 `P0_SECOND_ARCHIVE`，以 CreateNew 写绑定文件，并把同一 sha256/目标写入 `segment_open`。
3. C18 只读绑定文件，`P0_SECOND_ARCHIVE` 不出现在其 `required_env`。
4. C19 在 index 中记录绑定文件哈希；REPORT 消费链记录并在文件存在时复核哈希；SEAL 复核绑定文件与 `segment_open` 一致。
5. 绑定文件已存在即失败；后续阶段不得覆盖；未绑定时 C18 三连写 `segment_skip(reason=c18-unbound)`。

## 8. 发布事务（N12）

`p0v8-build.cjs` 生成完整文件映射后：内存自检 → staging → 独立检查器与 PowerShell 验证 → 不可变 release 目录 → 持久备份 → 逐文件 temp+rename → `CURRENT.json` 单指针提交 → 提交后复核。失败从备份回滚并复核；回滚失败显式 `rollback-failed` 并退出 3。故障实验室只在隔离 scratch 目录注入故障，真实磁盘错误/断电/外部杀死仍为 UNVERIFIED。详见 `PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md`。

## 9. 审计与向量（N06）

- 事件 schema `p47-audit-event-v3`，链记录 `p47-chain-record-v4`，summary `p47-segment-summary-v3`，封存 `p47-terminal-seal-v3`。
- `segment_close` 增加 `failure_class` 与 `security_trigger`；`segment_skip` 的 reason 固定四种，`failed_dependency` 的因果由检查器验证。
- 正例 57 项：8 canonical、5 分片、19 事件、17 链记录（C01 3、gate 9、security 6、orphan 2）、1 summary、4 seal。
- 负例 35 条，每条在合法基底上只注入一个语义错误（改内容后重算 seq/prev，避免级联）；`jsonl_truncated_without_lf` 交付真实十六进制字节流。
- 字节口径：每条链记录 = canonical + LF；`prev_file_bytes` 计入每个 LF。
- 检查器不 import 生成器、spec、向量生成器或流模型；自带规范化、路径关系、schema、因果与状态机。

## 10. 执行顺序与计数

21 命令、58 执行、54 链参与者；绑定顺序 58、未绑定 55（少 C18 三连）；nominal 链记录 109/103。失败矩阵 306 个场景（两种顺序的每执行 gate/fatal/security 单点 + 每执行 orphan + 未绑定绑定参数）。发生 gate 失败时每条 `segment_skip` 增加一条记录，报告与封存必须使用实际链尾，不得硬编码 109/103。

## 11. 准入条件

沿用 A1—A8/B1—B17/C1—C9，并新增：

- A9：第十轮报告与 V7 二十一份的哈希核对记录。
- A10：V8 发布指针 `_publish\CURRENT.json` 与交付清单逐项一致。
- B18：C06 guard policy 绑定与预载验证。
- B19：双向 allow/deny 交集为 0、TEMP 反查为 0、写/保护交集为 0 的静态记录（不等于运行验证）。
- B20：失败矩阵摘要与检查器独立重算一致。
- C10：封存模式与实际 staged 状态、跳过列表、开放段、报告截止点一致。

## 12. 停止与回滚

原项目只读；任一禁止读成功、未登记写成功、审计链断裂、路径越界、哈希不符即按第 5 节终止；保留现场，不提升权限、不换目录、不关守卫、不原地重试。C18 未绑定只能 `exit-not-met`。

## 13. 交付

V8 交付：主文档、白名单 TSV、注册表 JSON、审计规范、审计向量、失败模型、发布协议、生成器、独立检查器、验证脚本、发布事务、故障实验室、卫生检查、控制配置检查、V7→V8 变更记录、N01—N12 追溯表、未决清单、自检、交付清单、运行时工具状态说明。

<!-- GENERATED:BEGIN (p0v8-build.cjs) -->

## Appendix B：固定路径与 20 个 payload 映射（生成）

ReleaseSourceRoot=`D:\P47TOOLS\p47-phase0-v8`；ApprovedManifestPath=`D:\P47TOOLS\p47-phase0-v8\RELEASE-MANIFEST.json`；StagedRoot=`D:\P47RUN\P47-20261111-01\tools`；BindingFile=`D:\P47RUN\P47-20261111-01\binding\c18-binding.json`。manifest 与 4 个 bootstrap 文件不进入 staged 根。

| id | role | source | staged |
|---|---|---|---|
| init | bootstrap-init | `D:\P47TOOLS\p47-phase0-v8\payload\bootstrap\p0-init.ps1` | not staged (bootstrap) |
| acl | bootstrap-acl | `D:\P47TOOLS\p47-phase0-v8\payload\bootstrap\p0-acl.ps1` | not staged (bootstrap) |
| observe | bootstrap-observer | `D:\P47TOOLS\p47-phase0-v8\payload\bootstrap\p0-observe.ps1` | not staged (bootstrap) |
| stage | bootstrap-stage | `D:\P47TOOLS\p47-phase0-v8\payload\bootstrap\p0-stage.ps1` | not staged (bootstrap) |
| dispatch | dispatcher | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-dispatch.ps1` | `D:\P47RUN\P47-20261111-01\tools\p0-dispatch.ps1` |
| verify | verifier | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-verify-release.ps1` | `D:\P47RUN\P47-20261111-01\tools\p0-verify-release.ps1` |
| audit | audit | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-audit.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-audit.cjs` |
| guard | guard | `D:\P47TOOLS\p47-phase0-v8\payload\tools\fs-guard.cjs` | `D:\P47RUN\P47-20261111-01\tools\fs-guard.cjs` |
| simulate | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-simulate.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-simulate.cjs` |
| manifest | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-manifest.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-manifest.cjs` |
| archive | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-archive.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-archive.cjs` |
| copy | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-copy.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-copy.cjs` |
| prun | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-product-run.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-product-run.cjs` |
| neutralize | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-neutralize.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-neutralize.cjs` |
| compare | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-compare.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-compare.cjs` |
| index | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-index.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-index.cjs` |
| report | tool | `D:\P47TOOLS\p47-phase0-v8\payload\tools\p0-report.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-report.cjs` |
| simcases | case | `D:\P47TOOLS\p47-phase0-v8\payload\tools\cases\p0-simulation-cases-v1.json` | `D:\P47RUN\P47-20261111-01\tools\cases\p0-simulation-cases-v1.json` |
| nmap | case | `D:\P47TOOLS\p47-phase0-v8\payload\tools\cases\p0-neutralize-map-v1.json` | `D:\P47RUN\P47-20261111-01\tools\cases\p0-neutralize-map-v1.json` |
| vectors | case-fixed-bytes | `D:\P47TOOLS\p47-phase0-v8\payload\tools\cases\p0-audit-vectors-v4.json` | `D:\P47RUN\P47-20261111-01\tools\cases\p0-audit-vectors-v4.json` |

## Appendix C：执行顺序（生成）

绑定顺序 58 条，未绑定顺序 55 条；C18 三连为条件组。

| # | bound order | unbound order |
|---|---|---|
| 1 | C00-E01 | C00-E01 |
| 2 | C05-PRE-E01 | C05-PRE-E01 |
| 3 | C01-E01 | C01-E01 |
| 4 | C02-E01 | C02-E01 |
| 5 | C03-OBS-E01 | C03-OBS-E01 |
| 6 | C03-PROBE-E01 | C03-PROBE-E01 |
| 7 | C04-E01 | C04-E01 |
| 8 | C05-FINAL-E01 | C05-FINAL-E01 |
| 9 | C06-E01 | C06-E01 |
| 10 | C07-M0-E01 | C07-M0-E01 |
| 11 | C07-B-C08-E01 | C07-B-C08-E01 |
| 12 | C08-E01 | C08-E01 |
| 13 | C07-A-C08-E01 | C07-A-C08-E01 |
| 14 | C07-B-C09-E01 | C07-B-C09-E01 |
| 15 | C09-E01 | C09-E01 |
| 16 | C07-A-C09-E01 | C07-A-C09-E01 |
| 17 | C07-B-C10-P-E01 | C07-B-C10-P-E01 |
| 18 | C10-P-E01 | C10-P-E01 |
| 19 | C07-A-C10-P-E01 | C07-A-C10-P-E01 |
| 20 | C07-B-C10-N-E01 | C07-B-C10-N-E01 |
| 21 | C10-N-E01 | C10-N-E01 |
| 22 | C07-A-C10-N-E01 | C07-A-C10-N-E01 |
| 23 | C07-B-C11-E01 | C07-B-C11-E01 |
| 24 | C11-E01 | C11-E01 |
| 25 | C07-A-C11-E01 | C07-A-C11-E01 |
| 26 | C07-B-C12-E01 | C07-B-C12-E01 |
| 27 | C12-E01 | C12-E01 |
| 28 | C07-A-C12-E01 | C07-A-C12-E01 |
| 29 | C07-B-C13-E01 | C07-B-C13-E01 |
| 30 | C13-E01 | C13-E01 |
| 31 | C07-A-C13-E01 | C07-A-C13-E01 |
| 32 | C07-B-C10-S-E01 | C07-B-C10-S-E01 |
| 33 | C10-S-E01 | C10-S-E01 |
| 34 | C07-A-C10-S-E01 | C07-A-C10-S-E01 |
| 35 | C07-B-C14-E01 | C07-B-C14-E01 |
| 36 | C14-E01 | C14-E01 |
| 37 | C07-A-C14-E01 | C07-A-C14-E01 |
| 38 | C07-B-C15-E01 | C07-B-C15-E01 |
| 39 | C15-E01 | C15-E01 |
| 40 | C07-A-C15-E01 | C07-A-C15-E01 |
| 41 | C07-B-C16-E01 | C07-B-C16-E01 |
| 42 | C16-E01 | C16-E01 |
| 43 | C07-A-C16-E01 | C07-A-C16-E01 |
| 44 | C07-M1-E01 | C07-M1-E01 |
| 45 | C07-B-C17-E01 | C07-B-C17-E01 |
| 46 | C17-E01 | C17-E01 |
| 47 | C07-A-C17-E01 | C07-A-C17-E01 |
| 48 | C18-BIND-E01 | C18-BIND-E01 |
| 49 | C07-B-C18-E01 | C07-B-C19-E01 |
| 50 | C18-E01 | C19-E01 |
| 51 | C07-A-C18-E01 | C07-A-C19-E01 |
| 52 | C07-B-C19-E01 | C07-B-C20-REPORT-E01 |
| 53 | C19-E01 | C20-REPORT-E01 |
| 54 | C07-A-C19-E01 | C07-A-C20-REPORT-E01 |
| 55 | C07-B-C20-REPORT-E01 | C20-SEAL-E01 |
| 56 | C20-REPORT-E01 |  |
| 57 | C07-A-C20-REPORT-E01 |  |
| 58 | C20-SEAL-E01 |  |

## Appendix D：逐执行入口、要求与门（生成）

| # | exec | class | predecessor | requires | fail class | gate |
|---|---|---|---|---|---|---|
| 1 | C00-E01 | pre-run | - | - | pre-run | no additional precondition |
| 2 | C05-PRE-E01 | pre-run | C00-E01 | - | pre-run | no additional precondition |
| 3 | C01-E01 | genesis | C05-PRE-E01 | - | bootstrap | no additional precondition |
| 4 | C02-E01 | infra | C01-E01 | - | fatal | no additional precondition |
| 5 | C03-OBS-E01 | infra | C02-E01 | - | fatal | no additional precondition |
| 6 | C03-PROBE-E01 | infra | C03-OBS-E01 | - | fatal | no additional precondition |
| 7 | C04-E01 | infra | C03-PROBE-E01 | - | fatal | no additional precondition |
| 8 | C05-FINAL-E01 | infra | C04-E01 | - | fatal | no additional precondition |
| 9 | C06-E01 | infra | C05-FINAL-E01 | - | fatal | no additional precondition |
| 10 | C07-M0-E01 | baseline | C06-E01 | - | fatal | C06-E01 ok |
| 11 | C07-B-C08-E01 | before | C07-M0-E01 | ok:C07-M0-E01 | fatal | requires ok:C07-M0-E01; the wrapped target has not started |
| 12 | C08-E01 | target | C07-B-C08-E01 | ok:C07-M0-E01 | fatal | C07-M0-E01 ok; ORIGINAL unchanged since M0 |
| 13 | C07-A-C08-E01 | after | C08-E01 | terminal:C08-E01 | fatal | requires terminal:C08-E01 |
| 14 | C07-B-C09-E01 | before | C07-A-C08-E01 | ok:C08-E01 | fatal | requires ok:C08-E01; the wrapped target has not started |
| 15 | C09-E01 | target | C07-B-C09-E01 | ok:C08-E01 | fatal | C08-E01 ok |
| 16 | C07-A-C09-E01 | after | C09-E01 | terminal:C09-E01 | fatal | requires terminal:C09-E01 |
| 17 | C07-B-C10-P-E01 | before | C07-A-C09-E01 | ok:C09-E01 | fatal | requires ok:C09-E01; the wrapped target has not started |
| 18 | C10-P-E01 | target | C07-B-C10-P-E01 | ok:C09-E01 | gate | C09-E01 ok; copies.json entry hash matches; entry/report hashes match |
| 19 | C07-A-C10-P-E01 | after | C10-P-E01 | terminal:C10-P-E01 | fatal | requires terminal:C10-P-E01 |
| 20 | C07-B-C10-N-E01 | before | C07-A-C10-P-E01 | ok:C10-P-E01 | fatal | requires ok:C10-P-E01; the wrapped target has not started |
| 21 | C10-N-E01 | target | C07-B-C10-N-E01 | ok:C10-P-E01 | gate | C10-P-E01 ok |
| 22 | C07-A-C10-N-E01 | after | C10-N-E01 | terminal:C10-N-E01 | fatal | requires terminal:C10-N-E01 |
| 23 | C07-B-C11-E01 | before | C07-A-C10-N-E01 | ok:C10-P-E01 | fatal | requires ok:C10-P-E01; the wrapped target has not started |
| 24 | C11-E01 | target | C07-B-C11-E01 | ok:C10-P-E01 | gate | C10-P-E01 ok; tsc.js hash equals copies.json entry |
| 25 | C07-A-C11-E01 | after | C11-E01 | terminal:C11-E01 | fatal | requires terminal:C11-E01 |
| 26 | C07-B-C12-E01 | before | C07-A-C11-E01 | ok:C10-P-E01 | fatal | requires ok:C10-P-E01; the wrapped target has not started |
| 27 | C12-E01 | target | C07-B-C12-E01 | ok:C10-P-E01 | gate | C10-P-E01 ok; original config only |
| 28 | C07-A-C12-E01 | after | C12-E01 | terminal:C12-E01 | fatal | requires terminal:C12-E01 |
| 29 | C07-B-C13-E01 | before | C07-A-C12-E01 | ok:C10-N-E01 | fatal | requires ok:C10-N-E01; the wrapped target has not started |
| 30 | C13-E01 | target | C07-B-C13-E01 | ok:C10-N-E01 | gate | C10-N-E01 ok; control config hash equals the fixed template |
| 31 | C07-A-C13-E01 | after | C13-E01 | terminal:C13-E01 | fatal | requires terminal:C13-E01 |
| 32 | C07-B-C10-S-E01 | before | C07-A-C13-E01 | ok:C13-E01 | fatal | requires ok:C13-E01; the wrapped target has not started |
| 33 | C10-S-E01 | target | C07-B-C10-S-E01 | ok:C13-E01 | gate | C13-E01 ok |
| 34 | C07-A-C10-S-E01 | after | C10-S-E01 | terminal:C10-S-E01 | fatal | requires terminal:C10-S-E01 |
| 35 | C07-B-C14-E01 | before | C07-A-C10-S-E01 | ok:C10-S-E01 | fatal | requires ok:C10-S-E01; the wrapped target has not started |
| 36 | C14-E01 | target | C07-B-C14-E01 | ok:C10-S-E01 | gate | C10-S-E01 ok; map verified against its staged hash |
| 37 | C07-A-C14-E01 | after | C14-E01 | terminal:C14-E01 | fatal | requires terminal:C14-E01 |
| 38 | C07-B-C15-E01 | before | C07-A-C14-E01 | ok:C10-S-E01<br>ok:C14-E01 | fatal | requires ok:C10-S-E01; ok:C14-E01; the wrapped target has not started |
| 39 | C15-E01 | target | C07-B-C15-E01 | ok:C10-S-E01<br>ok:C14-E01 | gate | C14-E01 ok and C10-S-E01 ok |
| 40 | C07-A-C15-E01 | after | C15-E01 | terminal:C15-E01 | fatal | requires terminal:C15-E01 |
| 41 | C07-B-C16-E01 | before | C07-A-C15-E01 | ok:C10-S-E01<br>ok:C14-E01 | fatal | requires ok:C10-S-E01; ok:C14-E01; the wrapped target has not started |
| 42 | C16-E01 | target | C07-B-C16-E01 | ok:C10-S-E01<br>ok:C14-E01 | gate | C14-E01 ok and C10-S-E01 ok |
| 43 | C07-A-C16-E01 | after | C16-E01 | terminal:C16-E01 | fatal | requires terminal:C16-E01 |
| 44 | C07-M1-E01 | baseline | C07-A-C16-E01 | recorded:C07-A-C16-E01 | fatal | C07-A-C16-E01 terminal (ok or failed); M1 must not overwrite M0 |
| 45 | C07-B-C17-E01 | before | C07-M1-E01 | - | fatal | the wrapped target has not started |
| 46 | C17-E01 | finalizer | C07-B-C17-E01 | recorded:C07-M1-E01<br>recorded:C10-P-E01<br>recorded:C10-N-E01<br>recorded:C11-E01<br>recorded:C12-E01<br>recorded:C13-E01<br>recorded:C10-S-E01<br>recorded:C14-E01<br>recorded:C15-E01<br>recorded:C16-E01 | fatal | C07-M1-E01 terminal; every S5-S7 target recorded (ok \| failed \| skipped); absent outputs are reported as skipped, never invented |
| 47 | C07-A-C17-E01 | after | C17-E01 | terminal:C17-E01 | fatal | requires terminal:C17-E01 |
| 48 | C18-BIND-E01 | bind | C07-A-C17-E01 | - | fatal | C07-A-C17-E01 terminal; P0_SECOND_ARCHIVE is read exactly once and validated before any branch |
| 49 | C07-B-C18-E01 | before | C18-BIND-E01 | - | fatal | the wrapped target has not started |
| 50 | C18-E01 | target | C07-B-C18-E01 | ok:C18-BIND-E01<br>ok:C07-B-C18-E01 | gate | C18-BIND-E01 recorded bound; binding file sha equals the segment_open record; destination comes only from the binding file (the live environment is not read again) |
| 51 | C07-A-C18-E01 | after | C18-E01 | terminal:C18-E01 | fatal | requires terminal:C18-E01 |
| 52 | C07-B-C19-E01 | before | C07-A-C18-E01 | - | fatal | the wrapped target has not started |
| 53 | C19-E01 | finalizer | C07-B-C19-E01 | recorded:C17-E01<br>settled:C18-BIND-E01 | fatal | C07-B-C19-E01 settled; binding record present (bound or disabled-unbound); cutoff must equal the preceding segment_close |
| 54 | C07-A-C19-E01 | after | C19-E01 | terminal:C19-E01 | fatal | requires terminal:C19-E01 |
| 55 | C07-B-C20-REPORT-E01 | before | C07-A-C19-E01 | - | fatal | the wrapped target has not started |
| 56 | C20-REPORT-E01 | finalizer | C07-B-C20-REPORT-E01 | recorded:C19-E01 | fatal | C19-E01 terminal; the report consumes the C18 chain record and re-hashes the binding file only if it exists |
| 57 | C07-A-C20-REPORT-E01 | after | C20-REPORT-E01 | terminal:C20-REPORT-E01 | fatal | requires terminal:C20-REPORT-E01 |
| 58 | C20-SEAL-E01 | seal | C07-A-C20-REPORT-E01 | recorded:C20-REPORT-E01 | seal | normal: C20-REPORT-E01 terminal; abort: a recorded abort point with terminal segment_close or an open tail reported as orphaned; degraded: staged_state=incomplete\|absent. No terminal-seal.json exists |

## Appendix E：失败矩阵摘要（生成）

生成器对每个执行注入 gate（仅 gate 类）/fatal/security 三类单点失败，并对每个执行注入一次 orphan（链写入者死亡），绑定与未绑定共 306 个场景。检查器用自己的状态机重算并比对摘要。

| scenario | stop | staged | seal | exit | ran | skipped | records |
|---|---|---|---|---|---|---|---|
| bound/all-ok | none | complete | sealed-full | complete | 58 | 0 | 109 |
| bound/C10-P/gate | continue | complete | sealed-full | exit-not-met | 34 | 24 | 85 |
| bound/C12/security | halt-all | complete | aborted | exit-not-met | 29 | 29 | 80 |
| bound/C04/fatal | halt-all | absent | degraded-prefix | exit-not-met | 8 | 50 | 59 |
| bound/C10-N/orphan | halt-all | complete | aborted | exit-not-met | 22 | 36 | 72 |

### 按封存模式统计

| seal mode | scenarios |
|---|---|
| aborted | 238 |
| chain-broken | 2 |
| degraded-prefix | 25 |
| no-chain | 15 |
| seal-failed | 4 |
| sealed-full | 22 |

## Appendix F：封存模式判定（生成）

| mode | condition | output |
|---|---|---|
| chain-broken | chain tail/prev/digest cannot be verified, or C19 fails a chain-integrity check | no terminal-seal.json is written; operator records chain-broken |
| no-chain | C01 did not close ok; genesis or the chain file is absent | launch record only; no chain records, no seal |
| seal-failed | C20-SEAL itself fails or refuses | no retry; console + launch record; partial seal is not authoritative |
| degraded-prefix | staged_state=incomplete\|absent and the chain is intact | seal lists the actual prefix, missing items and open segments; no full recheck claim |
| aborted | staged_state=complete and the run halted at a recorded abort point | seal lists abort exec, failure class/trigger, open segments, skipped/not-started |
| sealed-full | staged_state=complete and the run reached the terminal plan end | full staged recheck; exit_status=complete only when no failed/skipped exec, C18 bound |

## Appendix G：目录生命周期（生成）

| path | declared creator | creating executions | readers | writers | lifecycle |
|---|---|---|---|---|---|
| D:\P47RUN | C01 bootstrap | C01-E01 | 0 | C01-E01 | phase0 lifetime |
| D:\P47RUN\P47-20261111-01 | C01 bootstrap | C01-E01 | 0 | C01-E01,C02-E01 | phase0 lifetime |
| D:\P47RUN\P47-20261111-01\out | C01 bootstrap | C01-E01 | C19-E01,C20-SEAL-E01 | C01-E01 | phase0 evidence |
| D:\P47RUN\P47-20261111-01\out\audit | C01 bootstrap | C01-E01 | C19-E01,C20-REPORT-E01,C20-SEAL-E01 | C01-E01 | phase0 evidence |
| D:\P47RUN\P47-20261111-01\tmp | C01 bootstrap | C01-E01 | C01-E01,C02-E01,C03-OBS-E01 ... (54 total) | C01-E01,C02-E01,C03-OBS-E01 ... (54 total) | run lifetime |
| D:\P47RUN\P47-20261111-01\tools | C01 bootstrap | C01-E01,C04-E01 | C05-FINAL-E01,C20-SEAL-E01 | C01-E01,C04-E01 | immutable after C04 |
| D:\P47RUN\P47-20261111-01\controls | C01 bootstrap | C01-E01 | C06-E01 | C01-E01,C06-E01 | run lifetime |
| D:\P47RUN\P47-20261111-01\acl-probe | C01 bootstrap | C01-E01 | 0 | C01-E01 | immutable after C03 |
| D:\P47RUN\P47-20261111-01\baseline | C01 bootstrap | C01-E01 | 0 | C01-E01 | immutable after M0 |
| D:\P47RUN\P47-20261111-01\baseline\snapshot-01 | C08 | C08-E01 | C09-E01,C18-E01 | C08-E01 | immutable after C08 |
| D:\P47RUN\P47-20261111-01\exp\pristine-01 | C09 | C09-E01 | C10-P-E01,C11-E01,C12-E01 | C09-E01 | immutable except declared product writes |
| D:\P47RUN\P47-20261111-01\exp\no-plugin-01 | C09 | C09-E01 | C10-N-E01,C13-E01 | C09-E01 | immutable except declared product writes |
| D:\P47RUN\P47-20261111-01\exp\sandbox-01 | C09 | C09-E01 | C10-S-E01,C14-E01,C15-E01,C16-E01 | C09-E01,C14-E01 | immutable except declared product writes |
| D:\P47RUN\P47-20261111-01\evidence | C01 bootstrap | C01-E01 | C19-E01,C20-REPORT-E01,C20-SEAL-E01 | C01-E01 | phase0 evidence |
| D:\P47RUN\P47-20261111-01\trust | C01 bootstrap | C01-E01 | C19-E01,C20-REPORT-E01,C20-SEAL-E01 | C01-E01 | phase0 evidence |
| D:\P47RUN\P47-20261111-01\review | C01 bootstrap | C01-E01 | C20-SEAL-E01 | C01-E01 | phase0 evidence |
| D:\P47RUN\P47-20261111-01\binding | C18-BIND | C18-BIND-E01 | 0 | C18-BIND-E01 | immutable after BIND |

## Appendix H：TEMP/TMP 策略（生成）

| exec | mode | path | same-layer grant | product TEMP |
|---|---|---|---|---|
| C01-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C02-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C03-OBS-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C03-PROBE-E01 | inherited | - | none | - |
| C04-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C05-FINAL-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C06-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-M0-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C08-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C08-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C08-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C09-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C09-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C09-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C10-P-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C10-P-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\pristine-01\tmp |
| C07-A-C10-P-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C10-N-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C10-N-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\no-plugin-01\tmp |
| C07-A-C10-N-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C11-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C11-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\pristine-01\tmp |
| C07-A-C11-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C12-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C12-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\pristine-01\tmp |
| C07-A-C12-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C13-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C13-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\no-plugin-01\tmp |
| C07-A-C13-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C10-S-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C10-S-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\sandbox-01\tmp |
| C07-A-C10-S-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C14-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C14-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C14-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C15-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C15-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\sandbox-01\tmp |
| C07-A-C15-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C16-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C16-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | D:\P47RUN\P47-20261111-01\exp\sandbox-01\tmp |
| C07-A-C16-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-M1-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C17-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C17-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C17-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C18-BIND-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C18-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C18-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C18-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C19-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C19-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C19-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-B-C20-REPORT-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C20-REPORT-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |
| C07-A-C20-REPORT-E01 | redirected | D:\P47RUN\P47-20261111-01\tmp | read+write | - |

## Appendix I：计数（生成）

| 项 | 值 |
|---|---|
| 命令 ID | 21 |
| 执行 | 58 |
| 链参与者 | 54 |
| 链记录（绑定/未绑定） | 109 / 103 |
| 执行顺序长度（绑定/未绑定） | 58 / 55 |
| 非链 / 终端封存 | 3 / 1 |
| payload（staged / bootstrap） | 20（16 / 4） |
| 失败矩阵行数 | 306 |
| 失败矩阵摘要 | `22243d0179dd982820e7cff0faad6d5df729f3842fec233ca350af3f6c787c40` |
| 向量 SHA-256 | `5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa`（107767 字节） |
| 注册表 SHA-256 | `edca94ff7b8b45794dcaac8fd316f147e06c2cdb655a8d6eabdd63ccad586c47` |
| 负例 | 35 |

<!-- GENERATED:END -->
