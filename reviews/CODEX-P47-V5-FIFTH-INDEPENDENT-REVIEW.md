# OB-Recover Phase 4.7：V5 第五轮独立审查

审查日期：2026-11-11。审查对象为方案，不是实现验收。

## A. 输入校验、方法与总体结论

### A.1 四份输入

在阅读前逐份计算 SHA-256，全部与用户给定值匹配；全文读取后再次核验仍匹配。

| 文件 | 字节数 | 行数 | SHA-256 |
|---|---:|---:|---|
| PHASE4.7-WORKER-REMEDIATION-PLAN-V5-CANDIDATE.md | 71817 | 1140 | 4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9 |
| PHASE4.7-V5-CODEX-FINDINGS-TRACEABILITY.md | 9559 | 107 | 1b29b249b232cc5ee74d3cbd5f6b2b0441d6d0d9b4e44fe8b590520ca496a705 |
| PHASE4.7-V5-SELFCHECK.md | 5837 | 61 | 09dac6cb7658291c86fc055287a75a5e9c37724beaad791b85759b189e5ce4bd |
| CODEX-P47-V4-FOURTH-INDEPENDENT-REVIEW.md | 28193 | 345 | ade4cb3b1336b545955fbe6f3955a2c0a573d0ac22b57748a8dba2edf96195dc |

目录：C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan。

V5 是本轮执行规范审查对象；追溯表仅用于定位，自检不是独立证据。没有把“自检12 PASS、4 PARTIAL”或“25 PARTIAL、0 OPEN”当作正确性证明。

标签：
- CONFIRMED：直接文本矛盾、源码事实或可按条款推演的反例；不表示已发生运行故障。
- INFERENCE：依赖尚未定义实现选择的风险。
- UNVERIFIED：未取得动态验证。
- CLOSED/PARTIAL/OPEN 沿用第四轮严格口径：设计已解决但尚未验证仍为 PARTIAL；存在实质规格冲突则 OPEN。

本轮仅读取四份输入、少量相关源码/配置以核对接口与指标，并创建本报告。未改方案、追溯表、源码、配置、测试、历史证据或 ACL；未运行 Vitest、tsc、构建、浏览器、L1或Phase0；未创建运行根目录。

### A.2 结论

**B. APPROVED WITH CONDITIONS。**

V5已解决第四轮R01的主要缺口：所有终态统一调用finalizeRequest，20行矩阵明确deferred/retry-pending取消、早期失败、拒绝、缓存和迟到事件的双Promise处理。不能继续把这些路径按V4原样判错。

V5也恢复了UTF-16LE、原始字符串全等和完整缓存键，但ActiveKey里的placeholderSeq规则与非force合并存在直接冲突；渲染部分则同时保留新token等值判据和旧commit-seq高水位判据。两处仍属OPEN。

**本轮重评级：0 CLOSED、23 PARTIAL、2 OPEN；OPEN为R05、R16。** 数量碰巧与第四轮相同，问题归属不同：R01从OPEN降为PARTIAL，R16因新增正文冲突升为OPEN。没有为了获得0 OPEN改变标准。

本结论仅针对补齐第F节有限书面条件后，申请启动基线/隔离/工具自测范围的Phase0；不授权执行，不批准后续全部整改。后续产品规格缺口须在相应阶段前修订，不要求先实现它们才能建立基线。

## B. R01重点审查：双Promise与20行矩阵

### B.1 统一结算确有改善

CONFIRMED：226规定所有终态必须调用finalizeRequest；229—233明确未交付的resultReady先返回结果/错误，已交付则不改写，再结算completion；234—236清资源且取消中不pump；265—270要求终态时两个Promise均完成。

因此499—500行取消协议没有逐字再写resultReady，不再构成遗漏：它受226的统一规则和242/244的具体矩阵约束。上一轮指摘在此已经有实质修复。

### B.2 20行矩阵独立检查

