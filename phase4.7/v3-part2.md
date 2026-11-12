
---

## 五、状态机与结算责任（N01，R01—R04、R10）

### 5.1 状态定义

**逻辑请求状态（客户端）：**

| 状态 | 含义 | 未结算 Promise | 允许的下一状态 |
|---|---|---|---|
| `deferred` | 已受理，等待执行槽位 | 是 | `executing`、`cancelled`、`failed` |
| `executing` | 某次尝试在飞行 | 是 | `retry-pending`、`analysis-succeeded`、`analysis-failed`、`failed`、`cancelled` |
| `retry-pending` | 首次失败、等待第二次派发 | 是 | `executing`、`failed`、`cancelled` |
| `analysis-succeeded` | Worker 成功，等待面板提交 | 是（面板提交前） | `committed`、`commit-rejected`、`cancelled` |
| `analysis-failed` | Worker 返回解析失败 | 否 | 终态（刷新/新源码可重试） |
| `commit-rejected` | 提交校验失败 | 否 | 终态（刷新/新源码可重试） |
| `committed` | 提交成功 | 否 | 终态（刷新/新源码可重试） |
| `failed` | 基础设施/最终失败 | 否 | 终态（刷新可重试） |
| `rejected` | 未受理 | 否 | 终态（刷新可重试） |
| `cancelled` | 取消/纪元结算 | 否 | 终态（刷新可重试） |

**尝试状态（仅派发后存在）：**

| 状态 | 含义 |
|---|---|
| `dispatched` | 已 `postMessage`，看门狗计时中 |
| `replied-success` | 收到匹配的成功回复 |
| `replied-error` | 收到匹配的业务错误回复 |
| `protocol-error` | 回复到达但传输信封校验失败 |
| `timed-out` | 看门狗触发 |
| `crashed` | `onerror`/`messageerror` |
| `post-failed` | `postMessage` 抛错 |
| `cancelled` | 被取消协议结算 |

**事件处理结果（不是状态）：** `applied`、`ignored-stale-generation`、`ignored-unknown-attempt`、`ignored-after-terminal`。`ignored-stale` 不得写入尝试状态。

### 5.2 事件 × 逻辑状态 × 尝试状态

