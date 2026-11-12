# OB-Recover Phase 4.7：V7 第十轮独立审查

日期：2026-11-11。
审查目录：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V7\
性质：独立、只读；仅在上级目录新增本报告，不修改V7或历史文件。

## 1. 结论

**REJECTED。V7仍不具备申请启动Phase 0的条件。**

V7确实修复了V6的32处allow/deny交集、16个staged入口自读错源、C06缺guard policy，以及正例中的index.json双摘要和C19入口/argv错误。本轮独立复算确认这些变化，不依赖OpenCode自检。

仍然存在以下实质阻断：
- 依赖闭包会跳过失败目标自身必须运行的after取证；后续before、M1和C17仍要求已跳过任务的成功close。
- 9个runner环境指向RUN\tmp，却没有该目录的业务写许可。
- C01仍缺AUDIT\C01中间目录创建许可。
- security-stop固定转degraded-prefix，但该模式仅允许staged未完成，无法覆盖完成staged后的安全失败。
- 绑定文件路径在契约中有两种定义，后续读取者缺实际binding文件许可。
- 生成器仍逐文件直接覆盖，回滚异常被吞掉，不能保证发布失败不会留下混合版本。
- 审计检查器虽然独立于生成器，仍未实现完整字段、权限和因果校验。

**N01—N12统计：0 CLOSED / 5 PARTIAL / 7 OPEN。**
PARTIAL：N01、N02、N03、N07、N11。
OPEN：N04、N05、N06、N08、N09、N10、N12。

上述统计针对第九轮的12项问题，不把新发现另外加入分母。设计/生成层修正与未交付运行层分开：本轮没有任何运行时动态通过结论。

## 2. 输入哈希与版本完整性

先读取交付清单，再逐文件读取原始字节计算SHA-256、大小、行数。V7实际有21个文件：10份契约、10个生成/检查工具、1份清单。清单登记的20个条目全部匹配；没有额外子目录或缺失项。清单本身无自引用摘要，单独记录。

所有下表文件的绝对路径前缀：
C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V7\

| 文件 | 字节 | 行数 | 独立SHA-256 |
|---|---:|---:|---|
| PHASE4.7-PHASE0-START-CONDITIONS-V7.md | 94871 | 362 | f7fb35cddc82197aaeb6f23efcbf99e1356a2983fa71af108a390ef40b0e2bc5 |
| PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv | 212732 | 59 | a6473b6088d6059f89e3d3d4bcac1599668bd4ad4e8993c30c055dbc928d8aa3 |
| PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json | 897850 | 24828 | a5c00b6698dac585159296965c4f9a3c7afa8b13b22ec0af17cd540f54c50695 |
| PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md | 21649 | 440 | b060bea60bdcc39cd499dc8df44de63e2bd29f05c7f95a962c497a77bc2cfe8d |
| PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json | 20324 | 1 | 3d4bd77841d3ebf9e8b46935b17b5d65d42a385a3222bc846c2b15fde8b86f07 |
| PHASE4.7-PHASE0-V6-TO-V7-CHANGELOG.md | 7781 | 99 | 092fcf82ca4ca979ab76cf4ac245bb9d1ee3354521e151d64e54355bf1b6f53c |
| PHASE4.7-PHASE0-V7-N01-N12-TRACEABILITY.md | 8773 | 143 | d44ab83da93aac5d8f8f8bbdf0921b7ca6220c12e6bef61c588a75adf93e7cd2 |
| PHASE4.7-PHASE0-V7-OPEN-ISSUES.md | 3613 | 53 | 0b882db0ac4f0e5d5adc0ad109eef8bcc64be74d0fb00af7f221b491426ee75d |
| PHASE4.7-PHASE0-V7-SELF-CHECK.md | 3633 | 67 | d70e91f7d44bd603f15d50104c98640a89664a7f1e691f5f4d59e1ba920226a7 |
| PHASE4.7-PHASE0-V7-RUNTIME-TOOLS-STATUS.md | 3204 | 42 | bfc6dd40842739b77c80d22ffb172c5e64ca96810c6d713592b3188257a92367 |
| p0v7-lib.cjs | 5702 | 128 | 8d2d433917efeff7851b56e1fe5e368f9400b100f71a883aee3c077d52ce5a96 |
| p0v7-spec.cjs | 41890 | 565 | 4d240971d58c3144f340e973e1b526bab6355348ff207a685c3140475cbd0e2b |
| p0v7-audit.cjs | 23100 | 291 | 989761705139268ffffd287f5913295738871c9a8f081f60d24c93ddd3eb2e51 |
| p0v7-build.cjs | 31683 | 492 | 67712a0703671d5402475a3c345736afb6a98c3dff3bb2bd1870af1978b03116 |
| p0v7-check.cjs | 26309 | 401 | 4fa6487e043ca6c7d881157633507287c5ae9d519b286fc09c43b7573435897d |
| p0v7-verify.ps1 | 6967 | 102 | 7a03128826efa2c7a23e359e9a330852ac97cefd0b8dc06b7ccda83daa65fdd5 |
| p0v7-parse-inline.ps1 | 1160 | 27 | 609a5254ec03923e40c05caecccb465b7a582522d88a957eead503bba3fe8031 |
| p0v7-hygiene.cjs | 4250 | 64 | 3dff7fa46458e97049c91299a85f9be4b263281b710b0279fb8d17b26deaac00 |
| p0v7-controlconfig-check.cjs | 764 | 15 | a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390 |
| p0v7-manifest.cjs | 3912 | 98 | 79ef74533a8ead85c2f07383739bd830dbe92f6ee50ca49856d2d61315d1ff8f |
| PHASE4.7-PHASE0-V7-DELIVERY-MANIFEST.md | 3888 | 65 | 882a1f0a5e65c1f23cd1103038b40ea588c04ca777708596f8da50a55bac065b |

