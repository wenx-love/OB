/**
 * OB-Recover DevTools Panel
 *
 * 脚本捕获：chrome.devtools.network.onRequestFinished
 * 还原引擎：通过 MessageChannel 调用 sandbox iframe 内的 recover()
 * 展示：左侧脚本列表 + 右侧原始/还原双栏对比 + 底部转换报告
 * Phase 2: 自动发现 OB 解码函数（通过 CDP Debugger.scriptParsed）
 */
import { type CandidateDecoder, type DiscoveryResult } from '../../core/decoder-discovery.js';
import { computeCapturePlan } from '../../core/capture-plan.js';
import { parseCode } from '../../core/parser.js';
import './layout.js';
import type { File as BabelFile } from '@babel/types';
import type { CaptureTarget, DecoderCapture, RuntimeValue, CaptureEvent } from '../debugger/capture-engine.js';
import { validateCaptures, type GroupValidation, type ValidationScript, type ValidationStatus } from '../../core/capture-validation.js';
import { computeValidationStats } from '../../core/validation-stats.js';
import { dryRunReplacements } from '../../core/replacement-dryrun.js';
import { initManualPanel, type ManualPanel } from './manual-panel.js';
import { DecoderAnalysisClient } from './decoder-analysis-client.js';

interface Script {
  url: string;
  source: string;
  size: number;
  recovered?: string;
  transforms?: any[];
  stats?: any;
  // Phase 4: 位置级替换需要的字段
  scriptId?: string;
  startLine?: number;
  startColumn?: number;
}

// Phase 2: Decoder Discovery 状态
const discoveredScripts = new Map<string, DiscoveredScript>();
const allCandidates: CandidateDecoder[] = [];
// Phase 3: 候选 -> 所属脚本（计算捕获计划需要 scriptId、url、源码）
const candidateScript = new WeakMap<CandidateDecoder, DiscoveredScript>();

// Phase 4.7 性能修复：静态分析在 Worker 里执行，面板主线程只做记账与渲染。
// 分析函数本身未变（同一个 discoverDecoders），只是换了执行线程。
const analysisClient = new DecoderAnalysisClient({
  onWorkerUnavailable: (reason) => {
    rtLog('error', `分析 Worker 不可用：${reason}`);
  },
});

const scripts: Script[] = [];
let activeScript: Script | null = null;

// ── 脚本缓存 ──

async function getCacheKey(): Promise<string> {
  return new Promise<string>((resolve) => {
    chrome.devtools.inspectedWindow.eval('location.origin', (result: any, exInfo: any) => {
      resolve('ob_recover_scripts_' + (exInfo?.isException ? 'unknown' : (result || 'unknown')));
    });
  });
}

async function saveScriptsToCache(): Promise<void> {
  const key = await getCacheKey();
  const data = scripts.map(s => ({
    url: s.url,
    source: s.source,
    size: s.size,
    recovered: s.recovered || null,
    transforms: s.transforms || null,
    stats: s.stats || null,
  }));
  await chrome.storage.local.set({
    [key]: {
      scripts: data,
      lastSelectedUrl: activeScript?.url || null,
      ts: Date.now(),
    },
  });
}

async function loadScriptsFromCache(): Promise<boolean> {
  const key = await getCacheKey();
  const result = await chrome.storage.local.get(key);
  const cached = result[key];
  if (!cached) return false;

  // 兼容新旧格式
  const arr = Array.isArray(cached) ? cached : cached.scripts;
  if (!arr || arr.length === 0) return false;
  if (cached.ts && Date.now() - cached.ts > 7 * 24 * 60 * 60 * 1000) return false;

  for (const item of arr) {
    const s: Script = {
      url: item.url,
      source: item.source,
      size: item.size || item.source?.length || 0,
      recovered: item.recovered || undefined,
      transforms: item.transforms || undefined,
      stats: item.stats || undefined,
    };
    scripts.push(s);
    const li = document.createElement('li');
    li.innerHTML = `<span class="script-name">${esc(shortUrl(s.url))}</span><span class="script-size">${formatBytes(s.size)}</span>`;
    li.title = s.url;
    li.addEventListener('click', () => selectScript(s, li));
    scriptListEl.appendChild(li);
  }
  scriptCountEl.textContent = String(scripts.length);

  // 选中上次选中的文件
  const lastUrl = cached.lastSelectedUrl;
  let target = scripts[0];
  if (lastUrl) {
    const found = scripts.find(s => s.url === lastUrl);
    if (found) target = found;
  }
  const allLi = scriptListEl.querySelectorAll('li');
  let targetLi: HTMLElement | undefined;
  allLi.forEach((li: any) => { if (li.title === target.url) targetLi = li; });
  selectScript(target, targetLi);
  setStatus(`缓存加载: ${scripts.length} 个脚本`);
  return true;
}

// DOM
const scriptListEl = document.getElementById('script-list') as HTMLUListElement;
const scriptCountEl = document.getElementById('script-count') as HTMLSpanElement;
const btnRecover = document.getElementById('btn-recover') as HTMLButtonElement;
const btnCopyOriginal = document.getElementById('btn-copy-original') as HTMLButtonElement;
const btnCopyRecovered = document.getElementById('btn-copy-recovered') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const codeOriginal = document.getElementById('code-original') as HTMLPreElement;
const codeRecovered = document.getElementById('code-recovered') as HTMLPreElement;
const statsOriginal = document.getElementById('stats-original') as HTMLSpanElement;
const statsRecovered = document.getElementById('stats-recovered') as HTMLSpanElement;
const transformCountEl = document.getElementById('transform-count') as HTMLSpanElement;
const transformListEl = document.getElementById('transform-list') as HTMLDivElement;

// Sandbox
const sandboxEl = document.createElement('iframe');
sandboxEl.style.display = 'none';
sandboxEl.src = 'sandbox.html';
document.body.appendChild(sandboxEl);

let sandboxReady = false;
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'sandbox-ready') {
    sandboxReady = true;
    setStatus('就绪');
  }
});

// ── 脚本捕获 ──

if (chrome.devtools?.network) {
  chrome.devtools.network.onRequestFinished.addListener((request: any) => {
    const url = request.request.url;
    const mime = request.response?.content?.mimeType || '';
    const isJS = mime.includes('javascript') || mime.includes('ecmascript') || /\.js(\?|$)/i.test(url);
    if (!isJS) return;
    if (scripts.some(s => s.url === url)) return;

    request.getContent((body: string) => {
      if (!body || body.length < 100) return;
      addScript(url, body);
    });
  });

  chrome.devtools.network.onNavigated.addListener(() => {
    scripts.length = 0;
    activeScript = null;
    scriptListEl.innerHTML = '';
    scriptCountEl.textContent = '0';
    codeOriginal.textContent = '';
    codeRecovered.textContent = '';
    setStatus('页面已刷新，等待脚本...');
  });
}

function addScript(url: string, source: string): void {
  const script: Script = { url, source, size: source.length };
  scripts.push(script);
  scriptCountEl.textContent = String(scripts.length);

  const li = document.createElement('li');
  li.innerHTML = `<span class="script-name">${esc(shortUrl(url))}</span><span class="script-size">${formatBytes(source.length)}</span>`;
  li.title = url;
  li.addEventListener('click', () => selectScript(script, li));
  scriptListEl.appendChild(li);

  if (scripts.length === 1) selectScript(script, li);
  setStatus(`捕获: ${shortUrl(url)}`);
  saveScriptsToCache();
}

function selectScript(script: Script, li?: HTMLElement): void {
  activeScript = script;
  saveScriptsToCache();

  // 侧栏高亮
  for (const el of scriptListEl.children) {
    (el as HTMLElement).classList.remove('active');
  }
  if (li) li.classList.add('active');

  // 原始代码（先显示原始，后台格式化）
  renderCodeWithLineNumbers(codeOriginal, script.source);
  statsOriginal.textContent = formatBytes(script.size);

  // 异步格式化原始代码（等 sandbox ready）
  if ((script as any)._formatted) {
    renderCodeWithLineNumbers(codeOriginal, (script as any)._formatted);
    statsOriginal.textContent = `${formatBytes((script as any)._formatted.length)} (已格式化)`;
  } else {
    formatOriginal(script);
  }

  // 还原代码
  if (script.recovered) {
    renderCodeWithLineNumbers(codeRecovered, script.recovered);
    statsRecovered.textContent = `${formatBytes(script.recovered.length)} | ${script.transforms?.length || 0} 次转换`;
    showTransforms(script.transforms || []);
    btnCopyRecovered.disabled = false;
  } else {
    codeRecovered.textContent = '点击 "还原" 按钮处理该脚本';
    statsRecovered.textContent = '';
    transformCountEl.textContent = '0';
    transformListEl.innerHTML = '';
    btnCopyRecovered.disabled = true;
  }

  btnRecover.disabled = false;
  btnCopyOriginal.disabled = false;
}

// ── 初始化：尝试从缓存加载 ──

(async () => {
  if (scripts.length === 0) {
    await loadScriptsFromCache();
  }
})();

// ── 还原 ──

