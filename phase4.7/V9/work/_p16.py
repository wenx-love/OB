import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\doc-src\PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md'
t = io.open(p, encoding='utf-8').read()
t = t.replace('日期：2026-11-11', '日期：2026-11-12')
t = t.replace('    staging\\<rid>\\                      写入中的临时目录\n    backup\\<rid>\\                       切换前的持久备份\n    journal.json                        事务日志',
              '    staging\\<rid>\\                      写入中的临时目录\n    backup\\<txid>\\                      按事务唯一的持久备份（不随 rid 覆盖）\n    journal.json                        事务日志（v2）\n    LOCK                                单写者锁（pid + 时间）')
t = t.replace('`rid = sha256(canon(sorted[{path,bytes,sha256}]))` 的前 24 位；同一内容得到同一 rid。release 目录一旦存在就不再覆盖；若内容不同则失败关闭。',
              '`rid = sha256(canon(sorted[{path,bytes,sha256}]))`（完整 64 hex）；同一内容得到同一 rid。`txid` = rid 前 16 位 + 时间 + 随机数，backup 按 txid 唯一。release 目录一旦存在就不再覆盖；若内容不同则失败关闭。')
t = t.replace('| prepared | 日志已落盘，旧树未动 | 旧版本 |', '| prepared | 日志已落盘，旧树未动 | 旧版本 |')
t = t.replace('| P2 staging 写入（CreateNew + fsync） | 只有 `staging\\<rid>` 残留 | 下次运行删除 staging；指针不变 |',
              '| P0 入口闸门 | LOCK 被活进程持有，或 journal 处于 prepared/switching/committed/rollback-failed | `E_LOCKED` / `E_UNFINISHED_TX`；不覆盖 journal/backup，先 recover |')
t = t.replace('| P2 staging 写入（CreateNew + fsync） | 只有 `staging\\<rid>` 残留 | 下次运行删除 staging；指针不变 |',
              '| P2 staging 写入（循环写 + fsync） | 只有 `staging\\<rid>` 残留 | 下次运行删除 staging；指针不变 |')
t = t.replace('| P8 提交后逐文件复核 | 可能不一致 | 自动回滚；如回滚失败 → `rollback-failed`，退出 3 |',
              '| P8 提交后逐文件复核 / post gate | 可能不一致或静态门失败 | 自动 rollback；build 的 post gate 失败调用 `undo()`；如回滚失败 → `rollback-failed`，退出 3 |')
t = t.replace('`status` 只读：指针是否存在、release 是否存在、每个物化文件是否与指针哈希一致、staging 残留、日志状态。`recover` 保守处理：`verified`/`committed` 先复核，失败则回滚；其余状态一律回滚；回滚后再复核旧树。',
'''```text
node p0v9-publish.cjs status  <root>   # issues 非空退出 1
node p0v9-publish.cjs recover <root>   # 修复未完成事务
node p0v9-publish.cjs undo    <root>   # 显式撤销已提交事务（post gate 失败用）
```

`status` 全量核验：CURRENT.files 重算 RID、release index 与 CURRENT 全量 canon 相等、release 每个文件字节、物化每个文件字节、journal 与 CURRENT 的 rid/state 一致性、LOCK/staging 残留。`recover` 对 `verified`/`committed` 先做同样全量核验，失败则回滚；prepared/switching/rollback-failed 一律回滚，回滚后复核旧树、旧 release 与指针。`undo` 只用于已提交但后置门禁失败的事务，回滚并复核旧版本。''')
t = t.replace('4. 不声称故障实验室等价于真实故障注入：实验室只做进程内 throw 与自杀式 SIGKILL，真实磁盘错误、断电、外部 kill 仍 UNVERIFIED。',
              '4. 不声称故障实验室等价于真实故障注入：实验室只做进程内 throw、短写、自杀式 SIGKILL 与单写者锁，真实磁盘错误、断电、外部 kill、多写者竞争仍 UNVERIFIED。\n5. 目录 fsync 在 Windows 上可能不被支持；实现尝试并记录 `dir_sync`，不把该结果当作断电保证。')
old7 = t[t.index('## 7. 故障实验室'):]
new7 = '''## 7. 故障实验室与证据

`p0v9-lab.cjs` 在 `C:\\Users\\Administrator\\TEMP\\opencode\\p47-lab-v9\\run-<name>-<id>` 下运行 **17** 个场景：首次发布、幂等重发、内容寻址确定性、stage/backup/switch/pointer/postverify 注入、回滚注入失败、切换中 SIGKILL、指针切换中 SIGKILL、kill 后再次发布被拒、post gate `undo`、单写者锁拒绝、短写（chunk=3）、release 损坏、指针损坏。

每个场景在 `_publish\\lab\\<run>\\<scenario>\\` 保留：`scenario.json`（expected/actual/逐步骤结果/前后树哈希/失败现场/代码 SHA）、`journal.json`、`CURRENT.json`、release 列表；kill 场景额外保留 after-kill 文件。build 把 `report.json` 的 SHA-256 写入 `_publish\\gate.json`。scratch 根在证据捕获后删除。实验不接触 V9 包、`D:\\P47RUN`、`D:\\P47TOOLS`、产品或历史证据。真实磁盘错误/断电/外部 kill/多写者仍 UNVERIFIED。
'''
t = t.replace(old7, new7)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('publish doc updated')
