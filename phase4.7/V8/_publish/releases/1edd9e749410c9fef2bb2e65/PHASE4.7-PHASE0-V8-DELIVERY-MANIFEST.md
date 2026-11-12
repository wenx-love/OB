# OB-Recover Phase 4.7：Phase 0 V8 交付清单

日期：2026-11-11。基准目录：`C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V8\`

本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布，并由 `_publish\CURRENT.json` 绑定。

## 1. 契约文件（12 份）

| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V8.md` | 34096 | 426 | `f189d4e3ca51965cc2f933430f5b67684c214be0b3994f8e171b53e12c4ac48b` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv` | 231068 | 59 | `eb0230c085a23ff34209b02161b56ffa22c9b4ced61996c390b63bdb40a1ecc5` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json` | 1356648 | 38155 | `edca94ff7b8b45794dcaac8fd316f147e06c2cdb655a8d6eabdd63ccad586c47` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md` | 29781 | 510 | `b70004a7a2f9cc7f3cccea12062a296e12edfb42e80012d7c5c21d563bcd260c` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json` | 107767 | 1 | `5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa` |
| `PHASE4.7-PHASE0-V8-FAILURE-MODEL.md` | 4081 | 78 | `dfd4e8778727395f65da06965f65a6747fed0edaccd49f0b65d71d920e208bb2` |
| `PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md` | 4190 | 71 | `7cd0d9a72a7dd642e0e6844a2b167b741f3556b21af1de0a9d32d0555bd23dfd` |
| `PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md` | 4280 | 66 | `7493f927c6adfe341faf804a96461a3f4ae5a16a2486d3c30a343d466fc80d3b` |
| `PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md` | 3780 | 34 | `bb0566706eab350c48b493e19567740dbb5edaa6b78982472d5a5b352502ab87` |
| `PHASE4.7-PHASE0-V8-OPEN-ISSUES.md` | 3286 | 54 | `a7ed266b0b0581fd9cb222cbf4dc948e76f0659de9d2d3443169fa21a05197ca` |
| `PHASE4.7-PHASE0-V8-SELF-CHECK.md` | 3125 | 47 | `0c17a2ee58f32aa9f133bf6619ad1a9927bb3af77e3997d278489bb9bf2533b6` |
| `PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md` | 2334 | 39 | `e4785d4d2851feb9604d88985f8ce547909f42b0733bcf16b67f248b8230b48c` |

## 2. 生成与检查工具（13 份）

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `p0v8-lib.cjs` | 7830 | 166 | `0b5c606a2534494acd2989a14ecde546050afc73df555d00ade531d61596d58c` |
| `p0v8-spec.cjs` | 50469 | 697 | `10481537da1148b0dbe9b54a14068e59e60a79f2271924edb1fcf1e48cbead10` |
| `p0v8-flow.cjs` | 8196 | 190 | `d05cda5ed5da3971e533f710f9af580fa475047308a328a8dded3086a0765b68` |
| `p0v8-audit.cjs` | 40155 | 533 | `5f43707271faa2c5dc823cb320e007fb009126171f438b5c1891426d812dbe4e` |
| `p0v8-build.cjs` | 53304 | 786 | `64d74d892e12ee622837b9e406f426b662091407a2a4bdce5c5fa8d451a3d030` |
| `p0v8-publish.cjs` | 14784 | 341 | `f6e43e26c96d02e39286db24d51030cb02496c818fdce63839a315e9a171d95a` |
| `p0v8-check.cjs` | 49366 | 834 | `b77591df895c1f742426ad5a7946f0410b74fc033d99d617ae0389cb48362296` |
| `p0v8-verify.ps1` | 6452 | 106 | `bd34bab8332d59cc1d9ebd258fe0d9fadc9eeb7b371666d20db179c7d3354d21` |
| `p0v8-parse-inline.ps1` | 1329 | 25 | `d63dcbbb60103c3247052558d0791e9690574437dec410a1adf71851a8228c3d` |
| `p0v8-hygiene.cjs` | 4006 | 56 | `1b71cc21f90a4d07274c557e62488b1b747f138c9a3dff29c61c65bb361fdcb1` |
| `p0v8-controlconfig-check.cjs` | 1002 | 20 | `c4cacf47f3e281f717dd58a269a97b90fe446d1ae3463e82cd8b9c59fb863673` |
| `p0v8-lab.cjs` | 4877 | 120 | `9b25144450867c8531fa49f1b0362701801b913780aaf4212e45c76229a8ae11` |
| `p0v8-manifest.cjs` | 5453 | 123 | `fb06ac87c2970997264fecb4637434f8b8c7ccfb66295bb2d8650b310a833cc3` |

## 3. 复现

```text
node p0v8-build.cjs                 # generate, gate, publish through the journaled transaction
node p0v8-check.cjs --dir .         # independent checker (no import of the generator)
powershell -NoProfile -ExecutionPolicy Bypass -File p0v8-verify.ps1 -Dir .
powershell -NoProfile -ExecutionPolicy Bypass -File p0v8-parse-inline.ps1 -Dir .
node p0v8-hygiene.cjs ..            # historical immutability (V7 and earlier)
node p0v8-controlconfig-check.cjs
node p0v8-lab.cjs                   # publish fault lab (isolated scratch only)
node p0v8-publish.cjs status .      # pointer/release consistency
node p0v8-publish.cjs recover .     # repair an interrupted transaction
node p0v8-manifest.cjs .            # regenerate this manifest in place
```

`p0v8-build.cjs` 先在内存生成并自检，再写入 staging，运行独立检查器与 PowerShell 验证；只有两者退出 0 才提交。提交点是 `_publish\CURRENT.json`；发布协议见 `PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md`。

## 4. 未交付（外部输入）

| 项 | 原因 |
|---|---|
| `D:\P47TOOLS\p47-phase0-v8` 发布包（20 payload） | 未提供 |
| `RELEASE-MANIFEST.json` 批准 SHA-256 | 未提供 |
| 管理员 SID 用户确认 | 未完成 |
| `P0_CODEX_ACCOUNT` | 未指定 |
| SECOND_ARCHIVE 绑定 | 未完成 |
| dispatcher/verifier/audit/guard/业务工具源码 | 全部缺失，见 `PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md` |
| 动态验证（真实 writer/guard/ACL/FD/故障注入/封存恢复） | 未运行 |

## 5. 未创建、未修改

未创建 `D:\P47RUN`、`D:\P47TOOLS`；未改 ACL、产品源码、配置、测试、`dist`；V4—V7 与历史报告哈希不变。

## 6. 当前发布指针

`_publish\CURRENT.json` 的 `rid`、`files[]` 与上表逐项相等；`node p0v8-publish.cjs status .` 必须报告无 issue。
