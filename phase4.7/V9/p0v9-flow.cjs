'use strict';
// OB-Recover Phase 4.7 / Phase 0 V9 - flow model used by the contract GENERATOR.
// The independent checker re-implements this model from the registry; it never imports this file.
// Contract simulation only: no process, no filesystem, no C00-C20 execution.
const S = require('./p0v9-spec.cjs');
const L = require('./p0v9-lib.cjs');

const CLASSES = ['pre-run', 'genesis', 'infra', 'baseline', 'target', 'before', 'after', 'bind', 'finalizer', 'seal'];
const STOP_RANK = { none: 0, continue: 1, 'halt-business': 2, 'halt-all': 3, 'chain-broken': 4 };
const SKIP_REASONS = ['dependency-failed', 'target-skipped', 'c18-unbound', 'run-stopped'];
const SEAL_MODES = ['sealed-full', 'degraded-prefix', 'aborted', 'seal-failed', 'chain-broken', 'no-chain'];
const STATE_SETS = {
  ok: ['ok'],
  terminal: ['ok', 'failed', 'aborted'],
  recorded: ['ok', 'failed', 'aborted', 'skipped'],
  settled: ['ok', 'failed', 'aborted', 'skipped', 'orphaned'],
};
const isChain = (e) => e.chain === 'genesis' || e.chain === 'participant';
const isSeal = (e) => e.class === 'seal';

function simulate(order, opts) {
  const byId = new Map(S.EXECS.map((e) => [e.id, e]));
  const binding = opts.binding || 'bound';
  const state = new Map();
  const rec = new Map(); // open|close|skip|partial-genesis, only for chain executions
  const skipReason = new Map();
  const ran = [];
  const completed = new Set();
  let stop = 'none';
  let firstFailure = null;
  let genesisWritten = false;
  let genesisPartial = false;
  let preRunFailed = false;

  const setState = (id, v) => { state.set(id, v); };
  const levelOf = (e, cls) => {
    if (cls === 'security') return 'halt-all';
    if (cls === 'fatal') {
      return ['finalizer', 'seal', 'infra', 'pre-run', 'genesis', 'bind', 'before', 'after'].includes(e.class)
        ? 'halt-all' : 'halt-business';
    }
    return 'continue';
  };
  const raise = (e, cls) => {
    if (!firstFailure) firstFailure = e.id;
    const lvl = levelOf(e, cls);
    if (STOP_RANK[lvl] > STOP_RANK[stop]) stop = lvl;
  };
  const skip = (id, reason, dep) => {
    const e = byId.get(id);
    setState(id, 'skipped');
    if (isChain(e)) rec.set(id, 'skip');
    skipReason.set(id, { reason, failed_dependency: dep || null });
  };

  function unmet(e) {
    for (const r of e.requires || []) {
      const st = state.get(r.exec);
      if (!STATE_SETS[r.state]) throw new Error('unknown requirement state ' + r.state);
      if (!STATE_SETS[r.state].includes(st)) return r;
    }
    return null;
  }

  function fail(e, cls, second) {
    setState(e.id, 'failed');
    if (e.chain === 'genesis') { genesisPartial = true; genesisWritten = false; }
    else if (isChain(e)) rec.set(e.id, 'close');
    if (e.class === 'pre-run') preRunFailed = true;
    raise(e, cls);
    ran.push(e.id);
  }

  function orphan(e) {
    if (e.class === 'pre-run') preRunFailed = true;
    if (e.chain === 'genesis') { genesisPartial = true; genesisWritten = false; setState(e.id, 'orphaned'); stop = 'halt-all'; }
    else if (isChain(e)) { rec.set(e.id, 'open'); setState(e.id, 'orphaned'); stop = 'halt-all'; }
    else { setState(e.id, 'failed'); stop = 'halt-all'; }
    if (!firstFailure) firstFailure = e.id;
    ran.push(e.id);
  }

  function ok(e) {
    setState(e.id, 'ok');
    if (isChain(e)) rec.set(e.id, 'close');
    if (e.chain === 'genesis') genesisWritten = true;
    ran.push(e.id);
  }

  for (const id of order) {
    const e = byId.get(id);
    if (!e) throw new Error('unregistered plan id ' + id);
    if (state.has(id)) continue;

    if (preRunFailed) { setState(id, 'not-started'); continue; }
    // pre-run / bootstrap: nothing after a failed pre-run can even be considered
    if (!genesisWritten && state.get('C01-E01') !== undefined && state.get('C01-E01') !== 'ok') {
      setState(id, 'not-started'); continue;
    }

    if (e.condition === 'c18-bound' && binding === 'unbound') { skip(id, 'c18-unbound', null); continue; }
    if ((e.class === 'before' || e.class === 'after') && state.get(e.target_ref) === 'skipped') {
      skip(id, 'target-skipped', e.target_ref); continue;
    }

    if (stop === 'halt-all') {
      if (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref)) && !state.has(id)) { runOne(e); continue; }
      if (isSeal(e)) { runOne(e); continue; }
      skip(id, 'run-stopped', firstFailure); continue;
    }

    if (stop === 'halt-business') {
      const allowed = e.class === 'finalizer' || isSeal(e) || e.class === 'bind' ||
        (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref)));
      if (!allowed) { skip(id, 'run-stopped', firstFailure); continue; }
    }

    if (isSeal(e)) { runOne(e); continue; }
    const miss = unmet(e);
    if (miss) { skip(id, 'dependency-failed', miss.exec); continue; }
    runOne(e);
  }

  function runOne(e) {
    const cls = e.id === opts.fail ? opts.failClass
      : e.id === opts.fail2 ? opts.fail2Class : null;
    if (cls) { fail(e, cls); return; }
    if (opts.orphan === e.id) { orphan(e); return; }
    ok(e);
  }

  for (const id of order) {
    if (state.has(id)) continue;
    if (!genesisWritten) { setState(id, 'not-started'); continue; }
    skip(id, 'run-stopped', firstFailure);
  }

  const stagedState = (() => {
    const fin = state.get('C05-FINAL-E01');
    if (fin === 'ok') return 'complete';
    if (fin === 'failed' || fin === 'aborted') return 'incomplete';
    if (state.get('C04-E01') === 'ok') return 'incomplete';
    return 'absent';
  })();

  const halted = STOP_RANK[stop] >= STOP_RANK['halt-business'];
  const sealFailed = state.get('C20-SEAL-E01') === 'failed';
  const chainBroken = !!opts.chainBroken ||
    [opts.fail, opts.fail2].filter(Boolean).some((id) => (S.EXEC(id).failure_modes || []).some((m) => m.trigger === 'SEC-CHAIN-MISMATCH'));

  let mode;
  if (!genesisWritten) mode = 'no-chain';
  else if (sealFailed) mode = 'seal-failed';
  else if (chainBroken) mode = 'chain-broken';
  else if (stagedState !== 'complete') mode = 'degraded-prefix';
  else if (halted) mode = 'aborted';
  else mode = 'sealed-full';

  const skipped = order.filter((id) => state.get(id) === 'skipped');
  const failed = order.filter((id) => state.get(id) === 'failed');
  const notStarted = order.filter((id) => state.get(id) === 'not-started');
  const records = (genesisWritten ? 1 : 0) + order.reduce((n, id) => {
    const r = rec.get(id);
    if (r === 'skip' || r === 'open') return n + 1;
    if (r === 'close') return n + 2;
    return n;
  }, 0);

  return {
    stop, first_failure: firstFailure, staged_state: stagedState,
    run_state: halted ? 'aborted' : 'completed',
    seal_mode: mode,
    exit: (mode === 'sealed-full' && failed.length === 0 && skipped.length === 0 && binding === 'bound') ? 'complete' : 'exit-not-met',
    ran: ran.length, skipped: skipped.length, failed: failed.length, not_started: notStarted.length,
    skipped_ids: skipped, failed_ids: failed, not_started_ids: notStarted,
    states: Object.fromEntries(order.map((id) => [id, state.get(id)])),
    reasons: Object.fromEntries([...skipReason.entries()]),
    records,
  };
}

