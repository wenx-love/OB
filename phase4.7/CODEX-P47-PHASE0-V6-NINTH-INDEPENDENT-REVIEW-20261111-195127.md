# OB-Recover Phase 4.7：Phase 0 V6 第九轮独立审查

日期：2026-11-11。审查目录：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan。
性质：完整独立只读审查。仅新增此带时间戳报告，不修改 V4/V5/V6、产品或历史证据。

## 1. 最终结论

**C. REJECTED。V6 仍有实质性启动阻断，不能申请启动 Phase 0。**

| 必须分开的判断 | 本轮结论 |
|---|---|
| V6 静态文档是否合格 | 不合格：许可、失败继续、绑定交接、审计正例仍有明确冲突 |
| V6 九个工具源码是否合格 | 作为整体不合格：生成器和检查器存在可定位缺陷；部分只读辅助脚本在其狭窄职责内没有发现高风险行为 |
| 是否具备申请 Phase 0 的条件 | 不具备；既有静态阻断，也缺实际运行工具和外部批准输入 |
| 是否仍有 P0 阻断 | 有：C05-FINAL/C20-SEAL 共32处允许/绝对禁止交集直接阻断完整staged校验；另有安全失败分类不唯一 |

V6 确有修复：原16次“允许工具文件却禁止父目录”的模式已消除；54处 control_reads 字段丢失已修；58×31＝1798个TSV字段与JSON投影一致；事件ID、c18字段、LF和实际分片摘要已改正；正常绑定/未绑定前驱、C03期限、after接受失败状态、C19前一close截止点已修。

但这些改善没有消除整体阻断。新生成的精确deny在两次完整staged验证中又禁止全部16个文件；16个staged入口仍登记source dispatcher的“自身读取”；C06的guard配置为null；观察者/产品分片角色缺许可；成功审计正例中的同一文件有不同摘要；普通失败后的继续路线仍撞上后续成功门，早期fatal的degraded封存仍要求尚不存在的完整staged集合。

B1—B9：**0 CLOSED / 4 PARTIAL / 5 OPEN**（OPEN：B1/B3/B4/B8/B9）。
Q01—Q07：**0 CLOSED / 0 PARTIAL / 7 OPEN**。
R01—R25：**0 CLOSED / 23 PARTIAL / 2 OPEN**（R05/R16 OPEN，R01 PARTIAL）。

CONFIRMED表示直接字节、源码或契约依据；SUSPECTED表示推演风险；UNVERIFIED表示没有运行证据。OPEN/PARTIAL/CLOSED是问题状态，不与上述证据标签混用。以下没有把实际攻击、越权或运行失败写成已发生。

## 2. 输入完整性和版本身份

### 2.1 19个交付文件

所有路径的共同绝对前缀：
C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\

本轮先读取交付清单，逐一读取原始字节、独立计算大小/行数/SHA-256。18个清单条目全部匹配。清单自身单独测量，没有用户提供的外部预期摘要；不能把内部清单一致当独立来源认证。

| 文件 | 字节 | 行数 | 本轮SHA-256 | 与清单 |
|---|---:|---:|---|---|
| PHASE4.7-PHASE0-START-CONDITIONS-V6.md | 96501 | 405 | 5342fd55f5a844fc76b56cf07569ef8923925d48e22ee9ed249bacd825221a58 | 一致 |
| PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv | 206472 | 59 | 661ca153076ab458a48a919709da0241fd7e72f831d66637531e68565236514d | 一致 |
| PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json | 859560 | 23711 | 29b1693104c2690cf6987a9dd247aa4145ec17ffcfc5a7c33b225bbcb1e69906 | 一致 |
| PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md | 21672 | 429 | c3026ab8c226833794a2245d1cbbe83bd8ec905ae06a440934fe194276099088 | 一致 |
| PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json | 9182 | 1 | 8d9a4773296e8f57509b4d659d6f3d6ca94ebf70cfeddd8dcb03803a06a8418b | 一致 |
| PHASE4.7-PHASE0-V5-TO-V6-CHANGELOG.md | 8156 | 129 | 5ee7f761b9d68cd83abad32f08dde9c1e8b853b15555b71a95d204d53240bd16 | 一致 |
| PHASE4.7-PHASE0-V6-OPEN-ISSUES.md | 4122 | 50 | 1f85f67535046c6df1ee156c7a5edb28ffc49c5b364c40f0a82598484fd0eac7 | 一致 |
| PHASE4.7-PHASE0-V6-SELF-CHECK.md | 4319 | 67 | 98a3329c453972a58eb8c5158782df8a116a907246be2ddb225733fd18e0a588 | 一致 |
| PHASE4.7-PHASE0-V6-EIGHTH-REVIEW-TRACEABILITY.md | 5180 | 71 | 88666c0314329c259bafbc20a7f14664f3d9682ae2e72260f9a40bc93e245505 | 一致 |
| p0v6-lib.cjs | 5669 | 127 | 799dcbb5081f87d3be77b1e57502b8c9f572c5d61b343c28cb5e5a9bd0dfb482 | 一致 |
| p0v6-spec.cjs | 36153 | 499 | a75342552623f15995c45d84456a6b987ad3490191d3466de3fa7d65bc91b075 | 一致 |
| p0v6-audit.cjs | 22020 | 273 | be3b4543c328ecb473926b762899764c2ee172a3c2c913e7075c404647e48583 | 一致 |
| p0v6-build.cjs | 27472 | 427 | be57bba1cbc7442ba66aec562ffcd488516709a154baf62c4b50a714a2bb8f3d | 一致 |
| p0v6-check.cjs | 18728 | 295 | 9bca4cbcb74e92b1a2982522a7bf97813fdfd3011a4f3a556b5eab596e9630c3 | 一致 |
| p0v6-verify.ps1 | 7094 | 116 | c61356c1ab7608f99d138ff032386b65b49f283fc1fd03b6ba3feb1e949ce085 | 一致 |
| p0v6-parse-inline.ps1 | 1160 | 27 | 430b9718e0699e661ceacc40e359dd12ca9614896c3f64395454fea2add7a846 | 一致 |
| p0v6-hygiene.cjs | 3240 | 50 | 3e24a658563f9118ced6860ff97476435fe7044ce22d731e6bbd11d297b85072 | 一致 |
| p0v6-controlconfig-check.cjs | 764 | 15 | a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390 | 一致 |
| PHASE4.7-PHASE0-V6-DELIVERY-MANIFEST.md | 3782 | 66 | f11846ff7f0953c6e70d8d863a1b42b5a6b1187f21a53a31476ce9013a8022b5 | 自身单独记录 |

