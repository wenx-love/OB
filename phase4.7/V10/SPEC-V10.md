# OB-Recover Phase 4.7：V10 唯一执行规格（静态实现）

日期：2026-11-12（Asia/Shanghai）
状态：**静态契约实现，未运行任何写入/发布/恢复/lab/Phase 0 操作。**
位置：`phase4.7/V10/`。

## 0. 优先关系

1. 本文件是 V10 的唯一执行规格。
2. 本文件吸收并落实 `reviews/CODEX-P47-V10-STATIC-IMPLEMENTATION-CONDITIONS-20261112-220527.md` 的 H1—H5。
3. 本文件与 215522 勘误、213859 补充计划或 205542 修订版冲突时，**以本文件为准**；H1—H5 优先于 215522 中的冲突条文。
4. 未被本文件取代的安全约束继续有效；不得以“已实现”名义放宽 H1—H5。
5. V9 维持 REJECTED；本文件不是 V10 验收，不是 Phase 0 授权。

## 1. 链格式与完整性（H1）

### 1.1 格式

保留既有 `p47-chain-record-v9`：

- 首记录 `record=genesis`，`chain_seq=1`，`prev_record_sha256=null`，`prev_file_bytes=0`。
- 后续 `chain_seq=prev+1`。
- 每条记录 = canonical JSON + 单个 LF。
- `prev_record_sha256 = SHA-256(canonical JSON，不含 LF)`。
- `prev_file_bytes` = 此前所有记录字节数（含每个 LF）。
- 记录类型：`genesis | segment_open | segment_close | segment_skip`。
- 合法首次运行无链：`chain_origin=absent`，状态 `no-chain`；不是安全故障。
- 已有链被移除/损坏：安全故障；不得当作合法首次运行。

### 1.2 完整性状态

`classifyChain` 必须逐记录重放：

```text
no-chain             无记录，且 origin=absent
validated-closed     全部通过；open_segments 空；tail=segment_close
validated-skip-tail  全部通过；open_segments 空；tail=segment_skip
validated-open       全部通过；open_segments 非空（tail 可为 open/skip/close）
corrupt              schema/seq/hash/prev_file_bytes/配对/字段非法
```

硬约束：

- **退役“任何非 close 尾就是坏链”旧谓词。** 合法 `skip` 尾、open 尾、open 后 skip 都不是 corrupt。
- corrupt 只由实际记录/字节/哈希/seq/配对/状态重放错误推导。
- `open_segments` 从整条已验证前缀派生，不按物理尾推断。
- corrupt 不生成任何权威 seal；只保留原链和链外 `p47-operator-record-v10`。
- 无可信 genesis 不生成权威 seal；`no-chain` 只生成 launch/operator 证据。

### 1.3 seal 函数

```text
seal_mode(chain, ctx):
  corrupt / no-chain -> NONE
  open_segments 非空 -> aborted (exit=aborted)
  security failure -> aborted (exit=aborted)
  complete 且全部成功、无 skip、staged complete、recheck pass -> sealed-full (exit=complete)
  其他（非安全 fatal/gate/skip/不完整） -> degraded-prefix (exit=exit-not-met)
```

- 只使用 `sealed-full | aborted | degraded-prefix`；不使用 `aborted-prefix`。
- `run_state=completed` 仅 sealed-full；其余 `aborted`。
- `sealed-full` 不能由“尾 close”单独推导；必须完整计划、全部成功、无失败 close、staged/recheck 通过。
- 链中已有 `result=failed|aborted` 的 close 时，即使调用方传入 `allSuccess=true`，也不得生成 sealed-full；按失败类别进入 aborted 或 degraded-prefix。
- fragment 使用独立 `p47-fragment-seal-v10`，`authoritative=false`，不得产生任何终端模式。

## 2. 停止矩阵（H2）

单一 `stopDecision` 同时使用 `failure_class` 与 `exec_class`，只收紧不回退。

| 实际情况 | stop_class | 后继 |
|---|---|---|
| 非安全 gate | `CONTINUE` | 只按依赖传播 skip；独立目标继续；失败目标已启动且 close 可信时唯一 A |
| 非安全 fatal，target/baseline | `BUSINESS_HALT` | 失败目标唯一 A；允许经输入/包装规则验证的 finalizer、bind、seal；禁止普通业务 |
| 非安全 fatal，infra/before/after/finalizer/bind/seal | `HALT_ALL` | 不再启动普通业务/finalizer；仅满足合同的待执行 A 和可用封存 |
| pre-run/genesis 失败且未可信建链 | `PRE_RUN_HALT` | 只保留 launch/no-chain；不伪造 skip/open/close；不启动 finalizer |
| security 且链可信 | `SECURITY_HALT` | 只允许失败目标可信 close 对应的唯一 A 与受限封存；禁止 finalizer/普通业务 |
| 实际链损坏 | `CHAIN_FATAL` | 不再链写/权威 seal；保存原链与外部非成功记录 |
| orphan | `ORPHAN_HALT` | 该目标不跑 A；不补 close；可信前缀如实记录 open_segments |