| 事件 | 逻辑前态 | 尝试前态 | 结算责任 | 尝试后态 | 逻辑后态 | 缓存 | 重试 | 计数/备注 |
|---|---|---|---|---|---|---|---|---|
| 受理成功 | — | 无 | `admit` | 无 | `deferred` | 否 | — | `deferredGauge++` |
| 受理拒绝（容量/超预算/关闭） | — | 无 | `admit` | 无 | `rejected` | 否 | — | `rejectedRequests++` |
| 构造 Worker 失败 | `deferred` 或 `retry-pending` | 无（`attemptId=null`） | `preAttemptFailure` | 无 | `failed(worker-unavailable)` | 否 | 否 | `workerFailures++`；达到 3 次则熔断 |
| 派发成功 | `deferred`/`retry-pending` | 无 | `dispatch` | `dispatched` | `executing` | 否 | — | 看门狗开始 |
| `postMessage` 抛错 | `executing` | `dispatched` | `settleAttempt` | `post-failed` | 首次→`retry-pending`；二次→`failed` | 否 | 首次是 | `workerFailures++`；达 3 次熔断 |
| 成功回复（信封有效） | `executing` | `dispatched` | 客户端先校验，再 `settleAttempt` + `settleLogical` | `replied-success` | `analysis-succeeded` | 是（按请求序号） | 否 | `workerFailures=0`；`cacheHits/Misses` 另计 |
| 成功回复（信封无效） | `executing` | `dispatched` | `settleAttempt` | `protocol-error` | 首次→`retry-pending`；二次→`failed` | 否 | 首次是 | `workerFailures++`；退役 Worker |
| 业务错误回复 | `executing` | `dispatched` | `settleAttempt` + `settleLogical` | `replied-error` | `analysis-failed` | 是（确定性） | 否 | `analysisParseFailures++` |
| 看门狗触发 | `executing` | `dispatched` | `settleAttempt` | `timed-out` | 首次→`retry-pending`；二次→`failed(watchdog-timeout-retry-exhausted)` | 否 | 首次是 | `watchdogTrips++`；不计入 workerFailures |
| `onerror`/`messageerror` | `executing` | `dispatched` | `settleAttempt` | `crashed` | 首次→`retry-pending`；二次→`failed(worker-crashed-retry-exhausted)` | 否 | 首次是 | `workerFailures++`；退役 Worker |
| `cancelAll` / 纪元变化 | 任意非终态 | 任意 | `cancelAll` | `cancelled`（若有尝试） | `cancelled` | 清空 | 否 | `cancelledRequests++`；禁调度 |
| `dispose` | 任意非终态 | 任意 | `dispose` | `cancelled` | `cancelled` | 清空 | 否 | `disposed=true`；永不重开 |
| 熔断打开 | 所有非终态 | 任意 | `openBreaker` | 当前尝试已先结算 | 全部 `failed(breaker-open)` | 否 | 否 | 等待者全部结算；无 pending |
| 提交成功 | `analysis-succeeded` | 无 | 面板 `commit` | — | `committed` | 否 | — | `committedGauge++` |
| 提交校验失败 | `analysis-succeeded` | 无 | 面板 `commit` | — | `commit-rejected` | 否 | — | `commitRejected++` |
| `force` 请求 | 任意 | 任意 | `admit` | 不改变旧尝试 | 新请求 `deferred` | 否 | — | 旧请求继续；新序号优先提交/写缓存 |
| 旧代次事件 | 任意 | 任意 | 事件分发 | 不变 | 不变 | 否 | — | `staleEvents++`，不得成为终态 |
| 成功回复/成功创建 Worker | — | — | — | — | — | — | — | **`workerFailures=0`** |

### 5.3 唯一结算责任

1. **先结算尝试，再结算逻辑请求。** `settleAttempt(attempt, outcome)` 幂等；`settleLogical(request, outcome)` 幂等。重复调用只记日志。
2. **构造失败没有尝试。** 不强行归入 `dispatched`；用 `attemptId=null` 的预尝试失败路径，只结算逻辑请求。
3. **熔断阈值。** 构造失败只结算当前请求；`workerFailures` 达到 3 时，原子结算所有未终态逻辑请求为 `failed(breaker-open)`；不保留 `retry-pending` 或 `deferred`。
4. **取消先禁调度。** `cancelAll` 先置 `cancelling`、推进代次、禁止 `pump`；再结算 `executing` 尝试、`retry-pending` 逻辑请求、`deferred` 逻辑请求、`analysis-succeeded` 待提交请求；最后清空引用。
5. **`dispose` 永久关闭。** 先置 `disposed=true`，再执行取消协议；结束后不得重开调度。
6. **旧事件只能 no-op。** 代次/尝试/请求不匹配时，事件结果为 `ignored-*`，不改变任何状态、不写缓存、不 `pump`。
7. **成功清零。** 成功创建 Worker 或收到有效成功回复后，`workerFailures=0`。
8. **缓存前校验。** 客户端在写缓存前校验 `requestId`、`attemptId`、`scriptId`、`sourceLength`、`sourceSha256`；任一不符按 `protocol-error` 处理，不写缓存。面板随后再校验页面纪元、对象身份、最新请求序号和源码/URL。

### 5.4 批量取消协议

`cancelAll(reason, { epochChanged })`：

1. `cancelling = true`；`schedulerGeneration++`；禁止 `pump`。
2. 若 `epochChanged`：`pageEpoch++`；所有旧纪元请求失效。
3. 结算 `executing`：清看门狗；尝试 `cancelled`；逻辑 `cancelled`；终止 Worker；解除处理器。
4. 逐项结算 `retry-pending`：清重试计划；逻辑 `cancelled`。
5. 逐项结算 `deferred`：清引用；逻辑 `cancelled`。
6. 逐项结算 `analysis-succeeded`（尚未提交）：逻辑 `cancelled`。
7. 清空 `active`、等待者、定时器、重试队列。
8. 清空缓存（纪元变化必须；面板关闭同样）。
9. `cancelling = false`；允许后续新请求重新 `pump`。`disposed` 时保持关闭。

