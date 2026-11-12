'use strict';
// Builds registry JSON, TSV, audit vectors and generated document appendices from one spec.
const fs = require('fs');
const path = require('path');
const L = require('./p0v5-lib.cjs');
const S = require('./p0v5-spec.cjs');
const A = require('./p0v5-audit.cjs');
const { P, ID, TOOLS, src, stg, canon, sha256utf8, sha256hex } = L;

const DIR = __dirname;
const FILES = {
  vectors: 'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json',
  registry: 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json',
  tsv: 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv',
  main: 'PHASE4.7-PHASE0-START-CONDITIONS-V5.md',
  audit: 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V5.md',
};
const GEN = '<!-- GENERATED:BEGIN (p0v5-build.cjs) -->';
const GEN_END = '<!-- GENERATED:END -->';

const toolPath = (e, id) => (e.entry === 'staged-dispatcher' ? stg(id) : src(id));
const isStagedTool = (e) => e.entry === 'staged-dispatcher';

// ------------------------------------------------------------------ vectors
const vectors = A.buildVectors();
const vectorsBytes = Buffer.from(canon(vectors), 'utf8');
fs.writeFileSync(path.join(DIR, FILES.vectors), vectorsBytes);
const vectorsSha = sha256hex(vectorsBytes);

// ------------------------------------------------------------- normalisation
const PLAN = S.PLAN.slice();
const order = new Map(PLAN.map((id, i) => [id, i + 1]));
const EXECS = S.EXECS.slice().sort((a, b) => order.get(a.id) - order.get(b.id));

const readEntry = (x) => ({ path: x.path, kind: x.scope === 'subtree' ? 'subtree' : x.scope === 'metadata' ? 'metadata' : 'file' });
const writeEntry = (o) => ({
  path: o.path, op: S.WCODE[o.code],
  kind: o.code === 'ML' ? 'map-list' : (['TC', 'TW', 'DC', 'ACL', 'EC'].includes(o.code) ? 'subtree' : 'file'),
  note: o.note || null,
});

function covered(entry, p) {
  const a = entry.path.toLowerCase();
  const b = p.toLowerCase();
  if (a === b) return true;
  return entry.kind === 'subtree' || entry.kind === 'map-list' ? b.startsWith(a + '\\') : false;
}
const coveredBy = (list, p) => list.some((e) => covered(e, p));

const DENY_CANDIDATES = [
  { label: 'ORIGINAL', p: P.ORIGINAL },
  { label: 'BASELINE/m0.json', p: P.M0 },
  { label: 'BASELINE/snapshot-01', p: P.SNAP },
  { label: 'PRISTINE', p: P.CP },
  { label: 'NO_PLUGIN', p: P.CN },
  { label: 'SANDBOX', p: P.CS },
  { label: 'EVIDENCE', p: P.EVIDENCE },
  { label: 'TRUST', p: P.TRUST },
  { label: 'REVIEW', p: P.REVIEW },
  { label: 'CONTROLS', p: P.CONTROLS },
  { label: 'AUDIT', p: P.AUDIT },
  { label: 'STAGED_TOOLS', p: P.STAGED },
];
function denyFor(reads, writes) {
  const out = [];
  const wl = writes.map((w) => ({ path: w.path, kind: w.kind }));
  for (const c of DENY_CANDIDATES) {
    if (coveredBy(reads, c.p)) continue;
    if (coveredBy(wl, c.p)) continue;
    out.push(c.p);
  }
  return out;
}

const PROTECT_BASE = [P.ORIGINAL, P.M0, P.CHAIN, P.TSEAL, P.RUN_PARENT];

