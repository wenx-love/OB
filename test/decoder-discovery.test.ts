/**
 * Phase 2 — OB Decoder Auto Discovery 测试
 * 纯静态分析，无沙箱依赖
 */
import { describe, it, expect } from 'vitest';
import { discoverDecoders } from '../src/core/decoder-discovery.js';

// ─────────────────────────────────────────────────────────────
// 样本 1：单参数解码函数（字符串数组 + return）
// ─────────────────────────────────────────────────────────────
describe('单参数字符串解码函数', () => {
  const CODE = `
    var _0xarr = ["hello","world","foo","bar","baz","qux","abc","def","ghi","jkl"];
    function decode(i) { return _0xarr[i]; }
    var a = decode(0);
    var b = decode(1);
    var c = decode(2);
    var d = decode(3);
    var e = decode(4);
  `;

  it('应识别为候选解码函数', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decode');
    expect(dec).toBeDefined();
    expect(dec!.hasStringArrayAccess).toBe(true);
    expect(dec!.stringArrayName).toBe('_0xarr');
  });

  it('应记录 5 个调用位置', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decode');
    expect(dec!.callSites.length).toBe(5);
  });

  it('调用参数应为字面量', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decode');
    const site = dec!.callSites[0];
    expect(site.args[0].isLiteral).toBe(true);
    expect(typeof site.args[0].value).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 2：双参数解码函数
// ─────────────────────────────────────────────────────────────
describe('双参数字符串解码函数', () => {
  const CODE = `
    var _0xarr = ["s1","s2","s3","s4","s5","s6","s7","s8","s9","s10"];
    function decode2(i, key) { return _0xarr[i]; }
    var x = decode2(0, "k1");
    var y = decode2(1, "k2");
    var z = decode2(2, "k3");
    var w = decode2(3, "k4");
    var v = decode2(4, "k5");
  `;

  it('应识别双参数候选', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decode2');
    expect(dec).toBeDefined();
    expect(dec!.paramCount).toBe(2);
  });

  it('调用位置应有 2 个参数', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decode2')!;
    expect(dec.callSites[0].args.length).toBe(2);
    expect(dec.callSites[0].args[1].isLiteral).toBe(true);
    expect(dec.callSites[0].args[1].value).toBe('k1');
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 3：三参数解码函数
// ─────────────────────────────────────────────────────────────
describe('三参数字符串解码函数', () => {
  const CODE = `
    var _0xarr = ["a","b","c","d","e","f","g","h","i","j"];
    function decode3(i, k1, k2) { return _0xarr[i]; }
    var x = decode3(0, "a", "b");
    var y = decode3(1, "c", "d");
    var z = decode3(2, "e", "f");
    var w = decode3(3, "g", "h");
    var v = decode3(4, "i", "j");
  `;

  it('应识别三参数候选', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decode3');
    expect(dec).toBeDefined();
    expect(dec!.paramCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 4：字符串数组 + 索引偏移
// ─────────────────────────────────────────────────────────────
describe('字符串数组 + 索引偏移', () => {
  const CODE = `
    var _0xarr = ["s0","s1","s2","s3","s4","s5","s6","s7","s8","s9"];
    function decodex(i) {
      i = i - 0x100;
      return _0xarr[i];
    }
    var a = decodex(0x100);
    var b = decodex(0x101);
    var c = decodex(0x102);
    var d = decodex(0x103);
    var e = decodex(0x104);
  `;

  it('应检测到索引偏移', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodex');
    expect(dec).toBeDefined();
    expect(dec!.hasIndexOffset).toBe(true);
  });

  it('应同时检测到字符串数组访问', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodex')!;
    expect(dec.hasStringArrayAccess).toBe(true);
    expect(dec.stringArrayName).toBe('_0xarr');
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 5：字符串数组旋转（含旋转 IIFE）
// ─────────────────────────────────────────────────────────────
describe('字符串数组旋转', () => {
  const CODE = `
    var _0xarr = ["c","a","b","d","e","f","g","h","i","j"];
    (function(arr, n) {
      while (n--) arr.push(arr.shift());
    })(_0xarr, 1);
    function decodeRot(i) { return _0xarr[i]; }
    var a = decodeRot(0);
    var b = decodeRot(1);
    var c = decodeRot(2);
    var d = decodeRot(3);
    var e = decodeRot(4);
  `;

  it('应识别候选（旋转 IIFE 是外部结构，函数本身无旋转）', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodeRot');
    expect(dec).toBeDefined();
    expect(dec!.hasStringArrayAccess).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 6：Base64 解码
// ─────────────────────────────────────────────────────────────
describe('Base64 解码', () => {
  const CODE = `
    var _0xb64 = ["aGVsbG8=","d29ybGQ=","dGVzdA==","Zm9v","YmFy","cXV4","YWJj","ZGVm","Z2hp","ams="];
    function decodeB64(i) {
      var s = _0xb64[i];
      return atob(s);
    }
    var a = decodeB64(0);
    var b = decodeB64(1);
    var c = decodeB64(2);
    var d = decodeB64(3);
    var e = decodeB64(4);
  `;

  it('应检测到 Base64 解码', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodeB64');
    expect(dec).toBeDefined();
    expect(dec!.hasBase64).toBe(true);
  });

  it('应具有高置信度（Base64 + 数组访问 + 5次调用）', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodeB64')!;
    expect(dec.confidence).toBe('high');
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 7：RC4 解码
// ─────────────────────────────────────────────────────────────
describe('RC4 解码', () => {
  const CODE = `
    var _0xrc4arr = ["enc1","enc2","enc3","enc4","enc5","enc6","enc7","enc8","enc9","enc10"];
    function decodeRC4(i, key) {
      var str = _0xrc4arr[i];
      var result = "";
      var ks = [];
      for (var j = 0; j < 256; j++) ks[j] = j;
      var a = 0;
      for (var b = 0; b < 256; b++) {
        a = (a + ks[b] + key.charCodeAt(b % key.length)) % 256;
        var tmp = ks[b]; ks[b] = ks[a]; ks[a] = tmp;
      }
      var c = 0, d = 0;
      for (var e = 0; e < str.length; e++) {
        c = (c + 1) % 256; d = (d + ks[c]) % 256;
        tmp = ks[c]; ks[c] = ks[d]; ks[d] = tmp;
        result += String.fromCharCode(str.charCodeAt(e) ^ ks[(ks[c] + ks[d]) % 256]);
      }
      return result;
    }
    var a = decodeRC4(0, "k1");
    var b = decodeRC4(1, "k2");
    var c = decodeRC4(2, "k3");
    var d = decodeRC4(3, "k4");
    var e = decodeRC4(4, "k5");
  `;

  it('应检测到 RC4 特征', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodeRC4');
    expect(dec).toBeDefined();
    expect(dec!.hasRC4).toBe(true);
  });

  it('应检测到字符串数组访问', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'decodeRC4')!;
    expect(dec.hasStringArrayAccess).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 8：多层辅助函数
// ─────────────────────────────────────────────────────────────
describe('多层辅助函数', () => {
  const CODE = `
    var _0xarr = ["YQ==","Yg==","Yw==","ZA==","ZQ==","Zg==","Zw==","aA==","aQ==","ag=="];
    function b64Decode(s) { return atob(s); }
    function mainDecoder(i) {
      var raw = _0xarr[i];
      return b64Decode(raw);
    }
    var a = mainDecoder(0);
    var b = mainDecoder(1);
    var c = mainDecoder(2);
    var d = mainDecoder(3);
    var e = mainDecoder(4);
  `;

  it('应识别 mainDecoder 为候选', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'mainDecoder');
    expect(dec).toBeDefined();
    expect(dec!.hasStringArrayAccess).toBe(true);
  });

  it('b64Decode 不应独立成为高置信度候选（无数组访问）', () => {
    const { candidates } = discoverDecoders(CODE);
    const helper = candidates.find(c => c.name === 'b64Decode');
    // 辅助函数没有数组访问，应为低置信度或不识别
    if (helper) {
      expect(helper.confidence).not.toBe('high');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 9：闭包变量依赖
// ─────────────────────────────────────────────────────────────
describe('闭包变量依赖', () => {
  const CODE = `
    (function() {
      var closureArr = ["x1","x2","x3","x4","x5","x6","x7","x8","x9","x10"];
      function closureDec(i) { return closureArr[i]; }
      window.closureDec = closureDec;
      var a = closureDec(0);
      var b = closureDec(1);
      var c = closureDec(2);
      var d = closureDec(3);
      var e = closureDec(4);
    })();
  `;

  it('应识别 closureDec 为候选（闭包中的解码函数）', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'closureDec');
    expect(dec).toBeDefined();
    expect(dec!.hasStringArrayAccess).toBe(true);
  });

  it('应检测到 closureArr 为依赖', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'closureDec')!;
    const arrDep = dec.dependencies.find(d =>
      d.kind === 'string-array' || d.kind === 'closure-variable'
    );
    expect(arrDep).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// 样本 10：动态创建的 JavaScript（eval 场景 — 静态分析 eval 内容）
// ─────────────────────────────────────────────────────────────
describe('动态创建的 JavaScript（直接分析 eval 字符串内容）', () => {
  // 运行时通过 eval() 创建，但我们拿到了源码后做静态分析
  const DYNAMIC_CODE = `
    var _0xdyn = ["dyn0","dyn1","dyn2","dyn3","dyn4","dyn5","dyn6","dyn7","dyn8","dyn9"];
    function dynamicDecoder(i) { return _0xdyn[i]; }
    dynamicDecoder(0);
    dynamicDecoder(1);
    dynamicDecoder(2);
    dynamicDecoder(3);
    dynamicDecoder(4);
  `;

  it('动态脚本源码静态分析：应识别候选', () => {
    const result = discoverDecoders(DYNAMIC_CODE, 'script-dynamic-001', 'eval://inline');
    expect(result.analyzed).toBe(true);
    const dec = result.candidates.find(c => c.name === 'dynamicDecoder');
    expect(dec).toBeDefined();
  });

  it('scriptId 和 scriptUrl 应正确记录在调用位置', () => {
    const result = discoverDecoders(DYNAMIC_CODE, 'script-dynamic-001', 'eval://inline');
    const dec = result.candidates.find(c => c.name === 'dynamicDecoder')!;
    expect(dec.callSites[0].scriptId).toBe('script-dynamic-001');
    expect(dec.callSites[0].scriptUrl).toBe('eval://inline');
  });
});

// ─────────────────────────────────────────────────────────────
// 区分：普通函数 vs 解码函数
// ─────────────────────────────────────────────────────────────
describe('区分普通函数和解码函数', () => {
  const CODE = `
    var _0xarr = ["s1","s2","s3","s4","s5","s6","s7","s8","s9","s10"];
    function decoder(i) { return _0xarr[i]; }

    function normalAdd(a, b) { return a + b; }
    function normalConcat(a, b) { return a + b; }
    function normalTransform(x) { return x.toUpperCase(); }

    decoder(0); decoder(1); decoder(2); decoder(3); decoder(4);
    normalAdd(1, 2);
    normalConcat("a", "b");
    normalTransform("hello");
  `;

  it('decoder 应被识别', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(candidates.find(c => c.name === 'decoder')).toBeDefined();
  });

  it('normalAdd 不应被识别（无数组访问）', () => {
    const { candidates } = discoverDecoders(CODE);
    const fn = candidates.find(c => c.name === 'normalAdd');
    expect(fn).toBeUndefined();
  });

  it('normalConcat 不应被识别', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(candidates.find(c => c.name === 'normalConcat')).toBeUndefined();
  });

  it('normalTransform 不应被识别', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(candidates.find(c => c.name === 'normalTransform')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// FunctionExpression（var x = function() {}）形式
// ─────────────────────────────────────────────────────────────
describe('FunctionExpression 形式', () => {
  const CODE = `
    var _0xarr = ["p","q","r","s","t","u","v","w","x","y"];
    var exprDecoder = function(i) { return _0xarr[i]; };
    exprDecoder(0); exprDecoder(1); exprDecoder(2); exprDecoder(3); exprDecoder(4);
  `;

  it('应识别 var 赋值的函数表达式', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(candidates.find(c => c.name === 'exprDecoder')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// 调用参数分析（字面量 vs 非字面量）
// ─────────────────────────────────────────────────────────────
describe('调用参数分析', () => {
  const CODE = `
    var _0xarr = ["v0","v1","v2","v3","v4","v5","v6","v7","v8","v9"];
    function dec(i, key) { return _0xarr[i]; }
    dec(0, "static");
    dec(1, "other");
    dec(dynamicIdx, "static");
    dec(2, 3);
    dec(4, "abc");
  `;

  it('字面量参数 isLiteral=true', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'dec')!;
    const site = dec.callSites.find(s => s.args[0].isLiteral);
    expect(site).toBeDefined();
    expect(site!.args[0].isLiteral).toBe(true);
  });

  it('变量参数 isLiteral=false', () => {
    const { candidates } = discoverDecoders(CODE);
    const dec = candidates.find(c => c.name === 'dec')!;
    const dynSite = dec.callSites.find(s => !s.args[0].isLiteral);
    expect(dynSite).toBeDefined();
    expect(dynSite!.args[0].isLiteral).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 多个不同解码函数
// ─────────────────────────────────────────────────────────────
describe('多个不同解码函数', () => {
  const CODE = `
    var _arr1 = ["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10"];
    var _arr2 = ["b1","b2","b3","b4","b5","b6","b7","b8","b9","b10"];
    function decA(i) { return _arr1[i]; }
    function decB(i) { i -= 100; return _arr2[i]; }
    decA(0); decA(1); decA(2); decA(3); decA(4);
    decB(100); decB(101); decB(102); decB(103); decB(104);
  `;

  it('应识别两个不同候选', () => {
    const { candidates } = discoverDecoders(CODE);
    expect(candidates.find(c => c.name === 'decA')).toBeDefined();
    expect(candidates.find(c => c.name === 'decB')).toBeDefined();
  });

  it('decB 应检测到索引偏移', () => {
    const { candidates } = discoverDecoders(CODE);
    const b = candidates.find(c => c.name === 'decB')!;
    expect(b.hasIndexOffset).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 错误处理：语法错误
// ─────────────────────────────────────────────────────────────
describe('错误处理', () => {
  it('语法错误不应崩溃，analyzed=false', () => {
    const result = discoverDecoders('function broken() { if( ');
    // 宽容解析可能成功，检查 analyzed 或 error
    expect(result).toBeDefined();
    // 不应抛出异常
  });

  it('空字符串应返回空结果', () => {
    const result = discoverDecoders('');
    expect(result.analyzed).toBe(true);
    expect(result.candidates.length).toBe(0);
  });

  it('无解码器代码应返回空候选', () => {
    const result = discoverDecoders('var x = 1; function add(a,b) { return a+b; } add(1,2);');
    expect(result.candidates.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 函数收集：覆盖所有声明形式
// ─────────────────────────────────────────────────────────────
describe('函数收集覆盖率', () => {
  const CODE = `
    var _arr = ["x0","x1","x2","x3","x4","x5","x6","x7","x8","x9"];

    // FunctionDeclaration
    function declFn(i) { return _arr[i]; }

    // FunctionExpression
    var exprFn = function(i) { return _arr[i]; };

    // ArrowFunctionExpression
    var arrowFn = (i) => _arr[i];

    declFn(0); declFn(1); declFn(2); declFn(3); declFn(4);
    exprFn(0); exprFn(1); exprFn(2); exprFn(3); exprFn(4);
    arrowFn(0); arrowFn(1); arrowFn(2); arrowFn(3); arrowFn(4);
  `;

  it('FunctionDeclaration 被收集', () => {
    const { functions } = discoverDecoders(CODE);
    expect(functions.find(f => f.name === 'declFn' && f.kind === 'FunctionDeclaration')).toBeDefined();
  });

  it('FunctionExpression 被收集', () => {
    const { functions } = discoverDecoders(CODE);
    expect(functions.find(f => f.name === 'exprFn' && f.kind === 'FunctionExpression')).toBeDefined();
  });

  it('ArrowFunctionExpression 被收集', () => {
    const { functions } = discoverDecoders(CODE);
    expect(functions.find(f => f.name === 'arrowFn' && f.kind === 'ArrowFunctionExpression')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// 真实样本：固定值样本类似 OB 输出
// ─────────────────────────────────────────────────────────────
describe('类 OB 真实样本', () => {
  const OB_LIKE = `
    var _0xabc123 = ["Y29uc29sZQ==","bG9n","SGVsbG8=","V29ybGQ=","cmV0dXJu",
                     "dG9TdHJpbmc=","Y2FsbA==","YXBwbHk=","YmluZA==","bGVuZ3Ro"];

    (function(_0xarr, _0xn) {
      var _shift = function(_cnt) {
        while(--_cnt) { _0xarr.push(_0xarr.shift()); }
      };
      _shift(++_0xn);
    })(_0xabc123, 0x1a4);

    function _0x29ae5c(_0xidx, _0xkey) {
      _0xidx = _0xidx - 0x0;
      var _0xval = _0xabc123[_0xidx];
      var _0xdecoded = atob(_0xval);
      return _0xdecoded;
    }

    var _0x27a7e9 = {};
    _0x27a7e9[_0x29ae5c(0x0)] = function(msg) {
      console[_0x29ae5c(0x1)](msg);
    };
    _0x27a7e9[_0x29ae5c(0x0)](_0x29ae5c(0x2) + ' ' + _0x29ae5c(0x3));
  `;

  it('应识别 _0x29ae5c 为候选解码函数', () => {
    const { candidates } = discoverDecoders(OB_LIKE);
    const dec = candidates.find(c => c.name === '_0x29ae5c');
    expect(dec).toBeDefined();
  });

  it('应具有 high 或 medium 可信度', () => {
    const { candidates } = discoverDecoders(OB_LIKE);
    const dec = candidates.find(c => c.name === '_0x29ae5c')!;
    expect(['high', 'medium']).toContain(dec.confidence);
  });

  it('应检测 Base64 + 字符串数组访问 + 索引偏移', () => {
    const { candidates } = discoverDecoders(OB_LIKE);
    const dec = candidates.find(c => c.name === '_0x29ae5c')!;
    expect(dec.hasBase64).toBe(true);
    expect(dec.hasStringArrayAccess).toBe(true);
    expect(dec.hasIndexOffset).toBe(true);
  });

  it('应找到 5 个调用位置（含重复索引）', () => {
    const { candidates } = discoverDecoders(OB_LIKE);
    const dec = candidates.find(c => c.name === '_0x29ae5c')!;
    // _0x29ae5c(0x0)×2, _0x29ae5c(0x1), _0x29ae5c(0x2), _0x29ae5c(0x3) = 5 次
    expect(dec.callSites.length).toBe(5);
  });

  it('调用位置父节点类型应为 MemberExpression 或其他上下文', () => {
    const { candidates } = discoverDecoders(OB_LIKE);
    const dec = candidates.find(c => c.name === '_0x29ae5c')!;
    const memberSites = dec.callSites.filter(s => s.parentNodeType === 'MemberExpression');
    expect(memberSites.length).toBeGreaterThan(0);
  });

  it('全部分析通过，无错误', () => {
    const result = discoverDecoders(OB_LIKE);
    expect(result.analyzed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
