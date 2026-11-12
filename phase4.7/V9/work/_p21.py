import io

p = r'C:\Users\Administrator\TEMP\opencode\p47-worker-remediation-plan\V9\work\p0v9-check.cjs'
t = io.open(p, encoding='utf-8').read()
marker = 'const STOP_RANK = { none: 0'
block = r'''// ---------------------------------------------------------------- vectors
for (const t of ['p47-audit-event-v9', 'p47-chain-record-v9', 'segment_skip', 'LF', 'summary', 'seal']) {
  ok('audit spec covers ' + t, docs[R.audit].includes(t));
}
ok('failure model covers stop levels', docs[R.failure].includes('halt-business') && docs[R.failure].includes('halt-all'));
ok('publish protocol covers recovery', docs[R.publish].includes('recover') && docs[R.publish].includes('undo') && docs[R.publish].includes('rollback-failed'));

for (const v of [...vec.valid, ...vec.parts, ...vec.events, ...vec.summaries, ...vec.seals,
  ...Object.values(vec.chains).flat()]) {
  eq('vector hash ' + v.name, shaText(v.canonical), v.sha256);
  eq('vector bytes ' + v.name, utf8(v.canonical), v.bytes);
}
const parse = (v) => JSON.parse(v.canonical);
for (const [group, list] of Object.entries(vec.chains)) {
  const recs = list.map(parse);
  eq('chain schema ' + group, validateChain(recs).concat(flowReplay(recs)).map((x) => x.code).join(','), '');
}
for (const v of vec.parts) {
  const list = parse(v);
  eq('part schema ' + v.name, validateEvents(list).map((x) => x.code).join(','), '');
}
for (const v of vec.summaries) eq('summary schema ' + v.name, validateSummary(parse(v)).length, 0);
for (const v of vec.seals) {
  const s = parse(v);
  const group = Object.values(vec.chains).map((arr) => arr.map(parse)).find((recs) => {
    const last = recs[recs.length - 1];
    return s.chain && last && s.chain.last_seq === last.chain_seq && s.chain.last_record_sha256 === shaText(canon(last));
  });
  eq('seal schema ' + v.name, validateSeal(s, group || null).map((x) => x.code).join(','), '');
}
eq('all event parts validated separately', vec.parts.length, 5);
for (const [name, j] of Object.entries(vec.jsonl)) {
  const tag = name === 'c19' ? 'C19' : name === 'c10p' ? 'C10P' : 'C03';
  const list = parse(vec.parts.find((p) => p.name.includes(tag)));
  const lines = list.map((e) => canon(e) + '\n');
  const bytes = lines.reduce((n, x) => n + utf8(x), 0);
  eq('jsonl bytes ' + name, bytes, j.bytes);
  eq('jsonl sha ' + name, sha(Buffer.from(lines.join(''), 'utf8')), j.sha);
}

for (const n of vec.negative) {
  let errs;
  if (n.canonical && JSON.parse(n.canonical).hex) {
    const v = JSON.parse(n.canonical);
    const parts = Buffer.from(v.hex, 'hex').toString('utf8').split('\n');
    errs = (parts.length === 1 || parts[parts.length - 1] !== '') ? [{ code: 'bytes.truncated' }] : [];
  } else {
    const v = JSON.parse(n.canonical);
    if (Array.isArray(v) && v.length && v[0] && v[0].kind) errs = validateEvents(v);
    else if (Array.isArray(v) && v.length && v[0] && v[0].record) errs = validateChain(v).concat(flowReplay(v));
    else if (v && v.kind) errs = validateEvents([v]);
    else if (v && v.record) errs = validateChain([v]).concat(flowReplay([v]));
    else if (Array.isArray(v) && v.length === 1 && String(v[0].schema || '').includes('summary')) errs = validateSummary(v[0]);
    else if (Array.isArray(v) && v.length === 1 && String(v[0].schema || '').includes('seal')) errs = validateSeal(v[0], null);
    else if (v && String(v.schema || '').includes('summary')) errs = validateSummary(v);
    else if (v && String(v.schema || '').includes('seal')) errs = validateSeal(v, null);
    else errs = [{ code: 'schema.object' }];
  }
  eq('negative exactly one error ' + n.name, errs.length, 1);
  eq('negative expected code ' + n.name, errs[0] && errs[0].code, n.expect);
}

const invalid = { float: 1.5, unsafe_integer: 9007199254740992, uppercase_key: { Key: 1 }, non_ascii_key: { 'é': 1 }, dash_key: { 'a-b': 1 }, lone_high_surrogate: '\ud800', lone_low_surrogate: '\udc00', undefined_value: undefined, nan: NaN, infinity: Infinity, function_value: function () {}, bigint_value: 10n };
for (const k of vec.invalid_kinds) {
  let threw = false;
  try { canon(invalid[k]); } catch (e) { threw = true; }
  ok('invalid canonical rejected: ' + k, threw);
}

'''
assert marker in t
t = t.replace(marker, block + marker, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('vector checks reinserted')
