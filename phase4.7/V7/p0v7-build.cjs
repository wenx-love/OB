'use strict';
// OB-Recover Phase 4.7 / Phase 0 V7 - builds registry, TSV, vectors, appendices.
const fs = require('fs');
const path = require('path');
const L = require('./p0v7-lib.cjs');
const S = require('./p0v7-spec.cjs');
const A = require('./p0v7-audit.cjs');
const { P, ID, TOOLS, src, stg, canon, sha256utf8, sha256hex } = L;

const DIR = __dirname;
const FILES = {
  vectors: 'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json',
  registry: 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json',
  tsv: 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv',
  main: 'PHASE4.7-PHASE0-START-CONDITIONS-V7.md',
  audit: 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md',
};
const GEN = '<!-- GENERATED:BEGIN (p0v7-build.cjs) -->';
const GEN_END = '<!-- GENERATED:END -->';
const FAIL_CLASS = ['pre-run', 'bootstrap', 'fatal', 'gate', 'seal'];

const toolPath = (e, id) => (e.entry === 'staged-dispatcher' ? stg(id) : src(id));

// ------------------------------------------------------------------ vectors
const vectors = A.buildVectors();
const vectorsBytes = Buffer.from(canon(vectors), 'utf8');
const vectorsSha = sha256hex(vectorsBytes);

// ------------------------------------------------------------- normalisation
const orderB = new Map(S.PLAN_BOUND.map((id, i) => [id, i + 1]));
const orderU = new Map(S.PLAN_UNBOUND.map((id, i) => [id, i + 1]));
const EXECS = S.EXECS.slice().sort((a, b) => orderB.get(a.id) - orderB.get(b.id));

const readEntry = (x) => ({ path: x.path, kind: x.scope === 'subtree' ? 'subtree' : x.scope === 'metadata' ? 'metadata' : 'file' });
const writeEntry = (o) => ({
  path: o.path,
  op: S.WCODE[o.code],
  kind: o.code === 'ML' ? 'map-list' : (['TC', 'TW', 'DC', 'ACL', 'EC', 'AP'].includes(o.code) ? 'subtree' : 'file'),
  note: o.note || null,
});
const covered = (entry, p) => {
  const a = entry.path.toLowerCase();
  const b = p.toLowerCase();
  if (a === b) return true;
  return (entry.kind === 'subtree' || entry.kind === 'map-list') && b.startsWith(a + '\\');
};
const coveredBy = (list, p) => list.some((e) => covered(e, p));
const isToken = (p) => p.startsWith('BINDING:') || p.startsWith('ENV_METADATA:') || p === 'console';
const OUT = [];

const ALL_STAGED = Object.keys(TOOLS).filter((k) => TOOLS[k].staged).map((k) => stg(k));
const DENY_CANDIDATES = [
  { label: 'ORIGINAL', p: P.ORIGINAL }, { label: 'M0', p: P.M0 }, { label: 'SNAP', p: P.SNAP },
  { label: 'PRISTINE', p: P.CP }, { label: 'NO_PLUGIN', p: P.CN }, { label: 'SANDBOX', p: P.CS },
  { label: 'EVIDENCE', p: P.EVIDENCE }, { label: 'TRUST', p: P.TRUST }, { label: 'REVIEW', p: P.REVIEW },
  { label: 'CONTROLS', p: P.CONTROLS }, { label: 'AUDIT', p: P.AUDIT }, { label: 'TMP', p: P.TMP },
  { label: 'TERMINAL_SEAL', p: P.TSEAL },
];
function denyFor(reads, writes) {
  const out = [];
  const wl = writes.map((w) => ({ path: w.path, kind: w.kind }));
  for (const c of DENY_CANDIDATES) {
    if (coveredBy(reads, c.p)) continue;
    if (coveredBy(wl, c.p)) continue;
    out.push(c.p);
  }
  // STAGED: a subtree allow (C05-FINAL / C20-SEAL) covers every staged file.
  // Otherwise deny exactly the staged files that are not covered by a read entry.
  for (const f of ALL_STAGED) {
    if (reads.some((r) => covered(r, f))) continue;
    out.push(f);
  }
  return out;
}
function intersects(read, denyPath) {
  const a = read.path.toLowerCase();
  const b = denyPath.toLowerCase();
  if (a === b) return true;
  if (a.startsWith(b + '\\')) return true;          // read inside deny
  if ((read.kind === 'subtree' || read.kind === 'map-list') && b.startsWith(a + '\\')) return true; // deny inside allowed subtree
  return false;
}

