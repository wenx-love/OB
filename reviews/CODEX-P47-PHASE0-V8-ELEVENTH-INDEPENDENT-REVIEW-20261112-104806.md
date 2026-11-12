# OB-Recover Phase 4.7：V8 第十一轮独立审查

日期：2026-11-12。审查目录：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V8\
范围：26项交付、执行模型、审计系统、权限、发布与回滚及既有证据。
性质：只读独立审查。仅新增本报告，不执行V8工具、C00—C20、Phase 0、产品测试、浏览器或L1。

## 1. 结论

**存在新的设计缺陷。整体结论：REJECTED，当前仍不具备申请启动Phase 0的条件。**

V8修正了多项V7问题：C01审计父目录、runner临时目录读写、绑定文件路径/读取、显式requires状态、失败后after、传递跳过和late-security封存模式，均有实际源码变化。新增发布器也实现了备份、日志和恢复流程，不再只是普通覆盖循环。

但本轮确认了以下实质缺陷：
1. 20个失败矩阵场景允许sealed-full含失败/跳过，违反同包审计规范；15个no-chain场景却产生链记录。
2. C07发现原项目变化或证据链断裂仍按普通fatal处理；停止级别与具体安全原因映射并未完全闭合。
3. optional_reads在TARGETS转执行记录时丢失，报告路径可能被要求读取根本未产生的文件；source执行错误登记了尚未存在的staged verifier。
4. 审计validator仍漏查操作权限类型、未配对intent和预载policy身份；已有正例的预载policy不匹配登记值。
5. 提交后独立检查失败调用recover可能继续保留新版本；新发布还会覆盖未恢复的事务日志/备份。
6. status/recover没有完整复核不可变release内容，且fault lab仅保留通过计数，缺少可独立复核的逐场景证据。

当前磁盘状态与失败路径结论分开：**26个交付文件与清单/当前发布指针均一致，未发现本次读取时已损坏或混版。** 上述拒绝是根据源码和已发布矩阵中的矛盾，不是声称本轮运行已经发生故障。

运行时dispatcher/verifier/audit/guard及业务payload仍未交付。flow和审计fixture是模拟/静态工具，不是运行实现。

## 2. 输入身份与26项交付

### 2.1 独立哈希核验

以下所有文件的绝对路径前缀为：
C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V8\

先读取交付清单，再独立读取原始字节。清单登记的25个条目，其大小、行数、SHA-256全部匹配；清单本身单独记录，并与CURRENT.json交叉核验。