唯一 A：

- 目标必须实际启动且 close 可信；恰好一个 `C07-A-<target>`。
- 未启动、skip、链损坏、orphan 不得有 A。
- A 失败不生成第二个 A；不因普通 fatal 降低已发生的 security 停止。
- `CONTINUE` 下失败目标 A 保留，依赖目标 skip，独立目标继续。

## 3. summary 与 close 顺序（H3）

固定顺序：

```text
业务进程结束
-> 冻结并验证 parts
-> 本段 audit-control/dispatcher 以 CreateNew 创建并验证 summary
-> append segment_close，绑定 summary_bytes/summary_sha256
-> close 后 summary 只读
```

- summary 必须先于 close 创建并验证；正常 close 不得引用尚未创建/验证的 summary。
- 每段 summary 由受信 dispatcher/audit-control 代表本 exec 生成；`produced_by` 只能是 `dispatcher|audit-control`，业务 exec 不得自证。
- summary 必须含 `control_context`：`{schema:'p47-control-context-v10',kind,subject_id,exec_id,txid}`；`kind`/`subject_id` 必须是受信控制主体，`exec_id` 必须等于本段 exec。
- summary、sidecar、close 三者的 `exec_id` 必须一致；close 的 `result` 必须与 sidecar 一致。
- `C19` 的 index 与其本段 summary 分别登记路径、主体、生命周期。
- 创建失败按真实失败/summary 缺失处理；不预填假摘要。
- 缺 summary、错摘要、close 后篡改均拒绝；不得放宽 summary 必填规则。

## 4. 门禁身份（H4）

### 4.1 复合身份

门禁调用唯一键：

```text
gate_invocation_id = gate_id + "\u0000" + mode + "\u0000" + subject_id
```

或显式 `gate_invocation_id` 字段。仅按 `gate_id` 去重不成立。

必需调用集合从钉扎的 `inputs/gate-requirements.json` 独立派生，不从 bundle 内两份同源自述列表推导。

- checker：`staging`、`pending`、`accepting` 各一次。
- verifier：`release`、`accepting` 各一次。
- 操作命名空间至少含 `op:checker`、`op:verifier`、`op:dispatcher`、`op:publish`、`op:recover`、`op:status`、`op:undo`、`op:accept`。
- 每次调用绑定 txid/rid、正式 old/new index、工具/策略摘要、canonical 输入、实际结果和证据摘要。
- `validateGateBundle` 必须收到可信 `ctx`（txid/rid/old_index_digest/new_index_digest/policy_digest/tool_versions）；缺失或不完整一律拒绝，不能跳过绑定检查。
- 必需调用集合必须非空；空 required 视为配置错误。
- 缺失任一 mode、同调用重复、额外未批准调用、错 subject/mode/事务/证据均失败。
- 重试：保留每次 attempt；`retry_allowed=false` 时任何 FAILED 都拒绝；允许重试时 final PASS 不能抹去既有失败记录。

### 4.2 bundle

`p47-gate-bundle-v10` 必须含 `txid/rid/old_index_digest/new_index_digest/required_gates/invocations/tool_versions/policy_digest/canonicalization/bundle_digest`。

- required 与 present 的 invocation key 集合精确相等；无缺项、无重复、无额外。
- `bundle_digest` 只证明字节绑定；完整性由必需集合、证据和独立 checker 证明。
- 缺项、重复、错事务、证据不符 → `P47-E-GATE-BUNDLE`，命令码 23。

## 5. failure_code 投影（H5）

采用 **显式旁证方案**，不依赖四元组全表唯一性，也不向 `p47-chain-record-v9` 偷加字段。

### 5.1 旁证

每段在 summary 前生成 `p47-failure-code-sidecar-v10`；成功段允许 `result=ok` 且 `failure_class/security_trigger/failure_code` 全为 null：

