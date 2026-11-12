# OB-Recover Phase 3.1 验收报告：扩展集成与捕获稳定性

日期：2026-11-09

## 0. 先读这个：结论与边界

- 这是 **扩展真实后台路径** 的测试：用 Extensions.loadUnpacked 加载真实构建的扩展，在扩展 service worker 内通过真实的 chrome.debugger.attach / sendCommand 工作，并经 background 的 handlePanelCommand 发出 debugger-connect、capture-start、capture-stop、capture-clear。
- **不是人工鼠标操作 DevTools 面板。** 我无法在真实 DevTools 面板里点击，所以任务第五部分的十步面板操作、面板截图 **全部未验证**。面板的新增代码（门槛下拉框、不稳定计数、unstable 标记）只验证了构建通过。
- **没有面板截图。** 冲突脚本里尝试过截取测试页面，没有生成文件，不能当作证据。
- 真实 DevTools 面板打开时的调试器冲突 **未验证**。用浏览器级 CDP 会话开启 Debugger 域来模拟，没有阻止扩展 attach，所以这种模拟不构成冲突证据。
- 5 份样本仍是开源仓库样本，不是第三方网站脚本。本轮 **没有把 5 份样本放进扩展路径重跑**，样本结果沿用 PHASE3-REPORT.md 的原始 CDP 数据。
- 单元测试只证明逻辑，不代替上述集成测试。

## 1. 修改与新增文件

新增：
- src/core/capture-strategy.ts：high、medium、low 捕获策略
- test/capture-stability.test.ts（10 条）、test/decoder-misidentification.test.ts（3 条）
- test-pages/capture-ext.html|js、capture-ext-immediate.html|js、capture-stability.html|js
- scripts/extension-probe.ts 到 extension-probe5.ts（环境探针）、extension-integration.ts、extension-conflict.ts、coverage-report.ts
- test/acceptance/phase3-1-*.json（原始运行结果）

修改：
- src/extension/manifest.json：background 增加 type module（后台现在引入共享 chunk）
- src/extension/debugger/cdp-client.ts：attach 时启用 beforeScriptExecution 插桩断点；插桩暂停在 finally 中无条件 resume；detach 只移除本插件创建的插桩断点
- src/extension/debugger/capture-engine.ts：getStability、softReset、StabilityRecord
- src/extension/background.ts：onInstrumentation 钩子、每 tab 策略、导航时保留捕获意图、测试钩子 globalThis.__obRecoverTest、连接失败提示改为转述 Chrome 的真实错误
- src/extension/debugger/types.ts、src/extension/devtools/panel.ts|html|css
- src/core/decoder-discovery.ts：收紧索引偏移与数组下标规则（第 6 节）

## 2. 顶层立即执行脚本漏捕获

原因：扩展原来在 scriptParsed 之后才布置断点，脚本同步执行的解码调用已经发生。

方案：attach 时在 Debugger.enable 之后调用 Debugger.setInstrumentationBreakpoint（instrumentation 为 beforeScriptExecution）。收到 reason 为 instrumentation 的暂停时，background 用 data.scriptId 取源码，分析候选并布置断点，再由 cdp-client 的 finally 执行 resume。

扩展环境实测：
- chrome.debugger.sendCommand 支持该命令，返回 breakpointId（形如 8:beforeScriptExecution）。
- 页面 capture-ext-immediate 在脚本顶层同步调用解码函数。日志显示插桩在脚本执行前布置了 6 个断点（2 个候选），捕获到 decOne(256)、decOne(257)、decTwo(259,yBNh)，与页面结果一致。
- 页面全程没有卡死，停止后断点清空为 0，页面可应答。

实测中发现并修复的缺陷：页面导航触发 executionContextsCleared，引擎被 reset 成非激活，插桩钩子因 isActive 为 false 而什么都不做，捕获为 0。修复为：用户仍在捕获时只做 softReset（清旧断点，保留激活状态和已有记录）。softReset 只有扩展集成测试覆盖，没有单元测试。

其他已知前提：Chrome 155 下 --load-extension 命令行开关无效，必须用 Extensions.loadUnpacked；chrome.debugger 不能附加 file 协议页面，测试用本地 HTTP 服务。

## 3. high、medium、low 策略

