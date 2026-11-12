
---

## 九、性能、完成判据与 deadline 分类（N03，R09、R16、R18）

### 9.1 三个时间阶段

| 阶段 | 定义 | 记录 |
|---|---|---|
| 采集期 | 页面导航 → 目标 `commitCompleted` | 导航时刻、目标请求序号、提交时刻、长任务、CPU 采样 |
| 渲染观察期 | 提交时刻 → 目标 DOM 呈现完成（或窗口截止） | MutationObserver 记录的新增卡片与完成时刻 |
| 事后核验期 | 渲染观察期结束后 | 导出完整结果、Node 复算、DOM 复核、分类 |

**禁止：** 用事后两次稳定读取倒推“未记录的精确渲染时刻”；`resultUsable` 是事后核验状态，不是窗口终点。

### 9.2 目标与 DOM 呈现的身份关联

全局卡片数量相等不能证明目标已渲染。V3 用**测试侧 DOM 增量**关联：

1. 目标提交前，测试脚本在面板 DOM 上安装 `MutationObserver`，并记录当前卡片签名多重集合。
2. 卡片签名定义为：`函数名 | 置信度 | 调用位置数 | 第一个调用文本`。目标参考值由 Node 对同一源码、同一 `scriptId`、同一 URL 调用 `discoverDecoders` 得到，签名多重集合可独立计算。
3. 提交后，观察新增卡片；当新增卡片签名多重集合**等于**目标参考签名多重集合时，记 `renderCompletedAt`（观察器时间戳）。
4. 若直到截止时刻仍不相等，判渲染未完成；不得用“总数相同”或“两次读数稳定”替代。
5. 观察器只在测试环境注入，不进入产品 `dist`，不新增 D10 字段，不修改生产钩子。

**限制：** 如果两个脚本产生完全相同的签名，多重集合仍用计数区分；如果观察器在提交前未安装成功，本次运行判 `setup-failed`，不能补测后冒充。

### 9.3 完成状态

| 状态 | 判定 |
|---|---|
| `workerCompleted` | 目标尝试的有效回复到达，且 `requestId`/`attemptId`/回显匹配 |
| `commitCompleted` | 目标逻辑请求提交成功；D10 记录 `state=committed`、`committedCandidates` |
| `renderCompleted` | §9.2 的 DOM 增量等于目标签名多重集合 |
| `resultUsable` | 以上三者 + 提交后再次读取 D10，目标 `requestSeq` 与 `committedCandidates` 未变 |

`resultUsable` 是事后核验的结论；窗口终点是 `renderCompletedAt` 或截止时刻。

### 9.4 四种耗时

| 指标 | 定义 | 用途 |
|---|---|---|
| `attemptElapsed` | 单次尝试：派发 → 回复/崩溃/看门狗 | 单次尝试质量 |
| `cumulativeExecutionMs` | 同一逻辑请求所有尝试的 `attemptElapsed` 之和 | **D4 50% 的分子** |
| `schedulingWaitMs` | 受理 → 首次派发 + `retry-pending` 等待时间 | 排队/重试等待，不计入执行 |
| `endToEndUsableMs` | 导航 → `renderCompletedAt`（另记“受理 → 渲染”） | 用户可见时延 |

**D4 50% 的分子固定为 `cumulativeExecutionMs`。** 首次超时、第二次很快成功的请求，必须把两次尝试都计入；不得只取第二次。

### 9.5 50% 验收

- 对每个合法完成的逻辑请求：`cumulativeExecutionMs < 0.5 × threshold(source)`。
- 任一不满足：该阶段性能验收不通过；不得改阈值、不得删任务、不得把该任务标为故障注入。
- 故障注入、取消、拒绝任务不参与 50% 统计，但必须逐条列出。
- 示例（公式算例，不是实测）：512064 字节阈值 632064 ms，50% 为 316032 ms。

### 9.6 截止时刻的状态分类（穷尽、互斥）

