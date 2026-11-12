# OB-Recover Phase 4.7：V4 第四轮独立审查报告

审查日期：2026-11-11。审查对象是方案及准入条件，不是代码验收。

## 1. 输入核验和方法

以下四个文件均完整阅读；阅读前先计算 SHA-256，全部 MATCH，报告保存前再次核验仍 MATCH。第三轮报告的预期哈希取自本会话此前发布记录。

| 输入文件 | 字节数 | 行数 | SHA-256 |
|---|---:|---:|---|
| PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md | 59954 | 1002 | a5d2d9b2fa124ea89987cf1c3f4583ea6afab1ab364155fa4a33e8e0f00355b3 |
| PHASE4.7-V4-CODEX-FINDINGS-TRACEABILITY.md | 9945 | 108 | 258a8d3fcc795ad3e3aa466347169a77d337658fe5dd725b4457dcd43467b6f8 |
| PHASE4.7-V4-SELFCHECK.md | 5588 | 61 | a162b0a34399eef072562fc6e8ae1f0c4358f7fd5dcf5b6ec5cd089dc5128df8 |
| CODEX-P47-V3-THIRD-INDEPENDENT-REVIEW.md | 31184 | 359 | ab92008fa4ef8a4af6516344348eeb0b6e0980ef3cef51e4f5e7fd0df326bbdd |

目录：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan。

主要依据为 V4 正文；追溯表仅为索引，自检不作为独立正确性证据。另只读核对项目安全指标定义。未修改任何输入、项目文件、ACL、历史证据或构建产物；未运行测试、tsc、构建、浏览器、L1或Phase0；仅新增本报告。

行号均指该哈希的 V4，除非明确标为项目源码或历史报告。

标签：
- CONFIRMED：直接文本/代码事实或按条款可构造的冲突；不声称已经发生运行故障。
- INFERENCE：由未规定条件推导的风险，需要实现或实验确认。
- UNVERIFIED：没有动态验证证据。
- CLOSED：本轮要求下，问题已经有充分解决证据。
- PARTIAL：设计有解决或改进，但仍缺规格、批准或动态验证。
- OPEN：仍有实质设计缺口，不能按现文实施。

特别采用用户本轮要求：**设计已修但尚未动态验证的条目仍列 PARTIAL**，不沿用此前仅按设计闭合即可 CLOSED 的统计口径。

## 2. 总体结论

**B. APPROVED WITH CONDITIONS。**

V4可以在补齐第7节两项有限的Phase0执行澄清后，申请启动仅限基线、隔离初始化、工具自测及副本对照的Phase0。不是无条件批准，不是本轮执行授权，也不是批准按现稿实施后续全部整改。

本次重评级：**0 CLOSED、23 PARTIAL、2 OPEN**。OPEN 为 **R01、R05**。大量PARTIAL同时包含“设计方向正确、动态结果UNVERIFIED”的情形，不表示这些条目全部仍有设计错误。

V4有三项实际进步：
1. resultReady与completion区分，解决了V3同一Promise承担交付和最终提交的根本矛盾。
2. 构造成功不再清零熔断计数，连续运行崩溃可以累计到阈值。
3. DOM增加来源/请求/提交字段，比内容签名推测来源可靠。

但不能接受其“0 OPEN”的自检结论：
- deferred和retry-pending取消仍未明确结算未交付的resultReady；熔断、构造失败、拒绝等早期终态同样缺统一双Promise结算规则。
- V3的无损源码身份和完整缓存/active键规范没有保留到V4；只保留force和测试名称不足以承接旧修订。
- DOM高水位仍需定义目标提交和渲染快照关系，尤其零候选与旧纪元。
- deadline优先级仍漏两类结果。
- 冻结baseline与后续将构建旁清单写入baseline相冲突。

后续规格缺口必须在相应阶段前修订；不要求在Phase0前先实现Worker或跑性能实验。

## 3. R01—R25 逐项独立重评级

下表将“设计结论”和“动态结果”分开。责任阶段不是自动授权。

