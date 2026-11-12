# OB-Recover 面板 UI 重构：补充验收报告

日期：2026-11-09

## 0. 先读这个：三类环境，不能混用

本报告的每一项都标注了环境，三类结果不能互相替代：

- **真实 DevTools 环境**：用 `Target.openDevTools` 打开真实 DevTools 前端（`devtools://devtools/bundled/devtools_app.html`），面板是真实的 `panel.html` iframe，后台是真实 service worker 和真实 `chrome.debugger`。面板通过 `InspectorView.showPanel` 程序化切换，不是鼠标点击标签；按钮用 `element.click()` 触发。**不是人工操作面板。**
- **桩环境**：把真实构建的 `panel.html` / `panel.js` 放进普通 headless Chrome 页面，桩掉 `chrome.*` 后灌入消息。只能证明面板逻辑，不能证明扩展集成。
- **未完成**：没有拿到可用的结果，不按通过处理。

没有做的：人工用鼠标操作真实 DevTools 面板、真实用户手势下的原生悬停气泡、真实剪贴板读回。

## 1. 修改与新增文件

修改：
- `src/extension/devtools/panel.html`：重排布局，原有 id 全部保留
- `src/extension/devtools/panel.ts`：新增 layout import；删除被抽屉取代的转换报告拖拽代码
- `vite.config.ts`：复制 `panel-layout.css`

新增：
- `src/extension/devtools/layout.ts`：文件栏折叠、编辑器布局切换、同步滚动、底部抽屉、报告筛选、响应式
- `src/extension/devtools/panel-layout.css`：布局层样式
- `scripts/panel-layout-check.ts`：桩环境布局和交互检查
- `scripts/pixel-corner-check.ts`：桩环境像素采样（含对照组）
- `scripts/devtools-probe.ts` 到 `devtools-probe6.ts`：真实 DevTools 探测
- `scripts/devtools-real-1.ts` 到 `devtools-real-5.ts`：真实面板功能补测

原始结果：
- `test/acceptance/layout-check.json`
- `test/acceptance/pixel-corner-check.json`
- `test/acceptance/devtools-probe*.json`
- `test/acceptance/devtools-real-*.json`
- 截图：`test/acceptance/layout-screens/`（含 `real-panel-frontend.png`、`pixel-fixed-800x600.png`、`pixel-control-corner-rule-removed-800x600.png`）

## 2. 补充验收逐项结果

### 1. 800×600 编辑器右下角白色方块：已修复（桩环境已采样，真实面板已采样）

桩环境，800×600，双滚动条交汇处各 100 像素：

| 版本 | 位置 | 近白像素（通道 ≥200） | 最小通道 |
|---|---|---|---|
| 修复版 | 原始编辑器右下角 | 0 / 100 | 30 |
| 修复版 | 还原编辑器右下角 | 0 / 100 | 30 |
| 对照组（删掉 scrollbar-corner 规则） | 原始编辑器右下角 | 100 / 100 | 255 |
| 对照组 | 还原编辑器右下角 | 100 / 100 | 255 |

对照组能检出白块，说明采样方法有效。真实 DevTools 面板（右侧停靠，面板 554×844，代码区双滚动条）从 DevTools 前端整页截图裁出面板区域后采样：右下角 100 像素近白 0，最小通道 30。**该项通过。**

限制：真实面板采样是在 headless DevTools 里做的，不是人工看到的结果。

### 2. 右键求值和「加入映射」：求值通过，「加入映射」未生效（以下为修复前记录，已在第 8.1 节修复并复测）

真实 DevTools 面板，加载本地 `ctx-test.js`（含 `_0xabc(1)`）：

- 选中 `_0xabc(1)` 后派发 `contextmenu`，菜单可见。**注意：这是 DOM 事件，不是真实鼠标右键输入。**
- 点「求值选中表达式」后浮层可见，内容为 `_0xabc(1) string val1`，出现「加入映射」按钮。求值走真实的 `chrome.devtools.inspectedWindow.eval`，**求值通过**。
- 点「加入映射」后状态显示「✅ 映射已加入，0 处已还原」，但还原代码里 `_0xabc(1)` 仍出现 1 次，`'val1'` 出现 0 次。**实际替换没有发生，该项不通过**，原因未查。这是现有功能，不是布局改动引入的。

