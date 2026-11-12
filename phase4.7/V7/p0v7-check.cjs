'use strict';
// V7 independent checker. Reads only artifacts; implements its own canonicalization and schema rules.
// No import of p0v7-build / p0v7-audit / p0v7-spec.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = __dirname;
const R = {
  reg: 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json',
  tsv: 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv',
  vec: 'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json',
  main: 'PHASE4.7-PHASE0-START-CONDITIONS-V7.md',
  audit: 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md',
};
const read = (f) => fs.readFileSync(path.join(DIR, f));
const text = (f) => read(f).toString('utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaText = (s) => sha(Buffer.from(s, 'utf8'));
const utf8 = (s) => Buffer.byteLength(s, 'utf8');

// independent canonical JSON (p47-canon-json-v1)
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
const main = text(R.main);
const audit = text(R.audit);
const byId = Object.fromEntries(reg.executions.map((e) => [e.exec_id, e]));

// ---------------------------------------------------------------- schema rules
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
const KINDS = Object.keys(EVENT_REQ);
const OPS = ['create', 'overwrite', 'append', 'mkdir', 'rename', 'copy', 'acl', 'delete'];

function validateEventArray(list) {
  const errs = new Set();
  const seen = new Set();
  const results = new Map();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object') { errs.add('schema.object'); continue; }
    if (e.schema !== 'p47-audit-event-v2') errs.add('schema.schema');
    if (!/^[0-9a-f]{32}$/.test(e.event_id || '')) errs.add('schema.event_id');
    if (seen.has(e.event_id)) errs.add('schema.unique');
    seen.add(e.event_id);
    if (!Number.isSafeInteger(e.seq) || e.seq !== i + 1) errs.add('schema.seq');
    if (i === 0) { if (e.prev_event_sha256 !== null) errs.add('schema.prev'); }
    else if (e.prev_event_sha256 !== shaText(canon(list[i - 1]))) errs.add('schema.prev');
    if (!KINDS.includes(e.kind)) { errs.add('schema.kind'); continue; }
    for (const f of [...COMMON, ...EVENT_REQ[e.kind]]) if (!(f in e)) errs.add('schema.required');
    for (const f of EVENT_FORBID[e.kind]) if (f in e) errs.add('schema.forbidden');
    for (const k of ['exec_id', 'part_id', 'actor', 'role']) if (!(k in e) || typeof e[k] !== 'string' || !e[k]) errs.add('schema.type');
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.wall_time_utc || '')) errs.add('schema.time');
    if (e.kind === 'write_intent') {
      if (e.intent_id !== e.event_id) errs.add('schema.intent_id');
      if (!OPS.includes(e.op)) errs.add('schema.op');
      if (!/^[A-Z]:\\/.test(e.path || '')) errs.add('schema.path');
      if (!['file', 'dir', 'tree'].includes(e.path_kind)) errs.add('schema.path_kind');
      if (e.decision !== 'allow') errs.add('schema.decision');
    }
    if (e.kind === 'write_result') {
      if (!['ok', 'denied', 'error', 'skipped'].includes(e.outcome)) errs.add('schema.outcome');
      if (e.outcome === 'ok' ? e.error_code !== null : typeof e.error_code !== 'string') errs.add('schema.error_code');
      const intent = list.find((x) => x.kind === 'write_intent' && x.event_id === e.intent_ref);
      if ('intent_ref' in e) {
        if (!intent) errs.add('schema.intent_ref');
        else {
          if (intent.exec_id !== e.exec_id) errs.add('schema.intent_ref');
          if (intent.part_id !== e.part_id) errs.add('schema.intent_ref');
          if (intent.seq >= e.seq) errs.add('schema.intent_ref');
          if (results.has(e.intent_ref)) errs.add('schema.intent_ref');
          results.set(e.intent_ref, e.event_id);
        }
      }
    }
    if (e.kind === 'read_batch') {
      if (!['content', 'metadata'].includes(e.mode)) errs.add('schema.mode');
      if (!Array.isArray(e.entries)) errs.add('schema.entries');
      if (!e.counts || typeof e.counts !== 'object') errs.add('schema.counts');
    }
  }
  return [...errs];
}