18个列明文件均无UTF-8 BOM、无CR；TSV为LF结尾，59行＝1头＋58数据行，每行31列。JSON均可解析。目录中匹配V6命名的文件恰为上述19个，没有发现额外V6交付项或缺失项。未用V5文件替代任何V6输入。

第八轮报告已读取并复算：34597字节，352行，SHA-256 ab284d004914c82d1438514c13ba27b09134524d656ae3c69ec266a1013a06a8。
V5交付清单的18个条目再次复算均未变化；第八轮报告与历史记录一致。V5→V6变更记录、追溯表及未决表均纳入交叉审查。

### 2.2 方法和证据边界

本轮自行编写只读stdin数据处理：文件哈希、JSON/TSV解析、字段对应、双计划编号/前驱、权限集合交集、规范化和向量摘要。没有import/require任何交付模块，没有调用其函数，没有执行任何提供的脚本。

独立复算结果：
- 21个唯一命令，58个唯一执行；绑定计划58、未绑定55，双前驱和编号对应正确。
- 58个顶层argv摘要、2个inline文本摘要、8个非空target_argv摘要全部匹配。
- 58×31＝1798个TSV单元格与注册表规定投影一致。此处不意味着TSV完整承载JSON的所有细节，例如角色集合和产品环境仍需单独检查。
- 15个正例canonical文本、SHA-256与字节数正确；后文另列协议语义错误。
- 7个CJS用vm.Script仅语法解析；2个PS1及2条inline用PowerShell Parser仅解析；均无语法错误，未求值/运行。
- 独立只读路径查询：D:\P47TOOLS\p47-phase0-v6 和 D:\P47RUN\P47-20261111-01 均不存在。

OpenCode“1761项/0失败”“PowerShell 66项/0失败”“幂等5/5”是历史自检声明。本轮读其源码并审查覆盖，未运行这些工具，未把这些数量列作本轮通过数。静态语法通过也不代表安全语义通过。

## 3. 九个工具完整源码审查

以下九个绝对路径均已完整读取。主文简称M，审计规范简称A，注册表简称R；行号对应本次哈希版本。

### 3.1 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-lib.cjs

完整127行。w（6）仅把斜杠换为反斜杠；P常量与TOOLS（8—79）固定路径和20项映射；canonStr/canon（82—115）规范化字符串、排序键、拒绝不安全数和孤立代理；sha256hex/argvSha（117—119）用crypto计算实际传入字节摘要。

结论：固定数据上的哈希/向量规范化可复算；它不是路径安全或文件身份验证器，不执行realpath、祖先链接、硬链接或文件句柄身份校验。不能以w函数满足M第3/4节的Windows真实路径安全要求。数组稀疏项/非普通对象不属于已验证的JSON数据域，不应向外宣称通用序列化安全；当前实际JSON输入未见此问题。

### 3.2 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-spec.cjs

完整499行。C00_SCRIPT（31—71）增加RP/ANC祖先检查，FH使用FileShare.Read；PROBE_SCRIPT（73—110）做账户/组/nonce/哨兵和写句柄探针；ex（116—135）登记执行；dirsFor/files（140—141）创建输出合同；TARGETS（261起）、wrap（412—430）、PLAN（474—494）定义正常流程。

结论：登记300/900秒期限、八条target argv、普通after接受failed/aborted，是真实源码修改。仍有gate与安全fatal分类不唯一、失败依赖无skip、C18环境覆盖、C04既存目录含义不清等缺口。此文件只是定义执行数据，未实现dispatcher、线程/进程回收或OS ACL执行。

C00静态祖先检查覆盖比V5更好，但文件属性查询、哈希句柄和下一进程装载分离，不能证明检查后不会替换；真实Windows/NVM路径可用性仍未运行。PROBE 300s是登记值，实际终止执行的控制器未交付。

### 3.3 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-audit.cjs

完整273行。EVENT_FIELDS/CHAIN_FIELDS/SUMMARY_FIELDS（26—109）是字段描述数据；FAILURE_STATES（111—122）是状态文字；buildVectors（137—245）生成规范化样本和JSONL摘要；negativeValues（254—270）生成负例对象。

结论：实际实现的是schema与向量生成，不是运行时审计。它没有真实文件追加、flush/fsync、独占锁、进程并发控制、崩溃恢复或防篡改实现。A:108也承认运行审计工具未交付。不能把同名p0v6-audit当p0-audit.cjs运行器。

旧ID、LF、c18字段、分片真实摘要已修；但buildVectors:156与:200为同一index.json给出不同最终哈希，:187仍用错误source入口，负例基底:255缺event_id。见第5节P0-3。

### 3.4 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-build.cjs

