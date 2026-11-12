# OB-Recover Phase 4.7：V10 静态源码独立审查

日期：2026-11-13 07:24:21（Asia/Shanghai）。性质：对提交 `230eef4` 的只读源码/静态向量审查，不是 V10 验收，不是 Phase 0 授权。

## 结论

**REVISE BEFORE ACCEPTANCE：静态框架已成立，但 H3、H4、T01 和 schema 一致性存在已确认缺陷，不能按当前实现接受 H1—H5 全通过。**

主检查器在其自身 60 条向量上为 60/60 PASS，独立检查器也 PASS；但这些结果不能覆盖下面的反例。H1 的链状态框架基本成立；H3/H4/T01 有可直接复现的静态缺陷。动态发布/恢复/lab/Phase 0 未运行。

## 输入与方法

- 提交：`230eef4 feat(phase4.7): add V10 static contract tools, schemas, vectors, and independent checker`
- 实现报告：`reviews/OPENCODE-P47-V10-STATIC-IMPLEMENTATION-20261112-220813.md`（8147B，SHA-256 `97d72bb145a817a834951bc8cfd29f2ce81ff80f85a140f043057fcea4a8c9e6`）
- `phase4.7/V10/MANIFEST.md`：2832B，SHA-256 `ccb6312fd5c9b742b84b047b013bf89ed517f9f6664991c607ad0523af79f5eb`
- 本报告只读取源码、JSON、向量和清单；运行 `node --check`、JSON 解析、两个只读检查器，以及无写入的纯内存反例探针。未运行生成器、发布器、恢复器、lab、C00—C20、Phase 0、ACL、浏览器/L1。

## 已执行核验

| 项 | 结果 |
|---|---|
| 4 个 `.cjs` `node --check` | PASS |
| 17 个 JSON 解析 | PASS |
| `p0v10-check.cjs --json` | PASS 60/60，`input_map.ok=true` |
| `p0v10-independent-check.cjs` | PASS |
| `MANIFEST.md` 25 个文件字节/哈希 | PASS |
| V10 文件数 | 26（与清单/报告一致） |
| 动态生成/发布/恢复/lab/Phase 0 | NOT_RUN |
| 真实 FS 锁/崩溃/并发 | UNVERIFIED |

## 已确认缺陷

### F01｜H3：成功段无法同时满足“每段 sidecar”和 sidecar schema

**CONFIRMED；P1。**

`SPEC-V10.md` 第 140 行写“每段在 summary 前生成 sidecar”；`schema/failure-sidecar.schema.json:6` 却要求 `result` 只能是 `failed|aborted`、`failure_class` 非空；`p0v10-contract.cjs:328` 又无条件要求 sidecar 存在。于是成功的 ok 段：

- 不带 sidecar → `validateSummaryLifecycle` 报 `SIDECAR_SCHEMA`；
- 带 ok sidecar → 不符合 sidecar schema。

纯内存探针：

```text
H3-ok-no-sidecar -> { ok: false, errors: ['SIDECAR_SCHEMA'] }
```

H3-01 用 failed 段绕开了该冲突，因此 60/60 不能证明成功段通过。

### F02｜H3：summary 与 close 的段身份没有绑定

**CONFIRMED；P1。**

`validateSummaryLifecycle` 核对 summary 的哈希/字节，但没有核对 `summary.exec_id` 与 `close.exec_id` 一致。纯内存探针：

```text
summary.exec_id=C19-E01, close.exec_id=C12-E01
-> { ok: true, errors: [] }
```

这允许 A 段的 summary 被 B 段 close 引用，违反 H3“本段 summary”要求。

### F03｜H3：允许业务执行自己生成 summary

**CONFIRMED；P1。**

`p0v10-contract.cjs:351` 允许 `summary.produced_by === summary.exec_id`。H3 要求由受信 dispatcher/audit-control 代表本 exec 生成；业务执行自证 summary 不成立。纯内存探针：

