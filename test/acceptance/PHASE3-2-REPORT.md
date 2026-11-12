# OB-Recover Phase 3.2 补充验收与收尾报告

日期：2026-11-09
范围：本轮只做验收发现问题的收尾，属 Phase 3.2。未进入 Phase 4，未实现变量语义恢复和控制流还原。

## 0. 先读这个

- 测试类别不能互相替代：
  - 单元测试（Vitest）：真实 CaptureEngine + 在 node:vm 里真实执行的脚本；CDP 传输层是桩，调用位置取自 V8 调用栈。
  - 原始 CDP 测试：本轮没有新增。
  - 真实 Chrome 扩展测试：无头 Chrome 155 + 真实 DevTools 前端 + 真实 panel.html + 真实 service worker + 真实 chrome.debugger；面板切换用 `InspectorView.showPanel`，按钮用 `element.click()`，都是程序化操作。
  - 桩环境：panel-layout-check（`chrome.*` 被桩掉）。本轮没有重跑布局检查。
  - 人工验证：没有做。
- 真实 OB 样本由我手写的明文加 javascript-obfuscator 5.9.0（obfuscator.io 的同一引擎）生成。这一点有别于"来自真实网站的样本"。
- 你建议的网站未能验证（403），详见第 5 节。

## 1. 已通过项目

- 单次观测策略：安全条件全部满足时经严格静态检查进入 verified，依据里带「【单次观测】」；可识别的时间、随机、状态依赖仍是 unstable。20 条新测试覆盖安全通过与各类不安全拒绝。
- 数组旋转策略保持保守：同参数不同返回值仍标 unstable；同一函数存在冲突时该函数所有映射被 dry-run 整体拒绝；未实现分阶段映射；未降低拒绝标准。测试覆盖。
- 辅助函数策略：`rejectUnresolvedHelpers` 默认 true，未放宽。新增测试确认：无法解析的辅助函数在单次观测下判 insufficient，dry-run 即使显式放宽也因其状态不是 verified 而拒绝。
- 验证统计统一：面板五个验证状态全部来自 Phase 3.2 验证结果；引擎原始统计单独命名为「引擎·同参多值」；各状态之和在每个时点等于验证组合计；刷新、清空、切换脚本、重新分析均有单元测试，并在真实扩展流程中确认（切到 Sources 时统计仍更新，清空后归零，刷新后旧脚本计为验证失败）。
- Runtime Capture 提示：捕获面板新增静态提示，未改布局结构、断点机制和 CDP 生命周期。
- 真实 OB 样本（medium 门槛）：12 个 verified 候选，替换文本与脚本跑完后的对照值逐个一致。
- Phase 4 准备：dry-run 为每个候选提供唯一的节点位置（脚本 + start/end + 行列）；同文本风险记入 textKeyConflicts。详见第 6 节。

## 2. 未通过项目

- 真实 OB 样本在默认 high 门槛下 dry-run 候选为 0。原因是可替换的包装函数 `_0x124122` 只有 medium 置信度，默认不参与捕获；默认门槛下这个样本没有产出任何可替换候选。需要 medium 门槛才出现 12 个候选。这是覆盖率问题，不是验证放行了不安全项。
- 你建议的网站未能完成验收（403 Forbidden，页面脚本为 0），不按通过处理。

## 3. 未验证项目

- 真实网站或真实 obfuscator.io 抓取样本：没有拿到可验收的目标，第 5 节的网站 403，未用别的样本顶替。
- 人工鼠标操作、有头 DevTools、真实用户手势下的右键菜单和悬停气泡。
- 压缩单行脚本、多行调用、成员调用、eval 与动态脚本下的调用位置与 AST 对应关系。
- 三个拒绝分支没有测试：`unexpected-parent`（父节点是 new 或模板标签）、`function-ambiguous`（入口位置对应多个函数）、`callee-binding-unresolved`（作用域里无法解析被调用者）。
- 纯内置函数白名单（`PURE_GLOBAL_CALLS`）和内置函数 `atob` 等由我列定，没有用真实样本检验。
- 别名式旋转：旋转函数通过参数别名改写字符串数组时，静态检查识别不了，单次观测排除不了。见第 7 节的限制。
- 面板在右停靠小尺寸、验证行很多时的人工观感；新的布局截图未逐张检查。

