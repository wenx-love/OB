
---

## 六、队列、延后、缓存与统计（R05–R08）

### 6.1 队列结构

只有一个执行槽位和一个延后集合：

```text
                 ┌──────────────┐
  analyze() ───▶ │ deferred 集合 │ ──pump──▶ 执行槽位（1）──▶ Worker
                 │ ≤256 条       │              │
                 │ ≤64 MB 源码   │              └──▶ 结算
                 └──────────────┘
```

- 不存在第二个无界数组；不存在“队列 + 延后 + 重试”三个各自计数的结构。
- 重试不回到延后集合：逻辑请求在 `retry-pending` 时保留执行优先权，直接派发第二次尝试（不插队、不重新排队）。
- 缓存不属于队列；缓存只是结果复用。

### 6.2 调度规则

`pump()` 仅在以下全部成立时执行：未 `disposed`、未 `cancelling`、未熔断、`inflight === null`、延后集合非空。

取下一个的顺序：

1. 小脚本队列（源码 UTF-8 ≤64 KB）非空 → 取队首。
2. 否则取大脚本队列队首。
3. 同级内严格按逻辑请求序号（发现顺序）。
4. 展示顺序与调度顺序分离：面板列表、日志顺序始终按发现顺序；执行顺序按上述规则。

**饥饿记录：** 每个延后项记录 `enqueuedAt`、`lastOvertakenAt`、`overtakenBySmall`。若大脚本连续被小脚本越过超过阈值（技术参数，默认 64 次），只记录 `starvation-suspected` 并上报；不改变优先级。

### 6.3 容量与溢出

| 情形 | 处理 |
|---|---|
| 延后条数已达 256 | 新请求不受理：`rejected('deferred-full')`；面板显示当前条数与字节；不缓存 |
| 延后累计源码已达 64 MB | 同上 |
| 单份源码 >64 MB | `rejected('source-too-large')` |
| 延后项被取消/纪元变更 | 逐项 `cancelled`；清空 |
| 延后项开始执行 | 从延后集合移除，字节预算释放 |

**可见性要求：** `deferred-full` 和 `source-too-large` 必须在面板日志中带 scriptId 与当前计数；不得只写控制台。

### 6.4 统计口径

| 计数 | 含义 | 何时增加 | 何时减少 |
|---|---|---|---|
| `discovered` | 面板收到的脚本数 | 每条 `script-discovered` | 页面重置清空 |
| `deferred` | 当前延后集合大小 | 受理且未执行 | 开始执行/取消/熔断结算 |
| `executing` | 当前执行槽位（0/1） | 派发尝试 | 结算 |
| `retry-pending` | 首次失败、等待第二次 | 首次失败 | 第二次派发/取消 |
| `committed` | 结果已提交的脚本数 | 提交校验通过 | 页面重置/源码变化失效 |
| `analysis-failed` | Worker 返回解析失败 | 解析失败 | 页面重置 |
| `commit-rejected` | 提交校验失败 | 校验失败 | 页面重置 |
| `rejected` | 未受理（容量/超预算/熔断/关闭） | 立即返回错误 | 不减少（历史计数） |
| `cancelled` | 被取消结算 | 取消 | 不减少（历史计数） |
| `attempt-failures` | 尝试级失败次数 | 每次失败 | 不减少 |
| `retry-succeeded` | 重试后成功次数 | 第二次成功 | 不减少 |

**`analyzed` 的唯一含义：** `committed`。解析失败、提交失败、延后、执行中都不计入 `analyzed`。详见 §8。

### 6.5 缓存身份（R05）

缓存键必须覆盖：

```text
cacheKey = hash(
  pageEpoch
  | scriptId
  | sourceSha256
  | scriptUrl                // 原样字符串，不做宽松归一化
  | analyzerVersion          // discoverDecoders 语义版本；改动即递增
  | optionsHash              // 分析选项；当前为空也保留字段
)
```

