# OpenCode P47 V10 受限静态实现报告

日期：2026-11-12 22:08:13（Asia/Shanghai）
输入提交：`a48d3cf`；输入报告：`reviews/CODEX-P47-V10-STATIC-IMPLEMENTATION-CONDITIONS-20261112-220527.md`（9669 字节，SHA-256 `722d4bd8181c4257d1578a8b493ca149f692f375ef9f79a3c123165dbc698830`）。

性质：**V10 受限静态实现**。未运行生成器、发布器、恢复器、lab、C00—C20、Phase 0、ACL、浏览器/L1；未修改 V9/V8/V7、历史证据、产品源码/测试/依赖/锁文件/dist。

## 1. 结论

- H1—H5 已写入 `phase4.7/V10/SPEC-V10.md`，并明确优先于 215522 勘误中的冲突条文。
- 已交付契约源码、schema、静态输入、60 条向量、独立检查器和测试设计，共 26 个文件。
- 只读验证：4 个 `.cjs` 语法解析 PASS；17 个 JSON 解析 PASS；契约检查器 60/60 PASS；独立检查器 PASS。
- **不宣称 V10 发布/恢复/lab/Phase 0 通过。** 动态项均为 NOT_RUN 或 UNVERIFIED；本轮无 FAILED。

## 2. 执行状态

| 项目 | 结果 | 说明 |
|---|---|---|
| 读取 `a48d3cf` / 报告 / 哈希 | PASS | 只读同步与摘要 |
| `node --check` × 4 | PASS | lib/contract/check/independent-check |
| JSON 解析（inputs/schema/vectors） | PASS | 17 个 JSON 文件 |
| `node p0v10-check.cjs --json` | PASS 60/60 | `input_map.ok=true`，`failures=[]` |
| `node p0v10-independent-check.cjs` | PASS | 不 import contract；链/summary/sidecar/输入摘要独立复核 |
| 生成器写正式文件 | NOT_RUN | 未授权；本轮未运行 |
| 发布器/恢复器 | NOT_RUN | 未授权；本轮未运行 |
| lab 故障注入/崩溃/并发 | NOT_RUN | 未授权；本轮未运行 |
| C00—C20 / Phase 0 / ACL / 浏览器/L1 | NOT_RUN | 未授权；本轮未运行 |
| 真实 Windows 文件系统锁竞争 | UNVERIFIED | 无运行证据 |
| JSON Schema 外部 meta-validator | UNVERIFIED | 本轮仅 JSON 解析与纯函数校验 |

## 3. H1—H5 落实

| 条件 | 唯一规格 | 代码位置 | 向量 | 结果 | 未决 |
|---|---|---|---|---|---|
| H1 合法 skip/open 尾 | `SPEC-V10.md` §1 | `p0v10-contract.cjs:50` `classifyChain`；`:193` `sealDecision`；`:213` `validateTerminalSeal` | H1-01—H1-12 | 静态 PASS | 真实链生成/读取 NOT_RUN |
| H2 停止矩阵 | `SPEC-V10.md` §2 | `p0v10-contract.cjs:231` `stopDecision` | H2-01—H2-09 | 静态 PASS | 真实失败注入/回放 NOT_RUN |
| H3 summary 先于 close | `SPEC-V10.md` §3 | `p0v10-contract.cjs:308` `validateSummaryLifecycle` | H3-01—H3-07 | 静态 PASS | 真实 summary/close 生产 NOT_RUN |
| H4 门禁复合身份 | `SPEC-V10.md` §4 | `p0v10-contract.cjs:560` `gateKey`；`:564` `validateGateBundle` | H4-01—H4-10 | 静态 PASS | 真实 checker/verifier 调用 NOT_RUN |
| H5 显式 failure_code 旁证 | `SPEC-V10.md` §5 | `p0v10-contract.cjs:406` `validateFailureSidecar`；`:451` `projectFailureCode`；`schema/failure-sidecar.schema.json` | H5-01—H5-06 | 静态 PASS | 完整 58 exec 分支映射/真实生产 NOT_RUN |

H1—H5 的具体硬化：

- H1：退役“任何非 close 尾即坏链”；`validated-skip-tail`/`validated-open` 不被误判；corrupt 只由 seq/hash/bytes/配对/字段错误推导；无 genesis 与“已有链被移除”分开。
- H2：`CONTINUE / BUSINESS_HALT / HALT_ALL / SECURITY_HALT / CHAIN_FATAL / ORPHAN_HALT / PRE_RUN_HALT` 单一函数；A 只在目标实际启动且 close 可信时生成；security 不因后续 fatal 降级。
- H3：固定 parts→summary→close；缺失/错摘要/close 后篡改/ C19 跨段 summary 均拒绝。
- H4：门禁键为 `(gate_id, mode, subject_id)`；必需集合从 `inputs/gate-requirements.json` 派生；checker staging/pending/accepting + verifier release/accepting；缺/重/额外/错事务/错证据/bundle digest 均拒绝；重试保留失败。
- H5：显式 sidecar 由 dispatcher/audit-control 在 summary 前生成；summary 记录 sidecar 摘要，close 绑定 summary；未知/错 class/trigger/exec/hash 拒绝。

## 4. Q01—Q14 代码位置与结果

