# OB-Recover 刷新后调试卡顿：诊断报告（修复前）

日期：2026-11-09

## 0. 先读这个：范围与边界

- 本报告只做诊断，没有修改任何扩展源码，所以没有修复后的数据，第 6 节只有修复前数据。
- 测量方式：用 Extensions.loadUnpacked 加载真实构建的扩展，在 service worker 里读事件、包装 chrome.debugger.sendCommand 记录耗时；另用一个浏览器级 CDP 会话充当 DevTools 观察者；面板侧是把真实构建的 panel.js 放进普通页面，桩掉 chrome.* 后灌入消息。
- 没有在真实 DevTools 界面里复现卡顿。观察会话和面板桩都不包含 DevTools 自身渲染 paused/resumed 事件的开销，这部分没有测量。
- 测试页面是本地生成的：3 个各 100KB 的填充脚本加 1 个解码脚本（200 次调用）。没有使用真实网站，没有修改任何 OB 样本。
- 全量单元测试没有在本任务里重跑（本任务没有改源码，只新增了测量脚本）。本任务开始时 vite build 通过；最近一次全量 vitest 结果是 Phase 3.1 报告里的 234 通过、3 跳过，不是本次新跑的。

## 1. 实际根因（按证据强弱分级）

### 已用数据确认

1. 插桩暂停里同步分析整个脚本，阻塞页面和 service worker。
   - 位置：background.ts 的 onInstrumentation（约 92 行起）：getScriptSource，然后 discoverDecoders，然后 parseCode，然后 computeCapturePlan，然后逐个 await 设断点。每个脚本执行前页面都停在这里，没有按内容缓存，每次刷新全部重做；分析结果对不含解码函数的填充脚本也不复用。
   - 数据：捕获开启时，100KB 脚本的插桩暂停约 380-420ms；连接但未开始捕获时平均 1.8ms。Node 下同样 100KB 的 parse 约 40ms、discover 约 135ms。
   - 我没有把 getScriptSource、discoverDecoders、parseCode 在 service worker 里各自占多少逐项拆开，所以耗时主要在分析是根据上面的对比和时间线推断的，不是逐项测量的结论。
2. 停止可以被插桩任务复活。
   - 位置：capture-engine.ts 的 start() 无条件把 active 置 true（约 161 行）；onInstrumentation 在 await getScriptSource 之后才调用 start()，期间 stop() 可能已经完成。
   - 数据（S8）：在解码脚本的插桩暂停里触发 capture-stop，时间线里 stop 调用与 resolved 都在 +1465ms，随后 +1468 到 +1470ms 又出现 3 次 Debugger.setBreakpoint；结束时引擎 active=true、bps=3，触发次数从 1000 增到 1200。
3. 面板在捕获进行中刷新时不清理，候选和脚本越积越多。
   - 位置：panel.ts 约 1519-1521，清理条件是 resetReason 以 page 开头并且引擎已停止（!ev.active）。捕获中刷新时 softReset 保留 active，所以永远不清。
   - 数据（面板桩，每次刷新前先发 2 条带 resetReason 且 active=true 的 capture-state）：5 次刷新后候选 1 变 5，脚本 4 变 20。
4. 面板在 UI 线程同步重新分析每个脚本。
   - 位置：panel.ts 约 1193，handleScriptDiscovered 里调用 discoverDecoders，没有按内容或 scriptId 去重；后台已经分析过同一份源码，等于重复一次。
   - 数据：每个 100KB 脚本 135-211ms，一次刷新 3 个脚本共 410-520ms，longtask 409-504ms 与之对应。

### 有迹象，但没有确认

5. 并发的插桩处理互相恢复对方的暂停。
   - 依据：cdp-client.ts 的 handleInstrumentation 每个暂停各自 resume，没有按暂停关联。快速刷新场景 S3、S6 里出现了 resume 报 Can only perform operation while paused，页面探测延迟 756-796ms；S3 刷新后引擎 active、bps=3，但触发 0 次。
   - 我没有从时间线里直接看到某次 resume 提前放行了解码脚本的暂停，所以这条只是怀疑，S3 触发 0 次的具体原因没有查清。
6. 每次解码调用约 3 对 paused/resumed 事件推送给所有已附加的客户端。
   - 数据：观察会话在 S2 收到 1218 对事件（400 个 step，800 个断点命中）。
   - 它对真实 DevTools 界面的影响没有测量，所以不能说它就是 DevTools 卡顿的位置。

## 2. 复现步骤

- 脚本：scripts/refresh-perf.ts（扩展与观察会话，环境变量 ONLY 选场景、TRACE 输出时间线），scripts/panel-perf.ts（面板桩，MODE=active 为捕获中刷新模式）。
- 构建：npx vite build，然后 ONLY=B0,B0o,B1,S2 npx tsx scripts/refresh-perf.ts 等。
- 原始结果：test/acceptance/refresh-perf-before-*.json、panel-perf-before.json、panel-perf-before-active.json。

## 3. 相关代码文件和函数

- src/extension/background.ts：onInstrumentation、onReset 钩子、capture-start 与 capture-stop 命令。
- src/extension/debugger/cdp-client.ts：事件分发、handleInstrumentation（每个暂停各自 resume）、对 executionContextsCleared 的处理。
- src/extension/debugger/capture-engine.ts：start()、stop()、softReset()、handle()。
- src/extension/devtools/panel.ts：handleScriptDiscovered、handleCaptureState、renderCaptureList。

## 4. 事件执行顺序（从时间线读到的）

