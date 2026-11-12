# OB-Recover Phase 4.7：Phase 0 审计规范 V9（正式候选，待第十二轮独立复核）

日期：2026-11-12。本规范定义事件、链记录、summary 与终端封存；检查器 `p0v9-check.cjs` 独立实现这些规则，不 import 生成器或本规范的字段表。

## 1. 标记与字节

- 事件流：每个执行每个角色一个 JSONL 分片；每行 = canonical JSON + 一个 LF；分片只追加，先写意图、后写结果。
- 链：`out\audit\chain-head.jsonl`；每行 = canonical JSON + 一个 LF；`prev_file_bytes` 是写入该记录之前的物理字节数（含所有 LF）。
- canonical：键按字典序、无空格、只允许 `[a-z0-9_]` 键名、整数必须是安全整数、字符串不允许孤立代理项。
- 禁止 BOM、CR、尾随空格；summary 不含自身哈希，不含链引用。

## 2. 分片、角色与目录

- 分片名：`events-<role>-<pid>-<rand8>.jsonl`，role ∈ dispatcher|tool|observer|product。
- 每个执行的 `audit_part_rule.roles` 决定允许的角色；dispatcher 写 `exec_begin/exec_end`，tool/observer/product 写各自的业务事件。
- 分片目录 = `out\audit\<Cxx>\<exec-id>\`；目录创建属于 control 层；业务进程只在已存在的目录内 CreateNew 自己的分片。
- 控制层只读链尾与本段 parts/summary；不得读取业务数据。

## 3. 事件字段

公共字段：`schema/event_id/exec_id/part_id/seq/prev_event_sha256/kind/wall_time_utc/actor/role`。

| kind | 关键必填 | 关键禁止/关系 |
|---|---|---|
| exec_begin | argv_sha256、cwd、entry_path、entry_sha256、pid、ppid | argv/entry/cwd 必须等于注册表；begin 不得声称 outcome |
| exec_end | exit_code、started_utc、ended_utc、child_exit_codes | 不是写事件 |
| write_intent | intent_id、op、path、path_kind、src_path、rule_ref、decision、before | `intent_id=event_id`；路径必须 canonical 绝对；rule_ref 必须原始层正确（product 事件只能引 product_writes，其他 role 只能引 business_writes）、解引用到该执行、覆盖路径，且 `op` 被规则的 `op` 允许；rename/copy 的 `src_path` 必须可读；非 rename/copy 必须为 null |
| write_result | intent_ref、outcome、error_code、after、bytes_written、durable | 必须引用同分片、同执行、更早的 intent；每个 intent **恰好一个** result（缺失即 `schema.intent_unpaired`）；ok ⇒ error_code=null、durable=true；append 的 bytes_written 是本次增量且 ≤ after.bytes（最终长度），create/overwrite/copy 才要求等于 after.bytes |
| read_batch | mode、entries、counts | entries 非空；每个 ok 条目必须解引用读规则、覆盖路径且不落在 deny 根下；counts 必须等于逐条统计 |
| preload | guard_pid、parent_pid、process_role、guard_sha256、argv_sha256、policy_sha256、inherited_env_keys | policy_sha256 必须等于该执行的登记 policy：product 事件等于 `product.policy_sha256`，其他 role 等于 `guard.policy_sha256`；不符即 `perm.preload_policy` |
| observe_start | observed_account、observed_sid、nonce、deadline_seconds | nonce 64 hex；deadline=900 |
| observe_relay | line_sha256、line_bytes、verdict、reason、reported_*、nonce_match | line_bytes ≤ 4096；verdict=ok ⇒ reason=null |
| observe_end | relay_seen、verdict、exit_code | 只存 relay 哈希，不存正文 |

闭合字段：出现不在公共字段、该 kind 必填字段、该 kind 禁止字段内的键，一律拒绝（`schema.closed`）。

## 4. 写意图与写结果

1. intent 的 `op` ∈ create|overwrite|append|mkdir|rename|copy|acl|delete；`path_kind` ∈ file|dir|tree。
2. intent 的 `decision` 只能是 `allow`；拒绝写不得先记一条 allow 意图再记 denied 结果。
3. result 的 `outcome` ∈ ok|denied|error|skipped；非 ok 时 `error_code` 必填、`after`/`bytes_written` 必须为 null。
4. ok 且 op 写字节时：create/overwrite/copy 的 `bytes_written` 等于 `after.bytes`；append 的 `bytes_written` 是本次追加量、必须 ≤ `after.bytes`；`after.sha256` 为 64 hex。
5. `durable=true` 只在 flush/fsync 后；ok 必须 durable。
6. 写路径必须被其 `rule_ref` 指向的规则覆盖；规则的 `kind` 决定是否允许子树（`subtree-write` 才允许后代）。
7. 操作必须被规则允许：create→file/dir/subtree create 类；overwrite/append→file-write/file-append/subtree-write；mkdir→dir-create；rename/copy/delete→subtree-write；acl→acl-set-recursive。
8. 非 acl 写不得与 `protect_write` 相交；acl 是元数据写例外，但必须 SDDL 回读。

## 5. 读批次

1. `mode` ∈ content|metadata；`entries` 非空。
2. 每个条目：path、path_kind、rule_ref、result、bytes、sha256、error_code。
3. `result=ok`：必须由**原始层**正确的读规则覆盖（product→product_reads，其他→business_reads）；不得与 deny_read 相交（相交时只报 deny，不再报 scope）；content 读必须有 bytes 与 sha256。
4. `result=denied` 且无匹配规则时 rule_ref 可为 null；`absent`/`unlisted` 记录原因码。
5. `counts` 必须恰好四个键且等于逐条统计；多一个键即拒绝。

## 6. 链记录

| record | 必填 | 关系 |
|---|---|---|
| genesis | chain_seq=1、prev=null、prev_file_bytes=0、run_id、registry_sha256、manifest_sha256、verifier_result=pass、bootstrap[] | 只能位于文件首行 |
| segment_open | exec、command、args_sha256、cwd、entry_path、entry_sha256、planned_predecessor、c18_*、segment_dir | exec 必须注册；argv/entry/cwd 等于注册表；前驱等于该顺序的前一项；C18 之外 c18_* 必须为 null；不得连着两个 open |
| segment_close | result、exit_code、failure_class、security_trigger、parts[]、events_total、unpaired_intents、segment_digest、summary_*、outputs[]、child_exit_codes | 必须对应当前 open；ok ⇒ class/trigger=null；failed/aborted ⇒ class ∈ gate|fatal|security；security ⇒ trigger ∈ 发布集合；`segment_digest=sha256(canon(parts))`；`events_total=Σparts.events` |
| segment_skip | reason、failed_dependency、skipped_utc | reason ∈ dependency-failed|target-skipped|c18-unbound|run-stopped；dependency-failed/target-skipped 的 failed_dependency 必须是更早的 failed/skipped；只有 run-stopped 允许指向一个 open（dispatcher 死亡）；c18-unbound 必须为 null 且此前有 BIND disabled-unbound；skip 不得带 segment_dir/summary |

物理检查：`chain_seq` 逐条 +1；`prev_record_sha256` 等于上一条 canonical 的 sha256；`prev_file_bytes` 等于上一条的 `prev_file_bytes + utf8(上一条 canonical) + 1`。

## 7. summary 与终端封存

summary：`schema= p47-segment-summary-v9`、result/exit_code/failure_class/security_trigger、parts、counts、unpaired_intents、outputs、child_exit_codes、sealed_utc；禁止 `summary_sha256` 与 `prev_record_sha256`。

终端封存：`schema=p47-terminal-seal-v9`，字段与判定见主文档第 6 节与 `PHASE4.7-PHASE0-V9-FAILURE-MODEL.md`。关键硬规则：

1. `sealed-full` ⇒ staged_state=complete、run_state=completed、无 open_segments、index 与 report 均 present。**允许** failed/skipped/gate_failed（gate 失败后的完整证据封存）；只有三者全空且 C18 bound 才 `exit_status=complete`。
2. `aborted` ⇒ staged_state=complete、run_state=aborted、abort 非 null。
3. `degraded-prefix` ⇒ staged_state≠complete。
4. `skipped/not_started/gate_failed` 三者两两不相交。
5. `security_findings` 只能取发布过的 trigger id。
6. 封存不追加链记录；开放段只描述，不补造 close/summary。

## 8. 因果与流回放

检查器对链片段执行独立回放：

1. 失败**或 aborted** 目标若有 after 包装，其 `C07-A` 必须在下一条业务记录之前出现；片段结束时仍有 pending after 同样报 `flow.missing_after`。
2. security close 之后，除该目标的 A 与 skip/seal 外，任何 target/finalizer/bind 的 open/close 都是 `flow.after_halt`。
3. `segment_skip` 的失败来源必须在同一链片段中已经 failed/skipped；只有 run-stopped 允许 open。
4. 报告路径（C17/C19/REPORT/SEAL）消费 `recorded` 终态；跳过不伪造成功。

## 9. 测试向量

- 正例 58 项：8 canonical、5 分片、19 事件、17 链记录、1 summary、5 seal（含 sealed-full 带失败/跳过的正式正例）。
- 负例 41 条，每条只注入一个语义错误；改名/改路径后重算 seq/prev，避免链式级联。`jsonl_truncated_without_lf` 交付真实字节流（hex），解析器必须报告 `bytes.truncated`。
- 检查器断言“恰好一个错误且等于期望码”；不接受“有错即可”。新增 op 越权、intent 未配对、product 引用 business rule、错误 preload policy、aborted 缺 after、sealed-full+complete+skipped。

## 10. 未验证

真实 writer 的 append/fsync/锁/恢复、`FileShare.Read` 与装载窗口、真实并发与 FD、NTFS 重解析/硬链接/8.3 别名、外部进程篡改、断电与磁盘错误均未验证；append 的增量语义也没有运行证据。静态 schema 与向量通过不等于运行通过。

<!-- GENERATED:BEGIN (p0v9-build.cjs) -->
