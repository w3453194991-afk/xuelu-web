/* ------------------------------------------------------------------ *
 * WXSS → CSS 编译器
 *
 *   1. rpx → rem：1rpx = 0.01rem，配合 html { font-size: 视口宽/7.5 }
 *      即 750rpx = 满宽，和 rpx 在小程序里的语义一致（桌面端顶部有 max-width 封顶）。
 *   2. page 选择器 → 小程序里代表「页面根」，网页版映射到外壳根节点 .wx-root。
 *   3. image 元素 → img：浏览器里 <image> 是 <img> 的别名，必须显式改名，
 *      否则 object-fit 等属性无法按标签选择器命中。
 *   4. 每个页面的 WXSS 加上 [data-page-id="..."] 作用域前缀：小程序里页面
 *      样式天然只作用于本页，网页版所有页面共用一个 document，必须手动隔离，
 *      否则同名 class（.hero / .card / .field）会互相污染。
 * ------------------------------------------------------------------ */

const ROOT_SELECTOR = '.wx-root';

function readUntil(src, start, stops) {
  let i = start;
  const n = src.length;
  let depth = 0;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth <= 0 && stops.includes(c)) break;
    i++;
  }
  return { text: src.slice(start, i), end: i };
}

function readBrace(src, braceIndex) {
  let i = braceIndex + 1;
  const start = i;
  const n = src.length;
  let depth = 1;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { inner: src.slice(start, i), end: i + 1 };
    }
    i++;
  }
  return { inner: src.slice(start), end: n };
}

function skipString(src, i) {
  const quote = src[i];
  i++;
  while (i < src.length && src[i] !== quote) {
    if (src[i] === '\\') i++;
    i++;
  }
  return i + 1;
}

function skipComment(src, i) {
  const end = src.indexOf('*/', i + 2);
  return end < 0 ? src.length : end + 2;
}

function skipWs(src, i) {
  const n = src.length;
  while (i < n) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src[i] === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    break;
  }
  return i;
}

function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' || c === "'") { i = skipString(str, i) - 1; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) { out.push(str.slice(last, i)); last = i + 1; }
  }
  out.push(str.slice(last));
  return out;
}

function fmtRem(num) {
  const v = parseFloat(num) * 0.01;
  if (!Number.isFinite(v)) return num + 'rem';
  return String(Math.round(v * 100000) / 100000) + 'rem';
}

/* 只转换数值与资源路径 */
function convertValues(body) {
  return body
    .replace(/(-?\d*\.?\d+)rpx/g, (m, num) => fmtRem(num))
    /* 小程序的 100vh 指「原生导航栏以下」的可视区；网页里 100vh 含导航栏，
       改写成 --page-h 抵消导航栏（含 tabBar）高度，页面才不会溢出屏幕 */
    .replace(/\b100vh\b/g, 'var(--page-h)')
    .replace(/url\(\s*(['"]?)\/assets\//g, 'url($1assets/')
    .replace(/url\(\s*(['"]?)~?@\//g, 'url($1');
}

function mapSelector(selector, ctx) {
  if (!selector) return '';
  let s = selector;

  /* 元素名映射：page → 根节点；image → img */
  s = s.replace(/(^|[\s>+~])(page|image)(?=$|[\s.:#[>+~])/g, (m, pre, tag) => {
    if (tag === 'image') return pre + 'img';
    return pre + (ctx.isApp ? ROOT_SELECTOR : ctx.scope);
  });

  if (ctx.isApp) return s;
  if (/^(:root|html|body)(?![\w-])/.test(s)) return s;
  if (s.startsWith(ctx.scope)) return s;
  return ctx.scope + ' ' + s;
}

function convertRules(src, ctx) {
  const out = [];
  const n = src.length;
  let i = 0;

  while (i < n) {
    i = skipWs(src, i);
    if (i >= n) break;

    if (src[i] === '@') {
      const at = readUntil(src, i, '{;');
      const head = at.text.trim();

      /* @import / @charset：无对应物，丢弃并记录 */
      if (src[at.end] === ';' || at.end >= n) {
        if (/^@import/i.test(head)) ctx.warnings.push(`忽略 ${head}（请把这些样式直接内联到 wxss）`);
        i = at.end + 1;
        continue;
      }

      const block = readBrace(src, at.end);
      const name = (head.split(/\s+/)[0] || '').toLowerCase();

      if (name === '@media' || name === '@supports' || name === '@container' || name === '@layer') {
        out.push(convertValues(head) + '{' + convertRules(block.inner, ctx) + '}');
      } else {
        /* @keyframes / @font-face：内部不是选择器，只转换数值 */
        out.push(convertValues(head) + '{' + convertValues(block.inner) + '}');
      }
      i = block.end;
      continue;
    }

    const sel = readUntil(src, i, '{');
    if (src[sel.end] !== '{') break;

    const block = readBrace(src, sel.end);
    const selectors = splitTopLevel(sel.text, ',')
      .map(s => mapSelector(s.trim(), ctx))
      .filter(Boolean);

    if (selectors.length) {
      out.push(selectors.join(',\n') + '{' + convertValues(block.inner) + '}');
    }
    i = block.end;
  }

  return out.join('\n');
}

/**
 * @param {string} css  WXSS 源码
 * @param {{isApp?: boolean, route?: string}} opts
 */
export function convertWxss(css, opts = {}) {
  const isApp = !!opts.isApp;
  const route = opts.route || '';
  const ctx = {
    isApp,
    scope: `[data-page-id="${route}"]`,
    warnings: []
  };
  const out = convertRules(css, ctx);
  return { css: out, warnings: ctx.warnings };
}
