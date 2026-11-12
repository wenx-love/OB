'use strict';
// V8 publish fault lab. Runs ONLY in an isolated scratch root under the approved temp directory.
// It never touches the V8 package, D:\P47RUN, D:\P47TOOLS, the product or historical evidence.
// The lab exercises the publisher's failure and rollback paths; real disk errors, power loss and
// external kills are NOT covered and stay UNVERIFIED.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PB = require('./p0v8-publish.cjs');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const BASE = path.join('C:\\Users\\Administrator\\TEMP\\opencode', 'p47-lab');

function freshRoot(n) {
  const root = path.join(BASE, 'run-' + n);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function tree(root) {
  const out = {};
  for (const f of ['a.txt', 'b.txt', 'c.txt']) {
    const p = path.join(root, f);
    out[f] = fs.existsSync(p) ? sha(fs.readFileSync(p)) : null;
  }
  return out;
}

function files(v) {
  return { 'a.txt': 'A1 ' + v, 'b.txt': 'B1 ' + v, 'c.txt': 'C1 ' + v };
}

function runOne(n, name, opts) {
  const root = freshRoot(n);
  const A = files('one');
  const B = files('two');
  const rec = { name, root, steps: [] };
  const step = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    rec.steps.push({ label, pass, actual, expected });
    if (!pass) rec.failed = true;
  };
  const r1 = PB.publish(root, A, {});
  step('first publish ok', r1.ok, true);
  const treeA = tree(root);
  const ridA = r1.rid;
  if (opts.mode === 'republish') {
    const r2 = PB.publish(root, A, {});
    step('republish ok', r2.ok, true);
    step('republish same rid', r2.rid, ridA);
    step('tree unchanged', tree(root), treeA);
  } else if (opts.mode === 'fault') {
    const r2 = PB.publish(root, B, { flags: { fault: { throwAt: opts.at, rollbackAt: opts.rollbackAt } } });
    step('fault detected', r2.ok, false);
    if (opts.rollbackFails) {
      step('state rollback-failed', r2.state, 'rollback-failed');
    } else {
      step('state rolled-back', r2.state, 'rolled-back');
      step('tree restored', tree(root), treeA);
      step('pointer restored', JSON.parse(fs.readFileSync(path.join(root, '_publish', 'CURRENT.json'), 'utf8')).rid, ridA);
    }
  } else if (opts.mode === 'kill') {
    const { spawnSync } = require('child_process');
    const child = `
      const PB=require(${JSON.stringify(path.join(__dirname, 'p0v8-publish.cjs'))});
      const files={ 'a.txt':'A1 two','b.txt':'B1 two','c.txt':'C1 two' };
      PB.publish(${JSON.stringify(root)},files,{flags:{fault:{killAt:${JSON.stringify(opts.at)}}}});
    `;
    const p = spawnSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 60000 });
    rec.killed = p.status !== 0;
    const st = PB.status(root);
    rec.status_after_kill = st;
    const rec2 = PB.recover(root, {});
    step('recover ok', rec2.ok, true);
    step('recover state', rec2.state, 'rolled-back');
    step('tree restored after kill', tree(root), treeA);
  } else if (opts.mode === 'determinism') {
    const r2 = PB.publish(root, A, {});
    step('same content same rid', r2.rid, ridA);
  }
  fs.rmSync(root, { recursive: true, force: true });
  return rec;
}

function run() {
  fs.mkdirSync(BASE, { recursive: true });
  const stamp = Date.now();
  const base = stamp * 100;
  const scenarios = [
    ['first-publish', { mode: 'first' }],
    ['republish-idempotent', { mode: 'republish' }],
    ['determinism', { mode: 'determinism' }],
    ['fault-stage', { mode: 'fault', at: 'stage' }],
    ['fault-backup', { mode: 'fault', at: 'backup' }],
    ['fault-switch-b', { mode: 'fault', at: 'switch:b.txt' }],
    ['fault-pointer', { mode: 'fault', at: 'pointer' }],
    ['fault-postverify', { mode: 'fault', at: 'postverify' }],
    ['fault-rollback-a', { mode: 'fault', at: 'switch:b.txt', rollbackAt: 'b.txt', rollbackFails: true }],
    ['kill-switch-b', { mode: 'kill', at: 'switch:b.txt' }],
    ['kill-pointer', { mode: 'kill', at: 'pointer' }],
  ];
  const results = scenarios.map(([name, o], i) => runOne(base + i + 1, name, o));
  const passed = results.filter((r) => !r.failed).length;
  return {
    schema: 'p47-publish-lab-v1', base, scenarios: results.length, passed,
    failed: results.length - passed, results,
    publisher_sha256: sha(fs.readFileSync(path.join(__dirname, 'p0v8-publish.cjs'))),
    lab_sha256: sha(fs.readFileSync(__filename)),
    limits: ['injected faults only (throw / SIGKILL to self)', 'real disk errors, power loss and external kills are UNVERIFIED', 'scratch root deleted after each scenario'],
  };
}

module.exports = { run };

if (require.main === module) {
  const r = run();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.failed ? 1 : 0);
}
