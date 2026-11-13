'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./p0v10-lib.cjs');
const C = require('./p0v10-contract.cjs');

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function assert(cond, name, failures) {
  if (!cond) failures.push(name);
}

function buildChain(specs, mutate) {
  const records = C.linkChain(specs || []);
  for (const m of mutate || []) {
    const r = records[m.index];
    if (!r) continue;
    if (m.set) Object.assign(r, m.set);
    if (m.delete) for (const k of m.delete) delete r[k];
  }
  return records;
}

function makeSeal(chain, ctx) {
  const d = C.sealDecision(chain, ctx || {});
  return {
    schema: C.SEAL_SCHEMA,
    mode: d.mode,
    exit_status: d.exit,
    run_state: d.run_state,
    open_segments: chain.open_segments || [],
  };
}

function makeSeal(chain, ctx) {
  const d = C.sealDecision(chain, ctx || {});
  return {
    schema: C.SEAL_SCHEMA,
    mode: d.mode,
    exit_status: d.exit,
    run_state: d.run_state,
    chain_state: chain.state,
    open_segments: chain.open_segments || [],
  };
}

function runChain(v, ctx, failures) {
  const records = buildChain(v.chainSpecs, v.mutate);
  const chain = C.classifyChain(records, { origin: v.chainOrigin, execRegistry: ctx.execs });
  const exp = v.expect || {};
  if (exp.state) assert(chain.state === exp.state, 'state=' + chain.state + ' expected ' + exp.state, failures);
  if (exp.errors !== undefined) assert(chain.errors.length === exp.errors, 'errors=' + chain.errors.length + ' expected ' + exp.errors, failures);
  if (exp.errorsMin !== undefined) assert(chain.errors.length >= exp.errorsMin, 'errors<' + exp.errorsMin, failures);
  if (exp.openSegments !== undefined) assert(chain.open_segments.length === exp.openSegments, 'openSegments=' + chain.open_segments.length, failures);
  if (exp.tail !== undefined) assert(chain.tail === exp.tail, 'tail=' + chain.tail, failures);
  if (v.sealCtx) {
    const d = C.sealDecision(chain, v.sealCtx);
    if (exp.sealMode) assert(d.mode === exp.sealMode, 'sealMode=' + d.mode + ' expected ' + exp.sealMode, failures);
    if (exp.sealExit) assert(d.exit === exp.sealExit, 'sealExit=' + d.exit + ' expected ' + exp.sealExit, failures);
    if (d.mode !== C.SEAL.NONE) {
      const seal = makeSeal(chain, v.sealCtx);
      const validated = C.validateTerminalSeal(seal, chain, v.sealCtx);
      assert(validated.ok, 'terminal seal self-check: ' + validated.errors.join(','), failures);
    }
  }
  return chain;
}

function runStop(v, failures) {
  const d = C.stopDecision(v.input);
  for (const [k, val] of Object.entries(v.expect || {})) {
    assert(d[k] === val, k + '=' + String(d[k]) + ' expected ' + String(val), failures);
  }
}

function runSummary(v, ctx, failures) {
  const summary = v.summary ? L.deepClone(v.summary) : null;
  const sidecar = v.sidecar ? L.deepClone(v.sidecar) : null;
  const close = v.close ? L.deepClone(v.close) : null;
  if (v.autoHashes && summary && sidecar) summary.failure_code_sha256 = L.sha256Canon(sidecar);
  if (v.autoHashes && summary && close) {
    close.summary_sha256 = L.sha256Canon(summary);
    close.summary_bytes = Buffer.byteLength(L.canon(summary), 'utf8');
  }
  if (v.tamper === 'summary_sha' && close) close.summary_sha256 = '0'.repeat(64);
  if (v.tamper === 'sidecar_sha' && summary) summary.failure_code_sha256 = '0'.repeat(64);
  const r = C.validateSummaryLifecycle({
    eventOrder: v.eventOrder,
    mutatedAfterClose: v.mutatedAfterClose,
    summary,
    sidecar,
    close,
    map: ctx.map,
    execRegistry: ctx.execs,
  });
  const exp = v.expect || {};
  if (exp.ok !== undefined) assert(r.ok === exp.ok, 'ok=' + r.ok + ' expected ' + exp.ok, failures);
  if (exp.errorsInclude) assert(r.errors.includes(exp.errorsInclude), 'missing error ' + exp.errorsInclude + ' got ' + r.errors.join(','), failures);
}

