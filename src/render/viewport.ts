/**
 * 视口（画布尺寸）自适应
 *
 * 为什么需要这个文件：游戏内部所有布局、命中测试、面板尺寸都按 **960×540 逻辑像素** 写死
 * （`BATTLE_W` / `BATTLE_H`）。以前画布在 CSS 里最多显示 960px 宽，于是在 1920 的桌面上
 * 只占半屏、字看着很小（用户反馈：「UI 有点小，要适配到整个网页」）。
 *
 * 现在的做法：**逻辑分辨率不变、显示尺寸拉满、后备缓冲跟着放大**。
 *   - CSS 把画布撑到视口里最大的 16:9 矩形（见 `src/style.css` 的 `#stage`）；
 *   - 这里按「画布实际显示宽度 × devicePixelRatio ÷ 960」算出一个像素比，
 *     把 `canvas.width/height` 设成逻辑尺寸 × 这个比，再用 `setTransform` 让绘制代码
 *     继续用 960×540 的坐标系。
 * 好处：布局与命中测试不用改一行（换算由 `toCanvasPoint` 负责），而字和线条在
 * 大屏上是真的按倍数渲染出来的，不是把小位图拉大（拉大会糊）。
 *
 * 两条纪律：
 *  1) **逻辑尺寸只从这里出**：业务代码不许再读 `canvas.width` 当坐标空间用
 *     （它是后备缓冲的像素数，会随屏幕变）。要逻辑宽高就读 `LOGICAL_W` / `LOGICAL_H`。
 *  2) 像素比上限 4：1920 的屏已经是 3840 的后备缓冲，再高只是白烧内存和电量。
 */

export const LOGICAL_W = 960;
export const LOGICAL_H = 540;

/** 像素比上限（1920 CSS 宽 → 3840 后备缓冲，再大只是烧内存） */
export const MAX_PIXEL_RATIO = 4;

/**
 * 按画布当前显示尺寸重设后备缓冲与变换矩阵，返回本次使用的像素比。
 *
 * 必须在「画布已经被 CSS 布局过」之后调用（首次要在 `requestAnimationFrame` 里排一帧，
 * 或至少在 `getBoundingClientRect()` 能读到宽度之后），否则拿到的是 0 宽。
 * 画布尺寸变化会重置 2D 上下文的全部状态，所以每次都要重新 `setTransform`。
 */
export function resizeCanvas(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width > 0 ? rect.width : LOGICAL_W;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  // 非有限数一律当 1（有些内嵌浏览器会给 NaN/Infinity，乘出来整块画布就没了）
  const raw = (cssW * dpr) / LOGICAL_W;
  const ratio = Math.max(1, Math.min(MAX_PIXEL_RATIO, Number.isFinite(raw) ? raw : 1));

  const w = Math.round(LOGICAL_W * ratio);
  const h = Math.round(LOGICAL_H * ratio);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 用实际写入的整数尺寸反算，避免 960×1.3333 这种小数比导致 0.3px 的累积漂移
    ctx.setTransform(w / LOGICAL_W, 0, 0, h / LOGICAL_H, 0, 0);
  }
  return w / LOGICAL_W;
}
