# OB-Recover Phase 4.7：Phase 0 审计规范 V5（正式候选，待第八轮独立复核）

日期：2026-11-11。性质：执行前审计契约。不执行任何命令，不创建 `D:\P47RUN`，不修改 ACL 或产品。

## 1. 权威落点与唯一写入主体

```text
RUN\out\audit\chain-head.jsonl                       链头，唯一文件
RUN\out\audit\Cxx\<exec>\events-<role>-<pid>-<rand8>.jsonl   每进程分片
RUN\out\audit\Cxx\<exec>\summary.json                每段封存摘要
RUN\out\audit\terminal-seal.json                     终端封存，最后一个写
RUN\out\Cxx\<exec>\...                               命令结果，不放审计副本
RUN\tmp\...                                          临时文件
```

| 对象 | 唯一写入者 | 读者 | 业务进程 |
|---|---|---|---|
| `chain-head.jsonl` | `p0-audit.cjs`（dispatcher open/seal/close 与 terminal-seal 模式，`WENX\Administrator`） | dispatcher、C19、C20-REPORT、C20-SEAL | 零读零写 |
| `events-*.jsonl` | 各进程自身（经 `fs-guard.cjs`） | 同段 seal 步骤 | 只写自己的分片 |
| `summary.json` | `p0-audit.cjs` seal 模式 | 同段 close、C19、C20 | 零读写 |
| `terminal-seal.json` | `p0-audit.cjs` terminal-seal 模式 | 外部复核、C20-SEAL 自身 | 零读写 |

C03 观察者是唯一例外：它以 `WENX\Administrator` 写自己的分片，`actor` 为 Codex 账户、`role` 为 `observer`，并记录 `recorder`。Codex 永不写 RUN。

## 2. 分片与事件链

- 分片名固定 `events-<role>-<pid>-<rand8>.jsonl`；`role ∈ {dispatcher, tool, observer, product, control}`。
- 每个事件一行，UTF-8、LF、无 BOM。
- 每分片内部：`seq` 从 1 连续递增；`prev_event_sha256` 为上一事件规范化文本的 SHA-256，`seq=1` 时为 `null`。
- 分片一次写完后不再修改；追加使用独占句柄，失败即停止。
- 事件之间不跨分片引用，除 `write_result.intent_ref` 必须指向**同一分片**的 `write_intent`。

## 3. 事件类型与字段

九类：`exec_begin`、`exec_end`、`write_intent`、`write_result`、`read_batch`、`preload`、`observe_start`、`observe_relay`、`observe_end`。逐字段规则见附录 A，摘要如下：

- `write_intent`：`intent_id` 必须等于 `event_id`；禁填 `outcome`、`error_code`、`after`、`bytes_written`。
- `write_result`：`intent_ref` 指向同分片 intent；`error_code` 仅在 `outcome=ok` 时为 `null`；`after` 仅 `ok` 时非空；`durable` 仅在 flush/fsync 后为 true；禁填 `op`、`path`、`src_path`、`rule_ref`、`before`。
- `read_batch`：按批记录，条目含 `path`、`rule_ref`、`result ∈ {ok, denied, absent}`；禁止成功读取 `deny_read` 根。
- `preload`：父进程与 worker 各一条，含 `guard_sha256`、`process_role`、`policy_sha256`。
- 观察三事件：`observe_start` 记录 nonce 与期限；`observe_relay` 只存转交行哈希与判定，不存原文；`observe_end` 记录最终判定。
- `exec_begin`/`exec_end`：记录 argv 哈希、cwd、入口哈希、PID 与子进程退出码。

## 4. 动作前/动作后

```text
write_intent (flush) → 实际文件操作 → write_result (flush)
```

- intent 落盘失败：不执行动作，进程非零退出。
- result 落盘失败：立即停止，不再写任何事件；该段 `result=failed`，`unpaired_intents>0`。
- 禁止先做后记，禁止事后补 intent，禁止修改已写事件。
- ACL 操作：`before.sddl` 与 `after.sddl` 必填；`before.sha256` 为 null。
- 删除：`after.exists=false`，`bytes/sha256` 为 null。

## 5. 封存顺序（唯一）

1. 业务进程全部退出，分片冻结。
2. seal 步骤逐分片校验：行可解析、`seq` 连续、事件链完整、intent/result 配对、字段规则符合。
3. `p0-audit.cjs seal` 以 **CreateNew** 写 `summary.json`：包含分片摘要、计数、未配对 intent、输出哈希、子进程退出码。summary **不含自身哈希，不引用链头**。
4. `p0-audit.cjs close` 在**同一次链头独占持有**内追加 `segment_close`：含分片摘要、`segment_digest`、`summary_path`、`summary_sha256`、`summary_bytes`、输出哈希。

