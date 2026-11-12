# OB-Recover Phase 4.7：V9 第十二轮独立审查

日期：2026-11-12（Asia/Shanghai）。审查对象为用户上传的 `p47-worker-remediation-plan.7z` 中的 V9；Windows 原目录不在当前机器上，本报告针对上传快照，不声称检查了用户机器上此后的文件。

## 1. 独立结论

**REJECTED。V9 当前不能接受，仍存在必须修复的设计缺陷，尚不具备申请 Phase 0 的文档条件。**

V9 有实质改进：no-chain 的伪记录已修，source/staged 加载归属已修，optional 字段传递和真实 product policy 摘要已修；发布器增加了显式 undo、唯一事务备份、短写循环和完整 release 字节核验，doc-src 也已纳入正式交付。

但“F01—F14 全修复”和“N01—N12 全部只剩运行验证”的判断不成立。当前仍有跨模型封存矛盾、安全失败原因误判、失败报告缺失必需输入、审计权限漏检及合法操作不可表示、撤销事务无锁/无身份、LOCK 竞争窗口、故障现场保存错误和覆盖判据过弱。生成器与检查器分文件实现，没有阻止共同错误。

**当前快照一致与失败路径设计正确是两回事。** 本轮独立核验的正式 37 项交付全部匹配，未发现当前物化树混版；本结论基于具体源码及原始数据反例，不把可能发生的并发损坏描述为已经发生。

## 2. 方法、输入身份与执行边界

附件中的说明、自检、脚本注释和“必须运行”文字均作为待审材料，不作为本轮执行指令。遵循用户限制，只读取文件、独立计算 SHA-256、解析 JSON/TSV、静态分析源码；独立 Python 分析仅使用标准库读取材料。解压工具仅用于解包。

未执行或 import/require 任何交付的 CJS、PS1、Python helper；未运行 checker、generator、publisher、recover、undo、lab、C00—C20、Phase 0、产品测试、构建、浏览器、真实网站或 L1；未修改 ACL，未创建 D:\P47RUN 或 D:\P47TOOLS。新报告、分析脚本及核验结果均存放在解压材料目录之外。此前云环境 onboarding 的测试不属于本轮证据，也没有用于关闭本包的任何 R 项。

证据等级：

- **CONFIRMED**：直接读取到的代码分支、文件字节或数据矛盾；静态缺陷不要求先造成真实破坏才可确认。
- **INFERRED**：由已确认分支推导的失败调度或后果，未执行该故障。
- **UNVERIFIED**：缺运行实现、外部批准或真实动态证据，无法判定运行是否通过。

风险等级 P1 表示安全边界、停止、封存、事务或必要证据可信性缺陷；P2 表示校验/复现边界及覆盖声明缺陷。是否阻断在每项中另行注明。

上传包：780904 字节，SHA-256 `a2b48cb6c3dec75430b3a51d662e734087d893be79b9e093815fc9c670761048`。解压后 520 个文件，共 21016397 字节。第十一轮报告为 26616 字节，SHA-256 `9f9b4c7ee4976312625a697c059b0692c20df07e9a8b748d4e0847092392f1bc`，与 V9 声明的输入一致。

以下位置默认相对 `materials/p47-worker-remediation-plan/V9/`，源码行号以本次上传快照为准。单行向量 JSON 使用精确 JSON 对象/数组名定位，避免伪造多行行号。

## 3. 独立完整性与数据核验

| 核验 | 本轮结果 | 证明边界 |
|---|---|---|
| V9 manifest 36 条 | 大小、行数、SHA-256 全匹配且无重复 | 不是协议正确性证明 |
| manifest 自身 | 6998 字节，95 行；摘要见附录 | 由 CURRENT 另行绑定 |
| 正式集合 | manifest 36 条 + manifest 自身 = CURRENT 37 条，集合相等 | 当前快照正确，不代表内置 checker 会查此关系 |
| release | index 与 CURRENT.files 全量相等；37 文件大小/摘要全部一致，物理目录无额外交付文件 | 不证明崩溃恢复或事务互斥 |
| RID | 独立重算为 `380e5e9dd83370505c2555ad04acbd4b475f07473a041ac7d5e96e32db47a735`，一致 | 当前内容地址 |
| journal | state=verified，rid 相等，files[].new 全量等于 CURRENT.files | 当前日志正确；验证器仍有缺口 |
| work/doc-src | 13 个工具副本、10 个模板副本与根目录逐字节相同 | 不是两份独立实现 |
| V9 全部文件 | 245 个文件独立逐一计算大小和 SHA-256，含 work、release、lab 证据 | 全量明细另附 |
| V8 历史 | 26 项已知交付均匹配第十一轮报告的大小/行数/摘要 | 未提供历史基线的辅助/work/lab 文件不能被宣称历史不变 |
| argv / inline / policy | 58 顶层 argv、8 target argv、2 inline 摘要一致；48 guard 与8 product policy 摘要可复算 | 不证明实际运行工具身份或装载窗口 |
| TSV 投影 | 58×38 = 2204 格与注册表逐项一致 | 只能证明同一合同的两种表示一致 |
| 正例 | 58 项 canonical、字节数、SHA-256 全部独立匹配 | 其中若干 seal 语义仍矛盾，见 Q04 |
| 失败矩阵 | 340 行摘要一致；15 个 no-chain 场景 records 均为0 | 含原因误判与3个未到达第二注入的场景 |
| lab | 17 份 scenario 与 report.results、代码摘要一致；report 摘要匹配 gate | 部分覆盖和现场不支持所称通过，见 Q12/Q13 |