btnRecover.addEventListener('click', async () => {
  if (!activeScript) return;
  btnRecover.disabled = true;
  btnRecover.textContent = '⏳ 处理中...';
  setStatus('正在还原...');

  try {
    const result = await callSandbox('recover', { code: activeScript.source });
    activeScript.recovered = result.code;
    activeScript.transforms = result.transforms;
    activeScript.stats = result.stats;

    renderCodeWithLineNumbers(codeRecovered, result.code);
    statsRecovered.textContent = `${formatBytes(result.code.length)} | ${result.transforms.length} 次转换`;
    showTransforms(result.transforms);
    btnCopyRecovered.disabled = false;

    const s = result.stats;
    setStatus(`✅ 完成 (${s.timeTaken.toFixed(0)}ms) — ${s.resolvedCalls} 处已还原`);
    saveScriptsToCache();
  } catch (err: any) {
    setStatus(`❌ 失败: ${err.message}`);
    codeRecovered.textContent = `错误:\n${err.message}`;
  } finally {
    btnRecover.disabled = false;
    btnRecover.textContent = '还原';
  }
});

// ── 复制 ──

btnCopyOriginal.addEventListener('click', () => {
  if (activeScript) {
    navigator.clipboard.writeText(activeScript.source);
    setStatus('✅ 已复制原始代码');
  }
});

btnCopyRecovered.addEventListener('click', () => {
  if (activeScript?.recovered) {
    navigator.clipboard.writeText(activeScript.recovered);
    setStatus('✅ 已复制还原代码');
  }
});

// ── 转换报告 ──

function showTransforms(transforms: any[]): void {
  transformCountEl.textContent = String(transforms.length);
  // 全部显示（虚拟滚动可以后续优化，先全量渲染）
  transformListEl.innerHTML = transforms
    .map(t => {
      const loc = t.line > 1 ? `L${t.line}:${t.column}` : `Col:${t.column}`;
      // 截取过长的文本防止撑爆布局
      const orig = t.original.length > 120 ? t.original.slice(0, 117) + '...' : t.original;
      const replaced = t.replaced.length > 120 ? t.replaced.slice(0, 117) + '...' : t.replaced;
      return `<div class="transform-item">` +
        `<span class="transform-loc">${esc(loc)}</span>` +
        `<code class="transform-orig">${esc(orig)}</code>` +
        `<span class="transform-arrow">→</span>` +
        `<code class="transform-new">${esc(replaced)}</code>` +
      `</div>`;
    }).join('');
}

// ── Sandbox 通信 ──

function callSandbox(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!sandboxEl.contentWindow) {
      reject(new Error('Sandbox not loaded'));
      return;
    }
    const ch = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('Sandbox 超时 (60s)')), 60000);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    sandboxEl.contentWindow!.postMessage({ method, params }, '*', [ch.port2]);
  });
}

/** 等 sandbox ready 后再格式化原始代码 */
function formatOriginal(script: Script): void {
  const doFormat = () => {
    callSandbox('format', { code: script.source }).then((res: any) => {
      (script as any)._formatted = res.code;
      if (activeScript === script) {
        renderCodeWithLineNumbers(codeOriginal, res.code);
        statsOriginal.textContent = `${formatBytes(res.code.length)} (已格式化)`;
      }
    }).catch((err: any) => {
      console.warn('[OB-Recover] Format failed, using simple format:', err.message);
      // Babel 解析失败时用简单格式化（加换行缩进）
      const simple = simpleFormat(script.source);
      (script as any)._formatted = simple;
      if (activeScript === script) {
        renderCodeWithLineNumbers(codeOriginal, simple);
        statsOriginal.textContent = `${formatBytes(simple.length)} (简单格式化)`;
      }
    });
  };
  if (sandboxReady) {
    doFormat();
  } else {
    const check = setInterval(() => {
      if (sandboxReady) {
        clearInterval(check);
        doFormat();
      }
    }, 200);
    setTimeout(() => clearInterval(check), 10000);
  }
}

/** 简单格式化：在 ; } { 后插入换行，加基本缩进 */
function simpleFormat(code: string): string {
  let result = '';
  let indent = 0;
  let inStr = false;
  let strCh = '';

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    // 字符串内不处理
    if (inStr) {
      result += ch;
      if (ch === '\\' && i + 1 < code.length) { result += code[++i]; continue; }
      if (ch === strCh) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true;
      strCh = ch;
      result += ch;
      continue;
    }

    if (ch === '{') {
      indent++;
      result += ' {\n' + '    '.repeat(indent);
      continue;
    }
    if (ch === '}') {
      indent = Math.max(0, indent - 1);
      result += '\n' + '    '.repeat(indent) + '}';
      // } 后如果不是 else/catch/finally 则换行
      const next = code.slice(i + 1, i + 10).trimStart();
      if (!next.startsWith('else') && !next.startsWith('catch') && !next.startsWith('finally') && !next.startsWith(',') && !next.startsWith(')') && !next.startsWith(';')) {
        result += '\n' + '    '.repeat(indent);
      }
      continue;
    }
    if (ch === ';') {
      result += ';\n' + '    '.repeat(indent);
      continue;
    }

    result += ch;
  }
  return result;
}

// ── 工具 ──

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    // 取文件名 + query 参数（combo 类 URL 靠 query 区分）
    const pathname = u.pathname;
    const filename = pathname.split('/').pop() || pathname;
    const query = u.search ? u.search.slice(0, 60) : '';
    const display = filename + query;
    return display.length > 80 ? display.slice(0, 77) + '...' : display;
  } catch {
    return url.length > 80 ? url.slice(0, 77) + '...' : url;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderCodeWithLineNumbers(pre: HTMLPreElement, code: string): void {
  const lines = code.split('\n');
  const gutterWidth = String(lines.length).length;
  let html = '<table class="code-table"><tbody>';
  for (let i = 0; i < lines.length; i++) {
    const num = String(i + 1).padStart(gutterWidth, ' ');
    html += `<tr class="code-row" data-ln="${i}">` +
      `<td class="line-num">${num}</td>` +
      `<td class="line-code">${esc(lines[i]) || ' '}</td>` +
      `</tr>`;
  }
  html += '</tbody></table>';
  pre.innerHTML = html;
}

// ── 双击选中高亮同名标识符 ──

let selHighlights: HTMLElement[] = [];

function clearSelHighlights(): void {
  for (const el of selHighlights) {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize();
    }
  }
  selHighlights = [];
}