| 截止时 `currentState` | 目标层结果 | 运行层结论候选 |
|---|---|---|
| `committed` 且 `resultUsable` | `target-completed` | `completed` 或 `partial` |
| `deferred` | `target-not-started` | `queue-wait-timeout` |
| `retry-pending` | `target-retry-waiting` | `retry-wait-timeout` |
| `executing` | `target-executing` | `window-deadline-during-execution` |
| `analysis-succeeded`（未提交） | `target-awaiting-commit` | `commit-pending-timeout` |
| `analysis-failed` | `target-analysis-failed` | `target-failed` |
| `commit-rejected` | `target-commit-rejected` | `target-failed` |
| `failed` | `target-infrastructure-failed` | `infrastructure-failed` |
| `rejected` | `target-rejected` | `setup-failed` 或 `rejected-at-admission` |
| `cancelled` | `target-cancelled` | `cancelled` |

**运行层优先级（互斥）：**

1. `setup-failed`：目标缺失、不唯一、源码/URL 哈希不符、观察器未安装。
2. `cancelled`：用户取消或纪元变化。
3. `infrastructure-failed`：Worker 不可用、熔断、崩溃/协议错误重试耗尽。
4. `execution-timeout`：看门狗触发且重试耗尽。
5. `retry-wait-timeout`：截止时仍在 retry-pending。
6. `queue-wait-timeout`：截止时仍在 deferred，从未开始。
7. `window-deadline-during-execution`：截止时 executing，看门狗未触发。
8. `commit-pending-timeout`：截止时 analysis-succeeded 未提交。
9. `target-failed`：解析失败或提交失败。
10. `partial`：目标完成，其他脚本未终态。
11. `completed`：目标完成且其他脚本全部终态。

`partial` 不得抢占任何失败结论；`target-missing` 只能在发现期限结束后定案。

### 9.7 `completed` 与 `partial` 的阶段出口

| 结论 | 条件 | 允许声明 |
|---|---|---|
| `completed` | 目标 `resultUsable`，且所有非故障注入脚本在截止前到达终态 | 全部任务性能通过 |
| `partial` | 目标 `resultUsable`，但仍有脚本非终态 | **只能声明目标脚本局部性能通过**；必须列出未完成脚本与原因；不得声明全部任务通过 |

- Phase 4 出口允许以 `partial` 通过“目标脚本局部性能”门槛；Phase 6 的完整性能验收必须取得 `completed`。
- 若 Phase 6 仍为 `partial`，最终报告只能写局部结论，不能写“性能验收通过”。

### 9.8 无污染测量

- 窗口内不对被检页做 `Runtime.evaluate`；活性用心跳脚本。
- 目标识别用 D10 钩子；DOM 用测试侧观察器。
- 长任务以面板内 `longtask` 为主，CDP 往返只作旁证。
- 修复前后使用相同启动参数、相同窗口规则；不同口径不相除，改善倍率记 `n/a`。
- D8 阈值测量前登记；D8 未批准则 Phase 4 不能关闭性能验收（可测量，不记通过）。

---

## 十、安全指标（N05，不得重定义）

### 10.1 原始口径（恢复项目既有定义）

| 指标 | 定义 |
|---|---|
| False Replacement (`FR`) | `frWrongValue + frOnIndeterminate + frNotInReference + frSourceMutation` |
| `R_pos` | `TP + frWrongValue + UN` |
| `R_neg` | `SR + frOnIndeterminate` |
| Precision | `TP / (TP + FR)`；`TP + FR = 0` 时 `n/a` |
| Recall | `TP / R_pos`；`R_pos = 0` 时 `n/a` |
| Safe Rejection Rate (`SRR`) | `SR / R_neg`；**按独立参考调用位置计算，不按验证组数量** |
| Source Integrity | 三处原始源码 SHA-256 一致 |
| Version Mismatch | 脚本哈希不一致；该 run 不做位置级比较 |

### 10.2 Source Integrity 的三处

1. 独立 `reference/` 归档的原始源码。
2. OB-Recover 运行时从 CDP `Debugger.getScriptSource` 捕获的源码。
3. 替换完成后再读的 `activeScript.source`。

**不得使用：** 格式化展示源码、还原结果 `recovered`、重新生成或归一化后的字符串。

