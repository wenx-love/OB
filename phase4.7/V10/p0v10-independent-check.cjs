'use strict';

// Independent static checker: does not import p0v10-contract.cjs.
// Re-derives chain/seal/summary/sidecar/gate/canon/path invariants from raw vectors.
// Read-only: no writes, no child processes.

const fs = require('fs');
const path = require('path');
const L = require('./p0v10-lib.cjs');

const SKIP_REASONS = new Set(['dependency-failed', 'target-skipped', 'c18-unbound', 'run-stopped']);
const TRUSTED = new Set(['dispatcher', 'audit-control']);

function read(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function link(specs) {
  let prevHash = null;
  let prevBytes = 0;
  return (specs || []).map((spec, i) => {
    const r = Object.assign({}, spec, {
      schema: 'p47-chain-record-v9',
      chain_seq: i + 1,
      prev_record_sha256: prevHash,
      prev_file_bytes: prevBytes,
    });
    prevHash = L.sha256Canon(r);
    prevBytes += L.lineBytes(r);
    return r;
  });
}

function chainState(records, origin, execs) {
  const known = new Set((execs || []).map((e) => e.exec_id || e));
  if (!records.length) {
    if (origin === 'expected') return { state: 'corrupt', errors: ['CHAIN_REMOVED'], open: [], failures: [] };
    return { state: 'no-chain', errors: [], open: [], failures: [] };
  }
  const errors = [];
  const open = [];
  const failures = [];
  let prevHash = null;
  let prevBytes = 0;
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    if (r.schema !== 'p47-chain-record-v9') errors.push('SCHEMA');
    if (r.chain_seq !== i + 1) errors.push('SEQ');
    if (i === 0) {
      if (r.record !== 'genesis') errors.push('GENESIS');
      if (r.prev_record_sha256 !== null) errors.push('GENESIS_PREV');
      if (r.prev_file_bytes !== 0) errors.push('GENESIS_BYTES');
    } else {
      if (r.prev_record_sha256 !== prevHash) errors.push('PREV_HASH');
      if (r.prev_file_bytes !== prevBytes) errors.push('PREV_BYTES');
    }
    if (r.record === 'segment_open') {
      if (known.size && !known.has(r.exec_id)) errors.push('EXEC_UNKNOWN');
      if (open.length) errors.push('NESTED_OPEN');
      open.push({ exec_id: r.exec_id, command_id: r.command_id, segment_dir: r.segment_dir, chain_seq: r.chain_seq });
    } else if (r.record === 'segment_close') {
      if (known.size && !known.has(r.exec_id)) errors.push('EXEC_UNKNOWN');
      const top = open[open.length - 1];
      if (!top || top.exec_id !== r.exec_id || top.command_id !== r.command_id) errors.push('PAIR');
      else open.pop();
      if (!['ok', 'failed', 'aborted'].includes(r.result)) errors.push('RESULT');
      if (r.result === 'ok' && (r.failure_class !== null || r.security_trigger !== null)) errors.push('OK_FIELDS');
      if (r.result !== 'ok') {
        if (!['gate', 'fatal', 'security'].includes(r.failure_class)) errors.push('CLASS');
        if (r.failure_class === 'security' && !r.security_trigger) errors.push('TRIGGER');
        if (r.failure_class !== 'security' && r.security_trigger !== null) errors.push('NON_SEC_TRIGGER');
        failures.push({ exec_id: r.exec_id, failure_class: r.failure_class });
      }
    } else if (r.record === 'segment_skip') {
      if (!SKIP_REASONS.has(r.reason)) errors.push('SKIP_REASON');
    } else if (r.record !== 'genesis') {
      errors.push('TYPE');
    }
    prevHash = L.sha256Canon(r);
    prevBytes += L.lineBytes(r);
  }
  if (errors.length) return { state: 'corrupt', errors, open, failures };
  const tail = records[records.length - 1].record;
  if (open.length) return { state: 'validated-open', errors: [], open, failures };
  if (tail === 'segment_skip') return { state: 'validated-skip-tail', errors: [], open: [], failures };
  if (tail === 'segment_close') return { state: 'validated-closed', errors: [], open: [], failures };
  return { state: 'corrupt', errors: ['TAIL'], open: [], failures };
}