完整427行。denyFor（58—70）、权限分层生成（76—175）、目录检查（178—192）、JSON（310—334）、TSV（337—360）、appendGenerated（387—393）是关键路径。

CONFIRMED：
- 写入对象为vectors、registry、TSV、主文/审计规范生成附录，共5份V6文件；固定名称未直接指向V4/V5或产品。
- :27在后续合同检查前就覆盖向量；:333/:360随后写JSON/TSV；不是原子发布，失败可留下不同批次产物。
- :419/:420在主文/规范缺失时跳过附录仍可继续；appendGenerated从第一个BEGIN截断重写末尾，未保留生成块之后附加的内容。
- 不自动更新交付清单摘要。将来重跑必须重新测量完整交付，不能继续沿用旧manifest。

核心缺陷是:67忽略允许整个staged子树、:89错用source自读、:113/:121缺审计角色、:141产品dist保护语义冲突、:39把ML降为subtree。见后文。
结论：不合格，且有明确写入副作用，本轮未运行。固定路径并不等于运行时文件系统隔离；遇链接的实际写目标尚未验证。

### 3.5 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-check.cjs

完整295行。validateEvents（28—51）、validateRecord（52—59）、负例分派（64—78）、向量物理字节（81—105）、权限检查（约151）、失败矩阵（240—246）、TSV重生成（248—268）均审阅。

改进：增加ID格式、字段存在性、LF字节、JSONL摘要、双计划与TSV投影检查。
缺陷：
- :73的n+1===n对当前有限字节整数恒假，固定产生期望错误码，没有解析实际无LF输入。
- :40—43只检查required/forbidden存在，不执行schema常量/字段类型/枚举/路径规则。
- :46从整个数组找intent，未限定同part、未限定先于result、未限制重复result。
- :151及build:163只查allow位于deny下方，漏查allow子树包含deny文件，遗漏32交集。
- :155只查product policy摘要为字符串；:137把env标签当“只读一次”证据。
- :240—246只检查状态数量/字符串和包含SEAL，不证明可达性或无报告重跑。
- 复用L/A以及由A生成的负例，仍有共同逻辑错误风险。
结论：能做部分结构回归，不能作为1761项完整安全证明；需修复实际检查逻辑。

### 3.6 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-verify.ps1

完整116行。ShaBytes/ShaText（13—14）真实计算字节；CanonStr/CanonStrArray（15—16）仅为argv字符串数组；向量（28—66）、计数/argv（68—94）、TSV结构（96—103）为主要职责。

结论：没有发现脚本直接写文件或运行子进程；ErrorActionPreference=Stop及失败计数使已检测错误非零退出。LF物理字节复算现正确。
它对向量只是hash已提供canonical文本，不从原始对象独立实现完整canonical规则；仅数12个负例，不审查负例语义；argv规范化不处理全部C0控制符，但当前58条argv无此类字符，本轮摘要一致。66/0不证明完整schema或权限正确。

### 3.7 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-parse-inline.ps1

完整27行。固定读取同目录V6 registry（3—6），仅对两种entry_mode的argv末项调用Parser::ParseInput（8—23），有错误则退出1（25）。
结论：就“只做语法解析”职责未发现意外求值、外部进程或文件写入路径。没有核验输入摘要、entry数量或语义，零错误只说明语法；不验证身份、期限与权限。

### 3.8 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-hygiene.cjs

完整50行。core检查（8—20）读5份文件、检测BOM和任何CR；inputs（22—47）比对17个历史摘要。
结论：没有写入操作；检测任何CR比只检测CRLF更严格，字段名crlf不可推广为完整编码验证。不检查全部19份、不保证有效UTF-8或最后LF，也不是防修改保护。
自检文字称“V5九份＋V4七份＋两报告”应为18，源码实际列表17项且包含V5 manifest，未覆盖V5全部九份契约；“17/17”仅对该列表成立。本轮另按V5交付清单复算18项，均未变。

### 3.9 C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\p0v6-controlconfig-check.cjs

完整15行。3—12固定8行配置文本；13—15计算并比较325字节及固定SHA。
结论：没有文件写入、import Vite或启动进程。固定模板为LF、无末尾LF；本轮复算与18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003一致。它验证的是硬编码文本，不验证实际副本配置字节、插件初始化副作用或dist零写。

### 3.10 九个工具与实际执行工具的关系

九个工具是契约生成/检查工具。运行时的p0-dispatch.ps1、p0-verify-release.ps1、p0-audit.cjs、fs-guard.cjs和业务工具仍不在本次19文件中，发布根也不存在。因此“工具实际实现遵守运行权限”只对已交付生成/检查逻辑可审；运行器行为必须保持UNVERIFIED。这不是忽略源码，而是源码集合本身缺少所要求的运行实现。

## 4. 四项P0复核

| 项 | 确认修复 | 未闭合/新问题 | 总体状态 |
|---|---|---|---|
| P0-1 读取冲突 | 原16执行的父目录deny改为精确文件；已加载文件不再被原模式误禁 | FINAL/SEAL各16处新交集；16个staged入口自读仍错源；运行器缺失 | OPEN |
| P0-2 TSV/JSON与权限 | 原54字段丢失确已修；1798格一致；输出父目录/产品报告增加 | 分片角色、审计父目录、产品环境/预载、C18动态权限仍缺；投影一致不等于合同完备 | PARTIAL；原字段差异子项已静态闭合 |
| P0-3 向量协议 | ID、c18、LF、分片摘要和旧跨exec引用已实质修复 | 同文件成功摘要矛盾；入口/argv不对应；负例假检验/验证器漏规则 | OPEN |
| P0-4 失败/跳过 | 58/55双计划与前驱正确；after接受终态；期限与前一close截止点已修 | gate继续与依赖成功冲突；安全fatal优先级缺失；早期degraded仍需完整staged | OPEN |

