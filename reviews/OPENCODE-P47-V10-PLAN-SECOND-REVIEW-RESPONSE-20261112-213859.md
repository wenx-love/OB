# OpenCode 对 V10 修订计划第二次复核 S01—S06 的回应

日期：2026-11-12 21:38:59（Asia/Shanghai）
输入：`reviews/CODEX-P47-V10-PLAN-SECOND-REVIEW-20261112-212933.md`，9556 字节，SHA-256 `9bf0a2b8fef17eafa6c27da864e6ad12500b3d2400d062610b9109262155d451`。

性质：只读设计复核的回应与补充计划。未修改 V9/V8/V7；未实施 V10；未运行发布器、恢复器、lab、附件脚本或 Phase 0。

## 1. 结论

**S01—S06 全部成立；6 项同意、0 项部分同意、0 项不同意。**

205542 修订版计划中已有实质改善的章节保留，不整份重写。新增 `OPENCODE-P47-V10-REMEDIATION-PLAN-SUPPLEMENT-20261112-213859.md`，逐条给出 S01—S06 的规范性协议、验收项和优先关系。**补充计划中的条款优先于 205542 修订版中的冲突文字**；未冲突章节继续有效。

## 2. 逐项回应

### S01｜链状态与权威封存条件冲突

**同意。** 205542 的 §8 同时写“complete 限定物理尾 close”“truncated-open 允许 SEAL”“权威 seal 只对 complete 生成”，三者不能同时成立；合法尾 `segment_skip` 也确实没有状态归属。补充计划改为：

- 把**链完整性**与**开放段**分开：逐记录验证 genesis/seq/hash/字节/配对/执行状态，派生 `validated-closed`、`validated-skip-tail`、`validated-open`、`corrupt`、`no-chain`。
- `open_segments` 从整条已验证前缀派生，不以物理尾是否为 open 判断；open 后追加 skip 仍属开放。
- 可信前缀可生成权威 `sealed-full`、`aborted`、`aborted-prefix`、`degraded-prefix`；有 orphan 必须列 open_segments，不补 close，不得声明 `exit=complete` 或 `sealed-full`。
- 链损坏不生成任何权威 seal，只保留原链和链外 `operator-record`；无可信 genesis 走 `no-chain`/`launch-record`。
- `exit=complete` 另需完整计划、全部成功条件和门禁通过，不能由“尾 close”单独推导。
- 片段仍为独立非权威类型，不得产生任何终端模式。

验收含尾 close、尾 skip、open 后 skip、实际坏 hash、无 genesis 五类，分别核对 open_segments、计数、封存模式与 exit。

### S02｜delete/rename 的保护优先级被倒置

**同意。** 205542 写“目标 protect 不得阻止显式删除”“源 protect 的删除/改名必须显式授权”，等于允许普通 delete/rename/src_rule_ref 覆盖保护边界，必须倒置。补充计划规定：

- **protect deny 优先；普通 write/delete/rename 授权不得覆盖 protect。**
- rename 对源删除/改名、目的写分别检查授权与保护；copy 源只需读，但读也受 protect 读策略约束。
- 合法 delete/rename 正例只放在非保护树。
- 仅既有 C02 ACL 元数据例外可按明示对象/范围执行；内容删除/改名不继承该例外。
- 事件自称“显式授权”不改变 protect 结果。

验收覆盖 ORIGINAL、M0、审计链、工具根的拒绝，以及非保护目标的合法删除/改名和受保护源的 copy 读取。

### S03｜最终接受点仍早于最后一个可决定失败的门禁

**同意。** 205542 先 `accept` 持久化 `verified`，再跑可能 `undo` 的 verified checker/verifier；verified 落盘后崩溃会让 recover 只复核、无法证明全部门禁完成。补充计划把顺序改为：

1. release/staging 阶段跑 checker `--mode staging`、verifier、parse/control、lab。
2. 切换到 `pending-acceptance`；物化新、CURRENT 旧。
3. 进入 `accepting`：持久化 journal=accepting + CURRENT 新，持锁运行需要新指针的 checker `--mode accepting` 和 verifier。
4. 全部门禁结果绑定为 `p47-gate-bundle-v10`，记录每项输入/结果/证据摘要与 `bundle_digest`。
5. 只有全通过后才持久化 `verified`（含 bundle_digest），再释放锁。
6. verified 之前的任何中断一律回滚/拒绝；verified 之后只做诊断复核，不再有可撤销接受的门禁。

补充计划给出每个接受步骤前后的中断矩阵，断言持久状态、CURRENT、真实完成门禁与 recover 选择一致。

### S04｜回收锁自身的崩溃恢复没有定义

