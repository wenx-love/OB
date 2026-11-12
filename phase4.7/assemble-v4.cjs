'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const OUT = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md';
const NL = '\n';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (n) => fs.readFileSync(DIR + '/' + n, 'utf8');
const trim = (s) => s.replace(/^\n+/, '').replace(/\n+$/, '');
const parts = ['v4-part1.md', 'v4-part2.md', 'v4-part3.md', 'v4-part4.md'].map((n) => trim(read(n)));
const doc = parts.join(NL + NL) + NL;
fs.writeFileSync(OUT, doc, 'utf8');
const buf = fs.readFileSync(OUT);
const lines = doc.split(NL);
let fence = false; const heads = []; const bad = []; let cols = -1;
const cells = (l) => { let n = 0; for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '|') n++; } return n; };
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^```/.test(l)) { fence = !fence; cols = -1; continue; }
  if (fence) continue;
  if (/^#{1,6} /.test(l)) heads.push(l);
  if (l.startsWith('|')) { const c = cells(l); if (cols < 0) cols = c; else if (c !== cols) bad.push((i + 1) + ': ' + l.slice(0, 90)); } else cols = -1;
}
const text = doc;
const stageH = ['### 17.1 Phase 0', '### 17.2 Phase 3', '### 17.3 Phase 1', '### 17.4 Phase 2', '### 17.5 Phase 4', '### 17.6 Phase 5', '### 17.7 Phase 6', '### 17.8 提升闸门 P'];
const stageRows = ['| 1. 进入条件', '| 2. 实施内容', '| 3. 验证项目', '| 4. 通过标准', '| 5. 失败处理', '| 6. 回滚范围', '| 7. 输出证据', '| 8. 下一阶段准入'];
const stageCheck = stageH.map((h) => { const i = text.indexOf(h); const j = text.indexOf('\n### ', i + 1); const block = text.slice(i, j < 0 ? text.length : j); return { h, missing: stageRows.filter((r) => !block.includes(r)) }; });
const checks = {
  'R01 section': text.includes('## 五、R01'),
  'R03 section': text.includes('## 六、R03'),
  'R16 section': text.includes('## 七、R16'),
  'resultReady': text.includes('resultReady'),
  'completion': text.includes('`completion`'),
  'commit timeout': text.includes('COMMIT_ACK_TIMEOUT_MS'),
  'health reply': text.includes('健康运行的定义'),
  'creation no reset': text.includes('构造成功不改变计数') || text.includes('构造成功不改变'),
  'DOM attrs': text.includes('data-obtest-request-seq'),
  'render states': text.includes('render-completed') && text.includes('render-partial') && text.includes('render-timeout'),
  'E3 no attribution pass': text.includes('删除“差异已归因即可通过”'),
  'E4 read matrix': text.includes('普通读 API') && text.includes('已开 FD/FileHandle'),
  'E4 no chrome': text.includes('Phase 0 不启动 Chrome'),
  'R status 11/14/0': text.includes('| CLOSED | 11 |') && text.includes('| PARTIAL | 14 |') && text.includes('| OPEN | 0 |'),
  'R01 partial': text.includes('R01、R03、R16 从 OPEN 降为 PARTIAL'),
  'D3 64MiB': text.includes('64 MiB') && text.includes('67,108,864'),
  'D4 formula': text.includes('clamp(120s + 1.0ms × UTF-8 字节数, 5min, 45min)'),
  'D10 nine': text.includes('九个元数据字段'),
  'D14 root': text.includes('D:\\P47RUN\\<run>'),
  'deadline table': text.includes('11 态 × 错误码 × 渲染'),
  'schemas': text.includes('DiscoveryResultV1') && text.includes('CommittedCandidateSetV1'),
  'bundle rerun': text.includes('最终树 bundle 哈希'),
};
console.log('written ' + OUT);
console.log('bytes=' + buf.length + ' chars=' + doc.length + ' lines=' + lines.length + ' sha256=' + sha(buf));
console.log('BOM=' + (buf[0] === 0xef) + ' CR=' + (doc.split('\r').length - 1) + ' fencesBalanced=' + (!fence) + ' badTableRows=' + bad.length);
for (const b of bad.slice(0, 10)) console.log('  BAD ' + b);
console.log('h1=' + heads.filter((h) => /^# /.test(h)).length + ' h2=' + heads.filter((h) => /^## /.test(h)).length + ' h3=' + heads.filter((h) => /^### /.test(h)).length);
console.log('stage 8-row:');
for (const s of stageCheck) console.log('  ' + s.h + ' missing=' + (s.missing.length ? s.missing.join(',') : 'none'));
console.log('checks:');
for (const [k, v] of Object.entries(checks)) console.log('  ' + (v ? 'OK  ' : 'MISS') + ' ' + k);
