import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const BASE = 'D:/Projects/ob-recover/test/fixtures/real-ob-sites/l1-qccqcc-hangzhou';
const SRC = BASE + '/js_reverse_cache';
const RUN = BASE + '/run-20261110T1458Z';
mkdirSync(RUN + '/reference', { recursive: true });
copyFileSync(SRC + '/source/script.js', RUN + '/script.js');
const sha = 'cc7a8127fa8a5d17289a953e11d82ff528fe9ea42276810c5f03371abf760daf';
writeFileSync(RUN + '/script.sha256', sha + '\n');

const vals = JSON.parse(readFileSync(SRC + '/reference-decoder-values.json', 'utf8'));
const struct = JSON.parse(readFileSync(SRC + '/recon/js-reverse/structure.json', 'utf8'));

const callSites = {
  schema: 'web-protocol-recovery/l1-reference-call-sites/1',
  capturedBy: 'skill',
  independence: 'positions and literal arguments come from a Babel parse of the archived bytes; values come from the page own global decoder evaluated in the dedicated Chrome; nothing here is derived from OB-Recover output',
  rootDecoder: vals.rootDecoder,
  aliasCount: vals.aliasCount,
  siteCount: vals.siteCount,
  uniquePairs: vals.uniquePairs,
  decodedCount: vals.decoded,
  missing: vals.missing,
  evaluateErrors: vals.evaluateErrors,
  truncated: vals.truncated,
  positionBase: 'lineNumber and columnNumber are 0 based, matching the CDP convention used by OB-Recover',
  sites: vals.sites.map((s) => ({ lineNumber: s.line, columnNumber: s.col, callee: s.callee, args: [{ type: 'number', value: s.a }, { type: 'string', value: s.b }], returnValue: { type: typeof s.value, value: s.value }, callText: s.text })),
};

const decoders = {
  schema: 'web-protocol-recovery/l1-reference-decoders/1',
  capturedBy: 'skill',
  rootDecoder: {
    name: '_0x374d',
    kind: 'top level FunctionDeclaration, reassigns itself on first call',
    params: 2,
    semantics: 'index minus 297 selects a slot in the string array; the second argument is the per string key used by the inline base64 decode',
    sourceBytes: 2057,
  },
  arrayProvider: { name: '_0x3a3a', elements: struct.stringArrayDecl ? struct.stringArrayDecl.elements : null, sourceBytes: 16834 },
  aliases: { count: vals.aliasCount, note: 'each is a local `var X = <alias|_0x374d>` chain that resolves to the same global function, so a call site of any alias has the same value as _0x374d with the same arguments' },
  rotation: { detected: !!struct.rotationIIFE, caution: 'the detected span is large, so it is a coarse block match and NOT proof of a per call rotation; the value table was read after the page finished loading, so it reflects the final array state' },
  literalsOnly: 'every collected site passes exactly two literal arguments; sites with non literal arguments were not collected and are not part of the reference',
  limitations: [
    'values were read after load, so a decoder that changed the array later would make earlier calls differ; no evidence of that was observed but it was not separately excluded',
    'the reference covers 823 of the call sites of these aliases; it does not claim to cover every decoder call in the bundle',
  ],
};

const business = {
  schema: 'web-protocol-recovery/l1-reference-business/1',
  capturedBy: 'skill',
  page: { url: 'https://hangzhou.qccqcc.com/list.html?keyword=%E5%86%B2%E9%94%8B%E8%A1%A3', title: '杭州服装_服装批发', status: 200 },
  api: {
    url: 'https://newopenapiweb.17qcc.com/api/services/app/SearchFactory/GetPageList',
    method: 'POST',
    requestFields: ['KM', 'Ver', 'Content', 'Sign', 'RsaPubAes', 'IV', 'TimesTamp'],
    headersKept: ['data-version', 'data-label', 'app-version', 'qcc-pc-referer', 'content-type'],
    headersRedacted: ['app-guestid'],
    responseShape: 'one Result field holding an upper case hex string',
    authState: 'anonymous, app-is-login 0',
  },
  scriptsContainingTheApi: ['reqid 13 combo ajax-20..hpailist-2'],
  businessAnchors: ['QccJsWebVer 2026.10.21.1', 'QccJsWebPostBaseUrl https://newopenapiweb.17qcc.com', 'SearchFactory/GetPageList'],
  notStored: 'cookie values, GuestId, request ciphertext and the response Result body',
};

const notes = `# L1 reference notes (qccqcc hangzhou)

- 来源：chrome-devtools-mcp 对专用 Chrome 155 的只读取证。js-reverse 半程**缺失**（headless 验收失败，用户决定记为缺失该半程），所以没有 initiator、没有暂停帧。
- 脚本字节：\`script.js\`，${sha}，取自浏览器网络栈解码后的响应体，非原始压缩包。
- 参考值：静态分析（Babel）只给出调用点与字面量参数；值由页面自身全局解码器 \`_0x374d\` 在浏览器内求值得到，**不经任何 OB-Recover 代码**。
- 覆盖：823 个调用点 / 812 组唯一参数，全部为字符串返回值，0 缺失 0 异常。
- 已知局限：
  - 值是在页面加载完成后读取的，若解码器在运行中改变数组，早期调用的真实值可能不同（未观测到，但也未单独排除）。
  - 只收集了两个参数全为字面量的调用点；其它形态不在参考范围内。
  - CDN 按 User-Agent 变化，不同 UA 族可能拿到不同字节。
- 未写入：cookie、GuestId、请求密文、响应 Result。
`;

writeFileSync(RUN + '/reference/call-sites.json', JSON.stringify(callSites, null, 2));
writeFileSync(RUN + '/reference/decoders.json', JSON.stringify(decoders, null, 2));
writeFileSync(RUN + '/reference/business.json', JSON.stringify(business, null, 2));
writeFileSync(RUN + '/reference/NOTES.md', notes);
console.log(JSON.stringify({ run: RUN, sites: callSites.siteCount, sha }, null, 2));
