'use strict';

const L = require('./p0v10-lib.cjs');

const CHAIN_SCHEMA = 'p47-chain-record-v9';
const SUMMARY_SCHEMA = 'p47-segment-summary-v10';
const SIDECAR_SCHEMA = 'p47-failure-code-sidecar-v10';
const SEAL_SCHEMA = 'p47-terminal-seal-v10';
const FRAGMENT_SEAL_SCHEMA = 'p47-fragment-seal-v10';
const GATE_BUNDLE_SCHEMA = 'p47-gate-bundle-v10';

const STOP = Object.freeze({
  NORMAL: 'NORMAL',
  CONTINUE: 'CONTINUE',
  BUSINESS_HALT: 'BUSINESS_HALT',
  HALT_ALL: 'HALT_ALL',
  SECURITY_HALT: 'SECURITY_HALT',
  CHAIN_FATAL: 'CHAIN_FATAL',
  ORPHAN_HALT: 'ORPHAN_HALT',
  PRE_RUN_HALT: 'PRE_RUN_HALT',
});

const SEAL = Object.freeze({
  FULL: 'sealed-full',
  ABORTED: 'aborted',
  DEGRADED: 'degraded-prefix',
  NONE: 'no-seal',
});

function linkChain(specs) {
  let prevHash = null;
  let prevBytes = 0;
  return specs.map((spec, index) => {
    const record = Object.assign({}, spec, {
      schema: CHAIN_SCHEMA,
      chain_seq: index + 1,
      prev_record_sha256: prevHash,
      prev_file_bytes: prevBytes,
    });
    prevHash = L.sha256Canon(record);
    prevBytes += L.lineBytes(record);
    return record;
  });
}

function chainError(errors, index, code, detail) {
  errors.push({ index, code, detail });
}

