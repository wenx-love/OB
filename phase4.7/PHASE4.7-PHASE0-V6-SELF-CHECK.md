# OB-Recover Phase 4.7：Phase 0 V6 自检报告

日期：2026-11-11。性质：交付前机械自检。不是独立复核，不是 Phase 0 执行结果。

## 1. 自检对象

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V6.md` | 96501 | 405 | `5342fd55f5a844fc76b56cf07569ef8923925d48e22ee9ed249bacd825221a58` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv` | 206472 | 59 | `661ca153076ab458a48a919709da0241fd7e72f831d66637531e68565236514d` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json` | 859560 | 23711 | `29b1693104c2690cf6987a9dd247aa4145ec17ffcfc5a7c33b225bbcb1e69906` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md` | 21672 | 429 | `c3026ab8c226833794a2245d1cbbe83bd8ec905ae06a440934fe194276099088` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json` | 9182 | 1 | `8d9a4773296e8f57509b4d659d6f3d6ca94ebf70cfeddd8dcb03803a06a8418b` |

## 2. 已实际执行的检查

| # | 检查 | 方法 | 结果 |
|---|---|---|---|
| 1 | CJS 语法 | `node --check` × 7 | 7/7 通过 |
| 2 | 生成幂等 | 连续两次 `p0v6-build.cjs`，比较 5 个产物 | 5/5 字节不变 |
| 3 | 结构/语义 | `p0v6-check.cjs` | **1761 项，0 失败** |
| 4 | 独立复算 | `p0v6-verify.ps1`（独立 canonical/哈希/物理字节） | **66 项，0 失败** |
| 5 | 内联语法 | `p0v6-parse-inline.ps1`（只解析） | C00 3526 字符/918 token，PROBE 2244/556，0 错误 |
| 6 | 字节卫生 | `p0v6-hygiene.cjs` | 5 文件无 BOM/CRLF |
| 7 | 历史不变 | 同上，V5 九份 + V4 七份 + 两轮报告 | 17/17 哈希不变 |
| 8 | 控制配置 | `p0v6-controlconfig-check.cjs` | 325 字节，`18a06117…d80003` |

## 3. 关键断言（机械可证）

| 项 | 断言 | 结果 |
|---|---|---|
| 规模 | 21 命令 / 58 执行 / 54 参与者 / 109·103 记录 / 58·55 顺序 | 通过 |
| 双计划 | 未绑定只少 C18 三连；每条执行双前驱逐一匹配 | 通过 |
| P0-1 | 16 个 staged 执行无目录级 deny；允许与禁止无交集 | 通过 |
| P0-2 | TSV 由检查器重新生成，31 列×58 行**逐字节相同** | 通过 |
| P0-2 | 每个文件输出都有同路径 file 权限；父目录有创建者 | 通过 |
| P0-3 | 15 向量 schema/哈希/字节；12 负例逐条被拒 | 通过 |
| P0-3 | `segment_open.prev_file_bytes = genesis+LF`；`segment_close = +open+LF` | 通过 |
| P0-3 | 分片 bytes/sha 由三行 JSONL（含 LF）复算 | 通过 |
| P0-4 | 10 个终态；无 pending；gate 与 fatal 后继不同 | 通过 |
| C18 | BIND 唯一读环境；绑定/未绑定前驱不同；未绑定不选 TEMP | 通过 |
| C03 | OBS 900 s、PROBE 300 s；OBS 创建 OUT 父目录 | 通过 |
| C10 | 8 条产品 target_argv 及哈希；vitest.json 产品写许可 | 通过 |
| C19 | 读 OUT 全树；截止点=前一 segment_close | 通过 |
| 工具哈希 | 全部 null，来源 manifest | 通过 |

## 4. 未执行

未执行 C00—C20、Phase 0、Vitest、tsc、Vite build、浏览器、L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未改 ACL、产品、`dist`、历史证据；未运行 dispatcher/verifier/audit/guard/tools（源码未交付）。

## 5. 全部动态项

UNVERIFIED：ACL 继承/读回/Codex 有效访问、三副本物理独立、链接/重解析、真实 fork 与预载、guard 覆盖、原生/FD/子进程、审计独占/flush/崩溃、C03 relay 来源、C18 绑定与归档、终端封存交叉校验、C10 实际 argv 执行。

## 6. 已知残余风险

1. `FileShare.Read` + 复算把 TOCTOU 窗口缩小但未消除；依赖 C02 ACL 与外部 H2/H3。
2. 祖先重解析检查只在 C00 内联实现；其他工具的实现仅由合同要求，未验证。
3. 16 个 staged 执行的“精确 deny”依赖 16 个文件清单固定；工具包变更必须同步重新生成。
4. 注册表 859560 字节，接近 `ConvertFrom-Json` 风险区间的 45%，已在 1.9 MB 设硬上限。
5. C18-BIND 增加一次链段；绑定失败也必须有段，链记录数按 109/103 计算，不得硬编码。
6. C07 仍对每个目标做 before/after 全量扫描，成本未测。
7. C20-SEAL 不受 C07 包裹，其“零接触 ORIGINAL”仍靠自身不读与 ACL。

## 7. 结论

契约层：P0-1—P0-4 与 N01—N11 已给出可定位处置，机械检查通过。实现层：全部 UNVERIFIED。本自检不构成批准。
