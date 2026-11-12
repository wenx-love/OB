# OB-Recover Phase 4.7：Phase 0 启动条件 V2→V3 变更记录

日期：2026-11-11。性质：只读文档修订记录，不是 Phase 0 执行记录。

## 1. 输入基线

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-SUPPLEMENT-V2.md` | 26113 | `b3fe4e720475d93e58ee486600aaa8045fa818974c318166e60352bd04419e66` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V2.tsv` | 11048 | `4203b55052386508065027bc2e1ae0ae32ab19ebca8203c1316eaa8a089c2ec4` |
| `CODEX-P47-V5-FIFTH-INDEPENDENT-REVIEW.md` | 29641 | `f73b172f9dea957d2b60d811a4dd0cfc7a6201fc53b912138ac3a200f73df572` |
| V5 Candidate | 71817 | `4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9` |

V2 保留原样；V3 取代 V2 的执行条款，不把两个版本中矛盾的许可取并集。

## 2. 六项阻塞问题

### B1：C00—C20 全部可执行登记

**V2：** 21 条命令只有接口模板；多处“已登记工具/来源/控制配置”，无固定入口、argv、cwd、输入输出与执行编号。

**V3：**

- 新增 `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V3.json`，21 条命令逐条固定：
  - 可执行文件绝对路径与 SHA-256；
  - 精确 argv（含模式、参数、路径）；
  - cwd、环境变量、输入清单、输出清单；
  - 读/写/拒绝根；
  - `exec_id`、gate、fail-closed 条件、审计规则。
- 固定 RUN=`D:\P47RUN\P47-20261111-01`、TOOLSRC=`D:\P47TOOLS\p47-phase0-v3`；不再有未绑定的 run/copy 自由占位符。
- 工具二进制不伪造哈希：由 `RELEASE-MANIFEST.json` 固定，C00 先验清单哈希，C05 在 C06 前复算全部工具/依赖哈希。
- C00 未提供 `P0_TOOLSRC_MANIFEST_SHA256` 即退出 43；清单不符/TOOLSRC 缺失即退出 44。
- C18 的 `SECOND_ARCHIVE` 是唯一未绑定的用户输入；未绑定即 `state=DISABLED`，不得执行。
- C07 的 `--command-id` 只能取注册表枚举，不是自由字符串。

**状态：** 契约已闭合；`TOOLSRC` 发布包尚未提供，是 Phase 0 启动前外部输入，不是命令歧义。

### B2：C04 读取根限制

**V2：** C04 允许读“已登记工具来源”，未限定在 ORIGINAL 之外；存在 S1 先读原项目的路径。

**V3：**

- C04 只读 `TOOLSRC`、RUNTIME、RUN 空目录元数据；
- 明确禁止读 ORIGINAL、BASELINE、CONTROLS、三副本、历史证据；
- C04 使用单一 `p0-stage.ps1`，只写 `TOOLS`/`BOOTSTRAP`/`OUT\C04`/`TMP`；
- S1 顺序固定为 C04→C05，C05 未通过不得进入 S2。

**状态：** 已闭合。

### B3：C10 启动真实 Vitest

**V2：** C10 是 `p0-realcopy-check.cjs`，S5 却声称验证“实际 Vitest 工作进程”；命令与声明不匹配。

**V3：**

- C10 改为 `p0-c10.ps1`，直接调用副本内 `vitest.mjs run`，使用 `--pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism`；
- 通过 `NODE_OPTIONS=--require ...fs-guard.cjs` 让父进程与真实 fork worker 继承守卫；
- 执行 `test/string-decoder.test.ts` 作为最小真实测试；
- 检查 `guard.jsonl`：至少一条 `role=worker` 的 `preload`；拒绝读 `ORIGINAL\package.json`；拒绝写 `PRISTINE\dist\p0-deny-probe`；允许读/写副本/OUT；无越界 allow；无 dist 写入；
- 任一失败 C10 非零退出，S6 不得进入。

**状态：** 已闭合；真实 Worker 继承仍留 S5 动态验证，当前 UNVERIFIED。

### B4：C12 六个静态写入目标

**V2：** 主文档列了六个目标，TSV 只写“登记的六个”；图标条件与审计未逐条绑定。

**V3：**

- C12/C16 的 TSV 与注册表逐条写入：
  `dist/manifest.json`、`devtools.html`、`panel.html`、`panel.css`、`panel-layout.css`、`sandbox.html`；
- 三图标仅在初始清单确实不存在时允许 `CreateNew`；已存在时任何写入即 FAIL；
- 其他 JS/Worker/chunk/sourcemap 禁止；
- 审计规范要求六目标逐个记录写入次数、前后哈希、条件与规则 ID；
- C13 的 `dist` 零写入单独留证。

**状态：** 已闭合。

### B5：C13 控制配置固定

**V2：** 只写“登记的 p0-control-config 工具”，无绝对路径、生成命令、固定哈希、差异清单与机械校验。

**V3：**

