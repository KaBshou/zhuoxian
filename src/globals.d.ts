/// <reference types="vite/client" />

// D216：构建期由 vite.config.ts 的 define 注入（来源是 package.json 的 version）。
// 用 `declare const` 而不是放进 window，是为了让「未注入」在编译期就可见；
// 运行时仍有兜底（见 src/data/version.ts），纯 Node 环境（单测）里不会 ReferenceError。
declare const __APP_VERSION__: string;
