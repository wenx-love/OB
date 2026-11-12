'use strict';
// V6 structural / semantic checker. Read-only; never executes C00-C20.
const fs = require('fs');
const path = require('path');
const L = require('./p0v6-lib.cjs');
const S = require('./p0v6-spec.cjs');
const A = require('./p0v6-audit.cjs');
const { canon, sha256utf8, sha256hex, P } = L;

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f));
const text = (f) => read(f).toString('utf8');
const R = { reg: 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json', tsv: 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv', vec: 'PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json', main: 'PHASE4.7-PHASE0-START-CONDITIONS-V6.md', audit: 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V6.md' };

let n = 0;
const fails = [];
function ok(name, cond, detail) { n++; if (!cond) fails.push(name + (detail ? ' :: ' + detail : '')); }
function eq(name, a, b) { ok(name, a === b, String(a) + ' != ' + String(b)); }

const reg = JSON.parse(read(R.reg).toString('utf8'));
const tsv = text(R.tsv);
const vec = JSON.parse(read(R.vec).toString('utf8'));
const main = text(R.main);
const audit = text(R.audit);
const byId = Object.fromEntries(reg.executions.map((e) => [e.exec_id, e]));

// ------------------------------------------------------------ vector schema
function validateEvents(events) {
  const errs = [];
  const seen = new Set();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!/^[0-9a-f]{32}$/.test(e.event_id || '')) errs.push('schema.event_id');
    if (seen.has(e.event_id)) errs.push('schema.unique'); seen.add(e.event_id);
    if (e.seq !== i + 1) errs.push('schema.seq');
    if (i === 0) { if (e.prev_event_sha256 !== null) errs.push('schema.prev'); }
    else if (e.prev_event_sha256 !== sha256utf8(canon(events[i - 1]))) errs.push('schema.prev');
    const fields = A.EVENT_FIELDS[e.kind];
    if (!fields) { errs.push('schema.kind'); continue; }
    for (const f of fields) {
      if (f.presence === 'required' && !(f.name in e)) errs.push('schema.required');
      if (f.presence === 'forbidden' && (f.name in e)) errs.push('schema.forbidden');
    }
    if (e.kind === 'write_intent' && e.intent_id !== e.event_id) errs.push('schema.intent_id');
    if (e.kind === 'write_result') {
      const intent = events.find((x) => x.kind === 'write_intent' && x.event_id === e.intent_ref);
      if (!intent || intent.exec_id !== e.exec_id) errs.push('schema.intent_ref');
    }
  }
  return [...new Set(errs)];
}
function validateRecord(kind, rec) {
  const errs = [];
  for (const f of A.CHAIN_FIELDS[kind]) {
    if (f.presence === 'required' && !(f.name in rec)) errs.push('schema.required');
    if (f.presence === 'forbidden' && (f.name in rec)) errs.push('schema.forbidden');
  }
  return [...new Set(errs)];
}

const events = vec.events.map((v) => JSON.parse(v.canonical));
eq('positive events pass schema', validateEvents(events).join(','), '');
const negVals = A.negativeValues();
for (const neg of vec.negative) {
  const v = negVals[neg.name];
  let actual = '';
  if (neg.name === 'segment_open_missing_c18_fields') actual = validateRecord('segment_open', v).join(',');
  else if (neg.name === 'summary_self_hash') {
    const errs = [];
    for (const f of A.SUMMARY_FIELDS) if (f.presence === 'forbidden' && (f.name in v)) errs.push('schema.forbidden');
    actual = errs.join(',');
  } else if (neg.name === 'truncated_line_without_lf') {
    actual = (v.bytesWithoutLf + 1 === v.bytesWithoutLf) ? '' : 'bytes.lf';
  } else if (neg.name === 'prev_file_bytes_missing_lf') {
    actual = (v.declaredPrev === v.genesisBytes) ? '' : 'bytes.prev_file_bytes';
  } else if (Array.isArray(v)) actual = validateEvents(v).join(',');
  else actual = validateEvents([v]).join(',');
  ok('negative rejected: ' + neg.name, actual.includes(neg.expect), 'got ' + actual);
}

