import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-manifest.cjs'
t = io.open(p, encoding='utf-8').read()
# insert INPUTS after TOOLS array
marker = "function measure(files, name) {"
inputs = r'''const INPUTS = [
  'doc-src/PHASE4.7-PHASE0-START-CONDITIONS-V9.md',
  'doc-src/PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V9.tsv',
  'doc-src/PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json',
  'doc-src/PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V9.md',
  'doc-src/PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json',
  'doc-src/PHASE4.7-PHASE0-V9-FAILURE-MODEL.md',
  'doc-src/PHASE4.7-PHASE0-V9-PUBLISH-PROTOCOL.md',
  'doc-src/PHASE4.7-PHASE0-V9-N01-N12-TRACEABILITY.md',
  'doc-src/PHASE4.7-PHASE0-V9-OPEN-ISSUES.md',
  'doc-src/PHASE4.7-PHASE0-V9-SELF-CHECK.md',
  'doc-src/PHASE4.7-PHASE0-V9-RUNTIME-TOOLS-STATUS.md',
  'doc-src/PHASE4.7-PHASE0-V8-TO-V9-CHANGELOG.md',
];

'''
assert marker in t
t = t.replace(marker, inputs + marker, 1)
t = t.replace("'## 3. 复现',", "'## 4. 复现',")
t = t.replace("'## 4. 未交付（外部输入）',", "'## 5. 未交付（外部输入）',")
t = t.replace("'## 5. 未创建、未修改',", "'## 6. 未创建、未修改',")
t = t.replace("'## 6. 当前发布指针',", "'## 7. 当前发布指针',")
# insert inputs section before 复现
old = "    '## 4. 复现',"
new = "    '## 3. 生成输入（12 份）',\n    '',\n    '| 文件 | 字节 | 行数 | SHA-256 |',\n    '|---|---:|---:|---|',\n    ...INPUTS.map((f) => measure(files, f)),\n    '',\n    '这些模板是生成器 `p0v9-build.cjs` 的输入；它们与工具一起进入不可变 release，因此仅凭正式交付包即可复现。',\n    '',\n    '## 4. 复现',"
assert old in t
t = t.replace(old, new, 1)
t = t.replace("for (const f of CONTRACT.concat(TOOLS)) {", "for (const f of CONTRACT.concat(TOOLS, INPUTS)) {")
t = t.replace("module.exports = { renderManifest, regen, CONTRACT, TOOLS, OUT };", "module.exports = { renderManifest, regen, CONTRACT, TOOLS, INPUTS, OUT };")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('manifest patched')
