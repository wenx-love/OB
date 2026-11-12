/**
 * Sandbox — 隔离执行 recover 引擎
 * MV3 sandbox 页面允许 eval/new Function
 */
import { recover, parseCode, generateCode } from '../../core/pipeline.js';
import { applyVerifiedReplacements } from '../../core/verified-replacer.js';
import type { DryRunResult } from '../../core/replacement-dryrun.js';
import type { ValidationScript } from '../../core/capture-validation.js';

/**
 * 在隔离 iframe 中执行代码。
 * 比直接 new Function 更安全——限制了全局作用域。
 */
async function sandboxEval(code: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    try {
      const win = iframe.contentWindow as any;
      if (!win) throw new Error('Cannot access iframe contentWindow');

      // 注入安全的全局函数（解码器需要的）
      win.atob = atob;
      win.btoa = btoa;
      win.decodeURIComponent = decodeURIComponent;
      win.encodeURIComponent = encodeURIComponent;
      win.decodeURI = decodeURI;
      win.encodeURI = encodeURI;
      win.escape = escape;
      win.unescape = unescape;
      win.parseInt = parseInt;
      win.parseFloat = parseFloat;
      win.isNaN = isNaN;
      win.isFinite = isFinite;
      win.String = String;
      win.Number = Number;
      win.Boolean = Boolean;
      win.Array = Array;
      win.Object = Object;
      win.Math = Math;
      win.Date = Date;
      win.RegExp = RegExp;
      win.JSON = JSON;
      win.Map = Map;
      win.Set = Set;
      win.Error = Error;
      win.TypeError = TypeError;
      win.RangeError = RangeError;
      win.Uint8Array = Uint8Array;
      win.ArrayBuffer = ArrayBuffer;
      win.TextEncoder = TextEncoder;
      win.TextDecoder = TextDecoder;
      win.console = { log() {}, warn() {}, error() {}, info() {}, debug() {}, trace() {}, dir() {}, table() {} };

      const result = win.eval(code);
      resolve(result);
    } catch (err: any) {
      reject(err);
    } finally {
      document.body.removeChild(iframe);
    }
  });
}

window.addEventListener('message', async (event) => {
  const { method, params } = event.data || {};
  const port = event.ports?.[0];
  if (!port || !method) return;

  try {
    if (method === 'recover') {
      const opts: any = {
        useSandbox: true,
        sandboxEval,
        enableObjectMapping: true,
      };
      if (params.externalMappings) {
        opts.externalMappings = params.externalMappings;
      }
      const result = await recover(params.code, opts);
      port.postMessage({ result });
    } else if (method === 'format') {
      const ast = parseCode(params.code);
      const formatted = generateCode(ast, { indent: '    ' });
      port.postMessage({ result: { code: formatted } });
    } else if (method === 'apply-verified') {
      // Phase 4: 应用已验证的替换
      // params: { dryRunResult: DryRunResult, script: ValidationScript }
      const dryRunResult = params.dryRunResult as DryRunResult;
      const script = params.script as ValidationScript;
      const result = await applyVerifiedReplacements(dryRunResult, script);
      port.postMessage({ result });
    } else {
      throw new Error(`Unknown method: ${method}`);
    }
  } catch (err: any) {
    port.postMessage({ error: err.message });
  }
});

window.parent.postMessage({ type: 'sandbox-ready' }, '*');
