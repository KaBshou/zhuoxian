/**
 * 帮助面板（D190）：一屏说明「怎么操作 + 七个名词各是什么」。
 *
 * 为什么需要它：游戏到 v1 已有 11 个面板、14 个键位、七个自成体系的名词
 * （浊气 / 渊痕 / 周目 / 图鉴 / 成就 / 碎片 / 玉简）。新手引导只讲前十秒，
 * 而《浊仙》不是「看一眼就会」的游戏 —— 没有一页可查的说明，
 * 玩家第二天回来只记得「有个刷层的游戏」，不知道该干什么。
 *
 * 两条设计约束：
 * 1. **纯文本**，不引入新的状态与存档字段（帮助不该有进度）；
 * 2. **只读**：不暂停战斗、不锁输入，随时能关（挂机游戏里暂停 = 损失）。
 */
import { MAX_FLOOR } from '../data/monsters';
import { TOTAL_STEPS } from '../core/progression';

const C = {
  shadow: 'rgba(5,7,11,0.72)',
  panel: 'rgba(11,10,12,0.94)',
  edge: 'rgba(140,165,200,0.22)',
  // 左缘金条用 0.85 不透明度：0.45 叠在近黑底上合成约 (96,73,28)，
  // 探针的「金色」判据（r>120）数不到 —— 结构像素要够亮才当得了探针的锚点。
  gold: 'rgba(212,161,60,0.85)',
  title: '#d8d3c4',
  body: '#b9b3a4',
  dim: '#8a8272',
  key: '#e8c878',
};

export const HELP_PANEL_W = 720;
const PAD = 20;
const TITLE_H = 30;
const ROW_H = 17;
const SECTION_GAP = 8;

export interface HelpSection {
  readonly title: string;
  readonly rows: readonly string[];
}

/**
 * 帮助正文（纯数据，测试直接断它）。
 *
 * 每一条都是「一句人话 + 具体按键/数字」，不写形容词 ——
 * 玩家要的是「我能干什么」，不是「本作特色」。
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    title: '你现在在干什么',
    rows: [
      '自动打怪、自动换装、自动加点、自动打造。你只需要决定「去哪儿刷」。',
      `越往下越深：共 ${MAX_FLOOR} 层，每层 10 波，第 10 波是镇守。`,
      `境界共 ${TOTAL_STEPS} 重（九境 × 九重）。满级后按 N 入轮回：浊物更凶、渊痕更厚。`,
    ],
  },
  {
    title: '七个名词（各一句话）',
    rows: [
      '浊气：打得越多越涨，涨满会浊化爆发（伤害翻倍，之后虚弱）。越强越脏。',
      '渊痕：满级之后才产出的货币，只换方便，不换战力上限（有界强化）。',
      '周目：入轮回后一切重来，但浊物气血 ×1.35^周目、渊痕 ×1（最多 ×4）。',
      '图鉴：遭遇过的浊物、拿过的传奇各占一格，纯记录，不给数值。',
      '成就：达成即发渊痕，一次性，共 27 条。',
      '碎片：镇守必掉，金/火/水各一种，定向抬同类灵纹，一次耗 1 颗。',
      '玉简：辅助玉简装到神通上，最多 4 条，改动随时可撤销（R 恢复自动）。',
    ],
  },
  {
    title: '键位（全部）',
    rows: [
      'E 法宝详情　·　D 损伤详解　·　T 周天图　·　G 神通与玉简',
      'K 图鉴　·　J 成就　·　M 渊痕价目　·　B 背包　·　P 秘境图　·　S 存档',
      '方向键 回刷层 / 面板内选格　·　空格 面板内主操作（穿上 / 跳层 / 换玉简）',
      '1 / 2 / 3 花渊痕　·　F 切定向碎片　·　L 锁层挂机　·　N 入轮回',
      'V 静音　·　[ ] 音量　·　H 或 ? 打开本页　·　Esc 关闭任何面板',
    ],
  },
  {
    title: '三件容易误解的事',
    rows: [
      '东西不是「掉了就进背包」：更强的会自动穿上，换下来的回背包（B 里能看到全部 40 格）。',
      '法宝的「战力比」是相对同灵蕴宝品中位，「换装对比」是和你身上那件的差值 —— 两个数回答两个问题。',
      '死亡不清层：本层回到第 1 波、掉 10% 当前修为；连死 3 次会退 1 层（不会一直卡死）。',
    ],
  },
];

/** 页脚文案（导出给测试：这句话是设计约束，不是装饰）。 */
export const HELP_FOOTER = '游戏不会暂停　·　H / ? / Esc 关闭';

