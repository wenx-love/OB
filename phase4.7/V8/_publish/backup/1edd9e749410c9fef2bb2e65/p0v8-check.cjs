'use strict';
// V8 independent checker. Reads only the delivered artifacts.
// It does NOT import p0v8-build / p0v8-spec / p0v8-audit / p0v8-flow / p0v8-lib.
// It reimplements canonicalisation, path relations, the event/chain/seal validators and the
// flow state machine, then compares its results with the published registry.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = (() => {
  const i = process.argv.indexOf('--dir');
  return i >= 0 ? path.resolve(process.argv[i + 1]) : __dirname;
})();
const R = {
  reg: 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json',
  tsv: 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv',
  vec: 'PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json',
  main: 'PHASE4.7-PHASE0-START-CONDITIONS-V8.md',
  audit: 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md',
  failure: 'PHASE4.7-PHASE0-V8-FAILURE-MODEL.md',
  publish: 'PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md',
  self: 'PHASE4.7-PHASE0-V8-SELF-CHECK.md',
  manifest: 'PHASE4.7-PHASE0-V8-DELIVERY-MANIFEST.md',
};
const read = (f) => fs.readFileSync(path.join(DIR, f));
const text = (f) => read(f).toString('utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaText = (s) => sha(Buffer.from(s, 'utf8'));
const utf8 = (s) => Buffer.byteLength(s, 'utf8');

function cstr(s) {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) o += '\\"';
    else if (c === 0x5c) o += '\\\\';
    else if (c < 0x20) o += '\\u' + c.toString(16).padStart(4, '0');
    else if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) throw new Error('lone high surrogate');
      o += s[i] + s[i + 1]; i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('lone low surrogate');
    else o += s[i];
  }
  return o + '"';
}
function canon(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') { if (!Number.isSafeInteger(v)) throw new Error('unsafe number'); return Object.is(v, -0) ? '0' : String(v); }
  if (typeof v === 'string') return cstr(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') {
    const ks = Object.keys(v);
    for (const k of ks) if (!/^[a-z0-9_]+$/.test(k)) throw new Error('bad key ' + k);
    ks.sort();
    return '{' + ks.map((k) => cstr(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('unsupported type');
}

const failures = [];
let checks = 0;
const ok = (name, cond, detail) => { checks++; if (!cond) failures.push(name + (detail ? ' :: ' + detail : '')); };
const eq = (name, a, b) => ok(name, a === b, String(a) + ' != ' + String(b));

const reg = JSON.parse(read(R.reg).toString('utf8'));
const tsv = text(R.tsv);
const vec = JSON.parse(read(R.vec).toString('utf8'));
const docs = Object.fromEntries([R.main, R.audit, R.failure, R.publish, R.self, R.manifest].map((f) => [f, text(f)]));
const byId = Object.fromEntries(reg.executions.map((e) => [e.exec_id, e]));

// ---------------------------------------------------------------- path relations
const isToken = (p) => /^(BINDING|ENV_METADATA):/.test(p) || p === 'console';
const segs = (p) => p.toLowerCase().split('\\').filter((x, i) => x.length > 0 || i === 0);
const pathEq = (a, b) => (isToken(a) || isToken(b)) ? a === b : (() => {
  const x = segs(a), y = segs(b);
  return x.length === y.length && x.every((s, i) => s === y[i]);
})();
const pathUnder = (a, b) => {
  if (isToken(a) || isToken(b)) return false;
  const x = segs(a), y = segs(b);
  return x.length > y.length && y.every((s, i) => s === x[i]);
};
const atOrUnder = (a, b) => pathEq(a, b) || pathUnder(a, b);
const covers = (entry, p) => {
  if (isToken(entry.path) || isToken(p)) return pathEq(entry.path, p);
  if (pathEq(entry.path, p)) return true;
  return entry.kind === 'subtree' && pathUnder(p, entry.path);
};
const intersects = (a, b) => {
  if (isToken(a.path) || isToken(b.path)) return pathEq(a.path, b.path);
  if (pathEq(a.path, b.path)) return true;
  if (a.kind === 'subtree' && pathUnder(b.path, a.path)) return true;
  if (b.kind === 'subtree' && pathUnder(a.path, b.path)) return true;
  return false;
};
const canonicalAbs = (p) => {
  if (typeof p !== 'string' || !/^[A-Z]:\\/.test(p)) return false;
  if (p.includes('/')) return false;
  if (/\\$/.test(p) && p.length > 3) return false;
  const parts = p.slice(3).split('\\');
  for (const s of parts) {
    if (s === '' || s === '.' || s === '..') return false;
    if (/[. ]$/.test(s)) return false;
    if (/^[A-Za-z0-9~!#$%&'()\-^_`{}@]{1,6}\.[A-Za-z0-9]{1,3}~[0-9]+$/.test(s)) return false;
  }
  return true;
};
const H64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------- registry facts
const execList = reg.executions;
const KINDS = ['exec_begin', 'exec_end', 'write_intent', 'write_result', 'read_batch', 'preload', 'observe_start', 'observe_relay', 'observe_end'];
const ROLES = ['dispatcher', 'tool', 'observer', 'product'];
const EVENT_REQ = {
  exec_begin: ['argv_sha256', 'cwd', 'entry_path', 'entry_sha256', 'pid', 'ppid'],
  exec_end: ['exit_code', 'started_utc', 'ended_utc', 'child_exit_codes'],
  write_intent: ['intent_id', 'op', 'path', 'path_kind', 'src_path', 'rule_ref', 'decision', 'before'],
  write_result: ['intent_ref', 'outcome', 'error_code', 'after', 'bytes_written', 'durable'],
  read_batch: ['mode', 'entries', 'counts'],
  preload: ['guard_pid', 'parent_pid', 'process_role', 'guard_sha256', 'argv_sha256', 'policy_sha256', 'inherited_env_keys'],
  observe_start: ['observed_account', 'observed_sid', 'nonce', 'deadline_seconds'],
  observe_relay: ['line_sha256', 'line_bytes', 'verdict', 'reason', 'reported_account', 'reported_sid', 'reported_write_result', 'nonce_match'],
  observe_end: ['relay_seen', 'verdict', 'exit_code'],
};
const EVENT_FORBID = {
  exec_begin: ['outcome'], exec_end: ['write_intent'], write_intent: ['outcome', 'error_code', 'after', 'bytes_written'],
  write_result: ['op', 'path', 'src_path', 'rule_ref', 'before'], read_batch: ['outcome'],
  preload: [], observe_start: ['stdout'], observe_relay: [], observe_end: ['relay_line'],
};
const COMMON = ['schema', 'event_id', 'exec_id', 'part_id', 'seq', 'prev_event_sha256', 'kind', 'wall_time_utc', 'actor', 'role'];
const OPS = ['create', 'overwrite', 'append', 'mkdir', 'rename', 'copy', 'acl', 'delete'];

// rule_ref: "<exec>.<layer>[<index>]"
function ruleOf(execId, ref) {
  const m = /^([A-Z0-9\-]+)\.(business_reads|business_writes|product_reads|product_writes|control_reads|control_writes)\[(\d+)\]$/.exec(ref || '');
  if (!m || m[1] !== execId) return null;
  const e = byId[execId];
  if (!e) return null;
  const list = m[2] === 'business_reads' ? e.reads.business
    : m[2] === 'business_writes' ? e.writes.business
      : m[2] === 'product_reads' ? (e.product ? e.product.reads : null)
        : m[2] === 'product_writes' ? (e.product ? e.product.writes : null)
          : m[2] === 'control_reads' ? e.reads.control : e.writes.control;
  if (!list) return null;
  return list[Number(m[3])] || null;
}

function validateEvents(list) {
  const errs = [];
  const add = (code, detail) => errs.push({ code, detail: detail || '' });
  const seen = new Set();
  const intents = new Map();
  const results = new Set();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object' || Array.isArray(e)) { add('schema.object'); continue; }
    if (!Number.isSafeInteger(e.seq) || e.seq !== i + 1) add('schema.seq');
    if (i === 0) { if (e.prev_event_sha256 !== null) add('schema.prev'); }
    else if (e.prev_event_sha256 !== shaText(canon(list[i - 1]))) add('schema.prev');
    if (e.schema !== 'p47-audit-event-v3') add('schema.schema');
    if (!/^[0-9a-f]{32}$/.test(e.event_id || '')) add('schema.event_id');
    if (seen.has(e.event_id)) add('schema.unique');
    seen.add(e.event_id);
    if (!KINDS.includes(e.kind)) { add('schema.kind'); continue; }
    const allowed = new Set([...COMMON, ...EVENT_REQ[e.kind], ...EVENT_FORBID[e.kind]]);
    for (const k of Object.keys(e)) if (!allowed.has(k)) add('schema.closed');
    for (const f of [...COMMON, ...EVENT_REQ[e.kind]]) if (!(f in e)) add('schema.required');
    for (const f of EVENT_FORBID[e.kind]) if (f in e) add('schema.forbidden');
    if (!ROLES.includes(e.role)) { add('schema.role'); continue; }
    const ex = byId[e.exec_id];
    if (!ex) { add('schema.exec_registered'); continue; }
    if (!(ex.audit_roles || []).includes(e.role)) { add('perm.role'); continue; }
    if (e.actor !== 'WENX\\Administrator') add('schema.actor');
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.wall_time_utc || '')) add('schema.time');
    if (!/^events-(dispatcher|tool|observer|product)-\d+-[0-9a-f]{8}$/.test(e.part_id || '')) add('schema.type');
    if (!e.part_id || !e.part_id.includes('-' + e.role + '-')) add('schema.type');

    if (e.kind === 'write_intent') {
      if (e.intent_id !== e.event_id) add('schema.intent_id');
      if (!OPS.includes(e.op)) add('schema.op');
      if (!canonicalAbs(e.path)) add('schema.path');
      if (!['file', 'dir', 'tree'].includes(e.path_kind)) add('schema.path_kind');
      if (e.decision !== 'allow') add('schema.decision');
      const layerRead = e.role === 'product' ? 'product_writes' : 'business_writes';
      const ref = (e.rule_ref || '').replace(/\.(business_writes|product_writes)\[/, '.' + layerRead + '[');
      const rule = ruleOf(e.exec_id, ref);
      if (!rule) add('perm.rule_ref');
      else if (!covers(rule, e.path)) add('perm.write_scope');
      intents.set(e.event_id, { seq: e.seq, part: e.part_id, exec: e.exec_id, rule });
    }
    if (e.kind === 'write_result') {
      const intent = list.find((x) => x.kind === 'write_intent' && x.event_id === e.intent_ref);
      if (!intent) add('schema.intent_order');
      else {
        if (intent.seq >= e.seq || intent.part_id !== e.part_id || intent.exec_id !== e.exec_id) add('schema.intent_order');
        if (results.has(e.intent_ref)) add('schema.intent_unique');
        results.add(e.intent_ref);
      }
      if (!['ok', 'denied', 'error', 'skipped'].includes(e.outcome)) add('schema.outcome');
      if (e.outcome === 'ok' ? e.error_code !== null : typeof e.error_code !== 'string') add('schema.error_code');
      if (e.outcome === 'ok') {
        if (!e.after || typeof e.after !== 'object' || typeof e.after.bytes !== 'number' || !H64.test(e.after.sha256 || '')) add('schema.after');
        if (e.durable !== true) add('schema.durable');
        const intent2 = list.find((x) => x.kind === 'write_intent' && x.event_id === e.intent_ref);
        const bytesOp = intent2 && ['create', 'overwrite', 'append', 'copy'].includes(intent2.op);
        if (bytesOp && e.after && typeof e.after.bytes === 'number' && e.bytes_written !== e.after.bytes) add('schema.bytes');
      } else if (e.after !== null || e.bytes_written !== null) add('schema.after');
    }
    if (e.kind === 'read_batch') {
      if (!['content', 'metadata'].includes(e.mode)) add('schema.mode');
      if (!Array.isArray(e.entries) || e.entries.length === 0) add('schema.entries');
      else {
        const tallies = { ok: 0, denied: 0, absent: 0, unlisted: 0 };
        for (const x of e.entries) {
          if (!x || typeof x !== 'object') { add('schema.entries'); continue; }
          if (!canonicalAbs(x.path)) add('schema.path');
          if (!['ok', 'denied', 'absent', 'unlisted'].includes(x.result)) add('schema.entries');
          else tallies[x.result]++;
          if (x.result === 'ok' ? x.error_code !== null : typeof x.error_code !== 'string') add('schema.error_code');
          const layerRead = e.role === 'product' ? 'product_reads' : 'business_reads';
          const ref = (x.rule_ref || '').replace(/\.(business_reads|product_reads)\[/, '.' + layerRead + '[');
          const rule = ruleOf(e.exec_id, ref);
          if (!rule) add('perm.rule_ref');
          else {
            const deny = (e.role === 'product' ? (byId[e.exec_id].product || { deny_read: [] }).deny_read : byId[e.exec_id].deny_read) || [];
            if (x.result === 'ok' && deny.some((d) => intersects({ path: x.path, kind: 'file' }, { path: d, kind: 'subtree' }))) add('perm.deny_read');
            else if (x.result === 'ok' && !covers(rule, x.path)) add('perm.read_scope');
          }
          if (x.result === 'ok' && (!Number.isSafeInteger(x.bytes) || !H64.test(x.sha256 || ''))) add('schema.entries');
        }
        if (!e.counts || typeof e.counts !== 'object') add('schema.counts');
        else for (const k of Object.keys(tallies)) if (e.counts[k] !== tallies[k] || Object.keys(e.counts).length !== 4) add('schema.counts');
      }
    }
    if (e.kind === 'exec_begin') {
      if (e.argv_sha256 !== ex.argv_sha256) add('schema.type');
      if (e.entry_path !== ex.entry_path) add('schema.type');
      if (e.cwd !== ex.cwd) add('schema.type');
      if (!Number.isSafeInteger(e.pid) || !Number.isSafeInteger(e.ppid)) add('schema.type');
    }
    if (e.kind === 'exec_end') {
      if (!Number.isSafeInteger(e.exit_code)) add('schema.type');
      if (!Array.isArray(e.child_exit_codes)) add('schema.type');
    }
    if (e.kind === 'preload') {
      if (!H64.test(e.guard_sha256 || '') || !H64.test(e.argv_sha256 || '') || !H64.test(e.policy_sha256 || '')) add('schema.type');
      if (!Array.isArray(e.inherited_env_keys) || e.inherited_env_keys.some((k, i, a) => i > 0 && a[i - 1] > k)) add('schema.type');
    }
    if (e.kind === 'observe_start') {
      if (!H64.test(e.nonce || '')) add('schema.type');
      if (e.deadline_seconds !== 900) add('schema.type');
    }
    if (e.kind === 'observe_relay') {
      if (!H64.test(e.line_sha256 || '') || !Number.isSafeInteger(e.line_bytes) || e.line_bytes > 4096) add('schema.type');
      if (e.verdict === 'ok' ? e.reason !== null : typeof e.reason !== 'string') add('schema.type');
    }
    if (e.kind === 'observe_end' && (typeof e.relay_seen !== 'boolean' || !['pass', 'fail'].includes(e.verdict))) add('schema.type');
  }
  return errs;
}

const CHAIN_REQ = {
  genesis: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'run_id', 'created_utc', 'registry_sha256', 'manifest_sha256', 'verifier_result', 'bootstrap', 'writer', 'writer_tool_sha256'],
  segment_open: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'exec_id', 'command_id', 'args_sha256', 'cwd', 'entry_path', 'entry_sha256', 'planned_predecessor', 'c18_state', 'c18_binding_sha256', 'c18_destination', 'segment_dir'],
  segment_close: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'exec_id', 'command_id', 'result', 'exit_code', 'failure_class', 'security_trigger', 'parts', 'events_total', 'unpaired_intents', 'segment_digest', 'summary_path', 'summary_sha256', 'summary_bytes', 'outputs', 'child_exit_codes'],
  segment_skip: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'exec_id', 'command_id', 'reason', 'failed_dependency', 'skipped_utc'],
};
const CHAIN_FORBID = { genesis: [], segment_open: [], segment_close: [], segment_skip: ['segment_dir', 'summary_path'] };

