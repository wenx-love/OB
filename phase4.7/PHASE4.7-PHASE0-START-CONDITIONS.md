# Phase 4.7 Phase 0 启动条件补充（V5 补丁）

> **性质：** 对 `PHASE4.7-WORKER-REMEDIATION-PLAN-V5-CANDIDATE.md` 的 Phase 0 启动条件补充。只补书面条件，不执行 Phase 0，不修改产品代码、测试、构建产物或历史证据。
>
> **输入（已核验 MATCH）：**
>
> - V5 候选：71817 字节，1140 行，`4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9`
> - V5 追溯：9559 字节，107 行，`1b29b249b232cc5ee74d3cbd5f6b2b0441d6d0d9b4e44fe8b590520ca496a705`
> - V5 自检：5837 字节，61 行，`09dac6cb7658291c86fc055287a75a5e9c37724beaad791b85759b189e5ce4bd`
> - 第四轮审查：28193 字节，345 行，`ade4cb3b1336b545955fbe6f3955a2c0a573d0ac22b57748a8dba2edf96195dc`
>
> **状态冻结：** 本轮维持独立审查计数 **0 CLOSED / 23 PARTIAL / 2 OPEN**。按本轮用户指定：**OPEN = R05、R16**；**R01 = PARTIAL**；其余 22 项为 PARTIAL。不新增、不减少、不改写任何评级；0 CLOSED 不表示设计全部失败，2 OPEN 不表示实现已经失败。
>
> **本轮结论：** 只形成 Phase 0 启动条件；Phase 0 仍未启动，等待用户批准与 Codex 复核。

---

## 一、Phase 0 启动条件总表

| 编号 | 条件 | 证据/位置 | 未满足时 |
|---|---|---|---|
| P0-1 | 用户批准 Phase 0 范围（仅基线、隔离、检测器自测、副本对照）并授权管理员 | 用户书面批准 | 不启动 |
| P0-2 | 正式根 `D:\P47RUN\<run>` 由授权管理员创建 | §2、ACL 记录 | 不启动 |
| P0-3 | ACL：Admin/SYSTEM 完全控制、Codex 沙箱组只读、关闭继承、读回 | §2、§4 | 不启动 |
| P0-4 | 模拟保护区自测先于真实副本验证 | §2 | 不进入真实副本 |
| P0-5 | 权威 M0/来源快照/三副本派生与核对 | §2、§5 | 不进入产品实验 |
| P0-6 | 逐命令白名单与只读白名单 | §4、白名单 TSV | 不执行未列命令 |
| P0-7 | `tsc` 一律 `--noEmit` | §4、§6 | 不执行类型检查 |
| P0-8 | 禁止区内容读取成功即 FAIL | §2、§3 | 停止并报告 |
| P0-9 | 第二归档位置由用户指定 | §5 | 不关闭 Phase 0 |
| P0-10 | 阶段出口无条件停审 | §5 | 不进入 Phase 3 |

**Phase 0 只允许：** 基线冻结、运行环境隔离、ACL 验证、检测器自测、三副本准备、插件对照、证据归档。**禁止**任何产品代码整改、构建、浏览器、L1。

---

## 二、模拟保护区自测 → 真实副本验证的顺序

### 2.1 固定顺序

