# OpenCode V10 整改计划补充（S01—S06 规范性条款）

日期：2026-11-12 21:38:59（Asia/Shanghai）
状态：**补充计划，未实施**。
基准：`reviews/OPENCODE-P47-V10-REMEDIATION-PLAN-REVISED-20261112-205542.md`（17098 字节，SHA-256 `f9ed2ba9…`）。
复核输入：`reviews/CODEX-P47-V10-PLAN-SECOND-REVIEW-20261112-212933.md`（9556 字节，SHA-256 `9bf0a2b8…`）。

## 0. 优先关系

1. 本文件是 205542 修订版计划的**规范性补充**，不是整份重写。
2. 本文件与 205542 冲突时，**以本文件为准**；未冲突章节继续有效。
3. 尤其以下旧文字被取代：§8 的“complete 仅尾 close / truncated-open 允许 SEAL / 权威 seal 只对 complete”组合；§5 的 delete/rename 保护表述；§4.4 的 accept 顺序；§3 的 reclaim 仅拒绝；§2 的目录树；§4.1 的 rollback-failed 退出码；§5 的片段 schema 名。
4. V9 维持 REJECTED；本补充不构成 V10 实现、运行或验收通过。

## 1. S01：链状态、开放段与权威封存

### 1.1 记录级校验

对原始链从 genesis 开始逐记录校验：

- genesis：`seq=0`、`prev_hash=GENESIS`、schema/长度/摘要有效。
- 后继：`seq=prev.seq+1`、`prev_hash=hash(prev)`、记录字节长度与声明一致。
- 配对：每个 `segment_open` 至多一个后续 `segment_close`；`segment_skip` 不关闭任何 open；close 必须有对应 open。
- 执行状态：`exec_id` 在注册表内，状态转换合法。

`validated_prefix` 为从 genesis 起连续通过上述校验的最长前缀。首个失败记录之后的内容不进入前缀。

### 1.2 状态派生

```text
chain_state =
  no-chain           无有效 genesis
  corrupt            genesis 后存在首个失败记录
  validated-closed   前缀全部通过；open_segments 为空；tail=close
  validated-skip-tail前缀全部通过；open_segments 为空；tail=skip
  validated-open     前缀全部通过；open_segments 非空（tail 可为 open/skip/close）
```

`open_segments` 从整条 `validated_prefix` 派生，不按物理尾推断。`open` 后追加 `segment_skip` 仍为 open；`tail_type` 单独记录 `close|skip|open|none`。

### 1.3 封存模式与 exit

| chain_state | open_segments | 计划/成功条件 | mode | exit |
|---|---|---|---|---|
| validated-closed | 空 | 完整计划且全部成功、无 skip、门禁通过 | `sealed-full` | `complete` |
| validated-closed | 空 | 有显式 abort close | `aborted` | `aborted` |
| validated-closed | 空 | 无 abort，但计划不完整或有 skip/失败 | `degraded-prefix` | `degraded` |
| validated-skip-tail | 空 | 任意 | `degraded-prefix` | `degraded` |
| validated-open | 非空 | 任意 | `aborted-prefix` | `aborted` |
| corrupt | 不适用 | 任意 | 不生成 seal | 非成功记录 |
| no-chain | 不适用 | 任意 | 不生成 seal | launch/no-chain |

规则：

1. `exit=complete` 必须同时满足：`mode=sealed-full`、`chain_state=validated-closed`、`open_segments=[]`、`tail=close`、计划全部目标成功、无 skip、无 security finding、全部门禁与接受证据通过。不得由尾 close 单独推导。
2. `validated-open` 必须列全部 `open_segments`，**不补 close**，不执行 orphan 段的 A；`abort.kind=orphan`、`failure_class=fatal`、`trigger=null`、`code_source=chain-open`。不得声明 `exit=complete` 或 `sealed-full`。
3. `validated-skip-tail` 是合法终态；`segment_skip` 不产生 close，不得伪装成 `complete`。
4. `corrupt` 不生成任何权威 seal；保留原始链字节，生成链外 `p47-operator-record-v10`（raw chain SHA-256、失败位置、原因、操作者、时间、证据路径），明确非成功证据。不得用前缀补 seal。
5. `no-chain` 只生成 `p47-launch-record-v10`；无 genesis 不得推导 complete/aborted。
6. `p47-fragment-seal-v10` 独立、`authoritative=false`、`mode=fragment`，不得产生 `sealed-full/aborted/aborted-prefix/degraded-prefix` 任一终端模式。
7. 权威 seal 只允许 `schema=p47-terminal-seal-v10`；validator 从链重建状态并与 seal 的 `mode/exit/open_segments/tail/counts` 对照，不能只看 seal 自述。