function validateChain(recs) {
  const errs = [];
  const add = (code, detail) => errs.push({ code, detail: detail || '' });
  let open = null;
  const states = new Map();
  const triggers = new Set(reg.failure_policy.trigger_ids);
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (!r || typeof r !== 'object') { add('schema.record'); continue; }
    if (!CHAIN_REQ[r.record]) { add('schema.record'); continue; }
    if (r.schema !== 'p47-chain-record-v4') add('schema.schema');
    const allowed = new Set(CHAIN_REQ[r.record].concat(['record']));
    for (const k of Object.keys(r)) if (!allowed.has(k)) add('schema.closed');
    for (const f of CHAIN_REQ[r.record]) if (!(f in r)) add('schema.required');
    for (const f of CHAIN_FORBID[r.record]) if (f in r) add('schema.forbidden');
    if (i === 0) {
      if (r.prev_record_sha256 === null) { if (r.chain_seq !== 1) add('chain.seq'); }
      else if (typeof r.prev_record_sha256 !== 'string' || !H64.test(r.prev_record_sha256)) add('chain.prev');
    } else {
      const p = recs[i - 1];
      if (r.chain_seq !== p.chain_seq + 1) add('chain.seq');
      if (r.prev_record_sha256 !== shaText(canon(p))) add('chain.prev');
      const expectBytes = p.prev_file_bytes + utf8(canon(p)) + 1;
      if (r.prev_file_bytes !== expectBytes) add('chain.bytes');
    }
    if (r.record === 'genesis') {
      if (i !== 0) add('chain.seq');
      if (r.verifier_result !== 'pass') add('chain.failure_class');
      states.set('genesis', 'ok');
      continue;
    }
    const ex = byId[r.exec_id];
    if (!ex) { add('chain.exec_registered'); continue; }
    if (r.record === 'segment_open') {
      if (open) add('chain.pair');
      open = r.exec_id;
      if (r.command_id !== ex.command_id) add('chain.exec_registered');
      if (r.args_sha256 !== ex.argv_sha256) add('chain.predecessor');
      if (!pathEq(r.cwd || '', ex.cwd)) add('chain.predecessor');
      if (r.entry_path !== ex.entry_path) add('chain.predecessor');
      const predOk = [ex.chain_predecessor_bound, ex.chain_predecessor_unbound].includes(r.planned_predecessor)
        || (r.planned_predecessor === null && ex.chain_predecessor_bound === null);
      if (!predOk) add('chain.predecessor');
      if (ex.exec_id === 'C18-BIND-E01') {
        if (!['bound', 'disabled-unbound'].includes(r.c18_state)) add('chain.failure_class');
        if (r.c18_state === 'bound' && (!H64.test(r.c18_binding_sha256 || '') || !canonicalAbs(r.c18_destination))) add('chain.failure_class');
        if (r.c18_state === 'disabled-unbound' && (r.c18_binding_sha256 !== null || r.c18_destination !== null)) add('chain.failure_class');
      } else if (r.c18_state !== null || r.c18_binding_sha256 !== null || r.c18_destination !== null) add('chain.failure_class');
      states.set(r.exec_id, 'open');
    } else if (r.record === 'segment_close') {
      if (open !== r.exec_id) add('chain.pair');
      open = null;
      if (r.command_id !== ex.command_id) add('chain.exec_registered');
      if (!['ok', 'failed', 'aborted'].includes(r.result)) add('chain.failure_class');
      if (r.result === 'ok') {
        if (r.failure_class !== null) add('chain.failure_class');
        if (r.security_trigger !== null) add('chain.trigger');
      } else {
        if (!['gate', 'fatal', 'security'].includes(r.failure_class)) add('chain.failure_class');
        if (r.failure_class === 'security') {
          if (!triggers.has(r.security_trigger)) add('chain.trigger');
        } else if (r.security_trigger !== null) add('chain.trigger');
      }
      if (!Array.isArray(r.parts)) add('chain.parts');
      else {
        if (r.segment_digest !== shaText(canon(r.parts))) add('chain.parts');
        if (r.events_total !== r.parts.reduce((n, p) => n + (p.events || 0), 0)) add('chain.parts');
      }
      states.set(r.exec_id, r.result === 'ok' ? 'ok' : 'failed');
    } else if (r.record === 'segment_skip') {
      if (!['dependency-failed', 'target-skipped', 'c18-unbound', 'run-stopped'].includes(r.reason)) { add('chain.reason'); continue; }
      const depState = r.failed_dependency ? states.get(r.failed_dependency) : null;
      if (r.reason === 'c18-unbound') {
        if (r.failed_dependency !== null) add('chain.skip_cause');
        const bind = recs.slice(0, i).filter((x) => x.record === 'segment_open' && x.exec_id === 'C18-BIND-E01').pop();
        if (!bind || bind.c18_state !== 'disabled-unbound') add('chain.skip_cause');
      } else if (!depState || !['failed', 'skipped', 'open'].includes(depState)) add('chain.skip_cause');
      states.set(r.exec_id, 'skipped');
    } else if (r.record === 'genesis') {
      if (i !== 0) add('chain.seq');
      if (r.verifier_result !== 'pass') add('chain.failure_class');
      states.set('genesis', 'ok');
    }
  }
  return errs;
}

