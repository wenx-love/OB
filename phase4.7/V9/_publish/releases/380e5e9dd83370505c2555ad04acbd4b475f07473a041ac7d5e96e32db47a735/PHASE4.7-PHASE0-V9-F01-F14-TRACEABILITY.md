# OB-Recover Phase 4.7：V9 F01—F14 追踪矩阵

日期：2026-11-12。输入：第十一轮报告 `CODEX-P47-PHASE0-V8-ELEVENTH-INDEPENDENT-REVIEW-20261112-104806.md`，26616 字节，SHA-256 `9f9b4c7ee4976312625a697c059b0692c20df07e9a8b748d4e0847092392f1bc`。

状态口径：**FIXED/STATIC** = 代码、规则与静态/隔离试验已复核；**PARTIAL** = 设计已闭合但运行层未交付；**UNVERIFIED** = 只能由真实运行/真实故障验证。任何 F 项都不因本表自动变成“运行通过”。

## 1. 逐项矩阵

| 项 | 根因确认 | 修改文件 | 修复 | 验证 | 状态 |
|---|---|---|---|---|---|
| F01 | flow 把 `stop=continue` 当未中止，staged 完整即 `sealed-full`，与审计规范“sealed-full 不得含失败/跳过”冲突；20 行矩阵自相矛盾 | `p0v9-flow.cjs`、`p0v9-check.cjs`、`p0v9-audit.cjs`、主文/审计规范 | 统一语义：`sealed-full` = 证据完整封存（staged complete + run completed + index/report present），允许失败/跳过；`exit_status=complete` 才要求无 failed/skipped/gate_failed 且 C18 bound。文档、flow、checker、seal fixture 同步 | 340 行矩阵扫描：`sealed-full` 且 `exit=complete` 的行 failed/skipped 必须为 0；新增 `seal_full_complete_with_skipped` 负例与 `sealed-full` 带失败的正式正例 | FIXED/STATIC |
| F02 | genesis 前也写 skip，非链执行也计 open/close；C01 失败先赋 close 再算 2 条 | `p0v9-flow.cjs`、`p0v9-check.cjs` | 建链前一律 `not-started`、0 记录；只为 genesis/participant 模拟链记录；C01 失败/孤立 = no-chain、0 记录；SEAL/REPORT 等 terminal 不产生链记录；非链 orphan 不计 open；pre-run 失败后续全部未开始 | 15 个 no-chain 场景 records 全为 0；新增 `no-chain records 0` 断言；绑定全 ok 仍 109、未绑定 103 | FIXED/STATIC |
| F03 | 安全分类按“reason 是否在 security_codes + 英文子串 first-match”，`write outside` 命中 sid、`unaccounted` 命中 account；C07 wrapper 的 ORIGINAL/chain broken 未升级 | `p0v9-spec.cjs`、`p0v9-flow.cjs`、`p0v9-check.cjs`、注册表 | 57 个安全 reason 全部建立**精确** reason→trigger 表，禁止子串；C07 的 ORIGINAL changed / diff / chain broken / 重跑 全部显式映射为 security；`chain-broken` 只由 `SEC-CHAIN-MISMATCH` 触发，不再由“C19+security”推断 | 检查器逐条比对 `failure_modes.trigger === trigger_map[reason]`；新增 `write outside`/`unaccounted` 触发码断言；C07 original-change 显式断言 | FIXED/STATIC |
| F04 | `recorded/settled` 只检查 state 存在，会接受 orphaned/not-started；stop 直接覆盖而非取最大；无复合故障场景 | `p0v9-flow.cjs`、`p0v9-check.cjs`、矩阵 | 显式状态集合：`recorded` 不含 orphaned/not-started，`settled` 不含 not-started；stop 用等级 max 单调上升；新增“首错 + after 错”、双 gate、security+finalizer 共 34 个复合场景 | 340 行矩阵；检查器独立重算；`composite stop=halt-all`、`seal != sealed-full`；`C10-P security + A fatal` 断言 | FIXED/STATIC |
| F05 | `stg('dispatch')===entry ? stg('verify') : stg('verify')` 两分支相同，source 执行错误登记 staged verifier；load_files 未全部进入 trusted 读取 | `p0v9-build.cjs`、`p0v9-check.cjs` | 按 `entry_mode` 选择 source/staged 根；`load_files` 全部进入 `reads.dispatcher` 并带“加载前哈希”责任；C05-PRE 的 source audit 覆盖 | 检查器断言 entry/load 同根、每个 load_file 有 trusted 读取、C05-PRE 无 staged 路径；新增 58 执行逐项检查 | FIXED/STATIC |
| F06 | TARGETS→ex 未传 `optional_reads`，C17 m1.json 等丢失 optional；报告路径可能要求不存在的文件 | `p0v9-spec.cjs`、`p0v9-build.cjs`、`p0v9-check.cjs` | 传递原始 optional 标志；C17 的全部 OUT 根与 m1.json、REPORT 的 cutoff、C19/SEAL 的 binding 均显式 optional；新增“producer 非 ok 要求 ⇒ 输入必须 optional”检查 | 检查器逐执行断言 optional 标记与 producer 关系；C17/REPORT 在 M1/跳过后可运行 | FIXED/STATIC |
| F07 | product preload 正例 policy 为 `e×64`，既非 guard 也非 product policy；checker 只查 64hex | `p0v9-audit.cjs`、`p0v9-build.cjs`、`p0v9-check.cjs` | 向量在归一化之后生成，preload 使用**真实 registered product policy**；checker 按 `process_role` 选择 guard/product policy 并逐字比较；新增错误 policy 负例 | 正例 policy 等于 `C10-P-E01.product.policy_sha256`；`preload_policy_mismatch` 负例只报 `perm.preload_policy` | FIXED/STATIC |
| F08 | 只校验路径覆盖，不校验 op；按 role 改写 rule layer；未配对 intent 不报错；aborted 不触发 after；skip 因果接受 open；seal 不跨模型验证 | `p0v9-check.cjs`、`p0v9-audit.cjs`、`p0v9-audit` 规范 | 新增 `OP_RULES` 操作-规则匹配；rule_ref 必须原始层正确（product/business）；intent 必须恰好一个 result；`aborted` 也要求 after；`run-stopped` 才允许 open 依赖；seal 与链尾/开放段/分区交叉验证；rename/copy 的 src 必须可读；写保护检查；append 定义为增量、after.bytes 为最终长度 | 新增 `write_op_not_allowed_by_rule`、`intent_without_result`、`product_cites_business_rule`、`aborted_target_without_after` 等负例；58 分片/41 负例全过 | FIXED/STATIC |
| F09 | post gate 失败调用 `recover`，`verified` 分支复核字节通过就保留新版本 | `p0v9-publish.cjs`、`p0v9-build.cjs`、`p0v9-lab.cjs` | 新增 `undo()`：只对 committed/verified 事务显式回滚旧版本，恢复指针后复核旧 release + 物化树；build 在 post gate 失败时调用 `undo`，失败退出 3 | 实验室 `post-gate-undo`：A→B→undo，树/指针恢复 A，status 无 issue | FIXED/ISOLATED |
| F10 | 新发布不检查未完成事务，直接覆盖 journal，删除同名 backup | `p0v9-publish.cjs` | 单写者 `LOCK`；发布入口遇 prepared/switching/committed/rollback-failed 一律 `E_UNFINISHED_TX`；txid 与 release rid 分离，backup 目录按 txid 唯一，不删除未完成备份 | 实验室 `kill-then-publish`：SIGKILL 后再次发布被拒，`recover` 回滚 A；`lock-refusal` 拒绝并发写者 | FIXED/ISOLATED |
| F11 | status 只查索引存在、recover 不验 release、checker 只比索引长度、status CLI 有 issue 仍退出 0 | `p0v9-publish.cjs`、`p0v9-check.cjs` | 四方核验：CURRENT.files 重算 RID、release index 全量 canon 相等、release 每个字节、物化每个字节；journal 状态一致性；status 有 issue 退出 1 | 实验室 `release-corrupt`、`pointer-corrupt`；checker 对 CURRENT/release/物化逐项断言；status 退出码测试 | FIXED/ISOLATED |
| F12 | `writeSync` 不检查短写；无目录同步；rollback 先写状态再恢复指针；路径未限制 | `p0v9-publish.cjs` | `writeDurable` 循环至全部字节并 fsync；目录 fsync 尝试并记录 `dir_sync`；rollback 先恢复文件+指针，再整体复核后才标 rolled-back；`abs()` 拒绝绝对路径/`..`/越界，journal/index 路径全部经 `abs`；LOCK 并发控制 | `short-write` 场景 chunk=3 成功；rollback 场景 status 无 issue；路径单元负例（绝对/..）在入口拒绝；目录同步结果如实记录，不作为成功保证 | FIXED/ISOLATED（目录同步/断电 UNVERIFIED） |
| F13 | lab 删除 scratch、只保留通过计数；kill 未断言被杀死；rollback-failed 未再恢复 | `p0v9-lab.cjs`、`p0v9-build.cjs`、`_publish/lab` | 17 场景逐场景保留 `scenario.json`（expected/actual/steps/前后哈希/失败现场）、journal/CURRENT 副本、release 列表、代码 SHA-256；新增 post-gate undo、未完成事务、锁、短写、release/pointer 损坏；build 记录 lab 报告 SHA | 17/17 通过；`_publish/lab/<run>/<scenario>/` 可独立复核；`gate.json` 记录 evidence_dir 与 report SHA | FIXED/ISOLATED（真实磁盘/断电/外部 kill/多写者 UNVERIFIED） |
| F14 | V8 的 26 项交付不含 `doc-src` 模板，release 不可自复现 | `p0v9-build.cjs`、`p0v9-manifest.cjs`、`p0v9-check.cjs` | 10 个 doc-src 模板作为正式输入进入 37 项交付与不可变 release；manifest 单列“生成输入”；checker 断言清单覆盖；构建优先从包根 `doc-src` 读取，保证仅凭交付包可复现 | manifest 36 行；release 含全部 doc-src；两次生成逐文件一致 | FIXED/STATIC |

## 2. 复核证据位置

- 矩阵与状态机：`PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json` 的 `flow.matrix`（340 行）与 `flow.matrix.rows_data`。
- 审计：`PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json`（58 正例、41 负例、5 封存）。
- 发布实验室：`_publish/lab/<run>/report.json` 与逐场景目录。
- 门禁：`_publish/gate.json`（checker/verifier/build/lab/determinism/hygiene）。
- V8 不变：`p0v9-hygiene.cjs` 与 checker 的 V8 26 项哈希。

## 3. 仍未验证

真实 dispatcher/verifier/audit/guard/writer、真实 ACL/FD/硬链接/重解析、真实磁盘错误、断电、外部 kill、多写者并发、目录同步的持久效果、C00—C20 与 Phase 0 本身，全部 UNVERIFIED。
