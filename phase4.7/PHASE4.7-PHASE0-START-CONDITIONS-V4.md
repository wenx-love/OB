# OB-Recover Phase 4.7：Phase 0 启动条件 V4（正式候选，待第七轮独立复核）

日期：2026-11-11。性质：执行前契约修订，不是执行结果、独立复核通过记录或 Phase 0 启动授权。

## 1. 输入、范围与冻结结论

本轮只修订 Phase 0 启动准备包。不执行 C00—C20、Vitest、tsc、Vite build、浏览器或 L1；不创建 `D:\P47RUN` 或 `D:\P47TOOLS`；不修改 ACL、产品源码、产品配置、测试、`dist` 或历史证据。

已核对输入：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `CODEX-P47-PHASE0-V3-SIXTH-INDEPENDENT-REVIEW.md` | 27197 | `2e349cbf6b286c06bb853c65c7df2aa2c3dbbd5fefb2aac6e10d13a5786853bd` |
| `PHASE4.7-PHASE0-START-CONDITIONS-V3.md` | 25942 | `303acd07e90bafe349481ffad5cad9a09de422a7381708d55cef5bd02d380688` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V3.tsv` | 11796 | `26554854da2155e8ce5b1ea54f5a6eb215ebb520e4d087dbb49ddaad844a4331` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V3.json` | 98425 | `6042b4b27b651b94db61bcf2527c60e668a7e9c8f158d3477c20c0a69f3c6b6d` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V3.md` | 10862 | `d6c4fe871dc3b9e7c252a325485a42a92cd4a933107cad47178666151dd0d7fd` |
| `PHASE4.7-PHASE0-V2-TO-V3-CHANGELOG.md` | 9576 | `1e6140bbe6d7cc831b7d44269ef26473f2a0dc7e01da696963b3c021fe5e1c6f` |
| `PHASE4.7-PHASE0-V3-OPEN-ISSUES.md` | 6684 | `9fcb796d497fe2eb3af6ad7eb4e9382e3634675673892a5542434c3d5b29d524` |
| V5 Candidate（对照） | 71817 | `4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9` |
| 第五轮独立报告（对照） | 29641 | `f73b172f9dea957d2b60d811a4dd0cfc7a6201fc53b912138ac3a200f73df572` |

V3 文件保留原样；V4 是修订候选。获批后以 V4 及配套文件为准，**不与 V3 的读/写/审计许可取并集**。

**R 系列冻结不变：0 CLOSED、23 PARTIAL、2 OPEN。**

- OPEN：R05、R16。
- PARTIAL：R01、R02、R03、R04、R06、R07、R08、R09、R10、R11、R12、R13、R14、R15、R17、R18、R19、R20、R21、R22、R23、R24、R25。
- R01 保持 PARTIAL；20 行故障注入矩阵的具体夹具/harness 仍只在 Phase 1 开始前补齐。
- 本文件不关闭任何 R 项，也不把 B 项契约修订当作动态通过。

## 2. 执行身份矩阵

### 2.1 已批准账户名与本机解析

历史决策文本（V5 §3.5/§16、V2 §3.5/§4.1）批准的实际执行账户名是 **`WENX\Administrator`**；历史文本没有记录该账户的 SID。2026-11-11 以只读本机账户查询和当前令牌核对，得到：

| 角色 | 账户名 | SID | 权限 |
|---|---|---|---|
| 实施执行 | `WENX\Administrator` | `S-1-5-21-2104787571-1265941319-592731904-500` | RUN 完全控制；ORIGINAL 只读 |
| 系统 | `NT AUTHORITY\SYSTEM` | `S-1-5-18` | RUN 完全控制 |
| Codex 只读 | `P0_CODEX_ACCOUNT`，只能是 `WENX\CodexSandboxOffline` 或 `WENX\CodexSandboxOnLine` | 启动时解析并记录 | RUN 读取/执行，无写 |
| C03 观察者 | `WENX\Administrator` | 同上 | 写 C03 控制台转写与审计，不代替 Codex 读探针 |
| C07 manifest-reader | `WENX\Administrator` | 同上 | 只读 ORIGINAL，写自己的 OUT/审计 |
| 构建/测试子进程 | 继承实施执行账户 | 同上 | 由 dispatcher/fs-guard 限制 |

**SID 证据与限制：**

- 账户名来自已批准 D14/V5 文本；SID 不是历史文本中的已记录值，而是从已批准账户名做本机解析并核对当前令牌得到的确定绑定。
- 用户必须在启动批准记录中确认 `P0_ADMIN_ACCOUNT_SID=S-1-5-21-2104787571-1265941319-592731904-500`；不确认则不启动 C00/C02。不得用 `S-1-5-32-544`（Administrators 组）替代。
- C00 和 C02 都必须同时校验账户名、SID、管理员令牌；只校验组或只打印 `whoami` 不算通过。
- Codex 账户不得是管理员，不得加入 CodexSandboxUsers 之外的写权限组；C02 只给 Codex 组读取与执行。

### 2.2 Codex 身份

- `P0_CODEX_ACCOUNT` 必须由启动记录指定，且只能是 `WENX\CodexSandboxOffline` 或 `WENX\CodexSandboxOnLine`；没有默认值。
- C03 校验当前账户名等于该值、SID 不等于管理员 SID、组成员包含 `WENX\CodexSandboxUsers`。
- Codex 在 RUN 内只读；C03 的转写和审计由管理员观察者写入，不由 Codex 写 RUN。
- C07 只能由管理员 manifest-reader 运行；Codex 只能读 C07 已生成的输出。

## 3. 固定路径

| 名称 | 固定值 |
|---|---|
| ORIGINAL | `D:\Projects\ob-recover` |
| RUN_PARENT | `D:\P47RUN` |
| RUN_ID | `P47-20261111-01` |
| RUN | `D:\P47RUN\P47-20261111-01` |
| TOOLSRC | `D:\P47TOOLS\p47-phase0-v4` |
| TOOL_MANIFEST | `D:\P47TOOLS\p47-phase0-v4\RELEASE-MANIFEST.json` |
| TOOLS | `D:\P47RUN\P47-20261111-01\tools` |
| BOOTSTRAP | `D:\P47RUN\P47-20261111-01\bootstrap` |
| CONTROLS | `D:\P47RUN\P47-20261111-01\controls` |
| BASELINE | `D:\P47RUN\P47-20261111-01\baseline` |
| PRISTINE | `D:\P47RUN\P47-20261111-01\exp\pristine-01` |
| NO_PLUGIN | `D:\P47RUN\P47-20261111-01\exp\no-plugin-01` |
| SANDBOX | `D:\P47RUN\P47-20261111-01\exp\sandbox-01` |
| OUT | `D:\P47RUN\P47-20261111-01\out` |
| AUDIT | `D:\P47RUN\P47-20261111-01\out\audit` |
| CHAIN | `D:\P47RUN\P47-20261111-01\out\audit\chain-head.jsonl` |
| EVIDENCE | `D:\P47RUN\P47-20261111-01\evidence` |
| TRUST | `D:\P47RUN\P47-20261111-01\trust` |
| TMP | `D:\P47RUN\P47-20261111-01\tmp` |
| SECOND_ARCHIVE | 用户指定的绝对路径；未指定前 C18 禁用 |

说明记号：`COPY` 表示当前选定的 PRISTINE/NO_PLUGIN/SANDBOX 副本；`Cxx` 表示命令编号；`Cxx-E01` 表示该命令的子执行。实际可执行路径以执行注册表为准，这些记号只用于说明，不是启动器可接受的路径。

规则：

1. C01 发现 RUN 已存在即失败；不得复用、改名或换父目录。
2. TOOLSRC 位于 ORIGINAL 与 RUN 之外，由用户提供并批准；缺失、不可读或清单哈希不符即 fail closed。
3. SECOND_ARCHIVE 未绑定绝对路径时 C18 `state=DISABLED`；未完成不得关闭 Phase 0。
4. 所有执行编号唯一；C05、C07、C10 使用明确子执行编号，不覆盖旧结果。
5. 本轮不创建上述任何目录。

## 4. B1—B9 的 V4 处置

| 项 | V4 处置 | 状态 |
|---|---|---|
| B1 首次执行完整性 | C00 内联验证清单哈希、dispatcher、verifier、audit 模块；C05-PRE 在 C01 前独立复核全部 19 个发布文件；C01—C04 只通过已验证 dispatcher 执行；每个入口由 dispatcher 在执行前复核目标哈希 | 契约闭合；TOOLSRC 仍未提供，行为 UNVERIFIED |
| B2 C04 读取 | C04 **不复用**目标文件；目标必须不存在；只读 TOOLSRC/RUNTIME 和 RUN 空目录元数据；目标核验交给 C05-FINAL | 契约闭合 |
| B3 C10 真实 Worker | C10 使用测试专用配置（只移除 copy-extension-files），不再加载会写 dist 的原插件；真实 Vitest fork worker；P/N/S 三变体；缓存改为 `node_modules\.vite`/`.vite-temp` | 契约闭合；动态 UNVERIFIED |
| B4 六静态目标 | C12/C16 六目标逐条；图标条件由 guard 的写前 predicate 执行；缓存与临时路径精确；其他 dist 产物写前拒绝 | 契约闭合 |
| B5 控制配置 | 固定 8 行、LF 连接、**无末尾 LF**、325 字节、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`；生成/差异工具由发布包提供 | 契约闭合；实际生成未运行 |
| B6 身份 | C00/C02 使用 `WENX\Administrator` 实际 SID；C00 校验名称/SID/管理员令牌/清单哈希；C02 只授予该账户与 SYSTEM，Codex 组只读；不再使用 Administrators 组 | 契约闭合；SID 需用户启动确认 |
| B7 R01 准备 | 保持 Phase 1 前补齐，不塞入 Phase 0；R01 仍 PARTIAL | 后续前置 |
| B8 C07 边界 | C07 每次调用独立子执行编号、输出、审计和 summary；before/after 每个 post-M0 执行恰好一次；Codex 只读输出；产品测试禁用 | 契约闭合 |
| B9 审计 | 统一 `OUT\audit` 权威根；C01 有限 bootstrap 内存记录；write_intent→动作→write_result；审计追加专用控制通路；C03 管理员观察者；C07 子执行；read/preload schema | 契约闭合；动态 UNVERIFIED |

