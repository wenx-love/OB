import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const DIR = 'D:/Projects/ob-recover/test/fixtures/real-ob';

function run(file) {
  const code = readFileSync(DIR + '/' + file, 'utf8');
  const win = {};
  const doc = { title: '' };
  const ctx = vm.createContext({ window: win, document: doc });
  new vm.Script(code, { filename: file }).runInContext(ctx, { timeout: 5000 });
  return { result: win.__obResult, title: doc.title };
}

const plain = run('source.js');
const obf = run('obfuscated.js');
const equal = JSON.stringify(plain) === JSON.stringify(obf);
console.log(JSON.stringify({ equal, plain, obf }, null, 1));
process.exit(equal ? 0 : 1);
