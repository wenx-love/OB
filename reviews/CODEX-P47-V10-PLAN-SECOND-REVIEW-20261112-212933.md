# OB-Recover Phase 4.7：V10 修订计划第二次独立复核

日期：2026-11-12（Asia/Shanghai）。性质：设计复核，不是 V10 实现验收或 Phase 0 授权。

## 结论

**REVISE BEFORE IMPLEMENTATION。修订方向已有实质进展，但原文仍有6项协议矛盾/缺项，应先用补充条款闭合，再由用户决定是否实施。**

已经吸收的上轮问题不重复认定为未修：普通 rename 获取锁已放弃，首选“完整唯一候选 + 原子硬链接安装”能表达目标存在即失败；wx回退对不完整记录保守拒绝；copy/rename的基本权限与字节已拆分；CreateNew与overwrite前置、FAILED/UNVERIFIED、状态相关new/old核验、外部输入分类、单缺陷与复合诊断分类均有实质改善。

尚无V10代码或运行结果，以下CONFIRMED仅指文字矛盾与规格缺项；后果是INFERRED，未执行任何故障。V9维持REJECTED，F/N/R评级不因计划修订改变。

## 输入与方法

基准提交：`463287aa52ec7413ceabb05294229296ec3cd401`。

| 输入（reviews/） | 字节 | SHA-256 |
|---|---:|---|
| OPENCODE-P47-V10-PLAN-REVIEW-RESPONSE-20261112-205542.md | 9304 | 47f5ac9f0d7e5d473708fc5268a6b1b5c8177555e716279d05b86d69773d8422 |
| OPENCODE-P47-V10-REMEDIATION-PLAN-REVISED-20261112-205542.md | 17098 | f9ed2ba9eb59f9cfa2f494c6744281a21d8c83440069e43aa7f451dfabe557b5 |

只读取上述文本、计算摘要、静态检查并新增本报告；未执行交付代码/附件脚本/发布/恢复/lab/C00—C20/Phase0/浏览器/L1，未修改历史文件或ACL。下文PLAN指修订计划，行号按该提交。

## S01｜链状态与权威封存条件冲突

**CONFIRMED；P1；实施前必须统一。** PLAN:221-225。

complete被限定为物理尾close；truncated-open却被允许SEAL，下一条又规定权威seal只对complete生成。这不能同时成立。合法尾segment_skip没有任何状态归属；开放段后追加skip时，物理尾也不是open，不能按尾类型发现orphan。

建议直接采用以下约束：

- 链完整性与是否有开放段分开判断：逐记录验证genesis/seq/hash/字节/配对/执行状态，派生“已验证且无开放段的前缀”“已验证且有开放段的前缀”“损坏”。skip可作为合法物理尾。
- 可信、完整读取的前缀可生成如实描述其终态的aborted/degraded-prefix等权威封存；有orphan的前缀必须列open_segments，不补close，不得声明exit=complete或sealed-full。
- 链损坏不生成权威seal，仅保存原始链与链外非成功记录。无可信genesis按no-chain/launch-record规则处理。
- exit=complete还须满足完整计划及所有既定成功条件；不能由“尾close”推导。片段仍独立非权威类型，不得产生任何终端模式。

验收至少含：尾close、尾skip、open后skip、实际坏hash、无genesis五类；分别核对开放段、计数、封存模式与exit。

## S02｜delete/rename的保护优先级被倒置

**CONFIRMED；P1；实施前必须更正。** PLAN:182-184。

delete写成“目标protect不得阻止显式删除”，rename写“源protect的删除/改名必须显式授权”，可使普通delete/write/src_rule_ref覆盖既有保护，违背ORIGINAL/M0/链/工具等保护边界。合法删除的必要性不意味着允许删除受保护对象。

建议规范文字：**protect deny优先；普通写/delete/rename授权不得覆盖protect。** rename对源删除/改名和目的写分别检查授权及保护；copy源只需读。合法delete/rename正例放在非保护树。仅既有C02 ACL元数据例外可按明示范围执行，内容删除/改名不继承该例外；保护策略不得因事件自称“显式授权”而放宽。

验收需同时检查ORIGINAL、M0、审计链、工具根的拒绝，以及非保护目标的合法删除/改名。

## S03｜最终接受点仍早于最后一个可决定失败的门禁

**CONFIRMED设计顺序；P1；实施前必须闭合。** PLAN:114、:138、:148、:158-159。

accept先持久化verified，再跑可能导致undo的verified checker/verifier。若在verified落盘后、最后门禁完成前崩溃，recover按verified只复核，不能证明此前全部必要门禁已完成。中断回滚承诺覆盖不到已经写成verified的窗口。不能仅以字节一致替代门禁证据。

