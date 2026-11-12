# OB-Recover Phase 4.7：Phase 0 启动条件 V5（正式候选，待第八轮独立复核）

日期：2026-11-11。性质：执行前契约修订，不是执行结果、独立复核通过记录或 Phase 0 启动授权。

本轮只修订启动契约。不执行 C00—C20、Vitest、tsc、Vite build、浏览器或 L1；不创建 `D:\P47RUN` 或 `D:\P47TOOLS`；不修改 ACL、产品源码、配置、测试、`dist` 或历史证据。V4 与历史报告原样保留，V5 全部使用新文件名。

## 1. 输入、范围与冻结结论

已读输入（实算字节与 SHA-256，本轮未获用户预先批准值，故只证明本轮绑定版本）：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `CODEX-P47-PHASE0-V4-SEVENTH-INDEPENDENT-REVIEW.md` | 38429 | `af6a2c394947c1f71275aba1844cc67c5e603a07a3c70aeab33f1566b6f3f6d0` |
| `PHASE4.7-PHASE0-START-CONDITIONS-V4.md` | 25163 | `e48f1109ae44288872b91182ec747d9689063414a57642cdc95ccedba91b6541` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V4.tsv` | 13724 | `bee85b080a5d9746de8e22d1493f227c2044949ca4b19786a9dc77e283d5c794` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V4.json` | 158114 | `e48904b32c6b554806da203d2907976edde94b030f281a833e7275851a5502cc` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V4.md` | 11942 | `e23b589e84f7cf0155a7516bd4526f2a5eaab2be12cf645f297a9afb38ba61ea` |
| `PHASE4.7-PHASE0-V3-TO-V4-CHANGELOG.md` | 10825 | `22209ea4e065a54f2c1f84144e8a057ee6944b219f5f3cc7fffee3aa0ddb0dcf` |
| `PHASE4.7-PHASE0-V4-OPEN-ISSUES.md` | 7607 | `6e8c3968ccfc2451a7cd7d65b63b90a9c870beabd95a3ec1472a5126f23c9588` |
| `PHASE4.7-PHASE0-V4-SELF-CHECK.md` | 9533 | `03c8348d5104e7ee2ac8eda8f1abce09a8bed8a6963b2a8e41c65bfe2dde7dba` |
| V5 Candidate（方案对照） | 71817 | `4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9` |
| 第五轮独立报告（对照） | 29641 | `f73b172f9dea957d2b60d811a4dd0cfc7a6201fc53b912138ac3a200f73df572` |

**R 系列冻结不变：0 CLOSED、23 PARTIAL、2 OPEN。** OPEN 为 R05、R16；R01 保持 PARTIAL（20 行矩阵 Phase 1 前补齐）。本文件不关闭任何 R 项，不把契约修订当动态通过。

已批准决策沿用：D3、D4、D10、D12、D14、D15。D1、D2、D5、D7、D8、D9、D11、D13、D16 未批准，本轮不代批。阶段顺序保持 Phase 0 → 3 → 1 → 2 → 4 → 5 → 6 → P；TypeScript 只用 `tsc --noEmit`。

安全指标不降低：false-replacement=0、Source Integrity=100%、SRR=100%、有替换时 Precision=100%、零分母写 `n/a`、零替换不自动通过、哈希不符标 `version-mismatch`。

## 2. 固定路径与发布布局（Q01）

| 名称 | 固定值 |
|---|---|
| ORIGINAL | `D:\Projects\ob-recover` |
| RUN_PARENT | `D:\P47RUN` |
| RUN_ID | `P47-20261111-01` |
| RUN | `D:\P47RUN\P47-20261111-01` |
| ReleaseSourceRoot | `D:\P47TOOLS\p47-phase0-v5` |
| ApprovedManifestPath | `D:\P47TOOLS\p47-phase0-v5\RELEASE-MANIFEST.json` |
| StagedRoot | `D:\P47RUN\P47-20261111-01\tools` |
| OUT / AUDIT | `RUN\out` / `RUN\out\audit` |
| CHAIN | `RUN\out\audit\chain-head.jsonl` |
| TERMINAL_SEAL | `RUN\out\audit\terminal-seal.json` |
| BASELINE / M0 | `RUN\baseline` / `RUN\baseline\m0.json` |
| PRISTINE / NO_PLUGIN / SANDBOX | `RUN\exp\pristine-01` / `no-plugin-01` / `sandbox-01` |
| SECOND_ARCHIVE | 用户绑定的绝对路径；未绑定前 C18 禁用 |

发布包为 **20 个 payload 文件，另有独立校验的 `RELEASE-MANIFEST.json`**（修正 V4 的“19 个文件”表述）。映射固定为 `payload/tools/<rel>` → `StagedRoot\<rel>`，共 16 个 staged 文件；4 个 bootstrap 文件（`payload/bootstrap/*`）与 manifest 不进入 staged 根。

V5 去掉未使用的 `RUN\bootstrap` 与 `RUN\sandbox`；`RUN\tmp` 由 C01 创建，作为所有执行的唯一临时目录。

## 3. 首次执行信任链（Q01）

### 3.1 外部信任锚 H1—H5

| 编号 | 被信任对象 | 外部责任 | 时点 |
|---|---|---|---|
| H1 | V5 主文档、白名单、注册表、审计规范 | 用户批准并公布哈希，写入启动批准记录 | C00 前 |
| H2 | `powershell.exe`、`node.exe` 字节 | 管理员只读复算并记录；C00 再核 | C00 前 |
| H3 | C00-E01 与 C03-PROBE-E01 的内联命令文本 | 操作员把实际命令行哈希与注册表 `inline_sha256` 比对 | 启动前 |
| H4 | `P0_ADMIN_ACCOUNT_SID`、`P0_CODEX_ACCOUNT`、`P0_TOOLSRC_MANIFEST_SHA256`、RUN_ID、静默窗口 | 启动批准记录 | C00 前 |
| H5 | `RELEASE-MANIFEST.json` 字节 | 用户批准其 SHA-256 并注入 `P0_TOOLSRC_MANIFEST_SHA256`；C00、C05-PRE、C05-FINAL、C20-SEAL 各复核 | 启动前 |

**C00 只是 fail-fast 闸门，不是信任根。** C00 无法证明自身命令行未被替换；该项只能由 H3 的外部比对承担。任何“自检 PASS”都不替代 H1—H5。

### 3.2 唯一可信的第一次执行

1. **C05-PRE**（source dispatcher，`Entry=ReleaseSourceRoot\payload\tools\p0-dispatch.ps1`，cwd=`C:\Users\Administrator`）验证 manifest 与 20 个 payload 文件，不创建 RUN、不写文件、结果只到控制台。
2. **C01—C05-FINAL 全部使用 source dispatcher**。dispatcher 每次执行前复核自身与目标工具哈希；C01 的 bootstrap 在创建任何目录前再次执行同一 20 文件验证，并把结果写入 genesis 记录。
3. **C04 只写不读**：只 CreateNew 复制 16 个 staged 文件，不读回目标。读回责任完全由 **C05-FINAL** 承担：source dispatcher + verifier 逐字节复算 16 个文件、集合相等、拒绝额外文件与重解析点。
4. **C05-FINAL 关闭 ok 之后**，C06 才第一次执行 staged dispatcher（`StagedRoot\p0-dispatch.ps1`）。
5. **C20-SEAL** 用 source dispatcher + verifier 再核一次 staged 全集，只写 `TERMINAL_SEAL`。

`p0-dispatch.ps1` 必须在编译期内置本注册表 `executions[].argv_sha256` 与 `tool_files` 哈希要求；传入的 `-ExecId` 与实参不符即拒绝执行。工具文件哈希不在本文件生成，全部来自已批准的 `RELEASE-MANIFEST.json`（注册表中 `sha256=null`，`sha_source` 明确标注）。

## 4. 执行身份

| 角色 | 账户 | SID | 权限 |
|---|---|---|---|
| 实施执行 | `WENX\Administrator` | `S-1-5-21-2104787571-1265941319-592731904-500` | RUN 完全控制，ORIGINAL 只读 |
| 系统 | `NT AUTHORITY\SYSTEM` | `S-1-5-18` | RUN 完全控制 |
| Codex 只读 | `P0_CODEX_ACCOUNT`，只能是 `WENX\CodexSandboxOffline` 或 `WENX\CodexSandboxOnLine` | 启动时解析并记录 | RUN 读取/执行，无写 |
| C03 观察者 | `WENX\Administrator` | 同上 | 只写 C03 输出与自己的审计分片 |
| C07 manifest-reader | `WENX\Administrator` | 同上 | 只读 ORIGINAL，写自己的 OUT/审计 |

- SID 来自本机只读解析与当前令牌核对；**用户必须在启动批准记录中确认**，否则不启动 C00/C02。不得用 `S-1-5-32-544`。
- C00 同时校验名称、SID、管理员令牌、Codex 账户二选一、cwd、RUN 不存在、运行时字节与 manifest。
- C02 关闭继承，仅添加 Admin 完全控制、SYSTEM 完全控制、Codex 组读取+执行，读回 SDDL 逐条比对；父目录 `D:\P47RUN` 只精确保护自身，不递归。
- Codex 永不获得写权限，永不接触链头。

## 5. C03：唯一入口与管理观察者（Q02）

C03 拆为两次登记执行：

| 项 | C03-OBS-E01 | C03-PROBE-E01 |
|---|---|---|
| 执行者 | `WENX\Administrator` | `P0_CODEX_ACCOUNT` |
| 入口 | source dispatcher → `payload/bootstrap/p0-observe.ps1` | 内联 PowerShell（注册表 `inline_sha256`） |
| argv | `-ExecId C03-OBS-E01 -ApprovedManifestPath … -ReleaseSourceRoot … -StagedRoot …` | `-NoProfile -NonInteractive -Command <inline>` |
| cwd | `RUN` | `RUN` |
| stdin | 一行人工转交的探针 JSON（≤4096 字节；EOF 立即失败） | 无 |
| 输出 | `OUT\C03\C03-OBS-E01\codex-console.jsonl`、`result.json`、nonce 文件、自己的审计分片 | 仅 stdout 一行 JSON |
| 期限 | 900 s | 300 s |
| 顺序 | 先启动并打印 `READY`，再允许探针 | 在 `READY` 与非 nonce 存在后运行 |

观察者先写 `observe_start`（含 nonce 与 `deadline_seconds`），校验账户属于两个候选之一、属于 `WENX\CodexSandboxUsers`、不是管理员，然后读取一行转交 JSON，校验 `nonce`、`account`、`sid`、组、只读哨兵哈希与写结果必须为 `denied`，最后写 `observe_relay` 与 `observe_end`。全部通过才退出 0。

退出码：60 账户/组不符合；61 nonce 创建失败；62 期限内无转交行；63 转交行不合法或 nonce 不符；51—59 为探针侧失败码。

**已披露限制：** 转交是人工 relay，观察者无法从 OS 层证明该行确由 Codex 进程写出。该事实在报告中固定标为 UNVERIFIED，不写成“已证明实时性”。Codex 不因 C03 获得任何写权限。

## 6. 审计链头（Q03）

`chain-head.jsonl` 的唯一写入者是 **`p0-audit.cjs` 的 control 模式**，由 dispatcher 的 open/seal 步骤以 `WENX\Administrator` 启动。业务进程（PowerShell 工具与 Node 工具）对链头**零读零写**。

| 动作 | 主体 | 许可 | 规则 |
|---|---|---|---|
| genesis | `p0-audit.cjs`（C01） | `file-create` | CreateNew；B0—B5 引导写入逐条列入 `bootstrap` |
| segment_open | `p0-audit.cjs` | `file-append` | 独占打开；读末条与文件字节数；写后 flush |
| segment_close | `p0-audit.cjs` | `file-append` | 同一次独占持有内完成；失败即停止 |
| 读取 | dispatcher open/seal、C19、C20-REPORT、C20-SEAL | `file` 只读 | 只读路径，不写 |

规则：

1. 严格串行：同一时刻只允许一个独占句柄；共享冲突或第二写者一律 fail closed。
2. 每条记录携带 `chain_seq`、`prev_record_sha256`、`prev_file_bytes`，形成哈希链。
3. 不追改旧记录；不重写文件；不截断。
4. 链头路径只授予上述精确文件权限，**不放宽整个 `OUT\audit`**。
5. Codex 与任何产品进程不在读者名单内。

## 7. 审计 schema 与封存顺序（Q04）

事件写入每个进程自己的分片：`OUT\audit\Cxx\<exec>\events-<role>-<pid>-<rand8>.jsonl`，取代 V4 的单一 `write-audit.jsonl`；不再有独立 guard 日志（guard 事件写入同一分片）。

已完成修正：

- `write_intent.intent_id` **等于自身 `event_id`**；`write_result.intent_ref` 引用它。其他事件类型禁填 `intent_id`。
- `write_intent` 禁填 `outcome`、`error_code`、`after`、`bytes_written`；动作前不可能出现“成功”。
- `write_result` 只引用，不重述 `op`、`path`、`src_path`、`rule_ref`、`before`。
- `write_result.durable` 只有在 flush/fsync 后为 true。
- 逐事件必填/可空/禁填字段见审计规范附录 A；链头记录见附录 B；summary 见附录 C。

**唯一封存顺序：**

1. 业务进程全部退出。
2. 冻结分片：逐分片校验事件序号连续、`prev_event_sha256` 链完整、intent/result 配对。
3. 控制通路 `p0-audit.cjs seal` 以 CreateNew 写 `summary.json`；summary 不含自身哈希、不引用链头。
4. 控制通路 `p0-audit.cjs close` 追加 `segment_close`，含分片摘要、summary 哈希与字节数、输出哈希。

规范化序列化为 `p47-canon-json-v1`：UTF-8 无 BOM、对象键按 ASCII 码元排序且仅 `[a-z0-9_]`、无空白、仅安全整数、字符串仅转义 `\"` 与 `\\` 及 `\u00xx`（小写）、禁止浮点/NaN/Infinity/undefined/BigInt/孤立代理项。哈希为规范化文本 UTF-8 字节的 SHA-256。测试向量为独立文件 `PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json`，由 Node 生成，PowerShell 独立复算其中每个规范化串的 SHA-256。

## 8. 读取与写入许可（Q05）

权限分两层登记，互不取并集：

- **dispatcher 层**：manifest 与自身/目标工具字节读；control 模式对链头的精确读写；`summary.json` 的 CreateNew。
- **business 层**：本执行 `inputs` 的内容读与 `outputs` 的写；工具文件精确读。
- **元数据层**：仅 C02 对 `RUN`、`RUN_PARENT` 的 ACL/存在性查询。

关键修正：

- C00 明列 manifest 与 3 个关键工具的内容读（TSV 与注册表一致）。
- `RUN\tmp` 只有一个权限定义：C02 起所有执行以 `TEMP/TMP=RUN\tmp` 运行，并在 business 层授予 `subtree-write`；C05-FINAL 不再是例外。
- C11/C15 的 `copies.json` 是**内容读**，只授给 dispatcher/runner，不透传给产品子进程。
- C18 的 `BASELINE\m0.json` 显式加入输入与只读许可（它不是 snapshot 的子文件）。
- C19/C20-REPORT/C20-SEAL 对 `tools`、`OUT`、`AUDIT`、`EVIDENCE`、`TRUST`、`REVIEW` 的读取逐条登记；不存在“已登记文件自动例外”。
- C14 的写不再覆盖整个 SANDBOX，只允许已批准映射清单列出的文件；目标含 `node_modules`、`dist`、`test`、`.git` 或越出副本即拒绝。
- C10—C13/C15/C16 统一改为受守卫的 Node runner（注册 `target_argv`），不再保留 PowerShell wrapper 与独立 no-plugin 脚本。

注册表 JSON 与白名单 TSV 由同一生成器（`p0v5-build.cjs`）从同一规格产出；主文附录 B—G 亦由该生成器写入。三者不可能各自定义。TSV 为 **57 个数据行 × 26 列**，一行对应一次执行（C07 的 before/after 各自成行），列含入口、cwd、argv 哈希、四类读写、拒绝读、保护写与门条件。`entry_sha256` 列在发布包提供前写作 `manifest-bound`，表示必须来自已批准 manifest，不是缺省哈希；内联执行在该列给出 `inline_sha256`。

## 9. 最终证据封存（Q06）

C20 拆为 `C20-REPORT-E01` 与 `C20-SEAL-E01`；C07 目标枚举末项为 `C20-REPORT-E01`。

| 步骤 | 作用 | 覆盖截止点 |
|---|---|---|
| C19-E01 | 索引 `OUT` 全树与全部审计段 | 自己的 `segment_close`（`cutoff.json`） |
| C07-B-C20-REPORT-E01 | 报告前快照 | 前一 exec 的 `segment_close` |
| C20-REPORT-E01 | 报告与覆盖声明 | 自己的 `segment_close`；声明不覆盖其后记录 |
| C07-A-C20-REPORT-E01 | 报告后证据 | 自己的 `segment_close` |
| C20-SEAL-E01 | 终端封存 | 不在链上追加；读取链尾 |

- C19 与 C20-REPORT 各只运行一次，不因尾部证据重跑。
- `terminal-seal.json` 列出截止点之后的全部分片、输出哈希、尾部链记录序号与终端链哈希，并公布 `terminal_seal_sha256` 供外部锚定。
- C20-SEAL 之后无链记录、无业务写；它只 CreateNew 一个文件。
- 中止路径只允许：失败目标的一次 `C07-A-<target>` + `C20-SEAL`（`aborted`），不运行 C19/C20-REPORT，不重试，不重跑。
- SEAL 失败记 `seal-failed`，不重试。

## 10. SECOND_ARCHIVE（Q07）

三张表彻底分开，不再并存两种解释：

- **启动前外部输入**（第 11 节 A 表）不含 SECOND_ARCHIVE。
- **Phase 0 内硬门**：`P0_SECOND_ARCHIVE` 在 `C07-B-C18-E01` 只读一次；绑定则在同一 `segment_open` 记录 `c18_binding_sha256` 与 `c18_destination`；未绑定则 C18 三连整体跳过，`C07-B-C19-E01` 在 `segment_open.c18_state=disabled-unbound` 记录，不选 TEMP、不选备用路径、不自动创建。注册表以 `ENV:P0_SECOND_ARCHIVE` 表示该输出，校验规则在 `C07-B-C18-E01` 的门条件与 `C18-E01` 的 `fail_closed` 中，它不是未绑定占位符。
- **结束前条件**：C18 必须 `complete` 且归档核验通过；否则 `phase0_exit_status=exit-not-met`。C18 失败（`failed`）同样只能 `exit-not-met`，路径不得更换。

## 11. 准入条件三表

### A. 启动前外部输入（缺一不运行 C00）

| 编号 | 条件 | 责任 |
|---|---|---|
| A1 | 用户批准 V5 主文档、TSV、注册表、审计规范、变更记录、未决清单的哈希 | 用户 |
| A2 | H2 运行时字节复算结果写入启动批准记录 | 管理员 |
| A3 | H3 两条内联命令的实际哈希与注册表一致 | 操作员 |
| A4 | `P0_ADMIN_ACCOUNT_SID`、`P0_ADMIN_ACCOUNT`、`P0_CODEX_ACCOUNT`、RUN_ID、静默窗口确认 | 用户 |
| A5 | 20 个 payload 文件已提供；`RELEASE-MANIFEST.json` 的 SHA-256 已批准并注入 `P0_TOOLSRC_MANIFEST_SHA256` | 用户 |
| A6 | RUN 不存在；ORIGINAL 只读；`D:\P47RUN` 父目录 ACL 已知 | 管理员 |
| A7 | 用户另行下达“开始有限 Phase 0”指令 | 用户 |

### B. Phase 0 内硬门（授权后验证）

| 编号 | 硬门 | 失败处理 |
|---|---|---|
| B1 | C00 身份/清单/运行时/Codex 账户绑定 | 不创建 RUN，停止 |
| B2 | C05-PRE 20 文件集合与字节 | 停止 |
| B3 | C01 bootstrap 与 genesis 链 | 停止，保留现场 |
| B4 | C02 ACL 读回等于期望 | 停止 |
| B5 | C03 探针写被拒、nonce 与账户一致 | 停止 |
| B6 | C04 只写落盘 + C05-FINAL 全量读回 | 停止 |
| B7 | C06 模拟保护区正反例与审计向量 | 停止 |
| B8 | M0、C08 归档、C09 三副本 | 停止 |
| B9 | C10-P/N/S 真实 fork 预载与拒绝探针 | 停止 |
| B10 | C11/C15 `--noEmit` 零编译产物 | 停止 |
| B11 | C12/C16 六静态目标与图标 predicate | 停止 |
| B12 | C13 `dist` 零写入 | 停止 |
| B13 | C14 映射可逆且仅改清单文件 | 停止 |
| B14 | C19 写入账目完整、无缺段 | 停止 |
| B15 | C20-REPORT 覆盖截止点自洽 | 停止 |

### C. 结束前条件（出口）

| 编号 | 条件 |
|---|---|
| C1 | 全部硬门 ok，失败与中止记录保留 |
| C2 | 审计无缺段、无重复编号、`unpaired_intents=0` |
| C3 | 禁止区成功读取为零；未授权写入为零 |
| C4 | M1 相对 M0 无未解释差异；ADS/USN 覆盖已声明 |
| C5 | SECOND_ARCHIVE 已绑定且归档核验通过 |
| C6 | `terminal-seal.json` 与链尾、索引、报告交叉一致 |
| C7 | 报告状态为 `complete` 或 `exit-not-met`；单有报告不等于通过 |
| C8 | 独立复核与用户决定；不自动进入 Phase 3 |

**说明：** “C05-PRE 能通过、C01 能建链”属于**能力契约**，其动态结果在授权后的 S0 验收，不作为运行 C00 之前必须已产生的结果。

## 12. 执行顺序（S0—S9）

共 57 次执行、21 个命令 ID。完整顺序见附录 C。

| 阶段 | 内容 |
|---|---|
| S0 | C00 → C05-PRE → C01 → C02 → C03-OBS/PROBE |
| S1 | C04 → C05-FINAL |
| S2 | C06 |
| S3 | C07-M0 → (C07-B/C08/C07-A) |
| S4 | (C07-B/C09/C07-A) |
| S5 | (C07-B/C10-P/C07-A) |
| S6 | C10-N、C11、C12、C13（各自 before/after） |
| S7 | C10-S、C14、C15、C16（各自 before/after） |
| S8 | C07-M1 → C17 → C18（条件）→ C19 |
| S9 | C20-REPORT → C07-A-C20-REPORT → C20-SEAL |

链参与者 53 个，C18 绑定时链记录 107 条，未绑定时 101 条（C01 genesis + 每参与者 open/close）。

## 13. C10/C12/C13 关键约束

- C10-P/N/S 使用测试专用配置 `p0-probe.vite.config.mjs`：325 字节、8 行、LF、无末尾 LF、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`，只过滤 `copy-extension-files`；必须位于副本根。
- 真实 Vitest fork：`--pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism --reporter=json`；`NODE_OPTIONS=--require <tools>\fs-guard.cjs`；`TEMP/TMP=COPY\tmp`；缓存固定 `COPY\node_modules\.vite` 与 `.vite-temp`。
- 守卫必须在父进程与真实 fork worker 中都预载，并检查 worker PID/role；拒绝读 `ORIGINAL\package.json`、拒绝写 `COPY\dist` 必须成功（即被拒）。
- C12/C16 才加载原样 `vite.config.ts`；写允许仅六个 dist 静态文件；三图标仅在初始清单 `present_before=0` 时允许一次 CreateNew，`present_before=1` 必须在写前拒绝。
- C13 使用同一模板的 `control.vite.config.mjs`，`dist` 任何写入即 FAIL。
- C14 的写由映射清单收窄，且必须可逆；C15/C16 的前置是 `C14` 与 `C10-S` 都通过，TSV 中不存在“C10-S 可选”。

## 14. 停止、失败与回滚

- 原项目始终只读；C07/C08 的读取不等于写许可。
- C00/C05-PRE 失败：不创建 RUN，不执行任何业务脚本。
- 任一禁止读成功、未登记写成功、审计链断裂、路径越界、哈希不符：立即停止并保存现场；不提升权限、不换目录、不关闭守卫、不照旧重跑。
- 失败副本与日志保留；重试只能从同一已核验快照派生新的实验编号。
- C18 未完成只报 `exit-not-met`；不换位置；不自动进入 Phase 3。

## 15. 未决与不代批

- U01（发布包与批准 manifest 哈希）未提供：这是启动阻断，不在本轮自造。
- U02（管理员 SID 用户确认）未完成：C00/C02 不启动。
- U03（SECOND_ARCHIVE）按第 10 节归为出口输入，未绑定即禁用 C18。
- R05、R16 OPEN，R01 PARTIAL；D1/D2/D5/D7/D8/D9/D11/D13/D16 与 W2-B 未批准。
- 所有动态项（ACL、真实 fork、守卫覆盖、原生/FD/链接/子进程边界、写入频次、审计规模）一律 UNVERIFIED。

## 16. 交付

V5 交付：主文档、白名单、注册表、审计规范、审计测试向量、V4→V5 变更记录、未决清单、自检报告、Q01—Q07 追溯表、生成器与检查器、交付清单。绝对路径、字节数、行数与 SHA-256 在交付回复与交付清单中公布。

本轮不执行 Phase 0、测试、构建、浏览器、L1；不修改产品代码、ACL 或历史证据；不改变 R05/R16 OPEN、R01 PARTIAL 或 0/23/2。

审查到此停止，等待 Codex 第八轮独立复核。

## Appendix A：C10/C13 控制配置固定模板

以下 8 行以 LF 连接，**不加末尾 LF**，UTF-8 无 BOM，共 325 字节：

```js
import base from './vite.config.ts';

const plugins = (base.plugins ?? []).filter((plugin) => plugin?.name !== 'copy-extension-files');
if ((base.plugins ?? []).length - plugins.length !== 1) {
  throw new Error('P0 control config must remove exactly one copy-extension-files plugin');
}

export default { ...base, plugins };
```

SHA-256：`18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`。C10 的 `p0-probe.vite.config.mjs` 与 C13 的 `control.vite.config.mjs` 使用同一模板；必须位于副本根目录。

<!-- GENERATED:BEGIN (p0v5-build.cjs) -->

## Appendix B：固定路径与 20 个 payload 映射（生成）

ReleaseSourceRoot=`D:\P47TOOLS\p47-phase0-v5`；ApprovedManifestPath=`D:\P47TOOLS\p47-phase0-v5\RELEASE-MANIFEST.json`；StagedRoot=`D:\P47RUN\P47-20261111-01\tools`；映射 `payload/tools/<rel>` → `D:\P47RUN\P47-20261111-01\tools\<rel>`。manifest 与 4 个 bootstrap 文件不进入 staged 根。

| id | role | source | staged |
|---|---|---|---|
| init | bootstrap-init | `D:\P47TOOLS\p47-phase0-v5\payload\bootstrap\p0-init.ps1` | not staged (bootstrap) |
| acl | bootstrap-acl | `D:\P47TOOLS\p47-phase0-v5\payload\bootstrap\p0-acl.ps1` | not staged (bootstrap) |
| observe | bootstrap-observer | `D:\P47TOOLS\p47-phase0-v5\payload\bootstrap\p0-observe.ps1` | not staged (bootstrap) |
| stage | bootstrap-stage | `D:\P47TOOLS\p47-phase0-v5\payload\bootstrap\p0-stage.ps1` | not staged (bootstrap) |
| dispatch | dispatcher | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-dispatch.ps1` | `D:\P47RUN\P47-20261111-01\tools\p0-dispatch.ps1` |
| verify | verifier | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-verify-release.ps1` | `D:\P47RUN\P47-20261111-01\tools\p0-verify-release.ps1` |
| audit | audit | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-audit.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-audit.cjs` |
| guard | guard | `D:\P47TOOLS\p47-phase0-v5\payload\tools\fs-guard.cjs` | `D:\P47RUN\P47-20261111-01\tools\fs-guard.cjs` |
| simulate | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-simulate.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-simulate.cjs` |
| manifest | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-manifest.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-manifest.cjs` |
| archive | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-archive.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-archive.cjs` |
| copy | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-copy.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-copy.cjs` |
| prun | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-product-run.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-product-run.cjs` |
| neutralize | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-neutralize.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-neutralize.cjs` |
| compare | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-compare.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-compare.cjs` |
| index | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-index.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-index.cjs` |
| report | tool | `D:\P47TOOLS\p47-phase0-v5\payload\tools\p0-report.cjs` | `D:\P47RUN\P47-20261111-01\tools\p0-report.cjs` |
| simcases | case | `D:\P47TOOLS\p47-phase0-v5\payload\tools\cases\p0-simulation-cases-v1.json` | `D:\P47RUN\P47-20261111-01\tools\cases\p0-simulation-cases-v1.json` |
| nmap | case | `D:\P47TOOLS\p47-phase0-v5\payload\tools\cases\p0-neutralize-map-v1.json` | `D:\P47RUN\P47-20261111-01\tools\cases\p0-neutralize-map-v1.json` |
| vectors | case-fixed-bytes | `D:\P47TOOLS\p47-phase0-v5\payload\tools\cases\p0-audit-vectors-v1.json` | `D:\P47RUN\P47-20261111-01\tools\cases\p0-audit-vectors-v1.json` |

## Appendix C：执行顺序（生成）

共 57 次执行；C18 三连为条件组（未绑定时跳过）。

| # | exec | command | entry | cwd |
|---|---|---|---|---|
| 1 | C00-E01 | C00 | inline | `C:\Users\Administrator` |
| 2 | C05-PRE-E01 | C05 | source-dispatcher | `C:\Users\Administrator` |
| 3 | C01-E01 | C01 | source-dispatcher | `C:\Users\Administrator` |
| 4 | C02-E01 | C02 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 5 | C03-OBS-E01 | C03 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 6 | C03-PROBE-E01 | C03 | codex-inline | `D:\P47RUN\P47-20261111-01` |
| 7 | C04-E01 | C04 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 8 | C05-FINAL-E01 | C05 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 9 | C06-E01 | C06 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 10 | C07-M0-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 11 | C07-B-C08-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 12 | C08-E01 | C08 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 13 | C07-A-C08-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 14 | C07-B-C09-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 15 | C09-E01 | C09 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 16 | C07-A-C09-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 17 | C07-B-C10-P-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 18 | C10-P-E01 | C10 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\pristine-01` |
| 19 | C07-A-C10-P-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 20 | C07-B-C10-N-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 21 | C10-N-E01 | C10 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\no-plugin-01` |
| 22 | C07-A-C10-N-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 23 | C07-B-C11-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 24 | C11-E01 | C11 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\pristine-01` |
| 25 | C07-A-C11-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 26 | C07-B-C12-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 27 | C12-E01 | C12 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\pristine-01` |
| 28 | C07-A-C12-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 29 | C07-B-C13-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 30 | C13-E01 | C13 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\no-plugin-01` |
| 31 | C07-A-C13-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 32 | C07-B-C10-S-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 33 | C10-S-E01 | C10 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\sandbox-01` |
| 34 | C07-A-C10-S-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 35 | C07-B-C14-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 36 | C14-E01 | C14 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\sandbox-01` |
| 37 | C07-A-C14-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 38 | C07-B-C15-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 39 | C15-E01 | C15 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\sandbox-01` |
| 40 | C07-A-C15-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 41 | C07-B-C16-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 42 | C16-E01 | C16 | staged-dispatcher | `D:\P47RUN\P47-20261111-01\exp\sandbox-01` |
| 43 | C07-A-C16-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 44 | C07-M1-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 45 | C07-B-C17-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 46 | C17-E01 | C17 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 47 | C07-A-C17-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 48 | C07-B-C18-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 49 | C18-E01 | C18 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 50 | C07-A-C18-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 51 | C07-B-C19-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 52 | C19-E01 | C19 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 53 | C07-A-C19-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 54 | C07-B-C20-REPORT-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 55 | C20-REPORT-E01 | C20 | staged-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 56 | C07-A-C20-REPORT-E01 | C07 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |
| 57 | C20-SEAL-E01 | C20 | source-dispatcher | `D:\P47RUN\P47-20261111-01` |

## Appendix D：逐执行入口与 argv 哈希（生成）

| # | exec | argv sha256 | predecessor | gate |
|---|---|---|---|---|
| 1 | C00-E01 | `1a1e589c8c1f88bbd76785bd9ee36c01bd7b7c25c36b6cd258b7832ec96672fe` | - | H1-H4 recorded in the launch approval record; user issued the "start limited Phase 0" instruction |
| 2 | C05-PRE-E01 | `b3fdbc7f7202f01275ea076ab700ebf0606a6719c4e887a35fe79ad67381e30f` | C00-E01 | C00-E01 exited 0 in the same console session |
| 3 | C01-E01 | `fa5d3f7829984b6c2884f3a68e7f6ad4cc0b434de5d49966ab11e3b41db96ee6` | C05-PRE-E01 | C05-PRE-E01 exit 0; RUN must not exist; bootstrap re-runs the 20-file verification before creating anything |
| 4 | C02-E01 | `2d6079181fdeef4b3b538b8584dfbdf01df6cb80c8e49f387c24a0a5576acc09` | C01-E01 | C01-E01 closed ok; RUN tree contains only entries recorded by C01 |
| 5 | C03-OBS-E01 | `791118c82f30c5c0656d4d280d26d2a3b914889cfd188d3183447c44352de710` | C02-E01 | C02-E01 closed ok; Codex account resolves and is not an administrator |
| 6 | C03-PROBE-E01 | `63f14d407460f79d0b7e17810131dc028a7c802061111a0227a01eba79e51021` | C03-OBS-E01 | C03-OBS-E01 printed READY and the nonce exists |
| 7 | C04-E01 | `95578390e74c8cd243cceff577c28f9b80bd8b91d81f9bf5459b723fc7834579` | C03-PROBE-E01 | C03-OBS-E01 closed ok; STAGED absent or empty |
| 8 | C05-FINAL-E01 | `d5bbcc044daa2a4d933e92b97cdd6bbd78f40872577bfbe930759eb0174d5abb` | C04-E01 | C04-E01 closed ok; the source dispatcher performs this readback (first staged entry is C06) |
| 9 | C06-E01 | `c5de319024545b9f2b96a91aaa3f4c9e46b395bafb8a0613e84a4581e709d1f7` | C05-FINAL-E01 | C05-FINAL-E01 closed ok; first use of the staged dispatcher |
| 10 | C07-M0-E01 | `3a54a7d24ab4b9dea3defc5c87289160e3a20cddc8dab1c14f41eafa8b592cbf` | C06-E01 | C06-E01 sealed ok |
| 11 | C07-B-C08-E01 | `cacf753af9a00697800b34fb2d17448e32b96a6d6028a43c8e95cb09106f628b` | C07-M0-E01 | the previous exec sealed ok; C08-E01 has not started; ORIGINAL readable by admin |
| 12 | C08-E01 | `df7d7382e6c07c00634c67cb28eb5161bf9f433c96e13a856d6e1beef3dcdf72` | C07-B-C08-E01 | C07-M0-E01 sealed ok; ORIGINAL unchanged since M0 |
| 13 | C07-A-C08-E01 | `11277f3525c549f6a03382158dc890f0beddbb9ac982c6600d625eaae3428915` | C08-E01 | C08-E01 sealed ok; ORIGINAL readable by admin |
| 14 | C07-B-C09-E01 | `79d35544f97c4f054fe856448ce50bdd327d9da14c40e0dae05ebd3a6cd63935` | C07-A-C08-E01 | the previous exec sealed ok; C09-E01 has not started; ORIGINAL readable by admin |
| 15 | C09-E01 | `3f2588f264d0164d2b50071ceb74417c3d6c00bd1e21ce54fc6e24eb3cdc5f9b` | C07-B-C09-E01 | C08-E01 sealed ok |
| 16 | C07-A-C09-E01 | `bb8a6dae3173befd7464648ab364dc299920c03adc5dd9a44cd4809888100349` | C09-E01 | C09-E01 sealed ok; ORIGINAL readable by admin |
| 17 | C07-B-C10-P-E01 | `96bfa6cfb43e888e7ee37cca1307af430be94d7559ee4691513a1d6a43c1f6f0` | C07-A-C09-E01 | the previous exec sealed ok; C10-P-E01 has not started; ORIGINAL readable by admin |
| 18 | C10-P-E01 | `3412f70ed0419afd3a319177811c9155b3aae908904eac7ebbff3f4ee064d853` | C07-B-C10-P-E01 | C09-E01 sealed ok; copies.json entry hash matches |
| 19 | C07-A-C10-P-E01 | `92d7a141929f1e0ff19e04978d843d93daae324126ad6fbf16e95e52ac44e86c` | C10-P-E01 | C10-P-E01 sealed ok; ORIGINAL readable by admin |
| 20 | C07-B-C10-N-E01 | `0ae33cf9a0191adaa6881ad06b5c577c71af0770babab21dad84902b6149f62e` | C07-A-C10-P-E01 | the previous exec sealed ok; C10-N-E01 has not started; ORIGINAL readable by admin |
| 21 | C10-N-E01 | `6e2939cae561a3e5a8a7da7287c379c7d4eb80e8c8bfd8b909139cfa2e0a1129` | C07-B-C10-N-E01 | C10-P-E01 sealed ok |
| 22 | C07-A-C10-N-E01 | `c8f8c5db78abeeaa1e9fa041123a8a79f2e852b672264486a39bc465461b8a65` | C10-N-E01 | C10-N-E01 sealed ok; ORIGINAL readable by admin |
| 23 | C07-B-C11-E01 | `98ca7c12a99335b54279b482a06b1884224cc8b320ac2c52c4cfd77ec61573bf` | C07-A-C10-N-E01 | the previous exec sealed ok; C11-E01 has not started; ORIGINAL readable by admin |
| 24 | C11-E01 | `33c467938bbd5f6a3dae0d7244c63b5b10024e83e5098193bad5963acb607c95` | C07-B-C11-E01 | C10-P-E01 sealed ok; tsc.js hash equals copies.json entry |
| 25 | C07-A-C11-E01 | `57f5dd6258d3a0bebd2a84f0aed0a57ed44082db6ecb7efcb7b6b10530588dda` | C11-E01 | C11-E01 sealed ok; ORIGINAL readable by admin |
| 26 | C07-B-C12-E01 | `9494a908c26bc234918e9f70f3069aa7e8cb830cf065b2dafc162ddb2617faf2` | C07-A-C11-E01 | the previous exec sealed ok; C12-E01 has not started; ORIGINAL readable by admin |
| 27 | C12-E01 | `4a71f7742d9d831ac1c10f89f3bdc93d147462be119024d23dd6b72fd99a66a1` | C07-B-C12-E01 | C10-P-E01 sealed ok; original config only |
| 28 | C07-A-C12-E01 | `84ed613a1e7495900bb23683216bc7e8c2a0fb7b2d82d205a05aa472923031f9` | C12-E01 | C12-E01 sealed ok; ORIGINAL readable by admin |
| 29 | C07-B-C13-E01 | `e36ca34e78e7b42a6ea6f5ab6cdd8d87a3be0515325a8e00e7a547bb420d4980` | C07-A-C12-E01 | the previous exec sealed ok; C13-E01 has not started; ORIGINAL readable by admin |
| 30 | C13-E01 | `76497a0ba1f27f63af6def55b3e012d7eb4ce0ce9f44a74b6f744c6469f4cce2` | C07-B-C13-E01 | C10-N-E01 sealed ok; control config SHA-256 must equal the fixed template |
| 31 | C07-A-C13-E01 | `563c8cdc9a88b0103de1867cbc90e85fcff4edc59a3527689e6d01dcb24b6297` | C13-E01 | C13-E01 sealed ok; ORIGINAL readable by admin |
| 32 | C07-B-C10-S-E01 | `2ea9e72fd5887f601159ab803dc5038c6841143cc2b6b95afd254e2e31a4e876` | C07-A-C13-E01 | the previous exec sealed ok; C10-S-E01 has not started; ORIGINAL readable by admin |
| 33 | C10-S-E01 | `e8fa6ad915ecdb76b8cf5344a0884549d23bfae5874007deba6c0106c8e47732` | C07-B-C10-S-E01 | C13-E01 sealed ok |
| 34 | C07-A-C10-S-E01 | `129f3c3dac0815f6a343412de5dc22d4f81c72ed7fbda559d1619a6241f8cd14` | C10-S-E01 | C10-S-E01 sealed ok; ORIGINAL readable by admin |
| 35 | C07-B-C14-E01 | `b352cdd4394aac62fdbec23d9799ca1de0d4f9ec2de9b130a2736836c9458dad` | C07-A-C10-S-E01 | the previous exec sealed ok; C14-E01 has not started; ORIGINAL readable by admin |
| 36 | C14-E01 | `4bd7adffb618da811ee4aa627ebbfe3ca5d7643f7853e7942e2972c6abc3ce85` | C07-B-C14-E01 | C10-S-E01 sealed ok; map verified against its staged hash |
| 37 | C07-A-C14-E01 | `4282ea131ddff9136954fe87291b1e18a4646ed7c885802a09a84efbe655569d` | C14-E01 | C14-E01 sealed ok; ORIGINAL readable by admin |
| 38 | C07-B-C15-E01 | `2ce9f53332df49d07f94a0931b0ab36ced47d5d01ed7099a676eb6e85d05f81d` | C07-A-C14-E01 | the previous exec sealed ok; C15-E01 has not started; ORIGINAL readable by admin |
| 39 | C15-E01 | `a3d1806efa57cafb60b4527eedebe66af2e25c3d2b2f68c085b91279f481e2d6` | C07-B-C15-E01 | C14-E01 sealed ok; C10-S-E01 sealed ok |
| 40 | C07-A-C15-E01 | `e94ed8ba3f3b4984b889828d13ef5ea57b37b1bbb7c638fc4a73af37aaf03070` | C15-E01 | C15-E01 sealed ok; ORIGINAL readable by admin |
| 41 | C07-B-C16-E01 | `a14465e5ec577b4e994731d20f6ca927100cb7fdce84da0895dd0196397dd29d` | C07-A-C15-E01 | the previous exec sealed ok; C16-E01 has not started; ORIGINAL readable by admin |
| 42 | C16-E01 | `85d6ce2ed7cfa265f4865da82ef5beb8d5238eac103829d2a4a07f0f9f7115a8` | C07-B-C16-E01 | C14-E01 sealed ok; C10-S-E01 sealed ok |
| 43 | C07-A-C16-E01 | `05528c9c28bd509cc177baf3adc9513afab13cebfe21f194899c8573523c7ecb` | C16-E01 | C16-E01 sealed ok; ORIGINAL readable by admin |
| 44 | C07-M1-E01 | `706643193fa70c1408bf6a67b668b0dac39ddf89a98b295ed8823c7509ae33d7` | C07-A-C16-E01 | C07-A-C16-E01 sealed ok; M1 must not overwrite M0 |
| 45 | C07-B-C17-E01 | `00ce73db5059b461698a26fc2458f83304434bdae25e10afd1733ed291960f1a` | C07-M1-E01 | the previous exec sealed ok; C17-E01 has not started; ORIGINAL readable by admin |
| 46 | C17-E01 | `235dc161db11b06b1c43aec553ab87f8bbce814f3cef62598b32927eab86fba9` | C07-B-C17-E01 | C07-M1-E01 sealed ok; all S5-S7 targets sealed |
| 47 | C07-A-C17-E01 | `b4744c7ec59035150fdbb6a7ca0d72c7b26c6519d5f6a3af9461b3b41123cd4a` | C17-E01 | C17-E01 sealed ok; ORIGINAL readable by admin |
| 48 | C07-B-C18-E01 | `da753e3b8bd3827d8500493eae7f8f99f430d3b8c399bef48b16d25ca77aed4f` | C07-A-C17-E01 | the previous exec sealed ok; C18-E01 has not started; ORIGINAL readable by admin |
| 49 | C18-E01 | `827c537ce36cf3773350f150460078ce1d9e1d1f4121b0e74da078bc501c3aed` | C07-B-C18-E01 | C07-B-C18-E01 recorded binding_sha256; P0_SECOND_ARCHIVE absolute, outside ORIGINAL/BASELINE/RUN, absent, parent exists and is not a reparse point |
| 50 | C07-A-C18-E01 | `7f0d715f8e179a4983f727cbe0110d7c2755370e2432c5ed789f3d0f7ff26045` | C18-E01 | C18-E01 sealed ok; ORIGINAL readable by admin |
| 51 | C07-B-C19-E01 | `79d8d72653697e364f286c10ef5f6dff3a138efaf69e12883fd861e674016880` | C07-A-C18-E01 | the previous exec sealed ok; C19-E01 has not started; ORIGINAL readable by admin |
| 52 | C19-E01 | `1a2186863b2ba0ac5d1148861d5694162728bb1c81885415f3c9ab0f0afe1a3a` | C07-B-C19-E01 | C07-B-C19-E01 sealed; c18_state recorded |
| 53 | C07-A-C19-E01 | `1ecf771388f988049044528d0892c59284000a0d35cb8b375e2859abdc59bdea` | C19-E01 | C19-E01 sealed ok; ORIGINAL readable by admin |
| 54 | C07-B-C20-REPORT-E01 | `3935a9a106fb8883360dd85ff2ab0e75785b035f67929030afbd0340650125f5` | C07-A-C19-E01 | the previous exec sealed ok; C20-REPORT-E01 has not started; ORIGINAL readable by admin |
| 55 | C20-REPORT-E01 | `6a95484666b279a5930893d5ec7f31a942168f1b30cacf75949ec9f83838dc71` | C07-B-C20-REPORT-E01 | C19-E01 sealed ok |
| 56 | C07-A-C20-REPORT-E01 | `5c29292c6f5665274bb4b30e37369b4844ca52f7364f4ecda08fd51562228ddd` | C20-REPORT-E01 | C20-REPORT-E01 sealed ok; ORIGINAL readable by admin |
| 57 | C20-SEAL-E01 | `93f1f66fde0cf0e4890fe2dfafc424608a7a8dec1740e66c68fc568002d69534` | C07-A-C20-REPORT-E01 | C20-REPORT-E01 sealed ok (normal) or a failed target with its single C07-A (aborted); no terminal-seal.json exists |

## Appendix E：执行环境与 stdin（生成）

| exec | required env | stdin |
|---|---|---|
| C00-E01 | P0_ADMIN_ACCOUNT_SID=required; P0_TOOLSRC_MANIFEST_SHA256=required; P0_CODEX_ACCOUNT=required | none |
| C03-OBS-E01 | P0_CODEX_ACCOUNT=required | one relay line (<= 4096 bytes) from the Codex console; EOF fails closed |
| C03-PROBE-E01 | P0_CODEX_ACCOUNT=required | none |

## Appendix F：Node 执行守卫策略（生成）

| exec | deny_read | policy sha256 |
|---|---|---|
| C06-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `2769a4fc6512e74e1dc602d4080650042ba9330e3853a22535bae663b61d7bdb` |
| C07-M0-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `fe85a17b6004a49cd05d2001d6bf1a060623525c3f22d0bc656f4d0458d3de75` |
| C07-B-C08-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `597c6cc491bfbd51d5ee3617aa3582b7a63f1a0c429399048a3345d676b221d8` |
| C08-E01 | `D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `f7c37ce723b3d6ef1e2bafda00c34d8f8fc4d4ff2b52e1740dc78db666ac8de3` |
| C07-A-C08-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `e63c6af2d12282c86d8e2f3b33523b87a14fdd0584164c20ed146494c3627297` |
| C07-B-C09-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `f9e6b1b2a20177487213a5d992e6b54b793e2e41ffcae0dc63435f247406ff3d` |
| C09-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `f514c7c1424f50c0fbefc940e5c3129eda9614342a9913cdda062df2f7aa69c8` |
| C07-A-C09-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `2f10654a4d218ff1784721cfb70d80a0d2c9f43a3f4240a7f0782e80991623ef` |
| C07-B-C10-P-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `523e66c8bbf508bc2691d5c7a3e079e869f596fb436ad66b8ee63d32fa6127fb` |
| C10-P-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `15374c5fe6b63ec9fe6874f176d1cb1ba3c0841a137741030dd041442a46cde0` |
| C07-A-C10-P-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `91731a331149fb8155c4743ee6ca2bafa7cf6412c995ea84ef694d0b3364ee05` |
| C07-B-C10-N-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `0bf582af69fb9a3afbbbaec614861d89420215610a4e88f81386d2615985b309` |
| C10-N-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `db6bf98ce641c0eeb1ad2fee98bf0150e94a6ea6fb382e778457585baf10f573` |
| C07-A-C10-N-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `969b8376813fdc5627b2055b74ee5b6f4ff6a3977cbffbed9d3adc5de9609931` |
| C07-B-C11-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `ae918100731f2640ba54c183182550d03527d6b8300059cc792f9e0e22bcd733` |
| C11-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `37e8fa0b50abb07d0432dc1c1777e34292e93c4309934cbd7ce6dd77b909c0bb` |
| C07-A-C11-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `0f5bef5d3c5c5f267f06c5571244ab958411e273773468e64f260534662b00d5` |
| C07-B-C12-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `a84bda37a8ce364a8f09e1d62696eacaa0cfae8c3b14ac56056870821f5fdc38` |
| C12-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `d49c8dfbce7e43977f7ffb57c673dd47651fa6adb667a8210a23022729ed6cdf` |
| C07-A-C12-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `b4fff90593d705292c13c53654c6d4a6d6efa47efd5672cc19158abdc03736c4` |
| C07-B-C13-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `cd58a2b4d1fdd61eecfc94802c83b8f3a0f4ff71f2c5ef09b9a2a55dbaa8203d` |
| C13-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `e3593944d533018245c765fc69c7997772da7227ccacfec328f39ac20f63f139` |
| C07-A-C13-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `21ed198ca90d45502a766bc34b1f6318fd0a45af45680b202709d32160bf2af1` |
| C07-B-C10-S-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `8de426ed0691f9e8d5bcd44725472309be8959d034cf8301a4e7e7be9a1c738b` |
| C10-S-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `ac78e09ea7bb1741ae16ac1ff34fb9a149bff8639c32a92e276d42765a54248a` |
| C07-A-C10-S-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `8dc96bbaeeae53482090ab2a5d48209ca238b640be1ac8caa2306db886b5f702` |
| C07-B-C14-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `a639ccaee9b1bd36ac939dd63a6989777422baa8293868c757d7a429da8d12ae` |
| C14-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `5c2494fc35f0f4a085d76c17142b6d5be328518a7694737854dfa19c6e2f2157` |
| C07-A-C14-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `4e77babd57fc8f7fe7091cac7cee8e9ad639c25de79673df1cd4af1505229681` |
| C07-B-C15-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `15f5676dacef5330126ca472239535d9fcdcedab12045f7fd79998cb00b1fe5a` |
| C15-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `d8e90b5e471f0252f870b92ad79747281f5c8079d8682814f87b58be6302c469` |
| C07-A-C15-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `1cebcd7fd2cbaf8353d9d5011f224be3fa0e38822d06ef443592583c64eb575e` |
| C07-B-C16-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `fc95b7401ce66be7814f8ffeb5183747dadc7efa8df9d9d3b9b95843ebb364d1` |
| C16-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\m0.json`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `c53ac396db959b43b224cf07df4d38f70f7c5e331d4f000fdb38925d9727caa3` |
| C07-A-C16-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `e932bee295ef94421e042021f343213ebf8b7ae0ab1b80f92f0c4c218f2073f4` |
| C07-M1-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `65d781120d3a7d98ae896d00b96b9d12e54f30f9e1210988bc0f2c8bb3d56fbd` |
| C07-B-C17-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `9461ebf5ed12daf9ba3ce838b9be64941adacb63c4e3ae1ad08b4e40db6436cb` |
| C17-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `571dad75b642913d2fd6155252dd9664d5a6ad3e5699f97fb91fb2d1416f3a56` |
| C07-A-C17-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `d4042b1d0fed15adc64e2fbcfaf129dfa4f056586aed08d663d0824b6161ec0a` |
| C07-B-C18-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `e7389bb816379b6e6c167a3a6579596ba008e5d8c7e01f5006e46ad7680649b2` |
| C18-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `20185253fd6832f4cd3823150dbd6924bbec740773003be560eb5d65ee9d7a20` |
| C07-A-C18-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `6c4c7a6f7ffe99c8673c7125a98ee9847bb167b44ec3d06ead0bdaaf1aee5aa6` |
| C07-B-C19-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `fac38cd95b84bf04fcbb3ee4caa3f9d4af0b5aa512e41c006a96ea6009ddf322` |
| C19-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\tools` | `203bfe567513fc4df6bce033a93d5856d15428fb28f5be26b8c5c07a474be9d2` |
| C07-A-C19-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `9346ea5ba1d27f09cfebd3ff0811b035a874f2bb9b7df0d46e40cce7741fc8b3` |
| C07-B-C20-REPORT-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `9089e1a0b253d680eb3061bf1ace328bf8e94069984f583adafc3a084e31f40b` |
| C20-REPORT-E01 | `D:\Projects\ob-recover`<br>`D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\tools` | `05a3c4b2cd82de893a3b612e3d41c7595d1dae75bcac8bbdb37cd5f6f1dbb656` |
| C07-A-C20-REPORT-E01 | `D:\P47RUN\P47-20261111-01\baseline\snapshot-01`<br>`D:\P47RUN\P47-20261111-01\exp\pristine-01`<br>`D:\P47RUN\P47-20261111-01\exp\no-plugin-01`<br>`D:\P47RUN\P47-20261111-01\exp\sandbox-01`<br>`D:\P47RUN\P47-20261111-01\evidence`<br>`D:\P47RUN\P47-20261111-01\trust`<br>`D:\P47RUN\P47-20261111-01\review`<br>`D:\P47RUN\P47-20261111-01\controls`<br>`D:\P47RUN\P47-20261111-01\out\audit`<br>`D:\P47RUN\P47-20261111-01\tools` | `0cf6a3f8b3bc5726a45896a700d12e1ea8667ba7918511b82fe94cb0d513406c` |

## Appendix G：计数（生成）

| 项 | 值 |
|---|---|
| 命令 ID | 21 |
| 执行（exec） | 57 |
| 链参与者 | 53 |
| 链记录（C18 绑定） | 107 |
| 链记录（C18 未绑定） | 101 |
| 非链执行（C00、C05-PRE、C03-PROBE） | 3 |
| 终端封存执行 | 1 |
| payload 文件 | 20（staged 16 / bootstrap 4） |
| 审计向量文件 SHA-256 | `dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042`（7981 字节） |
| 注册表 SHA-256 | `078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71` |

<!-- GENERATED:END -->