第九轮报告：
C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\CODEX-P47-PHASE0-V6-NINTH-INDEPENDENT-REVIEW-20261111-195127.md
独立测量41125字节，SHA-256 f984376211f17c9cdd7b07d85b701ef9a6c2d6f8c01773232e3e4e4585584383，与用户提供值一致。已对照其N01—N12原文，未用V7追溯表替代。

哈希匹配说明本轮审查的是交付清单绑定的字节，不证明外部批准、文件后续不可修改或方案语义正确。

## 3. 独立方法与结果

本轮没有执行或import任何p0v7脚本。自行通过stdin运行只读文件读取、JSON/TSV解析、规范化/摘要和图关系分析。内联脚本和源文件语法只用解析器检查，不求值。

| 检查 | 本轮独立结果 | 能证明什么 |
|---|---|---|
| 交付完整性 | 20/20清单条目匹配，清单另测 | 当前输入字节身份 |
| JSON/TSV | 可解析；58行×33列＝1914格与注册表投影一致 | 字段投影一致，不代表全部权限正确 |
| 命令/计划 | 21命令、58执行；绑定58/未绑定55 | 正常计划结构 |
| 顶层/产品argv | 58个argv、8个target摘要均匹配；inline摘要绑定正确 | 文本身份，不代表子进程实际执行 |
| 读权限交集 | 全部business/product双向交集0 | 当前登记路径集合的交集消除 |
| self-read | 56个非inline入口均含实际entry_path，16个staged错源已修 | 登记正确，实际同字节加载未证 |
| policy摘要 | 48个guard、8个product摘要可复算，包括C06 | policy文本身份，不代表guard实施 |
| Windows路径 | 当前绝对路径经win32规范化未见不一致 | 不涵盖真实重解析、硬链接、8.3等别名 |
| 正向向量 | 16个canonical/字节/SHA一致；旧index/入口错误修复 | 序列化与已查关系，不等于全协议合规 |
| 负向向量 | 12份实际canonical输入可解析、名称唯一 | 已有真实输入；完整拒绝语义仍需审查 |
| 失败闭包 | C10-P失败产生17个skip，含自身after | 发现声明与执行图冲突 |
| 语法 | 8个CJS、2个PS1及2条inline仅解析通过 | 语法，不是执行/故障注入 |
| 运行工具 | 发布根不存在；20个映射payload均未找到 | 本次交付未提供运行实现 |

OpenCode自检720/0、PowerShell75/0、两次build幂等属于历史声明。本轮读其源码，但没有重跑，也未把这些数字当独立通过项。**本轮没有执行发布故障注入、真实writer/guard、进程终止或恢复实验；全部UNVERIFIED。**

## 4. N01—N12逐项结论

行号均对应本轮哈希版本。M=START-CONDITIONS-V7.md，A=WRITE-AUDIT-SPEC-V7.md，R=注册表；源码简称为同目录文件。