## 4. 单次观测的验证标准

默认 `allowSingleObservation: true`。只有 `observations === 1` 且下列条件全部确认时才 verified；任何一项无法确认即 `insufficient`（依据里追加 `single-observation-rejected` 和具体未确认项，`evidence` 为 `none`）：

1. 调用位置能唯一映射到 CallExpression，且该位置是对解码函数的直接 Identifier 调用（不是别名或成员调用）。
2. 参数完整（无缺失、无截断、可比较）。
3. 返回值完整且能安全表示为 StringLiteral / NumericLiteral / BooleanLiteral。
4. 解码函数本身能唯一定位并静态分析。
5. 函数调用的脚本内辅助函数能完整解析；未声明的全局函数（不在纯内置白名单）视为无法解析。此路径不接受任何放宽选项，不读取 `rejectUnresolvedHelpers`。
6. 不存在可识别的状态、时间、随机依赖，且函数读取的外部变量没有在函数外被修改（赋值、自增自减、delete、push/shift 等修改方法）。
7. 同参数无冲突（`distinct <= 1`）。
8. 脚本没有起始偏移（内联脚本的位置换算未验证，视为脚本身份不可确认）。

verified 时依据里明确标注：`【单次观测】只观测到 1 次，没有多次一致观测作为佐证；以下条件已全部确认：… 这不等于多次观测验证：静态分析看不到的别名式修改无法排除。`

多次一致观测（`observations >= minObservations`，默认 2）走原有机制，`evidence` 为 `multiple-observations`。

限制：`outerMutableReads` 只能看到直接修改。旋转通过别名改写字符串数组时识别不了，单次观测无法排除。当前只有「同一函数其他参数组出现冲突 → 该函数所有映射被 dry-run 拒绝」这一间接保护。为保持设计意图，本轮没有改动轮换阶段判定。

## 5. 真实 OB 样本结果

样本：`test/fixtures/real-ob/obfuscated.js`，由 `source.js` 经 javascript-obfuscator 5.9.0 生成（选项见 `metadata.json`；未开 selfDefending / debugProtection）。SHA-256 `f0e5b6c7198cfb69f51ac427eba095219c5db86c74cb2970e8fba3be99fa6315`，与 metadata 记录一致，未手工修改。静态特征：228 个 `_0x` 标识符，2 处 push/shift 旋转，0 处 debugger。`node:vm` 中运行输出与明文一致。

结构：旋转 IIFE + 字符串数组函数 `_0xb31e` + 解码函数 `_0x194f`（含索引偏移，结果缓存在函数自身属性）+ 包装函数 `_0x124122` / `_0x1d59cb` 等。

Decoder Discovery：20 个候选，high 1 个（`_0x194f`），medium 若干（含包装函数 `_0x124122`、`pick`）。

真实扩展流程（无头 Chrome + 真实扩展，程序化操作）：

| 门槛 | 引擎记录 | 验证组 | verified | unstable | failed | dry-run 候选 | 拒绝原因 |
|---|---|---|---|---|---|---|---|
| high（默认） | 73 | 37 | 28（22 单次 + 6 多次） | 9 | 0 | 0 | function-suspect 28、status-unstable 9 |
| medium | 99 | 63 | 40（34 单次 + 6 多次） | 9 | 14 | 12 | function-suspect 28、status-unstable 9、status-failed 14 |

medium 门槛的 12 个候选全部来自 `_0x124122`，位置示例 `1:3566 → "windbreaker"`、`1:3758 → "cny-199"`。离线核对（用脚本跑完后的解码器作为对照，只用于报告，产品不用）显示 12 个候选的替换文本与对照值逐个一致，mismatch 0。

`_0x194f` 的调用点都在包装函数体内，参数是 `_0x59203d-0x2fe` 这类计算值；在去掉 function-suspect 门的诊断副本上，28 个 verified 组全部因 `dynamic-arguments` 被拒，所以产品路径也不应替换它们。真正可替换的是包装函数调用点。

统计来源在真实流程中的验证：high 门槛下各时点（面板隐藏 / 切回 / 第二轮刷新 / 清空）五个状态之和都等于验证组合计，面板被切到 Sources 时数字仍在更新，清空后归零，第二轮刷新后旧脚本 37 组计为验证失败而不是不稳定。

