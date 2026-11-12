# OB-Recover Phase 4.7：Phase 0 启动条件 V3（待第六轮独立复核）

日期：2026-11-11。性质：执行前的方案与命令契约，不是执行结果、独立复核通过记录或 Phase 0 启动授权。

## 1. 范围、输入与冻结结论

本文件只修订 Phase 0 启动条件与命令契约。本轮不运行工具自测、测试、类型检查、构建、浏览器、L1；不创建 `D:\P47RUN`；不修改 ACL；不修改产品源码、配置或测试；不修改 V5、追溯表、历史证据或独立审查报告。

适用输入：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `PHASE4.7-WORKER-REMEDIATION-PLAN-V5-CANDIDATE.md` | 71817 | `4191639123b24534c5447141ce7b7d6825b19db0677e780519c46f9494a11dd9` |
| `CODEX-P47-V5-FIFTH-INDEPENDENT-REVIEW.md` | 29641 | `f73b172f9dea957d2b60d811a4dd0cfc7a6201fc53b912138ac3a200f73df572` |
| `PHASE4.7-PHASE0-START-CONDITIONS-SUPPLEMENT-V2.md` | 26113 | `b3fe4e720475d93e58ee486600aaa8045fa818974c318166e60352bd04419e66` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V2.tsv` | 11048 | `4203b55052386508065027bc2e1ae0ae32ab19ebca8203c1316eaa8a089c2ec4` |

V2 文件保留原样。V3 是其修订候选；获批后以 V3 及配套文件为准，**不把 V2 与 V3 中矛盾的许可取并集**。

**独立评级固定：0 CLOSED、23 PARTIAL、2 OPEN。**

- OPEN：R05、R16。
- PARTIAL：R01、R02、R03、R04、R06、R07、R08、R09、R10、R11、R12、R13、R14、R15、R17、R18、R19、R20、R21、R22、R23、R24、R25。
- R01 保持 PARTIAL；R05/R16 保持 OPEN；本文件不关闭任何一项，也不把“写了契约”当作动态通过。
- 评级变更只能由后续独立复核与用户裁定，且须另立可追溯记录。

## 2. 固定常量与路径

以下为 V3 登记的**唯一执行值**，不是本轮已创建的对象：

| 名称 | 固定值 |
|---|---|
| ORIGINAL | `D:\Projects\ob-recover` |
| RUN_PARENT | `D:\P47RUN` |
| RUN_ID | `P47-20261111-01` |
| RUN | `D:\P47RUN\P47-20261111-01` |
| TOOLSRC | `D:\P47TOOLS\p47-phase0-v3` |
| TOOL_MANIFEST | `D:\P47TOOLS\p47-phase0-v3\RELEASE-MANIFEST.json` |
| TOOLS | `D:\P47RUN\P47-20261111-01\tools` |
| BOOTSTRAP | `D:\P47RUN\P47-20261111-01\bootstrap` |
| CONTROLS | `D:\P47RUN\P47-20261111-01\controls` |
| BASELINE | `D:\P47RUN\P47-20261111-01\baseline` |
| PRISTINE | `D:\P47RUN\P47-20261111-01\exp\pristine-01` |
| NO_PLUGIN | `D:\P47RUN\P47-20261111-01\exp\no-plugin-01` |
| SANDBOX | `D:\P47RUN\P47-20261111-01\exp\sandbox-01` |
| OUT | `D:\P47RUN\P47-20261111-01\out` |
| EVIDENCE | `D:\P47RUN\P47-20261111-01\evidence` |
| TRUST | `D:\P47RUN\P47-20261111-01\trust` |
| TMP | `D:\P47RUN\P47-20261111-01\tmp` |
| SECOND_ARCHIVE | 用户明确指定的绝对路径；未指定前 C18 禁用 |

规则：

1. C01 发现 `RUN` 已存在即失败；不得复用、改名或选择备用目录。
2. `TOOLSRC` 必须位于 ORIGINAL 与 RUN 之外，由用户提供并批准；缺失、不可读或清单哈希不符即 fail closed。
3. `SECOND_ARCHIVE` 未绑定绝对路径时，C18 不得执行，Phase 0 不得关闭。
4. 所有 `EXEC_ID` 首轮固定为 `C00-E01` 至 `C20-E01`；重试必须使用新实验编号，不得覆盖旧输出。
5. 不授权创建 `D:\P47RUN`、`D:\P47TOOLS` 或任何运行目录作为本轮动作；本轮只在报告目录写文档。

## 3. B1—B9 的 V3 处置

| 项 | V3 处置 | 状态 |
|---|---|---|
| B1 | 21 条命令全部写入执行注册表：固定可执行文件绝对路径、SHA-256、argv、cwd、输入、输出、读写/拒绝根、执行编号和 fail-closed 条件；工具二进制由固定 `TOOLSRC` 发布清单绑定，C00 先验清单哈希，C05 在 C06 前复算全部工具/依赖哈希 | 契约已闭合；TOOLSRC 发布包仍是启动前外部输入 |
| B2 | C04 只读 `TOOLSRC` 与 RUNTIME；C01—C05 均不得读 ORIGINAL；S1 工具准备阶段不接触产品源码 | 已闭合 |
| B3 | C10 改为直接启动**真实 Vitest**：`p0-c10.ps1` 调用副本内 `vitest.mjs run`，通过 `NODE_OPTIONS=--require ...fs-guard.cjs` 让真实 worker 继承守卫；C10 检查 worker 预载、拒绝读/写探针和路径边界，失败即停，S6 不得进入 | 已闭合 |
| B4 | C12/C16 的六个静态写入目标逐条写入白名单与注册表；三图标仅在初始清单缺失时允许；其他 JS/Worker/chunk 一律禁止；审计字段固定 | 已闭合 |
| B5 | C13 控制配置固定为 `NO_PLUGIN\control.vite.config.mjs`，固定模板 325 字节、SHA-256 `18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003`；生成、差异清单和“仅移除一个 copy-extension-files 插件”机械校验全部固定 | 已闭合 |
| B6 | C00 只保留一条 `cmd.exe` 身份/环境/清单哈希查询；C02 只保留 `p0-acl.ps1` 一条执行方式；不再允许二选一 | 已闭合 |
| B7 | R01 动态验证的具体夹具、执行步骤、故障注入和逐用例失败判据安排在 Phase 1 开始前补齐；本轮只保留 20 行索引，不升 CLOSED | Phase 1 前完成 |
| B8 | C07 只允许管理员以 `manifest-reader` 角色运行；Codex 只读 C07 输出；产品测试不得调用 C07，不得把原项目内容带入副本 | 已闭合 |
| B9 | 写入审计规范是 Phase 0 启动前置条件；C01 在 `out` 建立后立即初始化审计链，任何非引导写入前必须有审计槽；C04/C05 验证工具发布包含审计器；缺审计即 fail closed | 已闭合 |

## 4. S0—S9 执行顺序与门

| 顺序 | 工作 | 命令 | 通过后才可进行 |
|---|---|---|---|
| S0 | 身份、清单哈希、初始化、ACL、Codex 只读探针 | C00—C03 | S1；C00 清单哈希不符或 C03 写成功即停 |
| S1 | TOOLSRC 发布包落盘与完整性核验 | C04—C05 | S2；C05 任一工具/依赖哈希不符即停 |
| S2 | 模拟保护区自测 | C06 | S3；任一禁止读成功、禁止写成功、假阴性/假阳性即停 |
| S3 | 权威 M0 与原项目归档 | C07—C08 | S4；M0 未封存或归档不一致即停 |
| S4 | 同源三副本派生与核验 | C09 | S5；三副本不同源、存在硬链接/联接或共享可写缓存即停 |
| S5 | 真实副本守卫与真实 Vitest worker 探针 | C10 | S6；无 worker 预载、拒绝探针失败、路径越界即停 |
| S6 | 原样类型检查、原插件/无插件 Vitest | C11—C13 | S7；tsc 产物、C12 未登记写入、C13 写 dist 即停 |
| S7 | SANDBOX 机械中和、类型检查、Vitest 对照 | C14—C16 | S8；映射不可逆、未登记改写、类型诊断不可解释即停 |
| S8 | M1、差异汇总、第二归档、追加索引 | C07 的 M1、C17—C19 | S9；M1 覆盖 M0、第二归档失败或索引覆盖旧段即停 |
| S9 | 报告并停审 | C20 | 等待独立复核与用户批准；不自动进入 Phase 3 |

强制规则：

- C10 未通过，C11—C16 全部不得执行。
- C11—C13 任一产生未登记写入，停止该实验，不用“重跑干净”掩盖。
- C13 的 `dist` 必须零写入；C12/C16 仅允许 §7 的六目标与条件图标。
- 产品实验（C10—C16）不得读 ORIGINAL；需要回读时只能由 C07/C08 清单/归档角色执行，且不得把内容输入产品测试。
- C18 未完成不得关闭 Phase 0；C18 失败不得换目录重试。
- 完成 S9 后停止，等待第六轮独立复核及用户批准。

## 5. 命令执行注册表与 fail-closed 规则

配套文件：

- `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V3.tsv`：21 条命令的逐命令读写白名单摘要。
- `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V3.json`：固定入口、哈希、argv、cwd、环境、输入、输出、读写/拒绝根和执行编号。
- `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V3.md`：写入审计格式。
- `PHASE4.7-PHASE0-V2-TO-V3-CHANGELOG.md`：逐项变更。
- `PHASE4.7-PHASE0-V3-OPEN-ISSUES.md`：未解决事项。

### 5.1 无未解析占位符

注册表中的路径全部是绝对路径；仅以下两类受控绑定：

1. `SECOND_ARCHIVE`：C18 专用，未由用户给出绝对路径时 `state=DISABLED`，不得用默认值。
2. `C07 --command-id`：只能取注册表列出的固定命令 ID 枚举，不接受自由字符串。

除此之外不得出现未绑定的 run/copy 占位符、`registered-*`、`已登记工具` 之类的自由文本。启动器遇到未知字段、未知命令 ID、未绑定变量、缺失哈希、路径不在允许根内，必须拒绝执行并返回非零退出码。

`deny_roots` 的语义是“拒绝写入及未授权读取”；若同一路径同时出现在 `read_roots`，只授予显式只读，写入仍被拒绝。C09 对 BASELINE 快照、C18 对第一归档、C20 对 EVIDENCE/TRUST 的只读即按此解释。

### 5.2 TOOLSRC 发布包

`TOOLSRC` 是用户提供的只读工具发布包，结构固定：

```text
D:\P47TOOLS\p47-phase0-v3\
  RELEASE-MANIFEST.json
  payload\
    bootstrap\
      p0-init.ps1
      p0-acl.ps1
      p0-codex-probe.ps1
      p0-stage.ps1
      p0-verify-release.ps1
    tools\
      fs-guard.cjs
      p0-simulate.cjs
      p0-manifest.cjs
      p0-archive.cjs
      p0-copy.cjs
      p0-c10.ps1
      p0-no-plugin.cjs
      p0-neutralize.cjs
      p0-compare.cjs
      p0-index.cjs
      p0-report.cjs
      cases\
        p0-simulation-cases-v1.json
        p0-neutralize-map-v1.json