function classifyChain(records, opts) {
  const options = opts || {};
  if (!Array.isArray(records)) {
    return {
      state: 'corrupt',
      tail: null,
      open_segments: [],
      record_count: 0,
      last_record_sha256: null,
      errors: [{ index: 0, code: 'CHAIN_NOT_ARRAY', detail: 'records must be array' }],
      validated_prefix_len: 0,
    };
  }
  if (records.length === 0) {
    if (options.origin === 'expected') {
      return {
        state: 'corrupt',
        tail: null,
        open_segments: [],
        record_count: 0,
        last_record_sha256: null,
        errors: [{ index: 0, code: 'CHAIN_REMOVED', detail: 'expected chain is absent' }],
        validated_prefix_len: 0,
        origin: options.origin,
      };
    }
    return {
      state: 'no-chain',
      tail: null,
      open_segments: [],
      record_count: 0,
      last_record_sha256: null,
      errors: [],
      validated_prefix_len: 0,
      origin: options.origin || 'absent',
    };
  }

  const errors = [];
  const open = [];
  let prev = null;
  let prevHash = null;
  let prevBytes = 0;

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    if (!r || typeof r !== 'object') {
      chainError(errors, i, 'RECORD_NOT_OBJECT', 'record is not object');
      break;
    }
    if (r.schema !== CHAIN_SCHEMA) chainError(errors, i, 'SCHEMA', 'unexpected schema');
    if (r.chain_seq !== i + 1) chainError(errors, i, 'SEQ', 'chain_seq mismatch');
    if (i === 0) {
      if (r.record !== 'genesis') chainError(errors, i, 'GENESIS_REQUIRED', 'first record must be genesis');
      if (r.prev_record_sha256 !== null) chainError(errors, i, 'GENESIS_PREV', 'genesis prev must be null');
      if (r.prev_file_bytes !== 0) chainError(errors, i, 'GENESIS_BYTES', 'genesis bytes must be 0');
    } else {
      if (r.prev_record_sha256 !== prevHash) chainError(errors, i, 'PREV_HASH', 'prev_record_sha256 mismatch');
      if (r.prev_file_bytes !== prevBytes) chainError(errors, i, 'PREV_BYTES', 'prev_file_bytes mismatch');
    }

    const type = r.record;
    if (type === 'segment_open') {
      if (typeof r.exec_id !== 'string' || r.exec_id.length === 0) chainError(errors, i, 'OPEN_EXEC', 'open missing exec_id');
      open.push({ exec_id: r.exec_id, command_id: r.command_id, segment_dir: r.segment_dir, chain_seq: r.chain_seq });
    } else if (type === 'segment_close') {
      const top = open[open.length - 1];
      if (!top) {
        chainError(errors, i, 'CLOSE_WITHOUT_OPEN', 'close without open');
      } else if (top.exec_id !== r.exec_id || top.command_id !== r.command_id) {
        chainError(errors, i, 'CLOSE_PAIR', 'close does not match top open');
      } else {
        open.pop();
      }
      if (!['ok', 'failed', 'aborted'].includes(r.result)) chainError(errors, i, 'CLOSE_RESULT', 'invalid result');
      if (r.result === 'ok') {
        if (r.failure_class !== null) chainError(errors, i, 'CLOSE_OK_CLASS', 'ok close must have null failure_class');
        if (r.security_trigger !== null) chainError(errors, i, 'CLOSE_OK_TRIGGER', 'ok close must have null security_trigger');
      } else {
        if (!['gate', 'fatal', 'security'].includes(r.failure_class)) chainError(errors, i, 'CLOSE_CLASS', 'failed/aborted close needs class');
        if (r.failure_class === 'security') {
          if (typeof r.security_trigger !== 'string' || r.security_trigger.length === 0) {
            chainError(errors, i, 'CLOSE_SECURITY_TRIGGER', 'security close needs trigger');
          }
        } else if (r.security_trigger !== null) {
          chainError(errors, i, 'CLOSE_NON_SECURITY_TRIGGER', 'non-security close trigger must be null');
        }
      }
    } else if (type === 'segment_skip') {
      if (typeof r.reason !== 'string' || r.reason.length === 0) chainError(errors, i, 'SKIP_REASON', 'skip needs reason');
    } else if (type === 'genesis' && i !== 0) {
      chainError(errors, i, 'GENESIS_POSITION', 'genesis only at index 0');
    } else if (type !== 'genesis') {
      chainError(errors, i, 'RECORD_TYPE', 'unknown record type');
    }

    try {
      L.canon(r);
    } catch (err) {
      chainError(errors, i, 'CANON', err.message);
    }

    prev = r;
    prevHash = L.sha256Canon(r);
    prevBytes += L.lineBytes(r);
  }

  if (errors.length > 0) {
    return {
      state: 'corrupt',
      tail: records.length > 0 ? records[records.length - 1].record : null,
      open_segments: open,
      record_count: records.length,
      last_record_sha256: prev ? L.sha256Canon(prev) : null,
      errors,
      validated_prefix_len: errors[0].index,
      origin: options.origin || 'present',
    };
  }

  const tail = records[records.length - 1].record;
  let state;
  if (open.length > 0) state = 'validated-open';
  else if (tail === 'segment_skip') state = 'validated-skip-tail';
  else if (tail === 'segment_close') state = 'validated-closed';
  else state = 'corrupt';

  if (state === 'corrupt') {
    errors.push({ index: records.length - 1, code: 'TAIL_NOT_TERMINAL', detail: 'tail is not close/skip/open' });
  }

  return {
    state,
    tail,
    open_segments: open,
    record_count: records.length,
    last_record_sha256: prev ? L.sha256Canon(prev) : null,
    errors,
    validated_prefix_len: errors.length ? errors[0].index : records.length,
    origin: options.origin || 'present',
  };
}

function sealDecision(chain, ctx) {
  const c = ctx || {};
  if (!chain || chain.state === 'corrupt' || chain.state === 'no-chain') {
    return { mode: SEAL.NONE, exit: 'exit-not-met', run_state: 'aborted', reason: 'no-authoritative-chain' };
  }
  if (chain.open_segments && chain.open_segments.length > 0) {
    return { mode: SEAL.ABORTED, exit: 'aborted', run_state: 'aborted', reason: 'open-segments' };
  }
  if (c.securityFailure) {
    return { mode: SEAL.ABORTED, exit: 'aborted', run_state: 'aborted', reason: 'security-failure' };
  }
  const complete = c.complete === true && c.allSuccess === true && c.planComplete === true &&
    c.stagedState === 'complete' && c.stagedRecheck === 'pass' &&
    (!c.skipped || c.skipped.length === 0) && chain.state === 'validated-closed';
  if (complete) {
    return { mode: SEAL.FULL, exit: 'complete', run_state: 'completed', reason: 'complete' };
  }
  return { mode: SEAL.DEGRADED, exit: 'exit-not-met', run_state: 'aborted', reason: 'degraded' };
}