“通过设计核对”不等于实测通过，全部动态行为仍UNVERIFIED。

| 行号/矩阵项 | 推演 | 本轮评价 |
|---|---|---|
| 242/1 deferred取消 | 尚无结果，finalize返回cancelled给resultReady，再完成completion，清引用 | 设计闭合 |
| 243/2 deferred熔断 | 同理返回breaker-open；禁止立即重新pump | 设计闭合 |
| 244/3 retry-pending取消 | 取消重试计划；两个Promise结束，旧计划回调不能复活 | 设计闭合；依赖代次检查 |
| 245/4 retry-pending熔断 | 清重试计划并最终失败 | 设计闭合 |
| 246/5 首次看门狗 | 两个Promise保持pending是正确的；同一请求进入第二次尝试 | 不应误当永久pending；须有唯一重试拥有者 |
| 247/6 第二次看门狗 | finalize返回耗尽错误，结束两者，清旧计时器 | 设计闭合 |
| 248/7 首次崩溃/协议/发送失败 | 同一请求保留，换新尝试；如果触发第三次Worker级失败，应先服从307熔断而不重试 | 设计可成立；测试优先级 |
| 249/8 第二次Worker级失败 | 两个Promise最终失败；不抹去首败 | 设计闭合 |
| 250/9 executing取消 | 结束尝试和两个Promise，退役Worker | 设计闭合 |
| 251/10 构造失败 | 没有attempt，仍有逻辑请求；finalize结束两者，未熔断才调度下个 | 设计闭合 |
| 252/11 未受理 | 明确返回两个已结算的拒绝结果，不留下请求索引 | 设计闭合；须与AnalysisHandle签名一致 |
| 253/12 缓存成功 | 新requestId/seq/ack，交付结果，completion等待当前提交 | 设计闭合；不得重用旧定时器 |
| 254/13 缓存解析失败 | 直接analysis-failed，两个Promise结束，无attempt/ack | 设计闭合；解析失败分类来源仍需补，见C.4 |
| 255/14 commit成功 | resultReady已交付不改，completion→committed，清ack | 设计闭合 |
| 256/15 commit拒绝 | completion→commit-rejected，清ack | 设计闭合 |
| 257/16 commit超时 | 超时和commit只一个胜者，迟到ack不改终态 | 设计闭合；原子终态检查须实现 |
| 258/17 awaiting-commit取消 | 不改已交付resultReady，completion→cancelled | 设计闭合 |
| 259/18 dispose | 先disposed，再全状态finalize；不可重开调度 | 设计闭合 |
| 260/19 重复取消/commit | 已终态no-op，清理不得二次删掉新请求索引 | 设计闭合 |
| 261/20 迟到事件 | 只日志，不改终态、不改新代次 | 设计闭合 |

### B.3 还需验证的资源责任

PARTIAL/UNVERIFIED：finalize是终态处理，首次失败并非终态；每个首次失败仍须由settleAttempt撤掉旧watchdog/处理器、退役旧Worker、安排至多一次重试。等待结果、等待提交、当前Worker执行槽是不同资源，不能用同一inflight引用混淆。

列明资源拥有者即可实现，不需要增加新产品功能：
- 执行槽：attempt；settleAttempt释放。
- 结果等待者：逻辑请求；resultReady广播。
- 提交ack计时器：逻辑请求；finalize撤销。
- deferred预算/active占位：对应逻辑请求；dispatch/finalize精确移除，不按模糊键删新请求。
- 每脚本currentState：最新requestSeq；旧请求终态只写自身和历史计数。

### B.4 结算竞争例子

1. **commit先赢**：committed落定、ack撤销；已排队超时回调再到只no-op。
2. **超时先赢**：failed(commit-timeout)落定；随后commit不改终态，不允许成功候选又被默默追加。
3. **取消后旧reply到**：scheduler/page/attempt代次失效；不交付新结果、不重建Worker。
4. **缓存命中立即取消**：resultReady可已完成，但completion只能cancelled；其续体不得再改当前候选。
5. **旧P结束、新force F仍deferred**：P自身completion结束；脚本currentState继续属于F。587—590已修正第四轮作用域错误。

