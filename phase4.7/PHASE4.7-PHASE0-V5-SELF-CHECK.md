# OB-Recover Phase 4.7：Phase 0 V5 自检报告

日期：2026-11-11。性质：交付前的机械自检记录。不是独立复核，不是 Phase 0 执行结果，不把任何动态项写成 PASS。

## 1. 自检对象

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V5.md` | 65026 | 547 | `3d5e51bc1af7829d26c1de6266cc7706091807189f5eea7befa994a2d118fdcd` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md` | 24322 | 442 | `fa6fecbacfe9142f9b2f7ac0d05aea6cdf25b89b275ae7c60edc3ba9ac323220` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json` | 549852 | 16207 | `078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv` | 130063 | 58 | `1b7ac41018ed4a4345a0122cc74576c56d6f6c128b91e430b9b184e98618fb95` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json` | 7981 | 1 | `dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042` |

## 2. 已实际执行的检查

| # | 检查 | 方法 | 结果 |
|---|---|---|---|
| 1 | 生成器/检查器语法 | `node --check` 对 `p0v5-lib/spec/audit/build/check.cjs` | 5/5 无语法错误 |
| 2 | 生成幂等 | 重跑 `p0v5-build.cjs`，比较输出字节与哈希 | 注册表、TSV、向量字节稳定 |
| 3 | 结构一致性 | `p0v5-check.cjs` | **158 项，0 失败** |
| 4 | 独立复算（PowerShell） | `p0v5-verify.ps1` 独立实现规范化与 SHA-256 | **47 项，0 失败** |
| 5 | 内联脚本语法 | `p0v5-parse-inline.ps1`（`Parser::ParseInput`，**只解析不执行**） | C00 3224 字符/813 token，探针 2244 字符/556 token，0 错误 |
| 6 | 字节卫生 | `p0v5-hygiene.cjs` | 5 个交付文件均无 BOM、无 CRLF |
| 7 | 输入未被修改 | 同上，比对 V4 七份与第七轮报告 | 8/8 哈希不变 |
| 8 | 控制配置模板 | 独立重算 8 行 LF 无末尾 LF | 325 字节，SHA-256 `18a06117…d80003` 与注册表一致 |

## 3. 关键契约断言（机械可证部分）

| 项 | 断言 | 结果 |
|---|---|---|
| 命令/执行 | 21 个命令 ID，57 次执行，`plan_order` 1..57 | 通过 |
| 链规模 | 53 参与者；107 条记录（C18 绑定）/101 条（未绑定） | 通过 |
| 文件划分 | 20 payload；16 staged；4 bootstrap；manifest 不 staged | 通过 |
| Q01 | C05-FINAL 用 source dispatcher；C06 首次用 staged；C04 不回读 staged；C00 读 3 个关键工具 | 通过 |
| Q01 | 工具哈希全部 `null` 且标注来源 manifest，无代填 | 通过 |
| Q02 | 观察者登记为执行（observe 工具 + 900 s + stdin）；探针 codex-inline 且零写 | 通过 |
| Q03 | participant 全部有链头 `file-append`；无业务层链头读写；未放宽 `OUT`/`AUDIT` | 通过 |
| Q04 | `intent_id = event_id`；result 引用 intent；summary 无自哈希；链记录三类 | 通过 |
| Q05 | `copies.json` 内容读（C11/C15）；`m0.json` 读（C18）；C19/C20 读 tools/audit；C05-FINAL 可写 TMP；C14 仅 map-listed | 通过 |
| Q06 | 15 个目标各 1 次 before/after；M0/M1 各一次；C20 拆分；SEAL 最后且不追加链 | 通过 |
| Q07 | C18 三连条件组；`ENV:P0_SECOND_ARCHIVE`；未绑定 `disabled-unbound`；绑定字段 `c18_binding_sha256`/`c18_destination` 已定义 | 通过 |
| Q05 | C14 以 `map-list` 表示，且 runner 必须先展开映射为精确文件，不构成子树许可 | 通过 |
| 白名单 | 57 行 × 26 列；行序与注册表一致；argv 哈希逐行一致；`entry_sha256` 列非内联行为 `manifest-bound` | 通过 |
| 占位符 | 5 个交付文件无 `${`、`TODO`、`TBD`、`FIXME` 等 | 通过 |
| 审计向量 | 15 条向量哈希逐条复算；3 条链记录 `prev` 链接正确；12 类非法输入全部被拒 | 通过 |

## 4. 明确未执行

- 未执行 C00—C20；未创建 `D:\P47RUN`、`D:\P47TOOLS`；未改 ACL。
- 未运行 Vitest、`tsc`、Vite build、浏览器、L1。
- 未实现或运行 `p0-dispatch.ps1`、`p0-verify-release.ps1`、`p0-audit.cjs`、`fs-guard.cjs`、任何一个业务工具。
- 未获取发布包与批准 manifest 哈希；未确认管理员 SID；未指定 Codex 账户；未绑定 SECOND_ARCHIVE。
- 未做真实 fork、真实 ACL 读回、真实守卫拒读/拒写、真实链头并发测试。

## 5. 全部动态项状态

UNVERIFIED：ACL 继承关闭与 ACE 读回、Codex 有效访问、三副本物理独立、链接/重解析、Vitest fork 预载继承、原生/FD/子进程边界、PowerShell 自报告事件真实性、独占打开与 flush、审计规模与写入频次、ORIGINAL 的 ADS/USN 覆盖、C03 relay 来源。

不得以第 2 节机械检查的通过替代上述任一项。

## 6. 已知残余风险（供第八轮直接攻击）

1. **观察者 relay**：C03 的转交行无法从 OS 层证明由 Codex 进程产生；已披露，仍需评审是否可接受。
2. **PowerShell 工具自报告**：C01—C04 的事件由工具自身的 Node event-writer 提交，非 OS 强制；仅靠 C05-FINAL/C19 的独立证据交叉校验。
3. **dispatcher 编译期哈希表**：注册表要求 dispatcher 内置 57 条 argv 哈希与工具哈希要求，但工具实现尚未提供，无法验证其确实执行。
4. **C07 before/after 成本**：15 个目标 × 2 次全量 ORIGINAL 扫描（+M0/M1），32 次读全树；规模与耗时未测，可能触发性能/时间限制。
5. **注册表体积**：551614 字节，低于 PowerShell `ConvertFrom-Json` 的已知风险区间，但已在 1.9 MB 处设硬上限。
6. **C18 未绑定时的链序号**：记录数从 107 降到 101；C19/C20 的报告必须按实际链尾计算，不得硬编码 107。
7. **C20-SEAL 不包裹**：该执行不受 C07 before/after 包裹；其对 ORIGINAL 的“零接触”只能由自身不读取与 ACL 只读共同保证，未独立取证。

## 7. 结论

- 契约层：Q01—Q07 在文档、注册表、白名单、审计规范之间已由同一生成器统一，机械检查通过。
- 实现层：全部 UNVERIFIED。
- 本自检不构成批准；是否可进入实际启动，仍取决于第八轮独立复核与用户外部输入（A1—A7）。
