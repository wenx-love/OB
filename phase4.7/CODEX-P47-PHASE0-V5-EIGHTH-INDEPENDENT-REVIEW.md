# OB-Recover Phase 4.7：Phase 0 V5 第八轮独立安全审查

日期：2026-11-11
审查对象：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan 中的 V5 启动包。
审查性质：只读静态审查与独立数据复算。仅新增本报告；不执行交付工具、C00—C20、测试、tsc、构建、浏览器、Worker 实验、L1 或 Phase 0。

## 总体结论

**REJECTED：存在实质性启动契约缺陷，当前不能申请启动 Phase 0。**

V5 修正了 source/staged 路径、C05-FINAL 的入口、部分必要读取许可、观察者登记、报告与终端封存的职责划分，以及第二归档的条件分类。但生成器、最终 JSON、TSV、审计规范与向量并未形成一致且可执行的合同。

本轮确认的主要阻断：

1. 16 次执行允许读取具体 staged 工具文件，同时绝对禁止读取其父目录 RUN\tools。
2. TSV 的控制层读取权限在 JSON 中全部丢失，影响 54 次执行；另有 dispatcher 自检、事件分片和输出目录创建许可缺口。
3. C12/C13/C16 要求产品子进程写 vitest.json，但产品层没有该文件写许可；C10 三变体未登记真实子进程 argv。
4. 审计正例违反自身 schema，链的物理字节计数漏掉 LF；C01 链角色与 107/101 计数不一致。
5. C19 覆盖截止点与读取范围有冲突；失败 after、早期中止、C18 未绑定跳过的后继条件不能同时成立。

独立评级：
- B1—B9：0 CLOSED / 5 PARTIAL / 4 OPEN。OPEN：B1、B3、B8、B9。
- Q01—Q07：0 CLOSED / 0 PARTIAL / 7 OPEN。各项的旧子问题有修正，但整体仍有明确缺口。
- R01—R25：维持 0 CLOSED / 23 PARTIAL / 2 OPEN；R05、R16 OPEN，R01 PARTIAL。
- 交付完整性：19/19 文件已读取和测量；18/18 被清单列出的文件匹配其字节数、行数、SHA-256；清单本身已测量，但没有用户提供的外部预期摘要。

拒绝依据是可定位的静态冲突。未运行的 ACL、真实 fork、OS 边界和运行工具行为继续为 UNVERIFIED，不能把未知写成已失败，也不能把文档或机械检查通过写成运行成功。

## A. 输入文件与独立验证方法

### A.1 文件身份与哈希

基准目录：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan。
下表文件均以此目录为前缀。SHA-256 为本轮直接读取原始字节复算；行数按 CRLF/LF/CR 分行、末尾换行不另计空行。清单不包含自身摘要是合理的避免自引用方式，但其真实性需要外部批准值。

| # | 文件 | 字节 | 行数 | 本轮 SHA-256 | 比对 |
|---|---|---:|---:|---|---|
| 1 | PHASE4.7-PHASE0-START-CONDITIONS-V5.md | 65026 | 547 | 3d5e51bc1af7829d26c1de6266cc7706091807189f5eea7befa994a2d118fdcd | 匹配 |
| 2 | PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv | 130063 | 58 | 1b7ac41018ed4a4345a0122cc74576c56d6f6c128b91e430b9b184e98618fb95 | 匹配 |
| 3 | PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json | 549852 | 16207 | 078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71 | 匹配 |
| 4 | PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md | 24322 | 442 | fa6fecbacfe9142f9b2f7ac0d05aea6cdf25b89b275ae7c60edc3ba9ac323220 | 匹配 |
| 5 | PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json | 7981 | 1 | dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042 | 匹配 |
| 6 | PHASE4.7-PHASE0-V4-TO-V5-CHANGELOG.md | 8579 | 113 | 071f9c9e29398b0e4e17e1d3487497bd68a07037ec2453ab20db07fd24831211 | 匹配 |
| 7 | PHASE4.7-PHASE0-V5-OPEN-ISSUES.md | 3726 | 37 | 2ef5bfd8a9799b7dc37da883722adebaa91259ab576aba2c89f4a7c846fb92b1 | 匹配 |
| 8 | PHASE4.7-PHASE0-V5-SELF-CHECK.md | 6085 | 76 | bb33884a2be571dc5d62fbf73854504dda1614026de52578623286f11f5c9e38 | 匹配 |
| 9 | PHASE4.7-PHASE0-V5-Q01-Q07-TRACEABILITY.md | 7348 | 92 | 544e869182aef684682ee4412b7fa9ab5f1f21e4eee130270f7a38e4a3d5becb | 匹配 |
| 10 | p0v5-lib.cjs | 6439 | 146 | c4849b053e53beaea88691b1f9af38bde41c6e107dcf7ac74a9abea3f2c45030 | 匹配 |
| 11 | p0v5-spec.cjs | 31995 | 471 | 66e264f4f270ce7a6c641ad52796ef8431fb2f0be47ffe806e9a4e7546063ab3 | 匹配 |
| 12 | p0v5-audit.cjs | 16818 | 382 | b7cde1335997c61941d5e386219f998fca76f85eab37303fc71dbb206a5739dc | 匹配 |
| 13 | p0v5-build.cjs | 22693 | 411 | bcd280abbdfda54f1bc9c1cecb285520e5f7cb2050069d203e6beac7769c0c12 | 匹配 |
| 14 | p0v5-check.cjs | 13696 | 171 | 1f7a0836d74d06729a6412ddabe89234d21e09e7ff4b0153eed5d8abc8d078f1 | 匹配 |
| 15 | p0v5-verify.ps1 | 7960 | 139 | f69bc901d7b580554849982c70555d21c1b990f93cfaf89fae5ab3c50bac39cd | 匹配 |
| 16 | p0v5-parse-inline.ps1 | 1155 | 27 | 8344cb3f04c7faae485c16d64861399afe13a5aef5b8dc429d934d7ce401de50 | 匹配 |
| 17 | p0v5-hygiene.cjs | 2324 | 44 | f3a4f01ae5d29b4bcf95d0cbc3ac3360bf36194f9f6755cf4d597b36e8073f4c | 匹配 |
| 18 | p0v5-controlconfig-check.cjs | 621 | 13 | 4e6773c51bf943253a7e708560b3847a8f33b21ac13ffbffd9bce14a6ca3ab8c | 匹配 |
| 19 | PHASE4.7-PHASE0-V5-DELIVERY-MANIFEST.md | 4485 | 69 | 9bdd69a82b4063717b6ec0109b86a37b5e3a6a8678adeb855bf5670e947c5ff9 | 已测量；无外部预期值 |

