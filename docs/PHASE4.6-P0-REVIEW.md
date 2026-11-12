# Phase 4.6：P0 代码审查与修复报告

日期：2026-11-10　项目：`D:/Projects/ob-recover`　范围：Phase 4 替换引擎（`verified-replacer.ts`）及其测试，以及 Phase 4.5 手动记录与替换链路的兼容性。
未进入 Phase 5；未修改旧文本级路径 `call-transformer.ts`、`mapping.ts`、`pipeline.ts`（与阶段开始时的备份逐文件哈希比对，三个文件都没变）。
备份：`C:/Users/Administrator/TEMP/opencode/ob-backup-p46-20261110071025`（src 与 test 整体备份）。项目不是 git 仓库。

## 0. 摘要

- 两个已知 P0 都已处理：`callLocationsTruncated` 数据链补全并改为保守判定；`verified-replacer.test.ts` 的 62 个类型错误清零，测试改为断言替换后的完整源码。
- 审查中另外发现 5 个缺陷：4 个已复现并修复，1 个仅凭读代码发现。另外加固了字面量与词法边界检查。
- 完整 Vitest：34 个文件，406 通过，3 跳过。`tsc` 相对阶段开始时的基线新增错误 0。`vite build` 成功。Phase 4.5 真机 20/20 项通过。Phase 3 真机 4 次运行 3 次通过，1 次原因不明的超时。
- 仍有未解决的风险，见第 10 节。

## 1. 检查的问题与根本原因

### 1.1 `verified-replacer.ts:88` 的 `callLocationsTruncated`

- 字段定义与传递：`DecoderCapture.callLocationsTruncated?`（`capture-engine.ts`，调用位置超过 50 个时由引擎置 true）→ `GroupValidation.callLocationsTruncated`（`capture-validation.ts`，任一记录为 true 则为 true）→ dry-run 在 `replacement-dryrun.ts` 对截断的组整组拒绝，原因码 `location-list-truncated`。
- 断点：dry-run 生成 `ReplacementCandidate` 时没有把该字段带过去，类型上也没有这个字段。替换引擎读的是候选上不存在的属性，`tsc` 报 TS2339，运行时永远读到 `undefined`，所以引擎里的防御检查是死代码。
- 另外，dry-run 的 `location-list-truncated` 在修复前没有任何测试。
- 修复：`ReplacementCandidate` 增加必填字段 `callLocationsTruncated: boolean`；dry-run 从 `g.callLocationsTruncated` 复制真实值；替换引擎改为只有明确为 `false` 才放行，字段缺失也按截断处理并整组拒绝。没有使用 `as any`、类型断言、`@ts-ignore`，也没有删除截断检查。

### 1.2 `test/verified-replacer.test.ts` 的 62 个类型错误

- 构成：44 个 TS2353，18 个 TS2740。全部来自测试数据，生产类型是对的。
- 原因：假候选带了真实类型里不存在的 `status`、`reasons`；缺少 `functionName`、`scriptUrl`、`before`、`after`、`replacement`、`parentType`、`observations`、`notes`、`textKeyConflicts`；`rejections` 写成了 `{}`（真实类型是数组）；`summary` 用了 `verified/rejected`（真实是 `candidates/rejections/byReason`）。
- 后果：Vitest 用 esbuild 转译，不做类型检查，所以这些假数据下测试照样通过，测试强度被高估。
- 修复：用类型完整的 `makeCandidate` 构造器重写，偏移量由源码计算而不是手数，断言替换后的完整源码，不再只看没有抛异常。

## 2. 审查中发现的其他缺陷

先在未修复的代码上复现，探针输出保存在 `test/acceptance/p46-probe-before-fix.json`。探针脚本是一次性观察工具，已从 `scripts/` 移除，副本在备份目录。

| 缺陷 | 复现 | 修复 |
|---|---|---|
| 包含式嵌套区间 | 外层 `f(...)` 与 `dec(0)` 被拒绝，被外层包含的 `dec(1)` 仍被替换 | 按重叠簇判定，簇内全部拒绝 |
| 候选 `end` 被截短 | `dec(0)` 被替换成字符串并留下 `(0)`，且能解析通过 | 要求 `callText` 等于源码切片；AST 节点 start/end 必须与候选一致；`position` 必须是该节点的调用起点 |
| 手动求值叠加观测 | 同一次暂停里对两个调用点各求值一次，被算成 `multiple-observations`、obs 2，绕过单次观测的严格静态检查，两处都被替换。单点时是 `insufficient`（`outer-mutable-state`） | `DecoderCapture` 增加 `origin`，手动记录标记为 `manual`；验证层的观测次数只数自动观测，只有手动记录时一律算 1 次 |
| 整体回滚永远不触发 | 修复前该用例失败，输出里仍带着被替换的内容。替换后的解析校验用的是 `getScriptAst`，它吞掉解析错误，还会污染缓存 | 直接调用 `parseCode`，失败则整体回滚 |
| 回滚时 `stats` 与 `rejected` 不一致 | 仅凭读代码发现，未单独复现 | `stats` 始终由最终的 applied/rejected 计算 |