| 文件 | 字节 | 行数 | 本轮SHA-256 |
|---|---:|---:|---|
| PHASE4.7-PHASE0-START-CONDITIONS-V8.md | 34096 | 426 | f189d4e3ca51965cc2f933430f5b67684c214be0b3994f8e171b53e12c4ac48b |
| PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv | 231068 | 59 | eb0230c085a23ff34209b02161b56ffa22c9b4ced61996c390b63bdb40a1ecc5 |
| PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json | 1356648 | 38155 | edca94ff7b8b45794dcaac8fd316f147e06c2cdb655a8d6eabdd63ccad586c47 |
| PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md | 29781 | 510 | b70004a7a2f9cc7f3cccea12062a296e12edfb42e80012d7c5c21d563bcd260c |
| PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json | 107767 | 1 | 5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa |
| PHASE4.7-PHASE0-V8-FAILURE-MODEL.md | 4081 | 78 | dfd4e8778727395f65da06965f65a6747fed0edaccd49f0b65d71d920e208bb2 |
| PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md | 4190 | 71 | 7cd0d9a72a7dd642e0e6844a2b167b741f3556b21af1de0a9d32d0555bd23dfd |
| PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md | 4280 | 66 | 7493f927c6adfe341faf804a96461a3f4ae5a16a2486d3c30a343d466fc80d3b |
| PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md | 3780 | 34 | bb0566706eab350c48b493e19567740dbb5edaa6b78982472d5a5b352502ab87 |
| PHASE4.7-PHASE0-V8-OPEN-ISSUES.md | 3286 | 54 | a7ed266b0b0581fd9cb222cbf4dc948e76f0659de9d2d3443169fa21a05197ca |
| PHASE4.7-PHASE0-V8-SELF-CHECK.md | 3125 | 47 | 0c17a2ee58f32aa9f133bf6619ad1a9927bb3af77e3997d278489bb9bf2533b6 |
| PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md | 2334 | 39 | e4785d4d2851feb9604d88985f8ce547909f42b0733bcf16b67f248b8230b48c |
| p0v8-lib.cjs | 7830 | 166 | 0b5c606a2534494acd2989a14ecde546050afc73df555d00ade531d61596d58c |
| p0v8-spec.cjs | 50469 | 697 | 10481537da1148b0dbe9b54a14068e59e60a79f2271924edb1fcf1e48cbead10 |
| p0v8-flow.cjs | 8196 | 190 | d05cda5ed5da3971e533f710f9af580fa475047308a328a8dded3086a0765b68 |
| p0v8-audit.cjs | 40155 | 533 | 5f43707271faa2c5dc823cb320e007fb009126171f438b5c1891426d812dbe4e |
| p0v8-build.cjs | 53304 | 786 | 64d74d892e12ee622837b9e406f426b662091407a2a4bdce5c5fa8d451a3d030 |
| p0v8-publish.cjs | 14784 | 341 | f6e43e26c96d02e39286db24d51030cb02496c818fdce63839a315e9a171d95a |
| p0v8-check.cjs | 49366 | 834 | b77591df895c1f742426ad5a7946f0410b74fc033d99d617ae0389cb48362296 |
| p0v8-verify.ps1 | 6452 | 106 | bd34bab8332d59cc1d9ebd258fe0d9fadc9eeb7b371666d20db179c7d3354d21 |
| p0v8-parse-inline.ps1 | 1329 | 25 | d63dcbbb60103c3247052558d0791e9690574437dec410a1adf71851a8228c3d |
| p0v8-hygiene.cjs | 4006 | 56 | 1b71cc21f90a4d07274c557e62488b1b747f138c9a3dff29c61c65bb361fdcb1 |
| p0v8-controlconfig-check.cjs | 1002 | 20 | c4cacf47f3e281f717dd58a269a97b90fe446d1ae3463e82cd8b9c59fb863673 |
| p0v8-lab.cjs | 4877 | 120 | 9b25144450867c8531fa49f1b0362701801b913780aaf4212e45c76229a8ae11 |
| p0v8-manifest.cjs | 5453 | 123 | fb06ac87c2970997264fecb4637434f8b8c7ccfb66295bb2d8650b310a833cc3 |
| PHASE4.7-PHASE0-V8-DELIVERY-MANIFEST.md | 5291 | 77 | b8d8cace4e21d9025f8dde98f05fedb541039242b1c97ca298c526d6a9ae5805 |

第十轮报告已读取和核验：24179字节，SHA-256 6d4825aff995d487cb0ad7b3b00944479cf579ed1482d3ffb061100bde650b32。既有N01—N12编号沿用，不将生成器自检当作独立结论。

### 2.2 发布身份交叉核验

独立读取_publish/CURRENT.json、journal.json、gate.json及release索引：
- CURRENT.rid为1edd9e749410c9fef2bb2e65，26个files条目。
- 用索引列表规范化后重算rid，前24位一致。
- CURRENT列出的26个物化文件与release目录对应文件，大小/摘要全部一致。
- .release-index.json与CURRENT.files完整数组一致。
- journal当前state=verified，rid匹配。
- work中的13个同名工具与物化交付版本逐字节匹配。

这些证明当前快照一致，不证明恢复逻辑无缺陷；不验证未来发布或外部修改。work/doc-src是额外生成输入，不属于26项清单，见发布依赖问题。

### 2.3 本轮独立静态检查

