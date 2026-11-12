import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
start = t.index('function validateEvents(list) {')
end = t.index('const CHAIN_REQ = {')
new = r'''const OP_RULES = {
  create: ['file-create', 'dir-create', 'dir-create-if-absent', 'subtree-create', 'icon-create-if-absent', 'env-bound-subtree-create', 'audit-part-create-append'],
  overwrite: ['file-write', 'subtree-write'],
  append: ['file-append', 'subtree-write', 'audit-part-create-append'],
  mkdir: ['dir-create', 'dir-create-if-absent', 'subtree-create'],
  rename: ['subtree-write'],
  copy: ['subtree-write', 'env-bound-subtree-create'],
  delete: ['subtree-write'],
  acl: ['acl-set-recursive'],
};

function validateEvents(list) {
  const errs = [];
  const add = (code, detail) => errs.push({ code, detail: detail || '' });
  const seen = new Set();
  const intents = new Map();
  const results = new Set();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object' || Array.isArray(e)) { add('schema.object'); continue; }
    if (!Number.isSafeInteger(e.seq) || e.seq !== i + 1) add('schema.seq');
    if (i === 0) { if (e.prev_event_sha256 !== null) add('schema.prev'); }
    else if (e.prev_event_sha256 !== shaText(canon(list[i - 1]))) add('schema.prev');
    if (e.schema !== 'p47-audit-event-v9') add('schema.schema');
    if (!/^[0-9a-f]{32}$/.test(e.event_id || '')) add('schema.event_id');
    if (seen.has(e.event_id)) add('schema.unique');
    seen.add(e.event_id);
    if (!KINDS.includes(e.kind)) { add('schema.kind'); continue; }
    const allowed = new Set([...COMMON, ...EVENT_REQ[e.kind], ...EVENT_FORBID[e.kind]]);
    for (const k of Object.keys(e)) if (!allowed.has(k)) add('schema.closed');
    for (const f of [...COMMON, ...EVENT_REQ[e.kind]]) if (!(f in e)) add('schema.required');
    for (const f of EVENT_FORBID[e.kind]) if (f in e) add('schema.forbidden');
    if (!ROLES.includes(e.role)) { add('schema.role'); continue; }
    const ex = byId[e.exec_id];
    if (!ex) { add('schema.exec_registered'); continue; }
    if (!(ex.audit_roles || []).includes(e.role)) { add('perm.role'); continue; }
    if (e.actor !== 'WENX\\Administrator') add('schema.actor');
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.wall_time_utc || '')) add('schema.time');
    if (!/^events-(dispatcher|tool|observer|product)-\d+-[0-9a-f]{8}$/.test(e.part_id || '')) add('schema.type');
    if (!e.part_id || !e.part_id.includes('-' + e.role + '-')) add('schema.type');

    if (e.kind === 'write_intent') {
      if (e.intent_id !== e.event_id) add('schema.intent_id');
      if (!OPS.includes(e.op)) add('schema.op');
      if (!canonicalAbs(e.path)) add('schema.path');
      if (!['file', 'dir', 'tree'].includes(e.path_kind)) add('schema.path_kind');
      if (e.decision !== 'allow') add('schema.decision');
      const layer = e.role === 'product' ? 'product_writes' : 'business_writes';
      let rule = null;
      if (!(e.rule_ref || '').includes('.' + layer + '[')) add('perm.rule_layer');
      else rule = ruleOf(e.exec_id, e.rule_ref);
      if (!rule) add('perm.rule_ref');
      else {
        if (!covers(rule, e.path)) add('perm.write_scope');
        if (!OP_RULES[e.op] || !OP_RULES[e.op].includes(rule.op)) add('perm.op');
      }
      if (e.op === 'rename' || e.op === 'copy') {
        if (!canonicalAbs(e.src_path)) add('schema.src_path');
        else {
          const reads = e.role === 'product' ? (ex.product ? ex.product.reads : []) : ex.reads.business;
          if (!(reads || []).some((r) => covers(r, e.src_path))) add('perm.src_read');
        }
      } else if (e.src_path !== null) add('schema.src_path');
      if (e.op !== 'acl') {
        if ((ex.protect_write || []).some((p) => intersects({ path: e.path, kind: 'file' }, { path: p, kind: 'subtree' }))) add('perm.protect');
      }
      intents.set(e.event_id, { seq: e.seq, part: e.part_id, exec: e.exec_id, op: e.op });
    }
    if (e.kind === 'write_result') {
      const intent = list.find((x) => x.kind === 'write_intent' && x.event_id === e.intent_ref);
      if (!intent) add('schema.intent_order');
      else {
        if (intent.seq >= e.seq || intent.part_id !== e.part_id || intent.exec_id !== e.exec_id) add('schema.intent_order');
        if (results.has(e.intent_ref)) add('schema.intent_unique');
        results.add(e.intent_ref);
      }
      if (!['ok', 'denied', 'error', 'skipped'].includes(e.outcome)) add('schema.outcome');
      if (e.outcome === 'ok' ? e.error_code !== null : typeof e.error_code !== 'string') add('schema.error_code');
      if (e.outcome === 'ok') {
        if (!e.after || typeof e.after !== 'object' || typeof e.after.bytes !== 'number' || !H64.test(e.after.sha256 || '')) add('schema.after');
        if (e.durable !== true) add('schema.durable');
        if (intent && intent.op !== 'append' && e.after && typeof e.after.bytes === 'number' && e.bytes_written !== e.after.bytes) add('schema.bytes');
        if (intent && intent.op === 'append' && (!Number.isSafeInteger(e.bytes_written) || e.bytes_written < 0 || (e.after && e.bytes_written > e.after.bytes))) add('schema.bytes');
      } else if (e.after !== null || e.bytes_written !== null) add('schema.after');
    }
    if (e.kind === 'read_batch') {
      if (!['content', 'metadata'].includes(e.mode)) add('schema.mode');
      if (!Array.isArray(e.entries) || e.entries.length === 0) add('schema.entries');
      else {
        const tallies = { ok: 0, denied: 0, absent: 0, unlisted: 0 };
        for (const x of e.entries) {
          if (!x || typeof x !== 'object') { add('schema.entries'); continue; }
          if (!canonicalAbs(x.path)) add('schema.path');
          if (!['ok', 'denied', 'absent', 'unlisted'].includes(x.result)) add('schema.entries');
          else tallies[x.result]++;
          if (x.result === 'ok' ? x.error_code !== null : typeof x.error_code !== 'string') add('schema.error_code');
          const layer = e.role === 'product' ? 'product_reads' : 'business_reads';
          let rule = null;
          if (!(x.rule_ref || '').includes('.' + layer + '[')) add('perm.rule_layer');
          else rule = ruleOf(e.exec_id, x.rule_ref);
          if (!rule) add('perm.rule_ref');
          else {
            const deny = (e.role === 'product' ? (byId[e.exec_id].product || { deny_read: [] }).deny_read : byId[e.exec_id].deny_read) || [];
            if (x.result === 'ok' && deny.some((d) => intersects({ path: x.path, kind: 'file' }, { path: d, kind: 'subtree' }))) add('perm.deny_read');
            else if (x.result === 'ok' && !covers(rule, x.path)) add('perm.read_scope');
          }
          if (x.result === 'ok' && (!Number.isSafeInteger(x.bytes) || !H64.test(x.sha256 || ''))) add('schema.entries');
        }
        if (!e.counts || typeof e.counts !== 'object') add('schema.counts');
        else for (const k of Object.keys(tallies)) if (e.counts[k] !== tallies[k] || Object.keys(e.counts).length !== 4) add('schema.counts');
      }
    }
    if (e.kind === 'exec_begin') {
      if (e.argv_sha256 !== ex.argv_sha256) add('schema.type');
      if (e.entry_path !== ex.entry_path) add('schema.type');
      if (e.cwd !== ex.cwd) add('schema.type');
      if (!H64.test(e.entry_sha256 || '')) add('schema.type');
      if (!Number.isSafeInteger(e.pid) || !Number.isSafeInteger(e.ppid)) add('schema.type');
    }
    if (e.kind === 'exec_end') {
      if (!Number.isSafeInteger(e.exit_code)) add('schema.type');
      if (!Array.isArray(e.child_exit_codes) || e.child_exit_codes.some((c) => !c || !Number.isSafeInteger(c.pid) || !Number.isSafeInteger(c.code))) add('schema.type');
    }
    if (e.kind === 'preload') {
      if (!['runner', 'tool', 'main', 'worker', 'product'].includes(e.process_role)) add('schema.type');
      if (!H64.test(e.guard_sha256 || '') || !H64.test(e.argv_sha256 || '') || !H64.test(e.policy_sha256 || '')) add('schema.type');
      const expected = e.role === 'product' ? (ex.product && ex.product.policy_sha256) : (ex.guard && ex.guard.policy_sha256);
      if (!expected || e.policy_sha256 !== expected) add('perm.preload_policy');
      if (!Array.isArray(e.inherited_env_keys) || e.inherited_env_keys.some((k, i, a) => typeof k !== 'string' || (i > 0 && a[i - 1] > k))) add('schema.type');
    }
    if (e.kind === 'observe_start') {
      if (!H64.test(e.nonce || '')) add('schema.type');
      if (e.deadline_seconds !== 900) add('schema.type');
    }
    if (e.kind === 'observe_relay') {
      if (!H64.test(e.line_sha256 || '') || !Number.isSafeInteger(e.line_bytes) || e.line_bytes > 4096) add('schema.type');
      if (e.verdict === 'ok' ? e.reason !== null : typeof e.reason !== 'string') add('schema.type');
      if (typeof e.nonce_match !== 'boolean') add('schema.type');
    }
    if (e.kind === 'observe_end' && (typeof e.relay_seen !== 'boolean' || !['pass', 'fail'].includes(e.verdict))) add('schema.type');
  }
  for (const id of intents.keys()) if (!results.has(id)) add('schema.intent_unpaired');
  return errs;
}

'''
t = t[:start] + new + t[end:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('validateEvents replaced')