| 项 | 状态 | 独立确认的修复 | 剩余问题与源码依据 |
|---|---|---|---|
| N01 权限双向交集 | PARTIAL | build:59—81用覆盖与双向相交；原32项归零 | 真实路径/guard未交付；当前静态登记已通过 |
| N02 self-read | PARTIAL | build:100改成e.entry_path；16staged入口正确 | FileShare.Read与实际装载字节一致性未运行验证 |
| N03 C06 policy | PARTIAL | spec的C06已guard=true；R.guard非null且摘要正确 | 只是可供执行的policy，实际guard缺失 |
| N04 审计角色/目录 | OPEN | OBS/product角色、53个普通participant父目录和C01业务链许可已修 | genesis C01仍缺AUDIT\C01；build:116—124没有父目录，而:129仅普通participant有 |
| N05 环境/dist | OPEN | 产品env与runner分开，预载/产品分片和dist排他许可已登记 | 9runner指向RUN\tmp却无其写许可；spec:433与各TARGET.outputs不一致 |
| N06 向量/validator | OPEN | index摘要、C19入口/argv、负例实际输入已修 | check:105/:114—132/:144—153仍漏字段枚举、读取权限和因果校验；完整拒绝未证明 |
| N07 安全优先级 | PARTIAL | R及spec明确security优先并登记触发码 | 分类执行器缺失；不能把规则文本当实际升级成功 |
| N08 依赖闭包 | OPEN | 增加deps/segment_skip/report_exempt | spec:455把after设成功依赖；闭包跳过失败目标after；before/M1/C17门仍不兼容skip |
| N09 中止/封存 | OPEN | 按staged_state区分模式，OBS回收已说明 | audit:126把所有security-stop转degraded，而M:65仅允许未完成staged；开放OBS段收尾责任不完整 |
| N10 绑定交接 | OPEN | CreateNew文件、C18不重读env、BINDING读回token | build:343仍写controls路径，实际binding路径；C19/REPORT/SEAL没有实际绑定文件读许可 |
| N11 对象/类型 | PARTIAL | C04空根与16FC分开，ML恢复map-list | 静态修复确认；实际CreateNew/映射执行未验证 |
| N12 发布/检查可靠性 | OPEN | build先完成内存产物；check不再import生成器 | build:478仍原地逐文件覆盖；:481吞回滚失败；原子与故障恢复声明不成立 |

统计：**CLOSED 0，PARTIAL 5，OPEN 7**。PARTIAL项目不是否认代码修正，而是其运行时责任尚未交付和验证。

## 5. 明确未闭合问题及最小反例

### 5.1 N04：genesis仍漏审计中间目录（P1，CONFIRMED）

M:48要求每个参与者登记AUDIT\Cxx中间目录。
build:116—124的genesis分支只给：
- 链头create/append。
- AUDIT\C01\C01-E01目录。
- 该目录下summary。

缺少AUDIT\C01。普通participant分支:129才有dir-create-if-absent；C01只创建AUDIT根及OUT\C01，不是AUDIT\C01。严格目录许可不能用递归创建隐含补父目录。
check:296仅遍历chain_role=participant，因此漏掉genesis。

修复：给C01明确的审计父目录创建责任，检查器覆盖genesis与普通participant。真实执行未运行。

### 5.2 N05：环境分开，但runner临时目录不可写（P1，CONFIRMED）

spec:433把各目标runner的TEMP/TMP设为RUN\tmp；:434才把产品环境设为COPY\tmp，这是正确方向。
但下列9个执行的writes.business仍只有COPY\tmp，没有RUN\tmp：
C10-P、C10-N、C11、C12、C13、C10-S、C14、C15、C16（均E01）。

例如C10-P实际R.required_env.TEMP=RUN\tmp，而R.writes.business和guard.write_allow不覆盖该目录。严格guard会拒绝runner合法临时文件；不使用临时文件的个别路径可能不触发，但合同仍缺必要许可。
修复：按父/子进程分别登记唯一TEMP/TMP与对应写域，检查器从环境路径反查写许可，不能只比较env字符串。

### 5.3 N06：旧正例已修，完整验证器仍未实现（P1，CONFIRMED）

已复算的正例改进：
- index.json的write_result.after与summary.outputs都为同一1536字节与a×64摘要。
- C19入口、args_sha256等于实际注册表。
- genesis物理行574字节；open.prev=574，close.prev=1234，skip.prev=2203。
- 三事件JSONL为1793字节，SHA-256为039d13f30a33906497ca1d159a29b30fc4313bd36022a9be0252f7b2613f043c。
- 16个正例的canonical、字节数与摘要均独立匹配。