| 编号 | 第三轮问题／V4实际处理 | 本轮状态 | 证据及剩余问题 | 验证与责任阶段 |
|---|---|---|---|---|
| R01 | 交付与最终结算混用；V4新增双Promise | OPEN | 204—217分工正确；390—391只结束completion，未结束deferred/retry-pending的resultReady；266—272也未定义早期终态的两Promise处理 | Phase1：全部终态双Promise矩阵，先补规格；动态UNVERIFIED |
| R02 | 取消中pump、部分任务漏结算 | PARTIAL | 387—395先关调度及逐类取消正确；受R01缺口影响，仍可能清空等待者却留下resultReady | Phase1：并发取消/完成/重试；动态UNVERIFIED |
| R03 | 构造成功清零使熔断不可达 | PARTIAL | 249—288已改健康回复才清零，阈值可达；恢复探针正常/异常/超时仍需完整试验 | Phase1：真实运行中崩溃及恢复；动态UNVERIFIED |
| R04 | 旧事件污染新Worker | PARTIAL | 401—409列代次核验；但哈希和deferred准备尚无attempt/Worker，不能无差别绑定执行代次，否则正常排队任务可能被误废 | Phase1：按作用域绑定并测迟到回调；动态UNVERIFIED |
| R05 | 源码身份、active合并、force | OPEN | 371—375解决force混并；全文未重述UTF-16LE身份、原始字符串全等、完整cacheKey、非force同步占位。旧文仅保留，不是规范继承 | Phase1：恢复明确规格并覆盖孤立代理项；动态UNVERIFIED |
| R06 | 缓存上界/超限行为 | PARTIAL | 415—423保留128/32MiB、UTF-8结果字节、超限/淘汰不足跳过、异常不拖累分析；身份缺口另记R05 | Phase1：边界与LRU测试；动态UNVERIFIED |
| R07 | deferred容量与显式拒绝 | PARTIAL | 65—68保留256条/64MiB/64KiB；显式拒绝/取消正确；还需精确定义budget释放及未派发准备占位计量 | Phase1边界测试；动态UNVERIFIED |
| R08 | 调度/展示顺序及饥饿 | PARTIAL | 67明确分离和不增加aging，符合批准政策；严格小任务优先仍可饿死大任务，未宣称解决 | Phase1/4记录等待；动态UNVERIFIED |
| R09 | 超时规则与50%分子 | PARTIAL | 72—76、507—518固定公式、测前登记、累计所有尝试正确；未做性能验证 | Phase1规则测试/Phase4实测；不重新批准阈值 |
| R10 | 尝试与最终结果责任 | PARTIAL | created→dispatched/post-failed已补，364发送失败不伪造派发；仍依赖R01统一两Promise终态，非派发故障的时间统计需明确 | Phase1逐格测试；动态UNVERIFIED |
| R11 | 刷新/URL/旧结果 | PARTIAL | 427—432单飞、快照、最新请求、URL/source/epoch原则保留；精确源码身份受R05回退影响 | Phase2竞态与目标等价；动态UNVERIFIED |
| R12 | 后台迟到事件/SW会话重置 | PARTIAL | 436—439对象身份、collectorEpoch、sessionNonce与确定性测试具备；真实会话行为未验证 | Phase2/6；动态UNVERIFIED |
| R13 | 当前状态与历史计数 | PARTIAL | 449—480十一态与历史分开正确；236将逻辑completion与脚本currentState绑定，与379—380旧请求不得覆盖最新请求矛盾 | Phase1/2：修作用域并测force；动态UNVERIFIED |
| R14 | Vite配置和格式不一致 | PARTIAL | 801—803要求顶层worker和A/B独立验证；未把历史IIFE+module当B通过；D1待决定 | Phase3，动态UNVERIFIED |
| R15 | 构建输入/实际产物证明 | PARTIAL | 602—629全产物hash、集合、负例、依赖和公布锚改善；613写入冻结baseline冲突，输入闭包细节需恢复 | Phase3；动态UNVERIFIED |
| R16 | 渲染完成可假通过 | PARTIAL | 304—308有来源属性；318/499未完整约束卡片commitSeq，零候选目标无卡片来源，旧纪元字段/不复用规则不明 | Phase4规格补齐及七反例；动态UNVERIFIED |
| R17 | 钩子范围与真实panel证明 | PARTIAL | 80—84、639—655保留九字段，明确harness非直采；DOM属性是新增产品观测面，需对应阶段批准 | Phase2/4/5；真实panel全文UNVERIFIED |
| R18 | deadline不穷尽/优先级 | PARTIAL | 524—541覆盖更多状态，但528的window-deadline-during-execution未列优先级，render-unverified也漏；当前/历史watchdog错误需分开 | Phase4纯函数+真机；动态UNVERIFIED |
| R19 | 全文结果与提交数组混用 | PARTIAL | 661—667分schema正确；提交集合“位置/值/组键”与Discovery候选实际类型需核对；schemaHash包络规则未定 | Phase5；动态UNVERIFIED |
| R20 | closeBundle/副本对照 | PARTIAL | 122—145隔离对照与允许实验dist写入合理；频次与自测未运行，不能因文档存在就CLOSED | Phase0；动态UNVERIFIED |
| R21 | persistRun与历史证据覆盖 | PARTIAL | 699—701默认只校验或拒写替代、预检方向正确；D11未批准；拒写实验边界和中断行为须实测 | Phase0/3；动态UNVERIFIED |
| R22 | ROOT/profile/cache/原生进程 | PARTIAL | 160—168、705—708明确不启动Chrome和原生不覆盖；禁止区读取成功“有日志即不失败”的漏洞须改 | Phase0；动态UNVERIFIED |
| R23 | 逆映射与最终产物 | PARTIAL | 724—753定向映射、最终权威bundle不同则重验已处理前版主要缺口；映射编辑冲突、真机实际加载仍未验证 | Phase6/P，动态UNVERIFIED |
| R24 | ADS/未知变化归因 | PARTIAL | 693—716保持内容hash/范围缩小/不归因；实际ADS与检测器未验证 | Phase0/6；动态UNVERIFIED |
| R25 | ACL/W2执行冲突 | PARTIAL | 765—773分实施方、只读W2-A、授权W2-B，不扩权；实际ACL、独立执行者和第二归档尚待落实 | Phase0/P；动态UNVERIFIED |