```

`RELEASE-MANIFEST.json` 至少包含：

```json
{
  "schema": "p47-phase0-tool-release-v1",
  "release_id": "p47-phase0-v3",
  "files": [
    {
      "path": "payload/tools/fs-guard.cjs",
      "bytes": 0,
      "sha256": "64位小写十六进制",
      "role": "guard"
    }
  ],
  "entrypoints": {
    "C06": "payload/tools/p0-simulate.cjs",
    "C10": "payload/tools/p0-c10.ps1"
  }
}
```

规则：

- `files` 必须与实际发布的文件集合完全相等；多一个、少一个、重复路径、符号链接、重解析点、路径逃逸均失败。
- 每个文件必须给出字节数和 SHA-256；`C05` 复算并逐项比对。
- 清单自身 SHA-256 由用户在批准记录中固定，C00 通过 `P0_TOOLSRC_MANIFEST_SHA256` 环境变量核对；C05 再次核对。未设置即失败，不使用默认值。
- 工具入口由清单 `entrypoints` 固定；不得执行 `payload` 之外的脚本，不得从 ORIGINAL 或 `node_modules` 取自定义工具。
- 工具发布包不包含产品源码；不得把 `D:\Projects\ob-recover` 下任何文件复制进 `TOOLSRC`。

### 5.3 外部可执行文件哈希

V3 登记以下绝对入口及其当前 SHA-256（用于命令层面的可执行性；工具脚本哈希由 `RELEASE-MANIFEST.json` 绑定）：

| 可执行文件 | 字节 | SHA-256 |
|---|---:|---|
| `C:\Windows\System32\cmd.exe` | 339968 | `15cd209c995b7d3009c91ca40892d5b8f1fb162f3e5f10716642ea278e8e0d7b` |
| `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` | 495616 | `60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f` |
| `D:\Nvm\nodejs\node.exe` | 86997320 | `0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4` |
| `C:\Windows\System32\robocopy.exe` | 192512 | `84abbd32d074881164b8cf6b30593828e53f368c3854854aefe5b3cf06d3e356` |
| `C:\Windows\System32\certutil.exe` | 1589248 | `16d0e3543975b89a560c929bc0f4fb73a54164ac5c93f536ddd2d4befc5e4c86` |
| `C:\Windows\System32\findstr.exe` | 65536 | `867816f8a714a87f5f573ebbe3a526931fbe787cc03b4ec7ac8a970c9d8c0264` |

C05 必须核对这些入口未被替换；任一不符即停。C11/C15 的 `tsc.js`、C12/C16 的 `vitest.mjs` 属于副本依赖，由 C09/C10 的副本清单与工具守卫核验，不从 ORIGINAL 执行。

## 6. B2：C04 工具来源读取边界

C04 命令为单一 `p0-stage.ps1`，固定参数：

```text
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File D:\P47TOOLS\p47-phase0-v3\payload\bootstrap\p0-stage.ps1 -ToolSrc D:\P47TOOLS\p47-phase0-v3 -Run D:\P47RUN\P47-20261111-01 -Out D:\P47RUN\P47-20261111-01\out\C04\C04-E01
```

允许读取：

- `TOOLSRC` 整包（只读）；
- `RUNTIME` 中登记的 `powershell.exe`、`robocopy.exe` 及其必要 DLL；
- `RUN` 中 C01 已创建的空目录元数据。

禁止读取：

- `ORIGINAL` 的任何内容或元数据；
- `BASELINE`、`CONTROLS`、三个副本、历史证据；
- 其他用户目录、网络共享、未登记的 `TOOLSRC` 相邻目录。

C04 只写 `RUN\tools`、`RUN\bootstrap`、`OUT\C04\C04-E01` 和 `TMP`。目标文件已存在且哈希相同则复用；哈希不同或目标为链接/重解析点即失败。`p0-stage.ps1` 不得运行产品 scripts、不得从原项目 `node_modules` 执行、不得下载或隐式安装。C04 完成后 C05 才可运行；C05 失败时 C06—C20 全部禁用。

## 7. B3：C10 真实 Vitest worker 探针

C10 不再使用自定义“看起来像 worker”的检查。固定入口：

```text
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File D:\P47RUN\P47-20261111-01\tools\p0-c10.ps1 -Copy D:\P47RUN\P47-20261111-01\exp\pristine-01 -Tools D:\P47RUN\P47-20261111-01\tools -Out D:\P47RUN\P47-20261111-01\out\C10\C10-E01 -Node D:\Nvm\nodejs\node.exe -Test test/string-decoder.test.ts
```

`p0-c10.ps1` 必须执行以下真实链路：

1. 设置 `NODE_OPTIONS=--require D:\P47RUN\P47-20261111-01\tools\fs-guard.cjs`，使父进程与 Vitest fork worker 都预载守卫。
2. 以 `cwd=PRISTINE` 调用：
   `node.exe D:\P47RUN\P47-20261111-01\exp\pristine-01\node_modules\vitest\vitest.mjs run --config D:\P47RUN\P47-20261111-01\exp\pristine-01\vite.config.ts --pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism --reporter=json --outputFile=D:\P47RUN\P47-20261111-01\out\C10\C10-E01\vitest.json test/string-decoder.test.ts`
3. 设置 `P0_GUARD_MODE=realcopy`、`P0_GUARD_LOG=D:\P47RUN\P47-20261111-01\out\C10\C10-E01\guard.jsonl`、只读根 `PRISTINE;TOOLS;BOOTSTRAP;OUT;TMP`、可写根 `PRISTINE\.vite;PRISTINE\.vite-temp;PRISTINE\tmp;OUT\C10\C10-E01`、拒绝根 `ORIGINAL;BASELINE;NO_PLUGIN;SANDBOX`；对应环境变量为 `P0_GUARD_READ_ALLOW`、`P0_GUARD_WRITE_ALLOW`、`P0_GUARD_DENY`。
4. 守卫在父进程与 worker 预载时各写一条 `preload` 事件，并尝试：
   - 读 `D:\Projects\ob-recover\package.json`，必须被拒绝；
   - 写 `PRISTINE\dist\p0-deny-probe`，必须被拒绝且文件不存在；
   - 读 `PRISTINE\package.json`、写 `OUT\C10\C10-E01\allow-probe.txt`，必须成功。
5. `p0-c10.ps1` 在 Vitest 退出后检查 `guard.jsonl`：至少一条 `role=worker` 的 `preload`；至少一条 `role=worker` 的拒绝读和拒绝写；无任何对 `ORIGINAL/BASELINE/NO_PLUGIN/SANDBOX` 的 `decision=allow`；无 `PRISTINE\dist` 写入。

通过条件：Vitest 退出码 0；`string-decoder.test.ts` 通过；worker 事件存在；拒绝读/写均为 `EACCES/EPERM`；允许读/写成功；无越界 allow；无 `dist` 写入。任一失败，C10 非零退出，S6 不进入。

C10 只写 `PRISTINE\.vite`、`PRISTINE\.vite-temp`、`PRISTINE\tmp`、`OUT\C10\C10-E01`。不得写 `PRISTINE\dist`、历史证据、源码、配置。C10 通过是 C11/C12/C13 的硬门。

## 8. B4：C12/C16 静态写入白名单

C12/C16 加载原样 `vite.config.ts`；`copy-extension-files` 的 `closeBundle` 允许写且仅允许写：

```text
D:\P47RUN\P47-20261111-01\exp\pristine-01\dist\manifest.json
D:\P47RUN\P47-20261111-01\exp\pristine-01\dist\devtools.html
D:\P47RUN\P47-20261111-01\exp\pristine-01\dist\panel.html
D:\P47RUN\P47-20261111-01\exp\pristine-01\dist\panel.css
D:\P47RUN\P47-20261111-01\exp\pristine-01\dist\panel-layout.css
D:\P47RUN\P47-20261111-01\exp\pristine-01\dist\sandbox.html
```

C16 的对应六个目标位于 `D:\P47RUN\P47-20261111-01\exp\sandbox-01\dist\`，文件名相同。`icon16.png`、`icon48.png`、`icon128.png` 仅在该实验初始清单确实不存在时预登记允许创建；若已存在，任何图标写入均 FAIL。

禁止：

- 覆盖或修改其他 `dist\*.js`、`dist\chunks\*`、Worker、sourcemap、manifest 之外的 bundle；
- 写历史 fixture/reference/observed/compare/meta/summary；
- 写源码、测试、`vite.config.ts`、`package.json`；
- 以“插件可能重写”为由扩大六目标之外的范围。

审计：C12/C16 的每个写入事件必须记录 §9 的 `write-audit-v3` 字段；`write-summary.json` 必须给出六目标各自的实际写入次数、前后 SHA-256、是否首次创建、图标条件是否满足。C13 的 `dist` 必须零写入，前后清单单独留证。

## 9. B5：C13 控制配置

固定控制配置路径：

```text
D:\P47RUN\P47-20261111-01\exp\no-plugin-01\control.vite.config.mjs
```

控制配置必须位于 `NO_PLUGIN` 根，不得放入 `.p0` 等子目录；否则 `vite.config.ts` 内的 `__dirname` 基准会偏移，别名/构建路径可能指向错误位置。C13 生成工具必须校验配置位于根目录。

固定模板（UTF-8 无 BOM，LF，325 字节）：

```js
import base from './vite.config.ts';

