$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = 'D:\Projects\ob-recover'
$dir = 'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan'
# Corrected helper: BY_HANDLE_FILE_INFORMATION uses FILETIME (two DWORDs, 4-byte alignment), so Pack = 4 is required.
$src = @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class P47Meta2 {
  [StructLayout(LayoutKind.Sequential)]
  public struct FILE_BASIC_INFO { public long CreationTime; public long LastAccessTime; public long LastWriteTime; public long ChangeTime; public uint FileAttributes; }
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct BY_HANDLE_FILE_INFORMATION { public uint FileAttributes; public long CreationTime; public long LastAccessTime; public long LastWriteTime; public uint VolumeSerialNumber; public uint FileSizeHigh; public uint FileSizeLow; public uint NumberOfLinks; public uint FileIndexHigh; public uint FileIndexLow; }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle h, int cls, out FILE_BASIC_INFO info, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle h, out BY_HANDLE_FILE_INFORMATION info);
  public static int SizeOfByHandle() { return Marshal.SizeOf(typeof(BY_HANDLE_FILE_INFORMATION)); }
  public static string Read(string path) {
    using (SafeFileHandle h = CreateFileW(path, 0x80, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
      if (h.IsInvalid) return "ERR:" + Marshal.GetLastWin32Error();
      FILE_BASIC_INFO b;
      if (!GetFileInformationByHandleEx(h, 0, out b, (uint)Marshal.SizeOf(typeof(FILE_BASIC_INFO)))) return "ERR:" + Marshal.GetLastWin32Error();
      BY_HANDLE_FILE_INFORMATION i;
      if (!GetFileInformationByHandle(h, out i)) return "ERR:" + Marshal.GetLastWin32Error();
      ulong id = ((ulong)i.FileIndexHigh << 32) | i.FileIndexLow;
      ulong size = ((ulong)i.FileSizeHigh << 32) | i.FileSizeLow;
      return b.CreationTime + "\t" + b.LastWriteTime + "\t" + b.ChangeTime + "\t" + b.FileAttributes + "\t" + id.ToString("x16") + "\t" + i.NumberOfLinks + "\t" + size + "\t" + i.VolumeSerialNumber.ToString("x8");
    }
  }
}
'@
Add-Type -TypeDefinition $src
'helper self-check: sizeof(BY_HANDLE_FILE_INFORMATION) = ' + [P47Meta2]::SizeOfByHandle() + ' (must be 52)'
$tag = $env:P47_SCAN_TAG; if (-not $tag) { $tag = '2' }
$items = @(Get-Item -LiteralPath $root)
$items += @(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.FullName -notlike ($root + '\node_modules\*') })
$rows = New-Object System.Collections.Generic.List[object]
$lines = New-Object System.Collections.Generic.List[string]
$bad = 0; $sizeMismatch = 0
foreach ($it in $items) {
  $r = [P47Meta2]::Read($it.FullName)
  if ($r.StartsWith('ERR:')) { $bad++; continue }
  $p = $r -split "`t"
  $rel = if ($it.FullName -eq $root) { '.' } else { $it.FullName.Substring($root.Length + 1) }
  $o = [pscustomobject]@{ rel = $rel; kind = $(if ($it.PSIsContainer) { 'D' } else { 'F' }); created = [long]$p[0]; written = [long]$p[1]; changed = [long]$p[2]; attrs = $p[3]; id = $p[4]; links = [int]$p[5]; size = [long]$p[6]; vol = $p[7] }
  if ($o.kind -eq 'F' -and $o.size -ne $it.Length) { $sizeMismatch++ }
  $rows.Add($o)
  $lines.Add($rel + "`t" + $o.kind + "`t" + $o.created + "`t" + $o.written + "`t" + $o.changed + "`t" + $o.attrs + "`t" + $o.id + "`t" + $o.links + "`t" + $o.size)
}
$outFile = $dir + '\meta-scan-' + $tag + '.tsv'
[IO.File]::WriteAllLines($outFile, [string[]]$lines, [Text.UTF8Encoding]::new($false))
$files = @($rows | Where-Object kind -eq 'F')
'meta scan ' + $tag + ': items=' + $rows.Count + ' files=' + $files.Count + ' dirs=' + @($rows | Where-Object kind -eq 'D').Count + ' unreadable=' + $bad + ' sha256=' + (Get-FileHash -Algorithm SHA256 $outFile).Hash.ToLower()
'cross-check against Get-Item: size mismatches=' + $sizeMismatch + ' ; last-write mismatches=' + @($files | Where-Object { $x = $_; $gi = Get-Item -LiteralPath (Join-Path $root $x.rel) -Force; $gi.LastWriteTimeUtc.ToFileTimeUtc() -ne $x.written }).Count
'link-count histogram (files): ' + (($files | Group-Object links | ForEach-Object { 'links=' + $_.Name + ' -> ' + $_.Count }) -join ' ; ') + ' ; duplicate file ids=' + @($files | Group-Object id | Where-Object Count -gt 1).Count + ' ; volume serials=' + (($rows | Group-Object vol | ForEach-Object Name) -join ',')
if ($tag -eq '2') {
  $t = { param($ft) [DateTime]::FromFileTime([long]$ft).ToString('MM-dd HH:mm:ss.fffffff') }
  $w = @($rows | Where-Object { $d = [DateTime]::FromFileTime($_.changed); $d -ge (Get-Date '2026-11-10 22:48:00') -and $d -lt (Get-Date '2026-11-10 22:49:00') } | Sort-Object changed)
  'tree-walk span (project without node_modules): items=' + $w.Count + ' first=' + (& $t $w[0].changed) + ' (' + $w[0].rel + ') last=' + (& $t $w[-1].changed) + ' (' + $w[-1].rel + ')'
  'six static pairs (src change time | dist change time | equal to the tick):'
  foreach ($pair in @(@('src\extension\manifest.json', 'dist\manifest.json'), @('src\extension\devtools\devtools.html', 'dist\devtools.html'), @('src\extension\devtools\panel.html', 'dist\panel.html'), @('src\extension\devtools\panel.css', 'dist\panel.css'), @('src\extension\devtools\panel-layout.css', 'dist\panel-layout.css'), @('src\extension\sandbox\sandbox.html', 'dist\sandbox.html'))) {
    $a = $rows | Where-Object rel -eq $pair[0] | Select-Object -First 1; $b = $rows | Where-Object rel -eq $pair[1] | Select-Object -First 1
    '  ' + $pair[1] + ' | ' + (& $t $a.changed) + ' | ' + (& $t $b.changed) + ' | ' + ($a.changed -eq $b.changed)
  }
  'neighbours in dist for comparison: dist\panel.js changed=' + (& $t ($rows | Where-Object rel -eq 'dist\panel.js').changed) + ' ; dist\sandbox.js changed=' + (& $t ($rows | Where-Object rel -eq 'dist\sandbox.js').changed) + ' ; dist\devtools.js changed=' + (& $t ($rows | Where-Object rel -eq 'dist\devtools.js').changed)
}