| 检查 | 结果 |
|---|---|
| JSON/TSV解析 | 正常；58数据行、38列 |
| 字段投影 | 58×38＝2204格与注册表投影一致 |
| argv | 58个顶层、8个target摘要匹配；两条inline摘要匹配 |
| 权限集合 | business/product双向allow/deny交集0 |
| policy | 48个guard、8个product摘要匹配 |
| 路径 | 已登记绝对路径规范化未见异常；不是实际文件身份/别名测试 |
| 正例 | 57个canonical/字节/SHA-256全部独立匹配 |
| 失败矩阵 | 306行；独立查得15行no-chain仍records>0，20行sealed-full含失败或跳过 |
| 语法 | 11个CJS仅解析无错误；未执行这些脚本 |
| 动态执行 | 本轮无；不执行发布器、lab、C00—C20、writer/guard |

CURRENT/清单哈希属于当前证据，不是用户批准摘要。安全、权限和协议正确性必须由后文源码分析单独判断。

## 3. 运行逻辑：已修复与新增缺陷

### F01｜P1｜OPEN：失败矩阵与封存规范冲突

flow.cjs:117—128将stop=continue视为未中止，在staged完整时选择sealed-full。主文:75/:90允许“完整封存但exit-not-met”，但审计规范:71与check.cjs:414—418要求sealed-full无skipped、无gate_failed、index/report存在。

直接数据反例：
R.flow.matrix.rows_data的bound/C10-P-E01/gate：
- stop=continue；
- failed=1；
- skipped=24；
- seal_mode=sealed-full；
- exit=exit-not-met。

本轮扫描306行，共20行sealed-full同时有failed或skipped。模式生成与同包seal validator不能同时成立。生成器和独立检查器重复同一模拟规则、摘要相同，不会暴露这种跨模型矛盾。

修复目标：统一“证据完整封存”与“阶段全通过”的含义。可定义独立的完成但未通过模式，或允许sealed-full承载失败同时严格限制complete，但必须同步改主文、审计schema、flow、checker和正负例，不只改预期摘要。

### F02｜P1｜OPEN：未建链与非链执行产生虚构链记录

flow.cjs:78—86在genesis前也记录skip；:133—139不按链是否存在过滤这些记录。C01失败时也先赋close，再按genesis角色计2条。

本轮扫描：**15个no-chain场景全部records>0**。例如bound/C00-E01/fatal显示ran=1、skipped=3、records=3；bound/C01-E01/fatal也records=3。
主文:78与FAILURE-MODEL规定无链只能保留launch record，这与现矩阵相矛盾。

flow:61—63还对任何orphan都设rec=open，不检查该执行是否属于链。bound/C20-SEAL-E01/orphan给records=110，比正常109多1，但SEAL明确不追加链；PROBE/PRE也有类似问题。
这些场景没有被误标exit=complete，本轮不夸大结论。错误在于日志计数和模拟对象不遵守链角色。

修复：建链前不产生skip/open/close记录；只为真实链参与者模拟open；对非链执行、genesis部分完成、terminal写失败分别建模。

### F03｜P1｜OPEN：安全失败分类仍不可靠

spec.cjs:590—593仅按reason是否精确出现在security_codes内判定class。C07 wrapper的“ORIGINAL changed…”和“before/after chain broken”没有security_codes，R中被标fatal、trigger=null。
flow:49—52把before/after普通fatal降入halt-business，允许finalizer/bind继续；这不符合原项目变化或链证据破坏应安全停止的约束。

另triggerFor（spec:53—73）按英文子串“first match wins”：
- “write outside…”包含sid，先匹配SEC-IDENTITY；
- “unaccounted write…”包含account，也匹配SEC-IDENTITY。
这些事件仍为security，不是降级为gate，但触发原因错误，不能据此可靠诊断或按原因选择收尾。

flow:119—120仅凭C19+security推断chainBroken，不看触发码；C19的路径越权会被当链损坏，其他位置真正链错误又未必如此。

修复：明确稳定错误码→class/trigger映射；所有安全完整性失败统一处理，停止和seal选择依据真实错误类型，不靠子串/执行ID。

### F04｜P1｜OPEN：状态集合与停止单调性不完整

