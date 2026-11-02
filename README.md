# 学鹭伴学 · 网页版（动态）

由微信小程序源码 `xuelu-miniprogram-cloud` **自动编译**而来的动态网站：
24 个页面、全部业务流程与小程序一致——课程 / 伴学 / 接送 / 学习资源 / 升学规划 /
院校库 / 考公考研考编 / 机构工作台 / 入驻审核 / 订单支付核销 / 学鹭助手。

页面 JS 一行没改，直接把 WXML、WXSS、`wx.*`、`Page/App/setData` 翻译成了浏览器能跑的东西。
后端也一样：小程序自带的那套业务层（`utils/mock.js`）被原样搬到 Node 里，通过
`POST /api/<函数名>` 对外提供服务，**账号、订单、入驻申请都真正存在服务器上**，
换台设备登录同一个手机号就能看到同一份数据。

> **本仓库只包含网页版工程**：编译器、浏览器运行时、服务端、构建脚本，以及已构建好的 `dist/`。
> 小程序的原始源码不在本仓库——重新构建时用 `XUELU_SRC` 指向你自己的小程序源码目录即可。

---

## 界面预览

| 首页 | 服务详情 | 升学规划 |
| --- | --- | --- |
| <img src="docs/screenshots/home.png" width="230"> | <img src="docs/screenshots/detail.png" width="230"> | <img src="docs/screenshots/gaokao.png" width="230"> |

| 机构主页 | 桌面端（480px 手机视口居中） |
| --- | --- |
| <img src="docs/screenshots/merchant.png" width="230"> | <img src="docs/screenshots/desktop.png" width="520"> |

---

## 一、快速开始

```bash
git clone https://github.com/w3453194991-afk/xuelu-web.git
cd xuelu-web

npm start          # 动态服务（页面 + 接口），→ http://127.0.0.1:5180
npm run static     # 纯静态预览（没有后端），→ http://127.0.0.1:5181
npm run dev        # 重新构建并启动动态服务
npm run verify     # 构建 + 32 项交互断言 + 24 页截图查错
npm run reset-data # 清空服务端数据，回到初始种子数据
```

`npm start` 只需要 Node ≥ 18，**没有任何第三方依赖**。

- 数据文件：`server/data/store.json`（首次启动自动写入种子数据，约 50 KB）。
- 平台管理令牌：`xuelu-admin`（`我的 → 平台管理`）。
- 演示账号：直接注册一个 11 位手机号即可，密码 8 位以上。
- 想用手机验证「多设备共享同一份数据」：`HOST=0.0.0.0 npm start`
  （Windows PowerShell：`$env:HOST='0.0.0.0'; npm start`），启动日志会打印局域网地址。

改完小程序源码后重新构建：

```bash
node build.mjs     # 默认读 ../xuelu-src/xuelu-miniprogram-cloud
XUELU_SRC=D:/code/xuelu-miniprogram-cloud node build.mjs   # 或指定路径
```

## 二、目录结构

```
xuelu-web/
  build.mjs              构建入口：小程序源码 → dist/（前端 + 服务端业务包）
  package.json
  server/
    index.mjs            HTTP 服务：静态资源 + POST /api/<函数名>
    store.mjs            存储垫片：wx.getStorageSync 语义 → JSON 文件（原子写）
    reset.mjs            清空数据
  src/
    shell.html           页面外壳（导航栏 / tabBar / 浮层容器）
    shell.css            手机视口、导航栏、tabBar、toast/modal/选择器样式
    base.css             WXML 标签 → 小程序盒模型的基础复位
    runtime/
      boot.js            入口：探测后端 → 跑 app.js → 启动路由
      host.js            页面运行时：Page/App/setData、渲染、事件、路由、导航栏
      wx.js              wx.* 兼容层：存储 / 导航 / 交互 / 选图 / wx.cloud → HTTP
      ui.js              toast、loading、modal、选择器底部弹层
  tools/
    wxml.mjs             WXML → JS 模板编译器
    wxss.mjs             WXSS → CSS 编译器
    bundle.mjs           零依赖 CommonJS 打包器（前端 IIFE / 服务端 CJS）
    cdp.mjs              无头 Chrome DevTools 协议封装
    serve.mjs            纯静态服务器
    flow.mjs             交互流程断言（32 项）
    shoot.mjs            24 页整页截图 + 控制台报错检查
    verify.mjs           上面几件事串起来跑
  dist/                  构建产物
    index.html app.js app.css assets/
    server/business.cjs  服务端业务包（同一套 mock 后端，Node 可直接 require）
```

