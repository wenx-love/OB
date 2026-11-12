# OpenCode 对 V9 第十二轮独立审查的回应

日期：2026-11-12 20:38:21（Asia/Shanghai）
审查对象：`C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\`
回应范围：Q01—Q14、F01—F14、N01—N12、R01—R25。
性质：只读核对与整改计划。未修改 V9/V8/V7，未执行 V9 工具、附件脚本、发布器、恢复器、lab 或 Phase 0。

## 1. 核对输入与身份

| 输入 | 字节 | SHA-256 | 状态 |
|---|---:|---|---|
| `reviews\V9-TWELFTH-INDEPENDENT-REVIEW.md` | 38743 | `7c5e5f0d1ce77d388c2e80104613f22c61a99d02bff55e7ad902af843c1179dc` | 与用户给定值一致 |
| `reviews\V9-TWELFTH-INDEPENDENT-REVIEW.zip` | 93261 | `60ed0fff4c23d518f1e2cf68308bd6472d7734da59e805dd5778f828e2ada65d` | 已读目录清单，未执行内部脚本 |
| V9 manifest | 6998 | `be38bfb6035f5edeefe98fcd26a4167b46668825567fb15529da7df00864264c` | 36 条 + 自身 = CURRENT 37 条 |
| V9 registry | 1409466 | `8bbf8b945f66e3b21d27cd4fbc57240f6d276a3aa0ff1b9228b6c73392ca8607` | 与报告附录一致 |
| V9 vectors | 121927 | `543580989c30ef770409c48f8fd698c2879febc8fb026dda8f2ca2b9ba725041` | 与报告附录一致 |

独立复核：V9 正式 36 条 manifest 与清单自身逐项大小/SHA-256 匹配；`CURRENT` 37 条集合与物理文件一致；`rid=380e5e9d…` 可重算；V8 26 项历史哈希未变。**当前快照一致**这一事实成立，但它不否定下述设计缺陷。

## 2. Q01—Q14 逐项回应

### Q01｜失败 trigger 未绑定，普通 fatal 被误判 chain-broken

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-flow.cjs:148-149` 与 `p0v9-check.cjs:784-785` 用“该执行全部 failure_modes 中是否有人含 `SEC-CHAIN-MISMATCH`”决定 `chainBroken`，与实际注入的 class/trigger 无关。注册表 `flow.matrix.rows_data` 复算：340 行中 151 行 `chain-broken`，其中 60 行 `fail_class=fatal`；`bound/C07-B-C08-E01/fatal` 与 `bound/C19-E01/fatal` 均直接标 `chain-broken`。`stop` 从未因 chain-broken 升级，`:106-109` 仍允许退出到 SEAL。  
**推断（INFERRED）**：若真实运行按具体错误码失败，封存与停止会与规范不一致；未真实触发。  
**根因/影响**：失败分类以“能力集合”代替“本次实际错误码”；封存模式被误选，SEAL 仍可写。  
**整改**：为每个 `failure_mode` 注入并携带 `code/class/trigger`；运行/模拟只使用被选中的 code；`SEC-CHAIN-MISMATCH` 在发生点立即置 `stop=chain-broken`，拒绝后续链写与封存；普通 fatal 不得选 chain-broken。  
**验证**：新增“普通 fatal”“ORIGINAL 改变”“真实链摘要错误”三组场景，检查 stop、允许后继、seal 模式；检查器从协议不变量推导，不读取生成器中间值。

