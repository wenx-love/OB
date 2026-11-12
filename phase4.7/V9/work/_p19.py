import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-manifest.cjs'
t = io.open(p, encoding='utf-8').read().replace('## 3. 生成输入（12 份）', '## 3. 生成输入（10 份）')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read().replace("eq('manifest rows 35', manRows.length, 35);", "eq('manifest rows 36', manRows.length, 36);")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\doc-src\PHASE4.7-PHASE0-V9-SELF-CHECK.md'
t = io.open(p, encoding='utf-8').read().replace('| 交付文件 | 36（13 契约 + 13 工具 + 10 doc-src 输入 + 清单自身） |',
                                                '| 交付文件 | 37（13 契约 + 13 工具 + 10 doc-src 输入 + 清单自身） |')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('counts updated')
