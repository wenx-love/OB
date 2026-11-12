## 附录 B：证据与产物不变量清单（规划时刻快照）

快照时刻：2026-11-11 规划轮（T-plan），由 `gen-appendix.cjs` 只读生成。它不是阶段零的正式基线：阶段零开工时必须重新生成并与本表逐项比对，任何差异先解释再继续。

**哈希实现交叉校验：** 本表用 Node v22.23.2 的 `node:crypto` 计算；项目内 518 个文件同时有 PowerShell `Get-FileHash` 的结果（`selfcheck-before.tsv`）。两套实现比对：哈希不一致 0 个，大小不一致 0 个，任一侧缺失 0 个。

**目录摘要的定义（可独立复算）：** 取目录下全部文件，相对路径用正斜杠；按 UTF-16 码元顺序升序排列（即 JavaScript 默认字符串比较，不做大小写折叠，不受区域设置影响）；每行写成 `相对路径<TAB>文件的 SHA-256 小写十六进制`；各行用单个 LF 连接，末尾不加换行；按 UTF-8 编码后取 SHA-256。上一轮对话里用 PowerShell 默认排序算过的目录摘要与此排序不同，以本表为准。

逐文件的完整清单（含 node_modules，共 2011 行）在同目录的 `MANIFEST-plan-node-full.tsv`，其 SHA-256 为 `9a3d0e928c2d99d095afcb5bd898b531971e530b79cab59b1890deed886433a6`。

### B.1 目录摘要

