/* ------------------------------------------------------------------ *
 * 一键验证：构建 → 起本地服务 → 交互流程断言 → 逐页截图查错
 *
 *   node tools/verify.mjs
 *
 * 退出码非 0 表示有页面或流程没通过。
 * ------------------------------------------------------------------ */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5199;

function run(script) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.resolve(here, script), String(PORT)], { stdio: 'inherit' });
    child.on('exit', code => resolve(code || 0));
  });
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (res.ok) return;
    } catch (err) { /* 还没起来 */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('本地服务没起来');
}

let server = null;
let code = 0;

try {
  code = await run('../build.mjs');
  if (code !== 0) throw new Error('构建失败');

  /* 必须在构建之后启动：build 会清空 dist，先起的服务会因为找不到 index.html 直接退出 */
  server = spawn(process.execPath, [path.join(here, 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await waitForServer();

  const flow = await run('flow.mjs');
  const shots = await run('shoot.mjs');
  code = flow || shots;
} catch (err) {
  console.error('✖ ' + err.message);
  code = 1;
} finally {
  if (server) {
    try { server.kill(); } catch (err) { /* 忽略 */ }
  }
}

console.log('');
console.log(code === 0 ? '✔ 验证通过' : '✖ 验证未通过');
process.exitCode = code;
