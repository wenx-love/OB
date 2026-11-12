# OB-Recover Phase 4.7 Worker 整改方案 V5（正式候选）

> **文档性质：** 以 V4 正式候选为基础、按 Codex 第四轮独立审查（`ade4cb3b…`）完成 R01、R05 设计闭合与 Phase 0 书面准入补齐的 V5 正式候选。V4、V3、V2、V1、原始方案、四轮审查报告和全部历史证据一律保留，不覆盖、不改写。
>
> **本轮边界：** 只做文档整改。没有修改 OB-Recover 源码、配置、测试、构建产物或历史验收证据；没有运行 Vitest、`tsc`、构建、浏览器或 L1；没有修改 ACL；没有创建 `D:\P47RUN`；没有开始 Phase 0。
>
> **输入校验（均 MATCH）：**
>
> - `PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md`：59954 字节，1002 行，`a5d2d9b2fa124ea89987cf1c3f4583ea6afab1ab364155fa4a33e8e0f00355b3`
> - `PHASE4.7-V4-CODEX-FINDINGS-TRACEABILITY.md`：9945 字节，108 行，`258a8d3fcc795ad3e3aa466347169a77d337658fe5dd725b4457dcd43467b6f8`
> - `PHASE4.7-V4-SELFCHECK.md`：5588 字节，61 行，`a162b0a34399eef072562fc6e8ae1f0c4358f7fd5dcf5b6ec5cd089dc5128df8`
> - `CODEX-P47-V4-FOURTH-INDEPENDENT-REVIEW.md`：28193 字节，345 行，`ade4cb3b1336b545955fbe6f3955a2c0a573d0ac22b57748a8dba2edf96195dc`
>
> **证据标签：** `CONFIRMED` = 正文/源码/条款对照的直接支持；`INFERENCE` = 由设计推得的风险；`UNVERIFIED` = 未取得实测；`UNKNOWN` = 根因不明。所有“将/必须/应”都是执行要求，不是已发生结果。

---

## 一、版本关系与修订目标

### 1.1 与旧版的关系

| 文件 | 处置 |
|---|---|
| 原始方案、`rebuilt.md`、第一/二/三/四轮审查报告、V2/V3/V4 及其追溯与自检 | 全部保留，不改 |
| 本文件、V5 追溯表、V5 自检 | 新建；V5 作为第五轮审查对象 |

### 1.2 第四轮结论与 V5 定位

第四轮结论为 **APPROVED WITH CONDITIONS**：V4 可在补齐两项 Phase 0 书面条件后申请启动“仅限基线、隔离初始化、工具自测及副本对照”的 Phase 0；不是批准全流程实施。

第四轮按更严格口径重评：**0 CLOSED / 23 PARTIAL / 2 OPEN**，OPEN 为 **R01、R05**。V4 的“11 CLOSED”不被接受，因为设计完成但未动态验证的项目也必须记 PARTIAL。

V5 只做四件事：

1. 用统一 `finalizeRequest` 与逐路径矩阵闭合 R01 的双 Promise 取消/早期终态。
2. 恢复 V3 的无损源码身份、完整缓存键与非 force 去重规范，闭合 R05。
3. 补齐 Phase 0 的检测器自测顺序与禁止区读取判据。
4. 修正第四轮指出的 currentState 作用域、R16 纪元/逐卡 commit/零候选、R18 deadline 优先级、旁清单不得写入冻结 baseline 等 P1 条款。

**V5 状态：** 第四轮 0/23/2 → V5 **0 CLOSED / 25 PARTIAL / 0 OPEN**。R01、R05 从 OPEN 降为 PARTIAL（设计闭合，未实测）；不升 CLOSED。0 CLOSED 是严格口径的结果，不是设计回退。

---

## 二、第四轮问题与 V5 响应

| 第四轮问题 | V5 位置 |
|---|---|
| R01：deferred/retry-pending 取消未结束 resultReady；早期终态缺双 Promise 规则 | §5 `finalizeRequest` + 逐路径矩阵 |
| R05：V4 丢失 V3 无损身份/完整缓存键/非 force 去重 | §8.4 身份、缓存键、去重表完整恢复 |
| R16：旧纪元复用、逐卡 commitSeq、零候选自证 | §7 增加 pageEpoch/sessionNonce/commitToken、逐卡校验、零候选独立 token |
| R18：window-deadline 未进优先级、render-unverified 缺失、错误码当前/历史混用 | §10.5 完整优先级与错误码路由 |
| R13：completion 强绑脚本 currentState 与“旧请求不得覆盖”冲突 | §9.3 逻辑请求 state 与脚本 currentState 分离 |
| R15：旁清单写入冻结 baseline 冲突 | §12.2 改 append-only 信任锚目录 |
| E1：检测器自测与 M0 顺序冲突 | §4.1 检测器先自测，再权威 M0 |
| E4：禁止区读取“有日志即不失败” | §4.4 实际读取成功即 FAIL |
| R03：`ok:false` 可能代表内部异常；恢复探针超时未定义 | §6 健康回复限定 + 探针超时 |
| R19：schema 字段混入替换概念、schemaHash 未定义 | §13.4 真实类型/包络/hash 规则 |

---

## 三、已批准决策（不得重开）

沿用 V4 §3，一字不改：

- **D3：** deferred ≤256 条；源码累计 ≤64 MiB（67,108,864 字节）；≤64 KiB（65,536 字节）优先；第四态；只持引用；显式取消/纪元结算；禁止静默丢弃；严格小脚本优先，不增加 aging。
- **D4：** `clamp(120s + 1.0ms × UTF-8 字节数, 5min, 45min)`；测量前登记、测量后不改；最多自动重试 1 次；50% 分子为累计执行时间；看门狗不计入熔断。
- **D10：** 仅 `?obTest=1`；九个元数据字段；逐脚本数组；无源码/候选/位置；无生产全文导出。
- **D12：** 工作副本 + 一次性提升；逆映射/碰撞/逐字节；最终树与产物一致；`dist` 无绝对路径；戳只记输入哈希 + Vite 版本。
- **D14：** `D:\P47RUN\<run>`；Admin/SYSTEM 完全控制；沙箱组只读；关闭继承；读回；Codex 读/写哨兵；读不到不扩权；第二归档用户指定。
- **D15：** 每阶段静默窗口起止；不写原项目/运行根；未知变化 `source-unknown`；W2-B 单独授权。
- **D6：** 仅身份/纪元守卫；不扩展 capture-engine 或验证规则。
