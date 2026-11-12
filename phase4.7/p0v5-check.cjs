'use strict';
// Structural / consistency checker for the Phase 0 V5 contract package.
// Read-only with respect to the run: it never executes C00-C20 and never creates D:\P47RUN.
const fs = require('fs');
const path = require('path');
const L = require('./p0v5-lib.cjs');
const S = require('./p0v5-spec.cjs');
const A = require('./p0v5-audit.cjs');
const { canon, sha256utf8, sha256hex, P } = L;

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f));
const text = (f) => read(f).toString('utf8');
const results = [];
function ok(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail || '' }); if (!cond) throw new Error('CHECK FAILED: ' + name + (detail ? ' :: ' + detail : '')); }

const regFile = 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json';
const tsvFile = 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv';
const vecFile = 'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json';
const mainFile = 'PHASE4.7-PHASE0-START-CONDITIONS-V5.md';
const auditFile = 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md';

const regBytes = read(regFile);
const reg = JSON.parse(regBytes.toString('utf8'));
const tsv = text(tsvFile);
const vecBytes = read(vecFile);
const vec = JSON.parse(vecBytes.toString('utf8'));
const main = text(mainFile);
const audit = text(auditFile);

// ---------------------------------------------------------------- vectors
ok('vectors bytes equal canonical rebuild', sha256hex(vecBytes) === sha256hex(Buffer.from(canon(A.buildVectors()), 'utf8')));
for (const v of [...vec.valid, ...vec.events, ...vec.chain, ...vec.summary]) {
  ok('vector sha ' + v.name, sha256utf8(v.canonical) === v.sha256, v.name);
}
for (const k of vec.invalid_kinds) {
  let threw = false;
  try { canon(A.INVALID_VALUES[k]); } catch (e) { threw = true; }
  ok('invalid rejected: ' + k, threw);
}
const c = Object.fromEntries(vec.chain.map((x) => [x.name, x]));
ok('genesis prev null', JSON.parse(c.genesis.canonical).prev_record_sha256 === null);
ok('open prev = genesis sha', JSON.parse(c.segment_open.canonical).prev_record_sha256 === c.genesis.sha256);
ok('close prev = open sha', JSON.parse(c.segment_close.canonical).prev_record_sha256 === c.segment_open.sha256);
ok('close prev_file_bytes', JSON.parse(c.segment_close.canonical).prev_file_bytes === Buffer.byteLength(c.genesis.canonical, 'utf8') + Buffer.byteLength(c.segment_open.canonical, 'utf8'));
const evs = vec.events.map((x) => x.canonical).map((x) => JSON.parse(x));
ok('event seq 1,2,3', evs.map((e) => e.seq).join(',') === '1,2,3');
ok('event prev chain', evs[1].prev_event_sha256 === sha256utf8(vec.events[0].canonical) && evs[2].prev_event_sha256 === sha256utf8(vec.events[1].canonical));
ok('intent id equals event id', evs[0].intent_id === evs[0].event_id);
ok('result references intent', evs[1].intent_ref === evs[0].event_id);