但check.validateEventArray仍有明确缺项：
- :105仅要求role为非空字符串，没有验证A规定的角色枚举。
- :129—132只判断entries是数组、counts是对象，没有逐条检查read路径、rule_ref、允许/禁止范围、结果计数及hash。
- :114—127没有验证after、durable、bytes_written的类型与outcome关系。
- validateRecord:144—153不验证record与所选kind一致、注册exec、数值类型、时间、failed_dependency是否确实失败。
- 没有完整业务写rule_ref解引用检查。正例中的具体两条引用可由本轮人工核对，不代表检查器具备普遍验证。

静态反例：把合法事件role换成另一非空字符串，或把read条目路径改成ORIGINAL并重算链摘要，以上代码没有对应拒绝分支。**本轮未运行该突变程序，结论是源码缺少检查，不是已实测绕过。**

12负例有实质改善：不再使用缺event_id基底，跨exec样本已有来源intent，输入canonical实际交付。
但“恰好一个错误码”只针对检查器实现的规则：错误集合用Set，多个同类错误可折叠为一个；不能证明完整协议只有一处错误。

LF负例:195—200不再恒假，确实读取交付对象再比较；它仍是包装对象中的line/declared-byte关系测试，不是将真实截断JSONL字节流送入writer/恢复解析器。真实部分写、崩溃恢复和故障注入UNVERIFIED。

修复：建立与规范一致的字段类型/枚举/权限/因果规则；负例从完整合法基底逐项变更并明确故障边界。不得只把“720”增加成更大的数字。

### 5.4 N08：跳过失败目标的after，报告路径仍被成功门阻断（P1，CONFIRMED）

M:56要求失败目标运行一次C07-A。
spec:455却把所有after设为deps=[target]。
build:330—334对失败依赖传递跳过，只有四个报告节点豁免。

本轮用R.deps独立计算C10-P失败闭包，结果是17个执行：
- 8个目标：C10-N、C11、C12、C13、C10-S、C14、C15、C16。
- 9个after：C07-A-C10-P及上述8个目标的after。

因此失败目标必须运行的after本身会被跳过，与取证要求冲突。追溯表称“8个依赖者”只数目标，漏掉after。
check:331—333只确认8目标在集合、报告不在集合，没有断言集合仅这些目标或after可执行。

另外：
- before的deps为空，不随目标跳过，但spec:457仍要求previous exec sealed ok，前驱为segment_skip时不满足。
- M1的spec:480仍要求C07-A-C16 sealed ok，该after可能已skip。
- C17的门仍要求S5—S7各目标有terminal segment_close；segment_skip明确没有该段/summary，也不是close。
- report_exempt只豁免是否跳过，不能覆盖这些实际门条件。

修复：分开“依赖成功”与“依赖终结”；失败目标after必须走终结依赖。对被跳过目标的before/after、M1、C17分别定义有效终态与证据责任；不能为了可达而放宽安全成功条件。

### 5.5 N09：封存模式选择与安全失败冲突（P1，CONFIRMED）

audit:126给所有security-stop指定C20-SEAL degraded-prefix。
M:65、R.plan.failure_policy.seal_modes却限定degraded-prefix用于staged_state=incomplete/absent。

最小反例：C12发生禁止写成功，此时staged已由C05-FINAL验证complete。必须security-stop，但指定degraded模式条件不成立。
应由实际staged/chain状态选择sealed状态完整的aborted、未完成前缀的degraded-prefix或chain-broken，而不是安全等级固定对应一个模式。

OBS回收虽然补了kill/EOF/900s规则，强制kill后可能仅有segment_open而没有close；spec:502/:503的SEAL仍要求终态close。M写summary_state=missing没有定义谁以何种权限、字段和真实性依据封闭该开放段。实际是否阻塞未运行，标UNVERIFIED；收尾责任缺项属于静态问题。

### 5.6 N10：不可变绑定文件仍有路径与权限冲突（P1，CONFIRMED）

实际路径由lib:18及spec:489定义为RUN\binding\c18-binding.json。
build:343生成R.plan.failure_policy.binding_handoff仍写controls/c18-binding.json。两者不是同一路径，不可由实现者任选。

M:83及该字段又要求C18及所有后续消费者只读绑定文件；C18已获精确许可，C19、C20-REPORT、C20-SEAL却均没有RUN\binding或该文件的read许可。OUT/AUDIT/EVIDENCE/TRUST不覆盖binding目录。
修复：确定唯一绑定路径并进入共享定义；为真正消费者精确登记读取或明确只消费已验证的链记录，不能同时要求读文件又不给许可。

