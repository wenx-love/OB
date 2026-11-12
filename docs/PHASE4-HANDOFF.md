# OB-Recover Phase 4 交接文档（Handoff）

生成时间：2026-11-09
用途：让一个全新的会话在不依赖任何聊天记录的情况下，准确接手 Phase 4（AST 自动替换）。
本文所有代码状态、行号、测试数字均在生成时**实际核对过项目文件**，不是凭记忆。

- 项目根目录：`D:\Projects\ob-recover`
- **不是 git 仓库**（`Test-Path .git` 为 False），没有版本回退能力。任何改动前请自行备份。
- 交接时**没有任何 Phase 4 代码**。`src/` 里搜不到应用于替换的新入口，`src/core` 各文件修改时间都停在 Phase 3.2（11-09 19:41 之前）。本轮除本文件外**未修改任何项目代码**。

---

## 1. 项目最终目标

OB-Recover 要成为完整的 JavaScript Obfuscator.io（OB）解混淆工具，形态是 Chrome DevTools 扩展 + 可复用的静态 AST 还原核心：

1. 在真实 DevTools 里连上目标页，自动发现 OB 解码器（Decoder Discovery）。
2. 用 CDP 断点在运行时捕获解码器的真实参数与返回值（Runtime Capture），不重新执行目标函数。
3. 对捕获结果做验证，只有可信映射才允许进入替换（Result Validation）。
4. 按**唯一 AST 节点位置**把已验证调用替换成字面量（AST Automatic Replacement）。
5. 后续阶段补齐变量语义恢复、控制流还原，最终在真实网站与真实 OB 样本上验收。

最终验收标准（贯穿各阶段）：**同样的调用文本出现在多个位置时，只能替换经过验证的那个 AST 节点，绝对不能误伤其他调用。** 宁可少替换，不可错替换。

---

## 2. 开发路线与真实完成状态

| 阶段 | 内容 | 真实状态 |
|---|---|---|
| Phase 1 | CDP 基础连接与调试器控制 | 已完成（`src/extension/debugger/cdp-client.ts`，历史类型错误 17 处未修） |
| Phase 2 | Decoder Discovery | 已完成（`src/core/decoder-discovery.ts`，40 条测试） |
| Phase 3 | Runtime Capture | 已完成（`src/extension/debugger/capture-engine.ts`，含 callLocations） |
| Phase 3.1 | 扩展集成与稳定性修复 | 已完成，有验收报告 `test/acceptance/PHASE3-1-REPORT.md` |
| Phase 3.2 | Result Validation | 已完成，有验收报告 `test/acceptance/PHASE3-2-REPORT.md` |
| **Phase 4** | **AST 自动替换** | **尚未开始。仅有只读 dry-run，无任何实际替换入口。本文档即为此阶段准备。** |
| Phase 5 | 变量语义恢复 | 未开始，禁止提前实现 |
| Phase 6 | 控制流还原 | 未开始，禁止提前实现 |
| Phase 7 | 综合优化与真实网站验收 | 未开始 |

Phase 3.2 收尾时已明确停止，等待验收后才被要求进入 Phase 4；Phase 4 目前只完成了现状核对与本文档。

---

## 3. Phase 3.1 / 3.2 已完成的工作

### 3.1 关键成果

- `DecoderCapture` 通道跑通：入口断点读参数、return 断点 / 函数右花括号断点读 returnValue，绝不重新执行目标函数。
- 捕获引擎与 `chrome.debugger` 解耦（构造时注入 `send`），可用桩传输层做单元测试。
- **`DecoderCapture.callLocations`**：同参数、同返回值的多个调用点会合并计数，因此新增位置列表（去重，上限 50；超限置 `callLocationsTruncated`）。`callLocation` 保留原义（首次出现位置，未知为 `-1`）。
- 面板：脚本列表、原始/还原双栏、转换报告、捕获卡片展开、验证徽章、dry-run 按钮、「捕获期间可能跳到 Sources」提示。
- 已知副作用：捕获断点命中会让 DevTools 自动切到 Sources，用户需手动切回 OB-Recover；这是断点机制导致的，未修改。

