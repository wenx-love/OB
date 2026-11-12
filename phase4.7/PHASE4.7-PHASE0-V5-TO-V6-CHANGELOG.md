# OB-Recover Phase 4.7：Phase 0 启动包 V5 → V6 变更记录

日期：2026-11-11。性质：针对第八轮审查（`ab284d00…`）的定向整改记录。不执行 C00—C20、Phase 0、测试、构建、浏览器或 L1；不创建 `D:\P47RUN`/`D:\P47TOOLS`；不修改 ACL、产品与历史证据。

## 1. 范围

只整改第八轮报告列出的 P0-1—P0-4 与 N01—N11。V5 九份文件、V4、第七/第八轮报告全部保留；V6 使用新文件名。

结构性结果：21 个命令 ID、**58 次执行**（新增 `C18-BIND-E01`）、54 个链参与者、**109/103** 条链记录（绑定/未绑定）、TSV **31 列**、payload 20（staged 16 / bootstrap 4）。

## 2. P0-1：16 次执行的读取权限冲突（N01）

**原问题：** 16 次执行允许读取具体 staged 工具文件，同时 `deny_read` 绝对禁止父目录 `RUN\tools`。严格实现会阻止加载；忽略 deny 则违反合同。

**V6 规则：**

1. `RUN\tools` 不再整体 deny。
2. 每个 staged 执行的 business 层只允许**精确加载文件**（进程入口、`fs-guard.cjs`、`p0-audit.cjs`，以及声明的数据文件）。
3. deny 精确列出**未被允许的其余 staged 文件**，不再使用目录级 deny。
4. trusted_load 层（dispatcher）单独登记 manifest、自身、依赖、全部工具字节与 `node.exe`。
5. 检查器逐执行断言：允许与禁止无交集、deny 全部是 16 个已知文件。

| 执行 | 允许的 staged 文件 | 精确 deny 数 |
|---|---|---:|
| C06-E01 | simulate、fs-guard、audit、cases、vectors | 11 |
| C08-E01 | archive、fs-guard、audit | 13 |
| C09-E01 | copy、fs-guard、audit | 13 |
| C10-P-E01 | product-run、fs-guard、audit | 13 |
| C10-N-E01 | product-run、fs-guard、audit | 13 |
| C11-E01 | product-run、fs-guard、audit | 13 |
| C12-E01 | product-run、fs-guard、audit | 13 |
| C13-E01 | product-run、fs-guard、audit | 13 |
| C10-S-E01 | product-run、fs-guard、audit | 13 |
| C14-E01 | neutralize、fs-guard、audit、neutralize-map | 12 |
| C15-E01 | product-run、fs-guard、audit | 13 |
| C16-E01 | product-run、fs-guard、audit | 13 |
| C17-E01 | compare、fs-guard、audit | 13 |
| C18-E01 | archive、fs-guard、audit | 13 |
| C19-E01 | index、fs-guard、audit | 13 |
| C20-REPORT-E01 | report、fs-guard、audit | 13 |

结果：16/16 无“允许文件 vs 父目录绝对禁止”矛盾；无执行需要运行时关闭守卫。

## 3. P0-2：TSV/JSON 权限一致性（N02）

**原始差异：** 54 次执行的 `control_reads` 在 JSON 序列化时丢失；TSV 有列、JSON 无字段。另有 dispatcher 自读、事件分片写、输出父目录创建、产品报告写许可缺口。

**修复：**

- JSON `reads` 现含 `dispatcher`、`business`、`control` 三层；新增 `writes.control`、`audit_part_rule`、`load_files`、`fail_class`、双 `plan_order`/`predecessor`。
- TSV 扩为 **31 列**，由同一构建函数生成；检查器重新生成整份 TSV 并逐字节比较。
- `dir-create` 不再隐含文件写：每个 `file-create`/`file-write` 均有同路径精确权限。
- 审计分片使用 `audit-part-create-append`，限定 `events-<role>-<pid>-<rand8>.jsonl`。
- 所有结果文件补父目录创建（C03-OBS、C04、C05-FINAL、C08、C09、C19、C20-REPORT 等）。
- 产品报告 `vitest.json` 登记为产品层 `file-create`；C10-P/N/S、C12、C13、C16 均补齐真实 `target_argv` 与哈希。
- 临时目录二分：runner/工具 `RUN\tmp`；产品子进程 `COPY\tmp`；C02/C03-OBS/C04/C05-FINAL 的 `TEMP/TMP` 已登记。

**原始 54 处差异 → 修复后 0 处。** 21 条命令逐条核对通过；有意不同的字段只有两类并有规则：`plan_order_unbound` 为空（C18 三连）与 `predecessor_unbound` 不同（绑定/未绑定路径），均不是权限字段。

无法确定的权限项：无字段级未知；所有工具哈希仍为 `null`，等待 manifest，这是外部输入而非规则不确定。

## 4. P0-3：15 个审计向量（N04）

