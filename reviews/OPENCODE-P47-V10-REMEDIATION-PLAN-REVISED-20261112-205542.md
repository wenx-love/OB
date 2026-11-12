# OpenCode V10 整改计划（修订版，未实施）

日期：2026-11-12 20:55:42（Asia/Shanghai）
状态：**计划，未实施**。本版只修订计划，不修改 V9/V8/V7，不运行发布器、恢复器、lab、附件脚本或 Phase 0。
索引：逐项回应见 `reviews\OPENCODE-P47-V10-PLAN-REVIEW-RESPONSE-20261112-205542.md`；输入复核报告为 `reviews\CODEX-P47-V10-PLAN-REVIEW-20261112-204406.md`（11124 字节，SHA-256 `54d098d7…`）。

## 1. 目标与边界

V10 目标：逐项关闭第十二轮 Q01—Q14，并接受 P01—P09 的设计修订；不以修改预期、删场景、放宽断言获得通过。

边界：

- 唯一交付位置：仓库根 `phase4.7/V10/`；审查/回应在 `reviews/`。
- V9/V8/V7 与历史证据只读；新证据不覆盖旧证据。
- 本轮不实施；未来 V10 的隔离 scratch 实验需用户单独授权，不默认允许执行 V9 工具、真实发布根、ACL 或 Phase0。
- 真实磁盘错误/断电/外部 kill/多写者并发仍只能标 UNVERIFIED，除非另行授权并完成相应平台实验。

## 2. 版本、目录与成员

```text
phase4.7/
  V10/
    PHASE4.7-PHASE0-...-V10.md / .tsv / .json
    p0v10-*.cjs / .ps1
    doc-src/...
    _publish/
      releases/<rid>/
      backup/<txid>/
      staging/<txid>/
      journal.json
      CURRENT.json
      LOCK
      lab/<run>/<scenario>/
  baseline/
    V7-V8-MANIFEST.json        # 只读基线包：V7/V8 文件 + SHA-256
  reviews/                     # Codex/OpenCode 报告
```

成员规则：

1. V10 正式集 = 由 `build` 的输入映射、manifest、doc-src、工具列表、`CURRENT.files`、release index、release 物理文件、物化文件**双向核验**派生；不预设“恰好 37 项”。
2. manifest 列正式文件（不含自身）；manifest 自身由 CURRENT 绑定。
3. 历史基线 V7/V8 作为独立只读输入包，`baseline/V7-V8-MANIFEST.json` 记录相对路径、字节、SHA-256；完整 gate 显式声明依赖它。
4. 仅复制 V10 正式集时，纯生成路径应可运行；完整 gate 必须显式带 baseline；两类通过条件分开报告。

## 3. 锁算法（P01）

### 3.1 锁记录

```json
{"schema":"p47-lock-v1","token":"<32 hex>","pid":1234,"created":"ISO8601","purpose":"publish|recover|undo|accept","txid":"<txid|null>"}
```

### 3.2 获取（首选硬链接安装）

1. `ensureDir(_publish)`。
2. 生成唯一候选 `_publish/LOCK.cand.<pid>.<token>`；`openSync(candidate,'wx')`，循环写完整记录，`fsync`，关闭。
3. `linkSync(candidate, LOCK)`：
   - 成功：删除 candidate，返回 session（token）。
   - `EEXIST`：读 LOCK。
     - 空/不可解析/字段不全：删除 candidate，抛 `E_LOCK_UNINITIALIZED`；**不删除 LOCK**。
     - 完整且 `pidAlive(pid)`：删除 candidate，抛 `E_LOCKED`。
     - 完整且 pid 已死：进入 3.3 的回收。
   - `EPERM/EXDEV/ENOSYS`（硬链接不可用）：进入 3.4 回退。
4. 任何路径都不使用普通 `rename` 作为“存在即失败”的互斥原语。

### 3.3 陈旧锁回收