FAILURE-MODEL定义orphaned只满足settled、not-started不满足任何要求。
flow:39—40以及checker的对应实现只检查state是否存在：recorded会接受orphaned/not-started，settled也接受not-started。

flow:46—53直接覆盖stop，未用等级最大值。已有halt-all后，强制after再发生普通fatal可赋值halt-business，违反“只升不降”。目前每场景只注入一个失败，306行不能覆盖双故障。
这是静态实现缺口；本轮未制造或运行停止级别下降。

修复：按明确终态集合判定requires；停止级别取max；增加“首错＋after错”等复合场景并验证协议不变量。

### 运行层实际改进

V7的after被跳过问题已有实质修正：requires将terminal与ok区分；C10-P gate目前精确跳过8个目标的B/T/A共24项，失败目标自己的after保留。M1/报告路径改为recorded消费。late-security已按staged完整状态选择aborted。上述改善不抵消F01—F04。

## 4. 权限与文件输入

### F05｜P1｜OPEN：source加载合同引入staged verifier

build.cjs:122：
stg('dispatch') === e.entry_path ? stg('verify') : stg('verify')
两个分支相同，导致所有非inline执行的trusted读取都登记staged verifier，即使入口仍是source。

C05-PRE发生在RUN必须不存在时，却在reads.dispatcher列RUN\tools\p0-verify-release.ps1；与主文要求“同根依赖、每次加载前核验”不一致。
这不是说允许列表存在某路径就等于实际读过；确认的是依赖归属合同错误，真实运行工具缺失，实际失败未验证。

同类缺项：C05-PRE load_files包含source p0-audit.cjs，但trusted读取未包含它；C00曾核过不等于满足每次加载复核规则。

修复：依据实际entry_mode选择source/staged依赖，核对全部load_files均有正确trusted字节校验责任；不要把旧C00结果自动替代后续一致性检查。

### F06｜P1｜OPEN：optional_reads在生成时丢失

spec:420、438、448为C17、C19、REPORT声明可选输入；但TARGETS→ex（475—486）未传t.optional_reads。build:113—116从丢失后的e.optional_reads生成字段，最终R中这些执行optional_reads为空、对应读取optional=false。SEAL直接ex声明则保留。

最小反例：C08普通fatal→halt-business；M1属于baseline被跳过且有skip记录；C17作为finalizer可消费其recorded状态。但m1.json未生成，最终读取合同却要求它存在。模拟器可称C17成功，真实输入合同不可满足。

修复：保留原定义的optional标志，并验证每种失败/跳过下报告所需文件是否真实可存在；optional不能替代缺失来源的如实报告。

### 权限侧已通过的范围

旧的C01审计父目录、9个runner的RUN\tmp读写、后续binding读取已加齐；当前记录的双向allow/deny交集为0，38列投影一致，policy摘要一致。
这些是数据层证据，不是实际guard/ACL隔离已验证。

共享RUN\tmp被公开承认为不同runner共同可读，不应额外宣称跨执行保密；是否接受该模型须按使用目的决定，不能以“隔离完整”笼统代替。
map-list仍要由运行实现展开成批准文件；不能仅靠路径父子关系把它视为任意subtree授权。实际guard未交付。

## 5. 审计系统

### F07｜P1｜OPEN：预载正例与登记policy身份不符却被接受

审计规范:30要求preload.policy_sha256等于对应执行guard policy。
实际C10-P产品正例（audit.cjs:215—232）使用policy_sha256=e×64，guard_sha256=c×64，argv_sha256=d×64。
登记的guard policy为e120417f7737bc961bc7bc94daca9bddeb0faa3d87c7d2e1c315e1c2f2cad59a；product policy为7fe8d1457c78a25eba16fd120683a4879588d34bc0ceb7ff5938e42f1204d2d5。
正例既不匹配guard也不匹配product policy。

check:248—250只验证64hex格式和环境键数组，不验证登记身份，因此自检可通过。必须明确父/产品进程分别使用哪个policy并与真实登记值比较。未知运行工具hash可标明fixture用途，但不能把不匹配的policy当已验证有效正例。

