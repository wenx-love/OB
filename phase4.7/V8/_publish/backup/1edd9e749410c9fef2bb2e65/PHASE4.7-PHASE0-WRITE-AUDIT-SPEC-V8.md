# OB-Recover Phase 4.7：Phase 0 审计规范 V8（正式候选，待第十一轮独立复核）

日期：2026-11-11。本规范定义事件、链记录、summary 与终端封存；检查器 `p0v8-check.cjs` 独立实现这些规则，不 import 生成器或本规范的字段表。

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
| write_intent | intent_id、op、path、path_kind、src_path、rule_ref、decision、before | `intent_id=event_id`；路径必须 canonical 绝对；rule_ref 必须解引用到该执行的写列表并覆盖该路径 |
| write_result | intent_ref、outcome、error_code、after、bytes_written、durable | 必须引用同分片、同执行、更早的 intent；每个 intent 恰好一个 result；ok ⇒ error_code=null、durable=true、after 与 bytes 一致 |
| read_batch | mode、entries、counts | entries 非空；每个 ok 条目必须解引用读规则、覆盖路径且不落在 deny 根下；counts 必须等于逐条统计 |
| preload | guard_pid、parent_pid、process_role、guard_sha256、argv_sha256、policy_sha256、inherited_env_keys | policy_sha256 必须等于该执行 guard policy |
| observe_start | observed_account、observed_sid、nonce、deadline_seconds | nonce 64 hex；deadline=900 |
| observe_relay | line_sha256、line_bytes、verdict、reason、reported_*、nonce_match | line_bytes ≤ 4096；verdict=ok ⇒ reason=null |
| observe_end | relay_seen、verdict、exit_code | 只存 relay 哈希，不存正文 |

闭合字段：出现不在公共字段、该 kind 必填字段、该 kind 禁止字段内的键，一律拒绝（`schema.closed`）。

## 4. 写意图与写结果

1. intent 的 `op` ∈ create|overwrite|append|mkdir|rename|copy|acl|delete；`path_kind` ∈ file|dir|tree。
2. intent 的 `decision` 只能是 `allow`；拒绝写不得先记一条 allow 意图再记 denied 结果。
3. result 的 `outcome` ∈ ok|denied|error|skipped；非 ok 时 `error_code` 必填、`after`/`bytes_written` 必须为 null。
4. ok 且 op 写字节时，`bytes_written` 必须等于 `after.bytes`；`after.sha256` 为 64 hex。
5. `durable=true` 只在 flush/fsync 后；ok 必须 durable。
6. 写路径必须被其 `rule_ref` 指向的规则覆盖；规则的 `kind` 决定是否允许子树（`subtree-write` 才允许后代）。

## 5. 读批次

1. `mode` ∈ content|metadata；`entries` 非空。
2. 每个条目：path、path_kind、rule_ref、result、bytes、sha256、error_code。
3. `result=ok`：必须由读规则覆盖；不得与 deny_read 相交（相交时只报 deny，不再报 scope）；content 读必须有 bytes 与 sha256。
4. `result=denied` 且无匹配规则时 rule_ref 可为 null；`absent`/`unlisted` 记录原因码。
5. `counts` 必须恰好四个键且等于逐条统计；多一个键即拒绝。

## 6. 链记录

| record | 必填 | 关系 |
|---|---|---|
| genesis | chain_seq=1、prev=null、prev_file_bytes=0、run_id、registry_sha256、manifest_sha256、verifier_result=pass、bootstrap[] | 只能位于文件首行 |
| segment_open | exec、command、args_sha256、cwd、entry_path、entry_sha256、planned_predecessor、c18_*、segment_dir | exec 必须注册；argv/entry/cwd 等于注册表；前驱等于该顺序的前一项；C18 之外 c18_* 必须为 null；不得连着两个 open |
| segment_close | result、exit_code、failure_class、security_trigger、parts[]、events_total、unpaired_intents、segment_digest、summary_*、outputs[]、child_exit_codes | 必须对应当前 open；ok ⇒ class/trigger=null；failed/aborted ⇒ class ∈ gate|fatal|security；security ⇒ trigger ∈ 发布集合；`segment_digest=sha256(canon(parts))`；`events_total=Σparts.events` |
| segment_skip | reason、failed_dependency、skipped_utc | reason ∈ dependency-failed|target-skipped|c18-unbound|run-stopped；前三者的 failed_dependency 必须是更早的 failed/skipped 执行；c18-unbound 必须为 null 且此前有 BIND disabled-unbound；skip 不得带 segment_dir/summary |

