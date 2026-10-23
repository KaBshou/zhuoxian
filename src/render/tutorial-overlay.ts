/**
 * 引导条（引路）—— 画在画面底部正中的一行提示。
 *
 * 为什么放底部正中：战斗主体在中间、HUD 在右上、战斗日志在左下、
 * 损伤详解在左上。底部正中是唯一「一直空着」的位置，引导放这里
 * 不会盖住任何玩家正在看的东西，也不打断挂机观感。
 *
 * 纪律：本文件只画、不算账。第几条、什么时候推进全在 `core/onboarding.ts`。
 */
/** 全角字符按 2 个半角宽算（中文换行的唯一正确算法） */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x2e80) return 1;
  return 2;
}

/**
 * 按「半角宽度」折行（纯函数，给渲染和单测共用）。
 *
 * 不用 ctx.measureText 的原因：那是浏览器 API，单测里跑不了，
 * 而「一句话被切成两行还是三行」直接决定引导条高度会不会压到别的东西。
 */
export function wrapTutorialText(text: string, maxUnits: number): string[] {
  const limit = Math.max(8, Math.floor(maxUnits));
  const lines: string[] = [];
  let cur = '';
  let curW = 0;
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
      curW = 0;
      continue;
    }
    const w = charWidth(ch);
    if (curW + w > limit && cur !== '') {
      lines.push(cur);
      cur = '';
      curW = 0;
    }
    cur += ch;
    curW += w;
  }
  if (cur !== '') lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

export interface TutorialBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly lines: readonly string[];
}

const C = {
  panel: 'rgba(11, 10, 12, 0.88)',
  edge: 'rgba(212, 161, 60, 0.45)',
  title: '#d4a13c',
  text: '#d8d3c4',
  dim: '#6d665c',
};

/** 引导条宽度上限：960 的画面上留 60 边距，太宽会像一条横幅 */
const MAX_BOX_W = 640;
const PAD_X = 16;
const PAD_Y = 12;
const LINE_H = 20;
const TITLE_H = 18;

/**
 * 引导条与画面底边的最小留白。
 *
 * 2026-10-23 线上事故（D177）：原来写死 `y = canvasH - boxH - 18`，
 * 而底栏（「第 N 波　M 层　击杀…　键位提示」）的基线在 `canvasH - 14`，
 * 于是引导框**正好压在底栏文字上**（截图里两行字糊成一团）。
 *
 * 修法不是「再挪几个像素」——挪多少都会在下一次改字号时重演。
 * 而是让调用方把**底栏占多高**传进来（`bottomInset`），引导框从它上面往上排。
 */
const BOTTOM_MARGIN = 8;

/**
 * 画一条引导提示。返回它的矩形（探针/测试要断言「它真的画在屏幕内」）。
 *
 * `bottomInset` = 画面底部被别的东西占掉的高度（底栏）。引导框从它上方往上排，
 * 默认 0 保持旧行为（单测与老探针不受影响）。
 */
export function drawTutorial(
  ctx: CanvasRenderingContext2D,
  text: string,
  progress: string,
  canvasW: number,
  canvasH: number,
  bottomInset = 0,
): TutorialBox {
  const boxW = Math.min(MAX_BOX_W, Math.max(240, canvasW - 60));
  // 半角宽度预算：减去左右内边距，再留一点给标点
  const textUnits = Math.floor((boxW - PAD_X * 2 - 8) / 6.5);
  const lines = wrapTutorialText(text, textUnits);
  const boxH = PAD_Y * 2 + TITLE_H + lines.length * LINE_H;
  const x = Math.round((canvasW - boxW) / 2);
  const y = Math.round(canvasH - bottomInset - boxH - BOTTOM_MARGIN);

  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

  // 左侧一道金色竖线：让「这是引导，不是日志」一眼可分
  ctx.fillStyle = C.title;
  ctx.fillRect(x, y, 3, boxH);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.title;
  ctx.fillText('引路', x + PAD_X, y + PAD_Y + 8);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.dim;
  // 「点一下」必须写出来：手机上没有空格键，只写「空格/Enter 跳过」
  // 等于告诉手机玩家"你没法跳过"（D92 触屏层的同一个教训）
  ctx.fillText(`${progress}　·　点一下 / 空格 跳过`, x + boxW - PAD_X, y + PAD_Y + 8);

  ctx.textAlign = 'left';
  ctx.font = '13px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.text;
  let ly = y + PAD_Y + TITLE_H + 12;
  for (const line of lines) {
    ctx.fillText(line, x + PAD_X, ly);
    ly += LINE_H;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  return { x, y, w: boxW, h: boxH, lines };
}

/** 引导条占的高度（渲染器给别的东西让位用） */
export function tutorialBoxHeight(text: string, canvasW: number): number {
  const boxW = Math.min(MAX_BOX_W, Math.max(240, canvasW - 60));
  const textUnits = Math.floor((boxW - PAD_X * 2 - 8) / 6.5);
  return PAD_Y * 2 + TITLE_H + wrapTutorialText(text, textUnits).length * LINE_H;
}

/** 引导框的矩形（不画，只算）。测试用它断言「不许压到底栏」。 */
export function tutorialBoxRect(
  text: string,
  canvasW: number,
  canvasH: number,
  bottomInset = 0,
): TutorialBox {
  const boxW = Math.min(MAX_BOX_W, Math.max(240, canvasW - 60));
  const textUnits = Math.floor((boxW - PAD_X * 2 - 8) / 6.5);
  const lines = wrapTutorialText(text, textUnits);
  const boxH = PAD_Y * 2 + TITLE_H + lines.length * LINE_H;
  return {
    x: Math.round((canvasW - boxW) / 2),
    y: Math.round(canvasH - bottomInset - boxH - BOTTOM_MARGIN),
    w: boxW,
    h: boxH,
    lines,
  };
}
