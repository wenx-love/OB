'use strict';
// Audit contract + deterministic test vectors (single source for spec and vectors).
const L = require('./p0v5-lib.cjs');
const { canon, sha256utf8, P, ID } = L;

const AUDIT = {
  schema_event: 'p47-audit-event-v1',
  schema_chain: 'p47-chain-record-v1',
  schema_summary: 'p47-segment-summary-v1',
  schema_seal: 'p47-terminal-seal-v1',
  schema_vectors: 'p47-audit-vectors-v1',
  canon: 'p47-canon-json-v1',
  hash: 'sha256',
  event_types: ['exec_begin', 'exec_end', 'write_intent', 'write_result', 'read_batch', 'preload',
    'observe_start', 'observe_relay', 'observe_end'],
  chain_records: ['genesis', 'segment_open', 'segment_close'],
  part_naming: 'events-<role>-<pid>-<rand8>.jsonl',
  chain_writer: 'p0-audit.cjs control modes, spawned by p0-dispatch.ps1, account WENX\\Administrator',
  chain_readers: ['p0-dispatch.ps1 open/seal steps', 'p0-index.cjs (C19)', 'p0-report.cjs (C20-REPORT)', 'p0-audit.cjs terminal-seal (C20-SEAL)'],
  chain_forbidden: ['any business tool', 'any product process', 'Codex account', 'C03 probe'],
  order: [
    'business processes exit',
    'parts frozen; each part hash-chained and byte-counted',
    'p0-audit.cjs seal writes summary.json with CreateNew (no self hash, no chain reference)',
    'p0-audit.cjs close appends segment_close with the part digests and the summary hash',
  ],
};

// --------------------------------------------------------------- field rules
const E = (name, presence, rule) => ({ name, presence, rule });

const COMMON_EVENT = [
  E('schema', 'required', "const 'p47-audit-event-v1'"),
  E('event_id', 'required', '32 lowercase hex; unique in the run'),
  E('exec_id', 'required', 'registered execution id'),
  E('part_id', 'required', 'matches the part file name'),
  E('seq', 'required', 'integer >= 1, contiguous inside the part'),
  E('prev_event_sha256', 'required', 'null only for seq=1; otherwise sha256 of the previous event canonical text'),
  E('kind', 'required', 'one of the nine event types'),
  E('wall_time_utc', 'required', 'ISO 8601 UTC with milliseconds and Z'),
  E('actor', 'required', 'account name that produced the event'),
  E('role', 'required', 'dispatcher | tool | observer | product | control'),
];

