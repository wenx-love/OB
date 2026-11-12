# OB-Recover Phase 4.7：V9 N01—N12 追溯表

日期：2026-11-12。状态定义：CLOSED = 设计、代码、静态验证与动态验证均完成；PARTIAL = 设计/代码/静态验证已完成，运行时责任未交付或未验证；OPEN = 仍有已知设计缺陷。第十一轮统计为 **0 CLOSED / 5 PARTIAL / 7 OPEN**。

## 1. 总表

| 项 | 第十一轮 | V9 | V9 证据 | 仍缺 |
|---|---|---|---|---|
| N01 读权限双向交集 | PARTIAL | PARTIAL | 双向包含 0 交集；ACL 元数据写例外显式建模 | 真实路径解析、重解析/硬链接、guard 运行 |
| N02 trusted 加载/自读 | OPEN | PARTIAL | F05 修正 source/staged 根；全部 load_files 进入 trusted 读取；入口自读=entry_path | 真实 FileShare.Read、装载窗口 |
| N03 C06 policy | PARTIAL | PARTIAL | policy 与摘要存在；F07 修正 preload 身份校验 | guard 运行实现 |
| N04 审计目录/角色 | PARTIAL | PARTIAL | C01 `AUDIT\C01`；genesis/participant 统一断言；control 读本段 | 真实目录创建与 ACL |
| N05 TEMP/产品环境 | PARTIAL | PARTIAL | 9 runner `RUN\tmp` 读写；产品 TEMP 分离 | 真实子进程 TEMP、隔离 |
| N06 审计 validator | OPEN | PARTIAL | F07/F08：op 权限、layer 原始身份、intent 配对、aborted after、policy 身份、seal 跨模型；41 负例 | 真实 writer 部分写/恢复 |
| N07 安全分类 | OPEN | PARTIAL | F03：57 个 reason 精确 trigger 表；C07 完整性失败 security；stop 单调 | dispatcher 内分类执行器 |
| N08 依赖与失败模型 | OPEN | PARTIAL | F01/F02/F04/F06：状态封闭集合、no-chain 0 记录、after 强制、optional 输入、复合场景 | 真实 chain/skip 写入 |
| N09 seal 模式/早期失败 | OPEN | PARTIAL | F01：sealed-full 允许失败但 complete 严格；no-chain/非链记录归零；open tail 描述 | 真实封存写入、断电恢复 |
| N10 绑定消费 | OPEN | PARTIAL | F06：optional 传递；唯一路径、四个消费者、失败报告路径 | CreateNew/摘要复核/父目录替换 |
| N11 CreateNew/map 类型 | PARTIAL | PARTIAL | C04 空根/16 文件分开；ML=map-list | 真实 CreateNew/映射执行 |
| N12 发布/回滚 | OPEN | PARTIAL | F09—F13：undo、LOCK、事务闸门、四方核验、短写、逐场景证据 | 真实磁盘错误/断电/外部 kill/多写者 |

统计：**0 CLOSED / 12 PARTIAL / 0 OPEN**。OPEN 归零只表示第十一轮指出的设计缺陷已落到代码与静态/隔离检查，不表示运行通过。

## 2. 与 F01—F14 的关系

| N | 对应 F | 关键变化 |
|---|---|---|
| N02 | F05 | source/staged 加载根与 load_files 责任 |
| N06 | F07、F08 | preload policy 身份、op 权限、配对、aborted after、seal 跨模型 |
| N07 | F03 | 精确 reason→trigger，删除子串匹配 |
| N08 | F01、F02、F04、F06 | 状态集合、no-chain、stop 单调、optional |
| N09 | F01、F02 | sealed-full 语义、记录计数 |
| N10 | F06 | optional 报告路径 |
| N12 | F09—F13 | undo、锁、事务闸门、四方核验、证据 |

逐项根因与验证见 `PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md`。