| 范围 | 文件数 | 字节数 | 目录摘要（SHA-256） |
|---|---|---|---|
| `dist` | 17 | 3522906 | `35acc3662c00fc815985486d623a5ab4fd7f42d962c9559c19d1f54fdca652b4` |
| `src` | 50 | 452449 | `3e59a9345fb7494bb9b84f93f5f99ccdacf0eefa8a06111e4f7a6a49e61da078` |
| `scripts` | 48 | 578001 | `c7ac8e0fb53a3dd16ae96608816d13aa2bcf140809704fef2057049c9f8fcb57` |
| `docs` | 13 | 256952 | `bff5e18578d55c081609374d3c6ed211ff8526ecbe132322068355bddb6d8b44` |
| `test-pages` | 24 | 43596 | `52d53fd46df83988b1dbcb7446e215c2285e196147ac08133cd531c5fdbf549e` |
| `test-output` | 3 | 10826 | `cd3ca1bc446f1653cfcd106600cb983cadd76803d5bdf56d0eeb50b976dd5bbb` |
| `test/acceptance` | 169 | 6921669 | `97a760d9afc88d09fde1dd1ecbe45d7a621a585b34d503057d802d8a87d7ed41` |
| `test/fixtures` | 128 | 9503296 | `ed273a710a12f3326ee86a01f2445c1b3f21e62c9487a6a21df4e44c3d1d2ae8` |
| `test/fixtures/real-ob-sites` | 95 | 7259377 | `e21d8191079ff39ccae23df838ad63d5e84e66ad71ace0bbc04f392c48ca049a` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou` | 31 | 7069284 | `6dc5db3ee9e0dd791e096c61ad7f25d5e3a55400b16bc8e0bf28cedbf2d72615` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed` | 11 | 73547 | `525aef39b1c7982712f3316fe73804de407932497892669cb776384d93b4bdb4` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios` | 43 | 58855 | `b6c2faba23cf8960c4af619d5eca2f8626d24d420a5dd78ffc792e51f76351a5` |
| `test/fixtures/real-ob-sites/l3-browser-replay` | 9 | 52528 | `d4ca7830fbce6153d37cbce6bfad3459281e9d059078a949a11cfe3d00f1699a` |
| `test/fixtures/real-ob` | 3 | 7817 | `3f0e681859d88a1f66770e6e773a9536faec4ab6399854a1592be03cfa9966b1` |
| `test/fixtures/real-samples` | 22 | 1717320 | `78d0381934ad788dfab20f535b147c845f0bb25b3c07e5063e24d234abbcb066` |
| `test (code only: not acceptance, not fixtures)` | 49 | 442980 | `bef001086cc4c2d4c361da1706d380b1d697e0fc5fd0a090d2ac7974c974c04d` |
| `root-level files` | 17 | 151091 | `381b98c34f123b7cc630d19bb3c9db5c57d00805e9d945fb1fa5b4b2b33890c2` |
| `PROJECT (everything except node_modules)` | 518 | 21883766 | `745ec52fcb5e40159796354ba9ce1f9ebe46cc01ceba43c78e51ba5f154403be` |
| `node_modules` | 1493 | 78622359 | `10cc8fc2ad148bb731aa72fec2c3dbea5d700b9fa959aa69c4f030eca4a1ac5c` |
| `WHOLE TREE (including node_modules)` | 2011 | 100506125 | `1533d4e61d3f653ef391fa6bb4046cd9537d3b6ef4117ff7a1dbea7262382d36` |

### B.2 L1 历史证据（test/fixtures/real-ob-sites/l1-qccqcc-hangzhou，全部 31 个文件）

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/budget-ledger.json` | 2844 | `c2b1fbd280d423f3c6f84e2291e539c2ecaa38e18fe3cfdb828f46e97064f30e` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/chrome/devtools-baseline.json` | 4157 | `5998697c1ea44bceb74362450c2855b5d45a93843e918e738237b00459440e8d` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/collect-reference-values.mjs` | 3660 | `229f700cd6e6a9ca1f6b573ae69c276c020012e4f8f20b63ff2cc388e860ff91` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/finalize-reference.mjs` | 5583 | `ffebe62395c062355c5a356dc6d343e13ed5c84eaa27fddb3954bf50fd1bc22b` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/headless-probe.json` | 384 | `9007d91de195e95a42910bdb731b5dbcffee498a66b2c1398ac6d130922f907d` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/headless-probe.mjs` | 2970 | `76d31dd029f707496bb91bbde371ae5fc610ff324f50ae0b62d7f7604dfa28db` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/analyze-names.mjs` | 3320 | `15ba2b9e439756adb724c15a423e07f8d7dfd25f4d8b2a2ec51ab34c6daa82ba` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/analyze-structure.mjs` | 4290 | `c3b53bb5f37ff9821f952eba1608e13d5ccc45ad1c12bea8b6eab42936509d61` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/build-reference-sites.mjs` | 3006 | `3e302e7ac6af8ffd03c04ef000b48310af7c4ade2a62597e005122f9509e19a4` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/launch-blocker.json` | 1259 | `bc17fed382d91efabdcfcfbd64bd54568e6632ca9da69972d66401d5ebf82448` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/reference-sites.json` | 165779 | `eec1d89d952622c23a9bb82b9059cf767a0236999c5910b545c9d7e6a56114a5` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/structure.json` | 2141 | `f7fdf4c3282e6385c0ac0f8b8e1485f725684b05d004cbc7a57d02c34c8dde1c` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/structure2.json` | 35832 | `765f98dcaffb64cf2a52fa4eb6c0b296d1ff743667e1813f8bf005ace62c1d27` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/recon/js-reverse/user-decision-half-missing.json` | 947 | `b335a4db1a8b1d5aac86f84f15e3d36d0c9f95a3108bc5692900a7296b7450dd` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/reference-decoder-values.json` | 150324 | `767248a580eaf9f9034192696d4a8257e56526955cfa11c09c94fa7f4f9da69f` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache/source/script.js` | 256820 | `cc7a8127fa8a5d17289a953e11d82ff528fe9ea42276810c5f03371abf760daf` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/meta.json` | 1518 | `9af608370ac3ce0ee98b2f00822a61012c5554dc2b6239558305902d9ea19c63` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/outcome.json` | 4708 | `b3653e014eb3311c3c17c98e302351ebe112333d61a2885bc82a4aa70e02cff2` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.attempt1-early-snapshot.json` | 1017255 | `d7b35779c91d4acd1907a818fbb93381fb9c1bbb91f3f5fe8e8f1e30230aaf20` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.attempt2-reload-error.json` | 8442 | `eca56919b1be2242ca1bad2cf4d4c7aae1384eda94fff293ad68c48ec624ce30` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.attempt3-blank-tab-no-candidates.json` | 1015137 | `5c6effdaddbde6f9aab910e99068363d6fdd9971ec5507c91b2f7593e31949a2` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.clean1.json` | 1368021 | `f6c0ae9973ee3a97ed6995d1ef35c24de15b196bd9237f233d7e445920d7398b` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.json` | 2410974 | `a71e7a59a80b5e4fe75d392fff823ce07c1c3bd9500abe71a04cfcb888426599` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.nextpage1.json` | 5937 | `5b02d3426063b979caa68e8981dfe50fff01c4c24404efd1b804b943315eae9e` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/observed/raw-run.nextpage2.json` | 6938 | `f4ac025fc3373a3fa3fda347bba2f1fff4f3711972dc6bf6fc4219a1cde3c3da` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/reference/NOTES.md` | 1124 | `feeebc54fb09214a88c973737db1683a8089d95794f24feb50c1b53a752e602b` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/reference/business.json` | 1140 | `934b90585e90ef51f780312dc1df6c2864e1cd1f092b129ba0fc33ca2af79a42` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/reference/call-sites.json` | 326423 | `2dd7122846c1602631f1e691344f57d09003af431c6567b39855de4b379e5acd` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/reference/decoders.json` | 1466 | `e6dc4ea2b309be081a817d0f7e7086ee97e125acf65e6cf577fa38a71e4c3936` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.js` | 256820 | `cc7a8127fa8a5d17289a953e11d82ff528fe9ea42276810c5f03371abf760daf` |
| `test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/run-20261110T1458Z/script.sha256` | 65 | `cd4dda349384da1d3d5691dea2a35abe6fe6697b5fe0a055adfe30a4f41874a1` |

### B.3 样本登记表

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `test/fixtures/real-ob-sites/registry.json` | 5163 | `f256e7ada9c110005afffe118ea6733c3af5757d219029df9705307fba9e6fd8` |

### B.4 L2 历史证据（l2-real-ob-seed，全部文件）与 L2 输入

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-high/compare.json` | 13029 | `8fcddcf5c7d4a9f82648c0292c21e85d7b011426edc6bff80ea28ff03639c85a` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-high/meta.json` | 505 | `c4a2f87151ec239abe6e8a35e90e6a7f58a5ef75b40126e1c69998596a136c72` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-high/observed/apply.json` | 1197 | `afc89d5a6679e591f3c78b4876efc9c4eb0c7c833e2a8e5bf77e6ee42e03fcd4` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-high/reference/call-sites.json` | 7243 | `eafe1b6424d0d520ca63ba23555abc51cd8f37c5545dd81548f9270aa597b7b8` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-high/reference/decoders.json` | 361 | `d186be1492ef2f947c19d8d89fb76fe12935a7f3b72e25a24a03d88c4614ad3b` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-medium/compare.json` | 13033 | `eaf3d2821586b211cf76e5b1161d9e3afbf5e1dca389faba7aa3306bd1cd53f1` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-medium/meta.json` | 509 | `0948fa88641be0982041f308ab7a61cdaac422c51f5f1351891523dddc3a949a` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-medium/observed/apply.json` | 3452 | `00f42e4ebec5d697ad5f5f38a07c569e15108361ffa07e45fd216fae8cde35ee` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-medium/reference/call-sites.json` | 7243 | `eafe1b6424d0d520ca63ba23555abc51cd8f37c5545dd81548f9270aa597b7b8` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/run-medium/reference/decoders.json` | 361 | `d186be1492ef2f947c19d8d89fb76fe12935a7f3b72e25a24a03d88c4614ad3b` |
| `test/fixtures/real-ob-sites/l2-real-ob-seed/summary.json` | 26614 | `0c17dc25a512cc0a51c422fbe3e162267097d842d8770773202c282c8537a075` |
| `test/fixtures/real-ob/metadata.json` | 1563 | `06776ff98cccb97ce36350683f8b19bfd7927a553fae7a26ed4c4dca978d0216` |
| `test/fixtures/real-ob/obfuscated.js` | 5179 | `f0e5b6c7198cfb69f51ac427eba095219c5db86c74cb2970e8fba3be99fa6315` |
| `test/fixtures/real-ob/source.js` | 1075 | `f3ee75f49909ae2f93473ac5e741ed436e114616777998d064e446431ec8d06c` |
| `test/acceptance/devtools-real-ob-e2e.json` | 615413 | `640666dc7c462c16f8d9c976bb7d2a9030a44cee8a697b1ab894b266d4d6b78b` |
| `test/acceptance/devtools-real-ob-e2e-medium.json` | 815849 | `e9c14a42854eb3d282c4200753d536e6e72d43eb28c8e88cc0b3a59e671b0b8a` |

### B.5 L3 历史证据（l3-controlled-scenarios 与 l3-browser-replay，全部文件）

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s0-positive-control/run-001/compare.json` | 3720 | `39f346c5f5a9bfbe3290846da74fafdd51f6be89f149227f0bd1ff0414be7533` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s0-positive-control/run-001/meta.json` | 507 | `97a6ec59c289781b9b2022bcd1d4eaa3ee525003cfff11084c11caedbfc0c129` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s0-positive-control/run-001/observed/apply.json` | 1306 | `65239855f67c497a58fb04323023b5efee1e0647c0b3adbb84627216307e2d5f` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s0-positive-control/run-001/reference/call-sites.json` | 1117 | `48ff73d69f0f34c95129df677ef83459b0ceeb9d25d1c73e58a6bf9b85b4b074` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s0-positive-control/run-001/script.js` | 155 | `6a21ecf53d17ea8dc7992f35ca71e0fe60b287cf6500586d43864c2c2d965b0c` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s0-positive-control/run-001/script.sha256` | 65 | `331eb8098fd9913284350e343d8bf38943f70aab16635f3f0358973c5f909ed9` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s1-same-text-different-position/run-001/compare.json` | 3788 | `c01903a044e80cd21c081ca53d2f898a50e6263bd1732900f7ebaf1e261dd8aa` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s1-same-text-different-position/run-001/meta.json` | 559 | `1a2c8d271c42bd2462f09afa93da0a070c4bc6fd48feea3562ceb78be26bc79c` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s1-same-text-different-position/run-001/observed/apply.json` | 1004 | `f19d941e67ae1ea57667b54152931a998133c9aa3adec9217f2d97bc578493ab` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s1-same-text-different-position/run-001/reference/call-sites.json` | 1444 | `b030240a79d2ce9c7831a85d29d4bbc904c8abb69ebbc91cf5906e0c77793c50` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s1-same-text-different-position/run-001/script.js` | 238 | `8ea6de7faf97488df88845236fbbd0dd191b264d9d0090a85f82277acd661557` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s1-same-text-different-position/run-001/script.sha256` | 65 | `062e675e0f88383dcadf4de0d50c3f527b25894e90c7174b0a2a353052abd696` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s2-array-rotation/run-001/compare.json` | 3655 | `87d562e19b263c72d0f63a035d6425fbf0dcc451cb7a9afbe71020daf6e7e951` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s2-array-rotation/run-001/meta.json` | 533 | `a35733678345e022a810cd40a4b22238ae6150f7d6b2ca7c2dcbdfea27170175` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s2-array-rotation/run-001/observed/apply.json` | 763 | `9fc1e8e43448a3c97fb17a3412a39423605db2d3af9ed095cb78d3234fdfba74` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s2-array-rotation/run-001/reference/call-sites.json` | 1280 | `56c5fec59fceb3858bbad8283d2dcd7c5f9d3f427ff33babdc211150414ddad5` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s2-array-rotation/run-001/script.js` | 208 | `bd11e190f73922e7a4e82f6117e0a39d87bb7ed3e339c9169a165f55c172b504` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s2-array-rotation/run-001/script.sha256` | 65 | `91018dfa6ce2eca8ca84383776c9035fdb2b7d4fbc5d7b8eb0b4c0ce1479d793` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s3-same-args-different-returns/run-001/compare.json` | 3078 | `4d4076d01956fb275dd8f889d87f7f453019c0fdca66051a8d6de9482530149d` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s3-same-args-different-returns/run-001/meta.json` | 525 | `46151524ee9c82bcd710e776e8327b28b319779b337c27dea0860dbd17fb652b` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s3-same-args-different-returns/run-001/observed/apply.json` | 734 | `c240f02fb81a00b500926a643d6e3749abab3bf0a3e1395b83d0c931d48ad8f7` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s3-same-args-different-returns/run-001/reference/call-sites.json` | 790 | `6cabd48912a50ea9c9de55370a8f19062db5792c2de59226eaf1ef8ee61d15d9` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s3-same-args-different-returns/run-001/script.js` | 116 | `8bd7505a51bf33815c562e3cae4caf100276922665bd238f958d899c262ff48c` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s3-same-args-different-returns/run-001/script.sha256` | 65 | `ff1c8cb81553a1bd02dfd4c90bc1a9afce115fbc3d5df81f1575d1a6f0b192f9` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s4-state-dependent/run-001/compare.json` | 3339 | `517b1a4c92957e0f4675b478f0cef35430c4994f9524c79b59b2868085063c40` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s4-state-dependent/run-001/meta.json` | 498 | `ef302f165fe0cc77262f4908896658c97261d1ad718d0e516c7dbfae7caac46b` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s4-state-dependent/run-001/observed/apply.json` | 734 | `c240f02fb81a00b500926a643d6e3749abab3bf0a3e1395b83d0c931d48ad8f7` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s4-state-dependent/run-001/reference/call-sites.json` | 1083 | `b21d87551f632238ef44ed1fc67efa4ecb6bb1ce0e098a1267b557b5703e0af9` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s4-state-dependent/run-001/script.js` | 195 | `ab007e4f991b0bc673fe664bd5cf3433325b190551450dcebd697895c83c81a6` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s4-state-dependent/run-001/script.sha256` | 65 | `7c841935f0423e75dd312325c398f570b19f1a9ec9ac6f7c106379d9531eeafc` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s5-side-effect-decoder/run-001/compare.json` | 3703 | `1f6f74d74798dc54a1f59b2d5f090c0608b551f4685076097d0d5edec5ec5812` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s5-side-effect-decoder/run-001/meta.json` | 555 | `95a70708d5fd709cdf20a1876d7d5e1f799ed5aba99f50b5d6c15a3f4fd05fd5` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s5-side-effect-decoder/run-001/observed/apply.json` | 734 | `d661b2687895966cb5ab0f1e80269842b45d3167ed52ca0cebbc77d1bf03b049` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s5-side-effect-decoder/run-001/reference/call-sites.json` | 1245 | `819a3ab6ecd9c893cb6875afb9378c73b8d104d8f24fc923b08533010837786d` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s5-side-effect-decoder/run-001/script.js` | 196 | `7ab9485d6baee733ebd9dd25da7d48de357645eb369db028a1e5190c6efdf021` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s5-side-effect-decoder/run-001/script.sha256` | 65 | `61ff70fa12ee617777a99d9296a79457b903b893db1fb3c83186320efcd2aa53` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001/compare.json` | 3469 | `a96951697c0262423ab250d2c0743b3895552a1a99f7f4473329367131fcfdef` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001/meta.json` | 508 | `f88328469f5ab81fcb84c46335c8aceb2292dc2b3943de08b4a05df5a39b150e` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001/observed/apply.json` | 943 | `951d17c87d39e6390104b652830572c3e7f1bac8aa3e5e9786bd02e59e9e4fd7` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001/reference/call-sites.json` | 1095 | `dd62d4947b98b90f660620e63f5ddf2985810b2cc487c9fa255060741319f5f9` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001/script.js` | 155 | `6a21ecf53d17ea8dc7992f35ca71e0fe60b287cf6500586d43864c2c2d965b0c` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/s6-dynamic-script/run-001/script.sha256` | 65 | `331eb8098fd9913284350e343d8bf38943f70aab16635f3f0358973c5f909ed9` |
| `test/fixtures/real-ob-sites/l3-controlled-scenarios/summary.json` | 14428 | `c6aa8f6f9ae27237f64d3888f52c6ec91d4af5ac7a3fe3b122017eab8d77fedc` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/compare.json` | 4799 | `5f9196ac1a9f228d2873c6921ff1ed80347185031a5b87c73d7f5119d0ea473b` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/meta.json` | 1020 | `25f1205aadaaf98937b0a1c8810581ff5d39564829eda136fe73cac67dfd57e9` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/observed/apply.json` | 1740 | `ee7e6138fd2f30923109ec124f0411a313c894238691e8ce3817b78f6c8983d7` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/observed/browser-raw.json` | 30329 | `8208c2f670b4181bac04410b7adb6ad31009730bf63047f520c419fe5957456f` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/reference/call-sites.json` | 2011 | `6fa739ac320468cc03fb4d23bdc15edfdc099fc2be99d6e4932431b4135ee5fb` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/reference/coverage-control.json` | 5511 | `337c055bf169888ca4c8c50a126d6c93d71e4ed5ab3a362a170ba2ae2546daf9` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/script.js` | 1576 | `909d0fd8edd0ad774359cac8798526f1dc10bcee7a3a88e2310493a8bb75a83a` |
| `test/fixtures/real-ob-sites/l3-browser-replay/same-text/run-001/script.sha256` | 65 | `9b2afca3c9e74d740276252c702046aba8ea3a8f2cd15387de3f908ef8789842` |
| `test/fixtures/real-ob-sites/l3-browser-replay/summary.json` | 5477 | `12871a82f21dc317b05f9328081cc53a41ebe0049401da29d980a49f989f3e00` |