const CHAIN_REQ = {
  genesis: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'run_id', 'created_utc', 'registry_sha256', 'manifest_sha256', 'verifier_result', 'bootstrap', 'writer', 'writer_tool_sha256'],
  segment_open: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'exec_id', 'command_id', 'args_sha256', 'cwd', 'entry_path', 'entry_sha256', 'planned_predecessor', 'c18_state', 'c18_binding_sha256', 'c18_destination', 'segment_dir'],
  segment_close: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'exec_id', 'command_id', 'result', 'exit_code', 'parts', 'events_total', 'unpaired_intents', 'segment_digest', 'summary_path', 'summary_sha256', 'summary_bytes', 'outputs', 'child_exit_codes'],
  segment_skip: ['schema', 'record', 'chain_seq', 'prev_record_sha256', 'prev_file_bytes', 'exec_id', 'command_id', 'reason', 'failed_dependency', 'skipped_utc'],
};
function validateRecord(kind, rec) {
  const errs = new Set();
  if (!CHAIN_REQ[kind]) return ['schema.record'];
  if (rec.schema !== 'p47-chain-record-v3') errs.add('schema.schema');
  for (const f of CHAIN_REQ[kind]) if (!(f in rec)) errs.add('schema.required');
  if (kind === 'segment_skip') {
    if ('segment_dir' in rec || 'summary_path' in rec) errs.add('schema.forbidden');
    if (rec.reason !== 'dependency-failed') errs.add('schema.reason');
  }
  return [...errs];
}

// ---------------------------------------------------------------- vectors
for (const v of [...vec.valid, ...vec.events, ...vec.chain, ...vec.summary]) {
  ok('vector canonical hash ' + v.name, shaText(v.canonical) === v.sha256);
  eq('vector bytes ' + v.name, utf8(v.canonical), v.bytes);
}
const events = vec.events.map((v) => JSON.parse(v.canonical));
eq('positive event schema', validateEventArray(events).join(','), '');
for (const v of vec.chain) {
  const obj = JSON.parse(v.canonical);
  eq('positive chain schema ' + v.name, validateRecord(obj.record, obj).join(','), '');
}
const chain = Object.fromEntries(vec.chain.map((v) => [v.name, v]));
const g = JSON.parse(chain.genesis.canonical), o = JSON.parse(chain.segment_open.canonical);
const c = JSON.parse(chain.segment_close.canonical), s = JSON.parse(chain.segment_skip.canonical);
eq('genesis prev null', g.prev_record_sha256, null);
eq('open prev genesis', o.prev_record_sha256, chain.genesis.sha256);
eq('close prev open', c.prev_record_sha256, chain.segment_open.sha256);
eq('skip prev close', s.prev_record_sha256, chain.segment_close.sha256);
eq('open prev bytes = genesis line', o.prev_file_bytes, utf8(chain.genesis.canonical) + 1);
eq('close prev bytes', c.prev_file_bytes, utf8(chain.genesis.canonical) + 1 + utf8(chain.segment_open.canonical) + 1);
eq('skip prev bytes', s.prev_file_bytes, utf8(chain.genesis.canonical) + 1 + utf8(chain.segment_open.canonical) + 1 + utf8(chain.segment_close.canonical) + 1);
eq('C19 entry matches registry', o.entry_path, byId['C19-E01'].entry_path);
eq('C19 args matches registry', o.args_sha256, byId['C19-E01'].argv_sha256);
const lines = events.map((e) => canon(e) + '\n');
const partBytes = lines.reduce((n, x) => n + utf8(x), 0);
const partSha = sha(Buffer.from(lines.join(''), 'utf8'));
eq('jsonl part bytes', vec.jsonl.bytes_including_lf, partBytes);
eq('jsonl part sha', vec.jsonl.sha256, partSha);
const summary = JSON.parse(vec.summary[0].canonical);
const wr = events.find((e) => e.kind === 'write_result');
eq('write_result and summary agree on index sha', wr.after.sha256, summary.outputs[0].sha256);
eq('write_result and summary agree on index bytes', wr.after.bytes, summary.outputs[0].bytes);
eq('summary part bytes', summary.parts[0].bytes, partBytes);
eq('summary part sha', summary.parts[0].sha256, partSha);

