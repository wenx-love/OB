# Phase 4.7 L1：下一页业务触发机制只读调查

- 性质：只读调查。未访问目标网站，未发送任何请求，未启动浏览器，未运行 L1。
- 未修改：`src/`、`dist/`、`registry.json`、测试与验收标准、`outer-state-write`、`status-unstable`、`verified`、`throwOnSideEffect`。L1 样本 `l1-qccqcc-hangzhou` 仍为 `blocked`。
- 证据等级：翻页机制全部来自归档脚本的**静态分析**，没有运行证据。凡必须运行才能确认的内容，都列在第 10 节。
- 偏移说明：下文 `@数字` 是归档 `script.js` 的字符下标（255977 字符，256820 字节，SHA-256 `cc7a8127…f760daf`）。脚本是单行，下标即 CDP 列号。
- 分析产物在 TEMP，不在仓库证据目录：`C:/Users/Administrator/TEMP/opencode/l1-nextpage/`（`analyze-nextpage.mts`、`analysis.json`、`pager.txt`）和 `C:/Users/Administrator/TEMP/opencode/l1-clean1/`。

## 0. 结论摘要

1. 下一页是 jQuery 委托点击（`#page` 下的 `a`），经 `gotoPage` 执行 `history.pushState` 加 `$.qccAjax`，发一次 `POST GetPageList`。静态上看不会发生完整文档导航，脚本里也没有 `fetch(`。
2. 「解码器只在点击下一页后才触发」这个假设，静态上**不成立**：首屏列表在加载期已经走同一条 `init → gotoPage → qccAjax` 链。成立的更窄说法是：clean1 在页面加载完成后才开始捕获，只有再发生一次业务请求，捕获窗口里才会出现新的解码器调用。
3. hpailist-2 在 clean1 里有没有布置断点，**现有证据无法确认**。离线估算 high 门槛下约 101 个断点，clean1 全局实测 247 个，不能按脚本拆分。
4. 捕获启动后点击一次下一页，技术上可行。预计新增 1 次业务请求（POST），上限估计 3 次 HTTP 请求，均未经运行验证。
5. 即使点击产生了 hpailist-2 的记录，在方案 A、B 未实施的现有代码下，预期结果仍是 0 候选，L1 仍为 `blocked`。这次运行的价值是取得证据，不是通过。
6. 运行器有若干必须先改的问题，其中一处会把正常翻页误判为「文档切换」（第 8 节）。

## 1. clean1 回顾（本调查的起点）

| 项 | 事实 | 来源 |
| --- | --- | --- |
| 捕获窗口 | 195417 ms，捕获期间导航 0 次，前后同一 URL，`readyState=complete` | `raw-run.clean1.json` 的 `captureWindow` |
| 记录 | 19 条，全部在 `scriptId 83`（`combo?font…t=20261110`），函数为 `a`、`bH`、`dir`；来自 hpailist-2 的 0 条 | `steps.engineRaw` |
| Source Integrity | 未测量：`captureScriptId` 为空，两次源码读取都被跳过 | `p47-l1-ob-run.ts:249-253` |
| dry-run | 0 候选，拒绝 14 项，全部 `status-failed` | `steps.dryRun` |
| 断点 | 全局 247 个，没有按脚本拆分 | `steps.startCapture` |
| 命中 | 停止时 1544 次，约 8 次/秒持续增长；`waitStable` 在 180 s 内始终 `stable:false` | `steps.navigateTarget`、`steps.stopCapture` |
| 连接 | `connect` 步骤 CDP 超时 25 s，`discovery` 超时 12 s，运行器继续往下跑 | `steps.connect`、`steps.discovery` |
| 截断 | 2 条记录 `observationsTruncated=true`（`a` 544 次，一条 `bH` 543 次） | `engineRaw.captures` |

两点更正与提示：

- clean1 对目标页加载了 **2 次**：`Target.createTarget` 一次，我另加的 `Page.navigate` 又一次（`p47-l1-ob-run.ts:97`、`:175`）。后者是冗余的，是我的失误，预算要按 2 次计。
- `combo?font…` 包的 URL 参数从上一轮的 `t=20261026` 变成 `t=20261110`，说明站点在两次运行之间更新过该包。hpailist-2 的 URL 没变，但 clean1 没有测它的字节哈希，不能假定它仍与参考一致。