### B.6 L3 输入（测试按固定路径读取）

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `test/acceptance/p47-l3-browser-replay.json` | 28458 | `6470dbcfa6b191d3a0b48158508c5bc52ec68e756233394d52d46cc7c4b230bc` |
| `test/acceptance/p47-l3-browser-replay-panel.png` | 151502 | `fcb8e4aba5dfda94f41b2e0c80c6e063e8a47f8a14aa55a703dfcf0ae6152571` |
| `test/acceptance/p47-l3-coverage-control.json` | 4797 | `b70157569f53bf7ca24861241e4ebf2bf2d41c76b2fd1c98489507580c5f2589` |
| `test/acceptance/p47-l3-coverage-control.run1-ws-closed-no-data.json` | 2046 | `8734fbc3ac79361dc50089172636c8ed2f560672b76b12f402c1c220eeeb4208` |
| `test/acceptance/p47-l3-decoder-count-diag.json` | 12521 | `3484b1c746bb735aa33432b5576972182105ae639c798ab9dbed7e5468b59d39` |
| `test-pages/real-site-l3-same-text.html` | 125 | `844c73ef6d1b0b1a811a0b5ef4cdf9b2eb85980402d313420332bc1a2a68b22e` |
| `test-pages/real-site-l3-same-text.js` | 1576 | `909d0fd8edd0ad774359cac8798526f1dc10bcee7a3a88e2310493a8bb75a83a` |