```text
summary.exec_id=C12-E01, produced_by=C12-E01, 带 sidecar
-> { ok: true, errors: [] }
```

### F04｜H4：缺少 ctx/required 时可绕过事务与索引绑定

**CONFIRMED；P1。**

`validateGateBundle` 的 txid/rid/new index/policy/tool 检查均在 `if (ctx && ...)` 内（`p0v10-contract.cjs:589-599`），`config.required || []` 也允许空必需集。纯内存探针：

```text
validateGateBundle(valid bundle, config, 省略 ctx)
-> { ok: true, errors: [] }

validateGateBundle(空 bundle, {}, 省略 ctx)
-> { ok: true, errors: [], required: [], present: [] }
```

H4 要求每次调用绑定本事务、正式索引、工具/策略摘要；当前函数在缺少上下文时不是 fail-closed。

### F05｜H4 独立检查器对 gate 变体是自述式检查

**CONFIRMED；P2。**

`p0v10-independent-check.cjs:190-192` 对 `wrong_txid`、`wrong_evidence`、`bad_digest` 直接 `errors.push(...)`，没有重算 bundle 的 txid、evidence digest 或 `bundle_digest`。因此它不能独立证明 H4；只是按 variant 复述预期。主检查器虽会实际调用 `validateGateBundle`，但 `ctx` 始终由测试提供，未覆盖 F04。

### F06｜T01：错误 schema 的主锁会被当作可回收

**CONFIRMED；P1。**

`reclaimDecision` 的 `incomplete` 只检查 `schema/token/pid` 是否为 `undefined`（`p0v10-contract.cjs:465`），不校验 schema 值、token 格式、pid 类型。纯内存探针：

```text
main={schema:'bogus',token:'a'*32,pid:1}, mainAlive=false, reclaim=null
-> { action: 'RECLAIM_INSTALL', reason: 'reclaim-absent' }
```

这会把错误格式的主锁当成可回收对象，偏离 T01 的“保留现场/BLOCKED_MANUAL”约束。

### F07｜schema 与静态样本/生成对象不一致

**CONFIRMED；P2。**

至少以下 schema 要求字段在样本/检查器生成对象中缺失：

- `schema/terminal-seal.schema.json:6` 要求 `chain_state`；`p0v10-check.cjs:27-35` 的 `makeSeal` 不生成。
- `schema/failure-sidecar.schema.json:6` 要求 `produced_utc`、`segment_dir`；H5-01 sidecar 没有。
- `schema/lock.schema.json` 要求 `created/purpose/txid`；T01 的 main/reclaim 样本没有。
- `schema/fragment-seal.schema.json` 要求 `excerpt_digest`；I03-01 样本没有。

当前两个检查器都不运行 JSON Schema meta-validator，所以这些不一致未被发现。报告已声明“meta-validator UNVERIFIED”，但 schema 作为交付物仍应与样本一致。

### F08｜H5：sidecar 未绑定 close 的真实 exec

**CONFIRMED；P2。**

`validateFailureSidecar` 核对 summary/sidecar 的 exec 一致，但没有核对 `close.exec_id`。纯内存探针：

```text
sidecar.exec_id=C12-E01, summary.exec_id=C12-E01, close.exec_id=C99-E01
-> { ok: true, errors: [], code: 'P47-E-IO' }
```

H5 要求 checker 验证实际 exec；close 是链上最终绑定对象，不能只看 sidecar/summary。

### F09｜向量覆盖缺口

**CONFIRMED；P2。**

60 条向量未覆盖：成功 ok 段无 sidecar、summary/close 段身份错配、summary 由业务 exec 自证、`validateGateBundle` 无 ctx/空 required、T01 错误 schema、H5 close exec 错配、schema 必要字段。因此 60/60 只能证明已覆盖分支，不足以支持实现报告中的 H3/H4/T01 “静态 PASS”。

