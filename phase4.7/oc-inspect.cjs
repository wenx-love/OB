const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Administrator/.local/share/opencode/opencode.db', { readOnly: true });
const fmt = (ms) => { const d = new Date(Number(ms)); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
const row = db.prepare('SELECT id, session_id, type, seq, time_created, time_updated, data FROM session_message WHERE id = ?').get('msg_1c8383639001G4392SaMmxpfX5');
console.log('row: id=' + row.id + ' type=' + row.type + ' seq=' + row.seq + ' created=' + fmt(row.time_created) + ' updated=' + fmt(row.time_updated) + ' dataChars=' + row.data.length);
const j = JSON.parse(row.data);
console.log('top keys: ' + Object.keys(j).join(', '));
if (j.time) console.log('time: ' + JSON.stringify(j.time) + ' => created=' + fmt(j.time.created) + (j.time.completed ? ' completed=' + fmt(j.time.completed) : ''));
const parts = Array.isArray(j.content) ? j.content : [];
console.log('content parts: ' + parts.length);
const NEEDLE = '调查结论与分阶段计划';
parts.forEach((p, i) => {
  const keys = Object.keys(p).join(',');
  let len = 0; let has = false; let head = '';
  for (const k of Object.keys(p)) { if (typeof p[k] === 'string') { if (p[k].length > len) { len = p[k].length; head = p[k].slice(0, 70).replace(/\s+/g, ' '); } if (p[k].indexOf(NEEDLE) >= 0) has = true; } }
  if (p.type === 'text' || has) console.log('  [' + i + '] type=' + p.type + ' keys=' + keys + ' maxStrLen=' + len + ' hasTitle=' + has + ' head=' + head);
});
const types = {}; for (const p of parts) types[p.type] = (types[p.type] || 0) + 1;
console.log('part types: ' + JSON.stringify(types));
db.close();