引用项目既有定义：`docs/PHASE4.7-REAL-SITE-PLAN.md:18-23、43-48、320-353`；`test/helpers/real-site-compare.ts:139-187`。V3 只恢复口径，不改这些文件。

### 10.3 判定规则

- 任一 `false` → 不通过。
- 任一 `n/a` → `inconclusive`，不得自动通过。
- 零替换：Precision `n/a`，FR 必须 0；不能据此宣称阶段安全通过。
- `version-mismatch`：该 run 不进入位置级指标，不得比较位置。
- 分母为 0：显式 `n/a`，不写 0 或 100%。
- 旧构建或旧源码的结果不得用于新源码验收。

### 10.4 回归出口

Phase 6 必须逐条报告：FR、R_pos、R_neg、Precision、Recall、SRR、Source Integrity、Version Mismatch、Business Parity、五类互斥结果计数。没有数据的项写 `n/a` 并说明原因。

---

## 十一、构建、产物与构建戳（N07，R14、R15）

### 11.1 构建戳与旁清单的职责分离

| 对象 | 内容 |
|---|---|
| 构建戳（`dist` 内，位置待 D2） | **只记录输入文件哈希 + Vite 版本**；不含时间戳、不含自身哈希、不含绝对路径、不含产物哈希、不含 Worker 名 |
| 可信旁清单（`dist` 外） | Worker 名称、完整产物文件集合、每个实际产物的 SHA-256、Node/Vite/Rollup/TypeScript 版本、依赖核验信息、构建命令 |

第二轮指出的矛盾（“戳不含 Worker 名却要求与戳同名”）在 V3 消除：Worker 名与产物哈希只从旁清单读，不从构建戳读。

### 11.2 输入闭包

`src/**/*.ts`、`src/extension/**` 的 html/css/json/图标、`vite.config.ts`、`tsconfig.json`、`package.json`、`package-lock.json`、Worker 入口、别名、影响产物的环境变量。

**排除：** `dist/**`、`node_modules/**`、构建戳自身。路径用根相对路径。

### 11.3 产物验证五项（加强版）

1. 构建戳的输入哈希与当前源码逐文件一致。
2. 旁清单的 Worker 名与实际产物文件一致。
3. 旁清单的文件集合与实际 `dist` 文件集合**完全相等**（无缺失、无多余）。
4. 实际每个产物的 SHA-256 与旁清单逐文件相等。
5. `panel.js` 不含主线程 `discoverDecoders(`；四个入口齐全；Worker 格式与构造参数一致。

### 11.4 必测负例

- 同名文件内容被修改（保持文件名与大致形状）。
- 文件缺失。
- 多余文件。
- 旁清单被修改（改一个哈希或改文件集合）。
- 构建戳被修改（改输入哈希）。

任一负例未被发现，阶段三不通过。

### 11.5 依赖核验

- `package-lock.json` 只证明声明版本，不证明磁盘 `node_modules` 实际内容。
- 阶段零建立 `node_modules` 依赖清单（路径、大小、SHA-256）；阶段三把该清单与旁清单的依赖核验信息关联。
- 依赖清单变化时，阶段三必须重新核对并记录。

### 11.6 可复现构建

- 两个独立输出目录、同一输入构建两次：逐文件哈希相同、文件集合相同、构建戳相同。
- 两个不同绝对路径构建：产物相同；任何差异说明绝对路径进入产物。
- 扫描 `dist`：无绝对路径、盘符路径、`file://`、用户名路径。
- D1 未批准时，A/B 只做候选验证，不选定；A/B 各自独立构建、独立加载。

---

## 十二、完整取证与真实面板（N06，R17、R19）

### 12.1 共享协调器

- 把提交路径抽成 `decoder-analysis-coordinator`（无 DOM、无 `chrome.*`）。
- 产品面板与测试 harness **都调用同一个模块**；提交校验、按脚本替换、发现顺序重建、错误清理在同一模块内。
- 测试 harness 只替换“面板 sink”和“时钟/日志 sink”，不复制提交逻辑。

### 12.2 完整取证

