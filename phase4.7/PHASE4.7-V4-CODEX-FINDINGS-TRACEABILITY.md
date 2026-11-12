# Phase 4.7 V4 对第三轮审查的追溯表

> **性质：** `PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md` 的配套追溯记录。只记录文档层处理；不声称实现、测试或动态验收已完成。
>
> **输入：** V3 候选 `2ed0fce1…`（73389 字节，1107 行）；V3 追溯 `f43a6a3e…`（10783 字节，106 行）；第三轮审查 `ab92008f…`（31184 字节，359 行）。三者均 MATCH。
>
> **状态口径：** 第三轮独立重评级为 11 CLOSED / 11 PARTIAL / 3 OPEN（R01、R03、R16）。V4 只把 R01、R03、R16 的设计矛盾闭合，因此降为 PARTIAL，不升 CLOSED；其余状态沿用第三轮。V4 统计为 **11 CLOSED / 14 PARTIAL / 0 OPEN**。

## 一、状态统计

| 状态 | 数量 | 编号 |
|---|---|---|
| CLOSED | 11 | R02、R04、R06、R07、R08、R09、R11、R12、R13、R20、R24 |
| PARTIAL | 14 | R01、R03、R05、R10、R14、R15、R16、R17、R18、R19、R21、R22、R23、R25 |
| OPEN | 0 | — |
| 合计 | 25 | 无缺失、无新增编号 |

**与第三轮对比：** CLOSED 11→11（不变）；PARTIAL 11→14（R01/R03/R16 从 OPEN 降为 PARTIAL）；OPEN 3→0。CLOSED 数没有增加，不为了统计好看降低标准。

## 二、R01—R25 逐项表