没有把 gate 中的 checker/verifier 退出码、自检“通过数”或 OpenCode 的 14/14 结论当作独立执行结果。41 个负例是已提供的有限输入集，不构成审计规则穷尽证明；本轮未执行其期望断言。

## 4. 逐项发现

### Q01｜实际失败 trigger 未绑定，普通 fatal 被误判为 chain-broken

**CONFIRMED；P1；阻断后续 Phase 0。** 对应 F03/F04、N07/N08/N09。

位置：`p0v9-flow.cjs:148-154`；`p0v9-check.cjs:784-785`；`PHASE4.7-PHASE0-V9-FAILURE-MODEL.md:26`。注册表中 `flow.matrix.rows_data` 的 `bound/C07-B-C08-E01/fatal`（:1341）、`bound/C19-E01/fatal`（:3409）为直接反例。

两份实现均检查失败执行的**全部** failure_modes 是否含任何 SEC-CHAIN-MISMATCH，未绑定本次选中错误码/trigger。独立扫描：340 行中 151 行标 chain-broken，其中 60 行 fail_class=fatal。一个执行可以同时定义普通错误和链损坏错误，不等于它的每次失败都是链损坏。

此外 chain-broken 只在模拟末尾选 mode，stop 从未因该 trigger 升为 chain-broken；`:106-109` 仍执行 SEAL，而文档要求链损坏拒绝继续/封存。生成器与“独立”checker 用相同 some() 推断，互相比较可同时通过。

修复：按稳定错误码注入并携带真实 class/trigger，在发生点立即升级 stop；真正链损坏拒绝后续链写/封存；分别验证普通 fatal、ORIGINAL 改变、链损坏，检查器从协议不变量推导。

### Q02｜精确 reason 表未覆盖实际 reason，身份与摘要失败仍降为 fatal

**CONFIRMED；P1；阻断。** 对应 F03、N07。

位置：`p0v9-spec.cjs:56-121`、`:249-255`、`:639-654`；`p0v9-check.cjs:603-608`。

C00 实际登记 `account name/SID mismatch (45)`、`non-admin token (46)`、`runtime binary size/hash mismatch (49)`、`manifest hash/schema/20-file/key-tool/anchor mismatch (43/44)`，精确映射却使用无编号或不同措辞。最终 C00 六条显式失败均为 fatal/trigger=null；C03-PROBE 也有身份/group 等漏映射。checker 只确认“已经标成 security 的条目在表中，其他条目不在表中”，没有独立判断哪些错误必须属于安全错误。

C00 的 pre-run fatal 同样停止运行，因此本项不声称其已导致继续业务；已确认的是分类、归因及未来安全汇总不完整。

修复：使用稳定 code 绑定 class/trigger，人类 reason 只做说明；对身份、工具摘要、越界、重解析等安全条件建立独立语义断言。

### Q03｜C17 在失败路径仍要求一个必然未生成的输入

**CONFIRMED；P1；阻断。** 对应 F06、N08，影响失败报告可运行性。

位置：`p0v9-spec.cjs:459-469`、`:695-699`；`p0v9-build.cjs:113-116`；`p0v9-check.cjs:587-600`。注册表 C17-E01 从 :32998 起。

optional_reads 在 TARGETS→ex 的传递确实已修，但 C17 精确读取 `out\C09\C09-E01\copies.json` 仍 optional=false，且不要求 C09=ok。独立按合同遍历 `bound/C08-E01/fatal`：halt-business 后 C09 skipped，copies.json 未生成，C17 作为 finalizer 仍可运行；模型却可记 C17=ok。可选 OUT/C09 子树不应默默取消精确输入的必需属性。

checker 仅在“找到该 producer 的直接 requires 且不是 ok”时检查 optional，恰好漏掉没有直接 requires 的情况。独立状态与缺失输入见 `analysis/flow-c08-fatal-independent.json`。

修复：逐可达失败/跳过路径核对输入存在性；必需输入须有可证明的成功生产者，否则设为真正可选并报告“缺失/未执行”。同时明确 halt-business 下 finalizer 无 before/after 的例外，避免 A 失败又依赖不存在的 before 证据。

### Q04｜正式 seal 正例与关联链矛盾，校验器没有验证完整状态分区

**CONFIRMED；P1；阻断。** 对应 F01/F08、N06/N09。

位置：`p0v9-check.cjs:448-491`、`:652-658`；`p0v9-audit.cjs:367-383`、`:406-416`；向量 `seals[1]`/`chains.security_excerpt`。

seal_1 绑定 security_excerpt 的真实尾摘要；片段中已有 C12 与 A-C12 两个 open/close 和 B-C13、C13 两个 skip，但 seal 自报 skipped=[]、opened=1、closed=1、skipped=0。即使片段缺前缀，完整计数也不可能小于已有片段。seal_3 绑定 C10-N orphan/C11 skip，abort 却仍写 C12/security；seal_0 绑定 C01 链尾 seq=3，却 chain.records=1。

validator 只比尾 seq/hash/kind、部分字段类型及数组互斥，不从链反推 skipped/counts/abort/security/open_segments；找不到关联链的正例甚至以 recs=null 跳过该层检查。`exit_status=complete` 也没有从 failed close 推导“无失败”的硬核验。允许 sealed-full 带 gate 失败的新定义本身可以接受，缺的是证据与声明一致性。

修复：区分完整链与片段；权威 seal 只对完整验证链生成，逐执行重放并核对计数、分区、abort、binding、开放段及截止点；片段不可冒充全运行封存正例。

