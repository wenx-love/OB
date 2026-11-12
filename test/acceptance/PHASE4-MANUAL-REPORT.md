# Phase 4.5 手动断点模式 真机验收报告

日期：2026-11-10　项目：D:/Projects/ob-recover　范围：手动断点后端验收 + Panel UI 接入 Phase 4 验证和替换流程。未进入 Phase 5。

## 0. 方法与限制

- 环境：Chrome/155.0.8059.40，有界面，专用 profile，Extensions.loadUnpacked 加载 dist，真实 DevTools 前端、真实面板 iframe、真实 V8 暂停。没有合成任何 Debugger.paused 事件。
- 断点：通过 DevTools 前端的 BreakpointManager.setBreakpoint 设置（和点击 Sources 行号槽走同一套断点代码），不是人手点击行号槽。
- 页面按钮用 CDP Input.dispatchMouseEvent 点击，面板按钮用 element.click()，都不是人手操作。后端负路径命令经 background 的 handlePanelCommand 发送，与面板 port 调用的是同一个函数。
- 预期值由 node:vm 独立重算 _0xdec（含数组旋转），再与浏览器实际返回值比对。
- 扩展发出的 CDP 命令，由 service worker 内包装 chrome.debugger.sendCommand 记录。
- 最终 dist 哈希：background.js ff3df717e9ec1aa91f39a2a778916834de460cdf98973962c45866939951557e；panel.js baf7e7bacddecc3c235f8b73484934a9e25067b71b0a6d4f797298e36110e630；panel.html 8d6d2bd818063f46f5bb314504578370f68ff680c98c61f29698336817878bfc；manifest.json b3c737b4e6ea12a55d37ac75726fba8b2aad8778e26d092b0324997b18efcd55。
- 后端十项（phase4-manual-real.json）跑在 background 为 ff3df717… 、面板为旧构建的 dist 上；之后只改了面板，background 哈希不变，面板行为由第 2 节的面板验收重新覆盖。

## 1. 十项验收的最终状态

| # | 项目 | 最终状态 | 证据与备注 |
|---|---|---|---|
| 1 | 加载当前 dist 扩展 | 通过 | 扩展加载成功，SW 与 OB-Recover 标签均注册，面板点连接后状态为 connected。第一轮失败是脚本等待条件写早（面板未注册就检查），已改为等待 OB-Recover 标签出现，没有放宽判断。 |
| 2 | 打开专用测试页 | 通过 | test-pages/phase4-manual-real.html/.js，本地服务加载，readyState 为 complete。 |
| 3 | 在 Sources 设置断点 | 通过（程序化） | BreakpointManager 设置；控制组（扩展已加载但未 attach）命中 innerSign 的 CDP 第 14 行。人手点击行号槽：未验证。 |
| 4 | 后端收到真实 Debugger.paused | 通过 | 扩展会话收到 reason=other、3 帧的真实暂停；后端记录与暂停数一致（3/3）。scriptUrl 原为空串（callFrame.url 为空），已改为由 scriptId 反查。 |
| 5 | 获取真实 callFrames | 通过 | get-frames 与原始事件按索引一致（函数名、行、callFrameId）。第一轮失败：该命令尚未实现。 |
| 6 | 按 frameIndex 读 Local/Closure | 通过 | 帧0 Local：payload、localLabel、localToken；Closure：closureSalt=salt-21、closureCount=42。帧1 Local：signer、payload、midMarker，不含帧0变量。第一轮失败：命令尚未实现。 |
| 7 | 在指定帧求值 OB 解码表达式 | 通过 | callFrameId 与 frameIndex 两条路径各 9 条表达式（_0xdec(0x0..0x4)、Local+Closure 组合、跨帧 typeof 隔离）全部等于预期。第一轮 frameIndex 路径失败（后端忽略 frameIndex），已修复。 |
| 8 | 返回值与浏览器实际结果一致 | 通过 | _0xdec(0..4) 为 sign/token/foo/bar/cookie，等于 node:vm 重算值，也与页面最终输出 sign:p1:salt-21:42|token#mid-p1 一致。 |
| 9 | 不自动设大量断点、不擅自切面板、不 resume | 通过 | 第一轮失败：插桩断点 1 次、Debugger.resume 14 次（cdp-client attach 无条件设置插桩）。修复后整轮命令只有 Debugger.enable、Runtime.enable、getScriptSource、Runtime.getProperties、evaluateOnCallFrame，mutating 为空，插桩暂停 0 次；暂停期间 DevTools 选中标签始终为 sources，与未 attach 的控制组一致；页面采样期间保持暂停。 |
| 10 | 用户断点、单步、继续不受影响 | 部分通过 | 通过：断点二次命中、Step over、Continue（DevTools API 驱动）、先有断点后连接、模式往返后断点仍命中。未验证：Step into/out、F8 键盘、条件断点、Ctrl+F8 停用断点、多标签页同时调试。 |

## 2. Panel UI（与 Phase 4 验证和替换接通）

实现：

- 新增独立抽屉标签「手动断点」（devtools/manual-panel.ts）：读取暂停调用栈、选择帧、读取作用域、选择调用点、在该帧求值并加入验证、模式下拉、清空记录。暂停时标签上亮红点，不自动切换标签。页面传来的值一律只用 textContent 渲染。
- 转换层 core/manual-capture-convert.ts（纯函数，14 条单元测试）：只接受对已发现解码函数的直接调用且参数全为字面量；求值表达式取自源码原文；求值前在同一帧用函数文本指纹确认标识符绑定，防止被遮蔽；返回值必须完整且可表示为字面量；内联脚本（起始偏移非 0）拒绝。
- 结果转成 DecoderCapture，存放在面板独立表中（handleCaptureState 会重建 capTable），验证时与自动捕获记录合并，走现有 validateCaptures、dryRunReplacements、applyVerifiedReplacements。没有绕过 verified 的通道，也没有进入旧文本级映射。同一调用点重复求值得到同一个 key，不累加观测次数。