### 3.2 关键成果（Phase 4 直接依赖）

- **验证状态体系** `pending / verified / unstable / failed / insufficient`，证据不足一律不标 verified。
- 单次观测策略：`allowSingleObservation` 默认 true，但必须通过 8 项严格静态条件（位置唯一、参数完整、返回值可字面量化、函数与辅助函数可完整静态分析、无状态/时间/随机/外部可变依赖、无冲突、脚本无起始偏移）。任何一项无法确认即 insufficient，且此路径**不接受任何放宽选项**（不读 `rejectUnresolvedHelpers`）。
- 数组旋转：同参不同值 → unstable；同一函数有冲突 → 该函数所有映射被 dry-run 整体拒绝（`function-suspect`）。**不做**旋转后的分阶段映射。
- 辅助函数：`rejectUnresolvedHelpers` 默认 true，未声明的全局函数（不在纯内置白名单）视为无法解析。
- **`replacement-dryrun.ts`：只读的替换前检查**，是 Phase 4 的唯一候选来源。
- 统计统一：面板所有验证数量来自 `validation-stats.ts`；引擎 `getStability()` 的 unstable 单独叫「引擎·同参多值」。
- 真实 OB 样本（medium 门槛）：12 个 verified 候选，替换文本与脚本跑完后的对照值逐个一致，mismatch 0；high 门槛下候选 0（包装函数只有 medium）。

### 3.2 已知限制（Phase 4 必须继承，不得擅自放宽）

- 别名式旋转识别不了（旋转函数通过参数别名改写字符串数组），单次观测无法排除；目前仅靠「同函数其他参数组冲突」间接拒绝。
- 纯内置函数白名单 `PURE_GLOBAL_CALLS` 是人工列定，未用真实样本检验。
- 调用位置与 AST 的对应只在未压缩单行/多行普通调用上验证过；压缩单行、eval、动态脚本未验证。
- `unexpected-parent`、`function-ambiguous`、`callee-binding-unresolved` 三个拒绝分支无测试。
- 网页样本 `https://hangzhou.qccqcc.com/list.html?keyword=冲锋衣` 验收失败：无头访问返回 **403 Forbidden**，页面脚本为 0。不得把它记为通过。

---

## 4. 当前 Phase 4 进度

### 4.1 已阅读并核对的文件（附职责）

`src/core/`（19 个文件，以下为 Phase 4 相关）：

| 文件 | 大小 | 职责 |
|---|---|---|
| `replacement-dryrun.ts` | 15455 | **Phase 4 唯一候选来源**。`dryRunReplacements(report, scripts, options)` 输出 `{candidates, rejections, summary}`。只读，不修改 AST/源码。 |
| `replacement-safety.ts` | 6814 | 共享安全分析：`replacementOf`（返回值→字面量）、`helperProblems`、`outerMutableReads`、`functionOfBinding`、`reassignedOutside`、`fmtValue`。 |
| `capture-validation.ts` | 23805 | 验证层。`validateCaptures`、`getScriptAst`、`getFunctionInfo`、`ValidationScript`、`GroupValidation`、`ValidationReport`。 |
| `validation-stats.ts` | 2404 | 面板统计唯一来源 `computeValidationStats` / `summarizeValidation`。 |
| `ast-locate.ts` | 3568 | 位置 ↔ AST 定位：`findFunctionPathsByEntry`、`findCallPathsAt`、`entryPositionOf`、`resolveFunctionName`。 |
| `function-features.ts` | 8563 | 函数静态特征（时间/随机/外部写入/未声明全局调用等），导出 `MUTATING_METHODS`。 |
| `call-transformer.ts` | 3112 | **旧的文本级替换路径**：`mappings[callText]`（约 35-36 行）。Phase 4 不得作为替换入口。 |
| `string-decoder.ts` | 7714 | 旧的静态解码 + 文本键映射（约 185-227 行），同样按 `callText`。 |
| `mapping.ts` | 1683 | `MappingManager`，键是 `callText`，`import/export` 均为文本级。 |
| `pipeline.ts` | 4731 | 旧的 `recover()` 管线：parse → detectDecoders → buildDecoderMappings → transformCalls → 多轮 transform → generateCode。Phase 4 不应把新替换塞进这条文本管线。 |
| `member-transformer.ts` | 17493 | 用作用域绑定（`scope.getBinding` / `constantViolations`）判断，不是文本匹配，可参考其安全风格。 |
| `parser.ts` / `generator.ts` | 692 / 694 | Babel parse / generate 包装。`generator.ts` 有历史类型错误 1 处（`indent` 不在 GeneratorOptions）。 |
| `deterministic.ts` | 14456 | `isStaticValue`、`tryStaticEval`、`analyzeCallDeterminism`，dry-run 用它校验实参。 |
| `capture-plan.ts` | 3627 | `CdpPosition`（0 起始行列）与断点位置计算。 |

