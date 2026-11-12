# Phase 4.7：真实网站端到端验收方案（测试计划）

日期：2026-11-10　项目：`D:/Projects/ob-recover`　状态：**仅设计，未执行**
前置：Phase 4.6、4.6.1 已完成，报告见 `docs/PHASE4.6-P0-REVIEW.md`、`docs/PHASE4.6.1-STABILITY-REPORT.md`。
本文件不进入 Phase 5、不新增 MCP 桥接、不修改 OB-Recover 产品代码。方案批准后才开始执行。

## 0. 摘要

- 目标：用真实网站上真实下发的 OB 混淆脚本，验证 OB-Recover 的发现、捕获、验证、dry-run、位置级替换是否真的可用，并用**独立产生的参考答案**逐位置对照。
- **核心目标（原文）**：

  > OB-Recover 能在真实 OB 网站中，独立完成发现、捕获、验证和 AST 替换，同时不产生任何错误替换，也不破坏原始源码。

  本阶段的验收重心是**正确性与不破坏性**，不是还原数量。Recall 可以因样本难度而不达标（见 8.4），但 `false-replacement` 必须为 0，原始源码必须一字不变。任何"多还原了几处但错替换了一处"的结果，一律判不通过。
- 协作方式：Skill 与 OB-Recover **不联动、不同时操作一个浏览器**。Skill 先独立取证并关闭浏览器，OB-Recover 再用自己的专用 Chrome 独立跑完，最后离线对照。理由见第 5 节。
- 三层验证：**真实网站**（主验收，脚本可能变化）、**固定源码**（可重复、可判定）、**受控浏览器回放**（在 Chrome 里跑我们自己的 OB 脚本，补真实站点拿不到的边界场景）。
- 判定基线：脚本哈希不一致时标记 `version-mismatch`，**不得做位置级对照**，该 run 的所有位置级指标记 `n/a`；同哈希才允许逐位置比较。
- **硬性通过条件（任一违反即判 Phase 4.7 不通过，不接受重跑覆盖）**：
  1. **误替换数量 = 0**（`false-replacement` = 0）；
  2. **原始源码字节完全不变**——对原始脚本字符串算 SHA-256，三处一致；**只比较格式化后的源码不算通过**；
  3. Safe Rejection Rate = 100%；
  4. 发生替换时 Precision = 100%。
- **五类结果互斥且穷尽**，禁止把"证据不足"合并进"成功还原"：`correct-replacement`（正确替换）、`safe-rejection`（安全拒绝，参考本就标注不确定）、`insufficient-evidence`（证据不足）、`version-mismatch`（版本不一致）、`false-replacement`（错误替换）。定义见 7.1，指标计算见 8.2。
- 现有资产：`test/fixtures/real-ob/` 是本地 `javascript-obfuscator` 5.9.0 生成的样本（不是真实站点脚本），`test/fixtures/real-samples/` 是 5 个静态真实混淆样本（没有运行时参考答案）。两者都不满足本方案对"独立参考答案"的要求，需要新建样本包，见第 3 节。
- 已知会失败的一类：`atob` 等被 V8 拒绝的表达式。策略是接受"证据不足"计入 `insufficient-evidence`，**不降低 `throwOnSideEffect`**，另设纯 JS 解码器正向用例，见第 6.1 节。
- Phase 3 挂起：按"未复现、根因不明、已增加等待界限"记录，**禁止**写成"根因已解决"，并新增 Service Worker 回收专项测试，见第 6.1 节。

### 0.1 `activeScript.source` 语义核实（已完成，不改架构）

Phase 4.7 依赖"原始源码字节不变"这条硬性条件，因此先核实 `activeScript.source` 到底保存什么。结论：**它保存原始源码，替换结果写入另一个字段，不需要改任何产品代码。**

| 检查点 | 代码位置 | 内容 |
|---|---|---|
| 类型定义 | `src/extension/devtools/panel.ts:20-31` | `source: string`（必填）与 `recovered?: string`（可选）是两个独立字段 |
| 唯一的写入点 | `src/extension/devtools/panel.ts:170-171` | `addScript(url, source)` 里 `const script: Script = { url, source, size: source.length }`，来源是网络响应体（`request.getContent`） |
| 第二条还原路径 | `src/extension/devtools/panel.ts:244`、`894` | 只写 `activeScript.recovered = result.code`，不碰 `source` |
| Phase 4 应用替换 | `src/extension/devtools/panel.ts:1770` | `activeScript.recovered = result.code`，注释写明"更新 activeScript.recovered" |

由此确定：

