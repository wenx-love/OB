'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const OUT = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN-V3-CANDIDATE.md';
const NL = '\n';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (n) => fs.readFileSync(DIR + '/' + n, 'utf8');
const trim = (s) => s.replace(/^\n+/, '').replace(/\n+$/, '');
const parts = ['v3-part1.md', 'v3-part2.md', 'v3-part3.md', 'v3-part4.md'].map((n) => trim(read(n)));
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
const needH2 = ['## 一、', '## 二、', '## 三、', '## 四、', '## 五、', '## 六、', '## 七、', '## 八、', '## 九、', '## 十、', '## 十一、', '## 十二、', '## 十三、', '## 十四、', '## 十五、', '## 十六、', '## 十七、', '## 十八、', '## 十九、', '## 二十、', '## 二十一、', '## 二十二、'];
const stageH = ['### 16.1 Phase 0', '### 16.2 Phase 3', '### 16.3 Phase 1', '### 16.4 Phase 2', '### 16.5 Phase 4', '### 16.6 Phase 5', '### 16.7 Phase 6', '### 16.8 提升闸门 P'];
const stageRows = ['| 1. 进入条件', '| 2. 实施内容', '| 3. 验证项目', '| 4. 通过标准', '| 5. 失败处理', '| 6. 回滚范围', '| 7. 输出证据', '| 8. 下一阶段准入'];
const stageCheck = stageH.map((h) => { const i = text.indexOf(h); const j = text.indexOf('\n### ', i + 1); const block = text.slice(i, j < 0 ? text.length : j); return { h, missing: stageRows.filter((r) => !block.includes(r)) }; });
const checks = {
  'E1': text.includes('### 4.1 E1'),
  'E2': text.includes('### 4.2 E2'),
  'E3': text.includes('### 4.3 E3'),
  'E4': text.includes('### 4.4 E4'),
  'E5': text.includes('### 4.5 E5'),
  'E6': text.includes('### 4.6 E6'),
  'N01 state table': text.includes('### 5.2 事件 × 逻辑状态 × 尝试状态'),
  'N02 gauges': text.includes('### 6.1 每个脚本一个 `currentState`'),
  'N03 DOM': text.includes('### 9.2 目标与 DOM 呈现的身份关联'),
  'N04 utf16': text.includes('sha256Utf16Le'),
  'N05 formulas': text.includes('frWrongValue + frOnIndeterminate + frNotInReference + frSourceMutation'),
  'N06 shared coordinator': text.includes('`decoder-analysis-coordinator`'),
  'N07 sidecar': text.includes('可信旁清单'),
  'N08 bidirectional': text.includes('### 14.2 双向校验'),
  'N09 rule': text.includes('阶段进入前，只要求“规则、范围、接口、必要决策”已批准'),
  'D3 256': text.includes('256 条'),
  'D3 64MB binary': text.includes('67,108,864'),
  'D3 64KB binary': text.includes('65,536'),
  'D4 formula': text.includes('clamp(120s + 1.0ms × UTF-8 字节数, 5min, 45min)'),
  'D10 nine fields': text.includes('九个字段'),
  'D14 root': text.includes('D:\\P47RUN\\<run>'),
  'D14 no TEMP': text.includes('不得把 TEMP 当正式运行根'),
  'R13 OPEN': text.includes('R13 保持 OPEN'),
  'R16 OPEN': text.includes('R16 保持 OPEN'),
  'R status table 4/19/2': text.includes('| CLOSED | 4 |') && text.includes('| PARTIAL | 19 |') && text.includes('| OPEN | 2 |'),
  'D9 deferred': text.includes('D9-deferred'),
  'no R13 closed claim': !text.includes('R13 已关闭'),
};
console.log('written ' + OUT);
console.log('bytes=' + buf.length + ' chars=' + doc.length + ' lines=' + lines.length + ' sha256=' + sha(buf));
console.log('BOM=' + (buf[0] === 0xef) + ' CR=' + (doc.split('\r').length - 1) + ' fencesBalanced=' + (!fence) + ' badTableRows=' + bad.length);
for (const b of bad.slice(0, 10)) console.log('  BAD ' + b);
console.log('h1=' + heads.filter((h) => /^# /.test(h)).length + ' h2=' + heads.filter((h) => /^## /.test(h)).length + ' h3=' + heads.filter((h) => /^### /.test(h)).length);
console.log('missing H2: ' + needH2.filter((h) => !text.includes(h)).join(',') || 'none');
console.log('stage 8-row:');
for (const s of stageCheck) console.log('  ' + s.h + ' missing=' + (s.missing.length ? s.missing.join(',') : 'none'));
console.log('checks:');
for (const [k, v] of Object.entries(checks)) console.log('  ' + (v ? 'OK  ' : 'MISS') + ' ' + k);
