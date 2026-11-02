/* ------------------------------------------------------------------ *
 * WXML → JavaScript 模板编译器
 *
 * 输入：页面 .wxml 源码
 * 输出：一段函数源码 function (__S, __PATH) { ... return html; }
 *
 * 设计要点
 *   1. 模板在构建期编译成「拼字符串」的函数，运行时直接调用，无需解释器。
 *      表达式按原样写进生成代码，并放在 with (__S) 里求值，这样 WXML 里的
 *      裸标识符（{{city}}）就和小程序一样解析为 data 上的字段。
 *   2. 每个表达式都包一层 __x(fn)：小程序里取不到值（如 item.tutor.x 而
 *      tutor 为空）不会报错，浏览器里裸跑会抛 TypeError，统一吞掉返回空。
 *   3. wx:if / wx:elif / wx:else 链、wx:for 编译成真实的 if / for；
 *      循环变量用 let，嵌套同名 item 也不会互相覆盖。
 *   4. 交互元素带 data-el="<路径>"，供运行时重渲染后恢复焦点与滚动位置。
 *   5. data-* 属性合并成一个 JSON 放进 data-ds，保留数字 / 布尔 / 对象的
 *      原始类型（HTML 属性只有字符串，直接用会破坏 dataset 的类型比较）。
 * ------------------------------------------------------------------ */

/* 小程序专有、浏览器无意义、需要丢弃的属性 */
const DROP_ATTRS = new Set([
  'hover-class', 'hover-start-time', 'hover-stay-time', 'hover-stop-propagation',
  'open-type', 'form-type', 'app-parameter', 'session-from', 'send-message-title',
  'send-message-path', 'send-message-img', 'show-message-card', 'lang',
  'enable-back-to-top', 'refresher-enabled', 'refresher-threshold', 'refresher-default-style',
  'refresher-background', 'refresher-triggered', 'show-mute-btn', 'enable-play-gesture',
  'poster-for-crawler', 'show-center-play-btn', 'enable-progress-gesture',
  'vslide-gesture', 'play-btn-position', 'danmu-list',
  'wx:key', 'wx:if', 'wx:elif', 'wx:else', 'wx:for', 'wx:for-item', 'wx:for-index'
]);

/* 布尔属性：值为表达式时按真值决定是否输出属性名 */
const BOOL_ATTRS = new Set([
  'disabled', 'checked', 'hidden', 'scroll-y', 'scroll-x', 'scroll-with-animation',
  'enable-flex', 'focus', 'password', 'auto-height', 'confirm-hold', 'show-confirm-bar',
  'always-embed'
]);

/* 生成后仍需保留为 CSS 钩子的布尔属性 */
const KEEP_BOOL = new Set(['scroll-y', 'scroll-x', 'scroll-with-animation', 'enable-flex', 'hidden']);

const UNSUPPORTED_TAGS = new Set(['template', 'import', 'include', 'wxs', 'slot']);

const TAG_MAP = { image: 'img' };

/* ---------------- 解析 ---------------- */

export function parseWxml(src) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const n = src.length;
  let i = 0;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      top().children.push({ type: 'text', value: src.slice(i) });
      break;
    }
    if (lt > i) top().children.push({ type: 'text', value: src.slice(i, lt) });

    /* 注释 */
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }

    /* 闭合标签 */
    if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      const name = src.slice(lt + 2, end).trim();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === name) { stack.length = s; break; }
      }
      i = end + 1;
      continue;
    }

    /* 开始标签 */
    let j = lt + 1;
    while (j < n && /[A-Za-z0-9_:-]/.test(src[j])) j++;
    const tag = src.slice(lt + 1, j);
    const attrs = [];
    let selfClose = false;

    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (j >= n) break;
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }

      let k = j;
      while (k < n && !/[\s=/>]/.test(src[k])) k++;
      const name = src.slice(j, k);
      j = k;
      while (j < n && /\s/.test(src[j])) j++;

      let value = null;
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, j + 1);
          value = src.slice(j + 1, end < 0 ? n : end);
          j = end < 0 ? n : end + 1;
        } else {
          let end = j;
          while (end < n && !/[\s>]/.test(src[end])) end++;
          value = src.slice(j, end);
          j = end;
        }
      }
      if (name) attrs.push({ name, value });
    }

    const node = { type: 'element', tag, attrs, children: [] };
    top().children.push(node);
    if (!selfClose) stack.push(node);
    i = j;
  }
  return root;
}

/* ---------------- 表达式工具 ---------------- */

