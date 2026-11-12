# OB-Recover Phase 4.7：V8 N01—N12 追溯表

日期：2026-11-11。状态定义：CLOSED = 设计、代码、静态验证与动态验证均完成；PARTIAL = 设计/代码/静态验证已完成，运行时责任未交付或未验证；OPEN = 仍有已知设计缺陷。第十轮统计为 0 CLOSED / 5 PARTIAL / 7 OPEN。

## 1. 总表

| 项 | 第十轮 | V8 | 静态证据 | 仍缺 |
|---|---|---|---|---|
| N01 权限双向交集 | PARTIAL | PARTIAL | 检查器双向包含，0 交集；ACL 元数据写例外被显式建模 | 真实路径解析、重解析/硬链接、guard 运行 |
| N02 self-read / FileShare | PARTIAL | PARTIAL | 入口自读=`entry_path`；检查器逐执行断言 | 真实句柄生命周期、装载到执行窗口 |
| N03 C06 policy/guard | PARTIAL | PARTIAL | policy 与摘要存在；preload 字段与 64 hex 校验；guard policy 摘要由生成侧绑定 | guard 运行实现 |
| N04 审计角色/目录 | OPEN | PARTIAL | C01 genesis 新增 `AUDIT\C01`；检查器覆盖 genesis 与 participant；control 读本段 | 真实目录创建与 ACL |
| N05 环境/dist/temp | OPEN | PARTIAL | 9 runner 的 `RUN\tmp` 读+写；产品 TEMP 分离；检查器从 env 反查同层授予；dist 分片登记 | 真实子进程 TEMP、产品写入 |
| N06 validator/向量 | OPEN | PARTIAL | 字段/角色/权限/因果/物理字节/封存全量规则；35 负例单点；57 正例 | 真实 writer 的部分写与恢复解析 |
| N07 安全优先级 | PARTIAL | PARTIAL | 每原因 `code/class/trigger`；检查器拒绝非法 trigger；矩阵 security 一律 halt-all | 分类执行器（dispatcher 内） |
| N08 依赖闭包 | OPEN | PARTIAL | `ok/terminal/recorded/settled`；失败目标 A 必跑；C10-P 精确 24 项 skip；矩阵 306 场景 | 真实 chain 写入与 skip 记录 |
| N09 中止/封存 | OPEN | PARTIAL | 封存函数六模式；late security=aborted；early fatal=degraded-prefix；open tail 由 SEAL 描述 | 真实封存写入、断电恢复 |
| N10 绑定交接 | OPEN | PARTIAL | 唯一常量；四个消费者精确读；路径一致性检查；`binding_handoff` 由常量生成 | CreateNew/摘要复核/父目录替换 |
| N11 对象/类型 | PARTIAL | PARTIAL | C04 空根与 16 文件分开；ML 为 map-list；检查器断言 | CreateNew/映射执行 |
| N12 发布/回滚 | OPEN | PARTIAL | release+backup+journal+pointer+postverify+recover；11 场景实验室；回滚失败退出 3 | 真实磁盘错误/断电/外部杀死 |

统计：**0 CLOSED / 12 PARTIAL / 0 OPEN**。OPEN 归零只表示“已知设计缺陷已落到代码与静态检查”，不表示运行通过。

## 2. 关键修复位置

| 编号 | 文件/字段 | 具体变化 |
|---|---|---|
| N04 | `p0v8-build.cjs` genesis 分支 | `control_writes` 插入 `AUDIT\C01` `dir-create-if-absent`；`p0v8-check.cjs` 对 genesis 与 participant 统一断言父目录/段目录/同段读取 |
| N05 | `p0v8-spec.cjs` 9 个 TARGETS | 每个 `outputs` 增加 `RUN\tmp` `TW`，`inputs` 增加 `RUN\tmp` 子树；`p0v8-check.cjs` 反查 TEMP |
| N06 | `p0v8-check.cjs` `validateEvents`/`validateChain`/`validateSeal` | 闭合字段、角色、rule_ref 解引用、deny 优先、durable/bytes、counts、skip 因果、封存分区 |
| N08 | `p0v8-spec.cjs` `requires` / `p0v8-flow.cjs` | `terminal` 与 `recorded` 分离；C17/M1/C19/REPORT 用 `recorded`；C10-P 失败时 B/T/A 全部跳过 |
| N09 | `p0v8-flow.cjs` `mode` 计算 | 六模式函数；`seal_failed`/`chain_broken`/`no-chain` 优先；late security=aborted |
| N10 | `p0v8-lib.cjs` `P.BINDING_FILE` | 唯一常量；spec/build/check 全部派生；四个消费者读登记 |
| N12 | `p0v8-publish.cjs` | 不可变 release、备份、journal、单指针、提交后复核、recover、rollback-failed |
