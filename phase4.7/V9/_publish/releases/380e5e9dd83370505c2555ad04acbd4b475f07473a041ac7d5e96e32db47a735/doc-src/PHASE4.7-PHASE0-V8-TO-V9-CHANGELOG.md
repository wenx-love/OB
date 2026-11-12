# OB-Recover Phase 4.7：V8 → V9 变更记录

日期：2026-11-12。输入：V8 二十六份文件（哈希见第十一轮报告）；报告 `9f9b4c7e…`。本记录只列实质变化，不复制全文。

## 1. 命名与版本

| 项 | V8 | V9 |
|---|---|---|
| 契约文件名 | `…-V8.md/tsv/json` | `…-V9.md/tsv/json` |
| registry schema | `p47-phase0-command-registry-v8` | `…-v9` |
| tool release | `p47-phase0-tool-release-v4` / `p47-phase0-v8` | `v5` / `p47-phase0-v9` |
| event schema | `p47-audit-event-v3` | `p47-audit-event-v9` |
| chain schema | `p47-chain-record-v4` | `p47-chain-record-v9` |
| summary / seal | `v3` / `v3` | `v9` / `v9` |
| vectors | `p47-audit-vectors-v4` | `p47-audit-vectors-v9` |
| 白名单列数 | 38 | 38 |
| 交付文件 | 26 | 36（13 契约 + 13 工具 + 10 doc-src） |

## 2. 执行模型与状态机（F01—F04）

- `sealed-full` 语义统一：证据完整封存，允许 failed/skipped/gate_failed；`exit_status=complete` 严格要求列表全空且 C18 bound。
- no-chain：genesis 未写或 pre-run 失败时，后续 not-started，records=0；C01 失败/孤立不产生 close；非链与 terminal 执行不产生链记录。
- 安全分类：57 个 reason 建立精确 `reason→trigger` 表，删除子串匹配；C07 的 ORIGINAL/diff/chain broken/重跑全部 security；`chain-broken` 只由 `SEC-CHAIN-MISMATCH` 触发。
- 状态集合封闭：recorded 不含 orphaned/not-started；settled 不含 not-started。
- stop 取等级 max；新增 34 个复合场景（首错+after错、双 gate、security+finalizer）。

## 3. 权限与输入（F05、F06）

- trusted 读取按 entry_mode 选择 source/staged 根；全部 load_files 进入 dispatcher 读取并带“加载前哈希”责任；C05-PRE source audit 覆盖。
- `optional_reads` 从 TARGETS 正确传递；C17 全部 OUT 根与 m1.json、REPORT cutoff、C19/SEAL binding 显式 optional；checker 验证 producer 非 ok ⇒ 输入 optional。

## 4. 审计（F07、F08）

- 向量在归一化后生成；preload 使用真实 product policy；checker 按 process_role 比较 guard/product policy。
- 新增 OP_RULES 操作-规则匹配、rule_ref 原始层、intent 恰一 result、aborted after、run-stopped 才允许 open 依赖、seal 与链尾/开放段/分区交叉验证、rename/copy src 可读、写保护、append 增量语义。
- 正例 58（含 sealed-full 带失败的正式正例）；负例 41。

## 5. 发布与恢复（F09—F13）

- 新增 `undo()`：post gate 失败显式撤销已提交事务并复核旧版本。
- 新增 LOCK 单写者锁与未完成事务闸门（`E_UNFINISHED_TX`）；txid 与 rid 分离，backup 按 txid 唯一。
- status/recover/check 四方核验：CURRENT.files 重算 RID、release index 全量相等、release 每字节、物化每字节；status 有 issue 退出 1。
- `writeDurable` 循环短写 + fsync；目录 fsync 尝试并记录；rollback 先恢复文件/指针再整体复核；abs() 拒绝越界/`..`/绝对路径。
- lab 扩至 17 场景，逐场景保留 expected/actual/steps/前后哈希/journal/CURRENT/release/代码 SHA；build 记录报告 SHA。

## 6. 生成输入（F14）

- 10 份 `doc-src` 模板进入 36 项交付与不可变 release；manifest 单列“生成输入”；checker 断言清单覆盖；构建优先从包根 `doc-src` 读取，保证仅凭交付包可复现。

## 7. 未变

- 21 命令、58 执行、54 链参与者、109/103 nominal 记录、绑定/未绑定计划长度 58/55。
- 四层权限、ORIGINAL 只读、map-list、C04 CreateNew、C06 guard、C18 只读一次环境、SECOND_ARCHIVE 外部输入。
- 产品与历史文件未修改；Phase 0 未启动。