function validateSummary(s) {
  const errs = [];
  const add = (code) => errs.push({ code, detail: '' });
  if (s.schema !== 'p47-segment-summary-v3') add('schema.schema');
  const req = ['schema', 'run_id', 'exec_id', 'command_id', 'result', 'exit_code', 'failure_class', 'security_trigger', 'parts', 'counts', 'unpaired_intents', 'outputs', 'child_exit_codes', 'sealed_utc'];
  for (const f of req) if (!(f in s)) add('schema.required');
  if ('summary_sha256' in s || 'prev_record_sha256' in s) add('schema.forbidden');
  if (!byId[s.exec_id]) add('chain.exec_registered');
  if (!['ok', 'failed', 'aborted'].includes(s.result)) add('chain.failure_class');
  return errs;
}

const SEAL_MODES = ['sealed-full', 'degraded-prefix', 'aborted', 'seal-failed', 'chain-broken', 'no-chain'];
// Flow replay of a chain excerpt: catches a failed target without its after-evidence and a
// business step that keeps running after a security halt.
function flowReplay(recs) {
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
    if (r.record === 'segment_close' && r.result === 'failed' && wrapperOf[r.exec_id]) {
      if (r.failure_class === 'security') halted = true;
      pendingAfter = wrapperOf[r.exec_id];
    }
  }
  return errs;
}

