# OB-Recover Phase 4.7：V10 静态实现准入约束

日期：2026-11-12（Asia/Shanghai）。性质：对215522勘误的独立复核与受限实现建议，不是V10验收，也不是Phase0授权。

## 结论与范围

**可作为有条件的静态实现基础，但不能照215522冲突原文直接实施。** 在唯一执行规格中落实下述H1—H5，并经用户授权后，可进入V10契约工具、schema、向量和独立检查器的静态实现；下一轮直接审实际源码与交付，无需为已明确的修正重写整套计划。

这不是声称H1—H5已经修复。若无法满足某条，保留BLOCKED与具体原因，不自行放宽或宣称通过。当前仍无V10实现证据；V9维持REJECTED，F/N/R评级不因计划文字变化升级。

本轮未实施V10，未执行交付代码、发布/恢复/lab、C00—C20、Phase0、ACL、浏览器/L1。仅读取输入、计算摘要、静态分析并新增本文件。

## 输入身份

提交：`45c2017b213915577527c1bdb37e758969b0c7df`。

| 输入（reviews/） | 字节 | SHA-256 |
|---|---:|---|
| OPENCODE-P47-V10-ERRATA-APPENDIX-20261112-215522.md | 16013 | a2f1fcc4ccbc6d6a41db1e9739740a2cfd48ec858cf608b63c4769409958a948 |
| OPENCODE-P47-V10-SUPPLEMENT-REVIEW-RESPONSE-20261112-215522.md | 8811 | 9fd64bcd893595df879b5574a638e5ab00d3cf176b0cb617108796112248c312 |

已确认改善：死亡reclaim改为BLOCKED_MANUAL，不再自动rename接管；安全trigger与管理操作命名空间重整；保护已分层；最终接受点在必需门禁之后；成员增删备份恢复已定义；file↔dir前缀转换预检拒绝；链格式选择保留V9。这些方向已成立，不重复报告为未修。

下面CONFIRMED仅指文本矛盾/缺项；实施后果是静态推导，未执行故障。

## H1｜合法skip/open尾不能再触发旧的“必须close尾”错误

**CONFIRMED直接冲突，P1；实施前必须修正。** 勘误:71与:129、:144、:152，以及保留的213859链前缀规则。

`FM-C20SEALE01-02`仍被定义为“尾不是segment_close → SEC-CHAIN-MISMATCH”，但合法skip尾及有orphan的open/skip尾明确允许按可信前缀封存。使用这个旧谓词会把合法中止证据误判为corrupt，禁止本应生成的aborted封存。

硬约束：退役旧的“任何非close尾就是坏链”谓词，或在版本化错误表中明确收窄为实际非法链结构。链损坏由完整记录/字节/哈希/状态重放推导；合法tail=skip/open不是损坏的充分条件。保留无genesis/已有链被移除的区分。不得只把旧条件重新标security而不改变判断。

验收：合法close、skip、open、open后skip均分别验证模式与开放段；坏hash/seq/配对非法才按安全完整性错误处理；无可信genesis不生成权威seal。

## H2｜停止策略必须同时使用失败类与执行类

**CONFIRMED直接冲突，P1；实施前必须修正。** 勘误:121、:126-137。

输入虽列exec_class，表却把所有非安全gate/fatal统一为BUSINESS_HALT。这样既会错误跳过gate后的独立目标，也会在infra/before/after/finalizer等fatal后继续finalizer。它没有保持先前的停止与失败后收尾合同。

硬约束：采用单一函数/矩阵，至少区分：

| 实际情况 | 停止与允许后继 |
|---|---|
| 非安全gate | CONTINUE；只按依赖传播skip，独立目标继续，失败目标唯一A保留 |
| 非安全fatal，target/baseline | BUSINESS_HALT；失败目标可信close时唯一A，允许经输入/包装规则验证的finalizer及明确的bind/seal职责 |
| 非安全fatal，infra/before/after/finalizer/bind/seal | HALT_ALL或更严格停止；不得再启动普通业务/finalizer；仅满足合同的待执行A及可用封存 |
| pre-run/genesis失败 | 未可信建链则只保留launch/no-chain证据，不伪造skip/open/close，不启动finalizer |
| security且链可信 | SECURITY_HALT/HALT_ALL；只允许失败目标可信close对应的唯一A与受限封存 |
| 实际链损坏 | CHAIN_FATAL；不再链写/权威seal，保存原链与外部非成功记录 |
| orphan | ORPHAN_HALT；该目标不跑A，不补close，可信前缀如实记录open_segments |

停止能力必须只收紧、不回退；A失败不产生第二个A，不因普通fatal降低已发生的security停止。单一seal函数消费真实最终状态、开放段、staged状态、index/report及完整计划条件，而非仅看最后一次failure_class。

V10对sealed-full/degraded-prefix等模式的有意变更须在执行规格、文档、flow、schema、checker及向量同步，不能把新mode语义与V9旧断言混用。合法gate继续不等于exit=complete。