function scenarios() {
  const out = [];
  for (const [name, order, binding] of [['bound', S.PLAN_BOUND, 'bound'], ['unbound', S.PLAN_UNBOUND, 'unbound']]) {
    out.push({ name: name + '/all-ok', order, binding });
    for (const id of order) {
      const e = S.EXEC(id);
      const classes = [];
      if (e.fail_class === 'gate') classes.push('gate');
      classes.push('fatal', 'security');
      for (const c of classes) out.push({ name: name + '/' + id + '/' + c, order, binding, fail: id, failClass: c });
    }
    if (name === 'bound') {
      for (const id of order) out.push({ name: name + '/' + id + '/orphan', order, binding, orphan: id });
      out.push({ name: name + '/all-ok-unbound-binding', order, binding: 'unbound' });
      // composite failures: first failure + failure in that target's after-evidence
      for (const id of order) {
        const w = S.EXEC('C07-A-' + id);
        if (!w) continue;
        for (const cls of ['fatal', 'security']) {
          out.push({ name: 'bound/' + id + '/security+' + cls + '-after', order, binding, fail: id, failClass: 'security', fail2: w.id, fail2Class: cls });
        }
      }
      // two independent gate failures and one security+finalizer combination
      out.push({ name: 'bound/C11+C12/gate', order, binding, fail: 'C11-E01', failClass: 'gate', fail2: 'C12-E01', fail2Class: 'gate' });
      out.push({ name: 'bound/C10-N+C13/gate', order, binding, fail: 'C10-N-E01', failClass: 'gate', fail2: 'C13-E01', fail2Class: 'gate' });
      out.push({ name: 'bound/C14+C15/gate', order, binding, fail: 'C14-E01', failClass: 'gate', fail2: 'C15-E01', fail2Class: 'gate' });
      out.push({ name: 'bound/C12/security+C19/fatal', order, binding, fail: 'C12-E01', failClass: 'security', fail2: 'C19-E01', fail2Class: 'fatal' });
    }
  }
  return out;
}

const digest = (v) => L.sha256utf8(L.canon(v));

function matrix() {
  return scenarios().map((sc) => {
    const r = simulate(sc.order, sc);
    return {
      scenario: sc.name, order: sc.order === S.PLAN_BOUND ? 'bound' : 'unbound',
      fail: sc.fail || null, fail_class: sc.failClass || null,
      fail2: sc.fail2 || null, fail2_class: sc.fail2Class || null,
      binding: sc.binding,
      stop: r.stop, staged_state: r.staged_state, run_state: r.run_state, seal_mode: r.seal_mode,
      exit: r.exit, ran: r.ran, skipped: r.skipped, failed: r.failed, not_started: r.not_started, records: r.records,
      skipped_sha256: digest(r.skipped_ids), failed_sha256: digest(r.failed_ids),
      reasons_sha256: digest(Object.keys(r.reasons).sort().map((k) => [k, r.reasons[k].reason, r.reasons[k].failed_dependency])),
    };
  });
}

module.exports = { CLASSES, STOP_RANK, SKIP_REASONS, SEAL_MODES, STATE_SETS, simulate, scenarios, matrix, isChain, isSeal };
