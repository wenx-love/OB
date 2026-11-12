# Phase 4.7 L1：干净运行准备（方案 C + 方案 D）、测试断言修正记录

- 阶段：只实施 **方案 C**（验收脚本顺序）与 **方案 D**（运行时观测元数据）。
- 状态：**完成，未运行 L1**。
- 关键结论：3 处测试失败的成因是**测试预期写错**，不是引擎缺陷。引擎语义已按源码逐行核实，**未修改任何产品业务逻辑**。

---

## 1. 执行摘要

| 项 | 结果 |
| --- | --- |
| 方案 C | 完成。整个脚本不再有 `Page.reload`，导航与就绪判定全部前置到捕获之前 |
| 方案 D | 完成。新增 `observations[]` 逐条观测元数据，去重不再丢失逐条栈帧信息 |
| 产品业务逻辑 | **未修改**。只新增可选字段与只读记账；未动 `capture-validation.ts`、`verified` 判定、`outer-state-write`、`throwOnSideEffect` |
| 完整 Vitest | **557 passed / 1 failed / 3 skipped**（51 文件）。唯一失败为**本阶段之前就存在的陈旧断言**，与本阶段改动无关（见第 6 节） |
| TypeScript | 新增错误仅 1 条 `TS2307`（新测试文件缺 `@types/node`，与基线 138 条同类）；`capture-engine.ts` **0 错误** |
| Vite build | 成功（exit 0） |
| dist 产物 | `background.js` **已变更**（捕获引擎打包于此）；`devtools.js`、`panel.js`、`sandbox.js` **逐字节相同**（见第 7 节） |

---

## 2. 引擎语义核实（修改测试前的前置工作）

按要求**先核实真实调用链**，不依据函数名或注释推断。

### 2.1 `record()` 的全部调用点

`grep this.record(` 在 `src/extension/debugger/capture-engine.ts` 命中共 **6 处**：

| 行号 | 阶段 | 状态 |
| --- | --- | --- |
| 458 | `openPending`（top frame 不是目标函数） | `capture-failed` |
| 465 | `openPending`（读参数失败） | `capture-failed` |
| 471 | `openPending`（pending 队列溢出） | `capture-failed` |
| **510** | **`advance`（`'returnValue' in top`）** | **`success`（唯一成功点）** |
| 521 | `advance`（单步超限仍无 returnValue） | `capture-failed` |
| 532 | `failPending`（含 `advance`/`stopNow` 传入的 stage） | `capture-failed` |

### 2.2 实际调用顺序与状态变化

```
Debugger.paused
  └─ handle()                                          capture-engine.ts:379
       ├─ entryHit → openPending()                     :412-415
       │     ├─ 取 frames[0].scopeChain 的 local scope  :456
       │     ├─ readArgs() 读参数                       :461-467
       │     ├─ 成功 → this.pending.push(...)           :468   ← 只进 pending，【不 record】
       │     └─ 失败 → record(capture-failed,'openPending')  :458/465/471
       └─ advance()                                    :422 → :499
             ├─ 按 depth + frameName 找 pending 项      :503-506
             ├─ 'returnValue' in top → pending.splice() :509  ← 先把 pending 项摘掉
             │                          → record('success')  :510  ← 再记一条
             └─ 找不到（idx < 0）→ return false         :506   ← 什么都不记
```

**核实结论（对应任务一）**：

1. **入口阶段只进 pending，不生成记录** — `:468` 只做 `push`，`record` 只在该行之后的失败分支里被调用。
2. **返回值阶段才 `record`** — 唯一的成功 `record` 在 `:510`。
3. **一次完整调用生成 1 条 observation** — 入口 `push`（`:468`）与返回 `splice + record`（`:509-510`）成对，且 `splice` 会把 pending 项移除，不可能重复计数。
4. **`callLocations` 只在 `record` 时产生** — `:563`（合并已有记录）与 `:584`（新建记录）。pending 阶段不产生任何位置记录。
5. **成功捕获的必要条件** — 必须在同一次暂停里同时满足：`entryHit` 命中（`:412`）使 pending 里有 `depth` + `frameName` 匹配的项（`:504`），且 `'returnValue' in top`（`:508`）。缺任一条件都不会产生成功记录。
6. **缺元数据的暂停若无成功记录则被排除** — 若只发生入口暂停（只有 `push`），后续 `advance` 找不到或 `failPending` 触发时才产生 `capture-failed` 记录；若暂停本身不满足 `:400` 的认领条件（`top` 存在且 `hits.length > 0 || wasStepping`），则记为外来暂停（`:401-403`），**完全不产生记录**。