四项编号沿用V6任务标签，不代表每个子发现都同为P0严重度。下文逐项列级别和依据。

### 4.1 P0-1：32处新交集，旧问题转移而非整体消失

R[C05-FINAL-E01].reads.business 和 R[C20-SEAL-E01].reads.business 均允许T:RUN\tools；各自deny_read又列出该目录内全部16个staged文件。R.path_policy.denied_read_absolute=true，M:48明确同层allow与deny不得有交集。

build:67只从位于STAGED下面的精确路径收集allowed，未认可路径等于STAGED的subtree许可；:69把16文件全加入deny。build:163/check:151只查allow是否在deny下，漏反方向包含关系。
本轮按路径组件双向集合交集独立扫描，得到恰好2×16＝32项，集中于上述两个执行。

影响：完整staged读回/终端复核无法同时满足两套许可。严格deny会拒绝必要读取，忽略deny会破坏合同。必须修生成逻辑与双向交集检查；不能由现场运行器选择放宽。

此外，build:89对所有执行固定src('dispatch')。16个staged执行的真实entry_path不在reads.dispatcher中，自称“self bytes”的许可实际指向source。这是明确残留，非运行结果。正确许可须绑定实际entry_path，外部先验校验与加载同字节的实现仍另需审查。

### 4.2 P0-2：字段一致性已修，但还存在权限缺项

CONFIRMED新缺陷：
- C06没有spec.guard=true，build:148跳过policy生成，R.guard=null，尽管load_files含fs-guard且enforcement声称Node和children受保护。不能说实际必无guard，但合同缺少本步骤有效policy绑定。
- build:113/:121把所有54个audit_part_rule.roles固定为dispatcher/tool；C03需要observer，8个产品执行需要product，均未获相应角色许可。product也无自己分片写与预载读取合同。A:18/:26/:39要求各进程分片和父/worker预载。
- spec:175仍在C01业务输出给CHAIN file-create，控制层也有相同许可；需按唯一control writer归属，不把业务与control权限混用。
- 所有审计段只登记AUDIT\Cxx\exec的目录创建，没有AUDIT\Cxx中间层创建者；C01只建AUDIT根。不能由dir-create隐式允许任意祖先递归创建。
- M:107和cache_policy要求runner用RUN\tmp、产品用COPY\tmp；spec:404把产品型执行的required_env整体设为COPY\tmp，product无独立required_env，父/子分层未真正表示。
- C12/C16产品允许六个静态目标（其中图标另有条件），却由build:141把COPY\dist加入product.protect_write。若保护表示子树则冲突；若只保护目录对象则须明确该含义及精确允许规则。不能猜测实际guard优先级。这里确认契约歧义，不声称已动态拒写。
- C14的op仍为map-listed-file-write，但build:39将kind从V5的map-list改为subtree；M:108却说仍是map-list。map_expansion文字尚限制精确文件，不能因此声称已经任意写副本；需恢复一致类型并验证展开前零写。
- C18-BIND无数据/metadata输入却检查动态目标存在性、父目录和重解析；C18无目标内容读回许可，且spec:373的bound-value env在:404被覆盖。只允许写不自动允许读回或重读可变环境。

### 4.3 P0-3：15个正例与12个负例

| 正例组 | 数量 | 独立结果 |
|---|---:|---|
| canonical基础 | 8 | 文本规范化、SHA-256、字节数一致 |
| 事件 | 3 | ID32hex、seq/prev/引用正确；同exec的权限路径可对应 |
| 链记录 | 3 | prev摘要链接正确，c18字段齐，LF物理数正确；但C19入口/argv不对应真实注册 |
| summary | 1 | 分片摘要正确；同一业务输出摘要却与write_result不一致 |

逐项字节复核如下。每个“摘要一致”仅指其canonical文本与提供的SHA一致，不替代右列的语义判断。

| 名称 | canonical字节 | 独立摘要/规范化 | 语义结论 |
|---|---:|---|---|
| empty_object | 2 | 一致 | 基础编码样本 |
| nested | 41 | 一致 | 基础编码样本 |
| key_order | 19 | 一致 | 排序样本 |
| string_escapes | 57 | 一致 | C0/引号/反斜杠编码样本 |
| astral_char | 12 | 一致 | 成对代理项样本 |
| integer_limits | 47 | 一致 | 安全整数边界样本 |
| negative_zero | 7 | 一致 | -0规范化为0 |
| bools_and_null | 17 | 一致 | 基础编码样本 |
| event_write_intent | 514 | 一致 | 同exec权限引用已修 |
| event_write_result | 620 | 一致 | after输出摘要与summary冲突 |
| event_read_batch | 656 | 一致 | 规则路径对应C19 |
| genesis | 670 | 一致 | 物理LF计数已修；是简化fixture |
| segment_open | 668 | 一致 | 字段齐；入口/args不对应登记C19 |
| segment_close | 968 | 一致 | 分片摘要已修；继承输出摘要矛盾 |
| segment_summary | 694 | 一致 | 同一输出hash与write_result冲突 |

真实数值：genesis canonical为670字节，落一行671字节；open.prev_file_bytes=671；close.prev_file_bytes=1340。三事件JSONL为1793字节，SHA-256为039d13f30a33906497ca1d159a29b30fc4313bd36022a9be0252f7b2613f043c。
变更记录:82仍写669/1337，属于过期文字，应修文字而非改回正确向量。

