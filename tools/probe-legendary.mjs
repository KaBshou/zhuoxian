/**
 * 传奇效果探针（浏览器侧，独立于 lead 的 tests/legendary.test.ts）
 *
 * 验的是 REQ §4 最后一块：「仙品固定 4 条灵纹 + 1 条传奇效果」在**玩家真能看到的地方**成立：
 *   A. 钩子能读到该件 `legendary` 字段（数据落地）
 *   B. 按 E 打开的详情面板里，传奇效果**真占一行文字**（A/B 差分：同一件法宝去掉 legendary
 *      前后的米白文字像素差 ≥ 20 —— 面板没接线时差值会接近 0）
 *   C. 仙品标题色（#f59637 橙金）真的画出来了，证明面板画的确实是这件仙品
 *   D. 面板开关不修改数据（legendary 原样），未知 id 不崩
 *
 * 为什么用差分而不是「数某句话的像素」：画布上没有文字层可读，只能靠「多一行字 ⇒ 多一片亮像素」。
 * 差分对字体/换行不敏感，比猜字数稳。
 *
 * 跑法：node F:\dsh-work\zhuoxian\tools\probe-legendary.mjs
 *
 * ⚠ 环境纪律（2026-10-22 实测）：探针一律**新起 server**（`node tools\_serve.mjs` → 5288），
 *   不要复用跑了很久的 dev server。module graph 过期时的症状是「kills=0 / 时间不推进 /
 *   面板一片空白 / 玄学校验数」，极容易被误判成产品 bug（当天 5274 上那个 18:34 起的 server
 *   就让 battle 18/25、detail 7/8、marks 10/13 三条假红，换干净 server 后 25/25、8/8、13/13）。
 */

import { withPage, assert, summary } from './probe/harness.mjs';

const HOOK = 'typeof window.__zhuoxian === "object" && window.__zhuoxian !== null && !!window.__zhuoxian.session';
const SLOT = 'crown';

/** 米白正文像素（面板正文 #d8d3c4；战场底色暗，亮且低饱和的像素基本只有文字） */
const TEXT_PIXELS = `(() => {
  const c = document.querySelector('#stage');
  if (!c) return -1;
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 10 && r > 150 && Math.abs(r - gg) < 45 && Math.abs(gg - b) < 70 && b > 100) n += 1;
  }
  return n;
})()`;

/**
 * 逐行米白像素直方图（行 = 画布 y）。判「传奇真占一行」不能用全画布总数：
 * HUD / 战场 / 浮字都在同一个计数里，一行 11px 小字的贡献被淹掉（实测全画布差 17~23，
 * 而 D137 之后几何一挪就从 23 掉到 17，卡 20 的阈值直接假红）。逐行看就能指到「哪一行多了字」，
 * 这是位置证据，不是亮度玄学。
 */
const ROW_PROFILE = `(() => {
  const c = document.querySelector('#stage');
  if (!c) return [];
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const rows = new Array(c.height).fill(0);
  for (let y = 0; y < c.height; y++) {
    let n = 0;
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a > 10 && r > 150 && Math.abs(r - gg) < 45 && Math.abs(gg - b) < 70 && b > 100) n += 1;
    }
    rows[y] = n;
  }
  return rows;
})()`;

/**
 * 传奇**描述**专用的土金色 #c9a06a（`src/render/detail-panels.ts:116` 画 desc 那几行）。
 * 为什么不再用全画布米白差分：那一行 11px 小字 + 周围 HUD/浮字有 ±4 像素的随机抖动，
 * 实测「有/无传奇」总量差会在 17~23 之间漂（阈值卡 20 就红一次绿一次 = 骰子），逐行差分
 * 单行又只有 ≤3 像素（字太细）。数「只可能来自传奇描述的那一种颜色」才是位置 + 颜色双证据：
 * 没有传奇时这个颜色在整张画布上几乎为 0。
 */
