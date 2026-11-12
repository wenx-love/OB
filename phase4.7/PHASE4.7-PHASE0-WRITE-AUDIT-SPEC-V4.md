# OB-Recover Phase 4.7：Phase 0 写入审计规范 V4

日期：2026-11-11。状态：Phase 0 启动前置条件；不是执行结果。

## 1. 适用范围与权威根

本规范适用于 C01—C20。`Cxx` 表示命令编号，`Cxx-E01` 表示其子执行；实际路径以执行注册表为准。唯一权威审计根：

```text
D:\P47RUN\P47-20261111-01\out\audit\
  C01\C01-E01\bootstrap.jsonl
  C02\C02-E01\write-audit.jsonl
  ...
  C20\C20-E01\write-audit.jsonl
  chain-head.jsonl
D:\P47RUN\P47-20261111-01\out\Cxx\Cxx-E01\
  ...命令结果...
```

规则：

1. 不再存在 `OUT\Cxx\Cxx-E01\write-audit.jsonl` 第二套审计副本。
2. 每命令/子执行一个 `write-audit.jsonl`（C01 为 `bootstrap.jsonl`）和一个 `write-summary.json`，均位于 `OUT\audit\Cxx\Cxx-E01\`。
3. `chain-head.jsonl` 是唯一链头；append-only，每条 `segment_close` 引用上一段末哈希；不覆盖。
4. 审计写入只能由管理员/管理员观察者/已验证工具执行；Codex 不得写审计。
5. 审计失败与业务失败分开报告；审计失败不得降级为警告。

## 2. C01 有限 bootstrap 生命周期

C01 在创建 RUN 之前没有已存在的审计目录。只允许以下**有限、枚举、可信内存记录**的 bootstrap：

```text
B0  D:\P47RUN 不存在时创建父目录
B1  创建 RUN
B2  创建 OUT
B3  创建 OUT\audit
B4  创建 OUT\audit\C01\C01-E01
B5  创建并打开 bootstrap.jsonl（审计控制写）
```

执行规则：

1. C01 在内存中记录 B0—B4 的路径、操作、主体、时间、结果；不得有未枚举的目录创建。
2. 打开 `bootstrap.jsonl` 后，先写一条 `audit_control`：
   - `event_type=audit_control`
   - `control=sink_create`
   - `bootstrap_operations=B0..B5`
   - `persisted_after=` 空
3. 随后按 B0—B4 顺序写 `bootstrap` 事件；每条含 `event_type=bootstrap`、`operation`、`path`、`decision`、`actual`、`create_new`。
4. B5 本身是控制写，记录为 `audit_control`，不递归记录“记录日志的日志”。
5. 只有在 B0—B5 全部写入并 flush 后，才允许：
   - 创建 read-sentinel / write-access-sentinel；
   - 写 init.json；
   - 后续任何 RUN 内写入。
6. 哨兵和 init.json 使用 `write_intent`→动作→`write_result`。
7. 若 B0—B5 任一步失败，停止；不创建哨兵，不运行 C02—C20。
8. 若 `bootstrap.jsonl` 已存在，C01 失败；不得复用旧 RUN。
9. 除 B0—B5 外，不存在“整个初始化免审计”的例外。

## 3. JSONL schema

UTF-8 无 BOM、LF、每行一个 JSON。字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema` | string | `p47-write-audit-v4` |
| `event_id` | string | 全局唯一，例如 `C12-E01-0001` |
| `event_type` | string | `bootstrap`/`audit_control`/`write_intent`/`write_result`/`read`/`preload`/`acl`/`summary` |
| `command_id` | string | C01—C20 |
| `exec_id` | string | 含 C05/C07/C10 子执行编号 |
| `phase0_step` | string | S0—S9 |
| `actor` | string | 实际执行者账户/SID |
| `recorder` | string | 记录者；C03 为管理员观察者 |
| `observer_id` | string | C03 观察者标识；非 C03 为空 |
| `pid` | integer | 进程 ID |
| `tid` | integer | 线程 ID，不可得写 0 |
| `worker_id` | string | Vitest worker 标识；无则空 |
| `process_role` | string | `main`/`worker`/`codex`/`manifest`/`tool`/`observer` |
| `tool_id` | string | 工具 ID 或 `runtime` |
| `tool_sha256` | string | 执行工具/脚本实际哈希 |
| `operation` | string | `create`/`write`/`append`/`truncate`/`rename`/`delete`/`mkdir`/`set_acl`/`copy`/`link`/`open_write`/`read`/`preload` |
| `path` | string | 目标/被读绝对路径；规范化 |
| `source_path` | string | copy/rename 的源；无则空 |
| `target_path` | string | copy/rename 的目标；无则空 |
| `path_kind` | string | `file`/`dir`/`ads`/`link`/`reparse` |
| `access` | string | `read`/`write`/`read_write`/`acl` |
| `decision` | string | `allow`/`deny` |
| `rule_id` | string | 注册表规则 ID |
| `expected` | string | `allowed`/`denied`/`conditional` |
| `actual` | string | `success`/`eacces`/`eperm`/`enoent`/`other` |
| `error_code` | string | 失败错误码；成功空 |
| `create_new` | boolean | 是否 CreateNew |
| `conditional` | string | `none`/`icon_if_absent`/`second_archive` |
| `intent_id` | string | `write_result` 关联的 intent；其他空 |
| `before_sha256` | string | 写前哈希；新建/目录/ACL 空 |
| `after_sha256` | string | 写后哈希；拒绝/目录/ACL 空 |
| `before_bytes` | integer | 写前字节；不可用 -1 |
| `after_bytes` | integer | 写后字节；不可用 -1 |
| `before_sddl` | string | ACL 前 SDDL；非 ACL 空 |
| `after_sddl` | string | ACL 后 SDDL；非 ACL 空 |
| `mtime_before_utc` | string | ISO-8601 或空 |
| `mtime_after_utc` | string | ISO-8601 或空 |
| `frequency` | integer | 同命令/路径第几次写尝试 |
| `run_id` | string | P47-20261111-01 |
| `copy_id` | string | `none`/`pristine-01`/`no-plugin-01`/`sandbox-01` |
| `sequence` | integer | 本 JSONL 从 1 |
| `chain_prev` | string | 上一段末事件哈希；首段空 |
| `prev_event_sha256` | string | 上一条事件哈希；首条空 |
| `event_sha256` | string | 本条排除自身后的规范化哈希 |
| `notes` | string | 说明；不得用于豁免 |

