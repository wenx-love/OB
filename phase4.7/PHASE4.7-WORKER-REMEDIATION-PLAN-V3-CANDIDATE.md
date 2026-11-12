# OB-Recover Phase 4.7 Worker 整改方案 V3（正式候选）

> **文档性质：** 以 V2 正式候选为基础、按 Codex 第二轮独立审查（`ac416be0…`）修订的 V3 正式候选。V2、V1、原始方案、两轮审查报告和全部历史证据一律保留，不覆盖、不改写。
>
> **本轮边界：** 只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0。
>
> **输入校验（均 MATCH）：**
>
> - `PHASE4.7-WORKER-REMEDIATION-PLAN-V2-CANDIDATE.md`：75609 字节，`c97f1374d64e173357ed554ddabf8d4e8cf0c6dcd2d1099c693718112b484796`
> - `PHASE4.7-V2-CODEX-FINDINGS-TRACEABILITY.md`：17312 字节，`73c83c179145d53c8d0e44a8b52e96140cf82f91a68d91ef9d66fcee1e5b7083`
> - `CODEX-P47-V2-SECOND-INDEPENDENT-REVIEW-20261111T143740451.md`：29702 字节，`ac416be0749ab6fbdca54b924c90e7f97fe7385d6dfb09fe957519a2434194bb`
>
> **证据标签：** `CONFIRMED` = 有正文、源码或条款对照的直接支持；`SUSPECTED` = 有线索但因果未证实；`UNVERIFIED` = 尚未取得实测；`UNKNOWN` = 根因不明。本文所有“将/必须/应”都是执行要求，不是已发生的结果。

---

## 一、版本关系与修订目标

### 1.1 与旧版的关系

| 文件 | 处置 |
|---|---|
| `PHASE4.7-WORKER-REMEDIATION-PLAN.original-recovered.md` | 保留，不改 |
| `PHASE4.7-WORKER-REMEDIATION-PLAN.rebuilt.md` | 保留，不改；不再作为执行依据 |
| `CODEX-P47-REBUILT-INDEPENDENT-REVIEW-20261111T141301779.md` | 保留，不改 |
| `PHASE4.7-WORKER-REMEDIATION-PLAN-V2-CANDIDATE.md` | 保留，不改；作为 V3 的修订基础 |
| `PHASE4.7-V2-CODEX-FINDINGS-TRACEABILITY.md` | 保留，不改；V3 用新追溯表替代其索引作用 |
| `CODEX-P47-V2-SECOND-INDEPENDENT-REVIEW-20261111T143740451.md` | 保留，不改；本轮唯一状态修订依据 |
| `SELFCHECK-RESULT.md`、`MANIFEST-*.tsv`、`meta-scan-*.tsv` 等 | 保留，不改 |
| 本文件、V3 追溯表、V3 自检 | 新建；V3 生效后作为下一轮审查对象 |

### 1.2 本轮只做五件事

1. 补齐 Codex 第二轮 E1—E6 的 Phase 0 书面准入契约。
2. 按 N01—N09 修复状态机、统计、性能判据、源码身份、安全指标、取证、产物验证、提升树和阶段循环。
3. 按第二轮 B 节修正 R01—R25 状态（**4 CLOSED / 19 PARTIAL / 2 OPEN**），不伪造关闭。
4. 保持 D3/D4/D10/D12/D14/D15 与既有安全边界不变；D1/D2/D5/D7/D8/D9/D11/D13/D16 继续待批。
5. 给出一份可交给第三轮独立审查的完整正文、追溯表和自检。

**不做的事：** 不重新设计解码器识别、`verified`、`outer-state-write`、`status-unstable`、`throwOnSideEffect`、dry-run 与替换安全门槛；不扩大产品范围；不提前实施任何阶段代码。

---

## 二、第二轮审查结论与 V3 响应

### 2.1 总体结论

第二轮结论是 **APPROVED WITH CONDITIONS**：补齐 E 节六项 Phase 0 执行契约后，可以申请启动“仅限基线冻结、隔离准备和工具自测”的 Phase 0。V3 接受这一结论，不把“有条件准入”写成“已批准实施”。

同时，V2 追溯表“17 CLOSED / 0 OPEN”被第二轮否定。V3 按第二轮基准改为：

| 状态 | 数量 | 编号 |
|---|---|---|
| CLOSED | 4 | R07、R12、R20、R24 |
| PARTIAL | 19 | R01、R02、R03、R04、R05、R06、R08、R09、R10、R11、R14、R15、R17、R18、R19、R21、R22、R23、R25 |
| OPEN | 2 | R13、R16 |

**这些状态只表示方案层审查结论，不代表代码实现或动态实验通过。**

### 2.2 第二轮主要问题与 V3 对应

| 第二轮问题 | V3 位置 |
|---|---|
| N01 失败矩阵/状态表不能唯一决定下一步 | §5 事件 × 逻辑状态 × 尝试状态表 |
| N02 当前状态与历史累计混用 | §6 gauges 与 counters 分离、守恒式 |
| N03 计时与完成判据可假通过 | §9 三阶段、DOM 目标身份、四种耗时、deadline 分类 |
| N04 UTF-8 字节计量不能替代 JS 字符串身份 | §7 UTF-16 无损身份、active 去重、force |
| N05 安全指标被缩写重定义 | §10 恢复三处 Source Integrity 与按位置的 SRR |
| N06 harness 不能证明真实 panel 提交 | §12 共享 coordinator、双范围报告 |
| N07 产物验证缺实际字节校验 | §11 可信旁清单、逐文件 SHA-256、四类负例 |
| N08 提升树往返与产物相等范围 | §14 双向映射、编辑位置关联、最终树权威产物 |
| N09 阶段准入自指 | §16 进入=规则/范围/接口/决策批准，实现=阶段内，出口=验证 |
| E1—E6 Phase 0 条件 | §4 逐项落实 |

### 2.3 对第二轮指出的事实性更正的采纳

- 构造失败与“连续三次失败熔断”不再同时作为同一规则；见 §5.5。
- `ignored-stale` 改为事件处理结果，不是尝试状态；见 §5.2。
- 取消必须结算 `retry-pending` 逻辑请求；见 §5.4。
- 成功回复先由客户端校验传输信封，再写缓存；面板只负责页面/最新请求校验；见 §5.6。
- 当前状态（gauges）与历史累计（counters）分离；见 §6。
- 全局卡片数量稳定不能证明目标已渲染；见 §9.3。
- 独立 harness 不能直接证明真实 panel 提交内容；见 §12.3。
- 构建戳不含 Worker 名，Worker 名与逐文件哈希从可信旁清单读；见 §11。
- 最终提升树必须双向映射并明确“允许差异”；见 §14。
- D4 的 50% 分子固定为逻辑请求的累计执行时间；见 §9.5。
- 安全指标恢复项目既有口径；见 §10。

---

## 三、已批准决策（不得重开）

### 3.1 D3：有界延后队列

**取值：** deferred 最多 **256 条**；deferred 源码累计最多 **64 MB**；**≤64 KB** 脚本优先；第四态 `deferred`；只持脚本对象引用；显式取消与纪元结算；禁止静默丢弃。

**V3 的登记口径（技术澄清，不改变取值）：**