CONFIRMED正例错误：
- audit:156的write_result.after指index.json摘要a×64，:200的summary.outputs同一index.json为3×64，均1536字节，没有后续写事件。close复用后者，不能作为内部一致的成功审计包。
- audit:187的C19 entry_path是source，而R[C19]实际staged；args_sha256用f×64而非注册值。若只想做编码示例须明确缩小证明范围，不能称登记C19的完整正例。
- A:101要求“任何崩溃均unpaired_intents>0”过强：首个intent前崩溃可以为0；段失败与实际未配对数量应分开。

12条负例逐项核查：
| 负例 | 源码检查结果 |
|---|---|
| event_id含v | 有非法ID，但不能替代完整合法基底上的单故障校验 |
| 31位ID | 输入确不满足32位；应检查器实际格式判断，不只数标签 |
| open缺c18 | 三字段缺失；同时entry_path为x，混有无关错误 |
| result缺intent_ref | 缺失；同时seq/after等还有无关错误 |
| intent带outcome | 禁填字段存在；基底还缺event_id |
| 跨exec引用 | 只有result没有来源intent；无法单独证明跨exec判断 |
| 重复ID | 基底两次缺event_id，检测undefined重复并非合法ID重复 |
| seq跳变 | 有跳变，但首事件缺ID，未隔离被测属性 |
| prev错误 | 有错误，但首事件仍缺ID |
| 无LF截断 | check:73比较有限整数n+1===n，恒假后直接给bytes.lf；未检查实际行尾 |
| 少计LF | check:75比较预设数字，audit:268设bytes−1；没有独立解析物理JSONL |
| summary自哈希 | 确有禁填字段，检查器只看字段存在，非完整summary验证 |

全部12项只做本轮静态源码/数据审查，没有执行negativeValues或交付检查器。向量JSON只保存负例名与期望错误，不交付负例实际字节；不能宣称本轮已动态验证12项拒绝。

### 4.4 P0-4：失败分支仍未闭合

最小反例：C10-P普通测试非零 → C07-A-C10-P成功 → M:124要求继续C10-N，但C10-N.gate仍要求C10-P sealed ok。不允许放松安全前置来“使其可达”；应明确skipped-dependency状态或改变停止规则。

| 失败来源 | 仍要求其成功的后继 |
|---|---|
| C10-P | C10-N、C11、C12 |
| C10-N | C13 |
| C13 | C10-S |
| C10-S | C14、C15、C16 |
| C14 | C15、C16 |

第二类冲突是普通gate与安全fatal未按原因分开：spec:280/:284将preload缺失、禁止读写成功与普通非零放在C10 gate；C12越权写、C14路径逃逸也随整条命令归gate。M:125却将权限/身份/审计归fatal。需明确安全错误优先于命令默认类别，并逐错误码绑定，否则可能在守卫失效后继续实验。

第三类冲突：C02失败时C04未执行，staged只有C01创建的空根；SEAL gate允许aborted/degraded，但spec:469/:470仍无条件要求完整staged复核。不完整staging不能通过该封存条件。应定义外部失败记录或按实际已有可信集合封存的单独模式，不能伪造完整校验。

## 5. C00—C20完整执行链

### 5.1 正常依赖图

图中W(X)表示已登记的一次C07-B-X → X → C07-A-X。C07源入口与目标staged入口不可互换；实际映射以R.entry_mode为准。

~~~mermaid
flowchart TD
  A["C00"] --> B["C05-PRE"]
  B --> C["C01 → C02"]
  C --> D["C03-OBS READY"]
  D --> E["C03-PROBE"]
  E --> F["OBS closed ok → C04"]
  F --> G["C05-FINAL → C06 → C07-M0"]
  G --> H["W(C08) → W(C09) → W(C10-P)"]
  H --> I["W(C10-N) → W(C11) → W(C12) → W(C13)"]
  I --> J["W(C10-S) → W(C14) → W(C15) → W(C16)"]
  J --> K["C07-M1 → W(C17) → C18-BIND"]
  K -->|bound| L["W(C18)"]
  K -->|unbound| M["W(C19)"]
  L --> M
  M --> N["W(C20-REPORT) → C20-SEAL"]
~~~

独立核对：21命令、58绑定执行、55未绑定执行；C07含M0/M1与15对包装共32次；新增BIND始终执行，未绑定恰少C18三连。每个正常计划ID唯一，编号和前驱正确。C01同时有genesis和自身段的控制许可后，109/103计数模型已自洽；这只证明计划数量，不证明真实日志数量。

### 5.2 每命令合同与缺口

除C03-PROBE为指定Codex外，执行者为管理员；inline/PRE/PROBE不记普通链段，C01是genesis+自身段，SEAL为终端无append，其余为participant。所有实际工具哈希待manifest，运行未验证。

