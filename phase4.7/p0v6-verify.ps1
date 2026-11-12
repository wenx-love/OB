$ErrorActionPreference = 'Stop'
# Independent verifier for the Phase 0 V6 package. Read-only; never executes C00-C20.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$regPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V6.json'
$vecPath = Join-Path $dir 'PHASE4.7-PHASE0-AUDIT-VECTORS-V6.json'
$tsvPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V6.tsv'
$script:failed = New-Object System.Collections.Generic.List[string]
$script:passed = 0
function Check([string]$name, [bool]$cond, [string]$detail) {
  if ($cond) { $script:passed++; Write-Host ('ok   ' + $name) }
  else { $script:failed.Add($name + ' :: ' + $detail); Write-Host ('FAIL ' + $name + ' :: ' + $detail) }
}
function ShaBytes([byte[]]$b) { $h = [Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($h.ComputeHash($b)) -replace '-', '').ToLower() } finally { $h.Dispose() } }
function ShaText([string]$t) { return ShaBytes ([Text.Encoding]::UTF8.GetBytes($t)) }
function CanonStr([string]$s) { $e = $s.Replace('\', '\\'); $e = $e.Replace('"', '\"'); return '"' + $e + '"' }
function CanonStrArray([string[]]$a) { $items = @(); foreach ($x in $a) { $items += (CanonStr $x) }; return '[' + ($items -join ',') + ']' }
function U8([string]$t) { return [Text.Encoding]::UTF8.GetByteCount($t) }

$utf8 = New-Object Text.UTF8Encoding($false)
$regText = [IO.File]::ReadAllText($regPath, $utf8)
$reg = $regText | ConvertFrom-Json
$vecText = [IO.File]::ReadAllText($vecPath, $utf8)
$vec = $vecText | ConvertFrom-Json

Check 'vectors file sha equals registry' ((ShaBytes ([IO.File]::ReadAllBytes($vecPath))) -eq $reg.audit.vectors_sha256) $reg.audit.vectors_sha256
Check 'vectors bytes equals registry' (([IO.FileInfo]$vecPath).Length -eq [long]$reg.audit.vectors_bytes) ([string]$reg.audit.vectors_bytes)

$groups = @('valid', 'events', 'chain', 'summary')
$vc = 0
foreach ($g in $groups) {
  foreach ($v in @($vec.$g)) {
    if ($null -eq $v) { continue }
    Check ('vector sha ' + $g + '/' + $v.name) ((ShaText ([string]$v.canonical)) -eq [string]$v.sha256) ''
    Check ('vector bytes ' + $g + '/' + $v.name) ((U8 ([string]$v.canonical)) -eq [int]$v.bytes) ''
    $vc++
  }
}
Check 'vector count 15' ($vc -eq 15) ([string]$vc)
Check 'negative count 12' (@($vec.negative).Count -eq 12) ([string]@($vec.negative).Count)

$chain = @{}
foreach ($v in @($vec.chain)) { $chain[[string]$v.name] = $v }
$genesis = [string]$chain['genesis'].canonical
$open = [string]$chain['segment_open'].canonical
$close = [string]$chain['segment_close'].canonical
$g = $genesis | ConvertFrom-Json
$o = $open | ConvertFrom-Json
$c = $close | ConvertFrom-Json
Check 'genesis prev null' ($null -eq $g.prev_record_sha256) ''
Check 'open prev genesis' ([string]$o.prev_record_sha256 -eq [string]$chain['genesis'].sha256) ''
Check 'close prev open' ([string]$c.prev_record_sha256 -eq [string]$chain['segment_open'].sha256) ''
Check 'open physical bytes includes LF' ([long]$o.prev_file_bytes -eq (U8 $genesis) + 1) ([string]$o.prev_file_bytes)
Check 'close physical bytes includes LF' ([long]$c.prev_file_bytes -eq (U8 $genesis) + 1 + (U8 $open) + 1) ([string]$c.prev_file_bytes)
Check 'segment_open has c18 fields' (($null -ne $o.PSObject.Properties['c18_state']) -and ($null -ne $o.PSObject.Properties['c18_binding_sha256']) -and ($null -ne $o.PSObject.Properties['c18_destination'])) ''

$ev = @()
foreach ($v in @($vec.events)) { $ev += ([string]$v.canonical | ConvertFrom-Json) }
$sb = New-Object System.Text.StringBuilder
foreach ($v in @($vec.events)) { [void]$sb.Append([string]$v.canonical); [void]$sb.Append("`n") }
$partText = $sb.ToString()
Check 'part bytes includes LF' ((U8 $partText) -eq [int]$vec.jsonl.bytes_including_lf) ([string]$vec.jsonl.bytes_including_lf)
Check 'part sha includes LF' ((ShaText $partText) -eq [string]$vec.jsonl.sha256) ''
foreach ($e in $ev) { Check ('event id hex ' + $e.event_id) ([bool]($e.event_id -match '^[0-9a-f]{32}$')) ([string]$e.event_id) }
Check 'events same exec' ((@($ev | ForEach-Object { $_.exec_id }) | Select-Object -Unique).Count -eq 1) ''
Check 'intent id equals event id' ([string]$ev[0].intent_id -eq [string]$ev[0].event_id) ''
Check 'result references intent' ([string]$ev[1].intent_ref -eq [string]$ev[0].event_id) ''

Check 'commands 21' (@($reg.commands).Count -eq 21) ''
Check 'executions 58' (@($reg.executions).Count -eq 58) ''
Check 'participants 54' ([int]$reg.counts.chain_participants -eq 54) ''
Check 'records 109/103' (([int]$reg.counts.chain_records_bound -eq 109) -and ([int]$reg.counts.chain_records_unbound -eq 103)) ''
Check 'plans 58/55' (([int]$reg.counts.plan_bound -eq 58) -and ([int]$reg.counts.plan_unbound -eq 55)) ''
Check 'payload 20/16/4' (([int]$reg.release.payload_files -eq 20) -and ([int]$reg.release.staged_files -eq 16) -and ([int]$reg.release.bootstrap_files -eq 4)) ''
Check 'release root v6' ([string]$reg.release.source_root -eq 'D:\P47TOOLS\p47-phase0-v6') ''
Check 'last exec is SEAL' ([string]$reg.executions[57].exec_id -eq 'C20-SEAL-E01') ([string]$reg.executions[57].exec_id)
Check 'C18-BIND registered' (@($reg.executions | Where-Object { $_.exec_id -eq 'C18-BIND-E01' }).Count -eq 1) ''

$bad = 0; $tb = 0; $order = 0
$i = 0
foreach ($e in @($reg.executions)) {
  $i++
  if ([int]$e.plan_order_bound -ne $i) { $order++ }
  if ((ShaText (CanonStrArray ([string[]]@($e.argv)))) -ne [string]$e.argv_sha256) { $bad++ }
  if ($null -ne $e.target_argv) {
    if ((ShaText (CanonStrArray ([string[]]@($e.target_argv)))) -ne [string]$e.target_argv_sha256) { $tb++ }
  }
}
Check 'argv sha 58/58' ($bad -eq 0) ([string]$bad)
Check 'target argv sha all' ($tb -eq 0) ([string]$tb)
Check 'plan order 1..58' ($order -eq 0) ([string]$order)

$nullHashes = 0
foreach ($e in @($reg.executions)) { foreach ($t in @($e.tool_files)) { if ($null -ne $t.sha256) { $nullHashes++ } } }
Check 'no invented tool hashes' ($nullHashes -eq 0) ([string]$nullHashes)

$lines = [IO.File]::ReadAllLines($tsvPath, $utf8)
Check 'tsv lines 59' ($lines.Count -eq 59) ([string]$lines.Count)
$badCols = 0
foreach ($l in $lines) { if (($l.Split("`t")).Count -ne 31) { $badCols++ } }
Check 'tsv 31 columns' ($badCols -eq 0) ([string]$badCols)
$ids = @(); foreach ($l in $lines[1..($lines.Count - 1)]) { $ids += $l.Split("`t")[0] }
$rids = @(); foreach ($e in @($reg.executions)) { $rids += [string]$e.exec_id }
Check 'tsv order equals registry' (($ids -join ',') -eq ($rids -join ',')) ''

Check 'no V5 path in V6' (($regText -notmatch 'p47-phase0-v5') -and ([IO.File]::ReadAllText($tsvPath, $utf8) -notmatch 'p47-phase0-v5')) ''
Check 'no robocopy' ($regText -notmatch 'robocopy') ''

Write-Host ''
Write-Host ('registry  ' + (ShaBytes ([IO.File]::ReadAllBytes($regPath))))
Write-Host ('tsv       ' + (ShaBytes ([IO.File]::ReadAllBytes($tsvPath))))
Write-Host ('vectors   ' + (ShaBytes ([IO.File]::ReadAllBytes($vecPath))))
Write-Host ('passed    ' + $script:passed)
Write-Host ('failed    ' + $script:failed.Count)
foreach ($x in $script:failed) { Write-Host ('  - ' + $x) }
if ($script:failed.Count -gt 0) { exit 1 }
exit 0
