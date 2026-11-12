'use strict';
// Audit contract + deterministic fixtures/vectors for Phase 0 V9.
// The independent checker (p0v9-check.cjs) re-implements every rule and never imports this file.
const L = require('./p0v9-lib.cjs');
const S = require('./p0v9-spec.cjs');
const { canon, sha256utf8, sha256hex, P } = L;

const AUDIT = {
  schema_event: 'p47-audit-event-v9',
  schema_chain: 'p47-chain-record-v9',
  schema_summary: 'p47-segment-summary-v9',
  schema_seal: 'p47-terminal-seal-v9',
  schema_vectors: 'p47-audit-vectors-v9',
  canon: 'p47-canon-json-v1',
  hash: 'sha256',
  event_types: ['exec_begin', 'exec_end', 'write_intent', 'write_result', 'read_batch', 'preload',
    'observe_start', 'observe_relay', 'observe_end'],
  chain_records: ['genesis', 'segment_open', 'segment_close', 'segment_skip'],
  roles: ['dispatcher', 'tool', 'observer', 'product'],
  part_naming: 'events-<role>-<pid>-<rand8>.jsonl',
  chain_writer: 'p0-audit.cjs control modes, spawned by p0-dispatch.ps1, account WENX\\Administrator',
  chain_readers: ['p0-dispatch.ps1 open/seal steps', 'p0-index.cjs (C19)', 'p0-report.cjs (C20-REPORT)', 'p0-audit.cjs terminal-seal (C20-SEAL)'],
  chain_forbidden: ['any business tool', 'any product process', 'Codex account', 'C03 probe'],
  line_bytes: 'each record = canonical JSON + one LF; prev_file_bytes includes every previous LF',
  order: ['business processes exit', 'parts frozen and verified', 'seal writes summary.json with CreateNew (no self hash, no chain reference)', 'close appends segment_close with part digests and the summary hash'],
};

const E = (name, presence, rule) => ({ name, presence, rule });
const COMMON_EVENT = [
  E('schema', 'required', "const 'p47-audit-event-v9'"),
  E('event_id', 'required', '32 lowercase hex [0-9a-f]; unique in the run'),
  E('exec_id', 'required', 'registered execution id'),
  E('part_id', 'required', 'matches the part file name'),
  E('seq', 'required', 'integer >= 1, contiguous inside the part'),
  E('prev_event_sha256', 'required', 'null only for seq=1; else sha256 of the previous canonical text'),
  E('kind', 'required', 'one of the nine event types'),
  E('wall_time_utc', 'required', 'ISO 8601 UTC with milliseconds and Z'),
  E('actor', 'required', "const 'WENX\\Administrator'"),
  E('role', 'required', "dispatcher | tool | observer | product; must also appear in the exec's audit_part_rule.roles"),
];
const EVENT_FIELDS = {
  exec_begin: [...COMMON_EVENT, E('argv_sha256', 'required', 'canonical argv hash; equals the registered argv hash'), E('cwd', 'required', 'absolute'),
    E('entry_path', 'required', 'absolute; equals the registered entry_path'), E('entry_sha256', 'required', 'byte hash'), E('pid', 'required', 'integer'),
    E('ppid', 'required', 'integer'), E('outcome', 'forbidden', 'begin cannot claim an outcome')],
  exec_end: [...COMMON_EVENT, E('exit_code', 'required', 'integer'), E('started_utc', 'required', 'ISO 8601 UTC'),
    E('ended_utc', 'required', 'ISO 8601 UTC'), E('child_exit_codes', 'required', 'array of {pid, code}'),
    E('write_intent', 'forbidden', 'end is not a write')],
  write_intent: [...COMMON_EVENT, E('intent_id', 'required', 'exactly equal to event_id'),
    E('op', 'required', 'create | overwrite | append | mkdir | rename | copy | acl | delete'), E('path', 'required', 'canonical absolute path'),
    E('path_kind', 'required', 'file | dir | tree'), E('src_path', 'required', 'null unless rename/copy'),
    E('rule_ref', 'required', 'permission entry id <exec>.<layer>[index]'), E('decision', 'required', "const 'allow'"),
    E('before', 'required', 'null when absent; else {exists, bytes, sha256, mtime_utc, sddl}'),
    E('outcome', 'forbidden', 'not known before the action'), E('error_code', 'forbidden', 'not known before'),
    E('after', 'forbidden', 'not known before'), E('bytes_written', 'forbidden', 'not known before')],
  write_result: [...COMMON_EVENT, E('intent_ref', 'required', 'event_id of a write_intent in the same part, same exec, earlier seq'),
    E('outcome', 'required', 'ok | denied | error | skipped'), E('error_code', 'required', 'null only when ok'),
    E('after', 'required', 'null unless ok'), E('bytes_written', 'required', 'null unless ok and op writes bytes'),
    E('durable', 'required', 'true only after flush/fsync; must be true when ok'), E('op', 'forbidden', 'reference only'), E('path', 'forbidden', 'reference only'),
    E('src_path', 'forbidden', 'reference only'), E('rule_ref', 'forbidden', 'reference only'), E('before', 'forbidden', 'reference only')],
  read_batch: [...COMMON_EVENT, E('mode', 'required', 'content | metadata'),
    E('entries', 'required', 'non-empty array of {path, path_kind, rule_ref, result, bytes, sha256, error_code}'),
    E('counts', 'required', '{ok, denied, absent, unlisted}'), E('outcome', 'forbidden', 'per-entry result only')],
  preload: [...COMMON_EVENT, E('guard_pid', 'required', 'integer'), E('parent_pid', 'required', 'integer'),
    E('process_role', 'required', 'runner | tool | main | worker | product'), E('guard_sha256', 'required', 'byte hash'),
    E('argv_sha256', 'required', 'canonical process argv hash'), E('policy_sha256', 'required', 'static policy hash'),
    E('inherited_env_keys', 'required', 'sorted P0_GUARD_* keys')],
  observe_start: [...COMMON_EVENT, E('observed_account', 'required', 'one of the two Codex names'),
    E('observed_sid', 'required', 'resolved SID'), E('nonce', 'required', '64 lowercase hex'),
    E('deadline_seconds', 'required', 'integer 900'), E('stdout', 'forbidden', 'no relay text as a field')],
  observe_relay: [...COMMON_EVENT, E('line_sha256', 'required', 'sha256 of the relayed line bytes'),
    E('line_bytes', 'required', 'integer <= 4096'), E('verdict', 'required', 'ok | reject'),
    E('reason', 'required', 'null when ok; else schema | nonce | account | sid | admin | group | sentinel | write | cwd'),
    E('reported_account', 'required', 'account reported by the probe'), E('reported_sid', 'required', 'SID reported by the probe'),
    E('reported_write_result', 'required', 'denied | granted | error'), E('nonce_match', 'required', 'boolean')],
  observe_end: [...COMMON_EVENT, E('relay_seen', 'required', 'boolean'), E('verdict', 'required', 'pass | fail'),
    E('exit_code', 'required', 'integer'), E('relay_line', 'forbidden', 'only the hash is stored')],
};

