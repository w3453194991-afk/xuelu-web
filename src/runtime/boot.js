/* ------------------------------------------------------------------ *
 * 网页版入口
 *
 * 顺序很重要：先装运行时与全局对象（Page/App/getApp/wx），再执行小程序的
 * app.js 完成 App() 注册，最后启动路由渲染首个页面。
 * 页面脚本在第一次导航时按需 require，与小程序的分包加载语义一致。
 * ------------------------------------------------------------------ */

const host = require('./host.js');
const wxApi = require('./wx.js');
const generated = require('@gen');

globalThis.wx = wxApi;
globalThis.Page = host.Page;
globalThis.App = host.App;
globalThis.getApp = host.getApp;
globalThis.getCurrentPages = host.getCurrentPages;

host.install(generated);

/* 先探测有没有服务端：有 → 页面走 HTTP 接口；没有（静态托管）→ 走内置本地数据。
   探测最多等 1.5 秒，不会拖慢首屏。 */
wxApi.probeBackend().then(() => {
  require('miniprogram/app.js');
  host.start();
});
