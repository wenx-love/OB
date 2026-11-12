# OB-Recover Phase 4.7：V8 发布协议

日期：2026-11-11。对象：V8 契约/工具包本身（不是 `D:\P47TOOLS` 的 payload 发布，也不是产品构建）。实现：`p0v8-publish.cjs`；调用方：`p0v8-build.cjs`；故障实验：`p0v8-lab.cjs`。

## 1. 布局

```text
V8\
  PHASE4.7-...-V8.md / .tsv / .json     交付物（物化视图）
  p0v8-*.cjs / .ps1                     生成与检查工具
  _publish\
    releases\<rid>\                     不可变 release（含 .release-index.json）
    staging\<rid>\                      写入中的临时目录
    backup\<rid>\                       切换前的持久备份
    journal.json                        事务日志
    CURRENT.json                        唯一提交指针
    gate.json                           检查器/验证器退出码与计数
```

`rid = sha256(canon(sorted[{path,bytes,sha256}]))` 的前 24 位；同一内容得到同一 rid。release 目录一旦存在就不再覆盖；若内容不同则失败关闭。

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
| P2 staging 写入（CreateNew + fsync） | 只有 `staging\<rid>` 残留 | 下次运行删除 staging；指针不变 |
| P3 staging 复核 + 独立检查器/PowerShell 门 | 不进入 release | 同上；门失败不提交 |
| P4 staging → `releases\<rid>` rename | 无 release 或完整 release | 失败删 staging；成功则 release 完整 |
| P5 旧文件持久备份 | 无备份不切换 | 退出；旧树不变 |
| P6 逐文件 temp+rename | 可能混合 | 日志为 switching；`recover` 从 backup 全量恢复 |
| P7 `CURRENT.json` temp+rename | 指针仍旧或新 | rename 是单文件原子；temp 残留由 recover 清理 |
| P8 提交后逐文件复核 | 可能不一致 | 自动回滚；如回滚失败 → `rollback-failed`，退出 3 |
| P9 写入 verified 日志 | 下次 `recover` 复核 | 已提交内容仍完整 |

## 4. Windows 同卷条件

release、staging、backup、物化文件必须同在一个 NTFS 卷（`V8\` 与其 `_publish\`）。rename 使用 Node/libuv 的 `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`，单文件替换是原子的；**多文件切换不是一次原子 OS 操作**，因此需要日志与恢复。

## 5. 恢复

```text
node p0v8-publish.cjs status  <root>
node p0v8-publish.cjs recover <root>
```

`status` 只读：指针是否存在、release 是否存在、每个物化文件是否与指针哈希一致、staging 残留、日志状态。`recover` 保守处理：`verified`/`committed` 先复核，失败则回滚；其余状态一律回滚；回滚后再复核旧树。

## 6. 明确不声称

1. 不声称多文件发布是单次原子提交。
2. 不声称 fsync 能覆盖断电、磁盘错误或固件缓存。
3. 不声称能抵御外部进程在切换窗口内改写文件。
4. 不声称故障实验室等价于真实故障注入：实验室只做进程内 throw 与自杀式 SIGKILL，真实磁盘错误、断电、外部 kill 仍 UNVERIFIED。

## 7. 故障实验室

`p0v8-lab.cjs` 在 `C:\Users\Administrator\TEMP\opencode\p47-lab\run-<n>` 下运行 11 个场景：首次发布、幂等重发、内容寻址确定性、stage/backup/switch/pointer/postverify 注入、回滚注入失败、切换中 SIGKILL、指针切换中 SIGKILL。每个场景结束删除 scratch；证据写入 `_publish\gate.json` 的 `lab` 字段（构建时）或标准输出。实验不接触 V8 包、`D:\P47RUN`、`D:\P47TOOLS`、产品或历史证据。
