/**
 * 安全沙箱全局 context 配置。
 * 提供 OB 解码器可能需要的全局函数，但不暴露 DOM、网络等危险 API。
 *
 * 用于：
 *   - Node.js vm.createContext (CLI + 测试)
 *   - 浏览器 sandbox iframe 的 new Function 执行环境
 */

/** 返回 Node.js vm.createContext 所需的全局对象 */
export function createNodeSandboxContext(): Record<string, unknown> {
  return {
    // 编码/解码
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    decodeURIComponent,
    encodeURIComponent,
    decodeURI,
    encodeURI,
    escape: globalThis.escape,
    unescape: globalThis.unescape,

    // 类型转换
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    NaN,
    Infinity,
    undefined,

    // 内置类型
    String,
    Number,
    Boolean,
    Array,
    Object,
    Math,
    Date,
    RegExp,
    JSON,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    BigInt: globalThis.BigInt,
    Proxy,
    Reflect,

    // 类型化数组
    ArrayBuffer,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    DataView,

    // 文本编解码
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,

    // 错误类型
    Error,
    TypeError,
    RangeError,
    ReferenceError,
    SyntaxError,
    URIError,
    EvalError,

    // 控制台（静默）
    console: {
      log() {},
      warn() {},
      error() {},
      info() {},
      debug() {},
      trace() {},
      dir() {},
      table() {},
    },
  };
}
