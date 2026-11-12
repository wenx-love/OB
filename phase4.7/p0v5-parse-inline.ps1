$ErrorActionPreference = 'Stop'
# Parse-only syntax check of the two inline PowerShell executions. No execution.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$regPath = Join-Path $dir 'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V5.json'
$regText = [IO.File]::ReadAllText($regPath, (New-Object Text.UTF8Encoding($false)))
$reg = $regText | ConvertFrom-Json
$fail = 0
foreach ($e in @($reg.executions)) {
  if (($e.entry_mode -eq 'inline') -or ($e.entry_mode -eq 'codex-inline')) {
    $argv = @($e.argv)
    $text = [string]$argv[$argv.Count - 1]
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errors)
    $n = 0
    if ($null -ne $errors) { $n = @($errors).Count }
    if ($n -eq 0) { Write-Host ('ok   parse ' + $e.exec_id + ' (' + $text.Length + ' chars, ' + @($tokens).Count + ' tokens)') }
    else {
      $fail++
      Write-Host ('FAIL parse ' + $e.exec_id + ' errors=' + $n)
      foreach ($x in @($errors)) { Write-Host ('     ' + $x.Message) }
    }
  }
}
if ($fail -gt 0) { exit 1 }
Write-Host 'inline parse checks passed (no execution)'
exit 0
