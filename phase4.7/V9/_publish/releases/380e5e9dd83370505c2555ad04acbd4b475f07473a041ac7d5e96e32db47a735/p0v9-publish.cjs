'use strict';
// OB-Recover Phase 4.7 / Phase 0 V9 publish transaction and recovery.
// Contract tooling only: publishes the V9 document/tool package. It never executes C00-C20,
// never touches D:\P47RUN or D:\P47TOOLS.
//
// F09: a committed transaction has an explicit undo() separate from recover().
// F10: a single-writer lock and a strict "unfinished transaction" gate prevent a new publish
//      from overwriting a recoverable journal/backup.
// F11: status/recover/check verify the release index, the RID, every release byte and every
//      materialised byte.
// F12: short writes are looped, files are fsynced, directory fsync is attempted and reported,
//      every journal path is confined to the package root, and rollback is verified before it
//      is called rolled-back.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaText = (s) => sha(Buffer.from(s, 'utf8'));
function canon(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') { if (!Number.isSafeInteger(v)) throw new Error('canon: unsafe number'); return Object.is(v, -0) ? '0' : String(v); }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') {
    const ks = Object.keys(v).sort();
    return '{' + ks.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('canon: unsupported type');
}

const META = '_publish';
const dirs = (root) => ({
  root,
  meta: path.join(root, META),
  staging: path.join(root, META, 'staging'),
  backups: path.join(root, META, 'backup'),
  releases: path.join(root, META, 'releases'),
  journal: path.join(root, META, 'journal.json'),
  current: path.join(root, META, 'CURRENT.json'),
  lock: path.join(root, META, 'LOCK'),
});
const abs = (root, rel) => {
  if (typeof rel !== 'string' || rel.length === 0) throw new Error('bad relative path');
  if (/^[A-Za-z]:/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) throw new Error('absolute path rejected: ' + rel);
  const parts = rel.split(/[\\/]/);
  for (const p of parts) if (!p || p === '.' || p === '..') throw new Error('path component rejected: ' + rel);
  const full = path.resolve(root, ...parts);
  const base = path.resolve(root) + path.sep;
  if (!full.startsWith(base)) throw new Error('path escapes root: ' + rel);
  return full;
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeDurable(p, buf, opts) {
  const chunk = (opts && opts.shortWriteChunk) || buf.length || 1;
  const fd = fs.openSync(p, 'wx');
  try {
    let off = 0;
    while (off < buf.length) {
      const n = fs.writeSync(fd, buf, off, Math.min(chunk, buf.length - off), off);
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error('short write at ' + p + ' offset ' + off);
      off += n;
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
function syncDir(dir) {
  try { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } return true; } catch (e) { return false; }
}
function writeReplace(p, buf, opts) {
  const tmp = p + '.p47-tmp';
  try { fs.unlinkSync(tmp); } catch (e) { /* absent */ }
  writeDurable(tmp, buf, opts);
  fs.renameSync(tmp, p);
  return syncDir(path.dirname(p));
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exists(p) { return fs.existsSync(p); }
function rmrf(p) { if (exists(p)) fs.rmSync(p, { recursive: true, force: true }); }

function indexOf(files) {
  return Object.keys(files).sort().map((p) => {
    const b = Buffer.isBuffer(files[p]) ? files[p] : Buffer.from(String(files[p]), 'utf8');
    return { path: p, bytes: b.length, sha256: sha(b) };
  });
}
const ridOf = (index) => shaText(canon(index));

function writeJournal(root, j) {
  const d = dirs(root); ensureDir(d.meta);
  j.dir_sync = writeReplace(d.journal, Buffer.from(JSON.stringify(j, null, 2), 'utf8'));
}

// ---------------------------------------------------------------- lock
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function acquireLock(root) {
  const d = dirs(root); ensureDir(d.meta);
  for (let i = 0; i < 3; i++) {
    try {
      const fd = fs.openSync(d.lock, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.fsyncSync(fd);
      return fd;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let info = null;
      try { info = JSON.parse(fs.readFileSync(d.lock, 'utf8')); } catch (x) { info = null; }
      if (info && Number.isSafeInteger(info.pid) && pidAlive(info.pid)) throw new Error('E_LOCKED: another publisher is running (pid ' + info.pid + ')');
      try { fs.unlinkSync(d.lock); } catch (x) { /* retry */ }
    }
  }
  throw new Error('E_LOCKED: could not acquire publish lock');
}
function releaseLock(root, fd) {
  try { fs.closeSync(fd); } catch (e) { /* ignore */ }
  try { fs.unlinkSync(dirs(root).lock); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- verification
function verifyRelease(root, rid, index) {
  const rel = path.join(dirs(root).releases, rid);
  if (!exists(rel)) return 'release directory missing';
  const idxPath = path.join(rel, '.release-index.json');
  if (!exists(idxPath)) return 'release index missing';
  let idx;
  try { idx = readJson(idxPath); } catch (e) { return 'release index unreadable'; }
  if (canon(idx) !== canon(index)) return 'release index differs';
  for (const f of index) {
    let p;
    try { p = path.join(rel, ...f.path.split('/')); } catch (e) { return 'release path bad'; }
    if (!exists(p)) return 'release file missing ' + f.path;
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) return 'release file mismatch ' + f.path;
  }
  return null;
}
function verifyMaterialised(root, index) {
  for (const f of index) {
    const p = abs(root, f.path);
    if (!exists(p)) return 'missing ' + f.path;
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) return 'mismatch ' + f.path;
  }
  return null;
}
function verifyOld(root, files, opts) {
  for (const f of files) {
    const p = abs(root, f.path);
    if (f.old.exists) {
      if (!exists(p)) return 'old file missing ' + f.path;
      const b = fs.readFileSync(p);
      if (b.length !== f.old.bytes || sha(b) !== f.old.sha256) return 'old file mismatch ' + f.path;
    } else if (exists(p)) return 'file should be absent ' + f.path;
  }
  return null;
}

function status(root) {
  const d = dirs(root);
  const out = { root, pointer: null, release: null, journal_state: null, issues: [], staging: [] };
  if (exists(d.lock)) {
    let info = null; try { info = JSON.parse(fs.readFileSync(d.lock, 'utf8')); } catch (e) { /* ignore */ }
    out.issues.push('LOCK present' + (info && info.pid ? ' pid=' + info.pid : ''));
  }
  if (exists(d.journal)) out.journal_state = readJson(d.journal).state || null;
  if (!exists(d.current)) { out.issues.push('CURRENT.json missing'); return out; }
  let cur;
  try { cur = readJson(d.current); } catch (e) { out.issues.push('CURRENT.json unreadable'); return out; }
  out.pointer = cur;
  if (cur.schema !== 'p47-publish-current-v1') out.issues.push('CURRENT schema');
  if (!Array.isArray(cur.files)) { out.issues.push('CURRENT files not an array'); return out; }
  const rid = ridOf(cur.files);
  if (rid !== cur.rid) out.issues.push('CURRENT rid does not match its file index');
  const relBad = verifyRelease(root, cur.rid, cur.files);
  if (relBad) out.issues.push('release: ' + relBad);
  const matBad = verifyMaterialised(root, cur.files);
  if (matBad) out.issues.push('materialised: ' + matBad);
  if (exists(d.journal)) {
    const j = readJson(d.journal);
    if (['verified', 'committed'].includes(j.state) && j.rid !== cur.rid) out.issues.push('journal rid differs from CURRENT');
    if (j.state !== 'verified' && j.state !== 'rolled-back') out.issues.push('journal state ' + j.state);
  }
  if (exists(d.staging)) for (const n of fs.readdirSync(d.staging)) out.staging.push(n);
  return out;
}

// ---------------------------------------------------------------- transaction
function unfinishedState(j) {
  return j && ['prepared', 'switching', 'committed', 'rollback-failed'].includes(j.state);
}

function publish(root, files, opts) {
  opts = opts || {};
  const flags = opts.flags || {};
  const d = dirs(root);
  ensureDir(d.meta); ensureDir(d.staging); ensureDir(d.backups); ensureDir(d.releases);
  const lock = acquireLock(root);
  try {
    // F10: never overwrite an unfinished transaction
    if (exists(d.journal)) {
      const prev = readJson(d.journal);
      if (unfinishedState(prev)) throw new Error('E_UNFINISHED_TX: previous transaction is ' + prev.state + '; run recover first');
      if (prev.state === 'verified' && !exists(d.current)) throw new Error('E_INCONSISTENT: verified journal without CURRENT');
      if (prev.state === 'verified' && exists(d.current)) {
        const cur = readJson(d.current);
        if (cur.rid !== prev.rid) throw new Error('E_INCONSISTENT: journal verified but CURRENT names another release');
      }
    }
    // current tree must match CURRENT before it becomes the rollback baseline
    if (exists(d.current)) {
      const cur = readJson(d.current);
      const bad = verifyMaterialised(root, cur.files) || verifyRelease(root, cur.rid, cur.files);
      if (bad) throw new Error('E_CURRENT_BROKEN: ' + bad);
    }

    const index = indexOf(files);
    const rid = ridOf(index);

    // idempotent republish: same content already current and fully verified
    if (exists(d.current)) {
      const cur = readJson(d.current);
      if (cur.rid === rid) {
        const bad = verifyMaterialised(root, index) || verifyRelease(root, rid, index);
        if (!bad) return { ok: true, rid, state: 'verified', noop: true, files: index.length, index };
      }
    }

    const old = {};
    for (const f of index) {
      const p = abs(root, f.path);
      old[f.path] = exists(p) ? { exists: true, bytes: fs.statSync(p).size, sha256: sha(fs.readFileSync(p)) } : { exists: false, bytes: null, sha256: null };
    }
    const txid = rid.slice(0, 16) + '-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const journal = {
      schema: 'p47-publish-journal-v2', txid, rid, state: 'prepared', phase: 'prepared',
      files: index.map((f) => ({ path: f.path, new: { bytes: f.bytes, sha256: f.sha256 }, old: old[f.path] })),
      old_current: exists(d.current) ? fs.readFileSync(d.current).toString('utf8') : null,
      release_dir: path.join(d.releases, rid),
      staging_dir: path.join(d.staging, rid),
      backup_dir: path.join(d.backups, txid),
      durability: { file_fsync: true, short_write_loop: true, dir_sync: null },
      error: null, rollback: null,
    };
    writeJournal(root, journal);
    const fail = (err) => { journal.error = String(err && err.message || err); return err; };
    const hook = (point) => {
      if (flags.fault && flags.fault.killAt === point) process.kill(process.pid, 'SIGKILL');
      if (flags.fault && flags.fault.throwAt === point) throw new Error('injected fault at ' + point);
    };

    try {
      // P1 immutable release
      const rel = path.join(d.releases, rid);
      if (exists(rel)) {
        const bad = verifyRelease(root, rid, index);
        if (bad) throw new Error('existing release differs: ' + bad);
      } else {
        const stage = path.join(d.staging, rid);
        rmrf(stage); ensureDir(stage);
        for (const f of index) {
          const target = path.join(stage, ...f.path.split('/'));
          ensureDir(path.dirname(target));
          writeDurable(target, Buffer.isBuffer(files[f.path]) ? files[f.path] : Buffer.from(String(files[f.path]), 'utf8'), opts);
        }
        writeDurable(path.join(stage, '.release-index.json'), Buffer.from(JSON.stringify(index, null, 2), 'utf8'), opts);
        hook('stage');
        const bad = verifyReleaseAt(stage, index);
        if (bad) throw new Error('staged release differs: ' + bad);
        fs.renameSync(stage, rel);
        journal.durability.dir_sync = syncDir(d.releases);
        hook('release-rename');
      }

      // P2 persistent backup
      const bk = path.join(d.backups, txid);
      ensureDir(bk);
      for (const f of index) {
        const rec = old[f.path];
        if (!rec.exists) continue;
        const src = abs(root, f.path);
        const buf = fs.readFileSync(src);
        if (sha(buf) !== rec.sha256) throw new Error('current file changed during backup ' + f.path);
        const target = path.join(bk, ...f.path.split('/'));
        ensureDir(path.dirname(target));
        writeDurable(target, buf, opts);
      }
      writeDurable(path.join(bk, '.backup-index.json'), Buffer.from(JSON.stringify(index.map((f) => ({ path: f.path, old: old[f.path] })), null, 2), 'utf8'), opts);
      hook('backup');
      journal.state = 'prepared'; journal.phase = 'backed-up'; writeJournal(root, journal);

      // P3 switch
      journal.state = 'switching'; journal.phase = 'switching'; writeJournal(root, journal);
      for (const f of index) {
        const target = abs(root, f.path);
        ensureDir(path.dirname(target));
        writeReplace(target, Buffer.isBuffer(files[f.path]) ? files[f.path] : Buffer.from(String(files[f.path]), 'utf8'), opts);
        hook('switch:' + f.path);
      }
      hook('switch');

      // P4 pointer commit
      const cur = { schema: 'p47-publish-current-v1', rid, files: index, journal: d.journal };
      writeReplace(d.current, Buffer.from(JSON.stringify(cur, null, 2), 'utf8'), opts);
      journal.durability.dir_sync = syncDir(d.meta);
      hook('pointer');
      journal.state = 'committed'; journal.phase = 'committed'; writeJournal(root, journal);

      // P5 post-commit verification
      const bad = verifyMaterialised(root, index) || verifyRelease(root, rid, index);
      if (bad) throw new Error('post-commit verification failed: ' + bad);
      hook('postverify');
      journal.state = 'verified'; journal.phase = 'verified'; writeJournal(root, journal);
      return { ok: true, rid, state: 'verified', files: index.length, index, txid, journal };
    } catch (err) {
      fail(err);
      const rb = rollback(root, journal, opts);
      return { ok: false, rid, state: rb.result, error: String(err.message || err), rollback: rb, txid };
    }
  } finally {
    releaseLock(root, lock);
  }
}

function verifyReleaseAt(rel, index) {
  for (const f of index) {
    const p = path.join(rel, ...f.path.split('/'));
    if (!exists(p)) return 'missing ' + f.path;
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) return 'mismatch ' + f.path;
  }
  const idx = path.join(rel, '.release-index.json');
  if (!exists(idx)) return 'index missing';
  if (canon(readJson(idx)) !== canon(index)) return 'index differs';
  return null;
}

function rollback(root, journal, opts) {
  const d = dirs(root);
  const rb = { attempted: true, result: 'rolled-back', error: null, files: [] };
  try {
    if (journal.state === 'prepared') {
      const bad0 = verifyOld(root, journal.files, opts);
      if (bad0) throw new Error('prepared rollback verification failed: ' + bad0);
      journal.state = 'rolled-back'; journal.rollback = rb; writeJournal(root, journal);
      return rb;
    }
    const bk = journal.backup_dir;
    for (const f of journal.files) {
      const target = abs(root, f.path);
      if (f.old.exists) {
        const src = path.join(bk, ...f.path.split('/'));
        if (!exists(src)) throw new Error('backup missing ' + f.path);
        const buf = fs.readFileSync(src);
        if (sha(buf) !== f.old.sha256) throw new Error('backup hash mismatch ' + f.path);
        writeReplace(target, buf, opts);
      } else if (exists(target)) fs.unlinkSync(target);
      if (opts && opts.flags && opts.flags.fault && opts.flags.fault.rollbackAt === f.path) throw new Error('injected rollback fault ' + f.path);
      rb.files.push({ path: f.path, restored: f.old.exists ? 'old' : 'absent' });
    }
    // restore the pointer before calling the rollback complete
    if (journal.old_current === null) {
      if (exists(d.current)) fs.unlinkSync(d.current);
    } else {
      writeReplace(d.current, Buffer.from(journal.old_current, 'utf8'), opts);
    }
    const bad = verifyOld(root, journal.files, opts);
    if (bad) throw new Error('rollback verification failed: ' + bad);
    if (exists(d.current)) {
      const cur = readJson(d.current);
      const badRel = verifyRelease(root, cur.rid, cur.files) || verifyMaterialised(root, cur.files);
      if (badRel) throw new Error('rolled-back CURRENT verification failed: ' + badRel);
    }
    journal.state = 'rolled-back'; journal.rollback = rb; writeJournal(root, journal);
    return rb;
  } catch (e) {
    rb.result = 'rollback-failed'; rb.error = String(e.message || e);
    journal.state = 'rollback-failed'; journal.rollback = rb; writeJournal(root, journal);
    return rb;
  }
}

// F09: explicit undo of a committed/verified transaction (used when a post-commit gate fails)
function undo(root, opts) {
  const d = dirs(root);
  if (!exists(d.journal)) return { ok: true, state: 'nothing-to-do' };
  const j = readJson(d.journal);
  if (!['committed', 'verified'].includes(j.state)) return { ok: false, state: j.state, error: 'not a committed transaction' };
  if (exists(d.current)) {
    const cur = readJson(d.current);
    if (cur.rid !== j.rid) return { ok: false, state: 'inconsistent', error: 'CURRENT does not name the journal release' };
  }
  const rb = rollback(root, j, opts || {});
  return { ok: rb.result === 'rolled-back', state: rb.result, rollback: rb };
}

function recover(root, opts) {
  const d = dirs(root);
  const lock = acquireLock(root);
  try {
    if (!exists(d.journal)) return { ok: true, state: 'nothing-to-do' };
    const j = readJson(d.journal);
    if (['verified', 'committed'].includes(j.state)) {
      const cur = exists(d.current) ? readJson(d.current) : null;
      const bad = cur && cur.rid === j.rid
        ? (verifyMaterialised(root, cur.files) || verifyRelease(root, cur.rid, cur.files) || (ridOf(cur.files) !== cur.rid ? 'CURRENT rid mismatch' : null))
        : 'CURRENT does not name the journal release';
      if (!bad) { j.state = 'verified'; writeJournal(root, j); return { ok: true, state: 'verified', rid: j.rid }; }
      const rb = rollback(root, j, opts || {});
      return { ok: rb.result === 'rolled-back', state: rb.result, rid: j.rid, error: bad };
    }
    const rb = rollback(root, j, opts || {});
    return { ok: rb.result === 'rolled-back', state: rb.result, rid: j.rid, rollback: rb };
  } finally { releaseLock(root, lock); }
}

if (require.main === module) {
  const cmd = process.argv[2];
  const root = process.argv[3];
  if (!cmd || !root) { console.error('usage: p0v9-publish.cjs status|recover <root>'); process.exit(2); }
  if (cmd === 'status') {
    const s = status(root);
    console.log(JSON.stringify(s, null, 2));
    process.exit(s.issues.length ? 1 : 0);
  }
  if (cmd === 'recover') { const r = recover(root); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 3); }
  if (cmd === 'undo') { const r = undo(root); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 3); }
  console.error('unknown command');
  process.exit(2);
}

module.exports = { publish, undo, recover, status, indexOf, ridOf, sha, shaText, canon, dirs, META };
