$ErrorActionPreference = 'Stop'
# Independent verifier for the Phase 0 V5 contract package.
# Read-only: it never executes C00-C20 and never creates D:\P47RUN or D:\P47TOOLS.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$regPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json'
$vecPath = Join-Path $dir 'PHASE4.7-PHASE0-AUDIT-VECTORS-V5.json'
$tsvPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V5.tsv'

$script:failed = New-Object System.Collections.Generic.List[string]
$script:passed = 0
function Check([string]$name, [bool]$cond, [string]$detail) {
  if ($cond) { $script:passed++; Write-Host ('ok   ' + $name) }
  else { $script:failed.Add($name + ' :: ' + $detail); Write-Host ('FAIL ' + $name + ' :: ' + $detail) }
}
function ShaBytes([byte[]]$b) {
  $h = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($h.ComputeHash($b)) -replace '-', '').ToLower() } finally { $h.Dispose() }
}
function ShaText([string]$t) { return ShaBytes ([Text.Encoding]::UTF8.GetBytes($t)) }
function CanonStr([string]$s) {
  $e = $s.Replace('\', '\\')
  $e = $e.Replace('"', '\"')
  return '"' + $e + '"'
}
function CanonStrArray([string[]]$a) {
  $items = @()
  foreach ($x in $a) { $items += (CanonStr $x) }
  return '[' + ($items -join ',') + ']'
}

$regText = [IO.File]::ReadAllText($regPath, (New-Object Text.UTF8Encoding($false)))
$reg = $regText | ConvertFrom-Json
$vecText = [IO.File]::ReadAllText($vecPath, (New-Object Text.UTF8Encoding($false)))
$vec = $vecText | ConvertFrom-Json

Check 'vectors file sha256 equals registry value' ((ShaBytes ([IO.File]::ReadAllBytes($vecPath))) -eq $reg.audit.vectors_sha256) $reg.audit.vectors_sha256
Check 'vectors bytes equals registry value' (([IO.FileInfo]$vecPath).Length -eq [long]$reg.audit.vectors_bytes) ([string]$reg.audit.vectors_bytes)

$groups = @('valid', 'events', 'chain', 'summary')
$vecCount = 0
foreach ($g in $groups) {
  foreach ($v in @($vec.$g)) {
    if ($null -eq $v) { continue }
    $h = ShaText ([string]$v.canonical)
    Check ('vector ' + $g + '/' + $v.name) ($h -eq $v.sha256) $h
    $vecCount++
  }
}
Check 'vector count' ($vecCount -eq 8 + 3 + 3 + 1) ([string]$vecCount)

$chain = @{}
foreach ($v in @($vec.chain)) { $chain[[string]$v.name] = $v }
$genesis = [string]$chain['genesis'].canonical | ConvertFrom-Json
$open = [string]$chain['segment_open'].canonical | ConvertFrom-Json
$close = [string]$chain['segment_close'].canonical | ConvertFrom-Json
Check 'genesis prev_record_sha256 is null' ($null -eq $genesis.prev_record_sha256) ''
Check 'open prev equals genesis sha' ([string]$open.prev_record_sha256 -eq [string]$chain['genesis'].sha256) ''
Check 'close prev equals open sha' ([string]$close.prev_record_sha256 -eq [string]$chain['segment_open'].sha256) ''
Check 'close prev_file_bytes equals genesis+open bytes' ([long]$close.prev_file_bytes -eq ([Text.Encoding]::UTF8.GetByteCount([string]$chain['genesis'].canonical) + [Text.Encoding]::UTF8.GetByteCount([string]$chain['segment_open'].canonical))) ''
Check 'chain_seq 1,2,3' (([int]$genesis.chain_seq -eq 1) -and ([int]$open.chain_seq -eq 2) -and ([int]$close.chain_seq -eq 3)) ''

$events = @()
foreach ($v in @($vec.events)) { $events += ([string]$v.canonical | ConvertFrom-Json) }
Check 'event seq contiguous' (([int]$events[0].seq -eq 1) -and ([int]$events[1].seq -eq 2) -and ([int]$events[2].seq -eq 3)) ''
Check 'event chain links' (([string]$events[1].prev_event_sha256 -eq (ShaText ([string]$vec.events[0].canonical))) -and ([string]$events[2].prev_event_sha256 -eq (ShaText ([string]$vec.events[1].canonical)))) ''
Check 'intent_id equals event_id' ([string]$events[0].intent_id -eq [string]$events[0].event_id) ''
Check 'result intent_ref equals intent id' ([string]$events[1].intent_ref -eq [string]$events[0].event_id) ''
Check 'intent has no outcome field' ($null -eq $events[0].outcome) ''

Check 'registry command count 21' (@($reg.commands).Count -eq 21) ([string]@($reg.commands).Count)
Check 'registry execution count 57' (@($reg.executions).Count -eq 57) ([string]@($reg.executions).Count)
Check 'last execution is C20-SEAL-E01' ([string]$reg.executions[56].exec_id -eq 'C20-SEAL-E01') ([string]$reg.executions[56].exec_id)
Check 'payload 20 / staged 16 / bootstrap 4' (([int]$reg.counts.payload_files -eq 20) -and ([int]$reg.counts.staged_files -eq 16) -and ([int]$reg.counts.bootstrap_files -eq 4)) ''
Check 'chain records 107 and 101' (([int]$reg.counts.chain_records_bound -eq 107) -and ([int]$reg.counts.chain_records_unbound -eq 101)) ''
Check 'release source root' ([string]$reg.release.source_root -eq 'D:\P47TOOLS\p47-phase0-v5') ([string]$reg.release.source_root)
Check 'approved manifest path' ([string]$reg.release.approved_manifest_path -eq 'D:\P47TOOLS\p47-phase0-v5\RELEASE-MANIFEST.json') ''
Check 'staged root' ([string]$reg.release.staged_root -eq 'D:\P47RUN\P47-20261111-01\tools') ''

$argvBad = 0
$inlineBad = 0
$orderBad = 0
$i = 0
foreach ($e in @($reg.executions)) {
  $i++
  if ([int]$e.plan_order -ne $i) { $orderBad++ }
  $canon = CanonStrArray ([string[]]@($e.argv))
  if ((ShaText $canon) -ne [string]$e.argv_sha256) { $argvBad++; Write-Host ('argv mismatch ' + $e.exec_id) }
  if (($e.entry_mode -eq 'inline') -or ($e.entry_mode -eq 'codex-inline')) {
    $last = [string]@($e.argv)[@($e.argv).Count - 1]
    if ((ShaText $last) -ne [string]$e.inline_sha256) { $inlineBad++; Write-Host ('inline mismatch ' + $e.exec_id) }
  }
  if ($null -ne $e.entry_sha256) { Write-Host ('unexpected non-null entry hash ' + $e.exec_id) }
}
Check 'argv sha256 recomputed for all executions' ($argvBad -eq 0) ([string]$argvBad)
Check 'inline sha256 recomputed' ($inlineBad -eq 0) ([string]$inlineBad)
Check 'plan_order is 1..57' ($orderBad -eq 0) ([string]$orderBad)

$hashInvented = 0
foreach ($e in @($reg.executions)) { foreach ($t in @($e.tool_files)) { if (($null -ne $t.sha256) -or ([string]$t.sha_source -ne 'RELEASE-MANIFEST.json')) { $hashInvented++ } } }
Check 'no invented tool hash' ($hashInvented -eq 0) ([string]$hashInvented)

$chainAppend = 0
foreach ($e in @($reg.executions)) {
  if ([string]$e.chain_role -eq 'participant') {
    $found = $false
    foreach ($w in @($e.writes.control)) { if (([string]$w.path -eq 'D:\P47RUN\P47-20261111-01\out\audit\chain-head.jsonl') -and ([string]$w.op -eq 'file-append')) { $found = $true } }
    if (-not $found) { $chainAppend++ }
  }
}
Check 'every participant appends the chain' ($chainAppend -eq 0) ([string]$chainAppend)

$tsvLines = [IO.File]::ReadAllLines($tsvPath, (New-Object Text.UTF8Encoding($false)))
Check 'tsv has header + 57 rows' ($tsvLines.Count -eq 58) ([string]$tsvLines.Count)
$badCols = 0
foreach ($l in $tsvLines) { if (($l.Split("`t")).Count -ne 26) { $badCols++ } }
Check 'tsv every row has 26 columns' ($badCols -eq 0) ([string]$badCols)
$tsvIds = @()
foreach ($l in $tsvLines[1..($tsvLines.Count - 1)]) { $tsvIds += $l.Split("`t")[0] }
$regIds = @()
foreach ($e in @($reg.executions)) { $regIds += [string]$e.exec_id }
Check 'tsv exec order equals registry' (($tsvIds -join ',') -eq ($regIds -join ',')) ''

$regRaw = $regText
$tsvRaw = [IO.File]::ReadAllText($tsvPath, (New-Object Text.UTF8Encoding($false)))
Check 'no V4 path in registry or tsv' (($regRaw -notmatch 'p47-phase0-v4') -and ($tsvRaw -notmatch 'p47-phase0-v4')) ''
Check 'no robocopy registration' ($regRaw -notmatch 'robocopy') ''
Check 'no dropped bootstrap dir' ($regRaw -notmatch 'P47-20261111-01\\bootstrap') ''

$f1 = ShaBytes ([IO.File]::ReadAllBytes($regPath))
$f2 = ShaBytes ([IO.File]::ReadAllBytes($tsvPath))
Write-Host ''
Write-Host ('registry  ' + $f1)
Write-Host ('tsv       ' + $f2)
Write-Host ('vectors   ' + (ShaBytes ([IO.File]::ReadAllBytes($vecPath))))
Write-Host ('passed    ' + $script:passed)
Write-Host ('failed    ' + $script:failed.Count)
foreach ($x in $script:failed) { Write-Host ('  - ' + $x) }
if ($script:failed.Count -gt 0) { exit 1 }
exit 0