1. 用同一硬链接方式获取 `_publish/LOCK.reclaim`（唯一候选；`EEXIST` 即拒绝）。
2. 复读 LOCK：token 必须与第 3 步读到的一致，且 pid 仍死亡；否则释放 reclaim、拒绝。
3. `unlinkSync(LOCK)`。
4. 尝试 `linkSync(candidate, LOCK)`：
   - 成功：清理 reclaim，获得锁。
   - `EEXIST`：其他获取者先赢；释放 reclaim，拒绝。
5. 释放 reclaim 只删除自己 token 的文件。

### 3.4 硬链接不可用时的回退

1. `openSync(LOCK,'wx')`；`EEXIST` 时：
   - 空/不完整 → `E_LOCK_UNINITIALIZED`，不删除。
   - 完整且活 → `E_LOCKED`。
   - 完整且死 → 只允许显式 `--reclaim` 或 `recover` 在持有 `LOCK.reclaim`（`wx`）时清理；默认不自动删除。
2. `wx` 成功后写完整记录 + fsync；在写完前，其他获取者读到空/不完整一律拒绝；若持有者在写前死亡，锁保持“未初始化”，只能人工/显式 reclaim。
3. 文档明确：回退存在“获取者死亡留下未初始化锁”的窗口，但不会双写；首选硬链接无此窗口。

### 3.5 释放与所有权

- 读 LOCK；token 与自身一致才 `unlink`；不一致只记录、不删除。
- 关闭文件描述符；删除自己的 candidate/reclaim 残留；目录 fsync 尝试并记录。
- pid 复用风险：记录 `created` 与 token；不单凭 pid 判断所有权；回收必须 token 一致。

### 3.6 测试

| 场景 | 断言 |
|---|---|
| 初始化竞争 | 空/不完整 LOCK 不被删除；两个获取者只有一个成功 |
| 持有竞争 | 活 pid 完整锁被拒绝；无文件写入 |
| 陈旧回收 | 死亡 pid + token 一致才回收；token 变化即拒绝 |
| 回收竞争 | 两个回收者只有一个成功；输者零写入 |
| 释放 | 只删自己 token；后继锁不被误删 |
| 回退 | 硬链接不可用时 `wx` + 未初始化拒绝；无自动删除 |

## 4. 事务状态表与 pending-acceptance（P02、P05）

### 4.1 持久状态

| 状态 | journal 必填 | CURRENT | 物化树 | release | backup/staging | status 退出 | publish | recover 默认 |
|---|---|---|---|---|---|---|---|---|
| uninitialized | 无 | 无 | 无正式交付 | 无 | 无 | 0 | 允许首次 | 无操作 |
| prepared | txid/rid/new/old/old_current | 旧/无 | 旧/无 | 可存在 | staging/backup 可存在 | 1 | 拒绝 | 回滚（未切换，清理 staging） |
| switching | 同上 | 旧/无 | 可能混合 | 新完整 | backup 完整 | 1 | 拒绝 | 回滚旧树 |
| pending-acceptance | 同上 + state | 旧/无 | 新 | 新完整 | backup 完整 | 1（pending） | 拒绝 | 回滚旧树 |
| accepting | 同上 | 旧或新 | 新 | 新完整 | backup 完整 | 1 | 拒绝 | 回滚旧树，不自动 accept |
| verified | 同上 | 新 | 新 | 新完整 | backup 保留 | 0 | 允许新事务 | 只复核 |
| rolled-back | 同上 + old_current | 旧/无 | 旧/无 | 新（孤立保留） | backup 保留 | 0（旧验证通过） | 允许 | 只复核旧树 |
| rollback-failed | 同上 + rollback.error | 任意 | 混合 | 任意 | 保留 | 3 | 拒绝 | 重试回滚；失败保持 |

不保留 `committed` 状态。`prepared` 内用 `phase=staging|backed-up` 记录进度，状态表不增加“staging”状态。

### 4.2 不变量

