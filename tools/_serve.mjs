// 临时：起一个干净 dev server（open:false，不弹浏览器）给探针复用。
// 探针默认打 5274，但 5274 上可能挂着旧 server（stale 变换缓存）；argv[2] 可指定端口。
//
// ⚠ 2026-10-23 发现（探针假红的真凶之一）：**文件监听必须关掉**。
// 探针/批量脚本会在项目根目录下写日志与截图（`tools\_plate-*.txt`、`docs\probe-*.png`），
// 只要 watcher 开着，写文件就会触发 Vite 的 full-reload，页面里的 `battle.time` 归零、
// kills 归零 —— 表现为 probe-battle「时间倒流 t0=1.12 t1=0.15」这种诡异假红。
// 关掉 watch 后同一批探针全部稳定复现通过。
import { createServer } from 'vite';

const port = Number(process.argv[2] ?? 5288);
const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  logLevel: 'error',
  server: { port, strictPort: true, open: false, host: '127.0.0.1', watch: null },
});
await server.listen();
console.log(`READY http://127.0.0.1:${port}/`);
setInterval(() => {}, 1 << 30);