function splitMustache(str) {
  const parts = [];
  let i = 0;
  while (i < str.length) {
    const a = str.indexOf('{{', i);
    if (a < 0) { parts.push({ t: 'text', v: str.slice(i) }); break; }
    const b = str.indexOf('}}', a + 2);
    if (b < 0) { parts.push({ t: 'text', v: str.slice(i) }); break; }
    if (a > i) parts.push({ t: 'text', v: str.slice(i, a) });
    parts.push({ t: 'expr', v: str.slice(a + 2, b).trim() });
    i = b + 2;
  }
  return parts;
}

/* 整值就是一个 {{}} 时返回内部表达式，否则 null（{{a}}{{b}} 不算） */
function exactMustache(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t.startsWith('{{') || !t.endsWith('}}')) return null;
  const parts = splitMustache(t);
  if (parts.length === 1 && parts[0].t === 'expr') return parts[0].v;
  return null;
}

/* 任意属性值 → JS 表达式源码（纯字符串值当字面量） */
function exprOf(v) {
  const inner = exactMustache(v);
  if (inner !== null) return inner;
  return JSON.stringify(v == null ? '' : String(v));
}

/* wx:if / wx:elif 的取值 → 布尔表达式 */
function condOf(v) {
  if (v === undefined) return 'true';
  if (v === null || v === '') return 'true';
  const inner = exactMustache(v);
  if (inner !== null) return `__x(function () { return (${inner}); })`;
  const t = String(v).trim();
  return t === 'false' || t === '0' ? 'false' : 'true';
}

const hasMustache = s => typeof s === 'string' && s.includes('{{');

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return escHtml(s).replace(/"/g, '&quot;');
}

function getAttr(el, name) {
  const a = el.attrs.find(x => x.name === name);
  if (!a) return undefined;
  return a.value === null ? '' : a.value;
}

/* 混合字面量与插值 → 字符串表达式源码 */
function mixedExpr(raw) {
  const parts = splitMustache(raw)
    .map(p => (p.t === 'text'
      ? JSON.stringify(escAttr(p.v))
      : `__e(__x(function () { return (${p.v}); }))`))
    .filter(f => f !== '""');
  return parts.length ? `(${parts.join(' + ')})` : '""';
}

/* ---------------- 生成 ---------------- */

function genText(node) {
  const value = node.value;
  if (!value) return '';
  if (!hasMustache(value)) return `__o.push(${JSON.stringify(escHtml(value))});`;
  const parts = splitMustache(value)
    .map(p => (p.t === 'text'
      ? JSON.stringify(escHtml(p.v))
      : `__e(__x(function () { return (${p.v}); }))`))
    .filter(f => f !== '""');
  if (!parts.length) return '';
  return `__o.push(${parts.join(' + ')});`;
}

/* 一个属性 → 若干 JS 表达式片段（拼进 push 的参数里） */
function genAttr(el, attr) {
  const name = attr.name;
  const raw = attr.value;

  /* 事件绑定：bindtap / catchtap / bind:tap */
  const ev = /^(bind|catch):?([a-zA-Z]+)$/.exec(name);
  if (ev) {
    const kind = ev[1] === 'catch' ? 'catch' : 'on';
    const handler = raw == null ? '' : raw.trim();
    return [JSON.stringify(` data-${kind}-${ev[2]}="${handler}"`)];
  }

  if (name.startsWith('wx:') || DROP_ATTRS.has(name)) return [];

  /* 由 genElement 单独处理的专有属性 */
  if (el.tag === 'picker' && ['range', 'value', 'mode', 'range-key', 'start', 'end', 'fields'].includes(name)) return [];
  if (el.tag === 'scroll-view' && ['scroll-into-view', 'scroll-top'].includes(name)) return [];
  if (el.tag === 'textarea' && name === 'value') return [];

  /* 布尔属性 */
  if (BOOL_ATTRS.has(name)) {
    const keep = KEEP_BOOL.has(name);
    if (raw === null) return keep ? [JSON.stringify(` ${name}`)] : [];
    const inner = exactMustache(raw);
    if (inner !== null) {
      return keep
        ? [`(((${inner}) ? ${JSON.stringify(' ' + name)} : ''))`]
        : [`(((${inner}) ? ${JSON.stringify(' ' + name)} : ''))`];
    }
    const t = String(raw).trim();
    if (t === 'false' || t === '0' || t === '') return [];
    return keep ? [JSON.stringify(` ${name}`)] : [];
  }

  if (raw === null) return [JSON.stringify(` ${name}`)];

  const inner = exactMustache(raw);
  if (inner !== null) {
    return [`${JSON.stringify(' ' + name + '="')} + __e(__x(function () { return (${inner}); })) + '"'`];
  }

  if (!hasMustache(raw)) return [JSON.stringify(` ${name}="${escAttr(raw)}"`)];

  return [`${JSON.stringify(' ' + name + '="')} + ${mixedExpr(raw)} + '"'`];
}