## 三、转换是怎么做的

小程序和浏览器之间只差四件事，各用一个编译器解决：

| 差异 | 处理方式 |
| --- | --- |
| **WXML 模板** | `tools/wxml.mjs` 把 WXML 编译成拼字符串的 JS 函数。`wx:if/elif/else` → `if/else`，`wx:for` → `for`，表达式放在 `with (data)` 里求值，裸标识符 `{{city}}` 就和小程序一样解析成 `data.city` |
| **WXSS 样式** | `tools/wxss.mjs` 把 `rpx` 换成 `rem`（1rpx = 0.01rem，根字号 = 视口宽/7.5，桌面端封顶 480px）；`page` 选择器 → 外壳根节点；`image` → `img` |
| **模块系统** | 小程序是 CommonJS，浏览器不支持 `require`。`tools/bundle.mjs` 把所有模块包进工厂函数、按 id 注册，构建期把 `require('...')` 改写成解析后的 id |
| **小程序 API** | `src/runtime/*` 实现 `Page/App/getApp`、`setData`、事件委托、页面栈与哈希路由，以及 `wx.*` 的浏览器等价物 |

几个必须处理、否则会出错的细节：

- **页面样式隔离**：小程序里每页样式天然只作用于本页，网页里所有页面共用一个 document。
  构建时给每页 WXSS 加上 `[data-page-id="pages/xxx/xxx"]` 前缀，否则 `.card` `.field` 这些同名 class 会互相污染。
- **dataset 类型**：HTML 属性只有字符串，`data-id="{{item.id}}"` 会变成 `"3"`，
  而页面里写的是 `s.id === id`（数字）。所以 `data-*` 在构建期合并成一个 JSON 放进 `data-ds`，
  运行期 `JSON.parse` 还原数字 / 布尔 / 对象。
- **重渲染后的焦点**：`setData` 走整页重渲染，输入框会被重建。
  每个交互元素带 `data-el="路径"`，渲染前记录焦点与光标位置、滚动位置，渲染后按同一路径还原。
- **异常吞掉**：小程序里 `{{item.tutor.score}}` 取不到值只是渲染空白，浏览器裸跑会抛 `TypeError`。
  每个表达式都包了一层 `try/catch`。
- **100vh 口径**：小程序的 `100vh` 不含原生导航栏，网页里含。
  WXSS 里的 `100vh` 被改写为 `var(--page-h)`，抵消导航栏（和 tabBar）高度。
- **日期选择器**：`picker mode="date"` 换成原生 `input[type=date]`（移动端即系统日历）；
  `mode="selector"` 换成底部弹层，选中后照常派发 `bindchange`。

### 后端是怎么复用的

小程序的 `utils/mock.js` 是个纯 JS 业务层，只通过 `wx.getStorageSync/setStorageSync` 读写，
入口就是 `handle(name, event)` 返回 `{ code, data }`。所以：

1. 构建时把它连同依赖（种子数据、机构校验库、高考/考公模型）打包成 `dist/server/business.cjs`；
2. 服务端在 `require` 之前把 `globalThis.wx` 换成一个「JSON 文件 + 内存缓存」的垫片；
3. `POST /api/<函数名>` 直接把请求体交给 `handle()`。

于是校验规则、订单状态机、名额并发这些逻辑**一份代码，两种运行环境**，不用重写。

## 四、动态后端

### 请求契约

```http
POST /api/services
Content-Type: application/json

{ "action": "list", "token": "登录后的令牌（可省略）" }
```

```json
{ "code": 0, "data": [ ... ] }
{ "code": 401, "message": "登录已失效", "needLogin": true }
```

与小程序云函数的返回结构完全一致，所以 `utils/api.js` 一行没改——
网页版把 `wx.cloud.callFunction` 映射成了这一次 POST。

函数名与云函数一一对应：`auth` `services` `orders` `applications` `institutions`
`profile` `feedback` `learning` `content` `location` `gaokao` `exam` `lists` `plan` `seed` `assistant`。

另有一个健康检查：`GET /api/health` → `{ "ok": true, "mode": "server" }`。

### 自动降级：同一份 dist，两种活法

页面启动时先探测 `api/health`：

