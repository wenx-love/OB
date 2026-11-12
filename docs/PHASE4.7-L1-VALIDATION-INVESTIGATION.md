# Phase 4.7 L1：验证层拒绝原因与运行时栈帧关联专项排查

- 状态：**只读排查完成**
- 结论摘要：**根因已定位到具体代码行**（验证层的整组函数级判定 `function-suspect`），`status-failed` 主要由**验收装置自身刷新页面**造成，不是产品缺陷。
- 本次不改 `src/`、不改 `dist/`、不改测试、不访问网站、不重跑 L1、不关闭任何他人进程。

---

## 0. 证据与口径说明

### 0.1 本轮使用/新生成的证据

原始证据（只读，未修改）：

| 文件 | 用途 |
| --- | --- |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js` | 256820 字节，SHA-256 `cc7a8127fa8a5d17289a953e11d82ff528fe9ea42276810c5f03371abf760daf`（本轮重新计算，与 `script.sha256` 记录值一致） |
| `.../observed/raw-run.json` | OB-Recover 原始观测（steps / engine stats / dryRun / apply） |
| `.../observed/outcome.json` | 结构化结果与诊断 |
| `.../reference/call-sites.json` | 823 条位置级参考 |
| `.../reference/decoders.json`、`reference/NOTES.md`、`reference/business.json` | 参考口径与业务锚点 |

本轮新生成的只读分析产物（全部写在 TEMP，不进入仓库、不覆盖原始证据）：

| 产物 | 说明 |
| --- | --- |
| `C:/Users/Administrator/TEMP/opencode/l1-investigation/analyze-captures.mjs` + `summary.json` | 捕获记录的多维统计（纯数据） |
| `.../rotation-check.mts` + `rotation-check.json` | 用归档脚本静态实现解码器，用于对齐字符串数组旋转 |
| `.../simulate.mts` + `simulation.json` | **用生产代码的 `validateCaptures` + `dryRunReplacements` 离线复算**已有捕获，并做一份明确标注的反事实对照 |
| `.../dryrun-text.txt` / `apply-text.txt` / `capture-notice.txt` | 从 `raw-run.json` 提取的面板文本 |

### 0.2 数字修正（重要）

预调查描述中的「1056 条 `_0x374d` 成功捕获」**不准确**。按保存的 `raw-run.json` 重新统计（`summary.json`）：

| 项 | 数量 |
| --- | --- |
| 捕获记录总数 | 1059 |
| `_0x374d` | 1056（其中 success **1054**，capture-failed **2**） |
| `Callbacks` | 3（success **2**，capture-failed **1**） |

即：**成功 1056 = `_0x374d` 1054 + `Callbacks` 2**。下文一律按重新统计的数字写。

### 0.3 「离线复算」与「面板实际状态」的区别

`simulate.json` 的 `s1` 是**用生产代码对保存下来的记录离线复算**。它复现出的分组状态是：

```
failed 17 / unstable 13 / verified 0 / pending 0 / insufficient 0
dry-run: candidates 0, rejections 30 (status-failed 17 + status-unstable 13)
```

与运行时的面板文本（`dryrun-text.txt`：「可替换候选 0 个调用点，拒绝 30 项；拒绝 17 项：status-failed；拒绝 13 项：status-unstable」）**逐项一致**。这只能说明「离线复算复现了同一结论」，不能等同于面板当时的实时内部状态。下文凡引用 `s1` 一律标明为复算。

复算的一处已知偏差：`scriptId 12` 我用归档 `script.js` 代入，而 `191`（`combo?font` 包）**未归档**，无法代入，其分组只能以 stale-script 形式出现。因此 `191`/`5` 的失败项**不能**据此断言其为 stale-script。

---

## 1. 实际代码调用链

捕获与替换的完整链路（括号内为本轮实际读过的文件）：

1. 面板构造捕获目标：`panel.ts:1516 startRuntimeCapture()`
   → 遍历 `allCandidates`，按 `capMinConfidence` 过滤（`panel.ts:1525`）
   → `computeCapturePlan(script.source, cand.location.start, ast)`（`panel.ts:1541`）
   → 发送 `capture-start`，携带 `targets`（`panel.ts:1550`）
2. 后台持有引擎：`background.ts:89 getOrCreateEngine()` → `postCaptureState()`（`background.ts:72`）
3. CDP 事件分发：`cdp-client.ts:56` 的 `chrome.debugger.onEvent`
   → `Debugger.paused` 先给 `hooks.onPaused`（`cdp-client.ts:65`），否则走 `handlePaused`
4. 引擎处理暂停：`capture-engine.ts:298 onPaused()` → `capture-engine.ts:319 handle()`
   → 入口命中：`capture-engine.ts:349-357` → `openPending()`（`:381`）读参数
   → 退出命中/返回：`capture-engine.ts:359 advance()`（`:430`）读返回值
5. 记录生成：`capture-engine.ts:469 record()` 去重合并 → `emit({kind:'capture'})`
6. 面板落表：`panel.ts:1559 handleCaptureEvent()` → `capTable.set(key, capture)`（`panel.ts:1562`）
7. 验证分组：`core/capture-validation.ts:444 validateCaptures()`
   → `evaluateGroup()`（`:296`）→ 函数级汇总（`:463-506`）
8. 候选生成：`core/replacement-dryrun.ts:158 dryRunReplacements()` 主循环（`:158-...`）
   → 非 verified 整组拒绝并计入 `byReason`

「entry breakpoint did not land inside the function body」这一提示只在一处产生：**`capture-engine.ts:389`**（`openPending()` 内的 `record(..., 'capture-failed', ...)`）。

---

## 2. 断点落点与栈帧识别机制（对应问题一）

### 2.1 入口断点设在哪

面板为**每个候选函数**各设一个计划（`panel.ts:1541`）。对 `_0x374d` 而言，脚本里存在**两个同名函数**：

- 外层包装：`function _0x374d(_0x5dacbd,_0x400e51){...}`，`node.start = 261`，`node.end = 2287`
- 内层实现：`_0x374d = function(_0x374d57,_0x63ace3){...}`，`node.start = 338`，`node.end = 2287`

捕获计划（`capture-plan.ts`，由 `computeCapturePlan` 生成）取的是**函数体第一条语句的起点**。本轮离线计算（`simulation.json` → `discovery.list`）：

| 候选 | confidence | entry | returns | 参数名 |
| --- | --- | --- | --- | --- |
| `_0x374d` | medium | `0:299` | 1 | `_0x5dacbd,_0x400e51` |
| `_0x374d` | high | `0:368` | 1 | `_0x374d57,_0x63ace3` |

而**运行时实际断点落在 `0:368`**（`raw-run.json` 的捕获记录 `functionLocation = 0:368`，`summary.json` → `decoder.functionLocations`）。`0:368` 正是**内层实现函数**体的起点——也就是说，运行时命中的是**内层函数**，参数名是 `_0x374d57,_0x63ace3`。

**已确认事实**：本次 1054 条成功记录的 `functionLocation` 全部是 `0:368`，对应内层实现函数。

### 2.2 命中时 `Debugger.paused` 返回什么、如何识别目标

`handle()`（`capture-engine.ts:319`）：

```ts
const frames = p.callFrames ?? [];
const top = frames[0];
const hits = (p.hitBreakpoints ?? []).map(id => this.bps.get(id)).filter(Boolean);
```

- 目标函数识别**不靠名字猜**，靠 `hitBreakpoints` 里我们自己的断点编号 → `bps` 表 → `BpInfo.target`。
- `top.functionName` 只用于后续**帧配对**（`advance()` 里按 `depth` + `frameName` 匹配），不用于判定「这是哪个函数」。

### 2.3 top frame 不是目标函数时怎么办

`openPending()`（`capture-engine.ts:381-404`）：

```ts
const hasLocal = (top.scopeChain ?? []).some((s:any) => s.type === 'local');
if (!top.functionName || !hasLocal) {
  this.record({ target, frameName: top.functionName || '', depth, args: [], ... },
    'capture-failed', undefined,
    'entry breakpoint did not land inside the function body (top frame is not the target function)');
  return;                       // ← 直接返回，不读参数、不进 pending
}
```

**已确认事实**：这个分支一旦进入就**终止该次捕获**（`return`），所以它**不会**「继续读别的栈帧再生成成功记录」。

### 2.4 是否存在错误栈帧被当成目标函数

**已确认事实（部分）**：

- 参数读取只用 `frames[0]` 的 `local` 作用域（`readArgs()`，`capture-engine.ts:407-408`），**不看 `frames[1..]`**。
- 返回值读取在 `advance()`（`:430-443`）里同样只用 `top`，并要求 `this.pending[i].frameName === (top.functionName||'')` 且 `depth` 相同。

**无法确认事项**：本次 1054 条成功记录的参数组是否**全部**来自内层函数自身帧。
本次证据里**没有逐条保存 `depth`**（`raw-run.json` 的记录字段不含 `depth`），因此无法仅凭现有数据证明「不存在 `depth>1` 的同名帧被误配」。见第 8 节需要的补充记录。

### 2.5 `status-failed` / `status-unstable` 的判定入口

两者在 dry-run 侧只是**状态名透传**（`replacement-dryrun.ts` 主循环把非 verified 的组按 `g.status` 归入 `byReason`，产生 `status-failed` / `status-unstable`）。真正的判定在 `capture-validation.ts`：

- `failed`：`stale-script`（`:344`）、`capture-failed`（`:352`）、`argument-*`（`:357`）、`return-*`（`:360`）、`function-not-found`（`:365`）、`function-identity-mismatch`（`:371`）、或**函数级 `function-suspect` 回写**
- `unstable`：`same-args-different-returns`（`:373`）或 `dependency-suspected`（`:383`）
- 关键：**函数级可疑会把该函数所有组一起判掉**（见第 3.3 节）

---

## 3. 参数与返回值来源（对应问题二）

### 3.1 参数来源

**已确认事实**：参数**不是**从 `Runtime.evaluate` 或 `scopeChain` 求值得到，而是：

`top.scopeChain` 中 `type==='local'` 的 scope → 取其 `object.objectId` → `Runtime.getProperties(ownProperties:true)` → 按 `plan.paramNames` 逐个取（`capture-engine.ts:406-413`）。

**含义**：因为断点落在**内层函数 `0:368`**，`plan.paramNames` 用的是**内层形参名** `_0x374d57/_0x63ace3`，所以读到的就是内层函数的实参。这与「1054 条记录的参数组全部出现在参考集合里」（`summary.json` → `returnVsReference.recordsWhoseArgsAreInReference`）一致。

### 3.2 返回值来源

**已确认事实**：返回值来自 **CDP 暂停时 `top.returnValue` 字段**，即 V8 在**真实执行返回**那一刻提供的值：

```ts
if ('returnValue' in top) { this.pending.splice(idx,1); this.record(pd,'success', this.toValue(top.returnValue)); }
```
（`capture-engine.ts:439-442`）

**机制路径（两种之一）**：
1. 直接停在某条 `return` 语句的暂停上（此时 `top.returnValue` 已存在）→ 立即记录；
2. 否则 `advance()` 请求 `Debugger.stepOver`（`:361-372`），单步走到 `return` 后再记录。

**已确认事实（对应「是否把重新求值当历史结果」）**：
- 本引擎**绝不 `Runtime.evaluate` 目标函数**（文件头注释 `capture-engine.ts:136`：「绝不重新执行目标函数，不使用 Runtime.evaluate」）。
- 因此自动捕获（`origin !== 'manual'`）的返回值**只能**是真实执行的历史结果。
- **只有 `origin === 'manual'`** 的记录是「用户在暂停帧里重新求值一次」的结果，验证层对它有专门处理（`capture-validation.ts:303-320`、`:388-399`）。本次是自动捕获（`origin: 'auto'`），不涉及重新求值。

### 3.3 返回值与调用位置的关联

`record()` 的**去重键**（`capture-engine.ts:473`）是：

```
[scriptId, 入口行, 入口列, JSON.stringify(args), status, JSON.stringify(returnValue) | reason]
```

**已确认事实**：去重键**不含调用位置**。多条同参同值的记录会合并计数，并把各自 `callLocation` 追加进 `callLocations`（`:478 addCallLocation`，`:31-33` 注释说明了这一点）。`callLocation` 取的是 `frames[1]`（调用者）的位置（`openPending()` `:383-386`）。

**已确认事实（本轮最关键的位置发现）**：1054 条成功记录的 `callLocation` **全部是 `0:2288`**（`summary.json` → `callLocations.primaryIs0_2288 = 1054`，`distinct` 只有 1 个）。

`0:2288` 是**外层函数体内、内层实现函数之后**的位置——即**内层函数对外层变量 `_0x374d` 的递归/自调用点**，**不是 823 个参考调用点中的任何一个**（`summary.json` → `positionAssociation.checked`，参考位置与记录位置无交集；`simulation.json` → `referenceCallees.directCallsOf_0x374d = 0`，参考里没有一处是直接调 `_0x374d`）。

**含义**：捕获确实抓到了真实执行，但**抓到的调用位置是解码器内部的自调用**，不是业务侧的 823 个调用点。这解释了为什么「1054 条成功」与「0 个可替换候选」并不矛盾——**成功 ≠ 位置可用**。

---

## 4. 17 项 `status-failed` 明细（对应问题三）

来自离线复算 `simulation.json` → `s1.byScriptFnStatus`：

| 分组 | 数量 | 判定 code | 判定行 |
| --- | --- | --- | --- |
| `191:Callbacks:failed` | 1 | `stale-script` | `capture-validation.ts:344` |
| `5:Callbacks:failed` | 2 | `stale-script` | 同上 |
| `200:_0x374d:failed` | 14 | `stale-script` | 同上 |
| **合计** | **17** | | |

### 4.1 这 17 项为什么是 stale-script

`stale-script` 的条件是：**记录里的 `scriptId` 不在「当前脚本集合」里**（`:342-344`），也就是页面已刷新。

**已确认事实**：这是**验收装置自己造成的**。运行器 `scripts/p47-l1-ob-run.ts`：

- `:157 startCapture` —— 先点击「开始捕获」
- `:165-182 navigateTarget` —— **随后 `Page.reload` 刷新页面**（`b.send('Page.reload', ...)`，`:167`）

刷新后旧 scriptId 作废，刷新前捕获的记录自然全部变 stale。`raw-run.json` 里 `200`（`combo?ajax-20...`）与 `191`（`combo?font...`）就是刷新前那批文档的脚本号；`12` 是刷新后的目标脚本。

**判定**：这 17 项 `status-failed` 是**测试装置失误（换文档）**，**不是产品缺陷**。上一轮报告已按「装置失误原样归档」处理（`raw-run.attempt{1,2,3}-*.json`），本轮进一步给出其**具体成因**。

### 4.2 能否给出每条的参数/返回值/位置

**无法确认事项 / insufficient-evidence**：`191`、`5` 两个 `combo` 包**未归档源码**，因此：

- 无法核对其 `functionLocation` 在源码中的真实语义；
- 无法核对其函数身份是否与记录一致；
- 其记录同样有 `callLocation`，但同样**不能**与参考位置对照。

**现有的、可用于 `200`/`12` 的信息**：`200` 的 14 条失败记录的 `callLocation` 也是 `0:2288`（与 `12` 相同形态），参数为空（`argCount: 0`，见 `summary.json` → `failedRecords`），原因均为 stale-script。**参数为空**是因为 `stale` 判定发生在**读取参数之前**还是之后，取决于该记录是否曾走到 `openPending`——现有证据不足以区分，标记 **insufficient-evidence**。

---

## 5. 13 项 `status-unstable` 明细（对应问题三）

来自 `simulation.json` → `s1.byScriptFnStatus.ok` 与 `s2.functions`：

| 项 | 值 |
| --- | --- |
| 分组 | `12:_0x374d:unstable` × **13** |
| 判定 code | `same-args-different-returns`（`capture-validation.ts:373`） |
| 分组参数 | 13 个不同的 `(数字, 字符串)` 参数组 |
| 每组观测次数 | **75–76 次**（`summary.json` → `perScript.12.groupLengths`） |
| 每组不同返回值数 | 每组都有多个不同返回值（即 `distinct > 1`） |
| 记录数 | 980（`perScript.12.records`） |
| 时间范围 | `1794297050707` → `1794297101655` |

### 5.1 「同参不同返回值」是否真实存在

**已确认事实：真实存在。** 不是错误栈帧或错误函数身份造成：

- 参数来自内层函数真实 `local` 作用域（4.1 节机制）；
- 返回值来自真实 `top.returnValue`（3.2 节机制），未重新求值；
- 13 个参数组**全部**出现在参考集合中（位置无关地匹配参数，`summary.json` → `returnVsReference.recordsWhoseArgsAreInReference`）。

### 5.2 差异的可能来源

**合理假设（未证实，标注为假设）**：返回值随**字符串数组旋转**变化。

支撑观察（纯数据，来自 `summary.json` + `rotation-check.json`）：

- 每组观测约 75–76 次，且 `maxRotationSeen = 75`；
- 返回值呈**周期性重复**（每组多个不同值，随观测序列轮转）；
- 脚本里存在 `push`/`shift`/`parseInt` 构成的**数组旋转 IIFE**；
- `summary.json` → `neighbourShift`：记录返回值与其**相邻序号记录**的参考值吻合度显著高于与自身参考值的吻合度。

**必须声明的限度**：我写的离线解码器（`rotation-check.mts`）**只复现了 812 对参考中的 272 对，且仅在单一旋转值 `r=105` 下吻合，旋转 0 完全不吻合**。这说明**我的离线实现有错**（可能漏了数组中原生函数的别名包装、或 `atob`/网格字符表变体）。因此：

- **不能**用它断言页面真实返回值是多少；
- **只能**把「旋转导致同参不同值」当作**合理假设**，不作事实结论。

**已确认事实（独立于上述假设）**：无论旋转是否为真因，验证层对「同参不同值」的处置是**正确的安全行为**——按 `capture-validation.ts:373` 判 `unstable`，且**不进入候选**。这符合「证据不足一律不标 verified」的设计。

---

## 6. 1054 条成功捕获 → 0 候选的完整过滤路径（对应问题四）

逐层数量与拒绝原因（全部来自离线复算 `s1`，与面板文本一致）：

```
Runtime Capture        1059 条记录（1056 success + 3 capture-failed）
   │  record() 去重键 = scriptId|入口行列|参数|状态|返回值（不含调用位置）
   │  → 1056 success 按 (scriptId, functionLocation, functionName, args) 分组 = 30 组
   ▼