## 2. 下一页按钮的真实触发机制（静态）

| 环节 | 位置 | 行为 |
| --- | --- | --- |
| 首屏渲染 | `$.qccpager.init({node:'#page', postUrl:'/api/services/app/SearchFactory/GetPageList', …})` @254406，位于页面就绪回调 anon@251485-255975 内 | 加载期就调用，走下面同一条链 |
| `init` | @74470-74891 | 校验参数，`$.cookie('index', 0)`，调用 `gotoPage` |
| `gotoPage` | @75249-76523 | 读 cookie `index`；`index>0` 时 `history.pushState`（@75461-75469）；再 `$.qccAjax(postUrl, postData, success, {beforeFn})` |
| success 回调 | @75602-76345 内 | `data.Success` 时用 `#productlistTmpl` 渲染到 `#productlist`，写回 `pageCount`，调用 `paginationInit`，200 ms 后初始化懒加载图片，`$.cookie('index', ++index)`，最后调用 `param.callback` |
| `paginationInit` | @74907-75239 | 只在 `index==0`（首次渲染）时执行 `node.pagination({...})`；之后复用同一个分页实例 |
| 分页插件 | `$.fn.pagination` @74016，事件绑定在 @71000-74016 区间 | `$obj.off().on('click','a', …)`：在 `#page` 上委托点击 |
| 点击处理 | 同上 | 下一页：当前页已是末页则加 `disabled` 并 `return false`；否则目标页 = 当前页 + 1；然后 `filling(index)`，再调用 `opts.callback` |
| 回调 | @75157-75234 | `param.page = api.getCurrent(); obj.gotoPage(param)`，回到 `gotoPage` |

按钮 DOM（由插件模板推断，**未观察到真实 DOM**）：容器 `#page`；页码和翻页项都是 `a`，`href` 为 `javascript:;`，页码放在 `data-page`；当前页是带 `activeCls` 的 `span`；下一页按钮是带 `nextCls` 类的 `a`，内容是一个 ◇ 图标。`nextCls` 的默认值我没有读到（`defaults` 对象未检查），所以运行器不能写死类名。其他参数：`jump:false`、`coping:true`、`count:2`。

结论：下一页 = 委托点击，然后同文档 `pushState`，再 XHR（`$.qccAjax`）。脚本里 `fetch(` 为 0 处。

## 3. 是否发生完整文档导航

| 检查 | 结果 |
| --- | --- |
| `location.href` | 8 处：@149818 是 URL 解析工具读取 `document.location.href`；@242897 是以图搜图跳转；@250149、@250200、@250325、@250397、@250553 是搜索框；@250989 是图片上传后跳转。分页代码内为 0 |
| `history.` | 仅 1 处，即 @75461 的 `pushState` |
| `fetch(` | 0 |
| `hashchange` 或 `popstate` | 0 |
| 页码链接 | `href` 为 `javascript:;`，不会触发导航 |

静态结论：下一页走同文档导航，不是完整文档导航。

限制：只分析了 hpailist-2 一个脚本；`combo?font…`、`toolbar…` 等其他脚本没有分析，它们可能在 `#page` 上另绑处理器。没有任何运行证据。

**对运行器的直接后果**：

- `p47-l1-ob-run.ts:285` 用 `href` 前后是否相同来判定文档切换。`pushState` 会改地址栏，所以点击后会被误判为「文档切换」并抛错。
- 导航账本只监听 `Page.frameNavigated` 和 `Page.loadEventFired`（`:88-91`），没有监听 `Page.navigatedWithinDocument`。点击后账本看不到这次同文档导航。
- 我预期 CDP 对 `pushState` 发 `Page.navigatedWithinDocument`，而不发 `frameNavigated`。这一点没有在本环境验证过。

## 4. hpailist-2 与 `_0x374d` 的调用关系

