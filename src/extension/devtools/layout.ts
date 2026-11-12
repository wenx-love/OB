/**
 * OB-Recover 面板布局控制
 *
 * 只负责布局：文件栏折叠、编辑器左右/上下/单栏切换、同步滚动、底部抽屉、转换报告过滤、响应式。
 * 不包含业务逻辑；与 panel.ts 仅通过 DOM id / class 解耦，状态同步用 MutationObserver。
 * 布局状态以 data-* 属性写在 DOM 上，具体样式见 panel-layout.css。
 */

type LayoutMode = 'auto' | 'row' | 'col' | 'tabs';
type ResolvedLayout = 'row' | 'col' | 'tabs';
type SidebarPref = 'auto' | 'open' | 'closed';
type DockPane = 'runtime' | 'decoder' | 'capture' | 'report' | 'manual';
type SizeClass = 'lg' | 'md' | 'sm';
type EditorId = 'original' | 'recovered';

interface LayoutPrefs {
  sidebar: SidebarPref;
  mode: LayoutMode;
  sync: boolean;
  dockOpen: boolean;
  dockPane: DockPane;
  dockHeight: number | null;
}

const STORAGE_KEY = 'ob_recover_layout_v1';
const DEFAULT_PREFS: LayoutPrefs = {
  sidebar: 'auto',
  mode: 'auto',
  sync: true,
  dockOpen: false,
  dockPane: 'runtime',
  dockHeight: null,
};

const BREAK_LG = 1100; // 面板宽度 >= 此值：大尺寸，文件栏默认展开
const BREAK_MD = 700; // 面板宽度 >= 此值：中等尺寸；更小为小尺寸
const SHORT_H = 500; // 面板高度 < 此值：自动折叠底部抽屉
const NARROW_EDITORS = 560; // 自动模式下，编辑区宽度 < 此值就不再左右并排
const MIN_COL_H = 440; // 自动模式下，上下布局至少需要的编辑区高度，不足则改单栏

const MODES: LayoutMode[] = ['auto', 'row', 'col', 'tabs'];
const DOCK_PANES: DockPane[] = ['runtime', 'decoder', 'capture', 'report', 'manual'];
const MODE_LABEL: Record<LayoutMode, string> = { auto: '自动', row: '左右', col: '上下', tabs: '单栏' };
const LAYOUT_LABEL: Record<ResolvedLayout, string> = { row: '左右', col: '上下', tabs: '单栏' };

function loadPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        sidebar: ['auto', 'open', 'closed'].includes(p.sidebar) ? p.sidebar : 'auto',
        mode: MODES.includes(p.mode) ? p.mode : 'auto',
        sync: p.sync !== false,
        dockOpen: p.dockOpen === true,
        dockPane: DOCK_PANES.includes(p.dockPane) ? p.dockPane : 'runtime',
        dockHeight: typeof p.dockHeight === 'number' && p.dockHeight >= 100 ? p.dockHeight : null,
      };
    }
  } catch {
    /* 存储不可用时使用默认布局 */
  }
  return { ...DEFAULT_PREFS };
}

function savePrefs(p: LayoutPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function clearPrefs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('layout: missing #' + id);
  return el as T;
}

function shortName(url: string): string {
  const clean = url.split('#')[0].split('?')[0];
  const last = clean.split('/').filter(Boolean).pop();
  return last || url;
}