物理检查：`chain_seq` 逐条 +1；`prev_record_sha256` 等于上一条 canonical 的 sha256；`prev_file_bytes` 等于上一条的 `prev_file_bytes + utf8(上一条 canonical) + 1`。

## 7. summary 与终端封存

summary：`schema= p47-segment-summary-v3`、result/exit_code/failure_class/security_trigger、parts、counts、unpaired_intents、outputs、child_exit_codes、sealed_utc；禁止 `summary_sha256` 与 `prev_record_sha256`。

终端封存：`schema=p47-terminal-seal-v3`，字段与判定见主文档第 6 节与 `PHASE4.7-PHASE0-V8-FAILURE-MODEL.md`。关键硬规则：

1. `sealed-full` ⇒ staged_state=complete、run_state=completed、无 open_segments、无 skipped、无 gate_failed、index 与 report 均 present。
2. `aborted` ⇒ staged_state=complete、run_state=aborted、abort 非 null。
3. `degraded-prefix` ⇒ staged_state≠complete。
4. `skipped/not_started/gate_failed` 三者两两不相交。
5. `security_findings` 只能取发布过的 trigger id。
6. 封存不追加链记录；开放段只描述，不补造 close/summary。

## 8. 因果与流回放

检查器对链片段执行独立回放：

1. 失败目标若有 after 包装，其 `C07-A` 必须在下一条业务记录之前出现；否则 `flow.missing_after`。
2. security close 之后，除该目标的 A 与 skip/seal 外，任何 target/finalizer/bind 的 open/close 都是 `flow.after_halt`。
3. `segment_skip` 的失败来源必须在同一链片段中已经 failed/skipped。
4. 报告路径（C17/C19/REPORT/SEAL）消费 `recorded` 终态；跳过不伪造成功。

## 9. 测试向量

- 正例 57 项：8 canonical、5 分片、19 事件、17 链记录、1 summary、4 seal。
- 负例 35 条，每条只注入一个语义错误；改名/改路径后重算 seq/prev，避免链式级联。`jsonl_truncated_without_lf` 交付真实字节流（hex），解析器必须报告 `bytes.truncated`。
- 检查器断言“恰好一个错误且等于期望码”；不接受“有错即可”。

## 10. 未验证

真实 writer 的 append/fsync/锁/恢复、`FileShare.Read` 与装载窗口、真实并发与 FD、NTFS 重解析/硬链接/8.3 别名、外部进程篡改、断电与磁盘错误均未验证。静态 schema 与向量通过不等于运行通过。

<!-- GENERATED:BEGIN (p0v8-build.cjs) -->

## Appendix A：事件字段规则（生成）

### exec_begin

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `argv_sha256` | required | canonical argv hash; equals the registered argv hash |
| `cwd` | required | absolute |
| `entry_path` | required | absolute; equals the registered entry_path |
| `entry_sha256` | required | byte hash |
| `pid` | required | integer |
| `ppid` | required | integer |
| `outcome` | forbidden | begin cannot claim an outcome |

### exec_end

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `exit_code` | required | integer |
| `started_utc` | required | ISO 8601 UTC |
| `ended_utc` | required | ISO 8601 UTC |
| `child_exit_codes` | required | array of {pid, code} |
| `write_intent` | forbidden | end is not a write |