const CHAIN_FIELDS = {
  genesis: [E('schema', 'required', "const 'p47-chain-record-v9'"), E('record', 'required', "const 'genesis'"),
    E('chain_seq', 'required', 'integer 1'), E('prev_record_sha256', 'required', 'null'), E('prev_file_bytes', 'required', '0'),
    E('run_id', 'required', 'const'), E('created_utc', 'required', 'ISO 8601 UTC'), E('registry_sha256', 'required', 'registry hash'),
    E('manifest_sha256', 'required', 'manifest hash'), E('verifier_result', 'required', "const 'pass'"),
    E('bootstrap', 'required', 'enumerated [{op, path, result}]'), E('writer', 'required', 'WENX\\Administrator'),
    E('writer_tool_sha256', 'required', 'byte hash')],
  segment_open: [E('schema', 'required', "const 'p47-chain-record-v9'"), E('record', 'required', "const 'segment_open'"),
    E('chain_seq', 'required', 'previous + 1'), E('prev_record_sha256', 'required', 'previous record sha256'),
    E('prev_file_bytes', 'required', 'physical bytes before this record, LF included'), E('exec_id', 'required', 'registered exec'),
    E('command_id', 'required', 'C00-C20'), E('args_sha256', 'required', 'dispatcher argv hash'), E('cwd', 'required', 'absolute'),
    E('entry_path', 'required', 'absolute'), E('entry_sha256', 'required', 'byte hash'), E('planned_predecessor', 'required', 'exec id or null; equals the order-selected predecessor'),
    E('c18_state', 'required', 'null except C18-BIND-E01: bound | disabled-unbound'),
    E('c18_binding_sha256', 'required', 'null except C18-BIND-E01 when bound'), E('c18_destination', 'required', 'null except C18-BIND-E01 when bound'),
    E('segment_dir', 'required', 'absolute; must not exist')],
  segment_close: [E('schema', 'required', "const 'p47-chain-record-v9'"), E('record', 'required', "const 'segment_close'"),
    E('chain_seq', 'required', 'previous + 1'), E('prev_record_sha256', 'required', 'open record sha256'),
    E('prev_file_bytes', 'required', 'physical bytes before this record'), E('exec_id', 'required', 'matches open'),
    E('command_id', 'required', 'matches open'), E('result', 'required', 'ok | failed | aborted'), E('exit_code', 'required', 'integer'),
    E('failure_class', 'required', 'null when ok; gate | fatal | security otherwise'),
    E('security_trigger', 'required', 'null unless failure_class=security; one of the published trigger ids'),
    E('parts', 'required', 'array of {name, bytes, sha256, events, first_seq, last_seq}'), E('events_total', 'required', 'integer'),
    E('unpaired_intents', 'required', 'integer; 0 for ok'),
    E('segment_digest', 'required', 'sha256 of the canonical parts array'),
    E('summary_path', 'required', 'absolute'), E('summary_sha256', 'required', 'null only when summary creation failed'),
    E('summary_bytes', 'required', 'null under the same condition'), E('outputs', 'required', 'array of {path, bytes, sha256, kind}'),
    E('child_exit_codes', 'required', 'array of {pid, code}')],
  segment_skip: [E('schema', 'required', "const 'p47-chain-record-v9'"), E('record', 'required', "const 'segment_skip'"),
    E('chain_seq', 'required', 'previous + 1'), E('prev_record_sha256', 'required', 'previous record sha256'),
    E('prev_file_bytes', 'required', 'physical bytes before this record'), E('exec_id', 'required', 'skipped exec'),
    E('command_id', 'required', 'C00-C20'), E('reason', 'required', "dependency-failed | target-skipped | c18-unbound | run-stopped"),
    E('failed_dependency', 'required', 'exec id for dependency-failed/target-skipped/run-stopped; null for c18-unbound'),
    E('skipped_utc', 'required', 'ISO 8601 UTC'),
    E('segment_dir', 'forbidden', 'a skipped execution has no segment directory'),
    E('summary_path', 'forbidden', 'a skipped execution has no summary')],
};

const SUMMARY_FIELDS = [
  E('schema', 'required', "const 'p47-segment-summary-v9'"), E('run_id', 'required', 'const'), E('exec_id', 'required', 'matches chain'),
  E('command_id', 'required', 'C00-C20'), E('result', 'required', 'ok | failed | aborted'), E('exit_code', 'required', 'integer'),
  E('failure_class', 'required', 'null when ok'), E('security_trigger', 'required', 'null unless security'),
  E('parts', 'required', 'same array as segment_close'), E('counts', 'required', '{events, write_intent, write_result, read_entries, denied, preload}'),
  E('unpaired_intents', 'required', 'integer'), E('outputs', 'required', 'same array as segment_close'),
  E('child_exit_codes', 'required', 'array'), E('sealed_utc', 'required', 'ISO 8601 UTC'),
  E('summary_sha256', 'forbidden', 'no self hash'), E('prev_record_sha256', 'forbidden', 'no chain reference'),
];