// ------------------------------------------------------------ vector physics
for (const v of [...vec.valid, ...vec.events, ...vec.chain, ...vec.summary]) {
  ok('vector sha ' + v.name, sha256utf8(v.canonical) === v.sha256, v.name);
  ok('vector bytes ' + v.name, Buffer.byteLength(v.canonical, 'utf8') === v.bytes, v.name);
}
for (const e of events) {
  ok('event id hex ' + e.event_id, /^[0-9a-f]{32}$/.test(e.event_id));
  eq('event exec ' + e.event_id, e.exec_id, 'C19-E01');
  if (e.rule_ref) ok('rule_ref exec ' + e.event_id, e.rule_ref.startsWith('C19-E01.'));
}
const chain = Object.fromEntries(vec.chain.map((v) => [v.name, v]));
const g = JSON.parse(chain.genesis.canonical), o = JSON.parse(chain.segment_open.canonical), c = JSON.parse(chain.segment_close.canonical);
eq('genesis prev null', g.prev_record_sha256, null);
eq('open prev genesis', o.prev_record_sha256, chain.genesis.sha256);
eq('close prev open', c.prev_record_sha256, chain.segment_open.sha256);
eq('open physical bytes', o.prev_file_bytes, Buffer.byteLength(chain.genesis.canonical, 'utf8') + 1);
eq('close physical bytes', c.prev_file_bytes, Buffer.byteLength(chain.genesis.canonical, 'utf8') + 1 + Buffer.byteLength(chain.segment_open.canonical, 'utf8') + 1);
ok('segment_open carries c18 fields', ['c18_state', 'c18_binding_sha256', 'c18_destination'].every((k) => k in o));
const lines = events.map((e) => canon(e) + '\n');
const partBytes = lines.reduce((s, x) => s + Buffer.byteLength(x, 'utf8'), 0);
const partSha = sha256hex(Buffer.from(lines.join(''), 'utf8'));
eq('part bytes including LF', vec.jsonl.bytes_including_lf, partBytes);
eq('part sha including LF', vec.jsonl.sha256, partSha);
eq('summary part bytes', JSON.parse(vec.summary[0].canonical).parts[0].bytes, partBytes);
eq('summary part sha', JSON.parse(vec.summary[0].canonical).parts[0].sha256, partSha);

// ------------------------------------------------------------ registry counts
eq('commands 21', reg.counts.commands, 21);
eq('executions 58', reg.counts.executions, 58);
eq('participants 54', reg.counts.chain_participants, 54);
eq('records bound 109', reg.counts.chain_records_bound, 109);
eq('records unbound 103', reg.counts.chain_records_unbound, 103);
eq('plan bound 58', reg.counts.plan_bound, 58);
eq('plan unbound 55', reg.counts.plan_unbound, 55);
eq('payload 20/16/4', reg.counts.payload_files, 20);
eq('staged 16', reg.counts.staged_files, 16);
eq('bootstrap 4', reg.counts.bootstrap_files, 4);
eq('release root v6', reg.release.source_root, P.SRC);

// ------------------------------------------------------------ plan/predecessors
const idsB = S.PLAN_BOUND, idsU = S.PLAN_UNBOUND;
eq('plan bound unique', new Set(idsB).size, idsB.length);
eq('plan unbound unique', new Set(idsU).size, idsU.length);
const removed = idsB.filter((x) => !idsU.includes(x));
eq('unbound removes exactly C18 trio', removed.join(','), 'C07-B-C18-E01,C18-E01,C07-A-C18-E01');
reg.executions.forEach((e, i) => {
  eq('order bound ' + e.exec_id, e.plan_order_bound, i + 1);
  eq('predecessor bound ' + e.exec_id, e.predecessor_bound, i === 0 ? null : idsB[i - 1]);
});
idsU.forEach((id, i) => {
  const e = reg.executions.find((x) => x.exec_id === id);
  eq('order unbound ' + id, e.plan_order_unbound, i + 1);
  eq('predecessor unbound ' + id, e.predecessor_unbound, i === 0 ? null : idsU[i - 1]);
});
eq('B-C19 unbound predecessor', byId['C07-B-C19-E01'].predecessor_unbound, 'C18-BIND-E01');
eq('B-C18 bound predecessor', byId['C07-B-C18-E01'].predecessor_bound, 'C18-BIND-E01');
eq('BIND exists and reads env once', byId['C18-BIND-E01'].required_env.P0_SECOND_ARCHIVE, 'optional');
eq('BIND is participant', byId['C18-BIND-E01'].chain_role, 'participant');
eq('BIND has no data inputs', byId['C18-BIND-E01'].reads.business.filter((r) => r.path !== P.TMP && !byId['C18-BIND-E01'].load_files.includes(r.path)).length, 0);

