'use strict';
// Read-only on the project. Writes only into the plan directory (outside the project).
// Purpose: (1) hash every file with a second, independent implementation (Node crypto) and cross-check the PowerShell manifest;
//          (2) compute directory digests with a culture-independent ordering; (3) emit appendix B and C of the plan.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = 'D:/Projects/ob-recover';
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const TAG = process.argv[2] || 'plan';
const BT = String.fromCharCode(96);
const TAB = '\t';
const NL = '\n';
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const ord = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const code = (s) => BT + String(s) + BT;
const cell = (s) => String(s).split('|').join('\\|');

function walk(dir, out) {
  const names = fs.readdirSync(dir).sort(ord);
  for (const n of names) {
    const p = dir + '/' + n;
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) { out.links.push(p.slice(ROOT.length + 1)); continue; }
    if (st.isDirectory()) { out.dirs.push(p.slice(ROOT.length + 1)); walk(p, out); continue; }
    const buf = fs.readFileSync(p);
    out.files.push({ rel: p.slice(ROOT.length + 1), size: buf.length, sha: sha(buf) });
  }
}

const tree = { files: [], dirs: [], links: [] };
const t0 = Date.now();
walk(ROOT, tree);
const files = tree.files.sort((a, b) => ord(a.rel, b.rel));
const isNm = (f) => f.rel === 'node_modules' || f.rel.startsWith('node_modules/');
const proj = files.filter((f) => !isNm(f));