### 3. 复制到剪贴板：写入成功，读回被阻止，内容一致性未验证

真实 DevTools 面板：

- `navigator.clipboard.writeText('__probe__')` 返回 `ok`，写入 API 可用。
- 授予剪贴板权限后，`navigator.clipboard.readText()` 仍报 `NotAllowedError: ... blocked because of a permissions policy applied to the current document`。
- 因此无法读回复制内容，无法确认两个复制按钮写入的是原文/还原代码。**该项部分完成，内容一致性未验证。**

### 4. 捕获卡片展开：桩环境通过，真实面板未完成（以下为修复前记录，已在第 8.2 节排查；其中「无头 DevTools 的 rAF 行为不可靠」的说法已更正）

桩环境（真实构建 panel.js，桩掉 chrome.*，灌入 30 条捕获记录）：4 个尺寸都渲染 30 张卡片；点第一张卡片头部后 `open=true`，卡片体高度 190–212px；再点一次 `open=false`，高度 0。**卡片展开逻辑通过。**

真实 DevTools 面板：

- `devtools-real-4`：引擎 `success=5`、`hits=6`，但面板卡片 0 条。
- `devtools-real-5`：这次引擎 `breakpoints=0`、`hits=0`、`captures=0`，面板卡片 0 条；捕获开始后，面板 iframe 里 `requestAnimationFrame` 在 2 秒内没有触发（捕获前是 `fired`）。
- 无法区分是引擎没有记录，还是面板的 rAF 渲染没有跑。无头 DevTools 的 rAF 行为不可靠，**不能据此判定真实用户界面也有问题**。
- **该项在真实面板未完成。**

### 5. 拖拽分隔条：通过（CDP 真实鼠标事件）

真实 DevTools 面板，底部停靠，面板 1898×219，用 `Input.dispatchMouseEvent` 发送真实鼠标按下、移动、抬起：

- 文件栏拖拽条：220px → 317px。
- 双编辑器拖拽条：原始/还原 786/786 → 623/949。
- 抽屉拖拽条：抽屉高度 139px → 149px（受 `max-height` 限制，增幅较小）。

**该项通过**，但拖拽条仍然只是可选功能，不用它也能正常使用布局。

### 6. 状态栏悬停全文：`title` 属性通过，原生气泡未验证

真实 DevTools 面板：状态栏文本与 `title` 完全相等（`equal=true`）。`layout.ts` 在状态文字变化时同步写入 `title`。

**只验证了属性设置**；无头环境没有渲染原生悬停气泡，视觉上的悬停效果未验证。

### 7. localStorage 在真实 DevTools 面板环境：通过

真实 DevTools 的 `panel.html` iframe 里：

- `localStorage.setItem/getItem/removeItem` 正常。
- 在面板里点一次布局按钮后，`ob_recover_layout_v1` 写入了 `{"sidebar":"auto","mode":"row","sync":true,"dockOpen":false,"dockPane":"runtime","dockHeight":null}`。
- 面板视口 554×844 时布局为 `sm` + `col`，与断点规则一致。

**该项通过。**

### 8. 真实 Chrome DevTools 扩展环境检查：部分完成

已做到：

- 真实 DevTools 前端打开；`devtools.html` iframe 出现，里面 `chrome.devtools`、`chrome.devtools.panels` 存在，`inspectedWindow.tabId` 可读。
- `InspectorView` 的标签 id 列表里存在 `chrome-extension://<id>OB-Recover`，说明面板已注册。
- 程序化 `showPanel` 后真实 `panel.html` iframe 创建，`sandbox.html` 也创建。
- 在真实面板里点「连接」：调试器显示「已连接」，Runtime「已启用」，日志出现「已启用 beforeScriptExecution 插桩断点」和「执行上下文已创建」。这是真实后台和真实 `chrome.debugger`，不是模拟事件。
- 真实页面的脚本通过真实的 `chrome.devtools.network` 监听进入面板（重载后状态「捕获: capture-ext.js」）。

未做到：

- 没有用鼠标点击 DevTools 的 OB-Recover 标签（用 `showPanel` 程序化切换）。
- 没有人工操作面板。
- 捕获卡片在真实面板里没有成功显示（见第 4 项）。
- 「加入映射」未生效（见第 2 项）。
- 剪贴板读回被阻止（见第 3 项）。

