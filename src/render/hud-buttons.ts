/**
 * 画布上的按钮条（鼠标 / 触屏用）。
 *
 * 为什么需要它：这个游戏原本**只有键盘**。键盘在电脑上是够的，但
 * 「发个链接给朋友，手机点开就能玩」是明确目标 —— 手机上根本没有 K / T / G / M / D / E 这些键，
 * 于是手机玩家连**开局选道统都过不去**（Enter 也按不了）。
 * 更糟的是：这不是"少一个快捷键"，是"发出去的链接打不开"。
 *
 * 设计取舍：
 * - 按钮条挂在**画布顶栏下方右侧**（顶栏 38px 是气血/浊气/罡气，不许被盖；
 *   左上角给法宝（装备）竖排面板，底部给战斗日志与键位提示）；
 * - 只放"打开面板"这一类**开关**，不把游戏操作搬到按钮上（放置游戏本来就不用操作）；
 * - 每个按钮上印着对应键位，电脑玩家看一眼就知道有快捷键，来源仍然是键盘，没有第二套逻辑；
 * - 布局是纯函数（`layoutHudButtons`），所以几何能被单测钉住 —— 不外推到屏幕外是本项目踩过的坑
 *   （`class-select.ts` 800 宽视口下卡片跑到 x=-42）。
 */

/** 按钮能做的一件事：切换一个面板。 */
export type HudButtonId =
  | 'detail'
  | 'breakdown'
  | 'talent'
  | 'skill'
  | 'codex'
  | 'achievement'
  | 'marks'
  | 'save';

export interface HudButton {
  readonly id: HudButtonId;
  readonly label: string;
  /** 显示在按钮上的键位（给电脑玩家看的，不影响点击） */
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const BTN_W = 62;
const BTN_H = 22;
const BTN_GAP = 6;
const EDGE = 14;
/**
 * 按钮条画在顶栏（气血/浊气/罡气，高 38）**下面**。
 *
 * 曾经写在 TOP = 10，正好压在顶栏的血条上 —— 用户看到的就是「生命值和功能面板重叠」。
 * 顶栏是玩家每秒都要看一眼的东西，任何压上去的常驻 UI 都是错的；
 * 宁可让按钮条下移 32px，也不要让血条被盖住。
 */
const TOP = 42;

/**
 * 右上角一排按钮。顺序刻意与底部提示行一致（E → D → T → G → K → M），
 * 这样"读提示行"和"找按钮"是同一个顺序。
 *
 * 只接受画布尺寸作为输入（不读全局常量），既方便单测，也防止以后改分辨率漏改这里。
 *
 * **必须在任何画布宽度下都不画到屏幕外**：本项目在 `class-select.ts` 上踩过一次
 * （800 宽视口下卡片总宽 904，第一张画在 x=-42），所以这里先算可用宽度，
 * 放不下就压窄按钮，窄到 40px 还放不下就折成两行 —— 宁可按钮小，不能点不到。
 */
export function layoutHudButtons(canvasW: number, canvasH = 540): readonly HudButton[] {
  const specs: readonly { id: HudButtonId; label: string; key: string }[] = [
    { id: 'detail', label: '法宝', key: 'E' },
    { id: 'breakdown', label: '详解', key: 'D' },
    { id: 'talent', label: '周天', key: 'T' },
    { id: 'skill', label: '神通', key: 'G' },
    { id: 'codex', label: '图鉴', key: 'K' },
    { id: 'achievement', label: '成就', key: 'J' },
    { id: 'marks', label: '渊痕', key: 'M' },
    { id: 'save', label: '存档', key: 'S' },
  ];
  const n = specs.length;
  const avail = Math.max(0, canvasW - EDGE * 2);
  let btnW = BTN_W;
  if (n * btnW + (n - 1) * BTN_GAP > avail) {
    btnW = Math.floor((avail - (n - 1) * BTN_GAP) / n);
  }
  // 窄到 40 以下就别硬挤了：折成两行，每行 3 个（手机上不可能这么窄，纯防御）
  const perRow = btnW >= 40 ? n : Math.ceil(n / 2);
  btnW = Math.max(24, Math.min(btnW, Math.floor((avail - (perRow - 1) * BTN_GAP) / perRow)));
  const rowW = perRow * btnW + (perRow - 1) * BTN_GAP;
  const startX = Math.round(Math.max(EDGE, canvasW - EDGE - rowW));
  return specs.map((s, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return {
      id: s.id,
      label: s.label,
      key: s.key,
      x: Math.max(0, startX) + col * (btnW + BTN_GAP),
      y: TOP + row * (BTN_H + BTN_GAP),
      w: btnW,
      h: BTN_H,
    };
  });
}

/**
 * 点在哪一颗按钮上。命中不了返回 null。
 *
 * 判据用**闭区间**（点正好落在边框上也算命中）：手机点击坐标有亚像素抖动，
 * 差 1px 就判空会让人觉得"按钮时灵时不灵"。
 */
export function hitTestHudButtons(px: number, py: number, canvasW: number): HudButton | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  for (const b of layoutHudButtons(canvasW)) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}

/** 把「浏览器里的点击位置」换算成画布坐标。画布被 CSS 缩放时这一步不能省。 */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const sx = rect.width > 0 ? canvasW / rect.width : 1;
  const sy = rect.height > 0 ? canvasH / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

export interface HudButtonsTheme {
  readonly text: string;
  readonly dim: string;
  readonly edge: string;
  readonly frame: string;
}

/** 画按钮条。`activeIds` 里的按钮描金边（表示对应面板正开着）。 */
export function drawHudButtons(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  theme: HudButtonsTheme,
  activeIds: readonly HudButtonId[] = [],
): void {
  const buttons = layoutHudButtons(canvasW);
  ctx.save();
  ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of buttons) {
    const on = activeIds.includes(b.id);
    ctx.fillStyle = on ? 'rgba(40,34,20,0.92)' : 'rgba(16,14,16,0.78)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = on ? theme.frame : theme.edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = on ? theme.frame : theme.dim;
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    // 键位印在右上角：电脑玩家能看见"原来有快捷键"，不用另写一行说明
    ctx.fillStyle = on ? theme.frame : theme.edge;
    ctx.font = '9px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(b.key, b.x + b.w - 8, b.y + 6);
    ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  }
  ctx.restore();
}