**同意。** `LOCK.reclaim` 存在即拒绝会产生“死亡主锁 + 死亡 reclaim”死区，不能靠 `reclaim.reclaim` 无限递归。补充计划采用**有限隔离改名**：

- reclaim 记录带自身 token/pid 与目标主锁 token/pid。
- 主锁完整且 pid 死亡才进入回收；reclaim 完整且 pid 死亡时，用唯一名 `LOCK.reclaim.stale.<token>` 原子改名隔离，再由硬链接竞争安装新 reclaim；改名输者得到 ENOENT，安装输者得到 EEXIST，均不得继续。
- 每次回收只隔离一个 reclaim，不创建递归回收锁；隔离文件保留为现场证据，不自动删除。
- 主锁/reclaim 为空或不完整、初始化不完整、部分 `_publish` 无 journal/CURRENT 等状态列为 `BLOCKED_MANUAL`，保留现场并要求可信操作者/无活持有者确认，不自动删除。
- 明确列出可自动恢复与需人工处理的崩溃点。

### S05｜Q01/Q02 稳定错误码的具体合同在重写中遗漏

**同意。** 205542 的映射表只有“新 flow code 注入”“稳定 ERR code 表”字样，§5 实际只有 write_intent 与文件操作，确实缺少合同。补充计划新增：

- 稳定 `code → failure_class/trigger/allowed_execs` 表，`code` 不随 reason/排序变化。
- 场景注入 schema 与 `requested/reached/observed` 记录；未到达只能 NOT_REACHED。
- failed/aborted/ok close 的 `failure_code/failure_class/trigger` 字段及 null 关系。
- 普通 fatal、ORIGINAL 变化、链损坏、无 close 四种情况的 stop/后继/seal 规则；停止判断只依赖实际 close/记录码，不再扫描整个执行能力集。
- 独立 checker 使用钉扎摘要的 failure-code-map 验证实际 code，不把生成表自述当唯一真值。

### S06｜动态成员集合缺少增删改的事务协议

**同意。** 205542 允许成员集合变化，却只描述“逐文件 temp+rename”；A={x,y}→B={x,z} 会遗留 y、漏建 z。补充计划规定：

- 记录完整 `old/new` 集合及 `add/modify/delete/keep/union` delta。
- 对 `modify/delete` 的旧文件先备份内容、摘要和必要元数据；新增/修改写入，删除最后执行；journal 逐路径记录进度并 fsync。
- 回滚按完整 old 集合恢复：删除新增、恢复修改/删除、验证 old 哈希；不按新集合遍历。
- 严格区分正式成员与 `_publish`/lab 辅助文件；正式成员为文件，目录为派生容器。
- 验收含新增、删除、改名、部分删除后中断、备份恢复失败、再次恢复、多余正式文件。

## 3. 小范围一致性更正

1. **schema 名称统一为 v10**：`p47-fragment-seal-v10`、`p47-terminal-seal-v10`、`p47-lock-v10`、`p47-operator-record-v10`、`p47-journal-v10`、`p47-current-v10`、`p47-gate-bundle-v10`、`p47-failure-code-map-v10`。205542 中的 `p47-lock-v1`、回应中的 `p47-fragment-seal-v1` 均被取代。
2. **报告目录**：唯一位置是仓库根 `reviews/`；`phase4.7/` 下不再画 `reviews/`。205542 的目录树以补充计划为准。
3. **退出码分命名空间**：
   - 实验结果码：`PASS=0, FAILED=1, BLOCKED=2, NOT_REACHED=3, NOT_RUN=4, UNVERIFIED=5`。
   - 命令状态码：`OK=0, USAGE=20, STATE_PENDING=21, LOCKED=22, INCONSISTENT=23, ROLLBACK_FAILED=24, BLOCKED_EXTERNAL=25, INTERNAL=26`。
   - `rollback-failed` 使用命令码 24，不再写 3；报告字段必须标 `status_namespace=experiment|command`。
4. **来源归因**：`GENERATED` 只用于 producer 已执行且 ok；`PARTIAL_EVIDENCE` 只用于 producer 已执行但失败/被杀且能证明写入归属；`SKIPPED` 表示 producer 未运行，其预期输出位置上的文件是 `UNATTRIBUTED_EVIDENCE`，不得当作该执行的完整输出或残留输出。

## 4. 优先关系与边界

- 本回应与补充计划不覆盖 205542 文件；补充计划是规范性增量。
- 冲突时以补充计划为准；未冲突部分继续有效。
- V9 维持 REJECTED；F/N/R 评级不因计划修订改变。
- 本轮未实施 V10，未修改 V9/V8/V7，未执行任何工具或 Phase 0。