V4 不把上述“契约闭合”写成“动态通过”。B 项的最终评级由第七轮独立复核给出。

## 5. 首次执行信任链

### 5.1 信任锚

- V4 注册表及本文件由用户批准并公布 SHA-256；这是验证器/命令表的信任锚。
- 用户提供 TOOLSRC 发布包，并另行批准 `RELEASE-MANIFEST.json` 的 SHA-256，写入启动环境 `P0_TOOLSRC_MANIFEST_SHA256`。
- 不接受工具包自证；不接受审查方临时生成或代签清单哈希；不接受“先执行、后补验证”。

### 5.2 C00：唯一内联预检

C00 是**不执行任何 TOOLSRC 脚本**的 PowerShell 内联命令，只做：

1. 当前账户名必须为 `WENX\Administrator`，SID 必须为 `S-1-5-21-2104787571-1265941319-592731904-500`；
2. 当前令牌必须具有管理员角色；`P0_ADMIN_ACCOUNT_SID` 必须等于该 SID；
3. `P0_TOOLSRC_MANIFEST_SHA256` 必须是 64 位十六进制，且与清单实际 SHA-256 完全相等；
4. 清单 schema 必须为 `p47-phase0-tool-release-v1`，release_id 必须为 `p47-phase0-v4`；
5. 在清单中核对 `p0-dispatch.ps1`、`p0-verify-release.ps1`、`p0-audit.cjs` 的字节哈希；
6. 只输出 JSON 到控制台，不写文件。

