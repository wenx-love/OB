'use strict';
// Read-only comparison: current project content (MANIFEST-plan-node-full.tsv) versus two earlier full-project backups.
const fs = require('node:fs');
const crypto = require('node:crypto');
const DIR = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan';
const TAB = '\t';
const ord = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const cur = new Map();
for (const l of fs.readFileSync(DIR + '/MANIFEST-plan-node-full.tsv', 'utf8').split('\n')) {
  if (!l) continue;
  const p = l.split(TAB);
  if (p[0] === 'node_modules' || p[0].startsWith('node_modules/')) continue;
  cur.set(p[0], p[2]);
}
function walk(root, dir, out) {
  for (const n of fs.readdirSync(dir).sort(ord)) {
    const p = dir + '/' + n;
    const st = fs.lstatSync(p);
    if (st.isDirectory()) { walk(root, p, out); continue; }
    out.set(p.slice(root.length + 1), sha(fs.readFileSync(p)));
  }
}
const backups = [
  ['ob-backup-p47-perf-20261110', 'taken 11-10 21:37, before the Worker performance fix'],
  ['ob-backup-p47-offlinediag-20261110', 'taken 11-10 20:12, before the offline diagnosis and runner corrections'],
];
const lines = [];
for (const [name, note] of backups) {
  const root = 'C:/Users/Administrator/TEMP/opencode/' + name;
  if (!fs.existsSync(root)) { console.log(name + ': MISSING'); continue; }
  const bak = new Map();
  walk(root, root, bak);
  const changed = []; const added = []; const removed = []; let same = 0;
  for (const [k, v] of cur) { if (!bak.has(k)) added.push(k); else if (bak.get(k) !== v) changed.push(k); else same++; }
  for (const k of bak.keys()) if (!cur.has(k)) removed.push(k);
  console.log('== ' + name + ' (' + note + ') backupFiles=' + bak.size + ' currentFiles=' + cur.size);
  console.log('   identical=' + same + ' changed=' + changed.length + ' addedSince=' + added.length + ' removedSince=' + removed.length);
  const area = (k) => { const s = k.split('/'); if (s.length === 1) return '(root)'; if (s[0] === 'test' && s.length > 2) return s[0] + '/' + s[1]; return s[0]; };
  const by = (list) => { const m = new Map(); for (const k of list) m.set(area(k), (m.get(area(k)) || 0) + 1); return Array.from(m.entries()).sort((a, b) => ord(a[0], b[0])).map(([a, n]) => a + '=' + n).join(', ') || 'none'; };
  console.log('   changed by area: ' + by(changed));
  console.log('   added by area: ' + by(added));
  console.log('   removed by area: ' + by(removed));
  for (const k of changed) { console.log('     changed  ' + k); lines.push(name + TAB + 'changed' + TAB + k); }
  for (const k of added) { console.log('     added    ' + k); lines.push(name + TAB + 'added' + TAB + k); }
  for (const k of removed) { console.log('     removed  ' + k); lines.push(name + TAB + 'removed' + TAB + k); }
  const evid = (k) => k.startsWith('test/fixtures/real-ob-sites/') || k.startsWith('test/fixtures/real-ob/') || k.startsWith('test/fixtures/real-samples/');
  console.log('   evidence under test/fixtures/real-ob-sites, real-ob, real-samples: changed=' + changed.filter(evid).length + ' added=' + added.filter(evid).length + ' removed=' + removed.filter(evid).length);
  const acc = (k) => k.startsWith('test/acceptance/');
  console.log('   test/acceptance: changed=' + changed.filter(acc).length + ' added=' + added.filter(acc).length + ' removed=' + removed.filter(acc).length);
}
fs.writeFileSync(DIR + '/backup-compare.tsv', lines.join('\n') + '\n', 'utf8');
console.log('backup-compare.tsv sha256=' + sha(fs.readFileSync(DIR + '/backup-compare.tsv')));
