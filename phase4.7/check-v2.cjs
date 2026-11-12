'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const V2 = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN-V2-CANDIDATE.md';
const TR = DIR + '/PHASE4.7-V2-CODEX-FINDINGS-TRACEABILITY.md';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(p, 'utf8');
const v2 = read(V2);
const tr = read(TR);

function tableCheck(text, name) {
  const lines = text.split('\n');
  let fence = false; let cols = -1; const bad = [];
  const cells = (l) => { let n = 0; for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '|') n++; } return n; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) { fence = !fence; cols = -1; continue; }
    if (fence) continue;
    if (l.startsWith('|')) { const c = cells(l); if (cols < 0) cols = c; else if (c !== cols) bad.push((i + 1) + ': ' + l.slice(0, 90)); } else cols = -1;
  }
  return bad;
}

const v2Bad = tableCheck(v2, 'V2');
const trBad = tableCheck(tr, 'TR');
const rIds = Array.from(tr.matchAll(/^\| (R\d{2}) \|/gm)).map((m) => m[1]);
const rUnique = new Set(rIds);
const statusCell = Array.from(tr.matchAll(/^\| (R\d{2}) \|.*\| (CLOSED|PARTIAL|OPEN)[^|]*\|$/gm)).map((m) => [m[1], m[2]]);
const statusMap = new Map(statusCell);
const closed = statusCell.filter(([, s]) => s === 'CLOSED').length;
const partial = statusCell.filter(([, s]) => s === 'PARTIAL').length;
const open = statusCell.filter(([, s]) => s === 'OPEN').length;

const stages = ['### 15.1 阶段零', '### 15.2 阶段三', '### 15.3 阶段一', '### 15.4 阶段二', '### 15.5 阶段四', '### 15.6 阶段五', '### 15.7 阶段六', '### 15.8 提升闸门 P'];
const stageRows = ['| 1. 进入条件', '| 2. 修改范围', '| 3. 禁止事项', '| 4. 测试方法', '| 5. 量化验收条件', '| 6. 证据产物', '| 7. 回滚方法', '| 8.'];
const stageReport = stages.map((h) => {
  const i = v2.indexOf(h);
  const next = v2.indexOf('\n### ', i + 1);
  const block = v2.slice(i, next < 0 ? v2.length : next);
  const missing = stageRows.filter((r) => !block.includes(r));
  return { h, missing };
});

const checks = {
  'D3 256': v2.includes('256 条'),
  'D3 64MB': v2.includes('64 MB'),
  'D3 64KB': v2.includes('64 KB'),
  'D3 deferred': v2.includes('`deferred`'),
  'D3 no silent drop': v2.includes('禁止静默丢弃'),
  'D4 formula': v2.includes('clamp(120s + 1.0ms × 源码字节数, 5min, 45min)'),
  'D4 retry once': v2.includes('自动重试 1 次'),
  'D4 50%': v2.includes('50%'),
  'D10 gate': v2.includes('?obTest=1'),
  'D10 no source': v2.includes('不返回源码'),
  'D12 inverse': v2.includes('逆映射'),
  'D12 collision': v2.includes('碰撞'),
  'D12 dist abs': v2.includes('不得出现工作副本绝对路径'),
  'D12 stamp': v2.includes('只记录**输入哈希 + Vite 版本**') || v2.includes('只记录输入哈希与 Vite 版本'),
  'D14 root': v2.includes('D:\\P47RUN\\<run>'),
  'D14 no TEMP': v2.includes('不得继续将 TEMP 目录当作正式运行根目录'),
  'D14 ACL': v2.includes('关闭继承'),
  'D14 readback': v2.includes('读回'),
  'D14 fallback': v2.includes('位置不可信'),
  'D15 window': v2.includes('静默窗口'),
  'D15 no attribution': v2.includes('不得把无法确定来源的文件变化归因于某个具体主体') || v2.includes('source-unknown'),
  'state machine': v2.includes('每个逻辑请求恰好结算一次'),
  'cancel protocol': v2.includes('cancelling = true'),
  'breaker': v2.includes('熔断'),
  'cache key': v2.includes('cacheKey'),
  'analyzed=committed': v2.includes('`analyzed` 的唯一含义'),
  'late event': v2.includes('collectorEpoch'),
  'priority': v2.includes('运行层结论（互斥，按优先级从高到低）'),
  'D10 forensics': v2.includes('独立测试取证'),
  'evidence': v2.includes('历史证据'),
  'metrics': v2.includes('False Replacement') && v2.includes('Safe Rejection Rate'),
  'stage order': v2.includes('0 → 3 → 1 → 2 → 4 → 5 → 6 → 提升闸门 P'),
  'self-check': v2.includes('## 二十、文档层自检'),
  'UNVERIFIED section': v2.includes('### 18.2'),
};

console.log('V2: bytes=' + Buffer.byteLength(v2) + ' lines=' + v2.split('\n').length + ' sha256=' + sha(v2));
console.log('TR: bytes=' + Buffer.byteLength(tr) + ' lines=' + tr.split('\n').length + ' sha256=' + sha(tr));
console.log('bad table rows: V2=' + v2Bad.length + ' TR=' + trBad.length);
for (const b of v2Bad.slice(0, 5)) console.log('  V2 ' + b);
for (const b of trBad.slice(0, 5)) console.log('  TR ' + b);
console.log('R ids: found=' + rIds.length + ' unique=' + rUnique.size + ' missing=' + ['R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11','R12','R13','R14','R15','R16','R17','R18','R19','R20','R21','R22','R23','R24','R25'].filter((x) => !rUnique.has(x)).join(','));
console.log('R status: CLOSED=' + closed + ' PARTIAL=' + partial + ' OPEN=' + open + ' total=' + (closed + partial + open));
console.log('stage 8-row check:');
for (const s of stageReport) console.log('  ' + s.h + ' missing=' + (s.missing.length ? s.missing.join(',') : 'none'));
console.log('decision checks:');
for (const [k, v] of Object.entries(checks)) console.log('  ' + (v ? 'OK  ' : 'MISS') + ' ' + k);
