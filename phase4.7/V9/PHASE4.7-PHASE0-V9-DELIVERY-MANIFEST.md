# OB-Recover Phase 4.7：Phase 0 V9 交付清单

日期：2026-11-11。基准目录：`C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\`

本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布，并由 `_publish\CURRENT.json` 绑定。

## 1. 契约文件（13 份）

| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `PHASE4.7-PHASE0-START-CONDITIONS-V9.md` | 34522 | 433 | `b6d68a231dd7ad60d28de83faf6ef444881002b20e0acff6c2e382662432fdfc` |
| `PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V9.tsv` | 233543 | 59 | `ddd1e613e17d6879aa250fcad8466eff3c4135f16bb7d965541ceb8727bc29eb` |
| `PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json` | 1409466 | 39440 | `8bbf8b945f66e3b21d27cd4fbc57240f6d276a3aa0ff1b9228b6c73392ca8607` |
| `PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md` | 31667 | 519 | `5d1260cb7c5f56bb16dcdb1c4e3b577915e8daa7be24e13a91e86886311bf1f0` |
| `PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json` | 121927 | 1 | `543580989c30ef770409c48f8fd698c2879febc8fb026dda8f2ca2b9ba725041` |
| `PHASE4.7-PHASE0-V9-FAILURE-MODEL.md` | 5141 | 83 | `2a0c19a87ecd2f70d8a59b044b3fff6a85e668799e4ccd6d7e42614907ad49f0` |
| `PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md` | 5576 | 81 | `885373825de38fc3bda3a4a05eb582953b87fa0f398b71a4c3a41ed9cd0cd9c9` |
| `PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md` | 3700 | 54 | `d48dbdd7bef32dacdeb0776d57c06fe0b6b886885d64e9e7ca68808ded52435b` |
| `PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md` | 3125 | 36 | `78e292beef2e39f69591e6c2f61173bbaff84ef3f630a721078e6edbc41e5bb1` |
| `PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md` | 9190 | 36 | `65284e63ddbfcd81256071fd56fbe485b168b72af567d5f0ec0a9275ac10be6e` |
| `PHASE4.7-PHASE0-V9-OPEN-ISSUES.md` | 3397 | 55 | `672b8afd74ac44220bad8dd1aea8bf2cfd9ab27775cb62afff3c9f554b3d9715` |
| `PHASE4.7-PHASE0-V9-SELF-CHECK.md` | 4025 | 53 | `c5a482f6dc7d170189d62614d9a22f4fbb9ced1116e27933e824b8cbaa304810` |
| `PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md` | 2431 | 40 | `67447cdbe580bc9058d7422da427db7f5db47359457a627b883e4e00554d3b1e` |

## 2. 生成与检查工具（13 份）

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `p0v9-lib.cjs` | 7830 | 166 | `7746993bf960456b27b3aa8ecfc7cec663d2403268dfe5f0321ecce17a00e654` |
| `p0v9-spec.cjs` | 53609 | 746 | `c8dc8f323d61a0a1bf9bc42669a9212a2810600eceb6d37994d29f4a0713639d` |
| `p0v9-flow.cjs` | 9962 | 232 | `3fc55bdd6c558c4bed5c9a53f5d5f6869c8342a185b4ef48abe57411104a3a3a` |
| `p0v9-audit.cjs` | 41769 | 555 | `867c0eaed9341423a24397921c56be6377dd5059de62631ddf75b846f89db527` |
| `p0v9-build.cjs` | 56511 | 837 | `c02cb07f508b16d04a847eafb324c65ff7cad81dc2c521764a60f8c33f923c20` |
| `p0v9-publish.cjs` | 19834 | 436 | `3799fecc5b784d02bf8e2d77d42282915624a0f44885d51eb7b9fd78455e264c` |
| `p0v9-check.cjs` | 60331 | 1006 | `973e38fecfd830cbd57e2125ea890088bdfd8b11ca2ea7a84fa43315f7122641` |
| `p0v9-verify.ps1` | 6452 | 106 | `091ed69c6d6a508ae4858991739bcb707c540ea8b595be4a0cbb5f0ea3cae7dc` |
| `p0v9-parse-inline.ps1` | 1329 | 25 | `3c5aa68933d9de98b5842d8a2ea66ab9ecd247d4fa0b5b134ac398dea3fa5eaf` |
| `p0v9-hygiene.cjs` | 6979 | 90 | `6c4819d194798fcf4c072937a23bc8a780397782a2bed1939ed341269a0d3827` |
| `p0v9-controlconfig-check.cjs` | 1002 | 20 | `c4cacf47f3e281f717dd58a269a97b90fe446d1ae3463e82cd8b9c59fb863673` |
| `p0v9-lab.cjs` | 9971 | 210 | `354af10dc234b818e5b7ec274d7aea5dda42decf6bdde5575090855607b42774` |
| `p0v9-manifest.cjs` | 6386 | 145 | `21543f89c34e8612ee27ef4e99df4956ee2f255a89f89bb1549088860f1013cb` |

## 3. 生成输入（10 份）

| 文件 | 字节 | 行数 | SHA-256 |
|---|---:|---:|---|
| `doc-src/PHASE4.7-PHASE0-START-CONDITIONS-V9.md` | 12484 | 143 | `0160004babd7fa820c9f35f10e42ce9d3a75cbbe49aa4380a9d9ed3c3f8bfdb3` |
| `doc-src/PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md` | 3700 | 54 | `d48dbdd7bef32dacdeb0776d57c06fe0b6b886885d64e9e7ca68808ded52435b` |
| `doc-src/PHASE4.7-PHASE0-V9-FAILURE-MODEL.md` | 5141 | 83 | `2a0c19a87ecd2f70d8a59b044b3fff6a85e668799e4ccd6d7e42614907ad49f0` |
| `doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md` | 3125 | 36 | `78e292beef2e39f69591e6c2f61173bbaff84ef3f630a721078e6edbc41e5bb1` |
| `doc-src/PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md` | 9190 | 36 | `65284e63ddbfcd81256071fd56fbe485b168b72af567d5f0ec0a9275ac10be6e` |
| `doc-src/PHASE4.7-PHASE0-V9-OPEN-ISSUES.md` | 3397 | 55 | `672b8afd74ac44220bad8dd1aea8bf2cfd9ab27775cb62afff3c9f554b3d9715` |
| `doc-src/PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md` | 5576 | 81 | `885373825de38fc3bda3a4a05eb582953b87fa0f398b71a4c3a41ed9cd0cd9c9` |
| `doc-src/PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md` | 2431 | 40 | `67447cdbe580bc9058d7422da427db7f5db47359457a627b883e4e00554d3b1e` |
| `doc-src/PHASE4.7-PHASE0-V9-SELF-CHECK.md` | 3961 | 53 | `09e0ac559fd03afe68c813eb998e5f4ef0bea4320b15412f1222b2dd0d0a6df5` |
| `doc-src/PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md` | 9253 | 99 | `90f92835230fc60815d5a8a3095665d1fb9e3378c8038481c709df0b9de473b9` |

这些模板是生成器 `p0v9-build.cjs` 的输入；它们与工具一起进入不可变 release，因此仅凭正式交付包即可复现。

## 4. 复现

```text
node p0v9-build.cjs                 # generate, gate, publish through the journaled transaction
node p0v9-check.cjs --dir .         # independent checker (no import of the generator)
powershell -NoProfile -ExecutionPolicy Bypass -File p0v9-verify.ps1 -Dir .
powershell -NoProfile -ExecutionPolicy Bypass -File p0v9-parse-inline.ps1 -Dir .
node p0v9-hygiene.cjs ..            # historical immutability (V7 and earlier)
node p0v9-controlconfig-check.cjs
node p0v9-lab.cjs                   # publish fault lab (isolated scratch only)
node p0v9-publish.cjs status .      # pointer/release consistency
node p0v9-publish.cjs recover .     # repair an interrupted transaction
node p0v9-manifest.cjs .            # regenerate this manifest in place
```

`p0v9-build.cjs` 先在内存生成并自检，再写入 staging，运行独立检查器与 PowerShell 验证；只有两者退出 0 才提交。提交点是 `_publish\CURRENT.json`；发布协议见 `PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md`。

## 5. 未交付（外部输入）

| 项 | 原因 |
|---|---|
| `D:\P47TOOLS\p47-phase0-v9` 发布包（20 payload） | 未提供 |
| `RELEASE-MANIFEST.json` 批准 SHA-256 | 未提供 |
| 管理员 SID 用户确认 | 未完成 |
| `P0_CODEX_ACCOUNT` | 未指定 |
| SECOND_ARCHIVE 绑定 | 未完成 |
| dispatcher/verifier/audit/guard/业务工具源码 | 全部缺失，见 `PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md` |
| 动态验证（真实 writer/guard/ACL/FD/故障注入/封存恢复） | 未运行 |

## 6. 未创建、未修改

未创建 `D:\P47RUN`、`D:\P47TOOLS`；未改 ACL、产品源码、配置、测试、`dist`；V4—V7 与历史报告哈希不变。

## 7. 当前发布指针

`_publish\CURRENT.json` 的 `rid`、`files[]` 与上表逐项相等；`node p0v9-publish.cjs status .` 必须报告无 issue。