| 命令 | 前置/入口与读写/审计责任 | 失败出口和结论 |
|---|---|---|
| C00 | 外部批准→inline；读运行时/manifest/三工具；stdout，无RUN写 | pre-run停止；祖先检查有实现，可信启动与TOCTOU未证 |
| C01 | PRE通过→source；读发布包，建RUN/目录/哨兵/genesis/自身段 | bootstrap失败外部记录；业务CHAIN许可与control重复需修 |
| C02 | C01关闭→source；RUN ACL、SDDL与结果 | fatal；有效ACL未测，早期seal缺staged |
| C03 | OBS source与PROBE inline；900/300s，nonce/哨兵，Codex只stdout | fatal；READY并行/结束顺序明确，observer分片角色未许可，PROBE失败时OBS回收需具体化 |
| C04 | OBS关闭→source；读payload、CreateNew staged，输出stage记录 | fatal；C01已建空根，gate允许空根而fail写target already exists，需区分根/目标文件 |
| C05 | PRE source验证20文件；FINAL source验证16staged | PRE停止/FINAL fatal；FINAL32交集的一半阻断必要读取 |
| C06 | FINAL通过→首个staged；读cases/vectors、写controls/result | fatal；guard=null、实际self读错源；不得进入真实副本 |
| C07 | source登记的M0/M1与32条记录；读ORIGINAL/M0/before，写独立证据段 | fatal；次数正常可核，但中间审计父目录、异常重复/分支需修 |
| C08 | M0→staged；读ORIGINAL/M0，建snapshot | fatal；实际复制、FD、链接/ADS未知 |
| C09 | C08→staged；读snapshot，建P/N/S和copies | fatal；物理独立/共享缓存未证 |
| C10 | P/N/S三条staged，8条target argv中的3条；副本+报告+缓存 | gate；argv已补，真实fork/预载未证；依赖失败继续冲突 |
| C11 | P通过；副本tsc --noEmit、copies核对 | gate；noEmit参数正确，真实零产物未知，runner/product环境未分清 |
| C12 | P通过；原配置、六静态文件/图标、vitest.json | gate；报告许可已补，dist保护优先级与安全fatal未闭合 |
| C13 | N通过；控制模板/副本，报告，dist零写 | gate；实际模板导入/初始化副作用未证 |
| C14 | S通过；映射文件及副本，仅批准文件写 | gate；map-list类型退化，越界应fatal不能普通继续 |
| C15 | C14/S成功；tsc --noEmit和结果 | gate；依赖失败无skip，零产物未证 |
| C16 | C14/S成功；原插件/六目标及报告 | gate；同C12保护/环境/审计问题 |
| C17 | M1及各终态→staged；读对照数据，写diff/result | fatal；缺失/被阻任务如何表达依赖状态须补 |
| C18 | BIND source一次取环境；bound才W(C18) staged归档 | BIND fatal，归档gate；动态路径读/元数据与不可变绑定交接缺项 |
| C19 | BIND、前before→staged；读OUT全树与链，写index/cutoff | fatal；前一close修正，运行时须排除活动自身，当前工具未交付 |
| C20 | REPORT staged读证据写报告；SEAL source末尾封存 | REPORT fatal/SEAL停止；staged绝对deny冲突，degraded与异常前驱仍未闭合 |

### 5.3 十种文字终态不等于十三类分支可执行

| 分支 | 本轮判断 |
|---|---|
| 1 C00失败 | 明确无RUN/无后继，外部记录；实际未验 |
| 2 PRE失败 | 明确不创建RUN；实际未验 |
| 3 C01部分失败 | bootstrap-failed、不写SEAL方向明确；记录者真实性未验 |
| 4 C02/OBS早期fatal | OPEN：staged未准备而SEAL无条件复核 |
| 5 PROBE失败 | OPEN/PARTIAL：非链探针失败时OBS可能仍等待，终止/关闭/串行seal交接未具体化 |
| 6 C06/M0无wrapper fatal | recorded abort方向较V5改进；异常前驱需与正常计划分开定义 |
| 7 wrapped target fatal | after接受终态已修；无终态close时不可虚构after成功 |
| 8 普通gate失败 | OPEN：五类依赖冲突，无skipped-dependency |
| 9 C07-B失败 | 目标尚未跑、before可能缺失，不能套用普通失败目标after；需专门规则 |
| 10 C07-A自身失败 | 应不重复after；执行标记、直接seal前置需明确 |
| 11 C18未绑定 | 正常跳过前驱已修；动态绑定检查权限仍缺 |
| 12 C19/REPORT失败 | 不补跑报告方向正确；缺输出/缺summary在终端模式中的处理未完整定义 |
| 13 SEAL失败/链损坏 | 停止、外部记录方向正确；不重写链；不能把失败状态伪装为已完整封存 |

正常predecessor与异常“recorded abort point”的替代关系需写成可检验规则。当前只给文字状态名和next字符串，没有覆盖所有前置/输出缺失组合。check:240—246未模拟这些分支。

## 6. B、Q、R独立评级

### 6.1 B1—B9

| 项 | 本轮 | 理由 |
|---|---|---|
| B1 发布包/首执行 | OPEN | self读错源、完整staged校验冲突；runtime缺失 |
| B2 C04隔离 | PARTIAL | source写/FINAL读方向正确；空根语义和真实路径行为待核 |
| B3 C10 Worker | OPEN | target argv已补；C06policy、产品预载/审计角色和失败安全分类缺口 |
| B4 六静态目标 | OPEN | 报告许可修正；dist保护与允许写优先级、产品审计合同不清 |
| B5 控制配置 | PARTIAL | 固定模板字节正确；实际导入及零dist写未验 |
| B6 身份/ACL | PARTIAL | 账户/期限有明确登记；SID批准、有效ACL、relay来源未证 |
| B7 R01准备 | PARTIAL | 20行矩阵仍无实现/动态结果 |
| B8 C07/分支 | OPEN | 普通双计划正确，gate后继与早期fatal收尾仍不闭合 |
| B9 审计生命周期 | OPEN | 角色权限、正例自洽、validator、异常封存均有缺陷 |

合计0 CLOSED / 4 PARTIAL / 5 OPEN。

### 6.2 Q01—Q07