### write_intent

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `intent_id` | required | exactly equal to event_id |
| `op` | required | create \| overwrite \| append \| mkdir \| rename \| copy \| acl \| delete |
| `path` | required | canonical absolute path |
| `path_kind` | required | file \| dir \| tree |
| `src_path` | required | null unless rename/copy |
| `rule_ref` | required | permission entry id <exec>.<layer>[index] |
| `decision` | required | const 'allow' |
| `before` | required | null when absent; else {exists, bytes, sha256, mtime_utc, sddl} |
| `outcome` | forbidden | not known before the action |
| `error_code` | forbidden | not known before |
| `after` | forbidden | not known before |
| `bytes_written` | forbidden | not known before |

### write_result

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `intent_ref` | required | event_id of a write_intent in the same part, same exec, earlier seq |
| `outcome` | required | ok \| denied \| error \| skipped |
| `error_code` | required | null only when ok |
| `after` | required | null unless ok |
| `bytes_written` | required | null unless ok and op writes bytes |
| `durable` | required | true only after flush/fsync; must be true when ok |
| `op` | forbidden | reference only |
| `path` | forbidden | reference only |
| `src_path` | forbidden | reference only |
| `rule_ref` | forbidden | reference only |
| `before` | forbidden | reference only |

### read_batch

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `mode` | required | content \| metadata |
| `entries` | required | non-empty array of {path, path_kind, rule_ref, result, bytes, sha256, error_code} |
| `counts` | required | {ok, denied, absent, unlisted} |
| `outcome` | forbidden | per-entry result only |

### preload

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `guard_pid` | required | integer |
| `parent_pid` | required | integer |
| `process_role` | required | runner \| tool \| main \| worker \| product |
| `guard_sha256` | required | byte hash |
| `argv_sha256` | required | canonical process argv hash |
| `policy_sha256` | required | static policy hash |
| `inherited_env_keys` | required | sorted P0_GUARD_* keys |

### observe_start

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `observed_account` | required | one of the two Codex names |
| `observed_sid` | required | resolved SID |
| `nonce` | required | 64 lowercase hex |
| `deadline_seconds` | required | integer 900 |
| `stdout` | forbidden | no relay text as a field |

### observe_relay

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `line_sha256` | required | sha256 of the relayed line bytes |
| `line_bytes` | required | integer <= 4096 |
| `verdict` | required | ok \| reject |
| `reason` | required | null when ok; else schema \| nonce \| account \| sid \| admin \| group \| sentinel \| write \| cwd |
| `reported_account` | required | account reported by the probe |
| `reported_sid` | required | SID reported by the probe |
| `reported_write_result` | required | denied \| granted \| error |
| `nonce_match` | required | boolean |

### observe_end

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v3' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | const 'WENX\Administrator' |
| `role` | required | dispatcher \| tool \| observer \| product; must also appear in the exec's audit_part_rule.roles |
| `relay_seen` | required | boolean |
| `verdict` | required | pass \| fail |
| `exit_code` | required | integer |
| `relay_line` | forbidden | only the hash is stored |

## Appendix B：链头记录字段（生成）

### genesis

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v4' |
| `record` | required | const 'genesis' |
| `chain_seq` | required | integer 1 |
| `prev_record_sha256` | required | null |
| `prev_file_bytes` | required | 0 |
| `run_id` | required | const |
| `created_utc` | required | ISO 8601 UTC |
| `registry_sha256` | required | registry hash |
| `manifest_sha256` | required | manifest hash |
| `verifier_result` | required | const 'pass' |
| `bootstrap` | required | enumerated [{op, path, result}] |
| `writer` | required | WENX\Administrator |
| `writer_tool_sha256` | required | byte hash |

### segment_open

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v4' |
| `record` | required | const 'segment_open' |
| `chain_seq` | required | previous + 1 |
| `prev_record_sha256` | required | previous record sha256 |
| `prev_file_bytes` | required | physical bytes before this record, LF included |
| `exec_id` | required | registered exec |
| `command_id` | required | C00-C20 |
| `args_sha256` | required | dispatcher argv hash |
| `cwd` | required | absolute |
| `entry_path` | required | absolute |
| `entry_sha256` | required | byte hash |
| `planned_predecessor` | required | exec id or null; equals the order-selected predecessor |
| `c18_state` | required | null except C18-BIND-E01: bound \| disabled-unbound |
| `c18_binding_sha256` | required | null except C18-BIND-E01 when bound |
| `c18_destination` | required | null except C18-BIND-E01 when bound |
| `segment_dir` | required | absolute; must not exist |

