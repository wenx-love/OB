## 五、R01：双 Promise 与统一终态结算

### 5.1 四个阶段

| 阶段 | 事件 | 逻辑状态 | Promise | 证据 |
|---|---|---|---|---|
| A Worker 成功返回 | 回复到达 | 尝试 `replied-success`；逻辑仍 `executing` | 不结算 | attemptId/回显匹配 |
| B 主线程收到并接受 | 客户端校验信封/缓存 | `awaiting-commit` | `resultReady` 结算 | requestId、sourceSha256、cacheSeq |
| C 面板接受并提交 | commitResult/rejectCommit | `committed`/`commit-rejected` | `completion` 结算 | D10 九字段、commit token |
| D 最终结算 | 终态记录 | 终态 | `completion` 已结算 | 终态审计 |

**核心：** Worker 成功 ≠ 主线程收到 ≠ 面板提交 ≠ 最终结算。

### 5.2 `finalizeRequest` 统一规则

任一终态（成功提交、提交拒绝、提交超时、取消、纪元、dispose、熔断、构造失败、第二次失败、未受理拒绝、缓存解析失败）都必须调用：

1. 若请求已终态：no-op，记录重复调用。
2. 若 `resultReady` 尚未结算：
   - 成功且可提交：以 `outcome.result` 结算；
   - 其他一切：以 `{kind:'error', code}` 结算（`cancelled`、`breaker-open`、`worker-unavailable`、`watchdog-…`、`commit-timeout`、`rejected-…`）。
3. 若 `resultReady` 已结算：**不改写**，只继续。
4. 置逻辑请求终态；`completion` 以对应结果结算一次。
5. 清 ack 计时器、等待者数组、请求索引、deferred/retry 引用。
6. 只有最新 `requestSeq` 才更新脚本 `currentState`；旧请求只更新自己的终态与历史计数。
7. 批量取消期间不 `pump`；普通终态可 `pump` 下一个。

### 5.3 逐路径结算矩阵

| # | 进入状态 | 触发事件 | resultReady | completion | 资源释放 | 再调度 |
|---|---|---|---|---|---|---|
| 1 | `deferred` | cancelAll/纪元 | 未结算则 resolve error `cancelled` | `cancelled` | 清等待者/索引/ref | 取消期间否；结束后可 |
| 2 | `deferred` | 熔断打开 | 未结算则 resolve error `breaker-open` | `failed(breaker-open)` | 清等待者/索引/ref | 否，待恢复 |
| 3 | `retry-pending` | cancelAll/纪元 | 未结算则 error `cancelled` | `cancelled` | 清重试计划/等待者 | 取消期间否 |
| 4 | `retry-pending` | 熔断打开 | 未结算则 error `breaker-open` | `failed(breaker-open)` | 清重试计划 | 否，待恢复 |
| 5 | `executing` | 首次看门狗 | 保持 pending | 保持 pending | 清旧看门狗；换 attempt | 是（重试一次） |
| 6 | `executing` | 第二次看门狗 | error `watchdog-timeout-retry-exhausted` | `failed(...)` | 清看门狗/等待者 | 是（同一逻辑请求结束后） |
| 7 | `executing` | 首次崩溃/协议错/发送失败 | 保持 pending | 保持 pending | 清旧处理器/看门狗 | 是（重试一次） |
| 8 | `executing` | 第二次崩溃/协议错/发送失败 | error `worker-crashed-retry-exhausted`/`protocol-error-retry-exhausted` | `failed(...)` | 清处理器/看门狗 | 是 |
| 9 | `executing` | cancelAll/纪元 | error `cancelled` | `cancelled` | terminate Worker、清处理器/看门狗/等待者 | 取消期间否 |
| 10 | `deferred`（构造前） | 构造失败 | error `worker-unavailable` | `failed(worker-unavailable)` | 无 attempt；清 ref | 是（若未熔断） |
| 11 | 未受理 | 容量/超预算/关闭 | error `deferred-full`/`source-too-large`/`closed` | `rejected(...)` | 无 | 否 |
| 12 | 缓存命中（成功） | 客户端交付 | resolve 缓存结果 | 保持 pending（等提交） | 新请求 id/seq/ack；无 attempt | 是 |
| 13 | 缓存命中（解析失败） | 客户端交付 | resolve `analysis-failed` | `analysis-failed` | 无 attempt；无 ack | 是 |
| 14 | `awaiting-commit` | commitResult 成功 | 已交付，不改写 | `committed` | 清 ack 计时器/等待者 | 是 |
| 15 | `awaiting-commit` | rejectCommit/校验失败 | 已交付，不改写 | `commit-rejected` | 清 ack 计时器/等待者 | 是 |
| 16 | `awaiting-commit` | 提交超时（10s） | 已交付，不改写 | `failed(commit-timeout)` | 清 ack 计时器/等待者；迟到提交忽略 | 是 |
| 17 | `awaiting-commit` | cancelAll/纪元/dispose | 已交付，不改写 | `cancelled` | 清 ack 计时器/等待者 | 取消期间否；dispose 永久否 |
| 18 | 任意非终态 | dispose | 未结算则 error `cancelled`；已结算不改写 | `cancelled` | 先置 `disposed=true`，再全清；永不再调度 | 否 |
| 19 | 任意终态 | 重复 cancel/commit | 不改写 | 不改写（no-op） | 已释放 | 不变 |
| 20 | 任意终态 | 迟到 commit/迟到事件 | 不改写 | 不改写 | 记日志 | 不变 |

### 5.4 关键规则

- `resultReady` 最多结算一次；`completion` 最多结算一次；终态时两者都必须已结算（`resultReady` 为结果或错误）。
- 提交超时从 `resultReady` 交付时开始计时；提交与超时同轮只有一个胜者。
- 缓存命中必须创建**新的逻辑请求 id/requestSeq/ack 计时器**，不得复用旧请求。
- `dispose` 先置 `disposed=true`，再执行取消；已终态不重写。
- 旧请求 `completion` 结算不得强制脚本 `currentState` 变终态；只有最新 `requestSeq` 可以更新脚本状态（§9.3）。
- 不允许“最多一次”代替“至少一次”；所有终态必须显式走 `finalizeRequest`。

### 5.5 不变量

1. 每个逻辑请求 `resultReady` 与 `completion` 各结算一次。
2. 终态时无 pending Promise。
3. 取消/熔断/dispose/拒绝/早期失败都不得留下未结算的 `resultReady`。
4. 旧事件/迟到提交不改写终态。
5. 缓存命中不创建 attempt、不启 D4 看门狗。
