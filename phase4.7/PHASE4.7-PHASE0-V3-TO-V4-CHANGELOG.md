# OB-Recover Phase 4.7：Phase 0 启动包 V3→V4 变更记录

日期：2026-11-11。性质：文档修订记录，不是 Phase 0 执行结果。

## 1. 输入与结论

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `CODEX-P47-PHASE0-V3-SIXTH-INDEPENDENT-REVIEW.md` | 27197 | `2e349cbf6b286c06bb853c65c7df2aa2c3dbbd5fefb2aac6e10d13a5786853bd` |
| V3 主文档 | 25942 | `303acd07e90bafe349481ffad5cad9a09de422a7381708d55cef5bd02d380688` |
| V3 白名单 | 11796 | `26554854da2155e8ce5b1ea54f5a6eb215ebb520e4d087dbb49ddaad844a4331` |
| V3 注册表 | 98425 | `6042b4b27b651b94db61bcf2527c60e668a7e9c8f158d3477c20c0a69f3c6b6d` |
| V3 审计规范 | 10862 | `d6c4fe871dc3b9e7c252a325485a42a92cd4a933107cad47178666151dd0d7fd` |
| V3 变更记录 | 9576 | `1e6140bbe6d7cc831b7d44269ef26473f2a0dc7e01da696963b3c021fe5e1c6f` |
| V3 未决清单 | 6684 | `9fcb796d497fe2eb3af6ad7eb4e9382e3634675673892a5542434c3d5b29d524` |

第六轮结论为 **REJECTED**；B1—B9 为 4 OPEN / 5 PARTIAL。V4 只修启动包契约，不改变 R 系列：**0 CLOSED / 23 PARTIAL / 2 OPEN；R05/R16 OPEN，R01 PARTIAL**。

## 2. 四个 OPEN 的修复

### B1：首次执行完整性（OPEN → 契约闭合，发布包仍缺）

**问题：** C01 在 C05 逐文件验证前执行 TOOLSRC 脚本；C00 只验清单本体。

**V4：**

- C00 内联 PowerShell，不执行 TOOLSRC 脚本；验账户名/SID/管理员令牌、清单哈希、schema/release、dispatcher/verifier/audit 三个关键文件哈希。
- C05-PRE 在 C01 前、无 RUN 状态下，通过已验证 dispatcher 调用 verifier，复核全部 19 个发布文件、字节数、SHA-256、集合、链接/重解析。
- C01—C04 只通过已验证 dispatcher 执行；dispatcher 在加载目标脚本前再次复算目标/audit 哈希。
- C04 落盘 16 个 staged tool/case 文件；C05-FINAL 复核后才允许 C06。
- 工具包/用户批准清单哈希缺失：C00 失败，C05-PRE/C01—C20 全部禁用。
- 不接受脚本自证、不生成/代签哈希、不从 ORIGINAL node_modules 取工具。

**状态：** 契约闭合；TOOLSRC 发布包仍未提供，行为 UNVERIFIED。

### B3：C10 真实 Worker 与 Vite 配置冲突（OPEN → 契约闭合）

**问题：** 原样配置的 `copy-extension-files.closeBundle` 会写 dist；C10 又要求 dist 零写；缓存路径也错误。

**V4：**

- C10-P/N/S 使用测试专用配置 `COPY\p0-probe.vite.config.mjs`，只导入 `./vite.config.ts` 并过滤 `copy-extension-files`；不执行原插件，故不写 dist。
- C10 仍启动真实 Vitest fork worker：`--pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism`，执行 `test/string-decoder.test.ts`；`NODE_OPTIONS=--require fs-guard.cjs`。
- 三变体：C10-P=PRISTINE、C10-N=NO_PLUGIN、C10-S=SANDBOX；C11/C12 用 P，C13 用 N，C15/C16 用 S。
- 缓存改为实际 `node_modules\.vite` / `.vite-temp`；`TEMP/TMP` 指向副本 `tmp`；不再用根 `.vite` 或通配符。
- C10 写前 protected write=`COPY\dist`；测试配置、缓存、tmp、OUT、审计是唯一写 allow。
- 守卫检查 worker preload、拒读 ORIGINAL、拒写 dist、允许副本读/OUT 写；失败即停。
- C12/C16 才加载原样配置并观测六目标；C13 使用 no-plugin 控制配置，dist 零写。

**状态：** 契约闭合；真实 Worker/缓存/写入频次 UNVERIFIED。

### B6：C02/C00 身份（OPEN → 契约闭合，SID 需用户确认）

