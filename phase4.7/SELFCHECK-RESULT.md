# 本轮核对结果

对象：`D:\Projects\ob-recover`。本文件由 `gen-selfcheck-md.cjs` 根据 `selfcheck-result.json` 和 `postcheck.json` 生成，生成时间 2026-11-11 12:56:36。生成本文件的脚本只读写报告目录，不接触原项目。

**结论：** 下面四项比对和最后一次确认里，差异数全部是 0。在各项比对各自的范围内、各自的起点和终点之间，原项目的文件集合、内容、大小、修改时间、创建时间、变更时间、USN、文件 ID 都没有变化。各项比对的起点不同，覆盖不到的地方写在第三节。

**声明：** 本轮没有修改项目文件，没有运行 Vitest、`tsc`、Vite 构建，没有启动浏览器，没有运行 L1，没有访问任何网站，没有执行阶段零。这条声明来自我对本轮操作的记录，不是由下面的数字推出来的；与它相符的读数列在第一节末尾。

## 一、四项比对

| 比对内容 | 范围 | 起点 | 终点 | 结果 |
|---|---|---|---|---|
| 大小、修改时间、创建时间、SHA-256（PowerShell 实现） | 项目内 518 个文件（不含 `node_modules`） | `selfcheck-before.tsv`（本轮对项目的第一个操作） | `selfcheck-after.tsv`（518 个文件） | 新增 0，删除 0，有变化的行 0；两份清单文件的哈希相同 |
| 逐文件 USN 和文件 ID | 519 个文件（项目内 518 个，加 Vitest 的结果缓存 1 个） | `usn-snapshot-1.tsv` | `usn-snapshot-2.tsv` | 不同的 0 个，缺失 0 个 |
| 创建时间、修改时间、变更时间、属性、文件 ID、链接数、大小 | 项目内 604 项（518 个文件加 86 个目录，含项目根） | `meta-scan-2.tsv` | `meta-scan-3.tsv`（604 项） | 不同的 0 项 |
| 大小、SHA-256（Node 实现） | 全树 2011 个文件，含 `node_modules` | `MANIFEST-plan-node-full.tsv` | `MANIFEST-after-node-full.tsv`（2011 个文件） | 不同的行 0；两份清单逐字节相同 |

终点的四份数据由 `final-selfcheck.ps1` 在 2026-11-11 12:24:20 至 2026-11-11 12:24:36 之间取得。起点文件的生成时间：`selfcheck-before.tsv` 2026-11-11 10:06:46，`usn-snapshot-1.tsv` 2026-11-11 10:34:36，`meta-scan-2.tsv` 2026-11-11 11:09:39，`MANIFEST-plan-node-full.tsv` 2026-11-11 11:36:13。

补充读数：

- 项目内 USN 最大的文件是 `docs/PHASE4.7-PANEL-PERFORMANCE-FIX.md`（`0x10e1d6620`），它是上一轮最后写入的文件。USN 达到或超过本轮开始时日志位置 `0x10e318b10` 的文件数是 0。
- 项目内最晚的变更时间是 2026-11-10 23:42:21（`docs`），最新修改的文件是 `docs/PHASE4.7-PANEL-PERFORMANCE-FIX.md @ 2026-11-10 23:42:21`。两者都早于本轮。
- 两套哈希实现的交叉校验（本轮结束时 Node 算出的哈希，对本轮开始时 PowerShell 算出的清单）：`cross-check Node crypto vs PowerShell Get-FileHash on project files: shaMismatch=0 sizeMismatch=0 missingInPowerShell=0 missingInNode=0`。
- 元数据辅助程序的自检：`helper self-check: sizeof(BY_HANDLE_FILE_INFORMATION) = 52 (must be 52)`；`cross-check against Get-Item: size mismatches=0 ; last-write mismatches=0`。
- 变更日志：`Usn Journal ID : 0x01db32a6f22e1aa4`；`Next Usn : 0x000000010e6d1d80`。日志 ID 与本轮开始时相同。日志位置在本轮期间前进了，说明 D 盘上有文件活动；被检查的 519 个文件的 USN 都没有变，所以不是它们。`node_modules` 的其余文件没有逐个查 USN（见第三节）。报告目录在 C 盘，不计入这个日志。