C00 不创建 RUN，不执行 dispatcher/verifier；任一项不符即退出 43/44/45/46。

### 5.3 C05-PRE：C01 前全包验证

C05-PRE 使用 C00 已验证的 TOOLSRC dispatcher，dispatcher 再验证 verifier；verifier 在**不创建 RUN**的情况下：

- 复核清单自身哈希；
- 枚举 TOOLSRC 的 19 个文件，集合必须完全相等；
- 每个文件复算字节数与 SHA-256；
- 拒绝符号链接、junction、重解析点、路径逃逸、重复路径、额外文件；
- 确认 `p0-audit.cjs` role 为 `audit`，`p0-dispatch.ps1` role 为 `dispatcher`；
- 失败则不创建 RUN，不执行 C01。

C05-PRE 不写文件；结果只到控制台，由 C20 归档。

### 5.4 首次业务脚本

- C01—C04 命令入口是已由 C00/C05-PRE 验证的 `p0-dispatch.ps1`；dispatcher 在调用 `p0-init.ps1`、`p0-acl.ps1`、`p0-stage.ps1` 前再次复算目标文件和 `p0-audit.cjs` 的哈希。
- 目标哈希不符、文件缺失、链接/重解析、清单不一致：dispatcher 不加载目标，直接非零退出。
- C04 将所有工具落到 `RUN\tools` 后，C05-FINAL 用已落盘的 dispatcher/verifier 复核 staged 集合；失败则 C06—C20 禁用。
- 不把脚本内部自检当外部可信验证；脚本内部自检只能作为第二层。

