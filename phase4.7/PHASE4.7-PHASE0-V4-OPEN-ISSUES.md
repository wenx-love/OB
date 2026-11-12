# OB-Recover Phase 4.7：Phase 0 V4 尚未解决问题清单

日期：2026-11-11。状态：待第七轮独立复核；不是 Phase 0 执行结果。

## 1. 冻结评级

**0 CLOSED / 23 PARTIAL / 2 OPEN。**

- OPEN：R05、R16。
- PARTIAL：R01、R02、R03、R04、R06、R07、R08、R09、R10、R11、R12、R13、R14、R15、R17、R18、R19、R20、R21、R22、R23、R24、R25。
- R01 保持 PARTIAL；20 行故障注入矩阵的 fixture/harness 仍在 Phase 1 开始前补齐。
- 本清单不改任何 R 评级；V4 的 B 项契约修订不等于动态通过。

## 2. B1—B9 状态

| 项 | V4 状态 | 说明 |
|---|---|---|
| B1 首次完整性 | 契约闭合；发布包缺失 | C00 内联预检 + C05-PRE 在 C01 前全包 19 文件验证 + dispatcher 目标复核 + C05-FINAL staged 16 文件复核；TOOLSRC 未提供 |
| B2 C04 读取 | 契约闭合 | 目标必须不存在；不复用；只读 TOOLSRC/RUNTIME；C05-FINAL 读 staged |
| B3 C10 Worker | 契约闭合；动态未验 | P/N/S 测试专用配置；真实 fork；缓存 node_modules/.vite；dist 保护 |
| B4 六静态目标 | 契约闭合；动态未验 | 六目标逐条；图标写前 predicate；其他 dist 写前拒绝 |
| B5 控制配置 | 契约闭合；生成未运行 | 8 行、LF、无末尾 LF、325 字节、18a061…；C10-N 前置；零 dist |
| B6 身份 | 契约闭合；SID 待用户确认 | 实际 WENX\Administrator SID；C00/C02 严格校验；Codex 不扩权 |
| B7 R01 | Phase 1 前完成 | 不伪造；保持 PARTIAL |
| B8 C07 | 契约闭合；动态未验 | 子执行独立；M0/M1/前后各一次；Codex 只读输出 |
| B9 审计 | 契约闭合；动态未验 | 单一审计根；有限 bootstrap；intent/result；C03 观察者；C07 子执行 |

## 3. 启动阻断与未决事项

### U01：TOOLSRC 发布包未提供（Phase 0 启动阻断）

- 固定路径：`D:\P47TOOLS\p47-phase0-v4`。
- 需要用户提供 19 个文件、批准 `RELEASE-MANIFEST.json` 的 SHA-256，并设置 `P0_TOOLSRC_MANIFEST_SHA256`。
- 缺少发布包：C00 退出 44；C05-PRE/C01—C20 全部禁用；不得用空脚本、占位工具、ORIGINAL `node_modules` 或下载替代。
- 发布包行为（dispatcher/verifier/audit/fs-guard）尚未动态验证；C05 只证明字节完整，不证明语义正确。

### U02：账户 SID 的用户确认（B6 启动条件）

- 已批准账户名为 `WENX\Administrator`；历史文本没有记录 SID。
- 本机只读解析/当前令牌得到 `S-1-5-21-2104787571-1265941319-592731904-500`；V4 使用该值。
- 用户必须在启动批准记录中确认 `P0_ADMIN_ACCOUNT_SID`；不确认则 C00/C02 禁用。
- 不得用 `S-1-5-32-544`（Administrators 组）替代；不得因 Codex 读不到而扩权。
- 该 SID 不是历史文本中的“已批准值”，V4 不伪造历史批准；若用户拒绝该绑定，保持阻塞。

### U03：SECOND_ARCHIVE 未指定（出口阻断）

- C18 需要用户明确指定绝对路径；未指定 `state=DISABLED`。
- C18 未完成，Phase 0 不得关闭；失败不得换位置；C20 仍必须生成 `exit-not-met` 报告。
- 不得使用 TEMP、默认目录或“以后补”。

### U04：R05 仍 OPEN

- `placeholderSeq` 同步键与非 force 合并冲突未解决。
- Phase 1 先形成经审查的规格修订，再实现/验证；不按冲突规格开工。

### U05：R16 仍 OPEN

- 容器 token 等值与旧 `commitSeq` 高水位冲突未解决。
- Phase 4 正式测量前统一渲染快照/逐脚本覆盖；零候选、跨纪元、旧卡移除同一定义。
- 未解决只能 `render-unverified`，不得签发渲染通过。

