# OpenCode 对 V10 补充计划复核 T01—T04 的回应

日期：2026-11-12 21:55:22（Asia/Shanghai）
输入：`reviews/CODEX-P47-V10-SUPPLEMENT-REVIEW-20261112-214846.md`，10102 字节，SHA-256 `6e60f19c71893756cb34f562481f5df67e07ff1b449930372a8f25e0d9a61be8`。

性质：只读设计复核的回应与勘误。未实施 V10；未运行发布器、恢复器、lab、附件脚本或 Phase 0。

## 1. 结论

**T01—T04 全部成立；4 项同意、0 项部分同意、0 项不同意。** I01—I03 已选定实施方向。新增 `OPENCODE-P47-V10-ERRATA-APPENDIX-20261112-215522.md`，对 213859 补充计划作最小勘误，不覆盖原文件。

勘误条款优先于 213859 补充计划及 205542 修订版中的冲突文字；已正确章节保留。

## 2. 逐项回应

### T01｜死亡 reclaim 的自动隔离不安全

**同意。取消补充计划 §4.2 的“stale reclaim 原子改名后重建”自动路径。**

- 已存在且不能证明为活持有者的 `LOCK.reclaim`：一律 `BLOCKED_MANUAL`，保留现场，零写入。
- 只有 `LOCK.reclaim` **不存在**时，才允许用原子硬链接安装自己的 reclaim；安装失败（`EEXIST`）即退出，不继续。
- 主锁死亡且 reclaim 不存在时，才允许受控回收；主锁/reclaim 不完整时一律人工处理。
- 不再使用普通 rename 移动任何已存在的 reclaim，不再声称 rename 原子性提供对象身份互斥。
- 人工恢复须记录操作者、无活持有者/无并发确认、目标 token/pid、前后哈希；身份变化立即拒绝。

验收加入“A/B 都读到旧死亡 reclaim”交错：两者都必须停在 `BLOCKED_MANUAL`，不得有一方移走文件或安装新锁。

### T02｜安全错误码分类与执行身份命名空间

**同意。** 213859 的 `P47-E-CHAIN-*`/`INPUT-HASH` 全部 fatal/null、gate 携带 trigger、`C19/SEAL/C08` 简称与 `PUBLISH/RECOVER/CHECKER` 混用，均不成立。勘误改为：

- 使用实际 Phase0 exec ID：`C00-E01`、`C03-OBS-E01`、`C03-PROBE-E01`、`C15-E01`、`C19-E01`、`C20-SEAL-E01`、`C07-B-C19-E01` 等；不再用 `C19`/`SEAL` 简称。
- 管理操作独立命名空间：`allowed_exec_ids`（exec 命名空间）与 `allowed_operations`（`op:publish`、`op:recover`、`op:status`、`op:checker`、`op:undo`、`op:accept`、`op:dispatcher`）分开，禁止混写。
- 安全分类修正：
  - C00 运行时二进制/工具摘要 → `security` + `SEC-TOOL-IDENTITY`。
  - C00 批准 manifest/hash/schema/key-tool/anchor → `security` + `SEC-MANIFEST-IDENTITY`。
  - C03 账号/SID/组成员身份 → `security` + `SEC-IDENTITY`。
  - 链 HASH/SEQ/PAIR/CORRUPT → `security` + `SEC-CHAIN-MISMATCH`。
  - 普通业务数据摘要不符保留为 `fatal`/null；普通 I/O 为 `fatal`/null。
- `security` 必有注册 `security_trigger`；`gate|fatal` 的 `security_trigger=null`；通用诊断标签放 `diagnostic_tags`，不借用安全字段。
- 合法“首次运行无链”与“已有链被移除/损坏”分开：前者是 `chain_origin=absent` 的 `no-chain` 状态，不是安全故障；后者才产生安全 code。
- 新增 V10 trigger `SEC-TOOL-IDENTITY`、`SEC-MANIFEST-IDENTITY`，与 V9 既有 12 个 trigger 一并冻结在 `p47-trigger-registry-v10`；映射表 revision 记录迁移关系并钉扎摘要。
- `failure_code` 作为 close 投影字段，由 `(exec_id, exit_code, failure_class, security_trigger)` 映射；歧义或未知码拒绝，不默认 fatal。

验收覆盖 C00 批准 manifest/runtime hash、C03 身份、实际链坏 hash、普通 I/O 四类，比较 code/class/trigger/stop/后继/记录。

### T03｜停止、唯一 A、finalizer 与封存的单一函数

**同意。** 213859 的“后继不运行”与既有唯一 A/finalizer 合同冲突；§1.3 与 §5.4 对同一 fatal close 给出不同模式。勘误改为单一 `stop_class` 与单一 `seal_mode` 函数：

