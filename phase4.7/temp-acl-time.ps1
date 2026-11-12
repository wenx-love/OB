$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Reads NTFS change times and ACLs of a few items under the user's TEMP directory (attributes only).
# Does not touch the project. Writes nothing.
$src = @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class P47Temp {
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
$fmt = { param($ft) if ($ft -lt 0) { 'ERR' } else { [DateTime]::FromFileTime([long]$ft).ToString('MM-dd HH:mm:ss.fff') } }
$t = 'C:\Users\Administrator\TEMP'
foreach ($p in @($t, ($t + '\opencode'))) { $p + ' | created=' + (Get-Item -LiteralPath $p -Force).CreationTime.ToString('yyyy-MM-dd HH:mm:ss') + ' | changed=' + (& $fmt ([P47Temp]::ChangeTime($p))) }
$top = @(Get-ChildItem -LiteralPath ($t + '\opencode') -Force)
$rows = foreach ($it in $top) { [pscustomobject]@{ name = $it.Name; dir = $it.PSIsContainer; created = $it.CreationTime; c = [P47Temp]::ChangeTime($it.FullName) } }
'top-level entries of TEMP\opencode: ' + @($rows).Count + ' ; change-time histogram per minute:'
$rows | Group-Object { if ($_.c -lt 0) { 'ERR' } else { [DateTime]::FromFileTime($_.c).ToString('MM-dd HH:mm') } } | Sort-Object Name | ForEach-Object { '  ' + $_.Name + '  items=' + $_.Count }
$cut = Get-Date '2026-11-10 22:48:00'
$old = @($rows | Where-Object { $_.created -lt $cut })
'entries created before 11-10 22:48: ' + $old.Count + ' ; of those, change time inside 11-10 22:48: ' + @($old | Where-Object { $_.c -ge 0 -and [DateTime]::FromFileTime($_.c).ToString('MM-dd HH:mm') -eq '11-10 22:48' }).Count
$w = @($rows | Where-Object { $_.c -ge 0 -and [DateTime]::FromFileTime($_.c) -ge (Get-Date '2026-11-10 22:40:00') -and [DateTime]::FromFileTime($_.c) -lt (Get-Date '2026-11-10 23:00:00') } | Sort-Object c)
if ($w.Count -gt 0) { 'span of top-level change times in 11-10 22:40..23:00: first=' + (& $fmt $w[0].c) + ' (' + $w[0].name + ') last=' + (& $fmt $w[-1].c) + ' (' + $w[-1].name + ') count=' + $w.Count } else { 'no top-level change times in 11-10 22:40..23:00' }
'backups:'
$rows | Where-Object { $_.name -like 'ob-backup-*' } | Sort-Object created | ForEach-Object { '  ' + $_.name + ' | created=' + $_.created.ToString('MM-dd HH:mm:ss') + ' | changed=' + (& $fmt $_.c) }
'inside the 21:37 backup:'
foreach ($rel in @('package.json', 'dist', 'dist\panel.js', 'test\fixtures\real-ob-sites\registry.json')) { $p = $t + '\opencode\ob-backup-p47-perf-20261110\' + $rel; if (Test-Path -LiteralPath $p) { '  ' + $rel + ' | written=' + (Get-Item -LiteralPath $p -Force).LastWriteTime.ToString('MM-dd HH:mm:ss') + ' | changed=' + (& $fmt ([P47Temp]::ChangeTime($p))) } else { '  ' + $rel + ' | missing' } }
'other reference items:'
foreach ($p in @(($t + '\opencode\l1-investigation\tsc-1.txt'), ($t + '\tsx-Administrator'))) { if (Test-Path -LiteralPath $p) { '  ' + $p + ' | written=' + (Get-Item -LiteralPath $p -Force).LastWriteTime.ToString('MM-dd HH:mm:ss') + ' | changed=' + (& $fmt ([P47Temp]::ChangeTime($p))) } else { '  ' + $p + ' | missing' } }
'explicit ACEs on TEMP: ' + (((Get-Acl -LiteralPath $t).Access | Where-Object { -not $_.IsInherited } | ForEach-Object { [string]$_.IdentityReference + ' = ' + [string]$_.FileSystemRights }) -join ' ; ')
'ACL of D:\Projects: ' + (((Get-Acl -LiteralPath 'D:\Projects').Access | ForEach-Object { [string]$_.IdentityReference + ' = ' + [string]$_.FileSystemRights + ' (inherited=' + $_.IsInherited + ')' }) -join ' ; ')
'ACL of D:\ : ' + (((Get-Acl -LiteralPath 'D:\').Access | ForEach-Object { [string]$_.IdentityReference + ' = ' + [string]$_.FileSystemRights }) -join ' ; ')
'SeChangeNotifyPrivilege (bypass traverse checking) in this session: ' + ((whoami /priv 2>&1 | Select-String -Pattern 'SeChangeNotifyPrivilege') -join ' ')