空值规则按类型固定：目录/ACL 的字节与内容哈希为空/`-1`；read/preload 无写前后哈希；copy 必须同时有 `source_path`、`target_path`；ACL 必须同时有 `before_sddl`、`after_sddl`。工具不得靠 `notes` 解释严格字段。

## 4. write_intent / write_result

每个写入（含拒绝）必须：

1. 先追加 `write_intent`：`intent_id`、路径、操作、规则、预期、写前哈希/字节、是否 CreateNew、图标条件。
2. intent 落盘并 flush 成功后，才执行动作。
3. 追加 `write_result`：同一 `intent_id`、实际结果、错误码、写后哈希/字节。
4. intent 失败：不执行动作。
5. 动作成功但 result 落盘失败：立即停止，不再执行任何写入；保留现场。
6. 拒绝写：intent 后立即 result，`decision=deny`、`actual=eacces/eperm`、`after_sha256` 空。
7. 审计追加本身走专用控制通路（已打开的 append 句柄），不再为每次 append 递归生成 intent/result；控制通路失败即停止。

禁止“先写业务文件、事后补一条摘要”；禁止只记录成功不记录拒绝；禁止改写旧事件。

## 5. C03：Codex 只读与管理员观察者

- Codex 侧只运行内联探针，`write_roots=[]`；stdout 输出 JSON。
- 管理员观察者关联 Codex PID/账户/SID，实时转写 stdout/stderr 到 `OUT\C03\C03-E01\codex-console.jsonl`。
- 在启动 Codex 探针前，观察者先写一条 `write_intent`（目标写哨兵，`expected=denied`、`conditional=none`）；探针结束后写对应 `write_result`。这不是 Codex 写审计，而是观察者对预期拒绝的实时预约。
- 观察者在 `OUT\audit\C03\C03-E01\write-audit.jsonl` 写入：
  - `actor=Codex账户`、`recorder=WENX\Administrator`、`observer_id`；
  - `read` 事件：读 read-sentinel 成功；
  - `open_write`/`write_result` 事件：写 access-sentinel 被拒绝，`decision=deny`；
  - Codex 若写文件：立即 FAIL；
  - 观察者不得在 C03 结束后补造“实时”记录。
- Codex 不得写 OUT；观察者写权限只限 C03 转写/审计。
- C03 的审计链段与 C02/C04 分离；不共用 `C02-E01` 或 `C03-E01` 的 summary。

## 6. C07：子执行审计

C07 每次调用独立；`TARGET_EXEC_ID` 只能取注册表 C07 的 `binding.TARGET_EXEC_ID` 枚举：

- `C07-M0-E01`
- `C07-B-${TARGET_EXEC_ID}-E01`
- `C07-A-${TARGET_EXEC_ID}-E01`
- `C07-M1-E01`

每个子执行：