CLOSED为0来自本轮“设计解决但没有动态验证仍保持PARTIAL”的要求，不意味着所有设计重新变坏。R01/R05是规格缺口，不能仅改标PARTIAL后直接实施。

## 4. R01双Promise与状态机推演

### 4.1 已解决的部分

CONFIRMED：resultReady负责可提交结果，completion负责最终提交/拒绝/失败（204—208）。缓存命中不建attempt，不启看门狗（210、226—227）。awaiting-commit有单独10秒ack期限（216），避免依赖“面板一定会提交”。

正常路径可写成：
admit → executing → 有效reply → settleAttempt → awaiting-commit/resultReady → commit或reject → completion。

这个结构解决了V3以同一个Promise既等提交又交付提交输入的矛盾。

### 4.2 仍缺统一的所有终态规则

CONFIRMED：389明确executing取消时两者结算；390—391只列completion：
- B处于deferred，从未拿到Worker结果。
- cancelAll把B设cancelled，结算completion，随后393清等待者。
- B.resultReady仍无结果；面板await该Promise可以永远等待。

retry-pending同样成立，因为第一次失败不应交付最终resultReady，否则一次重试失去意义。

266—272的breaker早期终态、构造失败、未受理拒绝、第二次尝试失败也没有“尚未交付的resultReady必须同时结束”的统一规定。235只保证“最多一次”，不能证明“最终至少一次”。“不得永久pending”的目标不能代替具体规则。

**必须修正：**统一finalizeRequest：
- 如果resultReady尚未settled，成功则交付结果，失败/拒绝/取消/熔断则交付对应错误；
- 再结束completion；
- 若resultReady已经交付则不改写，只结束completion；
- 清该请求的ack计时器、等待者和索引；
- 批量取消时不pump，旧事件不触发该方法的新副作用。
在终态矩阵中逐格标出两个Promise是否已结算，不只列逻辑状态。

### 4.3 currentState作用域与force

CONFIRMED：236要求“completion结算时currentState必为终态”，379—380又只许最新请求改变脚本currentState。

反例：旧P正在executing，新force F成为最新并deferred；P结束自己的completion时，脚本currentState必须继续为F的deferred，不能成为终态。否则违反旧请求不得覆盖。

应改为“该逻辑请求自身state为终态；它若仍为latest才同步脚本currentState”。逻辑请求记录和每脚本当前记录不能混用。