function sealMode(state, open, failures, ctx) {
  if (state === 'corrupt' || state === 'no-chain') return { mode: 'no-seal', exit: 'exit-not-met' };
  if (open.length) return { mode: 'aborted', exit: 'aborted' };
  if ((ctx && ctx.securityFailure) || (failures || []).some((f) => f.failure_class === 'security')) {
    return { mode: 'aborted', exit: 'aborted' };
  }
  if (ctx && ctx.complete && ctx.allSuccess && ctx.planComplete && ctx.stagedState === 'complete' &&
      ctx.stagedRecheck === 'pass' && (!ctx.skipped || ctx.skipped.length === 0) &&
      (failures || []).length === 0 && state === 'validated-closed') {
    return { mode: 'sealed-full', exit: 'complete' };
  }
  return { mode: 'degraded-prefix', exit: 'exit-not-met' };
}

function segKey(s) {
  return [s.exec_id || '', s.chain_seq === undefined ? '' : s.chain_seq, s.segment_dir || ''].join('\u0000');
}

function checkMap(root, failures) {
  const map = read(root, 'inputs/failure-code-map.json');
  const triggers = read(root, 'inputs/trigger-registry.json').triggers;
  const execs = read(root, 'inputs/exec-registry.json').execs.map((e) => e.exec_id);
  const execDigest = L.sha256Canon(read(root, 'inputs/exec-registry.json'));
  if (execDigest !== map.exec_registry_digest) failures.push('MAP_EXEC_DIGEST');
  const seen = new Set();
  for (const c of map.codes) {
    if (seen.has(c.code)) failures.push('MAP_DUP:' + c.code);
    seen.add(c.code);
    if (c.failure_class === 'security') {
      if (!c.security_trigger || !triggers.includes(c.security_trigger)) failures.push('MAP_TRIGGER:' + c.code);
    } else if (c.security_trigger !== null) failures.push('MAP_NON_SEC_TRIGGER:' + c.code);
    if (c.allowed_exec_scope === 'all-v10-execs') {
      if (c.exec_registry_digest !== execDigest) failures.push('MAP_ALL_DIGEST:' + c.code);
    } else {
      for (const id of c.allowed_exec_ids || []) if (!execs.includes(id)) failures.push('MAP_EXEC:' + c.code + ':' + id);
    }
    for (const op of c.allowed_operations || []) if (!op.startsWith('op:')) failures.push('MAP_OP:' + c.code + ':' + op);
  }
}

function checkChainVectors(vectors, execs, failures) {
  for (const v of vectors.filter((x) => x.kind === 'chain')) {
    const records = link(v.chainSpecs);
    for (const m of v.mutate || []) {
      if (!records[m.index]) continue;
      if (m.set) Object.assign(records[m.index], m.set);
      if (m.delete) for (const k of m.delete) delete records[m.index][k];
    }
    const r = chainState(records, v.chainOrigin, execs);
    const e = v.expect || {};
    if (e.state && r.state !== e.state) failures.push(v.id + ':STATE');
    if (e.errors !== undefined && r.errors.length !== e.errors) failures.push(v.id + ':ERRORS');
    if (e.errorsMin !== undefined && r.errors.length < e.errorsMin) failures.push(v.id + ':ERRORS_MIN');
    if (e.openSegments !== undefined && r.open.length !== e.openSegments) failures.push(v.id + ':OPEN');
    if (e.tail !== undefined && records.length && records[records.length - 1].record !== e.tail) failures.push(v.id + ':TAIL');
    if (v.sealCtx) {
      const s = sealMode(r.state, r.open, r.failures, v.sealCtx);
      if (e.sealMode && s.mode !== e.sealMode) failures.push(v.id + ':SEAL_MODE');
      if (e.sealExit && s.exit !== e.sealExit) failures.push(v.id + ':SEAL_EXIT');
    }
  }
}

function checkSealVectors(vectors, failures) {
  for (const v of vectors.filter((x) => x.kind === 'seal')) {
    const a = (v.seal.open_segments || []).map(segKey).sort();
    const b = (v.chain.open_segments || []).map(segKey).sort();
    const e = v.expect || {};
    const errors = [];
    if (JSON.stringify(a) !== JSON.stringify(b)) errors.push('SEAL_OPEN_SEGMENT_IDENTITY');
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK:' + errors.join(','));
    if (e.errorsInclude && !errors.includes(e.errorsInclude)) failures.push(v.id + ':ERR');
  }
}