### 2.3 现有测试的独立佐证

`test/capture-call-locations.test.ts:47` 的 `callFrom()` 同样对一个调用发两次 `onPaused`（入口 + 返回），而 `:61` 断言两次调用后 `caps[0].count === 2`。这与上述结论一致：**入口暂停不单独计数**。

---

## 3. 三处失败的实际原因与修正

### 问题 1：观测条数 1 vs 2

- **实际原因**：`openPending`（`:468`）只 `push` 到 pending，**不 `record`**；只有 `advance`（`:510`）才 `record`。一次完整调用 = **1 条 observation**。我原先按"入口 + 返回各一条"写了 2，是错的。
- **断言修改**：

```diff
- // 入口暂停与返回暂停各记一次观测：两条观测各自的真实栈深都是 2（dec + 调用方）
- expect(obs!.length).toBe(2);
+ // 引擎语义（已按源码核实）：入口暂停只进 pending 不 record，只有返回值暂停才 record 成功记录。
+ // 因此一次完整调用 = 恰好一条 observation。
+ expect(obs!.length).toBe(1);
```

- **同时修正 `hitBreakpointId` 预期**：记录用的是 pending 里保存的**入口断点** ID，不是返回暂停的断点 ID。

```diff
- expect(obs![0].hitBreakpointId).toBe('bp1');
- expect(obs![1].hitBreakpointId).toBe('bp2');
- expect(obs![0].failureStage).toBeUndefined();
- expect(obs![1].failureStage).toBeUndefined();
+ // 成功记录由返回值暂停触发，其帧由入口帧配对而来，
+ // 入口帧记录的 hitBreakpointId 是入口断点 bp1（record 用的是 pending 里保存的值，不是返回暂停的 bp2）
+ expect(obs![0].hitBreakpointId).toBe('bp1');
+ expect(obs![0].failureStage).toBeUndefined();
```

### 问题 2：`callLocations` 逐条对应 2 vs 4

- **实际原因**：不是去重问题，也不是重复计数。`callLocations` 只在 `record` 时追加（`:563`/`:584`），每次调用产生 **1 条 observation + 1 个位置**。两次调用 → 2 条观测、2 个位置。我原先写 4（按"每次调用两个阶段"）是错的。
- **未简单改数字**：已按第 2 节确认 `addCallLocation` 的去重逻辑（`:117-125`）与 `splice` 摘除逻辑（`:509`），确认不存在"同一调用的 pending 与 record 重复计数"，也不存在"不同调用位置被错误合并"（不同位置会各自追加，见 `:63` 的既有断言）。
- **断言修改**：

```diff
- expect(caps[0].observations!.map((o) => o.callLocation)).toEqual([
-   { lineNumber: 56, columnNumber: 11 },
-   { lineNumber: 56, columnNumber: 11 },
-   { lineNumber: 57, columnNumber: 11 },
-   { lineNumber: 57, columnNumber: 11 },
- ]);
+ // 逐条元数据的位置与合并后的 callLocations 一一对应：两次调用各产生一条 observation、各贡献一个位置
+ expect(caps[0].observations!.length).toBe(2);
+ expect(caps[0].observations!.map((o) => o.callLocation)).toEqual([
+   { lineNumber: 56, columnNumber: 11 },
+   { lineNumber: 57, columnNumber: 11 },
+ ]);
+ expect(caps[0].observations!.map((o) => o.callLocation)).toEqual(caps[0].callLocations);
```

### 问题 3：缺失字段用例过滤结果为空

- **实际原因（测试构造错误）**：我原先只发了一次 **返回** 暂停，且**没有先发入口暂停**。`advance`（`:503-506`）按 `depth` + `frameName` 在 pending 里找匹配项，找不到就 `return false`（`:506`），**根本不产生任何记录**。所以过滤 `returnValue !== undefined` 得到 0 条。测试输入本身就不满足成功捕获的前置条件（第 2.2 节条件 5）。
- **修正依据**：不改引擎的成功条件，改为构造**完整调用**（入口 + 返回），但让**栈上只有目标函数一帧**，从而真实地制造"调用方帧缺失"。

