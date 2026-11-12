
---

## 五、R01：Promise 结算生命周期

### 5.1 四个阶段不能合并

| 阶段 | 事件 | 客户端状态 | Promise | 证据 |
|---|---|---|---|---|
| A Worker 成功返回 | Worker 回复到达 | 尝试 `replied-success`；逻辑仍在 `executing` | 不结算 | 回复 `attemptId`/回显匹配 |
| B 主线程收到并接受 | 客户端校验信封、写缓存 | 逻辑 `awaiting-commit` | `resultReady` 结算 | `requestId`、`sourceSha256`、`cacheSeq` |
| C 面板接受并提交 | panel 调用 `commitResult`/`rejectCommit` | `committed`/`commit-rejected` | `completion` 结算 | D10 九字段、commit 序号 |
| D 逻辑请求最终结算 | 终态记录 | 终态 | `completion` 已结算 | 终态审计 |

**核心规则：** Worker 成功 ≠ 主线程收到 ≠ 面板提交 ≠ 逻辑请求最终结算。任何一个阶段都不得用后一阶段的证据冒充前一阶段。

### 5.2 双 Promise 协议

`analyze(job)` 返回 `AnalysisHandle`：

| 成员 | 结算时机 | 用途 |
|---|---|---|
| `resultReady: Promise<AnalysisOutcome>` | 阶段 B（客户端已校验信封/缓存） | 面板取得可提交的结果 |
| `completion: Promise<RequestCompletion>` | 阶段 D（提交/拒绝/失败/取消） | 最终审计、统计、调用方收尾 |

- `resultReady` 只表示“结果可用”，不表示“已提交”。
- `completion` 只结算一次；终态包括 `committed`、`commit-rejected`、`analysis-failed`、`failed`、`cancelled`、`rejected`。
- 面板必须在 `resultReady` 的同一异步续体里调用 `commitResult(requestId, outcome)` 或 `rejectCommit(requestId, code)`；异常由 `catch` 转为 `rejectCommit`。
- 缓存命中：不创建 attempt、不启看门狗；直接 `awaiting-commit`，`resultReady` 结算；缓存为解析失败时终态 `analysis-failed`，`completion` 立即结算。
- 取消/纪元/dispose：
  - `executing`：尝试 `cancelled`，`resultReady` 以错误结果 `cancelled` 结算，`completion` 结算 `cancelled`。
  - `awaiting-commit`：`completion` 结算 `cancelled`；迟到的 `commitResult` 记日志后忽略。
  - 已终态：取消不改写终态。
- 提交失败：`rejectCommit` → `commit-rejected`；`completion` 结算。
- 提交超时：`COMMIT_ACK_TIMEOUT_MS = 10_000`（**技术参数，不是产品决策；Phase 1 规格评审时确认并登记**）。超过后 `failed(commit-timeout)`，`completion` 结算；迟到的提交忽略。
- 幂等：`settleAttempt`、`settleLogical`、`commitResult`、`rejectCommit` 均可重复调用但只生效一次；重复调用只记日志。

**如果提交超时参数未获批准：** R01 不得关闭，`awaiting-commit` 只能靠取消/纪元/dispose 收尾；Phase 1 不得开始。不得用“面板一定会提交”作为无界等待的理由。

### 5.3 事件补充

| 事件 | 逻辑前态 | 尝试前态 | 结算责任 | 逻辑后态 | Promise | 缓存 |
|---|---|---|---|---|---|---|
| Worker 成功回复（信封有效） | `executing` | `dispatched` | 客户端：先校验，再 `settleAttempt`，转 `awaiting-commit` | `awaiting-commit` | `resultReady` 结算 | 是（按 requestSeq） |
| 缓存命中（成功） | `deferred`/`discovered` | 无 | 客户端 | `awaiting-commit` | `resultReady` 结算 | 否（读） |
| 缓存命中（解析失败） | `deferred`/`discovered` | 无 | 客户端 | `analysis-failed` | `resultReady` + `completion` 结算 | 否（读） |
| 面板 `commitResult` 成功 | `awaiting-commit` | 无 | 面板→客户端 | `committed` | `completion` 结算 | 否 |
| 面板 `rejectCommit` | `awaiting-commit` | 无 | 面板→客户端 | `commit-rejected` | `completion` 结算 | 否 |
| 提交超时 | `awaiting-commit` | 无 | 客户端定时器 | `failed(commit-timeout)` | `completion` 结算 | 否 |
| 取消/纪元 | `executing`/`awaiting-commit` | 相关 | 取消协议 | `cancelled` | 两者均结算 | 清空 |

### 5.4 不变量

