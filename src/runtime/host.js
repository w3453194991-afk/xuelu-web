/* ------------------------------------------------------------------ *
 * 浏览器端「小程序运行时」
 *
 * 负责把 24 个小程序页面跑在网页里：
 *   Page()/App() 注册、setData → 重渲染、事件委托、页面栈与哈希路由、
 *   导航栏 / 底部 tabBar、picker（selector 底部弹层、date 原生控件）、
 *   scroll-view 滚动、焦点与滚动位置恢复。
 *
 * 渲染策略：setData 后整页重渲染（innerHTML 重建）。页面都是几十个节点，
 * 这样做最简单、不可能出现状态与视图不一致；代价是重建 DOM，因此需要
 * 在重渲染前后保存/恢复输入框焦点、光标位置与容器滚动位置。
 * ------------------------------------------------------------------ */

'use strict';

const ui = require('./ui.js');

const state = {
  gen: null,
  app: null,
  stack: [],          // [{ route, inst, options }]
  templates: {},
  pageDefs: {},
  pendingRoute: '',
  root: null,
  nav: null,
  titleEl: null,
  backEl: null,
  tabbar: null,
  tabRoutes: new Set(),
  frame: 0,
  pendingBack: 0,
  scrollTimer: 0
};

/* ---------------- 基础工具 ---------------- */

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
}

function pathTokens(path) {
  const out = [];
  String(path).replace(/\[(\d+)\]/g, '.$1').split('.').forEach(part => {
    if (part !== '') out.push(part);
  });
  return out;
}

function setByPath(target, path, value) {
  const tokens = pathTokens(path);
  if (!tokens.length) return;
  let cursor = target;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    if (cursor[key] == null || typeof cursor[key] !== 'object') {
      cursor[key] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[tokens[tokens.length - 1]] = value;
}

function top() {
  return state.stack.length ? state.stack[state.stack.length - 1] : null;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
}

/* ---------------- Page / App ---------------- */

function Page(def) {
  if (!state.pendingRoute) {
    console.warn('[wx] Page() 在未知路由下被调用，已忽略');
    return;
  }
  state.pageDefs[state.pendingRoute] = def || {};
  state.pendingRoute = '';
}

function App(def) {
  state.app = def || {};
  if (typeof state.app.onLaunch === 'function') {
    try { state.app.onLaunch.call(state.app); } catch (err) { console.error('[wx] onLaunch 异常', err); }
  }
}

function getApp() {
  return state.app;
}

function getCurrentPages() {
  return state.stack.map(entry => entry.inst);
}

/* ---------------- 实例 ---------------- */

function createInstance(route, options) {
  if (!state.pageDefs[route]) {
    state.pendingRoute = route;
    try {
      require('miniprogram/' + route + '.js');
    } catch (err) {
      console.error('[wx] 页面脚本加载失败', route, err);
    }
  }

  const def = state.pageDefs[route] || {};
  const inst = {};
  Object.keys(def).forEach(key => { inst[key] = def[key]; });
  inst.data = clone(def.data || {});
  inst.route = route;
  inst.options = options || {};
  inst.__navTitle = '';

  inst.setData = function (patch, callback) {
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(key => setByPath(this.data, key, patch[key]));
    }
    scheduleRender(this);
    if (typeof callback === 'function') requestAnimationFrame(callback);
  };

  return inst;
}

function scheduleRender(inst) {
  if (state.frame) return;
  state.frame = requestAnimationFrame(() => {
    state.frame = 0;
    const entry = top();
    if (!entry || entry.inst !== inst) return;
    renderEntry(entry);
  });
}

/* ---------------- 渲染 ---------------- */

function captureViewState() {
  const out = { focusEl: null, focusStart: null, focusEnd: null, scrollY: window.scrollY, scrollers: {} };
  const active = document.activeElement;
  if (active && active.dataset && active.dataset.el != null && state.root.contains(active)) {
    out.focusEl = active.dataset.el;
    try {
      out.focusStart = active.selectionStart;
      out.focusEnd = active.selectionEnd;
    } catch (e) { /* 非文本控件 */ }
  }
  state.root.querySelectorAll('scroll-view[data-el]').forEach(node => {
    out.scrollers[node.dataset.el] = node.scrollTop;
  });
  return out;
}