function validateTerminalSeal(seal, chain, ctx) {
  const errors = [];
  if (!seal || seal.schema !== SEAL_SCHEMA) errors.push('SEAL_SCHEMA');
  const expected = sealDecision(chain, ctx);
  if (seal && seal.mode !== expected.mode) errors.push('SEAL_MODE');
  if (seal && seal.exit_status !== expected.exit) errors.push('SEAL_EXIT');
  if (seal && seal.run_state !== expected.run_state) errors.push('SEAL_RUN_STATE');
  if (seal && Array.isArray(seal.open_segments)) {
    if (seal.open_segments.length !== (chain.open_segments || []).length) errors.push('SEAL_OPEN_SEGMENTS');
  } else {
    errors.push('SEAL_OPEN_SEGMENTS_FIELD');
  }
  if (seal && seal.mode === SEAL.FULL && seal.exit_status !== 'complete') errors.push('SEAL_FULL_EXIT');
  if (seal && seal.mode === SEAL.ABORTED && seal.exit_status !== 'aborted') errors.push('SEAL_ABORTED_EXIT');
  if (seal && seal.mode === SEAL.DEGRADED && seal.exit_status !== 'exit-not-met') errors.push('SEAL_DEGRADED_EXIT');
  return { ok: errors.length === 0, errors, expected };
}

function stopDecision(input) {
  const i = input || {};
  if (!i.failure) {
    return {
      stop_class: STOP.NORMAL,
      allow_normal: true,
      allow_independent: true,
      allow_finalizer: true,
      allow_unique_after: false,
      allow_seal: true,
      chain_append: 'normal',
      seal_hint: null,
      reason: 'no-failure',
    };
  }
  if (i.chainState === 'corrupt') {
    return {
      stop_class: STOP.CHAIN_FATAL, allow_normal: false, allow_independent: false,
      allow_finalizer: false, allow_unique_after: false, allow_seal: false,
      chain_append: 'none', seal_hint: 'no-seal', reason: 'chain-corrupt',
    };
  }
  if (i.chainState === 'validated-open') {
    return {
      stop_class: STOP.ORPHAN_HALT, allow_normal: false, allow_independent: false,
      allow_finalizer: false, allow_unique_after: false, allow_seal: true,
      chain_append: 'none', seal_hint: SEAL.ABORTED, reason: 'orphan',
    };
  }
  if (i.preRunFailed || i.chainState === 'no-chain') {
    return {
      stop_class: STOP.PRE_RUN_HALT, allow_normal: false, allow_independent: false,
      allow_finalizer: false, allow_unique_after: false, allow_seal: false,
      chain_append: 'none', seal_hint: 'no-seal', reason: 'pre-run-or-no-chain',
    };
  }

  const failureClass = i.failure.class;
  const execClass = i.failure.execClass;
  const trustedA = i.targetStarted === true && i.trustedClose === true && i.priorAAttempted !== true;
  const security = i.securitySeen === true || failureClass === 'security';

  if (security) {
    return {
      stop_class: STOP.SECURITY_HALT, allow_normal: false, allow_independent: false,
      allow_finalizer: false, allow_unique_after: trustedA, allow_seal: true,
      chain_append: 'protocol-only', seal_hint: SEAL.ABORTED, reason: 'security',
    };
  }
  if (failureClass === 'gate') {
    return {
      stop_class: STOP.CONTINUE, allow_normal: true, allow_independent: true,
      allow_finalizer: true, allow_unique_after: trustedA, allow_seal: true,
      chain_append: 'normal', seal_hint: null, reason: 'non-security-gate',
    };
  }
  if (failureClass === 'fatal') {
    if (execClass === 'target' || execClass === 'baseline') {
      return {
        stop_class: STOP.BUSINESS_HALT, allow_normal: false, allow_independent: false,
        allow_finalizer: true, allow_unique_after: trustedA, allow_seal: true,
        chain_append: 'protocol-only', seal_hint: SEAL.DEGRADED, reason: 'fatal-target-baseline',
      };
    }
    return {
      stop_class: STOP.HALT_ALL, allow_normal: false, allow_independent: false,
      allow_finalizer: false, allow_unique_after: trustedA, allow_seal: true,
      chain_append: 'protocol-only', seal_hint: SEAL.DEGRADED, reason: 'fatal-infra-before-after-finalizer-bind-seal',
    };
  }
  return {
    stop_class: STOP.HALT_ALL, allow_normal: false, allow_independent: false,
    allow_finalizer: false, allow_unique_after: false, allow_seal: true,
    chain_append: 'protocol-only', seal_hint: SEAL.DEGRADED, reason: 'unknown-failure-class',
  };
}

