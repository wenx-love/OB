'use strict';
// OB-Recover Phase 4.7 / Phase 0 V9 - contract generator.
// Generates registry, whitelist TSV, audit vectors, documents; runs in-memory invariants;
// then publishes through the journaled transaction in p0v9-publish.cjs.
// It never executes C00-C20 and never touches D:\P47RUN or D:\P47TOOLS.
const fs = require('fs');
const path = require('path');
const L = require('./p0v9-lib.cjs');
const S = require('./p0v9-spec.cjs');
const A = require('./p0v9-audit.cjs');
const F = require('./p0v9-flow.cjs');
const PB = require('./p0v9-publish.cjs');
const { P, ID, TOOLS, src, stg, canon, sha256utf8, sha256hex } = L;

const DIR = __dirname;
const ROOT = fs.existsSync(path.join(DIR, 'PHASE4.7-PHASE0-START-CONDITIONS-V9.md')) ? DIR : path.dirname(DIR); // V9\
const DOC = fs.existsSync(path.join(DIR, 'doc-src')) ? path.join(DIR, 'doc-src') : path.join(DIR, 'work', 'doc-src');
const FILES = {
  vectors: 'PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json',
  registry: 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json',
  tsv: 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V9.tsv',
  main: 'PHASE4.7-PHASE0-START-CONDITIONS-V9.md',
  audit: 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md',
  failure: 'PHASE4.7-PHASE0-V9-FAILURE-MODEL.md',
  publish: 'PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md',
  changelog: 'PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md',
  trace: 'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',
  traceF: 'PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md',
  open: 'PHASE4.7-PHASE0-V9-OPEN-ISSUES.md',
  self: 'PHASE4.7-PHASE0-V9-SELF-CHECK.md',
  runtime: 'PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md',
  manifest: 'PHASE4.7-PHASE0-V9-DELIVERY-MANIFEST.md',
};
const GEN = '<!-- GENERATED:BEGIN (p0v9-build.cjs) -->';
const GEN_END = '<!-- GENERATED:END -->';
const FAIL_CLASS = ['pre-run', 'bootstrap', 'fatal', 'gate', 'seal'];

const errors = [];
const checks = [];
const ck = (name, cond, detail) => { checks.push({ name, ok: !!cond, detail: detail || '' }); if (!cond) errors.push(name + (detail ? ' :: ' + detail : '')); };

// ------------------------------------------------------------------ vectors
// Generated AFTER normalisation so preload fixtures can bind the real registered
// guard/product policy identities (F07). Vectors do not embed the registry hash.

// ------------------------------------------------------------- normalisation
const orderB = new Map(S.PLAN_BOUND.map((id, i) => [id, i + 1]));
const orderU = new Map(S.PLAN_UNBOUND.map((id, i) => [id, i + 1]));
const EXECS = S.EXECS.slice().sort((a, b) => orderB.get(a.id) - orderB.get(b.id));

const WRITE_OP = {
  FC: 'file-create', FW: 'file-write', FA: 'file-append', DC: 'dir-create', DCA: 'dir-create-if-absent',
  TC: 'subtree-create', TW: 'subtree-write', ACL: 'acl-set-recursive', ML: 'map-listed-file-write',
  ICON: 'icon-create-if-absent', EC: 'env-bound-subtree-create', AP: 'audit-part-create-append',
};
function writeKind(code) {
  if (code === 'ML') return 'map-list';
  if (['TC', 'TW', 'ACL', 'EC', 'AP'].includes(code)) return 'subtree';
  if (['DC', 'DCA'].includes(code)) return 'dir';
  return 'file';
}
const readEntry = (x, optional) => ({ path: x.path, kind: x.scope === 'subtree' ? 'subtree' : x.scope === 'metadata' ? 'metadata' : 'file', optional: !!optional });
const writeEntry = (o) => ({ path: o.path, op: WRITE_OP[o.code], kind: writeKind(o.code), note: o.note || null });
const entryCovers = (e, p) => {
  if (L.isToken(e.path) || L.isToken(p)) return L.pathEq(e.path, p);
  if (L.pathEq(e.path, p)) return true;
  if (e.kind === 'subtree') return L.pathUnder(p, e.path);
  return false;
};
const coveredBy = (list, p) => list.some((e) => entryCovers(e, p));
const TOKEN = (p) => L.isToken(p) || p === 'console';

const ALL_STAGED = Object.keys(TOOLS).filter((k) => TOOLS[k].staged).map((k) => stg(k));
const DENY_CANDIDATES = [
  { label: 'ORIGINAL', p: P.ORIGINAL }, { label: 'M0', p: P.M0 }, { label: 'SNAP', p: P.SNAP },
  { label: 'PRISTINE', p: P.CP }, { label: 'NO_PLUGIN', p: P.CN }, { label: 'SANDBOX', p: P.CS },
  { label: 'EVIDENCE', p: P.EVIDENCE }, { label: 'TRUST', p: P.TRUST }, { label: 'REVIEW', p: P.REVIEW },
  { label: 'CONTROLS', p: P.CONTROLS }, { label: 'AUDIT', p: P.AUDIT }, { label: 'TMP', p: P.TMP },
  { label: 'TERMINAL_SEAL', p: P.TSEAL }, { label: 'CHAIN', p: P.CHAIN },
  { label: 'BINDING_FILE', p: P.BINDING_FILE },
];
function denyFor(reads, writes) {
  const out = [];
  const wl = writes.map((w) => ({ path: w.path, kind: w.kind }));
  for (const c of DENY_CANDIDATES) {
    if (coveredBy(reads, c.p)) continue;
    if (coveredBy(wl, c.p)) continue;
    out.push(c.p);
  }
  for (const f of ALL_STAGED) if (!coveredBy(reads, f)) out.push(f);
  return out;
}

const PROTECT_BASE = [P.ORIGINAL, P.M0, P.CHAIN, P.TSEAL, P.STAGED, P.RUN_PARENT];
const contentWrite = (w) => w.op !== 'acl-set-recursive';

const chainOrderB = S.PLAN_BOUND.filter((id) => ['genesis', 'participant'].includes(S.EXEC(id).chain));
const chainOrderU = S.PLAN_UNBOUND.filter((id) => ['genesis', 'participant'].includes(S.EXEC(id).chain));
const chainPredB = new Map(chainOrderB.map((id, i) => [id, i === 0 ? null : chainOrderB[i - 1]]));
const chainPredU = new Map(chainOrderU.map((id, i) => [id, i === 0 ? null : chainOrderU[i - 1]]));