### 5.5 发布包缺失

TOOLSRC 或用户批准哈希缺失时，C00 失败，C05-PRE/C01—C20 全部禁用。不得使用占位工具、从 ORIGINAL `node_modules` 取工具、下载依赖或跳过验证。该缺失是 Phase 0 启动阻断，不是可在执行中临时补的步骤。

## 6. 执行顺序

| 顺序 | 工作 | 命令/子执行 | 通过后才可进行 |
|---|---|---|---|
| S0 | 身份、清单预检、初始化、ACL、Codex 只读 | C00 → C05-PRE → C01 → C02 → C03 | S1；任一失败停止 |
| S1 | 工具落盘与最终核验 | C04 → C05-FINAL | S2；staged 哈希不符停止 |
| S2 | 模拟保护区自测 | C06 | S3；禁止读/写成功、假阴性/假阳性停止 |
| S3 | 权威 M0、归档 | C07-M0-E01 → C08 | S4；M0 未封存/归档不一致停止 |
| S4 | 三副本 | C09 | S5；不同源、链接、共享缓存停止 |
| S5 | PRISTINE 真实 Worker 探针 | C10-P-E01 | S6；无 worker 预载/拒绝探针失败停止 |
| S6 | NO_PLUGIN 探针、原样 tsc/Vitest、无插件 | C10-N-E01 → C11 → C12 → C13 | S7；C10-N/C13 失败停止 |
| S7 | SANDBOX 探针、中和、tsc/Vitest | C10-S-E01 → C14 → C15 → C16 | S8；映射不可逆、C10-S 失败停止 |
| S8 | M1、差异、第二归档、索引 | C07-M1-E01 → C17 → C18 → C19 | S9；M1 覆盖 M0、C18 未记录停止 |
| S9 | 报告并停审 | C20 | 等待独立复核与用户批准；不自动进入 Phase 3 |

强制门：

