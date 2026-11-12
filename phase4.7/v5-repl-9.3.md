### 9.3 两级状态：逻辑请求与脚本 `currentState`

| 概念 | 范围 | 归属 |
|---|---|---|
| 逻辑请求 `state` | 一次分析意图（`requestSeq`） | 该请求自身；结束即终态 |
| 脚本 `currentState` | 当前页面上该脚本的最新状态 | 只有最新 `requestSeq` 可更新 |

规则：

1. 旧请求 `completion` 结算时，只把自己的逻辑请求置终态；**不得**强制脚本 `currentState` 变终态。
2. 只有该脚本最新的 `requestSeq` 的提交/取消/失败可以更新脚本 `currentState`。
3. 反例：旧 P 在 `executing`，新 force F 成为最新并 `deferred`；P 结束时脚本 `currentState` 必须仍是 F 的 `deferred`，不能变成 P 的终态。
4. 旧请求的失败/取消只进历史 counters；不改变当前状态守恒式。
5. 页面重置清空当前集合；旧回调不得把旧脚本加回。

**终态映射（对逻辑请求）：**

| 结果 | 请求终态 | `analyzed` |
|---|---|---|
| 提交成功 | `committed` | true（且为最新请求） |
| 提交拒绝 | `commit-rejected` | false |
| 解析失败 | `analysis-failed` | false |
| 基础设施/提交超时 | `failed` | false |
| 未受理 | `rejected` | false |
| 取消/纪元 | `cancelled` | false |
