'use strict';
// OB-Recover Phase 4.7 / Phase 0 V9 execution specification.
// Single source for the registry JSON, the whitelist TSV and the generated appendices.
// Contract data only: this module never executes C00-C20 and never touches D:\P47RUN / D:\P47TOOLS.
const L = require('./p0v9-lib.cjs');
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
  FC: 'file-create', FW: 'file-write', FA: 'file-append', DC: 'dir-create', DCA: 'dir-create-if-absent',
  TC: 'subtree-create', TW: 'subtree-write', ACL: 'acl-set-recursive',
  ML: 'map-listed-file-write', ICON: 'icon-create-if-absent', EC: 'env-bound-subtree-create',
  AP: 'audit-part-create-append',
};

// ---------------------------------------------------------------- security triggers
// One closed vocabulary. Every fail-closed reason maps to exactly one code, one class and,
// for security codes, one trigger id. The registry publishes this mapping; the checker
// re-derives the classes and refuses an unlisted reason.
const TRIGGERS = [
  { id: 'SEC-IDENTITY', what: 'account/SID/role mismatch or elevation' },
  { id: 'SEC-DENIED-READ-SUCCEEDED', what: 'a read inside deny_read returned content' },
  { id: 'SEC-UNLISTED-WRITE-SUCCEEDED', what: 'a write outside write_allow succeeded' },
  { id: 'SEC-GUARD-MISSING', what: 'guard/preload absent, wrong hash or wrong policy' },
  { id: 'SEC-AUDIT-MISMATCH', what: 'intent/result pairing, digest or vector mismatch' },
  { id: 'SEC-CHAIN-MISMATCH', what: 'chain seq/prev/bytes/digest/summary mismatch' },
  { id: 'SEC-STAGED-MISMATCH', what: 'staged set/byte/hash/mapping mismatch' },
  { id: 'SEC-PATH-ESCAPE', what: 'path outside the declared root or not canonical' },
  { id: 'SEC-REPARSE', what: 'reparse point, hardlink or ancestor reparse' },
  { id: 'SEC-ORIGINAL-CHANGED', what: 'ORIGINAL changed outside the declared window' },
  { id: 'SEC-PRODUCT-PRELOAD', what: 'product child not preloaded with guard+audit' },
  { id: 'SEC-DEST-PROTECTED', what: 'archive destination intersects a protected tree' },
  { id: 'SEC-OBSERVER', what: 'observer relay/nonce/EOF/deadline violation' },
];
const TRIGGER_IDS = TRIGGERS.map((t) => t.id);
const TRIGGER_SET = new Set(TRIGGER_IDS);

// Exact reason -> trigger. No substring matching: a reason that is not listed here is
// non-security by construction, and a security_codes entry without a mapping is rejected
// by the generator. This keeps class/trigger diagnosis stable.
const SEC_TRIGGER_BY_REASON = {
  'ADS/USN enumeration incomplete': 'SEC-AUDIT-MISMATCH',
  'Codex granted any write ACE': 'SEC-IDENTITY',
  'M1 write to the M0 path': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'P0_CODEX_ACCOUNT not in the two approved names': 'SEC-IDENTITY',
  'account name/SID mismatch': 'SEC-IDENTITY',
  'account not a candidate (60)': 'SEC-IDENTITY',
  'admin SID or role (53)': 'SEC-IDENTITY',
  'any C18 state other than bound/disabled-unbound/failed': 'SEC-AUDIT-MISMATCH',
  'any dist write': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'any emit inside the copy': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'any read of ORIGINAL': 'SEC-DENIED-READ-SUCCEEDED',
  'archive byte mismatch': 'SEC-AUDIT-MISMATCH',
  'attribution of a diff as a pass': 'SEC-AUDIT-MISMATCH',
  'before/after chain broken': 'SEC-CHAIN-MISMATCH',
  'bootstrap path already exists': 'SEC-STAGED-MISMATCH',
  'byte/hash mismatch': 'SEC-AUDIT-MISMATCH',
  'chain genesis/create fails': 'SEC-CHAIN-MISMATCH',
  'chain tail not at a segment_close': 'SEC-CHAIN-MISMATCH',
  'control config hash mismatch': 'SEC-AUDIT-MISMATCH',
  'denied read succeeds': 'SEC-DENIED-READ-SUCCEEDED',
  'destination inside a protected tree': 'SEC-DEST-PROTECTED',
  'diff vs M0 not empty': 'SEC-ORIGINAL-CHANGED',
  'extra file': 'SEC-STAGED-MISMATCH',
  'hardlink/reparse': 'SEC-REPARSE',
  'hash/metadata/ADS mismatch': 'SEC-AUDIT-MISMATCH',
  'icon predicate violated': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'icon present_before=1 but create attempted': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'manifest hash mismatch': 'SEC-AUDIT-MISMATCH',
  'manifest hash/schema/key-tool mismatch': 'SEC-AUDIT-MISMATCH',
  'mapping mismatch': 'SEC-STAGED-MISMATCH',
  'missing summary': 'SEC-AUDIT-MISMATCH',
  'node_modules/dist/test/.git target': 'SEC-PATH-ESCAPE',
  'non-admin token': 'SEC-IDENTITY',
  'not in WENX\\CodexSandboxUsers (60)': 'SEC-IDENTITY',
  'path escapes the copy': 'SEC-PATH-ESCAPE',
  'path not listed in the map': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'payload set not exactly 20 files': 'SEC-STAGED-MISMATCH',
  'readback differs from expected ACE set': 'SEC-IDENTITY',
  'relay invalid or nonce mismatch (63)': 'SEC-OBSERVER',
  'reparse point': 'SEC-REPARSE',
  'reparse/ancestor/escape/duplicate path': 'SEC-REPARSE',
  'reparse/link escape': 'SEC-REPARSE',
  'report claims coverage beyond its declared cutoff': 'SEC-AUDIT-MISMATCH',
  'report cutoffs beyond the tail': 'SEC-AUDIT-MISMATCH',
  'runtime binary size/hash mismatch': 'SEC-AUDIT-MISMATCH',
  'segment digest mismatch': 'SEC-CHAIN-MISMATCH',
  'segment hash mismatch': 'SEC-CHAIN-MISMATCH',
  'shared dependency identity': 'SEC-AUDIT-MISMATCH',
  'source changed during archive': 'SEC-ORIGINAL-CHANGED',
  'staged recheck mismatch when staged_state=complete': 'SEC-STAGED-MISMATCH',
  'staged set != 16 mapped files': 'SEC-STAGED-MISMATCH',
  'summary hash mismatch': 'SEC-AUDIT-MISMATCH',
  'tsc.js hash mismatch': 'SEC-AUDIT-MISMATCH',
  'unaccounted write in RUN': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'unlisted write succeeds': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'unregistered dist chunk': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'verification fails': 'SEC-AUDIT-MISMATCH',
  'worker preload missing': 'SEC-GUARD-MISSING',
  'write access granted or errored (59)': 'SEC-IDENTITY',
  'write outside the six targets or three conditional icons': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'write outside the six targets or the three conditional icons': 'SEC-UNLISTED-WRITE-SUCCEEDED',
  'ORIGINAL changed while only the previous execution ran': 'SEC-ORIGINAL-CHANGED',
  'C07 must not be re-run for the same target': 'SEC-AUDIT-MISMATCH',
};
function triggerFor(reason) { return SEC_TRIGGER_BY_REASON[reason] || null; }

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
  "$root='D:\\P47TOOLS\\p47-phase0-v9'",
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
  "if($j.schema -ne 'p47-phase0-tool-release-v5' -or $j.release_id -ne 'p47-phase0-v9'){exit 44}",
  "$fl=@($j.files)",
  "if($fl.Count -ne 20){exit 44}",
  "foreach($rel in @('payload/tools/p0-dispatch.ps1','payload/tools/p0-verify-release.ps1','payload/tools/p0-audit.cjs')){$e=@($fl | Where-Object {$_.path -eq $rel});if($e.Count -ne 1){exit 44};$x=FH ([IO.Path]::Combine($root,$rel.Replace('/','\\')));if($null -eq $x -or $x.b -ne [long]$e[0].bytes -or $x.h -ne ([string]$e[0].sha256).ToLower()){exit 44}}",
  "$ca=[Environment]::GetCommandLineArgs()",
  "$obs=$ca[$ca.Length-1]",
  "$ob=[Text.Encoding]::UTF8.GetBytes($obs)",
  "$so=[Security.Cryptography.SHA256]::Create()",
  "try{$oh=([BitConverter]::ToString($so.ComputeHash($ob)) -replace '-','').ToLower()}finally{$so.Dispose()}",
  "[pscustomobject]@{schema='p47-c00-v9';user=$id.Name;sid=$id.User.Value;admin=$true;codex_account=$env:P0_CODEX_ACCOUNT;manifest_sha256=$mh2;manifest_file_count=$fl.Count;observed_command_sha256=$oh}|ConvertTo-Json -Compress",
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
  "[pscustomobject]@{schema='p47-c03-probe-v4';nonce=$nonce;account=$id.Name;account_sid=$id.User.Value;admin=$false;group='WENX\\CodexSandboxUsers';read_sentinel=$true;read_sentinel_sha256=$rh;write_result=$wr;observed_command_sha256=$oh}|ConvertTo-Json -Compress",
].join(';');