建议：所有决定接受与否的检查放在最终verified持久化之前；需要CURRENT新指针的检查在accepting且持锁时执行，提供相应只读检查模式。全部成功后绑定门禁输入/结果身份，再持久化verified，最后释放会话锁。verified之前的崩溃按协议回滚/拒绝，verified之后按已接受版本规则复核。若保留接受后检查，须明确其是诊断、不再作为尚未完成的接受门槛。不要同时声称“已verified”和“接受验证还没完成”。

增加在每个接受步骤前后中断的场景；断言持久状态、CURRENT、真实完成门禁及recover选择一致。

## S04｜回收锁自身的崩溃恢复没有定义

**CONFIRMED规格缺项；P1（恢复可用性）；实施前须定义或明确限制。** PLAN:69-75、:82-83、:151。

LOCK.reclaim存在即拒绝，没有定义它的持有者死亡后如何处理。回收者获得reclaim后、删除旧死亡主锁前崩溃，会留下“死亡主锁+死亡reclaim”；后续recover又无法获取reclaim。不能以新增reclaim.reclaim无限递归补救。

可接受方案：给出安全且有限的回收锁恢复算法，或明确这一状态为BLOCKED并提供受控人工恢复协议。人工协议同样须保留现场、确认可信操作者/无活持有者及并发操作、验证目标对象和所有权，身份变化立即拒绝；不得自动删除不完整活锁。锁初始化失败、候选清理、首次初始化但无journal的中断状态也须列入处理表。没有自动恢复能力就如实列限制，不宣称所有锁崩溃可自动恢复。

验收加入持reclaim前、后、主锁删除前后、安装新锁前后中断的情况，并明确哪些可自动恢复、哪些需要外部动作。

## S05｜Q01/Q02稳定错误码的具体合同在重写中遗漏

**CONFIRMED规格缺项；P1；实施前必须补回。** PLAN:241-242及其指向的§4/§5/§8。

映射表声称有“新flow code注入”“稳定ERR code表”，但§5实际只有write_intent和文件操作表。全文未定义failure_mode稳定code表、场景注入结构、segment_close.failure_code、未知码与执行归属校验，以及无可信close时链外记录如何携带实际code。只把Q项映射到章节不能替代这些合同。

补回独立小节：

1. 不随reason/排序变化的稳定code→class/trigger表，规定每个code允许属于哪些exec。
2. 场景注入字段、requested/reached/observed如何记录实际code；未知code/跨exec非法code拒绝。
3. failed/aborted/ok close的failure_code/class/trigger字段及null关系，运行前及无可信close时launch/operator记录的code载体和证明边界。
4. 普通fatal、ORIGINAL变化、链损坏及没有close四种情况下stop/后继/seal规则；不得再次扫描整个执行的能力集合。
5. 独立checker如何按实际发生的code验证，而不是把生成表自述当唯一真值。

## S06｜动态成员集合缺少增删改的事务协议

**CONFIRMED规格缺项；P1；实施前应补齐或明确拒绝集合变化。** PLAN:41、:122-123、:135。

计划允许正式成员集合变化并要求提交/回滚的物化集合精确相等，但switchFiles仅描述“逐文件temp+rename”。例如A={x,y}、B={x,z}，成功提交必须删除y、创建z；回滚必须恢复y并移除z。仅遍历新集合将遗留旧文件，违反自身双向集合要求。

应记录完整old/new集合及其并集delta：新增、修改、删除、保持；对删除文件同样备份原内容/身份，规定删除顺序、journal进度与中断恢复，严格区分正式成员与_publish/lab等辅助文件。恢复验证按完整old集合及新增文件应不存在的条件进行。

也可在当前版本明确“成员集合变化不支持，检测后切换前零写入拒绝”，并列为限制；不能既允许变化，又只实现替换。测试至少包含新增、删除、改名、部分删除后中断、恢复失败和再次恢复。

## 小范围一致性更正

- RESPONSE的片段schema写`p47-fragment-seal-v1`，PLAN写`p47-fragment-seal-v10`，统一精确名称。
- 目录树把reviews画在phase4.7下，正文要求仓库根reviews；以仓库根`reviews/`为唯一报告目录。
- status状态表把rollback-failed退出码设3，而全局结果表3是NOT_REACHED；明确命令状态码与实验结果码是不同命名空间并规范映射，或统一，避免把恢复失败计为未到达。
- GENERATED与PARTIAL_EVIDENCE应保持来源归因：skipped执行没有运行，不应被当成残留文件的已证实生产者；未知来源文件可作为待归因证据，不当成该执行的完整输出。

## 下一步建议

保留205542回应/计划原样。可新增一份简短补充计划，逐条给出S01—S06的规范定义和对应验收项，明确其优先于修订版冲突条文，不必重复改写已正确章节。完成后提交到reviews并推送，由用户决定是否开始V10实现及单独授权的隔离实验。

本轮不实施V10，不改V9/V8/V7，不执行发布/恢复/lab或Phase0。静态设计闭合后，V10实现仍需独立审查；计划接受不等于产品/运行通过。