- `pageEpoch` 覆盖页面/会话生命周期；页面重置即失效。
- `scriptId` 覆盖 CDP 脚本身份。
- `sourceSha256` 覆盖源码身份；同 id 换源码必然不同键。
- `scriptUrl` 覆盖 URL 身份；同 id、同源码、不同 URL 不复用。
- `analyzerVersion` 覆盖分析器实现变化。
- 等待者绑定**逻辑请求实例**，不按 scriptId 轮询。

### 6.6 缓存容量与淘汰（R06）

| 项 | 定义 |
|---|---|
| 条目上限 | 128 条 |
| 结果字节上限 | 32 MB（Worker 回复附带 `resultBytes`，按 JSON 序列化长度估算） |
| 淘汰策略 | LRU：优先淘汰最久未访问的**已完成**条目；不得淘汰有等待者或在执行的条目 |
| 淘汰后的行为 | 缓存只是复用优化；面板已提交结果不因缓存淘汰而丢失；再次请求会重新分析 |
| 失败缓存 | 只缓存确定性解析失败（`analyzed=false`）；基础设施失败、超时、崩溃、取消、熔断、容量拒绝一律不缓存 |
| 纪元变化 | 清空全部缓存 |
| 源码变化 | 新键自然隔离；旧键按 LRU 淘汰 |
| 统计 | `cacheHits`、`cacheMisses`、`cacheEvictions` 进入客户端统计与阶段证据 |

### 6.7 延后集合与内存

- 延后项只持脚本对象引用（`script`），不复制 `source` 字符串。
- 但延后项仍有：逻辑请求对象、Promise、等待者数组、入队时间等开销；不得在文档中声称“无额外内存”。
- 延后集合的上界（256 条 / 64 MB）只约束延后项；执行槽位、缓存、重试各按 §6.5、§6.6 单独约束。

---

## 七、页面纪元、刷新与后台迟到事件（R11、R12）

### 7.1 页面纪元 `pageEpoch`

- 只在页面级重置（导航/刷新/目标页关闭）时递增。
- 递增动作由面板的重置分支执行，且是唯一入口。
- 纪元变化后：旧纪元的一切分析结果、捕获记录、候选、提交标识全部失效。
- 刷新（手动刷新 decoder discovery）**不**递增 `pageEpoch`；它递增每个脚本的 `requestSeq`。

### 7.2 后台迟到事件守卫（D6，必修）

静态缺口（`CONFIRMED`）：`background.ts:228-239` 在异步 `getScriptSource` 返回后，不检查收集器是否仍持有该脚本；`panel.ts:1204-1205` 收到即写入并删除退休标记。

V2 要求：

1. **后台发送前校验对象身份**：`collector.getScript(scriptId) === script` 且 `scriptCollectors.get(tabId) === collector`；任一不成立即丢弃，不发送。
2. **后台附带收集器纪元**：每个 tab 的收集器维护 `collectorEpoch`，页面重置 `clear()` 时递增；`script-discovered` 消息携带 `collectorEpoch`。
3. **面板接收校验**：面板维护每个 tab 的 `latestCollectorEpoch`；收到小于当前值的消息丢弃；收到更大值时更新并继续处理。
4. **测试先行**：构造“异步取源码 → 页面重置 → 旧回调返回”的确定性测试，断言不发送/不接收；再加“正常脚本不被丢弃”的对照测试。
5. **真实浏览器频率**：`UNVERIFIED`。不得以“复现不了”为由取消修复；也不得声称该问题在真实站点高频发生。

### 7.3 刷新的事务性

`refreshDecoderDiscovery` 的固定规则：

