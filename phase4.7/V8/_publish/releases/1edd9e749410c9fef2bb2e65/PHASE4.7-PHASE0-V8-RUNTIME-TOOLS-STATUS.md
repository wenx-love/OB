# OB-Recover Phase 4.7：V8 运行时工具交付状态

日期：2026-11-11。本文件只陈述交付事实，不把生成器、检查器或文档当作运行实现。

## 1. 已交付（契约与工具）

| 类型 | 文件 |
|---|---|
| 契约 | START-CONDITIONS-V8.md、COMMAND-READ-WHITELIST-V8.tsv、COMMAND-EXECUTION-REGISTRY-V8.json、WRITE-AUDIT-SPEC-V8.md、AUDIT-VECTORS-V8.json、FAILURE-MODEL.md、PUBLISH-PROTOCOL.md |
| 追溯与记录 | V7-TO-V8-CHANGELOG.md、N01-N12-TRACEABILITY.md、OPEN-ISSUES.md、SELF-CHECK.md |
| 生成与检查 | p0v8-lib.cjs、p0v8-spec.cjs、p0v8-flow.cjs、p0v8-audit.cjs、p0v8-build.cjs、p0v8-publish.cjs、p0v8-check.cjs |
| 独立验证 | p0v8-verify.ps1、p0v8-parse-inline.ps1、p0v8-hygiene.cjs、p0v8-controlconfig-check.cjs、p0v8-lab.cjs、p0v8-manifest.cjs |

## 2. 未交付（运行实现）

| 类型 | 当前状态 |
|---|---|
| dispatcher / verifier 运行实现 | 只有接口、入口与合同引用；未交付源码 |
| `p0-audit.cjs` 运行实现 | 只有规范、schema 与向量；append/lock/fsync/recover 未实现 |
| `fs-guard.cjs` 运行实现 | 只有 policy 与预载合同；未实现 |
| init/acl/stage/observe | 只有 bootstrap 接口合同；未实现 |
| copy/archive/product-run/neutralize/compare/index/report | 只有执行登记与接口；未实现 |
| 正式发布 manifest 与批准摘要 | 未提供 |

## 3. 路径事实

- `D:\P47TOOLS\p47-phase0-v8` 不存在；20 个 payload 实际存在数 0。
- `D:\P47RUN` 不存在；未创建。
- 本目录 `_publish\` 是 V8 契约包自己的发布状态，不是工具 payload。
- `work\` 是生成输入：13 个工具与 9 个文档模板；包根同名工具在发布时与其逐字节一致。`work\` 不在 26 项交付清单内，也不被运行时使用。
- `_publish\releases\<rid>\` 是当前提交的不可变副本；`_publish\CURRENT.json` 是唯一指针。

## 4. 使用边界

`p0v8-build.cjs`、`p0v8-check.cjs`、`p0v8-verify.ps1`、`p0v8-lab.cjs` 都只处理契约文本/字节与隔离 scratch；它们不执行 C00—C20，不启动浏览器、产品测试或 Phase 0，不改 ACL，不写 `D:\P47RUN`/`D:\P47TOOLS`。

## 5. 结论

运行时工具**未交付**，因此 Phase 0 不能启动。任何“契约静态通过”都不应被读成“运行实现可用”。
