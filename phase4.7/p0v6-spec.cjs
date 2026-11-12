'use strict';
// OB-Recover Phase 4.7 / Phase 0 V6 execution specification.
// Single source for registry JSON, TSV and generated document appendices.
const L = require('./p0v6-lib.cjs');
const { P, ID, TOOLS, src, stg, sha256utf8, argvSha } = L;

const PS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];
const RUNTIME = {
  powershell: { path: P.PS, bytes: 495616, sha256: '60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f' },
  node: { path: P.NODE, bytes: 86997320, sha256: '0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4' },
};

const outRoot = (cmd) => P.OUT + '\\' + cmd;
const outDir = (cmd, id) => outRoot(cmd) + '\\' + id;
const audRoot = (cmd) => P.AUDIT + '\\' + cmd;
const audDir = (cmd, id) => audRoot(cmd) + '\\' + id;

const F = (p) => ({ path: p, scope: 'file' });
const T = (p) => ({ path: p, scope: 'subtree' });
const Md = (p) => ({ path: p, scope: 'metadata' });
const O = (path, code, note) => ({ path, code, note: note || '' });

const WCODE = {
  FC: 'file-create', FW: 'file-write', FA: 'file-append', DC: 'dir-create',
  TC: 'subtree-create', TW: 'subtree-write', ACL: 'acl-set-recursive',
  ML: 'map-listed-file-write', ICON: 'icon-create-if-absent', EC: 'env-bound-subtree-create',
  AP: 'audit-part-create-append',
};

// ------------------------------------------------------------------ inline C00
const C00_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$sid='S-1-5-21-2104787571-1265941319-592731904-500'",
  "$name='WENX\\Administrator'",
  "$cand=@('WENX\\CodexSandboxOffline','WENX\\CodexSandboxOnLine')",
  "$id=[Security.Principal.WindowsIdentity]::GetCurrent()",
  "if($id.User.Value -ne $sid -or $id.Name -ne $name){exit 45}",
  "$pr=New-Object Security.Principal.WindowsPrincipal($id)",
  "if(-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 46}",
  "if($env:P0_ADMIN_ACCOUNT_SID -ne $sid){exit 45}",
  "if($cand -notcontains $env:P0_CODEX_ACCOUNT){exit 47}",
  "if((Get-Location).Path -ne 'C:\\Users\\Administrator'){exit 48}",
  "if(Test-Path -LiteralPath 'D:\\P47RUN\\P47-20261111-01'){exit 48}",
  "$mh=$env:P0_TOOLSRC_MANIFEST_SHA256",
  "if($mh -notmatch '^[0-9a-f]{64}$'){exit 43}",
  "function RP($p){$c=Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue;if($null -eq $c){return $true};return [bool]($c.Attributes -band [IO.FileAttributes]::ReparsePoint)}",
  "function ANC($p){$d=[IO.Path]::GetDirectoryName($p);while($d){if(RP $d){return $false};$n=[IO.Path]::GetDirectoryName($d);if($n -eq $d){break};$d=$n};return $true}",
  "function FH($p){if(RP $p){return $null};if(-not (ANC $p)){return $null};$f=Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue;if($null -eq $f -or $f.PSIsContainer){return $null};$s=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{$h=[Security.Cryptography.SHA256]::Create();try{$b=$h.ComputeHash($s)}finally{$h.Dispose()}}finally{$s.Dispose()};return [pscustomobject]@{b=$f.Length;h=([BitConverter]::ToString($b) -replace '-','').ToLower()}}",
  "foreach($r in @(@('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',495616,'60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f'),@('D:\\Nvm\\nodejs\\node.exe',86997320,'0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4'))){$x=FH $r[0];if($null -eq $x -or $x.b -ne $r[1] -or $x.h -ne $r[2]){exit 49}}",
  "$root='D:\\P47TOOLS\\p47-phase0-v6'",
  "if(-not (ANC (Join-Path $root 'RELEASE-MANIFEST.json'))){exit 44}",
  "$mf=Get-Item -LiteralPath (Join-Path $root 'RELEASE-MANIFEST.json') -Force -ErrorAction SilentlyContinue",
  "if($null -eq $mf -or $mf.PSIsContainer -or (RP $mf.FullName)){exit 44}",
  "$mb=[IO.File]::ReadAllBytes($mf.FullName)",
  "$sh=[Security.Cryptography.SHA256]::Create()",
  "try{$mh2=([BitConverter]::ToString($sh.ComputeHash($mb)) -replace '-','').ToLower()}finally{$sh.Dispose()}",
  "if($mh2 -ne $mh){exit 44}",
  "$text=[Text.Encoding]::UTF8.GetString($mb)",
  "if($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF){$text=$text.Substring(1)}",
  "$j=$text | ConvertFrom-Json",
  "if($j.schema -ne 'p47-phase0-tool-release-v3' -or $j.release_id -ne 'p47-phase0-v6'){exit 44}",
  "$fl=@($j.files)",
  "if($fl.Count -ne 20){exit 44}",
  "foreach($rel in @('payload/tools/p0-dispatch.ps1','payload/tools/p0-verify-release.ps1','payload/tools/p0-audit.cjs')){$e=@($fl | Where-Object {$_.path -eq $rel});if($e.Count -ne 1){exit 44};$x=FH ([IO.Path]::Combine($root,$rel.Replace('/','\\')));if($null -eq $x -or $x.b -ne [long]$e[0].bytes -or $x.h -ne ([string]$e[0].sha256).ToLower()){exit 44}}",
  "$ca=[Environment]::GetCommandLineArgs()",
  "$obs=$ca[$ca.Length-1]",
  "$ob=[Text.Encoding]::UTF8.GetBytes($obs)",
  "$so=[Security.Cryptography.SHA256]::Create()",
  "try{$oh=([BitConverter]::ToString($so.ComputeHash($ob)) -replace '-','').ToLower()}finally{$so.Dispose()}",
  "[pscustomobject]@{schema='p47-c00-v6';user=$id.Name;sid=$id.User.Value;admin=$true;codex_account=$env:P0_CODEX_ACCOUNT;manifest_sha256=$mh2;manifest_file_count=$fl.Count;observed_command_sha256=$oh}|ConvertTo-Json -Compress",
].join(';');

