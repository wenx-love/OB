'use strict';
// V9 publish fault lab. Runs ONLY in isolated scratch roots under the approved temp directory.
// It never touches the V9 package, D:\P47RUN, D:\P47TOOLS, the product or historical evidence.
// Every scenario keeps its actual steps, expected/actual values, before/after hashes and the
// journal/pointer copies under <package>/_publish/lab/<run>/<scenario>/ (F13). Real disk errors,
// power loss, external kills and multi-writer races remain UNVERIFIED.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const PB = require('./p0v9-publish.cjs');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const BASE = path.join('C:\\Users\\Administrator\\TEMP\\opencode', 'p47-lab-v9');
const OUT = path.join(__dirname, '..', '_publish', 'lab');

function tree(root) {
  const out = {};
  for (const f of ['a.txt', 'b.txt', 'c.txt']) {
    const p = path.join(root, f);
    out[f] = fs.existsSync(p) ? sha(fs.readFileSync(p)) : null;
  }
  return out;
}
const files = (v) => ({ 'a.txt': 'A1 ' + v, 'b.txt': 'B1 ' + v, 'c.txt': 'C1 ' + v });
const treeOfFiles = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sha(Buffer.from(String(v), 'utf8'))]));

function snapshot(root) {
  const d = PB.dirs(root);
  const snap = { tree: tree(root), current: null, journal: null, lock: fs.existsSync(d.lock) };
  try { snap.current = JSON.parse(fs.readFileSync(d.current, 'utf8')); } catch (e) { /* absent */ }
  try { snap.journal = JSON.parse(fs.readFileSync(d.journal, 'utf8')); } catch (e) { /* absent */ }
  return snap;
}