- C15、C16 必须使用 C10-S-E01；C13 必须使用 C10-N-E01；C11/C12 必须使用 C10-P-E01。
- C10-P/N/S 均使用测试专用配置；C12/C16 才加载原样配置并观测六目标。
- C20 在 C18 未完成、禁用或失败时仍必须生成报告，报告状态为 `exit-not-met`；不得无报告结束，也不得宣称 Phase 0 通过。

## 7. C02：实际账户 ACL

C02 唯一命令通过 dispatcher 调用 `p0-acl.ps1`，参数固定：

- `-AdminAccount WENX\Administrator`
- `-AdminSid S-1-5-21-2104787571-1265941319-592731904-500`
- `-SystemSid S-1-5-18`
- `-CodexGroupName WENX\CodexSandboxUsers`
- `-Run D:\P47RUN\P47-20261111-01`

脚本必须：

1. 先核对当前 `WindowsIdentity` 的名称和 SID 与上述值完全一致，并确认管理员角色；
2. 关闭 RUN 的继承，移除继承 ACE 和未知写 ACE；
3. 仅添加：Admin 账户完全控制、SYSTEM 完全控制、Codex 组读取+执行；
4. 不添加 `BUILTIN\Administrators` 作为唯一授权，不以组 SID 代替账户 SID；
5. 读回 SDDL/逐条 ACE，与期望逐项比对；不符即失败；
6. 只改 RUN，不改 `D:\P47RUN` 父目录 ACL；
7. 不因 Codex 读不到而扩权；读不到即标记位置不可信并停止。

父路径 `D:\P47RUN` 是**精确禁止写入路径**；其子路径 RUN 可写。路径匹配按组件，禁止字符串前缀。

## 8. C03：只读探针与管理员观察者

C03 的 Codex 侧是内联 PowerShell 探针，不写文件：

- 校验 `P0_CODEX_ACCOUNT` 为批准的 Codex 账户；名称必须等于该值；
- SID 不得等于管理员 SID；必须属于 `WENX\CodexSandboxUsers`；
- 读取 `RUN\acl-probe\read-sentinel`，内容必须匹配固定哨兵；
- 对 `RUN\acl-probe\write-access-sentinel` 申请 `Open`/`Write`；必须得到 `UnauthorizedAccessException`；获得写句柄即 FAIL；
- 输出 JSON 结果到 stdout，不写 RUN。

管理员观察者：

- 在 C03 执行控制台旁运行；关联 Codex 进程 PID/账户/SID；
- 把 Codex stdout/stderr 和探针结果实时转写到 `OUT\C03\C03-E01\codex-console.jsonl`；
- 在 `OUT\audit\C03\C03-E01\write-audit.jsonl` 写入 `actor=Codex账户`、`recorder=WENX\Administrator` 的事件；
- 不把 Codex 的成功写当成授权；不代 Codex 执行探针；
- Codex `write_roots=[]`；观察者写权限只限 C03 转写/审计。

## 9. C07：唯一子执行编号

C07 每次调用必须使用独立子执行编号：

- `C07-M0-E01`：M0，只一次；
- `C07-B-${TARGET_EXEC_ID}-E01`：某 post-M0 执行前，每个 target 恰好一次；
- `C07-A-${TARGET_EXEC_ID}-E01`：某 post-M0 执行后，每个 target 恰好一次；
- `C07-M1-E01`：M1，只一次。

`TARGET_EXEC_ID` 枚举为：`C08-E01`、`C09-E01`、`C10-P-E01`、`C10-N-E01`、`C10-S-E01`、`C11-E01`、`C12-E01`、`C13-E01`、`C14-E01`、`C15-E01`、`C16-E01`、`C17-E01`、`C18-E01`、`C19-E01`、`C20-E01`。

规则：