### Q05｜安全停止回放只对有 after wrapper 的失败生效

**CONFIRMED 静态分支；真实绕过 UNVERIFIED；P1；阻断。** 对应 F04/F08、N06/N08。

位置：`p0v9-check.cjs:420-445`；审计规范 :84-86。

halted=true 位于“failed/aborted close 且 wrapperOf[exec] 存在”的条件内。C02/C06/C07-before/C07-after/C07-M0 等没有对应 wrapper，其 security close 不会激活安全停止；随后 target/finalizer/bind 的 open 可漏检。已有 halt 检查也只覆盖 open，而规范要求 open/close。chain validator 另未形成拒绝重复执行、验证所有依赖的完整状态迁移证明。

修复：任何 security close 均独立激活 halt，wrapper 只决定是否允许唯一收尾 A；对每个执行状态及严格允许的后续记录进行完整回放。

### Q06｜rename 只验证源可读，能遗漏对受保护源的破坏

**CONFIRMED 静态权限缺口；实际文件移动未执行，破坏后果 INFERRED；P1；阻断。** 对应 F08、N06。

位置：`p0v9-check.cjs:192-220`，特别 :210-219。注册表 C08-E01 从 :14193 起。

rename/copy 都只查 src_path 可读；写规则与 protect_write 只查目的 path。独立数据反例：C08 可读 `D:\Projects\ob-recover\README.md`，不可写且明确保护该源；同时可写 RUN\tmp。将 op=rename、src=该 README、path=RUN\tmp\moved-README.md、rule_ref=C08-E01.business_writes[5]，会满足代码已实现的目的写、源读、目的保护判断，却没有任何源删除/写授权检查。

rename 会改变源命名空间，源可读不等于源可删除。另 product 事件保护判断仍使用 ex.protect_write，没有选 ex.product.protect_write，不能据此证明产品专用保护集已执行。

修复：rename 对源和目的分别验证操作权限、保护集、路径/对象身份；若现 schema 只有一个 rule_ref，应增加明确的源写授权引用。product 按其真实层选择保护集。独立数据谓词见 `analysis/static-permission-counterexamples.json`，未实际运行 checker 或移动文件。

### Q07｜新增操作校验不能表示部分合法运行记录，schema 仍未闭合

**CONFIRMED；P1（必要运行操作），部分子 schema 缺口 P2；阻断。** 对应 F08、N06/N11。

位置：`p0v9-check.cjs:87-90`、`:151-160`、`:233-263`；`p0v9-build.cjs:212-220`；`p0v9-audit.cjs:52-66`；审计规范 :42、:51-54。

C14 的 writes.business[4] 是 map-list/map-listed-file-write，但 OP_RULES 中没有 map-listed-file-write，covers 也只允许 subtree 后代。运行工具被要求把批准 map 展开为精确文件，而 ruleOf 只能引用静态注册表数组；未定义展开后规则身份如何合法进入事件验证。不能把 map-list 简化成任意 subtree 来修补。

规范允许 denied 读且无匹配规则时 rule_ref=null，checker 却不分结果无条件要求正确 layer/ref，因此真实拒读记录也会被拒。`bytes_written` 定义为仅写字节操作有值，但成功 mkdir/acl/delete/rename 同样被要求 after.bytes 为数字、after.sha256 为摘要，并在非 append 时 bytes_written=after.bytes；合法元数据/目录操作如何编码没有闭合。before 对象、read entry 的 path_kind 等也未按声明完整校验。

修复：建立每操作的具体输入/前后状态/写入量 schema；定义获批准 map 的精确展开、摘要与 rule_ref 绑定；对 denied/absent/content/metadata 分别建可接受记录和反例，补目录/ACL/delete/rename 的有效样本。

### Q08｜undo 没有锁和期望事务身份，post gate 可撤销其他事务

**CONFIRMED 代码缺口；并发损坏后果 INFERRED；P1；阻断。** 对应 F09/F12、N12。

位置：`p0v9-publish.cjs:224-230`、`:324-326`、`:388-398`；`p0v9-build.cjs:806-822`。

publish 返回前释放 LOCK，build 在锁外执行 post gate；失败时 undo(ROOT,{})。undo 不取 LOCK，也不接收期望 txid/rid，只读取当时最新 journal 回滚。静态调度：A 提交 B 后检查，C 随后提交 C，A 检查失败，undo 读到并撤销 C；或 undo 与 publish/recover 同时写 journal/相同临时文件。幂等 noop 没创建本次事务，post gate 失败仍可撤销此前的 verified 事务。

旧的“调用 recover 会保留新版本”已修，但整体提交接受/撤销协议仍未闭合。

修复：post gate 纳入受保护的 pending-acceptance 阶段；undo 持同一锁并严格核验调用方期望事务；身份变更应只拒绝，不触碰文件；noop 不得撤销历史事务。

### Q09｜LOCK 初始化窗口可被误当陈旧锁删除

**CONFIRMED 算法缺口；双写后果 INFERRED；P1；阻断。** 对应 F10/F12、N12。

位置：`p0v9-publish.cjs:101-121`。

A 在 :105 用 wx 创建空 LOCK，尚未写 pid；B 遇 EEXIST，:112 解析失败置 null，:114 删除这个仍被 A 持有的锁，再创建自己的锁。两者均可进入临界区。releaseLock 也不核验路径当前锁是否仍是自己所持对象就 unlink。

lab 的手写完整活 pid 哨兵只测试一种拒绝分支，不能否定初始化竞争窗口。

