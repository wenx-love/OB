# OB-Recover Phase 4.7：V8 自检

日期：2026-11-11。本文件描述**方法与静态事实**，不声称运行通过。最终门禁结果（检查器/验证器退出码、计数、发布事务、故障实验室）记录在 `_publish\gate.json` 与 `_publish\journal.json`。

## 1. 生成与门禁流程

1. `p0v8-build.cjs` 在内存生成 registry、TSV、vectors、全部文档与 manifest。
2. 生成器自检：权限、TEMP、审计目录、绑定、requires、failure_modes、矩阵摘要、protect、目录父级。共 193 项断言。
3. 写入 `_publish\prestage`，运行 `p0v8-check.cjs --dir prestage` 与 `p0v8-verify.ps1 -Dir prestage`；任一非 0 即停止，不写 release。
4. 通过后调用 `p0v8-publish.cjs`：release → backup → switch → pointer → postverify。
5. 提交后再次运行检查器与验证器；失败则 `recover` 回滚。
6. 提交前用新进程重跑一次完整生成，逐文件比较 SHA-256；不一致即停止。结果记录在 `_publish\gate.json` 的 `determinism`。

## 2. 静态事实

| 项 | 值 |
|---|---|
| 命令 / 执行 / 链参与者 | 21 / 58 / 54 |
| nominal 链记录（绑定/未绑定） | 109 / 103 |
| 失败矩阵场景 | 306 |
| 负例 | 35 |
| 矩阵摘要 | `22243d0179dd982820e7cff0faad6d5df729f3842fec233ca350af3f6c787c40` |
| 向量 SHA-256 | `5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa` |
| 注册表 SHA-256 | `edca94ff7b8b45794dcaac8fd316f147e06c2cdb655a8d6eabdd63ccad586c47` |

## 3. 检查器覆盖

- 57 个正例的 canonical/bytes/hash 全部复算；5 个分片的 JSONL 物理字节复算。
- 35 个负例逐条断言“恰好一个错误且等于期望码”，包括角色、闭合字段、写/读解引用、durable、bytes、counts、skip 因果、封存模式、真实截断字节流。
- 306 个失败场景独立重算，比较矩阵摘要；C10-P gate 精确 24 项 skip；late security=aborted；early fatal=degraded-prefix；orphan=aborted。
- 权限：双向 allow/deny 交集 0；TEMP 同层读+写；写/保护交集 0（ACL 元数据写例外）；审计父目录覆盖 genesis 与 participant；绑定路径唯一。
- 发布：`CURRENT.json` 与物化树逐文件一致；release index 存在；journal=verified。

## 4. 验证器覆盖

`p0v8-verify.ps1` 独立复算：向量 SHA/字节、C01 链 seq/prev/prev_file_bytes、21 命令/58 执行/109-103/58-55/306 行、58 个 argv 哈希、38 列 TSV、发布指针。`p0v8-parse-inline.ps1` 只解析两个内联脚本，不求值。

## 5. 卫生

`p0v8-hygiene.cjs` 复算 V7 二十一份文件哈希，要求全部不变；V8 文件无 BOM、无 CR、无占位符。`p0v8-controlconfig-check.cjs` 复算 325 字节控制模板。

## 6. 明确未证明

1. 静态 schema/向量/状态机通过 ≠ 真实 writer/guard/ACL/FD 通过。
2. 故障实验室只注入进程内 throw 与自杀死；断电、磁盘错误、外部杀死、回滚中途失败未验证。
3. 多文件发布不是单次原子提交；恢复依赖 journal+backup+recover。
4. 运行时工具、外部输入、授权均未交付；Phase 0 未启动。