1. **哪个对象保存原始源码**：`Script.source`（`panel.ts:22`），唯一写入点是 `addScript`，此后全文件再无第二处写入。grep 全部 9 处 `source:` 匹配中，只有 `panel.ts:170` 的函数参数是写入，其余是读取（`56`、`85`、`1432`、`1757`）或对象字面量里的无关字段（`880`、`889` 的 `source: 'runtime-capture'` 是 transform 类型标记）。
2. **哪个对象保存还原后的源码**：`Script.recovered`（`panel.ts:24`）。三条产出路径（旧文本级 `recover`、手动映射、Phase 4 `apply-verified`）都只写 `recovered`。
3. **原始源码的 SHA-256 应在哪些环节保持一致**（三处，缺一不可）：
   - 参考侧归档的 `script.sha256`；
   - OB-Recover 捕获时从 CDP `Debugger.getScriptSource` 读到的源码；
   - 替换完成后再读一次的 `activeScript.source`。
   
   三处必须完全一致。**只比较格式化后的源码不算通过**——格式化输出（`panel.ts:201-205` 的 `_formatted`）只用于展示。
4. **还原源码允许变化，但不得反向修改原始源码**：`recovered` 是独立字符串，`applyVerifiedReplacements` 只返回新字符串、从不写回输入（`src/core/verified-replacer.ts` 的 `ApplyResult.code` 是返回值）。引擎是纯函数，`ValidationScript.source` 只读。
5. **设计上的自洽证据**：`panel.ts:1716` 的脚本重解析用 `s.source === activeScript!.source` 做相等判断。如果 `source` 在替换前后被改过，这个匹配会失效——反证 `source` 在整个流程中必须保持不变。

因此 Phase 4.7 取这三处哈希即可判定"原始源码字节完全不变"，无需修改产品代码、无需新增桥接。

## 1. 测试架构

三层，互相独立、结果分开记录，不得互相顶替。

| 层 | 输入 | 能否判定"同脚本端到端" | 用途 |
|---|---|---|---|
| L1 真实网站 | 目标站点当次下发的脚本 | 能（哈希一致时） | 主验收 |
| L2 固定源码 | 已归档的脚本文件 | 能，且可重复 | 回归、指标计算基线 |
| L3 受控回放 | 我们自己的 OB 脚本 + 本地页面 | 能，但不是真实站点证据 | 边界场景：同文本、旋转、状态依赖、副作用、动态下发 |

数据流：

```
L1:  Skill 浏览器取证 ──> reference/  ──┐
    OB-Recover Chrome ──> observed/   ──┼──> 离线对照脚本 ──> 报告
L2:  固定源码归档     ──> reference/  ──┤
    OB-Recover (Node/扩展) ──> observed/ ┘
L3:  本地页面 + 扩展   ──> observed/  ──> 与页面自报真值对照
```

三者共同遵守：**参考答案与 OB-Recover 的产出在物理上分开保存**，对照只在离线阶段做。

## 2. Skill 与 OB-Recover 的职责边界

### Skill（`web-protocol-recovery` + `js-reverse-mcp`）负责

1. 选目标站点并正常访问（recon）。
2. 找到真实下发的 OB 混淆脚本，保存**原始字节**、URL、scriptId、SHA-256、获取时间。
3. 识别解码函数和它的调用位置。
4. 取真实调用参数与真实返回值（断点/暂停帧读取或 hook，方式由 Skill 决定）。
5. 记录关键请求与业务参数，作为"业务逻辑是否一致"的参考。
6. 把上述内容写成参考答案包，然后**关闭它自己的浏览器**。

### Skill 不得

- 修改 `test/fixtures/**`、`test-pages/**`、OB-Recover 的源码、验收脚本或任何结果 JSON。
- 把"它手动执行得到的结果"冒充成"OB-Recover 捕获到的结果"。两者的原始记录必须能区分来源。
- 在 OB-Recover 运行期间保留任何浏览器或调试会话。

### OB-Recover 负责

1. 用专用 Chrome 独立完成：Decoder Discovery → Runtime Capture → Verification → Dry Run → AST Replacement → 还原源码输出。
2. 记录自己的全部中间产物（捕获记录、验证分组、候选、拒绝原因、还原源码）。用现有 `globalThis.__obRecoverTest` 钩子和面板读取，不新增产品代码。
3. 不做任何"为了通过验收"的调整。

### 边界执行方式

不新增桥接。Skill 的产出是一份**文件**；OB-Recover 的产出也是一份**文件**；对照脚本是第三个进程。三者之间没有任何进程内耦合。

## 3. 测试样本格式

新建目录 `test/fixtures/real-ob-sites/`（与现有 `real-ob/`、`real-samples/` 并存，不覆盖）。

```
test/fixtures/real-ob-sites/
  registry.json                     # 站点/样本总索引
  <site-id>/
    <run-id>/                       # 每次取证的独立快照，run-id 形如 20261110T143012
      script.js                     # 原始脚本字节，未做任何改写
      script.sha256                 # SHA-256（hex），与 script.js 严格对应
      meta.json                     # 见下
      reference/
        decoders.json               # 解码函数：位置、签名、来源方式
        call-sites.json             # 调用位置 + 参数 + 真实返回值
        business.json               # 关键请求/业务参数（用于逻辑一致性对照）
        NOTES.md                    # 获取方式、工具、授权说明、不确定性
      observed/                     # OB-Recover 的产出（阶段 B 写入）
        captures.json
        validation.json
        dryrun.json
        recovered.js
        apply.json
      compare.json                  # 离线对照结果（阶段 C 写入）
```