- verified：`journal.files.new == CURRENT.files`；物化 = new；release = new；旧版本仍在 backup；`rid == ridOf(new)`。
- rolled-back：CURRENT = `old_current`（或不存在）；物化 = old（按 `journal.files[].old`，旧不存在则文件不存在）；`journal.files.new` 描述失败的新版本但**不等于** CURRENT；release 新版本可保留但未被引用；本次新增文件已移除。
- pending：CURRENT 仍旧；物化 = new；release = new；`journal.files.new != CURRENT.files`；status 1。
- accepting：CURRENT 可能仍旧或已新；journal 未 verified；status 1；recover 回滚，不自动升级。
- prepared：所有 switch 前；物化 = old；status 1；recover 回滚不写旧字节。
- uninitialized：无 `_publish`；status 0；首次 publish 允许。缺少 journal 但 CURRENT 存在 → `E_INCONSISTENT`，status 1。
- 所有入口重新计算 `rid`；任何 journal/索引中的路径必须经批准根与 `abs`。

### 4.3 会话 API

```text
begin(purpose, expected_txid?) -> session{token, lock}
stage(session)                  # 写 staging/release，未切换
switchFiles(session)            # 逐文件 temp+rename
enterPending(session, txid, rid)# 物化新、CURRENT 旧、journal=pending
verifyPending(session,txid,rid) # 字节/release/CURRENT/checker pending
accept(session, txid, rid)      # CURRENT 新 + journal=verified + 复核
undo(session, txid, rid)        # 回滚旧树/旧 CURRENT + 复核
abort(session)                  # 已切换则回滚；未切换清理 staging
```

规则：

1. 所有方法必须携带同一 `session.token`；不匹配零写入。
2. `accept`/`undo` 必须携带期望 `txid/rid`；与 journal 不符只拒绝，不改文件。
3. `noop`（内容已是 verified 且完全一致）不创建 journal/txid；post gate 已前置，失败不得 undo 历史事务。
4. `accept` 的持久点：先 journal=`accepting`（fsync），再 CURRENT temp+rename（fsync），再 journal=`verified`（fsync）；任一步失败→回滚。
5. `recover` 对 pending/accepting 一律回滚；不得因字节吻合自动 accept。只有显式 `accept --resume txid rid` 可继续接受。
6. `status` 在 pending 报 issue 并退出 1；在 verified/rolled-back 且旧/新验证通过时退出 0。
7. 进程崩溃：LOCK 可能残留；下一次 `recover` 用 §3 回收陈旧锁后按状态表处理；候选/暂存文件保留为现场证据。

### 4.4 构建门禁顺序

1. 生成文件到 staging/release；对 **release 目录** 跑 checker `--mode staging`、verifier、parse、control-config、lab。
2. 全通过后 switch；进入 `pending-acceptance`。
3. 对物化树做字节核验 + checker `--mode pending`（允许 CURRENT 旧 + 物化新）。
4. 全通过后 `accept`；再跑一次 checker `--mode verified`/verifier；失败则 `undo(txid,rid)`。
5. `accept` 失败/中断：recover 回滚，不保留未接受的 CURRENT。

## 5. 操作权限与 schema（P03、P07）

### 5.1 事件字段

`write_intent` 必填：`intent_id,op,path,path_kind,rule_ref,src_path,src_rule_ref,map_ref,map_digest,before,decision`。

- `rule_ref`：目的写规则。
- `src_rule_ref`：rename 的源改名/删除授权；copy 的源读授权可为读规则（或 null 表示由 `rule_ref` 同层读覆盖）。
- `map_ref/map_digest`：仅 map-list；绑定批准 map 的 id 与摘要。
- `before`：`{kind,exists,bytes,sha256,mtime_utc,sddl}`；目录 bytes/sha 为 null。

### 5.2 按操作拆表