function highlightWordInPre(pre: HTMLPreElement, word: string): void {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![a-zA-Z0-9_$])${escaped}(?![a-zA-Z0-9_$])`, 'g');

  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

  // 从后往前处理避免偏移错位
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const tn = textNodes[i];
    const text = tn.textContent || '';
    re.lastIndex = 0;
    const parts: (string | HTMLElement)[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
      const span = document.createElement('span');
      span.className = 'sel-highlight';
      span.textContent = m[0];
      parts.push(span);
      selHighlights.push(span);
      lastIdx = m.index + m[0].length;
    }

    if (parts.length === 0) continue;
    if (lastIdx < text.length) parts.push(text.slice(lastIdx));

    const frag = document.createDocumentFragment();
    for (const p of parts) {
      frag.appendChild(typeof p === 'string' ? document.createTextNode(p) : p);
    }
    tn.parentNode!.replaceChild(frag, tn);
  }
}

// 监听选择变化
let selTimer: any = null;
document.addEventListener('selectionchange', () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    clearSelHighlights();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = sel.toString().trim();
    if (!word || word.length < 2 || word.length > 60 || /\s/.test(word)) return;

    // 在两个代码面板中都高亮
    highlightWordInPre(codeOriginal, word);
    highlightWordInPre(codeRecovered, word);
  }, 150);
});

// ── 代码搜索 ──

interface SearchState {
  input: HTMLInputElement;
  countEl: HTMLSpanElement;
  pre: HTMLPreElement;
  matches: HTMLElement[];
  current: number;
}

const searchStates: Record<string, SearchState> = {
  original: {
    input: document.getElementById('search-original') as HTMLInputElement,
    countEl: document.getElementById('search-count-original') as HTMLSpanElement,
    pre: codeOriginal,
    matches: [],
    current: -1,
  },
  recovered: {
    input: document.getElementById('search-recovered') as HTMLInputElement,
    countEl: document.getElementById('search-count-recovered') as HTMLSpanElement,
    pre: codeRecovered,
    matches: [],
    current: -1,
  },
};

function doSearch(id: string): void {
  const state = searchStates[id];
  clearSearch(id);
  const query = state.input.value;
  if (!query) { state.countEl.textContent = ''; return; }

  const text = state.pre.textContent || '';
  const lowerQ = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // 找到所有匹配位置
  const positions: number[] = [];
  let idx = 0;
  while ((idx = lowerText.indexOf(lowerQ, idx)) !== -1) {
    positions.push(idx);
    idx += query.length;
  }

  if (positions.length === 0) {
    state.countEl.textContent = '无结果';
    return;
  }

  // 用 TreeWalker 遍历文本节点，插入高亮 span
  const walker = document.createTreeWalker(state.pre, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

  // 把文本节点展平为一个连续字符串的偏移映射
  const nodeRanges: { node: Text; start: number; end: number }[] = [];
  let offset = 0;
  for (const tn of textNodes) {
    nodeRanges.push({ node: tn, start: offset, end: offset + tn.length });
    offset += tn.length;
  }

  // 从后往前替换（避免偏移错位）
  for (let pi = positions.length - 1; pi >= 0; pi--) {
    const matchStart = positions[pi];
    const matchEnd = matchStart + query.length;

    // 找到包含该匹配的文本节点
    for (let ni = 0; ni < nodeRanges.length; ni++) {
      const nr = nodeRanges[ni];
      if (nr.start <= matchStart && nr.end >= matchEnd) {
        const localStart = matchStart - nr.start;
        const localEnd = matchEnd - nr.start;
        const nodeText = nr.node.textContent || '';

        const before = nodeText.slice(0, localStart);
        const match = nodeText.slice(localStart, localEnd);
        const after = nodeText.slice(localEnd);

        const mark = document.createElement('span');
        mark.className = 'search-highlight';
        mark.textContent = match;

        const parent = nr.node.parentNode!;
        if (after) parent.insertBefore(document.createTextNode(after), nr.node.nextSibling);
        parent.insertBefore(mark, nr.node.nextSibling);
        nr.node.textContent = before;

        state.matches.unshift(mark); // unshift 因为从后往前
        break;
      }
    }
  }

  if (state.matches.length > 0) {
    state.current = 0;
    state.matches[0].classList.add('current');
    state.matches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  state.countEl.textContent = `${state.current + 1}/${state.matches.length}`;
}

function clearSearch(id: string): void {
  const state = searchStates[id];
  if (state.matches.length === 0) return;
  // 还原高亮：用文本替换 span
  for (const mark of state.matches) {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    }
  }
  state.matches = [];
  state.current = -1;
}

function navigateSearch(id: string, dir: 'prev' | 'next'): void {
  const state = searchStates[id];
  if (state.matches.length === 0) return;
  state.matches[state.current]?.classList.remove('current');
  if (dir === 'next') {
    state.current = (state.current + 1) % state.matches.length;
  } else {
    state.current = (state.current - 1 + state.matches.length) % state.matches.length;
  }
  state.matches[state.current].classList.add('current');
  state.matches[state.current].scrollIntoView({ block: 'center', behavior: 'smooth' });
  state.countEl.textContent = `${state.current + 1}/${state.matches.length}`;
}

// 绑定事件
for (const [id, state] of Object.entries(searchStates)) {
  let timer: any;
  state.input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(id), 200);
  });
  state.input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.matches.length === 0) doSearch(id);
      else navigateSearch(id, e.shiftKey ? 'prev' : 'next');
    }
    if (e.key === 'Escape') {
      state.input.value = '';
      clearSearch(id);
      state.countEl.textContent = '';
      state.input.blur();
    }
  });
}

// 导航按钮
document.querySelectorAll('.search-nav').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = (btn as HTMLElement).dataset.target!;
    const dir = (btn as HTMLElement).dataset.dir as 'prev' | 'next';
    navigateSearch(target, dir);
  });
});

// / 快捷键打开搜索
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    const recoveredVisible = codeRecovered.textContent && codeRecovered.textContent !== '点击 "还原" 按钮处理该脚本';
    const target = recoveredVisible ? searchStates.recovered : searchStates.original;
    target.input.focus();
    target.input.select();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    const recoveredVisible = codeRecovered.textContent && codeRecovered.textContent !== '点击 "还原" 按钮处理该脚本';
    const target = recoveredVisible ? searchStates.recovered : searchStates.original;
    target.input.focus();
    target.input.select();
  }
});

// ── 拖拽调节区域大小 ──

function setupResize(
  handle: HTMLElement,
  getTarget: () => HTMLElement,
  direction: 'width' | 'flex',
  min: number,
  max: number,
  siblingEl?: HTMLElement,
): void {
  let startX = 0;
  let startSize = 0;
  let siblingStartSize = 0;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    startX = e.clientX;
    const target = getTarget();
    startSize = target.getBoundingClientRect().width;
    if (siblingEl) siblingStartSize = siblingEl.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newSize = Math.max(min, Math.min(max, startSize + delta));
      if (direction === 'width') {
        target.style.width = newSize + 'px';
      } else if (siblingEl) {
        const total = startSize + siblingStartSize;
        const newSibling = total - newSize;
        target.style.flex = `0 0 ${newSize}px`;
        siblingEl.style.flex = `0 0 ${newSibling}px`;
      }
    };

    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// 侧栏拖拽
const sidebarEl = document.getElementById('sidebar') as HTMLElement;
const resizeSidebar = document.getElementById('resize-sidebar') as HTMLElement;
setupResize(resizeSidebar, () => sidebarEl, 'width', 120, 600);

// 面板间拖拽
const panelOriginal = document.getElementById('panel-original') as HTMLElement;
const panelRecovered = document.getElementById('panel-recovered') as HTMLElement;
const resizePanels = document.getElementById('resize-panels') as HTMLElement;
setupResize(resizePanels, () => panelOriginal, 'flex', 100, 2000, panelRecovered);

// 转换报告改为底部抽屉（#dock），高度与折叠由 layout.ts 管理

// ── 第四阶段：运行时表达式求值 ──

const contextMenu = document.getElementById('context-menu') as HTMLElement;
const ctxEval = document.getElementById('ctx-eval') as HTMLElement;
const ctxAddMapping = document.getElementById('ctx-add-mapping') as HTMLElement;
const evalTooltip = document.getElementById('eval-tooltip') as HTMLElement;

let lastSelectedText = '';
let lastEvalResult: { expr: string; value: string; type: string } | null = null;

// 右键菜单
codeOriginal.addEventListener('contextmenu', handleContextMenu);
codeRecovered.addEventListener('contextmenu', handleContextMenu);

function handleContextMenu(e: MouseEvent): void {
  const sel = window.getSelection();
  const text = sel?.toString().trim() || '';
  lastSelectedText = text;

  if (!text || text.length < 3 || text.length > 200) {
    contextMenu.classList.remove('visible');
    return;
  }

  e.preventDefault();
  ctxEval.classList.toggle('disabled', false);
  ctxAddMapping.classList.add('disabled');
  lastEvalResult = null;

  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
  contextMenu.classList.add('visible');
}

document.addEventListener('click', () => {
  contextMenu.classList.remove('visible');
});

// 求值
ctxEval.addEventListener('click', async () => {
  contextMenu.classList.remove('visible');
  if (!lastSelectedText) return;

  const expr = lastSelectedText;
  setStatus(`求值: ${expr.slice(0, 50)}...`);

  try {
    const result = await new Promise<any>((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        `(function(){
          try {
            var __v = eval(${JSON.stringify(expr)});
            var __t = typeof __v;
            if (__v === null) return {v:"null",t:"null"};
            if (__v === undefined) return {v:"undefined",t:"undefined"};
            if (__t === "function") return {v:__v.toString().substring(0,300),t:"function"};
            if (__t === "object") {
              try { return {v:JSON.stringify(__v,null,2).substring(0,1500),t:(__v.constructor&&__v.constructor.name)||"object"}; }
              catch(e) { return {v:String(__v),t:"object"}; }
            }
            return {v:String(__v),t:__t};
          } catch(e) { return {v:e.message,t:"error"}; }
        })()`,
        (res: any, exInfo: any) => {
          if (exInfo) resolve({ v: exInfo.value || 'eval error', t: 'error' });
          else resolve(res || { v: 'undefined', t: 'undefined' });
        },
      );
    });

    lastEvalResult = { expr, value: result.v, type: result.t };
    showEvalTooltip(expr, result);
    setStatus(`求值完成: ${result.t}`);
  } catch (err: any) {
    setStatus(`求值失败: ${err.message}`);
  }
});

function showEvalTooltip(expr: string, result: { v: string; t: string }): void {
  const isString = result.t === 'string';
  const canAdd = isString && expr.match(/_0x[a-f0-9]+\s*\(/i);

  evalTooltip.innerHTML =
    `<div class="eval-expr">${esc(expr)}</div>` +
    `<div class="eval-type">${esc(result.t)}</div>` +
    `<div class="eval-result">${esc(result.v)}</div>` +
    (canAdd
      ? `<div class="eval-actions">` +
        `<button class="eval-confirm" id="eval-add">✅ 加入映射</button>` +
        `<button class="eval-dismiss" id="eval-close">关闭</button>` +
        `</div>`
      : `<div class="eval-actions"><button class="eval-dismiss" id="eval-close">关闭</button></div>`);

  evalTooltip.classList.add('visible');

  // 定位在视口中央偏上
  evalTooltip.style.left = '50%';
  evalTooltip.style.top = '30%';
  evalTooltip.style.transform = 'translate(-50%, -50%)';

  document.getElementById('eval-close')?.addEventListener('click', () => {
    evalTooltip.classList.remove('visible');
  });

  document.getElementById('eval-add')?.addEventListener('click', async () => {
    if (!lastEvalResult || !activeScript) return;
    // 通过 sandbox 把映射加入并重新还原
    try {
      setStatus('正在用新映射重新还原...');
      const mapping = {
        [lastEvalResult.expr]: {
          callText: lastEvalResult.expr,
          value: lastEvalResult.value,
          type: 'string',
          confidence: 'manual',
          source: 'runtime-capture',
        },
      };
      const script = activeScript;
      const result = await callSandbox('recover', {
        code: script.source,
        externalMappings: mapping,
      });
      // 只有这次手动映射真正命中并替换了调用才算成功；死代码、常量折叠等其他转换不计入
      const applied = (result.transforms as any[]).filter((x) => x.source === 'runtime-capture' || x.original === expr).length;
      if (applied === 0) {
        setStatus(`❌ 映射未生效：原始脚本中没有可替换的 ${expr}（调用文本不一致，或参数不是字面量），还原代码未改动`);
        return;
      }
      script.recovered = result.code;
      script.transforms = result.transforms;
      script.stats = result.stats;
      if (activeScript === script) {
        renderCodeWithLineNumbers(codeRecovered, result.code);
        statsRecovered.textContent = `${formatBytes(result.code.length)} | ${result.transforms.length} 次转换`;
        showTransforms(result.transforms);
      }
      saveScriptsToCache();
      setStatus(`✅ 映射已加入，${expr} 已替换 ${applied} 处`);
    } catch (err: any) {
      setStatus(`❌ 重新还原失败: ${err.message}`);
    }
    evalTooltip.classList.remove('visible');
  });
}

// 右键菜单的「加入映射」也触发求值→加入
ctxAddMapping.addEventListener('click', () => {
  contextMenu.classList.remove('visible');
  ctxEval.click();
});

// Esc 关闭 tooltip
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    evalTooltip.classList.remove('visible');
    contextMenu.classList.remove('visible');
  }
});

// ─────────────────────────────────────────────────────────────
// Runtime Analysis 模块
// 通过 chrome.runtime.connect 与 Background Service Worker 通信
// Background 负责 chrome.debugger API；Panel 只发命令、收事件
// ─────────────────────────────────────────────────────────────

import type {
  DebuggerPanelMessage,
  DebuggerConnectionStatus,
  DebuggerPausedInfo,
  DiscoveredScript,
} from '../debugger/types.js';

// ── DOM refs ──
const rtTabIdEl        = document.getElementById('rt-tab-id')          as HTMLSpanElement;
const rtDebuggerEl     = document.getElementById('rt-debugger-status')  as HTMLSpanElement;
const rtRuntimeEl      = document.getElementById('rt-runtime-status')   as HTMLSpanElement;
const rtPauseEl        = document.getElementById('rt-pause-status')     as HTMLSpanElement;
const rtScriptIdEl     = document.getElementById('rt-script-id')        as HTMLSpanElement;
const rtFunctionEl     = document.getElementById('rt-function-name')    as HTMLSpanElement;
const rtLocationEl     = document.getElementById('rt-location')         as HTMLSpanElement;
const rtLogEl          = document.getElementById('runtime-log')         as HTMLDivElement;

const btnRtConnect     = document.getElementById('btn-rt-connect')     as HTMLButtonElement;
const btnRtDisconnect  = document.getElementById('btn-rt-disconnect')  as HTMLButtonElement;
const btnRtResume      = document.getElementById('btn-rt-resume')      as HTMLButtonElement;
const btnRtClear       = document.getElementById('btn-rt-clear')       as HTMLButtonElement;

// ── State ──
const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
let rtPort: chrome.runtime.Port | null = null;
let rtStatus: DebuggerConnectionStatus = 'disconnected';
let rtRuntimeEnabled = false;
let rtIsPaused = false;

// ── 初始化：连接到 Background ──
rtTabIdEl.textContent = String(inspectedTabId);
connectPort();

function connectPort(): void {
  if (rtPort) {
    try { rtPort.disconnect(); } catch { /* ignore */ }
    rtPort = null;
  }

  rtPort = chrome.runtime.connect({ name: `ob-recover-panel-${inspectedTabId}` });

  rtPort.onMessage.addListener((msg: any) => {
    if (msg.type === 'debugger-event') {
      handleDebuggerEvent(msg as DebuggerPanelMessage);
    } else if (msg.type === 'pong') {
      // keep-alive confirmed
    } else if (typeof msg.type === 'string' && msg.type.startsWith('manual-capture-') && msg.type.endsWith('-response')) {
      manualPanel?.handleResponse(msg);
    }
  });

  rtPort.onDisconnect.addListener(() => {
    // Service Worker 被终止；1 秒后重连
    rtPort = null;
    rtLog('warn', 'Background 已断开，正在重连...');
    setTimeout(connectPort, 1000);
  });

  // 获取当前状态
  rtPort.postMessage({ type: 'debugger-get-status', tabId: inspectedTabId });
}

// 面板关闭：终止分析 Worker，拒绝全部在飞行与排队任务
window.addEventListener('unload', () => { analysisClient.dispose(); });

// ── 事件处理 ──
function handleDebuggerEvent(msg: DebuggerPanelMessage): void {
  const ev = msg.event;

  switch (ev.kind) {
    case 'status-changed': {
      rtStatus = ev.status;
      rtRuntimeEnabled = (ev.status === 'connected');
      updateRtStatusUI();
      if (ev.error) rtLog('error', `状态: ${ev.status} — ${ev.error}`);
      else          rtLog('info', `状态: ${ev.status}`);
      break;
    }

    case 'paused': {
      rtIsPaused = true;
      updateRtPauseUI(ev.info);
      manualPanel?.onPaused(ev.info);
      break;
    }

    case 'resumed': {
      rtIsPaused = false;
      rtPauseEl.textContent = '运行中';
      rtPauseEl.className = 'rt-value rt-badge running';
      rtScriptIdEl.textContent = '—';
      rtFunctionEl.textContent = '—';
      rtLocationEl.textContent = '—';
      btnRtResume.disabled = true;
      rtLog('event', '▶ 执行已恢复');
      manualPanel?.onResumed();
      break;
    }

    case 'script-parsed': {
      const url = ev.info.url ? ev.info.url.split('/').pop() || ev.info.url : '(inline)';
      rtLog('event', `脚本已解析: [${ev.info.scriptId}] ${url}`);
      break;
    }

    case 'context-created': {
      rtRuntimeEnabled = true;
      rtRuntimeEl.textContent = '已启用';
      rtRuntimeEl.className = 'rt-value rt-badge enabled';
      rtLog('event', `执行上下文已创建: ${ev.context?.origin || ''}`);
      break;
    }

    case 'log': {
      rtLog(ev.level, ev.message);
      break;
    }

    case 'script-discovered': {
      // Phase 2: 新脚本已获取源码
      handleScriptDiscovered(ev.script);
      break;
    }

    case 'capture-event': {
      handleCaptureEvent(ev.event);
      break;
    }

    case 'capture-state': {
      handleCaptureState(ev);
      break;
    }

    case 'mode-changed': {
      manualPanel?.onModeChanged(ev.mode);
      break;
    }

    case 'manual-capture': {
      manualPanel?.onRecord(ev.record);
      break;
    }
  }
}

function updateRtStatusUI(): void {
  const labels: Record<DebuggerConnectionStatus, string> = {
    disconnected: '未连接',
    connecting:   '连接中...',
    connected:    '已连接',
    error:        '错误',
  };
  rtDebuggerEl.textContent = labels[rtStatus] || rtStatus;
  rtDebuggerEl.className = `rt-value rt-badge ${rtStatus}`;

  const isConnected = rtStatus === 'connected';
  btnRtConnect.disabled    = isConnected || rtStatus === 'connecting';
  btnRtDisconnect.disabled = !isConnected;

  if (isConnected) {
    rtRuntimeEl.textContent = '已启用';
    rtRuntimeEl.className   = 'rt-value rt-badge enabled';
  } else {
    rtRuntimeEl.textContent = '—';
    rtRuntimeEl.className   = 'rt-value rt-badge';
    rtIsPaused = false;
    manualPanel?.onResumed();
    rtPauseEl.textContent = '—';
    rtPauseEl.className = 'rt-value rt-badge';
    btnRtResume.disabled = true;
  }
}

function updateRtPauseUI(info: DebuggerPausedInfo): void {
  rtPauseEl.textContent = `已暂停 (${info.reason})`;
  rtPauseEl.className = 'rt-value rt-badge paused';

  const topFrame = info.callFrames[0];
  if (topFrame) {
    rtScriptIdEl.textContent = topFrame.location.scriptId || '—';
    rtFunctionEl.textContent = topFrame.functionName || '(anonymous)';
    rtLocationEl.textContent =
      `L${(topFrame.location.lineNumber + 1)}:C${topFrame.location.columnNumber}`;
  }

  btnRtResume.disabled = false;

  // 打印调用栈
  rtLog('paused', `⏸ 已暂停 (${info.reason})`);
  info.callFrames.forEach((cf, i) => {
    const fn = cf.functionName || '(anonymous)';
    const loc = `L${cf.location.lineNumber + 1}:C${cf.location.columnNumber}`;
    const url = cf.url ? cf.url.split('/').pop() || cf.url : `script:${cf.location.scriptId}`;
    rtLog('info', `  ${i === 0 ? '▶' : ' '} ${fn} @ ${url} ${loc}`);
  });
}

// ── 按钮事件 ──
btnRtConnect.addEventListener('click', () => {
  if (!rtPort) { connectPort(); return; }
  rtLog('info', `正在连接 tab ${inspectedTabId}...`);
  rtPort.postMessage({ type: 'debugger-connect', tabId: inspectedTabId });
});

btnRtDisconnect.addEventListener('click', () => {
  if (!rtPort) return;
  rtPort.postMessage({ type: 'debugger-disconnect', tabId: inspectedTabId });
});

btnRtResume.addEventListener('click', () => {
  if (!rtPort || !rtIsPaused) return;
  rtPort.postMessage({ type: 'debugger-resume', tabId: inspectedTabId });
});

btnRtClear.addEventListener('click', () => {
  rtLogEl.innerHTML = '';
});

// ── 日志工具 ──
function rtLog(level: 'info' | 'warn' | 'error' | 'paused' | 'event', message: string): void {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:` +
               `${String(now.getMinutes()).padStart(2, '0')}:` +
               `${String(now.getSeconds()).padStart(2, '0')}`;

  const entry = document.createElement('div');
  entry.className = `rt-log-entry ${level}`;
  entry.innerHTML =
    `<span class="rt-time">${time}</span>` +
    `<span class="rt-msg">${esc(message)}</span>`;

  rtLogEl.appendChild(entry);

  // 保留最多 300 条
  while (rtLogEl.children.length > 300) {
    rtLogEl.removeChild(rtLogEl.firstChild!);
  }

  // 滚动到底部
  rtLogEl.scrollTop = rtLogEl.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: Decoder Discovery