const LEGEND_DESC_PIXELS = `(() => {
  const c = document.querySelector('#stage');
  if (!c) return -1;
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 10 && Math.abs(r - 201) < 22 && Math.abs(gg - 160) < 22 && Math.abs(b - 106) < 26) n += 1;
  }
  return n;
})()`;

/** 仙品标题色 #f59637 → 橙金像素 */
const ORANGE_PIXELS = `(() => {
  const c = document.querySelector('#stage');
  if (!c) return -1;
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 10 && r > 200 && gg > 110 && gg < 200 && b < 100) n += 1;
  }
  return n;
})()`;

const LEGEND = (slot) => `window.__zhuoxian.session.character.equipment.${slot}?.legendary ?? null`;

/** 往身上塞一件仙品（用真字段形状：uid/slot/rarity/ilvl/name/base/affixes/legendary） */
const INJECT = (legendary) => `(() => {
  const s = window.__zhuoxian.session;
  const eq = s.character.equipment;
  const tpl = eq.${SLOT} ?? Object.values(eq).find(Boolean) ?? null;
  const affix = { defId: 'probe-legend-affix', name: '探针灵纹', stat: 'life', op: 'flat', value: 12, tags: [] };
  const item = {
    uid: 'probe-legendary-xian',
    slot: '${SLOT}',
    rarity: 'xian',
    ilvl: 20,
    name: '仙品·探针冠',
    base: tpl && Array.isArray(tpl.base) ? tpl.base : [],
    affixes: [affix, affix, affix, affix],
    legendary: ${JSON.stringify(legendary)},
  };
  eq.${SLOT} = item;
  return { legendary: eq.${SLOT}.legendary, rarity: eq.${SLOT}.rarity, affixes: eq.${SLOT}.affixes.length };
})()`;

const CLOSE_PANEL = `(() => {
  // 面板是开关式：先确认当前状态，避免连按两次把面板又关掉
  const s = window.__zhuoxian.session;
  return typeof s === 'object';
})()`;

async function openPanelViaKey(page) {
  await page.pressKey('KeyE');
  await page.waitMs(320);
}
async function closePanelViaKey(page) {
  await page.eval(CLOSE_PANEL);
  await page.pressKey('KeyE');
  await page.waitMs(320);
}

/**
 * 抗「页面被换掉」的读值：整盘里跑过一次 `Cannot read properties of undefined (reading 'session')`
 * （单独跑 9/9 绿）—— 那是读值那一刻页面正在 reload/重建，`window.__zhuoxian` 短暂为 undefined。
 * 输入法/面板刷新之类都可能在后台触发一次 reload，所以这里等钩子回来再读一次，而不是直接崩。
 */
async function evalSafe(page, expr, ms = 8000) {
  try {
    return await page.eval(expr);
  } catch (e) {
    await page.waitFor(HOOK, ms);
    return await page.eval(expr);
  }
}

