/* ------------------------------------------------------------------ *
 * 逐页验证：整页截图 + 控制台报错
 *
 *   node tools/shoot.mjs [端口]
 *
 * 输出 .shots/<页面>.png，并汇总每个页面的控制台错误 / 未捕获异常。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sleep, launchChrome, newTarget, closeTarget, Session } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, '..', '.shots');
const BASE = 'http://127.0.0.1:' + Number(process.argv[2] || 5180);
const PORT = 9333;
const VIEWPORT = { width: 480, height: 900 };

const PAGES = [
  ['index', 'pages/index/index'],
  ['learning', 'pages/learning/learning'],
  ['orders', 'pages/orders/orders'],
  ['mine', 'pages/mine/mine'],
  ['login', 'pages/login/login'],
  ['detail-c1', 'pages/detail/detail?id=c1'],
  ['booking-c1', 'pages/booking/booking?id=c1'],
  ['learning-detail-l1', 'pages/learning-detail/learning-detail?id=l1'],
  ['gaokao', 'pages/gaokao/gaokao'],
  ['gaokao-schools', 'pages/gaokao-schools/gaokao-schools'],
  ['gaokao-detail-u001', 'pages/gaokao-detail/gaokao-detail?id=u001'],
  ['exam', 'pages/exam/exam'],
  ['exam-detail', 'pages/exam-detail/exam-detail?kind=gwy&id=gwy-10-g0'],
  ['institution', 'pages/institution/institution'],
  ['join', 'pages/join/join'],
  ['companion', 'pages/companion/companion'],
  ['feedback', 'pages/feedback/feedback'],
  ['help', 'pages/help/help'],
  ['institutions', 'pages/institutions/institutions'],
  ['merchant', 'pages/merchant/merchant?name=' + encodeURIComponent('拾光艺术中心')],
  ['admin', 'pages/admin/admin'],
  ['assistant', 'pages/assistant/assistant'],
  ['service', 'pages/service/service'],
  ['transport', 'pages/transport/transport']
];

async function shootOne(session, name, route) {
  const problems = [];
  session.on(msg => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      problems.push('未捕获异常: ' + ((d.exception && d.exception.description) || d.text));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      problems.push('console: ' + msg.params.entry.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      if (type !== 'error' && type !== 'warning') return;
      const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
      problems.push(`console.${type}: ` + text.slice(0, 240));
    }
  });

  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Log.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 2,
    mobile: false
  });

  await session.send('Page.navigate', { url: `${BASE}/#/${route}` });
  await sleep(1600);

  const metrics = await session.send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize || VIEWPORT;
  const height = Math.max(VIEWPORT.height, Math.min(Math.round(size.height), 3200));

  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height, scale: 1 }
  });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(shot.data, 'base64'));

  const info = JSON.parse(await session.eval(`(() => {
    const page = document.querySelector('.wx-page');
    return JSON.stringify({
      title: document.title,
      nodes: page ? page.querySelectorAll('*').length : 0,
      text: page ? page.innerText.replace(/\\s+/g, ' ').slice(0, 140) : ''
    });
  })()`));

  return { problems, info };
}

async function main() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const chrome = await launchChrome(PORT);
  let failed = 0;

  try {
    for (const [name, route] of PAGES) {
      const target = await newTarget(PORT);
      const session = await Session.open(target.webSocketDebuggerUrl);
      try {
        const { problems, info } = await shootOne(session, name, route);
        const empty = !info.nodes;
        const bad = problems.length || empty;
        if (bad) failed++;
        console.log(`${bad ? '✖' : '✔'} ${name.padEnd(20)} nodes=${String(info.nodes).padStart(4)}  ${info.title}`);
        problems.slice(0, 6).forEach(p => console.log('    ! ' + p));
        if (empty) console.log('    ! 页面没有任何节点');
        if (!empty && info.nodes < 15) console.log('    · ' + info.text);
      } finally {
        session.close();
        await closeTarget(PORT, target.id);
      }
    }
  } finally {
    chrome.close();
  }

  console.log('');
  console.log(failed ? `✖ ${failed} 个页面有问题` : '✔ 全部页面渲染正常，无控制台错误');
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