// negatives: parse delivered bytes and require exactly one error
const negatives = {};
for (const n of vec.negative) {
  let actual;
  if (n.name === 'truncated_line_without_lf') {
    const v = JSON.parse(n.canonical);
    actual = (v.bytes_including_lf === utf8(v.line) + 1) ? [] : ['bytes.lf'];
  } else if (n.name === 'prev_file_bytes_missing_lf') {
    const v = JSON.parse(n.canonical);
    actual = (v.declared_prev_file_bytes === v.previous_line_bytes) ? [] : ['bytes.prev_file_bytes'];
  } else if (n.name === 'summary_self_hash') {
    const v = JSON.parse(n.canonical);
    actual = ('summary_sha256' in v) ? ['schema.forbidden'] : [];
  } else {
    const v = JSON.parse(n.canonical);
    if (Array.isArray(v)) actual = validateEventArray(v);
    else if (v.kind) actual = validateEventArray([v]);
    else if (v.record) actual = validateRecord(v.record, v);
    else actual = ['schema.record'];
  }
  negatives[n.name] = actual;
  ok('negative exactly one error: ' + n.name, actual.length === 1, actual.join(','));
  ok('negative expected code: ' + n.name, actual[0] === n.expect, actual.join(','));
}

// invalid canonical inputs (independent values)
const invalid = { float: 1.5, unsafe_integer: 9007199254740992, uppercase_key: { Key: 1 }, non_ascii_key: { 'é': 1 }, dash_key: { 'a-b': 1 }, lone_high_surrogate: '\ud800', lone_low_surrogate: '\udc00', undefined_value: undefined, nan: NaN, infinity: Infinity, function_value: function () {}, bigint_value: 10n };
for (const k of vec.invalid_kinds) {
  let threw = false;
  try { canon(invalid[k]); } catch (e) { threw = true; }
  ok('invalid canonical rejected: ' + k, threw);
}

// ---------------------------------------------------------------- registry
eq('commands 21', reg.counts.commands, 21);
eq('executions 58', reg.counts.executions, 58);
eq('participants 54', reg.counts.chain_participants, 54);
eq('records 109/103', String(reg.counts.chain_records_bound) + '/' + reg.counts.chain_records_unbound, '109/103');
eq('plans 58/55', String(reg.counts.plan_bound) + '/' + reg.counts.plan_unbound, '58/55');
eq('payload 20/16/4', [reg.counts.payload_files, reg.counts.staged_files, reg.counts.bootstrap_files].join('/'), '20/16/4');
eq('release root v7', reg.release.source_root, 'D:\\P47TOOLS\\p47-phase0-v7');
const planB = reg.plan.order_bound, planU = reg.plan.order_unbound;
eq('plan bound unique', new Set(planB).size, planB.length);
eq('plan unbound unique', new Set(planU).size, planU.length);
eq('unbound removes C18 trio', planB.filter((x) => !planU.includes(x)).join(','), 'C07-B-C18-E01,C18-E01,C07-A-C18-E01');
reg.executions.forEach((e, i) => {
  eq('order bound ' + e.exec_id, e.plan_order_bound, i + 1);
  eq('pred bound ' + e.exec_id, e.predecessor_bound, i === 0 ? null : planB[i - 1]);
});
planU.forEach((id, i) => {
  const e = byId[id];
  eq('order unbound ' + id, e.plan_order_unbound, i + 1);
  eq('pred unbound ' + id, e.predecessor_unbound, i === 0 ? null : planU[i - 1]);
});
eq('B-C19 unbound pred is BIND', byId['C07-B-C19-E01'].predecessor_unbound, 'C18-BIND-E01');

