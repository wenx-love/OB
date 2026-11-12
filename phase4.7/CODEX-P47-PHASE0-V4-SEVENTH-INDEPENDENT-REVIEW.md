# OB-Recover Phase 4.7：Phase 0 V4 第七轮独立审查

日期：2026-11-11。审查对象：Phase 0 启动准备包 V4。性质：只读技术审查；仅新增本报告。

## A. 总体结论

**C. REJECTED：V4 当前不具备申请实际启动 Phase 0 的完整条件，须先修订启动契约。**

V4 确实修复了第六轮中的多项问题：C00 改为内联验证；C05-PRE 提前；C02 不再以 Administrators 组 SID 代替账户；C10 增加 P/N/S 及去复制插件配置；缓存路径纠正；C07 分配独立编号；审计引导和 intent/result 机制也有实质改进。这些是 CONFIRMED 的文档变化，不是动态通过。

拒绝主要基于当前文件之间仍有可直接定位的冲突或缺项：
1. C05-FINAL 先执行 staged dispatcher，再验证 staged 集合；批准 manifest、发布根和 staged 根的绑定未完整定义。
2. C03 管理员观察者没有唯一登记的执行入口。
3. 公共 chain-head.jsonl 不在后续命令的精确读写许可中；审计 intent/result 字段规则及封存边界仍不一致。
4. C11/C15、C18、C19/C20 的必要读取与命令白名单不一致。
5. C19/C20 之后仍必须产生 C07 after 证据，但最终封存与发布范围未定义。
6. SECOND_ARCHIVE 的启动前置与出口前置分类在主文和未决清单中冲突。

TOOLSRC 缺失和用户尚未批准的启动输入是另外的外部阻断。ACL、真实 fork、隔离和零产物尚未实测，本身不构成“必须在 Phase 0 开始前先运行 Phase 0”的循环要求。

独立评级：
- B1—B9：**0 CLOSED / 7 PARTIAL / 2 OPEN**，OPEN 为 B1、B9。
- R01—R25：**0 CLOSED / 23 PARTIAL / 2 OPEN**，OPEN 为 R05、R16；R01 保持 PARTIAL。
- U01—U03：均未完成；U01/U02 是启动前输入，U03 应明确为出口输入，当前正文分类需统一。

本报告不授权执行 C00，不批准任何尚未批准的决策，也不授权产品整改。

## B. 输入、哈希与审查范围

### B.1 核验口径

完整读取七份 V4 正文，解析 JSON 和 TSV，并与第六轮报告、六份 V3 原始输入交叉核对。以下为实读字节的 SHA-256、字节数和行数，行数按 ReadAllLines 计算。

**本轮用户未提供七份 V4 的独立预期哈希。** 因而以下证明的是本轮审查所绑定的版本及读取期间的稳定性，不能写成“与用户预先批准哈希一致”。自检与同包交叉引用也不能代替外部信任锚。V3 六份摘要与前次用户指定值一致；第六轮报告与 V4 引用值一致。

| V4 文件 | 字节数 | 行数 | SHA-256 |
|---|---:|---:|---|
| PHASE4.7-PHASE0-START-CONDITIONS-V4.md | 25163 | 395 | e48f1109ae44288872b91182ec747d9689063414a57642cdc95ccedba91b6541 |
| PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V4.tsv | 13724 | 22 | bee85b080a5d9746de8e22d1493f227c2044949ca4b19786a9dc77e283d5c794 |
| PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V4.json | 158114 | 2140 | e48904b32c6b554806da203d2907976edde94b030f281a833e7275851a5502cc |
| PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V4.md | 11942 | 233 | e23b589e84f7cf0155a7516bd4526f2a5eaab2be12cf645f297a9afb38ba61ea |
| PHASE4.7-PHASE0-V3-TO-V4-CHANGELOG.md | 10825 | 170 | 22209ea4e065a54f2c1f84144e8a057ee6944b219f5f3cc7fffee3aa0ddb0dcf |
| PHASE4.7-PHASE0-V4-OPEN-ISSUES.md | 7607 | 152 | 6e8c3968ccfc2451a7cd7d65b63b90a9c870beabd95a3ec1472a5126f23c9588 |
| PHASE4.7-PHASE0-V4-SELF-CHECK.md | 9533 | 122 | 03c8348d5104e7ee2ac8eda8f1abce09a8bed8a6963b2a8e41c65bfe2dde7dba |

| 历史输入 | 字节数 | 行数 | SHA-256 |
|---|---:|---:|---|
| CODEX-P47-PHASE0-V3-SIXTH-INDEPENDENT-REVIEW.md | 27197 | 329 | 2e349cbf6b286c06bb853c65c7df2aa2c3dbbd5fefb2aac6e10d13a5786853bd |
| PHASE4.7-PHASE0-START-CONDITIONS-V3.md | 25942 | 422 | 303acd07e90bafe349481ffad5cad9a09de422a7381708d55cef5bd02d380688 |
| PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V3.tsv | 11796 | 22 | 26554854da2155e8ce5b1ea54f5a6eb215ebb520e4d087dbb49ddaad844a4331 |
| PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V3.json | 98425 | 1463 | 6042b4b27b651b94db61bcf2527c60e668a7e9c8f158d3477c20c0a69f3c6b6d |
| PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V3.md | 10862 | 219 | d6c4fe871dc3b9e7c252a325485a42a92cd4a933107cad47178666151dd0d7fd |
| PHASE4.7-PHASE0-V2-TO-V3-CHANGELOG.md | 9576 | 189 | 1e6140bbe6d7cc831b7d44269ef26473f2a0dc7e01da696963b3c021fe5e1c6f |
| PHASE4.7-PHASE0-V3-OPEN-ISSUES.md | 6684 | 137 | 9fcb796d497fe2eb3af6ad7eb4e9382e3634675673892a5542434c3d5b29d524 |

