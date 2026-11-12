# OB-Recover

面向 **Obfuscator.io（OB）/ jsjiami 类混淆** JavaScript 的静态 AST 还原工具，提供两种形态：

- **Chrome DevTools 扩展**：在真实页面里自动定位解码器、用断点在运行时捕获真实参数与返回值、验证后按 AST 节点精确替换，并给出原始/还原双栏对比与转换报告。
- **可复用的 Node 核心与 CLI**：纯静态的解析、解码、结构还原流水线，方便脚本化处理单个 JS 文件。

核心原则：**同样的调用文本出现在多个位置时，只替换经过验证的那个 AST 节点；宁可少替换，不可错替换。**

> 本项目仅用于学习研究和对已获授权的代码进行分析。

## 功能特性

- **解码器自动发现**：识别字符串数组、解码函数、别名与旋转/偏移等常见 OB 结构。
- **运行时捕获**：通过 `chrome.debugger` 在入口/return 断点读取真实参数与返回值，**不重新执行目标函数**。
- **结果验证**：`pending / verified / unstable / failed / insufficient` 五态；证据不足一律不进入替换。
- **AST 精确替换**：按唯一节点位置替换为字面量，带只读 dry-run 预检与拒绝原因统计。
- **结构还原变换**：字符串解码、代理函数内联、对象映射推断、成员访问静态化、常量折叠、十六进制数字还原、布尔还原、死代码/死解码器清理、控制流还原、标识符重命名。
- **DevTools 面板**：脚本列表、原始/还原双栏 diff、转换报告、捕获卡片、验证徽章、手动断点模式。
- **CLI**：无需浏览器即可对单个混淆文件跑完整静态流水线。

## 工作流程

```text
目标脚本
   │
   ├─ Phase 1  字符串解码      detectDecoders → buildDecoderMappings → transformCalls
   ├─ Phase 2  结构还原        inlineProxyFunctions → inferObjectMappings → transformComputedToStatic
   ├─ Phase 3  运行时捕获      chrome.debugger 断点读取参数/返回值 → 验证 → 映射
   ├─ Phase 4  AST 自动替换    唯一节点定位 → dry-run → verified 替换 → 生成代码
   └─ Phase 5+ 语义/控制流还原（规划中）
```

扩展侧的捕获与验证完全复用 `src/core/` 的静态分析能力；`src/extension/debugger/capture-engine.ts` 通过注入的 `send` 与 `chrome.debugger` 解耦，便于用桩传输层做单元测试。

## 目录结构

```text
ob-recover/
├─ src/
│  ├─ core/                  # 解析、解码、验证、替换、生成（与浏览器无关）
│  │  ├─ parser.ts
│  │  ├─ decoder-discovery.ts
│  │  ├─ string-decoder.ts
│  │  ├─ mapping.ts
│  │  ├─ replacement-dryrun.ts
│  │  ├─ verified-replacer.ts
│  │  ├─ pipeline.ts
│  │  └─ transforms/         # 常量折叠、死代码、控制流、标识符重命名等
│  ├─ extension/             # MV3 DevTools 扩展
│  │  ├─ debugger/           # CDP 客户端、脚本收集、捕获引擎、手动捕获
│  │  ├─ devtools/           # DevTools 面板 UI
│  │  ├─ sandbox/            # 隔离沙箱页
│  │  └─ workers/            # 解码分析 Worker
│  └─ types/
├─ scripts/                  # CLI 与开发/验收脚本（真实浏览器 E2E、面板验收等）
├─ test/                     # vitest 单测、验收报告、真实 OB 样本与证据
├─ test-pages/               # 受控测试页面
├─ docs/                     # 各阶段设计、交接与验收文档
├─ dist/                     # 已构建扩展（可直接加载）
├─ vite.config.ts
└─ package.json
```

## 快速开始

### 环境

- Node.js 18+（开发时使用 Node 22/24）
- Chrome / Edge（Chromium 内核，支持 MV3 与 DevTools 扩展）

### 构建

```bash
npm install
npm run build      # 输出到 dist/
```

开发时可使用 `npm run dev` 监听构建。

### 加载扩展

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」。
2. 选择「加载已解压的扩展程序」，指向本仓库的 `dist/` 目录。
3. 打开目标页面，按 F12 打开 DevTools，切换到 **OB-Recover** 面板。
4. 选择脚本 → 发现解码器 → 开始捕获（命中断点时 DevTools 可能自动跳到 Sources，手动切回即可）→ 查看验证结果 → dry-run → 应用替换。

`dist/` 已随仓库提供，仅使用扩展时不必重新构建。

### CLI

```bash
npx tsx scripts/cli.ts <input.js> [output.js]
```

不指定输出路径时默认写出 `<input>.recovered.js`，并在终端打印解码器、映射数量、替换统计与前 20 条转换明细。

## 测试

```bash
npx vitest run
```

测试覆盖解析/解码/映射/替换安全、捕获引擎（桩 CDP 传输层）、面板逻辑与真实样本回放。`test/acceptance/` 下保留了各阶段的验收报告与证据（部分为真实浏览器运行产生）。

## 文档

| 文档 | 内容 |
| --- | --- |
| `docs/PHASE4-HANDOFF.md` | Phase 1–4 架构、状态与已知限制的完整交接 |
| `docs/PHASE4.6-P0-REVIEW.md` | P0 缺陷审查 |
| `docs/PHASE4.6.1-STABILITY-REPORT.md` | 运行时安全与稳定性修复报告 |
| `docs/MANUAL-MODE-QUICK-TEST.md` | 手动断点模式快速测试 |
| `docs/MANUAL-MODE-VERIFICATION.md` | 手动断点模式验证记录 |
| `docs/PHASE4.7-REAL-SITE-PLAN.md` | 真实网站验收计划与指标定义 |
| `docs/PHASE4.7-L1-QCCQCC-REPORT.md` | 真实站点 L1 验收报告 |
| `docs/PHASE4.7-*.md` | L1 排查、面板性能、离线连接等专题记录 |

## 当前进度与已知限制

- Phase 1–4 已完成；手动断点模式（Phase 4.5）已在真实 Chrome 上做过面板与后端验收，但 Step into/out、F8、条件断点等尚未逐项验证。
- Phase 4.7 真实网站验收未通过：L1 目标站点上捕获成功但 dry-run 候选为 0，Source Integrity 因 scriptId 过期未能测量；报告见 `docs/PHASE4.7-L1-QCCQCC-REPORT.md`。
- 已知限制：别名式数组旋转识别能力有限；纯内置函数白名单为人工列定；压缩单行、`eval`、动态脚本中的调用位置未充分验证；`tsc` 在 `src/` 下仍有历史类型错误。
- Phase 5（变量语义恢复）与 Phase 6（控制流还原）尚未开始。

## 免责声明

本项目仅用于学习、研究与安全分析。请仅在你拥有或已获得明确授权的代码与网站环境中使用；使用者需自行承担因不当使用产生的全部责任。