const PROBE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$sid='S-1-5-21-2104787571-1265941319-592731904-500'",
  "$cand=@('WENX\\CodexSandboxOffline','WENX\\CodexSandboxOnLine')",
  "$ca=$env:P0_CODEX_ACCOUNT",
  "if($cand -notcontains $ca){exit 51}",
  "$id=[Security.Principal.WindowsIdentity]::GetCurrent()",
  "if($id.Name -ne $ca){exit 52}",
  "if($id.User.Value -eq $sid){exit 53}",
  "$pr=New-Object Security.Principal.WindowsPrincipal($id)",
  "if($pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 53}",
  "$ok=$false",
  "foreach($g in $id.Groups){try{$n=$g.Translate([Security.Principal.NTAccount]).Value;if($n -eq 'WENX\\CodexSandboxUsers'){$ok=$true}}catch{}}",
  "if(-not $ok){exit 54}",
  "if((Get-Location).Path -ne 'D:\\P47RUN\\P47-20261111-01'){exit 55}",
  "$np='D:\\P47RUN\\P47-20261111-01\\acl-probe\\c03-nonce.txt'",
  "$sp='D:\\P47RUN\\P47-20261111-01\\acl-probe\\read-sentinel'",
  "$wp='D:\\P47RUN\\P47-20261111-01\\acl-probe\\write-access-sentinel'",
  "if(-not (Test-Path -LiteralPath $np -PathType Leaf)){exit 56}",
  "$nb=[IO.File]::ReadAllBytes($np)",
  "if($nb.Length -ne 64){exit 57}",
  "$nonce=[Text.Encoding]::ASCII.GetString($nb)",
  "if($nonce -notmatch '^[0-9a-f]{64}$'){exit 57}",
  "if(-not (Test-Path -LiteralPath $sp -PathType Leaf)){exit 58}",
  "$rb=[IO.File]::ReadAllBytes($sp)",
  "if([Text.Encoding]::ASCII.GetString($rb) -ne 'P47-READ-SENTINEL'){exit 58}",
  "$sh=[Security.Cryptography.SHA256]::Create()",
  "try{$rh=([BitConverter]::ToString($sh.ComputeHash($rb)) -replace '-','').ToLower()}finally{$sh.Dispose()}",
  "$wr='denied'",
  "try{$fs=[IO.File]::Open($wp,[IO.FileMode]::Open,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$wr='granted'}finally{$fs.Dispose()}}catch [System.UnauthorizedAccessException]{$wr='denied'}catch [System.Security.SecurityException]{$wr='denied'}catch{$wr='error'}",
  "if($wr -ne 'denied'){exit 59}",
  "$ca2=[Environment]::GetCommandLineArgs()",
  "$obs=$ca2[$ca2.Length-1]",
  "$ob=[Text.Encoding]::UTF8.GetBytes($obs)",
  "$so=[Security.Cryptography.SHA256]::Create()",
  "try{$oh=([BitConverter]::ToString($so.ComputeHash($ob)) -replace '-','').ToLower()}finally{$so.Dispose()}",
  "[pscustomobject]@{schema='p47-c03-probe-v2';nonce=$nonce;account=$id.Name;account_sid=$id.User.Value;admin=$false;group='WENX\\CodexSandboxUsers';read_sentinel=$true;read_sentinel_sha256=$rh;write_result=$wr;observed_command_sha256=$oh}|ConvertTo-Json -Compress",
].join(';');

const INLINE = { 'C00-E01': C00_SCRIPT, 'C03-PROBE-E01': PROBE_SCRIPT };

// ------------------------------------------------------------- exec records
const EXECS = [];
function ex(o) {
  const e = Object.assign({
    executor: 'admin', entry: 'source-dispatcher', chain: 'participant', env: {}, stdin: 'none',
    tools: [], load: [], inputs: [], metadata: [], outputs: [], dirs: [],
    product: null, target_argv: null, conditional: null,
    fail_class: 'fatal', fail_closed: [], enforcement: 'dispatcher-verify+self-report',
  }, o);
  if (!INLINE[e.id]) {
    const disp = e.entry === 'staged-dispatcher' ? stg('dispatch') : src('dispatch');
    e.argv = [...PS, '-File', disp, '-ExecId', e.id,
      '-ApprovedManifestPath', P.MANIFEST, '-ReleaseSourceRoot', P.SRC, '-StagedRoot', P.STAGED];
  } else {
    e.argv = [...PS, '-Command', INLINE[e.id]];
  }
  e.argv_sha256 = argvSha(e.argv);
  e.inline_sha256 = INLINE[e.id] ? sha256utf8(INLINE[e.id]) : null;
  e.entry_tool = { 'C00-E01': null, 'C03-PROBE-E01': null }[e.id] ||
    ({ 'C01-E01': 'init', 'C02-E01': 'acl', 'C03-OBS-E01': 'observe', 'C04-E01': 'stage' }[e.id] || 'dispatch');
  EXECS.push(e);
  return e;
}
const EXEC = (id) => EXECS.find((x) => x.id === id);