**禁止：** 取消期间 `pump`；只清数组不 `resolve`；把 `retry-pending` 留在后台；取消后旧回调再次 `pump`。

### 5.5 熔断

- **计数单位：** 构造失败、`onerror`、`messageerror`、`postMessage` 抛错、`protocol-error`；连续 3 次触发。
- **不计入：** 看门狗超时（单独 `watchdogTrips`）、业务解析失败、提交校验失败、用户取消。
- **触发第三次失败时：** 当前逻辑请求按对应规则结算（构造失败→`failed(worker-unavailable)`；尝试失败→重试或 `failed`）；随后原子结算所有剩余非终态请求为 `failed(breaker-open)`。
- **恢复：** `refresh`、新纪元、`cancelAll` 可重置 `workerFailures` 与熔断标志；下一次 `pump` 重新创建 Worker；若再失败重新熔断。刷新路径必须可达，不能只依赖 `cancelAll`。
- **可见性：** 面板显示熔断状态、连续失败次数、最后错误码；不无限自动重试。

### 5.6 重试矩阵

| 失败 | 首次处理 | 第二次处理 | 最终错误码 |
|---|---|---|---|
| 看门狗 | `retry-pending`，新 Worker | 失败 | `watchdog-timeout-retry-exhausted` |
| 崩溃/`messageerror`/发送失败/协议错误 | `retry-pending`，新 Worker | 失败 | `worker-crashed-retry-exhausted` 或 `protocol-error-retry-exhausted` |
| 构造失败 | 不重试 | — | `worker-unavailable` |
| 业务解析失败 | 不重试 | — | `analysis-failed` |
| 提交校验失败 | 不重试 | — | `commit-rejected` |
| 取消/纪元 | 不重试 | — | `cancelled` |
| 容量/超预算 | 不重试 | — | `deferred-full` / `source-too-large` |

**首次失败必须可见：** 记录 `attempt-failed`（`attemptId`、错误码、耗时）；`attemptFailures` 与 `retrySucceeded` 是历史累计；不得用第二次成功抹去首败。

---

## 六、当前状态与历史累计（N02，R13）

### 6.1 每个脚本一个 `currentState`

当前状态枚举（穷尽、互斥）：

| currentState | 含义 |
|---|---|
| `discovered` | 已收到脚本，尚未提交分析 |
| `deferred` | 已受理，等待执行 |
| `executing` | 某次尝试在飞行 |
| `retry-pending` | 首次失败，等待第二次 |
| `analysis-succeeded` | Worker 成功，等待提交 |
| `analysis-failed` | 解析失败 |
| `commit-rejected` | 提交校验失败 |
| `committed` | 提交成功 |
| `failed` | 基础设施/最终失败 |
| `rejected` | 未受理 |
| `cancelled` | 取消/纪元结算 |

**守恒式：** 对当前发现脚本集合，
`count(discovered) + count(deferred) + count(executing) + count(retry-pending) + count(analysis-succeeded) + count(analysis-failed) + count(commit-rejected) + count(committed) + count(failed) + count(rejected) + count(cancelled) = 当前发现脚本总数`。

任何时刻每个脚本只有一个 `currentState`；状态转换是原子的；不允许一个脚本同时计入 `cancelled` 和 `committed`。

### 6.2 历史累计 counters（不参与守恒）