| 组 | 名称 | canonical 字节 | 结果 |
|---|---|---:|---|
| valid | empty_object | 2 | schema/hash/bytes 通过 |
| valid | nested | 41 | 通过 |
| valid | key_order | 19 | 通过 |
| valid | string_escapes | 57 | 通过 |
| valid | astral_char | 12 | 通过 |
| valid | integer_limits | 47 | 通过 |
| valid | negative_zero | 7 | 通过 |
| valid | bools_and_null | 17 | 通过 |
| event | event_write_intent | 514 | ID 32 hex、字段通过 |
| event | event_write_result | 620 | 同执行引用通过 |
| event | event_read_batch | 656 | 同执行权限引用通过 |
| chain | genesis | 670 | 物理 LF 通过 |
| chain | segment_open | 668 | c18 三字段存在（null） |
| chain | segment_close | 968 | prev/open 链接通过 |
| summary | segment_summary | 694 | 无自哈希通过 |

物理字节：`genesis 行 = canonical + 1 LF`；`segment_open.prev_file_bytes = 669`；`segment_close.prev_file_bytes = 1337`；三事件分片 `bytes`/`sha256` 按实际 JSONL（含 3 个 LF）计算，不再硬写 4096 字节。

新增 12 条负例：非法 ID（含字母 v）、31 位 ID、segment_open 缺 c18 字段、write_result 缺 intent_ref、intent 带 outcome、跨执行引用、重复 ID、seq 跳变、prev 不符、无 LF 截断、prev_file_bytes 少算 LF、summary 自哈希。检查器对每条独立验证拒绝原因。

V5 向量原文件保留，未覆盖。

## 5. P0-4：失败与跳过分支（N07/N09）

新增 `C18-BIND-E01`：唯一读取 `P0_SECOND_ARCHIVE` 的执行，位于 `C07-A-C17-E01` 之后；写入绑定状态后，绑定路径进入 C18 三连，未绑定路径直接进入 `C07-B-C19-E01`。两条顺序各有独立 `predecessor_unbound`。

| 分支 | 终止状态 | 是否重试 | 允许后继 |
|---|---|---|---|
| C00/C05-PRE 失败 | pre-run-failed | 否 | 无 |
| C01 失败 | bootstrap-failed | 否 | 无（不写 SEAL） |
| C02—C17/C19/C20-REPORT 硬失败 | fatal-abort | 否 | 失败目标的一次 C07-A + SEAL(aborted) |
| C10—C16/C18 非零 | gate-failed | 否 | C07-A + 后续目标 + C19/REPORT |
| C07-A 捕获失败目标 | target-aborted | 否 | 按失败点继续 |
| 链损坏 | chain-broken | 否 | 无（SEAL 拒写） |
| C18 未绑定 | c18-skipped-unbound | 否 | C07-B-C19（未绑定顺序） |
| SEAL 写失败 | seal-failed | 否 | 无 |
| SEAL 中止模式 | seal-aborted | 否 | 无 |
| 全部通过 | complete | — | 独立复核 |

没有任何状态是 pending；跳过显式记为终态；链不完整不得标 complete；C18 未绑定不得伪装成归档成功。

## 6. N01—N11 对照

| 发现 | V6 处置 |
|---|---|
| N01 allow/deny 重叠 | 第 2 节：精确 deny + 分层 |
| N02 control 读丢失/自读/分片 | 第 3 节：JSON 补全、31 列逐字节、audit-part、父目录 |
| N03 产品报告/父目录/tmp | 第 3 节：vitest.json 产品写、OUT 目录创建、RUN/COPY tmp 分离 |
| N04 非法向量/漏 LF | 第 4 节 |
| N05 genesis 角色与 107/101 | C01 同时具备 create + append + summary；计数 109/103 |
| N06 C19 截止点/读范围 | 截止点改为前一 `segment_close`；C19 读 `OUT` 全树 |
| N07 skip/失败 after/早期 abort | 第 5 节；A 包裹接受 failed/aborted；C18-BIND |
| N08 C10 真实 argv | 8 条产品执行全部登记 `target_argv` 与哈希 |
| N09 C03 期限/可信加载 | PROBE 300 s 入注册表；C00 祖先重解析；dispatcher 自读与 FileShare 规则 |
| N10 自检断言不足 | 新检查器 1761 项：逐 31 列、schema、schema/权限/字节、负例、双计划、失败矩阵；去除恒真项 |
| N11 父 ACL/记录准确性 | 主文保留父目录责任；自检体积改写实际值；C02 只递归 RUN |

## 7. 未改变

D3/D4/D10/D12/D14/D15、R 评级 0/23/2、安全指标、阶段顺序、ORIGINAL 只读、Codex 零写、零分母 `n/a`、`version-mismatch` 阻断均不变。工具哈希仍为 null，只来自 manifest。

## 8. 未验证

ACL、真实 fork、guard、原生/FD/链接、审计实现、独占/flush、C10 实际执行、C18 绑定与归档、终端封存交叉校验全部 UNVERIFIED。静态检查通过不等于运行通过。
