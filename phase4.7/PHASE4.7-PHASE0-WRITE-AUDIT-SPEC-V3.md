# OB-Recover Phase 4.7：Phase 0 写入审计规范 V3

日期：2026-11-11。状态：Phase 0 启动前置条件；不是执行结果。

## 1. 适用范围与冻结规则

本规范适用于 Phase 0 的 C01—C20，覆盖：

- C01 的 RUN/目录/哨兵创建；
- C02 的 ACL 写入；
- C04 的工具落盘；
- C06 的模拟保护区写入与预期拒绝；
- C07/C08 的 BASELINE 写入（原项目只读）；
- C09 的三副本派生；
- C10—C16 的副本测试写入、C12/C16 六个静态目标、C13 零 dist；
- C14 的 SANDBOX 映射写入；
- C18 的第二归档；
- C19/C20 的追加索引与报告。

**冻结结论：**

1. 审计规范是 Phase 0 启动前置条件。C01 未初始化审计链，不得执行 C02—C20。
2. 每个写入尝试（成功、失败、被拒绝）都必须产生一条 JSONL 事件；拒绝写不记录即 FAIL。
3. 审计事件 append-only；不得覆盖、重写、压缩或事后补写旧事件。
4. 没有审计槽的写入一律失败并停止；不得先写后补审计。
5. 审计日志本身是证据，不因“已归因”“有控制台日志”而豁免缺字段。

## 2. 目录与文件

```text
D:\P47RUN\P47-20261111-01\out\audit\
  C01-E01\bootstrap.jsonl
  C02-E01\write-audit.jsonl
  ...
  C20-E01\write-audit.jsonl
  chain-head.json
D:\P47RUN\P47-20261111-01\out\C01\C01-E01\
  write-audit.jsonl
  write-summary.json
```

规则：

- 每个命令/执行编号一个 `write-audit.jsonl`；不得跨命令混写。
- `chain-head.json` 只追加新段引用；不得覆盖旧段。
- `write-summary.json` 是该命令的汇总，必须引用本段 JSONL 的最后事件哈希。
- 文件创建使用 `CreateNew`/`wx`；已存在即失败，除非是同一执行编号的追加段且上一段哈希匹配。
- 审计日志不得写入 `ORIGINAL`、`BASELINE`、`EVIDENCE`、`TRUST` 之外的未授权位置。

## 3. JSONL 事件 schema

