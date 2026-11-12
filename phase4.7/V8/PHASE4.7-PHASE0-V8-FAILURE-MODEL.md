# OB-Recover Phase 4.7：V8 失败模型

日期：2026-11-11。本文件只描述契约状态机；生成器 `p0v8-flow.cjs` 与检查器内的独立状态机都必须复现这里的结果。

## 1. 终态

| 终态 | 产生方式 | 可满足的要求 |
|---|---|---|
| ok | `segment_close(result=ok)` | ok / terminal / recorded / settled |
| failed | `segment_close(result=failed)`，带失败类 | terminal / recorded / settled |
| aborted | `segment_close(result=aborted)`（超时/被杀但 dispatcher 仍能 close） | terminal / recorded / settled |
| skipped | `segment_skip` | recorded / settled |
| orphaned | 只有 `segment_open`，dispatcher 硬死机 | settled only |
| not-started | 无链（genesis 未写） | 无 |

`ok` 要求是严格的；`terminal` 不含 skipped；`recorded` 才允许报告路径消费 skip。任何执行不得同时落入两个终态。

## 2. 停止级别

| 级别 | 触发 | 仍允许 |
|---|---|---|
| none | 正常 | 全部按计划 |
| continue | gate 失败 | 依赖者三连跳过；C17/M1/C19/REPORT/SEAL 继续 |
| halt-business | 非安全 fatal 在 target/baseline | finalizer、bind、SEAL；失败目标待跑的 A；其余 run-stopped |
| halt-all | security；fatal 在 infra/finalizer/seal/pre-run/genesis/bind | 失败目标待跑的 A；SEAL |
| chain-broken | 链完整性失败 | 无（SEAL 拒绝写封存） |

优先级 security > fatal > gate；停止级别只升不降。

## 3. 跳过原因

| reason | 触发 | failed_dependency |
|---|---|---|
| dependency-failed | 某条 ok 要求未满足 | 第一个未满足的执行 |
| target-skipped | 包装目标被跳过 | 该目标 |
| c18-unbound | BIND 记录 disabled-unbound | null |
| run-stopped | 停止后剩余计划项 | 第一个失败执行（可为 null 仅当无失败） |

skip 是终态但永远不是成功；skip 不得带段目录、summary 或任何证据。

## 4. 强制 after

1. 目标实际启动并失败（gate/fatal/security/aborted）⇒ `C07-A(T)` 恰好一次。
2. 目标被跳过 ⇒ B/T/A 三连全部 skip，不跑 A。
3. A 自身失败 ⇒ 升级停止级别（按 A 的 failure_modes），不重复跑第二次。
4. 硬死机导致目标只有 open ⇒ 不跑 A（没有可信 close），SEAL 记录 orphan。

## 5. 封存函数

输入：`genesis_written`、`C20-SEAL` 自身结果、链完整性、`staged_state`、是否中止、open tail。

```
if (!genesis_written)            mode = no-chain
else if (seal_failed)            mode = seal-failed
else if (chain_integrity_fail)   mode = chain-broken
else if (staged_state != complete) mode = degraded-prefix
else if (halted)                 mode = aborted
else                             mode = sealed-full
```

`exit_status=complete` 仅当：mode=sealed-full、无 failed、无 skipped、C18 bound、index/report 均 present。否则 `exit-not-met`。

## 6. 关键场景（生成器与检查器一致）

| 场景 | 停止 | staged | 封存 | 记录数 | 说明 |
|---|---|---|---:|---:|---|
| 绑定全 ok | none | complete | sealed-full | 109 | 58 执行全 ok |
| 未绑定全 ok | none | complete | sealed-full（exit-not-met） | 103 | C18 三连不在计划内 |
| C10-P gate | continue | complete | sealed-full（exit-not-met） | 85 | 跳过 24：8 目标 × (B/T/A)；C10-P 自己的 A 执行 |
| C12 security | halt-all | complete | aborted | 80 | 只再跑 A-C12 与 SEAL；其余 run-stopped |
| C04 fatal | halt-all | incomplete | degraded-prefix | — | 未到 staged 完成 |
| C10-N orphan | halt-all | incomplete | aborted | 72 | 链尾开放；SEAL 列 open_segments |

## 7. 与第十轮问题的对应

- N08：`spec:455` 的“after 依赖目标成功”被替换为 `terminal`；C17/M1/C19/REPORT 改为 `recorded`；检查器断言 C10-P gate 的精确 24 项跳过集合。
- N09：security-stop 不再固定 degraded-prefix；staged 完整的安全失败得到 aborted；open tail 由 SEAL 以 `open_segments` 描述，不补造 close/summary。
- 新增：`flow.missing_after` 与 `flow.after_halt` 两条回放错误，负例各一条。
