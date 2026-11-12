'use strict';
// Fixed control-config template check. The template is data, not code; this proves the exact
// 325 bytes (LF, no BOM, no trailing newline) that the runner writes into the copies.
const crypto = require('crypto');
const TEXT = [
  "import base from './vite.config.ts';",
  '',
  "const plugins = (base.plugins ?? []).filter((plugin) => plugin?.name !== 'copy-extension-files');",
  'if ((base.plugins ?? []).length - plugins.length !== 1) {',
  "  throw new Error('P0 control config must remove exactly one copy-extension-files plugin');",
  '}',
  '',
  'export default { ...base, plugins };',
].join('\n');
const sha = crypto.createHash('sha256').update(Buffer.from(TEXT, 'utf8')).digest('hex');
const bytes = Buffer.byteLength(TEXT, 'utf8');
const lines = TEXT.split('\n').length;
const ok = bytes === 325 && sha === '18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003';
console.log(JSON.stringify({ bytes, lines, sha256: sha, ok }, null, 2));
process.exit(ok ? 0 : 1);