### F08｜P1｜OPEN：操作权限、配对与流回放仍有关键漏检

check.validateEvents:
- :181—192只检查rule覆盖path，不检查intent.op是否被rule.op允许。例如某路径只有file-create，静态逻辑仍允许同路径delete/overwrite事件。
- :188/:224会按role改写business/product rule_ref再解引用，不能据此证明事件原先声明的权限层正确。
- 结果出现时检查intent，却在函数返回前不检查“每个intent恰好一个result”；只有未完成intent的数组可能没有配对错误。
- 未对预载policy与登记值做身份比较。
- A规定的path/src_path读权限、写保护、子对象完整类型等没有全覆盖。

flowReplay:394只对result=failed设置pendingAfter，遗漏合法result=aborted；遍历结束也没有对尚存pendingAfter补报错误。失败目标作为最后一条记录的片段不能证明after已到达。

validateChain:349允许failed_dependency状态为open，而A的因果规则要求已经failed/skipped；validateSeal主要比较摘要格式和部分模式，不独立推导全部状态分区。矩阵与seal分别通过，正是F01未被发现的原因。

这些是静态分支缺失，不是本轮已执行攻击。修复目标是用完整schema与权限操作模型、全量配对和真实因果验证替代“字段存在/路径覆盖”检查。

### 57正例、35负例的证据口径

本轮独立验证57份正例canonical、字节数和SHA全部一致；35负例有实际输入，真实无LF字节流也已交付，这是比V7更实质的改进。
但哈希通过不等于协议通过；F07正例即直接反例。检查器由独立文件实现，也可能重复相同规则遗漏。

35条负例只代表已设计的缺陷类别，缺少删除/覆盖操作越权、仅intent未result、错误policy身份、aborted缺after、no-chain虚构记录、跨模型seal冲突等。
本轮未运行提供的checker，也未运行writer/guard。没有把静态负例文件称为真实并发/磁盘/进程故障验证。

补充设计约束：A:42把所有写字节操作的bytes_written定义为after.bytes，append场景中“本次写入量”与“最终文件长度”可能不同。应明确定义累计量或增量，避免未来writer按真实增量记录却被拒；当前没有append运行证据。

## 6. 发布、回滚与故障证据

### F09｜P1｜OPEN：提交后独立检查失败不会可靠回滚

build:758调用PB.publish后，发布器已将journal写为verified。
build:766—773若post checker/PS/hygiene失败，调用PB.recover。

但publish.recover:312—318对verified/committed事务只验证当前文件是否匹配CURRENT；如果静态检查失败而文件字节没变，就返回verified并保留新版本。
因此“post gate失败→recover回滚”不成立；退出1也不代表已回到旧版本。当前gate均为0，没有发生该失败，但分支逻辑可以直接确定。

修复：将撤销已提交事务与恢复未完成事务分开；post gate失败需显式按旧版本回滚并验证指针/物化树，不能调用默认保留完整新版本的recover。

### F10｜P1｜OPEN：新发布可覆盖尚未恢复的事务日志与备份

publish:131—154没有读取并拒绝/恢复既有switching、prepared、rollback-failed事务，直接写新journal。
:181—182又按内容rid删除同名backup并重建。

最小反例：
1. A→B切换到第二个文件时崩溃，物化树A/B混合，CURRENT仍A，旧日志/备份可恢复A。
2. 用户再次运行同一B发布；代码将混合树当作old快照，覆盖旧日志，删除backup/B。
3. 再发生失败，verifyOld可按混合快照通过；恢复CURRENT=A却未恢复A字节。

即使正常第二次最终成功，这条错误路径仍丢失原先可恢复状态。当前树一致不反驳该设计问题。
修复：发布入口先校验事务终态与CURRENT；遇未完成事务只能恢复/拒绝。事务ID与release内容ID分离；禁止删除未完成恢复所依赖备份，并加单写者锁。

### F11｜P1｜OPEN：状态/恢复对release与指针校验不足