1. 每个逻辑请求 `resultReady` 最多结算一次、`completion` 最多结算一次。
2. `completion` 结算时，`currentState` 必为终态；终态不再变化。
3. `awaiting-commit` 不得永久存在：提交、拒绝、超时、取消、纪元、dispose 六条路径任一生效。
4. 缓存命中不创建 attempt、不启看门狗。
5. 面板未提交前，`resultReady` 已结算但 `completion` 未结算；这是两个不同的完成概念，不得混用。

---

## 六、R03：熔断计数与恢复

### 6.1 计数规则

| 事件 | 计数 | 说明 |
|---|---|---|
| 构造 Worker 失败 | `consecutiveWorkerFailures++` | 无 attempt |
| `onerror` | ++ | Worker 级 |
| `messageerror` | ++ | Worker 级 |
| `postMessage` 抛错 | ++ | Worker 级 |
| `protocol-error`（信封无效） | ++ | Worker 级 |
| 看门狗超时 | **不计入** | 单独 `watchdogTrips` |
| 业务解析失败（`ok:false`） | **不计入** | 有效回复，证明 Worker 运行 |
| 提交校验失败 | **不计入** | 面板层 |
| 用户取消 | **不计入** | — |

**健康运行的定义：** 收到与当前 `attemptId`/`requestId` 匹配、信封字段一致、`ok:true` 或 `ok:false` 的回复。只有这种回复才能把 `consecutiveWorkerFailures` 清零。

**明确禁止：** 以“`new Worker` 构造成功”作为健康或清零依据。构造成功只证明对象创建成功。

### 6.2 累计、重试与熔断

- 每次尝试失败按上表计数；一次重试失败会再计一次。
- 计数达到 **3**（不改变已批准阈值）时立即打开熔断，即使当前请求还有重试额度：不再重试，按 `failed(breaker-open)` 结算当前请求。
- 熔断打开时原子结算：
  - `executing`：尝试 `cancelled`/`failed`，逻辑 `failed(breaker-open)`。
  - `retry-pending`：逻辑 `failed(breaker-open)`，清重试计划。
  - `deferred`：逻辑 `failed(breaker-open)`，清引用。
  - `awaiting-commit`：**保留**（提交不需要 Worker）；可继续 `commitResult`/`rejectCommit`/超时。
  - 等待者：随逻辑请求结算，不单独悬挂。

### 6.3 恢复

- 触发：`refresh`、新纪元、`cancelAll`、显式重置。
- 动作：`breakerOpen=false`，`recovering=true`，**保持** `consecutiveWorkerFailures` 在当前阈值（不清零）。
- 恢复确认：下一次 Worker 尝试作为探针；收到有效健康回复 → 计数清零、`recovering=false`；任何 Worker 级失败 → 计数保持/增加，立即重新熔断。
- 这样“构造成功”不会清零；“反复构造成功+崩溃”会按每次失败累计，3 次可达。
- 恢复探针失败不得静默；记录 `breaker-probe-failed`，面板显示。

### 6.4 不变量

1. 连续 3 次 Worker 级失败必然打开熔断。
2. 构造成功不改变计数。
3. 看门狗不改变熔断计数。
4. 熔断后不存在需要 Worker 的 pending 请求。
5. 恢复必须经过一次有效健康回复；仅重置标志不算恢复。

---

## 七、R16：真实面板渲染完成判据

### 7.1 问题

V3 的 DOM 签名只有函数名/置信度/调用数/首个调用文本，没有请求来源；同签名旧卡、其他脚本同签名卡、整表重建、同内容刷新、零候选都能造成假通过或假失败。

### 7.2 测试专用 DOM 身份

仅在 `?obTest=1` 时，由面板渲染代码写入以下属性（不写入内容、不进入 D10）：

| 位置 | 属性 | 含义 |
|---|---|---|
| 每个 `.decoder-card` | `data-obtest-script-id` | 该卡来自哪个脚本 |
| 每个 `.decoder-card` | `data-obtest-request-seq` | 该卡由哪个请求渲染 |
| 每个 `.decoder-card` | `data-obtest-commit-seq` | 提交序号 |
| `#decoder-list` | `data-obtest-render-tick` | 每次渲染完成递增 |
| `#decoder-list` | `data-obtest-render-commit-seq` | 本次渲染覆盖的最新提交序号 |

- 属性只在 `?obTest=1` 下存在；普通面板无这些属性。
- 不返回源码、候选内容或调用位置；不是 D10 字段。
- 若用户/Codex 不接受测试专用 DOM 属性，则不得声称渲染完成；R16 保持 OPEN/`render-UNVERIFIED`，Phase 4 不得签发渲染通过。

### 7.3 渲染状态