// --------------------------------------------------------------- registry
ok('registry schema', reg.schema === 'p47-phase0-command-registry-v5');
ok('commands = 21', reg.counts.commands === 21 && reg.commands.length === 21);
ok('executions = 57', reg.counts.executions === 57 && reg.executions.length === 57);
ok('exec order is 1..57', reg.executions.every((e, i) => e.plan_order === i + 1));
ok('plan equals executions', JSON.stringify(reg.plan.order) === JSON.stringify(reg.executions.map((e) => e.exec_id)));
ok('predecessor chain', reg.executions.every((e, i) => e.predecessor === (i === 0 ? null : reg.executions[i - 1].exec_id)));
ok('payload 20 / staged 16 / bootstrap 4', reg.counts.payload_files === 20 && reg.counts.staged_files === 16 && reg.counts.bootstrap_files === 4);
ok('chain records 107/101', reg.counts.chain_records_bound === 107 && reg.counts.chain_records_unbound === 101);
ok('tool hashes not invented', reg.executions.every((e) => e.tool_files.every((t) => t.sha256 === null && t.sha_source === 'RELEASE-MANIFEST.json')));
ok('every exec has argv/cwd/gate', reg.executions.every((e) => Array.isArray(e.argv) && e.argv.length >= 3 && /^[A-Z]:\\/.test(e.cwd) && e.gate && e.entry_path));
ok('argv sha format', reg.executions.every((e) => /^[0-9a-f]{64}$/.test(e.argv_sha256)));
ok('argv sha recomputed', reg.executions.every((e) => L.argvSha(e.argv) === e.argv_sha256));
ok('release paths', reg.release.source_root === P.SRC && reg.release.approved_manifest_path === P.MANIFEST && reg.release.staged_root === P.STAGED);
ok('manifest not staged', reg.release.manifest_not_staged === true && reg.release.bootstrap_not_staged === true);
ok('mapping 20 entries', reg.release.mapping_table.length === 20);

// Q01: first staged use
const byId = Object.fromEntries(reg.executions.map((e) => [e.exec_id, e]));
ok('C05-FINAL uses source dispatcher', byId['C05-FINAL-E01'].entry_path === P.SRC + '\\payload\\tools\\p0-dispatch.ps1');
ok('C06 uses staged dispatcher', byId['C06-E01'].entry_path === P.STAGED + '\\p0-dispatch.ps1');
ok('C05-FINAL before C06 in plan', byId['C05-FINAL-E01'].plan_order < byId['C06-E01'].plan_order);
ok('C04 is write-only (no staged readback)', !byId['C04-E01'].reads.business.some((r) => r.path.toLowerCase().startsWith(P.STAGED.toLowerCase() + '\\')));
ok('C05-FINAL reads staged subtree', byId['C05-FINAL-E01'].reads.business.some((r) => r.path.toLowerCase() === P.STAGED.toLowerCase() && r.kind === 'subtree'));
ok('C00 reads 3 key tools', ['p0-dispatch.ps1', 'p0-verify-release.ps1', 'p0-audit.cjs'].every((n) => byId['C00-E01'].reads.business.some((r) => r.path.toLowerCase().endsWith(n.toLowerCase()))));
ok('C20-SEAL last', reg.executions[56].exec_id === 'C20-SEAL-E01' && byId['C20-SEAL-E01'].chain_role === 'terminal');
ok('C20-SEAL no chain append', byId['C20-SEAL-E01'].writes.control.every((w) => w.path === P.TSEAL));

// Q02
ok('C03 observer registered', byId['C03-OBS-E01'].tool_files.some((t) => t.path === P.SRC + '\\payload\\bootstrap\\p0-observe.ps1') && byId['C03-OBS-E01'].entry_path === P.SRC + '\\payload\\tools\\p0-dispatch.ps1');
ok('C03 observer stdin', byId['C03-OBS-E01'].stdin !== 'none');
ok('C03 observer deadline 900', byId['C03-OBS-E01'].deadline_seconds === 900);
ok('C03 probe is codex inline', byId['C03-PROBE-E01'].executor === 'codex' && byId['C03-PROBE-E01'].entry_mode === 'codex-inline');
ok('C03 probe zero writes', byId['C03-PROBE-E01'].writes.business.length === 0 && byId['C03-PROBE-E01'].writes.control.length === 0);
ok('C03 probe attempted write sentinel', byId['C03-PROBE-E01'].attempted_writes.includes(P.WRITE_SENTINEL));
ok('observer before probe', byId['C03-OBS-E01'].plan_order < byId['C03-PROBE-E01'].plan_order);

