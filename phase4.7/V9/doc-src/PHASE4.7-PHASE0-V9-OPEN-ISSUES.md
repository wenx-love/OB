# OB-Recover Phase 4.7：V9 未解决问题

日期：2026-11-12。以下项目在 V9 中**没有**被静态修复或无法在本轮验证。不得把本清单之外的“没写”当作已解决。

## 1. 外部输入（阻塞 Phase 0）

| 项 | 状态 | 说明 |
|---|---|---|
| `D:\P47TOOLS\p47-phase0-v9` 发布包 | 未提供 | 20 个 payload 全部缺失；`RELEASE-MANIFEST.json` 及其批准 SHA-256 未提供 |
| 管理员 SID 用户确认 | 未完成 | 当前只做本地只读解析 |
| `P0_CODEX_ACCOUNT` | 未指定 | 两个候选名未二选一 |
| SECOND_ARCHIVE 绑定 | 未完成 | 第二归档路径与授权未提供 |
| 运行范围与时间窗授权 | 未提供 | 未授权任何真实执行 |

## 2. 运行时实现（全部缺失）

| 工具 | 状态 |
|---|---|
| dispatcher / verifier 运行实现 | 只有接口、入口与合同；未交付源码 |
| `p0-audit.cjs` 运行实现 | 只有规范、schema 与向量；append/lock/fsync/recover 未交付 |
| `fs-guard.cjs` 运行实现 | 只有 policy 与预载合同；未交付 |
| init/acl/stage/observe | 只有 bootstrap 接口；未交付 |
| copy/archive/product-run/neutralize/compare/index/report | 只有执行登记与接口；未交付 |
| 正式发布 manifest 与批准摘要 | 未提供 |

## 3. 动态验证（UNVERIFIED）

- 真实 `FileShare.Read`、句柄生命周期、verify→map→exec 窗口。
- 真实并发、FD 继承、硬链接、junction、8.3 别名、subst。
- 真实 ACL 设置与 SDDL 回读；C02 的递归 ACL 元数据写例外。
- 真实 writer 的部分写、append 增量语义、fsync、崩溃恢复、封存写入。
- 真实发布故障：磁盘错误、断电、外部进程杀死、多写者竞争、回滚中途失败、目录同步的持久效果。故障实验室只覆盖进程内 throw、短写、自杀 SIGKILL、单写者 LOCK。
- C18 CreateNew、摘要复核、父目录替换、归档目标读回。
- C14 map-list 展开前的零写与逐路径展开。
- 运行时安全分类执行器（N07）与真实失败升级。
- 控制层读取分片的合同是否与真实 writer 一致。

## 4. 设计上仍待明确

| 项 | 说明 |
|---|---|
| 多文件发布原子性 | 单文件 rename 原子，多文件不是；靠 journal+backup+recover+undo 修复，不声称单次原子提交 |
| 目录 fsync | Windows 上可能不支持；实现尝试并记录 `dir_sync`，不作为断电保证 |
| 共享 `RUN\tmp` | 所有 runner 共享一个 TEMP；同层可读可能暴露前序临时文件。Phase 0 接受并披露，未改 per-exec 子目录 |
| `acl-set-recursive` 例外 | C02 可遍历受保护路径修改元数据；内容保护仍成立，但真实 SDDL 行为未验证 |
| append 语义 | 规范定义 `bytes_written` 为本次增量、`after.bytes` 为最终长度；无运行证据 |
| `recorded` 消费 skip | C17/M1/C19/REPORT 接受 skip；真实报告必须把 skip 写成“未执行”，不得当成功 |

## 5. 与 R 冻结项的关系

R05、R16 仍 OPEN，R01 仍 PARTIAL；V9 没有产品实现或运行证据可以改变它们。D3、D4、D10、D12、D14、D15 未改；本轮未代批任何新决策。

## 6. 结论

V9 可以作为**第十二轮独立审查的输入**；不具备启动 Phase 0 的条件。只有完成运行时工具交付、外部输入批准与授权后的隔离动态验证，才可能改变 PARTIAL/OPEN 状态。
