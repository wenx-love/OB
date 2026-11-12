import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Generates the real OB sample with javascript-obfuscator (the engine behind obfuscator.io).
// The generator is installed OUTSIDE the project (GEN_ROOT) so the project dependencies stay unchanged.
const DIR = 'D:/Projects/ob-recover/test/fixtures/real-ob';
const GEN_ROOT = 'C:/Users/Administrator/TEMP/opencode/obf-gen';
const OUT = DIR + '/obfuscated.js';
const META = DIR + '/metadata.json';

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log('obfuscated.js already exists: refusing to overwrite the original sample (pass --force to regenerate)');
  process.exit(2);
}

const require = createRequire(GEN_ROOT + '/package.json');
const mod = require('javascript-obfuscator');
const JSO = mod && typeof mod.obfuscate === 'function' ? mod : mod.default;
if (!JSO || typeof JSO.obfuscate !== 'function') throw new Error('javascript-obfuscator API not found');
const genVersion = JSON.parse(readFileSync(GEN_ROOT + '/node_modules/javascript-obfuscator/package.json', 'utf8')).version;
const sha = (b) => createHash('sha256').update(b).digest('hex');

const options = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 1,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'browser',
  seed: 20261109,
};

const sourceBytes = readFileSync(DIR + '/source.js');
const code = JSO.obfuscate(sourceBytes.toString('utf8'), options).getObfuscatedCode();
writeFileSync(OUT, code, 'utf8');
const outBytes = readFileSync(OUT);
const text = outBytes.toString('utf8');

const meta = {
  generator: 'javascript-obfuscator',
  generatorVersion: genVersion,
  note: 'obfuscated.js is the unmodified generator output; never edit it by hand. source.js is hand-written plaintext. Generator installed outside the project.',
  options,
  sourceSha256: sha(sourceBytes),
  obfuscatedSha256: sha(outBytes),
  sourceBytes: sourceBytes.length,
  obfuscatedBytes: outBytes.length,
  generatedAt: new Date().toISOString(),
  staticFeatureCounts: {
    hexIdentifiers: (text.match(/_0x[0-9a-f]{3,8}/g) || []).length,
    functionDeclarations: (text.match(/function /g) || []).length,
    pushShiftRotation: (text.match(/push[^;]{0,60}shift/g) || []).length,
    debuggerKeyword: (text.match(/debugger/g) || []).length,
  },
};
writeFileSync(META, JSON.stringify(meta, null, 2), 'utf8');
console.log(JSON.stringify({ genVersion, obfuscatedBytes: outBytes.length, sha256: meta.obfuscatedSha256, features: meta.staticFeatureCounts }));
