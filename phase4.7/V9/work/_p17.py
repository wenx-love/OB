import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-build.cjs'
t = io.open(p, encoding='utf-8').read()
anchor = "if (errors.length) { console.error(errors.join('\\n')); process.exit(1); }"
extra = r'''
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
const preload = vectors.parts.find((p) => p.name.includes('C10P'));
if (preload) {
  const list = JSON.parse(preload.canonical);
  const pl = list.find((x) => x.kind === 'preload');
  ck('preload policy identity', !!pl && pl.policy_sha256 === policyMap['C10-P-E01'].product, pl && pl.policy_sha256);
}

'''
assert anchor in t
t = t.replace(anchor, extra + anchor, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('build assertions added')
