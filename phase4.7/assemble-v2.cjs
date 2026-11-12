'use strict';
// Assembles the V2 candidate from its parts. Writes only into the plan directory.
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const OUT = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN-V2-CANDIDATE.md';
const NL = '\n';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (n) => fs.readFileSync(DIR + '/' + n, 'utf8');
const trim = (s) => s.replace(/^\n+/, '').replace(/\n+$/, '');
const parts = ['v2-part1.md', 'v2-part2.md', 'v2-part3.md', 'v2-part4.md'].map((n) => trim(read(n)));
const doc = parts.join(NL + NL) + NL;
fs.writeFileSync(OUT, doc, 'utf8');
const buf = fs.readFileSync(OUT);
const lines = doc.split(NL);

let fence = false;
const heads = [];
const badTables = [];
let tableCols = -1;
const cells = (l) => { let n = 0; for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '|') n++; } return n; };
for (const l of lines) {
  if (/^```/.test(l)) { fence = !fence; tableCols = -1; continue; }
  if (fence) continue;
  if (/^#{1,6} /.test(l)) heads.push(l);
  if (l.startsWith('|')) { const c = cells(l); if (tableCols < 0) tableCols = c; else if (c !== tableCols) badTables.push(l.slice(0, 100)); } else tableCols = -1;
}
const text = doc;
const checks = {
  'D3 heading': text.includes('### 3.1 D3'),
  'D4 heading': text.includes('### 3.2 D4'),
  'D10 heading': text.includes('### 3.3 D10'),
  'D12 heading': text.includes('### 3.4 D12'),
  'D14 heading': text.includes('### 3.5 D14'),
  'D15 heading': text.includes('### 3.6 D15'),
  'formula': text.includes('clamp(120s + 1.0ms × 源码字节数, 5min, 45min)'),
  '256': text.includes('256 条'),
  '64 MB': text.includes('64 MB'),
  '64 KB': text.includes('64 KB'),
  'D10 gate': text.includes('?obTest=1'),
  'D14 root': text.includes('D:\\P47RUN\\<run>'),
  'no TEMP root statement': text.includes('不得继续将 TEMP 目录当作正式运行根目录'),
  'stage 0': text.includes('### 15.1 阶段零'),
  'stage 3': text.includes('### 15.2 阶段三'),
  'stage 1': text.includes('### 15.3 阶段一'),
  'stage 2': text.includes('### 15.4 阶段二'),
  'stage 4': text.includes('### 15.5 阶段四'),
  'stage 5': text.includes('### 15.6 阶段五'),
  'stage 6': text.includes('### 15.7 阶段六'),
  'gate P': text.includes('### 15.8 提升闸门 P'),
  'R stats': text.includes('17') && text.includes('8') && text.includes('R01'),
  'self-check': text.includes('## 二十、文档层自检'),
};
console.log('written ' + OUT);
console.log('bytes=' + buf.length + ' chars=' + doc.length + ' lines=' + lines.length + ' sha256=' + sha(buf));
console.log('BOM=' + (buf[0] === 0xef) + ' CR=' + (doc.split('\r').length - 1) + ' fencesBalanced=' + (!fence) + ' badTableRows=' + badTables.length);
for (const b of badTables.slice(0, 10)) console.log('  BAD ' + b);
console.log('h1=' + heads.filter((h) => /^# /.test(h)).length + ' h2=' + heads.filter((h) => /^## /.test(h)).length + ' h3=' + heads.filter((h) => /^### /.test(h)).length);
console.log('h2 list:');
for (const h of heads.filter((x) => /^## /.test(x))) console.log('  ' + h);
console.log('checks:');
for (const [k, v] of Object.entries(checks)) console.log('  ' + (v ? 'OK  ' : 'MISS') + ' ' + k);
