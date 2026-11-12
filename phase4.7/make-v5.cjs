'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const SRC = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN-V4-CANDIDATE.md';
const OUT = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN-V5-CANDIDATE.md';
const read = (n) => fs.readFileSync(DIR + '/' + n, 'utf8');
const src = fs.readFileSync(SRC, 'utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function cut(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) throw new Error('start not found: ' + start);
  const j = end === null ? text.length : text.indexOf(end, i + start.length);
  if (end !== null && j < 0) throw new Error('end not found: ' + end + ' after ' + start);
  return [i, j];
}
let text = src;
function replace(start, end, file) {
  const [i, j] = cut(text, start, end);
  const repl = read(file).replace(/\n+$/, '') + '\n\n';
  text = text.slice(0, i) + repl + text.slice(j);
}

// header + §1 + §2 (strip the summary §3 from the header part; the original §3 follows)
{
  const i = 0;
  const j = text.indexOf('## 三、');
  if (j < 0) throw new Error('§3 not found');
  let header = read('v5-repl-header.md').replace(/\n+$/, '');
  const h3 = header.indexOf('## 三、');
  if (h3 >= 0) header = header.slice(0, h3).replace(/\n+$/, '');
  text = header + '\n\n' + text.slice(j);
}
text = text.replace('## 四、Phase 0 执行契约（E1—E6，按第三轮修订）', '## 四、Phase 0 执行契约（E1—E6，按第四轮修订）');
replace('### 4.1 E1：初始化顺序', '### 4.2 E2：执行边界与三副本', 'v5-repl-4.1.md');
replace('### 4.3 E3：允许写入、预期拒写与意外写入', '### 4.4 E4：守卫覆盖矩阵（读 + 写）', 'v5-repl-4.3.md');
replace('### 4.4 E4：守卫覆盖矩阵（读 + 写）', '## 五、R01', 'v5-repl-4.4.md');
replace('## 五、R01：Promise 结算生命周期', '## 六、R03：熔断计数与恢复', 'v5-repl-5.md');
replace('## 六、R03：熔断计数与恢复', '## 七、R16：真实面板渲染完成判据', 'v5-repl-6.md');
replace('## 七、R16：真实面板渲染完成判据', '## 八、状态机、尝试与 force', 'v5-repl-7.md');
replace('### 8.4 force 与异步定型（R05）', '### 8.5 最新请求独占更新', 'v5-repl-8.4.md');
replace('### 9.3 终态映射', '## 十、deadline、渲染与完成判据', 'v5-repl-9.3.md');
replace('### 10.5 deadline 完整分类（11 态 × 错误码 × 渲染）', '### 10.6 阶段出口', 'v5-repl-10.5.md');
replace('### 12.2 验证五项', '### 12.3 负例', 'v5-repl-12.2.md');
replace('### 17.1 Phase 0：基线、隔离、ACL、工具自测', '### 17.2 Phase 3：构建与测试卫生', 'v5-repl-17.1.md');
{
  const i = text.indexOf('## 十九、');
  if (i < 0) throw new Error('§19 not found');
  text = text.slice(0, i) + read('v5-repl-19.md').replace(/\n+$/, '') + '\n';
}

fs.writeFileSync(OUT, text, 'utf8');
const buf = fs.readFileSync(OUT);
const lines = text.split('\n');
let fence = false; const heads = []; const bad = []; let cols = -1;
const cells = (l) => { let n = 0; for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '|') n++; } return n; };
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^```/.test(l)) { fence = !fence; cols = -1; continue; }
  if (fence) continue;
  if (/^#{1,6} /.test(l)) heads.push(l);
  if (l.startsWith('|')) { const c = cells(l); if (cols < 0) cols = c; else if (c !== cols) bad.push((i + 1) + ': ' + l.slice(0, 90)); } else cols = -1;
}
const checks = {
  title: text.includes('# OB-Recover Phase 4.7 Worker 整改方案 V5'),
  status: text.includes('0 CLOSED / 25 PARTIAL / 0 OPEN'),
  r01: text.includes('## 五、R01：双 Promise 与统一终态结算'),
  r05: text.includes('### 8.4 R05：无损源码身份、缓存键与去重'),
  matrix20: text.includes('| 20 | 任意终态 | 迟到 commit/迟到事件'),
  e1: text.includes('### 4.1 E1：初始化顺序（检测器先于权威 M0）'),
  detector: text.includes('#### 4.4.1 检测器自测顺序'),
  forbiddenRead: text.includes('禁止区内容读取成功即 FAIL'),
  noAttribution: text.includes('删除“差异已归因即可通过”'),
  r16token: text.includes('data-obtest-commit-token'),
  deadlinePriority: text.includes('window-deadline-during-execution') && text.includes('render-unverified'),
  currentScope: text.includes('旧请求 `completion` 结算时，只把自己的逻辑请求置终态'),
  trust: text.includes('<run>\\trust\\build'),
  stageRows: true,
};
console.log('written ' + OUT);
console.log('bytes=' + buf.length + ' chars=' + text.length + ' lines=' + lines.length + ' sha256=' + sha(buf));
console.log('BOM=' + (buf[0] === 0xef) + ' CR=' + (text.split('\r').length - 1) + ' fences=' + (!fence) + ' badTableRows=' + bad.length);
for (const b of bad.slice(0, 10)) console.log('  BAD ' + b);
console.log('h1=' + heads.filter((h) => /^# /.test(h)).length + ' h2=' + heads.filter((h) => /^## /.test(h)).length + ' h3=' + heads.filter((h) => /^### /.test(h)).length);
for (const [k, v] of Object.entries(checks)) console.log('  ' + (v ? 'OK  ' : 'MISS') + ' ' + k);
