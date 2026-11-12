# Phase 4.7 V5 对第四轮审查的追溯表

> **性质：** `PHASE4.7-WORKER-REMEDIATION-PLAN-V5-CANDIDATE.md` 的配套追溯记录。只记录文档层处理；不声称实现、测试或动态验收已完成。
>
> **输入：** V4 候选 `a5d2d9b2…`（59954 字节，1002 行）；V4 追溯 `258a8d3f…`（9945 字节，108 行）；V4 自检 `a162b0a3…`（5588 字节，61 行）；第四轮审查 `ade4cb3b…`（28193 字节，345 行）。四者均 MATCH。
>
> **状态口径：** 第四轮按更严格规则重评为 **0 CLOSED / 23 PARTIAL / 2 OPEN**（OPEN 为 R01、R05）。V5 只闭合 R01、R05 的设计缺口，故 V5 为 **0 CLOSED / 25 PARTIAL / 0 OPEN**：设计完成但未动态验证的项目一律 PARTIAL；不升 CLOSED。

## 一、状态统计

| 状态 | 数量 | 编号 |
|---|---|---|
| CLOSED | 0 | — |
| PARTIAL | 25 | R01—R25 全部 |
| OPEN | 0 | — |
| 合计 | 25 | 无缺失、无新增编号 |

**与第四轮对比：** CLOSED 0→0；PARTIAL 23→25（R01、R05 从 OPEN 降为 PARTIAL）；OPEN 2→0。CLOSED 数量没有增加，不为了统计好看降低标准。

## 二、R01—R25 逐项表