修复：锁初始化未完成也应保守拒绝；显式定义陈旧锁恢复和持有者身份，删除前核验唯一所有权令牌/文件身份；为实际初始化竞争和释放交错提供另行授权后的证据。

### Q10｜journal、CURRENT 成员集合和残留状态没有完整交叉验证

**CONFIRMED 静态遗漏；P1/P2；阻断“完整一致性已闭合”的接受声明。** 对应 F11/F14、N12。

位置：`p0v9-publish.cjs:163-189`、`:214-218`；`p0v9-check.cjs:894-927`、`:941-964`；发布协议 :43。

status 只在 journal 存在时验证部分 state/rid，缺 journal 可无 issue；同 rid 但 files.new 错误也不比对。rolled-back 未严格绑定 old_current；staging 仅列入输出而不影响 issues/退出码。prepared rollback 留下 staging，和协议“失败删 staging”不一致。

checker 分别验证固定 manifest 集合和 CURRENT 所列内容，却不把 CURRENT 路径集合与 manifest+self 双向比较。内部自洽的子集指针/索引可以漏掉正式文件；生成器动态收入更多 p0v9 工具/doc-src，manifest 与 checker 却共享固定名单，亦有共同盲点。当前真实37项集合已由本轮额外检查，确实正确。

修复：验证 journal 的 schema/txid/state/new/old/backup 绑定，所有入口复算 RID；manifest、生成映射、CURRENT、release index/物理集合严格双向相等；明确 staging 是否允许，按协议清理或失败报告。

### Q11｜路径与持久化保证的追踪声明超出实际实现

**CONFIRMED 实现差异；越界/断电后果 UNVERIFIED；P2；阻断相应安全边界的完成声明。** 对应 F12、N12。

位置：`p0v9-publish.cjs:45-53`、`:125-138`、`:352-359`；F01—F14 追踪表 F12。

物化目标通过 abs 做词法限制，短写循环也确实增加；但 release 路径直接 path.join(releases,rid)，release 条目直接 join，rollback 直接信任 journal.backup_dir。并非追踪表声称的“journal/index路径全部经abs”。abs 未验证符号链接/Windows 重解析对象身份。当前37路径正常，不声称本包已经越界。

文件 fsync、目录同步尝试有改善，但目录同步不支持时返回 false，不能以“FIXED/ISOLATED”升级为断电可靠；锁记录自身仍单次 writeSync，亦不能由业务文件的短写循环概括所有持久化写。

修复：严格限制 rid/txid/索引路径并从批准根推导 backup/release；校验可信元数据及实际对象身份。把已实现的词法限制、已尝试的同步与真实断电保证分开；修正追踪表过宽措辞。

### Q12｜所谓 after-kill 原始文件实际是恢复后的文件

**CONFIRMED 原始证据矛盾；P1；阻断 F13 FIXED/ISOLATED。**

位置：`p0v9-lab.cjs:90-102`、`:141-152`；`_publish/lab/run-2026-11-12T03-10-19-617Z/{kill-switch-b,kill-pointer,kill-then-publish}/`。

脚本先保存 afterKill 摘要，执行 recover 后才复制 after-kill-*.txt。独立计算：kill-switch-b 与 kill-then-publish 的故障摘要为 B/B/A，留存文件却 A/A/A，各有 a、b 两个不匹配；kill-pointer 为 B/B/B，却留 A/A/A，三个不匹配。合计 **7/9** 个所谓故障现场文件与 afterKill 摘要冲突，9/9 都匹配恢复后摘要。

子进程记录均 status=1、signal=null；树与 journal 阶段支持“曾在对应阶段中断并恢复”的有限历史证据，但不能把恢复后字节当中断现场，也不能仅凭非零退出证明预期 kill 原因。

修复：恢复前保存故障树、journal、CURRENT、索引、子进程输出和触发点，逐副本绑定摘要；保留现有证据不改写，新实验另存。

### Q13｜故障与复合场景有假通过可能，名称不等于覆盖

**CONFIRMED 断言/数据缺口；P1（恢复与安全证据）、P2（重复覆盖）；阻断“17/17完整覆盖”结论。** 对应 F04/F13。

位置：`p0v9-lab.cjs:63-76`、`:89`、`:103-137`；`p0v9-flow.cjs:205-208`；`p0v9-check.cjs:816-819`。

- determinism 与 republish 共用完全相同分支，第二次是同树幂等 noop，不是两次独立生成/发布。build 的两进程内存生成哈希比较是另一项证据，本轮未运行。
- rollback-failed 后再次 recover 仅断言“不是 ok 且 verified”，因此 recover 再失败也会通过。当前 after 数据支持本次最终 A/rolled-back，但断言不能证明未来恢复成功。
- post-gate-undo 只直接调用 undo；lock-refusal 只手写完整 pid；short-write 只把每次请求大小设为3，不是模拟操作系统短返回；release/pointer 损坏只查 status 函数，没有 status CLI 退出码实验。
- kill 只断言 status 非0或有signal，任意异常/超时也可满足。
- 34 个 fail2 场景中，`C10-N+C13/gate`、`C14+C15/gate`、`C12/security+C19/fatal` 的实际 failed 均只有1，第二故障执行已 skipped。不能把请求注入当已到达。

修复：记录 requested/reached/observed，逐故障核验触发点、原因和恢复结果；无法到达的注入标未执行，采用可达组合。给每个声明设计足以失败的独立断言，狭义结果按狭义名称报告。

### Q14｜模板已封装，但“仅凭37项正式包完整复现”仍不成立