- M0/M1 各一次；before/after 每个 target 各一次；不得重复调用同一子执行编号。
- 每个子执行有独立目录，例如 `OUT\C07\C07-M0-E01\` 与 `OUT\audit\C07\C07-M0-E01\write-audit.jsonl`；before/after 使用各自的 `C07-B-${TARGET_EXEC_ID}-E01` / `C07-A-${TARGET_EXEC_ID}-E01`，不得合并 summary。
- C07 只由管理员 manifest-reader 运行；Codex 只能读输出；C10—C16 不得调用 C07，也不得继承 manifest-reader 令牌。
- C07 不写 ORIGINAL，不修 ACL，不复制内容到副本；M1 不覆盖 M0。

## 10. C10：真实 Worker 与测试专用配置

### 10.1 配置分离

- **原样配置**：`COPY\vite.config.ts`，含 `copy-extension-files` 插件，可能写 dist；只用于 C12/C16。
- **测试专用配置**：`COPY\p0-probe.vite.config.mjs`，固定 8 行、LF、无末尾 LF、325 字节、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`；只导入 `./vite.config.ts` 并过滤 `copy-extension-files`，其他插件/别名/测试配置保留。C10-P/N/S 使用此配置，因此不执行原插件 `closeBundle`，不写 dist。
- C13 使用 `NO_PLUGIN\control.vite.config.mjs`，内容与上述测试专用配置相同；只移除一个插件，其他键不变；`dist` 零写入。

### 10.2 三变体

| 变体 | 副本 | 子执行编号 | 输出 | 通过后解锁 |
|---|---|---|---|---|
| C10-P | PRISTINE | `C10-P-E01` | `OUT\C10\C10-P-E01` | C11/C12 |
| C10-N | NO_PLUGIN | `C10-N-E01` | `OUT\C10\C10-N-E01` | C13 |
| C10-S | SANDBOX | `C10-S-E01` | `OUT\C10\C10-S-E01` | C15/C16 |

每个变体均启动真实 Vitest fork worker：

```text
node.exe COPY\node_modules\vitest\vitest.mjs run --config COPY\p0-probe.vite.config.mjs --pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism --reporter=json --outputFile=OUT\C10\C10-P-E01\vitest.json test/string-decoder.test.ts
```

`NODE_OPTIONS=--require TOOLS\fs-guard.cjs`；`TEMP`/`TMP`=`COPY\tmp`；worker 必须产生 `preload` 事件。

### 10.3 缓存与守卫

真实 Vite/Vitest 缓存路径固定为：

- `COPY\node_modules\.vite`
- `COPY\node_modules\.vite-temp`
- `COPY\tmp`

不再允许副本根的 `.vite`/`.vite-temp`，也不使用通配符。C10 每个变体的 `P0_GUARD_WRITE_ALLOW` 只含：测试配置、上述两个缓存目录、`tmp`、该变体的 `OUT\C10\C10-P-E01`（N/S 分别为 `C10-N-E01`/`C10-S-E01`）、对应 `OUT\audit\C10\C10-P-E01`；`COPY\dist` 是禁止写入根。

拒绝读根：`ORIGINAL`、`BASELINE`、其他副本。守卫必须在父进程和真实 fork worker 中都预载；C10 检查 worker PID/role、拒读 `ORIGINAL\package.json`、拒写 `COPY\dist\p0-deny-probe`、允许读副本和写 OUT。任一失败 C10 非零，后续不得继续。

## 11. C12/C16 六目标与图标 predicate

C12/C16 加载原样配置，允许写入且仅允许：

- `COPY\dist\manifest.json`
- `COPY\dist\devtools.html`
- `COPY\dist\panel.html`
- `COPY\dist\panel.css`
- `COPY\dist\panel-layout.css`
- `COPY\dist\sandbox.html`

图标 `icon16.png`、`icon48.png`、`icon128.png` 的写前 predicate：

- 从该副本初始清单读取 `present_before`；
- `present_before=false`：允许一次 CreateNew；`P0_ICON16_PRESENT=0` 等；
- `present_before=true`：guard 必须在写前拒绝，`P0_ICON16_PRESENT=1`；事后审计发现不算满足条件；
- 其他 dist JS/Worker/chunk/sourcemap 在写前拒绝；不是事后判违规。