| 事实 | 数值 | 来源 |
| --- | --- | --- |
| 参考调用点 | 823 个，812 组唯一参数，37 个别名；直接调用 `_0x374d` 的为 0 | `reference/call-sites.json` |
| 分页器区间内的调用点 | @74453-76524 内 **0 个**：分页器自身不调用解码器 | `analysis.json` 的 `pager.sites` |
| 位置分布 | 0-25k：42；25k-50k：484；50k-75k：297 | `sitesByBucket25k` |
| 请求链内的调用点（词法位置） | `_0x45d93a`@54563-66776：80；其 `success`@59584：58；`error`@62434：37；`_0x1af97e.[?]`@64501：24；`$.qccAjax`@66795-67748：16；合计 **215 个，占 26%** | `sitesByInnermostFn` |
| 顶层匿名函数 anon@20830-67750 | 379 个 | 同上 |

含义：

- `$.qccAjax`（@66795）把请求交给 `_0x45d93a`（@54563），这条 XHR 链的词法范围内有 215 个解码器调用点。点击触发的请求会经过这条链，所以点击**可能**产生新的解码器调用。这是静态推断，没有运行证据。
- 首屏渲染在加载期已经走过同一条链（见第 2 节 @254406）。所以解码器不是「只在点击后」才被调用。
- 词法位置不等于一定执行：`success` 与 `error` 回调只走其一，条件分支内的调用点不一定被执行。
- **与既有运行证据一致的推断（未证实）**：第一轮 L1 的 1054 条 `_0x374d` 记录，调用位置全是 `0:2288`，即外层包装对内层的尾调用。别名似乎绑定在外层函数上，所以业务调用都经过外层再尾调内层。如果成立，点击产生的调用位置也会是 `0:2288`，位置级对照仍然做不了。这正是方案 A 要解决的问题。

## 5. 断点覆盖

### 5.1 布置路径（代码事实）

| 路径 | 位置 | 覆盖范围 |
| --- | --- | --- |
| A：面板点击「开始捕获」 | `panel.ts:1516-1551` 遍历 `allCandidates`，发 `capture-start`；`background.ts:338-349` 调 `engine.start` | 只覆盖此刻**已发现候选**的脚本。候选来自 `handleScriptDiscovered`（`panel.ts:1188-1229`），要求源码已取回且分析完成 |
| B：`beforeScriptExecution` 插桩 | `cdp-client.ts:148-168`（开启）、`:286-299`（处理）；`background.ts:162-185`（脚本执行前布置） | 只覆盖**插桩开启之后**新解析的脚本；开启发生在 `background.ts:347`，晚于 `engine.start` |

页面加载完成后才开始捕获时，hpailist-2 只能依赖路径 A。

### 5.2 离线估算（不是实测）

用生产的 `discoverDecoders` 和 `computeCapturePlan` 对归档字节计算：

- 候选 251 个（high 33、medium 218），全部可布置，无 unsupported。
- high 门槛：101 个唯一断点位置；high 加 medium：665 个。
- `_0x374d` 有两个候选：medium 的外层入口 `0:299`，high 的内层入口 `0:368`。clean1 用 high 门槛，只会布内层。

### 5.3 clean1 实测与结论

全局 247 个断点，无法按脚本拆分。101 与 247 不矛盾，但不能证明 hpailist-2 被覆盖；`captureScriptId` 为空；hpailist-2 的记录为 0。结论：**无法确认**。

### 5.4 加载与布置之间的竞态（未证实）

- 运行器的 `waitForScripts`（`:205-216`）只检查面板脚本列表里有没有标题含 `hpailist-2` 的条目，不保证该脚本的候选已经分析完。
- 源码取回（`background.ts:228-238`）和分析（`panel.ts:1188-1229`）都是异步的，分析在面板主线程做，250 KB 脚本的 Babel 解析不轻。
- clean1 里 `connect` 的 `Runtime.evaluate` 超时 25 s、`discovery` 超时 12 s，之后 `waitForScripts` 又花 18.5 s 才看到列表。这与面板主线程繁忙相符，但这只是假设。
- 我没有核对脚本列表条目是在脚本解析时出现，还是在源码取回后才出现，所以也不知道「列表里有」是否意味着「候选已就绪」。

### 5.5 断点会不会在点击前失效