function evidenceDir(runDir, name) {
  const p = path.join(runDir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function copyIf(src, dst) { if (fs.existsSync(src)) fs.copyFileSync(src, dst); }

function runOne(runDir, name, mode, opts) {
  opts = opts || {};
  const root = path.join(BASE, 'run-' + name + '-' + Date.now().toString(36));
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const ev = evidenceDir(runDir, name);
  const rec = { name, mode, root, expected: opts.expected || null, steps: [], faults: opts.fault || null, code: {} };
  const step = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    rec.steps.push({ label, pass, actual, expected });
    if (!pass) rec.failed = true;
  };
  const A = files('one'), B = files('two');
  const r1 = PB.publish(root, A, {});
  step('first publish ok', r1.ok, true);
  const treeA = tree(root);
  const ridA = r1.rid;
  rec.before = snapshot(root);

  if (mode === 'republish' || mode === 'determinism') {
    const r2 = PB.publish(root, A, {});
    step('republish ok', r2.ok, true);
    step('same rid', r2.rid, ridA);
    step('tree unchanged', tree(root), treeA);
  } else if (mode === 'fault') {
    const r2 = PB.publish(root, B, { flags: { fault: opts.fault } });
    step('fault detected', r2.ok, false);
    if (opts.rollbackFails) {
      step('state rollback-failed', r2.state, 'rollback-failed');
      const st = PB.status(root);
      step('status reports issues', st.issues.length > 0, true);
      const again = PB.recover(root, {});
      step('recover cannot silently pass', again.ok && again.state === 'verified', false);
    } else {
      step('state rolled-back', r2.state, 'rolled-back');
      step('tree restored', tree(root), treeA);
      step('pointer restored', JSON.parse(fs.readFileSync(PB.dirs(root).current, 'utf8')).rid, ridA);
      const st = PB.status(root);
      step('status clean after rollback', st.issues, []);
    }
  } else if (mode === 'kill') {
    const child = `const PB=require(${JSON.stringify(path.join(__dirname, 'p0v9-publish.cjs'))});` +
      `PB.publish(${JSON.stringify(root)},${JSON.stringify(B)},{flags:{fault:{killAt:${JSON.stringify(opts.killAt)}}}});`;
    const p = spawnSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 60000 });
    rec.child = { status: p.status, signal: p.signal, stderr: (p.stderr || '').slice(0, 2000) };
    step('child was terminated (not a clean exit)', p.status !== 0 || p.signal !== null, true);
    const afterKill = snapshot(root);
    rec.afterKill = afterKill;
    if (opts.thenPublish) {
      let refused = null;
      try { PB.publish(root, B, {}); } catch (e) { refused = String(e.message || e); }
      step('unfinished transaction refuses new publish', /E_UNFINISHED_TX/.test(refused || ''), true);
      rec.refusal = refused;
    }
    const rec2 = PB.recover(root, {});
    step('recover ok', rec2.ok, true);
    step('recover state', rec2.state, 'rolled-back');
    step('tree restored after kill', tree(root), treeA);
    step('pointer restored after kill', JSON.parse(fs.readFileSync(PB.dirs(root).current, 'utf8')).rid, ridA);
  } else if (mode === 'undo') {
    const r2 = PB.publish(root, B, {});
    step('second publish ok', r2.ok, true);
    const rb = PB.undo(root, {});
    step('undo ok', rb.ok, true);
    step('undo state', rb.state, 'rolled-back');
    step('tree restored by undo', tree(root), treeA);
    step('pointer restored by undo', JSON.parse(fs.readFileSync(PB.dirs(root).current, 'utf8')).rid, ridA);
    const st = PB.status(root);
    step('status clean after undo', st.issues, []);
  } else if (mode === 'lock') {
    fs.writeFileSync(PB.dirs(root).lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    let err = null;
    try { PB.publish(root, B, {}); } catch (e) { err = String(e.message || e); }
    step('lock refuses publisher', /E_LOCKED/.test(err || ''), true);
    fs.unlinkSync(PB.dirs(root).lock);
    const r2 = PB.publish(root, B, {});
    step('publish after lock release', r2.ok, true);
  } else if (mode === 'shortwrite') {
    const r2 = PB.publish(root, B, { shortWriteChunk: 3 });
    step('short-write loop completes', r2.ok, true);
    step('tree is B', tree(root), treeOfFiles(B));
  } else if (mode === 'release-corrupt') {
    const cur = JSON.parse(fs.readFileSync(PB.dirs(root).current, 'utf8'));
    const p = path.join(PB.dirs(root).releases, cur.rid, 'a.txt');
    fs.writeFileSync(p, 'CORRUPTED');
    const st = PB.status(root);
    step('status detects release corruption', st.issues.some((x) => /release:/.test(x)), true);
    rec.status = st;
  } else if (mode === 'pointer-corrupt') {
    const cur = JSON.parse(fs.readFileSync(PB.dirs(root).current, 'utf8'));
    cur.rid = 'f'.repeat(64);
    fs.writeFileSync(PB.dirs(root).current, JSON.stringify(cur, null, 2));
    const st = PB.status(root);
    step('status detects pointer corruption', st.issues.some((x) => /rid|release/.test(x)), true);
    rec.status = st;
  }

  rec.after = snapshot(root);
  rec.code = {
    publish_sha256: sha(fs.readFileSync(path.join(__dirname, 'p0v9-publish.cjs'))),
    lab_sha256: sha(fs.readFileSync(__filename)),
  };
  // retain evidence files
  copyIf(PB.dirs(root).journal, path.join(ev, 'journal.json'));
  copyIf(PB.dirs(root).current, path.join(ev, 'CURRENT.json'));
  if (rec.afterKill) {
    copyIf(path.join(root, 'a.txt'), path.join(ev, 'after-kill-a.txt'));
    copyIf(path.join(root, 'b.txt'), path.join(ev, 'after-kill-b.txt'));
    copyIf(path.join(root, 'c.txt'), path.join(ev, 'after-kill-c.txt'));
  }
  if (fs.existsSync(PB.dirs(root).releases)) {
    const rels = fs.readdirSync(PB.dirs(root).releases);
    fs.writeFileSync(path.join(ev, 'releases.json'), JSON.stringify(rels, null, 2));
  }
  fs.writeFileSync(path.join(ev, 'scenario.json'), JSON.stringify(rec, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
  return rec;
}

function run() {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(BASE, { recursive: true });
  const runId = 'run-' + new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(OUT, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const scenarios = [
    ['first-publish', 'first'],
    ['republish-idempotent', 'republish'],
    ['determinism', 'determinism'],
    ['fault-stage', 'fault', { fault: { throwAt: 'stage' } }],
    ['fault-backup', 'fault', { fault: { throwAt: 'backup' } }],
    ['fault-switch-b', 'fault', { fault: { throwAt: 'switch:b.txt' } }],
    ['fault-pointer', 'fault', { fault: { throwAt: 'pointer' } }],
    ['fault-postverify', 'fault', { fault: { throwAt: 'postverify' } }],
    ['rollback-failed', 'fault', { fault: { throwAt: 'switch:b.txt', rollbackAt: 'b.txt' }, rollbackFails: true }],
    ['kill-switch-b', 'kill', { killAt: 'switch:b.txt' }],
    ['kill-pointer', 'kill', { killAt: 'pointer' }],
    ['kill-then-publish', 'kill', { killAt: 'switch:b.txt', thenPublish: true }],
    ['post-gate-undo', 'undo'],
    ['lock-refusal', 'lock'],
    ['short-write', 'shortwrite'],
    ['release-corrupt', 'release-corrupt'],
    ['pointer-corrupt', 'pointer-corrupt'],
  ];
  const results = scenarios.map(([name, mode, o]) => runOne(runDir, name, mode, o || {}));
  const passed = results.filter((r) => !r.failed).length;
  const report = {
    schema: 'p47-publish-lab-v2', run_id: runId, evidence_dir: runDir,
    scenarios: results.length, passed, failed: results.length - passed,
    results,
    code: {
      publish_sha256: sha(fs.readFileSync(path.join(__dirname, 'p0v9-publish.cjs'))),
      lab_sha256: sha(fs.readFileSync(__filename)),
    },
    limits: ['injected throw/SIGKILL/short-write only', 'real disk errors, power loss, external kills and multi-writer races are UNVERIFIED', 'scratch roots deleted after evidence capture'],
  };
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

module.exports = { run, BASE };

if (require.main === module) {
  const r = run();
  console.log(JSON.stringify({ scenarios: r.scenarios, passed: r.passed, failed: r.failed, evidence_dir: r.evidence_dir }, null, 2));
  process.exit(r.failed ? 1 : 0);
}