第七轮报告：CODEX-P47-PHASE0-V4-SEVENTH-INDEPENDENT-REVIEW.md，38429 字节，372 行，SHA-256 af6a2c394947c1f71275aba1844cc67c5e603a07a3c70aeab33f1566b6f3f6d0，与用户给定值一致。
V4 七份输入全部重新读取/核对，哈希与第七轮记录一致；结合方案 V5 Candidate 的 E1—E6 与既有 R 表追溯。没有用 V5 自检代替历史报告。

### A.2 本轮实做、历史声明与未验证事项

本轮使用独立编写的只读数据处理，通过 stdin 读取文件、解析、计算摘要；未 require/import 任何 p0v5 模块，未执行任何交付脚本。语法检查只解析，不求值。

| 检查 | 本轮结果及边界 |
|---|---|
| 文件测量 | 上表 19 个均完成；清单中的 18 组元数据全匹配 |
| JSON / TSV | JSON 可解析；TSV 57 数据行、每行 26 列 |
| 命令与执行映射 | 21 个唯一 command ID，57 个唯一 exec ID；commands.exec_ids 与 executions 对应，plan_order 为 1..57 |
| 顶层 argv | 57/57 参数数组 SHA-256 独立复算匹配；两条 inline 文本摘要匹配 |
| 子进程 argv | 5 条非空 target_argv 可核对；C10-P/N/S 的 target_argv、product.argv 及摘要全为 null，不能计为已验证 |
| TSV 与 JSON | 逐格 57×26=1482 项；1428 一致，54 不一致，均为 JSON 丢失 control_reads |
| 发布映射 | 20 个唯一 payload ID/source，16 staged、4 bootstrap；这不是当前交付 19 文件的另一种计数 |
| 15 条向量 | 15/15 canonical 与独立规范化结果相同；15/15 文本哈希正确；语义/物理链校验发现错误，见 D/Q04 |
| 控制配置 | 从主文实际代码块复算：325 字节、8 行、LF、无末尾 LF；摘要 18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003 |
| 工具语法 | 7 个 CJS 通过 vm.Script 仅解析；2 个 PS1 与2条 inline 通过 PowerShell Parser 仅解析；未执行 |
| OpenCode 158/0 与47/0 | 仅确认自检报告有此历史声明，并阅读对应检查源码；本轮没有运行这两套检查，也没有重新宣称158/47项通过 |
| 生成幂等/写入实验 | 本轮未运行；历史自检声称的幂等结果不是本轮结果 |
| 实际执行行为 | dispatcher、guard、审计器、真实 fork、ACL、FD、原生进程、复制与链接均 UNVERIFIED |

## B. 19 个交付文件逐项源码/内容检查