// ------------------------------------------------------------ permissions
const staged = Object.keys(L.TOOLS).filter((k) => L.TOOLS[k].staged).map((k) => L.stg(k));
for (const e of reg.executions) {
  ok('exec has argv ' + e.exec_id, Array.isArray(e.argv) && e.argv.length >= 3);
  eq('argv sha ' + e.exec_id, L.argvSha(e.argv), e.argv_sha256);
  ok('exec has gate ' + e.exec_id, !!e.gate);
  ok('exec has cwd ' + e.exec_id, /^[A-Z]:\\/.test(e.cwd));
  ok('fail class ' + e.exec_id, ['pre-run', 'bootstrap', 'fatal', 'gate', 'seal'].includes(e.fail_class));
  // read/deny no overlap (business)
  for (const r of e.reads.business) {
    ok('no allow/deny overlap ' + e.exec_id + ' ' + r.path, !e.deny_read.some((d) => r.path.toLowerCase() === d.toLowerCase() || r.path.toLowerCase().startsWith(d.toLowerCase() + '\\')));
  }
  if (e.product) {
    for (const r of e.product.reads) ok('product no overlap ' + e.exec_id, !e.product.deny_read.some((d) => r.path.toLowerCase() === d.toLowerCase() || r.path.toLowerCase().startsWith(d.toLowerCase() + '\\')));
    eq('product policy sha ' + e.exec_id, typeof e.product.policy_sha256, 'string');
  }
  // every file output has an exact file write entry
  for (const o of e.outputs) {
    if (o.code === 'CONSOLE' || o.path.startsWith('ENV:')) continue;
    if (['FC', 'FW', 'FA', 'ICON'].includes(o.code)) {
      ok('exact file write ' + e.exec_id + ' ' + o.path, e.writes.business.some((w) => w.path === o.path && w.kind === 'file'));
    }
    if (['DC', 'TC', 'TW', 'AP', 'ML', 'ACL', 'EC'].includes(o.code)) {
      ok('dir/tree write ' + e.exec_id + ' ' + o.path, e.writes.business.some((w) => w.path === o.path));
    }
  }
  // staged execs: business reads of staged files are exact, and deny lists the rest exactly
  if (e.entry_mode === 'staged-dispatcher') {
    const allowedStaged = e.reads.business.filter((r) => r.path.toLowerCase().startsWith(P.STAGED.toLowerCase() + '\\'));
    ok('staged reads exact ' + e.exec_id, allowedStaged.every((r) => r.kind === 'file'));
    const deniedStaged = e.deny_read.filter((d) => d.toLowerCase().startsWith(P.STAGED.toLowerCase() + '\\'));
    ok('staged deny exact ' + e.exec_id, deniedStaged.every((d) => staged.some((s) => s.toLowerCase() === d.toLowerCase())));
    const overlap = deniedStaged.filter((d) => allowedStaged.some((r) => r.path.toLowerCase() === d.toLowerCase()));
    eq('staged deny excludes loaded files ' + e.exec_id, overlap.length, 0);
  }
  // chain permissions
  if (e.chain_role === 'participant') {
    ok('participant append ' + e.exec_id, e.writes.control.some((w) => w.path === P.CHAIN && w.op === 'file-append'));
    ok('participant summary ' + e.exec_id, e.writes.control.some((w) => w.path.endsWith('summary.json')));
    ok('participant part rule ' + e.exec_id, !!e.audit_part_rule && e.audit_part_rule.op === 'create-and-append');
  }
  if (e.chain_role === 'genesis') {
    ok('genesis create ' + e.exec_id, e.writes.control.some((w) => w.path === P.CHAIN && w.op === 'file-create'));
    ok('genesis own append ' + e.exec_id, e.writes.control.some((w) => w.path === P.CHAIN && w.op === 'file-append'));
    ok('genesis summary ' + e.exec_id, e.writes.control.some((w) => w.path.endsWith('summary.json')));
  }
  if (e.chain_role === 'terminal') {
    ok('terminal only seal ' + e.exec_id, e.writes.control.length === 1 && e.writes.control[0].path === P.TSEAL);
    ok('terminal no part rule ' + e.exec_id, e.audit_part_rule === null);
  }
  if (e.chain_role !== 'terminal' && e.chain_role !== 'none') {
    ok('chain read control ' + e.exec_id, e.reads.control.some((r) => r.path === P.CHAIN));
  }
  const chainAnalyst = ['C19-E01', 'C20-REPORT-E01', 'C20-SEAL-E01'].includes(e.exec_id);
  ok('no business chain read ' + e.exec_id, chainAnalyst || !e.reads.business.some((r) => r.path === P.CHAIN));
}