let argvBad = 0, inlineBad = 0, tgtBad = 0;
for (const e of reg.executions) {
  if (shaText(canon(e.argv)) !== e.argv_sha256) argvBad++;
  if ((e.entry_mode === 'inline' || e.entry_mode === 'codex-inline') && shaText(e.argv[e.argv.length - 1]) !== e.inline_sha256) inlineBad++;
  if (e.target_argv && shaText(canon(e.target_argv)) !== e.target_argv_sha256) tgtBad++;
  ok('exec fields ' + e.exec_id, !!e.entry_path && !!e.cwd && !!e.gate && Array.isArray(e.argv));
  ok('tool hashes null ' + e.exec_id, e.tool_files.every((t) => t.sha256 === null && t.sha_source === 'RELEASE-MANIFEST.json'));
}
eq('argv 58/58', argvBad, 0); eq('inline 2/2', inlineBad, 0); eq('target argv hashes', tgtBad, 0);

const intersects = (r, d) => {
  const a = r.path.toLowerCase(), b = d.toLowerCase();
  if (a === b) return true;
  if (a.startsWith(b + '\\')) return true;
  if ((r.kind === 'subtree' || r.kind === 'map-list') && b.startsWith(a + '\\')) return true;
  return false;
};
const staged = reg.release.mapping_table.filter((m) => m.staged).map((m) => m.staged);
let overlap = 0;
for (const e of reg.executions) {
  for (const r of e.reads.business) for (const d of e.deny_read) if (intersects(r, d)) { overlap++; failures.push('overlap ' + e.exec_id + ' ' + r.path + ' <-> ' + d); }
  if (e.product) for (const r of e.product.reads) for (const d of e.product.deny_read) if (intersects(r, d)) { overlap++; failures.push('product overlap ' + e.exec_id); }
}
eq('total allow/deny intersections', overlap, 0);
for (const id of ['C05-FINAL-E01', 'C20-SEAL-E01']) {
  const e = byId[id];
  ok('FINAL/SEAL reads staged subtree ' + id, e.reads.business.some((r) => r.path === reg.release.staged_root && r.kind === 'subtree'));
  ok('FINAL/SEAL no staged deny ' + id, !e.deny_read.some((d) => d.toLowerCase() === reg.release.staged_root.toLowerCase()));
  ok('FINAL/SEAL no staged-file deny ' + id, !e.deny_read.some((d) => staged.some((x) => x.toLowerCase() === d.toLowerCase())));
}
for (const e of reg.executions.filter((x) => x.entry_mode === 'staged-dispatcher')) {
  ok('staged self-read exact ' + e.exec_id, e.reads.dispatcher.some((r) => r.path === e.entry_path));
  ok('staged self-read not source ' + e.exec_id, !e.reads.dispatcher.some((r) => r.path === 'D:\\P47TOOLS\\p47-phase0-v7\\payload\\tools\\p0-dispatch.ps1'));
}
ok('C06 guard policy', byId['C06-E01'].guard && /^[0-9a-f]{64}$/.test(byId['C06-E01'].guard.policy_sha256));
ok('C03 observer role', byId['C03-OBS-E01'].audit_part_rule.roles.includes('observer'));
for (const id of ['C10-P-E01', 'C10-N-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C10-S-E01', 'C15-E01', 'C16-E01']) {
  ok('product roles ' + id, byId[id].product && byId[id].audit_part_rule.roles.includes('product'));
  ok('product audit rule ' + id, byId[id].product.audit_part_rule && byId[id].product.audit_part_rule.roles.includes('product'));
  ok('product preload reads ' + id, byId[id].product.reads.some((r) => r.path.endsWith('fs-guard.cjs')) && byId[id].product.reads.some((r) => r.path.endsWith('p0-audit.cjs')));
  eq('runner temp ' + id, byId[id].required_env.TEMP, 'D:\\P47RUN\\P47-20261111-01\\tmp');
  eq('product temp ' + id, byId[id].product.env.TEMP, byId[id].product.copy + '\\tmp');
}
for (const id of ['C12-E01', 'C16-E01']) ok('dist policy exclusive ' + id, byId[id].product.dist_policy.startsWith('exclusive allow') && !byId[id].product.protect_write.includes(byId[id].product.copy + '\\dist'));
for (const id of ['C10-P-E01', 'C11-E01', 'C13-E01', 'C15-E01']) ok('probe dist protected ' + id, byId[id].product.protect_write.includes(byId[id].product.copy + '\\dist'));
eq('C14 map-list kind', byId['C14-E01'].writes.business.filter((w) => w.path === 'D:\\P47RUN\\P47-20261111-01\\exp\\sandbox-01')[0].kind, 'map-list');
ok('C14 no subtree write', !byId['C14-E01'].writes.business.some((w) => w.path === 'D:\\P47RUN\\P47-20261111-01\\exp\\sandbox-01' && w.op === 'subtree-write'));
ok('C01 no business chain write', !byId['C01-E01'].writes.business.some((w) => w.path.endsWith('chain-head.jsonl')));
ok('C01 control create+append', byId['C01-E01'].writes.control.some((w) => w.op === 'file-create') && byId['C01-E01'].writes.control.some((w) => w.op === 'file-append'));
for (const e of reg.executions.filter((x) => x.chain_role === 'participant')) {
  ok('audit parent dir ' + e.exec_id, e.writes.control.some((w) => w.op === 'dir-create-if-absent'));
}
eq('BIND binding output', byId['C18-BIND-E01'].outputs.filter((o) => o.code === 'FC').length, 1);
eq('BIND metadata token', byId['C18-BIND-E01'].metadata_reads.join(','), 'ENV_METADATA:P0_SECOND_ARCHIVE');
ok('C18 no live env', !('P0_SECOND_ARCHIVE' in byId['C18-E01'].required_env));
ok('C18 reads binding file', byId['C18-E01'].reads.business.some((r) => r.path.endsWith('c18-binding.json')));
ok('C18 binding destination token', byId['C18-E01'].outputs.some((o) => o.path === 'BINDING:c18_destination'));
const c04 = byId['C04-E01'];
ok('C04 root stays directory', c04.outputs.some((o) => o.code === 'DC' && o.path.endsWith('\\tools')));
eq('C04 staged file entries', c04.outputs.filter((o) => o.code === 'FC' && o.path.includes('\\tools\\')).length, 16);
ok('C04 no subtree-create of tools', !c04.outputs.some((o) => o.code === 'TC' && o.path.endsWith('\\tools')));
ok('C04 gate allows empty dir', /empty directory/.test(c04.gate));

