/**
 * D216 版本号：全项目唯一出处是 `package.json` 的 `version`。
 *
 * 链路：`package.json` → `vite.config.ts` 的 `define.__APP_VERSION__` → 这里。
 * 为什么不在源码里写死字符串：本项目已经因为「文档/代码各写一份数字」
 * 吃过好几次亏（D128 判据基数、D208 rowsPerCol、D157 的 30%），版本号是同一类。
 *
 * 为什么要有兜底：`__APP_VERSION__` 只在 Vite 构建/测试的转换阶段被替换；
 * 如果有人用 `tsx`/`esbuild` 直接跑某个模块，这个标识符就不存在。
 * 用 `typeof` 挡一层，宁可显示 `0.0.0-dev` 也不要在启动时抛 ReferenceError。
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0 ? __APP_VERSION__ : '0.0.0-dev';

/** 页面角落的短标：`浊仙 v1.0.0` */
export const APP_TITLE = `浊仙 v${APP_VERSION}`;
