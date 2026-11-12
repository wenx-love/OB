# OB-Recover Phase 4.7：Phase 0 V6 交付清单

日期：2026-11-11。基准目录：`C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\`

本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布。

## 1. 契约文件（9 份）

| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V6.md` | 96501 | 405 | `5342fd55f5a844fc76b56cf07569ef8923925d48e22ee9ed249bacd825221a58` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv` | 206472 | 59 | `661ca153076ab458a48a919709da0241fd7e72f831d66637531e68565236514d` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json` | 859560 | 23711 | `29b1693104c2690cf6987a9dd247aa4145ec17ffcfc5a7c33b225bbcb1e69906` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md` | 21672 | 429 | `c3026ab8c226833794a2245d1cbbe83bd8ec905ae06a440934fe194276099088` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json` | 9182 | 1 | `8d9a4773296e8f57509b4d659d6f3d6ca94ebf70cfeddd8dcb03803a06a8418b` |
| `PHASE4.7-PHASE0-V5-TO-V6-CHANGELOG.md` | 8156 | 129 | `5ee7f761b9d68cd83abad32f08dde9c1e8b853b15555b71a95d204d53240bd16` |
| `PHASE4.7-PHASE0-V6-OPEN-ISSUES.md` | 4122 | 50 | `1f85f67535046c6df1ee156c7a5edb28ffc49c5b364c40f0a82598484fd0eac7` |
| `PHASE4.7-PHASE0-V6-SELF-CHECK.md` | 4319 | 67 | `98a3329c453972a58eb8c5158782df8a116a907246be2ddb225733fd18e0a588` |
| `PHASE4.7-PHASE0-V6-EIGHTH-REVIEW-TRACEABILITY.md` | 5180 | 71 | `88666c0314329c259bafbc20a7f14664f3d9682ae2e72260f9a40bc93e245505` |

## 2. 生成与检查工具（9 份）

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `p0v6-lib.cjs` | 5669 | 127 | `799dcbb5081f87d3be77b1e57502b8c9f572c5d61b343c28cb5e5a9bd0dfb482` |
| `p0v6-spec.cjs` | 36153 | 499 | `a75342552623f15995c45d84456a6b987ad3490191d3466de3fa7d65bc91b075` |
| `p0v6-audit.cjs` | 22020 | 273 | `be3b4543c328ecb473926b762899764c2ee172a3c2c913e7075c404647e48583` |
| `p0v6-build.cjs` | 27472 | 427 | `be57bba1cbc7442ba66aec562ffcd488516709a154baf62c4b50a714a2bb8f3d` |
| `p0v6-check.cjs` | 18728 | 295 | `9bca4cbcb74e92b1a2982522a7bf97813fdfd3011a4f3a556b5eab596e9630c3` |
| `p0v6-verify.ps1` | 7094 | 116 | `c61356c1ab7608f99d138ff032386b65b49f283fc1fd03b6ba3feb1e949ce085` |
| `p0v6-parse-inline.ps1` | 1160 | 27 | `430b9718e0699e661ceacc40e359dd12ca9614896c3f64395454fea2add7a846` |
| `p0v6-hygiene.cjs` | 3240 | 50 | `3e24a658563f9118ced6860ff97476435fe7044ce22d731e6bbd11d297b85072` |
| `p0v6-controlconfig-check.cjs` | 764 | 15 | `a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390` |

## 3. 复现

```text
node p0v6-build.cjs
node p0v6-check.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File p0v6-verify.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File p0v6-parse-inline.ps1
node p0v6-hygiene.cjs
node p0v6-controlconfig-check.cjs
```

`p0v6-build.cjs` 会重写两份文档的生成附录；重跑后哈希以新值为准。当前值对应最后一次运行，且已实测幂等。

## 4. 未交付（外部输入）

| 项 | 原因 |
|---|---|
| `D:\P47TOOLS\p47-phase0-v6` 发布包（20 payload） | 未提供 |
| `RELEASE-MANIFEST.json` 批准 SHA-256 | 未提供 |
| 管理员 SID 用户确认 | 未完成 |
| `P0_CODEX_ACCOUNT` | 未指定 |
| SECOND_ARCHIVE 绑定 | 未完成 |
| dispatcher/verifier/audit/guard/tools 源码 | 未交付 |
| 任何动态验证 | 未运行 |

## 5. 未创建、未修改

未创建 `D:\P47RUN`、`D:\P47TOOLS`；未改 ACL、产品源码、配置、测试、`dist`；V4/V5 与两轮报告哈希不变（自检第 2 节）。

## 6. 历史文件

V5 九份、V4 七份、第六/七/八轮报告、方案 V5 Candidate 全部原样保留；V6 使用 `PHASE4.7-PHASE0-*-V6.*` 与 `p0v6-*` 新文件名。