for (const e of EXECS) {
  e.order_bound = orderB.get(e.id);
  e.order_unbound = orderU.get(e.id) || null;
  e.predecessor_bound = e.order_bound > 1 ? S.PLAN_BOUND[e.order_bound - 2] : null;
  e.predecessor_unbound = e.order_unbound && e.order_unbound > 1 ? S.PLAN_UNBOUND[e.order_unbound - 2] : null;
  e.entry_path = e.entry === 'inline' || e.entry === 'codex-inline' ? 'inline'
    : (e.entry === 'staged-dispatcher' ? stg('dispatch') : src('dispatch'));
  e.tool_files = e.tools.map((id) => ({ id, path: (e.entry === 'staged-dispatcher' ? stg(id) : src(id)), role: TOOLS[id].role, sha256: null, sha_source: 'RELEASE-MANIFEST.json' }));
  const loadIds = (e.load && e.load.length ? e.load : e.tools.slice(0, 1)).filter((id) => id !== 'dispatch');
  e.load_files = loadIds.map((id) => (e.entry === 'staged-dispatcher' ? stg(id) : src(id)));

  const optionalPaths = new Set((e.optional_reads || []).map((x) => x.path));
  e.business_reads = [...e.inputs.map((x) => readEntry(x, optionalPaths.has(x.path))),
    ...e.load_files.map((p) => ({ path: p, kind: 'file', optional: false, note: 'process entry/guard/audit loaded at start' }))]
    .filter((r, i, a) => a.findIndex((x) => L.pathEq(x.path, r.path)) === i);
  e.metadata_reads = e.metadata.slice();
  e.business_writes = e.outputs.filter((o) => o.code !== 'CONSOLE').map(writeEntry);
  e.dispatcher_reads = (e.entry === 'inline' || e.entry === 'codex-inline') ? [] : [
    { path: P.MANIFEST, kind: 'file', note: 'approved manifest' },
    { path: e.entry_path, kind: 'file', note: 'actual entry bytes loaded by this execution; hash rechecked before spawn' },
    ...e.load_files.map((p) => ({ path: p, kind: 'file', note: 'load_files entry; hashed before load from the same root as the entry' })),
    { path: P.NODE, kind: 'file', note: 'node.exe hashed before spawn' },
    ...e.tool_files.map((t) => ({ path: t.path, kind: 'file', note: 'tool bytes hashed before load' })),
  ].filter((r, i, a) => a.findIndex((x) => L.pathEq(x.path, r.path)) === i);
  e.dispatcher_writes = [];
  e.control_reads = [];
  e.control_writes = [];
  e.audit_part_rule = null;

  if (e.chain === 'genesis' || e.chain === 'participant') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail check / append under exclusive open' },
      { path: S.audDir(e.cmd, e.id), kind: 'subtree', note: 'own segment parts and summary; control never reads business data' }];
    const chainCreate = e.chain === 'genesis' ? [{ path: P.CHAIN, op: 'file-create', kind: 'file', note: 'genesis CreateNew' }] : [];
    e.control_writes = [
      ...chainCreate,
      { path: P.CHAIN, op: 'file-append', kind: 'file', note: 'segment_open / segment_close / segment_skip' },
      { path: S.audRoot(e.cmd), op: 'dir-create-if-absent', kind: 'dir', note: 'intermediate audit parent' },
      { path: S.audDir(e.cmd, e.id), op: 'dir-create', kind: 'dir', note: 'segment dir; must not exist' },
      { path: S.audDir(e.cmd, e.id) + '\\summary.json', op: 'file-create', kind: 'file', note: 'CreateNew by seal' },
    ];
    if (e.chain === 'genesis') {
      // N04: the genesis execution owns its own AUDIT\C01 parent, exactly like a normal participant.
      e.control_writes.splice(2, 0, { path: S.audRoot('C01'), op: 'dir-create-if-absent', kind: 'dir', note: 'N04: AUDIT\\C01 for the genesis segment' });
      e.bootstrap = {
        ops: [
          { op: 'mkdir', path: P.RUN_PARENT, exists_ok: true },
          { op: 'mkdir', path: P.RUN, exists_ok: false },
          { op: 'mkdir', path: P.OUT, exists_ok: false },
          { op: 'mkdir', path: P.AUDIT, exists_ok: false },
          { op: 'mkdir', path: P.TMP, exists_ok: false },
          { op: 'create', path: P.CHAIN, exists_ok: false },
        ],
      };
    }
    e.audit_part_rule = {
      dir: S.audDir(e.cmd, e.id), pattern: 'events-<role>-<pid>-<rand8>.jsonl', op: 'create-and-append',
      roles: e.cmd === 'C03' && e.variant === 'OBS' ? ['dispatcher', 'observer']
        : (e.product ? ['dispatcher', 'tool', 'product'] : ['dispatcher', 'tool']),
    };
  } else if (e.chain === 'terminal') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail read only; no append' },
      { path: P.AUDIT, kind: 'subtree', note: 'all summaries and parts for the seal' },
      { path: P.OUT, kind: 'subtree', note: 'output tree hash listing' },
      { path: P.EVIDENCE, kind: 'subtree' }, { path: P.TRUST, kind: 'subtree' }, { path: P.REVIEW, kind: 'subtree' },
      { path: P.BINDING_FILE, kind: 'file', optional: true, note: 're-hash if present; the chain record is authoritative' }];
    e.control_writes = [{ path: P.TSEAL, op: 'file-create', kind: 'file', note: 'CreateNew; last write' }];
    e.business_reads = [readEntry({ path: P.MANIFEST, scope: 'file' }), readEntry({ path: P.STAGED, scope: 'subtree' }),
      readEntry({ path: P.BINDING_FILE, scope: 'file' }, true)];
  }

  e.deny_read = denyFor(e.business_reads, e.business_writes);
  e.protect_write = PROTECT_BASE.filter((p) => {
    const pe = { path: p, kind: 'subtree' };
    return !e.business_writes.filter(contentWrite).some((w) => L.entriesIntersect(w, pe)) &&
      !e.control_writes.filter(contentWrite).some((w) => L.entriesIntersect(w, pe));
  });

  if (e.product) {
    const ownOut = S.outDir(e.cmd, e.id);
    const pReads = [readEntry({ path: e.product.copy, scope: 'subtree' }), readEntry({ path: ownOut, scope: 'subtree' })];
    for (const id of ['guard', 'audit']) {
      if (e.tool_files.some((t) => t.id === id)) pReads.push({ path: (e.entry === 'staged-dispatcher' ? stg(id) : src(id)), kind: 'file', note: 'preload module read by the product child' });
    }
    const pWrites = [];
    for (const f of e.product.productFiles || []) pWrites.push({ path: ownOut + '\\' + f, op: 'file-create', kind: 'file' });
    for (const w of e.business_writes) {
      if (L.pathAtOrUnder(w.path, e.product.copy)) pWrites.push(w);
    }
    const seo = e.cmd === 'C12' || e.cmd === 'C16';
    const protect = [P.ORIGINAL, P.M0, P.CHAIN, P.TSEAL, P.SNAP];
    if (!seo) protect.push(e.product.copy + '\\dist');
    e.product = {
      copy: e.product.copy, config: e.product.config, cwd: e.cwd,
      argv: e.target_argv || null, argv_sha256: e.target_argv ? L.argvSha(e.target_argv) : null,
      env: e.product_env || { TEMP: e.product.copy + '\\tmp', TMP: e.product.copy + '\\tmp' },
      preload: ['fs-guard.cjs', 'p0-audit.cjs'],
      reads: pReads, writes: pWrites, deny_read: denyFor(pReads, pWrites),
      audit_part_rule: { dir: S.audDir(e.cmd, e.id), pattern: 'events-product-<pid>-<rand8>.jsonl', op: 'create-and-append', roles: ['product'] },
      protect_write: protect,
      dist_policy: seo ? 'exclusive allow: only the six static targets and the three conditional icons; no dist subtree protection is issued' : 'dist subtree is protected',
      policy_sha256: sha256utf8(canon({ deny: denyFor(pReads, pWrites), read: pReads.map((r) => [r.path, r.kind]), write: pWrites.map((w) => [w.path, w.op]), protect })),
    };
    if (seo && !e.business_writes.some((w) => L.pathEq(w.path, e.product.copy + '\\dist'))) {
      e.business_writes.push({ path: e.product.copy + '\\dist', op: 'dir-create-if-absent', kind: 'dir', note: 'dist root if absent' });
    }
  }
  if (e.guard) {
    const iconEnv = {};
    if (e.cmd === 'C12' || e.cmd === 'C16') for (const n of ['16', '48', '128']) iconEnv['P0_ICON' + n + '_PRESENT'] = 'from initial manifest';
    e.guard = {
      deny_read: e.deny_read, read_allow: e.business_reads, write_allow: e.business_writes,
      audit_part_rule: e.audit_part_rule, protect_write: e.protect_write, icon_env: iconEnv,
      map_expansion: e.cmd === 'C14' ? 'p0-neutralize.cjs expands the approved map to exact file paths before any write; the map-list entry is never a subtree permit' : null,
      policy_sha256: sha256utf8(canon({
        deny: e.deny_read, read: e.business_reads.map((r) => [r.path, r.kind]),
        write: e.business_writes.map((w) => [w.path, w.op]), parts: e.audit_part_rule, protect: e.protect_write,
      })),
    };
  }
}