// ═══════════════════════════════════════════════════════════════════════════

const decTotalEl      = document.getElementById('dec-total')      as HTMLSpanElement;
const decAnalyzedEl   = document.getElementById('dec-analyzed')   as HTMLSpanElement;
const decCandidatesEl = document.getElementById('dec-candidates') as HTMLSpanElement;
const decHighEl       = document.getElementById('dec-high')       as HTMLSpanElement;
const decCallsEl      = document.getElementById('dec-calls')      as HTMLSpanElement;
const decoderListEl   = document.getElementById('decoder-list')   as HTMLDivElement;
const btnRefreshEl    = document.getElementById('btn-refresh-discovery') as HTMLButtonElement;

btnRefreshEl.addEventListener('click', () => { void refreshDecoderDiscovery(); });

/**
 * 处理新发现的脚本（已获取源码）
 *
 * Phase 4.7：静态分析改为在 Worker 中异步执行。本函数不再阻塞主线程，
 * 记账、统计与渲染的代码与之前逐行一致，只是移到分析结果返回之后。
 */
function handleScriptDiscovered(script: DiscoveredScript): void {
  discoveredScripts.set(script.scriptId, script);
  retiredScriptIds.delete(script.scriptId);
  scheduleValidationStats();
  rtLog('info', `发现脚本 [${script.scriptId}]: ${script.url || '(inline)'}`);

  // 找到对应的 Script 对象并同步字段
  const existingScript = scripts.find(s => s.url === script.url);
  if (existingScript) {
    existingScript.scriptId = script.scriptId;
    existingScript.startLine = script.startLine;
    existingScript.startColumn = script.startColumn;
  }

  if (!script.source) {
    rtLog('warn', `脚本 ${script.scriptId} 源码为空`);
    updateDecoderStats();
    return;
  }

  // 静态分析（Worker 线程；同一 scriptId 只分析一次）
  void analyzeAndMerge(script, false);
}

