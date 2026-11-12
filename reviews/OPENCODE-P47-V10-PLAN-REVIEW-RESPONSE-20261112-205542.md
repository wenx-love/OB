# OpenCode 对 V10 计划复核 P01—P09 的回应（修订版计划索引）

日期：2026-11-12 20:55:42（Asia/Shanghai）
输入：
- `reviews\CODEX-P47-V10-PLAN-REVIEW-20261112-204406.md`，11124 字节，SHA-256 `54d098d75c5bd91c0caa016c5418fb266f5dbade5191fda3da26dcf97cf825d1`
- 上一版计划：`reviews\OPENCODE-P47-V9-REMEDIATION-PLAN-20261112-203821.md`，11010 字节，SHA-256 `b8f6e2196b6c44a4b46e6429999e0bc074ba549d4914b0d86c652c098d5f8c18`
- 上一版回应：`reviews\OPENCODE-P47-V9-REVIEW12-RESPONSE-20261112-203821.md`，18525 字节，SHA-256 `e448a8b3479aa25883a35a6ed23518ab1d8663a586479f7987a5735dc7fb4035`

性质：只读设计复核的回应与计划修订。未修改 V9/V8/V7，未执行发布器、恢复器、lab、附件脚本或 Phase 0。

## 1. 结论

**P01—P09 全部成立；9 项同意、0 项部分同意、0 项不同意。** 上一版计划中确有锁获取、事务状态、copy/rename 语义、结果口径、pending 生命周期、输入可用性、片段封存、验收判据和交付边界的设计错误。修订版计划已重写这些部分，见 `OPENCODE-P47-V10-REMEDIATION-PLAN-REVISED-20261112-205542.md`。

## 2. 逐项回应

### P01｜LOCK.tmp + rename 不构成互斥

**同意。** `rename` 是替换语义，不是“目标存在即失败”；固定 `LOCK.tmp` 还会让两个获取者共享临时名。修订版改为：

- 首选 **硬链接安装**：写入唯一 `LOCK.cand.<pid>.<rand>`（完整记录 + fsync），`linkSync(candidate, LOCK)`；NTFS/ext4 上 link 创建是原子且目标存在即 `EEXIST`，锁文件从出现起就是完整记录，无初始化窗口。
- 失败回退：`openSync(LOCK,'wx')` 获取；若读到空/不完整记录，**保守拒绝**，绝不删除。
- 陈旧锁：先原子获取 `LOCK.reclaim`，再复读 LOCK 的 token/pid，确认 pid 死亡且 token 未变才 unlink；随后用 link 竞争安装，输了就放弃。
- 释放：只删除 token 与自身一致的 LOCK；`LOCK.reclaim`/candidate 用唯一名，避免共享临时文件。
- 平台语义与回退、初始化/持有/回收/释放交错测试写入修订版 §3。

### P02｜journal/CURRENT 等式不能跨状态统一

**同意。** 上一版“`journal.files.new == CURRENT.files`”会拒绝正常回滚。修订版给出逐状态不变量表（§4）：

| 状态 | CURRENT | 物化树 | journal.new | 允许操作 | status |
|---|---|---|---|---|---|
| uninitialized | 无 | 无交付 | 无 | 首次 publish | 0 |
| prepared | 旧/无 | 旧/无 | 新 | recover→rollback | 1 |
| switching | 旧/无 | 可能混合 | 新 | recover→rollback | 1 |
| pending-acceptance | 旧/无 | 新 | 新 | accept/undo/recover→rollback | 1 |
| accepting | 旧或新 | 新 | 新 | recover→rollback（不自动 accept） | 1 |
| verified | 新 | 新 | 新 | 新事务 | 0 |
| rolled-back | 旧/无 | 旧/无 | 新（非当前） | 新事务 | 0（旧验证通过） |
| rollback-failed | 任意 | 混合 | 新 | 仅 recover/人工 | 3 |

`rolled-back` 用 `old_current`/`old` 文件集合验证，不再要求 `new == CURRENT`；`pending`/`accepting` 不得被 recover 擅自升级为 verified。

### P03｜copy 与 rename 权限/字节不能合并

**同意。** 修订版按 op 拆表（§5）：

- **create**：目标必须 absent（CreateNew）；目录创建单独 `mkdir`。
- **overwrite**：目标必须已存在；明确 before/after。
- **append**：`bytes_written` 为本次增量，`after.bytes = before.bytes + bytes_written`（文件）。
- **copy**：源读授权 + 目的写授权；**不要求源删除权**；记录文件复制量/目的 sha；源保持不变。
- **rename**：源读 + 源改名/删除授权（新增 `src_rule_ref`）+ 目的写授权；验证源消失、目的内容一致。
- **delete**：目标写/删除授权，after absent。
- **acl**：仅元数据，SDDL before/after，无 bytes。
- **map-list**：批准 map 展开为精确文件集合 + `map_digest` + 每文件 intent；不得退化为任意 subtree。

新增“只读 ORIGINAL copy 成功、同源 rename 拒绝”的区分性正负例。

### P04｜执行失败不能标 UNVERIFIED

**同意。** 修订版定义：

| 结果 | 含义 |
|---|---|
| PASS | 已执行，全部断言成立 |
| FAILED | 已执行，至少一个断言失败 |
| BLOCKED | 因权限/环境/外部输入被阻断，未执行 |
| NOT_REACHED | 因前置故障未到达该步骤 |
| NOT_RUN | 计划内但未开始 |
| UNVERIFIED | 已执行但证据不足/无法测量；**不用于断言失败** |