### 1.4 验收项

| 用例 | 构造 | 期望 |
|---|---|---|
| CHAIN-T1 | 正常 close 尾、计划全成功 | `sealed-full/complete`，open=[] |
| CHAIN-T2 | 合法 skip 尾、无 open | `degraded-prefix/degraded`，open=[] |
| CHAIN-T3 | open 后追加 skip | `validated-open`，open 含该段，`aborted-prefix`，不得补 close |
| CHAIN-T4 | 实际坏 hash/seq | `corrupt`，无 seal，operator-record 保留原链 |
| CHAIN-T5 | 无 genesis | `no-chain`，只有 launch-record |
| CHAIN-T6 | abort close、无 open | `aborted/aborted`，exit 非 complete |
| CHAIN-T7 | 片段 seal | `fragment`，非权威，任何终端 mode 都被拒绝 |

## 2. S02：protect deny 优先

### 2.1 保护对象

`protect_set` 至少包含：`ORIGINAL`、`M0`、审计链目录、工具根、V7/V8/V9 只读基线。每个保护根记录路径、类型、摘要和策略版本。

### 2.2 判定顺序

对每个 write/delete/rename/copy/acl 事件，顺序固定：

1. 路径规范化、批准根检查。
2. **protect 判定**：路径或祖先命中保护根 → `protect=deny`，除非命中一条显式 `protect_exception`。
3. 目的 `rule_ref` / 源 `src_rule_ref` 授权判定。
4. 操作合同（CreateNew/overwrite/rename 前置）判定。
5. 写入/删除并记录 `protect_ref/decision/reason`。

规则：

- **protect deny 优先；普通 write/delete/rename 授权不得覆盖 protect。**
- delete：目标 protect deny 即拒绝；不得写“显式删除可绕过”。
- rename：源删除/改名 protect + 目的写 protect 分别检查；任一 deny 即拒绝。
- copy：源只读仍受 protect 读策略；读 deny 即拒绝；不要求源删除权。
- 仅 C02 的 ACL 元数据例外可按明示对象/范围执行；内容删除/改名不继承该例外。
- 事件自称“显式授权”、`rule_ref` 存在、`src_rule_ref` 存在，都不改变 protect 结果。
- 保护策略不得因 scenario/injection 参数放宽；测试注入只能验证拒绝，不能生成例外。

### 2.3 验收项

| 用例 | 期望 |
|---|---|
| PROT-T1 | 删除/改名 ORIGINAL、M0、审计链、工具根 → `protect=deny`，零写入 |
| PROT-T2 | 非保护树合法 delete/rename → 允许，after 正确 |
| PROT-T3 | 受保护源 copy 读取（读策略允许）→ 允许；读策略拒绝 → 拒绝 |
| PROT-T4 | C02 ACL 元数据例外 → 仅元数据变化；同对象内容删除/改名仍拒绝 |
| PROT-T5 | 普通 rule_ref/src_rule_ref 试图覆盖 protect → 拒绝且记录 protect_reason |

## 3. S03：接受点、accepting 与门禁包

### 3.1 状态顺序

```text
prepared -> switching -> pending-acceptance -> accepting -> verified
                                      \-> rolled-back
                                      \-> rollback-failed
```

- `pending-acceptance`：物化新、CURRENT 旧、release 新完整。
- `accepting`：journal=accepting、CURRENT 新、物化新；持锁。
- `verified`：全部门禁完成且绑定 `gate_bundle_digest` 后才持久化。

### 3.2 接受协议

1. **release/staging 门禁**：checker `--mode staging`、verifier `--mode release`、parse/control、lab。失败→不切换。
2. 切换文件，进入 pending；做字节核验和 checker `--mode pending`（允许 CURRENT 旧 + 物化新）。
3. 进入 accepting：
   - 写 journal=`accepting` 并 fsync；
   - 写 CURRENT 新（temp+rename+fsync）；
   - 运行 checker `--mode accepting`、verifier `--mode accepting`（要求 CURRENT 新 + journal accepting）。