这样 summary 不进入自己引用的段，也不形成自引用；链记录只引用 summary 的哈希。

## 6. 链头记录

三类：`genesis`、`segment_open`、`segment_close`。逐字段见附录 B。共同不变量：

- `chain_seq` 从 1 连续递增，不重复、不跳跃。
- `prev_record_sha256` 等于上一条记录规范化文本的 SHA-256；genesis 为 `null`。
- `prev_file_bytes` 等于写入前文件字节数；genesis 为 0。
- 追加前独占打开并读末条；末条 `chain_seq` 不等于 `chain_seq-1` 即拒绝。
- `segment_close` 必须跟随同一 `exec_id` 的 `segment_open`；禁止跨段关闭。
- 任何失败都不追改、不重写、不截断。

`segment_open` 的 `args_sha256` 必须等于该执行注册的 `argv_sha256`；`entry_sha256` 必须等于 manifest 中该入口的字节哈希。

## 7. summary 与终端封存

`summary.json`：`schema`、`run_id`、`exec_id`、`command_id`、`result`、`exit_code`、`parts`、`counts`、`unpaired_intents`、`outputs`、`child_exit_codes`、`sealed_utc`；禁填 `summary_sha256` 与 `prev_record_sha256`（附录 C）。

`terminal-seal.json`：

- CreateNew，唯一文件，位于 `RUN\out\audit\terminal-seal.json`。
- 内容：链覆盖（`first_seq`、`last_seq`、`last_record_sha256`、`file_bytes`）、索引与报告的覆盖截止点、截止点之后的尾部段与输出哈希、staged 全集复核结果、`phase0_exit_status ∈ {complete, exit-not-met, aborted, seal-failed}` 及理由。
- 不在链上追加；写入后不再有任何业务写。
- 控制台输出 `terminal_seal_sha256` 与字节数，供外部锚定。

## 8. 规范化序列化与哈希

版本：`p47-canon-json-v1`；哈希：SHA-256（小写十六进制）。