| op | 目标前置 | 源 | 授权 | after | bytes_written | protect |
|---|---|---|---|---|---|---|
| create | 必须 absent | 无 | 目的 create | 文件 bytes/sha | 最终大小 | 目的不在 protect |
| overwrite | 必须 exists | 无 | 目的 write | bytes/sha | 最终大小 | 同上 |
| append | 必须 exists 文件 | 无 | 目的 write | 最终 bytes/sha | 本次增量；after=before+增量 | 同上 |
| mkdir | 必须 absent 目录 | 无 | 目的 dir-create | dir 状态 | null | 同上 |
| copy (file) | 目的 absent 或 overwrite 合同 | 源 exists 可读 | 源读 + 目的写 | 目的 bytes/sha | 复制字节数 | 源 protect 允许读；目的 protect 检查 |
| copy (dir) | 目的 absent | 源目录可读 | 源读 + 目的写 | `copy_set[]` 每文件 bytes/sha + 聚合 | 逐文件/聚合 | 逐文件 |
| rename | 目的 absent | 源 exists 可读 | 源读 + `src_rule_ref` 改名/删除 + 目的写 | 目的 bytes/sha；源 absent | null（或 0） | 源 protect 的删除/改名必须显式授权；目的 protect |
| delete | 目标 exists | 无 | 目标 delete/写 | absent | null | 目标 protect 不得阻止显式删除 |
| acl | 目标 exists | 无 | 目标 acl | SDDL before/after | null | ACL 元数据例外，需回读 |

补充：

- CreateNew 与 overwrite 不得合并；`create` 目标存在即 `perm.exists`。
- copy 不要求源删除权；rename 必须要求。新增“只读 ORIGINAL copy 成功、同源 rename 拒绝”正负例。
- map-list：`rule_ref` 指向 map-list 规则；`map_ref`/`map_digest` 指向批准 map；validator 从 map 展开精确文件集合，逐文件 intent 的 path 必须在集合内；禁止把 map-list 当任意 subtree。
- denied 读：`rule_ref` 允许 null；`absent` 可引用覆盖规则；`ok` 必须有正确层规则与覆盖。
- `read_batch` entry 必填 `path_kind`；`counts` 四键精确。
- `write_result`：每个 intent 恰好一个 result；ok 必须 durable；非 ok 的 after/bytes 为 null。

## 6. 结果枚举与计数（P04）

| 枚举 | 定义 | 退出码 |
|---|---|---:|
| PASS | 已执行，全部断言成立 | 0 |
| FAILED | 已执行，至少一个断言失败 | 1 |
| BLOCKED | 权限/环境/外部输入阻断，未执行 | 2 |
| NOT_REACHED | 因前置故障未到达 | 3 |
| NOT_RUN | 计划内未开始 | 4 |
| UNVERIFIED | 已执行但无法测量/证据不足；**不用于断言失败** | 5 |

聚合优先级：`FAILED > BLOCKED > NOT_REACHED > NOT_RUN > UNVERIFIED > PASS`。计数按枚举分开；`PASS` 不得包含其它项。既有失败证据不覆盖，新运行另存目录。

## 7. 输入可用性（P06）

| 类别 | 存在性/完整性 | 可消费条件 | 缺失报告 |
|---|---|---|---|
| EXTERNAL_APPROVED | 路径 + 批准 SHA-256 + 授权 | 运行前校验通过 | BLOCKED；不得继续 |
| PREEXISTING | 运行前存在 + 身份/摘要 | 与 M0/基线一致 | BLOCKED 或 NOT_REACHED |
| GENERATED | producer ok 且输出存在/摘要匹配 | 只有 ok producer 的完整输出可消费 | producer 状态 + 缺失列表 |
| PARTIAL_EVIDENCE | producer failed/skipped 可能留下部分文件 | 只能作为证据，不能当完整输入 | 列出文件/哈希/生产状态 |

C17 的 `copies.json` 采用 `optional-missing`：C09 skipped 时 C17 必须输出 `missing_inputs`、`input_state=absent-expected`、`evaluated=false`，不得静默 ok；或者改为要求 C09 ok。finalizer 的 before/after 例外写入 replay 状态机：halt-business 下若 finalizer 将运行，其 B 也必须运行；否则显式记录 `evidence_exemption` 并禁止 A。

## 8. 链、无可信 close 与片段（P07）

