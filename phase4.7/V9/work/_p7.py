import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-audit.cjs'
t = io.open(p, encoding='utf-8').read()
# add a positive sealed-full-with-failures seal
old = "  seals[0] = sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]]);"
new = """  seals[0] = sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]]);
  seals.push(sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]], {
    skipped: ['C10-N-E01'], gate_failed: ['C10-P-E01'], exit_status: 'exit-not-met',
  }));"""
assert old in t
t = t.replace(old, new, 1)

# append F07/F08 negatives before return
marker = "  return {\n    schema: AUDIT.schema_vectors"
add = r'''  const badPolicy = clone(prod[0]); badPolicy.policy_sha256 = H('0');
  pushNeg('preload_policy_mismatch', relink([badPolicy, clone(prod[1]), clone(prod[2]), clone(prod[3])]), 'perm.preload_policy');
  pushNeg('write_op_not_allowed_by_rule', relink([Object.assign(clone(base), { op: 'delete' }), clone(res)]), 'perm.op');
  pushNeg('intent_without_result', [clone(base)], 'schema.intent_unpaired');
  const badLayer = clone(prod[1]); badLayer.rule_ref = 'C10-P-E01.business_writes[2]';
  pushNeg('product_cites_business_rule', relink([badLayer, clone(prod[2]), clone(prod[3])]), 'perm.rule_layer');
  const abortedChain = (() => {
    const b = chainBuilder(1, null, 0);
    syntheticClose(b, 'C14-E01', { result: 'aborted', failure_class: 'fatal' });
    b.push({ record: 'segment_skip', exec_id: 'C07-B-C15-E01', command_id: 'C07', reason: 'dependency-failed', failed_dependency: 'C14-E01', skipped_utc: T0 });
    return b.recs;
  })();
  pushNeg('aborted_target_without_after', abortedChain, 'flow.missing_after');
  pushNeg('seal_full_complete_with_skipped', [sealFixture('sealed-full', [c01.recs[c01.recs.length - 1]], {
    skipped: ['C10-N-E01'], gate_failed: ['C10-P-E01'], exit_status: 'complete',
  })], 'seal.mode');

''' + marker
assert marker in t
t = t.replace(marker, add, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('negatives added')
