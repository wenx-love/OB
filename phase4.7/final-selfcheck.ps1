$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Final self-check of this planning round. Read-only on the project; writes only into the plan directory.
$root = 'D:\Projects\ob-recover'
$dir = 'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan'
$res = [ordered]@{}
$res.startedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

# 1. project file manifest (same fields and order as selfcheck-before.tsv)
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { $_.FullName -notlike ($root + '\node_modules\*') } | Sort-Object FullName)
$lines = foreach ($f in $files) { ($f.FullName.Substring($root.Length + 1)) + "`t" + $f.Length + "`t" + $f.LastWriteTimeUtc.Ticks + "`t" + $f.CreationTimeUtc.Ticks + "`t" + (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash.ToLower() }
[IO.File]::WriteAllLines($dir + '\selfcheck-after.tsv', [string[]]$lines, [Text.UTF8Encoding]::new($false))
$before = @(Get-Content -LiteralPath ($dir + '\selfcheck-before.tsv') -Encoding utf8)
$after = @(Get-Content -LiteralPath ($dir + '\selfcheck-after.tsv') -Encoding utf8)
$bMap = @{}; foreach ($l in $before) { $bMap[($l -split "`t")[0]] = $l }
$aMap = @{}; foreach ($l in $after) { $aMap[($l -split "`t")[0]] = $l }
$res.manifest = [ordered]@{
  filesBefore = $before.Count; filesAfter = $after.Count
  added = @($aMap.Keys | Where-Object { -not $bMap.ContainsKey($_) }).Count
  removed = @($bMap.Keys | Where-Object { -not $aMap.ContainsKey($_) }).Count
  changedLines = @($aMap.Keys | Where-Object { $bMap.ContainsKey($_) -and $bMap[$_] -ne $aMap[$_] }).Count
  sha256Before = (Get-FileHash -Algorithm SHA256 ($dir + '\selfcheck-before.tsv')).Hash.ToLower()
  sha256After = (Get-FileHash -Algorithm SHA256 ($dir + '\selfcheck-after.tsv')).Hash.ToLower()
}

# 2. per-file USN (same file set as usn-snapshot-1.tsv)
$u1 = @(Get-Content -LiteralPath ($dir + '\usn-snapshot-1.tsv') -Encoding utf8)
$uLines = New-Object System.Collections.Generic.List[string]
$usnDiff = New-Object System.Collections.Generic.List[string]
$usnMissing = 0; $maxUsn = [uint64]0; $maxRel = ''
foreach ($l in $u1) {
  $p = $l -split "`t"; $full = Join-Path $root $p[0]
  if (-not (Test-Path -LiteralPath $full)) { $usnMissing++; continue }
  $o = (fsutil usn readdata $full 2>&1)
  $u = ($o | Select-String -Pattern '^\s*Usn\s*:\s*(0x[0-9a-fA-F]+)' | Select-Object -First 1)
  $id = ($o | Select-String -Pattern 'File ?Ref#?\s*:\s*(0x[0-9a-fA-F]+)' | Select-Object -First 1)
  $uv = if ($u) { $u.Matches[0].Groups[1].Value } else { 'ERR' }
  $iv = if ($id) { $id.Matches[0].Groups[1].Value } else { '' }
  $uLines.Add($p[0] + "`t" + $uv + "`t" + $iv + "`t" + $p[3])
  if ($uv -ne $p[1] -or $iv -ne $p[2]) { $usnDiff.Add($p[0] + ' ' + $p[1] + ' -> ' + $uv) }
  if ($uv -ne 'ERR') { $n = [Convert]::ToUInt64($uv.Substring(2), 16); if ($n -gt $maxUsn) { $maxUsn = $n; $maxRel = $p[0] } }
}
[IO.File]::WriteAllLines($dir + '\usn-snapshot-2.tsv', [string[]]$uLines, [Text.UTF8Encoding]::new($false))
$res.usn = [ordered]@{
  filesChecked = $uLines.Count; missing = $usnMissing; differing = $usnDiff.Count; differingList = @($usnDiff | Select-Object -First 20)
  maxUsn = ('0x' + [Convert]::ToString([long]$maxUsn, 16)); maxUsnFile = $maxRel
  journalPositionAtRoundStart = '0x10e318b10'
  filesAtOrAboveRoundStart = @($uLines | Where-Object { $x = ($_ -split "`t")[1]; $x -ne 'ERR' -and [Convert]::ToUInt64($x.Substring(2), 16) -ge [Convert]::ToUInt64('10e318b10', 16) }).Count
}

# 3. metadata scan (creation, write, change time, attributes, file id, links, size) for every project file and directory
$env:P47_SCAN_TAG = '3'
$scanOut = (powershell -NoProfile -ExecutionPolicy Bypass -File ($dir + '\scan-meta-2.ps1') 2>&1 | ForEach-Object { "$_" })
$m2 = @(Get-Content -LiteralPath ($dir + '\meta-scan-2.tsv') -Encoding utf8)
$m3 = @(Get-Content -LiteralPath ($dir + '\meta-scan-3.tsv') -Encoding utf8)
$m2Map = @{}; foreach ($l in $m2) { $m2Map[($l -split "`t")[0]] = $l }
$metaDiff = New-Object System.Collections.Generic.List[string]
foreach ($l in $m3) { $k = ($l -split "`t")[0]; if (-not $m2Map.ContainsKey($k)) { $metaDiff.Add('added ' + $k) } elseif ($m2Map[$k] -ne $l) { $metaDiff.Add('changed ' + $k) } }
$m3Keys = @{}; foreach ($l in $m3) { $m3Keys[($l -split "`t")[0]] = 1 }
foreach ($k in $m2Map.Keys) { if (-not $m3Keys.ContainsKey($k)) { $metaDiff.Add('removed ' + $k) } }
$maxChange = ($m3 | ForEach-Object { $p = $_ -split "`t"; [pscustomobject]@{ rel = $p[0]; c = [long]$p[4] } } | Sort-Object c -Descending | Select-Object -First 1)
$res.meta = [ordered]@{
  itemsBefore = $m2.Count; itemsAfter = $m3.Count; differing = $metaDiff.Count; differingList = @($metaDiff | Select-Object -First 20)
  helperSelfCheck = @($scanOut | Where-Object { $_ -like 'helper self-check*' -or $_ -like 'cross-check*' })
  latestChangeTime = [DateTime]::FromFileTime($maxChange.c).ToString('yyyy-MM-dd HH:mm:ss'); latestChangeItem = $maxChange.rel
}

# 4. whole tree content (node_modules included) with the Node implementation
$env:NODE_NO_WARNINGS = '1'
$nodeOut = (node ($dir + '\gen-appendix.cjs') after 2>&1 | ForEach-Object { "$_" })
$n1 = @(Get-Content -LiteralPath ($dir + '\MANIFEST-plan-node-full.tsv') -Encoding utf8)
$n2 = @(Get-Content -LiteralPath ($dir + '\MANIFEST-after-node-full.tsv') -Encoding utf8)
$res.wholeTree = [ordered]@{
  filesBefore = $n1.Count; filesAfter = $n2.Count
  identical = ((Get-FileHash -Algorithm SHA256 ($dir + '\MANIFEST-plan-node-full.tsv')).Hash -eq (Get-FileHash -Algorithm SHA256 ($dir + '\MANIFEST-after-node-full.tsv')).Hash)
  differingLines = @(Compare-Object $n1 $n2).Count
  sha256 = (Get-FileHash -Algorithm SHA256 ($dir + '\MANIFEST-after-node-full.tsv')).Hash.ToLower()
  crossCheckLine = @($nodeOut | Where-Object { $_ -like 'cross-check*' })
}

# 5. the two node_modules cache items that vitest/vite write
$cache = [ordered]@{}
foreach ($rel in @('node_modules\.vite-temp', 'node_modules\.vite\vitest\da39a3ee5e6b4b0d3255bfef95601890afd80709\results.json')) {
  $it = Get-Item -LiteralPath (Join-Path $root $rel) -Force
  $cache[$rel] = [ordered]@{ lastWrite = $it.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'); children = $(if ($it.PSIsContainer) { @(Get-ChildItem -LiteralPath $it.FullName -Force).Count } else { $null }) }
}
$res.nodeModulesCache = $cache

# 6. environment
$res.journal = @((fsutil usn queryjournal D: 2>&1) | Select-String -Pattern 'Journal ID|Next Usn' | ForEach-Object { $_.Line.Trim() })
$res.processes = [ordered]@{
  chrome = @(Get-Process chrome -ErrorAction SilentlyContinue).Count
  nodeRunners = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -like '*vitest*' -or $_.CommandLine -like '*vite*build*' -or $_.CommandLine -like '*p47-*' -or $_.CommandLine -like '*tsc*') -and $_.CommandLine -notlike '*p47-worker-remediation-plan*' }).Count
  listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 9470, 9473, 9480, 9481, 8783, 8790, 8791 }).Count
}
$res.newestProjectFile = ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName.Substring($root.Length + 1) + ' @ ' + $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') })

