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
console.log(JSON.stringify({ bytes: Buffer.byteLength(s, 'utf8'), lines: s.split('\n').length, sha256: crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex') }));
