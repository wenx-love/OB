# Phase 4.7 L1：qccqcc 杭州站真实网站验收报告

日期：2026-11-10　项目：`D:/Projects/ob-recover`　样本：`l1-qccqcc-hangzhou`　run：`20261110T1458Z`

**结论：`blocked`（未通过，且不是"零替换即安全"的通过）。** OB-Recover 在这份真实脚本上完成了大规模运行时捕获（1056 次成功的解码器返回），但验证层把**所有**候选组判为不可用，dry-run 0 候选、应用 0 替换。因此硬性条件中的 Source Integrity 未能测量，Precision 与 Safe Rejection Rate 分母为 0 记 `n/a`，Recall = 0。**不得据此判定 Phase 4.7 通过。**

## 1. 目标与授权

| 项 | 值 |
|---|---|
| 页面 | `https://hangzhou.qccqcc.com/list.html?keyword=%E5%86%B2%E9%94%8B%E8%A1%A3` |
| 接口 | `https://newopenapiweb.17qcc.com/api/services/app/SearchFactory/GetPageList`（POST，匿名，`app-is-login: 0`） |
| 触发脚本 | `https://j.17qcc.com/combo?ajax-20&imglazy&pager-5&template-6&rollload&ajaxmethord-5&pluploadfull&qccer-1&hpaitop-5&hpailist-2`（用户给的名称被截断，完整尾部是 `hpailist-2`） |
| 授权 | 用户确认**有权测试**，**匿名访问**（无登录、无账号态） |
| 动作类别 | 只读；`GetPageList` 是列表查询，未做任何业务提交 |

## 2. 环境限制（先于结论）

**headless 被站点拒绝。** 同一台机器、同样的 Chrome 155、全新 profile、不带扩展，headless 导航返回 **`403 Forbidden`**（`js_reverse_cache/recon/headless-probe.json`）；有窗口的 Chrome 正常返回「杭州服装_服装批发」。

因此：

- 仓库原有入口 `scripts/devtools-real-ob-e2e.ts` 写死 `--headless=new`，**在本站不可用**（它也确实失败了：`chrome-error://chromewebdata/`，0 捕获）。
- 本次 L1 阶段的 B 改用**有窗口**专用 Chrome，扩展与面板流程完全不变。这不是降低标准，而是站点本身的分发条件。

## 3. 阶段 A：独立参考（Skill）

### 3.1 脚本归档

| 项 | 值 |
|---|---|
| 字节数 | 256820 |
| SHA-256 | `cc7a8127fa8a5d17289a953e11d82ff528fe9ea42276810c5f03371abf760daf` |
| 格式 | 无 BOM、无 CR、单行 |
| 混淆器 | `jsjiami.com.v7`（标记变量 `_0xodf`） |
| 业务锚点 | `QccJsWebVer = 2026.10.21.1`、`SearchFactory/GetPageList`、`GetEncryptedAccessToken` |

脚本同时含 `RsaPubAes`、`TimesTamp`、`Sign`，确认它就是生成该接口请求体七字段的那份脚本。

### 3.2 参考值如何独立产生

1. **静态**（Babel，不 import 任何 OB-Recover 代码）：解析顶层 `var X = <别名|_0x374d>` 链，确认 37 个别名最终都指向全局解码器 `_0x374d`；收集**两个参数全为字面量**的调用点。
2. **运行时**：在页面里用 `window._0x374d(a, b)` 求值。这是页面自己的纯解码函数，返回的是页面真实值。
3. 全程不使用 OB-Recover 的任何输出，也不用 `expected.js`。

结果：**823 个调用点 / 812 组唯一参数，全部返回字符串，0 缺失、0 异常。**

### 3.3 参考侧的已知局限

- js-reverse 半程**缺失**（headless 验收失败，用户决定记为缺失）：没有 initiator、没有暂停帧。
- 值是在页面加载完成后读取的；若解码器在运行中改变数组，早期调用的真实值可能不同（未观测到，也未单独排除）。
- 只覆盖两参数全字面量的调用点。
- CDN 按 `User-Agent` 变化，不同 UA 族可能收到不同字节。

## 4. 阶段 B：OB-Recover 独立运行

有窗口专用 profile，加载真实 `dist`（四个入口哈希与第 1 步基线一致），程序化点击面板（非手动鼠标）。

| 指标 | 值 |
|---|---|
| 设置断点 | 423 |
| 命中 | 1339 |
| 暂停 | 8003 |
| 成功 | 1333 |
| 失败 | 6 |
| 强制恢复 | 0 |
| 外来暂停 | 2 |
| 捕获记录 | 1059（`_0x374d` 1056 条 success，`Callbacks` 3 条 capture-failed） |

**捕获本身是成功的**，规模也不小。问题出在验证：