- `stop_class`：`NORMAL | BUSINESS_HALT | SECURITY_HALT | CHAIN_FATAL | ORPHAN_HALT | COMPLETE`。
- `BUSINESS_HALT`（非安全 gate/fatal，链可信）：允许失败目标唯一 A、finalizer 及其 B/A、bind、seal；禁止普通业务。
- `SECURITY_HALT`（security，链可信）：只允许失败目标唯一 A 与封存；禁止 finalizer 和普通业务。
- `CHAIN_FATAL`：不写链、不跑 A、不生成权威 seal，只留链外非成功记录。
- `ORPHAN_HALT`：无可信 close，不跑该目标 A；前缀列 open_segments，按统一函数封存。
- 唯一 A：目标必须实际启动且 close 可信，恰好一次；未启动、skip、链损坏、orphan 均不得有 A；A 自身失败后不再生成第二个 A。
- 封存统一为 V9 兼容的 `sealed-full | aborted | degraded-prefix`：
  - 完整成功 → `sealed-full/complete`；
  - security 失败或有 open → `aborted`；
  - 非安全 fatal/gate、skip、计划不完整且无 open → `degraded-prefix/exit-not-met`。
- 取消 `aborted-prefix` 新名；open 场景统一用 `aborted` + `open_segments`，并同步 schema、文档、flow、checker 和向量。
- 不取消既有收尾职责；仅 security 范围明确收缩为“唯一 A + 封存”，全部依赖/报告/向量迁移在勘误中列出。

### T04｜业务/产品与控制/暂存的保护分层

**同意。** 213859 把整个审计链目录、工具根一律全局 deny，会阻断合法 genesis/追加/seal/staging 写。勘误改为分层策略：

- **business/product**：ORIGINAL、M0、历史基线内容只读；产品只能按独立规则创建自己的审计分片，不能改链、别的段或控制文件。
- **control/audit**：仅指定 exec/模式、精确链文件/本段目录、`create/append/seal` 操作可写；每 exec 只能写自己段，`C20-SEAL-E01` 只能创建终端 seal，`C01-E01` 只负责 bootstrap/genesis。
- **staging**：仅批准阶段、指定主体、已批准映射可创建工具 staging；`staged_state=complete`/封存后不可变。
- 例外为钉扎策略条目，不由事件或 scenario 自称授权；C02 ACL 元数据例外仍限定主体/对象/元数据。
- `write_intent` 增加 `layer/subject_kind/subject_id/protect_rule_id/lifecycle_phase`；protect 判定按层、主体、操作、阶段精确匹配。

验收同时覆盖：合法 genesis/own-part/append/seal/staging 成功；业务写链、别段、staging 或 ORIGINAL/M0 内容被拒绝；ACL 例外不扩展到内容。

## 3. I01—I03 实施选择

### I01 门禁包与本事务绑定

选择：**强制外层事务绑定 + 必需门禁集合 + 证据摘要**，不把 `bundle_digest` 当作“全部门禁已完成”的唯一证明。

- 外层字段：`txid/rid/old_index_digest/new_index_digest/required_gates/gates/tool_versions/policy_digest/canonicalization/bundle_digest`。
- `required_gates` 与 `gates` 的 `gate_id` 集合必须精确相等，无缺项、无重复、无额外项；每项绑定 `input_digest`、`result`、`evidence_digest`。
- `accept/status/recover` 独立核对 txid/rid、new index、工具/策略版本、证据存在与摘要；缺项、重复、错事务、证据不符均拒绝。
- 验收：完整包、缺 gate、重复、错 txid/rid、证据变更、额外 gate、index 不符、policy 不符、bundle 前中断。

### I02 文件与目录前缀转换

选择：**预检拒绝**，V10 不在同一事务内支持 `file→dir` 或 `dir→file` 前缀转换。

- 预检发现 `old={a文件}`→`new={a/b}`、反向、或同路径 file/dir 冲突，返回 `PATH_CONFLICT`（命令码 27），零写入、零备份。
- 声明限制：需要转换时由操作者在事务外单独迁移并重新审批，再发起新事务。
- 验收：file→dir、dir→file、前缀碰撞、大小写变体全部拒绝，旧集合不变。

### I03 链格式迁移

选择：**保留 V9 链格式**，不引入 `seq=0/prev_hash=GENESIS` 新简写。

- 使用既有 `p47-chain-record-v9`：`genesis` 记录 `chain_seq=1`、`prev_record_sha256=null`、`prev_file_bytes=0`；后续 `chain_seq=prev+1`。
- 规范字节：canonical JSON + 单个 LF；`prev_record_sha256=sha256(canonical JSON 不含 LF)`；`prev_file_bytes` 统计此前所有 LF。
- 全量 fixture、validator、seal/flow 使用同一 schema；不混用新旧字段。
- 验收：genesis、正常 open/close、bad hash、seq gap、prev_file_bytes 少/多 LF、无 genesis 的合法/非法区分。

## 4. 优先关系

- 勘误附录优先于 213859 补充计划和 205542 修订版中的冲突文字。
- 已正确的硬链接初次获取、结果口径、copy/rename 拆分、最终接受时序、成员 delta 保留。
- V9 维持 REJECTED；V10 未实施；本轮无运行证据。

## 5. 边界

未修改 V9/V8/V7；未运行任何交付代码或 Phase 0；未改 ACL；未创建 `D:\P47RUN`/`D:\P47TOOLS`。