每行一个 JSON 对象，UTF-8 无 BOM，LF 结尾。必填字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema` | string | 固定 `p47-write-audit-v3` |
| `event_id` | string | 全局唯一，例如 `C12-E01-0001` |
| `command_id` | string | C01—C20 |
| `exec_id` | string | 首轮 C01-E01 等 |
| `phase0_step` | string | S0—S9 |
| `actor` | string | 实际执行者账户/SID |
| `pid` | integer | 进程 ID |
| `tid` | integer | 线程 ID，无法取得时写 0 并在 `notes` 说明 |
| `process_role` | string | `main`/`worker`/`codex`/`manifest`/`tool` |
| `tool_id` | string | 工具 ID 或 `runtime` |
| `tool_sha256` | string | 实际执行工具/脚本 SHA-256；运行时写可执行文件哈希 |
| `operation` | string | `create`/`write`/`append`/`truncate`/`rename`/`delete`/`mkdir`/`set_acl`/`copy`/`link`/`open_write` |
| `path` | string | 绝对路径；必须规范化，不含 `..`、短名、备用数据流歧义 |
| `path_kind` | string | `file`/`dir`/`ads`/`link`/`reparse` |
| `access` | string | `read`/`write`/`read_write`/`acl` |
| `decision` | string | `allow`/`deny` |
| `rule_id` | string | 注册表/白名单规则 ID |
| `expected` | string | `allowed`/`denied`/`conditional` |
| `actual` | string | `success`/`eacces`/`eperm`/`enoent`/`other` |
| `error_code` | string | 失败时的错误码；成功写空字符串 |
| `create_new` | boolean | 是否 CreateNew/wx |
| `conditional` | string | `none`/`icon_if_absent`/`second_archive` |
| `before_sha256` | string | 写前哈希；新建写空字符串 |
| `after_sha256` | string | 写后哈希；失败/拒绝写空字符串 |
| `bytes_before` | integer | 写前字节数；新建写 -1 |
| `bytes_after` | integer | 写后字节数；失败/拒绝写 -1 |
| `mtime_before_utc` | string | ISO-8601；不可得写空字符串 |
| `mtime_after_utc` | string | ISO-8601；不可得写空字符串 |
| `frequency` | integer | 同一命令/路径在本执行中的第几次写入尝试，从 1 开始 |
| `run_id` | string | P47-20261111-01 |
| `copy_id` | string | `none`/`pristine-01`/`no-plugin-01`/`sandbox-01` |
| `sequence` | integer | 本 JSONL 内从 1 开始 |
| `prev_event_sha256` | string | 上一条事件规范化 JSON 的 SHA-256；首条为空字符串 |
| `event_sha256` | string | 本条事件排除 `event_sha256` 后规范化 JSON 的 SHA-256 |
| `notes` | string | 必要说明；不得用来说明“因此豁免” |

规范化 JSON 规则：键按 UTF-8 字节序排序；无空格；布尔小写；字符串转义固定；数字无前导零。实现必须与 C05 的工具发布清单一致。

## 4. 写入类别与必填证据

### 4.1 C01 引导

- 在 `RUN` 根创建后，第一件事创建 `OUT` 与 `OUT\audit\C01-E01`，写入一条 `bootstrap_root_create`：
  - `path=RUN`，`operation=mkdir`，`decision=allow`，`create_new=true`，`sequence=1`；
  - `notes` 说明审计槽尚未存在，本事件是唯一 bootstrap 例外。
- 之后所有目录、哨兵、bootstrap 探针写入必须有审计槽；哨兵必须 `CreateNew`。
- `out/audit/C01-E01/bootstrap.jsonl` 首条事件的 `prev_event_sha256` 为空；第二条起链接。

### 4.2 C02 ACL

- 记录设置前/后的 SDDL 与 ACE 列表；`operation=set_acl`，`access=acl`，`path=RUN` 及每个子目录。
- 拒绝写/未知 SID/继承未关闭：`decision=deny` 或失败事件，不得静默跳过。
- ACL 写入本身是允许写入；但不得改父目录或 ORIGINAL。

### 4.3 C04 工具落盘

- 每个从 TOOLSRC 复制的文件一条 `copy` 事件，含源/目标、前后哈希、`create_new`。
- 只允许写 `TOOLS`、`BOOTSTRAP`、`OUT\C04`、`TMP`；目标已存在且哈希不同即失败。
- 记录 `TOOLSRC` 只读读取的路径与工具清单哈希；不记录 ORIGINAL 读取（不得发生）。

### 4.4 C06 模拟保护区

- 允许写：`CONTROLS` 合成样本、`OUT\C06`、`TMP`。
- 预期拒绝：登记的禁止读/禁止写目标；必须同时记录 `expected=denied`、`actual=eacces/eperm`、`decision=deny`。
- 禁止读成功即为 FAIL；不得以“已记录”转为通过。
- 每个 API/FD/复制/链接/工作进程路径分别记录；不得只汇总总数。

### 4.5 C07/C08 原项目读取

- C07/C08 对 ORIGINAL 的读取是授权读取，不是写入；审计记录 `access=read`、`decision=allow`、`rule_id=C07`/`C08`。
- 任何对 ORIGINAL 的写尝试：`decision=deny`，并立即停止；成功写即 FAIL。
- C07 输出只写 `BASELINE`（M0）或 `OUT\C07`；C08 只写 `BASELINE/snapshot-01` 与 `OUT\C08`。

### 4.6 C09 三副本

- 每个复制文件一条 `copy`；目标必须 `create_new`。
- 硬链接/联接/共享缓存：`operation=link` 或 `copy` 的 `path_kind=link/reparse`，`decision=deny`。
- 三副本写入必须分别标记 `copy_id`；不得混写。

### 4.7 C10—C16 测试与守卫

- 守卫必须区分 `P0_GUARD_READ_ALLOW`（只读）与 `P0_GUARD_WRITE_ALLOW`（可写）：只读根中的写入仍拒绝；未列入写 allow 的写入一律 deny。`P0_GUARD_DENY` 是硬拒绝根，优先于 allow。
- C12/C16 的只读根可以是整个副本，但写 allow 只能包含 `.vite`、`.vite-temp`、`tmp`、`OUT` 与六个静态目标/条件图标；不得因为副本整体可读而放宽写入。
- C13 的 `NO_PLUGIN\dist` 可以只读用于前后清单，但不得列入写 allow；对 `dist` 的写入必须 deny。
- 所有 `fs-guard` 事件写 `process_role=main/worker`；C10 必须至少有一条 `worker` 的 `preload` 与拒绝读/拒绝写事件。
- C11/C15 的 tsc：任何 JS/d.ts/map/tsbuildinfo/dist 写入即 `decision=deny` 并 FAIL；允许的 `OUT`/`TMP` 写入正常记录。
- C12/C16：六目标逐条记录；允许写条件见 §5；其他 dist/chunk/worker/sourcemap 写入即 FAIL。
- C13：`dist` 任何写入即 FAIL；控制配置写入必须记录固定哈希 18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003。
- C14：只记录映射清单指定文件；未登记文件写入即 FAIL。

### 4.8 C18 第二归档

- 目标必须由用户指定绝对路径；未绑定即 C18 `state=DISABLED`，不得产生“默认归档”事件。
- 目标已存在、覆盖、换位置重试：`decision=deny`，停止。
- 逐文件记录目标哈希，并与 BASELINE 期望值比较；不一致即 FAIL。

### 4.9 C19/C20

- 只允许追加新段；旧段/旧证据/旧报告写入即 FAIL。
- `trust`/`evidence` 追加记录必须包含前段哈希；链断裂即 FAIL。
- C20 不得把 Codex 审查文本伪称为独立实跑；Codex 无文件写权。

## 5. C12/C16 六目标与图标条件

允许且仅允许：

```text
dist/manifest.json
dist/devtools.html
dist/panel.html
dist/panel.css
dist/panel-layout.css
dist/sandbox.html
```

`dist/icon16.png`、`icon48.png`、`icon128.png`：

- 初始清单中不存在：`conditional=icon_if_absent`，允许一次 CreateNew；
- 初始清单中已存在：`decision=deny`，任何写入/覆盖即 FAIL；
- 不因“插件可能重写”预授权第二次写入。

`write-summary.json` 必须为六目标分别给出：

```json
{
  "path": "dist/panel.css",
  "present_before": true,
  "writes": 0,
  "sha256_before": "...",
  "sha256_after": "...",
  "decision": "not_written",
  "rule_id": "C12-STATIC-04"
}
```

其他 JS/Worker/chunk/sourcemap 的 `writes` 必须为 0；否则 FAIL。

## 6. 审计链与验证

- `event_sha256` 链式覆盖前一条；`chain-head.json` 记录每段首/末哈希与段号。
- C05 验证工具发布包含审计器；C06—C20 启动时验证审计槽可写、schema 版本正确、链头可读。
- 任何缺字段、重复 `event_id`、`sequence` 不连续、`prev_event_sha256` 不匹配、事件被改写、JSONL 非 append-only：FAIL。
- 审计失败与业务失败分开报告；不得把审计失败降级为警告。
- Phase 0 出口必须包含：每命令审计段、`chain-head.json`、`write-summary.json`、异常/拒绝事件计数、未覆盖项清单。

## 7. 停止条件

出现以下任一情况，立即停止，保存现场，不进入下一命令：

1. 审计槽未初始化或不可写；
2. 禁止区读取成功、禁止写成功、预期拒绝未记录；
3. C11/C15 产生编译产物；
4. C12/C16 写六目标/条件图标之外的 dist 文件；
5. C13 写 dist；
6. C14 改未登记文件；
7. C18 覆盖/换位置；
8. C19/C20 覆盖旧段或旧报告；
9. 事件链断裂、字段缺失、事后补写。

停止后不得提权、换目录、关闭守卫、重写审计或删除失败日志。重试只能从同一已核验快照派生新实验编号。

## 8. 与 B9 的关系

B9 的结论是：**审计格式属于 Phase 0 启动前置条件**，不是执行后的可选报告格式。V3 冻结本规范；C01 必须按本规范初始化；C04/C05 必须验证工具发布包含审计器；C06—C20 必须以本规范为写入门。未满足即不启动 Phase 0。