4. 汇总 `p47-gate-bundle-v10`：每项 `{gate_id,version,mode,input_digest,result,evidence_digest}`，计算 `bundle_digest`。
5. 只有全部 PASS 才写 journal=`verified`（含 `bundle_digest`、`accepted_at`）并 fsync；随后释放锁。
6. 步骤 5 前任一失败/中断→undo：CURRENT 旧、物化旧、journal=`rolled-back`。
7. `verified` 之后只做诊断复核；任何失败记录 `post_verified_diagnostic`，不自动 undo，不改回 pending。
8. `accepting` 期间的 CURRENT 新只是候选指针：所有消费者必须先校验 `journal=verified` 才能把 CURRENT 当已接受版本；`status`/checker 明确拒绝把 accepting 的 CURRENT 当最终状态。

### 3.3 崩溃矩阵

| 中断点 | 持久状态 | recover 行为 |
|---|---|---|
| accepting 写入前 | pending | 回滚旧树/旧 CURRENT |
| journal=accepting 后、CURRENT 新前 | accepting，CURRENT 旧 | 回滚 |
| CURRENT 新后、门禁完成前 | accepting，CURRENT 新 | 回滚，不自动 accept |
| 门禁完成、verified 前 | accepting | 回滚；门禁证据仅作诊断 |
| verified 写入后、释放锁前 | verified | 按已接受版本复核 |
| verified 后诊断失败 | verified | 记录诊断/`INCONSISTENT`，不自动回滚 |

### 3.4 验收项

- 每个中断点前后各注入一次，断言 journal/CURRENT/物化/release 与 recover 选择一致。
- 断言 `verified` 必含 gate_bundle_digest；缺 bundle 或摘要不符不得视为 verified。
- 断言 verified 之前的中断绝不产生“已接受”状态。
- 断言 verified 之后的诊断失败不会把状态改回 pending/rolled-back。

## 4. S04：回收锁的有限恢复

### 4.1 记录

```json
{"schema":"p47-lock-v10","token":"<32hex>","pid":1234,"created":"ISO8601","purpose":"publish|recover|undo|accept","txid":null}
{"schema":"p47-reclaim-v10","token":"<32hex>","pid":1234,"created":"ISO8601","target_token":"<main token>","target_pid":1234}
```

主锁获取继续使用唯一候选 + 原子硬链接安装；目标存在即失败。`wx` 回退保持保守拒绝。

### 4.2 回收算法

1. 读主锁：必须完整、pid 死亡、主锁 token 未变且与 `reclaim.target_token` 一致；否则拒绝。
2. 读 `LOCK.reclaim`：
   - 不存在：用硬链接安装自己的 reclaim；`EEXIST` 则重读。
   - 完整且 pid 活：`E_LOCKED_RECLAIM`，拒绝。
   - 完整且 pid 死：将 reclaim **原子改名**为唯一 `LOCK.reclaim.stale.<newtoken>`；`ENOENT` 表示输掉，重试/拒绝。随后用硬链接安装新 reclaim；`EEXIST` 表示别人先赢，拒绝。
   - 空/不完整：`BLOCKED_MANUAL`，不自动删除。
3. 持新 reclaim 复读主锁：token/pid 必须仍是同一死亡持有者；否则释放 reclaim、拒绝。
4. unlink 主锁；用硬链接安装自己的主锁；`EEXIST` 表示别人先赢，释放 reclaim、拒绝。
5. 释放 reclaim 只删除 token 与自身一致的文件。

### 4.3 有限性

- 每次只隔离一个 reclaim，不创建 `reclaim.reclaim`，不递归。
- 隔离文件保留为证据；`status` 列出，不自动删除。
- 改名竞争由文件系统原子性裁决：`ENOENT`/`EEXIST` 都是“未获得”，不得继续写。
- 崩溃在最坏情况下留下“死亡主锁 + 死亡 reclaim”或隔离文件；下一次按同一算法再隔离一次，次数有界，不会无限增长。

### 4.4 明确限制

| 状态 | 处理 |
|---|---|
| 主锁空/不完整 | `BLOCKED_MANUAL`，保留现场，不自动删除 |
| reclaim 空/不完整 | `BLOCKED_MANUAL`，保留现场 |
| `_publish` 部分初始化、无 journal/CURRENT | `BLOCKED_MANUAL` / `INCONSISTENT`，不自动建状态 |
| 候选文件残留 | inert，status 列出；不自动删除 |
| 隔离文件残留 | 证据，保留；不自动删除 |
| 死主锁 + 死 reclaim（完整记录） | 自动隔离 + 重建（有限） |

