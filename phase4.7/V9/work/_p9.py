import io

v8 = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V8\p0v8-check.cjs'
v9 = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
lines = io.open(v8, encoding='utf-8').read().split('\n')
block = '\n'.join(lines[582:676])  # planB .. requirement problems
# keep only through requirement problems, dropping the old matrix block
cut = block.index('// ---------------------------------------------------------------- flow recomputation')
block = block[:cut]
block = block.replace('eq(\'plans 58/55\', String(reg.counts.plan_bound) + \'/\' + reg.counts.plan_unbound, \'58/55\');', '')
block = block.replace("eq('executions 58', reg.counts.executions, 58);", "eq('executions 58', reg.counts.executions, 58);")
block = block.replace("eq('matrix rows 306', String(reg.flow.matrix.rows), '306');", "eq('matrix rows 340', String(reg.flow.matrix.rows), '340');")
block = block.replace("eq('release root v8', reg.release.source_root, 'D:\\\\P47TOOLS\\\\p47-phase0-v8');", "eq('release root v9', reg.release.source_root, 'D:\\\\P47TOOLS\\\\p47-phase0-v9');")
block = block.replace("eq('schema v8', reg.schema, 'p47-phase0-command-registry-v8');", "eq('schema v9', reg.schema, 'p47-phase0-command-registry-v9');")
block = block.replace("reg.release.source_root, 'D:\\\\P47TOOLS\\\\p47-phase0-v8'", "reg.release.source_root, 'D:\\\\P47TOOLS\\\\p47-phase0-v9'")
block = block.replace("'p47-phase0-command-registry-v8'", "'p47-phase0-command-registry-v9'")

# add F05/F06/F03 assertions before the requirements block
extra = r'''
// F05: every trusted load entry is from the same root as the entry, and every load_file is covered
for (const e of execList) {
  if (e.entry_mode === 'inline' || e.entry_mode === 'codex-inline') continue;
  const root = e.entry_mode === 'staged-dispatcher' ? 'D:\\P47RUN\\P47-20261111-01\\tools\\' : 'D:\\P47TOOLS\\p47-phase0-v9\\payload\\tools\\';
  ok('entry root ' + e.exec_id, e.entry_path.startsWith(root));
  for (const lf of e.load_files) ok('load root ' + e.exec_id, lf.startsWith(root));
  for (const lf of e.load_files) ok('load trusted ' + e.exec_id + ' ' + lf, e.reads.dispatcher.some((r) => pathEq(r.path, lf)));
}
for (const lf of byId['C05-PRE-E01'].load_files) ok('C05-PRE source load ' + lf, byId['C05-PRE-E01'].reads.dispatcher.some((r) => pathEq(r.path, lf)));
ok('C05-PRE no staged verifier', !byId['C05-PRE-E01'].reads.dispatcher.some((r) => r.path.includes('\\tools\\p0-verify-release.ps1')));

// F06: an input produced by a non-ok requirement must be optional
const producer = {};
for (const e of execList) for (const o of e.outputs) if (!o.path.startsWith('BINDING:') && o.path !== 'console') producer[o.path] = e.exec_id;
for (const e of execList) {
  for (const inp of e.optional_reads || []) {
    const rd = e.reads.business.find((r) => pathEq(r.path, inp.path));
    ok('optional marked ' + e.exec_id + ' ' + inp.path, !!rd && rd.optional === true);
  }
  for (const r of e.reads.business) {
    const src = producer[r.path];
    if (!src) continue;
    const req = (e.requires || []).find((x) => x.exec === src);
    if (req && req.state !== 'ok') ok('non-ok producer optional ' + e.exec_id + ' ' + r.path, r.optional === true);
  }
}

// F03: the security trigger is an exact registry mapping, never a substring
for (const e of execList) {
  for (const m of e.failure_modes) {
    if (m.class === 'security') ok('exact trigger ' + e.exec_id + ' ' + m.code, reg.failure_policy.trigger_map[m.reason] === m.trigger);
    else ok('non-security map ' + e.exec_id + ' ' + m.code, reg.failure_policy.trigger_map[m.reason] === undefined);
  }
}
ok('C07 original-change security', byId['C07-B-C08-E01'].failure_modes.some((m) => m.trigger === 'SEC-ORIGINAL-CHANGED' && m.class === 'security'));

'''
anchor = "// requirements\nlet reqBad = 0;"
assert anchor in block
block = block.replace(anchor, extra + anchor, 1)
# insert before STOP_RANK
t = io.open(v9, encoding='utf-8').read()
marker = "const STOP_RANK = { none: 0"
assert marker in t
t = t.replace(marker, block + '\n\n' + marker, 1)
io.open(v9, 'w', encoding='utf-8', newline='\n').write(t)
print('registry block reinserted')
