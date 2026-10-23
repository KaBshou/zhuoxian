/**
 * 可复现随机数。
 *
 * 为什么要自己写（不用 Math.random）：
 * 1. **测试需要**。「同一个种子必须出同一件装备」是掉落系统的核心断言；
 *    Math.random 让这句话无法验证。
 * 2. **存档需要**。玩家 re/load 之后如果随机流跳了，会出现「反复刷新能刷出好装备」
 *    这种必然被玩家发现的漏洞。
 * 3. **离线收益需要**。补算 8 小时的战斗要用同一条流重放，否则和在线跑的结果对不上。
 *
 * 实现：计数式 —— 状态只有一个 seed 和一个 count。
 * 不用保存「当前内部状态」的原因：内部状态是个长数组，存档体积大且容易写坏；
 * 计数式只要 `hash(seed, count)` 就能回到任意一点，还能跳到第 N 次。
 *
 * 注意：`Math.imul` 是全平台确定性的整数乘法，所以同一份种子在 Windows / Mac / 手机上
 * 出来的序列完全一样。这一点必须保证，否则跨端存档校验会炸。
 */

/** 存档里存的随机状态：只两个数字 */
export interface RngState {
  readonly seed: number;
  readonly count: number;
}

/** 32 位整数混淆（两个乘法 + 异或移位，够用且快） */
function mix32(h: number): number {
  let x = h | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** 字符串 → 32 位种子（FNV-1a 变体）。用来从 "loot" / "monster" 这类名字派生独立流 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const n = Math.floor(seed) | 0;
  return n === 0 ? 1 : n;
}

/** 加权条目 */
export interface Weighted<T> {
  readonly item: T;
  readonly weight: number;
}

export class Rng {
  private seed: number;
  private count: number;

  constructor(seed = 1) {
    this.seed = normalizeSeed(seed);
    this.count = 0;
  }

  /** 导出状态（进存档） */
  get state(): RngState {
    return { seed: this.seed, count: this.count };
  }

  /** 从存档恢复。seed 会重新归一化，count 必须是非负整数 */
  set state(s: RngState) {
    this.seed = normalizeSeed(s.seed);
    this.count = Number.isFinite(s.count) && s.count > 0 ? Math.floor(s.count) : 0;
  }

  /** 已经抽了多少次（调试用，也给「本局掉落随机度」这类统计） */
  get drawn(): number {
    return this.count;
  }

  /** 独立的分支流：同一父流下不同 label 互不干扰 */
  fork(label: string): Rng {
    const child = new Rng(mix32(this.seed ^ hashString(label) ^ 0xa5a5a5a5));
    return child;
  }

  clone(): Rng {
    const c = new Rng(this.seed);
    c.count = this.count;
    return c;
  }

  /** [0, 1) 的浮点数 */
  private nextUnit(): number {
    this.count += 1;
    const a = mix32((this.seed ^ Math.imul(this.count, 0x9e3779b1)) | 0);
    const b = mix32((a + this.seed + 0x6d2b79f5) | 0);
    return b / 4294967296;
  }

  /** [min, max) 的浮点数 */
  float(min = 0, max = 1): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return min;
    if (max <= min) return min;
    return min + this.nextUnit() * (max - min);
  }

  /** [min, max] 的整数（**两端都含**，这是最容易写错的地方） */
  int(min: number, max: number): number {
    const lo = Math.ceil(Number.isFinite(min) ? min : 0);
    const hi = Math.floor(Number.isFinite(max) ? max : lo);
    if (hi <= lo) return lo;
    return lo + Math.floor(this.nextUnit() * (hi - lo + 1));
  }

  /** 概率 p 命中；p<=0 永不命中，p>=1 必然命中 */
  chance(p: number): boolean {
    if (!Number.isFinite(p) || p <= 0) return false;
    if (p >= 1) return true;
    return this.nextUnit() < p;
  }

  /** 均匀取一个。空数组是编程错误，直接抛 */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: 数组为空');
    return arr[this.int(0, arr.length - 1)];
  }

  /** 按权重取一个。空池或总权重为 0 → null（不是错误，掉落池抽空是正常情况） */
  weighted<T>(entries: readonly Weighted<T>[]): T | null {
    let total = 0;
    for (const e of entries) {
      if (Number.isFinite(e.weight) && e.weight > 0) total += e.weight;
    }
    if (total <= 0) return null;
    let roll = this.nextUnit() * total;
    for (const e of entries) {
      if (!Number.isFinite(e.weight) || e.weight <= 0) continue;
      roll -= e.weight;
      if (roll < 0) return e.item;
    }
    // 浮点误差兜底：取最后一个有效项
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (Number.isFinite(e.weight) && e.weight > 0) return e.item;
    }
    return null;
  }

  /** 洗牌（Fisher-Yates），返回新数组，不改传入的 */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** 从数组里取 n 个不重复的（n 大于长度时返回全部，顺序随机） */
  sample<T>(arr: readonly T[], n: number): T[] {
    if (n <= 0) return [];
    return this.shuffle(arr).slice(0, Math.min(n, arr.length));
  }
}
