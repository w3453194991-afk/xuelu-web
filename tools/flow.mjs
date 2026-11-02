/* ------------------------------------------------------------------ *
 * 交互流程验证：用真实浏览器点一遍关键链路
 *
 *   node tools/flow.mjs [端口]
 *
 * 覆盖：路由跳转与返回、tab 切换、搜索输入（焦点/光标保持）、
 *       选择器弹层回写、注册登录、下单支付核销、助手对话。
 * ------------------------------------------------------------------ */

import { sleep, launchChrome, newTarget, closeTarget, Session } from './cdp.mjs';

const BASE = 'http://127.0.0.1:' + Number(process.argv[2] || 5180);
const PORT = 9334;

let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log('  ✔ ' + label);
    return true;
  }
  failures.push(label + (detail ? ' → ' + JSON.stringify(detail) : ''));
  console.log('  ✖ ' + label + (detail ? ' → ' + JSON.stringify(detail) : ''));
  return false;
}

function group(title) {
  console.log('\n■ ' + title);
}

async function main() {
  const chrome = await launchChrome(PORT);
  const target = await newTarget(PORT);
  const s = await Session.open(target.webSocketDebuggerUrl);
  const pageErrors = [];

  s.on(msg => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push('未捕获异常: ' + ((d.exception && d.exception.description) || d.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push('console.error: ' + msg.params.args.map(a => a.value || a.description || '').join(' '));
    }
  });

  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Emulation.setDeviceMetricsOverride', {
    width: 480, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await s.send('Page.navigate', { url: `${BASE}/#/pages/index/index` });
  await sleep(1600);

  const hash = () => s.eval('location.hash');
  const title = () => s.eval('document.title');
  const count = sel => s.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

  const clickSel = sel => s.eval(`(() => {
    const node = document.querySelector(${JSON.stringify(sel)});
    if (!node) return false;
    node.click();
    return true;
  })()`);

  /* 按可见文字点击最近的绑定了 tap 的元素 */
  const clickText = text => s.eval(`(() => {
    const wanted = ${JSON.stringify(text)};
    const nodes = [...document.querySelectorAll('.wx-page *')]
      .filter(n => n.children.length === 0 && n.textContent.trim() === wanted);
    if (!nodes.length) return false;
    const target = nodes[0].closest('[data-on-tap]') || nodes[0];
    target.click();
    return true;
  })()`);

  const typeInto = (index, value) => s.eval(`(() => {
    const inputs = [...document.querySelectorAll('.wx-page input.input, .wx-page input')];
    const el = inputs[${index}];
    if (!el) return false;
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  try {
    /* ---------- 1. 首页 ---------- */
    group('首页与详情跳转');
    const cards = await count('.wx-page .card.svc');
    check('首页渲染出课程卡片', cards > 0, { cards });
    check('导航栏标题', (await title()) === '学鹭伴学');

    await clickSel('.wx-page .card.svc');
    await sleep(600);
    check('点击卡片进入详情页', (await hash()).includes('pages/detail/detail'), await hash());
    check('详情页标题正确', (await title()) === '服务详情');
    check('详情页渲染价格', (await count('.wx-page .price')) > 0);

    await clickSel('#wx-nav-back');
    await sleep(600);
    check('返回按钮回到首页', (await hash()).includes('pages/index/index'), await hash());

    /* ---------- 2. tab 与搜索 ---------- */
    group('tab 切换与搜索输入');
    await s.eval(`document.querySelectorAll('.wx-tab')[1].click()`);
    await sleep(700);
    check('切到「学习」页', (await hash()).includes('pages/learning/learning'), await hash());
    check('tabBar 高亮同步', (await s.eval(`(document.querySelector('.wx-tab.on') || {}).textContent || ''`)).trim() === '学习');

    await s.eval(`document.querySelectorAll('.wx-tab')[0].click()`);
    await sleep(700);

    const beforeSearch = await count('.wx-page .card.svc');
    await s.eval(`(() => {
      const input = document.querySelector('.wx-page .search input');
      input.focus();
      input.value = '美术';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(400);

    const focused = await s.eval(`(() => {
      const input = document.querySelector('.wx-page .search input');
      return { value: input.value, focused: document.activeElement === input };
    })()`);
    check('重渲染后输入内容保留', focused.value === '美术', focused);
    check('重渲染后焦点仍在输入框', focused.focused, focused);

    /* 小程序的搜索是「输入 + 点击搜索」，不是随输入实时过滤 */
    await clickText('搜索');
    await sleep(500);
    const afterSearch = await count('.wx-page .card.svc');
    check('搜索结果被过滤', afterSearch > 0 && afterSearch < beforeSearch, { beforeSearch, afterSearch });

    /* ---------- 3. 注册 ---------- */
    group('注册与登录态');
    await s.eval(`document.querySelectorAll('.wx-tab')[3].click()`);
    await sleep(700);
    check('切到「我的」页', (await hash()).includes('pages/mine/mine'), await hash());

    const opened = (await clickText('去登录')) || (await clickText('登录 / 注册'));
    await sleep(700);
    check('打开登录页', opened && (await hash()).includes('pages/login/login'), await hash());

    await s.eval(`document.querySelectorAll('.wx-page .seg')[1].click()`);
    await sleep(250);
    check('切换到注册模式', (await s.eval(`document.querySelectorAll('.wx-page .seg')[1].classList.contains('seg-on')`)) === true);

    await typeInto(0, '13900001111');
    await sleep(200);
    await typeInto(1, 'test1234');
    await sleep(250);

    check('密码框输入后焦点保持', (await s.eval(`document.activeElement === document.querySelectorAll('.wx-page input.input')[1]`)) === true);

    await s.eval(`document.querySelector('.wx-page button.btn-block').click()`);
    await sleep(1400);

    const tokenSaved = await s.eval(`Object.keys(localStorage).some(k => k.indexOf('xuelu.cloud.token') >= 0)`);
    check('注册成功并写入本地令牌', tokenSaved);
    check('注册后回到「我的」', (await hash()).includes('pages/mine/mine'), await hash());
    check('我的页显示已登录', (await s.eval(`document.querySelector('.wx-page').innerText.includes('退出')`)) === true);

    /* ---------- 4. 下单 ---------- */
    group('下单与支付');
    await s.eval(`location.hash = '#/pages/detail/detail?id=c1'`);
    await sleep(800);
    check('详情页可打开', (await hash()).includes('pages/detail/detail'));

    await clickSel('.wx-page .footer-bar .btn');
    await sleep(900);
    check('进入报名页', (await hash()).includes('pages/booking/booking'), await hash());

    await typeInto(0, '小明');
    await sleep(200);
    await typeInto(1, '13900001111');
    await sleep(300);

    await clickSel('.wx-page .footer-bar .btn');
    await sleep(1600);
    check('下单后跳转订单页', (await hash()).includes('pages/orders/orders'), await hash());
    check('订单列表出现记录', (await count('.wx-page .card')) > 0);

    const payClicked = await clickText('立即支付');
    await sleep(600);
    check('点击「立即支付」', payClicked === true);
    check('支付前弹出确认弹窗', (await count('.wx-modal')) === 1);

    await clickSel('.wx-modal-btn-primary');
    await sleep(1500);
    check('确认后弹窗关闭', (await count('.wx-modal')) === 0);
    check('支付后出现核销码', (await s.eval(`document.querySelector('.wx-page').innerText.includes('核销码')`)) === true);

    /* ---------- 5. 选择器 ---------- */
    group('选择器弹层');
    await s.eval(`location.hash = '#/pages/gaokao/gaokao'`);
    await sleep(1000);

    const beforePick = await s.eval(`document.querySelector('.wx-page picker').textContent.trim()`);
    await clickSel('.wx-page picker');
    await sleep(500);
    check('点击 picker 弹出选择器', (await count('.wx-sheet')) === 1);
    const options = await count('.wx-sheet-item');
    check('选择器列出选项', options > 3, { options });

    await s.eval(`document.querySelectorAll('.wx-sheet-item')[3].click()`);
    await sleep(600);
    const afterPick = await s.eval(`document.querySelector('.wx-page picker').textContent.trim()`);
    check('选择结果回写到页面', afterPick !== beforePick, { beforePick, afterPick });
    check('选择后弹层关闭', (await count('.wx-sheet')) === 0);

    /* ---------- 6. 助手 ---------- */
    group('学鹭助手对话');
    await s.eval(`location.hash = '#/pages/assistant/assistant'`);
    await sleep(1000);
    const beforeMsg = await count('.wx-page .bubble');
    check('助手页渲染消息', beforeMsg > 0, { beforeMsg });

    await s.eval(`(() => {
      const input = document.querySelector('.wx-page input');
      if (!input) return false;
      input.focus();
      input.value = '有哪些初中数学课';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    const sent = (await clickText('发送')) || (await s.eval(`(() => {
      const button = document.querySelector('.wx-page .composer button, .wx-page .chat button');
      if (!button) return false;
      button.click();
      return true;
    })()`));
    await sleep(1500);
    const afterMsg = await count('.wx-page .bubble');
    check('发送后出现新消息', sent && afterMsg > beforeMsg, { beforeMsg, afterMsg });
  } finally {
    if (pageErrors.length) {
      console.log('\n■ 页面错误');
      pageErrors.slice(0, 10).forEach(e => console.log('  ! ' + e.slice(0, 300)));
    }
    s.close();
    await closeTarget(PORT, target.id);
    chrome.close();
  }

  console.log('');
  console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    failures.forEach(f => console.log('  ✖ ' + f));
    process.exitCode = 1;
  }
  if (pageErrors.length) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