这些均是设计推演，不是测试结果。

## C. R05重点审查：三种身份与A—G表

### C.1 已恢复的正确规范

CONFIRMED：
- 422保持D3/D4用UTF-8字节计量。
- 423、428—433用UTF-16LE码元hash＋原始字符串保真；区分孤立代理项与U+FFFD。
- 439—445包含页面、会话、scriptId、原样URL、源码、分析版本和选项。
- 449命中后再比较完整原串，hash不单独证明同源。
- 460、470—471规定force独立且绕过缓存。
- 476规定缓存结果也属于新逻辑请求；旧id/seq/ack不复用。
- 484保留受保护hash-utils.ts，不改变原有哈希口径。

无损身份从第四轮的缺失恢复了，不应继续声称V5没有SourceIdentityV1。

### C.2 A—G逐项判定

| 规则 | 期望 | 核对 |
|---|---|---|
| A 同页/会话/ID/源码/URL、非force | 一个逻辑请求，多等待者 | 与456/458的placeholderSeq相等要求冲突，见C.3 |
| B 同ID换源码 | 新请求、旧结果不覆盖当前 | 源码hash＋原串校验合理；还须检查相同长度不同源码的占位桶 |
| C 同源码换URL | 新键 | 原样URL明确，不做宽松归一化 |
| D 页面或会话变化 | 新键/旧请求失效 | pageEpoch/sessionNonce隔离正确；清理动态未测 |
| E 任意force | 独立逻辑请求 | 规则明确；force之间也不合并 |
| F force和非force并发 | 不合并 | 与E一致；cache读取、active定型全过程应保持force隔离 |
| G 缓存命中 | 新id/seq/ack | 正确；解析失败不应创建无用ack，254已明确 |

### C.3 R05仍有可构造的冲突（OPEN）

456：同步占位键含placeholderSeq。
458：异步重键时再次检查placeholderSeq，任一不符则不合并。
459/466：相同完整身份的非force必须合并为一个逻辑请求。

P、Q两个完全相同的非force请求，在hash均未完成时到达。如果各自获得独立placeholderSeq，456使它们位于不同键；定型后458又因seq不同拒绝合并，违反A。若设计让Q在分配新seq前找到P，正文没有给出这个查找层；唯一键含新序号本身不能承担同身份检索。

**具体修正：**使用不含实例序号的身份桶定位待准备请求，在桶内按完整元数据＋原串全等判断；placeholderSeq仅标记那个桶项实例，用于陈旧回调检查。异步hash定型合并时比较双方是否仍有效、是否都非force、完整元数据与源码是否相同，不能要求两个独立实例序号相等。force拥有独立请求标识，不进入可合并桶。

该修正不改变D3、D4、D10或安全规则。应补两种hash完成顺序、同长度不同源码、同源码不同URL、force交错的表驱动测试。

### C.4 失败缓存分类还有接口缺口

V5第291/293、297—302、479使用errorKind=parse与internal区分缓存和熔断。但当前受保护的src/core/decoder-discovery.ts:124—154把parseCode和全部遍历分析放在同一个try/catch，只返回analyzed:false与error.message。合法源码的内部异常也走此返回，不会自动到Worker外层catch。

CONFIRMED：从现有输出不能可靠恢复异常发生阶段。V5尚未说明不改受保护模块的分类办法。不能直接把全部analyzed:false标成parse、缓存并清健康计数，也不能仅靠错误字符串猜测阶段。

修正方向：明确可验证适配方式；无法证明为确定性解析失败时保守归为内部/未分类失败，不当作parse缓存。若要预解析确认，需写明它验证什么、额外成本及仍不能把内部错误变成parse。补合法源码＋内部异常的负例。是否实际出现该异常仍UNVERIFIED。