function validateSeal(s, recs) {
  const errs = [];
  const add = (code) => errs.push({ code, detail: '' });
  if (s.schema !== 'p47-terminal-seal-v3') add('schema.schema');
  const req = ['schema', 'run_id', 'mode', 'chain', 'staged_state', 'run_state', 'abort', 'open_segments', 'skipped', 'not_started', 'gate_failed', 'segment_counts', 'index', 'report', 'c18_state', 'staged_recheck', 'exit_status', 'security_findings', 'sealed_utc'];
  for (const f of req) if (!(f in s)) add('schema.required');
  if (!SEAL_MODES.includes(s.mode)) add('seal.mode');
  if (recs && recs.length) {
    const last = recs[recs.length - 1];
    if (s.chain && (s.chain.last_seq !== last.chain_seq || s.chain.last_record_sha256 !== shaText(canon(last)))) add('seal.mode');
    if (s.open_segments && s.open_segments.length && s.chain && s.chain.tail_kind !== 'segment_open') add('seal.mode');
  }
  if (s.mode === 'sealed-full') {
    if (s.staged_state !== 'complete' || s.run_state !== 'completed') add('seal.mode');
    if ((s.open_segments || []).length || (s.skipped || []).length || (s.gate_failed || []).length) add('seal.mode');
    if (!s.index || !s.index.present || !s.report || !s.report.present) add('seal.mode');
  }
  if (s.mode === 'aborted') {
    if (s.staged_state !== 'complete' || s.run_state !== 'aborted' || !s.abort) add('seal.mode');
  }
  if (s.mode === 'degraded-prefix' && s.staged_state === 'complete') add('seal.mode');
  const overlap = (arr1, arr2) => (arr1 || []).filter((x) => (arr2 || []).includes(x));
  if (overlap(s.skipped, s.not_started).length || overlap(s.skipped, s.gate_failed).length || overlap(s.not_started, s.gate_failed).length) add('seal.partition');
  for (const t of s.security_findings || []) if (!reg.failure_policy.trigger_ids.includes(t)) add('seal.mode');
  return errs;
}

