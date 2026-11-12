# OB-Recover Phase 4.7：Phase 0 V4 自检报告

日期：2026-11-11。性质：文档/契约自检，不是独立复核，不是 Phase 0 执行结果。

## 1. 输入与结论

已核对第六轮报告：27197 字节、329 行、SHA-256 `2e349cbf6b286c06bb853c65c7df2aa2c3dbbd5fefb2aac6e10d13a5786853bd`；结论 REJECTED，B1—B9 为 4 OPEN / 5 PARTIAL。

已完整读取 V3 六份文件及第五轮报告（29641 字节，`f73b172f...`），并核对 R 系列：**0 CLOSED / 23 PARTIAL / 2 OPEN；R05/R16 OPEN，R01 PARTIAL**。

自检结论：

- **文档/契约层：** 四个 OPEN 的关键冲突均有明确修订；五个 PARTIAL 逐项处理。
- **动态层：** C00—C20 一律未执行；ACL、Worker、审计链、缓存、dist 写入频次均 UNVERIFIED。
- **启动层：** Phase 0 **不具备实际启动条件**；TOOLSRC v4 发布包缺失、账户 SID 待用户确认、SECOND_ARCHIVE 未指定。

## 2. 十二项自检

| # | 检查项 | 结果 | 证据（文件:行号） |
|---|---|---|---|
| 1 | 四个 OPEN 是否明确处理 | PASS（文档层）；动态未完 | B1：`PHASE4.7-PHASE0-START-CONDITIONS-V4.md:96-100`、`:112-155`；B3：`:236-270`；B6：`:34-59`、`:178-198`；B9：`:310-337`。注册表对应 `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V4.json:116-289`（C00/C05）、`:369-504`（C02/C03）、`:667-851`（C07）、`:1002-1258`（C10） |
| 2 | 五个 PARTIAL 是否逐项处理 | PASS（文档层）；动态未完 | B2：`...V4.md:96-108` 与注册表 C04 `:506-581`；B4：`:272-290` 与 C12/C16 `:1347-1459`、`:1721-1832`；B5：`:292-296` 与 C13 `:1460-1549`；B7：`:339-343` 与 `PHASE4.7-PHASE0-V4-OPEN-ISSUES.md:62-66`；B8：`:218-234` 与 C07 `:667-851` |
| 3 | C02 是否使用实际批准账户 | PASS（SID 绑定）；待用户确认 | `...V4.md:34-52` 固定 `WENX\Administrator` 与 `S-1-5-21-2104787571-1265941319-592731904-500`；注册表 identity `:9-17`，C02 `:369-443`；明确禁止 `S-1-5-32-544`。历史文本只批准账户名，SID 需启动记录确认（Open U02 `:37-43`） |
| 4 | C10 是否消除守卫/测试配置冲突 | PASS（契约）；动态 UNVERIFIED | `...V4.md:236-270` 使用测试专用 `COPY\p0-probe.vite.config.mjs`（325 字节、`18a061...`），真实 Vitest fork，P/N/S 三变体，缓存 `node_modules\.vite`，`dist` protected write；注册表 C10 `:1002-1258`，审计规范 `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V4.md:161-171` |
| 5 | Bootstrap 是否有首次执行可信验证链 | PASS（契约）；发布包缺失 | `...V4.md:112-155`：C00 内联验证清单/dispatcher/verifier/audit；C05-PRE 在 C01 前验 19 文件；C01—C04 只经 dispatcher；C05-FINAL 验 16 staged；注册表 `preflight:87`、C00 `:116-174`、C05 `:175-289`；`...OPEN-ISSUES.md:30-36` 仍是启动阻断 |
| 6 | 审计初始化是否早于所有受审计写入 | PASS（契约）；动态 UNVERIFIED | 审计规范 `:28-58` 只允许 B0—B5 有限 bootstrap：父/RUN/OUT/OUT\audit/C01 审计目录/sink；B5 为 `audit_control`；B0—B5 flush 后才允许哨兵/init；注册表 C01 `:288-367`；主文 `:310-337` |
| 7 | C03 与 C07 权限是否闭合 | PASS（契约）；动态 UNVERIFIED | C03：主文 `:200-216`，注册表 `:445-504`（Codex `write_roots=[]`、observer 写 C03 转写/审计、`actor=Codex`/`recorder=Administrator`）；C07：主文 `:218-234`，注册表 `:667-851`，审计规范 `:142-159` |
| 8 | C07 是否不会被重复调用 | PASS（契约） | 主文 `:218-234` 固定 `C07-M0-E01`、`C07-B-${TARGET_EXEC_ID}-E01`、`C07-A-${TARGET_EXEC_ID}-E01`、`C07-M1-E01`；注册表 `exec_ids:671`、`binding` 枚举、`gate:839`；每个子执行独立 output/audit/summary |
| 9 | 21 条命令是否全部有明确契约 | PASS（结构） | 注册表 `commands` 21 个 ID：C00/C05/C01/C02/C03/C04/C06/C07/C08/C09/C10/C11/C12/C13/C14/C15/C16/C17/C18/C19/C20；白名单 `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V4.tsv:1-22` 为 21 数据行、14 列；机械检查无缺号/重复 |
| 10 | 所有输入输出路径是否一致 | PASS（静态交叉检查）；动态 UNVERIFIED | C12/C16 六目标各 6 条：注册表 `:1347-1459`、`:1721-1832`；C13 控制配置固定 `:1460-1549`；C10 三变体 `:1002-1258`；C05 PRE/FINAL `:175-289`；TSV C10/C12/C13/C16 行与主文 `:236-296` 一致 |
| 11 | 是否存在未经批准的新增决策 | PASS（未代批） | 主文 `:5-30` 只列已批准 D14/D3/D4/D10/D12/D15 等；`...OPEN-ISSUES.md:68-79` 保留 D1/D2/D5/D7/D8/D9/D11/D13/D16、W2-B 待批；未新增决策值 |
| 12 | 是否把未验证事项错误标为 PASS | PASS（未标为动态 PASS） | `...OPEN-ISSUES.md:85-118` 列全部 UNVERIFIED；主文 B 表 `:96-108` 用“契约闭合/动态 UNVERIFIED”；自检本表也只给“文档层 PASS/动态 UNVERIFIED” |