| counter | 含义 | 单调性 |
|---|---|---|
| `attemptFailures` | 尝试级失败次数 | 只增 |
| `workerFailures` | 连续 Worker 级失败计数 | 可被成功清零（这不是历史累计，单独放） |
| `watchdogTrips` | 看门狗触发次数 | 只增 |
| `retries` | 第二次尝试次数 | 只增 |
| `retrySucceeded` | 第二次成功次数 | 只增 |
| `requestsCancelled` | 被取消的逻辑请求数 | 只增 |
| `requestsRejected` | 未受理的逻辑请求数 | 只增 |
| `commitsRejected` | 提交校验失败次数 | 只增 |
| `analysisParseFailures` | 解析失败次数 | 只增 |
| `staleEvents` | 旧代次事件数 | 只增 |
| `cacheHits` / `cacheMisses` / `cacheEvictions` | 缓存统计 | 只增 |

**禁止：** 把 `requestsCancelled`、`requestsRejected` 加进当前状态守恒式；把“曾取消后重试成功”的脚本同时算作 `cancelled` 和 `committed`。

### 6.3 终态映射

| 逻辑结果 | currentState | 说明 |
|---|---|---|
| Worker 成功、提交成功 | `committed` | 唯一 `analyzed=true` |
| Worker 成功、提交失败 | `commit-rejected` | 不计 `analyzed` |
| Worker 解析失败 | `analysis-failed` | 不计 `analyzed` |
| 基础设施最终失败 | `failed` | 不计 `analyzed` |
| 未受理 | `rejected` | 不计 `analyzed` |
| 取消/纪元 | `cancelled` | 不计 `analyzed` |

`analysis-succeeded` 是**等待提交**的当前状态，不是终态；它必须在同一刷新/纪元内转为 `committed` 或 `commit-rejected`，否则停留在 `analysis-succeeded` 并计入当前状态。

### 6.4 UI 口径

- 面板“已分析” = `committed` 计数。
- “延后” = `deferred`；“执行中” = `executing` + `retry-pending`；失败 = `analysis-failed` + `commit-rejected` + `failed`；“拒绝” = `rejected`；“取消” = `cancelled`。
- 历史累计另设区域，不与当前状态混排。

---

## 七、源码精确身份（N04，R05）

### 7.1 两个不同的口径

| 用途 | 口径 |
|---|---|
| D3/D4 的字节预算与超时 | **UTF-8 编码后的字节数**（保持不变） |
| 缓存/active 的源码身份 | **无损的 JavaScript 字符串身份**（新增，不得用 UTF-8 哈希单独承担） |

原因：标准 UTF-8 编码会把孤立 UTF-16 代理项替换为 U+FFFD；两个不同的孤立代理项可能编码成相同字节，这是编码性质，不是 SHA-256 碰撞。

### 7.2 无损身份

- 新增一个**不修改** `src/core/hash-utils.ts` 的身份函数：把源码按 UTF-16 码元序列编码为字节（每码元 2 字节，小端），再算 SHA-256，记 `sha256Utf16Le`。
- 缓存键：`pageEpoch | scriptId | scriptUrl | sha256Utf16Le | analyzerVersion | optionsHash`。
- 缓存命中时再做一次**原始字符串全等**比较（`entry.source === source`）；哈希只用于索引，不单独作为相等证明。
- `sha256Utf8` 仍可用于展示、日志和 D3/D4 字节统计，但不得作为唯一身份。

### 7.3 active 去重与异步哈希

1. **同步占位：** `analyze()` 在返回 Promise 前同步安装占位；占位键用 `scriptId | scriptUrl | utf16Length`，值包含源码引用与占位序号。
2. **精确合并：** 仅当占位值的 `source === 新源码` 时才合并等待者；同键但源码不全等则创建新占位。
3. **异步定型：** `sha256Utf16Le` 完成后，把占位重键为完整键；若已有同完整键且源码全等的请求，合并等待者；否则保留新请求。
4. **force：** `force` 不与非 force 请求合并；创建新逻辑请求与更高 `requestSeq`；旧请求继续执行但不得覆盖新缓存（缓存写入要求 `requestSeq >= entry.requestSeq`）；面板只提交最新请求。
5. **不得修改受保护文件：** `hash-utils.ts` 的现有口径不变；新身份函数放在非受保护模块或测试工具中。