const policyErrors = [];
for (const e of EXECS) {
  e.plan_order = order.get(e.id);
  e.entry_path = e.entry === 'inline' || e.entry === 'codex-inline' ? 'inline'
    : (e.entry === 'staged-dispatcher' ? stg('dispatch') : src('dispatch'));
  e.entry_sha256 = null;
  e.command_id = e.cmd;
  e.variant = e.variant || null;
  e.predecessor = e.plan_order > 1 ? PLAN[e.plan_order - 2] : null;
  e.tool_files = e.tools.map((id) => ({
    id, path: toolPath(e, id), role: TOOLS[id].role, sha256: null, sha_source: 'RELEASE-MANIFEST.json',
  }));

  const reads = [];
  for (const x of e.inputs) reads.push(readEntry(x));
  for (const t of e.tool_files) if (!reads.some((r) => r.path.toLowerCase() === t.path.toLowerCase())) reads.push({ path: t.path, kind: 'file' });
  e.business_reads = reads;
  e.metadata_reads = e.inputs.filter((x) => x.scope === 'metadata').map((x) => x.path);
  e.business_writes = e.outputs.filter((o) => o.code !== 'CONSOLE').map(writeEntry);
  e.console_outputs = e.outputs.filter((o) => o.code === 'CONSOLE').map((o) => o.note);
  e.dispatcher_reads = e.entry === 'inline' || e.entry === 'codex-inline' ? []
    : [{ path: P.MANIFEST, kind: 'file', note: 'approved manifest; dispatcher rechecks its own hash from the launch env' }];
  e.dispatcher_writes = [];
  e.control_reads = [];
  e.control_writes = [];
  if (e.chain === 'genesis') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail check' }];
    e.control_writes = [
      { path: P.CHAIN, op: 'file-create', kind: 'file', note: 'genesis, CreateNew' },
      { path: S.aD(e.cmd, e.id), op: 'dir-create', kind: 'subtree', note: 'segment dir' },
    ];
  } else if (e.chain === 'participant') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail read under exclusive open' }];
    e.control_writes = [
      { path: P.CHAIN, op: 'file-append', kind: 'file', note: 'segment_open / segment_close under exclusive open' },
      { path: S.aD(e.cmd, e.id), op: 'dir-create', kind: 'subtree', note: 'segment dir; must not exist' },
      { path: S.aD(e.cmd, e.id) + '\\summary.json', op: 'file-create', kind: 'file', note: 'CreateNew by the seal step' },
    ];
  } else if (e.chain === 'terminal') {
    e.control_reads = [{ path: P.CHAIN, kind: 'file', note: 'tail read only; no append' }];
    e.control_writes = [{ path: P.TSEAL, op: 'file-create', kind: 'file', note: 'CreateNew; last write of the run' }];
  }
  e.deny_read = denyFor(reads, e.business_writes);
  e.protect_write = PROTECT_BASE.slice();
  if (e.product && e.product.copy) {
    const cfg = (e.product.config || '').toLowerCase();
    if (!cfg.endsWith('vite.config.ts')) e.protect_write.push(e.product.copy + '\\dist');
    const ownOut = S.oD(e.cmd, e.id);
    e.product = {
      copy: e.product.copy, config: e.product.config, cwd: e.cwd,
      argv: e.target_argv || null, argv_sha256: e.target_argv ? L.argvSha(e.target_argv) : null,
      reads: [readEntry({ path: e.product.copy, scope: 'subtree' }), readEntry({ path: ownOut, scope: 'subtree' })],
      writes: e.business_writes.filter((w) => w.path.toLowerCase().startsWith(e.product.copy.toLowerCase() + '\\') || w.path.toLowerCase().startsWith(ownOut.toLowerCase() + '\\')),
    };
    e.product.reads = e.product.reads.concat(e.product.writes
      .filter((w) => w.path.toLowerCase().startsWith(e.product.copy.toLowerCase() + '\\'))
      .map((w) => ({ path: w.path, kind: 'file' })));
    e.product.deny_read = denyFor(e.product.reads, e.product.writes);
    e.product.protect_write = [P.ORIGINAL, P.M0, P.CHAIN, P.TSEAL, P.SNAP];
    e.product.policy_sha256 = sha256utf8(canon({
      deny: e.product.deny_read, read: e.product.reads.map((r) => [r.path, r.kind]),
      write: e.product.writes.map((w) => [w.path, w.op]), protect: e.product.protect_write,
    }));
  }
  if (e.guard) {
    const iconEnv = {};
    if (e.cmd === 'C12' || e.cmd === 'C16') {
      iconEnv.P0_ICON16_PRESENT = 'from initial manifest';
      iconEnv.P0_ICON48_PRESENT = 'from initial manifest';
      iconEnv.P0_ICON128_PRESENT = 'from initial manifest';
    }
    e.guard = {
      deny_read: e.deny_read, read_allow: reads, write_allow: e.business_writes,
      protect_write: e.protect_write, icon_env: iconEnv,
      policy_sha256: sha256utf8(canon({
        deny: e.deny_read, read: reads.map((r) => [r.path, r.kind]),
        write: e.business_writes.map((w) => [w.path, w.op]), protect: e.protect_write,
      })),
    };
    if (e.cmd === 'C14') e.guard.map_expansion = 'p0-neutralize.cjs expands the approved map to exact file paths before any write; the map-list entry is never a subtree permit';
  }
  for (const x of e.inputs) {
    if (!coveredBy(e.business_reads, x.path)) policyErrors.push(e.id + ' input not readable: ' + x.path);
  }
  for (const o of e.outputs) {
    if (o.code === 'CONSOLE' || o.path.startsWith('ENV:')) continue;
    if (!coveredBy(e.business_writes, o.path) && !coveredBy(e.control_writes, o.path)) policyErrors.push(e.id + ' output not writable: ' + o.path);
  }
  if (isStagedTool(e)) {
    for (const t of e.tool_files) if (!t.path.toLowerCase().startsWith(P.STAGED.toLowerCase() + '\\')) policyErrors.push(e.id + ' staged exec reads non-staged tool ' + t.path);
  }
}
if (policyErrors.length) { console.error(policyErrors.join('\n')); process.exit(1); }