字面量加固：拒绝 NaN、Infinity、负数、-0；数字、布尔、null 后面紧跟标识符字符（`5in obj`）或整数后紧跟 `.`（`5.length`）时拒绝。这些值经正常链路到不了替换引擎（dry-run 的 `replacementOf` 已拒绝），所以这是引擎对手工构造或被篡改的候选的独立防线。

探针里正常的项：U+2028 被转义；截断标记为 false 放行，为 true 或缺失都拒绝；`dec(0).toString()` 被 `ast-position-ambiguous` 拒绝（安全，但会漏替换）。

## 3. Phase 4 安全机制逐项审查

| # | 项目 | 结论 | 依据 |
|---|---|---|---|
| 1 | scriptId + scriptHash 双重校验 | 通过 | 任一不符即拒绝；同源码不同 scriptId 仍拒绝；手动记录的三种身份场景见 `manual-script-identity.test.ts` |
| 2 | 哈希、AST、定位、切片使用同一份源码 | 部分 | 引擎在同一个 `script.source` 字符串上算哈希、解析、校验、切片。但引擎无法独立证明这个字符串就是运行时脚本，只能靠候选里的 `scriptHash` 与它相等。面板应用时按 URL 加源码完全相等重新解析 scriptId |
| 3 | 区间合法、不越界、不重叠 | 通过（修复后） | 整数、start<end、不越界；重叠簇整簇拒绝，嵌套和完全相同的区间都覆盖；隔一个逗号的相邻区间照常替换 |
| 4 | AST 唯一匹配 CallExpression | 通过（修复后） | 0 个或多个都拒绝；新增文本与范围一致性检查 |
| 5 | 参数、位置与验证记录一致 | 部分 | 参数与调用点的一致性在 dry-run 的 `checkArg` 里检查；替换引擎拿不到参数，只核对 `callText` 和 AST 范围。引擎是位置级执行器，不是验证器，它信任 dry-run 产出的候选 |
| 6 | 截断保守拒绝 | 通过（修复后） | true、缺失都拒绝，同组任一截断整组拒绝，JSON 往返后仍有效 |
| 7 | 多候选冲突不冒险 | 通过 | 重叠簇全拒；其他组不受影响 |
| 8 | 从后往前替换 | 通过 | 前面的替换改变长度时，后面的偏移不受影响 |
| 9 | valueToNode + generator 生成字面量 | 通过 | 引号、反斜杠、换行、U+2028/2029、emoji、空串、中文：往返求值与原值全等，替换后可解析 |
| 10 | 候选级拒绝与原子回滚 | 通过（回滚为模拟） | 候选被拒后其余照常、被拒者原文不变。整体回滚用 `vi.mock` 强制解析失败来触发，因为经过 dry-run 和字面量检查后，真实的语法失败构造不出来 |
| 11 | 原始源码只读 | 通过 | 深度冻结的候选和脚本作为输入仍可运行，调用前后 JSON 快照不变 |
| 12 | 未验证、不稳定、位置不明、证据冲突保留原样 | 通过 | dry-run 24、capture-validation 26、single-observation 20 个既有用例全过，加上新增的手动合并用例 |

## 4. 手动断点模式与自动捕获的兼容性

- 合并：手动记录的 key 带 `manual|` 前缀，不会与自动记录碰撞。手动值与自动历史观测一致时，观测数只算自动的 2 次，调用位置并入（3 个），只替换已观测或已求值的位置，未覆盖的同文本调用保持原样。手动值与历史观测冲突时，同参不同值，判为 `unstable`，整组不进入候选，源码不变。
- 重复求值：同一调用点同一结果得到同一个 key，不累加观测；同一调用点结果不同时判为 `unstable`，不替换。
- 观测叠加：本阶段修复的真实缺陷，见第 2 节。副作用是同参数的多个调用点只做手动求值时，现在是 `insufficient`（`single-obs:call-location`），不再被替换。参数不同的两个调用点各自成组、各自通过。这是收紧，不是回归。
- 页面刷新与脚本重载：旧 scriptId 判为 `failed(stale-script)`；同 URL 同源码但 scriptId 不同时，候选只属于求值的那个脚本，应用到另一个脚本被 `script-id-mismatch` 拒绝；同 scriptId 但源码变化时，`script-version-mismatch` 拒绝，新源码不被改动。
- 手动结果是否会被误认为历史返回值：记录标记 `origin: manual`，面板文案也写明是暂停时重新执行一次调用；验证层仍做静态检查，函数读取了函数外被改写的状态时判为 `insufficient`。缺少 `origin` 标记的记录会被当作自动观测，目前只有 `manual-capture-convert.ts` 生成手动记录并设置该标记。
- 绕过验证层：没有。手动记录完整经过 `validateCaptures → dryRunReplacements → applyVerifiedReplacements`，`manual-auto-merge.test.ts` 与 `manual-capture-convert.test.ts` 的端到端用例覆盖这条链。