const SEAL_FIELDS = [
  E('schema', 'required', "const 'p47-terminal-seal-v9'"), E('run_id', 'required', 'const'), E('mode', 'required', 'sealed-full | degraded-prefix | aborted'),
  E('chain', 'required', '{records, last_seq, last_record_sha256, tail_kind, verified}'),
  E('staged_state', 'required', 'complete | incomplete | absent'),
  E('run_state', 'required', 'completed | aborted'), E('abort', 'required', 'null when completed; else {exec_id, failure_class, security_trigger}'),
  E('open_segments', 'required', 'array of {exec_id, parts_state, summary_state, close_state, evidence_status}'),
  E('skipped', 'required', 'array of exec ids'), E('not_started', 'required', 'array of exec ids'),
  E('gate_failed', 'required', 'array of exec ids'), E('segment_counts', 'required', '{opened, closed, skipped, orphaned}'),
  E('index', 'required', '{present, path, sha256}'), E('report', 'required', '{present, path, sha256}'),
  E('c18_state', 'required', 'bound | disabled-unbound | not-reached'),
  E('staged_recheck', 'required', '{performed, result}'), E('exit_status', 'required', 'complete | exit-not-met'),
  E('security_findings', 'required', 'array of trigger ids'), E('sealed_utc', 'required', 'ISO 8601 UTC'),
];

const FAILURE_STATES = [
  { id: 'pre-run-failed', priority: 'fatal', trigger: 'C00 or C05-PRE fails; RUN not created', owner: 'operator launch record', next: 'none', report: 'launch-record exit-not-met', complete: 'no' },
  { id: 'bootstrap-failed', priority: 'fatal', trigger: 'C01 fails before or during genesis', owner: 'dispatcher console + launch record', next: 'none (no seal, no chain records)', report: 'launch-record bootstrap-failed', complete: 'no' },
  { id: 'security-stop', priority: 'security', trigger: 'identity/permission/guard/audit/chain/staged violation', owner: 'dispatcher close + C20-SEAL', next: 'one C07-A for the failed wrapped target if started, then C20-SEAL; mode chosen by the seal function (aborted when staged complete, degraded-prefix otherwise)', report: 'terminal-seal aborted|degraded-prefix; never complete', complete: 'no' },
  { id: 'fatal-abort', priority: 'fatal', trigger: 'non-security infrastructure/target failure', owner: 'dispatcher close + C20-SEAL', next: 'halt-business: finalizers continue; halt-all: one C07-A if wrapped, then C20-SEAL', report: 'terminal-seal aborted|degraded-prefix', complete: 'no' },
  { id: 'gate-failed', priority: 'gate', trigger: 'C10-C16/C18 non-zero without a security trigger', owner: 'dispatcher close of that segment', next: 'C07-A for the target; its B/target/A triples skip; C17/C19/C20-REPORT continue on recorded terminal states', report: 'report exit-not-met', complete: 'no' },
  { id: 'dependency-skipped', priority: 'gate', trigger: 'an ok-requirement failed or was skipped', owner: 'dispatcher control', next: 'segment_skip(reason=dependency-failed, failed_dependency); no execution; dependents propagate', report: 'skipped list in index/report/seal', complete: 'no' },
  { id: 'target-skipped', priority: 'gate', trigger: 'the wrapped target was skipped', owner: 'dispatcher control', next: 'segment_skip(reason=target-skipped) for the wrapper; no before/after evidence is invented', report: 'skipped list', complete: 'no' },
  { id: 'observer-reclaimed', priority: 'security', trigger: 'PROBE fails or times out and OBS does not close within 900 s', owner: 'dispatcher', next: 'kill probe/OBS, record the OBS close as failed(security), stop before C04', report: 'terminal-seal degraded-prefix|aborted', complete: 'no' },
  { id: 'chain-broken', priority: 'security', trigger: 'segment digest/tail/prev mismatch at C19 or C20-SEAL', owner: 'C20-SEAL refuses', next: 'none', report: 'no terminal seal; operator records chain-broken', complete: 'no' },
  { id: 'c18-skipped-unbound', priority: 'gate', trigger: 'C18-BIND-E01 records disabled-unbound', owner: 'C18-BIND segment', next: 'C18 trio recorded as segment_skip(reason=c18-unbound); C19 consumes the chain record', report: 'report exit-not-met', complete: 'no' },
  { id: 'seal-failed', priority: 'security', trigger: 'C20-SEAL write or verification fails', owner: 'console + launch record', next: 'none; no retry', report: 'seal-failed', complete: 'no' },
  { id: 'complete', priority: 'none', trigger: 'no failed/skipped executions, C18 bound and archived, terminal seal sealed-full', owner: 'C20-SEAL', next: 'independent review', report: 'complete', complete: 'yes (pending user)' },
];

// ---------------------------------------------------------------- fixture helpers
const H = (c) => c.repeat(64);
const T0 = '2026-11-11T00:00:00.000Z';
const ts = (n) => '2026-11-11T00:00:' + String(n).padStart(2, '0') + '.000Z';
const hex32 = (s) => sha256utf8(s).slice(0, 32);

function evId(exec, role, n) { return hex32(exec + '|' + role + '|' + n); }
const partId = (role, pid) => 'events-' + role + '-' + pid + '-0a1b2c3d';
const entryPath = (id) => {
  const e = S.EXEC(id);
  if (e.entry === 'staged-dispatcher') return L.stg('dispatch');
  if (e.entry === 'inline' || e.entry === 'codex-inline') return 'inline';
  return L.src('dispatch');
};