## 3. 机械检查结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 注册表可解析 | PASS | `ConvertFrom-Json`：21 commands |
| 白名单结构 | PASS | 21 数据行 × 14 列 |
| 命令 ID | PASS | 21 个不同 ID，无缺号/重复 |
| 角度占位符 | PASS | V4 六份文档无尖括号形式占位符 |
| C10 变体 | PASS | `C10-P-E01`、`C10-N-E01`、`C10-S-E01`；注册表 `exec_ids:1006` |
| C10 测试配置 hash | PASS | `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003` |
| C13 控制配置 hash | PASS | 同上；注册表 C13 `:1460-1549`；主文 `:292-296` |
| C12/C16 六目标 | PASS | 各 6 条；注册表 `:1347-1459`、`:1721-1832` |
| C11/C15 `--noEmit` | PASS | 注册表 C11 `target_argv:1339-1345`、C15 `target_argv:1713-1719` 均含 `--noEmit`；C15 gate `:1704` |
| C15 前置 | PASS | `C14 pass; C10-S-E01 pass`；注册表 `:1698` |
| C20 C18 状态 | PASS | `C18 status recorded (complete/disabled/failed); report always produced`；注册表 `:2130` |
| R05/R16/R01 | PASS | 0/23/2；R05/R16 OPEN；R01 PARTIAL；主文 `:25-29`、`:339-343`；Open `:7-11` |
| TOOLSRC 发布包 | **BLOCKED** | Open U01 `:30-36`；路径 `D:\P47TOOLS\p47-phase0-v4` 未提供 |
| 账户 SID 确认 | **BLOCKED** | Open U02 `:37-43`；历史文本无 SID，需用户确认 |
| SECOND_ARCHIVE | **BLOCKED** | Open U03 `:45-49`；C18 保持 DISABLED |
| 动态 Phase 0 项 | **UNVERIFIED** | Open U10 `:85-100`；没有执行 C00—C20 |