JSON 有 21 个不同命令 ID；TSV 为 21 数据行、14 列。结构可解析不是命令可执行性证明。发布清单声明 19 个 payload 文件，其中 16 个属于 staged tools/cases。

只读存在性查询：D:\P47TOOLS\p47-phase0-v4 不存在；D:\P47RUN\P47-20261111-01 不存在。前者是外部输入缺失；后者符合尚未开始初始化的现状，不单独列为缺陷。

### B.2 证据缩写与状态

- M：PHASE4.7-PHASE0-START-CONDITIONS-V4.md。
- R：PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V4.json，以 JSON 字段路径及必要行号定位。
- W：PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V4.tsv，以 command_id 定位。
- A：PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V4.md。
- U：PHASE4.7-PHASE0-V4-OPEN-ISSUES.md。
- H：第六轮独立报告；作为历史问题基准，不把旧版缺陷直接搬到新版。

CONFIRMED 表示本轮可直接确认的文本、数据或元数据事实；INFERENCE 表示由契约推演出的可能后果；UNVERIFIED 表示没有实现或运行证据。
CLOSED 需要充分闭合证据；PARTIAL 表示已有设计但验证未完成；OPEN 表示仍有实际契约缺项、冲突或未满足的外部前置。三者不与证据标签混用。

## C. B1—B9 独立复核

| 项目 | 评级 | CONFIRMED 的改进 | 剩余问题、验证与责任 |
|---|---|---|---|
| B1 工具发布包/首次执行 | OPEN | C00 不执行 TOOLSRC；PRE 在 C01 前；19/16 文件范围及 dispatcher 复核原则明确（M 120—155；R C00/C05） | Q01 的 staged 首次执行/manifest 映射仍缺；TOOLSRC 未提供。不能接受自检“契约闭合”。文书与包需先补，实际 PRE/FINAL 留 Phase 0 |
| B2 C04 读取隔离 | PARTIAL | 不再复用目标；只读 TOOLSRC/RUNTIME、RUN 元数据；不存在目标才落盘（M 101、148—151；R C04） | 真实工具尚未提供；PowerShell/原生复制的链接、重解析、FD/子进程边界 UNVERIFIED。不能声称 Node guard 已覆盖原生执行 |
| B3 C10 Worker | PARTIAL | P/N/S 对应三副本；只移除复制插件；真实 Vitest forks；正确缓存和 TEMP/TMP（M 236—270；R C10） | preload、探针是否在真实子 PID 中执行、所有派生进程继承与拒绝结果未测；只验证 Node fork，不验证产品浏览器 Module Worker |
| B4 六静态目标 | PARTIAL | 六文件逐条列明；三图标需写前 predicate；其他 dist 产物拒绝（M 274—290；R C12/C16） | 实际插件路径、调用次数、CreateNew、既存图标拒写、未登记 chunk 拒写均 UNVERIFIED |
| B5 控制配置 | PARTIAL | 固定 8 行/LF/无末尾 LF/325 字节与既有模板哈希；仅过滤一个插件（M 294—296、381—394） | 实际生成/配置差异/零 dist 写入未测；导入原配置的其他初始化副作用仍须在守卫下观察 |
| B6 C00/C02 身份 | PARTIAL | 账户 SID 与组 SID 分开；名称/SID/管理员令牌都检查；Codex 保持只读（M 34—59、178—198；R identity/C00/C02） | U02 未确认；C03 需绑定批准账户而非仅信任环境变量；C00 运行时信任锚及真实 ACL 需核验，见 Q02、I |
| B7 R01 准备 | PARTIAL | 明确 Phase 1 前补 fixture/harness/故障注入，不伪称运行（M 339—344；U 62—66） | 20 行矩阵的具体样本、断言、计时与资源计数尚未完成，动态结论 UNVERIFIED |
| B8 C07 边界 | PARTIAL | 独立子执行号与 summary；M0/M1 各一次；产品测试不能调用（M 218—234；R C07） | 身份隔离与次数未测；Q06 的末尾证据封存未定义。目标枚举排除 C07，不存在据此认定无限递归的依据 |
| B9 审计生命周期 | OPEN | 有限 B0—B5、统一审计根、intent/result、观察者职责已有明确改进（A 28—58、114—159） | Q02—Q04、Q06：观察者入口、公共链头权限、schema 与封存顺序仍未闭合；工具行为也未测 |

**合计：0 CLOSED / 7 PARTIAL / 2 OPEN。** B1/B9 评级基于当前明确缺项，不是因为“尚未运行”而一律 OPEN。

## D. 当前必须处理的缺口

### Q01｜P0｜OPEN｜staged 首次执行的外部验证与根路径绑定未闭合

**CONFIRMED 依据：**
- R C05.argv_by_phase.FINAL（约 206—210 行）首先执行 RUN/tools/p0-dispatch.ps1，并令 -ToolSrc=RUN/tools。
- R C05.inputs_by_phase.FINAL（约 233 行）却绑定原 TOOLSRC/RELEASE-MANIFEST.json。
- R.tool_release.files 使用 payload/tools/... 路径；C04 只把 16 个 tools/cases 文件展开到 RUN/tools，未声明将 RELEASE-MANIFEST 放入 staged 根。
- M 150 说“用已落盘的 dispatcher/verifier 复核 staged 集合”；C04 没有明确在返回前由外部已验证入口读回关键 staged 可执行文件。M 151 又禁止脚本自证。