const PROTECT_BASE = [P.ORIGINAL, P.M0, P.CHAIN, P.TSEAL, P.RUN_PARENT];
const errors = [];

for (const e of EXECS) {
  e.order_bound = orderB.get(e.id);
  e.order_unbound = orderU.get(e.id) || null;
  e.predecessor_bound = e.order_bound > 1 ? S.PLAN_BOUND[e.order_bound - 2] : null;
  e.predecessor_unbound = e.order_unbound && e.order_unbound > 1 ? S.PLAN_UNBOUND[e.order_unbound - 2] : null;
  e.entry_path = e.entry === 'inline' || e.entry === 'codex-inline' ? 'inline'
    : (e.entry === 'staged-dispatcher' ? stg('dispatch') : src('dispatch'));
  e.tool_files = e.tools.map((id) => ({ id, path: toolPath(e, id), role: TOOLS[id].role, sha256: null, sha_source: 'RELEASE-MANIFEST.json' }));
  const loadIds = (e.load && e.load.length ? e.load : e.tools.slice(0, 1)).filter((id) => id !== 'dispatch');
  e.load_files = loadIds.map((id) => toolPath(e, id));
  const depIds = e.tools.includes('verify') ? ['verify'] : [];
  e.dispatcher_reads = (e.entry === 'inline' || e.entry === 'codex-inline') ? [] : [
    { path: P.MANIFEST, kind: 'file', note: 'approved manifest' },
    { path: e.entry_path, kind: 'file', note: 'actual entry bytes loaded by this execution; hash rechecked before spawn' },
    ...depIds.map((id) => ({ path: toolPath(e, id), kind: 'file', note: 'dispatch dependency from the same root as the entry' })),
    { path: P.NODE, kind: 'file', note: 'node.exe hashed before spawn' },
    ...e.tool_files.map((t) => ({ path: t.path, kind: 'file', note: 'tool bytes hashed before load' })),
  ];
  // dedupe dispatcher reads by path
  e.dispatcher_reads = e.dispatcher_reads.filter((r, i, a) => a.findIndex((x) => x.path.toLowerCase() === r.path.toLowerCase()) === i);
  e.dispatcher_writes = [];
  e.business_reads = [...e.inputs.map(readEntry), ...e.load_files.map((p) => ({ path: p, kind: 'file', note: 'process entry/guard/audit loaded at start' }))];
  e.business_reads = e.business_reads.filter((r, i, a) => a.findIndex((x) => x.path.toLowerCase() === r.path.toLowerCase()) === i);
  e.metadata_reads = e.metadata.slice();
  e.business_writes = e.outputs.filter((o) => o.code !== 'CONSOLE').map(writeEntry);
  e.dispatcher_writes = [];
  e.control_reads = [];
  e.control_writes = [];
  e.audit_part_rule = null;
  if (e.chain === 'genesis') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail check' }];
    e.control_writes = [
      { path: P.CHAIN, op: 'file-create', kind: 'file', note: 'genesis CreateNew' },
      { path: P.CHAIN, op: 'file-append', kind: 'file', note: 'own segment_open/segment_close' },
      { path: S.audDir(e.cmd, e.id), op: 'dir-create', kind: 'subtree', note: 'segment dir' },
      { path: S.audDir(e.cmd, e.id) + '\\summary.json', op: 'file-create', kind: 'file', note: 'CreateNew by seal' },
    ];
    e.audit_part_rule = { dir: S.audDir(e.cmd, e.id), pattern: 'events-<role>-<pid>-<rand8>.jsonl', op: 'create-and-append', roles: ['tool'] };
  } else if (e.chain === 'participant') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail under exclusive open' }];
    e.control_writes = [
      { path: P.CHAIN, op: 'file-append', kind: 'file', note: 'segment_open / segment_close' },
      { path: S.audRoot(e.cmd), op: 'dir-create-if-absent', kind: 'subtree', note: 'intermediate audit parent' },
      { path: S.audDir(e.cmd, e.id), op: 'dir-create', kind: 'subtree', note: 'segment dir; must not exist' },
      { path: S.audDir(e.cmd, e.id) + '\\summary.json', op: 'file-create', kind: 'file', note: 'CreateNew by seal' },
    ];
    e.audit_part_rule = { dir: S.audDir(e.cmd, e.id), pattern: 'events-<role>-<pid>-<rand8>.jsonl', op: 'create-and-append', roles: e.cmd === 'C03' && e.variant === 'OBS' ? ['observer'] : (e.product ? ['tool', 'product'] : ['tool']) };
  } else if (e.chain === 'terminal') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail read only; no append' }];
    e.control_writes = [{ path: P.TSEAL, op: 'file-create', kind: 'file', note: 'CreateNew; last write' }];
  }
  e.deny_read = denyFor(e.business_reads, e.business_writes);
  e.protect_write = PROTECT_BASE.slice();
  if (e.product) {
    const ownOut = S.outDir(e.cmd, e.id);
    const pReads = [readEntry({ path: e.product.copy, scope: 'subtree' }), readEntry({ path: ownOut, scope: 'subtree' })];
    for (const id of ['guard', 'audit']) {
      if (e.tool_files.some((t) => t.id === id)) pReads.push({ path: toolPath(e, id), kind: 'file', note: 'preload module read by the product child' });
    }
    const pWrites = [];
    for (const f of e.product.productFiles || []) pWrites.push({ path: ownOut + '\\' + f, op: 'file-create', kind: 'file' });
    for (const w of e.business_writes) {
      const lower = w.path.toLowerCase();
      if (lower.startsWith(e.product.copy.toLowerCase() + '\\')) pWrites.push(w);
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
    if (seo && !e.business_writes.some((w) => w.path === e.product.copy + '\\dist')) {
      e.business_writes.push({ path: e.product.copy + '\\dist', op: 'dir-create', kind: 'subtree', note: 'dist root if absent' });
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
  // allow/deny must be disjoint in BOTH directions
  for (const r of e.business_reads) {
    for (const d of e.deny_read) {
      if (intersects(r, d)) errors.push(e.id + ' read/deny intersect: ' + r.path + ' <-> ' + d);
    }
  }
  for (const r of e.metadata_reads) {
    for (const d of e.deny_read) if (r === d) errors.push(e.id + ' metadata/deny equal: ' + r);
  }
  if (e.product) {
    for (const r of e.product.reads) for (const d of e.product.deny_read) {
      if (intersects(r, d)) errors.push(e.id + ' product read/deny intersect: ' + r.path + ' <-> ' + d);
    }
  }
  // coverage
  for (const x of e.inputs) if (!coveredBy(e.business_reads, x.path)) errors.push(e.id + ' input not readable: ' + x.path);
  for (const o of e.outputs) {
    if (o.code === 'CONSOLE' || isToken(o.path)) continue;
    if (!coveredBy(e.business_writes, o.path) && !coveredBy(e.control_writes, o.path)) errors.push(e.id + ' output not writable: ' + o.path);
  }
  // every data file write needs a parent dir created at or before this exec
  const parent = (p) => { const i = p.lastIndexOf('\\'); return i > 2 ? p.slice(0, i) : null; };
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// dir-creation reachability (plan order, bound)
const createdDirs = new Set();
for (const id of S.PLAN_BOUND) {
  const e = EXECS.find((x) => x.id === id);
  for (const w of e.business_writes) if (w.kind === 'subtree' && (w.op === 'dir-create' || w.op === 'subtree-create' || w.op === 'env-bound-subtree-create')) createdDirs.add(w.path.toLowerCase());
  for (const o of e.outputs) {
    if (o.code === 'CONSOLE' || isToken(o.path)) continue;
    const w = e.business_writes.find((x) => x.path === o.path);
    if (!w || w.kind !== 'file') continue;
    const par = o.path.slice(0, o.path.lastIndexOf('\\'));
    const okDir = createdDirs.has(par.toLowerCase()) || createdDirs.has(P.RUN.toLowerCase()) && par.toLowerCase() === P.RUN.toLowerCase();
    if (!okDir) errors.push(e.id + ' file output without created parent dir: ' + o.path + ' (parent ' + par + ')');
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// ---------------------------------------------------------------- failure matrix
const FAILURE_STATES = A.FAILURE_STATES;

// ---------------------------------------------------------------- accounting
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
};

const commands = [...new Set(EXECS.map((e) => e.cmd))].sort().map((cmd) => {
  const es = EXECS.filter((e) => e.cmd === cmd);
  return { id: cmd, step: es[0].step, exec_ids: es.map((e) => e.id), variants: [...new Set(es.map((e) => e.variant).filter(Boolean))], count: es.length };
});

const registry = {
  schema: 'p47-phase0-command-registry-v7',
  generated_by: 'p0v7-build.cjs (contract generator; never executes C00-C20)',
  run_id: P.RUN_ID, run: P.RUN, run_parent: P.RUN_PARENT, original: P.ORIGINAL,
  release: {
    release_id: 'p47-phase0-v7', manifest_schema: 'p47-phase0-tool-release-v3',
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
      'control (p0-audit.cjs): chain tail/append + own segment summary; no business data',
      'product (runner child): copy subtree + own OUT dir; exclusive write list'],
    overlap_rule: 'a path may appear in at most one of read_allow and deny_read for the same layer; the registry is checked mechanically',
  },
  cache_policy: {
    runner_temp: 'RUN\\tmp', product_temp: 'COPY\\tmp',
    vite: 'COPY\\node_modules\\.vite', vite_temp: 'COPY\\node_modules\\.vite-temp',
    root_dot_vite_forbidden: true,
  },
  trust: {
    anchors: [
      { id: 'H1', what: 'V7 contract files', who: 'user approval record', when: 'before C00' },
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
        'the unbound order omits the C18 trio; no TEMP or fallback path; phase0 can only end exit-not-met'],
    },
    failure_policy: {
      classes: FAIL_CLASS,
      security_priority: 'security > fatal > gate > informational; a security-class failure stops the run even if the execution default class is gate',
      security_triggers: ['identity/account mismatch', 'denied read or write succeeded', 'guard/preload missing', 'audit intent/result failure', 'chain or summary hash mismatch', 'staged verification mismatch', 'path escape'],
      skip_policy: {
        trigger: 'a gate-class execution fails and has dependents',
        action: 'dependents are recorded with segment_skip(reason=dependency-failed) and are never executed',
        propagation: 'transitive over deps; a skipped execution cannot satisfy a success gate',
        report_exempt: ['C17-E01', 'C19-E01', 'C20-REPORT-E01', 'C20-SEAL-E01'],
        report: 'skipped list is part of C19 index, C20 report and terminal seal',
      },
      seal_modes: {
        'sealed-full': 'staged_state=complete and every required segment present; full staged recheck performed',
        'degraded-prefix': 'staged_state=incomplete|absent (early fatal); seal lists the actual prefix and missing items; no full recheck claim',
        aborted: 'chain intact and run stopped at a recorded abort point',
        'chain-broken': 'no seal file is written',
      },
      observer_reclaim: 'if PROBE fails or exceeds 300 s, the operator terminates it; OBS receives EOF and must close its segment as failed within 900 s; if OBS does not exit, the dispatcher kills it and records observer-reclaimed before any C04',
      binding_handoff: 'C18-BIND writes controls/c18-binding.json with CreateNew; its sha256 and destination are also in segment_open; C18 and all later consumers read only the binding file and never re-read P0_SECOND_ARCHIVE',
      states: FAILURE_STATES.map((s) => s.id),
      no_pending: 'every terminal state is written to the chain or the launch record; skipped is a terminal state, not success',
      abort_successors: {
        'pre-run': [],
        bootstrap: [],
        fatal: ['one C07-A for the failed wrapped target if it has not run', 'C20-SEAL-E01 in aborted or degraded mode'],
        gate: ['C07-A for the failed target', 'C18-BIND/C19/C20-REPORT continue', 'dependent executions are skipped with segment_skip', 'C20-SEAL-E01'],
        seal: [],
      },
      gate_vs_fatal: 'security triggers always escalate; C10-C16/C18 product failures are gate unless a security trigger fired',
      nominal_records: '109/103 count only non-skipped segments; each skip adds one segment_skip record, so reports must use the actual tail',
    },
  },
  counts, commands,
  executions: EXECS.map((e) => ({
    exec_id: e.id, command_id: e.cmd, variant: e.variant || null, step: e.step, phase: e.phase,
    plan_order_bound: e.order_bound, plan_order_unbound: e.order_unbound,
    predecessor_bound: e.predecessor_bound, predecessor_unbound: e.predecessor_unbound,
    executor: e.executor, entry_mode: e.entry, entry_path: e.entry_path, entry_sha256: null, entry_sha_source: 'RELEASE-MANIFEST.json',
    argv: e.argv, argv_sha256: e.argv_sha256, inline_sha256: e.inline_sha256 || null,
    cwd: e.cwd, stdin: e.stdin, required_env: e.env, product_env: e.product_env || null, deadline_seconds: e.deadline_seconds || null,
    fail_class: e.fail_class, security_codes: e.security_codes, deps: e.deps, chain_role: e.chain, conditional: e.conditional || null,
    tool_files: e.tool_files, load_files: e.load_files,
    reads: { dispatcher: e.dispatcher_reads, business: e.business_reads, control: e.control_reads },
    writes: { dispatcher: e.dispatcher_writes, business: e.business_writes, control: e.control_writes },
    audit_part_rule: e.audit_part_rule, metadata_reads: e.metadata_reads,
    attempted_writes: (e.attempted_writes || []),
    deny_read: e.deny_read, protect_write: e.protect_write,
    guard: e.guard || null, product: e.product || null,
    target_argv: e.target_argv || null, target_argv_sha256: e.target_argv ? L.argvSha(e.target_argv) : null,
    gate: e.gate, fail_closed: e.fail_closed, enforcement: e.enforcement,
    outputs: e.outputs,
  })),
};

const registryText = JSON.stringify(registry, null, 2);
if (Buffer.byteLength(registryText, 'utf8') > 1900000) { console.error('registry too large'); process.exit(1); }
const registrySha = sha256utf8(registryText);

// ----------------------------------------------------------------------- TSV
const encR = (list) => list.map((r) => (r.kind === 'subtree' ? 'T:' : r.kind === 'metadata' ? 'M:' : 'F:') + r.path).join(';');
const encW = (list) => list.map((w) => w.op + ':' + w.path).join(';');
const HEAD = ['exec_id', 'command_id', 'variant', 'step', 'plan_order_bound', 'plan_order_unbound', 'executor', 'entry_mode',
  'entry_path', 'cwd', 'argv_sha256', 'inline_sha256', 'chain_role', 'deadline_seconds', 'tool_files', 'load_files',
  'dispatcher_reads', 'business_reads', 'control_reads', 'audit_part_rule', 'dispatcher_writes', 'business_writes',
  'control_writes', 'deny_read', 'protect_write', 'guard_policy_sha256', 'predecessor_bound', 'predecessor_unbound',
  'gate', 'outputs', 'fail_class', 'deps', 'security_codes'];
const rows = [HEAD.join('\t')];
for (const e of EXECS) {
  rows.push([
    e.id, e.cmd, e.variant || '', e.step, String(e.order_bound), e.order_unbound ? String(e.order_unbound) : '', e.executor, e.entry,
    e.entry_path, e.cwd, e.argv_sha256, e.inline_sha256 || '', e.chain, e.deadline_seconds ? String(e.deadline_seconds) : '',
    e.tool_files.map((t) => t.path).join(';'), e.load_files.join(';'),
    encR(e.dispatcher_reads), encR(e.business_reads), encR(e.control_reads),
    e.audit_part_rule ? e.audit_part_rule.pattern + '@' + e.audit_part_rule.dir : '',
    encW(e.dispatcher_writes), encW(e.business_writes), encW(e.control_writes),
    e.deny_read.join(';'), e.protect_write.join(';'), e.guard ? e.guard.policy_sha256 : '',
    e.predecessor_bound || '', e.predecessor_unbound || '', e.gate,
    e.outputs.filter((o) => o.code !== 'CONSOLE').map((o) => o.code + ':' + o.path).join(';'),
    e.fail_class, e.deps.join(';'), e.security_codes.join(';'),
  ].join('\t'));
}
const tsvText = rows.join('\n') + '\n';

// ---------------------------------------------------------------- appendices
const esc = (s) => String(s).replace(/\|/g, '\\|');
const table = (head, body) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|',
  ...body.map((r) => '| ' + r.map(esc).join(' | ') + ' |')].join('\n');

const mapTable = table(['id', 'role', 'source', 'staged'], Object.keys(TOOLS).map((k) => {
  const m = registry.release.mapping_table.find((x) => x.id === k);
  return [k, TOOLS[k].role, '`' + m.source + '`', TOOLS[k].staged ? '`' + m.staged + '`' : 'not staged (bootstrap)'];
}));
const planTable = table(['#', 'bound order', 'unbound order'], Array.from({ length: Math.max(S.PLAN_BOUND.length, S.PLAN_UNBOUND.length) }, (_, i) =>
  [String(i + 1), S.PLAN_BOUND[i] || '', S.PLAN_UNBOUND[i] || '']));
const execTable = table(['#', 'exec', 'argv sha256', 'pred(bound)', 'fail class', 'gate'],
  EXECS.map((e) => [String(e.order_bound), e.id, '`' + e.argv_sha256 + '`', e.predecessor_bound || '-', e.fail_class, e.gate]));
const guardTable = table(['exec', 'deny_read', 'policy sha256'], EXECS.filter((e) => e.guard).map((e) =>
  [e.id, e.deny_read.map((p) => '`' + p + '`').join('<br>'), '`' + e.guard.policy_sha256 + '`']));
const countsBlock = ['| 项 | 值 |', '|---|---|',
  '| 命令 ID | ' + counts.commands + ' |', '| 执行 | ' + counts.executions + ' |',
  '| 链参与者 | ' + counts.chain_participants + ' |',
  '| 链记录（绑定） | ' + counts.chain_records_bound + ' |', '| 链记录（未绑定） | ' + counts.chain_records_unbound + ' |',
  '| 绑定/未绑定执行顺序长度 | ' + counts.plan_bound + ' / ' + counts.plan_unbound + ' |',
  '| 非链执行 | ' + counts.non_chain_executions + ' |', '| 终端封存 | ' + counts.terminal_executions + ' |',
  '| payload | ' + counts.payload_files + '（staged ' + counts.staged_files + ' / bootstrap ' + counts.bootstrap_files + '） |',
  '| 向量 SHA-256 | `' + vectorsSha + '`（' + vectorsBytes.length + ' 字节） |',
  '| 注册表 SHA-256 | `' + registrySha + '` |'].join('\n');

function buildDoc(file, block) {
  const p = path.join(DIR, file);
  const text = fs.readFileSync(p, 'utf8');
  const i = text.indexOf(GEN);
  if (i < 0) throw new Error(file + ': marker missing');
  return [p, text.slice(0, i) + GEN + '\n\n' + block.trim() + '\n\n' + GEN_END + '\n'];
}

const mainAppendix = ['## Appendix B：固定路径与 20 个 payload 映射（生成）', '',
  'ReleaseSourceRoot=`' + P.SRC + '`；ApprovedManifestPath=`' + P.MANIFEST + '`；StagedRoot=`' + P.STAGED + '`。manifest 与 4 个 bootstrap 文件不进入 staged 根。', '',
  mapTable, '', '## Appendix C：执行顺序（生成）', '', '绑定顺序 ' + counts.plan_bound + ' 条，未绑定顺序 ' + counts.plan_unbound + ' 条；C18 三连为条件组。', '', planTable, '',
  '## Appendix D：逐执行入口与 argv 哈希（生成）', '', execTable, '',
  '## Appendix E：失败状态矩阵（生成）', '',
  table(['状态', '触发', '结算', '允许后继', '报告状态', 'Phase 0 完成'], FAILURE_STATES.map((s) => [s.id, s.trigger, s.owner, s.next, s.report, s.complete])), '',
  '## Appendix F：Node 守卫策略（生成）', '', guardTable, '', '## Appendix G：计数（生成）', '', countsBlock, ''].join('\n');

const auditAppendix = ['## Appendix A：事件字段规则（生成）', '',
  ...Object.keys(A.EVENT_FIELDS).map((k) => '### ' + k + '\n\n' + table(['字段', '必填性', '规则'], A.EVENT_FIELDS[k].map((f) => ['`' + f.name + '`', f.presence, f.rule])) + '\n'),
  '## Appendix B：链头记录字段（生成）', '',
  ...Object.keys(A.CHAIN_FIELDS).map((k) => '### ' + k + '\n\n' + table(['字段', '必填性', '规则'], A.CHAIN_FIELDS[k].map((f) => ['`' + f.name + '`', f.presence, f.rule])) + '\n'),
  '## Appendix C：summary 与终端封存字段（生成）', '',
  table(['字段', '必填性', '规则'], A.SUMMARY_FIELDS.map((f) => ['`' + f.name + '`', f.presence, f.rule])), '',
  '## Appendix D：测试向量索引（生成）', '',
  '向量文件：`' + FILES.vectors + '`，' + vectorsBytes.length + ' 字节，SHA-256 `' + vectorsSha + '`。', '',
  table(['组', '名称', 'SHA-256 / 期望'], [
    ...vectors.valid.map((v) => ['valid', v.name, '`' + v.sha256 + '`']),
    ...vectors.events.map((v) => ['event', v.name, '`' + v.sha256 + '`']),
    ...vectors.chain.map((v) => ['chain', v.name, '`' + v.sha256 + '`']),
    ...vectors.summary.map((v) => ['summary', v.name, '`' + v.sha256 + '`']),
    ...vectors.negative.map((v) => ['negative', v.name, '`' + v.expect + '`']),
  ]), ''].join('\n');

if (!fs.existsSync(path.join(DIR, FILES.main)) || !fs.existsSync(path.join(DIR, FILES.audit))) {
  console.error('main/audit documents missing: refusing to publish a partial package');
  process.exit(1);
}
OUT.push([path.join(DIR, FILES.vectors), vectorsBytes]);
OUT.push([path.join(DIR, FILES.registry), Buffer.from(registryText, 'utf8')]);
OUT.push([path.join(DIR, FILES.tsv), Buffer.from(tsvText, 'utf8')]);
OUT.push(buildDoc(FILES.main, mainAppendix));
OUT.push(buildDoc(FILES.audit, auditAppendix));

// N12: validate everything above, then publish with rollback. No file is written before this point.
const backups = OUT.map(([p]) => [p, fs.existsSync(p) ? fs.readFileSync(p) : null]);
try {
  for (const [p, b] of OUT) fs.writeFileSync(p, b);
} catch (err) {
  for (const [p, old] of backups) {
    try { if (old === null) fs.unlinkSync(p); else fs.writeFileSync(p, old); } catch (e) { /* keep first error */ }
  }
  console.error('publish failed and rolled back: ' + err.message);
  process.exit(1);
}

console.log(JSON.stringify({
  vectors: { file: FILES.vectors, bytes: vectorsBytes.length, sha256: vectorsSha },
  registry: { file: FILES.registry, bytes: Buffer.byteLength(registryText, 'utf8'), sha256: registrySha },
  tsv: { file: FILES.tsv, bytes: Buffer.byteLength(tsvText, 'utf8'), sha256: sha256utf8(tsvText), rows: rows.length - 1, cols: HEAD.length },
  counts,
}, null, 2));
