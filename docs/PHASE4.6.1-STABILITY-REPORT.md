# Phase 4.6.1：运行时安全与稳定性修复报告

日期：2026-11-10　项目：`D:/Projects/ob-recover`　范围：手动求值的副作用策略、Phase 3 挂起排查、E2E 脚本缺 await、真实原子回滚、dry-run 候选可信边界。
未进入 Phase 4.7 和 Phase 5；未修改旧文本级路径 `call-transformer.ts`、`mapping.ts`、`pipeline.ts`（与本阶段开始时的备份逐文件哈希比对，三个文件都没变）。
备份：`C:/Users/Administrator/TEMP/opencode/ob-backup-p461-20261110083042`（src、test、scripts 整体备份）；修复前构建的 dist：`C:/Users/Administrator/TEMP/opencode/ob-dist-pre-p461-20261110094744`。项目不是 git 仓库。
证据：`test/acceptance/p461-evidence/`（35 个文件：修复前后的测试输出、复现 JSON、真机日志、两个一次性探针脚本和输出）。

## 0. 摘要

- 手动求值固定 `throwOnSideEffect: true`，没有降级路径。V8 拒绝时记录原因，该调用点判为证据不足，不进入 verified，也不影响同组已有的自动观测。**代价是真实的**：Chrome 里 `atob` 被 V8 拒绝，调用 `atob` 的纯解码函数无法手动求值，所以 Phase 4.5 两套真机验收从 10/10 变成 8/10（后端第 7、8 项，面板第 5、6 项）。没有放宽判定，没有改验收脚本和测试页，处理方式需要你决定。
- Phase 3 挂起：**没有复现**（10 次真机运行 0 次挂起，原来是 4 次出现 1 次）。根因仍然不确定。已给确实存在的无上限等待加了界限，并修掉了修复过程中我自己引入的两个缺陷；不能据此说挂起已经解决。
- `analyze-real-ob-e2e.ts` 缺 await：已修复。
- 原子回滚：已有真实触发的用例（Babel 真实语法错误，没有 mock），6 个全过。4.6 报告里“真实回滚构造不出来”的说法不成立。
- 候选可信边界：现有架构不能保证候选不可变。加了三项检查，其中语句位置的 `use strict` 是本阶段新发现并复现的真实语义缺陷（替换后函数悄悄变成严格模式，整体解析校验拦不住）。仍有无法检测的篡改，见第 9 节。
- 完整 Vitest：45 个文件，462 通过，3 跳过。`tsc` 总数 343，`src/` 39 个，均为历史上缺类型包的错误。`vite build` 成功。
- 结论：附条件。建议你先决定第 9 节第 1、2 项，再进入 Phase 4.7，见第 10 节。

## 1. 修改的问题

1. 手动求值固定 `throwOnSideEffect: true`。V8 拒绝时返回 `sideEffectBlocked`，并留一条手动来源的失败记录，验证层判为证据不足。
2. CDP 命令没有等待上限：`CaptureEngine` 的所有命令统一经带超时的 `cmd`（默认 5 秒）；`cdp-client.sendCommand` 默认 30 秒超时，调试器断开时立即拒绝所有等待中的命令。
3. 为上一项引入的 stepOver 认领窗口带来两个缺陷：串行链忙到期限之后才处理迟到的单步暂停；`reset`、`softReset` 不清窗口计时器。
4. 清理缺口：`onDetach` 不清插桩断点编号（外部断开后重连会漏布插桩断点）；标签页关闭不清手动捕获器、捕获模式、捕获策略。
5. `scripts/analyze-real-ob-e2e.ts` 第 46、52 行调用 async 的 `dryRunReplacements` 没有 await。
6. `scripts/extension-integration.ts`（Phase 3 真机回归）的 CDP 命令没有超时，挂起时既没有输出也没有诊断。
7. 整体回滚只有 `vi.mock` 模拟。
8. 替换引擎对 dry-run 候选的信任：不核对 `value` 与 `replacement` 是否一致；没有任何父节点检查，也不应信候选自带的 `parentType`；表达式语句位置的 `use strict` 会变成指令序言。

## 2. 根因分析

