# OB-Recover Phase 4.7：Phase 0 V5 交付清单

日期：2026-11-11。基准目录：`C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\`

本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布。

## 1. 契约文件（9 份）

| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V5.md` | 65026 | 547 | `3d5e51bc1af7829d26c1de6266cc7706091807189f5eea7befa994a2d118fdcd` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv` | 130063 | 58 | `1b7ac41018ed4a4345a0122cc74576c56d6f6c128b91e430b9b184e98618fb95` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json` | 549852 | 16207 | `078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md` | 24322 | 442 | `fa6fecbacfe9142f9b2f7ac0d05aea6cdf25b89b275ae7c60edc3ba9ac323220` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json` | 7981 | 1 | `dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042` |
| `PHASE4.7-PHASE0-V4-TO-V5-CHANGELOG.md` | 8579 | 113 | `071f9c9e29398b0e4e17e1d3487497bd68a07037ec2453ab20db07fd24831211` |
| `PHASE4.7-PHASE0-V5-OPEN-ISSUES.md` | 3726 | 37 | `2ef5bfd8a9799b7dc37da883722adebaa91259ab576aba2c89f4a7c846fb92b1` |
| `PHASE4.7-PHASE0-V5-SELF-CHECK.md` | 6085 | 76 | `bb33884a2be571dc5d62fbf73854504dda1614026de52578623286f11f5c9e38` |
| `PHASE4.7-PHASE0-V5-Q01-Q07-TRACEABILITY.md` | 7348 | 92 | `544e869182aef684682ee4412b7fa9ab5f1f21e4eee130270f7a38e4a3d5becb` |

## 2. 生成与检查工具（9 份，可复现）

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `p0v5-lib.cjs` | 6439 | 146 | `c4849b053e53beaea88691b1f9af38bde41c6e107dcf7ac74a9abea3f2c45030` |
| `p0v5-spec.cjs` | 31995 | 471 | `66e264f4f270ce7a6c641ad52796ef8431fb2f0be47ffe806e9a4e7546063ab3` |
| `p0v5-audit.cjs` | 16818 | 382 | `b7cde1335997c61941d5e386219f998fca76f85eab37303fc71dbb206a5739dc` |
| `p0v5-build.cjs` | 22693 | 411 | `bcd280abbdfda54f1bc9c1cecb285520e5f7cb2050069d203e6beac7769c0c12` |
| `p0v5-check.cjs` | 13696 | 171 | `1f7a0836d74d06729a6412ddabe89234d21e09e7ff4b0153eed5d8abc8d078f1` |
| `p0v5-verify.ps1` | 7960 | 139 | `f69bc901d7b580554849982c70555d21c1b990f93cfaf89fae5ab3c50bac39cd` |
| `p0v5-parse-inline.ps1` | 1155 | 27 | `8344cb3f04c7faae485c16d64861399afe13a5aef5b8dc429d934d7ce401de50` |
| `p0v5-hygiene.cjs` | 2324 | 44 | `f3a4f01ae5d29b4bcf95d0cbc3ac3360bf36194f9f6755cf4d597b36e8073f4c` |
| `p0v5-controlconfig-check.cjs` | 621 | 13 | `4e6773c51bf943253a7e708560b3847a8f33b21ac13ffbffd9bce14a6ca3ab8c` |

## 3. 复现方式

```text
node p0v5-build.cjs          # 重新生成注册表/TSV/向量，并重写两份文档的生成附录
node p0v5-check.cjs          # 158 项结构一致性检查
powershell -NoProfile -ExecutionPolicy Bypass -File p0v5-verify.ps1      # 47 项独立复算
powershell -NoProfile -ExecutionPolicy Bypass -File p0v5-parse-inline.ps1 # 仅语法解析
node p0v5-hygiene.cjs        # BOM/CRLF 与 V4 输入不变检查
node p0v5-controlconfig-check.cjs  # 325 字节 / 18a06117… 复算
```

注意：`p0v5-build.cjs` 会重写两份文档的生成附录；重跑后主文档与审计规范的哈希以新值为准。当前交付哈希对应上述运行结果。

## 4. 本轮未交付（外部输入，缺失即阻止实际启动）

| 项 | 原因 |
|---|---|
| `D:\P47TOOLS\p47-phase0-v5` 发布包（20 个 payload） | 用户未提供；不得自造 |
| `RELEASE-MANIFEST.json` 的用户批准 SHA-256 | 未提供；注册表不内置工具哈希 |
| 管理员 SID 的用户确认 | 仅有本机只读解析值 |
| `P0_CODEX_ACCOUNT` 指定 | 两个候选中未选 |
| SECOND_ARCHIVE 绝对路径绑定 | 出口输入；未绑定则 C18 禁用 |
| Codex 账户存在性与组成员核对 | 未核对 |
| 任何动态验证 | 未运行；全部 UNVERIFIED |

## 5. 未创建、未修改

- 未创建 `D:\P47RUN`、`D:\P47TOOLS`。
- 未修改 ACL、产品源码、产品配置、测试、`dist` 或历史证据。
- V4 七份文件与第七轮报告哈希不变（见自检第 2 节第 7 项）。
- 未执行 C00—C20、Vitest、`tsc`、Vite build、浏览器、L1。

## 6. 历史文件保留

V4 七份、V3 六份、第一至第七轮独立报告、方案 V5 Candidate、以及既有的 `PHASE4.7-V5-*`（方案层文件）全部原样保留；V5 启动包使用 `PHASE4.7-PHASE0-*-V5.*` 新文件名，未覆盖任何历史文件。
