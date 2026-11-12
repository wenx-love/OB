$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Last read-only confirmation of this planning round. Reads attributes only (no file content).
# Writes only postcheck.json in the plan directory (outside the project).
$root = 'D:\Projects\ob-recover'
$dir = 'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan'
$src = @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class P47Post {
  [StructLayout(LayoutKind.Sequential)]
  public struct FILE_BASIC_INFO { public long CreationTime; public long LastAccessTime; public long LastWriteTime; public long ChangeTime; public uint FileAttributes; }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle h, int cls, out FILE_BASIC_INFO info, uint size);
  // FILE_READ_ATTRIBUTES only; FILE_FLAG_BACKUP_SEMANTICS so directories can be opened.
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
$res = [ordered]@{}
$res.takenAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

# 1. size, last write time and creation time of every project file versus the manifest taken at the start of the round
$before = @{}
foreach ($l in (Get-Content -LiteralPath ($dir + '\selfcheck-before.tsv') -Encoding utf8)) { $p = $l -split "`t"; $before[$p[0]] = $p[1] + "`t" + $p[2] + "`t" + $p[3] }
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { $_.FullName -notlike ($root + '\node_modules\*') })
$now = @{}
foreach ($f in $files) { $now[$f.FullName.Substring($root.Length + 1)] = ([string]$f.Length) + "`t" + $f.LastWriteTimeUtc.Ticks + "`t" + $f.CreationTimeUtc.Ticks }
$res.files = $files.Count
$res.manifestFiles = $before.Count
$res.countMatches = ($files.Count -eq $before.Count)
$res.added = @($now.Keys | Where-Object { -not $before.ContainsKey($_) }).Count
$res.removed = @($before.Keys | Where-Object { -not $now.ContainsKey($_) }).Count
$res.changed = @($now.Keys | Where-Object { $before.ContainsKey($_) -and $before[$_] -ne $now[$_] }).Count

# 2. NTFS change time of every item in the whole tree (files and directories, node_modules included)
$items = @(Get-Item -LiteralPath $root) + @(Get-ChildItem -LiteralPath $root -Recurse -Force)
$midnight = (Get-Date '2026-11-11 00:00:00').ToFileTime()
$unreadable = 0
$today = New-Object System.Collections.Generic.List[string]
$pMax = [long]0; $pItem = ''; $pCount = 0
$nMax = [long]0; $nItem = ''; $nCount = 0
foreach ($it in $items) {
  $c = [P47Post]::ChangeTime($it.FullName)
  if ($c -lt 0) { $unreadable++; continue }
  $rel = if ($it.FullName -eq $root) { '.' } else { $it.FullName.Substring($root.Length + 1) }
  if ($c -ge $midnight) { $today.Add($rel) }
  if ($rel.StartsWith('node_modules\')) { $nCount++; if ($c -gt $nMax) { $nMax = $c; $nItem = $rel } }
  else { $pCount++; if ($c -gt $pMax) { $pMax = $c; $pItem = $rel } }
}
$res.treeItems = $items.Count
$res.treeUnreadable = $unreadable
$res.projectItems = $pCount
$res.projectMaxChange = [DateTime]::FromFileTime($pMax).ToString('yyyy-MM-dd HH:mm:ss')
$res.projectMaxChangeItem = $pItem
$res.nodeModulesItems = $nCount
$res.nodeModulesMaxChange = [DateTime]::FromFileTime($nMax).ToString('yyyy-MM-dd HH:mm:ss')
$res.nodeModulesMaxChangeItem = $nItem
$res.changedSinceMidnight = $today.Count
$res.changedSinceMidnightList = @($today | Select-Object -First 20)
[IO.File]::WriteAllText($dir + '\postcheck.json', ($res | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
($res | ConvertTo-Json -Depth 4 -Compress)
