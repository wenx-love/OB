# OpenCode P47 V10 F01—F09 修复报告

日期：2026-11-13 11:39:46（Asia/Shanghai）
输入：`reviews/CODEX-P47-V10-STATIC-IMPLEMENTATION-REVIEW-20261113-072421.md`（9633B，SHA-256 `74c6177de02fe926296ef5b4e69a6be8aebbe92b66adb28e70a65316c53751cd`）。
基线：提交 `ee0ee98`；V10 静态实现提交 `230eef4`。
性质：**静态修复；未运行生成器、发布器、恢复器、lab、Phase 0、ACL、浏览器/L1。**

## 1. 结论

F01—F09 已逐项修复并由新增反例覆盖；`phase4.7/V10/` 现有 **29 个文件、12 个 schema、84 条向量**。

- 主检查器：**84/84 PASS**。
- 独立检查器：**84/84 PASS**，gate 变体按真实 bundle 重算，不再按 variant 名返回预期错误。
- 结构性 schema 样本检查：PASS。
- `MANIFEST.md`：29 个 V10 文件，25 个表项哈希逐项一致（清单自身不计入自身表）。

**不宣称 H1—H5 动态通过。** 真实 sidecar/summary/close 生产、gate 执行、发布/恢复/lab/崩溃/并发仍为 NOT_RUN；全 58 exec 映射仍为 PARTIAL/NOT_RUN。

## 2. F01—F09 修复

| 编号 | 修复 | 代码/规格位置 | 有效基底与反例 | 实际结果 |
|---|---|---|---|---|
| F01 | 成功段与失败段统一 sidecar 规则；ok 允许 null 失败字段；每段仍需 sidecar | `schema/failure-sidecar.schema.json`；`p0v10-contract.cjs:355` `validateSidecarShape`、`:394` `validateSummaryLifecycle`；SPEC §5 | H3-01 ok + sidecar；H5-07 ok sidecar；H3-09 缺 sidecar | H3-01/H5-07 PASS；H3-09 报 `SIDECAR_SCHEMA` |
| F02 | summary/sidecar/close 绑定同一 exec；close 必须匹配 summary | `p0v10-contract.cjs:355-390`；SPEC §3 | H3-08 summary C19/close C12；H5-08 sidecar C15/close C12 | 报 `SUMMARY_CLOSE_EXEC` / `CLOSE_EXEC` |
| F03 | summary 只能由 dispatcher/audit-control 控制上下文生成；业务自证拒绝 | `validControlContext`、`TRUSTED_PRODUCERS`；`p0v10-contract.cjs:394` | H3-05 produced_by=C15-E01，带 control_context | 报 `SUMMARY_PRODUCER` / `SUMMARY_PRODUCER_CONTEXT` |
| F04 | gate 缺 ctx/required 一律拒绝；绑定 old/new index、txid/rid、policy/tool | `p0v10-contract.cjs:634` `validateGateBundle`；`inputs/gate-requirements.json` 增 old index | H4-11 无 ctx；H4-12 空 required；H4-13 错 old index | 分别报 `CTX_REQUIRED`、`REQUIRED_EMPTY`、`BUNDLE_OLD_INDEX` |
| F05 | 独立检查器重算真实 bundle/evidence/digest，不按 variant 名推错误 | `p0v10-independent-check.cjs:206` `localGateValidate`、`:278` `checkGateVectors` | H4-01—H4-13 | 84 向量 PASS；没有 `variant -> errors.push` 分支 |
| F06 | 锁 schema/token/pid 严格校验；错误格式 BLOCKED_MANUAL | `p0v10-contract.cjs:527` `reclaimDecision`；`schema/lock.schema.json`；新增 `schema/reclaim.schema.json` | T01-05 错误 schema；T01-06 错误 token；T01-04 不完整 | 全部 `BLOCKED_MANUAL` |
| F07 | schema/样本/生成对象/检查器一致；新增 summary/control-context/reclaim schema；structural schema check | `schema/control-context.schema.json`、`schema/segment-summary.schema.json`、`schema/reclaim.schema.json`；`p0v10-check.cjs:27` makeSeal 加 `chain_state`；`p0v10-independent-check.cjs:354` `checkSchemaSamples` | H3/H5/T01/I03 样本 | required-field 检查 PASS |
| F08 | H5 绑定 close 的真实 exec | `validateSidecarShape` / `validateFailureSidecar`；SPEC §5 | H5-08 sidecar/summary C15、close C12 | 报 `CLOSE_EXEC` |
| F09 | 新增反例覆盖 | 见 §3 | H1-13—H1-18、H3-08/09、H4-11—13、H5-07—09、T01-05/06、CANON/PATH | 均按预期 PASS |

## 3. 新增反例