// ---------------------------------------------------------------- independent flow replay
// Recompute the generator's failure matrix from registry data only.
const STOP_RANK = { none: 0, continue: 1, 'halt-business': 2, 'halt-all': 3, 'chain-broken': 4 };
function simulate(order, binding, failId, failClass, orphanId) {
  const state = new Map(); const rec = new Map(); const reasons = new Map();
  const ran = []; let stop = 'none'; let first = null; let genesis = false;
  const skip = (id, reason, dep) => { state.set(id, 'skipped'); rec.set(id, 'skip'); reasons.set(id, [reason, dep]); };
  const run = (e, cls) => {
    if (cls) { rec.set(e.exec_id, 'close'); state.set(e.exec_id, 'failed'); first = first || e.exec_id;
      if (cls === 'security') stop = 'halt-all';
      else if (cls === 'fatal') stop = ['finalizer', 'seal', 'infra', 'pre-run', 'genesis', 'bind'].includes(e.class) ? 'halt-all' : 'halt-business';
      else if (STOP_RANK[stop] < 1) stop = 'continue';
      ran.push(e.exec_id); return;
    }
    if (orphanId === e.exec_id) { rec.set(e.exec_id, 'open'); state.set(e.exec_id, 'orphaned'); ran.push(e.exec_id); stop = 'halt-all'; first = first || e.exec_id; return; }
    rec.set(e.exec_id, 'close'); state.set(e.exec_id, 'ok'); ran.push(e.exec_id);
    if (e.chain_role === 'genesis') genesis = true;
  };
  const unmet = (e) => {
    for (const r of e.requires || []) {
      const st = state.get(r.exec);
      if (r.state === 'ok' && st !== 'ok') return r;
      if (r.state === 'terminal' && !['ok', 'failed', 'aborted'].includes(st)) return r;
      if (r.state === 'recorded' && !st) return r;
      if (r.state === 'settled' && !st) return r;
    }
    return null;
  };
  for (const id of order) {
    const e = byId[id];
    if (state.has(id)) continue;
    if (!genesis && e.chain_role !== 'genesis' && e.chain_role !== 'none' && state.get('C01-E01') !== undefined && state.get('C01-E01') !== 'ok') { state.set(id, 'not-started'); continue; }
    if (e.condition === 'c18-bound' && binding === 'unbound') { skip(id, 'c18-unbound', null); continue; }
    if ((e.class === 'before' || e.class === 'after') && state.get(e.target_ref) === 'skipped') { skip(id, 'target-skipped', e.target_ref); continue; }
    if (stop === 'halt-all') {
      if (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref))) { run(e, null); continue; }
      if (e.class === 'seal') { run(e, id === failId ? failClass : null); continue; }
      skip(id, 'run-stopped', first); continue;
    }
    if (stop === 'halt-business') {
      const allowed = e.class === 'finalizer' || e.class === 'seal' || e.class === 'bind' ||
        (e.class === 'after' && ['failed', 'aborted'].includes(state.get(e.target_ref)));
      if (!allowed) { skip(id, 'run-stopped', first); continue; }
    }
    if (e.class === 'seal') { run(e, id === failId ? failClass : null); continue; }
    const miss = unmet(e);
    if (miss) { skip(id, 'dependency-failed', miss.exec); continue; }
    run(e, id === failId ? failClass : null);
  }
  for (const id of order) if (!state.has(id)) { if (!genesis) state.set(id, 'not-started'); else skip(id, 'run-stopped', first); }
  const staged = state.get('C05-FINAL-E01') === 'ok' ? 'complete'
    : (state.get('C05-FINAL-E01') === 'failed' || state.get('C04-E01') === 'ok') ? 'incomplete' : 'absent';
  const halted = STOP_RANK[stop] >= 2;
  const sealFailed = state.get('C20-SEAL-E01') === 'failed';
  const chainBroken = state.get('C19-E01') === 'failed' && failClass === 'security';
  const mode = !genesis ? 'no-chain' : sealFailed ? 'seal-failed' : chainBroken ? 'chain-broken'
    : staged !== 'complete' ? 'degraded-prefix' : halted ? 'aborted' : 'sealed-full';
  const skipped = order.filter((id) => state.get(id) === 'skipped');
  const failed = order.filter((id) => state.get(id) === 'failed');
  const notStarted = order.filter((id) => state.get(id) === 'not-started');
  const records = (genesis ? 1 : 0) + order.reduce((n, id) => {
    const r = rec.get(id); const e = byId[id];
    if (r === 'skip' || r === 'open') return n + 1;
    if (r === 'close') return n + (['genesis', 'participant'].includes(e.chain_role) ? 2 : 0);
    return n;
  }, 0);
  return { stop, staged, halted, mode, ran: ran.length, skipped, failed, notStarted, records,
    exit: (mode === 'sealed-full' && !failed.length && !skipped.length && binding === 'bound') ? 'complete' : 'exit-not-met',
    digestInput: { skipped, failed, reasons: [...reasons.keys()].sort().map((k) => [k, reasons.get(k)[0], reasons.get(k)[1]]) } };
}

// ---------------------------------------------------------------- schema rules (docs)
for (const t of ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10', 'N11', 'N12',
  'segment_skip', 'terminal', 'binding', 'publish', 'aborted', 'degraded-prefix', '失败矩阵']) {
  ok('main covers ' + t, docs[R.main].includes(t));
}
for (const t of ['p47-audit-event-v3', 'p47-chain-record-v4', 'segment_skip', 'LF', 'summary', 'seal']) {
  ok('audit spec covers ' + t, docs[R.audit].includes(t));
}
ok('failure model covers stop levels', docs[R.failure].includes('halt-business') && docs[R.failure].includes('halt-all'));
ok('publish protocol covers recovery', docs[R.publish].includes('recover') && docs[R.publish].includes('rollback-failed'));

// ---------------------------------------------------------------- vectors
for (const v of [...vec.valid, ...vec.parts, ...vec.events, ...vec.summaries, ...vec.seals,
  ...Object.values(vec.chains).flat()]) {
  eq('vector hash ' + v.name, shaText(v.canonical), v.sha256);
  eq('vector bytes ' + v.name, utf8(v.canonical), v.bytes);
}
const parse = (v) => JSON.parse(v.canonical);
const allEvents = [];
for (const [group, list] of Object.entries(vec.chains)) {
  const recs = list.map(parse);
  eq('chain schema ' + group, validateChain(recs).concat(flowReplay(recs)).map((x) => x.code).join(','), '');
}
for (const v of vec.parts) {
  const list = parse(v);
  const errs = validateEvents(list);
  eq('part schema ' + v.name, errs.map((x) => x.code).join(','), '');
}
for (const v of vec.summaries) eq('summary schema ' + v.name, validateSummary(parse(v)).length, 0);
for (const v of vec.seals) eq('seal schema ' + v.name, validateSeal(parse(v), null).map((x) => x.code).join(','), '');
eq('all event parts validated separately', vec.parts.length, 5);
// jsonl physical bytes
for (const [name, j] of Object.entries(vec.jsonl)) {
  const tag = name === 'c19' ? 'C19' : name === 'c10p' ? 'C10P' : 'C03';
  const list = parse(vec.parts.find((p) => p.name.includes(tag)));
  const lines = list.map((e) => canon(e) + '\n');
  const bytes = lines.reduce((n, x) => n + utf8(x), 0);
  eq('jsonl bytes ' + name, bytes, j.bytes);
  eq('jsonl sha ' + name, sha(Buffer.from(lines.join(''), 'utf8')), j.sha);
}

// negatives: exactly one error with the expected code
for (const n of vec.negative) {
  let errs;
  if (n.canonical && JSON.parse(n.canonical).hex) {
    const v = JSON.parse(n.canonical);
    const buf = Buffer.from(v.hex, 'hex');
    const parts = buf.toString('utf8').split('\n');
    const truncated = parts.length === 1 || parts[parts.length - 1] !== '';
    errs = truncated ? [{ code: 'bytes.truncated' }] : [];
  } else {
    const v = JSON.parse(n.canonical);
    if (Array.isArray(v) && v.length && v[0] && v[0].kind) errs = validateEvents(v);
    else if (Array.isArray(v) && v.length && v[0] && v[0].record) errs = validateChain(v).concat(flowReplay(v));
    else if (v && v.kind) errs = validateEvents([v]);
    else if (v && v.record) errs = validateChain([v]).concat(flowReplay([v]));
    else if (Array.isArray(v) && v.length === 1 && String(v[0].schema || '').includes('summary')) errs = validateSummary(v[0]);
    else if (Array.isArray(v) && v.length === 1 && String(v[0].schema || '').includes('seal')) errs = validateSeal(v[0], null);
    else if (v && String(v.schema || '').includes('summary')) errs = validateSummary(v);
    else if (v && String(v.schema || '').includes('seal')) errs = validateSeal(v, null);
    else errs = [{ code: 'schema.object' }];
  }
  eq('negative exactly one error ' + n.name, errs.length, 1);
  eq('negative expected code ' + n.name, errs[0] && errs[0].code, n.expect);
}