1. 单飞：已有刷新在运行时不启动第二次。
2. 快照：取当前 `discoveredScripts` 的脚本对象快照。
3. 逐脚本：为每个脚本分配新的 `requestSeq`；提交时必须是该脚本的最新请求。
4. 不清空全局候选：旧结果保留到该脚本的新结果提交成功，再按脚本替换。
5. 源码变化：快照后源码哈希变化 → 该脚本本次刷新作废，旧结果标记 `stale-source`，不得作为捕获目标。
6. 纪元变化：中止刷新，丢弃全部旧请求。
7. 失败可见：每个失败带 scriptId 与错误码；完成后打印“刷新完成/部分失败/中止”的明确结论。
8. 提交成功：清除该脚本旧错误；更新 `committedSourceHash` 与 `requestSeq`。

### 7.4 捕获目标的有效性

构造捕获目标时必须同时满足：

- `analysisState === committed`。
- `committedSourceHash === 当前源码哈希`。
- `epoch === 当前 pageEpoch`。
- 未退休（D7 若获批则按 D7 过滤；未获批时保持现有行为，但身份失效的旧结果一律排除）。

**说明：** 身份失效排除不是 D7；D7 只涉及“退休脚本候选”的筛选与提示。两者分开记录。

---

## 八、`analyzed` 语义与面板状态（R13）

### 8.1 状态枚举

每个脚本对象有唯一的 `analysisState`：

| 状态 | 含义 |
|---|---|
| `discovered` | 已收到脚本，尚未提交分析 |
| `deferred` | 已受理，等待执行 |
| `executing` | 正在执行某次尝试 |
| `retry-pending` | 首次失败，等待第二次 |
| `analysis-succeeded` | Worker 返回成功，但尚未提交 |
| `analysis-failed` | Worker 返回解析失败（`result.analyzed === false`） |
| `committed` | 提交校验通过，候选已合并 |
| `commit-rejected` | Worker 成功但提交校验失败（纪元/身份/回显/源码变化） |
| `cancelled` | 被取消 |

### 8.2 `analyzed` 的唯一含义

- `script.analyzed === true` **当且仅当** `analysisState === 'committed'`。
- `analysis-succeeded` 不是 `analyzed`；它只表示 Worker 返回了结果，尚未过提交校验。
- `analysis-failed`、`commit-rejected`、`cancelled` 一律不是 `analyzed`。
- 面板“已分析”计数 = `committed` 数量，不是 `analysis-succeeded` 数量。

### 8.3 提交校验（同步块）

提交前依次校验，任一失败即 `commit-rejected`：

1. `epoch === 当前 pageEpoch`。
2. `discoveredScripts.get(scriptId) === script`（同一对象）。
3. 未退休（若 D7 未获批，仍保留现有退休判定）。
4. `requestSeq === 该脚本最新请求序号`。
5. 源码哈希未变（`sha256(script.source) === result.sourceSha256` 或与提交时快照一致）。
6. Worker 回显的 `scriptId`、`sourceLength`、`sourceSha256` 与期望一致。

提交成功后：

- 用本次候选替换该脚本旧候选（不是追加）。
- 按发现顺序原地重建 `allCandidates`。
- 清除该脚本旧错误。
- 内部记录 `committedAt`（不通过钩子导出）。

### 8.4 统计一致性测试

- 每个状态的脚本数之和 = `discovered`。
- `committed + analysis-failed + commit-rejected + cancelled + deferred + executing + retry-pending + discovered(未提交)` = 总数。
- 解析失败不计入 `committed`。
- 提交失败不计入 `committed`。
- 重试成功计入 `committed`，但 `retry-succeeded` 与 `attempt-failures` 仍保留。

---

## 九、看门狗、重试与验收分类（R09、R16、R18）

### 9.1 计时与阈值

- 公式：`clamp(120000ms + 1.0ms × UTF8字节数, 300000ms, 2700000ms)`。
- 登记：阶段四开始前，对每个参考输入计算并登记阈值；登记后不得修改。
- 计时：尝试派发 → 回复/崩溃/看门狗。排队等待、延后等待不计入尝试耗时。
- 重试：首次失败后第二次尝试重新计时，不继承首次剩余时间。
- 记录：每次尝试记录 `attemptId`、`startedAt`、`settledAt`、`elapsedMs`、`thresholdMs`、`outcome`、`errorCode`。

