$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = 'D:\Projects\ob-recover'
$src = @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class P47Meta3 {
  [StructLayout(LayoutKind.Sequential)]
  public struct FILE_BASIC_INFO { public long CreationTime; public long LastAccessTime; public long LastWriteTime; public long ChangeTime; public uint FileAttributes; }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle h, int cls, out FILE_BASIC_INFO info, uint size);
  public static long ChangeTime(string path) {
    using (SafeFileHandle h = CreateFileW(path, 0x80, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
      if (h.IsInvalid) return -1;
      FILE_BASIC_INFO b;
      if (!GetFileInformationByHandleEx(h, 0, out b, (uint)Marshal.SizeOf(typeof(FILE_BASIC_INFO)))) return -1;
      return b.ChangeTime;
    }
  }
}
'@
Add-Type -TypeDefinition $src
$nm = @(Get-ChildItem -LiteralPath ($root + '\node_modules') -Recurse -Force)
$ct = foreach ($it in $nm) { [pscustomobject]@{ rel = $it.FullName.Substring($root.Length + 1); dir = $it.PSIsContainer; c = [P47Meta3]::ChangeTime($it.FullName) } }
'node_modules items=' + @($ct).Count + ' (files=' + @($ct | Where-Object { -not $_.dir }).Count + ' dirs=' + @($ct | Where-Object dir).Count + ') unreadable=' + @($ct | Where-Object { $_.c -lt 0 }).Count
'node_modules change-time histogram per minute:'
$ct | Where-Object { $_.c -ge 0 } | Group-Object { [DateTime]::FromFileTime($_.c).ToString('MM-dd HH:mm') } | Sort-Object Name | ForEach-Object { '  ' + $_.Name + '  items=' + $_.Count }
'node_modules items changed after 11-10 22:48:39:'
$ct | Where-Object { $_.c -ge 0 -and [DateTime]::FromFileTime($_.c) -gt (Get-Date '2026-11-10 22:48:39') } | Sort-Object c | ForEach-Object { '  ' + [DateTime]::FromFileTime($_.c).ToString('MM-dd HH:mm:ss') + '  ' + $(if ($_.dir) { '[dir] ' } else { '' }) + $_.rel }
$w = @($ct | Where-Object { $_.c -ge 0 -and [DateTime]::FromFileTime($_.c) -ge (Get-Date '2026-11-10 22:48:00') -and [DateTime]::FromFileTime($_.c) -lt (Get-Date '2026-11-10 22:49:00') } | Sort-Object c)
if ($w.Count -gt 0) { 'node_modules walk span: first=' + [DateTime]::FromFileTime($w[0].c).ToString('HH:mm:ss.fffffff') + ' last=' + [DateTime]::FromFileTime($w[-1].c).ToString('HH:mm:ss.fffffff') }
'non-script files that contain the hard-coded project root literal (root level and test-pages):'
Get-ChildItem -LiteralPath $root -File | Select-String -Pattern 'D:[/\\]+Projects[/\\]+ob-recover' -List | ForEach-Object { '  ' + $_.Path.Substring($root.Length + 1) }
Get-ChildItem -LiteralPath ($root + '\test-pages') -File -Recurse | Select-String -Pattern 'D:[/\\]+Projects[/\\]+ob-recover' -List | ForEach-Object { '  ' + $_.Path.Substring($root.Length + 1) }
'project-level maximum change time (no node_modules) is read from meta-scan-2.tsv:'
$m = Get-Content -LiteralPath 'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\meta-scan-2.tsv' -Encoding utf8 | ForEach-Object { $p = $_ -split "`t"; [pscustomobject]@{ rel = $p[0]; c = [long]$p[4] } } | Sort-Object c -Descending | Select-Object -First 3
$m | ForEach-Object { '  ' + [DateTime]::FromFileTime($_.c).ToString('MM-dd HH:mm:ss') + '  ' + $_.rel }