### segment_close

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v4' |
| `record` | required | const 'segment_close' |
| `chain_seq` | required | previous + 1 |
| `prev_record_sha256` | required | open record sha256 |
| `prev_file_bytes` | required | physical bytes before this record |
| `exec_id` | required | matches open |
| `command_id` | required | matches open |
| `result` | required | ok \| failed \| aborted |
| `exit_code` | required | integer |
| `failure_class` | required | null when ok; gate \| fatal \| security otherwise |
| `security_trigger` | required | null unless failure_class=security; one of the published trigger ids |
| `parts` | required | array of {name, bytes, sha256, events, first_seq, last_seq} |
| `events_total` | required | integer |
| `unpaired_intents` | required | integer; 0 for ok |
| `segment_digest` | required | sha256 of the canonical parts array |
| `summary_path` | required | absolute |
| `summary_sha256` | required | null only when summary creation failed |
| `summary_bytes` | required | null under the same condition |
| `outputs` | required | array of {path, bytes, sha256, kind} |
| `child_exit_codes` | required | array of {pid, code} |

### segment_skip

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v4' |
| `record` | required | const 'segment_skip' |
| `chain_seq` | required | previous + 1 |
| `prev_record_sha256` | required | previous record sha256 |
| `prev_file_bytes` | required | physical bytes before this record |
| `exec_id` | required | skipped exec |
| `command_id` | required | C00-C20 |
| `reason` | required | dependency-failed \| target-skipped \| c18-unbound \| run-stopped |
| `failed_dependency` | required | exec id for dependency-failed/target-skipped/run-stopped; null for c18-unbound |
| `skipped_utc` | required | ISO 8601 UTC |
| `segment_dir` | forbidden | a skipped execution has no segment directory |
| `summary_path` | forbidden | a skipped execution has no summary |

## Appendix C：summary 与终端封存字段（生成）

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-segment-summary-v3' |
| `run_id` | required | const |
| `exec_id` | required | matches chain |
| `command_id` | required | C00-C20 |
| `result` | required | ok \| failed \| aborted |
| `exit_code` | required | integer |
| `failure_class` | required | null when ok |
| `security_trigger` | required | null unless security |
| `parts` | required | same array as segment_close |
| `counts` | required | {events, write_intent, write_result, read_entries, denied, preload} |
| `unpaired_intents` | required | integer |
| `outputs` | required | same array as segment_close |
| `child_exit_codes` | required | array |
| `sealed_utc` | required | ISO 8601 UTC |
| `summary_sha256` | forbidden | no self hash |
| `prev_record_sha256` | forbidden | no chain reference |

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-terminal-seal-v3' |
| `run_id` | required | const |
| `mode` | required | sealed-full \| degraded-prefix \| aborted |
| `chain` | required | {records, last_seq, last_record_sha256, tail_kind, verified} |
| `staged_state` | required | complete \| incomplete \| absent |
| `run_state` | required | completed \| aborted |
| `abort` | required | null when completed; else {exec_id, failure_class, security_trigger} |
| `open_segments` | required | array of {exec_id, parts_state, summary_state, close_state, evidence_status} |
| `skipped` | required | array of exec ids |
| `not_started` | required | array of exec ids |
| `gate_failed` | required | array of exec ids |
| `segment_counts` | required | {opened, closed, skipped, orphaned} |
| `index` | required | {present, path, sha256} |
| `report` | required | {present, path, sha256} |
| `c18_state` | required | bound \| disabled-unbound \| not-reached |
| `staged_recheck` | required | {performed, result} |
| `exit_status` | required | complete \| exit-not-met |
| `security_findings` | required | array of trigger ids |
| `sealed_utc` | required | ISO 8601 UTC |