```diff
- await engine.onPaused({ callFrames: [frame('dec', { returnValue: s('v') })], hitBreakpoints: ['bp2'] });
- const caps = engine.getCaptures();
- const withRet = caps.filter((c) => c.returnValue !== undefined);
- expect(withRet.length).toBeGreaterThan(0);
+ // 构造：入口暂停时栈上只有目标函数一帧，没有调用方帧 → callLocation 取不到。
+ // 必须走完整调用（入口 + 返回），否则 advance 找不到 pending 项（idx < 0），根本不会产生成功记录。
+ state.args = [{ name: 'i', value: { type: 'number', value: 257 } }];
+ await engine.onPaused({ callFrames: [frame('dec')], hitBreakpoints: ['bp1'] });
+ await engine.onPaused({ callFrames: [frame('dec', { returnValue: s('v') })], hitBreakpoints: ['bp2'] });
+ const caps = engine.getCaptures();
+ const withRet = caps.filter((c) => c.returnValue !== undefined);
+ expect(withRet.length).toBe(1);
```

- 并补充了两条更严格的断言：逐条元数据里 **不得出现编造的位置**，且该场景 `depth` 仍是真实栈深 1。

```diff
+ expect(withRet[0].observations!.length).toBe(1);
+ for (const o of withRet[0].observations!) expect(o.callLocation).toBeUndefined();
+ expect(withRet[0].observations![0].depth).toBe(1);
```

---

## 4. 方案 D：字段来源与传递链

### 4.1 数据流

```
Debugger.paused
  └─ handle()  ← frames[0]=top, frames[1]=caller, frames.length=depth, p.hitBreakpoints[]
       ├─ entryHitId 取真实命中的断点 ID            capture-engine.ts:408-411
       ├─ openPending(target, frames, depth, {…hit, id: entryHitId})   :415
       │     ├─ callLocation = frames[1].location 或 {-1,-1}          :447-449
       │     ├─ openedAt = Date.now()                                 :450
       │     ├─ meta = { hitBreakpointId, hitBreakpointKind, openedAt } :451-455
       │     └─ pending.push({ …, depth, frameName, …meta })          :468
       └─ advance() → record(pd, 'success', returnValue)              :510
             └─ record() 内构造 CaptureObservationMeta                :546-558
                   └─ addObservation(cap, meta)                        :564
                         └─ DecoderCapture.observations[]               :87
```

### 4.2 字段来源表

| 字段 | 来源 | 取不到时 |
| --- | --- | --- |
| `seq` | `++this.obsSeq`（独立于记录 `seq`） | 恒有 |
| `depth` | `frames.length`（入口暂停的真实栈深，存进 pending） | 恒有 |
| `frameName` | `frames[0].functionName`（入口帧） | 空串（与既有 `Pending.frameName` 同口径） |
| `hitBreakpointId` | `p.hitBreakpoints[]` 中匹配 `entryHit` 的真实 ID | **缺失**（不猜） |
| `hitBreakpointKind` | 同上断点的 `BpInfo.kind` | **缺失** |
| `callLocation` | `frames[1].location` | `lineNumber < 0` 时**缺失** |
| `timestamp` | `openedAt`（入口暂停时刻） | 恒有 |
| `status` | 该次观测的状态 | 恒有 |
| `failureStage` | 失败路径显式传入 | 成功时**缺失** |

### 4.3 逐条观测元数据是否保留（对应要求 7、8）

**保留，且不会因去重合并丢失。**

- 去重键（`:542`）仍只含「脚本 + 入口位置 + 参数 + 状态 + 返回值/原因」，**未加入任何新字段**，因此既有去重语义不变。
- 逐条元数据写入 `observations[]`（`:564` / `:593`），与 `count++` 并列发生，**每条观测各一条记录**。
- 同一组里不同 `depth` 的观测可区分（新增测试 `不同 depth 的记录不会因为去重而丢失逐条信息` 直接断言 `depths === [2, 4]` 且 `new Set(...).size === 2`）。
- **仍有上限**：`MAX_OBSERVATIONS = 200`（`:116`），超出时置 `observationsTruncated = true`。这是有意的，避免面板消息无限增大。
- **旧记录兼容**：`observations` / `observationsTruncated` 均为可选，缺失时读取方拿到 `undefined`（新增测试 `历史记录（没有 observations 字段）仍然可以读取` 覆盖）。

### 4.4 `failureStage` 的四类区分

| 值 | 产生位置 | 源码行 |
| --- | --- | --- |
| `openPending` | 入口帧不匹配 / 读参数失败 / pending 溢出 | 458、465、471 |
| `advance` | 退出条件失败 / 单步超限 | 500、521 |
| `failPending` | 默认（handler 错误、watchdog、reset、softReset） | 373、532、616、671、687 |
| `stopNow` | 停止捕获时仍挂在 pending | 641 |