`meta.json` 最少字段：

```json
{
  "siteId": "example-site",
  "runId": "20261110T143012",
  "url": "https://example.com/static/app.js",
  "scriptId": "42",
  "sha256": "<64 hex>",
  "bytes": 123456,
  "fetchedAt": "2026-11-10T14:30:12+08:00",
  "capturedBy": "skill|ob-recover",
  "tooling": "js-reverse-mcp v4.0.5",
  "obfuscator": "unknown|javascript-obfuscator:<version>|other",
  "decoderHints": { "count": 3, "naming": "_0x..." },
  "uncertainties": ["脚本可能按请求动态下发", "解码函数依赖 atob"]
}
```

强制规则：

- `capturedBy` 必须如实填写；同一 `run-id` 下 `reference/` 与 `observed/` 的来源不可互换。
- `script.js` 一旦归档**不得再修改**，哈希不符即视为新 run。
- 参考答案必须独立于 OB-Recover 产生：`reference/` 只允许由 Skill 或人工写，不得由 OB-Recover 的输出反推。
- 现有 `test/fixtures/real-ob/obfuscated.js`（SHA-256 `f0e5b6c7…fa6315`）保持只读，不并入新样本包，作为 L2 的固定源码之一登记进 `registry.json`。
- `real-samples/*/expected.js` 是别的工具的输出，**不得**作为 oracle 使用，只能作为"另一种还原结果"的参考。

## 4. 脚本身份校验

三条独立校验，缺一不可：

1. **字节级哈希**：归档脚本的 SHA-256，与 OB-Recover 运行时从 CDP 拿到的源码（同一字符串，逐字符，不做换行归一化、不剥 BOM）比对。用现有 `hash-utils.ts` 的算法口径。
2. **长度与行数**：`bytes` 与 `split('\n').length` 一并比对，用于区分"哈希碰撞级别的巧合"和"确实同一份"。
3. **业务锚点**（可选但推荐）：参考包里记录 1 到 2 个字符串常量或 URL 片段，确认两边看到的是同一个业务逻辑版本。

判定规则：

| 情况 | 处理 |
|---|---|
| 哈希一致 | 允许逐位置对照，可作为"同脚本端到端验收"的成功证据 |
| 哈希不一致 | 标记 `version-mismatch`（五类分类之一，见 7.1）；**不得**按源码位置强行对照；该 run 的所有位置级指标记 `n/a`，不计入任何率；只能记录为"站点下发了不同版本" |
| OB-Recover 侧拿不到脚本或源码为空 | 记录为阻塞项，不算失败也不算通过 |

动态下发脚本是本阶段重点防范的干扰项。若目标站点每次请求都下发不同字节，则 L1 只做"发现与捕获可用性"验证，位置级对照挪到 L2 和 L3。

## 5. 真实网站测试流程（L1）

阶段严格串行，**禁止两个工具同时持有同一页面的 Debugger**。

### 阶段 A：Skill 独立取证

1. 正常访问目标站点，等待业务脚本加载。
2. 定位含 OB 混淆的脚本，保存原始字节、URL、scriptId、SHA-256、时间。
3. 识别解码函数与调用位置；取真实参数与真实返回值；记录关键请求。
4. 写出 `reference/` 与 `meta.json`（`capturedBy: "skill"`）。
5. **关闭浏览器**，确认无残留进程、无遗留断点。

### 阶段 B：OB-Recover 独立测试

1. 启动**专用 profile** 的 Chrome（不共用阶段 A 的任何状态），加载 `dist` 扩展。
2. 打开同一目标站点。**先做哈希核对**：从 CDP 取脚本源码，与 `reference` 的 `script.sha256` 比对。
   - 不一致 → 立即记录 `version-mismatch`，本次不进入位置级对照，所有位置级指标记 `n/a`；可重试取证，或改用 L2/L3。
3. 一致 → 按现有流程跑：连接调试器 → Discovery（默认 `high`，另开一轮 `medium`，由用户选择）→ 开始捕获 → 让页面自然执行（含用户交互，若业务逻辑需要）→ 停止捕获。
4. 取全部中间产物写入 `observed/`。
5. 关闭浏览器，确认无残留。

### 阶段 C：离线对照

不接触浏览器。对照脚本读 `reference/` 与 `observed/`，按第 7 节指标产出 `compare.json`。对照过程中**不得**修改任何输入文件。

### 本阶段承诺沿用、不新建的机制