| ID | 基底 | 变异 | 实际结果 |
|---|---|---|---|
| H1-13 | 合法 genesis + 单个 open | 第二个 nested open | `corrupt`，`NESTED_OPEN` |
| H1-14 | 合法 open→close | 重复 close 同一 exec | `corrupt`，`CLOSE_WITHOUT_OPEN` |
| H1-15 | 合法 genesis + open | exec `C99-E01` 不在 58 exec 注册表 | `corrupt`，`EXEC_UNKNOWN` |
| H1-16 | 合法 genesis | skip reason `because` | `corrupt`，`SKIP_REASON` |
| H1-17 | open 段 C10-N-E01 | seal 同数量但 exec 换成 C99-E01 | `SEAL_OPEN_SEGMENT_IDENTITY` |
| H1-18 | 已有 fatal close | 调用方传 `complete/allSuccess/planComplete=true` | `degraded-prefix/exit-not-met`，不是 sealed-full |
| CANON-01 | `"a\nb"` | 换行 | canonical 输出为 `"a\\nb"` |
| CANON-02/03 | 安全整数边界 | 9007199254740991 / 9007199254740992 | 前者通过；后者 `unsafe or non-integer number` |
| CANON-04 | 孤立高代理项 | `"\uD800"` | 抛 `lone high surrogate` |
| CANON-05 | 键序 `{b,a}` | canonical 排序 | `{"a":2,"b":1}` |
| CANON-06 | 合法代理对 | emoji | canonical 保留合法对 |
| PATH-01/02 | `C:\foo` / `C:/foo` | Windows 驱动路径 | 均为 `C:/foo`，无 `C:/C:/foo` |

## 4. 静态核验

| 命令/检查 | 结果 |
|---|---|
| `node --check`（lib/contract/check/independent-check） | PASS |
| JSON 解析（inputs/schema/vectors） | PASS，20 个 JSON |
| `node p0v10-check.cjs --json` | **PASS 84/84**，`input_map.ok=true` |
| `node p0v10-independent-check.cjs` | **PASS 84/84** |
| structural schema 样本检查 | PASS |
| `MANIFEST.md` 哈希逐项核验 | PASS（29 文件；表内 28 项） |
| 真实生成/发布/恢复/lab/Phase 0 | NOT_RUN |
| 真实 FS 锁/崩溃/并发 | UNVERIFIED |
| 外部 JSON Schema meta-validator | UNVERIFIED；本轮只做 required-field/结构检查 |

## 5. Q01—Q14 状态

| Q | 修复后静态状态 | 未决 |
|---|---|---|
| Q01 | 静态 PASS；新增 nested/重复终态/未知 exec/非法 skip/链内失败 | 真实注入 NOT_RUN |
| Q02 | 静态子集 PASS | 全 58 exec 全分支映射 PARTIAL/NOT_RUN |
| Q03 | 静态契约 PASS；H3 成功/失败 sidecar 一致 | 真实 finalizer NOT_RUN |
| Q04 | 静态 PASS；seal open identity/失败链反例 | 真实 seal NOT_RUN |
| Q05 | 静态 PASS | 真实 halt 回放 NOT_RUN |
| Q06 | 保护分层静态 PASS | copy/rename 执行 NOT_RUN |
| Q07 | 静态契约 | 实际写入/ACL NOT_RUN |
| Q08 | SPEC/schema | 事务执行 NOT_RUN |
| Q09 | 静态 PASS；错误锁 schema 阻断 | 真实 FS/并发 UNVERIFIED |
| Q10 | SPEC/schema | 真实 journal/CURRENT NOT_RUN |
| Q11 | 静态 PASS；Windows 驱动路径反例 | Windows/ACL 实测 NOT_RUN |
| Q12 | 设计/反例 | kill/crash NOT_RUN |
| Q13 | 静态 PASS | 真实运行 NOT_RUN |
| Q14 | 静态 PASS | 真实发布 NOT_RUN |

## 6. 文件与清单

- `phase4.7/V10/MANIFEST.md`：29 个 V10 文件；清单表列 28 个文件，逐项字节/SHA-256 核验 PASS。
- 新增 schema：`control-context.schema.json`、`segment-summary.schema.json`、`reclaim.schema.json`。
- 关键哈希（完整清单见 MANIFEST）：
  - `p0v10-contract.cjs` 33035B `0a34b33bfaedc5770c2af516c0995ffbb35f54af5809dae4c32f7b7ee533702b`
  - `p0v10-check.cjs` 14089B `38448ded8c181d29a4d1fcd3c3bc42900c9b0a77907debfbebec6280b915e13d`
  - `p0v10-independent-check.cjs` 21858B `aefad784dd778b11abaa67df35e9bfa1c6bd2b6a46a0fa1dedac8d186dc6f2f3`
  - `p0v10-lib.cjs` 3154B `b8226e6e1c615bc65dd2297baedc059404c448f70b3c7333e1fee3169d7ecaf8`
  - `vectors/vectors.json` 41325B `d301a5b9b246ba8c6da8f1cde98cf5df3dc15cfbe8b55ffb3b03805caf399a42`
  - `MANIFEST.md` 29 文件，清单自身 SHA-256 `16dfebab2ad8ab08f7d9f62976d7077e21955d43e8ee95c07d91c2365ee7584f`

## 7. 未决限制

1. 全 58 exec 的完整失败分支映射仍未生成；当前 22 条 map 为静态子集。
2. sidecar/summary/close 的真实生产、gate 实际执行、事务/publish/recover 未实现执行路径。
3. 真实 Windows 文件系统锁、ACL、进程 kill/崩溃/并发未实测。
4. 外部 JSON Schema meta-validator 未运行；只有 required-field/结构一致性检查。
5. 84/84 仅表示静态契约/向量通过，不是发布/恢复/lab/Phase 0 通过。

## 8. 边界

未修改 V9/V8/V7、历史报告或产品文件；未运行生成器、发布器、恢复器、lab、C00—C20、Phase 0、ACL、浏览器/L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`。下一步等待修复后的源码独立复审。