function makePart(execId, role, specs, pid) {
  const list = [];
  let prev = null;
  const p = partId(role, pid);
  const intents = [];
  specs.forEach((sp, i) => {
    const seq = i + 1;
    const base = {
      schema: AUDIT.schema_event, event_id: evId(execId, role, seq), exec_id: execId, part_id: p,
      seq, prev_event_sha256: prev, kind: sp.kind, wall_time_utc: ts(seq), actor: 'WENX\\Administrator', role,
    };
    const e = Object.assign(base, sp.fields);
    if (e.kind === 'write_intent') { e.intent_id = e.event_id; intents.push(e.event_id); }
    if (e.kind === 'write_result' && sp.fields && sp.fields.intent_index) {
      e.intent_ref = intents[sp.fields.intent_index - 1];
      delete e.intent_index;
    }
    for (const k of Object.keys(e)) if (e[k] === undefined) throw new Error('undefined fixture field ' + execId + ' ' + k);
    list.push(e);
    prev = sha256utf8(canon(e));
  });
  return list;
}

const ruleRef = (exec, layer, i) => exec + '.' + layer + '[' + i + ']';

function eventsForC19() {
  const exec = 'C19-E01';
  const idx = 2; // business_writes: dirsFor(2) then index.json
  const intent = evId(exec, 'tool', 1);
  const specs = [
    { kind: 'write_intent', fields: {
      intent_id: intent, op: 'create', path: P.OUT + '\\C19\\C19-E01\\index.json', path_kind: 'file', src_path: null,
      rule_ref: ruleRef(exec, 'business_writes', idx), decision: 'allow', before: null } },
    { kind: 'write_result', fields: {
      intent_ref: intent, outcome: 'ok', error_code: null,
      after: { exists: true, bytes: 1536, sha256: H('a'), mtime_utc: ts(2), sddl: null }, bytes_written: 1536, durable: true } },
    { kind: 'read_batch', fields: {
      mode: 'content',
      entries: [{ path: P.M0, path_kind: 'file', rule_ref: ruleRef(exec, 'business_reads', 0), result: 'ok', bytes: 2048, sha256: H('b'), error_code: null }],
      counts: { ok: 1, denied: 0, absent: 0, unlisted: 0 } } },
  ];
  return makePart(exec, 'tool', specs, 7001);
}

function eventsForProduct(policies) {
  const exec = 'C10-P-E01';
  const pol = policies && policies[exec] ? policies[exec] : {};
  const specs = [
    { kind: 'preload', fields: {
      guard_pid: 7100, parent_pid: 7000, process_role: 'product', guard_sha256: H('c'), argv_sha256: H('d'),
      policy_sha256: pol.product || H('e'), inherited_env_keys: ['P0_GUARD_POLICY', 'P0_GUARD_TOKEN'] } },
    { kind: 'write_intent', fields: {
      intent_id: evId(exec, 'product', 2), op: 'create', path: P.OUT + '\\C10\\C10-P-E01\\vitest.json', path_kind: 'file', src_path: null,
      rule_ref: ruleRef(exec, 'product_writes', 0), decision: 'allow', before: null } },
    { kind: 'write_result', fields: {
      intent_index: 1, outcome: 'ok', error_code: null,
      after: { exists: true, bytes: 512, sha256: H('f'), mtime_utc: ts(3), sddl: null }, bytes_written: 512, durable: true } },
    { kind: 'read_batch', fields: {
      mode: 'content',
      entries: [{ path: P.CP + '\\package.json', path_kind: 'file', rule_ref: ruleRef(exec, 'product_reads', 0), result: 'ok', bytes: 900, sha256: H('1'), error_code: null }],
      counts: { ok: 1, denied: 0, absent: 0, unlisted: 0 } } },
  ];
  return makePart(exec, 'product', specs, 7100);
}

function eventsForObserver() {
  const exec = 'C03-OBS-E01';
  const specs = [
    { kind: 'observe_start', fields: { observed_account: 'WENX\\CodexSandboxOffline', observed_sid: 'S-1-5-21-1-2-3-1001', nonce: H('2'), deadline_seconds: 900 } },
    { kind: 'observe_relay', fields: { line_sha256: H('3'), line_bytes: 220, verdict: 'ok', reason: null,
      reported_account: 'WENX\\CodexSandboxOffline', reported_sid: 'S-1-5-21-1-2-3-1001', reported_write_result: 'denied', nonce_match: true } },
    { kind: 'observe_end', fields: { relay_seen: true, verdict: 'pass', exit_code: 0 } },
  ];
  return makePart(exec, 'observer', specs, 7002);
}

function closeParts(events) {
  const lines = events.map((e) => canon(e) + '\n');
  const bytes = lines.reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);
  const sha = sha256hex(Buffer.from(lines.join(''), 'utf8'));
  return { part: { name: events[0].part_id + '.jsonl', bytes, sha256: sha, events: events.length, first_seq: 1, last_seq: events.length }, bytes, sha };
}

// chain record builder with automatic seq/prev/bytes
function chainBuilder(startSeq, prevSha, prevBytes) {
  const recs = [];
  let seq = startSeq, sha = prevSha, bytes = prevBytes;
  const push = (obj) => {
    const r = Object.assign({ schema: AUDIT.schema_chain, chain_seq: seq, prev_record_sha256: sha, prev_file_bytes: bytes }, obj);
    recs.push(r);
    const line = canon(r) + '\n';
    sha = sha256utf8(canon(r));
    bytes += Buffer.byteLength(line, 'utf8');
    seq += 1;
    return r;
  };
  return { recs, push, state: () => ({ seq, sha, bytes }) };
}

const REG_PLACEHOLDER = 'c'.repeat(64);