缓存仍为 `node_modules\.vite`/`.vite-temp` 与 `tmp`；`TEMP`/`TMP` 指向副本 `tmp`。六目标每次实际写入、频次、前后哈希、是否首次创建都必须入审计。

### 11.1 C13 控制配置

- 固定路径：`D:\P47RUN\P47-20261111-01\exp\no-plugin-01\control.vite.config.mjs`；必须在 NO_PLUGIN 根，不能放入 `.p0` 子目录，否则 `vite.config.ts` 的 `__dirname` 偏移。
- 固定内容：8 行、LF 连接、无末尾 LF、325 字节、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`；只导入 `./vite.config.ts` 并过滤一个 `copy-extension-files`，其他键不变。
- C13 前置：C10-N-E01 通过；`dist` 任何写入即 FAIL；缓存为 `node_modules\.vite`/`.vite-temp` 与 `tmp`；`--config` 指向控制配置。

## 12. 读取/保护写优先级

统一路径策略：

1. `denied_read_roots` 是**绝对不可读**；任何 read allow 不能覆盖。产品角色把 ORIGINAL、BASELINE、其他副本放入此根。
2. `protected_write_roots` 是**不可写**；若同一路径在 `read_allow_roots`，只授予只读，写入仍拒绝。
3. `write_allow_roots` 是唯一可写范围；未列出的写入一律拒绝，不用通配符。
4. `protected_write_paths` 是精确路径（如父目录 `D:\P47RUN`），其子路径可由 write allow 放行；匹配按路径组件，禁止字符串前缀误判。
5. C07/C08 对 ORIGINAL 是显式 `read_allow` + `protected_write`；C09/C18 对 BASELINE 快照是显式只读 + 保护写；C20 对 EVIDENCE/TRUST 同理。
6. C02 不递归禁止 `D:\P47RUN`；只精确保护父目录本身，RUN 子目录可写。
7. 任何成功读取 `denied_read_roots`、任何成功写入 `protected_write_roots`、任何未登记写入：停止，不以“已归因/有日志”豁免。

## 13. 审计生命周期

权威落点唯一：

```text
OUT\audit\Cxx\Cxx-E01\write-audit.jsonl
OUT\audit\Cxx\Cxx-E01\write-summary.json
OUT\audit\chain-head.jsonl
OUT\Cxx\Cxx-E01\...  （命令结果，不放审计副本）
```

C01 引导：

1. 若 `D:\P47RUN` 不存在，创建它；创建 RUN。
2. 创建 `OUT`、`OUT\audit`、`OUT\audit\C01\C01-E01`。
3. 在**可信内存**中记录上述引导写入：路径、操作、主体、时间、结果；这是有限、枚举的自举集合。
4. 以 `CreateNew` 打开 `bootstrap.jsonl`，先写 `audit_control` 头，再把内存中的引导事件按顺序写入；这是唯一 bootstrap 例外，不把整个初始化免审计。
5. 之后所有写入必须是 `write_intent` → 执行 → `write_result`；意图落盘失败则不执行，结果落盘失败则停止且不再写。
6. 审计追加使用专用控制通路，不为每次审计追加再递归记审计；控制通路失败立即停止。
7. C01 的哨兵、初始化 JSON 和后续引导复制都必须在审计槽建立后写入。

C03：Codex 只写 stdout；管理员观察者写 `OUT\C03\...` 和 `OUT\audit\C03\...`；事件包含 `actor=Codex`、`recorder=Administrator`。

C07：每个子执行独立审计段；不得共用 `C07-E01` 或覆盖 summary。

C05-PRE：无 RUN、无写；不产生审计文件；C05-FINAL 写 `OUT\audit\C05\C05-FINAL-E01`。

C20：C18 完成、禁用或失败均必须生成报告；`phase0_exit_status` 为 `complete` 或 `exit-not-met`；不得因 C18 未完成而不报告。

## 14. R05、R16、R01

- **R05 OPEN**：`placeholderSeq` 与非 force 合并冲突未解决；Phase 1 先修规格。
- **R16 OPEN**：token 等值与旧 `commitSeq` 高水位冲突未解决；Phase 4 正式测量前统一。
- **R01 PARTIAL**：20 行矩阵、具体夹具/harness、故障注入、逐用例失败码仍在 Phase 1 前补齐；本轮不伪造动态通过。
- **0/23/2 冻结不变**；不因 V4 文档修订改任何 R 项。

## 15. Phase 0 启动条件

以下全部满足才可向用户申请“开始有限 Phase 0”：

1. 用户批准 V4 主文档、白名单、注册表、审计规范、变更记录、未决清单的哈希。
2. 用户确认 `P0_ADMIN_ACCOUNT_SID=S-1-5-21-2104787571-1265941319-592731904-500` 和 `P0_ADMIN_ACCOUNT=WENX\Administrator`；不确认则不启动 C00/C02。
3. 用户提供 `D:\P47TOOLS\p47-phase0-v4` 发布包，批准 `RELEASE-MANIFEST.json` 的 SHA-256，并提供 `P0_TOOLSRC_MANIFEST_SHA256`。
4. 用户指定 `P0_CODEX_ACCOUNT`，且为两个批准 Codex 账户之一。
5. 用户确认 RUN_ID=`P47-20261111-01`、管理员执行身份、静默窗口，并确认 RUN 不存在。
6. 用户指定 SECOND_ARCHIVE 绝对路径；未指定时 C18 禁用，Phase 0 不得关闭。
7. 审计规范已冻结；C05-PRE 能在不创建 RUN 的情况下通过；C01 能按有限 bootstrap 建立审计链。
8. R05/R16 仍 OPEN、R01 仍 PARTIAL、0/23/2 不变。
9. 用户另行下达“开始 Phase 0”指令；接受 V4 文档不等于授权执行。

不满足任一项：不运行 C00，不创建 RUN，不进入 S0。

## 16. 停止与回滚

- 原项目始终只读；C07/C08 读取不等于写许可。
- C00/C05-PRE 失败：不创建 RUN，不执行任何业务脚本。
- C01/C02/C03、C05-FINAL、C06—C20 任一禁止读/写、审计链断裂、路径越界、哈希不符：立即停止，保存现场。
- 不提升权限、不换目录、不关闭守卫、不照旧重跑、不把 UNVERIFIED 改 PASS。
- 失败副本/日志保留；重试只能从同一已核验快照派生新实验编号。
- C18 未完成只报 `exit-not-met`，不换位置；不自动进入 Phase 3。

## 17. 交付

本轮交付七份 V4 文件：主文档、白名单、执行注册表、审计规范、V3→V4 变更记录、未解决问题清单、自检。文件字节数与 SHA-256 在交付回复中公布。

本轮不执行 Phase 0、测试、构建、浏览器、L1；不修改产品代码、ACL 或历史证据；不改变 R05/R16 OPEN、R01 PARTIAL 或 0/23/2。

审查到此停止，等待 Codex 第七轮独立复核。

## Appendix A：C10/C13 控制配置固定模板

以下 8 行以 LF 连接，**不加末尾 LF**，UTF-8 无 BOM，共 325 字节：

```js
import base from './vite.config.ts';

const plugins = (base.plugins ?? []).filter((plugin) => plugin?.name !== 'copy-extension-files');
if ((base.plugins ?? []).length - plugins.length !== 1) {
  throw new Error('P0 control config must remove exactly one copy-extension-files plugin');
}

export default { ...base, plugins };
```

SHA-256：`18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`。C10 的 `p0-probe.vite.config.mjs` 与 C13 的 `control.vite.config.mjs` 使用同一模板；只允许位于副本根目录。