- publish.status:92—95只检查release索引存在，不验证索引内容和release文件。
- recover:312—318只检查cur.rid和物化文件，不调用verifyRelease确认不可变release。
- check:770“release index equals CURRENT”仅比较数组长度，不比较条目内容。
- status CLI:335即使issues非空仍退出0，作为命令状态门容易误用。

本轮自行逐字节核对release索引及26文件，当前全部一致。这里指出的是内置检查会漏掉之后的release损坏、索引等长替换，不声称磁盘已被改动。

修复：status/recover/check使用完整内容索引、rid重新计算、release字节和物化字节四方核验；发现issues应明确失败退出码。

### F12｜P1/P2｜OPEN：发布持久化与恢复边界仍需补齐

writeDurable:50—51只调用一次fs.writeSync，不检查返回字节数；短写时不能声称已完整写入。文件自身有fsync，但目录重命名/日志父目录持久化和并发写锁未定义。
rollback:279先写rolled-back日志，随后:281—285恢复CURRENT，指针恢复后没有整体再次复核。
异常处理有所改善：rollback-failed已显式返回，这是比V7好；但协议不应把未完整复核的恢复称为已验证。

发布器abs/路径入口未验证相对文件名不得含..、绝对路径、重解析跳转；当前26个固定文件名无此类输入。此为接口边界风险，不能将其夸大成本次已经越界写。若journal/index可被外部改动，recover需先校验其路径均位于批准根，而不是把元数据直接当文件操作指令。

### F13｜证据不足：11场景lab不等于完整故障恢复验证

已有gate.json声明：
- build_checks=193；
- pre_checker_checks=1592，post_checker_checks=1599；
- verifier_passed=114；
- lab.scenarios=11，passed=11，failed=0；
- determinism=true；当前publish verified。

这些是本轮读取的历史记录，不是本轮重跑结果。
lab.cjs实际执行范围包括首次/重复发布、若干throw点、自进程SIGKILL。它不是纯静态工具，具有创建、删除scratch及启动子进程的行为，本轮未执行。

证据限制：
- :82不论场景是否失败都删除scratch；:104只按rec.failed统计。
- build:779最终只保留计数与limits，未保留完整results、每一步actual/expected、恢复前后哈希或现场。
- kill场景:71记录非零但不将“确实被预期方式杀死”作为断言。
- rollback-failed场景没有随后再次recover并证明恢复完备。
- 不覆盖post gate失败、未完成事务重复发布、多个发布者、短写、指针/索引不一致等本轮发现。
- gate.json不属于26交付哈希/不可变release索引，不能直接当外部不可更改的通过凭证。

修复：保留逐场景追加证据与失败现场，绑定实际测试代码hash；将新反例纳入隔离故障实验。真实磁盘错误、断电、外部kill和并发恢复仍应UNVERIFIED。

### F14｜P2｜OPEN：26项交付未封装全部生成输入

build:17、665—691读取work/doc-src模板；这些额外输入不在26项清单内。
当前workspace提供了work目录，但仅复制26项交付不足以再生成同一包；release目录里的工具也没有对应doc-src。
root/work的13工具目前相同不解决未绑定模板问题。

修复：明确生成输入包及其摘要/版本，或让发布交付自包含；不得把未列入清单的工作副本默认视为可信、可复现来源。

## 7. 对第十轮N01—N12的状态

| 项 | 本轮判断 | 依据 |
|---|---|---|
| N01 读权限双向交集 | PARTIAL | 当前交集0保持；实际guard/路径身份未交付 |
| N02 trusted加载/自读 | OPEN | self入口保持，但F05新source/staged依赖错误 |
| N03 C06 policy | PARTIAL | policy存在且可复算；运行实现未提供 |
| N04 审计目录/角色 | PARTIAL | C01中间目录及角色、control读取有修正；真实执行未验 |
| N05 TEMP/产品环境 | PARTIAL | 9runner读写缺项已修；共享tmp边界已披露，实际隔离未验 |
| N06 审计validator | OPEN | F07/F08仍有直接漏检及错误正例 |
| N07 安全分类 | OPEN | C07安全完整性失败仍未升级，关键词误归因 |
| N08 依赖与失败模型 | OPEN | 原after/skip实修，但no-chain、requires集合和停止单调性缺口 |
| N09 seal模式/早期失败 | OPEN | 20矩阵行与seal规范冲突，terminal orphan计数错误 |
| N10 绑定消费 | OPEN | 唯一路径和读取已修，optional_reads转换丢失影响失败报告路径 |
| N11 CreateNew/map类型 | PARTIAL | 文书/数据保持改善；真实运行未知 |
| N12 发布/回滚 | OPEN | F09—F14，实际恢复与证据仍有设计缺陷 |

