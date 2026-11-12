## 六、R03：熔断计数、健康回复与恢复探针

### 6.1 计数规则

| 事件 | 计数 | 说明 |
|---|---|---|
| 构造 Worker 失败 | ++ | 无 attempt |
| `onerror` | ++ | Worker 级 |
| `messageerror` | ++ | Worker 级 |
| `postMessage` 抛错 | ++ | Worker 级 |
| `protocol-error`（信封无效） | ++ | Worker 级 |
| `ok:false` 且 `errorKind='internal'` | ++ | Worker 内部异常，按 Worker 级失败；不缓存 |
| 看门狗超时 | **不计入** | 单独 `watchdogTrips` |
| `ok:false` 且 `errorKind='parse'` | **不计入** | 经信封校验的确定性解析失败，证明 Worker 健康执行 |
| 提交校验失败 | **不计入** | 面板层 |
| 用户取消 | **不计入** | — |

**健康回复定义：** 回复与 `attemptId`/`requestId` 匹配，信封字段（scriptId、sourceLength、sourceSha256）一致，且满足以下之一：

- `ok:true`；或
- `ok:false` 且 `errorKind='parse'`（确定性解析失败）。

只有健康回复才清零 `consecutiveWorkerFailures`。构造成功不清零；`ok:false` 内部异常不清零且计失败。

### 6.2 累计、重试与熔断

- 每次尝试失败按上表计数；一次重试失败再计一次。
- 计数达到 3（阈值不变）立即打开熔断，即使当前请求还有重试额度；当前请求按 `failed(breaker-open)` 结算（`finalizeRequest` 同时结束两个 Promise）。
- 熔断打开时：
  - `executing`：尝试结算；逻辑 `failed(breaker-open)`。
  - `retry-pending`：清重试计划；`failed(breaker-open)`。
  - `deferred`：清引用；`failed(breaker-open)`。
  - `awaiting-commit`：保留；提交不依赖 Worker，可继续 commit/reject/超时。
  - 等待者随逻辑请求结算。
- 任何进入 `failed` 的路径都必须走 `finalizeRequest`，不得只结束 `completion`。

### 6.3 恢复探针

- 触发：`refresh`、新纪元、`cancelAll`、显式重置。
- 动作：`breakerOpen=false`，`recovering=true`，保留 `consecutiveWorkerFailures` 在阈值。
- 下一次 Worker 尝试是探针：
  - 健康回复 → 计数清零、`recovering=false`，恢复正常调度。
  - 任一 Worker 级失败 → 计数保持/增加，立即重新熔断。
- **探针看门狗：** 按 D4 规则重试 1 次，但超时**不增加** Worker 失败计数。两次都超时 → `recovering=false`、`breakerOpen=true`，不自动继续调度；必须再次 refresh/新纪元才能重试探针。记录 `breaker-probe-timeout`。
- 探针失败/超时不得静默；面板显示。
- 恢复标志不得改变请求归属；旧请求仍按自己的 requestSeq 结算。

### 6.4 不变量

1. 连续 3 次 Worker 级失败必然熔断。
2. 构造成功不清零。
3. 看门狗不增加熔断计数。
4. 熔断后无需要 Worker 的 pending 请求。
5. 恢复必须经过健康回复或明确的探针超时终止。
6. 所有早期 `failed` 都经 `finalizeRequest` 结束双 Promise。