- 入口沿用 `scripts/devtools-real-ob-e2e.ts`（它已支持 `TARGET` 环境变量指向外部站点，并在外部站点时跳过 ground truth 步骤）。Phase 4.7 需要的是把它的输出写进新样本目录，不是另写一套。
- 扩展能力读取沿用 `globalThis.__obRecoverTest.getCaptureState`。
- 新增的只有：样本目录约定、离线对照脚本、报告生成。这些都属于测试侧，不在 `src/` 内。

## 6. 固定源码测试流程（L2）与受控回放（L3）

### L2 固定源码

1. 输入：`test/fixtures/real-ob/obfuscated.js`、`real-samples/{01..05}/input.js`，以及 L1 归档的 `script.js`（哈希固定）。
2. 跑法：用 Node 侧真实 `CaptureEngine` + `node:vm`（沿用 `test/helpers/capture-driver.ts` 的机制）或直接 `validateCaptures → dryRunReplacements → applyVerifiedReplacements`。
3. 优点：可重复、可判定、不受站点版本漂移影响；这是**计算大部分指标的主基线**。
4. 限制：`node:vm` 是我们自己的执行环境，不覆盖 Chrome/Blink 的宿主函数行为（见第 6.1 节）。
5. 现有基线（仅是历史输出，不是本次运行）：真实 OB 样本 dry-run 在 `high` 门槛 0 个候选，`medium` 门槛 12 个候选且与 oracle 12/12 一致。这是 Phase 3.2 的结果，Phase 4 的 `apply-verified` 尚未在这条链路上跑过。

### L3 受控浏览器回放

1. 新建或复用 `test-pages/` 下的页面，页面里放**我们自己的 OB 脚本**，并在页面内自报真值（例如把解码器对每个索引的结果写进 `window.__truth`）。
2. 覆盖真实站点难以稳定复现的场景：同文本不同位置、数组旋转、状态依赖、带副作用、动态插入的脚本、内联脚本（起始偏移不为 0）。
3. 判定：扩展的还原源码 vs 页面自报真值；同时校验"未验证的位置保持原样"。
4. 注意：这是**受控场景**，不能当作真实网站证据，报告中必须单独归类。

### 已登记的退化项

交接文档 8.7 指出 `test-pages/phase4-position-level-auto.js` 的位置 B 已被改成不同参数，削弱了"同文本只替换已验证位置"的意图。L3 需要**恢复**这一场景（重新构造页面或改用单元级构造，后者优先，不依赖浏览器）。

## 6.1 特殊问题处理

### `atob` 等被 V8 拒绝的表达式

Phase 4.6.1 已确认：Chrome 155 的 V8 对 `atob`、`btoa` 一律返回 `EvalError: Possible side-effect in debug-evaluate`，即使被求值的函数本身是纯函数。

处理方式（已定，不接受任何形式的降级）：

1. **接受证据不足**：涉及 `atob` 类调用的手动求值记为 `insufficient-evidence`（被拒时为 `side-effect-blocked`），不进入 verified。这是策略的**正确结果**，不是缺陷。这些位置**不得**被计入"成功还原"。
2. **不降低 `throwOnSideEffect`**：手动求值固定 `throwOnSideEffect: true`，本阶段不引入任何降级路径，不为任何样本、任何指标、任何站点开启 `false`。
3. **另设纯 JS 解码器正向测试**：单独构造只做数组查找、字符串拼接、`String.fromCharCode`、`decodeURIComponent`、`parseInt` 的解码器，作为"手动求值可用"的**正向验收**。这些函数在 4.6.1 的 Chrome 探针里确认被 V8 放行（同批探针中被拒的是 `atob`、`btoa`、全局赋值、缓存写入）。
4. **不得**为了让某项通过而关闭 `throwOnSideEffect`、放宽 verified 标准、修改验收脚本或测试页。
5. **报告必须区分**三种情况，不得混为一谈：
   - 因安全策略被正确拒绝（`side-effect-blocked`，属 `safe-rejection` 或 `insufficient-evidence`）；
   - 因能力不足而未还原（参考可确定，但 OB-Recover 拒绝，属 `insufficient-evidence`）；
   - 真正的缺陷（例如本该拒绝却被替换，属 `false-replacement`）。
6. 若某站点的解码器**普遍**依赖 `atob` 类宿主函数，导致手动求值路径基本不可用：这只影响 Recall，不影响 Precision 与 FR；必须在报告的"限制"一节写明，不得因此调整安全策略。

### Phase 3 不明挂起

**结论定性：未复现、根因不明、已增加等待界限。不得描述为"根因已解决"，不得描述为"已修复"。**

4.6.1 用修复前构建和新构建各跑 5 次，共 10 次未复现。本阶段的处理与记录要求：

