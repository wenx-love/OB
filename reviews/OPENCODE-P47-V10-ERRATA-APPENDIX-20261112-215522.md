# OpenCode V10 补充计划勘误附录（T01—T04、I01—I03）

日期：2026-11-12 21:55:22（Asia/Shanghai）
状态：**勘误/约束，未实施**。
基准：`OPENCODE-P47-V10-REMEDIATION-PLAN-SUPPLEMENT-20261112-213859.md`（22553 字节，SHA-256 `e151bd2d…`）。
复核输入：`CODEX-P47-V10-SUPPLEMENT-REVIEW-20261112-214846.md`（10102 字节，SHA-256 `6e60f19c…`）。

## 0. 优先关系

1. 本文件是 213859 补充计划的**勘误附录**，不覆盖任何历史文件。
2. 本文件与 213859 补充计划或 205542 修订版冲突时，**以本文件为准**；未冲突章节继续有效。
3. 已正确的硬链接初次获取、结果口径、copy/rename 拆分、最终接受时序、成员 delta 保留。
4. V9 维持 REJECTED；本文件不构成 V10 实现或运行证据。

## 1. T01：死亡 reclaim 只保留现场

### 1.1 修正后的回收规则

| 状态 | 行为 |
|---|---|
| 主锁完整、pid 活 | `E_LOCKED`，零写入 |
| 主锁完整、pid 死、`LOCK.reclaim` 不存在 | 允许用唯一候选 + 原子硬链接安装自己的 reclaim；安装失败即退出 |
| `LOCK.reclaim` 完整、pid 活 | `E_LOCKED_RECLAIM`，零写入 |
| `LOCK.reclaim` 完整、pid 死 | **`BLOCKED_MANUAL`**；保留现场；不 rename、不删除、不安装新 reclaim |
| `LOCK.reclaim` 空/不完整 | `BLOCKED_MANUAL`；保留现场 |
| 主锁空/不完整 | `BLOCKED_MANUAL`；保留现场 |
| `_publish` 部分初始化、无 journal/CURRENT | `BLOCKED_MANUAL`/`INCONSISTENT`；不自动建状态 |

规则：

- 普通 `rename` 不再用于移动任何已存在的 reclaim；不声称 rename 的原子性提供对象身份互斥。
- 只有 reclaim 不存在时的“安装竞争”使用硬链接原子性；两个获取者只有一个成功，输者零写入。
- 主锁死亡且 reclaim 不存在的受控回收可保留；回收者持 reclaim 后复读主锁 token/pid，身份变化立即放弃。
- 人工恢复须记录：操作者、时间、无活持有者/无并发确认、主锁与 reclaim 的 token/pid、前后 SHA-256、隔离文件清单；不得自动删除不完整活锁。

### 1.2 验收

| 用例 | 期望 |
|---|---|
| LOCK-T1：A/B 同读旧死亡 reclaim | 两者都 `BLOCKED_MANUAL`；文件不变；无新锁 |
| LOCK-T2：reclaim 不存在，A/B 竞争安装 | 仅一个成功；输者零写入 |
| LOCK-T3：主锁死亡、reclaim 不存在 | 受控回收成功；token/pid 复核 |
| LOCK-T4：主锁空/不完整 | `BLOCKED_MANUAL`；不删除 |
| LOCK-T5：reclaim 空/不完整 | `BLOCKED_MANUAL`；不删除 |
| LOCK-T6：人工恢复身份变化 | 立即拒绝；现场保留 |

## 2. T02：错误码分类、trigger 与执行身份

### 2.1 命名空间

- `allowed_exec_ids`：只放实际 Phase0 exec ID，例如 `C00-E01`、`C03-OBS-E01`、`C03-PROBE-E01`、`C15-E01`、`C19-E01`、`C20-SEAL-E01`、`C07-B-C19-E01`。
- `allowed_operations`：只放管理/协议操作 ID：`op:publish`、`op:recover`、`op:status`、`op:checker`、`op:undo`、`op:accept`、`op:dispatcher`。
- 两个字段不得混写；每个 code 至少一个非空。
- 通用 I/O code 可使用 `allowed_exec_scope: "all-v10-execs"`，但必须同时绑定 `exec_registry_digest`，checker 展开 58 个实际 exec 并拒绝未知项；不得使用 `*`。