- 页面刷新或完整导航会触发 `Debugger.globalObjectCleared`，引擎 `softReset`，断点清空（`cdp-client.ts:70`、`background.ts:191-202`）。`pushState` 不换全局对象，所以推断不会触发。这一点未验证。
- 引擎自停条件：`maxHits=20000`、`maxRecords=2000`、`maxPending=100`。clean1 总命中 1544，距离上限很远。
- 风险点：`scriptId 83` 的 `a`、`bH`、`dir` 以约 8 次/秒持续命中，是持续的噪声来源，会让点击窗口里的暂停更密集。

## 6. 捕获启动后点击下一页的可行性

结论：技术上可行，前提是下面的闸门全部通过。

| 项 | 评估 |
| --- | --- |
| 点击方式 | 用 `Input.dispatchMouseEvent`（按下、抬起）点在按钮中心，走站点自己的委托处理器，不伪造 API。程序化 `.click()` 也走同一处理器，但不是真实点击，不优先 |
| 定位按钮 | 只读 DOM 查询 `#page a`，取文本、类名、`data-page`、`disabled`，再 `scrollIntoView`。滚动会改页面状态，但不发请求 |
| 前置条件 | 总页数大于 1、下一页按钮存在且未 `disabled`（该关键词的总页数未知，见第 10 节 U2）。不满足就中止，不改关键词，不点别的页码 |
| 文档身份 | 点击后 `location.href` 会变，必须改用 `performance.timeOrigin` 和 `loaderId` 判断是否同一文档 |
| 结算 | 不能再用 `waitStable`：scriptId 83 的持续命中让它永远不稳定。改为等 `GetPageList` 响应完成，再加固定尾部等待，并设硬上限 |
| 单次点击 | 只点一次；无响应则记录并停止，不重试，不点第二页 |

**这次点击不会单独解决的问题**：现有产品代码下，即使点击产生了 hpailist-2 的 `_0x374d` 记录，预期仍是 0 候选，原因是两项独立阻断都还在。

- 断点落在内层 `0:368`，调用位置只会是 `0:2288`，无法绑定到业务调用点（方案 A 未实施）。
- `outer-state-write` 仍然 blocking（方案 B 未实施）。

## 7. 预计请求数量与预算影响

| 项 | 数值 | 依据 |
| --- | --- | --- |
| 总预算 | 100 | 方案文档 |
| L1 报告记录 | 已用 13，剩 87 | `PHASE4.7-L1-QCCQCC-REPORT.md` 第 7 节 |
| clean1 | 目标页加载 2 次 | 运行器 `:97` 与 `:175`，是我从代码推出的，**没有写入任何台账文件** |
| 当前剩余 | 至多 85 | 87 减 2 |
| 台账计量单位 | 页面导航。基线记 1 个单位，同时列出 56 个网络请求，子资源没有逐个计数 | `devtools-baseline.json` |
| 下次运行：页面加载 | 1 | 去掉冗余的 `Page.navigate` |
| 下次运行：一次点击 | 1 次业务 POST；上限估计 3 次 HTTP（令牌 GET、OPTIONS 预检、POST）。基线首屏确有这三步，点击时是否重发令牌未验证 | `devtools-baseline.json` 的 `apiSequence` |
| 合计 | 按业务请求计 2；按 HTTP 请求计上限 4 | |
| 运行后剩余 | 按业务请求计 83；按 HTTP 请求计至少 81 | |
| 点击前中止 | 仅消耗页面加载 1 | |

需要你确认计数口径（见第 11 节）。下次运行建议由运行器用被动 `Network` 事件记录实际请求数（只记方法和 URL 路径，不记正文、请求头、cookie、GuestId），写入新的台账文件，不再靠估算。

## 8. 运行器与产品需要修改的位置

### 8.1 你要求评估的三项