```json
{"schema":"p47-failure-code-sidecar-v10","exec_id":"C15-E01",
 "exit_code":2,"result":"failed","failure_class":"security",
 "security_trigger":"SEC-TOOL-IDENTITY","failure_code":"FM-C15E01-02",
 "produced_by":"dispatcher","produced_utc":"...","segment_dir":"..."}
```

- 生产主体：该段的 dispatcher/audit-control，不是业务/产品。
- 成功 sidecar：`result=ok`，三个失败字段均为 null；失败 sidecar：`result=failed|aborted`，class/code 非空，security 必须有 trigger。
- 冻结时机：parts 冻结后、summary 创建前；之后只读。
- summary v10 记录 `failure_code_path`、`failure_code_sha256`；`segment_close` 绑定 `summary_sha256`。
- checker 验证 sidecar schema、hash、exec/exit/class/trigger、code 在 map 中且 allowed subject 正确；summary 的 `control_context` 必须是受信控制上下文。
- 无 close 的 launch/operator 记录仍是链外非权威证据。
- 未知/歧义 code 拒绝；必须有有效分支正例。

## 6. 锁与 reclaim

- 主锁获取：唯一候选 + 原子硬链接安装；`wx` 回退对不完整记录保守拒绝。
- 主锁/reclaim 必须满足精确 schema、32-hex token、正整数 pid；错误 schema、错误 token、错误 pid 或缺失字段一律 `BLOCKED_MANUAL`，不进入回收。
- 已有且不能证明为活持有者的 `LOCK.reclaim`：`BLOCKED_MANUAL`，保留现场，零写入。
- 只有 reclaim 不存在时才允许安装自己的 reclaim；不再用 rename 移动已存在的 reclaim。
- 主锁/reclaim 空或不完整、部分初始化：`BLOCKED_MANUAL`。
- 人工恢复需可信操作者、无活持有者/无并发确认、token/pid/路径/前后哈希；身份变化拒绝。

## 7. 保护分层

| layer | 范围 | 允许主体 | 允许操作 | 生命周期 |
|---|---|---|---|---|
| business/original | ORIGINAL、M0、历史基线 | 无（读按规则） | 只读 | 始终 |
| business/product-own-part | 本 exec 的 audit 分片 | 该 product/业务 exec | create/append | 本段运行期 |
| control/genesis | chain-head 首记录 | `C01-E01` | create | bootstrap |
| control/segment | 本 exec segment 目录与 open/close | 该 exec + `op:dispatcher` | create/append | 本段运行期 |
| control/summary | 本段 summary | dispatcher/audit-control 代表本 exec；`C19-E01` 仅本段 | create | parts 冻结后、close 前 |
| control/seal | terminal-seal | `C20-SEAL-E01` | create | report/A 后 |
| staging/tools | tools | `C04-E01` | create | staged complete 前 |

- protect deny 优先；普通 write/delete/rename 不得覆盖 protect。
- 业务/产品不得借 allow 改链、别段或控制文件；只能创建自己的分片。
- C02 ACL 元数据例外仅限明示主体/对象/元数据；内容删除/改名不继承。
- `write_intent` 必须带 `layer/subject_kind/subject_id/protect_rule_id/lifecycle_phase`。

## 8. 事务与成员

- 事务状态：`uninitialized | prepared | switching | pending-acceptance | accepting | verified | rolled-back | rollback-failed`。
- pending 期间 CURRENT 旧、物化新；接受门禁在 verified 前完成；verified 后只诊断。
- 成员集合记录完整 old/new/delta；修改/删除先备份；回滚按完整 old 集合恢复。
- file↔dir 前缀转换：预检拒绝，`PATH_CONFLICT`，零写入。
- 正式成员为文件；目录为派生容器；`_publish`/lab 不进入正式集合。

## 9. 结果与退出码

实验结果码：`PASS=0, FAILED=1, BLOCKED=2, NOT_REACHED=3, NOT_RUN=4, UNVERIFIED=5`。

命令状态码：`OK=0, USAGE=20, STATE_PENDING=21, LOCKED=22, INCONSISTENT=23, ROLLBACK_FAILED=24, BLOCKED_EXTERNAL=25, INTERNAL=26, PATH_CONFLICT=27`。

报告必须标 `status_namespace=experiment|command`；不得混用。

## 10. 未执行边界

本静态实现不运行：生成器、发布器、恢复器、lab、C00—C20、Phase 0、ACL、浏览器/L1。真实 scratch 发布/恢复/崩溃/并发实验需单独授权；未运行列 NOT_RUN，未测量列 UNVERIFIED，实际失败列 FAILED。