## 3. 布局与响应式结果（桩环境）

四档尺寸，`layout-check.json`，pageErrors=0、consoleErrors=0，均无整页横向溢出：

| 尺寸 | 默认编辑区占主区域 | 抽屉展开后 | 抽屉展开后布局 | 工具栏/状态栏/抽屉标签溢出 |
|---|---|---|---|---|
| 1842×780 | 88% | 65% | 左右 | 无 |
| 1200×700 | 87% | 64% | 左右 | 无 |
| 800×600 | 84% | 61% | 左右 | 无 |
| 500×600 | 84% | 61% | 单栏 | 无 |

- 抽屉展开后按扣掉工具栏和状态栏的可用高度算是 69%–71%，按整个主区域算是 61%–65%，两种口径都达到 60%。
- 500×600 默认是上下布局，两个编辑器都可见；展开抽屉后自动切单栏，避免每个编辑器只剩几行。
- 连续缩放不重载可自适应；1200×450 时抽屉自动折叠。
- 左侧文件栏默认 220px，宽度 ≥1100 默认展开；小尺寸是带遮罩的覆盖层，点遮罩可关闭（500 宽下用 CDP 鼠标事件验证）。

## 4. 功能回归结果

- 文件加载（真实网络监听）、原始代码显示、还原显示：通过。
- 还原：真实面板 `big.js` 显示「完成 (2642ms) — 223 处已还原」。
- 搜索：桩环境 `1/111`，高亮和计数正常。
- 同步滚动：桩环境测试通过（400 → 400）。
- 布局切换：自动/左右/上下/单栏四档循环正常。
- 重置布局：恢复到默认状态。
- 复制按钮：启用状态正常；内容一致性未验证。
- Runtime 连接/断开/恢复：模拟事件下消息正常；真实连接「已连接」已验证；断开/恢复的真实点击未单独验证。
- Decoder Discovery：真实面板日志出现「分析完成」，候选计数正常。
- 转换报告：渲染、搜索、范围筛选（桩环境，含跨范围 0 结果用例）通过。
- 捕获卡片：桩环境正常；真实面板未完成。

## 5. 测试与构建

- `vite build`：通过。最近一次输出 `built in 9.52s`，静态文件复制成功。
- `vitest run`：23 个文件，234 通过，3 跳过（237）。与改动前基线一致。
- `tsc`：`layout.ts` 在文件列表里，0 个错误；`panel.ts` 只有历史噪音（缺少 chrome 类型、HTMLCollection 迭代器），没有新增错误类型。tsc 总错误数 185 行，没有改动前的总数可对比，不能声称总数未增加。

## 6. 尚未解决的问题（修复前记录；第 1、2 项见第 8 节）

1. 「加入映射」在真实面板里不生效：状态提示成功，但还原代码没有变化。
2. 真实面板捕获卡片 0 条：一次引擎成功 5 次仍无卡片，一次引擎断点 0；捕获开始后面板 rAF 停止触发。原因未确认，不能判定是面板缺陷还是无头 DevTools 限制。
3. 剪贴板读回被 DevTools 的 permissions policy 阻止，复制内容无法验证。
4. 原生悬停气泡、真实用户鼠标点击标签、人工操作面板均未验证。
5. 面板在真实 DevTools 底部停靠时只有 219px 高，代码区没有滚动条，该尺寸下的布局表现没有单独评估。

## 7. 边界

- 本阶段只做 UI/UX 和布局重构及补充验收，没有修改 Runtime Capture 的断点逻辑、CDP 生命周期或解码算法。
- 没有进入 Phase 4，没有实现 AST 替换。
- 没有删除或弱化任何现有测试；新增的捕获卡片展开断言加在桩环境检查脚本里。

## 8. 遗留问题修复与验收（第二轮，2026-11-09）

本节的「真实 DevTools」均为无头 Chrome 155 + 真实 DevTools 前端 + 真实 service worker：面板用 `InspectorView.showPanel` 程序化切换，按钮用 `element.click()`，contextmenu 是派发的 DOM 事件。**没有人工鼠标操作。**

### 8.1 问题 1「加入映射」不生效：已修复