**CONFIRMED 静态依赖；完整重跑 UNVERIFIED；P2；需修后才可接受完整信任链声明。** 对应 F14。

位置：manifest :58-74；`p0v9-build.cjs:17`、`:790`、`:816-822`；`p0v9-check.cjs:995-999`；`p0v9-hygiene.cjs:69-79`；`p0v9-lab.cjs:15`。

10个 doc-src 确已入 manifest/release，旧模板遗漏实修；但文档给出的完整 build/gate/publish 强制依赖包外 V8，post-gate hygiene 又强制依赖包外 V7/V8。只复制37项正式release，无法完成所描述全流程。lab 的 OUT=__dirname/../_publish/lab 也依赖工具所在目录：work 运行产生 V9/_publish/lab，正式根运行却产生父目录 _publish/lab，证据位置不相同。

本上传包恰有历史目录，不等于正式37项包自包含；本轮没有执行复现命令。

修复：区分纯生成输入闭合与完整门禁/发布依赖；显式声明并绑定历史基线包和目录，或提供只读基线封装；统一输出根。不能靠删历史检查实现表面自包含。

## 5. F01—F14 独立评级

FIXED/STATIC 仅表示第十一轮该项的具体静态缺陷已修，不意味着运行工具已验证。OPEN 表示仍有该责任范围内的已确认设计缺陷；PARTIAL 表示有实修但合同/覆盖/证据仍未完全闭合。

| 项 | 独立评级 | 依据 |
|---|---|---|
| F01 | PARTIAL | sealed-full新定义已同步，但Q04封存实际状态与链不一致 |
| F02 | FIXED/STATIC | 15 no-chain records均0，非链orphan计数已修；真实genesis/writer仍UNVERIFIED |
| F03 | OPEN | Q01按执行能力误判真实trigger；Q02安全reason映射不全 |
| F04 | PARTIAL | 状态封闭集合、max停止已修；Q01/Q05停止与回放、Q13复合覆盖未闭合 |
| F05 | FIXED/STATIC | source/staged同根、每load_file可信读取及PRE audit旧缺项已修；实际装载未验 |
| F06 | OPEN | 字段传递实修，但Q03 C17失败路径必需输入不存在 |
| F07 | FIXED/STATIC | 产品正例policy精确等于真实注册product policy；运行guard/argv/二进制身份未验 |
| F08 | OPEN | Q04—Q07：封存、停止、rename源权限、合法操作schema仍不可靠 |
| F09 | OPEN | 显式undo实修旧recover问题，但Q08事务身份与互斥不成立 |
| F10 | OPEN | 独立txid/备份与未完成事务闸门实修，Q09锁算法仍有竞争缺陷 |
| F11 | PARTIAL | release/index全字节核验实修；Q10日志/集合验证仍不足 |
| F12 | PARTIAL | 循环写与恢复指针顺序实修；Q08/Q09/Q11边界未闭合，真实持久性未验 |
| F13 | OPEN | 已有逐场景数据和代码绑定，但Q12现场错误、Q13判据过弱 |
| F14 | PARTIAL | 10模板正式封装实修；Q10/Q14完整集合及复现依赖声明未闭合 |

统计：**3 FIXED/STATIC / 5 PARTIAL / 6 OPEN**。F追踪矩阵的“全部FIXED”不能接受。

## 6. N01—N12 独立评级

| 项 | 独立评级 | PARTIAL是否准确／仍缺 |
|---|---|---|
| N01 读权限双向交集 | PARTIAL | 当前数据交集消除；真实路径、guard、硬链接/重解析未验 |
| N02 trusted加载/自读 | PARTIAL | F05具体修正成立；FileShare.Read、句柄及装载窗口未验 |
| N03 C06 policy | PARTIAL | policy与摘要可复算、F07正例已修；真实guard未交付 |
| N04 审计目录/角色 | PARTIAL | genesis/participant目录合同已修；真实ACL与目录创建未验 |
| N05 TEMP/产品环境 | PARTIAL | 合同同层读写具备；共享TEMP已披露，真实子进程隔离未验 |
| N06 审计validator | OPEN | Q04—Q07是实际设计漏检，不只是运行未验 |
| N07 安全分类 | OPEN | Q01/Q02仍存在原因和trigger错误 |
| N08 依赖/失败模型 | OPEN | Q03缺输入、Q05安全回放、Q13不可达复合故障 |
| N09 seal/早期失败 | OPEN | Q01/Q04跨模型及正式正例矛盾 |
| N10 绑定消费 | PARTIAL | 唯一路径及binding optional静态修正成立；CreateNew、摘要/父目录验证未验。C17非绑定输入缺口计入N08，不据此虚称绑定路径本身错误 |
| N11 CreateNew/map类型 | PARTIAL | 文书已区分CreateNew/map-list；真实运行仍缺，且Q07必须修复与validator的接口，不得声称验证闭合 |
| N12 发布/回滚 | OPEN | Q08—Q13有已确认设计与证据缺陷 |

统计：**0 CLOSED / 7 PARTIAL / 5 OPEN**。V9声称的12 PARTIAL/0 OPEN不准确。N11保留PARTIAL不豁免Q07对后续Phase0的阻断。

## 7. R01—R25 独立评级与关闭核查

本包是执行准备契约，没有新产品整改和新的产品动态证据。V9主文 :11、OPEN-ISSUES :49-51 仍声明0/23/2，未发现V9擅自将R项关闭。更早草稿中出现的CLOSED文字不是本轮独立结论。历史标题/待验项见父目录 `PHASE4.7-V5-CODEX-FINDINGS-TRACEABILITY.md:24-48`，独立历史状态见 `CODEX-P47-V5-FIFTH-INDEPENDENT-REVIEW.md:164-190`；本轮另核对原V5候选规格相关条文。

