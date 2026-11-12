# OB-Recover Phase 4.7：Phase 0 审计规范 V6（正式候选，待第九轮独立复核）

日期：2026-11-11。性质：执行前审计契约。不执行命令，不创建 `D:\P47RUN`，不改 ACL 或产品。

## 1. 落点与主体

```text
RUN\out\audit\chain-head.jsonl                              链头
RUN\out\audit\Cxx\<exec>\events-<role>-<pid>-<rand8>.jsonl  每进程分片
RUN\out\audit\Cxx\<exec>\summary.json                       段摘要
RUN\out\audit\terminal-seal.json                            终端封存
RUN\out\Cxx\<exec>\...                                      命令结果
```

| 对象 | 唯一写入者 | 读者 | 业务进程 |
|---|---|---|---|
| 链头 | `p0-audit.cjs`（dispatcher open/seal/close、terminal-seal） | dispatcher、C19、C20-REPORT、C20-SEAL | 零 |
| 分片 | 各进程自身（`fs-guard.cjs`） | 同段 seal | 只写自己的分片 |
| summary | `p0-audit.cjs` seal | 同段 close、C19、C20 | 零 |
| 终端封存 | `p0-audit.cjs` terminal-seal | 外部复核 | 零 |

C01 同时是 genesis 与普通参与者：先写 genesis，再写自己的 `segment_open`/`segment_close`，因此计数为 1 + 2×54（绑定）。

## 2. 分片与事件链

- 分片名固定 `events-<role>-<pid>-<rand8>.jsonl`；`role ∈ {dispatcher, tool, observer, product, control}`。
- 一行一个事件：**canonical JSON + 一个 LF**，UTF-8 无 BOM。
- `seq` 从 1 连续；`prev_event_sha256` 为上一事件 canonical 文本的 SHA-256，`seq=1` 为 null。
- 分片写入使用 CreateNew + 追加；不重命名、不删除、不修改既有行。
- `write_result.intent_ref` 必须指向**同一分片、同一 exec** 的 `write_intent`。

## 3. 事件字段

九类事件：`exec_begin`、`exec_end`、`write_intent`、`write_result`、`read_batch`、`preload`、`observe_start`、`observe_relay`、`observe_end`。逐字段见附录 A。

- `write_intent.intent_id = event_id`；禁填 `outcome`、`error_code`、`after`、`bytes_written`。
- `write_result` 只引用，不重述 `op`、`path`、`src_path`、`rule_ref`、`before`；`durable` 仅在 flush/fsync 后为 true。
- `read_batch` 按批记录，条目含 `path`、`rule_ref`、`result ∈ {ok, denied, absent}`。
- `preload` 在父进程与 worker 各一条。
- 观察三事件只保存 relay 行哈希与判定，不保存原文。

## 4. 动作前/动作后

```text
write_intent (flush) → 文件操作 → write_result (flush)
```

- intent 落盘失败：不执行动作，退出非零。
- result 落盘失败：立即停止；该段 `failed`，`unpaired_intents>0`。
- 禁止先做后记、事后补记、修改已写事件。

## 5. 封存顺序

1. 业务进程退出，分片冻结。
2. seal 校验行解析、序号连续、链完整、intent/result 配对、字段规则。
3. `p0-audit.cjs seal` 以 CreateNew 写 `summary.json`（不含自身哈希、不引用链）。
4. `p0-audit.cjs close` 在同一独占句柄内追加 `segment_close`，含分片摘要、`segment_digest`、summary 哈希与字节数、输出哈希。

## 6. 链头记录与物理字节

三类：`genesis`、`segment_open`、`segment_close`。

- **每条记录 = canonical JSON + 一个 LF**；`prev_file_bytes` 是写入前的**物理字节数，含此前所有 LF**。
- `chain_seq` 连续；`prev_record_sha256` 等于上一条记录 canonical 文本哈希。
- `segment_open` 必须包含 `c18_state`、`c18_binding_sha256`、`c18_destination` 三个字段：普通执行为 null；`C18-BIND-E01` 为 `bound`/`disabled-unbound` 与相应值。
- `segment_close` 必须跟随同 exec 的 open。
- 不追改、不重写、不截断。

## 7. summary 与终端封存

`summary.json` 字段见附录 C；禁填 `summary_sha256` 与 `prev_record_sha256`。

`terminal-seal.json`：

- CreateNew，唯一文件；不追加链。
- 内容：链覆盖（`first_seq`、`last_seq`、`last_record_sha256`、`file_bytes`）、C19 与 C20-REPORT 的截止点、截止点后的尾部段与输出哈希、staged 复核、`phase0_exit_status ∈ {complete, exit-not-met, aborted, seal-failed}`。
- 控制台输出 `terminal_seal_sha256` 与字节数。

## 8. 规范化与哈希