- 独立 `OUT\C07\C07-M0-E01\`（其他子执行同构）
- 独立 `OUT\audit\C07\C07-M0-E01\write-audit.jsonl`（其他子执行同构）
- 独立 `write-summary.json`
- 首事件 `chain_prev` 引用上一段末哈希；末事件后 append `segment_close` 到 `chain-head.jsonl`
- 不得复用 `C07-E01`、不得覆盖前一次 summary、不得把多个 target 合并到一个 summary。

before/after 的 `TARGET_EXEC_ID` 必须来自注册表枚举；每个 target 恰好一次。C07 不允许产品测试角色调用。

## 7. C10 变体、缓存与审计

- C10-P/N/S 各自独立 `OUT\C10\C10-P-E01`（N/S 同构）与 `OUT\audit\C10\C10-P-E01`（N/S 同构）。
- 测试专用配置 `COPY\p0-probe.vite.config.mjs` 固定 325 字节、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`；写配置本身有 intent/result。
- 真实缓存路径：
  - `COPY\node_modules\.vite`
  - `COPY\node_modules\.vite-temp`
  - `COPY\tmp`
- 不得记录或允许副本根 `.vite`/`.vite-temp`；不得用通配符。
- worker `preload` 事件必须含 `process_role=worker`、PID、worker_id、guard 哈希；缺 worker 事件即 C10 FAIL。
- `dist` 是 protected write；C10 不写 dist。

## 8. C12/C16 图标与六目标

允许写六目标（C12 的 PRISTINE / C16 的 SANDBOX）：

```text
dist/manifest.json
dist/devtools.html
dist/panel.html
dist/panel.css
dist/panel-layout.css
dist/sandbox.html
```

图标写前 predicate：

- 执行前从初始清单得到 `P0_ICON16_PRESENT`、`P0_ICON48_PRESENT`、`P0_ICON128_PRESENT`（0/1）。
- guard 在写前检查：值为 1 → 直接 deny；值为 0 → 允许一次 CreateNew。
- 事后审计发现“本来已存在”不算满足；必须在 intent 阶段记录 `conditional=icon_if_absent` 和 predicate 值。
- 其他 JS/Worker/chunk/sourcemap 不在写 allow；guard 在写前拒绝。
- 缓存只能是 `node_modules\.vite`/`.vite-temp` 与 `tmp`；`TEMP/TMP` 指向副本 `tmp`。
- summary 逐目标记录：`present_before`、`writes`、`sha256_before`、`sha256_after`、`decision`、`rule_id`、`conditional`。

## 9. C05 审计

- C05-PRE：无 RUN、无写、无审计文件；输出只到控制台，C20 归档；不得在 C01 后运行。
- C05-FINAL：写 `OUT\audit\C05\C05-FINAL-E01`；验证 staged 16 个 tool/case 文件；失败不产生“通过”summary。
- C05 的 PRE/FINAL 子执行编号独立，不使用同一个 summary。

## 10. 审计链与出口

- 每段首事件 `chain_prev` 来自 `chain-head.jsonl` 最后一条 `segment_close`。
- 每段末事件后 append `segment_close`：`command_id`、`exec_id`、`first_event_sha256`、`last_event_sha256`、`event_count`。
- `chain-head.jsonl` 只追加，不覆盖；不得用 JSON 对象覆盖写。
- `write-summary.json` 必须引用本段末哈希，并给出 allow/deny/expected-denied/unexpected-write 计数。
- 出口必须包含：每段审计、`chain-head.jsonl`、summary、异常计数、未覆盖项。
- C20 在 C18 完成/禁用/失败时均写报告；`phase0_exit_status` 为 `complete` 或 `exit-not-met`；失败状态不得被“报告已生成”掩盖。

## 11. 停止条件

立即停止：

1. bootstrap 事件缺失、顺序不符、B0—B5 之外未登记写；
2. write_intent 未落盘就写业务文件；
3. write_result 失败后继续写；
4. 禁止读成功、禁止写成功、预期拒绝未记录；
5. C11/C15 产生编译产物；
6. C12/C16 写六目标/条件图标之外 dist；
7. C13 写 dist；
8. C14 改未登记文件；
9. C18 覆盖/换位置；
10. C19/C20 覆盖旧段/旧报告；
11. C03 由 Codex 写文件或观察者事后补造；
12. C07 复用子执行号/覆盖 summary；
13. 审计链断裂、字段缺失、事件被改写。

停止后不提权、不换目录、不关守卫、不重写审计、不删除失败日志。重试只能从同一已核验快照派生新实验编号。

## 12. 与启动条件的关系

本规范是 Phase 0 启动前置条件。C05-PRE 必须确认 `p0-audit.cjs` role 为 `audit`；C01 必须按 §2 初始化；C06—C20 缺审计槽即失败。未满足不启动 Phase 0。

