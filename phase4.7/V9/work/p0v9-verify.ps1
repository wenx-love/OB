param([string]$Dir = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
# Independent verifier for the Phase 0 V9 package. Read-only; never executes C00-C20.
$dir = (Resolve-Path -LiteralPath $Dir).Path
$regPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json'
$vecPath = Join-Path $dir 'PHASE4.7-PHASE0-AUDIT-VECTORS-V9.json'
$tsvPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V9.tsv'
$script:failed = New-Object System.Collections.Generic.List[string]
$script:passed = 0
function Check([string]$name, [bool]$cond, [string]$detail) {
  if ($cond) { $script:passed++; Write-Host ('ok   ' + $name) }
  else { $script:failed.Add($name + ' :: ' + $detail); Write-Host ('FAIL ' + $name + ' :: ' + $detail) }
}
function ShaBytes([byte[]]$b) { $h = [Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($h.ComputeHash($b)) -replace '-', '').ToLower() } finally { $h.Dispose() } }
function ShaText([string]$t) { return ShaBytes ([Text.Encoding]::UTF8.GetBytes($t)) }
function U8([string]$t) { return [Text.Encoding]::UTF8.GetByteCount($t) }
function Esc([string]$s) { return $s.Replace('\', '\\').Replace('"', '\"') }
function CanonStrArray([string[]]$a) { return '[' + (($a | ForEach-Object { '"' + (Esc $_) + '"' }) -join ',') + ']' }

$utf8 = New-Object Text.UTF8Encoding($false)
$regText = [IO.File]::ReadAllText($regPath, $utf8)
$reg = $regText | ConvertFrom-Json
$vecText = [IO.File]::ReadAllText($vecPath, $utf8)
$vec = $vecText | ConvertFrom-Json

Check 'vectors sha equals registry' ((ShaBytes ([IO.File]::ReadAllBytes($vecPath))) -eq [string]$reg.audit.vectors_sha256) ([string]$reg.audit.vectors_sha256)
Check 'vectors bytes equals registry' (((Get-Item $vecPath).Length) -eq [long]$reg.audit.vectors_bytes) ([string]$reg.audit.vectors_bytes)

$vc = 0
foreach ($g in @('valid', 'parts', 'events', 'summaries', 'seals')) {
  foreach ($v in @($vec.$g)) { if ($null -eq $v) { continue }; Check ('sha ' + $g + '/' + $v.name) ((ShaText ([string]$v.canonical)) -eq [string]$v.sha256) ''; $vc++ }
}
foreach ($g in @('chains')) { foreach ($p in $vec.chains.PSObject.Properties) { foreach ($v in @($p.Value)) { Check ('sha chain/' + $v.name) ((ShaText ([string]$v.canonical)) -eq [string]$v.sha256) ''; $vc++ } } }
Check 'positive vectors 58' ($vc -eq 58) ([string]$vc)
Check 'negative count 41' (@($vec.negative).Count -eq 41) ([string]$vc)
$neg = @($vec.negative); $names = @(); foreach ($n in $neg) { $names += [string]$n.name; Check ('negative canonical ' + $n.name) ([string]$n.canonical -ne '') '' }
Check 'negative names unique' (($names | Select-Object -Unique).Count -eq 41) ''

$c01 = @(); foreach ($v in @($vec.chains.C01_genesis)) { $c01 += ($v.canonical | ConvertFrom-Json) }
$badSeq = 0; $badPrev = 0; $badBytes = 0
for ($i = 0; $i -lt $c01.Count; $i++) {
  $r = $c01[$i]
  if ($i -gt 0) {
    $p = $c01[$i - 1]
    if ([int]$r.chain_seq -ne ([int]$p.chain_seq + 1)) { $badSeq++ }
    if ([string]$r.prev_record_sha256 -ne (ShaText ([string]$vec.chains.C01_genesis[$i - 1].canonical))) { $badPrev++ }
    if ([long]$r.prev_file_bytes -ne ([long]$p.prev_file_bytes + (U8 ([string]$vec.chains.C01_genesis[$i - 1].canonical)) + 1)) { $badBytes++ }
  }
}
Check 'C01 chain seq' ($badSeq -eq 0) ([string]$badSeq)
Check 'C01 chain prev' ($badPrev -eq 0) ([string]$badPrev)
Check 'C01 chain bytes include LF' ($badBytes -eq 0) ([string]$badBytes)

Check 'commands 21' (@($reg.commands).Count -eq 21) ''
Check 'executions 58' (@($reg.executions).Count -eq 58) ''
Check 'records 109/103' (([int]$reg.counts.chain_records_bound -eq 109) -and ([int]$reg.counts.chain_records_unbound -eq 103)) ''
Check 'plans 58/55' (([int]$reg.counts.plan_bound -eq 58) -and ([int]$reg.counts.plan_unbound -eq 55)) ''
Check 'matrix rows 340' ([int]$reg.flow.matrix.rows -eq 340) ([string]$reg.flow.matrix.rows)
Check 'release root v9' ([string]$reg.release.source_root -eq 'D:\P47TOOLS\p47-phase0-v9') ''
Check 'last exec is SEAL' ([string]$reg.executions[57].exec_id -eq 'C20-SEAL-E01') ''

$bad = 0; $tb = 0; $order = 0
for ($i = 0; $i -lt @($reg.executions).Count; $i++) {
  $e = $reg.executions[$i]
  if ([int]$e.plan_order_bound -ne ($i + 1)) { $order++ }
  if ((ShaText (CanonStrArray ([string[]]@($e.argv)))) -ne [string]$e.argv_sha256) { $bad++ }
  if ($null -ne $e.target_argv) { if ((ShaText (CanonStrArray ([string[]]@($e.target_argv)))) -ne [string]$e.target_argv_sha256) { $tb++ } }
}
Check 'argv sha 58/58' ($bad -eq 0) ([string]$bad)
Check 'target argv sha all' ($tb -eq 0) ([string]$tb)
Check 'plan order 1..58' ($order -eq 0) ([string]$order)

$lines = [IO.File]::ReadAllLines($tsvPath, $utf8)
Check 'tsv lines 59' ($lines.Count -eq 59) ([string]$lines.Count)
$badCols = 0; foreach ($l in $lines) { if (($l.Split("`t")).Count -ne 38) { $badCols++ } }
Check 'tsv 38 columns' ($badCols -eq 0) ([string]$badCols)
$ids = @(); foreach ($l in $lines[1..($lines.Count - 1)]) { $ids += $l.Split("`t")[0] }
$rids = @(); foreach ($e in @($reg.executions)) { $rids += [string]$e.exec_id }
Check 'tsv order equals registry' (($ids -join ',') -eq ($rids -join ',')) ''
Check 'no V7 path in V9' (($regText -notmatch 'p47-phase0-v7') -and ([IO.File]::ReadAllText($tsvPath, $utf8) -notmatch 'p47-phase0-v7')) ''

$curPath = Join-Path $dir '_publish\CURRENT.json'
if (Test-Path $curPath) {
  $cur = [IO.File]::ReadAllText($curPath, $utf8) | ConvertFrom-Json
  $badFile = 0
  foreach ($f in @($cur.files)) {
    $p = Join-Path $dir ([string]$f.path)
    if (-not (Test-Path $p)) { $badFile++; continue }
    $b = [IO.File]::ReadAllBytes($p)
    if (($b.Length -ne [long]$f.bytes) -or ((ShaBytes $b) -ne [string]$f.sha256)) { $badFile++ }
  }
  Check 'CURRENT files match tree' ($badFile -eq 0) ([string]$badFile)
  $j = [IO.File]::ReadAllText((Join-Path $dir '_publish\journal.json'), $utf8) | ConvertFrom-Json
  Check 'journal verified' ([string]$j.state -eq 'verified') ([string]$j.state)
  Check 'journal rid equals CURRENT' ([string]$j.rid -eq [string]$cur.rid) ''
}

Write-Host ''
Write-Host ('registry  ' + (ShaBytes ([IO.File]::ReadAllBytes($regPath))))
Write-Host ('tsv       ' + (ShaBytes ([IO.File]::ReadAllBytes($tsvPath))))
Write-Host ('vectors   ' + (ShaBytes ([IO.File]::ReadAllBytes($vecPath))))
Write-Host ('passed    ' + $script:passed)
Write-Host ('failed    ' + $script:failed.Count)
foreach ($x in $script:failed) { Write-Host ('  - ' + $x) }
if ($script:failed.Count -gt 0) { exit 1 }
exit 0