# 7. hashes of the deliverables (everything in the plan directory except the result files themselves)
$deliver = [ordered]@{}
foreach ($f in (Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Name -notin 'SELFCHECK-RESULT.md', 'selfcheck-result.json' } | Sort-Object Name)) { $deliver[$f.Name] = [ordered]@{ bytes = $f.Length; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash.ToLower(); modified = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') } }
$res.deliverables = $deliver
$res.finishedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
[IO.File]::WriteAllText($dir + '\selfcheck-result.json', ($res | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))

'manifest: files ' + $res.manifest.filesBefore + ' -> ' + $res.manifest.filesAfter + ' added=' + $res.manifest.added + ' removed=' + $res.manifest.removed + ' changedLines=' + $res.manifest.changedLines
'usn: checked=' + $res.usn.filesChecked + ' missing=' + $res.usn.missing + ' differing=' + $res.usn.differing + ' max=' + $res.usn.maxUsn + ' (' + $res.usn.maxUsnFile + ') atOrAboveRoundStart=' + $res.usn.filesAtOrAboveRoundStart
'meta: items ' + $res.meta.itemsBefore + ' -> ' + $res.meta.itemsAfter + ' differing=' + $res.meta.differing + ' latestChange=' + $res.meta.latestChangeTime + ' (' + $res.meta.latestChangeItem + ')'
$res.meta.helperSelfCheck | ForEach-Object { '  ' + $_ }
'whole tree: files ' + $res.wholeTree.filesBefore + ' -> ' + $res.wholeTree.filesAfter + ' identical=' + $res.wholeTree.identical + ' differingLines=' + $res.wholeTree.differingLines
$res.wholeTree.crossCheckLine | ForEach-Object { '  ' + $_ }
'node_modules cache: ' + ($res.nodeModulesCache | ConvertTo-Json -Compress -Depth 4)
'journal: ' + ($res.journal -join ' | ')
'processes: chrome=' + $res.processes.chrome + ' nodeRunners=' + $res.processes.nodeRunners + ' listeners=' + $res.processes.listeners
'newest project file: ' + $res.newestProjectFile
'deliverables hashed: ' + $deliver.Count
