# OB-Recover Phase 4.7：Phase 0 启动包 V6 → V7 变更记录

日期：2026-11-11。依据：第九轮报告 `f9843762…`。只整改 V6-N01—N12；不执行 C00—C20、Phase 0、测试、构建、浏览器或 L1；不创建 `D:\P47RUN`/`D:\P47TOOLS`；V4/V5/V6 与历史报告只读。

## 1. 范围与结构

V7 在独立目录 `V7\` 输出。结构：21 命令、58 执行、54 链参与者、绑定 58 / 未绑定 55、nominal 链记录 109/103、TSV 33 列、payload 20（staged 16 / bootstrap 4）、审计正例 16、负例 12。

## 2. N01：读取权限双向交集（P0）

- **根因：** `denyFor` 只把 `STAGED\` 下的精确路径视为“已允许”，未认可 `T:RUN\tools` 子树许可，仍把 16 个文件加入 deny；检查器只查“allow 位于 deny 之下”，漏查“deny 位于 allow 子树下”。
- **修改：** `p0v7-build.cjs` 的 `denyFor` 用 `covered()` 判断子树覆盖；新增 `intersects(r,d)` 双向判定，生成前对每个执行、产品策略逐一断言；`p0v7-check.cjs` 独立实现同样的双向判定并全量扫描。
- **结果：** C05-FINAL/C20-SEAL 读取 `T:RUN\tools` 时不再 deny 任何 staged 文件；原 32 项交集为 0；16 个 staged 执行仍只 deny 未加载的精确文件。
- **验证：** 检查器 `total allow/deny intersections = 0`，且 `FINAL/SEAL no staged deny`。

## 3. N02：staged 入口 self-read

- **根因：** dispatcher 自读固定为 `src('dispatch')`，16 个 staged 执行实际入口是 `StagedRoot\p0-dispatch.ps1`。
- **修改：** `p0v7-build.cjs` 用 `e.entry_path` 作为自读；verifier 依赖从同根取。
- **结果：** 58 个执行的自读与实际入口一致；staged 执行不再出现 source 自读。
- **验证：** 检查器对每个 staged 执行断言 `reads.dispatcher` 含 `entry_path` 且不含 source dispatcher。

## 4. N03：C06 守卫

- **根因：** C06 未设置 `guard=true`，policy 未生成。
- **修改：** `p0v7-spec.cjs` C06 增加 `guard: true`。
- **结果：** C06 `guard.policy_sha256` 为 64 位十六进制，含 read/write/deny/parts 摘要。
- **验证：** 检查器 `C06 guard policy`。

## 5. N04：审计角色、目录、C01 链许可

- **根因：** 角色固定 `dispatcher/tool`；只登记段目录，未登记中间 `AUDIT\Cxx`；C01 业务层也创建链头。
- **修改：** `p0v7-build.cjs` 按执行生成角色（OBS=observer；产品=tool+product；其余 tool）；参与者增加 `dir-create-if-absent` 的中间目录；C01 业务输出移除链头，仅 control 层 create/append。
- **结果：** 产品另有 `events-product-*.jsonl` 规则；C01 链权限唯一归属 control。
- **验证：** 检查器角色/父目录/链许可断言。

## 6. N05：产品环境、dist、预载

- **根因：** 产品 env 覆盖 runner env；dist 子树保护与六目标允许冲突；产品无预载读与分片合同。
- **修改：** `product_env` 独立（`COPY\tmp`）；runner `required_env` 保持 `RUN\tmp`；产品读 `fs-guard.cjs`/`p0-audit.cjs`；产品分片规则；C12/C16 dist 改为“排他允许”，不加入 `protect_write`；C10/C11/C13/C15 仍保护 dist。
- **结果：** 父子环境与权限分层可核；dist 不再同时“允许六文件、保护整树”。
- **验证：** 检查器逐项断言 env/preload/protect/dist_policy。

## 7. N06：向量与验证器

- **根因：** 同一 `index.json` 在 write_result 与 summary 使用不同哈希；C19 入口/args 与注册不符；负例只存名称、检查器用恒假比较。
- **修改：** `p0v7-audit.cjs` 统一 `INDEX_SHA/INDEX_BYTES`；`segment_open` 的 `entry_path`/`args_sha256` 取自 `p0v7-spec` 的 C19 执行；负例交付 canonical 文本，每条只注入一个错误；`p0v7-check.cjs` 自带完整 schema 校验，解析负例字节并要求“恰好一个错误且等于期望码”。
- **结果：** 16 正例（含 `segment_skip`）自洽；12 负例逐条只产生目标错误。
- **验证：** 检查器 `negative exactly one error` 与 `expected code` 全部通过；PowerShell 独立复算正例哈希。

## 8. N07：安全失败优先级

- **根因：** 命令默认 gate 会把身份/权限/守卫/审计错误降级为普通失败。
- **修改：** `p0v7-spec.cjs` 为每个执行增加 `security_codes`；`p0v7-build.cjs` 注册 `security_priority: security > fatal > gate` 与触发列表。
- **结果：** C10—C16/C18 的任何安全码命中即停，不进入后续目标。
- **验证：** 检查器断言每个 gate 执行至少一个安全码，且策略含优先级。

## 9. N08：依赖闭包与跳过

- **根因：** C10-P 失败后，C10-N/C11/C12 等仍要求其成功；没有 skipped 状态。
- **修改：** 注册表新增 `deps`、`plan.failure_policy.skip_policy`、`report_exempt`；链新增 `segment_skip` 记录类型。
- **结果：** C10-P 失败传递跳过 C10-N/C11/C12/C13/C10-S/C14/C15/C16；C17/C19/C20-REPORT/SEAL 豁免并消费实际终态；跳过不执行、不写段目录、不伪造 summary。
- **验证：** 检查器计算传递闭包，断言跳过集合与报告豁免；依赖全部指向更早执行。

## 10. N09：早期中止与封存

- **根因：** degraded 模式仍无条件要求完整 staged 复核。
- **修改：** `p0v7-build.cjs` 注册四种封存模式（sealed-full / degraded-prefix / aborted / chain-broken）；SEAL 门按 `staged_state` 分支；新增 `observer-reclaimed` 状态与 C03 回收规则。
- **结果：** 早期 fatal 只声明实际前缀；缺失 summary 列 `summary_state=missing`；链损坏不写封存。
- **验证：** 检查器断言四模式存在、SEAL 门含 staged_state、状态表含 observer-reclaimed。

## 11. N10：C18 绑定交接

- **根因：** BIND 无输入却检查动态目标；C18 直接读环境，且 `bound-value` 被后续覆盖；目标读回无许可。
- **修改：** BIND 只读一次 `P0_SECOND_ARCHIVE`（`ENV_METADATA` stat），CreateNew 写 `RUN\binding\c18-binding.json`；segment_open 记录同一 sha 与目标；C18 只读绑定文件、环境不再出现；目标读回使用 `BINDING:c18_destination`。
- **结果：** 绑定值不可覆盖；后续阶段不重读环境。
- **验证：** 检查器断言 BIND 输出/元数据、C18 无环境、C18 读绑定文件、token 输出。

## 12. N11：对象与类型

- **根因：** C04 用树创建表达文件许可，且“空根/目标已存在”歧义；ML 被编码为 subtree。
- **修改：** C04 输出 `DC` 根 + `DC cases` + 16 个 `FC` 文件；门条件写明“空目录允许、任何文件已存在失败”；ML 恢复 `map-list`。
- **结果：** 类型与对象语义一致；C14 不再出现 subtree 写。
- **验证：** 检查器断言 16 个 FC、无 TC、map-list 类型。

## 13. N12：生成器原子性与检查器可靠性

- **根因：** build 边写边验、缺文档仍继续；check 复用生成器并存在恒假/伪验证。
- **修改：** `p0v7-build.cjs` 先在内存完成全部产物与前置断言，之后一次性发布并在异常时回滚；缺主文/规范直接拒绝；`p0v7-check.cjs` 不 import build/audit/spec，自带规范化与 schema，负例按交付字节解析。
- **结果：** 生成失败不留下混合版本；检查器不再由生成器“喂答案”。
- **验证：** 连续两次 build 产物字节不变；check 720 项全过；manifest 由独立 `p0v7-manifest.cjs` 生成。

## 14. 未改变

D3/D4/D10/D12/D14/D15、R 0/23/2、安全指标、阶段顺序、ORIGINAL 只读、Codex 零写、工具哈希 `null` 均不变。

## 15. 未验证

运行时工具全部缺失；ACL、真实 fork、guard、原生/FD、审计实现/独占/flush、C18 实际归档、终端封存交叉校验均 UNVERIFIED。