| 项 | 本轮 | 真正修复的子项 | 仍OPEN的依据 |
|---|---|---|---|
| Q01 首次执行 | OPEN | source FINAL、C06首staged、祖先检查 | 16自读错源；32交集；运行器/外部锚缺失 |
| Q02 观察者 | OPEN | 唯一入口、300/900s、目录、READY | observer角色不许可；relay来源未知、失败时回收合同未齐 |
| Q03 链权限 | OPEN | control读字段、genesis109/103、分片op | 漏角色/中间父目录、C01业务链创建，实际不可篡改未证 |
| Q04 事件协议 | OPEN | ID/c18/LF/分片摘要 | 同输出异hash、错误入口/argv、负例及validator漏检 |
| Q05 读写白名单 | OPEN | TSV字段、报告、部分目录已补 | 新allow/deny、C06policy、环境/动态路径等 |
| Q06 报告封存 | OPEN | 前一close截止点、OUT读取 | SEAL反向deny；degraded需缺失staged；异常前驱/缺输出处理 |
| Q07 第二归档 | OPEN | BIND与58/55有效计划 | 动态路径元数据/读回缺许可、绑定env被覆盖 |

不能因某旧子项已修，就把整个Q升级CLOSED；也不因尚未运行而抹去已确认的静态改善。

### 6.3 R01—R25

已重新核对V5 Candidate的实际规格与V6引用，非仅复制“冻结”标签：
- R05：Candidate:456—459同时要求placeholderSeq相同才能合并，及同页面/源码/options/version的非force请求合并，冲突仍在；V6未修产品规格。
- R16：Candidate:364要求容器token精确等于目标，:619仍以render-commit-seq高水位通过，归属规则未统一。
- R01：Candidate:224—270提供统一finalize和20行矩阵；没有新实现或运行证据。现客户端仍为单Promise接口，不能认为双Promise修复已落地。取消retry/deferred边界仍需具体夹具。

| 项 | 状态 | 仍需证据 |
|---|---|---|
| R01 双Promise | PARTIAL | finalize/resultReady/completion全路径、20行矩阵实证 |
| R02 批量取消 | PARTIAL | cancelAll/pump/释放 |
| R03 熔断 | PARTIAL | 崩溃/健康回复/恢复 |
| R04 旧事件 | PARTIAL | 旧worker/epoch/异步回调 |
| R05 源码身份/去重 | OPEN | 无损身份/缓存键与placeholderSeq冲突修订 |
| R06 缓存 | PARTIAL | 失败缓存、淘汰、等待者 |
| R07 deferred | PARTIAL | 256条/64MiB边界、取消守恒 |
| R08 调度 | PARTIAL | 小脚本优先和公平性 |
| R09 D4超时 | PARTIAL | 固定公式/一次重试/性能阈值实测 |
| R10 请求映射 | PARTIAL | 请求/尝试/提交对应 |
| R11 刷新 | PARTIAL | 去重/同ID新源码/重复提交 |
| R12 后台迟到消息 | PARTIAL | 页面身份/纪元守卫 |
| R13 统计 | PARTIAL | 状态守恒与计数 |
| R14 Worker构建 | PARTIAL | 浏览器Module Worker，非Node fork |
| R15 构建身份 | PARTIAL | 产品版本/源码/产物哈希 |
| R16 DOM归属 | OPEN | token与高水位判据统一、真实DOM证据 |
| R17 Panel/Harness | PARTIAL | 实际Panel实例内容/提交/渲染 |
| R18 deadline分类 | PARTIAL | 饿死/超时/分析/提交/渲染 |
| R19 完整一致性 | PARTIAL | 全量序列化/失败语义/四方结果 |
| R20 closeBundle | PARTIAL | 原插件与控制对照实际运行 |
| R21 persistRun | PARTIAL | 历史证据隔离与D11决策 |
| R22 物理隔离 | PARTIAL | 文件ID/依赖/缓存/链接/FD |
| R23 提升树 | PARTIAL | 逆映射、实际候选树字节 |
| R24 原项目未变 | PARTIAL | M0/M1、ADS/USN、末尾覆盖 |
| R25 权限/W2 | PARTIAL | 有效只读与独立执行授权 |

合计0 CLOSED / 23 PARTIAL / 2 OPEN；R指标不被启动包自检替代。已批准D3/D4/D10/D12/D14/D15与安全门槛不变。

## 7. 新发现与必须整改

| 编号 | 等级 | CONFIRMED依据/问题 | 必须修复目标 |
|---|---|---|---|
| V6-N01 | P0 | build:67/:163及check:151漏反向集合交集，FINAL/SEAL共32项 | 允许子树与deny文件双向相交检测；全量验证合法可读 |
| V6-N02 | P1 | build:89，16个staged入口self读指向source | 用真实entry_path，登记校验与加载边界 |
| V6-N03 | P1 | spec:246无guard标志，R[C06].guard=null | 明确C06有效policy及摘要，安全门前先核绑定 |
| V6-N04 | P1 | build:113/:121缺observer/product；C01业务链许可；审计父目录漏登记 | 精确主体/角色/目录许可，禁止跨层继承 |
| V6-N05 | P1 | build:141、spec:404，dist保护与tmp/预载合同歧义 | 定义保护范围/优先级，分开父子环境、审计与预载权限 |
| V6-N06 | P1 | audit:156/:200同输出异hash；:187入口错；check负例/validator不足 | 真实自洽正例，完整规则和单故障负例 |
| V6-N07 | P1；安全路径具有P0影响 | spec命令默认gate与M:125安全fatal冲突 | 按具体失败原因确定fatal优先，不在guard失效后继续 |
| V6-N08 | P1 | gate继续与五类成功依赖冲突 | 显式skipped-dependency或停止，结算/证据/after责任完整 |
| V6-N09 | P1 | SEAL degraded仍无条件校验完整staged | 独立早期失败收尾模式；异常前驱/缺summary/OBS回收明确 |
| V6-N10 | P1 | spec:373/:404、BIND输入空、目标读回无许可 | 一次性不可变绑定交接、动态metadata/读回精确许可 |
| V6-N11 | P2 | C04空根/target exists歧义；ML被编码subtree；变更记录LF过期 | 统一对象含义和类型，文字只跟正确数据走 |
| V6-N12 | P2 | build先写后验、非原子5文件发布；check存在伪证据 | 整体检查后发布、失败保留原版本；修测试语义而非调数字 |