`src/extension/`：

| 文件 | 职责 |
|---|---|
| `debugger/capture-engine.ts` | 捕获引擎与 `DecoderCapture` 类型（含 `callLocations`、`callLocationsTruncated`）。 |
| `debugger/types.ts` | `PanelCommand` / `DebuggerPanelMessage`。 |
| `background.ts` | SW：CDP 事件转发、捕获命令、`__obRecoverTest` 测试钩子。 |
| `devtools/panel.ts` | 面板逻辑。关键行号：`btnRecover` 点击 231 行（调旧管线 `callSandbox('recover')`，238 行）；「加入映射」按钮 848 行、处理 864-879 行（仍构造 `callText` 键的 `externalMappings`）；`runValidation` 1410 行；dry-run 按钮 1630 行；`renderCaptureList` 1650 行。 |
| `sandbox/sandbox.ts` | 隔离 iframe，`recover` / `format` 两种方法；`recover` 把 `externalMappings` 交给旧管线。 |

测试与脚本：

- `test/` 下 22 个单元测试文件 + `test/acceptance/` 下 7 个验收测试文件 = 29 个。
- `test/helpers/capture-driver.ts`：真实 CaptureEngine + node:vm 真实执行脚本的测试驱动（CDP 传输层是桩），出口含 `captures / script / stats / stability`。
- 真实样本：`test/fixtures/real-ob/{source.js, obfuscated.js, metadata.json}`，生成器 `scripts/gen-real-ob-sample.mjs`，真实验证脚本 `scripts/verify-real-ob-sample.mjs`，端到端 `scripts/devtools-real-ob-e2e.ts`，离线分析 `scripts/analyze-real-ob-e2e.ts`。
- 历史验收 JSON 共 50 个，在 `test/acceptance/`。

### 4.2 可复用的代码（Phase 4 应直接使用，不要重写）

1. **`dryRunReplacements`**：产生候选与拒绝原因，已实现全部资格检查（位置唯一、绑定解析、同名遮蔽、参数与调用点一致、返回值字面量化、辅助函数、父节点、同文本风险）。
2. **`ReplacementCandidate`** 字段（已核对，第 50-66 行）：
   - `groupId, functionName, scriptId, scriptUrl`
   - `position`（CDP 0 起始）、`start`、`end`（AST 字节偏移）、`callText`
   - `before: 'CallExpression'`、`after: 'StringLiteral' | 'NumericLiteral' | 'BooleanLiteral'`
   - `replacement`（替换后的源码文本，字符串用 `JSON.stringify` 生成）
   - `value`、`parentType`、`observations`、`notes`
   - `textKeyConflicts`（同文本但没有证据支持的调用，必须逐位置确认）