| 问题 | 根因 | 证据 |
|---|---|---|
| 手动求值副作用 | 在暂停帧里重新执行一次调用，`false` 时缓存写入、计数等副作用真实发生 | Node V8 探针对照：`false` 时 `counter` 变 1、缓存多出键、数组长度变 4；`true` 时被拒绝且状态不变 |
| 命令无上限 | `CaptureEngine` 的 `setBreakpoint`、`getProperties`、`stepOver`、`resume`、`removeBreakpoint` 都没有超时；暂停事件串在同一条 `chain` 上，一个不返回的命令让后面的暂停全部排队；看门狗只在 `handle` 开始之后计时，排队中的暂停它看不到；`pausedSince` 在发出 resume 或 stepOver 之前就被清空，命令挂住时看门狗已经失效。`cdp-client.sendCommand` 只在回调到来时结算，`onDetach` 不拒绝等待中的命令 | 桩传输层复现：stall 测试在旧代码上 5/5 失败；`cdp-client-timeout` 4 个里 2 个失败（具体名字未核对）。复现的是机制，不等于证明了当初 20 分钟超时的原因 |
| 认领窗口竞态 | 本阶段为上一项加 `stepExpiry` 时引入：钩子在事件到达时同步调用 `ownsPause`，暂停随后才进入串行链；链忙到期限之后才处理它时，`stepRequested` 已被清掉，本该归我们的单步暂停被当成外来暂停，不恢复页面 | 桩加假计时器：旧代码 1/2 失败（`foreignPauses` 期望 0，实际 1） |
| 认领计时器残留 | `reset`、`softReset` 只清 `stepRequested`，不清计时器；设置新计时器前也不清旧的；旧计时器在重置之后触发，会清掉新的单步标记 | 旧代码 3/3 失败 |
| 插桩编号残留 | `onDetach` 不清 `instrumentationBps`，外部断开后重连时 `setInstrumentation(true)` 以为已设置而不布置 | 只读代码；测试写于修复之后，没有在旧代码上验证 |
| 标签页关闭 | 只清 `captureEngines`、`scriptCollectors`，`manualCaptures`、`captureModes`、`captureStrategies` 留着 | 只读代码 |
| E2E 缺 await | `dryRunReplacements` 变成 async 后脚本没有 await，拿到的是 Promise | 旧脚本运行：第 47 行 `TypeError: Cannot read properties of undefined (reading 'map')`，退出码 1 |
| 验收脚本挂起无诊断 | `send` 只在回复到达时结算，socket 关闭也不拒绝；结果 JSON 在 `finally` 之后才写，任何一个 await 挂住都是“没有输出、JSON 未刷新”，与当时的现象一致 | 只读代码；分不出是脚本还是产品卡住 |
| 回滚无真实用例 | 4.6 时没找到既能通过前置检查、又能让整体解析真实失败的位置 | 调用表达式作赋值目标：原代码可解析，替换成字面量后 Babel 真实报错 |
| 候选自相矛盾 | 替换引擎只读 `c.value`，不核对 `c.replacement`；候选是普通对象，经 `postMessage` 是结构化克隆，没有不可变保证 | 旧代码：A、B 两个用例失败，候选自相矛盾仍被应用 |
| 无父节点检查 | 引擎没有任何父节点检查，`unexpected-parent` 只存在于 dry-run | 只读代码；测试写于修复之后 |
| 指令序言 | `dec(0);` 的结果是 `use strict` 时被替换成字符串语句，位于函数开头成为指令序言；简单参数的函数里没有语法错误，整体解析拦不住 | 旧代码：`f()` 里的 `typeof this` 原脚本是 `object`，替换后是 `undefined`（3/5 失败） |

## 3. 修改的文件