## 4. 四个 OPEN 的逐项结论

### B1

- 契约：C00/C05-PRE/C05-FINAL/dispatcher 链已固定；C00 不执行 TOOLSRC 脚本；C05-PRE 在 C01 前验 19 文件；C04 不复用目标；C05-FINAL 验 16 staged。
- 未闭合：TOOLSRC 发布包和用户批准哈希缺失；工具行为未运行。
- 结论：**契约闭合，启动仍阻断。**

### B3

- 契约：C10-P/N/S 使用测试专用配置，不执行原插件 `closeBundle`；真实 Vitest fork；缓存精确；dist protected；C15/C16 使用 C10-S。
- 未闭合：真实 Worker、缓存、拒读/拒写、写入频次未运行。
- 结论：**契约闭合，动态 UNVERIFIED。**

### B6

- 契约：C02 使用实际 `WENX\Administrator` SID，不使用 Administrators 组；C00 严格名称/SID/管理员/清单哈希；Codex 组只读。
- 未闭合：历史文本没有 SID；用户必须确认 `P0_ADMIN_ACCOUNT_SID`；ACL/Codex 探针未运行。
- 结论：**技术绑定闭合，SID 用户确认仍是启动条件。**

### B9

- 契约：单一审计根；C01 B0—B5 有限 bootstrap；write_intent/result；C03 观察者；C07 子执行；C12 图标 predicate；C20 失败报告；audit 模块。
- 未闭合：审计链、链头、C03 实时性、C07 32 段、C12 频次未运行。
- 结论：**契约闭合，动态 UNVERIFIED。**

## 5. 五个 PARTIAL 的逐项结论

| 项 | 已修 | 仍未验证 |
|---|---|---|
| B2 C04 | 目标不存在、不复用、只读 TOOLSRC/RUNTIME、C05-FINAL 核验 | 落盘/哈希/链接 |
| B4 C12/C16 | 六目标、图标写前 predicate、缓存精确、其他 dist 拒绝 | 实际 closeBundle 频次/图标状态 |
| B5 C13 | 8 行/LF/无末尾 LF/325/`18a061...`、C10-N、零 dist | 实际生成/差异/Vitest |
| B7 R01 | 留在 Phase 1 前；20 行索引保留 | 具体 fixture/harness/故障注入 |
| B8 C07 | 子执行独立、每 target 一次、Codex 只读 | 实际进程/OS 隔离/次数 |

## 6. Phase 0 是否具备申请启动条件

**不具备实际启动条件。** V4 具备提交第七轮独立复核的文档条件；实际 Phase 0 仍被以下阻断：

1. `D:\P47TOOLS\p47-phase0-v4` 未提供，`P0_TOOLSRC_MANIFEST_SHA256` 未批准。
2. `P0_ADMIN_ACCOUNT_SID` 未由用户确认；历史文本只有账户名。
3. `P0_CODEX_ACCOUNT` 未指定；必须是两个批准 Codex 账户之一。
4. `SECOND_ARCHIVE` 未指定；C18 禁用，Phase 0 不能关闭。
5. 所有动态 Phase 0 项 UNVERIFIED。
6. C05-PRE/C01—C20 未执行；不得把契约自检当运行通过。

## 7. 不得由本自检代替的事项

- 不把 B1/B3/B6/B9 的契约修订写成 CLOSED。
- 不把 C10/C12/C13/C15/C16 的静态配置写成动态通过。
- 不把 Codex 只读规则写成 OS 级隔离已验证。
- 不把账户名解析写成历史 SID 已批准。
- 不改变 R05/R16 OPEN、R01 PARTIAL、0/23/2。
- 不自动批准 D1/D2/D5/D7/D8/D9/D11/D13/D16、W2-B 或 Phase 0 启动。

## 8. 停止点

V4 七份文件已完成静态自检。本轮未执行 C00—C20、Vitest、tsc、Vite build、浏览器、L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未修改 ACL、产品源码/配置/测试/dist/历史证据。

等待 Codex 第七轮独立复核；不自启动 Phase 0。







