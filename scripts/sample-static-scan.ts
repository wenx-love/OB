import { readFileSync, writeFileSync } from 'node:fs';
import { discoverDecoders } from '../src/core/decoder-discovery.js';
import { computeCapturePlan } from '../src/core/capture-plan.js';

const ROOT = 'D:/Projects/ob-recover/test/fixtures/real-samples';
const OUT = 'D:/Projects/ob-recover/test/acceptance/phase3-sample-static-scan-';
const all = ['sample-01-obfuscator', 'sample-05-cx', 'sample-02-maoyan', 'sample-03-pdd', 'sample-04-gk'];
const args = process.argv.slice(2);
const names = args.length ? args : all;

for (const n of names) {
  const src = readFileSync(ROOT + '/' + n + '/input.js', 'utf-8');
  console.log('START ' + n + ' bytes=' + src.length);
  const t0 = Date.now();
  const d = discoverDecoders(src, n, n + '/input.js');
  const ms = Date.now() - t0;
  const cands = d.candidates.map((c) => ({ name: c.name, kind: c.kind, conf: c.confidence, params: c.paramCount, calls: c.callCount, arr: c.stringArrayName, offset: c.hasIndexOffset, b64: c.hasBase64, rc4: c.hasRC4 }));
  const high = d.candidates.filter((c) => c.confidence === 'high' && c.name);
  const plans = high.slice(0, 15).map((c) => {
    const p = computeCapturePlan(src, c.location.start);
    return { name: c.name, supported: p.supported, reason: p.reason, returns: p.returns.length };
  });
  const scan: Record<string, number> = {};
  for (const w of ['eval(', 'Function(', 'XMLHttpRequest', 'fetch(', 'WebSocket', 'document.cookie', 'localStorage', 'importScripts', 'location.href', 'debugger']) scan[w] = src.split(w).length - 1;
  const o = { sample: n, bytes: src.length, analyzed: d.analyzed, error: d.error, discoveryMs: ms, functions: d.functions.length, candidates: cands.length, high: high.length, cands: cands.slice(0, 15), plans, scan };
  writeFileSync(OUT + n + '.json', JSON.stringify(o, null, 2));
  console.log(JSON.stringify(o));
}
process.exit(0);