const EVENT_FIELDS = {
  exec_begin: [
    ...COMMON_EVENT,
    E('argv_sha256', 'required', 'p47-canon-json-v1 of the argv array plus element 0 = executable path'),
    E('cwd', 'required', 'absolute'),
    E('entry_path', 'required', 'absolute'),
    E('entry_sha256', 'required', 'byte hash of the loaded entry'),
    E('pid', 'required', 'integer'),
    E('ppid', 'required', 'integer'),
    E('outcome', 'forbidden', 'begin cannot claim an outcome'),
  ],
  exec_end: [
    ...COMMON_EVENT,
    E('exit_code', 'required', 'integer'),
    E('started_utc', 'required', 'ISO 8601 UTC'),
    E('ended_utc', 'required', 'ISO 8601 UTC'),
    E('child_exit_codes', 'required', 'array of {pid, code}; empty when no child ran'),
    E('write_intent', 'forbidden', 'end is not a write'),
  ],
  write_intent: [
    ...COMMON_EVENT,
    E('intent_id', 'required', 'exactly equal to event_id'),
    E('op', 'required', 'create | overwrite | append | mkdir | rename | copy | acl | delete'),
    E('path', 'required', 'canonical absolute path'),
    E('path_kind', 'required', 'file | dir | tree'),
    E('src_path', 'required', 'null unless op is rename or copy'),
    E('rule_ref', 'required', 'id of the permission entry that allows the write'),
    E('decision', 'required', "const 'allow'"),
    E('before', 'required', 'null when the target is absent; else {exists, bytes, sha256, mtime_utc, sddl}'),
    E('outcome', 'forbidden', 'intent is recorded before the action'),
    E('error_code', 'forbidden', 'not known before the action'),
    E('after', 'forbidden', 'not known before the action'),
    E('bytes_written', 'forbidden', 'not known before the action'),
  ],
  write_result: [
    ...COMMON_EVENT,
    E('intent_ref', 'required', 'event_id of the write_intent in the same part'),
    E('outcome', 'required', 'ok | denied | error | skipped'),
    E('error_code', 'required', 'null only when outcome=ok; otherwise a stable code'),
    E('after', 'required', 'null unless outcome=ok; else {exists, bytes, sha256, mtime_utc, sddl}'),
    E('bytes_written', 'required', 'null unless outcome=ok and op writes bytes'),
    E('durable', 'required', 'true only after flush/fsync; false otherwise'),
    E('op', 'forbidden', 'reference only; do not restate'),
    E('path', 'forbidden', 'reference only; do not restate'),
    E('src_path', 'forbidden', 'reference only'),
    E('rule_ref', 'forbidden', 'reference only'),
    E('before', 'forbidden', 'reference only'),
  ],
  read_batch: [
    ...COMMON_EVENT,
    E('mode', 'required', 'content | metadata'),
    E('entries', 'required', 'array of {path, path_kind, rule_ref, result, bytes, sha256, error_code}'),
    E('counts', 'required', '{ok, denied, absent, unlisted}'),
    E('outcome', 'forbidden', 'per-entry result only'),
  ],
  preload: [
    ...COMMON_EVENT,
    E('guard_pid', 'required', 'integer'),
    E('parent_pid', 'required', 'integer; 0 for the runner'),
    E('process_role', 'required', 'runner | tool | main | worker | product'),
    E('guard_sha256', 'required', 'byte hash of fs-guard.cjs'),
    E('argv_sha256', 'required', 'p47-canon-json-v1 of process.argv'),
    E('policy_sha256', 'required', 'static hash of the deny/read/write policy'),
    E('inherited_env_keys', 'required', 'sorted array of the P0_GUARD_* keys seen'),
  ],
  observe_start: [
    ...COMMON_EVENT,
    E('observed_account', 'required', 'one of the two approved Codex names'),
    E('observed_sid', 'required', 'resolved SID'),
    E('nonce', 'required', '64 lowercase hex'),
    E('deadline_seconds', 'required', 'integer 900'),
    E('stdout', 'forbidden', 'the observer does not relay Codex output as an event field'),
  ],
  observe_relay: [
    ...COMMON_EVENT,
    E('line_sha256', 'required', 'sha256 of the relayed line bytes'),
    E('line_bytes', 'required', 'integer <= 4096'),
    E('verdict', 'required', 'ok | reject'),
    E('reason', 'required', 'null when ok; else schema | nonce | account | sid | admin | group | sentinel | write | cwd'),
    E('reported_account', 'required', 'account reported by the probe'),
    E('reported_sid', 'required', 'SID reported by the probe'),
    E('reported_write_result', 'required', 'denied | granted | error'),
    E('nonce_match', 'required', 'boolean'),
  ],
  observe_end: [
    ...COMMON_EVENT,
    E('relay_seen', 'required', 'boolean'),
    E('verdict', 'required', 'pass | fail'),
    E('exit_code', 'required', 'integer'),
    E('relay_line', 'forbidden', 'only the hash is stored'),
  ],
};

