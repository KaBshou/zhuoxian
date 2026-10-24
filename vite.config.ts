import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// D216：版本号只有一个出处 —— package.json。
// 之前页面上没有任何版本号，玩家报「我卡在第 3 层」时没法判断他玩的是哪一版。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version?: string;
};
const APP_VERSION = typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0-dev';

export default defineConfig({
  // 关键：必须用 './'，不能用 '/'。
  // 因为将来要发到 GitHub Pages / Cloudflare Pages 的子路径下（例如 /zhuoxian/），
  // 用 '/' 的话所有资源都会去根目录找，部署后白屏。现在写死，省得以后返工。
  base: './',
  define: {
    // 源码里通过 src/data/version.ts 的 APP_VERSION 读它（带兜底，测试里也不会炸）
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    host: '127.0.0.1',
    port: 5274,
    open: true,
    watch: {
      // 忽略各种「临时文件」。为什么要写这一行：
      // 编辑器（VS Code、以及我的自动改文件工具）保存文件时，不是直接覆盖，
      // 而是先写一个临时文件再改名。Vite 的文件监听器会去监听那个临时文件，
      // 而临时文件转瞬就被删了，Windows 上这时会报
      //   EBUSY: resource busy or locked, watch '...tmpdir\xxx.tmp'
      // 然后整个 dev server 直接崩掉，浏览器白屏。
      // 这个坑在 Windows + Vite 上很常见，写死这行就不会再遇到。
      ignored: ['**/*.tmpdir/**', '**/*.tmp', '**/.git/**'],
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