// security classes + deps
ok('security priority', /security > fatal > gate/.test(reg.plan.failure_policy.security_priority));
ok('skip policy', reg.plan.failure_policy.skip_policy.action.includes('segment_skip'));
ok('seal modes', ['sealed-full', 'degraded-prefix', 'aborted', 'chain-broken'].every((m) => m in reg.plan.failure_policy.seal_modes));
eq('failure states 12', reg.plan.failure_policy.states.length, 12);
for (const id of ['C10-P-E01', 'C10-N-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C10-S-E01', 'C14-E01', 'C15-E01', 'C16-E01', 'C18-E01']) {
  ok('security codes on gate exec ' + id, Array.isArray(byId[id].security_codes) && byId[id].security_codes.length > 0);
}
const deps = Object.fromEntries(reg.executions.map((e) => [e.exec_id, e.deps || []]));
for (const [id, list] of Object.entries(deps)) for (const d of list) ok('dep exists ' + id + '->' + d, !!byId[d]);
function closure(start) {
  const exempt = new Set(reg.plan.failure_policy.skip_policy.report_exempt || []);
  const seen = new Set(); const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    for (const [id, ds] of Object.entries(deps)) {
      if (ds.includes(cur) && !seen.has(id) && !exempt.has(id)) { seen.add(id); stack.push(id); }
    }
  }
  return seen;
}
const skipP = closure('C10-P-E01');
for (const id of ['C10-N-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C10-S-E01', 'C14-E01', 'C15-E01', 'C16-E01']) ok('C10-P failure skips ' + id, skipP.has(id));
for (const id of ['C19-E01', 'C20-REPORT-E01', 'C20-SEAL-E01']) ok('report path survives gate failure ' + id, !skipP.has(id));
const orderOf = Object.fromEntries(reg.executions.map((e) => [e.exec_id, e.plan_order_bound]));
let cyc = 0;
for (const [id, ds] of Object.entries(deps)) for (const d of ds) if ((orderOf[d] || 0) >= (orderOf[id] || 0)) cyc++;
eq('deps always point backwards', cyc, 0);