**问题：** C02 使用 `S-1-5-32-544`（Administrators 组），不是实际账户；C00 只打印身份、子命令依赖 PATH、哈希匹配是子串。

**V4：**

- 已批准账户名：`WENX\Administrator`；本机只读解析和当前令牌核对得到 SID `S-1-5-21-2104787571-1265941319-592731904-500`。
- 历史文本没有记录 SID；V4 把它作为“已批准账户名的确定绑定”，要求用户在启动记录中确认 `P0_ADMIN_ACCOUNT_SID`，不谎称历史已批准该 SID。
- C00 内联 PowerShell 严格比较名称、SID、管理员角色、`P0_ADMIN_ACCOUNT_SID`、64 位清单哈希；不再用 `whoami`/`certutil`/`findstr` 子串匹配。
- C02 参数固定 `-AdminAccount WENX\Administrator -AdminSid ...-500 -SystemSid S-1-5-18 -CodexGroupName WENX\CodexSandboxUsers`；不添加 Administrators 组；只给 Codex 组读取+执行。
- C02 先校验当前身份/SID/管理员角色，再改 ACL；读回 SDDL/ACE；父 `D:\P47RUN` 精确禁止写，RUN 子目录可写。
- Codex 不因 C02 获得管理员或写权限。

**状态：** 契约闭合；SID 用户确认是启动条件，ACL/身份动态验证仍 UNVERIFIED。

### B9：审计协议（OPEN → 契约闭合）

**问题：** bootstrap 例外不足；两套审计目录；C03 只读却要求写；schema 缺 read/preload/source/target；单事件含写后哈希但要求先有事件；C07 复用执行号；审计器归属未指定。

**V4：**

- 唯一审计根 `OUT\audit\Cxx\Cxx-E01`；`chain-head.jsonl` 唯一；删除 `OUT\Cxx\Cxx-E01\write-audit` 第二套。
- C01 只允许 B0—B5 有限 bootstrap：父目录/RUN/OUT/OUT\audit/C01审计目录/sink 创建；可信内存记录后 flush；B5 是 `audit_control`，不递归；哨兵/init 之后才写。
- 写入改为 `write_intent`→动作→`write_result`；intent 失败不写；result 失败停止；拒绝写也成对记录。
- schema 增加 `event_type`、`read`/`preload`、`source_path`/`target_path`、`before_sddl`/`after_sddl`、`intent_id`、`recorder`/`observer_id`、空值规则。
- C03 Codex 只写 stdout；管理员观察者写转写/审计；`actor=Codex`、`recorder=Administrator`。
- C07 使用 C07-M0-E01、C07-B-${TARGET_EXEC_ID}-E01、C07-A-${TARGET_EXEC_ID}-E01、C07-M1-E01，各自独立 output/audit/summary；不得复用 `C07-E01`。
- 发布包新增 `p0-audit.cjs`（role=audit）与 `p0-dispatch.ps1`（dispatcher）；C00/C05-PRE/C05-FINAL 验证其哈希。
- C12/C16 图标条件在 guard 写前 predicate 执行；不是事后审计。
- C20 在 C18 完成/禁用/失败时均生成报告；`phase0_exit_status=complete|exit-not-met`。

**状态：** 契约闭合；审计链、链头、C03 观察者、C07 子执行仍 UNVERIFIED。

## 3. 五个 PARTIAL 的修复

### B2：C04 读取（PARTIAL）

- C04 不再复用目标；目标必须不存在，C05-FINAL 才读取/核验 staged 文件。
- C04 只读 TOOLSRC/RUNTIME 和 RUN 空目录元数据；不读 RUN 目标内容。
- 不允许从 ORIGINAL 读取/执行工具；链接/重解析/路径逃逸拒绝。
- 仍留动态：C04 文件落盘、C05 staged 哈希。

### B4：C12/C16 六目标（PARTIAL）

- 六个路径逐条登记；图标条件由 guard 的 `P0_ICON*_PRESENT` predicate 在写前执行。
- 其他 dist JS/Worker/chunk/sourcemap 不在 write allow，写前拒绝。
- 缓存改为 `node_modules\.vite`/`.vite-temp` 与 `tmp`；`TEMP/TMP` 固定。
- 仍留动态：实际 closeBundle 频次、图标初始状态、写入次数。

### B5：C13 控制配置（PARTIAL）

