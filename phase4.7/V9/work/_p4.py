import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
a = t.index('const STOP_RANK =')
b = t.index('// ---------------------------------------------------------------- TSV regenerated')
new = r'''const STOP_RANK = { none: 0, continue: 1, 'halt-business': 2, 'halt-all': 3, 'chain-broken': 4 };
const STATE_SETS = {
  ok: ['ok'],
  terminal: ['ok', 'failed', 'aborted'],
  recorded: ['ok', 'failed', 'aborted', 'skipped'],
  settled: ['ok', 'failed', 'aborted', 'skipped', 'orphaned'],
};
const isChainExec = (e) => e.chain_role === 'genesis' || e.chain_role === 'participant';

function simulate(order, opts) {
  opts = opts || {};
  const binding = opts.binding || 'bound';
  const state = new Map(); const rec = new Map(); const reasons = new Map();
  const ran = []; let stop = 'none'; let first = null;
  let genesis = false, genesisPartial = false, preRunFailed = false;
  const set = (id, v) => state.set(id, v);
  const lvl = (e, cls) => cls === 'security' ? 'halt-all'
    : cls === 'fatal' ? (['finalizer', 'seal', 'infra', 'pre-run', 'genesis', 'bind', 'before', 'after'].includes(e.class) ? 'halt-all' : 'halt-business')
      : 'continue';
  const raise = (id, cls) => { const e = byId[id]; if (!first) first = id; const L = lvl(e, cls); if (STOP_RANK[L] > STOP_RANK[stop]) stop = L; };
  const skip = (id, reason, dep) => {
    const e = byId[id]; set(id, 'skipped'); if (isChainExec(e)) rec.set(id, 'skip'); reasons.set(id, [reason, dep]);
  };
  const runOk = (id) => {
    const e = byId[id]; set(id, 'ok'); if (isChainExec(e)) rec.set(id, 'close');
    if (e.chain_role === 'genesis') genesis = true; ran.push(id);
  };
  const runFail = (id, cls) => {
    const e = byId[id]; set(id, 'failed');
    if (e.chain_role === 'genesis') { genesisPartial = true; genesis = false; }
    else if (isChainExec(e)) rec.set(id, 'close');
    if (e.class === 'pre-run') preRunFailed = true;
    raise(id, cls); ran.push(id);
  };
  const runOrphan = (id) => {
    const e = byId[id]; if (e.class === 'pre-run') preRunFailed = true;
    if (e.chain_role === 'genesis') { genesisPartial = true; genesis = false; set(id, 'orphaned'); }
    else if (isChainExec(e)) { rec.set(id, 'open'); set(id, 'orphaned'); }
    else set(id, 'failed');
    stop = 'halt-all'; if (!first) first = id; ran.push(id);
  };
  const unmet = (e) => {
    for (const r of e.requires || []) {
      const st = state.get(r.exec);
      if (!STATE_SETS[r.state] || !STATE_SETS[r.state].includes(st)) return r;
    }
    return null;
  };
  for (const id of order) {
    const e = byId[id];
    if (state.has(id)) continue;
    if (preRunFailed) { set(id, 'not-started'); continue; }
    if (!genesis && state.get('C01-E01') !== undefined && state.get('C01-E01') !== 'ok') { set(id, 'not-started'); continue; }
    if (e.condition === 'c18-bound' && binding === 'unbound') { skip(id, 'c18-unbound', null); continue; }
    if ((e.class === 'before' || e.class === 'after') && state.get(e.target_ref) === 'skipped') { skip(id, 'target-skipped', e.target_ref); continue; }
    if (stop === 'halt-all') {
      if (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref))) { runOne(e); continue; }
      if (e.class === 'seal') { runOne(e); continue; }
      skip(id, 'run-stopped', first); continue;
    }
    if (stop === 'halt-business') {
      const allowed = e.class === 'finalizer' || e.class === 'seal' || e.class === 'bind' ||
        (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref)));
      if (!allowed) { skip(id, 'run-stopped', first); continue; }
    }
    if (e.class === 'seal') { runOne(e); continue; }
    const miss = unmet(e);
    if (miss) { skip(id, 'dependency-failed', miss.exec); continue; }
    runOne(e);
  }
  function runOne(e) {
    const cls = e.exec_id === opts.fail ? opts.failClass : e.exec_id === opts.fail2 ? opts.fail2Class : null;
    if (cls) { runFail(e.exec_id, cls); return; }
    if (opts.orphan === e.exec_id) { runOrphan(e.exec_id); return; }
    runOk(e.exec_id);
  }
  for (const id of order) {
    if (state.has(id)) continue;
    if (!genesis) { set(id, 'not-started'); continue; }
    skip(id, 'run-stopped', first);
  }
  const staged = state.get('C05-FINAL-E01') === 'ok' ? 'complete'
    : (state.get('C05-FINAL-E01') === 'failed' || state.get('C04-E01') === 'ok') ? 'incomplete' : 'absent';
  const halted = STOP_RANK[stop] >= 2;
  const sealFailed = state.get('C20-SEAL-E01') === 'failed';
  const chainBroken = !!opts.chainBroken || [opts.fail, opts.fail2].filter(Boolean)
    .some((id) => (byId[id].failure_modes || []).some((m) => m.trigger === 'SEC-CHAIN-MISMATCH'));
  const mode = !genesis ? 'no-chain' : sealFailed ? 'seal-failed' : chainBroken ? 'chain-broken'
    : staged !== 'complete' ? 'degraded-prefix' : halted ? 'aborted' : 'sealed-full';
  const skipped = order.filter((id) => state.get(id) === 'skipped');
  const failed = order.filter((id) => state.get(id) === 'failed');
  const notStarted = order.filter((id) => state.get(id) === 'not-started');
  const records = (genesis ? 1 : 0) + order.reduce((n, id) => {
    const r = rec.get(id);
    if (r === 'skip' || r === 'open') return n + 1;
    if (r === 'close') return n + 2;
    return n;
  }, 0);
  return { stop, staged, halted, mode, ran: ran.length, skipped, failed, notStarted, records, genesis,
    exit: (mode === 'sealed-full' && !failed.length && !skipped.length && binding === 'bound') ? 'complete' : 'exit-not-met',
    digestInput: { skipped, failed, reasons: [...reasons.keys()].sort().map((k) => [k, reasons.get(k)[0], reasons.get(k)[1]]) } };
}

const SCEN = [];
for (const [name, order, binding] of [['bound', planB, 'bound'], ['unbound', planU, 'unbound']]) {
  SCEN.push({ scenario: name + '/all-ok', order, binding });
  for (const id of order) {
    const cls = []; if (byId[id].fail_class === 'gate') cls.push('gate'); cls.push('fatal', 'security');
    for (const c of cls) SCEN.push({ scenario: name + '/' + id + '/' + c, order, binding, fail: id, failClass: c });
  }
  if (name === 'bound') {
    for (const id of order) SCEN.push({ scenario: name + '/' + id + '/orphan', order, binding, orphan: id });
    SCEN.push({ scenario: name + '/all-ok-unbound-binding', order, binding: 'unbound' });
    for (const id of order) {
      if (!byId['C07-A-' + id]) continue;
      for (const c of ['fatal', 'security']) SCEN.push({ scenario: 'bound/' + id + '/security+' + c + '-after', order, binding, fail: id, failClass: 'security', fail2: 'C07-A-' + id, fail2Class: c });
    }
    SCEN.push({ scenario: 'bound/C11+C12/gate', order, binding, fail: 'C11-E01', failClass: 'gate', fail2: 'C12-E01', fail2Class: 'gate' });
    SCEN.push({ scenario: 'bound/C10-N+C13/gate', order, binding, fail: 'C10-N-E01', failClass: 'gate', fail2: 'C13-E01', fail2Class: 'gate' });
    SCEN.push({ scenario: 'bound/C14+C15/gate', order, binding, fail: 'C14-E01', failClass: 'gate', fail2: 'C15-E01', fail2Class: 'gate' });
    SCEN.push({ scenario: 'bound/C12/security+C19/fatal', order, binding, fail: 'C12-E01', failClass: 'security', fail2: 'C19-E01', fail2Class: 'fatal' });
  }
}
const MATRIX = SCEN.map((s) => ({ s, r: simulate(s.order, s) }));
const published = reg.flow.matrix;
eq('matrix rows', published.rows, MATRIX.length);
const rowOf = (m) => ({
  scenario: m.s.scenario, order: m.s.order === planB ? 'bound' : 'unbound',
  fail: m.s.fail || null, fail_class: m.s.failClass || null, fail2: m.s.fail2 || null, fail2_class: m.s.fail2Class || null,
  binding: m.s.binding, stop: m.r.stop, staged_state: m.r.staged, run_state: m.r.halted ? 'aborted' : 'completed',
  seal_mode: m.r.mode, exit: m.r.exit, ran: m.r.ran, skipped: m.r.skipped.length, failed: m.r.failed.length,
  not_started: m.r.notStarted.length, records: m.r.records,
  skipped_sha256: shaText(canon(m.r.digestInput.skipped)), failed_sha256: shaText(canon(m.r.digestInput.failed)),
  reasons_sha256: shaText(canon(m.r.digestInput.reasons)),
});
const publishedDigest = shaText(canon(MATRIX.map(rowOf)));
eq('matrix digest recomputed', publishedDigest, published.digest);
if (Array.isArray(published.rows_data)) {
  let diff = 0;
  for (const m of MATRIX) {
    const mine = canon(rowOf(m));
    const theirs = published.rows_data.find((x) => x.scenario === m.s.scenario);
    if (!theirs || canon(theirs) !== mine) { diff++; if (diff <= 3) failures.push('matrix row differs ' + m.s.scenario + '\n mine=' + mine + '\n their=' + canon(theirs)); }
  }
  eq('matrix row-by-row differences', diff, 0);
}
const c10p = simulate(planB, { fail: 'C10-P-E01', failClass: 'gate' });
eq('C10-P gate skips 24', c10p.skipped.length, 24);
eq('C10-P after runs', c10p.failed.length === 1 && c10p.ran > 0, true);
const lateSec = simulate(planB, { fail: 'C12-E01', failClass: 'security' });
eq('late security aborted', lateSec.mode, 'aborted');
const early = simulate(planB, { fail: 'C04-E01', failClass: 'fatal' });
eq('early fatal degraded', early.mode, 'degraded-prefix');
const orph = simulate(planB, { orphan: 'C10-N-E01' });
eq('orphan aborted', orph.mode, 'aborted');
for (const sc of SCEN.filter((x) => x.scenario.includes('/all-ok') || x.scenario.includes('/C00-E01/') || x.scenario.includes('/C01-E01/'))) {
  const r = simulate(sc.order, sc);
  if (r.mode === 'no-chain') eq('no-chain records 0 ' + sc.scenario, r.records, 0);
}
for (const m of MATRIX) {
  if (m.r.mode !== 'sealed-full') continue;
  if (m.r.exit === 'complete') eq('sealed-full complete is clean ' + m.s.scenario, m.r.skipped.length + m.r.failed.length, 0);
}
const composite = simulate(planB, { fail: 'C10-P-E01', failClass: 'security', fail2: 'C07-A-C10-P-E01', fail2Class: 'fatal' });
eq('composite stop is halt-all', composite.stop, 'halt-all');
eq('composite seal is not sealed-full', composite.mode === 'sealed-full', false);

'''
t = t[:a] + new + t[b:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('checker simulate/matrix replaced')