| 项 | 评估 | 位置与做法 |
| --- | --- | --- |
| 1. connect 或 discovery 超时必须中止 | **同意**。clean1 已实证：两步都超时，运行器仍继续 | `p47-l1-ob-run.ts:201-202`。`step()` 会吞掉异常。增加严格步骤：`connect` 有 error，或状态文本（`rt-debugger-status`，已连接的文案见 `panel.ts:1078`）不是「已连接」，以及 `discovery` 返回 timeout 或 error，一律抛错并终止 |
| 2. Source Integrity 的 scriptId 来自面板脚本列表 | **同意**。clean1 因没有目标脚本的捕获记录而两次读取都被跳过 | `:249-253`、`:275`。经 SW 钩子调用 `debugger-list-scripts`（`background.ts:329-335`），按 URL 后缀取唯一匹配。0 个或多于 1 个匹配即中止；再与捕获记录的 scriptId 交叉核对，不一致就标记 |
| 3. 记录每个脚本的断点数 | **需要产品代码**，运行器目前只能读到全局总数 | 见 8.3 |

### 8.2 其他必须做的运行器改动

| 编号 | 位置 | 改动 |
| --- | --- | --- |
| R4 | `:97`、`:175` | 只保留 `createTarget` 的那次加载，删除 `Page.navigate`。初始文档身份用 `Page.getFrameTree` 的 `loaderId` 和 `performance.timeOrigin` 记录 |
| R5 | `:13` | 输出改为新文件名，且文件已存在就拒绝运行；运行前记录既有 `raw-run*.json` 的哈希，运行后核对未变 |
| R6 | `:88-91`、`:282-286` | 文档身份判据由 `href` 改为 `timeOrigin` 加 `loaderId`；账本增加 `Page.navigatedWithinDocument`。规则：捕获窗口内 `frameNavigated` 与 `loadEventFired` 为 0，同文档导航在点击后恰好 1 次，否则判失败 |
| R7 | `:237-243` | 删除 `waitStable(180000)`；改为「点击，再等 GetPageList 响应完成，再固定尾部等待（建议 10 s），硬上限 60 s」 |
| R8 | `:226` 之后 | 点击前闸门：页面响应（`1+1` 往返）、目标脚本断点数大于 0、`#page` 下一页按钮存在且未 `disabled`、文档身份未变、预算余量足够。任一不满足就不点击，记录原因并结束 |
| R9 | 新增 | 被动 `Network` 计数，记录点击窗口内的请求方法和 URL 路径 |
| R10 | `:249-253` 之后 | 若 hpailist-2 源码哈希与参考不一致，在点击**之前**结束，记为 `version-mismatch`，位置级指标 `n/a`，节省预算 |

### 8.3 产品代码改动（只读观测，需另行批准，本轮未改）

- `src/extension/debugger/capture-engine.ts`：`bps`（`:196`）按 `target.scriptId` 汇总，新增只读方法 `getBreakpointsByScript()`，参考 `getBreakpointCount`（`:245`）和 `bps.set`（`:348`）。
- `src/extension/background.ts:489-498`：`getCaptureState` 返回该汇总。
- 不改变捕获、验证、替换语义，不改 `throwOnSideEffect`。若不批准，R8 里「目标脚本断点数大于 0」的闸门无法执行，只能退回「全局断点数」这个弱闸门，这会削弱本次运行的意义。

### 8.4 测试

扩展 `test/p47-l1-run-order.test.ts`：

- 点击只出现一次，位于 `startCapture` 与 `stopCapture` 之间。
- 全文件无 `Page.reload`、无 `Page.navigate`（`createTarget` 之外）。
- 严格闸门字符串存在，且位于 `startCapture` 之前。
- 新增 `getBreakpointsByScript` 的单元测试。

## 9. 下一次 L1 推荐执行流程（待批准，不得自行启动）

0. 前置：用户批准；核算预算；确认无残留 Chrome、端口空闲；记录 `dist` 各文件哈希和既有 `raw-run*.json` 哈希；输出用新文件名且不覆盖。
1. 有窗口 Chrome，加载扩展，`createTarget(TARGET)` 一次，不再二次导航。
2. 等文档就绪，拒绝 `about:blank` 与 `chrome-error://`；记录初始文档身份。
3. 打开 DevTools，面板连接。严格闸门：状态为「已连接」，无超时。
4. 等面板可响应，经 SW 列出脚本，记录每个脚本的 scriptId、URL、长度，取 hpailist-2 的唯一匹配。
5. 读取 hpailist-2 源码，计算 SHA-256。与参考不一致就在点击前结束（R10）。
6. 启动 Runtime Capture（面板按钮）。
7. 读取每脚本断点数。hpailist-2 为 0 就中止，不点击。
8. 点击前闸门（R8）。
9. 真实点击下一页一次（`Input.dispatchMouseEvent`），不重试。
10. 等 `GetPageList` 响应完成，加固定尾部，硬上限 60 s。
11. 停止捕获；核对：同一文档、`frameNavigated` 为 0、同文档导航恰好 1 次。
12. 读引擎原始数据：记录、逐条 observations、稳定性、每脚本断点数。分析时凡 `observationsTruncated=true` 的记录一律标为不完整证据，不计入「完整观测」。
13. 再次读取同一 scriptId 的源码（应用前后），做 Source Integrity；执行 dry-run 与应用，记录候选与拒绝原因。
14. 写入新文件，记录哈希；`registry.json` 保持 `blocked`，等你审查后再决定。

