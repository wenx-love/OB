'use strict';
// OB-Recover Phase 4.7 / Phase 0 V5 contract generator - shared library.
// Auxiliary tooling only: it writes contract documents, it never executes C00-C20.
const crypto = require('crypto');

const w = (s) => s.replace(/\//g, '\\');

const P = {};
P.ORIGINAL = w('D:/Projects/ob-recover');
P.RUN_PARENT = w('D:/P47RUN');
P.RUN_ID = 'P47-20261111-01';
P.RUN = P.RUN_PARENT + '\\' + P.RUN_ID;
P.SRC = w('D:/P47TOOLS/p47-phase0-v5');
P.MANIFEST = P.SRC + '\\RELEASE-MANIFEST.json';
P.PAYLOAD = P.SRC + '\\payload';
P.STAGED = P.RUN + '\\tools';
P.CONTROLS = P.RUN + '\\controls';
P.ACLPROBE = P.RUN + '\\acl-probe';
P.BASELINE = P.RUN + '\\baseline';
P.M0 = P.BASELINE + '\\m0.json';
P.SNAP = P.BASELINE + '\\snapshot-01';
P.EXP = P.RUN + '\\exp';
P.CP = P.EXP + '\\pristine-01';
P.CN = P.EXP + '\\no-plugin-01';
P.CS = P.EXP + '\\sandbox-01';
P.OUT = P.RUN + '\\out';
P.AUDIT = P.OUT + '\\audit';
P.CHAIN = P.AUDIT + '\\chain-head.jsonl';
P.TSEAL = P.AUDIT + '\\terminal-seal.json';
P.EVIDENCE = P.RUN + '\\evidence';
P.TRUST = P.RUN + '\\trust';
P.REVIEW = P.RUN + '\\review';
P.TMP = P.RUN + '\\tmp';
P.HOME = w('C:/Users/Administrator');
P.PS = w('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
P.NODE = w('D:/Nvm/nodejs/node.exe');
P.READ_SENTINEL = P.ACLPROBE + '\\read-sentinel';
P.WRITE_SENTINEL = P.ACLPROBE + '\\write-access-sentinel';
P.NONCE = P.ACLPROBE + '\\c03-nonce.txt';

const ID = {
  admin_account: 'WENX\\Administrator',
  admin_sid: 'S-1-5-21-2104787571-1265941319-592731904-500',
  system_sid: 'S-1-5-18',
  codex_group: 'WENX\\CodexSandboxUsers',
  codex_accounts: ['WENX\\CodexSandboxOffline', 'WENX\\CodexSandboxOnLine'],
};

const RELEASE = { schema: 'p47-phase0-tool-release-v2', release_id: 'p47-phase0-v5' };
const CONTROL_SHA = '18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003';
const SENTINEL = { read: 'P47-READ-SENTINEL', write: 'P47-WRITE-ACCESS-SENTINEL' };

const TOOLS = {
  init: { rel: 'payload/bootstrap/p0-init.ps1', role: 'bootstrap-init', staged: false },
  acl: { rel: 'payload/bootstrap/p0-acl.ps1', role: 'bootstrap-acl', staged: false },
  observe: { rel: 'payload/bootstrap/p0-observe.ps1', role: 'bootstrap-observer', staged: false },
  stage: { rel: 'payload/bootstrap/p0-stage.ps1', role: 'bootstrap-stage', staged: false },
  dispatch: { rel: 'payload/tools/p0-dispatch.ps1', role: 'dispatcher', staged: true },
  verify: { rel: 'payload/tools/p0-verify-release.ps1', role: 'verifier', staged: true },
  audit: { rel: 'payload/tools/p0-audit.cjs', role: 'audit', staged: true },
  guard: { rel: 'payload/tools/fs-guard.cjs', role: 'guard', staged: true },
  simulate: { rel: 'payload/tools/p0-simulate.cjs', role: 'tool', staged: true },
  manifest: { rel: 'payload/tools/p0-manifest.cjs', role: 'tool', staged: true },
  archive: { rel: 'payload/tools/p0-archive.cjs', role: 'tool', staged: true },
  copy: { rel: 'payload/tools/p0-copy.cjs', role: 'tool', staged: true },
  prun: { rel: 'payload/tools/p0-product-run.cjs', role: 'tool', staged: true },
  neutralize: { rel: 'payload/tools/p0-neutralize.cjs', role: 'tool', staged: true },
  compare: { rel: 'payload/tools/p0-compare.cjs', role: 'tool', staged: true },
  index: { rel: 'payload/tools/p0-index.cjs', role: 'tool', staged: true },
  report: { rel: 'payload/tools/p0-report.cjs', role: 'tool', staged: true },
  simcases: { rel: 'payload/tools/cases/p0-simulation-cases-v1.json', role: 'case', staged: true },
  nmap: { rel: 'payload/tools/cases/p0-neutralize-map-v1.json', role: 'case', staged: true },
  vectors: { rel: 'payload/tools/cases/p0-audit-vectors-v1.json', role: 'case-fixed-bytes', staged: true },
};
const STAGE_PREFIX = 'payload/tools/';
const src = (id) => P.SRC + '\\' + w(TOOLS[id].rel);
const stg = (id) => {
  if (!TOOLS[id].staged) throw new Error('not staged: ' + id);
  return P.STAGED + '\\' + w(TOOLS[id].rel.slice(STAGE_PREFIX.length));
};

function canonStr(s) {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) o += '\\"';
    else if (c === 0x5c) o += '\\\\';
    else if (c < 0x20) o += '\\u' + c.toString(16).padStart(4, '0');
    else if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) throw new Error('canon: lone high surrogate');
      o += s[i] + s[i + 1];
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('canon: lone low surrogate');
    else o += s[i];
  }
  return o + '"';
}
function canon(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new Error('canon: non-integer or unsafe number');
    return Object.is(v, -0) ? '0' : String(v);
  }
  if (typeof v === 'string') return canonStr(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') {
    const ks = Object.keys(v);
    for (const k of ks) if (!/^[a-z0-9_]+$/.test(k)) throw new Error('canon: bad key ' + k);
    ks.sort();
    return '{' + ks.map((k) => canonStr(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('canon: unsupported type');
}
const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sha256utf8 = (s) => sha256hex(Buffer.from(s, 'utf8'));
const argvSha = (argv) => sha256utf8(canon(argv));

const F = (p) => ({ path: p, scope: 'file' });
const T = (p) => ({ path: p, scope: 'subtree' });
const M = (p, what) => ({ path: p, scope: 'metadata', what: what });
const W = (p, scope) => ({ path: p, scope: scope });

const READ_CODE = { file: 'F', subtree: 'T' };
const WRITE_CODE = {
  'file-create': 'FC', 'file-write': 'FW', 'dir-create': 'DC',
  'subtree-create': 'TC', 'subtree-write': 'TW', 'audit-parts': 'AP',
};

function covers(entry, p) {
  const a = entry.path.toLowerCase();
  const b = p.toLowerCase();
  if (a === b) return true;
  if (entry.scope === 'subtree' || entry.scope === 'subtree-create' || entry.scope === 'subtree-write' || entry.scope === 'acl-set-recursive') {
    return b.startsWith(a + '\\');
  }
  return false;
}
const coveredBy = (list, p) => list.some((e) => covers(e, p));

module.exports = {
  w, P, ID, RELEASE, CONTROL_SHA, SENTINEL, TOOLS, STAGE_PREFIX, src, stg,
  canon, canonStr, sha256hex, sha256utf8, argvSha, F, T, M, W, READ_CODE, WRITE_CODE, covers, coveredBy,
};