### C.5 非执行回调的身份范围

518仍说hash Promise、补投与已派发事件都检查Worker/attempt等代次，而尚在deferred的预hash没有attempt，其他请求重建Worker也不应取消它。

应分层：
- 请求准备、去重、补投：page/session/scheduler/request实例。
- 已派发事件：再加workerGeneration/attemptId。
- 缓存写入：完整输入身份、有效requestSeq和页面代次。

直接按“全部必须拥有全部字段”实现可使合法请求被丢弃。该项是规格缺口，动态行为未验证。

## D. R01—R25重新评级

本轮继续采用第四轮严格口径：只有设计文字而无动态验证，保持PARTIAL；实质矛盾为OPEN。

**本轮结果：0 CLOSED、23 PARTIAL、2 OPEN。OPEN为R05、R16。**

| 编号 | 当前评价 | V5证据与修订效果 | 剩余条件/责任阶段 |
|---|---|---|---|
| R01 | PARTIAL | 226—270统一所有终态的两个Promise；第四轮缺口已修 | 实现逐路径矩阵、ack与资源清理验证；Phase1 |
| R02 | PARTIAL | 242/244及496—506取消覆盖deferred/retry/executing/awaiting | 不能按499/500简写重复判旧缺陷；全部动态竞态UNVERIFIED；Phase1 |
| R03 | PARTIAL | 291—324健康分类、三次熔断、探针两次超时规则补齐 | errorKind来源需明确；探针超时后全部已受理Worker依赖任务须统一finalize；Phase1 |
| R04 | PARTIAL | 510—518有代次核验 | 非执行回调不能要求尚不存在的Worker/attempt；分层身份规则；Phase1 |
| R05 | OPEN | 423—479恢复无损身份/完整键/force | placeholderSeq与同身份非force合并矛盾；Phase1前修 |
| R06 | PARTIAL | 525—531保留字节预算、LRU、超限跳过、缓存错误隔离 | 失败分类可靠性和实际容量/清理待测；Phase1 |
| R07 | PARTIAL | 65—68容量/显式拒绝保持 | 准备期占位、预算计量和全部取消实测；不保证所有新增脚本必受理 |
| R08 | PARTIAL | 67严格优先与显示顺序分开 | 饥饿仍可能发生；只记录，不擅自改调度；Phase1/4 |
| R09 | PARTIAL | 72—76、627—638固定公式和累计执行50%正确 | 动态性能UNVERIFIED；Phase1/4 |
| R10 | PARTIAL | 400—414尝试状态和发送失败正确；首败不交付终态 | 新尝试拥有者/旧timer/恢复探针全路径未测；Phase1 |
| R11 | PARTIAL | 536—541保留URL/source/纪元和最新请求规则 | 唯一请求序号、旧结果不追加、失败续体实测；Phase2 |
| R12 | PARTIAL | 545—548对象守卫、会话重同步 | 真机旧回调和SW重启未测；D6不依复现撤销；Phase2 |
| R13 | PARTIAL | 570、587—602逻辑state与脚本currentState分离 | 第四轮终态作用域已修；旧请求/新force统计实测；Phase1/2 |
| R14 | PARTIAL | 931—933明确顶层Worker和A/B独立验证 | D1与加载未验；不能当旧IIFE+module等于B；Phase3 |
| R15 | PARTIAL | 737—753所有产物hash、trust追加锚、实际依赖清单 | baseline冲突已修；输入闭包与实际构建验证待完成；Phase3 |
| R16 | OPEN | 346—370新增epoch/session/token/逐卡与零候选 | §7等值token与618—619旧seq高水位直接冲突；单容器最新token无法同时证明多个目标；Phase4前修 |
| R17 | PARTIAL | 769—785分开Worker/coordinator/panel/DOM/harness | 真实panel全文未直采；测试commit记录出口和产品权限边界待明确；Phase2/4/5 |
| R18 | PARTIAL | 644—702优先级补window-deadline/render-unverified，整run与目标时点分开 | render状态定义仍重叠/遗漏、错误码与最终失败对应未完全闭合；Phase4 |
| R19 | PARTIAL | 791—805两个schema和四方原则保留 | 自检称真实类型/hash规则已修，正文仍“含位置/值/组键”；schemaHash计算/包络未定义；Phase5 |
| R20 | PARTIAL | 130—134、146、813副本隔离与自身dist写入观测 | 复制频次/守卫生效未测；Phase0 |
| R21 | PARTIAL | 829—831只校验或拒写、整体预检 | D11未批；副本历史输入可读与188禁止读取冲突需修；Phase0/3 |
| R22 | PARTIAL | 161—209细化读写/FD/链接/原生和禁止读即FAIL | 自测哨兵时序、运行时读取白名单、noEmit缺失；Phase0前有限澄清 |
| R23 | PARTIAL | 854—883定向映射、最终产物、不同bundle重验 | 最终实际提升树、映射编辑及构建仍未验证；Phase6/P |
| R24 | PARTIAL | 842—846 ADS内容hash与不归因 | 实际ADS、元数据与原生检测器未验；Phase0 |
| R25 | PARTIAL | 895—903只读W2-A/另批W2-B保持 | 账户/ACL/第二归档/独立执行者待落实；Phase0 |