CreateNew解决初始覆盖，不等于后来不可修改。真实文件锁、摘要复核、元数据重解析、父目录替换与归档目标读回实现仍未交付，保持UNVERIFIED。

### 5.7 N12：仍是逐文件覆盖和尽力回滚（P1，CONFIRMED；故障注入UNVERIFIED）

M:94承诺任何发布异常回滚、不留下混合版本；追溯表和未决清单也称原子发布已实现。

实际build:475—485：
1. 在内存保存旧字节。
2. :478循环fs.writeFileSync(p,b)，原地覆盖五个目标。
3. 异常后循环写回旧内容；:481把任何回滚异常吞掉。
4. :483仍打印“publish failed and rolled back”。

代码没有按版本目录提交、整体指针切换、恢复journal或持久化备份；连逐目标临时文件替换都未使用。进程在写到第二个文件时终止不会进入catch；某个回滚写失败会留下混合版本，却仍声称已回滚。这里确认实现不能支撑承诺，未声称本轮实际制造了损坏。

manifest工具:88—90对单清单使用temp+rename，与build五文件事务是不同问题；:92的恢复写同样忽略异常，不能提升整个包的原子性。

两次正常build幂等只证明正常重跑字节相同，不是故障注入。本轮及已提供证据没有真实中途失败、kill、磁盘错误、恢复失败的验证。全部UNVERIFIED。

修复：选择可评审的版本化发布/提交点/恢复协议，明确Windows同卷条件、失败保留和回滚失败状态；故障注入只能在另行授权的隔离实验中进行。本轮不执行。

## 6. 全部源码审阅范围与职责

已完整阅读10个源码，不只读取函数名。它们都位于输入表绝对前缀下。

| 工具 | 实际行为与关键位置 | 本轮结论 |
|---|---|---|
| p0v7-lib.cjs（128行） | w:6、路径/TOOLS:8—80、canon:83—116、hash:118—120 | 固定数据与规范化库；不是OS路径/文件身份安全器 |
| p0v7-spec.cjs（565行） | ex/执行表、TARGETS、DEPS/SEC、wrap:443、BIND:485、SEAL:496 | 规则定义有改善；失败依赖/环境/交接尚冲突 |
| p0v7-audit.cjs（291行） | schema、FAILURE_STATES:123、buildVectors:148 | 生成schema/样本；不执行append/fsync/恢复 |
| p0v7-build.cjs（492行） | denyFor:59、self:100、role:133、product:155、发布:475 | 当前读交集已修；环境/目录/失败发布仍有缺项 |
| p0v7-check.cjs（401行） | 独立canon:22、validator:88、negative:191、closure:320 | 不import生成器属实；仍有语义覆盖缺口 |
| p0v7-verify.ps1（102行） | hash:13、向量:28、物理链:42、argv:74 | 独立字节/参数复算；不验证完整schema和失败执行图 |
| p0v7-parse-inline.ps1（27行） | Parser::ParseInput:14 | 只解析；未见求值/子进程/写文件路径 |
| p0v7-hygiene.cjs（64行） | core:8、历史map:22—54、读/hash:55 | 只读字节卫生和历史摘要，不防止后来修改 |
| p0v7-controlconfig-check.cjs（15行） | 固定模板:3—12、摘要:13—15 | 只证明固定字符串325字节，非实际Vite语义 |
| p0v7-manifest.cjs（98行） | row:26、文件清单、temp/rename:85—94 | 生成清单会写文件；不验证被列文件语义或整体发布事务 |

路径处理仍以固定绝对路径、分隔符替换和大小写比较为主。当前登记未发现相对路径/不规范化绝对路径，不能由此宣称运行时处理了所有符号链接、junction、短路径、subst、硬链接或已开FD。
检查器没有import生成器不等于其规则天然完整；本轮独立复算和上述反例正用于检验这一点。

## 7. 运行时工具交付状态

实际目录中只有21个清单文件，没有payload子目录。R.release.source_root=D:\P47TOOLS\p47-phase0-v7不存在，映射20个payload实际存在数为0。