面板验收经过三轮（scripts/manual-panel-accept.ts，10 项）：

- 第一轮：8 项通过，2 项失败。第3项失败是检查太粗：帧隔离用子串匹配，被帧1里 signer 函数源码预览触发，面板并没有串帧，已改为按变量行匹配。第6项失败：应用已验证替换返回 0 个候选，原因是 activeScript.scriptId 按 URL 回填落空。已改为应用时在当前已发现脚本里按 URL 加源码完全相等重新解析 scriptId，恰好命中一个才继续，否则不做任何替换。
- 第二轮（折叠区块版本）：脚本全部显示通过，但截图显示手动区块被挤在 Capture 抽屉底部，只露出一行标题，控件不可见。验收脚本只查 DOM 状态、没查可见性，所以这一项记为失败。已改为独立抽屉标签，并新增检查：6 个主要控件必须落在抽屉的可见滚动区内。
- 第三轮（最终）：10 项通过。6 个控件 inside=true，visBad 为空。应用报告为 替换数量 1/1：localLabel 行被替换为字面量，localToken 行仍是 _0xdec(0x1)，原始代码窗格不变。负路径 6 条（frameIndex 越界、callFrameId 与 frameIndex 冲突、空表达式、缺参数、get-scopes 越界、非整数）都被拒绝，且没有触达 CDP。resume 后面板和后端的保存调用栈都失效。模式往返后用户断点仍命中。整轮 38 条 CDP 命令均为只读。面板无未捕获异常。

## 3. 本轮修改

- debugger/cdp-client.ts：attach 默认不再设置插桩断点，新增 setInstrumentation 开关。
- background.ts：capture-start 切到 auto 并启用插桩，capture-stop 回到 manual 并移除插桩；切到 manual 时停止自动引擎；新增 manual-capture-get-frames 和 get-scopes；evaluate 支持 frameIndex；resume 或页面重置使保存的调用栈失效；scriptUrl 由 scriptId 反查。
- debugger/manual-capture.ts：保存当前暂停的完整 callFrames，新增 getFrames、getScopes、evaluateOnFrame。
- debugger/types.ts、devtools/panel.ts、panel.html、panel.css、layout.ts（新增 manual 抽屉）。
- 新增：devtools/manual-panel.ts、core/manual-capture-convert.ts、test/manual-capture-convert.test.ts、test-pages/phase4-manual-real.html/.js、scripts/manual-real-accept.ts、manual-panel-accept.ts、manual-panel-preview.ts、manual-real-probe.ts。
- 项目不是 git 仓库，改动前的备份在 C:/Users/Administrator/TEMP/opencode/ob-backup-* 目录。

## 4. 回归与静态检查

- vitest：355 通过，3 跳过（基线 341 加新增 14）。这只说明没有破坏原有逻辑，不能证明浏览器行为。
- tsc --noEmit：src/ 共 41 个错误，与基线一致（panel 12、background 10、cdp-client 17、devtools 1、verified-replacer 1）；新增文件没有 src 错误，scripts 和 test 下新增的是缺 @types/node 的同类错误。tsc 仍不干净，不能作为质量门槛。
- panel-layout-check.ts：4 种窗口尺寸（1842x780、1200x700、800x600、500x600）下抽屉标签行无溢出，pageErrors=0。
- Phase 3 自动捕获真机回归（extension-integration.ts，capture-ext-immediate.html）：命中 3、成功 3、失败 0，3 组记录和页面输出一致，停止后断点为 0、页面可响应。限制：对照基线是当天更早旧构建留下的历史记录，不是同时用旧 dist 重跑的结果。默认页 capture-ext.html 只有单次观测，没有对照。

## 5. 未验证项与已知限制

- 手动求值是在暂停时重新执行一次调用，不是读取原调用当时的返回值；能否替换完全由验证层决定（单次观测加严格静态检查）。别名式数组旋转无法静态排除。
- 后端区分不了用户断点和页面 debugger 语句：hitBreakpoints 为空，reason 为 other。手动模式把非自动引擎所有的暂停都当作手动暂停。
- 未在真机验证：人手点击行号槽；Step into/out、F8、条件断点；多标签页；页面刷新后手动记录的清理（onPageReset）；应用替换时 scriptId 解析命中 0 个或多个的分支；内联脚本被拒绝；自动引擎运行中切到手动的真机行为；真实 OB 样本上的手动模式（交接文档 8.8）；同文本部分位置验收页（交接文档 8.7）；captureLocals 路径。
- handleScriptDiscovered 里按 URL 回填 scriptId 的原逻辑未改，只有应用替换路径做了重新解析。
- 交接文档 P0 项未处理：verified-replacer.ts:88 读取不存在的 callLocationsTruncated（tsc 1 个错误）；test/verified-replacer.test.ts 的 62 处类型错误。

## 6. 证据文件（test/acceptance/）

- phase4-manual-real.json（后端十项最终）、phase4-manual-real.round1-before-fix.json（修复前失败证据）
- phase4-manual-panel.json（面板十项最终）、phase4-manual-panel.round1-before-fix.json、phase4-manual-panel.round2-before-tab.json
- phase4-manual-panel-1-paused.png、phase4-manual-panel-2-evaluated.png
- phase3-1-extension-integration.json、phase3-1-extension-integration.before-manual-patch.json、phase3-1-extension-integration.after-patch-capture-ext.json
- layout-check.json

## 7. 范围

未进入 Phase 5。