追溯表的R01降级方向可以接受；R05和R16不能仅按自检标PARTIAL后直接实施。0 CLOSED来自严格口径，不是为了制造更多问题。

## E. R16及全局规格的主要剩余问题

### E.1 token规则与旧判据冲突（CONFIRMED，R16 OPEN）

364规定容器render-commit-token必须**等于**目标token；352又将它定义为“完整快照覆盖的最新提交token”。618—619保留了旧的scriptId/requestSeq/commitSeq与render-commit-seq ≥目标，而本版属性表已经改为token。

可直接构造正常失败：
- T提交token10，U随后提交token11。
- 两者在同一次完整列表渲染中均正确呈现。
- 容器记录最新token11；T卡带token10。
- 对T按364要求容器=token10永远不成立；按619的高水位规则又可能成立。

这不是极端浏览器行为，是同一规格的两种算法。Phase6还要求每个脚本渲染完成，单个“最新token”不可能同时等于多个提交token。

修正：统一采用一套不可变渲染快照模型；快照记录覆盖的每脚本提交身份（或等价可验证映射），逐卡对应该快照。零候选目标必须在覆盖映射中存在，且旧目标卡已清除。是否采用高水位必须说明顺序和覆盖保证；不能把token字符串相等和数值≥混用。

370的“独立token来自D10记录与coordinator记录”也需明确测试怎样取得**真实面板同一次**coordinator记录。D10没有epoch/session/commitSeq，不可由缺少字段的D10自行拼出token；独立harness的另一次提交不能代替。额外观察方法不得擅扩生产钩子。

### E.2 渲染状态与deadline（CONFIRMED规格缺口）

365允许0<卡片数<期望时partial；367说截止未完成且无成功token时timeout，二者可能同时成立。期望非0但0张卡且发布了错误token也未有唯一归类。需先规定invalid/partial/pending，再在截止用唯一优先级出终态。

647的“executing且当前watchdog错误”原则上应已转timed-out/retry-pending或failed；请定义快照读取原子点，别把中间态当一种稳定终态。恢复探针最终错误码breaker-probe-timeout也须明确落到infra还是execution-timeout，不能依通配符偶然分配。

V5补齐window-deadline与render-unverified的优先级、目标窗口和整run窗口的区分，是实质修复；不重复指摘V4的原始遗漏。

### E.3 schema声明与正文不一致（CONFIRMED）

57行和自检称“真实类型/包络/hash规则”已修，但792仍写候选集合“含位置/值/组键”，并未定义schemaHash如何算。当前Discovery候选不是已验证替换候选，不能混入value/groupId模型。