## H1—H5 评估

| 条件 | 评估 | 说明 |
|---|---|---|
| H1 链状态 | **基本 PASS（静态）** | close/skip/open/open+skip/坏 hash/seq/配对/无 genesis 均覆盖；terminal schema 的 `chain_state` 缺失（F07）。 |
| H2 停止矩阵 | **PASS/OPEN** | 主要 stop_class 与 security 不降级已实现；A 的合法性仍依赖调用方 `targetStarted/trustedClose`，未绑定 target 身份；真实注入 NOT_RUN。 |
| H3 summary/close | **FAILED（静态）** | F01/F02/F03 均可复现。 |
| H4 门禁 | **FAILED（静态）** | F04 可绕过事务/index；F05 独立检查不足；真实执行 NOT_RUN。 |
| H5 failure_code | **PARTIAL** | 有效/未知/class/exec/hash 分支存在；close exec 未绑定（F08）；schema 样本不一致（F07）。 |
| T01 reclaim | **FAILED（静态）** | F06 错误 schema 可进入 RECLAIM_INSTALL。 |
| 清单 | **PASS** | 25 行哈希逐项一致，26 文件与提交一致。 |

## 两份检查器

- `p0v10-check.cjs`：只读，不写文件；60/60 通过。但它用 contract 自身产生/验证对象，且未覆盖上述反例；不能单独作为独立验收。
- `p0v10-independent-check.cjs`：不 import contract，链/summary/sidecar/清单部分为独立重算；但 gate 变体（190-192）是自述式检查，未重算 bundle；未覆盖 H2/T04/I02。它证明的范围小于“H1—H5 全部独立核验”。

## Q01—Q14

- Q01/Q04：H1 框架静态通过；schema 字段和真实 seal 未闭合。
- Q02：22 条静态 map，子集通过；全 58 exec 分支 NOT_RUN。
- Q03：H2/H3 设计存在；H3 实测缺陷 F01—F03。
- Q05：stop_class 向量通过；真实 halt 回放 NOT_RUN。
- Q06/Q07：protect 分层静态向量通过；copy/rename/ACL 执行 NOT_RUN。
- Q08/Q10：只有 SPEC/schema；事务执行 NOT_RUN。
- Q09：T01 静态反例失败（F06）；真实 FS 锁 UNVERIFIED。
- Q11：lib 路径函数静态通过；Windows/ACL NOT_RUN。
- Q12：只有测试设计；kill/crash NOT_RUN。
- Q13：结果码静态通过；真实运行 NOT_RUN。
- Q14：成员 delta 静态通过；真实发布 NOT_RUN。

## 通过条件

重新提交前至少需要：

1. 定义 ok 段的 sidecar 策略：要么明确 ok 不生成 sidecar 并允许缺失，要么给 sidecar 增加合法 ok 形态；同时让 schema、SPEC、validator 一致。
2. `validateSummaryLifecycle` 绑定 `summary.exec_id == close.exec_id`，并只允许 dispatcher/audit-control 生成 summary。
3. `validateGateBundle` 在缺少 ctx/required 时 fail-closed；要求非空 required、txid/rid/old/new index/policy/tool 摘要全部匹配。
4. `reclaimDecision` 校验 schema 值、token 格式、pid 类型；错误 schema 必须 BLOCKED_MANUAL。
5. H5 绑定 `close.exec_id`，并让 sidecar schema 与样本一致。
6. 补齐上述反例向量；独立检查器对 H4 重算 bundle digest/evidence，而不是按 variant 推错误。
7. 运行 JSON Schema meta-validator（或明确不交付 schema 作为验收物）。

## 边界

未运行生成器、发布器、恢复器、lab、C00—C20、Phase 0、ACL、浏览器/L1；未修改 V9/V8/V7、历史证据或产品源码；未创建 `D:\P47RUN`/`D:\P47TOOLS`。本轮只新增本报告。
