# Phase 4.7 V5 文档级自检

> **性质：** 只做文档层检查。没有运行项目代码、测试、`tsc`、构建、浏览器或 L1；没有修改 ACL、`dist`、历史证据或 `D:\P47RUN`。
>
> **输入：** V4 候选 `a5d2d9b2…`；V4 追溯 `258a8d3f…`；V4 自检 `a162b0a3…`；第四轮审查 `ade4cb3b…`；全部 MATCH。
>
> **本轮产物：**
>
> | 文件 | 字节 | 行数 | SHA-256 |
> |---|---:|---:|---|
> | `PHASE4.7-WORKER-REMEDIATION-PLAN-V5-CANDIDATE.md` | 71817 | 1140 | `4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9` |
> | `PHASE4.7-V5-CODEX-FINDINGS-TRACEABILITY.md` | 9559 | 107 | `1b29b249b232cc5ee74d3cbd5f6b2b0441d6d0d9b4e44fe8b590520ca496a705` |
> | `PHASE4.7-V5-SELFCHECK.md`（本文件） | 见交付回复 | — | 文件不能包含自己的哈希 |
>
> 行数按 PowerShell `Get-Content` 计数；末尾换行可能造成 1 行差异，以字节与哈希为准。

## 一、16 项检查

| # | 检查项 | 结果 | 对应章节 | 依据 | 尚未解决的限制 |
|---|---|---|---|---|---|
| 1 | R01 所有终态是否统一结算双 Promise | PARTIAL | §5 | `finalizeRequest`：未交付 resultReady 则 resolve 结果/错误，已交付不改写；20 行逐路径矩阵；清 ack/等待者/索引；旧请求不改写脚本状态 | 未实现；未跑并发取消/提交超时/故障注入；不能升 CLOSED |
| 2 | R05 无损身份/缓存键/去重是否恢复 | PARTIAL | §8.4 | SourceIdentityV1（UTF-16LE+原串全等）；CacheKeyV1（page/session/scriptId/URL/源码/版本/选项）；ActiveKeyV1；去重表 A—G；force 永不合并 | 未实现；未跑孤立代理项/并发/缓存边界；不能升 CLOSED |
| 3 | R16 渲染是否带请求来源与零候选规则 | PARTIAL | §7 | commitToken（epoch+sessionNonce+commitSeq）；逐卡 token；零候选独立 token；tick 完整快照后发布；八反例 | 未实现；测试属性需 Phase 2/4 范围接受；不能升 CLOSED |
| 4 | R18 deadline 是否穷尽且优先级正确 | PARTIAL | §10.5 | 18 级优先级；window-deadline/render-unverified/commit-timeout；当前尝试错误码；目标/全 run 终点分离 | 未实现纯函数/真机；不能升 CLOSED |
| 5 | E1 检测器是否先于权威 M0 | PASS | §4.1、§17.1 | 检测器初始化/完整性/守卫/假树/拒写/禁止读/子进程通过后，才生成权威 M0/快照/副本 | 实际 Phase 0 未执行 |
| 6 | E4 禁止区读取是否“成功即失败” | PASS | §4.4 | 内容读取判定（API/FD/复制源/链接/子进程）；目录元数据不算内容读；禁止区读取成功即 FAIL，日志不豁免；允许读仅清单/归档工具 | 实际探针未跑；原生不可观测限制 |
| 7 | E3 写入范围/预期意外/归因是否修正 | PASS | §4.3、§14.2—14.3 | 白名单；每命令可写路径；预期探针 vs 意外写入；删除“差异已归因即可通过”；实质差异阻止 | 实际探针未跑 |
| 8 | E2/E5/E6 是否保留 | PASS | §4.2、§4.5、§4.6 | 三副本同源隔离；baseline/第二归档/trust；原项目只读 | 第二归档位置待用户 |
| 9 | R01—R25 状态是否按严格口径 | PASS | 追溯表 §一/§二 | 0 CLOSED / 25 PARTIAL / 0 OPEN；R01/R05 为 PARTIAL，不是 CLOSED | 未动态验证；0 CLOSED 是口径结果 |
| 10 | D3/D4/D10/D12/D14/D15 是否保持 | PASS | §3、§18 | 256/64 MiB/64 KiB；固定公式/一次重试/累计 50%；D10 九字段；D14 `D:\P47RUN`；D15 静默 | 未改批准值 |
| 11 | 待批准决策是否仍待批 | PASS | §18、§17.9 | D1/D2/D5/D7/D8/D9/D11/D13/D16 待批；D6 仅身份/纪元守卫 | W2-B/第二归档待用户 |
| 12 | currentState 作用域是否与旧请求分离 | PASS | §9.3 | 逻辑请求 state 与脚本 currentState 两级；只有最新 requestSeq 更新脚本状态；旧 completion 不改写 | 未实现/未跑 force 并发 |
| 13 | R15 旁清单是否不再写冻结 baseline | PASS | §12.2 | 旁清单写 `<run>\trust\build\<id>`，append-only；baseline 只读；先核旁清单自身哈希 | 未实际构建 |
| 14 | R19 两 schema 是否分开 | PASS | §13.4—13.5 | DiscoveryResultV1 vs CommittedCandidateSetV1；真实类型/包络/hash；双哈希；降级标注 | 未实现/未跑矩阵 |
| 15 | Source Integrity 与 SRR 是否恢复原口径 | PASS | §11 | 三处原始源码哈希；SRR=SR/R_neg 按参考位置；FR 四项；n/a 不自动通过 | 实际指标未跑 |
| 16 | 是否存在未经批准的新增决策/推测当事实 | PASS | §19、§20、全文 | 不增加反饥饿；不给 Codex 写权；D6 限定；R01/R05 未写 CLOSED；UNVERIFIED 清单 | 个别历史事实依赖既有证据 |

## 二、统计

| 统计 | 结果 |
|---|---|
| 自检 PASS | 12 |
| 自检 PARTIAL | 4（R01、R05、R16、R18） |
| 自检 FAIL | 0 |
| R CLOSED | 0 |
| R PARTIAL | 25 |
| R OPEN | 0 |
| E1—E6 落实 | 6/6（实际验证仍 UNVERIFIED） |
| 新文件覆盖旧文件 | 0 |

## 三、结论

V5 闭合了 R01、R05 的设计缺口：所有终态统一走 `finalizeRequest`，双 Promise 各自结算；恢复 UTF-16LE 无损身份、完整缓存键与非 force 去重。R01、R05 只从 OPEN 降为 **PARTIAL**，不升 CLOSED；R16、R18 的设计修补也仍为 PARTIAL。

R 统计为 **0 CLOSED / 25 PARTIAL / 0 OPEN**：CLOSED 为 0 是第四轮“设计完成但未动态验证仍 PARTIAL”的严格口径，不是设计回退；OPEN 为 0 只表示没有保留可直接构造的设计矛盾。

## 四、声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第五轮独立审查。**