| # | 文件简称 | 本轮检查结论 |
|---|---|---|
| 1 | START-CONDITIONS | 阅读正文与生成附录；首次 staged 入口方向已修；临时目录、截止点、失败路径仍冲突 |
| 2 | READ-WHITELIST | 57×26 独立解析；控制读列有内容而 JSON 无对应字段；不可按“同源”推定一致 |
| 3 | EXECUTION-REGISTRY | 检查全部21命令/57执行；结构可解析，权限冲突、C10空argv与条件分支阻断 |
| 4 | WRITE-AUDIT-SPEC | schema与封存步骤较V4明确；正例、字节口径、角色权限与失败收尾仍不合规 |
| 5 | AUDIT-VECTORS | 15个序列化/哈希正例可复算；不是15个有效审计业务正例 |
| 6 | CHANGELOG | 旧问题修订方向多数可追溯；“统一”“已处置”不覆盖本轮实际冲突 |
| 7 | OPEN-ISSUES | 正确保留 R05/R16 和用户外部输入；新增发现未列入；U06分类标题与说明需统一阶段 |
| 8 | SELF-CHECK | 明确未做运行验证是正确的；158/47不构成独立安全证据；体积段还写551614，与当前549852不一致，属P2记录准确性问题 |
| 9 | TRACEABILITY | 对旧子问题有定位；应撤回Q项已给出唯一处置的概括，补本轮阻断与实际源码证据 |
| 10 | lib.cjs | 检查规范化、路径常量、20映射、覆盖判断；不是运行时guard；路径字符串检查不能证明OS真实路径安全 |
| 11 | spec.cjs | 核查命令定义、inline、TARGETS、wrap、PLAN；是C10空argv、after gate与分支缺项的源码来源 |
| 12 | audit.cjs | 是schema/向量生成器；不等于p0-audit运行时；生成非法ID和漏LF的链字节值 |
| 13 | build.cjs | 实际写入5份生成产物；发现JSON字段遗漏、deny推导、产品输出过滤、计数问题；本轮未执行 |
| 14 | check.cjs | 多项只验证数量/名称或复用生成器；有恒真断言；没有完整权限、schema和分支语义核验 |
| 15 | verify.ps1 | 主要复算已有canonical文本哈希及若干结构；重复漏LF口径，没有独立实现完整事件/链validator |
| 16 | parse-inline.ps1 | 只做语法解析，不能证明inline身份、权限、超时、安全执行 |
| 17 | hygiene.cjs | 检查5文件字节卫生和8个历史摘要；不验证业务语义；本轮独立核对历史摘要 |
| 18 | controlconfig-check.cjs | 固定模板文本的摘要计算；不启动Vite，不能证明实际插件筛选或零写入 |
| 19 | DELIVERY-MANIFEST | 正确列18个文件与自身构成19；坦承20个runtime payload缺失；需外部批准清单摘要 |

当前9个工具是生成与检查工具，尚未交付的运行文件包括 p0-dispatch.ps1、p0-verify-release.ps1、p0-audit.cjs、fs-guard.cjs、p0-product-run.cjs、p0-archive.cjs 等。二者名称和职责不得互换。
本轮完成了全部已交付工具源码审查；“实际运行工具遵守白名单”因源码未交付而无法完成，不能借静态检查器填补这一证据空白。

## C. B1—B9 与第七轮对照

| 项 | 第七轮 | 本轮 | 已确认改善 | 当前阻断/未完成 |
|---|---|---|---|---|
| B1 发布包/首次执行 | OPEN | OPEN | FINAL改source，C06才staged，映射20/16/4明确 | 工具包仍缺；dispatcher自读许可、首次加载稳定性未闭合，Q01/Q05 |
| B2 C04读取隔离 | PARTIAL | PARTIAL | CreateNew写staged，由FINAL读回 | 实际复制工具未交付；重解析/硬链接/文件身份及FD行为未验 |
| B3 C10 Worker | PARTIAL | OPEN | P/N/S隔离与控制配置方向保持 | 3个target argv为空；工具父根绝对deny；真实fork未验 |
| B4 六静态目标 | PARTIAL | PARTIAL | 六文件和图标predicate保留 | 产品报告输出未获许可；写前predicate/额外chunk拒绝未动态验 |
| B5 控制配置 | PARTIAL | PARTIAL | 325字节模板独立复算一致 | 未导入配置/运行Vite；初始化副作用和零dist写仍未知 |
| B6 身份/ACL | PARTIAL | PARTIAL | 精确管理员SID与候选Codex账户分开 | 用户未批准具体输入；有效ACL、父目录责任、真实身份未验 |
| B7 R01准备 | PARTIAL | PARTIAL | 没有越权关闭R01 | 20行具体夹具/断言/资源计数仍缺；不属于本轮产品实施 |
| B8 C07边界 | PARTIAL | OPEN | 15对before/after、M0/M1和独立exec有登记 | after要求成功却用于失败；C18跳过后前驱未改；早期中止无合法链 |
| B9 审计生命周期 | OPEN | OPEN | 分片/schema/summary/SEAL职责更明确 | 控制读丢失、分片许可、计数、非法向量、截止点与封存仍冲突 |

B项统计仅针对既有九项，不将新增发现数量混入统计。没有因尚未运行而机械地把所有项标OPEN；B2/B4/B5/B6/B7保留PARTIAL。