## 5. 修改的文件

- `src/core/replacement-dryrun.ts`：候选增加 `callLocationsTruncated`，从组验证结果复制。
- `src/core/verified-replacer.ts`：整体重写，包含保守截断判定、重叠簇、文本与 AST 范围核对、字面量与词法边界检查、直接解析的回滚、一致的统计。
- `src/core/capture-validation.ts`：观测次数只数自动观测，只有手动记录时算 1 次。
- `src/extension/debugger/capture-engine.ts`：`DecoderCapture` 增加可选的 `origin`。
- `src/core/manual-capture-convert.ts`：手动记录设置 `origin: manual`。
- `test/verified-replacer.test.ts`：重写。
- 新增：`test/replacement-truncation.test.ts`、`test/manual-auto-merge.test.ts`、`test/manual-script-identity.test.ts`。
- 新增证据：`test/acceptance/p46-probe-before-fix.json`，以及 `phase4-manual-real`、`phase4-manual-panel`、`phase3-1-extension-integration` 三份验收 JSON 的 `.before-p46.json` 副本。

## 6. 新增和修复的测试

| 文件 | 状态 | 用例数 |
|---|---|---|
| `test/verified-replacer.test.ts` | 重写 | 18 → 53 |
| `test/replacement-truncation.test.ts` | 新增 | 4 |
| `test/manual-auto-merge.test.ts` | 新增 | 9 |
| `test/manual-script-identity.test.ts` | 新增 | 3 |

修复前在未修复的生产代码上运行：65 个用例失败 22 个（`verified-replacer` 18 个，`manual-auto-merge` 4 个）；`replacement-truncation` 4 个全过，因为 dry-run 的字段修复先做了。修复后三个文件共 66 个用例全过，加上身份测试 3 个。

你要求的测试对照：`callLocationsTruncated` 为 true 与 false、scriptId 不匹配、scriptHash 不匹配、区间越界、区间重叠、AST 匹配不到、AST 匹配到多个（`dec(0).toString()` 内外两层调用同起点）、手动与自动合并后仍经过验证、相同文本不同位置不错误替换、失败时无部分修改、中文引号反斜杠换行 Unicode 替换后可解析，均已覆盖，断言的是完整源码或具体拒绝原因码。

## 7. Vitest

完整运行：34 个文件，406 通过，3 跳过（409）。基线 341，Phase 4.5 后 355，本阶段新增 51 个。3 个跳过是 `member-transformer-acceptance` 里原有的。

## 8. TypeScript 检查

- 阶段开始时：总数 410，`src/` 41 个。
- 现在：总数 347，`src/` 40 个。少的 63 个 = 测试文件 62 个 + `verified-replacer.ts:88` 1 个。
- 相对基线新增错误：0。逐条按错误消息和条数对照（忽略行号）；中途只有一次性探针脚本引入 4 条缺 `@types/node` 的同类错误，探针移除后 `p46` 相关错误为 0。
- 本阶段改动或新增的 `src/` 与 `test/` 文件里没有 `as any`、`@ts-ignore`、`@ts-expect-error`；未放宽 tsconfig。

仍然存在的历史错误，没有处理：

- `src/` 共 40 个，均为缺 `@types/chrome` 或其衍生：TS2304 25 个、TS2503 3 个、TS7006 11 个（回调参数隐式 any），另有 `panel.ts:191` 的 TS2488（`HTMLCollection` 迭代）1 个。
  - `background.ts` 10 个：行 27、207（2）、253（2）、283、470（4）。
  - `cdp-client.ts` 17 个：行 36（4）、62（3）、89 到 91、163 到 165、200 到 202。
  - `devtools.ts` 1 个：行 4。
  - `panel.ts` 12 个：行 46、62、73、145、146、159、191、813、954、955、970、1933。
