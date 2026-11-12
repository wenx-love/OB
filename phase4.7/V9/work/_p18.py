import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-build.cjs'
t = io.open(p, encoding='utf-8').read()
block = """const preload = vectors.parts.find((p) => p.name.includes('C10P'));
if (preload) {
  const list = JSON.parse(preload.canonical);
  const pl = list.find((x) => x.kind === 'preload');
  ck('preload policy identity', !!pl && pl.policy_sha256 === policyMap['C10-P-E01'].product, pl && pl.policy_sha256);
}
"""
assert block in t
t = t.replace(block + '\n', '', 1)
anchor = 'const vectorsSha = sha256hex(vectorsBytes);'
assert anchor in t
t = t.replace(anchor, anchor + '\n' + block, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('moved preload check')
