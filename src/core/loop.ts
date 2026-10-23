/**
 * 主循环（Main Loop）—— 所有游戏的心脏。
 *
 * 这里有一个新手最容易踩、而且踩了以后很难查的坑，所以我把原因写清楚：
 *
 * 【为什么不能直接 x += 速度 × 每次的间隔】
 *
 * 浏览器给你回调时，两次之间的间隔是不固定的：性能好的电脑可能 6 毫秒，
 * 性能差一点可能 25 毫秒，切到别的标签页再回来可能 2 秒。
 * 如果你每次都用「真实间隔」去累加，那么在快电脑上怪物走得快、慢电脑上走得慢，
 * 而且一旦掉帧，怪物会瞬移一大截（可能直接穿过你的攻击判定）。
 *
 * 解法叫「固定步长」：不管真实间隔是多少，逻辑层永远按 1/60 秒推进。
 * 真实间隔长就多跑几步补上，短就这一步不跑、等下一帧。
 * 这样游戏在任何电脑上的行为完全一致。
 *
 * 这个文件属于「样板代码」—— 它和修仙、和刷宝都没关系，是所有游戏共通的。
 * 你以后做任何游戏都可以原样搬过去。理解它的作用即可，不需要背下来。
 */

/** 一次逻辑推进要执行的函数。dt 永远是固定值（默认 1/60 秒）。 */
export type UpdateFn = (dt: number) => void;

/** 一帧要执行的绘制函数。不接收参数 —— 绘制只读当前状态，不改状态。 */
export type RenderFn = () => void;

export class Loop {
  private readonly update: UpdateFn;
  private readonly render: RenderFn;
  /** 逻辑步长（秒）。60 步/秒 = 0.01666… */
  private readonly fixedDt: number;

  /** 累积器：攒够一个 fixedDt 就推进一步 */
  private acc = 0;
  /** 上一帧的时间戳（毫秒，performance.now 给的值） */
  private last = 0;
  private rafId = 0;
  private running = false;

  constructor(update: UpdateFn, render: RenderFn, stepsPerSecond = 60) {
    this.update = update;
    this.render = render;
    this.fixedDt = 1 / stepsPerSecond;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;

    const frame = (now: number): void => {
      // stop() 之后，已经排队的那一帧可能还会进来一次，这里挡掉
      if (!this.running) return;
      this.tick(now);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick(now: number): void {
    const raw = (now - this.last) / 1000;
    this.last = now;

    // 上限 0.1 秒。没有这一行，从别的标签页切回来时 raw 可能是 30 秒，
    // 下面的 while 会试图补 1800 步，页面直接卡死几秒（俗称「卡顿爆炸」）。
    const dt = Math.min(raw, 0.1);

    this.acc += dt;

    // 一次最多补 8 步。补不完就丢弃剩余累积，宁可「慢一点点」也不要卡死。
    let steps = 0;
    while (this.acc >= this.fixedDt && steps < 8) {
      this.update(this.fixedDt);
      this.acc -= this.fixedDt;
      steps += 1;
    }
    if (steps >= 8) this.acc = 0;

    this.render();
  }
}