## 6. 面板统计数据来源

唯一来源是 `src/core/validation-stats.ts` 的 `computeValidationStats`，它调用 `validateCaptures` 并汇总验证组：

- 面板 `已验证 / 不稳定 / 验证失败 / 证据不足 / 等待验证` 五个数字来自 `stats.byStatus`，统计单位是验证组（脚本 + 函数 + 参数）。
- `验证组合计` 显示组数；`consistent` 为 false 时标注「统计不一致！」。`consistent` 要求各状态之和等于组数，且参与统计的记录数等于传入的记录数。
- 悬停标题给出组数、对应记录数、单次观测通过组数、多次一致观测通过组数、脚本已过期组数。
- 引擎 `getStability()` 的 unstable 数量仍单独显示，标题为「引擎·同参多值」，卡片徽章加「引擎:」前缀，卡片体里的字段改名为「引擎稳定性(3.1原始)」。它与验证状态统计是两套来源。
- 统计不依赖渲染：改用 150ms 定时器在捕获事件、状态变化、脚本发现和清空时刷新，所以面板被切走（rAF 不触发）时统计仍会更新。
- 已知边界：`验证组合计` 为 8 而引擎「同参多值」为 4 这类差异是正常的，前者数是验证组，后者数是「同参数出现多个返回值的参数组数」。

## 7. Phase 4 的位置级替换准备

1. 每个候选是否都有唯一节点定位：是。候选带 `scriptId`、`start`、`end` 和 CDP `position`，`start`/`end` 是插件从 AST 节点自身取的字节偏移，不受手改 `line-number` 影响。定位按位置，不按文本。
2. 能否区分同文本调用：能。定位以 `scriptId + start/end` 为准。是否仍需 `scriptId` 之外的版本标识未验证（本轮脚本刷新与位置校验只覆盖同页刷新，跨页面窗口的复杂情况未测）。
3. 仍依赖调用文本全局替换的路径（Phase 4 不得沿用）：
   - `src/core/call-transformer.ts:35-36`（`mappings[callText]`）——会替换同文本的所有调用。
   - `src/core/string-decoder.ts:185-227`（`calls.set(callText, …)`、`mappings[callText]`）。
   - `src/core/mapping.ts`（`callText` 为键的映射表，含 `import` / `export`）。
   - `src/extension/devtools/panel.ts` 的「加入映射」按选中文本构造 `externalMappings`，最终仍走 `call-transformer`。
   这些是 3.1 遗留路径。`member-transformer.ts` 用作用域绑定（`scope.getBinding`）和 `constantViolations` 判断，不是文本匹配。
4. Phase 4 如何按位置替换：对每个 verified 候选，用 `scriptId` 找到当前脚本，用 `start/end` 定位到唯一 `CallExpression`，替换为 `replacement` 对应的字面量节点，并校验 `before/after` 类型、父节点类型和替换后节点唯一性。`dry-run` 已经把这些检查实现成只读的接口，Phase 4 可直接复用。
5. 如何防止同文本误替换：只按位置替换；不按调用文本匹配；`textKeyConflicts` 列出同文本但未被观测或绑定到别的函数的调用，替换时必须逐位置确认，不得跨位置套用同一映射。

## 8. 测试与检查结果

单元测试（Vitest）：

- 全量：29 个文件，320 通过，3 跳过（323）。上一轮基线 27 文件 / 292 通过，本轮新增 `single-observation`（20 条）和 `validation-stats`（8 条），共 28 条。没有删除或放宽既有测试；`allowSingleObservation: false` 保留旧行为供对照。
- 三个相关文件 67 条全部通过：`capture-validation`（26）、`replacement-dryrun`（21）、`single-observation`（20）。
- `validation-stats` 覆盖空记录、混合状态、刷新、清空、切换脚本、重新分析，以及「引擎认为不稳定的旧脚本记录在验证统计里是 failed」。不测面板 DOM。

Vite build：通过。`panel.js` 因打包验证统计模块体积继续增长（上一轮 103.58 kB），是否可接受未评估。

TypeScript：