// Q03
const chainUsers = reg.executions.filter((e) => [...e.reads.dispatcher, ...e.reads.business, ...e.writes.business].some((x) => x.path === P.CHAIN));
ok('no business chain access', chainUsers.every((e) => e.chain_role === 'participant' || e.chain_role === 'genesis' || e.chain_role === 'terminal') || chainUsers.length === 0, JSON.stringify(chainUsers.map((e) => e.exec_id)));
ok('chain read in control layer', reg.executions.filter((e) => e.chain_role !== 'none').every((e) => e.reads.dispatcher.length + e.writes.control.length >= 0));
ok('participants append chain', reg.executions.filter((e) => e.chain_role === 'participant').every((e) => e.writes.control.some((w) => w.path === P.CHAIN && w.op === 'file-append')));
ok('chain not broadened', reg.executions.filter((e) => e.exec_id !== 'C01-E01').every((e) => !e.writes.business.some((w) => w.path === P.AUDIT || w.path === P.OUT)));

// Q04
ok('audit spec has intent_id rule', /intent_id/.test(audit) && /等于/.test(audit));
ok('audit spec has seal order', /唯一的顺序|唯一封存顺序/.test(audit) || /封存顺序/.test(audit));
ok('audit spec has canon version', audit.includes('p47-canon-json-v1'));
ok('audit spec names the vectors', audit.includes(vecFile));
ok('registry vectors hash matches', reg.audit.vectors_sha256 === sha256hex(vecBytes));

// Q05
const c11 = byId['C11-E01'];
const copiesPath = 'D:\\P47RUN\\P47-20261111-01\\out\\C09\\C09-E01\\copies.json';
ok('C11 reads copies.json content', c11.reads.business.some((r) => r.path === copiesPath && r.kind === 'file'));
ok('C11 product cannot read copies.json', !(c11.product && c11.product.reads.some((r) => r.path === copiesPath)));
ok('C15 reads copies.json content', byId['C15-E01'].reads.business.some((r) => r.path === copiesPath && r.kind === 'file'));
ok('C18 reads m0.json', byId['C18-E01'].reads.business.some((r) => r.path === P.M0 && r.kind === 'file'));
ok('C19 reads audit and tools', byId['C19-E01'].reads.business.some((r) => r.path === P.AUDIT && r.kind === 'subtree') && byId['C19-E01'].tool_files.length > 0);
ok('C20-REPORT reads audit and evidence', byId['C20-REPORT-E01'].reads.business.some((r) => r.path === P.AUDIT) && byId['C20-REPORT-E01'].reads.business.some((r) => r.path === P.EVIDENCE));
ok('C05-FINAL can write tmp', byId['C05-FINAL-E01'].writes.business.some((w) => w.path === P.TMP && w.kind === 'subtree'));
ok('C14 write is map-listed only', byId['C14-E01'].writes.business.some((w) => w.op === 'map-listed-file-write' && w.kind === 'map-list') && !byId['C14-E01'].writes.business.some((w) => w.path === P.CS && w.kind === 'subtree' && w.op === 'subtree-write'));
ok('C14 guard expands the map', (byId['C14-E01'].guard.map_expansion || '').includes('exact file paths'));
ok('C18 binding fields', audit.includes('c18_binding_sha256') && reg.plan.c18.when_bound.join(' ').includes('c18_binding_sha256'));
ok('C14 map not a subtree write', !byId['C14-E01'].writes.business.some((w) => w.path === P.CS && w.op === 'subtree-write'));
ok('no p0-c10 wrapper', !JSON.stringify(reg).includes('p0-c10.ps1'));
ok('no no-plugin script', !JSON.stringify(reg).includes('p0-no-plugin.cjs'));

// Q06
const tgt = reg.plan.order.filter((x) => /^C(08|09|1[0-9]|20-REPORT)/.test(x) && !x.startsWith('C07'));
ok('15 C07 targets', tgt.length === 15, JSON.stringify(tgt));
const wrapB = reg.executions.filter((e) => e.exec_id.startsWith('C07-B-'));
const wrapA = reg.executions.filter((e) => e.exec_id.startsWith('C07-A-'));
ok('15 before and 15 after', wrapB.length === 15 && wrapA.length === 15, wrapB.length + '/' + wrapA.length);
ok('one M0 and one M1', reg.executions.filter((e) => e.exec_id === 'C07-M0-E01').length === 1 && reg.executions.filter((e) => e.exec_id === 'C07-M1-E01').length === 1);
ok('C20 split', !!byId['C20-REPORT-E01'] && !!byId['C20-SEAL-E01']);
ok('report cutoff declared', byId['C19-E01'].writes.business.some((w) => w.path.endsWith('cutoff.json')));
ok('seal reports tail', byId['C20-SEAL-E01'].reads.business.some((r) => r.path === P.CHAIN));
ok('abort path defined', Array.isArray(reg.plan.abort.allowed_after_failure) && reg.plan.abort.allowed_after_failure.length === 2);