function restoreViewState(prev, samePage) {
  if (!prev) return;
  Object.keys(prev.scrollers).forEach(key => {
    const node = state.root.querySelector(`scroll-view[data-el="${cssEscape(key)}"]`);
    if (node) node.scrollTop = prev.scrollers[key];
  });
  if (prev.focusEl != null) {
    const node = state.root.querySelector(`[data-el="${cssEscape(prev.focusEl)}"]`);
    if (node && typeof node.focus === 'function' && !node.disabled) {
      node.focus({ preventScroll: true });
      if (prev.focusStart != null) {
        try { node.setSelectionRange(prev.focusStart, prev.focusEnd); } catch (e) { /* 非文本控件 */ }
      }
    }
  }
  if (samePage) window.scrollTo(0, prev.scrollY);
}

function renderEntry(entry) {
  const template = state.templates[entry.route];
  if (typeof template !== 'function') {
    console.error('[wx] 缺少模板', entry.route);
    return;
  }

  const prev = captureViewState();
  const samePage = true;

  let html = '';
  try {
    html = template(entry.inst.data, 'p');
  } catch (err) {
    console.error('[wx] 模板渲染失败', entry.route, err);
    html = '<view class="empty">页面渲染出错，请刷新重试</view>';
  }

  const wrap = document.createElement('div');
  wrap.className = 'wx-page';
  wrap.setAttribute('data-page-id', entry.route);
  wrap.innerHTML = html;

  state.root.replaceChildren(wrap);
  restoreViewState(prev, samePage);
  upgradeControls(wrap, entry.inst);
}

/* picker 日期控件、scroll-view 滚动、空图占位 */
function upgradeControls(wrap, inst) {
  wrap.querySelectorAll('picker').forEach(node => {
    const mode = node.getAttribute('data-picker-mode');
    if (mode !== 'date') return;
    const value = node.getAttribute('data-picker-value') || '';
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'wx-date-input';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) input.value = value;
    const start = node.getAttribute('data-picker-start');
    const end = node.getAttribute('data-picker-end');
    if (start) input.min = start;
    if (end) input.max = end;
    input.addEventListener('change', () => {
      dispatch(inst, node, 'change', { value: input.value }, input);
    });
    node.replaceChildren(input);
    node.classList.add('wx-picker-native');
  });

  wrap.querySelectorAll('scroll-view').forEach(node => {
    const into = node.getAttribute('data-scroll-into');
    if (into) {
      const target = wrap.querySelector('#' + cssEscape(into));
      if (target) {
        const box = node.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        node.scrollTop += rect.top - box.top - 8;
      }
    }
    const scrollTop = node.getAttribute('data-scroll-top');
    if (scrollTop != null && scrollTop !== '') node.scrollTop = Number(scrollTop) || 0;
  });

  wrap.querySelectorAll('img').forEach(img => {
    if (!img.getAttribute('src')) {
      img.style.visibility = 'hidden';
      return;
    }
    /* 源码里有指向不存在图片的引用（如 mascot-study.jpg），失败就隐藏而不是显示裂图 */
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
    if (img.complete && img.naturalWidth === 0) img.style.visibility = 'hidden';
  });
}

/* ---------------- 事件 ---------------- */

function collectDataset(node) {
  const chain = [];
  let cursor = node;
  while (cursor && cursor !== state.root) {
    chain.unshift(cursor);
    cursor = cursor.parentElement;
  }
  const out = {};
  chain.forEach(item => {
    if (!item.getAttribute) return;
    const raw = item.getAttribute('data-ds');
    if (!raw) return;
    try { Object.assign(out, JSON.parse(raw)); } catch (e) { /* 非法 JSON 忽略 */ }
  });
  return out;
}