1. 测试专用页面（构建到 `<run>\out\harness`，不进产品 `dist`）加载产品 `decoder-analysis-client`、产品 Worker 产物、共享 coordinator。
2. 用同一源码、同一 `scriptId`、同一 URL 发起分析。
3. 用类型保真编码器序列化 coordinator 实际提交的完整候选集合。
4. 通过本机回环 POST 落盘到 `<run>\evidence`，独占创建。
5. Node 读取全文，独立计算 `hashOrdered`/`hashSorted`；与参考比较。

### 12.3 与真实面板的关系

| 证明对象 | 方法 | 结论级别 |
|---|---|---|
| Worker/client 输出 | 独立 harness（client + Worker） | 独立证明 |
| coordinator 提交内容 | 同一 coordinator 模块 + harness sink | `CONFIRMED-BY-SHARED-CODE`（代码同一，不是面板实例直采） |
| 真实面板实例提交 | D10 九字段 + DOM 增量身份 | 面板提交的元数据与呈现已证明；完整字段内容仍为 `UNVERIFIED`，除非另有直采 |

- 如果无法证明面板实例与 harness 使用同一 coordinator、同一输入、同一转换，**必须分开报告两个已验证范围**，不得用计数一致冒充完整内容一致。
- 不增加生产钩子字段；不开放生产完整内容导出。
- 若未来需要新增产品出口，必须另行批准，不能由本方案默认。

### 12.4 四方一致性（R19）

- 四方：Node 主线程、Node 线程/进程加载真实 Worker 入口、Chrome 主线程、Chrome 产品客户端驱动 `dist` Worker。
- 类型保真编码：区分 `undefined` 与缺失、`-0`、`NaN`、`±Infinity`、孤立代理项；不可序列化值显式报错。
- 每方计算 `hashOrdered` 与 `hashSorted`；四方各自的 `hashOrdered` 相等、各自的 `hashSorted` 相等。
- **不要求** `hashOrdered === hashSorted`；同一输出两种编码不同只说明字段顺序，不是跨环境差异。
- 完整深比较定位首个差异；失败不得用投影/删字段掩盖。
- 子进程替代 Node 线程时必须标注“降级覆盖”，不能称四方原定义通过。

---

## 十三、历史证据与“未变化”（R20、R21、R22、R24）

### 13.1 写入边界

| 对象 | 规则 |
|---|---|
| 原项目 | Phase 0 至 Phase 6 只读；不改源码、配置、测试、`dist`、证据、ACL、属性 |
| 工作副本历史证据 | 与基线逐字节相同；每批命令核对目录摘要与逐文件 USN；不得新增/删除/改写 |
| 新证据 | 只写 `<run>\evidence`；独占创建；哈希链索引；已存在即拒绝 |

**参考/观测隔离：** `reference/` 只由独立来源写，`observed/` 只由 OB-Recover 运行写；不合并、不互相覆盖；替换输出不得写回 `reference/`。

### 13.2 三个实验副本

- 同一哈希核验快照派生；目录 `<run>\exp\pristine-<id>`、`<run>\exp\no-plugin-<id>`、`<run>\sandbox`；物理隔离、不共享可写目录。
- 原样与无插件副本不混用；中和副本不带回原样副本。
- 每个副本记录来源快照哈希、派生时间、目录、文件数、整树摘要。

### 13.3 预期拒写与意外写入

- 预期拒写：仅限登记探针；记录探针编号、对象、预期、实际、时间、主体、命令 ID；未达预期按失败。
- 意外写入：其他任何写入尝试或文件变化；立即停止、保留现场、报告 `unexpected-write`；不清理、不重跑覆盖。
- **GU-5 的“拒绝数为 0”只约束正式运行**，不约束登记探针；预期拒写与正式违规分开统计。

### 13.4 `persistRun` 与 D11（待批）

- D11 获批：默认只校验；外置输出目录；预检全部目标；保护 reference/observed/compare/meta/summary；断言不减少。
- D11 未批：不改测试；实验副本证据目录设为测试进程不可写；任何写入尝试立即失败并保留现场；作为检测手段。
- 两种方式都必须先预检写入目标，避免半写入。

### 13.5 路径中和与工具边界（R22）