## D. Q01—Q07 独立审查与具体修复目标

下文简写：M=START-CONDITIONS-V5.md；A=WRITE-AUDIT-SPEC-V5.md；R=EXECUTION-REGISTRY-V5.json；W=READ-WHITELIST-V5.tsv。源码均为当前交付的同名文件。CONFIRMED指直接文本/字节/逻辑依据，UNVERIFIED指未取得运行证据。

### Q01 首次执行信任链：OPEN

CONFIRMED 改善：M:68 固定 C05-PRE source；M:70 固定 source FINAL检查16个staged；M:71与R的C06 entry一致；manifest/source/staged不再混为一处。20个runtime payload与19个本轮交付文件是不同集合，不存在要求二者一一等同的理由。

仍缺：
- M:69要求每次执行前复核dispatcher自身。build.cjs:97只给reads.dispatcher加入manifest；C02、C03-OBS、C04、C05-FINAL的业务读也不覆盖source dispatcher自身。缺少可信装载层的精确自读许可；不能把-File能打开脚本解释成已获任意自检读取授权。
- spec.cjs:46的FH只检查叶文件ReparsePoint后OpenRead，未校验祖先目录。R.path_policy却要求重解析/符号链接拒绝。此为静态覆盖缺口，不证明本机已有恶意链接。
- C00哈希后关闭句柄，下一进程再按路径加载；运行中自检不能证明最早已执行字节。未规定足以阻止检查后替换的可信装载/锁定/同字节执行合同。实际TOCTOU利用性UNVERIFIED。
- H1—H5只是外部责任与未来输入；没有已批准manifest、runtime批准记录或完整runtime源码。它们的独立来源尚未建立，不得以本包自称的哈希倒推出已被用户认可。

修复：在M第3节、spec与build中补充精确加载/自检读许可、祖先路径检查和检查至执行期间的文件稳定性；补交runtime后静态审核真实实现。不要让不可信脚本先执行再证明自己。

### Q02 C03观察者：OPEN

CONFIRMED 改善：观察者和探针两条exec各有账户/入口/输出；OBS有900s deadline与stdin边界；探针内联校验候选账户并拒绝管理员，不新增Codex写授权。

明确冲突：
- M:103要求PROBE为300s，R[C03-PROBE-E01].deadline_seconds=null，spec.cjs:209未设置deadline；inline也无该超时。OBS的900s不能替代PROBE的300s及其进程回收。
- C03-OBS输出两个file-create，但没有相应OUT\C03\C03-OBS-E01父目录创建许可。C01没有预建该路径；控制层只建AUDIT路径。必须登记创建者，不能由具体文件授权自动扩成子树授权。

人工relay不能从OS层证明其来源为实际Codex进程；可伪造的转交声明与独立观察不是同等证据。M:110已披露，此项保持UNVERIFIED。OBS READY→PROBE并非必然死锁，但调度必须显式允许READY时启动并行探针，并在C04前等待OBS closed-ok；真实实现未交付。

修复：M第5节、spec的两条C03、registry/TSV统一deadline、EOF/超时/退出码、目录责任与READY/完成条件。保留relay来源限制，不把nonce一致当OS身份认证。

### Q03 审计链权限：OPEN

明确缺陷：
1. build.cjs:103、109、116构造control_reads，:281序列化R时只保留dispatcher/business；:312却写入W。54次执行的控制读列在R中不存在。这是字段丢失，不是单纯未做动态测试。
2. 多数writes.business仅给审计段dir-create；A:19要求每个进程创建/追加events分片，R没有相应file-create/file-append或受限audit-parts授权。dir-create不能同时表示任意子文件写入。
3. build.cjs:172将genesis C01算入53“参与者”，:180产生1+2×53=107。R的C01控制层只登记链file-create和段dir-create，没有自身open/close所需append与summary。52个普通participant的显式角色计数为1+2×52=105；去掉C18三参与者为99。若坚持107/101，应明确C01还产生own open/close，并补权限/摘要；不应只改数字而不改协议。
4. M:114称业务零链读，但C19/C20作为特别只读分析者应明确例外；当前检查器没有可靠验证各层主体。

唯一写入者在文档中更明确，但同一Administrator完整权限不能按脚本文件名建立OS级隔离。未交付guard/dispatcher，不能证明可阻止同令牌进程截断、重排、伪造、删除日志。哈希链只有在外部可信摘要锚定后才有独立比对基础；所有记录及最终摘要同被重写时，内部一致性不是真实性证明。

修复：build/registry/TSV补全control读；在spec与审计规范中限定分片文件名/角色/PID及CreateNew/append；统一genesis是否包含自身审计段；明确应用层与OS层边界。动态独占、flush、重复关闭与篡改拒绝仍在授权后验证。

### Q04 审计事件协议及15个向量：OPEN

CONFIRMED 改善：intent_id=event_id、result引用同分片intent、动作前禁填成功结果；summary不包含自身hash、不引用链；控制层追加close。该方向消除了V4若干文字歧义。

