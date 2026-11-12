## 七、R16：真实面板渲染完成判据

### 7.1 问题

内容签名没有请求来源；同签名旧卡、其他脚本同签名卡、整表重建、同内容刷新、零候选、旧纪元复用都会造成假通过或假失败。V4 的 `requestSeq/commitSeq` 仍缺纪元与会话边界，且未要求逐卡 commit 一致、零候选独立 token。

### 7.2 测试专用 DOM 身份（仅在 `?obTest=1`）

| 位置 | 属性 | 含义 |
|---|---|---|
| 每个 `.decoder-card` | `data-obtest-script-id` | 来源脚本 |
| 每个 `.decoder-card` | `data-obtest-request-seq` | 来源请求 |
| 每个 `.decoder-card` | `data-obtest-page-epoch` | 页面纪元 |
| 每个 `.decoder-card` | `data-obtest-session-nonce` | 会话 nonce |
| 每个 `.decoder-card` | `data-obtest-commit-token` | 该卡所属提交 token（epoch + sessionNonce + commitSeq） |
| `#decoder-list` | `data-obtest-render-tick` | 完整渲染快照完成后递增 |
| `#decoder-list` | `data-obtest-render-commit-token` | 本次完整快照覆盖的最新提交 token |
| `#decoder-list` | `data-obtest-render-epoch` / `data-obtest-render-session` | 容器所属纪元/会话 |

- 只在测试模式存在；不返回内容；不是 D10 字段。
- `commitToken` 必须由 `pageEpoch + sessionNonce + 单调 commitSeq` 组成，跨文档/会话不复用。
- 每张计入卡必须与目标 `commitToken` **完全相同**；只比数量不够。
- `render-tick` 只在整次渲染快照完成后发布，不能在开始渲染时发布。

### 7.3 渲染状态

| 状态 | 判定 |
|---|---|
| `render-completed` | 目标 `commitToken` 的卡片数 = `committedCandidates`；每张目标卡 commitToken 完全相同；容器 `render-commit-token` = 目标 token；提交后 tick 递增；零候选时卡片数=0 且 token/tick 条件满足；旧目标 token 卡已清除 |
| `render-partial` | 0 < 目标 token 卡片数 < `committedCandidates` |
| `render-failed` | 目标 token 卡片数 > `committedCandidates`；或存在目标请求的错误 token 卡；或完整快照未发布却发布成功 token |
| `render-timeout` | 截止时仍未达到 `render-completed`，且无成功 token |
| `render-unverified` | 测试属性不可用/观察器未在提交前安装/无法独立取得目标 token |

**零候选的独立来源：** 目标 `commitToken` 必须来自 D10 的目标记录（requestSeq + committedCandidates=0）与协调器的 commit 记录，不得用待检容器自己的 `render-commit-token` 自证。容器 token 必须等于该独立 token，且 tick 在提交后递增；旧目标 token 卡必须已清除。

### 7.4 必测反例

1. 旧同签名卡（旧 token）保留 → 不得通过；旧 token 卡必须被清除或不计入。
2. 其他脚本同签名卡 → 按 scriptId/token 排除。
3. 同内容刷新（整表清空重建）→ tick 只在完整快照后递增；目标 token 匹配则通过。
4. 零候选 → 独立 token + tick + 旧卡清除；缺一即不得通过。
5. 部分渲染 → partial。
6. 渲染超时/中断 → 未发布成功 token 前保持 pending；截止唯一归 timeout。
7. 旧纪元/旧会话复用 requestSeq → pageEpoch/sessionNonce/token 必须拒绝。
8. 逐卡 token 不一致 → failed。

### 7.5 与 D10/产品边界

- D10 仍只返回九字段；DOM 属性不返回内容。
- 测试属性是新增产品观测代码，必须在 Phase 2/4 实施范围中明确接受，不因“不是 D10”自动扩张。
- 若用户不接受测试属性：`render-unverified`，Phase 4 不得签发渲染通过；R16 保持 PARTIAL/OPEN 视审查而定。