- 一次刷新到达两次 Runtime.executionContextsCleared（相邻几毫秒）再到一次 executionContextCreated。每次都触发一次 onReset 和一次完整 capture-state。
- 之后每个脚本依次产生 scriptParsed，随后 Debugger.paused（instrumentation），background 取源码并分析，最后 resume。分析期间时间戳全部后移，例如 sid=4 从 +41ms 暂停到 +421ms 才 resume。
- 捕获开启并刷新时，大量事件在 service worker 事件循环被阻塞的间隙里排队，SW 事件循环最大卡顿约 360-424ms。

## 5. 卡顿发生的具体位置

- 页面加载：每个 100KB 脚本在插桩暂停里停约 380-420ms。
- service worker：同一时间事件循环被分析占住。
- DevTools 面板主线程：每次刷新约 410-520ms 的连续阻塞，加上每次 capture-state 渲染 300 张卡片约 48-127ms。
- 真实 DevTools 界面：未测量。

## 6. 修复前性能数据

| 场景 | 加载耗时 | 说明 |
|---|---|---|
| B0 无调试器 | 17-74ms | 无暂停 |
| B0o 仅观察会话 | 62-63ms | 无暂停 |
| B1 扩展已连接未捕获 | 约 84ms | 21 次插桩暂停，平均 1.8ms，无失效 scriptId 命令；script-discovered 三次加载共约 939KB |
| S2 捕获开启，加载与刷新 | 1789ms 与 1855ms | 18 次插桩暂停平均 143.6ms、最大 453.1ms、累计 2584ms；SW 最大卡顿 423.6ms；探测最大延迟 475ms；观察会话收到 1218 对 paused/resumed |
| S3 立即刷新（150ms 后） | 1671ms | 探测最大延迟 796ms；1 条 resume 报 while paused；触发 0 次，引擎 active bps=3 |
| S5 停止后刷新 | 68ms | stop 耗时 2ms；停止后断点 0；刷新期间无断点暂停 |
| S5b 刷新与停止并发 | 77ms | stop 耗时 7ms；停止后断点 0 |
| S6 连续刷新两次 | 1632ms | 探测最大延迟 756ms；resume 最大 442ms；1 条 resume 报 while paused |
| S7 停止、重启、再加载 | 1686ms、76ms、1701ms | 重新开始后可再次捕获（触发 800 增到 1000） |
| S8 在解码脚本插桩时 stop | 1699ms | stop 后引擎被复活，active=true bps=3，触发再增 200 |

面板桩（真实构建 panel.js，不含 DevTools 渲染）：

- 每个 100KB 脚本的 script-discovered 处理 135-211ms；解码脚本 3-12ms；一次刷新合计 410-520ms。
- 300 条记录的 capture-state（约 196KB）：处理几乎 0ms，含渲染 48-127ms；300 张卡片。
- 捕获中刷新 5 次：候选 1 到 5，脚本 4 到 20；longtask 50-504ms。

## 7. 用户断点保护验证

- S4：观察会话用 Debugger.setBreakpointByUrl 设了用户断点，命中后 1500ms 内没有任何 resumed 事件（插件没有恢复它）；暂停期间引擎仍 active、bps=3（插件自己的断点没有被清）；暂停时刷新，用户断点再次命中；手动 resume 后页面完成。
- 限制：用户断点来自 CDP 观察会话，不是真实 DevTools 界面；与插件断点不在同一位置，同位置重叠的情况没有覆盖。

## 8. 各场景汇总（任务第三节）

- 1 不启动捕获连续刷新：不卡顿，无意外暂停。
- 2 捕获运行后刷新（S2）：卡顿（约 1.8s 加载），无意外暂停，页面恢复。
- 3 捕获后立即刷新（S3）：卡顿加一条 resume 报错，捕获 0 次，原因未确认。
- 4 用户断点后刷新（S4）：用户断点保留，未被恢复。
- 5 Stop 后刷新（S5、S5b）：不卡顿，插件断点清理完成。
- 6 连续刷新（S6）：卡顿，一条 resume 报错。
- 7 刷新后重新启动（S7）：可重新工作。
- 旧 scriptId 命令：所有场景里 stale 命令计数为 0，但这个检测依赖事件到达顺序，不能排除旧任务设断点。
- 未结束的异步任务：inflight 在各场景结束时为 0，但这不覆盖 S8 那种停止后又被复活的情况。

## 9. 建议修复方案（尚未实施，等待确认）

1. 页面生命周期令牌：对 executionContextsCleared 去重（同一次刷新的两次只算一次），每次刷新递增代数；insturmentation 任务和 start() 在每个 await 之后核对代数与 stop 令牌，过期就放弃，不再设断点。
2. 停止令牌：stop 使在途的插桩任务失效；start() 不再无条件置 active。
3. 插桩暂停串行化：按 tab 排队，每个暂停只 resume 自己，避免互相放行。
4. 分析缓存：按源码哈希缓存 discoverDecoders 结果和捕获计划，同一内容刷新后不重做；首次分析仍会阻塞，需要另行决定是否限制体积或接受首次成本。
5. 面板：按 scriptId 与哈希去重，导航时无论是否 active 都清旧候选，不再同步重复分析后台已分析的内容；capture-state 改为增量，渲染做节流。
6. 以上修改都需要在同样的 S2 到 S8 场景和面板桩下重测，并补单元测试；修改前请确认。

## 10. 尚未解决的问题

- 真实 DevTools 界面里的卡顿没有复现，不能证明上面哪一项是用户看到卡顿的主因。
- S3 触发 0 次的原因没有查清。
- 并发插桩处理互相恢复的假设没有证实。
- 面板自己监听 network.onRequestFinished 并每次 saveScriptsToCache 整体写 storage 的路径没有测。
- 用户断点与插件断点在同一位置重叠的情况没有测。
- 全量单元测试本次未重跑。