- `chain_state`：`complete`（尾为 close）、`truncated-open`（尾为 open）、`corrupt`（seq/hash/字节/摘要不符）。
- `corrupt`：不写权威 seal；生成 `p47-operator-record-v1`（raw chain SHA-256、原因、操作者、时间、证据路径），明确非成功证据。
- `truncated-open`：不补 close、不跑 A；SEAL `open_segments` + `abort.kind=orphan`、`failure_class=fatal`、`trigger=null`；模式按 staged 状态。
- 权威 seal `p47-terminal-seal-v10` 只对 `complete` 链生成；从链重放 `opened/closed/skipped/orphaned`、`abort`、`security_findings`、`open_segments`、index/report 截止点。
- 片段 `p47-fragment-seal-v10`：`authoritative=false`、`mode=fragment`、`excerpt_digest`；独立 validator；不得产生任何终端模式。
- 链外 launch/operator 记录：定义 schema/身份/摘要/证明边界；不能替代链，也不能当成功证据。

## 9. 验收判据（P08）

1. 单缺陷 fixture：先证明基底 PASS；单点变异后期望**精确错误集合**（通常一条）。
2. 复合/端到端：声明 `required_errors` + `allowed_diagnostics`；required 全中、无 allowed 外错误；不强行压成一条。
3. 每场景记录 `requested/reached/observed`、触发 code/trigger、故障现场、txid/rid、恢复结果、最终一致性。
4. `NOT_REACHED` 独立计数，不计 PASS；不可达注入不得写成已覆盖。
5. 每个实验至少有一个能失败的断言，但不得只检查“非零退出”；必须核对触发原因、目标状态、恢复结果。
6. 旧失败证据保留；修复后新运行另存。

## 10. Q01—Q14 与计划映射

| Q | 修订版章节 | 主要产物 | 通过条件 |
|---|---|---|---|
| Q01 | §4、§8（stop→seal）| 新 flow code 注入、stop/seal | 普通 fatal 不 chain-broken；链错误立即停 |
| Q02 | §5 | 稳定 ERR code 表 | C00/C03 全量 class/trigger 正确 |
| Q03 | §7 | 输入可用性表/向量 | C17 每个可达路径有声明 |
| Q04 | §8 | 完整链 seal/fragment | 分区/计数/abort 与链一致 |
| Q05 | §8 | halt 回放 | 任意 security close 激活 halt |
| Q06 | §5 | src_rule_ref/产品 protect | 只读源 copy 通过、rename 拒绝 |
| Q07 | §5 | op schema | map/denied/mkdir/acl/delete/rename 正例 |
| Q08 | §4.3 | pending/undo 身份 | A/B/C 交错只撤期望事务 |
| Q09 | §3 | 硬链接锁 | 初始化/回收/释放竞争无删活锁 |
| Q10 | §4.2 | 状态不变量 | journal/CURRENT/集合双向相等 |
| Q11 | §3.5、§2 | 路径统一 | release/backup 也经 abs |
| Q12 | §9 | 故障快照 | snapshot==afterKill；recovered==A |
| Q13 | §6、§9 | 结果枚举/场景 | requested/reached/observed 齐全 |
| Q14 | §2 | 成员/基线声明 | 纯生成/完整 gate 分开 |

## 11. 实施阶段（未来，需授权）

| 阶段 | 内容 | 退出条件 |
|---|---|---|
| P0 | 冻结 V9、建立 V10/baseline 清单 | 哈希记录 |
| P1 | 锁/事务状态/pending 会话 | 静态 + 隔离实验设计 |
| P2 | 操作 schema/权限/输入可用性 | 正负例 |
| P3 | 链/seal/fragment/结果口径 | 新向量与复合场景 |
| P4 | 发布/恢复/证据 | 逐场景 requested/reached/observed |
| P5 | V10 全量生成/独立 checker/verifier/manifest | 两次生成一致；历史不变 |
| P6 | 交付与停止 | 统计、未决、下一轮审查 |

本轮只写计划，不进入 P0—P6。

## 12. 未执行声明

未修改 V9/V8/V7；未运行 V9 工具、附件脚本、发布器、恢复器、lab；未执行 C00—C20、Phase 0、浏览器/L1；未创建 `D:\P47RUN`/`D:\P47TOOLS`；未改 ACL。
