# OpenCode V9 第十二轮审查整改计划（V10，未启动）

日期：2026-11-12 20:38:21（Asia/Shanghai）
状态：**计划，未实施**。输入为 `reviews\V9-TWELFTH-INDEPENDENT-REVIEW.md`（38743 字节，SHA-256 `7c5e5f0d…`）及 zip（93261 字节，SHA-256 `60ed0fff…`）。
边界：不修改 V9/V8/V7；不执行 C00—C20、Phase 0、发布器、恢复器、lab、附件脚本、浏览器/L1；不创建 `D:\P47RUN`/`D:\P47TOOLS`；不改 ACL。

## 1. 目标

生成 V10 契约包，逐项关闭 Q01—Q14，并把 F01—F14 从“3 FIXED/5 PARTIAL/6 OPEN”推进到有独立证据的状态；N/R 评级只在有相应运行/产品证据时改变，不能靠本包自检升级。

通过条件分三层，不得混写：

1. **静态/隔离通过**：代码、规则、正负例、隔离故障实验。
2. **动态通过**：真实运行工具 + 授权后的隔离验证。
3. **未验证**：明确列 UNVERIFIED，不标 PASS。

## 2. 工作目录与版本控制

- 新建 `p47-worker-remediation-plan\V10\`，不改 V9。
- V10 继续使用内容寻址 release + CURRENT 指针；V9 的 `_publish` 只读保留。
- 所有 Q 项修改先在 V10 分支/目录完成，生成独立 manifest 与新 rid。
- 保留 V9 的 520 文件归档与第十二轮证据；新证据放 `reviews\` 或 V10 `_publish`，不覆盖旧文件。

## 3. Q01—Q14 整改设计

### Q01 失败 trigger → stop → seal 绑定

**修改**：`p0v9-flow.cjs` 改为 `p0v10-flow.cjs`；场景输入从“fail + class”改为“fail + failure_mode id（含 code/class/trigger）”。  
**规则**：

1. 注入点立即设置 `stop=max(stop, levelOf(code))`。
2. `SEC-CHAIN-MISMATCH` 立即 `stop=chain-broken`，拒绝后续链写与 SEAL。
3. `chainBroken` 只由被选中的 code 决定，不扫描执行的全部 modes。
4. 普通 fatal、ORIGINAL 改变、链摘要错误分别写入独立场景。

**验证**：三组场景的 stop、允许后继、seal；检查器从“已发生 close 的 code”独立推导，不读生成器摘要。

### Q02 稳定错误码

**修改**：`p0v10-spec.cjs` 为每个 `fail_closed` 条目分配 `ERR-<EXEC>-NN`，建立 `code → class/trigger` 表；reason 仅作说明。  
**必改**：C00 六条、C03-PROBE 全部编号 reason、C05/C04/C05-FINAL 的摘要/重解析、C07 wrapper 四条。  
**验证**：逐执行断言 code 唯一、class/trigger 合法；新增“reason 文本变化、code 不变”正例与“code 未登记”负例；C00/C03 的 security 集合独立列出，不接受 `security_codes` 自证。

### Q03 报告输入存在性

**修改**：为 C17/C19/REPORT/SEAL 建立 `input_availability` 表：每个输入路径 → 生产者、生产者终态条件、`required|optional`、缺失时的报告字段。  
**规则**：

1. C17 的 `copies.json` 要么要求 C09 ok，要么标 optional 并在报告中写“C09 skipped，未读取”。
2. 逐场景（C08/C09/C10-P fatal、gate skip、orphan）枚举输入存在性。
3. halt-business 下 finalizer 的 before/after 例外写入合同，不依赖不存在的 before 证据。

**验证**：新增 `flow-c08-fatal`、`flow-c09-fatal`、`flow-c10p-gate` 三个输入可用性矩阵；检查器断言“exec ok ⇒ 每个非 optional 输入有 ok 生产者”，不只看直接 requires。

### Q04 seal 与链的完整重放

**修改**：`p0v10-audit.cjs` 只生成完整链的 seal 正例；片段 seal 改名 `fragment-seal`，不得标 sealed-full。  
**规则**：从链逐执行推导 `opened/closed/skipped/orphaned`、`abort`、`security_findings`、`open_segments`、`index/report` 截止点；seal 全字段比对。  
**验证**：修正 seal_0（records=3）、seal_1（skipped/counts）、seal_3（abort=C10-N/orphan）；新增“计数少一”“abort 指向错误执行”“open_segments 与尾不符”“complete 但有 failed close”四个负例。

### Q05 安全停止全执行覆盖

**修改**：`p0v10-check.cjs` 的 `flowReplay`：任何 security close 先激活 halt；wrapper 只决定是否允许唯一 A；对 open 与 close 都做“halt 后只允许 A/skip/seal”检查。  
**验证**：新增 C02 security、C06 security、C07-before security 片段；断言后续 target/finalizer/bind 的 open/close 均报 `flow.after_halt`。

### Q06 rename 源授权与产品保护

**修改**：事件 schema 增加 `src_rule_ref`；rename/copy 对源验证“读 + 源删除/改名授权”，对目的验证写规则与 protect；product 使用 `product.protect_write`。  
**验证**：新增 Q06 反例（ORIGINAL→TMP rename）期望 `perm.src_write`；新增合法 rename 正例；新增 product 保护集反例。

### Q07 操作级 schema 闭合

**修改**：按 op 定义字段：

| op | before | after | bytes_written | 额外 |
|---|---|---|---|---|
| create/overwrite | 允许 absent/exists | bytes+sha | 最终大小 | rule 覆盖 |
| append | 现有文件 | 最终 bytes+sha | 本次增量 ≤ final | 增量语义 |
| mkdir | parent 状态 | dir 状态 | null | 不要求文件 sha |
| acl | SDDL 前 | SDDL 后 | null | 必须回读 |
| delete | 原对象 | absent | null | 源删除授权 |
| rename/copy | 源+目的 | 目的状态 | null | `src_rule_ref` |

map-list：定义“批准 map → 精确文件集合 + 展开摘要 + rule_ref 绑定”，不得退化为任意 subtree。denied 读允许 `rule_ref=null`。补 `before` 对象、read `path_kind` 类型检查。  
**验证**：C14 展开正例、denied-null-ref 正例、mkdir/acl/delete/rename 正例；每类一个非法反例。

### Q08 pending-acceptance 与 undo 身份

**修改**：`p0v10-publish.cjs` 增加 `pending-acceptance` 状态：publish 提交后不立即释放锁，post gate 在同一持锁会话内完成，成功才 `accept` → verified；失败 `undo` 必须携带 `txid/rid`。  
**规则**：noop 不产生事务，post gate 失败不得撤销历史 verified；undo 持锁并校验 journal.txid/rid/old_current；身份不符只拒绝，不写文件。  
**验证**：隔离实验 A→B→C 交错、noop 后 gate 失败、错误 txid undo；断言只影响期望事务。

### Q09 原子锁与所有权

**修改**：LOCK 用 `LOCK.tmp` 完整写入 `{token,pid,created}` + rename；`acquire` 遇 EEXIST 时读取完整记录，未完成/解析失败一律拒绝；陈旧锁只在“完整记录 + pid 死亡 + token 匹配”时清理；`release` 只 unlink 自己的 token。  
**验证**：静态断言 + 另行授权的初始化/释放交错实验；不得只用完整 pid 哨兵。

### Q10 journal/集合/残留完整性

**修改**：`status/recover/check` 统一验证：

1. journal 必须存在且 schema/txid/state/rid/files.new/files.old/backup_dir 完整。
2. `files.new` 与 CURRENT.files 全量相等。
3. manifest 生成映射、CURRENT、release index、release 物理文件、物化文件五方集合双向相等。
4. `rolled-back` 绑定 old_current；staging 残留列入 issues 并影响退出码。
5. 缺失 journal、子集指针、伪造 backup_dir 均失败退出 1。

**验证**：五组损坏输入，逐个断言 issues 与退出码。

### Q11 路径与持久化边界

**修改**：所有 release/backup/index/journal 路径由 `root + validated rid/txid` 派生并走统一 `abs`；`abs` 增加 reparse/对象身份检查（运行层交付后）；追踪表把“词法限制”“fsync 尝试”“断电保证”分列。  
**验证**：`..`、绝对路径、重解析、伪造 backup_dir 负例；断电/磁盘错误仍 UNVERIFIED。

### Q12 故障现场保存

**修改**：`p0v10-lab.cjs` 在 recover 前复制故障树、journal、CURRENT、release index、子进程 stdout/stderr 到 `fault-snapshot/`，逐文件记录 SHA；恢复后再生成 `recovered/`。  
**验证**：kill 场景断言“snapshot 哈希 == afterKill 哈希”，且 recovered 哈希 == A；留存文件与摘要一一对应。

### Q13 场景判据与复合覆盖

**修改**：场景记录 `requested/reached/observed`；不可达的第二注入标 `not-reached`；determinism 使用两个独立根、两个独立进程；post-gate 通过 build 触发；lock 用真实并发；short-write 注入真实短返回；status CLI 断言退出码。  
**验证**：17 场景每个至少有 1 个能失败的独立断言；不可达组合不计通过；3 个已知不可达复合场景改为可达组合。

### Q14 复现依赖声明

**修改**：V10 manifest 增加“运行时依赖”章节，明确：

- 纯生成：37 项 / 正式包自包含。
- 完整 gate：需要 V7/V8 基线包（单独清单 + SHA），或提供只读基线封装。
- lab 输出根统一为 `<root>\_publish\lab`，不随 `__dirname` 漂移。

**验证**：隔离目录仅放正式包，分别执行纯生成与完整 gate；记录缺失项；两类通过条件分开。

## 4. 新增测试与场景

| 类别 | 新增 |
|---|---|
| flow | 普通 fatal、ORIGINAL 改变、真实链错误、C02/C06 security、C08 fatal 输入、3 个可达复合故障 |
| audit | seal 计数/abort/open_segments/complete 四负例；rename 源、product protect、map-list、denied-null、mkdir/acl/delete/rename 正例 |
| publish | pending-acceptance、noop gate 失败、A/B/C 交错、错误 txid、LOCK 初始化/释放竞争、journal 缺失、CURRENT 子集、staging 残留、CLI 退出码 |
| lab | 故障现场快照、恢复后快照、requested/reached/observed、真实短返回注入 |
| 复现 | 纯生成 vs 完整 gate 两套隔离测试 |

所有负例必须“恰好一个错误码”；复合场景必须区分“请求注入”和“实际到达”。

## 5. 阶段与停止条件

| 阶段 | 内容 | 退出条件 |
|---|---|---|
| P0 | 冻结 V9、V10 目录、输入清单 | 哈希记录完成 |
| P1 | Q01—Q05（flow/audit/seal） | 静态 + 新增正负例通过 |
| P2 | Q06—Q07（权限/schema） | 同上 |
| P3 | Q08—Q13（发布/恢复/证据） | 隔离实验逐场景证据齐全 |
| P4 | Q14 与复现声明 | 纯生成/完整 gate 分开报告 |
| P5 | V10 全量生成、独立 checker、PowerShell verifier、manifest | 两次生成一致；V9/V8/V7 哈希不变 |
| P6 | 交付与停止 | 输出 Q/F/N/R 统计；等待第十三/下一轮独立审查 |

任何阶段失败：保留真实失败结果，标记 UNVERIFIED，不降低断言、不删除场景、不把静态当动态。

## 6. 目标统计（仅计划，不是当前结果）

| 项 | V9 当前（第十二轮） | V10 目标 |
|---|---|---|
| Q01—Q14 | 14 项问题 | 每项有修复或可复核反证 |
| F | 3 FIXED / 5 PARTIAL / 6 OPEN | 静态缺陷清零；运行项仍 PARTIAL/UNVERIFIED |
| N | 0/7/5 | 运行工具未交付前不升级 |
| R | 0/23/2 | 不改变 |
| 真实运行 | UNVERIFIED | 仅在授权后另行验证 |

## 7. 本轮未执行

未修改 V9/V8/V7；未运行 V9 工具、附件脚本、发布器、恢复器、lab；未执行 C00—C20、Phase 0、浏览器/L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未改 ACL。
