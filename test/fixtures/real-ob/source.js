// Plaintext source for the real OB sample (hand-written for this test; NOT obfuscated). obfuscated.js is produced from it by scripts/gen-real-ob-sample.mjs.
function greet(name) {
  return 'Hello, ' + name + '!';
}

function describeItem(item) {
  var status = item.inStock ? 'available' : 'sold-out';
  return 'item-' + item.id + ':' + status + ':' + item.title;
}

function buildReport(items) {
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    lines.push(describeItem(items[i]));
  }
  return lines.join('|');
}

function pick(table, key) {
  return table[key] || 'unknown';
}

var items = [
  { id: 1, inStock: true, title: 'windbreaker' },
  { id: 2, inStock: false, title: 'down-jacket' },
  { id: 3, inStock: true, title: 'fleece' }
];
var prices = { windbreaker: 'cny-199', fleece: 'cny-89' };
var out = [];
out.push(greet('ob-recover'));
out.push(buildReport(items));
out.push(pick(prices, 'windbreaker'));
out.push(pick(prices, 'parka'));
out.push(typeof window === 'object' ? 'browser' : 'other');
window.__obResult = out;
document.title = 'done';