### Q02｜精确 reason 表未覆盖实际 reason，身份/摘要失败仍降为 fatal

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-spec.cjs:56-121` 的精确表使用无编号措辞，而 C00 的 `fail_closed`（`:249-255`）是 `account name/SID mismatch (45)`、`non-admin token (46)`、`runtime binary size/hash mismatch (49)`、`manifest hash/schema/20-file/key-tool/anchor mismatch (43/44)`；注册表 C00 六条显式失败全部 `fatal/trigger=null`。C03-PROBE 的 `(51)(52)(54)(56)(57)(58)` 同样未映射，只有 `(53)(59)` 是 security。`p0v9-check.cjs:603-608` 只验证“已标 security 的在表中、非 security 的不在表中”，没有独立判断哪些错误必须属于安全类。  
**推断**：C00 是 pre-run fatal，仍会停止，未观察到继续业务；影响是分类/归因与未来安全汇总不完整。  
**根因/影响**：人类 reason 被当作稳定标识；编号一改就漏映射。  
**整改**：引入稳定 `ERR-*` 码，所有 failure_mode、审计 close、报告只引用 code；reason 仅说明。对身份、二进制/清单摘要、路径越界、重解析等建立独立“必须 security”谓词；C00/C03 全量重标。  
**验证**：逐条断言 C00/C03/C05 等身份与摘要错误的 class/trigger；新增“reason 文本改动但 code 不变”的正例与“同一 reason 不同 code”反例。

### Q03｜C17 在失败路径仍要求必然未生成的 copies.json

**结论：同意。**  
**事实（CONFIRMED）**：C17 `optional_reads` 已含 `out\C09` 子树，但精确输入 `out\C09\C09-E01\copies.json` 仍是 `optional=false`（registry `C17-E01.reads.business`）。C17 的 requires 只要求 C10-P..C16 `recorded`，不要求 C09 ok；`bound/C08-E01/fatal` 进入 halt-business 后 C09 被 skip、copies.json 未生成，C17 仍可作为 finalizer 运行。`p0v9-check.cjs:595-600` 只在“producer 有直接 requires 且非 ok”时检查 optional，漏掉无直接 requires 的 C09。  
**推断**：模型可把 C17 记为 ok；真实运行会读不到必需输入。  
**根因/影响**：可选子树与精确必需文件混用；finalizer 的输入存在性未逐路径证明。  
**整改**：对每个可达失败/跳过场景，枚举 C17/C19/REPORT 的输入存在性；`copies.json` 要么改为真正 optional 并在报告中记录“缺失/跳过”，要么把 C09 ok 纳入 C17 的成功前置；明确 halt-business 下 finalizer 的 before/after 例外。  
**验证**：新增 C08 fatal、C09 fatal、C10-P fatal 三个场景，断言 C17 实际读取的每个文件要么存在且 ok，要么 optional 且报告缺失；不得只查字段。

### Q04｜正式 seal 正例与关联链矛盾，校验器未验证完整状态分区

**结论：同意。**  
**事实（CONFIRMED）**：`seals[1]` 绑定 `security_excerpt` 尾摘要，而片段已有 C12/A-C12 两个 open/close 与 B-C13/C13 两个 skip，seal 却写 `skipped=[]`、`segment_counts={opened:1,closed:1,skipped:0}`；`seals[3]` 绑定 C10-N orphan/C11 skip，abort 却写 C12/security；`seals[0]` 绑定 C01 链尾 seq=3，却写 `chain.records=1`。`p0v9-check.cjs:448-491` 只比尾 seq/hash/kind，找不到关联链时 `recs=null` 直接跳过；`validateSeal` 不重放分区/计数/abort/binding。  
**推断**：这些正例不能作为“完整封存一致”的证明。  
**根因/影响**：片段与全运行混用；seal 是自述对象，未与链状态机交叉验证。  
**整改**：seal 只对完整验证链生成；用链逐执行重放推导 `opened/closed/skipped/orphaned/abort/security/open_segments`，与 seal 全字段比对；片段只能作为“片段证据”，不得作为 sealed-full 正例。  
**验证**：修正 seal_0/1/3，新增“计数少一”“abort 指向错误执行”“open_segments 与尾不符”负例；检查器必须从链独立推导，不能读取生成器汇总。

### Q05｜安全停止回放只对有 after wrapper 的失败生效

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-check.cjs:439-441` 的 `halted=true` 位于 `failed/aborted close && wrapperOf[exec]` 内；C02/C06/C07-M0 等无 wrapper 的 security close 不激活 halt。`:435-437` 只检查 `segment_open`，规范要求 open/close 都受限。  
**推断**：无 wrapper 的安全失败后，target/finalizer/bind 的 open 可漏检；未真实构造链验证。  
**整改**：任何 security close 一律激活 halt；wrapper 只决定是否允许唯一 A；对所有执行状态与严格允许的下一记录做完整回放（含 close）。  
**验证**：新增 C02 security、C06 security、C07-before security 三条片段，断言后续 target/finalizer 的 open 与 close 都被拒绝。