3. **`ReplacementRejection`**：`groupId, functionName, scriptId, status, position|null, reasons[]`，可直接用于替换报告。
4. **`ValidationScript`**（`scriptId, source, url?, startLine?, startColumn?`）+ `getScriptAst`（带缓存，同一脚本只解析一次）+ `getFunctionInfo`。
5. **`ast-locate.findCallPathsAt`**：按 CDP 位置精确找 CallExpression（只认调用起点或成员属性名起点）。
6. **`replacement-safety.replacementOf`**：返回值白名单（string / 非负有限 number / boolean）。
7. **`replacement-safety.outerMutableReads` / `helperProblems`**：进一步安全检查。
8. **`validation-stats`**：报告里的 verified / unstable / failed / insufficient / pending 计数应与面板一致。
9. **`t`（@babel/types）+ `generateCode`**：生成合法字面量节点。**不要手拼 JS 字符串**。

### 4.3 必须绕过或重构的旧路径（Phase 4 禁止沿用）

| 位置 | 问题 |
|---|---|
| `src/core/call-transformer.ts:35-36` | `const callText = code.slice(...); const mapping = mappings[callText]` → 按文本命中，会替换同文本的所有调用。 |
| `src/core/string-decoder.ts:185-227` | `calls.set(callText, …)`、`mappings[callText]`，同样是文本键。 |
| `src/core/mapping.ts` | `MappingManager` 的键就是 `callText`，`import/export` 都是文本级。 |
| `src/core/pipeline.ts:60` | 把 `manager.export()` 交给 `transformCalls`，整条旧管线都是文本级。 |
| `src/extension/devtools/panel.ts:864-879` | 「加入映射」按选中文本构造 `externalMappings`，最终仍进入 `call-transformer`。 |
| `src/extension/sandbox/sandbox.ts:76-79` | 把 `externalMappings` 原样传给旧 `recover`。 |

**结论**：Phase 4 要新增独立的**位置级替换入口**，不要改旧管线的语义；旧管线保留给「静态还原 / 手动文本映射」旧功能，但**不得**成为 Phase 4 的替换通道，也不得让手动映射绕过 verified 资格检查。

### 4.4 是否已经修改代码

**没有。** 本轮只做了：读取文件、运行 Vitest / build / tsc、创建了本文档。`src/`、`test/`、`scripts/` 均未改动。

---

## 5. Phase 4 技术要求（下一会话必须实现）

### 5.1 核心原则

- 以**位置级 AST 替换**为唯一自动替换方式。
- 只替换 `verified` 且 dry-run 通过的候选；`pending / unstable / failed / insufficient` 一律拒绝，且**不允许通过配置绕过**。
- 原始源码只读；还原结果是独立生成的新字符串。
- 任何不确定都拒绝，宁少不错。

### 5.2 建议的模块设计（尚未创建）

新建 `src/core/verified-replacer.ts`（或 `positional-replacer.ts`），建议签名：

```ts
export interface ApplyResult {
  code: string;                         // 替换后的完整源码
  applied: AppliedReplacement[];        // 实际替换记录
  rejected: RejectionWithReason[];      // 未替换项（含状态/安全检查原因）
  stats: {
    captures: number;        // 总捕获记录
    verified: number;        // verified 组数
    dryRunPassed: number;    // dry-run 候选数
    replaced: number;        // 实际替换数
    rejectedByStatus: Record<'unstable'|'insufficient'|'failed'|'pending', number>;
    rejectedByPosition: number;   // 位置不唯一/缺失/偏移失效
    rejectedByScript: number;     // 脚本身份或版本不匹配
    rejectedOther: number;
  };
}
```

关键实现要求：

