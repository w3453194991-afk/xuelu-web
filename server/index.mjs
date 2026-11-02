/* ------------------------------------------------------------------ *
 * 学鹭伴学 · 动态服务端
 *
 *   node server/index.mjs [端口]          # 默认 5180
 *
 * 一个 Node 进程同时提供：
 *   1. 静态资源：dist/ 里编译好的页面
 *   2. JSON 接口：POST /api/<云函数名>，请求 / 响应结构与小程序云函数完全一致
 *      （{ action, token, ... } → { code, data } / { code, message, needLogin }）
 *
 * 业务逻辑直接复用小程序那套 mock 后端（构建时打包成 dist/server/business.cjs），
 * 所以校验规则、订单状态机、名额并发与原来一模一样，只是数据落到了服务器文件里。
 *
 * 环境变量：
 *   PORT / 第一个命令行参数   监听端口
 *   HOST                    监听地址（默认 127.0.0.1；填 0.0.0.0 可让同一局域网
 *                           的手机访问，用于验证多设备共享同一份数据）
 *   XUELU_DATA              数据文件路径（默认 server/data/store.json）
 * ------------------------------------------------------------------ */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createStore } from './store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 5180);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.XUELU_DATA || path.join(here, 'data', 'store.json');
const MAX_BODY = 8 * 1024 * 1024;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ 还没生成，请先执行：node build.mjs');
  process.exit(1);
}

const BUNDLE = path.join(DIST, 'server', 'business.cjs');
if (!fs.existsSync(BUNDLE)) {
  console.error('缺少 dist/server/business.cjs，请先执行：node build.mjs');
  process.exit(1);
}

/* 业务层通过 wx.getStorageSync 读写数据，先把垫片挂到全局 */
const store = createStore(DATA_FILE);
globalThis.wx = store.wx;

const require = createRequire(import.meta.url);
const business = require(BUNDLE);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(DIST, relative);

  if (!file.startsWith(DIST)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 ' + relative);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': buf.length,
      'cache-control': path.extname(file) === '.html' ? 'no-store' : 'public, max-age=300'
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch (err) {
    sendJson(res, 400, { code: 400, message: '非法路径' });
    return;
  }

  /* 健康检查：前端启动时用它判断「有没有服务端」，没有就退回本地演示模式 */
  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      mode: 'server',
      app: business.config.APP_NAME,
      dataBytes: store.stats().bytes,
      time: new Date().toISOString()
    });
    return;
  }

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice('/api/'.length);
    if (req.method !== 'POST') {
      sendJson(res, 405, { code: 405, message: '接口只支持 POST' });
      return;
    }

    let payload = {};
    try {
      const raw = await readBody(req);
      payload = raw ? JSON.parse(raw) : {};
    } catch (err) {
      sendJson(res, 400, { code: 400, message: '请求体不是合法 JSON' });
      return;
    }
    if (!payload || typeof payload !== 'object') payload = {};

    const started = Date.now();
    const result = business.mock.handle(name, payload);
    const cost = Date.now() - started;

    console.log(
      `[api] ${name}/${payload.action || 'run'} → ${result.code === 0 ? 'ok' : result.code} ${cost}ms` +
      (payload.token ? '' : ' (游客)')
    );
    sendJson(res, 200, result);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { code: 405, message: '只支持 GET' });
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log(`学鹭伴学 · 动态网页版  →  http://127.0.0.1:${PORT}`);

  if (HOST === '0.0.0.0') {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .filter(n => n && n.family === 'IPv4' && !n.internal)
      .map(n => `http://${n.address}:${PORT}`);
    if (lan.length) console.log(`同一局域网（手机）可访问：${lan.join('  ')}`);
  }

  console.log(`数据文件：${DATA_FILE}`);
  console.log('（前端启动时会探测 /api/health；静态托管没有这个接口，会自动退回浏览器本地演示模式）');
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n正在关闭…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
