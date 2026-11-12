import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\doc-src\PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md'
t = io.open(p, encoding='utf-8').read()
t = t.replace('日期：2026-11-11', '日期：2026-11-12')
t = t.replace('待第十一轮独立复核', '待第十二轮独立复核')
t = t.replace('| write_intent | intent_id、op、path、path_kind、src_path、rule_ref、decision、before | `intent_id=event_id`；路径必须 canonical 绝对；rule_ref 必须解引用到该执行的写列表并覆盖该路径 |',
              '| write_intent | intent_id、op、path、path_kind、src_path、rule_ref、decision、before | `intent_id=event_id`；路径必须 canonical 绝对；rule_ref 必须原始层正确（product 事件只能引 product_writes，其他 role 只能引 business_writes）、解引用到该执行、覆盖路径，且 `op` 被规则的 `op` 允许；rename/copy 的 `src_path` 必须可读；非 rename/copy 必须为 null |')
t = t.replace('| write_result | intent_ref、outcome、error_code、after、bytes_written、durable | 必须引用同分片、同执行、更早的 intent；每个 intent 恰好一个 result；ok ⇒ error_code=null、durable=true、after 与 bytes 一致 |',
              '| write_result | intent_ref、outcome、error_code、after、bytes_written、durable | 必须引用同分片、同执行、更早的 intent；每个 intent **恰好一个** result（缺失即 `schema.intent_unpaired`）；ok ⇒ error_code=null、durable=true；append 的 bytes_written 是本次增量且 ≤ after.bytes（最终长度），create/overwrite/copy 才要求等于 after.bytes |')
t = t.replace('| preload | guard_pid、parent_pid、process_role、guard_sha256、argv_sha256、policy_sha256、inherited_env_keys | policy_sha256 必须等于该执行 guard policy |',
              '| preload | guard_pid、parent_pid、process_role、guard_sha256、argv_sha256、policy_sha256、inherited_env_keys | policy_sha256 必须等于该执行的登记 policy：product 事件等于 `product.policy_sha256`，其他 role 等于 `guard.policy_sha256`；不符即 `perm.preload_policy` |')
t = t.replace('4. ok 且 op 写字节时，`bytes_written` 必须等于 `after.bytes`；`after.sha256` 为 64 hex。',
              '4. ok 且 op 写字节时：create/overwrite/copy 的 `bytes_written` 等于 `after.bytes`；append 的 `bytes_written` 是本次追加量、必须 ≤ `after.bytes`；`after.sha256` 为 64 hex。')
t = t.replace('6. 写路径必须被其 `rule_ref` 指向的规则覆盖；规则的 `kind` 决定是否允许子树（`subtree-write` 才允许后代）。',
              '6. 写路径必须被其 `rule_ref` 指向的规则覆盖；规则的 `kind` 决定是否允许子树（`subtree-write` 才允许后代）。\n7. 操作必须被规则允许：create→file/dir/subtree create 类；overwrite/append→file-write/file-append/subtree-write；mkdir→dir-create；rename/copy/delete→subtree-write；acl→acl-set-recursive。\n8. 非 acl 写不得与 `protect_write` 相交；acl 是元数据写例外，但必须 SDDL 回读。')
t = t.replace('3. `result=ok`：必须由读规则覆盖；不得与 deny_read 相交（相交时只报 deny，不再报 scope）；content 读必须有 bytes 与 sha256。',
              '3. `result=ok`：必须由**原始层**正确的读规则覆盖（product→product_reads，其他→business_reads）；不得与 deny_read 相交（相交时只报 deny，不再报 scope）；content 读必须有 bytes 与 sha256。')
t = t.replace('| segment_skip | reason、failed_dependency、skipped_utc | reason ∈ dependency-failed|target-skipped|c18-unbound|run-stopped；前三者的 failed_dependency 必须是更早的 failed/skipped 执行；c18-unbound 必须为 null 且此前有 BIND disabled-unbound；skip 不得带 segment_dir/summary |',
              '| segment_skip | reason、failed_dependency、skipped_utc | reason ∈ dependency-failed|target-skipped|c18-unbound|run-stopped；dependency-failed/target-skipped 的 failed_dependency 必须是更早的 failed/skipped；只有 run-stopped 允许指向一个 open（dispatcher 死亡）；c18-unbound 必须为 null 且此前有 BIND disabled-unbound；skip 不得带 segment_dir/summary |')
t = t.replace('summary：`schema= p47-segment-summary-v3`', 'summary：`schema= p47-segment-summary-v9`')
t = t.replace('终端封存：`schema=p47-terminal-seal-v3`', '终端封存：`schema=p47-terminal-seal-v9`')
t = t.replace('1. `sealed-full` ⇒ staged_state=complete、run_state=completed、无 open_segments、无 skipped、无 gate_failed、index 与 report 均 present。',
              '1. `sealed-full` ⇒ staged_state=complete、run_state=completed、无 open_segments、index 与 report 均 present。**允许** failed/skipped/gate_failed（gate 失败后的完整证据封存）；只有三者全空且 C18 bound 才 `exit_status=complete`。')
t = t.replace('1. 失败目标若有 after 包装，其 `C07-A` 必须在下一条业务记录之前出现；否则 `flow.missing_after`。',
              '1. 失败**或 aborted** 目标若有 after 包装，其 `C07-A` 必须在下一条业务记录之前出现；片段结束时仍有 pending after 同样报 `flow.missing_after`。')
t = t.replace('3. `segment_skip` 的失败来源必须在同一链片段中已经 failed/skipped。',
              '3. `segment_skip` 的失败来源必须在同一链片段中已经 failed/skipped；只有 run-stopped 允许 open。')
t = t.replace('- 正例 57 项：8 canonical、5 分片、19 事件、17 链记录、1 summary、4 seal。',
              '- 正例 58 项：8 canonical、5 分片、19 事件、17 链记录、1 summary、5 seal（含 sealed-full 带失败/跳过的正式正例）。')
t = t.replace('- 负例 35 条，', '- 负例 41 条，')
t = t.replace('- 检查器断言“恰好一个错误且等于期望码”；不接受“有错即可”。',
              '- 检查器断言“恰好一个错误且等于期望码”；不接受“有错即可”。新增 op 越权、intent 未配对、product 引用 business rule、错误 preload policy、aborted 缺 after、sealed-full+complete+skipped。')
t = t.replace('真实 writer 的 append/fsync/锁/恢复、`FileShare.Read` 与装载窗口、真实并发与 FD、NTFS 重解析/硬链接/8.3 别名、外部进程篡改、断电与磁盘错误均未验证。',
              '真实 writer 的 append/fsync/锁/恢复、`FileShare.Read` 与装载窗口、真实并发与 FD、NTFS 重解析/硬链接/8.3 别名、外部进程篡改、断电与磁盘错误均未验证；append 的增量语义也没有运行证据。')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('audit spec updated')