/**
 * 取回分析结果并合并。结果回来时校验脚本身份，避免页面刷新后把旧结果写进新状态。
 */
async function analyzeAndMerge(script: DiscoveredScript, force: boolean): Promise<void> {
  const outcome = await analysisClient.analyze(
    { scriptId: script.scriptId, source: script.source as string, scriptUrl: script.url },
    { force },
  );

  // 陈旧结果：脚本已被重置或被替换，丢弃
  if (discoveredScripts.get(script.scriptId) !== script) return;

  if (outcome.kind === 'error') {
    // Worker 失败 / 超时 / 取消：显式失败，绝不标记为已分析
    script.analysisError = outcome.error;
    rtLog('error', `脚本 ${script.scriptId} 分析失败: ${outcome.error}`);
    updateDecoderStats();
    return;
  }

  const result = outcome.result;
  script.analyzed = true;
  script.discoveryResult = result;

  if (!result.analyzed) {
    script.analysisError = result.error;
    rtLog('error', `脚本 ${script.scriptId} 分析失败: ${result.error}`);
    updateDecoderStats();
    return;
  }

  // 合并候选（沿用原有对象身份，candidateScript 仍在面板侧建立）
  for (const cand of result.candidates) {
    allCandidates.push(cand);
    candidateScript.set(cand, script);
  }

  rtLog('info', `分析完成: ${result.candidates.length} 个候选解码器`);
  updateDecoderStats();
  renderDecoderList();
}

/**
 * 更新统计信息
 */
function updateDecoderStats(): void {
  const analyzed = Array.from(discoveredScripts.values()).filter(s => s.analyzed).length;
  const high = allCandidates.filter(c => c.confidence === 'high').length;
  const totalCalls = allCandidates.reduce((sum, c) => sum + c.callSites.length, 0);

  decTotalEl.textContent = String(discoveredScripts.size);
  decAnalyzedEl.textContent = String(analyzed);
  decCandidatesEl.textContent = String(allCandidates.length);
  decHighEl.textContent = String(high);
  decCallsEl.textContent = String(totalCalls);
}

/**
 * 渲染候选解码器列表
 */
function renderDecoderList(): void {
  decoderListEl.innerHTML = '';

  if (allCandidates.length === 0) {
    decoderListEl.innerHTML = '<div class="empty-state">未发现候选解码函数</div>';
    return;
  }

  // 按置信度排序
  const sorted = [...allCandidates].sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[b.confidence] - order[a.confidence];
  });

  for (const cand of sorted) {
    const card = document.createElement('div');
    card.className = 'decoder-card';

    const header = document.createElement('div');
    header.className = 'decoder-card-header';
    header.onclick = () => card.classList.toggle('open');

    const left = document.createElement('div');
    left.className = 'decoder-card-left';

    const name = document.createElement('span');
    name.className = 'decoder-name';
    name.textContent = cand.name || '(anonymous)';

    const badges = document.createElement('div');
    badges.className = 'decoder-badges';

    const confBadge = document.createElement('span');
    confBadge.className = `decoder-badge ${cand.confidence}`;
    confBadge.textContent = cand.confidence;

    const callBadge = document.createElement('span');
    callBadge.className = 'decoder-badge';
    callBadge.textContent = `${cand.callCount} calls`;
    callBadge.style.background = '#3a3a5a';
    callBadge.style.color = '#a0a0e0';

    badges.appendChild(confBadge);
    badges.appendChild(callBadge);

    left.appendChild(name);
    left.appendChild(badges);

    const toggle = document.createElement('span');
    toggle.className = 'decoder-toggle';
    toggle.textContent = '▶';

    header.appendChild(left);
    header.appendChild(toggle);

    const body = document.createElement('div');
    body.className = 'decoder-card-body';

    // 基本信息
    body.innerHTML += `
      <div class="decoder-info-row"><strong>类型:</strong> ${cand.kind}</div>
      <div class="decoder-info-row"><strong>参数:</strong> ${cand.paramCount} (${cand.paramNames.join(', ')})</div>
      <div class="decoder-info-row"><strong>位置:</strong> ${cand.location.startLine}:${cand.location.startColumn}</div>
    `;

    // 证据
    if (cand.evidence.length > 0) {
      const evSection = document.createElement('div');
      evSection.className = 'decoder-evidence';
      evSection.innerHTML = '<div class="decoder-evidence-title">识别依据:</div>';
      const evList = document.createElement('ul');
      evList.className = 'evidence-list';
      for (const ev of cand.evidence) {
        const li = document.createElement('li');
        li.textContent = ev;
        evList.appendChild(li);
      }
      evSection.appendChild(evList);
      body.appendChild(evSection);
    }

    // 依赖
    if (cand.dependencies.length > 0) {
      const depsSection = document.createElement('div');
      depsSection.className = 'decoder-deps';
      depsSection.innerHTML = '<div class="decoder-evidence-title">依赖:</div>';
      for (const dep of cand.dependencies) {
        const depItem = document.createElement('div');
        depItem.className = 'dep-item';
        depItem.innerHTML = `<code>${dep.name}</code> — ${dep.description}`;
        depsSection.appendChild(depItem);
      }
      body.appendChild(depsSection);
    }

    // 调用位置（最多显示 5 个）
    if (cand.callSites.length > 0) {
      const callsSection = document.createElement('div');
      callsSection.className = 'decoder-calls';
      callsSection.innerHTML = `<div class="decoder-evidence-title">调用位置 (${cand.callSites.length}):</div>`;
      const limit = Math.min(5, cand.callSites.length);
      for (let i = 0; i < limit; i++) {
        const site = cand.callSites[i];
        const callItem = document.createElement('div');
        callItem.className = 'call-item';
        callItem.innerHTML = `${site.location.startLine}:${site.location.startColumn} — <code>${site.callText}</code>`;
        callsSection.appendChild(callItem);
      }
      if (cand.callSites.length > 5) {
        callsSection.innerHTML += `<div class="call-item" style="color:#606060">... 还有 ${cand.callSites.length - 5} 个</div>`;
      }
      body.appendChild(callsSection);
    }

    card.appendChild(header);
    card.appendChild(body);
    decoderListEl.appendChild(card);
  }
}

/**
 * 刷新：重新分析所有已获取源码的脚本（强制重新分析，仍走同一队列）
 */
