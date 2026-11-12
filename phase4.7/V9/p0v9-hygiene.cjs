'use strict';
// Historical immutability + byte hygiene for V9. Read-only: it hashes V6/V7 files and refuses
// to treat a changed historical file as acceptable.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const base = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const V7 = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V7.md': 'f7fb35cddc82197aaeb6f23efcbf99e1356a2983fa71af108a390ef40b0e2bc5',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv': 'a6473b6088d6059f89e3d3d4bcac1599668bd4ad4e8993c30c055dbc928d8aa3',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json': 'a5c00b6698dac585159296965c4f9a3c7afa8b13b22ec0af17cd540f54c50695',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md': 'b060bea60bdcc39cd499dc8df44de63e2bd29f05c7f95a962c497a77bc2cfe8d',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json': '3d4bd77841d3ebf9e8b46935b17b5d65d42a385a3222bc846c2b15fde8b86f07',
  'PHASE4.7-PHASE0-V6-TO-V7-CHANGELOG.md': '092fcf82ca4ca979ab76cf4ac245bb9d1ee3354521e151d64e54355bf1b6f53c',
  'PHASE4.7-PHASE0-V7-N01-N12-TRACEABILITY.md': 'd44ab83da93aac5d8f8f8bbdf0921b7ca6220c12e6bef61c588a75adf93e7cd2',
  'PHASE4.7-PHASE0-V7-OPEN-ISSUES.md': '0b882db0ac4f0e5d5adc0ad109eef8bcc64be74d0fb00af7f221b491426ee75d',
  'PHASE4.7-PHASE0-V7-SELF-CHECK.md': 'd70e91f7d44bd603f15d50104c98640a89664a7f1e691f5f4d59e1ba920226a7',
  'PHASE4.7-PHASE0-V7-RUNTIME-TOOLS-STATUS.md': 'bfc6dd40842739b77c80d22ffb172c5e64ca96810c6d713592b3188257a92367',
  'p0v7-lib.cjs': '8d2d433917efeff7851b56e1fe5e368f9400b100f71a883aee3c077d52ce5a96',
  'p0v7-spec.cjs': '4d240971d58c3144f340e973e1b526bab6355348ff207a685c3140475cbd0e2b',
  'p0v7-audit.cjs': '989761705139268ffffd287f5913295738871c9a8f081f60d24c93ddd3eb2e51',
  'p0v7-build.cjs': '67712a0703671d5402475a3c345736afb6a98c3dff3bb2bd1870af1978b03116',
  'p0v7-check.cjs': '4fa6487e043ca6c7d881157633507287c5ae9d519b286fc09c43b7573435897d',
  'p0v7-verify.ps1': '7a03128826efa2c7a23e359e9a330852ac97cefd0b8dc06b7ccda83daa65fdd5',
  'p0v7-parse-inline.ps1': '609a5254ec03923e40c05caecccb465b7a582522d88a957eead503bba3fe8031',
  'p0v7-hygiene.cjs': '3dff7fa46458e97049c91299a85f9be4b263281b710b0279fb8d17b26deaac00',
  'p0v7-controlconfig-check.cjs': 'a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390',
  'p0v7-manifest.cjs': '79ef74533a8ead85c2f07383739bd830dbe92f6ee50ca49856d2d61315d1ff8f',
  'PHASE4.7-PHASE0-V7-DELIVERY-MANIFEST.md': '882a1f0a5e65c1f23cd1103038b40ea588c04ca777708596f8da50a55bac065b',
};
const V8H = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V8.md': 'f189d4e3ca51965cc2f933430f5b67684c214be0b3994f8e171b53e12c4ac48b',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv': 'eb0230c085a23ff34209b02161b56ffa22c9b4ced61996c390b63bdb40a1ecc5',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json': 'edca94ff7b8b45794dcaac8fd316f147e06c2cdb655a8d6eabdd63ccad586c47',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md': 'b70004a7a2f9cc7f3cccea12062a296e12edfb42e80012d7c5c21d563bcd260c',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json': '5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa',
  'PHASE4.7-PHASE0-V8-FAILURE-MODEL.md': 'dfd4e8778727395f65da06965f65a6747fed0edaccd49f0b65d71d920e208bb2',
  'PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md': '7cd0d9a72a7dd642e0e6844a2b167b741f3556b21af1de0a9d32d0555bd23dfd',
  'PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md': '7493f927c6adfe341faf804a96461a3f4ae5a16a2486d3c30a343d466fc80d3b',
  'PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md': 'bb0566706eab350c48b493e19567740dbb5edaa6b78982472d5a5b352502ab87',
  'PHASE4.7-PHASE0-V8-OPEN-ISSUES.md': 'a7ed266b0b0581fd9cb222cbf4dc948e76f0659de9d2d3443169fa21a05197ca',
  'PHASE4.7-PHASE0-V8-SELF-CHECK.md': '0c17a2ee58f32aa9f133bf6619ad1a9927bb3af77e3997d278489bb9bf2533b6',
  'PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md': 'e4785d4d2851feb9604d88985f8ce547909f42b0733bcf16b67f248b8230b48c',
  'p0v8-lib.cjs': '0b5c606a2534494acd2989a14ecde546050afc73df555d00ade531d61596d58c',
  'p0v8-spec.cjs': '10481537da1148b0dbe9b54a14068e59e60a79f2271924edb1fcf1e48cbead10',
  'p0v8-flow.cjs': 'd05cda5ed5da3971e533f710f9af580fa475047308a328a8dded3086a0765b68',
  'p0v8-audit.cjs': '5f43707271faa2c5dc823cb320e007fb009126171f438b5c1891426d812dbe4e',
  'p0v8-build.cjs': '64d74d892e12ee622837b9e406f426b662091407a2a4bdce5c5fa8d451a3d030',
  'p0v8-publish.cjs': 'f6e43e26c96d02e39286db24d51030cb02496c818fdce63839a315e9a171d95a',
  'p0v8-check.cjs': 'b77591df895c1f742426ad5a7946f0410b74fc033d99d617ae0389cb48362296',
  'p0v8-verify.ps1': 'bd34bab8332d59cc1d9ebd258fe0d9fadc9eeb7b371666d20db179c7d3354d21',
  'p0v8-parse-inline.ps1': 'd63dcbbb60103c3247052558d0791e9690574437dec410a1adf71851a8228c3d',
  'p0v8-hygiene.cjs': '1b71cc21f90a4d07274c557e62488b1b747f138c9a3dff29c61c65bb361fdcb1',
  'p0v8-controlconfig-check.cjs': 'c4cacf47f3e281f717dd58a269a97b90fe446d1ae3463e82cd8b9c59fb863673',
  'p0v8-lab.cjs': '9b25144450867c8531fa49f1b0362701801b913780aaf4212e45c76229a8ae11',
  'p0v8-manifest.cjs': 'fb06ac87c2970997264fecb4637434f8b8c7ccfb66295bb2d8650b310a833cc3',
  'PHASE4.7-PHASE0-V8-DELIVERY-MANIFEST.md': 'b8d8cace4e21d9025f8dde98f05fedb541039242b1c97ca298c526d6a9ae5805',
};
const V9 = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V9.md', 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V9.tsv',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json', 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json', 'PHASE4.7-PHASE0-V9-FAILURE-MODEL.md', 'PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md',
  'PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md', 'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',
  'PHASE4.7-PHASE0-V9-OPEN-ISSUES.md', 'PHASE4.7-PHASE0-V9-SELF-CHECK.md',
  'PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md', 'PHASE4.7-PHASE0-V9-DELIVERY-MANIFEST.md',
];
const out = { historical_ok: true, v9: [] , issues: [] };
for (const [f, h] of Object.entries(V7)) {
  const p = path.join(base, 'V7', f);
  if (!fs.existsSync(p)) { out.issues.push('V7 missing ' + f); out.historical_ok = false; continue; }
  const got = sha(fs.readFileSync(p));
  if (got !== h) { out.issues.push('V7 changed ' + f + ' ' + got); out.historical_ok = false; }
}
for (const [f, h] of Object.entries(V8H)) {
  const p = path.join(base, 'V8', f);
  if (!fs.existsSync(p)) { out.issues.push('V8 missing ' + f); out.historical_ok = false; continue; }
  const got = sha(fs.readFileSync(p));
  if (got !== h) { out.issues.push('V8 changed ' + f + ' ' + got); out.historical_ok = false; }
}
for (const f of V9) {
  const p = path.join(base, 'V9', f);
  if (!fs.existsSync(p)) { out.issues.push('V9 missing ' + f); continue; }
  const b = fs.readFileSync(p);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) out.issues.push('BOM ' + f);
  if (b.includes(0x0d)) out.issues.push('CR ' + f);
  out.v9.push({ file: f, bytes: b.length, sha256: sha(b) });
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.historical_ok && out.issues.length === 0 ? 0 : 1);
