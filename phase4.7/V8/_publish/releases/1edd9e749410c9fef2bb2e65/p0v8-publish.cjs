'use strict';
// OB-Recover Phase 4.7 / Phase 0 V8 publish transaction.
// Contract tooling only: it publishes the V8 document/tool package. It never executes C00-C20,
// never touches D:\P47RUN or D:\P47TOOLS, and never writes outside its own package root and
// the isolated lab root passed to --lab.
//
// Commit model (disclosed limits):
//   * every release is content-addressed and immutable: _publish\releases\<id>\
//   * the current package is the materialised view: files at the package root whose hashes
//     must equal _publish\CURRENT.json
//   * the transaction is journaled in _publish\journal.json (prepared -> switching -> committed
//     -> verified | rolled-back | rollback-failed)
//   * a multi-file switch is not one atomic OS operation; a crash mid-switch leaves a mixed
//     tree, which the journal marks "prepared/switching" and --recover repairs from the
//     persistent backup. Success is never claimed without post-commit verification.
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
});
const abs = (root, rel) => path.join(root, rel.replace(/\//g, path.sep));

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeDurable(p, buf) {
  const fd = fs.openSync(p, 'wx');
  try { fs.writeSync(fd, buf, 0, buf.length, 0); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function writeReplace(p, buf) {
  const tmp = p + '.p47-tmp';
  try { fs.unlinkSync(tmp); } catch (e) { /* absent */ }
  writeDurable(tmp, buf);
  fs.renameSync(tmp, p);
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

function writeJournal(root, j) {
  const d = dirs(root);
  ensureDir(d.meta);
  writeReplace(d.journal, Buffer.from(JSON.stringify(j, null, 2), 'utf8'));
}

function status(root) {
  const d = dirs(root);
  const out = { root, pointer: null, issues: [], staging: [], journal_state: null };
  if (exists(d.journal)) out.journal_state = readJson(d.journal).state || null;
  if (!exists(d.current)) { out.issues.push('CURRENT.json missing'); return out; }
  const cur = readJson(d.current);
  out.pointer = cur;
  if (!cur.rid || !exists(path.join(d.releases, cur.rid))) out.issues.push('CURRENT names a missing release');
  const rel = path.join(d.releases, cur.rid);
  for (const f of cur.files || []) {
    const p = abs(root, f.path);
    if (!exists(p)) { out.issues.push('missing ' + f.path); continue; }
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) out.issues.push('mismatch ' + f.path);
  }
  if (exists(d.staging)) for (const n of fs.readdirSync(d.staging)) out.staging.push(n);
  if (exists(rel)) {
    const idx = path.join(rel, '.release-index.json');
    if (!exists(idx)) out.issues.push('release index missing');
  }
  return out;
}

function writeCurrent(root, cur) {
  const d = dirs(root);
  writeReplace(d.current, Buffer.from(JSON.stringify(cur, null, 2), 'utf8'));
}

function verifyRelease(root, rid, index) {
  const rel = path.join(dirs(root).releases, rid);
  if (!exists(rel)) return 'release directory missing';
  const idxPath = path.join(rel, '.release-index.json');
  if (!exists(idxPath)) return 'release index missing';
  const idx = readJson(idxPath);
  if (canon(idx) !== canon(index)) return 'release index differs';
  for (const f of index) {
    const p = path.join(rel, f.path.replace(/\//g, path.sep));
    if (!exists(p)) return 'release file missing ' + f.path;
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) return 'release file mismatch ' + f.path;
  }
  return null;
}

// flags: { fault: {throwAt, killAt}, now }
function faultHook(flags, point) {
  if (!flags) return;
  if (flags.fault && flags.fault.killAt === point) process.kill(process.pid, 'SIGKILL');
  if (flags.fault && flags.fault.throwAt === point) throw new Error('injected fault at ' + point);
}

/**
 * Publish a complete file map. Returns a result object; never claims success without
 * post-commit verification. On failure everything is rolled back from the persistent backup.
 */
function publish(root, files, opts) {
  opts = opts || {};
  const flags = opts.flags || {};
  const d = dirs(root);
  ensureDir(d.meta); ensureDir(d.staging); ensureDir(d.backups); ensureDir(d.releases);

  const index = indexOf(files);
  const rid = shaText(canon(index)).slice(0, 24);
  const old = {};
  for (const f of index) {
    const p = abs(root, f.path);
    old[f.path] = exists(p) ? { exists: true, bytes: fs.statSync(p).size, sha256: sha(fs.readFileSync(p)) } : { exists: false, bytes: null, sha256: null };
  }
  const journal = {
    schema: 'p47-publish-journal-v1', rid, state: 'prepared',
    files: index.map((f) => ({ path: f.path, new: { bytes: f.bytes, sha256: f.sha256 }, old: old[f.path] })),
    old_current: exists(d.current) ? fs.readFileSync(d.current).toString('utf8') : null,
    release_dir: path.join(d.releases, rid),
    staging_dir: path.join(d.staging, rid),
    backup_dir: path.join(d.backups, rid),
    error: null, rollback: null,
  };
  writeJournal(root, journal);
  const fail = (state, err) => { journal.state = state; journal.error = String(err && err.message || err); writeJournal(root, journal); return journal; };

  try {
    // ---- P1: immutable release directory (content addressed; never overwritten)
    const rel = path.join(d.releases, rid);
    if (exists(rel)) {
      const bad = verifyRelease(root, rid, index);
      if (bad) throw new Error('existing release differs: ' + bad);
    } else {
      const stage = path.join(d.staging, rid);
      rmrf(stage);
      ensureDir(stage);
      for (const f of index) {
        const target = path.join(stage, f.path.replace(/\//g, path.sep));
        ensureDir(path.dirname(target));
        writeDurable(target, Buffer.isBuffer(files[f.path]) ? files[f.path] : Buffer.from(String(files[f.path]), 'utf8'));
      }
      writeDurable(path.join(stage, '.release-index.json'), Buffer.from(JSON.stringify(index, null, 2), 'utf8'));
      faultHook(flags, 'stage');
      // verify before the directory becomes a release
      const bad = verifyReleaseAt(stage, index);
      if (bad) throw new Error('staged release differs: ' + bad);
      fs.renameSync(stage, rel);
      faultHook(flags, 'release-rename');
    }

    // ---- P2: persistent backup of the current materialised files
    const bk = path.join(d.backups, rid);
    rmrf(bk); ensureDir(bk);
    for (const f of index) {
      const rec = old[f.path];
      if (!rec.exists) continue;
      const src = abs(root, f.path);
      if (!exists(src)) throw new Error('backup source missing ' + f.path);
      const buf = fs.readFileSync(src);
      if (sha(buf) !== rec.sha256) throw new Error('current file changed during backup ' + f.path);
      const target = path.join(bk, f.path.replace(/\//g, path.sep));
      ensureDir(path.dirname(target));
      writeDurable(target, buf);
    }
    writeDurable(path.join(bk, '.backup-index.json'), Buffer.from(JSON.stringify(index.map((f) => ({ path: f.path, old: old[f.path] })), null, 2), 'utf8'));
    faultHook(flags, 'backup');
    journal.state = 'prepared'; writeJournal(root, journal);

    // ---- P3: switch each file (temp + rename, same volume)
    journal.state = 'switching'; writeJournal(root, journal);
    for (const f of index) {
      const target = abs(root, f.path);
      ensureDir(path.dirname(target));
      const buf = Buffer.isBuffer(files[f.path]) ? files[f.path] : Buffer.from(String(files[f.path]), 'utf8');
      writeReplace(target, buf);
      faultHook(flags, 'switch:' + f.path);
    }
    faultHook(flags, 'switch');

    // ---- P4: pointer commit
    const cur = { schema: 'p47-publish-current-v1', rid, files: index, journal: d.journal };
    writeCurrent(root, cur);
    faultHook(flags, 'pointer');
    journal.state = 'committed'; writeJournal(root, journal);

    // ---- P5: post-commit verification; mismatch rolls back
    const bad = verifyMaterialised(root, index);
    if (bad) throw new Error('post-commit verification failed: ' + bad);
    faultHook(flags, 'postverify');
    journal.state = 'verified'; writeJournal(root, journal);
    return { ok: true, rid, state: 'verified', files: index.length, index };
  } catch (err) {
    const rb = rollback(root, journal, flags);
    return { ok: false, rid, state: rb.result, error: String(err.message || err), rollback: rb };
  }
}

function verifyReleaseAt(rel, index) {
  for (const f of index) {
    const p = path.join(rel, f.path.replace(/\//g, path.sep));
    if (!exists(p)) return 'missing ' + f.path;
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) return 'mismatch ' + f.path;
  }
  const idx = path.join(rel, '.release-index.json');
  if (!exists(idx)) return 'index missing';
  if (canon(readJson(idx)) !== canon(index)) return 'index differs';
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

function rollback(root, journal, flags) {
  const d = dirs(root);
  const bk = path.join(d.backups, journal.rid);
  const rb = { attempted: true, result: 'rolled-back', error: null, files: [] };
  try {
    // nothing was switched yet: verify the old tree and record a no-op rollback
    if (journal.state === 'prepared') {
      const bad0 = verifyOld(root, journal.files);
      if (bad0) throw new Error('prepared rollback verification failed: ' + bad0);
      journal.state = 'rolled-back'; journal.rollback = rb; writeJournal(root, journal);
      return rb;
    }
    for (const f of journal.files) {
      const target = abs(root, f.path);
      if (f.old.exists) {
        const src = path.join(bk, f.path.replace(/\//g, path.sep));
        if (!exists(src)) throw new Error('backup missing ' + f.path);
        const buf = fs.readFileSync(src);
        if (sha(buf) !== f.old.sha256) throw new Error('backup hash mismatch ' + f.path);
        writeReplace(target, buf);
      } else {
        if (exists(target)) fs.unlinkSync(target);
      }
      if (flags && flags.fault && flags.fault.throwAt === 'rollback:' + f.path) throw new Error('injected rollback fault ' + f.path);
      if (flags && flags.fault && flags.fault.rollbackAt === f.path) throw new Error('injected rollback fault ' + f.path);
      rb.files.push({ path: f.path, restored: f.old.exists ? 'old' : 'absent' });
    }
    const bad = verifyOld(root, journal.files);
    if (bad) throw new Error('rollback verification failed: ' + bad);
    journal.state = 'rolled-back'; journal.rollback = rb; writeJournal(root, journal);
    // the pointer must name the previous release again (or be absent on a first publish)
    if (journal.old_current === null) {
      if (exists(d.current)) fs.unlinkSync(d.current);
    } else {
      writeReplace(d.current, Buffer.from(journal.old_current, 'utf8'));
    }
    return rb;
  } catch (e) {
    rb.result = 'rollback-failed'; rb.error = String(e.message || e);
    journal.state = 'rollback-failed'; journal.rollback = rb; writeJournal(root, journal);
    return rb;
  }
}

function verifyOld(root, files) {
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

// Repair an interrupted transaction. Conservative: anything not "verified" or "committed"
// is rolled back to the previous materialised state.
function recover(root, flags) {
  const d = dirs(root);
  if (!exists(d.journal)) return { ok: true, state: 'nothing-to-do' };
  const j = readJson(d.journal);
  if (j.state === 'verified' || j.state === 'committed') {
    const cur = exists(d.current) ? readJson(d.current) : null;
    if (cur && cur.rid === j.rid) {
      const bad = verifyMaterialised(root, cur.files);
      if (!bad) {
        j.state = 'verified'; writeJournal(root, j);
        return { ok: true, state: 'verified', rid: j.rid };
      }
      const rb = rollback(root, j, flags);
      return { ok: rb.result === 'rolled-back', state: rb.result, rid: j.rid, error: bad };
    }
    const rb = rollback(root, j, flags);
    return { ok: rb.result === 'rolled-back', state: rb.result, rid: j.rid };
  }
  const rb = rollback(root, j, flags);
  return { ok: rb.result === 'rolled-back', state: rb.result, rid: j.rid, rollback: rb };
}

// CLI: node p0v8-publish.cjs status|recover <root>
if (require.main === module) {
  const cmd = process.argv[2];
  const root = process.argv[3];
  if (!cmd || !root) { console.error('usage: p0v8-publish.cjs status|recover <root>'); process.exit(2); }
  if (cmd === 'status') { console.log(JSON.stringify(status(root), null, 2)); process.exit(0); }
  if (cmd === 'recover') { const r = recover(root); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 3); }
  console.error('unknown command');
  process.exit(2);
}

module.exports = { publish, recover, status, indexOf, sha, shaText, canon, dirs, META };
