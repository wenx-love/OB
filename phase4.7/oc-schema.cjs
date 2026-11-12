const { DatabaseSync } = require('node:sqlite');
const p = 'C:/Users/Administrator/.local/share/opencode/opencode.db';
let db;
try { db = new DatabaseSync(p, { readOnly: true }); } catch (e) { console.log('OPEN FAILED: ' + e.message); process.exit(0); }
try {
  const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all();
  console.log('tables: ' + tables.map(t => t.name).join(', '));
  for (const t of tables) {
    if (!/message|part|session/i.test(t.name)) continue;
    const cols = db.prepare('PRAGMA table_info("' + t.name + '")').all();
    const n = db.prepare('SELECT COUNT(*) AS n FROM "' + t.name + '"').get().n;
    console.log('  ' + t.name + ' rows=' + n + ' cols=' + cols.map(c => c.name + ':' + c.type).join(', '));
  }
  console.log('journal_mode=' + db.prepare('PRAGMA journal_mode').get().journal_mode);
} catch (e) { console.log('QUERY FAILED: ' + e.message); }
db.close();