// ---------------------------------------------------------------- TSV
const encR = (l) => l.map((r) => (r.kind === 'subtree' ? 'T:' : r.kind === 'metadata' ? 'M:' : 'F:') + r.path).join(';');
const encW = (l) => l.map((w) => w.op + ':' + w.path).join(';');
const HEAD = ['exec_id', 'command_id', 'variant', 'step', 'plan_order_bound', 'plan_order_unbound', 'executor', 'entry_mode',
  'entry_path', 'cwd', 'argv_sha256', 'inline_sha256', 'chain_role', 'deadline_seconds', 'tool_files', 'load_files',
  'dispatcher_reads', 'business_reads', 'control_reads', 'audit_part_rule', 'dispatcher_writes', 'business_writes',
  'control_writes', 'deny_read', 'protect_write', 'guard_policy_sha256', 'predecessor_bound', 'predecessor_unbound',
  'gate', 'outputs', 'fail_class', 'deps', 'security_codes'];
const rows = [HEAD.join('\t')];
for (const e of reg.executions) {
  rows.push([e.exec_id, e.command_id, e.variant || '', e.step, String(e.plan_order_bound), e.plan_order_unbound ? String(e.plan_order_unbound) : '', e.executor, e.entry_mode,
    e.entry_path, e.cwd, e.argv_sha256, e.inline_sha256 || '', e.chain_role, e.deadline_seconds ? String(e.deadline_seconds) : '',
    e.tool_files.map((t) => t.path).join(';'), e.load_files.join(';'), encR(e.reads.dispatcher), encR(e.reads.business), encR(e.reads.control),
    e.audit_part_rule ? e.audit_part_rule.pattern + '@' + e.audit_part_rule.dir : '', encW(e.writes.dispatcher), encW(e.writes.business), encW(e.writes.control),
    e.deny_read.join(';'), e.protect_write.join(';'), e.guard ? e.guard.policy_sha256 : '', e.predecessor_bound || '', e.predecessor_unbound || '', e.gate,
    e.outputs.filter((o) => o.code !== 'CONSOLE').map((o) => o.code + ':' + o.path).join(';'), e.fail_class, e.deps.join(';'), e.security_codes.join(';')].join('\t'));
}
eq('TSV regenerated byte-identical', shaText(rows.join('\n') + '\n'), shaText(tsv));
eq('TSV rows', tsv.split('\n').slice(1, -1).length, 58);
eq('TSV columns', tsv.split('\n')[0].split('\t').length, 33);