应分别声明：
1. 原始DiscoveryResult完整值，无损保留字段存在性和数值。
2. 共享coordinator提交的Discovery候选集合，按其真实类型。
3. schemaId/schemaHash为传输包络；schemaHash对schema定义计算，不自我递归。
4. 双hash对同schema payload比较；不能插入包络后称原函数返回值原样相等。

设计方向正确，细节仍须Phase5前完善。

### E.4 已经修复且不应重开的问题

- currentState与旧逻辑请求作用域：587—590已明确，不能继续用V4反例判错。
- 全部早期终态双Promise：226—270已完整统领简写取消步骤，不能继续称deferred取消缺resultReady。
- trust与baseline：743改为独立append-only trust锚，解决写冻结baseline的冲突。
- Source Integrity/SRR：定义正确，见G节。
- 不可达breakWorker截断：不列有效风险。
- 健康回复与内部异常、恢复探针超时：V5补规则，但仍须解决现有函数如何可靠分类的接口问题，不能仅凭新errorKind名字视为已完成。

## F. Phase0六项准入与批准条件

**对Phase0的判断：APPROVED WITH CONDITIONS。** 条件是有限书面执行契约修正，不是要求先完成Phase0或开发产品。

### F.1 E1：顺序正确，但自测对象不能依赖未创建对象

121、126正确要求检测器通过后再取权威M0；然而165要求先验证工作进程，168要求先读原项目/历史证据/冻结baseline的“专用哨兵”。此时baseline、完整副本按122尚未建立，121又明示不接触原项目。

**启动前明确：**
- M0前的拒读/拒写只针对controls中的模拟保护根/哨兵。
- 不在原项目、历史证据或冻结baseline创建哨兵。
- 初次工具自测使用独立最小Node/worker测试环境；完整副本派生后、正式全量实验前，再用专用探针验证实际Vitest工作进程与路径配置。
- 两段探针分别有停止条件，不用“全部已验证”掩盖顺序差异。

这些都是Phase0内部步骤，不要求本轮创建副本。

### F.2 E2：同源三副本设计可接受

130—134保留同源核验、物理隔离、不共享可写依赖或缓存。执行时核验副本解包后实际字节、目录链接/硬链接与配置位置，不能只有复制命令返回成功。

动态派生、复制和依赖隔离仍UNVERIFIED，留Phase0验证。

### F.3 E3：写入边界有实质改善

151新增逐命令可写目录；146明确插件写自己实验dist是预期观察；155/157禁止保护区写入且归因不能放行。143/743隔离baseline与trust。

还需把允许写、只追加、冻结后禁止修改在工具日志中分开。只读审查报告的写入是本轮单独允许的交付，不给后续任何原项目写权限。

### F.4 E4：禁止读成功即失败正确，但读白名单过宽禁止

188无条件将历史验收证据、冻结baseline、系统目录和运行根外位置列为内容读取禁止区，而143允许baseline读取，产品测试又必须读取副本内历史输入，工具链需要读取授权的运行时文件。

**启动前明确按命令读白名单：**
- 清单/归档/核对工具可读原项目与baseline；写原项目仍禁止。
- 副本测试可读副本里的历史fixture/参考/观测文件，但一律不可改写。
- 允许读取明确的Node/系统运行时及工具链；不是开放任意用户目录。
- 原项目内容对产品测试始终禁止。
- 禁止区探针用假目录，不以成功读取真实原项目作为“测试守卫”。

199将stat/readdir与内容读取区分合理；目录元数据是否敏感属于本任务之外，不擅加新限制。

原生进程没有OS级写拒绝，V5已如实披露。启动器与事后检测不能证明任意本机程序绝不越界；不假称有该能力。

### F.5 E5：归档与信任锚

143/144/743正确分开冻结baseline和后续trust追加。第二归档位置尚需用户指定，可在Phase0生成归档前落实，不要求先完成备份才准入。