function dispatch(inst, node, type, detail, target) {
  const handler = node.getAttribute('data-on-' + type) || node.getAttribute('data-catch-' + type);
  if (!handler) return false;

  const fn = inst[handler];
  if (typeof fn !== 'function') {
    console.warn('[wx] 未找到事件处理函数：', inst.route, handler, `(${type})`);
    return false;
  }

  const source = target && target.nodeType === 1 ? target : node;
  const ev = {
    type,
    timeStamp: Date.now(),
    target: { id: source.id || '', dataset: collectDataset(source) },
    currentTarget: { id: node.id || '', dataset: collectDataset(node) },
    detail: detail || {},
    touches: [],
    changedTouches: [],
    preventDefault() {},
    stopPropagation() {}
  };

  try {
    fn.call(inst, ev);
  } catch (err) {
    console.error('[wx] 事件处理异常：', inst.route, handler, err);
  }
  return true;
}

function onClick(ev) {
  const entry = top();
  if (!entry) return;
  const inst = entry.inst;

  let node = ev.target;
  while (node && node !== state.root) {
    if (node.nodeType === 1) {
      if (node.tagName === 'PICKER') {
        /* 日期控件交给原生 input */
        if (node.classList.contains('wx-picker-native')) return;
        openPicker(inst, node);
        return;
      }
      if (node.hasAttribute('data-on-tap') || node.hasAttribute('data-catch-tap')) {
        dispatch(inst, node, 'tap', { x: ev.clientX, y: ev.clientY });
        if (node.hasAttribute('data-catch-tap')) return;
      }
    }
    node = node.parentElement;
  }
}

function onInput(ev) {
  const entry = top();
  if (!entry) return;
  const node = ev.target;
  if (!node || node.nodeType !== 1) return;
  const host = node.closest('[data-on-input]');
  if (!host || !state.root.contains(host)) return;
  dispatch(entry.inst, host, 'input', { value: node.value, cursor: node.selectionStart });
}

function onChange(ev) {
  const entry = top();
  if (!entry) return;
  const node = ev.target;
  if (!node || node.nodeType !== 1) return;
  const host = node.closest('[data-on-change]');
  if (!host || !state.root.contains(host)) return;
  dispatch(entry.inst, host, 'change', { value: node.value });
}

function onKeydown(ev) {
  if (ev.key !== 'Enter') return;
  const entry = top();
  if (!entry) return;
  const node = ev.target;
  if (!node || node.nodeType !== 1) return;
  if (node.tagName !== 'INPUT' && node.tagName !== 'TEXTAREA') return;
  const host = node.closest('[data-on-confirm]');
  if (!host) return;
  dispatch(entry.inst, host, 'confirm', { value: node.value });
}

/* ---------------- picker ---------------- */

function openPicker(inst, node) {
  const mode = node.getAttribute('data-picker-mode') || 'selector';
  if (mode !== 'selector') return;

  const raw = node.getAttribute('data-picker-range') || '[]';
  let range = [];
  try { range = JSON.parse(raw); } catch (e) { range = []; }
  if (!Array.isArray(range)) range = [];

  const key = node.getAttribute('data-picker-key');
  const items = range.map(item => {
    if (key && item && typeof item === 'object') return item[key];
    return item;
  });

  const currentValue = Number(node.getAttribute('data-picker-value'));
  const index = Number.isFinite(currentValue)
    ? Math.max(0, Math.min(items.length - 1, currentValue))
    : 0;

  ui.pickerSheet({ items, index }).then(picked => {
    if (picked == null) return;
    if (top() && top().inst === inst) dispatch(inst, node, 'change', { value: picked });
  });
}

/* ---------------- 导航到指定页面 ---------------- */

