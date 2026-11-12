import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-verify.ps1'
t = io.open(p, encoding='utf-8').read()
t = t.replace("Check 'positive vectors 57' ($vc -eq 57)", "Check 'positive vectors 58' ($vc -eq 58)")
t = t.replace("Check 'negative count 35' (@($vec.negative).Count -eq 35)", "Check 'negative count 41' (@($vec.negative).Count -eq 41)")
t = t.replace("Check 'negative names unique' (($names | Select-Object -Unique).Count -eq 35)", "Check 'negative names unique' (($names | Select-Object -Unique).Count -eq 41)")
t = t.replace("Check 'matrix rows 306' ([int]$reg.flow.matrix.rows -eq 306)", "Check 'matrix rows 340' ([int]$reg.flow.matrix.rows -eq 340)")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('ps counts updated')