/* data-* 合并成 data-ds（JSON），保留原始类型 */
function genDataset(el) {
  const entries = el.attrs.filter(a => a.name.startsWith('data-'));
  if (!entries.length) return null;

  const pairs = entries.map(a => {
    const key = a.name.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    const raw = a.value;
    if (raw === null) return `${JSON.stringify(key)}: true`;
    const inner = exactMustache(raw);
    if (inner !== null) return `${JSON.stringify(key)}: __x(function () { return (${inner}); })`;
    if (hasMustache(raw)) return `${JSON.stringify(key)}: ${mixedExpr(raw)}`;
    return `${JSON.stringify(key)}: ${JSON.stringify(raw)}`;
  });

  return `' data-ds="' + __e(JSON.stringify({ ${pairs.join(', ')} })) + '"'`;
}

/* input 的 type 映射 */
function inputTypeOf(el) {
  if (getAttr(el, 'password') !== undefined) return { type: 'password', extra: '' };
  const type = (getAttr(el, 'type') || 'text').trim();
  switch (type) {
    case 'number': return { type: 'number', extra: '' };
    case 'digit': return { type: 'number', extra: ' step="any"' };
    case 'idcard': return { type: 'text', extra: ' inputmode="numeric"' };
    case 'safe-password': return { type: 'password', extra: '' };
    default: return { type: 'text', extra: '' };
  }
}

function genElementNoFor(el, ctx, C) {
  const tag = el.tag;
  if (UNSUPPORTED_TAGS.has(tag)) {
    throw new Error(`[wxml] 不支持的标签 <${tag}>：本工程未实现 WXML 模板引用机制`);
  }
  if (tag === 'block') return genNodes(el.children, ctx, C);

  const htmlTag = TAG_MAP[tag] || tag;
  const parts = [JSON.stringify('<' + htmlTag)];

  const interactive = ['input', 'textarea', 'picker', 'scroll-view'].includes(tag);

  if (tag === 'input') {
    const { type, extra } = inputTypeOf(el);
    parts.push(JSON.stringify(` type="${type}"`));
    if (extra) parts.push(JSON.stringify(extra));
  }

  for (const attr of el.attrs) {
    if (tag === 'input' && (attr.name === 'type' || attr.name === 'password')) continue;
    if (tag === 'input' && attr.name === 'confirm-type') {
      const map = { search: 'search', send: 'send', next: 'next', go: 'go', done: 'done' };
      const hint = map[(attr.value || '').trim()];
      if (hint) parts.push(JSON.stringify(` enterkeyhint="${hint}"`));
      continue;
    }
    if (attr.name === 'placeholder-class' || attr.name === 'placeholder-style') continue;
    for (const frag of genAttr(el, attr)) parts.push(frag);
  }

  const ds = genDataset(el);
  if (ds) parts.push(ds);

  /* picker：把选项数组与当前值编码进 data-*，运行时弹底部选择器 */
  if (tag === 'picker') {
    const mode = (getAttr(el, 'mode') || 'selector').trim();
    parts.push(JSON.stringify(` data-picker-mode="${mode}"`));

    const range = getAttr(el, 'range');
    if (range !== undefined) {
      parts.push(`' data-picker-range="' + __e(JSON.stringify(__x(function () { return (${exprOf(range)}); }) || [])) + '"'`);
    }
    const value = getAttr(el, 'value');
    if (value !== undefined) {
      parts.push(`' data-picker-value="' + __e(__x(function () { return (${exprOf(value)}); })) + '"'`);
    }
    const key = getAttr(el, 'range-key');
    if (key) parts.push(JSON.stringify(` data-picker-key="${escAttr(key)}"`));

    const start = getAttr(el, 'start');
    if (start && hasMustache(start)) {
      parts.push(`' data-picker-start="' + __e(__x(function () { return (${exprOf(start)}); })) + '"'`);
    }
    const end = getAttr(el, 'end');
    if (end && hasMustache(end)) {
      parts.push(`' data-picker-end="' + __e(__x(function () { return (${exprOf(end)}); })) + '"'`);
    }
  }

  /* scroll-view：渲染后滚动到指定子节点 */
  if (tag === 'scroll-view') {
    const siv = getAttr(el, 'scroll-into-view');
    if (siv !== undefined) {
      parts.push(`' data-scroll-into="' + __e(__x(function () { return (${exprOf(siv)}); })) + '"'`);
    }
    const st = getAttr(el, 'scroll-top');
    if (st !== undefined) {
      parts.push(`' data-scroll-top="' + __e(__x(function () { return (${exprOf(st)}); })) + '"'`);
    }
  }

  if (interactive) parts.push(`' data-el="' + (${ctx.path}) + '"'`);

  parts.push('">"');

  let open = `__o.push(${parts.join(' + ')});`;

  /* textarea 的 value 只能作为子文本 */
  if (tag === 'textarea') {
    const value = getAttr(el, 'value');
    if (value !== undefined) {
      const inner = exactMustache(value);
      open += inner !== null
        ? `__o.push(__e(__x(function () { return (${inner}); })));`
        : `__o.push(${JSON.stringify(escHtml(value))});`;
    }
  }

  return open + genNodes(el.children, ctx, C) + `__o.push(${JSON.stringify('</' + htmlTag + '>')});`;
}