| 类型 | 当前交付状态 |
|---|---|
| 实际生成/检查源码 | 上述10个p0v7工具已交付并完整审阅 |
| dispatcher / verifier运行实现 | 只有接口、入口和合同引用；未交付源码 |
| p0-audit.cjs运行实现 | 只有规范、schema和向量；未交付append/锁/恢复实现 |
| fs-guard.cjs运行实现 | 只有policy与预载合同；未交付 |
| init/acl/stage/observe | 只有bootstrap接口合同；未交付 |
| copy/archive/product-run/neutralize/compare/index/report | 只有执行登记与接口；未交付 |
| 正式发布manifest及批准摘要 | 未提供 |
| 全机其他未列位置 | 本轮不作“绝不存在实现”的推断；结论针对V7交付与正式发布根 |

RUNTIME-TOOLS-STATUS.md明确声称这些运行工具未实现。本轮独立能确认的是交付/正式路径缺失，不以生成器、checker或文书充当运行实现。运行时尚无可审代码，本身就是实际启动前的阻断。

## 8. 新发现、残余风险与整改清单

| 项目 | 等级/证据性质 | 必须完成的具体动作 |
|---|---|---|
| 失败after进入skip闭包 | P1 / CONFIRMED | spec.deps区分成功/终结；check断言精确skip集合、失败after仍执行 |
| before/M1/C17不能消费skip | P1 / CONFIRMED | 定义每类终态与顺序门，不伪造close/summary |
| RUN\tmp未授runner写入 | P1 / CONFIRMED | 从required_env逐条反查write_allow，补9个执行的父进程专用域 |
| C01审计父目录缺失 | P1 / CONFIRMED | genesis路径检查与普通participant统一覆盖 |
| security-stop模式不匹配 | P1 / CONFIRMED | 按staged/chain状态决定模式，覆盖“late security failure” |
| binding路径冲突/后续读缺失 | P1 / CONFIRMED | 共享唯一常量，明确消费者和精确许可 |
| validator不完整 | P1 / CONFIRMED | 增加类型/枚举/权限解引用/因果检查与有区分力反例 |
| 控制层读取分片的合同 | P1 / 待明确 | A要求seal读分片和摘要，R.reads.control仅CHAIN；明确同段读取或可信IPC来源，不能取业务权限并集 |
| 发布回滚错误被吞 | P1 / CONFIRMED | 可恢复提交协议、回滚失败显式记录、禁止伪称恢复成功 |
| 真实故障注入 | UNVERIFIED | 单独授权隔离实验后检验；正常幂等不代替 |
| FileShare.Read/实际装载 | UNVERIFIED | 运行器交付后核对句柄生命周期、校验到执行窗口 |
| 真实并发/FD/原生/链接/ACL | UNVERIFIED | 运行器源码+授权后的边界验证 |
| 外部批准输入 | OPEN | 正式payload/manifest、SID与Codex账户、运行范围授权；第二归档属出口输入 |

控制层读取分片问题是合同范围待明确，不据此宣称真实运行必然失败。也没有把同账户可写能力直接写成已发生日志伪造；真实不可篡改、外部锚定、并发和崩溃行为均待验证。

修复建议限于上述已有缺陷。不得因审查结果擅自放宽verified、outer-state-write、status-unstable、throwOnSideEffect或项目既定安全指标；不改已批准D3/D4/D10/D12/D14/D15。R05/R16仍OPEN、R01仍PARTIAL，V7没有产品实现/验证证据可改变这些状态。

## 9. Phase 0准入与停止声明

分层结论：
1. **代码已实现**：生成器和静态检查工具已提供，部分旧问题实际改了代码。
2. **静态验证通过**：当前输入身份、字段投影、argv摘要、读交集、自读路径、部分向量关系通过独立复算。
3. **静态未通过**：第5节失败闭包、许可、封存、绑定和发布保证仍有明确缺陷。
4. **动态验证通过**：本轮无任何此类结论。
5. **仍未验证/交付**：运行器、guard、writer、ACL、fork、FD、故障注入和封存恢复。

必须先修OPEN项、补交真正运行工具并独立审查，再完成外部批准输入，由用户另行决定是否授权有限Phase0。仅接受报告或静态修复不等于启动授权；SECOND_ARCHIVE未绑定不能宣告Phase0完成。

本轮未执行p0v7-build/check/verify/manifest或任何交付脚本，未执行C00—C20、Phase0、产品测试、构建、浏览器或L1；未创建D:\P47RUN/D:\P47TOOLS，未修改ACL、V7、旧版本或历史报告。仅新增本独立报告，并在写入后单独复算其元数据。

**审查结束，结论REJECTED；保存报告后停止，等待用户决定。**