### Q06｜rename 只验证源可读，遗漏对受保护源的破坏

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-check.cjs:210-219` 对 rename/copy 只检查 `src_path` 可读；写规则、`protect_write` 只检查目的 path。C08 可读 ORIGINAL 子树、可写 `RUN\tmp`，且 protect 含 ORIGINAL；构造 `op=rename, src=ORIGINAL\README.md, path=RUN\tmp\moved-README.md, rule_ref=C08-E01.business_writes[5]` 可通过现有判断。product 事件还使用 `ex.protect_write` 而非 `ex.product.protect_write`。  
**推断**：真实 rename 会删除/改名受保护源；未执行文件移动。  
**整改**：rename 对源和目的分别验证操作授权、保护集、对象身份；schema 增加 `src_rule_ref`；product 使用产品层 protect。  
**验证**：新增上述反例负例，期望 `perm.src_write`；新增合法 rename（源在可写子树）正例。

### Q07｜操作校验不能表示部分合法记录，schema 未闭合

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-check.cjs:87-90` 的 `OP_RULES` 没有 `map-listed-file-write`；C14 `writes.business[4]` 正是该 op，合法展开后的写无法被表示。`:240-263` 对 denied 读也要求正确 layer/rule_ref，而规范允许 denied 且无匹配规则时 `rule_ref=null`。`:232-235` 对 ok 的 mkdir/acl/delete/rename 也要求 `after.bytes`/`after.sha256`，非 append 还要求 `bytes_written=after.bytes`；目录/元数据操作没有合法编码。`before` 对象、read entry 的 `path_kind` 未完整校验。  
**推断**：真实 writer 的合法记录会被 checker 拒绝；未执行。  
**整改**：按操作定义 schema：文件写/目录创建/ACL/delete/rename 各自的 before/after/bytes 语义；map-list 展开后的精确文件、摘要与 `rule_ref` 绑定；denied/absent 允许 null ref；补合法正例。  
**验证**：新增 C14 展开正例、denied-null-ref 正例、mkdir/acl/delete/rename 各一条正例；对应非法 op/字段反例。

### Q08｜undo 没有锁和期望事务身份，post gate 可撤销其他事务

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-publish.cjs:388-399` 的 `undo` 不取 LOCK，也不接收期望 txid/rid；`p0v9-build.cjs:806-822` 在 publish 返回（LOCK 已释放）后运行 post gate，失败调用 `undo(ROOT,{})`。静态调度：A 提交 B → C 提交 C → A post gate 失败 → undo 读最新 journal 撤销 C；noop 返回 `:229` 未创建本次事务，post gate 失败仍可撤销此前 verified 事务。  
**推断**：并发损坏未执行；代码路径可直接确定。  
**整改**：post gate 纳入持锁的 `pending-acceptance` 阶段，或 undo 持锁并严格校验调用方 `txid/rid/old_current`；noop 不得撤销历史事务；身份不符只拒绝、不写文件。  
**验证**：隔离实验覆盖 A/B/C 交错、noop 后 gate 失败、错误 txid 撤销；断言只撤销期望事务，其他事务字节不变。

### Q09｜LOCK 初始化窗口可被误当陈旧锁删除

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-publish.cjs:101-118` 用 `wx` 创建空 LOCK 后才写 pid；B 在 `:112` 解析失败得 `null`，`:114` 直接 unlink 仍被 A 持有的锁。`releaseLock` `:119-121` 不校验当前锁是否仍属自己就 unlink。  
**推断**：两个发布者可同时进入临界区；未做真实并发。  
**整改**：锁文件用“临时文件 + rename”原子写入完整 `{token,pid,created}`；初始化未完成一律拒绝；删除前校验 token/文件身份；陈旧锁只在完整记录且 pid 死亡时恢复；release 只删自己的 token。  
**验证**：新增初始化竞争与释放交错测试（另行授权）；当前只做静态断言与隔离脚本设计。