### 4.4 六类收尾及缓存检查

| 路径 | 当前方案 | 必须验证/补齐 |
|---|---|---|
| 提交成功 | completion→committed明确 | resultReady只交付一次、ack计时器清理 |
| 提交拒绝 | rejectCommit→commit-rejected明确 | 异常catch和迟到ack不能重复结算 |
| 提交超时 | 10秒ack失败明确 | 起点应为resultReady交付；超时与提交同轮仅一个胜者；不是D4看门狗 |
| 取消/纪元变化 | 先停调度及分状态清理 | deferred/retry-pending早期resultReady必须结束 |
| dispose | 要求disposed时保持关闭 | 明确先置disposed再取消；已终态不重写；清全部定时器 |
| 缓存命中 | 成功待commit，解析失败双结算 | 命中仍用新逻辑请求/最新请求号，不能复用旧requestId或旧ack |

所有运行验证均UNVERIFIED。不能因为表格存在就声称内存泄漏、悬挂、重复结算已排除。

## 5. R03熔断独立推演

CONFIRMED：259—261只由有效健康回复清零，构造成功不清零，V3的熔断不可达缺陷已修正。

连续崩溃示例：
1. P首次创建成功，崩溃：计数1，P可重试。
2. P重试创建成功，再崩溃：计数2，P最终失败。
3. Q创建成功，首次崩溃：计数3，breaker打开，Q即使有重试额度也失败；deferred及retry-pending随之结算。
4. awaiting-commit不依赖Worker，271允许其继续提交或按ack超时结束，此选择合理。
5. refresh/新纪元开启recovering，保留失败计数；成功健康回复才退出恢复，运行故障立即重新熔断。

没有以构造成功冒充执行健康，也没有无限的单请求重试。

仍须补齐：
- 早期failed如何结束resultReady，见R01。
- 健康回复里的ok:false必须限定为经信封校验的确定性解析失败；当前Worker契约中ok:false也可能代表内部异常，不能只看布尔值就清计数/缓存。
- 恢复探针若发生看门狗超时，按D4重试但不加Worker失败计数；两次超时后recovering如何释放、下个请求是否继续作为探针，应写明。
- 所有源请求和新代次的归属不可因恢复标志改变。

以上不重新开启已批准D4，也不把取消计入失败。实际故障注入仍留Phase1。

## 6. R05无损身份的回退

CONFIRMED：V4全文只保留force隔离及“孤立代理项”测试名称，没有V3明确的：
- UTF-16LE无损源码身份；
- 命中缓存时原始字符串全等；
- pageEpoch、scriptId、原样URL、源码、版本、选项组成完整键；
- 非force同步占位与异步定型合并的源字符串检查。

保留旧文件（23）不等于规定V3某节继续生效。按V4独立执行时，实现者无法从正文知道应使用哪种身份；sourceSha256在192仍未确定是UTF-8还是无损编码。

这是实质回退，不能用815的测试标题替代算法规格。

**必须恢复成明确条款或精确规范性引用。** D3/D4仍按UTF-8字节计算；源码精确身份单独使用无损码元表示和原串全等，不改变受保护hash-utils.ts。force彼此不合并及最新requestSeq写缓存规则可保留。

同理，非执行回调不能一律要求已有attemptId/workerGeneration（401—409）：请求准备和deferred哈希绑定page/scheduler/request，Worker事件再绑定attempt/worker。否则另一个请求重建Worker就可能误废正常队列任务。

## 7. R16五个DOM属性及七反例审查

### 7.1 改进成立

CONFIRMED：304—308的scriptId/requestSeq/commitSeq、render-tick/render-commit-seq，已经比V3纯内容签名强。普通旧request卡和其他script卡可以过滤，同内容清空重建也可以通过节点身份与tick证明有一次新呈现。没有再次把内容相同误当作同一次请求。

但属性本身仍是产品声明，必须验证写入时机和目标覆盖关系，不能仅因属性存在就判对。

### 7.2 未闭合的三项