1. 保留已有的等待上限（引擎命令 5 秒、`sendCommand` 30 秒、验收脚本 20 秒），不加长也不缩短。这些界限的作用是"把挂起变成可诊断的失败"，**不是**修复根因。
2. 新增 **Service Worker 回收专项测试**：让背景页被回收而调试会话仍在，观察我们自己的断点暂停是否被丢弃、页面是否停在断点上。这是 4.6.1 未验证的主要假设，本阶段必须给出明确结论（"确认发生"/"确认不发生"/"仍无法确定"三选一），不得含糊带过。
3. 每次真机运行都保存诊断（捕获状态、最近面板消息、页面是否响应），失败时不得只有一个"超时"。
4. 若再次出现挂起：先保留现场，再定位是产品侧还是脚本侧，不得直接重跑当没发生。
5. 报告中该条目的措辞模板（固定使用）："Phase 3 挂起：未复现（修复前后各 5 次，共 10 次 0 次挂起）；根因不明；已增加等待界限使挂起可诊断；Service Worker 回收专项测试结论为 X。" **禁止**出现"已修复""根因已定位""问题已解决"等表述。

### 不得制造通过结果

- 不关闭安全检查，不放宽判定，不改验收脚本。
- 失败项必须原样记录；"重跑一次通过"不能覆盖失败记录。
- 未验证项不得写成通过。

## 7. 离线对照方案

对照脚本（新增，测试侧）读取同一 `run-id` 下的 `reference/` 与 `observed/`，输出 `compare.json`。

对照维度（每一项都必须输出到五类分类里，见 7.1，不得只给汇总数字）：

1. **解码函数识别**：参考集合 vs 发现集合；匹配按"函数位置 + 名称"。命中数进入报告，未命中的解码函数逐条列出。
2. **调用位置识别**：按 `{scriptId, lineNumber, columnNumber}` 精确比较；位置列表被截断时单独标注；`ast-position-not-found` 与 `ast-position-ambiguous` 必须为 0。
3. **运行时捕获正确性**：同参数、同返回值的记录是否一致；计数不做等值要求，只做"是否有观测"。
4. **验证结果**：参考认为确定 vs OB-Recover 判 verified；差异按 7.1 分类，不得笼统写成"验证通过 N 项"。
5. **替换位置**：逐位置比较，每个参考位置输出 7.1 中的五类标签之一。
6. **误替换（`false-replacement`）**：参考里不该被替换的位置被替换了 → **最高严重级**，必须逐条列出位置、参考判定依据、实际替换值。任何一条存在即判本次 run `not-pass`。
7. **未还原（`insufficient-evidence`）**：参考可确定但未被替换 → 记录原因码（来自 `apply.rejected`）与拒绝阶段（dry-run / 引擎 / 验证层）；同时区分"因安全策略正确拒绝"与"因能力不足"。
8. **安全拒绝（`safe-rejection`）**：参考本就标注不确定的位置是否被拒；有未拒的即为 `false-replacement`。
9. **源码完整性**：对**原始脚本字节**算 SHA-256，三处比对——参考归档的 `script.sha256`、OB-Recover 捕获时从 CDP 读到的源码、替换完成后 `activeScript.source`（原始面板）。三者必须完全一致。**只比较格式化后的源码不算通过**，格式化输出仅作展示层对照。算法口径与 `hash-utils.ts` 一致：逐字符、不做换行归一化、不剥 BOM。
10. **业务逻辑一致性**：`recovered.js` 与参考脚本在关键请求参数/业务输出上是否等价；输出 `pass` / `fail` / `not-evaluated` 三态；无法评估时必须显式写 `not-evaluated`，不得省略、不得当通过。

对照脚本的硬性要求：

- 输入只读，输出只写 `compare.json`。
- 哈希不一致时不输出任何位置级结论，只输出 `version-mismatch`；该 run 的所有指标记 `n/a`。
- 每条结论必须能追溯到具体的 `reference` 条目和 `observed` 条目（位置、原因码、拒绝阶段）。
- 必须输出五类分类的完整计数（`correct-replacement` / `safe-rejection` / `insufficient-evidence` / `version-mismatch` / `false-replacement`），不得只输出"成功 N 项"。
- 分母为 0 的指标输出 `n/a`，**不得**输出 `0` 或 `100%`。

## 7.1 结果分类学（五类，互斥且穷尽）

每一个"参考位置"（reference 里记录的一个调用位置）在对照后必须落入且只落入以下一类。**禁止把"证据不足"合并进"正确替换"**，也禁止用"未替换"一个桶笼统统计。

| 类别 | 代码 | 定义 | 是否算还原成功 |
|---|---|---|---|
| 正确替换 | `correct-replacement` | 参考判定该位置可确定，OB-Recover 也判 verified 并在这个位置完成了替换，替换值与参考值一致 | 是 |
| 安全拒绝 | `safe-rejection` | OB-Recover 拒绝了这个位置，且**拒绝理由与参考中的不确定性一致**（参考本就标注该位置不确定：unstable / insufficient / failed / 结构不可判定） | 否（但**不是缺陷**，是设计正确行为） |
| 证据不足 | `insufficient-evidence` | OB-Recover 判 `insufficient`，参考认为该位置**本可确定**，或参考自身也无法确定 | 否 |
| 版本不一致 | `version-mismatch` | 脚本哈希不一致，该 run 不参与位置级对照 | 否（单独归类，不计入任何率） |
| 错误替换 | `false-replacement` | 参考判定该位置**不可替换**（不确定、有副作用、不可靠），OB-Recover 却完成了替换 | 否，且是**最高严重级缺陷** |