本轮独立复算的准确结论：
- 8个canonical基础样本、3事件、3链记录、1summary，共15个，序列化文本与独立canon一致，SHA-256全部一致。
- 事件prev哈希、intent/result引用、链prev哈希与summary哈希引用均可复算。
- 上述只证明字符串关系，并不证明其满足事件/链schema与注册权限。

| 缺陷 | CONFIRMED依据 | 结果/修复 |
|---|---|---|
| 非法event_id | audit.cjs:34要求32 lowercase hex；:216/:244生成含字母v的ev000001…等 | 三事件均不合规；使用合法ID并做schema验证 |
| 缺链字段 | A:373/:374与audit.cjs:168/:169要求c18_binding_sha256/c18_destination | 正例segment_open两字段均缺；普通执行需显式null或统一schema |
| 漏算LF | A:28按LF逐行；A:71 prev_file_bytes是物理字节；audit.cjs:288/:295只计canonical文本 | open应720，现719；close应1326，现1324；按实际JSONL字节计算 |
| exec与权限不匹配 | 三事件exec_id=C01，write引用C02，read引用C17 | 不是该执行合法的业务正例；修正事件、权限引用和fixture |
| 分片元数据不是实际fixture | audit.cjs:309硬写4096字节与222…摘要 | 三事件加LF实际1795字节，SHA见下；可作序列化占位例，不能声称有效完整审计包 |

实际三事件JSONL摘要：9c7b45c7ad266f3c5ca18bc700d8c6ea4cf7617e61264c86b8af461c0f870681。
Node check.cjs:45与PS verify.ps1:59都复用了漏LF的计算；两实现一致不能证明口径正确。
12类invalid_kinds只是类型标签；本轮未执行交付检查器对其所构造值的拒绝测试。其实际覆盖与运行时validator仍UNVERIFIED。

崩溃/结果落盘失败的概念处理已有文本，但A:121要求不写summary又close failed，A:123允许summary_sha256=null；需要保证对应失败schema、缺失文件和中止封存规则同样可校验，不能仅用成功样本覆盖。

修复：audit.cjs、A附录、vectors、check/verify统一真实JSONL口径；增加完整schema/权限/缺字段/跨exec/重复ID/乱序/截断/失败summary反例。修复后重新生成并登记新哈希，保留旧证据。

### Q05 21命令、57执行的读取/写入合同：OPEN

CONFIRMED 旧项修复：C00三关键文件读取已列；C11/C15 copies.json为内容读且不下传产品；C18 m0.json已列；C19/C20工具文件已列；C14用map-list而非整个副本任意写。

新的主要冲突：

**N01 / P0：允许与绝对禁止重叠。** build.cjs:64的denyFor只问允许项能否覆盖整个候选根，精确允许子文件并不能移除父根deny。R.path_policy.denied_read_absolute=true。下列16次执行均允许staged工具文件却deny RUN\tools：
C06、C08、C09、C10-P、C10-N、C11、C12、C13、C10-S、C14、C15、C16、C17、C18、C19、C20-REPORT（均E01）。
严格实现会阻止加载/自检；静默忽略deny则违反合同。应区分可信工具加载域与业务域，固定同一套优先规则并逐路径验证，不能运行时关闭guard。

**N02 / P1：产品报告缺写许可。** C12/C13/C16 target_argv均指定--outputFile OUT\<command>\<exec>\vitest.json。build.cjs:129用startsWith(ownOut+'\\')过滤，遗漏等于ownOut的TC条目，产品writes没有覆盖该文件。需为产品精确登记vitest.json的CreateNew/写许可及目录创建者。

**N03 / P1：C10实际命令空缺。** M:168说C10—C13/C15/C16登记target_argv；但C10三条target_argv、target_argv_sha256、product.argv、product.argv_sha256皆null。没有可审查的真实fork夹具路径/参数/内容身份，无法从--pool=forks的文字证明计划一定启动真实Vitest。spec.cjs:265及:319附近补完整子命令与fixture，再重新绑定。

**N04 / P1：目录/临时位置不唯一。**
- M:50/:163称所有执行唯一RUN\tmp，M:269、R.cache_policy及产品执行则COPY\tmp；C02 required_env为空且无该tmp写许可，C11/C15 required_env也为空。
- C03-OBS、C04、C05-FINAL、C08、C09只有具体结果file-create，未登记对应OUT父目录创建。C01建OUT根不是建齐所有OUT子目录。
修复时分开dispatcher、runner、产品、审计writer的TEMP/TMP与精确目录创建责任，不把各层权限取并集。

另Q03的54个control_reads丢失、分片写许可，Q01的dispatcher自读缺项同属Q05。C18目的地读回/归档验证的精确授权应随runtime审查闭合，不可用目标可写推定任意可读。