| 规则 | 要求 |
|---|---|
| 编码 | UTF-8，无 BOM |
| 对象键 | 仅 `[a-z0-9_]`；按 UTF-16 码元升序排序 |
| 空白 | 禁止（无空格、无换行） |
| 数字 | 仅安全整数，`|v| ≤ 9007199254740991`；`-0` 写 `0`；禁止浮点、NaN、Infinity |
| 字符串 | 仅转义 `"` → `\"`、`\` → `\\`、`C0` 控制符 → `\u00xx`（小写）；其他字符按 UTF-8 原样输出 |
| 代理项 | 禁止孤立代理项；成对代理项按原样输出 |
| 其他类型 | 禁止 undefined、函数、Symbol、BigInt |
| 重复键 | 不产生不同哈希；解析后按键值规范化 |

测试向量文件：`PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json`，由生成器按上述规则产出，字节固定。它包含：

- `valid`：8 个规范化样本（空对象、嵌套、键序、转义、astral 字符、整数边界、`-0`、布尔与 null）。
- `invalid_kinds`：12 类必须拒绝的输入。
- `events`：3 个事件样本（intent → result → read_batch），带 `prev_event_sha256` 链接。
- `chain`：genesis → segment_open → segment_close，`prev` 字段互相链接。
- `summary`：1 个 summary 样本。
- `chain_expected`：链链接的期望哈希。

校验责任：Node 检查器重算整份文件并逐项比对；PowerShell 独立复算每个 `canonical` 串的 UTF-8 SHA-256 与文件整体哈希。二者结果不一致即视为规范未实现。

## 9. 失败处理

| 情况 | 处理 |
|---|---|
| intent 写失败 | 不执行动作；退出非零 |
| 动作成功但 result 写失败 | 立即停止；段 `failed`；`unpaired_intents>0` |
| 分片校验失败 | 不写 summary；close 记 `failed` |
| 链头共享冲突 | 不重试；停止并保留现场 |
| summary 创建失败 | close 记 `result=failed`，`summary_sha256=null` |
| 终端封存失败 | 记 `seal-failed`，不重试，不生成第二份 |

## 10. 计费与账目

C19 必须能把 `RUN` 树中的每个写归入以下之一：事件分片中的 intent/result、链记录字段、genesis bootstrap 列举、终端封存列举。任何未归入的写即失败。读取同理：`deny_read` 根的成功读取为零，未列出的内容读被拒绝并记录。

## 11. 未验证事项

审计工具尚未实现或运行；分片并发、独占打开行为、flush/fsync 语义、绕过 Node 的原生/FD 写、PowerShell 自报告事件真实性均 UNVERIFIED。不得以本规范存在或向量通过代替真实运行结果。

<!-- GENERATED:BEGIN (p0v5-build.cjs) -->

## Appendix A：事件字段规则（生成）

### exec_begin

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `argv_sha256` | required | p47-canon-json-v1 of the argv array plus element 0 = executable path |
| `cwd` | required | absolute |
| `entry_path` | required | absolute |
| `entry_sha256` | required | byte hash of the loaded entry |
| `pid` | required | integer |
| `ppid` | required | integer |
| `outcome` | forbidden | begin cannot claim an outcome |

### exec_end

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `exit_code` | required | integer |
| `started_utc` | required | ISO 8601 UTC |
| `ended_utc` | required | ISO 8601 UTC |
| `child_exit_codes` | required | array of {pid, code}; empty when no child ran |
| `write_intent` | forbidden | end is not a write |

### write_intent

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `intent_id` | required | exactly equal to event_id |
| `op` | required | create \| overwrite \| append \| mkdir \| rename \| copy \| acl \| delete |
| `path` | required | canonical absolute path |
| `path_kind` | required | file \| dir \| tree |
| `src_path` | required | null unless op is rename or copy |
| `rule_ref` | required | id of the permission entry that allows the write |
| `decision` | required | const 'allow' |
| `before` | required | null when the target is absent; else {exists, bytes, sha256, mtime_utc, sddl} |
| `outcome` | forbidden | intent is recorded before the action |
| `error_code` | forbidden | not known before the action |
| `after` | forbidden | not known before the action |
| `bytes_written` | forbidden | not known before the action |

### write_result

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `intent_ref` | required | event_id of the write_intent in the same part |
| `outcome` | required | ok \| denied \| error \| skipped |
| `error_code` | required | null only when outcome=ok; otherwise a stable code |
| `after` | required | null unless outcome=ok; else {exists, bytes, sha256, mtime_utc, sddl} |
| `bytes_written` | required | null unless outcome=ok and op writes bytes |
| `durable` | required | true only after flush/fsync; false otherwise |
| `op` | forbidden | reference only; do not restate |
| `path` | forbidden | reference only; do not restate |
| `src_path` | forbidden | reference only |
| `rule_ref` | forbidden | reference only |
| `before` | forbidden | reference only |

### read_batch

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `mode` | required | content \| metadata |
| `entries` | required | array of {path, path_kind, rule_ref, result, bytes, sha256, error_code} |
| `counts` | required | {ok, denied, absent, unlisted} |
| `outcome` | forbidden | per-entry result only |

### preload

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `guard_pid` | required | integer |
| `parent_pid` | required | integer; 0 for the runner |
| `process_role` | required | runner \| tool \| main \| worker \| product |
| `guard_sha256` | required | byte hash of fs-guard.cjs |
| `argv_sha256` | required | p47-canon-json-v1 of process.argv |
| `policy_sha256` | required | static hash of the deny/read/write policy |
| `inherited_env_keys` | required | sorted array of the P0_GUARD_* keys seen |

### observe_start

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `observed_account` | required | one of the two approved Codex names |
| `observed_sid` | required | resolved SID |
| `nonce` | required | 64 lowercase hex |
| `deadline_seconds` | required | integer 900 |
| `stdout` | forbidden | the observer does not relay Codex output as an event field |

### observe_relay

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
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
| `schema` | required | const 'p47-audit-event-v1' |
| `event_id` | required | 32 lowercase hex; unique in the run |
| `exec_id` | required | registered execution id |
| `part_id` | required | matches the part file name |
| `seq` | required | integer >= 1, contiguous inside the part |
| `prev_event_sha256` | required | null only for seq=1; otherwise sha256 of the previous event canonical text |
| `kind` | required | one of the nine event types |
| `wall_time_utc` | required | ISO 8601 UTC with milliseconds and Z |
| `actor` | required | account name that produced the event |
| `role` | required | dispatcher \| tool \| observer \| product \| control |
| `relay_seen` | required | boolean |
| `verdict` | required | pass \| fail |
| `exit_code` | required | integer |
| `relay_line` | forbidden | only the hash is stored |

## Appendix B：链头记录字段（生成）

### genesis

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v1' |
| `record` | required | const 'genesis' |
| `chain_seq` | required | integer 1 |
| `prev_record_sha256` | required | null for genesis |
| `prev_file_bytes` | required | 0 |
| `run_id` | required | const P47-20261111-01 |
| `created_utc` | required | ISO 8601 UTC |
| `registry_sha256` | required | approved registry hash |
| `manifest_sha256` | required | approved RELEASE-MANIFEST hash |
| `verifier_result` | required | const 'pass' |
| `bootstrap` | required | enumerated [{op, path, result}] array; no unlisted entry |
| `writer` | required | WENX\Administrator |
| `writer_tool_sha256` | required | byte hash of p0-audit.cjs |

### segment_open

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v1' |
| `record` | required | const 'segment_open' |
| `chain_seq` | required | integer, previous + 1 |
| `prev_record_sha256` | required | sha256 of the previous record |
| `prev_file_bytes` | required | byte length before this record |
| `exec_id` | required | registered execution id |
| `command_id` | required | C00-C20 |
| `args_sha256` | required | argv hash of the dispatcher invocation |
| `cwd` | required | absolute |
| `entry_path` | required | absolute |
| `entry_sha256` | required | byte hash |
| `planned_predecessor` | required | previous exec id, or null after genesis |
| `c18_state` | required | null except on C07-B-C19-E01: bound \| disabled-unbound |
| `c18_binding_sha256` | required | null except on C07-B-C18-E01: sha256 of the canonical binding value |
| `c18_destination` | required | null except on C07-B-C18-E01: the absolute destination recorded at binding time |
| `segment_dir` | required | absolute; must not exist yet |

### segment_close

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-chain-record-v1' |
| `record` | required | const 'segment_close' |
| `chain_seq` | required | integer, previous + 1 |
| `prev_record_sha256` | required | sha256 of the segment_open record |
| `prev_file_bytes` | required | byte length before this record |
| `exec_id` | required | matches segment_open |
| `command_id` | required | matches segment_open |
| `result` | required | ok \| failed \| aborted |
| `exit_code` | required | integer |
| `parts` | required | array of {name, bytes, sha256, events, first_seq, last_seq} |
| `events_total` | required | integer |
| `unpaired_intents` | required | integer; must be 0 for result=ok |
| `segment_digest` | required | sha256 of the canonical parts array |
| `summary_path` | required | absolute |
| `summary_sha256` | required | null only when result != ok and summary creation failed |
| `summary_bytes` | required | null under the same condition |
| `outputs` | required | array of {path, bytes, sha256, kind} |
| `child_exit_codes` | required | array of {pid, code} |
| `part_events` | forbidden | events are not restated in the chain |

## Appendix C：summary 字段（生成）

| 字段 | 必填性 | 规则 |
|---|---|---|
| `schema` | required | const 'p47-segment-summary-v1' |
| `run_id` | required | const |
| `exec_id` | required | matches the chain record |
| `command_id` | required | C00-C20 |
| `result` | required | ok \| failed \| aborted |
| `exit_code` | required | integer |
| `parts` | required | same array as in segment_close |
| `counts` | required | {events, write_intent, write_result, read_entries, denied, preload} |
| `unpaired_intents` | required | integer |
| `outputs` | required | same array as in segment_close |
| `child_exit_codes` | required | same array as in segment_close |
| `sealed_utc` | required | ISO 8601 UTC |
| `summary_sha256` | forbidden | no self hash |
| `prev_record_sha256` | forbidden | summary does not reference the chain |

## Appendix D：测试向量索引（生成）

向量文件：`PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json`，7981 字节，SHA-256 `dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042`。

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
| event | event_write_intent | `cda320fca482ed9b2a1be14cd1569468cf228bfbb917c5451f5c2a57c37e9b0c` |
| event | event_write_result | `f26be0443e0113b9b9387779bdff5fd56789652692510ebe84262222280fc797` |
| event | event_read_batch | `9733c7e49a5baacae98b2a53ce2321893be783f46d42db9b897e780de3f12058` |
| chain | genesis | `0522e9abda5d0a7f42a642c35cdc7cdc1643cb08b31205d545e9948eb28013d0` |
| chain | segment_open | `313c996bcb25908b923cf7ab616034326d7f88f469120c777d5160e830fc57a6` |
| chain | segment_close | `833d83e32a4795241e425c6de3a9e0d5d8a0605ac12a192f84d7bbba783cfe1c` |
| summary | segment_summary | `46d73691f1c0792d12910d78ae14cb330cc6199717b895bb424325837c8ea472` |

<!-- GENERATED:END -->
