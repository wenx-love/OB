# OB-Recover Phase 4.7：V9 自检

日期：2026-11-12。本文件描述**方法与静态/隔离事实**，不声称运行通过。最终门禁结果（checker/verifier/build/lab/determinism/hygiene）记录在 `_publish\gate.json` 与 `_publish\journal.json`；逐场景故障证据在 `_publish\lab\<run>\`。

## 1. 生成与门禁流程

1. `p0v9-build.cjs` 在内存生成 registry、TSV、vectors、全部文档、doc-src 副本与 manifest。
2. 生成器自检：权限、TEMP、审计目录、绑定、requires 状态集合、failure_modes 精确映射、矩阵摘要、protect、目录父级、optional 输入、source/staged 加载根。共 924 项断言。
3. 写入 `_publish\prestage`，运行独立 checker、PowerShell verifier、inline parser、控制配置检查、17 场景 lab；任一非 0 即停止，不写 release。
4. 用新进程重跑完整生成并逐文件比较 SHA-256；不一致即停止（`determinism`）。
5. 通过后调用 `p0v9-publish.cjs`：LOCK → 未完成事务闸门 → release → backup(txid) → 逐文件 temp+rename → CURRENT → 提交后复核。
6. 提交后再次运行 checker/verifier/hygiene；失败调用 `undo()` 显式回滚并复核旧版本；回滚失败退出 3。

## 2. 静态事实

| 项 | 值 |
|---|---|
| 命令 / 执行 / 链参与者 | 21 / 58 / 54 |
| nominal 链记录（绑定/未绑定） | 109 / 103 |
| 失败矩阵场景 | 340（含 34 个复合故障） |
| 负例 | 41 |
| 正例 | 58（含 sealed-full 带失败/跳过的正式正例） |
| 矩阵摘要 | `f1f2abc7b27f48892aac4745fca00ee149a51e3e8c543f297b8eac0bc1a641d8` |
| 向量 SHA-256 | `543580989c30ef770409c48f8fd698c2879febc8fb026dda8f2ca2b9ba725041` |
| 注册表 SHA-256 | `8bbf8b945f66e3b21d27cd4fbc57240f6d276a3aa0ff1b9228b6c73392ca8607` |
| 交付文件 | 37（13 契约 + 13 工具 + 10 doc-src 输入 + 清单自身） |

## 3. 检查器覆盖

- 58 正例的 canonical/bytes/hash 复算；分片 JSONL 物理字节复算。
- 41 负例逐条断言“恰好一个错误且等于期望码”，新增 op 越权、intent 未配对、product 引用 business rule、错误 preload policy、aborted 缺 after、sealed-full+complete+skipped。
- 340 场景独立重算并逐行比较；no-chain records=0；`sealed-full` 带失败/跳过的语义与 `complete` 严格性；复合故障 stop 单调。
- 权限：双向 allow/deny 0；TEMP 同层读写；写/保护 0（ACL 例外）；审计父目录覆盖 genesis 与 participant；绑定唯一；source/staged 加载同根；optional 输入与 producer 关系。
- 发布：CURRENT.files 重算 RID、release index 全量相等、release/物化逐字节一致、journal=verified。

## 4. 验证器覆盖

`p0v9-verify.ps1` 独立复算：向量 SHA/字节、C01 链 seq/prev/prev_file_bytes、21 命令/58 执行/109-103/58-55/340 行、58 个 argv 哈希、38 列 TSV、发布指针。`p0v9-parse-inline.ps1` 只解析两个内联脚本，不求值。

## 5. 发布与故障证据

`p0v9-lab.cjs` 17 场景逐场景保留 expected/actual/steps/前后哈希/journal/CURRENT/release 列表/代码 SHA；`gate.json` 记录 lab 报告 SHA 与 evidence_dir。覆盖：首次/幂等/确定性、stage/backup/switch/pointer/postverify 注入、回滚失败、SIGKILL、未完成事务拒绝新发布、post-gate undo、锁拒绝、短写、release/指针损坏。

## 6. 历史不变

`p0v9-hygiene.cjs` 与 checker 复算 V8 二十六份文件哈希，要求全部不变；V9 文件无 BOM、无 CR、无占位符。`p0v9-controlconfig-check.cjs` 复算 325 字节控制模板。

## 7. 明确未证明

1. 静态 schema/向量/状态机通过 ≠ 真实 writer/guard/ACL/FD 通过。
2. 故障实验室只注入进程内 throw、短写、自杀死与单写者锁；断电、磁盘错误、外部杀死、多写者竞争、目录同步的持久效果未验证。
3. 多文件发布不是单次原子提交；恢复依赖 journal+backup+recover。
4. 运行时工具、外部输入、授权均未交付；Phase 0 未启动。
