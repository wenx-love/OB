'use strict';
// Historical immutability + byte hygiene for V8. Read-only: it hashes V6/V7 files and refuses
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
const V8 = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V8.md', 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json', 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json', 'PHASE4.7-PHASE0-V8-FAILURE-MODEL.md', 'PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md',
  'PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md', 'PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md',
  'PHASE4.7-PHASE0-V8-OPEN-ISSUES.md', 'PHASE4.7-PHASE0-V8-SELF-CHECK.md',
  'PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md', 'PHASE4.7-PHASE0-V8-DELIVERY-MANIFEST.md',
];
const out = { historical_ok: true, v8: [] , issues: [] };
for (const [f, h] of Object.entries(V7)) {
  const p = path.join(base, 'V7', f);
  if (!fs.existsSync(p)) { out.issues.push('V7 missing ' + f); out.historical_ok = false; continue; }
  const got = sha(fs.readFileSync(p));
  if (got !== h) { out.issues.push('V7 changed ' + f + ' ' + got); out.historical_ok = false; }
}
for (const f of V8) {
  const p = path.join(base, 'V8', f);
  if (!fs.existsSync(p)) { out.issues.push('V8 missing ' + f); continue; }
  const b = fs.readFileSync(p);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) out.issues.push('BOM ' + f);
  if (b.includes(0x0d)) out.issues.push('CR ' + f);
  out.v8.push({ file: f, bytes: b.length, sha256: sha(b) });
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.historical_ok && out.issues.length === 0 ? 0 : 1);