新增清单一生成即公布hash，失败记录不覆盖。当前TEMP方案文件只有本轮已核对hash，不等于永久不可改；后续以公布hash与用户保存副本核验。

### F.6 E6与遗漏的noEmit硬条件

V5的“原项目不跑测试/构建”保持。但123、918等Phase0流程写tsc，**仅996的Phase6写noEmit**；本轮全文没有为Phase0和启动器保留强制--noEmit。

现项目tsconfig.json设置outDir=dist、declaration/declarationMap/sourceMap，默认tsc会输出文件。这是CONFIRMED的配置事实，本轮没有运行tsc。

**启动前补一条全局命令约束：所有阶段、所有原样/无插件/中和副本的类型检查必须显式tsc --noEmit；启动器拒绝缺该参数的命令。** 这是恢复既有M2，不能只因在副本中执行就允许额外emit污染实验dist。

### F.7 准入条件汇总

只需在执行前书面固定：
1. M0前模拟自测、M0后实际工作进程探针的两段顺序及对象。
2. 按命令划分内容读白名单，允许副本历史输入/授权运行时，拒绝产品测试读取原项目。
3. 全局强制tsc --noEmit，并在启动器检查。

实际ACL读回、只读探针、文件复制、插件写入频次、守卫继承均留Phase0。不能把UNVERIFIED误当通过，也不能要求先完成这些实验才批准Phase0。

R05/R16及其余产品规格问题需在相应后续阶段前修订；不把Phase0扩大成产品开发阶段。

## G. 安全指标与D1—D16决策边界

### G.1 安全定义已核对

V5第710—720行与本轮只读核对的项目文件一致：
- test/helpers/real-site-compare.ts:139—150：FR四项、R_pos、R_neg、Precision、SRR。
- 同文件182—186：false优先不通过；n/a为inconclusive。
- docs/PHASE4.7-REAL-SITE-PLAN.md:43—48：reference原始源码、CDP捕获源码、替换后activeScript.source三处一致。

因此N05定义层已修；没有实测证据时仍不能写安全指标通过。零替换、零分母和版本不符不能伪装成功；保持原始源码而不是格式化文本作完整性证据。

### G.2 决策审查

| 决策 | 结论 |
|---|---|
| D1 | 待批准；A/B真实构建加载不能用旧IIFE+module替代 |
| D2 | 待批准；戳内容只输入hash/Vite版本，位置仍由用户定 |
| D3 | 256/64MiB/64KiB、显式deferred、严格小任务优先保留；不自行增加aging |
| D4 | UTF-8公式、一次重试和累计执行50%保留；不随实测调阈值 |
| D5 | 待批准；内部状态修复不授权全部UI改造 |
| D6 | 必修身份/纪元守卫范围保留；不扩到capture-engine/验证语义 |
| D7 | 待批准；身份失效排除与新增退休筛选分开 |
| D8 | 待批准；无批准阈值不声称性能验收通过 |
| D9 | 待批准；D9-deferred不等于L1运行许可 |
| D10 | 九字段和严格查询参数保留；测试DOM观测需相应范围确认，不借旁路扩大内容出口 |
| D11 | 待批准；默认只校验尚未实现，拒写替代不得覆盖旧证据 |
| D12 | 工作副本、一次提升、最终树验证保留 |
| D13 | 未批用整树归档，不自动创建Git提交 |
| D14 | 正式D:\P47RUN、管理员/SYSTEM、沙箱只读保留；不把TEMP V0例外当正式运行根 |
| D15 | 静默窗口与不归因保留；W2-B另授权 |
| D16 | 待批准；实验入口也须显式根/输出/profile，不以副本路径自动视为已隔离 |

没有给任何待决策项目代签。实际W2执行者、第二归档和授权范围由用户落实。

## H. N01—N09逐项审查