async function refreshDecoderDiscovery(): Promise<void> {
  allCandidates.length = 0;
  updateDecoderStats();
  renderDecoderList();
  for (const script of discoveredScripts.values()) {
    if (script.source) {
      script.analyzed = false;
      script.analysisError = undefined;
      await analyzeAndMerge(script, true);
    }
  }
  updateDecoderStats();
  renderDecoderList();
  rtLog('info', '已刷新解码器发现列表');
  scheduleValidationStats();
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Runtime Capture（运行时捕获解码函数的真实参数与返回值）
// 页面传来的值一律视为不可信：只用 textContent 渲染，绝不用 innerHTML
// ═══════════════════════════════════════════════════════════════════════════

const capStatusEl  = document.getElementById('cap-status')  as HTMLSpanElement;
const capBpsEl     = document.getElementById('cap-bps')     as HTMLSpanElement;
const capHitsEl    = document.getElementById('cap-hits')    as HTMLSpanElement;
const capSuccessEl = document.getElementById('cap-success') as HTMLSpanElement;
const capFailedEl  = document.getElementById('cap-failed')  as HTMLSpanElement;
const capNoticeEl  = document.getElementById('cap-notice')  as HTMLDivElement;
const capListEl    = document.getElementById('cap-list')    as HTMLDivElement;
const btnCapStart  = document.getElementById('btn-cap-start') as HTMLButtonElement;
const btnCapStop   = document.getElementById('btn-cap-stop')  as HTMLButtonElement;
const btnCapClear  = document.getElementById('btn-cap-clear') as HTMLButtonElement;
const capUnstableEl = document.getElementById('cap-unstable') as HTMLSpanElement;
const capMinConfEl  = document.getElementById('cap-min-confidence') as HTMLSelectElement;

const capVerifiedEl = document.getElementById('cap-verified') as HTMLSpanElement;
const capVUnstableEl = document.getElementById('cap-v-unstable') as HTMLSpanElement;
const capVFailedEl = document.getElementById('cap-v-failed') as HTMLSpanElement;
const capVInsufficientEl = document.getElementById('cap-v-insufficient') as HTMLSpanElement;
const capVPendingEl = document.getElementById('cap-v-pending') as HTMLSpanElement;
const capVTotalEl = document.getElementById('cap-v-total') as HTMLSpanElement;
const capDryrunEl = document.getElementById('cap-dryrun') as HTMLDivElement;
const btnCapDryrun = document.getElementById('btn-cap-dryrun') as HTMLButtonElement;
const capApplyResultEl = document.getElementById('cap-apply-result') as HTMLDivElement;
const btnCapApply = document.getElementById('btn-cap-apply') as HTMLButtonElement;
// Phase 3.2：结果验证。只读 capTable 与已发现脚本，不发送任何调试器命令
const VALIDATION_LABEL: Record<ValidationStatus, string> = { pending: '等待验证', verified: '已验证', unstable: '不稳定', failed: '验证失败', insufficient: '证据不足' };
let capIsActive = false;
let capValidationErrorLogged = false;
// 页面刷新后，刷新前发现的脚本不再是「当前脚本」：这些 scriptId 上的旧捕获记录会被判为 stale-script
const retiredScriptIds = new Set<string>();

function currentValidationScripts(): ValidationScript[] {
  const out: ValidationScript[] = [];
  for (const s of discoveredScripts.values()) {
    if (!s.source || retiredScriptIds.has(s.scriptId)) continue;
    out.push({ scriptId: s.scriptId, source: s.source, url: s.url, startLine: s.startLine, startColumn: s.startColumn });
  }
  return out;
}

const capTable = new Map<string, DecoderCapture>();
// Phase 4.5：手动断点模式的求值记录单独存放（handleCaptureState 会整体重建 capTable），验证和替换时再合并
let manualPanel: ManualPanel | null = null;
function allCaptures(): DecoderCapture[] {
  return Array.from(capTable.values()).concat(manualPanel ? manualPanel.getCaptures() : []);
}

/** 验证统计的唯一入口：面板上所有验证数量都来自这次 Phase 3.2 验证结果，不使用引擎的 getStability 统计 */
function runValidation() {
  const { report, stats } = computeValidationStats(allCaptures(), currentValidationScripts(), { captureActive: capIsActive });
  capVerifiedEl.textContent = String(stats.byStatus.verified);
  capVUnstableEl.textContent = String(stats.byStatus.unstable);
  capVFailedEl.textContent = String(stats.byStatus.failed);
  capVInsufficientEl.textContent = String(stats.byStatus.insufficient);
  capVPendingEl.textContent = String(stats.byStatus.pending);
  capVTotalEl.textContent = String(stats.groups) + (stats.consistent ? '' : '（统计不一致！）');
  capVTotalEl.title = `验证组 ${stats.groups}，对应捕获记录 ${stats.records} 条；单次观测通过 ${stats.byEvidence.single} 组，多次一致观测通过 ${stats.byEvidence.multiple} 组，脚本已过期 ${stats.staleGroups} 组`;
  return report;
}

// 统计不依赖 requestAnimationFrame：面板被切走（例如 DevTools 跳到 Sources）时 rAF 不触发，但统计仍要更新
let valStatsTimer: number | null = null;
function scheduleValidationStats(): void {
  if (valStatsTimer !== null) return;
  valStatsTimer = window.setTimeout(() => {
    valStatsTimer = null;
    try {
      runValidation();
    } catch (e: any) {
      if (!capValidationErrorLogged) {
        capValidationErrorLogged = true;
        rtLog('error', `结果验证出错：${e?.message ?? e}`);
      }
    }
  }, 150);
}
const capExpanded = new Set<string>();
const CAP_RENDER_LIMIT = 300;
let capRenderQueued = false;
let capPollTimer: number | null = null;
// 稳定性：按 key 关联对应参数组合的 stable 判定（由 background 的 getStability 提供）
let capStabilityFull: import('../debugger/capture-engine.js').StabilityRecord[] = [];
// 自动捕获门槛：默认 high，可切换 medium
let capMinConfidence: 'high' | 'medium' = 'high';

btnCapStart.addEventListener('click', startRuntimeCapture);
btnCapStop.addEventListener('click', () => {
  rtPort?.postMessage({ type: 'capture-stop', tabId: inspectedTabId });
});
btnCapClear.addEventListener('click', () => {
  capTable.clear();
  capExpanded.clear();
  capStabilityFull = [];
  capDryrunEl.hidden = true;
  rtPort?.postMessage({ type: 'capture-clear', tabId: inspectedTabId });
  scheduleCapRender();
});
capMinConfEl.addEventListener('change', () => {
  capMinConfidence = capMinConfEl.value === 'medium' ? 'medium' : 'high';
  rtLog('info', `捕获门槛已切换为 ${capMinConfidence}（下次开始捕获时生效）`);
});

// 面板重新打开时同步引擎已有状态
manualPanel = initManualPanel({
  tabId: inspectedTabId,
  getPort: () => rtPort,
  getScript: (id) => discoveredScripts.get(id),
  isRetired: (id) => retiredScriptIds.has(id),
  getMinConfidence: () => capMinConfidence,
  log: (level, message) => rtLog(level, message),
  onCapturesChanged: () => scheduleCapRender(),
});
rtPort?.postMessage({ type: 'capture-get-state', tabId: inspectedTabId });

function setCapNotice(text: string): void {
  capNoticeEl.textContent = text;
  capNoticeEl.hidden = text === '';
}

function startRuntimeCapture(): void {
  if (rtStatus !== 'connected') {
    setCapNotice('调试器尚未连接，无法开始捕获。请先点击“连接”；若连接失败，请查看上方日志中的具体错误。');
    return;
  }
  const astCache = new Map<string, BabelFile>();
  const targets: CaptureTarget[] = [];
  const unusable: string[] = [];
  for (const cand of allCandidates) {
    if (!passesConfidence(cand.confidence, capMinConfidence)) continue;
    const script = candidateScript.get(cand);
    if (!cand.name || !script || !script.source) {
      unusable.push((cand.name || '(anonymous)') + ': 缺少名称或脚本源码');
      continue;
    }
    let ast = astCache.get(script.scriptId);
    if (!ast) {
      try {
        ast = parseCode(script.source);
        astCache.set(script.scriptId, ast);
      } catch (e: any) {
        unusable.push(cand.name + ': 源码解析失败 ' + (e?.message ?? e));
        continue;
      }
    }
    const plan = computeCapturePlan(script.source, cand.location.start, ast);
    targets.push({ scriptId: script.scriptId, scriptUrl: script.url, functionName: cand.name, plan });
  }
  if (targets.length === 0) {
    setCapNotice(`没有可捕获的候选解码函数（当前门槛：${capMinConfidence}）。` + (unusable.length ? '\n' + unusable.join('\n') : '请先让 Decoder Discovery 发现候选（连接后刷新页面），或把捕获门槛切换为 medium。'));
    return;
  }
  setCapNotice(unusable.length ? '未纳入捕获：\n' + unusable.join('\n') : '');
  rtLog('info', `开始运行时捕获：${targets.length} 个候选（门槛 ${capMinConfidence}）`);
  rtPort?.postMessage({ type: 'capture-start', tabId: inspectedTabId, targets, autoCaptureMinConfidence: capMinConfidence });
}

/** high > medium > low 的置信度比较 */
function passesConfidence(conf: 'high' | 'medium' | 'low', min: 'high' | 'medium' | 'low'): boolean {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[conf] >= rank[min];
}

function handleCaptureEvent(e: CaptureEvent): void {
  switch (e.kind) {
    case 'capture':
      capTable.set(e.capture.key, e.capture);
      scheduleCapRender();
      break;
    case 'log':
      rtLog(e.level, e.message);
      break;
    case 'limit-reached':
      rtLog('warn', `捕获达到上限 (${e.limit})，已自动停止`);
      setCapNotice(`捕获达到上限 (${e.limit})，已自动停止并移除本插件的断点。可清空记录后重新开始。`);
      break;
    case 'foreign-pause':
      rtLog('warn', '检测到非本插件触发的暂停（例如你自己的断点，或页面自带的 debugger 反调试语句）：已保留，不会自动恢复，请在 DevTools 中手动继续或点击“▶ 恢复”');
      break;
  }
}

function handleCaptureState(ev: Extract<DebuggerPanelMessage['event'], { kind: 'capture-state' }>): void {
  capTable.clear();
  for (const c of ev.captures) capTable.set(c.key, c);
  capStabilityFull = ev.stability ?? [];
  if (ev.autoCaptureMinConfidence) capMinConfidence = ev.autoCaptureMinConfidence === 'medium' ? 'medium' : 'high';

  capIsActive = ev.active;
  manualPanel?.syncMode(ev.active);
  capStatusEl.textContent = ev.active ? '正在捕获' : '已停止';
  capStatusEl.className = 'rt-value rt-badge ' + (ev.active ? 'enabled' : 'running');
  capBpsEl.textContent = String(ev.breakpoints);
  capHitsEl.textContent = String(ev.stats?.hits ?? 0);
  capSuccessEl.textContent = String(ev.stats?.success ?? 0);
  capFailedEl.textContent = String(ev.stats?.failed ?? 0);
  capUnstableEl.textContent = String(capStabilityFull.filter((s) => !s.stable).length);
  btnCapStart.disabled = ev.active;
  btnCapStop.disabled = !ev.active;

  if (ev.skipped !== undefined || ev.errors !== undefined) {
    const lines: string[] = [];
    for (const s of ev.skipped ?? []) lines.push(`跳过 ${s.functionName}: ${s.reason}`);
    for (const err of ev.errors ?? []) lines.push(`断点设置失败: ${err}`);
    if (ev.active && (ev.breakpoints === 0)) lines.push('没有成功设置任何断点，捕获不会产生数据。');
    setCapNotice(lines.join('\n'));
  }
  if (ev.resetReason) {
    rtLog('warn', `运行时捕获已重置: ${ev.resetReason}`);
    if (ev.resetReason.startsWith('page')) for (const id of discoveredScripts.keys()) retiredScriptIds.add(id);
    if (ev.resetReason.startsWith('page')) manualPanel?.onPageReset();
    // 页面已刷新：在飞行与排队的分析任务连同去重缓存一并作废，结果不再合并
    if (ev.resetReason.startsWith('page')) analysisClient.cancelAll('页面已刷新，分析任务已取消');
    if (!ev.active) {
      setCapNotice('捕获已重置：' + ev.resetReason);
    }
    // 页面刷新后 scriptId 变化，候选需重新发现；但捕获仍在进行时保留候选列表
    if (ev.resetReason.startsWith('page') && !ev.active) {
      discoveredScripts.clear();
      allCandidates.length = 0;
      updateDecoderStats();
      renderDecoderList();
    }
  }

  // 捕获中每秒同步一次统计；停止后不再轮询
  if (ev.active && capPollTimer === null) {
    capPollTimer = window.setInterval(() => {
      rtPort?.postMessage({ type: 'capture-get-state', tabId: inspectedTabId });
    }, 1000);
  } else if (!ev.active && capPollTimer !== null) {
    window.clearInterval(capPollTimer);
    capPollTimer = null;
  }
  scheduleCapRender();
}

function scheduleCapRender(): void {
  scheduleValidationStats();
  if (capRenderQueued) return;
  capRenderQueued = true;
  requestAnimationFrame(renderCaptureList);
}

function fmtVal(v?: RuntimeValue): string {
  if (!v) return '—';
  if (v.type === 'undefined') return 'undefined';
  if (v.type === 'null') return 'null';
  if (v.type === 'string') return JSON.stringify(v.value) + (v.truncated ? ' …(已截断)' : '');
  if (v.unserializable) return v.unserializable;
  if (v.value !== undefined) return String(v.value);
  return v.description ?? v.type;
}

function fmtPos(p: { lineNumber: number; columnNumber: number }): string {
  return p.lineNumber < 0 ? '未知' : `${p.lineNumber + 1}:${p.columnNumber + 1}`;
}

function capRow(label: string, text: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'decoder-info-row';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const span = document.createElement('span');
  span.textContent = text;
  row.appendChild(strong);
  row.appendChild(span);
  return row;
}

function appendValidationRows(body: HTMLElement, g: GroupValidation): void {
  body.appendChild(capRow('验证状态:', `${VALIDATION_LABEL[g.status]}（${g.status}）`));
  for (const r of g.reasons) body.appendChild(capRow(g.status === 'verified' ? '通过依据:' : '原因:', r.message));
  for (const w of g.warnings) body.appendChild(capRow('提示:', w.message));
  body.appendChild(capRow('验证次数:', `成功 ${g.observations} 次，失败 ${g.failedObservations} 次`));
  body.appendChild(capRow('参数样本:', '(' + g.arguments.map(fmtVal).join(', ') + ')'));
  body.appendChild(capRow('返回值样本:', g.returnSamples.map((s) => `${fmtVal(s.value)} ×${s.count}`).join(' | ') || '—'));
  body.appendChild(capRow('冲突:', g.conflict ? `是（${g.distinctReturns} 个不同返回值）` : '否'));
  const locs = g.callLocations.slice(0, 8).map(fmtPos).join(', ');
  body.appendChild(capRow('全部调用位置:', g.callLocations.length === 0 ? '未知' : locs + (g.callLocations.length > 8 ? ` …共 ${g.callLocations.length} 个` : '') + (g.callLocationsTruncated ? '（位置列表被截断，不是全部）' : '')));
}

btnCapDryrun.addEventListener('click', async () => {
  try {
    const scripts = currentValidationScripts();
    const report = validateCaptures(allCaptures(), scripts, { captureActive: capIsActive });
    const r = await dryRunReplacements(report, scripts);
    const lines: string[] = [`替换前检查（dry-run，只检查，不修改任何代码）：可替换候选 ${r.summary.candidates} 个调用点，拒绝 ${r.summary.rejections} 项`];
    for (const c of r.candidates.slice(0, 5)) lines.push(`  可替换 ${c.callText} → ${c.replacement}（${fmtPos(c.position)}，已观测 ${c.observations} 次）`);
    if (r.candidates.length > 5) lines.push(`  …还有 ${r.candidates.length - 5} 个候选`);
    for (const [code, n] of Object.entries(r.summary.byReason)) lines.push(`  拒绝 ${n} 项：${code}`);
    for (const rj of r.rejections.slice(0, 5)) lines.push(`  ${rj.functionName}${rj.position ? ' ' + fmtPos(rj.position) : ''}：${(rj.reasons[1] ?? rj.reasons[0])?.message ?? ''}`);
    if (r.candidates.some((c) => c.textKeyConflicts.length > 0)) lines.push('注意：部分候选存在同文本但没有证据支持的调用，后续替换必须按位置进行，不能按调用文本');
    capDryrunEl.textContent = lines.join('\n');
    capDryrunEl.style.whiteSpace = 'pre-wrap';
    capDryrunEl.hidden = false;
  } catch (e: any) {
    capDryrunEl.textContent = `替换前检查出错：${e?.message ?? e}`;
    capDryrunEl.hidden = false;
  }
});

// Phase 4: 应用已验证的替换
btnCapApply.addEventListener('click', async () => {
  if (!activeScript) {
    capApplyResultEl.textContent = '请先选择一个脚本';
    capApplyResultEl.hidden = false;
    return;
  }

  try {
    btnCapApply.disabled = true;
    btnCapApply.textContent = '⏳ 应用中...';
    capApplyResultEl.textContent = '正在执行验证和替换...';
    capApplyResultEl.hidden = false;

    // 重新验证并执行 dry-run（不能复用过期结果）
    const scripts = currentValidationScripts();
    const report = validateCaptures(allCaptures(), scripts, { captureActive: capIsActive });
    const dryRunResult = await dryRunReplacements(report, scripts);

    // activeScript.scriptId 按 URL 回填，存在竞态，页面刷新后也会过期：这里在当前有效的已发现脚本里按 URL + 源码完全相等重新解析，恰好命中一个才继续，否则不做任何替换
    const resolvedScripts = scripts.filter((s) => s.url === activeScript!.url && s.source === activeScript!.source);
    if (resolvedScripts.length !== 1) {
      capApplyResultEl.textContent = resolvedScripts.length === 0
        ? '当前选中的脚本没有对应的运行时脚本（URL 与源码都相同的已发现脚本）：可能调试器未连接、页面已刷新，或脚本内容与运行时不一致。不做任何替换，请连接调试器并刷新页面后重试。'
        : `当前选中的脚本对应 ${resolvedScripts.length} 个运行时脚本（URL 与源码都相同），无法唯一确定，不做任何替换。`;
      capApplyResultEl.style.whiteSpace = 'pre-wrap';
      capApplyResultEl.hidden = false;
      return;
    }
    activeScript.scriptId = resolvedScripts[0].scriptId;
    activeScript.startLine = resolvedScripts[0].startLine;
    activeScript.startColumn = resolvedScripts[0].startColumn;

    // 找到当前脚本对应的候选
    const scriptCandidates = dryRunResult.candidates.filter((c) => c.scriptId === activeScript!.scriptId);
    const scriptRejections = dryRunResult.rejections.filter((r) => r.scriptId === activeScript!.scriptId);

    if (scriptCandidates.length === 0) {
      const lines: string[] = [`当前脚本没有可替换的候选（${scriptRejections.length} 个被拒绝）`];
      if (scriptRejections.length > 0) {
        lines.push('');
        lines.push('拒绝原因：');
        const reasonCounts = new Map<string, number>();
        for (const r of scriptRejections) {
          for (const reason of r.reasons) {
            reasonCounts.set(reason.code, (reasonCounts.get(reason.code) || 0) + 1);
          }
        }
        for (const [code, count] of reasonCounts.entries()) {
          lines.push(`  ${code}: ${count} 项`);
        }
      }
      capApplyResultEl.textContent = lines.join('\n');
      capApplyResultEl.style.whiteSpace = 'pre-wrap';
      capApplyResultEl.hidden = false;
      return;
    }

    // 准备 ValidationScript
    const validationScript = {
      scriptId: activeScript.scriptId,
      source: activeScript.source,
      url: activeScript.url,
      startLine: activeScript.startLine,
      startColumn: activeScript.startColumn,
    };

    // 调用 sandbox 的 apply-verified 方法
    const result = await callSandbox('apply-verified', {
      dryRunResult,
      script: validationScript,
    });

    // 更新 activeScript.recovered
    activeScript.recovered = result.code;

    // 渲染还原代码
    renderCodeWithLineNumbers(codeRecovered, result.code);
    statsRecovered.textContent = `${formatBytes(result.code.length)} | Phase 4 位置级替换`;
    btnCopyRecovered.disabled = false;

    // 显示替换报告
    const lines: string[] = [
      `✅ Phase 4 位置级替换完成`,
      ``,
      `替换数量: ${result.applied.length} / ${scriptCandidates.length}`,
      `拒绝数量: ${result.rejected.length}`,
      ``,
    ];

    if (result.applied.length > 0) {
      lines.push('已替换：');
      for (const a of result.applied.slice(0, 10)) {
        lines.push(`  ${fmtPos(a.position)}: ${a.original} → ${a.replaced}`);
      }
      if (result.applied.length > 10) {
        lines.push(`  …还有 ${result.applied.length - 10} 处替换`);
      }
      lines.push('');
    }

    if (result.rejected.length > 0) {
      lines.push('拒绝原因：');
      const reasonCounts = new Map<string, number>();
      for (const r of result.rejected) {
        for (const reason of r.reasons) {
          reasonCounts.set(reason.code, (reasonCounts.get(reason.code) || 0) + 1);
        }
      }
      for (const [code, count] of reasonCounts.entries()) {
        lines.push(`  ${code}: ${count} 项`);
      }
      lines.push('');
      lines.push('被拒绝的调用（前5个）：');
      for (const r of result.rejected.slice(0, 5)) {
        const reason = r.reasons[0];
        lines.push(`  ${fmtPos(r.position)}: ${r.callText} — ${reason?.message || reason?.code}`);
      }
    }

    lines.push('');
    lines.push('注意：原始源码保持不变，替换结果仅用于查看和复制。');

    capApplyResultEl.textContent = lines.join('\n');
    capApplyResultEl.style.whiteSpace = 'pre-wrap';
    capApplyResultEl.hidden = false;

    setStatus(`✅ Phase 4 替换完成 — ${result.applied.length} 处已替换`);
    saveScriptsToCache();
  } catch (e: any) {
    capApplyResultEl.textContent = `应用替换失败：${e?.message ?? e}`;
    capApplyResultEl.hidden = false;
    setStatus(`❌ Phase 4 替换失败: ${e?.message ?? e}`);
  } finally {
    btnCapApply.disabled = false;
    btnCapApply.textContent = '应用已验证替换';
  }
});

function renderCaptureList(): void {
  capRenderQueued = false;
  capListEl.textContent = '';
  const rows = allCaptures().sort((a, b) => b.timestamp - a.timestamp);
  const vByKey = new Map<string, GroupValidation>();
  try {
    const report = runValidation();
    for (const g of report.groups) for (const k of g.captureKeys) vByKey.set(k, g);
    // 验证数量由 runValidation() 统一更新
    // 不再单独计算「未验证」，避免与统一统计分叉
  } catch (e: any) {
    if (!capValidationErrorLogged) {
      capValidationErrorLogged = true;
      rtLog('error', `结果验证出错：${e?.message ?? e}`);
    }
  }
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '暂无捕获记录';
    capListEl.appendChild(empty);
    return;
  }
  // 稳定性查找表：与引擎的分组键一致（脚本 + 函数位置 + 函数名 + 参数）
  const stab = new Map<string, { stable: boolean; distinctReturnCount: number }>();
  for (const s of capStabilityFull) {
    const k = [s.scriptId, s.functionLocation.lineNumber, s.functionLocation.columnNumber, s.functionName, JSON.stringify(s.arguments)].join('|');
    stab.set(k, { stable: s.stable, distinctReturnCount: s.distinctReturnCount });
  }
  for (const cap of rows.slice(0, CAP_RENDER_LIMIT)) {
    const ok = cap.captureStatus === 'success';
    const sk = [cap.scriptId, cap.functionLocation.lineNumber, cap.functionLocation.columnNumber, cap.functionName, JSON.stringify(cap.arguments)].join('|');
    const st = stab.get(sk);
    const card = document.createElement('div');
    card.className = 'decoder-card' + (capExpanded.has(cap.key) ? ' open' : '');

    const header = document.createElement('div');
    header.className = 'decoder-card-header';
    header.onclick = () => {
      card.classList.toggle('open');
      if (card.classList.contains('open')) capExpanded.add(cap.key); else capExpanded.delete(cap.key);
    };
    const left = document.createElement('div');
    left.className = 'decoder-card-left';
    const name = document.createElement('span');
    name.className = 'decoder-name';
    name.textContent = cap.functionName;
    const badge = document.createElement('span');
    badge.className = 'decoder-badge ' + (ok ? 'high' : 'cap-fail');
    badge.textContent = ok ? '成功' : '失败';
    const cnt = document.createElement('span');
    cnt.className = 'decoder-badge cap-count';
    cnt.textContent = '×' + cap.count;
    const summary = document.createElement('span');
    summary.className = 'cap-summary';
    summary.textContent = `(${cap.arguments.map(fmtVal).join(', ')}) → ${ok ? fmtVal(cap.returnValue) : '捕获失败'}`;
    const vg = vByKey.get(cap.key);
    left.append(name, badge, cnt);
    if (vg) {
      const vb = document.createElement('span');
      vb.className = 'decoder-badge val-' + vg.status;
      vb.textContent = VALIDATION_LABEL[vg.status];
      vb.title = vg.reasons.map((r) => r.message).join('\n');
      left.appendChild(vb);
    }
    if (ok && st && !st.stable) {
      const ub = document.createElement('span');
      ub.className = 'decoder-badge cap-unstable-badge';
      ub.textContent = `引擎:同参多值×${st.distinctReturnCount}`;
      ub.title = 'Phase 3.1 引擎的原始统计，不是 Phase 3.2 验证状态';
      left.appendChild(ub);
    }
    left.appendChild(summary);
    const toggle = document.createElement('span');
    toggle.className = 'decoder-toggle';
    toggle.textContent = '▶';
    header.append(left, toggle);

    const body = document.createElement('div');
    body.className = 'decoder-card-body';
    cap.arguments.forEach((a, i) => body.appendChild(capRow(`参数[${i}]:`, `${a.type}  ${fmtVal(a)}`)));
    body.appendChild(capRow('返回值:', ok ? `${cap.returnValue?.type ?? ''}  ${fmtVal(cap.returnValue)}` : '—'));
    body.appendChild(capRow('状态:', ok ? 'success' : 'capture-failed'));
    if (cap.reason) body.appendChild(capRow('失败原因:', cap.reason));
    if (st && ok) {
      body.appendChild(capRow('引擎稳定性(3.1原始):', st.stable ? 'stable（同参数始终同结果）' : `unstable（同参数出现 ${st.distinctReturnCount} 个不同结果，不可直接用于替换）`));
      const rec = capStabilityFull.find((s) => [s.scriptId, s.functionLocation.lineNumber, s.functionLocation.columnNumber, s.functionName, JSON.stringify(s.arguments)].join('|') === sk);
      if (rec && !rec.stable) body.appendChild(capRow('历史值:', rec.values.map(fmtVal).join(' | ')));
    }
    if (vg) appendValidationRows(body, vg);
    const shortUrl = cap.scriptUrl ? (cap.scriptUrl.split('/').pop() || cap.scriptUrl) : '(inline/eval)';
    body.appendChild(capRow('函数位置:', `${shortUrl}:${fmtPos(cap.functionLocation)}  [scriptId ${cap.scriptId}]`));
    body.appendChild(capRow('调用位置:', `${shortUrl}:${fmtPos(cap.callLocation)}`));
    body.appendChild(capRow('捕获次数:', String(cap.count)));
    if (cap.scriptUrl) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.textContent = '查看源码位置';
      btn.onclick = () => chrome.devtools.panels.openResource(cap.scriptUrl, cap.functionLocation.lineNumber + 1, () => {});
      body.appendChild(btn);
    }
    card.append(header, body);
    capListEl.appendChild(card);
  }
  if (rows.length > CAP_RENDER_LIMIT) {
    const more = document.createElement('div');
    more.className = 'empty-state';
    more.textContent = `仅显示最近 ${CAP_RENDER_LIMIT} 条，共 ${rows.length} 条`;
    capListEl.appendChild(more);
  }
}

