$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = 'D:\Projects\ob-recover'
$dir = 'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan'
$src = @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class P47Meta {
  [StructLayout(LayoutKind.Sequential)]
  public struct FILE_BASIC_INFO { public long CreationTime; public long LastAccessTime; public long LastWriteTime; public long ChangeTime; public uint FileAttributes; }
  [StructLayout(LayoutKind.Sequential)]
  public struct BY_HANDLE_FILE_INFORMATION { public uint FileAttributes; public long CreationTime; public long LastAccessTime; public long LastWriteTime; public uint VolumeSerialNumber; public uint FileSizeHigh; public uint FileSizeLow; public uint NumberOfLinks; public uint FileIndexHigh; public uint FileIndexLow; }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle h, int cls, out FILE_BASIC_INFO info, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle h, out BY_HANDLE_FILE_INFORMATION info);
  // FILE_READ_ATTRIBUTES only (0x80); share read/write/delete (7); OPEN_EXISTING (3); FILE_FLAG_BACKUP_SEMANTICS so directories can be opened.
  public static string Read(string path) {
    using (SafeFileHandle h = CreateFileW(path, 0x80, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
      if (h.IsInvalid) return "ERR:" + Marshal.GetLastWin32Error();
      FILE_BASIC_INFO b;
      if (!GetFileInformationByHandleEx(h, 0, out b, (uint)Marshal.SizeOf(typeof(FILE_BASIC_INFO)))) return "ERR:" + Marshal.GetLastWin32Error();
      BY_HANDLE_FILE_INFORMATION i;
      if (!GetFileInformationByHandle(h, out i)) return "ERR:" + Marshal.GetLastWin32Error();
      ulong id = ((ulong)i.FileIndexHigh << 32) | i.FileIndexLow;
      return b.CreationTime + "\t" + b.LastWriteTime + "\t" + b.ChangeTime + "\t" + b.FileAttributes + "\t" + id.ToString("x") + "\t" + i.NumberOfLinks;
    }
  }
}
'@
Add-Type -TypeDefinition $src
$fmt = { param($ft) [DateTime]::FromFileTime([long]$ft).ToString('MM-dd HH:mm:ss') }

$items = @(Get-Item -LiteralPath $root)
$items += @(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.FullName -notlike ($root + '\node_modules\*') })
$nmSample = @('node_modules\.package-lock.json', 'node_modules\vite\package.json', 'node_modules\vitest\package.json', 'node_modules\.vite', 'node_modules\.vite\vitest\da39a3ee5e6b4b0d3255bfef95601890afd80709\results.json')
foreach ($s in $nmSample) { $p = Join-Path $root $s; if (Test-Path -LiteralPath $p) { $items += Get-Item -LiteralPath $p -Force } }
$rows = New-Object System.Collections.Generic.List[object]
$lines = New-Object System.Collections.Generic.List[string]
$bad = 0
foreach ($it in $items) {
  $r = [P47Meta]::Read($it.FullName)
  if ($r.StartsWith('ERR:')) { $bad++; continue }
  $p = $r -split "`t"
  $rel = if ($it.FullName -eq $root) { '.' } else { $it.FullName.Substring($root.Length + 1) }
  $o = [pscustomobject]@{ rel = $rel; kind = $(if ($it.PSIsContainer) { 'D' } else { 'F' }); created = [long]$p[0]; written = [long]$p[1]; changed = [long]$p[2]; attrs = $p[3]; id = $p[4]; links = $p[5] }
  $rows.Add($o)
  $lines.Add($rel + "`t" + $o.kind + "`t" + (& $fmt $o.created) + "`t" + (& $fmt $o.written) + "`t" + (& $fmt $o.changed) + "`t" + $o.attrs + "`t" + $o.id + "`t" + $o.links)
}
[IO.File]::WriteAllLines($dir + '\meta-scan-1.tsv', [string[]]$lines, [Text.UTF8Encoding]::new($false))
'meta scan: items=' + $rows.Count + ' (files=' + @($rows | Where-Object kind -eq 'F').Count + ' dirs=' + @($rows | Where-Object kind -eq 'D').Count + ') unreadable=' + $bad + ' sha256=' + (Get-FileHash -Algorithm SHA256 ($dir + '\meta-scan-1.tsv')).Hash.ToLower()