与声明相符的读数：

- `node_modules/.vite-temp` 的修改时间仍是 2026-11-10 22:50:26，目录下有 0 个条目。
- `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json` 的修改时间仍是 2026-11-10 22:51:00。
- 上面两个位置是 Vitest 和 Vite 每次运行都会写的地方，时间停在上一轮最后一次 Vitest。完整 `dist` 的 17 个文件包含在第二、三、四项比对里，内容、USN、变更时间都没有变。
- 本轮结束时的进程：Chrome 0 个；命令行里带 Vitest、Vite 构建、`tsc` 或 `p47-*` 脚本的 Node 进程 0 个；此前各轮用过的调试端口和本机服务端口上的监听 0 个。

## 二、报告定稿之后的最后一次确认

四项比对之后，本轮还修订过报告文字并重新拼装，这些操作只写报告目录。在那之后、生成本文件之前，又做了一次只读属性的确认，不读文件内容。读取时间 2026-11-11 12:55:03。

- 项目内 518 个文件的大小、修改时间、创建时间，与 `selfcheck-before.tsv`（518 个文件）比对：文件数相同，新增 0，删除 0，这三项有变化的文件 0 个。
- 整棵树 2328 项（文件和目录，含 `node_modules`）的变更时间：读不到的 0 项；落在 2026-11-11 当天的 0 项。
- 项目内（604 项）最晚的变更时间是 2026-11-10 23:42:21（`docs`）；`node_modules` 内（1724 项）最晚是 2026-11-10 22:51:00（`node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`）。
- 按变更时间看，2026-11-11 当天整棵树没有任何一项被改动过。这一天包括本轮，也包括上午更早的那一轮只读调查。这个指标的盲点见第三节。

## 三、这种核对方法的限制

- **最后访问时间没有比对。** 核对本身要读每个文件，读取可能更新它。
- **`node_modules` 的文件没有逐个比对 USN。** 它的内容做了前后比对，变更时间在最后一次确认里整体查过。
- **变更时间有一个已知的盲点。** 用系统的文件复制去覆盖一个内容相同的文件时，目标文件的变更时间可能跟着源文件走，看不出被重写过（方案 2.2，状态是 suspected）。项目内的文件由 USN 比对覆盖了这种情况。`node_modules` 内没有这层覆盖，只能说本轮没有做过往项目里复制文件的操作，这是声明，不是证据。
- **安全描述符只扫描过一次，没有做前后比对。** 权限变化会更新变更时间，所以由变更时间间接覆盖。
- **USN 和元数据的起点晚于本轮的第一个操作。** 这段空档由两点覆盖：内容清单的起点就是本轮的第一个操作；整棵树没有任何一项的变更时间落在今天。
- **内容比对看不出“改了又改回”。** 这种情况会留下 USN 和变更时间的变化，由第二、三项比对和最后一次确认覆盖。
- **“创建后又删除”的文件只能间接发现。** 它会改变所在目录的修改时间和变更时间，最后一次确认查了整棵树的全部目录。直接证据需要管理员权限读取变更日志，本轮没有。
- **报告目录自身可以被别人修改。** 它所在的 TEMP 目录给了 Codex 沙箱组“修改”权限（方案 2.9），本文件、清单文件和方案文件都在这个目录里。它们是否被改过，以交付回复里给出的 SHA-256 为准。
- **这是我用自己的工具核对自己的操作。** 清单文件都保留在报告目录里，用户或 Codex 可以用自己的方法独立复算。

## 四、三份交付文件

| 文件 | 字节数 | 修改时间 | SHA-256 |
|---|---|---|---|
| `PHASE4.7-WORKER-REMEDIATION-PLAN.rebuilt.md`（重新整理补全版） | 205674 | 2026-11-11 12:54:15 | `c44456df670656f2c0c94487f61974f7cc5e872a58c85696092c1c5d9617f2e5` |
| `PHASE4.7-WORKER-REMEDIATION-PLAN.original-recovered.md`（恢复的原文） | 30512 | 2026-11-11 10:37:21 | `22c284f145f1f21bd74d06a7ba5b4b220dc466c44ef4f1f088f1625bea2f09a7` |
| `SELFCHECK-RESULT.md`（本文件） | — | — | 文件不能包含自己的哈希，写在交付回复里 |

