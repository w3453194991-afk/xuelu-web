/* ------------------------------------------------------------------ *
 * wx.* 兼容层
 *
 * 小程序页面直接调用 wx.xxx，网页版由这里提供同名同参的实现：
 *   存储 → localStorage（JSON 往返，保持原始类型）
 *   导航 → 哈希路由（host.js）
 *   toast / modal / loading → ui.js
 *   选图 → <input type=file> + canvas 转 JPEG（对齐小程序 compressImage）
 *   云开发 → 不启用（config.USE_CLOUD 为 false），调用即报错并提示
 * ------------------------------------------------------------------ */

'use strict';

const ui = require('./ui.js');
const host = require('./host.js');

/* ---------------- 存储 ---------------- */

const STORE_PREFIX = 'wxstore:';

function getStorageSync(key) {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (raw == null) return '';
    return JSON.parse(raw);
  } catch (err) {
    return '';
  }
}

function setStorageSync(key, value) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('[wx] 本地存储失败（可能超出配额）：', key, err);
  }
}

function removeStorageSync(key) {
  try { localStorage.removeItem(STORE_PREFIX + key); } catch (err) { /* 忽略 */ }
}

function clearStorageSync() {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch (err) { /* 忽略 */ }
}

/* ---------------- 回调封装 ---------------- */

function settle(opts, result) {
  const o = opts || {};
  if (typeof o.success === 'function') o.success(result);
  if (typeof o.complete === 'function') o.complete(result);
  return result;
}

function fail(opts, error) {
  const o = opts || {};
  if (typeof o.fail === 'function') o.fail(error);
  if (typeof o.complete === 'function') o.complete(error);
  return error;
}

/* ---------------- 导航 ---------------- */

function navigateTo(opts) {
  const o = opts || {};
  const ok = host.navigateTo(o.url);
  return ok ? settle(o, { errMsg: 'navigateTo:ok' }) : fail(o, { errMsg: 'navigateTo:fail' });
}

function redirectTo(opts) {
  const o = opts || {};
  const ok = host.redirectTo(o.url);
  return ok ? settle(o, { errMsg: 'redirectTo:ok' }) : fail(o, { errMsg: 'redirectTo:fail' });
}

function switchTab(opts) {
  const o = opts || {};
  const ok = host.switchTab(o.url);
  return ok ? settle(o, { errMsg: 'switchTab:ok' }) : fail(o, { errMsg: 'switchTab:fail' });
}

function reLaunch(opts) {
  const o = opts || {};
  const ok = host.reLaunch(o.url);
  return ok ? settle(o, { errMsg: 'reLaunch:ok' }) : fail(o, { errMsg: 'reLaunch:fail' });
}

function navigateBack(opts) {
  const o = opts || {};
  const ok = host.navigateBack(o.delta || 1);
  return ok ? settle(o, { errMsg: 'navigateBack:ok' }) : fail(o, { errMsg: 'navigateBack:fail' });
}

/* ---------------- 交互反馈 ---------------- */

function showToast(opts) {
  const o = opts || {};
  ui.toast({ title: o.title, icon: o.icon, duration: o.duration });
  return settle(o, { errMsg: 'showToast:ok' });
}

function hideToast() {
  return Promise.resolve({ errMsg: 'hideToast:ok' });
}

function showLoading(opts) {
  const o = opts || {};
  ui.showLoading({ title: o.title });
  return settle(o, { errMsg: 'showLoading:ok' });
}

function hideLoading() {
  ui.hideLoading();
  return Promise.resolve({ errMsg: 'hideLoading:ok' });
}

function showModal(opts) {
  const o = opts || {};
  return ui.modal(o).then(result => {
    if (typeof o.success === 'function') o.success(result);
    if (typeof o.complete === 'function') o.complete(result);
    return result;
  });
}

function showActionSheet(opts) {
  const o = opts || {};
  const items = o.itemList || [];
  return ui.pickerSheet({ items, index: -1, title: o.title || '' }).then(index => {
    if (index == null) return fail(o, { errMsg: 'showActionSheet:fail cancel' });
    return settle(o, { tapIndex: index, errMsg: 'showActionSheet:ok' });
  });
}

/* ---------------- 导航栏 / 页面 ---------------- */

function setNavigationBarTitle(opts) {
  const o = opts || {};
  host.setNavigationTitle(o.title || '');
  return settle(o, { errMsg: 'setNavigationBarTitle:ok' });
}

function pageScrollTo(opts) {
  const o = opts || {};
  window.scrollTo({ top: Number(o.scrollTop) || 0, behavior: o.duration ? 'smooth' : 'auto' });
  return settle(o, { errMsg: 'pageScrollTo:ok' });
}

function stopPullDownRefresh() {
  return Promise.resolve({ errMsg: 'stopPullDownRefresh:ok' });
}

/* ---------------- 设备能力 ---------------- */

function makePhoneCall(opts) {
  const o = opts || {};
  const phoneNumber = String(o.phoneNumber || '');
  if (!phoneNumber) return fail(o, { errMsg: 'makePhoneCall:fail' });

  const isTouch = matchMedia('(hover: none)').matches;
  if (isTouch) {
    window.location.href = 'tel:' + phoneNumber;
    return settle(o, { errMsg: 'makePhoneCall:ok' });
  }
  setClipboardData({ data: phoneNumber });
  ui.toast({ title: '电话已复制：' + phoneNumber });
  return settle(o, { errMsg: 'makePhoneCall:ok' });
}

