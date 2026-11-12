# OB-Recover Phase 4.7：Phase 0 V6 未决清单

日期：2026-11-11。范围：V6 启动契约的未决项与第八轮新增项。不关闭 R 系列，不代批决策，不把 UNVERIFIED 写成 PASS。

分类：**启动输入**（缺一不运行 C00）、**Phase 0 内验证**（授权后实测）、**出口输入**（结束前满足）、**规格待修**（对应产品阶段前）、**实现待交付**（工具源码）。

| ID | 未决项 | 分类 | 状态 | 责任/触发 | 说明 |
|---|---|---|---|---|---|
| U01 | 发布包（20 payload）与批准 manifest SHA-256 未提供 | 启动输入 | OPEN | 用户；C00 前 | 不得自造、下载或取 ORIGINAL `node_modules` |
| U02 | 管理员 SID 与账户名未经启动批准记录确认 | 启动输入 | OPEN | 用户；C00/C02 前 | 本机解析值；不得用组 SID |
| U03 | SECOND_ARCHIVE 未绑定 | 出口输入 | OPEN | 用户；C18-BIND 前 | 未绑定 → `disabled-unbound`，C18 三连跳过，只能 `exit-not-met` |
| U04 | R05 去重/身份规格冲突 | 规格待修 | OPEN | Phase 1 前 | Phase 0 不修产品 |
| U05 | R16 DOM token 与 commitSeq 冲突 | 规格待修 | OPEN | Phase 4 前 | 同上 |
| U06 | R01 20 行矩阵 | Phase 0 内验证（Phase 1 前补齐） | PARTIAL | Phase 1 | 夹具/断言/资源计数未完成 |
| U07 | D1/D2/D5/D7/D8/D9/D11/D13/D16 未批准 | 决策 | OPEN | 用户 | 不代批 |
| U08 | W2-B 执行者/独立写授权 | 决策 | OPEN | 用户 | 不执行 |
| U09 | L1 根因 | Phase 0 内观察 | UNVERIFIED | 保留未知 | 预算 100/已用 17/剩余 83 |
| U10 | 真实 ACL/继承/Codex 有效访问 | Phase 0 内验证 | UNVERIFIED | C02/C03 | 单哨兵不能推广 |
| U11 | 三副本物理独立/硬链接/缓存 | Phase 0 内验证 | UNVERIFIED | C09 | cwd 不同不等于隔离 |
| U12 | 工具实现与真实子命令 | 实现待交付 | UNVERIFIED | C04—C20 | 注册表不内置工具哈希 |
| U13 | 审计实现/独占/flush/并发 | 实现待交付 | UNVERIFIED | C06/C19 | 规范与向量不等于实现 |
| U14 | ADS/USN/元数据覆盖 | Phase 0 内验证 | UNVERIFIED | C07/C08/C17 | 未知变化不按通过 |
| U15 | C03 relay 来源不可由 OS 证明 | 已知限制 | UNVERIFIED | C03 报告 | 固定披露 |
| U16 | 原生/FD/链接/子进程绕过 Node 守卫 | Phase 0 内验证 | UNVERIFIED | C06/C10 | C06 必须验证已登记机制 |
| U17 | dispatcher 自读与 check-to-execute 稳定性 | 实现待交付 | UNVERIFIED | 工具源码审查 | V6 只定义 `FileShare.Read`、复算与 ACL 依赖；剩余窗口未消除 |
| U18 | C10 真实 fork fixture 与产品报告写许可的运行时确认 | Phase 0 内验证 | UNVERIFIED | C10-P | 8 条 `target_argv` 已登记，未运行 |
| U19 | 祖先目录重解析检查在 PowerShell 5.1 的实际行为 | 实现待交付 | UNVERIFIED | C00/C05 | 仅语法解析通过 |

## 第八轮发现的处置状态

| 发现 | 契约状态 | 实现/运行 |
|---|---|---|
| N01 allow/deny 冲突 | 已修（精确 deny + 分层） | 未运行 |
| N02 control 读/分片/父目录 | 已修（JSON 补全、31 列、audit-part） | 未运行 |
| N03 产品报告/tmp | 已修（vitest.json、RUN/COPY 二分） | 未运行 |
| N04 向量/漏 LF | 已修（V6 向量 + 12 负例） | 未运行 |
| N05 genesis 计数 | 已修（C01 create+append，109/103） | 未运行 |
| N06 C19 截止点/读范围 | 已修（前一 close、OUT 全树） | 未运行 |
| N07 skip/abort/after | 已修（C18-BIND、双顺序、10 状态） | 未运行 |
| N08 C10 argv | 已修（8 条 target_argv） | 未运行 |
| N09 C03 期限/可信加载 | 已修（300 s、自读、祖先检查） | 未运行 |
| N10 自检断言 | 已修（1761 项，逐列/负例/双计划） | 未运行 |
| N11 父 ACL/记录 | 部分：父目录责任已写明，C02 仍只递归 RUN | 未运行 |

## 不得声称

- 不得把第 2—6 节的机械检查称为动态验证。
- 不得把 `complete` 之外的任何状态统计为成功。
- 不得在 C18 未绑定时宣布归档通过。
- 不得以 V6 文档替代发布包、ACL、真实 fork 或审计实现。
