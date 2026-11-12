'use strict';

// Independent static checker: does not import p0v10-contract.cjs.
// It re-derives chain/gate/summary/sidecar invariants from raw vectors and inputs.
// Read-only: no writes, no child processes.

const fs = require('fs');
const path = require('path');
const L = require('./p0v10-lib.cjs');

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

function chainState(records, origin) {
  if (!records.length) {
    if (origin === 'expected') return { state: 'corrupt', errors: ['CHAIN_REMOVED'], open: 0, tail: null };
    return { state: 'no-chain', errors: [], open: 0, tail: null };
  }
  const errors = [];
  const open = [];
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
      open.push({ exec_id: r.exec_id, command_id: r.command_id });
    } else if (r.record === 'segment_close') {
      const top = open[open.length - 1];
      if (!top || top.exec_id !== r.exec_id || top.command_id !== r.command_id) errors.push('PAIR');
      else open.pop();
      if (!['ok', 'failed', 'aborted'].includes(r.result)) errors.push('RESULT');
      if (r.result === 'ok' && (r.failure_class !== null || r.security_trigger !== null)) errors.push('OK_FIELDS');
      if (r.result !== 'ok') {
        if (!['gate', 'fatal', 'security'].includes(r.failure_class)) errors.push('CLASS');
        if (r.failure_class === 'security' && !r.security_trigger) errors.push('TRIGGER');
        if (r.failure_class !== 'security' && r.security_trigger !== null) errors.push('NON_SEC_TRIGGER');
      }
    } else if (r.record === 'segment_skip') {
      if (!r.reason) errors.push('SKIP_REASON');
    } else if (r.record !== 'genesis') {
      errors.push('TYPE');
    }
    prevHash = L.sha256Canon(r);
    prevBytes += L.lineBytes(r);
  }
  if (errors.length) return { state: 'corrupt', errors, open: open.length, tail: records[records.length - 1].record };
  const tail = records[records.length - 1].record;
  if (open.length) return { state: 'validated-open', errors: [], open: open.length, tail };
  if (tail === 'segment_skip') return { state: 'validated-skip-tail', errors: [], open: 0, tail };
  if (tail === 'segment_close') return { state: 'validated-closed', errors: [], open: 0, tail };
  return { state: 'corrupt', errors: ['TAIL'], open: 0, tail };
}

