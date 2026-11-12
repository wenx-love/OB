import { readFileSync, writeFileSync } from 'node:fs';

// Independent reference builder, part 2: read the archived script's literal decoder call sites, then evaluate the global decoder
// in the already loaded page and record its真实返回值. Read-only: it calls the page's own pure decoder with literal arguments.
// No new network request is made (the page is already loaded). It uses CDP against the dedicated Chrome started by this task.
const ROOT = 'D:/Projects/ob-recover/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou/js_reverse_cache';
const sites = JSON.parse(readFileSync(ROOT + '/recon/js-reverse/reference-sites.json', 'utf8'));
const TARGET = 'hangzhou.qccqcc.com/list.html';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find((p) => p.type === 'page' && String(p.url).includes(TARGET));
if (!page) throw new Error('target page not found on the dedicated Chrome; pages=' + list.map((p) => p.type + ':' + p.url).join(' | '));

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws error')); });

const expression = `(function(){
  var pairs = ${JSON.stringify(sites.pairs)};
  var dec = window._0x374d;
  if (typeof dec !== 'function') return { ok: false, error: 'window._0x374d is not a function' };
  var out = {};
  var errors = [];
  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i];
    try { out[p.a + '|' + p.b] = dec(p.a, p.b); }
    catch (e) { errors.push({ a: p.a, b: p.b, error: String(e && e.message ? e.message : e) }); }
  }
  return { ok: true, decoded: out, errors: errors, count: pairs.length };
})()`;

const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false });
if (r.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
const v = r.result.value;
if (!v.ok) throw new Error(String(v.error));

const values = v.decoded;
const missing = sites.pairs.filter((p) => !(p.a + '|' + p.b in values)).length;
const resolved = sites.sites.map((s) => ({ line: s.line, col: s.col, callee: s.callee, a: s.a, b: s.b, value: values[s.a + '|' + s.b] ?? null, text: s.text }));
const kinds = {};
for (const x of Object.values(values)) kinds[typeof x] = (kinds[typeof x] || 0) + 1;

const out = {
  schema: 'web-protocol-recovery/l1-reference-values/1',
  capturedBy: 'skill',
  method: 'the archived script only determines the call sites and their literal arguments; the values are read back from the page own global decoder window._0x374d evaluated in the dedicated Chrome, which is independent of OB-Recover',
  target: page.url,
  rootDecoder: sites.rootDecoder,
  aliasCount: sites.aliasCount,
  siteCount: sites.sites.length,
  uniquePairs: sites.pairs.length,
  decoded: Object.keys(values).length,
  missing,
  evaluateErrors: v.errors.length,
  valueKinds: kinds,
  truncated: false,
  sites: resolved,
};
writeFileSync(ROOT + '/reference-decoder-values.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, sites: out.siteCount, decoded: out.decoded, missing, errors: out.evaluateErrors, kinds }, null, 2));
ws.close();
