# V10 静态测试设计

日期：2026-11-12。状态：**静态设计与纯内存验证；未运行发布/恢复/lab/Phase 0。**

## 1. 验证层级

| 层级 | 内容 | 本轮 |
|---|---|---|
| S0 | `node --check` 语法解析 | 已执行 |
| S1 | JSON 输入/schema/向量解析 | 已执行（只读） |
| S2 | `p0v10-check.cjs` 纯内存向量 | 已执行 |
| S3 | 独立哈希/成员清单 | 已执行（只读） |
| D1 | 生成器写正式文件 | NOT_RUN；需单独授权 |
| D2 | 发布器/恢复器/事务状态 | NOT_RUN；需单独授权 |
| D3 | lab 故障注入/崩溃/并发 | NOT_RUN；需单独授权 |
| D4 | C00—C20/Phase 0/ACL/浏览器/L1 | NOT_RUN；未授权 |

## 2. H1—H5 对应测试

| 条件 | 代码 | 向量 | 通过条件 |
|---|---|---|---|
| H1 合法 skip/open 不误判 | `p0v10-contract.cjs` `classifyChain` / `sealDecision` | H1-01—H1-18 | close/skip/open/open+skip 各状态正确；nested open/重复终态/未知 exec/非法 skip/同数量错身份 open_segments/已有失败却 allSuccess 均拒绝或降级；坏 hash/seq/配对才 corrupt；无 genesis 不生成 seal |
| H2 停止矩阵 | `stopDecision` | H2-01—H2-09 | gate CONTINUE；target/baseline fatal BUSINESS_HALT；infra/before/after/finalizer/bind/seal fatal HALT_ALL；security 不降级；pre-run 无伪链；orphan 无 A；chain corrupt 无 seal |
| H3 summary 顺序 | `validateSummaryLifecycle` / `validateSidecarShape` | H3-01—H3-09 | ok/failed 段都需一致 sidecar；parts→summary→close；summary/sidecar/close 同 exec；业务自证 summary 拒绝；缺 summary/错摘要/close 后篡改拒绝 |
| H4 门禁复合身份 | `validateGateBundle` / `gateKey` | H4-01—H4-13 | checker staging/pending/accepting + verifier release/accepting 全通过；缺/重/额外/错 subject/tx/evidence/digest/old index/无 ctx/空 required 拒绝；重试保留失败 |
| H5 failure_code 旁证 | `validateFailureSidecar` / `projectFailureCode` | H5-01—H5-09 | 成功/失败 sidecar 均校验；未知码/错 class/错 exec/close exec 错/hash 不符/producer 非控制面/缺 sidecar 拒绝 |

## 3. 其他约束

| 项 | 代码 | 向量 |
|---|---|---|
| T01 死亡 reclaim | `reclaimDecision` | T01-01—T01-04 |
| T04 保护分层 | `evaluateProtect` + `inputs/protect-policy.json` | T04-01—T04-07 |
| I01 门禁包 | `validateGateBundle` | H4 系列 |
| I02 file↔dir | `classifyMemberDelta` | I02-01—I02-03 |
| I03 链格式 | `linkChain` / `classifyChain` | H1 系列；`SPEC-V10.md` §1 |
| 片段 seal | `validateFragmentSeal` | I03-01—I03-02 |
| canonical/path | `canon` / `normalizeRel` | CANON-01—06、PATH-01—02 |

## 4. Q01—Q14 静态映射

| Q | 静态产物 | 本轮结果 | 未决/动态 |
|---|---|---|---|
| Q01 链/停止 | `classifyChain`, `stopDecision` | 静态 PASS | 真实失败注入 NOT_RUN |
| Q02 错误码 | `failure-code-map.json`, `validateFailureSidecar` | 静态子集 PASS | 全 58 exec 全分支映射需正式生成 |
| Q03 输入/finalizer | `SPEC-V10.md` §3、H2/H3 向量 | 静态契约 PASS | 真实 finalizer 执行 NOT_RUN |
| Q04 链/seal | `sealDecision`, `validateTerminalSeal` | 静态 PASS | 真实 seal 生成 NOT_RUN |
| Q05 halt | `stopDecision` | 静态 PASS | 真实 halt 回放 NOT_RUN |
| Q06 copy/rename/protect | `evaluateProtect`、SPEC §7 | 部分静态 PASS | copy/rename 执行 NOT_RUN |
| Q07 op schema | `SPEC-V10.md` §7、schema | 静态契约 PASS | 实际写入 NOT_RUN |
| Q08 pending/undo | `schema/journal.schema.json`、SPEC §8 | 设计静态 | 事务执行 NOT_RUN |
| Q09 锁 | `reclaimDecision` | 静态 PASS | 真实文件系统/并发 NOT_RUN |
| Q10 状态不变量 | `journal.schema.json`、SPEC §8 | 设计静态 | 真实 journal NOT_RUN |
| Q11 路径 | `p0v10-lib.cjs` `normalizeRel/isPathPrefix` | 静态 PASS | Windows 路径/ACL NOT_RUN |
| Q12 故障快照 | 本文件、H2 向量 | 设计静态 | 真实 kill/crash NOT_RUN |
| Q13 结果口径 | `p0v10-lib.cjs` `EXPERIMENT_RESULT/COMMAND_STATUS` | 静态 PASS | 真实运行 NOT_RUN |
| Q14 成员/基线 | `classifyMemberDelta`、member inputs | 静态 PASS | 真实发布 NOT_RUN |

## 5. 结果口径

- 静态检查输出 `status_namespace=experiment`。
- 静态向量全部 PASS 只表示纯函数/数据契约通过，不表示发布/恢复/lab 通过。
- 未执行项在实现报告中列 `NOT_RUN`；无法测量项列 `UNVERIFIED`；实际失败列 `FAILED`。