- 固定 8 行、LF、无末尾 LF、325 字节、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`。
- 固定路径 `NO_PLUGIN\control.vite.config.mjs`；只移除一个 `copy-extension-files`；其他键不变。
- C13 使用 C10-N 前置；dist 零写；缓存精确。
- 仍留动态：实际生成、config-diff、Vitest 结果。

### B7：R01（PARTIAL）

- 不提前跑 Phase 1；20 行矩阵仍只作索引。
- Phase 1 开始前必须补齐具体 fixture/harness/故障注入/逐用例失败码/资源计数。
- R01 保持 PARTIAL；不因 V4 文档升级。

### B8：C07（PARTIAL）

- 子执行编号独立；M0/M1 各一次；before/after 每个 target 各一次。
- 每个子执行独立 output/audit/summary；不覆盖。
- 仅管理员 manifest-reader；Codex 只读输出；C10—C16 禁用。
- 仍留动态：实际进程身份、子执行次数、OS 隔离。

## 4. 第六轮 D.1—D.7 逐项对应

| 第六轮项 | V4 处理 |
|---|---|
| D.1 首次执行验证 | C00 内联预检 + C05-PRE 全包验证 + dispatcher 目标复核 + C05-FINAL staged 复核 |
| D.2 C00/C02 身份 | 实际 SID；C00 严格名称/SID/管理员/清单哈希；C02 不添加 Administrators；无 PATH 子命令 |
| D.3 C10 配置冲突 | C10-P/N/S 测试专用配置；真实 fork；dist protected；C12/C16 才用原配置 |
| D.4 缓存/前置/C06 | `node_modules\.vite`/`.vite-temp`；`TEMP/TMP` 固定；C10-N/S 独立；C06 补 NODE_OPTIONS/TEMP/TMP |
| D.5 审计 | 单一审计根；有限 bootstrap；intent/result；C03 观察者；schema 扩展；C07 子执行；audit 模块 |
| D.6 read/deny | 拆成 denied_read/protected_write/write_allow；read allow 只读覆盖；C09/C18/C20 只读快照明确 |
| D.7 C04 复用 | 不复用；目标必须不存在；C05-FINAL 核验 |

## 5. 命令级变化摘要

| 命令 | V4 变化 |
|---|---|
| C00 | 内联 PowerShell；实际账户 SID；严格 64 位哈希；检查 dispatcher/verifier/audit；无写 |
| C05 | PRE 在 C01 前、FINAL 在 C04 后；两个独立子执行 |
| C01 | dispatcher 执行 p0-init；有限 bootstrap B0—B5；不复制工具 |
| C02 | 实际 SID/账户；Codex 组只读；父目录精确保护 |
| C03 | 内联 Codex 探针；管理员观察者写转写/审计 |
| C04 | 目标不存在；只落工具；不复用/不读目标内容 |
| C06 | NODE_OPTIONS/TEMP/TMP；audit 模块；controls 写 |
| C07 | 子执行集合；M0/M1/before/after 独立 |
| C08/C09 | 审计根；C09 保护 baseline |
| C10 | P/N/S 三变体；测试专用配置；精确缓存；dist 保护 |
| C11/C15 | tsc 依赖哈希对 copies.json；缓存移除；audit 根 |
| C12/C16 | 六目标 + 图标 predicate；精确缓存；原样插件 |
| C13 | 控制配置无末尾 LF；C10-N 前置；dist 零写 |
| C14 | 映射/审计；不改其他副本 |
| C17 | M1/C16 前置；只读汇总 |
| C18 | C17 前置；未绑定禁用；失败不换位置 |
| C19 | C17/C18 状态；append-only 索引 |
| C20 | C18 完成/禁用/失败均报告；exit-not-met |

## 6. 未改变项

- 阶段顺序 **0 → 3 → 1 → 2 → 4 → 5 → 6 → P**。
- Phase 1/2 联合回滚。
- R05 OPEN、R16 OPEN、R01 PARTIAL；0/23/2。
- 所有 TypeScript 检查仍强制 `tsc --noEmit`。
- 安全指标：false-replacement=0、Source Integrity=100%、SRR=100%、有替换时 Precision=100%、分母 0 写 `n/a`、零替换不自动通过、哈希不符 `version-mismatch`。
- D1/D2/D5/D7/D8/D9/D11/D13/D16、W2-B、SECOND_ARCHIVE、L1 未代批/未触发。

## 7. 本轮未执行

未运行 C00—C20、Vitest、tsc、Vite build、浏览器、L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未修改 ACL、产品源码/配置/测试/dist/历史证据；未改 V3 或 R 评级。

V4 文件字节数、行数和 SHA-256 在交付回复中公布。

