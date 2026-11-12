import io
p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-audit.cjs'
t = io.open(p, encoding='utf-8').read()
t = t.replace("pushNeg('write_not_covered_by_rule', single(writeScope), 'perm.write_scope');",
              "writeScope.path = P.OUT + '\\\\C19\\\\C19-E01\\\\other.json';\n  pushNeg('write_not_covered_by_rule', relink([writeScope, clone(res)]), 'perm.write_scope');")
t = t.replace("pushNeg('event_actor_not_admin', single(Object.assign(clone(base), { actor: 'WENX\\\\CodexSandboxOffline' })), 'schema.actor');",
              "pushNeg('event_actor_not_admin', relink([Object.assign(clone(base), { actor: 'WENX\\\\CodexSandboxOffline' }), clone(res)]), 'schema.actor');")
t = t.replace("pushNeg('event_extra_field', single(Object.assign(clone(base), { extra: 1 })), 'schema.closed');",
              "pushNeg('event_extra_field', relink([Object.assign(clone(base), { extra: 1 }), clone(res)]), 'schema.closed');")
t = t.replace("pushNeg('intent_has_outcome', single(Object.assign(clone(base), { outcome: 'ok' })), 'schema.forbidden');",
              "pushNeg('intent_has_outcome', relink([Object.assign(clone(base), { outcome: 'ok' }), clone(res)]), 'schema.forbidden');")
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('negatives adjusted')
