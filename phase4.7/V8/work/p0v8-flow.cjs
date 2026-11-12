'use strict';
// OB-Recover Phase 4.7 / Phase 0 V8 - flow model used by the contract GENERATOR.
// The independent checker re-implements this model from the registry; it never imports this file.
// Contract simulation only: no process, no filesystem, no C00-C20 execution.
const S = require('./p0v8-spec.cjs');
const L = require('./p0v8-lib.cjs');

const CLASSES = ['pre-run', 'genesis', 'infra', 'baseline', 'target', 'before', 'after', 'bind', 'finalizer', 'seal'];
const STOP_RANK = { none: 0, continue: 1, 'halt-business': 2, 'halt-all': 3, 'chain-broken': 4 };
const SKIP_REASONS = ['dependency-failed', 'target-skipped', 'c18-unbound', 'run-stopped'];
const SEAL_MODES = ['sealed-full', 'degraded-prefix', 'aborted', 'seal-failed', 'chain-broken', 'no-chain'];

const isFinalizer = (e) => e.class === 'finalizer';
const isSeal = (e) => e.class === 'seal';

function simulate(order, opts) {
  const byId = new Map(S.EXECS.map((e) => [e.id, e]));
  const failId = opts.fail || null;
  const failClass = opts.failClass || null;
  const binding = opts.binding || 'bound';
  const state = new Map();      // id -> ok|failed|aborted|skipped|orphaned|not-started
  const rec = new Map();        // id -> open|close|skip
  const skipReason = new Map();
  const ran = [];
  let stop = 'none';
  let firstFailure = null;
  let genesisWritten = false;

  const setState = (id, v) => { state.set(id, v); };
  const skip = (id, reason, dep) => {
    setState(id, 'skipped'); rec.set(id, 'skip'); skipReason.set(id, { reason, failed_dependency: dep || null });
  };

  function unmet(e) {
    for (const r of e.requires || []) {
      const st = state.get(r.exec);
      if (r.state === 'ok') { if (st !== 'ok') return r; }
      else if (r.state === 'terminal') { if (!['ok', 'failed', 'aborted'].includes(st)) return r; }
      else if (r.state === 'recorded') { if (!st) return r; }
      else if (r.state === 'settled') { if (!st) return r; }
      else throw new Error('unknown requirement state ' + r.state);
    }
    return null;
  }

  function raise(e, cls) {
    if (!firstFailure) firstFailure = e.id;
    if (cls === 'security') stop = 'halt-all';
    else if (cls === 'fatal') {
      stop = (e.class === 'finalizer' || e.class === 'seal' || e.class === 'infra' ||
        e.class === 'pre-run' || e.class === 'genesis' || e.class === 'bind')
        ? 'halt-all' : 'halt-business';
    } else if (STOP_RANK[stop] < STOP_RANK.continue) stop = 'continue';
  }

  function runOne(e) {
    const cls = e.id === failId ? failClass : null;
    if (cls) {
      rec.set(e.id, 'close'); setState(e.id, 'failed'); raise(e, cls); ran.push(e.id); return;
    }
    if (opts.orphan === e.id) {
      rec.set(e.id, 'open'); setState(e.id, 'orphaned'); ran.push(e.id);
      stop = 'halt-all'; if (!firstFailure) firstFailure = e.id; return;
    }
    rec.set(e.id, 'close'); setState(e.id, 'ok'); ran.push(e.id);
    if (e.chain === 'genesis') genesisWritten = true;
  }

  for (const id of order) {
    const e = byId.get(id);
    if (!e) throw new Error('unregistered plan id ' + id);
    if (state.has(id)) continue;

    if (!genesisWritten && e.chain !== 'genesis' && e.chain !== 'none' && state.get('C01-E01') !== undefined && state.get('C01-E01') !== 'ok') {
      setState(id, 'not-started'); continue; // no chain exists: nothing can be recorded
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
      const allowed = isFinalizer(e) || isSeal(e) || e.class === 'bind' ||
        (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref)));
      if (!allowed) { skip(id, 'run-stopped', firstFailure); continue; }
    }

    // the terminal seal has its own gate (chain tail + staged state); it is never skipped
    if (isSeal(e)) { runOne(e); continue; }

    const miss = unmet(e);
    if (miss) { skip(id, 'dependency-failed', miss.exec); continue; }
    runOne(e);
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
    (state.get('C19-E01') === 'failed' && failClass === 'security');

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
    const e = byId.get(id);
    if (r === 'skip') return n + 1;
    if (r === 'open') return n + 1;
    if (r === 'close') return n + ((e.chain === 'genesis' || e.chain === 'participant') ? 2 : 0);
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
      fail: sc.fail || null, fail_class: sc.failClass || null, binding: sc.binding,
      stop: r.stop, staged_state: r.staged_state, run_state: r.run_state, seal_mode: r.seal_mode,
      exit: r.exit, ran: r.ran, skipped: r.skipped, failed: r.failed, not_started: r.not_started, records: r.records,
      skipped_sha256: digest(r.skipped_ids), failed_sha256: digest(r.failed_ids),
      reasons_sha256: digest(Object.keys(r.reasons).sort().map((k) => [k, r.reasons[k].reason, r.reasons[k].failed_dependency])),
    };
  });
}

module.exports = { CLASSES, STOP_RANK, SKIP_REASONS, SEAL_MODES, simulate, scenarios, matrix, isFinalizer, isSeal };
