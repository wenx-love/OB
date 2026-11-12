# L1 reference notes (qccqcc hangzhou)

- 来源：chrome-devtools-mcp 对专用 Chrome 155 的只读取证。js-reverse 半程**缺失**（headless 验收失败，用户决定记为缺失该半程），所以没有 initiator、没有暂停帧。
- 脚本字节：`script.js`，cc7a8127fa8a5d17289a953e11d82ff528fe9ea42276810c5f03371abf760daf，取自浏览器网络栈解码后的响应体，非原始压缩包。
- 参考值：静态分析（Babel）只给出调用点与字面量参数；值由页面自身全局解码器 `_0x374d` 在浏览器内求值得到，**不经任何 OB-Recover 代码**。
- 覆盖：823 个调用点 / 812 组唯一参数，全部为字符串返回值，0 缺失 0 异常。
- 已知局限：
  - 值是在页面加载完成后读取的，若解码器在运行中改变数组，早期调用的真实值可能不同（未观测到，但也未单独排除）。
  - 只收集了两个参数全为字面量的调用点；其它形态不在参考范围内。
  - CDN 按 User-Agent 变化，不同 UA 族可能拿到不同字节。
- 未写入：cookie、GuestId、请求密文、响应 Result。