1. **脚本身份与版本**：`ReplacementCandidate` 目前**没有**源码哈希字段。Phase 4 必须补一个 `scriptHash`（建议 SHA-256 或稳定哈希）到候选或应用时重新计算并比对；脚本源码变化（长度或哈希不同）即令旧候选失效，返回 `script-version-mismatch`。这是当前代码的**缺口**，不要假设已有。
2. **区间校验**：应用前按 `start/end` 排序，检查 `start < end`、区间不重叠、每个区间在源码范围内、且该区间确实对应一个 `CallExpression`（用 `findCallPathsAt` 或遍历核对 `node.start === start && node.end === end`）。
3. **从后往前应用**：按 `start` 降序切片拼接，避免前面的替换改变后面偏移。禁止在 `traverse` 中修改后再用已失效的 `path.node`。
4. **字面量生成**：用 Babel 生成合法节点，而不是手拼。字符串、中文、引号、反斜杠、换行、Unicode 都必须正确转义。现有 `replacement` 文本是 `JSON.stringify(value)`，能处理引号/反斜杠/换行，但对 `U+2028/U+2029` 和极端 Unicode 不如 Babel generator 稳妥；建议用 `t.valueToNode(value)` + `generateCode` 生成字面量文本，或直接 AST 替换后统一 `generateCode`。
5. **null 支持缺口**：`replacementOf` 目前只支持 string / 非负有限 number / boolean，**不支持 null**。Phase 4 测试清单第 17 项要求 null，需要扩展 `replacement-safety.replacementOf`（加 `NullLiteral`）并同步 `ReplacementNodeType`、`after` 类型与测试。这是明确的待办，不要遗漏。
6. **多节点**：同一脚本多个 verified 位置要一次应用；复用同一份 AST 和 dry-run 结果，不要每替换一个节点就重新解析整个脚本。
7. **失败原子性**：任一候选校验失败只拒绝该候选；若最终拼接失败，必须返回**原始源码不变**并给出错误，不允许产生半截损坏代码。
8. **原始代码保护**：函数只接收源码字符串，不写回文件、不写回 `activeScript.source`；还原结果放 `activeScript.recovered`（现有字段）。
9. **报告**：APPLY 结果要能区分「捕获数量 ≠ 替换数量」，逐条包含 `original / replaced / position / groupId / status`。

### 5.3 面板接入（不重设计布局）

- 在现有捕获面板 / 还原区增加「应用已验证替换」按钮（现有 dry-run 按钮 1630 行旁边是合适位置）。
- 按钮行为：重新跑 `validateCaptures` + `dryRunReplacements`（或复用已有结果）→ 调沙箱新方法（如 `applyVerified`）→ 把结果写入 `activeScript.recovered` 并 `renderCodeWithLineNumbers(codeRecovered, …)`。
- 展示：替换数量、拒绝数量、按原因分组、每个候选状态、失败原因。保持原始/还原双栏与现有抽屉结构。
- 「加入映射」保留，但必须明确是**文本级手动映射**；不得因为手动映射而跳过 verified 检查。若要让它参与自动替换，必须先把它落成有唯一位置的记录。

---

## 6. 已经确定的决策（不得擅自改变）

1. **Discovery 默认门槛 high**；medium 必须由用户主动选择（面板 `cap-min-confidence` 下拉，选项 `high` / `medium`）。
2. **`rejectUnresolvedHelpers: true` 默认不变**，不得因覆盖率低而放宽。
3. **单次观测**只在严格静态条件全部满足时 verified；硬性安全条件不可配置绕过。
4. **数组旋转不做阶段化映射**（属未来增强方向）；同参不同值一律 unstable。
5. **不降低不稳定映射的拒绝标准**；不因提高覆盖率放宽验证。
6. **所有验证数量来自 `validation-stats`**，引擎 `getStability` 的 unstable 单独命名，二者不得混用。
7. **验证状态不是 verified 的映射绝不自动替换**，无任何开关可绕过。
8. **Phase 4 不实现**变量语义恢复、控制流还原，不进入 Phase 5。
9. **不修改网站原始源码**，不改 `test/fixtures/real-ob/obfuscated.js`（SHA-256 `f0e5b6c7198cfb69f51ac427eba095219c5db86c74cb2970e8fba3be99fa6315`，与 metadata 一致）。
10. 真实样本高门槛（high）候选为 0 是已知事实；medium 下 12 个候选、mismatch 0。是否改默认门槛**尚未决定**，不要自行改动。

---

## 7. 测试与构建现状（交接时实测）