### 2.2 安全分类修正（实际 V9 code 子集）

| code | class | security_trigger | allowed subject |
|---|---|---|---|
| `FM-C00E01-01` 账号/SID 不符 | security | `SEC-IDENTITY` | `C00-E01` |
| `FM-C00E01-02` 非管理员 token | security | `SEC-IDENTITY` | `C00-E01` |
| `FM-C00E01-03` 账号不在批准名单 | security | `SEC-IDENTITY` | `C00-E01` |
| `FM-C00E01-05` runtime 二进制大小/哈希不符 | security | `SEC-TOOL-IDENTITY` | `C00-E01` |
| `FM-C00E01-06` manifest 哈希/schema/关键工具/anchor 不符 | security | `SEC-MANIFEST-IDENTITY` | `C00-E01` |
| `FM-C03OBSE01-01/02` 账号/组身份不符 | security | `SEC-IDENTITY` | `C03-OBS-E01` |
| `FM-C03PROBEE01-01/02/04` 账号/当前账号/组不符 | security | `SEC-IDENTITY` | `C03-PROBE-E01` |
| `FM-C15E01-02` tsc.js 哈希不符 | security | `SEC-TOOL-IDENTITY` | `C15-E01` |
| `FM-C18E01-03` 目的地在保护树 | security | `SEC-DEST-PROTECTED` | `C18-E01` |
| `FM-C18E01-04` 归档字节不符 | security | `SEC-AUDIT-MISMATCH` | `C18-E01` |
| `FM-C19E01-02` 段哈希不符 | security | `SEC-CHAIN-MISMATCH` | `C19-E01` |
| `FM-C20SEALE01-02` 尾不是 segment_close | security | `SEC-CHAIN-MISMATCH` | `C20-SEAL-E01` |
| `FM-C20SEALE01-03` 段摘要不符 | security | `SEC-CHAIN-MISMATCH` | `C20-SEAL-E01` |
| `FM-C20SEALE01-04` summary 哈希不符 | security | `SEC-AUDIT-MISMATCH` | `C20-SEAL-E01` |
| `FM-C20SEALE01-05` staged recheck 不符 | security | `SEC-STAGED-MISMATCH` | `C20-SEAL-E01` |
| `FM-C20SEALE01-06` report 截止点超出尾 | security | `SEC-AUDIT-MISMATCH` | `C20-SEAL-E01` |
| `P47-E-CHAIN-CORRUPT` 已有链损坏 | security | `SEC-CHAIN-MISMATCH` | `C19-E01`, `C20-SEAL-E01`, `op:checker` |
| `P47-E-CHAIN-REMOVED` 已有链被移除 | security | `SEC-CHAIN-MISMATCH` | `C19-E01`, `C20-SEAL-E01` |

普通分类保留示例：

| code | class | security_trigger | 说明 |
|---|---|---|---|
| `FM-C00E01-04` cwd/RUN 冲突 | fatal | null | 运行前置条件 |
| `FM-C14E01-04` 不可逆编辑 | gate | null | 业务 gate |
| `FM-C15E01-01/04` 缺 `--noEmit`/额外 argv | gate | null | 业务 gate |
| `FM-C18E01-01/02` binding 缺失/目的存在 | gate | null | 业务 gate |
| `FM-C19E01-04` cutoff 不等于前一段 close | fatal | null | 账本收尾前置 |
| `FM-C20SEALE01-01` seal 已存在 | fatal | null | 操作冲突 |
| `P47-E-INPUT-HASH` 普通业务数据摘要不符 | fatal | null | 非身份输入 |
| `P47-E-IO` 普通 I/O 失败 | fatal | null | `all-v10-execs` + registry digest |
| `P47-E-UNKNOWN-CODE` 未知/歧义码 | fatal | null | 默认拒绝，不猜 class |
| `P47-E-GATE-BUNDLE` 门禁包缺失/不符 | fatal | null | `op:accept/recover/checker` |