// ---------------------------------------------------------------- docs/hygiene
for (const t of ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10', 'N11', 'N12', '33 列', '109/103', 'degraded-prefix', 'segment_skip', 'binding']) ok('main covers ' + t, main.includes(t));
ok('audit covers segment_skip', audit.includes('segment_skip'));
ok('audit covers LF rule', audit.includes('LF'));
ok('no stale byte counts', !/(^|[^0-9a-f])669([^0-9a-f]|$)/.test(main) && !/(^|[^0-9a-f])1337([^0-9a-f]|$)/.test(main) && !/(^|[^0-9a-f])669([^0-9a-f]|$)/.test(audit) && !/(^|[^0-9a-f])1337([^0-9a-f]|$)/.test(audit));
for (const f of [R.reg, R.tsv, R.vec, R.main, R.audit]) {
  const b = read(f);
  ok('hygiene bom/cr ' + f, !(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) && !b.includes(0x0d));
  ok('no placeholder ' + f, !/(\$\{|TODO|TBD|FIXME)/.test(text(f)));
}
ok('no V6 root in V7 artifacts', !text(R.reg).includes('p47-phase0-v6') && !tsv.includes('p47-phase0-v6'));

// V6 immutability (19 files from the V6 delivery manifest)
const V6 = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V6.md': '5342fd55f5a844fc76b56cf07569ef8923925d48e22ee9ed249bacd825221a58',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv': '661ca153076ab458a48a919709da0241fd7e72f831d66637531e68565236514d',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json': '29b1693104c2690cf6987a9dd247aa4145ec17ffcfc5a7c33b225bbcb1e69906',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md': 'c3026ab8c226833794a2245d1cbbe83bd8ec905ae06a440934fe194276099088',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json': '8d9a4773296e8f57509b4d659d6f3d6ca94ebf70cfeddd8dcb03803a06a8418b',
  'PHASE4.7-PHASE0-V5-TO-V6-CHANGELOG.md': '5ee7f761b9d68cd83abad32f08dde9c1e8b853b15555b71a95d204d53240bd16',
  'PHASE4.7-PHASE0-V6-OPEN-ISSUES.md': '1f85f67535046c6df1ee156c7a5edb28ffc49c5b364c40f0a82598484fd0eac7',
  'PHASE4.7-PHASE0-V6-SELF-CHECK.md': '98a3329c453972a58eb8c5158782df8a116a907246be2ddb225733fd18e0a588',
  'PHASE4.7-PHASE0-V6-EIGHTH-REVIEW-TRACEABILITY.md': '88666c0314329c259bafbc20a7f14664f3d9682ae2e72260f9a40bc93e245505',
  'PHASE4.7-PHASE0-V6-DELIVERY-MANIFEST.md': 'f11846ff7f0953c6e70d8d863a1b42b5a6b1187f21a53a31476ce9013a8022b5',
  'p0v6-lib.cjs': '799dcbb5081f87d3be77b1e57502b8c9f572c5d61b343c28cb5e5a9bd0dfb482',
  'p0v6-spec.cjs': 'a75342552623f15995c45d84456a6b987ad3490191d3466de3fa7d65bc91b075',
  'p0v6-audit.cjs': 'be3b4543c328ecb473926b762899764c2ee172a3c2c913e7075c404647e48583',
  'p0v6-build.cjs': 'be57bba1cbc7442ba66aec562ffcd488516709a154baf62c4b50a714a2bb8f3d',
  'p0v6-check.cjs': '9bca4cbcb74e92b1a2982522a7bf97813fdfd3011a4f3a556b5eab596e9630c3',
  'p0v6-verify.ps1': 'c61356c1ab7608f99d138ff032386b65b49f283fc1fd03b6ba3feb1e949ce085',
  'p0v6-parse-inline.ps1': '430b9718e0699e661ceacc40e359dd12ca9614896c3f64395454fea2add7a846',
  'p0v6-hygiene.cjs': '3e24a658563f9118ced6860ff97476435fe7044ce22d731e6bbd11d297b85072',
  'p0v6-controlconfig-check.cjs': 'a08e0859984cc7c2361685c05a0684569dc27620565e3b5153f614a0fdd7e390',
};
for (const [f, h] of Object.entries(V6)) {
  const p = path.join(DIR, '..', f);
  if (!fs.existsSync(p)) { ok('V6 present ' + f, false); continue; }
  eq('V6 immutable ' + f, sha(fs.readFileSync(p)), h);
}

console.log(JSON.stringify({ checks, failed: failures.length, failures: failures.slice(0, 30), registry_sha256: sha(read(R.reg)), vectors_sha256: sha(read(R.vec)) }, null, 2));
if (failures.length) process.exit(1);