function chainC01() {
  const b = chainBuilder(1, null, 0);
  b.push({ record: 'genesis', run_id: P.RUN_ID, created_utc: T0, registry_sha256: REG_PLACEHOLDER,
    manifest_sha256: H('d'), verifier_result: 'pass',
    bootstrap: [{ op: 'mkdir', path: P.RUN_PARENT, result: 'ok' }, { op: 'mkdir', path: P.RUN, result: 'ok' }],
    writer: 'WENX\\Administrator', writer_tool_sha256: H('e') });
  const toolEvents = makePart('C01-E01', 'tool', [
    { kind: 'write_intent', fields: { intent_id: evId('C01-E01', 'tool', 1), op: 'create', path: P.READ_SENTINEL, path_kind: 'file', src_path: null,
      rule_ref: ruleRef('C01-E01', 'business_writes', 14), decision: 'allow', before: null } },
    { kind: 'write_result', fields: { intent_index: 1, outcome: 'ok', error_code: null,
      after: { exists: true, bytes: 16, sha256: sha256utf8('P47-READ-SENTINEL'), mtime_utc: ts(2), sddl: null }, bytes_written: 16, durable: true } },
    { kind: 'write_intent', fields: { intent_id: evId('C01-E01', 'tool', 2), op: 'create', path: P.WRITE_SENTINEL, path_kind: 'file', src_path: null,
      rule_ref: ruleRef('C01-E01', 'business_writes', 15), decision: 'allow', before: null } },
    { kind: 'write_result', fields: { intent_index: 2, outcome: 'ok', error_code: null,
      after: { exists: true, bytes: 24, sha256: sha256utf8('P47-WRITE-ACCESS-SENTINEL'), mtime_utc: ts(3), sddl: null }, bytes_written: 24, durable: true } },
    { kind: 'write_intent', fields: { intent_id: evId('C01-E01', 'tool', 3), op: 'create', path: P.OUT + '\\C01\\C01-E01\\init.json', path_kind: 'file', src_path: null,
      rule_ref: ruleRef('C01-E01', 'business_writes', 18), decision: 'allow', before: null } },
    { kind: 'write_result', fields: { intent_index: 3, outcome: 'ok', error_code: null,
      after: { exists: true, bytes: 300, sha256: H('4'), mtime_utc: ts(4), sddl: null }, bytes_written: 300, durable: true } },
    { kind: 'read_batch', fields: { mode: 'content',
      entries: [{ path: P.MANIFEST, path_kind: 'file', rule_ref: ruleRef('C01-E01', 'business_reads', 0), result: 'ok', bytes: 4096, sha256: H('5'), error_code: null }],
      counts: { ok: 1, denied: 0, absent: 0, unlisted: 0 } } },
  ], 7003);
  const cp = closeParts(toolEvents);
  const dispatchEvents = makePart('C01-E01', 'dispatcher', [
    { kind: 'exec_begin', fields: { argv_sha256: S.EXEC('C01-E01').argv_sha256, cwd: P.HOME, entry_path: entryPath('C01-E01'), entry_sha256: H('6'), pid: 7000, ppid: 6900 } },
    { kind: 'exec_end', fields: { exit_code: 0, started_utc: T0, ended_utc: ts(5), child_exit_codes: [{ pid: 7003, code: 0 }] } },
  ], 7000);
  const dp = closeParts(dispatchEvents);
  const parts = [dp.part, cp.part];
  const outputs = [
    { path: P.READ_SENTINEL, bytes: 16, sha256: sha256utf8('P47-READ-SENTINEL'), kind: 'file' },
    { path: P.WRITE_SENTINEL, bytes: 24, sha256: sha256utf8('P47-WRITE-ACCESS-SENTINEL'), kind: 'file' },
    { path: P.OUT + '\\C01\\C01-E01\\init.json', bytes: 300, sha256: H('4'), kind: 'file' },
  ];
  const summary = { schema: AUDIT.schema_summary, run_id: P.RUN_ID, exec_id: 'C01-E01', command_id: 'C01', result: 'ok', exit_code: 0,
    failure_class: null, security_trigger: null, parts, counts: { events: 9, write_intent: 3, write_result: 3, read_entries: 1, denied: 0, preload: 0 },
    unpaired_intents: 0, outputs, child_exit_codes: [{ pid: 7003, code: 0 }], sealed_utc: ts(6) };
  const summaryBytes = Buffer.byteLength(canon(summary), 'utf8');
  b.push({ record: 'segment_open', exec_id: 'C01-E01', command_id: 'C01', args_sha256: S.EXEC('C01-E01').argv_sha256,
    cwd: P.HOME, entry_path: entryPath('C01-E01'), entry_sha256: H('6'), planned_predecessor: null,
    c18_state: null, c18_binding_sha256: null, c18_destination: null, segment_dir: S.audDir('C01', 'C01-E01') });
  b.push({ record: 'segment_close', exec_id: 'C01-E01', command_id: 'C01', result: 'ok', exit_code: 0,
    failure_class: null, security_trigger: null, parts, events_total: 9, unpaired_intents: 0,
    segment_digest: sha256utf8(canon(parts)),
    summary_path: S.audDir('C01', 'C01-E01') + '\\summary.json', summary_sha256: sha256utf8(canon(summary)), summary_bytes: summaryBytes,
    outputs, child_exit_codes: [{ pid: 7003, code: 0 }] });
  return { recs: b.recs, summary, parts, partBytes: cp.bytes, partSha: cp.sha, tail: b.state(), events: [...dispatchEvents, ...toolEvents] };
}

function syntheticClose(b, exec, opts) {
  const e = S.EXEC(exec);
  b.push({ record: 'segment_open', exec_id: exec, command_id: e.cmd, args_sha256: e.argv_sha256, cwd: e.cwd,
    entry_path: entryPath(exec), entry_sha256: H('7'), planned_predecessor: e.plan_predecessor,
    c18_state: exec === 'C18-BIND-E01' ? (opts.c18 || 'bound') : null,
    c18_binding_sha256: exec === 'C18-BIND-E01' ? H('8') : null,
    c18_destination: exec === 'C18-BIND-E01' && opts.c18 !== 'disabled-unbound' ? 'E:\\P47-ARCHIVE-02' : null,
    segment_dir: S.audDir(e.cmd, exec) });
  b.push({ record: 'segment_close', exec_id: exec, command_id: e.cmd, result: opts.result || 'ok', exit_code: opts.exit || 0,
    failure_class: opts.failure_class || null, security_trigger: opts.trigger || null, parts: [], events_total: 0, unpaired_intents: 0,
    segment_digest: sha256utf8(canon([])),
    summary_path: S.audDir(e.cmd, exec) + '\\summary.json', summary_sha256: H('9'), summary_bytes: 100,
    outputs: [], child_exit_codes: [] });
}

