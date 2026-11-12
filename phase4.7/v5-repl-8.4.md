### 8.4 R05：无损源码身份、缓存键与去重

#### 8.4.1 三种身份不能混用

| 概念 | 用途 | 规则 |
|---|---|---|
| 字节计量 | D3 deferred 预算、D4 看门狗 | 源码按 UTF-8 编码后的字节数 |
| 源码身份 | 缓存/去重是否同一份源码 | 无损编码：UTF-16LE 码元序列的 SHA-256 + 原始字符串全等 |
| 请求身份 | 一次分析意图 | `pageEpoch + sessionNonce + scriptId + requestSeq` |

**SourceIdentityV1：**

- `source`：原始 JavaScript 字符串（保留，用于全等比较）。
- `utf16Length`：UTF-16 码元数。
- `sha256Utf16Le`：把每个 UTF-16 码元写成 2 字节小端，再算 SHA-256。
- `isWellFormed`：无孤立代理项。
- `sha256Utf8`：仅用于 D3/D4/展示，不得作为唯一身份。
- 两个孤立代理项、真实 U+FFFD 必须由 UTF-16LE 与原串全等区分。

#### 8.4.2 缓存键 `CacheKeyV1`

```text
cacheKey = hash(
  pageEpoch
  | sessionNonce
  | scriptId
  | scriptUrl            // 原样字符串，不归一化
  | sha256Utf16Le
  | analyzerVersion
  | optionsHash
)
```

- 命中后必须再校验 `entry.source === 当前 source`；哈希只做索引。
- `scriptId` 是 CDP 身份；`scriptUrl` 是 URL 身份；`pageEpoch/sessionNonce` 是页面/会话生命周期；`analyzerVersion/optionsHash` 是分析语义。
- 同 scriptId、不同源码 → 不同键；同源码、不同 URL → 不同键；同源码、不同页面/会话 → 不同键。
- 纪元变化清空缓存；源码变化新键；旧键按 LRU 淘汰。

#### 8.4.3 去重键 `ActiveKeyV1`

- 同步占位键：`scriptId | scriptUrl | utf16Length | forceFlag | placeholderSeq`。
- 占位值保存 `source` 引用与 `requestSeq`；只有 `source` 全等才允许合并等待者。
- 异步 `sha256Utf16Le` 完成后重键为 `CacheKeyV1`；重键时再次检查 `forceFlag`、`placeholderSeq`、原串全等，任一不符则不合并。
- 非 force 合并：同 `pageEpoch/sessionNonce/scriptId/url/source/options/version` → 一个逻辑请求，等待者挂同一 `resultReady`/`completion`。
- force：**永不合并**（与非 force 不合并，force 之间也不合并）；创建新逻辑请求与更高 `requestSeq`；旧请求继续，但只有最新请求更新脚本 `currentState` 与缓存。

#### 8.4.4 去重规则表

| 情形 | 同页面/会话 | 同 scriptId | 同源码 | 同 URL | force | 动作 |
|---|---|---|---|---|---|---|
| A | 是 | 是 | 是 | 是 | 否 | 合并为一个逻辑请求，等待者共享 |
| B | 是 | 是 | 否 | 是 | 否 | 不同键，新请求；最新 requestSeq 更新脚本状态 |
| C | 是 | 是 | 是 | 否 | 否 | 不同键（URL 身份不同），新请求 |
| D | 否 | 是 | 是 | 是 | 否 | 不同键（页面/会话不同），新请求 |
| E | 任意 | 任意 | 任意 | 任意 | 是 | 永不合并；新请求；旧请求继续 |
| F | 是 | 是 | 是 | 是 | 是+否 | 不合并；force 绕过缓存读取，独立分析 |
| G | 任意 | 任意 | 任意 | 任意 | 任意 | 缓存命中仍创建新请求 id/seq/ack，不复用旧请求 |

#### 8.4.5 缓存命中、失效与淘汰

- 非 force 命中：交付缓存结果；不建 attempt、不启 D4 看门狗；新请求 id/seq；成功结果进入 `awaiting-commit`，解析失败直接终态。
- force：跳过缓存读取，重新分析；成功且 `requestSeq >= entry.requestSeq` 才写缓存。
- 缓存容量：128 条 / 32 MiB（UTF-8 `resultBytes` 估算）；单条超限跳过；LRU 不足跳过；缓存异常不失败分析；纪元变化清空。
- 失败缓存只限 `errorKind='parse'` 的确定性解析失败；基础设施/超时/崩溃/取消/熔断/拒绝不缓存。
- 缓存淘汰不改变已提交的面板结果；缓存只是复用优化。

#### 8.4.6 不得修改受保护文件

`src/core/hash-utils.ts` 保持原口径；`sha256Utf16Le` 放在非受保护的身份工具/客户端模块中，不得以后者替换前者。