| 步骤 | 名称 | 位置 | 读取 | 写入 | 通过条件 |
|---|---|---|---|---|---|
| S1 | 模拟保护区自测 | `<run>\controls\protected`（假原项目/假历史证据/假 baseline） | 仅 controls 与工具 | 仅 controls/out | 检测器 PASS；禁止区读取/写入全部拒绝；假树阳性/阴性对照通过 |
| S2 | 检测器闸门 | 同上 | 自测报告 | out | S1 全部关键项 PASS；任一 FAIL 即停止 |
| S3 | 权威 M0 + 来源快照 | 原项目（只读）→ `<run>\baseline` | 原项目仅经清单/归档工具；工具文件 | baseline（写一次） | 两套哈希一致；归档逐条核对 |
| S4 | 三副本派生 | snapshot → `<run>\sandbox`、`<run>\exp\pristine-*`、`<run>\exp\no-plugin-*` | snapshot/清单 | 三副本 | 逐文件等于 M0；无链接回原项目；各自依赖/TEMP/cache |
| S5 | 真实副本验证 | 三副本 | 副本 | 副本 + out | 守卫在副本上读写判定正确；保护区拒写/拒读；插件对照记录 |
| S6 | 产品实验 | 三副本 | 副本 | 副本 + out | `tsc --noEmit`、Vitest 原样/无插件、中和等价性 |
| S7 | 阶段报告 | out | 日志 | out/review | 无条件停审 |

### 2.2 为什么先模拟、后真实副本

1. 检测器/守卫自身的 bug 先在假树上暴露，不会触碰真实副本或原项目。
2. 模拟树可故意构造同内容重写、ADS、硬链接、别名、禁止读等极端情形，真实副本不宜为了测试而制造这些变化。
3. 模拟通过后，真实副本验证只回答“在真实目录结构上是否同样成立”，不再承担检测器算法调试。
4. 原项目只在 S3 由清单/归档工具读取一次；产品测试永不读取原项目。

### 2.3 模拟保护区的构成

- 假原项目：`<run>\controls\protected\project`，结构与原项目代表性目录一致，内容为合成文件。
- 假历史证据：`<run>\controls\protected\evidence`，含只读样本。
- 假 baseline：`<run>\controls\protected\baseline`，含只读清单。
- 假运行根外目标：`<run>\controls\outside`，用于越界写入/读取测试。
- 守卫的“禁止根”指向 `controls\protected` 与 `controls\outside`，不是原项目；模拟阶段不允许把原项目加入测试目标。

### 2.4 真实副本验证的边界

- 真实副本是 snapshot 的副本，不是原项目；守卫的禁止根指向副本内的历史证据子目录与冻结 baseline。
- 真实副本验证不得回读原项目；不得用链接/硬链接指回原项目。
- 插件写自身实验 `dist` 属于预期观察，记录但不判违规；写历史证据即失败。
- 禁止区内容读取成功即 FAIL（见 §3）。

---

## 三、禁止区与读取判据（Phase 0 执行口径）

### 3.1 禁止区

- 原项目 `D:\Projects\ob-recover`。
- 历史验收证据与冻结 baseline。
- 其他用户目录、系统目录、网络共享。
- 运行根之外的非授权位置。
- 副本中的历史证据子目录与冻结 baseline（真实副本验证时）。

### 3.2 实际读取的判定

- `open` + `read`/`readFile`/`createReadStream` 返回禁止区内容字节。
- `FileHandle.read` 通过已打开 FD 返回内容；FD 按真实路径判定。
- `copyFile`/`cp` 的**源**在禁止区：读取源即违规，即使目标是允许区。
- 经符号链接、硬链接、`realpath`、`subst`、8.3 短名读取到禁止区内容。
- 子进程读取禁止区内容：可观测即违规；不可观测记“未覆盖”，不得写成通过。
- 未列入的读取方式（mmap、共享内存等）标 `UNVERIFIED`。

**不算内容读取：** `stat` 只取属性、`readdir` 只取名字；算元数据查询，必须记录，但不等于读取文件内容。

### 3.3 允许读取原项目的唯一例外

- 只有清单/归档工具（C06/C07）可按白名单读取原项目文件内容；记录工具、路径、命令、用途、哈希。
- 隔离产品测试、Vitest、`tsc`、插件对照、中和实验一律不得读取原项目。
- 真实副本验证不得回读原项目。

### 3.4 记录与停止