## Appendix D：测试向量索引（生成）

向量文件：`PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json`，107767 字节，SHA-256 `5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa`。

| 组 | 名称 | SHA-256 |
|---|---|---|
| valid | empty_object | `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` |
| valid | nested | `f426340fb0f8ceb8c7e4a2242924c193e71b8340bdf1f0c13fb8599ecbb54c02` |
| valid | key_order | `e6a3385fb77c287a712e7f406a451727f0625041823ecf23bea7ef39b2e39805` |
| valid | string_escapes | `ffe1bae8c441e18a564f9b3196be0c66f69115bdd898199b536b0f2539eb3edd` |
| valid | astral_char | `f9949e1006d1ca22bc0b60ea94f09779f11a8f0a29bae250fc7ab313d879f5e7` |
| valid | integer_limits | `ff08a430572ed67ffcd8807007946c23a445af4e43e695716251377d96c8d9c1` |
| valid | negative_zero | `ec4f95abcb4e2e3dbe856c3eb2f81995eacb3823d40aa2e78ed4c5e1798f664d` |
| valid | bools_and_null | `6419b83189a8c53cc82ebe097de5de8573a3a9a41ba421a55f570caedfea022b` |
| part | C01_dispatcher_part | `e5de5b34f75b435ec149ec46945345d467df200bb6740c701f1f2fdb954219c1` |
| part | C01_tool_part | `1f00b74ab675ff5e7c6e1d1693daee4afff19fdb8f97a70637f54bf1dcd4013f` |
| part | C19_tool_part | `07ae843b8f3c51d28804b1c59ff21c23cb80dbee90a6c690eb28e6f1ec432498` |
| part | C10P_product_part | `e49a77cc0346e5ef52550ed71cefbba04a8d53dde6e94d6c8f93e3733dec8704` |
| part | C03_observer_part | `ef5151ed62ffd8e61e117845c585205b6af545073fc14d2999af0e6fd70e8ac5` |
| chain/c01_genesis | genesis | `61d24d93787c23469241bf442a61df049682f2d866564a195284646d79c4cd42` |
| chain/c01_genesis | segment_open | `7ce08fe3f5dc83a6542e85e6796cc2e7458f87ede45a4774f9d0fc90b5f62220` |
| chain/c01_genesis | segment_close | `ef8380c41f6e2dafbb65a704d8e7485a1ae6fa917e35522947507d797f0ca5a3` |
| chain/gate_excerpt | segment_open_41 | `137ad8794e3d0ec0edd0d972118978c03798266fc776716016336b1c52dcb870` |
| chain/gate_excerpt | segment_close_42 | `36c91c535dfb3e877394477b0501113fb9c609425d88237bdce233040a99c13f` |
| chain/gate_excerpt | segment_open_43 | `9ebbe50fbf94fd2ffdca6ffe98fb1f76ad062859978f0219632f22b048fbddf1` |
| chain/gate_excerpt | segment_close_44 | `414e122372e83f38db6682b81bc88e4d18d0adb668367a93b45219a5e0767e44` |
| chain/gate_excerpt | segment_skip_45 | `90a66c6f460459b4c7b251b673443063dbd80415e50151c6960f4c124a456efa` |
| chain/gate_excerpt | segment_skip_46 | `abaede5b1cb27adbe1710a44fcddbd0af1dacda9a3ea9bd99d26e35f985af4ec` |
| chain/gate_excerpt | segment_skip_47 | `1e3c9798d589aa86e7a530614b18b08ffea3914a5a955e189d82bd4842ecc456` |
| chain/gate_excerpt | segment_open_48 | `4bf237427fda0946955246aaaaf917caead7a4f198610cbe630e86fcac85629d` |
| chain/gate_excerpt | segment_close_49 | `64bd78929bacf3df06ab94054d6252ac191db533e387adaa200135bb742e376a` |
| chain/security_excerpt | segment_open_61 | `f3e4b2576db11df47c649597c3c2759b78f449098612f3a90d606b763c8d47d9` |
| chain/security_excerpt | segment_close_62 | `cf96475c652f04811e73fb21c5629b00cfe750aa1df8d5abea64f63953dd1511` |
| chain/security_excerpt | segment_open_63 | `dc124f72cf0585c96eb361fa4733a35b5f9a5b0c559413c5af80d013e51135ff` |
| chain/security_excerpt | segment_close_64 | `cea178a71d25ec82ef57847157f7939e79700e4e23dac5e1fe26b05414580f0d` |
| chain/security_excerpt | segment_skip_65 | `383ae48c0d1c93973060c2d86469ed22ff82b8b8a9a33ecd5aece5430d0809a8` |
| chain/security_excerpt | segment_skip_66 | `9b37e46c70b5e710679ebf3375708efc43263325514bb6a9e89ecc3695d1b1b1` |
| chain/orphan_excerpt | segment_open_81 | `53d600e1eeca004b515255acffb1cd641648c44e230d15d5c6c9db4c036ef350` |
| chain/orphan_excerpt | segment_skip_82 | `936a943ca18bd8dffca428bd3856d42868f42cf27a49b3ab3be674d392bc0641` |
| summary | C01_summary | `437ec5c64690e732e63db6a4811cf6bb10a379ff2a2b47856a54a935af944444` |
| seal | seal_0 | `a6d5f939bc0d0e00cfa3ce9f8e256f768544510bf1ff64a1b52a66da134f3deb` |
| seal | seal_1 | `c04b97ab5b586175422a3b4b8f45ed2892d22a9fbe4162ebca8e0e9ed7fb0fd7` |
| seal | seal_2 | `74e847309db16ea1fece779d5a3ac40cc7283814a82560af693195c55d0b0f13` |
| seal | seal_3 | `53029bdee4babb74bcf0576d42d8a69acb6a16017d423640c7a7cf77967ff0b4` |

