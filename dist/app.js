(function () {
var __mods = Object.create(null);
var __cache = Object.create(null);
function __require(id) {
  var cached = __cache[id];
  if (cached) return cached.exports;
  var factory = __mods[id];
  if (!factory) throw new Error("[bundle] 模块不存在: " + id);
  var mod = { exports: {} };
  __cache[id] = mod;
  factory(mod, mod.exports, __require);
  return mod.exports;
}
__mods["miniprogram/app.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");

App({
  globalData: {
    /* 当前登录账号：{id, phone, role}，与本地存储同步 */
    user: api.user(),
    /* 服务目录缓存，详情页免二次请求 */
    services: [],
    servicesAt: 0,
    /* 学习资源缓存 */
    learningItems: [],
    /* 跨页默认分类：首页「职考技能」进入学习页时用一次 */
    learningKind: ''
  },

  onLaunch() {
    this.refreshSession();
  },

  /* 用本地令牌换一次会话，失效就清掉本地登录态 */
  refreshSession() {
    if (!api.token()) {
      this.globalData.user = null;
      api.clearUser();
      return Promise.resolve(null);
    }
    return api.auth.me().then(res => {
      if (!res.ok || !res.data || !res.data.authenticated) {
        this.logoutLocal();
        return null;
      }
      const row = api.setUser(res.data.user);
      this.globalData.user = row;
      return row;
    });
  },

  setSession(userRow) {
    const row = api.setUser(userRow);
    this.globalData.user = row;
    return row;
  },

  logoutLocal() {
    api.clearToken();
    api.clearUser();
    this.globalData.user = null;
  },

  cacheServices(list) {
    this.globalData.services = Array.isArray(list) ? list : [];
    this.globalData.servicesAt = Date.now();
  },

  findService(id) {
    return (this.globalData.services || []).find(row => row && row.id === id) || null;
  }
});

};
__mods["miniprogram/pages/admin/admin.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

const TOKEN_KEY = 'xuelu.cloud.adminToken';

Page({
  data: {
    token: '',
    authed: false,
    loading: false,
    tab: 'apps',
    apps: [],
    orders: [],
    stats: { orders: 0, paid: 0, pendingScan: 0, pendingApps: 0 },
    openApp: ''
  },

  onLoad() {
    let saved = '';
    try { saved = wx.getStorageSync(TOKEN_KEY) || ''; } catch (e) { saved = ''; }
    if (saved) {
      this.setData({ token: saved });
      this.loadAll();
    }
  },

  onToken(e) { this.setData({ token: e.detail.value }); },

  saveToken() {
    const token = this.data.token.trim();
    if (!token) { ui.toast('请输入管理令牌'); return; }
    try { wx.setStorageSync(TOKEN_KEY, token); } catch (e) { /* 存储不可用时仅本次有效 */ }
    this.loadAll();
  },

  loadAll() {
    const token = this.data.token.trim();
    if (!token) return;
    this.setData({ loading: true });
    Promise.all([api.applications.list(token), api.orders.adminList(token)]).then(([appRes, orderRes]) => {
      this.setData({ loading: false });
      if (!appRes.ok) {
        this.setData({ authed: false });
        ui.fail(appRes, '令牌无效或权限不足');
        return;
      }
      const apps = (appRes.data || []).map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        phone: row.phone,
        audienceText: row.type === '机构'
          ? (Array.isArray(row.audience) && row.audience.length ? row.audience.join(' / ') : '家长')
          : '',
        contact: row.contact || '',
        education: row.education || '',
        school: row.school || '',
        grade: row.grade || '',
        subjects: row.subjects || '',
        resume: row.resume || '',
        routeName: row.routeName || '',
        startPoint: row.startPoint || '',
        endPoint: row.endPoint || '',
        stops: Array.isArray(row.stops) ? row.stops : [],
        status: row.status,
        statusText: fmt.applicationStatusText(row.status),
        createdAt: fmt.dateTime(row.createdAt)
      }));
      const orderRows = (orderRes && orderRes.ok && orderRes.data) || [];
      const orders = orderRows.map(row => ({
        id: row.id,
        number: row.number,
        title: row.title,
        student: row.student,
        phone: row.phone,
        amount: row.amount,
        status: row.status,
        statusText: fmt.statusText(row.status),
        stage: fmt.statusTone(row.status),
        createdAt: fmt.dateTime(row.createdAt)
      }));
      const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'completed');
      this.setData({
        authed: true,
        apps,
        orders,
        stats: {
          orders: orders.length,
          paid: paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
          pendingScan: orders.filter(o => o.status === 'paid').length,
          pendingApps: apps.filter(a => a.status === 'pending').length
        }
      });
    });
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },

  toggleApp(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ openApp: this.data.openApp === id ? '' : id });
  },

  approve(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '通过审核',
      content: '确认该入驻申请通过审核？通过后账号即可进入对应工作台。',
      success: r => {
        if (!r.confirm) return;
        api.applications.approve(id, this.data.token.trim()).then(res => {
          if (!res.ok) { ui.fail(res, '审核失败'); return; }
          ui.toast('已通过审核');
          this.loadAll();
        });
      }
    });
  },

  complete(e) {
    const id = e.currentTarget.dataset.id;
    api.orders.adminComplete(id, this.data.token.trim()).then(res => {
      if (!res.ok) { ui.fail(res, '核销失败'); return; }
      ui.toast('已核销');
      this.loadAll();
    });
  },

  callPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
  }
});

};
__mods["miniprogram/pages/assistant/assistant.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const data = require("miniprogram/utils/assistant-data.js");

Page({
  data: {
    messages: [],
    quick: data.QUICK,
    input: '',
    sending: false,
    scrollTo: '',
    greeting: '你好，我是鹭鹭。课程、订单、升学规划、机构入驻都可以问我。'
  },

  onLoad(query) {
    const preset = query && query.q ? decodeURIComponent(query.q) : '';
    this.seq = 0;
    this.history = [];
    this.push('bot', this.data.greeting);
    if (preset) this.ask(preset);
  },

  push(role, text, extra) {
    this.seq += 1;
    const id = 'm' + this.seq;
    const messages = this.data.messages.concat([Object.assign({ id, role, text }, extra || {})]);
    this.setData({ messages, scrollTo: id });
    return id;
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  onQuick(e) {
    const q = e.currentTarget.dataset.q;
    if (!q || this.data.sending) return;
    this.ask(q);
  },

  onSubmit() {
    const text = (this.data.input || '').trim();
    if (!text || this.data.sending) return;
    this.setData({ input: '' });
    this.ask(text);
  },

  ask(text) {
    this.push('me', text);
    this.history = this.history.concat([{ role: 'me', text }]).slice(-6);
    this.setData({ sending: true });
    const holder = this.push('bot', '鹭鹭正在想…', { typing: true });

    api.assistant.chat(text, this.history).then(res => {
      /* 云端助手不可用时直接走内置问答，界面不打扰用户 */
      const local = data.answer(text);
      let payload;
      if (res.ok && res.data && res.data.answer) {
        const route = res.data.route || data.routeOf(res.data.answer) || null;
        payload = {
          text: res.data.answer,
          route: route || null,
          related: Array.isArray(res.data.related) ? res.data.related : [],
          courses: Array.isArray(res.data.courses) ? res.data.courses : []
        };
      } else {
        payload = {
          text: local.a,
          route: local.go || null,
          related: (local.related || []).map(row => ({ q: row.q, a: row.a })),
          courses: local.courses || []
        };
      }
      this.replace(holder, payload);
      this.setData({ sending: false });
      this.history = this.history.concat([{ role: 'bot', text: payload.text }]).slice(-6);
    });
  },

  replace(id, payload) {
    const messages = this.data.messages.map(item => (
      item.id === id
        ? Object.assign({}, item, {
            text: payload.text,
            route: payload.route,
            related: payload.related,
            courses: payload.courses || [],
            typing: false
          })
        : item
    ));
    this.setData({ messages, scrollTo: id });
  },

  onRelated(e) {
    const q = e.currentTarget.dataset.q;
    if (!q || this.data.sending) return;
    this.ask(q);
  },

  onRoute(e) {
    const index = Number(e.currentTarget.dataset.index);
    const route = (this.data.messages[index] || {}).route;
    if (!route) return;
    /* 课程跳转带上 Tab 意图，首页 onShow 时直接切到「课程」 */
    if (route.page) getApp().globalData.indexTab = route.page;
    if (route.tab) wx.switchTab({ url: route.path });
    else wx.navigateTo({ url: route.path });
  },

  /* 点推荐课程卡：直接进该课程详情页 */
  onCourse(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) });
  }
});

};
__mods["miniprogram/pages/booking/booking.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");
const fmt = require("miniprogram/utils/format.js");

Page({
  data: {
    type: 'course',
    title: '',
    price: 0,
    priceText: '0',
    amountText: '0',
    unit: '',
    remaining: 0,
    /* 课程 */
    packages: [],
    packageId: '',
    date: '',
    /* 伴学 */
    slots: [],
    sessions: [],
    pickedDate: '',
    /* 校车 */
    starts: [],
    ends: [],
    startPoint: '',
    endPoint: '',
    period: '月付',
    periods: ['月付'],
    /* 公共 */
    student: '',
    phone: '',
    guardian: '',
    relation: '',
    guardianPhone: '',
    age: '',
    gender: '未填写',
    address: '',
    submitting: false,
    today: fmt.todayCN(),
    genders: ['男', '女', '未填写'],
    relations: ['父亲', '母亲', '家长', '祖父母', '其他监护人']
  },

  onLoad(options) {
    this.serviceId = options.id ? decodeURIComponent(options.id) : '';
    if (!ui.requireLogin()) return;
    const svc = getApp().findService(this.serviceId);
    if (!svc) {
      ui.loading();
      api.services.list().then(res => {
        ui.hideLoading();
        if (res.ok) getApp().cacheServices(res.data);
        this.setup();
      });
      return;
    }
    this.setup();
  },

  setup() {
    const svc = getApp().findService(this.serviceId);
    if (!svc) { ui.toast('服务不存在'); setTimeout(() => wx.navigateBack(), 600); return; }
    const view = logic.detailView(svc);
    const base = {
      type: view.type,
      title: view.title,
      price: view.price,
      priceText: view.priceText,
      unit: view.unit,
      remaining: view.remaining,
      packages: view.packages,
      amountText: view.priceText,
      date: ''
    };
    wx.setNavigationBarTitle({ title: '报名 · ' + view.title });
    if (view.type === 'course') {
      this.setData(Object.assign(base, { packageId: view.packages.length ? view.packages[0].id : '' }));
      return;
    }
    if (view.type === 'tutor') {
      this.tutorSlots = view.slots.map(s => s.text);
      this.setData(Object.assign(base, { slots: [], sessions: [] }));
      this.loadAvailability(fmt.todayCN());
      return;
    }
    /* 校车 */
    this.setData(Object.assign(base, {
      starts: view.bus.stops,
      ends: [],
      startPoint: '',
      endPoint: '',
      periods: view.bus.period.length ? view.bus.period : ['月付'],
      period: (view.bus.period.length ? view.bus.period : ['月付'])[0]
    }));
  },

  /* ---------- 伴学：按日期拉可约时段 ---------- */
  onDateChange(e) {
    const date = e.detail.value;
    this.setData({ pickedDate: date, slots: [] });
    this.loadAvailability(date);
  },

  loadAvailability(date) {
    if (!date) return;
    api.services.availability(this.serviceId, date).then(res => {
      if (!res.ok) { ui.fail(res, '可约时段加载失败'); return; }
      this.setData({ slots: this.markSlots(logic.availabilityView(res.data), this.data.sessions) });
    });
  },

  /* 模板不能调用方法，把「已选」状态算进每条时段 */
  markSlots(slots, sessions) {
    const date = this.data.pickedDate || fmt.todayCN();
    const picked = new Set((sessions || []).filter(s => s.date === date).map(s => s.slot));
    return (slots || []).map(slot => Object.assign({}, slot, { picked: picked.has(slot.slot) }));
  },

  toggleSlot(e) {
    const slot = e.currentTarget.dataset.slot;
    if (e.currentTarget.dataset.disabled) return;
    const date = this.data.pickedDate || fmt.todayCN();
    const picked = this.data.sessions.some(s => s.date === date && s.slot === slot);
    const next = picked
      ? logic.removeSession(this.data.sessions, date, slot)
      : logic.addSession(this.data.sessions, date, slot);
    const total = next.length ? Math.round(this.data.price * next.length) : this.data.price;
    this.setData({
      sessions: next,
      amountText: String(total),
      slots: this.markSlots(this.data.slots, next)
    });
  },

  isSlotPicked(e) {
    return false;
  },

  /* ---------- 校车：下车点依赖上车点 ---------- */
  onStartChange(e) {
    const index = Number(e.detail.value);
    const svc = getApp().findService(this.serviceId);
    const bus = logic.busView(svc);
    const start = bus.routes[index] ? bus.routes[index].name : '';
    this.setData({
      startPoint: start,
      ends: logic.busEndOptions(bus, start),
      endPoint: ''
    });
  },

  onEndChange(e) {
    const index = Number(e.detail.value);
    this.setData({ endPoint: this.data.ends[index] || '' });
  },

  onPackageChange(e) {
    const index = Number(e.detail.value);
    const pkg = this.data.packages[index];
    this.setData({
      packageId: pkg ? pkg.id : '',
      price: pkg ? pkg.price : this.data.price,
      priceText: pkg ? pkg.priceText : this.data.priceText,
      amountText: pkg ? pkg.priceText : this.data.priceText
    });
  },

  /* ---------- 表单 ---------- */
  onField(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onGenderChange(e) {
    this.setData({ gender: this.data.genders[Number(e.detail.value)] || '未填写' });
  },

  onRelationChange(e) {
    this.setData({ relation: this.data.relations[Number(e.detail.value)] || '' });
  },

  submit() {
    if (this.data.submitting) return;
    if (!ui.requireLogin()) return;
    const d = this.data;
    if (!d.student) { ui.toast('请填写学生姓名'); return; }
    if (!/^1\d{10}$/.test(d.phone)) { ui.toast('请填写有效的 11 位手机号'); return; }
    const payload = {
      serviceId: this.serviceId,
      student: d.student,
      phone: d.phone,
      guardian: d.guardian || undefined,
      relation: d.relation || undefined,
      guardianPhone: d.guardianPhone || undefined,
      age: d.age || undefined,
      gender: d.gender || undefined,
      address: d.address || undefined
    };
    if (d.type === 'course') {
      if (d.packageId) payload.packageId = d.packageId;
      if (d.date) payload.date = d.date;
    }
    if (d.type === 'tutor') {
      if (!d.sessions.length) { ui.toast('请至少选择 1 个预约时段'); return; }
      payload.sessions = d.sessions;
    }
    if (d.type === 'bus') {
      if (!d.startPoint || !d.endPoint) { ui.toast('请选择上车站点和下车站点'); return; }
      payload.startPoint = d.startPoint;
      payload.endPoint = d.endPoint;
      payload.period = d.period;
    }
    this.setData({ submitting: true });
    api.orders.create(payload).then(res => {
      this.setData({ submitting: false });
      if (!res.ok) { ui.fail(res, '下单失败'); return; }
      wx.showToast({ title: '下单成功', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: '/pages/orders/orders' }), 700);
    });
  }
});

};
__mods["miniprogram/pages/companion/companion.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

Page({
  data: {
    logged: false,
    isTutor: false,
    loading: true,
    app: null,
    statusText: '',
    methods: []
  },

  onShow() {
    const user = getApp().globalData.user;
    if (!user) {
      this.setData({ logged: false, isTutor: false, loading: false });
      return;
    }
    this.setData({ logged: true, isTutor: user.role === 'tutor' });
    if (user.role !== 'tutor') {
      this.setData({ loading: false });
      return;
    }
    api.applications.mine().then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '资料加载失败');
        return;
      }
      const list = res.data || [];
      const latest = list.find(a => a.status === 'approved') || list[0] || null;
      this.setData({
        loading: false,
        app: latest,
        statusText: latest ? fmt.applicationStatusText(latest.status) : '',
        methods: latest && typeof latest.methods === 'string'
          ? latest.methods.split(/[、,，]/).map(s => s.trim()).filter(Boolean)
          : []
      });
    });
  },

  goJoin() { wx.navigateTo({ url: '/pages/join/join' }); },
  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  openService(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) });
  }
});

};
__mods["miniprogram/pages/detail/detail.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");
const fmt = require("miniprogram/utils/format.js");

Page({
  data: {
    view: null,
    videoUrls: {},
    loading: true
  },

  onLoad(options) {
    this.serviceId = options.id ? decodeURIComponent(options.id) : '';
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const cached = getApp().findService(this.serviceId);
    if (cached) {
      this.render(cached);
      return;
    }
    ui.loading();
    api.services.list().then(res => {
      ui.hideLoading();
      if (!res.ok) { ui.fail(res, '加载失败'); return; }
      getApp().cacheServices(res.data);
      const svc = getApp().findService(this.serviceId);
      if (!svc) { ui.toast('服务不存在或已下架'); setTimeout(() => wx.navigateBack(), 600); return; }
      this.render(svc);
    });
  },

  render(svc) {
    const view = logic.detailView(svc);
    this.setData({ view: this.decorate(view), loading: false });
    /* 云存储视频换取临时播放地址 */
    const cloudFiles = [];
    for (const p of view.packages) {
      if (p.videoUrl && p.videoUrl.indexOf('cloud://') === 0) cloudFiles.push(p.videoUrl);
    }
    if (cloudFiles.length) {
      api.services.tempUrl(cloudFiles).then(res => {
        if (!res.ok || !res.data) return;
        const map = {};
        for (const row of res.data) {
          if (row.tempFileURL) map[row.fileID] = row.tempFileURL;
        }
        this.setData({ videoUrls: map });
        this.setData({ view: this.decorate(view, map) });
      });
    }
  },

  /* 模板不能调用页面方法，先把套餐视频地址解析好 */
  decorate(view, map) {
    const urls = map || this.data.videoUrls || {};
    const resolve = url => {
      if (!url) return '';
      if (url.indexOf('cloud://') === 0) return urls[url] || '';
      return url;
    };
    return Object.assign({}, view, {
      packages: (view.packages || []).map(pkg => Object.assign({}, pkg, { src: resolve(pkg.videoUrl) }))
    });
  },

  goBooking() {
    wx.navigateTo({ url: '/pages/booking/booking?id=' + encodeURIComponent(this.serviceId) });
  },

  goMerchant() {
    const view = this.data.view;
    if (!view || !view.merchant || !view.merchant.name) return;
    if (view.type === 'course') {
      wx.navigateTo({ url: '/pages/merchant/merchant?name=' + encodeURIComponent(view.merchant.name) });
    }
  },

  onShareAppMessage() {
    const view = this.data.view;
    return {
      title: view ? view.title : '学鹭伴学',
      path: '/pages/index/index'
    };
  }
});

};
__mods["miniprogram/pages/exam/exam.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

const SORTS = [
  { id: 'line', name: '按分数线' },
  { id: 'ratio', name: '按竞争比' },
  { id: 'quota', name: '按招录人数' }
];

const BUCKETS = [
  { key: 'chong', name: '冲一冲' },
  { key: 'wen', name: '稳一稳' },
  { key: 'bao', name: '保一保' }
];

Page({
  data: {
    ready: false,
    tab: 'items',
    kinds: [],
    kind: 'gwy',
    kindMeta: null,
    regions: ['不限'],
    educations: ['不限'],
    categories: ['不限'],
    examTypes: ['不限'],
    regionIndex: 0,
    educationIndex: 0,
    categoryIndex: 0,
    examTypeIndex: 0,
    sorts: SORTS.map(s => s.name),
    sortIndex: 0,
    q: '',
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    loading: false,
    scoreInput: '',
    match: { counts: null, groups: [] },
    matching: false,
    resources: null
  },

  onLoad() {
    api.exam.meta().then(res => {
      if (!res.ok) { ui.fail(res, '加载失败'); return; }
      const meta = res.data || {};
      this.meta = meta;
      const kinds = meta.kinds || [];
      this.setData({
        ready: true,
        kinds,
        kind: kinds[0] ? kinds[0].key : 'gwy',
        kindMeta: kinds[0] || null,
        regions: ['不限', ...(meta.regions || [])],
        educations: ['不限', ...(meta.educations || [])]
      });
      this.applyKindOptions();
      this.loadItems(true);
    });
  },

  applyKindOptions() {
    const meta = this.meta || {};
    const kind = this.data.kind;
    const categories = (meta.categories && meta.categories[kind]) || [];
    const examTypes = (meta.examTypes && meta.examTypes[kind]) || [];
    this.setData({
      categories: ['不限', ...categories],
      examTypes: ['不限', ...examTypes],
      categoryIndex: 0,
      examTypeIndex: 0,
      regionIndex: 0,
      educationIndex: 0
    });
  },

  onKind(e) {
    const kind = e.currentTarget.dataset.kind;
    if (kind === this.data.kind) return;
    const kindMeta = this.data.kinds.find(k => k.key === kind) || null;
    this.setData({ kind, kindMeta, items: [], match: { counts: null, groups: [] }, resources: null });
    this.applyKindOptions();
    this.loadItems(true);
    if (this.data.tab === 'data') this.loadResources();
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === 'data' && !this.data.resources) this.loadResources();
  },

  /* ---------- 筛选 ---------- */
  pickValue(list, index) { return index === 0 ? '' : list[index]; },

  onPicker(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: Number(e.detail.value) });
    if (field === 'sortIndex') this.loadItems(true);
  },

  onKeyword(e) { this.setData({ q: e.detail.value }); },

  onSearch() { this.loadItems(true); },

  /* ---------- 岗位列表 ---------- */
  loadItems(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    if (!reset && page > this.data.pages) return;
    this.setData({ loading: true });
    api.exam.items({
      kind: this.data.kind,
      region: this.pickValue(this.data.regions, this.data.regionIndex),
      education: this.pickValue(this.data.educations, this.data.educationIndex),
      category: this.pickValue(this.data.categories, this.data.categoryIndex),
      examType: this.pickValue(this.data.examTypes, this.data.examTypeIndex),
      q: this.data.q,
      sort: SORTS[this.data.sortIndex].id,
      page,
      size: 12
    }).then(res => {
      this.setData({ loading: false });
      if (!res.ok) {
        if (reset) this.setData({ items: [] });
        ui.fail(res, '岗位加载失败');
        return;
      }
      const d = res.data || {};
      const rows = (d.items || []).map(logic.examItemView);
      this.setData({
        items: reset ? rows : this.data.items.concat(rows),
        page: d.page || page,
        pages: d.pages || 1,
        total: d.total || rows.length
      });
    });
  },

  onReachBottom() {
    if (this.data.tab === 'items') this.loadItems(false);
  },

  openItem(e) {
    wx.navigateTo({
      url: '/pages/exam-detail/exam-detail?kind=' + this.data.kind +
        '&id=' + encodeURIComponent(e.currentTarget.dataset.id)
    });
  },

  /* ---------- 匹配 ---------- */
  onScore(e) { this.setData({ scoreInput: e.detail.value }); },

  runMatch() {
    const full = this.data.kindMeta ? this.data.kindMeta.fullScore : 200;
    const score = Number(this.data.scoreInput);
    if (!this.data.scoreInput || !Number.isFinite(score) || score < 0 || score > full) {
      ui.toast('请输入 0–' + full + ' 之间的分数');
      return;
    }
    this.setData({ matching: true });
    api.exam.match({
      kind: this.data.kind,
      score,
      region: this.pickValue(this.data.regions, this.data.regionIndex),
      education: this.pickValue(this.data.educations, this.data.educationIndex),
      limit: 8
    }).then(res => {
      this.setData({ matching: false });
      if (!res.ok) { ui.fail(res, '匹配失败'); return; }
      const d = res.data || {};
      const buckets = d.buckets || {};
      const groups = BUCKETS.map(b => ({
        key: b.key,
        name: b.name,
        items: (buckets[b.key] || []).map(logic.examItemView)
      }));
      this.setData({ match: { counts: d.counts || null, groups } });
    });
  },

  /* ---------- 资料 ---------- */
  loadResources() {
    this.setData({ resources: null });
    api.exam.resources(this.data.kind, 0).then(res => {
      if (!res.ok) { ui.fail(res, '资料加载失败'); return; }
      const d = res.data || {};
      this.setData({
        resources: {
          orgs: d.orgs || [],
          courses: d.courses || [],
          books: d.books || []
        }
      });
    });
  }
});

};
__mods["miniprogram/pages/exam-detail/exam-detail.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");

Page({
  data: {
    kind: 'gwy',
    loading: true,
    row: null,
    series: [],
    adding: false
  },

  onLoad(options) {
    this.kind = options.kind || 'gwy';
    this.itemId = options.id ? decodeURIComponent(options.id) : '';
    this.setData({ kind: this.kind });
    this.load();
  },

  load() {
    api.exam.detail(this.kind, this.itemId, 2025).then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '条目加载失败');
        return;
      }
      const d = res.data || {};
      this.setData({
        loading: false,
        row: {
          id: d.id, org: d.org, title: d.title, region: d.region, city: d.city,
          category: d.category, examType: d.examType, quota: d.quota,
          applicants: d.applicants, ratio: d.ratio, heat: d.heat, line: d.line,
          requirements: d.requirements || {},
          lineLabel: d.lineLabel || '分数线',
          unitLabel: d.unitLabel || '招录单位',
          quotaLabel: d.quotaLabel || '招录人数',
          applicantLabel: d.applicantLabel || '报名人数',
          fullScore: d.fullScore || 200
        },
        series: d.series || []
      });
    });
  },

  addToList() {
    const row = this.data.row;
    if (!row) return;
    if (!api.token()) {
      wx.showModal({
        title: '需要登录',
        content: '登录后可以保存报考清单。',
        confirmText: '去登录',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
      });
      return;
    }
    this.setData({ adding: true });
    api.lists.examGet().then(res => {
      if (!res.ok) { this.setData({ adding: false }); ui.fail(res, '清单加载失败'); return; }
      const rows = (res.data || []).map(r => ({
        id: r.id, kind: r.kind || this.kind, org: r.org || '', title: r.title || '',
        line: r.line === undefined ? null : r.line, note: r.note || ''
      }));
      if (rows.some(r => r.id === row.id)) {
        this.setData({ adding: false });
        ui.toast('已在报考清单中');
        return;
      }
      if (rows.length >= 60) { this.setData({ adding: false }); ui.toast('清单最多 60 条'); return; }
      rows.push({ id: row.id, kind: this.kind, org: row.org, title: row.title, line: row.line, note: '' });
      api.lists.examSave(rows).then(save => {
        this.setData({ adding: false });
        if (!save.ok) { ui.fail(save, '保存失败'); return; }
        ui.toast('已加入报考清单');
      });
    });
  }
});

};
__mods["miniprogram/pages/feedback/feedback.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

const CATEGORIES = ['课程', '伴学', '校车', '订单', '账号', '其他'];

Page({
  data: {
    categories: CATEGORIES,
    category: '其他',
    content: '',
    contact: '',
    orderNumber: '',
    rating: 0,
    stars: [1, 2, 3, 4, 5],
    submitting: false,
    list: [],
    logged: false,
    count: 0
  },

  onShow() {
    this.setData({ logged: !!api.token() });
    this.loadList();
  },

  loadList() {
    if (!api.token()) { this.setData({ list: [] }); return; }
    api.feedback.list().then(res => {
      if (!res.ok) return;
      const list = (res.data || []).map(row => ({
        id: row.id,
        category: row.category,
        content: row.content,
        rating: row.rating,
        reply: row.reply || '',
        statusText: row.status === 'replied' ? '已回复' : '已收到',
        createdAt: fmt.dateTime(row.createdAt)
      }));
      this.setData({ list, count: list.length });
    });
  },

  onCategory(e) {
    this.setData({ category: e.currentTarget.dataset.value });
  },

  onField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onRating(e) {
    const value = Number(e.currentTarget.dataset.value);
    this.setData({ rating: this.data.rating === value ? 0 : value });
  },

  submit() {
    if (this.data.submitting) return;
    const content = this.data.content.trim();
    if (content.length < 5) { ui.toast('反馈内容请填写 5–500 字'); return; }
    const payload = {
      category: this.data.category,
      content,
      contact: this.data.contact.trim(),
      orderNumber: this.data.orderNumber.trim()
    };
    if (this.data.rating) payload.rating = this.data.rating;
    this.setData({ submitting: true });
    api.feedback.submit(payload).then(res => {
      this.setData({ submitting: false });
      if (!res.ok) { ui.fail(res, '提交失败'); return; }
      ui.toast('已提交，感谢你的反馈');
      this.setData({ content: '', orderNumber: '', rating: 0 });
      this.loadList();
    });
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); }
});

};
__mods["miniprogram/pages/gaokao/gaokao.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");

const TABS = [
  { key: 'profile', name: '学生档案' },
  { key: 'curve', name: '学业曲线' },
  { key: 'path', name: '路径规划' },
  { key: 'subjects', name: '选科建议' },
  { key: 'pathways', name: '多元升学' },
  { key: 'timeline', name: '关键节点' }
];

const STAGE_STATUS = { done: '已完成', current: '当前阶段', todo: '待开启' };
const PATHWAY_STATUS = {
  eligible: { text: '基本符合', tone: 'ok' },
  manual: { text: '需人工确认', tone: 'warn' },
  ineligible: { text: '暂不符合', tone: 'off' }
};

function today() {
  const d = new Date();
  const p = n => (n < 10 ? '0' + n : String(n));
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* 一位小数，空值显示为「—」 */
function n1(v) {
  if (v === null || v === undefined || v === '') return '—';
  const num = Number(v);
  if (!Number.isFinite(num)) return '—';
  return Math.abs(num % 1) < 0.05 ? String(Math.round(num)) : num.toFixed(1);
}

Page({
  data: {
    tab: 'profile',
    tabs: TABS,
    loading: true,
    saving: false,
    error: '',
    disclaimer: '',
    profile: null,
    meta: { grades: [], provinces: [], firstSubjects: [], secondSubjects: [], tiers: [], interests: [] },
    gap: null,
    gapCards: [],
    stages: [],
    currentStage: '',
    stageNote: '',
    nodes: [],
    timelineMeta: { count: 0, passed: 0, from: '', to: '', note: '' },
    examStats: null,
    examRows: [],
    subject: null,
    comboRows: [],
    coverageText: '—',
    pathways: null,
    pathwayRows: [],
    profileForm: {
      grade: '高一',
      province: '浙江',
      provinceIndex: 0,
      first: '物理',
      second: [],
      targetTier: '本科',
      interest: []
    },
    examForm: { name: '', date: '', total: '' },
    pwForm: { grade: '', score: '', rank: '', award: '' },
    provinceTotal: 750,
    updatedText: ''
  },

  onLoad() {
    this.setData({ 'examForm.date': today() });
    this.load();
  },

  onShow() {
    if (!this.data.loading && this.data.profile) this.load(true);
  },

  onPullDownRefresh() {
    this.load(true);
    wx.stopPullDownRefresh();
  },

  /* ---------------- 读取 ---------------- */
  load(silent) {
    if (!silent) this.setData({ loading: true, error: '' });
    api.plan.overview().then(res => {
      if (!res.ok) {
        this.setData({ loading: false, error: res.error || '升学规划加载失败' });
        if (!silent) ui.fail(res, '升学规划加载失败');
        return;
      }
      this.apply(res.data || {});
    });
  },

  apply(data) {
    const profile = data.profile || {};
    const meta = data.meta || this.data.meta;
    const gap = data.gap || {};
    const provinces = meta.provinces || [];
    const provinceIndex = Math.max(0, provinces.indexOf(profile.province));
    const total = gap.total || 750;
    const nextScore = data.exams && data.exams.average !== null && data.exams.average !== undefined
      ? String(data.exams.average)
      : '';

    this.setData({
      loading: false,
      error: '',
      profile,
      meta,
      gap,
      gapCards: this.buildGapCards(gap),
      stages: this.buildStages(this.rawStages = data.stages || []),
      currentStage: data.currentStage || '',
      stageNote: data.stageNote || '',
      nodes: this.buildNodes(data.timeline || {}),
      timelineMeta: {
        count: data.timeline ? data.timeline.count : 0,
        passed: data.timeline ? data.timeline.passed : 0,
        from: data.timeline ? data.timeline.from : '',
        to: data.timeline ? data.timeline.to : '',
        note: data.timeline ? data.timeline.note : ''
      },
      examStats: data.exams || null,
      examRows: ((data.exams && data.exams.items) || []).slice().reverse(),
      subject: data.subjects || null,
      comboRows: this.buildCombos(data.subjects),
      coverageText: data.subjects ? n1(data.subjects.coverage) : '—',
      disclaimer: data.disclaimer || '',
      provinceTotal: total,
      updatedText: profile.updatedAt ? this.dateText(profile.updatedAt) : '',
      profileForm: {
        grade: profile.grade || '高一',
        province: profile.province || '浙江',
        provinceIndex,
        first: profile.first || '物理',
        second: (profile.second || []).slice(0, 2),
        targetTier: profile.targetTier || '本科',
        interest: (profile.interest || []).slice(0, 3)
      },
      'pwForm.score': nextScore || this.data.pwForm.score
    });
  },

  buildStages(stages) {
    const expanded = this.expanded || {};
    return stages.map(s => {
      const tasks = Array.isArray(s.tasks) ? s.tasks : [];
      const open = !!expanded[s.key];
      return {
        key: s.key,
        name: s.name,
        range: s.range,
        goal: s.goal,
        status: s.status,
        statusText: STAGE_STATUS[s.status] || s.status,
        tasks: open ? tasks : tasks.slice(0, 4),
        moreCount: tasks.length > 4 ? tasks.length - 4 : 0,
        expanded: open
      };
    });
  },

  toggleStage(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || !this.rawStages) return;
    this.expanded = this.expanded || {};
    this.expanded[key] = !this.expanded[key];
    this.setData({ stages: this.buildStages(this.rawStages) });
  },

  buildGapCards(gap) {
    const noScore = gap.avgScore === null || gap.avgScore === undefined;
    const noGap = gap.gap === null || gap.gap === undefined;
    return [
      { key: 'avg', label: '当前均分', value: n1(gap.avgScore), hint: noScore ? '先录入考试' : '最近 6 次均分', tone: '' },
      { key: 'line', label: '目标线', value: n1(gap.targetLine), hint: gap.targetTier ? ('目标 ' + gap.targetTier) : '目标层次未设置', tone: '' },
      {
        key: 'gap',
        label: '差距',
        value: noGap ? '—' : (gap.gap > 0 ? '+' + n1(gap.gap) : n1(gap.gap)),
        hint: noGap ? '先录入考试' : (gap.onTrack ? '已高于目标线' : '目标线 − 当前均分'),
        tone: noGap ? '' : (gap.gap > 0 ? 'neg' : 'pos')
      },
      {
        key: 'per',
        label: '每学期需提升',
        value: n1(gap.perSemester),
        hint: gap.semesters ? ('剩余约 ' + gap.monthsToMilestone + ' 个月 / ' + gap.semesters + ' 个学期') : '学期数待定',
        tone: ''
      }
    ];
  },

  buildNodes(timeline) {
    const rows = Array.isArray(timeline.nodes) ? timeline.nodes : [];
    return rows.map(n => ({
      date: n.date,
      name: n.name,
      detail: n.detail,
      type: n.type || 'other',
      grade: n.grade || '',
      passed: !!n.passed,
      daysText: n.passed ? '已过' : (n.daysUntil === 0 ? '就在今天' : ('还有 ' + n.daysUntil + ' 天'))
    }));
  },

  buildCombos(subject) {
    if (!subject || !Array.isArray(subject.combos)) return [];
    const current = subject.combination || '';
    return subject.combos.map(c => ({
      combination: c.combination,
      coverage: n1(c.coverage),
      allowed: c.allowed,
      total: c.total,
      rank: c.rank,
      current: c.combination === current
    }));
  },

  dateText(iso) {
    const s = String(iso || '');
    if (s.length < 10) return '';
    return s.slice(0, 10).replace(/-/g, '/');
  },

  /* ---------------- 切换板块 ---------------- */
  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === 'pathways' && !this.data.pathways) this.loadPathways();
  },

  /* ---------------- 学生档案 ---------------- */
  onGrade(e) {
    this.setData({ 'profileForm.grade': e.currentTarget.dataset.value });
  },

  onProvince(e) {
    const index = Number(e.detail.value);
    const name = this.data.meta.provinces[index] || this.data.profileForm.province;
    this.setData({ 'profileForm.provinceIndex': index, 'profileForm.province': name });
  },

  onFirst(e) {
    this.setData({ 'profileForm.first': e.currentTarget.dataset.value });
  },

  onSecond(e) {
    const value = e.currentTarget.dataset.value;
    const picked = (this.data.profileForm.second || []).slice();
    const at = picked.indexOf(value);
    if (at >= 0) picked.splice(at, 1);
    else if (picked.length < 2) picked.push(value);
    else { ui.toast('再选科目只能选 2 门'); return; }
    this.setData({ 'profileForm.second': picked });
  },

  onTier(e) {
    this.setData({ 'profileForm.targetTier': e.currentTarget.dataset.value });
  },

  onInterest(e) {
    const value = e.currentTarget.dataset.value;
    const picked = (this.data.profileForm.interest || []).slice();
    const at = picked.indexOf(value);
    if (at >= 0) picked.splice(at, 1);
    else if (picked.length < 3) picked.push(value);
    else { ui.toast('兴趣方向最多选 3 个'); return; }
    this.setData({ 'profileForm.interest': picked });
  },

  saveProfile() {
    if (this.data.saving) return;
    const form = this.data.profileForm;
    if ((form.second || []).length !== 2) { ui.toast('再选科目需选满 2 门'); return; }
    this.setData({ saving: true });
    api.plan.profileSave({
      grade: form.grade,
      province: form.province,
      first: form.first,
      second: form.second,
      targetTier: form.targetTier,
      interest: form.interest
    }).then(res => {
      this.setData({ saving: false });
      if (!res.ok) { ui.fail(res, '档案保存失败'); return; }
      ui.toast('档案已保存');
      this.load(true);
    });
  },

  /* ---------------- 学业曲线 ---------------- */
  onExamName(e) { this.setData({ 'examForm.name': e.detail.value }); },
  onExamDate(e) { this.setData({ 'examForm.date': e.detail.value }); },
  onExamTotal(e) { this.setData({ 'examForm.total': e.detail.value }); },

  addExam() {
    if (this.data.saving) return;
    const form = this.data.examForm;
    if (!form.name || !String(form.name).trim()) { ui.toast('请填写考试名称'); return; }
    const total = Number(form.total);
    if (!Number.isFinite(total) || total <= 0) { ui.toast('请填写有效总分'); return; }
    this.setData({ saving: true });
    api.plan.examAdd({ name: form.name, date: form.date || today(), total }).then(res => {
      this.setData({ saving: false });
      if (!res.ok) { ui.fail(res, '录入失败'); return; }
      ui.toast('已记录本次考试');
      this.setData({ examForm: { name: '', date: today(), total: '' } });
      this.load(true);
    });
  },

  removeExam(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除这条成绩',
      content: '删除后均分与差距会重新计算。',
      confirmText: '删除',
      success: r => {
        if (!r.confirm) return;
        api.plan.examRemove(id).then(res => {
          if (!res.ok) { ui.fail(res, '删除失败'); return; }
          ui.toast('已删除');
          this.load(true);
        });
      }
    });
  },

  /* ---------------- 多元升学 ---------------- */
  onPwGrade(e) {
    this.setData({ 'pwForm.grade': e.currentTarget.dataset.value || '' });
    this.loadPathways();
  },

  onPwScore(e) { this.setData({ 'pwForm.score': e.detail.value }); },
  onPwRank(e) { this.setData({ 'pwForm.rank': e.detail.value }); },
  onPwAward(e) { this.setData({ 'pwForm.award': e.detail.value }); },

  loadPathways() {
    const form = this.data.pwForm;
    api.plan.pathways({ grade: form.grade, score: form.score, rank: form.rank, award: form.award }).then(res => {
      if (!res.ok) { ui.fail(res, '自查失败'); return; }
      const data = res.data || {};
      this.setData({
        pathways: data,
        pathwayRows: (data.pathways || []).map(p => {
          const status = PATHWAY_STATUS[p.status] || { text: p.status, tone: 'off' };
          return {
            key: p.key,
            name: p.name,
            tag: p.tag,
            summary: p.summary,
            statusText: status.text,
            tone: status.tone,
            checks: (p.checks || []).map(c => ({
              item: c.item,
              required: c.required,
              actual: c.actual,
              pass: !!c.pass,
              optional: !!c.optional
            }))
          };
        })
      });
    });
  },

  /* ---------------- 跳转 ---------------- */
  openSchools() {
    wx.navigateTo({ url: '/pages/gaokao-schools/gaokao-schools' });
  }
});

};
__mods["miniprogram/pages/gaokao-detail/gaokao-detail.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");

Page({
  data: {
    tab: 'info',
    loading: true,
    uni: null,
    province: '黑龙江',
    year: 2025,
    majors: [],
    nationalLines: [],
    provinceLines: [],
    provinceRows: [],
    majorSeries: null,
    adding: false
  },

  onLoad(options) {
    this.uniId = options.id ? decodeURIComponent(options.id) : '';
    this.setData({
      province: options.province ? decodeURIComponent(options.province) : '黑龙江',
      year: Number(options.year) || 2025
    });
    this.load();
  },

  load() {
    api.gaokao.detail(this.uniId, this.data.province, this.data.year).then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '院校资料加载失败');
        return;
      }
      const d = res.data || {};
      this.setData({
        loading: false,
        uni: {
          id: d.id,
          name: d.name,
          province: d.province,
          city: d.city,
          tier: d.tier,
          type: d.type,
          alliance: d.alliance || '',
          founded: d.founded,
          alumniRank: d.alumniRank,
          ruankeRank: d.ruankeRank,
          majorsCount: d.majorsCount,
          intro: d.intro || ''
        },
        majors: (d.majors || []).map((m, i) => ({
          key: m.name + '-' + i,
          name: m.name,
          category: m.category,
          heatText: Math.round((Number(m.heat) || 0) * 100) + '%',
          line: m.line,
          rank: m.rank,
          plan: m.plan,
          gap: m.gap,
          gapText: m.gap > 0 ? '高于校线 ' + m.gap : '低于校线 ' + Math.abs(m.gap)
        })),
        nationalLines: (d.lines && d.lines.national) || [],
        provinceLines: (d.lines && d.lines.provinceSeries) || [],
        provinceRows: (d.provinceLines && d.provinceLines.rows) || []
      });
    });
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, majorSeries: null });
  },

  openMajor(e) {
    const name = e.currentTarget.dataset.name;
    ui.loading('加载专业趋势');
    api.gaokao.majorSeries(this.uniId, name, this.data.province).then(res => {
      ui.hideLoading();
      if (!res.ok) { ui.fail(res, '趋势加载失败'); return; }
      const d = res.data || {};
      this.setData({
        majorSeries: { name: d.major, series: d.series || [] },
        'uni.majorPick': d.major
      });
    });
  },

  closeMajor() { this.setData({ majorSeries: null }); },

  addWish() {
    if (!api.token()) {
      wx.showModal({
        title: '需要登录',
        content: '登录后可以把院校加入志愿表。',
        confirmText: '去登录',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
      });
      return;
    }
    const uni = this.data.uni;
    if (!uni) return;
    this.setData({ adding: true });
    api.lists.admissionGet().then(res => {
      if (!res.ok) { this.setData({ adding: false }); ui.fail(res, '加载志愿表失败'); return; }
      const rows = (res.data || []).map(r => ({
        id: r.id, name: r.name, major: r.major || '',
        line: r.line === undefined ? null : r.line,
        probability: r.probability === undefined ? null : r.probability,
        note: r.note || ''
      }));
      if (rows.some(r => r.id === uni.id)) {
        this.setData({ adding: false });
        ui.toast('已在志愿表中');
        return;
      }
      const major = this.data.majorSeries ? this.data.majorSeries.name : '';
      rows.push({
        id: uni.id, name: uni.name, major,
        line: major && this.data.majorSeries.series.length
          ? this.data.majorSeries.series[this.data.majorSeries.series.length - 1].line
          : null,
        probability: null, note: ''
      });
      api.lists.admissionSave(rows).then(save => {
        this.setData({ adding: false });
        if (!save.ok) { ui.fail(save, '保存失败'); return; }
        ui.toast('已加入志愿表');
      });
    });
  },

  goWishlist() { wx.navigateTo({ url: '/pages/gaokao/gaokao' }); }
});

};
__mods["miniprogram/pages/gaokao-schools/gaokao-schools.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

const SORTS = [
  { id: 'rank', name: '按排名' },
  { id: 'line-desc', name: '分数线从高到低' },
  { id: 'line-asc', name: '分数线从低到高' }
];

Page({
  data: {
    tab: 'library',
    ready: false,
    provinces: [],
    provinceIndex: 0,
    province: '黑龙江',
    years: [],
    yearIndex: 0,
    year: 2025,
    tiers: ['不限'],
    tierIndex: 0,
    types: ['不限'],
    typeIndex: 0,
    sorts: SORTS.map(s => s.name),
    sortIndex: 0,
    q: '',
    library: { items: [], page: 1, pages: 1, total: 0, loading: false },
    wishlist: [],
    wishLoaded: false,
    logged: false
  },

  onLoad() {
    this.setData({ logged: !!api.token() });
    api.gaokao.meta().then(res => {
      if (!res.ok) { ui.fail(res, '加载失败'); return; }
      const meta = res.data || {};
      const provinces = (meta.provinces || []).map(p => p.name);
      const provinceIndex = Math.max(0, provinces.indexOf('黑龙江'));
      const years = (meta.years || []).slice().reverse();
      this.meta = meta;
      this.setData({
        ready: true,
        provinces,
        provinceIndex,
        province: provinces[provinceIndex] || '黑龙江',
        years,
        year: years[0] || 2025,
        yearIndex: 0,
        tiers: ['不限', ...(meta.tiers || [])],
        types: ['不限', ...(meta.types || [])]
      });
      this.loadLibrary(true);
    });
  },

  onShow() {
    this.setData({ logged: !!api.token() });
    if (this.data.tab === 'wish' && api.token()) this.loadWishlist();
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === 'wish') {
      if (api.token()) this.loadWishlist();
      else this.setData({ wishlist: [] });
    }
  },

  onProvince(e) {
    const index = Number(e.detail.value);
    this.setData({ provinceIndex: index, province: this.data.provinces[index] || '黑龙江' });
    this.loadLibrary(true);
  },

  onYear(e) {
    const index = Number(e.detail.value);
    this.setData({ yearIndex: index, year: this.data.years[index] });
    this.loadLibrary(true);
  },

  onTier(e) {
    this.setData({ tierIndex: Number(e.detail.value) });
    this.loadLibrary(true);
  },

  onType(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
    this.loadLibrary(true);
  },

  onSort(e) {
    this.setData({ sortIndex: Number(e.detail.value) });
    this.loadLibrary(true);
  },

  onKeyword(e) { this.setData({ q: e.detail.value }); },
  onSearch() { this.loadLibrary(true); },

  tierValue() { return this.data.tierIndex === 0 ? '' : this.data.tiers[this.data.tierIndex]; },
  typeValue() { return this.data.typeIndex === 0 ? '' : this.data.types[this.data.typeIndex]; },

  /* ---------- 院校库 ---------- */
  loadLibrary(reset) {
    const lib = this.data.library;
    if (lib.loading) return;
    const page = reset ? 1 : lib.page + 1;
    if (!reset && page > lib.pages) return;
    this.setData({ 'library.loading': true });
    api.gaokao.universities({
      q: this.data.q,
      tier: this.tierValue(),
      type: this.typeValue(),
      sort: SORTS[this.data.sortIndex].id,
      page,
      size: 20,
      scoreProvince: this.data.province,
      year: this.data.year
    }).then(res => {
      this.setData({ 'library.loading': false });
      if (!res.ok) { ui.fail(res, '院校加载失败'); return; }
      const data = res.data || {};
      const rows = (data.items || []).map(logic.universityView);
      this.setData({
        library: {
          items: reset ? rows : lib.items.concat(rows),
          page: data.page || page,
          pages: data.pages || 1,
          total: data.total || rows.length,
          loading: false
        }
      });
    });
  },

  onReachBottom() {
    if (this.data.tab === 'library') this.loadLibrary(false);
  },

  openUni(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/gaokao-detail/gaokao-detail?id=' + encodeURIComponent(id) +
        '&province=' + encodeURIComponent(this.data.province) +
        '&year=' + this.data.year
    });
  },

  /* ---------- 志愿表 ---------- */
  loadWishlist() {
    api.lists.admissionGet().then(res => {
      if (!res.ok) { ui.fail(res, '志愿表加载失败'); return; }
      this.setData({ wishlist: (res.data || []).map(logic.admissionRowView), wishLoaded: true });
    });
  },

  addWish(e) {
    if (!api.token()) {
      wx.showModal({
        title: '需要登录',
        content: '登录后可以把院校加入志愿表，随时对照调整。',
        confirmText: '去登录',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
      });
      return;
    }
    const row = this.data.library.items[Number(e.currentTarget.dataset.index)];
    if (!row || !row.id) return;
    const rows = this.data.wishlist.slice();
    if (rows.some(item => item.id === row.id)) { ui.toast('已在志愿表中'); return; }
    if (rows.length >= 60) { ui.toast('志愿表最多 60 条'); return; }
    rows.push({
      key: row.id + '|', id: row.id, name: row.name, major: '',
      line: row.line, probability: '', note: ''
    });
    this.saveWishlist(rows, '已加入志愿表');
  },

  removeWish(e) {
    const rows = this.data.wishlist.slice();
    rows.splice(Number(e.currentTarget.dataset.index), 1);
    this.saveWishlist(rows, '已移出志愿表');
  },

  updateNote(e) {
    const rows = this.data.wishlist.slice();
    if (!rows[Number(e.currentTarget.dataset.index)]) return;
    rows[Number(e.currentTarget.dataset.index)].note = e.detail.value;
    this.setData({ wishlist: rows });
  },

  saveNotes() {
    if (!this.data.wishlist.length) return;
    this.saveWishlist(this.data.wishlist, '');
  },

  saveWishlist(rows, message) {
    const payload = rows.map(r => ({
      id: r.id, name: r.name, major: r.major || '',
      line: r.line === '' ? null : r.line,
      probability: r.probability === '' ? null : r.probability,
      note: r.note || ''
    }));
    api.lists.admissionSave(payload).then(res => {
      if (!res.ok) { ui.fail(res, '保存失败'); return; }
      this.setData({ wishlist: (res.data || []).map(logic.admissionRowView) });
      if (message) ui.toast(message);
    });
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); }
});

};
__mods["miniprogram/pages/help/help.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");

Page({
  data: {
    loading: true,
    about: null,
    contact: null,
    faq: [],
    categories: [],
    openIndex: -1
  },

  onLoad() {
    api.content.all().then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '帮助内容加载失败');
        return;
      }
      const d = res.data || {};
      this.setData({
        loading: false,
        about: d.about || null,
        contact: d.contact || null,
        faq: (d.faq || []).map((row, i) => ({ key: row.id || 'f' + i, category: row.category, question: row.question, answer: row.answer })),
        categories: d.categories || []
      });
    });
  },

  toggle(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ openIndex: this.data.openIndex === index ? -1 : index });
  },

  callPhone() {
    const phone = this.data.contact && this.data.contact.phone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
  },

  copyWechat() {
    const wechat = this.data.contact && this.data.contact.wechat;
    if (!wechat) return;
    wx.setClipboardData({ data: wechat, success: () => ui.toast('已复制微信号') });
  },

  goFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }); }
});

};
__mods["miniprogram/pages/index/index.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

Page({
  data: {
    city: '哈尔滨',
    keyword: '',
    type: 'all',
    sub: 'all',
    types: [
      { id: 'all', name: '精选' },
      { id: 'course', name: '课程' },
      { id: 'tutor', name: '伴学' },
      { id: 'bus', name: '接送' }
    ],
    subTabs: [],
    subHint: '',
    featured: [],
    list: [],
    quick: [
      { key: 'learning', icon: '📖', name: '学习资源', desc: '考公 · 考研 · 考编 · 职考' },
      { key: 'gaokao', icon: '🎓', name: '升学规划', desc: '档案 · 曲线 · 选科 · 节点' },
      { key: 'transport', icon: '🚕', name: '接送', desc: '固定线路 · 帮忙接 · 私家车' },
      { key: 'exam', icon: '📚', name: '公考研训', desc: '岗位库 · 进面线 · 备考' },
      { key: 'zk', icon: '🔨', name: '职考技能', desc: '教师资格 · 会计 · 社工' },
      { key: 'tutor', icon: '🚐', name: '伴学服务', desc: '伴学老师 · 上门辅导' }
    ]
  },

  onShow() {
    this.refresh();
    const user = getApp().globalData.user;
    this.setData({ role: user ? user.role : '' });
    /* 助手等入口可带 Tab 意图（如课程推荐直达「课程」Tab） */
    const app = getApp();
    if (app && app.globalData.indexTab) {
      const tab = app.globalData.indexTab;
      app.globalData.indexTab = '';
      if (this.data.types.some(t => t.id === tab)) this.setData({ type: tab, sub: 'all' });
    }
  },

  refresh() {
    ui.loading();
    return api.services.list().then(res => {
      ui.hideLoading();
      if (!res.ok) { ui.fail(res, '目录加载失败'); return; }
      this.all = res.data;
      this.applyFilter();
    });
  },

  /* 列表统一加一层视图字段：校车补线路摘要，其余只补子分类名 */
  toRows(rows) {
    return (rows || []).map(item => {
      const view = logic.listView(item);
      view.section = logic.sectionOf(item);
      if (item.type === 'bus') {
        const detail = item.pickupDetail || item.busDetail || {};
        const routes = Array.isArray(detail.routes) ? detail.routes : [];
        const first = routes[0] || {};
        const last = routes[routes.length - 1] || {};
        view.routeText = first.name && last.name ? first.name + ' → ' + last.name : (item.location || '');
        view.stops = routes.length;
        view.timeText = first.departure && last.departure
          ? '早 ' + first.departure + ' · 晚 ' + last.departure
          : '';
        view.vehicle = detail.vehicle || '';
        if (item.pickupDetail) {
          view.school = item.pickupDetail.school || '';
          view.area = item.pickupDetail.area || '';
        }
      }
      return view;
    });
  },

  applyFilter() {
    const tab = this.data.type;
    /* 首页是公开目录：四个 Tab 已按业务线分开，不再按人群过滤，
       否则成人考证课（只对大学生开放）在「课程」里会整块消失 */
    const rows = logic.filterServices(this.all || [], {
      type: tab === 'all' ? '' : tab,
      keyword: this.data.keyword,
      audience: ''
    });
    const subTabs = logic.sectionsFor(tab);
    let sub = this.data.sub;
    if (sub !== 'all' && !subTabs.some(x => x.id === sub)) sub = 'all';
    const picked = subTabs.find(x => x.id === sub);

    if (tab === 'all') {
      const featured = logic.featuredGroups(rows, 2).filter(group => group.items.length);
      const list = [];
      featured.forEach(group => group.items.forEach(item => {
        if (!list.some(x => x.id === item.id)) list.push(item);
      }));
      this.setData({ featured, list, subTabs: [], sub: 'all', subHint: '' });
      return;
    }

    const sectionOf = tab === 'bus' ? logic.busSection : logic.sectionOf;
    const filtered = sub === 'all' ? rows : rows.filter(item => sectionOf(item) === sub);
    this.setData({
      subTabs,
      sub,
      subHint: picked ? picked.hint : '',
      list: this.toRows(filtered),
      featured: []
    });
  },

  onKeyword(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() { this.applyFilter(); },
  onType(e) {
    this.setData({ type: e.currentTarget.dataset.type, sub: 'all' });
    this.applyFilter();
  },
  onSub(e) {
    this.setData({ sub: e.currentTarget.dataset.sub });
    this.applyFilter();
  },
  /* 精选里点「查看全部」跳到对应 Tab 与子分类 */
  openGroup(e) {
    const tab = e.currentTarget.dataset.tab;
    const sub = e.currentTarget.dataset.sub;
    this.setData({ type: tab, sub: sub || 'all' });
    this.applyFilter();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) });
  },

  /* 六个入口：业务线并列，「接送」是独立板块页，点「伴学服务」在本页直接筛出伴学 */
  openQuick(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'tutor') { wx.navigateTo({ url: '/pages/service/service' }); return; }
    if (key === 'transport') { wx.navigateTo({ url: '/pages/transport/transport' }); return; }
    if (key === 'zk') {
      getApp().globalData.learningKind = 'zk';
      wx.switchTab({ url: '/pages/learning/learning' });
      return;
    }
    if (key === 'learning') { wx.switchTab({ url: '/pages/learning/learning' }); return; }
    if (key === 'gaokao') { wx.navigateTo({ url: '/pages/gaokao/gaokao' }); return; }
    if (key === 'exam') { wx.navigateTo({ url: '/pages/exam/exam' }); return; }
    if (key === 'institutions') { wx.navigateTo({ url: '/pages/institutions/institutions' }); return; }
  },

  openAssistant() { wx.navigateTo({ url: '/pages/assistant/assistant' }); },

  locate() {
    ui.loading('定位中');
    api.location.reverse(45.8038, 126.535).then(res => {
      ui.hideLoading();
      if (res.ok && res.data && res.data.city) {
        this.setData({ city: res.data.city });
        ui.toast('当前城市：' + res.data.city);
      } else {
        ui.fail(res, '定位失败，请手动选择城市');
      }
    });
  }
});

};
__mods["miniprogram/pages/institution/institution.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

const LEARNING = [
  { id: '', name: '不设置', subjects: [] },
  { id: 'gwy', name: '考公', subjects: ['行政职业能力测验', '申论', '面试'] },
  { id: 'ky', name: '考研', subjects: ['政治', '英语', '数学', '专业课'] },
  { id: 'sb', name: '考编', subjects: ['公共基础知识', '职业能力测验', '综合应用能力', '面试'] },
  { id: 'zk', name: '职考技能', subjects: ['教师资格', '会计实务', '建筑工程', '社会工作', '健康管理', '人力资源', '计算机等级'] }
];

const emptyPackage = () => ({ name: '', price: '', lessons: '', description: '', videoUrl: '' });

/* 服务人群：可多选，默认家长；决定课程进家长课程页还是大学生学习资源页 */
const AUDIENCE_OPTIONS = [
  { value: '家长', hint: '课程展示在家长课程页', on: true },
  { value: '大学生', hint: '课程展示在大学生学习资源页', on: false }
];
function audienceOptionsOf(picked) {
  const list = Array.isArray(picked) && picked.length ? picked : ['家长'];
  return AUDIENCE_OPTIONS.map(item => Object.assign({}, item, { on: list.includes(item.value) }));
}

Page({
  data: {
    ready: false,
    logged: false,
    isInstitution: false,
    status: '',
    statusText: '',
    org: null,
    courses: [],
    /* 机构资料编辑 */
    showOrg: false,
    orgForm: { intro: '', address: '', contact: '', phone: '' },
    orgAudience: audienceOptionsOf(['家长']),
    savingOrg: false,
    /* 课程编辑 */
    showForm: false,
    creating: true,
    saving: false,
    learningNames: LEARNING.map(item => item.name),
    learningKindIndex: 0,
    subjects: [],
    subjectIndex: 0,
    form: {
      id: '', title: '', category: '', price: '', unit: '课时', tag: '',
      description: '', location: '', remaining: '10',
      packages: [emptyPackage()]
    }
  },

  onShow() {
    const user = getApp().globalData.user;
    this.setData({ logged: !!user, isInstitution: !!user && user.role === 'institution' });
    if (!user || user.role !== 'institution') {
      this.setData({ ready: true });
      return;
    }
    this.loadAll();
  },

  loadAll() {
    Promise.all([api.applications.mine(), api.institutions.list()]).then(([appRes, orgRes]) => {
      const appList = (appRes.ok && appRes.data) || [];
      const latest = appList[0] || null;
      this.approved = !!(latest && latest.status === 'approved');
      const orgList = (orgRes.ok && orgRes.data) || [];
      const org = orgList[0] || null;
      this.setData({
        ready: true,
        status: latest ? latest.status : '',
        statusText: latest ? fmt.applicationStatusText(latest.status) : '未提交',
        org: org || null,
        orgAudience: audienceOptionsOf(org && org.audience),
        orgForm: org ? {
          intro: org.intro || '',
          address: org.address || '',
          contact: org.contact || '',
          phone: org.phone || ''
        } : this.data.orgForm
      });
      if (this.approved) this.loadCourses();
    });
  },

  loadCourses() {
    const org = this.data.org;
    if (!org) return;
    api.services.list().then(res => {
      if (!res.ok) { ui.fail(res, '课程加载失败'); return; }
      getApp().cacheServices(res.data);
      const rows = (res.data || []).filter(item => item.merchant === org.name && item.type === 'course');
      this.setData({
        courses: rows.map(item => ({
          id: item.id,
          title: item.title,
          category: item.category || '',
          price: item.price,
          unit: item.unit || '',
          remaining: item.remaining,
          packageCount: Array.isArray(item.packages) ? item.packages.length : 0,
          learning: item.learning || null,
          learningName: (() => {
            if (!item.learning) return '';
            const found = LEARNING.find(l => l.id === item.learning.kind);
            return found ? found.name + ' · ' + item.learning.subject : '';
          })()
        }))
      });
    });
  },

  noop() {},

  goJoin() { wx.navigateTo({ url: '/pages/join/join' }); },
  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  /* ---------- 机构资料 ---------- */
  openOrg() {
    if (!this.data.org) return;
    this.setData({
      showOrg: true,
      orgAudience: audienceOptionsOf(this.data.org.audience)
    });
  },
  closeOrg() { this.setData({ showOrg: false }); },
  onOrgField(e) {
    this.setData({ ['orgForm.' + e.currentTarget.dataset.field]: e.detail.value });
  },
  toggleOrgAudience(e) {
    const value = e.currentTarget.dataset.value;
    const list = (this.data.orgAudience || []).map(item =>
      item.value === value ? Object.assign({}, item, { on: !item.on }) : item
    );
    this.setData({ orgAudience: list });
  },
  saveOrg() {
    const org = this.data.org;
    if (!org || this.data.savingOrg) return;
    const f = this.data.orgForm;
    const payload = {};
    for (const key of ['intro', 'address', 'contact', 'phone']) {
      const value = (f[key] || '').trim();
      if (value) payload[key] = value;
    }
    const audience = (this.data.orgAudience || []).filter(i => i.on).map(i => i.value);
    if (!audience.length) { ui.toast('请至少选择一个服务人群：家长 / 大学生'); return; }
    payload.audience = audience;
    this.setData({ savingOrg: true });
    api.institutions.update(org.id, payload).then(res => {
      this.setData({ savingOrg: false });
      if (!res.ok) { ui.fail(res, '保存失败'); return; }
      this.setData({ showOrg: false, org: res.data, orgAudience: audienceOptionsOf(res.data && res.data.audience) });
      ui.toast('机构资料已更新');
      getApp().globalData.services = [];
    });
  },

  /* ---------- 课程 ---------- */
  openCreate() {
    this.setData({
      showForm: true,
      creating: true,
      learningKindIndex: 0,
      subjects: [],
      subjectIndex: 0,
      form: {
        id: '', title: '', category: '', price: '', unit: '课时', tag: '',
        description: '', location: '', remaining: '10',
        packages: [emptyPackage()]
      }
    });
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const svc = (getApp().globalData.services || []).find(row => row.id === id);
    if (!svc) { ui.toast('课程资料已更新，请重新进入'); return; }
    const kindIndex = Math.max(0, LEARNING.findIndex(item => svc.learning && item.id === svc.learning.kind));
    const subjects = LEARNING[kindIndex].subjects;
    const subjectIndex = svc.learning ? Math.max(0, subjects.indexOf(svc.learning.subject)) : 0;
    this.setData({
      showForm: true,
      creating: false,
      learningKindIndex: kindIndex,
      subjects,
      subjectIndex,
      form: {
        id: svc.id,
        title: svc.title || '',
        category: svc.category || '',
        price: String(svc.price == null ? '' : svc.price),
        unit: svc.unit || '课时',
        tag: svc.tag || '',
        description: svc.description || '',
        location: svc.location || '',
        remaining: String(svc.remaining == null ? 10 : svc.remaining),
        packages: (svc.packages || []).map(p => ({
          id: p.id || '',
          name: p.name || '',
          price: String(p.price == null ? '' : p.price),
          lessons: String(p.lessons == null ? '' : p.lessons),
          description: p.description || '',
          videoUrl: p.videoUrl || ''
        }))
      }
    });
    if (!this.data.form.packages.length) this.setData({ 'form.packages': [emptyPackage()] });
  },

  closeForm() { this.setData({ showForm: false }); },

  onField(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onLearningKind(e) {
    const index = Number(e.detail.value);
    const subjects = LEARNING[index].subjects;
    this.setData({ learningKindIndex: index, subjects, subjectIndex: 0 });
  },

  onSubject(e) { this.setData({ subjectIndex: Number(e.detail.value) }); },

  onPackageField(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const packages = this.data.form.packages.slice();
    if (!packages[index]) return;
    packages[index][field] = e.detail.value;
    this.setData({ 'form.packages': packages });
  },

  addPackage() {
    const packages = this.data.form.packages.slice();
    if (packages.length >= 5) { ui.toast('最多 5 个套餐'); return; }
    packages.push(emptyPackage());
    this.setData({ 'form.packages': packages });
  },

  removePackage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const packages = this.data.form.packages.slice();
    packages.splice(index, 1);
    this.setData({ 'form.packages': packages.length ? packages : [emptyPackage()] });
  },

  saveCourse() {
    if (this.data.saving) return;
    const f = this.data.form;
    if (!f.title.trim()) { ui.toast('请填写课程名称'); return; }
    if (!f.category.trim()) { ui.toast('请填写课程分类'); return; }
    const price = Number(f.price);
    if (!Number.isFinite(price) || price <= 0) { ui.toast('请填写有效价格'); return; }
    if (!f.unit.trim()) { ui.toast('请填写计价单位'); return; }
    if (!f.description.trim()) { ui.toast('请填写课程介绍'); return; }

    const learning = LEARNING[this.data.learningKindIndex];
    const payload = {
      title: f.title.trim(),
      category: f.category.trim(),
      price,
      unit: f.unit.trim(),
      description: f.description.trim()
    };
    if (f.tag.trim()) payload.tag = f.tag.trim();
    if (f.location.trim()) payload.location = f.location.trim();
    if (f.remaining !== '' && Number.isInteger(Number(f.remaining))) payload.remaining = Number(f.remaining);
    if (learning.id) payload.learning = { kind: learning.id, subject: learning.subjects[this.data.subjectIndex] };
    else if (!this.data.creating) payload.learning = null;

    const filled = f.packages.filter(p => p.name.trim() || p.price || p.lessons);
    if (filled.length) {
      const packages = [];
      for (const row of filled) {
        const name = row.name.trim();
        const p = Number(row.price);
        const lessons = Number(row.lessons);
        if (!name) { ui.toast('请填写套餐名称'); return; }
        if (!Number.isFinite(p) || p <= 0) { ui.toast('套餐价格须大于 0'); return; }
        if (!Number.isInteger(lessons) || lessons < 1) { ui.toast('套餐课时须为正整数'); return; }
        const item = { name, price: p, lessons, description: row.description.trim() };
        if (row.id) item.id = row.id;
        if (row.videoUrl.trim()) item.videoUrl = row.videoUrl.trim();
        packages.push(item);
      }
      payload.packages = packages;
    } else if (!this.data.creating) {
      payload.packages = [];
    }

    this.setData({ saving: true });
    const req = this.data.creating
      ? api.services.create(Object.assign({ type: 'course' }, payload))
      : api.services.update(f.id, payload);
    req.then(res => {
      this.setData({ saving: false });
      if (!res.ok) { ui.fail(res, '保存失败'); return; }
      this.setData({ showForm: false });
      ui.toast(this.data.creating ? '课程已发布' : '课程已更新');
      getApp().globalData.services = [];
      this.loadCourses();
    });
  },

  previewCourse(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) });
  }
});

};
__mods["miniprogram/pages/institutions/institutions.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");

Page({
  data: {
    loading: true,
    keyword: '',
    all: [],
    list: []
  },

  onShow() {
    this.load();
  },

  load() {
    api.institutions.list().then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '机构目录加载失败');
        return;
      }
      const rows = (res.data || []).map(item => ({
        id: item.id,
        name: item.name,
        intro: item.intro || '',
        address: item.address || '',
        contact: item.contact || '',
        phone: item.phone || '',
        courseCount: item.courseCount || 0
      }));
      this.setData({ loading: false, all: rows, list: rows });
    });
  },

  onKeyword(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    this.apply(keyword);
  },

  apply(keyword) {
    const word = String(keyword || '').trim();
    const all = this.data.all || [];
    this.setData({
      list: word
        ? all.filter(row => (row.name + row.intro + row.address).indexOf(word) >= 0)
        : all
    });
  },

  openMerchant(e) {
    wx.navigateTo({ url: '/pages/merchant/merchant?name=' + encodeURIComponent(e.currentTarget.dataset.name) });
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  }
});

};
__mods["miniprogram/pages/join/join.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

const GENDERS = ['男', '女', '暂不填写'];
/* 服务人群：家长看课程页，大学生看学习资源页；默认勾选家长 */
const AUDIENCE_OPTIONS = [
  { value: '家长', hint: '课程展示在家长课程页', on: true },
  { value: '大学生', hint: '课程展示在大学生学习资源页', on: false }
];

Page({
  data: {
    logged: false,
    role: '',
    type: '',
    typeName: '',
    status: '',
    statusText: '',
    statusTone: '',
    submittedAt: '',
    form: {
      name: '',
      contact: '',
      phone: '',
      education: '',
      school: '',
      grade: '',
      subjects: '',
      major: '',
      resume: '',
      hourlyRate: '',
      gender: '暂不填写',
      photo: '',
      photoPreview: '',
      area: '',
      childGrade: '',
      vehicle: '',
      timeText: '',
      years: '',
      seat: ''
    },
    genders: GENDERS,
    genderIndex: 2,
    audienceOptions: AUDIENCE_OPTIONS.map(o => Object.assign({}, o)),
    safety: false,
    submitting: false,
    needLogin: false
  },

  /* 支持 ?type=driver 直接进入「私家车车主」入驻 */
  onLoad(query) {
    this.driverEntry = !!(query && query.type === 'driver');
  },

  onShow() {
    const user = getApp().globalData.user;
    if (!user) {
      this.setData({ logged: false, needLogin: true, status: '', statusText: '' });
      return;
    }
    if (this.driverEntry) {
      const form = Object.assign({}, this.data.form, { phone: user.phone || this.data.form.phone });
      this.setData({ logged: true, needLogin: false, role: user.role, type: '接送', typeName: '私家车车主', form });
      this.loadStatus();
      return;
    }
    const type = user.role === 'institution' ? '机构' : user.role === 'tutor' ? '伴学' : '';
    if (!type) {
      this.setData({
        logged: true,
        needLogin: false,
        role: user.role,
        type: '',
        typeName: '',
        statusText: ''
      });
      return;
    }
    const form = Object.assign({}, this.data.form, { phone: user.phone || this.data.form.phone });
    this.setData({ logged: true, needLogin: false, role: user.role, type, typeName: type, form });
    this.loadStatus();
  },

  loadStatus() {
    api.applications.mine().then(res => {
      if (!res.ok) return;
      const list = res.data || [];
      const latest = list[0];
      if (!latest) {
        this.setData({ status: '', statusText: '', statusTone: '' });
        return;
      }
      this.setData({
        status: latest.status,
        statusText: fmt.applicationStatusText(latest.status),
        statusTone: latest.status === 'approved' ? 'ok' : latest.status === 'pending' ? 'warn' : 'muted',
        submittedAt: fmt.dateTime(latest.createdAt)
      });
    });
  },

  onField(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onGender(e) {
    const index = Number(e.detail.value);
    this.setData({ genderIndex: index, 'form.gender': GENDERS[index] || '暂不填写' });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        wx.compressImage({
          src: file.tempFilePath,
          quality: 55,
          success: img => this.readPhoto(img.tempFilePath),
          fail: () => this.readPhoto(file.tempFilePath)
        });
      }
    });
  },

  readPhoto(path) {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: res => {
        const data = 'data:image/jpeg;base64,' + res.data;
        if (data.length > 300000) {
          ui.toast('照片过大，请换一张或重新拍摄');
          return;
        }
        this.setData({ 'form.photo': data, 'form.photoPreview': path });
      },
      fail: () => ui.toast('照片读取失败，请重试')
    });
  },

  toggleAudience(e) {
    const value = e.currentTarget.dataset.value;
    const list = (this.data.audienceOptions || []).map(item =>
      item.value === value ? Object.assign({}, item, { on: !item.on }) : item
    );
    this.setData({ audienceOptions: list });
  },

  pickedAudience() {
    return (this.data.audienceOptions || []).filter(i => i.on).map(i => i.value);
  },

  toggleSafety() { this.setData({ safety: !this.data.safety }); },

  submit() {
    if (this.data.submitting) return;
    const f = this.data.form;
    const type = this.data.type;
    if (!type) { ui.toast('当前账号类型暂不支持入驻'); return; }
    if (!f.name.trim()) { ui.toast(type === '机构' ? '请填写机构名称' : '请填写姓名'); return; }
    if (!/^1\d{10}$/.test(f.phone.trim())) { ui.toast('请填写 11 位手机号'); return; }
    if (f.phone.trim() !== (getApp().globalData.user && getApp().globalData.user.phone)) {
      ui.toast('申请手机号须与账号手机号一致');
      return;
    }
    const payload = { type, name: f.name.trim(), phone: f.phone.trim() };
    if (type === '接送') {
      for (const [key, label] of [
        ['area', '接送区域'], ['school', '孩子就读学校'],
        ['childGrade', '自家孩子年级'], ['vehicle', '车型与安全配置'], ['timeText', '可接时段']
      ]) {
        if (!f[key].trim()) { ui.toast('请填写' + label); return; }
        if (f[key].trim().length > 100) { ui.toast(label + '过长'); return; }
        payload[key] = f[key].trim();
      }
      const seat = Number(f.seat);
      if (!Number.isInteger(seat) || seat < 1 || seat > 6) { ui.toast('可接孩子数须为 1–6 的整数'); return; }
      payload.seat = seat;
      const years = Number(f.years || 0);
      if (!Number.isInteger(years) || years < 0 || years > 60) { ui.toast('接送年数不正确'); return; }
      payload.years = years;
      if (!this.data.safety) { ui.toast('请先阅读并勾选安全承诺'); return; }
      payload.safety = true;
    } else if (type === '机构') {
      if (!f.contact.trim()) { ui.toast('请填写联系人'); return; }
      payload.contact = f.contact.trim();
      const audience = this.pickedAudience();
      if (!audience.length) { ui.toast('请至少选择一个服务人群：家长 / 大学生'); return; }
      payload.audience = audience;
    } else {
      for (const [key, label, max] of [['education', '学历', 100], ['school', '就读学校', 100], ['grade', '年级', 100], ['subjects', '伴学方向', 100]]) {
        if (!f[key].trim()) { ui.toast('请填写' + label); return; }
        if (f[key].trim().length > max) { ui.toast(label + '过长'); return; }
        payload[key] = f[key].trim();
      }
      if (!f.resume.trim()) { ui.toast('请填写简历'); return; }
      payload.resume = f.resume.trim();
      if (!/^\d{1,5}(\.\d{1,2})?$/.test(f.hourlyRate) || Number(f.hourlyRate) <= 0) {
        ui.toast('课时费须为 0.01–10000 元');
        return;
      }
      payload.hourlyRate = Number(f.hourlyRate);
      if (!f.photo) { ui.toast('请上传正脸照片'); return; }
      payload.photo = f.photo;
      if (f.gender && f.gender !== '暂不填写') payload.gender = f.gender;
      if (f.major.trim()) payload.major = f.major.trim();
    }
    this.setData({ submitting: true });
    api.applications.submit(payload).then(res => {
      this.setData({ submitting: false });
      if (!res.ok) { ui.fail(res, '提交失败'); return; }
      ui.toast('申请已提交');
      this.loadStatus();
      wx.showModal({
        title: '已提交',
        content: '平台会在审核后开通相应权限，你可以在本页查看进度。',
        showCancel: false
      });
    });
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  goWorkspace() { wx.navigateTo({ url: '/pages/institution/institution' }); },
  goCompanion() { wx.navigateTo({ url: '/pages/companion/companion' }); }
});

};
__mods["miniprogram/pages/learning/learning.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

/* 各方向的一句说明，大学生与在职成人都能看懂 */
const KIND_TIPS = {
  gwy: '行测、申论、面试按模块开课，在职晚班与周末班可选',
  ky: '政治、英语、数学、专业课，按报考方向分班',
  sb: '公基、职测、综合应用，含面试模拟',
  zk: '面向大学生与在职成人，按证种分班：教师、财会、建工、社工、健康、人力、计算机等级',
  other: '机构开设的通识与技能类课程'
};

Page({
  data: {
    loading: true,
    kinds: [],
    kind: 'gwy',
    kindName: '',
    kindTip: '',
    subjects: [],
    subject: '全部',
    items: [],
    quick: [
      { page: '/pages/gaokao/gaokao', icon: '🎓', name: '升学规划', desc: '档案、曲线与关键节点' },
      { page: '/pages/exam/exam', icon: '📚', name: '公考研训', desc: '岗位库与进面线' },
      { page: '/pages/institutions/institutions', icon: '🏛️', name: '机构目录', desc: '本地机构与开设课程' }
    ]
  },

  onShow() {
    /* 首页「职考技能」入口会带一个默认分类过来 */
    const app = getApp();
    const pending = app.globalData.learningKind;
    if (pending) {
      app.globalData.learningKind = '';
      this.all = [];
      this.setData({ kind: pending, subject: '全部', items: [], loading: true });
    }
    this.load();
  },

  load() {
    if (!this.data.items.length) this.setData({ loading: true });
    api.learning.resources(this.data.kind, '').then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '学习资源加载失败');
        return;
      }
      const data = res.data || {};
      const kind = data.kind || 'gwy';
      this.all = (data.items || []).map(logic.learningItemView);
      this.setData({
        kinds: data.kinds || [],
        kind,
        kindName: data.kindName || '',
        kindTip: KIND_TIPS[kind] || '',
        subjects: data.subjects || [],
        loading: false
      });
      this.applySubject();
    });
  },

  onKind(e) {
    const kind = e.currentTarget.dataset.kind;
    if (kind === this.data.kind) return;
    this.setData({ kind, subject: '全部', items: [], loading: true });
    this.load();
  },

  onSubject(e) {
    this.setData({ subject: e.currentTarget.dataset.subject });
    this.applySubject();
  },

  applySubject() {
    const subject = this.data.subject;
    const all = this.all || [];
    this.setData({ items: subject === '全部' ? all : all.filter(row => row.subject === subject) });
  },

  openItem(e) {
    wx.navigateTo({
      url: '/pages/learning-detail/learning-detail?id=' + encodeURIComponent(e.currentTarget.dataset.id)
    });
  },

  openQuick(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.page });
  },

  onPullDownRefresh() {
    this.all = [];
    this.load();
    wx.stopPullDownRefresh();
  }
});

};
__mods["miniprogram/pages/learning-detail/learning-detail.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

Page({
  data: {
    view: null,
    kindName: '',
    subject: '',
    loading: true
  },

  onLoad(options) {
    this.serviceId = options.id ? decodeURIComponent(options.id) : '';
    this.kindName = options.kindName ? decodeURIComponent(options.kindName) : '';
    this.subject = options.subject ? decodeURIComponent(options.subject) : '';
  },

  onShow() {
    this.load();
  },

  load() {
    const cached = getApp().findService(this.serviceId);
    if (cached) {
      this.render(cached);
      return;
    }
    api.services.list().then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '课程加载失败');
        return;
      }
      getApp().cacheServices(res.data);
      const svc = getApp().findService(this.serviceId);
      if (!svc) {
        this.setData({ loading: false });
        ui.toast('课程不存在或已下架');
        setTimeout(() => wx.navigateBack(), 700);
        return;
      }
      this.render(svc);
    });
  },

  render(svc) {
    const view = logic.detailView(svc);
    const learning = svc.learning || {};
    const kinds = { gwy: '考公', ky: '考研', sb: '考编' };
    this.setData({
      view,
      kindName: this.kindName || kinds[learning.kind] || '',
      subject: this.subject || learning.subject || '',
      loading: false
    });
  },

  goBooking() {
    wx.navigateTo({ url: '/pages/booking/booking?id=' + encodeURIComponent(this.serviceId) });
  },

  goMerchant() {
    const view = this.data.view;
    if (!view || !view.merchant || !view.merchant.name) return;
    wx.navigateTo({ url: '/pages/merchant/merchant?name=' + encodeURIComponent(view.merchant.name) });
  },

  callPhone() {
    const phone = this.data.view && this.data.view.merchant && this.data.view.merchant.phone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
  },

  onShareAppMessage() {
    const view = this.data.view;
    return { title: view ? view.title : '学鹭伴学', path: '/pages/learning/learning' };
  }
});

};
__mods["miniprogram/pages/login/login.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");

const ROLES = [
  { id: 'parent', name: '家长', desc: '找课程 / 伴学 / 校车' },
  { id: 'tutor', name: '大学生', desc: '伴学入驻 / 学习资源 / 备考' },
  { id: 'institution', name: '机构', desc: '发布课程与套餐' }
];

Page({
  data: {
    roles: ROLES,
    role: 'parent',
    mode: 'login',
    phone: '',
    password: '',
    submitting: false
  },

  onLoad() {
    const user = getApp().globalData.user;
    if (user) this.setData({ role: user.role });
  },

  switchRole(e) {
    this.setData({ role: e.currentTarget.dataset.id });
  },

  switchMode() {
    this.setData({ mode: this.data.mode === 'login' ? 'register' : 'login' });
  },

  onField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const phone = this.data.phone.trim();
    const password = this.data.password;
    if (!/^1\d{10}$/.test(phone)) { ui.toast('请填写 11 位手机号'); return; }
    if (this.data.mode === 'register' && (password.length < 8 || password.length > 128)) {
      ui.toast('密码长度须为 8–128 位');
      return;
    }
    if (this.data.mode === 'login' && !password) { ui.toast('请填写密码'); return; }
    this.setData({ submitting: true });
    const call = this.data.mode === 'login'
      ? api.auth.login(phone, password)
      : api.auth.register(phone, password, this.data.role);
    call.then(res => {
      this.setData({ submitting: false });
      if (!res.ok) { ui.fail(res, this.data.mode === 'login' ? '登录失败' : '注册失败'); return; }
      api.setToken(res.data.token);
      getApp().setSession(res.data.user);
      wx.showToast({ title: this.data.mode === 'login' ? '登录成功' : '注册成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    });
  },

  /* 微信一键登录：openid 已绑定账号时直接进入 */
  wxLogin() {
    ui.loading('登录中');
    api.auth.wxLogin().then(res => {
      ui.hideLoading();
      if (res.ok && res.data && res.data.authenticated && res.data.token) {
        api.setToken(res.data.token);
        getApp().setSession(res.data.user);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      ui.toast('请先用手机号登录或注册');
    });
  }
});

};
__mods["miniprogram/pages/merchant/merchant.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

Page({
  data: {
    loading: true,
    org: null
  },

  onLoad(options) {
    this.institutionId = options.id ? decodeURIComponent(options.id) : '';
    this.institutionName = options.name ? decodeURIComponent(options.name) : '';
    this.load();
  },

  load() {
    const query = this.institutionId ? { id: this.institutionId } : { name: this.institutionName };
    api.institutions.detail(query).then(res => {
      if (!res.ok) {
        this.setData({ loading: false, org: null });
        ui.fail(res, '机构资料加载失败');
        return;
      }
      const org = this.decorate(res.data || {});
      this.setData({ loading: false, org });
      if (org.name) wx.setNavigationBarTitle({ title: org.name });
    });
  },

  /* 模板里不能调用方法，金额与课程价格先在这里算好 */
  decorate(raw) {
    const org = raw || {};
    return Object.assign({}, org, {
      stats: org.stats || { courseCount: 0, teacherCount: 0, packageCount: 0 },
      courses: (org.courses || []).map(course => Object.assign({}, course, {
        priceText: fmt.money(course.price)
      }))
    });
  },

  openCourse(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) });
  },

  callPhone() {
    const phone = this.data.org && this.data.org.phone;
    if (!phone) { ui.toast('暂未公开联系电话'); return; }
    wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
  },

  copyAddress() {
    const address = this.data.org && this.data.org.address;
    if (!address) { ui.toast('暂未公开机构地址'); return; }
    wx.setClipboardData({ data: address, success: () => ui.toast('地址已复制') });
  },

  goDirectory() {
    wx.redirectTo({ url: '/pages/institutions/institutions' });
  },

  onShareAppMessage() {
    const org = this.data.org;
    if (!org) return { title: '学鹭伴学 · 机构目录', path: '/pages/institutions/institutions' };
    return {
      title: org.name + ' · 学鹭伴学机构主页',
      path: '/pages/merchant/merchant?id=' + encodeURIComponent(org.id)
    };
  }
});

};
__mods["miniprogram/pages/mine/mine.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const fmt = require("miniprogram/utils/format.js");

const STAGES = ['早教', '幼儿园', '小学', '初中', '高中'];

Page({
  data: {
    user: null,
    roleName: '',
    profile: null,
    students: [],
    /* 学员编辑弹窗 */
    editing: null,
    editName: '',
    editAge: '',
    editGender: '未填写',
    editGuardian: '',
    editRelation: '家长',
    editPhone: '',
    editStage: '',
    stages: STAGES,
    showEdit: false,
    feedbackCount: 0
  },

  onShow() {
    const user = getApp().globalData.user;
    this.setData({
      user: user || null,
      roleName: user ? ui.roleName(user.role) : '游客'
    });
    if (user) this.loadProfile();
  },

  loadProfile() {
    api.profile.get().then(res => {
      if (!res.ok) { ui.fail(res, '档案加载失败'); return; }
      const p = res.data || {};
      this.setData({
        profile: p,
        students: Array.isArray(p.students) ? p.students : [],
        feedbackCount: p.feedback || 0
      });
    });
  },

  noop() {},

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录，确认退出？',
      success: () => {
        api.auth.logout().catch(() => {});
        getApp().logoutLocal();
        this.setData({ user: null, roleName: '游客', profile: null, students: [] });
        ui.toast('已退出登录');
      }
    });
  },

  /* ---------- 学员编辑 ---------- */
  addStudent() {
    this.setData({
      showEdit: true,
      editing: null,
      editName: '', editAge: '', editGender: '未填写',
      editGuardian: '', editRelation: '家长', editPhone: '', editStage: ''
    });
  },

  editStudent(e) {
    const index = Number(e.currentTarget.dataset.index);
    const s = this.data.students[index];
    if (!s) return;
    this.setData({
      showEdit: true,
      editing: index,
      editName: s.name || '',
      editAge: s.age == null ? '' : String(s.age),
      editGender: s.gender || '未填写',
      editGuardian: s.guardian || '',
      editRelation: s.relation || '家长',
      editPhone: s.phone || '',
      editStage: s.stage || ''
    });
  },

  closeEdit() { this.setData({ showEdit: false }); },

  onEditField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onEditGender(e) {
    this.setData({ editGender: ['男', '女', '未填写'][Number(e.detail.value)] || '未填写' });
  },

  onEditRelation(e) {
    this.setData({ editRelation: ['父亲', '母亲', '家长', '祖父母', '其他监护人'][Number(e.detail.value)] || '家长' });
  },

  onEditStage(e) {
    this.setData({ editStage: STAGES[Number(e.detail.value)] || '' });
  },

  saveStudent() {
    const name = this.data.editName.trim();
    if (!name) { ui.toast('请填写学员姓名'); return; }
    const item = {
      name,
      age: this.data.editAge ? Number(this.data.editAge) : null,
      gender: this.data.editGender,
      guardian: this.data.editGuardian.trim(),
      relation: this.data.editRelation,
      phone: this.data.editPhone.trim(),
      stage: this.data.editStage
    };
    const students = this.data.students.slice();
    if (this.data.editing === null || this.data.editing === undefined) {
      if (students.length >= 5) { ui.toast('最多添加 5 名学员'); return; }
      students.push(item);
    } else {
      students[this.data.editing] = item;
    }
    ui.loading('保存中');
    api.profile.update({ students }).then(res => {
      ui.hideLoading();
      if (!res.ok) { ui.fail(res, '保存失败'); return; }
      this.setData({ showEdit: false, students: res.data.students || [] });
      ui.toast('已保存');
    });
  },

  removeStudent(e) {
    const index = Number(e.currentTarget.dataset.index);
    const students = this.data.students.slice();
    students.splice(index, 1);
    ui.loading('保存中');
    api.profile.update({ students }).then(res => {
      ui.hideLoading();
      if (!res.ok) { ui.fail(res, '删除失败'); return; }
      this.setData({ students: res.data.students || [] });
      ui.toast('已删除');
    });
  },

  /* ---------- 入口 ---------- */
  goInstitution() { wx.navigateTo({ url: '/pages/institution/institution' }); },
  goInstitutions() { wx.navigateTo({ url: '/pages/institutions/institutions' }); },
  goJoin() { wx.navigateTo({ url: '/pages/join/join' }); },
  goCompanion() { wx.navigateTo({ url: '/pages/companion/companion' }); },
  goFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }); },
  goHelp() { wx.navigateTo({ url: '/pages/help/help' }); },
  goAdmin() { wx.navigateTo({ url: '/pages/admin/admin' }); },
  openAssistant() { wx.navigateTo({ url: '/pages/assistant/assistant' }); },
  goLearning() { wx.switchTab({ url: '/pages/learning/learning' }); }
});

};
__mods["miniprogram/pages/orders/orders.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'pending', name: '待支付' },
  { id: 'paid', name: '已支付' },
  { id: 'completed', name: '已完成' },
  { id: 'cancelled', name: '已取消' }
];

Page({
  data: {
    filters: FILTERS,
    filter: 'all',
    list: [],
    stats: null,
    loading: true
  },

  onShow() {
    if (!api.token()) {
      this.setData({ loading: false, list: [], stats: null, guest: true });
      return;
    }
    this.setData({ guest: false });
    this.refresh();
  },

  refresh() {
    ui.loading();
    return api.orders.list().then(res => {
      ui.hideLoading();
      this.setData({ loading: false });
      if (!res.ok) { ui.fail(res, '订单加载失败'); return; }
      const all = res.data || [];
      this.all = all;
      this.setData({ stats: logic.orderStats(all) });
      this.applyFilter();
    });
  },

  applyFilter() {
    const rows = (this.all || []).filter(o => this.data.filter === 'all' || o.status === this.data.filter);
    const services = getApp().globalData.services || [];
    this.setData({ list: rows.map(o => logic.orderView(o, services)) });
  },

  onFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id });
    this.applyFilter();
  },

  pay(e) {
    const id = e.currentTarget.dataset.id;
    const order = (this.all || []).find(o => o.id === id);
    if (!order) return;
    wx.showModal({
      title: '确认支付',
      content: '订单金额 ¥' + order.amount + '，支付后将生成服务核销码。',
      confirmText: '支付',
      success: () => {
        ui.loading('支付中');
        api.orders.pay(id).then(res => {
          ui.hideLoading();
          if (!res.ok) { ui.fail(res, '支付失败'); return; }
          wx.showToast({ title: '支付成功', icon: 'success' });
          this.refresh();
        });
      }
    });
  },

  cancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消订单',
      content: '取消后该订单不可恢复，确认取消？',
      confirmText: '取消订单',
      success: () => {
        ui.loading('处理中');
        api.orders.cancel(id).then(res => {
          ui.hideLoading();
          if (!res.ok) { ui.fail(res, '取消失败'); return; }
          ui.toast('订单已取消');
          this.refresh();
        });
      }
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});

};
__mods["miniprogram/pages/service/service.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

Page({
  data: {
    loading: true,
    tab: 'tutor',
    tabs: [
      { id: 'tutor', name: '伴学老师' },
      { id: 'bus', name: '安心校车' }
    ],
    tutors: [],
    buses: [],
    tip: ''
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.data.tutors.length && !this.data.buses.length) this.setData({ loading: true });
    api.services.list().then(res => {
      if (!res.ok) {
        this.setData({ loading: false });
        ui.fail(res, '伴学服务加载失败');
        return;
      }
      getApp().cacheServices(res.data);
      const rows = Array.isArray(res.data) ? res.data : [];
      const view = list => list.map(item => {
        const slots = Array.isArray(item.calendar && item.calendar.slots) ? item.calendar.slots : [];
        return Object.assign(logic.listView(item), {
          description: item.description || '',
          slotText: slots.length ? slots.length + ' 个可约时段' : ''
        });
      });
      this.setData({
        loading: false,
        tutors: view(rows.filter(item => item.type === 'tutor')),
        buses: view(rows.filter(item => item.type === 'bus'))
      });
      this.syncTip();
    });
  },

  syncTip() {
    this.setData({
      tip: this.data.tab === 'tutor'
        ? '老师和家长互相选择：先看老师资料与可约时段，双方确认后再成单。'
        : '线路和上下车站点互相匹配：先选线路，再定上车点与下车点，按月订购。'
    });
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    this.syncTip();
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) });
  },

  onPullDownRefresh() {
    this.setData({ tutors: [], buses: [] });
    this.load();
    wx.stopPullDownRefresh();
  }
});

};
__mods["miniprogram/pages/transport/transport.js"] = function (module, exports, require) {
const api = require("miniprogram/utils/api.js");
const ui = require("miniprogram/utils/ui.js");
const logic = require("miniprogram/utils/logic.js");

Page({
  data: {
    tabs: logic.BUS_SECTIONS,
    active: 'route',
    hint: '',
    rows: [],
    safety: [
      { icon: '🪪', text: '实名核验 · 无犯罪记录承诺' },
      { icon: '🧒', text: '私家车车主须同时接送自家孩子' },
      { icon: '💺', text: '乘车系好安全带，配儿童安全座椅' },
      { icon: '📍', text: '只在学校与住址两点往返，不绕路不停留' }
    ]
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    ui.loading();
    return api.services.list().then(res => {
      ui.hideLoading();
      if (!res.ok) { ui.fail(res, '接送服务加载失败'); return; }
      this.all = (res.data || []).filter(item => item.type === 'bus');
      this.applyTab();
    });
  },

  applyTab() {
    const active = this.data.active;
    const sectionOf = logic.busSection;
    const rows = this.all
      .filter(item => sectionOf(item) === active)
      .map(item => {
        const view = logic.listView(item);
        const detail = item.pickupDetail || item.busDetail || {};
        const routes = Array.isArray(detail.routes) ? detail.routes : [];
        const first = routes[0] || {};
        const last = routes[routes.length - 1] || {};
        view.routeText = first.name && last.name ? first.name + ' → ' + last.name : (item.location || '');
        view.timeText = first.departure && last.departure
          ? '早 ' + first.departure + ' · 晚 ' + last.departure
          : (detail.timeText || '');
        return view;
      });
    const picked = this.data.tabs.find(t => t.id === active);
    this.setData({ rows, hint: picked ? picked.hint : '' });
  },

  onTab(e) {
    this.setData({ active: e.currentTarget.dataset.id });
    this.applyTab();
  },

  openDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) });
  },

  /* 私家车入驻：必须是同时接送自家孩子的家长 */
  goJoin() { wx.navigateTo({ url: '/pages/join/join?type=driver' }); }
});

};
__mods["miniprogram/utils/api.js"] = function (module, exports, require) {
/* ------------------------------------------------------------------ *
 * 学鹭伴学 · 小程序接口层
 *
 * 两种后端模式（utils/config.js 的 USE_CLOUD 切换）：
 *   1. 本地模拟（默认）：调用 utils/mock.js，数据存本地存储，开箱即用；
 *   2. 微信云开发：调用 wx.cloud.callFunction，由 cloudfunctions/ 云函数 +
 *      云数据库承载。切换前需部署云函数并配置 CLOUD_ENV。
 *
 * 两种模式对页面暴露完全相同的接口与返回结构：
 *   { ok, status, data, error, needLogin }
 * ------------------------------------------------------------------ */

const config = require("miniprogram/utils/config.js");
const mock = require("miniprogram/utils/mock.js");

const TOKEN_KEY = config.STORAGE_PREFIX + 'token';
const USER_KEY = config.STORAGE_PREFIX + 'user';

function readRaw(key) {
  try { return wx.getStorageSync(key); } catch (e) { return ''; }
}
function writeRaw(key, value) {
  try { wx.setStorageSync(key, value); } catch (e) { /* 存储不可用时降级到内存 */ }
}

/* ---------------- 模式判断 ---------------- */
let cloudInited = false;

function useCloud() {
  if (!config.USE_CLOUD) return false;
  if (!config.CLOUD_ENV) return false;
  if (cloudInited) return true;
  try {
    wx.cloud.init({ env: config.CLOUD_ENV, traceUser: false });
    cloudInited = true;
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------------- 令牌与本地账号 ---------------- */
let memoryToken = '';

function token() { return memoryToken || readRaw(TOKEN_KEY) || ''; }
function setToken(value) {
  memoryToken = typeof value === 'string' ? value : '';
  writeRaw(TOKEN_KEY, memoryToken);
}
function clearToken() { memoryToken = ''; writeRaw(TOKEN_KEY, ''); }

function user() {
  const raw = readRaw(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && parsed.id ? parsed : null;
  } catch (e) { return null; }
}
function setUser(row) {
  if (!row || !row.id) { clearUser(); return null; }
  const clean = { id: row.id, phone: row.phone || '', role: row.role || 'parent' };
  writeRaw(USER_KEY, JSON.stringify(clean));
  return clean;
}
function clearUser() { writeRaw(USER_KEY, ''); }

/* ---------------- 统一调用 ---------------- */
/* name: 云函数名（模拟模式下对应 mock 模块的 handler）；action: 动作；data: 参数 */
function call(name, action, data) {
  const payload = Object.assign({}, data || {});
  payload.action = action || 'run';
  const current = token();
  if (current) payload.token = current;

  if (!useCloud()) {
    const result = mock.handle(name, payload);
    if (result.code === 0) return Promise.resolve({ ok: true, status: 200, data: result.data });
    /* 只有带 needLogin 标记的 401（会话失效）才清本地令牌；业务 401（如密码错误）不清 */
    if (result.code === 401 && result.needLogin) { clearToken(); clearUser(); }
    return Promise.resolve({
      ok: false,
      status: result.code || 500,
      needLogin: result.code === 401 && !!result.needLogin,
      error: result.message || '请求失败'
    });
  }

  return new Promise(resolve => {
    wx.cloud.callFunction({
      name: name,
      data: payload,
      success(res) {
        const result = (res && res.result) || {};
        const code = Number(result.code);
        if (code === 0) {
          resolve({ ok: true, status: 200, data: result.data });
          return;
        }
        if (code === 401 && result.needLogin) { clearToken(); clearUser(); }
        resolve({
          ok: false,
          status: code || 500,
          needLogin: code === 401 && !!result.needLogin,
          error: result.message || ('请求失败（' + (code || '未知') + '）')
        });
      },
      fail(err) {
        resolve({
          ok: false,
          status: 0,
          error: '云函数调用失败：' + name + '/' + (action || 'run') +
            (err && err.errMsg ? '（' + err.errMsg + '）' : '')
        });
      }
    });
  });
}

/* ---------------- 账号 ---------------- */
const auth = {
  wxLogin: () => call('auth', 'wxLogin', {}),
  register: (phone, password, role) => call('auth', 'register', { phone, password, role }),
  login: (phone, password) => call('auth', 'login', { phone, password }),
  me: () => call('auth', 'me', {}),
  logout: () => call('auth', 'logout', {})
};

/* ---------------- 服务目录 ---------------- */
const services = {
  list: (type) => call('services', 'list', type ? { type } : {}),
  availability: (id, date) => call('services', 'availability', { id, date }),
  create: (payload) => call('services', 'create', payload || {}),
  update: (id, payload) => call('services', 'update', Object.assign({ id }, payload || {})),
  tempUrl: (fileIDs) => call('services', 'tempUrl', { fileIDs: Array.isArray(fileIDs) ? fileIDs : [] }),
  recordVideo: (payload) => call('services', 'recordVideo', payload || {})
};

/* ---------------- 订单 ---------------- */
const orders = {
  list: () => call('orders', 'list', {}),
  create: (payload) => call('orders', 'create', payload || {}),
  pay: (id) => call('orders', 'pay', { id }),
  cancel: (id) => call('orders', 'cancel', { id }),
  complete: (id) => call('orders', 'complete', { id }),
  /* 平台管理：全部订单与代为核销 */
  adminList: (adminToken) => call('orders', 'list', { all: true, adminToken }),
  adminComplete: (id, adminToken) => call('orders', 'complete', { id, adminToken })
};

/* ---------------- 入驻申请 ---------------- */
const applications = {
  submit: (payload) => call('applications', 'submit', payload || {}),
  mine: () => call('applications', 'mine', {}),
  list: (adminToken) => call('applications', 'list', { adminToken }),
  approve: (id, adminToken) => call('applications', 'approve', { id, adminToken })
};

/* ---------------- 机构 ---------------- */
const institutions = {
  list: () => call('institutions', 'list', {}),
  /* 机构主页：环境图 / 课程 / 师资 / 价格区间；id 或 name 二选一 */
  detail: (params) => call('institutions', 'detail', params || {}),
  get: (id) => call('institutions', 'get', { id }),
  update: (id, patch) => call('institutions', 'update', Object.assign({ id }, patch || {}))
};

/* ---------------- 档案 / 反馈 ---------------- */
const profile = {
  get: () => call('profile', 'get', {}),
  update: (patch) => call('profile', 'update', patch || {})
};
const feedback = {
  submit: (payload) => call('feedback', 'submit', payload || {}),
  list: () => call('feedback', 'list', {})
};

/* ---------------- 学习资源 / 内容 ---------------- */
const learning = {
  resources: (kind, subject) => call('learning', 'resources', { kind, subject })
};
const content = {
  all: () => call('content', 'all', {})
};

/* ---------------- 高考志愿模拟填报 ---------------- */
const gaokao = {
  meta: () => call('gaokao', 'meta', {}),
  universities: (params) => call('gaokao', 'universities', params || {}),
  detail: (id, province, year) => call('gaokao', 'detail', { id, province, year }),
  majorSeries: (id, major, province) => call('gaokao', 'majorSeries', { id, major, province }),
  recommend: (params) => call('gaokao', 'recommend', params || {})
};

/* ---------------- 考公 / 考研 / 考编 ---------------- */
const exam = {
  meta: () => call('exam', 'meta', {}),
  resources: (kind, seed) => call('exam', 'resources', { kind, seed }),
  items: (params) => call('exam', 'items', params || {}),
  detail: (kind, id, year) => call('exam', 'detail', { kind, id, year }),
  match: (params) => call('exam', 'match', params || {})
};

/* ---------------- 升学规划（档案 / 学业曲线 / 选科 / 多元升学 / 节点） ---------------- */
const plan = {
  overview: (params) => call('plan', 'overview', params || {}),
  profileSave: (profile) => call('plan', 'profileSave', { profile }),
  exams: () => call('plan', 'exams', {}),
  examAdd: (exam) => call('plan', 'examAdd', { exam }),
  examRemove: (id) => call('plan', 'examRemove', { id }),
  subjects: (params) => call('plan', 'subjects', params || {}),
  pathways: (params) => call('plan', 'pathways', params || {}),
  reset: () => call('plan', 'reset', {})
};

/* ---------------- 本地清单（志愿表 / 报考清单） ---------------- */
const lists = {
  admissionGet: () => call('lists', 'admissionGet', {}),
  admissionSave: (rows) => call('lists', 'admissionSave', { rows }),
  examGet: () => call('lists', 'examGet', {}),
  examSave: (rows) => call('lists', 'examSave', { rows })
};

/* ---------------- 定位 ---------------- */
const location = {
  reverse: (latitude, longitude) => call('location', 'reverse', { latitude, longitude })
};

/* ---------------- 种子数据 ---------------- */
const seed = {
  run: () => call('seed', 'run', {})
};

/* ---------------- 学鹭助手 ---------------- */
const assistant = {
  status: () => call('assistant', 'status', {}),
  chat: (question, history) => call('assistant', 'chat', { question, history: history || [] })
};

module.exports = {
  useCloud,
  token, setToken, clearToken,
  user, setUser, clearUser,
  call,
  auth, services, orders, applications, institutions,
  profile, feedback, learning, content,
  gaokao, exam, lists, location, seed, assistant, plan,
  resetMock: mock.reset
};

};
__mods["miniprogram/utils/assistant-data.js"] = function (module, exports, require) {
/* 学鹭助手 · 常见问题库与匹配逻辑
 * 与网页版 assistant.js 同一套匹配规则：先去停用词 → 整词包含优先 → 二元组重合兜底。
 * 这里只放纯数据与纯函数，页面与云函数都直接复用。
 */

/* [问题, 答案] */
const FAQ = [
  ['怎么注册账号？', '在「我的」页点登录，用手机号注册并选择家长、大学生或机构身份。'],
  ['忘记密码怎么办？', '登录页点「忘记密码」，输入注册手机号获取验证码后重设密码。'],
  ['没有账号能看内容吗？', '可以。课程、院校、岗位都能浏览，只有下单、收藏和提交申请需要登录。'],
  ['账号类型选错了怎么办？', '退出后重新注册一个对应身份的账号即可，已产生的订单和申请不会丢失。'],
  ['一个账号能加几个孩子？', '最多 5 个，在「我的 → 学员信息」里添加和维护。'],
  ['怎么修改孩子信息？', '进入「我的」，找到学员信息卡片，点编辑后保存即可。'],
  ['怎么预约课程？', '在首页选一门课，点进详情页后「立即报名」，填写学员信息提交，再到订单里支付。'],
  ['课程可以试听吗？', '暂不支持单节试听，可以先进详情页看课程介绍、师资与套餐说明。'],
  ['课程套餐怎么选？', '详情页每个套餐单独定价并标注课时数，按需要选一个再报名。'],
  ['课程视频在哪看？', '课程详情页的套餐里有视频时会出现播放器，点开即可观看。'],
  ['课程名额怎么算？', '每门课都有剩余名额，支付成功时再次校验，售满会提示名额冲突。'],
  ['名额满了还能报吗？', '不能，可以等有人退课释放名额，或者先看看同类其他课程。'],
  ['怎么收藏课程？', '课程卡片或详情页点收藏图标，收藏内容在「我的 → 我的收藏」里。'],
  ['收藏的内容在哪看？', '「我的 → 我的收藏」，可按课程、院校、岗位筛选。'],
  ['课程能转让给别人吗？', '不支持，名额绑定报名时填写的学员信息。'],
  ['怎么找附近的机构？', '首页下方有机构目录，可以按名称和地址搜索，点进去看机构和课程。'],
  ['伴学服务是什么？', '大学生提供的阅读陪伴、习惯培养、时间规划支持，不含学科补课。'],
  ['伴学怎么选时间？', '伴学详情页有老师开放的固定时段，选好时段后按小时计价。'],
  ['一次伴学多久？', '一个时段 1 小时，可以一次约多个时段，价格按时段数量自动计算。'],
  ['老师资料可信吗？', '入驻时需提交学历、学校与简历，平台审核通过后才会出现在列表里。'],
  ['可以对老师提要求吗？', '可以在下单备注里写清孩子的年龄、性格和陪伴重点，老师会提前准备。'],
  ['伴学能提分吗？', '不做提分承诺。伴学只提供陪伴与习惯支持，学科问题请找对应课程。'],
  ['校车怎么订购？', '在首页「安心校车」选线路，详情页选上下车点后按月订购。'],
  ['校车能看车辆位置吗？', '可以，详情页有线路站点图和车辆位置示意，能看到当前行驶到哪一站。'],
  ['可以换上下车点吗？', '订购后暂不支持自助修改，需要联系机构在后台调整。'],
  ['校车费用包含什么？', '月付套餐含固定线路接送，不含餐费和其他杂费。'],
  ['校车晚点会通知吗？', '会通过站内消息提醒，也可以在机构主页找到司机电话直接联系。'],
  ['订单多久不支付会失效？', '30 分钟，超时系统自动取消并释放名额。'],
  ['怎么查看我的订单？', '底部「订单」标签，全部订单按状态分组展示。'],
  ['支付是真实的吗？', '当前使用平台内的支付流程，不产生任何真实扣款。'],
  ['核销码在哪里看？', '支付成功后，订单卡片里会显示 8 位核销码。'],
  ['核销码怎么用？', '把码给机构或老师，他们在工作台点核销即可完成订单。'],
  ['订单可以取消吗？', '待支付状态可以直接取消；已支付的要先申请退款。'],
  ['怎么申请退款？', '在订单详情里选订单、填写原因提交，平台审核通过后状态变为已退款。'],
  ['退款多久到账？', '审核通过后即时退回原支付渠道，通常 1–3 个工作日到账。'],
  ['退款被拒绝怎么办？', '可以补充说明后再次申请，或直接联系机构协商解决。'],
  ['可以部分退款吗？', '暂不支持按课次部分退，只能整单退。'],
  ['发票怎么开？', '在订单详情里选已支付订单，填抬头和税号后提交开票申请。'],
  ['能开专票吗？', '目前只支持普通发票，专票需要联系平台客服登记。'],
  ['怎么评价课程？', '订单完成后，订单卡会出现评价入口，星级 1–5 星加文字。'],
  ['评价可以修改吗？', '提交后不能自行修改，可以联系客服处理。'],
  ['怎么入驻成为机构？', '「我的 → 我要入驻」提交资料，平台审核通过后即可发布课程。'],
  ['入驻要准备什么？', '机构名称、联系人、手机号、服务人群；伴学还要学历、学校、简历和照片。'],
  ['入驻审核要多久？', '提交后通常在 1–3 个工作日内处理，进度可在入驻页查看。'],
  ['审核没通过怎么办？', '按驳回说明补充资料后重新提交，同一时间只能有一份待审申请。'],
  ['服务人群怎么选？', '入驻时选家长或大学生，可多选；决定课程进家长课程页还是学习资源页。'],
  ['服务人群能改吗？', '可以，机构工作台的机构资料里随时修改，保存后分区立即变化。'],
  ['机构怎么发布课程？', '工作台点「发布课程」，填名称、分类、价格、课时和介绍，保存即上线。'],
  ['机构能自己改价格吗？', '可以，工作台编辑课程直接改，用户端刷新后立即生效。'],
  ['机构怎么核销订单？', '工作台订单列表里，已支付订单点核销即可。'],
  ['机构能看到收入吗？', '可以，工作台汇总已支付与已完成订单的成交金额。'],
  ['机构怎么回复评价？', '工作台评价列表里，每条评价下方可以写回复。'],
  ['服务可以下架吗？', '可以，把课程设为下架，用户端列表就不再展示。'],
  ['下架的课程订单怎么办？', '已产生的订单不受影响，仍可正常核销。'],
  ['一个机构能发几门课？', '不限数量，课程列表按发布顺序展示。'],
  ['学习资源是什么？', '大学生中心的学习资源页，按考公、考研、考编分类汇总机构课程。'],
  ['为什么我的课程没进学习资源？', '需要机构服务人群包含大学生；没选考试方向的会归到「其他课程」。'],
  ['其他课程是什么分类？', '机构选了大学生但课程没设考试方向时归到这里，课程不会因此消失。'],
  ['学习资源能按科目筛吗？', '可以，先选考试分类，再选科目，只展示对应课程。'],
  ['学习资源怎么报名？', '点进课程详情就能报名，流程和首页课程一样。'],
  ['学习资源收费吗？', '课程由机构定价，按套餐课时收费，详情页有明确价格。'],
  ['升学规划怎么用？', '底部「学习」页进入升学规划，先选省份和分数，再看冲稳保推荐。'],
  ['冲稳保是什么意思？', '冲是分数线略高于你，稳是和你接近，保是明显低于你用来兜底。'],
  ['推荐准吗？', '按往年分数和位次做的参考模型，最终填报请以官方招生计划为准。'],
  ['院校数据有几年？', '2016–2025 共 10 年，含校线、各省投档线和专业线。'],
  ['为什么各省分数线不同？', '各省考生规模、招生计划和竞争程度不同，模型里用省份系数换算。'],
  ['上海海南的分数为什么不一样？', '两地高考满分不同（上海 660、海南 900），系统会自动换算。'],
  ['怎么看某专业在哪些学校有？', '在专业库里选学科门类，能看到开设该专业的院校和各自分数线。'],
  ['选科要求是什么？', '新高考 3+1+2 下部分专业要求必选物理或历史，专业页会标注。'],
  ['一分一段怎么看？', '输入分数能看到累计位次、同分人数，以及这个位次大致能报的院校区间。'],
  ['为什么要看位次不看分数？', '每年题目难度不同，分数会浮动，位次更能反映真实竞争力。'],
  ['升学规划能做什么？', '学生档案、学业曲线、路径规划、选科建议、多元升学、关键节点六个板块放在一页，档案保存后随时回来接着看。'],
  ['目标差距怎么算？', '用目标层次的模拟投档线减去最近 6 次考试均分，再按剩余学期折算成每学期需要提升的分数。'],
  ['院校分数线在哪看？', '升学规划「路径规划」底部进「院校参考」，按省份、层次、类型筛院校，能看到模拟投档线与位次。'],
  ['多元升学是什么？', '强基计划、综合评价、专项计划、竞赛保送四条路径，按年级、分数、位次和奖项逐条核对是否基本符合。'],
  ['分数线预警是什么？', '标出今年比去年涨幅超过 10 分的院校，提示风险。'],
  ['院校对比最多几所？', '4 所，并排比较分数线、位次、专业数和排名。'],
  ['考公考研怎么用？', '「学习」页进入考公考研，三个标签切换考公、考研、考编，支持筛选和分数匹配。'],
  ['岗位数据从哪来？', '按公开招录信息整理的岗位库，报考请以官方公告为准。'],
  ['进面线是什么？', '公务员考试进入面试的最低笔试分数，满分 200。'],
  ['竞争比怎么看？', '报名人数除以招录人数，数值越大竞争越激烈。'],
  ['考研复试线是什么？', '进入复试的最低初试总分，满分 500，还要参考国家线。'],
  ['国家线和院校线什么关系？', '院校线一般不低于国家线，热门院校会高出很多。'],
  ['考编的合格线是多少？', '满分 100，合格线通常 50–80 分，具体看单位和岗位要求。'],
  ['报考条件怎么自查？', '填学历、专业、政治面貌，系统逐条判断能否报考并说明原因。'],
  ['学历不够能报吗？', '不能，学历要求是硬条件，系统会标为不可报。'],
  ['专业不限的岗位多吗？', '有一部分综合管理岗不限专业，竞争通常更激烈。'],
  ['党员身份有什么用？', '部分岗位限中共党员，勾选后只显示这些岗位。'],
  ['报名日历在哪看？', '考公考研页的报名日历，显示报名起止、笔试和出分时间。'],
  ['备考计划怎么生成？', '填目标考试日期和每天可用时长，系统按阶段生成周计划。'],
  ['模拟成绩怎么查？', '输入准考证号，可以查到对应的成绩和排名。'],
  ['进面名单是什么？', '按 3:1 比例估算的进面名单，可以看自己大概排第几。'],
  ['职位表能导出吗？', '可以按当前筛选结果导出清单。'],
  ['全局搜索能找到什么？', '课程、机构、院校、岗位一次搜完，结果按类型分组。'],
  ['消息在哪看？', '「我的」页有消息入口，订单、核销、退款和提醒都会推到这里。'],
  ['平台管理在哪进？', '「我的」页最下方是平台管理，需要管理令牌才能查看申请和全部订单。'],
  ['怎么审核机构入驻？', '平台管理里打开入驻审核，看到待审申请可以直接通过或查看资料。'],
  ['管理令牌是什么？', '平台给管理员的访问凭证，输入后即可查看入驻申请与全部订单。'],
  ['怎么反馈问题？', '「我的 → 意见反馈」提交，可选择类型、写描述并留联系方式。'],
  ['反馈多久回复？', '一般 1–2 个工作日内处理，复杂问题会电话联系。'],
  ['数据存在哪里？', '账号资料与订单存储在云端，志愿表和收藏跟随账号同步。'],
  ['数据会丢吗？', '正常使用不会丢，退出登录不影响已提交的订单和申请。'],
  ['可以多人同时用吗？', '可以，每个账号看到的是自己的订单、申请和收藏。'],
  ['能填真实个人信息吗？', '可以填写必要的联系信息，身份证号等敏感信息不建议填写。'],
  ['手机上能用吗？', '现在就是手机端，微信里直接打开小程序即可。'],
  ['为什么点按钮没反应？', '先看是否已登录，网络慢时稍等一两秒再点一次。'],
  ['页面一直加载怎么办？', '下拉刷新一次；仍然不行就退出小程序重新进入。'],
  ['怎么联系平台？', '「我的 → 帮助中心」有客服电话、邮箱与服务时间。']
];

/* 去停用词：这些词几乎出现在每个问题里，留着会让匹配全跑偏 */
const STOP = ['怎么', '怎样', '如何', '什么', '请问', '一下', '我想', '可以', '能不能', '是否',
  '能', '吗', '呢', '的', '是', '我', '你', '有', '在', '看', '要', '办', '都', '还', '这', '那', '哪', '哪里', '哪个', '几', '多少'];

function coreOf(text) {
  let s = String(text || '');
  for (const w of STOP) s = s.split(w).join(' ');
  return s.replace(/[\s，。？！?、,.;；:：]/g, '').trim();
}

function bigrams(text) {
  const out = new Set();
  for (let i = 0; i < text.length - 1; i++) out.add(text.slice(i, i + 2));
  return out;
}

/* 页面路由：命中关键词就给一个「去这里」按钮。
 * 顺序有意义——越具体的越靠前（退款在订单前，志愿在课程前）。
 * tab: true 表示 tabBar 页面，需要 switchTab 打开。 */
const ROUTES = [
  { key: 'refund', label: '退款与发票', path: '/pages/orders/orders', tab: true, keys: ['退款', '退课', '发票', '开票', '报销'] },
  { key: 'report', label: '订单评价', path: '/pages/orders/orders', tab: true, keys: ['评价', '评分', '星级'] },
  { key: 'favorites', label: '我的收藏', path: '/pages/mine/mine', tab: true, keys: ['收藏'] },
  { key: 'messages', label: '消息中心', path: '/pages/mine/mine', tab: true, keys: ['消息', '通知', '提醒'] },
  { key: 'gaokao', label: '升学规划', path: '/pages/gaokao/gaokao', tab: false, keys: ['志愿', '院校', '专业库', '投档线', '位次', '一分一段', '选科', '升学规划', '学业曲线', '强基', '综评', '专项', '关键节点'] },
  { key: 'exam', label: '考公考研', path: '/pages/exam/exam', tab: false, keys: ['考公', '考研', '考编', '岗位', '进面', '竞争比', '报名日历', '备考', '准考证'] },
  { key: 'learning', label: '学习资源', path: '/pages/learning/learning', tab: true, keys: ['学习资源', '其他课程', '考公考研课'] },
  { key: 'bus', label: '安心校车', path: '/pages/index/index', tab: true, keys: ['校车', '线路', '接送', '站点'] },
  { key: 'tutor', label: '优选伴学', path: '/pages/index/index', tab: true, keys: ['伴学', '伴学', '老师', '课时'] },
  { key: 'course', label: '精品课程', path: '/pages/index/index', tab: true, page: 'course', keys: ['课程', '报课', '试听', '套餐'] },
  { key: 'institutions', label: '机构目录', path: '/pages/institutions/institutions', tab: false, keys: ['机构目录', '附近机构', '找机构'] },
  { key: 'orders', label: '我的订单', path: '/pages/orders/orders', tab: true, keys: ['订单', '核销', '支付', '付款', '取消'] },
  { key: 'join', label: '我要入驻', path: '/pages/join/join', tab: false, keys: ['入驻', '机构注册', '服务人群'] },
  { key: 'workspace', label: '机构工作台', path: '/pages/institution/institution', tab: false, keys: ['工作台', '发布课程', '下架', '上架', '收入'] },
  { key: 'profile', label: '个人中心', path: '/pages/mine/mine', tab: true, keys: ['账号', '密码', '登录', '资料', '孩子', '学员', '手机号'] },
  { key: 'admin', label: '平台管理', path: '/pages/admin/admin', tab: false, keys: ['平台管理', '管理令牌', '审核', '看板'] },
  { key: 'feedback', label: '意见反馈', path: '/pages/feedback/feedback', tab: false, keys: ['反馈', '建议', '投诉'] },
  { key: 'help', label: '帮助中心', path: '/pages/help/help', tab: false, keys: ['帮助', '客服', '联系平台', '电话'] }
];

function routeOf(text) {
  const s = String(text || '');
  for (const r of ROUTES) {
    for (const k of r.keys) {
      if (s.includes(k)) return { key: r.key, label: r.label, path: r.path, tab: !!r.tab };
    }
  }
  return null;
}

function score(question, input) {
  const q = String(question || '');
  const core = coreOf(input);
  if (!core) return 0;
  /* 整词命中：长度越长越可信 */
  if (core.length >= 2 && q.includes(core)) return 100 + core.length * 5;
  const qb = bigrams(q);
  let hit = 0;
  for (const b of bigrams(core)) if (qb.has(b)) hit += 1;
  return hit * 10;
}

/* 整词命中（>=100）或至少两个二元组重合（>=20）才算答上 */

/* ---------- 课程推荐意图 ----------
 * 例：「我是一个十一岁孩子的家长，我想要给孩子找一个数学课程」
 * 识别 学科（数学/语文/英语…）+ 学段（小学/初中/高中、年级、年龄），
 * 从内置目录里筛出真实课程并给出可点的跳转。 */
const seedData = require("miniprogram/utils/seed-data.js");

const SUBJECT_WORDS = [
  { key: '数学', words: ['数学', '奥数', '算数', '思维'] },
  { key: '语文', words: ['语文', '阅读写作', '作文', '写作'] },
  { key: '英语', words: ['英语', '口语', '拼读'] },
  { key: '物理', words: ['物理'] },
  { key: '化学', words: ['化学'] },
  { key: '美术', words: ['美术', '画画', '绘画'] },
  { key: '编程', words: ['编程', '机器人'] },
  { key: '篮球', words: ['篮球', '运动'] }
];

const STAGES = [
  { key: '小学', grades: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'], ages: [6, 12] },
  { key: '初中', grades: ['初一', '初二', '初三', '七年级', '八年级', '九年级'], ages: [13, 15] },
  { key: '高中', grades: ['高一', '高二', '高三'], ages: [16, 18] }
];

const NUMBER_WORDS = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 };

function ageOfYear(text) {
  const s = String(text || '');
  /* 「十一岁」「11岁」「十一周岁」 */
  const cn = s.match(/[一二两三四五六七八九十]{1,2}\s*周?\s*岁/);
  if (cn) {
    const word = cn[0].replace(/周?\s*岁/, '');
    if (NUMBER_WORDS[word]) return NUMBER_WORDS[word];
  }
  const num = s.match(/(\d{1,2})\s*周?\s*岁/);
  if (num) return Number(num[1]);
  return null;
}

function gradeOf(text) {
  const s = String(text || '');
  for (const stage of STAGES) {
    for (const g of stage.grades) {
      if (s.includes(g)) return { stage: stage.key, grade: g };
    }
  }
  return null;
}

function stageByAge(age) {
  if (age === null) return null;
  for (const stage of STAGES) {
    if (age >= stage.ages[0] && age <= stage.ages[1]) return stage.key;
  }
  return age < 6 ? '学前' : '高中';
}

function subjectOf(text) {
  const s = String(text || '');
  for (const subject of SUBJECT_WORDS) {
    for (const w of subject.words) if (s.includes(w)) return subject.key;
  }
  return null;
}

function courseRecommend(input) {
  const raw = String(input || '');
  const subject = subjectOf(raw);
  if (!subject) return null;
  /* 没有找课意向的（如「怎么评价课程」）不进推荐 */
  const want = ['找', '报', '推荐', '想要', '想给', '适合', '选', '学习', '学学', '上什么'];
  if (!want.some(w => raw.includes(w))) return null;

  const age = ageOfYear(raw);
  const grade = gradeOf(raw);
  const stage = grade ? grade.stage : stageByAge(age);
  const isParentAsk = raw.includes('孩子') || raw.includes('儿子') || raw.includes('女儿') || !!stage;

  const pool = (seedData.SEED_SERVICES || []).filter(item =>
    item.type === 'course' &&
    (item.audience || []).includes('家长') &&
    (String(item.title) + item.category + item.description).includes(subject)
  );
  if (!pool.length) {
    return {
      q: subject + '课程推荐',
      a: '学科' + subject + '课程正在上架中，您可以先到首页「课程」Tab 看看其他课，或者用搜索找找。',
      matched: true,
      related: [],
      courses: [],
      go: { key: 'course', label: '精品课程', path: '/pages/index/index', tab: true, page: 'course' }
    };
  }

  /* 有学段信息时优先匹配标题/描述里的学段词，再按余位与推荐标签排序 */
  const scored = pool
    .map(item => {
      let s = 0;
      const text = String(item.title) + item.description;
      if (stage && text.includes(stage)) s += 40;
      if (stage === '小学' && text.includes('小升初')) s += 15;
      if (String(item.tag || '').includes('推荐') || String(item.tag || '').includes('热选')) s += 8;
      s += Math.min(10, Number(item.remaining || 0) / 3);
      return { item, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const courses = scored.map(({ item }) => ({
    id: item.id,
    title: item.title,
    merchant: item.merchant,
    price: item.price,
    unit: item.unit,
    icon: item.icon || '📖',
    tag: item.tag || ''
  }));
  /* 正文只列名称，价格与跳转放到下方可点课程卡上 */
  const lines = courses.map((c, i) => (i + 1) + '. ' + c.title + '（' + c.merchant + '）');

  const who = isParentAsk && (age !== null || grade)
    ? (age !== null
        ? age + ' 岁的孩子（约' + (age <= 6 ? '学龄前' : age <= 12 ? ['一', '二', '三', '四', '五', '六'][Math.min(5, age - 6)] + '年级' : '初中') + '）'
        : (grade ? grade.stage + ' ' + grade.grade + '的孩子' : '孩子'))
    : '孩子';
  const head = stage
    ? '为' + who + '推荐这几门' + (stage === '小学' ? '小学' : stage) + subject + '课程：'
    : '推荐这几门' + subject + '课程：';

  return {
    q: subject + '课程推荐',
    a: head + '\n' + lines.join('\n') + '\n点课程卡可以直接看详情报名：',
    matched: true,
    related: [],
    courses,
    go: { key: 'course', label: '精品课程', path: '/pages/index/index', tab: true, page: 'course' }
  };
}

function answer(input) {
  /* 找课意图优先：学科 + 学段/年龄命中时直接给课程推荐 */
  const rec = courseRecommend(input);
  if (rec) return rec;

  const ranked = FAQ
    .map(([q, a]) => ({ q, a, s: score(q, input) }))
    .sort((x, y) => y.s - x.s);
  const top = ranked[0];
  if (top && top.s >= 20) {
    return {
      q: top.q,
      a: top.a,
      matched: true,
      related: [],
      go: routeOf(String(input || '') + ' ' + top.q)
    };
  }
  const related = ranked.filter(x => x.s > 0).slice(0, 3);
  return {
    q: '',
    a: '这个问题我还没学会。你可以换个说法，或者点下面的常见问题看看。',
    matched: false,
    related,
    go: routeOf(input)
  };
}

/* 首屏推荐问题：覆盖最主要的几条动线 */
const QUICK = [
  '我想给孩子找一个数学课程',
  '怎么预约课程？',
  '订单怎么取消？',
  '升学规划怎么用？',
  '怎么入驻成为机构？',
  '核销码在哪里看？'
];

module.exports = { FAQ, ROUTES, QUICK, answer, routeOf, coreOf, bigrams };

};
__mods["miniprogram/utils/config.js"] = function (module, exports, require) {
/* 学鹭伴学 · 运行配置
 *
 * USE_CLOUD —— 后端模式开关：
 *   false（默认）：本地模拟模式。不依赖任何服务器，数据存在手机本地，
 *                  注册/下单/支付/入驻/志愿表等全部流程可完整走通。
 *   true         ：微信云开发模式。调用 cloudfunctions/ 下的云函数，
 *                  数据存云数据库。切换前请先完成两件事：
 *                  1. 在 miniprogram 同级目录的 cloudfunctions 里部署全部云函数
 *                     （开发者工具 → cloudfunctions → 右键每个函数 → 上传并部署）
 *                  2. 把下面的 CLOUD_ENV 改成你的云开发环境 ID
 *                  （微信公众平台 → 云开发 → 环境设置 → 环境 ID，形如 xuelu-3g1a2b4c）
 *
 * ADMIN_TOKEN —— 仅本地模拟模式使用的平台审批令牌（“我的 → 平台管理”里填写）。
 *   云开发模式下审批令牌配置在云函数 applications 的环境变量 ADMIN_TOKEN 中。
 */

const USE_CLOUD = true;
const CLOUD_ENV = 'web';
const ADMIN_TOKEN = 'xuelu-admin';

module.exports = {
  USE_CLOUD,
  CLOUD_ENV,
  ADMIN_TOKEN,
  APP_NAME: '学鹭伴学',
  STORAGE_PREFIX: 'xuelu.cloud.'
};

};
__mods["miniprogram/utils/exam-data.js"] = function (module, exports, require) {
/* 考公 / 考研 / 考编 模拟数据（种子层）
   全部为演示用的模拟数据：单位、岗位、学科、分数线、竞争比均由模型按种子确定，
   与现实招录公告无关，不可用于真实报考。

   三类考试共用同一套条目结构（见 item 注释），只有标签不同：
     考公 gwy：公务员考试（国考 / 省考），满分 200（行测 + 申论），线为「进面线」
     考研 ky ：硕士研究生招生，满分 500，线为「复试线」
     考编 sb ：事业单位公开招聘，满分 100，线为「笔试合格线」*/

const {PROVINCES, universityList} = require("miniprogram/utils/gaokao-data.js");

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const KINDS = ['gwy', 'ky', 'sb'];
const EDUCATIONS = ['大专', '本科', '硕士', '博士'];
const POLITICALS = ['不限', '中共党员'];
const EXPERIENCES = ['无限制', '2 年基层工作经历'];

const KIND_META = {
  gwy: {key: 'gwy', label: '考公', sub: '公务员考试（国考 / 省考）', fullScore: 200,
    lineLabel: '进面线', unitLabel: '招录单位', quotaLabel: '招录人数', applicantLabel: '报名人数',
    itemLabel: '岗位', scoreLabel: '笔试总分（行测 + 申论）'},
  ky: {key: 'ky', label: '考研', sub: '硕士研究生招生', fullScore: 500,
    lineLabel: '复试线', unitLabel: '招生院校', quotaLabel: '拟招人数', applicantLabel: '报考人数',
    itemLabel: '专业', scoreLabel: '初试总分'},
  sb: {key: 'sb', label: '考编', sub: '事业单位公开招聘', fullScore: 100,
    lineLabel: '笔试合格线', unitLabel: '招聘单位', quotaLabel: '招聘人数', applicantLabel: '报名人数',
    itemLabel: '岗位', scoreLabel: '笔试成绩'}
};

const CAPITALS = {
  北京: '北京', 天津: '天津', 河北: '石家庄', 山西: '太原', 内蒙古: '呼和浩特', 辽宁: '沈阳',
  吉林: '长春', 黑龙江: '哈尔滨', 上海: '上海', 江苏: '南京', 浙江: '杭州', 安徽: '合肥',
  福建: '福州', 江西: '南昌', 山东: '济南', 河南: '郑州', 湖北: '武汉', 湖南: '长沙',
  广东: '广州', 广西: '南宁', 海南: '海口', 重庆: '重庆', 四川: '成都', 贵州: '贵阳',
  云南: '昆明', 西藏: '拉萨', 陕西: '西安', 甘肃: '兰州', 青海: '西宁', 宁夏: '银川', 新疆: '乌鲁木齐'
};

/* 考公：部门模板。org 里的 {city}/{province} 会在生成时替换 */
const GWY_DEPTS = [
  {name: '税务', short: 'sw', exam: '国考', org: '国家税务总局{city}市税务局', titles: ['一级行政执法员', '一级行政执法员（二）', '科员'],
   major: '财政学类、经济学类、工商管理类', edu: '本科', political: '不限'},
  {name: '海关', short: 'hg', exam: '国考', org: '{city}海关', titles: ['监管一级行政执法员', '查验科员'],
   major: '海关管理、法学类、计算机类', edu: '本科', political: '不限'},
  {name: '统计', short: 'tj', exam: '国考', org: '国家统计局{city}调查队', titles: ['一级科员', '统计调查员'],
   major: '统计学类、数学类、经济学类', edu: '本科', political: '不限'},
  {name: '气象', short: 'qx', exam: '国考', org: '{province}省{city}市气象局', titles: ['业务科员', '预报员'],
   major: '大气科学类、应用气象学', edu: '本科', political: '不限'},
  {name: '金融监管', short: 'jr', exam: '国考', org: '国家金融监督管理总局{city}监管分局', titles: ['一级科员', '监管员'],
   major: '金融学类、经济学类、会计学', edu: '本科', political: '不限'},
  {name: '铁路公安', short: 'tl', exam: '国考', org: '{city}铁路公安处', titles: ['派出所民警', '线路民警'],
   major: '法学类、公安学类', edu: '本科', political: '中共党员'},
  {name: '财政', short: 'cz', exam: '省考', org: '{province}省{city}市财政局', titles: ['一级科员', '预算科员'],
   major: '财政学类、会计学、财务管理', edu: '本科', political: '不限'},
  {name: '审计', short: 'sj', exam: '省考', org: '{province}省{city}市审计局', titles: ['审计员', '一级科员'],
   major: '审计学、会计学、财务管理', edu: '本科', political: '不限'},
  {name: '法院', short: 'fy', exam: '省考', org: '{city}市中级人民法院', titles: ['法官助理', '书记员'],
   major: '法学类', edu: '本科', political: '不限'},
  {name: '检察院', short: 'jc', exam: '省考', org: '{city}市人民检察院', titles: ['检察官助理', '书记员'],
   major: '法学类', edu: '本科', political: '中共党员'},
  {name: '市场监管', short: 'sc', exam: '省考', org: '{province}省{city}市市场监督管理局', titles: ['一级行政执法员', '综合管理岗'],
   major: '工商管理类、法学类、食品科学与工程类', edu: '本科', political: '不限'},
  {name: '公安', short: 'ga', exam: '省考', org: '{city}市公安局', titles: ['派出所民警', '网安民警'],
   major: '公安学类、法学类、计算机类', edu: '本科', political: '不限'},
  {name: '综合管理', short: 'zh', exam: '省考', org: '{province}省{city}市人民政府办公室', titles: ['综合管理岗', '一级科员'],
   major: '不限', edu: '本科', political: '不限'},
  {name: '乡镇机关', short: 'xz', exam: '省考', org: '{province}省{city}市{county}镇人民政府', titles: ['一级科员', '综合管理岗'],
   major: '不限', edu: '大专', political: '不限'}
];

/* 考编：事业单位模板 */
const SB_UNITS = [
  {name: '教育', org: '{city}市第一中学', title: '高中教师（语文）', cert: '高中教师资格证', edu: '本科', major: '中国语言文学类'},
  {name: '教育', org: '{city}市实验中学', title: '高中教师（数学）', cert: '高中教师资格证', edu: '本科', major: '数学类'},
  {name: '教育', org: '{city}市实验小学', title: '小学教师（英语）', cert: '小学教师资格证', edu: '本科', major: '外国语言文学类'},
  {name: '教育', org: '{city}市第三中学', title: '初中教师（物理）', cert: '初中教师资格证', edu: '本科', major: '物理学类'},
  {name: '医疗', org: '{city}市人民医院', title: '临床医师', cert: '执业医师资格证', edu: '硕士', major: '临床医学'},
  {name: '医疗', org: '{city}市人民医院', title: '护理岗', cert: '护士执业资格', edu: '大专', major: '护理学'},
  {name: '医疗', org: '{city}市中医院', title: '中医师', cert: '执业医师资格证', edu: '本科', major: '中医学'},
  {name: '综合', org: '{city}市政务服务中心', title: '综合管理岗', cert: '', edu: '本科', major: '不限'},
  {name: '科研', org: '{province}省{city}市农业科学研究院', title: '科研助理', cert: '', edu: '硕士', major: '农学类'},
  {name: '文化', org: '{city}市图书馆', title: '图书资料岗', cert: '', edu: '本科', major: '图书情报与档案管理类'},
  {name: '农林', org: '{city}市农业技术推广中心', title: '农技推广员', cert: '', edu: '本科', major: '植物生产类'},
  {name: '综合', org: '{city}市社会治理中心', title: '网格管理岗', cert: '', edu: '大专', major: '不限'}
];

/* 考研：一级学科（category 为门类，heat 决定分数线相对国家线的高低） */
const KY_DISCIPLINES = [
  {name: '计算机科学与技术', category: '工学', heat: 0.98, type: '理工'},
  {name: '软件工程', category: '工学', heat: 0.94, type: '理工'},
  {name: '信息与通信工程', category: '工学', heat: 0.92, type: '理工'},
  {name: '电子科学与技术', category: '工学', heat: 0.90, type: '理工'},
  {name: '控制科学与工程', category: '工学', heat: 0.88, type: '理工'},
  {name: '电气工程', category: '工学', heat: 0.90, type: '理工'},
  {name: '机械工程', category: '工学', heat: 0.82, type: '理工'},
  {name: '材料科学与工程', category: '工学', heat: 0.74, type: '理工'},
  {name: '土木工程', category: '工学', heat: 0.70, type: '理工'},
  {name: '化学工程与技术', category: '工学', heat: 0.70, type: '理工'},
  {name: '数学', category: '理学', heat: 0.84, type: '理工'},
  {name: '物理学', category: '理学', heat: 0.80, type: '理工'},
  {name: '化学', category: '理学', heat: 0.72, type: '理工'},
  {name: '生物学', category: '理学', heat: 0.72, type: '综合'},
  {name: '应用经济学', category: '经济学', heat: 0.94, type: '财经'},
  {name: '工商管理', category: '管理学', heat: 0.86, type: '财经'},
  {name: '公共管理', category: '管理学', heat: 0.78, type: '综合'},
  {name: '法学', category: '法学', heat: 0.90, type: '政法'},
  {name: '马克思主义理论', category: '法学', heat: 0.74, type: '政法'},
  {name: '新闻传播学', category: '文学', heat: 0.88, type: '综合'},
  {name: '中国语言文学', category: '文学', heat: 0.84, type: '师范'},
  {name: '外国语言文学', category: '文学', heat: 0.82, type: '语言'},
  {name: '教育学', category: '教育学', heat: 0.84, type: '师范'},
  {name: '心理学', category: '教育学', heat: 0.86, type: '师范'},
  {name: '临床医学', category: '医学', heat: 0.96, type: '医药'},
  {name: '药学', category: '医学', heat: 0.78, type: '医药'},
  {name: '农学', category: '农学', heat: 0.66, type: '农林'},
  {name: '艺术学理论', category: '艺术学', heat: 0.68, type: '艺术'}
];

/* 国家线（A 区，总分 500）按门类的基准分，年份漂移在模型里叠加 */
const KY_NATIONAL_BASE = {
  '工学': 275, '理学': 290, '经济学': 345, '管理学': 340, '法学': 320,
  '文学': 355, '教育学': 340, '医学': 300, '农学': 255, '艺术学': 350, '哲学': 295, '历史学': 320
};

/* ---------------- 备考服务推荐：机构 / 课程 / 图书 ----------------
   全部为虚构的演示内容，机构名、课程、图书都不代表真实存在。 */

const EXAM_ORGS = [
  {id: 'org-gwy-1', kind: 'gwy', name: '浙里公考教育', city: '杭州', focus: '国考 / 省考', tags: ['申论批改', '面试陪练'], intro: '专注浙江与国考方向的笔试面试一体化训练，班型以直播小班和面授集训为主。'},
  {id: 'org-gwy-2', kind: 'gwy', name: '上岸公考研究院', city: '北京', focus: '国考 · 部委岗位', tags: ['岗位匹配', '真题解析'], intro: '以国考岗位研究和真题拆解见长，课程偏重行测资料分析与申论结构。'},
  {id: 'org-gwy-3', kind: 'gwy', name: '启明申论工作室', city: '成都', focus: '申论 / 结构化面试', tags: ['人工批改', '1 对 1'], intro: '小规模申论批改工作室，按篇批改并给出逐句修改建议。'},
  {id: 'org-ky-1', kind: 'ky', name: '研途考研辅导', city: '南京', focus: '公共课全程', tags: ['英语', '数学'], intro: '公共课全科辅导，英语长难句与数学强化是主推方向。'},
  {id: 'org-ky-2', kind: 'ky', name: '启航专业课中心', city: '武汉', focus: '408 / 自命题', tags: ['专业课', '学长带学'], intro: '覆盖计算机 408 与多数自命题专业课，提供目标院校的真题与带学。'},
  {id: 'org-ky-3', kind: 'ky', name: '博雅复试工作室', city: '上海', focus: '复试 / 调剂', tags: ['面试', '口语'], intro: '专注复试面试、英语口语与调剂信息整理。'},
  {id: 'org-sb-1', kind: 'sb', name: '师路教师编辅导', city: '郑州', focus: '教师招聘', tags: ['教综', '学科知识'], intro: '面向中小学教师招聘，教综与学科专业知识双线教学。'},
  {id: 'org-sb-2', kind: 'sb', name: '医考通事业编中心', city: '西安', focus: '医疗岗', tags: ['医学基础', '面试'], intro: '医疗类事业单位考试辅导，覆盖医学基础知识与结构化面试。'},
  {id: 'org-sb-3', kind: 'sb', name: '编途面试训练营', city: '长沙', focus: '综合岗面试', tags: ['结构化', '无领导'], intro: '综合岗面试集训，结构化与无领导小组讨论轮训。'}
];

const EXAM_COURSES = [
  {id: 'c-gwy-1', kind: 'gwy', org: '浙里公考教育', name: '行测高频考点精讲', mode: '直播', hours: 48, level: '入门', price: 1280},
  {id: 'c-gwy-2', kind: 'gwy', org: '启明申论工作室', name: '申论大作文批改班', mode: '网课', hours: 24, level: '进阶', price: 880},
  {id: 'c-gwy-3', kind: 'gwy', org: '浙里公考教育', name: '省考结构化面试特训', mode: '面授', hours: 36, level: '冲刺', price: 3680},
  {id: 'c-gwy-4', kind: 'gwy', org: '上岸公考研究院', name: '资料分析速算技巧', mode: '录播', hours: 12, level: '入门', price: 299},
  {id: 'c-gwy-5', kind: 'gwy', org: '上岸公考研究院', name: '公安专业科目专项', mode: '直播', hours: 30, level: '进阶', price: 1680},
  {id: 'c-gwy-6', kind: 'gwy', org: '浙里公考教育', name: '常识判断周练计划', mode: '录播', hours: 16, level: '入门', price: 199},
  {id: 'c-ky-1', kind: 'ky', org: '研途考研辅导', name: '英语一长难句精讲', mode: '直播', hours: 60, level: '入门', price: 1980},
  {id: 'c-ky-2', kind: 'ky', org: '研途考研辅导', name: '数学一强化冲刺', mode: '面授', hours: 72, level: '冲刺', price: 3280},
  {id: 'c-ky-3', kind: 'ky', org: '启航专业课中心', name: '计算机 408 全程班', mode: '网课', hours: 120, level: '全程', price: 4580},
  {id: 'c-ky-4', kind: 'ky', org: '研途考研辅导', name: '政治时政精讲', mode: '直播', hours: 30, level: '进阶', price: 680},
  {id: 'c-ky-5', kind: 'ky', org: '启航专业课中心', name: '专业课一对一辅导', mode: '1 对 1', hours: 20, level: '定制', price: 4800},
  {id: 'c-ky-6', kind: 'ky', org: '博雅复试工作室', name: '复试面试与英语口语', mode: '面授', hours: 16, level: '冲刺', price: 1580},
  {id: 'c-sb-1', kind: 'sb', org: '师路教师编辅导', name: '教育理论综合精讲', mode: '直播', hours: 45, level: '入门', price: 1580},
  {id: 'c-sb-2', kind: 'sb', org: '师路教师编辅导', name: '学科专业知识强化', mode: '网课', hours: 36, level: '进阶', price: 1180},
  {id: 'c-sb-3', kind: 'sb', org: '编途面试训练营', name: '职业能力测验专项', mode: '直播', hours: 40, level: '进阶', price: 1380},
  {id: 'c-sb-4', kind: 'sb', org: '医考通事业编中心', name: '医学基础知识串讲', mode: '网课', hours: 30, level: '入门', price: 980},
  {id: 'c-sb-5', kind: 'sb', org: '编途面试训练营', name: '结构化面试实战', mode: '面授', hours: 24, level: '冲刺', price: 2680},
  {id: 'c-sb-6', kind: 'sb', org: '师路教师编辅导', name: '公共基础知识周练', mode: '录播', hours: 20, level: '入门', price: 299}
];

const EXAM_BOOKS = [
  {id: 'b-gwy-1', kind: 'gwy', title: '行测 5000 题（分模块版）', author: '上岸公考研究院', press: '学鹭教育出版社', price: 79, tags: ['题库', '分模块']},
  {id: 'b-gwy-2', kind: 'gwy', title: '申论范文 100 篇', author: '启明申论工作室', press: '学鹭教育出版社', price: 59, tags: ['申论', '素材']},
  {id: 'b-gwy-3', kind: 'gwy', title: '国考历年真题详解（10 年）', author: '上岸公考研究院', press: '学鹭教育出版社', price: 98, tags: ['真题', '国考']},
  {id: 'b-gwy-4', kind: 'gwy', title: '省考面试一本通', author: '浙里公考教育', press: '学鹭教育出版社', price: 68, tags: ['面试', '结构化']},
  {id: 'b-gwy-5', kind: 'gwy', title: '常识判断速记手册', author: '浙里公考教育', press: '学鹭教育出版社', price: 39, tags: ['常识', '口袋书']},
  {id: 'b-gwy-6', kind: 'gwy', title: '资料分析公式速查卡', author: '上岸公考研究院', press: '学鹭教育出版社', price: 25, tags: ['速算', '工具']},
  {id: 'b-gwy-7', kind: 'gwy', title: '公安专业科目教材', author: '浙里公考教育', press: '学鹭教育出版社', price: 88, tags: ['公安', '专业科目']},
  {id: 'b-gwy-8', kind: 'gwy', title: '申论热点素材库（年度版）', author: '启明申论工作室', press: '学鹭教育出版社', price: 65, tags: ['素材', '热点']},
  {id: 'b-ky-1', kind: 'ky', title: '考研英语真题超精读', author: '研途考研辅导', press: '学鹭教育出版社', price: 89, tags: ['英语', '真题']},
  {id: 'b-ky-2', kind: 'ky', title: '数学一复习全书', author: '研途考研辅导', press: '学鹭教育出版社', price: 108, tags: ['数学', '全书']},
  {id: 'b-ky-3', kind: 'ky', title: '政治核心考案', author: '研途考研辅导', press: '学鹭教育出版社', price: 69, tags: ['政治', '基础']},
  {id: 'b-ky-4', kind: 'ky', title: '计算机 408 真题解析', author: '启航专业课中心', press: '学鹭教育出版社', price: 95, tags: ['408', '真题']},
  {id: 'b-ky-5', kind: 'ky', title: '专业课背诵手册', author: '启航专业课中心', press: '学鹭教育出版社', price: 55, tags: ['背诵', '精简']},
  {id: 'b-ky-6', kind: 'ky', title: '考研择校指南（学科版）', author: '研途考研辅导', press: '学鹭教育出版社', price: 49, tags: ['择校', '数据']},
  {id: 'b-ky-7', kind: 'ky', title: '复试英语口语模板', author: '博雅复试工作室', press: '学鹭教育出版社', price: 45, tags: ['复试', '口语']},
  {id: 'b-ky-8', kind: 'ky', title: '考研时间管理手账', author: '研途考研辅导', press: '学鹭教育出版社', price: 35, tags: ['规划', '工具']},
  {id: 'b-sb-1', kind: 'sb', title: '教育理论基础教材', author: '师路教师编辅导', press: '学鹭教育出版社', price: 76, tags: ['教综', '教材']},
  {id: 'b-sb-2', kind: 'sb', title: '教师招聘真题汇编', author: '师路教师编辅导', press: '学鹭教育出版社', price: 88, tags: ['真题', '教师']},
  {id: 'b-sb-3', kind: 'sb', title: '职业能力测验题库', author: '编途面试训练营', press: '学鹭教育出版社', price: 72, tags: ['职测', '题库']},
  {id: 'b-sb-4', kind: 'sb', title: '公共基础知识高频考点', author: '师路教师编辅导', press: '学鹭教育出版社', price: 58, tags: ['公基', '考点']},
  {id: 'b-sb-5', kind: 'sb', title: '医学基础知识讲义', author: '医考通事业编中心', press: '学鹭教育出版社', price: 92, tags: ['医学', '讲义']},
  {id: 'b-sb-6', kind: 'sb', title: '结构化面试题库', author: '编途面试训练营', press: '学鹭教育出版社', price: 62, tags: ['面试', '题库']},
  {id: 'b-sb-7', kind: 'sb', title: '事业单位报考指南', author: '编途面试训练营', press: '学鹭教育出版社', price: 42, tags: ['报考', '指南']},
  {id: 'b-sb-8', kind: 'sb', title: '面试礼仪与表达', author: '编途面试训练营', press: '学鹭教育出版社', price: 38, tags: ['礼仪', '表达']}
];

const pick = (list, start, count) => Array.from({length: count}, (_, k) => list[(start + k) % list.length]);
const pad = n => String(n).padStart(2, '0');

/* ---------------- 条目结构 ----------------
   {id, kind, org, title, region, city, category, examType,
    quota, requirements:{education, major, political, experience, certificate, freshOnly}}
   分数线 / 报名人数 / 竞争比 由 model.mjs 按 id 确定性生成 */

function buildGwy() {
  const out = [];
  PROVINCES.forEach((pr, index) => {
    const city = CAPITALS[pr.name] || pr.name;
    const county = ['城关', '河东', '临江', '白沙'][index % 4];
    const guo = GWY_DEPTS.filter(d => d.exam === '国考');
    const sheng = GWY_DEPTS.filter(d => d.exam === '省考');
    const fill = text => text.replace('{city}', city).replace('{province}', pr.name).replace('{county}', county);
    pick(guo, index, 2).forEach((dept, k) => {
      out.push({
        id: `gwy-${pad(index)}-g${k}`, kind: 'gwy',
        org: fill(dept.org), title: dept.titles[k % dept.titles.length],
        region: pr.name, city, category: dept.name, examType: '国考',
        quota: 1 + ((index + k * 3) % 6),
        requirements: {education: dept.edu, major: dept.major, political: dept.political,
          experience: (index % 5 === 0 && k === 1) ? '2 年基层工作经历' : '无限制',
          certificate: '', freshOnly: index % 7 === 0}
      });
    });
    pick(sheng, index * 2 + 1, 2).forEach((dept, k) => {
      out.push({
        id: `gwy-${pad(index)}-s${k}`, kind: 'gwy',
        org: fill(dept.org), title: dept.titles[k % dept.titles.length],
        region: pr.name, city, category: dept.name, examType: '省考',
        quota: 1 + ((index + k * 2) % 5),
        requirements: {education: dept.edu, major: dept.major, political: dept.political,
          experience: (index % 6 === 2 && k === 0) ? '2 年基层工作经历' : '无限制',
          certificate: '', freshOnly: index % 9 === 3}
      });
    });
  });
  return out;
}

function buildSb() {
  const out = [];
  PROVINCES.forEach((pr, index) => {
    const city = CAPITALS[pr.name] || pr.name;
    pick(SB_UNITS, index * 3, 3).forEach((unit, k) => {
      out.push({
        id: `sb-${pad(index)}-${k}`, kind: 'sb',
        org: unit.org.replace('{city}', city).replace('{province}', pr.name),
        title: unit.title, region: pr.name, city, category: unit.name, examType: unit.name,
        quota: 1 + ((index + k) % 4),
        requirements: {education: unit.edu, major: unit.major, political: '不限',
          experience: '无限制', certificate: unit.cert, freshOnly: false}
      });
    });
  });
  return out;
}

function buildKy() {
  const out = [];
  const disciplines = KY_DISCIPLINES;
  universityList().forEach((uni, index) => {
    // 专科没有硕士点，直接跳过
    if (uni.tier === '专科') return;
    const affinity = disciplines.filter(d => d.type === uni.type || uni.type === '综合');
    const pool = affinity.length ? affinity : disciplines;
    const count = uni.tier === '985' ? 3 : uni.tier === '211' ? 2 : 1;
    pick(pool, index, count).forEach((d, k) => {
      const degree = (index + k) % 3 === 0 ? '专硕' : '学硕';
      out.push({
        id: `ky-${uni.id}-${k}`, kind: 'ky',
        org: uni.name, title: `${d.name}（${degree}）`,
        region: uni.province, city: uni.city, category: d.category, examType: degree,
        quota: 8 + ((index * 3 + k * 7) % 40),
        requirements: {education: '本科', major: d.name, political: '不限',
          experience: '无限制', certificate: '', freshOnly: false},
        _uni: {tier: uni.tier, alumniRank: uni.alumniRank, discipline: d.name, category: d.category, heat: d.heat}
      });
    });
  });
  return out;
}

const ITEMS = {gwy: buildGwy(), ky: buildKy(), sb: buildSb()};

function itemsOf(kind) { return ITEMS[kind] || []; }
const REGIONS = PROVINCES.map(p => p.name);
function meta() {
  const counts = {};
  for (const kind of KINDS) counts[kind] = ITEMS[kind].length;
  return {
    kinds: KINDS.map(k => KIND_META[k]),
    years: YEARS,
    regions: REGIONS,
    educations: EDUCATIONS,
    politicals: POLITICALS,
    experiences: EXPERIENCES,
    categories: {
      gwy: [...new Set(ITEMS.gwy.map(i => i.category))],
      ky: [...new Set(ITEMS.ky.map(i => i.category))],
      sb: [...new Set(ITEMS.sb.map(i => i.category))]
    },
    examTypes: {
      gwy: ['国考', '省考'],
      ky: ['学硕', '专硕'],
      sb: [...new Set(ITEMS.sb.map(i => i.examType))]
    },
    counts,
    disclaimer: ''
  };
}

module.exports = {
  YEARS,
  KINDS,
  EDUCATIONS,
  POLITICALS,
  EXPERIENCES,
  KIND_META,
  KY_NATIONAL_BASE,
  EXAM_ORGS,
  EXAM_COURSES,
  EXAM_BOOKS,
  ITEMS,
  REGIONS,
  itemsOf,
  meta
};

};
__mods["miniprogram/utils/exam-model.js"] = function (module, exports, require) {
/* 考公 / 考研 / 考编 模拟模型（计算层）
   分数线、报名人数、竞争比全部由「条目 id + 年份」的哈希种子确定，
   同一请求永远同一结果，重启不变；三类考试共用一套条目结构。*/

const {ITEMS, KIND_META, KY_NATIONAL_BASE, YEARS, itemsOf, meta,
  EXAM_ORGS, EXAM_COURSES, EXAM_BOOKS} = require("miniprogram/utils/exam-data.js");



const RESOURCE_DISCLAIMER = '';

const DISCLAIMER = '';

/* ---------------- 确定性随机 ---------------- */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rand01(seed) {
  let t = (hash32(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function jitter(seed, amp) { return (rand01(seed) * 2 - 1) * amp; }
const round1 = n => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const EDU_ORDER = {'大专': 1, '本科': 2, '硕士': 3, '博士': 4};

/* 部门 / 单位类别的相对热度（只影响模拟分数与竞争比） */
const GWY_HEAT = {'税务': 0.86, '海关': 0.9, '统计': 0.62, '气象': 0.42, '金融监管': 0.88,
  '铁路公安': 0.7, '财政': 0.72, '审计': 0.64, '法院': 0.78, '检察院': 0.74,
  '市场监管': 0.58, '公安': 0.8, '综合管理': 0.6, '乡镇机关': 0.34};
const SB_HEAT = {'教育': 0.82, '医疗': 0.78, '综合': 0.54, '科研': 0.58, '文化': 0.46, '农林': 0.42};

const YEAR_DRIFT = {2016: -0.022, 2017: 0.006, 2018: -0.008, 2019: 0.014, 2020: 0.004,
  2021: -0.004, 2022: 0.011, 2023: -0.003, 2024: 0.007, 2025: 0};

/* 冲稳保的绝对分差（按各考试满分设定，比按比例更贴近实际） */
const BANDS = {
  gwy: {chong: 16, wen: 12, bao: 45},
  ky: {chong: 40, wen: 30, bao: 90},
  sb: {chong: 8, wen: 6, bao: 25}
};

const byId = new Map();
for (const kind of Object.keys(ITEMS)) for (const item of ITEMS[kind]) byId.set(item.id, item);

function findItem(kind, id) {
  const item = byId.get(String(id));
  return item && item.kind === kind ? item : null;
}
function listOf(kind) { return itemsOf(kind); }
function kindMeta(kind) { return KIND_META[kind] || null; }
const isKind = kind => Object.prototype.hasOwnProperty.call(KIND_META, kind);

/* ---------------- 难度与分数线 ---------------- */
function difficulty(item) {
  if (item.kind === 'gwy') {
    const heat = GWY_HEAT[item.category] ?? 0.5;
    const exam = item.examType === '国考' ? 0.22 : 0.08;
    return clamp(heat * 0.62 + exam + rand01(item.id + '|d') * 0.14, 0, 1);
  }
  if (item.kind === 'ky') {
    const uni = item._uni || {};
    const tierHeat = {'985': 0.85, '211': 0.62, '本科': 0.38}[uni.tier] ?? 0.3;
    return clamp(tierHeat * 0.7 + (uni.heat ?? 0.5) * 0.3, 0, 1);
  }
  return clamp((SB_HEAT[item.category] ?? 0.5) * 0.68 + rand01(item.id + '|d') * 0.32, 0, 1);
}

/* 考研国家线（A 区，总分 500） */
function nationalLine(category, year) {
  const base = KY_NATIONAL_BASE[category] ?? 300;
  const drift = YEAR_DRIFT[year] ?? 0;
  return round1(clamp(base * (1 + drift) + jitter(`nat|${category}|${year}`, 3), 200, 400));
}

function lineOf(item, year) {
  const drift = YEAR_DRIFT[year] ?? 0;
  const d = difficulty(item);
  const noise = jitter(`${item.id}|${year}|line`, 1.5);
  if (item.kind === 'gwy') return round1(clamp((96 + d * 52) * (1 + drift) + noise, 88, 155));
  if (item.kind === 'sb') return round1(clamp((52 + d * 30) * (1 + drift) + noise, 40, 95));
  // 考研院校线：按院校层次给基准，再用国家线兜底（顶尖院校的实际复试线远高于国家线）
  const uni = item._uni || {};
  const nat = nationalLine(uni.category || '工学', year);
  const tierBase = {'985': 348, '211': 308, '本科': 285}[uni.tier] ?? 285;
  const raw = tierBase + (uni.heat ?? 0.5) * 42 + noise;
  return round1(clamp(Math.max(raw, nat + 5), 200, 490));
}

function ratioOf(item, year) {
  const d = difficulty(item);
  const noise = 1 + jitter(`${item.id}|${year}|ratio`, 0.28);
  const base = item.kind === 'gwy' ? 12 + d * 230 : item.kind === 'sb' ? 5 + d * 68 : 1.5 + d * 17;
  return Math.round(clamp(base * noise, 1, 400) * 10) / 10;
}

function applicantsOf(item, year) {
  const ratio = ratioOf(item, year);
  return Math.max(item.quota, Math.round(item.quota * ratio));
}

function seriesOf(item) {
  return YEARS.map(year => {
    const ratio = ratioOf(item, year);
    return {
      year,
      line: lineOf(item, year),
      ratio,
      applicants: Math.max(item.quota, Math.round(item.quota * ratio)),
      quota: item.quota
    };
  });
}

/* 竞争热度分档文案 */
function heatLabel(kind, ratio) {
  const level = kind === 'ky' ? [2, 6, 12] : kind === 'sb' ? [10, 30, 60] : [30, 90, 200];
  if (ratio <= level[0]) return '较低';
  if (ratio <= level[1]) return '中等';
  if (ratio <= level[2]) return '较高';
  return '非常激烈';
}

/* ---------------- 对外数据 ---------------- */
function summary(item, year = 2025) {
  const ratio = ratioOf(item, year);
  const line = lineOf(item, year);
  return {
    id: item.id, kind: item.kind, org: item.org, title: item.title,
    region: item.region, city: item.city, category: item.category, examType: item.examType,
    quota: item.quota, applicants: applicantsOf(item, year), ratio, heat: heatLabel(item.kind, ratio),
    line, year,
    requirements: item.requirements
  };
}

function detail(item, year = 2025) {
  const meta = KIND_META[item.kind];
  const base = summary(item, year);
  return {
    ...base,
    ...item,
    lineLabel: meta.lineLabel,
    unitLabel: meta.unitLabel,
    quotaLabel: meta.quotaLabel,
    applicantLabel: meta.applicantLabel,
    fullScore: meta.fullScore,
    series: seriesOf(item),
    nationalLine: item.kind === 'ky' ? nationalLine(item._uni?.category || '工学', year) : null,
    nationalSeries: item.kind === 'ky'
      ? YEARS.map(y => ({year: y, line: nationalLine(item._uni?.category || '工学', y)}))
      : null,
    disclaimer: DISCLAIMER
  };
}

const SORTS = {
  line: (a, b) => b.line - a.line,
  'line-asc': (a, b) => a.line - b.line,
  ratio: (a, b) => b.ratio - a.ratio,
  'ratio-asc': (a, b) => a.ratio - b.ratio,
  quota: (a, b) => b.quota - a.quota,
  org: (a, b) => a.org.localeCompare(b.org, 'zh-Hans-CN')
};

/* 备考服务推荐：机构 / 课程 / 图书。
   seed 不同 → 排序不同，前端「换一批」就是改 seed 重新取。 */
function resources(kind, seed = 0) {
  const info = KIND_META[kind];
  if (!info) { const e = new Error('考试类型不存在'); e.status = 400; throw e; }
  const s = clamp(Number(seed) || 0, 0, 9999);
  const rank = (list, n) => list
    .map(item => ({item, key: rand01(`${item.id}|${s}`)}))
    .sort((a, b) => a.key - b.key)
    .slice(0, n)
    .map(x => x.item);

  const orgs = rank(EXAM_ORGS.filter(o => o.kind === kind), 3).map(o => ({
    ...o,
    rating: Math.round((4.2 + rand01(o.id + '|r') * 0.7) * 10) / 10,
    students: 400 + Math.round(rand01(o.id + '|s') * 8600),
    courses: EXAM_COURSES.filter(c => c.org === o.name).length
  }));
  // 展示数小于池子，「换一批」才会真的换内容而不只是换顺序
  const courses = rank(EXAM_COURSES.filter(c => c.kind === kind), 4).map(c => ({
    ...c,
    rating: Math.round((4.1 + rand01(c.id + '|r') * 0.8) * 10) / 10,
    enrolled: 60 + Math.round(rand01(c.id + '|e') * 1900)
  }));
  const books = rank(EXAM_BOOKS.filter(b => b.kind === kind), 6).map(b => ({
    ...b,
    rating: Math.round((4.3 + rand01(b.id + '|r') * 0.6) * 10) / 10,
    sold: 200 + Math.round(rand01(b.id + '|s') * 9800)
  }));
  return {kind, seed: s, label: info.label, orgs, courses, books, disclaimer: RESOURCE_DISCLAIMER};
}

function listItems({kind, region, category, examType, education, q, sort = 'line', page = 1, size = 12, year = 2025} = {}) {
  const keyword = String(q || '').trim().toLowerCase();
  const rows = itemsOf(kind).filter(item =>
    (!region || item.region === region) &&
    (!category || item.category === category) &&
    (!examType || item.examType === examType) &&
    (!education || item.requirements.education === education) &&
    (!keyword || (item.org + item.title + item.city + item.category).toLowerCase().includes(keyword))
  ).map(item => summary(item, year));

  rows.sort(SORTS[sort] || SORTS.line);
  const total = rows.length;
  const pages = Math.ceil(total / size) || 1;
  const p = Math.max(1, Math.min(Number(page) || 1, pages));
  return {total, page: p, size, pages, items: rows.slice((p - 1) * size, p * size), kind, year};
}

/* 匹配（冲稳保）：按「我的分数 − 往年线」分档，档位按满分成比例 */
function match({kind, score, region, education, major, category, political, limit = 10, year = 2025} = {}) {
  const meta = KIND_META[kind];
  if (!meta) { const e = new Error('考试类型不存在'); e.status = 400; throw e; }
  const full = meta.fullScore;
  const s = Number(score);
  if (!Number.isFinite(s) || s <= 0 || s > full) {
    const e = new Error(`分数须为 0–${full} 之间的数字（${meta.label}${meta.scoreLabel}满分 ${full}）`);
    e.status = 400;
    throw e;
  }
  const majorText = String(major || '').trim();
  const userEdu = EDU_ORDER[education] || 0;
  const needParty = political === '中共党员';

  const buckets = {chong: [], wen: [], bao: []};
  for (const item of itemsOf(kind)) {
    if (region && item.region !== region) continue;
    if (category && item.category !== category) continue;
    // 报考条件过滤：学历、专业、政治面貌
    if (userEdu && EDU_ORDER[item.requirements.education] > userEdu) continue;
    const reqMajor = item.requirements.major;
    if (majorText && reqMajor !== '不限' && !reqMajor.includes(majorText)) continue;
    if (item.requirements.political === '中共党员' && !needParty) continue;

    const line = lineOf(item, year);
    const diff = round1(s - line);
    const ratio = ratioOf(item, year);
    const entry = {
      ...summary(item, year),
      diff,
      probability: Math.round(clamp(1 / (1 + Math.exp(-diff / (full * 0.045))), 0.02, 0.98) * 100)
    };
    // 档位按考试类型给绝对分差：冲 差一点、稳 追平、保 留足余量
    const band = BANDS[kind];
    if (diff < -band.chong) continue;
    if (diff < 0) buckets.chong.push(entry);
    else if (diff <= band.wen) buckets.wen.push(entry);
    else if (diff <= band.bao) buckets.bao.push(entry);
  }
  const sortBy = list => list.sort((a, b) => b.line - a.line).slice(0, limit);
  return {
    input: {kind, label: meta.label, fullScore: full, score: s, year, region: region || null,
      education: education || null, major: majorText || null, category: category || null, limit},
    buckets: {chong: sortBy(buckets.chong), wen: sortBy(buckets.wen), bao: sortBy(buckets.bao)},
    counts: {chong: buckets.chong.length, wen: buckets.wen.length, bao: buckets.bao.length},
    disclaimer: DISCLAIMER
  };
}


module.exports = {
  RESOURCE_DISCLAIMER,
  DISCLAIMER,
  isKind,
  findItem,
  listOf,
  kindMeta,
  nationalLine,
  lineOf,
  ratioOf,
  applicantsOf,
  summary,
  detail,
  resources,
  listItems,
  match,
  meta
};

};
__mods["miniprogram/utils/format.js"] = function (module, exports, require) {
/* 纯展示层格式化：不碰 wx，也不发请求 */

const ROLE_NAME = { parent: '家长', tutor: '大学生', institution: '机构' };
const TYPE_NAME = { course: '课程', tutor: '伴学', bus: '校车' };
const STATUS_NAME = { pending: '待支付', paid: '已支付', completed: '已完成', cancelled: '已取消' };
const STATUS_TONE = { pending: 'warn', paid: 'ok', completed: 'muted', cancelled: 'muted' };
const APPLICATION_STATUS = { pending: '审核中', approved: '已通过', rejected: '未通过' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dash(value, fallback) {
  const text = value == null ? '' : String(value).trim();
  return text || (fallback === undefined ? '—' : fallback);
}

/* 金额：整数不带小数，带角分保留两位 */
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/* 手机号脱敏：139****0002 */
function maskPhone(phone) {
  const text = String(phone == null ? '' : phone);
  if (!/^\d{11}$/.test(text)) return text || '—';
  return text.slice(0, 3) + '****' + text.slice(7);
}

function roleName(role) { return ROLE_NAME[role] || '游客'; }
function typeName(type) { return TYPE_NAME[type] || '服务'; }
function statusText(status) { return STATUS_NAME[status] || status || '—'; }
function statusTone(status) { return STATUS_TONE[status] || 'muted'; }
function applicationStatusText(status) { return APPLICATION_STATUS[status] || status || '—'; }

/* YYYY-MM-DD → 周六（按 UTC 取，避免设备时区偏移一天） */
function weekdayOf(date) {
  const text = String(date == null ? '' : date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const time = Date.parse(text + 'T00:00:00Z');
  if (Number.isNaN(time)) return '';
  return WEEKDAYS[new Date(time).getUTCDay()] || '';
}

/* 时段文本里的星期前缀：「周六 09:00–10:00」→ 周六 */
function slotWeekday(slot) {
  const hit = /^(周[一二三四五六日])\s*/.exec(String(slot == null ? '' : slot));
  return hit ? hit[1] : '';
}

/* 「2026-10-24」→「10-24 周六」 */
function shortDate(date) {
  const text = String(date == null ? '' : date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text.slice(5) + ' ' + weekdayOf(text);
}

/* 时间戳 / ISO 字符串 → 本地日期时间 */
function dateTime(value) {
  if (value == null || value === '') return '—';
  let date;
  if (typeof value === 'number') date = new Date(value);
  else if (typeof value === 'object' && value.$date) date = new Date(value.$date);
  else date = new Date(String(value).replace(' ', 'T') + (String(value).length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(date.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/* 今天（中国时区 YYYY-MM-DD） */
function todayCN() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cn = new Date(utc + 8 * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return cn.getFullYear() + '-' + pad(cn.getMonth() + 1) + '-' + pad(cn.getDate());
}

/* 百分比文本：0.42 → 42% */
function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n * 100) + '%';
}

module.exports = {
  WEEKDAYS,
  ROLE_NAME, TYPE_NAME, STATUS_NAME, APPLICATION_STATUS,
  dash, money, maskPhone, roleName, typeName,
  statusText, statusTone, applicationStatusText,
  weekdayOf, slotWeekday, shortDate, dateTime, todayCN, percent
};

};
__mods["miniprogram/utils/gaokao-data.js"] = function (module, exports, require) {
/* 高考志愿模拟数据（种子层）
   全部为演示用的模拟数据：院校层次、排名、联盟、分数线均由模型按种子确定，
   与现实招生口径无关，不可用于真实升学规划。

   院校元组：[校名, 省份, 城市, 层次, 类型, 校友会排名, 软科排名, 所属联盟, 建校年]
   层次只用四档：985 / 211 / 本科 / 专科（211 一档不含 985，本科一档为非 211 普通本科）*/

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TIERS = ['985', '211', '本科', '专科'];
const TYPES = ['综合', '理工', '师范', '农林', '医药', '财经', '政法', '语言', '艺术', '民族', '体育'];
const SUBJECTS = ['物理', '历史'];
const LEGACY_SUBJECTS = ['理科', '文科'];

/* 省份：总分为该省高考满分（上海 660、海南 900，其余 750），
   factor 是投档线的相对竞争系数（越大同校投档线越高），students 为模拟考生规模 */
const PROVINCES = [
  {name: '北京', total: 750, factor: 0.96, students: 58000},
  {name: '天津', total: 750, factor: 0.97, students: 62000},
  {name: '河北', total: 750, factor: 1.02, students: 620000},
  {name: '山西', total: 750, factor: 0.99, students: 340000},
  {name: '内蒙古', total: 750, factor: 0.96, students: 210000},
  {name: '辽宁', total: 750, factor: 0.98, students: 245000},
  {name: '吉林', total: 750, factor: 0.97, students: 190000},
  {name: '黑龙江', total: 750, factor: 0.97, students: 205000},
  {name: '上海', total: 660, factor: 0.95, students: 54000},
  {name: '江苏', total: 750, factor: 1.01, students: 470000},
  {name: '浙江', total: 750, factor: 1.01, students: 380000},
  {name: '安徽', total: 750, factor: 1.00, students: 520000},
  {name: '福建', total: 750, factor: 1.00, students: 300000},
  {name: '江西', total: 750, factor: 1.00, students: 430000},
  {name: '山东', total: 750, factor: 1.02, students: 790000},
  {name: '河南', total: 750, factor: 1.03, students: 1250000},
  {name: '湖北', total: 750, factor: 1.00, students: 460000},
  {name: '湖南', total: 750, factor: 1.00, students: 500000},
  {name: '广东', total: 750, factor: 1.00, students: 780000},
  {name: '广西', total: 750, factor: 0.97, students: 420000},
  {name: '海南', total: 900, factor: 0.95, students: 65000},
  {name: '重庆', total: 750, factor: 1.00, students: 260000},
  {name: '四川', total: 750, factor: 1.00, students: 680000},
  {name: '贵州', total: 750, factor: 0.96, students: 380000},
  {name: '云南', total: 750, factor: 0.97, students: 390000},
  {name: '西藏', total: 750, factor: 0.92, students: 32000},
  {name: '陕西', total: 750, factor: 1.00, students: 340000},
  {name: '甘肃', total: 750, factor: 0.95, students: 240000},
  {name: '青海', total: 750, factor: 0.93, students: 55000},
  {name: '宁夏', total: 750, factor: 0.94, students: 70000},
  {name: '新疆', total: 750, factor: 0.94, students: 220000}
];

/* 本科专业：heat 决定该专业的录取分相对校线的高低（1.0 最热，0.6 最冷） */
const UNDERGRAD_MAJORS = [
  {name: '计算机科学与技术', category: '工学', heat: 1.00},
  {name: '人工智能', category: '工学', heat: 1.00},
  {name: '软件工程', category: '工学', heat: 0.98},
  {name: '电子信息工程', category: '工学', heat: 0.95},
  {name: '自动化', category: '工学', heat: 0.90},
  {name: '通信工程', category: '工学', heat: 0.92},
  {name: '电气工程及其自动化', category: '工学', heat: 0.93},
  {name: '机械设计制造及其自动化', category: '工学', heat: 0.84},
  {name: '土木工程', category: '工学', heat: 0.70},
  {name: '建筑学', category: '工学', heat: 0.82},
  {name: '材料科学与工程', category: '工学', heat: 0.72},
  {name: '化学工程与工艺', category: '工学', heat: 0.70},
  {name: '车辆工程', category: '工学', heat: 0.84},
  {name: '航空航天工程', category: '工学', heat: 0.94},
  {name: '数学与应用数学', category: '理学', heat: 0.88},
  {name: '物理学', category: '理学', heat: 0.84},
  {name: '化学', category: '理学', heat: 0.74},
  {name: '生物科学', category: '理学', heat: 0.72},
  {name: '统计学', category: '理学', heat: 0.80},
  {name: '临床医学', category: '医学', heat: 1.00},
  {name: '口腔医学', category: '医学', heat: 1.00},
  {name: '药学', category: '医学', heat: 0.78},
  {name: '护理学', category: '医学', heat: 0.62},
  {name: '预防医学', category: '医学', heat: 0.68},
  {name: '经济学', category: '经济学', heat: 0.90},
  {name: '金融学', category: '经济学', heat: 0.96},
  {name: '会计学', category: '管理学', heat: 0.92},
  {name: '工商管理', category: '管理学', heat: 0.82},
  {name: '国际经济与贸易', category: '经济学', heat: 0.80},
  {name: '法学', category: '法学', heat: 0.90},
  {name: '社会学', category: '法学', heat: 0.74},
  {name: '政治学与行政学', category: '法学', heat: 0.72},
  {name: '汉语言文学', category: '文学', heat: 0.86},
  {name: '英语', category: '文学', heat: 0.88},
  {name: '日语', category: '文学', heat: 0.80},
  {name: '新闻学', category: '文学', heat: 0.78},
  {name: '广告学', category: '文学', heat: 0.74},
  {name: '历史学', category: '历史学', heat: 0.76},
  {name: '哲学', category: '哲学', heat: 0.70},
  {name: '教育学', category: '教育学', heat: 0.78},
  {name: '学前教育', category: '教育学', heat: 0.76},
  {name: '心理学', category: '理学', heat: 0.84},
  {name: '体育教育', category: '教育学', heat: 0.66},
  {name: '音乐学', category: '艺术学', heat: 0.68},
  {name: '视觉传达设计', category: '艺术学', heat: 0.72},
  {name: '环境设计', category: '艺术学', heat: 0.70},
  {name: '农学', category: '农学', heat: 0.62},
  {name: '园艺', category: '农学', heat: 0.62},
  {name: '动物医学', category: '农学', heat: 0.70},
  {name: '食品科学与工程', category: '工学', heat: 0.68},
  {name: '环境工程', category: '工学', heat: 0.68},
  {name: '能源与动力工程', category: '工学', heat: 0.82},
  {name: '水利水电工程', category: '工学', heat: 0.72},
  {name: '测绘工程', category: '工学', heat: 0.72},
  {name: '地质工程', category: '工学', heat: 0.64},
  {name: '海洋科学', category: '理学', heat: 0.68},
  {name: '药学（中药方向）', category: '医学', heat: 0.70},
  {name: '公共事业管理', category: '管理学', heat: 0.70},
  {name: '物流管理', category: '管理学', heat: 0.74},
  {name: '电子商务', category: '管理学', heat: 0.78},
  {name: '数据科学与大数据技术', category: '工学', heat: 0.97},
  {name: '网络空间安全', category: '工学', heat: 0.96},
  {name: '微电子科学与工程', category: '工学', heat: 0.95},
  {name: '光电信息科学与工程', category: '工学', heat: 0.88},
  {name: '生物医学工程', category: '工学', heat: 0.84},
  {name: '俄语', category: '文学', heat: 0.72},
  {name: '法语', category: '文学', heat: 0.78},
  {name: '思想政治教育', category: '法学', heat: 0.72},
  {name: '国际政治', category: '法学', heat: 0.76},
  {name: '税收学', category: '经济学', heat: 0.84},
  {name: '审计学', category: '管理学', heat: 0.86}
];

/* 专科专业 */
const VOCATIONAL_MAJORS = [
  {name: '计算机应用技术', category: '电子信息', heat: 0.86},
  {name: '大数据技术', category: '电子信息', heat: 0.88},
  {name: '软件技术', category: '电子信息', heat: 0.84},
  {name: '护理', category: '医药卫生', heat: 0.90},
  {name: '口腔医学技术', category: '医药卫生', heat: 0.86},
  {name: '康复治疗技术', category: '医药卫生', heat: 0.78},
  {name: '学前教育', category: '教育与体育', heat: 0.80},
  {name: '机电一体化技术', category: '装备制造', heat: 0.76},
  {name: '电气自动化技术', category: '装备制造', heat: 0.78},
  {name: '数控技术', category: '装备制造', heat: 0.74},
  {name: '汽车检测与维修技术', category: '装备制造', heat: 0.72},
  {name: '建筑工程技术', category: '土木建筑', heat: 0.70},
  {name: '工程造价', category: '土木建筑', heat: 0.74},
  {name: '电子商务', category: '财经商贸', heat: 0.78},
  {name: '大数据与会计', category: '财经商贸', heat: 0.80},
  {name: '市场营销', category: '财经商贸', heat: 0.68},
  {name: '物流管理', category: '财经商贸', heat: 0.70},
  {name: '旅游管理', category: '旅游', heat: 0.64},
  {name: '酒店管理', category: '旅游', heat: 0.62},
  {name: '艺术设计', category: '文化艺术', heat: 0.66},
  {name: '计算机网络技术', category: '电子信息', heat: 0.80},
  {name: '物联网应用技术', category: '电子信息', heat: 0.78},
  {name: '城市轨道交通运营管理', category: '交通运输', heat: 0.76},
  {name: '民航运输服务', category: '交通运输', heat: 0.72}
];

const UNIVERSITIES = [
  ['清华大学', '北京', '北京', '985', '理工', 1, 1, '九校联盟（C9）', 1911],
  ['北京大学', '北京', '北京', '985', '综合', 2, 2, '九校联盟（C9）', 1898],
  ['浙江大学', '浙江', '杭州', '985', '综合', 3, 3, '九校联盟（C9）· 华东五校', 1897],
  ['复旦大学', '上海', '上海', '985', '综合', 4, 4, '九校联盟（C9）· 华东五校', 1905],
  ['上海交通大学', '上海', '上海', '985', '综合', 5, 5, '九校联盟（C9）· 华东五校', 1896],
  ['南京大学', '江苏', '南京', '985', '综合', 6, 6, '九校联盟（C9）· 华东五校', 1902],
  ['中国科学技术大学', '安徽', '合肥', '985', '理工', 8, 7, '九校联盟（C9）· 华东五校', 1958],
  ['哈尔滨工业大学', '黑龙江', '哈尔滨', '985', '理工', 12, 11, '九校联盟（C9）· 国防七子', 1920],
  ['西安交通大学', '陕西', '西安', '985', '综合', 15, 10, '九校联盟（C9）', 1896],
  ['武汉大学', '湖北', '武汉', '985', '综合', 7, 8, '双一流 A 类', 1893],
  ['华中科技大学', '湖北', '武汉', '985', '综合', 9, 9, '双一流 A 类', 1952],
  ['中山大学', '广东', '广州', '985', '综合', 10, 12, '双一流 A 类', 1924],
  ['四川大学', '四川', '成都', '985', '综合', 11, 14, '双一流 A 类', 1896],
  ['山东大学', '山东', '济南', '985', '综合', 13, 16, '双一流 A 类', 1901],
  ['吉林大学', '吉林', '长春', '985', '综合', 14, 18, '双一流 A 类', 1946],
  ['南开大学', '天津', '天津', '985', '综合', 16, 13, '双一流 A 类', 1919],
  ['天津大学', '天津', '天津', '985', '理工', 17, 15, '卓越大学联盟（E9）', 1895],
  ['北京航空航天大学', '北京', '北京', '985', '理工', 19, 17, '国防七子', 1952],
  ['北京理工大学', '北京', '北京', '985', '理工', 22, 20, '卓越大学联盟（E9）· 国防七子', 1940],
  ['东南大学', '江苏', '南京', '985', '综合', 21, 19, '卓越大学联盟（E9）· 建筑老八校', 1902],
  ['同济大学', '上海', '上海', '985', '理工', 20, 21, '卓越大学联盟（E9）· 建筑老八校', 1907],
  ['厦门大学', '福建', '厦门', '985', '综合', 18, 22, '双一流 A 类', 1921],
  ['中南大学', '湖南', '长沙', '985', '综合', 23, 24, '双一流 A 类', 1903],
  ['湖南大学', '湖南', '长沙', '985', '综合', 24, 27, '双一流 A 类', 976],
  ['大连理工大学', '辽宁', '大连', '985', '理工', 25, 23, '卓越大学联盟（E9）', 1949],
  ['华南理工大学', '广东', '广州', '985', '理工', 26, 25, '卓越大学联盟（E9）· 建筑老八校', 1931],
  ['西北工业大学', '陕西', '西安', '985', '理工', 27, 26, '卓越大学联盟（E9）· 国防七子', 1938],
  ['重庆大学', '重庆', '重庆', '985', '综合', 28, 28, '卓越大学联盟（E9）', 1929],
  ['电子科技大学', '四川', '成都', '985', '理工', 29, 29, '两电一邮', 1956],
  ['兰州大学', '甘肃', '兰州', '985', '综合', 30, 30, '双一流 A 类', 1909],
  ['北京邮电大学', '北京', '北京', '211', '理工', 31, 33, '两电一邮', 1955],
  ['北京交通大学', '北京', '北京', '211', '理工', 32, 35, '—', 1896],
  ['北京科技大学', '北京', '北京', '211', '理工', 33, 36, '—', 1952],
  ['北京外国语大学', '北京', '北京', '211', '语言', 34, 40, '—', 1941],
  ['中央财经大学', '北京', '北京', '211', '财经', 35, 41, '财经五校', 1949],
  ['对外经济贸易大学', '北京', '北京', '211', '财经', 36, 42, '财经五校', 1951],
  ['中国政法大学', '北京', '北京', '211', '政法', 37, 43, '—', 1952],
  ['中国传媒大学', '北京', '北京', '211', '艺术', 38, 45, '—', 1954],
  ['华北电力大学', '北京', '北京', '211', '理工', 39, 47, '—', 1958],
  ['上海财经大学', '上海', '上海', '211', '财经', 40, 34, '财经五校', 1917],
  ['上海外国语大学', '上海', '上海', '211', '语言', 41, 39, '—', 1949],
  ['华东理工大学', '上海', '上海', '211', '理工', 42, 38, '—', 1952],
  ['东华大学', '上海', '上海', '211', '理工', 43, 44, '—', 1951],
  ['上海大学', '上海', '上海', '211', '综合', 44, 46, '—', 1922],
  ['南京航空航天大学', '江苏', '南京', '211', '理工', 45, 37, '国防七子', 1952],
  ['南京理工大学', '江苏', '南京', '211', '理工', 46, 32, '国防七子', 1953],
  ['河海大学', '江苏', '南京', '211', '理工', 47, 49, '—', 1915],
  ['苏州大学', '江苏', '苏州', '211', '综合', 48, 48, '—', 1900],
  ['南京师范大学', '江苏', '南京', '211', '师范', 49, 50, '—', 1902],
  ['江南大学', '江苏', '无锡', '211', '综合', 50, 51, '—', 1902],
  ['中国矿业大学', '江苏', '徐州', '211', '理工', 51, 52, '—', 1909],
  ['合肥工业大学', '安徽', '合肥', '211', '理工', 52, 53, '—', 1945],
  ['安徽大学', '安徽', '合肥', '211', '综合', 53, 54, '—', 1928],
  ['郑州大学', '河南', '郑州', '211', '综合', 54, 55, '部省合建', 1956],
  ['武汉理工大学', '湖北', '武汉', '211', '理工', 55, 56, '—', 2000],
  ['华中师范大学', '湖北', '武汉', '211', '师范', 56, 57, '—', 1903],
  ['中南财经政法大学', '湖北', '武汉', '211', '财经', 57, 58, '财经五校', 1948],
  ['湖南师范大学', '湖南', '长沙', '211', '师范', 58, 59, '—', 1938],
  ['暨南大学', '广东', '广州', '211', '综合', 59, 60, '—', 1906],
  ['华南师范大学', '广东', '广州', '211', '师范', 60, 61, '—', 1933],
  ['西南交通大学', '四川', '成都', '211', '理工', 61, 62, '—', 1896],
  ['西南财经大学', '四川', '成都', '211', '财经', 62, 63, '财经五校', 1925],
  ['四川农业大学', '四川', '成都', '211', '农林', 63, 64, '—', 1906],
  ['西安电子科技大学', '陕西', '西安', '211', '理工', 64, 65, '两电一邮', 1931],
  ['西北大学', '陕西', '西安', '211', '综合', 65, 66, '—', 1902],
  ['哈尔滨工程大学', '黑龙江', '哈尔滨', '211', '理工', 66, 67, '国防七子', 1953],
  ['东北师范大学', '吉林', '长春', '211', '师范', 67, 68, '—', 1946],
  ['大连海事大学', '辽宁', '大连', '211', '理工', 68, 69, '—', 1909],
  ['中国海洋大学', '山东', '青岛', '211', '综合', 69, 70, '—', 1924],
  ['北京工业大学', '北京', '北京', '211', '理工', 70, 71, '—', 1960],
  ['深圳大学', '广东', '深圳', '本科', '综合', 71, 72, '—', 1983],
  ['宁波大学', '浙江', '宁波', '本科', '综合', 72, 73, '—', 1986],
  ['扬州大学', '江苏', '扬州', '本科', '综合', 73, 74, '—', 1902],
  ['江苏大学', '江苏', '镇江', '本科', '综合', 74, 75, '—', 1902],
  ['浙江工业大学', '浙江', '杭州', '本科', '理工', 75, 76, '—', 1953],
  ['杭州电子科技大学', '浙江', '杭州', '本科', '理工', 76, 77, '—', 1956],
  ['南京邮电大学', '江苏', '南京', '本科', '理工', 77, 78, '—', 1942],
  ['青岛大学', '山东', '青岛', '本科', '综合', 78, 79, '—', 1909],
  ['山东师范大学', '山东', '济南', '本科', '师范', 79, 80, '—', 1950],
  ['河南大学', '河南', '开封', '本科', '综合', 80, 81, '—', 1912],
  ['河北大学', '河北', '保定', '本科', '综合', 81, 82, '—', 1921],
  ['湘潭大学', '湖南', '湘潭', '本科', '综合', 82, 83, '—', 1958],
  ['长沙理工大学', '湖南', '长沙', '本科', '理工', 83, 84, '—', 1956],
  ['广东工业大学', '广东', '广州', '本科', '理工', 84, 85, '—', 1958],
  ['桂林电子科技大学', '广西', '桂林', '本科', '理工', 85, 86, '—', 1960],
  ['昆明理工大学', '云南', '昆明', '本科', '理工', 86, 87, '—', 1954],
  ['西安建筑科技大学', '陕西', '西安', '本科', '理工', 87, 88, '建筑老八校', 1895],
  ['兰州交通大学', '甘肃', '兰州', '本科', '理工', 88, 89, '—', 1958],
  ['重庆邮电大学', '重庆', '重庆', '本科', '理工', 89, 90, '—', 1950],
  ['武汉科技大学', '湖北', '武汉', '本科', '理工', 90, 91, '—', 1898],
  ['湖北大学', '湖北', '武汉', '本科', '综合', 91, 92, '—', 1931],
  ['江西财经大学', '江西', '南昌', '本科', '财经', 92, 93, '—', 1923],
  ['安徽师范大学', '安徽', '芜湖', '本科', '师范', 93, 94, '—', 1928],
  ['福建师范大学', '福建', '福州', '本科', '师范', 94, 95, '—', 1907],
  ['天津师范大学', '天津', '天津', '本科', '师范', 95, 96, '—', 1958],
  ['深圳信息职业技术学院', '广东', '深圳', '专科', '理工', 1, 1, '双高计划', 2002],
  ['金华职业技术学院', '浙江', '金华', '专科', '综合', 2, 2, '双高计划', 1994],
  ['无锡职业技术学院', '江苏', '无锡', '专科', '理工', 3, 3, '双高计划', 1959],
  ['淄博职业学院', '山东', '淄博', '专科', '综合', 4, 4, '双高计划', 2002],
  ['重庆工业职业技术学院', '重庆', '重庆', '专科', '理工', 5, 5, '双高计划', 1956],
  ['广东轻工职业技术大学', '广东', '广州', '专科', '理工', 6, 6, '双高计划', 1933],
  ['浙江金融职业学院', '浙江', '杭州', '专科', '财经', 7, 7, '双高计划', 1975],
  ['四川工程职业技术学院', '四川', '德阳', '专科', '理工', 8, 8, '双高计划', 1959],
  ['北京电子科技职业学院', '北京', '北京', '专科', '理工', 9, 9, '双高计划', 1958],
  ['南京工业职业技术大学', '江苏', '南京', '专科', '理工', 10, 10, '双高计划', 1918]
];

const ALLIANCES = [...new Set(UNIVERSITIES.map(u => u[7]))].filter(a => a && a !== '—');

/* 展开成对象；id 用序号保证稳定 */
function universityList() {
  return UNIVERSITIES.map(([name, province, city, tier, type, alumniRank, ruankeRank, alliance, founded], index) => ({
    id: 'u' + String(index + 1).padStart(3, '0'),
    name, province, city, tier, type, alumniRank, ruankeRank, alliance, founded
  }));
}

function provinceByName(name) {
  return PROVINCES.find(p => p.name === name) || null;
}


module.exports = {
  YEARS,
  TIERS,
  TYPES,
  SUBJECTS,
  LEGACY_SUBJECTS,
  PROVINCES,
  UNDERGRAD_MAJORS,
  VOCATIONAL_MAJORS,
  ALLIANCES,
  universityList,
  provinceByName
};

};
__mods["miniprogram/utils/gaokao-model.js"] = function (module, exports, require) {
/* 高考志愿模拟模型（计算层）
   分数全部由「院校 id + 年份 + 省份 + 专业」的哈希种子确定，因此：
   同一请求永远得到同一结果，服务重启后也不会变，不需要把几十万条分数落库。
   所有数值都是演示用的模拟数据，与真实招生无关。*/

const {
  YEARS, PROVINCES, TIERS, TYPES, SUBJECTS, LEGACY_SUBJECTS, ALLIANCES,
  UNDERGRAD_MAJORS, VOCATIONAL_MAJORS, universityList, provinceByName
} = require("miniprogram/utils/gaokao-data.js");

const UNIVERSITIES = universityList();
const DISCLAIMER = '';

/* ---------------- 确定性随机 ---------------- */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rand01(seed) {
  let t = (hash32(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// 在 ±amp 之间取一个确定性抖动
function jitter(seed, amp) { return (rand01(seed) * 2 - 1) * amp; }
const round1 = n => Math.round(n * 10) / 10;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------------- 院校强度 ---------------- */
const TIER_STRENGTH = {'985': [0.925, 0.995], '211': [0.845, 0.92], '本科': [0.70, 0.84], '专科': [0.30, 0.50]};
const STRENGTH = new Map();
const BASE_LINE = new Map();
for (const tier of TIERS) {
  const peers = UNIVERSITIES.filter(u => u.tier === tier).sort((a, b) => a.alumniRank - b.alumniRank);
  const [lo, hi] = TIER_STRENGTH[tier];
  peers.forEach((u, i) => {
    const p = peers.length === 1 ? 0 : i / (peers.length - 1);
    const s = hi - p * (hi - lo);
    STRENGTH.set(u.id, s);
    // 750 分制下的「校线」基准（2025 年、全国平均水平）
    BASE_LINE.set(u.id, 150 + Math.pow(s, 1.6) * 560);
  });
}

// 年度难度漂移（相对 2025 年的百分比）
const DRIFT = {2016: -0.014, 2017: 0.004, 2018: -0.006, 2019: 0.011, 2020: 0.002,
  2021: -0.003, 2022: 0.009, 2023: -0.002, 2024: 0.005, 2025: 0};

const byId = new Map(UNIVERSITIES.map(u => [u.id, u]));

/* ---------------- 查询入口 ---------------- */
function findUniversity(id) { return byId.get(String(id)) || null; }
function provinceInfo(name) { return provinceByName(name) || PROVINCES[0]; }
function isProvince(name) { return PROVINCES.some(p => p.name === name); }
function strengthOf(uni) { return STRENGTH.get(uni.id); }

/* 校线（750 分制、全国平均口径） */
function yearLine(uni, year) {
  const base = BASE_LINE.get(uni.id);
  const drift = DRIFT[year] ?? 0;
  return round1(base * (1 + drift) + jitter(`${uni.id}|${year}|line`, 7));
}

/* 分省投档线：按该省竞争系数放大「超出 150 分」的部分，再换算到该省满分 */
function provinceLine(uni, province, year) {
  const p = provinceByName(province) || PROVINCES[0];
  const base = yearLine(uni, year);
  const adj = 150 + (base - 150) * p.factor + jitter(`${uni.id}|${p.name}|${year}|prov`, 6);
  return round1(clamp(adj * (p.total / 750), 0, p.total));
}

/* 位次估算：按省考生规模的逻辑斯蒂曲线，分数越高位次越靠前 */
function rankOf(province, score) {
  const p = provinceByName(province) || PROVINCES[0];
  const s750 = Number(score) * (750 / p.total);
  const r = Math.round(p.students / (1 + Math.exp((s750 - 500) / 30)));
  return Math.max(1, r);
}

/* ---------------- 专业 ---------------- */
const MAJOR_HEAT = new Map([...UNDERGRAD_MAJORS, ...VOCATIONAL_MAJORS].map(m => [m.name, m.heat]));
const TYPE_AFFINITY = {
  '理工': {'工学': 0.55, '理学': 0.30, '管理学': 0.05},
  '综合': {},
  '师范': {'教育学': 0.55, '文学': 0.30, '理学': 0.22, '历史学': 0.20},
  '农林': {'农学': 0.65, '理学': 0.20, '工学': 0.10},
  '医药': {'医学': 0.75, '理学': 0.20},
  '财经': {'经济学': 0.60, '管理学': 0.42, '法学': 0.10},
  '政法': {'法学': 0.65, '管理学': 0.10},
  '语言': {'文学': 0.65, '法学': 0.10},
  '艺术': {'艺术学': 0.70, '文学': 0.20},
  '民族': {'法学': 0.22, '文学': 0.18, '教育学': 0.15},
  '体育': {'教育学': 0.55, '管理学': 0.10}
};
const MAJOR_COUNT = {'985': 30, '211': 24, '本科': 17, '专科': 9};

const majorsCache = new Map();
function majorsOf(uni) {
  if (majorsCache.has(uni.id)) return majorsCache.get(uni.id);
  const pool = uni.tier === '专科' ? VOCATIONAL_MAJORS : UNDERGRAD_MAJORS;
  const affinity = TYPE_AFFINITY[uni.type] || {};
  const n = MAJOR_COUNT[uni.tier] + Math.floor(rand01(`${uni.id}|count`) * 6);
  const ranked = pool
    .map(m => ({m, score: (affinity[m.category] || 0) + (uni.type === '综合' ? 0.08 : 0) + rand01(`${uni.id}|${m.name}`) * 0.55}))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(n, pool.length))
    .map(x => x.m);
  // 热门专业优先展示
  ranked.sort((a, b) => b.heat - a.heat);
  majorsCache.set(uni.id, ranked);
  return ranked;
}

function majorLine(uni, majorName, province, year) {
  const p = provinceByName(province) || PROVINCES[0];
  const base = provinceLine(uni, province, year);
  const heat = MAJOR_HEAT.get(majorName) ?? 0.75;
  const delta = (heat - 0.82) * 90;
  return round1(clamp(base + delta + jitter(`${uni.id}|${majorName}|${p.name}|${year}`, 5), 0, p.total));
}

function planOf(uni, majorName, year) {
  const heat = MAJOR_HEAT.get(majorName) ?? 0.75;
  const base = uni.tier === '985' ? 12 : uni.tier === '211' ? 9 : uni.tier === '本科' ? 6 : 20;
  return Math.max(2, Math.round(base * (0.6 + heat) + jitter(`${uni.id}|${majorName}|${year}|plan`, 4)));
}

/* ---------------- 展示用 ---------------- */
const INTRO_TPL = [
  (u) => `${loc(u)}的${u.type}类${u.tier}院校，建校于 ${u.founded} 年，校友会排名全国第 ${u.alumniRank}。`,
  (u) => `位于${loc(u)}，${u.founded} 年建校，属${u.tier}层次${u.type}类高校，校友会排名第 ${u.alumniRank}、软科中国排名第 ${u.ruankeRank}。`,
  (u) => `${loc(u)}的${u.type}类院校，${u.tier}层次，办学历史可追溯至 ${u.founded} 年，开设 ${u.majorsCount} 个本科专业。`
];
// 直辖市省份与城市同名，避免拼成「北京北京」
const loc = u => (u.city === u.province ? u.city : u.province + u.city);
function introOf(uni) {
  const i = Math.floor(rand01(`${uni.id}|intro`) * INTRO_TPL.length);
  return INTRO_TPL[i](uni);
}

const DISCIPLINE_BY_MAJOR = new Map([...UNDERGRAD_MAJORS, ...VOCATIONAL_MAJORS].map(m => [m.name, m.category]));

/* 列表项 */
function summary(uni, province = '黑龙江', year = 2025) {
  const line = provinceLine(uni, province, year);
  return {
    id: uni.id, name: uni.name, province: uni.province, city: uni.city,
    tier: uni.tier, type: uni.type, alliance: uni.alliance,
    alumniRank: uni.alumniRank, ruankeRank: uni.ruankeRank, founded: uni.founded,
    majorsCount: majorsOf(uni).length,
    line, rank: rankOf(province, line), year, provinceName: province
  };
}

/* 详情：基本信息 + 专业 + 近十年校线/省线 + 该年各省投档线 */
function detail(uni, province = '黑龙江', year = 2025) {
  const p = provinceInfo(province);
  const majors = majorsOf(uni).map(m => {
    const line = majorLine(uni, m.name, province, year);
    return {
      name: m.name, category: m.category, heat: m.heat,
      line, rank: rankOf(province, line), plan: planOf(uni, m.name, year),
      gap: round1(line - provinceLine(uni, province, year))
    };
  });

  const national = YEARS.map(y => {
    const line = yearLine(uni, y);
    return {year: y, line, avg: round1(line + jitter(`${uni.id}|${y}|avg`, 3.5)), plan: null};
  });
  const provinceSeries = YEARS.map(y => {
    const line = provinceLine(uni, province, y);
    return {year: y, line, rank: rankOf(province, line)};
  });

  const provinceRows = PROVINCES.map(pr => {
    const line = provinceLine(uni, pr.name, year);
    return {province: pr.name, total: pr.total, line, rank: rankOf(pr.name, line)};
  }).sort((a, b) => a.province.localeCompare(b.province, 'zh-Hans-CN'));

  const plan = majors.reduce((sum, m) => sum + m.plan, 0);

  return {
    ...uni, intro: introOf(uni), majorsCount: majors.length,
    majors, lines: {national, province: provinceName(province), provinceSeries, plan},
    provinceLines: {year, rows: provinceRows},
    ranks: {alumni: {rank: uni.alumniRank, source: '校友会'}, ruanke: {rank: uni.ruankeRank, source: '软科中国'}},
    disclaimer: DISCLAIMER
  };
}

function provinceName(n) { return provinceInfo(n).name; }

/* 某专业近十年（指定省份）走势 */
function majorSeries(uni, majorName, province = '黑龙江') {
  const m = majorsOf(uni).find(x => x.name === majorName);
  if (!m) return null;
  return {
    university: {id: uni.id, name: uni.name}, major: m.name, category: m.category, heat: m.heat,
    province: provinceName(province),
    series: YEARS.map(y => {
      const line = majorLine(uni, m.name, province, y);
      return {year: y, line, rank: rankOf(province, line), plan: planOf(uni, m.name, y)};
    })
  };
}

/* 冲稳保推荐 */
function recommend({province = '黑龙江', score, year = 2025, subject = '物理', limit = 10, tier, type, alliance} = {}) {
  const p = provinceInfo(province);
  const s = Number(score);
  if (!Number.isFinite(s) || s <= 0 || s > p.total) {
    const err = new Error(`分数须为 0–${p.total} 之间的数字（${p.name}满分 ${p.total}）`);
    err.status = 400;
    throw err;
  }
  // 科类只做轻微偏移，纯属演示
  const bias = subject === '历史' ? 3 : subject === '物理' ? 0 : 0;

  const buckets = {chong: [], wen: [], bao: []};
  for (const uni of UNIVERSITIES) {
    // 筛选放在分档之前：先过滤再截断，否则某一档会被人为清空
    if (tier && uni.tier !== tier) continue;
    if (type && uni.type !== type) continue;
    if (alliance && !uni.alliance.includes(alliance)) continue;
    const line = provinceLine(uni, province, year);
    const diff = round1(s - line + bias);
    const item = {
      id: uni.id, name: uni.name, province: uni.province, city: uni.city, tier: uni.tier,
      type: uni.type, alliance: uni.alliance, alumniRank: uni.alumniRank, ruankeRank: uni.ruankeRank,
      line, diff, rank: rankOf(province, line), majorsCount: majorsOf(uni).length,
      probability: Math.round(clamp(1 / (1 + Math.exp(-diff / 7)), 0.02, 0.98) * 100)
    };
    if (diff < -18) continue;              // 差距过大，不进入推荐
    if (diff < 0) buckets.chong.push(item);
    else if (diff <= 12) buckets.wen.push(item);
    else if (diff <= 55) buckets.bao.push(item);
  }
  const sortBy = (list, dir) => list.sort((a, b) => dir * (b.line - a.line)).slice(0, limit);
  return {
    input: {province: p.name, total: p.total, score: s, year, subject, limit,
      tier: tier || null, type: type || null, alliance: alliance || null},
    buckets: {
      chong: sortBy(buckets.chong, 1),   // 冲：先看分数线最高的
      wen: sortBy(buckets.wen, 1),
      bao: sortBy(buckets.bao, 1)
    },
    counts: {chong: buckets.chong.length, wen: buckets.wen.length, bao: buckets.bao.length},
    disclaimer: DISCLAIMER
  };
}

/* 院校列表：筛选 + 分页 */
function listUniversities({province, tier, type, alliance, q, sort = 'rank', page = 1, size = 20, scoreProvince = '黑龙江', year = 2025} = {}) {
  const keyword = String(q || '').trim().toLowerCase();
  let rows = UNIVERSITIES.filter(u =>
    (!province || u.province === province) &&
    (!tier || u.tier === tier) &&
    (!type || u.type === type) &&
    (!alliance || u.alliance.includes(alliance)) &&
    (!keyword || (u.name + u.city + u.province + u.type + u.alliance).toLowerCase().includes(keyword))
  ).map(u => summary(u, scoreProvince, year));

  if (sort === 'line-desc') rows.sort((a, b) => b.line - a.line);
  else if (sort === 'line-asc') rows.sort((a, b) => a.line - b.line);
  else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  else rows.sort((a, b) => a.alumniRank - b.alumniRank);

  const total = rows.length;
  const p = Math.max(1, Math.min(Number(page) || 1, Math.ceil(total / size) || 1));
  const items = rows.slice((p - 1) * size, p * size);
  return {total, page: p, size, pages: Math.ceil(total / size) || 1, items, scoreProvince, year};
}

function meta() {
  return {
    years: YEARS, provinces: PROVINCES, tiers: TIERS, types: TYPES,
    alliances: ALLIANCES, subjects: SUBJECTS, legacySubjects: LEGACY_SUBJECTS,
    majorCategories: [...new Set(UNDERGRAD_MAJORS.map(m => m.category))],
    dataset: {
      universities: UNIVERSITIES.length,
      years: YEARS.length,
      undergradMajors: UNDERGRAD_MAJORS.length,
      vocationalMajors: VOCATIONAL_MAJORS.length,
      byTier: TIERS.reduce((acc, t) => (acc[t] = UNIVERSITIES.filter(u => u.tier === t).length, acc), {}),
      byProvince: PROVINCES.map(p => ({province: p.name, count: UNIVERSITIES.filter(u => u.province === p.name).length})).filter(x => x.count)
    },
    disclaimer: DISCLAIMER
  };
}


module.exports = {
  UNIVERSITIES,
  DISCLAIMER,
  findUniversity,
  provinceInfo,
  isProvince,
  strengthOf,
  yearLine,
  provinceLine,
  rankOf,
  majorsOf,
  majorLine,
  summary,
  detail,
  majorSeries,
  recommend,
  listUniversities,
  meta
};

};
__mods["miniprogram/utils/institution-lib.js"] = function (module, exports, require) {
/* 机构工作台 / 课程套餐 / 视频素材 的纯逻辑（与网页版 institution-api.mjs 同规则）
 * 只做校验与数据整形，不碰数据库。由 cloudfunctions/_lib/sync-common.js 同步到
 * services 与 institutions 两个云函数目录。
 */

const clone = v => JSON.parse(JSON.stringify(v));
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ---------------- 机构评分（口碑） ----------------
 * 有内置口碑数据就用内置的；没有的机构按名称做确定性兜底，
 * 保证每个机构主页都有评分可看，且同一个名字每次算出来一致。
 */
const RATING_DIMS = ['师资', '环境', '课程', '服务'];
const RATING_LEVELS = [
  { min: 4.8, text: '口碑极佳' },
  { min: 4.5, text: '口碑优秀' },
  { min: 4.0, text: '口碑良好' },
  { min: 3.0, text: '口碑一般' },
  { min: 0, text: '暂无评价' }
];

function starsOf(score) {
  const value = Math.max(0, Math.min(5, Number(score) || 0));
  const filled = Math.round(value);
  return [1, 2, 3, 4, 5].map(index => ({ key: 'star-' + index, on: index <= filled }));
}

function ratingSeedOf(name) {
  const key = str(name, 60);
  const seeded = key && require("miniprogram/utils/seed-data.js").MERCHANT_RATINGS[key];
  if (seeded) return seeded;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  const score = Math.round((4.2 + (hash % 7) / 10) * 10) / 10;
  const dims = {};
  RATING_DIMS.forEach((dim, index) => {
    const drift = ((hash >> (index + 1)) % 3) - 1;
    dims[dim] = Math.round(Math.max(3.5, Math.min(5, score + drift * 0.1)) * 10) / 10;
  });
  return { score, count: 20 + (hash % 180), dims, reviews: [] };
}

/* 列表用的评分摘要 */
function ratingSummary(name) {
  const seed = ratingSeedOf(name);
  const score = Math.round(Math.max(0, Math.min(5, Number(seed.score) || 0)) * 10) / 10;
  const count = Math.max(0, Math.round(Number(seed.count) || 0));
  const level = (RATING_LEVELS.find(x => score >= x.min) || RATING_LEVELS[RATING_LEVELS.length - 1]).text;
  return { score, scoreText: score.toFixed(1), count, countText: count + ' 条评价', level };
}

/* 详情页用的完整评分：摘要 + 四个分维度 + 评价样本 */
function ratingView(name) {
  const seed = ratingSeedOf(name);
  const summary = ratingSummary(name);
  const dims = RATING_DIMS.map((dim, index) => {
    const raw = (seed.dims && seed.dims[dim] !== undefined) ? seed.dims[dim] : summary.score;
    const value = Math.round(Math.max(0, Math.min(5, Number(raw) || 0)) * 10) / 10;
    return {
      key: 'dim-' + index,
      name: dim,
      score: value,
      scoreText: value.toFixed(1),
      width: Math.round(value / 5 * 100)
    };
  });
  const reviews = (Array.isArray(seed.reviews) ? seed.reviews : []).slice(0, 6).map((row, index) => {
    const user = str(row.user, 30) || '匿名家长';
    return {
      key: 'review-' + index,
      user: user,
      initial: user.slice(0, 1),
      score: Math.max(1, Math.min(5, Math.round(Number(row.score) || 5))),
      stars: starsOf(row.score),
      date: str(row.date, 10),
      text: str(row.text, 300)
    };
  });
  return Object.assign({}, summary, {
    stars: starsOf(summary.score),
    dims: dims,
    reviews: reviews,
    hasReviews: reviews.length > 0
  });
}

/* ---------------- 套餐（仅课程类服务） ---------------- */
const PACKAGE_MAX = 10;
const PACKAGE_NAME_MAX = 60;
const PACKAGE_DESC_MAX = 200;
const PACKAGE_LESSONS_MAX = 999;
const PACKAGE_PRICE_MIN = 0.01;
const PACKAGE_PRICE_MAX = 100000;
const LOCAL_VIDEO = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$/;
const CLOUD_VIDEO = /^cloud:\/\/[^\s]+$/;

/* 视频地址：http(s) 公网地址、本站上传 /media/<uuid>、或云存储 cloud:// fileID */
function validVideoUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 500) return null;
  if (LOCAL_VIDEO.test(value)) return value;
  if (CLOUD_VIDEO.test(value)) return value;
  let parsed;
  try { parsed = new URL(value); } catch (e) { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (!parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;
  if (!/^[a-z0-9.-]+$/i.test(parsed.hostname) || !parsed.hostname.includes('.')) return null;
  if (parsed.href.length > 500) return null;
  return parsed.href;
}

function normalizePackages(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw Object.assign(new Error('套餐须为数组'), { status: 400 });
  if (input.length > PACKAGE_MAX) throw Object.assign(new Error('套餐最多 ' + PACKAGE_MAX + ' 项'), { status: 400 });
  const seen = new Set();
  return input.map((raw, index) => {
    const at = '第 ' + (index + 1) + ' 个套餐';
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw Object.assign(new Error(at + '格式不正确'), { status: 400 });
    }
    let id = raw.id === undefined || raw.id === null || raw.id === '' ? '' : str(raw.id, 64);
    if (id && !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw Object.assign(new Error(at + '的 id 只能包含字母、数字、下划线和短横线'), { status: 400 });
    }
    if (id && seen.has(id)) throw Object.assign(new Error('套餐 id 不能重复：' + id), { status: 400 });
    const name = str(raw.name, PACKAGE_NAME_MAX);
    if (!name) throw Object.assign(new Error(at + '请填写套餐名称'), { status: 400 });
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < PACKAGE_PRICE_MIN || price > PACKAGE_PRICE_MAX) {
      throw Object.assign(new Error(at + '的价格须为 0.01–' + PACKAGE_PRICE_MAX + ' 元'), { status: 400 });
    }
    const lessons = Number(raw.lessons);
    if (!Number.isInteger(lessons) || lessons < 1 || lessons > PACKAGE_LESSONS_MAX) {
      throw Object.assign(new Error(at + '的课时数须为 1–' + PACKAGE_LESSONS_MAX + ' 的正整数'), { status: 400 });
    }
    const description = str(raw.description, PACKAGE_DESC_MAX);
    const videoUrl = validVideoUrl(raw.videoUrl);
    if (videoUrl === null) {
      throw Object.assign(new Error(at + '的视频地址只允许 http/https 地址、本站 /media/<uuid>.mp4|webm 或云存储 cloud:// fileID'), { status: 400 });
    }
    const item = { id: id || '', name, price: Math.round(price * 100) / 100, lessons, description };
    if (videoUrl) item.videoUrl = videoUrl;
    if (id) seen.add(id);
    return item;
  });
}

function assignPackageIds(list, makeId) {
  const used = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    let id = typeof item.id === 'string' && item.id ? item.id : '';
    if (!id || used.has(id)) id = makeId();
    used.add(id);
    out.push(Object.assign({}, item, { id }));
  }
  return out;
}

function findPackage(service, packageId) {
  if (!Array.isArray(service && service.packages)) return null;
  return service.packages.find(p => p && p.id === packageId) || null;
}

/* ---------------- 服务人群 ---------------- */
/* 家长：课程展示在家长课程页（首页精选 / 精品课程 / 机构目录）
 * 大学生：课程展示在大学生中心的学习资源页
 * 未设置（旧数据）按「家长」处理，既有课程不会消失。 */
const AUDIENCES = ['家长', '大学生'];
const DEFAULT_AUDIENCE = ['家长'];
const AUDIENCE_HINT = '服务人群只能选家长或大学生';

/* required：PUT 机构资料时至少要留一项；入驻申请缺省按「家长」处理 */
function normalizeAudience(value, options) {
  const required = !!(options && options.required);
  if (value === undefined || value === null || value === '') {
    if (required) throw Object.assign(new Error('请选择服务人群'), { status: 400 });
    return null;
  }
  const raw = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : null;
  if (!raw) throw Object.assign(new Error(AUDIENCE_HINT), { status: 400 });
  const picked = [];
  for (const item of raw) {
    const v = str(item, 10);
    if (!v) continue;
    if (!AUDIENCES.includes(v)) throw Object.assign(new Error(AUDIENCE_HINT), { status: 400 });
    if (!picked.includes(v)) picked.push(v);
  }
  if (!picked.length) {
    if (required) throw Object.assign(new Error('请选择服务人群'), { status: 400 });
    return null;
  }
  /* 统一顺序，避免「大学生,家长」和「家长,大学生」被当成两份数据 */
  return AUDIENCES.filter(v => picked.includes(v));
}

/* 课程/机构的对外展示人群：未设置时返回 null，由前端按「家长可见」兜底 */
function audienceOf(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const picked = value.filter(v => AUDIENCES.includes(v));
  return picked.length ? AUDIENCES.filter(v => picked.includes(v)) : null;
}

/* 家长端可见：未设置人群也算家长可见（兼容旧数据） */
function parentAudience(value) {
  const list = audienceOf(value);
  return !list || list.includes('家长');
}

/* ---------------- 机构资料 ---------------- */
const INSTITUTION_NAME_FIXED = '机构名称由关联课程决定，不可在此修改';
const INSTITUTION_FIELDS = {
  intro: { label: '机构简介', max: 500 },
  address: { label: '机构地址', max: 200 },
  contact: { label: '联系人', max: 40 },
  phone: { label: '联系电话', max: 30 }
};

function normalizeInstitutionPatch(raw, currentName) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw Object.assign(new Error('机构资料格式不正确'), { status: 400 });
  }
  const allowed = new Set(['name', 'audience'].concat(Object.keys(INSTITUTION_FIELDS)));
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw Object.assign(new Error('不支持的字段：' + key), { status: 400 });
  }
  if (raw.name !== undefined && raw.name !== null && str(raw.name, 60) !== currentName) {
    throw Object.assign(new Error(INSTITUTION_NAME_FIXED), { status: 400 });
  }
  const out = {};
  for (const [key, meta] of Object.entries(INSTITUTION_FIELDS)) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'string') throw Object.assign(new Error(meta.label + '须为文本'), { status: 400 });
    const value = str(raw[key], meta.max);
    if (!value) throw Object.assign(new Error('请填写' + meta.label), { status: 400 });
    out[key] = value;
  }
  /* 服务人群：数组（也可传「家长,大学生」字符串），至少要选一项 */
  if (raw.audience !== undefined && raw.audience !== null) {
    out.audience = normalizeAudience(raw.audience, { required: true });
  }
  if (!Object.keys(out).length) throw Object.assign(new Error('请至少填写一项需要修改的机构资料'), { status: 400 });
  return out;
}

function institutionId(name) {
  const safe = String(name || '').replace(/[\/\\?#%\s]/g, '_');
  return 'inst-' + encodeURIComponent(safe).slice(0, 60);
}

/* 从课程目录生成机构列表：来源只有 course 类服务的 merchant 字段，
   再叠加 institutions 集合按机构 id 持久化的覆盖资料；
   approved：已通过的机构类申请（没有课程也要作为机构存在） */
function buildInstitutions(services, overrides, approved) {
  const stored = new Map();
  for (const row of Array.isArray(overrides) ? overrides : []) if (row && typeof row.id === 'string') stored.set(row.id, row);
  const sanctioned = new Map();
  for (const row of Array.isArray(approved) ? approved : []) if (row && typeof row.id === 'string') sanctioned.set(row.id, row);
  const map = new Map();
  for (const s of Array.isArray(services) ? services : []) {
    if (!s || s.type !== 'course') continue;
    const name = typeof s.merchant === 'string' ? s.merchant.trim() : '';
    if (!name) continue;
    const id = institutionId(name);
    let item = map.get(id);
    if (!item) {
      item = {
        id, name,
        intro: s.merchantDetail && s.merchantDetail.intro || '',
        address: s.merchantDetail && s.merchantDetail.address || s.address || '',
        contact: s.merchantDetail && s.merchantDetail.contact || '',
        phone: s.merchantDetail && s.merchantDetail.phone || s.phone || '',
        audience: audienceOf(s.audience),
        courseCount: 0, courses: [], source: { intro: 'course', address: 'course', contact: 'course', phone: 'course' }
      };
      map.set(id, item);
    }
    item.courseCount += 1;
    item.courses.push({ id: s.id, title: s.title, price: s.price, packages: Array.isArray(s.packages) ? clone(s.packages) : [] });
    for (const key of ['intro', 'address', 'contact', 'phone']) {
      if (!item[key]) {
        const fallback = key === 'address' ? s.address : key === 'phone' ? s.phone : (s.merchantDetail && s.merchantDetail[key]);
        if (fallback) { item[key] = fallback; item.source[key] = 'course'; }
      }
    }
  }
  for (const [id, seed] of sanctioned) {
    const existing = map.get(id);
    if (existing) {
      /* 机构先由课程建出来时，补上入驻申请里选的服务人群 */
      if (!existing.audience) existing.audience = audienceOf(seed.audience);
      continue;
    }
    map.set(id, {
      id, name: seed.name, intro: '', address: '', contact: seed.contact || '', phone: seed.phone || '',
      audience: audienceOf(seed.audience),
      courseCount: 0, courses: [], source: { intro: 'application', address: 'application', contact: 'application', phone: 'application' },
      approvedAt: seed.approvedAt || null
    });
  }
  for (const [id, row] of stored) {
    const item = map.get(id);
    if (!item) continue;
    for (const key of Object.keys(INSTITUTION_FIELDS)) {
      if (typeof row[key] === 'string' && row[key]) { item[key] = row[key]; item.source[key] = 'workbench'; }
    }
    const savedAudience = audienceOf(row.audience);
    if (savedAudience) item.audience = savedAudience;
    if (row.updatedAt) item.updatedAt = row.updatedAt;
  }
  return [...map.values()].map(item => Object.assign({}, item, { rating: ratingSummary(item.name) }));
}

/* 把机构覆盖资料回填进课程详情 */
function applyInstitution(service, institutions) {
  if (!service || service.type !== 'course') return service;
  const name = typeof service.merchant === 'string' ? service.merchant.trim() : '';
  if (!name) return service;
  const hit = (Array.isArray(institutions) ? institutions : []).find(i => i.name === name);
  if (!hit) return service;
  const detail = Object.assign({}, service.merchantDetail || {});
  for (const key of ['intro', 'address', 'contact', 'phone']) if (hit[key]) detail[key] = hit[key];
  if (!detail.name) detail.name = name;
  return Object.assign({}, service, { merchantDetail: detail });
}

/* 机构主页：环境图 / 课程 / 教师介绍 / 价格区间一次拿全。
 * 机构里只存了课程摘要（id/title/price/packages），环境图、师资、资质
 * 都在完整服务记录上，所以第二个参数要传完整服务目录。 */
function institutionDetailView(item, services) {
  const target = item || {};
  const rows = Array.isArray(target.courses) ? target.courses : [];
  const full = new Map((Array.isArray(services) ? services : []).map(s => [s.id, s]));
  const courses = rows.map(row => full.get(row.id) || row);
  const first = courses[0] || {};
  const detail = first.merchantDetail || {};

  /* 环境图：各课程上传的图片按名称去重，保留第一张的说明 */
  const imageMap = new Map();
  courses.forEach(course => {
    (Array.isArray(course.images) ? course.images : []).forEach(img => {
      if (!img || !img.name || imageMap.has(img.name)) return;
      imageMap.set(img.name, {
        key: 'env-' + imageMap.size,
        name: img.name,
        caption: img.caption || '',
        tone: img.tone || 'peach',
        course: course.title || ''
      });
    });
  });

  const teachers = (Array.isArray(detail.teachers) ? detail.teachers : [])
    .map((raw, index) => {
      const line = str(raw, 60);
      if (!line) return null;
      const at = line.indexOf('·');
      const name = (at < 0 ? line : line.slice(0, at)).trim();
      const subject = at < 0 ? '' : line.slice(at + 1).trim();
      if (!name) return null;
      return { key: 'teacher-' + index, name: name, subject: subject, initial: name.slice(0, 1) };
    })
    .filter(Boolean);

  const prices = courses.map(c => Number(c.price)).filter(n => Number.isFinite(n) && n > 0);
  const packageCount = courses.reduce((sum, c) => sum + (Array.isArray(c.packages) ? c.packages.length : 0), 0);
  const foundYear = Number(detail.foundYear) || 0;
  const verified = !!detail.verified || !!target.approvedAt;
  const priceRange = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  const audience = audienceOf(target.audience) || DEFAULT_AUDIENCE.slice();

  return Object.assign({}, target, {
    audience: audience,
    audienceText: audience.join(' / '),
    courseCount: courses.length,
    logo: detail.logo || '🏛️',
    foundYear: foundYear || '',
    foundText: foundYear ? '成立于 ' + foundYear + ' 年' : '成立年份待补充',
    verified: verified,
    licenses: (Array.isArray(detail.licenses) ? detail.licenses : []).map(x => str(x, 60)).filter(Boolean),
    teachers: teachers,
    images: Array.from(imageMap.values()),
    priceRange: priceRange,
    priceRangeText: !priceRange ? '价格待定'
      : priceRange.min === priceRange.max ? '¥' + priceRange.min
      : '¥' + priceRange.min + ' – ' + priceRange.max,
    stats: { courseCount: courses.length, teacherCount: teachers.length, packageCount: packageCount },
    rating: ratingView(target.name),
    courses: courses.map(course => ({
      id: course.id,
      title: course.title || '',
      price: Number(course.price) || 0,
      unit: course.unit || '',
      category: course.category || '',
      icon: course.icon || '📘',
      tone: course.tone || 'peach',
      tag: course.tag || '',
      description: course.description || '',
      learning: course.learning || null,
      packageCount: Array.isArray(course.packages) ? course.packages.length : 0
    }))
  });
}

/* ---------------- 服务字段校验（白名单） ---------------- */
const TONES = ['peach', 'lavender', 'mint'];
const TYPES = ['course', 'tutor', 'bus'];
const SERVICE_EDITABLE = ['title', 'merchant', 'category', 'price', 'unit', 'icon', 'tone', 'tag', 'description', 'location', 'city', 'remaining'];

function validImages(v) {
  return Array.isArray(v) && v.length <= 8 && v.every(i => i && typeof i === 'object' &&
    str(i.name, 60) && ['banner', 'photo', 'icon'].includes(i.kind || 'photo') &&
    (!i.caption || str(i.caption, 120).length <= 120));
}

module.exports = {
  clone, str,
  AUDIENCES, DEFAULT_AUDIENCE, AUDIENCE_HINT,
  normalizeAudience, audienceOf, parentAudience,
  PACKAGE_MAX, PACKAGE_NAME_MAX, PACKAGE_DESC_MAX,
  validVideoUrl, normalizePackages, assignPackageIds, findPackage,
  INSTITUTION_NAME_FIXED, INSTITUTION_FIELDS, normalizeInstitutionPatch,
  institutionId, buildInstitutions, institutionDetailView, applyInstitution,
  RATING_DIMS, ratingSummary, ratingView, starsOf,
  TONES, TYPES, SERVICE_EDITABLE, validImages
};

};
__mods["miniprogram/utils/logic.js"] = function (module, exports, require) {
/* 业务视图层：把云函数返回的原始数据转成页面直接渲染的结构。
 * 只做纯函数转换，不碰 wx / 不发请求，自检脚本可以完整覆盖。 */

const fmt = require("miniprogram/utils/format.js");

const TYPES = [
  { id: 'course', name: '课程' },
  { id: 'tutor', name: '伴学' },
  { id: 'bus', name: '校车' }
];

/* 星级：把 4.8 拆成 5 颗星的亮/灰，模板按顺序渲染即可 */
function starList(score) {
  const value = Number(score) || 0;
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return [1, 2, 3, 4, 5].map(index => ({ key: 'star-' + index, on: index <= filled }));
}

/* 伴学老师的公开资料摘要：首页卡片 / 详情页共用一份口径 */
function tutorBrief(s) {
  const d = (s && s.tutorDetail) || {};
  const rating = d.rating || {};
  const score = Number(rating.score) || 0;
  const count = Number(rating.count) || 0;
  return {
    name: d.name || (s && s.merchant) || '',
    initial: (d.name || (s && s.merchant) || '').slice(0, 1),
    school: d.school || '',
    major: d.major || '',
    education: d.education || '',
    score,
    scoreText: score ? score.toFixed(1) : '',
    count,
    countText: count ? count + ' 条评价' : '暂无评价',
    stars: starList(score),
    schoolText: [d.school, d.major].filter(Boolean).join(' · ')
  };
}

/* 帮忙接：个人顺路代接孩子的公开资料 */
function pickupBrief(s) {
  const d = (s && s.pickupDetail) || {};
  if (!d.person) return null;
  const seat = Number(d.seat) || 0;
  const used = Number(d.used) || 0;
  const free = Math.max(0, seat - used);
  const years = Number(d.years) || 0;
  return {
    person: d.person,
    initial: String(d.person).slice(0, 1),
    kind: d.kind === 'car' ? 'car' : 'pickup',
    isCar: d.kind === 'car',
    gender: d.gender || '',
    childGrade: d.childGrade || '',
    childText: d.childGrade ? '自家孩子 ' + d.childGrade + ' · 同校顺路' : '',
    years: years,
    yearsText: years ? '接送 ' + years + ' 年' : '刚开始接',
    area: d.area || '',
    school: d.school || '',
    schoolGate: d.schoolGate || '',
    timeText: d.timeText || '',
    vehicle: d.vehicle || '',
    seat: seat,
    used: used,
    free: free,
    seatText: seat ? (free > 0 ? '还能接 ' + free + ' 个孩子' : '本期已满') : '',
    idChecked: !!d.idChecked,
    credit: d.credit || '',
    note: d.note || ''
  };
}

/* ---------------- 列表 ---------------- */
function listView(service) {
  const s = service || {};
  const remaining = Number(s.remaining || 0);
  return {
    id: s.id || '',
    type: s.type || 'course',
    typeName: fmt.typeName(s.type),
    title: s.title || '未命名服务',
    tag: s.tag || '',
    icon: s.icon || '📘',
    tone: s.tone || 'peach',
    merchant: s.merchant || '',
    category: s.category || '',
    location: s.location || '',
    city: s.city || '',
    price: Number(s.price) || 0,
    priceText: fmt.money(s.price),
    unit: s.unit || '',
    remaining: remaining,
    remainingText: '余位 ' + remaining,
    lowSeat: remaining <= 3,
    subtitle: s.category || s.location || '',
    learning: s.learning || null,
    /* 伴学老师：学校 / 专业 / 星级，列表卡直接展示 */
    tutor: s.type === 'tutor' ? tutorBrief(s) : null,
    /* 帮忙接：接送人 / 小区 / 学校 / 余位 */
    pickup: s.type === 'bus' ? pickupBrief(s) : null
  };
}

/* ---------------- 首页内容区：四个 Tab 的子分类 ---------------- */
const COURSE_SECTIONS = [
  { id: 'k12', name: 'K12提升', hint: '学科、素养与体能' },
  { id: 'art', name: '艺考课', hint: '美术、音乐、播音' },
  { id: 'gwy', name: '公考课', hint: '考公、考研、考编' },
  { id: 'zk', name: '职业课', hint: '职业资格与技能证书' }
];
const TUTOR_SECTIONS = [
  { id: 'tutor', name: '大学生家教', hint: '在校大学生一对一带' },
  { id: 'read', name: '作业陪读', hint: '陪写作业、检查与答疑' },
  { id: 'home', name: '上门辅导', hint: '老师上门，家里上课' }
];
/* 接送：机构固定线路 + 个人「帮忙接」+ 家长「私家车」顺路 */
const BUS_SECTIONS = [
  { id: 'route', name: '固定线路', hint: '按月订，准点接送' },
  { id: 'pickup', name: '帮忙接', hint: '个人顺路代接，按次或按月' },
  { id: 'car', name: '私家车', hint: '接送自家孩子的家长顺路带一程' }
];
/* 精选里的四条推荐线 */
const FEATURED_GROUPS = [
  { id: 'student', name: '学生课程', desc: 'K12 与艺考', tab: 'course', sub: 'k12' },
  { id: 'adult', name: '成人考证课', desc: '公考、考研、职考', tab: 'course', sub: 'gwy' },
  { id: 'tutor', name: '家教伴学', desc: '大学生家教与陪读', tab: 'tutor', sub: 'tutor' },
  { id: 'bus', name: '接送服务', desc: '固定线路 · 帮忙接 · 私家车', tab: 'bus', sub: 'all' }
];

function has(text, words) {
  const s = String(text || '');
  return words.some(w => s.indexOf(w) >= 0);
}

/* 课程：按类目与考试方向归到四个子分类 */
function courseSection(item) {
  const s = item || {};
  const kind = s.learning && s.learning.kind ? s.learning.kind : '';
  const category = s.category || '';
  const title = s.title || '';
  if (kind === 'zk' || has(category, ['职考', '职业', '技能', '证书'])) return 'zk';
  if (kind === 'gwy' || kind === 'ky' || kind === 'sb') return 'gwy';
  if (has(category, ['考公', '考研', '考编', '公务员', '事业单位', '申论', '行测'])) return 'gwy';
  if (has(category, ['少儿', '启蒙', '素养', '探索', '成长营', '体能', '篮球', '科学', '学科'])) return 'k12';
  if (has(category, ['艺考', '美术', '音乐', '播音', '编导', '舞蹈', '传媒']) || has(title, ['艺考', '集训'])) return 'art';
  return 'k12';
}

/* 伴学：大学生家教 / 作业陪读 / 上门辅导 */
function tutorSection(item) {
  const s = item || {};
  const category = s.category || '';
  const title = s.title || '';
  const detail = s.tutorDetail || {};
  const methods = Array.isArray(detail.methods) ? detail.methods.join(' ') : '';
  if (has(methods, ['上门']) || has(category, ['上门', '学科辅导', '课业辅导'])) return 'home';
  if (has(category, ['阅读', '陪读', '作业', '习惯']) || has(title, ['陪读', '作业'])) return 'read';
  return 'tutor';
}

function busSection(item) {
  const s = item || {};
  if (s.pickupDetail) {
    if (s.pickupDetail.kind === 'car' || has(s.category, ['私家车'])) return 'car';
    return 'pickup';
  }
  if (s.busDetail) return 'route';
  /* 只能靠分类兜底，注意「校车接送」属于固定线路，不能只看「接送」两个字 */
  if (has(s.category, ['私家车'])) return 'car';
  if (has(s.category, ['帮忙接', '代接', '顺路接'])) return 'pickup';
  return 'route';
}

function sectionOf(item) {
  const s = item || {};
  if (s.type === 'bus') return 'bus';
  if (s.type === 'tutor') return tutorSection(s);
  return courseSection(s);
}

function sectionsFor(tab) {
  if (tab === 'course') return COURSE_SECTIONS;
  if (tab === 'tutor') return TUTOR_SECTIONS;
  if (tab === 'bus') return BUS_SECTIONS;
  return [];
}

/* 精选排序：带推荐标签、有余位、套餐多的排前面；同分按 id 稳定排序 */
function scoreOf(item) {
  const s = item || {};
  let score = 0;
  if (has(s.tag, ['推荐', '人气', '热门', '精选'])) score += 3;
  if (Number(s.remaining || 0) > 0) score += 1;
  if (Number(s.remaining || 0) <= 3 && Number(s.remaining || 0) > 0) score += 1;
  if (Array.isArray(s.packages) && s.packages.length >= 2) score += 1;
  return score;
}

function featuredGroups(rows, perGroup) {
  const limit = perGroup || 2;
  const list = Array.isArray(rows) ? rows : [];
  return FEATURED_GROUPS.map(group => {
    const pool = list.filter(item => {
      const sec = sectionOf(item);
      if (group.id === 'student') return item.type === 'course' && (sec === 'k12' || sec === 'art');
      if (group.id === 'adult') return item.type === 'course' && (sec === 'gwy' || sec === 'zk');
      if (group.id === 'tutor') return item.type === 'tutor';
      return item.type === 'bus';
    });
    const ranked = pool
      .map((item, index) => ({ item, score: scoreOf(item), index }))
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .slice(0, limit)
      .map(row => listView(row.item));
    return { id: group.id, name: group.name, desc: group.desc, tab: group.tab, sub: group.sub, total: pool.length, items: ranked };
  });
}

function matchesKeyword(service, keyword) {
  const word = String(keyword == null ? '' : keyword).trim().toLowerCase();
  if (!word) return true;
  const s = service || {};
  const hay = [s.title, s.merchant, s.category, s.location, s.city, s.description]
    .map(v => String(v == null ? '' : v).toLowerCase())
    .join(' ');
  return hay.indexOf(word) >= 0;
}

/* 目录筛选：先按类型，再按关键词；不修改入参
 * type 为 'all' 或空表示不按类型筛选（"精选"标签）
 * audience：家长端默认只展示对家长开放的课程；传 '' 表示不做人群过滤 */
function filterServices(list, options) {
  const opts = options || {};
  const rows = Array.isArray(list) ? list : [];
  const type = opts.type && opts.type !== 'all' ? opts.type : '';
  const audience = opts.audience === undefined ? '家长' : opts.audience;
  return rows.filter(s => {
    if (!s) return false;
    if (type && s.type !== type) return false;
    /* 机构把课程只开放给大学生时，家长端课程页不展示 */
    if (audience && s.type === 'course' && Array.isArray(s.audience) && s.audience.length && !s.audience.includes(audience)) return false;
    return matchesKeyword(s, opts.keyword);
  });
}

/* ---------------- 详情 ---------------- */
function imageView(images) {
  return (Array.isArray(images) ? images : []).map((img, index) => ({
    key: 'img-' + index,
    name: img && img.name ? img.name : '机构图片',
    caption: img && img.caption ? img.caption : '',
    tone: img && img.tone ? img.tone : 'peach',
    kind: img && img.kind ? img.kind : 'photo'
  }));
}

function packageView(packages) {
  return (Array.isArray(packages) ? packages : []).map((item, index) => ({
    key: 'pkg-' + index,
    id: item && item.id ? item.id : '',
    name: item && item.name ? item.name : '套餐',
    price: Number(item && item.price) || 0,
    priceText: fmt.money(item && item.price),
    lessons: Number(item && item.lessons) || 0,
    description: item && item.description ? item.description : '',
    videoUrl: item && typeof item.videoUrl === 'string' ? item.videoUrl : ''
  }));
}

function tutorView(s) {
  const d = (s && s.tutorDetail) || {};
  const list = value => (Array.isArray(value) ? value.filter(Boolean) : []);
  const brief = tutorBrief(s);
  return {
    name: d.name || s.merchant || '',
    initial: brief.initial,
    school: d.school || '',
    major: d.major || '',
    education: d.education || '',
    score: brief.score,
    scoreText: brief.scoreText,
    count: brief.count,
    countText: brief.countText,
    stars: brief.stars,
    subjects: list(d.subjects),
    methods: list(d.methods),
    experience: d.experience || '',
    intro: d.intro || '',
    certificate: d.certificate || '',
    grades: d.grades || ''
  };
}

function busView(s) {
  /* 帮忙接也复用线路结构，上/下车点与时刻表一致 */
  const d = (s && (s.pickupDetail || s.busDetail)) || {};
  const routes = Array.isArray(d.routes) ? d.routes : (Array.isArray(s && s.routes) ? s.routes : []);
  const period = Array.isArray(d.period) && d.period.length ? d.period : ['月付'];
  return {
    driver: d.driver || '',
    phone: d.phone || '',
    plate: d.plate || '',
    vehicle: d.vehicle || '',
    period: period,
    routes: routes.map((row, index) => ({
      key: 'stop-' + index,
      index: index,
      name: row && row.name ? row.name : '站点',
      arrival: row && row.arrival ? row.arrival : '',
      departure: row && row.departure ? row.departure : ''
    })),
    stops: routes.map(row => (row && row.name ? row.name : '')).filter(Boolean),
    pickup: pickupBrief(s)
  };
}

function merchantView(s) {
  const d = (s && s.merchantDetail) || {};
  return {
    name: d.name || (s && s.merchant) || '',
    intro: d.intro || '',
    foundYear: d.foundYear || '',
    verified: !!d.verified,
    address: d.address || (s && s.address) || '',
    contact: d.contact || '',
    phone: d.phone || (s && s.phone) || '',
    licenses: Array.isArray(d.licenses) ? d.licenses.filter(Boolean) : [],
    teachers: Array.isArray(d.teachers) ? d.teachers.filter(Boolean) : []
  };
}

function detailView(service) {
  const s = service || {};
  const slots = Array.isArray(s.calendar && s.calendar.slots) ? s.calendar.slots : [];
  const base = listView(s);
  return {
    ...base,
    description: s.description || '',
    address: s.address || '',
    phone: s.phone || '',
    images: imageView(s.images),
    packages: packageView(s.packages),
    tutor: s.type === 'tutor' ? tutorView(s) : null,
    bus: s.type === 'bus' ? busView(s) : null,
    /* merchant 是结构化对象（供「机构与师资」区块使用），
       标题栏要显示纯文本，另给一个 merchantName */
    merchantName: s.merchant || '',
    merchant: merchantView(s),
    slots: slots.map((slot, index) => ({
      key: 'slot-' + index,
      text: slot,
      weekday: fmt.slotWeekday(slot)
    })),
    slotNote: (s.calendar && s.calendar.note) || '',
    priceSuffix: s.unit ? '/' + s.unit : ''
  };
}

/* ---------------- 下单辅助 ---------------- */
/* 上车站点候选：整条线路 */
function busStartOptions(bus) {
  const rows = (bus && Array.isArray(bus.routes)) ? bus.routes : [];
  return rows.map(row => row.name);
}

/* 下车站点候选：必须严格排在所选上车站点之后（与服务端校验一致） */
function busEndOptions(bus, startName) {
  const rows = (bus && Array.isArray(bus.routes)) ? bus.routes : [];
  const index = rows.findIndex(row => row.name === startName);
  if (index < 0) return [];
  return rows.slice(index + 1).map(row => row.name);
}

/* 可约时段：服务端只回当天星期匹配的时段，附带 available 标记 */
function availabilityView(res) {
  const rows = (res && Array.isArray(res.slots)) ? res.slots : [];
  return rows.map(row => ({
    slot: row && row.slot ? row.slot : '',
    available: !!(row && row.available)
  }));
}

/* 已选课次去重键 */
function sessionKey(date, slot) {
  return String(date || '') + '|' + String(slot || '');
}

function addSession(list, date, slot) {
  const rows = Array.isArray(list) ? list.slice() : [];
  const key = sessionKey(date, slot);
  if (rows.some(row => sessionKey(row.date, row.slot) === key)) return rows;
  rows.push({ date: date, slot: slot });
  return rows;
}

function removeSession(list, date, slot) {
  const key = sessionKey(date, slot);
  return (Array.isArray(list) ? list : []).filter(row => sessionKey(row.date, row.slot) !== key);
}

/* ---------------- 订单 ---------------- */
function sessionText(order) {
  const o = order || {};
  if (Array.isArray(o.sessions) && o.sessions.length) {
    return o.sessions.map(s => fmt.shortDate(s.date) + ' ' + s.slot).join('；') +
      '（共 ' + (o.hours || o.sessions.length) + ' 小时）';
  }
  return o.slot ? o.slot : '—';
}

function orderView(order, services) {
  const o = order || {};
  const svc = (Array.isArray(services) ? services : []).find(s => s && s.id === o.serviceId) || {};
  return {
    id: o.id || '',
    number: o.number || '',
    title: o.title || svc.title || '服务',
    type: o.type || svc.type || '',
    typeName: fmt.typeName(o.type || svc.type),
    status: o.status || 'pending',
    statusText: fmt.statusText(o.status),
    statusTone: fmt.statusTone(o.status),
    amount: Number(o.amount) || 0,
    amountText: fmt.money(o.amount),
    student: o.student || '',
    phone: o.phone || '',
    phoneMasked: fmt.maskPhone(o.phone),
    slot: o.slot || '',
    sessionText: sessionText(o),
    packageName: (o.packageSnapshot && o.packageSnapshot.name) || '',
    code: o.code || '',
    createdAt: fmt.dateTime(o.createdAt),
    guardian: o.guardian || '',
    relation: o.relation || '',
    startPoint: o.startPoint || '',
    endPoint: o.endPoint || '',
    period: o.period || '',
    busInfo: o.type === 'bus' && svc.busDetail
      ? (svc.busDetail.driver || '演示驾驶员') + ' · ' + (svc.busDetail.plate || '演示车牌')
      : ''
  };
}

/* 订单统计 */
function orderStats(orders) {
  const rows = Array.isArray(orders) ? orders : [];
  const paid = rows.filter(o => ['paid', 'completed'].includes(o.status));
  return {
    total: rows.length,
    pending: rows.filter(o => o.status === 'pending').length,
    paid: rows.filter(o => o.status === 'paid').length,
    completed: rows.filter(o => o.status === 'completed').length,
    cancelled: rows.filter(o => o.status === 'cancelled').length,
    amount: paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
    amountText: fmt.money(paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0))
  };
}

/* ---------------- 学习资源 ---------------- */
function learningItemView(item) {
  const row = item || {};
  return {
    id: row.id || '',
    title: row.title || '',
    merchant: row.merchant || '',
    kind: row.kind || '',
    kindName: row.kindName || '',
    subject: row.subject || '',
    category: row.category || '',
    description: row.description || '',
    price: Number(row.price) || 0,
    priceText: fmt.money(row.price),
    unit: row.unit || '',
    location: row.location || '',
    icon: row.icon || '📚',
    tone: row.tone || 'mint',
    packages: Number(row.packages) || 0,
    institution: row.institution || {}
  };
}

/* ---------------- 高考 ---------------- */
function universityView(row) {
  const u = row || {};
  return {
    id: u.id || '',
    name: u.name || '',
    province: u.province || '',
    city: u.city || '',
    tier: u.tier || '',
    type: u.type || '',
    alliance: Array.isArray(u.alliance) ? u.alliance : [],
    alumniRank: u.alumniRank || '',
    line: u.line == null ? '' : u.line,
    rank: u.rank == null ? '' : u.rank,
    majorsCount: u.majorsCount || 0,
    diff: u.diff == null ? null : u.diff,
    probability: u.probability == null ? null : u.probability
  };
}

/* 志愿表行（本地清单，按账号保存） */
function admissionRowView(row) {
  const r = row || {};
  return {
    key: r.key || (r.id + '|' + (r.major || '')),
    id: r.id || '',
    name: r.name || '',
    major: r.major || '',
    line: r.line == null ? '' : r.line,
    probability: r.probability == null ? null : r.probability,
    note: r.note || ''
  };
}

/* ---------------- 备考 ---------------- */
function examItemView(row) {
  const r = row || {};
  return {
    id: r.id || '',
    kind: r.kind || '',
    org: r.org || '',
    title: r.title || '',
    region: r.region || '',
    city: r.city || '',
    category: r.category || '',
    examType: r.examType || '',
    quota: r.quota || 0,
    applicants: r.applicants || 0,
    ratio: r.ratio == null ? '' : r.ratio,
    heat: r.heat || '',
    line: r.line == null ? '' : r.line,
    requirements: r.requirements || {},
    diff: r.diff == null ? null : r.diff,
    probability: r.probability == null ? null : r.probability
  };
}

module.exports = {
  TYPES,
  listView, matchesKeyword, filterServices,
  imageView, packageView, tutorView, busView, merchantView, detailView,
  busStartOptions, busEndOptions, availabilityView,
  sessionKey, addSession, removeSession,
  sessionText, orderView, orderStats,
  learningItemView, universityView, admissionRowView, examItemView,
  COURSE_SECTIONS, TUTOR_SECTIONS, BUS_SECTIONS, FEATURED_GROUPS,
  sectionOf, sectionsFor, scoreOf, featuredGroups,
  starList, tutorBrief, pickupBrief, busSection
};

};
__mods["miniprogram/utils/mock.js"] = function (module, exports, require) {
/* ------------------------------------------------------------------ *
 * 学鹭伴学 · 本地模拟后端
 *
 * 还没有部署云开发时，小程序用这套模块跑完整业务：数据存在本地存储，
 * 行为与 cloudfunctions/ 下的云函数逐一对应（同样的校验、同样的状态机）。
 * 配置好云开发后，把 utils/config.js 的 USE_CLOUD 改成 true，
 * 所有调用会自动切换到真实云函数，本模块不再参与。
 *
 * 覆盖：账号会话 / 服务目录 / 订单 / 入驻申请 / 机构 / 档案 / 反馈 /
 *       学习资源 / 高考志愿 / 考公考研考编 / 清单 / 定位
 * ------------------------------------------------------------------ */

const seed = require("miniprogram/utils/seed-data.js");
const lib = require("miniprogram/utils/institution-lib.js");
const gk = require("miniprogram/utils/gaokao-model.js");
const plan = require("miniprogram/utils/plan-model.js");
const ex = require("miniprogram/utils/exam-model.js");
const assistantData = require("miniprogram/utils/assistant-data.js");
const config = require("miniprogram/utils/config.js");

const DB_KEY = config.STORAGE_PREFIX + 'mockdb';
const OPENID_KEY = config.STORAGE_PREFIX + 'openid';

/* 种子数据版本：改动 seed-data.js 的内容后 +1，
 * 老用户本地缓存里的内置服务会按最新代码重建，订单 / 档案等用户数据保留。 */
const SEED_REV = 20261028;

/* ---------------- 本地数据库 ---------------- */
function freshDB() {
  return {
    seedRev: SEED_REV,
    users: [],
    sessions: [],
    services: seed.SEED_SERVICES.map(s => Object.assign({}, s, { builtin: true })),
    orders: [],
    applications: [],
    institutions: [],
    profiles: {},
    uploads: [],
    feedback: [],
    lists: {},
    plans: {}
  };
}

let cache = null;

function db() {
  if (cache) return cache;
  let raw = '';
  try { raw = wx.getStorageSync(DB_KEY) || ''; } catch (e) { raw = ''; }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      cache = Object.assign(freshDB(), parsed);
      if (Number(parsed.seedRev || 0) < SEED_REV) {
        /* 种子内容升级：内置服务按最新代码重建，保留用户自建的服务 */
        const custom = (cache.services || []).filter(x => x && !x.builtin);
        cache.services = seed.SEED_SERVICES.map(s => Object.assign({}, s, { builtin: true })).concat(custom);
        cache.seedRev = SEED_REV;
        save();
        return cache;
      }
      /* 种子补齐：升级后新增的种子服务也进来 */
      for (const s of seed.SEED_SERVICES) {
        if (!cache.services.some(x => x.id === s.id)) cache.services.push(Object.assign({}, s, { builtin: true }));
      }
      return cache;
    } catch (e) { /* 数据损坏时重建 */ }
  }
  cache = freshDB();
  save();
  return cache;
}

function save() {
  try { wx.setStorageSync(DB_KEY, JSON.stringify(cache)); } catch (e) { /* 存储不可用 */ }
}

function mutate(fn) {
  const result = fn();
  save();
  return result;
}

function openid() {
  let id = '';
  try { id = wx.getStorageSync(OPENID_KEY) || ''; } catch (e) { id = ''; }
  if (!id) {
    id = 'mock-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { wx.setStorageSync(OPENID_KEY, id); } catch (e) { /* ignore */ }
  }
  return id;
}

function newId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

/* ---------------- 返回结构（与云函数一致） ---------------- */
function ok(data) { return { code: 0, data: data === undefined ? null : data }; }
function fail(message, code, needLogin) {
  return needLogin ? { code: code || 400, message: message, needLogin: true } : { code: code || 400, message: message };
}
function bad(message, code, needLogin) {
  throw Object.assign(new Error(message), { name: 'BizError', code: code || 400, needLogin: !!needLogin });
}
/* 会话类错误：带 needLogin 标记，客户端只在这种情况清本地令牌 */
function unauthorized(message) { bad(message || '请先登录', 401, true); }

/* ---------------- 口令（本地模拟用轻量加盐散列；云开发模式用 scrypt） ---------------- */
function mockHash(password, salt) {
  let h1 = 0x811c9dc5 >>> 0;
  const input = salt + '|' + password;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      h1 ^= input.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    h1 = (h1 + round) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8);
}
function hashPassword(password) {
  const salt = Math.random().toString(36).slice(2, 10);
  return salt + ':' + mockHash(password, salt);
}
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const idx = stored.indexOf(':');
  if (idx <= 0) return false;
  return mockHash(password, stored.slice(0, idx)) === stored.slice(idx + 1);
}

/* ---------------- 会话 ---------------- */
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function issueSession(userId) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
  db().sessions.push({ token, userId, expireAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function resolveUser(event) {
  const token = typeof event.token === 'string' ? event.token : '';
  if (!token) unauthorized('请先登录');
  const store = db();
  const session = store.sessions.find(s => s.token === token);
  if (!session) unauthorized('登录已过期，请重新登录');
  if (!session.expireAt || session.expireAt < Date.now()) {
    store.sessions = store.sessions.filter(s => s.token !== token);
    unauthorized('登录已过期，请重新登录');
  }
  session.expireAt = Date.now() + SESSION_TTL_MS;
  const user = store.users.find(u => u._id === session.userId);
  if (!user) unauthorized('账号不存在，请重新登录');
  return user;
}

/* 升学规划允许游客使用：未登录时按本机 openid 存，登录后随账号走 */
function planKey(event) {
  const token = typeof event.token === 'string' ? event.token : '';
  if (token) {
    const store = db();
    const session = store.sessions.find(s => s.token === token);
    if (session && (!session.expireAt || session.expireAt >= Date.now())) {
      const user = store.users.find(u => u._id === session.userId);
      if (user) return user._id;
    }
  }
  return 'guest:' + openid();
}

/* 平台管理员：令牌与 config.ADMIN_TOKEN 一致即可 */
function isAdmin(event) {
  const configured = typeof config.ADMIN_TOKEN === 'string' ? config.ADMIN_TOKEN.trim() : '';
  const supplied = typeof (event && event.adminToken) === 'string' ? event.adminToken : '';
  return !!configured && supplied === configured;
}

/* ---------------- 机构归属 ---------------- */
function applicationTypeOfRole(role) {
  return role === 'institution' ? '机构' : role === 'tutor' ? '伴学' : null;
}
function roleMatchesApplication(user, application) {
  if (!user || !application) return false;
  /* 私家车入驻面向所有登录用户（须是接送自家孩子的家长） */
  if (application.type === '接送') return application.role === user.role;
  return application.type === applicationTypeOfRole(user.role) && application.role === user.role;
}
function mineApplications(user) {
  if (!user) return [];
  return db().applications.filter(a => roleMatchesApplication(user, a));
}
function latestApplication(user) {
  const list = mineApplications(user);
  if (!list.length) return null;
  const rank = a => (a.status === 'approved' ? 2 : a.status === 'pending' ? 1 : 0);
  return list.slice().sort((a, b) => rank(b) - rank(a) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
}
function institutionIdOfUser(user) {
  if (!user || user.role !== 'institution') return null;
  const hit = mineApplications(user).find(a => a.status === 'approved' && roleMatchesApplication(user, a));
  if (!hit) return null;
  return hit.institutionId || lib.institutionId(hit.institutionName || hit.name);
}
function approvedInstitutions() {
  return db().applications
    .filter(a => a.status === 'approved' && a.type === '机构' && a.institutionId)
    .map(a => ({
      id: a.institutionId,
      name: a.institutionName || a.name,
      contact: a.contact || '',
      phone: a.phone || '',
      audience: Array.isArray(a.audience) ? a.audience.slice() : null,
      approvedAt: a.approvedAt || a.createdAt || null
    }));
}
function institutionBinding(user) {
  if (!user || user.role !== 'institution') return null;
  const application = latestApplication(user);
  if (!application || application.status !== 'approved') return null;
  const boundId = institutionIdOfUser(user);
  if (!boundId) return null;
  return { institutionId: boundId, name: application.institutionName || application.name };
}

/* ---------------- 日期 ---------------- */
const WEEKDAYS = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0 };
const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function cnToday() {
  const now = new Date();
  const cn = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const pad = n => String(n).padStart(2, '0');
  return cn.getFullYear() + '-' + pad(cn.getMonth() + 1) + '-' + pad(cn.getDate());
}
function weekdayOf(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); }
function weekdayLabel(date) { return WEEKDAY_LABEL[weekdayOf(date)]; }
function slotWeekday(slot) {
  const m = /^(周[一二三四五六日])\s*/.exec(typeof slot === 'string' ? slot : '');
  return m ? m[1] : null;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/* ---------------- 服务目录 ---------------- */
const TUTOR_SLOTS = seed.TUTOR_SLOTS;

function catalog() {
  const map = new Map(seed.SEED_SERVICES.map(s => [s.id, lib.clone(s)]));
  for (const custom of db().services) {
    if (!custom || typeof custom.id !== 'string') continue;
    if (map.has(custom.id)) map.set(custom.id, Object.assign({}, map.get(custom.id), lib.clone(custom)));
    else map.set(custom.id, Object.assign({}, lib.clone(custom), { builtin: false }));
  }
  return [...map.values()];
}
function findService(list, id) { return (Array.isArray(list) ? list : []).find(s => s.id === id) || null; }
function serviceSlots(s) {
  return Array.isArray(s && s.calendar && s.calendar.slots) ? s.calendar.slots : (s && s.type === 'tutor' ? [...TUTOR_SLOTS] : []);
}
function institutionsOf(services) {
  return lib.buildInstitutions(services, db().institutions, approvedInstitutions());
}
function soldCounts() {
  const counts = {};
  for (const o of db().orders) {
    if (['paid', 'completed'].includes(o.status)) counts[o.serviceId] = (counts[o.serviceId] || 0) + 1;
  }
  return counts;
}
function decorate(s, institutions, sold) {
  const used = sold[s.id] || 0;
  let out = Object.assign({}, s, { remaining: Number(s.remaining || 0) - used });
  if (s.type === 'tutor' && !out.calendar) {
    out.calendar = { mode: 'slot', slotDurationMinutes: 60, slots: [...TUTOR_SLOTS], note: '仅开放固定时段，暂不支持指定日期。' };
  }
  if (s.type === 'bus' && !out.busDetail && Array.isArray(out.routes)) {
    out.busDetail = { driver: out.driver, plate: out.plate, period: out.period, routes: out.routes };
  }
  if (!out.images) out.images = [];
  if (out.type === 'course') {
    out.packages = Array.isArray(out.packages) ? out.packages : [];
    /* 服务人群跟随所属机构，未设置时由前端按「家长可见」处理 */
    const owner = institutions.find(i => i.name === (out.merchant || '').trim());
    out.audience = lib.audienceOf(owner && owner.audience) || lib.audienceOf(out.audience);
  } else delete out.packages;
  out = lib.applyInstitution(out, institutions);
  if (out.type === 'course' && (!out.merchantDetail || !out.merchantDetail.name)) {
    out.merchantDetail = Object.assign({}, out.merchantDetail || {}, { name: out.merchant });
  }
  return out;
}

/* 订单占用的「日期+时段」 */
function orderSessions(o) {
  if (Array.isArray(o.sessions) && o.sessions.length) {
    return o.sessions.filter(x => x && typeof x.date === 'string' && typeof x.slot === 'string');
  }
  if (o.type === 'tutor' && o.slot) return [{ date: typeof o.date === 'string' ? o.date : '', slot: o.slot }];
  return [];
}
const isActiveOrder = o => ['paid', 'completed'].includes(o.status);

/* ---------------- 学习资源标签 ---------------- */
const LEARNING_KINDS = [
  { id: 'gwy', name: '考公', subjects: ['行政职业能力测验', '申论', '面试'] },
  { id: 'ky', name: '考研', subjects: ['政治', '英语', '数学', '专业课'] },
  { id: 'sb', name: '考编', subjects: ['公共基础知识', '职业能力测验', '综合应用能力', '面试'] },
  { id: 'zk', name: '职考技能', subjects: ['教师资格', '会计实务', '建筑工程', '社会工作', '健康管理', '人力资源', '计算机等级'] }
];
/* 机构选了「大学生」但课程没选考试方向时归到这里，课程不会因此消失 */
const OTHER_KIND = { id: 'other', name: '其他课程', subjects: ['通用课程'] };
const ALL_LEARNING_KINDS = LEARNING_KINDS.concat([OTHER_KIND]);
function validLearning(value) {
  const found = LEARNING_KINDS.find(k => k.id === (value && value.kind));
  return !!found && found.subjects.includes(value && value.subject);
}
function normalizeLearning(value) {
  if (value === undefined || value === null || value === '') return null;
  const kind = typeof value.kind === 'string' ? value.kind.trim() : '';
  const found = LEARNING_KINDS.find(k => k.id === kind);
  if (!found) bad('课程方向须为' + LEARNING_KINDS.map(k => k.name).join('、'));
  const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
  if (!found.subjects.includes(subject)) bad('请选择' + found.name + '的有效科目');
  return { kind, subject };
}
/* 学习资源：已审核机构的课程，按考试方向归类；没有方向但选了大学生人群的归「其他课程」 */
function learningResources(services, institutions, approvedNames) {
  const verified = new Set((approvedNames || []).map(n => String(n).trim()).filter(Boolean));
  /* 平台自营与种子课程随平台一起上线，视为已完成审核 */
  const official = new Set(seed.SEED_SERVICES.map(s => s.id));
  return services.flatMap(service => {
    const name = typeof service.merchant === 'string' ? service.merchant.trim() : '';
    const trusted = verified.has(name) || official.has(service.id);
    if (service.type !== 'course' || !trusted) return [];
    const institution = institutions.find(i => i.name === name) || {};
    const audience = Array.isArray(institution.audience) ? institution.audience : null;
    const learning = validLearning(service.learning)
      ? { kind: service.learning.kind, subject: service.learning.subject }
      : null;
    /* 只选了「家长」的机构课程不进入学习资源 */
    if (audience && !audience.includes('大学生')) return [];
    /* 旧数据既没人群也没方向时沿用原规则：不收录 */
    if (!learning && !audience) return [];
    const found = learning ? LEARNING_KINDS.find(k => k.id === learning.kind) : OTHER_KIND;
    return [{
      id: service.id, title: service.title, merchant: name,
      kind: found.id, kindName: found.name,
      subject: learning ? learning.subject : OTHER_KIND.subjects[0],
      category: service.category || '', description: service.description || '',
      price: service.price, unit: service.unit, location: service.location || '',
      icon: service.icon || '📚', tone: service.tone || 'mint',
      packages: Array.isArray(service.packages) ? service.packages.length : 0,
      institution: { name, address: institution.address || '', intro: institution.intro || '' }
    }];
  });
}

/* ---------------- 入参校验 ---------------- */
const PHONE_RE = /^1\d{10}$/;
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function requirePhone(value, label) {
  const v = text(value, 20);
  if (!PHONE_RE.test(v)) bad((label || '手机号') + '须为 11 位手机号');
  return v;
}
function requirePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) bad('密码长度须为 8–128 位');
  return value;
}
function requireRole(value) {
  const v = text(value, 20);
  if (!['parent', 'tutor', 'institution'].includes(v)) bad('请选择有效的账号类型：家长 / 大学生 / 机构');
  return v;
}

/* ---------------- 服务补丁校验（与云函数一致） ---------------- */
const TONES = ['peach', 'lavender', 'mint'];
const TYPES = ['course', 'tutor', 'bus'];
const SERVICE_EDITABLE = ['title', 'merchant', 'category', 'price', 'unit', 'icon', 'tone', 'tag', 'description', 'location', 'city', 'remaining'];
const PERIODS = ['月付', '学期付', '季付'];
const BUS_PERIOD = '月付';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLOT_MAX = 30, SLOT_TEXT_MAX = 60, SLOT_DURATION = 60, SESSION_MAX = 20;
const timeToMinutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function validImages(v) {
  return Array.isArray(v) && v.length <= 8 && v.every(i => i && typeof i === 'object' &&
    text(i.name, 60) && ['banner', 'photo', 'icon'].includes(i.kind || 'photo') &&
    (!i.caption || text(i.caption, 120).length <= 120));
}
function validateCalendar(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('排期格式不正确');
  for (const key of Object.keys(input)) {
    if (!['slots', 'mode', 'slotDurationMinutes'].includes(key)) bad('不支持的排期字段：' + key);
  }
  if (!Array.isArray(input.slots)) bad('排期时段须为字符串数组');
  if (input.slots.length < 1) bad('至少需要 1 个可约时段');
  if (input.slots.length > SLOT_MAX) bad('可约时段最多 ' + SLOT_MAX + ' 条');
  const slots = [];
  const seen = new Set();
  for (const raw of input.slots) {
    if (typeof raw !== 'string') bad('排期时段须为字符串');
    if (!raw || raw.length > SLOT_TEXT_MAX || raw.trim() !== raw) bad('时段不能为空、不含首尾空格，且每条最多 ' + SLOT_TEXT_MAX + ' 字');
    if (seen.has(raw)) bad('可约时段不能重复：' + raw);
    seen.add(raw);
    slots.push(raw);
  }
  if (input.mode !== undefined && input.mode !== 'slot') bad('排期模式仅支持固定时段（slot）');
  if (input.slotDurationMinutes !== undefined && Number(input.slotDurationMinutes) !== SLOT_DURATION) {
    bad('当前仅支持 ' + SLOT_DURATION + ' 分钟时长的时段');
  }
  return { mode: 'slot', slotDurationMinutes: SLOT_DURATION, slots };
}
function normalizeServicePatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('服务内容格式不正确');
  const allowed = new Set([...SERVICE_EDITABLE, 'type', 'tutorDetail', 'busDetail', 'pickupDetail', 'images', 'merchantDetail', 'calendar', 'packages', 'learning']);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) bad('不支持的字段：' + key);
  const out = {};
  if (raw.type !== undefined && !TYPES.includes(raw.type)) bad('请选择有效的服务类型');
  for (const key of SERVICE_EDITABLE) {
    if (raw[key] === undefined) continue;
    if (key === 'price') {
      const n = Number(raw[key]);
      if (!Number.isFinite(n) || n <= 0 || n > 100000) bad('价格须为 0.01–100000 元');
      out.price = Math.round(n * 100) / 100;
      continue;
    }
    if (key === 'remaining') {
      const n = Number(raw[key]);
      if (!Number.isInteger(n) || n < 0 || n > 10000) bad('名额须为 0–10000 的整数');
      out.remaining = n;
      continue;
    }
    if (key === 'tone') { if (!TONES.includes(raw.tone)) bad('请选择有效的配色'); out.tone = raw.tone; continue; }
    if (key === 'icon') { const v = text(raw.icon, 4); if (!v) bad('请填写图标'); out.icon = v; continue; }
    const max = key === 'description' ? 1000 : key === 'title' ? 40 : key === 'city' ? 20 : 100;
    const v = text(raw[key], max);
    if (!v) bad('请填写' + key);
    out[key] = v;
  }
  if (raw.images !== undefined) {
    if (!validImages(raw.images)) bad('图片来源必须是 name + kind + tone/caption 的对象数组，最多 8 条');
    out.images = raw.images.map(i => ({
      name: text(i.name, 60), kind: i.kind || 'photo',
      tone: TONES.includes(i.tone) ? i.tone : 'peach', caption: text(i.caption, 120)
    }));
  }
  if (raw.learning !== undefined) out.learning = normalizeLearning(raw.learning);
  if (raw.tutorDetail !== undefined) {
    const t = raw.tutorDetail;
    if (!t || typeof t !== 'object' || Array.isArray(t)) bad('伴学资料格式不正确');
    const td = {};
    for (const key of ['name', 'school', 'major', 'education', 'experience', 'intro', 'certificate', 'grades']) {
      if (t[key] === undefined) continue;
      const v = text(t[key], 100);
      if (!v) bad('伴学资料字段不能为空：' + key);
      td[key] = v;
    }
    for (const key of ['subjects', 'methods']) {
      if (t[key] === undefined) continue;
      if (!Array.isArray(t[key]) || t[key].length > 10) bad('伴学' + key + '须为数组，最多 10 项');
      const list = t[key].map(x => text(x, 30));
      if (list.some(x => !x)) bad('伴学' + key + '不能包含空值');
      td[key] = list;
    }
    if (t.rating !== undefined) {
      const r = t.rating;
      if (!r || typeof r !== 'object' || Array.isArray(r)) bad('伴学星级格式不正确');
      const score = Number(r.score);
      const count = Number(r.count);
      if (!Number.isFinite(score) || score < 0 || score > 5) bad('伴学星级须为 0–5');
      if (r.count !== undefined && (!Number.isInteger(count) || count < 0 || count > 100000)) bad('评价数须为非负整数');
      td.rating = { score: Math.round(score * 10) / 10, count: Number.isInteger(count) ? count : 0 };
    }
    out.tutorDetail = td;
  }
  if (raw.busDetail !== undefined) {
    const bd = raw.busDetail;
    if (!bd || typeof bd !== 'object' || Array.isArray(bd)) bad('校车资料格式不正确');
    const out2 = {};
    for (const key of ['driver', 'plate', 'vehicle', 'phone']) {
      if (bd[key] === undefined) continue;
      const v = text(bd[key], 60);
      if (!v) bad('校车资料字段不能为空：' + key);
      out2[key] = v;
    }
    if (bd.period !== undefined) {
      if (!Array.isArray(bd.period) || !bd.period.length || bd.period.length > 5) bad('订购周期须为 1–5 项数组');
      const list = bd.period.map(x => text(x, 10));
      if (list.some(x => !PERIODS.includes(x))) bad('订购周期只能为：' + PERIODS.join('、'));
      if (list.some(x => x !== BUS_PERIOD)) bad('当前仅支持月付计价，订购周期不能包含学期付或季付');
      out2.period = [...new Set(list)];
    }
    if (bd.routes !== undefined) {
      if (!Array.isArray(bd.routes) || bd.routes.length < 2 || bd.routes.length > 20) bad('线路须为 2–20 个站点');
      const stationOf = new Map();
      const routes = bd.routes.map(r => {
        if (!r || typeof r !== 'object') bad('站点格式不正确');
        const name = text(r.name, 40), arrival = text(r.arrival, 5), departure = text(r.departure, 5);
        if (!name) bad('站点名称不能为空');
        if (stationOf.has(name)) bad('站点名称重复：' + name);
        if (!TIME.test(arrival) || !TIME.test(departure)) bad('站点到达/出发时间须为 HH:mm');
        if (timeToMinutes(departure) < timeToMinutes(arrival)) bad('站点出发时间不能早于到达时间：' + name);
        for (const prev of stationOf.values()) {
          if (timeToMinutes(arrival) < timeToMinutes(prev.departure)) bad('站点到达时间不能早于上一站出发时间：' + name);
        }
        stationOf.set(name, { arrival, departure });
        return { name, arrival, departure };
      });
      out2.routes = routes;
    }
    out.busDetail = out2;
  }
  if (raw.pickupDetail !== undefined) {
    const pd = raw.pickupDetail;
    if (!pd || typeof pd !== 'object' || Array.isArray(pd)) bad('帮忙接资料格式不正确');
    const out3 = {};
    for (const key of ['person', 'gender', 'area', 'school', 'childGrade', 'schoolGate', 'timeText', 'vehicle', 'credit', 'note']) {
      if (pd[key] === undefined) continue;
      out3[key] = text(pd[key], 120);
    }
    if (pd.kind !== undefined) {
      if (pd.kind !== 'car' && pd.kind !== 'pickup') bad('帮忙接类型不正确');
      out3.kind = pd.kind;
    }
    if (!out3.person) bad('请填写接送人姓名');
    for (const [key, min, max] of [['years', 0, 60], ['seat', 1, 6], ['used', 0, 6]]) {
      if (pd[key] === undefined) continue;
      const n = Number(pd[key]);
      if (!Number.isInteger(n) || n < min || n > max) bad('帮忙接人数须为 ' + min + '–' + max + ' 的整数');
      out3[key] = n;
    }
    if (out3.used !== undefined && out3.seat !== undefined && out3.used > out3.seat) bad('已接人数不能超过可接人数');
    if (pd.idChecked !== undefined) out3.idChecked = !!pd.idChecked;
    if (pd.routes !== undefined) {
      if (!Array.isArray(pd.routes) || pd.routes.length < 2 || pd.routes.length > 6) bad('帮忙接的接送点须为 2–6 个');
      out3.routes = pd.routes.map(r => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) bad('接送点格式不正确');
        const name = text(r.name, 40);
        if (!name) bad('接送点名称不能为空');
        return { name: name, arrival: text(r.arrival, 5), departure: text(r.departure, 5) };
      });
    }
    out.pickupDetail = out3;
  }
  if (raw.merchantDetail !== undefined) {
    const md = raw.merchantDetail;
    if (!md || typeof md !== 'object' || Array.isArray(md)) bad('机构资料格式不正确');
    const info = {};
    for (const key of ['name', 'logo', 'intro', 'address', 'contact', 'phone']) {
      if (md[key] === undefined) continue;
      const v = text(md[key], key === 'intro' ? 500 : 100);
      if (!v) bad('机构资料字段不能为空：' + key);
      info[key] = v;
    }
    if (md.foundYear !== undefined) {
      const y = Number(md.foundYear);
      if (!Number.isInteger(y) || y < 1900 || y > 2100) bad('成立年份不合法');
      info.foundYear = y;
    }
    if (md.verified !== undefined) {
      if (typeof md.verified !== 'boolean') bad('认证状态须为布尔值');
      info.verified = md.verified;
    }
    for (const key of ['licenses', 'teachers']) {
      if (md[key] === undefined) continue;
      if (!Array.isArray(md[key]) || md[key].length > 20) bad('机构' + key + '须为数组，最多 20 项');
      const list = md[key].map(x => text(x, 100));
      if (list.some(x => !x)) bad('机构' + key + '不能包含空值');
      info[key] = list;
    }
    out.merchantDetail = info;
  }
  if (raw.calendar !== undefined) out.calendar = validateCalendar(raw.calendar);
  if (raw.packages !== undefined) out.packages = lib.normalizePackages(raw.packages);
  return out;
}
function mergeDetail(prev, patch) {
  const seen = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  if (!patch || typeof patch !== 'object' || !Object.keys(patch).length) return seen;
  const out = Object.assign({}, seen);
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof seen[k] === 'object' && seen[k] !== null && !Array.isArray(seen[k])) {
      out[k] = Object.assign({}, seen[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
function mergedCalendar(prev, input) {
  const seen = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  const out = Object.assign({}, seen);
  if (Array.isArray(seen.slots)) out.slots = [...seen.slots];
  out.mode = input.mode || seen.mode || 'slot';
  if (Number(input.slotDurationMinutes) === SLOT_DURATION) out.slotDurationMinutes = SLOT_DURATION;
  else if (seen.slotDurationMinutes !== undefined) out.slotDurationMinutes = seen.slotDurationMinutes;
  if (input.slots !== undefined) out.slots = [...input.slots];
  if (out.note === undefined) out.note = '仅开放固定时段，暂不支持指定日期。';
  return out;
}
function cloudVideoIds(packages) {
  const ids = [];
  for (const item of Array.isArray(packages) ? packages : []) {
    if (item && typeof item.videoUrl === 'string' && item.videoUrl.startsWith('cloud://')) ids.push(item.videoUrl);
  }
  return ids;
}

/* 剥掉信封字段（token/action/id），剩下的才是业务补丁 */
function strip(event) {
  const out = {};
  for (const [k, v] of Object.entries(event || {})) {
    if (k === 'token' || k === 'action' || k === 'id') continue;
    out[k] = v;
  }
  return out;
}

/* ---------------- 订单校验 ---------------- */
const RELATIONS = ['父亲', '母亲', '家长', '祖父母', '其他监护人'];
const GENDERS = ['男', '女', '未填写'];

function validateExtra(s, b) {
  const out = {};
  const guardian = text(b.guardian, 30);
  if (guardian) out.guardian = guardian;
  const relation = text(b.relation, 20);
  if (relation) {
    if (!RELATIONS.includes(relation)) bad('请选择有效的监护人关系');
    out.relation = relation;
  }
  const phone = text(b.guardianPhone, 20);
  if (phone) {
    if (!PHONE_RE.test(phone)) bad('监护人手机号格式不正确');
    out.guardianPhone = phone;
  }
  if (b.age !== undefined && b.age !== null && b.age !== '') {
    const n = Number(b.age);
    if (!Number.isInteger(n) || n < 1 || n > 99) bad('学员年龄须为 1–99 的整数');
    out.age = n;
  }
  const gender = text(b.gender, 10);
  if (gender) {
    if (!GENDERS.includes(gender)) bad('请选择有效的性别');
    out.gender = gender;
  }
  const address = text(b.address, 200);
  if (address) out.address = address;
  if (s.type === 'bus') {
    const route = (s.busDetail && s.busDetail.routes) || s.routes || [];
    const start = text(b.startPoint, 60), end = text(b.endPoint, 60);
    if (start || end) {
      if (!start || !end) bad('请同时选择上车站点和下车站点');
      const names = route.map(r => r.name);
      const i = names.indexOf(start), j = names.indexOf(end);
      if (i < 0) bad('上车站点不在该线路内');
      if (j < 0) bad('下车站点不在该线路内');
      if (j <= i) bad('下车站点必须位于上车站点之后');
      out.startPoint = start;
      out.endPoint = end;
    }
    const period = text(b.period, 10);
    if (period) {
      if (!PERIODS.includes(period)) bad('请选择有效的订购周期');
      if (period !== BUS_PERIOD) bad('当前仅支持月付计价，暂不支持学期付/季付');
      const allowed = (s.busDetail && s.busDetail.period) || s.period || PERIODS;
      if (!allowed.includes(period)) bad('该线路不支持所选订购周期');
      out.period = period;
    }
  }
  if (s.type === 'course') {
    const date = text(b.date, 10);
    if (date) {
      if (!validDate(date)) bad('请选择有效的上课日期');
      out.date = date;
    }
  }
  if (s.type === 'tutor') {
    const date = text(b.date, 10);
    if (date) {
      if (!validDate(date)) bad('请选择有效的预约日期');
      out.date = date;
      out.dateStatus = 'requested';
    }
  }
  return out;
}

function validateSessions(s, input) {
  if (!Array.isArray(input)) bad('预约时段须为数组');
  if (input.length < 1) bad('请至少选择 1 个预约时段');
  if (input.length > SESSION_MAX) bad('一次最多预约 ' + SESSION_MAX + ' 个时段');
  const available = serviceSlots(s);
  const today = cnToday();
  const seen = new Set();
  const sessions = input.map((raw, index) => {
    const at = '第 ' + (index + 1) + ' 个预约时段';
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad(at + '格式不正确');
    for (const key of Object.keys(raw)) if (!['date', 'slot'].includes(key)) bad(at + '不支持字段：' + key);
    const date = text(raw.date, 10), slot = typeof raw.slot === 'string' ? raw.slot : '';
    if (!validDate(date)) bad(at + '的日期格式应为 YYYY-MM-DD 且真实存在');
    if (date < today) bad(at + '的日期已过，请选择今天或之后的日期');
    if (!slot) bad(at + '缺少时段');
    if (!available.includes(slot)) bad('请选择有效的预约时段');
    const weekday = slotWeekday(slot);
    if (!weekday) bad('该时段未配置星期，暂不支持按日期预约：' + slot);
    if (WEEKDAYS[weekday] !== weekdayOf(date)) bad(at + '的日期 ' + date + ' 是' + weekdayLabel(date) + '，与时段「' + slot + '」不一致');
    const key = date + '|' + slot;
    if (seen.has(key)) bad('预约时段重复：' + date + ' ' + slot);
    seen.add(key);
    return { date, slot };
  });
  sessions.sort((a, b) => (a.date === b.date
    ? serviceSlots(s).indexOf(a.slot) - serviceSlots(s).indexOf(b.slot)
    : a.date < b.date ? -1 : 1));
  return sessions;
}

/* ---------------- 各云函数的模拟实现 ---------------- */
/* ---------------- 升学规划：档案与元数据 ---------------- */
const PLAN_META = {
  grades: plan.GRADES,
  provinces: plan.PROVINCES.map(p => p.name),
  firstSubjects: plan.FIRST_SUBJECTS,
  secondSubjects: plan.SECOND_SUBJECTS,
  tiers: plan.TARGET_TIERS,
  interests: plan.INTERESTS
};

/* 已存档案与默认值合并，脏数据（比如旧版本字段）不会让页面崩掉 */
function planProfileOf(record) {
  const base = plan.defaultProfile();
  const saved = record && record.profile && typeof record.profile === 'object' ? record.profile : {};
  const merged = Object.assign({}, base, saved);
  if (!plan.isGrade(merged.grade)) merged.grade = base.grade;
  if (!plan.isProvinceName(merged.province)) merged.province = base.province;
  if (!plan.FIRST_SUBJECTS.includes(merged.first)) merged.first = base.first;
  if (!Array.isArray(merged.second) || merged.second.length !== 2) merged.second = base.second;
  if (!plan.TARGET_TIERS.includes(merged.targetTier)) merged.targetTier = base.targetTier;
  if (!Array.isArray(merged.interest) || !merged.interest.length) merged.interest = base.interest;
  return merged;
}

const handlers = {

  /* ---------- 账号 ---------- */
  auth(event) {
    const action = event.action;
    const store = db();
    if (action === 'wxLogin') {
      const user = store.users.find(u => u.openid === openid());
      if (!user) return ok({ authenticated: false, needLogin: true });
      return ok({
        authenticated: true,
        user: publicUser(user),
        token: issueSession(user._id),
        application: applicationBrief(user),
        institutionId: institutionIdOfUser(user)
      });
    }
    if (action === 'register') {
      const phone = requirePhone(event.phone, '手机号');
      const password = requirePassword(event.password);
      const role = requireRole(event.role);
      if (store.users.some(u => u.phone === phone)) return fail('该手机号已注册，请直接登录', 409);
      const id = newId('u');
      const user = {
        _id: id, phone, role, openid: openid(),
        passwordHash: hashPassword(password), createdAt: new Date().toISOString()
      };
      return mutate(() => {
        store.users.push(user);
        return ok({ user: publicUser(user), token: issueSession(id) });
      });
    }
    if (action === 'login') {
      const phone = requirePhone(event.phone, '手机号');
      const password = typeof event.password === 'string' ? event.password : '';
      const user = store.users.find(u => u.phone === phone);
      const pass = user ? verifyPassword(password, user.passwordHash) : false;
      if (!pass) return fail('手机号或密码不正确', 401);
      if (openid() && user.openid !== openid()) user.openid = openid();
      return mutate(() => ok({
        user: publicUser(user),
        token: issueSession(user._id),
        application: applicationBrief(user),
        institutionId: institutionIdOfUser(user)
      }));
    }
    if (action === 'me') {
      const user = resolveUser(event);
      return ok({
        authenticated: true,
        user: publicUser(user),
        application: applicationBrief(user),
        institutionId: institutionIdOfUser(user)
      });
    }
    if (action === 'logout') {
      const token = typeof event.token === 'string' ? event.token : '';
      store.sessions = store.sessions.filter(s => s.token !== token);
      save();
      return ok({ ok: true });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 服务目录 ---------- */
  services(event) {
    const action = event.action;
    if (action === 'list') {
      const list = catalog();
      const institutions = institutionsOf(list);
      const sold = soldCounts();
      const decorated = list.map(s => decorate(s, institutions, sold));
      const type = text(event.type, 10);
      return ok(type ? decorated.filter(s => s.type === type) : decorated);
    }
    if (action === 'availability') {
      const id = text(event.id, 64);
      const s = findService(catalog(), id);
      if (!s) bad('服务不存在', 404);
      if (s.type !== 'tutor') bad('仅伴学服务支持按日期查询可约时段');
      const date = text(event.date, 10);
      if (!date) bad('请提供查询日期 date=YYYY-MM-DD');
      if (!validDate(date)) bad('日期格式应为 YYYY-MM-DD 且真实存在');
      const weekday = weekdayLabel(date);
      const taken = new Set();
      for (const o of db().orders) {
        if (o.serviceId !== id || !isActiveOrder(o)) continue;
        for (const item of orderSessions(o)) if (item.date === date) taken.add(item.slot);
      }
      const slots = serviceSlots(s).filter(slot => slotWeekday(slot) === weekday);
      return ok({ date, slots: slots.map(slot => ({ slot, available: !taken.has(slot) })) });
    }
    if (action === 'create' || action === 'update') {
      const user = resolveUser(event);
      const binding = institutionBinding(user);
      if (!binding) bad('仅已审核通过的机构账号可以发布或修改课程', 403);
      const raw = strip(event);
      if (action === 'create') {
        if (!TYPES.includes(raw.type)) bad('请选择有效的服务类型');
        if (raw.type !== 'course' && raw.packages !== undefined) bad('仅课程服务支持套餐');
        if (raw.type !== 'course') bad('机构账号只能发布课程', 403);
      }
      const patch = normalizeServicePatch(raw);
      if (raw.merchant !== undefined && text(raw.merchant, 100) !== binding.name) bad('课程只能发布到自己机构名下', 403);
      patch.merchant = binding.name;
      if (action === 'create') {
        for (const key of ['title', 'merchant', 'category', 'price', 'unit']) {
          if (patch[key] === undefined && raw[key] === undefined) bad('缺少字段：' + key);
        }
      }
      if (patch.packages !== undefined) {
        const allowed = new Set(db().uploads.filter(u => u.institutionId === binding.institutionId).map(u => u.fileID));
        for (const fileID of cloudVideoIds(patch.packages)) {
          if (!allowed.has(fileID)) bad('只能引用本机构上传的课程视频', 403);
        }
      }
      const store = db();
      if (action === 'create') {
        const id = newId('svc');
        const now = new Date().toISOString();
        const doc = Object.assign({}, patch, {
          id, type: raw.type,
          icon: patch.icon || '📘', tone: patch.tone || 'peach',
          unit: patch.unit || '课时', tag: patch.tag || '自定义',
          description: patch.description || '', location: patch.location || '演示地址',
          city: patch.city || '哈尔滨',
          remaining: patch.remaining === undefined ? 10 : patch.remaining,
          builtin: false, createdAt: now, updatedAt: now
        });
        for (const key of ['title', 'merchant', 'category']) {
          if (!doc[key] || doc[key] === '') bad('请填写' + key);
        }
        if (doc.type === 'course' && patch.packages !== undefined) {
          doc.packages = lib.assignPackageIds(patch.packages, () => newId('pkg'));
        }
        return mutate(() => {
          store.services.push(doc);
          return ok(decoratedResult(doc));
        });
      }
      const id = text(event.id, 64);
      const current = findService(catalog(), id);
      if (!current) bad('服务不存在', 404);
      if (current.type !== 'course') bad('机构账号只能修改课程', 403);
      if (current.merchant !== binding.name) bad('只能修改自己机构名下的课程', 403);
      if (raw.merchant !== undefined && text(raw.merchant, 100) !== binding.name) bad('不能把课程转到其他机构名下', 403);
      const existing = store.services.find(s => s.id === id);
      const base = existing ? Object.assign({}, existing) : { type: current.type };
      const next = Object.assign({}, base, patch, { id, updatedAt: new Date().toISOString() });
      if (patch.images !== undefined) next.images = patch.images;
      else if (base.images === undefined && current.images !== undefined) next.images = lib.clone(current.images);
      for (const key of ['tutorDetail', 'busDetail', 'merchantDetail']) {
        if (patch[key] !== undefined) next[key] = mergeDetail(base[key] || current[key], patch[key]);
      }
      if (patch.calendar !== undefined) next.calendar = mergedCalendar(base.calendar || current.calendar, patch.calendar);
      if (patch.packages !== undefined) next.packages = lib.assignPackageIds(patch.packages, () => newId('pkg'));
      delete next.builtin;
      return mutate(() => {
        if (existing) Object.assign(existing, next);
        else store.services.push(next);
        return ok(decoratedResult(Object.assign({}, current, next)));
      });
    }
    if (action === 'tempUrl') {
      /* 本地模拟没有云存储：http(s) 地址原样返回，cloud:// 标记为不可用 */
      const fileIDs = Array.isArray(event.fileIDs) ? event.fileIDs : [];
      return ok(fileIDs.map(f => ({
        fileID: f,
        tempFileURL: /^https?:/.test(f) ? f : '',
        status: /^https?:/.test(f) ? 0 : -1
      })));
    }
    if (action === 'recordVideo') {
      const user = resolveUser(event);
      const binding = institutionBinding(user);
      if (!binding) bad('仅已审核通过的机构账号可以上传课程视频', 403);
      const fileID = text(event.fileID, 300);
      if (!fileID.startsWith('cloud://')) bad('视频文件 ID 不正确');
      const store = db();
      return mutate(() => {
        store.uploads.push({
          fileID, name: text(event.name, 200), size: Number(event.size) || 0,
          type: text(event.type, 60), institutionId: binding.institutionId,
          userId: user._id, createdAt: new Date().toISOString()
        });
        return ok({ fileID });
      });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 订单 ---------- */
  orders(event) {
    const action = event.action;
    const store = db();
    if (action === 'list') {
      /* 平台管理：管理员可查看全部订单 */
      if (event.all) {
        if (!isAdmin(event)) return fail('需要平台管理员令牌', 403);
        return ok(store.orders.slice());
      }
      const user = resolveUser(event);
      return ok(store.orders.filter(o => o.userId === user._id));
    }
    if (action === 'create') {
      const user = resolveUser(event);
      const b = event;
      const list = catalog();
      const s = findService(list, b.serviceId);
      if (!s) bad('服务不存在', 404);
      const student = text(b.student, 30), phone = text(b.phone, 20);
      if (!student || !PHONE_RE.test(phone)) bad('请填写学生姓名和有效的 11 位手机号');
      const slots = serviceSlots(s);
      const multi = b.sessions !== undefined;
      if (multi && s.type !== 'tutor') bad('仅伴学服务支持按日期多时段预约');
      if (multi && b.slot !== undefined) bad('多时段预约请通过 sessions 提交时段，不要同时传 slot');
      const sessions = multi ? validateSessions(s, b.sessions) : null;
      if (!multi && s.type === 'tutor') {
        const slot = text(b.slot, 60);
        if (!slots.includes(slot)) bad('请选择有效的预约时段');
        if (b.date !== undefined && b.date !== null && b.date !== '') {
          const weekday = slotWeekday(slot);
          if (!weekday) bad('该时段未配置星期，暂不支持按日期预约：' + slot);
          const day = text(b.date, 10);
          if (validDate(day) && day > cnToday() && WEEKDAYS[weekday] !== weekdayOf(day)) bad('预约日期与所选时段的星期不一致');
        }
      }
      const extra = validateExtra(s, b);
      let chosen = null;
      const packageId = b.packageId === undefined || b.packageId === null || b.packageId === '' ? '' : text(b.packageId, 64);
      if (packageId) {
        if (s.type !== 'course') bad('仅课程服务支持选择套餐');
        chosen = lib.findPackage(s, packageId);
        if (!chosen) bad('套餐不存在或已下架', 404);
      }
      return mutate(() => {
        const order = {
          _id: newId('o'), id: newId('o'), number: 'ED' + Date.now(),
          serviceId: s.id, title: s.title, type: s.type, student, phone,
          amount: chosen ? chosen.price : s.price, status: 'pending',
          createdAt: new Date().toISOString(), ...extra
        };
        order.userId = user._id;
        if (s.type === 'tutor') order.slotsSnapshot = [...slots];
        if (s.type === 'bus') {
          order.busPeriodSnapshot = Array.isArray(s.busDetail && s.busDetail.period)
            ? [...s.busDetail.period] : (Array.isArray(s.period) ? [...s.period] : []);
        }
        if (chosen) {
          order.packageId = chosen.id;
          order.packageSnapshot = {
            id: chosen.id, name: chosen.name, price: chosen.price,
            lessons: chosen.lessons, description: chosen.description,
            ...(chosen.videoUrl ? { videoUrl: chosen.videoUrl } : {})
          };
          order.amount = Math.round(chosen.price * 100) / 100;
        }
        if (multi) {
          order.dateStatus = 'scheduled';
          order.sessions = sessions.map(x => ({ date: x.date, slot: x.slot }));
          order.hours = sessions.length * SLOT_DURATION / 60;
          order.unitPrice = s.price;
          order.amount = Math.round(s.price * sessions.length);
          delete order.date;
        }
        store.orders.unshift(order);
        return ok(order);
      });
    }
    const orderId = text(event.id, 64);
    if (action === 'pay' || action === 'cancel' || action === 'complete') {
      /* 核销允许平台管理员代为操作，支付与取消仍限本人 */
      const adminComplete = action === 'complete' && isAdmin(event);
      const user = adminComplete ? null : resolveUser(event);
      return mutate(() => {
        const order = store.orders.find(x => x.id === orderId);
        if (!order) bad('订单不存在', 404);
        if (!adminComplete && order.userId !== user._id) bad('无权操作他人订单', 403);
        const s = findService(catalog(), order.serviceId);
        if (action === 'pay') {
          if (order.status !== 'pending') bad('仅待支付订单可以支付', 409);
          if (!s) bad('服务已下架，无法支付', 409);
          const sessions = orderSessions(order);
          if (order.type === 'tutor' && sessions.length && Array.isArray(order.slotsSnapshot)) {
            for (const item of sessions) {
              if (!order.slotsSnapshot.includes(item.slot)) bad('该预约时段已不可用，请重新选择时段下单', 409);
            }
          }
          const active = store.orders.filter(x => x.serviceId === order.serviceId && x.id !== order.id && isActiveOrder(x));
          if (s.type === 'tutor') {
            const taken = new Set();
            for (const x of active) {
              for (const item of orderSessions(x)) taken.add((item.date || '*') + '|' + item.slot);
            }
            for (const item of sessions) {
              if (taken.has((item.date || '*') + '|' + item.slot) || (!item.date && taken.has('*|' + item.slot))) {
                bad('当前名额或预约时段已售出', 409);
              }
            }
          }
          if (s.type !== 'tutor' && active.length >= Number(s.remaining || 0)) bad('当前名额或预约时段已售出', 409);
          order.status = 'paid';
          order.code = Math.random().toString(36).slice(2, 10).toUpperCase();
        }
        if (action === 'complete') {
          if (order.status !== 'paid') bad('仅已支付订单可以核销', 409);
          order.status = 'completed';
        }
        if (action === 'cancel') {
          if (order.status !== 'pending') bad('仅待支付订单可以取消', 409);
          order.status = 'cancelled';
        }
        return ok(order);
      });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 入驻申请 ---------- */
  applications(event) {
    const action = event.action;
    const store = db();
    if (action === 'submit') {
      const user = resolveUser(event);
      const b = event;
      const name = text(b.name, 60), phone = text(b.phone, 20);
      if (!name || !PHONE_RE.test(phone) || !['机构', '伴学', '校车', '接送'].includes(b.type)) bad('请完整填写入驻信息');
      const expected = applicationTypeOfRole(user.role);
      /* 私家车车主面向所有登录用户开放（必须同时接送自家孩子）；其余类型须与账号身份一致 */
      if (b.type !== '接送' && b.type !== expected) bad('申请类型与账号身份不一致', 403);
      if (phone !== user.phone) bad('申请手机号须与账号手机号一致', 403);
      if (mineApplications(user).some(a => a.status === 'pending')) bad('已有待审核的入驻申请，请等待平台审核', 409);
      /* 服务人群只对机构生效；不传按「家长」处理，兼容旧客户端 */
      const audience = b.type === '机构'
        ? (lib.normalizeAudience(b.audience) || lib.DEFAULT_AUDIENCE.slice())
        : null;
      const fields = b.type === '伴学'
        ? ['education', 'school', 'grade', 'subjects', 'resume']
        : b.type === '接送'
          ? ['area', 'school', 'childGrade', 'vehicle', 'timeText']
          : ['contact'];
      const details = {};
      if (b.type === '接送') {
        /* 私家车入驻：必须同时接送自家孩子，并同意安全承诺 */
        const seat = Number(b.seat === undefined || b.seat === null ? 0 : b.seat);
        if (!Number.isInteger(seat) || seat < 1 || seat > 6) bad('可接孩子数须为 1–6 的整数');
        details.seat = seat;
        const years = Number(b.years === undefined || b.years === null ? 0 : b.years);
        if (!Number.isInteger(years) || years < 0 || years > 60) bad('驾龄/接送年数不正确');
        details.years = years;
        if (b.safety !== true) bad('请先阅读并勾选安全承诺');
      }
      if (b.type === '校车') {
        for (const key of ['routeName', 'startPoint', 'endPoint']) {
          const v = typeof b[key] === 'string' ? b[key].trim() : '';
          if (!v || v.length > 100) bad('请填写有效的路线名称、起点和终点');
          details[key] = v;
        }
        if (!Array.isArray(b.stops) || b.stops.length > 18) bad('经停点最多 18 个');
        details.stops = b.stops.map(s => {
          const v = typeof s === 'string' ? s.trim() : '';
          if (!v || v.length > 100) bad('经停点须为 1–100 字');
          return v;
        });
        const all = [details.startPoint, ...details.stops, details.endPoint];
        if (new Set(all).size !== all.length) bad('起点、经停点和终点不能重复');
      }
      if (b.type === '伴学') {
        const fee = String(b.hourlyRate === undefined || b.hourlyRate === null ? '' : b.hourlyRate);
        if (!/^\d{1,5}(\.\d{1,2})?$/.test(fee) || Number(fee) <= 0 || Number(fee) > 10000) {
          bad('课时费须为 0.01–10000 元，最多两位小数');
        }
        details.hourlyRate = Number(fee);
        if (typeof b.photo !== 'string' || b.photo.length > 300000 ||
            !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.photo)) {
          bad('请上传有效的正脸照片');
        }
        details.photo = b.photo;
      }
      for (const field of fields) {
        const value = typeof b[field] === 'string' ? b[field].trim() : '';
        if (!value || value.length > (field === 'resume' ? 1000 : 100)) {
          bad(field === 'resume' ? '请填写 1–1000 字简历' : '请完整填写该入驻类型所需资料');
        }
        details[field] = value;
      }
      if (b.type === '伴学') {
        const gender = text(b.gender, 4);
        if (gender) {
          if (!['男', '女', '暂不填写'].includes(gender)) bad('请选择有效的性别');
          details.gender = gender;
        }
        for (const [key, max] of Object.entries({ major: 100, identity: 100, tags: 100, specialty: 100, experience: 500, address: 200, methods: 40 })) {
          if (b[key] === undefined || b[key] === '') continue;
          if (typeof b[key] !== 'string' || b[key].trim().length > max) bad('伴学补充资料格式或长度不正确');
          details[key] = b[key].trim();
        }
        if (b.birthYear !== undefined && b.birthYear !== '') {
          const year = Number(b.birthYear);
          if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) bad('出生年份不正确');
          details.birthYear = String(year);
        }
      }
      return mutate(() => {
        const application = {
          _id: newId('a'), id: newId('a'),
          userId: user._id, role: user.role,
          name, phone, type: b.type, ...details,
          status: 'pending', createdAt: new Date().toISOString()
        };
        if (audience) application.audience = audience;
        store.applications.unshift(application);
        return ok(application);
      });
    }
    if (action === 'mine') {
      const user = resolveUser(event);
      return ok(mineApplications(user));
    }
    if (action === 'list') {
      if (!isAdmin(event)) return fail('需要平台管理员令牌', 403);
      return ok(store.applications.slice());
    }
    if (action === 'approve') {
      if (!isAdmin(event)) return fail('需要平台管理员令牌', 403);
      return mutate(() => {
        const a = store.applications.find(x => x.id === text(event.id, 64));
        if (!a) bad('申请不存在', 404);
        if (a.status !== 'pending') bad('该申请已审核', 409);
        a.status = 'approved';
        a.approvedAt = new Date().toISOString();
        if (a.type === '机构') {
          a.institutionId = lib.institutionId(a.institutionName || a.name);
          a.institutionName = a.institutionName || a.name;
        }
        return ok(a);
      });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 机构 ---------- */
  institutions(event) {
    const action = event.action;
    const store = db();
    if (action === 'list') {
      const user = event.token ? resolveUser(event) : null;
      const list = catalog();
      let items = institutionsOf(list);
      if (user && user.role === 'institution') {
        const bound = institutionIdOfUser(user);
        items = items.filter(i => i.id === bound);
      } else {
        /* 机构目录属于家长端，只展示对家长开放的机构 */
        items = items.filter(i => lib.parentAudience(i.audience));
      }
      return ok(items.map(institutionView));
    }
    if (action === 'get') {
      const id = text(event.id, 64);
      const user = event.token ? resolveUser(event) : null;
      if (user && user.role === 'institution') {
        const bound = institutionIdOfUser(user);
        if (!bound) bad('账号尚未绑定机构，请先完成入驻审核', 403);
        if (bound !== id) bad('无权访问其他机构资料', 403);
      }
      const item = institutionsOf(catalog()).find(i => i.id === id);
      if (!item) bad('机构不存在', 404);
      return ok(institutionView(item));
    }
    if (action === 'detail') {
      const id = text(event.id, 64);
      const name = text(event.name, 60);
      const item = institutionsOf(catalog()).find(i =>
        (id && i.id === id) || (!id && name && i.name === name));
      if (!item) bad('机构不存在', 404);
      return ok(institutionDetailView(item, catalog()));
    }
    if (action === 'update') {
      const user = resolveUser(event);
      const binding = institutionBinding(user);
      if (!binding) bad('仅已审核通过的机构账号可以修改机构资料', 403);
      const id = text(event.id, 64);
      if (binding.institutionId !== id) bad('只能修改自己所属的机构资料', 403);
      const list = catalog();
      const current = institutionsOf(list).find(i => i.id === id);
      if (!current) bad('机构不存在', 404);
      if (event.name !== undefined && text(event.name, 60) !== current.name) bad(lib.INSTITUTION_NAME_FIXED);
      const patch = lib.normalizeInstitutionPatch(strip(event), current.name);
      return mutate(() => {
        const row = store.institutions.find(x => x.id === id);
        if (row) Object.assign(row, { name: current.name, ...patch, updatedAt: new Date().toISOString() });
        else store.institutions.push({ id, name: current.name, ...patch, updatedAt: new Date().toISOString() });
        return ok(institutionView(institutionsOf(catalog()).find(i => i.id === id)));
      });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 档案 ---------- */
  profile(event) {
    const user = resolveUser(event);
    const store = db();
    if (event.action === 'get') {
      const own = store.profiles[user._id] || emptyProfile(user.phone);
      const orders = store.orders.filter(o => o.userId === user._id).length;
      const feedback = store.feedback.filter(f => f.userId === user._id).length;
      return ok({ ...own, phone: own.phone || user.phone || '', orders, feedback });
    }
    if (event.action === 'update') {
      const allowed = new Set(['name', 'phone', 'address', 'students', 'note']);
      for (const key of Object.keys(event)) {
        if (!allowed.has(key)) continue;
      }
      const b = event;
      const base = store.profiles[user._id] || emptyProfile(user.phone);
      return mutate(() => {
        const next = { ...base };
        if (b.name !== undefined) {
          const v = text(b.name, 30);
          if (!v) bad('请填写称呼');
          next.name = v;
        }
        if (b.phone !== undefined) {
          const v = text(b.phone, 20);
          if (v && !PHONE_RE.test(v)) bad('请填写有效的 11 位手机号');
          if (v && v !== user.phone) bad('档案手机号须与账号手机号一致', 400);
          next.phone = v;
        }
        if (b.address !== undefined) {
          const v = text(b.address, 200);
          if (!v) bad('请填写地址');
          next.address = v;
        }
        if (b.note !== undefined) next.note = text(b.note, 200);
        if (b.students !== undefined) {
          if (!Array.isArray(b.students) || b.students.length > 5) bad('学员信息须为数组，最多 5 名');
          next.students = b.students.map(st => {
            if (!st || typeof st !== 'object' || Array.isArray(st)) bad('学员信息格式不正确');
            const name = text(st.name, 30);
            if (!name) bad('请填写学员姓名');
            const item = { name, age: null, gender: '未填写', guardian: '', relation: '', phone: '' };
            if (st.age !== undefined && st.age !== null && st.age !== '') {
              const n = Number(st.age);
              if (!Number.isInteger(n) || n < 1 || n > 99) bad('学员年龄须为 1–99 的整数');
              item.age = n;
            }
            if (st.gender !== undefined) {
              if (!GENDERS.includes(st.gender)) bad('请选择有效的性别');
              item.gender = st.gender;
            }
            if (st.guardian !== undefined) item.guardian = text(st.guardian, 30);
            if (st.relation !== undefined) {
              if (st.relation && !RELATIONS.includes(st.relation)) bad('请选择有效的监护人关系');
              item.relation = st.relation;
            }
            if (st.phone !== undefined) {
              const v = text(st.phone, 20);
              if (v && !PHONE_RE.test(v)) bad('学员监护人手机号格式不正确');
              item.phone = v;
            }
            return item;
          });
        }
        next.updatedAt = new Date().toISOString();
        store.profiles[user._id] = next;
        return ok(next);
      });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 意见反馈 ---------- */
  feedback(event) {
    const store = db();
    if (event.action === 'submit') {
      const user = event.token ? resolveUser(event) : null;
      const b = event;
      const categories = ['课程', '伴学', '校车', '订单', '账号', '其他'];
      const category = b.category === undefined ? '其他' : text(b.category, 10);
      if (!categories.includes(category)) bad('请选择有效的反馈类型');
      const content = text(b.content, 500);
      if (content.length < 5) bad('反馈内容请填写 5–500 字');
      const contact = text(b.contact, 60);
      if (contact && !PHONE_RE.test(contact) && !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(contact)) bad('联系方式须为手机号或邮箱');
      const orderNumber = text(b.orderNumber, 30);
      if (orderNumber && !store.orders.some(o => o.number === orderNumber)) bad('订单号不存在', 404);
      let rating = null;
      if (b.rating !== undefined && b.rating !== null && b.rating !== '') {
        const n = Number(b.rating);
        if (!Number.isInteger(n) || n < 1 || n > 5) bad('评分须为 1–5');
        rating = n;
      }
      return mutate(() => {
        const item = {
          _id: newId('f'), id: newId('f'), category, content, contact, orderNumber, rating,
          userId: user ? user._id : '', status: 'pending', reply: '',
          createdAt: new Date().toISOString()
        };
        store.feedback.unshift(item);
        return ok(item);
      });
    }
    if (event.action === 'list') {
      const user = event.token ? resolveUser(event) : null;
      if (!user) return ok([]);
      return ok(store.feedback.filter(f => f.userId === user._id));
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 学习资源 ---------- */
  learning(event) {
    const list = catalog();
    const institutions = institutionsOf(list);
    const approved = approvedInstitutions().map(a => a.name);
    const all = learningResources(list, institutions, approved);
    /* 「其他课程」只在确有这类课程时出现 */
    const kinds = all.some(i => i.kind === OTHER_KIND.id) ? ALL_LEARNING_KINDS : LEARNING_KINDS;
    const kind = text(event.kind, 10);
    const subject = text(event.subject, 30);
    let items = all;
    if (kind) items = items.filter(i => i.kind === kind);
    if (subject) items = items.filter(i => i.subject === subject);
    const chosen = kinds.find(k => k.id === kind) || kinds[0];
    return ok({
      kinds: kinds.map(row => ({ id: row.id, name: row.name, subjects: [...row.subjects] })),
      kind: chosen.id, kindName: chosen.name, subjects: [...chosen.subjects],
      subject: chosen.subjects.includes(subject) ? subject : chosen.subjects[0],
      items
    });
  },

  /* ---------- 静态内容 ---------- */
  content() {
    return ok(seed.SEED_CONTENT);
  },

  /* ---------- 高考志愿 ---------- */
  gaokao(event) {
    const action = event.action;
    if (action === 'meta') return ok(gk.meta());
    if (action === 'universities') {
      return ok(gk.listUniversities({
        province: text(event.province, 40) || undefined,
        tier: text(event.tier, 10) || undefined,
        type: text(event.type, 10) || undefined,
        alliance: text(event.alliance, 20) || undefined,
        q: text(event.q, 40),
        sort: text(event.sort, 20) || 'rank',
        page: int(event.page, 1, 9999, 1),
        size: int(event.size, 1, 60, 20),
        scoreProvince: text(event.scoreProvince, 40) || '黑龙江',
        year: int(event.year, 2016, 2025, 2025)
      }));
    }
    if (action === 'detail') {
      const uni = gk.findUniversity(text(event.id, 64));
      if (!uni) bad('院校不存在', 404);
      return ok(gk.detail(uni, text(event.province, 40) || '黑龙江', int(event.year, 2016, 2025, 2025)));
    }
    if (action === 'majorSeries') {
      const uni = gk.findUniversity(text(event.id, 64));
      if (!uni) bad('院校不存在', 404);
      const result = gk.majorSeries(uni, text(event.major, 60), text(event.province, 40) || '黑龙江');
      if (!result) bad('该院校没有这个专业', 404);
      return ok(result);
    }
    if (action === 'recommend') {
      return ok(gk.recommend({
        province: text(event.province, 40) || '黑龙江',
        score: Number(event.score),
        subject: text(event.subject, 10) || '物理',
        year: int(event.year, 2016, 2025, 2025),
        limit: int(event.limit, 1, 30, 10),
        tier: text(event.tier, 10) || undefined,
        type: text(event.type, 10) || undefined,
        alliance: text(event.alliance, 20) || undefined
      }));
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 考公 / 考研 / 考编 ---------- */
  exam(event) {
    const action = event.action;
    if (action === 'meta') return ok(ex.meta());
    if (action === 'resources') {
      const kind = text(event.kind, 10) || 'gwy';
      if (!ex.isKind(kind)) bad('考试类型不存在', 404);
      return ok(ex.resources(kind, int(event.seed, 0, 9999, 0)));
    }
    if (action === 'items') {
      const kind = text(event.kind, 10);
      if (!ex.isKind(kind)) bad('考试类型不存在', 404);
      return ok(ex.listItems({
        kind,
        region: text(event.region, 40) || undefined,
        category: text(event.category, 40) || undefined,
        examType: text(event.examType, 20) || undefined,
        education: text(event.education, 10) || undefined,
        q: text(event.q, 40),
        sort: text(event.sort, 20) || 'line',
        page: int(event.page, 1, 9999, 1),
        size: int(event.size, 1, 60, 12),
        year: int(event.year, 2016, 2025, 2025)
      }));
    }
    if (action === 'detail') {
      const kind = text(event.kind, 10);
      if (!ex.isKind(kind)) bad('考试类型不存在', 404);
      const item = ex.findItem(kind, text(event.id, 64));
      if (!item) bad('条目不存在', 404);
      return ok(ex.detail(item, int(event.year, 2016, 2025, 2025)));
    }
    if (action === 'match') {
      const kind = text(event.kind, 10);
      if (!ex.isKind(kind)) bad('考试类型不存在', 404);
      return ok(ex.match({
        kind,
        score: Number(event.score),
        region: text(event.region, 40) || undefined,
        education: text(event.education, 10) || undefined,
        major: text(event.major, 40) || undefined,
        category: text(event.category, 40) || undefined,
        political: text(event.political, 10) || undefined,
        limit: int(event.limit, 1, 30, 10),
        year: int(event.year, 2016, 2025, 2025)
      }));
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 本地清单（志愿表 / 报考清单） ---------- */
  lists(event) {
    const user = resolveUser(event);
    const store = db();
    const key = user._id;
    if (!store.lists[key]) store.lists[key] = { admission: [], exam: [] };
    if (event.action === 'admissionGet') return ok(store.lists[key].admission || []);
    if (event.action === 'admissionSave') {
      const rows = Array.isArray(event.rows) ? event.rows.slice(0, 60) : [];
      for (const r of rows) {
        if (!r || typeof r !== 'object' || !text(r.id, 64) || !text(r.name, 60)) bad('志愿行缺少院校信息');
        if (r.major !== undefined && text(r.major, 60).length > 60) bad('专业名称过长');
      }
      return mutate(() => { store.lists[key].admission = rows; return ok(rows); });
    }
    if (event.action === 'examGet') return ok(store.lists[key].exam || []);
    if (event.action === 'examSave') {
      const rows = Array.isArray(event.rows) ? event.rows.slice(0, 60) : [];
      for (const r of rows) {
        if (!r || typeof r !== 'object' || !text(r.id, 64)) bad('清单行缺少条目信息');
      }
      return mutate(() => { store.lists[key].exam = rows; return ok(rows); });
    }
    return fail('接口不存在', 404);
  },

  /* ---------- 升学规划（档案 + 考试 + 六个板块） ---------- */
  plan(event) {
    const store = db();
    if (!store.plans) store.plans = {};
    const key = planKey(event);
    if (!store.plans[key]) {
      store.plans[key] = { profile: plan.defaultProfile(), exams: [], updatedAt: null };
    }
    const record = store.plans[key];
    if (!Array.isArray(record.exams)) record.exams = [];

    const profile = planProfileOf(record);
    const exams = record.exams;
    const stats = plan.examStats(exams);
    const now = new Date();
    const action = event.action || 'overview';

    const gradeOf = () => {
      const grade = text(event.grade, 8) || profile.grade;
      if (!plan.isGrade(grade)) bad('年级不存在：' + grade);
      return grade;
    };
    const provinceOf = () => {
      const province = text(event.province, 20) || profile.province;
      if (!plan.isProvinceName(province)) bad('省份不存在：' + province);
      return province;
    };

    if (action === 'overview') {
      const grade = gradeOf();
      const province = provinceOf();
      const stage = plan.stagesFor(grade);
      const nodes = plan.timeline({ grade, now });
      const gap = plan.gapAnalysis({
        province, grade, targetTier: profile.targetTier, avgScore: stats.average, now
      });
      return ok({
        profile,
        grade,
        stages: stage.stages,
        currentStage: stage.current,
        stageNote: stage.note,
        timeline: nodes,
        gap,
        exams: {
          count: stats.count, average: stats.average, latest: stats.latest,
          highest: stats.highest, lowest: stats.lowest, trend: stats.trend,
          label: stats.label, recent: stats.recent, items: plan.examList(exams)
        },
        subjects: plan.subjectAnalysis({ first: profile.first, second: profile.second, province }),
        meta: PLAN_META,
        disclaimer: plan.DISCLAIMER,
        storage: 'local'
      });
    }

    if (action === 'profileSave') {
      const result = plan.normalizeProfile(event.profile || {});
      if (!result.ok) bad(result.errors.join('；'));
      const iso = new Date().toISOString();
      return mutate(() => {
        record.profile = Object.assign({}, result.profile, { updatedAt: iso });
        record.updatedAt = iso;
        return ok({ profile: planProfileOf(record), saved: true, updatedAt: iso, disclaimer: plan.DISCLAIMER });
      });
    }

    if (action === 'examAdd') {
      const result = plan.normalizeExam(event.exam || {});
      if (!result.ok) bad(result.errors.join('；'));
      const exam = Object.assign({ id: newId('pex'), createdAt: new Date().toISOString() }, result.exam);
      return mutate(() => {
        record.exams.push(exam);
        if (record.exams.length > 60) record.exams = record.exams.slice(-60);
        record.updatedAt = exam.createdAt;
        const next = plan.examStats(record.exams);
        return ok({
          exam,
          exams: plan.examList(record.exams),
          count: next.count, average: next.average, latest: next.latest, trend: next.trend,
          saved: true, message: '已记录本次考试'
        });
      });
    }

    if (action === 'examRemove') {
      const id = text(event.id, 40);
      if (!id) bad('缺少考试记录编号');
      return mutate(() => {
        record.exams = record.exams.filter(e => e.id !== id);
        record.updatedAt = new Date().toISOString();
        return ok({ exams: plan.examList(record.exams), count: record.exams.length });
      });
    }

    if (action === 'exams') {
      const target = plan.gapAnalysis({
        province: profile.province, grade: profile.grade,
        targetTier: profile.targetTier, avgScore: stats.average, now
      });
      return ok({
        exams: plan.examList(exams),
        count: stats.count, average: stats.average, latest: stats.latest,
        highest: stats.highest, lowest: stats.lowest, trend: stats.trend,
        label: stats.label, recent: stats.recent,
        targetLine: target.targetLine, targetTier: target.targetTier, gap: target.gap,
        disclaimer: plan.DISCLAIMER
      });
    }

    if (action === 'subjects') {
      const province = provinceOf();
      const first = text(event.first, 8) || profile.first;
      const second = Array.isArray(event.second) && event.second.length
        ? event.second
        : profile.second;
      const data = plan.subjectAnalysis({ first, second, province });
      if (!data.ok) bad(data.errors.join('；'));
      return ok(data);
    }

    if (action === 'pathways') {
      const province = provinceOf();
      const grade = gradeOf();
      let score = stats.average;
      if (event.score !== undefined && event.score !== null && event.score !== '') {
        const n = Number(event.score);
        if (!Number.isFinite(n)) bad('分数须为数字');
        const total = gk.provinceInfo(province).total;
        if (!(n > 0 && n <= total)) bad('分数须为 0–' + total + ' 之间的数字（' + province + '满分 ' + total + '）');
        score = n;
      }
      let rank = null;
      if (event.rank !== undefined && event.rank !== null && event.rank !== '') {
        const n = Number(event.rank);
        if (!Number.isInteger(n) || n < 1 || n > 5000000) bad('位次须为 1–5000000 的整数');
        rank = n;
      }
      const award = text(event.award, 40);
      const data = plan.pathwaysCheck({ grade, score, rank, province, award });
      if (rank === null && data.score !== null && data.rank !== null) {
        data.rankEstimated = true;
        data.rankSource = 'model.rankOf';
      }
      return ok(data);
    }

    if (action === 'reset') {
      return mutate(() => {
        store.plans[key] = { profile: plan.defaultProfile(), exams: [], updatedAt: null };
        return ok({ reset: true, profile: planProfileOf(store.plans[key]) });
      });
    }

    return fail('接口不存在', 404);
  },

  /* ---------- 定位 ---------- */
  location() {
    /* 本地模拟：返回预设城市，不发起网络请求 */
    return ok({ city: '哈尔滨', province: '黑龙江省', district: '', formatted: '黑龙江省哈尔滨市', source: 'preset' });
  },

  /* ---------- 种子数据 ---------- */
  seed() {
    db();
    save();
    return ok({ seeded: true });
  },

  /* ---------- 学鹭助手 ---------- */
  assistant(event) {
    const action = event.action;
    if (action === 'status') return ok({ enabled: true, source: 'builtin', configured: true });
    if (action !== 'chat') return fail('接口不存在', 404);
    const question = text(event.question, 200);
    if (!question) bad('请填写问题');
    const result = assistantData.answer(question);
    return ok({
      answer: result.a,
      question: result.q,
      matched: !!result.matched,
      route: result.go || null,
      courses: result.courses || [],
      source: 'builtin',
      related: (result.related || []).map(row => ({ q: row.q, a: row.a }))
    });
  }
};

/* ---------------- 辅助 ---------------- */
function int(value, min, max, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) bad('参数须为 ' + min + '–' + max + ' 的整数');
  return n;
}
function publicUser(user) { return { id: user._id, phone: user.phone, role: user.role }; }
function applicationBrief(user) {
  const a = latestApplication(user);
  if (!a) return null;
  return { id: a._id, status: a.status, name: a.name, type: a.type };
}
function emptyProfile(phone) {
  return { name: '', phone: phone || '', address: '', students: [], note: '', updatedAt: null };
}
function institutionView(item) {
  const audience = lib.audienceOf(item.audience) || lib.DEFAULT_AUDIENCE.slice();
  return {
    id: item.id, name: item.name, intro: item.intro, address: item.address,
    contact: item.contact, phone: item.phone, courseCount: item.courseCount,
    audience, audienceText: audience.join(' / '),
    courses: (item.courses || []).map(c => ({
      id: c.id, title: c.title, price: c.price,
      packageCount: Array.isArray(c.packages) ? c.packages.length : 0
    })),
    source: item.source, updatedAt: item.updatedAt || null
  };
}
/* 机构主页：环境图 / 课程 / 教师 / 价格区间（与云函数共用 institution-lib 的实现） */
const institutionDetailView = lib.institutionDetailView;

function decoratedResult(doc) {
  const list = catalog();
  const institutions = institutionsOf(list);
  const sold = soldCounts();
  return decorate(findService(list, doc.id) || doc, institutions, sold);
}

/* ---------------- 统一入口 ------------------------ */
/* 与云函数返回结构保持一致：{code, data} / {code, message} */
function handle(name, event) {
  const handler = handlers[name];
  if (!handler) return fail('接口不存在', 404);
  try {
    return handler(event || {});
  } catch (e) {
    if (e && e.name === 'BizError') return fail(e.message, e.code, e.needLogin);
    /* 共享校验库（institution-lib）抛的是带 status 的普通 Error，按业务错误返回 */
    if (e && typeof e.status === 'number') return fail(e.message, e.status);
    console.error('[mock]', name, e);
    return fail('服务暂时不可用，请稍后再试', 500);
  }
}

/* 清空本地模拟数据（“我的 → 重置演示数据”） */
function reset() {
  cache = null;
  try { wx.removeStorageSync(DB_KEY); } catch (e) { /* ignore */ }
  db();
  save();
}

module.exports = { handle, reset, db };

};
__mods["miniprogram/utils/plan-model.js"] = function (module, exports, require) {
/* 升学规划模型（纯函数，小程序与云函数共用）
 *
 * 在高考院校 / 分数模型之上，聚合「学生档案 → 阶段任务 → 目标差距 → 选科 → 多元升学 → 时间轴」。
 * 所有函数都不读写存储、不依赖进程状态；时间相关的函数显式接收 now，方便自检。
 * 数值仍是演示用模拟数据，不代表真实招生政策。
 *
 * 移植自网页版 gaokao/plan.mjs，只把 ESM 改成 CommonJS。
 */

/* 升学规划模型（纯函数，可单测）
   在高考院校/分数模型之上，聚合「学生档案 → 阶段任务 → 目标差距 → 选科 → 多元升学 → 时间轴」。
   所有函数都不读写数据库、不依赖当前进程状态；时间相关的函数显式接收 now，方便测试。
   数值仍是演示用模拟数据，不代表真实招生政策。 */

const {PROVINCES, UNDERGRAD_MAJORS} = require("miniprogram/utils/gaokao-data.js");
const {UNIVERSITIES, provinceLine, rankOf, provinceInfo} = require("miniprogram/utils/gaokao-model.js");

/* 省份查表（数据层没有单独导出，这里补一个） */
function provinceByName(name) {
  const key = typeof name === 'string' ? name.trim() : '';
  return PROVINCES.find(p => p.name === key) || null;
}

const DISCLAIMER = '升学规划中的分数线、覆盖率与节点日期均为模拟数据，仅用于功能演示，不可作为真实升学依据。';

const GRADES = ['初一', '初二', '初三', '高一', '高二', '高三'];
const FIRST_SUBJECTS = ['物理', '历史'];
const SECOND_SUBJECTS = ['化学', '生物', '政治', '地理'];
const TARGET_TIERS = ['985', '211', '本科', '专科'];
const INTERESTS = ['工学', '理学', '医学', '经济', '管理', '法学', '文学', '教育', '艺术'];
const INTEREST_CATEGORY = {
  工学: '工学', 理学: '理学', 医学: '医学', 经济: '经济学', 管理: '管理学',
  法学: '法学', 文学: '文学', 教育: '教育学', 艺术: '艺术学'
};

/* 年级推进顺序：升学规划的时间轴会按学年自动推进到下一学段 */
const GRADE_PATH = ['初一', '初二', '初三', '高一', '高二', '高三', '大学'];
const ACADEMIC_START_MONTH = 9;

const round1 = n => Math.round(n * 10) / 10;

function asDate(value) {
  const d = value instanceof Date ? value : new Date(value === undefined || value === null ? Date.now() : value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
function text(v, max = 40) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function listify(v) {
  if (Array.isArray(v)) return v.map(x => text(x, 20)).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,，、/\s]+/).map(s => s.trim()).filter(Boolean);
  return [];
}
function uniq(list) { return [...new Set(list)]; }
function pad2(n) { return String(n).padStart(2, '0'); }
function formatDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function academicYear(d) { return d.getMonth() + 1 >= ACADEMIC_START_MONTH ? d.getFullYear() : d.getFullYear() - 1; }
function monthsBetween(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }

function isGrade(grade) { return GRADES.includes(grade); }
function isProvinceName(name) { return PROVINCES.some(p => p.name === name); }

/* ---------------- 学生档案 ---------------- */
function defaultProfile() {
  return {
    grade: '高一',
    province: '浙江',
    first: '物理',
    second: ['化学', '生物'],
    targetTier: '本科',
    interest: ['工学'],
    updatedAt: null
  };
}

/* 校验并归一化档案。返回 {ok, errors, profile}，不抛异常，路由层负责 fail。 */
function normalizeProfile(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = [];
  const d = defaultProfile();

  let grade = text(raw.grade, 8) || d.grade;
  if (!GRADES.includes(grade)) {
    errors.push('年级只能是：' + GRADES.join('、'));
    grade = d.grade;
  }

  let province = text(raw.province, 20) || d.province;
  if (!isProvinceName(province)) {
    errors.push('省份不存在：' + province);
    province = d.province;
  }

  let first = text(raw.first, 8) || d.first;
  if (!FIRST_SUBJECTS.includes(first)) {
    errors.push('首选科目只能是：' + FIRST_SUBJECTS.join('、'));
    first = d.first;
  }

  const secondGiven = raw.second !== undefined && raw.second !== null && raw.second !== '';
  let second = secondGiven ? uniq(listify(raw.second)) : [...d.second];
  if (second.length !== 2) {
    errors.push('再选科目必须正好 2 门（' + SECOND_SUBJECTS.join('、') + ' 中选 2 门）');
  }
  const badSecond = second.filter(s => !SECOND_SUBJECTS.includes(s));
  if (badSecond.length) errors.push('再选科目不在可选范围内：' + badSecond.join('、'));
  if (second.length !== 2 || badSecond.length) second = [...d.second];

  let targetTier = text(raw.targetTier, 8) || d.targetTier;
  if (!TARGET_TIERS.includes(targetTier)) {
    errors.push('目标层次只能是：' + TARGET_TIERS.join('、'));
    targetTier = d.targetTier;
  }

  let interest = uniq(listify(raw.interest));
  const badInterest = interest.filter(x => !INTERESTS.includes(x));
  if (badInterest.length) errors.push('兴趣方向不在可选范围内：' + badInterest.join('、'));
  interest = interest.filter(x => INTERESTS.includes(x)).slice(0, 3);

  return {
    ok: errors.length === 0,
    errors,
    profile: {grade, province, first, second, targetTier, interest}
  };
}

/* ---------------- 考试记录 ---------------- */
function normalizeExam(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = [];
  const name = text(raw.name, 40);
  if (!name) errors.push('请填写考试名称（1–40 字）');

  let date = text(raw.date, 10);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!dateOk) {
    errors.push('考试日期格式应为 YYYY-MM-DD');
  } else {
    const [y, m, d] = date.split('-').map(Number);
    const probe = new Date(y, m - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d || y < 2015 || y > 2100) {
      errors.push('考试日期不是有效日期');
      date = '';
    }
  }

  const totalRaw = raw.total;
  const total = totalRaw === '' || totalRaw === null || totalRaw === undefined ? NaN : Number(totalRaw);
  if (!Number.isFinite(total) || total <= 0 || total > 900) {
    errors.push('总分须为 0–900 之间的数字（按考试满分填写）');
  }

  return {
    ok: errors.length === 0,
    errors,
    exam: {name, date, total: Number.isFinite(total) ? round1(total) : 0}
  };
}

function sortExams(exams) {
  return (Array.isArray(exams) ? exams : [])
    .filter(e => e && typeof e === 'object' && Number.isFinite(Number(e.total)) && e.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

/* 当前均分取最近 6 次，避免早期低分长期拉低目标差距 */
function examList(exams) {
  return sortExams(exams).map(e => ({
    id: e.id || '',
    name: e.name || '',
    date: e.date || '',
    total: round1(Number(e.total)),
    createdAt: e.createdAt || ''
  }));
}

function examStats(exams) {
  const all = sortExams(exams);
  if (!all.length) {
    return {count: 0, average: null, latest: null, highest: null, lowest: null, trend: null, recent: [], label: '最近 6 次均分'};
  }
  const recent = all.slice(-6);
  const nums = recent.map(e => Number(e.total));
  const latest = recent[recent.length - 1];
  const first = recent[0];
  return {
    count: all.length,
    average: round1(nums.reduce((s, n) => s + n, 0) / nums.length),
    latest: round1(Number(latest.total)),
    latestName: latest.name || '',
    latestDate: latest.date || '',
    highest: round1(Math.max(...nums)),
    lowest: round1(Math.min(...nums)),
    trend: round1(Number(latest.total) - Number(first.total)),
    recent: recent.map(e => ({
      name: e.name || '', date: e.date || '', total: round1(Number(e.total))
    })),
    label: '最近 ' + recent.length + ' 次均分'
  };
}

/* ---------------- 路径规划：五段阶段任务 ---------------- */
const STAGES = [
  {
    key: 'primary', name: '小学', range: '1–6 年级', goal: '把学习习惯和好奇心养起来',
    tasks: [
      {title: '每天固定阅读 20 分钟', detail: '从亲子共读到独立阅读，优先保护兴趣，不追求书单数量。'},
      {title: '计算与书写基本功', detail: '口算、竖式、字迹工整，每天 10 分钟短时高频练习。'},
      {title: '找到一项能坚持的兴趣', detail: '体育、艺术或科学实验任选其一，连续学习 1 年以上再评估。'},
      {title: '学会整理书包与时间', detail: '用可视化的清单管理作业和物品，家长逐步退出代劳。'},
      {title: '建立成长档案', detail: '保存作品、奖状与阅读记录，为后面的综评材料打底。'}
    ]
  },
  {
    key: 'junior', name: '初中', range: '初一–初三', goal: '稳住语数英，读懂本地中考规则',
    tasks: [
      {title: '初一：适应节奏，稳住语数英', detail: '三门主科每天有固定复习时间，避免靠考前突击。'},
      {title: '初二：盯住两极分化', detail: '物理、几何、英语是常见分水岭，出现掉队当月就补。'},
      {title: '体育与实验操作别丢分', detail: '中考体育、理化生实验通常可提前一年开始规律训练。'},
      {title: '研究本地中考政策', detail: '指标到校、名额分配、自主招生等规则每年会微调，以教育局文件为准。'},
      {title: '初三：一轮复习 + 模考复盘', detail: '每次模考后整理失分类型，比单纯刷题更重要。'},
      {title: '中考志愿梯度设计', detail: '按冲、稳、保排列，至少留 1 所明显低于平时水平的保底校。'}
    ]
  },
  {
    key: 'senior', name: '高中', range: '高一–高二', goal: '选对科目，把位次稳定在目标区间',
    tasks: [
      {title: '高一：定首选科目', detail: '物理 / 历史的选择优先看长期兴趣与专业方向，其次才是眼前分数。'},
      {title: '高一：再选科目试读', detail: '化学、生物、政治、地理各学一学期，用真实成绩和感受做判断。'},
      {title: '高二：通过学业水平合格考', detail: '合格考不过会影响毕业与部分高校报名，按学校节奏准备即可。'},
      {title: '高二：接触强基 / 综评 / 专项', detail: '了解报名条件与材料清单，有竞赛特长的尽早进入训练体系。'},
      {title: '高二下：进入一轮复习', detail: '把高一高二的错题按知识点归档，一轮复习以补漏洞为主。'},
      {title: '每学期校准一次目标线', detail: '用校内排名换算全省位次，比只看分数更能反映真实水平。'}
    ]
  },
  {
    key: 'gaokao', name: '高考', range: '高三–录取', goal: '报名、体检、考试、出分、填报，一环都不能漏',
    tasks: [
      {title: '高三上：高考报名与资格审查', detail: '关注本省教育考试院通知，户籍、学籍材料提前准备。'},
      {title: '高三下：体检与外语考试', detail: '体检结论会影响部分专业报考，外语听力 / 口语按本省安排参加。'},
      {title: '一模二模三模：按位次校准', detail: '把每次模考换算成省位次，动态调整目标院校清单。'},
      {title: '强基 / 综评 / 专项材料准备', detail: '报名集中在 3–5 月，个人陈述、获奖证明、推荐材料提前扫描归档。'},
      {title: '出分后 3 天内完成志愿初稿', detail: '先按位次筛出 30 所候选，再用冲稳保比例压缩到本省志愿数量。'},
      {title: '填满志愿并逐条核对', detail: '核对院校代码、专业组、选科要求、体检限制与是否服从调剂。'}
    ]
  },
  {
    key: 'college', name: '大学', range: '大一–毕业', goal: '把专业读深，把出路想清楚',
    tasks: [
      {title: '入学：适应与专业确认', detail: '了解转专业、辅修与实验班选拔的时间窗口，通常在大一。'},
      {title: '大一：绩点与英语四六级', detail: '绩点决定保研、交流与部分奖学金，越早稳定越省力。'},
      {title: '参与社团、科研或实习', detail: '至少有一段能讲清楚的经历，而不是只 collect 头衔。'},
      {title: '大二大三：分流选择', detail: '保研、考研、留学、就业四条路的时间线不同，提前一年准备。'},
      {title: '大四：把选择落地', detail: '秋招、考研初试、申请截止时间都在上学期，倒排时间表。'}
    ]
  }
];

function stageOfGrade(grade) {
  if (grade === '小学') return 'primary';
  if (['初一', '初二', '初三'].includes(grade)) return 'junior';
  if (['高一', '高二'].includes(grade)) return 'senior';
  if (grade === '高三') return 'gaokao';
  if (grade === '大学') return 'college';
  return null;
}

function stagesFor(grade = '高一') {
  const current = stageOfGrade(grade);
  const index = STAGES.findIndex(s => s.key === current);
  return {
    grade,
    current,
    stages: STAGES.map((stage, i) => ({
      key: stage.key,
      name: stage.name,
      range: stage.range,
      goal: stage.goal,
      tasks: stage.tasks.map(t => ({...t})),
      status: i < index ? 'done' : i === index ? 'current' : 'todo'
    })),
    note: '阶段任务按当前年级高亮；高三归入「高考」阶段，因为报名、体检、考试与填报都发生在高三。'
  };
}

/* ---------------- 关键节点：未来 24 个月 ---------------- */
/* month 从 1 开始；grades 为「该月就读年级」，时间轴会按学年自动推进年级 */
const TIMELINE_RULES = [
  {grades: ['初一', '初二'], month: 1, day: 10, type: 'mock', name: '上学期期末质量检测',
    detail: '期末成绩是判断是否需要调整学习方法的第一个信号，重点看排名变化。'},
  {grades: ['初一', '初二'], month: 6, day: 20, type: 'exam', name: '学业水平考试（学考）',
    detail: '按学校通知参加，合格即可；部分地区初二会安排地理、生物考试。'},

  {grades: ['初三'], month: 4, day: 20, type: 'mock', name: '中考一模',
    detail: '第一次全市 / 全区统考，用排名而不是分数定位目标高中。'},
  {grades: ['初三'], month: 5, day: 20, type: 'mock', name: '中考二模',
    detail: '查漏补缺的最后窗口，重点复盘重复失分的题型。'},
  {grades: ['初三'], month: 6, day: 17, type: 'exam', name: '中考',
    detail: '带齐准考证与文具，提前踩点考场，按平时节奏作答。'},
  {grades: ['初三'], month: 7, day: 5, type: 'score', name: '中考出分',
    detail: '出分后先看位次，再对照目标高中近三年录取线。'},
  {grades: ['初三'], month: 7, day: 10, type: 'apply', name: '中考志愿填报',
    detail: '按冲稳保梯度填报，确认是否服从调剂与名额分配规则。'},

  {grades: ['高一'], month: 11, day: 20, type: 'subject', name: '选科确认（预选）',
    detail: '多数学校在高一上学期末收集选科意向，先按兴趣与专业方向预选。'},
  {grades: ['高一'], month: 1, day: 10, type: 'mock', name: '高一上期末统考',
    detail: '用九科总分与单科排名判断首选物理还是历史。'},
  {grades: ['高一'], month: 6, day: 20, type: 'exam', name: '学业水平合格考',
    detail: '合格考成绩影响毕业与部分高校报名，按学校节奏准备。'},
  {grades: ['高一'], month: 6, day: 30, type: 'subject', name: '选科确认（最终）',
    detail: '再选科目一旦确定，高二分班与后续复习都会围绕它展开。'},

  {grades: ['高二'], month: 1, day: 10, type: 'exam', name: '学业水平合格考',
    detail: '未合格的科目还有补考机会，尽早清掉。'},
  {grades: ['高二'], month: 4, day: 15, type: 'subject', name: '选科调整窗口',
    detail: '部分学校允许高二上学期前调整选科，需同时评估专业覆盖率与当前成绩。'},
  {grades: ['高二'], month: 6, day: 20, type: 'mock', name: '高二下期末统考',
    detail: '这次排名是进入高三一轮复习前的基线，建议记录并保存。'},
  {grades: ['高二'], month: 11, day: 10, type: 'exam', name: '学业水平合格考（补考）',
    detail: '仍有不合格科目的同学务必参加，避免影响毕业。'},

  {grades: ['高三'], month: 11, day: 5, type: 'signup', name: '高考报名',
    detail: '网上报名 + 现场确认，户籍、学籍、身份证信息要逐字核对。'},
  {grades: ['高三'], month: 1, day: 10, type: 'exam', name: '学业水平合格考（补考）',
    detail: '高三仍有补考机会，报名前确认自己是否已经全部合格。'},
  {grades: ['高三'], month: 3, day: 15, type: 'health', name: '高考体检',
    detail: '体检结论会限制部分专业报考（如色盲、色弱），填报前务必核对。'},
  {grades: ['高三'], month: 3, day: 25, type: 'mock', name: '高三一模',
    detail: '按高考时间与流程模拟，考后把分数换算成省位次。'},
  {grades: ['高三'], month: 4, day: 25, type: 'mock', name: '高三二模',
    detail: '二模后确定冲稳保院校清单，开始准备强基 / 综评材料。'},
  {grades: ['高三'], month: 5, day: 20, type: 'mock', name: '高三三模',
    detail: '最后一次大考，重点调整作息与答题节奏，不再大幅改动方法。'},
  {grades: ['高三'], month: 6, day: 7, type: 'exam', name: '高考',
    detail: '按准考证安排参加考试，考完一科不对答案，保持节奏。'},
  {grades: ['高三'], month: 6, day: 25, type: 'score', name: '高考出分',
    detail: '同时公布分数线与一分一段表，用位次而不是分数定位院校。'},
  {grades: ['高三'], month: 6, day: 29, type: 'apply', name: '志愿填报',
    detail: '按冲稳保比例填满志愿，逐条核对院校代码、专业组与选科要求。'},
  {grades: ['高三'], month: 7, day: 15, type: 'apply', name: '征集志愿',
    detail: '未被录取的同学关注本省征集志愿公告，部分批次还有补录机会。'},

  {grades: ['大学'], month: 9, day: 1, type: 'college', name: '大学入学',
    detail: '报到后尽快了解转专业、辅修、实验班选拔与奖学金规则。'}
];

function gradeAt(baseGrade, baseDate, date) {
  const base = GRADE_PATH.indexOf(baseGrade);
  if (base < 0) return null;
  const index = base + (academicYear(date) - academicYear(baseDate));
  if (index < 0 || index >= GRADE_PATH.length) return null;
  return GRADE_PATH[index];
}

function timeline({grade = '高一', now = new Date(), months = 24} = {}) {
  const base = asDate(now);
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const nodes = [];
  for (let i = 0; i < months; i++) {
    const cursor = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const projected = gradeAt(grade, base, cursor);
    if (!projected) continue;
    for (const rule of TIMELINE_RULES) {
      if (rule.month !== cursor.getMonth() + 1 || !rule.grades.includes(projected)) continue;
      const date = new Date(cursor.getFullYear(), rule.month - 1, rule.day);
      nodes.push({
        date: formatDate(date),
        name: rule.name,
        detail: rule.detail,
        type: rule.type,
        grade: projected,
        passed: date < startOfDay(base),
        daysUntil: Math.round((date - startOfDay(base)) / 86400000)
      });
    }
  }
  nodes.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const to = new Date(from.getFullYear(), from.getMonth() + months, 0);
  const today = startOfDay(base);
  const passed = nodes.filter(n => n.passed).length;
  return {
    grade,
    months,
    from: formatDate(from),
    to: formatDate(to),
    count: nodes.length,
    passed,
    upcoming: nodes.length - passed,
    next: nodes.find(n => !n.passed) || null,
    nodes,
    note: '日期按学年与常规招生节奏推算，仅作规划提醒，具体以当地教育考试院公告为准。'
  };
}

/* ---------------- 目标拆解 ---------------- */
function tierLine(province = '浙江', tier = '本科', year = 2025) {
  const peers = UNIVERSITIES.filter(u => u.tier === tier);
  if (!peers.length) return null;
  const lines = peers.map(u => provinceLine(u, province, year));
  return round1(lines.reduce((s, n) => s + n, 0) / lines.length);
}

function milestoneDate(grade, now) {
  const ay = academicYear(now);
  if (grade === '高三') return {date: new Date(ay + 1, 5, 7), name: '高考'};
  if (grade === '高二') return {date: new Date(ay + 2, 5, 7), name: '高考'};
  if (grade === '高一') return {date: new Date(ay + 3, 5, 7), name: '高考'};
  if (grade === '初三') return {date: new Date(ay + 1, 5, 17), name: '中考'};
  if (grade === '初二') return {date: new Date(ay + 2, 5, 17), name: '中考'};
  if (grade === '初一') return {date: new Date(ay + 3, 5, 17), name: '中考'};
  return null;
}

function gapAnalysis({province = '浙江', grade = '高一', targetTier = '本科', avgScore = null, now = new Date(), year = 2025} = {}) {
  const p = provinceInfo(province);
  const tier = TARGET_TIERS.includes(targetTier) ? targetTier : '本科';
  const targetLine = tierLine(p.name, tier, year);
  const avg = avgScore === null || avgScore === undefined || avgScore === ''
    ? null
    : (Number.isFinite(Number(avgScore)) ? round1(Number(avgScore)) : null);

  const milestone = milestoneDate(grade, asDate(now));
  const months = milestone ? Math.max(1, monthsBetween(asDate(now), milestone.date)) : null;
  const semesters = months ? Math.max(1, Math.ceil(months / 6)) : null;
  const gap = avg === null || targetLine === null ? null : round1(targetLine - avg);
  const perSemester = gap === null || !semesters ? null : round1(gap / semesters);

  let advice;
  if (avg === null) {
    advice = '先在「学业曲线」录入至少一次考试总分，系统才能算出与目标线的差距。';
  } else if (gap !== null && gap <= 0) {
    advice = `当前均分 ${avg} 已高出${tier}层次模拟线 ${Math.abs(gap)} 分，保持节奏：把重心放在稳定发挥与短板学科上，同时关注位次而不只是分数。`;
  } else if (gap !== null) {
    advice = `还差 ${gap} 分。按剩余约 ${months} 个月（${semesters} 个学期）折算，每学期需要提升约 ${perSemester} 分；建议每月对照一次目标线，优先补提分空间最大的 1–2 门学科。`;
  } else {
    advice = '目标线暂不可用，请稍后重试。';
  }

  return {
    province: p.name,
    total: p.total,
    grade,
    targetTier: tier,
    targetLine,
    targetYear: year,
    targetBasis: `按${p.name}${tier}层次院校 ${year} 年模拟投档线均值估算`,
    avgScore: avg,
    gap,
    onTrack: gap !== null && gap <= 0,
    milestone: milestone ? milestone.name : null,
    monthsToMilestone: months,
    semesters,
    perSemester,
    advice,
    disclaimer: DISCLAIMER
  };
}

/* ---------------- 选科建议 ---------------- */
/* data.mjs 没有逐专业的选科要求字段，这里按学科门类给出 3+1+2 口径的模拟规则，
   因此所有覆盖率结果都标注 simulated。规则本身是确定性的，可单测。 */
const CATEGORY_FIRST = {
  工学: '物理', 理学: '物理', 医学: '物理', 农学: '物理',
  历史学: '历史', 哲学: '历史',
  经济学: '不限', 管理学: '不限', 法学: '不限', 文学: '不限',
  教育学: '不限', 艺术学: '不限'
};
const MAJOR_SECOND = {
  化学: '化学', 材料科学与工程: '化学', 化学工程与工艺: '化学', 环境工程: '化学',
  临床医学: '化学', 口腔医学: '化学', 药学: '化学', '药学（中药方向）': '化学',
  预防医学: '化学', 护理学: '化学', 食品科学与工程: '化学',
  生物科学: '生物', 生物医学工程: '生物', 海洋科学: '生物'
};

function majorRequirement(major) {
  const category = major && major.category ? major.category : '';
  const name = major && major.name ? major.name : '';
  return {
    first: CATEGORY_FIRST[category] || '不限',
    second: MAJOR_SECOND[name] || null
  };
}

function comboAllows(major, first, second) {
  const req = majorRequirement(major);
  if (req.first !== '不限' && req.first !== first) return false;
  if (req.second && !second.includes(req.second)) return false;
  return true;
}

function comboName(first, second) {
  return [first, ...second].join('+');
}

function coverageOf(first, second) {
  const allowed = UNDERGRAD_MAJORS.filter(m => comboAllows(m, first, second));
  return {
    allowed: allowed.length,
    total: UNDERGRAD_MAJORS.length,
    coverage: round1(allowed.length / UNDERGRAD_MAJORS.length * 100),
    majors: allowed.map(m => m.name)
  };
}

function allCombos() {
  const combos = [];
  for (const first of FIRST_SUBJECTS) {
    for (let i = 0; i < SECOND_SUBJECTS.length; i++) {
      for (let j = i + 1; j < SECOND_SUBJECTS.length; j++) {
        const second = [SECOND_SUBJECTS[i], SECOND_SUBJECTS[j]];
        const info = coverageOf(first, second);
        combos.push({
          combination: comboName(first, second),
          first,
          second,
          coverage: info.coverage,
          allowed: info.allowed,
          total: info.total,
          simulated: true
        });
      }
    }
  }
  combos.sort((a, b) => b.coverage - a.coverage ||
    (a.first === b.first ? 0 : a.first === '物理' ? -1 : 1) ||
    a.combination.localeCompare(b.combination, 'zh-Hans-CN'));
  combos.forEach((c, i) => { c.rank = i + 1; });
  return combos;
}

function subjectAnalysis({first = '物理', second = ['化学', '生物'], province = '浙江'} = {}) {
  const errors = [];
  if (!FIRST_SUBJECTS.includes(first)) errors.push('首选科目只能是：' + FIRST_SUBJECTS.join('、'));
  const secondList = uniq(listify(second));
  if (secondList.length !== 2) errors.push('再选科目必须正好 2 门');
  const bad = secondList.filter(s => !SECOND_SUBJECTS.includes(s));
  if (bad.length) errors.push('再选科目不在可选范围内：' + bad.join('、'));
  if (!isProvinceName(province)) errors.push('省份不存在：' + province);
  if (errors.length) return {ok: false, errors};

  const current = coverageOf(first, secondList);
  const combos = allCombos();
  const combination = comboName(first, secondList);
  const me = combos.find(c => c.combination === combination);
  const best = combos[0];

  const categories = [...new Set(UNDERGRAD_MAJORS.map(m => m.category))]
    .map(category => {
      const majors = UNDERGRAD_MAJORS.filter(m => m.category === category);
      const allowed = majors.filter(m => comboAllows(m, first, secondList)).length;
      return {
        category,
        total: majors.length,
        allowed,
        coverage: round1(allowed / majors.length * 100)
      };
    })
    .sort((a, b) => b.allowed - a.allowed || a.category.localeCompare(b.category, 'zh-Hans-CN'));

  return {
    ok: true,
    province,
    first,
    second: secondList,
    combination,
    coverage: current.coverage,
    allowedMajors: current.allowed,
    totalMajors: current.total,
    rank: me ? me.rank : null,
    totalCombos: combos.length,
    best: {combination: best.combination, first: best.first, second: best.second, coverage: best.coverage, allowed: best.allowed},
    gapToBest: me ? round1(best.coverage - me.coverage) : null,
    combos,
    categories,
    allowedMajorNames: current.majors,
    simulated: true,
    coverageBasis: '按学科门类归并的模拟选科要求（3+1+2 口径）',
    note: 'data.mjs 未提供逐专业选科要求，覆盖率按门类规则模拟，仅用于比较组合之间的相对高低。',
    disclaimer: DISCLAIMER
  };
}

/* ---------------- 多元升学 ---------------- */
function pathwayChecks(list) {
  // optional 的检查项只展示，不参与「是否符合」的判断
  const auto = list.filter(c => !c.manual && !c.optional);
  const manual = list.filter(c => c.manual);
  const autoPass = auto.length > 0 && auto.every(c => c.pass);
  let status = 'ineligible';
  if (autoPass) status = manual.length ? 'manual' : 'eligible';
  return {
    checks: list,
    autoPass,
    manualPass: null,
    manualCount: manual.length,
    status
  };
}

function fitPathway(base, checks, extra = {}) {
  const summary = pathwayChecks(checks);
  return {
    key: base.key,
    name: base.name,
    tag: base.tag,
    summary: base.summary,
    requirements: base.requirements,
    checks: summary.checks,
    autoPass: summary.autoPass,
    manualCount: summary.manualCount,
    status: summary.status,
    eligible: summary.status === 'eligible',
    needsManual: summary.status === 'manual',
    ...extra
  };
}

function pathwaysCheck({grade = '高三', score = null, rank = null, province = '浙江', award = ''} = {}) {
  const p = provinceInfo(province);
  const scoreNum = score === null || score === undefined || score === ''
    ? null
    : (Number.isFinite(Number(score)) ? round1(Number(score)) : null);
  const rankNum = rank === null || rank === undefined || rank === ''
    ? (scoreNum === null ? null : rankOf(p.name, scoreNum))
    : Math.max(1, Math.round(Number(rank)) || 1);

  const ratio = p.total / 750;
  const controlLine = round1(600 * ratio);
  const batchLine = round1(480 * ratio);
  const hasScore = scoreNum !== null;
  const awardText = text(award, 40) || '未登记';
  const nationalAward = /国家集训队|金牌|全国决赛|国一|国二/.test(awardText);

  const scoreCheck = (line, label) => ({
    item: '高考成绩', required: `≥ ${line} 分（${label}）`,
    actual: hasScore ? `${scoreNum} 分` : '未提供成绩', pass: hasScore && scoreNum >= line
  });
  const gradeCheck = {
    item: '年级要求', required: '高三应届', actual: grade,
    pass: grade === '高三'
  };
  const rankCheck = (limit) => ({
    item: '全省位次', required: `≤ ${limit}`,
    actual: rankNum === null ? '未提供' : String(rankNum),
    pass: rankNum !== null && rankNum <= limit
  });

  const strongBase = {
    key: 'qiangji', name: '强基计划', tag: '基础学科 · 本硕博衔接',
    summary: '36 所「双一流」A 类高校招收数学、物理、化学、生物、历史、哲学、古文字等基础学科，高考成绩占综合分 85% 左右。',
    requirements: [
      {label: '年级', value: '高三应届毕业生'},
      {label: '成绩', value: `达到特殊类型招生控制线（模拟 ${controlLine} 分）`},
      {label: '位次', value: '全省前列（模拟参考 ≤ 40000 名）'},
      {label: '奖项', value: '五大学科竞赛银牌及以上可破格入围'}
    ]
  };
  const strongChecks = [
    gradeCheck,
    scoreCheck(controlLine, '模拟特殊类型线'),
    rankCheck(40000),
    {item: '竞赛破格（可选）', required: '银牌及以上', actual: awardText, pass: nationalAward, manual: false, optional: true}
  ];

  const comprehensiveBase = {
    key: 'zonghe', name: '综合评价', tag: '高考 + 校测 + 学考',
    summary: '部分高校按「高考成绩 60% + 校测 30% + 学考 10%」折算录取，适合综合素质档案完整、面试表达稳定的学生。',
    requirements: [
      {label: '年级', value: '高三应届毕业生'},
      {label: '成绩', value: `达到本科批次线（模拟 ${batchLine} 分）`},
      {label: '学考', value: '学业水平考试全 A 或少量 B'},
      {label: '材料', value: '综合素质档案、个人陈述、校测'}
    ]
  };
  const comprehensiveChecks = [
    gradeCheck,
    scoreCheck(batchLine, '模拟本科线'),
    {item: '学业水平考试', required: '全 A 或少量 B', actual: '需按本校成绩单核验', pass: false, manual: true},
    {item: '综合素质档案 / 校测', required: '档案完整并参加校测', actual: '需人工确认', pass: false, manual: true}
  ];

  const specialBase = {
    key: 'zhuanxiang', name: '专项计划', tag: '面向农村和脱贫地区',
    summary: '国家专项、地方专项、高校专项面向实施区域的农村学生，通常可降分录取，报名集中在高三下学期。',
    requirements: [
      {label: '年级', value: '高三应届毕业生'},
      {label: '户籍学籍', value: '本人及父母（或法定监护人）户籍在实施区域连续满 3 年'},
      {label: '成绩', value: `达到相应批次线（模拟 ${batchLine} 分）`},
      {label: '材料', value: '户籍证明、学籍证明、资格审核表'}
    ]
  };
  const specialChecks = [
    gradeCheck,
    scoreCheck(batchLine, '模拟本科线'),
    {item: '户籍在实施区域', required: '连续满 3 年', actual: '需人工核验', pass: false, manual: true},
    {item: '学籍与就读', required: '户籍所在县高中连续 3 年学籍', actual: '需人工核验', pass: false, manual: true}
  ];

  const baosongBase = {
    key: 'baosong', name: '竞赛保送', tag: '国家集训队 / 外语类保送',
    summary: '进入五大学科竞赛国家集训队，或具有外语类保送资格的外国语中学推荐生，可免高考直接录取。',
    requirements: [
      {label: '年级', value: '高三应届毕业生'},
      {label: '奖项', value: '五大学科竞赛国家集训队（数学、物理、化学、生物、信息学）'},
      {label: '资格', value: '外语类保送生需就读具有推荐资格的外国语中学'},
      {label: '成绩', value: `建议不低于本科线（模拟 ${batchLine} 分）`}
    ]
  };
  const baosongChecks = [
    gradeCheck,
    {item: '竞赛奖项', required: '国家集训队 / 全国决赛金牌', actual: awardText, pass: nationalAward}
  ];

  const pathways = [
    fitPathway(strongBase, strongChecks),
    fitPathway(comprehensiveBase, comprehensiveChecks),
    fitPathway(specialBase, specialChecks),
    fitPathway(baosongBase, baosongChecks)
  ];

  return {
    grade,
    province: p.name,
    score: scoreNum,
    rank: rankNum,
    rankEstimated: rank === null || rank === undefined || rank === '',
    award: awardText,
    controlLine,
    batchLine,
    eligibleCount: pathways.filter(x => x.eligible).length,
    manualCount: pathways.filter(x => x.needsManual).length,
    pathways,
    source: hasScore ? 'input' : 'none',
    simulated: true,
    note: hasScore
      ? '自查结果按模拟控制线判断；标注「需人工核验」的条件无法从成绩推导，请以当年招生简章为准。'
      : '还没有成绩数据：请先在「学业曲线」录入考试，或带上 score 参数再自查。',
    disclaimer: DISCLAIMER
  };
}

module.exports = {
  PROVINCES,
  UNDERGRAD_MAJORS,
  DISCLAIMER,
  GRADES,
  FIRST_SUBJECTS,
  SECOND_SUBJECTS,
  TARGET_TIERS,
  INTERESTS,
  INTEREST_CATEGORY,
  GRADE_PATH,
  ACADEMIC_START_MONTH,
  STAGES,
  TIMELINE_RULES,
  CATEGORY_FIRST,
  MAJOR_SECOND,
  isGrade,
  isProvinceName,
  defaultProfile,
  normalizeProfile,
  normalizeExam,
  examList,
  examStats,
  stageOfGrade,
  stagesFor,
  timeline,
  tierLine,
  gapAnalysis,
  majorRequirement,
  subjectAnalysis,
  pathwaysCheck
};

};
__mods["miniprogram/utils/seed-data.js"] = function (module, exports, require) {
/* 学鹭伴学 · 种子数据（小程序内置，本地模拟与云数据库播种共用）
 *
 * 服务目录 = 种子 + 用户新增/覆盖。
 * 云开发模式下由 seed 云函数写入云数据库；本地模拟模式直接用于内存数据库。
 */

const SEED_SERVICES = [
  {id:'c1',type:'course',title:'创意美术 · 少儿色彩探索',merchant:'拾光艺术中心',category:'艺术启蒙',price:299,unit:'8课时',icon:'🎨',tone:'peach',tag:'人气推荐',description:'从观察到表达，让孩子用色彩讲自己的故事。小班教学，适合 6–10 岁。',location:'道里区 · 群力大道',city:'哈尔滨',remaining:18,
   audience:['家长'],
   address:'哈尔滨市道里区群力大道 88 号 3 层',phone:'0451-88001234',
   merchantDetail:{name:'拾光艺术中心',logo:'🎨',intro:'专注 4–12 岁少儿美育的社区机构，小班教学，课程以观察力与表达力为主线。',foundYear:2016,verified:true,address:'哈尔滨市道里区群力大道 88 号 3 层',contact:'王老师',phone:'0451-88001234',licenses:['民办学校办学许可证','社会艺术水平考级报名点'],teachers:['王老师 · 色彩/水彩','李老师 · 素描/综合材料']},
   images:[
    {name:'主视觉 · 色彩教室',kind:'banner',tone:'peach',caption:'小班画室，每班 6–8 人'},
    {name:'课程现场 · 水彩探索',kind:'photo',tone:'peach',caption:'从调色开始认识色彩'},
    {name:'作品展示 · 孩子的故事',kind:'photo',tone:'lavender',caption:'每个孩子都能讲自己的故事'}
   ]},
  {id:'c2',type:'course',title:'青少年编程 · 创造力实验室',merchant:'未来星科创',category:'科学探索',price:499,unit:'6课时',icon:'🚀',tone:'lavender',tag:'新课上线',description:'通过图形化编程和动手项目，探索逻辑与创造的乐趣。适合 8–12 岁。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:12,
   audience:['家长','大学生'],
   address:'哈尔滨市南岗区学府路 199 号 6 层',phone:'0451-88005678',
   merchantDetail:{name:'未来星科创',logo:'🚀',intro:'面向 8–14 岁的科技素养机构，课程覆盖图形化编程、机器人与科学实验。',foundYear:2019,verified:true,address:'哈尔滨市南岗区学府路 199 号 6 层',contact:'周老师',phone:'0451-88005678',licenses:['科技类校外培训机构备案'],teachers:['周老师 · 图形化编程','孙老师 · 机器人搭建']},
   images:[
    {name:'主视觉 · 实验室',kind:'banner',tone:'lavender',caption:'六人一组，边做边学'},
    {name:'课程现场 · 图形化编程',kind:'photo',tone:'lavender',caption:'拖拽积木，理解顺序与循环'},
    {name:'课程现场 · 机器人搭建',kind:'photo',tone:'mint',caption:'把代码变成会动的小车'}
   ]},
  {id:'c3',type:'course',title:'篮球成长营 · 一起向上',merchant:'跃动体育',category:'运动成长',price:399,unit:'8课时',icon:'🏀',tone:'mint',tag:'周末好课',description:'基础运球、团队配合与体能训练，收获运动的快乐。适合 7–12 岁。',location:'道里区 · 群力体育公园',city:'哈尔滨',remaining:20,
   audience:['家长'],
   address:'哈尔滨市道里区群力体育公园体育馆 2 号馆',phone:'0451-88004321',
   merchantDetail:{name:'跃动体育',logo:'🏀',intro:'青少年篮球与体能培训机构，教练具备青少年体适能指导经验。',foundYear:2018,verified:true,address:'哈尔滨市道里区群力体育公园体育馆 2 号馆',contact:'刘教练',phone:'0451-88004321',licenses:['体育类校外培训备案'],teachers:['刘教练 · 基础运球','赵教练 · 体能与团队配合']},
   images:[
    {name:'主视觉 · 球馆',kind:'banner',tone:'mint',caption:'室内木地板球场，雨天照常上课'},
    {name:'课程现场 · 运球训练',kind:'photo',tone:'mint',caption:'分组练习，人人有球'},
    {name:'课程现场 · 团队对抗',kind:'photo',tone:'peach',caption:'小场对抗，学会配合'}
   ]},
  {id:'c4',type:'course',title:'小学数学 · 思维训练班',merchant:'启明星学科辅导',category:'学科提升',price:880,unit:'12课时',icon:'🧮',tone:'mint',tag:'家长热选',description:'围绕计算能力、图形认知与应用题思路展开，按年级分班小班授课，适合三至六年级。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:16,
   audience:['家长'],
   address:'哈尔滨市南岗区学府路 128 号 2 层',phone:'0451-88007300',
   merchantDetail:{name:'启明星学科辅导',logo:'🌟',intro:'面向小学到初中的学科辅导机构，数学、语文、英语分年级小班授课，随堂测与家长反馈每讲同步。',foundYear:2017,verified:true,address:'哈尔滨市南岗区学府路 128 号 2 层',contact:'马老师',phone:'0451-88007300',licenses:['民办学校办学许可证'],teachers:['马老师 · 小学数学','刘老师 · 初中语文','陈老师 · 小学英语']},
   images:[
    {name:'主视觉 · 数学教室',kind:'banner',tone:'mint',caption:'按年级分班，每班 8 人'},
    {name:'课程现场 · 应用题拆解',kind:'photo',tone:'mint',caption:'画图找关系，思路看得见'}
   ]},
  {id:'c5',type:'course',title:'初中语文 · 阅读写作提升',merchant:'启明星学科辅导',category:'学科提升',price:960,unit:'12课时',icon:'📖',tone:'peach',tag:'家长热选',description:'现代文阅读按题型归类讲练，写作从审题立意到结构成文逐篇批改，适合七至九年级。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:14,
   audience:['家长'],
   address:'哈尔滨市南岗区学府路 128 号 2 层',phone:'0451-88007300',
   merchantDetail:{name:'启明星学科辅导',logo:'🌟',intro:'面向小学到初中的学科辅导机构，数学、语文、英语分年级小班授课，随堂测与家长反馈每讲同步。',foundYear:2017,verified:true,address:'哈尔滨市南岗区学府路 128 号 2 层',contact:'马老师',phone:'0451-88007300',licenses:['民办学校办学许可证'],teachers:['马老师 · 小学数学','刘老师 · 初中语文','陈老师 · 小学英语']},
   images:[
    {name:'主视觉 · 语文教室',kind:'banner',tone:'peach',caption:'每讲一篇精读 + 一篇写作'},
    {name:'课程现场 · 逐篇批改',kind:'photo',tone:'peach',caption:'作文面批，当堂讲评'}
   ]},
  {id:'c6',type:'course',title:'小学英语 · 自然拼读与口语',merchant:'启明星学科辅导',category:'学科提升',price:760,unit:'10课时',icon:'🔤',tone:'lavender',tag:'零基础可报',description:'从字母发音到拼读规则，配合课堂情景对话，帮孩子敢开口、会拼读，适合二至五年级。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:20,
   audience:['家长'],
   address:'哈尔滨市南岗区学府路 128 号 2 层',phone:'0451-88007300',
   merchantDetail:{name:'启明星学科辅导',logo:'🌟',intro:'面向小学到初中的学科辅导机构，数学、语文、英语分年级小班授课，随堂测与家长反馈每讲同步。',foundYear:2017,verified:true,address:'哈尔滨市南岗区学府路 128 号 2 层',contact:'马老师',phone:'0451-88007300',licenses:['民办学校办学许可证'],teachers:['马老师 · 小学数学','刘老师 · 初中语文','陈老师 · 小学英语']},
   images:[
    {name:'主视觉 · 英语教室',kind:'banner',tone:'lavender',caption:'全情景教学，人人开口'},
    {name:'课程现场 · 拼读游戏',kind:'photo',tone:'lavender',caption:'边玩边练，当堂巩固'}
   ]},
  {id:'c7',type:'course',title:'初中数学 · 代数几何衔接班',merchant:'启明星学科辅导',category:'学科提升',price:1080,unit:'14课时',icon:'📐',tone:'peach',tag:'小升初衔接',description:'从有理数运算到几何证明，补齐小学到初中的思维跨度，适合新初一、初二学生。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:15,
   audience:['家长'],
   address:'哈尔滨市南岗区学府路 128 号 2 层',phone:'0451-88007300',
   merchantDetail:{name:'启明星学科辅导',logo:'🌟',intro:'面向小学到初中的学科辅导机构，数学、语文、英语分年级小班授课，随堂测与家长反馈每讲同步。',foundYear:2017,verified:true,address:'哈尔滨市南岗区学府路 128 号 2 层',contact:'马老师',phone:'0451-88007300',licenses:['民办学校办学许可证'],teachers:['马老师 · 小学数学','刘老师 · 初中语文','陈老师 · 小学英语']},
   images:[
    {name:'主视觉 · 中学部教室',kind:'banner',tone:'peach',caption:'衔接班每讲配随堂测'},
    {name:'课程现场 · 几何证明',kind:'photo',tone:'peach',caption:'从画图开始学证明'}
   ]},
  {id:'l1',type:'course',title:'考研数学 · 强化提高班',merchant:'学鹭学研中心',category:'考研辅导',price:1280,unit:'16课时',icon:'📐',tone:'lavender',tag:'备考推荐',description:'高数、线代、概率三轮串讲，按题型拆解解题路径，配套每周模考与错题复盘。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:25,
   audience:['大学生'],
   address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',phone:'0451-88006600',
   learning:{kind:'ky',subject:'数学'},
   packages:[
    {name:'强化班（16课时）',price:1280,lessons:16,description:'每周两次，共 8 周'},
    {name:'强化 + 冲刺（24课时）',price:1880,lessons:24,description:'含考前冲刺与两次全真模考'}
   ],
   merchantDetail:{name:'学鹭学研中心',logo:'📐',intro:'面向考研、考公、考编的备考教学中心，按科目方向开设系统班与冲刺班。',foundYear:2014,verified:true,address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',contact:'郑老师',phone:'0451-88006600',licenses:['民办学校办学许可证'],teachers:['郑老师 · 高等数学','吴老师 · 线性代数与概率统计']},
   images:[
    {name:'主视觉 · 自习教室',kind:'banner',tone:'lavender',caption:'固定座位，晚间开放自习'},
    {name:'课程现场 · 题型串讲',kind:'photo',tone:'lavender',caption:'按题型归类，讲练结合'}
   ]},
  {id:'l2',type:'course',title:'公务员考试 · 申论系统班',merchant:'学鹭学研中心',category:'考公辅导',price:980,unit:'12课时',icon:'🖋',tone:'peach',tag:'备考推荐',description:'从材料阅读到文章结构，逐段批改申论作答，覆盖概括、分析、对策与大作文。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:30,
   audience:['大学生'],
   address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',phone:'0451-88006600',
   learning:{kind:'gwy',subject:'申论'},
   packages:[
    {name:'系统班（12课时）',price:980,lessons:12,description:'含 6 次一对一批改'},
    {name:'系统班 + 面试（20课时）',price:1680,lessons:20,description:'笔试通过后衔接结构化面试'}
   ],
   merchantDetail:{name:'学鹭学研中心',logo:'📐',intro:'面向考研、考公、考编的备考教学中心，按科目方向开设系统班与冲刺班。',foundYear:2014,verified:true,address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',contact:'郑老师',phone:'0451-88006600',licenses:['民办学校办学许可证'],teachers:['何老师 · 申论','郑老师 · 行测']},
   images:[
    {name:'主视觉 · 小班教室',kind:'banner',tone:'peach',caption:'小班授课，逐份批改'},
    {name:'课程现场 · 材料精读',kind:'photo',tone:'peach',caption:'先读材料，再定结构'}
   ]},
  {id:'l3',type:'course',title:'事业单位 · 公共基础知识精讲',merchant:'学鹭学研中心',category:'考编辅导',price:860,unit:'14课时',icon:'📘',tone:'mint',tag:'备考推荐',description:'梳理公基高频考点，按模块讲练结合，配套章节测与考点速记卡。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:28,
   audience:['大学生'],
   address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',phone:'0451-88006600',
   learning:{kind:'sb',subject:'公共基础知识'},
   packages:[
    {name:'精讲班（14课时）',price:860,lessons:14,description:'含章节测与考点速记卡'},
    {name:'精讲 + 刷题（20课时）',price:1280,lessons:20,description:'加 6 次专项刷题与讲评'}
   ],
   merchantDetail:{name:'学鹭学研中心',logo:'📐',intro:'面向考研、考公、考编的备考教学中心，按科目方向开设系统班与冲刺班。',foundYear:2014,verified:true,address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',contact:'郑老师',phone:'0451-88006600',licenses:['民办学校办学许可证'],teachers:['许老师 · 公共基础知识','何老师 · 综合应用能力']},
   images:[
    {name:'主视觉 · 讲义资料',kind:'banner',tone:'mint',caption:'按模块整理的高频考点'},
    {name:'课程现场 · 模块精讲',kind:'photo',tone:'mint',caption:'一模块一测，及时查漏'}
   ]},
  {id:'l4',type:'course',title:'公务员考试 · 行测专项突破',merchant:'学鹭学研中心',category:'考公辅导',price:1080,unit:'16课时',icon:'🧮',tone:'mint',tag:'模块精讲',description:'数量关系、资料分析、判断推理分模块突破，配套限时训练与错题归类。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:26,
   audience:['大学生'],
   address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',phone:'0451-88006600',
   learning:{kind:'gwy',subject:'行政职业能力测验'},
   packages:[
    {name:'专项班（16课时）',price:1080,lessons:16,description:'四个模块轮流精讲'},
    {name:'专项 + 刷题（24课时）',price:1580,lessons:24,description:'含 8 次限时套题训练'}
   ],
   merchantDetail:{name:'学鹭学研中心',logo:'📐',intro:'面向考研、考公、考编的备考教学中心，按科目方向开设系统班与冲刺班。',foundYear:2014,verified:true,address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',contact:'郑老师',phone:'0451-88006600',licenses:['民办学校办学许可证'],teachers:['郑老师 · 行测','何老师 · 申论']},
   images:[{name:'主视觉 · 限时训练',kind:'banner',tone:'mint',caption:'按考试节奏做套题'}]},
  {id:'l5',type:'course',title:'考研英语 · 阅读与写作提升',merchant:'学鹭学研中心',category:'考研辅导',price:1120,unit:'14课时',icon:'📕',tone:'peach',tag:'备考推荐',description:'长难句拆解、阅读题型定位与作文框架搭建，每节课配套精读与批改。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:24,
   audience:['大学生'],
   address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',phone:'0451-88006600',
   learning:{kind:'ky',subject:'英语'},
   packages:[
    {name:'提升班（14课时）',price:1120,lessons:14,description:'含 5 次作文批改'},
    {name:'提升 + 冲刺（22课时）',price:1720,lessons:22,description:'含真题精讲与考前串讲'}
   ],
   merchantDetail:{name:'学鹭学研中心',logo:'📐',intro:'面向考研、考公、考编的备考教学中心，按科目方向开设系统班与冲刺班。',foundYear:2014,verified:true,address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',contact:'郑老师',phone:'0451-88006600',licenses:['民办学校办学许可证'],teachers:['苏老师 · 考研英语']},
   images:[{name:'主视觉 · 精读课堂',kind:'banner',tone:'peach',caption:'逐句精读，练定位'}]},
  {id:'l6',type:'course',title:'考研政治 · 全程精讲',merchant:'学鹭学研中心',category:'考研辅导',price:960,unit:'12课时',icon:'📗',tone:'lavender',tag:'基础夯实',description:'马原、毛中特、史纲、思修四门课按考点串讲，配套选择题专项与背诵提纲。',location:'南岗区 · 学府路',city:'哈尔滨',remaining:32,
   audience:['大学生'],
   address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',phone:'0451-88006600',
   learning:{kind:'ky',subject:'政治'},
   packages:[
    {name:'精讲班（12课时）',price:960,lessons:12,description:'四门课考点串讲'},
    {name:'精讲 + 押题（18课时）',price:1460,lessons:18,description:'含考前时政与押题串讲'}
   ],
   merchantDetail:{name:'学鹭学研中心',logo:'📐',intro:'面向考研、考公、考编的备考教学中心，按科目方向开设系统班与冲刺班。',foundYear:2014,verified:true,address:'哈尔滨市南岗区学府路 66 号 学研大厦 5 层',contact:'郑老师',phone:'0451-88006600',licenses:['民办学校办学许可证'],teachers:['罗老师 · 考研政治']},
   images:[{name:'主视觉 · 考点串讲',kind:'banner',tone:'lavender',caption:'四门课一张知识图'}]},
  {id:'z1',type:'course',title:'教师资格证 · 笔试全程班',merchant:'职达教育',category:'职考技能',price:1280,unit:'16课时',icon:'🎓',tone:'lavender',tag:'职考推荐',description:'综合素质与教育知识能力两科串讲，配套主观题批改与考前冲刺卷。',location:'南岗区 · 红旗大街',city:'哈尔滨',remaining:30,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'教师资格'},
   packages:[
    {name:'全程班（16课时）',price:1280,lessons:16,description:'两科串讲，含 4 套模拟卷'},
    {name:'全程 + 面试（24课时）',price:1980,lessons:24,description:'笔试通过后衔接结构化面试'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['马老师 · 综合素质','钱老师 · 教育知识能力']},
   images:[{name:'主视觉 · 职考课堂',kind:'banner',tone:'lavender',caption:'按证种分班，晚班与周末班可选'}]},
  {id:'z2',type:'course',title:'初级会计 · 实务精讲',merchant:'职达教育',category:'职考技能',price:980,unit:'14课时',icon:'🧾',tone:'peach',tag:'职考推荐',description:'按章节梳理会计实务考点，配套分录练习与两套全真模拟。',location:'南岗区 · 红旗大街',city:'哈尔滨',remaining:36,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'会计实务'},
   packages:[
    {name:'精讲班（14课时）',price:980,lessons:14,description:'含章节练习与答疑'},
    {name:'精讲 + 冲刺（20课时）',price:1480,lessons:20,description:'加两套全真模拟与讲评'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['孙老师 · 会计实务','周老师 · 经济法基础']},
   images:[{name:'主视觉 · 财会教室',kind:'banner',tone:'peach',caption:'分录练习当堂批改'}]},
  {id:'z3',type:'course',title:'二级建造师 · 建筑实务',merchant:'职达教育',category:'职考技能',price:1580,unit:'20课时',icon:'🏗',tone:'mint',tag:'职考推荐',description:'施工管理与实务案例逐题拆解，配套真题精讲与考前押题串讲。',location:'南岗区 · 红旗大街',city:'哈尔滨',remaining:24,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'建筑工程'},
   packages:[
    {name:'实务班（20课时）',price:1580,lessons:20,description:'含真题精讲与案例批改'},
    {name:'实务 + 法规（28课时）',price:2180,lessons:28,description:'加法规与管理两科串讲'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['李老师 · 建筑实务','吴老师 · 法规']},
   images:[{name:'主视觉 · 案例课',kind:'banner',tone:'mint',caption:'案例题按工序拆解'}]},
  {id:'z4',type:'course',title:'社会工作者 · 初级综合能力',merchant:'职达教育',category:'职考技能',price:1180,unit:'15课时',icon:'🤝',tone:'lavender',tag:'在职可考',description:'社会工作综合能力与实务两科考点串讲，面向社区、公益与民政岗位在职备考人群。',location:'南岗区 · 红旗大街',city:'哈尔滨',remaining:28,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'社会工作'},
   packages:[
    {name:'基础班（15课时）',price:1180,lessons:15,description:'两科考点串讲，含章节练习'},
    {name:'基础 + 冲刺（22课时）',price:1720,lessons:22,description:'加真题精讲与主观题批改'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['何老师 · 综合能力','徐老师 · 社会工作实务']},
   images:[{name:'主视觉 · 社工课堂',kind:'banner',tone:'lavender',caption:'在职晚班，每周两次'}]},
  {id:'z5',type:'course',title:'健康管理师 · 三级考点精讲',merchant:'职达教育',category:'职考技能',price:1380,unit:'18课时',icon:'🩺',tone:'mint',tag:'在职可考',description:'健康监测、风险评估与干预方案三大模块精讲，配套案例题训练与考前串讲。',location:'南岗区 · 红旗大街',city:'哈尔滨',remaining:26,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'健康管理'},
   packages:[
    {name:'精讲班（18课时）',price:1380,lessons:18,description:'三大模块精讲，含案例训练'},
    {name:'精讲 + 押题（24课时）',price:1880,lessons:24,description:'加两套模拟卷与讲评'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['邹老师 · 健康监测','汤老师 · 风险评估']},
   images:[{name:'主视觉 · 健康实训室',kind:'banner',tone:'mint',caption:'案例数据当堂分析'}]},
  {id:'z6',type:'course',title:'人力资源管理师 · 三级',merchant:'职达教育',category:'职考技能',price:1080,unit:'12课时',icon:'🧑‍💼',tone:'peach',tag:'在职可考',description:'人力资源规划、招聘配置、绩效薪酬与劳动关系四模块串讲，适合转岗与在职提升。',location:'南岗区 · 红旗大街',city:'哈尔滨',remaining:32,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'人力资源'},
   packages:[
    {name:'精讲班（12课时）',price:1080,lessons:12,description:'四模块串讲，含计算题专练'},
    {name:'精讲 + 押题（18课时）',price:1580,lessons:18,description:'加真题精讲与考前卷'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['尤老师 · 绩效薪酬','施老师 · 劳动关系']},
   images:[{name:'主视觉 · 管理课堂',kind:'banner',tone:'peach',caption:'按模块拆解计算题'}]},
  {id:'z7',type:'course',title:'计算机等级考试 · 二级Office',merchant:'职达教育',category:'职考技能',price:880,unit:'10课时',icon:'💻',tone:'lavender',tag:'在线上机',description:'Word、Excel、PowerPoint 上机题专项训练，含两套全真上机模拟与逐题讲评。',location:'在线上机 · 南岗区线下答疑',city:'哈尔滨',remaining:40,
   audience:['大学生'],
   address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',phone:'0451-88008811',
   learning:{kind:'zk',subject:'计算机等级'},
   packages:[
    {name:'上机专项（10课时）',price:880,lessons:10,description:'三件套上机题逐题讲评'},
    {name:'专项 + 模拟（14课时）',price:1260,lessons:14,description:'加两套全真上机模拟'}
   ],
   merchantDetail:{name:'职达教育',logo:'🎓',intro:'面向职业资格与技能证书的培训机构，覆盖教师、财会、建工、社工与健康五大方向。',foundYear:2015,verified:true,address:'哈尔滨市南岗区红旗大街 200 号 职达大厦 6 层',contact:'马老师',phone:'0451-88008811',licenses:['民办学校办学许可证'],teachers:['梁老师 · 上机题','钟老师 · 模拟讲评']},
   images:[{name:'主视觉 · 机房',kind:'banner',tone:'lavender',caption:'一人一机，随堂提交'}]},
  {id:'t1',type:'tutor',title:'林同学 · 阅读与习惯伴学',merchant:'林同学',category:'阅读陪伴',price:120,unit:'小时',icon:'📚',tone:'lavender',tag:'伴学服务',description:'提供阅读陪伴、时间规划与习惯记录支持，不包含学科讲授、补课、考试培训或提分承诺。',location:'道里区 · 监护人确认安排',city:'哈尔滨',remaining:1,
    tutorDetail:{name:'林同学',school:'示范师范大学',major:'汉语言文学（师范）',education:'本科',subjects:['阅读陪伴','习惯培养','时间规划'],methods:['线下陪伴','线上陪伴'],experience:'两年阅读活动与习惯记录经历，累计陪伴 40 余个家庭',intro:'汉语言文学（师范）在读，习惯把一本书拆成每天读得完的小段，陪孩子做读书笔记、写阅读卡。带过 40 多个家庭的阅读计划，家长反馈最多的是“孩子愿意自己翻开书了”。',rating:{score:4.9,count:128},certificate:'未完成资质核验',grades:'须由监护人确认适用年龄'},
   calendar:{mode:'slot',slotDurationMinutes:60,slots:['周六 09:00–10:00','周六 10:00–11:00','周日 14:00–15:00'],note:'仅开放固定时段，暂不支持指定日期。'}},
  {id:'t2',type:'tutor',title:'陈同学 · 成长规划伴学',merchant:'陈同学',category:'习惯培养',price:150,unit:'小时',icon:'🌱',tone:'mint',tag:'伴学服务',description:'围绕阅读记录、日程安排和自主习惯提供陪伴支持，不开展学科教学、解题辅导或考试培训。',location:'南岗区 · 监护人确认安排',city:'哈尔滨',remaining:1,
    tutorDetail:{name:'陈同学',school:'示范理工大学',major:'应用心理学',education:'硕士',subjects:['自主习惯','阅读记录','日程安排'],methods:['线下陪伴','线上陪伴'],experience:'成长记录与活动陪伴经历，擅长与青春期孩子沟通',intro:'应用心理学硕士在读，做成长陪伴两年。会先和孩子一起把一周的日程画出来，再逐项找到能坚持的小切口，不催不逼，靠记录看到变化。',rating:{score:4.8,count:96},certificate:'未完成资质核验',grades:'须由监护人确认适用年龄'},
   calendar:{mode:'slot',slotDurationMinutes:60,slots:['周六 09:00–10:00','周六 10:00–11:00','周日 14:00–15:00'],note:'仅开放固定时段，暂不支持指定日期。'}},
  {id:'y1',type:'course',title:'美术艺考 · 素描色彩集训',merchant:'拾光艺术中心',category:'艺考课',price:4680,unit:'32课时',icon:'🖌',tone:'lavender',tag:'艺考推荐',description:'按省统考科目安排素描、色彩、速写三科集训，含每周模考与逐张讲评。',location:'道里区 · 群力大道',city:'哈尔滨',remaining:12,
   audience:['家长'],
   address:'哈尔滨市道里区群力大道 88 号 3 层',phone:'0451-88007700',
   packages:[
    {name:'统考集训（32课时）',price:4680,lessons:32,description:'素描、色彩、速写三科轮训'},
    {name:'集训 + 校考（48课时）',price:6980,lessons:48,description:'加校考方向专项与作品集指导'}
   ],
   merchantDetail:{name:'拾光艺术中心',logo:'🎨',intro:'专注 4–12 岁少儿美育的社区机构，小班教学，课程以观察力与表达力为主线。',foundYear:2016,verified:true,address:'哈尔滨市道里区群力大道 88 号 3 层',contact:'王老师',phone:'0451-88007700',licenses:['民办学校办学许可证'],teachers:['方老师 · 素描','邵老师 · 色彩']},
   images:[{name:'主视觉 · 画室',kind:'banner',tone:'lavender',caption:'一人一画架，逐张讲评'}]},
  {id:'t3',type:'tutor',title:'孙同学 · 课业伴学（大学生）',merchant:'孙同学',category:'课业伴学',price:110,unit:'小时',icon:'🧑‍🎓',tone:'peach',tag:'大学生家教',description:'在校大学生一对一带，围绕作业节奏、错题整理与学习方法提供陪伴支持，不承诺提分。',location:'南岗区 · 监护人确认安排',city:'哈尔滨',remaining:1,
    tutorDetail:{name:'孙同学',school:'示范大学',major:'数学与应用数学',education:'本科',subjects:['课业伴学','错题整理','学习方法'],methods:['线下陪伴','线上陪伴'],experience:'两年课业陪伴经历，带过初高中数学与物理',intro:'数学与应用数学专业大三在读，两年课业陪伴经历。习惯先看孩子的错题本找规律，再陪着把当天的作业节奏走顺，不代写、不超前讲。',rating:{score:4.9,count:212},certificate:'未完成资质核验',grades:'须由监护人确认适用年龄'},
   calendar:{mode:'slot',slotDurationMinutes:60,slots:['周六 09:00–10:00','周六 10:00–11:00','周日 14:00–15:00'],note:'仅开放固定时段，暂不支持指定日期。'}},
  {id:'t4',type:'tutor',title:'王同学 · 作业陪读',merchant:'王同学',category:'作业陪读',price:95,unit:'小时',icon:'✏️',tone:'mint',tag:'作业陪读',description:'陪写作业、检查完成情况与订正，帮助孩子把当天的作业节奏走顺，不做超前讲授。',location:'道里区 · 监护人确认安排',city:'哈尔滨',remaining:1,
    tutorDetail:{name:'王同学',school:'示范师范大学',major:'小学教育',education:'本科',subjects:['作业陪读','订正检查','时间管理'],methods:['线下陪伴'],experience:'作业陪读与晚辅经历，熟悉小学各年级作业量',intro:'小学教育专业在读，做过两学期晚辅。陪写作业时只做三件事：定好顺序、盯住节奏、检查订正，让孩子在固定时间内把作业收干净。',rating:{score:4.7,count:165},certificate:'未完成资质核验',grades:'须由监护人确认适用年龄'},
   calendar:{mode:'slot',slotDurationMinutes:60,slots:['周一 18:00–19:00','周三 18:00–19:00','周五 18:00–19:00'],note:'工作日固定晚时段，暂不支持指定日期。'}},
  {id:'t5',type:'tutor',title:'赵同学 · 上门伴学',merchant:'赵同学',category:'上门辅导',price:180,unit:'小时',icon:'🏠',tone:'lavender',tag:'上门伴学',description:'老师上门陪伴学习：环境布置、计划执行与作业答疑，家长可在场旁听，不开展补课式讲授。',location:'道里区 · 上门服务',city:'哈尔滨',remaining:1,
    tutorDetail:{name:'赵同学',school:'示范理工大学',major:'计算机科学与技术',education:'硕士',subjects:['上门陪伴','计划执行','作业答疑'],methods:['上门陪伴','线上陪伴'],experience:'家庭教育陪伴经历，可协助理科作业答疑',intro:'计算机硕士在读，做上门陪伴一年多。到家里先和孩子一起把书桌与计划表理清楚，再按计划陪跑，理科作业卡住时给思路不给答案。',rating:{score:4.8,count:87},certificate:'未完成资质核验',grades:'须由监护人确认适用年龄'},
   calendar:{mode:'slot',slotDurationMinutes:90,slots:['周六 15:00–16:30','周日 09:00–10:30'],note:'上门时段含路程，实际到课以确认为准。'}},
  /* ---------- 帮忙接：个人顺路代接孩子 ---------- */
  {id:'p1',type:'bus',title:'王阿姨 · 帮忙接（同小区顺路）',merchant:'王阿姨',category:'帮忙接',price:260,unit:'月',icon:'🧍‍♀️',tone:'peach',tag:'个人接送',description:'住在同一个小区，放学顺路把孩子接回来。到校门口举牌接人，接到后直接回家，不绕路、不中途停留。',location:'道里区 · 群力小区',city:'哈尔滨',remaining:3,
   pickupDetail:{person:'王晴',gender:'女',years:3,area:'群力小区',school:'群力实验小学',childGrade:'三年级',schoolGate:'东门 3 号接送点',timeText:'放学 16:20 到校门口，17:00 前送到家',seat:3,used:1,vehicle:'步行 / 电动车',idChecked:true,credit:'实名核验 · 无犯罪记录承诺',note:'同小区邻居优先，只接本小区 3 个孩子，家长可随时微信问进度。',routes:[{name:'群力实验小学',arrival:'16:20',departure:'16:35'},{name:'群力小区',arrival:'16:55',departure:'17:00'}]}},
  {id:'p2',type:'bus',title:'李叔叔 · 私家车顺路接送',merchant:'李叔叔',category:'私家车',price:380,unit:'月',icon:'🚗',tone:'mint',tag:'私家车家长',description:'自家孩子在花园小学读二年级，开车顺路带同校孩子一段。车上配儿童安全座椅，负责校门口接到并送到楼下，交接给家长或家中老人。',location:'南岗区 · 花园小区',city:'哈尔滨',remaining:2,
   pickupDetail:{person:'李建国',gender:'男',kind:'car',years:5,area:'花园小区',school:'花园小学',childGrade:'二年级',schoolGate:'北门 1 号接送点',timeText:'放学 16:30 到校门口，17:10 前送到楼下',seat:2,used:1,vehicle:'5 座轿车 · 配安全座椅',idChecked:true,credit:'实名核验 · 无犯罪记录承诺 · 驾龄 8 年',note:'每天固定接 2 个孩子，遇堵车或临时变动会提前 20 分钟在群里说。',routes:[{name:'花园小学',arrival:'16:30',departure:'16:45'},{name:'花园小区',arrival:'17:05',departure:'17:10'}]}},
  {id:'p3',type:'bus',title:'张姐 · 帮忙接（按次也接）',merchant:'张姐',category:'帮忙接',price:35,unit:'次',icon:'🧍',tone:'lavender',tag:'可临时',description:'临时代接：家长临时加班、出差或孩子值日，提前一天说一声就能接。按次结算，也能包月。',location:'哈西 · 继红小学周边',city:'哈尔滨',remaining:4,
   pickupDetail:{person:'张敏',gender:'女',years:2,area:'哈西 · 悦城',school:'继红小学',childGrade:'四年级',schoolGate:'南门接送区',timeText:'按约定时间到校门口，接到后 40 分钟内送到家',seat:4,used:0,vehicle:'电动车 / 步行',idChecked:true,credit:'实名核验 · 无犯罪记录承诺',note:'支持临时按次，提前一天预约；接到孩子先拍照发家长，再出发。',routes:[{name:'继红小学',arrival:'16:10',departure:'16:25'},{name:'哈西 · 悦城',arrival:'16:55',departure:'17:00'}]}},
  {id:'p4',type:'bus',title:'周爸爸 · 私家车顺路接送',merchant:'周爸爸',category:'私家车',price:420,unit:'月',icon:'🚙',tone:'peach',tag:'私家车家长',description:'自家孩子和顺路孩子同校不同班，每天开车接送时多带一程。行驶路线固定、不绕路，全程只在学校和小区两点往返。',location:'香坊区 · 松雷小区',city:'哈尔滨',remaining:1,
   pickupDetail:{person:'周立',gender:'男',kind:'car',years:4,area:'松雷小区',school:'松雷小学',childGrade:'五年级',schoolGate:'西门家长等候区',timeText:'早 07:40 顺路上学 · 晚 16:40 接回小区',seat:3,used:2,vehicle:'7 座 MPV · 全员安全带',idChecked:true,credit:'实名核验 · 无犯罪记录承诺 · 驾龄 11 年 · 仅两点往返',note:'只接同校孩子，接送上车先在家长群报位置；恶劣天气停接并提前通知。',routes:[{name:'松雷小学',arrival:'16:40',departure:'16:55'},{name:'松雷小区',arrival:'17:15',departure:'17:20'}]}},
  {id:'b1',type:'bus',title:'道里安心线 · 早晚接送',merchant:'安心出行',category:'校车接送',price:580,unit:'月',icon:'🚌',tone:'peach',tag:'余位可订',description:'群力小区 → 道里家园 → 示范学校。早班 07:10，晚班 16:30。固定线路，按时接送。',location:'道里区 · 固定线路',city:'哈尔滨',remaining:8,
   busDetail:{driver:'张师傅',phone:'0451-88009900',plate:'黑A·D8801',period:['月付','学期付'],vehicle:'33 座校车',
    routes:[
     {name:'群力小区',arrival:'07:10',departure:'07:12'},
     {name:'道里家园',arrival:'07:20',departure:'07:22'},
     {name:'示范学校',arrival:'07:35',departure:'16:30'}
    ]}},
  {id:'b2',type:'bus',title:'南岗阳光线 · 早晚接送',merchant:'阳光出行',category:'校车接送',price:620,unit:'月',icon:'🚐',tone:'mint',tag:'余位可订',description:'学府小区 → 哈西社区 → 示范学校。早班 07:00，晚班 16:40。固定线路，按时接送。',location:'南岗区 · 固定线路',city:'哈尔滨',remaining:6,
   busDetail:{driver:'李师傅',phone:'0451-88007700',plate:'黑A·D8802',period:['月付','学期付'],vehicle:'19 座校车',
    routes:[
     {name:'学府小区',arrival:'07:00',departure:'07:02'},
     {name:'哈西社区',arrival:'07:15',departure:'07:17'},
     {name:'示范学校',arrival:'07:32',departure:'16:40'}
    ]}}
];

const SEED_CONTENT = {
  city: '哈尔滨',
  faq: [
    {id:'f1',category:'订单',question:'下单后多久可以确认？',answer:'下单后立即生成待支付订单，点击支付即可获得核销码；商家接单后安排服务。'},
    {id:'f2',category:'课程',question:'课程名额怎么计算？',answer:'每门课程展示剩余名额，支付成功时会再次校验名额，售完即提示冲突。'},
    {id:'f3',category:'伴学',question:'伴学可以指定具体日期吗？',answer:'可以。在报名页选择日期后，仅展示与该日期星期一致的可约时段，同一时段只能成交一单。'},
    {id:'f4',category:'校车',question:'校车怎么选上车站点？',answer:'下单时依次选择上车点和下车点，下车点必须位于上车点之后的站点，价格暂按整条线路统一计价。'},
    {id:'f5',category:'账号',question:'是否可以修改孩子/监护人信息？',answer:'可以。个人中心支持修改学员、监护人、联系方式与地址。'},
    {id:'f6',category:'售后',question:'如何退款或投诉？',answer:'可在个人中心提交意见反馈，或在订单页取消待支付订单。'}
  ],
  about: {title:'学鹭伴学',slogan:'让每一份成长都有回响',intro:'学鹭伴学是一个面向家长的本地教育服务聚合平台，覆盖精品课程、优选伴学与安心校车三类服务。',description:'平台以“看得清、买得明、可核销”为目标：课程按名额报名，伴学按时段预约，校车按周期订购。',highlights:['课程、伴学、校车一站式浏览','订单状态可追溯，核销留痕','入驻申请与机构资料公开展示'],version:'V1.0',updatedAt:'2026-10'},
  contact: {company:'学鹭伴学',phone:'0451-88000000',email:'service@xuelu.example',wechat:'xuelu-service',address:'哈尔滨市道里区群力大道 88 号',hours:'周一至周五 09:00–18:00'},
  categories: [
    {id:'art',name:'艺术启蒙',type:'course'},{id:'science',name:'科学探索',type:'course'},
    {id:'sport',name:'运动成长',type:'course'},{id:'language',name:'语言表达',type:'tutor'},
    {id:'bus',name:'校车接送',type:'bus'}
  ]
};

const TUTOR_SLOTS = [...new Set(SEED_SERVICES.filter(s => s.type === 'tutor').flatMap(s => [...s.calendar.slots]))];

/* ---------------- 机构评分（口碑） ----------------
 * 综合分 0–5（一位小数），count 为评价数，dims 为四项分维度，
 * reviews 为展示用的评价样本（不含真实用户信息）。
 */
const MERCHANT_RATINGS = {
  '拾光艺术中心': {
    score: 4.8, count: 126,
    dims: { '师资': 4.9, '环境': 4.8, '课程': 4.7, '服务': 4.8 },
    reviews: [
      { user: '橙子妈妈', score: 5, date: '2026-09-18', text: '孩子从不敢下笔，到现在主动画满一整本。王老师每节课都会单独讲评，家长在旁边也能听懂。' },
      { user: '阿哲爸爸', score: 5, date: '2026-08-30', text: '画室采光很好，每班就六七个孩子，老师顾得过来。孩子回家会自己调色了。' },
      { user: '小满', score: 4, date: '2026-07-12', text: '课程很扎实，就是周末班名额有点紧，想调课得提前一周约。' }
    ]
  },
  '未来星科创': {
    score: 4.6, count: 88,
    dims: { '师资': 4.6, '环境': 4.5, '课程': 4.7, '服务': 4.5 },
    reviews: [
      { user: '豆豆妈妈', score: 5, date: '2026-09-06', text: '六个人一组，每个孩子都能上手。孩子上完课回来给我们讲循环，讲得头头是道。' },
      { user: '老周', score: 4, date: '2026-06-21', text: '器材挺新，老师是工科出身。要是能多开一节家长旁听就更好了。' }
    ]
  },
  '跃动体育': {
    score: 4.7, count: 154,
    dims: { '师资': 4.8, '环境': 4.7, '课程': 4.6, '服务': 4.7 },
    reviews: [
      { user: '球球爸爸', score: 5, date: '2026-09-24', text: '室内木地板，下雨也不用停课。教练会盯每个人的运球动作，不是只顾着比赛。' },
      { user: '一一妈妈', score: 5, date: '2026-08-11', text: '孩子原来不爱运动，现在每周自己数着日子等上课。' },
      { user: '大刘', score: 4, date: '2026-05-30', text: '训练强度合适，就是球馆停车位少了点。' }
    ]
  },
  '学鹭学研中心': {
    score: 4.5, count: 203,
    dims: { '师资': 4.6, '环境': 4.4, '课程': 4.6, '服务': 4.4 },
    reviews: [
      { user: '考研二战的小许', score: 5, date: '2026-09-15', text: '按题型归类讲得很清楚，错题复盘那套方法我一直在用。' },
      { user: '林同学', score: 4, date: '2026-08-02', text: '自习室固定座位很省心，晚上开到十点。周末人多，去晚了没位置。' }
    ]
  },
  '职达教育': {
    score: 4.6, count: 97,
    dims: { '师资': 4.5, '环境': 4.4, '课程': 4.8, '服务': 4.6 },
    reviews: [
      { user: '考证的阿May', score: 5, date: '2026-09-20', text: '教师资格证的科目二讲得很细，老师会带着刷真题，不是照本念。' },
      { user: '老陈', score: 4, date: '2026-07-28', text: '在职党友好，晚上和周末都有班。工作日白天基本没课。' }
    ]
  }
};

module.exports = { SEED_SERVICES, SEED_CONTENT, TUTOR_SLOTS, MERCHANT_RATINGS };

};
__mods["miniprogram/utils/ui.js"] = function (module, exports, require) {
/* 页面公共助手：提示、登录守卫、加载服务目录 */

const api = require("miniprogram/utils/api.js");

function toast(title, icon) {
  wx.showToast({ title: title, icon: icon || 'none', duration: 1800 });
}

function loading(title) {
  wx.showLoading({ title: title || '加载中', mask: true });
}

function hideLoading() {
  wx.hideLoading();
}

/* 统一处理失败响应：会话失效时引导重新登录 */
function fail(res, fallback) {
  const message = (res && res.error) || fallback || '操作失败，请稍后再试';
  if (res && res.needLogin) {
    wx.showModal({
      title: '提示',
      content: '登录已过期，请重新登录',
      showCancel: false,
      success: () => wx.reLaunch({ url: '/pages/login/login' })
    });
    return;
  }
  wx.showToast({ title: message, icon: 'none', duration: 2200 });
}

/* 需要登录的页面调用：未登录跳登录页 */
function requireLogin() {
  if (!api.token()) {
    wx.showToast({ title: '请先登录', icon: 'none' });
    setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 600);
    return false;
  }
  return true;
}

function roleName(role) {
  return { parent: '家长', tutor: '大学生', institution: '机构' }[role] || '游客';
}

/* 拉取服务目录并写入全局缓存 */
function loadServices() {
  return api.services.list().then(res => {
    if (res.ok) getApp().cacheServices(res.data);
    return res;
  });
}

module.exports = { toast, loading, hideLoading, fail, requireLogin, roleName, loadServices };

};
__mods["src/runtime/boot.js"] = function (module, exports, require) {
/* ------------------------------------------------------------------ *
 * 网页版入口
 *
 * 顺序很重要：先装运行时与全局对象（Page/App/getApp/wx），再执行小程序的
 * app.js 完成 App() 注册，最后启动路由渲染首个页面。
 * 页面脚本在第一次导航时按需 require，与小程序的分包加载语义一致。
 * ------------------------------------------------------------------ */

const host = require("src/runtime/host.js");
const wxApi = require("src/runtime/wx.js");
const generated = require("@gen");

globalThis.wx = wxApi;
globalThis.Page = host.Page;
globalThis.App = host.App;
globalThis.getApp = host.getApp;
globalThis.getCurrentPages = host.getCurrentPages;

host.install(generated);

/* 先探测有没有服务端：有 → 页面走 HTTP 接口；没有（静态托管）→ 走内置本地数据。
   探测最多等 1.5 秒，不会拖慢首屏。 */
wxApi.probeBackend().then(() => {
  require("miniprogram/app.js");
  host.start();
});

};
__mods["src/runtime/host.js"] = function (module, exports, require) {
/* ------------------------------------------------------------------ *
 * 浏览器端「小程序运行时」
 *
 * 负责把 24 个小程序页面跑在网页里：
 *   Page()/App() 注册、setData → 重渲染、事件委托、页面栈与哈希路由、
 *   导航栏 / 底部 tabBar、picker（selector 底部弹层、date 原生控件）、
 *   scroll-view 滚动、焦点与滚动位置恢复。
 *
 * 渲染策略：setData 后整页重渲染（innerHTML 重建）。页面都是几十个节点，
 * 这样做最简单、不可能出现状态与视图不一致；代价是重建 DOM，因此需要
 * 在重渲染前后保存/恢复输入框焦点、光标位置与容器滚动位置。
 * ------------------------------------------------------------------ */

'use strict';

const ui = require("src/runtime/ui.js");

const state = {
  gen: null,
  app: null,
  stack: [],          // [{ route, inst, options }]
  templates: {},
  pageDefs: {},
  pendingRoute: '',
  root: null,
  nav: null,
  titleEl: null,
  backEl: null,
  tabbar: null,
  tabRoutes: new Set(),
  frame: 0,
  pendingBack: 0,
  scrollTimer: 0
};

/* ---------------- 基础工具 ---------------- */

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
}

function pathTokens(path) {
  const out = [];
  String(path).replace(/\[(\d+)\]/g, '.$1').split('.').forEach(part => {
    if (part !== '') out.push(part);
  });
  return out;
}

function setByPath(target, path, value) {
  const tokens = pathTokens(path);
  if (!tokens.length) return;
  let cursor = target;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    if (cursor[key] == null || typeof cursor[key] !== 'object') {
      cursor[key] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[tokens[tokens.length - 1]] = value;
}

function top() {
  return state.stack.length ? state.stack[state.stack.length - 1] : null;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
}

/* ---------------- Page / App ---------------- */

function Page(def) {
  if (!state.pendingRoute) {
    console.warn('[wx] Page() 在未知路由下被调用，已忽略');
    return;
  }
  state.pageDefs[state.pendingRoute] = def || {};
  state.pendingRoute = '';
}

function App(def) {
  state.app = def || {};
  if (typeof state.app.onLaunch === 'function') {
    try { state.app.onLaunch.call(state.app); } catch (err) { console.error('[wx] onLaunch 异常', err); }
  }
}

function getApp() {
  return state.app;
}

function getCurrentPages() {
  return state.stack.map(entry => entry.inst);
}

/* ---------------- 实例 ---------------- */

function createInstance(route, options) {
  if (!state.pageDefs[route]) {
    state.pendingRoute = route;
    try {
      require('miniprogram/' + route + '.js');
    } catch (err) {
      console.error('[wx] 页面脚本加载失败', route, err);
    }
  }

  const def = state.pageDefs[route] || {};
  const inst = {};
  Object.keys(def).forEach(key => { inst[key] = def[key]; });
  inst.data = clone(def.data || {});
  inst.route = route;
  inst.options = options || {};
  inst.__navTitle = '';

  inst.setData = function (patch, callback) {
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(key => setByPath(this.data, key, patch[key]));
    }
    scheduleRender(this);
    if (typeof callback === 'function') requestAnimationFrame(callback);
  };

  return inst;
}

function scheduleRender(inst) {
  if (state.frame) return;
  state.frame = requestAnimationFrame(() => {
    state.frame = 0;
    const entry = top();
    if (!entry || entry.inst !== inst) return;
    renderEntry(entry);
  });
}

/* ---------------- 渲染 ---------------- */

function captureViewState() {
  const out = { focusEl: null, focusStart: null, focusEnd: null, scrollY: window.scrollY, scrollers: {} };
  const active = document.activeElement;
  if (active && active.dataset && active.dataset.el != null && state.root.contains(active)) {
    out.focusEl = active.dataset.el;
    try {
      out.focusStart = active.selectionStart;
      out.focusEnd = active.selectionEnd;
    } catch (e) { /* 非文本控件 */ }
  }
  state.root.querySelectorAll('scroll-view[data-el]').forEach(node => {
    out.scrollers[node.dataset.el] = node.scrollTop;
  });
  return out;
}

function restoreViewState(prev, samePage) {
  if (!prev) return;
  Object.keys(prev.scrollers).forEach(key => {
    const node = state.root.querySelector(`scroll-view[data-el="${cssEscape(key)}"]`);
    if (node) node.scrollTop = prev.scrollers[key];
  });
  if (prev.focusEl != null) {
    const node = state.root.querySelector(`[data-el="${cssEscape(prev.focusEl)}"]`);
    if (node && typeof node.focus === 'function' && !node.disabled) {
      node.focus({ preventScroll: true });
      if (prev.focusStart != null) {
        try { node.setSelectionRange(prev.focusStart, prev.focusEnd); } catch (e) { /* 非文本控件 */ }
      }
    }
  }
  if (samePage) window.scrollTo(0, prev.scrollY);
}

function renderEntry(entry) {
  const template = state.templates[entry.route];
  if (typeof template !== 'function') {
    console.error('[wx] 缺少模板', entry.route);
    return;
  }

  const prev = captureViewState();
  const samePage = true;

  let html = '';
  try {
    html = template(entry.inst.data, 'p');
  } catch (err) {
    console.error('[wx] 模板渲染失败', entry.route, err);
    html = '<view class="empty">页面渲染出错，请刷新重试</view>';
  }

  const wrap = document.createElement('div');
  wrap.className = 'wx-page';
  wrap.setAttribute('data-page-id', entry.route);
  wrap.innerHTML = html;

  state.root.replaceChildren(wrap);
  restoreViewState(prev, samePage);
  upgradeControls(wrap, entry.inst);
}

/* picker 日期控件、scroll-view 滚动、空图占位 */
function upgradeControls(wrap, inst) {
  wrap.querySelectorAll('picker').forEach(node => {
    const mode = node.getAttribute('data-picker-mode');
    if (mode !== 'date') return;
    const value = node.getAttribute('data-picker-value') || '';
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'wx-date-input';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) input.value = value;
    const start = node.getAttribute('data-picker-start');
    const end = node.getAttribute('data-picker-end');
    if (start) input.min = start;
    if (end) input.max = end;
    input.addEventListener('change', () => {
      dispatch(inst, node, 'change', { value: input.value }, input);
    });
    node.replaceChildren(input);
    node.classList.add('wx-picker-native');
  });

  wrap.querySelectorAll('scroll-view').forEach(node => {
    const into = node.getAttribute('data-scroll-into');
    if (into) {
      const target = wrap.querySelector('#' + cssEscape(into));
      if (target) {
        const box = node.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        node.scrollTop += rect.top - box.top - 8;
      }
    }
    const scrollTop = node.getAttribute('data-scroll-top');
    if (scrollTop != null && scrollTop !== '') node.scrollTop = Number(scrollTop) || 0;
  });

  wrap.querySelectorAll('img').forEach(img => {
    if (!img.getAttribute('src')) {
      img.style.visibility = 'hidden';
      return;
    }
    /* 源码里有指向不存在图片的引用（如 mascot-study.jpg），失败就隐藏而不是显示裂图 */
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
    if (img.complete && img.naturalWidth === 0) img.style.visibility = 'hidden';
  });
}

/* ---------------- 事件 ---------------- */

function collectDataset(node) {
  const chain = [];
  let cursor = node;
  while (cursor && cursor !== state.root) {
    chain.unshift(cursor);
    cursor = cursor.parentElement;
  }
  const out = {};
  chain.forEach(item => {
    if (!item.getAttribute) return;
    const raw = item.getAttribute('data-ds');
    if (!raw) return;
    try { Object.assign(out, JSON.parse(raw)); } catch (e) { /* 非法 JSON 忽略 */ }
  });
  return out;
}

function dispatch(inst, node, type, detail, target) {
  const handler = node.getAttribute('data-on-' + type) || node.getAttribute('data-catch-' + type);
  if (!handler) return false;

  const fn = inst[handler];
  if (typeof fn !== 'function') {
    console.warn('[wx] 未找到事件处理函数：', inst.route, handler, `(${type})`);
    return false;
  }

  const source = target && target.nodeType === 1 ? target : node;
  const ev = {
    type,
    timeStamp: Date.now(),
    target: { id: source.id || '', dataset: collectDataset(source) },
    currentTarget: { id: node.id || '', dataset: collectDataset(node) },
    detail: detail || {},
    touches: [],
    changedTouches: [],
    preventDefault() {},
    stopPropagation() {}
  };

  try {
    fn.call(inst, ev);
  } catch (err) {
    console.error('[wx] 事件处理异常：', inst.route, handler, err);
  }
  return true;
}

function onClick(ev) {
  const entry = top();
  if (!entry) return;
  const inst = entry.inst;

  let node = ev.target;
  while (node && node !== state.root) {
    if (node.nodeType === 1) {
      if (node.tagName === 'PICKER') {
        /* 日期控件交给原生 input */
        if (node.classList.contains('wx-picker-native')) return;
        openPicker(inst, node);
        return;
      }
      if (node.hasAttribute('data-on-tap') || node.hasAttribute('data-catch-tap')) {
        dispatch(inst, node, 'tap', { x: ev.clientX, y: ev.clientY });
        if (node.hasAttribute('data-catch-tap')) return;
      }
    }
    node = node.parentElement;
  }
}

function onInput(ev) {
  const entry = top();
  if (!entry) return;
  const node = ev.target;
  if (!node || node.nodeType !== 1) return;
  const host = node.closest('[data-on-input]');
  if (!host || !state.root.contains(host)) return;
  dispatch(entry.inst, host, 'input', { value: node.value, cursor: node.selectionStart });
}

function onChange(ev) {
  const entry = top();
  if (!entry) return;
  const node = ev.target;
  if (!node || node.nodeType !== 1) return;
  const host = node.closest('[data-on-change]');
  if (!host || !state.root.contains(host)) return;
  dispatch(entry.inst, host, 'change', { value: node.value });
}

function onKeydown(ev) {
  if (ev.key !== 'Enter') return;
  const entry = top();
  if (!entry) return;
  const node = ev.target;
  if (!node || node.nodeType !== 1) return;
  if (node.tagName !== 'INPUT' && node.tagName !== 'TEXTAREA') return;
  const host = node.closest('[data-on-confirm]');
  if (!host) return;
  dispatch(entry.inst, host, 'confirm', { value: node.value });
}

/* ---------------- picker ---------------- */

function openPicker(inst, node) {
  const mode = node.getAttribute('data-picker-mode') || 'selector';
  if (mode !== 'selector') return;

  const raw = node.getAttribute('data-picker-range') || '[]';
  let range = [];
  try { range = JSON.parse(raw); } catch (e) { range = []; }
  if (!Array.isArray(range)) range = [];

  const key = node.getAttribute('data-picker-key');
  const items = range.map(item => {
    if (key && item && typeof item === 'object') return item[key];
    return item;
  });

  const currentValue = Number(node.getAttribute('data-picker-value'));
  const index = Number.isFinite(currentValue)
    ? Math.max(0, Math.min(items.length - 1, currentValue))
    : 0;

  ui.pickerSheet({ items, index }).then(picked => {
    if (picked == null) return;
    if (top() && top().inst === inst) dispatch(inst, node, 'change', { value: picked });
  });
}

/* ---------------- 导航到指定页面 ---------------- */

function parseUrl(url) {
  let raw = String(url || '').trim();
  raw = raw.replace(/^#/, '').replace(/^\//, '');
  const [rawPath, rawQuery] = raw.split('?');
  const route = rawPath.replace(/\.js$/, '').replace(/^miniprogram\//, '');
  const query = {};
  if (rawQuery) {
    rawQuery.split('&').forEach(pair => {
      if (!pair) return;
      const eq = pair.indexOf('=');
      const key = eq < 0 ? pair : pair.slice(0, eq);
      const value = eq < 0 ? '' : pair.slice(eq + 1);
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
    });
  }
  return { route, query };
}

function hashFor(route, query) {
  const parts = Object.keys(query || {})
    .filter(key => query[key] !== '' && query[key] != null)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
  return '#/' + route + (parts.length ? '?' + parts.join('&') : '');
}

function mount(entry, fresh) {
  const inst = entry.inst;

  if (fresh && typeof inst.onLoad === 'function') {
    try { inst.onLoad.call(inst, entry.options || {}); } catch (err) { console.error('[wx] onLoad 异常', entry.route, err); }
  }

  renderEntry(entry);
  applyChrome(entry);

  if (typeof inst.onShow === 'function') {
    try { inst.onShow.call(inst); } catch (err) { console.error('[wx] onShow 异常', entry.route, err); }
  }

  if (fresh) {
    requestAnimationFrame(() => {
      if (typeof inst.onReady === 'function') {
        try { inst.onReady.call(inst); } catch (err) { console.error('[wx] onReady 异常', entry.route, err); }
      }
    });
    window.scrollTo(0, 0);
  }
}

function pushEntry(route, query, opts) {
  const options = opts || {};
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }

  const prev = top();
  if (prev && typeof prev.inst.onHide === 'function') {
    try { prev.inst.onHide.call(prev.inst); } catch (err) { console.error('[wx] onHide 异常', prev.route, err); }
  }

  const inst = createInstance(route, query);
  const entry = { route, inst, options: query };
  state.stack.push(entry);

  if (!options.noHistory) {
    const url = hashFor(route, query);
    if (options.replace) history.replaceState({}, '', url);
    else history.pushState({}, '', url);
  }

  mount(entry, true);
  return true;
}

function unloadAll() {
  state.stack.slice().reverse().forEach(entry => {
    if (typeof entry.inst.onUnload === 'function') {
      try { entry.inst.onUnload.call(entry.inst); } catch (err) { console.error('[wx] onUnload 异常', entry.route, err); }
    }
  });
}

function navigateTo(url) {
  const { route, query } = parseUrl(url);
  return pushEntry(route, query, {});
}

function redirectTo(url) {
  const { route, query } = parseUrl(url);
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }
  const prev = top();
  if (prev) {
    if (typeof prev.inst.onUnload === 'function') {
      try { prev.inst.onUnload.call(prev.inst); } catch (err) { /* 忽略 */ }
    }
    state.stack.pop();
  }
  return pushEntry(route, query, { replace: true });
}

function switchTab(url) {
  const { route, query } = parseUrl(url);
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }
  unloadAll();
  state.stack = [];
  return pushEntry(route, query, {});
}

function reLaunch(url) {
  const { route, query } = parseUrl(url);
  if (!state.templates[route]) {
    console.warn('[wx] 页面不存在：', route);
    return false;
  }
  unloadAll();
  state.stack = [];
  return pushEntry(route, query, { replace: true });
}

function navigateBack(delta) {
  const step = Math.max(1, Number(delta) || 1);
  if (state.stack.length <= 1) return false;

  const removed = state.stack.splice(Math.max(0, state.stack.length - step), step);
  removed.reverse().forEach(entry => {
    if (typeof entry.inst.onUnload === 'function') {
      try { entry.inst.onUnload.call(entry.inst); } catch (err) { /* 忽略 */ }
    }
  });

  state.pendingBack = step;
  history.go(-step);

  const entry = top();
  if (entry) mount(entry, false);
  return true;
}

function onPopState() {
  if (state.pendingBack > 0) { state.pendingBack = 0; return; }

  const { route, query } = parseUrl(location.hash);
  if (!state.templates[route]) return;

  const index = state.stack.findIndex(entry => entry.route === route);
  if (index >= 0) {
    const removed = state.stack.splice(index + 1);
    removed.reverse().forEach(entry => {
      if (typeof entry.inst.onUnload === 'function') {
        try { entry.inst.onUnload.call(entry.inst); } catch (err) { /* 忽略 */ }
      }
    });
    mount(state.stack[index], false);
    return;
  }
  pushEntry(route, query, { noHistory: true });
}

/* ---------------- 页面外框 ---------------- */

const TAB_ICONS = {
  'pages/index/index': '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  'pages/learning/learning': '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M7 8h8M7 12h6"/>',
  'pages/orders/orders': '<path d="M6 3h12v17l-3-1.8-3 1.8-3-1.8L6 20z"/><path d="M9 8h6M9 12h6"/>',
  'pages/mine/mine': '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/>'
};

function buildTabbar(list) {
  const bar = state.tabbar;
  bar.replaceChildren();
  (list || []).forEach(item => {
    const button = document.createElement('button');
    button.className = 'wx-tab';
    button.setAttribute('data-route', item.pagePath);

    const icon = document.createElement('span');
    icon.className = 'wx-tab-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (TAB_ICONS[item.pagePath] || '') + '</svg>';

    const label = document.createElement('span');
    label.className = 'wx-tab-text';
    label.textContent = item.text;

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', () => {
      if (state.tabRoutes.has(item.pagePath)) switchTab(item.pagePath);
    });

    bar.appendChild(button);
  });
}

function applyChrome(entry) {
  const gen = state.gen || {};
  const meta = (gen.pageMeta && gen.pageMeta[entry.route]) || {};
  const win = gen.window || {};

  const background = meta.navigationBarBackgroundColor || win.navigationBarBackgroundColor || '#b8500f';
  const textStyle = meta.navigationBarTextStyle || win.navigationBarTextStyle || 'white';
  const title = entry.inst.__navTitle || meta.navigationBarTitleText || win.navigationBarTitleText || '学鹭伴学';

  state.nav.style.background = background;
  state.nav.classList.toggle('wx-nav-light', textStyle === 'white');
  state.titleEl.textContent = title;
  document.title = title;

  state.backEl.hidden = state.stack.length <= 1;

  const isTab = state.tabRoutes.has(entry.route);
  document.body.classList.toggle('has-tab', isTab);
  state.tabbar.hidden = !isTab;
  state.tabbar.querySelectorAll('.wx-tab').forEach(node => {
    node.classList.toggle('on', node.getAttribute('data-route') === entry.route);
  });

  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute('content', background);
}

/* ---------------- 安装与启动 ---------------- */

function install(gen) {
  state.gen = gen || {};
  state.templates = state.gen.templates || {};
  state.root = document.getElementById('wx-page');
  state.nav = document.getElementById('wx-nav');
  state.titleEl = document.getElementById('wx-nav-title');
  state.backEl = document.getElementById('wx-nav-back');
  state.tabbar = document.getElementById('wx-tabbar');

  const tabBar = state.gen.tabBar || {};
  const tabs = tabBar.list || [];
  tabs.forEach(item => state.tabRoutes.add(item.pagePath));
  buildTabbar(tabs);
  if (tabBar.backgroundColor) state.tabbar.style.background = tabBar.backgroundColor;
  state.tabbar.style.color = tabBar.color || '#a28773';

  state.backEl.addEventListener('click', () => navigateBack(1));

  state.root.addEventListener('click', onClick);
  state.root.addEventListener('input', onInput);
  state.root.addEventListener('change', onChange);
  state.root.addEventListener('keydown', onKeydown);

  window.addEventListener('popstate', onPopState);

  window.addEventListener('scroll', () => {
    if (state.scrollTimer) return;
    state.scrollTimer = setTimeout(() => {
      state.scrollTimer = 0;
      const entry = top();
      if (!entry) return;
      const inst = entry.inst;
      if (typeof inst.onPageScroll === 'function') {
        inst.onPageScroll({ scrollTop: window.scrollY });
      }
      if (typeof inst.onReachBottom === 'function') {
        const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 120;
        if (nearBottom) inst.onReachBottom();
      }
    }, 120);
  }, { passive: true });
}

function start() {
  const gen = state.gen || {};
  const pages = gen.pages || [];
  const initial = parseUrl(location.hash);
  const route = state.templates[initial.route] ? initial.route : pages[0];
  if (!route) {
    state.root.textContent = '没有可显示的页面';
    return;
  }
  pushEntry(route, initial.route ? initial.query : {}, { replace: true });
}

function setNavigationTitle(title) {
  const entry = top();
  if (!entry) return;
  entry.inst.__navTitle = title || '';
  applyChrome(entry);
}

module.exports = {
  install,
  start,
  Page,
  App,
  getApp,
  getCurrentPages,
  navigateTo,
  redirectTo,
  switchTab,
  reLaunch,
  navigateBack,
  setNavigationTitle,
  state
};

};
__mods["src/runtime/ui.js"] = function (module, exports, require) {
/* ------------------------------------------------------------------ *
 * 浏览器端 UI 原语：toast / loading / modal / 选择器底部弹层
 * 对应小程序里由基础库绘制的同名人机界面。
 * ------------------------------------------------------------------ */

'use strict';

function layer() {
  return document.getElementById('wx-layer');
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------------- toast ---------------- */

let toastNode = null;
let toastTimer = 0;

function toast(opts) {
  const o = opts || {};
  if (toastNode) { toastNode.remove(); toastNode = null; }
  clearTimeout(toastTimer);

  const node = el('div', 'wx-toast');
  const icon = o.icon === 'success' ? '✓' : o.icon === 'error' ? '✕' : o.icon === 'loading' ? '' : '';
  if (icon) {
    node.appendChild(el('div', 'wx-toast-icon ' + (o.icon === 'success' ? 'ok' : 'bad'), icon));
  }
  if (o.title) node.appendChild(el('div', 'wx-toast-text', o.title));
  if (o.icon === 'loading') node.appendChild(el('div', 'wx-spinner'));

  layer().appendChild(node);
  requestAnimationFrame(() => node.classList.add('on'));
  toastNode = node;

  toastTimer = setTimeout(() => {
    node.classList.remove('on');
    setTimeout(() => node.remove(), 220);
    if (toastNode === node) toastNode = null;
  }, o.duration == null ? 1600 : Math.max(600, o.duration));
}

/* ---------------- loading ---------------- */

let loadingDepth = 0;
let loadingNode = null;

function showLoading(opts) {
  loadingDepth++;
  if (loadingNode) return;
  const node = el('div', 'wx-mask wx-mask-clear');
  const box = el('div', 'wx-loading');
  box.appendChild(el('div', 'wx-spinner wx-spinner-lg'));
  if (opts && opts.title) box.appendChild(el('div', 'wx-loading-text', opts.title));
  node.appendChild(box);
  layer().appendChild(node);
  loadingNode = node;
}

function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth > 0 || !loadingNode) return;
  loadingNode.remove();
  loadingNode = null;
}

/* ---------------- modal ---------------- */

function modal(opts) {
  const o = opts || {};
  return new Promise(resolve => {
    const mask = el('div', 'wx-mask');
    const box = el('div', 'wx-modal');

    if (o.title) box.appendChild(el('div', 'wx-modal-title', o.title));
    if (o.content) {
      const body = el('div', 'wx-modal-body');
      body.textContent = o.content;
      box.appendChild(body);
    }

    const actions = el('div', 'wx-modal-actions');
    let settled = false;
    const finish = res => {
      if (settled) return;
      settled = true;
      mask.classList.remove('on');
      setTimeout(() => mask.remove(), 200);
      resolve(res);
    };

    if (o.showCancel !== false) {
      const cancel = el('button', 'wx-modal-btn', o.cancelText || '取消');
      cancel.addEventListener('click', () => finish({ confirm: false, cancel: true }));
      actions.appendChild(cancel);
    }
    const ok = el('button', 'wx-modal-btn wx-modal-btn-primary', o.confirmText || '确定');
    ok.addEventListener('click', () => finish({ confirm: true, cancel: false }));
    actions.appendChild(ok);
    box.appendChild(actions);

    mask.appendChild(box);
    mask.addEventListener('click', ev => {
      if (ev.target === mask) finish({ confirm: false, cancel: true });
    });
    layer().appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('on'));
  });
}

/* ---------------- 选择器（picker mode=selector） ---------------- */

function pickerSheet(opts) {
  const o = opts || {};
  const items = Array.isArray(o.items) ? o.items : [];
  const current = Number(o.index) || 0;

  return new Promise(resolve => {
    const mask = el('div', 'wx-mask wx-mask-bottom');
    const sheet = el('div', 'wx-sheet');

    const head = el('div', 'wx-sheet-head');
    const cancel = el('button', 'wx-sheet-cancel', '取消');
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      mask.classList.remove('on');
      setTimeout(() => mask.remove(), 220);
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(null));
    head.appendChild(el('div', 'wx-sheet-title', o.title || '请选择'));
    head.appendChild(cancel);
    sheet.appendChild(head);

    const list = el('div', 'wx-sheet-list');
    items.forEach((item, index) => {
      const row = el('button', 'wx-sheet-item' + (index === current ? ' on' : ''), String(item));
      row.addEventListener('click', () => finish(index));
      list.appendChild(row);
    });
    if (!items.length) list.appendChild(el('div', 'wx-sheet-empty', '暂无可选项'));
    sheet.appendChild(list);

    mask.appendChild(sheet);
    mask.addEventListener('click', ev => {
      if (ev.target === mask) finish(null);
    });
    layer().appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('on'));

    const active = list.querySelector('.wx-sheet-item.on');
    if (active) active.scrollIntoView({ block: 'center' });
  });
}

module.exports = {
  toast,
  showLoading,
  hideLoading,
  modal,
  pickerSheet,
  el,
  layer
};

};
__mods["src/runtime/wx.js"] = function (module, exports, require) {
/* ------------------------------------------------------------------ *
 * wx.* 兼容层
 *
 * 小程序页面直接调用 wx.xxx，网页版由这里提供同名同参的实现：
 *   存储 → localStorage（JSON 往返，保持原始类型）
 *   导航 → 哈希路由（host.js）
 *   toast / modal / loading → ui.js
 *   选图 → <input type=file> + canvas 转 JPEG（对齐小程序 compressImage）
 *   云开发 → 不启用（config.USE_CLOUD 为 false），调用即报错并提示
 * ------------------------------------------------------------------ */

'use strict';

const ui = require("src/runtime/ui.js");
const host = require("src/runtime/host.js");

/* ---------------- 存储 ---------------- */

const STORE_PREFIX = 'wxstore:';

function getStorageSync(key) {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (raw == null) return '';
    return JSON.parse(raw);
  } catch (err) {
    return '';
  }
}

function setStorageSync(key, value) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('[wx] 本地存储失败（可能超出配额）：', key, err);
  }
}

function removeStorageSync(key) {
  try { localStorage.removeItem(STORE_PREFIX + key); } catch (err) { /* 忽略 */ }
}

function clearStorageSync() {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch (err) { /* 忽略 */ }
}

/* ---------------- 回调封装 ---------------- */

function settle(opts, result) {
  const o = opts || {};
  if (typeof o.success === 'function') o.success(result);
  if (typeof o.complete === 'function') o.complete(result);
  return result;
}

function fail(opts, error) {
  const o = opts || {};
  if (typeof o.fail === 'function') o.fail(error);
  if (typeof o.complete === 'function') o.complete(error);
  return error;
}

/* ---------------- 导航 ---------------- */

function navigateTo(opts) {
  const o = opts || {};
  const ok = host.navigateTo(o.url);
  return ok ? settle(o, { errMsg: 'navigateTo:ok' }) : fail(o, { errMsg: 'navigateTo:fail' });
}

function redirectTo(opts) {
  const o = opts || {};
  const ok = host.redirectTo(o.url);
  return ok ? settle(o, { errMsg: 'redirectTo:ok' }) : fail(o, { errMsg: 'redirectTo:fail' });
}

function switchTab(opts) {
  const o = opts || {};
  const ok = host.switchTab(o.url);
  return ok ? settle(o, { errMsg: 'switchTab:ok' }) : fail(o, { errMsg: 'switchTab:fail' });
}

function reLaunch(opts) {
  const o = opts || {};
  const ok = host.reLaunch(o.url);
  return ok ? settle(o, { errMsg: 'reLaunch:ok' }) : fail(o, { errMsg: 'reLaunch:fail' });
}

function navigateBack(opts) {
  const o = opts || {};
  const ok = host.navigateBack(o.delta || 1);
  return ok ? settle(o, { errMsg: 'navigateBack:ok' }) : fail(o, { errMsg: 'navigateBack:fail' });
}

/* ---------------- 交互反馈 ---------------- */

function showToast(opts) {
  const o = opts || {};
  ui.toast({ title: o.title, icon: o.icon, duration: o.duration });
  return settle(o, { errMsg: 'showToast:ok' });
}

function hideToast() {
  return Promise.resolve({ errMsg: 'hideToast:ok' });
}

function showLoading(opts) {
  const o = opts || {};
  ui.showLoading({ title: o.title });
  return settle(o, { errMsg: 'showLoading:ok' });
}

function hideLoading() {
  ui.hideLoading();
  return Promise.resolve({ errMsg: 'hideLoading:ok' });
}

function showModal(opts) {
  const o = opts || {};
  return ui.modal(o).then(result => {
    if (typeof o.success === 'function') o.success(result);
    if (typeof o.complete === 'function') o.complete(result);
    return result;
  });
}

function showActionSheet(opts) {
  const o = opts || {};
  const items = o.itemList || [];
  return ui.pickerSheet({ items, index: -1, title: o.title || '' }).then(index => {
    if (index == null) return fail(o, { errMsg: 'showActionSheet:fail cancel' });
    return settle(o, { tapIndex: index, errMsg: 'showActionSheet:ok' });
  });
}

/* ---------------- 导航栏 / 页面 ---------------- */

function setNavigationBarTitle(opts) {
  const o = opts || {};
  host.setNavigationTitle(o.title || '');
  return settle(o, { errMsg: 'setNavigationBarTitle:ok' });
}

function pageScrollTo(opts) {
  const o = opts || {};
  window.scrollTo({ top: Number(o.scrollTop) || 0, behavior: o.duration ? 'smooth' : 'auto' });
  return settle(o, { errMsg: 'pageScrollTo:ok' });
}

function stopPullDownRefresh() {
  return Promise.resolve({ errMsg: 'stopPullDownRefresh:ok' });
}

/* ---------------- 设备能力 ---------------- */

function makePhoneCall(opts) {
  const o = opts || {};
  const phoneNumber = String(o.phoneNumber || '');
  if (!phoneNumber) return fail(o, { errMsg: 'makePhoneCall:fail' });

  const isTouch = matchMedia('(hover: none)').matches;
  if (isTouch) {
    window.location.href = 'tel:' + phoneNumber;
    return settle(o, { errMsg: 'makePhoneCall:ok' });
  }
  setClipboardData({ data: phoneNumber });
  ui.toast({ title: '电话已复制：' + phoneNumber });
  return settle(o, { errMsg: 'makePhoneCall:ok' });
}

function setClipboardData(opts) {
  const o = opts || {};
  const data = String(o.data == null ? '' : o.data);
  const done = () => {
    ui.toast({ title: '内容已复制' });
    settle(o, { errMsg: 'setClipboardData:ok' });
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(data).then(done).catch(() => {
      fallbackCopy(data) ? done() : fail(o, { errMsg: 'setClipboardData:fail' });
    });
    return;
  }
  fallbackCopy(data) ? done() : fail(o, { errMsg: 'setClipboardData:fail' });
}

function fallbackCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch (err) {
    return false;
  }
}

function vibrateShort() { return Promise.resolve({ errMsg: 'vibrateShort:ok' }); }
function vibrateLong() { return Promise.resolve({ errMsg: 'vibrateLong:ok' }); }

function getSystemInfoSync() {
  return {
    platform: 'web',
    brand: 'web',
    system: navigator.userAgent,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    language: navigator.language || 'zh-CN',
    version: '1.0.0',
    SDKVersion: '3.0.0'
  };
}

/* ---------------- 图片（选图 / 压缩 / 读文件） ---------------- */

const fileStore = new Map();

function chooseMedia(opts) {
  const o = opts || {};
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = (o.mediaType || ['image']).includes('video') ? 'image/*,video/*' : 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) {
      fail(o, { errMsg: 'chooseMedia:fail cancel' });
      return;
    }
    const tempFilePath = URL.createObjectURL(file);
    fileStore.set(tempFilePath, file);
    settle(o, {
      type: file.type.startsWith('video') ? 'video' : 'image',
      tempFiles: [{ tempFilePath, size: file.size, fileType: file.type.startsWith('video') ? 'video' : 'image' }]
    });
  });

  input.addEventListener('cancel', () => {
    input.remove();
    fail(o, { errMsg: 'chooseMedia:fail cancel' });
  });

  input.click();
}

/* 与小程序一致：等比缩放 + 转 JPEG */
function compressImage(opts) {
  const o = opts || {};
  const image = new Image();

  image.onload = () => {
    const maxWidth = Number(o.compressedWidth) || 1080;
    const scale = Math.min(1, maxWidth / (image.width || maxWidth));
    const width = Math.max(1, Math.round((image.width || maxWidth) * scale));
    const height = Math.max(1, Math.round((image.height || maxWidth) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const quality = Math.max(0.1, Math.min(1, (Number(o.quality) || 80) / 100));
    canvas.toBlob(blob => {
      if (!blob) {
        fail(o, { errMsg: 'compressImage:fail' });
        return;
      }
      const tempFilePath = URL.createObjectURL(blob);
      fileStore.set(tempFilePath, blob);
      settle(o, { tempFilePath });
    }, 'image/jpeg', quality);
  };

  image.onerror = () => fail(o, { errMsg: 'compressImage:fail' });
  image.src = o.src;
}

function readFile(opts) {
  const o = opts || {};
  const source = o.filePath;

  fetch(source)
    .then(response => response.blob())
    .then(blob => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        settle(o, { data: o.encoding === 'base64' || !o.encoding ? payload : dataUrl });
      };
      reader.onerror = () => fail(o, { errMsg: 'readFile:fail' });
      reader.readAsDataURL(blob);
    })
    .catch(() => fail(o, { errMsg: 'readFile:fail' }));
}

function getFileSystemManager() {
  return { readFile, writeFile() {}, access() {}, unlink() {} };
}

/* ---------------- 后端连接探测 ---------------- */

/* 页面可用两种后端：同一份构建产物，启动时探测 /api/health。
   - 有服务端：走 HTTP（数据存服务器，多设备共享）
   - 无服务端（纯静态托管）：退回小程序自带的内置数据层（存浏览器本地） */
let serverReady = false;
let probing = null;

function probeBackend() {
  if (probing) return probing;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 1500) : 0;

  probing = fetch('api/health', {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: controller ? controller.signal : undefined
  })
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null)
    .then(info => {
      serverReady = !!(info && info.ok);
      clearTimeout(timer);
      document.body.setAttribute('data-backend', serverReady ? 'server' : 'local');
      console.info(serverReady
        ? '[学鹭] 已连接服务端，数据存服务器'
        : '[学鹭] 未检测到服务端，使用浏览器本地演示数据');
      return serverReady;
    });

  return probing;
}

/* ---------------- 云开发接口映射到 HTTP ---------------- */

/* utils/api.js 通过 wx.cloud.callFunction 走「云函数模式」。
   网页版把同一次调用映射成 POST /api/<函数名>：
     { action, token, ... }  →  { code, data }  /  { code, message, needLogin }
   serverReady 为 false 时 init 抛错，api.js 的 useCloud() 随即返回 false，
   自动退回内置本地数据，所以同一份 dist 既能动态部署也能静态托管。 */
const cloud = {
  init() {
    if (!serverReady) throw new Error('未连接服务端');
  },

  callFunction(opts) {
    const o = opts || {};
    if (!serverReady) {
      setTimeout(() => {
        if (typeof o.fail === 'function') o.fail({ errMsg: '未连接服务端' });
      }, 0);
      return;
    }

    fetch('api/' + encodeURIComponent(o.name), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(o.data || {})
    })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(result => {
        if (typeof o.success === 'function') o.success({ result });
      })
      .catch(err => {
        if (typeof o.fail === 'function') o.fail({ errMsg: String((err && err.message) || err) });
      });
  },

  database() {
    throw new Error('网页版不使用云数据库');
  }
};

/* ---------------- 其它 ---------------- */

function nextTick(fn) {
  if (typeof fn === 'function') setTimeout(fn, 0);
}

function canIUse() { return true; }

function noop(name) {
  return function () { return Promise.resolve({ errMsg: name + ':ok' }); };
}

const wx = {
  /* 存储 */
  getStorageSync,
  setStorageSync,
  removeStorageSync,
  clearStorageSync,

  /* 导航 */
  navigateTo,
  redirectTo,
  switchTab,
  reLaunch,
  navigateBack,

  /* 反馈 */
  showToast,
  hideToast,
  showLoading,
  hideLoading,
  showModal,
  showActionSheet,

  /* 页面 */
  setNavigationBarTitle,
  setNavigationBarColor: noop('setNavigationBarColor'),
  pageScrollTo,
  stopPullDownRefresh,
  startPullDownRefresh: noop('startPullDownRefresh'),
  showNavigationBarLoading: noop('showNavigationBarLoading'),
  hideNavigationBarLoading: noop('hideNavigationBarLoading'),

  /* 设备 */
  makePhoneCall,
  setClipboardData,
  getClipboardData: opts => settle(opts, { data: '' }),
  vibrateShort,
  vibrateLong,
  getSystemInfoSync,
  getWindowInfo: getSystemInfoSync,

  /* 媒体 */
  chooseMedia,
  chooseImage: chooseMedia,
  compressImage,
  getFileSystemManager,

  /* 其它 */
  cloud,
  probeBackend,
  nextTick,
  canIUse,
  env: { USER_DATA_PATH: 'local://' }
};

module.exports = wx;

};
__mods["@gen"] = function (module, exports, require) {
var templates = Object.create(null);
templates["pages/index/index"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");__o.push("<view" + " class=\"hero card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"hero-text\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"hero-eyebrow\"" + ">");__o.push("GROW TOGETHER · SHINE TOGETHER");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"hero-title\"" + ">");__o.push("每一份好奇");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"hero-title hero-title-tight\"" + ">");__o.push("都值得被认真对待");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted\"" + ">");__o.push("青少年成长 · 成人在职提升，一站式找齐课程与服务");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"hero-ip\"" + ">");__o.push("\r\n      ");__o.push("<img" + " src=\"/assets/ip/mascot-rest.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"toolbar\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"city\"" + " data-on-tap=\"locate\"" + ">");__o.push("\r\n      ");__o.push("<text" + ">");__o.push("⌖");__o.push("</text>");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (city); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"search\"" + ">");__o.push("\r\n      ");__o.push("<input" + " type=\"text\"" + " placeholder=\"搜索课程 / 伴学 / 接送\"" + " value=\"" + __e(__x(function () { return (keyword); })) + '"' + " enterkeyhint=\"search\"" + " data-on-input=\"onKeyword\"" + " data-on-confirm=\"onSearch\"" + ' data-el="' + (__PATH + ".0" + ".3" + ".3" + ".1") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("<button" + " class=\"btn btn-sm search-btn\"" + " data-on-tap=\"onSearch\"" + ">");__o.push("搜索");__o.push("</button>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"quick-grid\"" + ">");__o.push("\r\n    ");{let __l0 = (quick); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"quick\"" + " data-key=\"" + __e(__x(function () { return (item.key); })) + '"' + " data-on-tap=\"openQuick\"" + ' data-ds="' + __e(JSON.stringify({ "key": __x(function () { return (item.key); }) })) + '"' + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"quick-icon\"" + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"quick-name\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"quick-desc\"" + ">");__o.push(__e(__x(function () { return (item.desc); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"segs mt\"" + ">");__o.push("\r\n    ");{let __l1 = (types); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (type === item.id ? 'seg-on' : ''); }))) + '"' + " data-type=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"onType\"" + ' data-ds="' + __e(JSON.stringify({ "type": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (subTabs.length); })) {__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"" + ("chip chip-sm " + __e(__x(function () { return (sub === 'all' ? 'chip-on' : ''); }))) + '"' + " data-sub=\"all\"" + " data-on-tap=\"onSub\"" + ' data-ds="' + __e(JSON.stringify({ "sub": "all" })) + '"' + ">");__o.push("全部");__o.push("</view>");__o.push("\r\n    ");{let __l2 = (subTabs); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"" + ("chip chip-sm " + __e(__x(function () { return (sub === item.id ? 'chip-on' : ''); }))) + '"' + " data-sub=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"onSub\"" + ' data-ds="' + __e(JSON.stringify({ "sub": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n  ");if (__x(function () { return (subHint); })) {__o.push("<view" + " class=\"sub-hint\"" + ">");__o.push(__e(__x(function () { return (subHint); })));__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (type === 'all'); })) {__o.push("\r\n    ");{let __l3 = (featured); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let group = __l3[__i3]; let index = __i3;__o.push("<view" + " class=\"feed-group\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"feed-head\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"feed-name\"" + ">");__o.push(__e(__x(function () { return (group.name); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"feed-desc\"" + ">");__o.push(__e(__x(function () { return (group.desc); })));__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<text" + " class=\"link small\"" + " data-tab=\"" + __e(__x(function () { return (group.tab); })) + '"' + " data-sub=\"" + __e(__x(function () { return (group.sub); })) + '"' + " data-on-tap=\"openGroup\"" + ' data-ds="' + __e(JSON.stringify({ "tab": __x(function () { return (group.tab); }), "sub": __x(function () { return (group.sub); }) })) + '"' + ">");__o.push("全部 " + __e(__x(function () { return (group.total); })) + " 个 ›");__o.push("</text>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"cards\"" + ">");__o.push("\r\n        ");{let __l4 = (group.items); if (!__l4) __l4 = [];for (let __i4 = 0; __i4 < __l4.length; __i4++) {let item = __l4[__i4]; let index = __i4;__o.push("<view" + " class=\"card svc\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openDetail\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"" + ("thumb tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n              ");__o.push("<text" + " class=\"svc-title ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\r\n              ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" /" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\r\n            ");__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted small ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.category); })) + " · " + __e(__x(function () { return (item.merchant); })));__o.push("</view>");__o.push("\r\n            ");if (__x(function () { return (item.tutor && item.tutor.schoolText); })) {__o.push("<view" + " class=\"tutor-line ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.tutor.schoolText); })));__o.push("</view>");}__o.push("\r\n            ");if (__x(function () { return (item.tutor && item.tutor.score); })) {__o.push("<view" + " class=\"stars\"" + ">");__o.push("\r\n              ");{let __l5 = (item.tutor.stars); if (!__l5) __l5 = [];for (let __i5 = 0; __i5 < __l5.length; __i5++) {let star = __l5[__i5]; let index = __i5;__o.push("<text" + " class=\"" + ("star " + __e(__x(function () { return (star.on ? 'on' : ''); }))) + '"' + ">");__o.push("★");__o.push("</text>");}}__o.push("\r\n              ");__o.push("<text" + " class=\"score-text\"" + ">");__o.push(__e(__x(function () { return (item.tutor.scoreText); })));__o.push("</text>");__o.push("\r\n              ");__o.push("<text" + " class=\"count-text\"" + ">");__o.push(__e(__x(function () { return (item.tutor.countText); })));__o.push("</text>");__o.push("\r\n            ");__o.push("</view>");}__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny ellipsis\"" + ">");__o.push("⌖ " + __e(__x(function () { return (item.location); })) + " · " + __e(__x(function () { return (item.remainingText); })));__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n    ");if (__x(function () { return (!featured.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("没有找到匹配的服务，试试其他关键词");__o.push("</view>");}__o.push("\r\n  ");} else if (__x(function () { return (type === 'bus'); })) {__o.push("<view" + " class=\"cards mt\"" + ">");__o.push("\r\n    ");{let __l6 = (list); if (!__l6) __l6 = [];for (let __i6 = 0; __i6 < __l6.length; __i6++) {let item = __l6[__i6]; let index = __i6;__o.push("<view" + " class=\"card bus\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openDetail\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"row gap-s grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"bus-icon\"" + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"svc-title ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.merchant); })));if (__x(function () { return (item.vehicle); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (item.vehicle); })));__o.push("</text>");}__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");if (__x(function () { return (item.pickup && item.pickup.isCar); })) {__o.push("<text" + " class=\"tag tag-warn\"" + ">");__o.push("私家车");__o.push("</text>");} else if (__x(function () { return (item.lowSeat); })) {__o.push("<text" + " class=\"tag tag-wen\"" + ">");__o.push("仅剩 " + __e(__x(function () { return (item.remaining); })));__o.push("</text>");} else {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push("余位 " + __e(__x(function () { return (item.remaining); })));__o.push("</text>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"bus-route\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"bus-stop\"" + ">");__o.push(__e(__x(function () { return (item.routeText); })));__o.push("</text>");__o.push("\r\n        ");if (__x(function () { return (item.timeText); })) {__o.push("<text" + " class=\"bus-meta\"" + ">");__o.push(__e(__x(function () { return (item.timeText); })));__o.push("</text>");} else if (__x(function () { return (item.pickup && item.pickup.timeText); })) {__o.push("<text" + " class=\"bus-meta\"" + ">");__o.push(__e(__x(function () { return (item.pickup.timeText); })));__o.push("</text>");}__o.push("\r\n        ");if (__x(function () { return (item.pickup && item.pickup.childText); })) {__o.push("<text" + " class=\"bus-meta\"" + ">");__o.push(__e(__x(function () { return (item.pickup.childText); })));__o.push("</text>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"between bus-foot\"" + ">");__o.push("\r\n        ");if (__x(function () { return (item.pickup); })) {__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.pickup.area); })) + " · " + __e(__x(function () { return (item.pickup.seatText); })));__o.push("</text>");} else {__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.stops); })) + " 个站点 · " + __e(__x(function () { return (item.location); })));__o.push("</text>");}__o.push("\r\n        ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" /" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n    ");if (__x(function () { return (!list.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("没有找到匹配的校车线路");__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");} else {__o.push("<view" + " class=\"cards mt\"" + ">");__o.push("\r\n    ");{let __l7 = (list); if (!__l7) __l7 = [];for (let __i7 = 0; __i7 < __l7.length; __i7++) {let item = __l7[__i7]; let index = __i7;__o.push("<view" + " class=\"card svc\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openDetail\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"" + ("thumb tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"svc-title ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" /" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted small ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.category); })) + " · " + __e(__x(function () { return (item.merchant); })));__o.push("</view>");__o.push("\r\n        ");if (__x(function () { return (item.tutor && item.tutor.schoolText); })) {__o.push("<view" + " class=\"tutor-line ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.tutor.schoolText); })));__o.push("</view>");}__o.push("\r\n        ");if (__x(function () { return (item.tutor && item.tutor.score); })) {__o.push("<view" + " class=\"stars\"" + ">");__o.push("\r\n          ");{let __l8 = (item.tutor.stars); if (!__l8) __l8 = [];for (let __i8 = 0; __i8 < __l8.length; __i8++) {let star = __l8[__i8]; let index = __i8;__o.push("<text" + " class=\"" + ("star " + __e(__x(function () { return (star.on ? 'on' : ''); }))) + '"' + ">");__o.push("★");__o.push("</text>");}}__o.push("\r\n          ");__o.push("<text" + " class=\"score-text\"" + ">");__o.push(__e(__x(function () { return (item.tutor.scoreText); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"count-text\"" + ">");__o.push(__e(__x(function () { return (item.tutor.countText); })));__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");}__o.push("\r\n        ");__o.push("<view" + " class=\"muted tiny ellipsis\"" + ">");__o.push("⌖ " + __e(__x(function () { return (item.location); })) + " · " + __e(__x(function () { return (item.remainingText); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n    ");if (__x(function () { return (!list.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("这个分类还没有服务，换个分类看看");__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"float-assistant\"" + " data-on-tap=\"openAssistant\"" + ">");__o.push("\r\n    ");__o.push("<img" + " src=\"/assets/ip/mascot-front.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n    ");__o.push("<text" + ">");__o.push("问鹭鹭");__o.push("</text>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/learning/learning"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");__o.push("<view" + " class=\"head\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"head-title\"" + ">");__o.push("学习资源");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("按考公、考研、考编、职考技能与科目，浏览已入驻机构开设的课程");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<img" + " class=\"head-ip\"" + " src=\"/assets/ip/mascot-side.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"chips mt\"" + ">");__o.push("\r\n    ");{let __l0 = (kinds); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (kind === item.id ? 'chip-on' : ''); }))) + '"' + " data-kind=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"onKind\"" + ' data-ds="' + __e(JSON.stringify({ "kind": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");if (__x(function () { return (subjects.length); })) {__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"" + ("chip chip-sm " + __e(__x(function () { return (subject === '全部' ? 'chip-on' : ''); }))) + '"' + " data-subject=\"全部\"" + " data-on-tap=\"onSubject\"" + ' data-ds="' + __e(JSON.stringify({ "subject": "全部" })) + '"' + ">");__o.push("全部科目");__o.push("</view>");__o.push("\r\n    ");{let __l1 = (subjects); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"" + ("chip chip-sm " + __e(__x(function () { return (subject === item ? 'chip-on' : ''); }))) + '"' + " data-subject=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onSubject\"" + ' data-ds="' + __e(JSON.stringify({ "subject": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");if (__x(function () { return (kindTip); })) {__o.push("<view" + " class=\"kind-tip\"" + ">");__o.push(__e(__x(function () { return (kindTip); })));__o.push("</view>");}__o.push("\r\n\r\n  ");if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("正在加载课程…");__o.push("</view>");} else if (__x(function () { return (items.length); })) {__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\r\n    ");{let __l2 = (items); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"card course\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openItem\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"" + ("thumb tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"path\"" + ">");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (item.kindName); })));__o.push("</text>");__o.push("<text" + " class=\"path-sep\"" + ">");__o.push("›");__o.push("</text>");__o.push("<text" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (item.subject); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"course-title\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted tiny ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.description); })));__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"meta muted tiny\"" + ">");__o.push("\r\n          ");__o.push("<text" + ">");__o.push("🏫 " + __e(__x(function () { return (item.merchant); })));__o.push("</text>");__o.push("\r\n          ");if (__x(function () { return (item.location); })) {__o.push("<text" + ">");__o.push("⌖ " + __e(__x(function () { return (item.location); })));__o.push("</text>");}__o.push("\r\n          ");__o.push("<text" + ">");__o.push(__e(__x(function () { return (item.packages ? item.packages + ' 个套餐' : '默认套餐'); })));__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"between mt-s\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" / " + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"link small\"" + ">");__o.push("查看课程 ›");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("这个方向暂时还没有上架的课程，换个科目看看");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("继续准备");__o.push("</view>");__o.push("\r\n  ");__o.push("<view" + " class=\"quick-row\"" + ">");__o.push("\r\n    ");{let __l3 = (quick); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let item = __l3[__i3]; let index = __i3;__o.push("<view" + " class=\"quick\"" + " data-page=\"" + __e(__x(function () { return (item.page); })) + '"' + " data-on-tap=\"openQuick\"" + ' data-ds="' + __e(JSON.stringify({ "page": __x(function () { return (item.page); }) })) + '"' + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"quick-icon\"" + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"quick-name\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"quick-desc\"" + ">");__o.push(__e(__x(function () { return (item.desc); })));__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/orders/orders"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {if (__x(function () { return (guest); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"empty\"" + ">");__o.push("登录后查看你的订单");__o.push("</view>");__o.push("\n  ");__o.push("<button" + " class=\"btn btn-block\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\n");__o.push("</view>");} else if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"empty\"" + ">");__o.push("加载中…");__o.push("</view>");__o.push("\n");__o.push("</view>");} else {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (stats); })) {__o.push("<view" + " class=\"card stats\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"stat\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("订单");__o.push("</text>");__o.push("<strong" + ">");__o.push(__e(__x(function () { return (stats.total); })));__o.push("</strong>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"stat\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("待支付");__o.push("</text>");__o.push("<strong" + ">");__o.push(__e(__x(function () { return (stats.pending); })));__o.push("</strong>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"stat\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("待核销");__o.push("</text>");__o.push("<strong" + ">");__o.push(__e(__x(function () { return (stats.paid); })));__o.push("</strong>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"stat\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("交易额");__o.push("</text>");__o.push("<strong" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (stats.amountText); })));__o.push("</strong>");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("<view" + " class=\"chips mt\"" + ">");__o.push("\n    ");{let __l0 = (filters); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (filter === item.id ? 'chip-on' : ''); }))) + '"' + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"onFilter\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");{let __l1 = (list); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.number); })) + " · " + __e(__x(function () { return (item.createdAt); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (item.statusTone === 'ok' ? 'tag-ok' : item.statusTone === 'warn' ? 'tag-warn' : 'tag-muted'); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.statusText); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"title mt-s\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("\n      ");if (__x(function () { return (item.packageName); })) {__o.push("套餐：" + __e(__x(function () { return (item.packageName); })));__o.push("<br" + ">");__o.push("</br>");}__o.push("\n      学员：" + __e(__x(function () { return (item.student); })) + " · " + __e(__x(function () { return (item.phoneMasked); })));__o.push("<br" + ">");__o.push("</br>");__o.push("\n      ");if (__x(function () { return (item.sessionText && item.sessionText !== '—'); })) {__o.push("预约课次：" + __e(__x(function () { return (item.sessionText); })));__o.push("<br" + ">");__o.push("</br>");}__o.push("\n      ");if (__x(function () { return (item.startPoint); })) {__o.push("乘车：" + __e(__x(function () { return (item.startPoint); })) + " → " + __e(__x(function () { return (item.endPoint); })) + " · " + __e(__x(function () { return (item.period); })));__o.push("<br" + ">");__o.push("</br>");}__o.push("\n      ");if (__x(function () { return (item.busInfo); })) {__o.push("车辆与司机：" + __e(__x(function () { return (item.busInfo); })));__o.push("<br" + ">");__o.push("</br>");}__o.push("\n      ");if (__x(function () { return (item.code); })) {__o.push("服务核销码：");__o.push("<strong" + " class=\"link\"" + ">");__o.push(__e(__x(function () { return (item.code); })));__o.push("</strong>");}__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"price\"" + ">");__o.push("¥" + __e(__x(function () { return (item.amountText); })));__o.push("</text>");__o.push("\n      ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\n        ");if (__x(function () { return (item.status === 'pending'); })) {__o.push("<button" + " class=\"btn btn-ghost btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"cancel\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("取消订单");__o.push("</button>");}__o.push("\n        ");if (__x(function () { return (item.status === 'pending'); })) {__o.push("<button" + " class=\"btn btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"pay\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("立即支付");__o.push("</button>");}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}}__o.push("\n\n  ");if (__x(function () { return (!list.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("还没有相关订单，去发现一门好课吧");__o.push("</view>");}__o.push("\n");__o.push("</view>");}__o.push("\n");}return __o.join("");};
templates["pages/mine/mine"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");if (__x(function () { return (user); })) {__o.push("<view" + " class=\"card user\"" + ">");__o.push("\r\n    ");__o.push("<img" + " class=\"avatar\"" + " src=\"/assets/ip/mascot-side.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"title\"" + ">");__o.push(__e(__x(function () { return (user.phone); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("身份：" + __e(__x(function () { return (roleName); })) + " · ID " + __e(__x(function () { return (user.id); })));__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<button" + " class=\"btn btn-ghost btn-sm\"" + " data-on-tap=\"logout\"" + ">");__o.push("退出");__o.push("</button>");__o.push("\r\n  ");__o.push("</view>");} else {__o.push("<view" + " class=\"card user\"" + ">");__o.push("\r\n    ");__o.push("<img" + " class=\"avatar\"" + " src=\"/assets/ip/mascot-rest.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"title\"" + ">");__o.push("未登录");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("登录后可管理学员档案与订单");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<button" + " class=\"btn btn-sm\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (user); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin: 0\"" + ">");__o.push("学员档案");__o.push("</view>");__o.push("\r\n      ");__o.push("<button" + " class=\"btn btn-plain btn-sm\"" + " data-on-tap=\"addStudent\"" + ">");__o.push("＋ 添加学员");__o.push("</button>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("学段选择「高中」后，可使用升学规划参考");__o.push("</view>");__o.push("\r\n    ");{let __l0 = (students); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"line-row\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"row gap-s grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n          ");if (__x(function () { return (item.stage); })) {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item.stage); })));__o.push("</text>");}__o.push("\r\n          ");if (__x(function () { return (item.age); })) {__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.age); })) + " 岁");__o.push("</text>");}__o.push("\r\n          ");if (__x(function () { return (item.gender && item.gender !== '未填写'); })) {__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.gender); })));__o.push("</text>");}__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"link small\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"editStudent\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("编辑");__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"link small\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"removeStudent\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("删除");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");if (__x(function () { return (item.guardian); })) {__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("监护人：" + __e(__x(function () { return (item.guardian); })) + " · " + __e(__x(function () { return (item.relation); })) + " · " + __e(__x(function () { return (item.phone); })));__o.push("</view>");}__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n    ");if (__x(function () { return (!students.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("还没有学员信息，点击右上角添加");__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goLearning\"" + ">");__o.push("<text" + ">");__o.push("📖 学习资源");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goInstitutions\"" + ">");__o.push("<text" + ">");__o.push("🏛 机构目录");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goFeedback\"" + ">");__o.push("<text" + ">");__o.push("✉ 意见反馈" + __e(__x(function () { return (feedbackCount ? '（' + feedbackCount + '）' : ''); })));__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goHelp\"" + ">");__o.push("<text" + ">");__o.push("？ 帮助中心");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (user && user.role === 'institution'); })) {__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goInstitution\"" + ">");__o.push("<text" + ">");__o.push("🏢 机构工作台");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (user && user.role === 'tutor'); })) {__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goCompanion\"" + ">");__o.push("<text" + ">");__o.push("🧑‍🎓 伴学详情");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (!user || (user && user.role !== 'institution')); })) {__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goJoin\"" + ">");__o.push("<text" + ">");__o.push("＋ 我要入驻");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");__o.push("<view" + " class=\"menu\"" + " data-on-tap=\"goAdmin\"" + ">");__o.push("<text" + ">");__o.push("⚙ 平台管理");__o.push("</text>");__o.push("<text" + " class=\"arrow\"" + ">");__o.push("›");__o.push("</text>");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"muted tiny center mt-l\"" + ">");__o.push("学鹭伴学 · 让每一份成长都有回响");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (showEdit); })) {__o.push("<view" + " class=\"mask\"" + " data-on-tap=\"closeEdit\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"sheet\"" + " data-catch-tap=\"noop\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push(__e(__x(function () { return (editing === null || editing === undefined ? '添加学员' : '编辑学员'); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("姓名");__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (editName); })) + '"' + " data-field=\"editName\"" + " data-on-input=\"onEditField\"" + " placeholder=\"请填写学员姓名\"" + " maxlength=\"30\"" + ' data-ds="' + __e(JSON.stringify({ "field": "editName" })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("年龄");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (editAge); })) + '"' + " data-field=\"editAge\"" + " data-on-input=\"onEditField\"" + " placeholder=\"选填\"" + " maxlength=\"2\"" + ' data-ds="' + __e(JSON.stringify({ "field": "editAge" })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".5" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("性别");__o.push("</text>");__o.push("\r\n          ");__o.push("<picker" + " class=\"picker\"" + " data-on-change=\"onEditGender\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (['男','女','未填写']); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (editGender === '男' ? 0 : editGender === '女' ? 1 : 2); })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".5" + ".3" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (editGender); })));__o.push("</picker>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("学段");__o.push("</text>");__o.push("\r\n        ");__o.push("<picker" + " class=\"picker\"" + " data-on-change=\"onEditStage\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (stages); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (stages.indexOf(editStage) >= 0 ? stages.indexOf(editStage) : 0); })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".7" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (editStage || '请选择学段'); })));__o.push("</picker>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("监护人");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (editGuardian); })) + '"' + " data-field=\"editGuardian\"" + " data-on-input=\"onEditField\"" + " placeholder=\"选填\"" + " maxlength=\"30\"" + ' data-ds="' + __e(JSON.stringify({ "field": "editGuardian" })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".9" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("关系");__o.push("</text>");__o.push("\r\n          ");__o.push("<picker" + " class=\"picker\"" + " data-on-change=\"onEditRelation\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (['父亲','母亲','家长','祖父母','其他监护人']); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (['父亲','母亲','家长','祖父母','其他监护人'].indexOf(editRelation) >= 0 ? ['父亲','母亲','家长','祖父母','其他监护人'].indexOf(editRelation) : 2); })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".9" + ".3" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (editRelation); })));__o.push("</picker>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("监护人手机号");__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (editPhone); })) + '"' + " data-field=\"editPhone\"" + " data-on-input=\"onEditField\"" + " placeholder=\"选填\"" + " maxlength=\"11\"" + ' data-ds="' + __e(JSON.stringify({ "field": "editPhone" })) + '"' + ' data-el="' + (__PATH + ".0" + ".14" + ".1" + ".11" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"row gap mt-l\"" + ">");__o.push("\r\n        ");__o.push("<button" + " class=\"btn btn-ghost grow\"" + " data-on-tap=\"closeEdit\"" + ">");__o.push("取消");__o.push("</button>");__o.push("\r\n        ");__o.push("<button" + " class=\"btn grow\"" + " data-on-tap=\"saveStudent\"" + ">");__o.push("保存");__o.push("</button>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"float-assistant\"" + " data-on-tap=\"openAssistant\"" + ">");__o.push("\r\n    ");__o.push("<img" + " src=\"/assets/ip/mascot-front.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n    ");__o.push("<text" + ">");__o.push("问鹭鹭");__o.push("</text>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/login/login"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page login-page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"brand\"" + ">");__o.push("\n    ");__o.push("<img" + " class=\"brand-ip\"" + " src=\"/assets/ip/mascot-rest.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\n    ");__o.push("<view" + " class=\"brand-name\"" + ">");__o.push("学鹭伴学");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted\"" + ">");__o.push("让每一份成长都有回响");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("选择身份");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"roles\"" + ">");__o.push("\n      ");{let __l0 = (roles); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("role " + __e(__x(function () { return (role === item.id ? 'role-on' : ''); }))) + '"' + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"switchRole\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\n        ");__o.push("<text" + " class=\"role-name\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.desc); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"segs mt\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (mode === 'login' ? 'seg-on' : ''); }))) + '"' + " data-on-tap=\"switchMode\"" + ">");__o.push("登录");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (mode === 'register' ? 'seg-on' : ''); }))) + '"' + " data-on-tap=\"switchMode\"" + ">");__o.push("注册");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("手机号");__o.push("</text>");__o.push("\n      ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " maxlength=\"11\"" + " value=\"" + __e(__x(function () { return (phone); })) + '"' + " data-field=\"phone\"" + " data-on-input=\"onField\"" + " placeholder=\"请填写 11 位手机号\"" + ' data-ds="' + __e(JSON.stringify({ "field": "phone" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".7" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("密码");__o.push("</text>");__o.push("\n      ");__o.push("<input" + " type=\"password\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (password); })) + '"' + " data-field=\"password\"" + " data-on-input=\"onField\"" + " placeholder=\"" + __e(__x(function () { return (mode === 'register' ? '8–128 位密码' : '请填写密码'); })) + '"' + ' data-ds="' + __e(JSON.stringify({ "field": "password" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".9" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<button" + " class=\"btn btn-block mt-l\"" + " loading=\"" + __e(__x(function () { return (submitting); })) + '"' + " data-on-tap=\"submit\"" + ">");__o.push(__e(__x(function () { return (mode === 'login' ? '登录' : '注册并登录'); })));__o.push("</button>");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-plain btn-block mt-s\"" + " data-on-tap=\"wxLogin\"" + ">");__o.push("微信一键登录");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/detail/detail"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {if (__x(function () { return (view); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");__o.push("<view" + " class=\"" + ("banner tone-" + __e(__x(function () { return (view.tone); }))) + '"' + ">");__o.push("\r\n    ");__o.push("<text" + " class=\"banner-icon\"" + ">");__o.push(__e(__x(function () { return (view.icon); })));__o.push("</text>");__o.push("\r\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"banner-title\"" + ">");__o.push(__e(__x(function () { return (view.title); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"banner-sub\"" + ">");__o.push(__e(__x(function () { return (view.category); })) + " · " + __e(__x(function () { return (view.merchantName); })));__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.tag); })) {__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (view.tag); })));__o.push("</text>");}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"price\"" + ">");__o.push("¥" + __e(__x(function () { return (view.priceText); })));__o.push("<text" + " class=\"small muted\"" + ">");__o.push(" /" + __e(__x(function () { return (view.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (view.type === 'tutor' ? '预约后锁定所选时段' : '剩余名额 ' + view.remaining); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"muted mt-s\"" + ">");__o.push("⌖ " + __e(__x(function () { return (view.location); })) + " · " + __e(__x(function () { return (view.city); })));__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"pre mt\"" + ">");__o.push(__e(__x(function () { return (view.description); })));__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");if (__x(function () { return (view.images.length); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("课程现场");__o.push("</view>");__o.push("\r\n    ");{let __l0 = (view.images); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("img-block tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"img-icon\"" + ">");__o.push(__e(__x(function () { return (view.icon); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\r\n        ");if (__x(function () { return (item.caption); })) {__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (item.caption); })));__o.push("</view>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");if (__x(function () { return (view.packages.length); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("课程套餐");__o.push("</view>");__o.push("\r\n    ");{let __l1 = (view.packages); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"line-row\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n        ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("</text>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (item.lessons); })) + " 课次");__o.push("</view>");__o.push("\r\n      ");if (__x(function () { return (item.description); })) {__o.push("<view" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (item.description); })));__o.push("</view>");}__o.push("\r\n      ");if (__x(function () { return (item.src); })) {__o.push("<video" + " class=\"pkg-video\"" + " src=\"" + __e(__x(function () { return (item.src); })) + '"' + " controls" + ">");__o.push("</video>");}__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");if (__x(function () { return (view.tutor); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("伴学老师");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"tutor-head\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"tutor-avatar\"" + ">");__o.push(__e(__x(function () { return (view.tutor.initial); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"tutor-name\"" + ">");__o.push(__e(__x(function () { return (view.tutor.name); })));__o.push("</text>");__o.push("\r\n          ");if (__x(function () { return (view.tutor.education); })) {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (view.tutor.education); })));__o.push("</text>");}__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"tutor-school\"" + ">");__o.push(__e(__x(function () { return (view.tutor.school); })));if (__x(function () { return (view.tutor.major); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (view.tutor.major); })));__o.push("</text>");}__o.push("</view>");__o.push("\r\n        ");if (__x(function () { return (view.tutor.score); })) {__o.push("<view" + " class=\"stars mt-s\"" + ">");__o.push("\r\n          ");{let __l2 = (view.tutor.stars); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let star = __l2[__i2]; let index = __i2;__o.push("<text" + " class=\"" + ("star " + __e(__x(function () { return (star.on ? 'on' : ''); }))) + '"' + ">");__o.push("★");__o.push("</text>");}}__o.push("\r\n          ");__o.push("<text" + " class=\"score-text\"" + ">");__o.push(__e(__x(function () { return (view.tutor.scoreText); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"count-text\"" + ">");__o.push(__e(__x(function () { return (view.tutor.countText); })));__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");} else {__o.push("<view" + " class=\"count-text\"" + ">");__o.push("暂无评价");__o.push("</view>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n\r\n    ");if (__x(function () { return (view.tutor.intro); })) {__o.push("<view" + " class=\"tutor-intro\"" + ">");__o.push(__e(__x(function () { return (view.tutor.intro); })));__o.push("</view>");}__o.push("\r\n\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("就读学校");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.tutor.school); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.tutor.major); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("所学专业");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.tutor.major); })));__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("学历");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.tutor.education); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("适教说明");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.tutor.grades); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("资质核验");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.tutor.certificate); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("伴学方向");__o.push("</text>");__o.push("<view" + " class=\"chips mt-s\"" + ">");{let __l3 = (view.tutor.subjects); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let item = __l3[__i3]; let index = __i3;__o.push("<text" + " class=\"chip\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("</view>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("服务方式");__o.push("</text>");__o.push("<view" + " class=\"chips mt-s\"" + ">");{let __l4 = (view.tutor.methods); if (!__l4) __l4 = [];for (let __i4 = 0; __i4 < __l4.length; __i4++) {let item = __l4[__i4]; let index = __i4;__o.push("<text" + " class=\"chip\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("</view>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("经历");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (view.tutor.experience); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.slotNote); })) {__o.push("<view" + " class=\"banner mt\"" + ">");__o.push(__e(__x(function () { return (view.slotNote); })));__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");if (__x(function () { return (view.bus && !view.bus.pickup); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("线路与时刻");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("驾驶员");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.driver); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("车牌");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.plate); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("车型");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.vehicle); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("经停站点");__o.push("</view>");__o.push("\r\n    ");{let __l5 = (view.bus.routes); if (!__l5) __l5 = [];for (let __i5 = 0; __i5 < __l5.length; __i5++) {let item = __l5[__i5]; let index = __i5;__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("\r\n      ");__o.push("<text" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("到 " + __e(__x(function () { return (item.arrival); })) + " · 发 " + __e(__x(function () { return (item.departure); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (view.bus.pickup); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.isCar ? '私家车 · 车主资料' : '帮忙接 · 接送人资料'); })));__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"pickup-head\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"pickup-avatar\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.initial); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.person); })));__o.push("</text>");__o.push("\r\n          ");if (__x(function () { return (view.bus.pickup.gender); })) {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.gender); })));__o.push("</text>");}__o.push("\r\n          ");if (__x(function () { return (view.bus.pickup.isCar); })) {__o.push("<text" + " class=\"tag tag-warn\"" + ">");__o.push("私家车家长");__o.push("</text>");}__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.yearsText); })) + " · " + __e(__x(function () { return (view.bus.pickup.area); })));__o.push("</view>");__o.push("\r\n        ");if (__x(function () { return (view.bus.pickup.idChecked); })) {__o.push("<view" + " class=\"tag tag-ok mt-s\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.credit); })));__o.push("</view>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("接送学校");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.school); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.bus.pickup.childGrade); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("自家孩子");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.childGrade); })) + " · 同校顺路");__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (view.bus.pickup.schoolGate); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("接送点");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.schoolGate); })));__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("接送时段");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.timeText); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.bus.pickup.vehicle); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("接送方式");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.vehicle); })));__o.push("</text>");__o.push("</view>");}__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("可接人数");__o.push("</text>");__o.push("<text" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.seat); })) + " 人（已接 " + __e(__x(function () { return (view.bus.pickup.used); })) + "，" + __e(__x(function () { return (view.bus.pickup.seatText); })) + "）");__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.bus.pickup.note); })) {__o.push("<view" + " class=\"pickup-note\"" + ">");__o.push(__e(__x(function () { return (view.bus.pickup.note); })));__o.push("</view>");}__o.push("\r\n\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("接送流程");__o.push("</view>");__o.push("\r\n    ");{let __l6 = (view.bus.routes); if (!__l6) __l6 = [];for (let __i6 = 0; __i6 < __l6.length; __i6++) {let item = __l6[__i6]; let index = __i6;__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("\r\n      ");__o.push("<text" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("到 " + __e(__x(function () { return (item.arrival); })) + " · 离 " + __e(__x(function () { return (item.departure); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");if (__x(function () { return (view.merchant && view.merchant.name); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("机构与师资");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (view.merchant.name); })));__o.push("</text>");__o.push("\r\n        ");if (__x(function () { return (view.merchant.verified); })) {__o.push("<text" + " class=\"tag tag-ok\"" + ">");__o.push("已认证");__o.push("</text>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");if (__x(function () { return (view.type === 'course'); })) {__o.push("<text" + " class=\"link small\"" + " data-on-tap=\"goMerchant\"" + ">");__o.push("机构主页 ↗");__o.push("</text>");}__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.merchant.intro); })) {__o.push("<view" + " class=\"small mt-s\"" + ">");__o.push(__e(__x(function () { return (view.merchant.intro); })));__o.push("</view>");}__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between mt-s\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("地址");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (view.merchant.address); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted\"" + ">");__o.push("联系人");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (view.merchant.contact); })) + " " + __e(__x(function () { return (view.merchant.phone); })));__o.push("</text>");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (view.merchant.teachers.length); })) {__o.push("<view" + " class=\"line-row\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"muted\"" + ">");__o.push("师资");__o.push("</text>");__o.push("\r\n      ");__o.push("<view" + " class=\"chips mt-s\"" + ">");{let __l7 = (view.merchant.teachers); if (!__l7) __l7 = [];for (let __i7 = 0; __i7 < __l7.length; __i7++) {let item = __l7[__i7]; let index = __i7;__o.push("<text" + " class=\"chip\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (view.merchant.licenses.length); })) {__o.push("<view" + " class=\"line-row\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"muted\"" + ">");__o.push("资质");__o.push("</text>");__o.push("\r\n      ");__o.push("<view" + " class=\"chips mt-s\"" + ">");{let __l8 = (view.merchant.licenses); if (!__l8) __l8 = [];for (let __i8 = 0; __i8 < __l8.length; __i8++) {let item = __l8[__i8]; let index = __i8;__o.push("<text" + " class=\"chip\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"footer-bar\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"price\"" + ">");__o.push("¥" + __e(__x(function () { return (view.priceText); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push(" /" + __e(__x(function () { return (view.unit); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<button" + " class=\"btn\"" + " data-on-tap=\"goBooking\"" + ">");__o.push("立即报名");__o.push("</button>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n");__o.push("</view>");} else if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("<view" + " class=\"empty\"" + ">");__o.push("加载中…");__o.push("</view>");__o.push("</view>");}__o.push("\r\n");}return __o.join("");};
templates["pages/booking/booking"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"title ellipsis\"" + ">");__o.push(__e(__x(function () { return (title); })));__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (type === 'course' ? '精品课程' : type === 'tutor' ? '优选伴学' : '安心校车'); })) + " · 余位 " + __e(__x(function () { return (remaining); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"price\"" + ">");__o.push("¥" + __e(__x(function () { return (amountText); })));__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (type === 'tutor' && sessions.length); })) {__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("已选 " + __e(__x(function () { return (sessions.length); })) + " 个课次（按课次计价）");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (type === 'course' && packageId); })) {__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("按所选套餐计价");__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("报名信息");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("学生姓名");__o.push("</text>");__o.push("\r\n      ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (student); })) + '"' + " data-field=\"student\"" + " data-on-input=\"onField\"" + " placeholder=\"请填写学生姓名\"" + " maxlength=\"30\"" + ' data-ds="' + __e(JSON.stringify({ "field": "student" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("监护人手机号");__o.push("</text>");__o.push("\r\n      ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (phone); })) + '"' + " data-field=\"phone\"" + " data-on-input=\"onField\"" + " placeholder=\"11 位手机号\"" + " maxlength=\"11\"" + ' data-ds="' + __e(JSON.stringify({ "field": "phone" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".5" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("学员年龄");__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (age); })) + '"' + " data-field=\"age\"" + " data-on-input=\"onField\"" + " placeholder=\"选填\"" + " maxlength=\"2\"" + ' data-ds="' + __e(JSON.stringify({ "field": "age" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".7" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("性别");__o.push("</text>");__o.push("\r\n        ");__o.push("<picker" + " class=\"picker\"" + " data-on-change=\"onGenderChange\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (genders); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (genders.indexOf(gender) >= 0 ? genders.indexOf(gender) : 2); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".7" + ".3" + ".3") + '"' + ">");__o.push("\r\n          " + __e(__x(function () { return (gender); })) + "\r\n        ");__o.push("</picker>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("监护人称呼");__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (guardian); })) + '"' + " data-field=\"guardian\"" + " data-on-input=\"onField\"" + " placeholder=\"选填\"" + " maxlength=\"30\"" + ' data-ds="' + __e(JSON.stringify({ "field": "guardian" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".9" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("与学员关系");__o.push("</text>");__o.push("\r\n        ");__o.push("<picker" + " class=\"picker\"" + " data-on-change=\"onRelationChange\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (relations); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (relations.indexOf(relation) >= 0 ? relations.indexOf(relation) : 2); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".9" + ".3" + ".3") + '"' + ">");__o.push("\r\n          " + __e(__x(function () { return (relation || '家长'); })) + "\r\n        ");__o.push("</picker>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("备用手机号");__o.push("</text>");__o.push("\r\n      ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (guardianPhone); })) + '"' + " data-field=\"guardianPhone\"" + " data-on-input=\"onField\"" + " placeholder=\"选填\"" + " maxlength=\"11\"" + ' data-ds="' + __e(JSON.stringify({ "field": "guardianPhone" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".11" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("联系地址");__o.push("</text>");__o.push("\r\n      ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (address); })) + '"' + " data-field=\"address\"" + " data-on-input=\"onField\"" + " placeholder=\"选填\"" + " maxlength=\"200\"" + ' data-ds="' + __e(JSON.stringify({ "field": "address" })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".13" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (type === 'course' && packages.length); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("选择套餐");__o.push("</view>");__o.push("\r\n    ");{let __l0 = (packages); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("pkg " + __e(__x(function () { return (packageId === item.id ? 'pkg-on' : ''); }))) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"onPackageChange\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n        ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("</text>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (item.lessons); })) + " 课次 · " + __e(__x(function () { return (item.description); })));__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");}}__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("上课日期（选填）");__o.push("</text>");__o.push("\r\n      ");__o.push("<picker" + " data-field=\"date\"" + " data-on-change=\"onField\"" + ' data-ds="' + __e(JSON.stringify({ "field": "date" })) + '"' + " data-picker-mode=\"date\"" + ' data-picker-value="' + __e(__x(function () { return (date); })) + '"' + ' data-el="' + (__PATH + ".0" + ".6" + ".5" + ".3") + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (date || '选择日期'); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</picker>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (type === 'tutor'); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("预约日期与课次");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("预约日期");__o.push("</text>");__o.push("\r\n      ");__o.push("<picker" + " data-on-change=\"onDateChange\"" + " data-picker-mode=\"date\"" + ' data-picker-value="' + __e(__x(function () { return (pickedDate); })) + '"' + ' data-el="' + (__PATH + ".0" + ".9" + ".3" + ".3") + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (pickedDate || '选择日期'); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</picker>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("仅展示与所选日期星期一致的可约时段，每个时段 1 小时");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"chips mt\"" + ">");__o.push("\r\n      ");{let __l1 = (slots); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (item.available ? '' : 'chip-off'); })) + " " + __e(__x(function () { return (item.picked ? 'chip-on' : ''); }))) + '"' + " data-slot=\"" + __e(__x(function () { return (item.slot); })) + '"' + " data-disabled=\"" + __e(__x(function () { return (item.available ? '' : '1'); })) + '"' + " data-on-tap=\"toggleSlot\"" + ' data-ds="' + __e(JSON.stringify({ "slot": __x(function () { return (item.slot); }), "disabled": __x(function () { return (item.available ? '' : '1'); }) })) + '"' + ">");__o.push("\r\n        " + __e(__x(function () { return (item.slot); })) + __e(__x(function () { return (item.available ? '' : '（已约）'); })) + "\r\n      ");__o.push("</view>");}}__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (!slots.length && pickedDate); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("当天没有可约时段，换一个日期试试");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (sessions.length); })) {__o.push("<view" + " class=\"banner mt\"" + ">");__o.push("已选 " + __e(__x(function () { return (sessions.length); })) + " 个课次 · 合计 " + __e(__x(function () { return (sessions.length); })) + " 小时 · ¥" + __e(__x(function () { return (amountText); })));__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (type === 'bus'); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("乘车安排");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("上车站点");__o.push("</text>");__o.push("\r\n      ");__o.push("<picker" + " data-on-change=\"onStartChange\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (starts); }) || [])) + '"' + ' data-el="' + (__PATH + ".0" + ".12" + ".3" + ".3") + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (startPoint || '选择上车站点'); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</picker>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("下车站点");__o.push("</text>");__o.push("\r\n      ");__o.push("<picker" + " data-on-change=\"onEndChange\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (ends); }) || [])) + '"' + ' data-el="' + (__PATH + ".0" + ".12" + ".5" + ".3") + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (endPoint || (startPoint ? '选择下车站点' : '请先选择上车站点')); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</picker>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (periods.length > 1); })) {__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("订购周期");__o.push("</text>");__o.push("\r\n      ");__o.push("<picker" + " data-field=\"period\"" + " data-on-change=\"onField\"" + ' data-ds="' + __e(JSON.stringify({ "field": "period" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (periods); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (periods.indexOf(period)); })) + '"' + ' data-el="' + (__PATH + ".0" + ".12" + ".7" + ".3") + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (period); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</picker>");__o.push("\r\n    ");__o.push("</view>");}__o.push("\r\n  ");__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"footer-bar\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"price\"" + ">");__o.push("¥" + __e(__x(function () { return (amountText); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("提交后在我的订单完成支付");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<button" + " class=\"btn\"" + " loading=\"" + __e(__x(function () { return (submitting); })) + '"' + " data-on-tap=\"submit\"" + ">");__o.push("提交订单");__o.push("</button>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/learning-detail/learning-detail"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {if (__x(function () { return (view); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"card hero\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"hero-top\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"" + ("thumb tone-" + __e(__x(function () { return (view.tone); })) + " big") + '"' + ">");__o.push(__e(__x(function () { return (view.icon); })));__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"path\"" + ">");__o.push("\n          ");if (__x(function () { return (kindName); })) {__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (kindName); })));__o.push("</text>");}__o.push("\n          ");if (__x(function () { return (subject); })) {__o.push("<text" + " class=\"muted small\"" + ">");__o.push("› " + __e(__x(function () { return (subject); })));__o.push("</text>");}__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"title mt-s\"" + ">");__o.push(__e(__x(function () { return (view.title); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("🏫 " + __e(__x(function () { return (view.merchant); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"hero-meta\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"price\"" + ">");__o.push("¥" + __e(__x(function () { return (view.priceText); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("/ " + __e(__x(function () { return (view.unit); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (view.remainingText); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("课程介绍");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"pre\"" + ">");__o.push(__e(__x(function () { return (view.description || '课程介绍待完善'); })));__o.push("</view>");__o.push("\n    ");if (__x(function () { return (view.location); })) {__o.push("<view" + " class=\"line-row row gap-s\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("上课地点");__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"grow small\"" + ">");__o.push(__e(__x(function () { return (view.location); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (view.address); })) {__o.push("<view" + " class=\"line-row row gap-s\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("详细地址");__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"grow small\"" + ">");__o.push(__e(__x(function () { return (view.address); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");if (__x(function () { return (view.packages.length); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("可选班型");__o.push("</view>");__o.push("\n    ");{let __l0 = (view.packages); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"pkg\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.lessons); })) + " 课时 · " + __e(__x(function () { return (item.description); })));__o.push("</view>");__o.push("\n    ");__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"between\"" + " data-on-tap=\"goMerchant\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (view.merchant.name); })));__o.push("</view>");__o.push("\n        ");if (__x(function () { return (view.merchant.intro); })) {__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (view.merchant.intro); })));__o.push("</view>");}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<text" + " class=\"link small\"" + ">");__o.push("机构主页 ›");__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (view.merchant.address); })) {__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("⌖ " + __e(__x(function () { return (view.merchant.address); })));__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (view.merchant.contact); })) {__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("联系人：" + __e(__x(function () { return (view.merchant.contact); })));if (__x(function () { return (view.merchant.phone); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (view.merchant.phone); })));__o.push("</text>");}__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (view.merchant.teachers.length); })) {__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\n      ");{let __l1 = (view.merchant.teachers); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("\n    ");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"footer-bar\"" + ">");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-ghost\"" + " data-on-tap=\"callPhone\"" + ">");__o.push("电话咨询");__o.push("</button>");__o.push("\n    ");__o.push("<button" + " class=\"btn grow\"" + " data-on-tap=\"goBooking\"" + ">");__o.push("立即报名");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");} else {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (!loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("课程不存在或已下架");__o.push("</view>");}__o.push("\n");__o.push("</view>");}__o.push("\n");}return __o.join("");};
templates["pages/gaokao/gaokao"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");__o.push("\r\n  ");__o.push("<view" + " class=\"plan-hero\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"plan-eyebrow\"" + ">");__o.push("升学规划 · PATH TO COLLEGE");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"plan-title\"" + ">");__o.push("把想去的学校，拆成今天能做的一步");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<img" + " class=\"plan-ip\"" + " src=\"\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"plan-chips\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"pchip\"" + ">");__o.push("年级 " + __e(__x(function () { return (profileForm.grade); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"pchip\"" + ">");__o.push(__e(__x(function () { return (profileForm.province); })));__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"pchip\"" + ">");__o.push(__e(__x(function () { return (profileForm.first); })));if (__x(function () { return (profileForm.second.length); })) {__o.push(" + " + __e(__x(function () { return (profileForm.second.length); })) + " 门");}__o.push("</text>");__o.push("\r\n      ");__o.push("<text" + " class=\"pchip\"" + ">");__o.push("目标 " + __e(__x(function () { return (profileForm.targetTier); })));__o.push("</text>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"plan-note\"" + ">");__o.push("从初一到高三，档案、曲线、路径、选科、多元升学与关键节点放在同一页");if (__x(function () { return (updatedText); })) {__o.push(" · 档案更新于 " + __e(__x(function () { return (updatedText); })));}__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("\r\n  ");__o.push("<scroll-view" + " class=\"plan-tabs\"" + " scroll-x" + " enable-flex" + ' data-el="' + (__PATH + ".0" + ".5") + '"' + ">");__o.push("\r\n    ");{let __l0 = (tabs); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("plan-tab " + __e(__x(function () { return (tab === item.key ? 'plan-tab-on' : ''); }))) + '"' + " data-tab=\"" + __e(__x(function () { return (item.key); })) + '"' + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": __x(function () { return (item.key); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\r\n  ");__o.push("</scroll-view>");__o.push("\r\n\r\n  ");if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("正在读取你的升学档案…");__o.push("</view>");} else if (__x(function () { return (error); })) {__o.push("<view" + " class=\"card plan-error\"" + ">");__o.push(__e(__x(function () { return (error); })));__o.push("</view>");} else {__o.push("\r\n    ");__o.push("\r\n    ");if (__x(function () { return (tab === 'profile'); })) {__o.push("\r\n      ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("当前年级");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n            ");{let __l1 = (meta.grades); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (profileForm.grade === item ? 'chip-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onGrade\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<picker" + " class=\"field\"" + " data-on-change=\"onProvince\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (meta.provinces); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (profileForm.provinceIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".2" + ".1" + ".3") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("所在省份");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (profileForm.province); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("首选科目（3+1+2 里的「1」）");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n            ");{let __l2 = (meta.firstSubjects); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (profileForm.first === item ? 'chip-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onFirst\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("再选科目（选 2 门）");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n            ");{let __l3 = (meta.secondSubjects); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let item = __l3[__i3]; let index = __i3;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (profileForm.second.indexOf(item) >= 0 ? 'chip-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onSecond\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("已选 " + __e(__x(function () { return (profileForm.second.length); })) + " / 2 门");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("目标层次");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n            ");{let __l4 = (meta.tiers); if (!__l4) __l4 = [];for (let __i4 = 0; __i4 < __l4.length; __i4++) {let item = __l4[__i4]; let index = __i4;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (profileForm.targetTier === item ? 'chip-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onTier\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("感兴趣的方向（最多 3 个）");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n            ");{let __l5 = (meta.interests); if (!__l5) __l5 = [];for (let __i5 = 0; __i5 < __l5.length; __i5++) {let item = __l5[__i5]; let index = __i5;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (profileForm.interest.indexOf(item) >= 0 ? 'chip-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onInterest\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"saveProfile\"" + (((saving) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (saving ? '保存中…' : '保存档案'); })));__o.push("</button>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"plan-disclaimer\"" + ">");__o.push(__e(__x(function () { return (disclaimer); })));__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n\r\n    ");__o.push("\r\n    ");if (__x(function () { return (tab === 'curve'); })) {__o.push("\r\n      ");__o.push("<view" + " class=\"plan-stats\"" + ">");__o.push("\r\n        ");{let __l6 = (gapCards); if (!__l6) __l6 = [];for (let __i6 = 0; __i6 < __l6.length; __i6++) {let item = __l6[__i6]; let index = __i6;__o.push("<view" + " class=\"plan-stat\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"plan-stat-label\"" + ">");__o.push(__e(__x(function () { return (item.label); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"" + ("plan-stat-value " + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.value); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"plan-stat-hint\"" + ">");__o.push(__e(__x(function () { return (item.hint); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"strong\"" + ">");__o.push("录入一次考试");__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("满分按试卷填");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("考试名称");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (examForm.name); })) + '"' + " data-on-input=\"onExamName\"" + " placeholder=\"例如 高一上学期期中\"" + " maxlength=\"40\"" + ' data-el="' + (__PATH + ".0" + ".11" + ".5" + ".3" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\r\n          ");__o.push("<picker" + " class=\"grow\"" + " data-on-change=\"onExamDate\"" + " data-picker-mode=\"date\"" + ' data-picker-value="' + __e(__x(function () { return (examForm.date); })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".5" + ".3" + ".5" + ".1") + '"' + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("考试日期");__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (examForm.date); })));__o.push("</view>");__o.push("\r\n          ");__o.push("</picker>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("总分");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"number\"" + " step=\"any\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (examForm.total); })) + '"' + " data-on-input=\"onExamTotal\"" + " placeholder=\"" + __e(__x(function () { return (provinceTotal); })) + '"' + " maxlength=\"3\"" + ' data-el="' + (__PATH + ".0" + ".11" + ".5" + ".3" + ".5" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"addExam\"" + (((saving) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (saving ? '提交中…' : '记录这次成绩'); })));__o.push("</button>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("最近记录");__o.push("<text" + " class=\"muted small\"" + " style=\"font-weight:400\"" + ">");__o.push(" · 均分取最近 6 次");__o.push("</text>");__o.push("</view>");__o.push("\r\n      ");if (__x(function () { return (examRows.length); })) {__o.push("<view" + " class=\"list\"" + ">");__o.push("\r\n        ");{let __l7 = (examRows); if (!__l7) __l7 = [];for (let __i7 = 0; __i7 < __l7.length; __i7++) {let item = __l7[__i7]; let index = __i7;__o.push("<view" + " class=\"card exam-row\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.date); })));__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<text" + " class=\"exam-score\"" + ">");__o.push(__e(__x(function () { return (item.total); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"link small\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-catch-tap=\"removeExam\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("删除");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("还没有成绩记录，录入一次就能看到与目标线的差距");__o.push("</view>");}__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"plan-disclaimer\"" + ">");__o.push(__e(__x(function () { return (disclaimer); })));__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n\r\n    ");__o.push("\r\n    ");if (__x(function () { return (tab === 'path'); })) {__o.push("\r\n      ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("目标拆解");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"plan-advice\"" + ">");__o.push(__e(__x(function () { return (gap.advice); })));__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"plan-stats plan-stats-in\"" + ">");__o.push("\r\n          ");{let __l8 = (gapCards); if (!__l8) __l8 = [];for (let __i8 = 0; __i8 < __l8.length; __i8++) {let item = __l8[__i8]; let index = __i8;__o.push("<view" + " class=\"plan-stat plan-stat-mini\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"plan-stat-label\"" + ">");__o.push(__e(__x(function () { return (item.label); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"" + ("plan-stat-value " + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.value); })));__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");}}__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (gap.targetBasis); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("五段路径");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"stage-rail\"" + ">");__o.push("\r\n        ");{let __l9 = (stages); if (!__l9) __l9 = [];for (let __i9 = 0; __i9 < __l9.length; __i9++) {let item = __l9[__i9]; let index = __i9;__o.push("<view" + " class=\"" + ("stage-node stage-" + __e(__x(function () { return (item.status); }))) + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"stage-dot\"" + ">");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n              ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n              ");__o.push("<text" + " class=\"stage-badge\"" + ">");__o.push(__e(__x(function () { return (item.statusText); })));__o.push("</text>");__o.push("\r\n            ");__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.range); })) + " · " + __e(__x(function () { return (item.goal); })));__o.push("</view>");__o.push("\r\n            ");if (__x(function () { return (item.status === 'current'); })) {__o.push("<view" + " class=\"stage-tasks\"" + ">");__o.push("\r\n              ");{let __l10 = (item.tasks); if (!__l10) __l10 = [];for (let __i10 = 0; __i10 < __l10.length; __i10++) {let task = __l10[__i10]; let index = __i10;__o.push("<view" + " class=\"stage-task\"" + ">");__o.push("\r\n                ");__o.push("<text" + " class=\"stage-task-title\"" + ">");__o.push("· " + __e(__x(function () { return (task.title); })));__o.push("</text>");__o.push("\r\n                ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (task.detail); })));__o.push("</text>");__o.push("\r\n              ");__o.push("</view>");}}__o.push("\r\n              ");if (__x(function () { return (item.moreCount); })) {__o.push("<text" + " class=\"link small stage-more\"" + " data-key=\"" + __e(__x(function () { return (item.key); })) + '"' + " data-catch-tap=\"toggleStage\"" + ' data-ds="' + __e(JSON.stringify({ "key": __x(function () { return (item.key); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.expanded ? '收起' : '展开全部 ' + (item.moreCount + 4) + ' 条'); })));__o.push("</text>");} else if (__x(function () { return (item.expanded); })) {__o.push("<text" + " class=\"link small stage-more\"" + " data-key=\"" + __e(__x(function () { return (item.key); })) + '"' + " data-catch-tap=\"toggleStage\"" + ' data-ds="' + __e(JSON.stringify({ "key": __x(function () { return (item.key); }) })) + '"' + ">");__o.push("收起");__o.push("</text>");}__o.push("\r\n            ");__o.push("</view>");}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (stageNote); })));__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"card mt-s\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("院校参考");__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("按省份、层次、类型筛院校，看模拟投档线与位次");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<text" + " class=\"link small\"" + " data-on-tap=\"openSchools\"" + ">");__o.push("去看看 ›");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"plan-disclaimer\"" + ">");__o.push(__e(__x(function () { return (disclaimer); })));__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n\r\n    ");__o.push("\r\n    ");if (__x(function () { return (tab === 'subjects'); })) {__o.push("\r\n      ");if (__x(function () { return (subject); })) {__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (subject.combination); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"tag tag-ok\"" + ">");__o.push("覆盖 " + __e(__x(function () { return (coverageText); })) + "%");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"plan-advice\"" + ">");__o.push("可报 " + __e(__x(function () { return (subject.allowedMajors); })) + " / " + __e(__x(function () { return (subject.totalMajors); })) + " 个本科专业；12 种组合里排第 " + __e(__x(function () { return (subject.rank); })) + "。");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("覆盖率按学科门类的模拟选科规则估算，不代表真实招生目录。");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");}__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("12 种组合对比");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\r\n        ");{let __l11 = (comboRows); if (!__l11) __l11 = [];for (let __i11 = 0; __i11 < __l11.length; __i11++) {let item = __l11[__i11]; let index = __i11;__o.push("<view" + " class=\"" + ("card combo-row " + __e(__x(function () { return (item.current ? 'combo-on' : ''); }))) + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.combination); })));if (__x(function () { return (item.current); })) {__o.push("<text" + " class=\"tag tag-wen\"" + " style=\"margin-left:8rpx\"" + ">");__o.push("我的组合");__o.push("</text>");}__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("可报 " + __e(__x(function () { return (item.allowed); })) + " / " + __e(__x(function () { return (item.total); })) + " 个专业");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"combo-bar\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"combo-bar-fill\"" + " style=\"" + ("width:" + __e(__x(function () { return (item.coverage); })) + "%") + '"' + ">");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<text" + " class=\"combo-pct\"" + ">");__o.push(__e(__x(function () { return (item.coverage); })) + "%");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"plan-disclaimer\"" + ">");__o.push(__e(__x(function () { return (disclaimer); })));__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n\r\n    ");__o.push("\r\n    ");if (__x(function () { return (tab === 'pathways'); })) {__o.push("\r\n      ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("按哪个年级的条件核对");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (pwForm.grade === '' ? 'chip-on' : ''); }))) + '"' + " data-value=\"\"" + " data-on-tap=\"onPwGrade\"" + ' data-ds="' + __e(JSON.stringify({ "value": "" })) + '"' + ">");__o.push("用我的档案年级（" + __e(__x(function () { return (profileForm.grade); })) + "）");__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (pwForm.grade === '高三' ? 'chip-on' : ''); }))) + '"' + " data-value=\"高三\"" + " data-on-tap=\"onPwGrade\"" + ' data-ds="' + __e(JSON.stringify({ "value": "高三" })) + '"' + ">");__o.push("按高三条件试算");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("强基、综评、专项大多在高三申报，高一高二先用「高三条件试算」看自己还缺什么。");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("高考分数（可不填）");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"number\"" + " step=\"any\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (pwForm.score); })) + '"' + " data-on-input=\"onPwScore\"" + " placeholder=\"默认用最近均分\"" + " maxlength=\"3\"" + ' data-el="' + (__PATH + ".0" + ".11" + ".14" + ".1" + ".3" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("全省位次（可不填）");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (pwForm.rank); })) + '"' + " data-on-input=\"onPwRank\"" + " placeholder=\"留空按模型估算\"" + " maxlength=\"8\"" + ' data-el="' + (__PATH + ".0" + ".11" + ".14" + ".1" + ".3" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("竞赛 / 奖项（可不填）");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (pwForm.award); })) + '"' + " data-on-input=\"onPwAward\"" + " placeholder=\"例如 数学联赛省一\"" + " maxlength=\"40\"" + ' data-el="' + (__PATH + ".0" + ".11" + ".14" + ".1" + ".5" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"loadPathways\"" + ">");__o.push("重新自查");__o.push("</button>");__o.push("\r\n        ");if (__x(function () { return (pathways); })) {__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (pathways.province); })) + " · 特殊类型线 " + __e(__x(function () { return (pathways.controlLine); })) + " · 本科线 " + __e(__x(function () { return (pathways.batchLine); })));if (__x(function () { return (pathways.rankEstimated); })) {__o.push("<text" + ">");__o.push(" · 位次为模型估算");__o.push("</text>");}__o.push("</view>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");if (__x(function () { return (pathwayRows.length); })) {__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\r\n        ");{let __l12 = (pathwayRows); if (!__l12) __l12 = [];for (let __i12 = 0; __i12 < __l12.length; __i12++) {let item = __l12[__i12]; let index = __i12;__o.push("<view" + " class=\"card pathway-card\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n              ");__o.push("<view" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\r\n              ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.tag); })));__o.push("</view>");__o.push("\r\n            ");__o.push("</view>");__o.push("\r\n            ");__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (item.tone === 'ok' ? 'tag-ok' : (item.tone === 'warn' ? 'tag-warn' : 'tag-muted')); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.statusText); })));__o.push("</text>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (item.summary); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"check-list\"" + ">");__o.push("\r\n            ");{let __l13 = (item.checks); if (!__l13) __l13 = [];for (let __i13 = 0; __i13 < __l13.length; __i13++) {let c = __l13[__i13]; let index = __i13;__o.push("<view" + " class=\"check-row\"" + ">");__o.push("\r\n              ");__o.push("<text" + " class=\"" + ("check-icon " + __e(__x(function () { return (c.pass ? 'check-pass' : (c.optional ? 'check-optional' : 'check-fail')); }))) + '"' + ">");__o.push(__e(__x(function () { return (c.pass ? '✓' : (c.optional ? '○' : '✕')); })));__o.push("</text>");__o.push("\r\n              ");__o.push("<text" + " class=\"grow small\"" + ">");__o.push(__e(__x(function () { return (c.item); })));__o.push("</text>");__o.push("\r\n              ");__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(__e(__x(function () { return (c.actual); })));__o.push("</text>");__o.push("\r\n            ");__o.push("</view>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("点「重新自查」看看强基、综评、专项等路径是否适合你");__o.push("</view>");}__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"plan-disclaimer\"" + ">");__o.push(__e(__x(function () { return (disclaimer); })));__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n\r\n    ");__o.push("\r\n    ");if (__x(function () { return (tab === 'timeline'); })) {__o.push("\r\n      ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (timelineMeta.from); })) + " 起 " + __e(__x(function () { return (timelineMeta.count); })) + " 个节点");__o.push("</text>");__o.push("\r\n        ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("已过 " + __e(__x(function () { return (timelineMeta.passed); })) + " 个");__o.push("</text>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"timeline mt-s\"" + ">");__o.push("\r\n        ");{let __l14 = (nodes); if (!__l14) __l14 = [];for (let __i14 = 0; __i14 < __l14.length; __i14++) {let item = __l14[__i14]; let index = __i14;__o.push("<view" + " class=\"" + ("tl-row " + __e(__x(function () { return (item.passed ? 'tl-passed' : ''); }))) + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"tl-date\"" + ">");__o.push(__e(__x(function () { return (item.date); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"tl-line\"" + ">");__o.push("<view" + " class=\"" + ("tl-dot tl-" + __e(__x(function () { return (item.type); }))) + '"' + ">");__o.push("</view>");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow tl-body\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n              ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n              ");__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(__e(__x(function () { return (item.daysText); })));__o.push("</text>");__o.push("\r\n            ");__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.detail); })));__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (timelineMeta.note); })));__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"plan-disclaimer\"" + ">");__o.push(__e(__x(function () { return (disclaimer); })));__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n  ");}__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/gaokao-schools/gaokao-schools"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"segs\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'library' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"library\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "library" })) + '"' + ">");__o.push("院校库");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'wish' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"wish\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "wish" })) + '"' + ">");__o.push("我的志愿表");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");if (__x(function () { return (tab === 'library'); })) {__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\n      ");__o.push("<picker" + " class=\"grow\"" + " data-on-change=\"onProvince\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (provinces); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (provinceIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".1" + ".1") + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("考生省份");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (province); })));__o.push("</view>");__o.push("\n      ");__o.push("</picker>");__o.push("\n      ");__o.push("<picker" + " class=\"grow\"" + " data-on-change=\"onYear\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (years); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (yearIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".1" + ".3") + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("参考年份");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (year); })) + " 年");__o.push("</view>");__o.push("\n      ");__o.push("</picker>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\n      ");__o.push("<picker" + " class=\"grow\"" + " data-on-change=\"onTier\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (tiers); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (tierIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".3" + ".1") + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("院校层次");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (tiers[tierIndex]); })));__o.push("</view>");__o.push("\n      ");__o.push("</picker>");__o.push("\n      ");__o.push("<picker" + " class=\"grow\"" + " data-on-change=\"onType\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (types); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (typeIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".3" + ".3") + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("院校类型");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (types[typeIndex]); })));__o.push("</view>");__o.push("\n      ");__o.push("</picker>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n      ");__o.push("<input" + " type=\"text\"" + " class=\"input grow\"" + " value=\"" + __e(__x(function () { return (q); })) + '"' + " data-on-input=\"onKeyword\"" + " data-on-confirm=\"onSearch\"" + " placeholder=\"搜索院校名称\"" + " enterkeyhint=\"search\"" + ' data-el="' + (__PATH + ".0" + ".3" + ".5" + ".1") + '"' + ">");__o.push("</input>");__o.push("\n      ");__o.push("<button" + " class=\"btn btn-sm search-btn\"" + " data-on-tap=\"onSearch\"" + ">");__o.push("搜索");__o.push("</button>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<picker" + " class=\"field\"" + " data-on-change=\"onSort\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (sorts); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (sortIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".3" + ".7") + '"' + ">");__o.push("\n      ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("排序");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (sorts[sortIndex]); })));__o.push("</view>");__o.push("\n    ");__o.push("</picker>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");if (__x(function () { return (tab === 'library'); })) {__o.push("\n    ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("共 " + __e(__x(function () { return (library.total); })) + " 所院校");__o.push("</text>");__o.push("\n      ");if (__x(function () { return (library.loading); })) {__o.push("<text" + " class=\"muted small\"" + ">");__o.push("加载中…");__o.push("</text>");}__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"list mt-s\"" + ">");__o.push("\n      ");{let __l0 = (library.items); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"card uni\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openUni\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item.tier); })));__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.province); })) + " · " + __e(__x(function () { return (item.type); })) + " · " + __e(__x(function () { return (item.majorsCount); })) + " 个专业");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"row gap-s mt-s\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"small\"" + ">");__o.push("分数线 ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"small muted\"" + ">");__o.push("位次 " + __e(__x(function () { return (item.rank); })));__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"uni-actions\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"link small\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-catch-tap=\"addWish\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("加入志愿表");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (!library.items.length && !library.loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("没有匹配的院校，换个条件试试");__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (library.page < library.pages); })) {__o.push("<view" + " class=\"muted tiny center mt\"" + ">");__o.push("上滑加载更多");__o.push("</view>");}__o.push("\n  ");}__o.push("\n\n  ");if (__x(function () { return (tab === 'wish'); })) {__o.push("\n    ");if (__x(function () { return (!logged); })) {__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("登录后可以保存志愿表，随时回来继续调整。");__o.push("</view>");__o.push("\n      ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\n    ");__o.push("</view>");} else {__o.push("\n      ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("共 " + __e(__x(function () { return (wishlist.length); })) + " 条 · 最多 60 条");__o.push("</text>");__o.push("\n        ");if (__x(function () { return (!wishLoaded); })) {__o.push("<text" + " class=\"muted small\"" + ">");__o.push("加载中…");__o.push("</text>");}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"list mt-s\"" + ">");__o.push("\n        ");{let __l1 = (wishlist); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\n              ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (index + 1); })));__o.push("</text>");__o.push("\n              ");__o.push("<text" + " class=\"strong\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openUni\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n            ");__o.push("</view>");__o.push("\n            ");__o.push("<text" + " class=\"link small\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"removeWish\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("移出");__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("\n            ");if (__x(function () { return (item.line !== ''); })) {__o.push("<text" + ">");__o.push("分数线 " + __e(__x(function () { return (item.line); })));__o.push("</text>");}__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input mt-s\"" + " value=\"" + __e(__x(function () { return (item.note); })) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-input=\"updateNote\"" + " data-on-blur=\"saveNotes\"" + " placeholder=\"备注（专业方向、城市偏好等）\"" + " maxlength=\"60\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ' data-el="' + (__PATH + ".0" + ".7" + ".3" + ".3" + ".1" + "-" + __i1 + ".5") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (!wishlist.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("还没有院校，去院校库添加吧");__o.push("</view>");}__o.push("\n    ");}__o.push("\n  ");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/gaokao-detail/gaokao-detail"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {if (__x(function () { return (uni); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"card hero\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"title\"" + ">");__o.push(__e(__x(function () { return (uni.name); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (uni.tier); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (uni.province); })) + " · " + __e(__x(function () { return (uni.city); })) + " · " + __e(__x(function () { return (uni.type); })) + "类 · " + __e(__x(function () { return (uni.founded); })) + " 年建校");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\n      ");if (__x(function () { return (uni.alliance); })) {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (uni.alliance); })));__o.push("</text>");}__o.push("\n      ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push("校友会 " + __e(__x(function () { return (uni.alumniRank); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push("软科 " + __e(__x(function () { return (uni.ruankeRank); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (uni.intro); })));__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"segs mt\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'info' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"info\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "info" })) + '"' + ">");__o.push("概况");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'majors' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"majors\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "majors" })) + '"' + ">");__o.push("专业");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'lines' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"lines\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "lines" })) + '"' + ">");__o.push("分数线");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (tab === 'info'); })) {__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("院校层次");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (uni.tier); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("院校类型");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (uni.type); })) + "类");__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("所在省市");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (uni.province); })) + " · " + __e(__x(function () { return (uni.city); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("建校年份");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (uni.founded); })) + " 年");__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("本科专业");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (uni.majorsCount); })) + " 个");__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("校友会排名");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push("第 " + __e(__x(function () { return (uni.alumniRank); })) + " 位");__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("软科中国排名");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push("第 " + __e(__x(function () { return (uni.ruankeRank); })) + " 位");__o.push("</text>");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (tab === 'majors'); })) {__o.push("\n    ");if (__x(function () { return (majorSeries); })) {__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (majorSeries.name); })) + " · 历年趋势");__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"link small\"" + " data-on-tap=\"closeMajor\"" + ">");__o.push("收起");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grid-table mt-s\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grid-row head-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("年份");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("分数线");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("位次");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("计划");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");{let __l0 = (majorSeries.series); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"grid-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.year); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.rank); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.plan); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");}__o.push("\n\n    ");__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\n      ");{let __l1 = (majors); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card major\"" + " data-name=\"" + __e(__x(function () { return (item.name); })) + '"' + " data-on-tap=\"openMajor\"" + ' data-ds="' + __e(JSON.stringify({ "name": __x(function () { return (item.name); }) })) + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item.category); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("\n          分数线 " + __e(__x(function () { return (item.line); })) + " · 位次 " + __e(__x(function () { return (item.rank); })) + " · 计划 " + __e(__x(function () { return (item.plan); })) + " 人\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"between mt-s\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push("热度 " + __e(__x(function () { return (item.heatText); })) + " · " + __e(__x(function () { return (item.gapText); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"link tiny\"" + ">");__o.push("趋势 ›");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (!majors.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂无专业数据");__o.push("</view>");}__o.push("\n  ");}__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (tab === 'lines'); })) {__o.push("\n    ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("全国线（院校最低投档）");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grid-table\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grid-row head-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("年份");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("最低分");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("平均分");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");{let __l2 = (nationalLines); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"grid-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.year); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.avg); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push(__e(__x(function () { return (province); })) + " 投档线");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grid-table\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grid-row head-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("年份");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("投档线");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("位次");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");{let __l3 = (provinceLines); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let item = __l3[__i3]; let index = __i3;__o.push("<view" + " class=\"grid-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.year); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.rank); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (!provinceLines.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂无该省份数据");__o.push("</view>");}__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("各省最低投档线（" + __e(__x(function () { return (year); })) + " 年）");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grid-table\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grid-row head-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("省份");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("投档线");__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("位次");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");{let __l4 = (provinceRows); if (!__l4) __l4 = [];for (let __i4 = 0; __i4 < __l4.length; __i4++) {let item = __l4[__i4]; let index = __i4;__o.push("<view" + " class=\"grid-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.province); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.rank); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");}__o.push("\n\n  ");__o.push("<view" + " class=\"footer-bar\"" + ">");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-ghost\"" + " data-on-tap=\"goWishlist\"" + ">");__o.push("我的志愿表");__o.push("</button>");__o.push("\n    ");__o.push("<button" + " class=\"btn grow\"" + " data-on-tap=\"addWish\"" + (((adding) ? " disabled" : '')) + ">");__o.push("加入志愿表");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");} else {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (!loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("院校资料加载失败");__o.push("</view>");}__o.push("\n");__o.push("</view>");}__o.push("\n");}return __o.join("");};
templates["pages/exam/exam"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\r\n    ");{let __l0 = (kinds); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (kind === item.key ? 'chip-on' : ''); }))) + '"' + " data-kind=\"" + __e(__x(function () { return (item.key); })) + '"' + " data-on-tap=\"onKind\"" + ' data-ds="' + __e(JSON.stringify({ "kind": __x(function () { return (item.key); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.label); })));__o.push("</view>");}}__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n  ");if (__x(function () { return (kindMeta); })) {__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (kindMeta.sub); })) + " · 满分 " + __e(__x(function () { return (kindMeta.fullScore); })));__o.push("</view>");}__o.push("\r\n\r\n  ");__o.push("<view" + " class=\"segs mt\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'items' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"items\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "items" })) + '"' + ">");__o.push(__e(__x(function () { return (kindMeta ? kindMeta.itemLabel : '岗位'); })));__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'match' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"match\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "match" })) + '"' + ">");__o.push("分数匹配");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'data' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"data\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "data" })) + '"' + ">");__o.push("备考资料");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (tab === 'items'); })) {__o.push("\r\n    ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\r\n        ");__o.push("<picker" + " class=\"grow\"" + " data-field=\"regionIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "regionIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (regions); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (regionIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".1" + ".1") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("地区");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (regions[regionIndex]); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n        ");__o.push("<picker" + " class=\"grow\"" + " data-field=\"educationIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "educationIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (educations); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (educationIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".1" + ".3") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("最低学历");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (educations[educationIndex]); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\r\n        ");__o.push("<picker" + " class=\"grow\"" + " data-field=\"categoryIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "categoryIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (categories); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (categoryIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".3" + ".1") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("类别");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (categories[categoryIndex]); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n        ");__o.push("<picker" + " class=\"grow\"" + " data-field=\"examTypeIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "examTypeIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (examTypes); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (examTypeIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".3" + ".3") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("招考类型");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (examTypes[examTypeIndex]); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input grow\"" + " value=\"" + __e(__x(function () { return (q); })) + '"' + " data-on-input=\"onKeyword\"" + " data-on-confirm=\"onSearch\"" + " placeholder=\"搜索单位或职位\"" + " enterkeyhint=\"search\"" + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".5" + ".1") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("<button" + " class=\"btn btn-sm search-btn\"" + " data-on-tap=\"onSearch\"" + ">");__o.push("搜索");__o.push("</button>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<picker" + " class=\"field\"" + " data-field=\"sortIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "sortIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (sorts); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (sortIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".7") + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("排序");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (sorts[sortIndex]); })));__o.push("</view>");__o.push("\r\n      ");__o.push("</picker>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n\r\n    ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\r\n      ");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("共 " + __e(__x(function () { return (total); })) + " 个" + __e(__x(function () { return (kindMeta ? kindMeta.itemLabel : '岗位'); })));__o.push("</text>");__o.push("\r\n      ");if (__x(function () { return (loading); })) {__o.push("<text" + " class=\"muted small\"" + ">");__o.push("加载中…");__o.push("</text>");}__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n\r\n    ");__o.push("<view" + " class=\"list mt-s\"" + ">");__o.push("\r\n      ");{let __l1 = (items); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card item\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openItem\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\r\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"strong grow ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.org); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (item.examType); })));__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (item.title); })) + " · " + __e(__x(function () { return (item.region); })) + __e(__x(function () { return (item.city ? ' · ' + item.city : ''); })));__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"row wrap gap-s mt-s\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item.category); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"tag tag-ok\"" + ">");__o.push("招 " + __e(__x(function () { return (item.quota); })) + " 人");__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push("竞争比 " + __e(__x(function () { return (item.ratio); })));__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"tag tag-warn\"" + ">");__o.push(__e(__x(function () { return (item.heat); })));__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"between mt-s\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (kindMeta ? kindMeta.lineLabel : '分数线'); })) + " ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("</text>");__o.push("\r\n          ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("报名 " + __e(__x(function () { return (item.applicants); })) + " 人 ›");__o.push("</text>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");}}__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n    ");if (__x(function () { return (!items.length && !loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("没有匹配的岗位，换个条件试试");__o.push("</view>");}__o.push("\r\n    ");if (__x(function () { return (page < pages); })) {__o.push("<view" + " class=\"muted tiny center mt\"" + ">");__o.push("上滑加载更多");__o.push("</view>");}__o.push("\r\n  ");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (tab === 'match'); })) {__o.push("\r\n    ");__o.push("<view" + " class=\"card mt\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push(__e(__x(function () { return (kindMeta ? kindMeta.scoreLabel : '笔试分数'); })));__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"number\"" + " step=\"any\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (scoreInput); })) + '"' + " data-on-input=\"onScore\"" + " placeholder=\"" + ("满分 " + __e(__x(function () { return (kindMeta.fullScore); }))) + '"' + " maxlength=\"3\"" + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\r\n        ");__o.push("<picker" + " class=\"grow\"" + " data-field=\"regionIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "regionIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (regions); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (regionIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".3" + ".1") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("意向地区");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (regions[regionIndex]); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n        ");__o.push("<picker" + " class=\"grow\"" + " data-field=\"educationIndex\"" + " data-on-change=\"onPicker\"" + ' data-ds="' + __e(JSON.stringify({ "field": "educationIndex" })) + '"' + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (educations); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (educationIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".3" + ".3") + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"field-label\"" + ">");__o.push("学历");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (educations[educationIndex]); })));__o.push("</view>");__o.push("\r\n        ");__o.push("</picker>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"runMatch\"" + (((matching) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (matching ? '正在匹配…' : '查看匹配结果'); })));__o.push("</button>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n\r\n    ");{let __l2 = (match.groups); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let group = __l2[__i2]; let index = __i2;__o.push("\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push(__e(__x(function () { return (group.name); })));__o.push("<text" + " class=\"muted small\"" + " style=\"font-weight:400\"" + ">");__o.push(" · " + __e(__x(function () { return (group.items.length); })) + " 个");__o.push("</text>");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\r\n        ");{let __l3 = (group.items); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let row = __l3[__i3]; let index = __i3;__o.push("<view" + " class=\"card item\"" + " data-id=\"" + __e(__x(function () { return (row.id); })) + '"' + " data-on-tap=\"openItem\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (row.id); }) })) + '"' + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"strong grow ellipsis\"" + ">");__o.push(__e(__x(function () { return (row.org); })));__o.push("</text>");__o.push("\r\n            ");if (__x(function () { return (row.probability !== null); })) {__o.push("<text" + " class=\"tag\"" + ">");__o.push("把握 " + __e(__x(function () { return (row.probability); })) + "%");__o.push("</text>");}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (row.title); })) + " · " + __e(__x(function () { return (row.region); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"between mt-s\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (kindMeta ? kindMeta.lineLabel : '分数线'); })) + " " + __e(__x(function () { return (row.line); })));__o.push("</text>");__o.push("\r\n            ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("竞争比 " + __e(__x(function () { return (row.ratio); })));__o.push("</text>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");}}__o.push("\r\n\r\n    ");if (__x(function () { return (!match.groups.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("填写分数后查看可参考的岗位");__o.push("</view>");}__o.push("\r\n  ");}__o.push("\r\n\r\n  ");__o.push("\r\n  ");if (__x(function () { return (tab === 'data'); })) {__o.push("\r\n    ");if (__x(function () { return (!resources); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("正在加载备考资料…");__o.push("</view>");} else {__o.push("\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("备考机构");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\r\n        ");{let __l4 = (resources.orgs); if (!__l4) __l4 = [];for (let __i4 = 0; __i4 < __l4.length; __i4++) {let item = __l4[__i4]; let index = __i4;__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\r\n            ");__o.push("<text" + " class=\"tag tag-ok\"" + ">");__o.push(__e(__x(function () { return (item.rating); })) + " 分");__o.push("</text>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.city); })) + " · " + __e(__x(function () { return (item.focus); })) + " · 学员 " + __e(__x(function () { return (item.students); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (item.intro); })));__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\r\n            ");{let __l5 = (item.tags); if (!__l5) __l5 = [];for (let __i5 = 0; __i5 < __l5.length; __i5++) {let tag = __l5[__i5]; let index = __i5;__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (tag); })));__o.push("</text>");}}__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("课程");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\r\n        ");{let __l6 = (resources.courses); if (!__l6) __l6 = [];for (let __i6 = 0; __i6 < __l6.length; __i6++) {let item = __l6[__i6]; let index = __i6;__o.push("<view" + " class=\"card between\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"strong small\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.org); })) + " · " + __e(__x(function () { return (item.mode); })) + " · " + __e(__x(function () { return (item.hours); })) + " 课时 · " + __e(__x(function () { return (item.level); })));__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"right\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.price); })));__o.push("</text>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.enrolled); })) + " 人在学");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("参考书");__o.push("</view>");__o.push("\r\n      ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\r\n        ");{let __l7 = (resources.books); if (!__l7) __l7 = [];for (let __i7 = 0; __i7 < __l7.length; __i7++) {let item = __l7[__i7]; let index = __i7;__o.push("<view" + " class=\"card between\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"strong small\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.author); })) + " · " + __e(__x(function () { return (item.press); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\r\n              ");{let __l8 = (item.tags); if (!__l8) __l8 = [];for (let __i8 = 0; __i8 < __l8.length; __i8++) {let tag = __l8[__i8]; let index = __i8;__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (tag); })));__o.push("</text>");}}__o.push("\r\n            ");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"right\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.price); })));__o.push("</text>");__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.rating); })) + " 分");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");}}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n    ");}__o.push("\r\n  ");}__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/exam-detail/exam-detail"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {if (__x(function () { return (row); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"card hero\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"title grow\"" + ">");__o.push(__e(__x(function () { return (row.org); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (row.examType); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (row.title); })) + " · " + __e(__x(function () { return (row.region); })) + __e(__x(function () { return (row.city ? ' · ' + row.city : ''); })));__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (row.category); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag tag-ok\"" + ">");__o.push(__e(__x(function () { return (row.quotaLabel); })) + " " + __e(__x(function () { return (row.quota); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (row.applicantLabel); })) + " " + __e(__x(function () { return (row.applicants); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"tag tag-warn\"" + ">");__o.push("竞争比 " + __e(__x(function () { return (row.ratio); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"small\"" + ">");__o.push("2025 年 " + __e(__x(function () { return (row.lineLabel); })));__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"price\"" + ">");__o.push(__e(__x(function () { return (row.line); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" / " + __e(__x(function () { return (row.fullScore); })));__o.push("</text>");__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("报考条件");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("学历要求");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (row.requirements.education || '不限'); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("专业要求");__o.push("</text>");__o.push("<view" + " class=\"small mt-s\"" + ">");__o.push(__e(__x(function () { return (row.requirements.major || '不限'); })));__o.push("</view>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("政治面貌");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (row.requirements.political || '不限'); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("基层经历");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (row.requirements.experience || '无限制'); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (row.requirements.certificate); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("证书要求");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (row.requirements.certificate); })));__o.push("</text>");__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (row.requirements.freshOnly); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("应届要求");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push("仅限应届毕业生");__o.push("</text>");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("历年" + __e(__x(function () { return (row.lineLabel); })) + "与竞争比");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"grid-table\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"grid-row head-row\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("年份");__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (row.lineLabel); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push("竞争比");__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (row.quotaLabel); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");{let __l0 = (series); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"grid-row\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.year); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.line); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.ratio); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"grid-cell\"" + ">");__o.push(__e(__x(function () { return (item.quota); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (!series.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂无历年数据");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"footer-bar\"" + ">");__o.push("\n    ");__o.push("<button" + " class=\"btn grow\"" + " data-on-tap=\"addToList\"" + (((adding) ? " disabled" : '')) + ">");__o.push("加入报考清单");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");} else {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (!loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("条目不存在或已下线");__o.push("</view>");}__o.push("\n");__o.push("</view>");}__o.push("\n");}return __o.join("");};
templates["pages/institution/institution"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (!logged); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("机构工作台");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("请使用机构账号登录后管理课程与机构资料。");__o.push("</view>");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\n  ");__o.push("</view>");} else if (__x(function () { return (!isInstitution); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("当前账号不是机构账号");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("如需发布课程，请使用机构类型账号登录并完成入驻。");__o.push("</view>");__o.push("\n  ");__o.push("</view>");} else if (__x(function () { return (ready); })) {__o.push("\n    ");__o.push("\n    ");if (__x(function () { return (status !== 'approved'); })) {__o.push("<view" + " class=\"card status\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push("入驻状态");__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (status === 'pending' ? 'tag-warn' : 'tag-muted'); }))) + '"' + ">");__o.push(__e(__x(function () { return (statusText); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (status === 'pending'); })) {__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("资料已提交，审核通过后即可发布课程。");__o.push("</view>");} else {__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("完成入驻并通过审核后，就可以在这里发布与管理课程。");__o.push("</view>");}__o.push("\n      ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"goJoin\"" + ">");__o.push(__e(__x(function () { return (status === 'pending' ? '查看入驻资料' : '去入驻'); })));__o.push("</button>");__o.push("\n    ");__o.push("</view>");}__o.push("\n\n    ");if (__x(function () { return (org); })) {__o.push("\n      ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n          ");__o.push("<view" + ">");__o.push("\n            ");__o.push("<view" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (org.name); })));__o.push("</view>");__o.push("\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (org.courseCount); })) + " 门课程 · " + __e(__x(function () { return (org.address || '地址待完善'); })));__o.push("</view>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<text" + " class=\"link small\"" + " data-on-tap=\"openOrg\"" + ">");__o.push("编辑资料");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");if (__x(function () { return (org.intro); })) {__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (org.intro); })));__o.push("</view>");}__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"between mt\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"section-title\"" + " style=\"margin:0\"" + ">");__o.push("我的课程");__o.push("</text>");__o.push("\n        ");if (__x(function () { return (status === 'approved'); })) {__o.push("<button" + " class=\"btn btn-plain btn-sm\"" + " data-on-tap=\"openCreate\"" + ">");__o.push("＋ 发布课程");__o.push("</button>");}__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"list mt-s\"" + ">");__o.push("\n        ");{let __l0 = (courses); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"card course\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"strong grow ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.price); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" /" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("\n            " + __e(__x(function () { return (item.category); })) + " · 余位 " + __e(__x(function () { return (item.remaining); })) + " · " + __e(__x(function () { return (item.packageCount); })) + " 个套餐\n            ");if (__x(function () { return (item.learningName); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (item.learningName); })));__o.push("</text>");}__o.push("\n            · 服务人群 " + __e(__x(function () { return (org.audienceText); })) + "\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"row gap mt-s\"" + ">");__o.push("\n            ");__o.push("<button" + " class=\"btn btn-ghost btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"previewCourse\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("预览");__o.push("</button>");__o.push("\n            ");__o.push("<button" + " class=\"btn btn-plain btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openEdit\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("编辑");__o.push("</button>");__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (!courses.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("还没有课程，点击右上角发布第一门课");__o.push("</view>");}__o.push("\n    ");}__o.push("\n  ");}__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (showOrg); })) {__o.push("<view" + " class=\"mask\"" + " data-on-tap=\"closeOrg\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"sheet\"" + " data-catch-tap=\"noop\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("编辑机构资料");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("机构简介");__o.push("</text>");__o.push("\n        ");__o.push("<textarea" + " class=\"textarea\"" + " data-field=\"intro\"" + " data-on-input=\"onOrgField\"" + " maxlength=\"500\"" + " placeholder=\"介绍机构特色与教学方向\"" + ' data-ds="' + __e(JSON.stringify({ "field": "intro" })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".3" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (orgForm.intro); })));__o.push("</textarea>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("地址");__o.push("</text>");__o.push("\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (orgForm.address); })) + '"' + " data-field=\"address\"" + " data-on-input=\"onOrgField\"" + " maxlength=\"200\"" + " placeholder=\"详细地址\"" + ' data-ds="' + __e(JSON.stringify({ "field": "address" })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".5" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("联系人");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (orgForm.contact); })) + '"' + " data-field=\"contact\"" + " data-on-input=\"onOrgField\"" + " maxlength=\"40\"" + " placeholder=\"联系人姓名\"" + ' data-ds="' + __e(JSON.stringify({ "field": "contact" })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".7" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("联系电话");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (orgForm.phone); })) + '"' + " data-field=\"phone\"" + " data-on-input=\"onOrgField\"" + " maxlength=\"30\"" + " placeholder=\"电话\"" + ' data-ds="' + __e(JSON.stringify({ "field": "phone" })) + '"' + ' data-el="' + (__PATH + ".0" + ".8" + ".1" + ".7" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("服务人群");__o.push("</text>");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("可多选：家长看到的课程页与大学生看到的学习资源页会按这里分区展示。");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"audience-options\"" + ">");__o.push("\n          ");{let __l1 = (orgAudience); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"" + ("audience-option " + __e(__x(function () { return (item.on ? 'on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item.value); })) + '"' + " data-on-tap=\"toggleOrgAudience\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item.value); }) })) + '"' + ">");__o.push("\n            ");__o.push("<view" + " class=\"audience-box\"" + ">");__o.push(__e(__x(function () { return (item.on ? '✓' : ''); })));__o.push("</view>");__o.push("\n            ");__o.push("<view" + " class=\"audience-text\"" + ">");__o.push("\n              ");__o.push("<view" + " class=\"strong small\"" + ">");__o.push(__e(__x(function () { return (item.value); })));__o.push("</view>");__o.push("\n              ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.hint); })));__o.push("</view>");__o.push("\n            ");__o.push("</view>");__o.push("\n          ");__o.push("</view>");}}__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"saveOrg\"" + (((savingOrg) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (savingOrg ? '保存中…' : '保存'); })));__o.push("</button>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (showForm); })) {__o.push("<view" + " class=\"mask\"" + " data-on-tap=\"closeForm\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"sheet tall\"" + " data-catch-tap=\"noop\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push(__e(__x(function () { return (creating ? '发布课程' : '编辑课程'); })));__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("课程名称");__o.push("</text>");__o.push("\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.title); })) + '"' + " data-field=\"title\"" + " data-on-input=\"onField\"" + " maxlength=\"40\"" + " placeholder=\"如 考研数学 · 强化提高班\"" + ' data-ds="' + __e(JSON.stringify({ "field": "title" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("分类");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.category); })) + '"' + " data-field=\"category\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 考研辅导\"" + ' data-ds="' + __e(JSON.stringify({ "field": "category" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".5" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("标签");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.tag); })) + '"' + " data-field=\"tag\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 备考推荐\"" + ' data-ds="' + __e(JSON.stringify({ "field": "tag" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".5" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("价格（元）");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"number\"" + " step=\"any\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.price); })) + '"' + " data-field=\"price\"" + " data-on-input=\"onField\"" + " maxlength=\"8\"" + " placeholder=\"如 1280\"" + ' data-ds="' + __e(JSON.stringify({ "field": "price" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".7" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("计价单位");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.unit); })) + '"' + " data-field=\"unit\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 16课时\"" + ' data-ds="' + __e(JSON.stringify({ "field": "unit" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".7" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("余位");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.remaining); })) + '"' + " data-field=\"remaining\"" + " data-on-input=\"onField\"" + " maxlength=\"5\"" + " placeholder=\"10\"" + ' data-ds="' + __e(JSON.stringify({ "field": "remaining" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".9" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("上课地点");__o.push("</text>");__o.push("\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.location); })) + '"' + " data-field=\"location\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 南岗区 · 学府路\"" + ' data-ds="' + __e(JSON.stringify({ "field": "location" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".9" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("课程介绍");__o.push("</text>");__o.push("\n        ");__o.push("<textarea" + " class=\"textarea\"" + " data-field=\"description\"" + " data-on-input=\"onField\"" + " maxlength=\"1000\"" + " placeholder=\"课程内容、适合人群、上课安排\"" + ' data-ds="' + __e(JSON.stringify({ "field": "description" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".11" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (form.description); })));__o.push("</textarea>");__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("备考方向（选填）");__o.push("</text>");__o.push("\n          ");__o.push("<picker" + " data-on-change=\"onLearningKind\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (learningNames); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (learningKindIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".13" + ".1" + ".3") + '"' + ">");__o.push("\n            ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (learningNames[learningKindIndex]); })));__o.push("</view>");__o.push("\n          ");__o.push("</picker>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");if (__x(function () { return (subjects.length); })) {__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("科目");__o.push("</text>");__o.push("\n          ");__o.push("<picker" + " data-on-change=\"onSubject\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (subjects); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (subjectIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".13" + ".3" + ".3") + '"' + ">");__o.push("\n            ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (subjects[subjectIndex]); })));__o.push("</view>");__o.push("\n          ");__o.push("</picker>");__o.push("\n        ");__o.push("</view>");}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("设置备考方向后，课程会出现在「学习资源」对应科目下。");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("套餐（选填）");__o.push("</view>");__o.push("\n      ");{let __l2 = (form.packages); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"pkg-box\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("套餐 " + __e(__x(function () { return (index + 1); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"link tiny\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"removePackage\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("删除");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input mt-s\"" + " value=\"" + __e(__x(function () { return (item.name); })) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-field=\"name\"" + " data-on-input=\"onPackageField\"" + " maxlength=\"60\"" + " placeholder=\"套餐名称，如 强化班（16课时）\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }), "field": "name" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".19" + "-" + __i2 + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("<view" + " class=\"row gap mt-s\"" + ">");__o.push("\n          ");__o.push("<input" + " type=\"number\"" + " step=\"any\"" + " class=\"input grow\"" + " value=\"" + __e(__x(function () { return (item.price); })) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-field=\"price\"" + " data-on-input=\"onPackageField\"" + " maxlength=\"8\"" + " placeholder=\"价格\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }), "field": "price" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".19" + "-" + __i2 + ".5" + ".1") + '"' + ">");__o.push("</input>");__o.push("\n          ");__o.push("<input" + " type=\"number\"" + " class=\"input grow\"" + " value=\"" + __e(__x(function () { return (item.lessons); })) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-field=\"lessons\"" + " data-on-input=\"onPackageField\"" + " maxlength=\"4\"" + " placeholder=\"课时数\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }), "field": "lessons" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".19" + "-" + __i2 + ".5" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input mt-s\"" + " value=\"" + __e(__x(function () { return (item.description); })) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-field=\"description\"" + " data-on-input=\"onPackageField\"" + " maxlength=\"200\"" + " placeholder=\"套餐说明（选填）\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }), "field": "description" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".19" + "-" + __i2 + ".7") + '"' + ">");__o.push("</input>");__o.push("\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input mt-s\"" + " value=\"" + __e(__x(function () { return (item.videoUrl); })) + '"' + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-field=\"videoUrl\"" + " data-on-input=\"onPackageField\"" + " maxlength=\"500\"" + " placeholder=\"课程视频链接（选填，http/https 地址）\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }), "field": "videoUrl" })) + '"' + ' data-el="' + (__PATH + ".0" + ".11" + ".1" + ".19" + "-" + __i2 + ".9") + '"' + ">");__o.push("</input>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n      ");__o.push("<button" + " class=\"btn btn-ghost btn-sm mt\"" + " data-on-tap=\"addPackage\"" + ">");__o.push("＋ 添加套餐");__o.push("</button>");__o.push("\n\n      ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"saveCourse\"" + (((saving) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (saving ? '保存中…' : (creating ? '发布课程' : '保存修改')); })));__o.push("</button>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/join/join"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\r\n  ");if (__x(function () { return (needLogin); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("登录后提交入驻申请");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("入驻申请会绑定当前登录账号，审核通过后可用同一账号进入工作台。");__o.push("</view>");__o.push("\r\n    ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\r\n  ");__o.push("</view>");} else if (__x(function () { return (!type); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("当前账号暂不支持入驻");__o.push("</view>");__o.push("\r\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("机构请使用「机构」类型账号、大学生请使用「大学生」类型账号登录后提交申请。");__o.push("</view>");__o.push("\r\n  ");__o.push("</view>");} else {__o.push("\r\n    ");__o.push("<view" + " class=\"card status\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (typeName); })) + "入驻");__o.push("</text>");__o.push("\r\n        ");if (__x(function () { return (status); })) {__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (statusTone === 'ok' ? 'tag-ok' : statusTone === 'warn' ? 'tag-warn' : 'tag-muted'); }))) + '"' + ">");__o.push(__e(__x(function () { return (statusText); })));__o.push("</text>");} else {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push("未提交");__o.push("</text>");}__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n      ");if (__x(function () { return (submittedAt); })) {__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("提交时间：" + __e(__x(function () { return (submittedAt); })));__o.push("</view>");}__o.push("\r\n      ");if (__x(function () { return (status === 'approved'); })) {__o.push("<view" + " class=\"row gap mt\"" + ">");__o.push("\r\n        ");if (__x(function () { return (role === 'institution'); })) {__o.push("<button" + " class=\"btn btn-sm\"" + " data-on-tap=\"goWorkspace\"" + ">");__o.push("进入机构工作台");__o.push("</button>");}__o.push("\r\n        ");if (__x(function () { return (role === 'tutor'); })) {__o.push("<button" + " class=\"btn btn-sm\"" + " data-on-tap=\"goCompanion\"" + ">");__o.push("查看伴学资料");__o.push("</button>");}__o.push("\r\n      ");__o.push("</view>");}__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n\r\n    ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\r\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push(__e(__x(function () { return (type === '机构' ? '机构名称' : '姓名'); })));__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.name); })) + '"' + " data-field=\"name\"" + " data-on-input=\"onField\"" + " maxlength=\"60\"" + " placeholder=\"" + __e(__x(function () { return (type === '机构' ? '请填写机构全称' : '请填写真实姓名'); })) + '"' + ' data-ds="' + __e(JSON.stringify({ "field": "name" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");if (__x(function () { return (type === '机构'); })) {__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("联系人");__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.contact); })) + '"' + " data-field=\"contact\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"请填写联系人姓名\"" + ' data-ds="' + __e(JSON.stringify({ "field": "contact" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");}__o.push("\r\n\r\n      ");if (__x(function () { return (type === '机构'); })) {__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("服务人群");__o.push("</text>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("可多选：家长看到的课程页与大学生看到的学习资源页会按这里分区展示。");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"audience-options\"" + ">");__o.push("\r\n          ");{let __l0 = (audienceOptions); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("audience-option " + __e(__x(function () { return (item.on ? 'on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item.value); })) + '"' + " data-on-tap=\"toggleAudience\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item.value); }) })) + '"' + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"audience-box\"" + ">");__o.push(__e(__x(function () { return (item.on ? '✓' : ''); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<view" + " class=\"audience-text\"" + ">");__o.push("\r\n              ");__o.push("<view" + " class=\"strong small\"" + ">");__o.push(__e(__x(function () { return (item.value); })));__o.push("</view>");__o.push("\r\n              ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.hint); })));__o.push("</view>");__o.push("\r\n            ");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");}}__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");__o.push("</view>");}__o.push("\r\n\r\n      ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n        ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("手机号（须与账号手机号一致）");__o.push("</text>");__o.push("\r\n        ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.phone); })) + '"' + " data-field=\"phone\"" + " data-on-input=\"onField\"" + " maxlength=\"11\"" + " placeholder=\"11 位手机号\"" + ' data-ds="' + __e(JSON.stringify({ "field": "phone" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".7" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n      ");__o.push("</view>");__o.push("\r\n\r\n      ");if (__x(function () { return (type === '接送'); })) {__o.push("\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("接送区域（小区 / 片区）");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.area); })) + '"' + " data-field=\"area\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 南岗区 · 花园小区\"" + ' data-ds="' + __e(JSON.stringify({ "field": "area" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("孩子就读学校");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.school); })) + '"' + " data-field=\"school\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"顺路接送的学校\"" + ' data-ds="' + __e(JSON.stringify({ "field": "school" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".3" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("自家孩子年级");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.childGrade); })) + '"' + " data-field=\"childGrade\"" + " data-on-input=\"onField\"" + " maxlength=\"20\"" + " placeholder=\"如 三年级\"" + ' data-ds="' + __e(JSON.stringify({ "field": "childGrade" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".3" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n        ");__o.push("<view" + " class=\"muted tiny\"" + " style=\"margin-top:-8rpx;\"" + ">");__o.push("私家车入驻仅面向同时接送自家孩子的家长，孩子须在顺路学校就读。");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("车型与安全配置");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.vehicle); })) + '"' + " data-field=\"vehicle\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 5 座轿车 · 配儿童安全座椅\"" + ' data-ds="' + __e(JSON.stringify({ "field": "vehicle" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".7" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("可接孩子数（1–6）");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.seat); })) + '"' + " data-field=\"seat\"" + " data-on-input=\"onField\"" + " maxlength=\"1\"" + " placeholder=\"如 2\"" + ' data-ds="' + __e(JSON.stringify({ "field": "seat" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".9" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("接送年数");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"number\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.years); })) + '"' + " data-field=\"years\"" + " data-on-input=\"onField\"" + " maxlength=\"2\"" + " placeholder=\"如 3，新手填 0\"" + ' data-ds="' + __e(JSON.stringify({ "field": "years" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".9" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("可接时段");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.timeText); })) + '"' + " data-field=\"timeText\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 工作日早 07:30 送上 · 晚 16:40 接回\"" + ' data-ds="' + __e(JSON.stringify({ "field": "timeText" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".9" + ".11" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"safety-card\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"strong small\"" + ">");__o.push("🛡️ 车主安全承诺");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"safety-list\"" + ">");__o.push("\r\n            ");__o.push("<text" + ">");__o.push("· 完成实名核验，无犯罪记录，驾证齐全有效");__o.push("</text>");__o.push("\r\n            ");__o.push("<text" + ">");__o.push("· 只接送自家孩子与顺路同校孩子，不载陌生乘客");__o.push("</text>");__o.push("\r\n            ");__o.push("<text" + ">");__o.push("· 全程系安全带，学龄前与低龄儿童配安全座椅");__o.push("</text>");__o.push("\r\n            ");__o.push("<text" + ">");__o.push("· 只在学校与住址两点往返，不绕路、不中途停留");__o.push("</text>");__o.push("\r\n            ");__o.push("<text" + ">");__o.push("· 接送上车第一时间在家长群报位置，异常情况提前告知");__o.push("</text>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"safety-check\"" + " data-on-tap=\"toggleSafety\"" + ">");__o.push("\r\n            ");__o.push("<view" + " class=\"" + ("safety-box " + __e(__x(function () { return (safety ? 'on' : ''); }))) + '"' + ">");__o.push(__e(__x(function () { return (safety ? '✓' : ''); })));__o.push("</view>");__o.push("\r\n            ");__o.push("<text" + " class=\"small\"" + ">");__o.push("我已阅读并承诺遵守以上安全准则");__o.push("</text>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n      ");} else if (__x(function () { return (type === '伴学'); })) {__o.push("\r\n        ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("学历");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.education); })) + '"' + " data-field=\"education\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 本科 / 硕士\"" + ' data-ds="' + __e(JSON.stringify({ "field": "education" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".1" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("年级");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.grade); })) + '"' + " data-field=\"grade\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 大二 / 研一\"" + ' data-ds="' + __e(JSON.stringify({ "field": "grade" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".1" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("就读学校");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.school); })) + '"' + " data-field=\"school\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"请填写学校名称\"" + ' data-ds="' + __e(JSON.stringify({ "field": "school" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".3" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("伴学方向");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.subjects); })) + '"' + " data-field=\"subjects\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 阅读陪伴、习惯培养\"" + ' data-ds="' + __e(JSON.stringify({ "field": "subjects" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".5" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("课时费（元/小时）");__o.push("</text>");__o.push("\r\n            ");__o.push("<input" + " type=\"number\"" + " step=\"any\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.hourlyRate); })) + '"' + " data-field=\"hourlyRate\"" + " data-on-input=\"onField\"" + " maxlength=\"8\"" + " placeholder=\"如 120\"" + ' data-ds="' + __e(JSON.stringify({ "field": "hourlyRate" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".7" + ".1" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\r\n            ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("性别");__o.push("</text>");__o.push("\r\n            ");__o.push("<picker" + " data-on-change=\"onGender\"" + " data-picker-mode=\"selector\"" + ' data-picker-range="' + __e(JSON.stringify(__x(function () { return (genders); }) || [])) + '"' + ' data-picker-value="' + __e(__x(function () { return (genderIndex); })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".7" + ".3" + ".3") + '"' + ">");__o.push("\r\n              ");__o.push("<view" + " class=\"picker\"" + ">");__o.push(__e(__x(function () { return (form.gender); })));__o.push("</view>");__o.push("\r\n            ");__o.push("</picker>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("专业（选填）");__o.push("</text>");__o.push("\r\n          ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (form.major); })) + '"' + " data-field=\"major\"" + " data-on-input=\"onField\"" + " maxlength=\"100\"" + " placeholder=\"如 汉语言文学\"" + ' data-ds="' + __e(JSON.stringify({ "field": "major" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".9" + ".3") + '"' + ">");__o.push("</input>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("简历");__o.push("</text>");__o.push("\r\n          ");__o.push("<textarea" + " class=\"textarea\"" + " data-field=\"resume\"" + " data-on-input=\"onField\"" + " maxlength=\"1000\"" + " placeholder=\"个人经历、陪伴经验与擅长方向\"" + ' data-ds="' + __e(JSON.stringify({ "field": "resume" })) + '"' + ' data-el="' + (__PATH + ".0" + ".5" + ".3" + ".11" + ".11" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (form.resume); })));__o.push("</textarea>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\r\n          ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("正脸照片");__o.push("</text>");__o.push("\r\n          ");__o.push("<view" + " class=\"photo-row\"" + " data-on-tap=\"choosePhoto\"" + ">");__o.push("\r\n            ");if (__x(function () { return (form.photoPreview); })) {__o.push("<img" + " class=\"photo\"" + " src=\"" + __e(__x(function () { return (form.photoPreview); })) + '"' + " mode=\"aspectFill\"" + ">");__o.push("</img>");} else {__o.push("<view" + " class=\"photo placeholder\"" + ">");__o.push("＋ 上传");__o.push("</view>");}__o.push("\r\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("照片仅用于资料展示，建议正面清晰、无水印");__o.push("</view>");__o.push("\r\n          ");__o.push("</view>");__o.push("\r\n        ");__o.push("</view>");__o.push("\r\n\r\n        ");__o.push("<view" + " class=\"banner mt\"" + ">");__o.push("伴学以阅读陪伴、习惯培养、时间规划等支持为限，不开展学科教学、补课或考试培训。");__o.push("</view>");__o.push("\r\n      ");}__o.push("\r\n\r\n      ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"submit\"" + (((submitting) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (submitting ? '提交中…' : '提交入驻申请'); })));__o.push("</button>");__o.push("\r\n      ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("提交后将由平台审核，审核通过后即可发布" + __e(__x(function () { return (type === '机构' ? '课程' : type === '接送' ? '私家车接送服务' : '伴学服务'); })) + "。");__o.push("</view>");__o.push("\r\n    ");__o.push("</view>");__o.push("\r\n  ");}__o.push("\r\n");__o.push("</view>");__o.push("\r\n");}return __o.join("");};
templates["pages/companion/companion"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (!logged); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("登录后查看伴学资料");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("伴学资料绑定在你的大学生账号上。");__o.push("</view>");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\n  ");__o.push("</view>");} else if (__x(function () { return (!isTutor); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("该页面面向大学生伴学账号");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("当前账号不是大学生类型，如需以伴学身份入驻，请使用大学生账号登录。");__o.push("</view>");__o.push("\n  ");__o.push("</view>");} else if (__x(function () { return (app); })) {__o.push("\n    ");__o.push("<view" + " class=\"card hero\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"row gap\"" + ">");__o.push("\n          ");if (__x(function () { return (app.photo); })) {__o.push("<img" + " class=\"avatar\"" + " src=\"" + __e(__x(function () { return (app.photo); })) + '"' + " mode=\"aspectFill\"" + ">");__o.push("</img>");} else {__o.push("<view" + " class=\"avatar placeholder\"" + ">");__o.push("🧑‍🎓");__o.push("</view>");}__o.push("\n          ");__o.push("<view" + ">");__o.push("\n            ");__o.push("<view" + " class=\"title\"" + ">");__o.push(__e(__x(function () { return (app.name); })));__o.push("</view>");__o.push("\n            ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push(__e(__x(function () { return (app.school || '学校待完善'); })));if (__x(function () { return (app.education); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (app.education); })));__o.push("</text>");}if (__x(function () { return (app.grade); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (app.grade); })));__o.push("</text>");}__o.push("</view>");__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (app.status === 'approved' ? 'tag-ok' : 'tag-warn'); }))) + '"' + ">");__o.push(__e(__x(function () { return (statusText); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"row gap-s mt\"" + ">");__o.push("\n        ");if (__x(function () { return (app.hourlyRate); })) {__o.push("<text" + " class=\"tag\"" + ">");__o.push("¥" + __e(__x(function () { return (app.hourlyRate); })) + " / 小时");__o.push("</text>");}__o.push("\n        ");if (__x(function () { return (app.gender); })) {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (app.gender); })));__o.push("</text>");}__o.push("\n        ");if (__x(function () { return (app.major); })) {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (app.major); })));__o.push("</text>");}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("伴学方向");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"pre\"" + ">");__o.push(__e(__x(function () { return (app.subjects || '待完善'); })));__o.push("</view>");__o.push("\n      ");if (__x(function () { return (methods.length); })) {__o.push("<view" + " class=\"chips mt-s\"" + ">");__o.push("\n        ");{let __l0 = (methods); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("\n      ");__o.push("</view>");}__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"section-title\"" + " style=\"margin-top:0\"" + ">");__o.push("个人经历");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"pre\"" + ">");__o.push(__e(__x(function () { return (app.resume || '待完善'); })));__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("联系电话");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (app.phone); })));__o.push("</text>");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (app.address); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("服务范围");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (app.address); })));__o.push("</text>");__o.push("</view>");}__o.push("\n      ");if (__x(function () { return (app.experience); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("相关经历");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (app.experience); })));__o.push("</text>");__o.push("</view>");}__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"banner mt\"" + ">");__o.push("伴学以阅读陪伴、习惯培养与时间规划为限，不包含学科教学、补课、考试培训，也不作提分承诺。");__o.push("</view>");__o.push("\n\n    ");__o.push("<button" + " class=\"btn btn-ghost btn-block mt\"" + " data-on-tap=\"goJoin\"" + ">");__o.push("补充或更新入驻资料");__o.push("</button>");__o.push("\n  ");} else if (__x(function () { return (!loading); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("还没有提交伴学入驻");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push("提交资料并通过审核后，家长就能在平台上看到你的伴学服务。");__o.push("</view>");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"goJoin\"" + ">");__o.push("开始入驻");__o.push("</button>");__o.push("\n  ");__o.push("</view>");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/feedback/feedback"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"field\"" + " style=\"margin-top:0\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("反馈类型");__o.push("</text>");__o.push("\n      ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\n        ");{let __l0 = (categories); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("chip " + __e(__x(function () { return (category === item ? 'chip-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onCategory\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("反馈内容（5–500 字）");__o.push("</text>");__o.push("\n      ");__o.push("<textarea" + " class=\"textarea\"" + " data-field=\"content\"" + " data-on-input=\"onField\"" + " maxlength=\"500\"" + " placeholder=\"请描述遇到的问题或建议\"" + ' data-ds="' + __e(JSON.stringify({ "field": "content" })) + '"' + ' data-el="' + (__PATH + ".0" + ".1" + ".3" + ".3") + '"' + ">");__o.push(__e(__x(function () { return (content); })));__o.push("</textarea>");__o.push("\n      ");__o.push("<view" + " class=\"muted tiny right\"" + ">");__o.push(__e(__x(function () { return (content.length); })) + " / 500");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("相关订单号（选填）");__o.push("</text>");__o.push("\n      ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (orderNumber); })) + '"' + " data-field=\"orderNumber\"" + " data-on-input=\"onField\"" + " maxlength=\"30\"" + " placeholder=\"在订单详情可复制订单号\"" + ' data-ds="' + __e(JSON.stringify({ "field": "orderNumber" })) + '"' + ' data-el="' + (__PATH + ".0" + ".1" + ".5" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("联系方式（选填，手机号或邮箱）");__o.push("</text>");__o.push("\n      ");__o.push("<input" + " type=\"text\"" + " class=\"input\"" + " value=\"" + __e(__x(function () { return (contact); })) + '"' + " data-field=\"contact\"" + " data-on-input=\"onField\"" + " maxlength=\"60\"" + " placeholder=\"便于我们回访\"" + ' data-ds="' + __e(JSON.stringify({ "field": "contact" })) + '"' + ' data-el="' + (__PATH + ".0" + ".1" + ".7" + ".3") + '"' + ">");__o.push("</input>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"field\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"field-label\"" + ">");__o.push("整体评分（选填）");__o.push("</text>");__o.push("\n      ");__o.push("<view" + " class=\"stars\"" + ">");__o.push("\n        ");{let __l1 = (stars); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<text" + " class=\"" + ("star " + __e(__x(function () { return (rating >= item ? 'star-on' : ''); }))) + '"' + " data-value=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onRating\"" + ' data-ds="' + __e(JSON.stringify({ "value": __x(function () { return (item); }) })) + '"' + ">");__o.push("★");__o.push("</text>");}}__o.push("\n        ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (rating ? rating + ' 分' : '未评分'); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<button" + " class=\"btn btn-block mt\"" + " data-on-tap=\"submit\"" + (((submitting) ? " disabled" : '')) + ">");__o.push(__e(__x(function () { return (submitting ? '提交中…' : '提交反馈'); })));__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("我的反馈" + __e(__x(function () { return (count ? '（' + count + '）' : ''); })));__o.push("</view>");__o.push("\n  ");if (__x(function () { return (!logged); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("登录后可以查看自己提交过的反馈与回复。");__o.push("</view>");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-plain btn-block mt\"" + " data-on-tap=\"goLogin\"" + ">");__o.push("去登录");__o.push("</button>");__o.push("\n  ");__o.push("</view>");} else {__o.push("\n    ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\n      ");{let __l2 = (list); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"card\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (item.category); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.createdAt); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"small mt-s pre\"" + ">");__o.push(__e(__x(function () { return (item.content); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (item.statusText); })));if (__x(function () { return (item.rating); })) {__o.push("<text" + ">");__o.push(" · 评分 " + __e(__x(function () { return (item.rating); })));__o.push("</text>");}__o.push("</view>");__o.push("\n        ");if (__x(function () { return (item.reply); })) {__o.push("<view" + " class=\"reply mt-s\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("平台回复");__o.push("</text>");__o.push("\n          ");__o.push("<view" + " class=\"small pre\"" + ">");__o.push(__e(__x(function () { return (item.reply); })));__o.push("</view>");__o.push("\n        ");__o.push("</view>");}__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (!list.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("还没有提交过反馈");__o.push("</view>");}__o.push("\n  ");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/help/help"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");if (__x(function () { return (about); })) {__o.push("<view" + " class=\"card hero\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n      ");__o.push("<view" + ">");__o.push("\n        ");__o.push("<view" + " class=\"title\"" + ">");__o.push(__e(__x(function () { return (about.title); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (about.slogan); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<img" + " class=\"hero-ip\"" + " src=\"/assets/ip/mascot-rest.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted small mt\"" + ">");__o.push(__e(__x(function () { return (about.intro); })));__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (about.description); })));__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"chips mt\"" + ">");__o.push("\n      ");{let __l0 = (about.highlights); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("常见问题");__o.push("</view>");__o.push("\n  ");__o.push("<view" + " class=\"list\"" + ">");__o.push("\n    ");{let __l1 = (faq); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card faq\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"toggle\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"row gap-s grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push(__e(__x(function () { return (item.category); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"strong small grow\"" + ">");__o.push(__e(__x(function () { return (item.question); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<text" + " class=\"muted\"" + ">");__o.push(__e(__x(function () { return (openIndex === index ? '−' : '＋'); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (openIndex === index); })) {__o.push("<view" + " class=\"answer small pre\"" + ">");__o.push(__e(__x(function () { return (item.answer); })));__o.push("</view>");}__o.push("\n    ");__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");__o.push("\n  ");if (__x(function () { return (!faq.length && !loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂无常见问题");__o.push("</view>");}__o.push("\n\n  ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("联系我们");__o.push("</view>");__o.push("\n  ");if (__x(function () { return (contact); })) {__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("客服电话");__o.push("</text>");__o.push("<text" + " class=\"small link\"" + " data-on-tap=\"callPhone\"" + ">");__o.push(__e(__x(function () { return (contact.phone); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("客服微信");__o.push("</text>");__o.push("<text" + " class=\"small link\"" + " data-on-tap=\"copyWechat\"" + ">");__o.push(__e(__x(function () { return (contact.wechat); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("邮箱");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (contact.email); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("服务时间");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (contact.hours); })));__o.push("</text>");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted small\"" + ">");__o.push("地址");__o.push("</text>");__o.push("<view" + " class=\"small mt-s\"" + ">");__o.push(__e(__x(function () { return (contact.address); })));__o.push("</view>");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("<button" + " class=\"btn btn-ghost btn-block mt\"" + " data-on-tap=\"goFeedback\"" + ">");__o.push("意见反馈");__o.push("</button>");__o.push("\n  ");if (__x(function () { return (about); })) {__o.push("<view" + " class=\"muted tiny center mt-l\"" + ">");__o.push(__e(__x(function () { return (about.title); })) + " · " + __e(__x(function () { return (about.version); })) + " · " + __e(__x(function () { return (about.updatedAt); })));__o.push("</view>");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/institutions/institutions"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"card search\"" + ">");__o.push("\n    ");__o.push("<input" + " type=\"text\"" + " class=\"grow\"" + " value=\"" + __e(__x(function () { return (keyword); })) + '"' + " data-on-input=\"onKeyword\"" + " placeholder=\"搜索机构名称、地址\"" + " enterkeyhint=\"search\"" + ' data-el="' + (__PATH + ".0" + ".1" + ".1") + '"' + ">");__o.push("</input>");__o.push("\n    ");__o.push("<text" + " class=\"muted\"" + ">");__o.push("⌕");__o.push("</text>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("正在加载机构…");__o.push("</view>");} else if (__x(function () { return (list.length); })) {__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\n    ");{let __l0 = (list); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"card org\"" + " data-name=\"" + __e(__x(function () { return (item.name); })) + '"' + " data-on-tap=\"openMerchant\"" + ' data-ds="' + __e(JSON.stringify({ "name": __x(function () { return (item.name); }) })) + '"' + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n        ");__o.push("<view" + " class=\"org-tags\"" + ">");__o.push("\n          ");if (__x(function () { return (item.rating); })) {__o.push("<text" + " class=\"rating-pill\"" + ">");__o.push("★ " + __e(__x(function () { return (item.rating.scoreText); })));__o.push("</text>");}__o.push("\n          ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (item.courseCount); })) + " 门课程");__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"muted small mt-s\"" + ">");__o.push(__e(__x(function () { return (item.intro || '机构介绍待完善'); })));__o.push("</view>");__o.push("\n      ");if (__x(function () { return (item.address); })) {__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("⌖ " + __e(__x(function () { return (item.address); })));__o.push("</view>");}__o.push("\n      ");__o.push("<view" + " class=\"between mt-s\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.contact ? '联系人：' + item.contact : ''); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"link small\"" + ">");__o.push("查看主页 ›");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("没有找到匹配的机构");__o.push("</view>");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/merchant/merchant"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {if (__x(function () { return (org); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("\n  ");__o.push("<view" + " class=\"m-hero\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"m-head\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"m-logo\"" + ">");__o.push(__e(__x(function () { return (org.logo); })));__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"m-name-row\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"m-name\"" + ">");__o.push(__e(__x(function () { return (org.name); })));__o.push("</text>");__o.push("\n          ");if (__x(function () { return (org.verified); })) {__o.push("<text" + " class=\"tag tag-ok\"" + ">");__o.push("已认证");__o.push("</text>");}__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"m-sub\"" + ">");__o.push(__e(__x(function () { return (org.foundText); })) + " · " + __e(__x(function () { return (org.audienceText); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (org.intro); })) {__o.push("<view" + " class=\"m-intro\"" + ">");__o.push(__e(__x(function () { return (org.intro); })));__o.push("</view>");}__o.push("\n    ");__o.push("<view" + " class=\"m-stats\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"m-stat\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"m-num\"" + ">");__o.push(__e(__x(function () { return (org.stats.courseCount); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"m-lab\"" + ">");__o.push("门课程");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"m-stat\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"m-num\"" + ">");__o.push(__e(__x(function () { return (org.stats.teacherCount); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"m-lab\"" + ">");__o.push("位老师");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"m-stat\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"m-num\"" + ">");__o.push(__e(__x(function () { return (org.stats.packageCount); })));__o.push("</text>");__o.push("\n        ");__o.push("<text" + " class=\"m-lab\"" + ">");__o.push("个套餐");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("\n  ");__o.push("<view" + " class=\"card m-price\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"m-price-label\"" + ">");__o.push("课程价格");__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"m-price-value\"" + ">");__o.push(__e(__x(function () { return (org.priceRangeText); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("价格以课程页套餐为准，选课前可先咨询");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (org.rating && org.rating.count); })) {__o.push("<view" + " class=\"card rate\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"rate-head\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"rate-score\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"rate-num\"" + ">");__o.push(__e(__x(function () { return (org.rating.scoreText); })));__o.push("</text>");__o.push("\n        ");__o.push("<view" + " class=\"rate-side\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"stars\"" + ">");__o.push("\n            ");{let __l0 = (org.rating.stars); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<text" + " class=\"" + ("star " + __e(__x(function () { return (item.on ? 'on' : ''); }))) + '"' + ">");__o.push("★");__o.push("</text>");}}__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<text" + " class=\"rate-count\"" + ">");__o.push(__e(__x(function () { return (org.rating.countText); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<text" + " class=\"rate-badge\"" + ">");__o.push(__e(__x(function () { return (org.rating.level); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"rate-dims\"" + ">");__o.push("\n      ");{let __l1 = (org.rating.dims); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"rate-dim\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"rate-dim-name\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n        ");__o.push("<view" + " class=\"rate-bar\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"rate-bar-fill\"" + " style=\"" + ("width:" + __e(__x(function () { return (item.width); })) + "%") + '"' + ">");__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<text" + " class=\"rate-dim-score\"" + ">");__o.push(__e(__x(function () { return (item.scoreText); })));__o.push("</text>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");if (__x(function () { return (org.rating.hasReviews); })) {__o.push("<view" + " class=\"rate-reviews\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"rate-reviews-title\"" + ">");__o.push("家长评价");__o.push("</view>");__o.push("\n      ");{let __l2 = (org.rating.reviews); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"review\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"review-avatar\"" + ">");__o.push(__e(__x(function () { return (item.initial); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"review-user\"" + ">");__o.push(__e(__x(function () { return (item.user); })));__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"review-date\"" + ">");__o.push(__e(__x(function () { return (item.date); })));__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"stars review-stars\"" + ">");__o.push("\n            ");{let __l3 = (item.stars); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let star = __l3[__i3]; let index = __i3;__o.push("<text" + " class=\"" + ("star sm " + __e(__x(function () { return (star.on ? 'on' : ''); }))) + '"' + ">");__o.push("★");__o.push("</text>");}}__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"review-text\"" + ">");__o.push(__e(__x(function () { return (item.text); })));__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (org.images.length); })) {__o.push("<view" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("校区环境");__o.push("</view>");__o.push("\n    ");__o.push("<scroll-view" + " class=\"env-scroll\"" + " scroll-x" + " enable-flex" + ' data-el="' + (__PATH + ".0" + ".11" + ".3") + '"' + ">");__o.push("\n      ");{let __l4 = (org.images); if (!__l4) __l4 = [];for (let __i4 = 0; __i4 < __l4.length; __i4++) {let item = __l4[__i4]; let index = __i4;__o.push("<view" + " class=\"" + ("env-item tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push("\n        ");__o.push("<text" + " class=\"env-icon\"" + ">");__o.push(__e(__x(function () { return (org.logo); })));__o.push("</text>");__o.push("\n        ");__o.push("<view" + " class=\"env-body\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"env-name\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\n          ");if (__x(function () { return (item.caption); })) {__o.push("<view" + " class=\"env-cap\"" + ">");__o.push(__e(__x(function () { return (item.caption); })));__o.push("</view>");}__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</scroll-view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("\n  ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("在售课程");__o.push("</view>");__o.push("\n  ");if (__x(function () { return (org.courses.length); })) {__o.push("<view" + " class=\"list\"" + ">");__o.push("\n    ");{let __l5 = (org.courses); if (!__l5) __l5 = [];for (let __i5 = 0; __i5 < __l5.length; __i5++) {let item = __l5[__i5]; let index = __i5;__o.push("<view" + " class=\"card course\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openCourse\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\n      ");__o.push("<view" + " class=\"" + ("course-icon tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"course-title\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\n          ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("</text>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"course-meta\"" + ">");__o.push(__e(__x(function () { return (item.category); })));if (__x(function () { return (item.unit); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (item.unit); })));__o.push("</text>");}__o.push("</view>");__o.push("\n        ");if (__x(function () { return (item.packageCount); })) {__o.push("<view" + " class=\"row gap-s mt-s\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"mini-tag\"" + ">");__o.push(__e(__x(function () { return (item.packageCount); })) + " 个套餐可选");__o.push("</text>");__o.push("\n          ");if (__x(function () { return (item.tag); })) {__o.push("<text" + " class=\"mini-tag\"" + ">");__o.push(__e(__x(function () { return (item.tag); })));__o.push("</text>");}__o.push("\n        ");__o.push("</view>");}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("这家机构还没有上架课程");__o.push("</view>");}__o.push("\n\n  ");__o.push("\n  ");if (__x(function () { return (org.teachers.length); })) {__o.push("<view" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("教师介绍");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"teacher-grid\"" + ">");__o.push("\n      ");{let __l6 = (org.teachers); if (!__l6) __l6 = [];for (let __i6 = 0; __i6 < __l6.length; __i6++) {let item = __l6[__i6]; let index = __i6;__o.push("<view" + " class=\"teacher\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"teacher-avatar\"" + ">");__o.push(__e(__x(function () { return (item.initial); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"teacher-name\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");__o.push("\n          ");if (__x(function () { return (item.subject); })) {__o.push("<view" + " class=\"teacher-subject\"" + ">");__o.push(__e(__x(function () { return (item.subject); })));__o.push("</view>");}__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");}__o.push("\n\n  ");__o.push("\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"section-title\"" + ">");__o.push("资质与联系");__o.push("</view>");__o.push("\n    ");if (__x(function () { return (org.licenses.length); })) {__o.push("<view" + " class=\"info-row\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"info-label\"" + ">");__o.push("办学资质");__o.push("</text>");__o.push("\n      ");__o.push("<view" + " class=\"chips\"" + ">");__o.push("\n        ");{let __l7 = (org.licenses); if (!__l7) __l7 = [];for (let __i7 = 0; __i7 < __l7.length; __i7++) {let item = __l7[__i7]; let index = __i7;__o.push("<text" + " class=\"chip\"" + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</text>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (org.address); })) {__o.push("<view" + " class=\"info-row\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"info-label\"" + ">");__o.push("机构地址");__o.push("</text>");__o.push("\n      ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"info-value\"" + ">");__o.push(__e(__x(function () { return (org.address); })));__o.push("</view>");__o.push("\n        ");__o.push("<text" + " class=\"link tiny\"" + " data-on-tap=\"copyAddress\"" + ">");__o.push("复制地址");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (org.contact); })) {__o.push("<view" + " class=\"info-row\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"info-label\"" + ">");__o.push("联系人");__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"info-value grow\"" + ">");__o.push(__e(__x(function () { return (org.contact); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");}__o.push("\n    ");if (__x(function () { return (org.phone); })) {__o.push("<view" + " class=\"info-row\"" + ">");__o.push("\n      ");__o.push("<text" + " class=\"info-label\"" + ">");__o.push("联系电话");__o.push("</text>");__o.push("\n      ");__o.push("<text" + " class=\"info-value grow\"" + ">");__o.push(__e(__x(function () { return (org.phone); })));__o.push("</text>");__o.push("\n    ");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"footer-bar\"" + ">");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-ghost\"" + " data-on-tap=\"goDirectory\"" + ">");__o.push("机构目录");__o.push("</button>");__o.push("\n    ");__o.push("<button" + " class=\"btn grow\"" + " data-on-tap=\"callPhone\"" + ">");__o.push("电话咨询");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");} else if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"page\"" + ">");__o.push("<view" + " class=\"empty\"" + ">");__o.push("加载中…");__o.push("</view>");__o.push("</view>");} else {__o.push("<view" + " class=\"page\"" + ">");__o.push("<view" + " class=\"empty\"" + ">");__o.push("机构不存在或已下线");__o.push("</view>");__o.push("</view>");}__o.push("\n");}return __o.join("");};
templates["pages/admin/admin"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("平台管理");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("输入平台管理令牌后可查看入驻申请与全部订单。");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"field row gap\"" + ">");__o.push("\n      ");__o.push("<input" + " type=\"password\"" + " class=\"input grow\"" + " value=\"" + __e(__x(function () { return (token); })) + '"' + " data-on-input=\"onToken\"" + " placeholder=\"管理令牌\"" + " enterkeyhint=\"done\"" + " data-on-confirm=\"saveToken\"" + ' data-el="' + (__PATH + ".0" + ".1" + ".5" + ".1") + '"' + ">");__o.push("</input>");__o.push("\n      ");__o.push("<button" + " class=\"btn btn-sm\"" + " data-on-tap=\"saveToken\"" + ">");__o.push(__e(__x(function () { return (loading ? '校验中…' : '进入'); })));__o.push("</button>");__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");if (__x(function () { return (authed); })) {__o.push("\n    ");__o.push("<view" + " class=\"stats mt\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"stat card\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("订单总数");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"stat-value\"" + ">");__o.push(__e(__x(function () { return (stats.orders); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"stat card\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("成交金额");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"stat-value\"" + ">");__o.push("¥" + __e(__x(function () { return (stats.paid); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"stat card\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("待核销");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"stat-value\"" + ">");__o.push(__e(__x(function () { return (stats.pendingScan); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"stat card\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("待审核");__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"stat-value\"" + ">");__o.push(__e(__x(function () { return (stats.pendingApps); })));__o.push("</view>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");__o.push("<view" + " class=\"segs mt\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'apps' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"apps\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "apps" })) + '"' + ">");__o.push("入驻审核");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === 'orders' ? 'seg-on' : ''); }))) + '"' + " data-tab=\"orders\"" + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": "orders" })) + '"' + ">");__o.push("订单核销");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n\n    ");if (__x(function () { return (tab === 'apps'); })) {__o.push("\n      ");__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\n        ");{let __l0 = (apps); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"card\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<view" + " class=\"row gap-s\"" + ">");__o.push("\n              ");__o.push("<text" + " class=\"strong\"" + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</text>");__o.push("\n              ");__o.push("<text" + " class=\"tag\"" + ">");__o.push(__e(__x(function () { return (item.type); })));__o.push("</text>");__o.push("\n            ");__o.push("</view>");__o.push("\n            ");__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (item.status === 'approved' ? 'tag-ok' : 'tag-warn'); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.statusText); })));__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (item.createdAt); })) + " · " + __e(__x(function () { return (item.phone); })));__o.push("</view>");__o.push("\n          ");if (__x(function () { return (item.audienceText); })) {__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("服务人群：" + __e(__x(function () { return (item.audienceText); })));__o.push("</view>");}__o.push("\n\n          ");if (__x(function () { return (openApp === item.id); })) {__o.push("<view" + " class=\"detail mt-s\"" + ">");__o.push("\n            ");if (__x(function () { return (item.contact); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("联系人");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (item.contact); })));__o.push("</text>");__o.push("</view>");}__o.push("\n            ");if (__x(function () { return (item.audienceText); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("服务人群");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (item.audienceText); })));__o.push("</text>");__o.push("</view>");}__o.push("\n            ");if (__x(function () { return (item.school); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("学校");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (item.school); })));__o.push("</text>");__o.push("</view>");}__o.push("\n            ");if (__x(function () { return (item.education); })) {__o.push("<view" + " class=\"line-row between\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("学历");__o.push("</text>");__o.push("<text" + " class=\"small\"" + ">");__o.push(__e(__x(function () { return (item.education); })) + " " + __e(__x(function () { return (item.grade); })));__o.push("</text>");__o.push("</view>");}__o.push("\n            ");if (__x(function () { return (item.subjects); })) {__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("方向");__o.push("</text>");__o.push("<view" + " class=\"small mt-s\"" + ">");__o.push(__e(__x(function () { return (item.subjects); })));__o.push("</view>");__o.push("</view>");}__o.push("\n            ");if (__x(function () { return (item.resume); })) {__o.push("<view" + " class=\"line-row\"" + ">");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("简历");__o.push("</text>");__o.push("<view" + " class=\"small mt-s pre\"" + ">");__o.push(__e(__x(function () { return (item.resume); })));__o.push("</view>");__o.push("</view>");}__o.push("\n            ");if (__x(function () { return (item.routeName); })) {__o.push("<view" + " class=\"line-row\"" + ">");__o.push("\n              ");__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push("线路");__o.push("</text>");__o.push("\n              ");__o.push("<view" + " class=\"small mt-s\"" + ">");__o.push(__e(__x(function () { return (item.routeName); })) + "：" + __e(__x(function () { return (item.startPoint); })) + " → " + __e(__x(function () { return (item.endPoint); })));__o.push("</view>");__o.push("\n              ");if (__x(function () { return (item.stops.length); })) {__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("经停：" + __e(__x(function () { return (item.stops); })));__o.push("</view>");}__o.push("\n            ");__o.push("</view>");}__o.push("\n          ");__o.push("</view>");}__o.push("\n\n          ");__o.push("<view" + " class=\"row gap mt-s\"" + ">");__o.push("\n            ");__o.push("<button" + " class=\"btn btn-ghost btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"toggleApp\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (openApp === item.id ? '收起资料' : '查看资料'); })));__o.push("</button>");__o.push("\n            ");__o.push("<button" + " class=\"btn btn-plain btn-sm\"" + " data-phone=\"" + __e(__x(function () { return (item.phone); })) + '"' + " data-on-tap=\"callPhone\"" + ' data-ds="' + __e(JSON.stringify({ "phone": __x(function () { return (item.phone); }) })) + '"' + ">");__o.push("电话联系");__o.push("</button>");__o.push("\n            ");if (__x(function () { return (item.status === 'pending'); })) {__o.push("<button" + " class=\"btn btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"approve\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("通过审核");__o.push("</button>");}__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (!apps.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂无入驻申请");__o.push("</view>");}__o.push("\n    ");}__o.push("\n\n    ");if (__x(function () { return (tab === 'orders'); })) {__o.push("\n      ");__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\n        ");{let __l1 = (orders); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"strong grow ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"" + ("tag " + __e(__x(function () { return (item.stage === 'ok' ? 'tag-ok' : item.stage === 'warn' ? 'tag-warn' : 'tag-muted'); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.statusText); })));__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push(__e(__x(function () { return (item.number); })) + " · " + __e(__x(function () { return (item.createdAt); })));__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push("学员 " + __e(__x(function () { return (item.student); })) + " · " + __e(__x(function () { return (item.phone); })));__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"between mt-s\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.amount); })));__o.push("</text>");__o.push("\n            ");if (__x(function () { return (item.status === 'paid'); })) {__o.push("<button" + " class=\"btn btn-sm\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"complete\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("核销");__o.push("</button>");}__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n      ");if (__x(function () { return (!orders.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂无订单");__o.push("</view>");}__o.push("\n    ");}__o.push("\n  ");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/assistant/assistant"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"chat\"" + ">");__o.push("\n  ");__o.push("<scroll-view" + " class=\"thread\"" + " scroll-y" + " scroll-with-animation" + ' data-scroll-into="' + __e(__x(function () { return (scrollTo); })) + '"' + ' data-el="' + (__PATH + ".0" + ".1") + '"' + ">");__o.push("\n    ");__o.push("<view" + " class=\"thread-inner\"" + ">");__o.push("\n      ");{let __l0 = (messages); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " id=\"" + __e(__x(function () { return (item.id); })) + '"' + " class=\"" + ("row-" + __e(__x(function () { return (item.role); }))) + '"' + ">");__o.push("\n        ");if (__x(function () { return (item.role === 'bot'); })) {__o.push("<img" + " class=\"avatar\"" + " src=\"/assets/ip/mascot-front.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");}__o.push("\n        ");__o.push("<view" + " class=\"bubble-wrap\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"" + ("bubble " + __e(__x(function () { return (item.role); }))) + '"' + ">");__o.push("\n            ");if (__x(function () { return (item.typing); })) {__o.push("<text" + " class=\"typing\"" + ">");__o.push("鹭鹭正在想…");__o.push("</text>");} else {__o.push("<text" + " class=\"bubble-text\"" + ">");__o.push(__e(__x(function () { return (item.text); })));__o.push("</text>");}__o.push("\n          ");__o.push("</view>");__o.push("\n          ");if (__x(function () { return (item.courses && item.courses.length); })) {__o.push("<view" + " class=\"course-list\"" + ">");__o.push("\n            ");{let __l1 = (item.courses); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let cs = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"course-card\"" + " data-id=\"" + __e(__x(function () { return (cs.id); })) + '"' + " data-on-tap=\"onCourse\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (cs.id); }) })) + '"' + ">");__o.push("\n              ");__o.push("<text" + " class=\"course-icon\"" + ">");__o.push(__e(__x(function () { return (cs.icon); })));__o.push("</text>");__o.push("\n              ");__o.push("<view" + " class=\"course-info\"" + ">");__o.push("\n                ");__o.push("<text" + " class=\"course-title ellipsis\"" + ">");__o.push(__e(__x(function () { return (cs.title); })));__o.push("</text>");__o.push("\n                ");__o.push("<text" + " class=\"course-meta ellipsis\"" + ">");__o.push(__e(__x(function () { return (cs.merchant); })));if (__x(function () { return (cs.tag); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (cs.tag); })));__o.push("</text>");}__o.push("</text>");__o.push("\n              ");__o.push("</view>");__o.push("\n              ");__o.push("<view" + " class=\"course-side\"" + ">");__o.push("\n                ");__o.push("<text" + " class=\"course-price\"" + ">");__o.push("¥" + __e(__x(function () { return (cs.price); })));__o.push("</text>");__o.push("\n                ");__o.push("<text" + " class=\"course-unit\"" + ">");__o.push(__e(__x(function () { return (cs.unit); })));__o.push("</text>");__o.push("\n              ");__o.push("</view>");__o.push("\n            ");__o.push("</view>");}}__o.push("\n          ");__o.push("</view>");}__o.push("\n          ");if (__x(function () { return (item.route); })) {__o.push("<button" + " class=\"go\"" + " data-index=\"" + __e(__x(function () { return (index); })) + '"' + " data-on-tap=\"onRoute\"" + ' data-ds="' + __e(JSON.stringify({ "index": __x(function () { return (index); }) })) + '"' + ">");__o.push("去「" + __e(__x(function () { return (item.route.label); })) + "」→");__o.push("</button>");}__o.push("\n          ");if (__x(function () { return (item.related && item.related.length); })) {__o.push("<view" + " class=\"related\"" + ">");__o.push("\n            ");{let __l2 = (item.related); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let rel = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"rel\"" + " data-q=\"" + __e(__x(function () { return (rel.q); })) + '"' + " data-on-tap=\"onRelated\"" + ' data-ds="' + __e(JSON.stringify({ "q": __x(function () { return (rel.q); }) })) + '"' + ">");__o.push(__e(__x(function () { return (rel.q); })));__o.push("</view>");}}__o.push("\n          ");__o.push("</view>");}__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");__o.push("\n  ");__o.push("</scroll-view>");__o.push("\n\n  ");__o.push("<view" + " class=\"quick-bar\"" + ">");__o.push("\n    ");__o.push("<scroll-view" + " scroll-x" + " class=\"quick-scroll\"" + ' data-el="' + (__PATH + ".0" + ".3" + ".1") + '"' + ">");__o.push("\n      ");__o.push("<view" + " class=\"quick-row\"" + ">");__o.push("\n        ");{let __l3 = (quick); if (!__l3) __l3 = [];for (let __i3 = 0; __i3 < __l3.length; __i3++) {let item = __l3[__i3]; let index = __i3;__o.push("<view" + " class=\"chip\"" + " data-q=\"" + __e(__x(function () { return (item); })) + '"' + " data-on-tap=\"onQuick\"" + ' data-ds="' + __e(JSON.stringify({ "q": __x(function () { return (item); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item); })));__o.push("</view>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</scroll-view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"composer\"" + ">");__o.push("\n    ");__o.push("<input" + " type=\"text\"" + " class=\"composer-input\"" + " value=\"" + __e(__x(function () { return (input); })) + '"' + " placeholder=\"输入问题，比如：怎么预约课程？\"" + " enterkeyhint=\"send\"" + " maxlength=\"60\"" + " data-on-input=\"onInput\"" + " data-on-confirm=\"onSubmit\"" + ' data-el="' + (__PATH + ".0" + ".5" + ".1") + '"' + ">");__o.push("</input>");__o.push("\n    ");__o.push("<button" + " class=\"" + ("composer-send " + __e(__x(function () { return (input ? '' : 'off'); }))) + '"' + " data-on-tap=\"onSubmit\"" + (((sending) ? " disabled" : '')) + ">");__o.push("发送");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/service/service"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"head\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"head-title\"" + ">");__o.push("伴学服务");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("伴学老师与安心校车，都是双向选择：先看资料，双方合适再成单");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<img" + " class=\"head-ip\"" + " src=\"/assets/ip/mascot-rest.png\"" + " mode=\"aspectFit\"" + ">");__o.push("</img>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"segs mt\"" + ">");__o.push("\n    ");{let __l0 = (tabs); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (tab === item.id ? 'seg-on' : ''); }))) + '"' + " data-tab=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "tab": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"banner mt-s\"" + ">");__o.push(__e(__x(function () { return (tip); })));__o.push("</view>");__o.push("\n\n  ");if (__x(function () { return (loading); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("正在加载服务…");__o.push("</view>");} else if (__x(function () { return (tab === 'tutor'); })) {__o.push("\n    ");if (__x(function () { return (tutors.length); })) {__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\n      ");{let __l1 = (tutors); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"card row gap\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openDetail\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"" + ("thumb tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"strong grow ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push("/" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.description); })));__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("\n            ");if (__x(function () { return (item.slotText); })) {__o.push("<text" + ">");__o.push("🕘 " + __e(__x(function () { return (item.slotText); })));__o.push("</text>");} else {__o.push("<text" + ">");__o.push("⌖ " + __e(__x(function () { return (item.location); })));__o.push("</text>");}__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂时没有可约的伴学老师");__o.push("</view>");}__o.push("\n  ");} else {__o.push("\n    ");if (__x(function () { return (buses.length); })) {__o.push("<view" + " class=\"list mt\"" + ">");__o.push("\n      ");{let __l2 = (buses); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"card row gap\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openDetail\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\n        ");__o.push("<view" + " class=\"" + ("thumb tone-" + __e(__x(function () { return (item.tone); }))) + '"' + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</view>");__o.push("\n        ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n          ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"strong grow ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\n            ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push("/" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\n          ");__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.description); })));__o.push("</view>");__o.push("\n          ");__o.push("<view" + " class=\"muted tiny mt-s\"" + ">");__o.push("⌖ " + __e(__x(function () { return (item.location); })) + " · 余位 " + __e(__x(function () { return (item.remainingText); })));__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n      ");__o.push("</view>");}}__o.push("\n    ");__o.push("</view>");} else {__o.push("<view" + " class=\"empty\"" + ">");__o.push("暂时没有可订购的校车线路");__o.push("</view>");}__o.push("\n  ");}__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
templates["pages/transport/transport"] = function (__S, __PATH) {var __o = [];var __x = function (f) { try { return f(); } catch (err) { return undefined; } };var __e = function (v) {if (v === null || v === undefined) return "";return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");};with (__S) {__o.push("<view" + " class=\"page\"" + ">");__o.push("\n  ");__o.push("<view" + " class=\"hero card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"hero-title\"" + ">");__o.push("接送板块");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("固定线路校车 · 个人帮忙接 · 私家车顺路");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"hero-safety\"" + ">");__o.push("\n        ");{let __l0 = (safety); if (!__l0) __l0 = [];for (let __i0 = 0; __i0 < __l0.length; __i0++) {let item = __l0[__i0]; let index = __i0;__o.push("<text" + " class=\"safety-item\"" + ">");__o.push(__e(__x(function () { return (item.icon); })) + " " + __e(__x(function () { return (item.text); })));__o.push("</text>");}}__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<view" + " class=\"hero-car\"" + ">");__o.push("🚌");__o.push("</view>");__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"segs\"" + ">");__o.push("\n    ");{let __l1 = (tabs); if (!__l1) __l1 = [];for (let __i1 = 0; __i1 < __l1.length; __i1++) {let item = __l1[__i1]; let index = __i1;__o.push("<view" + " class=\"" + ("seg " + __e(__x(function () { return (active === item.id ? 'seg-on' : ''); }))) + '"' + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"onTab\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push(__e(__x(function () { return (item.name); })));__o.push("</view>");}}__o.push("\n  ");__o.push("</view>");__o.push("\n  ");if (__x(function () { return (hint); })) {__o.push("<view" + " class=\"sub-hint\"" + ">");__o.push(__e(__x(function () { return (hint); })));__o.push("</view>");}__o.push("\n\n  ");__o.push("<view" + " class=\"cards\"" + ">");__o.push("\n    ");{let __l2 = (rows); if (!__l2) __l2 = [];for (let __i2 = 0; __i2 < __l2.length; __i2++) {let item = __l2[__i2]; let index = __i2;__o.push("<view" + " class=\"card bus\"" + " data-id=\"" + __e(__x(function () { return (item.id); })) + '"' + " data-on-tap=\"openDetail\"" + ' data-ds="' + __e(JSON.stringify({ "id": __x(function () { return (item.id); }) })) + '"' + ">");__o.push("\n      ");__o.push("<view" + " class=\"between\"" + ">");__o.push("\n        ");__o.push("<view" + " class=\"row gap-s grow\"" + ">");__o.push("\n          ");__o.push("<text" + " class=\"bus-icon\"" + ">");__o.push(__e(__x(function () { return (item.icon); })));__o.push("</text>");__o.push("\n          ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n            ");__o.push("<text" + " class=\"svc-title ellipsis\"" + ">");__o.push(__e(__x(function () { return (item.title); })));__o.push("</text>");__o.push("\n            ");__o.push("<view" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.merchant); })));if (__x(function () { return (item.pickup && item.pickup.vehicle); })) {__o.push("<text" + ">");__o.push(" · " + __e(__x(function () { return (item.pickup.vehicle); })));__o.push("</text>");}__o.push("</view>");__o.push("\n          ");__o.push("</view>");__o.push("\n        ");__o.push("</view>");__o.push("\n        ");if (__x(function () { return (item.pickup && item.pickup.isCar); })) {__o.push("<text" + " class=\"tag tag-warn\"" + ">");__o.push("私家车");__o.push("</text>");} else if (__x(function () { return (item.lowSeat); })) {__o.push("<text" + " class=\"tag tag-wen\"" + ">");__o.push("仅剩 " + __e(__x(function () { return (item.remaining); })));__o.push("</text>");} else {__o.push("<text" + " class=\"tag tag-muted\"" + ">");__o.push("余位 " + __e(__x(function () { return (item.remaining); })));__o.push("</text>");}__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"bus-route\"" + ">");__o.push("\n        ");__o.push("<text" + " class=\"bus-stop\"" + ">");__o.push(__e(__x(function () { return (item.routeText); })));__o.push("</text>");__o.push("\n        ");if (__x(function () { return (item.timeText); })) {__o.push("<text" + " class=\"bus-meta\"" + ">");__o.push(__e(__x(function () { return (item.timeText); })));__o.push("</text>");}__o.push("\n        ");if (__x(function () { return (item.pickup && item.pickup.school); })) {__o.push("<text" + " class=\"bus-meta\"" + ">");__o.push("学校 " + __e(__x(function () { return (item.pickup.school); })));if (__x(function () { return (item.pickup.childGrade); })) {__o.push("<text" + ">");__o.push(" · 自家孩子 " + __e(__x(function () { return (item.pickup.childGrade); })));__o.push("</text>");}__o.push("</text>");}__o.push("\n        ");if (__x(function () { return (item.pickup && item.pickup.idChecked); })) {__o.push("<text" + " class=\"bus-meta\"" + ">");__o.push("🪪 " + __e(__x(function () { return (item.pickup.credit || '已实名核验'); })));__o.push("</text>");}__o.push("\n      ");__o.push("</view>");__o.push("\n\n      ");__o.push("<view" + " class=\"between bus-foot\"" + ">");__o.push("\n        ");if (__x(function () { return (item.pickup); })) {__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.pickup.area); })) + " · " + __e(__x(function () { return (item.pickup.seatText); })));__o.push("</text>");} else {__o.push("<text" + " class=\"muted tiny\"" + ">");__o.push(__e(__x(function () { return (item.location); })));__o.push("</text>");}__o.push("\n        ");__o.push("<text" + " class=\"price-small\"" + ">");__o.push("¥" + __e(__x(function () { return (item.priceText); })));__o.push("<text" + " class=\"tiny muted\"" + ">");__o.push(" /" + __e(__x(function () { return (item.unit); })));__o.push("</text>");__o.push("</text>");__o.push("\n      ");__o.push("</view>");__o.push("\n    ");__o.push("</view>");}}__o.push("\n    ");if (__x(function () { return (!rows.length); })) {__o.push("<view" + " class=\"empty\"" + ">");__o.push("这个分类暂时还没有服务");__o.push("</view>");}__o.push("\n  ");__o.push("</view>");__o.push("\n\n  ");__o.push("<view" + " class=\"join-cta card\"" + ">");__o.push("\n    ");__o.push("<view" + " class=\"grow\"" + ">");__o.push("\n      ");__o.push("<view" + " class=\"strong\"" + ">");__o.push("开私家车接送自家孩子？");__o.push("</view>");__o.push("\n      ");__o.push("<view" + " class=\"muted small\"" + ">");__o.push("顺路带同校孩子一程，补贴油费，也让同小区家长更省心。入驻须通过实名核验并承诺安全准则。");__o.push("</view>");__o.push("\n    ");__o.push("</view>");__o.push("\n    ");__o.push("<button" + " class=\"btn btn-sm\"" + " data-on-tap=\"goJoin\"" + ">");__o.push("车主入驻");__o.push("</button>");__o.push("\n  ");__o.push("</view>");__o.push("\n");__o.push("</view>");__o.push("\n");}return __o.join("");};
module.exports = { templates: templates, pages: ["pages/index/index","pages/learning/learning","pages/orders/orders","pages/mine/mine","pages/login/login","pages/detail/detail","pages/booking/booking","pages/learning-detail/learning-detail","pages/gaokao/gaokao","pages/gaokao-schools/gaokao-schools","pages/gaokao-detail/gaokao-detail","pages/exam/exam","pages/exam-detail/exam-detail","pages/institution/institution","pages/join/join","pages/companion/companion","pages/feedback/feedback","pages/help/help","pages/institutions/institutions","pages/merchant/merchant","pages/admin/admin","pages/assistant/assistant","pages/service/service","pages/transport/transport"], window: {"navigationBarBackgroundColor":"#b8500f","navigationBarTitleText":"学鹭伴学","navigationBarTextStyle":"white","backgroundColor":"#fdf8f2","enablePullDownRefresh":false}, tabBar: {"color":"#a28773","selectedColor":"#b8500f","backgroundColor":"#ffffff","borderStyle":"white","list":[{"pagePath":"pages/index/index","text":"首页"},{"pagePath":"pages/learning/learning","text":"学习"},{"pagePath":"pages/orders/orders","text":"订单"},{"pagePath":"pages/mine/mine","text":"我的"}]}, pageMeta: {"pages/index/index":{"navigationBarTitleText":"学鹭伴学","enablePullDownRefresh":false},"pages/learning/learning":{"navigationBarTitleText":"学习资源","enablePullDownRefresh":true,"backgroundTextStyle":"dark"},"pages/orders/orders":{"navigationBarTitleText":"我的订单"},"pages/mine/mine":{"navigationBarTitleText":"我的"},"pages/login/login":{"navigationBarTitleText":"登录 / 注册"},"pages/detail/detail":{"navigationBarTitleText":"服务详情"},"pages/booking/booking":{"navigationBarTitleText":"报名"},"pages/learning-detail/learning-detail":{"navigationBarTitleText":"课程详情"},"pages/gaokao/gaokao":{"navigationBarTitleText":"升学规划","enablePullDownRefresh":false},"pages/gaokao-schools/gaokao-schools":{"navigationBarTitleText":"院校参考","enablePullDownRefresh":false},"pages/gaokao-detail/gaokao-detail":{"navigationBarTitleText":"院校详情"},"pages/exam/exam":{"navigationBarTitleText":"考公考研考编"},"pages/exam-detail/exam-detail":{"navigationBarTitleText":"岗位详情"},"pages/institution/institution":{"navigationBarTitleText":"机构工作台"},"pages/join/join":{"navigationBarTitleText":"我要入驻"},"pages/companion/companion":{"navigationBarTitleText":"伴学详情"},"pages/feedback/feedback":{"navigationBarTitleText":"意见反馈"},"pages/help/help":{"navigationBarTitleText":"帮助中心"},"pages/institutions/institutions":{"navigationBarTitleText":"机构目录","enablePullDownRefresh":true,"backgroundTextStyle":"dark"},"pages/merchant/merchant":{"navigationBarTitleText":"机构主页"},"pages/admin/admin":{"navigationBarTitleText":"平台管理"},"pages/assistant/assistant":{"navigationBarTitleText":"学鹭助手","navigationBarBackgroundColor":"#b8500f","navigationBarTextStyle":"white","backgroundColor":"#fdf8f2","usingComponents":{}},"pages/service/service":{"navigationBarTitleText":"伴学服务","navigationBarBackgroundColor":"#b8500f","navigationBarTextStyle":"white","backgroundColor":"#fdf8f2","enablePullDownRefresh":true,"usingComponents":{}},"pages/transport/transport":{"navigationBarTitleText":"接送"}} };
};
__require("src/runtime/boot.js");
})();