补充规则：

- `safe-rejection` 与 `insufficient-evidence` 的差别只看**参考是否本来就标注该位置不确定**，不看 OB-Recover 的拒绝码文案。
- 参考中标注 "不确定" 的位置，OB-Recover 拒绝 → `safe-rejection`；OB-Recover 替换 → `false-replacement`。
- 参考中标注 "可确定" 的位置，OB-Recover 拒绝 → `recall` 缺失（计入 Unresolved，见下）；OB-Recover 替换且值正确 → `correct-replacement`；替换但值错误 → `false-replacement`。
- 原始源码字节变化 → 该 run 直接判 `not-pass`，并且其中的每一处变化都按 `false-replacement` 记录，不管值与参考是否一致。

## 8. 验收指标

### 8.1 硬性通过条件（0 容忍）

以下两条**任何一次违反都不能判定 Phase 4.7 通过**，不接受"重跑通过"覆盖：

| 条件 | 判定方式 | 违反后果 |
|---|---|---|
| **误替换数量 = 0** | 五类分类中 `false-replacement` 计数 | 本次 run 判 `not-pass`，且视为阻塞缺陷，必须先定位再继续 |
| **原始源码字节完全不变** | 对**原始脚本字节**（CDP `Debugger.getScriptSource` 拿到的字符串，逐字符）算 SHA-256，替换前后与参考归档的 `script.sha256` 三者比对 | 本次 run 判 `not-pass` |

关于第二条的严格要求：

- 只比较**原始脚本字符串**，**不允许**只比较格式化后的源码。格式化后的源码（`format` 沙箱输出）只能作为展示层对照，**不构成源码完整性证据**。
- 校验点至少三处：参考归档哈希、OB-Recover 捕获时读到的源码哈希、替换完成后的"原始面板源码"哈希（`activeScript.source` 不变，替换只写 `recovered`）。
- 不接受换行归一化、不去 BOM、不做任何字符串预处理——与 `hash-utils.ts` 的口径一致。

### 8.2 指标计算定义

设本次对照的输入为**同一 `run-id` 下、哈希一致**的参考位置集合。所有指标只在这批位置上计算。

| 符号 | 含义 |
|---|---|
| `TP` | `correct-replacement` 的数量 |
| `FR` | `false-replacement` 的数量 |
| `SR` | `safe-rejection` 的数量（参考本就标注不确定） |
| `UN` | `insufficient-evidence` 的数量（参考可确定但未被替换） |
| `R_pos` | 参考判定**可确定**的位置总数（= `TP` + `FR` + `UN`） |
| `R_neg` | 参考判定**不可确定**的位置总数（= `SR` + 参考不确定但被替换的那些 `FR`） |

指标定义：

| 指标 | 公式 | 含义 |
|---|---|---|
| **Precision** | `TP / (TP + FR)` | 在 OB-Recover 实际替换的位置里，有多少是对的。`TP + FR = 0` 时记 `n/a`（本次没有发生任何替换） |
| **Recall** | `TP / R_pos` | 在参考认为可确定的位置里，OB-Recover 成功还原了多少。`R_pos = 0` 时记 `n/a` |
| **False Replacement** | `FR`（绝对数量） | 误替换数量，硬性要求为 0 |
| **Unresolved** | `UN`（绝对数量）与 `UN / R_pos` | 参考可确定但未被还原的位置数，以及占比 |
| **Version Mismatch** | 分类为 `version-mismatch` 的 run 数量 / 总 run 数量 | 版本漂移比例；该 run 不进入任何位置级指标 |
| **Safe Rejection Rate** | `SR / R_neg` | 在参考本就标注不确定的位置里，被正确拒绝的比例，要求 100% |
| **Source Integrity** | 布尔值（哈希三处一致） | 原始源码字节是否完全未变 |
| **Business Parity** | 枚举：`pass` / `fail` / `not-evaluated` | 还原前后关键业务逻辑是否一致 |

补充说明：

- **Precision 与 Recall 的分母不同**，不可互相替代。任何"Recall 很高"的说法都必须同时给出 Precision 和 FR。
- `n/a` 与 `0` 语义不同：`n/a` 表示分母为空（什么都没替换），必须显式写 `n/a`，不得写成 `0` 或 `100%`。
- 分母为 0 时不得默认按通过处理。

### 8.3 通过线