// cross-check against the PowerShell manifest (Get-FileHash)
const psLines = fs.readFileSync(DIR + '/selfcheck-before.tsv', 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const ps = new Map();
for (const l of psLines) { const p = l.split(TAB); ps.set(p[0].split('\\').join('/'), { size: Number(p[1]), sha: p[4] }); }
let shaMismatch = 0; let sizeMismatch = 0; let missingInPs = 0; let missingInNode = 0;
const projSet = new Set(proj.map((f) => f.rel));
for (const f of proj) { const q = ps.get(f.rel); if (!q) { missingInPs++; continue; } if (q.sha !== f.sha) shaMismatch++; if (q.size !== f.size) sizeMismatch++; }
for (const k of ps.keys()) if (!projSet.has(k)) missingInNode++;

const digest = (list) => sha(Buffer.from(list.map((f) => f.rel + TAB + f.sha).join(NL), 'utf8'));
const under = (prefix) => (f) => f.rel === prefix || f.rel.startsWith(prefix + '/');
const sum = (list) => list.reduce((n, f) => n + f.size, 0);

const groups = [
  ['dist', under('dist')],
  ['src', under('src')],
  ['scripts', under('scripts')],
  ['docs', under('docs')],
  ['test-pages', under('test-pages')],
  ['test-output', under('test-output')],
  ['test/acceptance', under('test/acceptance')],
  ['test/fixtures', under('test/fixtures')],
  ['test/fixtures/real-ob-sites', under('test/fixtures/real-ob-sites')],
  ['test/fixtures/real-ob-sites/l1-qccqcc-hangzhou', under('test/fixtures/real-ob-sites/l1-qccqcc-hangzhou')],
  ['test/fixtures/real-ob-sites/l2-real-ob-seed', under('test/fixtures/real-ob-sites/l2-real-ob-seed')],
  ['test/fixtures/real-ob-sites/l3-controlled-scenarios', under('test/fixtures/real-ob-sites/l3-controlled-scenarios')],
  ['test/fixtures/real-ob-sites/l3-browser-replay', under('test/fixtures/real-ob-sites/l3-browser-replay')],
  ['test/fixtures/real-ob', under('test/fixtures/real-ob')],
  ['test/fixtures/real-samples', under('test/fixtures/real-samples')],
  ['test (code only: not acceptance, not fixtures)', (f) => f.rel.startsWith('test/') && !f.rel.startsWith('test/acceptance/') && !f.rel.startsWith('test/fixtures/')],
  ['root-level files', (f) => f.rel.indexOf('/') < 0],
  ['PROJECT (everything except node_modules)', (f) => !isNm(f)],
  ['node_modules', isNm],
  ['WHOLE TREE (including node_modules)', () => true],
];
const groupRows = groups.map(([name, pred]) => { const l = files.filter(pred); return { name, n: l.length, bytes: sum(l), digest: digest(l) }; });

// full manifest (every file, node_modules included)
const full = files.map((f) => f.rel + TAB + f.size + TAB + f.sha);
fs.writeFileSync(DIR + '/MANIFEST-' + TAG + '-node-full.tsv', full.join(NL) + NL, { encoding: 'utf8', flag: TAG === 'plan' ? 'wx' : 'w' });
const fullSha = sha(fs.readFileSync(DIR + '/MANIFEST-' + TAG + '-node-full.tsv'));

console.log('tag=' + TAG + ' files=' + files.length + ' (project=' + proj.length + ' node_modules=' + (files.length - proj.length) + ') dirs=' + tree.dirs.length + ' symlinks=' + tree.links.length + ' ms=' + (Date.now() - t0));
console.log('cross-check Node crypto vs PowerShell Get-FileHash on project files: shaMismatch=' + shaMismatch + ' sizeMismatch=' + sizeMismatch + ' missingInPowerShell=' + missingInPs + ' missingInNode=' + missingInNode);
console.log('full manifest sha256=' + fullSha);
for (const g of groupRows) console.log('  ' + g.name + ' | files=' + g.n + ' | bytes=' + g.bytes + ' | ' + g.digest);
if (TAG !== 'plan') process.exit(0);

// ---------- appendix B ----------
const pick = (prefix) => files.filter(under(prefix));
const one = (rel) => files.filter((f) => f.rel === rel);
const sections = [
  ['B.2 L1 历史证据（test/fixtures/real-ob-sites/l1-qccqcc-hangzhou，全部 ' + pick('test/fixtures/real-ob-sites/l1-qccqcc-hangzhou').length + ' 个文件）', pick('test/fixtures/real-ob-sites/l1-qccqcc-hangzhou')],
  ['B.3 样本登记表', one('test/fixtures/real-ob-sites/registry.json')],
  ['B.4 L2 历史证据（l2-real-ob-seed，全部文件）与 L2 输入', pick('test/fixtures/real-ob-sites/l2-real-ob-seed').concat(pick('test/fixtures/real-ob'), one('test/acceptance/devtools-real-ob-e2e.json'), one('test/acceptance/devtools-real-ob-e2e-medium.json'))],
  ['B.5 L3 历史证据（l3-controlled-scenarios 与 l3-browser-replay，全部文件）', pick('test/fixtures/real-ob-sites/l3-controlled-scenarios').concat(pick('test/fixtures/real-ob-sites/l3-browser-replay'))],
  ['B.6 L3 输入（测试按固定路径读取）', ['test/acceptance/p47-l3-browser-replay.json', 'test/acceptance/p47-l3-browser-replay-panel.png', 'test/acceptance/p47-l3-coverage-control.json', 'test/acceptance/p47-l3-coverage-control.run1-ws-closed-no-data.json', 'test/acceptance/p47-l3-decoder-count-diag.json', 'test-pages/real-site-l3-same-text.html', 'test-pages/real-site-l3-same-text.js'].flatMap(one)],
  ['B.7 完整 dist（全部 ' + pick('dist').length + ' 个文件）', pick('dist')],
  ['B.8 受保护模块与相关文件', ['src/core/decoder-discovery.ts', 'src/core/parser.ts', 'src/core/capture-validation.ts', 'src/core/capture-plan.ts', 'src/core/verified-replacer.ts', 'src/core/replacement-dryrun.ts', 'src/core/hash-utils.ts', 'src/extension/debugger/capture-engine.ts'].flatMap(one)],
  ['B.9 配置、锁文件与本轮整改涉及的源码现状', ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'src/extension/manifest.json', 'src/extension/background.ts', 'src/extension/debugger/script-collector.ts', 'src/extension/devtools/panel.ts', 'src/extension/devtools/panel.html', 'src/extension/devtools/decoder-analysis-client.ts', 'src/extension/workers/decoder-analysis.worker.ts', 'test/helpers/real-site-compare.ts', 'test/real-site-l2.test.ts', 'test/real-site-l3.test.ts', 'test/real-site-l3-browser.test.ts', 'test/decoder-analysis-queue.test.ts', 'test/decoder-analysis-consistency.test.ts', 'test/p47-l1-run-order.test.ts', 'test/fixtures/p47-512kb-synthetic.js', 'scripts/p47-l1-ob-run.ts', 'scripts/p47-panel-perf-verify.ts', 'scripts/p47-worker-exec-verify.ts', 'scripts/p47-offline-connect-diag.ts'].flatMap(one)],
];
const md = [];
md.push('## 附录 B：证据与产物不变量清单（规划时刻快照）');
md.push('');
md.push('快照时刻：2026-11-11 规划轮（T-plan），由 ' + code('gen-appendix.cjs') + ' 只读生成。它不是阶段零的正式基线：阶段零开工时必须重新生成并与本表逐项比对，任何差异先解释再继续。');
md.push('');
md.push('**哈希实现交叉校验：** 本表用 Node ' + process.version + ' 的 ' + code('node:crypto') + ' 计算；项目内 ' + proj.length + ' 个文件同时有 PowerShell ' + code('Get-FileHash') + ' 的结果（' + code('selfcheck-before.tsv') + '）。两套实现比对：哈希不一致 ' + shaMismatch + ' 个，大小不一致 ' + sizeMismatch + ' 个，任一侧缺失 ' + (missingInPs + missingInNode) + ' 个。');
md.push('');
md.push('**目录摘要的定义（可独立复算）：** 取目录下全部文件，相对路径用正斜杠；按 UTF-16 码元顺序升序排列（即 JavaScript 默认字符串比较，不做大小写折叠，不受区域设置影响）；每行写成 ' + code('相对路径<TAB>文件的 SHA-256 小写十六进制') + '；各行用单个 LF 连接，末尾不加换行；按 UTF-8 编码后取 SHA-256。上一轮对话里用 PowerShell 默认排序算过的目录摘要与此排序不同，以本表为准。');
md.push('');
md.push('逐文件的完整清单（含 node_modules，共 ' + files.length + ' 行）在同目录的 ' + code('MANIFEST-plan-node-full.tsv') + '，其 SHA-256 为 ' + code(fullSha) + '。');
md.push('');
md.push('### B.1 目录摘要');
md.push('');
md.push('| 范围 | 文件数 | 字节数 | 目录摘要（SHA-256） |');
md.push('|---|---|---|---|');
for (const g of groupRows) md.push('| ' + code(g.name) + ' | ' + g.n + ' | ' + g.bytes + ' | ' + code(g.digest) + ' |');
md.push('');
for (const [title, list] of sections) {
  md.push('### ' + title);
  md.push('');
  md.push('| 文件 | 字节数 | SHA-256 |');
  md.push('|---|---|---|');
  for (const f of list) md.push('| ' + code(f.rel) + ' | ' + f.size + ' | ' + code(f.sha) + ' |');
  md.push('');
}
fs.writeFileSync(DIR + '/part-appendix-b.md', md.join(NL) + NL, 'utf8');

