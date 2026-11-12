'use strict';
// V7 byte hygiene + historical immutability (read-only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = __dirname;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const core = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V7.md', 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json', 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json',
];
let failed = 0;
for (const f of core) {
  const b = fs.readFileSync(path.join(DIR, f));
  const bom = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const cr = b.includes(0x0d);
  const ok = !bom && !cr;
  if (!ok) failed++;
  console.log(JSON.stringify({ file: f, bytes: b.length, bom, cr, sha256: sha(b), ok }));
}
const v6 = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V6.md': '5342fd55f5a844fc76b56cf07569ef8923925d48e22ee9ed249bacd825221a58',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv': '661ca153076ab458a48a919709da0241fd7e72f831d66637531e68565236514d',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json': '29b1693104c2690cf6987a9dd247aa4145ec17ffcfc5a7c33b225bbcb1e69906',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md': 'c3026ab8c226833794a2245d1cbbe83bd8ec905ae06a440934fe194276099088',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json': '8d9a4773296e8f57509b4d659d6f3d6ca94ebf70cfeddd8dcb03803a06a8418b',
  'PHASE4.7-PHASE0-V5-TO-V6-CHANGELOG.md': '5ee7f761b9d68cd83abad32f08dde9c1e8b853b15555b71a95d204d53240bd16',
  'PHASE4.7-PHASE0-V6-OPEN-ISSUES.md': '1f85f67535046c6df1ee156c7a5edb28ffc49c5b364c40f0a82598484fd0eac7',
  'PHASE4.7-PHASE0-V6-SELF-CHECK.md': '98a3329c453972a58eb8c5158782df8a116a907246be2ddb225733fd18e0a588',
  'PHASE4.7-PHASE0-V6-EIGHTH-REVIEW-TRACEABILITY.md': '88666c0314329c259bafbc20a7f14664f3d9682ae2e72260f9a40bc93e245505',
  'PHASE4.7-PHASE0-V6-DELIVERY-MANIFEST.md': 'f11846ff7f0953c6e70d8d863a1b42b5a6b1187f21a53a31476ce9013a8022b5',
  'p0v6-lib.cjs': '799dcbb5081f87d3be77b1e57502b8c9f572c5d61b343c28cb5e5a9bd0dfb482',
  'p0v6-spec.cjs': 'a75342552623f15995c45d84456a6b987ad3490191d3466de3fa7d65bc91b075',
  'p0v6-audit.cjs': 'be3b4543c328ecb473926b762899764c2ee172a3c2c913e7075c404647e48583',
  'p0v6-build.cjs': 'be57bba1cbc7442ba66aec562ffcd488516709a154baf62c4b50a714a2bb8f3d',
  'p0v6-check.cjs': '9bca4cbcb74e92b1a2982522a7bf97813fdfd3011a4f3a556b5eab596e9630c3',
  'p0v6-verify.ps1': 'c61356c1ab7608f99d138ff032386b65b49f283fc1fd03b6ba3feb1e949ce085',
  'p0v6-parse-inline.ps1': '430b9718e0699e661ceacc40e359dd12ca9614896c3f64395454fea2add7a846',
  'p0v6-hygiene.cjs': '3e24a658563f9118ced6860ff97476435fe7044ce22d731e6bbd11d297b85072',
  'p0v6-controlconfig-check.cjs': 'a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390',
};
const v5 = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V5.md': '3d5e51bc1af7829d26c1de6266cc7706091807189f5eea7befa994a2d118fdcd',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv': '1b7ac41018ed4a4345a0122cc74576c56d6f6c128b91e430b9b184e98618fb95',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json': '078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md': 'fa6fecbacfe9142f9b2f7ac0d05aea6cdf25b89b275ae7c60edc3ba9ac323220',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json': 'dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042',
};
const refs = Object.assign({}, v6, v5, {
  'CODEX-P47-PHASE0-V6-NINTH-INDEPENDENT-REVIEW-20261111-195127.md': 'f984376211f17c9cdd7b07d85b701ef9a6c2d6f8c01773232e3e4e4585584383',
  'CODEX-P47-PHASE0-V5-EIGHTH-INDEPENDENT-REVIEW.md': 'ab284d004914c82d1438514c13ba27b09134524d656ae3c69ec266a1013a06a8',
  'CODEX-P47-PHASE0-V4-SEVENTH-INDEPENDENT-REVIEW.md': 'af6a2c394947c1f71275aba1844cc67c5e603a07a3c70aeab33f1566b6f3f6d0',
});
for (const [f, expected] of Object.entries(refs)) {
  const p = path.join(DIR, '..', f);
  if (!fs.existsSync(p)) { console.log('MISSING ' + f); failed++; continue; }
  const actual = sha(fs.readFileSync(p));
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(JSON.stringify({ input: f, unchanged: ok, sha256: actual }));
}
console.log('hygiene failures: ' + failed);
process.exit(failed ? 1 : 0);