人工恢复协议：确认可信操作者、无活持有者/无并发操作、核对目标 token/pid/路径/摘要；身份变化立即拒绝；操作前后保留现场与哈希。

### 4.5 验收项

在以下时点注入中断：创建 reclaim 前/后、隔离改名前后、安装新 reclaim 前后、删除主锁前后、安装新主锁前后、释放 reclaim 前后。逐项断言：自动恢复或 `BLOCKED_MANUAL`、无活锁误删、无无限递归、现场保留。

## 5. S05：稳定错误码合同

### 5.1 映射表

必需 artifact：`p47-failure-code-map-v10`。

```json
{"schema":"p47-failure-code-map-v10","revision":"v10.0","codes":[
  {"code":"P47-E-CHAIN-HASH","failure_class":"fatal","trigger":null,"allowed_execs":["C19","SEAL"]}
]}
```

规则：

- `code` 为稳定枚举，不随 `reason`、排序、消息文本变化。
- `failure_class ∈ {gate,fatal,security}`；`trigger` 为 null 或注册 trigger ID。
- `allowed_execs` 非空，精确列出可产生该 code 的 exec；禁止 `*`。
- 映射表有独立 revision 与 SHA-256，钉扎在 registry/spec；生成器不得在运行时改写。
- 未知 code → `P47-E-UNKNOWN-CODE`；跨 exec → `P47-E-EXEC-MISMATCH`；class/trigger 与表不符 → `P47-E-MAP-MISMATCH`。

V10 初始表至少包含：

| code | class | trigger | allowed_execs（示例） |
|---|---|---|---|
| `P47-E-CHAIN-HASH` | fatal | null | C19, SEAL |
| `P47-E-CHAIN-SEQ` | fatal | null | C19, SEAL |
| `P47-E-CHAIN-PAIR` | fatal | null | C19, SEAL |
| `P47-E-CHAIN-CORRUPT` | fatal | null | SEAL |
| `P47-E-CHAIN-NOGENESIS` | fatal | null | SEAL |
| `P47-E-ORIGINAL-CHANGED` | security | `ORIGINAL_CHANGED` | C05, C19 |
| `P47-E-PROTECT-DENY` | security | `PROTECTED_WRITE` | C02, C14 |
| `P47-E-WRITE-RULE-MISSING` | fatal | null | C14, C15 |
| `P47-E-WRITE-DENIED` | gate | `WRITE_DENIED` | C14 |
| `P47-E-INPUT-MISSING` | fatal | null | C00, C03, C08, C17 |
| `P47-E-INPUT-HASH` | fatal | null | C00, C03 |
| `P47-E-PARSE` | fatal | null | C04, C08 |
| `P47-E-CHECKER` | gate | `CHECKER_VIOLATION` | C06, C10 |
| `P47-E-VERIFIER` | fatal | null | C18 |
| `P47-E-LOCK` | fatal | null | PUBLISH, RECOVER |
| `P47-E-STATE` | fatal | null | PUBLISH, RECOVER, STATUS |
| `P47-E-UNKNOWN-CODE` | fatal | null | CHECKER |
| `P47-E-EXEC-MISMATCH` | fatal | null | CHECKER |
| `P47-E-MAP-MISMATCH` | fatal | null | CHECKER |

实际 exec 集合以 V10 注册表为准，但一旦冻结只能通过版本化 map revision 变更，不能运行时改。

### 5.2 close 字段与 null 关系

`segment_close` 必填：

```text
close_kind: ok | failed | aborted
failure_code: string|null
failure_class: gate|fatal|security|null
trigger: string|null
```

- `ok`：三者全 null。
- `failed`：`failure_code`/`failure_class` 非 null；`trigger` 可 null。
- `aborted`：`failure_code`/`failure_class` 非 null；`trigger` 可 null。
- `security` 类：`trigger` 必须非 null。
- 无 close：不得伪造 close 字段；链外记录使用 `observed_code` + `code_source=launch|operator|none`，明确非权威 close。

### 5.3 场景注入与 observed

```json
{"schema":"p47-injection-v10","scenario_id":"...","target_exec":"C08",
 "mode":"return_error|throw|kill|corrupt_chain|remove_close|change_original",
 "code":"P47-E-...","requested":{...}}
```

运行证据分别记录：

- `requested`：计划注入的 code/mode/target。
- `reached`：是否实际进入 target、注入是否生效。
- `observed`：实际 close/记录中的 code/class/trigger、来源与证据摘要。

