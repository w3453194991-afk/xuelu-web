/* 零依赖静态服务器（只验静态产物，没有后端接口）
   node tools/serve.mjs [端口]     默认 5181 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', 'dist');
const port = Number(process.argv[2] || process.env.PORT || 5181);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4'
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ 还没生成，请先执行：node build.mjs');
  process.exit(1);
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (err) {
    res.writeHead(400).end('bad request');
    return;
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const file = path.join(DIST, urlPath);

  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`学鹭伴学 · 静态预览（无后端）  →  http://127.0.0.1:${port}`);
});