- **Vitest**：29 个测试文件，**320 passed，3 skipped（323）**。运行命令需用 `cmd /c "D:\Nvm\nodejs\npm.cmd test"`（PowerShell 直接跑 `npm` 会被执行策略拦截）。
- **Vite build**：通过。`dist/panel.js` 111,966 字节，`dist/sandbox.js` 41,853 字节，`dist/background.js` 36,403 字节。`panel.js` 因直接打包验证与统计模块而变大，是否可接受尚未评估。
- **tsc --noEmit**：306 行输出；`src/` 错误仍是 6 个历史文件共 43 处：
  - `cdp-client.ts` 17、`panel.ts` 12、`background.ts` 10、`types/index.ts` 2、`core/generator.ts` 1、`devtools.ts` 1。
  - 新增 core 模块零错误。其余错误集中在 `scripts/` 与 `test/helpers/`，均为缺 `@types/node`（`node:vm`、`node:child_process` 等）。
  - 交接时没有「改动前总数」可比对，只能说 `src/` 错误来源未变，不能声称总数未增加。
- **真实 Chrome 扩展测试**（无头 Chrome 155 + 真实 DevTools 前端 + 真实 panel + 真实 SW + 真实 `chrome.debugger`，程序化操作、非人工鼠标）：
  - 真实 OB 样本 high：73 条记录 / 37 组 / verified 28 / unstable 9 / dry-run 候选 0。
  - 真实 OB 样本 medium：99 条记录 / 63 组 / verified 40 / unstable 9 / failed 14 / dry-run 候选 12，候选替换文本与对照值 12/12 一致。
  - 自建验证页：统计之和等于合计；面板被切到 Sources 时统计仍更新；清空归零；刷新后旧脚本计 failed。
  - 网站 `hangzhou.qccqcc.com`：403 Forbidden，页面脚本 0，**不可验收**。
- **原始 CDP 测试**：本轮没有新增；3.1 有 `scripts/capture-e2e.ts` 等历史结果。
- **人工验证**：没有做。

常用命令（Windows / PowerShell）：

```
cmd /c "D:\Nvm\nodejs\npm.cmd test"
cmd /c "D:\Nvm\nodejs\npm.cmd run build"
cmd /c "D:\Nvm\nodejs\npx.cmd tsc --noEmit"
cmd /c "D:\Nvm\nodejs\npx.cmd tsx scripts/devtools-real-ob-e2e.ts"
$env:MIN_CONFIDENCE='medium'; cmd /c "D:\Nvm\nodejs\npx.cmd tsx scripts/devtools-real-ob-e2e.ts"
```

---

## 8. 已知问题与未完成事项

**代码缺口（Phase 4 必须补）**

1. `ReplacementCandidate` 没有脚本源码哈希/版本字段；`ValidationScript` 只有 `scriptId + source + url + startLine/startColumn`。
2. `replacementOf` 不支持 `null`，与测试要求第 17 项冲突。
3. 没有「应用替换」模块，`pipeline.recover()` 仍是文本级替换。
4. 面板「加入映射」仍是文本级，且会绕过 verified 检查进入旧管线。
5. `dist/panel.js` 体积增长未评估。

**验证/测试缺口**

- 三个拒绝分支无测试：`unexpected-parent`、`function-ambiguous`、`callee-binding-unresolved`。
- 压缩单行、多行调用、成员调用、eval、动态脚本的位置映射未验证。
- 别名式旋转无法静态识别；纯内置白名单未用真实样本检验。
- 真实网站样本只有 403 失败记录，没有成功验收。

**其他**

- 项目不是 git 仓库，没有版本回退；改动前请备份。
- 3.1 遗留：捕获断点命中会让 DevTools 跳到 Sources，需要手动切回。
- 历史验收文件 `layout-check.json` 与 `layout-screens/` 在 3.2 收尾时被重跑覆盖，旧版备份在仓库外 `C:\Users\Administrator\TEMP\opencode\layout-backup-p31`。

---

## 9. 下一步具体任务（新会话从这里继续）

按顺序执行，每步都要有实际断言，不要只做状态标记：