`p47-canon-json-v1`：UTF-8 无 BOM；键仅 `[a-z0-9_]` 且升序；无空白；仅安全整数；`-0` 写 0；字符串仅转义 `\"`、`\\`、`\u00xx`（小写）；禁止浮点、NaN、Infinity、undefined、函数、BigInt、孤立代理项。

**字节口径（V6 修正）：** 向量中的 `bytes` 是 UTF-8 物理字节；JSONL 记录额外加 1 个 LF；`prev_file_bytes` 与分片 `bytes` 都必须含 LF。V5 少算 1 字节的问题在 V6 向量中修正，V5 向量保留作历史证据。

## 9. 测试向量（V6）

文件 `PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json`：

- 8 个 canonical 基础样本、3 个事件、3 个链记录、1 个 summary。
- 事件 ID 全部 32 位小写十六进制。
- 事件、权限引用、exec 均为 `C19-E01`。
- `segment_open` 含 c18 三字段（null）。
- `jsonl` 段给出三行实际分片的字节数与 SHA-256。
- `chain_physical` 给出 genesis/open/close 的物理字节。
- `negative` 12 条：非法 ID、31 位 ID、缺 c18 字段、缺 intent_ref、intent 带 outcome、跨 exec 引用、重复 ID、seq 跳变、prev 不符、无 LF 截断、prev_file_bytes 少算 LF、summary 自哈希。

校验责任：Node 检查器独立实现 schema 与字节校验；PowerShell 独立复算 canonical 哈希与整文件哈希。不得通过修改预期值掩盖实现错误。

## 10. 失败与跳过

- 崩溃或 result 落盘失败：段 `failed`，`unpaired_intents>0`，不得标 ok。
- 跳过（C18 未绑定）：由 `C18-BIND-E01` 显式记录 `disabled-unbound`，不是成功，也不是 pending。
- 链损坏：SEAL 拒绝写终端封存；状态 `chain-broken`。
- 封存失败：`seal-failed`，不重试、不生成第二份。

## 11. 未验证

审计工具未实现或运行；独占打开、flush/fsync、崩溃恢复、并发分片、原生/FD 绕过均 UNVERIFIED。规范与向量通过不替代真实运行结果。

<!-- GENERATED:BEGIN (p0v6-build.cjs) -->

## Appendix A：事件字段规则（生成）

### exec_begin

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `argv_sha256` | required | canonical argv hash |
| `cwd` | required | absolute |
| `entry_path` | required | absolute |
| `entry_sha256` | required | byte hash |
| `pid` | required | integer |
| `ppid` | required | integer |
| `outcome` | forbidden | begin cannot claim an outcome |

### exec_end

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `exit_code` | required | integer |
| `started_utc` | required | ISO 8601 UTC |
| `ended_utc` | required | ISO 8601 UTC |
| `child_exit_codes` | required | array of {pid, code} |
| `write_intent` | forbidden | end is not a write |

### write_intent

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `intent_id` | required | exactly equal to event_id |
| `op` | required | create \| overwrite \| append \| mkdir \| rename \| copy \| acl \| delete |
| `path` | required | canonical absolute path |
| `path_kind` | required | file \| dir \| tree |
| `src_path` | required | null unless rename/copy |
| `rule_ref` | required | permission entry id |
| `decision` | required | const 'allow' |
| `before` | required | null when absent; else {exists, bytes, sha256, mtime_utc, sddl} |
| `outcome` | forbidden | not known before the action |
| `error_code` | forbidden | not known before |
| `after` | forbidden | not known before |
| `bytes_written` | forbidden | not known before |

### write_result

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `intent_ref` | required | event_id of a write_intent in the same part and same exec |
| `outcome` | required | ok \| denied \| error \| skipped |
| `error_code` | required | null only when ok |
| `after` | required | null unless ok |
| `bytes_written` | required | null unless ok and op writes bytes |
| `durable` | required | true only after flush/fsync |
| `op` | forbidden | reference only |
| `path` | forbidden | reference only |
| `src_path` | forbidden | reference only |
| `rule_ref` | forbidden | reference only |
| `before` | forbidden | reference only |

### read_batch

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `mode` | required | content \| metadata |
| `entries` | required | array of {path, path_kind, rule_ref, result, bytes, sha256, error_code} |
| `counts` | required | {ok, denied, absent, unlisted} |
| `outcome` | forbidden | per-entry result only |

### preload

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
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
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `observed_account` | required | one of the two Codex names |
| `observed_sid` | required | resolved SID |
| `nonce` | required | 64 lowercase hex |
| `deadline_seconds` | required | integer 900 |
| `stdout` | forbidden | no relay text as a field |

### observe_relay

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
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
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `relay_seen` | required | boolean |
| `verdict` | required | pass \| fail |
| `exit_code` | required | integer |
| `relay_line` | forbidden | only the hash is stored |

## Appendix B：链头记录字段（生成）