规则：

- `security` 必有非空 `security_trigger`，且属于 `p47-trigger-registry-v10`；`gate|fatal` 的 `security_trigger` 必须 null。
- 通用诊断标签放 `diagnostic_tags`，不借用 `security_trigger`。
- 新增 `SEC-TOOL-IDENTITY`、`SEC-MANIFEST-IDENTITY`；V9 既有 12 个 trigger 原样保留。registry revision、摘要、迁移表钉扎；checker 独立校验集合与归属。
- 合法首次运行无链是 `chain_origin=absent` 的 `no-chain` 状态，不产生安全 code；只有“曾存在后被移除/损坏”才产生 `CHAIN-REMOVED/CORRUPT`。

### 2.3 close 投影

V9 链记录保留 `result`、`exit_code`、`failure_class`、`security_trigger`。`failure_code` 是投影字段：

```text
result=ok                  -> failure_code=null, failure_class=null, security_trigger=null
result=failed|aborted      -> failure_code=derive(exec_id,exit_code,class,trigger)
failure_class=security     -> security_trigger 非空
failure_class=gate|fatal   -> security_trigger=null; diagnostic_tags 可非空
无 close                   -> 不伪造 close；链外记录 observed_failure_code + code_source=launch|operator|none
```

- `derive` 必须唯一；歧义或未知 → `P47-E-UNKNOWN-CODE`，停止并保留现场。
- 链外记录只作非成功证据，不能替代 close 或 seal。
- 验收：C00 manifest/runtime hash、C03 身份、实际链坏 hash、普通 I/O 四类，逐项比较 code/class/trigger/stop/后继/记录。

## 3. T03：单一 stop 与 seal 函数

### 3.1 stop_class

输入：`chain_state`、`failure_class`、`exec_class`、`target_started`、`trusted_close`、`stop_reason`、`staged_state`。

| 条件 | stop_class | 普通业务 | finalizer | 唯一 A | 链追加 | seal |
|---|---|---|---|---|---|---|
| 完整成功 | `COMPLETE` | 否 | 否 | 否 | 否 | `sealed-full` |
| 非安全 gate/fatal，链可信 | `BUSINESS_HALT` | 否 | 是 | 失败目标已启动且 close 可信时恰好一次 | 仅 A/finalizer/seal 协议写 | 见 3.2 |
| security，链可信 | `SECURITY_HALT` | 否 | **否** | 仅失败目标，已启动且 close 可信时一次 | 仅 A/seal 协议写 | `aborted` |
| 链损坏 | `CHAIN_FATAL` | 否 | 否 | 否 | 否 | 无 seal；operator-record |
| open/orphan | `ORPHAN_HALT` | 否 | 否 | 否 | 否 | `aborted` + open_segments |
| 无失败 | `NORMAL` | 是 | 按计划 | 按计划 | 按计划 | 按计划 |

唯一 A 规则：

1. 目标必须实际启动且 close 可信；恰好一个 `C07-A-<target>`。
2. 未启动、skip、链损坏、orphan 均不得有 A。
3. A 自身失败后不再生成第二个 A；按 A 的 close 进入 stop/seal。
4. finalizer 仅 `BUSINESS_HALT` 允许；其 B/A 各恰好一次；B 缺失则 finalizer skip，不伪造 B。`SECURITY_HALT` 不保留 finalizer；此收缩的全部依赖/报告/向量列入迁移清单。

### 3.2 seal_mode

```text
seal_mode(chain_state, failure_class, complete, open_segments):
  corrupt / expected-missing -> NONE
  open_segments 非空          -> aborted
  failure_class=security      -> aborted
  complete 且全部成功          -> sealed-full
  其他（非安全 fatal/gate/skip/不完整） -> degraded-prefix
```