1. **扩展字面量与版本能力**
   - `src/core/replacement-safety.ts`：`replacementOf` 支持 `null` → `NullLiteral`；同步 `ReplacementNodeType`。
   - 给 `ReplacementCandidate` 增加 `scriptHash`（或提供应用时校验所需的源码身份），并补测试。
2. **实现 `src/core/verified-replacer.ts`**
   - 输入：`DryRunResult`（或 `ValidationReport + scripts`）、`scripts`。
   - 输出：`{ code, applied, rejected, stats }`，按第 5.2 节要求做区间校验、降序应用、原子失败。
   - 字面量用 Babel 生成，覆盖中文、引号、反斜杠、换行、Unicode、数字、布尔、null。
3. **新增 Phase 4 测试**（建议 `test/verified-replacer.test.ts`，至少覆盖第八节 22 项）
   - 重点：同文本只有一处 verified → 只替换该处；同文本一处 verified 一处 unstable/insufficient/pending → 只替换 verified；同参数不同位置；脚本身份/版本不匹配；位置缺失/不唯一/区间重叠；truncated；原始代码不变；重新分析后旧记录失效；手动映射不能绕过；原始/还原独立。
   - 测试数据继续复用 `test/helpers/capture-driver.ts`（真实引擎 + vm 真实执行）。
4. **面板接入**
   - 增加「应用已验证替换」入口，调用沙箱新方法，展示替换/拒绝统计与逐条报告；不改变现有布局与双栏。
5. **全量验收**
   - `npm test`、`npm run build`、`tsc --noEmit`。
   - 真实扩展流程：真实 OB 样本 high + medium 两种门槛；再补一个「同文本不同位置」的专用验收页面（建议加在 `test-pages/`，并在结果 JSON 中给出逐位置替换证据）。
   - 明确区分单元测试 / 原始 CDP / 真实扩展 / 真实样本 / 人工 / 未验证。
6. **更新 `test/acceptance/PHASE4-REPORT.md`**，写清已通过、未通过、未验证，以及位置级替换的证据（同文本只替换已验证位置）。
7. **停止**，不进入 Phase 5，等待验收。

---

## 附：关键数据结构速查

```ts
// capture-engine.ts
interface DecoderCapture {
  key: string; scriptId: string; scriptUrl: string;
  functionName: string; functionLocation: CdpPosition;
  callLocation: CdpPosition;            // 首次出现位置，未知为 -1
  callLocations: CdpPosition[];         // Phase 3.2 新增，全部不同位置（≤50）
  callLocationsTruncated?: boolean;
  arguments: RuntimeValue[]; returnValue?: RuntimeValue;
  captureStatus: 'success' | 'capture-failed'; reason?: string;
  count: number; firstSeq: number; lastSeq: number; timestamp: number;
}

// capture-validation.ts
type ValidationStatus = 'pending' | 'verified' | 'unstable' | 'failed' | 'insufficient';
interface ValidationScript { scriptId: string; source: string; url?: string; startLine?: number; startColumn?: number; }
interface GroupValidation {
  id; functionId; scriptId; scriptUrl; functionName; functionLocation;
  arguments; status; reasons: ValidationReason[]; warnings: ValidationReason[];
  observations; failedObservations; distinctReturns; conflict; returnSamples;
  callLocations; callLocationsTruncated; lastCapturedAt; captureKeys;
  functionSuspect: boolean; evidence: 'multiple-observations' | 'single-observation' | 'none';
}

// replacement-dryrun.ts
interface ReplacementCandidate {
  groupId; functionName; scriptId; scriptUrl;
  position: CdpPosition; start: number; end: number; callText: string;
  before: 'CallExpression'; after: 'StringLiteral'|'NumericLiteral'|'BooleanLiteral';
  replacement: string; value: string|number|boolean; parentType: string;
  observations: number; notes: ValidationReason[]; textKeyConflicts: SameTextCall[];
}
```

`CdpPosition` 行列从 0 开始；Babel 行号从 1 开始、列从 0 开始，换算处一律 `line - 1`。