## Appendix E：负例清单（生成）

| 负例 | 期望错误码 |
|---|---|
| event_role_not_in_enum | `schema.role` |
| event_role_not_allowed_for_exec | `perm.role` |
| read_ok_inside_deny_root | `perm.deny_read` |
| read_rule_ref_unresolved | `perm.rule_ref` |
| write_not_covered_by_rule | `perm.write_scope` |
| result_before_intent | `schema.intent_order` |
| duplicate_result_for_intent | `schema.intent_unique` |
| ok_result_not_durable | `schema.durable` |
| ok_result_bytes_mismatch | `schema.bytes` |
| ok_result_with_error_code | `schema.error_code` |
| read_counts_mismatch | `schema.counts` |
| event_exec_not_registered | `schema.exec_registered` |
| duplicate_event_id | `schema.unique` |
| event_seq_gap | `schema.seq` |
| event_prev_hash_mismatch | `schema.prev` |
| event_actor_not_admin | `schema.actor` |
| event_extra_field | `schema.closed` |
| intent_has_outcome | `schema.forbidden` |
| jsonl_truncated_without_lf | `bytes.truncated` |
| chain_seq_gap | `chain.seq` |
| chain_prev_mismatch | `chain.prev` |
| chain_prev_bytes_missing_lf | `chain.bytes` |
| chain_exec_not_registered | `chain.exec_registered` |
| chain_close_without_open | `chain.pair` |
| chain_failed_without_class | `chain.failure_class` |
| chain_security_without_trigger | `chain.trigger` |
| chain_skip_reason_unknown | `chain.reason` |
| chain_skip_without_failed_cause | `chain.skip_cause` |
| flow_failed_target_without_after | `flow.missing_after` |
| flow_business_after_security_halt | `flow.after_halt` |
| seal_full_with_incomplete_staging | `seal.mode` |
| seal_overlapping_partitions | `seal.partition` |
| summary_self_hash | `schema.forbidden` |
| chain_planned_predecessor_mismatch | `chain.predecessor` |
| chain_part_digest_mismatch | `chain.parts` |

<!-- GENERATED:END -->
