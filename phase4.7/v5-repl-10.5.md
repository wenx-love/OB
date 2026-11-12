### 10.5 deadline 完整分类（11 态 × 错误码 × 渲染）

| currentState | 附加条件 | 目标层 | 运行层候选 |
|---|---|---|---|
| `discovered` | 截止仍未提交 | `target-not-submitted` | `setup-failed` |
| `deferred` | — | `target-not-started` | `queue-wait-timeout` |
| `retry-pending` | — | `target-retry-waiting` | `retry-wait-timeout` |
| `executing` | **当前尝试**错误码 `watchdog-*` | `target-executing-timeout` | `execution-timeout` |
| `executing` | 其他 | `target-executing` | `window-deadline-during-execution` |
| `awaiting-commit` | 提交超时 | `target-commit-timeout` | `commit-timeout` |
| `awaiting-commit` | 其他 | `target-awaiting-commit` | `commit-pending-timeout` |
| `analysis-failed` | — | `target-analysis-failed` | `target-failed` |
| `commit-rejected` | — | `target-commit-rejected` | `target-failed` |
| `committed` | `render-completed` | `target-rendered` | `completed`/`partial`/`other-script-failed` |
| `committed` | `render-partial` | `target-render-partial` | `render-partial` |
| `committed` | `render-failed` | `target-render-failed` | `render-failed` |
| `committed` | `render-timeout` | `target-render-timeout` | `render-timeout` |
| `committed` | `render-unverified` | `target-render-unverified` | `render-unverified` |
| `failed` | 错误码 `worker-unavailable`/`breaker-*`/`*-crashed-*`/`protocol-*` | `target-infrastructure-failed` | `infrastructure-failed` |
| `failed` | 错误码 `watchdog-*`（当前尝试） | `target-execution-timeout` | `execution-timeout` |
| `failed` | 错误码 `commit-timeout` | `target-commit-timeout` | `commit-timeout` |
| `rejected` | — | `target-rejected-at-admission` | `target-rejected` |
| `cancelled` | — | `target-cancelled` | `cancelled` |

**运行层优先级（互斥，从高到低）：**

1. `setup-failed`（目标缺失/不唯一/哈希不符/观察器未安装/未提交）
2. `target-rejected`
3. `cancelled`
4. `infrastructure-failed`
5. `execution-timeout`
6. `retry-wait-timeout`
7. `queue-wait-timeout`
8. `window-deadline-during-execution`
9. `render-failed`
10. `render-partial`
11. `render-timeout`
12. `render-unverified`
13. `commit-timeout`
14. `commit-pending-timeout`
15. `target-failed`
16. `other-script-failed`
17. `partial`
18. `completed`

**关键规则：**

- `watchdog-*` 只看**当前尝试**；首次超时后第二次正常执行，不得沿用旧错误码判 `execution-timeout`。
- `render-failed` 表示“已发布错误/不完整 token 或 token 不一致”；`render-timeout` 表示“截止前没有成功 token”；二者不得重叠。等待中的渲染是 pending，截止时才唯一归 timeout。
- `render-unverified` 不是通过；Phase 4 不得签发渲染通过。
- 目标观察终点是目标 `render-completed`；**整次运行终点**是全部非故障注入脚本到达终态或总截止；不能在目标完成时提前终止全任务验证。
- `completed` 要求所有非故障注入脚本 `committed` 且 `render-completed`（零候选同样满足），且无失败/拒绝/取消；`all-terminal` 不等于通过。
- `partial` 只允许“目标完成、其他脚本仍未终态且未失败”的局部结论；其他脚本失败 → `other-script-failed`，不得用 partial 吞掉。
