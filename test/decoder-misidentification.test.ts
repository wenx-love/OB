import { describe, it, expect } from 'vitest';
import { discoverDecoders } from '../src/core/decoder-discovery.js';

// 从 sample-02 的 ox（CRC32 更新）与 sample-04 的 _doProcessBlock（分块哈希）抽取的结构片段，只做静态分析，不执行
const CRC32_LIKE = `
var rx = [0, 1996959894, 3993919788, 2567524794, 124634137, 1886057615, 3915621685, 2657392035];
var ox = function (x, e, a, w) {
  var n = rx, c = w + a;
  x ^= -1;
  for (var r = w; r < c; r++) x = (x >>> 8) ^ n[255 & (x ^ e[r])];
  return x ^ -1;
};
ox(0, [1, 2, 3], 3, 0);
`;

const BLOCK_HASH_LIKE = `
var H = { words: [1732584193, 4023233417, 2562383102, 271733878, 3285377520] };
var obj = {
  _doProcessBlock: function (M, offset) {
    for (var i = 0; i < 16; i++) {
      var o = offset + i;
      var v = M[o];
      M[o] = (((v << 8) | (v >>> 24)) & 16711935) | (((v << 24) | (v >>> 8)) & 4278255360);
    }
    var h = H.words;
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (var j = 0; j < 80; j += 1) {
      var t = (a + M[offset + j % 16]) | 0;
      t = (t << 10) | (t >>> 22);
      a = e; e = d; d = c; c = b; b = t;
    }
    h[0] = (h[1] + c + d) | 0;
    h[1] = (h[2] + d + e) | 0;
  }
};
`;

const REAL_DECODER = `
var _arr = ['Signature', 'hello', 'world', 'foo', 'bar', 'baz', 'qux', 'alpha', 'beta', 'gamma'];
function decOne(i) { i = i - 0x100; return _arr[i]; }
decOne(0x100); decOne(0x101); decOne(0x102);
`;

describe('Phase 2 误识别：数值/位运算函数不应成为高可信度解码候选', () => {
  it('CRC32 更新函数 ox 不应是 high', () => {
    const { candidates } = discoverDecoders(CRC32_LIKE);
    const ox = candidates.find((c) => c.name === 'ox');
    expect(ox === undefined || ox.confidence !== 'high').toBe(true);
  });

  it('分块哈希 _doProcessBlock 不应是 high', () => {
    const { candidates } = discoverDecoders(BLOCK_HASH_LIKE);
    const hits = candidates.filter((c) => c.name === '_doProcessBlock');
    expect(hits.every((c) => c.confidence !== 'high')).toBe(true);
  });

  it('对照：真正的字符串数组解码函数仍是 high', () => {
    const { candidates } = discoverDecoders(REAL_DECODER);
    const dec = candidates.find((c) => c.name === 'decOne');
    expect(dec?.confidence).toBe('high');
  });
});
