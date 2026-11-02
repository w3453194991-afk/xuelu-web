/* ------------------------------------------------------------------ *
 * 零依赖 CommonJS 打包器
 *
 * 小程序源码是 CommonJS（require / module.exports），浏览器原生不支持。
 * 这里把所有模块包进工厂函数、按 id 注册，构建期把 require('...') 的字面量
 * 改写成解析后的模块 id，运行期只做一次哈希查找。
 *
 * 动态 require（例如 host.js 里 require('miniprogram/' + route + '.js')）
 * 保持原样，运行期用拼好的 id 查表，因此也能正常工作。
 * ------------------------------------------------------------------ */

import path from 'node:path';

const REQUIRE_RE = /require\(\s*(['"])([^'"]+)\1\s*\)/g;

export function createResolver(ids) {
  return function resolve(fromId, request) {
    if (!request.startsWith('.')) return request;

    const dir = path.posix.dirname(fromId);
    const base = path.posix.normalize(path.posix.join(dir, request));
    const candidates = [base, base + '.js', base + '/index.js'];

    for (const candidate of candidates) {
      if (ids.has(candidate)) return candidate;
    }
    throw new Error(`[bundle] 无法解析模块 "${request}"（来自 ${fromId}）`);
  };
}

export function transformRequires(code, id, resolve) {
  return code.replace(REQUIRE_RE, (match, quote, request) => {
    const resolved = resolve(id, request);
    return `require(${JSON.stringify(resolved)})`;
  });
}

/**
 * @param {{entry: string, modules: Map<string, string>, expose?: boolean}} input
 * @returns {string} expose 为 true 时输出 CommonJS 模块（供 Node require），
 *                   否则输出可直接 <script> 引入的浏览器脚本
 */
export function bundle({ entry, modules, expose = false }) {
  const ids = new Set(modules.keys());
  const resolve = createResolver(ids);

  if (!ids.has(entry)) throw new Error(`[bundle] 入口模块不存在：${entry}`);

  const parts = [
    /* 注意：这里不能加 'use strict'，生成的模板用了 with (__S) 解析 data 字段 */
    '(function () {',
    'var __mods = Object.create(null);',
    'var __cache = Object.create(null);',
    'function __require(id) {',
    '  var cached = __cache[id];',
    '  if (cached) return cached.exports;',
    '  var factory = __mods[id];',
    '  if (!factory) throw new Error("[bundle] 模块不存在: " + id);',
    '  var mod = { exports: {} };',
    '  __cache[id] = mod;',
    '  factory(mod, mod.exports, __require);',
    '  return mod.exports;',
    '}'
  ];

  for (const [id, source] of modules) {
    const code = transformRequires(source.replace(/^\uFEFF/, ''), id, resolve);
    parts.push(`__mods[${JSON.stringify(id)}] = function (module, exports, require) {`);
    parts.push(code);
    parts.push('};');
  }

  parts.push(expose
    ? `module.exports = __require(${JSON.stringify(entry)});`
    : `__require(${JSON.stringify(entry)});`);
  parts.push('})();');

  return parts.join('\n');
}
