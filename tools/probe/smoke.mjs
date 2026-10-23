/**
 * harness 冒烟测试 —— 只验证「探针基建本身能用」，不测游戏玩法。
 *
 * 验收点（每条都是真跑出来的）：
 *   1. vite dev server + Chrome CDP 能起来/复用
 *   2. 页面真的加载了（title / readyState / #stage canvas / 尺寸）
 *   3. 控制台错误收集器工作且 favicon 噪音被过滤
 *   4. pressKey / releaseKey 真的把原生键盘事件送到了页面
 *   5. screenshot 真的写出了非空 PNG
 *
 * 跑法：node F:\dsh-work\zhuoxian\tools\probe\smoke.mjs
 * 产物：F:\dsh-work\zhuoxian\tools\probe\smoke.png
 */

import { statSync } from 'node:fs';

import { withPage, assert, summary } from './harness.mjs';

const SHOT = 'F:\\dsh-work\\zhuoxian\\tools\\probe\\smoke.png';

async function main() {
  await withPage(async (page) => {
    // ── 1. 页面加载 ────────────────────────────────────────
    const title = await page.eval('document.title');
    assert('页面标题能读到', typeof title === 'string' && title.length > 0, `title=${JSON.stringify(title)}`);
    assert('标题是《浊仙》（语义片段）', typeof title === 'string' && title.includes('浊仙'), `实测 ${JSON.stringify(title)}`);

    const readyState = await page.eval('document.readyState');
    assert('文档加载完成', readyState === 'complete', `readyState=${readyState}`);

    // ── 2. canvas 与尺寸 ──────────────────────────────────
    const hasStage = await page.eval('document.querySelector("#stage") !== null');
    assert('canvas#stage 存在', hasStage === true, `hasStage=${hasStage}`);

    const size = await page.eval(
      '(() => { const c = document.querySelector("#stage"); if (!c) return null; const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, rectW: r.width, rectH: r.height }; })()',
    );
    assert('canvas 逻辑分辨率 960x540', size !== null && size.w === 960 && size.h === 540, `实测 ${JSON.stringify(size)}`);
    // 截图前先确认目标不是 0×0（否则截出一张空图也「成功」）
    assert(
      'canvas 渲染尺寸可见（非 0×0）',
      size !== null && size.rectW > 0 && size.rectH > 0,
      `getBoundingClientRect=${size === null ? 'null' : `${size.rectW}x${size.rectH}`}`,
    );

    // ── 2b. 选道统 → 进战斗（探针前导：新号默认停在 select 阶段） ──
    // 2026-10-22 起 main.ts 新增 Phase: 'select' | 'play'，新号必须先选道统，
    // 否则 `if (phase !== 'play') return;` 会跳过 tickSession —— 画面冻结、时间不推进。
    // 所有玩法探针都必须先走这一步，这里把它固化进冒烟，防止后续探针再踩。
    const hookOk = await page.eval('typeof window.__zhuoxian === "object" && window.__zhuoxian !== null');
    assert('开发钩子 window.__zhuoxian 存在', hookOk === true, `实测 ${hookOk}`);
    const phase0 = await page.eval('window.__zhuoxian?.phase ?? null');
    assert('新号停在「选道统」阶段', phase0 === 'select', `phase=${phase0}`);
    const chosen = await page.eval('window.__zhuoxian.chooseClass("yujian")');
    assert('chooseClass 能确认道统', chosen === true, `返回 ${chosen}`);
    await page.waitMs(700);
    const phase1 = await page.eval('window.__zhuoxian?.phase ?? null');
    assert('确认后进入战斗阶段', phase1 === 'play', `phase=${phase1}`);
    const mons = await page.eval(
      '(() => { const b = window.__zhuoxian?.session?.battle; return b ? b.monsters.length : -1; })()',
    );
    assert('进战斗后第一波怪已刷出', typeof mons === 'number' && mons > 0, `monsters=${mons}`);

    // ── 3. 键盘事件真的进了页面 ───────────────────────────
    // 先装一个监听器当「观测口」：Input.dispatchKeyEvent 如果没送到页面，这里就抓不到。
    await page.eval(
      '(() => { window.__smokeKeys = []; window.addEventListener("keydown", (e) => window.__smokeKeys.push("down:" + e.code)); window.addEventListener("keyup", (e) => window.__smokeKeys.push("up:" + e.code)); return true; })()',
    );

    await page.pressKey('KeyD');
    await page.waitMs(150);
    await page.releaseKey('KeyD');
    await page.waitMs(150);

    const keys = await page.eval('window.__smokeKeys.join(",")');
    assert('pressKey 送达页面原生 keydown', typeof keys === 'string' && keys.includes('down:KeyD'), `实测 [${keys}]`);
    assert('releaseKey 送达页面原生 keyup', typeof keys === 'string' && keys.includes('up:KeyD'), `实测 [${keys}]`);

    // ── 4. 控制台错误（favicon 已过滤） ────────────────────
    const errors = page.consoleErrors();
    assert('无控制台错误（favicon 噪音已过滤）', errors.length === 0, errors.length === 0 ? '干净' : errors.join(' | '));

    // ── 5. 截图 ───────────────────────────────────────────
    await page.screenshot(SHOT);
    let bytes = 0;
    try {
      bytes = statSync(SHOT).size;
    } catch {
      bytes = 0;
    }
    assert('截图文件已写出且非空', bytes > 1000, `${SHOT} = ${bytes} bytes`);
  });

  summary();
}

try {
  await main();
} catch (err) {
  console.error(`smoke 崩了：${err?.message ?? err}`);
  process.exitCode = 1;
  // 即使环境没起来也要给一个汇总（0/0 会被 summary 判为失败，这正是我们想要的）
  summary();
}