硬性停止规则：任一闸门失败就立即结束，不自动重试，不重载页面；重跑需要重新批准。

预期结果（现有代码）：可能得到 hpailist-2 的 `_0x374d` 记录和 Source Integrity，但仍是 0 候选、`blocked`。

## 10. 尚未证实的假设

| 编号 | 假设 | 状态 |
| --- | --- | --- |
| U1 | `pushState` 触发 `Page.navigatedWithinDocument`，不触发 `frameNavigated` | 预期如此，未在本环境验证 |
| U2 | 该关键词总页数大于 1，下一页按钮存在且未 `disabled`；`nextCls` 的值未知 | 未验证，归档里没有真实 DOM |
| U3 | 点击后会在 hpailist-2 内产生解码器调用 | 仅有静态依据（请求链内 215 个调用点） |
| U4 | 别名绑定在外层函数上，点击产生的调用位置仍是 `0:2288` | 与第一轮 1054 条记录一致，未证实 |
| U5 | cookie `index` 读写正常，点击时 `index>0` 才会 `pushState` | 运行时才能确认 |
| U6 | clean1 里 hpailist-2 是否布置了断点 | 无法确认 |
| U7 | 竞态：脚本列表里有标题，但候选还没分析完 | 未证实；我没有核对列表条目的出现时机 |
| U8 | clean1 的 connect、discovery 超时源于面板主线程被大脚本分析占满 | 假设，与现象相符，无直接证据 |
| U9 | 点击时是否重发 `GetEncryptedAccessToken`（@241368 附近条件判断用 `accessToken`，赋值用 `AccessToken`，片段被截断，未读全） | 未验证，影响请求数估计 |
| U10 | 其他脚本（`combo?font…`、`toolbar…`）没有在 `#page` 上另绑处理器 | 未分析 |
| U11 | clean1 时 hpailist-2 的字节仍与参考一致 | 未测量；`combo?font` 包已变更，存在漂移迹象 |
| U12 | 被动 `Network.enable` 作为第二个 CDP 客户端，与扩展自己的 `chrome.debugger` 共存无问题 | 预期无问题，需在下次运行里观察 |
| U13 | 持续命中的 scriptId 83 噪声（约 8 次/秒）不会让点击窗口里的页面卡死 | 未验证；第一轮曾有一次页面无响应，原因未复现、根因不明 |

## 11. 需要你决定

1. **预算计数口径**：按业务请求计（下次约 2 个单位），还是按 HTTP 请求计（上限约 4 个）。另外是否同意建立台账文件，把 clean1 的 2 次加载补记进去（剩余至多 85）。
2. **是否批准 8.3 的只读观测改动**（`getBreakpointsByScript`）。不批准的话，点击前闸门只能用全局断点数，很弱。
3. **运行顺序**：先按本方案跑一次点击 L1 取证据（预期仍是 `blocked`），还是先实施方案 A、B 再跑。
4. **无下一页按钮时的处理**：我建议直接中止，不改关键词，不点页码。
5. **哈希不一致时**：我建议在点击前结束，记为 `version-mismatch`。

## 12. 停止状态

- 本报告只读调查完成，未运行 L1，未访问目标网站，未修改产品代码、`registry.json` 和验收标准。
- 所有结论中的运行时行为均为推断，已在第 10 节逐项列出。
- 等待你审查并批准后，才会实施第 8 节的改动和第 9 节的运行。
