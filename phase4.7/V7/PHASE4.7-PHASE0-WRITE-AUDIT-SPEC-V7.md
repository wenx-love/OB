# OB-Recover Phase 4.7：Phase 0 审计规范 V7（正式候选，待第十轮独立复核）

日期：2026-11-11。性质：执行前审计契约。不执行命令，不创建 `D:\P47RUN`，不改 ACL 或产品。

## 1. 落点与主体

```text
RUN\out\audit\chain-head.jsonl                              链头
RUN\out\audit\Cxx\<exec>\events-<role>-<pid>-<rand8>.jsonl  每进程分片
RUN\out\audit\Cxx\<exec>\summary.json                       段摘要
RUN\out\audit\terminal-seal.json                            终端封存
RUN\binding\c18-binding.json                                C18 绑定交接
```

| 对象 | 唯一写入者 | 读者 | 业务进程 |
|---|---|---|---|
| 链头 | `p0-audit.cjs`（open/seal/close、terminal-seal、skip） | dispatcher、C19、C20-REPORT、C20-SEAL | 零 |
| 分片 | 各进程自身（`fs-guard.cjs`） | 同段 seal | 只写自己的分片 |
| summary | `p0-audit.cjs` seal | 同段 close、C19、C20 | 零 |
| 终端封存 | `p0-audit.cjs` terminal-seal | 外部复核 | 零 |
| 绑定文件 | `C18-BIND-E01`（CreateNew） | C18、C19、C20 | 只读 |

C01 同时是 genesis 与普通参与者；链头 create/append 只在 control 层，业务层不创建链文件。

## 2. 分片、角色与目录

- 分片名 `events-<role>-<pid>-<rand8>.jsonl`；`role ∈ {dispatcher, tool, observer, product, control}`。
- 角色许可：C03-OBS 为 `observer`；产品执行为 `tool` 与 `product`，产品另有自己的 `events-product-*.jsonl` 规则；其余业务为 `tool`。
- 每个参与者登记中间目录 `RUN\out\audit\Cxx` 的 `dir-create-if-absent`；段目录必须不存在。
- 一行一个事件：canonical JSON + 一个 LF；`seq` 连续；`prev_event_sha256` 链接；CreateNew 后只追加。

## 3. 事件字段

九类事件字段见附录 A。要点：

- `write_intent.intent_id = event_id`；禁填 `outcome`、`error_code`、`after`、`bytes_written`。
- `write_result.intent_ref` 必须指向**同分片、同 exec、seq 更小**的 intent；同一 intent 只能有一个 result；缺失 intent 时只报 `schema.intent_ref`，不叠加其他码。
- `write_result` 禁填 `op/path/src_path/rule_ref/before`；`durable` 仅在 flush/fsync 后为 true。
- `read_batch` 按批记录，`counts` 必填。
- 观察三事件只保存 relay 行哈希与判定。

## 4. 动作前/后与失败

```text
write_intent (flush) → 文件操作 → write_result (flush)
```

- intent 写失败：不执行动作，退出非零。
- result 写失败：立即停止，段 `failed`。
- `unpaired_intents` 是实际未配对数量：若失败发生在首个 intent 之前，可以为 0；**段结果与未配对数分开判断**，不得写成“崩溃必然 unpaired>0”。

## 5. 封存顺序

1. 业务退出，分片冻结。
2. seal 校验行解析、序号、链、intent/result 配对、字段规则。
3. seal 以 CreateNew 写 summary（不含自身哈希、不引用链）。
4. close 在同一独占句柄内追加 `segment_close`，含分片摘要、summary 哈希与输出哈希。

## 6. 链记录与物理字节

四类：`genesis`、`segment_open`、`segment_close`、`segment_skip`。字段见附录 B。

- 每条记录 = canonical JSON + 一个 LF；`prev_file_bytes` 含此前所有 LF。
- V7 向量实算：genesis 行 574 字节；`segment_open.prev_file_bytes=574`；`segment_close.prev_file_bytes=1234`；`segment_skip.prev_file_bytes=2203`。
- `segment_open` 的 `entry_path`/`args_sha256` 必须等于注册表中该执行的实际值与 argv 哈希。
- `segment_skip`：`reason=dependency-failed`，含 `failed_dependency` 与 `skipped_utc`；禁止出现 `segment_dir`/`summary_path`。
- 不追改、不重写、不截断。