| 状态 | 判定 |
|---|---|
| `render-completed` | 目标 `scriptId`+`requestSeq` 的卡片数 = `committedCandidates`；容器 `render-commit-seq ≥ 目标 commitSeq`；`render-tick` 在提交后递增；零候选时卡片数=0 且条件同样满足 |
| `render-partial` | 0 < 目标卡片数 < `committedCandidates` |
| `render-failed` | 目标卡片数 > `committedCandidates`，或存在目标请求的错误身份卡，或提交后 tick 未递增 |
| `render-timeout` | 截止时刻仍未达到 `render-completed` |
| `render-unverified` | 测试专用属性不可用，或观察器未能在提交前安装 |

### 7.4 必测反例

1. **旧同签名卡**：保留旧 `requestSeq` 的同签名卡，目标提交后不更新 DOM → 必须判 `render-partial`/`render-timeout`，不得因多重集合相同而通过。
2. **其他脚本同签名**：B 脚本产生与 T 相同的签名；T 未渲染，B 的卡存在 → 按 `scriptId` 归属，T 仍为 partial。
3. **同内容刷新**：`renderDecoderList` 整表清空重建，目标内容相同 → 必须通过 `render-tick`/`render-commit-seq` 证明本次渲染，不能按“净增 0”判失败。
4. **零候选**：目标提交 0 个候选 → 卡片数 0，但 tick 递增且 commit seq 匹配，判 completed。
5. **部分渲染**：目标 983 个候选只出现 500 个 → partial。
6. **渲染超时**：截止时 tick 未递增 → timeout。
7. **旧纪元卡**：旧 `pageEpoch` 的卡不得计入目标。

### 7.5 与 D10 的关系

- D10 仍只返回九字段，不扩展。
- DOM 属性只用于测试侧归属，不返回内容。
- 面板提交的完整内容仍按 §13 的五层范围报告；DOM 证明只覆盖“目标请求的卡片呈现”，不等于完整字段内容一致。

---

## 八、状态机、尝试与 force（R05、R10、R18 的前置）

### 8.1 逻辑状态（10 + discovered）

`discovered`、`deferred`、`executing`、`retry-pending`、`awaiting-commit`、`analysis-failed`、`commit-rejected`、`committed`、`failed`、`rejected`、`cancelled`。

- `awaiting-commit` 取代 V3 的 `analysis-succeeded`：结果已交付，等待面板提交。
- `analysis-failed` 是终态；`commit-rejected`/`committed` 是提交结果；`failed` 是基础设施/提交超时；`rejected` 未受理；`cancelled` 取消。

### 8.2 尝试状态（9）

`created`、`dispatched`、`replied-success`、`replied-error`、`protocol-error`、`timed-out`、`crashed`、`post-failed`、`cancelled`。

- 先创建 attempt 记录（`created`），`postMessage` 成功后才进入 `dispatched`；发送失败为 `post-failed`，不伪造“已派发”时刻。
- `ignored-*` 仍只是事件处理结果，不是尝试状态。

### 8.3 事件表补充

| 事件 | 逻辑前态 | 尝试前态 | 结算责任 | 尝试后态 | 逻辑后态 | 备注 |
|---|---|---|---|---|---|---|
| 派发前创建 attempt | `deferred`/`retry-pending` | 无 | `dispatch` | `created` | `executing` | 尚未发送 |
| 发送成功 | `executing` | `created` | `dispatch` | `dispatched` | `executing` | 看门狗开始 |
| 发送失败 | `executing` | `created` | `settleAttempt` | `post-failed` | 首次→`retry-pending`；二次→`failed` | 计数++ |
| 缓存命中 | `discovered`/`deferred` | 无 | 客户端 | 无 | `awaiting-commit` 或 `analysis-failed` | 无 attempt/无看门狗 |
| 熔断打开 | 任意 Worker 依赖态 | 任意 | `openBreaker` | 相关尝试结算 | `failed(breaker-open)` | `awaiting-commit` 保留 |
| 提交成功/拒绝/超时 | `awaiting-commit` | 无 | 面板/定时器 | 无 | `committed`/`commit-rejected`/`failed(commit-timeout)` | `completion` 结算 |

### 8.4 force 与异步定型（R05）

- **force 永不与非 force 合并**；force 之间也不合并；每个 force 创建独立逻辑请求与更高 `requestSeq`。
- 异步重键必须携带 `force` 隔离标识与请求 nonce；即使缓存键相同，也不得把不同 force 类的等待者合并。
- force 请求不取消旧请求；旧请求继续，但其结果只能更新自己的记录，只有最新 `requestSeq` 可以更新该脚本 `currentState` 与缓存。
- 缓存写入要求 `requestSeq >= entry.requestSeq`；旧请求的迟到结果不得覆盖新请求。
- 允许重复计算；不得默默合并 Promise。

### 8.5 最新请求独占更新