- high：默认自动捕获。
- medium：capture-start 带 autoCaptureMinConfidence 为 medium 开启，面板有门槛下拉框（面板部分未手测）。
- low：默认不自动捕获；单元测试覆盖 manualTargets 手动选择与门槛设为 low 两种方式。面板里 **没有** 手动选择 low 候选的界面，只有后台与函数层支持。

扩展实测（capture-proto 页面）：high 模式布置 9 个断点（3 个候选），7 次触发、7 次成功；medium 模式布置 14 个断点（5 个候选），多捕获到 decUndef 与 decLoop，9 次触发、9 次成功。没有降低评分门槛。

## 4. 12 条预期调用的覆盖（capture-proto 页面，扩展路径，自动发现）

| 预期调用 | Phase 2 识别 | 置信度 | 断点 | 触发 | 返回值 | 漏在哪个环节 |
|---|---|---|---|---|---|---|
| decOne(256) | 是 | high | 是 | 是 | 是 | 无 |
| decOne(257) | 是 | high | 是 | 是 | 是 | 无 |
| decOne(264) | 是 | high | 是 | 是 | 是 | 无 |
| decTwo(259,yBNh) | 是 | high | 是 | 是 | 是 | 无 |
| decTwo(264,nk) | 是 | high | 是 | 是 | 是 | 无 |
| decThree(260,k,s) | 是 | high | 是 | 是 | 是 | 无 |
| decUndef(262) | 是 | medium | high 模式否，medium 模式是 | medium 模式是 | medium 模式是（undefined） | high 模式：被置信度门槛挡住 |
| decLoop(265,abc) | 是 | medium | high 模式否，medium 模式是 | medium 模式是 | medium 模式是 | high 模式：被置信度门槛挡住 |
| decNum(261) | 否 | 无 | 否 | 否 | 否 | 识别环节：无字符串数组访问 |
| decNull(263) | 否 | 无 | 否 | 否 | 否 | 识别环节 |
| decThrow(1) | 否 | 无 | 否 | 否 | 否 | 识别环节 |
| decNested(264,nk) | 否 | 无 | 否 | 否 | 否 | 识别环节：它调用其他解码器，自身没有数组访问 |

汇总：high 模式覆盖 6 条，medium 模式覆盖 8 条，其余 4 条在识别环节被漏掉。这 4 个函数不是字符串数组解码函数，Phase 2 不识别它们我认为是合理行为，我没有为了凑覆盖率放宽规则。它们只有在用户手动指定时才会被捕获：原始 CDP 的 ALL 模式（手动把全部函数设为目标）曾拿到全部 12 条与页面真值一致，但那不是自动发现的结果。

## 5. 稳定映射与不稳定映射

引擎的 getStability 按（脚本、函数位置、函数名、参数）分组。同一参数出现多个不同返回值就标 unstable，保留全部历史值，按首次出现的执行序号排序，不用最后一次覆盖之前的结果，判定不依赖时间戳。

扩展实测（capture-stability 页面，数组每轮旋转一次）：
- decode(256)：7 次调用，7 个不同返回值（Alice 到 Grace），unstable。
- decode(257)：6 次调用，6 个不同返回值，unstable。
- 稳定示例：capture-ext-immediate 页面中 decOne(256)、decOne(257)、decTwo(259,yBNh) 各自返回唯一值，stable。

限制：
- **unstable 只是被标记，Phase 4 的拒绝替换逻辑尚未存在**，这里没有做任何替换。
- stable 只表示本次运行内没有观察到变化，不能保证旋转已结束。样本 sample-03 在 60 秒内一直不稳定，原因未确认。
- 没有分析旋转对函数内部状态的影响，只记录了现象，不对原因下结论。

## 6. 误识别核对（ox、_doProcessBlock）