### B.7 完整 dist（全部 17 个文件）

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `dist/assets/decoder-analysis.worker-CMwEr3ip.js` | 1647698 | `e94cfda133ae1b4b2de7978fbe4eab0ac37a9c8662ea5274db08c87a2d845380` |
| `dist/background.js` | 74971 | `68d8055b0eee56277979858ef43a4a85eb66960dd44d72eb990be73ea7e3eea0` |
| `dist/chunks/__vite-browser-external-B2yVx1m_.js` | 43038 | `7bc44fad230e9f53f128563467a66742f9ccfa0ea4d9b407ad670cafa0952a94` |
| `dist/chunks/capture-plan-ZmWOmY9y.js` | 2404 | `dd5393a3eccee0099b06ed56bbb8d8ec164a1bf081d26321670458995204ebec` |
| `dist/chunks/parser-BGlb7RAx.js` | 1540614 | `3533bc327385672541d5062fd510bda80903ed8358415dfe15bdf53ab25bea11` |
| `dist/devtools.html` | 163 | `52491cb4ab42039f41434bf649162c28ac242b957245f24f1a3c641ab39845ac` |
| `dist/devtools.js` | 81 | `870b0b747d5bfbe54af0fe8d81581f27bac8eb2a4ecea433f78f295c18edae65` |
| `dist/icon128.png` | 70 | `6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0` |
| `dist/icon16.png` | 70 | `6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0` |
| `dist/icon48.png` | 70 | `6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0` |
| `dist/manifest.json` | 459 | `b3c737b4e6ea12a55d37ac75726fba8b2aad8778e26d092b0324997b18efcd55` |
| `dist/panel-layout.css` | 9933 | `91763afff28061b4f98dc594c4831e9569cb55b6066af7a2cf87db09c2af0455` |
| `dist/panel.css` | 17006 | `545a521949be7e7c8bdfa92d0866bf3af6522949b9291f826c719777e797048a` |
| `dist/panel.html` | 16051 | `8d6d2bd818063f46f5bb314504578370f68ff680c98c61f29698336817878bfc` |
| `dist/panel.js` | 118789 | `accfac096ae00cb33158f550cdc2e10beeebea69bcf213dc27c0ce653291e807` |
| `dist/sandbox.html` | 175 | `725a7f6afe6d687cbda4b92d97eb1796218b81ac44421ac5cda10b9d4250332d` |
| `dist/sandbox.js` | 51314 | `2df0c21289c5f8bfc6419f54d24e2fb2f99f9e4245acd71d6c4c52e7016f2be4` |

