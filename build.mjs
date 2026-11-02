/* ------------------------------------------------------------------ *
 * 构建：小程序源码 → 可部署的静态网页
 *
 *   node build.mjs
 *
 * 输入  ../xuelu-src/xuelu-miniprogram-cloud/miniprogram
 * 输出  ./dist（index.html / app.js / app.css / assets）
 *
 * 所有转换都是确定性的、零第三方依赖，可重复构建。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWxml } from './tools/wxml.mjs';
import { convertWxss } from './tools/wxss.mjs';
import { bundle } from './tools/bundle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(here, '..');
const SRC = process.env.XUELU_SRC
  ? path.resolve(process.env.XUELU_SRC)
  : path.join(PROJECT, 'xuelu-src', 'xuelu-miniprogram-cloud');
const MINI = path.join(SRC, 'miniprogram');
const DIST = path.join(here, 'dist');

const warnings = [];

function log(msg) {
  process.stdout.write(msg + '\n');
}

function fail(msg) {
  process.stderr.write('✖ ' + msg + '\n');
  process.exitCode = 1;
  throw new Error(msg);
}

/* ---------------- 收集模块 ---------------- */

function addTree(map, dir, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      addTree(map, full, prefix + entry.name + '/');
    } else if (entry.name.endsWith('.js')) {
      map.set(prefix + entry.name, fs.readFileSync(full, 'utf8'));
    }
  }
}

/* 源码里存在指向缺失图片的字面量引用（例如 mascot-study.jpg），
 * 网页里会变成 404 + 裂图，构建期直接摘掉，并记一条警告。 */
function dropMissingAssets(wxml, route) {
  return wxml.replace(/(src|poster)="\/?([^"{}]+\.(?:png|jpe?g|webp|gif|svg|mp4))"/g, (match, attr, relative) => {
    if (!relative.startsWith('assets/')) return match;
    if (fs.existsSync(path.join(MINI, relative))) return match;
    warnings.push(`${route}.wxml: 引用了不存在的资源 ${relative}，已置空`);
    return `${attr}=""`;
  });
}

/* 把 config.js 切到「云函数模式」：网页版里 wx.cloud.callFunction 由运行时
 * 映射成 POST /api/<name>，服务端不在时 init 会抛错、自动退回本地数据。 */
function patchConfig(source) {
  if (!source.includes('const USE_CLOUD = false;')) {
    fail('miniprogram/utils/config.js 结构与预期不符：找不到 "const USE_CLOUD = false;"');
  }
  const out = source
    .replace('const USE_CLOUD = false;', 'const USE_CLOUD = true;')
    .replace(/const CLOUD_ENV = '';/, "const CLOUD_ENV = 'web';");

  if (!out.includes("const CLOUD_ENV = 'web';")) {
    fail('miniprogram/utils/config.js 结构与预期不符：找不到空的 CLOUD_ENV');
  }
  return out;
}

/* ---------------- 主流程 ---------------- */

