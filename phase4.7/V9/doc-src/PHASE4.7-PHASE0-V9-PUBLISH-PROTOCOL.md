# OB-Recover Phase 4.7：V9 发布协议

日期：2026-11-12。对象：V9 契约/工具包本身（不是 `D:\P47TOOLS` 的 payload 发布，也不是产品构建）。实现：`p0v9-publish.cjs`；调用方：`p0v9-build.cjs`；故障实验：`p0v9-lab.cjs`。

## 1. 布局

```text
V9\
  PHASE4.7-...-V9.md / .tsv / .json     交付物（物化视图）
  p0v9-*.cjs / .ps1                     生成与检查工具
  _publish\
    releases\<rid>\                     不可变 release（含 .release-index.json）
    staging\<rid>\                      写入中的临时目录
    backup\<txid>\                      按事务唯一的持久备份（不随 rid 覆盖）
    journal.json                        事务日志（v2）
    LOCK                                单写者锁（pid + 时间）
    CURRENT.json                        唯一提交指针
    gate.json                           检查器/验证器退出码与计数
```

`rid = sha256(canon(sorted[{path,bytes,sha256}]))`（完整 64 hex）；同一内容得到同一 rid。`txid` = rid 前 16 位 + 时间 + 随机数，backup 按 txid 唯一。release 目录一旦存在就不再覆盖；若内容不同则失败关闭。

## 2. 状态

`prepared → switching → committed → verified`；失败进入 `rolled-back` 或 `rollback-failed`。

| 状态 | 含义 | 消费者可见性 |
|---|---|---|
| prepared | 日志已落盘，旧树未动 | 旧版本 |
| switching | 正在逐文件 temp+rename | 可能混合；日志标记未提交 |
| committed | 所有文件已切换，指针已写 | 新版本（尚待复核） |
| verified | 提交后逐文件复核通过 | 新版本 |
| rolled-back | 从备份恢复并复核通过 | 旧版本 |
| rollback-failed | 恢复失败，退出码 3 | 不一致，必须人工处理 |

## 3. 事务步骤与每个失败点的恢复

| 步骤 | 失败后果 | 恢复 |
|---|---|---|
| P1 内存生成/自检 | 未写盘 | 退出 1，无副作用 |
| P0 入口闸门 | LOCK 被活进程持有，或 journal 处于 prepared/switching/committed/rollback-failed | `E_LOCKED` / `E_UNFINISHED_TX`；不覆盖 journal/backup，先 recover |
| P3 staging 复核 + 独立检查器/PowerShell 门 | 不进入 release | 同上；门失败不提交 |
| P4 staging → `releases\<rid>` rename | 无 release 或完整 release | 失败删 staging；成功则 release 完整 |
| P5 旧文件持久备份 | 无备份不切换 | 退出；旧树不变 |
| P6 逐文件 temp+rename | 可能混合 | 日志为 switching；`recover` 从 backup 全量恢复 |
| P7 `CURRENT.json` temp+rename | 指针仍旧或新 | rename 是单文件原子；temp 残留由 recover 清理 |
| P8 提交后逐文件复核 / post gate | 可能不一致或静态门失败 | 自动 rollback；build 的 post gate 失败调用 `undo()`；如回滚失败 → `rollback-failed`，退出 3 |
| P9 写入 verified 日志 | 下次 `recover` 复核 | 已提交内容仍完整 |

## 4. Windows 同卷条件

release、staging、backup、物化文件必须同在一个 NTFS 卷（`V9\` 与其 `_publish\`）。rename 使用 Node/libuv 的 `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`，单文件替换是原子的；**多文件切换不是一次原子 OS 操作**，因此需要日志与恢复。

## 5. 恢复

```text
node p0v9-publish.cjs status  <root>
node p0v9-publish.cjs recover <root>
```

```text
node p0v9-publish.cjs status  <root>   # issues 非空退出 1
node p0v9-publish.cjs recover <root>   # 修复未完成事务
node p0v9-publish.cjs undo    <root>   # 显式撤销已提交事务（post gate 失败用）
```

`status` 全量核验：CURRENT.files 重算 RID、release index 与 CURRENT 全量 canon 相等、release 每个文件字节、物化每个文件字节、journal 与 CURRENT 的 rid/state 一致性、LOCK/staging 残留。`recover` 对 `verified`/`committed` 先做同样全量核验，失败则回滚；prepared/switching/rollback-failed 一律回滚，回滚后复核旧树、旧 release 与指针。`undo` 只用于已提交但后置门禁失败的事务，回滚并复核旧版本。

## 6. 明确不声称

1. 不声称多文件发布是单次原子提交。
2. 不声称 fsync 能覆盖断电、磁盘错误或固件缓存。
3. 不声称能抵御外部进程在切换窗口内改写文件。
4. 不声称故障实验室等价于真实故障注入：实验室只做进程内 throw、短写、自杀式 SIGKILL 与单写者锁，真实磁盘错误、断电、外部 kill、多写者竞争仍 UNVERIFIED。
5. 目录 fsync 在 Windows 上可能不被支持；实现尝试并记录 `dir_sync`，不把该结果当作断电保证。

## 7. 故障实验室与证据

`p0v9-lab.cjs` 在 `C:\Users\Administrator\TEMP\opencode\p47-lab-v9\run-<name>-<id>` 下运行 **17** 个场景：首次发布、幂等重发、内容寻址确定性、stage/backup/switch/pointer/postverify 注入、回滚注入失败、切换中 SIGKILL、指针切换中 SIGKILL、kill 后再次发布被拒、post gate `undo`、单写者锁拒绝、短写（chunk=3）、release 损坏、指针损坏。

每个场景在 `_publish\lab\<run>\<scenario>\` 保留：`scenario.json`（expected/actual/逐步骤结果/前后树哈希/失败现场/代码 SHA）、`journal.json`、`CURRENT.json`、release 列表；kill 场景额外保留 after-kill 文件。build 把 `report.json` 的 SHA-256 写入 `_publish\gate.json`。scratch 根在证据捕获后删除。实验不接触 V9 包、`D:\P47RUN`、`D:\P47TOOLS`、产品或历史证据。真实磁盘错误/断电/外部 kill/多写者仍 UNVERIFIED。