const rd = (cmd) => [P.OUT + '\\' + cmd, P.OUT + '\\' + cmd + '\\'];
function dirsFor(cmd, id) { return [O(outRoot(cmd), 'DC'), O(outDir(cmd, id), 'DC')]; }
function files(cmd, id, names) { return names.map((n) => O(outDir(cmd, id) + '\\' + n, 'FC')); }

// ---- S0
ex({
  id: 'C00-E01', cmd: 'C00', step: 'S0', phase: 'S0', entry: 'inline', chain: 'none', cwd: P.HOME,
  env: { P0_ADMIN_ACCOUNT_SID: 'required', P0_TOOLSRC_MANIFEST_SHA256: 'required', P0_CODEX_ACCOUNT: 'required' },
  inputs: [F(P.MANIFEST), F(src('dispatch')), F(src('verify')), F(src('audit')), F(RUNTIME.powershell.path), F(RUNTIME.node.path)],
  outputs: [{ path: 'console', code: 'CONSOLE', note: 'single JSON line; C20 archives the hash' }],
  fail_class: 'pre-run',
  gate: 'H1-H4 recorded; user issued the "start limited Phase 0" instruction',
  fail_closed: ['account name/SID mismatch (45)', 'non-admin token (46)', 'P0_CODEX_ACCOUNT not in the two approved names (47)',
    'cwd mismatch or RUN already exists (48)', 'runtime binary size/hash mismatch (49)',
    'manifest hash/schema/20-file/key-tool/anchor mismatch (43/44)'],
  enforcement: 'inline powershell; no TOOLSRC execution; no write; ancestor reparse checks',
});
ex({
  id: 'C05-PRE-E01', cmd: 'C05', variant: 'PRE', step: 'S0', phase: 'S0', entry: 'source-dispatcher', chain: 'none', cwd: P.HOME,
  tools: ['verify'], load: ['dispatch', 'verify', 'audit'],
  inputs: [F(P.MANIFEST), T(P.PAYLOAD), F(RUNTIME.powershell.path), F(RUNTIME.node.path)],
  fail_class: 'pre-run',
  gate: 'C00-E01 exited 0 in the same console session',
  fail_closed: ['manifest hash mismatch', 'payload set not exactly 20 files', 'byte/hash mismatch', 'reparse/ancestor/escape/duplicate path'],
  enforcement: 'source dispatcher + verifier; read-only; no RUN',
});
ex({
  id: 'C01-E01', cmd: 'C01', step: 'S0', phase: 'S0', entry: 'source-dispatcher', chain: 'genesis', cwd: P.HOME,
  tools: ['init', 'audit', 'verify'], load: ['dispatch', 'init', 'audit', 'verify'], bootstrap: true,
  inputs: [F(P.MANIFEST), T(P.PAYLOAD)],
  outputs: [
    O(P.RUN_PARENT, 'DC', 'only if absent'), O(P.RUN, 'DC'), O(P.OUT, 'DC'), O(P.AUDIT, 'DC'),
    O(P.STAGED, 'DC'), O(P.CONTROLS, 'DC'), O(P.ACLPROBE, 'DC'), O(P.BASELINE, 'DC'), O(P.EXP, 'DC'),
    O(P.EVIDENCE, 'DC'), O(P.TRUST, 'DC'), O(P.REVIEW, 'DC'), O(P.TMP, 'DC'),
    O(P.READ_SENTINEL, 'FC'), O(P.WRITE_SENTINEL, 'FC'),
    ...dirsFor('C01', 'C01-E01'), O(outDir('C01', 'C01-E01') + '\\init.json', 'FC'),
    O(P.CHAIN, 'FC', 'genesis record; CreateNew'),
  ],
  fail_class: 'bootstrap',
  gate: 'C05-PRE-E01 exit 0; RUN must not exist; verification repeated before any creation',
  fail_closed: ['RUN exists', 'verification fails', 'chain genesis/create fails', 'bootstrap path already exists'],
  enforcement: 'source dispatcher + verifier + init; bootstrap enumerated in genesis; own segment open/close',
});
ex({
  id: 'C02-E01', cmd: 'C02', step: 'S0', phase: 'S0', tools: ['acl', 'audit'], load: ['dispatch', 'acl', 'audit'], cwd: P.RUN,
  env: { TEMP: P.TMP, TMP: P.TMP },
  metadata: [P.RUN, P.RUN_PARENT],
  outputs: [
    O(P.RUN, 'ACL', 'recursive explicit DACL; inheritance disabled'),
    ...dirsFor('C02', 'C02-E01'), ...files('C02', 'C02-E01', ['acl-before.json', 'acl-after.json', 'result.json']),
    O(P.TMP, 'TW'),
  ],
  fail_class: 'fatal',
  gate: 'C01-E01 closed ok; RUN tree contains only entries recorded by C01',
  fail_closed: ['account name/SID mismatch', 'unexpected pre-existing entry in RUN', 'readback differs from expected ACE set', 'Codex granted any write ACE'],
  enforcement: 'dispatcher + p0-acl.ps1 with SDDL readback',
});
ex({
  id: 'C03-OBS-E01', cmd: 'C03', variant: 'OBS', step: 'S0', phase: 'S0', tools: ['observe', 'audit'],
  load: ['dispatch', 'observe', 'audit'], cwd: P.RUN,
  stdin: 'one relay line (<=4096 bytes); EOF fails closed', env: { P0_CODEX_ACCOUNT: 'required', TEMP: P.TMP, TMP: P.TMP },
  deadline_seconds: 900,
  inputs: [F(P.WRITE_SENTINEL), F(P.READ_SENTINEL)],
  outputs: [O(P.NONCE, 'FC'), ...dirsFor('C03', 'C03-OBS-E01'),
    ...files('C03', 'C03-OBS-E01', ['codex-console.jsonl', 'result.json']), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C02-E01 closed ok; Codex account resolves and is not an administrator',
  fail_closed: ['account not a candidate (60)', 'not in WENX\\CodexSandboxUsers (60)', 'nonce create fails (61)',
    'no relay line before 900 s (62)', 'relay invalid or nonce mismatch (63)'],
  enforcement: 'dispatcher + observer; admin writes only; relay is human-mediated (disclosed)',
});
ex({
  id: 'C03-PROBE-E01', cmd: 'C03', variant: 'PROBE', step: 'S0', phase: 'S0', executor: 'codex',
  entry: 'codex-inline', chain: 'none', cwd: P.RUN, env: { P0_CODEX_ACCOUNT: 'required' }, deadline_seconds: 300,
  inputs: [F(P.NONCE), F(P.READ_SENTINEL)],
  outputs: [{ path: 'console', code: 'CONSOLE', note: 'one JSON line relayed to C03-OBS-E01; zero RUN writes' }],
  attempted_writes: [P.WRITE_SENTINEL],
  fail_class: 'fatal',
  gate: 'C03-OBS-E01 printed READY and the nonce exists',
  fail_closed: ['P0_CODEX_ACCOUNT not a candidate (51)', 'current account != P0_CODEX_ACCOUNT (52)', 'admin SID or role (53)',
    'not in the Codex group (54)', 'cwd mismatch (55)', 'nonce missing (56)/malformed (57)', 'read sentinel mismatch (58)',
    'write access granted or errored (59)'],
  enforcement: 'codex-inline powershell; OS ACL is the only enforcement; zero writes',
});

// ---- S1/S2
ex({
  id: 'C04-E01', cmd: 'C04', step: 'S1', phase: 'S1', tools: ['stage', 'audit'], load: ['dispatch', 'stage', 'audit'], cwd: P.RUN,
  env: { TEMP: P.TMP, TMP: P.TMP },
  inputs: [F(P.MANIFEST), T(P.PAYLOAD)],
  outputs: [O(P.STAGED, 'TC'), ...dirsFor('C04', 'C04-E01'), ...files('C04', 'C04-E01', ['stage.json']), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C03-OBS-E01 closed ok; STAGED absent or empty',
  fail_closed: ['target already exists', 'manifest entry outside payload/tools', 'reparse point', 'byte/hash mismatch', 'write outside STAGED'],
  enforcement: 'dispatcher + stage (.NET CreateNew; no readback of the target)',
});
ex({
  id: 'C05-FINAL-E01', cmd: 'C05', variant: 'FINAL', step: 'S1', phase: 'S1', tools: ['verify', 'audit'],
  load: ['dispatch', 'verify', 'audit'], cwd: P.RUN, env: { TEMP: P.TMP, TMP: P.TMP },
  inputs: [F(P.MANIFEST), T(P.STAGED)],
  outputs: [...dirsFor('C05', 'C05-FINAL-E01'), ...files('C05', 'C05-FINAL-E01', ['verify.json']), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C04-E01 closed ok; the source dispatcher performs this readback',
  fail_closed: ['staged set != 16 mapped files', 'byte/hash mismatch', 'reparse point', 'mapping mismatch', 'extra file'],
  enforcement: 'source dispatcher + verifier; full byte readback of the staged tree',
});
ex({
  id: 'C06-E01', cmd: 'C06', step: 'S2', phase: 'S2', entry: 'staged-dispatcher', tools: ['simulate', 'guard', 'audit', 'simcases', 'vectors'],
  load: ['dispatch', 'simulate', 'guard', 'audit'], cwd: P.RUN, env: { TEMP: P.TMP, TMP: P.TMP },
  inputs: [F(stg('simcases')), F(stg('vectors')), T(P.CONTROLS)],
  outputs: [...dirsFor('C06', 'C06-E01'), ...files('C06', 'C06-E01', ['result.json', 'guard.jsonl']), O(P.CONTROLS, 'TW'), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C05-FINAL-E01 closed ok; first use of the staged dispatcher',
  fail_closed: ['a denied read succeeds', 'an unlisted write succeeds', 'FD/copy/link/worker mismatch', 'audit vector mismatch', 'guard not preloaded in the child'],
  enforcement: 'staged dispatcher + fs-guard in the Node tool and children',
});

// ---- targets
const vargv = (copy, config, cmd, id) => [P.NODE, copy + '\\node_modules\\vitest\\vitest.mjs', 'run', '--config', config,
  '--pool=forks', '--poolOptions.forks.singleFork=true', '--no-file-parallelism', '--reporter=json',
  '--outputFile', outDir(cmd, id) + '\\vitest.json', 'test/string-decoder.test.ts'];

const TARGETS = [
  { id: 'C08-E01', cmd: 'C08', step: 'S3', tools: ['archive', 'guard', 'audit'], load: ['dispatch', 'archive', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), T(P.ORIGINAL)],
    outputs: [O(P.SNAP, 'TC'), ...dirsFor('C08', 'C08-E01'), ...files('C08', 'C08-E01', ['archive.json', 'result.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal',
    gate: 'C07-M0-E01 sealed ok; ORIGINAL unchanged since M0',
    fail: ['source changed during archive', 'reparse/link escape', 'snapshot byte mismatch'] },
  { id: 'C09-E01', cmd: 'C09', step: 'S4', tools: ['copy', 'guard', 'audit'], load: ['dispatch', 'copy', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), T(P.SNAP)],
    outputs: [O(P.CP, 'TC'), O(P.CN, 'TC'), O(P.CS, 'TC'), ...dirsFor('C09', 'C09-E01'),
      ...files('C09', 'C09-E01', ['copies.json', 'result.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal',
    gate: 'C08-E01 sealed ok',
    fail: ['hardlink/reparse', 'shared dependency identity', 'copy hash mismatch', 'any read of ORIGINAL'] },
  { id: 'C10-P-E01', cmd: 'C10', variant: 'P', step: 'S5', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CP,
    inputs: [F(P.CP + '\\vite.config.ts'), F(P.CP + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CP)],
    outputs: [...dirsFor('C10', 'C10-P-E01'), O(P.CP + '\\p0-probe.vite.config.mjs', 'FC'),
      ...files('C10', 'C10-P-E01', ['result.json', 'vitest.json']),
      O(P.CP + '\\node_modules\\.vite', 'TW'), O(P.CP + '\\node_modules\\.vite-temp', 'TW'), O(P.CP + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CP, config: P.CP + '\\p0-probe.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CP, P.CP + '\\p0-probe.vite.config.mjs', 'C10', 'C10-P-E01'),
    gate: 'C09-E01 sealed ok; copies.json entry hash matches; entry/report hashes match',
    fail: ['worker preload missing', 'denied read/write succeeds', 'config template hash mismatch', 'vitest exit non-zero'] },
  { id: 'C10-N-E01', cmd: 'C10', variant: 'N', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CN,
    inputs: [F(P.CN + '\\vite.config.ts'), F(P.CN + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CN)],
    outputs: [...dirsFor('C10', 'C10-N-E01'), O(P.CN + '\\p0-probe.vite.config.mjs', 'FC'),
      ...files('C10', 'C10-N-E01', ['result.json', 'vitest.json']),
      O(P.CN + '\\node_modules\\.vite', 'TW'), O(P.CN + '\\node_modules\\.vite-temp', 'TW'), O(P.CN + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CN, config: P.CN + '\\p0-probe.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CN, P.CN + '\\p0-probe.vite.config.mjs', 'C10', 'C10-N-E01'),
    gate: 'C10-P-E01 sealed ok',
    fail: ['worker preload missing', 'denied read/write succeeds', 'config template hash mismatch', 'vitest exit non-zero'] },
  { id: 'C11-E01', cmd: 'C11', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CP,
    inputs: [F(P.CP + '\\node_modules\\typescript\\lib\\tsc.js'), F(outDir('C09', 'C09-E01') + '\\copies.json'), F(P.CP + '\\tsconfig.json'), T(P.CP)],
    outputs: [...dirsFor('C11', 'C11-E01'), ...files('C11', 'C11-E01', ['result.json', 'tsc.log']), O(P.CP + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CP, config: P.CP + '\\tsconfig.json', productFiles: [] },
    target_argv: [P.NODE, P.CP + '\\node_modules\\typescript\\lib\\tsc.js', '-p', P.CP + '\\tsconfig.json', '--noEmit'],
    gate: 'C10-P-E01 sealed ok; tsc.js hash equals copies.json entry',
    fail: ['missing --noEmit', 'tsc.js hash mismatch', 'any emit inside the copy', 'extra argv'] },
  { id: 'C12-E01', cmd: 'C12', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CP,
    inputs: [F(P.CP + '\\vite.config.ts'), F(P.CP + '\\node_modules\\vitest\\vitest.mjs'), F(P.CP + '\\manifest.json'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CP)],
    outputs: [...dirsFor('C12', 'C12-E01'), ...files('C12', 'C12-E01', ['result.json', 'vitest.json', 'dist-before.json', 'dist-after.json']),
      O(P.CP + '\\node_modules\\.vite', 'TW'), O(P.CP + '\\node_modules\\.vite-temp', 'TW'), O(P.CP + '\\tmp', 'TW'),
      O(P.CP + '\\dist\\manifest.json', 'FW'), O(P.CP + '\\dist\\devtools.html', 'FW'),
      O(P.CP + '\\dist\\panel.html', 'FW'), O(P.CP + '\\dist\\panel.css', 'FW'),
      O(P.CP + '\\dist\\panel-layout.css', 'FW'), O(P.CP + '\\dist\\sandbox.html', 'FW'),
      O(P.CP + '\\dist\\icon16.png', 'ICON'), O(P.CP + '\\dist\\icon48.png', 'ICON'), O(P.CP + '\\dist\\icon128.png', 'ICON')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CP, config: P.CP + '\\vite.config.ts', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CP, P.CP + '\\vite.config.ts', 'C12', 'C12-E01'),
    gate: 'C10-P-E01 sealed ok; original config only',
    fail: ['write outside the six targets or three conditional icons', 'icon present_before=1 but create attempted', 'unregistered dist chunk'] },
  { id: 'C13-E01', cmd: 'C13', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CN,
    inputs: [F(P.CN + '\\vite.config.ts'), F(P.CN + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CN)],
    outputs: [...dirsFor('C13', 'C13-E01'), O(P.CN + '\\control.vite.config.mjs', 'FC'),
      ...files('C13', 'C13-E01', ['result.json', 'vitest.json', 'config-diff.json']),
      O(P.CN + '\\node_modules\\.vite', 'TW'), O(P.CN + '\\node_modules\\.vite-temp', 'TW'), O(P.CN + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CN, config: P.CN + '\\control.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CN, P.CN + '\\control.vite.config.mjs', 'C13', 'C13-E01'),
    gate: 'C10-N-E01 sealed ok; control config hash equals the fixed template',
    fail: ['any dist write', 'control config hash mismatch', 'plugin diff != 1'] },
  { id: 'C10-S-E01', cmd: 'C10', variant: 'S', step: 'S7', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(P.CS + '\\vite.config.ts'), F(P.CS + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CS)],
    outputs: [...dirsFor('C10', 'C10-S-E01'), O(P.CS + '\\p0-probe.vite.config.mjs', 'FC'),
      ...files('C10', 'C10-S-E01', ['result.json', 'vitest.json']),
      O(P.CS + '\\node_modules\\.vite', 'TW'), O(P.CS + '\\node_modules\\.vite-temp', 'TW'), O(P.CS + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CS, config: P.CS + '\\p0-probe.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CS, P.CS + '\\p0-probe.vite.config.mjs', 'C10', 'C10-S-E01'),
    gate: 'C13-E01 sealed ok',
    fail: ['worker preload missing', 'denied read/write succeeds', 'config template hash mismatch', 'vitest exit non-zero'] },
  { id: 'C14-E01', cmd: 'C14', step: 'S7', tools: ['neutralize', 'guard', 'audit'], load: ['dispatch', 'neutralize', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(stg('nmap')), T(P.CS)],
    outputs: [...dirsFor('C14', 'C14-E01'), O(outDir('C14', 'C14-E01') + '\\result.json', 'FC'),
      O(outDir('C14', 'C14-E01') + '\\mapping-result.json', 'FC'), O(P.CS, 'ML', 'only paths listed in the approved map'), O(P.CS + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    gate: 'C10-S-E01 sealed ok; map verified against its staged hash',
    fail: ['path not listed in the map', 'path escapes the copy', 'node_modules/dist/test/.git target', 'non-reversible edit'] },
  { id: 'C15-E01', cmd: 'C15', step: 'S7', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(P.CS + '\\node_modules\\typescript\\lib\\tsc.js'), F(outDir('C09', 'C09-E01') + '\\copies.json'), F(P.CS + '\\tsconfig.json'), T(P.CS)],
    outputs: [...dirsFor('C15', 'C15-E01'), ...files('C15', 'C15-E01', ['result.json', 'tsc.log']), O(P.CS + '\\tmp', 'TW')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CS, config: P.CS + '\\tsconfig.json', productFiles: [] },
    target_argv: [P.NODE, P.CS + '\\node_modules\\typescript\\lib\\tsc.js', '-p', P.CS + '\\tsconfig.json', '--noEmit'],
    gate: 'C14-E01 sealed ok; C10-S-E01 sealed ok',
    fail: ['missing --noEmit', 'tsc.js hash mismatch', 'any emit inside the copy', 'extra argv'] },
  { id: 'C16-E01', cmd: 'C16', step: 'S7', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(P.CS + '\\vite.config.ts'), F(P.CS + '\\node_modules\\vitest\\vitest.mjs'), F(P.CS + '\\manifest.json'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CS)],
    outputs: [...dirsFor('C16', 'C16-E01'), ...files('C16', 'C16-E01', ['result.json', 'vitest.json', 'dist-before.json', 'dist-after.json']),
      O(P.CS + '\\node_modules\\.vite', 'TW'), O(P.CS + '\\node_modules\\.vite-temp', 'TW'), O(P.CS + '\\tmp', 'TW'),
      O(P.CS + '\\dist\\manifest.json', 'FW'), O(P.CS + '\\dist\\devtools.html', 'FW'),
      O(P.CS + '\\dist\\panel.html', 'FW'), O(P.CS + '\\dist\\panel.css', 'FW'),
      O(P.CS + '\\dist\\panel-layout.css', 'FW'), O(P.CS + '\\dist\\sandbox.html', 'FW'),
      O(P.CS + '\\dist\\icon16.png', 'ICON'), O(P.CS + '\\dist\\icon48.png', 'ICON'), O(P.CS + '\\dist\\icon128.png', 'ICON')],
    guard: true, fail_class: 'gate',
    product: { copy: P.CS, config: P.CS + '\\vite.config.ts', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CS, P.CS + '\\vite.config.ts', 'C16', 'C16-E01'),
    gate: 'C14-E01 sealed ok; C10-S-E01 sealed ok',
    fail: ['write outside the six targets or three conditional icons', 'icon predicate violated', 'unregistered dist chunk'] },
  { id: 'C17-E01', cmd: 'C17', step: 'S8', tools: ['compare', 'guard', 'audit'], load: ['dispatch', 'compare', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), F(outDir('C07', 'C07-M1-E01') + '\\m1.json'), F(outDir('C09', 'C09-E01') + '\\copies.json'),
      T(outRoot('C07')), T(outRoot('C08')), T(outRoot('C09')), T(outRoot('C10')), T(outRoot('C11')), T(outRoot('C12')),
      T(outRoot('C13')), T(outRoot('C14')), T(outRoot('C15')), T(outRoot('C16'))],
    outputs: [...dirsFor('C17', 'C17-E01'), ...files('C17', 'C17-E01', ['result.json', 'diff.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal',
    gate: 'C07-M1-E01 sealed ok; all S5-S7 targets have a terminal segment_close',
    fail: ['results missing', 'hash/metadata/ADS mismatch', 'attribution of a diff as a pass'] },
  { id: 'C18-E01', cmd: 'C18', step: 'S8', tools: ['archive', 'guard', 'audit', 'verify'], load: ['dispatch', 'archive', 'guard', 'audit'], cwd: P.RUN,
    conditional: 'P0_SECOND_ARCHIVE', env: { P0_SECOND_ARCHIVE: 'bound-value', TEMP: P.TMP, TMP: P.TMP },
    inputs: [F(P.M0), T(P.SNAP)],
    outputs: [O('ENV:P0_SECOND_ARCHIVE', 'EC'), ...dirsFor('C18', 'C18-E01'),
      ...files('C18', 'C18-E01', ['binding.json', 'archive.json', 'result.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate',
    gate: 'C18-BIND-E01 recorded bound with c18_destination; destination absolute, outside protected trees, absent, parent exists and is not a reparse point',
    fail: ['destination exists', 'destination inside a protected tree', 'archive byte mismatch'] },
  { id: 'C19-E01', cmd: 'C19', step: 'S8', tools: ['index', 'guard', 'audit'], load: ['dispatch', 'index', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), F(P.CHAIN), T(P.AUDIT), T(P.OUT), T(P.EVIDENCE), T(P.TRUST)],
    outputs: [...dirsFor('C19', 'C19-E01'),
      ...files('C19', 'C19-E01', ['index.json', 'cutoff.json', 'result.json']),
      O(P.EVIDENCE + '\\index.json', 'FC'), O(P.TRUST + '\\anchor.json', 'FC'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal',
    gate: 'C07-B-C19-E01 sealed; binding record present (bound or disabled-unbound); cutoff must equal the preceding segment_close',
    fail: ['unaccounted write in RUN', 'segment hash mismatch', 'missing summary', 'cutoff not equal to the preceding segment_close'] },
  { id: 'C20-REPORT-E01', cmd: 'C20', variant: 'REPORT', step: 'S9', tools: ['report', 'guard', 'audit'], load: ['dispatch', 'report', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), F(P.CHAIN), F(outDir('C19', 'C19-E01') + '\\cutoff.json'), T(outRoot('C17')), T(P.AUDIT), T(P.EVIDENCE), T(P.TRUST)],
    outputs: [...dirsFor('C20', 'C20-REPORT-E01'),
      ...files('C20', 'C20-REPORT-E01', ['result.json']),
      O(P.REVIEW + '\\PHASE4.7-PHASE0-REPORT-V6.md', 'FC'), O(P.REVIEW + '\\PHASE4.7-PHASE0-REPORT-V6.json', 'FC'),
      O(P.EVIDENCE + '\\report-coverage.json', 'FC'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal',
    gate: 'C19-E01 sealed ok',
    fail: ['report claims coverage beyond its declared cutoff', 'report writes before its segment opens', 'any C18 state other than complete/disabled-unbound/failed'] },
];

const TARGET_LIST = TARGETS.filter((t) => !['C17-E01', 'C18-E01', 'C19-E01', 'C20-REPORT-E01'].includes(t.id));

for (const t of TARGETS) {
  ex({
    id: t.id, cmd: t.cmd, variant: t.variant || null, step: t.step, phase: t.step,
    entry: 'staged-dispatcher', tools: t.tools, load: t.load, cwd: t.cwd, env: { TEMP: t.product ? t.product.copy + '\\tmp' : P.TMP, TMP: t.product ? t.product.copy + '\\tmp' : P.TMP },
    guard: t.guard, product: t.product || null, target_argv: t.target_argv || null, conditional: t.conditional || null,
    inputs: t.inputs, outputs: t.outputs, gate: t.gate, fail_closed: t.fail, fail_class: t.fail_class,
    enforcement: 'staged dispatcher + fs-guard (runner and product)',
  });
}

// ---- C07 wrappers
function wrap(target, kind) {
  const t = EXECS.find((x) => x.id === target);
  const id = 'C07-' + kind + '-' + target;
  const isBefore = kind === 'B';
  const inputs = isBefore
    ? [F(P.M0), T(P.ORIGINAL)]
    : [F(P.M0), T(P.ORIGINAL), F(outDir('C07', 'C07-B-' + target) + '\\before.json')];
  return ex({
    id, cmd: 'C07', variant: kind + '-' + target, step: t.step, phase: t.step,
    tools: ['manifest', 'guard', 'audit'], load: ['dispatch', 'manifest', 'guard', 'audit'], cwd: P.RUN,
    env: { TEMP: P.TMP, TMP: P.TMP }, guard: true, inputs,
    outputs: [...dirsFor('C07', id), ...files('C07', id, [isBefore ? 'before.json' : 'after.json', 'result.json']), O(P.TMP, 'TW')],
    fail_class: 'fatal',
    gate: isBefore
      ? 'the previous exec sealed ok; ' + t.id + ' has not started; ORIGINAL readable by admin'
      : t.id + ' has a terminal segment_close (ok | failed | aborted); ORIGINAL readable by admin',
    fail_closed: ['ORIGINAL changed while only the previous exec ran', 'diff vs M0 not empty', 'before/after chain broken', 'C07 must not be re-run for the same target'],
    enforcement: 'staged dispatcher + manifest reader; admin only; one before and one after per target',
  });
}
ex({
  id: 'C07-M0-E01', cmd: 'C07', variant: 'M0', step: 'S3', phase: 'S3', tools: ['manifest', 'guard', 'audit'],
  load: ['dispatch', 'manifest', 'guard', 'audit'], cwd: P.RUN, env: { TEMP: P.TMP, TMP: P.TMP }, guard: true,
  inputs: [T(P.ORIGINAL)],
  outputs: [...dirsFor('C07', 'C07-M0-E01'), O(P.M0, 'FC'), O(outDir('C07', 'C07-M0-E01') + '\\result.json', 'FC'), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C06-E01 sealed ok',
  fail_closed: ['M0 exists', 'ORIGINAL entry unreadable', 'ADS/USN enumeration incomplete'],
  enforcement: 'staged dispatcher + manifest reader; M0 written once',
});
ex({
  id: 'C07-M1-E01', cmd: 'C07', variant: 'M1', step: 'S8', phase: 'S8', tools: ['manifest', 'guard', 'audit'],
  load: ['dispatch', 'manifest', 'guard', 'audit'], cwd: P.RUN, env: { TEMP: P.TMP, TMP: P.TMP }, guard: true,
  inputs: [F(P.M0), T(P.ORIGINAL)],
  outputs: [...dirsFor('C07', 'C07-M1-E01'), O(outDir('C07', 'C07-M1-E01') + '\\m1.json', 'FC'),
    O(outDir('C07', 'C07-M1-E01') + '\\diff.json', 'FC'), O(outDir('C07', 'C07-M1-E01') + '\\result.json', 'FC'), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C07-A-C16-E01 sealed ok; M1 must not overwrite M0',
  fail_closed: ['M1 exists', 'M1 write to the M0 path', 'diff computed against anything other than M0'],
  enforcement: 'staged dispatcher + manifest reader',
});
ex({
  id: 'C18-BIND-E01', cmd: 'C18', variant: 'BIND', step: 'S8', phase: 'S8', tools: ['audit'], load: ['dispatch', 'audit'], cwd: P.RUN,
  env: { P0_SECOND_ARCHIVE: 'optional', TEMP: P.TMP, TMP: P.TMP },
  inputs: [], outputs: [O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C07-A-C17-E01 sealed ok',
  fail_closed: ['binding value not absolute', 'binding inside ORIGINAL/BASELINE/RUN/RUN_PARENT', 'binding exists', 'binding parent missing or reparse', 'binding read twice'],
  enforcement: 'dispatcher control step; reads P0_SECOND_ARCHIVE exactly once, records c18_state and c18_destination in segment_open',
});
ex({
  id: 'C20-SEAL-E01', cmd: 'C20', variant: 'SEAL', step: 'S9', phase: 'S9', tools: ['verify', 'audit'],
  load: ['dispatch', 'verify', 'audit'], cwd: P.RUN, chain: 'terminal', entry: 'source-dispatcher',
  inputs: [F(P.MANIFEST), T(P.STAGED), F(P.CHAIN), T(P.AUDIT), T(P.OUT), T(P.EVIDENCE), T(P.TRUST), T(P.REVIEW)],
  outputs: [O(P.TSEAL, 'FC'), { path: 'console', code: 'CONSOLE', note: 'terminal seal sha256 and bytes for external anchoring' }],
  fail_class: 'seal',
  gate: 'C20-REPORT-E01 sealed ok (normal) or a recorded abort point (aborted/degraded); no terminal-seal.json exists',
  fail_closed: ['seal already exists', 'chain tail not at a segment_close', 'segment digest mismatch', 'staged recheck mismatch', 'report cutoffs beyond the tail'],
  enforcement: 'source dispatcher + verifier (20-file and staged recheck) + audit terminal-seal; last execution, no chain append, no retry',
});

// -------------------------------------------------------------- plan orders
const PRE = ['C00-E01', 'C05-PRE-E01', 'C01-E01', 'C02-E01', 'C03-OBS-E01', 'C03-PROBE-E01', 'C04-E01', 'C05-FINAL-E01', 'C06-E01'];
const PLAN_BOUND = [];
const push = (a, id) => { if (!a.includes(id)) a.push(id); };
PRE.forEach((id) => push(PLAN_BOUND, id));
push(PLAN_BOUND, 'C07-M0-E01');
TARGET_LIST.forEach((t) => {
  wrap(t.id, 'B'); push(PLAN_BOUND, 'C07-B-' + t.id);
  push(PLAN_BOUND, t.id);
  wrap(t.id, 'A'); push(PLAN_BOUND, 'C07-A-' + t.id);
  if (t.id === 'C16-E01') push(PLAN_BOUND, 'C07-M1-E01');
});
['C17-E01', 'C18-E01', 'C19-E01', 'C20-REPORT-E01'].forEach((target) => {
  push(PLAN_BOUND, 'C07-B-' + target); push(PLAN_BOUND, target); push(PLAN_BOUND, 'C07-A-' + target);
  if (target === 'C17-E01') push(PLAN_BOUND, 'C18-BIND-E01');
});
push(PLAN_BOUND, 'C20-SEAL-E01');

// wrappers for the four post-targets (explicit records already exist)
['C17-E01', 'C18-E01', 'C19-E01', 'C20-REPORT-E01'].forEach((target) => { wrap(target, 'B'); wrap(target, 'A'); });

const PLAN_UNBOUND = PLAN_BOUND.filter((id) => !['C07-B-C18-E01', 'C18-E01', 'C07-A-C18-E01'].includes(id));

module.exports = {
  PS, RUNTIME, WCODE, TARGETS, PLAN_BOUND, PLAN_UNBOUND, EXECS, EXEC,
  C00_SCRIPT, PROBE_SCRIPT, outRoot, outDir, audRoot, audDir, F, T, Md, O,
};
