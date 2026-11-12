# OB-Recover Phase 4.7：Phase 0 V7 自检报告

日期：2026-11-11。性质：交付前机械自检。不是独立复核，不是 Phase 0 执行结果。

## 1. 自检对象

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V7.md` | 94871 | 362 | `f7fb35cddc82197aaeb6f23efcbf99e1356a2983fa71af108a390ef40b0e2bc5` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv` | 212732 | 59 | `a6473b6088d6059f89e3d3d4bcac1599668bd4ad4e8993c30c055dbc928d8aa3` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json` | 897850 | 24828 | `a5c00b6698dac585159296965c4f9a3c7afa8b13b22ec0af17cd540f54c50695` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md` | 21649 | 440 | `b060bea60bdcc39cd499dc8df44de63e2bd29f05c7f95a962c497a77bc2cfe8d` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json` | 20324 | 1 | `3d4bd77841d3ebf9e8b46935b17b5d65d42a385a3222bc846c2b15fde8b86f07` |

## 2. 已实际执行的检查

| # | 检查 | 方法 | 结果 |
|---|---|---|---|
| 1 | CJS 语法 | `node --check` × 8 | 8/8 |
| 2 | 生成幂等 | 连续两次 build，比较 5 个产物 | 5/5 字节不变 |
| 3 | 独立检查器 | `p0v7-check.cjs` | **720 项，0 失败** |
| 4 | 独立复算 | `p0v7-verify.ps1` | **75 项，0 失败** |
| 5 | 内联语法 | `p0v7-parse-inline.ps1`（只解析） | C00 3526 字符、PROBE 2244，0 错误 |
| 6 | 字节卫生 | `p0v7-hygiene.cjs` | 5 文件无 BOM/CR；V6 19 + V5 5 + 报告 3 不变 |
| 7 | 控制配置 | `p0v7-controlconfig-check.cjs` | 325 字节 / `18a06117…d80003` |
| 8 | 清单自校验 | `p0v7-manifest.cjs` + 外部比对 | 行数/字节/哈希一致（清单自身除外） |

## 3. 关键断言

| 项 | 断言 | 结果 |
|---|---|---|
| 规模 | 21 命令 / 58 执行 / 54 参与者 / 109·103 / 58·55 | 通过 |
| N01 | 全量 allow/deny 交集 0；FINAL/SEAL 无 staged deny | 通过 |
| N02 | 58 自读匹配 entry_path；16 staged 不读 source | 通过 |
| N03 | C06 policy 64 hex | 通过 |
| N04 | OBS=observer；产品=tool+product；中间目录 | 通过 |
| N05 | runner `RUN\tmp`；产品 `COPY\tmp`；dist 排他允许 | 通过 |
| N06 | 同 index 摘要一致；C19 入口/args 一致；12 负例单错误 | 通过 |
| N07 | 安全优先级与触发码 | 通过 |
| N08 | C10-P 闭包跳过 8 个；报告路径豁免 | 通过 |
| N09 | 4 种封存模式；observer-reclaimed | 通过 |
| N10 | BIND 文件 + 元数据 + C18 无 env + token | 通过 |
| N11 | C04 16 FC / 无 TC；C14 map-list | 通过 |
| N12 | 先验后发；检查器不 import 生成器 | 通过 |
| TSV | 33 列 × 58 行，重新生成逐字节相同 | 通过 |
| 历史 | V6 19 份、V5 5 份、报告 3 份哈希不变 | 通过 |

## 4. 未执行

未执行 C00—C20、Phase 0、Vitest、tsc、Vite build、浏览器、L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未改 ACL、产品、`dist`、历史证据；未运行任何运行时工具（源码不存在）。

## 5. 全部动态项

UNVERIFIED：ACL、真实 fork、guard、原生/FD/链接、审计独占/flush/恢复、C18 动态路径与归档、SEAL 交叉校验、skip 记录实现、产品子进程继承、生成器故障注入。

## 6. 残余风险

1. 发布窗口非事务性（跨文件 rename 前）；已用回滚降低。
2. 16 文件 deny 集合需随工具包更新。
3. C07 全量扫描成本未测。
4. SEAL 无 C07 包裹。
5. 检查器是静态规则，不是运行时 validator。
6. 运行时工具缺失，不能声称任何权限已被执行。

## 7. 结论

契约层：N01—N12 已给出可定位处置并通过静态检查。实现层：全部 UNVERIFIED。本自检不构成批准。