---

## 5. 方案 C：修改前后执行顺序

### 5.1 修改前（问题所在）

```
Target.createTarget(TARGET) → 连接/发现 → startCapture → Page.reload ← 换文档！
   → waitStable → scripts → engineRaw → sourceRead → dryRun → apply → stopCapture
```

`Page.reload` 在第 167 行，位于 `startCapture`（第 157 行）**之后**，制造了 17 项 `stale-script`。

### 5.2 修改后

```
Page.enable → 导航账本订阅（Page.frameNavigated / Page.loadEventFired）
  → Page.navigate(TARGET)
  → waitForDocument      ← 必须 ready === 'complete'，且拒绝 about:blank / chrome-error://
  → pageInfo → connect → discovery
  → waitForScripts       ← 目标脚本（hpailist-2）必须出现在面板脚本列表
  → 冻结 preCaptureDoc + navCountAtStart
  → startCapture         ← 之后【再无任何】Page.reload / Page.navigate / createTarget
  → waitStable（不刷新，仅等待捕获稳定）
  → scripts → engineRaw → sourceRead → selectScript → dryRun → apply
  → sourceReadAfterApply → stopCapture
       └─ 断言：navCountAtStart 之后无导航事件，且 docBefore.href === docAfter.href
```

### 5.3 逐项对照要求

| 要求 | 实现 |
| --- | --- |
| 1. 启动后绝不刷新 | 全文件已无 `Page.reload`（测试断言） |
| 2. 捕获期间不切换文档 | `stopCapture` 内比较导航账本与 `href`，违反则抛错 |
| 3. 不用重试刷新掩盖失败 | 已删除 `retried` 重试分支（测试断言） |
| 4. 拒绝 `about:blank` / `chrome-error` | `docIdentity()` 显式判定并抛错 |
| 5. 记录导航次数/文档身份/起止时间 | `out.navigation`、`out.captureWindow{docBefore,docAfter,startedAt,stoppedAt,navigationsDuringCapture}` |
| 6. 未就绪时明确失败 | `waitForDocument` / `waitForScripts` 超时抛错；且 `step()` 会吞错，故在两处**显式检查** `out.steps.*.error` 并中止 |
| 7. 保留请求预算与授权边界 | 未新增任何业务接口调用；`GetPageList` 未出现（测试断言） |

> 说明：`step()`（脚本内）把异常记入 `out.steps[name].error` 后继续执行，因此仅靠抛错不足以保证中止。已在 `connect` 与 `preCaptureDoc` 之前各加一道显式闸门，确保页面未就绪时**不会**进入 `startCapture`。

---

## 6. 测试结果

### 6.1 新增测试

| 文件 | 用例数 | 结果 |
| --- | --- | --- |
| `test/capture-observation-meta.test.ts` | 7 | **全部通过** |
| `test/p47-l1-run-order.test.ts` | 9 | **全部通过** |

`capture-observation-meta.test.ts` 覆盖：

1. 成功记录的每条观测都有 `depth` / `frameName` / `hitBreakpointId` / `callLocation`
2. **不同 depth 的记录不会因为去重而丢失逐条信息**
3. 失败记录带 `failureStage` 与真实栈信息
4. **取不到的字段保持缺失，不被填成猜测值**
5. **历史记录（无 `observations`）仍可读取**
6. 既有语义不变（去重计数、`callLocations` 合并、`firstSeq`/`lastSeq`）
7. `failureStage` 能区分 `stopNow`

`p47-l1-run-order.test.ts` 覆盖：无 `Page.reload`、无重试、捕获窗口内无导航、就绪判定前置、未就绪明确失败、拒绝空白/错误页、记录导航账本与起止时间、订阅真实 CDP 导航事件、保留授权边界。

### 6.2 完整 Vitest

```
Test Files  1 failed | 50 passed (51)
Tests       1 failed | 557 passed | 3 skipped (561)
```

### 6.3 那 1 个失败的说明（本阶段之前既存在）

```
FAIL test/real-site-l2.test.ts > 样本登记与来源 >
  本地生成样本没有被标成真实网站样本；L1 目标站点仍未登记、仍在等待用户确认
  at test/real-site-l2.test.ts:79  expect(l1?.status).toBe('blocked-awaiting-user')
```