**INFERENCE：** 按一种直接实现，manifest 会被解析到不存在的 staged 位置；按另一种实现，会先运行尚未独立读回验证的 staged dispatcher。现有包未提供，不能断言已经发生这两种故障，但契约未唯一确定可信的第一次执行。

**必须修改：**
1. 分别固定 ApprovedManifestPath、ReleaseSourceRoot、StagedRoot 和 payload/tools → tools 的映射。
2. 最小方案：C05-FINAL 继续使用已验证的原 TOOLSRC dispatcher/verifier，显式读取批准 manifest 和 staged 根；FINAL 通过后才切换 staged 入口。
3. 若坚持先切换，须由 C04 外部可信入口在返回前读回校验 staged dispatcher/verifier/audit，再允许运行；不得隐式增加 C04 的目标读取权限。
4. M 138 的“TOOLSRC 的 19 个文件”应准确写成“19 个 payload 文件，另有独立校验的 manifest”；否则全树额外文件检查与 manifest 自身冲突。
5. 定义首次运行可信系统 PowerShell、登记表文本、清单环境值的外部核验责任。C00 不可能仅靠自己证明自身代码未经更改。

最后一项是可信计算基础的明确化要求，不是本轮发现 Windows 运行时遭到篡改。

### Q02｜P1｜OPEN｜C03 观察者未登记唯一执行入口；批准账户绑定需强制执行

**CONFIRMED 依据：** M 210—216、A 130—139 要求管理员实时观察、先写 intent、转写 stdout/stderr；R C03.observer（约 482—488 行）只有 account/write_roots/rule，没有 executable、脚本路径/哈希、argv、启动命令或可信 dispatcher 模式。

Codex 内联探针只比较当前名称与 P0_CODEX_ACCOUNT，拒绝管理员并要求 Codex 组。R.identity.codex_accounts 列了两个账户，W C03 gate 也要求二选一；但内联代码没有检查该环境值属于这两个名字。外围如何强制批准绑定尚未给出唯一入口。

**影响：** 不能由“管理员观察者”这个角色名自动推出可重复执行、可追溯工具身份、先于探针记录或账户选择已经受控。

**必须修改：** 为观察者登记固定子执行或已验证 dispatcher 的固定 observe 模式，绑定工具哈希、argv、cwd、独占输出、先后关系和退出判据；Codex 身份只允许用户指定的二选一，缺失/越界即失败。观察者不能代替 Codex 运行探针，也不能授予 Codex 写权限。实际实时性留 Phase 0 验证。

### Q03｜P0｜OPEN｜公共审计链头没有匹配的精确权限

**CONFIRMED 依据：** A 203—205 要求每段读取 chain-head.jsonl 的末条并向其追加 segment_close。R.path_policy.write_allow_is_exclusive=true；注册表全文没有 chain-head.jsonl 路径。C06、C10—C16 等仅允许各自 OUT/audit/Cxx/exec 子目录，不允许读取/写入其父目录的公共链头。C03 observer 同样只有自己两处输出权限。

C01/C02 较宽的根权限不等于后续每个命令或独立观察者自动继承该读写许可。

**INFERENCE：** 严格执行白名单会拒绝封段；绕过白名单写链头则违反自身规则。未运行，不能称为已发生的审计断链。

**必须修改：** 登记链头的唯一写入主体、精确文件权限、读许可、CreateNew/append 规则及串行关闭规则；各子进程经受控通路提交封段。不得靠宽放整个 OUT/audit 修补，也不得让 Codex 写公共链头。

### Q04｜P1｜OPEN｜审计 schema 与封存边界仍不能唯一实现

**CONFIRMED 依据：**
- A 94 要求 intent_id 在非 write_result 时为空，A 118 却要求 write_intent 有 intent_id。
- A 90 的 actual 只允许已发生结果；A 99—112 要求 ACL 前后值同时存在，A 119 又要求动作在 intent flush 后发生。intent 的未知后值没有明确编码。
- A 206 要求 summary 引用“本段末哈希”；A 116—124 只豁免审计 append 的递归，没有定义 summary 创建是否属于同段。
- A 24、156、204 使用 segment_close，A 68 事件枚举未包含它；可以为链头另立 schema，但当前未定义。
- A 109 的规范化哈希没有固定序列化规则/版本/测试向量。

**INFERENCE：** 若 summary 创建的 intent/result 仍纳入其引用的同段，则写 summary 的结果事件改变段末，而其 after_sha256 又依赖 summary，形成自引用依赖。这里确认的是规格边界缺失，不是动态证实死循环。

**必须修改：**
1. write_intent 自带唯一 ID，write_result 引用同 ID；逐事件定义必填/空值/禁填字段，动作前不能填实际成功。
2. 固定业务事件段封存 → 控制通路创建 summary → 链头追加带段末/summary 哈希的关闭记录等一种有限顺序。
3. 定义独立链头 schema、规范化编码、并发序列化及失败处理；不得追改旧事件。
4. 工具包审查应验证编码向量；真实写入/失败注入可留 Phase 0。

### Q05｜P1｜OPEN｜逐命令读取/写入许可仍有直接缺项和交叉冲突

