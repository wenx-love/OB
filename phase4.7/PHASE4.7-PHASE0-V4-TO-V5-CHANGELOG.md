# OB-Recover Phase 4.7：Phase 0 启动包 V4 → V5 变更记录

日期：2026-11-11。性质：契约修订记录。不执行 C00—C20，不创建 `D:\P47RUN`/`D:\P47TOOLS`，不修改 ACL、产品源码或历史证据。

## 1. 修订依据与范围

依据 Codex 第七轮独立审查（38429 字节，SHA-256 `af6a2c394947c1f71275aba1844cc67c5e603a07a3c70aeab33f1566b6f3f6d0`）的 Q01—Q07。V4 七份文件保持原样，V5 全部使用新文件名；不与 V4 的读/写/审计许可取并集。

本轮只改启动契约，不改产品、不改阶段路线、不关闭任何 R 项。

## 2. Q01：首次执行信任链

| V4 问题（第七轮） | V5 处置 | 证据 |
|---|---|---|
| ApprovedManifestPath / ReleaseSourceRoot / StagedRoot 未分别固定 | 第 2 节固定三值，并固定 `payload/tools/<rel>` → `StagedRoot\<rel>` 映射 | 主文 30—50；附录 B 318—343 |
| C05-FINAL 先运行 staged dispatcher 再验证 staged 集合 | C05-FINAL 改用 **source dispatcher** 读回 staged 全集；C06 才首次执行 staged dispatcher | 主文 66—74；注册表 `C05-FINAL-E01.entry_path`、`C06-E01.entry_path` |
| C04 未声明外部读回责任 | C04 只 CreateNew 写、不读目标；读回责任明确交给 C05-FINAL | 主文 68；`C04-E01.reads` 不含 staged 子树 |
| “19 个文件”与 manifest 自身冲突 | 统一为 **20 个 payload 文件 + 独立 manifest**；staged 16、bootstrap 4 | 主文 44—46；附录 G 532 |
| 首次运行 PowerShell/登记表/环境值的信任责任未定义 | 新增 H1—H5 外部锚表；C00 明确为 fail-fast 闸门而非信任根 | 主文 54—64 |

附加修正：C01 在创建任何目录前重跑 20 文件验证并把结果写入 genesis；C20-SEAL 用 source dispatcher 再核 staged 全集；移除 robocopy 登记，C04 改用 .NET CreateNew。

## 3. Q02：C03 唯一入口

| V4 问题 | V5 处置 | 证据 |
|---|---|---|
| 观察者没有 executable/argv/cwd/输出/顺序/退出判据 | 拆为 `C03-OBS-E01`（登记执行）与 `C03-PROBE-E01`（Codex 内联） | 主文 91—110；注册表两条执行 |
| 账户二选一未强制 | 观察者与探针都校验 `P0_CODEX_ACCOUNT ∈ {Offline, OnLine}`；缺失/越界 fail closed | 主文 96—100；退出码 60/51 |
| 观察者入口未绑定哈希 | `tool_files` 绑定 `p0-observe.ps1`；内联探针登记 `inline_sha256` | 注册表 `C03-OBS-E01.tool_files`、`C03-PROBE-E01.inline_sha256` |
| 未披露观察者能力边界 | 明确人工 relay，观察者无法从 OS 层证明来源，固定标 UNVERIFIED | 主文 109—110 |

Codex 仍为 `write_roots=[]`，不写链头、不写 RUN。

## 4. Q03：链头权限

| V4 问题 | V5 处置 | 证据 |
|---|---|---|
| `chain-head.jsonl` 不在任何精确许可中 | 链头只出现在控制层：participant 的 `file-append`、genesis 的 `file-create`、读者只读 | 主文 112—129；注册表 `writes.control` |
| 唯一写入主体未登记 | `p0-audit.cjs` control 模式，由 dispatcher open/seal 以 `WENX\Administrator` 启动 | 审计规范 5—23 |
| CreateNew/追加/串行化规则缺失 | 独占打开、读末条、校验 `chain_seq`/`prev_file_bytes`、失败即停止 | 主文 122—128；审计规范 65—76 |
| 有放宽整个 `OUT\audit` 的诱惑 | 逐文件/逐段授权，未放宽 `OUT` 或 `AUDIT` 子树 | 检查器断言：C01 之外无 `OUT`/`AUDIT` 业务写 |

## 5. Q04：审计 schema 与封存

| V4 问题 | V5 处置 | 证据 |
|---|---|---|
| `intent_id` 规则自相矛盾 | `write_intent.intent_id = event_id`；`write_result.intent_ref` 引用；其他事件禁填 | 主文 135；审计规范 180—232 |
| intent 允许填写动作后字段 | `write_intent` 禁填 `outcome/error_code/after/bytes_written` | 审计规范 180—206 |
| summary 自引用 | 固定顺序：冻结分片 → CreateNew summary（不含自身哈希、不引用链）→ close 追加并引用 summary 哈希 | 主文 141—149；审计规范 56—63 |
| `segment_close` 不在事件枚举中 | 链头独立 schema `p47-chain-record-v1`，三类记录 genesis/open/close | 审计规范 65—76；附录 B |
| 规范化序列化未固定 | `p47-canon-json-v1` 规则 + 版本 + 独立测试向量（PowerShell 复算） | 审计规范 89—113；附录 D |

新增：每进程独立分片 `events-<role>-<pid>-<rand8>.jsonl`，取消单一 `write-audit.jsonl` 与独立 `guard.jsonl`。

