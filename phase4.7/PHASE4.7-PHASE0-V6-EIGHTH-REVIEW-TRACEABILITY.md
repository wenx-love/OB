# OB-Recover Phase 4.7：Phase 0 V6 对第八轮审查的逐项追溯表

日期：2026-11-11。性质：契约追溯，不是独立复核结论。状态列区分“契约已处置”和“实现/运行仍 UNVERIFIED”。

证据缩写：**M** = `PHASE4.7-PHASE0-START-CONDITIONS-V6.md`（行号）；**A** = `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md`（行号）；**R** = 注册表字段；**W** = TSV 列。

## 1. 第八轮总体阻断（第 15—19 行）

| 第八轮结论 | V6 证据 | 状态 |
|---|---|---|
| 16 次执行 allow 与父目录绝对 deny 冲突 | M 36—52（四层 + 精确 deny）；R `deny_read` 逐文件；检查器 16/16 | 契约已处置 |
| TSV control 读在 JSON 丢失（54 次） | M 98—108；R `reads.control`；W 第 19 列；TSV 逐字节重生成 | 契约已处置 |
| C12/C13/C16 产品写 vitest.json 无许可；C10 空 argv | M 104—106；R `product.writes`、`target_argv`（8 条） | 契约已处置 |
| 审计正例违反 schema、漏 LF、计数不一致 | M 84—96；A 59—67、85—97；向量 V6 | 契约已处置 |
| C19 截止点冲突、失败 after、C18 跳过后继 | M 110—116；R `plan.order_bound/unbound`、`C18-BIND-E01` | 契约已处置 |

## 2. Q01—Q07（第八轮 D 节）

| 项 | 第八轮缺口 | V6 证据 | 状态 |
|---|---|---|---|
| Q01 | dispatcher 自读许可、祖先检查、检查到执行稳定性 | M 54—60；R `reads.dispatcher` 含自身/依赖/node.exe；C00 祖先重解析 | 契约已处置；实现 UNVERIFIED |
| Q02 | PROBE 300 s 未登记；OBS 目录创建缺失 | M 62—74；R `deadline_seconds=300/900`、OBS 输出目录 | 契约已处置 |
| Q03 | control 读丢失、分片写、genesis 107/101 | M 76—82；A 5—30；R `audit_part_rule`；C01 create+append；109/103 | 契约已处置 |
| Q04 | 非法 ID、缺 c18、漏 LF、跨执行、假分片 | M 84—96；A 85—97；V6 向量 | 契约已处置 |
| Q05 | 产品报告、tmp 冲突、父目录、C10 argv | M 98—108；R 产品写/`RUN\tmp` vs `COPY\tmp` | 契约已处置 |
| Q06 | 截止点自引用、C19 读范围 | M 110—116；R C19 读 OUT 全树、gate 写明前一 close | 契约已处置 |
| Q07 | skip 前驱、绑定读取主体 | M 116；R `C18-BIND-E01`、双计划、双前驱 | 契约已处置 |

## 3. N01—N11（第八轮 G 节）

| 发现 | V6 证据 | 状态 |
|---|---|---|
| N01 allow/deny 重叠 | M 36—52；检查器 `no allow/deny overlap` ×58；16 staged deny 全为精确文件 | 契约已处置 |
| N02 control 读/自读/分片 | W 19/20/21 列；R `reads.control`/`audit_part_rule`；TSV 逐字节 | 契约已处置 |
| N03 产品报告/父目录/tmp | R `product.writes` 含 vitest.json；OBS/C04/C05/C08/C09/C19/REPORT 目录；tmp 二分 | 契约已处置 |
| N04 非法向量/漏 LF | 向量 ID 32 hex；c18 三字段；`jsonl`/`chain_physical`；12 负例 | 契约已处置 |
| N05 genesis 计数 | C01 `file-create`+`file-append`+summary；109/103 | 契约已处置 |
| N06 截止点/读范围 | M 110—116；R `C19-E01.reads.business` 含 OUT 子树 | 契约已处置 |
| N07 skip/abort/after | M 118—130；R 10 状态、双计划、A gate 接受 failed/aborted | 契约已处置 |
| N08 C10 argv | R `target_argv` 与 `target_argv_sha256` 8 条 | 契约已处置；执行 UNVERIFIED |
| N09 C03 期限/可信加载 | 300 s；C00 `ANC`；dispatcher `FileShare.Read` | 契约已处置；实现 UNVERIFIED |
| N10 自检断言 | `p0v6-check.cjs` 1761 项；TSV 逐字节；schema/负例/双计划 | 已执行（静态） |
| N11 父 ACL/记录 | M 139—148；C02 仍只递归 RUN；自检体积为实际值 | 部分（父目录责任已写明，操作未授权） |

## 4. P0-1—P0-4 任务验收

| 任务 | 要求 | V6 结果 |
|---|---|---|
| P0-1 | 16 条逐项核对 command/exec/argv/cwd/输入/读取/allow/deny | 变更记录第 2 节 16 行表；注册表逐执行可查 |
| P0-2 | 原始差异、修复后差异、每命令结果、无法确定项 | 54 → 0；21/21；无字段级未知 |
| P0-3 | 15 向量逐项、schema/字节/LF/哈希输入 | 变更记录第 4 节 15 行表；负例 12 |
| P0-4 | 13 类分支的状态/触发/转换/结算/事件/重试/继续/报告/完成 | 变更记录第 5 节 10 状态表；M 附录 E |

## 5. 第八轮 B 项与 R 项

| 项 | V6 状态 |
|---|---|
| B1 发布包/首次执行 | 契约保留改善；工具包仍缺，dispatcher 自读已登记；实际 UNVERIFIED |
| B2 C04 隔离 | 未变；实现未交付 |
| B3 C10 Worker | 补 3 条真实 argv；真实 fork 未运行 |
| B4 六静态目标 | 补产品 vitest.json 许可；写前 predicate 未运行 |
| B5 控制配置 | 325 字节复算一致；未运行 Vite |
| B6 身份/ACL | 未变；用户输入缺失 |
| B7 R01 | 保持 PARTIAL |
| B8 C07 边界 | A 接受失败目标；双计划；成本未测 |
| B9 审计 | control/分片/向量修正；实现未验证 |
| R01—R25 | 0/23/2 不变；R05、R16 OPEN |

## 6. 未闭合声明

本表不声称 Q01—Q07 或 N01—N11 已 CLOSED。它只给出可定位的 V6 处置；是否闭合由第九轮独立复核判定。所有“已处置”均指契约文本与机械检查，不指运行。