| 命令 | CONFIRMED 的不一致 | 修正要求 |
|---|---|---|
| C00 | R 内联代码读取三件关键工具的字节计算哈希；W C00.allowed_content_reads 仅列 manifest 与 PowerShell 运行时 | TSV 明列三件工具内容读取，与 R 的规则一致 |
| C05-FINAL | R.write_allow_by_phase.FINAL 包含 RUN/tmp；W C05.protected_write_roots 却列 TMP | 明确 TMP 的唯一权限；不得在两表取并集 |
| C11/C15 | R.inputs 都包含 OUT/C09/C09-E01/copies.json，C11 gate 要求比对其依赖哈希；read_allow_roots 与 P0_GUARD_READ_ALLOW 均没有它。W 将 copies.json 放在元数据读取列，但哈希比较需要内容 | 精确授予 dispatcher 读取该文件；明确是否不给产品子进程透传。不能把内容读取写成元数据查询 |
| C18 | argv_template 的 -Manifest 指向 BASELINE/m0.json；inputs 及 read_allow_roots 只有 snapshot-01 和 tools（约 1926—1956 行） | 将 m0.json 精确加入输入和只读许可；它不是 snapshot-01 的子文件 |
| C19/C20 | tool_files 已登记实际脚本/审计器/dispatcher，但 read_allow_roots 不含 tools；未定义 tool_files 自动只读例外；W C20 又允许 TOOLS | 固定可信入口加载/核验的精确只读权限，或明确定义仅限已登记文件的启动例外 |

这些是命令契约缺项，不表示所有真实加载一定失败：PowerShell 与 Node 守卫的覆盖边界尚未验证。也不能把“解释器实际能读”当作已获白名单许可。

不要误报：C18 对 BASELINE 的保护写与对 snapshot 的允许读本身不冲突；M 302—307 已经正确区分二者。

### Q06｜P1｜OPEN｜最终证据仍在索引/报告之后产生，封存终点未定义

**CONFIRMED 依据：** M 223—231/R C07.binding 包含 C19-E01 和 C20-E01，且每项必须有 before/after。M 169—170 先 C19 再 C20 停审。因此：
- C07-A-C19-E01 在 C19 索引完成后产生；
- C07-A-C20-E01 在 C20 报告完成后产生；
- 它们的输出、审计段、summary 和链头更新不可能已包含在之前生成的完整索引/报告哈希中。

**必须修改：** 定义有限的报告覆盖截止点及尾部证据封存。可由 C20 明示覆盖前缀，再由外部只读核验发布最后 after 证据及终端链头哈希，作为不可变附件；或采用其他明确、不自引用的有限方案。不能无限重跑 C19/C20，也不能悄悄漏掉末尾证据。

C07 枚举没有 C07 自身，所以这里不是 C07 自递归问题。

### Q07｜P2｜OPEN｜启动条件与出口条件的文字分类仍冲突

**CONFIRMED 依据：** M 348、355、360 把 SECOND_ARCHIVE 纳入“全部满足才可申请开始、任一不满足不运行 C00”；U 45—49、129 又明确可在 S8 前指定，属于出口阻断。

**必须修改：** 将启动前外部输入、Phase 0 内硬门、结束前条件拆表。按既有方向，SECOND_ARCHIVE 可在 S8/C18 前绑定，未绑定时 C18 DISABLED、不得宣布 Phase 0 完成。若用户选择要求提前指定，也可执行该更严格约束，但不能让两种解释并存。

M 356 的“C05-PRE 能通过、C01 能建立审计链”应标为能力契约及授权后 S0 验收，不能要求在允许运行 C00 之前已经产生这些动态结果。这一措辞具有循环误读风险；本轮不据此声称已经执行了循环流程。

## E. C00—C20 逐条命令审查

共同说明：R.executables 固定了 PowerShell、Node、robocopy 的绝对路径、字节数和摘要；所有顶层命令均以登记 PowerShell 为入口。本轮核对的是这些声明及参数，没有执行它们，也没有把声明的 runtime 哈希当成本轮实际二进制核验结果。

PowerShell：C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe，声明 SHA-256 60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f。
Node：D:/Nvm/nodejs/node.exe，声明 SHA-256 0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4。
robocopy：C:/Windows/System32/robocopy.exe，声明 SHA-256 84abbd32d074881164b8cf6b30593828e53f368c3854854aefe5b3cf06d3e356。

下表的 SRC-D 表示 TOOLSRC/payload/tools/p0-dispatch.ps1；STAGE-D 表示 RUN/tools/p0-dispatch.ps1；只是本报告缩写。实际登记入口均为绝对路径。19 件发布工具的实际哈希需要由尚未提供、尚未批准的 RELEASE-MANIFEST 绑定；不生成或代批这些哈希。