**不是本阶段造成的，也未修改该测试。** 证据：从本阶段**开始前**的备份 `ob-backup-p47-cd-20261110` 读取 `registry.json`，当时 `samples` 里**已经**有 L1 样本：

```json
samples = [
  { "id": "l1-qccqcc-hangzhou", "layer": "L1", "status": "blocked", "isRealSiteSample": true },
  { "id": "l2-real-ob-seed", "layer": "L2", "isRealSiteSample": false }
]
```

于是 `test/real-site-l2.test.ts:77` 的 `samples.some(s => s.isRealSiteSample)` 在修改前就是 `true`。该失败源于更早阶段合法登记了 L1 样本、而这处断言未同步更新，**属既有陈旧断言**。本阶段未触碰 `registry.json` 与该测试文件。

> 建议（待用户决定，本阶段不实施）：把该断言的语义改为「`samples` 中不得有 `local-generated` 样本被标为真实网站样本」，与 `:76` 保持一致。

> **更正（见第 10 节）**：上句建议基于一个错误的行号判断。实际失败的是 **第 77 行**，不是第 79 行；第 79 行本来就通过。已在最终准备审查中按真实语义修复第 77 行。

### 6.4 TypeScript

| 文件 | 错误数 |
| --- | --- |
| `src/extension/debugger/capture-engine.ts` | **0** |
| 新增错误（相对基线 `tsc-1.txt`，忽略行号） | **1**，`test/p47-l1-run-order.test.ts(2,30) TS2307: Cannot find module 'node:fs'` |

该条与基线中 138 条 `TS2307` / 164 条 `TS2580` 同类（项目缺 `@types/node`），非新增类型缺陷。总错误行数 439 → **429**。

过程中我曾引入 22 条 `p47-l1-ob-run.ts` 的类型错误（`navEvents` 推断为无参函数、`nav.events` 推断为 `never[]`、`out` 字面量类型过窄），已在验收脚本内显式标注类型修掉；**未为迁就测试而改动产品实现**。

### 6.5 Vite build 与 dist

```
npx vite build → exit 0，无错误
```

| 产物 | 发布前（备份） | 现在 | 结论 |
| --- | --- | --- | --- |
| `background.js` | `8db17026…` | `6a4e13eb…` | **已变更**（捕获引擎打包于此） |
| `devtools.js` | `870b0b74…` | `870b0b74…` | 逐字节相同 |
| `panel.js` | `9cbc65a3…` | `9cbc65a3…` | 逐字节相同 |
| `sandbox.js` | `2df0c212…` | `2df0c212…` | 逐字节相同 |

> **不声称原 dist 哈希保持不变**：`background.js` 哈希确已变化。体积 51391 → 52899（**+1508** 字节），差异集中在新增标识符（`observations`、`observationsTruncated`、`failureStage`、`hitBreakpointId`、`stopNow` 等）。

---

## 7. 修改文件清单

| 文件 | 类型 | 改动 |
| --- | --- | --- |
| `src/extension/debugger/capture-engine.ts` | 产品源码（**仅新增可选字段与只读记账**） | 新增 `CaptureFailureStage`、`CaptureObservationMeta`；`DecoderCapture` 增 `observations?` / `observationsTruncated?`；`Pending` 增 `hitBreakpointId?` / `hitBreakpointKind?` / `openedAt`；`record()` 增 `failureStage` 参数并写入逐条元数据；新增 `addObservation()` 与 `obsSeq`；`openPending` 接收命中断点并传 stage；`advance` / `failPending` / `stopNow` 传 stage |
| `scripts/p47-l1-ob-run.ts` | 验收脚本 | 方案 C：导航前置、就绪/脚本等待与中止闸门、导航账本、捕获窗口断言、移除 `Page.reload` 与重试；补显式类型 |
| `test/capture-observation-meta.test.ts` | 新增测试 | 7 用例 |
| `test/p47-l1-run-order.test.ts` | 新增测试 | 9 用例 |
| `docs/PHASE4.7-L1-CLEAN-RUN-PREPARE.md` | 本文档 | — |

**未修改**：`capture-validation.ts`、`replacement-dryrun.ts`、`verified-replacer.ts`、`function-features.ts`、`replacement-safety.ts`、`test/real-site-l2.test.ts`、`registry.json`、Phase 4.7 指标与门槛、`throwOnSideEffect`、AST 替换规则、源码只读策略。

---

## 8. 是否影响原有捕获、验证与替换行为