function buildGateBundle(config, variant) {
  const invocations = [];
  for (const g of config.required) {
    invocations.push({
      gate_id: g.gate_id,
      mode: g.mode,
      subject_id: g.subject_id,
      txid: config.txid,
      rid: config.rid,
      input_digest: 'a'.repeat(64),
      evidence_digest: 'b'.repeat(64),
      result: 'PASS',
      evidence_present: true,
    });
  }
  const bundle = {
    schema: C.GATE_BUNDLE_SCHEMA,
    txid: config.txid,
    rid: config.rid,
    old_index_digest: config.old_index_digest,
    new_index_digest: config.new_index_digest,
    policy_digest: config.policy_digest,
    canonicalization: 'p47-canon-v1',
    tool_versions: config.tool_versions,
    retry_allowed: false,
    invocations,
    required_gates: config.required.map((g) => ({ gate_id: g.gate_id, mode: g.mode, subject_id: g.subject_id })),
    bundle_digest: null,
  };
  if (variant === 'missing') {
    const idx = bundle.invocations.findIndex((g) => g.gate_id === 'checker' && g.mode === 'pending');
    if (idx >= 0) bundle.invocations.splice(idx, 1);
  } else if (variant === 'duplicate') {
    bundle.invocations.push(L.deepClone(bundle.invocations[0]));
  } else if (variant === 'extra') {
    bundle.invocations.push({ gate_id: 'checker', mode: 'extra', subject_id: 'op:checker', input_digest: 'a'.repeat(64), evidence_digest: 'b'.repeat(64), result: 'PASS', evidence_present: true });
  } else if (variant === 'wrong_txid') {
    bundle.txid = 'wrong-txid';
  } else if (variant === 'wrong_evidence') {
    bundle.invocations[0].evidence_digest = 'short';
  } else if (variant === 'wrong_subject') {
    bundle.invocations[0].subject_id = 'op:verifier';
  } else if (variant === 'wrong_old_index') {
    bundle.old_index_digest = 'f'.repeat(64);
  } else if (variant === 'retry_allowed' || variant === 'retry_denied') {
    bundle.retry_allowed = variant === 'retry_allowed';
    bundle.invocations[0].attempts = [
      { result: 'FAILED', final: false, evidence_digest: 'c'.repeat(64) },
      { result: 'PASS', final: true, evidence_digest: 'b'.repeat(64) },
    ];
  }
  const copy = L.deepClone(bundle);
  delete copy.bundle_digest;
  bundle.bundle_digest = L.sha256Canon(copy);
  if (variant === 'bad_digest') bundle.bundle_digest = '0'.repeat(64);
  return bundle;
}

function runGate(v, config, failures) {
  let cfg = config;
  if (v.variant === 'empty_required') {
    cfg = Object.assign({}, config, { required: [] });
  }
  const bundle = buildGateBundle(cfg, v.variant);
  const ctx = {
    txid: cfg.txid,
    rid: cfg.rid,
    old_index_digest: cfg.old_index_digest,
    new_index_digest: cfg.new_index_digest,
    policy_digest: cfg.policy_digest,
    tool_versions: cfg.tool_versions,
  };
  const r = v.variant === 'no_ctx'
    ? C.validateGateBundle(bundle, cfg)
    : C.validateGateBundle(bundle, cfg, ctx);
  const exp = v.expect || {};
  if (exp.ok !== undefined) assert(r.ok === exp.ok, 'ok=' + r.ok + ' expected ' + exp.ok, failures);
  if (exp.errorsInclude) assert(r.errors.some((e) => e.includes(exp.errorsInclude)), 'missing error ' + exp.errorsInclude + ' got ' + r.errors.join(','), failures);
  if (exp.retry_used !== undefined) assert(r.retry_used === exp.retry_used, 'retry_used=' + r.retry_used + ' expected ' + exp.retry_used, failures);
}

