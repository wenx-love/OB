# Phase 4.7 V4 文档级自检

> **性质：** 只做文档层检查。没有运行项目代码、测试、`tsc`、构建、浏览器或 L1；没有修改 ACL、`dist`、历史证据或 `D:\P47RUN`。
>
> **输入：** V3 候选 `2ed0fce1…`；V3 追溯 `f43a6a3e…`；第三轮审查 `ab92008f…`；三者均 MATCH。
>
> **本轮产物：**
>
> | 文件 | 字节 | 行数 | SHA-256 |
> |---|---:|---:|---|
> | `PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md` | 59954 | 1002 | `a5d2d9b2fa124ea89987cf1c3f4583ea6afab1ab364155fa4a33e8e0f00355b3` |
> | `PHASE4.7-V4-CODEX-FINDINGS-TRACEABILITY.md` | 9945 | 108 | `258a8d3fcc795ad3e3aa466347169a77d337658fe5dd725b4457dcd43467b6f8` |
> | `PHASE4.7-V4-SELFCHECK.md`（本文件） | 见交付回复 | — | 文件不能包含自己的哈希 |
>
> 行数按 PowerShell `Get-Content` 计数；末尾换行可能造成 1 行差异，以字节与哈希为准。

## 一、16 项检查

| # | 检查项 | 结果 | 对应章节 | 依据 | 尚未解决的限制 |
|---|---|---|---|---|---|
| 1 | R01 交付与最终结算是否真正分开 | PARTIAL | §5、§8.1—8.3 | resultReady（阶段 B）与 completion（阶段 D）分离；提交/拒绝/超时/取消/纪元/dispose 六路收尾；缓存命中无 attempt；提交超时 10s 技术参数 | 协议未实现、未跑单测/真机；`COMMIT_ACK_TIMEOUT_MS` 需 Phase 1 规格评审确认；不能升 CLOSED |
| 2 | R03 熔断计数是否可达 | PARTIAL | §6 | 仅有效健康回复清零；构造成功不清零；每次 Worker 级失败累计；3 次可达；恢复保留阈值并需健康回复 | 未注入连续崩溃；恢复探针未实测；不能升 CLOSED |
| 3 | R16 DOM 是否带请求来源 | PARTIAL | §7、§10 | 测试专用 `data-obtest-script-id/request-seq/commit-seq`；容器 tick/commit seq；七类反例；零候选/同内容刷新覆盖 | 属性未实现；若用户不接受测试专用 DOM 属性，必须 `render-unverified`，不得签发渲染通过 |
| 4 | E1 初始化循环是否消除 | PASS | §4.1 | 根/ACL 在 Phase 0 内；M0/快照/副本核对先于任何测试；出口无条件停 | 实际 ACL/Codex 读验证仍 UNVERIFIED |
| 5 | E2 三副本是否同源隔离 | PASS | §4.2 | 同一哈希快照、物理隔离、不共享可写、记录派生 | 实际副本与依赖未展开 |
| 6 | E3 写入范围/归因是否修正 | PASS | §4.3、§14.2—14.3 | 写入白名单；预期拒写 vs 意外写入；删除“差异已归因即可通过”；实质差异阻止通过 | 实际探针未跑 |
| 7 | E4 守卫矩阵是否含读/原生边界 | PASS | §4.4 | 读/写/FD/复制源/链接/原生/环境/工作进程七类；Phase 0 不启动 Chrome；原生边界明确不覆盖 | 矩阵未实测；OS 级写拒绝未假设存在 |
| 8 | E5 基线与第二归档 | PASS | §4.5 | baseline 只读；第二归档责任/位置由用户；未指定不关闭 | 位置待用户 |
| 9 | E6 原项目只读 | PASS | §4.6 | 禁止原地测试/构建/提权/关守卫/换目录；`source-unknown` 停止 | 实际执行未开始 |
| 10 | R01—R25 状态是否按第三轮重评 | PASS | 追溯表 §一/§二 | 11 CLOSED / 14 PARTIAL / 0 OPEN；R01/R03/R16 为 PARTIAL，不是 CLOSED | 第三轮 11/11/3；V4 只降 OPEN，不增加 CLOSED |
| 11 | D3/D4/D10/D12/D14/D15 是否保持 | PASS | §3.1—3.6、§18 | 256/64 MiB/64 KiB；固定公式/一次重试/累计 50%；D10 九字段；D14 `D:\P47RUN`；D15 静默 | 二进制口径为技术登记；未改批准值 |
| 12 | 待批准决策是否仍待批 | PASS | §18、§17.9 | D1/D2/D5/D7/D8/D9/D11/D13/D16 待批；D6 仅身份/纪元守卫 | W2-B/第二归档待用户 |
| 13 | gauges 与历史 counters 是否分离 | PASS | §9 | 11 态穷尽互斥；守恒式；历史 counters 独立；最新请求独占更新 | 实现/守恒测试未跑 |
| 14 | 安全指标是否恢复原口径 | PASS | §11 | FR 四项；R_pos/R_neg；SRR 按参考位置；三处 Source Integrity；n/a 不自动通过 | 实际样本指标未跑 |
| 15 | 构建产物是否要求实际 SHA | PASS | §12 | 戳仅输入哈希+Vite；旁清单含 Worker 名/文件集合/逐文件 SHA/可信锚；五负例；依赖清单 | 旁清单/依赖未生成 |
| 16 | 真实 panel 全文是否被 harness 冒充 | PARTIAL | §13.1—13.3 | 五层证明；共享 coordinator 只证明代码同一；双范围；panel 全文仍 UNVERIFIED | 未直采真实 panel 实例全文；不能写“全字段一致已验证” |

## 二、统计

| 统计 | 结果 |
|---|---|
| 自检 PASS | 12 |
| 自检 PARTIAL | 4（R01、R03、R16、真实 panel 全文） |
| 自检 FAIL | 0 |
| R CLOSED | 11 |
| R PARTIAL | 14 |
| R OPEN | 0 |
| E1—E6 落实 | 6/6（实际验证仍 UNVERIFIED） |
| 新文件覆盖旧文件 | 0 |

## 三、结论

V4 把 R01、R03、R16 的设计矛盾闭合：双 Promise 与最终结算分离、健康回复才清零熔断、DOM 带请求来源。但三者都只降到 **PARTIAL**，没有升 CLOSED；实现与动态测试仍 `UNVERIFIED`。第 16 项保持 PARTIAL：真实 panel 实例全文没有被直采证明。

R 统计为 11/14/0：CLOSED 没有增加，OPEN 降到 0 是因为三个设计矛盾已闭合，不是因为降低标准。

## 四、声明

本轮只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0；没有自动批准任何待决策项目。

**停止，等待用户与 Codex 第四轮独立审查。**