| 方面 | 影响 |
| --- | --- |
| 捕获（去重、计数、`callLocations`、截断、失败处理） | **无**。去重键未变；`count` / `callLocations` / `firstSeq` / `lastSeq` 语义不变（既有 `capture-call-locations.test.ts` 6 用例与 `capture-engine*.test.ts` 全通过） |
| 验证（`verified` / `unstable` / `failed` / `insufficient`） | **无**。未改 `capture-validation.ts`；`capture-validation.test.ts` 26 用例全通过 |
| 替换（dry-run 候选、`callLocationsTruncated` 保守拒绝） | **无**。`replacement-dryrun.test.ts`、`replacement-truncation.test.ts`、`verified-replacer.test.ts` 全通过 |
| 面板消息体积 | 每条记录新增 `observations[]`（上限 200）。**这是唯一可感知的变化**，未观察到上限触发 |
| 旧证据可读性 | **兼容**。新字段可选，缺失读取为 `undefined`（有测试覆盖） |

---

## 9. 尚未解决的问题

1. **`test/real-site-l2.test.ts:77` 陈旧断言**：本阶段之前即失败（第 6.3 节）。未修改，等待用户决定。
2. **`@types/node` 缺失**：基线 138 条 `TS2307` + 164 条 `TS2580` 仍未处理，新测试文件再添 1 条同类。
3. **方案 A、B 未实施**（按要求）：断点落点仍在 `0:368`（内层实现函数）、`outer-state-write` 仍 blocking。本次 0 候选的两个根因**依然存在**。
4. **`observations` 上限 200**：高频合并记录（L1 已达 75–76 次/组）会截断元数据并置 `observationsTruncated`。若下次干净运行需要完整逐条栈帧，可能需要提高上限或改为流式导出。
5. **未验证项**：本次**未运行 L1**、未访问目标网站，因此方案 C 的新顺序与方案 D 的新字段**只经过单元测试与静态断言验证，未经真机验证**，不得视为已通过。

---

## 10. 最终准备审查记录（Clean Run 前）
只读审查 + 修复确认属于测试语义错误的断言。**未修改任何产品业务逻辑。**

### 10.1 陈旧测试断言的处理

#### 11.1.1 定位更正

上一份报告把失败断言写成 `test/real-site-l2.test.ts:79`，这是**错的**。逐项核实如下：

| 证据 | 结果 |
| --- | --- |
| 单独运行该文件的实际报文 | `AssertionError: expected true to be false // Object.is equality` |
| 第 79 行断言 | `expect(l1?.status).toBe('blocked-awaiting-user')` — 字符串比较，不可能报出 `true to be false` |
| registry 第 104 行 | `plannedSamples.l1-target-site.status = "blocked-awaiting-user"` → 第 78–79 行**本来就通过** |
| 第 77 行断言 | `expect(samples.some(s => s.isRealSiteSample)).toBe(false)` → `samples` 含 `l1-qccqcc-hangzhou`（`isRealSiteSample: true`），**这才是失败点** |

#### 11.1.2 状态语义区分

| 状态 | 所处位置 | 语义 |
| --- | --- | --- |
| `blocked-awaiting-user` | `plannedSamples.l1-target-site` | **planner 占位项**：尚未选定/确认目标站点，等待用户确认测试权。第 11 节要求用户先确认，本轮不自选站点 |
| `blocked` | `samples.l1-qccqcc-hangzhou` | **已登记并且真跑过的 L1 样本**：捕获成功但验证层全部拒绝（13 unstable + 17 failed），0 候选、0 替换，**未通过** |

两者**不矛盾，是不同层次的记录**：planner 项表示"是否要开始"，样本项表示"跑完之后的结论"。L1 样本一旦登记，必然 `isRealSiteSample: true`（`kind: "real-site"`），因此第 77 行"samples 里不得存在任何真实网站样本"实质等价于"L1 永不允许登记"，与登记行为直接冲突 —— 这是对"尚未登记"的**过度解读**，属于测试语义错误。

#### 11.1.3 修复内容

保留的约束（不放松）：
- 第 76 行：`local-generated` 样本**永远不得**标记为真实网站样本（registry `hardRules` 第 5 条）。
- 授权边界与验收门槛：未改 `registry.json`、未改任何状态值、未改 Phase 4.7 指标。

改写第 77 行为真实语义：