1. **纪元不复用。** 332/500要求旧纪元卡不得计入；属性没有epoch，正文也未规定requestSeq/commitSeq跨文档或session永不复用。应使用可证明不复用的请求身份，或以已验证的页面会话与容器重建作为边界，测试旧DOM保留时不会匹配新请求。
2. **逐卡提交号。** 318只写scriptId+requestSeq卡片数，第498写三元组。统一为每张计入卡必须同一目标commitSeq。全局render-commit-seq高水位不能代替这一检查。
3. **零候选。** 没有目标卡片可携带commitSeq，D10也不返回它。仅容器高水位≥目标且tick增加，不能解释目标commitSeq从何独立取得、该目标确实包含在渲染快照中。需明确定义提交到渲染快照的关联，不能拿待检容器的值自证。

INFERENCE反例：零候选目标T提交之后未清掉T旧请求的卡，另一个U的渲染使全局tick增加、高水位超过T。按新request过滤T为0，条件可能满足。若实现按目标三元组清除旧卡并证明快照覆盖T，可消除此反例；正文需把这个条件写成必检规则，不能假设。

### 7.3 七类反例是否充分

| 反例 | 当前规则能覆盖的部分 | 还需要的断言 |
|---|---|---|
| 旧卡片 | requestSeq可拒旧 | 同script跨epoch复用仍拒旧；旧卡清理 |
| 同签名卡片 | scriptId可区分 | 每张卡校验完整三元组 |
| 同内容刷新 | tick和新request证明重渲染 | tick只在该快照完整呈现后发布，不是开始渲染时 |
| 零候选 | 要求0卡且tick/seq | 独立获得目标commit、证明快照含目标及旧目标卡已清 |
| 部分渲染 | 数量不足可识别 | 未完成期间不提前发布完成高水位；中断不发布成功 |
| 超时 | deadline检查 | 无tick在运行中是pending，截止才唯一归为timeout；320/321现在重叠 |
| 旧纪元 | 有拒旧要求 | 实际身份字段/全局唯一序号与会话边界需明确 |

只在?obTest=1加入DOM属性不改变D10返回字段，但属于新增产品观测代码；应在Phase2/4实施范围中明确获得接受，不因“不是D10”自动扩张产品接口。

真实panel全文仍应UNVERIFIED；此DOM方案只验证呈现身份和数量，不证明每个候选字段内容都一致。

## 8. R18、R19及验收证明

### 8.1 deadline遗漏仍在（CONFIRMED）

- 528产生window-deadline-during-execution，545—560优先级没有它。
- 322/501定义render-unverified，deadline表与优先级没有它。
- 527的executing + watchdog-*必须只看当前尝试。首次超时后第二次正常执行不能因旧错误码直接判重试耗尽。
- 320“提交后tick未递增”判failed与321“截止未达到完成”判timeout重叠；要区分等待状态和截止终态。
- 494窗口在目标渲染后结束，562又要求全体任务渲染。应分别定义目标观察终点与整次运行终点，不能在目标完成时提前终止全任务验证。

partial只给局部结论、Phase6要求completed的方向正确，保留。

### 8.2 两套schema方向正确，细节仍不足

661完整DiscoveryResult与662提交集合分开，解决了V3将候选数组冒充完整结果的问题。但“提交集合含位置/值/组键”容易混入替换阶段概念；应引用真实Discovery候选类型，逐字段定义编码schema。

schemaHash必须计算schema定义，不把hash字段自身纳入递归；schemaId/hash放传输包络，不能修改原始结果后称为原函数完整输出。完整保序/排序hash各自比较，子进程仍只能标覆盖降级。

### 8.3 构建与提升

602—623定义戳、可信旁清单、实际全文件hash和负例，已处理大部分旧问题。751—753规定最终bundle不同就重验，补上最终产物冒用中间结果的风险。

但613要求将Phase3每份旁清单存入baseline，和143/172/765的baseline写后只读冲突。改存按构建编号不可覆盖的证据目录并即时公布hash，或另设只追加的信任锚目录，不能改冻结基线来制造自洽。

所有构建、负例、最终映射和实际加载均UNVERIFIED，本轮没有执行。

## 9. N01—N09复核