## 7. summary、终端封存与模式

summary 字段见附录 C；禁填 `summary_sha256`、`prev_record_sha256`。

终端封存模式：

| 模式 | 要求 |
|---|---|
| sealed-full | staged_state=complete；完整 staged 复核；全部段摘要可校验 |
| degraded-prefix | staged_state=incomplete/absent；只列实际前缀与缺失项 |
| aborted | 链完整、记录 abort 点；披露缺失报告 |
| chain-broken | 不写终端封存 |

终端封存不在链上追加；写入后无业务写；控制台公布 `terminal_seal_sha256`。

## 8. 规范化与哈希

`p47-canon-json-v1`：UTF-8 无 BOM、键排序且仅 `[a-z0-9_]`、无空白、仅安全整数、字符串仅 `\"`/`\\`/`\u00xx`（小写）、禁止浮点/NaN/Infinity/undefined/BigInt/孤立代理项。

字节口径：向量中的 `bytes` 是 UTF-8 物理字节；JSONL 记录额外加 1 个 LF；`prev_file_bytes` 与分片 `bytes` 均含 LF。

## 9. 测试向量

`PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json`：

- 8 个 canonical 样本、3 个事件、4 个链记录（含 skip）、1 个 summary。
- 同一 `index.json` 在 write_result 与 summary 中哈希/字节一致。
- `segment_open` 入口/args 与注册 C19 一致。
- 12 条负例，每条在合法基底上只注入一个错误，交付实际 canonical 文本与期望错误码；检查器独立解析并断言恰好一个错误。

## 10. 未验证

审计工具未实现或运行；独占、flush、崩溃恢复、并发分片、原生/FD 绕过均 UNVERIFIED。规范与向量通过不替代真实运行结果。

<!-- GENERATED:BEGIN (p0v7-build.cjs) -->

## Appendix A：事件字段规则（生成）

### exec_begin

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v2' |
| `event_id` | required | 32 lowercase hex [0-9a-f]; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `intent_ref` | required | event_id of a write_intent in the same part, same exec, earlier seq |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `prev_event_sha256` | required | null only for seq=1; else sha256 of the previous canonical text |
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
| `schema` | required | const 'p47-chain-record-v3' |
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
| `schema` | required | const 'p47-chain-record-v3' |
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
| `schema` | required | const 'p47-chain-record-v3' |
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

### segment_skip

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v3' |
| `record` | required | const 'segment_skip' |
| `chain_seq` | required | previous + 1 |
| `prev_record_sha256` | required | previous record sha256 |
| `prev_file_bytes` | required | physical bytes before this record |
| `exec_id` | required | skipped exec |
| `command_id` | required | C00-C20 |
| `reason` | required | const 'dependency-failed' |
| `failed_dependency` | required | exec id of the failed dependency |
| `skipped_utc` | required | ISO 8601 UTC |
| `segment_dir` | forbidden | a skipped execution has no segment directory |
| `summary_path` | forbidden | a skipped execution has no summary |

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
| `child_exit_codes` | required | array |
| `sealed_utc` | required | ISO 8601 UTC |
| `summary_sha256` | forbidden | no self hash |
| `prev_record_sha256` | forbidden | no chain reference |

## Appendix D：测试向量索引（生成）

向量文件：`PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json`，20324 字节，SHA-256 `3d4bd77841d3ebf9e8b46935b17b5d65d42a385a3222bc846c2b15fde8b86f07`。

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
| chain | genesis | `f96530b28e8890176621c893312458076ee861a00261d23fd16440510bfd1eaf` |
| chain | segment_open | `36d823df377f11ce1cb2a9058c72494d5b9ec3ec8ce28324c9591bab756472e6` |
| chain | segment_close | `e52a84150230e39113121f3e0a87695eef297df22278689e1261e8b182f3daea` |
| chain | segment_skip | `21a2ccde83b0679d2e9f81f77b10be6532e4a64007bf6746f2d5283c4524cd1d` |
| summary | segment_summary | `8433dcd00306e43d5f3da1e2ae8b837a99abc8c45ffccf806edce9ce131250fa` |
| negative | event_id_contains_letter_v | `schema.event_id` |
| negative | event_id_31_hex | `schema.event_id` |
| negative | segment_open_missing_c18_binding | `schema.required` |
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