```diff
-      expect(shared.registry.samples.some((s) => s.isRealSiteSample)).toBe(false);
+      // 真实网站样本只允许是 L1，且必须带 real-site 类型：不允许任何非 L1 样本混入 isRealSiteSample=true
+      const realSites = shared.registry.samples.filter((s) => s.isRealSiteSample);
+      expect(realSites.every((s) => s.layer === 'L1' && s.kind === 'real-site')).toBe(true);
+      // L1 的登记状态是 blocked（跑过但因验证层全部拒绝而未通过），不是任何"通过/可用"状态
+      const l1Sample = shared.registry.samples.find((s) => s.layer === 'L1');
+      expect(l1Sample?.status).toBe('blocked');
+      // planner 里"待用户确认站点"的条目仍未消费：授权边界不变
+      const l1 = shared.registry.plannedSamples.find((s) => s.layer === 'L1');
+      expect(l1?.status).toBe('blocked-awaiting-user');
```

用例标题同步改为「本地生成样本没有被标成真实网站样本；L1 目标站点仍未被登记为可用的通过样本」。

附带修正：`RegistrySample` 接口（第 19 行）缺 `status` 字段，而 registry 里实际存在，tsc 报 `TS2339`。已补 `status: string`，使接口与真实数据一致（**不是**为绕过错误而放宽类型）。

### 10.2 `observations` 截断安全性

| 检查项 | 结果 |
| --- | --- |
| `MAX_OBSERVATIONS` | `= 200`，定义在 `capture-engine.ts:161` |
| 设置点 | 仅 `addObservation()`（`:175-182`），`:178` 置 `observationsTruncated = true` 后 `return`（不再 push） |
| 序列化/面板传输 | **保留**。`observations` / `observationsTruncated` 是 `DecoderCapture` 的字段，随 `getCaptures()`（`:241`）经 `background.ts:81` / `:496` 的 `captures:` 原样进入 `capture-state` 消息；未经任何字段裁剪 |
| 验证层能否识别截断 | **不能**。`capture-validation.ts` 中**没有任何**对 `observations` / `observationsTruncated` 的读取 |
| 是否会被误当完整证据 | **目前不会**，但原因不是有保护，而是**该字段根本未被消费** |

**关键发现：`observationsTruncated` 是一个"只写不读"的标记。** 全仓搜索确认它只在 `capture-engine.ts:178` 被设置，没有任何读取方。因此：

- **不构成安全风险**：`verified` 判定完全基于 `count` / `arguments` / `returnValue` / `callLocations` / 静态特征（`capture-validation.ts:296-434`），**不依赖逐条观测元数据**；截断只影响"栈帧深度可追溯性"这一观测能力，**不影响任何替换决策**。不存在"把截断数据当完整数据去放行替换"的路径。
- **构成证据完整性缺口**：若下次干净运行触发了 200 上限，元数据被静默截断（仅有标记、无人读取），分析者可能误以为"这就是全部逐条观测"。

**L1 实测不会触发**（只读统计旧证据 `raw-run.json`）：

| 指标 | 值 |
| --- | --- |
| 记录总数 | 1059 |
| 单条合并记录最大 `count` | **3** |
| 每个参数组的合并记录条数上限 | **76** |
| `count >= 100` 的记录 | 0 |
| `count > 200` 的记录 | **0** |

即：既有的 L1 运行距 200 上限有 2.6 倍余量。

**最小修复方案（只提出，本阶段不修改产品代码）**：

- 方案 1（推荐，最小）：在 `addObservation` 触顶时**同时发出一次 `log` 事件**（`this.emit({ kind: 'log', level: 'warn', message: 'observations truncated at ' + MAX_OBSERVATIONS + ' for ' + cap.functionName })`），让截断在面板可见，避免静默。
- 方案 2：把 `MAX_OBSERVATIONS` 提到明显高于单组观测数（如 1000），并保留标记。**注意**：这会增大面板消息体积（L1 已单次传输 1059 条记录），需评估。
- 方案 3（若需完整逐条）：改为流式导出到独立文件，不经面板消息。

**明确不做**：不把 `observationsTruncated` 接入 `verified` 判定 —— 那会改变验证规则的严格度，超出本阶段授权范围，且方向上是**收紧**，需先经 L2/L3 回归验证。

### 10.3 构建与部署一致性