| Q | 代码/规格位置 | 静态结果 | 未决限制 |
|---|---|---|---|
| Q01 | `classifyChain`、`stopDecision`；SPEC §1—§2 | 静态 PASS | 真实 fatal/stop 注入 NOT_RUN |
| Q02 | `inputs/failure-code-map.json`、`validateFailureSidecar`、`validateFailureMap`；SPEC §5 | 静态子集 PASS | 全 58 exec 全分支映射未生成；NOT_RUN |
| Q03 | SPEC §2—§3；H2/H3 向量 | 静态契约 PASS | 真实 finalizer/输入可用性 NOT_RUN |
| Q04 | `sealDecision`、`validateTerminalSeal`；SPEC §1.3 | 静态 PASS | 真实 seal 生成 NOT_RUN |
| Q05 | `stopDecision`；H2 向量 | 静态 PASS | 真实 halt 回放 NOT_RUN |
| Q06 | `evaluateProtect`、`inputs/protect-policy.json`；SPEC §7 | 保护分层静态 PASS | copy/rename 实际执行 NOT_RUN |
| Q07 | SPEC §7、`schema/*` | 静态契约 | 写入/ACL 实际执行 NOT_RUN |
| Q08 | `schema/journal.schema.json`、SPEC §8 | 设计静态 | 事务/undo/pending 执行 NOT_RUN |
| Q09 | `reclaimDecision`；SPEC §6 | 静态 PASS | 真实文件系统/并发锁 UNVERIFIED |
| Q10 | `journal.schema.json`、SPEC §8 | 设计静态 | 真实 journal/CURRENT NOT_RUN |
| Q11 | `p0v10-lib.cjs:43/62` `normalizeRel`/`isPathPrefix` | 静态 PASS | Windows 路径/ACL NOT_RUN |
| Q12 | `tests/TEST-DESIGN.md`、H2 向量 | 设计静态 | 真实 kill/crash NOT_RUN |
| Q13 | `p0v10-lib.cjs` `EXPERIMENT_RESULT/COMMAND_STATUS` | 静态 PASS | 真实运行 NOT_RUN |
| Q14 | `classifyMemberDelta`；`inputs/members-*.json` | 静态 PASS | 真实发布/成员切换 NOT_RUN |

## 5. 文件与成员摘要

完整 26 个文件见 `phase4.7/V10/MANIFEST.md`（2832 字节，SHA-256 `ccb6312fd5c9b742b84b047b013bf89ed517f9f6664991c607ad0523af79f5eb`）；该清单列出除自身外的 25 个文件字节/SHA-256，并已逐项复核一致。

关键成员：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `SPEC-V10.md` | 10625 | `f7f74d086de25340237ba93442844782c491da276f2edc3e1e1f5c87f426778f` |
| `p0v10-contract.cjs` | 28356 | `8431b3efb8020006206577d88e0ac7d9a4ccae9187d11e89a3e0fed214e5a542` |
| `p0v10-check.cjs` | 12223 | `faffa72af1a645cb7ee3336922ab5732f8dd41a08ea904996fe2c093c22180f1` |
| `p0v10-independent-check.cjs` | 13010 | `803ebbb69f457fe04bcec173632ee38a7dde0f3b0a31eb3d1f3d8f5d093f89be` |
| `p0v10-lib.cjs` | 2492 | `9c51458bf53c0bb4d08cb7df7d6c5ff6a43bec5c955c9f682f31744db541b635` |
| `inputs/failure-code-map.json` | 6066 | `82cc0dcfcdd3ebe38774ab09e4e9326d018ebd03d5e3bcfce72bdc2e31467a05` |
| `inputs/exec-registry.json` | 3288 | `abc8e60ae0ab1da3d4d1e09162d6122ffecfab701b1595821794083ee6f527ae` |
| `inputs/protect-policy.json` | 1936 | `a971cdf99df0a7e7674a9202e48ab0d932fa52eb9b6252565d0aac0f3f5b0e74` |
| `vectors/vectors.json` | 26367 | `6973d444d0160889182904dc85d4e5674ebe68918daf553cfdf2de551037aef9` |
| `tests/TEST-DESIGN.md` | 4072 | `1c552467cb26050e58bc51c9aba081fa9341b2285c7fe9e4830a7cc9e3441d02` |

schema 共 9 个：lock、journal、gate-bundle、failure-code-map、terminal-seal、fragment-seal、failure-sidecar、protect-policy、member-set。

## 6. 未决限制

1. `failure-code-map.json` 是静态子集（22 条），不是 58 个 exec 的全分支映射；完整表需正式生成。
2. sidecar 生产、summary 生产、close 生产尚未接入执行器；本轮只验证契约。
3. gate bundle 的实际 checker/verifier 调用和证据未生成；静态向量使用合成摘要。
4. 事务/journal/pending/undo/publish/recover 只有 SPEC 与 schema，未实现执行路径。
5. 真实 Windows 文件系统锁、原子硬链接、ACL、进程 kill/崩溃/并发均未运行。
6. JSON Schema 只做 JSON 解析与纯函数校验，未运行外部 meta-validator。
7. 所有链/fixture 为纯内存合成；不构成真实运行证据。

## 7. 边界声明

未执行生成器、发布器、恢复器、lab、C00—C20、Phase 0、ACL、浏览器/L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未修改 V9/V8/V7 或产品源码/测试/依赖/锁文件/dist。下一轮可直接审查实际源码与静态向量；任何正式生成或 scratch 实验仍需单独授权。
