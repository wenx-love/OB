import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace("eq('manifest rows 25', manRows.length, 25);", "eq('manifest rows 34', manRows.length, 34);")
t = t.replace("'PHASE4.7-PHASE0-V7-TO-V9-CHANGELOG.md'", "'PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md'")
old = "'p0v9-controlconfig-check.cjs', 'p0v9-lab.cjs', 'p0v9-manifest.cjs']);"
new = """'p0v9-controlconfig-check.cjs', 'p0v9-lab.cjs', 'p0v9-manifest.cjs',
  'doc-src/PHASE4.7-PHASE0-START-CONDITIONS-V9.md', 'doc-src/PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md',
  'doc-src/PHASE4.7-PHASE0-V9-FAILURE-MODEL.md', 'doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',
  'doc-src/PHASE4.7-PHASE0-V9-OPEN-ISSUES.md', 'doc-src/PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md',
  'doc-src/PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md', 'doc-src/PHASE4.7-PHASE0-V9-SELF-CHECK.md',
  'doc-src/PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md']);"""
assert old in t
t = t.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('checker manifest expected updated')