### genesis

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v2' |
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
| `schema` | required | const 'p47-chain-record-v2' |
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
| `planned_predecessor` | required | exec id or null |
| `c18_state` | required | null except C18-BIND-E01: bound \| disabled-unbound |
| `c18_binding_sha256` | required | null except C18-BIND-E01 when bound |
| `c18_destination` | required | null except C18-BIND-E01 when bound |
| `segment_dir` | required | absolute; must not exist |

### segment_close

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v2' |
| `record` | required | const 'segment_close' |
| `chain_seq` | required | previous + 1 |
| `prev_record_sha256` | required | open record sha256 |
| `prev_file_bytes` | required | physical bytes before this record |
| `exec_id` | required | matches open |
| `command_id` | required | matches open |
| `result` | required | ok \| failed \| aborted |
| `exit_code` | required | integer |
| `parts` | required | array of {name, bytes, sha256, events, first_seq, last_seq} |
| `events_total` | required | integer |
| `unpaired_intents` | required | integer; 0 for ok |
| `segment_digest` | required | sha256 of the canonical parts array |
| `summary_path` | required | absolute |
| `summary_sha256` | required | null only when summary creation failed |
| `summary_bytes` | required | null under the same condition |
| `outputs` | required | array of {path, bytes, sha256, kind} |
| `child_exit_codes` | required | array of {pid, code} |

## Appendix C：summary 与终端封存字段（生成）

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-segment-summary-v2' |
| `run_id` | required | const |
| `exec_id` | required | matches chain |
| `command_id` | required | C00-C20 |
| `result` | required | ok \| failed \| aborted |
| `exit_code` | required | integer |
| `parts` | required | same array as segment_close |
| `counts` | required | {events, write_intent, write_result, read_entries, denied, preload} |
| `unpaired_intents` | required | integer |
| `outputs` | required | same array as segment_close |
| `child_exit_codes` | required | same array |
| `sealed_utc` | required | ISO 8601 UTC |
| `summary_sha256` | forbidden | no self hash |
| `prev_record_sha256` | forbidden | no chain reference |

## Appendix D：测试向量索引（生成）

向量文件：`PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json`，9182 字节，SHA-256 `8d9a4773296e8f57509b4d659d6f3d6ca94ebf70cfeddd8dcb03803a06a8418b`。

| 组 | 名称 | SHA-256 / 期望 |
|---|---|---|
| valid | empty_object | `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` |
| valid | nested | `f426340fb0f8ceb8c7e4a2242924c193e71b8340bdf1f0c13fb8599ecbb54c02` |
| valid | key_order | `e6a3385fb77c287a712e7f406a451727f0625041823ecf23bea7ef39b2e39805` |
| valid | string_escapes | `ffe1bae8c441e18a564f9b3196be0c66f69115bdd898199b536b0f2539eb3edd` |
| valid | astral_char | `f9949e1006d1ca22bc0b60ea94f09779f11a8f0a29bae250fc7ab313d879f5e7` |
| valid | integer_limits | `ff08a430572ed67ffcd8807007946c23a445af4e43e695716251377d96c8d9c1` |
| valid | negative_zero | `ec4f95abcb4e2e3dbe856c3eb2f81995eacb3823d40aa2e78ed4c5e1798f664d` |
| valid | bools_and_null | `6419b83189a8c53cc82ebe097de5de8573a3a9a41ba421a55f570caedfea022b` |
| event | event_write_intent | `38370f141df83d24fcfae2a9ad030bdf5c3ae639893bf03fe1f40e2d7760213d` |
| event | event_write_result | `fb97ca4714635deff9ff20a965aa73139c8ebbaaa98a59c646aa124d36900dc2` |
| event | event_read_batch | `249b6f2cd40f64ca757930c91cc29f3370fc95dbc5890a431c5487e2e35b5a4a` |
| chain | genesis | `6251b5883caa3c4b5aad02fe1096f2be7af1faa51211c8708b3e896e39934f03` |
| chain | segment_open | `606239b7b0256838cec28dcf6aa358ee483e4bb3c8e08f58a31c42deb92b6a66` |
| chain | segment_close | `63c457ba407e15ce8809d9a0eb41a744a058a89fb0687a40dbab4146d6f159dd` |
| summary | segment_summary | `1ec5b0baed9cb0fc4711b55c96d195226756f6a5b50aa8e09b42bbd1735dee3b` |
| negative | event_id_contains_letter_v | `schema.event_id` |
| negative | event_id_31_hex | `schema.event_id` |
| negative | segment_open_missing_c18_fields | `schema.required` |
| negative | write_result_missing_intent_ref | `schema.required` |
| negative | write_intent_has_outcome | `schema.forbidden` |
| negative | intent_ref_cross_exec | `schema.intent_ref` |
| negative | duplicate_event_id | `schema.unique` |
| negative | seq_gap | `schema.seq` |
| negative | prev_hash_mismatch | `schema.prev` |
| negative | truncated_line_without_lf | `bytes.lf` |
| negative | prev_file_bytes_missing_lf | `bytes.prev_file_bytes` |
| negative | summary_self_hash | `schema.forbidden` |

<!-- GENERATED:END -->
