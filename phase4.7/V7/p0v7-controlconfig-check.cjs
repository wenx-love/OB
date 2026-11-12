'use strict';
const crypto = require('crypto');
const s = [
  "import base from './vite.config.ts';",
  '',
  "const plugins = (base.plugins ?? []).filter((plugin) => plugin?.name !== 'copy-extension-files');",
  'if ((base.plugins ?? []).length - plugins.length !== 1) {',
  "  throw new Error('P0 control config must remove exactly one copy-extension-files plugin');",
  '}',
  '',
  'export default { ...base, plugins };',
].join('\n');
const out = { bytes: Buffer.byteLength(s, 'utf8'), lines: s.split('\n').length, sha256: crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex') };
console.log(JSON.stringify(out));
process.exit(out.bytes === 325 && out.sha256 === '18a06117ec70f2d5ed872f52d7e546a2fb64f93293e91acbb9f178fff2d80003' ? 0 : 1);