| 项 | 登记值 |
|---|---|
| 256 条 | deferred 集合中的逻辑请求数 ≤256；执行槽位固定 1，不另设无界队列 |
| 64 MB | **64 × 1024 × 1024 = 67,108,864 字节**（二进制口径，登记在此，后续不得混用十进制） |
| 64 KB | **64 × 1024 = 65,536 字节**（二进制口径） |
| 字节计量 | 源码字符串按 **UTF-8 编码后的字节数**；与 D4 同一口径 |
| 单条超预算 | 单份源码 >64 MB：`rejected('source-too-large')`，不缓存，不静默丢弃 |
| 容量用尽 | 新增会超过 256 或 64 MB：`rejected('deferred-full')`，面板显示当前条数与字节，不缓存 |
| 进入/补投 | 受理后执行槽位被占则进入 deferred；槽位结算后按 §6.2 补投 |
| 小脚本优先 | deferred 内分小脚本 FIFO（≤64 KB）与大脚本 FIFO；先清空小脚本队列，再取大脚本 |
| 发现顺序 | 同一优先级内按逻辑请求序号；展示顺序始终按发现顺序，与调度顺序分离 |
| 饥饿 | **不增加反饥饿调度**；只记录 `overtakenBySmall` 与最大等待；改变优先级须另行决定 |
| 取消/纪元 | 逐项显式结算为 `cancelled`，清空引用与等待者；不触发新补投 |
| 统计 | rejected、deferred、executing、committed 分别统计；另有 history counters，见 §6 |

**禁止：** “取消上限”备选；把 deferred 计为已分析；静默丢弃；复制源码；擅自加入 aging 或公平调度。

### 3.2 D4：看门狗与性能判据分离

**固定公式：** `clamp(120s + 1.0ms × UTF-8 字节数, 5min, 45min)`。

| 项 | 登记 |
|---|---|
| 毫秒形式 | `clamp(120000 + 1.0 × bytes, 300000, 2700000)` 毫秒 |
| 示例（公式算例，不是实测） | 512064 字节 → 632064 ms；50% = 316032 ms |
| 登记时点 | 每个输入在测量前登记；测量后不得调整 |
| 计时起点 | 尝试派发到 Worker（`postMessage` 返回后） |
| 计时终点 | 该尝试的回复、崩溃、看门狗触发 |
| 触发动作 | terminate 当前 Worker → 创建新 Worker → 自动重试 1 次 |
| 第二次失败 | `watchdog-timeout-retry-exhausted`，不缓存，不无限重试 |
| 50% 验收 | 合法完成的逻辑请求，其**累计执行时间**必须 < 阈值 50%；分子定义见 §9.5 |
| 禁止 | 实测最大值 ×6；30 分钟下限；把排队等待算入执行时间；用重试后单次快速成功掩盖首败 |

### 3.3 D10：只读面板测试钩子

**取值：** 仅 `?obTest=1` 启用；只返回九个已批准元数据字段；不返回源码、候选内容、调用位置；键集合白名单与结构测试。

**九个字段：** `scriptId`、URL 哈希前缀、状态枚举、错误码、请求序号、已提交候选数、入队时间戳、开始时间戳、结算时间戳。

**V3 的技术边界：**

- 查询解析严格：`obTest` 必须恰好出现一次且值严格等于 `1`；重复参数、多个值、`obTest=01`、`obTest=true` 一律不挂载。
- 返回形态：**逐脚本记录数组**；每条只含上述九个字段；不提供 `epoch`、全局 counts、快照时间等额外字段；测试需要的计数由记录数组自行推导。
- 对象冻结；只读方法返回深拷贝；无 setter、无写方法。
- **完整内容取证不通过生产钩子。** 见 §12：测试专用入口复用真实 coordinator 提交路径；生产面板不开放完整内容导出。

### 3.4 D12：工作副本与一次性提升

**取值：** 工作副本实施；原项目只在 Gate P 发生预先批准的变化；提升前路径逆映射、碰撞检查、逐字节校验；验证最终候选树与构建产物一致；`dist` 不含工作副本绝对路径；构建戳只记录输入哈希与 Vite 版本。

**V3 补充：** 逆映射采用“记录位置”的定向映射，不做全局无差别替换；最终树重新构建，提升使用最终树生成的戳与产物；不得中途分批提升。

### 3.5 D14：运行根与权限

**取值：** 正式根 `D:\P47RUN\<run>`；不得把 TEMP 当正式运行根；Administrator 与 SYSTEM 完全控制；Codex 沙箱组只读；关闭继承；设置后读回 ACL；Codex 实际验证可读不可写；读不到不得扩权，采用“位置不可信 + 每次核对公布哈希”；独立归档一份。

**V3 补充：**

- 授权对象显式写 `WENX\Administrator` 与 `NT AUTHORITY\SYSTEM`，不把 `BUILTIN\Administrators` 作为唯一授权（非提权令牌可能被 UAC 过滤，本机未逐项验证）。
- ACL 读回记录 SDDL 与逐条 ACE；Codex 用专用 `acl-probe` 目录做“读成功、写拒绝”测试，不截断已冻结文件。
- 第二归档位置由用户指定；未指定不得关闭 Phase 0。
- 创建运行根属于 Phase 0 内部初始化，不是 Phase 0 批准前的前置。

### 3.6 D15：静默窗口

**取值：** 每阶段记录静默窗口起止；用户与 Codex 在执行期间不写原项目与运行根；尽早导出管理员变更日志；不得把无法确定来源的变化归因于某个具体主体。

**V3 补充：**

- 每阶段入口/出口记录：时间、进程快照、ACL 快照、D 盘与 C 盘 USN 位置。
- 只有用户书面同意的操作才是例外；W2-B 在独立根内的写入需单独授权，不属于默认例外。
- 未归因变化标 `source-unknown`，停止并保留现场；不自行还原。
- 日志导出是取证，不授权任何写入。

### 3.7 D6 的边界

D6 按既有 M6 必修：后台异步回调的身份/纪元守卫 + 面板接收检查 + 确定性测试。**不得**扩展到修改 `capture-engine` 的捕获时机、捕获规则，或修改 `verified`/拒绝规则。D6 的真实浏览器发生频率为 `UNVERIFIED`。

---

## 四、Phase 0 执行契约（E1—E6）

Phase 0 只做：基线冻结、运行环境隔离、ACL 验证、工具自测、实验副本准备、插件对照、证据归档。**禁止**在 Phase 0 提前实施 Phase 1—6 的代码整改。

### 4.1 E1：初始化顺序（消除循环）

固定顺序：

1. 用户批准 Phase 0 的范围（仅基线/隔离/工具自测），并授权管理员执行初始化。
2. 授权管理员以已批准身份执行运行根初始化。
3. 创建 `D:\P47RUN\<run>`。
4. 创建专用探针目录与三个实验目录（原样、无插件、中和）。
5. 设置 ACL：`WENX\Administrator` 完全控制、`SYSTEM` 完全控制、`WENX\CodexSandboxUsers` 读取与执行、关闭继承、移除其他继承项。
6. 读取并验证 ACL：SDDL、逐条 ACE、继承标志；与期望逐条比对。
7. 执行 Codex 只读验证：读取哨兵成功；在 `acl-probe` 创建哨兵被拒绝。
8. 执行工具自测：假目录树阳性/阴性对照、守卫覆盖矩阵、检测器自测。
9. 执行隔离实验：原样 `tsc`/Vitest、无插件对照、路径中和前后等价性；全部在副本中。
10. 根据结果决定是否申请进入下一阶段。按既定路线，下一阶段是 **Phase 3**；若用户或 Codex 要求先看 Phase 0 审查包，则先停止等待审查。

**关键：** 第 3—7 步是 Phase 0 内部工作，不得要求它们在 Phase 0 批准前完成；也不得因为尚未创建运行根而拒绝批准 Phase 0。

### 4.2 E2：执行边界与三个实验副本