const INLINE = { 'C00-E01': C00_SCRIPT, 'C03-PROBE-E01': PROBE_SCRIPT };

// ------------------------------------------------------------- exec records
// class: pre-run | genesis | infra | baseline | target | before | after | bind | finalizer | seal
// chain: none | genesis | participant | terminal
const EXECS = [];
function ex(o) {
  const e = Object.assign({
    executor: 'admin', entry: 'source-dispatcher', chain: 'participant', env: {}, stdin: 'none',
    tools: [], load: [], inputs: [], metadata: [], outputs: [], dirs: [],
    product: null, product_env: null, target_argv: null, conditional: null,
    requires: [], class: 'target', temp: { mode: 'forbidden' }, condition: null,
    fail_class: 'fatal', fail_closed: [], security_codes: [], enforcement: 'dispatcher-verify+self-report',
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

function dirsFor(cmd, id) { return [O(outRoot(cmd), 'DCA'), O(outDir(cmd, id), 'DC')]; }
function files(cmd, id, names) { return names.map((n) => O(outDir(cmd, id) + '\\' + n, 'FC')); }

// temp policy helper: redirected(temp path, layers) | forbidden | inherited
const tempR = (p) => ({ mode: 'redirected', path: p, read: true, write: true, note: 'runner TEMP/TMP; shared per run; no per-exec subdirectory in Phase 0' });
const tempForbidden = () => ({ mode: 'forbidden', path: null, read: false, write: false, note: 'no temp write is permitted; the process must not create temporary files' });
const tempInherited = () => ({ mode: 'inherited', path: null, read: false, write: false, note: 'inherited user TEMP; any write there is a disclosed out-of-contract side effect and is not authorised' });

// ---- S0
ex({
  id: 'C00-E01', cmd: 'C00', step: 'S0', phase: 'S0', entry: 'inline', chain: 'none', cwd: P.HOME,
  class: 'pre-run', temp: tempForbidden(),
  env: { P0_ADMIN_ACCOUNT_SID: 'required', P0_TOOLSRC_MANIFEST_SHA256: 'required', P0_CODEX_ACCOUNT: 'required' },
  inputs: [F(P.MANIFEST), F(src('dispatch')), F(src('verify')), F(src('audit')), F(RUNTIME.powershell.path), F(RUNTIME.node.path)],
  outputs: [{ path: 'console', code: 'CONSOLE', note: 'single JSON line; C20 archives the hash' }],
  fail_class: 'pre-run', requires: [],
  fail_closed: ['account name/SID mismatch (45)', 'non-admin token (46)', 'P0_CODEX_ACCOUNT not in the two approved names (47)',
    'cwd mismatch or RUN already exists (48)', 'runtime binary size/hash mismatch (49)',
    'manifest hash/schema/20-file/key-tool/anchor mismatch (43/44)'],
  enforcement: 'inline powershell; no TOOLSRC execution; no write; ancestor reparse checks',
});
ex({
  id: 'C05-PRE-E01', cmd: 'C05', variant: 'PRE', step: 'S0', phase: 'S0', entry: 'source-dispatcher', chain: 'none', cwd: P.HOME,
  class: 'pre-run', temp: tempForbidden(),
  tools: ['verify'], load: ['dispatch', 'verify', 'audit'],
  inputs: [F(P.MANIFEST), T(P.PAYLOAD), F(RUNTIME.powershell.path), F(RUNTIME.node.path)],
  fail_class: 'pre-run',
  fail_closed: ['manifest hash mismatch', 'payload set not exactly 20 files', 'byte/hash mismatch', 'reparse/ancestor/escape/duplicate path'],
  enforcement: 'source dispatcher + verifier; read-only; no RUN',
});
ex({
  id: 'C01-E01', cmd: 'C01', step: 'S0', phase: 'S0', entry: 'source-dispatcher', chain: 'genesis', cwd: P.HOME,
  class: 'genesis', temp: tempR(P.TMP),
  tools: ['init', 'audit', 'verify'], load: ['dispatch', 'init', 'audit', 'verify'], bootstrap: true,
  inputs: [F(P.MANIFEST), T(P.PAYLOAD), T(P.TMP)],
  outputs: [
    O(P.RUN_PARENT, 'DC', 'only if absent'), O(P.RUN, 'DC'), O(P.OUT, 'DC'), O(P.AUDIT, 'DC'),
    O(P.TMP, 'DC'), O(P.TMP, 'TW'), O(P.STAGED, 'DC'), O(P.CONTROLS, 'DC'), O(P.ACLPROBE, 'DC'), O(P.BASELINE, 'DC'), O(P.EXP, 'DC'),
    O(P.EVIDENCE, 'DC'), O(P.TRUST, 'DC'), O(P.REVIEW, 'DC'),
    O(P.READ_SENTINEL, 'FC'), O(P.WRITE_SENTINEL, 'FC'),
    ...dirsFor('C01', 'C01-E01'), O(outDir('C01', 'C01-E01') + '\\init.json', 'FC'),
  ],
  fail_class: 'bootstrap', requires: [],
  fail_closed: ['RUN exists', 'verification fails', 'chain genesis/create fails', 'bootstrap path already exists'],
  enforcement: 'source dispatcher + verifier + init; bootstrap enumerated in genesis; own segment open/close',
});
ex({
  id: 'C02-E01', cmd: 'C02', step: 'S0', phase: 'S0', tools: ['acl', 'audit'], load: ['dispatch', 'acl', 'audit'], cwd: P.RUN,
  class: 'infra', temp: tempR(P.TMP), env: { TEMP: P.TMP, TMP: P.TMP },
  metadata: [P.RUN, P.RUN_PARENT], inputs: [T(P.TMP)],
  outputs: [
    O(P.RUN, 'ACL', 'recursive explicit DACL; inheritance disabled'),
    ...dirsFor('C02', 'C02-E01'), ...files('C02', 'C02-E01', ['acl-before.json', 'acl-after.json', 'result.json']),
    O(P.TMP, 'TW'),
  ],
  fail_class: 'fatal',
  fail_closed: ['account name/SID mismatch', 'unexpected pre-existing entry in RUN', 'readback differs from expected ACE set', 'Codex granted any write ACE'],
  enforcement: 'dispatcher + p0-acl.ps1 with SDDL readback',
});
ex({
  id: 'C03-OBS-E01', cmd: 'C03', variant: 'OBS', step: 'S0', phase: 'S0', tools: ['observe', 'audit'],
  load: ['dispatch', 'observe', 'audit'], cwd: P.RUN, class: 'infra', temp: tempR(P.TMP),
  stdin: 'one relay line (<=4096 bytes); EOF fails closed', env: { P0_CODEX_ACCOUNT: 'required', TEMP: P.TMP, TMP: P.TMP },
  deadline_seconds: 900, inputs: [F(P.WRITE_SENTINEL), F(P.READ_SENTINEL), T(P.TMP)],
  outputs: [O(P.NONCE, 'FC'), ...dirsFor('C03', 'C03-OBS-E01'),
    ...files('C03', 'C03-OBS-E01', ['codex-console.jsonl', 'result.json']), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  fail_closed: ['account not a candidate (60)', 'not in WENX\\CodexSandboxUsers (60)', 'nonce create fails (61)',
    'no relay line before 900 s (62)', 'relay invalid or nonce mismatch (63)'],
  enforcement: 'dispatcher + observer; admin writes only; relay is human-mediated (disclosed)',
});
ex({
  id: 'C03-PROBE-E01', cmd: 'C03', variant: 'PROBE', step: 'S0', phase: 'S0', executor: 'codex',
  entry: 'codex-inline', chain: 'none', cwd: P.RUN, class: 'infra', temp: tempInherited(),
  env: { P0_CODEX_ACCOUNT: 'required' }, deadline_seconds: 300,
  inputs: [F(P.NONCE), F(P.READ_SENTINEL)],
  outputs: [{ path: 'console', code: 'CONSOLE', note: 'one JSON line relayed to C03-OBS-E01; zero RUN writes' }],
  attempted_writes: [P.WRITE_SENTINEL],
  fail_class: 'fatal',
  fail_closed: ['P0_CODEX_ACCOUNT not a candidate (51)', 'current account != P0_CODEX_ACCOUNT (52)', 'admin SID or role (53)',
    'not in the Codex group (54)', 'cwd mismatch (55)', 'nonce missing (56)/malformed (57)', 'read sentinel mismatch (58)',
    'write access granted or errored (59)'],
  enforcement: 'codex-inline powershell; OS ACL is the only enforcement; zero writes',
});

// ---- S1/S2
ex({
  id: 'C04-E01', cmd: 'C04', step: 'S1', phase: 'S1', tools: ['stage', 'audit'], load: ['dispatch', 'stage', 'audit'], cwd: P.RUN,
  class: 'infra', temp: tempR(P.TMP), env: { TEMP: P.TMP, TMP: P.TMP },
  inputs: [F(P.MANIFEST), T(P.PAYLOAD), T(P.TMP)],
  outputs: [O(P.STAGED, 'DCA', 'create only if absent; C01 normally created it'),
    O(P.STAGED + '\\cases', 'DCA', 'cases subdirectory'),
    ...Object.keys(TOOLS).filter((k) => TOOLS[k].staged).map((k) => O(stg(k), 'FC', 'staged tool file; CreateNew')),
    ...dirsFor('C04', 'C04-E01'), ...files('C04', 'C04-E01', ['stage.json']), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  fail_closed: ['any staged file already exists (an empty STAGED directory is allowed)', 'manifest entry outside payload/tools', 'reparse point', 'byte/hash mismatch', 'write outside STAGED'],
  enforcement: 'dispatcher + stage (.NET CreateNew; no readback of the target)',
});
ex({
  id: 'C05-FINAL-E01', cmd: 'C05', variant: 'FINAL', step: 'S1', phase: 'S1', tools: ['verify', 'audit'],
  load: ['dispatch', 'verify', 'audit'], cwd: P.RUN, class: 'infra', temp: tempR(P.TMP), env: { TEMP: P.TMP, TMP: P.TMP },
  inputs: [F(P.MANIFEST), T(P.STAGED), T(P.TMP)],
  outputs: [...dirsFor('C05', 'C05-FINAL-E01'), ...files('C05', 'C05-FINAL-E01', ['verify.json']), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  fail_closed: ['staged set != 16 mapped files', 'byte/hash mismatch', 'reparse point', 'mapping mismatch', 'extra file'],
  enforcement: 'source dispatcher + verifier; full byte readback of the staged tree',
});
ex({
  id: 'C06-E01', cmd: 'C06', step: 'S2', phase: 'S2', entry: 'staged-dispatcher', tools: ['simulate', 'guard', 'audit', 'simcases', 'vectors'],
  load: ['dispatch', 'simulate', 'guard', 'audit'], cwd: P.RUN, class: 'infra', temp: tempR(P.TMP), env: { TEMP: P.TMP, TMP: P.TMP },
  guard: true, fail_class: 'fatal',
  inputs: [F(stg('simcases')), F(stg('vectors')), T(P.CONTROLS), T(P.TMP)],
  outputs: [...dirsFor('C06', 'C06-E01'), ...files('C06', 'C06-E01', ['result.json', 'guard.jsonl']), O(P.CONTROLS, 'TW'), O(P.TMP, 'TW')],
  fail_closed: ['a denied read succeeds', 'an unlisted write succeeds', 'FD/copy/link/worker mismatch', 'audit vector mismatch', 'guard not preloaded in the child'],
  enforcement: 'staged dispatcher + fs-guard in the Node tool and children',
});

// ---- targets
const vargv = (copy, config, cmd, id) => [P.NODE, copy + '\\node_modules\\vitest\\vitest.mjs', 'run', '--config', config,
  '--pool=forks', '--poolOptions.forks.singleFork=true', '--no-file-parallelism', '--reporter=json',
  '--outputFile', outDir(cmd, id) + '\\vitest.json', 'test/string-decoder.test.ts'];

const TARGETS = [
  { id: 'C08-E01', cmd: 'C08', step: 'S3', tools: ['archive', 'guard', 'audit'], load: ['dispatch', 'archive', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), T(P.ORIGINAL), T(P.TMP)],
    outputs: [O(P.SNAP, 'TC'), ...dirsFor('C08', 'C08-E01'), ...files('C08', 'C08-E01', ['archive.json', 'result.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal', cls: 'target',
    gate: 'C07-M0-E01 ok; ORIGINAL unchanged since M0',
    fail: ['source changed during archive', 'reparse/link escape', 'snapshot byte mismatch'] },
  { id: 'C09-E01', cmd: 'C09', step: 'S4', tools: ['copy', 'guard', 'audit'], load: ['dispatch', 'copy', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), T(P.SNAP), T(P.TMP)],
    outputs: [O(P.CP, 'TC'), O(P.CN, 'TC'), O(P.CS, 'TC'), ...dirsFor('C09', 'C09-E01'),
      ...files('C09', 'C09-E01', ['copies.json', 'result.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal', cls: 'target',
    gate: 'C08-E01 ok',
    fail: ['hardlink/reparse', 'shared dependency identity', 'copy hash mismatch', 'any read of ORIGINAL'] },
  { id: 'C10-P-E01', cmd: 'C10', variant: 'P', step: 'S5', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CP,
    inputs: [F(P.CP + '\\vite.config.ts'), F(P.CP + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CP), T(P.TMP)],
    outputs: [...dirsFor('C10', 'C10-P-E01'), O(P.CP + '\\p0-probe.vite.config.mjs', 'FC'),
      ...files('C10', 'C10-P-E01', ['result.json', 'vitest.json']),
      O(P.CP + '\\node_modules\\.vite', 'TW'), O(P.CP + '\\node_modules\\.vite-temp', 'TW'), O(P.CP + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CP, config: P.CP + '\\p0-probe.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CP, P.CP + '\\p0-probe.vite.config.mjs', 'C10', 'C10-P-E01'),
    gate: 'C09-E01 ok; copies.json entry hash matches; entry/report hashes match',
    fail: ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds', 'config template hash mismatch', 'vitest exit non-zero'] },
  { id: 'C10-N-E01', cmd: 'C10', variant: 'N', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CN,
    inputs: [F(P.CN + '\\vite.config.ts'), F(P.CN + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CN), T(P.TMP)],
    outputs: [...dirsFor('C10', 'C10-N-E01'), O(P.CN + '\\p0-probe.vite.config.mjs', 'FC'),
      ...files('C10', 'C10-N-E01', ['result.json', 'vitest.json']),
      O(P.CN + '\\node_modules\\.vite', 'TW'), O(P.CN + '\\node_modules\\.vite-temp', 'TW'), O(P.CN + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CN, config: P.CN + '\\p0-probe.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CN, P.CN + '\\p0-probe.vite.config.mjs', 'C10', 'C10-N-E01'),
    gate: 'C10-P-E01 ok',
    fail: ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds', 'config template hash mismatch', 'vitest exit non-zero'] },
  { id: 'C11-E01', cmd: 'C11', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CP,
    inputs: [F(P.CP + '\\node_modules\\typescript\\lib\\tsc.js'), F(outDir('C09', 'C09-E01') + '\\copies.json'), F(P.CP + '\\tsconfig.json'), T(P.CP), T(P.TMP)],
    outputs: [...dirsFor('C11', 'C11-E01'), ...files('C11', 'C11-E01', ['result.json', 'tsc.log']), O(P.CP + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CP, config: P.CP + '\\tsconfig.json', productFiles: [] },
    target_argv: [P.NODE, P.CP + '\\node_modules\\typescript\\lib\\tsc.js', '-p', P.CP + '\\tsconfig.json', '--noEmit'],
    gate: 'C10-P-E01 ok; tsc.js hash equals copies.json entry',
    fail: ['missing --noEmit', 'tsc.js hash mismatch', 'any emit inside the copy', 'extra argv'] },
  { id: 'C12-E01', cmd: 'C12', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CP,
    inputs: [F(P.CP + '\\vite.config.ts'), F(P.CP + '\\node_modules\\vitest\\vitest.mjs'), F(P.CP + '\\manifest.json'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CP), T(P.TMP)],
    outputs: [...dirsFor('C12', 'C12-E01'), ...files('C12', 'C12-E01', ['result.json', 'vitest.json', 'dist-before.json', 'dist-after.json']),
      O(P.CP + '\\node_modules\\.vite', 'TW'), O(P.CP + '\\node_modules\\.vite-temp', 'TW'), O(P.CP + '\\tmp', 'TW'), O(P.TMP, 'TW'),
      O(P.CP + '\\dist\\manifest.json', 'FW'), O(P.CP + '\\dist\\devtools.html', 'FW'),
      O(P.CP + '\\dist\\panel.html', 'FW'), O(P.CP + '\\dist\\panel.css', 'FW'),
      O(P.CP + '\\dist\\panel-layout.css', 'FW'), O(P.CP + '\\dist\\sandbox.html', 'FW'),
      O(P.CP + '\\dist\\icon16.png', 'ICON'), O(P.CP + '\\dist\\icon48.png', 'ICON'), O(P.CP + '\\dist\\icon128.png', 'ICON')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CP, config: P.CP + '\\vite.config.ts', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CP, P.CP + '\\vite.config.ts', 'C12', 'C12-E01'),
    gate: 'C10-P-E01 ok; original config only',
    fail: ['write outside the six targets or three conditional icons', 'icon present_before=1 but create attempted', 'unregistered dist chunk'] },
  { id: 'C13-E01', cmd: 'C13', step: 'S6', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CN,
    inputs: [F(P.CN + '\\vite.config.ts'), F(P.CN + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CN), T(P.TMP)],
    outputs: [...dirsFor('C13', 'C13-E01'), O(P.CN + '\\control.vite.config.mjs', 'FC'),
      ...files('C13', 'C13-E01', ['result.json', 'vitest.json', 'config-diff.json']),
      O(P.CN + '\\node_modules\\.vite', 'TW'), O(P.CN + '\\node_modules\\.vite-temp', 'TW'), O(P.CN + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CN, config: P.CN + '\\control.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CN, P.CN + '\\control.vite.config.mjs', 'C13', 'C13-E01'),
    gate: 'C10-N-E01 ok; control config hash equals the fixed template',
    fail: ['any dist write', 'control config hash mismatch', 'plugin diff != 1'] },
  { id: 'C10-S-E01', cmd: 'C10', variant: 'S', step: 'S7', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(P.CS + '\\vite.config.ts'), F(P.CS + '\\node_modules\\vitest\\vitest.mjs'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CS), T(P.TMP)],
    outputs: [...dirsFor('C10', 'C10-S-E01'), O(P.CS + '\\p0-probe.vite.config.mjs', 'FC'),
      ...files('C10', 'C10-S-E01', ['result.json', 'vitest.json']),
      O(P.CS + '\\node_modules\\.vite', 'TW'), O(P.CS + '\\node_modules\\.vite-temp', 'TW'), O(P.CS + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CS, config: P.CS + '\\p0-probe.vite.config.mjs', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CS, P.CS + '\\p0-probe.vite.config.mjs', 'C10', 'C10-S-E01'),
    gate: 'C13-E01 ok',
    fail: ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds', 'config template hash mismatch', 'vitest exit non-zero'] },
  { id: 'C14-E01', cmd: 'C14', step: 'S7', tools: ['neutralize', 'guard', 'audit'], load: ['dispatch', 'neutralize', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(stg('nmap')), T(P.CS), T(P.TMP)],
    outputs: [...dirsFor('C14', 'C14-E01'), O(outDir('C14', 'C14-E01') + '\\result.json', 'FC'),
      O(outDir('C14', 'C14-E01') + '\\mapping-result.json', 'FC'), O(P.CS, 'ML', 'only paths listed in the approved map'), O(P.CS + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    gate: 'C10-S-E01 ok; map verified against its staged hash',
    fail: ['path not listed in the map', 'path escapes the copy', 'node_modules/dist/test/.git target', 'non-reversible edit'] },
  { id: 'C15-E01', cmd: 'C15', step: 'S7', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(P.CS + '\\node_modules\\typescript\\lib\\tsc.js'), F(outDir('C09', 'C09-E01') + '\\copies.json'), F(P.CS + '\\tsconfig.json'), T(P.CS), T(P.TMP)],
    outputs: [...dirsFor('C15', 'C15-E01'), ...files('C15', 'C15-E01', ['result.json', 'tsc.log']), O(P.CS + '\\tmp', 'TW'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CS, config: P.CS + '\\tsconfig.json', productFiles: [] },
    target_argv: [P.NODE, P.CS + '\\node_modules\\typescript\\lib\\tsc.js', '-p', P.CS + '\\tsconfig.json', '--noEmit'],
    gate: 'C14-E01 ok and C10-S-E01 ok',
    fail: ['missing --noEmit', 'tsc.js hash mismatch', 'any emit inside the copy', 'extra argv'] },
  { id: 'C16-E01', cmd: 'C16', step: 'S7', tools: ['prun', 'guard', 'audit', 'verify'], load: ['dispatch', 'prun', 'guard', 'audit'], cwd: P.CS,
    inputs: [F(P.CS + '\\vite.config.ts'), F(P.CS + '\\node_modules\\vitest\\vitest.mjs'), F(P.CS + '\\manifest.json'), F(outDir('C09', 'C09-E01') + '\\copies.json'), T(P.CS), T(P.TMP)],
    outputs: [...dirsFor('C16', 'C16-E01'), ...files('C16', 'C16-E01', ['result.json', 'vitest.json', 'dist-before.json', 'dist-after.json']),
      O(P.CS + '\\node_modules\\.vite', 'TW'), O(P.CS + '\\node_modules\\.vite-temp', 'TW'), O(P.CS + '\\tmp', 'TW'), O(P.TMP, 'TW'),
      O(P.CS + '\\dist\\manifest.json', 'FW'), O(P.CS + '\\dist\\devtools.html', 'FW'),
      O(P.CS + '\\dist\\panel.html', 'FW'), O(P.CS + '\\dist\\panel.css', 'FW'),
      O(P.CS + '\\dist\\panel-layout.css', 'FW'), O(P.CS + '\\dist\\sandbox.html', 'FW'),
      O(P.CS + '\\dist\\icon16.png', 'ICON'), O(P.CS + '\\dist\\icon48.png', 'ICON'), O(P.CS + '\\dist\\icon128.png', 'ICON')],
    guard: true, fail_class: 'gate', cls: 'target',
    product: { copy: P.CS, config: P.CS + '\\vite.config.ts', productFiles: ['vitest.json'] },
    target_argv: vargv(P.CS, P.CS + '\\vite.config.ts', 'C16', 'C16-E01'),
    gate: 'C14-E01 ok and C10-S-E01 ok',
    fail: ['write outside the six targets or three conditional icons', 'icon predicate violated', 'unregistered dist chunk'] },
  { id: 'C17-E01', cmd: 'C17', step: 'S8', tools: ['compare', 'guard', 'audit'], load: ['dispatch', 'compare', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), F(outDir('C07', 'C07-M1-E01') + '\\m1.json'), F(outDir('C09', 'C09-E01') + '\\copies.json'),
      T(outRoot('C07')), T(outRoot('C08')), T(outRoot('C09')), T(outRoot('C10')), T(outRoot('C11')), T(outRoot('C12')),
      T(outRoot('C13')), T(outRoot('C14')), T(outRoot('C15')), T(outRoot('C16')), T(P.TMP)],
    outputs: [...dirsFor('C17', 'C17-E01'), ...files('C17', 'C17-E01', ['result.json', 'diff.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal', cls: 'finalizer', gate: 'C07-M1-E01 terminal; every S5-S7 target recorded (ok | failed | skipped); absent outputs are reported as skipped, never invented',
    fail: ['results missing for a closed target', 'hash/metadata/ADS mismatch', 'attribution of a diff as a pass'],
    optional_reads: [F(outDir('C07', 'C07-M1-E01') + '\\m1.json'),
      T(outRoot('C07')), T(outRoot('C08')), T(outRoot('C09')), T(outRoot('C10')), T(outRoot('C11')), T(outRoot('C12')),
      T(outRoot('C13')), T(outRoot('C14')), T(outRoot('C15')), T(outRoot('C16'))] },
  { id: 'C18-E01', cmd: 'C18', step: 'S8', tools: ['archive', 'guard', 'audit', 'verify'], load: ['dispatch', 'archive', 'guard', 'audit'], cwd: P.RUN,
    conditional: 'P0_SECOND_ARCHIVE', env: { TEMP: P.TMP, TMP: P.TMP }, class: 'target', temp: tempR(P.TMP),
    inputs: [F(P.M0), F(P.BINDING_FILE), T(P.SNAP), T('BINDING:c18_destination'), T(P.TMP)],
    outputs: [O('BINDING:c18_destination', 'EC'), ...dirsFor('C18', 'C18-E01'),
      ...files('C18', 'C18-E01', ['archive.json', 'result.json']), O(P.TMP, 'TW')],
    guard: true, fail_class: 'gate',
    gate: 'C18-BIND-E01 recorded bound; binding file sha equals the segment_open record; destination comes only from the binding file (the live environment is not read again)',
    fail: ['binding file missing or hash mismatch', 'destination exists', 'destination inside a protected tree', 'archive byte mismatch'],
    condition: 'c18-bound' },
  { id: 'C19-E01', cmd: 'C19', step: 'S8', tools: ['index', 'guard', 'audit'], load: ['dispatch', 'index', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), F(P.CHAIN), T(P.AUDIT), T(P.OUT), T(P.EVIDENCE), T(P.TRUST), F(P.BINDING_FILE), T(P.TMP)],
    outputs: [...dirsFor('C19', 'C19-E01'),
      ...files('C19', 'C19-E01', ['index.json', 'cutoff.json', 'result.json']),
      O(P.EVIDENCE + '\\index.json', 'FC'), O(P.TRUST + '\\anchor.json', 'FC'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal', cls: 'finalizer',
    gate: 'C07-B-C19-E01 settled; binding record present (bound or disabled-unbound); cutoff must equal the preceding segment_close',
    fail: ['unaccounted write in RUN', 'segment hash mismatch', 'missing summary', 'cutoff not equal to the preceding segment_close'],
    optional_reads: [F(P.BINDING_FILE)], temp: tempR(P.TMP) },
  { id: 'C20-REPORT-E01', cmd: 'C20', variant: 'REPORT', step: 'S9', tools: ['report', 'guard', 'audit'], load: ['dispatch', 'report', 'guard', 'audit'], cwd: P.RUN,
    inputs: [F(P.M0), F(P.CHAIN), F(outDir('C19', 'C19-E01') + '\\cutoff.json'), T(outRoot('C17')), T(P.AUDIT), T(P.EVIDENCE), T(P.TRUST), F(P.BINDING_FILE), T(P.TMP)],
    outputs: [...dirsFor('C20', 'C20-REPORT-E01'),
      ...files('C20', 'C20-REPORT-E01', ['result.json']),
      O(P.REVIEW + '\\PHASE4.7-PHASE0-REPORT-V9.md', 'FC'), O(P.REVIEW + '\\PHASE4.7-PHASE0-REPORT-V9.json', 'FC'),
      O(P.EVIDENCE + '\\report-coverage.json', 'FC'), O(P.TMP, 'TW')],
    guard: true, fail_class: 'fatal', cls: 'finalizer',
    gate: 'C19-E01 terminal; the report consumes the C18 chain record and re-hashes the binding file only if it exists',
    fail: ['report claims coverage beyond its declared cutoff', 'any C18 state other than bound/disabled-unbound/failed'],
    optional_reads: [F(P.BINDING_FILE), T(outRoot('C17')), F(outDir('C19', 'C19-E01') + '\\cutoff.json')], temp: tempR(P.TMP) },
];

const TARGET_LIST = TARGETS.filter((t) => !['C17-E01', 'C18-E01', 'C19-E01', 'C20-REPORT-E01'].includes(t.id));

// ok-dependencies (success required). Structural/terminal dependencies live in `requires`.
const DEPS = {
  'C08-E01': ['C07-M0-E01'], 'C09-E01': ['C08-E01'],
  'C10-P-E01': ['C09-E01'], 'C10-N-E01': ['C10-P-E01'], 'C11-E01': ['C10-P-E01'], 'C12-E01': ['C10-P-E01'],
  'C13-E01': ['C10-N-E01'], 'C10-S-E01': ['C13-E01'], 'C14-E01': ['C10-S-E01'],
  'C15-E01': ['C10-S-E01', 'C14-E01'], 'C16-E01': ['C10-S-E01', 'C14-E01'],
};
const SEC = {
  'C08-E01': ['source changed during archive', 'reparse/link escape'],
  'C09-E01': ['hardlink/reparse', 'shared dependency identity', 'any read of ORIGINAL'],
  'C10-P-E01': ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds'],
  'C10-N-E01': ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds'],
  'C11-E01': ['tsc.js hash mismatch', 'any emit inside the copy'],
  'C12-E01': ['write outside the six targets or three conditional icons', 'icon present_before=1 but create attempted', 'unregistered dist chunk'],
  'C13-E01': ['any dist write', 'control config hash mismatch'],
  'C10-S-E01': ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds'],
  'C14-E01': ['path not listed in the map', 'path escapes the copy', 'node_modules/dist/test/.git target'],
  'C15-E01': ['tsc.js hash mismatch', 'any emit inside the copy'],
  'C16-E01': ['write outside the six targets or three conditional icons', 'icon predicate violated', 'unregistered dist chunk'],
  'C18-E01': ['destination inside a protected tree', 'archive byte mismatch'],
};

for (const t of TARGETS) {
  ex({
    id: t.id, cmd: t.cmd, variant: t.variant || null, step: t.step, phase: t.step,
    entry: 'staged-dispatcher', tools: t.tools, load: t.load, cwd: t.cwd, class: t.cls || 'target',
    temp: tempR(P.TMP), env: { TEMP: P.TMP, TMP: P.TMP },
    product_env: t.product ? { TEMP: t.product.copy + '\\tmp', TMP: t.product.copy + '\\tmp' } : null,
    guard: t.guard, product: t.product || null, target_argv: t.target_argv || null, conditional: t.conditional || null,
    condition: t.condition || null, optional_reads: t.optional_reads || [],
    inputs: t.inputs, outputs: t.outputs, gate: t.gate, fail_closed: t.fail, fail_class: t.fail_class,
    deps: DEPS[t.id] || [], security_codes: SEC[t.id] || [],
    enforcement: 'staged dispatcher + fs-guard (runner and product)',
  });
}

// ---- C07 wrappers (before/after evidence)
function wrap(target, kind) {
  const t = EXECS.find((x) => x.id === target);
  const id = 'C07-' + kind + '-' + target;
  const isBefore = kind === 'B';
  const inputs = isBefore
    ? [F(P.M0), T(P.ORIGINAL), T(P.TMP)]
    : [F(P.M0), T(P.ORIGINAL), F(outDir('C07', 'C07-B-' + target) + '\\before.json'), T(P.TMP)];
  return ex({
    id, cmd: 'C07', variant: kind + '-' + target, step: t.step, phase: t.step,
    tools: ['manifest', 'guard', 'audit'], load: ['dispatch', 'manifest', 'guard', 'audit'], cwd: P.RUN,
    class: isBefore ? 'before' : 'after', target_ref: target, temp: tempR(P.TMP),
    env: { TEMP: P.TMP, TMP: P.TMP }, guard: true, inputs,
    outputs: [...dirsFor('C07', id), ...files('C07', id, [isBefore ? 'before.json' : 'after.json', 'result.json']), O(P.TMP, 'TW')],
    fail_class: 'fatal',
    fail_closed: ['ORIGINAL changed while only the previous execution ran', 'diff vs M0 not empty', 'before/after chain broken', 'C07 must not be re-run for the same target'],
    enforcement: 'staged dispatcher + manifest reader; admin only; one before and one after per target',
  });
}
ex({
  id: 'C07-M0-E01', cmd: 'C07', variant: 'M0', step: 'S3', phase: 'S3', tools: ['manifest', 'guard', 'audit'],
  load: ['dispatch', 'manifest', 'guard', 'audit'], cwd: P.RUN, class: 'baseline', temp: tempR(P.TMP),
  env: { TEMP: P.TMP, TMP: P.TMP }, guard: true,
  inputs: [T(P.ORIGINAL), T(P.TMP)],
  outputs: [...dirsFor('C07', 'C07-M0-E01'), O(P.M0, 'FC'), O(outDir('C07', 'C07-M0-E01') + '\\result.json', 'FC'), O(P.TMP, 'TW')],
  fail_class: 'fatal', gate: 'C06-E01 ok',
  fail_closed: ['M0 exists', 'ORIGINAL entry unreadable', 'ADS/USN enumeration incomplete'],
  enforcement: 'staged dispatcher + manifest reader; M0 written once',
});
ex({
  id: 'C07-M1-E01', cmd: 'C07', variant: 'M1', step: 'S8', phase: 'S8', tools: ['manifest', 'guard', 'audit'],
  load: ['dispatch', 'manifest', 'guard', 'audit'], cwd: P.RUN, class: 'baseline', temp: tempR(P.TMP),
  env: { TEMP: P.TMP, TMP: P.TMP }, guard: true,
  inputs: [F(P.M0), T(P.ORIGINAL), T(P.TMP)],
  outputs: [...dirsFor('C07', 'C07-M1-E01'), O(outDir('C07', 'C07-M1-E01') + '\\m1.json', 'FC'),
    O(outDir('C07', 'C07-M1-E01') + '\\diff.json', 'FC'), O(outDir('C07', 'C07-M1-E01') + '\\result.json', 'FC'), O(P.TMP, 'TW')],
  fail_class: 'fatal', gate: 'C07-A-C16-E01 terminal (ok or failed); M1 must not overwrite M0',
  fail_closed: ['M1 exists', 'M1 write to the M0 path', 'diff computed against anything other than M0'],
  enforcement: 'staged dispatcher + manifest reader',
});
ex({
  id: 'C18-BIND-E01', cmd: 'C18', variant: 'BIND', step: 'S8', phase: 'S8', tools: ['audit'], load: ['dispatch', 'audit'], cwd: P.RUN,
  class: 'bind', temp: tempR(P.TMP),
  env: { P0_SECOND_ARCHIVE: 'optional', TEMP: P.TMP, TMP: P.TMP },
  metadata: [Md('ENV_METADATA:P0_SECOND_ARCHIVE')],
  inputs: [T(P.TMP)],
  outputs: [O(P.BINDING_DIR, 'DC', 'dedicated binding directory'), O(P.BINDING_FILE, 'FC', 'immutable binding hand-off'), O(P.TMP, 'TW')],
  fail_class: 'fatal',
  gate: 'C07-A-C17-E01 terminal; P0_SECOND_ARCHIVE is read exactly once and validated before any branch',
  fail_closed: ['binding value not absolute', 'binding inside ORIGINAL/BASELINE/RUN/RUN_PARENT', 'binding exists', 'binding parent missing or reparse', 'binding read twice', 'binding file already exists'],
  enforcement: 'dispatcher control step; writes the single binding path with CreateNew; the segment_open record carries the same sha256 and destination',
});
ex({
  id: 'C20-SEAL-E01', cmd: 'C20', variant: 'SEAL', step: 'S9', phase: 'S9', tools: ['verify', 'audit'],
  load: ['dispatch', 'verify', 'audit'], cwd: P.RUN, chain: 'terminal', entry: 'source-dispatcher', class: 'seal',
  temp: tempForbidden(),
  inputs: [F(P.MANIFEST), T(P.STAGED), F(P.CHAIN), T(P.AUDIT), T(P.OUT), T(P.EVIDENCE), T(P.TRUST), T(P.REVIEW), F(P.BINDING_FILE)],
  outputs: [O(P.TSEAL, 'FC'), { path: 'console', code: 'CONSOLE', note: 'terminal seal sha256 and bytes for external anchoring' }],
  fail_class: 'seal', security_codes: ['chain tail not at a segment_close', 'segment digest mismatch', 'summary hash mismatch', 'staged recheck mismatch when staged_state=complete', 'report cutoffs beyond the tail'],
  gate: 'normal: C20-REPORT-E01 terminal; abort: a recorded abort point with terminal segment_close or an open tail reported as orphaned; degraded: staged_state=incomplete|absent. No terminal-seal.json exists',
  fail_closed: ['seal already exists', 'chain tail not at a segment_close', 'segment digest mismatch', 'summary hash mismatch', 'staged recheck mismatch when staged_state=complete', 'report cutoffs beyond the tail'],
  enforcement: 'source dispatcher + verifier + audit terminal-seal; seal modes sealed-full|degraded-prefix|aborted; no chain append, no retry; open segments are listed as orphaned, never invented as closed',
  optional_reads: [F(P.BINDING_FILE)],
});

// -------------------------------------------------------------- security classes
const SEC_EXTRA = {
  'C00-E01': ['account name/SID mismatch', 'non-admin token', 'P0_CODEX_ACCOUNT not in the two approved names', 'runtime binary size/hash mismatch', 'manifest hash/schema/key-tool mismatch'],
  'C05-PRE-E01': ['manifest hash mismatch', 'payload set not exactly 20 files', 'byte/hash mismatch', 'reparse/ancestor/escape/duplicate path'],
  'C01-E01': ['verification fails', 'chain genesis/create fails', 'bootstrap path already exists'],
  'C02-E01': ['account name/SID mismatch', 'readback differs from expected ACE set', 'Codex granted any write ACE'],
  'C03-OBS-E01': ['account not a candidate (60)', 'not in WENX\\CodexSandboxUsers (60)', 'relay invalid or nonce mismatch (63)'],
  'C03-PROBE-E01': ['write access granted or errored (59)', 'admin SID or role (53)'],
  'C04-E01': ['reparse point', 'byte/hash mismatch'],
  'C05-FINAL-E01': ['staged set != 16 mapped files', 'byte/hash mismatch', 'reparse point', 'mapping mismatch', 'extra file'],
  'C08-E01': ['source changed during archive', 'reparse/link escape', 'snapshot byte mismatch'],
  'C09-E01': ['hardlink/reparse', 'shared dependency identity', 'copy hash mismatch', 'any read of ORIGINAL'],
  'C10-P-E01': ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds'],
  'C10-N-E01': ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds'],
  'C11-E01': ['tsc.js hash mismatch', 'any emit inside the copy'],
  'C12-E01': ['write outside the six targets or the three conditional icons', 'icon present_before=1 but create attempted', 'unregistered dist chunk'],
  'C13-E01': ['any dist write', 'control config hash mismatch', 'plugin diff != 1'],
  'C10-S-E01': ['worker preload missing', 'denied read succeeds', 'unlisted write succeeds'],
  'C14-E01': ['path not listed in the map', 'path escapes the copy', 'node_modules/dist/test/.git target', 'non-reversible edit'],
  'C15-E01': ['tsc.js hash mismatch', 'any emit inside the copy'],
  'C16-E01': ['write outside the six targets or the three conditional icons', 'icon predicate violated', 'unregistered dist chunk'],
  'C17-E01': ['hash/metadata/ADS mismatch', 'attribution of a diff as a pass'],
  'C18-E01': ['destination inside a protected tree', 'archive byte mismatch', 'binding file missing or hash mismatch'],
  'C19-E01': ['unaccounted write in RUN', 'segment hash mismatch', 'missing summary'],
  'C20-REPORT-E01': ['report claims coverage beyond its declared cutoff', 'any C18 state other than bound/disabled-unbound/failed'],
  'C07-M0-E01': ['ADS/USN enumeration incomplete'],
  'C07-M1-E01': ['M1 write to the M0 path'],
};
for (const e of EXECS) {
  if (!e.security_codes || !e.security_codes.length) e.security_codes = SEC_EXTRA[e.id] || [];
}

// ------------------------------------------- failure modes: reason -> code/class/trigger
function computeFailureModes() {
  for (const e of EXECS) {
    if (e.failure_modes && e.failure_modes.length) continue;
    e.failure_modes = e.fail_closed.map((reason, i) => {
      const trigger = triggerFor(reason);
      const cls = trigger ? 'security' : (['fatal', 'gate'].includes(e.fail_class) ? e.fail_class : 'fatal');
      if (e.security_codes.includes(reason) && !trigger) throw new Error('security reason without trigger mapping: ' + e.id + ' ' + reason);
      return {
        code: 'FM-' + e.id.replace(/[^A-Z0-9]/g, '') + '-' + String(i + 1).padStart(2, '0'),
        reason,
        class: cls,
        trigger,
      };
    });
    e.failure_modes.push({
      code: 'FM-' + e.id.replace(/[^A-Z0-9]/g, '') + '-00',
      reason: 'unlisted non-zero exit (fail closed)',
      class: ['fatal', 'gate'].includes(e.fail_class) ? e.fail_class : 'fatal',
      trigger: null,
    });
  }
}

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

['C17-E01', 'C18-E01', 'C19-E01', 'C20-REPORT-E01'].forEach((target) => { wrap(target, 'B'); wrap(target, 'A'); });

const PLAN_UNBOUND = PLAN_BOUND.filter((id) => !['C07-B-C18-E01', 'C18-E01', 'C07-A-C18-E01'].includes(id));

computeFailureModes();
// SEC_EXTRA is applied before this point for base executions; wrappers already carry fail_closed.

// ------------------------------------------------------ structured requirements
// state: ok (must have closed ok) | terminal (ok|failed|aborted) | recorded (any chain
// record incl. segment_skip) | settled (the plan predecessor reached any terminal state).
// Wrappers are declared by class + target_ref and derive their requirement at build time.
const ORDER_BOUND = new Map(PLAN_BOUND.map((id, i) => [id, i]));
const ORDER_UNBOUND = new Map(PLAN_UNBOUND.map((id, i) => [id, i]));

function businessRequires(id) {
  const out = [];
  const okDeps = DEPS[id] || [];
  for (const d of okDeps) out.push({ exec: d, state: 'ok', kind: 'ok-dependency' });
  if (id === 'C17-E01') {
    out.push({ exec: 'C07-M1-E01', state: 'recorded', kind: 'order' });
    for (const t of TARGET_LIST.filter((x) => ['C10-P-E01', 'C10-N-E01', 'C11-E01', 'C12-E01', 'C13-E01', 'C10-S-E01', 'C14-E01', 'C15-E01', 'C16-E01'].includes(x.id))) {
      out.push({ exec: t.id, state: 'recorded', kind: 'terminal-evidence' });
    }
  }
  if (id === 'C18-BIND-E01') out.push({ exec: 'C07-A-C17-E01', state: 'recorded', kind: 'order' });
  if (id === 'C18-E01') { out.push({ exec: 'C18-BIND-E01', state: 'ok', kind: 'binding' }); out.push({ exec: 'C07-B-C18-E01', state: 'ok', kind: 'order' }); }
  if (id === 'C19-E01') { out.push({ exec: 'C17-E01', state: 'recorded', kind: 'terminal-evidence' }); out.push({ exec: 'C18-BIND-E01', state: 'settled', kind: 'binding-record' }); }
  if (id === 'C20-REPORT-E01') out.push({ exec: 'C19-E01', state: 'recorded', kind: 'order' });
  if (id === 'C20-SEAL-E01') out.push({ exec: 'C20-REPORT-E01', state: 'recorded', kind: 'order' });
  if (id === 'C07-M1-E01') out.push({ exec: 'C07-A-C16-E01', state: 'recorded', kind: 'order' });
  return out;
}

for (const id of PLAN_BOUND) {
  const e = EXEC(id);
  if (!e) throw new Error('plan id without exec: ' + id);
  if (e.class === 'before' || e.class === 'after' || id === 'C18-BIND-E01' || id === 'C20-SEAL-E01') continue;
  if (e.class === 'pre-run' || e.class === 'genesis') continue;
  e.requires = businessRequires(id);
}

// plan predecessor is implicit sequencing: the simulator walks the chosen order and every
// previous item must have reached a terminal state before the next one is considered.
for (let i = 0; i < PLAN_BOUND.length; i++) {
  const id = PLAN_BOUND[i];
  const e = EXEC(id);
  e.plan_predecessor = i === 0 ? null : PLAN_BOUND[i - 1];
}

// wrapper requirements
for (const e of EXECS) {
  if (e.class === 'before') {
    e.preconditions = ['the wrapped target has not started'];
    const t = EXECS.find((x) => x.id === e.target_ref);
    const okDeps = t ? businessRequires(t.id).filter((r) => r.kind === 'ok-dependency') : [];
    e.requires = okDeps;
    if (t && t.condition) e.condition = t.condition;
  } else if (e.class === 'after') {
    e.requires = [{ exec: e.target_ref, state: 'terminal', kind: 'after-evidence' }];
    e.skip_reason_if_target_skipped = 'target-skipped';
  } else if (e.id === 'C20-SEAL-E01') {
    e.requires = [{ exec: 'C20-REPORT-E01', state: 'recorded', kind: 'order' }];
  }
}

module.exports = {
  PS, RUNTIME, WCODE, TARGETS, TARGET_LIST, PLAN_BOUND, PLAN_UNBOUND, EXECS, EXEC,
  C00_SCRIPT, PROBE_SCRIPT, outRoot, outDir, audRoot, audDir, F, T, Md, O,
  TRIGGERS, TRIGGER_IDS, TRIGGER_SET, SEC_TRIGGER_BY_REASON, triggerFor, DEPS, ORDER_BOUND, ORDER_UNBOUND,
};
