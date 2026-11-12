import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-spec.cjs'
t = io.open(p, encoding='utf-8').read()

start = t.index('// Keyword -> trigger.')
end = t.index('// ------------------------------------------------------------------ inline C00')
new = r'''// Exact reason -> trigger. No substring matching: a reason that is not listed here is
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

'''
t = t[:start] + new + t[end:]

# split the ambiguous C10 reason
t = t.replace("'denied read/write succeeds'", "'denied read succeeds', 'unlisted write succeeds'")

# failure mode computation: exact map decides security
old = """    e.failure_modes = e.fail_closed.map((reason, i) => {
      const isSec = e.security_codes.includes(reason);
      const trigger = isSec ? triggerFor(reason) : null;
      const cls = isSec ? 'security' : (['fatal', 'gate'].includes(e.fail_class) ? e.fail_class : 'fatal');
      return {
        code: 'FM-' + e.id.replace(/[^A-Z0-9]/g, '') + '-' + String(i + 1).padStart(2, '0'),
        reason,
        class: cls,
        trigger,
      };
    });"""
new2 = """    e.failure_modes = e.fail_closed.map((reason, i) => {
      const trigger = triggerFor(reason);
      const cls = trigger ? 'security' : (['fatal', 'gate'].includes(e.fail_class) ? e.fail_class : 'fatal');
      if (e.security_codes.includes(reason) && !trigger) throw new Error('security reason without trigger mapping: ' + e.id + ' ' + reason);
      return {
        code: 'FM-' + e.id.replace(/[^A-Z0-9]/g, '') + '-' + String(i + 1).padStart(2, '0'),
        reason,
        class: cls,
        trigger,
      };
    });"""
assert old in t
t = t.replace(old, new2)

# export exact map instead of TRIGGER_RULES
t = t.replace('TRIGGERS, TRIGGER_IDS, TRIGGER_SET, TRIGGER_RULES, triggerFor, DEPS, ORDER_BOUND, ORDER_UNBOUND,',
              'TRIGGERS, TRIGGER_IDS, TRIGGER_SET, SEC_TRIGGER_BY_REASON, triggerFor, DEPS, ORDER_BOUND, ORDER_UNBOUND,')

# F06: pass optional_reads through TARGETS -> ex
t = t.replace("guard: t.guard, product: t.product || null, target_argv: t.target_argv || null, conditional: t.conditional || null,\n    condition: t.condition || null,",
              "guard: t.guard, product: t.product || null, target_argv: t.target_argv || null, conditional: t.conditional || null,\n    condition: t.condition || null, optional_reads: t.optional_reads || [],")

io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('spec patched')
