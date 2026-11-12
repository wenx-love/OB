'use strict';
// Audit contract + deterministic vectors for Phase 0 V7 (independent checker is p0v7-check.cjs).
const L = require('./p0v7-lib.cjs');
const S = require('./p0v7-spec.cjs');
const { canon, sha256utf8, sha256hex, P } = L;

const C19 = S.EXECS.find((e) => e.id === 'C19-E01');
const C19_ENTRY = C19.entry === 'staged-dispatcher' ? L.stg('dispatch') : L.src('dispatch');
const C19_ARGS = C19.argv_sha256;

const AUDIT = {
  schema_event: 'p47-audit-event-v2',
  schema_chain: 'p47-chain-record-v3',
  schema_summary: 'p47-segment-summary-v2',
  schema_seal: 'p47-terminal-seal-v2',
  schema_vectors: 'p47-audit-vectors-v3',
  canon: 'p47-canon-json-v1',
  hash: 'sha256',
  event_types: ['exec_begin', 'exec_end', 'write_intent', 'write_result', 'read_batch', 'preload',
    'observe_start', 'observe_relay', 'observe_end'],
  chain_records: ['genesis', 'segment_open', 'segment_close', 'segment_skip'],
  part_naming: 'events-<role>-<pid>-<rand8>.jsonl',
  chain_writer: 'p0-audit.cjs control modes, spawned by p0-dispatch.ps1, account WENX\\Administrator',
  chain_readers: ['p0-dispatch.ps1 open/seal steps', 'p0-index.cjs (C19)', 'p0-report.cjs (C20-REPORT)', 'p0-audit.cjs terminal-seal (C20-SEAL)'],
  chain_forbidden: ['any business tool', 'any product process', 'Codex account', 'C03 probe'],
  line_bytes: 'each record = canonical JSON + one LF; prev_file_bytes includes every previous LF',
  order: ['business processes exit', 'parts frozen and verified', 'seal writes summary.json with CreateNew (no self hash, no chain reference)', 'close appends segment_close with part digests and the summary hash'],
};