const plugins = (base.plugins ?? []).filter((plugin) => plugin?.name !== 'copy-extension-files');
if ((base.plugins ?? []).length - plugins.length !== 1) {
  throw new Error('P0 control config must remove exactly one copy-extension-files plugin');
}

export default { ...base, plugins };
```

固定 SHA-256：

```text
18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003
```

生成命令固定为：

```text
node.exe D:\P47RUN\P47-20261111-01\tools\p0-no-plugin.cjs --copy D:\P47RUN\P47-20261111-01\exp\no-plugin-01 --control-config D:\P47RUN\P47-20261111-01\exp\no-plugin-01\control.vite.config.mjs --expected-sha256 18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003 --vitest D:\P47RUN\P47-20261111-01\exp\no-plugin-01\node_modules\vitest\vitest.mjs --out D:\P47RUN\P47-20261111-01\out\C13\C13-E01
```

`p0-no-plugin.cjs` 必须：

1. 以 `CreateNew` 写控制配置，若已存在且哈希相同则复用，不得覆盖不同内容；
2. 复算生成文件哈希，必须等于固定值；不等即失败；
3. 以副本内 `vite.config.ts` 为基准，输出 `config-diff.json`，逐项证明只有 `plugins` 变化、插件数量恰好减少 1、被移除插件名恰为 `copy-extension-files`，其他顶层键、测试配置、别名、构建配置不变；
4. 先记录 `NO_PLUGIN\dist` 前后清单，再以与 C12 相同的 `--pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism` 和 `--config NO_PLUGIN\control.vite.config.mjs` 启动副本内 Vitest；任何 `dist` 写入即 FAIL；
5. 只允许写控制配置、`.vite`、`.vite-temp`、`TMP`、`OUT`；不得写产品配置、测试、历史证据或 `dist`。

C13 与 C12 使用相同的测试集合与固定 argv 规则；C13 不允许跳过失败、减少测试或改写断言。

## 10. B6：C00 与 C02 的唯一执行方式

### C00

只保留一条 `cmd.exe` 命令，执行身份、环境、RUN/TOOLSRC 存在性和 TOOLSRC 清单哈希检查：

```text
cmd.exe /d /s /c "if "%P0_TOOLSRC_MANIFEST_SHA256%"=="" exit /b 43 & whoami /user & whoami /groups & echo COMPUTERNAME=%COMPUTERNAME% & echo USERDOMAIN=%USERDOMAIN% & echo OS=%OS% & echo PROCESSOR_ARCHITECTURE=%PROCESSOR_ARCHITECTURE% & if exist D:\P47RUN (echo RUNROOT_EXISTS=1) else (echo RUNROOT_EXISTS=0) & certutil -hashfile D:\P47TOOLS\p47-phase0-v3\RELEASE-MANIFEST.json SHA256 | findstr /i /c:"%P0_TOOLSRC_MANIFEST_SHA256%" >nul || exit /b 44"
```

- 退出码 43：未提供批准清单哈希；44：清单哈希不符或 `TOOLSRC` 缺失。
- C00 不写文件；控制台结果由 C20 落盘。
- 不再保留“whoami 或 PowerShell 环境查询”的二选一。

### C02

只保留一条执行方式：

```text
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File D:\P47TOOLS\p47-phase0-v3\payload\bootstrap\p0-acl.ps1 -Run D:\P47RUN\P47-20261111-01 -AdminSid S-1-5-32-544 -SystemSid S-1-5-18 -CodexGroupName CodexSandboxUsers -Out D:\P47RUN\P47-20261111-01\out\C02\C02-E01
```

- 不使用 `Get-Acl/Set-Acl` 与“只读引导脚本”二选一；脚本内部可以调用原生命令，但外部入口只有这一条。
- 必须关闭继承、移除未知 ACE、设置管理员/SYSTEM 完全控制、Codex 组只读、读回 SDDL 并写入 OUT；不得修改原项目 ACL。
- `CodexSandboxUsers` 不存在即失败，不猜测其他组名。

## 11. B8：C07 清单角色权限边界

C07 的唯一角色是 `manifest-reader`，执行者只能是经用户授权的管理员。允许模式：

- `M0`：S3 建立权威清单，只写 `BASELINE` 初始化目录和 `OUT\C07`；
- `before-command`/`after-command`：只围绕注册表列出的 post-M0 命令（C08—C20）执行；输出只写 `OUT\C07`；不得用于 M0 之前的 C01—C06；
- `M1`：S8 最终清单，只写 `OUT\C07`，不得覆盖 M0。

边界：

1. 只有 C07、C08 可以读取 `ORIGINAL` 内容；C07 可读默认流与可读 ADS，C08 只读归档所需内容。
2. Codex 只能读 C07 的**输出**，不得运行 C07，不得直接读 `ORIGINAL`。
3. C10—C16 产品/探针角色不得调用 C07，不得继承 `manifest-reader` 令牌，不得把 C07 输出内容作为测试输入。
4. C07 不得写 `ORIGINAL`、不得修 ACL、不得修复差异、不得删除/重命名、不得把内容复制到副本。
5. `before-command`/`after-command` 的 `--command-id` 只能取注册表枚举；不接受自由字符串。
6. 原项目内容读取成功本身不是 FAIL（这是 C07/C08 的授权角色）；但禁止区中的**未授权角色**读取成功即 FAIL，不以“已归因/有日志”豁免。

## 12. B9：写入审计格式是启动前置条件

`PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V3.md` 是 Phase 0 启动前置条件，不是事后可选报告格式。冻结内容：

- JSONL、append-only、每事件一行、哈希链；
- 每次文件写入尝试（含拒绝）必须记录命令 ID、执行编号、PID/TID、工具哈希、路径、操作、允许规则、预期/实际、前后哈希、CreateNew 标志、频次；
- C01 在创建 `OUT` 后立即初始化 `D:\P47RUN\P47-20261111-01\out\audit\C01-E01\bootstrap.jsonl`；`RUN` 根目录创建作为唯一 `bootstrap_root_create` 事件记录，之后所有写入必须先有审计槽；
- C04/C05 检查工具发布包含审计器；C06—C20 缺审计即失败；
- C12/C16 的六目标与条件图标、C13 的零 `dist`、C07/C08 的原项目读取、C03 的 Codex 拒绝写，均按该规范留证。

未初始化审计、审计链断裂、事件缺字段、拒绝事件未记录、事后补写，均视为 Phase 0 FAIL。

## 13. R05、R16、R01 的冻结状态

### R05

保持 **OPEN**。V5 的 `placeholderSeq` 同步键与非 force 合并要求仍冲突；Phase 1 先形成经审查的设计修订，再实现和验证。不得按冲突规格直接实现。

### R16

保持 **OPEN**。V5 的“容器 token 等于目标 token”与旧 `commitSeq` 高水位判据仍冲突；Phase 4 正式测量前统一渲染快照与逐脚本覆盖关系，包含零候选和跨纪元场景。不得以两套判据中的任一套单独签发渲染通过。

### R01

保持 **PARTIAL**。V3 只保留 V5 第 242—261 行 20 行矩阵索引；Phase 1 开始前必须补齐：

- 每个用例的具体输入夹具、Worker/定时器/传输层故障注入方式；
- 可执行 harness、运行命令、输出文件与证据格式；
- 逐用例预期结果、失败码、停止条件；
- 真实 Worker 正常/崩溃/加载失败/协议错误的分开证据；
- 20 行覆盖表、全部 run（含失败）、资源计数与竞争顺序证据。

R01 只有独立复核与用户裁定后才可能改变评级；测试全绿不自动等于 CLOSED。

## 14. Phase 0 启动条件

只有以下条件全部满足，才可向用户申请“开始有限 Phase 0”：

1. 用户批准 V3 主文档、白名单、执行注册表、审计规范、变更记录和未解决问题清单的哈希。
2. 用户在 `D:\P47TOOLS\p47-phase0-v3` 提供 TOOLSRC 发布包，批准 `RELEASE-MANIFEST.json` 的 SHA-256，并在启动环境提供 `P0_TOOLSRC_MANIFEST_SHA256`。
3. 用户明确管理员执行身份、Codex 只读角色、`RUN_ID=P47-20261111-01`、静默窗口；确认 `RUN` 不存在。
4. 用户为 C18 指定 `SECOND_ARCHIVE` 绝对路径；未指定则 C18 禁用，Phase 0 不得关闭。该路径可在 S8 前补充，但不得用默认目录。
5. 审计规范已冻结；C01 能在创建 `OUT` 后初始化审计链。
6. 21 条命令的注册表字段完整；C00 清单哈希检查、C05 工具哈希复算、C10 真实 Vitest worker 探针均纳入门。
7. R05/R16 仍 OPEN、R01 仍 PARTIAL、评级仍 0/23/2；不把本文件当作任何一项的关闭证据。
8. 用户另行下达“开始 Phase 0”指令。接受 V3 文档本身不等于授权执行。

不满足任一项：不创建 RUN、不运行 C00、不进入 S0。

## 15. 停止、回滚与证据

- 原项目始终只读；C07/C08 的读取不等于写许可。
- C00 清单哈希失败、C05 工具哈希失败、C06 禁止区读取成功、C10 worker/拒写失败、C11/C15 产物或 C12/C13 未登记写入：立即停止，保存现场，不提升权限、不换目录、不关守卫。
- 模拟/真实副本失败不清理失败目录；重试只能从同一已核验快照派生新实验编号。
- C18 失败不换位置；第二归档未完成不关闭 Phase 0。
- 完成 S9 后停止，等待第六轮独立复核与用户批准；不自动进入 Phase 3。

## 16. 本轮交付与停止点

本轮交付六份文件：

1. 本 V3 启动条件文档；
2. V3 机器可读白名单 TSV；
3. V3 命令执行注册表 JSON；
4. V3 写入审计规范；
5. V2→V3 变更记录；
6. V3 未解决问题清单。

本轮不执行 Phase 0、测试、构建、浏览器、L1；不修改产品代码；不创建运行根；不修改 ACL；不改变 R05/R16 OPEN、R01 PARTIAL 或 0/23/2 评级。

文件字节数、行数与 SHA-256 在交付回复中公布。审查到此停止，等待第六轮独立复核。
