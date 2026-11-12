# OB-Recover Phase 4.7：V10 补充计划独立复核

日期：2026-11-12（Asia/Shanghai）。性质：补充协议静态审查，不是V10实现验收或执行授权。

## 结论

**暂不按本补充原文开始实施。** 新版已实修接受点先于末次门禁、成员增删备份/回滚、保护deny优先和来源归因等上轮问题；这些不再重复认定未修。但自动隔离死亡reclaim的算法引入新的互斥缺陷，安全分类和停止/收尾表仍有实质冲突。建议按下述T01—T04作最小补正，保留已正确章节。

所有结论来自实际提交文本，不以“6项同意”作修复正确性的证明。CONFIRMED指明确算法分支/文书矛盾；并发后果为INFERRED，未运行实验。V9仍REJECTED，V10尚未实现。

## 输入

提交：`c4a67a1f0e3c10dbed81d28a50ef03efa9dc3d9a`。

| 输入（reviews/） | 字节 | SHA-256 |
|---|---:|---|
| OPENCODE-P47-V10-REMEDIATION-PLAN-SUPPLEMENT-20261112-213859.md | 22553 | e151bd2db25eabd8c56723cb0d29e219d7fbceb47151653fa10cf891115caac0 |
| OPENCODE-P47-V10-PLAN-SECOND-REVIEW-RESPONSE-20261112-213859.md | 8246 | 0b870f595594406389abae8884d7318a5ed9a93563ffa8349a305a4a43bf0428 |

只读取、计算摘要、静态分析，新增本报告；未修改历史文件，未执行交付脚本、发布/恢复/lab、C00—C20、Phase0、浏览器/L1或ACL操作。下文SUP为213859补充；BASE为205542修订版。

## T01｜死亡reclaim隔离仍可移走新的活回收锁

**CONFIRMED算法缺口；P1；阻断按原文实施。** SUP:170-185，尤其:174、:176-177。

算法先读reclaim判死，随后按路径rename，没有把rename的源绑定到先前读取的文件身份。原子rename只保证一次路径变更，不保证该路径仍指向旧死亡对象。

无需执行代码即可推导的交错：

1. A和B都读到旧死亡回收锁R。
2. A把R移到staleA，并硬链接安装自己的活回收锁RA。
3. B继续此前流程，执行rename(LOCK.reclaim, staleB)。源路径现指向RA，rename会成功移走RA，并非必然ENOENT。
4. B安装RB。A、B都可能认为自己持有回收锁，并先后复读同一死亡主锁。
5. A删除旧主锁并安装主锁MA；B的延迟unlink可删掉MA，导致双写者窗口。

即使临近rename再读token，也仍是检查与使用分开的窗口；仅增加一次读不构成条件原子操作。SUP:185的“次数有界不会无限增长”也未由跨调用上界保证。

**最小修正建议：当前版本停止自动隔离既存死亡reclaim。** 对已存在且不能证明为活持有者的reclaim一律保留现场并返回BLOCKED_MANUAL；只在reclaim不存在时原子安装自己的回收锁。人工恢复采用既有无并发/身份/现场协议，未经明确外部授权不执行。主锁死亡且reclaim不存在的受控回收可保留，但必须以稳定互斥所有权为前提。

如确要自动恢复，另交具备对象身份条件的原子算法或可靠OS互斥方案，证明所有获取者、回收者和释放者遵守同一协议；至少新增上述“双回收者同读旧锁，后者延迟到活锁安装后再rename”的区分性测试。不得声称普通rename的原子性已经证明安全。

## T02｜稳定错误码表重新引入了安全分类错误

**CONFIRMED条文；P1；实施前需修正。** SUP:212、:228-240、:250-264、:270、:297-299。

链HASH/SEQ/PAIR/CORRUPT被列为fatal/trigger=null；C00/C03的INPUT-HASH也列fatal/null。这没有落实第十二轮Q02要求的身份/批准工具摘要/链完整性安全分类，只是换成稳定字符串。对“业务数据摘要不符”和“批准运行工具/manifest身份不符”不能共用一个无原因区分的INPUT-HASH归类。

表中gate又带WRITE_DENIED/CHECKER_VIOLATION trigger，与既有security-trigger的类别/null约束不同；新trigger名称与旧SEC-*集合的关系也未声明。allowed_execs要求精确exec，却使用C19/SEAL/C08命令简称并混入PUBLISH/RECOVER/CHECKER管理操作，校验命名空间不明确。

修正要求：

- 按实际原因拆码。安全身份、批准manifest/二进制摘要、链完整性错误归security并绑定明确安全trigger；普通业务gate、普通I/O fatal分开。合法无genesis启动与“已有链损坏/被移除”须区分，不能一概把两者归为安全故障。
- 保留并明确security-trigger规则：security必有注册trigger，普通gate/fatal的security_trigger为null。若需通用诊断标签，另设diagnostic_code，不借用安全字段。
- 采用实际Phase0 exec ID；管理操作单独命名空间/字段，定义code允许主体的精确映射。示例不可直接当正式表。
- 明确registry中trigger集合与稳定code表的版本/摘要及迁移关系，独立checker验证集合、归属和类别语义，不能仅确认生成表自述。