| # | 指标 | 通过线 | 是否可协商 |
|---|---|---|---|
| 1 | **False Replacement** | **必须 = 0** | **不可协商** |
| 2 | **Source Integrity** | **必须为 true**（原始字节 SHA-256 三处一致） | **不可协商** |
| 3 | Safe Rejection Rate | **必须 = 100%** | **不可协商** |
| 4 | Precision | `TP + FR > 0` 时必须 = 100% | 不可协商（等价于 FR = 0） |
| 5 | Recall | 按样本难度分档，见 8.4 | 可协商 |
| 6 | Version Mismatch | 只记录，不设通过线 | — |
| 7 | Business Parity | `pass`；无法评估时记 `not-evaluated`，**不算通过** | 可协商 |
| 8 | 解码函数发现准确性 | L1 至少命中 1 个真实解码函数 | 可协商 |
| 9 | 调用位置识别准确性 | 已观测位置 100% 定位正确（`ast-position-not-found` 与 `ast-position-ambiguous` 均为 0） | 不可协商 |

### 8.4 Recall 目标（按样本难度分档）

Recall **允许**因样本难度不同而设不同目标。但明确禁止用以下方式提高 Recall：

- 放宽 verified 判定标准；
- 打开 `medium` 以外的更低置信度，或把 `medium` 当默认；
- 关闭 `rejectUnresolvedHelpers`；
- 降低 `throwOnSideEffect`；
- 放宽字面量、区间、AST 定位、父节点等任何安全条件。

分档目标（**建议值，待你确认**）：

| 难度 | 判定特征 | Recall 目标 | 说明 |
|---|---|---|---|
| 简单 | 单层字符串数组、无旋转、无状态依赖 | ≥ 0.90 | L2 的 `real-ob/obfuscated.js` 属此档 |
| 中等 | 有旋转 / 有多层包装函数 / 有部分状态依赖 | ≥ 0.60 | L2 中等样本属此档 |
| 困难 | 动态下发、重度控制流、依赖宿主函数（如 `atob`） | ≥ 0.30 且不设上限 | 真实站点常见；此档 Recall 低是**预期**，不是失败 |

规则：**Recall 未达标不等于 Phase 4.7 不通过**，前提是 8.1 的四项硬性条件（`FR = 0`、Source Integrity、Safe Rejection Rate = 100%、Precision = 100%）全部满足，且 Recall 未达标的原因已逐条给出原因码。但必须在报告中明确列出"因安全策略被正确拒绝"与"因能力不足而未还原"的区分。Recall 分档是**观测目标**，不是通过条件；任何试图通过放宽安全策略来提高 Recall 的做法都违反本方案。

### 8.5 重点场景

必须各有专门用例，覆盖在 L2/L3，能在 L1 复现的优先在 L1：

| 场景 | 期望 | 对应指标 |
|---|---|---|
| 同文本不同位置 | 只替换已验证位置，其余原样；`FR` 必须为 0 | FR、Precision |
| 同参数不同返回值 | 判 `unstable`，整组不替换，计入 `safe-rejection` | Safe Rejection Rate |
| 数组旋转 | 不做阶段化映射，同参不同值一律 `unstable` | Safe Rejection Rate |
| 状态依赖 | 读取函数外部可变状态的，判 `insufficient` | Safe Rejection Rate |
| 带副作用的解码函数 | 手动路径被 V8 拒绝（`side-effect-blocked`）或在求值前拒绝；自动路径不重新执行函数；这些位置若被替换则为 `FR` | FR、Safe Rejection Rate |
| 动态下发的脚本 | 哈希不一致 → 不做位置对照，记录 `version-mismatch` | Version Mismatch |

## 9. 测试环境要求

- 系统：Windows；命令一律 `cmd /c "cd /d D:\Projects\ob-recover && npx ..."`（PowerShell 会拦 `npx.ps1`）。
- Chrome：`C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe`（155.0.8059.40），专用 profile 放在 `C:/Users/Administrator/TEMP/opencode/` 下。
- 构建：每次真机前 `npx vite build`，并记录 `dist` 各文件哈希进报告。
- 并发：真机脚本与 Vitest 不能同时跑（Vitest 会往 `dist` 复制静态文件）；多个真机脚本也不能并发。
- 清理：超时只杀本次启动的进程树；不碰用户自己的 Chrome。
- 目标站点：必须是用户**有权测试**的站点；注意请求预算，真实站点测试应控制重放次数。
- 不安装新的依赖；需要 `@types/chrome`、`@types/node` 才能让 `tsc` 干净，但这是独立事项，需另行批准。
- 本方案不引入任何新的 MCP 桥接或浏览器驱动方式。

## 10. 风险和限制