| ID | 入口、参数和 cwd | 输入/输出、权限与顺序 | 复核结果 |
|---|---|---|---|
| C00 | PowerShell -Command 内联；cwd=C:/Users/Administrator | 读 manifest/三关键文件；零文件输出；身份/哈希失败退出 43—46 | 内联独立于包已确认；Q05 TSV 漏内容许可；外部登记表/运行时信任尚待启动输入 |
| C01 | SRC-D -CommandId C01 -RunRoot/-RunId/-AuditVersion/-ExecId；cwd=用户目录 | PRE 成功且 RUN 不存在；创建有限引导、哨兵/init；不读原项目 | 顺序已修；B0—B5 可作明确 bootstrap；宽根许可必须由操作级有限清单约束；Q03/Q04 仍影响封段 |
| C02 | SRC-D C02；账户名、账户 SID、SYSTEM、Codex 组固定；cwd=RUN | C01 后；仅 RUN ACL 与本命令输出；父目录精确禁写；读回 ACE | 组 SID 旧问题已修；用户确认/真实读回 UNVERIFIED；不得将 RUN 根 ACL 许可解释为任意内容修改 |
| C03 | PowerShell 内联探针；cwd=RUN | 读哨兵/申请写句柄；Codex 无写根；C02 后，观察者写 C03 输出 | Q02：观察者无唯一入口；批准环境绑定需强制；ACL 探针未运行 |
| C04 | SRC-D C04 -ToolSrc/-Run/-Out/-ExecId；cwd=RUN | C03/PRE 后；只读发布根/runtime；只落新 tools；目标已存即失败 | 目标复用旧问题已修；原生复制及 staged 外部读回 Q01 未证 |
| C05 | PRE=SRC-D，cwd=用户目录；FINAL=STAGE-D，cwd=RUN；独立 ExecId | PRE C01 前无写；FINAL C04 后写自己的 OUT/audit | Q01 根路径与首次执行信任；Q05 TMP 冲突；不能把 FINAL 自验当外部先验 |
| C06 | STAGE-D C06 -Cases/-Controls/-Out；cwd=RUN | FINAL 后；模拟 controls；固定 NODE_OPTIONS/TEMP/TMP；失败禁止真副本 | 合成读取/写入/FD/copy/link/worker 用例方向明确；包和实际检测覆盖 UNVERIFIED；公共链头 Q03 |
| C07 | STAGE-D C07；M0/M1/before/after 固定模板及 target 枚举；cwd=RUN | C06 后；仅管理员读 ORIGINAL；M0 独立；各模式独立 OUT/audit | 限制方向明确；角色不能替代实际权限验证；Q03/Q06；没有自递归目标 |
| C08 | STAGE-D C08 -Source ORIGINAL -Manifest m0 -Dest snapshot；cwd=RUN | M0 后；只读源、归档新目录；链接/源变化停止 | 不执行产品代码；流/ADS/目录重解析/元数据与归档一致性未测 |
| C09 | STAGE-D C09 -Snapshot/-DestRoot/-Copies；cwd=RUN | C08 后；读冻结快照，建三独立副本；禁止回读 ORIGINAL | 同源/无硬链接/无共享缓存明确；真实文件身份/复制后哈希未测 |
| C10 | STAGE-D C10；P/N/S 对应 Copy/ExecId/Out/cwd | 各副本独立；Node Vitest forks，固定去复制插件配置；禁止本副本 dist；P 先 | 不再存在旧配置必写 dist 冲突；进程/FD/native 覆盖 UNVERIFIED；不是浏览器 Worker 验证 |
| C11 | STAGE-D C11；target_argv 明列 tsc.js -p tsconfig --noEmit；cwd=PRISTINE | C10-P 后；只准 OUT/audit/tmp 写；编译产物即失败 | noEmit 已确认；Q05 缺 copies.json 内容许可；零产物未测 |
| C12 | STAGE-D C12 -Copy PRISTINE/-Out；cwd=PRISTINE | C10-P 后；原插件；六目标、条件图标、精确缓存和独立 OUT | 目标范围明确；实际 Vitest 子 argv/依赖必须随 dispatcher 发布冻结；写前条件未测 |
| C13 | STAGE-D C13 -ControlConfig/-ExpectedSha256；cwd=NO_PLUGIN | C10-N 后；仅一个插件差异；dist 零写；独立缓存/临时目录 | 模板和路径方向正确；真实生成、初始化副作用、零写未测 |
| C14 | STAGE-D C14 -Mapping/-Copy SANDBOX；cwd=SANDBOX | C09 后，S7 排在 C10-S 后；只改映射登记文件；禁止旧脚本执行 | 顶层写根为整个 SANDBOX，必须由已批准 map 强制缩限；无实现证据。TSV“C10-S 可选”不得被用来跳过 C15 前置 |
| C15 | STAGE-D C15；target_argv 明列 tsc.js -p tsconfig --noEmit；cwd=SANDBOX | C14/C10-S 后；零编译产物；对照 C11 | Q05 缺 copies.json 内容读许可；映射不应改变依赖/断言来制造通过 |
| C16 | STAGE-D C16 -Copy SANDBOX/-Out；cwd=SANDBOX | C14/C10-S 后；同 C12 六目标/图标规则 | 原样插件比较方向明确；结果/完整事件/安全拒绝未测 |
| C17 | STAGE-D C17 -M0/-M1/-Copies/-Results；cwd=RUN | M1/C16 后；只读汇总、写自己的 OUT/audit | 不能把差异归因为通过；哈希和元数据/ADS/USN口径未测；M1 之后的活动由后续 before/after 覆盖 |
| C18 | 未绑定时 argv=null；绑定后固定 STAGE-D 模板 -Source/-Manifest/-Dest | C17 后；目标必须新建；失败不换位置；状态须进入报告 | U03 未完成；Q05 缺 m0 内容许可；目的地 readback 权限及第二归档结果需工具包核验 |
| C19 | STAGE-D C19 -Inputs/-Evidence/-Trust/-Out；cwd=RUN | C17 后、C18 状态已记录；只新增索引，不改旧证据 | Q05 工具读取授权缺项；Q06 索引完成后仍有 after 证据 |
| C20 | STAGE-D C20 -Results/-Review/-Out；cwd=RUN | C17/C19 后；允许 C18 complete/disabled/failed；新报告并停审 | 不再因 C18 未完成而完全无报告；Q05 工具读取及 Q06 尾部封存未定义 |

对全部命令的共同动态限制：未验证工具源码、真实子命令、实际 runtime 哈希和全进程权限时，不能根据固定顶层入口断言所有内部执行都被覆盖。该未验证项不授权执行任意未登记替代程序。

