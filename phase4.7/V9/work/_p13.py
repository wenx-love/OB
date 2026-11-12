import io

# build files + docs
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-build.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace("  trace: 'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',",
              "  trace: 'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',\n  traceF: 'PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md',")
t = t.replace("for (const f of [FILES.failure, FILES.publish, FILES.changelog, FILES.trace, FILES.open, FILES.runtime]) docs[f] = plain(f);",
              "for (const f of [FILES.failure, FILES.publish, FILES.changelog, FILES.trace, FILES.traceF, FILES.open, FILES.runtime]) docs[f] = plain(f);")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)

# manifest contract + inputs
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-manifest.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace("  'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',",
              "  'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',\n  'PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md',")
t = t.replace("  'doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',",
              "  'doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',\n  'doc-src/PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md',")
t = t.replace("'## 1. 契约文件（12 份）'", "'## 1. 契约文件（13 份）'")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)

# checker expected + rows
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace("eq('manifest rows 34', manRows.length, 34);", "eq('manifest rows 35', manRows.length, 35);")
t = t.replace("'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md', 'PHASE4.7-PHASE0-V9-OPEN-ISSUES.md'",
              "'PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md', 'PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md', 'PHASE4.7-PHASE0-V9-OPEN-ISSUES.md'")
t = t.replace("'doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',",
              "'doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md', 'doc-src/PHASE4.7-PHASE0-V9-F01-F14-TRACEABILITY.md',")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('wired F trace doc')