- `src/extension/debugger/manual-capture.ts`：`throwOnSideEffect` 固定 `true`；识别 V8 拒绝，返回 `sideEffectBlocked`。
- `src/core/manual-capture-convert.ts`：新增拒绝码 `side-effect-blocked`；被拒时附带手动来源的失败记录 `blocked`，同一调用点重复被拒得到同一个 key，不累加。
- `src/core/capture-validation.ts`：手动来源的失败记录不拖累同组自动观测；只剩它们时整组 `insufficient`（原因 `side-effect-blocked`），否则只加提示 `manual-evaluation-blocked`。
- `src/extension/devtools/manual-panel.ts`：被拒绝时把失败记录加入手动记录表并提示。
- `src/extension/debugger/capture-engine.ts`：命令超时 `cmd`（`commandTimeoutMs` 默认 5000）；`setBreakpoint` 迟到回复登记为已移除并尽力删除；超时后 `start`、`stop` 不逐个重试；stepOver 超时后的认领窗口 `stepExpiry`；resume、stepOver 返回后才清 `pausedSince`；单步归属在 `onPaused` 里同步消费；`reset`、`softReset`、设置新计时器前清认领计时器。
- `src/extension/debugger/cdp-client.ts`：`sendCommand` 默认 30 秒超时；断开（被动和主动）立即拒绝所有等待中的命令；迟到回复忽略；`onDetach` 清 `instrumentationBps`。
- `src/extension/background.ts`：标签页关闭时清手动捕获器、捕获模式、捕获策略。
- `src/core/replacement-safety.ts`：新增 `replacementParentProblem`、`literalTextOf`。
- `src/core/replacement-dryrun.ts`：父节点检查改用共享函数。
- `src/core/verified-replacer.ts`：引擎侧新增父节点检查（以 AST 里实际的父节点为准）和 `replacement-value-mismatch`。
- `scripts/analyze-real-ob-e2e.ts`：两处补 await。
- `scripts/extension-integration.ts`：每条命令 20 秒超时（`CMD_TIMEOUT_MS`），socket 关闭时拒绝等待中的命令，失败时保存诊断（捕获状态、最近 15 条面板消息、页面是否响应）。

没有改动：旧文本级路径三个文件、`tsconfig.json`、`test-pages/`、`scripts/manual-real-accept.ts`、`scripts/manual-panel-accept.ts`。一次性探针 `p461-v8-probe.mjs`、`p461-blink-probe.mjs` 已移到 `test/acceptance/p461-evidence/`。

## 4. 新增测试

| 文件 | 用例 | 内容 | 在未修复代码上的结果 |
|---|---|---|---|
| `test/manual-side-effect.test.ts` | 17 | 真实 V8（`node:inspector`，真实暂停帧）经 `ManualCapture` 求值；桩传输层检查参数；被拒绝的求值不产生 verified 候选 | 该修复先于测试写入，没有旧代码对照 |
| `test/capture-engine-stall.test.ts` | 5 | 单个永不返回的命令不能卡死引擎 | 5/5 失败 |
| `test/cdp-client-timeout.test.ts` | 4 | 无回复超时、断开立即拒绝、正常回复不留计时器、`lastError` 照常传递 | 2/4 失败 |
| `test/atomic-rollback-real.test.ts` | 6 | 真实原子回滚，不用 mock | 第一版（用 `use strict` 触发）通过；指令序言检查加入后触发失效，改用赋值目标触发 |
| `test/statement-position-directive.test.ts` | 5 | 语句位置的 `use strict` 替换 | 3/5 失败 |
| `test/replacement-parent-check.test.ts` | 4 | `new` 的 callee、模板标签；引擎以 AST 父节点为准（伪造 `parentType` 无效） | 写于修复之后，没有旧代码对照 |
| `test/cdp-client-detach-cleanup.test.ts` | 3 | 外部断开后重连会重新布置插桩断点 | 写于修复之后，没有旧代码对照 |
| `test/analyze-e2e-await.test.ts` | 2 | 静态守卫，含负向对照 | 没有旧代码对照（旧脚本的运行失败证据见第 2 节） |
| `test/candidate-integrity.test.ts` | 5 | `value`、`replacement` 一致性，含非 ASCII、引号、换行、数字、布尔、null 的误拒对照 | 2/5 失败 |
| `test/capture-engine-step-expiry.test.ts` | 2 | 认领窗口内迟到的单步暂停仍归我们 | 1/2 失败 |
| `test/capture-engine-step-expiry-reset.test.ts` | 3 | 认领计时器随重置清理 | 3/3 失败 |

共 56 个，修复后全部通过。

## 5. 完整测试结果