- 48 个脚本中 47 个含项目根字面量、40 个含固定 profile 删除；`CONFIRMED`（源码文本核对）。
- 中和只改代码文件；残留检查为 0；中和前后 `tsc`/Vitest 逐用例一致。
- 工具边界：启动器白名单、真实路径判定、专用 TEMP/TMP/cache/profile、非 Node 子进程约束、禁用清单与入口哈希。
- **仅换 cwd 不成立**；D16 未批时旧脚本只中和、不运行。

### 13.6 未变化证明

- 字段：路径集合、大小、内容 SHA-256（两套实现）、修改/创建时间、属性、文件 ID、链接数、USN、ChangeTime、SDDL 哈希。
- ADS：逐流名称 + **内容哈希**；无法读取的流标 `ADS-UNVERIFIED`，同步缩小最终声明。
- 判定：`unchanged` / `changed` / `cannot-determine`。
- 无法解释的变化：`source-unknown`，停止；不得从“设计不访问”推断外部主体。
- 阳性对照：内容变化、增删、改名、仅大小写、同内容重写、时间/属性/ACL 变化、删除重建、空目录、ADS、硬链接。
- 分范围结论：源码、完整 `dist`、历史证据分别出摘要，不用一个总哈希代替。

---

## 十四、最终提升树（N08，R23）

### 14.1 映射记录

每条映射记录：`file`、`start`、`end`、`oldToken`、`newToken`、`occurrenceIndex`、映射前的上下文哈希、映射后的上下文哈希。

- 逆映射只在记录的位置执行，不做全局无差别替换。
- 记录“映射位置”与“编辑后位置”的关联：编辑导致的偏移通过编辑映射表更新；每个位置在逆映射前用上下文哈希复核。

### 14.2 双向校验

1. 正向：基线 → 中和 → 工作副本；记录每步哈希与位置。
2. 反向：工作副本 → 逆映射 → 提升候选树。
3. 对每个映射位置：反向后的原文必须与基线对应位置逐字节相同；上下文哈希相同。
4. 对每个未映射区域：提升候选树与工作副本逐字节相同。
5. 碰撞检查：旧前缀、新前缀、其他被替换前缀两两检测；新出现的相同前缀不得被误逆映射。

### 14.3 最终树与产物

- 最终源码树：`<run>\out\promotion\<id>\tree`；由逆映射后的文件组成。
- 最终构建：在外部副本对最终树重新构建一次；记录构建戳、产物集合与逐文件 SHA-256。
- **权威产物是最终树构建的产物**，不是中和树的产物。
- 允许差异：只有登记的逆映射差异；其余文件逐字节相同。
- 如果逆映射改变了构建输入，构建戳必须相应变化；不得要求“戳相同”。
- 最终提升树未通过双向校验与最终构建验证，不得执行 Gate P。

### 14.4 提升清单

逐文件：动作、提升前哈希、提升后哈希、出处阶段、是否映射文件。清单不含现有历史证据、旧报告、`registry.json`、`budget-ledger.json`、`node_modules`。

---

## 十五、执行身份与 W2（R25）

| 角色 | 身份 | 可写 | 不可写 |
|---|---|---|---|
| 实施执行 | `WENX\Administrator` | `<run>\sandbox`、`out`、`evidence`、`profiles`、`tmp`、`controls`、`gitdir` | 原项目、`baseline`（写完只读）、Codex 的 W2 根 |
| Codex 只读审查 | 沙箱账户 | 无 | 全部 |
| 构建/测试子进程 | 继承实施身份 | 由启动器与守卫限制 | 同上 |
| 提升执行 | 授权管理员 | 原项目批准清单 | 其余 |

**W2 模式：**

- W2-A：Codex 只读审查代码、证据、哈希；没有独立运行结果。
- W2-B：用户单独授权的执行者，在自己的 `D:\P47RUN\w2-<id>` 根运行；不增加 Codex 写权限。
- 必须明确哪个阶段要求独立实跑、由谁完成；默认只读审查不能替代此前要求的独立重放。
- 不扩权、不复用 V0 TEMP 例外。