- sample-02 的 ox：读源码确认是 CRC32 更新函数（x ^= -1，循环里 x = (x >>> 8) ^ n[255 & (x ^ e[r])]）。它调用真正的解码函数，自己不解码。
- sample-04 的 _doProcessBlock：读到的结构为 80 轮循环、五个状态变量、两条并行计算线、对变量旋转 10 位，**判断**很像 RIPEMD-160 分块处理，我没有与标准实现逐行比对。它是按参数偏移取分块字，不是字符串数组。
- 原因：旧规则把参数 加减 任意表达式 都算索引偏移，把下标里含参数的任何访问都算字符串数组访问，导致两者各得 6 分达到 high。
- 修改：索引偏移必须是参数加减数值常量；数组下标只允许参数与常量的加减，或以参数为实参的调用。评分门槛未改。
- 先写了 test/decoder-misidentification.test.ts，修改前两条误判用例失败，修改后 3 条全部通过。
- 样本回归（静态扫描）：sample-02 高可信度由 2 个变为 1 个（保留 _0x0a9e）；sample-04 由 4 个变为 2 个（保留 _0x4698 与 _0x5ca5）；sample-03 由 3 个变为 2 个，保留两个 qt，U 被降级；sample-01、sample-05 不变。
- U 的判断依据：读了前约 50 行，是补位函数，含 switch 控制流扁平化，没有解码逻辑。后半段没有读完，属于大概率判断。
- 风险：规则收紧后，其他样本里的写法不同的真解码函数可能被降级。目前只在这 5 份样本和测试页面上核对过。

## 7. 调试器冲突

- 已验证：标签页已被另一个 chrome.debugger 客户端持有时，debugger-connect 状态为 error，错误是 Another debugger is already attached to the tab ...，并发给面板日志。capture-start 被拒绝，引擎没有被激活，没有伪造捕获成功。释放占用后可重新 attach。
- 未验证：真实 DevTools 面板打开时是否冲突。浏览器级 CDP 会话开启 Debugger 域没有阻止 attach，所以不能证明或否定。
- 提示文字：原先写成若 DevTools 自带调试器占用了连接，那是凭推测写的，已改为转述 Chrome 返回的错误并举例。
- 同一条错误会重复出现约 3 次，属于日志噪音。

## 8. 原始 CDP 与扩展路径对比

| 项目 | 原始 CDP（Phase 3 与 3.1 保留） | 扩展真实后台路径 |
|---|---|---|
| 参数与返回值捕获 | 通过（人工构造页面 12 条与真值一致，手动选择目标） | 通过（high 6 条、medium 8 条，自动选择） |
| 顶层立即执行 | 用插桩断点，样本测试中使用 | 通过，3 条无遗漏 |
| 停止后页面继续运行、断点清空 | 通过 | 通过 |
| 页面刷新中途捕获 | 通过（生命周期 S2） | 未单独测试，只验证了导航后重新布置断点 |
| 用户自己的断点与 debugger 语句 | 通过（生命周期 S3） | **未验证** |
| 5 份样本 | 已跑，见 PHASE3-REPORT.md | **未验证** |
| 清空后重新捕获 | 未测 | 通过（清空后记录为 0，重新开始并导航后 3 条再次捕获） |
| 调试器冲突 | 未测 | 互斥冲突通过，真实 DevTools 面板未验证 |

## 9. 测试与构建结果

- 全量 vitest：23 个文件，234 通过，3 跳过（跳过项是之前就标注尚未实现的，与本阶段无关）。
- vite build：通过。
- tsc：本阶段新增文件没有新增类型错误；仍有既有的类型噪音（缺少 chrome、node 类型声明，generator 的 indent，types 里重复的 passes 等），没有处理。
- 本阶段新增单元测试：capture-stability 10 条、decoder-misidentification 3 条。

## 10. 尚未解决与未验证

- 真实 DevTools 面板的手动操作（十步）与截图：未验证。
- 真实 DevTools 面板打开时的调试器冲突：未验证。
- 5 份样本在扩展路径下的运行：未验证。
- 用户自己的断点、页面自带 debugger 反调试在扩展路径下的行为：未验证；原始 CDP 下已验证引擎不恢复用户暂停。
- 数组旋转前后调用的区分：只有 capture-stability 页面的现象，没有对旋转本身建模，也没有自动区分旋转阶段与稳定阶段。
- 异步页面调用在扩展路径下只在 capture-ext 页面测过 1 次（延迟 3.5 秒后调用）。
- 引擎的 softReset 没有单元测试。
- 规则收紧的副作用只在 5 份样本和测试页面上核对过。
- 稳定性只做了标记，没有任何下游拒绝替换的保护，Phase 4 必须自己处理。
- sample-05 的 self-defending 与 sample-04 的 debugger 反调试，只在原始 CDP 下记录了实际行为，没有改动样本。