FD/复制/链接/重解析/原生子进程：当前只有契约和未来用例，缺少实际guard代码，均UNVERIFIED。copy的源和目标必须分别判定；句柄与别名按真实身份验证，NODE_OPTIONS不自动覆盖原生进程。

### Q06 C19/C20报告和最终封存：OPEN

CONFIRMED 改善：REPORT与SEAL拆分，最后after之后再seal；各执行ID唯一；SEAL不追加链、摘要到控制台供外部锚定，方向合理。

**N05 / P1：截止点再次冲突。** M:178/:180称覆盖自己的segment_close；spec.cjs:382却要求index cutoff为preceding segment_close。业务先生成index/cutoff，close又含输出hash，若要求index写入自身最终close摘要会形成自引用。需选择已存在的前一close作为不可变前缀，自己及尾部由SEAL补齐，或定义另一无循环方案。

**N06 / P1：索引读范围不够。** M:178要求OUT全树；spec.cjs:376给C19的业务读只有M0、CHAIN、AUDIT、EVIDENCE、TRUST、OUT/C17及工具，没有OUT全树/C01—16/C18。若只索引链中声明的hash，应降低“独立重读全树”的表述；若要核对实际文件，须逐项授权读取，不靠文件存在就自动允许。

**N07 / P1：正常与中止状态机冲突。**
- plan.abort要求失败目标运行一次C07-A；spec.cjs:419却要求该目标sealed ok。失败目标无法满足。
- 任意硬失败触发统一abort，但C01—C07-M0等没有登记after；SEAL gate又要求失败目标已有after，正常predecessor固定C07-A-C20-REPORT。
- 链已损坏、summary缺失或C05-FINAL前staged不存在/不完整时，SEAL的全量staged校验和正常尾部条件可能不可满足。不得为制作“成功封存”而补造缺失证据。
- C18失败在M:196描述exit-not-met，plan.abort却把任何硬失败导向aborted并禁止C19/REPORT。需明确错误分类与状态优先级。

修复：spec PLAN/wrap/SEAL、build前驱生成、R.plan.abort及M第9/14节同时定义建RUN前、genesis后、wrapped target、after自身、链损坏、seal失败的有限收尾；每条最多执行一次，不扩大权限，不重写失败段。报告成功必须以完整可校验链和真实exit状态为条件。

### Q07 第二归档：OPEN

CONFIRMED 真正修复的子问题：M第10/11节已把SECOND_ARCHIVE从启动输入移到出口条件，未绑定不选TEMP、不自动换目录，不允许宣布complete。

但执行分支仍不可唯一实现：
- R.plan.c18.when_unbound说三条均跳过；仅C18-E01带conditional，两个C07包装执行为null。
- C07-B-C19-E01.predecessor仍是将被跳过的C07-A-C18-E01，gate又要求previous exec sealed ok。
- read_at称只在C07-B-C18读取环境值一次，而未绑定时该执行本身被跳过。必须先有明确只读绑定检查，再选择执行序列。
- C18失败与全局abort的最终状态冲突见Q06。

修复：spec与build生成bound/unbound两条有效前驱链，三连共享条件；明确一次性环境读取与绑定记录的执行主体；C19/REPORT/SEAL统一消费该记录。分类文字修复不足以关闭Q07。

## E. R01—R25 状态变化

V5启动包没有产品修复实现或产品验收，本轮不改变历史产品评级。以下逐项核对是否被错误关闭以及所需后续证据。