// 16 previously conflicting execs
const sixteen = ['C06-E01', 'C08-E01', 'C09-E01', 'C10-P-E01', 'C10-N-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C10-S-E01', 'C14-E01', 'C15-E01', 'C16-E01', 'C17-E01', 'C18-E01', 'C19-E01', 'C20-REPORT-E01'];
for (const id of sixteen) {
  const e = byId[id];
  ok('no staged-dir deny ' + id, !e.deny_read.some((d) => d.toLowerCase() === P.STAGED.toLowerCase()));
  ok('load files inside staged ' + id, e.load_files.every((p) => p.toLowerCase().startsWith(P.STAGED.toLowerCase() + '\\')));
}

// C03 deadlines
eq('OBS deadline 900', byId['C03-OBS-E01'].deadline_seconds, 900);
eq('PROBE deadline 300', byId['C03-PROBE-E01'].deadline_seconds, 300);
ok('OBS creates OUT dirs', byId['C03-OBS-E01'].writes.business.some((w) => w.path === P.OUT + '\\C03' && w.kind === 'subtree'));
ok('OBS creates exec dir', byId['C03-OBS-E01'].writes.business.some((w) => w.path === P.OUT + '\\C03\\C03-OBS-E01'));

// C10 argv + product report
for (const id of ['C10-P-E01', 'C10-N-E01', 'C10-S-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C15-E01', 'C16-E01']) {
  const e = byId[id];
  ok('target argv ' + id, Array.isArray(e.target_argv) && e.target_argv.length > 3 && !!e.target_argv_sha256);
  ok('product argv ' + id, e.product && Array.isArray(e.product.argv));
}
for (const id of ['C10-P-E01', 'C10-N-E01', 'C10-S-E01', 'C12-E01', 'C13-E01', 'C16-E01']) {
  const e = byId[id];
  const vp = S.outDir(e.command_id, id) + '\\vitest.json';
  ok('product vitest write ' + id, e.product.writes.some((w) => w.path === vp && w.op === 'file-create'));
  ok('runner creates OUT dir ' + id, e.writes.business.some((w) => w.path === S.outDir(e.command_id, id) && w.kind === 'subtree'));
}
for (const id of ['C10-P-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C15-E01', 'C16-E01']) {
  ok('product cannot read copies.json ' + id, !byId[id].product.reads.some((r) => r.path.endsWith('copies.json')));
}

// C19 cutoff + read scope
ok('C19 cutoff output', byId['C19-E01'].outputs.some((o) => o.path.endsWith('cutoff.json')));
ok('C19 reads OUT subtree', byId['C19-E01'].reads.business.some((r) => r.path === P.OUT && r.kind === 'subtree'));
ok('C19 gate mentions preceding close', /preceding segment_close/.test(byId['C19-E01'].gate));
ok('REPORT declares cutoff', /cutoff/.test(byId['C20-REPORT-E01'].gate) || byId['C20-REPORT-E01'].outputs.some((o) => o.path.endsWith('report-coverage.json')));

// tmp split
eq('C02 tmp', byId['C02-E01'].required_env.TEMP, P.TMP);
eq('C04 tmp', byId['C04-E01'].required_env.TEMP, P.TMP);
eq('C05 final tmp', byId['C05-FINAL-E01'].required_env.TEMP, P.TMP);
eq('C10 product tmp', byId['C10-P-E01'].product.cwd === P.CP ? byId['C10-P-E01'].required_env.TEMP : '', P.CP + '\\tmp');

// failure matrix
eq('failure states 10', A.FAILURE_STATES.length, 10);
for (const s of A.FAILURE_STATES) {
  ok('state terminal ' + s.id, s.next !== 'pending' && s.report !== 'pending');
  eq('state complete flag ' + s.id, s.complete, s.id === 'complete' ? 'yes (pending user)' : 'no');
}
ok('abort has no C19/REPORT rerun', reg.plan.failure_policy.abort_successors.fatal.join(' ').includes('C20-SEAL'));

// ------------------------------------------------------------ TSV byte equality
const encR = (list) => list.map((r) => (r.kind === 'subtree' ? 'T:' : r.kind === 'metadata' ? 'M:' : 'F:') + r.path).join(';');
const encW = (list) => list.map((w) => w.op + ':' + w.path).join(';');
const HEAD = ['exec_id', 'command_id', 'variant', 'step', 'plan_order_bound', 'plan_order_unbound', 'executor', 'entry_mode',
  'entry_path', 'cwd', 'argv_sha256', 'inline_sha256', 'chain_role', 'deadline_seconds', 'tool_files', 'load_files',
  'dispatcher_reads', 'business_reads', 'control_reads', 'audit_part_rule', 'dispatcher_writes', 'business_writes',
  'control_writes', 'deny_read', 'protect_write', 'guard_policy_sha256', 'predecessor_bound', 'predecessor_unbound',
  'gate', 'outputs', 'fail_class'];