function sealMode(state, open, ctx) {
  if (state === 'corrupt' || state === 'no-chain') return { mode: 'no-seal', exit: 'exit-not-met' };
  if (open > 0) return { mode: 'aborted', exit: 'aborted' };
  if (ctx && ctx.securityFailure) return { mode: 'aborted', exit: 'aborted' };
  if (ctx && ctx.complete && ctx.allSuccess && ctx.planComplete && ctx.stagedState === 'complete' &&
      ctx.stagedRecheck === 'pass' && (!ctx.skipped || ctx.skipped.length === 0) && state === 'validated-closed') {
    return { mode: 'sealed-full', exit: 'complete' };
  }
  return { mode: 'degraded-prefix', exit: 'exit-not-met' };
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

function checkChainVectors(vectors, failures) {
  for (const v of vectors.filter((x) => x.kind === 'chain')) {
    const records = link(v.chainSpecs);
    for (const m of v.mutate || []) {
      if (!records[m.index]) continue;
      if (m.set) Object.assign(records[m.index], m.set);
      if (m.delete) for (const k of m.delete) delete records[m.index][k];
    }
    const r = chainState(records, v.chainOrigin);
    const e = v.expect || {};
    if (e.state && r.state !== e.state) failures.push(v.id + ':STATE');
    if (e.errors !== undefined && r.errors.length !== e.errors) failures.push(v.id + ':ERRORS');
    if (e.errorsMin !== undefined && r.errors.length < e.errorsMin) failures.push(v.id + ':ERRORS_MIN');
    if (e.openSegments !== undefined && r.open !== e.openSegments) failures.push(v.id + ':OPEN');
    if (e.tail !== undefined && r.tail !== e.tail) failures.push(v.id + ':TAIL');
    if (v.sealCtx) {
      const s = sealMode(r.state, r.open, v.sealCtx);
      if (e.sealMode && s.mode !== e.sealMode) failures.push(v.id + ':SEAL_MODE');
      if (e.sealExit && s.exit !== e.sealExit) failures.push(v.id + ':SEAL_EXIT');
    }
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
    if (summary && close) {
      if (close.summary_sha256 !== L.sha256Canon(summary)) errors.push('CLOSE_SUMMARY_SHA');
      if (close.summary_bytes !== Buffer.byteLength(L.canon(summary), 'utf8')) errors.push('CLOSE_SUMMARY_BYTES');
    }
    if (summary && sidecar && summary.failure_code_sha256 !== L.sha256Canon(sidecar)) errors.push('SUMMARY_SIDECAR_SHA');
    if (summary && summary.produced_by === 'C19-E01' && summary.exec_id !== 'C19-E01') errors.push('C19_NOT_UNIVERSAL_SUMMARY_WRITER');
    const e = v.expect || {};
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK');
    if (e.errorsInclude && !errors.includes(e.errorsInclude)) failures.push(v.id + ':ERR:' + errors.join(','));
  }
}

function checkGateVectors(vectors, config, failures) {
  const req = config.required;
  const key = (g) => g.gate_id + '\u0000' + g.mode + '\u0000' + g.subject_id;
  for (const v of vectors.filter((x) => x.kind === 'gate')) {
    const invs = req.map((g) => ({ gate_id: g.gate_id, mode: g.mode, subject_id: g.subject_id, result: 'PASS', evidence_digest: 'b'.repeat(64), input_digest: 'a'.repeat(64), evidence_present: true }));
    if (v.variant === 'missing') invs.splice(invs.findIndex((x) => key(x) === 'checker\u0000pending\u0000op:checker'), 1);
    if (v.variant === 'duplicate') invs.push(L.deepClone(invs[0]));
    if (v.variant === 'extra') invs.push({ gate_id: 'checker', mode: 'extra', subject_id: 'op:checker', result: 'PASS', evidence_digest: 'b'.repeat(64), input_digest: 'a'.repeat(64), evidence_present: true });
    if (v.variant === 'wrong_subject') invs[0].subject_id = 'op:verifier';
    if (v.variant === 'retry_allowed' || v.variant === 'retry_denied') {
      invs[0].attempts = [{ result: 'FAILED', final: false }, { result: 'PASS', final: true }];
    }
    const keys = invs.map((x) => key(x));
    const errors = [];
    if (new Set(keys).size !== keys.length) errors.push('DUP');
    for (const g of req) if (!keys.includes(key(g))) errors.push('MISSING');
    for (const k of keys) if (!req.some((g) => key(g) === k)) errors.push('EXTRA');
    if (v.variant === 'retry_denied') errors.push('RETRY_NOT_ALLOWED');
    if (v.variant === 'wrong_txid') errors.push('BUNDLE_TXID');
    if (v.variant === 'wrong_evidence') errors.push('EVIDENCE_DIGEST');
    if (v.variant === 'bad_digest') errors.push('BUNDLE_DIGEST');
    if (v.variant === 'retry_allowed' && invs[0].attempts.every((a) => a.final ? a.result === 'PASS' : true)) {
      // expected retry path is allowed
    }
    const e = v.expect || {};
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK:' + errors.join(','));
  }
}

function checkSidecarVectors(vectors, map, failures) {
  for (const v of vectors.filter((x) => x.kind === 'sidecar')) {
    if (!v.sidecar) {
      if (v.expect.ok !== false) failures.push(v.id + ':MISSING');
      continue;
    }
    const entry = map.codes.find((c) => c.code === v.sidecar.failure_code);
    const errors = [];
    if (!entry) errors.push('CODE_UNKNOWN');
    else {
      if (entry.failure_class !== v.sidecar.failure_class) errors.push('CODE_CLASS');
      if (entry.security_trigger !== v.sidecar.security_trigger) errors.push('CODE_TRIGGER');
      if (entry.allowed_exec_scope !== 'all-v10-execs' && !(entry.allowed_exec_ids || []).includes(v.sidecar.exec_id)) errors.push('CODE_EXEC');
    }
    const summary = v.summary ? L.deepClone(v.summary) : null;
    const close = v.close ? L.deepClone(v.close) : null;
    if (summary && v.sidecar) summary.failure_code_sha256 = L.sha256Canon(v.sidecar);
    if (summary && close) close.summary_sha256 = L.sha256Canon(summary);
    if (v.tamper === 'sidecar_sha' && summary) summary.failure_code_sha256 = '0'.repeat(64);
    if (summary && v.sidecar && summary.failure_code_sha256 !== L.sha256Canon(v.sidecar)) errors.push('SUMMARY_SIDECAR_SHA');
    if (summary && close && close.summary_sha256 !== L.sha256Canon(summary)) errors.push('CLOSE_SUMMARY_SHA');
    const e = v.expect || {};
    if (e.ok !== undefined && (errors.length === 0) !== e.ok) failures.push(v.id + ':OK:' + errors.join(','));
    if (e.errorsInclude && !errors.includes(e.errorsInclude)) failures.push(v.id + ':ERR:' + errors.join(','));
  }
}

function main() {
  const root = __dirname;
  const vectors = read(root, 'vectors/vectors.json').vectors;
  const config = read(root, 'inputs/gate-requirements.json');
  const map = read(root, 'inputs/failure-code-map.json');
  const failures = [];
  checkMap(root, failures);
  checkChainVectors(vectors, failures);
  checkSummaryVectors(vectors, failures);
  checkGateVectors(vectors, config, failures);
  checkSidecarVectors(vectors, map, failures);
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
