const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Administrator/.local/share/opencode/opencode.db', { readOnly: true });
const fmt = (ms) => { const d = new Date(Number(ms)); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
const needles = ['调查结论与分阶段计划', 'p47-consistency-verify.ts', 'decoder-analysis-coordinator.ts'];
for (const table of ['part', 'session_message', 'message']) {
  for (const n of needles) {
    let rows = [];
    try { rows = db.prepare('SELECT id, session_id, time_created, time_updated, length(data) AS len, substr(data, 1, 160) AS head FROM "' + table + '" WHERE instr(data, ?) > 0 ORDER BY time_created').all(n); } catch (e) { console.log(table + ' [' + n + '] QUERY FAILED: ' + e.message); continue; }
    console.log(table + ' [' + n + '] rows=' + rows.length);
    for (const r of rows) console.log('   id=' + r.id + ' session=' + r.session_id + ' created=' + fmt(r.time_created) + ' updated=' + fmt(r.time_updated) + ' len=' + r.len + ' head=' + String(r.head).replace(/\s+/g, ' ').slice(0, 150));
  }
}
db.close();