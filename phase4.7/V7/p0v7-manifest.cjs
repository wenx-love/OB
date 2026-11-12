'use strict';
// V7 delivery-manifest generator. Measures the package, then publishes atomically.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = __dirname;
const OUT = 'PHASE4.7-PHASE0-V7-DELIVERY-MANIFEST.md';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const contract = [
  'PHASE4.7-PHASE0-START-CONDITIONS-V7.md',
  'PHASE4.7-PHASE0-COMMAND-READ-WHITELIST-V7.tsv',
  'PHASE4.7-PHASE0-COMMAND-EXECUTION-REGISTRY-V7.json',
  'PHASE4.7-PHASE0-WRITE-AUDIT-SPEC-V7.md',
  'PHASE4.7-PHASE0-AUDIT-VECTORS-V7.json',
  'PHASE4.7-PHASE0-V6-TO-V7-CHANGELOG.md',
  'PHASE4.7-PHASE0-V7-N01-N12-TRACEABILITY.md',
  'PHASE4.7-PHASE0-V7-OPEN-ISSUES.md',
  'PHASE4.7-PHASE0-V7-SELF-CHECK.md',
  'PHASE4.7-PHASE0-V7-RUNTIME-TOOLS-STATUS.md',
];
const tools = [
  'p0v7-lib.cjs', 'p0v7-spec.cjs', 'p0v7-audit.cjs', 'p0v7-build.cjs', 'p0v7-check.cjs',
  'p0v7-verify.ps1', 'p0v7-parse-inline.ps1', 'p0v7-hygiene.cjs', 'p0v7-controlconfig-check.cjs', 'p0v7-manifest.cjs',
];
function row(f) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { console.error('missing: ' + f); process.exit(1); }
  const b = fs.readFileSync(p);
  const s = b.toString('utf8');
  const lines = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  return '| `' + f + '` | ' + b.length + ' | ' + lines + ' | `' + sha(b) + '` |';
}
const head = [
  '# OB-Recover Phase 4.7：Phase 0 V7 交付清单',
  '',
  '日期：2026-11-11。基准目录：`C:\\Users\\Administrator\\TEMP\\opencode\\p47-worker-remediation-plan\\V7\\`',
  '',
  '本清单不含自身哈希（避免自引用）；清单文件的字节数与 SHA-256 在交付回复中公布。',
  '',
  '## 1. 契约文件（10 份）',
  '',
  '| 文件（绝对路径前缀同基准目录） | 字节 | 行数 | SHA-256 |',
  '|---|---:|---:|---|',
  ...contract.map(row),
  '',
  '## 2. 生成与检查工具（10 份）',
  '',
  '| 文件 | 字节 | 行数 | SHA-256 |',
  '|---|---:|---:|---|',
  ...tools.map(row),
  '',
  '## 3. 复现',
  '',
  '```text',
  'node p0v7-build.cjs',
  'node p0v7-check.cjs',
  'powershell -NoProfile -ExecutionPolicy Bypass -File p0v7-verify.ps1',
  'powershell -NoProfile -ExecutionPolicy Bypass -File p0v7-parse-inline.ps1',
  'node p0v7-hygiene.cjs',
  'node p0v7-controlconfig-check.cjs',
  'node p0v7-manifest.cjs',
  '```',
  '',
  '`p0v7-build.cjs` 先完成内存校验再发布；失败回滚。重跑会重写产物与两份文档附录，清单需重新生成。',
  '',
  '## 4. 未交付（外部输入）',
  '',
  '| 项 | 原因 |',
  '|---|---|',
  '| `D:\\P47TOOLS\\p47-phase0-v7` 发布包（20 payload） | 未提供 |',
  '| `RELEASE-MANIFEST.json` 批准 SHA-256 | 未提供 |',
  '| 管理员 SID 用户确认 | 未完成 |',
  '| `P0_CODEX_ACCOUNT` | 未指定 |',
  '| SECOND_ARCHIVE 绑定 | 未完成 |',
  '| dispatcher/verifier/audit/guard/业务工具源码 | 全部缺失，见 `PHASE4.7-PHASE0-V7-RUNTIME-TOOLS-STATUS.md` |',
  '| 动态验证 | 未运行 |',
  '',
  '## 5. 未创建、未修改',
  '',
  '未创建 `D:\\P47RUN`、`D:\\P47TOOLS`；未改 ACL、产品源码、配置、测试、`dist`；V4/V5/V6 与三轮报告哈希不变。',
  '',
].join('\n');

const target = path.join(DIR, OUT);
const old = fs.existsSync(target) ? fs.readFileSync(target) : null;
try {
  const tmp = target + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, head, 'utf8');
  fs.renameSync(tmp, target);
} catch (e) {
  if (old !== null) { try { fs.writeFileSync(target, old); } catch (x) { /* ignore */ } }
  console.error('manifest publish failed: ' + e.message);
  process.exit(1);
}
const mb = fs.readFileSync(target);
const ms = mb.toString('utf8');
console.log(JSON.stringify({ file: OUT, bytes: mb.length, lines: ms.split('\n').length - (ms.endsWith('\n') ? 1 : 0), sha256: sha(mb), rows: contract.length + tools.length }, null, 2));