function genElement(el, ctx, C) {
  const forValue = getAttr(el, 'wx:for');
  if (forValue === undefined) return genElementNoFor(el, ctx, C);

  const n = C.loop++;
  const itemName = (getAttr(el, 'wx:for-item') || 'item').trim();
  const idxName = (getAttr(el, 'wx:for-index') || 'index').trim();
  const listExpr = forValue === '' ? '[]' : exprOf(forValue);

  const stripped = {
    ...el,
    attrs: el.attrs.filter(a => !['wx:for', 'wx:for-item', 'wx:for-index'].includes(a.name))
  };

  const body = genElementNoFor(stripped, { ...ctx, path: `${ctx.path} + "-" + __i${n}` }, C);

  return `{let __l${n} = (${listExpr}); if (!__l${n}) __l${n} = [];` +
    `for (let __i${n} = 0; __i${n} < __l${n}.length; __i${n}++) {` +
    `let ${itemName} = __l${n}[__i${n}]; let ${idxName} = __i${n};` +
    body +
    `}}`;
}

function genChain(chain, ctx, C) {
  let out = '';
  chain.forEach((entry, i) => {
    const node = entry.node;
    const stripped = {
      ...node,
      attrs: node.attrs.filter(a => !['wx:if', 'wx:elif', 'wx:else'].includes(a.name))
    };
    /* 每个分支仍按它在兄弟节点中的真实位置编号，保证 data-el 路径稳定 */
    const body = genElement(stripped, { ...ctx, path: `${ctx.path} + ".${entry.index}"` }, C);
    if (i === 0) out += `if (${condOf(entry.value)}) {${body}}`;
    else if (entry.kind === 'elif') out += ` else if (${condOf(entry.value)}) {${body}}`;
    else out += ` else {${body}}`;
  });
  return out;
}

function genNodes(nodes, ctx, C) {
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.type === 'text') {
      out += genText(node);
      continue;
    }

    const ifValue = getAttr(node, 'wx:if');
    if (ifValue !== undefined) {
      const chain = [{ node, kind: 'if', value: ifValue, index: i }];
      let j = i + 1;
      for (;;) {
        let k = j;
        while (k < nodes.length && nodes[k].type === 'text' && !nodes[k].value.trim()) k++;
        if (k >= nodes.length) break;
        const cand = nodes[k];
        if (cand.type !== 'element') break;
        const elif = getAttr(cand, 'wx:elif');
        const otherwise = getAttr(cand, 'wx:else');
        if (elif !== undefined) { chain.push({ node: cand, kind: 'elif', value: elif, index: k }); j = k + 1; continue; }
        if (otherwise !== undefined) { chain.push({ node: cand, kind: 'else', value: null, index: k }); j = k + 1; }
        break;
      }
      out += genChain(chain, ctx, C);
      i = j - 1;
      continue;
    }

    out += genElement(node, { ...ctx, path: `${ctx.path} + ".${i}"` }, C);
  }
  return out;
}

/* ---------------- 对外接口 ---------------- */

export function compileWxml(src, opts = {}) {
  const root = parseWxml(src);
  const C = { loop: 0 };
  const body = genNodes(root.children, { path: '__PATH' }, C);

  const code =
    'function (__S, __PATH) {' +
    'var __o = [];' +
    'var __x = function (f) { try { return f(); } catch (err) { return undefined; } };' +
    'var __e = function (v) {' +
    'if (v === null || v === undefined) return "";' +
    'return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");' +
    '};' +
    'with (__S) {' +
    body +
    '}' +
    'return __o.join("");}';

  return { code, loops: C.loop, route: opts.route || '' };
}
