import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\_publish\prestage\PHASE4.7-PHASE0-V9-DELIVERY-MANIFEST.md'
t = io.open(p, encoding='utf-8').read().split('\n')
rows = []
for x in t:
    if x.startswith('| `') and 'SHA-256' not in x:
        name = x.split('`')[1]
        if name.startswith(('PHASE4.7', 'p0v9', 'doc-src')):
            rows.append(name)
print(len(rows))
print('\n'.join(rows))