- `scripts/` 与 `test/` 共 307 个：TS2307 121 个、TS2580 141 个（缺 `@types/node`），TS7006 36 个，TS2339 4 个，TS2304 4 个，TS1345 1 个。这个分类由探针移除前的一次分类结果（351 个）减去探针的 4 个得到。
  - TS2339 在 `scripts/analyze-real-ob-e2e.ts`（行 47、68、73、74）：`dryRunReplacements` 变成 async 后，脚本没有 `await`，是脚本里真实存在的缺陷。
  - TS2304 是 4 个测试文件里的 `__dirname`。
  - TS1345 是 `test/safety.test.ts:66`。

## 9. Vite build

成功（364 个模块）。仅有 `node:crypto` externalized 的预期警告（`hash-utils.ts` 的浏览器分支不会走到 Node 分支）。构建发生在最后一次 `src/` 改动之后。dist 哈希：`background.js` `ff3df717…51557e`（未变），`panel.js` `71dbbffa…d7d25c`，`sandbox.js` `92ac1aaf…cf7660`（含新替换引擎）。

## 10. 回归结果与未解决问题

### 回归

- Phase 3.2（单元）：`capture-validation` 26、`single-observation` 20、`replacement-dryrun` 24、`validation-stats` 8，全过。
- Phase 4（单元）：`verified-replacer` 53 与 `replacement-truncation` 4，全过。
- Phase 4.5（单元）：`manual-capture-convert` 14，另加本阶段 `manual-auto-merge` 9 与 `manual-script-identity` 3，全过。
- Phase 4.5（真机，新 dist，有界面的 Chrome，专用 profile）：后端十项 10/10，面板十项 10/10，各项检查失败数均为 0；扩展发出的 CDP 命令没有断点、resume、step；应用替换报告 1/1，`localLabel` 行被替换，`localToken` 行保持 `_0xdec(0x1)`；6 个主要控件都在可见区域内。仍然是脚本驱动，不是人手点击。
- Phase 3（真机，`capture-ext-immediate.html`）：4 次运行中 3 次通过（触发 3、成功 3、失败 0；3 组记录与页面输出一致；停止后断点为 0、页面可响应）；另有 1 次在 20 分钟后超时，没有结果。

### 未解决问题与风险

1. Phase 3 真机有一次不明原因的挂起：20 分钟超时，没有遗留进程，输出文件为空，验收 JSON 没有刷新。随后重跑通过 3 次。不能说稳定，也不能说已排除。
2. 手动求值会在暂停帧里真实执行一次调用（`evaluateOnCallFrame` 的 `throwOnSideEffect` 为 false），验证层的静态安全检查在求值之后才做。对有副作用或依赖状态的解码函数，求值本身可能改变页面状态。本阶段没有改。是否改成 `throwOnSideEffect: true`，需要你决定，代价是带缓存写入的解码器可能无法求值。
3. `tsc` 不干净，见第 8 节。没有修是因为需要新增依赖（`@types/chrome`、`@types/node`），未获授权，而且你禁止放宽 tsconfig。`scripts/analyze-real-ob-e2e.ts` 缺 `await` 是真实缺陷。
4. 整体回滚只有模拟测试，没有真实触发的用例。
5. 替换引擎信任 dry-run 的候选，不重新验证证据；参数一致性只在 dry-run 检查。当前面板每次点击都重新验证并重新 dry-run，所以现有路径上成立，但引擎本身不是独立的验证器。
6. 以下行为只有单元测试，没有真机验证：同参数多个调用点只做手动求值时变为证据不足；页面刷新后手动记录的清理；应用替换时 scriptId 解析命中 0 个或多个的分支。
7. `handleScriptDiscovered` 里按 URL 回填 scriptId 的逻辑没有改，只有「应用已验证替换」路径做了重新解析；目前 `activeScript.scriptId` 只在该路径被读取。
8. Phase 4.5 报告中的未验证项仍然有效：人手点击行号槽、Step into/out、F8、条件断点、多标签页。
9. 交接文档 8.7（同文本部分位置验收页退化）与 8.8（真实 OB 样本端到端）本阶段未涉及。

## 11. 是否具备进入 Phase 4.7 的条件

对照完成标准：

- 两个已知 P0 已正确处理：是。
- Phase 4 替换安全机制逐项审查：10 项通过，第 2、5 项为分层设计下的部分覆盖，不是缺陷，但需要知情。
- 新增代码无新增 TypeScript 错误：是。
- 完整测试通过：是。
- Vite build 成功：是。
- Phase 3、Phase 4.5 回归无退化：是，附带一次未解释的挂起。
- 审查报告：本文件。

结论：Phase 4.6 通过（附条件），具备进入 Phase 4.7 的条件。建议在 4.7 开始前先处理两项：第 10 节的第 2 项（手动求值的副作用策略）和第 1 项（Phase 3 挂起的排查）。本阶段到此停止，没有开始 Phase 4.7。