// ---------------------------------------------------------------- accounting
const participants = EXECS.filter((e) => e.chain === 'participant' || e.chain === 'genesis');
const terminal = EXECS.filter((e) => e.chain === 'terminal');
const noChain = EXECS.filter((e) => e.chain === 'none');
const c18 = EXECS.filter((e) => e.id.includes('C18'));
const counts = {
  commands: new Set(EXECS.map((e) => e.cmd)).size,
  executions: EXECS.length,
  chain_participants: participants.length,
  chain_records_bound: 1 + 2 * participants.length,
  chain_records_unbound: 1 + 2 * (participants.length - c18.length),
  c18_executions: c18.length,
  non_chain_executions: noChain.length,
  terminal_executions: terminal.length,
  payload_files: Object.keys(TOOLS).length,
  staged_files: Object.keys(TOOLS).filter((k) => TOOLS[k].staged).length,
  bootstrap_files: Object.keys(TOOLS).filter((k) => !TOOLS[k].staged).length,
};

const commands = [...new Set(EXECS.map((e) => e.cmd))].sort().map((cmd) => {
  const es = EXECS.filter((e) => e.cmd === cmd);
  return {
    id: cmd, step: es[0].step, exec_ids: es.map((e) => e.id),
    variants: [...new Set(es.map((e) => e.variant).filter(Boolean))], count: es.length,
  };
});