function runSidecar(v, map, failures) {
  const sidecar = v.sidecar ? L.deepClone(v.sidecar) : null;
  const summary = v.summary ? L.deepClone(v.summary) : null;
  const close = v.close ? L.deepClone(v.close) : null;
  if (v.autoHashes && summary && sidecar) summary.failure_code_sha256 = L.sha256Canon(sidecar);
  if (v.autoHashes && summary && close) {
    close.summary_sha256 = L.sha256Canon(summary);
    close.summary_bytes = Buffer.byteLength(L.canon(summary), 'utf8');
  }
  if (v.tamper === 'summary_sha' && close) close.summary_sha256 = '0'.repeat(64);
  if (v.tamper === 'sidecar_sha' && summary) summary.failure_code_sha256 = '0'.repeat(64);
  const r = C.projectFailureCode({ sidecar, summary, close, map });
  const exp = v.expect || {};
  if (exp.ok !== undefined) assert(r.ok === exp.ok, 'ok=' + r.ok + ' expected ' + exp.ok + ' errors=' + (r.errors || []).join(','), failures);
  if (exp.code) assert(r.failure_code === exp.code, 'code=' + r.failure_code, failures);
  if (exp.errorsInclude) assert((r.errors || []).some((e) => e.includes(exp.errorsInclude)), 'missing error ' + exp.errorsInclude + ' got ' + (r.errors || []).join(','), failures);
}

function runFailureProjection(v, map, failures) {
  const r = C.projectFailureCode({ sidecar: v.sidecar, summary: v.summary, close: v.close, map });
  const exp = v.expect || {};
  if (exp.ok !== undefined) assert(r.ok === exp.ok, 'ok=' + r.ok + ' expected ' + exp.ok, failures);
  if (exp.errorsInclude) assert((r.errors || []).some((e) => e.includes(exp.errorsInclude)), 'missing error ' + exp.errorsInclude, failures);
}

function runSeal(v, failures) {
  const r = C.validateTerminalSeal(v.seal, v.chain, v.sealCtx || {});
  const exp = v.expect || {};
  if (exp.ok !== undefined) assert(r.ok === exp.ok, 'ok=' + r.ok + ' expected ' + exp.ok, failures);
  if (exp.errorsInclude) assert(r.errors.includes(exp.errorsInclude), 'missing error ' + exp.errorsInclude + ' got ' + r.errors.join(','), failures);
}

function runCanon(v, failures) {
  try {
    const out = L.canon(v.value);
    if (v.expectError) failures.push('expected canon error');
    else if (v.expectCanon !== undefined && out !== v.expectCanon) failures.push('canon=' + out + ' expected ' + v.expectCanon);
  } catch (e) {
    if (!v.expectError) failures.push('canon exception: ' + e.message);
  }
}

function runPath(v, failures) {
  try {
    const out = L.normalizeRel(v.value);
    if (out !== v.expectPath) failures.push('path=' + out + ' expected ' + v.expectPath);
  } catch (e) {
    failures.push('path exception: ' + e.message);
  }
}

function runMembers(v, failures) {
  const r = C.classifyMemberDelta(v.old || [], v.new || []);
  const exp = v.expect || {};
  if (exp.ok !== undefined) assert(r.ok === exp.ok, 'ok=' + r.ok + ' expected ' + exp.ok, failures);
  if (exp.conflict !== undefined) assert(!!r.conflict === exp.conflict, 'conflict mismatch', failures);
  if (exp.add !== undefined) assert(r.delta.add.length === exp.add, 'add=' + r.delta.add.length, failures);
  if (exp.delete !== undefined) assert(r.delta.delete.length === exp.delete, 'delete=' + r.delta.delete.length, failures);
  if (exp.keep !== undefined) assert(r.delta.keep.length === exp.keep, 'keep=' + r.delta.keep.length, failures);
}