## F. R01—R25 独立状态复核

本包没有产品实现或运行证据，用户已要求保留独立评级。本轮逐项检查是否被越权关闭、是否被启动包替代验证，不因 B 项改进改变 R 系列。

| 项 | 状态 | 本轮依据、未完成内容与责任阶段 |
|---|---|---|
| R01 双 Promise | PARTIAL | M 343/U 62—66 保留；20 行 finalize/cancel/cache/timeout 具体动态矩阵未运行；Phase 1 前定夹具，Phase 1 内验证 |
| R02 批量取消 | PARTIAL | H G/R02；本包未改产品 cancelAll，pump/结算/资源释放仍待 Phase 1 |
| R03 熔断 | PARTIAL | H G/R03；健康回复、连续失败/恢复/挂起请求分类仍待 Phase 1；C10 不代替 |
| R04 旧事件 | PARTIAL | H G/R04；旧 Worker/旧 epoch/预哈希回调边界未动态验证，Phase 1/2 |
| R05 去重/身份 | OPEN | M 341/U 53—54：placeholderSeq 与非 force 同身份合并冲突未修；Phase 1 开始相关实现前先修规格 |
| R06 缓存 | PARTIAL | H G/R06；错误缓存/淘汰/等待者清理未验证；Phase 1 |
| R07 deferred 边界 | PARTIAL | D3 参数不变；条数/UTF-8 字节/取消守恒未测；Phase 1 |
| R08 优先级/饥饿 | PARTIAL | 未擅加 aging 或改变已批次序；实际公平性与等待时间未测；Phase 1 |
| R09 D4 超时 | PARTIAL | 固定公式、一次重试与性能判据分离保持；Phase 1/4 实测未发生 |
| R10 尝试/请求映射 | PARTIAL | H G/R10；20 行矩阵与双 Promise 完成责任未动态验证；Phase 1 |
| R11 刷新/身份 | PARTIAL | 候选重复/同 ID 新源码/提交身份仍待 Phase 2；三副本不证明竞态已修 |
| R12 后台迟到消息 | PARTIAL | D6 产品守卫未实施；C07 管理员读取边界不是产品页纪元边界；Phase 2 |
| R13 状态统计 | PARTIAL | gauges/counters、currentState 守恒未测；Phase 1/2/4 |
| R14 Vite Worker | PARTIAL | Phase 0 不构建；C10 是 Node fork，未证明浏览器 Module Worker 加载；Phase 3 |
| R15 构建身份 | PARTIAL | TOOLSRC 身份与产品产物身份不同；A/B/哈希/版本戳仍待 Phase 3/6 |
| R16 DOM 渲染 | OPEN | M 342/U 58—60：容器 token 等值与旧 commitSeq 高水位规则未统一；Phase 4 正式测量前修规格 |
| R17 真实 Panel/Harness | PARTIAL | C10 不覆盖真实 panel/DOM；共享 coordinator 不等于实际实例全部内容验证；Phase 2/4 |
| R18 deadline/分类 | PARTIAL | 首次失败、重试、提交/渲染完成等分类未测；Phase 4 |
| R19 完整一致性 | PARTIAL | 模板哈希不是完整 discovery 结果一致性；四方内容/完整序列化/失败语义仍待后续验证 |
| R20 closeBundle | PARTIAL | C10 配置隔离设计已修；C12/C16/C13 对照尚未运行；Phase 0 内取证 |
| R21 persistRun/历史文件 | PARTIAL | 路径隔离与写拒绝规则存在，未运行真实回归；D11 仍待用户批准 |
| R22 路径与物理隔离 | PARTIAL | 三副本方向保留；Q01—Q06 及实际 FD/子进程覆盖未闭合；Phase 0 |
| R23 最终提升树 | PARTIAL | 本包不提升；逆映射、候选树重建、验收后字节一致性仍待 Phase 6/P |
| R24 原项目未变化证明 | PARTIAL | M0/M1/ADS/USN尚无本轮运行证据；Q06 必须包含最后活动；不能归因未知变化 |
| R25 权限/W2 | PARTIAL | 账户/组分离已修；真实 ACL/Codex 只读待 Phase 0；W2-B 未授权不执行 |

CONFIRMED：本包保留了 R05/R16 OPEN、R01 PARTIAL 及 0/23/2。
UNVERIFIED：上表全部动态修复/验收结果。
不能以“设计有条目”“自检 PASS”或 C10 通过替代这些产品结论。

## G. U01—U03 与其他未决项

| 项 | 评级/证据标签 | 责任时间 | 本轮结论 |
|---|---|---|---|
| U01 TOOLSRC/manifest | OPEN / CONFIRMED 缺失；实现 UNVERIFIED | 实际启动前 | 只读路径查询不存在；没有批准清单摘要，不得自造/替换/下载包，不执行 C00 |
| U02 账户 SID | OPEN / CONFIRMED 尚需批准；本机解析声明的真实性未在本轮重新解析 | 实际启动前 | 精确账户值已有文档；解析不等于用户批准。不得用组 SID 代替或代用户确认 |
| U03 SECOND_ARCHIVE | OPEN / CONFIRMED 未绑定及分类冲突 | S8/C18 前绑定，结束前验成；须先统一 Q07 | 未绑定继续 DISABLED；不能选默认 TEMP 或失败自动换路径 |
| U04/U05 | OPEN | Phase 1 / Phase 4 前 | 对应 R05/R16；本轮不修产品 |
| U06 | PARTIAL | Phase 1 前准备，Phase 1 中运行 | 对应 R01；未运行矩阵 |
| U07/U08 | OPEN 外部决定 | 各适用阶段前 | 未批决策与 W2-B 仍不授权 |
| U09/U14 | UNVERIFIED | 保留未知 | L1 connect-timeout、历史大规模元数据变化不归因到特定账户或安全机制 |
| U10—U13 | PARTIAL / UNVERIFIED | Phase 0 内及出口 | ACL、复制、守卫、真实 forks、工具行为、写频次、审计规模等不得写成 PASS |