// ---------- appendix C ----------
const annex = fs.readFileSync(DIR + '/ANNEX-script-write-paths.tsv', 'utf8').split(/\r?\n/).filter((l) => l.length > 0).slice(1).map((l) => { const p = l.split(TAB); return { file: p[0].split('\\').join('/'), api: p[1], cls: p[4] }; });
const short = { 'project:test/acceptance': '项目 test/acceptance', 'project:test/fixtures': '项目 test/fixtures', 'project:dist': '项目 dist', 'project:other': '项目其他', TEMP: 'TEMP', 'cwd-relative-or-dynamic': '相对路径或运行时决定' };
const codeFiles = files.filter((f) => (f.rel.startsWith('scripts/') || f.rel.indexOf('/') < 0) && /\.(ts|cjs|mjs|js)$/.test(f.rel) && f.rel !== 'vite.config.ts');
const rows = [];
for (const f of codeFiles) {
  const text = fs.readFileSync(ROOT + '/' + f.rel, 'utf8');
  const rootN = (text.match(/D:[/\\]+Projects[/\\]+ob-recover/g) || []).length;
  const tempN = (text.match(/C:[/\\]+Users[/\\]+Administrator[/\\]+TEMP/g) || []).length;
  const vars = new Map();
  const re = /^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(.+?);\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) if (!vars.has(m[1])) vars.set(m[1], m[2]);
  const expand = (e) => {
    let s = e;
    for (let i = 0; i < 6; i++) {
      let changed = false;
      for (const [k, v] of vars) {
        if (v.length > 200) continue;
        const r = new RegExp('(?<![A-Za-z0-9_.$])' + k + '(?![A-Za-z0-9_$])', 'g');
        const next = s.replace(r, () => v);
        if (next !== s) { s = next; changed = true; }
      }
      if (!changed) break;
    }
    return s;
  };
  let outVar = ['OUT', 'OUT_FILE', 'OUTPUT', 'OUT_DIR'].find((k) => vars.has(k));
  let out = outVar ? expand(vars.get(outVar)) : '';
  if (out.length > 150) out = out.slice(0, 150) + '…';
  const profile = vars.has('PROFILE') ? expand(vars.get('PROFILE')).split('C:/Users/Administrator/TEMP/opencode/').join('<TEMP>/') : '';
  const ports = []; const pr = /^const (?:PORT|HTTP|HTTP_PORT|CDP_PORT)\s*=\s*(\d+)/gm; while ((m = pr.exec(text)) !== null) ports.push(m[1]);
  const mine = annex.filter((a) => a.file === f.rel);
  const counts = new Map();
  for (const a of mine) { if (a.api === 'mkdirSync') continue; const k = (a.api === 'rmSync' ? '删除→' : '写入→') + (short[a.cls] || a.cls); counts.set(k, (counts.get(k) || 0) + 1); }
  const cls = Array.from(counts.entries()).map(([k, v]) => k + '×' + v).join('；') || '无写入调用';
  rows.push({ rel: f.rel, rootN, tempN, cls, out, profile, wx: text.indexOf("'wx'") >= 0, ports: ports.join(','), env: /process\.env\.(DIST_OVERRIDE|P47_[A-Z_]+)/.test(text) });
}
const mc = [];
mc.push('## 附录 C：脚本硬编码路径清单（逐文件）');
mc.push('');
mc.push('范围：' + code('scripts/') + ' 下全部 ' + rows.filter((r) => r.rel.startsWith('scripts/')).length + ' 个文件，加项目根目录下的 ' + rows.filter((r) => r.rel.indexOf('/') < 0).length + ' 个零散代码文件。由 ' + code('gen-appendix.cjs') + ' 对源码做文本解析得到，逐调用的长表在同目录的 ' + code('ANNEX-script-write-paths.tsv') + '（166 行）。');
mc.push('');
mc.push('读法：“根”是文件里出现 ' + code('D:/Projects/ob-recover') + ' 字面量的次数；“TEMP”是出现 ' + code('C:/Users/Administrator/TEMP') + ' 字面量的次数；“独占”为“是”表示输出文件用 ' + code("flag: 'wx'") + ' 创建、已存在即拒绝，“否”表示同名直接覆盖；“可覆盖路径”为“是”表示存在把输出或 dist 指到别处的环境变量。统计不含 ' + code('mkdirSync') + '。');
mc.push('');
mc.push('“输出路径表达式”一列是把脚本里的输出变量按常量定义做文本展开的结果，只用来看路径指向哪里：展开时省略了括号，不能当作可求值的表达式；超过 150 个字符的在末尾截断；一个脚本有多个输出时只显示主输出变量。完整的逐调用展开在 ' + code('ANNEX-script-write-paths.tsv') + '。');
mc.push('');
mc.push('| 文件 | 根 | TEMP | 写入与删除的去向 | 输出路径表达式 | 浏览器 profile | 独占 | 固定端口 | 可覆盖路径 |');
mc.push('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) mc.push('| ' + code(r.rel) + ' | ' + r.rootN + ' | ' + r.tempN + ' | ' + cell(r.cls) + ' | ' + (r.out ? code(cell(r.out)) : '—') + ' | ' + (r.profile ? code(cell(r.profile)) : '—') + ' | ' + (r.wx ? '是' : '否') + ' | ' + (r.ports || '—') + ' | ' + (r.env ? '是' : '否') + ' |');
mc.push('');
fs.writeFileSync(DIR + '/part-appendix-c.md', mc.join(NL) + NL, 'utf8');
console.log('appendix B lines=' + md.length + ' ; appendix C rows=' + rows.length + ' (scripts=' + rows.filter((r) => r.rel.startsWith('scripts/')).length + ', root=' + rows.filter((r) => r.rel.indexOf('/') < 0).length + ')');
console.log('appendix C: files with root literal=' + rows.filter((r) => r.rootN > 0).length + ' ; with fixed PROFILE=' + rows.filter((r) => r.profile).length + ' ; exclusive=' + rows.filter((r) => r.wx).length + ' ; with path override env=' + rows.filter((r) => r.env).length);
