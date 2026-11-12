# OB-Recover Phase 3 验收报告：Runtime Decoder Capture

日期：2026-11-09

## 0. 先读这个：结论与边界

- 所有真实浏览器测试走的是 **原始 CDP + headless Chrome 155**（脚本 `scripts/capture-*.ts|mjs`），驱动的是真实的 `discoverDecoders` / `computeCapturePlan` / `CaptureEngine`。**没有走 `chrome.debugger` 扩展环境。**
- **DevTools 已打开时的调试器冲突没有验证。** 引擎只提供 `capture-start` 前的连接状态检查和错误提示，没有在真实冲突场景下测过。
- **面板 Runtime Capture 界面没有在真实浏览器里手动操作过**，只验证了构建通过。
- 5 份样本全部来自开源仓库 `kuizuo/js-deobfuscator` 的 `example` 目录。其中猫眼、拼多多等是仓库自己的说明，我无法核实，**不能称为第三方网站实际脚本样本**。没有任何一份是我从第三方网站抓取的。
- 样本没有页面输出作为真值。表中的 success 只表示读到了 `returnValue`，**不代表值正确**。只有人工构造的测试页面（`capture-proto`）有真值对照。
- 同一参数在数组旋转期间会返回不同值。**Phase 4 不能直接按 参数 到 返回值 建映射。**

## 1. 修改与新增文件

新增：
- `src/core/capture-plan.ts`：AST 计算断点位置（入口、return、右花括号）
- `src/extension/debugger/capture-engine.ts`：捕获引擎，与 chrome.debugger 解耦，通过注入的 send 发 CDP 命令
- `test/capture-plan.test.ts`、`test/capture-engine.test.ts`
- `test-pages/capture-proto.{html,js}`、`test-pages/capture-life.{html,js}`
- `scripts/capture-proto.mjs`、`scripts/capture-e2e.ts`、`scripts/capture-lifecycle.ts`、`scripts/capture-samples.ts`、`scripts/sample-static-scan.ts`
- `test/acceptance/phase3-*.json`（原始运行结果）

修改：
- `src/extension/debugger/cdp-client.ts`：暂停归属钩子；页面刷新信号同时监听 `Debugger.globalObjectCleared` 和 `Runtime.executionContextsCleared`；断开时重置
- `src/extension/debugger/types.ts`、`src/extension/background.ts`：capture 命令与状态消息、每 tab 一个引擎、tab 关闭清理、刷新清理脚本收集器
- `src/extension/devtools/panel.{ts,html,css}`：Runtime Capture 区域（渲染一律用 textContent）
- `src/core/decoder-discovery.ts`：去掉未用的 NodePath 导入；性能修复（见第 9 节）
- `test-pages/cdp-test.html`（上一轮已改）

## 2. 模块架构

面板用 Phase 2 候选（仅高可信度）计算 CapturePlan，经 port 发给 background，background 的 CaptureEngine 通过 cdp-client 的 sendCommand 下断点。cdp-client 的 Debugger.paused 先问引擎是否归属，归属则由引擎处理，不转发给面板，否则原样转发。

## 3. 断点设置机制

- 入口断点：函数体第一条语句的位置（空函数体取右花括号）。早期版本取函数节点起点，对 `var f = function(){}` 形式只会在定义时命中一次，已在 sample-02 上发现并修复。
- return 断点：函数自身的每个 return 语句（不含嵌套函数）。
- 右花括号断点：用于隐式返回。V8 会把它对齐到 return 完成点（例如 4:19）。
- 同一位置只能设一个断点：入口和 return 重合时合并成 `both`（单语句函数会出现）。
- 去重：同一脚本、函数、位置不重复设置。
- 只移除自己创建的断点，不动用户断点。stop 后仍可能到达的暂停，因命中已移除断点而被识别为自己的并恢复。
- 看门狗：自己造成的暂停超过 8 秒未恢复则强制 resume。用户自己的暂停永不自动恢复。
- 上限：maxRecords=2000、maxHits=20000、maxPending=100，达到后自动停止并提示。

## 4. 参数捕获机制

入口断点命中后，对顶层帧先校验：函数名非空且有 local 作用域，否则记 capture-failed 并写明原因。然后用 `Runtime.getProperties`（ownProperties）读取 local 作用域里的形参。对象和数组只保留类型和 description，不展开、不读 getter。字符串超过 2000 字符会截断并标记。引擎只用 setBreakpoint、getProperties、resume、stepOver、removeBreakpoint，没有用 Runtime.evaluate，不重新调用解码函数。

## 5. 返回值捕获机制（经原型实测）

- stepOut 不可行：暂停在调用者帧时 `callFrames[0]` 上没有 returnValue。原型阶段 A 的 12 条里 10 条取不到，1 条取到的是外层函数的返回值（错值）。
- 逐语句 stepOver 不可行：循环解码函数撞步数上限。
- 采用：return 断点和右花括号断点命中后，如果帧上已有 returnValue 就直接读，否则 stepOver 一步再读。
- 成功条件：returnValue 必须出现在与入口帧同名、同深度的帧上，否则不算成功。
- 抛异常的函数没有 returnValue，标记 capture-failed 并写明原因。

## 6. 映射表结构

`DecoderCapture`：key（scriptId + 入口位置 + 参数 + 状态 + 返回值或原因）、scriptId、scriptUrl、functionName、functionLocation、callLocation、arguments、returnValue、captureStatus、reason、count、firstSeq、lastSeq、timestamp。相同键去重并累加 count，失败记录保留。firstSeq/lastSeq 为全局捕获序号，用于区分旋转阶段与稳定阶段。

## 7. 测试结果