// ------------------------------------------------------------------ invariants
for (const e of EXECS) {
  for (const r of e.business_reads) for (const d of e.deny_read) {
    if (L.entriesIntersect(r, { path: d, kind: 'subtree' })) errors.push(e.id + ' read/deny intersect: ' + r.path + ' <-> ' + d);
  }
  if (e.product) for (const r of e.product.reads) for (const d of e.product.deny_read) {
    if (L.entriesIntersect(r, { path: d, kind: 'subtree' })) errors.push(e.id + ' product read/deny intersect: ' + r.path + ' <-> ' + d);
  }
  for (const x of e.inputs) if (e.chain !== 'terminal' && !TOKEN(x.path) && !coveredBy(e.business_reads, x.path)) errors.push(e.id + ' input not readable: ' + x.path);
  for (const o of e.outputs) {
    if (o.code === 'CONSOLE' || TOKEN(o.path)) continue;
    if (!coveredBy(e.business_writes, o.path) && !coveredBy(e.control_writes, o.path)) errors.push(e.id + ' output not writable: ' + o.path);
  }
  // temp policy: a redirected TEMP must be readable and writable in the same layer
  if (e.temp && e.temp.mode === 'redirected') {
    if (!coveredBy(e.business_reads, e.temp.path)) errors.push(e.id + ' TEMP not readable: ' + e.temp.path);
    if (!coveredBy(e.business_writes, e.temp.path)) errors.push(e.id + ' TEMP not writable: ' + e.temp.path);
    if (e.env.TEMP && e.env.TEMP !== e.temp.path) errors.push(e.id + ' TEMP env differs from temp policy');
    if (e.env.TMP && e.env.TMP !== e.temp.path) errors.push(e.id + ' TMP env differs from temp policy');
  }
  if (e.product && e.product.env) {
    if (!coveredBy(e.product.reads, e.product.env.TEMP)) errors.push(e.id + ' product TEMP not readable: ' + e.product.env.TEMP);
    if (!coveredBy(e.product.writes, e.product.env.TEMP)) errors.push(e.id + ' product TEMP not writable: ' + e.product.env.TEMP);
  }
  // requirement references and ordering
  for (const r of e.requires) {
    if (!S.EXEC(r.exec)) errors.push(e.id + ' requirement references unknown exec ' + r.exec);
    if (!['ok', 'terminal', 'recorded', 'settled'].includes(r.state)) errors.push(e.id + ' bad requirement state ' + r.state);
    if (orderB.get(r.exec) >= orderB.get(e.id)) errors.push(e.id + ' requirement does not point backwards: ' + r.exec);
  }
  // protection must not conflict with a content write
  for (const p of e.protect_write) for (const w of e.business_writes.filter(contentWrite)) {
    if (L.entriesIntersect(w, { path: p, kind: 'subtree' })) errors.push(e.id + ' write/protect intersect: ' + w.path + ' <-> ' + p);
  }
  for (const m of e.failure_modes) {
    if (m.class === 'security' && !S.TRIGGER_SET.has(m.trigger)) errors.push(e.id + ' bad trigger ' + m.trigger);
    if (m.class !== 'security' && m.trigger !== null) errors.push(e.id + ' non-security mode has a trigger');
  }
}

// audit-parent directory coverage (N04): both genesis and participant
for (const e of EXECS.filter((x) => x.chain === 'genesis' || x.chain === 'participant')) {
  const parent = S.audRoot(e.cmd);
  const child = S.audDir(e.cmd, e.id);
  ck('audit parent create ' + e.id, e.control_writes.some((w) => L.pathEq(w.path, parent) && w.op === 'dir-create-if-absent'));
  ck('audit segment create ' + e.id, e.control_writes.some((w) => L.pathEq(w.path, child) && w.op === 'dir-create'));
  ck('own segment readable ' + e.id, e.control_reads.some((r) => L.pathEq(r.path, child) && r.kind === 'subtree'));
}

// every created directory must have an existing/created parent earlier in the plan
const seeded = new Set([P.RUN_PARENT.toLowerCase(), P.ORIGINAL.toLowerCase(), P.SRC.toLowerCase(), L.w('D:/').toLowerCase(), P.HOME.toLowerCase()]);
for (const id of S.PLAN_BOUND) {
  const e = S.EXEC(id);
  for (const w of e.business_writes.concat(e.control_writes)) {
    if (['dir-create', 'dir-create-if-absent', 'subtree-create', 'env-bound-subtree-create'].includes(w.op) && !L.isToken(w.path)) {
      const par = w.path.slice(0, w.path.lastIndexOf('\\'));
      if (!seeded.has(par.toLowerCase()) && !L.pathEq(par, L.w('D:'))) errors.push(e.id + ' dir without existing parent: ' + w.path + ' (parent ' + par + ')');
      seeded.add(w.path.toLowerCase());
    }
  }
}

// single binding path (N10)
const bindingRefs = [];
for (const e of EXECS) {
  for (const r of e.business_reads.concat(e.control_reads, e.dispatcher_reads)) if (/c18-binding\.json/i.test(r.path)) bindingRefs.push([e.id, r.path]);
  for (const w of e.business_writes.concat(e.control_writes)) if (/c18-binding\.json/i.test(w.path)) bindingRefs.push([e.id, w.path]);
  for (const o of e.outputs) if (/c18-binding\.json/i.test(o.path)) bindingRefs.push([e.id, o.path]);
}
ck('binding path single definition', bindingRefs.every(([, p]) => L.pathEq(p, P.BINDING_FILE)), bindingRefs.map((x) => x.join(':')).join(','));
for (const id of ['C18-E01', 'C19-E01', 'C20-REPORT-E01', 'C20-SEAL-E01']) {
  ck('binding reader ' + id, S.EXEC(id).inputs.some((x) => L.pathEq(x.path, P.BINDING_FILE)));
}
ck('C18 no live env', !('P0_SECOND_ARCHIVE' in S.EXEC('C18-E01').env));

// 9 product runners must carry RUN\tmp read+write (N05)
for (const id of ['C10-P-E01', 'C10-N-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C10-S-E01', 'C14-E01', 'C15-E01', 'C16-E01']) {
  const e = S.EXEC(id);
  ck('runner temp write ' + id, coveredBy(e.business_writes, P.TMP));
  ck('runner temp read ' + id, coveredBy(e.business_reads, P.TMP));
}

// failure matrix (generator side)
const MATRIX = F.matrix();
const matrixDigest = sha256utf8(canon(MATRIX));
const matrixModes = {};
for (const r of MATRIX) matrixModes[r.seal_mode] = (matrixModes[r.seal_mode] || 0) + 1;
const c10p = F.simulate(S.PLAN_BOUND, { fail: 'C10-P-E01', failClass: 'gate' });
ck('C10-P gate skips exactly 24', c10p.skipped === 24, String(c10p.skipped));
ck('C10-P own after still runs', c10p.states['C07-A-C10-P-E01'] === 'ok', JSON.stringify(c10p.states['C07-A-C10-P-E01']));
ck('report path survives gate failure', ['C17-E01', 'C19-E01', 'C20-REPORT-E01', 'C20-SEAL-E01'].every((id) => c10p.states[id] === 'ok'));
const lateSec = F.simulate(S.PLAN_BOUND, { fail: 'C12-E01', failClass: 'security' });
ck('late security with complete staging seals aborted', lateSec.staged_state === 'complete' && lateSec.seal_mode === 'aborted', lateSec.seal_mode);
const earlyFatal = F.simulate(S.PLAN_BOUND, { fail: 'C04-E01', failClass: 'fatal' });
ck('early fatal seals degraded-prefix', earlyFatal.seal_mode === 'degraded-prefix', earlyFatal.seal_mode);
const orphan = F.simulate(S.PLAN_BOUND, { orphan: 'C10-N-E01' });
ck('orphan tail seals aborted', orphan.seal_mode === 'aborted' && orphan.states['C07-A-C10-N-E01'] === 'skipped');
ck('plan records 109/103', F.simulate(S.PLAN_BOUND, {}).records === 109 && F.simulate(S.PLAN_UNBOUND, { binding: 'unbound' }).records === 103);

// generated gate text for executions that had no hand-written gate
for (const e of EXECS) {
  if (!e.gate) {
    e.gate = e.requires.length
      ? 'requires ' + e.requires.map((r) => r.state + ':' + r.exec).join('; ') + (e.preconditions ? '; ' + e.preconditions.join('; ') : '')
      : (e.preconditions ? e.preconditions.join('; ') : 'no additional precondition');
  }
}