## 五、报告目录内全部文件的哈希

不含本文件。`selfcheck-result.json` 里的 `deliverables` 一段是四项比对当时记下的哈希，之后报告文字还修订过，以下表为准。

| 文件 | 字节数 | 修改时间 | SHA-256 |
|---|---|---|---|
| `ANNEX-script-write-paths.tsv` | 25032 | 2026-11-11 11:00:34 | `a03057af1735ce3cfc02092eb50facbc7d6880c8ebb14c3b388ee084ddef8985` |
| `MANIFEST-after-node-full.tsv` | 234972 | 2026-11-11 12:24:35 | `9a3d0e928c2d99d095afcb5bd898b531971e530b79cab59b1890deed886433a6` |
| `MANIFEST-plan-node-full.tsv` | 234972 | 2026-11-11 11:36:13 | `9a3d0e928c2d99d095afcb5bd898b531971e530b79cab59b1890deed886433a6` |
| `PHASE4.7-WORKER-REMEDIATION-PLAN.original-recovered.md` | 30512 | 2026-11-11 10:37:21 | `22c284f145f1f21bd74d06a7ba5b4b220dc466c44ef4f1f088f1625bea2f09a7` |
| `PHASE4.7-WORKER-REMEDIATION-PLAN.rebuilt.md` | 205674 | 2026-11-11 12:54:15 | `c44456df670656f2c0c94487f61974f7cc5e872a58c85696092c1c5d9617f2e5` |
| `assemble.cjs` | 5687 | 2026-11-11 12:19:49 | `8cfdb5685e9239c22312a2aa897a9dd39414cac630eff458cbd22a07f3bf6d27` |
| `backup-compare.tsv` | 4536 | 2026-11-11 11:40:44 | `fa15c06f814f18ac651ed1664a892e981a0b13966c7f2b7fe888ee29bcdfb454` |
| `backup-dist-before-manifest.tsv` | 1380 | 2026-11-11 12:46:25 | `4d15888dfcd2ce12b7c4d62391abe1ff134e2ff78e9193a1f8e00f127adae442` |
| `compare-backups.cjs` | 3577 | 2026-11-11 11:40:12 | `4ea7f72a5a9902d34534cf8bee772c41e9e4fe65fd2358037a439e5c2c7bc813` |
| `final-selfcheck.ps1` | 9282 | 2026-11-11 12:22:44 | `28156d06324d67154d9aac908c4985d559fc0e099933606b24c9a6010521a07e` |
| `gen-appendix.cjs` | 15020 | 2026-11-11 12:11:33 | `a41ebb47e026a46c784afd66233edcde93f2e666211f1eac4d351867b9f8a590` |
| `gen-selfcheck-md.cjs` | 13279 | 2026-11-11 12:56:36 | `241c20e3ee601df79f002fd0bf62e549c346fedf05398659b9f1b02e13c1aa88` |
| `meta-scan-1.tsv` | 73980 | 2026-11-11 10:49:57 | `523e22ed3e0e50e855ab21524dd78d89f94a32c2da72865dfd84bdb0389c75ea` |
| `meta-scan-2.tsv` | 82389 | 2026-11-11 11:09:39 | `98e9317c7010aba74f2d5dda28dcd686edf9d519cdb07ae70aedb398f09306b7` |
| `meta-scan-3.tsv` | 82389 | 2026-11-11 12:24:34 | `98e9317c7010aba74f2d5dda28dcd686edf9d519cdb07ae70aedb398f09306b7` |
| `oc-export.cjs` | 1602 | 2026-11-11 10:37:21 | `1b929c544224a78ef023d3f024fdd401d58dabcf0caea9f4d8b5bcba055627a7` |
| `oc-find.cjs` | 1251 | 2026-11-11 10:34:15 | `d6ee44b50985f545fdb9df305549b3f3ce22f844bcf8941c8ebf56701a9f7417` |
| `oc-inspect.cjs` | 1797 | 2026-11-11 10:36:18 | `81810af1a51fd076e4a4b1dbffb64511fabbe1e7bfe266c9ddfa92d9de3b6fa6` |
| `oc-schema.cjs` | 952 | 2026-11-11 10:25:39 | `8f7c1e62ca8c80065d2e20d1122cb34f701c91a2d17bff5e32efa1c85b0018aa` |
| `part-1.md` | 28779 | 2026-11-11 12:53:53 | `973b3efa0da563aa58e75e1737c7fc8e1e17edba7b5b703f513f6e1825660dda` |
| `part-2.md` | 34696 | 2026-11-11 12:54:14 | `5355ded4f47e9e8b9cf793570d3976a82c05d51a2f70e4f4fad1d90b3848b710` |
| `part-3.md` | 42705 | 2026-11-11 12:47:08 | `951e2467fa3c9c9a5cd8097ab3b256e2679e9fef54892d9fbd49479c52895127` |
| `part-4.md` | 27926 | 2026-11-11 12:53:53 | `15e9ff53e0cb2e62954f7b9862e2d5357d960c9d3e9c4c53b0d2f27856f1ce31` |
| `part-appendix-b.md` | 27759 | 2026-11-11 11:36:13 | `04d3e1918ba87a39ade17887275c3b05797ddb7d85ed8e30140149f5338246f6` |
| `part-appendix-c.md` | 12651 | 2026-11-11 12:11:03 | `4285dd886041d643327ce869f9fa5f35d30b2c4505b5c1e19b220e0f3eb2f9d3` |
| `postcheck.json` | 657 | 2026-11-11 12:55:04 | `adb1b30561ab80fa8cec64c459029554fd1b0850c76e8a275b63c891ba112dfb` |
| `postcheck.ps1` | 4119 | 2026-11-11 12:36:13 | `4c301bc113d0e019f5b2f6e6aaf33f31a5e0b06077124b078c5c6e61c4fd775c` |
| `scan-meta-2.ps1` | 6279 | 2026-11-11 11:09:24 | `112ff76c2e35c18b3dcb6080795536638018578569da064c9cdd3dce4c4c61d3` |
| `scan-meta-3.ps1` | 3553 | 2026-11-11 11:18:53 | `25bdf089a49a342202aa1c03ac7ad57a50285a185fa3001e002c2482dde93cd8` |
| `scan-meta.ps1` | 8965 | 2026-11-11 10:49:41 | `7f6df082e6dd0a874b98334a268a330ff124f2669f3495e0064549b0a7f10890` |
| `sddl-scan-1.tsv` | 418617 | 2026-11-11 10:49:58 | `faacaae724ac98c4ea6b920b7f6631e6628c67f664970812efaabb7446060b9f` |
| `selfcheck-after.tsv` | 81828 | 2026-11-11 12:24:21 | `e74774e4e0ccce4ed7b337ea77a19268a61319a7b175911562f63ae204eed615` |
| `selfcheck-before.tsv` | 81828 | 2026-11-11 10:06:46 | `e74774e4e0ccce4ed7b337ea77a19268a61319a7b175911562f63ae204eed615` |
| `selfcheck-result.json` | 16150 | 2026-11-11 12:24:36 | `7fc5851399c1af1c74a6a52531deb586804a21eff4395bb8c051ebb7c6bb0a16` |
| `temp-acl-time.ps1` | 4720 | 2026-11-11 12:39:59 | `88c184d8f286ab92465fa347da913ccf3a3e8e2154d4f9b0dc5565407e735061` |
| `usn-raw.csv` | 28 | 2026-11-11 10:25:19 | `9b68e46d8a0da638970a38341af86abb595b59a81b5a04dd58446a97e2d9420f` |
| `usn-snapshot-1.tsv` | 61674 | 2026-11-11 10:34:36 | `432168df6d722bb68c96037b957db67aca97cff0cccc8b800ecfb29176d1f96a` |
| `usn-snapshot-2.tsv` | 61674 | 2026-11-11 12:24:33 | `432168df6d722bb68c96037b957db67aca97cff0cccc8b800ecfb29176d1f96a` |