function parseUrl(url) {
  let raw = String(url || '').trim();
  raw = raw.replace(/^#/, '').replace(/^\//, '');
  const [rawPath, rawQuery] = raw.split('?');
  const route = rawPath.replace(/\.js$/, '').replace(/^miniprogram\//, '');
  const query = {};
  if (rawQuery) {
    rawQuery.split('&').forEach(pair => {
      if (!pair) return;
      const eq = pair.indexOf('=');
      const key = eq < 0 ? pair : pair.slice(0, eq);
      const value = eq < 0 ? '' : pair.slice(eq + 1);
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
    });
  }
  return { route, query };
}

function hashFor(route, query) {
  const parts = Object.keys(query || {})
    .filter(key => query[key] !== '' && query[key] != null)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
  return '#/' + route + (parts.length ? '?' + parts.join('&') : '');
}

function mount(entry, fresh) {
  const inst = entry.inst;

  if (fresh && typeof inst.onLoad === 'function') {
    try { inst.onLoad.call(inst, entry.options || {}); } catch (err) { console.error('[wx] onLoad 异常', entry.route, err); }
  }

  renderEntry(entry);
  applyChrome(entry);

  if (typeof inst.onShow === 'function') {
    try { inst.onShow.call(inst); } catch (err) { console.error('[wx] onShow 异常', entry.route, err); }
  }

  if (fresh) {
    requestAnimationFrame(() => {
      if (typeof inst.onReady === 'function') {
        try { inst.onReady.call(inst); } catch (err) { console.error('[wx] onReady 异常', entry.route, err); }
      }
    });
    window.scrollTo(0, 0);
  }
}

function pushEntry(route, query, opts) {
  const options = opts || {};
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }

  const prev = top();
  if (prev && typeof prev.inst.onHide === 'function') {
    try { prev.inst.onHide.call(prev.inst); } catch (err) { console.error('[wx] onHide 异常', prev.route, err); }
  }

  const inst = createInstance(route, query);
  const entry = { route, inst, options: query };
  state.stack.push(entry);

  if (!options.noHistory) {
    const url = hashFor(route, query);
    if (options.replace) history.replaceState({}, '', url);
    else history.pushState({}, '', url);
  }

  mount(entry, true);
  return true;
}

function unloadAll() {
  state.stack.slice().reverse().forEach(entry => {
    if (typeof entry.inst.onUnload === 'function') {
      try { entry.inst.onUnload.call(entry.inst); } catch (err) { console.error('[wx] onUnload 异常', entry.route, err); }
    }
  });
}

function navigateTo(url) {
  const { route, query } = parseUrl(url);
  return pushEntry(route, query, {});
}

function redirectTo(url) {
  const { route, query } = parseUrl(url);
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }
  const prev = top();
  if (prev) {
    if (typeof prev.inst.onUnload === 'function') {
      try { prev.inst.onUnload.call(prev.inst); } catch (err) { /* 忽略 */ }
    }
    state.stack.pop();
  }
  return pushEntry(route, query, { replace: true });
}

function switchTab(url) {
  const { route, query } = parseUrl(url);
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }
  unloadAll();
  state.stack = [];
  return pushEntry(route, query, {});
}

function reLaunch(url) {
  const { route, query } = parseUrl(url);
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }
  unloadAll();
  state.stack = [];
  return pushEntry(route, query, { replace: true });
}

function navigateBack(delta) {
  const step = Math.max(1, Number(delta) || 1);
  if (state.stack.length <= 1) return false;

  const removed = state.stack.splice(Math.max(0, state.stack.length - step), step);
  removed.reverse().forEach(entry => {
    if (typeof entry.inst.onUnload === 'function') {
      try { entry.inst.onUnload.call(entry.inst); } catch (err) { /* 忽略 */ }
    }
  });

  state.pendingBack = step;
  history.go(-step);

  const entry = top();
  if (entry) mount(entry, false);
  return true;
}

function onPopState() {
  if (state.pendingBack > 0) { state.pendingBack = 0; return; }

  const { route, query } = parseUrl(location.hash);
  if (!state.templates[route]) return;

  const index = state.stack.findIndex(entry => entry.route === route);
  if (index >= 0) {
    const removed = state.stack.splice(index + 1);
    removed.reverse().forEach(entry => {
      if (typeof entry.inst.onUnload === 'function') {
        try { entry.inst.onUnload.call(entry.inst); } catch (err) { /* 忽略 */ }
      }
    });
    mount(state.stack[index], false);
    return;
  }
  pushEntry(route, query, { noHistory: true });
}

/* ---------------- 页面外框 ---------------- */

const TAB_ICONS = {
  'pages/index/index': '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  'pages/learning/learning': '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M7 8h8M7 12h6"/>',
  'pages/orders/orders': '<path d="M6 3h12v17l-3-1.8-3 1.8-3-1.8L6 20z"/><path d="M9 8h6M9 12h6"/>',
  'pages/mine/mine': '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/>'
};