- Vitest：45 个文件，462 通过，3 跳过（465）。4.6 报告的基线是 406，新增 56 个。3 个跳过是 `member-transformer-acceptance` 里原有的。
- `tsc`：4.6 报告结尾总数 347、`src/` 40；现在总数 343、`src/` 39。`scripts/analyze-real-ob-e2e.ts` 的 4 个 TS2339 消失，数量与 4.6 报告列出的相符，没有逐条核对；`cdp-client.ts` 17 变 16，原因没有深究；`scripts/extension-integration.ts` 新增 1 条 TS2580 `process`（我新加的 `process.env.CMD_TIMEOUT_MS`，与历史上缺 `@types/node` 同类）。之后每一步改动前后的输出去掉行列号逐条对比，除这条 TS2580 外没有差异。11 个新增测试文件 0 条错误。
- `vite build`：成功，364 个模块，仅有 `node:crypto` externalized 的预期警告。构建发生在最后一次 `src/` 改动之后。dist 哈希：`background.js` `8DB17026…`（修复前 `ff3df717…`），`panel.js` `9CBC65A3…`，`sandbox.js` `2DF0C212…`，`devtools.js` `870B0B74…`（未变）。
- 类型标记：改动的 12 个文件里 `as any`、`@ts-ignore`、`@ts-expect-error` 的数量与阶段开始的备份完全相同，新增测试文件里没有。这是计数，不是逐条审查。未放宽 `tsconfig`。
- 单元回归：Phase 3.2（`capture-validation` 26、`single-observation` 20、`replacement-dryrun` 24、`validation-stats` 8）、Phase 4（`verified-replacer` 53、`replacement-truncation` 4）、Phase 4.5（`manual-capture-convert` 14、`manual-auto-merge` 9、`manual-script-identity` 3）全过。
- 真机（有界面或 headless=new 的 Chrome 155.0.8059.40，专用 profile，加载真实扩展，脚本驱动；断点由 DevTools 前端设置，不是人手点击）：

| 项目 | 修复前构建（`ff3df717…`） | 新构建（`8db17026…`） |
|---|---|---|
| Phase 3 自动捕获（`capture-ext-immediate.html`） | 5/5 通过 | 5/5 通过 |
| Phase 4.5 后端十项 | 10/10（4.6 时期结果） | 8/10，第 7、8 项失败 |
| Phase 4.5 面板十项 | 10/10（4.6 时期结果） | 8/10，第 5、6 项失败 |

Phase 3 每次都是触发 3、成功 3、失败 0、停止后断点 0、页面可响应。

重点确认项：

| 项 | 结论 | 依据 |
|---|---|---|
| 安全求值失败不会影响页面 | 已验证 | Node V8 真实暂停帧里被拒后宿主函数照常返回、状态不变；Chrome 探针同样；真机验收里页面照常完成 |
| 不安全的结果不进入 verified | 已验证 | 链路测试：证据不足、候选为空、源码不变；面板真机：verified 为 0，无候选 |
| 原子回滚有效 | 已验证 | 第 8 节 |
| 自动捕获没有退化 | 真机 10 次通过 | 修复前和新构建各 5 次 |
| 手动断点模式没有退化 | 部分 | 用户断点、step、continue、模式往返、扩展不发 resume 和 step 的项都通过；4 项失败由副作用策略引起 |
| 原有用户断点不被删除 | 已验证（脚本驱动） | 后端第 10 项、面板第 9 项通过，扩展全程没有发出断点或 resume 命令 |

## 6. Phase 3 挂起问题的调查结论

**没有复现，根因不确定，不写成“已修复”。**

- 复现尝试：用修复前的构建（`background.js` 哈希仍是 `ff3df717…`，未重建）加 `capture-ext-immediate.html` 连跑 5 次，0 次挂起；新构建 5 次，0 次。新脚本的 20 秒命令超时一次也没触发。共 10 次，原来是 4 次里出现 1 次。修复前构建的第 1 次耗时 28 秒，之后都是 13 秒，28 秒的原因没有查。
- 静态阅读加桩复现发现的结构性问题（已加界限）：
  - 引擎所有 CDP 等待都没有超时，串行链会被一个不返回的命令永久堵死。
  - 看门狗在命令挂住时失效，排队中的暂停它看不到。
  - `sendCommand` 无超时，断开时不清理等待中的命令。
  - 验收脚本的 `send` 无超时，挂起时没有输出也没有诊断。这一条与当时“输出文件为空、JSON 未刷新”的现象吻合，但无法区分是脚本侧还是产品侧。
