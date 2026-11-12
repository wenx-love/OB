import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
a = t.index('// historical immutability: V7 delivery hashes')
b = t.index('console.log(JSON.stringify({', a)
v8 = {
 'PHASE4.7-PHASE0-START-CONDITIONS-V8.md':'f189d4e3ca51965cc2f933430f5b67684c214be0b3994f8e171b53e12c4ac48b',
 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv':'eb0230c085a23ff34209b02161b56ffa22c9b4ced61996c390b63bdb40a1ecc5',
 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json':'edca94ff7b8b45794dcaac8fd316f147e06c2cdb655a8d6eabdd63ccad586c47',
 'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md':'b70004a7a2f9cc7f3cccea12062a296e12edfb42e80012d7c5c21d563bcd260c',
 'PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json':'5f302e3b68da4d264f2b72e95eaae6f865d69123a079cd723d34ebbf89223daa',
 'PHASE4.7-PHASE0-V8-FAILURE-MODEL.md':'dfd4e8778727395f65da06965f65a6747fed0edaccd49f0b65d71d920e208bb2',
 'PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md':'7cd0d9a72a7dd642e0e6844a2b167b741f3556b21af1de0a9d32d0555bd23dfd',
 'PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md':'7493f927c6adfe341faf804a96461a3f4ae5a16a2486d3c30a343d466fc80d3b',
 'PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md':'bb0566706eab350c48b493e19567740dbb5edaa6b78982472d5a5b352502ab87',
 'PHASE4.7-PHASE0-V8-OPEN-ISSUES.md':'a7ed266b0b0581fd9cb222cbf4dc948e76f0659de9d2d3443169fa21a05197ca',
 'PHASE4.7-PHASE0-V8-SELF-CHECK.md':'0c17a2ee58f32aa9f133bf6619ad1a9927bb3af77e3997d278489bb9bf2533b6',
 'PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md':'e4785d4d2851feb9604d88985f8ce547909f42b0733bcf16b67f248b8230b48c',
 'p0v8-lib.cjs':'0b5c606a2534494acd2989a14ecde546050afc73df555d00ade531d61596d58c',
 'p0v8-spec.cjs':'10481537da1148b0dbe9b54a14068e59e60a79f2271924edb1fcf1e48cbead10',
 'p0v8-flow.cjs':'d05cda5ed5da3971e533f710f9af580fa475047308a328a8dded3086a0765b68',
 'p0v8-audit.cjs':'5f43707271faa2c5dc823cb320e007fb009126171f438b5c1891426d812dbe4e',
 'p0v8-build.cjs':'64d74d892e12ee622837b9e406f426b662091407a2a4bdce5c5fa8d451a3d030',
 'p0v8-publish.cjs':'f6e43e26c96d02e39286db24d51030cb02496c818fdce63839a315e9a171d95a',
 'p0v8-check.cjs':'b77591df895c1f742426ad5a7946f0410b74fc033d99d617ae0389cb48362296',
 'p0v8-verify.ps1':'bd34bab8332d59cc1d9ebd258fe0d9fadc9eeb7b371666d20db179c7d3354d21',
 'p0v8-parse-inline.ps1':'d63dcbbb60103c3247052558d0791e9690574437dec410a1adf71851a8228c3d',
 'p0v8-hygiene.cjs':'1b71cc21f90a4d07274c557e62488b1b747f138c9a3dff29c61c65bb361fdcb1',
 'p0v8-controlconfig-check.cjs':'c4cacf47f3e281f717dd58a269a97b90fe446d1ae3463e82cd8b9c59fb863673',
 'p0v8-lab.cjs':'9b25144450867c8531fa49f1b0362701801b913780aaf4212e45c76229a8ae11',
 'p0v8-manifest.cjs':'fb06ac87c2970997264fecb4637434f8b8c7ccfb66295bb2d8650b310a833cc3',
 'PHASE4.7-PHASE0-V8-DELIVERY-MANIFEST.md':'b8d8cace4e21d9025f8dde98f05fedb541039242b1c97ca298c526d6a9ae5805',
}
lines = ['// historical immutability: V8 delivery hashes (from the eleventh review report)',
         'const V8 = {']
for k, v in v8.items():
    lines.append("  '%s': '%s'," % (k, v))
lines += ['};',
 'for (const [f, h] of Object.entries(V8)) {',
 '  const candidates = [path.join(DIR, \'..\', \'V8\', f), path.join(DIR, \'..\', \'..\', \'..\', \'V8\', f)];',
 '  const p = candidates.find((x) => fs.existsSync(x));',
 '  if (!p) { ok(\'V8 present \' + f, false); continue; }',
 '  eq(\'V8 immutable \' + f, sha(fs.readFileSync(p)), h);',
 '}',
 '',
]
t = t[:a] + '\n'.join(lines) + t[b:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('V8 immutability block set')