### Q10｜journal、CURRENT 成员集合和残留状态未完整交叉验证

**结论：同意。**  
**事实（CONFIRMED）**：`status` `:170` 仅在 journal 存在时记录；journal 缺失不加入 issues。`:183-187` 只比较 state/rid，不比较 `journal.files[].new` 与 CURRENT。`rolled-back` 不严格绑定 `old_current`。`:188` staging 只列出，不影响 issues/退出码。checker `:941-964` 校验固定 manifest 集合，CURRENT 内容单独校验，但不做 CURRENT 路径集合与 manifest+self 的双向相等。生成器动态收入工具/doc-src，manifest/checker 用固定名单，存在共同盲点。  
**推断**：内部自洽的子集指针可漏正式文件；当前 37 项集合已独立核对正确。  
**整改**：校验 journal schema/txid/state/new/old/backup 绑定；缺失 journal 视为 issue；manifest 生成映射、CURRENT、release index、物理集合四方双向相等；明确 staging 允许策略并影响退出码。  
**验证**：新增缺失 journal、`files.new` 被替换、CURRENT 子集、staging 残留四组测试；期望 status 退出 1。

### Q11｜路径与持久化保证的追踪声明超出实际实现

**结论：部分同意。**  
**事实（CONFIRMED）**：物化目标经 `abs` 做词法限制，短写循环实修；但 `p0v9-publish.cjs:45-53` 的 `abs` 只用于物化路径，`:125-138` release 路径、`rollback` 的 `journal.backup_dir` 直接 `path.join`，未统一经 `abs`；`abs` 不检查符号链接/重解析对象身份。目录 fsync 不支持时返回 false，不能升级为断电保证；LOCK 自身仍是单次 `writeSync`。  
**部分同意点**：追踪表已把“目录同步/断电”标 UNVERIFIED，但没有把“journal/index 路径全部经 abs”限定为物化路径，措辞过宽。  
**整改**：rid/txid/索引路径从批准根派生并校验；release/backup 也走 `abs`；元数据与实际对象身份校验；修正追踪表措辞，把词法限制、fsync 尝试、断电保证分列。  
**验证**：新增 `..`/绝对/重解析/伪造 backup_dir 负例；静态断言全部入口路径经统一函数。

### Q12｜after-kill 原始文件实际是恢复后的文件

**结论：同意。**  
**事实（CONFIRMED）**：`p0v9-lab.cjs:90-102` 先保存 afterKill 摘要，执行 `recover` 后才在 `:149-152` 复制 `after-kill-*.txt`。独立复算：kill-switch-b 与 kill-then-publish 的故障树 B/B/A、留存 A/A/A（a、b 不匹配）；kill-pointer 故障树 B/B/B、留存 A/A/A（3 个不匹配）；合计 7/9 与 afterKill 冲突，9/9 与恢复后一致。  
**推断**：留存文件不能证明中断现场；树与 journal 只支持“曾在阶段中断并恢复”的有限历史。  
**整改**：恢复前复制故障树、journal、CURRENT、release index、子进程输出到独立 `fault-snapshot`；每个副本绑定摘要；保留旧证据不改写，新实验另存。  
**验证**：新 lab 场景先断言“留存文件哈希 == afterKill 哈希”，再断言恢复后哈希 == A；不通过则标记 FAIL 并保留现场。

### Q13｜故障与复合场景有假通过可能，名称不等于覆盖

**结论：同意。**  
**事实（CONFIRMED）**：determinism 与 republish 共用分支，第二次是同树 noop；rollback-failed 后 `recover` 断言 `!(ok && state==='verified')`，recover 失败也会通过；post-gate-undo 只直接调用 undo；lock-refusal 只手写完整 pid；short-write 只把请求 chunk 设为 3；release/pointer 只查 status 函数，不测 CLI 退出码；kill 只断言非零/有 signal。340 行中 `C10-N+C13/gate`、`C14+C15/gate`、`C12/security+C19/fatal` 实际 `failed=1`，第二故障已 skipped。  
**推断**：17/17 不能代表完整覆盖；未重跑。  
**整改**：每个场景记录 `requested/reached/observed`；对未到达的第二注入标 `not-reached`；为每个声明设计能失败的独立断言；determinism 用两个独立根/两次进程；post-gate 通过 build 触发；short-write 注入真实短返回；status CLI 退出码单测。  
**验证**：场景报告逐项输出 requested/reached/observed 与断言；不可达组合不得计入通过。

