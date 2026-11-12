const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = new DatabaseSync('C:/Users/Administrator/.local/share/opencode/opencode.db', { readOnly: true });
const row = db.prepare('SELECT data FROM session_message WHERE id = ?').get('msg_1c8383639001G4392SaMmxpfX5');
db.close();
const j = JSON.parse(row.data);
const part = j.content.find((p) => p.type === 'text' && typeof p.text === 'string' && p.text.indexOf('调查结论与分阶段计划') >= 0);
if (!part) { console.log('TEXT PART NOT FOUND'); process.exit(0); }
const text = part.text;
const out = 'C:/Users/Administrator/TEMP/opencode/p47-worker-remediation-plan/PHASE4.7-WORKER-REMEDIATION-PLAN.original-recovered.md';
if (fs.existsSync(out)) { console.log('REFUSED: output exists ' + out); process.exit(0); }
fs.writeFileSync(out, text, { encoding: 'utf8', flag: 'wx' });
const buf = fs.readFileSync(out);
console.log('written: ' + out);
console.log('chars=' + text.length + ' bytes=' + buf.length + ' sha256=' + crypto.createHash('sha256').update(buf).digest('hex'));
console.log('roundtrip equals db text: ' + (buf.toString('utf8') === text));
const lines = text.split('\n');
console.log('lines=' + lines.length);
console.log('first line: ' + lines[0]);
console.log('last line: ' + lines[lines.length - 1]);
console.log('headings:');
for (const l of lines) if (/^#{1,3} /.test(l)) console.log('  ' + l);
const ds = []; for (let i = 1; i <= 10; i++) ds.push('D' + i + '=' + (text.indexOf('**D' + i + '：**') >= 0));
console.log('decisions present: ' + ds.join(' '));