function checkSummaryVectors(vectors, failures) {
  for (const v of vectors.filter((x) => x.kind === 'summary')) {
    const order = v.eventOrder || [];
    const summary = v.summary ? L.deepClone(v.summary) : null;
    const sidecar = v.sidecar ? L.deepClone(v.sidecar) : null;
    const close = v.close ? L.deepClone(v.close) : null;
    if (v.autoHashes && summary && sidecar) summary.failure_code_sha256 = L.sha256Canon(sidecar);
    if (v.autoHashes && summary && close) {
      close.summary_sha256 = L.sha256Canon(summary);
      close.summary_bytes = Buffer.byteLength(L.canon(summary), 'utf8');
    }
    if (v.tamper === 'summary_sha' && close) close.summary_sha256 = '0'.repeat(64);
    if (v.tamper === 'sidecar_sha' && summary) summary.failure_code_sha256 = '0'.repeat(64);
    const errors = [];
    const p = (n) => order.indexOf(n);
    if (p('parts_frozen') < 0) errors.push('PARTS_FROZEN_MISSING');
    if (p('summary_created') < 0) errors.push('SUMMARY_MISSING');
    if (p('close_appended') < 0) errors.push('CLOSE_MISSING');
    if (p('parts_frozen') >= 0 && p('summary_created') >= 0 && p('summary_created') <= p('parts_frozen')) errors.push('SUMMARY_BEFORE_PARTS');
    if (p('summary_created') >= 0 && p('close_appended') >= 0 && p('close_appended') <= p('summary_created')) errors.push('CLOSE_BEFORE_SUMMARY');
    if (v.mutatedAfterClose) errors.push('SUMMARY_MUTATED_AFTER_CLOSE');
    if (!summary || summary.schema !== 'p47-segment-summary-v10') errors.push('SUMMARY_SCHEMA');
    if (!sidecar || sidecar.schema !== 'p47-failure-code-sidecar-v10') errors.push('SIDECAR_SCHEMA');
    if (summary && !TRUSTED.has(summary.produced_by)) errors.push('SUMMARY_PRODUCER');
    if (summary && summary.control_context && summary.control_context.kind !== summary.produced_by) errors.push('SUMMARY_PRODUCER_CONTEXT');
    if (summary && summary.control_context && summary.control_context.exec_id !== summary.exec_id) errors.push('CONTROL_CONTEXT_EXEC');
    if (summary && close && summary.exec_id !== close.exec_id) errors.push('SUMMARY_CLOSE_EXEC');
    if (summary && sidecar && summary.exec_id !== sidecar.exec_id) errors.push('SUMMARY_EXEC');
    if (close && sidecar && close.exec_id !== sidecar.exec_id) errors.push('CLOSE_EXEC');
    if (close && sidecar && close.result !== sidecar.result) errors.push('SIDECAR_CLOSE_RESULT');
    if (summary && close) {
      if (close.summary_sha256 !== L.sha256Canon(summary)) errors.push('CLOSE_SUMMARY_SHA');
      if (close.summary_bytes !== Buffer.byteLength(L.canon(summary), 'utf8')) errors.push('CLOSE_SUMMARY_BYTES');
    }
    if (summary && sidecar && summary.failure_code_sha256 !== L.sha256Canon(sidecar)) errors.push('SUMMARY_SIDECAR_SHA');
    const e = v.expect || {};
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK:' + errors.join(','));
    if (e.errorsInclude && !errors.includes(e.errorsInclude)) failures.push(v.id + ':ERR:' + errors.join(','));
  }
}

