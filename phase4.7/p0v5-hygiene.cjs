'use strict';
// Byte hygiene + input immutability check (read-only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = __dirname;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const files = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V5.md',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json',
];
let failed = 0;
for (const f of files) {
  const b = fs.readFileSync(path.join(DIR, f));
  const bom = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const crlf = b.includes(0x0d);
  const lines = b.toString('utf8').split('\n').length - (b[b.length - 1] === 0x0a ? 1 : 0);
  const good = !bom && !crlf;
  if (!good) failed++;
  console.log(JSON.stringify({ file: f, bytes: b.length, lines, bom, crlf, sha256: sha(b), ok: good }));
}
const inputs = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V4.md': 'e48f1109ae44288872b91182ec747d9689063414a57642cdc95ccedba91b6541',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V4.tsv': 'bee85b080a5d9746de8e22d1493f227c2044949ca4b19786a9dc77e283d5c794',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V4.json': 'e48904b32c6b554806da203d2907976edde94b030f281a833e7275851a5502cc',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V4.md': 'e23b589e84f7cf0155a7516bd4526f2a5eaab2be12cf645f297a9afb38ba61ea',
  'PHASE4.7-PHASE0-V3-TO-V4-CHANGELOG.md': '22209ea4e065a54f2c1f84144e8a057ee6944b219f5f3cc7fffee3aa0ddb0dcf',
  'PHASE4.7-PHASE0-V4-OPEN-ISSUES.md': '6e8c3968ccfc2451a7cd7d65b63b90a9c870beabd95a3ec1472a5126f23c9588',
  'PHASE4.7-PHASE0-V4-SELF-CHECK.md': '03c8348d5104e7ee2ac8eda8f1abce09a8bed8a6963b2a8e41c65bfe2dde7dba',
  'CODEX-P47-PHASE0-V4-SEVENTH-INDEPENDENT-REVIEW.md': 'af6a2c394947c1f71275aba1844cc67c5e603a07a3c70aeab33f1566b6f3f6d0',
};
for (const [f, expected] of Object.entries(inputs)) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.log('MISSING input ' + f); failed++; continue; }
  const actual = sha(fs.readFileSync(p));
  const same = actual === expected;
  if (!same) failed++;
  console.log(JSON.stringify({ input: f, unchanged: same, sha256: actual }));
}
console.log('hygiene failures: ' + failed);
process.exit(failed ? 1 : 0);