function buildTabbar(list) {
  const bar = state.tabbar;
  bar.replaceChildren();
  (list || []).forEach(item => {
    const button = document.createElement('button');
    button.className = 'wx-tab';
    button.setAttribute('data-route', item.pagePath);

    const icon = document.createElement('span');
    icon.className = 'wx-tab-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (TAB_ICONS[item.pagePath] || '') + '</svg>';

    const label = document.createElement('span');
    label.className = 'wx-tab-text';
    label.textContent = item.text;

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', () => {
      if (state.tabRoutes.has(item.pagePath)) switchTab(item.pagePath);
    });

    bar.appendChild(button);
  });
}

function applyChrome(entry) {
  const gen = state.gen || {};
  const meta = (gen.pageMeta && gen.pageMeta[entry.route]) || {};
  const win = gen.window || {};

  const background = meta.navigationBarBackgroundColor || win.navigationBarBackgroundColor || '#b8500f';
  const textStyle = meta.navigationBarTextStyle || win.navigationBarTextStyle || 'white';
  const title = entry.inst.__navTitle || meta.navigationBarTitleText || win.navigationBarTitleText || '学鹭伴学';

  state.nav.style.background = background;
  state.nav.classList.toggle('wx-nav-light', textStyle === 'white');
  state.titleEl.textContent = title;
  document.title = title;

  state.backEl.hidden = state.stack.length <= 1;

  const isTab = state.tabRoutes.has(entry.route);
  document.body.classList.toggle('has-tab', isTab);
  state.tabbar.hidden = !isTab;
  state.tabbar.querySelectorAll('.wx-tab').forEach(node => {
    node.classList.toggle('on', node.getAttribute('data-route') === entry.route);
  });

  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute('content', background);
}

/* ---------------- 安装与启动 ---------------- */

function install(gen) {
  state.gen = gen || {};
  state.templates = state.gen.templates || {};
  state.root = document.getElementById('wx-page');
  state.nav = document.getElementById('wx-nav');
  state.titleEl = document.getElementById('wx-nav-title');
  state.backEl = document.getElementById('wx-nav-back');
  state.tabbar = document.getElementById('wx-tabbar');

  const tabBar = state.gen.tabBar || {};
  const tabs = tabBar.list || [];
  tabs.forEach(item => state.tabRoutes.add(item.pagePath));
  buildTabbar(tabs);
  if (tabBar.backgroundColor) state.tabbar.style.background = tabBar.backgroundColor;
  state.tabbar.style.color = tabBar.color || '#a28773';

  state.backEl.addEventListener('click', () => navigateBack(1));

  state.root.addEventListener('click', onClick);
  state.root.addEventListener('input', onInput);
  state.root.addEventListener('change', onChange);
  state.root.addEventListener('keydown', onKeydown);

  window.addEventListener('popstate', onPopState);

  window.addEventListener('scroll', () => {
    if (state.scrollTimer) return;
    state.scrollTimer = setTimeout(() => {
      state.scrollTimer = 0;
      const entry = top();
      if (!entry) return;
      const inst = entry.inst;
      if (typeof inst.onPageScroll === 'function') {
        inst.onPageScroll({ scrollTop: window.scrollY });
      }
      if (typeof inst.onReachBottom === 'function') {
        const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 120;
        if (nearBottom) inst.onReachBottom();
      }
    }, 120);
  }, { passive: true });
}

function start() {
  const gen = state.gen || {};
  const pages = gen.pages || [];
  const initial = parseUrl(location.hash);
  const route = state.templates[initial.route] ? initial.route : pages[0];
  if (!route) {
    state.root.textContent = '没有可显示的页面';
    return;
  }
  pushEntry(route, initial.route ? initial.query : {}, { replace: true });
}

function setNavigationTitle(title) {
  const entry = top();
  if (!entry) return;
  entry.inst.__navTitle = title || '';
  applyChrome(entry);
}

module.exports = {
  install,
  start,
  Page,
  App,
  getApp,
  getCurrentPages,
  navigateTo,
  redirectTo,
  switchTab,
  reLaunch,
  navigateBack,
  setNavigationTitle,
  state
};