调用链：
1. 右键求值：`panel.ts` 的 `ctxEval` 经 `chrome.devtools.inspectedWindow.eval` 求值，结果存入 `lastEvalResult`（expr / value / type）。
2. 加入映射：构造 `{[expr]: {callText, value, type:'string', confidence:'manual', source:'runtime-capture'}}`，用 `callSandbox('recover', {code: activeScript.source, externalMappings})` 发给 sandbox。
3. `sandbox.ts` 把 `externalMappings` 交给 `recover()`，进入 `MappingManager.import`。
4. `pipeline.ts` 调 `transformCalls(ast, code, decoders, manager.export())` 做 AST 替换，结果回到面板更新还原栏。

根因（映射数据的传递本身没有问题）：
- `call-transformer.ts`：访问 CallExpression 的第一步是「callee 必须是检测到的 OB 解码器，否则直接 return」，之后才按调用原文查映射。测试脚本里的 `_0xabc` 是普通函数，没有字符串数组，`detectDecoders` 返回空，手动映射永远没有机会命中。
- `panel.ts`：成功提示用 `stats.resolvedCalls`，它是全部转换（含死代码、常量折叠等）的总数，不是这条映射的命中数，而且没有命中检查，所以替换 0 处也提示成功。

修复（最小范围）：
- `src/core/call-transformer.ts`：先按调用原文查映射。已知解码器调用保持原有确定性检查；非解码器调用只有存在显式映射、且参数全是字面量时才替换，所以 `_0xabc(k)` 这类带变量的调用不会被替换。
- `src/extension/devtools/panel.ts`：按 `runtime-capture` 来源的转换数量统计命中；命中为 0 时提示「映射未生效」，不改写还原栏、不写缓存；成功时提示「expr 已替换 N 处」；异步期间切换文件不会写错脚本。
- `src/core/pipeline.ts`：`resolvedCalls` 我中途改过又还原了，净改动为零。改过之后「还原」状态栏会从 223 变成 0，是我引入的回归；已在真实面板复测恢复为「223 处已还原」。

验证：
- Vitest（真实引擎，不含面板）：新增 `test/manual-mapping.test.ts` 5 条通过：替换数量准确、映射文本不存在时不替换、其他函数的同参数调用不受影响、含变量参数不替换、成员表达式内替换。
- 真实 DevTools（`devtools-real-2`，最终构建）：加入映射前还原栏 `_0xabc(1)` 2 处、双引号 `"val1"` 0 处；之后 0 处、2 处；`_0xabc(2)` 保持 1 处；原始栏 `_0xabc(1)` 前后都是 2 处；状态栏「映射已加入，_0xabc(1) 已替换 2 处」。

未验证 / 已知限制：
- 面板里「映射未生效」的失败分支没有被直接执行过，只有引擎侧「映射文本不存在则替换 0 处」的 Vitest 覆盖。
- 映射按选中文本与脚本源码做原文匹配。原始栏显示的是格式化后的代码，如果空白与真实源码不一致（例如选中 `_0xabc(1, "k")`，源码是 `_0xabc(1,"k")`），会匹配不到。现在会提示未生效，不再假成功，但没有做空白归一化（会扩大修改范围），也没有用压缩脚本在真实面板里测。

### 8.2 问题 2 捕获卡片不显示：数据链路和渲染都正常，无需改代码

| 环节 | 结果 | 证据（最终构建，真实 DevTools） |
|---|---|---|
| 后台产生捕获记录 | 是 | 经 SW 测试钩子读引擎：captures=5（diag）/ 10（real-5），hits=8 / 61 / 221 |
| 消息送达面板、状态更新 | 是 | 面板统计栏 hits/success 与引擎一致（8/8、61/61、221/221） |
| 卡片渲染函数 | 面板可见后执行 | diag：切回后卡片 5 = 引擎 captures 5；real-4：切回后卡片 10（该脚本未读引擎 captures） |
| rAF 停摆原因 | 面板被隐藏 | 捕获后 DevTools 选中标签是 `sources`；此时 `#app` clientHeight=0，祖先链各层高度均为 0；`showPanel` 切回后 rAF `fired` |