function localGateValidate(bundle, config, ctx) {
  const errors = [];
  const req = config.required || [];
  if (!req.length) errors.push('REQUIRED_EMPTY');
  if (!ctx) errors.push('CTX_REQUIRED');
  else {
    for (const f of ['txid', 'rid', 'old_index_digest', 'new_index_digest', 'policy_digest']) {
      if (typeof ctx[f] !== 'string' || !ctx[f]) errors.push('CTX_FIELD:' + f);
    }
  }
  if (!bundle) return errors;
  if (bundle.canonicalization !== 'p47-canon-v1') errors.push('BUNDLE_CANON');
  if (bundle.bundle_digest !== L.sha256Canon((() => { const c = L.deepClone(bundle); delete c.bundle_digest; return c; })())) errors.push('BUNDLE_DIGEST');
  if (ctx) {
    if (bundle.txid !== ctx.txid) errors.push('BUNDLE_TXID');
    if (bundle.rid !== ctx.rid) errors.push('BUNDLE_RID');
    if (bundle.old_index_digest !== ctx.old_index_digest) errors.push('BUNDLE_OLD_INDEX');
    if (bundle.new_index_digest !== ctx.new_index_digest) errors.push('BUNDLE_NEW_INDEX');
    if (bundle.policy_digest !== ctx.policy_digest) errors.push('BUNDLE_POLICY');
  }
  const keys = [];
  for (const inv of bundle.invocations || []) {
    const key = [inv.gate_id, inv.mode, inv.subject_id].join('\u0000');
    keys.push(key);
    if (!ctx || inv.txid !== ctx.txid) errors.push('INVOCATION_TXID');
    if (!ctx || inv.rid !== ctx.rid) errors.push('INVOCATION_RID');
    if (!/^[0-9a-f]{64}$/.test(inv.input_digest || '')) errors.push('INPUT_DIGEST');
    if (!/^[0-9a-f]{64}$/.test(inv.evidence_digest || '')) errors.push('EVIDENCE_DIGEST');
    if (Array.isArray(inv.attempts) && inv.attempts.length) {
      const finals = inv.attempts.filter((a) => a.final === true);
      if (finals.length !== 1 || !finals[0] || finals[0].result !== 'PASS') errors.push('ATTEMPT_FINAL');
      if (inv.attempts.some((a) => a.result === 'FAILED') && bundle.retry_allowed !== true) errors.push('RETRY_NOT_ALLOWED');
    } else if (inv.result !== 'PASS') errors.push('INVOCATION_NOT_PASS');
    if (inv.evidence_present === false) errors.push('EVIDENCE_MISSING');
  }
  const reqKeys = req.map((g) => [g.gate_id, g.mode, g.subject_id].join('\u0000'));
  if (new Set(keys).size !== keys.length) errors.push('INVOCATION_DUPLICATE');
  for (const k of reqKeys) if (!keys.includes(k)) errors.push('INVOCATION_MISSING');
  for (const k of keys) if (!reqKeys.includes(k)) errors.push('INVOCATION_EXTRA');
  const declared = (bundle.required_gates || []).map((g) => [g.gate_id, g.mode, g.subject_id].join('\u0000')).sort();
  if (JSON.stringify(declared) !== JSON.stringify(reqKeys.slice().sort())) errors.push('REQUIRED_GATES_MISMATCH');
  return errors;
}

function buildGate(config, variant) {
  const inv = (config.required || []).map((g) => ({
    gate_id: g.gate_id, mode: g.mode, subject_id: g.subject_id,
    txid: config.txid, rid: config.rid, input_digest: 'a'.repeat(64),
    evidence_digest: 'b'.repeat(64), result: 'PASS', evidence_present: true,
  }));
  if (variant === 'missing') inv.splice(inv.findIndex((x) => x.gate_id === 'checker' && x.mode === 'pending'), 1);
  if (variant === 'duplicate') inv.push(L.deepClone(inv[0]));
  if (variant === 'extra') inv.push({ gate_id: 'checker', mode: 'extra', subject_id: 'op:checker', txid: config.txid, rid: config.rid, input_digest: 'a'.repeat(64), evidence_digest: 'b'.repeat(64), result: 'PASS', evidence_present: true });
  if (variant === 'wrong_subject') inv[0].subject_id = 'op:verifier';
  if (variant === 'wrong_evidence') inv[0].evidence_digest = 'short';
  if (variant === 'retry_allowed' || variant === 'retry_denied') inv[0].attempts = [{ result: 'FAILED', final: false }, { result: 'PASS', final: true }];
  const b = {
    schema: 'p47-gate-bundle-v10', txid: config.txid, rid: config.rid,
    old_index_digest: config.old_index_digest, new_index_digest: config.new_index_digest,
    policy_digest: config.policy_digest, canonicalization: 'p47-canon-v1',
    tool_versions: config.tool_versions, retry_allowed: variant === 'retry_allowed',
    invocations: inv,
    required_gates: (config.required || []).map((g) => ({ gate_id: g.gate_id, mode: g.mode, subject_id: g.subject_id })),
    bundle_digest: null,
  };
  if (variant === 'wrong_txid') b.txid = 'wrong-txid';
  if (variant === 'wrong_old_index') b.old_index_digest = 'f'.repeat(64);
  const copy = L.deepClone(b); delete copy.bundle_digest; b.bundle_digest = L.sha256Canon(copy);
  if (variant === 'bad_digest') b.bundle_digest = '0'.repeat(64);
  return b;
}