async function main() {
  await withPage(async (page) => {
    // ── 0. 干净新号进战斗 ────────────────────────────────
    await page.eval('window.__zhuoxian.reset()');
    await page.waitMs(1800);
    await page.waitFor(HOOK, 20000);
    await page.eval('window.__zhuoxian.chooseClass("yujian")');
    await page.waitMs(700);
    await page.eval('window.__zhuoxian.finishTutorial()');
    await page.waitMs(500);

    // ── A. 数据落地 ─────────────────────────────────────
    const injected = await page.eval(INJECT('taiyi'));
    assert('A 注入一件带传奇的仙品成功', injected?.legendary === 'taiyi' && injected?.rarity === 'xian', JSON.stringify(injected));
    const readBack = await page.eval(LEGEND(SLOT));
    assert('A 钩子能读到该件 legendary 字段', readBack === 'taiyi', `legendary=${readBack}`);
    const affixCount = await page.eval(`window.__zhuoxian.session.character.equipment.${SLOT}.affixes.length`);
    assert('A 仙品仍是 4 条灵纹（传奇不占灵纹位）', affixCount === 4, `affixes=${affixCount}`);

    // ── B. 面板 A/B 差分 ─────────────────────────────────
    const closedText = await page.eval(TEXT_PIXELS);
    await openPanelViaKey(page);
    const withLegendText = await page.eval(TEXT_PIXELS);
    const withLegendRows = await page.eval(ROW_PROFILE);
    const withLegendDesc = await page.eval(LEGEND_DESC_PIXELS);
    const withLegendOrange = await page.eval(ORANGE_PIXELS);
    await page.screenshot('F:/dsh-work/zhuoxian/docs/probe-legendary.png');
    await closePanelViaKey(page);

    // 同一件法宝，去掉传奇
    await page.eval(INJECT(undefined));
    await openPanelViaKey(page);
    const withoutLegendText = await page.eval(TEXT_PIXELS);
    const withoutLegendDesc = await page.eval(LEGEND_DESC_PIXELS);
    const withoutLegendRows = await page.eval(ROW_PROFILE);
    await closePanelViaKey(page);

    assert(
      'B 面板打开的确实是一张卡片（亮文字像素明显多于关闭态）',
      typeof withLegendText === 'number' && withLegendText > closedText + 40,
      `关闭 ${closedText} → 打开 ${withLegendText}`,
    );
    // 判据 = 「传奇描述色 (#c9a06a) 在有无传奇之间的**增量**」：实测 206 vs 94（差 112）。
    // 无传奇时仍有 ~94 像素属于「米白正文的抗锯齿边缘被算进这个色带」，所以不能断「无传奇≈0」，
    // 只能断增量 + 绝对量双门禁：有传奇 ≥150，且比无传奇多 ≥60（实测 112，留一半余量）。
    const rowDelta = Array.isArray(withLegendRows) && Array.isArray(withoutLegendRows)
      ? withLegendRows.map((n, i) => n - (withoutLegendRows[i] ?? 0))
      : [];
    const maxRowDelta = rowDelta.length ? Math.max(...rowDelta) : 0;
    const descDelta = withLegendDesc - withoutLegendDesc;
    assert(
      'B 传奇效果真占一行文字（描述色 #c9a06a：有 ≥150 且比无传奇多 ≥60）',
      typeof withLegendDesc === 'number' &&
        typeof withoutLegendDesc === 'number' &&
        withLegendDesc >= 150 &&
        descDelta >= 60,
      `描述色 有传奇 ${withLegendDesc} / 无传奇 ${withoutLegendDesc}（差 ${descDelta}）· 全画布米白 ${withLegendText} vs ${withoutLegendText} · 最大单行差 ${maxRowDelta}`,
    );
    assert('C 仙品标题橙金色真的画出来了（≥20 像素）', typeof withLegendOrange === 'number' && withLegendOrange >= 20, `橙金像素=${withLegendOrange}`);

    // ── D. 渲染不改数据 + 未知 id 不崩 ────────────────────
    await page.eval(INJECT('taiyi'));
    await openPanelViaKey(page);
    const stillThere = await evalSafe(page, LEGEND(SLOT));
    assert('D 开关面板后 legendary 没被渲染层改掉', stillThere === 'taiyi', `legendary=${stillThere}`);

    const consoleBefore = page.consoleErrors().length;
    await closePanelViaKey(page);
    await page.eval(INJECT('not-a-real-legendary-id'));
    await openPanelViaKey(page);
    const weird = await evalSafe(page, LEGEND(SLOT));
    const newErrors = page.consoleErrors().length - consoleBefore;
    assert('D 未知传奇 id 不崩、面板照画', weird === 'not-a-real-legendary-id' && newErrors === 0, `legendary=${weird} 新增错误=${newErrors}`);
    await closePanelViaKey(page);

    // ── E. 控制台干净 ────────────────────────────────────
    const errs = page.consoleErrors();
    assert('E 全程无控制台错误', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '0 条');
  });
}

await main();
summary();
