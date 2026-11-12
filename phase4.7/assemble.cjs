'use strict';
// Assembles the rebuilt plan from its parts. Writes only into the plan directory (outside the project). Reads nothing from the project.
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const OUT = DIR + '/PHASE4.7-WORKER-REMEDIATION-PLAN.rebuilt.md';
const NL = '\n';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (n) => fs.readFileSync(DIR + '/' + n, 'utf8');
const trim = (s) => s.replace(/^\n+/, '').replace(/\n+$/, '');

const original = read('PHASE4.7-WORKER-REMEDIATION-PLAN.original-recovered.md');
const BEGIN = '<!-- BEGIN ORIGINAL (verbatim) -->';
const END = '<!-- END ORIGINAL (verbatim) -->';
const appendixA = [
  '## 附录 A：恢复的原始方案（逐字）',
  '',
  '下面两条标记之间的内容，是 2026-11-11 09:28 至 09:45 输出在对话里的原始方案，一个字符都没有改。它自带一级标题和章节编号，那些标题属于原文，不属于本文的章节结构。',
  '',
  '核对方法：取两条标记行之间的全部行，用单个 LF 连接，末尾不加换行，按 UTF-8 编码后取 SHA-256，应当等于 `' + sha(Buffer.from(original, 'utf8')) + '`，即同目录 `PHASE4.7-WORKER-REMEDIATION-PLAN.original-recovered.md` 的哈希。',
  '',
  BEGIN,
  original,
  END,
].join(NL);

const pieces = [trim(read('part-1.md')), trim(read('part-2.md')), trim(read('part-3.md')), trim(read('part-4.md')), appendixA, trim(read('part-appendix-b.md')), trim(read('part-appendix-c.md'))];
const doc = pieces.join(NL + NL) + NL;
fs.writeFileSync(OUT, doc, 'utf8');
const buf = fs.readFileSync(OUT);

// ---- mechanical checks ----
const lines = doc.split(NL);
const b = lines.indexOf(BEGIN); const e = lines.indexOf(END);
const embedded = lines.slice(b + 1, e).join(NL);
console.log('written ' + OUT);
console.log('bytes=' + buf.length + ' chars=' + doc.length + ' lines=' + lines.length + ' sha256=' + sha(buf));
console.log('embedded original identical to recovered file: ' + (embedded === original) + ' (sha256 ' + sha(Buffer.from(embedded, 'utf8')) + ')');
console.log('BOM present: ' + (buf[0] === 0xef && buf[1] === 0xbb) + ' ; CR characters: ' + (doc.split('\r').length - 1) + ' ; tab characters outside appendix: ' + (pieces.slice(0, 4).join('').split('\t').length - 1));

const own = lines.slice(0, b).concat(lines.slice(e + 1)); // everything except the embedded original
let fence = false; const heads = []; const tableIssues = []; const angle = [];
let tableCols = -1;
const cellsOf = (l) => { let n = 0; for (let i = 0; i < l.length; i++) { if (l[i] === '\\') { i++; continue; } if (l[i] === '|') n++; } return n; };
for (let i = 0; i < own.length; i++) {
  const l = own[i];
  if (/^```/.test(l)) { fence = !fence; tableCols = -1; continue; }
  if (fence) continue;
  if (/^#{1,6} /.test(l)) heads.push(l);
  if (l.startsWith('|')) { const c = cellsOf(l); if (tableCols < 0) tableCols = c; else if (c !== tableCols) tableIssues.push('cols ' + c + ' vs ' + tableCols + ': ' + l.slice(0, 90)); } else tableCols = -1;
  const noCode = l.replace(/`[^`]*`/g, '');
  const m = noCode.match(/<[A-Za-z\u4e00-\u9fff][^>\n]{0,40}>/g);
  if (m) angle.push((i + 1) + ': ' + m.join(' '));
}
console.log('code fences balanced: ' + (!fence));
console.log('table rows with inconsistent column count: ' + tableIssues.length); for (const t of tableIssues.slice(0, 12)) console.log('   ' + t);
console.log('angle-bracket tokens outside code spans (would render as HTML): ' + angle.length); for (const a of angle.slice(0, 20)) console.log('   ' + a);
const h1 = heads.filter((h) => /^# /.test(h)); const h2 = heads.filter((h) => /^## /.test(h));
console.log('own headings: h1=' + h1.length + ' h2=' + h2.length + ' h3=' + heads.filter((h) => /^### /.test(h)).length);
for (const h of h2) console.log('   ' + h);
const text = own.join(NL);
const need = [];
for (let i = 1; i <= 16; i++) need.push('### D' + i + (i >= 11 ? '（新增）' : '') + '：');
for (const s of ['### 10.1 阶段零', '### 10.2 阶段三', '### 10.3 阶段一', '### 10.4 阶段二', '### 10.5 阶段四', '### 10.6 阶段五', '### 10.7 阶段六', '### 10.8 提升闸门 P']) need.push(s);
for (let i = 1; i <= 8; i++) need.push('| GU-' + i + ' |');
for (let i = 1; i <= 12; i++) need.push('| G0-' + i + ' |');
for (let i = 1; i <= 9; i++) need.push('| G3-' + i + ' |');
for (let i = 1; i <= 6; i++) need.push('| G1-' + i + ' |');
for (let i = 1; i <= 6; i++) need.push('| G2-' + i + ' |');
for (let i = 1; i <= 9; i++) need.push('| G4-' + i + ' |');
for (let i = 1; i <= 5; i++) need.push('| G5-' + i + ' |');
for (let i = 1; i <= 5; i++) need.push('| G6-' + i + ' |');
const missing = need.filter((s) => text.indexOf(s) < 0);
console.log('required anchors checked=' + need.length + ' missing=' + missing.length + (missing.length ? ' -> ' + missing.join(' ; ') : ''));
const stageFields = ['问题根因', '涉及文件', '可能影响的其他模块', '新增或修改的测试', '验收标准', '前置依赖', '回滚方案'];
for (const f of stageFields) console.log('   stage field "' + f + '" occurrences=' + (text.split('**' + f).length - 1));
const third = ['**工作内容', '**预期修改内容', '**固定顺序'];
console.log('   stage field 3 (work content / expected changes / fixed order) occurrences=' + third.reduce((n, f) => n + (text.split(f).length - 1), 0));
const dFields = ['原始问题', '推荐方案', '理由', '风险', '是否需要批准'];
for (const f of dFields) console.log('   decision field "' + f + '" occurrences=' + (text.split('- **' + f + '：**').length - 1));