function setClipboardData(opts) {
  const o = opts || {};
  const data = String(o.data == null ? '' : o.data);
  const done = () => {
    ui.toast({ title: '内容已复制' });
    settle(o, { errMsg: 'setClipboardData:ok' });
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(data).then(done).catch(() => {
      fallbackCopy(data) ? done() : fail(o, { errMsg: 'setClipboardData:fail' });
    });
    return;
  }
  fallbackCopy(data) ? done() : fail(o, { errMsg: 'setClipboardData:fail' });
}

function fallbackCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch (err) {
    return false;
  }
}

function vibrateShort() { return Promise.resolve({ errMsg: 'vibrateShort:ok' }); }
function vibrateLong() { return Promise.resolve({ errMsg: 'vibrateLong:ok' }); }

function getSystemInfoSync() {
  return {
    platform: 'web',
    brand: 'web',
    system: navigator.userAgent,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    language: navigator.language || 'zh-CN',
    version: '1.0.0',
    SDKVersion: '3.0.0'
  };
}

/* ---------------- 图片（选图 / 压缩 / 读文件） ---------------- */

const fileStore = new Map();

function chooseMedia(opts) {
  const o = opts || {};
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = (o.mediaType || ['image']).includes('video') ? 'image/*,video/*' : 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) {
      fail(o, { errMsg: 'chooseMedia:fail cancel' });
      return;
    }
    const tempFilePath = URL.createObjectURL(file);
    fileStore.set(tempFilePath, file);
    settle(o, {
      type: file.type.startsWith('video') ? 'video' : 'image',
      tempFiles: [{ tempFilePath, size: file.size, fileType: file.type.startsWith('video') ? 'video' : 'image' }]
    });
  });

  input.addEventListener('cancel', () => {
    input.remove();
    fail(o, { errMsg: 'chooseMedia:fail cancel' });
  });

  input.click();
}

/* 与小程序一致：等比缩放 + 转 JPEG */
function compressImage(opts) {
  const o = opts || {};
  const image = new Image();

  image.onload = () => {
    const maxWidth = Number(o.compressedWidth) || 1080;
    const scale = Math.min(1, maxWidth / (image.width || maxWidth));
    const width = Math.max(1, Math.round((image.width || maxWidth) * scale));
    const height = Math.max(1, Math.round((image.height || maxWidth) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const quality = Math.max(0.1, Math.min(1, (Number(o.quality) || 80) / 100));
    canvas.toBlob(blob => {
      if (!blob) {
        fail(o, { errMsg: 'compressImage:fail' });
        return;
      }
      const tempFilePath = URL.createObjectURL(blob);
      fileStore.set(tempFilePath, blob);
      settle(o, { tempFilePath });
    }, 'image/jpeg', quality);
  };

  image.onerror = () => fail(o, { errMsg: 'compressImage:fail' });
  image.src = o.src;
}

function readFile(opts) {
  const o = opts || {};
  const source = o.filePath;

  fetch(source)
    .then(response => response.blob())
    .then(blob => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        settle(o, { data: o.encoding === 'base64' || !o.encoding ? payload : dataUrl });
      };
      reader.onerror = () => fail(o, { errMsg: 'readFile:fail' });
      reader.readAsDataURL(blob);
    })
    .catch(() => fail(o, { errMsg: 'readFile:fail' }));
}

function getFileSystemManager() {
  return { readFile, writeFile() {}, access() {}, unlink() {} };
}

/* ---------------- 云开发（未启用） ---------------- */

const cloud = {
  init() {
    console.warn('[wx] 网页版未启用微信云开发，数据走内置本地存储');
  },
  callFunction(opts) {
    const message = '网页版未启用微信云开发（config.USE_CLOUD = false）';
    console.error('[wx] ' + message);
    if (opts && typeof opts.fail === 'function') opts.fail({ errMsg: message });
  },
  database() {
    throw new Error('网页版未启用微信云开发');
  }
};

/* ---------------- 其它 ---------------- */

function nextTick(fn) {
  if (typeof fn === 'function') setTimeout(fn, 0);
}

function canIUse() { return true; }

function noop(name) {
  return function () { return Promise.resolve({ errMsg: name + ':ok' }); };
}

const wx = {
  /* 存储 */
  getStorageSync,
  setStorageSync,
  removeStorageSync,
  clearStorageSync,

  /* 导航 */
  navigateTo,
  redirectTo,
  switchTab,
  reLaunch,
  navigateBack,

  /* 反馈 */
  showToast,
  hideToast,
  showLoading,
  hideLoading,
  showModal,
  showActionSheet,

  /* 页面 */
  setNavigationBarTitle,
  setNavigationBarColor: noop('setNavigationBarColor'),
  pageScrollTo,
  stopPullDownRefresh,
  startPullDownRefresh: noop('startPullDownRefresh'),
  showNavigationBarLoading: noop('showNavigationBarLoading'),
  hideNavigationBarLoading: noop('hideNavigationBarLoading'),

  /* 设备 */
  makePhoneCall,
  setClipboardData,
  getClipboardData: opts => settle(opts, { data: '' }),
  vibrateShort,
  vibrateLong,
  getSystemInfoSync,
  getWindowInfo: getSystemInfoSync,

  /* 媒体 */
  chooseMedia,
  chooseImage: chooseMedia,
  compressImage,
  getFileSystemManager,

  /* 其它 */
  cloud,
  nextTick,
  canIUse,
  env: { USER_DATA_PATH: 'local://' }
};

module.exports = wx;