const registry = {
  schema: 'p47-phase0-command-registry-v5',
  generated_by: 'p0v5-build.cjs (contract generator; never executes C00-C20)',
  run_id: P.RUN_ID, run: P.RUN, run_parent: P.RUN_PARENT, original: P.ORIGINAL,
  release: {
    release_id: 'p47-phase0-v5', manifest_schema: 'p47-phase0-tool-release-v2',
    source_root: P.SRC, approved_manifest_path: P.MANIFEST, staged_root: P.STAGED,
    bootstrap_root: P.SRC + '\\payload\\bootstrap',
    mapping: { from: 'payload/tools/<rel>', to: P.STAGED + '\\<rel>' },
    manifest_not_staged: true, bootstrap_not_staged: true,
    manifest_sha256_env: 'P0_TOOLSRC_MANIFEST_SHA256',
    payload_files: counts.payload_files, staged_files: counts.staged_files, bootstrap_files: counts.bootstrap_files,
    mapping_table: Object.keys(TOOLS).map((k) => ({
      id: k, role: TOOLS[k].role, source: P.SRC + '\\' + L.w(TOOLS[k].rel),
      staged: TOOLS[k].staged ? stg(k) : null,
    })),
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
    reparse_or_symlink: 'deny and stop',
    unlisted_read: 'content read and listing denied and recorded; a successful read of a deny root is fatal',
  },
  cache_policy: {
    vite: 'COPY\\node_modules\\.vite', vite_temp: 'COPY\\node_modules\\.vite-temp', copy_temp: 'COPY\\tmp',
    root_dot_vite_forbidden: true, temp_env: 'TEMP/TMP = COPY\\tmp',
  },
  trust: {
    anchors: [
      { id: 'H1', what: 'V5 contract files (registry, main doc, TSV, audit spec)', who: 'user approval record', when: 'before C00' },
      { id: 'H2', what: 'system powershell.exe and D:\\Nvm\\nodejs\\node.exe bytes', who: 'admin read-only check recorded in the launch approval record; C00 rechecks', when: 'before C00' },
      { id: 'H3', what: 'inline command text of C00-E01 and C03-PROBE-E01', who: 'operator compares argv_sha256/inline_sha256 to the observed command line', when: 'before launch' },
      { id: 'H4', what: 'P0_ADMIN_ACCOUNT_SID, P0_CODEX_ACCOUNT, P0_TOOLSRC_MANIFEST_SHA256, run id, quiet window', who: 'launch approval record', when: 'before C00' },
      { id: 'H5', what: 'RELEASE-MANIFEST.json bytes', who: 'user-approved SHA-256 in P0_TOOLSRC_MANIFEST_SHA256', when: 'before C00; rechecked by C00, C05-PRE, C05-FINAL, C20-SEAL' },
    ],
    staged_first_use: 'C05-FINAL uses the source dispatcher and verifies the staged tree; the staged dispatcher is first executed by C06 after C05-FINAL closes ok',
    c00_role: 'fail-fast gate, not a trust root; it cannot prove its own launch text (H3 is external)',
    manifest_hash_source: 'every tool file hash in this registry is null and MUST come from the approved RELEASE-MANIFEST.json; none is invented here',
  },
  audit: {
    spec: FILES.audit, vectors: FILES.vectors, vectors_sha256: vectorsSha, vectors_bytes: vectorsBytes.length,
    event_schema: A.AUDIT.schema_event, chain_schema: A.AUDIT.schema_chain,
    summary_schema: A.AUDIT.schema_summary, seal_schema: A.AUDIT.schema_seal,
    canonicalization: A.AUDIT.canon, hash: A.AUDIT.hash,
    chain_writer: A.AUDIT.chain_writer, chain_readers: A.AUDIT.chain_readers,
    chain_record_count_bound: counts.chain_records_bound, chain_record_count_unbound: counts.chain_records_unbound,
  },
  plan: {
    order: PLAN,
    c18: {
      condition_env: 'P0_SECOND_ARCHIVE', read_at: 'C07-B-C18-E01 only, once',
      when_unbound: ['C07-B-C18-E01 / C18-E01 / C07-A-C18-E01 are skipped and not executed',
        'C07-B-C19-E01 records c18_state=disabled-unbound in segment_open',
        'no second archive path is chosen; no fallback to TEMP; Phase 0 can only end exit-not-met'],
      when_bound: ['binding recorded in C07-B-C18-E01 segment_open as c18_binding_sha256 and c18_destination',
        'C18-E01 reads only that destination; failure is recorded as failed and the path never changes'],
    },
    abort: {
      trigger: 'any hard failure of an execution',
      allowed_after_failure: ['exactly one C07-A-<failed target>-E01 for the failed wrapped target',
        'C20-SEAL-E01 in aborted mode; no retry'],
      forbidden_after_failure: ['C19', 'C20-REPORT', 'any retry of the failed execution', 'any second C07-A'],
    },
  },
  counts, commands,
  executions: EXECS.map((e) => ({
    exec_id: e.id, command_id: e.cmd, variant: e.variant, step: e.step, phase: e.phase, plan_order: e.plan_order,
    executor: e.executor, entry_mode: e.entry, entry_path: e.entry_path, entry_sha256: e.entry_sha256,
    argv: e.argv, argv_sha256: e.argv_sha256, inline_sha256: e.inline_sha256 || null,
    cwd: e.cwd, stdin: e.stdin, required_env: e.env, deadline_seconds: e.deadline_seconds || null,
    tool_files: e.tool_files,
    reads: { dispatcher: e.dispatcher_reads, business: e.business_reads },
    writes: { dispatcher: e.dispatcher_writes, business: e.business_writes, control: e.control_writes },
    metadata_reads: e.metadata_reads, attempted_writes: (e.attempted_writes || []).map((x) => x.path),
    deny_read: e.deny_read, protect_write: e.protect_write,
    guard: e.guard || null, product: e.product || null,
    target_argv: e.target_argv || null, target_argv_sha256: e.target_argv ? L.argvSha(e.target_argv) : null,
    chain_role: e.chain, predecessor: e.predecessor, conditional: e.conditional || null,
    gate: e.gate, fail_closed: e.fail_closed, enforcement: e.enforcement,
    console_outputs: e.console_outputs,
  })),
};