| 要求 | V3 规定 |
|---|---|
| 同一来源 | 三个副本必须从**同一份经哈希核验的快照**派生；快照的 SHA-256 在派生时公布 |
| 物理隔离 | `<run>\exp\pristine-<id>`、`<run>\exp\no-plugin-<id>`、`<run>\sandbox` 三个独立目录；不共享可写目录 |
| 只操作副本 | 原样测试、无插件对照、中和实验全部只在副本执行；原项目不运行任何测试/构建 |
| 不直接跑原项目 | 不允许用原项目取得基线；基线来自快照副本 |
| 记录派生 | 每个副本记录：来源快照哈希、派生时间、目录、文件数、整树摘要、派生命令 |
| 变异隔离 | 无插件副本不得把结果带回原样副本；中和副本不得把路径中和结果带回原样副本 |

### 4.3 E3：预期拒写与意外写入

**预期拒写（仅限控制实验）：**

- 仅限事先登记、编号、由 `acl-probe` 或守卫探针主动触发的拒写。
- 每次记录：探针编号、操作对象、预期结果、实际结果、时间、执行主体、命令 ID、退出码。
- 预期拒写不触发“停止阶段”，但必须全部记录；未达到预期（例如本该拒绝却成功）按失败处理。

**意外写入（其余一切）：**

- 除登记探针外的任何写入尝试或实际文件变化，包括修改时间、ACL、ADS、目录项变化。
- 立即停止当前阶段；保存现场、日志、哈希、时间戳；报告 `unexpected-write`。
- 不清理、不重跑覆盖、不关闭守卫、不换目录绕过、不提权。
- **不得因为工具自测需要而放宽历史证据保护规则。** 自测需要写入时，只写专用探针目录或实验副本，不碰原项目与历史证据。

### 4.4 E4：守卫覆盖矩阵