未把 U 项的外部未决状态纳入 R 的冻结统计，也没有把未指定第二归档误称为已经尝试归档失败。

## H. N01—N09 历史交叉核对

| 项 | 评级 | 本轮结论 |
|---|---|---|
| N01 结算责任 | PARTIAL | 同 R01；启动包不能证明产品 Promise 结算 |
| N02 统计守恒 | PARTIAL | 无状态变化运行证据 |
| N03 渲染与性能 | OPEN | R16 规格冲突保持 |
| N04 源码身份/去重 | OPEN | R05 规格冲突保持 |
| N05 安全指标 | PARTIAL | 指标文字保留；实际分子/分母/源码对照未验 |
| N06 Harness/Panel | PARTIAL | Node forks 与真实 Panel/Module Worker 分开 |
| N07 产物/信任链 | PARTIAL | 产品构建尚未验；本启动包另有 Q01 信任缺口 |
| N08 提升树 | PARTIAL | 本轮不提升 |
| N09 阶段依赖 | OPEN（本启动包） | 旧 C10/缓存/编号问题有修正，但 Q01—Q07 仍阻止唯一执行路线闭合 |

N 表是历史发现的本轮映射，不改 R 表 0/23/2。

## I. 安全、身份和信任边界

1. **CONFIRMED：C00 不执行 TOOLSRC 脚本。** 它使用系统 PowerShell 读取 manifest 并计算三件文件摘要。其最底层信任仍来自外部批准的登记表、准确的运行时和启动输入；自身输出不能自证启动命令未经替换。
2. **UNVERIFIED：哈希校验到执行之间的文件稳定性。** 尚无包、无运行；需验证 dispatcher 每次加载及依赖绑定，拒绝路径逃逸/链接/替换。不能声称已经发现攻击，也不能仅凭文件名一致认定完整性。
3. **CONFIRMED：C02 固定账户 SID，保留用户确认。** 当前 SID 来源是实施方记录的本机解析；本轮不将其当新批准。C03 的非管理员/组检查是必要检查，不能单独证明不存在其他可写 ACL。
4. **UNVERIFIED：完整 OS 权限结果。** 继承关闭、显式 ACE、既有子文件、owner/组与真实 Codex 账户有效访问尚未测；不能由一个哨兵拒写推广成“任何目录都不可写”。也不得为了读得到而扩大 Codex 权限。
5. **UNVERIFIED：原生/FD/链接/子进程边界。** NODE_OPTIONS 约束 Node，不自动覆盖 PowerShell、robocopy 或任意原生子进程。C06/C10 必须验证已注册机制；不能以日志中没有事件代替禁止区零读取证据。
6. **CONFIRMED：三副本路径不同；UNVERIFIED：物理独立。** 文件 ID、硬链接/重解析、依赖解析、缓存、TEMP、profiles 和固定输出的实际去向必须证实。不能仅靠 cwd 不同。
7. **CONFIRMED：原项目写入未获授权。** 管理员令牌能力大于脚本白名单，并不形成 OS 级原项目只读沙箱；只有未来有效守卫/审计/前后证据才能证明本次操作未越界。
8. **UNVERIFIED：C10 产品含义。** 它预期证明 Vitest Node fork 的 guard 继承与访问控制；没有浏览器、扩展环境、Module Worker、decoder 消息语义或面板提交验证。
9. **CONFIRMED：不改变安全门槛。** false replacement=0、Source Integrity=100%、SRR=100%、有替换时 Precision=100%、零分母 n/a、零替换不自动通过、version-mismatch 阻断位置比较均保留。具体源码三方比对与参考调用位置分母沿用既有定义；本轮没有测量。
10. 未对 capture-validation、capture-plan、verified-replacer、replacement-dryrun、capture-engine 或 decoder-discovery 做任何修改；不建议放松 verified、outer-state-write、status-unstable、throwOnSideEffect。
11. TEMP 下文件的当前摘要是审查版本证据，不是其他主体不能修改它们的证明。历史来源不明的变化保持 unknown，不以“可归因”免除禁止区规则。

## J. D1—D16 与阶段边界

| 决策 | 本轮处理 |
|---|---|
| D1 | 未批准；不以 C10 控制配置确定产品 Worker A/B/格式 |
| D2 | 未批准；本包不代签 |
| D3 | 已批准；256 条与 64 MiB、deferred、≤64 KiB 小脚本优先保持，不擅自取消上限或增改调度 |
| D4 | 已批准；clamp(120s + 1.0ms × UTF-8 字节数, 5min, 45min)，挂死看门狗与性能判据分离；一次自动重试；不事后按实测改阈值 |
| D5 | 未批准；本包不代签 |
| D6 | 既定产品身份/纪元守卫，不扩大为修改 capture 安全规则；后续实现仍验收 |
| D7 | 未批准；本包不代签 |
| D8 | 未批准；本包不代签 |
| D9 | 未批准；本包不代签 |
| D10 | 已批准；仅 ?obTest=1 只读元数据白名单，不增加源码/候选/调用位置出口 |
| D11 | 未批准；历史输出隔离的细节不能由本包视作批准 |
| D12 | 已批准；工作副本、逆映射/字节核验、候选树验收后一次性 P 提升；本包不提前改原项目 |
| D13 | 未批准；本包不代签 |
| D14 | 已批准方向保持；正式 RUN、关闭继承、账户+SYSTEM、Codex 只读；精确 SID 仍需启动确认 |
| D15 | 每阶段静默约定保持；不重新扩大承诺，不把未知变化归到特定账户；管理员日志导出不在本轮执行 |
| D16 | 未批准；本包不代签 |