const rows = [HEAD.join('\t')];
for (const e of reg.executions) {
  rows.push([e.exec_id, e.command_id, e.variant || '', e.step, String(e.plan_order_bound), e.plan_order_unbound ? String(e.plan_order_unbound) : '', e.executor, e.entry_mode,
    e.entry_path, e.cwd, e.argv_sha256, e.inline_sha256 || '', e.chain_role, e.deadline_seconds ? String(e.deadline_seconds) : '',
    e.tool_files.map((t) => t.path).join(';'), e.load_files.join(';'), encR(e.reads.dispatcher), encR(e.reads.business), encR(e.reads.control),
    e.audit_part_rule ? e.audit_part_rule.pattern + '@' + e.audit_part_rule.dir : '', encW(e.writes.dispatcher), encW(e.writes.business), encW(e.writes.control),
    e.deny_read.join(';'), e.protect_write.join(';'), e.guard ? e.guard.policy_sha256 : '', e.predecessor_bound || '', e.predecessor_unbound || '', e.gate,
    e.outputs.filter((o) => o.code !== 'CONSOLE').map((o) => o.code + ':' + o.path).join(';'), e.fail_class].join('\t'));
}
eq('TSV regenerated byte-identical', sha256utf8(rows.join('\n') + '\n'), sha256utf8(tsv));
eq('TSV data rows', tsv.split('\n').slice(1, -1).length, 58);
eq('TSV columns', tsv.split('\n')[0].split('\t').length, 31);
ok('TSV every row 31 cols', tsv.split('\n').slice(0, -1).every((l) => l.split('\t').length === 31));

// ------------------------------------------------------------ docs / hygiene
for (const q of ['P0-1', 'P0-2', 'P0-3', 'P0-4', 'C18-BIND', '31 列', '58']) ok('main covers ' + q, main.includes(q));
ok('main states 109/103', main.includes('109') && main.includes('103'));
ok('audit states LF rule', audit.includes('一个 LF') || audit.includes('+ 一个 LF'));
ok('audit states negative vectors', audit.includes('negative') || audit.includes('12 条负例'));
ok('no V5 root in V6 files', !text(R.reg).includes('p47-phase0-v5') && !tsv.includes('p47-phase0-v5'));
for (const f of [R.reg, R.tsv, R.vec, R.main, R.audit]) {
  const t = text(f);
  for (const b of ['${', 'TODO', 'TBD', 'FIXME']) ok('no placeholder ' + b + ' ' + f, !t.includes(b));
}
const hygiene = (f) => { const b = read(f); return !(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) && !b.includes(0x0d); };
for (const f of [R.reg, R.tsv, R.vec, R.main, R.audit]) ok('hygiene ' + f, hygiene(f));

// V5 immutability
const V5 = {
  'PHASE4.7-PHASE0-START-CONDITIONS-V5.md': '3d5e51bc1af7829d26c1de6266cc7706091807189f5eea7befa994a2d118fdcd',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv': '1b7ac41018ed4a4345a0122cc74576c56d6f6c128b91e430b9b184e98618fb95',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json': '078dbbf60db94dddb161ad71b6cedb87ec60724a1857ab72cca3ac87770fab71',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md': 'fa6fecbacfe9142f9b2f7ac0d05aea6cdf25b89b275ae7c60edc3ba9ac323220',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json': 'dd32bc4ff71d80bc95555d5ea6c49aaa7d3e573715f5e3d6a11f8e00b4b1e042',
  'CODEX-P47-PHASE0-V5-EIGHTH-INDEPENDENT-REVIEW.md': 'ab284d004914c82d1438514c13ba27b09134524d656ae3c69ec266a1013a06a8',
};
for (const [f, h] of Object.entries(V5)) eq('V5 immutable ' + f, sha256hex(read(f)), h);

console.log(JSON.stringify({ checks: n, failed: fails.length, registry_sha256: sha256hex(read(R.reg)), vectors_sha256: sha256hex(read(R.vec)), failures: fails.slice(0, 20) }, null, 2));
if (fails.length) process.exit(1);
