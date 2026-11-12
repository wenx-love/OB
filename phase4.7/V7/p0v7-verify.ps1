$ErrorActionPreference = 'Stop'
# Independent verifier for the Phase 0 V7 package. Read-only; never executes C00-C20.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$regPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json'
$vecPath = Join-Path $dir 'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json'
$tsvPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv'
$script:failed = New-Object System.Collections.Generic.List[string]
$script:passed = 0
function Check([string]$name, [bool]$cond, [string]$detail) {
  if ($cond) { $script:passed++; Write-Host ('ok   ' + $name) }
  else { $script:failed.Add($name + ' :: ' + $detail); Write-Host ('FAIL ' + $name + ' :: ' + $detail) }
}
function ShaBytes([byte[]]$b) { $h = [Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($h.ComputeHash($b)) -replace '-', '').ToLower() } finally { $h.Dispose() } }
function ShaText([string]$t) { return ShaBytes ([Text.Encoding]::UTF8.GetBytes($t)) }
function U8([string]$t) { return [Text.Encoding]::UTF8.GetByteCount($t) }
function CanonStr([string]$s) { $e = $s.Replace('\', '\\'); $e = $e.Replace('"', '\"'); return '"' + $e + '"' }
function CanonStrArray([string[]]$a) { $items = @(); foreach ($x in $a) { $items += (CanonStr $x) }; return '[' + ($items -join ',') + ']' }

$utf8 = New-Object Text.UTF8Encoding($false)
$regText = [IO.File]::ReadAllText($regPath, $utf8)
$reg = $regText | ConvertFrom-Json
$vecText = [IO.File]::ReadAllText($vecPath, $utf8)
$vec = $vecText | ConvertFrom-Json

Check 'vectors file sha equals registry' ((ShaBytes ([IO.File]::ReadAllBytes($vecPath))) -eq $reg.audit.vectors_sha256) $reg.audit.vectors_sha256
Check 'vectors bytes equals registry' (([IO.FileInfo]$vecPath).Length -eq [long]$reg.audit.vectors_bytes) ([string]$reg.audit.vectors_bytes)

$vc = 0
foreach ($g in @('valid', 'events', 'chain', 'summary')) {
  foreach ($v in @($vec.$g)) {
    if ($null -eq $v) { continue }
    Check ('vector sha ' + $g + '/' + $v.name) ((ShaText ([string]$v.canonical)) -eq [string]$v.sha256) ''
    Check ('vector bytes ' + $g + '/' + $v.name) ((U8 ([string]$v.canonical)) -eq [int]$v.bytes) ''
    $vc++
  }
}
Check 'positive vector count 16' ($vc -eq 16) ([string]$vc)
Check 'negative count 12' (@($vec.negative).Count -eq 12) ([string]@($vec.negative).Count)
$negNames = @(); foreach ($n in @($vec.negative)) { $negNames += [string]$n.name; Check ('negative has canonical ' + $n.name) ([string]$n.canonical -ne '') '' }
Check 'negative names unique' (($negNames | Select-Object -Unique).Count -eq 12) ''

$chain = @{}; foreach ($v in @($vec.chain)) { $chain[[string]$v.name] = $v }
$g = [string]$chain['genesis'].canonical
$o = [string]$chain['segment_open'].canonical
$c = [string]$chain['segment_close'].canonical
$s = [string]$chain['segment_skip'].canonical
$go = $g | ConvertFrom-Json; $oo = $o | ConvertFrom-Json; $co = $c | ConvertFrom-Json; $so = $s | ConvertFrom-Json
Check 'open prev genesis' ([string]$oo.prev_record_sha256 -eq [string]$chain['genesis'].sha256) ''
Check 'close prev open' ([string]$co.prev_record_sha256 -eq [string]$chain['segment_open'].sha256) ''
Check 'skip prev close' ([string]$so.prev_record_sha256 -eq [string]$chain['segment_close'].sha256) ''
Check 'open prev bytes includes LF' ([long]$oo.prev_file_bytes -eq (U8 $g) + 1) ([string]$oo.prev_file_bytes)
Check 'close prev bytes includes LF' ([long]$co.prev_file_bytes -eq (U8 $g) + 1 + (U8 $o) + 1) ([string]$co.prev_file_bytes)
Check 'skip prev bytes includes LF' ([long]$so.prev_file_bytes -eq (U8 $g) + 1 + (U8 $o) + 1 + (U8 $c) + 1) ([string]$so.prev_file_bytes)
Check 'segment_open c18 fields' (($null -ne $oo.PSObject.Properties['c18_state']) -and ($null -ne $oo.PSObject.Properties['c18_binding_sha256']) -and ($null -ne $oo.PSObject.Properties['c18_destination'])) ''
Check 'segment_skip no segment dir' (($null -eq $so.PSObject.Properties['segment_dir']) -and ($null -eq $so.PSObject.Properties['summary_path'])) ''
$c19 = @($reg.executions | Where-Object { $_.exec_id -eq 'C19-E01' })[0]
Check 'C19 entry matches registry' ([string]$oo.entry_path -eq [string]$c19.entry_path) ([string]$oo.entry_path)
Check 'C19 args matches registry' ([string]$oo.args_sha256 -eq [string]$c19.argv_sha256) ''

$sb = New-Object System.Text.StringBuilder
foreach ($v in @($vec.events)) { [void]$sb.Append([string]$v.canonical); [void]$sb.Append("`n") }
$partText = $sb.ToString()
Check 'part bytes includes LF' ((U8 $partText) -eq [int]$vec.jsonl.bytes_including_lf) ([string]$vec.jsonl.bytes_including_lf)
Check 'part sha includes LF' ((ShaText $partText) -eq [string]$vec.jsonl.sha256) ''

Check 'commands 21' (@($reg.commands).Count -eq 21) ''
Check 'executions 58' (@($reg.executions).Count -eq 58) ''
Check 'records 109/103' (([int]$reg.counts.chain_records_bound -eq 109) -and ([int]$reg.counts.chain_records_unbound -eq 103)) ''
Check 'plans 58/55' (([int]$reg.counts.plan_bound -eq 58) -and ([int]$reg.counts.plan_unbound -eq 55)) ''
Check 'payload 20/16/4' (([int]$reg.release.payload_files -eq 20) -and ([int]$reg.release.staged_files -eq 16) -and ([int]$reg.release.bootstrap_files -eq 4)) ''
Check 'release root v7' ([string]$reg.release.source_root -eq 'D:\P47TOOLS\p47-phase0-v7') ''
Check 'last exec is SEAL' ([string]$reg.executions[57].exec_id -eq 'C20-SEAL-E01') ''

$bad = 0; $tb = 0; $order = 0; $i = 0
foreach ($e in @($reg.executions)) {
  $i++
  if ([int]$e.plan_order_bound -ne $i) { $order++ }
  if ((ShaText (CanonStrArray ([string[]]@($e.argv)))) -ne [string]$e.argv_sha256) { $bad++ }
  if ($null -ne $e.target_argv) { if ((ShaText (CanonStrArray ([string[]]@($e.target_argv)))) -ne [string]$e.target_argv_sha256) { $tb++ } }
}
Check 'argv sha 58/58' ($bad -eq 0) ([string]$bad)
Check 'target argv sha all' ($tb -eq 0) ([string]$tb)
Check 'plan order 1..58' ($order -eq 0) ([string]$order)

$lines = [IO.File]::ReadAllLines($tsvPath, $utf8)
Check 'tsv lines 59' ($lines.Count -eq 59) ([string]$lines.Count)
$badCols = 0; foreach ($l in $lines) { if (($l.Split("`t")).Count -ne 33) { $badCols++ } }
Check 'tsv 33 columns' ($badCols -eq 0) ([string]$badCols)
$ids = @(); foreach ($l in $lines[1..($lines.Count - 1)]) { $ids += $l.Split("`t")[0] }
$rids = @(); foreach ($e in @($reg.executions)) { $rids += [string]$e.exec_id }
Check 'tsv order equals registry' (($ids -join ',') -eq ($rids -join ',')) ''
Check 'no V6 path in V7' (($regText -notmatch 'p47-phase0-v6') -and ([IO.File]::ReadAllText($tsvPath, $utf8) -notmatch 'p47-phase0-v6')) ''

Write-Host ''
Write-Host ('registry  ' + (ShaBytes ([IO.File]::ReadAllBytes($regPath))))
Write-Host ('tsv       ' + (ShaBytes ([IO.File]::ReadAllBytes($tsvPath))))
Write-Host ('vectors   ' + (ShaBytes ([IO.File]::ReadAllBytes($vecPath))))
Write-Host ('passed    ' + $script:passed)
Write-Host ('failed    ' + $script:failed.Count)
foreach ($x in $script:failed) { Write-Host ('  - ' + $x) }
if ($script:failed.Count -gt 0) { exit 1 }
exit 0
