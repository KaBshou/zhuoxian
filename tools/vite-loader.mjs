/**
 * tools/ 下的 .mjs 脚本如何加载 src/*.ts。
 *
 * 直接 `import '../src/core/session.ts'` 会 **ERR_MODULE_NOT_FOUND**：
 * src 内部用的是无扩展名相对导入（`from './battle'`），Node 的 ESM 解析器不认，
 * 而 vite/vitest 自己带解析器所以能跑。
 *
 * 这里用 vite 的 ssrLoadModule 加载：解析规则和 dev/build 完全一致。
 * 必须 middlewareMode + 关闭 watcher/hmr，否则会和 dev server 抢文件锁（EBUSY）。
 *
 * 用法：
 *   import { openSrc } from './vite-loader.mjs';
 *   const src = await openSrc();
 *   const { createSession } = await src.load('/src/core/session.ts');
 *   ...
 *   await src.close();
 */

import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export async function openSrc() {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, hmr: false, open: false },
  });
  return {
    server,
    load: (modulePath) => server.ssrLoadModule(modulePath),
    close: () => server.close(),
  };
}