$files = @($rows | Where-Object kind -eq 'F')
$later = @($files | Where-Object { ($_.changed - $_.written) -gt 20000000 })
'A. files whose NTFS change time is more than 2 s later than the last write time: ' + $later.Count + ' of ' + $files.Count
'B. change-time histogram (files), per minute:'
$files | Group-Object { [DateTime]::FromFileTime($_.changed).ToString('MM-dd HH:mm') } | Sort-Object Name | ForEach-Object { '  ' + $_.Name + '  files=' + $_.Count }
'C. change-time histogram (directories), per minute:'
$rows | Where-Object kind -eq 'D' | Group-Object { [DateTime]::FromFileTime($_.changed).ToString('MM-dd HH:mm') } | Sort-Object Name | ForEach-Object { '  ' + $_.Name + '  dirs=' + $_.Count }
'D. key paths (created | written | changed):'
foreach ($k in @('.', 'dist', 'dist\panel.js', 'dist\panel.html', 'dist\manifest.json', 'dist\sandbox.html', 'dist\icon16.png', 'docs\PHASE4.7-REAL-SITE-PLAN.md', 'src\extension\devtools\decoder-analysis-client.ts', 'test\decoder-analysis-queue.test.ts', 'test\decoder-analysis-consistency.test.ts', 'test\fixtures\p47-512kb-synthetic.js', 'test\fixtures\real-ob-sites\registry.json', 'test\fixtures\real-ob-sites\l2-real-ob-seed\summary.json', 'test\fixtures\real-ob-sites\l2-real-ob-seed\run-high\compare.json', 'test\fixtures\real-ob-sites\l3-controlled-scenarios\summary.json', 'test\fixtures\real-ob-sites\l3-browser-replay\summary.json', 'test\fixtures\real-ob-sites\l1-qccqcc-hangzhou\budget-ledger.json', 'test\fixtures\real-ob-sites\l1-qccqcc-hangzhou\run-20261110T1458Z\observed\raw-run.nextpage2.json', 'vite.config.ts', 'node_modules\.package-lock.json', 'node_modules\vite\package.json', 'node_modules\.vite\vitest\da39a3ee5e6b4b0d3255bfef95601890afd80709\results.json')) {
  $x = $rows | Where-Object rel -eq $k | Select-Object -First 1
  if ($x) { '  ' + $k + ' | ' + (& $fmt $x.created) + ' | ' + (& $fmt $x.written) + ' | ' + (& $fmt $x.changed) } else { '  ' + $k + ' | not in scan' }
}
'E. first and last change time inside the 11-10 22:30..22:59 window (files): ' + (($files | Where-Object { $d = [DateTime]::FromFileTime($_.changed); $d -ge (Get-Date '2026-11-10 22:30:00') -and $d -lt (Get-Date '2026-11-10 23:00:00') } | Sort-Object changed | Select-Object -First 1 | ForEach-Object { (& $fmt $_.changed) + ' ' + $_.rel })) + '  ..  ' + (($files | Where-Object { $d = [DateTime]::FromFileTime($_.changed); $d -ge (Get-Date '2026-11-10 22:30:00') -and $d -lt (Get-Date '2026-11-10 23:00:00') } | Sort-Object changed | Select-Object -Last 1 | ForEach-Object { (& $fmt $_.changed) + ' ' + $_.rel }))
'F. hard links: files with link count other than 1 = ' + @($files | Where-Object { $_.links -ne '1' }).Count + ' ; duplicate file ids = ' + @($files | Group-Object id | Where-Object Count -gt 1).Count

'G. security descriptors (owner + group + DACL as SDDL):'
$sd = foreach ($it in $items) { try { $a = Get-Acl -LiteralPath $it.FullName; [pscustomobject]@{ rel = $(if ($it.FullName -eq $root) { '.' } else { $it.FullName.Substring($root.Length + 1) }); kind = $(if ($it.PSIsContainer) { 'D' } else { 'F' }); sddl = $a.Sddl; explicit = @($a.Access | Where-Object { -not $_.IsInherited }).Count } } catch { [pscustomobject]@{ rel = $it.FullName; kind = '?'; sddl = 'ERR'; explicit = -1 } } }
$sdLines = $sd | ForEach-Object { $_.rel + "`t" + $_.kind + "`t" + $_.explicit + "`t" + $_.sddl }
[IO.File]::WriteAllLines($dir + '\sddl-scan-1.tsv', [string[]]$sdLines, [Text.UTF8Encoding]::new($false))
'  items=' + @($sd).Count + ' unreadable=' + @($sd | Where-Object sddl -eq 'ERR').Count + ' sha256=' + (Get-FileHash -Algorithm SHA256 ($dir + '\sddl-scan-1.tsv')).Hash.ToLower()
'  distinct SDDL among files=' + @($sd | Where-Object kind -eq 'F' | Group-Object sddl).Count + ' ; among directories=' + @($sd | Where-Object kind -eq 'D' | Group-Object sddl).Count
'  items carrying explicit (non-inherited) entries: ' + (($sd | Where-Object { $_.explicit -gt 0 } | ForEach-Object { $_.rel + '(' + $_.explicit + ')' }) -join ', ')
'  file SDDL groups:'; $sd | Where-Object kind -eq 'F' | Group-Object sddl | Sort-Object Count -Descending | ForEach-Object { '    files=' + $_.Count + ' e.g. ' + $_.Group[0].rel + ' sddlSha=' + ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($_.Name))).Replace('-', '').ToLower().Substring(0, 16)) }
'  unresolved SID on the root resolves to: ' + $(try { (New-Object Security.Principal.SecurityIdentifier('S-1-5-21-4000576066-1321408303-3356123850-2422216592')).Translate([Security.Principal.NTAccount]).Value } catch { 'not resolvable (' + $_.Exception.Message.Split([char]10)[0].Trim() + ')' })
'  members of CodexSandboxUsers: ' + $(try { ((Get-LocalGroupMember -Group 'CodexSandboxUsers' -ErrorAction Stop | ForEach-Object { $_.Name }) -join ', ') } catch { 'query failed: ' + $_.Exception.Message.Split([char]10)[0].Trim() })