统计：**0 CLOSED / 5 PARTIAL / 7 OPEN**。
这不是为了延续旧评级，而是逐项依据新实现。PARTIAL中的若干具体旧静态缺陷已修；整体责任含尚未实现的运行层，不能因此标CLOSED。

R05/R16仍OPEN、R01仍PARTIAL；本次没有产品源码整改或产品运行证据。原有安全指标和已批准D3/D4/D10/D12/D14/D15不改变。

## 8. 工具、运行时和证据的边界

| 已交付工具 | 实际职责 | 本轮审查重点 |
|---|---|---|
| lib/spec | 规范化、路径关系、执行定义 | 精确/子树、依赖、optional、错误映射 |
| flow | 纯内存失败模拟 | 306行、requires、停机/日志/封存 |
| audit | schema与fixture生成 | 57正例、35负例及语义 |
| build | 生成并运行门禁、发布 | 额外输入、post gate回滚 |
| publish | 文件发布/备份/日志/recover | 事务重入、指针/索引/字节、恢复 |
| check | 独立数据校验和模拟 | 与schema跨层一致性、配对/权限漏检 |
| verify.ps1 | 摘要/字段/链/指针复算 | 不等于完整审计执行 |
| parse-inline.ps1 | PowerShell语法解析 | 未求值；安全词扫描不等于行为验证 |
| hygiene | 历史摘要与编码检查 | 不阻止之后修改 |
| controlconfig-check | 固定模板摘要 | 不执行Vite，不证明插件行为 |
| lab | scratch文件/进程故障实验 | 有实际副作用；本轮不执行 |
| manifest | 生成交付清单 | 单清单更新不代替完整发布 |

实际D:\P47TOOLS\p47-phase0-v8发布payload、运行dispatcher/verifier/p0-audit/fs-guard/业务工具均未交付。代码中描述“必须拒绝”“必须回收”“必须fsync”不是实际实现证据。
CURRENT指向的是V8契约包，不是Phase0运行工具已可用。flow矩阵通过不等于真实失败注入成功。

## 9. 建议的整改顺序

1. 先统一flow与audit seal规范，修no-chain/非链记录、requires状态集合与停止单调性；按真实原因分类安全失败。
2. 修optional_reads传递、source/staged可信依赖和PRE audit加载覆盖；逐场景核对输入存在性。
3. 补完整事件操作权限、配对、预载policy、after因果和跨模型seal验证；新增反例须有可区分的正确基底。
4. 修发布入口的未完成事务保护、post gate显式撤销、完整release核验、短写及并发控制；用新反例验证恢复。
5. 将生成输入/实验代码/逐场景证据纳入可追溯交付，失败现场保留；不能用计数摘要替代原始结果。
6. 补交实际运行payload与批准manifest、账户和执行范围。只有独立源码审查与外部输入具备后，才由用户另行授权有限Phase0。

上述是后续整改建议，本轮没有修改V8，没有自动生成V9，没有执行任何发布或恢复命令。

## 10. 执行声明

本轮只做读取、独立哈希/JSON/TSV/矩阵数据分析和静态源码审查，随后仅新增本报告。
未执行V8工具、lab、C00—C20、测试、构建、浏览器或L1；未创建D:\P47RUN/D:\P47TOOLS，未修改ACL、产品、V8、work、_publish或历史证据。

**最终结论：V8存在新的设计缺陷，REJECTED。报告保存并计算元数据后停止，等待用户决定。**

