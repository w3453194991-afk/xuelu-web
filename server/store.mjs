/* ------------------------------------------------------------------ *
 * 服务端存储垫片
 *
 * 小程序的业务层（utils/mock.js）只通过 wx.getStorageSync / wx.setStorageSync
 * 读写数据。这里用「一个 JSON 文件 + 内存缓存」实现同样的接口，
 * 于是那套已经写好的校验、状态机、并发名额逻辑可以原样跑在服务器上，
 * 数据也就真正存到了服务端，而不是各人浏览器里。
 *
 * 写入是原子的：先写临时文件再 rename，断电不会留下半个 JSON。
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';

export function createStore(file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  /* key -> JSON 字符串，模拟 localStorage 的语义（读出来还原原始类型） */
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    data = {};
  }

  let writes = 0;

  function persist() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    writes++;
  }

  const wxShim = {
    getStorageSync(key) {
      if (!(key in data)) return '';
      try {
        return JSON.parse(data[key]);
      } catch (err) {
        return '';
      }
    },

    setStorageSync(key, value) {
      data[key] = JSON.stringify(value);
      persist();
    },

    removeStorageSync(key) {
      if (!(key in data)) return;
      delete data[key];
      persist();
    }
  };

  return {
    wx: wxShim,
    file,
    get writes() { return writes; },
    /* 供 /api/health 展示的体量信息 */
    stats() {
      let bytes = 0;
      try { bytes = fs.statSync(file).size; } catch (err) { bytes = 0; }
      return { bytes };
    },
    reset() {
      data = {};
      persist();
    }
  };
}