- 每次读取尝试记录：命令 ID、路径、真实路径、方式（API/FD/复制/链接/子进程）、预期、实际、时间、主体。
- **禁止区内容读取成功即 FAIL**，即使有日志、能解释原因；不得用“差异已归因”豁免。
- 失败时保留现场、日志、证据哈希；停止 Phase 0。

---

## 四、逐命令白名单（摘要）

完整机器可读表见同目录 `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST.tsv`。

### 4.0 Phase 0 文件创建、修改、删除边界

| 动作 | 允许对象 | 禁止对象 |
|---|---|---|
| 创建 | `<run>` 根、探针目录、controls、baseline、trust、三副本、out、profiles、tmp、evidence | 原项目内任何文件/目录；运行根外 |
| 修改 | 三副本、out、evidence、trust（只追加）、baseline（仅建立时一次） | 原项目、历史证据、冻结 baseline、运行根外 |
| 删除 | 仅运行结束后的临时 profile/tmp，删除前记录文件数与字节 | 证据、日志、失败记录、实验副本的唯一副本、历史文件 |
| 永不 | — | 原项目、历史验收证据、冻结 baseline、他人目录 |

**实验产物不删除：** 构建/插件实验输出隔离归档；不得以“清理”为由删除失败证据的唯一版本。

### 4.1 全局规则

- 所有命令经 `p0-launcher`，只接受命令 ID；自由命令行拒绝。
- 工作目录限定 `<run>` 内；工具只从副本的 `node_modules` 调用，不用 `npx`。
- `NODE_OPTIONS` 由启动器设定守卫预加载；`TEMP/TMP` 指向 `<run>\tmp`。
- 无网络、无 Chrome、无 L1、无旧 `scripts/` 执行。
- 原项目读取只允许 C06/C07；其他命令读取原项目即 FAIL。
- **所有 TypeScript 类型检查一律 `tsc --noEmit`**；禁止产生 JS、`.d.ts`、`.map`、`.tsbuildinfo` 或 `dist` 变化。

### 4.2 命令表

| ID | 允许命令 | 允许读取 | 允许写入 | 禁止操作 |
|---|---|---|---|---|
| C01 | 管理员初始化运行根/目录 | 运行根状态 | `<run>` 根、探针、controls、baseline、trust、三副本目录 | 写原项目；改原项目 ACL |
| C02 | 设置/读回 ACL | `<run>` ACL | `<run>` ACL、out/acl | 原项目 ACL；扩权 |
| C03 | Codex 只读探针 | 哨兵文件 | `acl-probe`（预期拒绝）、out | 读取原项目；截断冻结文件 |
| C04 | 工具完整性 | `<run>\tools` | out | 工具目录外写入 |
| C05 | 模拟保护区自测 | `controls`、工具 | `controls`、out | 读取原项目/真实副本 |
| C06 | 权威 M0 清单 | 原项目（只读）、工具 | `baseline`、out | 写原项目；产品测试读取原项目 |
| C07 | 原项目归档 | 原项目（只读） | `baseline` | 写原项目；修改历史证据 |
| C08 | 快照/三副本派生 | `baseline`、snapshot | 三副本 | 链接回原项目；共享可写 |
| C09 | 副本核对 | snapshot、三副本 | out | 读取原项目 |
| C10 | 真实副本守卫验证 | 三副本 | 三副本、out | 原项目读写；网络 |
| C11 | `tsc --noEmit` | 沙箱/实验副本 | 仅 out 日志 | 产生编译输出；写 `dist`；无 `--noEmit` |
| C12 | Vitest 原样 | pristine 副本 | 该副本 cache/tmp/out | 原项目；历史证据；写 `dist` |
| C13 | Vitest 无插件 | no-plugin 副本 | 该副本 cache/tmp/out | 原项目；历史证据 |
| C14 | 插件写 `dist` 对照 | 两个实验副本 | 各自 `dist`、out | 原项目；沙箱证据；判为违规前先登记 |
| C15 | 中和等价性 | 中和副本 | 中和副本、out | 原项目；把中和结果带回原样副本 |
| C16 | 证据索引/trust | evidence、trust | evidence、trust（只追加） | 写 baseline；覆盖历史 |
| C17 | 阶段报告 | out/logs | out/review | 修改输入/证据 |

