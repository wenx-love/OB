# OB-Recover Phase 4.7：Phase 0 V7 运行时工具状态

日期：2026-11-11。性质：事实说明，不是交付、不是批准。

## 1. 结论

第九轮报告列出的运行时工具**全部不存在、未实现、不可审查**。V7 交付的 `p0v7-lib/spec/audit/build/check/verify/parse/hygiene/controlconfig/manifest` 是**契约生成与检查工具**，不得冒充运行时工具。

| 运行时工具 | 是否存在源码 | 是否实现 | 当前形态 | 可独立源码审查 | 未解决安全问题 |
|---|---|---|---|---|---|
| `p0-dispatch.ps1` | 否 | 否 | 仅契约引用（入口/argv/权限/门） | 否 | 自读与加载稳定性、独占链头、进程回收均未实现 |
| `p0-verify-release.ps1` | 否 | 否 | 仅契约引用（20/16 文件核验） | 否 | 祖先/重解析、字节口径、与 manifest 的绑定未实现 |
| `p0-audit.cjs`（运行时） | 否 | 否 | 仅审计规范与向量 | 否 | 独占追加、flush/fsync、崩溃恢复、skip 记录未实现 |
| `fs-guard.cjs` | 否 | 否 | 仅 policy 字段与角色模型 | 否 | 父/子进程继承、FD/原生绕过、路径别名未实现 |
| `p0-init.ps1` / `p0-acl.ps1` / `p0-stage.ps1` / `p0-observe.ps1` | 否 | 否 | bootstrap 契约 | 否 | ACL 读回、CreateNew、观察者回收未实现 |
| `p0-simulate.cjs` / `p0-manifest.cjs` / `p0-archive.cjs` / `p0-copy.cjs` | 否 | 否 | 工具契约 | 否 | 模拟用例、ADS/USN、复制身份未实现 |
| `p0-product-run.cjs` / `p0-neutralize.cjs` / `p0-compare.cjs` / `p0-index.cjs` / `p0-report.cjs` | 否 | 否 | 产品运行/分析契约 | 否 | fork 预载、map 展开、截止点、报告一致性未实现 |

## 2. 生成/检查工具（已交付，可审查）

| 工具 | 职责 | 边界 |
|---|---|---|
| `p0v7-lib.cjs` | 路径、规范化、哈希 | 不是路径安全验证器；不做 realpath/句柄身份 |
| `p0v7-spec.cjs` | 执行数据定义 | 不执行命令、不启动进程 |
| `p0v7-audit.cjs` | schema 与向量生成 | 不是运行时审计器 |
| `p0v7-build.cjs` | 生成注册表/TSV/向量/附录 | 先校验后发布；不写 V6 或产品 |
| `p0v7-check.cjs` | 独立检查器 | 不 import 生成器；只读 V7 产物 |
| `p0v7-verify.ps1` | 独立哈希/字节/argv 复算 | 不执行 C00—C20 |
| `p0v7-parse-inline.ps1` | 内联脚本语法解析 | 不求值 |
| `p0v7-hygiene.cjs` | 字节卫生 + 历史不变 | 不验证业务语义 |
| `p0v7-controlconfig-check.cjs` | 固定模板字节/哈希 | 不导入 Vite、不运行构建 |
| `p0v7-manifest.cjs` | 交付清单生成 | 只测量与写清单，不执行工具 |

## 3. 影响

- 本包只能证明**契约与生成逻辑**的一致性；不能证明任一运行时工具遵守权限。
- 在运行时工具交付并独立审查前，Phase 0 不得启动；任何“工具已实现”的说法都是错误的。
- 新增运行时实现应作为独立交付，附源码、摘要、静态审查与验证边界；不得因新增实现而自动启动 Phase 0。

## 4. 外部输入仍缺

`D:\P47TOOLS\p47-phase0-v7` 发布包（20 payload）、批准 manifest SHA-256、管理员 SID 用户确认、`P0_CODEX_ACCOUNT`、SECOND_ARCHIVE 绑定均未提供。