function chainGate() {
  const b = chainBuilder(41, H('a'), 8000);
  syntheticClose(b, 'C14-E01', { result: 'failed', exit: 7, failure_class: 'gate' });
  syntheticClose(b, 'C07-A-C14-E01', { result: 'ok' });
  b.push({ record: 'segment_skip', exec_id: 'C07-B-C15-E01', command_id: 'C07', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
  b.push({ record: 'segment_skip', exec_id: 'C15-E01', command_id: 'C15', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
  b.push({ record: 'segment_skip', exec_id: 'C07-A-C15-E01', command_id: 'C07', reason: 'target-skipped', failed_dependency: 'C15-E01', skipped_utc: T0 });
  syntheticClose(b, 'C07-B-C16-E01', { result: 'ok' });
  return b.recs;
}

function chainSecurity() {
  const b = chainBuilder(61, H('b'), 12000);
  syntheticClose(b, 'C12-E01', { result: 'failed', exit: 9, failure_class: 'security', trigger: 'SEC-UNLISTED-WRITE-SUCCEEDED' });
  syntheticClose(b, 'C07-A-C12-E01', { result: 'ok' });
  b.push({ record: 'segment_skip', exec_id: 'C07-B-C13-E01', command_id: 'C07', reason: 'run-stopped', failed_dependency: 'C12-E01', skipped_utc: T0 });
  b.push({ record: 'segment_skip', exec_id: 'C13-E01', command_id: 'C13', reason: 'run-stopped', failed_dependency: 'C12-E01', skipped_utc: T0 });
  return b.recs;
}

function chainOrphan() {
  const b = chainBuilder(81, H('c'), 15000);
  const e = S.EXEC('C10-N-E01');
  b.push({ record: 'segment_open', exec_id: 'C10-N-E01', command_id: 'C10', args_sha256: e.argv_sha256, cwd: e.cwd,
    entry_path: entryPath('C10-N-E01'), entry_sha256: H('7'), planned_predecessor: e.plan_predecessor,
    c18_state: null, c18_binding_sha256: null, c18_destination: null, segment_dir: S.audDir('C10', 'C10-N-E01') });
  b.push({ record: 'segment_skip', exec_id: 'C11-E01', command_id: 'C11', reason: 'run-stopped', failed_dependency: 'C10-N-E01', skipped_utc: T0 });
  return b.recs;
}

function sealFixture(mode, recs, over) {
  const last = recs[recs.length - 1];
  const base = {
    schema: AUDIT.schema_seal, run_id: P.RUN_ID, mode,
    chain: { records: recs.length, last_seq: last.chain_seq, last_record_sha256: sha256utf8(canon(last)), tail_kind: last.record, verified: true },
    staged_state: mode === 'sealed-full' ? 'complete' : 'complete',
    run_state: mode === 'sealed-full' ? 'completed' : 'aborted',
    abort: mode === 'sealed-full' ? null : { exec_id: 'C12-E01', failure_class: 'security', security_trigger: 'SEC-UNLISTED-WRITE-SUCCEEDED' },
    open_segments: [], skipped: [], not_started: [], gate_failed: mode === 'sealed-full' ? [] : ['C12-E01'],
    segment_counts: { opened: 1, closed: 1, skipped: 0, orphaned: 0 },
    index: { present: true, path: P.EVIDENCE + '\\index.json', sha256: H('a') },
    report: { present: true, path: P.REVIEW + '\\PHASE4.7-PHASE0-REPORT-V9.md', sha256: H('b') },
    c18_state: 'bound', staged_recheck: { performed: true, result: 'pass' },
    exit_status: mode === 'sealed-full' ? 'complete' : 'exit-not-met',
    security_findings: mode === 'sealed-full' ? [] : ['SEC-UNLISTED-WRITE-SUCCEEDED'], sealed_utc: T0,
  };
  return Object.assign(base, over || {});
}

// ---------------------------------------------------------------- vectors
function buildVectors(policies) {
  const valid = [];
  const add = (name, value) => { const c = canon(value); valid.push({ name, canonical: c, sha256: sha256utf8(c), bytes: Buffer.byteLength(c, 'utf8') }); };
  add('empty_object', {});
  add('nested', { a: 1, b: [true, null, 'x'], z: { k: 'v' } });
  add('key_order', { b: 2, a: 1, c: 3 });
  add('string_escapes', { s: 'a"b\\c\u0000\u0008\u0009\u000a\u000c\u000d\u001f' });
  add('astral_char', { s: '\u{1F600}' });
  add('integer_limits', { v: [0, -1, 9007199254740991, -9007199254740991] });
  add('negative_zero', { v: -0 });
  add('bools_and_null', [false, true, null]);

  const c19 = eventsForC19();
  const prod = eventsForProduct(policies);
  const obs = eventsForObserver();
  const c01 = chainC01();
  const gate = chainGate();
  const sec = chainSecurity();
  const orphan = chainOrphan();
  const seals = [
    sealFixture('sealed-full', c01.tail ? [{ chain_seq: c01.tail.seq - 1 }] : []),
    sealFixture('aborted', sec),
    sealFixture('degraded-prefix', sec.slice(0, 2), { staged_state: 'incomplete', run_state: 'aborted', abort: { exec_id: 'C05-FINAL-E01', failure_class: 'fatal', security_trigger: null } }),
    sealFixture('aborted', orphan, { open_segments: [{ exec_id: 'C10-N-E01', parts_state: 'frozen', summary_state: 'missing', close_state: 'missing', evidence_status: 'unverified' }], segment_counts: { opened: 2, closed: 1, skipped: 1, orphaned: 1 } }),
  ];
  // the sealed-full fixture must point at the real C01 tail
  seals[0] = sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]]);
  seals.push(sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]], {
    skipped: ['C10-N-E01'], gate_failed: ['C10-P-E01'], exit_status: 'exit-not-met',
  }));

  const vecOf = (name, obj) => { const c = canon(obj); return { name, canonical: c, sha256: sha256utf8(c), bytes: Buffer.byteLength(c, 'utf8') }; };

  // negative fixtures: one valid base, exactly one semantic mutation.
  // relink() recomputes seq/prev so only the documented fault remains.
  const base = c19[0], res = c19[1], rb = c19[2];
  const negs = [];
  const pushNeg = (name, value, expect) => negs.push({ name, canonical: canon(value), expect });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const relink = (list) => {
    let prev = null;
    return list.map((e, i) => {
      const x = Object.assign({}, e, { seq: i + 1, prev_event_sha256: prev });
      prev = sha256utf8(canon(x));
      return x;
    });
  };
  const single = (e) => relink([e]);

  const roleBad = clone(base); roleBad.role = 'admin'; roleBad.part_id = partId('admin', 7001);
  pushNeg('event_role_not_in_enum', single(roleBad), 'schema.role');
  const rolePerm = clone(base); rolePerm.role = 'product'; rolePerm.part_id = partId('product', 7001);
  pushNeg('event_role_not_allowed_for_exec', single(rolePerm), 'perm.role');
  const readDeny = clone(rb); readDeny.entries[0].path = P.ORIGINAL + '\\package.json';
  pushNeg('read_ok_inside_deny_root', single(readDeny), 'perm.deny_read');
  const readRef = clone(rb); readRef.entries[0].rule_ref = 'C19-E01.business_reads[99]';
  pushNeg('read_rule_ref_unresolved', single(readRef), 'perm.rule_ref');
  const writeScope = clone(base); writeScope.path = P.ORIGINAL + '\\x.js';
  writeScope.path = P.OUT + '\\C19\\C19-E01\\other.json';
  pushNeg('write_not_covered_by_rule', relink([writeScope, clone(res)]), 'perm.write_scope');
  pushNeg('result_before_intent', relink([clone(res), clone(base)]), 'schema.intent_order');
  const dup2 = clone(res); dup2.event_id = evId('C19-E01', 'tool', 99);
  pushNeg('duplicate_result_for_intent', relink([clone(base), clone(res), dup2]), 'schema.intent_unique');
  pushNeg('ok_result_not_durable', relink([clone(base), Object.assign(clone(res), { durable: false })]), 'schema.durable');
  pushNeg('ok_result_bytes_mismatch', relink([clone(base), Object.assign(clone(res), { bytes_written: 1 })]), 'schema.bytes');
  pushNeg('ok_result_with_error_code', relink([clone(base), Object.assign(clone(res), { error_code: 'P47-ERR' })]), 'schema.error_code');
  pushNeg('read_counts_mismatch', relink([clone(base), clone(res), Object.assign(clone(rb), { counts: { ok: 2, denied: 0, absent: 0, unlisted: 0 } })]), 'schema.counts');
  pushNeg('event_exec_not_registered', single(Object.assign(clone(base), { exec_id: 'C99-E01' })), 'schema.exec_registered');
  pushNeg('duplicate_event_id', relink([clone(base), Object.assign(clone(res), { event_id: clone(base).event_id })]), 'schema.unique');
  pushNeg('event_seq_gap', [clone(base), Object.assign(clone(res), { seq: 5 })], 'schema.seq');
  pushNeg('event_prev_hash_mismatch', [clone(base), Object.assign(clone(res), { prev_event_sha256: H('0') })], 'schema.prev');
  pushNeg('event_actor_not_admin', relink([Object.assign(clone(base), { actor: 'WENX\\CodexSandboxOffline' }), clone(res)]), 'schema.actor');
  pushNeg('event_extra_field', relink([Object.assign(clone(base), { extra: 1 }), clone(res)]), 'schema.closed');
  pushNeg('intent_has_outcome', relink([Object.assign(clone(base), { outcome: 'ok' }), clone(res)]), 'schema.forbidden');
  const truncLine = canon(base) + '\n' + canon(res);
  pushNeg('jsonl_truncated_without_lf', { hex: Buffer.from(truncLine, 'utf8').toString('hex') }, 'bytes.truncated');

  const chainOpen = c01.recs[1], chainClose = c01.recs[2];
  pushNeg('chain_seq_gap', [clone(chainOpen), Object.assign(clone(chainClose), { chain_seq: 9 })], 'chain.seq');
  pushNeg('chain_prev_mismatch', [clone(chainOpen), Object.assign(clone(chainClose), { prev_record_sha256: H('1') })], 'chain.prev');
  pushNeg('chain_prev_bytes_missing_lf', [clone(chainOpen), Object.assign(clone(chainClose), { prev_file_bytes: chainClose.prev_file_bytes - 1 })], 'chain.bytes');
  pushNeg('chain_exec_not_registered', [Object.assign(clone(chainOpen), { exec_id: 'C99-E01' })], 'chain.exec_registered');
  pushNeg('chain_close_without_open', [clone(chainClose)], 'chain.pair');
  pushNeg('chain_failed_without_class', [clone(chainOpen), Object.assign(clone(chainClose), { result: 'failed', failure_class: null })], 'chain.failure_class');
  pushNeg('chain_security_without_trigger', [clone(chainOpen), Object.assign(clone(chainClose), { result: 'failed', failure_class: 'security', security_trigger: null })], 'chain.trigger');
  const skipBadReason = { schema: AUDIT.schema_chain, record: 'segment_skip', chain_seq: 3, prev_record_sha256: H('2'), prev_file_bytes: 100,
    exec_id: 'C15-E01', command_id: 'C15', reason: 'because', failed_dependency: 'C14-E01', skipped_utc: T0 };
  pushNeg('chain_skip_reason_unknown', [skipBadReason], 'chain.reason');
  // fresh short chains; seq/prev/bytes are relinked from 1 so only the named fault remains
  const gateC = (() => {
    const b = chainBuilder(1, null, 0);
    syntheticClose(b, 'C14-E01', { result: 'failed', exit: 7, failure_class: 'gate' });
    syntheticClose(b, 'C07-A-C14-E01', { result: 'ok' });
    b.push({ record: 'segment_skip', exec_id: 'C07-B-C15-E01', command_id: 'C07', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
    b.push({ record: 'segment_skip', exec_id: 'C15-E01', command_id: 'C15', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
    b.push({ record: 'segment_skip', exec_id: 'C07-A-C15-E01', command_id: 'C07', reason: 'target-skipped', failed_dependency: 'C15-E01', skipped_utc: T0 });
    return b.recs;
  })();
  const gateNoCause = (() => {
    const b = chainBuilder(1, null, 0);
    syntheticClose(b, 'C14-E01', { result: 'ok' });
    b.push({ record: 'segment_skip', exec_id: 'C07-B-C15-E01', command_id: 'C07', reason: 'dependency-failed', failed_dependency: 'C10-P-E01', skipped_utc: T0 });
    return b.recs;
  })();
  const gateNoAfter = (() => {
    const b = chainBuilder(1, null, 0);
    syntheticClose(b, 'C14-E01', { result: 'failed', exit: 7, failure_class: 'gate' });
    b.push({ record: 'segment_skip', exec_id: 'C07-B-C15-E01', command_id: 'C07', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
    return b.recs;
  })();
  const secHalt = (() => {
    const b = chainBuilder(1, null, 0);
    syntheticClose(b, 'C12-E01', { result: 'failed', exit: 9, failure_class: 'security', trigger: 'SEC-UNLISTED-WRITE-SUCCEEDED' });
    syntheticClose(b, 'C07-A-C12-E01', { result: 'ok' });
    syntheticClose(b, 'C13-E01', { result: 'ok' });
    return b.recs;
  })();
  pushNeg('chain_skip_without_failed_cause', gateNoCause, 'chain.skip_cause');
  pushNeg('flow_failed_target_without_after', gateNoAfter, 'flow.missing_after');
  pushNeg('flow_business_after_security_halt', secHalt, 'flow.after_halt');
  pushNeg('seal_full_with_incomplete_staging', [sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]], { staged_state: 'incomplete', exit_status: 'exit-not-met' })], 'seal.mode');
  pushNeg('seal_overlapping_partitions', [sealFixture('aborted', sec, { skipped: ['C13-E01'], not_started: ['C13-E01'] })], 'seal.partition');
  pushNeg('summary_self_hash', [Object.assign({}, c01.summary, { summary_sha256: H('a') })], 'schema.forbidden');
  pushNeg('chain_planned_predecessor_mismatch', [Object.assign(clone(chainOpen), { planned_predecessor: 'C00-E01' })], 'chain.predecessor');
  pushNeg('chain_part_digest_mismatch', [clone(chainOpen), Object.assign(clone(chainClose), { segment_digest: H('9') })], 'chain.parts');

  const badPolicy = clone(prod[0]); badPolicy.policy_sha256 = H('0');
  pushNeg('preload_policy_mismatch', relink([badPolicy, clone(prod[1]), clone(prod[2]), clone(prod[3])]), 'perm.preload_policy');
  pushNeg('write_op_not_allowed_by_rule', relink([Object.assign(clone(base), { op: 'delete' }), clone(res)]), 'perm.op');
  pushNeg('intent_without_result', [clone(base)], 'schema.intent_unpaired');
  const badLayer = clone(prod[1]); badLayer.rule_ref = 'C10-P-E01.business_writes[2]';
  pushNeg('product_cites_business_rule', relink([badLayer, clone(prod[2]), clone(prod[3])]), 'perm.rule_layer');
  const abortedChain = (() => {
    const b = chainBuilder(1, null, 0);
    syntheticClose(b, 'C14-E01', { result: 'aborted', failure_class: 'fatal' });
    b.push({ record: 'segment_skip', exec_id: 'C07-B-C15-E01', command_id: 'C07', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
    return b.recs;
  })();
  pushNeg('aborted_target_without_after', abortedChain, 'flow.missing_after');
  pushNeg('seal_full_complete_with_skipped', [sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]], {
    skipped: ['C10-N-E01'], gate_failed: ['C10-P-E01'], exit_status: 'complete',
  })], 'seal.mode');

  return {
    schema: AUDIT.schema_vectors, canon: AUDIT.canon, hash: AUDIT.hash,
    line_rule: 'physical record bytes = UTF-8 of canonical JSON + one LF',
    valid,
    invalid_kinds: ['float', 'unsafe_integer', 'uppercase_key', 'non_ascii_key', 'dash_key',
      'lone_high_surrogate', 'lone_low_surrogate', 'undefined_value', 'nan', 'infinity', 'function_value', 'bigint_value'],
    parts: [vecOf('C01_dispatcher_part', c01.events.slice(0, 2)), vecOf('C01_tool_part', c01.events.slice(2)),
      vecOf('C19_tool_part', c19), vecOf('C10P_product_part', prod), vecOf('C03_observer_part', obs)],
    events: [...c01.events, ...c19, ...prod, ...obs].map((e) => vecOf('event_' + e.kind + '_' + e.part_id, e)),
    jsonl: { c19: closeParts(c19), c10p: closeParts(prod), c03: closeParts(obs) },
    chains: {
      c01_genesis: c01.recs.map((r) => vecOf(r.record, r)),
      gate_excerpt: gate.map((r) => vecOf(r.record + '_' + r.chain_seq, r)),
      security_excerpt: sec.map((r) => vecOf(r.record + '_' + r.chain_seq, r)),
      orphan_excerpt: orphan.map((r) => vecOf(r.record + '_' + r.chain_seq, r)),
    },
    chain_physical: {
      c01_tail_seq: c01.tail.seq - 1, c01_tail_sha256: c01.tail.sha, c01_tail_bytes: c01.tail.bytes,
    },
    summaries: [vecOf('C01_summary', c01.summary)],
    seals: seals.map((s, i) => vecOf('seal_' + i, s)),
    negative: negs,
  };
}

module.exports = { AUDIT, EVENT_FIELDS, CHAIN_FIELDS, SUMMARY_FIELDS, SEAL_FIELDS, FAILURE_STATES, buildVectors, eventsForC19, eventsForProduct, eventsForObserver };