验收必须含C00批准manifest/runtime hash、C03身份、实际链坏hash、普通I/O错误四类；比较code/class/trigger/stop/后续及记录，而非只检查code存在。

## T03｜“后继不运行”与收尾A、finalizer及封存表相冲突

**CONFIRMED合同冲突；P1；实施前需统一。** SUP:43-61、:287-291；仍有效的BASE:217及前序失败目标唯一A规则。

补充把普通fatal、ORIGINAL变化等一律写“后继不运行”，但保留的合同仍要求：实际启动并可信close为失败的目标执行唯一A；非安全目标/baseline fatal可halt-business并保留finalizer。链损坏/orphan禁止A，不能直接推广到所有失败。

同包封存也有明确冲突：普通fatal产生failed close、无open且没有aborted close时，SUP§1.3“无abort但有失败”给degraded-prefix；§5.4“普通fatal有close无open”却给aborted。两份表对同一输入不能同时成立。

修正要求：给出唯一nextAllowed/stop与seal函数，按失败执行class、实际code、可信close、有无open、staged状态及真实停止原因决定。至少分别规定：

- 非安全target/baseline fatal：是否保留halt-business finalizer及其证据包装；与输入可用性/replay一致。
- security但链可信：只允许该失败目标待执行的唯一A和按协议封存；不得继续普通业务。
- 链损坏：拒绝后续链写和权威seal，保存链外非成功证据。
- orphan：无可信close，不跑该目标A；可信前缀如实列open_segments。

若有意取消既有收尾职责，须显式说明范围与全部依赖/报告/向量迁移，不能用一句“不运行”隐式覆盖。新aborted-prefix/exit命名及staged维度也应在schema、文档、flow与checker同步，避免仅改期望摘要。

## T04｜保护对象必须按主体、权限层和生命周期精确定义

**CONFIRMED规格歧义；按字面实现将阻断必要控制写；P1。** SUP:79、:83-99。

把整个审计链目录、工具根都列入protect，再对每个写事件全局deny且只声明C02 ACL例外，没有界定业务/产品与控制层差异。genesis/链追加、own parts/summary、C04受控staging等仍需合法写入。若将新全局deny直接用于这些协议写，合法流程无法运行；若各实现自行绕过，又破坏统一策略。

修正要求：明确“business/product不得借普通allow突破保护”与“协议控制主体的精确授权”两层：

- ORIGINAL、M0、历史基线保持内容只读；既定ACL元数据例外仍限定主体和对象。
- audit-control仅按指定exec/模式、精确链文件/本段目录、CreateNew/append/seal操作授权；业务/产品只可按独立规则创建自己的分片，不能因此改链或别段。
- 工具staging只在批准阶段由指定主体按已批准映射创建；封存/校验完成后不可变。
- 例外为钉扎策略条目，不由事件或scenario自称授权；分别测试合法控制写成功与业务同路径写拒绝。

这是补齐保护范围，不是允许普通删除/改名越过protect。

## 实施规格还应固定的三项边界

下列为可明确限定或在实施规格中补齐的验收要求，不把尚无代码的情况声称为已发生漏洞。

### I01 门禁包与本事务绑定

SUP:133-134、:153只列每gate摘要字段。需定义外层txid/rid/正式new索引摘要、必需gate集合及唯一性、工具/策略版本摘要、每个input_digest的精确canonical输入、实际结果/证据引用。accept/status/recover独立核对缺项、重复、错事务和证据摘要。bundle摘要证明字节绑定，不能单独证明“本事务所需门禁均实际完成”。新版接受点顺序本身已修，不重报原窗口。

### I02 文件与目录前缀转换

SUP:320-324、:340-341先写add/modify再删delete，对old={a文件}→new={a/b}及反向转换会被旧对象阻挡。当前版本可明确在预检阶段拒绝此类转换，或定义先备份、清除阻挡对象、创建新容器及回滚顺序；必须测试。普通文件增删改的delta协议已补，不再重复认定缺删除处理。

### I03 链格式迁移

SUP:21-22把genesis写成seq=0/prev_hash=GENESIS，而既有chain_seq=1/prev_record_sha256=null；补充的schema表未定义完整链记录格式。V10可以有意改格式，但须明确链schema、字段、genesis、canonical字节/LF/prev_file_bytes规则与全量向量同步。也可保留既有字段以缩小改动。不能一边按新简写造fixture，一边沿用旧validator而称信任链闭合。

## 建议下一步

新增简短勘误/约束附录，不覆盖213859或任何历史文件。优先选择T01的保守BLOCKED_MANUAL方案，随后将T02错误码和T03单一状态函数、T04分层策略写成明确规范；同时固定I01—I03的实施选择与对应测试。已正确的硬链接初次获取、结果口径、copy/rename拆分、最终接受时序、成员delta无需重写。

本轮不制作V10，不运行任何实验。用户可在这些约束明确后另行决定是否授权V10实现和只写新scratch目录的实验；该授权与Phase0/旧版本执行无关。最终实现必须按实际代码/证据接受下一轮独立审查。
