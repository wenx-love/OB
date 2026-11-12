import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Phase 4.7 L1 下一页业务触发：验收脚本的结构不变量（一次页面加载、一次真实点击、无刷新、闸门先于点击）。
// 只读脚本源码做结构断言，不启动浏览器、不访问目标网站、不运行 L1。

const SRC: string = readFileSync('scripts/p47-l1-ob-run.ts', 'utf8');
const LINES: string[] = SRC.split(/\r?\n/);
const at = (needle: string): number => SRC.indexOf(needle);
const count = (re: RegExp): number => (SRC.match(re) || []).length;
const stepAt = (name: string): number => {
  const a = at(`must('${name}'`);
  return a >= 0 ? a : at(`step('${name}'`);
};
const START = stepAt('startCapture');
const CLICK = at(`send('Input.dispatchMouseEvent'`);
const increasing = (xs: number[]): boolean => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

describe('L1 运行器：一次加载、一次点击、无刷新', () => {
  it('源码里能定位到开始捕获与点击，且点击在开始捕获之后', () => {
    expect(START).toBeGreaterThan(-1);
    expect(CLICK).toBeGreaterThan(START);
  });

  it('不含 Page.reload 和第二次导航，也没有重试刷新路径', () => {
    expect(count(/Page\.reload/g)).toBe(0);
    expect(count(/send\('Page\.navigate'/g)).toBe(1);
    expect(SRC.includes('firstAttempt')).toBe(false);
  });

  it('目标页只导航一次：先建 about:blank，装好监听，再用一次 Page.navigate 到目标', () => {
    expect(count(/send\('Target\.createTarget'/g)).toBe(1);
    expect(SRC.includes(`createTarget', { url: 'about:blank' }`)).toBe(true);
    const blank = at(`createTarget', { url: 'about:blank' }`);
    const enable = at(`send('Network.enable'`);
    const navigate = at(`send('Page.navigate'`);
    expect(increasing([blank, enable, navigate])).toBe(true);
    expect(SRC.includes('budget.pageLoads = 1')).toBe(true);
    expect(at('budget.pageLoads = 1')).toBeLessThan(CLICK);
  });

  it('只有一处真实鼠标点击调用，由三个事件组成，点击计数为 1，没有程序化点击页面元素', () => {
    expect(count(/send\('Input\.dispatchMouseEvent'/g)).toBe(1);
    expect(SRC.includes(`['mouseMoved', 'mousePressed', 'mouseReleased']`)).toBe(true);
    expect(count(/budget\.clicks = 1/g)).toBe(1);
    expect(SRC.includes('params.clickCount = 1')).toBe(true);
    expect(SRC.includes('a.click(')).toBe(false);
  });

  it('点击之前依次完成：目标页身份核对、文档就绪、连接、discovery、脚本等待、分析稳定、脚本唯一匹配、源码哈希、开始捕获', () => {
    const names = ['targetDocumentIdentity', 'connect', 'discovery', 'waitForScripts', 'analysisSettle', 'targetScript', 'sourceHashBeforeCapture', 'startCapture'];
    const pos = names.map((n) => stepAt(n));
    expect(increasing(pos)).toBe(true);
    expect(pos[pos.length - 1]).toBeLessThan(CLICK);
  });

  it('B1 目标页身份检查：ready 后立即核对 host 与 path，不匹配就以 unexpected-document 立即终止', () => {
    const idStep = stepAt('targetDocumentIdentity');
    const connectStep = stepAt('connect');
    expect(idStep).toBeGreaterThan(-1);
    expect(idStep).toBeLessThan(connectStep);
    expect(idStep).toBeLessThan(stepAt('waitForScripts'));
    expect(idStep).toBeLessThan(START);
    expect(idStep).toBeLessThan(CLICK);
    expect(SRC.includes(`new Gate('unexpected-document'`)).toBe(true);
    expect(SRC.includes('LOGIN_PATH_MARKER')).toBe(true);
    expect(SRC.includes(`parsed.host !== TARGET_HOST`)).toBe(true);
    expect(SRC.includes(`parsed.pathname !== TARGET_PATH`)).toBe(true);
    for (const bad of ['username', 'password', 'signin', 'setCookie', 'localStorage.setItem']) expect(SRC.includes(bad)).toBe(false);
  });

  it('B2 完整重定向记录：订阅在导航之前，只记方法、主机、路径与状态码，不记 cookie、头部和正文', () => {
    expect(SRC.includes('addListener(loadListener)')).toBe(true);
    expect(SRC.includes('removeListener(loadListener)')).toBe(true);
    expect(at('b.addListener(loadListener)')).toBeLessThan(at(`send('Page.navigate'`));
    expect(SRC.includes('loadNavigation')).toBe(true);
    expect(SRC.includes('redirectChain')).toBe(true);
    expect(SRC.includes('loadNet')).toBe(true);
    expect(SRC.includes('redirectStatus')).toBe(true);
    for (const bad of ['getCookies', 'postData', 'Network.getResponseBody', 'requestHeaders', 'responseHeaders']) expect(SRC.includes(bad)).toBe(false);
  });

  it('点击前九项闸门存在、顺序固定，且都在开始捕获之后、点击之前', () => {
    const gates = ['cdp-connected', 'discovery-ok', 'target-script-unique', 'source-hash-matches-reference', 'target-script-analysed-and-breakpoints-set', 'document-identity-unchanged', 'budget-sufficient-for-one-click', 'page-responsive', 'next-button-present-and-enabled'];
    expect(gates.length).toBe(9);
    const pos = gates.map((g) => at(`gate('${g}'`));
    expect(increasing(pos)).toBe(true);
    expect(pos[0]).toBeGreaterThan(START);
    expect(pos[pos.length - 1]).toBeLessThan(CLICK);
  });

  it('每种闸门失败都有明确的停止原因，必需步骤出错或超时会抛出 Gate 而不是继续', () => {
    const reasons = ['chrome-not-reachable', 'document-not-ready', 'unexpected-document', 'connect-failed', 'connect-timeout', 'target-script-missing', 'analysis-not-settled', 'script-list-failed', 'target-script-not-unique', 'target-script-offset', 'source-unreadable', 'version-mismatch', 'global-timeout'];
    for (const g of reasons) expect(SRC.includes(`'${g}'`)).toBe(true);
    expect(SRC.includes('throw new Gate(v.gate || name')).toBe(true);
    expect(SRC.includes('class Gate extends Error')).toBe(true);
    expect(SRC.includes('out.stop = {')).toBe(true);
  });

  it('connect 只在后台报告 connected 才通过，超时与失败直接中止', () => {
    expect(SRC.includes(`status === 'connected'`)).toBe(true);
    expect(SRC.includes(`throw new Gate('connect-timeout'`)).toBe(true);
    expect(SRC.includes(`throw new Gate('connect-failed'`)).toBe(true);
    expect(SRC.includes(`gate || name`)).toBe(true);
    expect(SRC.includes(`new Gate(r && r.timeout ? 'discovery-failed-panel-blocked' : 'discovery-failed'`)).toBe(true);
    expect(SRC.includes('discovery-failed-panel-blocked')).toBe(true);
    expect(SRC.includes('discovery-failed')).toBe(true);
  });

  it('B3 连接与 discovery 失败必须中止并保存现场，并把面板阻塞与后台无响应区分开', () => {
    expect(SRC.includes('swStatusDirect')).toBe(true);
    expect(SRC.includes('SW_DIRECT_STATUS')).toBe(true);
    expect(SRC.includes('chrome.debugger.getTargets')).toBe(true);
    expect(SRC.includes('panelFreeStatus')).toBe(true);
    expect(SRC.includes(`new Gate('connect-timeout-panel-blocked'`)).toBe(true);
    expect(SRC.includes('discoveryDiagnostics')).toBe(true);
    expect(SRC.includes(`new Gate(r && r.timeout ? 'discovery-failed-panel-blocked' : 'discovery-failed'`)).toBe(true);
    expect(SRC.includes(`new Gate('connect-timeout-panel-blocked'`)).toBe(true);
    expect(SRC.includes('stageReached')).toBe(true);
    expect(SRC.includes('lastPanelStatusRead')).toBe(true);
    expect(SRC.includes('nothing is retried')).toBe(true);
  });

  it('源码哈希与参考不一致时以 version-mismatch 在开始捕获和点击之前中止', () => {
    const hashStep = stepAt('sourceHashBeforeCapture');
    const mismatch = at(`new Gate('version-mismatch'`);
    expect(hashStep).toBeGreaterThan(-1);
    expect(mismatch).toBeGreaterThan(hashStep);
    expect(mismatch).toBeLessThan(START);
    expect(SRC.includes('r.sha256 !== REF_SHA')).toBe(true);
  });

  it('文档身份用 timeOrigin + loaderId + frameId，地址栏不参与判断，并监听同文档导航', () => {
    const line = LINES.find((l: string) => l.includes('const sameDoc')) || '';
    expect(line.length).toBeGreaterThan(0);
    expect(line.includes('timeOrigin')).toBe(true);
    expect(line.includes('loaderId')).toBe(true);
    expect(line.includes('frameId')).toBe(true);
    expect(line.includes('href')).toBe(false);
    expect(SRC.includes('Page.navigatedWithinDocument')).toBe(true);
    expect(SRC.includes(`n.kind === 'frameNavigated' || n.kind === 'loadEventFired'`)).toBe(true);
    expect(SRC.includes('nv.navigatedWithinDocument === 1')).toBe(true);
    expect(SRC.includes('navigationAsExpected')).toBe(true);
  });

  it('不再用 waitStable 作为结束条件；点击后等响应加固定尾部，60 秒硬上限，并有总看门狗', () => {
    expect(SRC.includes('waitStable')).toBe(false);
    expect(SRC.includes('const CLICK_HARD_CAP_MS = 60000;')).toBe(true);
    expect(SRC.includes('const CLICK_TAIL_MS = 10000;')).toBe(true);
    expect(SRC.includes('hardCapReached')).toBe(true);
    expect(SRC.includes('const GLOBAL_CAP_MS = 12 * 60 * 1000;')).toBe(true);
    expect(SRC.includes('process.exit(3)')).toBe(true);
  });

  it('输出到新文件且独占创建；不触碰既有 raw-run 文件，运行前后核对它们的哈希', () => {
    expect(SRC.includes('raw-run.nextpage3.json')).toBe(true);
    expect(SRC.includes(`flag: firstSave ? 'wx' : 'w'`)).toBe(true);
    expect(SRC.includes('existsSync(OUT)')).toBe(true);
    expect(/raw-run\.json|raw-run\.clean1|raw-run\.nextpage1|raw-run\.nextpage2\.json/.test(SRC)).toBe(false);
    expect(SRC.includes('priorEvidence')).toBe(true);
    expect(SRC.includes('hashPrior()')).toBe(true);
  });

  it('预算：台账余额不足 2 个单位就在启动浏览器之前拒绝，并要求 dist 含 getBreakpointsByScript', () => {
    expect(SRC.includes('const PLANNED_UNITS = 2;')).toBe(true);
    expect(SRC.includes('budget-ledger.json')).toBe(true);
    expect(SRC.includes('getBreakpointsByScript')).toBe(true);
    expect(count(/refuse\(/g)).toBeGreaterThanOrEqual(5);
    expect(at(`refuse('budget remaining`)).toBeLessThan(at('spawn(CHROME'));
  });

  it('权限边界：只请求本机调试端口，不伪造业务请求，不读请求正文、响应正文和 cookie', () => {
    expect(count(/fetch\(/g)).toBe(count(/fetch\('http:\/\/127\.0\.0\.1:/g));
    for (const bad of ['XMLHttpRequest', 'sendBeacon', 'Fetch.enable', 'Network.setRequestInterception', 'Network.getResponseBody', 'getCookies', 'postData']) expect(SRC.includes(bad)).toBe(false);
    expect(SRC.includes('https://hangzhou.qccqcc.com/list.html?keyword=')).toBe(true);
    expect(SRC.includes('&hpailist-2')).toBe(true);
  });

  it('被动统计 HTTP 请求：只记方法与主机路径，并用页面内 Resource Timing 补充', () => {
    expect(SRC.includes(`send('Network.enable'`)).toBe(true);
    expect(SRC.includes('Network.requestWillBeSent')).toBe(true);
    expect(SRC.includes('hostPath(rq.url)')).toBe(true);
    expect(SRC.includes('resourceTiming')).toBe(true);
    expect(SRC.includes('postClickRequests')).toBe(true);
  });

  it('空面板资源未命中时面板脚本列表为空窗口在导航之后才可靠，导航本身不在捕获窗口内', () => {
    const nav = at(`send('Page.navigate'`);
    expect(nav).toBeGreaterThan(-1);
    expect(nav).toBeLessThan(START);
    expect(SRC.includes(`ref.phase = 'preNavigation'`)).toBe(true);
    expect(SRC.includes(`ref.phase = 'captureIdle'`)).toBe(true);
    expect(SRC.includes('fullDocumentNavigationsInCaptureWindow')).toBe(true);
  });

  it('Source Integrity：scriptId 来自脚本列表并与捕获记录交叉核对，前后三次读取源码哈希', () => {
    expect(SRC.includes('debugger-list-scripts')).toBe(true);
    expect(SRC.includes('String(s.url) === TARGET_SCRIPT_URL')).toBe(true);
    expect(/targetScriptId = String\(m\[0\]\.scriptId\)/.test(SRC)).toBe(true);
    expect(SRC.includes('caps.find(')).toBe(false);
    expect(SRC.includes('scriptIdCrossCheck')).toBe(true);
    expect(SRC.includes('sourceIntegrity')).toBe(true);
    expect(stepAt('sourceHashBeforeCapture')).toBeGreaterThan(-1);
    expect(stepAt('sourceReadAfterClick')).toBeGreaterThan(CLICK);
    expect(stepAt('sourceReadAfterApply')).toBeGreaterThan(stepAt('sourceReadAfterClick'));
  });

  it('截断数据不被当作完整证据：记录截断记录数并在输出里声明', () => {
    expect(SRC.includes('observationsTruncated')).toBe(true);
    expect(SRC.includes('truncatedRecords')).toBe(true);
    expect(SRC.includes('incomplete evidence')).toBe(true);
  });

  it('B4 台账由运行器回写：预算口径不变，本轮消耗按自身计数器记账', () => {
    expect(SRC.includes('budget.unitsConsumed = budget.pageLoads + budget.clicks')).toBe(true);
    expect(SRC.includes('lg.entries.push(')).toBe(true);
    expect(SRC.includes('recordedBy: \'runner\'')).toBe(true);
    expect(SRC.includes('budget.ledgerWritten = true')).toBe(true);
    expect(SRC.includes('providerInitiatedBusinessReplays')).toBe(true);
  });

  it('断点覆盖：点击前读取按脚本汇总的断点数，并要求目标脚本大于零', () => {
    expect(SRC.includes('breakpointsByScript')).toBe(true);
    expect(SRC.includes('bpsTarget > 0')).toBe(true);
    expect(SRC.includes('breakpointCoverage')).toBe(true);
  });

  it('进程清理命令的参数之间有空格，Chrome 只在本脚本自己启动时附着', () => {
    expect(SRC.includes(`child.pid + ' /T /F'`)).toBe(true);
    expect(SRC.includes('is already in use')).toBe(true);
  });

  it('重跑改进：状态读取短超时并多次轮询、连接失败保存面板现场、连接按钮只点一次、台账由运行器回写', () => {
    expect(SRC.includes('swStatus(5000)')).toBe(true);
    expect(SRC.includes('read-timeout')).toBe(true);
    expect(SRC.includes('connectDiagnostics')).toBe(true);
    expect(SRC.includes('PANEL_CONNECT')).toBe(true);
    expect(count(/btn-rt-connect'\)\.click\(\)/g)).toBe(1);
    expect(SRC.includes('lg.used = Number(lg.used) + budget.unitsConsumed')).toBe(true);
    expect(SRC.includes('Number(ledger.used)')).toBe(true);
    expect(SRC.includes('usedBeforeNextRun')).toBe(false);
  });
});