// invalid canonical values
const invalid = { float: 1.5, unsafe_integer: 9007199254740992, uppercase_key: { Key: 1 }, non_ascii_key: { 'é': 1 }, dash_key: { 'a-b': 1 }, lone_high_surrogate: '\ud800', lone_low_surrogate: '\udc00', undefined_value: undefined, nan: NaN, infinity: Infinity, function_value: function () {}, bigint_value: 10n };
for (const k of vec.invalid_kinds) {
  let threw = false;
  try { canon(invalid[k]); } catch (e) { threw = true; }
  ok('invalid canonical rejected: ' + k, threw);
}

// ---------------------------------------------------------------- registry / plan
eq('commands 21', reg.counts.commands, 21);
eq('executions 58', reg.counts.executions, 58);
eq('participants 54', reg.counts.chain_participants, 54);
eq('records 109/103', String(reg.counts.chain_records_bound) + '/' + reg.counts.chain_records_unbound, '109/103');
eq('plans 58/55', String(reg.counts.plan_bound) + '/' + reg.counts.plan_unbound, '58/55');
eq('payload 20/16/4', [reg.counts.payload_files, reg.counts.staged_files, reg.counts.bootstrap_files].join('/'), '20/16/4');
eq('release root v8', reg.release.source_root, 'D:\\P47TOOLS\\p47-phase0-v8');
eq('schema v8', reg.schema, 'p47-phase0-command-registry-v8');
const planB = reg.plan.order_bound, planU = reg.plan.order_unbound;
eq('plan bound unique', new Set(planB).size, planB.length);
eq('unbound removes C18 trio', planB.filter((x) => !planU.includes(x)).join(','), 'C07-B-C18-E01,C18-E01,C07-A-C18-E01');
execList.forEach((e, i) => {
  eq('order bound ' + e.exec_id, e.plan_order_bound, i + 1);
  eq('pred bound ' + e.exec_id, e.predecessor_bound, i === 0 ? null : planB[i - 1]);
});
planU.forEach((id, i) => {
  const e = byId[id];
  eq('order unbound ' + id, e.plan_order_unbound, i + 1);
  eq('pred unbound ' + id, e.predecessor_unbound, i === 0 ? null : planU[i - 1]);
});
let argvBad = 0, inlineBad = 0, tgtBad = 0;
for (const e of execList) {
  if (shaText(canon(e.argv)) !== e.argv_sha256) argvBad++;
  if ((e.entry_mode === 'inline' || e.entry_mode === 'codex-inline') && shaText(e.argv[e.argv.length - 1]) !== e.inline_sha256) inlineBad++;
  if (e.target_argv && shaText(canon(e.target_argv)) !== e.target_argv_sha256) tgtBad++;
  ok('exec fields ' + e.exec_id, !!e.entry_path && !!e.cwd && !!e.gate && Array.isArray(e.argv));
  ok('tool hashes null ' + e.exec_id, e.tool_files.every((t) => t.sha256 === null && t.sha_source === 'RELEASE-MANIFEST.json'));
}
eq('argv 58/58', argvBad, 0); eq('inline 2/2', inlineBad, 0); eq('target argv hashes', tgtBad, 0);

let overlap = 0;
for (const e of execList) {
  for (const r of e.reads.business) for (const d of e.deny_read) if (intersects(r, { path: d, kind: 'subtree' })) { overlap++; failures.push('overlap ' + e.exec_id + ' ' + r.path + ' <-> ' + d); }
  if (e.product) for (const r of e.product.reads) for (const d of e.product.deny_read) if (intersects(r, { path: d, kind: 'subtree' })) { overlap++; failures.push('product overlap ' + e.exec_id + ' ' + r.path + ' <-> ' + d); }
}
eq('total allow/deny intersections', overlap, 0);

// TEMP derivation (N05): redirected temp must be granted in the same layer
for (const e of execList) {
  if (e.temp && e.temp.mode === 'redirected') {
    ok('TEMP readable ' + e.exec_id, e.reads.business.some((r) => covers(r, e.temp.path)));
    ok('TEMP writable ' + e.exec_id, e.writes.business.some((w) => covers(w, e.temp.path)));
    ok('TEMP env matches ' + e.exec_id, !e.required_env.TEMP || e.required_env.TEMP === e.temp.path);
  }
  if (e.product && e.product.env) {
    ok('product TEMP readable ' + e.exec_id, e.product.reads.some((r) => covers(r, e.product.env.TEMP)));
    ok('product TEMP writable ' + e.exec_id, e.product.writes.some((w) => covers(w, e.product.env.TEMP)));
  }
}

// protect vs content write (ACL is a metadata write and is exempt)
const PROTECTED = [reg.original, 'D:\\P47RUN\\P47-20261111-01\\baseline\\m0.json',
  'D:\\P47RUN\\P47-20261111-01\\out\\audit\\chain-head.jsonl', 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\terminal-seal.json',
  reg.release.staged_root, 'D:\\P47RUN'];
let protBad = 0;
for (const e of execList) {
  for (const p of e.protect_write) for (const w of e.writes.business) {
    if (w.op === 'acl-set-recursive') continue;
    if (intersects(w, { path: p, kind: 'subtree' })) { protBad++; failures.push('protect ' + e.exec_id + ' ' + w.path + ' <-> ' + p); }
  }
}
eq('write/protect intersections', protBad, 0);
ok('ORIGINAL protected everywhere', execList.every((e) => e.protect_write.includes(reg.original)));