// F01—F14 generator-side assertions
for (const row of MATRIX) {
  if (row.seal_mode === 'no-chain') ck('no-chain records 0 ' + row.scenario, row.records === 0, String(row.records));
  if (row.seal_mode === 'sealed-full' && row.exit === 'complete') ck('complete clean ' + row.scenario, row.failed === 0 && row.skipped === 0 && row.not_started === 0);
}
ck('matrix rows 340', MATRIX.length === 340, String(MATRIX.length));
const failLvl = (cls) => cls === 'security' ? 3 : cls === 'fatal' ? 2 : 1;
for (const row of MATRIX) {
  const levels = [row.fail ? failLvl(row.fail_class) : 0, row.fail2 ? failLvl(row.fail2_class) : 0];
  const rank = { none: 0, continue: 1, 'halt-business': 2, 'halt-all': 3 }[row.stop];
  ck('stop monotonic ' + row.scenario, rank >= Math.max(...levels), row.stop);
}
for (const e of EXECS) for (const m of e.failure_modes) {
  ck('exact trigger ' + e.id + ' ' + m.code, m.class === 'security' ? S.SEC_TRIGGER_BY_REASON[m.reason] === m.trigger : S.SEC_TRIGGER_BY_REASON[m.reason] === undefined);
}
ck('C07 original is security', S.EXEC('C07-B-C08-E01').failure_modes.some((m) => m.trigger === 'SEC-ORIGINAL-CHANGED' && m.class === 'security'));
for (const e of EXECS) {
  if (e.entry !== 'staged-dispatcher' && e.entry !== 'source-dispatcher') continue;
  const root = e.entry === 'staged-dispatcher' ? stg('dispatch') : src('dispatch');
  ck('load root ' + e.id, e.load_files.every((p) => p.toLowerCase().startsWith((e.entry === 'staged-dispatcher' ? P.STAGED : P.SRC).toLowerCase())));
}
for (const e of EXECS) {
  for (const r of e.business_reads) {
    if (!r.optional) continue;
    ck('optional producer ' + e.id + ' ' + r.path, true);
  }
}
ck('F trace document present', fs.existsSync(path.join(DOC, 'PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md')));
ck('doc-src count 10', fs.readdirSync(DOC).filter((x) => x.endsWith('.md')).length === 10, String(fs.readdirSync(DOC).filter((x) => x.endsWith('.md')).length));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// ---------------------------------------------------------------- failure matrix doc data
const policyMap = Object.fromEntries(EXECS.map((e) => [e.id, {
  guard: e.guard ? e.guard.policy_sha256 : null,
  product: e.product ? e.product.policy_sha256 : null,
}]));
const vectors = A.buildVectors(policyMap);
const vectorsBytes = Buffer.from(canon(vectors), 'utf8');
const vectorsSha = sha256hex(vectorsBytes);
const preload = vectors.parts.find((p) => p.name.includes('C10P'));
if (preload) {
  const list = JSON.parse(preload.canonical);
  const pl = list.find((x) => x.kind === 'preload');
  ck('preload policy identity', !!pl && pl.policy_sha256 === policyMap['C10-P-E01'].product, pl && pl.policy_sha256);
}

const SEAL_RULES = [
  ['chain-broken', 'chain tail/prev/digest cannot be verified, or C19 fails a chain-integrity check', 'no terminal-seal.json is written; operator records chain-broken'],
  ['no-chain', 'C01 did not close ok; genesis or the chain file is absent', 'launch record only; no chain records, no seal'],
  ['seal-failed', 'C20-SEAL itself fails or refuses', 'no retry; console + launch record; partial seal is not authoritative'],
  ['degraded-prefix', 'staged_state=incomplete|absent and the chain is intact', 'seal lists the actual prefix, missing items and open segments; no full recheck claim'],
  ['aborted', 'staged_state=complete and the run halted at a recorded abort point', 'seal lists abort exec, failure class/trigger, open segments, skipped/not-started'],
  ['sealed-full', 'staged_state=complete and the run reached the terminal plan end', 'full staged recheck; exit_status=complete only when no failed/skipped exec, C18 bound'],
];

const DIRECTORY_ROWS = (() => {
  const paths = [
    [P.RUN_PARENT, 'C01 bootstrap', 'phase0 lifetime'], [P.RUN, 'C01 bootstrap', 'phase0 lifetime'],
    [P.OUT, 'C01 bootstrap', 'phase0 evidence'], [P.AUDIT, 'C01 bootstrap', 'phase0 evidence'],
    [P.TMP, 'C01 bootstrap', 'run lifetime'],
    [P.STAGED, 'C01 bootstrap', 'immutable after C04'], [P.CONTROLS, 'C01 bootstrap', 'run lifetime'],
    [P.ACLPROBE, 'C01 bootstrap', 'immutable after C03'], [P.BASELINE, 'C01 bootstrap', 'immutable after M0'],
    [P.SNAP, 'C08', 'immutable after C08'], [P.CP, 'C09', 'immutable except declared product writes'],
    [P.CN, 'C09', 'immutable except declared product writes'], [P.CS, 'C09', 'immutable except declared product writes'],
    [P.EVIDENCE, 'C01 bootstrap', 'phase0 evidence'], [P.TRUST, 'C01 bootstrap', 'phase0 evidence'],
    [P.REVIEW, 'C01 bootstrap', 'phase0 evidence'], [P.BINDING_DIR, 'C18-BIND', 'immutable after BIND'],
  ];
  return paths.map(([p, creator, life]) => {
    const creators = EXECS.filter((e) => e.business_writes.concat(e.control_writes).some((w) => L.pathEq(w.path, p) && /dir-create|subtree-create/.test(w.op))).map((e) => e.id);
    const readsAt = (e) => e.business_reads.concat(e.control_reads).filter((r) => L.pathEq(r.path, p));
    const writesAt = (e) => e.business_writes.concat(e.control_writes).filter((w) => L.pathEq(w.path, p));
    const readers = EXECS.filter((e) => readsAt(e).length).map((e) => e.id);
    const writers = EXECS.filter((e) => writesAt(e).length).map((e) => e.id);
    const fmt = (ids) => ids.length === 0 ? '0' : ids.length <= 6 ? ids.join(',') : ids.slice(0, 3).join(',') + ' ... (' + ids.length + ' total)';
    return [p, creator, creators.join(',') || creator, fmt(readers), fmt(writers), life];
  });
})();

const TEMP_ROWS = EXECS.filter((e) => e.temp && e.temp.mode !== 'forbidden').map((e) => [
  e.id, e.temp.mode, e.temp.path || '-', e.temp.mode === 'redirected' ? 'read+write' : 'none',
  e.product && e.product.env ? e.product.env.TEMP : '-',
]);

// ---------------------------------------------------------------- registry
const participants = EXECS.filter((e) => e.chain === 'participant' || e.chain === 'genesis');
const c18 = EXECS.filter((e) => e.id.includes('C18') && e.id !== 'C18-BIND-E01');
const counts = {
  commands: new Set(EXECS.map((e) => e.cmd)).size,
  executions: EXECS.length,
  chain_participants: participants.length,
  chain_records_bound: 1 + 2 * participants.length,
  chain_records_unbound: 1 + 2 * (participants.length - c18.length),
  c18_executions: c18.length,
  non_chain_executions: EXECS.filter((e) => e.chain === 'none').length,
  terminal_executions: EXECS.filter((e) => e.chain === 'terminal').length,
  payload_files: Object.keys(TOOLS).length,
  staged_files: Object.keys(TOOLS).filter((k) => TOOLS[k].staged).length,
  bootstrap_files: Object.keys(TOOLS).filter((k) => !TOOLS[k].staged).length,
  plan_bound: S.PLAN_BOUND.length,
  plan_unbound: S.PLAN_UNBOUND.length,
  failure_matrix_rows: MATRIX.length,
  negatives: vectors.negative.length,
  positive_vectors: vectors.valid.length + vectors.events.length + Object.values(vectors.chains).reduce((n, a) => n + a.length, 0) + vectors.summaries.length + vectors.seals.length,
};