### U06：R01 仍 PARTIAL（Phase 1 前补齐）

- 20 行矩阵的具体输入夹具、执行 harness、故障注入、逐用例失败码、资源计数、全部 run 证据未完成。
- 本轮没有 Vitest/tsc/Phase 1 运行；不得把设计索引当动态通过。
- R01 不因 V4 文档自动 CLOSED。

### U07：未批准决策

仍待用户决定，V4 不代签：

- D1、D2、D5、D7、D8、D9、D11、D13、D16。
- 各阶段前按 V5/阶段门落实；不得以 V4 默认批准。

### U08：W2-B 执行者与授权

- 执行者、独立写入授权、隔离范围未指定。
- 未指定前不执行 W2-B；不并入 Phase 0；W2-A 只读不能冒充独立实跑。

### U09：L1 根因

- 原始 L1 仍 `blocked`；两次 nextpage 取证 connect-timeout，根因 unknown；修正后的 nextpage3 从未运行。
- 不归因、不消耗 L1 预算、不触发 L1；预算仍 100 总额、已用 17、剩余 83。

### U10：Phase 0 动态项全部 UNVERIFIED

尚未运行，不能写成 PASS：

- ACL 实际读回、Codex 只读/写拒绝、C03 观察者实时性；
- C05-PRE 19 文件/C05-FINAL 16 文件、dispatcher 目标复核；
- C06 模拟假树阳性/阴性、预期拒写、禁止读；
- C09 三副本同源/隔离/硬链接；
- C10-P/N/S 真实 fork、worker preload、拒读/拒写、缓存精确；
- C11/C15 零编译产物；
- C12/C16 六目标、图标 predicate、实际 closeBundle 频次；
- C13 控制配置生成/差异/零 dist；
- C14 映射可逆；
- C18 第二归档；
- C19/C20 链头/报告。

### U11：C12/C16 实际写入频次未知

- `closeBundle` 实际调用次数、六目标是否每次必写、三图标初始存在性：均待 S6/S7 观测。
- V4 只固定允许范围/写前 predicate/审计，不预称“每次正好两次”。
- 其他 dist 写入即 FAIL；图标已存在仍写即 FAIL。

### U12：工具发布包行为未验证

- `p0-dispatch.ps1`、`p0-verify-release.ps1`、`p0-audit.cjs`、`fs-guard.cjs`、`p0-c10.ps1`、`p0-no-plugin.cjs` 等只有契约，没有本轮实现/运行。
- C05 只验证字节完整；S2/S5/S6/S7 才验证行为。
- 失败不得改期望哈希、关守卫、换工具、放宽范围。

### U13：C07 子执行与审计规模

- C07 目标枚举 15 个执行，加 M0/M1，共最多 32 次调用；每次独立 output/audit/summary。
- 实际子执行次数/链头段数/存储规模未运行；不得复用 `C07-E01` 或覆盖 summary。

### U14：原始项目历史元数据未知变化

- 11-10 22:48:38 整树元数据变更（2312/2328 项）原因 unknown；TEMP 与项目对 CodexSandboxUsers 有显式“修改”权限；22:48 前逐文件 USN 记录被覆盖。
- Phase 0 只读取/记录，不修复、不归因豁免；新变化标 `source-unknown`。

## 4. 阶段分类

- B1/C05 发布包：Phase 0 启动前外部输入；当前阻断。
- B6 账户 SID：Phase 0 启动前用户确认；当前阻断。
- B9 审计：Phase 0 启动前置；C01 初始化；当前动态未验。
- B7 R01：Phase 1 前补齐，不是 Phase 0 启动条件。
- U03 SECOND_ARCHIVE：可在 S8 前补，但未完成不得关闭 Phase 0。
- C10-N/C10-S、C12/C16、C13、C15/C16：Phase 0 内部硬门；失败停止，不进入下一阶段。

## 5. 安全指标

- false-replacement=0；
- Source Integrity=100%；
- SRR=100%；
- 有替换时 Precision=100%；
- 分母 0 写 `n/a`；
- 零替换不自动通过；
- 哈希不符标 `version-mismatch`。

本轮没有实测，不能写成通过。

## 6. 下一步

1. 等待 Codex 第七轮独立复核 V4 七份文件。
2. 复核通过后，由用户决定是否确认账户 SID、提供 TOOLSRC v4 发布包并批准清单哈希。
3. 用户另行下达“开始 Phase 0”指令，才执行 C00。
4. 不自动进入 Phase 3；不自动改任何 R 评级。

本清单与 V4 主文档、白名单、注册表、审计规范、变更记录、自检共同交付；字节数/SHA-256 在回复中公布。