function checkGateVectors(vectors, config, failures) {
  for (const v of vectors.filter((x) => x.kind === 'gate')) {
    let cfg = config;
    if (v.variant === 'empty_required') cfg = Object.assign({}, config, { required: [] });
    const b = buildGate(cfg, v.variant);
    const ctx = v.variant === 'no_ctx' ? null : {
      txid: cfg.txid, rid: cfg.rid, old_index_digest: cfg.old_index_digest,
      new_index_digest: cfg.new_index_digest, policy_digest: cfg.policy_digest,
    };
    const errors = localGateValidate(b, cfg, ctx);
    const e = v.expect || {};
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK:' + errors.join(','));
    if (e.errorsInclude && !errors.includes(e.errorsInclude)) failures.push(v.id + ':ERR:' + errors.join(','));
  }
}

function checkSidecarVectors(vectors, map, failures) {
  for (const v of vectors.filter((x) => x.kind === 'sidecar')) {
    if (!v.sidecar) {
      if (v.expect.ok !== false) failures.push(v.id + ':MISSING');
      continue;
    }
    const errors = [];
    const sidecar = v.sidecar;
    const summary = v.summary ? L.deepClone(v.summary) : null;
    const close = v.close ? L.deepClone(v.close) : null;
    if (summary && sidecar) summary.failure_code_sha256 = L.sha256Canon(sidecar);
    if (summary && close) close.summary_sha256 = L.sha256Canon(summary);
    if (v.tamper === 'sidecar_sha' && summary) summary.failure_code_sha256 = '0'.repeat(64);
    if (!['ok', 'failed', 'aborted'].includes(sidecar.result)) errors.push('SIDECAR_RESULT');
    if (!TRUSTED.has(sidecar.produced_by)) errors.push('SIDECAR_PRODUCER');
    if (sidecar.result === 'ok') {
      if (sidecar.failure_class !== null || sidecar.security_trigger !== null || sidecar.failure_code !== null) errors.push('SIDECAR_OK_FIELDS');
    } else {
      const entry = map.codes.find((c) => c.code === sidecar.failure_code);
      if (!entry) errors.push('CODE_UNKNOWN');
      else {
        if (entry.failure_class !== sidecar.failure_class) errors.push('CODE_CLASS');
        if (entry.security_trigger !== sidecar.security_trigger) errors.push('CODE_TRIGGER');
        if (entry.allowed_exec_scope !== 'all-v10-execs' && !(entry.allowed_exec_ids || []).includes(sidecar.exec_id)) errors.push('CODE_EXEC');
      }
    }
    if (summary && summary.exec_id !== sidecar.exec_id) errors.push('SUMMARY_EXEC');
    if (close && close.exec_id !== sidecar.exec_id) errors.push('CLOSE_EXEC');
    if (close && close.result !== sidecar.result) errors.push('SIDECAR_CLOSE_RESULT');
    if (summary && sidecar && summary.failure_code_sha256 !== L.sha256Canon(sidecar)) errors.push('SUMMARY_SIDECAR_SHA');
    if (summary && close && close.summary_sha256 !== L.sha256Canon(summary)) errors.push('CLOSE_SUMMARY_SHA');
    const e = v.expect || {};
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK:' + errors.join(','));
    if (e.errorsInclude && !errors.includes(e.errorsInclude)) failures.push(v.id + ':ERR:' + errors.join(','));
  }
}

