import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-lib.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace('p47-phase0-tool-release-v4', 'p47-phase0-tool-release-v5')
t = t.replace('p0-audit-vectors-v4.json', 'p0-audit-vectors-v9.json')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-spec.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace('p47-phase0-tool-release-v4', 'p47-phase0-tool-release-v5')
t = t.replace('p47-c03-probe-v3', 'p47-c03-probe-v4')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('release schema v5')