| 编号 | 本轮状态 | 结论 |
|---|---|---|
| N01 终态责任 | PARTIAL | finalize＋20行矩阵已修关键遗漏；动态竞态未验，错误来源适配仍需补 |
| N02 状态守恒 | PARTIAL | 两级状态和旧请求作用域正确；动态force/计数未验 |
| N03 性能/渲染 | OPEN | token等值与旧seq高水位正文冲突，多个目标完整渲染反例成立 |
| N04 无损身份 | OPEN | 无损编码恢复，但placeholderSeq比较与非force合并直接冲突 |
| N05 安全口径 | PARTIAL | 已对照原定义一致，动态指标未验 |
| N06 panel与harness | PARTIAL | 双范围及不冒充直采正确；独立commit记录出口/真实类型需明确 |
| N07 构建证明 | PARTIAL | trust分离已修；实际闭包、负例、可复现性未验 |
| N08 最终树 | PARTIAL | 权威bundle不同重验保持；实际映射/完整树未验 |
| N09 阶段依赖 | PARTIAL | 不再要求提前实现；Phase0模拟探针与实际工作进程先后还需固定 |

## I. 主要风险与责任阶段

### P0：后续实施前必须修订

- R05/C.3：同身份非force无法按当前seq规则合并，可能重复执行或丢失预期等待者归属。
- R16/E.1：同一正确渲染对T、U有矛盾判定；不统一不能签发性能通过。
- C.4：内部分析异常若被标成parse，可能错误缓存并清除故障计数。当前没有证据表明已发生，但接口缺口已确认。
- F.1/F.4：守卫自测若直接碰原项目/冻结baseline会违背任务边界；必须使用模拟对象先验证。

### P1：验收可靠性与资源控制

- C.5：未派发请求绑定Worker/attempt代次，可能在无关Worker重建时被误失效。
- E.2：分类重叠和快照中间态未完全闭合。
- E.3：schema与真实类型、hash包络缺定义。
- F.6：Phase0 noEmit硬约束未明确保留，会污染实验副本dist。
- D14/W2：无独立运行授权时，不能把W2-A静态复核称为W2-B独立重跑。

### P2：继续如实披露的限制

- 小任务严格优先可能让大任务持续等待；不改变已批准调度规则。
- 原生子进程不受Node fs守卫完整约束；不声明OS隔离已实现。
- 真实panel全文未直采；共享代码不等于同一次实例内容。
- 全部实际性能、ACL、缓存资源、异常注入、完整输出、最终提升树实验均UNVERIFIED。
- 不可达breakWorker截断不是有效风险，不重新列出。

## J. 阶段依赖、回滚与最终建议

路线0→3→1→2→4→5→6→P可以保留：
- Phase0：仅基线、隔离、工具、对照；F.7契约补齐后申请启动。
- Phase3：复制插件、Worker配置、trust、旁清单、D11/D16按授权；不在原项目跑。
- Phase1：先修C.3/C.4/C.5规格，再实现双Promise、身份和故障状态机；不重复推翻已修finalize。
- Phase2：共享coordinator、页面/会话身份、当前状态；与Phase1联合回滚到Phase3兼容快照。
- Phase4：先统一token/渲染快照/分类规则；分别测目标可用时刻与整run截止；partial不冒称全量通过。
- Phase5：两schema完整对照、无损编码、独立结果；真实panel无法直采继续UNVERIFIED。
- Phase6：冻结树全量回归与最终权威产物；不同bundle必须重验。
- P：另行批准，按清单复制与回滚，不在原项目测试，不碰旧证据。

**最终结论：APPROVED WITH CONDITIONS，仅允许在有限Phase0书面条件满足后申请启动。**

本报告不授权任何执行。V5“0 OPEN”的自检不被采纳；本轮为0 CLOSED、23 PARTIAL、2 OPEN。修复内容按责任阶段推进，不为减少OPEN改评级，不要求把后续所有实验提前做完。

本次报告的文件大小、行数与SHA-256在交付回复中提供；文件自身不嵌入自己的hash，以免自引用。审查至此结束，等待用户决定。