未到达 target → `NOT_REACHED`，不得写成 PASS；未知/非法 code 在运行前拒绝。

### 5.4 四类停止/后继/封存

| 情况 | close | 停止 | 后继 | 封存 |
|---|---|---|---|---|
| 普通 fatal | `failed` + code | 立即停 | 不运行 | 有 close 且无 open：`aborted`；有 open：`aborted-prefix` |
| ORIGINAL 变化 | `aborted` + security code/trigger | 立即停 | 不运行 | `aborted`/`aborted-prefix`，exit 非 complete |
| 链损坏 | 不写 close | 立即停 | 不运行 | 无 seal，仅 operator-record |
| 无 close/orphan | 无 close | 立即停 | 不运行 | `aborted-prefix`，列 open_segments |
| 合法 skip | `segment_skip` | 按计划继续 | 依计划 | `degraded-prefix`，exit degraded |

停止判断只依赖实际 close/记录码与映射表，不再扫描整个执行的能力集。

### 5.5 独立 checker

- 加载钉扎 `p47-failure-code-map-v10` 与摘要，不信任报告内生成表。
- 验证实际 close 的 code 存在、class/trigger 一致、exec 在 allowed_execs。
- 验证 no-close 场景没有伪 close，链外记录只作非成功证据。
- 负例：未知 code、错 class、错 trigger、跨 exec、缺 close code、无 close 伪造 close；每项必须拒绝。

## 6. S06：成员集合增删改事务

### 6.1 集合定义

正式成员 = 构建产物中的文件相对路径集合；不含目录、`_publish`、lab、reviews、临时文件。目录是派生容器，不作为成员。

```text
old = CURRENT.files（首次为空）
new = 构建计划生成的正式文件集合
add = new - old
delete = old - new
modify = {p ∈ old∩new | bytes/sha 不同}
keep = {p ∈ old∩new | bytes/sha 相同}
union = old ∪ new
```

### 6.2 预检（零写入）

- 路径规范化、批准根、无重复、无大小写冲突、无路径逃逸。
- `add/modify` 的 staging 文件存在且摘要匹配。
- `delete/modify` 的旧文件存在/可读；备份目标可写。
- 保护策略对 `delete/modify` 通过；`_publish`/lab 不进入正式集合。
- 任一失败→切换前拒绝，零写入。

### 6.3 journal

```json
{"schema":"p47-journal-v10","members":{
  "old":[...],"new":[...],
  "delta":{"add":[...],"modify":[...],"delete":[...],"keep":[...]},
  "union":[...]}}
```

每项含 `path,kind,bytes,sha256,before,after,change,progress`。`progress` 逐路径记录 `pending|backed-up|written|deleted|verified`，每次变更 fsync。

### 6.4 切换顺序

1. 备份所有 `modify+delete` 的旧文件内容、sha、必要元数据（含 ACL/SDDL）到 `backup/<txid>/members/...`；验证备份摘要。
2. 写 `add+modify`：唯一临时文件 + 原子 rename；逐路径标记 `written`。
3. 最后删除 `delete`：逐路径标记 `deleted`；删除空派生目录可另行记录。
4. 写 CURRENT 新（accepting）；按 S03 完成门禁后 verified。
5. 任何一步失败→按 old 集合回滚，不尝试“继续完成新集合”。

### 6.5 回滚

1. 删除所有 `add` 路径。
2. 从 backup 恢复所有 `modify` 和 `delete` 路径；恢复元数据。
3. 移除不在 old 集合中的新增正式文件；恢复 old 所需目录。
4. 验证正式集合**精确等于 old**、每文件哈希/字节一致、无多余正式文件。
5. 备份缺失/摘要不符→`rollback-failed`（命令码 24），保留现场，不宣称恢复成功。

### 6.6 验收项

| 用例 | 构造 | 期望 |
|---|---|---|
| MEM-T1 | 仅新增 | add 写入；old 其余不变；verified 集合=new |
| MEM-T2 | 仅删除 | 旧文件备份后删除；回滚可恢复 |
| MEM-T3 | 改名 x→z | x 删除、z 新增；回滚恢复 x 并移除 z |
| MEM-T4 | 混合 A={x,y}→B={x,z} | y 删除、z 新增、x 保留；集合精确 |
| MEM-T5 | 删除到一半中断 | recover 回滚；old 完整恢复 |
| MEM-T6 | 备份损坏/恢复失败 | `rollback-failed`，不宣称成功 |
| MEM-T7 | 再次恢复 | 从失败现场重试；仍失败则保持 24 |
| MEM-T8 | 多出一个正式文件 | verified 校验失败，不得忽略 |