| 编号 | 原始审查意见 | 第四轮结论 | V5 修订位置 | V5 处理结果 | 责任阶段 | 验证方法 | 失败处理 |
|---|---|---|---|---|---|---|---|
| R01 | 交付与最终结算混用；deferred/retry-pending/早期终态未结束 resultReady | OPEN | §5、§9.3 | PARTIAL（设计闭合，未实测） | Phase 1 | `finalizeRequest` 统一；20 行逐路径矩阵；双 Promise 各一次；提交超时；缓存命中新请求；重复取消 no-op | 任一终态遗留 resultReady/completion → 阶段失败 |
| R02 | 取消中 pump、部分任务漏结算 | PARTIAL | §8.6 | PARTIAL | Phase 1 | 九步取消；四类状态逐项结算；取消期间 pump=0 | 新任务或 pending → 失败 |
| R03 | 构造成功清零使熔断不可达；ok:false 语义 | PARTIAL | §6 | PARTIAL | Phase 1 | 健康回复限定 ok:true/parse；internal 计失败；3 次可达；探针看门狗不计数 | 构造成功清零/阈值不可达 → 失败 |
| R04 | 旧事件污染新 Worker；回调绑定范围过宽 | PARTIAL | §8.7 | PARTIAL | Phase 1 | 按作用域绑定：准备/哈希用 page/scheduler/request，Worker 用 attempt/generation；stale no-op | 正常排队任务被误废/旧事件改状态 → 失败 |
| R05 | 无损源码身份/完整缓存键/非 force 去重回退 | OPEN | §8.4 | PARTIAL（设计闭合，未实测） | Phase 1 | SourceIdentityV1/CacheKeyV1/ActiveKeyV1；原串全等；force 永不合并；去重表 A—G | 以 UTF-8/前缀/长度作唯一身份，或 force 合并 → 失败 |
| R06 | 缓存上界/超限行为 | PARTIAL | §8.8、§8.4.5 | PARTIAL | Phase 1 | 128/32 MiB；UTF-8 resultBytes；单条/淘汰不足跳过；缓存异常不失败分析 | 突破预算或分析失败 → 失败 |
| R07 | deferred 容量与显式拒绝 | PARTIAL | §3.1 | PARTIAL | Phase 1 | 256/64 MiB/64 KiB；显式拒绝；取消/纪元结算 | 静默丢弃/计为已分析 → 失败 |
| R08 | 调度/展示顺序及饥饿 | PARTIAL | §3.1 | PARTIAL | Phase 1/4 | 调度/展示分离；overtaken 计数；不改优先级 | 擅自 aging → 失败 |
| R09 | 超时规则与 50% 分子 | PARTIAL | §3.2、§10.3 | PARTIAL | Phase 1 规则/Phase 4 实测 | 固定公式；累计执行作 50%；首败计入 | 6 倍/单次成功 → 失败 |
| R10 | 尝试与最终结果责任 | PARTIAL | §8.2—8.3、§5 | PARTIAL | Phase 1 | attempt 9 态；created→dispatched/post-failed；重试矩阵；首败可见 | 重复结算/隐藏首败 → 失败 |
| R11 | 刷新/URL/旧结果 | PARTIAL | §8.9 | PARTIAL | Phase 2 | 单飞/快照/最新请求/URL/source/epoch；按脚本替换 | 重复追加/旧结果作目标 → 失败 |
| R12 | 后台迟到/SW 会话重置 | PARTIAL | §8.10 | PARTIAL | Phase 2 | 对象身份/collectorEpoch/sessionNonce；确定性测试 | 旧脚本复活/合法脚本丢失 → 失败 |
| R13 | 当前状态与历史计数；currentState 作用域 | PARTIAL | §9、§9.3 | PARTIAL | Phase 1/2 | 11 态守恒；counters 独立；旧请求不改写最新脚本状态 | 守恒失败/旧请求覆盖最新 → 失败 |
| R14 | Vite 配置/旧证据冒充 B | PARTIAL | §12.1 | PARTIAL | Phase 3 | A/B 独立构建/加载；D1 待定 | 未证实组合 → 失败 |
| R15 | 构建输入/实际产物证明；旁清单写 baseline | PARTIAL | §12.2—12.4 | PARTIAL | Phase 3 | 戳/旁清单/实际 hash/五负例；trust append-only；不得写 baseline | 未发现篡改/写冻结 baseline → 失败 |
| R16 | 渲染完成可假通过；纪元/逐卡/零候选 | PARTIAL | §7、§10 | PARTIAL | Phase 4 | commitToken（epoch+nonce+seq）；逐卡 token；零候选独立 token；tick 完整快照后发布；八反例 | 同签名/旧纪元/零候选自证 → 失败 |
| R17 | D10 与真实 panel/harness 证明 | PARTIAL | §13.1—13.3 | PARTIAL | Phase 4/5 | 五层；共享 coordinator；双范围；不扩生产出口 | 计数/共享代码冒充全文 → 失败 |
| R18 | deadline 不穷尽/优先级/错误码 | PARTIAL | §10.5 | PARTIAL | Phase 4 | 18 级优先级；window-deadline/render-unverified/commit-timeout；当前尝试错误码；目标/全 run 终点分离 | 默认成功/partial 吞失败 → 失败 |
| R19 | 两 schema 字段/schemaHash | PARTIAL | §13.4—13.5 | PARTIAL | Phase 5 | DiscoveryResultV1 与 CommittedCandidateSetV1；真实类型/包络/hash 规则；双哈希 | 候选代替完整结果 → 失败 |
| R20 | closeBundle/副本对照 | PARTIAL | §4.2、§14.1 | PARTIAL | Phase 0 | 同源三副本；插件/无插件对照；不预设频次 | 原项目写入 → 停止 |
| R21 | persistRun 覆盖/预期拒写 | PARTIAL | §14.4、§4.3 | PARTIAL | Phase 0/3 | D11 只校验或拒写；预检；白名单；中断保留 | 覆盖历史/半写入 → 停止 |
| R22 | ROOT/profile/cache/原生；禁止读成功有日志不失败 | PARTIAL | §4.4、§14.5 | PARTIAL | Phase 0 | 读/写/FD/复制/链接/原生矩阵；禁止读成功即 FAIL；不启动 Chrome | 矩阵未过/禁止读成功 → 不实验 |
| R23 | 逆映射/最终权威产物 | PARTIAL | §15.1—15.4 | PARTIAL | Phase 6/P | 定向映射；双向；碰撞；bundle 相同复用/不同重验 | 未验证/未重验 → 不 P |
| R24 | ADS/未知变化归因 | PARTIAL | §14.6 | PARTIAL | Phase 0/6 | ADS 内容 hash/缩小声明；source-unknown；阳性对照 | 绝对化/归因主体 → 失败 |
| R25 | ACL/只读 Codex/W2 | PARTIAL | §16、§4 | PARTIAL | Phase 0/P | ACL 读回；Codex 读写哨兵；W2-A/B；不扩权 | 扩权/未授权实跑 → 失败 |