| R项 | 第七轮→本轮 | 未完成内容/对应阶段 |
|---|---|---|
| R01 双Promise | PARTIAL→PARTIAL | resultReady/completion、finalize/cancel/cache/timeout 20行具体矩阵；Phase1前准备，Phase1运行 |
| R02 批量取消 | PARTIAL→PARTIAL | cancelAll、pump、资源释放与守恒；Phase1 |
| R03 熔断 | PARTIAL→PARTIAL | 健康回复、连续崩溃、恢复入口与挂起请求；Phase1 |
| R04 旧事件 | PARTIAL→PARTIAL | 旧Worker/epoch/预哈希回调过滤；Phase1/2 |
| R05 身份/去重 | OPEN→OPEN | placeholderSeq与非force同身份合并冲突；Phase1前修规格，无损源码身份/缓存键仍需验证 |
| R06 缓存 | PARTIAL→PARTIAL | 瞬时失败不永久缓存、淘汰、等待者清理；Phase1 |
| R07 deferred | PARTIAL→PARTIAL | 256条/64MiB UTF-8边界及取消守恒；Phase1 |
| R08 调度 | PARTIAL→PARTIAL | 已批准小脚本优先次序、公平性；不擅加aging |
| R09 超时 | PARTIAL→PARTIAL | 固定D4公式、一次重试、性能判据分离；Phase1/4 |
| R10 请求/尝试映射 | PARTIAL→PARTIAL | 双Promise责任与重试映射；Phase1 |
| R11 刷新/身份 | PARTIAL→PARTIAL | 同ID换源码、候选重复、提交归属；Phase2 |
| R12 后台迟到消息 | PARTIAL→PARTIAL | D6页面/纪元守卫；Phase2 |
| R13 统计 | PARTIAL→PARTIAL | gauges/counters与currentState守恒；Phase1/2/4 |
| R14 Worker构建 | PARTIAL→PARTIAL | C10 Node fork不是浏览器Module Worker；Phase3 |
| R15 构建身份 | PARTIAL→PARTIAL | 产品A/B、哈希/版本戳；runtime工具身份不替代产品构建身份 |
| R16 DOM归属 | OPEN→OPEN | 容器token等值与commitSeq高水位冲突；真实DOM渲染归属，Phase4前修规格 |
| R17 真实Panel/Harness | PARTIAL→PARTIAL | 实际Panel提交/渲染与实例内容验证；Phase2/4 |
| R18 deadline/分类 | PARTIAL→PARTIAL | 饥饿/超时/分析/提交/渲染分开；Phase4 |
| R19 完整一致性 | PARTIAL→PARTIAL | 完整序列化/四方内容/失败语义；生成模板一致不是结果一致 |
| R20 closeBundle | PARTIAL→PARTIAL | C12/C16与C13对照尚未运行；Phase0 |
| R21 persistRun | PARTIAL→PARTIAL | 历史证据保护、路径隔离与D11审批；未做实际回归 |
| R22 物理隔离 | PARTIAL→PARTIAL | 文件ID/硬链接/重解析/共享缓存/FD边界；Phase0 |
| R23 最终提升树 | PARTIAL→PARTIAL | 逆映射、候选树重建、字节核验；Phase6/P |
| R24 原项目变化证明 | PARTIAL→PARTIAL | M0/M1、ADS/USN、最后活动覆盖；Phase0及出口 |
| R25 权限/W2 | PARTIAL→PARTIAL | 有效ACL和Codex只读；W2-B未授权 |

合计不变：0 CLOSED / 23 PARTIAL / 2 OPEN。N/Q发现是启动包层问题，不用它们重新计数产品R项。

## F. Phase 0六项启动条件与用户输入

### F.1 既有E1—E6

依据方案V5 Candidate §4.1—4.6及第七轮报告；与本启动包A1—A7/B1—B15/C1—C8分开编号。

| 条件 | 本轮评级 | 依据 |
|---|---|---|
| E1 初始化顺序 | PARTIAL | detector→M0方向保持；genesis/控制权限及早期失败收尾须修，实际顺序未运行 |
| E2 三副本隔离 | PARTIAL | 同快照/P/N/S方向明确；实际文件身份、依赖、tmp独立未验，tmp文书冲突待修 |
| E3 写白名单与预期拒绝 | OPEN | 16项绝对deny冲突、产品报告/分片/父目录许可缺失 |
| E4 守卫矩阵与禁止读 | OPEN | C10实际argv空缺；runtime guard缺失；向量语义不合规 |
| E5 基线/第二归档/trust | OPEN | 出口分类修正，但skip前驱、C19截止点/权限及最终状态冲突 |
| E6 原项目只读 | PARTIAL | 禁止修改要求保留；不能凭同管理员进程声明推断OS只读；真实有效访问/前后证据未验 |

E状态不等同“本轮动态失败”。整体启动准入：REJECTED。

### F.2 启动前必须先完成

1. OpenCode修正本报告D/G中的合同与生成逻辑；重新交付一致的主文、TSV、JSON、schema/向量及检查器，保留V5原件，不覆盖历史证据。
2. 提供20个runtime payload与外部批准的RELEASE-MANIFEST摘要。补交源码后需独立静态审核，不能直接从“未来工具应当这样做”跳到执行。
3. 用户批准准确的契约文件版本、管理员账户/SID、实际Codex账户、RUN_ID、范围。D15既有静默约定继续有效，不因本报告重复索要既有决定；启动记录应引用该约定。
4. H2/H3的可信运行时与实际inline命令摘要核对形成记录；H1/H5从外部批准值取得，不能自证。
5. 明确父目录ACL责任：M:88说精确保护RUN_PARENT，而C02只登记RUN递归ACL写。A6“ACL已知”不等于已合规。选择启动前只读核验已满足并否则停止，或在正式登记中列精确操作；本轮不授权修改。
6. 用户另行正式授权有限Phase0。当前请求和接受审查报告均不构成该授权。

### F.3 授权后Phase 0内才验证

真实ACL/继承/组成员与有效访问；source/staged校验和拒绝篡改；真实审计writer/独占/flush/崩溃；三副本逐字节与文件ID；真实Vitest fork及预载；产品报告输出和closeBundle对照；FD、复制、链接、原生进程边界；原项目ADS/USN和零越界证据。

这些均UNVERIFIED，不要求在本轮偷跑，也不把缺少动态结果本身当作每一项静态拒绝理由。

### F.4 出口条件