| # | 覆盖范围 | 自测方法 | 预期行为 | 结果记录 | 失败停止条件 |
|---|---|---|---|---|---|
| 1 | 普通文件读写 API（`open/write/append/rename/unlink/mkdir/rmdir/truncate/chmod/utimes` 等） | 在假目录树逐 API 触发；目标分别位于允许区与禁止区 | 允许区成功；禁止区明确拒绝并记日志 | 可写页 `guard-matrix-1.json`，逐 API 记录 | 任一禁止区写入成功，或拒绝无日志 |
| 2 | 已打开 FD / `FileHandle` | 先 `open` 取得句柄，再 `write`/`truncate`/`close`；句柄在打开后目录被改名 | 句柄写入仍按真实目标判定；改名后不绕过 | 同上，记录句柄生命周期 | 句柄写入绕过判定 |
| 3 | 复制源与复制目标 | `copyFile`/`cp`：源在允许区、目标在禁止区；反向再测 | 读源允许；写目标按目标路径判定 | 逐调用记录源/目标判定 | 目标在禁止区仍写入成功 |
| 4 | 符号链接、硬链接、路径别名 | 在允许区创建指向禁止区的链接；`realpath`、`\\?\`、8.3 短名、`subst` 映射 | 解析真实路径后拒绝；不能靠别名绕过 | 记录别名、真实路径、判定 | 任一别名写入禁止区成功 |
| 5 | 原生子进程 | 启动 `esbuild`/`cmd`/`git`/`chrome`，尝试写禁止区 | 守卫不拦截原生进程，必须由启动器/OS 边界阻止；记录为“守卫不覆盖” | 记录进程、命令行、结果 | 原生进程写入禁止区成功且无其他边界阻止 |
| 6 | 环境变量与子进程继承 | 设置 `NODE_OPTIONS`、`TEMP/TMP`、`cwd`，观察子进程是否继承守卫与允许根 | 继承守卫与专用临时目录；外部注入不得覆盖 | 记录环境快照与子进程实际值 | 子进程未继承守卫或使用了公用 TEMP |
| 7 | 工作进程与其他执行路径 | Vitest 工作进程、`worker_threads`、`child_process`、`fork` | 守卫在 Node 工作进程生效；原生/线程旁路必须显式记录为不覆盖 | 记录每个执行路径的守卫标记与探针结果 | 工作进程未生效且未登记偏差 |

**总规则：** 不允许用“全局守卫标记存在”代替实际覆盖证明。矩阵未通过，不得进入正式全量实验。

### 4.5 E5：基线证据与第二归档

| 项 | 规定 |
|---|---|
| 基线证据保存 | `<run>\baseline` 写入后只读；逐文件哈希、整树摘要、生成时间、生成命令；原始清单与归档各一份 |
| 第二归档责任人 | 由用户指定；V3 不预设 |
| 第二归档位置 | 由用户指定；不得擅自选择 |
| 关闭条件 | 未提供第二归档位置，Phase 0 不得关闭 |
| 归档校验 | 第二归档与第一归档逐文件哈希一致；不一致即失败 |
| 保留 | 失败记录、实验副本、日志全部保留；不清理 |

### 4.6 E6：原项目只读

禁止：

- 原地测试、原地构建、原地运行 Vitest、原地执行 `tsc`。
- 因工具失败而尝试提权、关闭守卫、换目录绕过权限限制。
- 自动还原无法归因的文件变化。

任何无法确定来源的变化：标记 `source-unknown`，保留现场并停止。原项目的 ACL 本身在 Gate P 前不修改；只在基线中记录，并通过静默窗口约定不使用。

---

## 五、状态机与结算责任（N01，R01—R04、R10）

### 5.1 状态定义

**逻辑请求状态（客户端）：**

| 状态 | 含义 | 未结算 Promise | 允许的下一状态 |
|---|---|---|---|
| `deferred` | 已受理，等待执行槽位 | 是 | `executing`、`cancelled`、`failed` |
| `executing` | 某次尝试在飞行 | 是 | `retry-pending`、`analysis-succeeded`、`analysis-failed`、`failed`、`cancelled` |
| `retry-pending` | 首次失败、等待第二次派发 | 是 | `executing`、`failed`、`cancelled` |
| `analysis-succeeded` | Worker 成功，等待面板提交 | 是（面板提交前） | `committed`、`commit-rejected`、`cancelled` |
| `analysis-failed` | Worker 返回解析失败 | 否 | 终态（刷新/新源码可重试） |
| `commit-rejected` | 提交校验失败 | 否 | 终态（刷新/新源码可重试） |
| `committed` | 提交成功 | 否 | 终态（刷新/新源码可重试） |
| `failed` | 基础设施/最终失败 | 否 | 终态（刷新可重试） |
| `rejected` | 未受理 | 否 | 终态（刷新可重试） |
| `cancelled` | 取消/纪元结算 | 否 | 终态（刷新可重试） |

**尝试状态（仅派发后存在）：**

| 状态 | 含义 |
|---|---|
| `dispatched` | 已 `postMessage`，看门狗计时中 |
| `replied-success` | 收到匹配的成功回复 |
| `replied-error` | 收到匹配的业务错误回复 |
| `protocol-error` | 回复到达但传输信封校验失败 |
| `timed-out` | 看门狗触发 |
| `crashed` | `onerror`/`messageerror` |
| `post-failed` | `postMessage` 抛错 |
| `cancelled` | 被取消协议结算 |

**事件处理结果（不是状态）：** `applied`、`ignored-stale-generation`、`ignored-unknown-attempt`、`ignored-after-terminal`。`ignored-stale` 不得写入尝试状态。

### 5.2 事件 × 逻辑状态 × 尝试状态

| 事件 | 逻辑前态 | 尝试前态 | 结算责任 | 尝试后态 | 逻辑后态 | 缓存 | 重试 | 计数/备注 |
|---|---|---|---|---|---|---|---|---|
| 受理成功 | — | 无 | `admit` | 无 | `deferred` | 否 | — | `deferredGauge++` |
| 受理拒绝（容量/超预算/关闭） | — | 无 | `admit` | 无 | `rejected` | 否 | — | `rejectedRequests++` |
| 构造 Worker 失败 | `deferred` 或 `retry-pending` | 无（`attemptId=null`） | `preAttemptFailure` | 无 | `failed(worker-unavailable)` | 否 | 否 | `workerFailures++`；达到 3 次则熔断 |
| 派发成功 | `deferred`/`retry-pending` | 无 | `dispatch` | `dispatched` | `executing` | 否 | — | 看门狗开始 |
| `postMessage` 抛错 | `executing` | `dispatched` | `settleAttempt` | `post-failed` | 首次→`retry-pending`；二次→`failed` | 否 | 首次是 | `workerFailures++`；达 3 次熔断 |
| 成功回复（信封有效） | `executing` | `dispatched` | 客户端先校验，再 `settleAttempt` + `settleLogical` | `replied-success` | `analysis-succeeded` | 是（按请求序号） | 否 | `workerFailures=0`；`cacheHits/Misses` 另计 |
| 成功回复（信封无效） | `executing` | `dispatched` | `settleAttempt` | `protocol-error` | 首次→`retry-pending`；二次→`failed` | 否 | 首次是 | `workerFailures++`；退役 Worker |
| 业务错误回复 | `executing` | `dispatched` | `settleAttempt` + `settleLogical` | `replied-error` | `analysis-failed` | 是（确定性） | 否 | `analysisParseFailures++` |
| 看门狗触发 | `executing` | `dispatched` | `settleAttempt` | `timed-out` | 首次→`retry-pending`；二次→`failed(watchdog-timeout-retry-exhausted)` | 否 | 首次是 | `watchdogTrips++`；不计入 workerFailures |
| `onerror`/`messageerror` | `executing` | `dispatched` | `settleAttempt` | `crashed` | 首次→`retry-pending`；二次→`failed(worker-crashed-retry-exhausted)` | 否 | 首次是 | `workerFailures++`；退役 Worker |
| `cancelAll` / 纪元变化 | 任意非终态 | 任意 | `cancelAll` | `cancelled`（若有尝试） | `cancelled` | 清空 | 否 | `cancelledRequests++`；禁调度 |
| `dispose` | 任意非终态 | 任意 | `dispose` | `cancelled` | `cancelled` | 清空 | 否 | `disposed=true`；永不重开 |
| 熔断打开 | 所有非终态 | 任意 | `openBreaker` | 当前尝试已先结算 | 全部 `failed(breaker-open)` | 否 | 否 | 等待者全部结算；无 pending |
| 提交成功 | `analysis-succeeded` | 无 | 面板 `commit` | — | `committed` | 否 | — | `committedGauge++` |
| 提交校验失败 | `analysis-succeeded` | 无 | 面板 `commit` | — | `commit-rejected` | 否 | — | `commitRejected++` |
| `force` 请求 | 任意 | 任意 | `admit` | 不改变旧尝试 | 新请求 `deferred` | 否 | — | 旧请求继续；新序号优先提交/写缓存 |
| 旧代次事件 | 任意 | 任意 | 事件分发 | 不变 | 不变 | 否 | — | `staleEvents++`，不得成为终态 |
| 成功回复/成功创建 Worker | — | — | — | — | — | — | — | **`workerFailures=0`** |

### 5.3 唯一结算责任

1. **先结算尝试，再结算逻辑请求。** `settleAttempt(attempt, outcome)` 幂等；`settleLogical(request, outcome)` 幂等。重复调用只记日志。
2. **构造失败没有尝试。** 不强行归入 `dispatched`；用 `attemptId=null` 的预尝试失败路径，只结算逻辑请求。
3. **熔断阈值。** 构造失败只结算当前请求；`workerFailures` 达到 3 时，原子结算所有未终态逻辑请求为 `failed(breaker-open)`；不保留 `retry-pending` 或 `deferred`。
4. **取消先禁调度。** `cancelAll` 先置 `cancelling`、推进代次、禁止 `pump`；再结算 `executing` 尝试、`retry-pending` 逻辑请求、`deferred` 逻辑请求、`analysis-succeeded` 待提交请求；最后清空引用。
5. **`dispose` 永久关闭。** 先置 `disposed=true`，再执行取消协议；结束后不得重开调度。
6. **旧事件只能 no-op。** 代次/尝试/请求不匹配时，事件结果为 `ignored-*`，不改变任何状态、不写缓存、不 `pump`。
7. **成功清零。** 成功创建 Worker 或收到有效成功回复后，`workerFailures=0`。
8. **缓存前校验。** 客户端在写缓存前校验 `requestId`、`attemptId`、`scriptId`、`sourceLength`、`sourceSha256`；任一不符按 `protocol-error` 处理，不写缓存。面板随后再校验页面纪元、对象身份、最新请求序号和源码/URL。

### 5.4 批量取消协议

`cancelAll(reason, { epochChanged })`：

1. `cancelling = true`；`schedulerGeneration++`；禁止 `pump`。
2. 若 `epochChanged`：`pageEpoch++`；所有旧纪元请求失效。
3. 结算 `executing`：清看门狗；尝试 `cancelled`；逻辑 `cancelled`；终止 Worker；解除处理器。
4. 逐项结算 `retry-pending`：清重试计划；逻辑 `cancelled`。
5. 逐项结算 `deferred`：清引用；逻辑 `cancelled`。
6. 逐项结算 `analysis-succeeded`（尚未提交）：逻辑 `cancelled`。
7. 清空 `active`、等待者、定时器、重试队列。
8. 清空缓存（纪元变化必须；面板关闭同样）。
9. `cancelling = false`；允许后续新请求重新 `pump`。`disposed` 时保持关闭。

**禁止：** 取消期间 `pump`；只清数组不 `resolve`；把 `retry-pending` 留在后台；取消后旧回调再次 `pump`。

### 5.5 熔断

- **计数单位：** 构造失败、`onerror`、`messageerror`、`postMessage` 抛错、`protocol-error`；连续 3 次触发。
- **不计入：** 看门狗超时（单独 `watchdogTrips`）、业务解析失败、提交校验失败、用户取消。
- **触发第三次失败时：** 当前逻辑请求按对应规则结算（构造失败→`failed(worker-unavailable)`；尝试失败→重试或 `failed`）；随后原子结算所有剩余非终态请求为 `failed(breaker-open)`。
- **恢复：** `refresh`、新纪元、`cancelAll` 可重置 `workerFailures` 与熔断标志；下一次 `pump` 重新创建 Worker；若再失败重新熔断。刷新路径必须可达，不能只依赖 `cancelAll`。
- **可见性：** 面板显示熔断状态、连续失败次数、最后错误码；不无限自动重试。

### 5.6 重试矩阵

| 失败 | 首次处理 | 第二次处理 | 最终错误码 |
|---|---|---|---|
| 看门狗 | `retry-pending`，新 Worker | 失败 | `watchdog-timeout-retry-exhausted` |
| 崩溃/`messageerror`/发送失败/协议错误 | `retry-pending`，新 Worker | 失败 | `worker-crashed-retry-exhausted` 或 `protocol-error-retry-exhausted` |
| 构造失败 | 不重试 | — | `worker-unavailable` |
| 业务解析失败 | 不重试 | — | `analysis-failed` |
| 提交校验失败 | 不重试 | — | `commit-rejected` |
| 取消/纪元 | 不重试 | — | `cancelled` |
| 容量/超预算 | 不重试 | — | `deferred-full` / `source-too-large` |

**首次失败必须可见：** 记录 `attempt-failed`（`attemptId`、错误码、耗时）；`attemptFailures` 与 `retrySucceeded` 是历史累计；不得用第二次成功抹去首败。

---

## 六、当前状态与历史累计（N02，R13）

### 6.1 每个脚本一个 `currentState`

当前状态枚举（穷尽、互斥）：

| currentState | 含义 |
|---|---|
| `discovered` | 已收到脚本，尚未提交分析 |
| `deferred` | 已受理，等待执行 |
| `executing` | 某次尝试在飞行 |
| `retry-pending` | 首次失败，等待第二次 |
| `analysis-succeeded` | Worker 成功，等待提交 |
| `analysis-failed` | 解析失败 |
| `commit-rejected` | 提交校验失败 |
| `committed` | 提交成功 |
| `failed` | 基础设施/最终失败 |
| `rejected` | 未受理 |
| `cancelled` | 取消/纪元结算 |

**守恒式：** 对当前发现脚本集合，
`count(discovered) + count(deferred) + count(executing) + count(retry-pending) + count(analysis-succeeded) + count(analysis-failed) + count(commit-rejected) + count(committed) + count(failed) + count(rejected) + count(cancelled) = 当前发现脚本总数`。

任何时刻每个脚本只有一个 `currentState`；状态转换是原子的；不允许一个脚本同时计入 `cancelled` 和 `committed`。

### 6.2 历史累计 counters（不参与守恒）

| counter | 含义 | 单调性 |
|---|---|---|
| `attemptFailures` | 尝试级失败次数 | 只增 |
| `workerFailures` | 连续 Worker 级失败计数 | 可被成功清零（这不是历史累计，单独放） |
| `watchdogTrips` | 看门狗触发次数 | 只增 |
| `retries` | 第二次尝试次数 | 只增 |
| `retrySucceeded` | 第二次成功次数 | 只增 |
| `requestsCancelled` | 被取消的逻辑请求数 | 只增 |
| `requestsRejected` | 未受理的逻辑请求数 | 只增 |
| `commitsRejected` | 提交校验失败次数 | 只增 |
| `analysisParseFailures` | 解析失败次数 | 只增 |
| `staleEvents` | 旧代次事件数 | 只增 |
| `cacheHits` / `cacheMisses` / `cacheEvictions` | 缓存统计 | 只增 |

**禁止：** 把 `requestsCancelled`、`requestsRejected` 加进当前状态守恒式；把“曾取消后重试成功”的脚本同时算作 `cancelled` 和 `committed`。

### 6.3 终态映射

| 逻辑结果 | currentState | 说明 |
|---|---|---|
| Worker 成功、提交成功 | `committed` | 唯一 `analyzed=true` |
| Worker 成功、提交失败 | `commit-rejected` | 不计 `analyzed` |
| Worker 解析失败 | `analysis-failed` | 不计 `analyzed` |
| 基础设施最终失败 | `failed` | 不计 `analyzed` |
| 未受理 | `rejected` | 不计 `analyzed` |
| 取消/纪元 | `cancelled` | 不计 `analyzed` |

`analysis-succeeded` 是**等待提交**的当前状态，不是终态；它必须在同一刷新/纪元内转为 `committed` 或 `commit-rejected`，否则停留在 `analysis-succeeded` 并计入当前状态。

### 6.4 UI 口径

- 面板“已分析” = `committed` 计数。
- “延后” = `deferred`；“执行中” = `executing` + `retry-pending`；失败 = `analysis-failed` + `commit-rejected` + `failed`；“拒绝” = `rejected`；“取消” = `cancelled`。
- 历史累计另设区域，不与当前状态混排。

---

## 七、源码精确身份（N04，R05）

### 7.1 两个不同的口径

| 用途 | 口径 |
|---|---|
| D3/D4 的字节预算与超时 | **UTF-8 编码后的字节数**（保持不变） |
| 缓存/active 的源码身份 | **无损的 JavaScript 字符串身份**（新增，不得用 UTF-8 哈希单独承担） |

原因：标准 UTF-8 编码会把孤立 UTF-16 代理项替换为 U+FFFD；两个不同的孤立代理项可能编码成相同字节，这是编码性质，不是 SHA-256 碰撞。

### 7.2 无损身份

- 新增一个**不修改** `src/core/hash-utils.ts` 的身份函数：把源码按 UTF-16 码元序列编码为字节（每码元 2 字节，小端），再算 SHA-256，记 `sha256Utf16Le`。
- 缓存键：`pageEpoch | scriptId | scriptUrl | sha256Utf16Le | analyzerVersion | optionsHash`。
- 缓存命中时再做一次**原始字符串全等**比较（`entry.source === source`）；哈希只用于索引，不单独作为相等证明。
- `sha256Utf8` 仍可用于展示、日志和 D3/D4 字节统计，但不得作为唯一身份。

### 7.3 active 去重与异步哈希

1. **同步占位：** `analyze()` 在返回 Promise 前同步安装占位；占位键用 `scriptId | scriptUrl | utf16Length`，值包含源码引用与占位序号。
2. **精确合并：** 仅当占位值的 `source === 新源码` 时才合并等待者；同键但源码不全等则创建新占位。
3. **异步定型：** `sha256Utf16Le` 完成后，把占位重键为完整键；若已有同完整键且源码全等的请求，合并等待者；否则保留新请求。
4. **force：** `force` 不与非 force 请求合并；创建新逻辑请求与更高 `requestSeq`；旧请求继续执行但不得覆盖新缓存（缓存写入要求 `requestSeq >= entry.requestSeq`）；面板只提交最新请求。
5. **不得修改受保护文件：** `hash-utils.ts` 的现有口径不变；新身份函数放在非受保护模块或测试工具中。

### 7.4 必测输入

- 孤立高代理项（`\uD800`）。
- 孤立低代理项（`\uDC00`）。
- 真实 U+FFFD 字符。
- 两个不同孤立代理项：UTF-8 哈希相同、UTF-16LE 哈希不同、原始字符串不全等。
- 真实 U+FFFD 与孤立代理项：UTF-8 可能相同、UTF-16LE 不同。

### 7.5 缓存容量、淘汰与失败隔离（R06）

| 项 | 规定 |
|---|---|
| 条目上限 | 128 条 |
| 结果字节预算 | 32 MiB = **33,554,432 字节**（二进制口径）；按 Worker 回复的 `resultBytes` 计，`resultBytes` 用 UTF-8 编码后的字节数，不是 JSON 字符数 |
| 预算性质 | 这是**估算上限**，不是堆内存精确上界；文档不得把它写成精确内存保证 |
| 单条超限 | 单条 `resultBytes > 32 MiB`：跳过缓存，分析本身成功；记录 `cacheSkipped` |
| 淘汰 | LRU；优先淘汰最久未访问的已完成条目；不得淘汰有等待者或在执行的条目 |
| 淘汰不足 | 淘汰后仍不足以容纳新条目：跳过缓存，不失败分析；不得突破预算 |
| 失败缓存 | 只缓存确定性解析失败；基础设施/超时/崩溃/取消/熔断/容量拒绝不缓存 |
| 纪元变化 | 清空全部缓存 |
| 缓存失败 | 缓存读写异常不得使分析失败；只记 `cacheError` |
| 统计 | `cacheHits`、`cacheMisses`、`cacheEvictions`、`cacheSkipped`、`cacheErrors` 为历史累计 |

---

## 八、页面纪元、URL、刷新与后台迟到（R11、R12）

### 8.1 三层身份

| 身份 | 作用 | 失效条件 |
|---|---|---|
| `pageEpoch` | 页面/文档生命周期 | 导航、刷新、目标页关闭 |
| `collectorEpoch` | 后台脚本收集器会话 | 页面重置、Service Worker 重启、重新附着 |
| `requestSeq` | 某脚本的分析请求序号 | 新刷新/force/新源码 |

**URL 身份：** `scriptUrl` 按原样字符串参与缓存键、提交校验与捕获目标校验；不做宽松归一化。提交时必须核对 `result.scriptUrl === 当前 script.url`。

### 8.2 后台迟到事件守卫（D6 必修）

- 发送前：`collector.getScript(scriptId) === script` 且 `scriptCollectors.get(tabId) === collector`；否则丢弃。
- 消息携带 `collectorEpoch`；面板维护 `latestCollectorEpoch`，拒绝更旧值。
- **会话重同步：** 面板 Port 连接时，后台先发当前 `collectorEpoch` 与 `sessionNonce`；面板以此重置本地基线。Service Worker 重启后 `collectorEpoch` 可能从 0 重新计数，必须用 `sessionNonce` 区分“新会话”与“旧消息”，不能只比较数字大小。
- 测试：异步取源码 → 重置 → 旧回调；正常脚本不被丢弃；SW 重启/重新附着的会话重同步。

### 8.3 刷新事务

- 单飞；快照；逐脚本新 `requestSeq`。
- 不清空全局候选；旧结果保留到该脚本新结果提交成功，再按脚本替换。
- 源码/URL 变化：旧结果标 `stale-source`/`stale-url`，不得作为捕获目标。
- 纪元变化：中止刷新，全部旧请求作废。
- 失败可见：逐脚本错误码；完成/部分失败/中止的明确结论。
- 提交成功：清旧错误；更新 `committedSourceHash`、`committedUrl`、`requestSeq`。

### 8.4 捕获目标

必须同时满足：`currentState=committed`、`committedSourceHash=当前源码哈希`、`committedUrl=当前 URL`、`pageEpoch=当前`、未退休（D7 若获批则按 D7；未获批时保留现有退休判定，但身份失效结果一律排除）。

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

---

## 十六、阶段路线与八项内容

顺序固定：**0 → 3 → 1 → 2 → 4 → 5 → 6 → 提升闸门 P**。不得调整整体路线。

**统一规则（N09）：** 阶段进入前，只要求“规则、范围、接口、必要决策”已批准；实现发生在阶段内部；阶段出口用实际验证。不得把出口条件提前伪装成进入条件。

### 16.1 Phase 0：基线冻结、隔离、ACL 与工具自测

| 项 | 内容 |
|---|---|
| 1. 进入条件 | 用户批准 Phase 0 范围（仅基线/隔离/工具自测）并授权管理员初始化；E1—E6 已写入本文件；D14/D15 已批准；D6 必修范围已确认。**不要求运行根已创建、ACL 已读回或实验已开始。** |
| 2. 实施内容 | 按 §4.1 第 3—9 步：创建 `<run>`、探针与三副本；设置并读回 ACL；Codex 只读验证；工具自测与守卫矩阵；原样/无插件/中和实验；基线 M0/M1、整树归档、第二归档（位置由用户提供）；证据归档。 |
| 3. 验证项目 | 检测器阳性/阴性对照；守卫 7 类覆盖矩阵；`tsc --noEmit`；Vitest 原样/无插件；路径中和等价性；预期拒写探针；证据目录拒写；插件写 `dist` 的对照；M0/M1 分层比对。 |
| 4. 通过标准 | M0 两套哈希一致；M1 对 M0 判 `unchanged` 或差异已归因；三副本同源且隔离；ACL 读回与期望一致；Codex 读成功/写拒绝；工具矩阵通过；实验分开记录；第二归档位置已提供并校验。 |
| 5. 失败处理 | 工具自测失败：停止，不进入正式实验；ACL 不符：停止，不扩权；预期拒写未达预期：按失败；意外写入：`unexpected-write`，停止保留现场；原项目变化：`source-unknown`，停止。 |
| 6. 回滚范围 | 原项目未写入，无需回滚；丢弃 `<run>` 内实验副本即可；证据、日志、失败记录保留。 |
| 7. 输出证据 | M0/M1 清单、整树归档与第二归档、ACL 读回、Codex 验证记录、工具矩阵结果、三副本派生记录、实验日志、Phase 0 报告。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 0 审查包；D1/D2/D11/D16 有决定（批准或明确拒绝/暂缓及后果）；D13 可决定采用整树归档备选；否则不得进入 Phase 3。 |

**Phase 0 只允许**：基线、隔离、ACL、工具自测、实验副本、插件对照、证据归档。**禁止**提前实施 Phase 1—6 的代码整改。

### 16.2 Phase 3：构建与测试卫生

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 0 出口批准；D1（Worker 格式）、D2（构建戳位置）、D11（落盘只校验）、D16（脚本路径）已有决定；D13 可选（未批用整树归档）。只要求规则与范围批准，不要求已实现。 |
| 2. 实施内容 | 先修复制插件（仅 `build` 执行、目标取解析后 `build.outDir`）；顶层 `worker`；删除无效 `assetFileNames` 与陈旧注释；构建戳（仅输入哈希 + Vite 版本）；可信旁清单；`p47-verify-dist.ts`；Vitest 不写 `dist`；D11 若批准则落盘只校验；D16 若批准则路径模块。 |
| 3. 验证项目 | 配置结构断言；A/B 各自独立构建与真机加载；两次构建；两个绝对路径构建；构建戳/旁清单/实际产物三方核对；四类负例；Vitest 对 `dist` 零写入；`tsc` 口径。 |
| 4. 通过标准 | 两次构建逐文件哈希一致；旁清单文件集合与实际 `dist` 完全相等；逐文件 SHA-256 一致；无绝对路径；A/B 有各自加载记录；D1 定案；旧 `dist` 不冒用；Vitest 不写 `dist`。 |
| 5. 失败处理 | A/B 都加载失败：阶段失败，回滚；同名篡改未发现：阶段失败；不可复现：阶段失败；D1 未决：不得关闭阶段。 |
| 6. 回滚范围 | 工作副本恢复到 Phase 0 出口；删除构建实验目录；失败记录保留。 |
| 7. 输出证据 | 两次构建清单、旁清单、构建戳、负例记录、A/B 加载记录、Vitest/tsc 输出、D11/D16 实施记录。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 3 审查包；D3/D4 规则与状态机接口已评审；Phase 1 可开始实现。 |

### 16.3 Phase 1：状态机、延后、看门狗、重试与缓存

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 3 出口批准；D3/D4 规则已批准（无需已实现）；N01/N02/N04 规格已评审；状态机接口冻结。 |
| 2. 实施内容 | 客户端逻辑请求/尝试状态机；deferred 256/64MB、四级统计；看门狗公式与一次重试；熔断；取消协议；缓存身份（UTF-16LE）与容量；传输信封校验；`resultBytes`。 |
| 3. 验证项目 | 事件 × 逻辑 × 尝试表逐格测试；构造失败/取消/熔断/重试耗尽；真实执行中崩溃；retry-pending 取消；deferred 边界；缓存超限；孤立代理项身份；统计守恒。 |
| 4. 通过标准 | 每条路径唯一结算；无永久 pending；`workerFailures` 规则与熔断阈值一致；取消不动新任务；deferred 边界准确；统计 gauges/counters 分离；源码身份负例通过；`hash-utils.ts` 未改。 |
| 5. 失败处理 | 任一格未闭合：阶段失败；需要改受保护模块才能通过：停止并上报；熔断/取消留 pending：失败。 |
| 6. 回滚范围 | 恢复到 Phase 3 出口；与 Phase 2 的联合回滚点见 16.4。 |
| 7. 输出证据 | 状态转移表执行记录、故障注入、统计快照、缓存测试、身份负例、协议样例。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 1 审查包；Phase 2 所需接口（请求序号、回显、状态枚举、协调器）冻结。 |

### 16.4 Phase 2：页面纪元、后台守卫、提交与捕获目标

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 1 出口批准；D5（进度/日志）、D7（捕获筛选）已决定或明确暂缓并接受后果；D6 必修范围已批准；D10 已批准。只要求范围与接口，不要求已实现。 |
| 2. 实施内容 | 共享 coordinator；pageEpoch/collectorEpoch/sessionNonce；后台迟到事件守卫；提交校验；刷新事务；URL 身份；状态 gauges；D5 计数/日志（若批准）；D7 捕获筛选（若批准）；D10 钩子。 |
| 3. 验证项目 | 刷新竞态、重置、迟到事件、SW 重启重同步、同 id 新对象、旧错误不覆盖新成功、回显不一致、候选顺序、状态守恒、钩子白名单、捕获目标身份。 |
| 4. 通过标准 | 候选按脚本替换、顺序为发现顺序；刷新单飞；旧结果不提交；`analyzed=committed`；当前状态守恒；D6 确定性测试；钩子九字段严格；捕获目标带 URL/source/epoch 校验。 |
| 5. 失败处理 | 竞态未闭合：阶段失败；钩子字段越界：失败；D6 守卫丢失合法脚本：失败；联合回滚。 |
| 6. 回滚范围 | Phase 1/2 联合回滚：恢复到 Phase 3 出口兼容快照；协议已跨阶段变化时不得只回退 `panel.ts`。保留失败证据。 |
| 7. 输出证据 | 协调器单测、后台守卫、SW 重同步、钩子结构、状态快照、捕获目标对照。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 2 审查包；D8/D9 有决定或明确暂缓；Phase 4 规格可评审。 |

### 16.5 Phase 4：性能、完成判据、deadline 与真机竞态

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 2 出口批准；D8（长任务阈值）已决定或明确暂缓；D9 已决定或明确暂缓（暂缓的后果见下）；§9 规格与取证接口已评审。**不要求独立取证工具已就绪。** |
| 2. 实施内容 | Phase 4 准备段：实现测试侧 DOM 观察器与取证工具；正式测量段：无污染测量、三阶段、四种耗时、50%、deadline 分类、真机竞态；D9 获批时改 L1 闸门。 |
| 3. 验证项目 | 完成判据纯函数；after-run4 判未完成；目标 DOM 增量；首次超时+二次成功计入累计；deadline 全状态；completed/partial；前后同口径；50%。 |
| 4. 通过标准 | 目标 `resultUsable`；`discoverDecoders` 主线程样本 0；D8 阈值内（若批准）；所有合法完成 `cumulativeExecutionMs < 50%`；分类互斥；竞态 1×；失败 run 全部披露。 |
| 5. 失败处理 | 目标渲染无法证明：失败；50% 不达标：失败，不改阈值；D9 暂缓：记录 `D9-deferred`，不宣称 L1。 |
| 6. 回滚范围 | 恢复到 Phase 2 出口；失败运行保留；工具与证据保留。 |
| 7. 输出证据 | 前后测量、长任务、DOM 增量、四耗时、分类快照、完整结果导出、竞态记录、阈值登记。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 4 审查包；编码/取证格式冻结；D9 若未批，L1 闸门列为 Phase 6 后置条件。 |

### 16.6 Phase 5：四方完整一致性

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 4 出口批准；类型保真编码规格与四方接口已评审；不要求完整矩阵工具已实现。 |
| 2. 实施内容 | 实现/扩展四方矩阵工具；小输入全矩阵；重输入开关；双哈希；深比较；浏览器全文落盘；子进程降级标注。 |
| 3. 验证项目 | 四方各自 ordered/sorted 相等；不要求两种编码彼此相等；首个差异定位；孤立代理项；U+FFFD；深层嵌套；产品 Worker 产物哈希。 |
| 4. 通过标准 | 每个输入两组哈希四方各自相等；浏览器哈希=Node 复算；完整输出入档；测试页不写 `dist`；降级覆盖明确。 |
| 5. 失败处理 | 任一输入不一致：逐项报告，不通过；子进程替代：只能记降级结论；不得删字段。 |
| 6. 回滚范围 | 恢复到 Phase 4 出口；只涉及测试/脚本。 |
| 7. 输出证据 | 四方输出、双哈希、差异定位、输入矩阵、产物哈希。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 5 审查包；全部一致性输出可追溯。 |

### 16.7 Phase 6：冻结、全量回归、最终提升树

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 5 出口批准；冻结流程与最终树验证规格已批准；D13 已决定。 |
| 2. 实施内容 | 冻结；`tsc --noEmit`；全量 Vitest（含重测试）；双构建；`dist` 校验；证据核对；真机五项；最终候选树逆映射与外部构建；最终报告、勘误、提升清单草案。 |
| 3. 验证项目 | 全量回归；双构建；旁清单/实际产物；安全指标；最终树双向校验；提升清单差异；历史证据。 |
| 4. 通过标准 | 全部门槛；安全指标（或 `n/a`）；构建可复现；最终树与最终产物可追溯；提升清单完整；历史证据未变。 |
| 5. 失败处理 | 冻结后改源码：结果作废重跑；最终树未验证：不得 P；安全指标不达标：不通过。 |
| 6. 回滚范围 | 恢复到 Phase 5 出口；冻结后修改使后续结果作废。 |
| 7. 输出证据 | 冻结摘要、测试输出、双构建、`dist` 校验、真机证据、最终树验证、提升清单。 |
| 8. 下一阶段准入 | 用户与 Codex 批准 Phase 6 审查包与提升清单；新静默窗口；Gate P 单独授权。 |

### 16.8 提升闸门 P

| 项 | 内容 |
|---|---|
| 1. 进入条件 | Phase 6 通过；最终提升树已验证；用户与 Codex 逐项批准清单；新静默窗口；原项目内容与 M0 相同（不同先查明）。 |
| 2. 实施内容 | 只写批准清单：产品源码/配置、测试、新夹具、脚本、新文档、最终 `dist`；不写历史证据、旧报告、`registry.json`、`budget-ledger.json`、`node_modules`。 |
| 3. 验证项目 | 提升前：逆映射碰撞、双向逐字节、文件清单、输入哈希、最终树构建产物；提升后：逐文件哈希、M0 差异、`dist` 摘要、证据摘要。 |
| 4. 通过标准 | 提升后差异恰好等于清单；`dist`=最终树产物；历史证据摘要不变；无绝对路径；无意外文件。 |
| 5. 失败处理 | 任一不符：停止，按步骤日志回滚；不重跑覆盖；记录“内容相同但 USN/ChangeTime 不同”。 |
| 6. 回滚范围 | 按步骤日志逆序撤销；用 Phase 0 归档还原；记录元数据差异。 |
| 7. 输出证据 | 提升清单、映射表、碰撞检查、逐文件哈希、进度日志、提升后清单。 |
| 8. 下一阶段准入条件 | 无下一阶段；提升完成即停止。是否在原项目重跑测试由用户另行决定，不属于 Gate P |

### 16.9 待批准决策的合法分支

| 决策 | 未批准时的合法处理 | 后果 |
|---|---|---|
| D1 | Phase 3 不选定 A/B；只做候选验证 | Phase 3 不得关闭 |
| D2 | 不选定构建戳位置 | Phase 3 不得关闭 |
| D5 | Phase 2 不做 UI 计数/日志改动 | 阶段报告记“未采用 D5”；不得声称进度可见性已验收 |
| D7 | 不做退休筛选；只做身份失效排除 | 阶段报告记“未采用 D7”；捕获目标仍排除失效身份 |
| D8 | Phase 4 可测量，不记性能通过 | 阶段不得关闭性能验收 |
| D9 | Phase 4 可做目标性能，L1 闸门记 `D9-deferred` | Phase 6 不得声称 L1 通过；D9 必须在任何 L1 运行前决定 |
| D11 | Phase 3 用证据目录拒写作为检测 | 阶段报告记“未采用 D11”；不得声称落盘只校验已验收 |
| D13 | 用整树归档，不用 Git | 不阻塞阶段三 |
| D16 | 不改造脚本；真机加载实验在独立实验副本进行 | 阶段报告记“未采用 D16”；沙盒证据不变 |

---

## 十七、决策状态

| 决策 | 状态 | V3 处理 | 闸门 |
|---|---|---|---|
| D1 | 待批准 | 不选 A/B；A/B 独立验证 | Phase 3 前 |
| D2 | 待批准 | 戳内容按 D12；位置待定 | Phase 3 前 |
| D3 | **已批准** | §3.1、§6 完整落实 | Phase 1 |
| D4 | **已批准** | §3.2、§9 完整落实 | Phase 1/4 |
| D5 | 待批准 | 未批不做 UI 改动 | Phase 2 前 |
| D6 | 按 M6 必修 | §8.2；不扩展到 capture-engine/验证规则 | Phase 2 |
| D7 | 待批准 | 未批不做退休筛选 | Phase 2 前 |
| D8 | 待批准 | 未批不记性能通过 | Phase 4 前 |
| D9 | 待批准 | 未批走 `D9-deferred` | Phase 4 前 |
| D10 | **已批准** | §3.3、§12；九字段白名单 | Phase 2/4 |
| D11 | 待批准 | 未批用拒写检测 | Phase 3 前 |
| D12 | **已批准** | §3.4、§14、§16.8 | 全程/P |
| D13 | 待批准 | 未批用整树归档 | Phase 0/3 |
| D14 | **已批准** | §3.5、§4、§15 | Phase 0 |
| D15 | **已批准** | §3.6；不重复批准 | 全程 |
| D16 | 待批准 | 未批不改造脚本 | Phase 3 前 |

---

## 十八、R01—R25 状态摘要

以第二轮审查 B 节为准：

| 状态 | 数量 | 编号 |
|---|---|---|
| CLOSED | 4 | R07、R12、R20、R24 |
| PARTIAL | 19 | R01、R02、R03、R04、R05、R06、R08、R09、R10、R11、R14、R15、R17、R18、R19、R21、R22、R23、R25 |
| OPEN | 2 | R13、R16 |

- **R13 保持 OPEN：** V3 在 §6 给出 gauges/counters 分离与穷尽状态，但按第二轮基准仍记 OPEN，待第三轮复核；不得写成已关闭。
- **R16 保持 OPEN：** V3 在 §9 给出 DOM 增量身份与三阶段，但按第二轮基准仍记 OPEN，待第三轮复核；不得写成已关闭。
- CLOSED 只表示方案层闭合，不代表实现或实验通过。

---

## 十九、尚未解决与 `UNVERIFIED`

### 19.1 待用户决定

D1、D2、D5、D7、D8、D9、D11、D13、D16；第二归档位置；W2-B 是否授权及执行者；管理员日志导出时间；Phase 0 批准与提升批准。

### 19.2 `UNVERIFIED` 清单

| 项 | 现状 | 验证时点 |
|---|---|---|
| 复制是否携带 ChangeTime | SUSPECTED | Phase 0 |
| Vitest 经 `closeBundle` 写 `dist` 的频次 | 机制 CONFIRMED，频次 UNVERIFIED | Phase 0 |
| 守卫进入 Vitest 工作进程 | UNVERIFIED | Phase 0 |
| 7 类守卫覆盖矩阵的实际结果 | UNVERIFIED | Phase 0 |
| A/B 各自真机加载 | UNVERIFIED | Phase 3 |
| Node 线程直接加载 TS Worker | UNVERIFIED | Phase 5 |
| 扩展 Worker WebCrypto | UNVERIFIED | Phase 1/3 |
| D6 真实浏览器频率 | UNVERIFIED | Phase 2/6 |
| Chrome 155 节流/后台联网参数 | UNVERIFIED | Phase 3/4 |
| 512KB 修复后 Worker 耗时与 50% | UNVERIFIED | Phase 4 |
| DOM 增量身份实现 | UNVERIFIED | Phase 4 |
| 真实 panel 完整内容一致性 | UNVERIFIED | Phase 4/5 |
| Codex 读取 `D:\P47RUN` | UNVERIFIED | Phase 0 |
| 原项目 ADS | UNVERIFIED | Phase 0 |
| 最终提升树双向映射 | UNVERIFIED | Phase 6/P |
| L1 连接超时根因 | UNKNOWN | 下一次 L1 前 |
| 22:48 元数据事件来源 | UNKNOWN | 管理员日志导出；不归因 |

### 19.3 不宣称

不宣称任何修复已实现或通过；不宣称 A/B 已定案；不宣称 Phase 0 已具备条件；不宣称历史证据绝对未改；不宣称 `D:\P47RUN` 已存在。

---

## 二十、E1—E6 对照

| 条件 | V3 位置 | 状态 |
|---|---|---|
| E1 初始化顺序 | §4.1（10 步；根创建属 Phase 0 内部；第 10 步按路线进入 Phase 3） | 已落实 |
| E2 执行边界与三副本 | §4.2、§13.2 | 已落实 |
| E3 预期拒写 vs 意外写入 | §4.3、§13.3 | 已落实 |
| E4 守卫覆盖矩阵 | §4.4（7 类，逐项记录/停止） | 已落实 |
| E5 基线证据与第二归档 | §4.5 | 已落实（位置待用户） |
| E6 原项目只读 | §4.6、§13.1 | 已落实 |

---

## 二十一、文档层自检摘要

详细逐项见 `PHASE4.7-V3-SELF-CHECK.md`。摘要：16 项检查中，14 项 PASS，2 项 PARTIAL（真实 panel 完整内容一致性、最终提升树的动态验证），0 项 FAIL。两项 PARTIAL 均已给出后续验证阶段与失败处理，不冒充已通过。

---

## 二十二、附录：输入与章节索引

| 文件 | 字节 | SHA-256 |
|---|---|---|
| V2 候选 | 75609 | `c97f1374…` |
| V2 追溯 | 17312 | `73c83c17…` |
| 第二轮审查 | 29702 | `ac416be0…` |

| 章节 | 内容 |
|---|---|
| 一 | 版本与目标 |
| 二 | 第二轮结论与响应 |
| 三 | D3/D4/D10/D12/D14/D15 |
| 四 | Phase 0 E1—E6 |
| 五 | 状态机与结算（N01） |
| 六 | gauges/counters（N02） |
| 七 | 源码身份（N04） |
| 八 | 纪元/URL/刷新/迟到 |
| 九 | 性能与完成（N03） |
| 十 | 安全指标（N05） |
| 十一 | 构建/产物（N07） |
| 十二 | 取证/真实面板（N06） |
| 十三 | 历史证据/未变化 |
| 十四 | 最终提升树（N08） |
| 十五 | 身份/W2（R25） |
| 十六 | 阶段路线（N09） |
| 十七 | 决策状态 |
| 十八 | R 摘要 |
| 十九 | 未解决/UNVERIFIED |
| 二十 | E1—E6 对照 |
| 二十一 | 自检摘要 |

### 22.1 本轮声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第三轮独立审查；不自动进入 Phase 0。**
