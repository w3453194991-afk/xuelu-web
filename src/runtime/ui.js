/* ------------------------------------------------------------------ *
 * 浏览器端 UI 原语：toast / loading / modal / 选择器底部弹层
 * 对应小程序里由基础库绘制的同名人机界面。
 * ------------------------------------------------------------------ */

'use strict';

function layer() {
  return document.getElementById('wx-layer');
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------------- toast ---------------- */

let toastNode = null;
let toastTimer = 0;

function toast(opts) {
  const o = opts || {};
  if (toastNode) { toastNode.remove(); toastNode = null; }
  clearTimeout(toastTimer);

  const node = el('div', 'wx-toast');
  const icon = o.icon === 'success' ? '✓' : o.icon === 'error' ? '✕' : o.icon === 'loading' ? '' : '';
  if (icon) {
    node.appendChild(el('div', 'wx-toast-icon ' + (o.icon === 'success' ? 'ok' : 'bad'), icon));
  }
  if (o.title) node.appendChild(el('div', 'wx-toast-text', o.title));
  if (o.icon === 'loading') node.appendChild(el('div', 'wx-spinner'));

  layer().appendChild(node);
  requestAnimationFrame(() => node.classList.add('on'));
  toastNode = node;

  toastTimer = setTimeout(() => {
    node.classList.remove('on');
    setTimeout(() => node.remove(), 220);
    if (toastNode === node) toastNode = null;
  }, o.duration == null ? 1600 : Math.max(600, o.duration));
}

/* ---------------- loading ---------------- */

let loadingDepth = 0;
let loadingNode = null;

function showLoading(opts) {
  loadingDepth++;
  if (loadingNode) return;
  const node = el('div', 'wx-mask wx-mask-clear');
  const box = el('div', 'wx-loading');
  box.appendChild(el('div', 'wx-spinner wx-spinner-lg'));
  if (opts && opts.title) box.appendChild(el('div', 'wx-loading-text', opts.title));
  node.appendChild(box);
  layer().appendChild(node);
  loadingNode = node;
}

function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth > 0 || !loadingNode) return;
  loadingNode.remove();
  loadingNode = null;
}

/* ---------------- modal ---------------- */

function modal(opts) {
  const o = opts || {};
  return new Promise(resolve => {
    const mask = el('div', 'wx-mask');
    const box = el('div', 'wx-modal');

    if (o.title) box.appendChild(el('div', 'wx-modal-title', o.title));
    if (o.content) {
      const body = el('div', 'wx-modal-body');
      body.textContent = o.content;
      box.appendChild(body);
    }

    const actions = el('div', 'wx-modal-actions');
    let settled = false;
    const finish = res => {
      if (settled) return;
      settled = true;
      mask.classList.remove('on');
      setTimeout(() => mask.remove(), 200);
      resolve(res);
    };

    if (o.showCancel !== false) {
      const cancel = el('button', 'wx-modal-btn', o.cancelText || '取消');
      cancel.addEventListener('click', () => finish({ confirm: false, cancel: true }));
      actions.appendChild(cancel);
    }
    const ok = el('button', 'wx-modal-btn wx-modal-btn-primary', o.confirmText || '确定');
    ok.addEventListener('click', () => finish({ confirm: true, cancel: false }));
    actions.appendChild(ok);
    box.appendChild(actions);

    mask.appendChild(box);
    mask.addEventListener('click', ev => {
      if (ev.target === mask) finish({ confirm: false, cancel: true });
    });
    layer().appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('on'));
  });
}

/* ---------------- 选择器（picker mode=selector） ---------------- */

function pickerSheet(opts) {
  const o = opts || {};
  const items = Array.isArray(o.items) ? o.items : [];
  const current = Number(o.index) || 0;

  return new Promise(resolve => {
    const mask = el('div', 'wx-mask wx-mask-bottom');
    const sheet = el('div', 'wx-sheet');

    const head = el('div', 'wx-sheet-head');
    const cancel = el('button', 'wx-sheet-cancel', '取消');
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      mask.classList.remove('on');
      setTimeout(() => mask.remove(), 220);
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(null));
    head.appendChild(el('div', 'wx-sheet-title', o.title || '请选择'));
    head.appendChild(cancel);
    sheet.appendChild(head);

    const list = el('div', 'wx-sheet-list');
    items.forEach((item, index) => {
      const row = el('button', 'wx-sheet-item' + (index === current ? ' on' : ''), String(item));
      row.addEventListener('click', () => finish(index));
      list.appendChild(row);
    });
    if (!items.length) list.appendChild(el('div', 'wx-sheet-empty', '暂无可选项'));
    sheet.appendChild(list);

    mask.appendChild(sheet);
    mask.addEventListener('click', ev => {
      if (ev.target === mask) finish(null);
    });
    layer().appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('on'));

    const active = list.querySelector('.wx-sheet-item.on');
    if (active) active.scrollIntoView({ block: 'center' });
  });
}

module.exports = {
  toast,
  showLoading,
  hideLoading,
  modal,
  pickerSheet,
  el,
  layer
};