const registryText = JSON.stringify(registry, null, 2);
if (Buffer.byteLength(registryText, 'utf8') > 1900000) { console.error('registry too large for ConvertFrom-Json'); process.exit(1); }
fs.writeFileSync(path.join(DIR, FILES.registry), registryText, 'utf8');
const registrySha = sha256utf8(registryText);

// ----------------------------------------------------------------------- TSV
const encR = (list) => list.map((r) => (r.kind === 'subtree' ? 'T:' : r.kind === 'metadata' ? 'M:' : 'F:') + r.path).join(';');
const encW = (list) => list.map((w) => w.op + ':' + w.path).join(';');
const HEAD = ['exec_id', 'command_id', 'variant', 'step', 'plan_order', 'executor', 'entry_mode', 'entry_path',
  'entry_sha256', 'cwd', 'argv_sha256', 'inline_sha256', 'chain_role', 'tool_files', 'dispatcher_reads',
  'business_reads', 'control_reads', 'dispatcher_writes', 'business_writes', 'control_writes', 'deny_read',
  'protect_write', 'guard_policy_sha256', 'predecessor', 'gate', 'outputs'];
const rows = [HEAD.join('\t')];
for (const e of EXECS) {
  rows.push([
    e.id, e.cmd, e.variant || '', e.step, String(e.plan_order), e.executor, e.entry, e.entry_path,
    (e.entry === 'inline' || e.entry === 'codex-inline') ? (e.inline_sha256 || '') : 'manifest-bound',
    e.cwd, e.argv_sha256, e.inline_sha256 || '', e.chain,
    e.tool_files.map((t) => t.path).join(';'),
    encR(e.dispatcher_reads), encR(e.business_reads), encR(e.control_reads),
    encW(e.dispatcher_writes), encW(e.business_writes), encW(e.control_writes),
    e.deny_read.join(';'), e.protect_write.join(';'), e.guard ? e.guard.policy_sha256 : '',
    e.predecessor || '', e.gate,
    e.outputs.filter((o) => o.code !== 'CONSOLE').map((o) => o.code + ':' + o.path).join(';'),
  ].join('\t'));
}
const tsvText = rows.join('\n') + '\n';
fs.writeFileSync(path.join(DIR, FILES.tsv), tsvText, 'utf8');

// ---------------------------------------------------------------- appendices
const esc = (s) => String(s).replace(/\|/g, '\\|');
const table = (head, body) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|',
  ...body.map((r) => '| ' + r.map(esc).join(' | ') + ' |')].join('\n');

const mapTable = table(['id', 'role', 'source', 'staged'],
  Object.keys(TOOLS).map((k) => {
    const m = registry.release.mapping_table.find((x) => x.id === k);
    return [k, TOOLS[k].role, '`' + m.source + '`', TOOLS[k].staged ? '`' + m.staged + '`' : 'not staged (bootstrap)'];
  }));

const planTable = table(['#', 'exec', 'command', 'entry', 'cwd'],
  EXECS.map((e) => [String(e.plan_order), e.id, e.cmd, e.entry, '`' + e.cwd + '`']));

const execTable = table(['#', 'exec', 'argv sha256', 'predecessor', 'gate'],
  EXECS.map((e) => [String(e.plan_order), e.id, '`' + (e.argv_sha256 || '') + '`', e.predecessor || '-', esc(e.gate)]));

const envTable = table(['exec', 'required env', 'stdin'],
  EXECS.filter((e) => Object.keys(e.env || {}).length || e.stdin !== 'none')
    .map((e) => [e.id, Object.entries(e.env || {}).map(([k, v]) => k + '=' + v).join('; '), e.stdin]));

const guardTable = table(['exec', 'deny_read', 'policy sha256'],
  EXECS.filter((e) => e.guard).map((e) => [e.id, e.deny_read.map((p) => '`' + p + '`').join('<br>'), '`' + e.guard.policy_sha256 + '`']));

