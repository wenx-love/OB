# Phase 4.7 / Phase 0 审查与整改归档

本目录把 `C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\` 的完整历史原样纳入 OB 仓库，便于网页版 Codex 与本地 OpenCode 共同读取。

## 目录

| 路径 | 内容 |
|---|---|
| `V7/` | 第七版契约包（21 文件） |
| `V8/` | 第八版契约包（26 文件）及 `_publish` 发布记录 |
| `V9/` | **当前版本**：37 文件（13 契约 + 13 工具 + 10 doc-src 生成输入 + 清单），含 `_publish`（CURRENT/journal/lab 证据） |
| `CODEX-P47-*.md` | 历轮 Codex 独立审查报告原件（同时复制到仓库根 `reviews/`） |
| 其余 `*.md/*.tsv/*.json/*.cjs/*.ps1` | V1—V9 的整改计划、追溯表、扫描数据、生成器与历史证据 |

## 当前状态（2026-11-12）

- V9 门禁：独立 checker 2326 项 0 失败（pre 2317）；PowerShell verifier 121 项 0 失败；build 自检 924；lab 17/17；determinism true；V8 26 份哈希不变。
- 发布：rid `380e5e9dd83370505c2555ad04acbd4b475f07473a041ac7d5e96e32db47a735`，journal `verified`，status `issues=[]`。
- 状态：F01—F14 已修复（14/14 静态或隔离）；N01—N12 为 0 CLOSED / 12 PARTIAL / 0 OPEN；Phase 0 未启动。
- 第十二轮独立审查：截至本次提交，仓库内尚无 `reviews/V9-TWELFTH-INDEPENDENT-REVIEW.md` 或其 zip 附件；不假设已读取。

## 约束

V9/V8/V7 与历史报告均为只读归档；本目录不包含任何 C00—C20 执行、Phase 0 运行或 ACL 修改。
