# OB-Recover Phase 4.7：V7 → V8 变更记录

日期：2026-11-11。输入：V7 二十一份文件（哈希见第十轮报告）；第十轮报告 `6d4825af…`。本记录只列实质变化，不复制全文。

## 1. 命名与版本

| 项 | V7 | V8 |
|---|---|---|
| 契约文件名 | `…-V7.md/tsv/json` | `…-V8.md/tsv/json` |
| registry schema | `p47-phase0-command-registry-v7` | `…-v8` |
| tool release | `p47-phase0-tool-release-v3` / `p47-phase0-v7` | `v4` / `p47-phase0-v8` |
| event schema | `p47-audit-event-v2` | `p47-audit-event-v3` |
| chain schema | `p47-chain-record-v3` | `p47-chain-record-v4` |
| summary / seal | `v2` / `v2` | `v3` / `v3` |
| vectors | `p47-audit-vectors-v3` | `p47-audit-vectors-v4` |
| 白名单列数 | 33 | 38 |

## 2. 执行规格

- 每个执行新增 `class`、`requires`、`failure_modes`、`temp`、`audit_roles`、`preconditions`。
- `deps` 保留为 ok 依赖的简写，但注册表以 `requires` 为准；`requires.state` 从“成功/失败”细分为 `ok/terminal/recorded/settled`。
- C17 的 M1/S5—S7 依赖从 `terminal`（不接受 skip）改为 `recorded`；C19/REPORT/SEAL 同样。
- `C07-A(T)` 的依赖从 `T: ok` 改为 `T: terminal`；`C07-B(T)` 与目标共享 ok 依赖，依赖失败时一起跳过。
- 每个失败原因生成稳定 `FM-<EXEC>-NN`，绑定 `class` 与 `trigger`；未绑定 trigger 的 security 原因会被生成器拒绝。
- C01 的 control 写新增 `AUDIT\C01` 的 `dir-create-if-absent`。
- 9 个产品 runner 的 business 写/读新增 `RUN\tmp`；C01 也登记 `RUN\tmp` 的建目录、读、写。
- C18/C19/REPORT/SEAL 的输入新增绑定文件精确读取；C19/REPORT/SEAL 为可选读取。
- C19/REPORT 的 TEMP 登记补全（此前只有写、没有读）。

## 3. 注册表新增块

| 块 | 内容 |
|---|---|
| `flow` | 要求状态、停止级别、skip 原因、强制 after、封存函数、306 场景矩阵摘要与样本 |
| `failure_policy` | trigger 词表、每个原因的分类规则、封存模式、abort 后继 |
| `temp_policy` | 逐执行 TEMP 模式/路径/同层授予/产品 TEMP |
| `binding` | 唯一路径、生产者、消费者、可选读、BIND 后不读环境 |
| `publish` | 布局、状态、提交点、同卷条件、恢复命令、明确不声称 |
| `directories` | 每个目录的声明创建者、实际创建执行、读者数、写者数、生命周期 |
| `counts` | 新增矩阵行数、负例数、正例数 |

## 4. 检查器

- 新增闭合字段、角色枚举与逐执行允许角色、actor 常量、`intent_order`/`intent_unique`、`durable`、`bytes_written`、`after` 类型、读条目 rule_ref/deny/scope、counts 精确匹配。
- 新增 `write/protect` 交集、TEMP 反查、审计父目录、绑定路径一致性、`requires` 后向性、failure_modes 合法性。
- 新增独立状态机：从注册表重算 306 场景，比较矩阵摘要、C10-P 精确 24 项 skip、late security=aborted、early fatal=degraded-prefix、orphan=aborted。
- 新增链物理检查（seq/prev/prev_file_bytes）、skip 因果、`flow.missing_after`、`flow.after_halt`、封存模式与分区。
- 新增发布状态检查：`CURRENT.json` 与物化树逐文件一致、release index 存在、journal=verified。

## 5. 向量

- 正例从 16 增至 57（含 C01 完整 bundle、产品 preload、observer、gate/security/orphan 链片段、4 个封存）。
- 负例从 12 增至 35；全部基于合法基底单点变异，改名/改路径后重算 seq/prev，避免级联；新增真实截断 JSONL 字节流。
- 链记录字节按 V8 实际 canonical 计算，不再引用 V7 的 574/1234/2203。

## 6. 发布

- 删除“逐文件 writeFileSync 覆盖 + 尽力回滚 + 吞异常”。
- 新增内容寻址 release、持久备份、journal、单指针提交、提交后复核、`recover`、`rollback-failed` 退出 3。
- 新增 11 场景隔离故障实验室；正常幂等与注入故障分开记录。

## 7. 未变

- 21 命令、58 执行、54 链参与者、109/103 nominal 记录、绑定/未绑定计划长度 58/55。
- 四层权限、ORIGINAL 只读、map-list、C04 `CreateNew`、C06 guard、C18 只读一次环境、SECOND_ARCHIVE 外部输入。
- 产品与历史文件未修改；Phase 0 未启动。