function main() {
  if (!fs.existsSync(MINI)) fail(`找不到小程序源码目录：${MINI}`);

  const appJsonPath = path.join(MINI, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const pages = appJson.pages || [];
  if (!pages.length) fail('app.json 里没有页面');

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  /* ---- 1. 编译页面模板与样式 ---- */
  const templateParts = ['var templates = Object.create(null);'];
  const pageMeta = {};
  const pageCss = [];
  let loopTotal = 0;

  for (const route of pages) {
    const wxmlPath = path.join(MINI, route + '.wxml');
    if (!fs.existsSync(wxmlPath)) fail(`缺少页面模板：${route}.wxml`);

    let compiled;
    const wxmlSource = dropMissingAssets(fs.readFileSync(wxmlPath, 'utf8'), route);
    try {
      compiled = compileWxml(wxmlSource, { route });
    } catch (err) {
      fail(`编译 ${route}.wxml 失败：${err.message}`);
    }
    templateParts.push(`templates[${JSON.stringify(route)}] = ${compiled.code};`);
    loopTotal += compiled.loops;

    const jsonPath = path.join(MINI, route + '.json');
    pageMeta[route] = fs.existsSync(jsonPath)
      ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      : {};

    const wxssPath = path.join(MINI, route + '.wxss');
    if (fs.existsSync(wxssPath)) {
      const converted = convertWxss(fs.readFileSync(wxssPath, 'utf8'), { route });
      pageCss.push(`/* ${route}.wxss */\n${converted.css}`);
      converted.warnings.forEach(w => warnings.push(`${route}.wxss: ${w}`));
    }

    /* 事件处理函数是否真的存在（低成本自检） */
    const wxml = wxmlSource;
    const pageJsPath = path.join(MINI, route + '.js');
    if (fs.existsSync(pageJsPath)) {
      const js = fs.readFileSync(pageJsPath, 'utf8');
      const handlers = new Set();
      const re = /(?:bind|catch):?[a-zA-Z]+="([a-zA-Z0-9_$]+)"/g;
      let m;
      while ((m = re.exec(wxml))) handlers.add(m[1]);
      handlers.forEach(name => {
        const declared = new RegExp(`(^|[\\s,{])${name}\\s*[(:]`, 'm').test(js);
        if (!declared) warnings.push(`${route}: 事件处理函数 ${name} 在 js 里未找到`);
      });
    }
  }

  templateParts.push(
    'module.exports = { templates: templates, pages: ' + JSON.stringify(pages) +
    ', window: ' + JSON.stringify(appJson.window || {}) +
    ', tabBar: ' + JSON.stringify(appJson.tabBar || {}) +
    ', pageMeta: ' + JSON.stringify(pageMeta) + ' };'
  );

  /* ---- 2. 组装 CSS ---- */
  const appWxssPath = path.join(MINI, 'app.wxss');
  if (!fs.existsSync(appWxssPath)) fail('缺少 app.wxss');
  const appCss = convertWxss(fs.readFileSync(appWxssPath, 'utf8'), { isApp: true });
  appCss.warnings.forEach(w => warnings.push(`app.wxss: ${w}`));

  const css = [
    '/* 基础复位（WXML 标签 → 小程序盒模型） */',
    fs.readFileSync(path.join(here, 'src/base.css'), 'utf8'),
    '/* app.wxss */',
    appCss.css,
    '/* 页面样式（按 [data-page-id] 作用域隔离） */',
    pageCss.join('\n\n'),
    '/* 网页外壳：导航栏 / tabBar / 浮层 */',
    fs.readFileSync(path.join(here, 'src/shell.css'), 'utf8')
  ].join('\n\n');

  fs.writeFileSync(path.join(DIST, 'app.css'), css);

  /* ---- 3. 打包脚本 ---- */
  const modules = new Map();
  addTree(modules, MINI, 'miniprogram/');
  addTree(modules, path.join(here, 'src', 'runtime'), 'src/runtime/');
  modules.set('@gen', templateParts.join('\n'));

  /* 网页版统一走「云函数模式」：运行时的 wx.cloud.callFunction 被映射成 HTTP 请求。
     服务端不可用（纯静态托管）时，wx.cloud.init 会失败，自动退回内置本地数据。 */
  const configId = 'miniprogram/utils/config.js';
  modules.set(configId, patchConfig(modules.get(configId)));

  const js = bundle({ entry: 'src/runtime/boot.js', modules });
  fs.writeFileSync(path.join(DIST, 'app.js'), js);

  /* ---- 3b. 服务端业务包：同一套 mock 后端，打成 Node 可 require 的 CJS ---- */
  const serverModules = new Map();
  addTree(serverModules, MINI, 'miniprogram/');
  serverModules.set(
    'server/entry.js',
    "module.exports = {\n" +
    "  mock: require('miniprogram/utils/mock.js'),\n" +
    "  config: require('miniprogram/utils/config.js')\n" +
    "};\n"
  );

  const serverJs = bundle({ entry: 'server/entry.js', modules: serverModules, expose: true });
  fs.mkdirSync(path.join(DIST, 'server'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'server', 'business.cjs'), serverJs);

  /* ---- 4. 外壳 HTML ---- */
  const shell = fs.readFileSync(path.join(here, 'src', 'shell.html'), 'utf8');
  fs.writeFileSync(
    path.join(DIST, 'index.html'),
    shell.replace('<title>学鹭伴学</title>', '<title>学鹭伴学</title>')
  );

  /* ---- 5. 静态资源 ---- */
  const assetsFrom = path.join(MINI, 'assets');
  if (fs.existsSync(assetsFrom)) {
    fs.cpSync(assetsFrom, path.join(DIST, 'assets'), { recursive: true });
  }

  /* ---- 6. 报告 ---- */
  const kb = file => (fs.statSync(file).size / 1024).toFixed(1) + ' KB';
  log(`✔ 页面模板 ${pages.length} 个（wx:for ${loopTotal} 处）`);
  log(`✔ dist/index.html  ${kb(path.join(DIST, 'index.html'))}`);
  log(`✔ dist/app.css     ${kb(path.join(DIST, 'app.css'))}`);
  log(`✔ dist/app.js      ${kb(path.join(DIST, 'app.js'))}（${modules.size} 个模块）`);
  log(`✔ dist/server/business.cjs  ${kb(path.join(DIST, 'server', 'business.cjs'))}（服务端业务包）`);
  if (fs.existsSync(path.join(DIST, 'assets'))) log('✔ dist/assets      静态资源已复制');

  if (warnings.length) {
    log('');
    log(`⚠ ${warnings.length} 条提示：`);
    warnings.forEach(w => log('  · ' + w));
  } else {
    log('');
    log('没有警告。');
  }
}

main();