- 恢复机制：`setBreakpoint` 超时后迟到的回复登记为已移除并尽力删除；`removeBreakpoint` 超时后不逐个重试，登记为已移除，它们引起的暂停会被自动恢复；`stepOver` 超时后在 `watchdogMs` 内继续认领它可能引起的暂停，期限过后不再认领，避免吞掉用户自己的暂停；调试器断开时立即拒绝所有等待中的命令。
- 没有缩短现有看门狗（`watchdogMs` 仍是 8000）。新增的超时：引擎 5 秒、`sendCommand` 30 秒、验收脚本 20 秒。它们只表示“不再等待”，不撤销命令，命令仍可能已经生效。
- 排查中发现我自己引入的两个缺陷（认领窗口竞态、认领计时器残留），都先在旧代码上复现后修复。
- 仍然存在、没有验证也没有改动的候选原因：
  - Service Worker 被回收而调试会话还在时，`attachedTabs` 只存在于内存，下一次自己的断点暂停会被 `onEvent` 直接丢弃，页面停在断点上。验收脚本通过 CDP 连着 Service Worker，我认为这会让它保持存活，所以未必是当时的原因，但没有验证。
  - 插桩暂停（`onInstrumentation`）的总耗时没有上限：`getScriptSource` 最多 30 秒，`start` 遇到无回复 5 秒后放弃，但回复很慢却没断的情况、同步的 `discoverDecoders` 处理大脚本时阻塞 Service Worker，都没有界限。
- 面板端的读取：`connectPort` 断开后每 1 秒重连，没有次数上限和退避；轮询计时器在收到 `active: false` 时停止；sandbox 等待有 10 秒上限；面板端口断开不会停止捕获（代码注释说明这是有意设计）。这些都是读代码，没有运行验证。

## 7. throwOnSideEffect 策略验证

不降级：每一次发给 V8 的求值都是 `throwOnSideEffect: true`；被拒绝的表达式只发送一次，没有重试（桩和真实 V8 两处测试都断言了）。

| 环境 | 被拒绝 | 被放行 |
|---|---|---|
| Node 22 V8，`Runtime.evaluate`（探针 A） | 全局赋值、`counter++`、全局数组 `push`、全局对象写属性、缓存写入的解码函数、自身缓存、`Math.random`、Node 的 `atob` | 纯解码调用、绑定探针、对临时对象的修改；`Date.now` 没有被拦 |
| Node 22 V8，真实暂停帧（探针 B 与 17 个测试） | 帧内局部变量赋值、帧内对象写属性、缓存写入和计数的解码函数 | 读局部变量、对局部变量运算、调用纯解码函数 |
| Chrome 155 页面级 CDP（headless=new，about:blank，不经过扩展） | `atob`、`btoa`、调用 `atob` 的解码函数、递增全局的解码函数、赋值 | 纯数组查找、`String.fromCharCode`、`decodeURIComponent`、`parseInt`、`Math.floor`、`charCodeAt` 以及用它们写的解码函数；真实暂停帧里结果一致 |
| 真实扩展路径，测试页 `phase4-manual-real` | `_0xdec(0x0)` 到 `_0xdec(0x4)` 两种帧定位方式共 10 次求值全部 `Possible side-effect in debug-evaluate` | 绑定探针（面板第 5 项里“先发探针、再发调用表达式”的检查通过） |