### B.8 受保护模块与相关文件

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `src/core/decoder-discovery.ts` | 28516 | `47f2d7912431a4836fc3595b44df4147bf46489defbbb17093712dcaf33d39ae` |
| `src/core/parser.ts` | 692 | `c224d634be1c35a6a01ecbd4874c7de364251efc1036bd40425d7c01ac6de620` |
| `src/core/capture-validation.ts` | 25712 | `7640c890876a85bc8a1482452efd0991f12f1921c93a8d45f52c1ec285054b35` |
| `src/core/capture-plan.ts` | 3627 | `a31635ada159364d723eb36006b34c0773d7a58e5283632b68e92cc72df8c548` |
| `src/core/verified-replacer.ts` | 14113 | `bbc9637bf537f57b5ff2e0bc0a1a3db494108c863729fc87bee558f07f5c2654` |
| `src/core/replacement-dryrun.ts` | 16704 | `f2642c78f263d59667100efa452333447d3f5557941267f84ad40ea7294ff09d` |
| `src/core/hash-utils.ts` | 1253 | `f62c8fce69b520ac125ae069040a59594e233f8e80dc75d4fac28fe82d2ab634` |
| `src/extension/debugger/capture-engine.ts` | 31114 | `59242f2afbaaf138898c06b7d75ed3ec2a08b6544730b949cf5fb5d091d1273e` |