V6-N01是新的实际契约阻断，不属于“尚未提供动态证据”。V6-N07需避免安全失败被命令级gate吞掉。各修复应落在原始spec/build/audit/check及主文，再重新生成一致JSON/TSV/附录、更新交付摘要和追溯；本轮不实施、不自动生成V7。

## 8. 残余风险与验证时点

| 风险 | 已知边界 | 后续需要 |
|---|---|---|
| FileShare.Read/TOCTOU | C00句柄在哈希后关闭；dispatcher只要求保持至child创建，非所有模块加载完成 | 真实加载源码/文件身份/生命周期；不能自检替代外部信任 |
| 精确16文件deny | 当前集合固定；不含新增/改名工具不能自动沿用旧规则 | manifest/工具版本变动与政策同步，并默认拒绝未登记读取 |
| C07全树扫描 | 32次M0/M1/before/after读树成本可从计划确认，耗时未知 | 授权后测量成本、超时和日志容量；不删减证据门槛 |
| SEAL无C07包裹 | 明确不能由前后扫描覆盖自身末尾行为 | 真实只读来源/允许唯一写、外部摘要锚定；不声称已证零接触 |
| 原生/FD/链接 | NODE_OPTIONS不覆盖任意原生进程；别名和既开句柄可绕开天真路径判断 | 运行器源码、句柄真实目标、复制源/目标双判、授权后边界验证 |
| 多进程分片 | 规范不是锁/flush实现 | 角色、PID、CreateNew/append、重复和乱序检测 |
| 崩溃/部分写 | 正确记录失败不等于可完整seal；unpaired可能为0 | 错误时保留实际尾部，外部失败记录，不伪造完整段 |
| 日志篡改 | 同Administrator身份不能靠脚本名形成OS隔离 | 可信控制通路、外部hash锚与实际ACL边界 |
| 失败残留 | 既有要求保留现场 | 每类错误明确责任者，禁止原地重试/覆盖；新实验另编号 |

这些没有被写成已发生攻击。需要运行才能验证的项继续UNVERIFIED，不能为本次只读审查提前执行。

## 9. 外部启动条件与准入

### 9.1 当前外部输入

| 项 | 本轮状态 |
|---|---|
| D:\P47TOOLS\p47-phase0-v6的20payload | 目录不存在，未交付 |
| RELEASE-MANIFEST批准SHA-256 | 未提供，不代填 |
| dispatcher/verifier/audit/guard/业务运行源码 | 未交付；九个p0v6工具不替代 |
| 管理员SID/账户正式确认 | 文档记录本机值，不等于用户启动批准 |
| P0_CODEX_ACCOUNT | 未指定，不在两个候选中自行选择 |
| SECOND_ARCHIVE | 未绑定；属于出口输入，正常跳过仍不能complete |
| H1—H5/运行时/inline外部绑定 | 无本轮新增批准 |
| 动态ACL/真实fork/FD/审计封存 | 未运行，授权后验证 |
| 正式“开始有限Phase0”授权 | 当前请求仅审查，不构成执行授权 |

V6 M第12节引用V5的A1—A7/B1—B15/C1—C8并增加A8/B16/B17/C9。本轮按相同实质逐项审查，不将版本引用当自动批准。D15既有静默约定保持；不重复索要已经批准的D值。父目录ACL只读核验/修改责任仍需在启动包明确，不能边运行边扩大权限。

### 9.2 六项既有启动原则

| 原则 | 判断 |
|---|---|
| E1检测器先于权威M0 | 顺序设计保持；C06 policy与早期收尾阻断 |
| E2三副本物理隔离 | 设计PARTIAL，实际文件身份和环境未证 |
| E3精确写白名单 | OPEN：角色/中间目录/产品合同缺项 |
| E4守卫覆盖/禁止区读 | OPEN：新32交集、C06及预载绑定缺口 |
| E5基线/第二归档/证据 | OPEN：绑定交接与终端模式未闭合 |
| E6原项目只读 | 约束保持；实际ACL/前后证据UNVERIFIED |

静态修订和运行工具源码必须先审清；有效ACL、真实fork、FD/原生、并发/崩溃等动态结果可在获得有限Phase0授权后产生。不能要求先偷跑，也不能因将来可测而忽略当前静态矛盾。

## 10. 建议和执行声明

建议OpenCode先完成第7节的有限整改，提供真正运行payload及可独立验证的来源/manifest，再进行下一次静态复核。修复应提高合同与证据正确性，不能通过改掉失败预期、放宽deny、降低安全门槛或仅增加检查数量来获得通过。

本轮真正通过的是交付身份/部分结构和具体旧子问题；整体启动合同未通过。生成器的真实写入路径已审阅但未执行；审计/guard运行实现缺失已明确记录，没有用Markdown替代源码结论。

本轮未执行C00—C20、任何交付脚本、Vitest、tsc、Vite build、浏览器、Worker实验或L1；未创建D:\P47RUN/D:\P47TOOLS；未修改产品、配置、dist、ACL、V4/V5/V6或历史证据。唯一新增文件为本报告。

**审查到此结束：C. REJECTED。保存并独立测量报告后停止，等待用户决定。**