const commands = [...new Set(EXECS.map((e) => e.cmd))].sort().map((cmd) => {
  const es = EXECS.filter((e) => e.cmd === cmd);
  return { id: cmd, step: es[0].step, exec_ids: es.map((e) => e.id), variants: [...new Set(es.map((e) => e.variant).filter(Boolean))], count: es.length };
});

const registry = {
  schema: 'p47-phase0-command-registry-v9',
  generated_by: 'p0v9-build.cjs (contract generator; never executes C00-C20)',
  run_id: P.RUN_ID, run: P.RUN, run_parent: P.RUN_PARENT, original: P.ORIGINAL,
  release: {
    release_id: 'p47-phase0-v9', manifest_schema: 'p47-phase0-tool-release-v4',
    source_root: P.SRC, approved_manifest_path: P.MANIFEST, staged_root: P.STAGED,
    bootstrap_root: P.SRC + '\\payload\\bootstrap',
    mapping: { from: 'payload/tools/<rel>', to: P.STAGED + '\\<rel>' },
    manifest_not_staged: true, bootstrap_not_staged: true,
    manifest_sha256_env: 'P0_TOOLSRC_MANIFEST_SHA256',
    payload_files: counts.payload_files, staged_files: counts.staged_files, bootstrap_files: counts.bootstrap_files,
    mapping_table: Object.keys(TOOLS).map((k) => ({ id: k, role: TOOLS[k].role, source: P.SRC + '\\' + L.w(TOOLS[k].rel), staged: TOOLS[k].staged ? stg(k) : null })),
  },
  identity: {
    admin_account: ID.admin_account, admin_sid: ID.admin_sid,
    admin_sid_source: 'local read-only resolution; user confirmation required before C00/C02',
    system_sid: ID.system_sid, codex_group: ID.codex_group, codex_accounts: ID.codex_accounts,
    codex_account_env: 'P0_CODEX_ACCOUNT', admin_sid_env: 'P0_ADMIN_ACCOUNT_SID',
    no_group_sid_substitution: true, codex_write_allowed: false, codex_chain_access: false,
  },
  executables: S.RUNTIME,
  control_config: {
    virtual_names: ['p0-probe.vite.config.mjs (C10-P/N/S)', 'control.vite.config.mjs (C13)'],
    bytes: 325, sha256: L.CONTROL_SHA, lines: 8, eol: 'LF', trailing_eol: false, bom: false, location: 'copy root only',
  },
  path_policy: {
    component_wise: true, no_string_prefix_match: true, denied_read_absolute: true,
    read_allow_may_read_protected_write: true, write_allow_is_exclusive: true, wildcards: 'forbidden',
    reparse_or_ancestor_reparse: 'deny and stop',
    unlisted_read: 'content read and listing denied and recorded; a successful read of a deny root is fatal',
    layering: ['trusted_load (dispatcher): exact manifest, dispatcher, dependencies, tool bytes and node.exe; hashed before load',
      'business: exact data inputs + exact process-entry/guard/audit files listed in load_files; no tool directory read',
      'control (p0-audit.cjs): chain tail/append + own segment parts/summary; never business data',
      'product (runner child): copy subtree + own OUT dir; exclusive write list'],
    overlap_rule: 'a path may appear in at most one of read_allow and deny_read for the same layer; checked in both directions',
    acl_exception: 'acl-set-recursive is a metadata write; it may traverse protected paths but must not change content and must be verified by SDDL readback (C02 only)',
  },
  cache_policy: {
    runner_temp: 'RUN\\tmp', product_temp: 'COPY\\tmp',
    vite: 'COPY\\node_modules\\.vite', vite_temp: 'COPY\\node_modules\\.vite-temp',
    root_dot_vite_forbidden: true,
  },
  temp_policy: {
    rule: 'a redirected TEMP/TMP must be covered by a read and a write entry of the same layer; forbidden means no temp write is permitted; inherited is disclosed as out-of-contract',
    rows: TEMP_ROWS,
  },
  binding: {
    path: P.BINDING_FILE, dir: P.BINDING_DIR,
    producers: ['C18-BIND-E01'],
    readers: { 'C18-E01': 'reads the destination and verifies the file hash against segment_open', 'C19-E01': 'records the file hash in index.json', 'C20-REPORT-E01': 'consumes the chain record; re-hashes the file if present', 'C20-SEAL-E01': 'verifies the file hash against segment_open if present' },
    optional_read: true,
    no_live_env_after_bind: true,
  },
  trust: {
    anchors: [
      { id: 'H1', what: 'V9 contract files', who: 'user approval record', when: 'before C00' },
      { id: 'H2', what: 'powershell.exe and node.exe bytes', who: 'admin read-only check; C00 rechecks', when: 'before C00' },
      { id: 'H3', what: 'inline command text of C00-E01 and C03-PROBE-E01', who: 'operator compares observed hash', when: 'before launch' },
      { id: 'H4', what: 'P0_ADMIN_ACCOUNT_SID, P0_CODEX_ACCOUNT, P0_TOOLSRC_MANIFEST_SHA256, RUN_ID, quiet window', who: 'launch approval record', when: 'before C00' },
      { id: 'H5', what: 'RELEASE-MANIFEST.json bytes', who: 'user-approved SHA-256', when: 'before C00; rechecked by C00, C05-PRE, C05-FINAL, C20-SEAL' },
    ],
    staged_first_use: 'C05-FINAL uses the source dispatcher and verifies the staged tree; C06 first executes the staged dispatcher',
    c00_role: 'fail-fast gate, not a trust root; H3 is external',
    load_stability: 'dispatcher hashes each tool from a handle opened with FileShare.Read (deny write/delete), keeps the handle open until the child is created, and rechecks after exit; the residual verify-to-map window is UNVERIFIED and depends on the C02 ACL',
    manifest_hash_source: 'all tool hashes are null and MUST come from the approved RELEASE-MANIFEST.json',
  },
  audit: {
    spec: FILES.audit, vectors: FILES.vectors, vectors_sha256: vectorsSha, vectors_bytes: vectorsBytes.length,
    event_schema: A.AUDIT.schema_event, chain_schema: A.AUDIT.schema_chain, summary_schema: A.AUDIT.schema_summary,
    seal_schema: A.AUDIT.schema_seal, canonicalization: A.AUDIT.canon, hash: A.AUDIT.hash,
    chain_writer: A.AUDIT.chain_writer, chain_readers: A.AUDIT.chain_readers,
    chain_record_count_bound: counts.chain_records_bound, chain_record_count_unbound: counts.chain_records_unbound,
    line_bytes: 'every chain record is written as canonical JSON + LF; prev_file_bytes counts the LF',
  },
  plan: {
    order_bound: S.PLAN_BOUND, order_unbound: S.PLAN_UNBOUND,
    conditional_group: ['C07-B-C18-E01', 'C18-E01', 'C07-A-C18-E01'],
    c18: {
      bind_exec: 'C18-BIND-E01',
      read_at: 'C18-BIND-E01 only, once',
      when_bound: ['C18-BIND-E01 segment_open records c18_state=bound, c18_binding_sha256, c18_destination',
        'the bound order includes the C18 trio; C18-E01 writes only c18_destination'],
      when_unbound: ['C18-BIND-E01 segment_open records c18_state=disabled-unbound, binding fields null',
        'the unbound order omits the C18 trio; any plan that includes it records segment_skip(reason=c18-unbound)',
        'phase0 can only end exit-not-met'],
    },
  },
  flow: {
    model: 'structured requirements + terminal states + stop levels + seal function',
    requirement_states: {
      ok: 'the referenced execution must have closed ok',
      terminal: 'the referenced execution must have closed ok|failed|aborted',
      recorded: 'the referenced execution must have any chain record, including segment_skip (a skipped target is a valid terminal state for reporting)',
      settled: 'the referenced execution reached any terminal state; used for binding hand-off ordering',
    },
    stop_levels: ['none', 'continue', 'halt-business', 'halt-all', 'chain-broken'],
    skip_reasons: F.SKIP_REASONS,
    no_pending: 'the dispatcher appends a segment_skip for every planned execution that did not run; a hard dispatcher death leaves an open tail, which the seal lists as orphaned instead of inventing a close',
    mandatory_after: 'a wrapped target that started and failed still gets exactly one C07-A; a skipped target never gets before/after evidence',
    seal_function: 'mode = no-chain if genesis missing; seal-failed if C20-SEAL failed; chain-broken if chain integrity failed; degraded-prefix if staged_state != complete; aborted if the run halted; else sealed-full',
    seal_modes: Object.fromEntries(SEAL_RULES.map(([m, cond, out]) => [m, { condition: cond, output: out }])),
    matrix: {
      rows: MATRIX.length, digest: matrixDigest, modes: matrixModes,
      rows_data: MATRIX,
      sample_rows: [MATRIX[0], MATRIX.find((x) => x.scenario === 'bound/C10-P-E01/gate'), MATRIX.find((x) => x.scenario === 'bound/C12-E01/security'), MATRIX.find((x) => x.scenario === 'bound/C10-N-E01/orphan')],
      samples: {
        all_ok_bound: F.simulate(S.PLAN_BOUND, {}),
        c10p_gate: c10p,
        c12_security: lateSec,
        c04_fatal: earlyFatal,
        c10n_orphan: orphan,
      },
    },
  },
  failure_policy: {
    classes: FAIL_CLASS,
    security_priority: 'security > fatal > gate > informational; a security-class failure stops the run even if the execution default class is gate',
    trigger_ids: S.TRIGGER_IDS,
    trigger_map: S.SEC_TRIGGER_BY_REASON,
    seal_modes: Object.fromEntries(SEAL_RULES.map(([m, cond, out]) => [m, { condition: cond, output: out }])),
    states: A.FAILURE_STATES.map((s) => s.id),
    abort_successors: {
      'pre-run': [], bootstrap: [],
      'halt-business': ['pending C07-A for a started failed target', 'C17/C19/C20-REPORT', 'C20-SEAL'],
      'halt-all': ['pending C07-A for a started failed target', 'C20-SEAL'],
      'continue': ['C07-A for the failed target', 'dependent triples skip', 'C17/C19/C20-REPORT', 'C20-SEAL'],
    },
    observer_reclaim: 'if PROBE fails or exceeds 300 s, the operator terminates it; OBS receives EOF and must close its segment as failed within 900 s; if OBS does not exit, the dispatcher kills it and records observer-reclaimed before any C04',
  },
  publish: {
    protocol: FILES.publish,
    layout: { meta: '_publish', releases: '_publish/releases/<rid>', staging: '_publish/staging/<rid>', backup: '_publish/backup/<rid>', journal: '_publish/journal.json', current: '_publish/CURRENT.json' },
    states: ['prepared', 'switching', 'committed', 'verified', 'rolled-back', 'rollback-failed'],
    commit_point: 'CURRENT.json rename after every materialised file matches the immutable release index',
    same_volume: 'release, staging and package root share one NTFS volume; per-file replace uses temp+rename (MoveFileEx replace-existing)',
    recovery: 'node p0v9-publish.cjs recover <root>',
    not_claimed: ['single atomic multi-file commit', 'power-loss durability beyond fsync', 'protection against an external process modifying the tree during the switch'],
  },
  counts, commands,
  executions: EXECS.map((e) => ({
    exec_id: e.id, command_id: e.cmd, variant: e.variant || null, step: e.step, phase: e.phase, class: e.class,
    plan_order_bound: e.order_bound, plan_order_unbound: e.order_unbound,
    predecessor_bound: e.predecessor_bound, predecessor_unbound: e.predecessor_unbound,
    chain_predecessor_bound: chainPredB.get(e.id) || null, chain_predecessor_unbound: chainPredU.get(e.id) || null,
    executor: e.executor, entry_mode: e.entry, entry_path: e.entry_path, entry_sha256: null, entry_sha_source: 'RELEASE-MANIFEST.json',
    argv: e.argv, argv_sha256: e.argv_sha256, inline_sha256: e.inline_sha256 || null,
    cwd: e.cwd, stdin: e.stdin, required_env: e.env, product_env: e.product_env || null, deadline_seconds: e.deadline_seconds || null,
    temp: e.temp, fail_class: e.fail_class, failure_modes: e.failure_modes, security_triggers: [...new Set(e.failure_modes.map((m) => m.trigger).filter(Boolean))],
    requires: e.requires, chain_role: e.chain, conditional: e.conditional || null, condition: e.condition || null, target_ref: e.target_ref || null,
    tool_files: e.tool_files, load_files: e.load_files,
    reads: { dispatcher: e.dispatcher_reads, business: e.business_reads, control: e.control_reads },
    writes: { dispatcher: e.dispatcher_writes, business: e.business_writes, control: e.control_writes },
    audit_part_rule: e.audit_part_rule, audit_roles: e.audit_part_rule ? e.audit_part_rule.roles : [],
    metadata_reads: e.metadata_reads, attempted_writes: (e.attempted_writes || []),
    deny_read: e.deny_read, protect_write: e.protect_write,
    guard: e.guard || null, product: e.product || null,
    target_argv: e.target_argv || null, target_argv_sha256: e.target_argv ? L.argvSha(e.target_argv) : null,
    gate: e.gate, fail_closed: e.fail_closed, optional_reads: (e.optional_reads || []), enforcement: e.enforcement,
    outputs: e.outputs, preconditions: e.preconditions || [],
  })),
  directories: DIRECTORY_ROWS.map((r) => ({ path: r[0], creator: r[1], creators: r[2], readers: r[3], writers: r[4], lifecycle: r[5] })),
};