W2-A 只读不等于独立实跑；W2-B 执行者/独立写授权未定，不执行。L1 根因仍 UNKNOWN，本轮没有浏览器、nextpage3、L1 预算消耗或台账改动。

全局路线保持：**Phase 0 → Phase 3 → Phase 1 → Phase 2 → Phase 4 → Phase 5 → Phase 6 → P**。
- Phase 0 只验证隔离与基线，不开始产品整改或产品构建。
- Phase 3 的 A/B 和产品 Worker 构建需要单独决策/验收。
- Phase 1 前先解决 R05 规格，并补 R01 具体矩阵；Phase 1/2 强耦合，联合回滚须包含 panel 与 worker 客户端相关变更。
- Phase 4 正式测量前解决 R16，区分分析成功、提交完成、真实 DOM 可用，保留所有失败 run。
- Phase 6/P 重新建立实际验收候选树，校验逆映射、产物及保护文件；不得拿不同源码/构建的旧结果提升。
- 本轮不批准任何阶段自动启动。

## K. 准入条件按时间分类

### K.1 实际启动前必须完成

1. 修订 Q01—Q07，统一主文、TSV、注册表、审计 schema；重新独立审查并绑定准确文件摘要。
2. 提供完整 TOOLSRC 包和批准的 RELEASE-MANIFEST 摘要；明确可信引导与每个入口/依赖的字节绑定。实现审查不能由自检 PASS 代替。
3. 用户确认准确管理员账户 SID、指定批准范围内的 Codex 账户、RUN_ID、静默窗口及有限执行范围。
4. 用户另行明确授权“开始有限 Phase 0”。接受报告或方案不等于执行授权。
5. 已有停止/保留失败现场规则；不以运行中调整路径、白名单、哈希或账户处理失败。

### K.2 可且应留在授权后的 Phase 0 内验证

- S0：C00/PRE 实际校验、B0—B5、C02 ACL 读回、C03 原账户能力与观察者真实性。
- S1：工具落盘、独立 staged 核验、任何篡改/缺失/额外文件拒绝。
- S2：先合成保护区验证 detector/guard/audit 的正反例；未通过不进入真实副本。
- S3/S4：M0、归档、三副本逐字节/文件身份/链接/缓存/临时路径隔离。
- S5—S7：P/N/S 真实 fork 预载、拒读/拒写、允许读写；C11/C15 --noEmit 零产物；C12/C16 六目标；C13 零 dist；C14 可逆映射。
- 所有守卫的内容读取、FD、复制、链接、子进程边界与未登记访问；禁止区成功读取直接 FAIL，不允许归因豁免。

这些尚未发生，全部 UNVERIFIED；不是让本轮偷偷先做一遍。

### K.3 Phase 0 结束前必须满足

1. 所有硬门通过，所有失败和中止记录保留，审计无缺段/重复编号/未授权写入。
2. 明确零读取/零未授权写入证据和原项目前后内容、元数据、ADS/USN 的覆盖范围；未知变化不按通过。
3. SECOND_ARCHIVE 经用户绑定且归档核验通过，否则只可 exit-not-met。
4. 完成 Q06 的终端封存，报告/索引/尾部证据与最后链头摘要可交叉验证。
5. C20 输出明确 completed/exit-not-met；单有报告文件不等于阶段通过。
6. 停止并等待独立复核和用户决定，不自动进入 Phase 3。

## L. 风险等级与最终建议

| 等级 | 主要风险 | 处理 |
|---|---|---|
| P0 | Q01 首次执行信任链、Q03 公共链头权限；未提供批准工具包 | 启动前修文书并补外部输入；不能边运行边补 |
| P1 | Q02 观察者入口；Q04 审计事件/封存；Q05 必要读取；Q06 尾部证据 | 启动契约统一后再授权；真实行为在 Phase 0 内验 |
| P2 | Q07 条件分类；19 payload 与 manifest 数量表述；运行时信任责任和规范化编码说明 | 书面澄清，不擅自改变批准取值 |
| 后续核心风险 | R05、R16 OPEN，R01 等动态未验 | 按对应阶段处理；不拿 Phase 0 结果替代产品验收 |

本轮没有发现并证明真实工具越权、原项目被本轮修改或产品 Worker 已失败；也没有任何动态 PASS。当前拒绝是针对启动规则仍有实质缺项，不是推测运行一定失败。

**建议：不批准当前 V4 实际启动。** 先发布只修启动契约的新版本，保留本次七份输入和历史报告；补齐上述有限问题及用户外部输入后再独立复核。不得借修订开始产品整改，不得自动执行 C00—C20。

本轮未执行测试、tsc、构建、浏览器、L1、ACL 修改或 Phase 0；未创建 D:\P47RUN 或 D:\P47TOOLS；仅创建本独立报告。报告本身的字节数、行数和 SHA-256 在保存后另行回传，避免自引用摘要。

审查完成，停止，等待用户决定。