const CHAIN_FIELDS = {
  genesis: [
    E('schema', 'required', "const 'p47-chain-record-v1'"),
    E('record', 'required', "const 'genesis'"),
    E('chain_seq', 'required', 'integer 1'),
    E('prev_record_sha256', 'required', 'null for genesis'),
    E('prev_file_bytes', 'required', '0'),
    E('run_id', 'required', 'const P47-20261111-01'),
    E('created_utc', 'required', 'ISO 8601 UTC'),
    E('registry_sha256', 'required', 'approved registry hash'),
    E('manifest_sha256', 'required', 'approved RELEASE-MANIFEST hash'),
    E('verifier_result', 'required', "const 'pass'"),
    E('bootstrap', 'required', 'enumerated [{op, path, result}] array; no unlisted entry'),
    E('writer', 'required', 'WENX\\Administrator'),
    E('writer_tool_sha256', 'required', 'byte hash of p0-audit.cjs'),
  ],
  segment_open: [
    E('schema', 'required', "const 'p47-chain-record-v1'"),
    E('record', 'required', "const 'segment_open'"),
    E('chain_seq', 'required', 'integer, previous + 1'),
    E('prev_record_sha256', 'required', 'sha256 of the previous record'),
    E('prev_file_bytes', 'required', 'byte length before this record'),
    E('exec_id', 'required', 'registered execution id'),
    E('command_id', 'required', 'C00-C20'),
    E('args_sha256', 'required', 'argv hash of the dispatcher invocation'),
    E('cwd', 'required', 'absolute'),
    E('entry_path', 'required', 'absolute'),
    E('entry_sha256', 'required', 'byte hash'),
    E('planned_predecessor', 'required', 'previous exec id, or null after genesis'),
    E('c18_state', 'required', "null except on C07-B-C19-E01: bound | disabled-unbound"),
    E('c18_binding_sha256', 'required', 'null except on C07-B-C18-E01: sha256 of the canonical binding value'),
    E('c18_destination', 'required', 'null except on C07-B-C18-E01: the absolute destination recorded at binding time'),
    E('segment_dir', 'required', 'absolute; must not exist yet'),
  ],
  segment_close: [
    E('schema', 'required', "const 'p47-chain-record-v1'"),
    E('record', 'required', "const 'segment_close'"),
    E('chain_seq', 'required', 'integer, previous + 1'),
    E('prev_record_sha256', 'required', 'sha256 of the segment_open record'),
    E('prev_file_bytes', 'required', 'byte length before this record'),
    E('exec_id', 'required', 'matches segment_open'),
    E('command_id', 'required', 'matches segment_open'),
    E('result', 'required', 'ok | failed | aborted'),
    E('exit_code', 'required', 'integer'),
    E('parts', 'required', 'array of {name, bytes, sha256, events, first_seq, last_seq}'),
    E('events_total', 'required', 'integer'),
    E('unpaired_intents', 'required', 'integer; must be 0 for result=ok'),
    E('segment_digest', 'required', 'sha256 of the canonical parts array'),
    E('summary_path', 'required', 'absolute'),
    E('summary_sha256', 'required', 'null only when result != ok and summary creation failed'),
    E('summary_bytes', 'required', 'null under the same condition'),
    E('outputs', 'required', 'array of {path, bytes, sha256, kind}'),
    E('child_exit_codes', 'required', 'array of {pid, code}'),
    E('part_events', 'forbidden', 'events are not restated in the chain'),
  ],
};

const SUMMARY_FIELDS = [
  E('schema', 'required', "const 'p47-segment-summary-v1'"),
  E('run_id', 'required', 'const'),
  E('exec_id', 'required', 'matches the chain record'),
  E('command_id', 'required', 'C00-C20'),
  E('result', 'required', 'ok | failed | aborted'),
  E('exit_code', 'required', 'integer'),
  E('parts', 'required', 'same array as in segment_close'),
  E('counts', 'required', '{events, write_intent, write_result, read_entries, denied, preload}'),
  E('unpaired_intents', 'required', 'integer'),
  E('outputs', 'required', 'same array as in segment_close'),
  E('child_exit_codes', 'required', 'same array as in segment_close'),
  E('sealed_utc', 'required', 'ISO 8601 UTC'),
  E('summary_sha256', 'forbidden', 'no self hash'),
  E('prev_record_sha256', 'forbidden', 'summary does not reference the chain'),
];