- 固定路径 `NO_PLUGIN\control.vite.config.mjs`；
- 固定模板 325 字节，UTF-8 无 BOM/LF，SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`；
- 生成命令固定为 `p0-no-plugin.cjs`，以 `CreateNew` 写入；
- 必须复算哈希；必须以副本内 `vite.config.ts` 为基准输出 `config-diff.json`；
- 必须证明仅 `plugins` 变化、恰好移除一个 `copy-extension-files`、其他顶层键/测试配置/别名/构建配置不变；
- 必须先记录 `dist` 前后清单，再运行 Vitest；`dist` 任何写入即 FAIL。

**状态：** 已闭合。

### B6：C00/C02 不允许二选一

**V2：** C00 是“whoami 或已登记查询”；C02 是“原生命令正文或只读引导脚本”。

**V3：**

- C00 只保留一条 `cmd.exe`：whoami、环境变量、RUN/TOOLSRC 存在性、清单哈希校验；退出码 43/44 固定；
- C02 只保留 `p0-acl.ps1` 一条 `powershell.exe -File` 命令；
- 不再保留第二形态；组名固定 `CodexSandboxUsers`，不存在即失败。

**状态：** 已闭合。

## 3. 其他修正

### B8：C07 清单角色边界

**V3 新增：**

- 唯一角色 `manifest-reader`，仅管理员；
- Codex 只能读 C07 输出，不能运行 C07；
- 产品测试 C10—C16 不得调用 C07、不得继承角色、不得把原项目内容作为测试输入；
- `before-command/after-command` 的 `--command-id` 只能取注册表枚举；
- 原项目读取成功在 C07/C08 是授权行为；未授权角色读取成功即 FAIL。

**状态：** 已闭合。

### B9：审计格式的阶段分类

**V2 的矛盾：** 审计格式既像执行细节，又像验收报告字段，未明确是否为启动前置条件。

**V3：**

- 明确为 **Phase 0 启动前置条件**；
- C01 创建 `OUT` 后立即初始化审计链；`RUN` 根创建是唯一 `bootstrap_root_create` 例外；
- C04/C05 验证工具发布含审计器；C06—C20 缺审计即 fail closed；
- C12/C16 六目标、C13 零 dist、C07/C08 读取、C03 拒绝写均按统一 schema 留证。

**状态：** 已闭合。

### B7：R01 动态验证细节

**V3：** 不提前伪造 Phase 1 证据。明确在 Phase 1 开始前补齐：

- 20 行矩阵的具体输入夹具；
- 真实 Worker/定时器/传输层故障注入方式；
- 可执行 harness、命令、输出与证据格式；
- 逐用例预期、失败码、停止条件；
- 全部 run（含失败）、资源计数、竞争顺序。

**状态：** 按用户指示安排在 Phase 1 前；R01 保持 PARTIAL。

## 4. 命令级变更摘要

| 命令 | V2 | V3 |
|---|---|---|
| C00 | whoami 或环境查询二选一 | 单一 `cmd.exe`，身份+环境+清单哈希；43/44 退出码 |
| C01 | 初始化脚本模板 | 固定 `p0-init.ps1`，固定 RUN，CreateNew 哨兵，先建 OUT/audit |
| C02 | Get-Acl/Set-Acl 或脚本二选一 | 固定 `p0-acl.ps1`，固定 SID/组名 |
| C03 | 只读探针模板 | 固定 `p0-codex-probe.ps1`，Codex 账户，无写 |
| C04 | 工具生成/复制模板 | 固定 `p0-stage.ps1`，只读 TOOLSRC，禁 ORIGINAL |
| C05 | `p0-tool-integrity.cjs` | 固定 `p0-verify-release.ps1`，清单哈希 + 全文件复算 |
| C06 | V2 旧的 `--case` 模板 | 固定 cases 文件、固定 CONTROLS/OUT/TMP，fs-guard |
| C07 | V2 旧的 `--source` 模板 | 固定四模式、固定 command-id 枚举、manifest-reader 边界 |
| C08 | 归档模板 | 固定 BASELINE/snapshot-01、M0、逐条哈希 |
| C09 | 三副本模板 | 固定 PRISTINE/NO_PLUGIN/SANDBOX 与 C09-E01 |
| C10 | `p0-realcopy-check.cjs` | `p0-c10.ps1` 直接启动真实 Vitest fork worker，guard 继承检查 |
| C11 | tsc 模板 | 固定 `tsc.js -p ... --noEmit`，fs-guard，产物树前后核对 |
| C12 | 六目标摘要 | 六目标逐条 + 条件图标 + 审计字段 |
| C13 | 控制配置工具模板 | 固定路径/模板/哈希/差异/零 dist |
| C14 | 中和模板 | 固定 mapping、SANDBOX、逐文件前后哈希 |
| C15 | tsc 模板 | 固定 `--noEmit`、fs-guard、与 C11 对照 |
| C16 | Vitest 模板 | 与 C12 同六目标、同审计、同条件图标 |
| C17 | 差异模板 | 固定 M0/M1/copies/results，只读汇总 |
| C18 | 第二归档模板 | `SECOND_ARCHIVE` 未绑定即 DISABLED；不换位置 |
| C19 | 索引模板 | 新段 CreateNew，引用前段哈希 |
| C20 | 报告模板 | 固定 OUT/REVIEW，C18 未完成只能报未满足出口 |

## 5. 未改变项

- 阶段顺序仍为 **0 → 3 → 1 → 2 → 4 → 5 → 6 → P**。
- Phase 1/2 联合回滚保持。
- R05 OPEN、R16 OPEN、R01 PARTIAL。
- 独立评级仍 **0 CLOSED / 23 PARTIAL / 2 OPEN**。
- `tsc --noEmit` 仍是所有 TypeScript 检查的唯一形式。
- 安全指标不降低：false-replacement=0、Source Integrity=100%、SRR=100%、发生替换时 Precision=100%；分母 0 写 `n/a`；零替换不自动通过；哈希不符标 `version-mismatch`。
- 第二归档、W2-B、D1/D2/D5/D7/D8/D9/D11/D13/D16 未代批。

## 6. 本轮未执行

- 未运行 C00—C20、测试、tsc、构建、浏览器、L1、Phase 0；
- 未创建 `D:\P47RUN` 或 `D:\P47TOOLS`；
- 未修改 ACL、产品代码、产品配置、产品测试、dist 或历史证据；
- 未修改 V5、追溯表、第五轮报告或任何评级。

V3 文件字节数、行数与 SHA-256 在交付回复中公布；变更记录本身不构成执行授权。