### B.9 配置、锁文件与本轮整改涉及的源码现状

| 文件 | 字节数 | SHA-256 |
|---|---|---|
| `package.json` | 733 | `81547710e0707cc0403356f1c9f0f1f588ed3d43ac2c545184afc72a0db74846` |
| `package-lock.json` | 75216 | `88bb84ecff99431fd2e1b62847feffccb931279edc793da6f9ddc4a072ed982e` |
| `tsconfig.json` | 610 | `a6bcaa868c45c8ee4fb7a677e35eb95eef6401d4da15ebdadbe2942e6d70f2cf` |
| `vite.config.ts` | 2651 | `dfaf7e96e15a6efd1eb0db79bf0ab787cee7b67d511aed2895da3418b26e667f` |
| `src/extension/manifest.json` | 459 | `b3c737b4e6ea12a55d37ac75726fba8b2aad8778e26d092b0324997b18efcd55` |
| `src/extension/background.ts` | 18553 | `d984d7f032cb29fa632d36273ea9c5db4133e77139ddeb73edc4b8ab2cf2b684` |
| `src/extension/debugger/script-collector.ts` | 3693 | `886e1c881fe95a594ed8f146fe87e683272c8586f9193ebb410a5ca250ef3573` |
| `src/extension/devtools/panel.ts` | 77310 | `d8b862369f29e99bda801d968a8faeb8e6e0fdf95a1f127fbf875aa9ca71f461` |
| `src/extension/devtools/panel.html` | 16051 | `8d6d2bd818063f46f5bb314504578370f68ff680c98c61f29698336817878bfc` |
| `src/extension/devtools/decoder-analysis-client.ts` | 9323 | `90a1ec144978cbbcdd8bfb9eb35f2cfccab90a46abb446037173f77921b48149` |
| `src/extension/workers/decoder-analysis.worker.ts` | 1531 | `a3ddf049c644ad0b33ee30a27b97b010a608860ade2cdadfc6a8009141604684` |
| `test/helpers/real-site-compare.ts` | 33158 | `4046e53e59041f5bdab3adaadc324b5cf9e6d0c8cc6f1f60b3af882704a4e296` |
| `test/real-site-l2.test.ts` | 19695 | `da2d0cc3a8a2ad1531c2354b46459afc0a0469b9788b199a960bae0e288b48dc` |
| `test/real-site-l3.test.ts` | 19938 | `7d16531ac3ec8b2fd82de5f138dd0ed376a868adfb70f6d714719c449106222e` |
| `test/real-site-l3-browser.test.ts` | 38806 | `d18cc64184a2ae9d77a1e525eeb1d9fcdb94c18a0198562f4eaa2ad783847918` |
| `test/decoder-analysis-queue.test.ts` | 9062 | `c7c74dd53e6852813076533f7d45e68d26669e4211fb0fcc7e40d9657e519955` |
| `test/decoder-analysis-consistency.test.ts` | 5736 | `0903c177309b038063bdaeec4eafb6f0f84b482ebfbae31396169b2809267bbd` |
| `test/p47-l1-run-order.test.ts` | 14137 | `06d697d367a73a7cf5356fef512c799a573db6a3ec0aa3991b54ab9ca8570913` |
| `test/fixtures/p47-512kb-synthetic.js` | 512064 | `6a419264c85865c134c88ed52239eefd527fb2cbcb74ceb9af501d8e106ce207` |
| `scripts/p47-l1-ob-run.ts` | 57613 | `c1c0089937ef60b01d192625ca8f94519ae64fc9d1c033c38f9a14def9c79f8b` |
| `scripts/p47-panel-perf-verify.ts` | 19386 | `36fabc4346a0c20a4938adb47f893bd665c9f0493ba11b6399b1e35cf711d059` |
| `scripts/p47-worker-exec-verify.ts` | 12235 | `187a7ffd9a3492dc4465aeda1bf22590c956f8a57e79317d797d5d64e734162e` |
| `scripts/p47-offline-connect-diag.ts` | 41016 | `269b95dfc6b03a17cd41b90a9bbd25dead58e2a214626fbdfba7ac952fc512c4` |