- 被拒绝的求值没有改变页面状态：Node 和 Chrome 的探针里全局状态不变，宿主函数照常返回 7。
- 同一个 `atob('Zm9v')` 关掉检查后能返回 `foo`，所以被拒不是因为 `atob` 坏了，而是 Chrome 没把它当作无副作用。
- `Date.now` 没有被拦，时间依赖仍然只靠验证层的静态检查。
- Chrome 探针只测了约 10 个宿主函数，不能推广到别的 Blink 函数。
- 你要求的 6 项测试：纯表达式安全求值、改全局变量被拒绝、改对象属性被拒绝、缓存写入的解码函数不被自动执行（缓存确认没有被写入）、求值失败不影响页面、失败不生成 verified 候选，都在 `manual-side-effect.test.ts` 里，运行在 Node 的 V8 上；Chrome 路径由上面的探针和真机验收覆盖。
- 真实 OB 样本 `test/fixtures/real-ob/obfuscated.js`（5179 字符）里 `atob` 0 次、`fromCharCode` 1 次、`decodeURIComponent` 1 次。这只是文本计数，不能说明它的解码函数能在手动模式下求值；真实样本上的手动求值没有跑过。
- 对自动捕获没有影响：引擎只在断点处读参数和返回值，不重新执行函数；这是读代码得出的，Phase 3 真机 10 次通过与之相符。

## 8. 原子回滚验证

- 真实触发：`try { dec(0) = 1; } catch (e) {}`。调用表达式作赋值目标时原脚本能解析；运行时先执行 `dec(0)` 再抛 ReferenceError 被 catch 住，所以捕获成功；dry-run 和引擎的前置检查都不拒绝这个位置；全部替换后变成字符串字面量赋值，Babel 抛出真实的 `Invalid left-hand side`。
- `atomic-rollback-real.test.ts` 6 个用例全过：整体回滚、源码一字不动、没有部分替换、`applied` 为空、3 个候选全部以 `parse-failed-after-replacement` 拒绝、`stats` 与 `applied`、`rejected` 一致、dry-run 对象未被修改；对照用例去掉触发候选后另外两个正常应用；回滚后同一个脚本对象还能继续应用；先有候选因哈希不匹配被拒、剩下的再回滚时，两类拒绝都被统计，总数不丢。
- 上一版用 `use strict` 指令触发。新增的指令序言检查把它在更前面拦下，所以换了触发方式，没有放宽那条检查。
- 捕获部分仍是驱动里的桩 CDP 传输层（没有真实暂停），这里验证的是替换阶段的回滚，不是 Chrome 里的捕获。
- 粒度粗：一个无法解析的候选会让同一脚本里其他有效候选一起回滚。结果安全，但会少替换。没有加“拒绝赋值目标位置”的规则，加了就再没有任何真实的回滚触发，也超出本阶段范围。
- Babel 解析探针显示自增目标、`for-in`、`for-of` 头、带括号的赋值目标有同样的现象；探针只看解析结果，不证明这些位置能走通捕获和 dry-run。

### dry-run 候选的可信边界

| 问题 | 结论 | 代码证据 |
|---|---|---|
| 候选能否被外部修改 | 能。普通对象，`postMessage` 结构化克隆，没有冻结 | `replacement-dryrun.ts` 候选构造处；`sandbox.ts` 只做类型断言，没有来源检查和形状校验 |
| 能否跨脚本复用 | 被挡住 | 引擎核对 `scriptId` 与 SHA-256，其他脚本的候选以 `script-id-mismatch` 拒绝 |
| dry-run 与 apply 之间源码变化 | 被挡住 | `scriptHash` 与当前源码哈希不一致即 `script-version-mismatch`；`callText` 必须等于源码切片；AST 节点 start、end 必须与候选一致 |
| 过期候选 | 引擎没有生命周期概念，只有源码哈希一条防线，防的是源码变化，不是证据变化 | 面板每次点击都现生成、现使用，路径上成立 |
| 派生字段被改 | 新增检查 | `replacement-value-mismatch`：按 `replacementOf` 的公式比对，不重新求值，不重复执行解码函数 |
| 候选自称的 `parentType` | 不信任 | 引擎以 AST 里实际的父节点为准，拒绝 `new` 的 callee、模板标签，以及值为 `use strict` 或 `use asm` 的表达式语句 |

结论：无法保证候选不可变，也没有改架构。最小修复就是上面三项，其中 `use strict` 缺陷在旧代码上已复现。

## 9. 尚未解决的风险