原因：捕获开始后，断点命中时 DevTools 前端被切到 Sources（捕获前选中的是 OB-Recover，捕获后是 `sources`，推断由暂停触发，没有做对照实验）。OB-Recover 面板被隐藏，隐藏期间 rAF 不触发，卡片列表不渲染；统计栏由每秒的定时器轮询更新，所以数字在涨而卡片是 0。面板重新可见后，原有的 rAF 渲染自己补上，没有任何兜底。

更正：第 4 节写的「无头 DevTools 的 rAF 行为不可靠」不准确，实际原因是面板被切走而隐藏。

关于定时器兜底：我中途给 `scheduleCapRender` 加过 250ms 定时器兜底，随后在去掉兜底的构建上验证了原 rAF 路径切回后即可显示，所以兜底已撤销，`scheduleCapRender` 恢复原样。问题 2 没有保留任何代码改动。

展开卡片（切回后，`devtools-real-4`）：`firstOpen` false→true，`bodyDisplay` none→block，`bodyH` 0→190，与桩环境的 190–212px 一致。

副作用（未改动）：捕获期间断点命中会让 DevTools 切到 Sources，用户需要手动切回 OB-Recover 才能看到卡片。这属于 Runtime Capture 的断点行为，按本轮约束没有动；是否需要处理（例如提示用户）由你决定。

未复现：原第 4 节 `real-5` 那次 `breakpoints=0`、`hits=0`、`captures=0` 的运行，本轮多次重跑均为 breakpoints=3、hits=61，没有复现。当时 `breakpointsSet=3` 而 `breakpoints=0`，与断点设置后被页面导航的 softReset 清掉相符，但这只是猜测，原因未确认。

### 8.3 测试与构建

- `vitest run`：24 个文件，239 通过，3 跳过（242）。基线是 23 个文件、234 通过、3 跳过（237），新增的 5 条来自 `manual-mapping.test.ts`。没有删除或放宽既有测试。`manual-mapping.test.ts` 里我曾写过两条依赖 `resolvedCalls` 的断言，还原 `pipeline.ts` 后删掉，那是我自己新增测试里的断言，不是既有测试；替换数量由按 `runtime-capture` 来源过滤的断言保证。
- `vite build`：通过。
- `tsc --noEmit`：`call-transformer.ts`、`pipeline.ts` 无错误。其余是既有环境问题：缺 `@types/node`（`call-transformer-acceptance.test.ts` 的 `'vm'` 同样报错）、`panel.ts` 缺 `chrome` 类型和 `HTMLCollection` 迭代器。`panel.ts` 没有新增错误类型；没有改动前的总数可对比，不能声称总数未增加。

### 8.4 测试类别汇总

- 真实 DevTools（无头 + 程序化操作）：加入映射端到端；捕获数据链路（引擎 → 消息 → 面板状态）；切回面板后的卡片渲染与展开。
- Vitest / 引擎侧：`manual-mapping` 5 条；全量 239 条。
- 未验证：人工鼠标右键和人工操作面板、有头真实 DevTools、面板「映射未生效」分支、格式化文本与源码空白不一致的情形、剪贴板读回（仍被 permissions policy 阻止）、悬停气泡、「暂停触发切到 Sources」的因果对照、原 `real-5` 那次 breakpoints=0。

人工测试步骤：
1. 加入映射：打开含 `function _0xabc(i){return 'val'+i}` 和多处 `_0xabc(1)` 调用的页面，打开 OB-Recover，点「还原」。在原始栏用鼠标选中 `_0xabc(1)`，右键「求值选中表达式」，确认显示 string val1，点「加入映射」。预期：状态栏显示「已替换 N 处」，还原栏里该调用变成 val1，`_0xabc(2)` 不变，原始栏不变。
2. 失败分支：在压缩脚本里选中格式化后带空格的表达式（如 `_0xabc(1, "k")`）加入映射。预期：提示「映射未生效」，还原栏不变，不出现成功提示。
3. 捕获卡片：打开含 OB 解码器的页面，打开 OB-Recover，点「连接」并刷新让 Decoder Discovery 发现候选，切到捕获标签，点「开始捕获」后刷新页面。页面运行时 DevTools 跳到 Sources 属预期，手动切回 OB-Recover。预期：卡片数与统计栏 hits 对应，点卡片能展开。如果切回后仍是 0 张，请把统计栏和日志截图发来。