| 编号 | 原始审查意见 | 第三轮结论 | V4 修订位置 | V4 处理结果 | 责任阶段 | 验证方法 | 失败处理 |
|---|---|---|---|---|---|---|---|
| R01 | inflight 不结算；交付与最终结算同一 Promise | OPEN | §5、§8.1—8.3 | PARTIAL（设计闭合，未实测） | Phase 1 | resultReady/completion 双 Promise；提交超时；缓存命中；取消/提交失败；重复结算 | 任一 Promise 未结算/重复结算/永久 awaiting-commit → 阶段失败 |
| R02 | cancelAll 中 pump 抢跑、retry-pending 遗漏 | CLOSED | §8.6 | CLOSED | Phase 1 | 九步取消；executing/retry-pending/deferred/awaiting-commit 逐项结算；取消期间 pump=0 | 取消期间新任务或遗留 pending → 失败 |
| R03 | 创建 Worker 成功即清零，熔断不可达 | OPEN | §6 | PARTIAL（设计闭合，未实测） | Phase 1 | 仅有效健康回复清零；构造成功不清零；3 次可达；恢复探针保留阈值 | 构造成功清零或 3 次不可达 → 失败 |
| R04 | 旧 Worker 事件/超时/哈希/重试影响新实例 | CLOSED | §8.7 | CLOSED | Phase 1 | workerGeneration/pageEpoch/attemptId/requestId/collectorEpoch 绑定；stale no-op | 旧事件改状态/写缓存/pump → 失败 |
| R05 | UTF-8 身份、active 合并、force 冲突 | PARTIAL | §8.4 | PARTIAL | Phase 1 | force 永不合并；异步重键带 force 标记；缓存 seq 只进不退 | force 被合并或旧结果覆盖新请求 → 失败 |
| R06 | 缓存/超大项无界 | CLOSED | §8.8 | CLOSED | Phase 1 | 128 条/32 MiB；UTF-8 resultBytes；单条超限跳过；LRU 不足跳过；缓存异常不失败分析 | 突破预算或缓存异常导致分析失败 → 失败 |
| R07 | deferred 边界/静默丢弃 | CLOSED | §3.1 | CLOSED | Phase 1 | 256 条/64 MiB/64 KiB；显式拒绝；取消/纪元结算 | 静默丢弃或计为已分析 → 失败 |
| R08 | 优先级/顺序/饥饿 | CLOSED | §3.1 | CLOSED | Phase 1 | 调度/展示分离；overtaken 计数；不增加 aging | 擅自公平调度 → 失败 |
| R09 | 看门狗/50% 分子 | CLOSED | §3.2、§10.3 | CLOSED | Phase 1 规则/Phase 4 验收 | 固定公式；累计执行作 50% 分子；首败计入 | 用单次成功或 6 倍阈值 → 失败 |
| R10 | 重试/逻辑与尝试 | PARTIAL | §8.2—8.3、§8.6 | PARTIAL | Phase 1 | attempt 9 态；重试矩阵；首次失败可见；取消结算 | 重复结算/隐藏首败 → 失败 |
| R11 | 刷新重复/URL/旧结果 | CLOSED | §8.9 | CLOSED | Phase 2 | 单飞/快照/requestSeq/URL/source/epoch；按脚本替换 | 重复追加或旧结果作目标 → 失败 |
| R12 | 迟到 script-discovered/SW 重启 | CLOSED | §8.10 | CLOSED | Phase 2 | 对象守卫；collectorEpoch；sessionNonce 重同步；确定性测试 | 旧脚本复活或合法脚本丢失 → 失败 |
| R13 | gauges 与历史 counters 混用 | CLOSED | §9 | CLOSED | Phase 1/2 | 11 态守恒；counters 分离；最新请求独占更新 | 守恒不成立/历史混入当前 → 失败 |
| R14 | Worker 配置/旧证据冒充 B | PARTIAL | §12.1 | PARTIAL | Phase 3 | A/B 独立构建/加载；D1 定案；旧 IIFE+module 不作为 B | 选未证实组合/旧证据冒用 → 失败 |
| R15 | 产物与输入证明不足 | PARTIAL | §12.2—12.4 | PARTIAL | Phase 3 | 戳/旁清单/实际逐文件 SHA；五负例；依赖清单 | 未发现同名改/缺失/多余/旁清单改 → 失败 |
| R16 | DOM 签名无请求来源，同签名可冒认 | OPEN | §7、§10 | PARTIAL（设计闭合，未实测） | Phase 4 | 测试专用 DOM 属性（scriptId/requestSeq/commitSeq）；容器 tick/commit seq；七反例 | 同签名旧卡/其他脚本卡冒充 → 失败；属性不可用则 render-unverified |
| R17 | D10 与真实 panel/harness 证明 | PARTIAL | §13.1—13.3 | PARTIAL | Phase 4/5 | 五层证明；共享 coordinator；双范围；不扩生产出口 | 计数/共享代码冒充 panel 全文 → 失败 |
| R18 | deadline 不穷尽/错误码/partial | PARTIAL | §10.5—10.6 | PARTIAL | Phase 4 | 11 态×错误码×渲染完整表；16 级优先级；all-terminal 不等于通过 | 默认成功或 partial 吞失败 → 失败 |
| R19 | 候选集合与完整 DiscoveryResult 混用 | PARTIAL | §13.4—13.5 | PARTIAL | Phase 5 | DiscoveryResultV1 与 CommittedCandidateSetV1 分开；双哈希；深比较 | 候选代替完整结果 → 失败 |
| R20 | closeBundle/实验污染 | CLOSED | §4.2、§14.1 | CLOSED | Phase 0 | 同源三副本；插件/无插件对照；原项目不跑 | 原项目写入 → 停止 |
| R21 | persistRun 覆盖/预期拒写 | PARTIAL | §14.4、§4.3 | PARTIAL | Phase 0/3 | D11 只校验或证据目录拒写；预检全部写项；白名单 | 覆盖历史/半写入 → 停止 |
| R22 | ROOT/profile/cache/子进程 | PARTIAL | §4.4、§14.5 | PARTIAL | Phase 0 | 读/写/FD/链接/原生矩阵；Phase 0 不启动 Chrome；启动器边界 | 矩阵未过或原生越界无阻止 → 不进入正式实验 |
| R23 | 最终树/逆映射/已验产物 | PARTIAL | §15.1—15.4 | PARTIAL | Phase 6/P | 定向映射；双向；碰撞；bundle 相同复用/不同重验 | 最终树未验证或 bundle 不同未重验 → 不 P |
| R24 | ADS 未 hash/错误归因 | CLOSED | §14.6 | CLOSED | Phase 0/6 | ADS 逐流内容 hash 或缩小声明；source-unknown；阳性对照 | 绝对化或归因外部主体 → 失败 |
| R25 | ACL/只读 Codex/W2 | PARTIAL | §16、§4 | PARTIAL | Phase 0/P | ACL 读回；Codex 读/写哨兵；W2-A/B；不扩权 | 读不到扩权或 W2-B 未授权实跑 → 失败 |