## 6. Q05：读写许可

| V4 问题 | V5 处置 | 证据 |
|---|---|---|
| C00 TSV 只列 manifest 与运行时 | C00 明列 manifest + 3 个关键工具内容读 | `C00-E01.reads.business` |
| C05-FINAL 的 TMP 两表冲突 | TMP 只有一个定义：C02 起 `TEMP/TMP=RUN\tmp`，business `subtree-write` | 主文 158—160；`C05-FINAL-E01.writes` |
| C11/C15 缺 `copies.json` 内容读 | 精确授予 dispatcher/runner 内容读，不透传产品子进程 | 注册表 `C11-E01.reads.business`、`product.reads` |
| C18 缺 `m0.json` 内容读 | 显式加入输入与只读许可 | `C18-E01.reads.business` |
| C19/C20 缺 `tools` 读 | 逐条登记 `tools/OUT/AUDIT/EVIDENCE/TRUST/REVIEW` 读 | `C19-E01`、`C20-REPORT-E01`、`C20-SEAL-E01` |
| C14 写根是整个 SANDBOX | 只允许映射清单列出的文件，禁止 `node_modules/dist/test/.git` | `C14-E01.writes` 仅 `map-listed-file-write` |
| C10—C16 由 PowerShell wrapper 与独立脚本实现 | 统一受守卫 Node runner，登记 `target_argv` 与产品策略哈希 | `C10-*`、`C11`—`C16` 的 `product` 块 |

## 7. Q06：最终证据封存

| V4 问题 | V5 处置 | 证据 |
|---|---|---|
| C19/C20 之后仍产生 C07 after 证据 | C20 拆为 REPORT 与 SEAL；C07 目标末项为 `C20-REPORT-E01` | 主文 172—188；`plan.order` 尾部 |
| 报告覆盖终点未定义 | C19 写 `cutoff.json`；C20-REPORT 写 `report-coverage.json`；SEAL 列尾部 | `C19-E01`、`C20-REPORT-E01` 输出 |
| 封存终点不定 | C20-SEAL 最后执行、不追加链记录、只 CreateNew `terminal-seal.json` | `C20-SEAL-E01`；审计规范 78—87 |
| 可能无限重跑 | C19/C20 各一次；中止路径只允许一次 C07-A + SEAL(aborted)；SEAL 失败记 `seal-failed` 不重试 | `plan.abort` |

## 8. Q07：SECOND_ARCHIVE

| V4 问题 | V5 处置 | 证据 |
|---|---|---|
| 启动前置与出口前置两种解释并存 | 三表分离：启动前输入不含 SECOND_ARCHIVE；Phase 0 内只读一次；结束前必须 complete | 主文 190—196、198—245 |
| 未绑定时的行为不明确 | 未绑定：C18 三连跳过，`C07-B-C19-E01` 记录 `c18_state=disabled-unbound`；不选 TEMP、不选备用路径 | `plan.c18.when_unbound` |
| 失败后可能换路径 | 失败记 `failed`，路径不得更换，只能 `exit-not-met` | 主文 194；`C18-E01.fail_closed` |

## 9. 结构性变更（会影响复核口径）

| 项目 | V4 | V5 |
|---|---|---|
| 命令 ID | 21 | 21（不变） |
| 执行记录 | 每命令一条，子执行内嵌 | **57 条**独立执行，C07 before/after 各自成行 |
| 白名单 TSV | 21 行 × 14 列 | **57 行 × 26 列** |
| payload 文件 | 19（含 16 staged） | **20（16 staged + 4 bootstrap）** |
| 链记录 | 每段 2 条 | 53 参与者 → **107 条**（C18 未绑定 101 条） |
| 审计分片 | 单一 `write-audit.jsonl` | 每进程 `events-*.jsonl` |
| 守卫日志 | 独立 `guard.jsonl` | 并入同一分片 |
| 移除 | — | `RUN\bootstrap`、`RUN\sandbox`、robocopy、`p0-c10.ps1`、`p0-no-plugin.cjs` |
| 新增 | — | `p0-observe.ps1`、`p0-audit-vectors-v1.json`、`terminal-seal.json`、`report-coverage.json`、`cutoff.json` |

C10 变体顺序按 V4：C10-N → C11 → C12 → C13；S7 为 C10-S → C14 → C15 → C16；M1 在 C16 after 之后、C17 之前。

## 10. 未改变

- 已批准决策 D3、D4、D10、D12、D14、D15 的取值不变。
- R01—R25 冻结：0 CLOSED / 23 PARTIAL / 2 OPEN；OPEN = R05、R16。
- 安全指标、零分母 `n/a`、零替换不自动通过、`version-mismatch` 阻断规则不变。
- 阶段顺序 Phase 0 → 3 → 1 → 2 → 4 → 5 → 6 → P 不变。
- RUN_ID、ORIGINAL、三副本路径、管理员账户名不变。

## 11. 未验证与不代批

- 工具包、真实 ACL、真实 fork、守卫覆盖、原生/FD/链接/子进程边界、写入频次、审计规模全部 UNVERIFIED。
- `RELEASE-MANIFEST.json` 与 20 个 payload 文件的实际字节哈希未提供，注册表中保持 `null`，不得代填。
- 管理员 SID 仍需用户确认；`P0_CODEX_ACCOUNT` 仍需用户指定。
- D1/D2/D5/D7/D8/D9/D11/D13/D16 与 W2-B 未批准，本轮不代批。