function checkCanonVectors(vectors, failures) {
  for (const v of vectors.filter((x) => x.kind === 'canon')) {
    try {
      const out = L.canon(v.value);
      if (v.expectError) failures.push(v.id + ':EXPECTED_ERROR');
      else if (v.expectCanon !== undefined && out !== v.expectCanon) failures.push(v.id + ':CANON');
    } catch (e) {
      if (!v.expectError) failures.push(v.id + ':EXCEPTION');
    }
  }
}

function checkPathVectors(vectors, failures) {
  for (const v of vectors.filter((x) => x.kind === 'path')) {
    try {
      const out = L.normalizeRel(v.value);
      if (out !== v.expectPath) failures.push(v.id + ':PATH:' + out);
    } catch (e) {
      failures.push(v.id + ':EXCEPTION');
    }
  }
}

function checkSchemaSamples(root, vectors, config, failures) {
  const schemas = {};
  for (const f of fs.readdirSync(path.join(root, 'schema'))) {
    if (f.endsWith('.json')) {
      const s = read(root, 'schema/' + f);
      schemas[s.$id] = s;
    }
  }
  const check = (id, obj, label) => {
    const s = schemas[id];
    if (!s) { failures.push('SCHEMA_MISSING:' + id); return; }
    if (!obj || typeof obj !== 'object') { failures.push('SCHEMA_OBJECT:' + label); return; }
    for (const key of s.required || []) {
      if (!(key in obj)) failures.push('SCHEMA_REQUIRED:' + label + ':' + key);
    }
  };
  const byId = (id) => vectors.find((v) => v.id === id);
  const h501 = byId('H5-01-sidecar-valid');
  if (h501) {
    check('p47-failure-code-sidecar-v10', h501.sidecar, 'H5-01.sidecar');
    check('p47-segment-summary-v10', h501.summary, 'H5-01.summary');
  }
  const h507 = byId('H5-07-sidecar-ok-valid');
  if (h507) check('p47-failure-code-sidecar-v10', h507.sidecar, 'H5-07.sidecar');
  const h301 = byId('H3-01-parts-summary-close-ok');
  if (h301) check('p47-segment-summary-v10', h301.summary, 'H3-01.summary');
  const t01 = byId('T01-01-dead-reclaim-blocked');
  if (t01) {
    check('p47-lock-v10', t01.input.main, 'T01-01.main');
    check('p47-reclaim-v10', t01.input.reclaim, 'T01-01.reclaim');
  }
  const i301 = byId('I03-01-fragment-non-authoritative');
  if (i301) check('p47-fragment-seal-v10', i301.seal, 'I03-01.seal');
  check('p47-terminal-seal-v10', {
    schema: 'p47-terminal-seal-v10', mode: 'sealed-full', exit_status: 'complete',
    run_state: 'completed', open_segments: [], chain_state: 'validated-closed',
  }, 'terminal-sample');
  const gate = buildGate(config, 'complete');
  check('p47-gate-bundle-v10', gate, 'gate-sample');
}

function main() {
  const root = __dirname;
  const vectors = read(root, 'vectors/vectors.json').vectors;
  const config = read(root, 'inputs/gate-requirements.json');
  const map = read(root, 'inputs/failure-code-map.json');
  const execs = read(root, 'inputs/exec-registry.json').execs;
  const failures = [];
  checkMap(root, failures);
  checkSchemaSamples(root, vectors, config, failures);
  checkChainVectors(vectors, execs, failures);
  checkSealVectors(vectors, failures);
  checkSummaryVectors(vectors, failures);
  checkGateVectors(vectors, config, failures);
  checkSidecarVectors(vectors, map, failures);
  checkCanonVectors(vectors, failures);
  checkPathVectors(vectors, failures);
  const out = {
    schema: 'p47-independent-static-check-v10',
    status: failures.length ? 'FAILED' : 'PASS',
    status_namespace: 'experiment',
    vectors: vectors.length,
    failures,
    not_run: ['dynamic generator', 'publisher', 'recoverer', 'lab', 'C00-C20', 'Phase 0', 'ACL', 'browser/L1'],
  };
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}

main();