| 项 | 独立评级 | 本交付尚不能证明的事项 |
|---|---|---|
| R01 双Promise/最终结算 | PARTIAL | resultReady/completion全路径实现、取消/重试/资源结算及20行动态夹具 |
| R02 批量取消 | PARTIAL | cancelAll/pump/释放竞态运行证据 |
| R03 熔断 | PARTIAL | 健康/内部错误分类、恢复探针运行证据 |
| R04 旧事件 | PARTIAL | 旧worker/epoch/异步回调守卫 |
| R05 源码身份/去重 | OPEN | V5候选:456-459仍同时要求placeholderSeq相同与同身份非force合并；V9未修该规格 |
| R06 缓存 | PARTIAL | 失败缓存、容量、淘汰、等待者行为 |
| R07 deferred | PARTIAL | 256条/64MiB准入边界、取消守恒 |
| R08 调度 | PARTIAL | 小脚本优先、公平性与饥饿观测 |
| R09 D4超时 | PARTIAL | 固定公式、一次重试、性能实测 |
| R10 请求/尝试映射 | PARTIAL | retry与logical request结算一一对应 |
| R11 刷新 | PARTIAL | 同ID新源码、URL/epoch与重复提交竞态 |
| R12 后台迟到消息 | PARTIAL | SW reset、页面身份/纪元守卫 |
| R13 状态统计 | PARTIAL | 当前状态守恒与历史计数实际行为 |
| R14 Worker构建 | PARTIAL | 实际A/B bundle与浏览器Module Worker加载，非Node fork |
| R15 构建身份 | PARTIAL | 产品源码/版本/最终产物与sidecar信任链 |
| R16 DOM归属 | OPEN | V5候选:356-370与:618-619仍有精确token和commitSeq高水位两套判据 |
| R17 Panel/Harness | PARTIAL | 真实Panel全量结果/提交/渲染证据 |
| R18 deadline分类 | PARTIAL | 饥饿/超时/分析/提交/渲染分类优先级 |
| R19 完整一致性 | PARTIAL | 实际产品schema/全量序列化/失败语义/四方结果 |
| R20 closeBundle | PARTIAL | 原插件与控制对照实际行为 |
| R21 persistRun | PARTIAL | 拒写、历史隔离、D11后续决策 |
| R22 物理隔离 | PARTIAL | guard、读写/FD/native/硬链接/重解析验证 |
| R23 提升树 | PARTIAL | 最终树逆映射、字节及权威产物验证 |
| R24 原项目未变 | PARTIAL | 实际M0/M1、ADS/USN与未知变更归因 |
| R25 权限/W2 | PARTIAL | 实际账户、ACL、第二归档与独立执行授权 |

统计：**0 CLOSED / 23 PARTIAL / 2 OPEN**。这是对本包可证明范围的独立判断，不是重新确认所有旧产品设计正确。R05/R16是后续相应阶段的规格问题；不能用它们替代本轮Phase0契约缺陷的具体整改，也不自动扩大本轮范围。

## 8. 17 个故障场景的独立证据评价

本轮未重跑实验。SUPPORTED仅指保留的历史数据支持表述的狭义结果，不表示真实磁盘/断电/并发验证通过。17个scenario与report内容/代码摘要一致；这证明记录绑定，没有证明断言充分。

| 场景 | 独立评价 | 证据与边界 |
|---|---|---|
| first-publish | SUPPORTED，隔离历史 | after的A字节/指针/verified一致；测试本身只断言ok |
| republish-idempotent | SUPPORTED，狭义 | 同RID、A未变；未单独断言noop |
| determinism | PARTIAL | 与republish同分支，独立重建未验证 |
| fault-stage | PARTIAL | stage错误、A保留；staging残留被status忽略 |
| fault-backup | SUPPORTED，注入throw | 精确backup错误、A/指针恢复 |
| fault-switch-b | SUPPORTED，注入throw | 精确switch:b.txt错误、A/指针恢复 |
| fault-pointer | SUPPORTED，注入throw | 精确pointer错误、A/指针恢复 |
| fault-postverify | SUPPORTED，注入throw | postverify hook抛错恢复A；不是真实校验失败 |
| rollback-failed | PARTIAL | after支持最终A/rolled-back；再次recover的通过断言过弱、失败现场未保留 |
| kill-switch-b | PARTIAL；现场FAIL | 故障摘要B/B/A、恢复A；a/b所谓after-kill文件错误 |
| kill-pointer | PARTIAL；现场FAIL | 故障摘要B/B/B、恢复A；3个after-kill文件错误 |
| kill-then-publish | PARTIAL；现场FAIL | 未完成事务被拒记录存在、恢复A；a/b现场错误 |
| post-gate-undo | PARTIAL | 手动A→B→undo→A支持；build门禁失败、并发与noop撤销未覆盖 |
| lock-refusal | PARTIAL | 完整活pid哨兵拒绝支持；非真实并发窗口 |
| short-write | PARTIAL | chunk=3写入B支持；非操作系统短返回/零写故障 |
| release-corrupt | SUPPORTED，仅检测 | status报release mismatch；CLI退出码/恢复未验证 |
| pointer-corrupt | SUPPORTED，仅检测 | status报RID/release异常；CLI退出码/恢复未验证 |