## 三、R01/R05 的设计闭合点

| 编号 | 第四轮 OPEN 原因 | V5 修正 | 为何仍 PARTIAL |
|---|---|---|---|
| R01 | deferred/retry-pending 取消只结束 completion；早期终态未统一 | §5 `finalizeRequest`：未交付则 resolve error，已交付不改写；20 行矩阵覆盖 20 条路径；清 ack/等待者/索引；旧请求不改写脚本状态 | 未实现、未跑并发/取消/提交超时/故障注入 |
| R05 | V4 丢失 V3 的 UTF-16LE 身份、完整键、非 force 占位 | §8.4 SourceIdentityV1、CacheKeyV1、ActiveKeyV1、去重表 A—G、force 永不合并、缓存命中新请求 | 未实现、未跑孤立代理项/并发/缓存边界 |

## 四、N01—N09

| 编号 | 第四轮结论 | V5 处理 | V5 状态 |
|---|---|---|---|
| N01 | OPEN | §5 双 Promise 全终态矩阵 | PARTIAL（设计，未实测） |
| N02 | PARTIAL | §9 11 态守恒；§9.3 两级状态 | PARTIAL |
| N03 | PARTIAL | §7/§10 DOM token/零候选/deadline | PARTIAL |
| N04 | OPEN | §8.4 无损身份/缓存/去重恢复 | PARTIAL（设计，未实测） |
| N05 | PARTIAL | §11 原口径 | PARTIAL |
| N06 | PARTIAL | §13 五层/双 schema | PARTIAL |
| N07 | PARTIAL | §12 戳/旁清单/trust/负例 | PARTIAL |
| N08 | PARTIAL | §15 双向/bundle 重验 | PARTIAL |
| N09 | PARTIAL | §17 阶段/入口出口/检测器先于 M0 | PARTIAL |

## 五、E1—E6

| 条件 | V5 位置 | 状态 |
|---|---|---|
| E1 初始化顺序（检测器先于权威 M0；出口永远停） | §4.1、§17.1 | 落实 |
| E2 三副本同源隔离 | §4.2 | 落实 |
| E3 写入白名单/预期意外/删除归因通过 | §4.3、§14.2—14.3 | 落实 |
| E4 检测器顺序/读矩阵/禁止读判据/不启动 Chrome | §4.4 | 落实 |
| E5 基线/第二归档/trust 分离 | §4.5、§12.2 | 落实，位置待用户 |
| E6 原项目只读 | §4.6 | 落实 |

## 六、D1—D16

| 决策 | 状态 | V5 处理 |
|---|---|---|
| D1 | 待批准 | 不选 A/B |
| D2 | 待批准 | 戳位置待定 |
| D3 | 已批准 | §3.1 |
| D4 | 已批准 | §3.2、§10.3 |
| D5 | 待批准 | 未批不做 UI |
| D6 | 按 M6 必修 | §3.7、§8.10 |
| D7 | 待批准 | 未批不筛退休 |
| D8 | 待批准 | 未批不记通过 |
| D9 | 待批准 | D9-deferred |
| D10 | 已批准 | §3.3、§13 |
| D11 | 待批准 | §14.4 |
| D12 | 已批准 | §3.4、§15 |
| D13 | 待批准 | 整树归档 |
| D14 | 已批准 | §3.5、§4 |
| D15 | 已批准 | §3.6 |
| D16 | 待批准 | 未批不改造 |

## 七、本轮声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第五轮独立审查。**