聚合优先级：`FAILED > BLOCKED > NOT_REACHED > NOT_RUN > UNVERIFIED > PASS`；退出码 0/1/2/3/4/5。计数按枚举分开，`PASS` 数不含其他项。既有失败证据不覆盖，新运行另存。

### P05｜pending-acceptance 生命周期与持锁接口

**同意。** 修订版 §4、§6 规定：

- 会话：`begin(purpose)` 获取 LOCK 并返回 `session_token`；`stage/switch/enterPending/verifyPending/accept/undo/abort` 全部必须携带同一 token。
- `pending-acceptance`：文件已切换、release 完整、CURRENT 仍旧；期间重复 publish 一律 `E_UNFINISHED_TX`；status 报 pending、退出 1。
- `accept(txid,rid)`：校验 journal.txid/rid/old_current，写 CURRENT + journal=verified，再复核新树；失败回滚。
- `undo(txid,rid)`：校验身份，回滚旧树/旧 CURRENT，复核；身份不符零写入。
- `recover`：pending/accepting 一律回滚，不自动 accept；verified 只复核；rollback-failed 重试回滚。
- checker 新增 `--mode pending`（接受 CURRENT 旧 + 物化新 + release 新）；默认 `verified` 模式仍要求 CURRENT 新。
- 进程在 pending 崩溃：锁陈旧回收后 recover 回滚；accept 前中断不得因字节吻合升级 verified。
- noop 不创建 journal/txid，因此没有可撤销的本次事务。

### P06｜输入可用性不等于“有 ok 生产者”

**同意。** 修订版 §7 区分：

| 类别 | 条件 |
|---|---|
| EXTERNAL_APPROVED | 运行前存在，路径 + 批准摘要 + 授权；无运行内 producer |
| PREEXISTING | 运行前存在（M0/ORIGINAL 等），需身份/摘要 |
| GENERATED | producer 必须 ok；缺失即不可消费 |
| PARTIAL_EVIDENCE | producer failed/skipped 可能留下部分文件；报告必须列出 producer 状态、文件、哈希，不得当完整 |

C17 的 `copies.json` 在本版改为 `optional-missing`：C09 skipped 时 C17 必须输出 `missing_inputs` 并声明未评估，不得静默 ok；或另行要求 C09 ok。finalizer 的 before/after 例外改为 replay/向量中的显式状态，不只是一句文书。

### P07｜无可信 close 与片段 seal 边界

**同意。** 修订版 §8 规定：

- `chain_state = complete | truncated-open | corrupt`。
- `corrupt`：不写权威 seal；生成链外 `operator-record`（raw chain hash、原因、操作者、时间），明确非成功证据。
- `truncated-open`：不补 close、不跑 A；SEAL 记录 `open_segments`，`abort.kind=orphan`、`failure_class=fatal`、`trigger=null`，模式按 staged 状态。
- 片段：独立类型 `p47-fragment-seal-v1`，`authoritative=false`，独立 validator；不得产生任何终端模式（sealed-full/aborted/degraded 等）。
- 链外 launch/operator 记录定义 schema、身份、摘要与证明边界；链损坏拒绝权威封存并保留原链。

### P08｜“恰好一错”和“至少一条断言”不是通用标准

**同意。** 修订版 §9：

- 单缺陷 fixture：先证明基底 PASS，再单点变异，期望**精确错误集合**（可一条）。
- 复合/端到端：声明 `required_errors` + `allowed_diagnostics`，断言 required 全中、无 allowed 之外错误；不强行压成一条。
- 每个场景记录 `requested/reached/observed`、触发 code/trigger、故障现场、txid/rid、恢复结果、最终一致性。
- `NOT_REACHED` 独立计数，不能算 PASS；不得为“恰好一错”删除必要检查。

### P09｜统一目录、成员与授权边界

**同意。** 修订版 §2、§11：

- 唯一交付位置：仓库根 `phase4.7/V10/`；审查/回应在 `reviews/`。
- V10 成员由真实输入/生成映射/manifest+self/CURRENT/release 物理集合双向核验派生，不预设 37。
- V7/V8 基线作为只读输入包，单独 manifest + SHA-256 绑定；完整 gate 显式声明依赖。
- 本轮只写计划；未来 V10 隔离 scratch 实验需用户单独授权，不默认允许执行 V9 工具、真实发布根、ACL 或 Phase0。
- N 项在静态设计实修并独立确认后可 PARTIAL；无动态证据不得 CLOSED；R 项独立判断。

## 3. 对上一版回应的更正

1. Q07 行号更正：`OP_RULES` 位于 `p0v9-check.cjs:151-160`，不是 `:87-90`（`:87-90` 是 covers 相关区域）。
2. Q14 措辞统一：正文和统计均应为 **部分同意**（模板封装成立；完整 build/gate/publish 依赖包外 V7/V8）。
3. 以上更正不改变第十二轮 Q01—Q14 的成立判断。

## 4. 结论

P01—P09 全部接受并已写入修订版计划。修订版计划以本报告为索引，补全锁算法、事务状态表、操作/schema、结果口径、pending 生命周期、输入可用性、片段封存、验收判据和交付边界。V9 维持 REJECTED；V10 未实施。