// ------------------------------------------------------------- test vectors
function ev(kind, seq, prev, extra) {
  return Object.assign({
    schema: AUDIT.schema_event,
    event_id: 'ev' + String(seq).padStart(6, '0') + 'abcdef0123456789abcdef01',
    exec_id: 'C01-E01',
    part_id: 'events-tool-4242-1a2b3c4d',
    seq: seq,
    prev_event_sha256: prev,
    kind: kind,
    wall_time_utc: '2026-11-11T00:00:0' + seq + '.000Z',
    actor: 'WENX\\Administrator',
    role: 'tool',
  }, extra);
}

function buildVectors() {
  const valid = [];
  const add = (name, value) => {
    const c = canon(value);
    valid.push({ name: name, canonical: c, sha256: sha256utf8(c) });
  };
  add('empty_object', {});
  add('nested', { a: 1, b: [true, null, 'x'], z: { k: 'v' } });
  add('key_order', { b: 2, a: 1, c: 3 });
  add('string_escapes', { s: 'a"b\\c\u0000\u0008\u0009\u000a\u000c\u000d\u001f' });
  add('astral_char', { s: '\u{1F600}' });
  add('integer_limits', { v: [0, -1, 9007199254740991, -9007199254740991] });
  add('negative_zero', { v: -0 });
  add('bools_and_null', [false, true, null]);

  const i1 = ev('write_intent', 1, null, {
    intent_id: 'ev000001abcdef0123456789abcdef01',
    op: 'create',
    path: 'D:\\P47RUN\\P47-20261111-01\\out\\C02\\C02-E01\\acl-after.json',
    path_kind: 'file',
    src_path: null,
    rule_ref: 'C02-E01.business_writes[1]',
    decision: 'allow',
    before: null,
  });
  const r1 = ev('write_result', 2, sha256utf8(canon(i1)), {
    intent_ref: i1.event_id,
    outcome: 'ok',
    error_code: null,
    after: { exists: true, bytes: 512, sha256: 'a'.repeat(64), mtime_utc: '2026-11-11T00:00:02.000Z', sddl: null },
    bytes_written: 512,
    durable: true,
  });
  const rb = ev('read_batch', 3, sha256utf8(canon(r1)), {
    mode: 'content',
    entries: [{ path: 'D:\\P47RUN\\P47-20261111-01\\baseline\\m0.json', path_kind: 'file', rule_ref: 'C17-E01.business_reads[0]', result: 'ok', bytes: 2048, sha256: 'b'.repeat(64), error_code: null }],
    counts: { ok: 1, denied: 0, absent: 0, unlisted: 0 },
  });
  const events = [i1, r1, rb];

  const genesis = {
    schema: AUDIT.schema_chain,
    record: 'genesis',
    chain_seq: 1,
    prev_record_sha256: null,
    prev_file_bytes: 0,
    run_id: P.RUN_ID,
    created_utc: '2026-11-11T00:00:00.000Z',
    registry_sha256: 'c'.repeat(64),
    manifest_sha256: 'd'.repeat(64),
    verifier_result: 'pass',
    bootstrap: [
      { op: 'mkdir', path: 'D:\\P47RUN', result: 'ok' },
      { op: 'mkdir', path: 'D:\\P47RUN\\P47-20261111-01', result: 'ok' },
      { op: 'create', path: 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\chain-head.jsonl', result: 'ok' },
    ],
    writer: 'WENX\\Administrator',
    writer_tool_sha256: 'e'.repeat(64),
  };
  const gSha = sha256utf8(canon(genesis));
  const gBytes = Buffer.byteLength(canon(genesis), 'utf8');

  const open = {
    schema: AUDIT.schema_chain,
    record: 'segment_open',
    chain_seq: 2,
    prev_record_sha256: gSha,
    prev_file_bytes: gBytes,
    exec_id: 'C01-E01',
    command_id: 'C01',
    args_sha256: 'f'.repeat(64),
    cwd: 'C:\\Users\\Administrator',
    entry_path: 'D:\\P47TOOLS\\p47-phase0-v5\\payload\\tools\\p0-dispatch.ps1',
    entry_sha256: '1'.repeat(64),
    planned_predecessor: null,
    c18_state: null,
    segment_dir: 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\C01\\C01-E01',
  };
  const oSha = sha256utf8(canon(open));
  const oBytes = gBytes + Buffer.byteLength(canon(open), 'utf8');

  const parts = [{ name: 'events-tool-4242-1a2b3c4d.jsonl', bytes: 4096, sha256: '2'.repeat(64), events: 3, first_seq: 1, last_seq: 3 }];
  const summary = {
    schema: AUDIT.schema_summary,
    run_id: P.RUN_ID,
    exec_id: 'C01-E01',
    command_id: 'C01',
    result: 'ok',
    exit_code: 0,
    parts: parts,
    counts: { events: 3, write_intent: 1, write_result: 1, read_entries: 1, denied: 0, preload: 0 },
    unpaired_intents: 0,
    outputs: [{ path: 'D:\\P47RUN\\P47-20261111-01\\out\\C01\\C01-E01\\init.json', bytes: 1024, sha256: '3'.repeat(64), kind: 'file' }],
    child_exit_codes: [{ pid: 4242, code: 0 }],
    sealed_utc: '2026-11-11T00:00:05.000Z',
  };
  const sSha = sha256utf8(canon(summary));
  const sBytes = Buffer.byteLength(canon(summary), 'utf8');

  const close = {
    schema: AUDIT.schema_chain,
    record: 'segment_close',
    chain_seq: 3,
    prev_record_sha256: oSha,
    prev_file_bytes: oBytes,
    exec_id: 'C01-E01',
    command_id: 'C01',
    result: 'ok',
    exit_code: 0,
    parts: parts,
    events_total: 3,
    unpaired_intents: 0,
    segment_digest: sha256utf8(canon(parts)),
    summary_path: 'D:\\P47RUN\\P47-20261111-01\\out\\audit\\C01\\C01-E01\\summary.json',
    summary_sha256: sSha,
    summary_bytes: sBytes,
    outputs: summary.outputs,
    child_exit_codes: summary.child_exit_codes,
  };

  const vec = (name, obj) => {
    const c = canon(obj);
    return { name: name, canonical: c, sha256: sha256utf8(c) };
  };

  return {
    schema: AUDIT.schema_vectors,
    canon: AUDIT.canon,
    hash: AUDIT.hash,
    valid: valid,
    invalid_kinds: ['float', 'unsafe_integer', 'uppercase_key', 'non_ascii_key', 'dash_key',
      'lone_high_surrogate', 'lone_low_surrogate', 'undefined_value', 'nan', 'infinity', 'function_value', 'bigint_value'],
    events: events.map((e, i) => vec('event_' + e.kind, e)),
    chain: [vec('genesis', genesis), vec('segment_open', open), vec('segment_close', close)],
    summary: [vec('segment_summary', summary)],
    chain_expected: { genesis_sha256: gSha, open_prev: gSha, close_prev: oSha, close_file_bytes_before: oBytes },
  };
}

const INVALID_VALUES = {
  float: 1.5,
  unsafe_integer: 9007199254740992,
  uppercase_key: { Key: 1 },
  non_ascii_key: { 'é': 1 },
  dash_key: { 'a-b': 1 },
  lone_high_surrogate: '\ud800',
  lone_low_surrogate: '\udc00',
  undefined_value: undefined,
  nan: NaN,
  infinity: Infinity,
  function_value: function () {},
  bigint_value: 10n,
};

module.exports = { AUDIT, EVENT_FIELDS, CHAIN_FIELDS, SUMMARY_FIELDS, buildVectors, INVALID_VALUES };
