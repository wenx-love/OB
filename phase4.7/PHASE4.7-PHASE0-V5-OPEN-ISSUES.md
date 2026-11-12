# OB-Recover Phase 4.7：Phase 0 V5 未决清单

日期：2026-11-11。范围：仅 V5 启动契约的未决项。本清单不关闭 R 系列，不代批任何决策，不把 UNVERIFIED 写成 PASS。

分类：**启动输入**（缺一不运行 C00）、**Phase 0 内验证**（授权后必须实测）、**出口输入**（Phase 0 结束前必须满足）、**规格待修**（对应产品阶段前）。

| ID | 未决项 | 分类 | 状态 | 责任/触发 | 说明 |
|---|---|---|---|---|---|
| U01 | ReleaseSourceRoot 发布包（20 个 payload）与批准 manifest SHA-256 未提供 | 启动输入 | OPEN | 用户；C00 前 | 不得自造、下载、从 ORIGINAL `node_modules` 取；缺失即 fail closed |
| U02 | 管理员 SID 与账户名未经用户启动批准记录确认 | 启动输入 | OPEN | 用户；C00/C02 前 | 本机只读解析值 `S-1-5-21-…-500`；不得用 `S-1-5-32-544` |
| U03 | SECOND_ARCHIVE 未绑定 | 出口输入 | OPEN | 用户；C07-B-C18-E01 前 | 未绑定 → C18 三连跳过、`c18_state=disabled-unbound`、只能 `exit-not-met` |
| U04 | R05 去重/身份规格冲突 | 规格待修 | OPEN | Phase 1 开始前 | `placeholderSeq` 与非 force 同身份合并；Phase 0 不修产品 |
| U05 | R16 DOM 容器 token 与 `commitSeq` 高水位冲突 | 规格待修 | OPEN | Phase 4 正式测量前 | Phase 0 不修产品 |
| U06 | R01 20 行 finalize/cancel/cache/timeout 矩阵 | Phase 0 内验证（Phase 1 前补齐） | PARTIAL | Phase 1 前准备、Phase 1 内运行 | 夹具、断言、计时、资源计数未完成 |
| U07 | D1/D2/D5/D7/D8/D9/D11/D13/D16 未批准 | 决策 | OPEN | 用户 | 本轮不代批、不推断默认值 |
| U08 | W2-B 执行者与独立写授权未定 | 决策 | OPEN | 用户 | 不执行；W2-A 只读不等于实跑 |
| U09 | L1 根因（connect-timeout） | Phase 0 内观察 | UNVERIFIED | 保留未知 | 预算 100/已用 17/剩余 83；不归因到特定账户 |
| U10 | 真实 ACL：继承关闭、ACE 读回、Codex 有效访问 | Phase 0 内验证 | UNVERIFIED | C02/C03 | 单哨兵拒写不能推广为“任何目录不可写” |
| U11 | 三副本物理独立、硬链接/重解析、共享缓存/依赖身份 | Phase 0 内验证 | UNVERIFIED | C09 | cwd 不同不构成隔离证明 |
| U12 | 工具实现与真实子命令（dispatcher/verifier/audit/guard/tools） | Phase 0 内验证 | UNVERIFIED | C04—C20 | 注册表不内置工具哈希，全部来自 manifest |
| U13 | 审计规模、写入频次、分片并发、独占打开与 flush 行为 | Phase 0 内验证 | UNVERIFIED | C06/C19 | 规范存在不等于实现正确 |
| U14 | ORIGINAL 的 ADS/USN/元数据覆盖范围 | Phase 0 内验证 | UNVERIFIED | C07/C08/C17 | 未知变化不得按通过处理 |
| U15 | C03 人工 relay 无法从 OS 层证明来源 | 已知限制 | UNVERIFIED | C03 报告 | 固定披露，不写成“已证明实时性” |
| U16 | 原生/FD/链接/任意子进程绕过 Node 守卫 | Phase 0 内验证 | UNVERIFIED | C06/C10 | `NODE_OPTIONS` 只约束 Node；C06 必须验证已登记机制 |

## 说明

1. U01、U02 未完成时**不运行 C00**；U03 未完成时**不得宣布 Phase 0 完成**。
2. U04/U05 属产品规格，Phase 0 不整改、不借此关闭 R 项。
3. U09—U16 的动态结果只能在授权后产生；本文件不预写结果、不预标 PASS。
4. 任何“文档已闭合”的表述仅指契约，不指实现或运行。

## 与 V4 清单的差异

- V4 的 SECOND_ARCHIVE 分类冲突已消除：U03 归为**出口输入**。
- 新增 U15（relay 限制）与 U16（原生/FD 边界），对应第七轮 I 节与第六轮 B2 的遗留说明。
- 其余项保留原编号与状态，不擅自升级为 CLOSED。