### 7.4 必测输入

- 孤立高代理项（`\uD800`）。
- 孤立低代理项（`\uDC00`）。
- 真实 U+FFFD 字符。
- 两个不同孤立代理项：UTF-8 哈希相同、UTF-16LE 哈希不同、原始字符串不全等。
- 真实 U+FFFD 与孤立代理项：UTF-8 可能相同、UTF-16LE 不同。

### 7.5 缓存容量、淘汰与失败隔离（R06）

| 项 | 规定 |
|---|---|
| 条目上限 | 128 条 |
| 结果字节预算 | 32 MiB = **33,554,432 字节**（二进制口径）；按 Worker 回复的 `resultBytes` 计，`resultBytes` 用 UTF-8 编码后的字节数，不是 JSON 字符数 |
| 预算性质 | 这是**估算上限**，不是堆内存精确上界；文档不得把它写成精确内存保证 |
| 单条超限 | 单条 `resultBytes > 32 MiB`：跳过缓存，分析本身成功；记录 `cacheSkipped` |
| 淘汰 | LRU；优先淘汰最久未访问的已完成条目；不得淘汰有等待者或在执行的条目 |
| 淘汰不足 | 淘汰后仍不足以容纳新条目：跳过缓存，不失败分析；不得突破预算 |
| 失败缓存 | 只缓存确定性解析失败；基础设施/超时/崩溃/取消/熔断/容量拒绝不缓存 |
| 纪元变化 | 清空全部缓存 |
| 缓存失败 | 缓存读写异常不得使分析失败；只记 `cacheError` |
| 统计 | `cacheHits`、`cacheMisses`、`cacheEvictions`、`cacheSkipped`、`cacheErrors` 为历史累计 |

---

## 八、页面纪元、URL、刷新与后台迟到（R11、R12）

### 8.1 三层身份

| 身份 | 作用 | 失效条件 |
|---|---|---|
| `pageEpoch` | 页面/文档生命周期 | 导航、刷新、目标页关闭 |
| `collectorEpoch` | 后台脚本收集器会话 | 页面重置、Service Worker 重启、重新附着 |
| `requestSeq` | 某脚本的分析请求序号 | 新刷新/force/新源码 |

**URL 身份：** `scriptUrl` 按原样字符串参与缓存键、提交校验与捕获目标校验；不做宽松归一化。提交时必须核对 `result.scriptUrl === 当前 script.url`。

### 8.2 后台迟到事件守卫（D6 必修）

- 发送前：`collector.getScript(scriptId) === script` 且 `scriptCollectors.get(tabId) === collector`；否则丢弃。
- 消息携带 `collectorEpoch`；面板维护 `latestCollectorEpoch`，拒绝更旧值。
- **会话重同步：** 面板 Port 连接时，后台先发当前 `collectorEpoch` 与 `sessionNonce`；面板以此重置本地基线。Service Worker 重启后 `collectorEpoch` 可能从 0 重新计数，必须用 `sessionNonce` 区分“新会话”与“旧消息”，不能只比较数字大小。
- 测试：异步取源码 → 重置 → 旧回调；正常脚本不被丢弃；SW 重启/重新附着的会话重同步。

### 8.3 刷新事务

- 单飞；快照；逐脚本新 `requestSeq`。
- 不清空全局候选；旧结果保留到该脚本新结果提交成功，再按脚本替换。
- 源码/URL 变化：旧结果标 `stale-source`/`stale-url`，不得作为捕获目标。
- 纪元变化：中止刷新，全部旧请求作废。
- 失败可见：逐脚本错误码；完成/部分失败/中止的明确结论。
- 提交成功：清旧错误；更新 `committedSourceHash`、`committedUrl`、`requestSeq`。

### 8.4 捕获目标

必须同时满足：`currentState=committed`、`committedSourceHash=当前源码哈希`、`committedUrl=当前 URL`、`pageEpoch=当前`、未退休（D7 若获批则按 D7；未获批时保留现有退休判定，但身份失效结果一律排除）。