- `src/core` 只有历史的 `generator.ts` 一处错误；本轮新增的 `replacement-safety.ts`、`validation-stats.ts` 零错误，`capture-validation.ts` 的临时错误已修复。
- `src/` 其余错误仍在 6 个历史文件（`cdp-client` 17、`panel` 12、`background` 10、`types/index` 2、`generator` 1、`devtools` 1）。
- 新增测试辅助与脚本的错误均为缺 `@types/node`（`node:vm`、`node:child_process` 等），与本轮功能无关。

真实扩展流程（无头，程序化）：

- 真实 OB 样本：high 与 medium 两轮，各 21 步，见第 5 节。
- 验证流程（自建页）：切到 Sources 时统计仍更新，状态之和等于合计，提示文字出现。
- 你建议的网站：21 步，结果为 403，见下节。
- 未覆盖：清空后引擎状态、切回后展开卡片高度之外的人工观感。

## 9. 未验证项与需要你决定的事

1. 你建议的网站本轮不可验收：无头访问返回 `403 Forbidden`，页面 `scriptTags` 和 `scriptResources` 均为空，没有加载任何脚本。面板里那 17 个 medium 候选（`I`、`w`、`E`…）在自建页、真实样本页和该网站完全相同，来自我自己的 `Runtime.evaluate` 注入表达式，不是网站代码；已更正之前「分析了 3 个脚本」的错误说法。若需要，我可以用有头 Chrome 或带 Cookie 的方式重试，或请你提供一个能访问的样本地址。
2. 别名式旋转无法被静态检查识别，所以单次观测的「无状态依赖」对这类写法不成立。当前靠冲突证据间接拒绝。是否引入「旋转阶段判定」（例如识别顶层旋转 IIFE 并排除其执行期间的观测）需要新的判断依据，不在本轮做，属未来增强方向。
3. OB 的包装函数通常只是 medium 或被识别为普通函数，默认 high 门槛下真实样本的可替换数量为 0。是否把默认门槛调整为 medium，或在发现高置信度解码器时自动纳入其包装函数，需要你决定。本轮没有改默认门槛（medium 结果来自显式切换面板选项）。
4. 解引用候选未经版本标识（仅按 `scriptId` + 位置）。同页刷新已覆盖，跨页面窗口的复杂情况未测。
5. 面板 `验证组合计` 与「引擎·同参多值」两个数字含义不同，故意并存。若你需要完全隐藏引擎统计，可以再删。

## 10. 停止条件

本轮结束，停止开发。未进入 Phase 4，未实现变量语义恢复和/或控制流还原。等待你检查本报告并决定下一步。

## 附：本轮文件变更

修改：
- `src/core/function-features.ts`：导出 `MUTATING_METHODS`。
- `src/core/capture-validation.ts`：单次观测路径、`evidence` 字段、`outerMutableReads` 接入、`fmtValue` 改为再导出。
- `src/extension/devtools/panel.ts` / `panel.html` / `panel.css`：验证统计统一、引擎统计改名、捕获提示、单次观测依据展示。
- `test/capture-validation.test.ts` / `test/replacement-dryrun.test.ts`：单次观测相关用例改为显式 `allowSingleObservation`。
- `test/helpers/capture-driver.ts`：暴露 `stability`。

新增：
- `src/core/replacement-safety.ts`：共享的辅助函数分析、字面量判断、`outerMutableReads`。
- `src/core/validation-stats.ts`：验证统计的唯一来源。
- `test/single-observation.test.ts`：20 条。
- `test/validation-stats.test.ts`：8 条。
- `test/fixtures/real-ob/source.js`、`obfuscated.js`、`metadata.json`：真实 OB 样本及元数据。
- `scripts/gen-real-ob-sample.mjs`、`scripts/verify-real-ob-sample.mjs`、`scripts/analyze-real-ob-e2e.ts`、`scripts/devtools-real-ob-e2e.ts`。

结果文件：`test/acceptance/devtools-validation-e2e.json`、`devtools-real-ob-e2e.json`、`devtools-real-ob-e2e-medium.json`、`devtools-real-ob-analysis.json`、`devtools-real-ob-analysis-medium.json`、`devtools-real-site-e2e.json`、`phase3-2-calllocation-probe.json`。
