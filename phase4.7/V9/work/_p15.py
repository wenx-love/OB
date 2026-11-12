import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\doc-src\PHASE4.7-PHASE0-V9-FAILURE-MODEL.md'
t = io.open(p, encoding='utf-8').read()
t = t.replace('日期：2026-11-11', '日期：2026-11-12')
t = t.replace('| ok | `segment_close(result=ok)` | ok / terminal / recorded / settled |\n| failed | `segment_close(result=failed)`，带失败类 | terminal / recorded / settled |\n| aborted | `segment_close(result=aborted)`（超时/被杀但 dispatcher 仍能 close） | terminal / recorded / settled |\n| skipped | `segment_skip` | recorded / settled |\n| orphaned | 只有 `segment_open`，dispatcher 硬死机 | settled only |\n| not-started | 无链（genesis 未写） | 无 |',
 '| ok | `segment_close(result=ok)` | ok / terminal / recorded / settled |\n| failed | `segment_close(result=failed)`，带失败类 | terminal / recorded / settled |\n| aborted | `segment_close(result=aborted)`（超时/被杀但 dispatcher 仍能 close） | terminal / recorded / settled |\n| skipped | `segment_skip` | recorded / settled |\n| orphaned | 只有 `segment_open`，dispatcher 硬死机 | settled only |\n| not-started | 无链（genesis 未写）或 pre-run 失败后的计划项 | 无 |')
t = t.replace('`ok` 要求是严格的；`terminal` 不含 skipped；`recorded` 才允许报告路径消费 skip。任何执行不得同时落入两个终态。',
 '判定必须使用封闭集合：ok={ok}；terminal={ok,failed,aborted}；recorded={ok,failed,aborted,skipped}；settled={ok,failed,aborted,skipped,orphaned}。`recorded` 不接受 orphaned/not-started；`settled` 不接受 not-started。任何执行不得同时落入两个终态。')
t = t.replace('优先级 security > fatal > gate；停止级别只升不降。',
 '优先级 security > fatal > gate；停止级别取 `max(当前, 新级别)`，只升不降。复合故障（首错 + after 错、双 gate、security + finalizer）必须保持该单调性。')
t = t.replace('| run-stopped | 停止后剩余计划项 | 第一个失败执行（可为 null 仅当无失败） |',
 '| run-stopped | 停止后剩余计划项 | 第一个失败执行；dispatcher 硬死机时允许指向 open 执行 |')
t = t.replace('skip 是终态但永远不是成功；skip 不得带段目录、summary 或任何证据。',
 'skip 是终态但永远不是成功；skip 不得带段目录、summary 或任何证据。建链前（genesis 未写、pre-run 失败）不产生任何 skip/open/close 记录，后续执行标记 not-started；非链执行（C00/C05-PRE/PROBE/SEAL）不产生链记录。')
t = t.replace('3. A 自身失败 ⇒ 升级停止级别（按 A 的 failure_modes），不重复跑第二次。',
 '3. A 自身失败 ⇒ 升级停止级别（按 A 的 failure_modes），不重复跑第二次；halt-all 不得被降为 halt-business。')
t = t.replace('输入：`genesis_written`、`C20-SEAL` 自身结果、链完整性、`staged_state`、是否中止、open tail。',
 '输入：`genesis_written`、`C20-SEAL` 自身结果、链完整性（只由 `SEC-CHAIN-MISMATCH` 触发）、`staged_state`、是否中止、open tail。')
t = t.replace('`exit_status=complete` 仅当：mode=sealed-full、无 failed、无 skipped、C18 bound、index/report 均 present。否则 `exit-not-met`。',
 '`sealed-full` 允许 failed/skipped/gate_failed（gate 失败后的完整证据封存）。`exit_status=complete` 仅当：mode=sealed-full、无 failed、无 skipped、无 gate_failed、C18 bound、index/report 均 present。否则 `exit-not-met`。no-chain 的 records 必须为 0。')
t = t.replace('| C10-N orphan | halt-all | incomplete | aborted | 72 | 链尾开放；SEAL 列 open_segments |',
 '| C10-N orphan | halt-all | incomplete | aborted | 72 | 链尾开放；SEAL 列 open_segments |\n| C10-P security + A fatal（复合） | halt-all | complete | aborted | — | 停止级别保持 halt-all；A 失败不降低等级 |\n| C11+C12 双 gate | continue | complete | sealed-full | — | 两目标各自 A 执行，依赖者跳过 |')
t = t.replace('## 7. 与第十轮问题的对应', '## 7. 与第十一轮问题的对应')
t = t.replace('- N08：`spec:455` 的“after 依赖目标成功”被替换为 `terminal`；C17/M1/C19/REPORT 改为 `recorded`；检查器断言 C10-P gate 的精确 24 项跳过集合。',
 '- F01：`sealed-full` 语义与审计规范统一；`complete` 严格。\n- F02：no-chain/非链/terminal 的 records=0；C01 失败不产生 close。\n- F03/F04：精确 trigger 映射；状态封闭集合；stop 单调；34 个复合场景。\n- F08：aborted 也要求 after；片段结束 pending after 报错。')
t = t.replace('- N09：security-stop 不再固定 degraded-prefix；staged 完整的安全失败得到 aborted；open tail 由 SEAL 以 `open_segments` 描述，不补造 close/summary。',
 '- F01/F09：staged 完整的安全失败得到 aborted；open tail 由 SEAL 以 `open_segments` 描述，不补造 close/summary。')
t = t.replace('- 新增：`flow.missing_after` 与 `flow.after_halt` 两条回放错误，负例各一条。',
 '- 矩阵 340 行（含 34 个复合场景）；检查器独立重算并逐行比较。')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('failure model updated')