按此狭义口径为 **8 SUPPORTED / 9 PARTIAL**，其中3个PARTIAL场景另有已确认现场文件不匹配。不能转述为17个失败场景均已独立通过。

lab report SHA-256：`2502a375a1b6b9e98dd39460cfdca127bdb9a2b15b0565df08e04f064644b07f`。场景具体独立解析值见 `analysis/publish-lab-independent-data.json`，逐分项证据见 `analysis/publish-lab-review.md`。

## 9. 四个最终问题与后续前置

**1. V9 是否可以接受？** 不可以，结论REJECTED。当前交付字节一致，但设计与证据不支持整体整改完成。

**2. 是否还有必须修复的设计缺陷？** 有。优先修Q01—Q10及Q12/Q13，尤其实际trigger→stop→seal、报告必需输入、审计操作授权、事务身份/锁与原始故障证据；Q11/Q14及过宽追踪声明同步修正。应另交新版本和新证据，保留V9/V8历史不动。

**3. 是否具备申请Phase 0的文档条件？** 目前不具备。不是仅等待外部输入：合同、checker、flow/audit/seal和发布协议仍有必须修复的静态矛盾。整改后仍应再独立审查，不能把本报告作为有条件启动授权。

**4. 实际启动Phase 0还缺哪些外部输入与动态验证？**

- 外部输入：20个真实payload源码/发布包，实际RELEASE-MANIFEST.json及用户批准SHA-256；管理员SID确认；P0_CODEX_ACCOUNT在批准候选中的明确选择；SECOND_ARCHIVE路径、绑定及目标授权；执行范围、时间窗、执行身份和用户单独启动授权。
- 运行工具：真正dispatcher/verifier/p0-audit/fs-guard及bootstrap/业务工具；合同生成器不等于运行实现，现工具文件sha256=null须由批准manifest绑定。
- 授权后的隔离验证：完整加载前校验和FileShare.Read窗口；有效ACL/SDDL及只读边界；真实FD、子进程TEMP、硬链接/junction/8.3/subst；writer intent/result/部分写/append/fsync/崩溃恢复；稳定错误码触发、失败后唯一A及安全停止；完整链/封存一致；C18 CreateNew/父目录替换/归档读回；C14批准map精确展开和零越权写。
- 发布层验证：修复后的锁初始化/释放竞争、postgate失败与后续事务交错、noop撤销拒绝、真实短返回和恢复失败、RID/日志/集合损坏、新鲜故障现场。磁盘错误、断电、外部kill及真正多写者不能由现throw/self-kill计数替代；其平台适用性及是否作为启动前置需明确批准。

以上为待满足条件，不是本轮执行计划。产品/浏览器/L1等后续验收没有在本轮提前进行，也不因其缺证被混写成已经运行失败。

## 10. 报告与独立附件

新报告及分析保存在 `/workspace/p47-independent-review/`，未写入任何V9/V8/V7或历史报告。主要工作底稿及数据：

- `analysis/v9-all-files-independent-sha256.tsv`：V9全部245文件大小/摘要；正式37项在下方另列。
- `analysis/integrity-results.json`：清单、V8历史、CURRENT/release/journal核验。
- `analysis/independent-data-check.py`、`.json`：独立canonical/argv/policy/TSV核验实现和结果。
- `analysis/static-permission-counterexamples.json`：仅静态数据谓词的rename源权限反例，无文件操作。
- `analysis/flow-c08-fatal-independent.json`：C08失败后必需输入缺失的独立数据遍历。
- `analysis/flow-audit-review.md`、`publish-lab-review.md`、`integrity-trace-review.md`：分项静态审查底稿。
- `analysis/input-inventory-before.json` 与 `input-inventory-after.json`：全部520个材料文件前后字节核验；完成后的结果另记 `input-preservation-result.json`。

报告内容按CONFIRMED/INFERRED/UNVERIFIED区分；未把“静态分支会漏检”的证明包装成执行过攻击或故障实验。

## 附录A：正式37项独立大小/行数/SHA-256