1. **脚本版本漂移**：站点可能每次下发不同字节，L1 的位置级对照可能经常不可用。缓解：以 L2 为主基线，L1 侧重"可用性"。注意：`version-mismatch` 的 run 所有位置级指标记 `n/a`，**既不算通过，也不算 `false-replacement`**；它只计入 Version Mismatch 比例。
2. **两个浏览器的状态不同**：阶段 A 和 B 的会话、cookie、登录态、指纹不同，反爬站点可能给不同脚本。哈希核对会暴露这一点，但无法消除。
3. **Skill 的能力边界**：`web-protocol-recovery` 只在明确要求协议恢复时触发；"为 OB-Recover 建参考答案"可能是边界外任务，需按协议取证表述并可能需用户确认（本地执行目标 JS 属 `executionPolicy`）。
4. **参考答案的独立性只能靠流程保证**：一旦人工介入改写，独立性就受损。样本包里必须记录获取方式与不确定性。
5. **`atob` 类解码器在真实站点上可能很常见**：若目标站点的解码器依赖宿主函数，手动求值路径基本不可用，只能靠自动捕获。这只压低 Recall，**不影响** Precision、`false-replacement` 和 Source Integrity；报告须写明并把对应位置归入 `insufficient-evidence`（或参考本就标注不确定时的 `safe-rejection`），**不得**计入成功还原。
6. **Recall 与安全策略的关系**：Recall 目标可按 8.4 的难度分档调整，但**禁止**通过放宽安全策略提高 Recall。任何为了提高 Recall 而调整 verified 标准、`rejectUnresolvedHelpers`、`throwOnSideEffect` 或字面量/区间/AST 检查的做法，都视为违反本方案。
7. **L2 的 `node:vm` 不等于 Chrome**：宿主函数行为不同，L2 不能替代 L3 和 L1 的浏览器验证。
8. **Phase 3 挂起未解决**：本阶段只增加诊断和 SW 回收专项测试，**不能声称已修复，也不能声称根因已定位**。
9. **业务逻辑一致性难以自动化**：很多站点的业务输出依赖登录态和动态参数，可能只能人工判断，届时必须写 `not-evaluated`，不得省略、不得当通过。
10. **候选不可变与候选来源**：4.6.1 已说明引擎无法检测 `value` 与 `replacement` 被同时改写成一致值的情况；真实站点测试链路中候选来自面板现算，这一点需要在使用说明里注明。
11. **`tsc` 仍不干净**：历史类型包缺失问题未处理，本阶段不把它当门槛。
12. **L1 不可重复**：真实站点会变，L1 的结果只能作为"某时刻的证据"，报告必须带时间戳和哈希。
13. **指标分母为 0 的情况**：若某次 run 完全没有发生替换，Precision 的分母为 0，必须输出 `n/a`，**不得**输出 `0` 或 `100%`，也不得据此判定通过。

## 11. 进入正式 Phase 4.7 的条件

执行前需要满足：

1. 本方案获批（含第 8 节的通过线）。
2. 用户确认目标站点，并确认**有权测试**。
3. 用户确认 `atob` 类解码器的处理方式（接受"证据不足"并另设纯 JS 正向用例）。
4. 用户确认 Phase 3 挂起以"未复现 + 已加界限 + 新增 SW 回收专项测试"的方式进入本阶段。
5. `npx vitest run` 与 `npx vite build` 在开始前各跑一次并记录基线（4.6.1 基线：45 文件 462 通过 3 跳过；`dist` 哈希 `background.js 8DB17026…`）。
6. 样本目录 `test/fixtures/real-ob-sites/` 建好，`registry.json` 初始化。
7. 明确本阶段**不修改** `src/`、不新增 MCP 桥接、不进入 Phase 5。

本阶段完成的判定（全部满足才算通过）：

- **硬性条件（任一不满足即判 Phase 4.7 不通过，不接受重跑覆盖）**：
  - `false-replacement` = 0（任何一次错误替换都不能判定通过）；
  - 原始脚本字节 SHA-256 三处一致，Source Integrity 为 true（只比较格式化后的源码**不算**通过）；
  - Safe Rejection Rate = 100%；
  - Precision 在发生替换时必须 = 100%。
- L2 的全部指标跑通并按 8.2 定义计算、留证。
- L1 至少完成一个站点的完整流程；若因版本漂移无法位置级对照，须明确记录为限制，**不得**算作通过。
- L3 覆盖 8.5 列出的 6 个重点场景。
- 五类分类（`correct-replacement` / `safe-rejection` / `insufficient-evidence` / `version-mismatch` / `false-replacement`）逐条计数，**不得**把证据不足合并进成功还原。
- Phase 3 挂起按固定措辞记录为"未复现、根因不明、已增加等待界限"，并给出 Service Worker 回收专项测试结论；**禁止**写成"根因已解决"。
- 报告 `docs/PHASE4.7-REAL-SITE-REPORT.md`，区分 L1/L2/L3、已通过、失败、未验证，并对 Recall 未达标项逐条给出原因码，区分"因安全策略正确拒绝"与"因能力不足"。

## 12. 本次交付

本文件为 Phase 4.7 测试计划与验收标准的修订版。未执行任何真实网站测试，未修改产品代码，未新增 Skill 与 OB-Recover 的进程内桥接，未进入 Phase 5。等待确认。