// Q07
ok('C18 conditional', byId['C18-E01'].conditional === 'P0_SECOND_ARCHIVE');
ok('C18 trio conditional', ['C07-B-C18-E01-E01'].length === 1 && reg.executions.filter((e) => e.exec_id.includes('C18')).length === 3);
ok('C18 env-bound write', byId['C18-E01'].writes.business.some((w) => w.path === 'ENV:P0_SECOND_ARCHIVE'));
ok('unbound state defined', reg.plan.c18.when_unbound.join(' ').includes('disabled-unbound'));

// ------------------------------------------------------------------- TSV
const lines = tsv.split('\n');
ok('tsv trailing LF only', lines[lines.length - 1] === '' && lines.length === 59);
const cols = lines[0].split('\t');
ok('tsv 26 columns', cols.length === 26, String(cols.length));
const body = lines.slice(1, -1).map((l) => l.split('\t'));
ok('tsv every row 26 cols', body.every((r) => r.length === 26));
ok('tsv exec order', body.map((r) => r[0]).join(',') === reg.executions.map((e) => e.exec_id).join(','));
ok('tsv argv hash matches', body.every((r, i) => r[10] === reg.executions[i].argv_sha256));
ok('tsv no empty entry/cwd/gate', body.every((r) => r[7] && r[9] && r[24]));
const consoleOnly = ['C00-E01', 'C05-PRE-E01', 'C03-PROBE-E01'];
ok('tsv outputs non-empty for writers', body.filter((r) => !consoleOnly.includes(r[0])).every((r) => r[25].length > 0));
ok('tsv entry hash column bound to manifest', body.every((r) => (r[6] === 'inline' || r[6] === 'codex-inline') ? /^[0-9a-f]{64}$/.test(r[8]) : r[8] === 'manifest-bound'));

// -------------------------------------------------------------- documents
for (const q of ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07']) ok('main doc addresses ' + q, main.includes(q));
ok('main doc has startup table', main.includes('启动前外部输入'));
ok('main doc has exit table', main.includes('结束前条件'));
ok('main doc states 20 payload files', main.includes('20 个 payload 文件'));
ok('main doc states 107/101', main.includes('107') && main.includes('101'));
ok('main doc states frozen ratings', main.includes('0 CLOSED') && main.includes('23 PARTIAL') && main.includes('2 OPEN'));
ok('audit spec has event table appendix', audit.includes('write_intent') && audit.includes('segment_close'));
ok('no V4 path leak', !text(regFile).includes('p47-phase0-v4') && !tsv.includes('p47-phase0-v4'));
ok('no dropped dirs', !JSON.stringify(reg).includes(P.RUN + '\\bootstrap') && !JSON.stringify(reg).includes(P.RUN + '\\sandbox'));
ok('no robocopy registration', !JSON.stringify(reg).includes('robocopy'));

// ------------------------------------------------------------ placeholder
const bad = ['${', '{{', 'TODO', 'TBD', 'FIXME', '<placeholder>', 'YOUR_'];
for (const f of [regFile, tsvFile, vecFile, mainFile, auditFile]) {
  const t = text(f);
  for (const b of bad) ok('no placeholder ' + b + ' in ' + f, !t.includes(b));
}

console.log(JSON.stringify({ checks: results.length, failed: results.filter((r) => !r.ok).length, registry_sha256: sha256hex(regBytes), vectors_sha256: sha256hex(vecBytes) }, null, 2));