// audit parents for genesis and participants (N04)
for (const e of execList.filter((x) => ['genesis', 'participant'].includes(x.chain_role))) {
  const cmd = e.command_id;
  ok('audit parent ' + e.exec_id, e.writes.control.some((w) => w.op === 'dir-create-if-absent' && pathEq(w.path, 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\' + cmd)));
  ok('audit segment ' + e.exec_id, e.writes.control.some((w) => w.op === 'dir-create' && pathEq(w.path, e.audit_part_rule.dir)));
  ok('own segment read ' + e.exec_id, e.reads.control.some((r) => pathEq(r.path, e.audit_part_rule.dir) && r.kind === 'subtree'));
}
ok('C01 genesis audit parent', byId['C01-E01'].writes.control.some((w) => pathEq(w.path, 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\C01') && w.op === 'dir-create-if-absent'));

// binding (N10)
const BIND = 'D:\\P47RUN\\P47-20261111-01\\binding\\c18-binding.json';
ok('binding path registry', reg.binding.path === BIND);
for (const e of execList) {
  for (const r of e.reads.business.concat(e.reads.control, e.reads.dispatcher)) if (/c18-binding\.json/i.test(r.path)) ok('binding read path ' + e.exec_id, pathEq(r.path, BIND));
  for (const w of e.writes.business.concat(e.writes.control)) if (/c18-binding\.json/i.test(w.path)) ok('binding write path ' + e.exec_id, pathEq(w.path, BIND));
}
for (const id of ['C18-E01', 'C19-E01', 'C20-REPORT-E01', 'C20-SEAL-E01']) {
  ok('binding consumer read ' + id, byId[id].reads.business.some((r) => pathEq(r.path, BIND)));
}
ok('C18 no live env', !('P0_SECOND_ARCHIVE' in byId['C18-E01'].required_env));

// requirements
let reqBad = 0;
for (const e of execList) {
  for (const r of e.requires) {
    if (!byId[r.exec]) { reqBad++; failures.push('unknown requirement ' + e.exec_id + ' -> ' + r.exec); }
    if (byId[r.exec] && byId[r.exec].plan_order_bound >= e.plan_order_bound) { reqBad++; failures.push('forward requirement ' + e.exec_id + ' -> ' + r.exec); }
    if (!['ok', 'terminal', 'recorded', 'settled'].includes(r.state)) { reqBad++; failures.push('bad state ' + e.exec_id); }
  }
  for (const m of e.failure_modes) {
    ok('failure mode class ' + e.exec_id, ['security', 'fatal', 'gate'].includes(m.class));
    if (m.class === 'security') ok('security trigger ' + e.exec_id + ' ' + m.code, reg.failure_policy.trigger_ids.includes(m.trigger));
    else ok('non-security trigger null ' + e.exec_id + ' ' + m.code, m.trigger === null);
  }
}
eq('requirement problems', reqBad, 0);

// ---------------------------------------------------------------- flow recomputation
const MATRIX = [];
for (const [name, order, binding] of [['bound', planB, 'bound'], ['unbound', planU, 'unbound']]) {
  MATRIX.push({ scenario: name + '/all-ok', order: name, binding, fail: null, failClass: null, r: simulate(order, binding, null, null, null) });
  for (const id of order) {
    const cls = []; if (byId[id].fail_class === 'gate') cls.push('gate'); cls.push('fatal', 'security');
    for (const c of cls) MATRIX.push({ scenario: name + '/' + id + '/' + c, order: name, binding, fail: id, failClass: c, r: simulate(order, binding, id, c, null) });
  }
  if (name === 'bound') {
    for (const id of order) MATRIX.push({ scenario: name + '/' + id + '/orphan', order: name, binding, fail: null, failClass: null, r: simulate(order, binding, null, null, id) });
    MATRIX.push({ scenario: name + '/all-ok-unbound-binding', order: name, binding: 'unbound', fail: null, failClass: null, r: simulate(order, 'unbound', null, null, null) });
  }
}
const published = reg.flow.matrix;
eq('matrix rows', published.rows, MATRIX.length);
const rowOf = (m) => ({
  scenario: m.scenario, order: m.order, fail: m.fail, fail_class: m.failClass, binding: m.binding,
  stop: m.r.stop, staged_state: m.r.staged, run_state: m.r.halted ? 'aborted' : 'completed',
  seal_mode: m.r.mode, exit: m.r.exit, ran: m.r.ran, skipped: m.r.skipped.length, failed: m.r.failed.length,
  not_started: m.r.notStarted.length, records: m.r.records,
  skipped_sha256: shaText(canon(m.r.digestInput.skipped)), failed_sha256: shaText(canon(m.r.digestInput.failed)),
  reasons_sha256: shaText(canon(m.r.digestInput.reasons)),
});
const publishedDigest = shaText(canon(MATRIX.map(rowOf)));
eq('matrix digest recomputed', publishedDigest, published.digest);
for (const name of ['bound/all-ok', 'bound/C10-P-E01/gate', 'bound/C12-E01/security', 'bound/C10-N-E01/orphan']) {
  const mine = rowOf(MATRIX.find((m) => m.scenario === name));
  const theirs = (published.sample_rows || []).find((x) => x.scenario === name);
  eq('matrix sample ' + name, canon(mine), canon(theirs));
}
if (Array.isArray(published.rows_data)) {
  let diff = 0;
  for (const m of MATRIX) {
    const mine = canon(rowOf(m));
    const theirsRow = published.rows_data.find((x) => x.scenario === m.scenario);
    if (!theirsRow || canon(theirsRow) !== mine) {
      diff++;
      if (diff <= 3) failures.push('matrix row differs ' + m.scenario + '\n mine=' + mine + '\n their=' + canon(theirsRow));
    }
  }
  eq('matrix row-by-row differences', diff, 0);
}
const c10p = simulate(planB, 'bound', 'C10-P-E01', 'gate', null);
eq('C10-P gate skips 24', c10p.skipped.length, 24);
eq('C10-P own after runs', c10p.ran > 0 && c10p.failed.length === 1, true);
const lateSec = simulate(planB, 'bound', 'C12-E01', 'security', null);
eq('late security aborted', lateSec.mode, 'aborted');
const early = simulate(planB, 'bound', 'C04-E01', 'fatal', null);
eq('early fatal degraded', early.mode, 'degraded-prefix');
const orph = simulate(planB, 'bound', null, null, 'C10-N-E01');
eq('orphan aborted', orph.mode, 'aborted');

// ---------------------------------------------------------------- TSV regenerated
const encR = (list) => list.map((r) => (r.kind === 'subtree' ? 'T:' : r.kind === 'metadata' ? 'M:' : 'F:') + (r.optional ? '?' : '') + r.path).join(';');
const encW = (list) => list.map((w) => w.op + ':' + w.path).join(';');
const encQ = (list) => list.map((r) => r.state + ':' + r.exec + ':' + r.kind).join(';');
const HEAD = ['exec_id', 'command_id', 'variant', 'step', 'class', 'plan_order_bound', 'plan_order_unbound', 'predecessor_bound', 'predecessor_unbound',
  'executor', 'entry_mode', 'entry_path', 'cwd', 'argv_sha256', 'inline_sha256', 'chain_role', 'conditional', 'deadline_seconds',
  'temp_mode', 'temp_path', 'tool_files', 'load_files', 'dispatcher_reads', 'business_reads', 'control_reads', 'audit_roles',
  'dispatcher_writes', 'business_writes', 'control_writes', 'deny_read', 'protect_write', 'guard_policy_sha256', 'requires',
  'gate', 'outputs', 'fail_class', 'failure_modes', 'security_triggers'];
const trows = [HEAD.join('\t')];
for (const e of execList) {
  trows.push([e.exec_id, e.command_id, e.variant || '', e.step, e.class, String(e.plan_order_bound), e.plan_order_unbound ? String(e.plan_order_unbound) : '',
    e.predecessor_bound || '', e.predecessor_unbound || '', e.executor, e.entry_mode, e.entry_path, e.cwd, e.argv_sha256, e.inline_sha256 || '',
    e.chain_role, e.conditional || '', e.deadline_seconds ? String(e.deadline_seconds) : '', e.temp.mode, e.temp.path || '',
    e.tool_files.map((t) => t.path).join(';'), e.load_files.join(';'), encR(e.reads.dispatcher), encR(e.reads.business), encR(e.reads.control),
    e.audit_roles.join(','), encW(e.writes.dispatcher), encW(e.writes.business), encW(e.writes.control), e.deny_read.join(';'), e.protect_write.join(';'),
    e.guard ? e.guard.policy_sha256 : '', encQ(e.requires), e.gate,
    e.outputs.filter((o) => o.code !== 'CONSOLE').map((o) => o.code + ':' + o.path).join(';'),
    e.fail_class, e.failure_modes.map((m) => m.code + '=' + m.class + (m.trigger ? '(' + m.trigger + ')' : '')).join(';'),
    e.security_triggers.join(';')].join('\t'));
}
eq('TSV byte-identical', shaText(trows.join('\n') + '\n'), shaText(tsv));
eq('TSV rows 58', tsv.split('\n').slice(1, -1).length, 58);
eq('TSV columns', tsv.split('\n')[0].split('\t').length, HEAD.length);

// ---------------------------------------------------------------- publishing state
const pubRoot = DIR;
const curPath = path.join(pubRoot, '_publish', 'CURRENT.json');
if (fs.existsSync(curPath)) {
  const cur = JSON.parse(fs.readFileSync(curPath, 'utf8'));
  ok('CURRENT schema', cur.schema === 'p47-publish-current-v1');
  ok('CURRENT release exists', fs.existsSync(path.join(pubRoot, '_publish', 'releases', cur.rid)));
  let curBad = 0;
  for (const f of cur.files) {
    const p = path.join(pubRoot, f.path);
    if (!fs.existsSync(p)) { curBad++; continue; }
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha(b) !== f.sha256) curBad++;
  }
  eq('CURRENT files match materialised tree', curBad, 0);
  const relIdx = path.join(pubRoot, '_publish', 'releases', cur.rid, '.release-index.json');
  ok('release index present', fs.existsSync(relIdx));
  if (fs.existsSync(relIdx)) eq('release index equals CURRENT', JSON.parse(fs.readFileSync(relIdx, 'utf8')).length, cur.files.length);
  const journalPath = path.join(pubRoot, '_publish', 'journal.json');
  ok('journal present', fs.existsSync(journalPath));
  if (fs.existsSync(journalPath)) {
    const j = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    ok('journal state verified', j.state === 'verified', j.state);
    ok('journal rid equals CURRENT', j.rid === cur.rid);
  }
} else {
  // pre-publish staging: no pointer yet is allowed only when _publish is absent
  ok('pre-publish without pointer', !fs.existsSync(path.join(pubRoot, '_publish')));
}

// docs hygiene
for (const f of [R.reg, R.tsv, R.vec, R.main, R.audit, R.failure, R.publish, R.self, R.manifest]) {
  const b = read(f);
  ok('hygiene bom/cr ' + f, !(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) && !b.includes(0x0d));
  ok('no placeholder ' + f, !/(\$\{|TODO|TBD|FIXME)/.test(text(f)));
}
ok('no V7 root in V8 artifacts', !text(R.reg).includes('p47-phase0-v7') && !tsv.includes('p47-phase0-v7'));

// delivery manifest binds every listed file; no missing/extra deliverable
const manRows = [...docs[R.manifest].matchAll(/^\| `([^`]+)` \| (\d+) \| (\d+) \| `([0-9a-f]{64})` \|$/gm)];
eq('manifest rows 25', manRows.length, 25);
let manBad = 0;
for (const m of manRows) {
  const p = path.join(DIR, m[1]);
  if (!fs.existsSync(p)) { manBad++; failures.push('manifest missing file ' + m[1]); continue; }
  const b = fs.readFileSync(p);
  if (b.length !== Number(m[2]) || sha(b) !== m[4]) { manBad++; failures.push('manifest mismatch ' + m[1]); }
}
eq('manifest hashes match tree', manBad, 0);
const listed = new Set(manRows.map((m) => m[1]));
const expected = new Set([R.reg, R.tsv, R.vec, R.main, R.audit, R.failure, R.publish,
  'PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md', 'PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md',
  'PHASE4.7-PHASE0-V8-OPEN-ISSUES.md', 'PHASE4.7-PHASE0-V8-SELF-CHECK.md', 'PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md',
  'p0v8-lib.cjs', 'p0v8-spec.cjs', 'p0v8-flow.cjs', 'p0v8-audit.cjs', 'p0v8-build.cjs', 'p0v8-publish.cjs',
  'p0v8-check.cjs', 'p0v8-verify.ps1', 'p0v8-parse-inline.ps1', 'p0v8-hygiene.cjs',
  'p0v8-controlconfig-check.cjs', 'p0v8-lab.cjs', 'p0v8-manifest.cjs']);
eq('manifest covers exactly the package', [...listed].sort().join(','), [...expected].sort().join(','));

// historical immutability: V7 delivery hashes (measured from the tenth review report)
const V7 = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V7.md': 'f7fb35cddc82197aaeb6f23efcbf99e1356a2983fa71af108a390ef40b0e2bc5',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv': 'a6473b6088d6059f89e3d3d4bcac1599668bd4ad4e8993c30c055dbc928d8aa3',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json': 'a5c00b6698dac585159296965c4f9a3c7afa8b13b22ec0af17cd540f54c50695',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md': 'b060bea60bdcc39cd499dc8df44de63e2bd29f05c7f95a962c497a77bc2cfe8d',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json': '3d4bd77841d3ebf9e8b46935b17b5d65d42a385a3222bc846c2b15fde8b86f07',
  'p0v7-spec.cjs': '4d240971d58c3144f340e973e1b526bab6355348ff207a685c3140475cbd0e2b',
  'p0v7-build.cjs': '67712a0703671d5402475a3c345736afb6a98c3dff3bb2bd1870af1978b03116',
  'p0v7-check.cjs': '4fa6487e043ca6c7d881157633507287c5ae9d519b286fc09c43b7573435897d',
};
for (const [f, h] of Object.entries(V7)) {
  const candidates = [path.join(DIR, '..', 'V7', f), path.join(DIR, '..', '..', '..', 'V7', f)];
  const p = candidates.find((x) => fs.existsSync(x));
  if (!p) { ok('V7 present ' + f, false); continue; }
  eq('V7 immutable ' + f, sha(fs.readFileSync(p)), h);
}

console.log(JSON.stringify({
  dir: DIR, checks, failed: failures.length, failures: failures.slice(0, 40),
  registry_sha256: sha(read(R.reg)), vectors_sha256: sha(read(R.vec)),
  matrix_digest: publishedDigest,
}, null, 2));
if (failures.length) process.exit(1);