单元测试（假传输层，只证明状态机逻辑）：capture-plan 5 条、capture-engine 18 条，共 23 条通过。全量 vitest：221 通过，3 跳过（跳过项是之前标注尚未实现的，与本阶段无关）。构建通过。tsc 仍有既有的类型噪音（缺少 chrome/node 类型声明等），本阶段新增文件无新增类型错误。

真实 Chrome（原始 CDP，人工构造页面 capture-proto，有页面真值）：
- 把页面全部具名函数手动设为目标（ALL=1）：12 条捕获与页面真实输出全部一致，覆盖 string、number、undefined、null、嵌套、300 次循环；`decThrow` 按预期标 capture-failed；入口位置修复和 both 修复后回归，errors 为空。
- 自动发现只选中高可信度候选：这是修复入口位置之前的结果，只有 decOne、decTwo、decThree 被选为目标，12 条预期里覆盖 6 条。decNum、decNull、decThrow、decNested 没有成为候选，decUndef、decLoop 只是 medium。这才是自动流程的真实覆盖率。

生命周期（capture-life，手动指定目标）：S1 手动停止、S2 刷新中途、S3 用户 debugger 语句与用户断点。最后一次串行重跑里没有 FAIL 行，但我只过滤了 FAIL，没有逐条核对 PASS。更早的一次并行重跑出现过 S2 两条 FAIL，我推测是并行时序问题，没有单独证实。S1 暴露并修复了 stop 后暂停卡住页面的缺陷，S2 暴露并修复了刷新信号监听错误的缺陷。

## 8. 样本结果（开源仓库样本，隔离页面：CSP default-src none + Fetch 拦截非 file 请求）

| 样本 | 高可信度候选 | 断点 | 触发/成功 | 说明 |
|---|---|---|---|---|
| sample-01 | `_0x4b57`（AssignedExpression） | 设置成功 | 241 / 241（12 秒） | 70 组参数中 13 组返回值冲突，13 组都只出现在启发式估算的旋转阶段（序号约 104 之前）。无真值。 |
| sample-02 | `_0x0a9e`、`ox` | 6 个成功 | 260 / 259（15 秒） | 另 1 条为 stop 时未返回。`ox` 触发 0 次，是否误判未确认。静态有 3073 处调用，只运行了一部分。 |
| sample-03 | `U`、`qt`（两个节点） | 设置成功 | 60 秒：1483 / 1482 | 12 组参数各有最多 62 种返回值，最后出现序号紧贴最大序号，**未稳定，不可用作映射**。原因未证实：断点拖慢旋转，或格式化后旋转校验永不通过。`qt` 经源码确认是真解码函数。 |
| sample-04 | `_0x4698`、`_0x5ca5` 及三个 `_doProcessBlock` | 10 个成功 | 93 / 92（12 秒） | `_doProcessBlock` 触发 0 次，疑似误判，未看源码。每次运行出现 5 到 7 次外来暂停，经读取源码确认是样本用 Function 构造器生成的 `debugger` 反调试，测试脚本替它恢复。 |
| sample-05 | `_0x3028` | 设置成功 | 0 / 0 | 样本被格式化后，self-defending 检测不通过，走 `setCookie` 的死循环，抛出 RangeError: Invalid string length，不会走到解码调用。不修改样本，记为未捕获。 |

未采集：没有第三方网站实际脚本。没有 RC4 样本的返回值真值对照。

## 9. 性能

- 样本在 12 到 60 秒内触发 100 到 1500 次，每次触发约 3 次暂停，断点开销明显，大量调用的样本会被拖慢，旋转阶段可能因此跑不完。
- 发现了 Phase 2 遗留的性能缺陷：`discoverDecoders` 对每个函数重复遍历整个 AST。修复为一次建立函数节点索引，闭包检测挪到评分之后，检测器改用 `traverseFast`。sample-02 从 24.0 秒降到约 1.0 秒，sample-03 从 43.1 秒降到约 1.8 秒，sample-04 约 3.7 秒。修复后 sample-02 候选从 18 变 23、sample-03 从 24 变 26，原因是以前被静默丢掉的对象方法现在也被分析，高可信度数量不变。
- 没有测内存。

## 10. 未支持与已知问题

- 非标识符参数（解构、默认值、剩余参数）和表达式体箭头函数：捕获计划返回 unsupported 并给出原因。
- 扩展路径依赖 `scriptParsed` + `getScriptSource`，没有使用 `beforeScriptExecution` 插桩断点。**顶层立即执行的脚本，在断点设好之前的调用会被漏掉。** 测试脚本用了插桩断点，所以样本结果比扩展路径更完整。
- 数组旋转阶段的中间值与最终值无法在引擎里区分，Phase 4 前需要稳定性判定。
- 页面自带 `debugger` 反调试会让页面停住，引擎按设计不自动恢复，需要用户手动继续。面板提示已补充此原因。
- Phase 2 的误判（如 `ox`、`_doProcessBlock`）没有确认。
- 面板选取只取高可信度候选，medium 的解码函数不会被捕获。
- 调试器冲突、chrome.debugger 环境、面板实际交互均未验证。

## 11. 状态分类

- 已实现：capture-plan、capture-engine、cdp-client 钩子、background 集成、面板 Runtime Capture 区域、Phase 2 性能修复。
- 已通过单元测试：capture-plan（5）、capture-engine（18），全量 221 通过。
- 已通过真实浏览器测试（仅原始 CDP + headless Chrome）：人工构造页面的参数与返回值捕获、手动停止、刷新、用户暂停保留；sample-01、02、04 的捕获流程（只证明流程，不证明值正确）。
- 未通过或未验证：sample-03 稳定性、sample-05 捕获、chrome.debugger 扩展环境、DevTools 冲突、面板人工操作、第三方网站脚本。
- 尚未实现：插桩断点接入扩展路径、旋转阶段稳定判定、medium 候选的捕获。