## 7. 一致性更正

### 7.1 schema 名称

统一使用 v10 后缀：

| 用途 | 精确名称 |
|---|---|
| 终端封存 | `p47-terminal-seal-v10` |
| 片段封存 | `p47-fragment-seal-v10` |
| 锁 | `p47-lock-v10` |
| 回收锁 | `p47-reclaim-v10` |
| 链外记录 | `p47-operator-record-v10` |
| 事务日志 | `p47-journal-v10` |
| 当前指针 | `p47-current-v10` |
| 门禁包 | `p47-gate-bundle-v10` |
| 错误码表 | `p47-failure-code-map-v10` |
| 注入 | `p47-injection-v10` |

205542 的 `p47-lock-v1` 与本回应前一版的 `p47-fragment-seal-v1` 均作废。

### 7.2 目录

```text
phase4.7/
  V10/
  baseline/
reviews/                 # 仓库根，唯一报告目录
```

`reviews/` 不在 `phase4.7/` 下；205542 的缩进树以本节为准。

### 7.3 退出码命名空间

**实验结果码**（checker/lab 场景）：

| 值 | 名称 |
|---:|---|
| 0 | PASS |
| 1 | FAILED |
| 2 | BLOCKED |
| 3 | NOT_REACHED |
| 4 | NOT_RUN |
| 5 | UNVERIFIED |

**命令状态码**（publish/recover/status/undo/accept）：

| 值 | 名称 |
|---:|---|
| 0 | OK |
| 20 | USAGE |
| 21 | STATE_PENDING |
| 22 | LOCKED |
| 23 | INCONSISTENT |
| 24 | ROLLBACK_FAILED |
| 25 | BLOCKED_EXTERNAL |
| 26 | INTERNAL |

规则：

- 状态表的 `rollback-failed` 使用 **24**，不得写 3。
- 报告/证据必须标注 `status_namespace=experiment|command`。
- 不得把命令码当实验结果码比较；wrapper 需显式映射并记录两者。
- `status` 映射：uninitialized/verified/rolled-back→0；prepared/switching/pending/accepting→21；锁定→22；不一致/证据缺失→23；回滚失败→24；外部阻断→25。

### 7.4 输入来源归因

| 状态 | 定义 | 可消费 |
|---|---|---|
| GENERATED | producer 已执行且 ok，输出完整并有摘要 | 是 |
| PARTIAL_EVIDENCE | producer 已执行但 failed/killed，且有写入归属证据 | 仅作证据，不作完整输入 |
| SKIPPED | producer 未运行 | 否；预期位置文件为 `UNATTRIBUTED_EVIDENCE` |
| UNATTRIBUTED_EVIDENCE | 来源不能归因到某次执行 | 否 |
| EXTERNAL_APPROVED / PREEXISTING | 运行前存在且有批准摘要 | 按合同 |

C17 的 `copies.json`：C09 skipped 时不得当作 GENERATED/PARTIAL；C17 输出 `missing_inputs`、`evaluated=false`，不得静默 ok。

## 8. S01—S06 验收汇总

| 项 | 协议产物 | 必须通过的验收 |
|---|---|---|
| S01 | `p47-terminal-seal-v10`、`p47-fragment-seal-v10`、operator/launch record | CHAIN-T1—T7；尾 close/skip/open+skip/坏 hash/无 genesis；seal 与链重建一致 |
| S02 | protect_set + 判定顺序 + `protect_ref` | PROT-T1—T5；保护根拒绝、非保护允许、ACL 例外不扩展 |
| S03 | accepting 状态 + `p47-gate-bundle-v10` | 每个中断点；verified 前必回滚；verified 后只诊断 |
| S04 | `p47-reclaim-v10` + 隔离改名 | 回收各时点中断；有限、无递归、无活锁误删；BLOCKED_MANUAL 清单 |
| S05 | `p47-failure-code-map-v10` + close 字段 + injection | code/class/trigger/exec 正负例；四类停止/封存；独立 checker 钉扎 |
| S06 | members old/new/delta + 备份/回滚 | MEM-T1—T8；增删改/中断/恢复失败；集合精确 |

## 9. 未执行声明

未修改 V9/V8/V7；未实施 V10；未运行发布器、恢复器、lab、附件脚本；未执行 C00—C20、Phase 0、浏览器/L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未改 ACL。