Capture Grouping       30 组（191:1 + 5:2 + 200:14 + 12:13）
   │  evaluateGroup()
   │  ├ 17 组 → failed  (stale-script：scriptId 不在当前脚本集合)
   │  └ 13 组 → unstable (same-args-different-returns)
   ▼
Validation             0 verified / 0 pending / 0 insufficient
   │  dryRunReplacements() 主循环：status !== 'verified' 整组拒绝
   ▼
Dry Run                0 候选，30 项拒绝
   │  byReason: status-failed 17 / status-unstable 13
   ▼
ReplacementCandidate   0
   │
   ▼
AST Apply              0 次替换（apply-text.txt：「当前脚本没有可替换的候选（0 个被拒绝）」）
```

### 6.1 为什么「1056 成功」不等于「1056 个候选」

三层过滤，每层都有明确依据：

1. **归并**：1056 条成功记录按去重键合并为 **30 组**。同一 `(参数, 返回值)` 的多次调用只算一组，`count` 累加。这一步就把 1056 条压到 30 组。
2. **状态判定**：30 组里 **17 组 stale-script**（装置刷新页面所致）、**13 组 unstable**（同参不同值）。**没有任何一组达到 verified**。
3. **dry-run 整组拒绝**：`replacement-dryrun.ts` 只接受 `status === 'verified'` 的组，非 verified 一律整组拒绝并计入 `byReason`，因此 30 组 → 0 候选。

**已确认事实**：`false-replacement = 0`（因为 `Precision` 的分母 `TP+FR = 0`，指标记 **n/a**，不记 0 也不记 100%）。全部 1056 条成功捕获**都被安全拦下**，没有一条进入替换。

---

## 7. 根因判断

### 7.1 根因一（已验证）：验收装置刷新页面，制造了 17 项 stale-script

- **证据**：`scripts/p47-l1-ob-run.ts:157`（开始捕获）→ `:167`（`Page.reload`）；`raw-run.json` 中刷新前脚本号 `191`/`200`/`5` 与刷新后 `12` 并存。
- **代码行**：`capture-validation.ts:342-344`。
- **性质**：**装置失误，非产品缺陷**。直接后果是 17/30 组作废，这不是产品应当「修」的问题。

### 7.2 根因二（已验证）：捕获点的调用位置全部落在解码器自调用 `0:2288`，与 823 个参考调用点无交集

- **证据**：`summary.json` → `callLocations.primaryIs0_2288 = 1054`、`distinct = 1`；`simulation.json` → `referenceCallees.directCallsOf_0x374d = 0`。
- **代码路径**：`capture-engine.ts:383-386`（`callLocation` 取 `frames[1]`）+ `:384`（内层函数的外层调用者是 `0:2288` 自调用）。
- **性质**：**机制性限制**。断点落在内层实现函数，而业务侧调用的是**外层包装函数的 37 个别名**（`simulation.json` → `referenceCallees.distinctCallees = 37`，其中没有一个是 `_0x374d` 本身）。因此即使返回值稳定，位置也**无法**绑定到参考调用点。

### 7.3 根因三（已验证，且是最硬的拦截）：`outer-state-write` 静态特征把整组统一判掉

这是**本次最关键、也最容易被误判为「返回值不稳定」的根因**。

- **反事实对照**（`simulation.json` → `s2`）：我构造 13 组合成记录，把返回值**替换为参考里的稳定值**（即假设旋转问题不存在），每组 2 次一致观测，位置仍用记录到的 `0:2288`。结果：

```
byStatus: unstable 13, failed 0, verified 0
reasonCodes: dependency-suspected ×13
functions[0].suspect = true
functions[0].reasons = [function-feature:outer-state-write, function-feature:outer-state-write]
```

- **代码行**：`capture-validation.ts:474-484`（函数级 `suspect` 计算）+ `:479-484`（`function-write` 特征回写到**该函数的每一组**）+ `:382-384`（`dependency-suspected` 判 unstable）。
- **静态特征本身**：`function-features.ts` 在 `0:1980` 与 `0:2224` 检出 `outer-state-write`（`simulation.json` → `blockingFeatures`）。这两处正是内层函数的**自记忆化赋值**（`_0x374d = function(...)` 与 `_0x374d.ibrIyO = ...`，另见 `noteFeatures.self-memoization`）。

**结论**：
- 即使返回值完全稳定、即使位置正确，**`outer-state-write` 这一条也会让 `_0x374d` 的全部 13 组判 unstable**，0 候选的结果**不会改变**。
- 因此本次 L1 的 0 候选有**两个独立成因**：外层是位置错位（7.2），内层是函数级静态特征（7.3）；后者单独也足以拒绝。

### 7.4 非根因（应排除）

- **不是**错误栈帧把别的函数返回值关联给 `_0x374d`：记录的回调帧名与目标一致，且 `record()` 只在帧名/深度匹配时才成功（3.2、3.3 节）。
- **不是**「把重新求值当历史结果」：自动捕获不使用 `Runtime.evaluate`（`:136` 注释 + 3.2 节代码）。
- **不是**验证层放行了不该放行的东西：`false-replacement = 0`，全部记录被拦下。

---

## 8. 本次仍无法确认的事项，以及下次干净运行必须补记的证据

### 8.1 无法确认事项（严格列出）

| 编号 | 无法确认的内容 | 缺什么证据 |
| --- | --- | --- |
| U1 | 1054 条成功记录的**逐条 `depth`**，因而无法排除 `depth>1` 的同名帧被误配 | 记录里需保存 `depth`、`frameName`、`hitBreakpointId` |
| U2 | `191`/`5` 两个 `combo` 包的函数身份与位置语义 | 这两个包的源码未归档（应一并归档所有参与捕获的脚本） |
| U3 | `200` 的 14 条失败记录「参数为空」发生在读取前还是读取后 | 失败记录里需保存「失败阶段」标记（`openPending` 内 / `advance` 内 / `failPending` 内） |
| U4 | 同参不同值的**真因**（是否确为数组旋转） | 本次离线解码器实现有误（272/812 吻合、仅 r=105），需修正后重算；或改用浏览器内一次性独立求值 |
| U5 | `793`？不适用——`0:2288` 是否**唯一**的捕获调用点 | 现有 `distinct=1` 已足够说明本次如此，但无法断言换运行也如此 |

### 8.2 下一次干净运行必须额外记录

按上一轮约定的「干净的单次导航运行」（不重试、不换文档）执行时，**必须**增加以下记录，否则 U1–U3 仍无法判定：

1. **不刷新页面**：在 `Page.reload` **之前**开始捕获，或在刷新后才开始捕获（二选一，不能既捕获又刷新）。这样 30 组里就不应再出现 stale-script。
2. **逐条记录栈帧元数据**：`depth`、`frameName`、命中的 `hitBreakpointId`、`functionLocation`、`callLocation`。
3. **记录失败阶段**：`capture-failed` 时标注发生在 `openPending` / `advance` / `failPending` / `stopNow` 哪一处。
4. **归档全部参与捕获的脚本**：至少 `191`、`200`、`12` 三份源码与各自 SHA-256、长度、行数。
5. **同一 `scriptId` 在应用前后的源码哈希**：用于补上 Source Integrity（上一轮因 `scriptId 200` 过期读到空串而未测量）。
6. **返回值稳定性对照**：对同一参数组，记录**连续观测的旋转相位**（若可获取），用于区分「旋转导致」与「其他状态依赖」。

---

## 9. 下一步最小修复方案（只提方案，不实施）

按「最小改动、不降安全策略」排序。**本节仅为方案，未做任何修改。**

### 方案 A（最低风险，先做）：修捕获点，让断点落在**外层包装函数**

- **问题**：断点落在内层 `0:368`，调用位置只会是自调用 `0:2288`，无法绑定到 823 个业务调用点（7.2）。
- **提案**：在 `capture-plan.ts` 的候选选择里，对「同一个名字有外层/内层两个函数体」的情形，优先选**外层**（外层 `node.start = 261`，其函数体起点 `0:299`）。或在 `panel.ts:1541` 之前，对同一 `name` 的多个候选做**去重合并**，只保留能被 37 个别名解析到的那一个。
- **收益**：调用位置有机会变成业务真实调用点。
- **注意**：**不得**因此放宽 `verified` 判定；也不得把「外层能捕获」当作已验证。

### 方案 B（针对 7.3，需谨慎）：区分「自记忆化写入」与「外部状态写入」

- **问题**：`outer-state-write` 把 `_0x374d = function(...)` 这种**自记忆化**（`function-features.ts` 的 `noteFeatures.self-memoization` 已能识别）与真正的**外部状态写入**混为一谈，导致整组被否。
- **提案**：在 `function-features.ts` 里，若某处 `outer-state-write` 的写入目标**就是该函数自身**（或该函数的属性），则**降级为 note**，仅当写入**其他外部绑定**时才 blocking。
- **风险**：这会**放宽**一条拦截规则。**必须**先用 L2/L3 的既有样本回归，确认 `false-replacement` 仍为 0，且 SRR 不下降。**本轮不建议直接实施**，先做反事实验证。

### 方案 C（装置侧，必做）：修 `p47-l1-ob-run.ts` 的捕获与刷新顺序

- **问题**：`startCapture`（`:157`）后 `Page.reload`（`:167`）导致 17 组 stale-script。
- **提案**：改为「先刷新、再开始捕获」，或让捕获在刷新后重新建脚本集合。**这不改产品代码**，只改验收脚本。

### 方案 D（观测能力，配合 8.2）：给记录补栈帧元数据

- **提案**：`DecoderCapture` 增加 `depth`、`frameName`、`hitBreakpointId`、`failureStage` 字段（仅新增，不改现有语义）。用于回答 U1/U3。

**优先级建议**：C（装置）→ D（观测）→ 重跑一次干净 L1 → 据结果再评估 A → 最后才评估 B。

---

## 10. 已确认事实 / 合理假设 / 无法确认事项（三段式汇总）

### 10.1 已确认事实

1. 归档 `script.js` 256820 字节，SHA-256 `cc7a8127…f760daf`，与运行记录一致（本轮重算）。
2. 成功捕获 **1056** = `_0x374d` **1054** + `Callbacks` **2**（此前"1056 条 `_0x374d`"不准确）。
3. `_0x374d` 的断点实际落在 `0:368`（内层实现函数），1054 条成功记录的 `functionLocation` 全为 `0:368`。
4. 1054 条成功记录的 `callLocation` **全部是 `0:2288`**（内层函数对外层的自调用），与 823 个参考调用点**无交集**。
5. 参数来自 `frames[0].scopeChain` 的 `local` scope，经 `Runtime.getProperties` 读取（`:406-413`）。
6. 返回值来自 CDP `top.returnValue`，自动捕获**不重新求值**（`:439-442`、`:136`）。
7. 记录去重键**不含调用位置**（`:473`），多位置合并进 `callLocations`。
8. `entry breakpoint did not land inside the function body` 只在 `capture-engine.ts:389` 产生，且该分支 `return`，不继续读其他帧。
9. 30 组中 17 组 stale-script、13 组 `same-args-different-returns`；**0 组 verified**。
10. 17 组 stale-script 的成因是 `p47-l1-ob-run.ts:167` 的 `Page.reload`（装置行为）。
11. 反事实对照证明：即使返回值稳定，`outer-state-write`（`capture-validation.ts:474-484`）也会把 `_0x374d` 全部 13 组判 unstable。
12. `false-replacement = 0`；Precision 分母为 0，记 **n/a**；0 候选。

### 10.2 合理假设（未证实）

1. 同参不同值的直接原因是**字符串数组旋转**（支撑：每组 75–76 次观测、周期性重复、相邻序号吻合度更高、脚本含旋转 IIFE）。**我的离线解码器实现有误，未能证实。**
2. 内层函数的自记忆化赋值触发的 `outer-state-write` 只是**同一个函数对象被重新赋值**，不构成真实的外部状态依赖——因此当前拦截对 `_0x374d` 属于**过严**。**未证实**（需要方案 B 的反事实验证）。
3. `200` 的 14 条失败记录参数为空，是因为 stale 判定先于参数读取。

### 10.3 无法确认事项

见 8.1 的 U1–U5，其中 **U1（逐条 depth）** 与 **U4（同参不同值真因）** 是最要紧的两项，直接决定「是否存在错误栈帧关联」与「旋转假设是否成立」。**现有证据不足以回答这两项，必须靠下一次干净运行的额外记录（8.2）补齐，不得自行补造结论。**

---

## 11. 停止状态

- 报告生成完毕，**立即停止**。
- 未修改 `src/`、`dist/`、测试与验收标准；未改 `throwOnSideEffect`；未放宽 `status-unstable`；未绕过 `verified`；未执行 AST 替换；未重新访问目标网站；未重跑 L1；未关闭任何他人的浏览器或 MCP 进程。
- 等待审查后再决定是否实施第 9 节方案以及是否进行下一次干净运行。
- L1 结论维持 **blocked（未通过）**，第 7 节不构成「已修复」的声明。
