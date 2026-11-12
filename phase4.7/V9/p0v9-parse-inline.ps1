param([string]$Dir = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
# Parses the two inline PowerShell scripts in the registry. Parser only: never evaluates them.
$dir = (Resolve-Path -LiteralPath $Dir).Path
$reg = [IO.File]::ReadAllText((Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V9.json'), (New-Object Text.UTF8Encoding($false))) | ConvertFrom-Json
$bad = 0; $count = 0
foreach ($id in @('C00-E01', 'C03-PROBE-E01')) {
  $e = @($reg.executions | Where-Object { $_.exec_id -eq $id })[0]
  $idx = [Array]::IndexOf([string[]]$e.argv, '-Command')
  if ($idx -lt 0 -or $idx + 1 -ge $e.argv.Count) { Write-Host ('FAIL no -Command for ' + $id); $bad++; continue }
  $text = [string]$e.argv[$idx + 1]
  $tokens = $null; $errs = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errs)
  if ($errs.Count -ne 0) { Write-Host ('FAIL parse ' + $id + ': ' + $errs[0].Message); $bad++; continue }
  foreach ($t in $tokens) {
    if ($t.Kind -eq 'Command' -and @('Start-Process', 'Invoke-WebRequest', 'Invoke-Expression', 'iex', 'New-Object') -contains $t.Text) {
      Write-Host ('FAIL forbidden command ' + $id + ': ' + $t.Text); $bad++
    }
  }
  $count++
}
Write-Host ('inline scripts parsed: ' + $count)
Write-Host ('failed: ' + $bad)
if ($bad -gt 0) { exit 1 }
exit 0