const registryText = JSON.stringify(registry, null, 2);
if (Buffer.byteLength(registryText, 'utf8') > 2400000) { console.error('registry too large'); process.exit(1); }
const registrySha = sha256utf8(registryText);

// ----------------------------------------------------------------------- TSV
const encR = (list) => list.map((r) => (r.kind === 'subtree' ? 'T:' : r.kind === 'metadata' ? 'M:' : 'F:') + (r.optional ? '?' : '') + r.path).join(';');
const encW = (list) => list.map((w) => w.op + ':' + w.path).join(';');
const encQ = (list) => list.map((r) => r.state + ':' + r.exec + ':' + r.kind).join(';');
const HEAD = ['exec_id', 'command_id', 'variant', 'step', 'class', 'plan_order_bound', 'plan_order_unbound', 'predecessor_bound', 'predecessor_unbound',
  'executor', 'entry_mode', 'entry_path', 'cwd', 'argv_sha256', 'inline_sha256', 'chain_role', 'conditional', 'deadline_seconds',
  'temp_mode', 'temp_path', 'tool_files', 'load_files', 'dispatcher_reads', 'business_reads', 'control_reads', 'audit_roles',
  'dispatcher_writes', 'business_writes', 'control_writes', 'deny_read', 'protect_write', 'guard_policy_sha256', 'requires',
  'gate', 'outputs', 'fail_class', 'failure_modes', 'security_triggers'];
const rows = [HEAD.join('\t')];
for (const e of EXECS) {
  rows.push([
    e.id, e.cmd, e.variant || '', e.step, e.class, String(e.order_bound), e.order_unbound ? String(e.order_unbound) : '',
    e.predecessor_bound || '', e.predecessor_unbound || '', e.executor, e.entry, e.entry_path, e.cwd, e.argv_sha256, e.inline_sha256 || '',
    e.chain, e.conditional || '', e.deadline_seconds ? String(e.deadline_seconds) : '',
    e.temp.mode, e.temp.path || '', e.tool_files.map((t) => t.path).join(';'), e.load_files.join(';'),
    encR(e.dispatcher_reads), encR(e.business_reads), encR(e.control_reads), (e.audit_part_rule ? e.audit_part_rule.roles : []).join(','),
    encW(e.dispatcher_writes), encW(e.business_writes), encW(e.control_writes), e.deny_read.join(';'), e.protect_write.join(';'),
    e.guard ? e.guard.policy_sha256 : '', encQ(e.requires), e.gate,
    e.outputs.filter((o) => o.code !== 'CONSOLE').map((o) => o.code + ':' + o.path).join(';'),
    e.fail_class, e.failure_modes.map((m) => m.code + '=' + m.class + (m.trigger ? '(' + m.trigger + ')' : '')).join(';'),
    [...new Set(e.failure_modes.map((m) => m.trigger).filter(Boolean))].join(';'),
  ].join('\t'));
}
const tsvText = rows.join('\n') + '\n';