const countsBlock = [
  '| 项 | 值 |', '|---|---|',
  '| 命令 ID | ' + counts.commands + ' |',
  '| 执行（exec） | ' + counts.executions + ' |',
  '| 链参与者 | ' + counts.chain_participants + ' |',
  '| 链记录（C18 绑定） | ' + counts.chain_records_bound + ' |',
  '| 链记录（C18 未绑定） | ' + counts.chain_records_unbound + ' |',
  '| 非链执行（C00、C05-PRE、C03-PROBE） | ' + counts.non_chain_executions + ' |',
  '| 终端封存执行 | ' + counts.terminal_executions + ' |',
  '| payload 文件 | ' + counts.payload_files + '（staged ' + counts.staged_files + ' / bootstrap ' + counts.bootstrap_files + '） |',
  '| 审计向量文件 SHA-256 | `' + vectorsSha + '`（' + vectorsBytes.length + ' 字节） |',
  '| 注册表 SHA-256 | `' + registrySha + '` |',
].join('\n');

function appendGenerated(file, block) {
  const p = path.join(DIR, file);
  let text = fs.readFileSync(p, 'utf8');
  const i = text.indexOf(GEN);
  if (i < 0) throw new Error(file + ': generated marker missing');
  text = text.slice(0, i) + GEN + '\n\n' + block.trim() + '\n\n' + GEN_END + '\n';
  fs.writeFileSync(p, text, 'utf8');
}

const mainAppendix = [
  '## Appendix B：固定路径与 20 个 payload 映射（生成）', '',
  'ReleaseSourceRoot=`' + P.SRC + '`；ApprovedManifestPath=`' + P.MANIFEST + '`；StagedRoot=`' + P.STAGED + '`；映射 `payload/tools/<rel>` → `' + P.STAGED + '\\<rel>`。manifest 与 4 个 bootstrap 文件不进入 staged 根。', '',
  mapTable, '',
  '## Appendix C：执行顺序（生成）', '',
  '共 ' + counts.executions + ' 次执行；C18 三连为条件组（未绑定时跳过）。', '',
  planTable, '',
  '## Appendix D：逐执行入口与 argv 哈希（生成）', '',
  execTable, '',
  '## Appendix E：执行环境与 stdin（生成）', '',
  envTable, '',
  '## Appendix F：Node 执行守卫策略（生成）', '',
  guardTable, '',
  '## Appendix G：计数（生成）', '',
  countsBlock, '',
].join('\n');

const auditAppendix = [
  '## Appendix A：事件字段规则（生成）', '',
  ...Object.keys(A.EVENT_FIELDS).map((k) => '### ' + k + '\n\n' + table(['字段', '必填性', '规则'], A.EVENT_FIELDS[k].map((f) => ['`' + f.name + '`', f.presence, f.rule])) + '\n'),
  '## Appendix B：链头记录字段（生成）', '',
  ...Object.keys(A.CHAIN_FIELDS).map((k) => '### ' + k + '\n\n' + table(['字段', '必填性', '规则'], A.CHAIN_FIELDS[k].map((f) => ['`' + f.name + '`', f.presence, f.rule])) + '\n'),
  '## Appendix C：summary 字段（生成）', '',
  table(['字段', '必填性', '规则'], A.SUMMARY_FIELDS.map((f) => ['`' + f.name + '`', f.presence, f.rule])), '',
  '## Appendix D：测试向量索引（生成）', '',
  '向量文件：`' + FILES.vectors + '`，' + vectorsBytes.length + ' 字节，SHA-256 `' + vectorsSha + '`。', '',
  table(['组', '名称', 'SHA-256'], [
    ...vectors.valid.map((v) => ['valid', v.name, '`' + v.sha256 + '`']),
    ...vectors.events.map((v) => ['event', v.name, '`' + v.sha256 + '`']),
    ...vectors.chain.map((v) => ['chain', v.name, '`' + v.sha256 + '`']),
    ...vectors.summary.map((v) => ['summary', v.name, '`' + v.sha256 + '`']),
  ]), '',
].join('\n');

if (fs.existsSync(path.join(DIR, FILES.main))) appendGenerated(FILES.main, mainAppendix);
if (fs.existsSync(path.join(DIR, FILES.audit))) appendGenerated(FILES.audit, auditAppendix);

console.log(JSON.stringify({
  vectors: { file: FILES.vectors, bytes: vectorsBytes.length, sha256: vectorsSha },
  registry: { file: FILES.registry, bytes: Buffer.byteLength(registryText, 'utf8'), sha256: registrySha },
  tsv: { file: FILES.tsv, bytes: Buffer.byteLength(tsvText, 'utf8'), sha256: sha256utf8(tsvText), rows: rows.length - 1 },
  counts,
}, null, 2));