### 4.3 `tsc` 的唯一形式

```text
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

- 必须在副本根执行；不得在 `D:\Projects\ob-recover` 执行。
- 执行后检查：`dist` 内容/哈希不变；无 `.tsbuildinfo`；无新增 `.js/.d.ts/.map`。
- 任何带输出的 `tsc`（无 `--noEmit`）一律拒绝。

---

## 五、更新后的阶段依赖关系

顺序不变：**Phase 0 → Phase 3 → Phase 1 → Phase 2 → Phase 4 → Phase 5 → Phase 6 → Gate P**。

| 阶段 | 进入条件 | 阶段内工作 | 出口条件 | 失败/回滚 |
|---|---|---|---|---|
| Phase 0 | 本补充文档获批；用户授权；P0-1—P0-10 满足 | 模拟自测 → 检测器闸门 → M0/快照 → 三副本 → 真实副本验证 → 产品实验 | 检测器 PASS；无禁止区读取成功；M0/M1；三副本；ACL；第二归档；报告；**无条件停审** | 丢弃运行根；原项目未写；证据保留；`source-unknown` 停止 |
| Phase 3 | Phase 0 批准；D1/D2/D11/D16 有决定；D13 可选 | 修复制插件、顶层 worker、戳/旁清单、trust、D11/D16 若批准 | 双构建一致；旁清单/实际产物一致；A/B 加载；Vitest 不写 dist；`tsc --noEmit` | 恢复到 Phase 0 出口；实验产物归档不删除唯一证据 |
| Phase 1 | Phase 3 批准；**R01 动态验证方案获批**；**R05 规格与测试方案获批**（OPEN 不阻止进入，但阻止出口） | 双 Promise/状态机/取消/熔断/缓存/去重/force | R01 动态用例全绿；R05 身份/去重用例全绿；无 pending/重复结算；统计守恒 | 恢复 Phase 3；与 Phase 2 联合回滚到 Phase 3 兼容快照 |
| Phase 2 | Phase 1 批准；**R05 必须已解决或用户书面例外**；D5/D6/D7 有决定/暂缓；D10 已批准 | coordinator、纪元、URL、后台守卫、提交、捕获目标 | 最新请求独占 currentState；刷新单飞；D6 确定性测试；钩子九字段 | 联合回滚 Phase 3；不只退 panel |
| Phase 4 | Phase 2 批准；**R16 规格与测试方案获批**（OPEN 不阻止准备，但阻止正式测量） | DOM token/零候选、deadline、性能测量、竞态 | R16 八反例通过；deadline 全表；50%；`render-completed` 带来源 | 恢复 Phase 2；失败运行保留 |
| Phase 5 | Phase 4 批准；两 schema 规格获批 | 四方完整一致性、双哈希、深比较 | 四方各自相等；schema 不混用；降级标注 | 恢复 Phase 4 |
| Phase 6 | Phase 5 批准；最终树规则获批；D13 决定 | 冻结、全量、双构建、最终树、真机五项 | 安全指标；最终树/bundle；提升清单 | 恢复 Phase 5；冻结后改动作废重跑 |
| Gate P | Phase 6 批准；清单逐项批准；新静默窗口 | 一次性提升 | 差异=清单；dist=最终树；证据不变 | 按日志回滚；记录元数据差异 |

**关键门：**

- R05 OPEN：Phase 1 可做规格/实现，但 **Phase 1 出口不得签 R05 关闭**，Phase 2 进入前必须解决或用户书面例外。
- R16 OPEN：Phase 4 可做工具准备，但 **正式性能测量不得在 R16 未解决时签发渲染通过**。
- R01 PARTIAL：Phase 1 必须按 §6 动态验证；不得仅凭源码审查升 CLOSED。
- 0/23/2 评级不变；本表只定义阶段门，不修改评级。

---

## 六、R05、R16 OPEN 与 R01 PARTIAL

### 6.1 状态冻结表

| 项 | 状态 | 说明 |
|---|---|---|
| CLOSED | 0 | 第四轮严格口径：设计完成但未动态验证不升 CLOSED |
| PARTIAL | 23 | 含 R01 与其余 22 项 |
| OPEN | 2 | **R05、R16** |
| 合计 | 25 | 不新增、不减少、不改写 |

### 6.2 R05（OPEN）

| 项 | 内容 |
|---|---|
| 具体问题 | 完整无损源码身份、完整缓存键、非 force 去重与 force 隔离尚未实现/未动态验证；V4 曾回退，V5 §8.4 只恢复书面规范 |
| 影响范围 | 缓存误命中/误复用、同 scriptId 换源码混用、同源码跨 URL/页面误合并、force 与非 force 错误合并、等待者挂错请求 |
| 后续阶段 | Phase 1 实现 + Phase 1 出口动态验证 |
| 关闭条件 | `SourceIdentityV1`/`CacheKeyV1`/`ActiveKeyV1` 实现；孤立代理项、同 id 换源码、同源码换 URL/页面、force、缓存淘汰、并发等待者用例全绿；无错误合并/缓存污染 |
| 未关闭时 | Phase 1 不得签 R05 CLOSED；Phase 2 不得进入（除非用户书面例外） |

### 6.3 R16（OPEN）

| 项 | 内容 |
|---|---|
| 具体问题 | 测试专用 DOM 身份/逐卡 commitToken/零候选独立 token/旧纪元复用/渲染快照关系尚未实现/未验证；测试属性是否接受也未决 |
| 影响范围 | 同签名旧卡/其他脚本卡/零候选/同内容刷新/旧纪元可能被误判为渲染完成；性能验收可能假通过 |
| 后续阶段 | Phase 4 规格/实现 + 八反例；正式测量前必须解决 |
| 关闭条件 | 八反例全绿；逐卡 token 一致；零候选独立 token；tick 只在完整快照后发布；旧纪元拒绝；真实 panel 呈现证明 |
| 未关闭时 | Phase 4 不得签发渲染通过；只能报 `render-unverified`；Phase 6 不得以渲染通过计入性能验收 |

### 6.4 R01（PARTIAL）动态验证方案

**目标：** 证明 `resultReady`/`completion` 在所有终态各结算一次、无永久 pending、无重复、资源清理、旧请求不改写最新脚本状态。

**用例（Phase 1 必跑）：**

1. 正常成功 → commit 成功：两 Promise 各一次。
2. `deferred` 取消 → resultReady error `cancelled`，completion `cancelled`。
3. `retry-pending` 取消 → 同上。
4. `executing` 取消 → 尝试结算，两 Promise 结算。
5. 构造失败 → resultReady `worker-unavailable`，completion `failed`。
6. 熔断打开（有 deferred/retry-pending）→ 全部 `failed(breaker-open)`，无 pending。
7. 第二次看门狗 → `watchdog-timeout-retry-exhausted`，两 Promise 结算。
8. 提交拒绝 → completion `commit-rejected`，resultReady 不改写。
9. 提交超时 → completion `commit-timeout`；迟到 commit 忽略。
10. 缓存命中成功 → 新请求 id/seq/ack；两 Promise 一次。
11. 缓存命中解析失败 → 两 Promise 立即结算，无 ack。
12. 重复取消/重复 commit/迟到事件 → no-op。
13. `dispose` → 先 disposed，再结算，永不再调度。
14. 旧请求 completion 不改变最新脚本 currentState（force 并发）。

**断言：** 每请求 `resultReady` 恰好一次、`completion` 恰好一次；终态无 pending；ack/定时器/等待者/索引清零；取消期间 pump=0；旧事件无副作用；资源计数回零。

**证据：** 测试输出、Promise 结算日志、定时器/等待者计数、状态快照；红/绿存档。

**出口：** 14 项全绿后，R01 才可申请从 PARTIAL 升级；不得仅凭源码审查升 CLOSED。

---

## 七、验证顺序与回滚

### 7.1 Phase 0 验证顺序

1. 模拟保护区自测（S1）→ 2. 检测器闸门（S2）→ 3. 权威 M0/快照（S3）→ 4. 三副本派生（S4）→ 5. 真实副本验证（S5）→ 6. 产品实验（S6，含 `tsc --noEmit`、Vitest、插件对照、中和）→ 7. 报告停审（S7）。

**禁止：** 跳过模拟直接真实副本；检测器未 PASS 就取权威 M0；产品实验读取原项目；用归因豁免禁止区读取。

### 7.2 Phase 0 回滚

- 原项目未写入：无需回滚；丢弃 `<run>` 内副本与临时目录。
- 证据、日志、失败记录保留；实验产物隔离归档，不删除唯一证据。
- 若检测到原项目变化：`source-unknown`，停止，保留现场；不自动还原、不归因。
- 若 ACL/权限失败：停止；不扩权、不换位置、不关守卫。

### 7.3 后续阶段回滚

| 阶段 | 回滚点 |
|---|---|
| Phase 3 | 恢复 Phase 0 出口；构建实验产物归档 |
| Phase 1/2 | 联合恢复到 Phase 3 兼容快照；不只退 panel |
| Phase 4 | 恢复 Phase 2 出口；失败运行保留 |
| Phase 5 | 恢复 Phase 4 出口 |
| Phase 6 | 恢复 Phase 5 出口；冻结后改动作废重跑 |
| Gate P | 按步骤日志逆序撤销；归档还原；记录元数据差异 |

---

## 八、尚未解决问题清单

| # | 问题 | 状态 | 责任阶段 |
|---|---|---|---|
| 1 | R05 无损身份/缓存/去重未实现/未验证 | OPEN | Phase 1 |
| 2 | R16 DOM 渲染身份/零候选/纪元未实现/未验证 | OPEN | Phase 4 |
| 3 | R01 双 Promise 动态验证未跑 | PARTIAL | Phase 1 |
| 4 | 其余 22 项 PARTIAL（含 R02/R03/R04/R06—R15/R17—R25） | PARTIAL | 各阶段 |
| 5 | 检测器/守卫/禁止读矩阵未实测 | UNVERIFIED | Phase 0 |
| 6 | ACL/Codex 读、三副本隔离未实测 | UNVERIFIED | Phase 0 |
| 7 | 插件写 dist 频次、A/B 加载 | UNVERIFIED | Phase 0/3 |
| 8 | 旁清单/trust/依赖清单未生成 | UNVERIFIED | Phase 0/3 |
| 9 | 真实 panel 全文未直采 | UNVERIFIED | Phase 4/5 |
| 10 | 最终提升树/bundle 未构建 | UNVERIFIED | Phase 6/P |
| 11 | D1/D2/D5/D7/D8/D9/D11/D13/D16 待批 | 待批准 | 各阶段 |
| 12 | 第二归档位置、W2-B 执行者/授权 | 待用户 | Phase 0/P |
| 13 | L1 连接超时根因 | UNKNOWN | 下一次 L1 前 |
| 14 | 22:48 元数据事件来源 | UNKNOWN | 日志导出；不归因 |

---

## 九、声明

本轮只补 Phase 0 启动条件，只修改/新建方案文档。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有修改独立审查评级（维持 0 CLOSED / 23 PARTIAL / 2 OPEN）。

**停止，等待 Codex 独立复核与用户批准。**