- 旧请求的取消/完成只更新自己的历史计数；不得把旧请求的状态写回该脚本的 `currentState`。
- 只有最新 `requestSeq` 的提交/取消可以改变当前状态。
- 页面重置清空当前集合；旧回调不得把旧脚本重新加回。

### 8.6 批量取消协议（R02）

`cancelAll(reason, { epochChanged })`：

1. `cancelling = true`；`schedulerGeneration++`；禁止 `pump`。
2. 若 `epochChanged`：`pageEpoch++`；旧纪元请求全部失效。
3. 结算 `executing`：清看门狗；尝试 `cancelled`；逻辑 `cancelled`；`resultReady` 以错误 `cancelled` 结算；`completion` 结算；终止 Worker、解除处理器。
4. 逐项结算 `retry-pending`：清重试计划；逻辑 `cancelled`；`completion` 结算。
5. 逐项结算 `deferred`：清引用；逻辑 `cancelled`；`completion` 结算。
6. 逐项结算 `awaiting-commit`：逻辑 `cancelled`；`completion` 结算；迟到提交忽略。
7. 清空 `active`、等待者、定时器、重试队列。
8. 清空缓存（纪元变化必须；面板关闭同样）。
9. `cancelling = false`；允许新请求重新 `pump`。`disposed` 时保持关闭。

**禁止：** 取消期间 `pump`；只清数组不结算 Promise；把 `retry-pending` 留在后台；取消后旧回调再次 `pump`。

### 8.7 旧代次与事件绑定（R04）

所有异步回调绑定：

- `workerGeneration`：每次创建/退役 Worker 递增。
- `pageEpoch`：页面纪元。
- `attemptId`：尝试编号。
- `logicalRequestId`：逻辑请求。
- `collectorEpoch`/`sessionNonce`：后台收集器会话。

`onmessage`、`onerror`、`messageerror`、看门狗、哈希 Promise、重试派发、延后补投、缓存写入都必须检查上述代次。失效事件结果为 `ignored-stale-generation`/`ignored-unknown-attempt`，只记日志，不改状态、不写缓存、不 `pump`。

### 8.8 缓存容量与淘汰（R06）

| 项 | 规定 |
|---|---|
| 条目上限 | 128 条 |
| 结果字节预算 | 32 MiB = 33,554,432 字节；`resultBytes` 用 UTF-8 字节数，不是 JSON 字符数 |
| 预算性质 | 估算上限，不是堆内存精确保证 |
| 单条超限 | `resultBytes > 32 MiB`：跳过缓存，分析成功；记 `cacheSkipped` |
| 淘汰 | LRU；不淘汰有等待者或在执行的条目；淘汰不足则跳过缓存，不失败分析；不得突破预算 |
| 失败缓存 | 只缓存确定性解析失败；基础设施/超时/崩溃/取消/熔断/容量拒绝不缓存 |
| 纪元变化 | 清空全部缓存 |
| 缓存异常 | 不得使分析失败；记 `cacheError` |
| 统计 | `cacheHits`、`cacheMisses`、`cacheEvictions`、`cacheSkipped`、`cacheErrors` |

### 8.9 页面纪元、URL 与刷新（R11）

- `pageEpoch` 只在导航/刷新/目标页关闭时递增；刷新不递增，只递增每脚本 `requestSeq`。
- `collectorEpoch` 是后台收集器会话；`sessionNonce` 区分 Service Worker 重启后的计数重置。
- URL 按原样字符串参与缓存键、提交校验与捕获目标校验；提交时必须核对 `result.scriptUrl === 当前 script.url`。
- 刷新：单飞；快照；逐脚本新 `requestSeq`；不清空全局候选；旧结果保留到该脚本新结果提交成功，再按脚本替换；源码/URL 变化使旧结果标 `stale-source`/`stale-url`；纪元变化中止刷新；失败逐脚本可见。
- 提交成功：清旧错误；更新 `committedSourceHash`、`committedUrl`、`requestSeq`。
- 捕获目标：`committed` + 当前源码哈希 + 当前 URL + 当前纪元 + 未退休（D7 若批准；未批只做身份失效排除）。

### 8.10 后台迟到事件守卫（R12，D6）

- 发送前：`collector.getScript(scriptId) === script` 且 `scriptCollectors.get(tabId) === collector`；否则丢弃。
- 消息携带 `collectorEpoch`；面板维护 `latestCollectorEpoch` 与 `sessionNonce`，拒绝旧值。
- Port 连接时后台先发当前 `collectorEpoch` 与 `sessionNonce`；SW 重启后计数可能重置，用 nonce 区分新会话，不能只比数字。
- 测试：异步取源码 → 重置 → 旧回调；正常脚本不被丢弃；SW 重启/重新附着重同步。