验收至少有：C11 gate后独立C12仍可运行；C08 fatal后报告路径按规则处理；C02/C06/before/after/finalizer fatal不继续finalizer；security后A再fatal不降级；C00/C01失败无伪链；orphan不补close。

## H3｜summary必须先于引用它的close创建并验证

**CONFIRMED直接顺序冲突，P1；实施前必须修正。** 勘误:167及I03保留的V9链格式。

控制表将summary的创建生命周期定为“close后”，而V9 segment_close必须绑定summary_sha256和summary_bytes。正常close不能引用尚未创建/验证的summary。

硬约束：**业务进程结束 → 冻结并验证parts → 本段audit-control以CreateNew创建并验证summary → append segment_close绑定summary字节/摘要**。close后summary只读。创建失败按真实失败/summary缺失合同处理，不预填假摘要。

明确每段summary由受信dispatcher/audit-control代表本exec生成；C19不是其他段summary的统一事后创建者。C19的index与其本段summary分别登记路径/主体/生命周期。业务/产品不可借新增控制权限写别段或链。

验收：缺summary、错summary摘要、close后篡改都被拒；合法parts→summary→close可通过；不得通过放宽summary必填规则消除顺序矛盾。

## H4｜门禁调用集合用复合身份，不能仅按gate_id去重

**CONFIRMED身份定义冲突，P1/P2；在实现规格中必须固定。** 勘误:198-206与仍有效的S03门禁顺序。

同一checker需要staging/pending/accepting多次检查，同一verifier需要release/accepting检查。若gate_id只是checker/verifier，仅按gate_id去重会拒绝完整证据，或迫使保存者丢弃部分模式。

硬约束：使用唯一gate_invocation_id，或明确以`(gate_id,mode,subject_id)`为完整集合/重复键。必需调用集合从钉扎的协议配置独立派生，不能仅比较bundle内两份同源自述列表。每次调用绑定本事务、正式索引、工具/策略摘要、canonical输入与实际退出/证据。

验收：三个不同mode的checker各一次应通过；缺任一mode、同调用重复、额外未批准调用、错subject/mode/事务/证据均失败。明确重复运行/重试的协议和计数，不能用最后一次PASS抹去既有失败。

## H5｜failure_code投影必须证明唯一或显式携带真实码

**CONFIRMED合同缺项；是否已有实际碰撞UNVERIFIED；交付前必须验证。** 勘误:103-113。

`derive(exec_id,exit_code,class,trigger)`被要求唯一，但没有完整的每模式exit_code映射。不同原因可能共享这些字段；不能从“歧义就拒绝”推导合法失败路径一定可识别。

硬约束：实施时明确选择并交付其中一种方案：

1. 完整钉扎的四元组→唯一code表，正向模式映射及全表唯一性检查证明全部预期分支可投影；或
2. 原生产者显式给出真实code，放在明确schema且受本段摘要/记录绑定的元数据或旁证中；checker验证它与实际exec/退出/class/trigger一致。

保留`p47-chain-record-v9`时，不得偷偷给闭合schema追加字段又宣称格式未变；若采用旁证，交付其字段、路径、生产主体、冻结时机和链/summary摘要绑定。无close的launch/operator记录保持非权威失败证据。未知/歧义必须拒绝，但应有有效分支正例，不能让所有异常都拒绝而称覆盖成功。

## 建议的受限实施方式

如果用户决定推进，可把H1—H5写入一份唯一执行规格汇总，明确优先于215522冲突条文，然后直接进入V10静态实现。实现前无法落实的条款应报告BLOCKED，不自行选择降低安全约束。后续审查以实际代码/数据为准。

范围建议：

- 唯一新版本位置`phase4.7/V10/`；新增回应/实现报告在仓库根`reviews/`，使用新时间戳并提交推送。
- 可编写契约源码、schema、生成输入、独立检查器、向量和测试/实验设计；可做只读解析、独立哈希、语法解析及经确认无进程/文件副作用的纯内存验证。
- 现阶段不运行具有文件写入/进程故障副作用的生成器、发布器、恢复器、lab；不以模块import绕过这一限制。需要生成正式文件时先明确拆出无发布/恢复副作用的纯生成入口及允许的输出根，按授权范围执行。
- V9/V8/V7、历史报告、产品源码/测试/依赖/锁文件/dist保持不动；不运行旧版本工具、C00—C20、Phase0、ACL、浏览器/L1。
- 真实scratch发布/恢复/崩溃/并发实验仍需用户单独授权。未运行列NOT_RUN，未测量列UNVERIFIED，实际失败列FAILED，不伪造PASS。
- 交付Q01—Q14、P/S/T问题和H1—H5的源码位置/证据映射、完整成员/输入摘要、未决限制；完成后停止，等待下一轮源码审查和用户决定。

**本意见仅建议有条件进入静态实现；不是接受勘误原文、不是认定V10修复通过，也不代替用户授权。**