### 9.2 50% 验收

- 对每个合法完成的任务：`elapsedMs < 0.5 × thresholdMs`。
- 任一不满足：该阶段性能验收不通过；不得改阈值、不得删任务、不得把该任务标为“故障注入”。
- 故障注入任务、取消任务、拒绝任务不参与 50% 统计，但必须单独列出。

### 9.3 性能完成的三段状态（R16）

| 状态 | 判定 | 证据 |
|---|---|---|
| `workerCompleted` | 目标尝试的回复到达，且 `attemptId`/`requestId`/回显匹配 | 客户端统计/日志 |
| `commitCompleted` | 目标逻辑请求提交成功，钩子记录出现 `state=committed` 与 `committedCandidates` | D10 钩子快照（`requestSeq` + `committedCandidates`） |
| `renderCompleted` | DOM 中候选卡片数与 `#dec-candidates` 文本一致，且连续两次读取稳定 | DOM 读取（窗口结束后） |
| `resultUsable` | 以上三者 + 再次读取钩子确认同一脚本的 `requestSeq` 与 `committedCandidates` 未变 | 钩子 + DOM |

**原子性说明：** 钩子的一次读取只能给出同步快照；之后的导出、DOM 渲染、结果落地不是同一个原子操作。因此必须绑定同一个脚本的 `requestSeq`，并在渲染后复查 `requestSeq` 与 `committedCandidates` 没有变化。

### 9.4 修复前基线的弱判据

- 修复前构建是同步分析，用“候选名多重集合被卡片覆盖 + 总数不再变化”的弱判据；必须标注为弱基线。
- 不能因为“同步分析”就断言全局计数稳定等于全部完成。
- 若无法取得同口径的完整窗口，改善倍率记 `n/a`，不得用不同窗口的数字相除。

### 9.5 分类优先级（R18）

**目标层状态：**

| 状态 | 判定 |
|---|---|
| `target-completed` | 目标提交并渲染 |
| `target-analysis-failed` | 解析失败或提交失败 |
| `target-cancelled` | 用户/纪元取消 |
| `target-deferred-at-deadline` | 窗口结束时目标仍在延后，从未开始 |
| `target-executing-at-deadline` | 窗口结束时目标正在执行 |
| `target-missing` | 发现期限结束仍没有唯一目标 |

**运行层结论（互斥，按优先级从高到低）：**

1. `setup-failed`：目标缺失、不唯一、源码哈希不符、夹具/连接失败。
2. `cancelled`：用户取消或纪元变化。
3. `infrastructure-failed`：Worker 不可用、熔断、崩溃重试耗尽。
4. `execution-timeout`：看门狗触发且重试耗尽。
5. `queue-wait-timeout`：窗口结束时目标从未开始（延后/饥饿），不是 Worker 执行超时。
6. `window-deadline-during-execution`：窗口结束时目标正在执行，但看门狗未触发。
7. `target-failed`：解析失败或提交失败。
8. `partial`：目标完成，但其他脚本未完成。
9. `completed`：目标完成且其他脚本完成，窗口内无未结算项。

**规则：**

- 高优先级覆盖低优先级；`partial` 不得抢占失败结论。
- `target-missing` 只能在发现期限结束后定案；发现期限内不得提前判缺失。
- 排队等待与执行超时必须是两个不同的失败码。
- 同一 run 只允许一个运行层结论；目标层与运行层同时记录。

### 9.6 窗口与计时器节流

- 窗口定义：从页面导航开始，到目标 `resultUsable` 为止。
- 后台/被遮挡窗口的计时器节流会干扰长任务与时间戳；阶段四必须做一次漂移探针，记录是否受节流影响。
- 若无法消除节流影响，报告必须写明；不得把受影响的数据当作同口径对比。
