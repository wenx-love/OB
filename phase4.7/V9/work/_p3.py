import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
a = t.index('function flowReplay(recs) {')
b = t.index('// ---------------------------------------------------------------- independent flow replay')
new = r'''function flowReplay(recs) {
  const errs = [];
  const add = (code) => errs.push({ code, detail: '' });
  const wrapperOf = {};
  for (const e of execList) if (e.class === 'after' && e.target_ref) wrapperOf[e.target_ref] = e.exec_id;
  let pendingAfter = null;
  let halted = false;
  for (const r of recs) {
    if (pendingAfter) {
      if (['segment_open', 'segment_close'].includes(r.record) && r.exec_id === pendingAfter) {
        if (r.record === 'segment_close') pendingAfter = null;
      } else {
        add('flow.missing_after'); pendingAfter = null;
      }
    }
    if (halted && r.record === 'segment_open') {
      const cls = (byId[r.exec_id] || {}).class;
      if (['target', 'finalizer', 'bind'].includes(cls)) add('flow.after_halt');
    }
    if (r.record === 'segment_close' && ['failed', 'aborted'].includes(r.result) && wrapperOf[r.exec_id]) {
      if (r.failure_class === 'security') halted = true;
      pendingAfter = wrapperOf[r.exec_id];
    }
  }
  if (pendingAfter) add('flow.missing_after');
  return errs;
}

function validateSeal(s, recs) {
  const errs = [];
  const add = (code) => errs.push({ code, detail: '' });
  if (s.schema !== 'p47-terminal-seal-v9') add('schema.schema');
  const req = ['schema', 'run_id', 'mode', 'chain', 'staged_state', 'run_state', 'abort', 'open_segments', 'skipped', 'not_started', 'gate_failed', 'segment_counts', 'index', 'report', 'c18_state', 'staged_recheck', 'exit_status', 'security_findings', 'sealed_utc'];
  for (const f of req) if (!(f in s)) add('schema.required');
  if (!SEAL_MODES.includes(s.mode)) add('seal.mode');
  if (!['complete', 'incomplete', 'absent'].includes(s.staged_state)) add('seal.mode');
  if (!['completed', 'aborted'].includes(s.run_state)) add('seal.mode');
  if (!Array.isArray(s.open_segments) || s.open_segments.some((x) => !x || typeof x !== 'object' || typeof x.exec_id !== 'string' ||
    !['present', 'missing', 'frozen'].includes(x.parts_state) || x.summary_state !== 'missing' || x.close_state !== 'missing' ||
    !['verified', 'unverified'].includes(x.evidence_status))) add('seal.mode');
  if (!Array.isArray(s.skipped) || !Array.isArray(s.not_started) || !Array.isArray(s.gate_failed)) add('seal.mode');
  if (!s.segment_counts || !['opened', 'closed', 'skipped', 'orphaned'].every((k) => Number.isSafeInteger(s.segment_counts[k]))) add('seal.mode');
  if (!s.index || typeof s.index.present !== 'boolean' || (s.index.present && (!canonicalAbs(s.index.path) || !H64.test(s.index.sha256 || '')))) add('seal.mode');
  if (!s.report || typeof s.report.present !== 'boolean' || (s.report.present && (!canonicalAbs(s.report.path) || !H64.test(s.report.sha256 || '')))) add('seal.mode');
  if (!['bound', 'disabled-unbound', 'not-reached'].includes(s.c18_state)) add('seal.mode');
  if (!s.staged_recheck || typeof s.staged_recheck.performed !== 'boolean' || !['pass', 'fail', 'not-performed'].includes(s.staged_recheck.result)) add('seal.mode');

  if (recs && recs.length) {
    const last = recs[recs.length - 1];
    if (!s.chain || s.chain.last_seq !== last.chain_seq || s.chain.last_record_sha256 !== shaText(canon(last))) add('seal.mode');
    if (!s.chain || s.chain.tail_kind !== last.record) add('seal.mode');
  }
  if (s.mode === 'sealed-full') {
    if (s.staged_state !== 'complete' || s.run_state !== 'completed') add('seal.mode');
    if ((s.open_segments || []).length) add('seal.mode');
    if (!s.index || !s.index.present || !s.report || !s.report.present) add('seal.mode');
    if (s.exit_status === 'complete' && ((s.skipped || []).length || (s.not_started || []).length || (s.gate_failed || []).length || s.c18_state !== 'bound')) add('seal.mode');
  }
  if (s.mode === 'aborted') {
    if (s.staged_state !== 'complete' || s.run_state !== 'aborted' || !s.abort || typeof s.abort !== 'object' ||
      typeof s.abort.exec_id !== 'string' || !['gate', 'fatal', 'security'].includes(s.abort.failure_class)) add('seal.mode');
  }
  if (s.mode === 'degraded-prefix') {
    if (s.staged_state === 'complete') add('seal.mode');
  }
  if (s.mode === 'no-chain' && s.staged_state !== 'absent') add('seal.mode');
  if (s.mode === 'seal-failed' && s.exit_status === 'complete') add('seal.mode');
  if (s.mode === 'chain-broken' && s.exit_status === 'complete') add('seal.mode');
  const overlap = (arr1, arr2) => (arr1 || []).filter((x) => (arr2 || []).includes(x));
  if (overlap(s.skipped, s.not_started).length || overlap(s.skipped, s.gate_failed).length || overlap(s.not_started, s.gate_failed).length) add('seal.partition');
  for (const t of s.security_findings || []) if (!reg.failure_policy.trigger_ids.includes(t)) add('seal.mode');
  return errs;
}

'''
t = t[:a] + new + t[b:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('flowReplay + validateSeal replaced')