function init(): void {
  const app = byId('app');
  const main = byId('main');
  const sidebar = byId('sidebar');
  const scriptList = byId('script-list');
  const editors = byId('editors');
  const tabsBar = byId('editor-tabs');
  const codePanels = byId('code-panels');
  const panelOriginal = byId('panel-original');
  const panelRecovered = byId('panel-recovered');
  const codeOriginal = byId('code-original');
  const codeRecovered = byId('code-recovered');
  const dock = byId('dock');
  const dockResize = byId('resize-dock');
  const dockBody = dock.querySelector('.dock-body') as HTMLElement;
  const dockTabs = Array.from(dock.querySelectorAll<HTMLElement>('.dock-tab'));
  const dockPanes = Array.from(dock.querySelectorAll<HTMLElement>('.dock-pane'));
  const edTabs = Array.from(tabsBar.querySelectorAll<HTMLElement>('.ed-tab'));
  const btnSidebar = byId('btn-toggle-sidebar');
  const btnCollapse = byId('btn-collapse-sidebar');
  const btnMode = byId('btn-layout-mode');
  const btnSync = byId('btn-sync-scroll');
  const btnReset = byId('btn-reset-layout');
  const btnDock = byId('btn-dock-toggle');
  const btnDetails = byId('btn-rt-details');

  let prefs = loadPrefs();
  let sizeClass: SizeClass = 'lg';
  let isShort = false;
  let dockOpen = prefs.dockOpen;
  let smSidebarOpen = false; // 小尺寸下文件栏是覆盖层，只在当次会话生效
  let activeEditor: EditorId = 'original';

  // ── 文件栏 ──
  const sidebarVisible = (): boolean => {
    if (sizeClass === 'sm') return smSidebarOpen;
    if (prefs.sidebar === 'open') return true;
    if (prefs.sidebar === 'closed') return false;
    return sizeClass === 'lg';
  };

  const renderSidebar = (): void => {
    const v = sidebarVisible();
    app.dataset.sidebar = v ? 'open' : 'closed';
    btnSidebar.setAttribute('aria-pressed', String(v));
    btnSidebar.title = v ? '折叠文件列表' : '展开文件列表';
  };

  const toggleSidebar = (): void => {
    if (sizeClass === 'sm') {
      smSidebarOpen = !smSidebarOpen;
    } else {
      prefs.sidebar = sidebarVisible() ? 'closed' : 'open';
      savePrefs(prefs);
    }
    renderSidebar();
  };

  // ── 编辑器布局 ──
  const resolveLayout = (): ResolvedLayout => {
    if (prefs.mode !== 'auto') return prefs.mode;
    const w = editors.clientWidth;
    if (w === 0 || w >= NARROW_EDITORS) return 'row';
    const h = editors.clientHeight + (tabsBar.hidden ? 0 : tabsBar.offsetHeight);
    return h >= MIN_COL_H ? 'col' : 'tabs';
  };

  const renderEditors = (): void => {
    const layout = resolveLayout();
    if (codePanels.dataset.layout !== layout) {
      codePanels.dataset.layout = layout;
      // 清掉拖拽分隔条留下的内联 flex，避免左右布局的像素值污染上下布局
      panelOriginal.style.flex = '';
      panelRecovered.style.flex = '';
    }
    tabsBar.hidden = layout !== 'tabs';
    codePanels.dataset.active = activeEditor;
    edTabs.forEach((b) => b.classList.toggle('active', b.dataset.target === activeEditor));
    btnMode.textContent = MODE_LABEL[prefs.mode];
    btnMode.title =
      prefs.mode === 'auto'
        ? '编辑器布局：自动（当前' + LAYOUT_LABEL[layout] + '），点击切换'
        : '编辑器布局：' + MODE_LABEL[prefs.mode] + '，点击切换';
  };

  // ── 底部抽屉 ──
  const renderDock = (): void => {
    dock.dataset.open = String(dockOpen);
    dock.dataset.pane = prefs.dockPane;
    dockTabs.forEach((t) => {
      const on = dockOpen && t.dataset.pane === prefs.dockPane;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    dockPanes.forEach((p) => {
      p.hidden = p.dataset.pane !== prefs.dockPane;
    });
    btnDock.textContent = dockOpen ? '▾' : '▴';
    btnDock.title = dockOpen ? '折叠面板' : '展开面板';
    btnDetails.classList.toggle('active', dockOpen && prefs.dockPane === 'runtime');
    if (prefs.dockHeight) dock.style.setProperty('--dock-h', prefs.dockHeight + 'px');
    else dock.style.removeProperty('--dock-h');
  };

  const activateDock = (pane: DockPane): void => {
    if (dockOpen && prefs.dockPane === pane) {
      dockOpen = false;
    } else {
      prefs.dockPane = pane;
      dockOpen = true;
    }
    prefs.dockOpen = dockOpen;
    savePrefs(prefs);
    renderDock();
  };

  // ── 响应式 ──
  const measure = (): void => {
    const w = app.clientWidth;
    const h = app.clientHeight;
    if (w === 0 || h === 0) return;
    const next: SizeClass = w >= BREAK_LG ? 'lg' : w >= BREAK_MD ? 'md' : 'sm';
    const short = h < SHORT_H;
    const becameShort = short && !isShort;
    sizeClass = next;
    isShort = short;
    app.dataset.size = next;
    app.dataset.short = String(short);
    if (becameShort && dockOpen) {
      // 高度不足：自动折叠分析抽屉（不写入偏好，窗口变高后用户可再展开）
      dockOpen = false;
      renderDock();
    }
    renderSidebar();
    renderEditors();
  };

  // ── 同步滚动（按滚动比例，两侧行数不同所以只能近似） ──
  let syncLock = false;
  const linkScroll = (src: HTMLElement, dst: HTMLElement): void => {
    src.addEventListener(
      'scroll',
      () => {
        if (!prefs.sync || syncLock || codePanels.dataset.layout === 'tabs') return;
        const sMax = src.scrollHeight - src.clientHeight;
        const dMax = dst.scrollHeight - dst.clientHeight;
        if (sMax <= 0 || dMax <= 0) return;
        syncLock = true;
        dst.scrollTop = (src.scrollTop / sMax) * dMax;
        requestAnimationFrame(() => {
          syncLock = false;
        });
      },
      { passive: true },
    );
  };
  linkScroll(codeOriginal, codeRecovered);
  linkScroll(codeRecovered, codeOriginal);

  const renderSync = (): void => {
    btnSync.classList.toggle('active', prefs.sync);
    btnSync.setAttribute('aria-pressed', String(prefs.sync));
    btnSync.title = prefs.sync ? '同步滚动：开' : '同步滚动：关';
  };

  // ── 按钮事件 ──
  btnSidebar.addEventListener('click', toggleSidebar);
  btnCollapse.addEventListener('click', toggleSidebar);

  scriptList.addEventListener('click', () => {
    // 小尺寸下文件栏是覆盖层，选中文件后自动收起
    if (sizeClass === 'sm' && smSidebarOpen) {
      smSidebarOpen = false;
      renderSidebar();
    }
  });

  // 小尺寸下点遮罩关闭文件栏
  app.addEventListener('click', (e) => {
    if (e.target === app && sizeClass === 'sm' && smSidebarOpen) {
      smSidebarOpen = false;
      renderSidebar();
    }
  });

  btnMode.addEventListener('click', () => {
    prefs.mode = MODES[(MODES.indexOf(prefs.mode) + 1) % MODES.length];
    savePrefs(prefs);
    renderEditors();
  });

  btnSync.addEventListener('click', () => {
    prefs.sync = !prefs.sync;
    savePrefs(prefs);
    renderSync();
  });

  edTabs.forEach((b) =>
    b.addEventListener('click', () => {
      activeEditor = b.dataset.target === 'recovered' ? 'recovered' : 'original';
      renderEditors();
    }),
  );

  dockTabs.forEach((t) => t.addEventListener('click', () => activateDock(t.dataset.pane as DockPane)));
  btnDock.addEventListener('click', () => {
    dockOpen = !dockOpen;
    prefs.dockOpen = dockOpen;
    savePrefs(prefs);
    renderDock();
  });
  btnDetails.addEventListener('click', () => activateDock('runtime'));

  btnReset.addEventListener('click', () => {
    prefs = { ...DEFAULT_PREFS };
    clearPrefs();
    smSidebarOpen = false;
    dockOpen = false;
    activeEditor = 'original';
    sidebar.style.width = '';
    panelOriginal.style.flex = '';
    panelRecovered.style.flex = '';
    reportQuery.value = '';
    reportScope.value = 'all';
    applyReportFilter();
    renderDock();
    renderSync();
    measure();
  });

  // 抽屉高度拖拽（可选功能：默认高度已够用）
  dockResize.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockBody.getBoundingClientRect().height;
    dockResize.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent): void => {
      const max = Math.max(120, main.clientHeight - 220);
      const h = Math.round(Math.max(100, Math.min(max, startH + (startY - ev.clientY))));
      prefs.dockHeight = h;
      dock.style.setProperty('--dock-h', h + 'px');
    };
    const onUp = (): void => {
      dockResize.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      savePrefs(prefs);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── 转换报告：搜索 + 范围筛选 ──
  const reportList = byId('transform-list');
  const reportQuery = byId<HTMLInputElement>('report-filter');
  const reportScope = byId<HTMLSelectElement>('report-scope');
  const reportShown = byId('report-shown');

  const applyReportFilter = (): void => {
    const q = reportQuery.value.trim().toLowerCase();
    const scope = reportScope.value;
    const items = reportList.querySelectorAll<HTMLElement>('.transform-item');
    let shown = 0;
    items.forEach((it) => {
      let text: string;
      if (scope === 'orig') text = it.querySelector('.transform-orig')?.textContent ?? '';
      else if (scope === 'new') text = it.querySelector('.transform-new')?.textContent ?? '';
      else if (scope === 'loc') text = it.querySelector('.transform-loc')?.textContent ?? '';
      else text = it.textContent ?? '';
      const hit = !q || text.toLowerCase().includes(q);
      it.hidden = !hit;
      if (hit) shown++;
    });
    reportShown.textContent = q ? '(显示 ' + shown + '/' + items.length + ')' : '';
  };

  let filterTimer: number | undefined;
  const scheduleFilter = (): void => {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(applyReportFilter, 150);
  };
  reportQuery.addEventListener('input', scheduleFilter);
  reportScope.addEventListener('change', applyReportFilter);
  // showTransforms 用 innerHTML 整体重绘，重绘后重新套用当前过滤条件
  new MutationObserver(applyReportFilter).observe(reportList, { childList: true });

  // ── 与 panel.ts 状态同步（只读观察，不修改它的数据） ──
  const mirrorText = (srcId: string, apply: (text: string) => void): void => {
    const src = document.getElementById(srcId);
    if (!src) return;
    const run = (): void => apply((src.textContent ?? '').trim());
    new MutationObserver(run).observe(src, { childList: true, characterData: true, subtree: true });
    run();
  };

  const tbCount = byId('tb-count');
  const badgeReport = byId('dock-rep-badge');
  const badgeDecoder = byId('dock-dec-badge');
  const badgeCapture = byId('dock-cap-badge');
  const capTab = dockTabs.find((t) => t.dataset.pane === 'capture');

  mirrorText('transform-count', (t) => {
    const has = t !== '' && t !== '0';
    badgeReport.textContent = has ? t : '';
    tbCount.innerHTML = '<b>' + t.replace(/[^0-9]/g, '') + '</b><span class="lbl"> 处转换</span>';
    tbCount.hidden = !has;
  });
  mirrorText('dec-candidates', (t) => {
    badgeDecoder.textContent = t !== '' && t !== '0' ? t : '';
  });
  mirrorText('cap-hits', (t) => {
    badgeCapture.textContent = t !== '' && t !== '0' ? t : '';
  });
  mirrorText('cap-status', (t) => {
    capTab?.classList.toggle('live', t === '正在捕获');
  });
  const manTab = dockTabs.find((t) => t.dataset.pane === 'manual');
  mirrorText('man-state', (t) => {
    manTab?.classList.toggle('live', t === '已暂停');
  });
  // 单栏模式下还原完成后自动切到还原代码
  mirrorText('stats-recovered', (t) => {
    if (t.includes('次转换') && codePanels.dataset.layout === 'tabs') {
      activeEditor = 'recovered';
      renderEditors();
    }
  });

  // 状态文字被截断时，悬停可看完整内容
  mirrorText('status', (t) => {
    byId('status').title = t;
  });

  // 工具栏显示当前选中的文件
  const tbFile = byId('tb-file');
  const updateFile = (): void => {
    const li = scriptList.querySelector('li.active') as HTMLElement | null;
    const full = li?.title ?? '';
    tbFile.textContent = full ? shortName(full) : '';
    tbFile.title = full;
  };
  new MutationObserver(updateFile).observe(scriptList, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // ── 初始化 ──
  renderSync();
  renderDock();
  measure();
  const ro = new ResizeObserver(() => measure());
  ro.observe(app);
  ro.observe(editors);
}

try {
  init();
} catch (err) {
  // 布局增强失败不能影响面板的业务功能
  console.error('[OB-Recover] layout init failed:', err);
}
