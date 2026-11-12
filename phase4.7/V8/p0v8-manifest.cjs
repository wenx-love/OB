'use strict';
// V8 delivery-manifest generator. Measures the package, then publishes with temp+rename.
// The manifest never lists its own hash (self-reference is impossible); its metadata is
// reported by the caller. This tool is part of the package it measures.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = 'PHASE4.7-PHASE0-V8-DELIVERY-MANIFEST.md';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const CONTRACT = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V8.md',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V8.tsv',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V8.json',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V8.md',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V8.json',
  'PHASE4.7-PHASE0-V8-FAILURE-MODEL.md',
  'PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md',
  'PHASE4.7-PHASE0-V7-TO-V8-CHANGELOG.md',
  'PHASE4.7-PHASE0-V8-N01-N12-TRACEABILITY.md',
  'PHASE4.7-PHASE0-V8-OPEN-ISSUES.md',
  'PHASE4.7-PHASE0-V8-SELF-CHECK.md',
  'PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md',
];
const TOOLS = [
  'p0v8-lib.cjs', 'p0v8-spec.cjs', 'p0v8-flow.cjs', 'p0v8-audit.cjs', 'p0v8-build.cjs',
  'p0v8-publish.cjs', 'p0v8-check.cjs', 'p0v8-verify.ps1', 'p0v8-parse-inline.ps1',
  'p0v8-hygiene.cjs', 'p0v8-controlconfig-check.cjs', 'p0v8-lab.cjs', 'p0v8-manifest.cjs',
];

function measure(files, name) {
  const body = files[name];
  if (body === undefined) return '| `' + name + '` | MISSING | - | - |';
  const b = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const s = b.toString('utf8');
  const lines = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  return '| `' + name + '` | ' + b.length + ' | ' + lines + ' | `' + sha(b) + '` |';
}

function renderManifest(files) {
  const present = Object.keys(files).filter((f) => f !== OUT).sort();
  const head = [
    '# OB-Recover Phase 4.7：Phase 0 V8 交付清单',
    '',
    '日期：2026-11-11。基准目录：`C:\\Users\\Administrator\\TEMP\\opencode\\p47-worker-remediation-plan\\V8\\`',
    '',
    '本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布，并由 `_publish\\CURRENT.json` 绑定。',
    '',
    '## 1. 契约文件（12 份）',
    '',
    '| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |',
    '|---|---:|---:|---|',
    ...CONTRACT.map((f) => measure(files, f)),
    '',
    '## 2. 生成与检查工具（13 份）',
    '',
    '| 文件 | 字节 | 行数 | SHA-256 |',
    '|---|---:|---:|---|',
    ...TOOLS.map((f) => measure(files, f)),
    '',
    '## 3. 复现',
    '',
    '```text',
    'node p0v8-build.cjs                 # generate, gate, publish through the journaled transaction',
    'node p0v8-check.cjs --dir .         # independent checker (no import of the generator)',
    'powershell -NoProfile -ExecutionPolicy Bypass -File p0v8-verify.ps1 -Dir .',
    'powershell -NoProfile -ExecutionPolicy Bypass -File p0v8-parse-inline.ps1 -Dir .',
    'node p0v8-hygiene.cjs ..            # historical immutability (V7 and earlier)',
    'node p0v8-controlconfig-check.cjs',
    'node p0v8-lab.cjs                   # publish fault lab (isolated scratch only)',
    'node p0v8-publish.cjs status .      # pointer/release consistency',
    'node p0v8-publish.cjs recover .     # repair an interrupted transaction',
    'node p0v8-manifest.cjs .            # regenerate this manifest in place',
    '```',
    '',
    '`p0v8-build.cjs` 先在内存生成并自检，再写入 staging，运行独立检查器与 PowerShell 验证；只有两者退出 0 才提交。提交点是 `_publish\\CURRENT.json`；发布协议见 `PHASE4.7-PHASE0-V8-PUBLISH-PROTOCOL.md`。',
    '',
    '## 4. 未交付（外部输入）',
    '',
    '| 项 | 原因 |',
    '|---|---|',
    '| `D:\\P47TOOLS\\p47-phase0-v8` 发布包（20 payload） | 未提供 |',
    '| `RELEASE-MANIFEST.json` 批准 SHA-256 | 未提供 |',
    '| 管理员 SID 用户确认 | 未完成 |',
    '| `P0_CODEX_ACCOUNT` | 未指定 |',
    '| SECOND_ARCHIVE 绑定 | 未完成 |',
    '| dispatcher/verifier/audit/guard/业务工具源码 | 全部缺失，见 `PHASE4.7-PHASE0-V8-RUNTIME-TOOLS-STATUS.md` |',
    '| 动态验证（真实 writer/guard/ACL/FD/故障注入/封存恢复） | 未运行 |',
    '',
    '## 5. 未创建、未修改',
    '',
    '未创建 `D:\\P47RUN`、`D:\\P47TOOLS`；未改 ACL、产品源码、配置、测试、`dist`；V4—V7 与历史报告哈希不变。',
    '',
    '## 6. 当前发布指针',
    '',
    '`_publish\\CURRENT.json` 的 `rid`、`files[]` 与上表逐项相等；`node p0v8-publish.cjs status .` 必须报告无 issue。',
    '',
  ].join('\n');
  return head;
}

function regen(root) {
  const files = {};
  for (const f of CONTRACT.concat(TOOLS)) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) files[f] = fs.readFileSync(p);
  }
  const text = renderManifest(files);
  const target = path.join(root, OUT);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, target);
  const b = fs.readFileSync(target);
  return { file: OUT, bytes: b.length, lines: b.toString('utf8').split('\n').length - 1, sha256: sha(b) };
}

module.exports = { renderManifest, regen, CONTRACT, TOOLS, OUT };

if (require.main === module) {
  const root = process.argv[2] || __dirname;
  console.log(JSON.stringify(regen(root), null, 2));
}