| 编号 | 结论 | 依据 |
|---|---|---|
| N01 | OPEN | 双Promise分工修正，但取消/熔断早期结果Promise未明确结算；§5.2/§8.6 |
| N02 | PARTIAL | 当前与历史分离保留；236的currentState作用域与force冲突；动态未测 |
| N03 | PARTIAL | 累计耗时正确，DOM来源改善；零候选/纪元/高水位和deadline仍需澄清 |
| N04 | OPEN | V4未保留V3无损身份及完整键规范，只有测试名与force条款 |
| N05 | PARTIAL | 数学及三处源码定义正确；实测未运行，不写指标通过 |
| N06 | PARTIAL | 共享代码不冒充panel直采，两schema改善；实际实例内容仍UNVERIFIED |
| N07 | PARTIAL | 实际hash和负例完整；冻结baseline存放冲突、实际构建未测 |
| N08 | PARTIAL | 最终权威bundle不同重验已明确；映射和最终产物仍未验证 |
| N09 | PARTIAL | 阶段入口与出口循环基本解决；工具自测应先于依赖它的权威M0 |

## 10. E1—E6及Phase0准入

| 项 | 已处理 | 仍需事项 | 准入影响 |
|---|---|---|---|
| E1 初始化顺序 | 根/ACL创建在Phase0内部；M0先于产品测试；出口无条件停 | 122“任何测试前M0”与123才自测检测器冲突。先在假树验证检测器，再形成权威M0；产品实验仍在其后 | 有限书面澄清，不能要求先运行Phase0 |
| E2 三副本隔离 | 同源快照、独立物理目录、独立依赖/缓存/临时目录明确 | 实际派生清单、链接/硬链接检查留Phase0 | 不因尚未展开副本阻塞 |
| E3 写白名单 | 插件写自身实验dist明确为预期；禁止区与新证据分开；归因不等于通过 | 探针例外、每命令实际可写路径在执行清单中列明 | 原有主要条件已满足 |
| E4 守卫 | 含读写/FD/复制/链接/原生，Phase0不启动Chrome，原生限制诚实 | 160失败条件必须是“禁止读成功即失败”，不是“成功且无日志”。163反向复制源要明确拒绝读取禁止源 | 有限书面澄清，实测留Phase0 |
| E5 归档 | baseline只读、用户指定第二位置、未指定不关闭 | 用户给第二位置；不得将后续旁清单写入冻结baseline | 地点落实可在归档前，不要求先创建 |
| E6 原项目只读 | 原地执行、改ACL、失败提权/绕过均禁止；未知变化停 | 实际权限/路径守卫与首尾清单留Phase0 | 不以已批准外部ACL尚未设置为阻断 |

**本轮可以接受的有限启动前条件：**
1. 把“工具在假目录自测”和“产品测试”明确区分。先验证检查器，再取权威M0/快照并派生核对，最后做原样/无插件/中和产品实验。若先取临时M0，需在检查器通过后重取权威基线。
2. 禁止区读取成功即失败，即使写了日志；明确允许原项目读取的仅清单/归档工具，隔离产品测试不得回读原项目。复制源的判定同样适用。
3. 执行清单绑定V4哈希、管理员身份、正式根及白名单；第二归档由用户指定；所有自测失败停止，不通过权限扩张/换位置/关守卫绕过。

这不要求提前修复R01、跑A/B或验证DOM。后续实质问题必须在对应阶段规格评审前修订，不能由实现者默默选一种解释。

### 不能承诺“原项目绝无被写可能”

V4诚实说明Node fs包装不覆盖原生进程，实施者仍有原项目写权限；启动器和事后核验不构成OS层不可写保证。可以承诺范围约束、路径审查、自测和差异停止，不能承诺任意代码/原生工具都绝不可能越界。本轮不建议擅自修改原项目ACL或扩权；实际边界只能按现有批准范围验证。

## 11. 已批准与待批准决策

| 决策 | 审查意见 |
|---|---|
| D3 | 256/64MiB/64KiB、严格小脚本优先、显式拒绝/取消保持；实际调度测试UNVERIFIED，不添加aging |
| D4 | 固定UTF-8公式、最多一次重试、累计尝试50%保持；不准按实测提高阈值 |
| D10 | 九字段返回保持；新增DOM属性不是内容导出，但其产品改动仍须在相应阶段范围里明确接受 |
| D12 | 副本到一次提升保持，最终bundle不同重验改善；不得中途提升 |
| D14 | D:\P47RUN、Admin/SYSTEM写、沙箱只读和读回保持；只读能力留Phase0验证 |
| D15 | 静默与不归因保持；W2-B不得默认为静默例外 |
| D1/D2 | 仍待批准；A/B、戳位置不得自动选 |
| D5/D7 | 仍待批准；不能借内部状态修复自动做全部UI/捕获策略变更 |
| D8/D9 | 仍待批准；未批不声称性能/L1闸门验收通过 |
| D11/D13/D16 | 仍待批准；拒写、无Git备选和未改旧脚本的边界如实记录 |