SECOND_ARCHIVE绑定并核验完成；全部硬门通过；失败/中止记录保留；禁止区实际读取和未授权写入为零；终端seal覆盖最后after和真实退出状态；独立复核后等待用户决定。
未绑定归档只能exit-not-met；失败/损坏链的收尾状态必须按修订后的规则如实表达，不能“报告生成成功”即complete。阶段顺序仍为0→3→1→2→4→5→6→P。

## G. 新发现风险与具体改动位置

| 发现 | 等级/状态 | 要改的文件与位置 | 修复目标 |
|---|---|---|---|
| N01 精确allow与父根absolute deny冲突 | P0 / OPEN | build.cjs:64；R.guard/path_policy；W；M第8节 | 分开可信工具/业务域并固定优先规则，16执行无矛盾 |
| N02 control读丢失、自读与分片许可缺失 | P1 / OPEN | build.cjs:97/:281/:312；spec审计输出；M第6/8节；A第1/2节 | JSON/TSV逐权限一致，精确登记每层读写 |
| N03 产品报告、父目录与tmp合同 | P1 / OPEN | build.cjs:129；spec TARGETS/C03/C04/C05；M:50/:163/:269 | vitest.json获产品层许可，目录创建和临时根唯一 |
| N04 非法向量/schema/漏LF | P1 / OPEN | audit.cjs:216/:288/:309；vectors；A附录；check:45、verify:59 | 正例可通过独立schema、权限与真实字节链验证 |
| N05 genesis角色与107/101 | P1 / OPEN | build.cjs:102/:172/:180；spec C01；A链规范 | C01权限、记录数量和生命周期同一模型 |
| N06 C19覆盖/读范围与自引用 | P1 / OPEN | spec.cjs:376/:382；M:178/:180；R C19/REPORT/SEAL | 固定可计算前缀与尾部，不能引用自身未来hash |
| N07 skip/失败after/早期abort | P1 / OPEN | spec.cjs:419/:450；build.cjs:85与plan.abort；M第9/10/14节 | bound/unbound和各类失败均有可达、一次性收尾 |
| N08 C10真实argv缺失 | P1 / OPEN | spec.cjs:265及:319；R三条C10；M:168；检查器 | 登记实际fork命令、fixture身份、输出及继承 |
| N09 C03期限与可信加载缺口 | P1 / OPEN | spec C00 FH/C03-PROBE；M第3/5节 | 300s合同落地；祖先路径与检查后替换边界明确 |
| N10 自检断言不足 | P2 / OPEN | check.cjs:91/:92/:134/:145；verify.ps1 | 去掉恒真项，增加全26列/优先规则/schema/分支语义检查 |
| N11 父ACL与记录准确性 | P2 / 待澄清 | M:88、A6；spec C02；SELF-CHECK第6节 | 明确父ACL已满足还是正式操作；体积写实际值 |

N10具体依据：
- check.cjs:92以“长度相加>=0”验证控制读，是恒真条件，检测不到54项遗漏。
- :91只看链访问者chain_role，不能证明业务层零链访问。
- :134数组常量长度恒真，只计包含C18名字的条数，不验证三个conditional和有效前驱。
- :145/:146只对TSV顺序与argv列，没有逐26列比较。
- :32复用audit生成器重建向量，:45与PS:59重复同一漏LF口径。
因此本轮没有否认“历史工具打印过0失败”，而是确认该0失败不能支持“完整执行合同已闭合”的结论。

所有修复属于下一轮明确任务；本审查没有修改这些文件，没有生成V6，没有实施任何产品整改。

## H. 最终结论和后续建议

**最终结论：REJECTED。**

真正可确认的修复：source FINAL/staged首用顺序、manifest映射、部分内容读许可、C03执行登记、intent/result字段职责、summary基本去自引用、REPORT/SEAL拆分、第二归档启动/出口分类。

仍仅停留在设计/文档层：dispatcher自校验、白名单强制、guard覆盖、分片独占、ACL和只读保证、报告真实性、终端seal抗篡改。实际运行源码尚未提供，不能评为CLOSED。

必须先改的实质问题：允许/禁止重叠、控制读字段丢失、产品输出和审计写许可、非法向量与漏LF、genesis计数、C19截止点、失败/跳过分支、C10空argv、C03期限。它们不应被推迟为运行现场的临时规则调整。

后续应先提交这些有限修订与真实运行源码，完成独立静态复核和外部输入绑定，再由用户决定是否授权有限Phase0。R05/R16产品规格与R01矩阵按既有阶段处理，不借修启动包擅自改变已批准D3/D4/D10/D12/D14/D15或安全门槛。

本轮所有操作限于读取、独立摘要/数据/语法解析和新增本报告。未运行交付工具、C00—C20、测试、构建、浏览器、Worker实验或L1；未创建D:\P47RUN/D:\P47TOOLS；未修改ACL、产品、V5或历史证据。

审查完成，停止，等待用户决定。