- `sealed-full` 还必须：无 skip、无失败、计划完整、`staged_state=complete`、`staged_recheck=pass`。
- `exit_status` 只用 `complete | aborted | exit-not-met`；`run_state` 只用 `completed | aborted`。
- 取消 `aborted-prefix` 新名；open 场景统一 `aborted` + `open_segments`。schema、文档、flow、checker、向量全部按此同步；不再同时维护两套模式。
- 普通 fatal（无 open）统一 `degraded-prefix/exit-not-met`；security 或 open 场景统一 `aborted`。§1.3 与 §5.4 的冲突以本函数为准。
- `open_segments` 必须如实列出；不补 close；不声明 `sealed-full/complete`。
- 链损坏不生成权威 seal；只保留原链与 `p47-operator-record-v10`。

## 4. T04：保护分层

### 4.1 策略表

| layer | 范围 | 允许主体 | 允许操作 | 生命周期 | 拒绝 |
|---|---|---|---|---|---|
| business/original | ORIGINAL、M0、历史基线 | 无（读按规则） | 只读 | 始终 | 内容 write/delete/rename；ACL 例外仅元数据 |
| business/product-own-part | `out/audit/<own-exec>/<own-part>` | 该 product/业务 exec | create/append | 本段运行期 | 改链、别段、控制文件 |
| control/genesis | `out/audit/chain-head.jsonl` 首记录 | `C01-E01` | create（genesis） | bootstrap | 业务/产品写；后续改 genesis |
| control/segment | 本 exec 的 segment 目录与 open/close | 该 exec + `op:dispatcher` | create/append | 本段运行期 | 写别段；写链头/别段摘要 |
| control/summary | 本段 summary/index | `C19-E01` 等注册主体 | create | close 后 | 改链或别段；seal 后修改 |
| control/seal | `terminal-seal.json` | `C20-SEAL-E01` | create | report/A 后 | 任何 append/覆盖；业务写 |
| staging/tools | `tools/` | `C04-E01` | create | `staged_state=complete` 前 | complete/seal 后任何写；非 C04 写 |

规则：

- 业务/产品不得借普通 allow 突破 protect；只能按独立规则创建自己的分片。
- control 主体只按精确 exec/操作/路径/阶段授权；不能改写别段，不能借 seal 权限改链。
- staging 在 `staged_state=complete` 或封存后不可变；校验后只读。
- C02 ACL 元数据例外仅限明示主体/对象/元数据；内容删除/改名不继承。
- `write_intent` 增加 `layer`、`subject_kind`（exec|operation）、`subject_id`、`protect_rule_id`、`lifecycle_phase`；protect 先于 rule_ref 判定。
- 事件自称“显式授权”或 scenario 参数不改变 protect 结果。

### 4.2 验收

| 用例 | 期望 |
|---|---|
| PROT-T1 | ORIGINAL/M0/历史基线内容 write/delete/rename 拒绝；ACL 元数据例外仅元数据 |
| PROT-T2 | C01 合法 genesis、C19 合法 own-part/summary、C20-SEAL 合法 seal 成功 |
| PROT-T3 | 业务写链头、别段、summary、seal 全部拒绝 |
| PROT-T4 | C04 staging 在 complete 前成功；complete/seal 后任何写拒绝 |
| PROT-T5 | product 创建自己的分片成功；product 改链/别段拒绝 |
| PROT-T6 | 普通 rule_ref/src_rule_ref 试图覆盖 protect 拒绝，记录 protect_reason |

## 5. I01：门禁包绑定

`p47-gate-bundle-v10` 外层：

