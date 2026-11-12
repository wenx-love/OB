# OB-Recover Phase 4.7：Phase 0 V7 交付清单

日期：2026-11-11。基准目录：`C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V7\`

本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布。

## 1. 契约文件（10 份）

| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V7.md` | 94871 | 362 | `f7fb35cddc82197aaeb6f23efcbf99e1356a2983fa71af108a390ef40b0e2bc5` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv` | 212732 | 59 | `a6473b6088d6059f89e3d3d4bcac1599668bd4ad4e8993c30c055dbc928d8aa3` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json` | 897850 | 24828 | `a5c00b6698dac585159296965c4f9a3c7afa8b13b22ec0af17cd540f54c50695` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md` | 21649 | 440 | `b060bea60bdcc39cd499dc8df44de63e2bd29f05c7f95a962c497a77bc2cfe8d` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json` | 20324 | 1 | `3d4bd77841d3ebf9e8b46935b17b5d65d42a385a3222bc846c2b15fde8b86f07` |
| `PHASE4.7-PHASE0-V6-TO-V7-CHANGELOG.md` | 7781 | 99 | `092fcf82ca4ca979ab76cf4ac245bb9d1ee3354521e151d64e54355bf1b6f53c` |
| `PHASE4.7-PHASE0-V7-N01-N12-TRACEABILITY.md` | 8773 | 143 | `d44ab83da93aac5d8f8f8bbdf0921b7ca6220c12e6bef61c588a75adf93e7cd2` |
| `PHASE4.7-PHASE0-V7-OPEN-ISSUES.md` | 3613 | 53 | `0b882db0ac4f0e5d5adc0ad109eef8bcc64be74d0fb00af7f221b491426ee75d` |
| `PHASE4.7-PHASE0-V7-SELF-CHECK.md` | 3633 | 67 | `d70e91f7d44bd603f15d50104c98640a89664a7f1e691f5f4d59e1ba920226a7` |
| `PHASE4.7-PHASE0-V7-RUNTIME-TOOLS-STATUS.md` | 3204 | 42 | `bfc6dd40842739b77c80d22ffb172c5e64ca96810c6d713592b3188257a92367` |

## 2. 生成与检查工具（10 份）

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `p0v7-lib.cjs` | 5702 | 128 | `8d2d433917efeff7851b56e1fe5e368f9400b100f71a883aee3c077d52ce5a96` |
| `p0v7-spec.cjs` | 41890 | 565 | `4d240971d58c3144f340e973e1b526bab6355348ff207a685c3140475cbd0e2b` |
| `p0v7-audit.cjs` | 23100 | 291 | `989761705139268ffffd287f5913295738871c9a8f081f60d24c93ddd3eb2e51` |
| `p0v7-build.cjs` | 31683 | 492 | `67712a0703671d5402475a3c345736afb6a98c3dff3bb2bd1870af1978b03116` |
| `p0v7-check.cjs` | 26309 | 401 | `4fa6487e043ca6c7d881157633507287c5ae9d519b286fc09c43b7573435897d` |
| `p0v7-verify.ps1` | 6967 | 102 | `7a03128826efa2c7a23e359e9a330852ac97cefd0b8dc06b7ccda83daa65fdd5` |
| `p0v7-parse-inline.ps1` | 1160 | 27 | `609a5254ec03923e40c05caecccb465b7a582522d88a957eead503bba3fe8031` |
| `p0v7-hygiene.cjs` | 4250 | 64 | `3dff7fa46458e97049c91299a85f9be4b263281b710b0279fb8d17b26deaac00` |
| `p0v7-controlconfig-check.cjs` | 764 | 15 | `a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390` |
| `p0v7-manifest.cjs` | 3912 | 98 | `79ef74533a8ead85c2f07383739bd830dbe92f6ee50ca49856d2d61315d1ff8f` |

## 3. 复现

```text
node p0v7-build.cjs
node p0v7-check.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File p0v7-verify.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File p0v7-parse-inline.ps1
node p0v7-hygiene.cjs
node p0v7-controlconfig-check.cjs
node p0v7-manifest.cjs
```

`p0v7-build.cjs` 先完成内存校验再发布；失败回滚。重跑会重写产物与两份文档附录，清单需重新生成。

## 4. 未交付（外部输入）

| 项 | 原因 |
|---|---|
| `D:\P47TOOLS\p47-phase0-v7` 发布包（20 payload） | 未提供 |
| `RELEASE-MANIFEST.json` 批准 SHA-256 | 未提供 |
| 管理员 SID 用户确认 | 未完成 |
| `P0_CODEX_ACCOUNT` | 未指定 |
| SECOND_ARCHIVE 绑定 | 未完成 |
| dispatcher/verifier/audit/guard/业务工具源码 | 全部缺失，见 `PHASE4.7-PHASE0-V7-RUNTIME-TOOLS-STATUS.md` |
| 动态验证 | 未运行 |

## 5. 未创建、未修改

未创建 `D:\P47RUN`、`D:\P47TOOLS`；未改 ACL、产品源码、配置、测试、`dist`；V4/V5/V6 与三轮报告哈希不变。