/** 面板高度：标题 + 各节（标题行 + 内容行）+ 节间距 + 页脚。 */
export function helpPanelHeight(): number {
  let h = TITLE_H + PAD;
  for (const sec of HELP_SECTIONS) {
    h += ROW_H; // 节标题
    h += sec.rows.length * ROW_H;
    h += SECTION_GAP;
  }
  h += 26; // 页脚
  return h + PAD;
}

export function helpPanelGeometry(
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const w = HELP_PANEL_W;
  const h = helpPanelHeight();
  return { x: Math.round((canvasW - w) / 2), y: Math.round((canvasH - h) / 2), w, h };
}

/** 画帮助面板。返回几何（探针靠左缘金条判它画出来了）。 */
export function drawHelpPanel(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const geo = helpPanelGeometry(canvasW, canvasH);

  ctx.fillStyle = C.shadow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = C.panel;
  ctx.fillRect(geo.x, geo.y, geo.w, geo.h);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(geo.x + 0.5, geo.y + 0.5, geo.w - 1, geo.h - 1);
  // 左缘金条：结构像素，探针据此判断「面板真的画出来了」（D188）
  ctx.fillStyle = C.gold;
  ctx.fillRect(geo.x, geo.y, 3, geo.h);

  let y = geo.y + PAD + 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = C.title;
  ctx.fillText('怎么玩', geo.x + PAD + 6, y);

  y += TITLE_H - 14 + 10;
  for (const sec of HELP_SECTIONS) {
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = C.key;
    ctx.fillText(sec.title, geo.x + PAD + 6, y);
    y += ROW_H;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = C.body;
    for (const row of sec.rows) {
      ctx.fillText(row, geo.x + PAD + 6, y);
      y += ROW_H;
    }
    y += SECTION_GAP;
  }

  ctx.font = '11px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(HELP_FOOTER, geo.x + PAD + 6, geo.y + geo.h - 10);

  return geo;
}

/**
 * 底部「?」按钮的矩形。**单独放在页脚右侧**，不挤进顶部按钮条 ——
 * 顶部按钮条已经 11 个（`BTN_MIN_X` 约束下放不下第 12 个），
 * 硬塞会把左列法宝面板压掉（D187 刚修过）。
 */
export function helpButtonRect(
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const w = 26;
  const h = 20;
  return { x: canvasW - 14 - w, y: canvasH - 34 - h, w, h };
}

export function hitTestHelpButton(px: number, py: number, canvasW: number, canvasH: number): boolean {
  const r = helpButtonRect(canvasW, canvasH);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function drawHelpButton(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  active: boolean,
): void {
  const r = helpButtonRect(canvasW, canvasH);
  ctx.fillStyle = active ? 'rgba(212,161,60,0.22)' : 'rgba(11,10,12,0.82)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = active ? 'rgba(212,161,60,0.95)' : 'rgba(140,165,200,0.28)';
  ctx.lineWidth = active ? 2 : 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = active ? C.key : '#b9b3a4';
  ctx.fillText('?', r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** 给测试用：正文里是否提到了某段文字。 */
export function helpMentions(text: string): boolean {
  return HELP_SECTIONS.some((sec) => sec.rows.some((r) => r.includes(text)));
}