function runVector(v, ctx, failures) {
  switch (v.kind) {
    case 'chain':
      runChain(v, ctx, failures);
      break;
    case 'seal':
      runSeal(v, failures);
      break;
    case 'canon':
      runCanon(v, failures);
      break;
    case 'path':
      runPath(v, failures);
      break;
    case 'stop':
      runStop(v, failures);
      break;
    case 'summary':
      runSummary(v, ctx, failures);
      break;
    case 'gate':
      runGate(v, ctx.gateConfig, failures);
      break;
    case 'sidecar':
      runSidecar(v, ctx.map, failures);
      break;
    case 'failure_projection':
      runFailureProjection(v, ctx.map, failures);
      break;
    case 'reclaim': {
      const r = C.reclaimDecision(v.input);
      assert(r.action === v.expect.action, 'action=' + r.action, failures);
      break;
    }
    case 'protect': {
      const r = C.evaluateProtect(ctx.protectPolicy, v.intent);
      assert(r.decision === v.expect.decision, 'decision=' + r.decision, failures);
      if (v.expect.rule_id) assert(r.rule_id === v.expect.rule_id, 'rule_id=' + r.rule_id, failures);
      break;
    }
    case 'members':
      runMembers(v, failures);
      break;
    case 'fragment': {
      const r = C.validateFragmentSeal(v.seal);
      assert(r.ok === v.expect.ok, 'ok=' + r.ok, failures);
      if (v.expect.errorsInclude) assert(r.errors.includes(v.expect.errorsInclude), 'missing error ' + v.expect.errorsInclude, failures);
      break;
    }
    default:
      throw new Error('unknown vector kind: ' + v.kind);
  }
}

function main() {
  const args = process.argv.slice(2);
  const rootArg = args.indexOf('--root');
  const vectorsArg = args.indexOf('--vectors');
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : __dirname;
  const vectorsPath = vectorsArg >= 0 ? args[vectorsArg + 1] : path.join(root, 'vectors', 'vectors.json');
  const json = args.includes('--json');

  const map = readJson(root, 'inputs/failure-code-map.json');
  const triggers = readJson(root, 'inputs/trigger-registry.json');
  const execs = readJson(root, 'inputs/exec-registry.json');
  const protectPolicy = readJson(root, 'inputs/protect-policy.json');
  const gateConfig = readJson(root, 'inputs/gate-requirements.json');
  const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8')).vectors;

  const failures = [];
  const mapResult = C.validateFailureMap(map, triggers, execs.execs);
  if (!mapResult.ok) failures.push('input failure-code-map: ' + mapResult.errors.join(','));
  if (!Array.isArray(vectors) || vectors.length === 0) failures.push('vectors missing');

  let passed = 0;
  for (const v of vectors || []) {
    const vf = [];
    try {
      runVector(v, { map, protectPolicy, gateConfig, execs: execs.execs }, vf);
    } catch (e) {
      vf.push('exception:' + e.message);
    }
    if (vf.length === 0) passed += 1;
    else failures.push(v.id + ': ' + vf.join(','));
  }

  const result = {
    schema: 'p47-static-check-result-v10',
    status: failures.length === 0 ? 'PASS' : 'FAILED',
    status_namespace: 'experiment',
    total: (vectors || []).length,
    passed,
    failed: (vectors || []).length - passed,
    not_run: 0,
    unverified: 0,
    input_map: mapResult,
    failures,
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('V10 static check: ' + result.status);
    console.log('total=' + result.total + ' passed=' + result.passed + ' failed=' + result.failed);
    if (failures.length) console.log(failures.join('\n'));
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main();