| 阶段 | 结果 |
|---|---|
| dry-run | **0 个可替换候选**，拒绝 30 项 |
| 拒绝码 | `status-failed` 17、`status-unstable` 13 |
| 应用 | **0 替换**，面板提示「当前脚本没有可替换的候选」 |

### 4.1 观察到的异常信息（未定根因）

面板记录过：`entry breakpoint did not land inside the function body (top frame is not the target function)`。

**假设（未证实）**：若入口断点落在目标函数之外，记录的返回值可能来自错误的栈帧，于是同一组参数看起来"返回值不稳定"，进而被 `status-unstable` 全组拒绝。**这不是已确认的根因，也没有做任何产品侧改动。**

## 5. 五类分类与指标

参考的 823 个位置**全部是可确定的**（有真实返回值），因此负样本分母为 0。

| 类别 | 计数 |
|---|---|
| `correct-replacement` | 0 |
| `false-replacement` | 0（空洞：根本没有发生替换） |
| `safe-rejection` | 0 |
| `insufficient-evidence` | **823** |
| `version-mismatch` | 0 |

| 指标 | 值 | 说明 |
|---|---|---|
| Precision | `n/a` | 分母 0（无替换） |
| Recall | **0** | 823 个可确定位置一个都没还原 |
| False Replacement | 0 | **不得**当作正确性证据 |
| Unresolved | 823（ratio 1.0） | |
| Safe Rejection Rate | `n/a` | 负样本分母 0 |
| Source Integrity | **未测量** | 见 5.1 |
| Business Parity | `not-evaluated` | 没有还原产物可对照 |

### 5.1 为什么 Source Integrity 记为"未测量"

运行中途重试过一次刷新，`scriptId` 随新文档变化。读到的 `scriptId 200` 返回 **0 字符 / 0 字节**（空字符串的 SHA-256 `e3b0c442…`）。这与"读取了过期 scriptId"一致，**不能**当成产品缺陷，也不能当成源码未变的证据。

**要测这一条，需要一次不重试、不换文档的干净运行**，在应用前后各读一次同一 `scriptId`。

## 6. 失败与未验证项（逐条）

| 项 | 状态 | 说明 |
|---|---|---|
| headless 加载目标页 | **失败** | 站点返回 403（有窗口正常） |
| `devtools-real-ob-e2e.ts` 默认入口 | **失败** | 依赖 headless，落在 `chrome-error`，0 捕获 |
| 运行时捕获 | **通过** | 1056 次成功返回 |
| 验证 / dry-run | **失败** | 0 候选，30 项拒绝 |
| 位置级替换 | **未发生** | 无候选 |
| Source Integrity | **未测量** | 过期 scriptId |
| Business Parity | **未评估** | 无还原产物 |
| js-reverse 半程 | **缺失** | headless 验收失败，用户决定记为缺失 |
| 页面卡死 | **观察到一次** | 第 1 次尝试中页面在捕获期间停止响应；与 Phase 3 挂起同类症状，**不声称已修复或已定位** |

**测试装置自身的失误（如实记录，均已归档）：**

1. 第 1 次：快照取得太早（页面短暂无响应），看到 0 命中 → `raw-run.attempt1-early-snapshot.json`
2. 第 2 次：在暂停状态下刷新，落到 `chrome-error` → `raw-run.attempt2-reload-error.json`
3. 第 3 次：标签停在 `about:blank`，Discovery 无脚本，捕获启动被拒 → `raw-run.attempt3-blank-tab-no-candidates.json`
4. 第 4 次：先加载目标页 → 连接 → 开始捕获 → 刷新（有界重试一次）→ 得到上表数据

## 7. 预算与资源

- 请求预算 100，已用 13（各次导航），剩余 87；Provider 主动重放业务接口 **0 次**。
- 所有证据写在 `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/` 下；`src/` 未改。
- 未写入：cookie、GuestId、请求密文、响应 `Result`。

## 8. 结论与下一步（需你决定）

**L1 未通过，判 `blocked`。** 阻断点不是安全策略，而是**验证层在这份真实 jsjiami v7 语言包上一个候选都没放行**。

要推进，需要一步**干净的单次导航运行**（不重试、不换文档），以取得：

1. 同一 `scriptId` 在应用前后的源码哈希（补齐 Source Integrity）；
2. 验证层拒绝的完整分组明细，用于定位"同参不同值"到底来自真实不稳定还是错误的返回值读取。

在此之前，**Phase 4.7 不能判定通过**，也不能用"误替换 0"来替代结论。

---

**证据索引**

- 归档：`run-20261110T1458Z/script.js`、`script.sha256`
- 参考：`run-20261110T1458Z/reference/{call-sites,decoders,business}.json`、`NOTES.md`
- 观测：`run-20261110T1458Z/observed/raw-run.json`、`outcome.json`、三个归档尝试
- 403 证据：`js_reverse_cache/recon/headless-probe.json`
- 运行器：`scripts/p47-l1-ob-run.ts`
