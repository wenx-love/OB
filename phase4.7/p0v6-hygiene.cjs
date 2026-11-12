'use strict';
// V6 byte hygiene + historical immutability check (read-only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = __dirname;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const core = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V6.md', 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json', 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json',
];
let failed = 0;
for (const f of core) {
  const b = fs.readFileSync(path.join(DIR, f));
  const bom = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const crlf = b.includes(0x0d);
  const ok = !bom && !crlf;
  if (!ok) failed++;
  console.log(JSON.stringify({ file: f, bytes: b.length, bom, crlf, sha256: sha(b), ok }));
}
const inputs = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V5.md': '3d5e51bc1af7829d26c1de6266cc7706091807189f5eea7befa994a2d118fdcd',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv': '1b7ac41018ed4a4345a0122cc74576c56d6f6c128b91e430b9b184e98618fb95',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json': '078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md': 'fa6fecbacfe9142f9b2f7ac0d05aea6cdf25b89b275ae7c60edc3ba9ac323220',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json': 'dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042',
  'PHASE4.7-PHASE0-V5-SELF-CHECK.md': 'bb33884a2be571dc5d62fbf73854504dda1614026de52578623286f11f5c9e38',
  'PHASE4.7-PHASE0-V5-Q01-Q07-TRACEABILITY.md': '544e869182aef684682ee4412b7fa9ab5f1f21e4eee130270f7a38e4a3d5becb',
  'PHASE4.7-PHASE0-V5-DELIVERY-MANIFEST.md': '9bdd69a82b4063717b6ec0109b86a37b5e3a6a8678adeb855bf5670e947c5ff9',
  'CODEX-P47-PHASE0-V5-EIGHTH-INDEPENDENT-REVIEW.md': 'ab284d004914c82d1438514c13ba27b09134524d656ae3c69ec266a1013a06a8',
  'CODEX-P47-PHASE0-V4-SEVENTH-INDEPENDENT-REVIEW.md': 'af6a2c394947c1f71275aba1844cc67c5e603a07a3c70aeab33f1566b6f3f6d0',
  'PHASE4.7-PHASE0-START-CONDITIONS-V4.md': 'e48f1109ae44288872b91182ec747d9689063414a57642cdc95ccedba91b6541',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V4.tsv': 'bee85b080a5d9746de8e22d1493f227c2044949ca4b19786a9dc77e283d5c794',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V4.json': 'e48904b32c6b554806da203d2907976edde94b030f281a833e7275851a5502cc',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V4.md': 'e23b589e84f7cf0155a7516bd4526f2a5eaab2be12cf645f297a9afb38ba61ea',
  'PHASE4.7-PHASE0-V3-TO-V4-CHANGELOG.md': '22209ea4e065a54f2c1f84144e8a057ee6944b219f5f3cc7fffee3aa0ddb0dcf',
  'PHASE4.7-PHASE0-V4-OPEN-ISSUES.md': '6e8c3968ccfc2451a7cd7d65b63b90a9c870beabd95a3ec1472a5126f23c9588',
  'PHASE4.7-PHASE0-V4-SELF-CHECK.md': '03c8348d5104e7ee2ac8eda8f1abce09a8bed8a6963b2a8e41c65bfe2dde7dba',
};
for (const [f, expected] of Object.entries(inputs)) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.log('MISSING ' + f); failed++; continue; }
  const actual = sha(fs.readFileSync(p));
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(JSON.stringify({ input: f, unchanged: ok, sha256: actual }));
}
console.log('hygiene failures: ' + failed);
process.exit(failed ? 1 : 0);