- **有服务端** → 走 HTTP，数据存服务器（`document.body[data-backend=server]`）。
- **没有服务端**（丢在 GitHub Pages / OSS 这种纯静态托管）→ 自动退回小程序内置数据层，
  数据存浏览器 localStorage（`data-backend=local`），所有页面照常可点，适合当演示站。

探测最多等 1.5 秒，不会拖慢首屏。

### 部署

- **动态（推荐）**：任意能跑 Node 的机器 / 容器 / Railway、Render、Vercel（Node 运行时）等。

  ```bash
  node build.mjs && npm start     # 默认 5180，可用 PORT 覆盖
  ```

  记得把 `server/data/` 挂成持久卷，否则重启会回到种子数据。
  前面套一层 Nginx 反代 + HTTPS 即可。

- **静态（演示）**：把 `dist/` 丢到 GitHub Pages / OSS / Nginx，自动进入本地数据模式。

### 换成真正的数据库

存储只有一处抽象：`server/store.mjs`（提供 `getStorageSync / setStorageSync / removeStorageSync`）。
把这三个方法换成 MySQL / PostgreSQL / SQLite / Redis 实现，其余代码不用动——业务层只认这三个动作。

数据是扁平集合，键都落在同一个 JSON 里：`users` `sessions` `services` `orders` `applications`
`institutions` `profiles` `feedback` `lists` `plans` `uploads`，迁移时按集合拆表即可。

单进程才是这套实现的前提（Node 单线程保证业务层没有并发写冲突）。要多实例部署时，
请先把 `store.mjs` 换成真正的数据库，而不是共享这个 JSON 文件。

### 上线前的安全清单

当前是**演示级**实现，公网正式运营前建议补上：

- 密码哈希换成 bcrypt / argon2（现在是 `mock.js` 里的轻量 hash）；
- 会话令牌加过期时间与刷新机制（现在长期有效）；
- 平台管理令牌从请求体挪到环境变量 + 服务端校验；
- 加接口级速率限制、审计日志、HTTPS；
- 上传图片改存对象存储，而不是 base64 塞进业务数据。

## 五、和小程序的行为差异

| 项 | 说明 |
| --- | --- |
| 微信一键登录 | 网页里没有微信身份，点「微信一键登录」会提示改用手机号 |
| 支付 | 仍是「下单 → 确认 → 生成核销码」的模拟支付，未接微信支付 / 支付宝 |
| 选图 | 换成系统文件选择，并用 canvas 转成 JPEG（与原 `compressImage` 一致，能通过后端格式校验） |
| 定位 | 保留定位入口，但不会弹系统授权；缺省城市照常显示 |
| 地图 / 分享 / 订阅消息 / 客服 | 未实现（原小程序也没用到地图组件） |
| 返回键 | 用小程序式的导航栏返回按钮，同时兼容浏览器前进后退 |
| 桌面端 | 以 480px 手机视口居中展示（背景带衬底），窗口变窄自动铺满 |
| 数据 | 小程序：本机存储 / 云开发；网页版：服务端 JSON 文件，多设备共享 |

## 六、自检

`npm run verify` 会用临时数据文件起一个动态服务端，然后依次做三件事，任何一项失败都以非 0 退出：

1. **构建**：编译 24 页模板与服务端业务包，顺带检查 WXML 里绑定的事件处理函数在页面 JS 中是否存在。
2. **交互流程（`tools/flow.mjs`，32 项断言）**：首页 → 详情 → 返回、tab 切换、搜索输入
   （重渲染后焦点与内容保持）、注册登录、下单 → 支付确认弹窗 → 核销码、选择器弹层回写、助手对话。
3. **逐页截图（`tools/shoot.mjs`）**：24 页整页截图存到 `.shots/`，并抓 `console.error` 与未捕获异常。

当前状态：24 页全部渲染正常、无控制台报错，交互流程 32/32 通过。

## 七、已知问题

- 原小程序 `pages/gaokao/gaokao.wxml` 引用了 `assets/ip/mascot-study.jpg`，但压缩包里没有这个文件。
  网页版构建时把它置空（并在构建输出里提示），避免出现 404 和裂图；补上图片即可恢复。
- 页面采用「整页重渲染」策略，单页几十个节点，实测无卡顿；
  如果以后要做长列表无限滚动（数千行），建议改成差量更新。
- 未做 SSR，页面内容由客户端渲染，不利于搜索引擎收录（当前是工具型应用，影响有限）。
- 服务端为单进程 + JSON 文件，适合演示与中小流量；横向扩容前请换数据库（见上文）。
