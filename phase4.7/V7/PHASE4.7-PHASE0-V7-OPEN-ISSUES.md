# OB-Recover Phase 4.7：Phase 0 V7 未决清单

日期：2026-11-11。范围：V7 契约未决与第九轮残余。不关闭 R 系列，不代批决策，不把 UNVERIFIED 写成 PASS。

分类：启动输入 / Phase 0 内验证 / 出口输入 / 规格待修 / 实现待交付。

| ID | 未决项 | 分类 | 状态 | 责任/触发 | 说明 |
|---|---|---|---|---|---|
| U01 | 发布包（20 payload）与批准 manifest SHA-256 | 启动输入 | OPEN | 用户；C00 前 | 不得自造或取 ORIGINAL |
| U02 | 管理员 SID 与账户名确认 | 启动输入 | OPEN | 用户；C00/C02 前 | 本机解析值不等于批准 |
| U03 | SECOND_ARCHIVE 绑定 | 出口输入 | OPEN | 用户；C18-BIND 前 | 未绑定只可 exit-not-met |
| U04 | R05 规格冲突 | 规格待修 | OPEN | Phase 1 前 | 不修产品 |
| U05 | R16 规格冲突 | 规格待修 | OPEN | Phase 4 前 | 不修产品 |
| U06 | R01 20 行矩阵 | Phase 0 内验证 | PARTIAL | Phase 1 | 未运行 |
| U07 | D1/D2/D5/D7/D8/D9/D11/D13/D16 | 决策 | OPEN | 用户 | 不代批 |
| U08 | W2-B | 决策 | OPEN | 用户 | 不执行 |
| U09 | L1 根因 | 观察 | UNVERIFIED | 保留未知 | 预算 100/已用 17/剩余 83 |
| U10 | 真实 ACL/Codex 有效访问 | Phase 0 内验证 | UNVERIFIED | C02/C03 | 单哨兵不能推广 |
| U11 | 三副本物理独立/缓存 | Phase 0 内验证 | UNVERIFIED | C09 | 未运行 |
| U12 | 运行时工具源码 | 实现待交付 | OPEN | 交付后独立审查 | dispatcher/verifier/audit/guard/业务工具全部缺失 |
| U13 | 审计实现/独占/flush/恢复 | 实现待交付 | UNVERIFIED | C06/C19 | 规范不是实现 |
| U14 | ADS/USN/元数据覆盖 | Phase 0 内验证 | UNVERIFIED | C07/C08/C17 | 未运行 |
| U15 | C03 relay 来源 | 已知限制 | UNVERIFIED | C03 报告 | 固定披露 |
| U16 | 原生/FD/链接/子进程 | Phase 0 内验证 | UNVERIFIED | C06/C10 | guard 未交付 |
| U17 | dispatcher 自读与 TOCTOU | 实现待交付 | UNVERIFIED | 工具审查 | FileShare.Read 只缩小窗口 |
| U18 | C10 fork fixture 运行时确认 | Phase 0 内验证 | UNVERIFIED | C10-P | argv 已登记，未运行 |
| U19 | 祖先重解析检查实际行为 | 实现待交付 | UNVERIFIED | C00/C05 | 仅语法解析 |
| U20 | segment_skip 的运行时实现与链尾计算 | 实现待交付 | UNVERIFIED | dispatcher/C19 | 跳过会改变实际记录数 |
| U21 | degraded-prefix 封存的缺失项表达 | 实现待交付 | UNVERIFIED | C20-SEAL | 只定义规则，未实现 |
| U22 | 生成器发布窗口非事务性 | 已知限制 | PARTIAL | 交付流程 | 已用回滚；跨文件重命名窗口仍存在 |

## 第九轮 N01—N12 残余

| 项 | 契约 | 运行时 |
|---|---|---|
| N01 双向交集 | 0 | guard 未实现 |
| N02 self-read | 58/58 对应 | 加载字节稳定性未证 |
| N03 C06 guard | policy 已生成 | 未运行 |
| N04 角色/目录 | 已登记 | 依赖 dispatcher |
| N05 产品环境/dist | 合同已分层 | 子进程继承未证 |
| N06 向量/验证器 | 静态通过 | 运行时 validator 未交付 |
| N07 安全优先级 | 已绑定 | 错误码映射未实现 |
| N08 依赖闭包 | 已定义 | skip 记录未实现 |
| N09 封存模式 | 四模式 | SEAL 未交付 |
| N10 绑定交接 | 文件+记录 | 动态路径未运行 |
| N11 类型/对象 | 已修 | staging 未运行 |
| N12 原子发布 | 已实现 | 故障注入未做 |

## 不得声称

- 不得把 720/75 项静态检查称为动态验证。
- 不得把跳过统计为成功，或把 degraded 封存称为完整封存。
- 不得在运行时工具缺失时宣称守卫/审计已实现。
