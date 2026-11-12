## 附录 C：脚本硬编码路径清单（逐文件）

范围：`scripts/` 下全部 48 个文件，加项目根目录下的 10 个零散代码文件。由 `gen-appendix.cjs` 对源码做文本解析得到，逐调用的长表在同目录的 `ANNEX-script-write-paths.tsv`（166 行）。

读法：“根”是文件里出现 `D:/Projects/ob-recover` 字面量的次数；“TEMP”是出现 `C:/Users/Administrator/TEMP` 字面量的次数；“独占”为“是”表示输出文件用 `flag: 'wx'` 创建、已存在即拒绝，“否”表示同名直接覆盖；“可覆盖路径”为“是”表示存在把输出或 dist 指到别处的环境变量。统计不含 `mkdirSync`。

“输出路径表达式”一列是把脚本里的输出变量按常量定义做文本展开的结果，只用来看路径指向哪里：展开时省略了括号，不能当作可求值的表达式；超过 150 个字符的在末尾截断；一个脚本有多个输出时只显示主输出变量。完整的逐调用展开在 `ANNEX-script-write-paths.tsv`。

| 文件 | 根 | TEMP | 写入与删除的去向 | 输出路径表达式 | 浏览器 profile | 独占 | 固定端口 | 可覆盖路径 |
|---|---|---|---|---|---|---|---|---|
| `analyze-all-test-positions.cjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `analyze-test-positions.cjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `check-ast.cjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `check-ast.mjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `check-pos.js` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `check-positions.cjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `debug-ast-locate.cjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `debug-find-call.cjs` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `fix-test-positions.ts` | 0 | 0 | 写入→相对路径或运行时决定×1 | — | — | 否 | — | 否 |
| `scripts/analyze-real-ob-e2e.ts` | 1 | 0 | 写入→项目 test/acceptance×1 | — | — | 否 | — | 否 |
| `scripts/capture-e2e.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + (process.env.ALL ? '/test/acceptance/phase3-engine-e2e-all-result.json' : '/test/acceptance/phase3-engine-e2e-result.json')` | `'<TEMP>/chrome-e2e-profile'` | 否 | 9334 | 否 |
| `scripts/capture-lifecycle.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/phase3-lifecycle-e2e-result.json'` | `'<TEMP>/chrome-life-profile'` | 否 | 9335 | 否 |
| `scripts/capture-proto.mjs` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/phase3-proto-result.json'` | `'<TEMP>/chrome-proto-profile'` | 否 | 9333 | 否 |
| `scripts/capture-samples.ts` | 1 | 2 | 删除→相对路径或运行时决定×1；写入→相对路径或运行时决定×2；写入→项目 test/acceptance×1；删除→TEMP×1 | — | `'<TEMP>/chrome-sample-profile'` | 否 | 9336 | 否 |
| `scripts/cli.ts` | 0 | 0 | 写入→相对路径或运行时决定×1 | — | — | 否 | — | 否 |
| `scripts/coverage-report.ts` | 1 | 0 | 写入→项目 test/acceptance×1 | — | — | 否 | — | 否 |
| `scripts/devtools-capture-diag.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-capture-diag.json'` | `'<TEMP>/devtools-capture-diag-profile'` | 否 | 9466,8776 | 否 |
| `scripts/devtools-probe.ts` | 2 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/devtools-probe' + (process.env.HEADED ? '-headed' : '-headless') + '.json'` | `'<TEMP>/devtools-probe-profile'` | 否 | 9450 | 否 |
| `scripts/devtools-probe2.ts` | 2 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/devtools-probe2.json'` | `'<TEMP>/devtools-probe2-profile'` | 否 | 9451 | 否 |
| `scripts/devtools-probe3.ts` | 2 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/devtools-probe3.json'` | `'<TEMP>/devtools-probe3-profile'` | 否 | 9452 | 否 |
| `scripts/devtools-probe4.ts` | 2 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/devtools-probe4.json'` | `'<TEMP>/devtools-probe4-profile'` | 否 | 9453 | 否 |
| `scripts/devtools-probe5.ts` | 2 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/devtools-probe5.json'` | `'<TEMP>/devtools-probe5-profile'` | 否 | 9454 | 否 |
| `scripts/devtools-probe6.ts` | 2 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/devtools-probe6.json'` | `'<TEMP>/devtools-probe6-profile'` | 否 | 9455 | 否 |
| `scripts/devtools-real-1.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-real-1.json'` | `'<TEMP>/devtools-real-profile'` | 否 | 9461,8771 | 否 |
| `scripts/devtools-real-2.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-real-2.json'` | `'<TEMP>/devtools-real2-profile'` | 否 | 9462,8772 | 否 |
| `scripts/devtools-real-3.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×4 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-real-3.json'` | `'<TEMP>/devtools-real3-profile'` | 否 | 9463,8773 | 否 |
| `scripts/devtools-real-4.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×5 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-real-4.json'` | `'<TEMP>/devtools-real4-profile'` | 否 | 9464,8774 | 否 |
| `scripts/devtools-real-5.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-real-5.json'` | `'<TEMP>/devtools-real5-profile'` | 否 | 9465,8775 | 否 |
| `scripts/devtools-real-ob-e2e.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/' + (process.env.TARGET_URL \|\| '' ? 'devtools-real-site-e2e' : 'devtools-real-ob-e2e') + (process.env.MIN…` | `'<TEMP>/devtools-real-ob-profile'` | 否 | 9468,8778 | 否 |
| `scripts/devtools-validation-e2e.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/devtools-validation-e2e.json'` | `'<TEMP>/devtools-validation-profile'` | 否 | 9467,8777 | 否 |
| `scripts/extension-conflict.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | — | `'<TEMP>/ext-conflict-profile'` | 否 | 9411,8766 | 否 |
| `scripts/extension-integration.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | — | `'<TEMP>/ext-int-profile'` | 否 | 9410,8765 | 否 |
| `scripts/extension-probe.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | — | `'<TEMP>/ext-profile'` | 否 | 9401 | 否 |
| `scripts/extension-probe2.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | — | `'<TEMP>/ext-profile2'` | 否 | 9402 | 否 |
| `scripts/extension-probe3.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | — | `'<TEMP>/ext-profile3'` | 否 | 9403 | 否 |
| `scripts/extension-probe4.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | — | `'<TEMP>/ext-profile4'` | 否 | 9404 | 否 |
| `scripts/extension-probe5.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | — | `'<TEMP>/ext-profile5'` | 否 | 9405 | 否 |
| `scripts/gen-real-ob-sample.mjs` | 1 | 1 | 写入→项目 test/fixtures×2 | `'D:/Projects/ob-recover/test/fixtures/real-ob' + '/obfuscated.js'` | — | 否 | — | 否 |
| `scripts/manual-panel-accept.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/phase4-manual-panel.json'` | `'<TEMP>/ob-manual-panel-profile'` | 否 | 9478,8792 | 否 |
| `scripts/manual-panel-preview.ts` | 1 | 1 | 写入→TEMP×1 | `'C:/Users/Administrator/TEMP/opencode/manual-panel-preview.json'` | — | 否 | — | 否 |
| `scripts/manual-real-accept.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/phase4-manual-real.json'` | `'<TEMP>/ob-manual-real-profile'` | 否 | 9477,8791 | 否 |
| `scripts/manual-real-probe.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/phase4-manual-real-probe.json'` | `'<TEMP>/ob-manual-real-profile'` | 否 | 9477,8791 | 否 |
| `scripts/p47-l1-ob-run.ts` | 1 | 1 | 写入→项目 test/fixtures×2；删除→TEMP×1 | `'D:/Projects/ob-recover' + '/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou' + '/run-20261110T1458Z' + '/observed' + '/raw-run.nextpage3.json'` | `'<TEMP>/l1-ob-profile'` | 是 | 9470 | 否 |
| `scripts/p47-l3-browser-replay.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×3 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-l3-browser-replay' + process.env.MIN_CONFIDENCE \|\| '' ? '-' + process.env.MIN_CONFIDENCE \|\| '' : '' +…` | `'<TEMP>/p47-l3-replay-profile'` | 否 | 9472,8782 | 否 |
| `scripts/p47-l3-coverage-control.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-l3-coverage-control.json'` | `'<TEMP>/p47-l3-coverage-control-profile'` | 否 | 9474,8784 | 否 |
| `scripts/p47-l3-decoder-diag.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-l3-decoder-count-diag.json'` | `'<TEMP>/p47-l3-decoder-diag-profile'` | 否 | 9476,8786 | 否 |
| `scripts/p47-offline-connect-diag.ts` | 3 | 1 | 写入→项目 test/acceptance×1；删除→TEMP×1 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-offline-connect-diag-' + String(process.env.SCENARIO \|\| 'A').toUpperCase() + '-run' + String(process.…` | `'<TEMP>/p47-offline-diag-profile-' + String(process.env.SCENARIO \|\| 'A').toUpperCase()` | 是 | 9473,8783 | 否 |
| `scripts/p47-panel-perf-verify.ts` | 1 | 1 | 写入→项目 test/acceptance×1；删除→TEMP×1 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-panel-perf-' + process.env.BUILD_LABEL \|\| 'after' + '-run' + String(process.env.RUN_NO \|\| '1') + '.js…` | `'<TEMP>/p47-panel-perf-profile'` | 是 | 9480,8790 | 是 |
| `scripts/p47-sw-recycle.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-sw-recycle' + (process.env.METHOD \|\| 'A' === 'A' ? '' : '-method' + process.env.METHOD \|\| 'A') + '.js…` | `'<TEMP>/p47-sw-profile'` | 否 | 9412,8766 | 否 |
| `scripts/p47-worker-exec-verify.ts` | 1 | 1 | 写入→项目 test/acceptance×1；删除→TEMP×1 | `'D:/Projects/ob-recover' + '/test/acceptance/p47-worker-exec-run' + String(process.env.RUN_NO \|\| '1') + '.json'` | `'<TEMP>/p47-worker-exec-profile'` | 是 | 9481,8791 | 否 |
| `scripts/panel-layout-check.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×3 | `'D:/Projects/ob-recover' + '/test/acceptance/layout-check.json'` | `'<TEMP>/layout-check-profile'` | 否 | 9440,8769 | 否 |
| `scripts/panel-perf.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover' + '/test/acceptance/panel-perf-' + process.env.TAG \|\| 'before' + '.json'` | `'<TEMP>/panel-perf-profile'` | 否 | 9430,8768 | 否 |
| `scripts/pixel-corner-check.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×3 | `'D:/Projects/ob-recover' + '/test/acceptance/pixel-corner-check.json'` | `'<TEMP>/pixel-profile'` | 否 | 9460,8770 | 否 |
| `scripts/probe-call-location.ts` | 1 | 0 | 写入→项目 test/acceptance×1 | — | — | 否 | — | 否 |
| `scripts/refresh-perf.ts` | 1 | 1 | 删除→TEMP×1；写入→项目 test/acceptance×2 | `'D:/Projects/ob-recover' + '/test/acceptance/refresh-perf-' + process.env.TAG \|\| 'before' + '-' + (process.env.ONLY \|\| 'B0,B0o,B1,S2').split(',').join…` | `'<TEMP>/refresh-perf-profile'` | 否 | 9420,8767 | 否 |
| `scripts/sample-static-scan.ts` | 2 | 0 | 写入→项目 test/acceptance×1 | `'D:/Projects/ob-recover/test/acceptance/phase3-sample-static-scan-'` | — | 否 | — | 否 |
| `scripts/verify-real-ob-sample.mjs` | 1 | 0 | 无写入调用 | — | — | 否 | — | 否 |
| `test-debug.ts` | 0 | 0 | 无写入调用 | — | — | 否 | — | 否 |