const E = (name, presence, rule) => ({ name, presence, rule });
const COMMON_EVENT = [
  E('schema', 'required', "const 'p47-audit-event-v2'"),
  E('event_id', 'required', '32 lowercase hex [0-9a-f]; unique in the run'),
  E('exec_id', 'required', 'registered execution id'),
  E('part_id', 'required', 'matches the part file name'),
  E('seq', 'required', 'integer >= 1, contiguous inside the part'),
  E('prev_event_sha256', 'required', 'null only for seq=1; else sha256 of the previous canonical text'),
  E('kind', 'required', 'one of the nine event types'),
  E('wall_time_utc', 'required', 'ISO 8601 UTC with milliseconds and Z'),
  E('actor', 'required', 'account name'),
  E('role', 'required', 'dispatcher | tool | observer | product | control'),
];
const EVENT_FIELDS = {
  exec_begin: [...COMMON_EVENT, E('argv_sha256', 'required', 'canonical argv hash'), E('cwd', 'required', 'absolute'),
    E('entry_path', 'required', 'absolute'), E('entry_sha256', 'required', 'byte hash'), E('pid', 'required', 'integer'),
    E('ppid', 'required', 'integer'), E('outcome', 'forbidden', 'begin cannot claim an outcome')],
  exec_end: [...COMMON_EVENT, E('exit_code', 'required', 'integer'), E('started_utc', 'required', 'ISO 8601 UTC'),
    E('ended_utc', 'required', 'ISO 8601 UTC'), E('child_exit_codes', 'required', 'array of {pid, code}'),
    E('write_intent', 'forbidden', 'end is not a write')],
  write_intent: [...COMMON_EVENT, E('intent_id', 'required', 'exactly equal to event_id'),
    E('op', 'required', 'create | overwrite | append | mkdir | rename | copy | acl | delete'), E('path', 'required', 'canonical absolute path'),
    E('path_kind', 'required', 'file | dir | tree'), E('src_path', 'required', 'null unless rename/copy'),
    E('rule_ref', 'required', 'permission entry id'), E('decision', 'required', "const 'allow'"),
    E('before', 'required', 'null when absent; else {exists, bytes, sha256, mtime_utc, sddl}'),
    E('outcome', 'forbidden', 'not known before the action'), E('error_code', 'forbidden', 'not known before'),
    E('after', 'forbidden', 'not known before'), E('bytes_written', 'forbidden', 'not known before')],
  write_result: [...COMMON_EVENT, E('intent_ref', 'required', 'event_id of a write_intent in the same part, same exec, earlier seq'),
    E('outcome', 'required', 'ok | denied | error | skipped'), E('error_code', 'required', 'null only when ok'),
    E('after', 'required', 'null unless ok'), E('bytes_written', 'required', 'null unless ok and op writes bytes'),
    E('durable', 'required', 'true only after flush/fsync'), E('op', 'forbidden', 'reference only'), E('path', 'forbidden', 'reference only'),
    E('src_path', 'forbidden', 'reference only'), E('rule_ref', 'forbidden', 'reference only'), E('before', 'forbidden', 'reference only')],
  read_batch: [...COMMON_EVENT, E('mode', 'required', 'content | metadata'),
    E('entries', 'required', 'array of {path, path_kind, rule_ref, result, bytes, sha256, error_code}'),
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
  genesis: [E('schema', 'required', "const 'p47-chain-record-v3'"), E('record', 'required', "const 'genesis'"),
    E('chain_seq', 'required', 'integer 1'), E('prev_record_sha256', 'required', 'null'), E('prev_file_bytes', 'required', '0'),
    E('run_id', 'required', 'const'), E('created_utc', 'required', 'ISO 8601 UTC'), E('registry_sha256', 'required', 'registry hash'),
    E('manifest_sha256', 'required', 'manifest hash'), E('verifier_result', 'required', "const 'pass'"),
    E('bootstrap', 'required', 'enumerated [{op, path, result}]'), E('writer', 'required', 'WENX\\Administrator'),
    E('writer_tool_sha256', 'required', 'byte hash')],
  segment_open: [E('schema', 'required', "const 'p47-chain-record-v3'"), E('record', 'required', "const 'segment_open'"),
    E('chain_seq', 'required', 'previous + 1'), E('prev_record_sha256', 'required', 'previous record sha256'),
    E('prev_file_bytes', 'required', 'physical bytes before this record, LF included'), E('exec_id', 'required', 'registered exec'),
    E('command_id', 'required', 'C00-C20'), E('args_sha256', 'required', 'dispatcher argv hash'), E('cwd', 'required', 'absolute'),
    E('entry_path', 'required', 'absolute'), E('entry_sha256', 'required', 'byte hash'), E('planned_predecessor', 'required', 'exec id or null'),
    E('c18_state', 'required', 'null except C18-BIND-E01: bound | disabled-unbound'),
    E('c18_binding_sha256', 'required', 'null except C18-BIND-E01 when bound'), E('c18_destination', 'required', 'null except C18-BIND-E01 when bound'),
    E('segment_dir', 'required', 'absolute; must not exist')],
  segment_close: [E('schema', 'required', "const 'p47-chain-record-v3'"), E('record', 'required', "const 'segment_close'"),
    E('chain_seq', 'required', 'previous + 1'), E('prev_record_sha256', 'required', 'open record sha256'),
    E('prev_file_bytes', 'required', 'physical bytes before this record'), E('exec_id', 'required', 'matches open'),
    E('command_id', 'required', 'matches open'), E('result', 'required', 'ok | failed | aborted'), E('exit_code', 'required', 'integer'),
    E('parts', 'required', 'array of {name, bytes, sha256, events, first_seq, last_seq}'), E('events_total', 'required', 'integer'),
    E('unpaired_intents', 'required', 'integer; 0 for ok'), E('segment_digest', 'required', 'sha256 of the canonical parts array'),
    E('summary_path', 'required', 'absolute'), E('summary_sha256', 'required', 'null only when summary creation failed'),
    E('summary_bytes', 'required', 'null under the same condition'), E('outputs', 'required', 'array of {path, bytes, sha256, kind}'),
    E('child_exit_codes', 'required', 'array of {pid, code}')],
  segment_skip: [E('schema', 'required', "const 'p47-chain-record-v3'"), E('record', 'required', "const 'segment_skip'"),
    E('chain_seq', 'required', 'previous + 1'), E('prev_record_sha256', 'required', 'previous record sha256'),
    E('prev_file_bytes', 'required', 'physical bytes before this record'), E('exec_id', 'required', 'skipped exec'),
    E('command_id', 'required', 'C00-C20'), E('reason', 'required', "const 'dependency-failed'"),
    E('failed_dependency', 'required', 'exec id of the failed dependency'), E('skipped_utc', 'required', 'ISO 8601 UTC'),
    E('segment_dir', 'forbidden', 'a skipped execution has no segment directory'),
    E('summary_path', 'forbidden', 'a skipped execution has no summary')],
};

const SUMMARY_FIELDS = [
  E('schema', 'required', "const 'p47-segment-summary-v2'"), E('run_id', 'required', 'const'), E('exec_id', 'required', 'matches chain'),
  E('command_id', 'required', 'C00-C20'), E('result', 'required', 'ok | failed | aborted'), E('exit_code', 'required', 'integer'),
  E('parts', 'required', 'same array as segment_close'), E('counts', 'required', '{events, write_intent, write_result, read_entries, denied, preload}'),
  E('unpaired_intents', 'required', 'integer'), E('outputs', 'required', 'same array as segment_close'),
  E('child_exit_codes', 'required', 'array'), E('sealed_utc', 'required', 'ISO 8601 UTC'),
  E('summary_sha256', 'forbidden', 'no self hash'), E('prev_record_sha256', 'forbidden', 'no chain reference'),
];

const FAILURE_STATES = [
  { id: 'pre-run-failed', priority: 'fatal', trigger: 'C00 or C05-PRE fails; RUN not created', owner: 'operator launch record', next: 'none', report: 'launch-record exit-not-met', complete: 'no' },
  { id: 'bootstrap-failed', priority: 'fatal', trigger: 'C01 fails before or during genesis', owner: 'dispatcher console + launch record', next: 'none (no seal)', report: 'launch-record bootstrap-failed', complete: 'no' },
  { id: 'security-stop', priority: 'security', trigger: 'identity/permission/guard/audit/chain/staged violation', owner: 'dispatcher seal', next: 'one C07-A for the failed target if wrapped, then C20-SEAL degraded-prefix', report: 'terminal-seal degraded-prefix; never complete', complete: 'no' },
  { id: 'fatal-abort', priority: 'fatal', trigger: 'non-security infrastructure failure', owner: 'dispatcher seal', next: 'one C07-A if wrapped, then C20-SEAL aborted', report: 'terminal-seal aborted', complete: 'no' },
  { id: 'gate-failed', priority: 'gate', trigger: 'C10-C16/C18 non-zero without a security trigger', owner: 'dispatcher seal of that segment', next: 'C07-A for the target; dependents recorded as segment_skip; C19/C20-REPORT continue', report: 'report exit-not-met', complete: 'no' },
  { id: 'dependency-skipped', priority: 'gate', trigger: 'a dependency failed or was skipped', owner: 'dispatcher control', next: 'segment_skip record; no execution; dependents propagate', report: 'skipped list in index/report/seal', complete: 'no' },
  { id: 'observer-reclaimed', priority: 'security', trigger: 'PROBE fails or times out and OBS does not close within 900 s', owner: 'dispatcher', next: 'kill probe/OBS, record observer-reclaimed, stop before C04', report: 'terminal-seal degraded-prefix', complete: 'no' },
  { id: 'chain-broken', priority: 'security', trigger: 'segment digest/tail/prev mismatch at C19 or C20-SEAL', owner: 'C20-SEAL refuses', next: 'none', report: 'no terminal seal; operator records chain-broken', complete: 'no' },
  { id: 'c18-skipped-unbound', priority: 'gate', trigger: 'C18-BIND-E01 records disabled-unbound', owner: 'C18-BIND segment', next: 'C07-B-C19-E01 (unbound order)', report: 'report exit-not-met', complete: 'no' },
  { id: 'seal-failed', priority: 'security', trigger: 'C20-SEAL write or verification fails', owner: 'console + launch record', next: 'none; no retry', report: 'seal-failed', complete: 'no' },
  { id: 'seal-aborted', priority: 'fatal', trigger: 'C20-SEAL after an abort point', owner: 'C20-SEAL', next: 'none', report: 'terminal-seal aborted; exit-not-met', complete: 'no' },
  { id: 'complete', priority: 'none', trigger: 'all hard gates ok, C18 bound and verified, terminal seal sealed-full', owner: 'C20-SEAL', next: 'independent review', report: 'complete', complete: 'yes (pending user)' },
];

// ---------------------------------------------------------------- vectors
const eid = (n) => (String(n).padStart(2, '0') + '0123456789abcdef0123456789abcdef').slice(0, 32);
const EV = {
  schema: AUDIT.schema_event, exec_id: 'C19-E01', part_id: 'events-tool-7001-0a1b2c3d',
  wall_time_utc: '2026-11-11T00:00:01.000Z', actor: 'WENX\\Administrator', role: 'tool',
};
const ev = (kind, seq, prev, extra) => Object.assign({}, EV, { event_id: eid(seq), seq, prev_event_sha256: prev, kind }, extra);
const INDEX_SHA = 'a'.repeat(64);
const INDEX_BYTES = 1536;

function buildVectors() {
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

  const i1 = ev('write_intent', 1, null, {
    intent_id: eid(1), op: 'create',
    path: 'D:\\P47RUN\\P47-20261111-01\\out\\C19\\C19-E01\\index.json',
    path_kind: 'file', src_path: null, rule_ref: 'C19-E01.business_writes[2]', decision: 'allow', before: null,
  });
  const r1 = ev('write_result', 2, sha256utf8(canon(i1)), {
    intent_ref: i1.event_id, outcome: 'ok', error_code: null,
    after: { exists: true, bytes: INDEX_BYTES, sha256: INDEX_SHA, mtime_utc: '2026-11-11T00:00:02.000Z', sddl: null },
    bytes_written: INDEX_BYTES, durable: true,
  });
  const rb = ev('read_batch', 3, sha256utf8(canon(r1)), {
    mode: 'content',
    entries: [{ path: 'D:\\P47RUN\\P47-20261111-01\\baseline\\m0.json', path_kind: 'file', rule_ref: 'C19-E01.business_reads[0]', result: 'ok', bytes: 2048, sha256: 'b'.repeat(64), error_code: null }],
    counts: { ok: 1, denied: 0, absent: 0, unlisted: 0 },
  });
  const events = [i1, r1, rb];
  const lines = events.map((x) => canon(x) + '\n');
  const partBytes = lines.reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);
  const partSha = sha256hex(Buffer.from(lines.join(''), 'utf8'));
  const part = { name: EV.part_id + '.jsonl', bytes: partBytes, sha256: partSha, events: 3, first_seq: 1, last_seq: 3 };

  const genesis = {
    schema: AUDIT.schema_chain, record: 'genesis', chain_seq: 1, prev_record_sha256: null, prev_file_bytes: 0,
    run_id: P.RUN_ID, created_utc: '2026-11-11T00:00:00.000Z', registry_sha256: 'c'.repeat(64),
    manifest_sha256: 'd'.repeat(64), verifier_result: 'pass',
    bootstrap: [{ op: 'mkdir', path: 'D:\\P47RUN\\P47-20261111-01', result: 'ok' }],
    writer: 'WENX\\Administrator', writer_tool_sha256: 'e'.repeat(64),
  };
  const genesisLine = canon(genesis) + '\n';
  const genesisSha = sha256utf8(canon(genesis));
  const genesisBytes = Buffer.byteLength(genesisLine, 'utf8');

  const open = {
    schema: AUDIT.schema_chain, record: 'segment_open', chain_seq: 2, prev_record_sha256: genesisSha,
    prev_file_bytes: genesisBytes, exec_id: 'C19-E01', command_id: 'C19', args_sha256: C19_ARGS,
    cwd: 'D:\\P47RUN\\P47-20261111-01', entry_path: C19_ENTRY, entry_sha256: '1'.repeat(64),
    planned_predecessor: 'C07-B-C19-E01', c18_state: null, c18_binding_sha256: null, c18_destination: null,
    segment_dir: 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\C19\\C19-E01',
  };
  const openLine = canon(open) + '\n';
  const openSha = sha256utf8(canon(open));
  const openBytes = genesisBytes + Buffer.byteLength(openLine, 'utf8');

  const summary = {
    schema: AUDIT.schema_summary, run_id: P.RUN_ID, exec_id: 'C19-E01', command_id: 'C19', result: 'ok', exit_code: 0,
    parts: [part], counts: { events: 3, write_intent: 1, write_result: 1, read_entries: 1, denied: 0, preload: 0 },
    unpaired_intents: 0,
    outputs: [{ path: 'D:\\P47RUN\\P47-20261111-01\\out\\C19\\C19-E01\\index.json', bytes: INDEX_BYTES, sha256: INDEX_SHA, kind: 'file' }],
    child_exit_codes: [{ pid: 7001, code: 0 }], sealed_utc: '2026-11-11T00:00:05.000Z',
  };
  const summarySha = sha256utf8(canon(summary));
  const summaryBytes = Buffer.byteLength(canon(summary), 'utf8');

  const close = {
    schema: AUDIT.schema_chain, record: 'segment_close', chain_seq: 3, prev_record_sha256: openSha,
    prev_file_bytes: openBytes, exec_id: 'C19-E01', command_id: 'C19', result: 'ok', exit_code: 0,
    parts: [part], events_total: 3, unpaired_intents: 0, segment_digest: sha256utf8(canon([part])),
    summary_path: 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\C19\\C19-E01\\summary.json',
    summary_sha256: summarySha, summary_bytes: summaryBytes, outputs: summary.outputs, child_exit_codes: summary.child_exit_codes,
  };
  const closeLine = canon(close) + '\n';
  const closeBytes = openBytes + Buffer.byteLength(closeLine, 'utf8');

  const skip = {
    schema: AUDIT.schema_chain, record: 'segment_skip', chain_seq: 4, prev_record_sha256: sha256utf8(canon(close)),
    prev_file_bytes: closeBytes, exec_id: 'C10-N-E01', command_id: 'C10', reason: 'dependency-failed',
    failed_dependency: 'C10-P-E01', skipped_utc: '2026-11-11T00:00:06.000Z',
  };

  const vec = (name, obj) => { const c = canon(obj); return { name, canonical: c, sha256: sha256utf8(c), bytes: Buffer.byteLength(c, 'utf8') }; };

  // negative fixtures: one valid base, exactly one mutation each
  const base = {
    schema: AUDIT.schema_event, event_id: eid(1), exec_id: 'C19-E01', part_id: EV.part_id, seq: 1,
    prev_event_sha256: null, kind: 'write_intent', wall_time_utc: '2026-11-11T00:00:02.000Z',
    actor: 'WENX\\Administrator', role: 'tool', intent_id: eid(1), op: 'create',
    path: 'D:\\P47RUN\\P47-20261111-01\\out\\C19\\C19-E01\\index.json', path_kind: 'file', src_path: null,
    rule_ref: 'C19-E01.business_writes[2]', decision: 'allow', before: null,
  };
  const baseResult = {
    schema: AUDIT.schema_event, event_id: eid(2), exec_id: 'C19-E01', part_id: EV.part_id, seq: 2,
    prev_event_sha256: sha256utf8(canon(base)), kind: 'write_result', wall_time_utc: '2026-11-11T00:00:03.000Z',
    actor: 'WENX\\Administrator', role: 'tool', intent_ref: eid(1), outcome: 'ok', error_code: null,
    after: { exists: true, bytes: INDEX_BYTES, sha256: INDEX_SHA, mtime_utc: '2026-11-11T00:00:03.000Z', sddl: null },
    bytes_written: INDEX_BYTES, durable: true,
  };
  const openBase = Object.assign({}, open, { prev_file_bytes: genesisBytes, args_sha256: C19_ARGS });
  const neg = [];
  const pushNeg = (name, value, expect) => neg.push({ name, canonical: canon(value), expect });
  pushNeg('event_id_contains_letter_v', Object.assign({}, base, { event_id: 'ev000001abcdef0123456789abcdef01', intent_id: 'ev000001abcdef0123456789abcdef01' }), 'schema.event_id');
  pushNeg('event_id_31_hex', Object.assign({}, base, { event_id: '0123456789abcdef0123456789abcde', intent_id: '0123456789abcdef0123456789abcde' }), 'schema.event_id');
  const openMissing = Object.assign({}, openBase);
  delete openMissing.c18_binding_sha256;
  pushNeg('segment_open_missing_c18_binding', openMissing, 'schema.required');
  const resMissing = Object.assign({}, baseResult);
  delete resMissing.intent_ref;
  pushNeg('write_result_missing_intent_ref', [base, resMissing], 'schema.required');
  pushNeg('write_intent_has_outcome', Object.assign({}, base, { outcome: 'ok' }), 'schema.forbidden');
  pushNeg('intent_ref_cross_exec', [base, Object.assign({}, baseResult, { exec_id: 'C20-REPORT-E01' })], 'schema.intent_ref');
  pushNeg('duplicate_event_id', [base, Object.assign({}, base, { seq: 2, prev_event_sha256: sha256utf8(canon(base)) })], 'schema.unique');
  pushNeg('seq_gap', [base, Object.assign({}, baseResult, { seq: 5 })], 'schema.seq');
  pushNeg('prev_hash_mismatch', [base, Object.assign({}, baseResult, { prev_event_sha256: '0'.repeat(64) })], 'schema.prev');
  pushNeg('truncated_line_without_lf', { line: canon(base), bytes_including_lf: Buffer.byteLength(canon(base), 'utf8') }, 'bytes.lf');
  pushNeg('prev_file_bytes_missing_lf', { previous_line_bytes: genesisBytes, declared_prev_file_bytes: genesisBytes - 1 }, 'bytes.prev_file_bytes');
  pushNeg('summary_self_hash', Object.assign({}, summary, { summary_sha256: 'a'.repeat(64) }), 'schema.forbidden');

  return {
    schema: AUDIT.schema_vectors, canon: AUDIT.canon, hash: AUDIT.hash,
    line_rule: 'physical record bytes = UTF-8 of canonical JSON + one LF',
    valid,
    invalid_kinds: ['float', 'unsafe_integer', 'uppercase_key', 'non_ascii_key', 'dash_key',
      'lone_high_surrogate', 'lone_low_surrogate', 'undefined_value', 'nan', 'infinity', 'function_value', 'bigint_value'],
    events: events.map((e) => vec('event_' + e.kind, e)),
    jsonl: { part, first_event_id: i1.event_id, last_event_id: rb.event_id, bytes_including_lf: partBytes, sha256: partSha },
    chain: [vec('genesis', genesis), vec('segment_open', open), vec('segment_close', close), vec('segment_skip', skip)],
    chain_physical: {
      genesis_line_bytes: genesisBytes, open_prev_file_bytes: genesisBytes,
      close_prev_file_bytes: openBytes, close_line_bytes: Buffer.byteLength(closeLine, 'utf8'),
      skip_prev_file_bytes: closeBytes,
    },
    summary: [vec('segment_summary', summary)],
    negative: neg,
  };
}

const INVALID_VALUES = {
  float: 1.5, unsafe_integer: 9007199254740992, uppercase_key: { Key: 1 }, non_ascii_key: { 'é': 1 },
  dash_key: { 'a-b': 1 }, lone_high_surrogate: '\ud800', lone_low_surrogate: '\udc00',
  undefined_value: undefined, nan: NaN, infinity: Infinity, function_value: function () {}, bigint_value: 10n,
};

module.exports = { AUDIT, EVENT_FIELDS, CHAIN_FIELDS, SUMMARY_FIELDS, FAILURE_STATES, buildVectors, INVALID_VALUES, C19_ENTRY, C19_ARGS };