## 三、三个 OPEN 的处理

| 编号 | 第三轮 OPEN 原因 | V4 设计修正 | 为何仍是 PARTIAL |
|---|---|---|---|
| R01 | analysis-succeeded 未结算却 settleLogical；交付与最终结算同一 Promise | §5 双 Promise：resultReady 交付、completion 最终；提交超时；缓存命中；取消/提交失败六路收尾 | 协议未实现，未跑单测/真机；不能升 CLOSED |
| R03 | 创建成功清零使熔断不可达 | §6 仅有效健康回复清零；构造成功不清零；3 次可达；恢复探针保留阈值 | 未实现，未注入连续崩溃；不能升 CLOSED |
| R16 | DOM 签名无请求来源，同签名可冒认 | §7 测试专用 DOM 属性 + 容器 tick/commit seq；七类反例 | 属性未实现，未跑反例；不能升 CLOSED |

## 四、N01—N09

| 编号 | 第三轮结论 | V4 处理 | V4 状态 |
|---|---|---|---|
| N01 | OPEN | §5 双 Promise、§6 熔断、§8 状态机 | PARTIAL（设计闭合，未实测） |
| N02 | CLOSED（动态 UNVERIFIED） | §9 11 态守恒/counters | CLOSED |
| N03 | PARTIAL | §7/§10 DOM 归属、deadline、累计耗时 | PARTIAL |
| N04 | PARTIAL | §8.4 force 永不合并 | PARTIAL |
| N05 | CLOSED（动态 UNVERIFIED） | §11 恢复原口径 | CLOSED |
| N06 | PARTIAL | §13 五层证明、双 schema | PARTIAL |
| N07 | CLOSED 于规则 | §12 旁清单/实际 hash/负例 | CLOSED（运行 UNVERIFIED） |
| N08 | PARTIAL | §15 双向、bundle 相同复用/不同重验 | PARTIAL |
| N09 | 基本 CLOSED | §17 循环消除、出口永远停 | CLOSED |

## 五、E1—E6

| 条件 | V4 位置 | 状态 |
|---|---|---|
| E1 初始化顺序（M0 先于测试；出口永远停） | §4.1 | 落实 |
| E2 三副本同源隔离 | §4.2 | 落实 |
| E3 写入白名单/预期意外/删除归因通过 | §4.3、§14.2—14.3 | 落实 |
| E4 读/写/FD/链接/原生矩阵；不启动 Chrome | §4.4 | 落实 |
| E5 基线/第二归档 | §4.5 | 落实，位置待用户 |
| E6 原项目只读 | §4.6 | 落实 |

## 六、D1—D16

| 决策 | 状态 | V4 处理 |
|---|---|---|
| D1 | 待批准 | 不选 A/B；独立验证 |
| D2 | 待批准 | 戳位置待定 |
| D3 | 已批准 | §3.1；256/64 MiB/64 KiB；不反饥饿 |
| D4 | 已批准 | §3.2、§10.3；公式/一次重试/累计 50% |
| D5 | 待批准 | 未批不做 UI |
| D6 | 按 M6 必修 | §8.10；不扩 capture-engine/验证 |
| D7 | 待批准 | 未批不筛退休 |
| D8 | 待批准 | 未批不记通过 |
| D9 | 待批准 | D9-deferred |
| D10 | 已批准 | §3.3；九字段 |
| D11 | 待批准 | §14.4；拒写检测 |
| D12 | 已批准 | §3.4、§15 |
| D13 | 待批准 | 整树归档 |
| D14 | 已批准 | §3.5、§4 |
| D15 | 已批准 | §3.6 |
| D16 | 待批准 | 未批不改造脚本 |

## 七、本轮声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第四轮独立审查。**