本报告没有替用户批准任何一项。COMMIT_ACK_TIMEOUT_MS属于新的技术超时参数，在Phase1规格评审确认；它不修改已批D4，但仍需验证慢面板下行为。

## 12. 阶段依赖、回滚与证据

整体0→3→1→2→4→5→6→P可保留，阶段出口停审明确。

- Phase0：只初始化/基线/隔离/工具自测，不做产品整改、不构建、不启动浏览器。按第10节修正文义即可申请。
- Phase3：先修复制插件、再构建A/B；旁清单不能改冻结baseline；测完整文件集合和实际hash；实际证据UNVERIFIED。
- Phase1：必须先关闭R01/R05规格缺口，明确所有早期终态的双Promise；不得因“自检0 OPEN”直接实现。
- Phase2：完成coordinator、纪元、URL、当前状态；旧请求自身终态与最新脚本状态分离；与Phase1联合回滚到Phase3兼容快照。
- Phase4：DOM目标与渲染快照的关系、deadline类别补齐后再正式测量；七个反例要实跑；不得以属性自述替代整条证明。
- Phase5：两种schema各自完整比较、同输入同参数、序列化不删字段；真实panel直采缺口保留UNVERIFIED。
- Phase6：最终树逆映射、权威bundle重建；若bundle不同必须重验；n/a不自动通过。
- P：另行逐项批准，精确提升与回滚，保留所有失败证据，不在原项目跑测试/构建。

没有要求先实施后续阶段来换取Phase0批准；也不能把只允许Phase0的批准解释成全流程实施授权。

## 13. 风险级别与停止点

### P0：后续实施前必须修订

- R01：deferred/retry-pending/早期失败的resultReady可能悬挂。
- R05：完整无损身份规则回退，无法独立保证不误合并/误缓存。
- R16：旧纪元/零候选/全局高水位的归属未完全规定；目前PARTIAL，不能签发渲染通过。

### P1：验收与一致性

- currentState的终态作用域不正确，影响force并发统计。
- 回调绑定范围将未派发任务与Worker代次混用。
- deadline优先级遗漏；render-failed/time-out时点重叠。
- 构建旁清单写冻结baseline的冲突。
- schema字段混入替换概念；需要真实类型定义和封装规则。
- 守卫禁止读成功但有日志的情况未判失败。

### P2：已知且可接受的限制

- 实际性能、ACL、复制频次、OS子进程行为均UNVERIFIED。
- 严格小任务优先可导致大任务饥饿，不擅自改政策。
- 共享代码不等于真实panel实例全文已直采。
- 历史备份可信性与未知事件归因不能凭现有自检填补。
- breakWorker不可达截断只作清理，不重新列有效风险。

## 14. 最终结论与下一步

**APPROVED WITH CONDITIONS，仅限申请有限范围的Phase0。**

Phase0前只需补第10节明确、有限的书面执行条件，由用户决定是否批准；ACL和隔离实验仍在Phase0里完成。本轮不启动任何阶段。

对全局V4，不能接受“11 CLOSED、14 PARTIAL、0 OPEN”。按用户本轮更严格的状态要求，动态未验证的设计改进保持PARTIAL；R01/R05因明确规格缺口保持OPEN，其他事项按责任阶段关闭。

建议下一份文档修改集中在：
1. 所有终态的双Promise统一结算。
2. 恢复无损源码身份/完整cache-active键。
3. latest脚本状态与旧逻辑请求状态分离。
4. 目标DOM快照、零候选、纪元与deadline明确对应。
5. 冻结baseline与新构建信任锚分开。
6. Phase0自测顺序与禁止读判据修正。

不得因为本轮允许“提出Phase0申请”自动实施以上修改、启动Phase0或批准尚未决定的D项。

审查完成，停止并等待用户决定。