### Q14｜模板已封装，但“仅凭 37 项正式包完整复现”仍不成立

**结论：同意（并补充边界）。**  
**事实（CONFIRMED）**：10 个 doc-src 已入 manifest/release，旧模板遗漏实修。`p0v9-build.cjs` 的完整 `main` 后置门禁调用 `p0v9-hygiene.cjs ..`（`:816`），hygiene 校验包外 V7/V8；checker 也内置 V8 26 项哈希；`p0v9-lab.cjs:15` 的 `OUT=__dirname/../_publish/lab`，从正式根运行会写到父目录 `_publish/lab`，与 `work` 运行位置不同。纯生成阶段可从包根 `doc-src` 读取（静态可判定），但完整 build/gate/publish 依赖包外历史。  
**整改**：区分“纯生成输入闭合”与“完整门禁依赖”；把 V7/V8 基线作为显式绑定输入包（单独清单/摘要），或在完整流程中显式声明外部基线；统一 lab 输出根；修正文档措辞。  
**验证**：仅复制 37 项到隔离目录，分别执行“纯生成”和“完整 gate”，记录各自缺失项；通过条件分开定义，不把纯生成通过写成完整复现。

## 3. F01—F14 评级回应

同意第十二轮独立评级，V9 自述的“14/14 FIXED”不成立：

| 评级 | 项 | 数量 |
|---|---|---:|
| FIXED/STATIC | F02、F05、F07 | 3 |
| PARTIAL | F01、F04、F11、F12、F14 | 5 |
| OPEN | F03、F06、F08、F09、F10、F13 | 6 |

具体依据见 Q01—Q14；不再以 V9 自检结论替代。

## 4. N01—N12 评级回应

同意 **0 CLOSED / 7 PARTIAL / 5 OPEN**：

- OPEN：N06、N07、N08、N09、N12（对应 Q01—Q05、Q08—Q13 的设计/证据缺陷）。
- PARTIAL：N01、N02、N03、N04、N05、N10、N11（运行实现或动态验证未交付）。
- 不把 Q07 对 N11 的接口阻断降级为“仅运行未验”。

## 5. R01—R25 评级回应

同意 **0 CLOSED / 23 PARTIAL / 2 OPEN**。R05、R16 仍 OPEN，R01 仍 PARTIAL。V9 没有产品源码整改或新的产品动态证据；本包不改变 R 项。该评级只针对本交付可证明范围，不重新确认旧产品设计全部正确。

## 6. 已确认事实 / 推断 / 未验证

- **CONFIRMED**：Q01—Q14 中的源码分支、矩阵行、seal 自述、C00/C03 映射、C17 输入、C14 op、rename 静态反例、lab 现场哈希、lock/undo/status 代码路径。
- **INFERRED**：并发双写、真实 rename 破坏、真实 writer 被 checker 拒绝、封存误选导致的真实错误；均未执行攻击或故障。
- **UNVERIFIED**：真实 dispatcher/verifier/audit/guard/writer、FileShare.Read、ACL/SDDL、FD/硬链接/重解析、断电/磁盘错误/外部 kill/多写者、Phase 0 本身。

## 7. 结论

第十二轮报告的 Q01—Q14 **全部成立或部分成立**：12 项同意、2 项部分同意（Q11、Q14）、0 项不同意。V9 **REJECTED** 的结论接受；V9 当前不具备申请 Phase 0 的文档条件。整改计划见同时间戳的 `OPENCODE-P47-V9-REMEDIATION-PLAN-20261112-203821.md`。

本轮未修改 V9/V8/V7，未执行任何 V9 工具、附件脚本、发布器、恢复器、lab 或 Phase 0。
