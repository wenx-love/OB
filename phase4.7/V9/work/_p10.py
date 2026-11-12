import io

# manifest changelog name
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-manifest.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace('PHASE4.7-PHASE0-V9-TO-V9-CHANGELOG.md', 'PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)

# C17 optional output roots + REPORT optional cutoff
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-spec.cjs'
t = io.open(p, encoding='utf-8').read()
old = "    optional_reads: [F(outDir('C07', 'C07-M1-E01') + '\\\\m1.json')] },"
new = """    optional_reads: [F(outDir('C07', 'C07-M1-E01') + '\\\\m1.json'),
      T(outRoot('C07')), T(outRoot('C08')), T(outRoot('C09')), T(outRoot('C10')), T(outRoot('C11')), T(outRoot('C12')),
      T(outRoot('C13')), T(outRoot('C14')), T(outRoot('C15')), T(outRoot('C16'))] },"""
assert old in t, 'C17 optional anchor missing'
t = t.replace(old, new, 1)
old2 = "    optional_reads: [F(P.BINDING_FILE), T(outRoot('C17'))], temp: tempR(P.TMP) },"
new2 = "    optional_reads: [F(P.BINDING_FILE), T(outRoot('C17')), F(outDir('C19', 'C19-E01') + '\\\\cutoff.json')], temp: tempR(P.TMP) },"
assert old2 in t, 'REPORT optional anchor missing'
t = t.replace(old2, new2, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)

# checker load-root checks
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
old3 = """for (const e of execList) {
  if (e.entry_mode === 'inline' || e.entry_mode === 'codex-inline') continue;
  const root = e.entry_mode === 'staged-dispatcher' ? 'D:\\\\P47RUN\\\\P47-20261111-01\\\\tools\\\\' : 'D:\\\\P47TOOLS\\\\p47-phase0-v9\\\\payload\\\\tools\\\\';
  ok('entry root ' + e.exec_id, e.entry_path.startsWith(root));
  for (const lf of e.load_files) ok('load root ' + e.exec_id, lf.startsWith(root));
  for (const lf of e.load_files) ok('load trusted ' + e.exec_id + ' ' + lf, e.reads.dispatcher.some((r) => pathEq(r.path, lf)));
}
for (const lf of byId['C05-PRE-E01'].load_files) ok('C05-PRE source load ' + lf, byId['C05-PRE-E01'].reads.dispatcher.some((r) => pathEq(r.path, lf)));
ok('C05-PRE no staged verifier', !byId['C05-PRE-E01'].reads.dispatcher.some((r) => r.path.includes('\\\\tools\\\\p0-verify-release.ps1')));"""
new3 = """const RELEASE_SRC = 'D:\\\\P47TOOLS\\\\p47-phase0-v9\\\\';
const RELEASE_STAGED = 'D:\\\\P47RUN\\\\P47-20261111-01\\\\tools\\\\';
for (const e of execList) {
  if (e.entry_mode === 'inline' || e.entry_mode === 'codex-inline') continue;
  const root = e.entry_mode === 'staged-dispatcher' ? RELEASE_STAGED : RELEASE_SRC;
  ok('entry root ' + e.exec_id, e.entry_path.startsWith(root));
  for (const lf of e.load_files) ok('load root ' + e.exec_id, lf.startsWith(root));
  for (const lf of e.load_files) ok('load trusted ' + e.exec_id + ' ' + lf, e.reads.dispatcher.some((r) => pathEq(r.path, lf)));
}
for (const lf of byId['C05-PRE-E01'].load_files) ok('C05-PRE source load ' + lf, byId['C05-PRE-E01'].reads.dispatcher.some((r) => pathEq(r.path, lf)));
ok('C05-PRE no staged verifier', !byId['C05-PRE-E01'].reads.dispatcher.some((r) => r.path.startsWith(RELEASE_STAGED)));"""
assert old3 in t, 'checker load block missing'
t = t.replace(old3, new3, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('patched manifest/spec/checker')
