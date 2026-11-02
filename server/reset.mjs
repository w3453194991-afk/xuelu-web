/* 清空服务端数据（回到初始种子数据）

   node server/reset.mjs

   环境变量 XUELU_DATA 可指定其它数据文件。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.XUELU_DATA || path.join(here, 'data', 'store.json');

if (fs.existsSync(file)) {
  fs.rmSync(file);
  console.log('已清空：' + file + '（下次启动会重新写入种子数据）');
} else {
  console.log('数据文件不存在：' + file);
}