function validateSummaryLifecycle(input) {
  const i = input || {};
  const errors = [];
  const order = Array.isArray(i.eventOrder) ? i.eventOrder : [];
  const pos = (name) => order.indexOf(name);
  const pParts = pos('parts_frozen');
  const pSummary = pos('summary_created');
  const pClose = pos('close_appended');
  if (pParts < 0) errors.push('PARTS_FROZEN_MISSING');
  if (pSummary < 0) errors.push('SUMMARY_MISSING');
  if (pClose < 0) errors.push('CLOSE_MISSING');
  if (pParts >= 0 && pSummary >= 0 && pSummary <= pParts) errors.push('SUMMARY_BEFORE_PARTS');
  if (pSummary >= 0 && pClose >= 0 && pClose <= pSummary) errors.push('CLOSE_BEFORE_SUMMARY');
  if (i.mutatedAfterClose === true) errors.push('SUMMARY_MUTATED_AFTER_CLOSE');

  const summary = i.summary;
  const close = i.close;
  const sidecar = i.sidecar;
  if (!summary || summary.schema !== SUMMARY_SCHEMA) errors.push('SUMMARY_SCHEMA');
  if (!close) errors.push('CLOSE_OBJECT');
  if (!sidecar || sidecar.schema !== SIDECAR_SCHEMA) errors.push('SIDECAR_SCHEMA');

  if (summary && close) {
    let digest = null;
    try { digest = L.sha256Canon(summary); } catch (e) { errors.push('SUMMARY_CANON'); }
    if (digest && close.summary_sha256 !== digest) errors.push('CLOSE_SUMMARY_SHA');
    if (typeof close.summary_bytes === 'number') {
      let bytes = null;
      try { bytes = Buffer.byteLength(L.canon(summary), 'utf8'); } catch (e) { errors.push('SUMMARY_BYTES_CANON'); }
      if (bytes !== null && close.summary_bytes !== bytes) errors.push('CLOSE_SUMMARY_BYTES');
    } else {
      errors.push('CLOSE_SUMMARY_BYTES_FIELD');
    }
  }
  if (summary && sidecar) {
    let sdigest = null;
    try { sdigest = L.sha256Canon(sidecar); } catch (e) { errors.push('SIDECAR_CANON'); }
    if (sdigest && summary.failure_code_sha256 !== sdigest) errors.push('SUMMARY_SIDECAR_SHA');
    if (sidecar.exec_id !== summary.exec_id) errors.push('SIDECAR_EXEC');
  }
  if (summary && summary.produced_by && summary.exec_id) {
    const producer = summary.produced_by;
    if (producer === 'C19-E01' && summary.exec_id !== 'C19-E01') errors.push('C19_NOT_UNIVERSAL_SUMMARY_WRITER');
    if (producer !== 'dispatcher' && producer !== 'audit-control' && producer !== summary.exec_id) {
      errors.push('SUMMARY_PRODUCER');
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateFailureMap(map, triggerRegistry, execRegistry) {
  const errors = [];
  if (!map || map.schema !== 'p47-failure-code-map-v10') errors.push('MAP_SCHEMA');
  if (!Array.isArray(map && map.codes)) errors.push('MAP_CODES');
  const triggers = new Set(Array.isArray(triggerRegistry) ? triggerRegistry : (triggerRegistry && triggerRegistry.triggers) || []);
  const execs = new Set(Array.isArray(execRegistry) ? execRegistry.map((e) => e.exec_id || e) : []);
  const seen = new Set();
  for (const entry of (map && map.codes) || []) {
    if (!entry || typeof entry.code !== 'string' || entry.code.length === 0) {
      errors.push('CODE_MISSING'); continue;
    }
    if (seen.has(entry.code)) errors.push('CODE_DUPLICATE:' + entry.code);
    seen.add(entry.code);
    if (!['gate', 'fatal', 'security'].includes(entry.failure_class)) errors.push('CLASS:' + entry.code);
    if (entry.failure_class === 'security') {
      if (typeof entry.security_trigger !== 'string' || !triggers.has(entry.security_trigger)) {
        errors.push('SECURITY_TRIGGER:' + entry.code);
      }
    } else if (entry.security_trigger !== null) {
      errors.push('NON_SECURITY_TRIGGER:' + entry.code);
    }
    if (entry.allowed_exec_scope === 'all-v10-execs') {
      if (typeof entry.exec_registry_digest !== 'string' || entry.exec_registry_digest.length !== 64) {
        errors.push('ALL_EXEC_DIGEST:' + entry.code);
      }
    } else if (Array.isArray(entry.allowed_operations) && entry.allowed_operations.length > 0 && (!entry.allowed_exec_ids || entry.allowed_exec_ids.length === 0)) {
      // operation-only subject is valid; no exec IDs required
    } else {
      if (!Array.isArray(entry.allowed_exec_ids) || entry.allowed_exec_ids.length === 0) {
        errors.push('EXEC_IDS:' + entry.code);
      } else {
        for (const id of entry.allowed_exec_ids) {
          if (id === '*' || (execs.size > 0 && !execs.has(id))) errors.push('EXEC_UNKNOWN:' + entry.code + ':' + id);
        }
      }
    }
    if (entry.allowed_operations !== undefined) {
      if (!Array.isArray(entry.allowed_operations)) errors.push('OPERATIONS:' + entry.code);
    }
    if ((!entry.allowed_exec_ids || entry.allowed_exec_ids.length === 0) &&
        (!entry.allowed_operations || entry.allowed_operations.length === 0) &&
        entry.allowed_exec_scope !== 'all-v10-execs') {
      errors.push('SUBJECT_EMPTY:' + entry.code);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateFailureSidecar(sidecar, map, summary, close, execRegistry) {
  const errors = [];
  if (!sidecar || sidecar.schema !== SIDECAR_SCHEMA) errors.push('SIDECAR_SCHEMA');
  if (!summary || summary.schema !== SUMMARY_SCHEMA) errors.push('SUMMARY_SCHEMA');
  if (!close) errors.push('CLOSE_MISSING');
  if (!sidecar) return { ok: false, errors };
  if (!Number.isInteger(sidecar.exit_code)) errors.push('SIDECAR_EXIT');
  if (!['failed', 'aborted'].includes(sidecar.result)) errors.push('SIDECAR_RESULT');
  if (!['gate', 'fatal', 'security'].includes(sidecar.failure_class)) errors.push('SIDECAR_CLASS');
  if (sidecar.failure_class === 'security') {
    if (typeof sidecar.security_trigger !== 'string' || sidecar.security_trigger.length === 0) errors.push('SIDECAR_SECURITY_TRIGGER');
  } else if (sidecar.security_trigger !== null) {
    errors.push('SIDECAR_NON_SECURITY_TRIGGER');
  }
  const entry = ((map && map.codes) || []).find((c) => c.code === sidecar.failure_code);
  if (!entry) {
    errors.push('CODE_UNKNOWN');
  } else {
    if (entry.failure_class !== sidecar.failure_class) errors.push('CODE_CLASS');
    if (entry.security_trigger !== sidecar.security_trigger) errors.push('CODE_TRIGGER');
    if (entry.allowed_exec_scope !== 'all-v10-execs') {
      if (!Array.isArray(entry.allowed_exec_ids) || !entry.allowed_exec_ids.includes(sidecar.exec_id)) errors.push('CODE_EXEC');
    }
    if (Array.isArray(entry.exit_codes) && entry.exit_codes.length > 0 && !entry.exit_codes.includes(sidecar.exit_code)) {
      errors.push('CODE_EXIT');
    }
  }
  if (summary && sidecar) {
    let sdigest = null;
    try { sdigest = L.sha256Canon(sidecar); } catch (e) { errors.push('SIDECAR_CANON'); }
    if (sdigest && summary.failure_code_sha256 !== sdigest) errors.push('SUMMARY_SIDECAR_SHA');
    if (summary.exec_id !== sidecar.exec_id) errors.push('SUMMARY_EXEC');
  }
  if (summary && close) {
    let sumDigest = null;
    try { sumDigest = L.sha256Canon(summary); } catch (e) { errors.push('SUMMARY_CANON'); }
    if (sumDigest && close.summary_sha256 !== sumDigest) errors.push('CLOSE_SUMMARY_SHA');
    if (close.result && close.result !== sidecar.result) errors.push('SIDECAR_CLOSE_RESULT');
  }
  if (sidecar.produced_by !== 'dispatcher' && sidecar.produced_by !== 'audit-control') {
    errors.push('SIDECAR_PRODUCER');
  }
  return { ok: errors.length === 0, errors, code: sidecar.failure_code };
}

function projectFailureCode(input) {
  const i = input || {};
  if (i.close && i.close.result === 'ok') {
    return { ok: true, failure_code: null, failure_class: null, security_trigger: null };
  }
  if (!i.sidecar) {
    return { ok: false, errors: ['SIDECAR_REQUIRED'], failure_code: null };
  }
  const r = validateFailureSidecar(i.sidecar, i.map, i.summary, i.close, i.execRegistry);
  return Object.assign({}, r, { failure_code: r.code || i.sidecar.failure_code });
}

function reclaimDecision(input) {
  const i = input || {};
  const incomplete = (x) => !x || x.schema === undefined || x.token === undefined || x.pid === undefined;
  if (!i.main) return { action: 'ACQUIRE', reason: 'no-main-lock' };
  if (incomplete(i.main)) return { action: 'BLOCKED_MANUAL', reason: 'main-incomplete' };
  if (i.mainAlive === true) return { action: 'LOCKED', reason: 'main-alive' };
  if (!i.reclaim) return { action: 'RECLAIM_INSTALL', reason: 'reclaim-absent' };
  if (incomplete(i.reclaim)) return { action: 'BLOCKED_MANUAL', reason: 'reclaim-incomplete' };
  if (i.reclaimAlive === true) return { action: 'LOCKED_RECLAIM', reason: 'reclaim-alive' };
  return { action: 'BLOCKED_MANUAL', reason: 'reclaim-dead' };
}

function evaluateProtect(policy, intent) {
  if (!policy || !Array.isArray(policy.rules)) return { decision: 'deny', rule_id: null, reason: 'policy-invalid' };
  let deny = null;
  let allow = null;
  for (const rule of policy.rules) {
    const paths = rule.paths || [];
    const hit = paths.some((p) => L.isPathPrefix(p, intent.path));
    if (!hit) continue;
    const subjectOk = !rule.subject_ids || rule.subject_ids.includes(intent.subject_id);
    const kindOk = !rule.subject_kinds || rule.subject_kinds.includes(intent.subject_kind);
    const opOk = !rule.ops || rule.ops.includes(intent.op);
    const phaseOk = !rule.phases || rule.phases.includes('always') || rule.phases.includes(intent.phase);
    const aclOk = intent.op === 'acl' && intent.acl_metadata === true &&
      rule.acl_exception && rule.acl_exception.allowed === true &&
      (!rule.acl_exception.subject_ids || rule.acl_exception.subject_ids.includes(intent.subject_id));
    if (subjectOk && kindOk && opOk && phaseOk) {
      allow = rule;
    } else if (aclOk) {
      allow = rule;
    } else {
      deny = { rule, reason: 'subject-op-phase-mismatch' };
    }
  }
  if (deny) return { decision: 'deny', rule_id: deny.rule.id, reason: deny.reason };
  if (allow) return { decision: 'allow', rule_id: allow.id, reason: 'matched' };
  return { decision: 'allow', rule_id: null, reason: 'not-protected' };
}

function memberRecord(entry) {
  return {
    path: L.normalizeRel(entry.path),
    kind: entry.kind || 'file',
    bytes: entry.bytes === undefined ? null : entry.bytes,
    sha256: entry.sha256 || null,
  };
}

function classifyMemberDelta(oldMembers, newMembers) {
  const oldMap = new Map();
  const newMap = new Map();
  for (const e of oldMembers || []) {
    const r = memberRecord(e);
    if (oldMap.has(r.path)) throw new Error('duplicate old member: ' + r.path);
    oldMap.set(r.path, r);
  }
  for (const e of newMembers || []) {
    const r = memberRecord(e);
    if (newMap.has(r.path)) throw new Error('duplicate new member: ' + r.path);
    newMap.set(r.path, r);
  }
  let conflict = null;
  for (const [op, ov] of oldMap) {
    for (const [np, nv] of newMap) {
      if (op === np) {
        if (ov.kind !== nv.kind) conflict = { path: op, reason: 'same-path-kind-change' };
        continue;
      }
      if (L.isPathPrefix(op, np) || L.isPathPrefix(np, op)) {
        conflict = { path: op + ' <-> ' + np, reason: 'file-dir-prefix-change' };
      }
    }
  }
  const add = [];
  const del = [];
  const modify = [];
  const keep = [];
  for (const [p, nv] of newMap) {
    if (!oldMap.has(p)) add.push(nv);
    else {
      const ov = oldMap.get(p);
      if (ov.bytes === nv.bytes && ov.sha256 === nv.sha256) keep.push(nv);
      else modify.push({ path: p, before: ov, after: nv });
    }
  }
  for (const [p, ov] of oldMap) {
    if (!newMap.has(p)) del.push(ov);
  }
  return {
    ok: conflict === null,
    conflict,
    delta: { add, delete: del, modify, keep },
    union: L.sortedUnique(Array.from(oldMap.keys()).concat(Array.from(newMap.keys()))),
  };
}

function gateKey(g) {
  return String(g.gate_id) + '\u0000' + String(g.mode) + '\u0000' + String(g.subject_id);
}

function validateGateBundle(bundle, requiredConfig, ctx) {
  const errors = [];
  const config = requiredConfig || {};
  const required = config.required || [];
  const reqKeys = required.map(gateKey);
  const reqSet = new Set(reqKeys);
  if (reqSet.size !== reqKeys.length) errors.push('REQUIRED_DUPLICATE');
  if (!bundle || bundle.schema !== GATE_BUNDLE_SCHEMA) errors.push('BUNDLE_SCHEMA');
  if (!bundle) return { ok: false, errors, present: [], required: reqKeys };
  if (bundle.canonicalization !== 'p47-canon-v1') errors.push('BUNDLE_CANON');
  if (typeof bundle.old_index_digest !== 'string' || bundle.old_index_digest.length !== 64) errors.push('OLD_INDEX_DIGEST');
  if (typeof bundle.bundle_digest !== 'string' || bundle.bundle_digest.length !== 64) {
    errors.push('BUNDLE_DIGEST');
  } else {
    const copy = L.deepClone(bundle);
    delete copy.bundle_digest;
    if (L.sha256Canon(copy) !== bundle.bundle_digest) errors.push('BUNDLE_DIGEST');
  }
  if (Array.isArray(bundle.required_gates)) {
    const declared = bundle.required_gates.map(gateKey).sort();
    const expected = reqKeys.slice().sort();
    if (JSON.stringify(declared) !== JSON.stringify(expected)) errors.push('REQUIRED_GATES_MISMATCH');
  } else {
    errors.push('REQUIRED_GATES_MISSING');
  }
  if (ctx && bundle.txid !== ctx.txid) errors.push('BUNDLE_TXID');
  if (ctx && bundle.rid !== ctx.rid) errors.push('BUNDLE_RID');
  if (ctx && config.txid && bundle.txid !== config.txid) errors.push('CONFIG_TXID');
  if (ctx && config.rid && bundle.rid !== config.rid) errors.push('CONFIG_RID');
  if (ctx && config.new_index_digest && bundle.new_index_digest !== config.new_index_digest) errors.push('NEW_INDEX');
  if (ctx && config.policy_digest && bundle.policy_digest !== config.policy_digest) errors.push('POLICY');
  if (ctx && config.tool_versions) {
    for (const [k, v] of Object.entries(config.tool_versions)) {
      if (!bundle.tool_versions || bundle.tool_versions[k] !== v) errors.push('TOOL_VERSION:' + k);
    }
  }
  const invocations = Array.isArray(bundle.invocations) ? bundle.invocations : [];
  const seen = new Set();
  const byKey = new Map();
  for (const inv of invocations) {
    const key = inv.gate_invocation_id || gateKey(inv);
    if (inv.gate_invocation_id && inv.gate_invocation_id !== gateKey(inv)) {
      errors.push('INVOCATION_ID_MISMATCH:' + key);
    }
    if (seen.has(key)) errors.push('INVOCATION_DUPLICATE:' + key);
    seen.add(key);
    byKey.set(key, inv);
  }
  for (const key of reqSet) {
    if (!byKey.has(key)) errors.push('INVOCATION_MISSING:' + key);
  }
  for (const key of byKey.keys()) {
    if (!reqSet.has(key)) errors.push('INVOCATION_EXTRA:' + key);
  }
  let retryUsed = false;
  for (const [key, inv] of byKey) {
    if (ctx && inv.txid && inv.txid !== ctx.txid) errors.push('INVOCATION_TXID:' + key);
    if (ctx && inv.rid && inv.rid !== ctx.rid) errors.push('INVOCATION_RID:' + key);
    if (typeof inv.input_digest !== 'string' || inv.input_digest.length !== 64) errors.push('INPUT_DIGEST:' + key);
    if (typeof inv.evidence_digest !== 'string' || inv.evidence_digest.length !== 64) errors.push('EVIDENCE_DIGEST:' + key);
    if (Array.isArray(inv.attempts) && inv.attempts.length > 0) {
      const finals = inv.attempts.filter((a) => a.final === true);
      if (finals.length !== 1) errors.push('ATTEMPT_FINAL:' + key);
      const final = finals[0];
      if (!final || final.result !== 'PASS') errors.push('ATTEMPT_FINAL_NOT_PASS:' + key);
      const failed = inv.attempts.filter((a) => a.result === 'FAILED');
      if (failed.length > 0) {
        if (bundle.retry_allowed !== true) errors.push('RETRY_NOT_ALLOWED:' + key);
        else retryUsed = true;
      }
    } else if (inv.result !== 'PASS') {
      errors.push('INVOCATION_NOT_PASS:' + key);
    }
    if (inv.evidence_present === false) errors.push('EVIDENCE_MISSING:' + key);
  }
  return {
    ok: errors.length === 0,
    errors,
    required: reqKeys,
    present: Array.from(byKey.keys()),
    retry_used: retryUsed,
  };
}

function validateFragmentSeal(seal) {
  const errors = [];
  if (!seal || seal.schema !== FRAGMENT_SEAL_SCHEMA) errors.push('FRAGMENT_SCHEMA');
  if (seal && seal.authoritative !== false) errors.push('FRAGMENT_AUTHORITATIVE');
  if (seal && seal.mode !== 'fragment') errors.push('FRAGMENT_MODE');
  if (seal && [SEAL.FULL, SEAL.ABORTED, SEAL.DEGRADED].includes(seal.mode)) errors.push('FRAGMENT_TERMINAL_MODE');
  return { ok: errors.length === 0, errors };
}

module.exports = {
  CHAIN_SCHEMA,
  SUMMARY_SCHEMA,
  SIDECAR_SCHEMA,
  SEAL_SCHEMA,
  FRAGMENT_SEAL_SCHEMA,
  GATE_BUNDLE_SCHEMA,
  STOP,
  SEAL,
  linkChain,
  classifyChain,
  sealDecision,
  validateTerminalSeal,
  stopDecision,
  validateSummaryLifecycle,
  validateFailureMap,
  validateFailureSidecar,
  projectFailureCode,
  reclaimDecision,
  evaluateProtect,
  classifyMemberDelta,
  gateKey,
  validateGateBundle,
  validateFragmentSeal,
};
