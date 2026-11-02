/* ------------------------------------------------------------------ *
 * 无头 Chrome 的最小 DevTools 协议封装（零依赖）
 *
 * 供 tools/shoot.mjs（整页截图 + 控制台检查）与 tools/flow.mjs
 * （真实交互流程断言）共用。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('找不到 Chrome / Edge，无法做浏览器验证');
}

export async function launchChrome(port) {
  const chrome = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xuelu-cdp-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    'about:blank'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) break;
    } catch (err) { /* 还没起来 */ }
    await sleep(150);
    if (i === 79) throw new Error('Chrome DevTools 端口未就绪');
  }

  return {
    child,
    close() {
      try { child.kill(); } catch (err) { /* 忽略 */ }
      setTimeout(() => {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (err) { /* 忽略 */ }
      }, 400);
    }
  };
}

export async function newTarget(port) {
  return fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(res => res.json());
}

export async function closeTarget(port, id) {
  await fetch(`http://127.0.0.1:${port}/json/close/${id}`).catch(() => {});
}

export class Session {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method) this.listeners.forEach(fn => fn(msg));
    });
  }

  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Session(ws);
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP 超时：' + method));
        }
      }, 20000);
    });
  }

  on(fn) { this.listeners.push(fn); }

  /* 在页面里执行一段表达式并取回可序列化结果 */
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      const detail = res.exceptionDetails;
      throw new Error('页面执行异常：' + ((detail.exception && detail.exception.description) || detail.text));
    }
    return res.result.value;
  }

  close() { try { this.ws.close(); } catch (err) { /* 忽略 */ } }
}
