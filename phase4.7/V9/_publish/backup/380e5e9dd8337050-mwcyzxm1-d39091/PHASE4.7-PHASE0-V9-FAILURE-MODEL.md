# OB-Recover Phase 4.7：V9 失败模型

日期：2026-11-12。本文件只描述契约状态机；生成器 `p0v9-flow.cjs` 与检查器内的独立状态机都必须复现这里的结果。

## 1. 终态

| 终态 | 产生方式 | 可满足的要求 |
|---|---|---|
| ok | `segment_close(result=ok)` | ok / terminal / recorded / settled |
| failed | `segment_close(result=failed)`，带失败类 | terminal / recorded / settled |
| aborted | `segment_close(result=aborted)`（超时/被杀但 dispatcher 仍能 close） | terminal / recorded / settled |
| skipped | `segment_skip` | recorded / settled |
| orphaned | 只有 `segment_open`，dispatcher 硬死机 | settled only |
| not-started | 无链（genesis 未写）或 pre-run 失败后的计划项 | 无 |

判定必须使用封闭集合：ok={ok}；terminal={ok,failed,aborted}；recorded={ok,failed,aborted,skipped}；settled={ok,failed,aborted,skipped,orphaned}。`recorded` 不接受 orphaned/not-started；`settled` 不接受 not-started。任何执行不得同时落入两个终态。

## 2. 停止级别

| 级别 | 触发 | 仍允许 |
|---|---|---|
| none | 正常 | 全部按计划 |
| continue | gate 失败 | 依赖者三连跳过；C17/M1/C19/REPORT/SEAL 继续 |
| halt-business | 非安全 fatal 在 target/baseline | finalizer、bind、SEAL；失败目标待跑的 A；其余 run-stopped |
| halt-all | security；fatal 在 infra/finalizer/seal/pre-run/genesis/bind | 失败目标待跑的 A；SEAL |
| chain-broken | 链完整性失败 | 无（SEAL 拒绝写封存） |

优先级 security > fatal > gate；停止级别取 `max(当前, 新级别)`，只升不降。复合故障（首错 + after 错、双 gate、security + finalizer）必须保持该单调性。

## 3. 跳过原因

| reason | 触发 | failed_dependency |
|---|---|---|
| dependency-failed | 某条 ok 要求未满足 | 第一个未满足的执行 |
| target-skipped | 包装目标被跳过 | 该目标 |
| c18-unbound | BIND 记录 disabled-unbound | null |
| run-stopped | 停止后剩余计划项 | 第一个失败执行；dispatcher 硬死机时允许指向 open 执行 |

skip 是终态但永远不是成功；skip 不得带段目录、summary 或任何证据。建链前（genesis 未写、pre-run 失败）不产生任何 skip/open/close 记录，后续执行标记 not-started；非链执行（C00/C05-PRE/PROBE/SEAL）不产生链记录。

## 4. 强制 after

1. 目标实际启动并失败（gate/fatal/security/aborted）⇒ `C07-A(T)` 恰好一次。
2. 目标被跳过 ⇒ B/T/A 三连全部 skip，不跑 A。
3. A 自身失败 ⇒ 升级停止级别（按 A 的 failure_modes），不重复跑第二次；halt-all 不得被降为 halt-business。
4. 硬死机导致目标只有 open ⇒ 不跑 A（没有可信 close），SEAL 记录 orphan。

## 5. 封存函数

输入：`genesis_written`、`C20-SEAL` 自身结果、链完整性（只由 `SEC-CHAIN-MISMATCH` 触发）、`staged_state`、是否中止、open tail。

```
if (!genesis_written)            mode = no-chain
else if (seal_failed)            mode = seal-failed
else if (chain_integrity_fail)   mode = chain-broken
else if (staged_state != complete) mode = degraded-prefix
else if (halted)                 mode = aborted
else                             mode = sealed-full
```

`sealed-full` 允许 failed/skipped/gate_failed（gate 失败后的完整证据封存）。`exit_status=complete` 仅当：mode=sealed-full、无 failed、无 skipped、无 gate_failed、C18 bound、index/report 均 present。否则 `exit-not-met`。no-chain 的 records 必须为 0。

## 6. 关键场景（生成器与检查器一致）

| 场景 | 停止 | staged | 封存 | 记录数 | 说明 |
|---|---|---|---:|---:|---|
| 绑定全 ok | none | complete | sealed-full | 109 | 58 执行全 ok |
| 未绑定全 ok | none | complete | sealed-full（exit-not-met） | 103 | C18 三连不在计划内 |
| C10-P gate | continue | complete | sealed-full（exit-not-met） | 85 | 跳过 24：8 目标 × (B/T/A)；C10-P 自己的 A 执行 |
| C12 security | halt-all | complete | aborted | 80 | 只再跑 A-C12 与 SEAL；其余 run-stopped |
| C04 fatal | halt-all | incomplete | degraded-prefix | — | 未到 staged 完成 |
| C10-N orphan | halt-all | incomplete | aborted | 72 | 链尾开放；SEAL 列 open_segments |
| C10-P security + A fatal（复合） | halt-all | complete | aborted | — | 停止级别保持 halt-all；A 失败不降低等级 |
| C11+C12 双 gate | continue | complete | sealed-full | — | 两目标各自 A 执行，依赖者跳过 |

## 7. 与第十一轮问题的对应

- F01：`sealed-full` 语义与审计规范统一；`complete` 严格。
- F02：no-chain/非链/terminal 的 records=0；C01 失败不产生 close。
- F03/F04：精确 trigger 映射；状态封闭集合；stop 单调；34 个复合场景。
- F08：aborted 也要求 after；片段结束 pending after 报错。
- F01/F09：staged 完整的安全失败得到 aborted；open tail 由 SEAL 以 `open_segments` 描述，不补造 close/summary。
- 矩阵 340 行（含 34 个复合场景）；检查器独立重算并逐行比较。