| 检查项 | 结果 |
| --- | --- |
| `dist/background.js` 是否含新字段 | **含**。`observations` ×6、`observationsTruncated` ×1、`failureStage` ×4、`hitBreakpointId` ×4 |
| `dist/background.js` SHA-256 | `6a4e13ebb567502daabebbe431352b1f35cd45353d9c5d16b82566ddbd3b3c98`（重建后**不变**，与 `distdiff.cjs` 记录一致） |
| L1 脚本加载的目录 | `scripts/p47-l1-ob-run.ts:11` → `const DIST = ROOT + '/dist'`，`:94` `Extensions.loadUnpacked({ path: DIST })` |
| 是否与当前构建一致 | **一致**。`src/` 下**没有**任何文件比 `dist/background.js` 更晚（mtime 检查：0 个）；根配置 `vite.config.ts` / `package.json` / `tsconfig.json` 也没有更新的 |
| 旧扩展实例风险 | **无**。`chrome.exe` 进程数 **0**；带 `l1-ob-profile` 的进程 **0**；9470 端口监听 **0** |
| 静态资源误判风险 | **已排除**。`dist` 中 `devtools.html`(11/08)、`manifest.json`(11/09) 等 mtime 早于构建，但这是 `vite.config.ts:34-59` 的 `copy-extension-files` 插件在 `closeBundle` 用 `copyFileSync` 拷贝所致（保留源文件时间戳），**不是陈旧残留** |
| 扩展 ID 稳定性 | `manifest.json` **无 `key` 字段**，扩展 ID 由 profile 派生。`p47-l1-ob-run.ts:66` 每次运行前 `rmSync(PROFILE)` 重建专用 profile，因此每次运行的 ID 一致且不受历史影响 |
| 全部脚本的加载路径 | 所有 `devtools-*.ts` / `devtools-real-ob-e2e.ts` / `p47-l1-ob-run.ts` 均加载同一个 `D:/Projects/ob-recover/dist`，不存在第二份构建产物 |

### 10.4 本次修改文件

| 文件 | 改动 |
| --- | --- |
| `test/real-site-l2.test.ts` | 第 19 行 `RegistrySample` 补 `status: string`；第 72–84 行用例按真实语义重写第 77 行断言、补两条不放松的约束、标题同步 |
| `docs/PHASE4.7-L1-CLEAN-RUN-PREPARE.md` | 第 6.3 节加行号更正；新增本第 11 节 |

**未修改**：`src/` 下任何文件、`registry.json`、`capture-validation.ts`、`outer-state-write`、`verified` 判定、`throwOnSideEffect`、断点落点逻辑、Phase 4.7 指标与门槛。

### 10.5 测试与构建结果（全部为本次实测）

| 项 | 结果 |
| --- | --- |
| 相关测试（`real-site-l2` + `capture-observation-meta` + `p47-l1-run-order`） | **3 文件全通过** |
| `real-site-l2` 单独运行 | **19/19 通过**（修复前为 1 失败） |
| 完整 Vitest | **51 文件全通过；558 passed / 3 skipped / 0 failed**（修复前为 1 failed） |
| TypeScript | `src/` **0 错误**；相对基线新增 **1** 条 `TS2307`（新测试文件缺 `@types/node`，与基线 138 条同类）。总行数 439 → **429** |
| Vite build | **exit 0，无错误**；重建后 `background.js` 哈希不变 |

### 10.6 剩余阻断项

1. **方案 A、B 未实施**：断点仍落在 `0:368`（内层实现函数），`outer-state-write` 仍 blocking。**本次 0 候选的两个根因依然存在**，下次干净运行若其他条件不变，预计仍是 0 候选。
2. **方案 C / D 未经真机验证**：仅通过单元测试与静态断言。**不得视为已通过**。
3. **`observationsTruncated` 只写不读**（第 10.2 节）：不影响安全性，但影响证据完整性。已提最小修复方案，待批准。
4. **`@types/node` 缺失**：基线 138 条 `TS2307` + 164 条 `TS2580` 仍未处理。
5. **`tsc` 基线未清零**：429 条错误全部为既有类型环境问题，未在本阶段范围内处理。
6. **未验证项**：本次**未运行 L1**、**未访问目标网站**、**未启动浏览器**，因此方案 C 的新执行顺序在真实站点上的实际行为仍未验证。

---

## 11. 停止状态

- 报告完成，**立即停止**。
- 未运行 L1；未访问杭州目标网站；未实施方案 A / B；未进入 Phase 5；未修改产品业务逻辑；未放宽任何安全策略。
- 完整 Vitest 的 1 个失败已按"测试装置失误与失败原样归档"要求保留，未用重跑或删除测试掩盖。
- 等待审查后再决定是否执行下一次干净 L1。