以下由原始文件独立计算，36项与交付清单一致，清单自身单独计算。行数遵从清单的LF行计数口径。

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V9.md` | 34522 | 433 | `b6d68a231dd7ad60d28de83faf6ef444881002b20e0acff6c2e382662432fdfc` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V9.tsv` | 233543 | 59 | `ddd1e613e17d6879aa250fcad8466eff3c4135f16bb7d965541ceb8727bc29eb` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json` | 1409466 | 39440 | `8bbf8b945f66e3b21d27cd4fbc57240f6d276a3aa0ff1b9228b6c73392ca8607` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md` | 31667 | 519 | `5d1260cb7c5f56bb16dcdb1c4e3b577915e8daa7be24e13a91e86886311bf1f0` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json` | 121927 | 1 | `543580989c30ef770409c48f8fd698c2879febc8fb026dda8f2ca2b9ba725041` |
| `PHASE4.7-PHASE0-V9-FAILURE-MODEL.md` | 5141 | 83 | `2a0c19a87ecd2f70d8a59b044b3fff6a85e668799e4ccd6d7e42614907ad49f0` |
| `PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md` | 5576 | 81 | `885373825de38fc3bda3a4a05eb582953b87fa0f398b71a4c3a41ed9cd0cd9c9` |
| `PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md` | 3700 | 54 | `d48dbdd7bef32dacdeb0776d57c06fe0b6b886885d64e9e7ca68808ded52435b` |
| `PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md` | 3125 | 36 | `78e292beef2e39f69591e6c2f61173bbaff84ef3f630a721078e6edbc41e5bb1` |
| `PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md` | 9190 | 36 | `65284e63ddbfcd81256071fd56fbe485b168b72af567d5f0ec0a9275ac10be6e` |
| `PHASE4.7-PHASE0-V9-OPEN-ISSUES.md` | 3397 | 55 | `672b8afd74ac44220bad8dd1aea8bf2cfd9ab27775cb62afff3c9f554b3d9715` |
| `PHASE4.7-PHASE0-V9-SELF-CHECK.md` | 4025 | 53 | `c5a482f6dc7d170189d62614d9a22f4fbb9ced1116e27933e824b8cbaa304810` |
| `PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md` | 2431 | 40 | `67447cdbe580bc9058d7422da427db7f5db47359457a627b883e4e00554d3b1e` |
| `p0v9-lib.cjs` | 7830 | 166 | `7746993bf960456b27b3aa8ecfc7cec663d2403268dfe5f0321ecce17a00e654` |
| `p0v9-spec.cjs` | 53609 | 746 | `c8dc8f323d61a0a1bf9bc42669a9212a2810600eceb6d37994d29f4a0713639d` |
| `p0v9-flow.cjs` | 9962 | 232 | `3fc55bdd6c558c4bed5c9a53f5d5f6869c8342a185b4ef48abe57411104a3a3a` |
| `p0v9-audit.cjs` | 41769 | 555 | `867c0eaed9341423a24397921c56be6377dd5059de62631ddf75b846f89db527` |
| `p0v9-build.cjs` | 56511 | 837 | `c02cb07f508b16d04a847eafb324c65ff7cad81dc2c521764a60f8c33f923c20` |
| `p0v9-publish.cjs` | 19834 | 436 | `3799fecc5b784d02bf8e2d77d42282915624a0f44885d51eb7b9fd78455e264c` |
| `p0v9-check.cjs` | 60331 | 1006 | `973e38fecfd830cbd57e2125ea890088bdfd8b11ca2ea7a84fa43315f7122641` |
| `p0v9-verify.ps1` | 6452 | 106 | `091ed69c6d6a508ae4858991739bcb707c540ea8b595be4a0cbb5f0ea3cae7dc` |
| `p0v9-parse-inline.ps1` | 1329 | 25 | `3c5aa68933d9de98b5842d8a2ea66ab9ecd247d4fa0b5b134ac398dea3fa5eaf` |
| `p0v9-hygiene.cjs` | 6979 | 90 | `6c4819d194798fcf4c072937a23bc8a780397782a2bed1939ed341269a0d3827` |
| `p0v9-controlconfig-check.cjs` | 1002 | 20 | `c4cacf47f3e281f717dd58a269a97b90fe446d1ae3463e82cd8b9c59fb863673` |
| `p0v9-lab.cjs` | 9971 | 210 | `354af10dc234b818e5b7ec274d7aea5dda42decf6bdde5575090855607b42774` |
| `p0v9-manifest.cjs` | 6386 | 145 | `21543f89c34e8612ee27ef4e99df4956ee2f255a89f89bb1549088860f1013cb` |
| `doc-src/PHASE4.7-PHASE0-START-CONDITIONS-V9.md` | 12484 | 143 | `0160004babd7fa820c9f35f10e42ce9d3a75cbbe49aa4380a9d9ed3c3f8bfdb3` |
| `doc-src/PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md` | 3700 | 54 | `d48dbdd7bef32dacdeb0776d57c06fe0b6b886885d64e9e7ca68808ded52435b` |
| `doc-src/PHASE4.7-PHASE0-V9-FAILURE-MODEL.md` | 5141 | 83 | `2a0c19a87ecd2f70d8a59b044b3fff6a85e668799e4ccd6d7e42614907ad49f0` |
| `doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md` | 3125 | 36 | `78e292beef2e39f69591e6c2f61173bbaff84ef3f630a721078e6edbc41e5bb1` |
| `doc-src/PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md` | 9190 | 36 | `65284e63ddbfcd81256071fd56fbe485b168b72af567d5f0ec0a9275ac10be6e` |
| `doc-src/PHASE4.7-PHASE0-V9-OPEN-ISSUES.md` | 3397 | 55 | `672b8afd74ac44220bad8dd1aea8bf2cfd9ab27775cb62afff3c9f554b3d9715` |
| `doc-src/PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md` | 5576 | 81 | `885373825de38fc3bda3a4a05eb582953b87fa0f398b71a4c3a41ed9cd0cd9c9` |
| `doc-src/PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md` | 2431 | 40 | `67447cdbe580bc9058d7422da427db7f5db47359457a627b883e4e00554d3b1e` |
| `doc-src/PHASE4.7-PHASE0-V9-SELF-CHECK.md` | 3961 | 53 | `09e0ac559fd03afe68c813eb998e5f4ef0bea4320b15412f1222b2dd0d0a6df5` |
| `doc-src/PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md` | 9253 | 99 | `90f92835230fc60815d5a8a3095665d1fb9e3378c8038481c709df0b9de473b9` |
| `PHASE4.7-PHASE0-V9-DELIVERY-MANIFEST.md` | 6998 | 95 | `be38bfb6035f5edeefe98fcd26a4167b46668825567fb15529da7df00864264c` |

## 材料保全结果与停止声明

独立前后清单比较：520/520 个材料文件路径、字节数和SHA-256完全一致，新增/删除/更改均为0。此结果证明本轮审查未改动解压材料；历史不变性另限于已知基线可比对的范围。

**最终结论：REJECTED。新报告保存后停止，等待用户决定；未授权或启动任何Phase 0操作。**