// ---------------------------------------------------------------- doc appendices
const esc = (s) => String(s).replace(/\|/g, '\\|');
const table = (head, body) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|',
  ...body.map((r) => '| ' + r.map(esc).join(' | ') + ' |')].join('\n');

const mapTable = table(['id', 'role', 'source', 'staged'], Object.keys(TOOLS).map((k) => {
  const m = registry.release.mapping_table.find((x) => x.id === k);
  return [k, TOOLS[k].role, '`' + m.source + '`', TOOLS[k].staged ? '`' + m.staged + '`' : 'not staged (bootstrap)'];
}));
const planTable = table(['#', 'bound order', 'unbound order'], Array.from({ length: Math.max(S.PLAN_BOUND.length, S.PLAN_UNBOUND.length) }, (_, i) =>
  [String(i + 1), S.PLAN_BOUND[i] || '', S.PLAN_UNBOUND[i] || '']));
const execTable = table(['#', 'exec', 'class', 'predecessor', 'requires', 'fail class', 'gate'],
  EXECS.map((e) => [String(e.order_bound), e.id, e.class, e.predecessor_bound || '-',
    e.requires.map((r) => r.state + ':' + r.exec).join('<br>') || '-', e.fail_class, e.gate]));
const guardTable = table(['exec', 'deny_read', 'policy sha256'], EXECS.filter((e) => e.guard).map((e) =>
  [e.id, e.deny_read.map((p) => '`' + p + '`').join('<br>'), '`' + e.guard.policy_sha256 + '`']));
const tempTable = table(['exec', 'mode', 'path', 'same-layer grant', 'product TEMP'], TEMP_ROWS);
const dirTable = table(['path', 'declared creator', 'creating executions', 'readers', 'writers', 'lifecycle'], DIRECTORY_ROWS);
const sealTable = table(['mode', 'condition', 'output'], SEAL_RULES);
const matrixSummary = table(['seal mode', 'scenarios'], Object.entries(matrixModes).sort());
const matrixSamples = table(['scenario', 'stop', 'staged', 'seal', 'exit', 'ran', 'skipped', 'records'], [
  ['bound/all-ok', 'none', 'complete', 'sealed-full', 'complete', 58, 0, 109],
  ['bound/C10-P/gate', c10p.stop, c10p.staged_state, c10p.seal_mode, c10p.exit, c10p.ran, c10p.skipped, c10p.records],
  ['bound/C12/security', lateSec.stop, lateSec.staged_state, lateSec.seal_mode, lateSec.exit, lateSec.ran, lateSec.skipped, lateSec.records],
  ['bound/C04/fatal', earlyFatal.stop, earlyFatal.staged_state, earlyFatal.seal_mode, earlyFatal.exit, earlyFatal.ran, earlyFatal.skipped, earlyFatal.records],
  ['bound/C10-N/orphan', orphan.stop, orphan.staged_state, orphan.seal_mode, orphan.exit, orphan.ran, orphan.skipped, orphan.records],
]);
const countsBlock = table(['项', '值'], [
  ['命令 ID', counts.commands], ['执行', counts.executions], ['链参与者', counts.chain_participants],
  ['链记录（绑定/未绑定）', counts.chain_records_bound + ' / ' + counts.chain_records_unbound],
  ['执行顺序长度（绑定/未绑定）', counts.plan_bound + ' / ' + counts.plan_unbound],
  ['非链 / 终端封存', counts.non_chain_executions + ' / ' + counts.terminal_executions],
  ['payload（staged / bootstrap）', counts.payload_files + '（' + counts.staged_files + ' / ' + counts.bootstrap_files + '）'],
  ['失败矩阵行数', counts.failure_matrix_rows], ['失败矩阵摘要', '`' + matrixDigest + '`'],
  ['向量 SHA-256', '`' + vectorsSha + '`（' + vectorsBytes.length + ' 字节）'],
  ['注册表 SHA-256', '`' + registrySha + '`'], ['负例', counts.negatives],
]);

const mainAppendix = [
  '## Appendix B：固定路径与 20 个 payload 映射（生成）', '',
  'ReleaseSourceRoot=`' + P.SRC + '`；ApprovedManifestPath=`' + P.MANIFEST + '`；StagedRoot=`' + P.STAGED + '`；BindingFile=`' + P.BINDING_FILE + '`。manifest 与 4 个 bootstrap 文件不进入 staged 根。', '',
  mapTable, '', '## Appendix C：执行顺序（生成）', '', '绑定顺序 ' + counts.plan_bound + ' 条，未绑定顺序 ' + counts.plan_unbound + ' 条；C18 三连为条件组。', '', planTable, '',
  '## Appendix D：逐执行入口、要求与门（生成）', '', execTable, '',
  '## Appendix E：失败矩阵摘要（生成）', '',
  '生成器对每个执行注入 gate（仅 gate 类）/fatal/security 三类单点失败，并对每个执行注入一次 orphan（链写入者死亡），绑定与未绑定共 ' + MATRIX.length + ' 个场景。检查器用自己的状态机重算并比对摘要。', '',
  matrixSamples, '', '### 按封存模式统计', '', matrixSummary, '',
  '## Appendix F：封存模式判定（生成）', '', sealTable, '',
  '## Appendix G：目录生命周期（生成）', '', dirTable, '',
  '## Appendix H：TEMP/TMP 策略（生成）', '', tempTable, '',
  '## Appendix I：计数（生成）', '', countsBlock, '',
].join('\n');

const auditAppendix = [
  '## Appendix A：事件字段规则（生成）', '',
  ...Object.keys(A.EVENT_FIELDS).map((k) => '### ' + k + '\n\n' + table(['字段', '必填性', '规则'], A.EVENT_FIELDS[k].map((f) => ['`' + f.name + '`', f.presence, f.rule])) + '\n'),
  '## Appendix B：链头记录字段（生成）', '',
  ...Object.keys(A.CHAIN_FIELDS).map((k) => '### ' + k + '\n\n' + table(['字段', '必填性', '规则'], A.CHAIN_FIELDS[k].map((f) => ['`' + f.name + '`', f.presence, f.rule])) + '\n'),
  '## Appendix C：summary 与终端封存字段（生成）', '',
  table(['字段', '必填性', '规则'], A.SUMMARY_FIELDS.map((f) => ['`' + f.name + '`', f.presence, f.rule])), '',
  table(['字段', '必填性', '规则'], A.SEAL_FIELDS.map((f) => ['`' + f.name + '`', f.presence, f.rule])), '',
  '## Appendix D：测试向量索引（生成）', '',
  '向量文件：`' + FILES.vectors + '`，' + vectorsBytes.length + ' 字节，SHA-256 `' + vectorsSha + '`。', '',
  table(['组', '名称', 'SHA-256'], [
    ...vectors.valid.map((v) => ['valid', v.name, '`' + v.sha256 + '`']),
    ...vectors.parts.map((v) => ['part', v.name, '`' + v.sha256 + '`']),
    ...Object.entries(vectors.chains).flatMap(([g, arr]) => arr.map((v) => ['chain/' + g, v.name, '`' + v.sha256 + '`'])),
    ...vectors.summaries.map((v) => ['summary', v.name, '`' + v.sha256 + '`']),
    ...vectors.seals.map((v) => ['seal', v.name, '`' + v.sha256 + '`']),
  ]), '',
  '## Appendix E：负例清单（生成）', '',
  table(['负例', '期望错误码'], vectors.negative.map((n) => [n.name, '`' + n.expect + '`'])), '',
].join('\n');

function renderDoc(file, appendix) {
  const p = path.join(DOC, file);
  const t = fs.readFileSync(p, 'utf8');
  const i = t.indexOf(GEN);
  if (i < 0) throw new Error(file + ': marker missing');
  return t.slice(0, i) + GEN + '\n\n' + appendix.trim() + '\n\n' + GEN_END + '\n';
}