1. Phase 3 挂起根因不明；Service Worker 回收后 `attachedTabs` 丢失的假设没有验证，也没有处理。
2. `atob` 类解码器在 Chrome 里无法手动求值：后端第 7、8 项和面板第 5、6 项失败是策略的直接后果，不是缺陷。需要你决定验收预期怎么处理。
3. 面板第 6 项里“还原面板读不到 `localLabel`、`localToken` 行”的检查失败，我推断是没有候选时 `panel.ts` 提前返回、不渲染还原面板（1733 到 1752 行），但没有看过截图。源码没有被改动，原始面板检查（第 316 项）通过。
4. 真实 OB 样本上的手动求值没有跑过。
5. 候选的一致性检查只能发现自相矛盾；`value` 与 `replacement` 被同时改成一致的另一个值检测不到。`sandbox.ts` 没有来源检查，也没有对 `dryRunResult` 做运行时形状校验。
6. 面板把整份 `dryRunResult` 传给沙箱，包括其他脚本的候选；它们会以 `script-id-mismatch` 计入“拒绝数量”，多脚本时这个数字偏大。这是读代码得出的，没有运行。
7. 一致性公式现在有两份（`replacementOf` 和 `literalTextOf`）。`replacement-safety.ts` 是 CRLF 换行，多行编辑难以唯一匹配，所以没有合并。
8. 指令序言检查是已知指令的拒绝名单（`use strict`、`use asm`），不覆盖工具私有指令；规则不看位置，宁可少替换。测试只覆盖了 `use strict`。
9. 回滚粒度粗：一个无法解析的候选让整个脚本的替换全部回滚。
10. 超时只表示不再等待，命令仍可能已经生效。5 秒的引擎命令超时在页面极慢时可能误报；认领窗口是 `watchdogMs` 内的启发式。
11. 插桩暂停没有总时限；同步的 `discoverDecoders` 会阻塞 Service Worker；面板重连没有次数上限和退避；面板端口断开不停止捕获。
12. 三个新测试没有在旧代码上验证过会失败：`cdp-client-detach-cleanup`、`replacement-parent-check`、`analyze-e2e-await`（静态守卫）。`manual-side-effect` 也没有旧代码对照。
13. Chrome 探针是页面级 CDP，且只测了约 10 个函数；扩展路径只由测试页的 `_0xdec` 覆盖。
14. `tsc` 仍不干净，需要 `@types/chrome` 和 `@types/node`，未获授权安装；本阶段还新增了 1 条同类 TS2580。
15. Phase 4.5 的未验证项仍然有效：人手点击行号槽、Step into 和 Step out、F8、条件断点、多标签页、页面刷新后手动记录清理的真机行为。
16. 与 js-reverse-mcp 同时接入同一标签页时的调试器行为没有验证。
17. `docs/PHASE4.6-P0-REVIEW.md` 第 10 节第 2、4、5 项以及第 3 节第 5、10 项的旧说法已被本报告取代（`throwOnSideEffect` 不再是 `false`；真实回滚已有用例；引擎不再只信候选），该文件没有改动。

## 10. 是否具备进入 Phase 4.7 的条件

结论：**附条件，不建议自动进入。**

对照要求：

- 手动求值 `true`、无降级、V8 拒绝记为证据不足、不进 verified：是（Node V8、Chrome 探针、真机三处验证）。
- 原子回滚真实验证：是。
- 候选边界：已给出代码证据和最小修复，并写明无法保证不可变。
- Phase 3 挂起：未复现、未解决，只加了界限。
- 完整 Vitest、`vite build`：通过。`tsc`：没有新增类型包缺失以外的错误。
- 回归：自动捕获没有退化；手动断点模式有 4 项验收失败，全部由副作用策略引起，用户断点、step、continue 项通过。

进入 4.7 前需要你决定：

1. `atob` 类解码器：接受“手动求值对它们不可用”，并把验收预期改成“被拒绝并记为证据不足”，另加一个不调用宿主函数的解码函数作为通过路径；或者保持现状，在 4.7 的真实站点上明确标出哪些解码器手动求值不可用。我没有自行决定，也没有改验收脚本和测试页。
2. Phase 3 挂起：是否接受“未复现，已加界限”进入 4.7，还是先做 Service Worker 回收的专项验证。

本阶段到此停止，没有开始 Phase 4.7。