```json
{"schema":"p47-gate-bundle-v10","txid":"...","rid":"...",
 "old_index_digest":"...","new_index_digest":"...",
 "required_gates":[{"gate_id":"checker","mode":"accepting","subject_id":"op:checker"}],
 "gates":[{"gate_id":"checker","mode":"accepting","subject_id":"op:checker",
   "version":"...","input_digest":"...","result":"PASS",
   "evidence_path":"...","evidence_digest":"...","completed_at":"..."}],
 "tool_versions":{},"policy_digest":"...","canonicalization":"p47-canon-v1",
 "bundle_digest":"..."}
```

- `required_gates` 与 `gates` 的 `gate_id` 集合精确相等；无缺项、无重复、无额外项。
- `input_digest` 覆盖 canonical 输入清单（路径、字节、SHA-256、argv/env 摘要、模式）；`bundle_digest` 覆盖除自身外的 canonical JSON。
- `accept/status/recover` 独立核对 txid/rid、old/new index、工具/策略版本、证据存在与摘要；缺项、重复、错事务、证据不符 → `P47-E-GATE-BUNDLE`，命令码 23。
- `bundle_digest` 只证明字节绑定；完整性由 `required_gates` 集合、证据和独立 checker 的复算/执行记录证明。
- 验收：完整包、缺 gate、重复、错 txid/rid、证据变更、额外 gate、index 不符、policy 不符、bundle 前中断。

## 6. I02：文件/目录前缀转换

选择：**预检拒绝，不在事务内支持 `file↔dir` 前缀转换。**

- 预检发现 `old={a文件}`→`new={a/b}`、反向、同路径 file/dir 冲突、大小写变体冲突，返回 `PATH_CONFLICT`（命令码 27）。
- 零写入、零备份；旧集合不变；不进入 `switching`。
- 限制声明：需要转换时由操作者在事务外单独迁移、重新审批，再发起新事务。
- 验收：file→dir、dir→file、前缀碰撞、大小写变体全部拒绝；`old` 集合逐文件不变。

## 7. I03：链格式

选择：**保留 V9 链格式**，不采用 `seq=0/prev_hash=GENESIS` 新简写。

- schema：`p47-chain-record-v9`；首记录 `record=genesis`，`chain_seq=1`，`prev_record_sha256=null`，`prev_file_bytes=0`。
- 后续 `chain_seq=prev+1`；`prev_record_sha256=sha256(canonical JSON 不含 LF)`；`prev_file_bytes` 统计此前所有记录字节（含每个 LF）。
- 每行 = canonical JSON + 单个 LF；canonical 规则固定并钉扎。
- 全量 fixture、validator、seal/flow 使用同一 schema；不混用新旧字段。
- 以上字段与 V9 `p0v9-audit.cjs` 的 genesis/segment schema 及 `canon` + LF 规则一致（静态读取，未执行）。
- 合法首次无链：`chain_origin=absent` 且 `no-chain`，不生成安全 code；已有链被移除/损坏才生成 `CHAIN-REMOVED/CORRUPT`。
- 验收：genesis、正常 open/close、bad hash、seq gap、prev_file_bytes 少/多 LF、合法无链与非法缺失区分。

## 8. 验收汇总

| 项 | 必须通过 |
|---|---|
| T01 | LOCK-T1—T6；死亡 reclaim 一律 BLOCKED_MANUAL；无 rename 自动隔离 |
| T02 | C00 manifest/runtime、C03 身份、链坏 hash、普通 I/O；code/class/trigger/exec/operation 命名空间正确 |
| T03 | stop_class 全表；唯一 A；finalizer 范围；seal 单一函数；open/security/fatal/skip 模式一致 |
| T04 | 合法 control/staging 写成功；业务越层写拒绝；ACL 例外不扩展 |
| I01 | gate bundle 完整/缺项/重复/错事务/证据不符 |
| I02 | file↔dir 转换预检零写入拒绝 |
| I03 | V9 链格式全向量；合法无链与非法缺失区分 |

## 9. 未执行声明

未修改 V9/V8/V7；未实施 V10；未运行发布器、恢复器、lab、附件脚本；未执行 C00—C20、Phase 0、浏览器/L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未改 ACL。