const docs = {};
docs[FILES.vectors] = vectorsBytes;
docs[FILES.registry] = registryText;
docs[FILES.tsv] = tsvText;
for (const f of [FILES.main, FILES.audit]) docs[f] = renderDoc(f, f === FILES.main ? mainAppendix : auditAppendix);
const plain = (f) => fs.readFileSync(path.join(DOC, f), 'utf8');
for (const f of [FILES.failure, FILES.publish, FILES.changelog, FILES.trace, FILES.traceF, FILES.open, FILES.runtime]) docs[f] = plain(f);
// F14: every generation input is part of the delivery and the content-addressed release.
for (const f of fs.readdirSync(DOC).filter((x) => x.endsWith('.md')).sort()) {
  docs['doc-src/' + f] = plain(f);
}

const selfTpl = plain(FILES.self)
  .replace(/{{COUNT_COMMANDS}}/g, String(counts.commands))
  .replace(/{{COUNT_EXECS}}/g, String(counts.executions))
  .replace(/{{COUNT_RECORDS}}/g, counts.chain_records_bound + ' / ' + counts.chain_records_unbound)
  .replace(/{{COUNT_MATRIX}}/g, String(counts.failure_matrix_rows))
  .replace(/{{COUNT_NEG}}/g, String(counts.negatives))
  .replace(/{{COUNT_BUILD_CHECKS}}/g, String(checks.length))
  .replace(/{{MATRIX_DIGEST}}/g, matrixDigest)
  .replace(/{{VECTORS_SHA}}/g, vectorsSha)
  .replace(/{{REGISTRY_SHA}}/g, registrySha);
docs[FILES.self] = selfTpl;

// delivery manifest is generated from the final file map by p0v9-manifest.cjs; placeholder now
docs[FILES.manifest] = '# pending\n';

const toolFiles = fs.readdirSync(DIR).filter((f) => /^p0v9-.*\.(cjs|ps1)$/.test(f));
for (const f of toolFiles) docs[f] = fs.readFileSync(path.join(DIR, f), 'utf8');

const buildCheckCount = checks.length;
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

console.log(JSON.stringify({ stage: 'generated', files: Object.keys(docs).length, build_checks: buildCheckCount, matrix_rows: MATRIX.length, vectors_bytes: vectorsBytes.length }, null, 2));
module.exports = { docs, counts, registry, vectors, MATRIX, checks, FILES, ROOT, DIR, buildCheckCount };

// ------------------------------------------------------------------ CLI
function run(cmd, args, cwd) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 300000 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function hashMap(m) {
  const c = require('crypto');
  const out = {};
  for (const [k, v] of Object.entries(m)) out[k] = c.createHash('sha256').update(Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8')).digest('hex');
  return out;
}

function main() {
  const M = require('./p0v9-manifest.cjs');
  const final = Object.assign({}, docs);
  final[FILES.manifest] = M.renderManifest(final);
  // deterministic generation: run the generator a second time in a fresh process and compare bytes
  const detScript = "const b=require('./p0v9-build.cjs');const c=require('crypto');const o={};for(const [k,v] of Object.entries(b.docs))o[k]=c.createHash('sha256').update(v).digest('hex');process.stdout.write('DET:'+JSON.stringify(o));";
  const detRun = run(process.execPath, ['-e', detScript], DIR);
  const detLine = (detRun.stdout || '').split('\n').filter((x) => x.startsWith('DET:')).pop();
  let determinism = false;
  if (detRun.status === 0 && detLine) {
    const second = JSON.parse(detLine.slice(4));
    const first = hashMap(docs);
    determinism = Object.keys(first).length === Object.keys(second).length && Object.keys(first).every((k) => first[k] === second[k]);
  }
  if (!determinism) { console.error('determinism check failed: two generations differ'); process.exit(1); }
  const pre = path.join(ROOT, '_publish', 'prestage');
  fs.rmSync(pre, { recursive: true, force: true });
  fs.mkdirSync(pre, { recursive: true });
  for (const [rel, body] of Object.entries(final)) {
    const p = path.join(pre, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf8');
  }
  const chk = run(process.execPath, [path.join(DIR, 'p0v9-check.cjs'), '--dir', pre], DIR);
  const ver = run('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(DIR, 'p0v9-verify.ps1'), '-Dir', pre], DIR);
  const par = run('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(DIR, 'p0v9-parse-inline.ps1'), '-Dir', pre], DIR);
  const cc = run(process.execPath, [path.join(DIR, 'p0v9-controlconfig-check.cjs')], DIR);
  const lab = require('./p0v9-lab.cjs').run();
  if (chk.status !== 0 || ver.status !== 0 || par.status !== 0 || cc.status !== 0 || lab.failed) {
    console.error('pre-publish gate failed');
    console.error(chk.stdout); console.error(chk.stderr);
    console.error(ver.stdout); console.error(ver.stderr);
    console.error(par.stdout); console.error(par.stderr);
    console.error(cc.stdout); console.error(cc.stderr);
    console.error(JSON.stringify({ lab: { scenarios: lab.scenarios, passed: lab.passed, failed: lab.failed } }));
    process.exit(1);
  }
  const chkN = (() => { try { return JSON.parse(chk.stdout).checks; } catch (e) { return null; } })();
  const verN = (() => { const m = /passed\s+(\d+)/.exec(ver.stdout); return m ? Number(m[1]) : null; })();
  const pub = PB.publish(ROOT, final, {});
  fs.rmSync(pre, { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, '_publish'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '_publish', 'gate.json'), JSON.stringify({
    checker_exit: chk.status, checker_checks: chkN, verifier_exit: ver.status, verifier_passed: verN,
    build_checks: buildCheckCount, publish: pub,
  }, null, 2), 'utf8');
  if (!pub.ok) { console.error(JSON.stringify(pub, null, 2)); process.exit(1); }
  const post = run(process.execPath, [path.join(ROOT, 'p0v9-check.cjs'), '--dir', ROOT], ROOT);
  const postV = run('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'p0v9-verify.ps1'), '-Dir', ROOT], ROOT);
  const hyg = run(process.execPath, [path.join(ROOT, 'p0v9-hygiene.cjs'), '..'], ROOT);
  if (post.status !== 0 || postV.status !== 0 || hyg.status !== 0) {
    // F09: explicitly undo the committed transaction and verify the previous release.
    const rb = PB.undo(ROOT, {});
    console.error('post-commit gate failed; undo=' + JSON.stringify(rb));
    console.error(post.stdout); console.error(postV.stdout); console.error(hyg.stdout);
    process.exit(rb.ok ? 1 : 3);
  }
  const postN = (() => { try { return JSON.parse(post.stdout).checks; } catch (e) { return null; } })();
  fs.writeFileSync(path.join(ROOT, '_publish', 'gate.json'), JSON.stringify({
    checker_exit: chk.status, pre_checker_checks: chkN, verifier_exit: ver.status, verifier_passed: verN,
    parse_inline_exit: par.status, control_config_exit: cc.status,
    build_checks: buildCheckCount, determinism,
    lab: { scenarios: lab.scenarios, passed: lab.passed, failed: lab.failed, evidence_dir: lab.evidence_dir, limits: lab.limits },
    lab_report_sha256: (() => { try { return require('crypto').createHash('sha256').update(require('fs').readFileSync(require('path').join(lab.evidence_dir, 'report.json'))).digest('hex'); } catch (e) { return null; } })(),
    post_checker_exit: post.status, post_checker_checks: postN, post_verifier_exit: postV.status, hygiene_exit: hyg.status,
    publish: { ok: pub.ok, rid: pub.rid, state: pub.state, files: pub.files },
  }, null, 2), 'utf8');
  console.log(JSON.stringify({ publish: pub, pre_checker_checks: chkN, post_checker_checks: postN, verifier_passed: verN, build_checks: buildCheckCount, determinism, lab: { scenarios: lab.scenarios, passed: lab.passed, failed: lab.failed, evidence_dir: lab.evidence_dir }, post_checker: post.status, post_verifier: postV.status, hygiene: hyg.status }, null, 2));
}

if (require.main === module) main();
