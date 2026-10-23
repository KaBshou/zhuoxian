/**
 * 通货 —— 打完怪掉的材料，用来改造法宝。
 *
 * 掉落占比（BALANCE §5）：全部掉落 4 次/分 = 法宝 40%（1.6）+ 通货 47.5%（1.9）+ 玉简 12.5%（0.5）。
 */
import type { Rng } from '../core/rng';

/** 通货种类。id 对应 item.ts 里的操作函数 */
export type CurrencyId = 'huang' | 'mie' | 'xi';

export interface CurrencyDef {
  readonly id: CurrencyId;
  /** 术语表里的名字（黄阶灵石/灭灵石/洗灵石） */
  readonly name: string;
  /** 一句话说明它是干嘛的（背包/掉落提示用） */
  readonly desc: string;
  /** 相对稀有度权重。黄阶最常见，洗灵石最稀有 */
  readonly weight: number;
  /** 掉落时的最低层数 */
  readonly minFloor: number;
}

export const CURRENCIES: readonly CurrencyDef[] = [
  {
    id: 'huang',
    name: '黄阶灵石',
    desc: '给一件法宝添入一条灵纹；已满条时改为重掷最弱的一条。',
    weight: 45,
    minFloor: 1,
  },
  {
    id: 'mie',
    name: '灭灵石',
    desc: '随机灭掉一件法宝的一条灵纹。',
    weight: 40,
    minFloor: 1,
  },
  {
    id: 'xi',
    name: '洗灵石',
    desc: '把一件法宝的全部灵纹重洗一遍。',
    weight: 15,
    minFloor: 3,
  },
];

/**
 * 通货占全部掉落的 47.5%（BALANCE §11.3：1.9/4.0）。
 */
export const CURRENCY_SHARE = 0.475;

/** 掷一次通货掉落。层数不够时返回 null */
export function rollCurrency(rng: Rng, floor: number): CurrencyDef | null {
  const usable = CURRENCIES.filter((c) => floor >= c.minFloor);
  if (usable.length === 0) return null;
  const total = usable.reduce((s, c) => s + c.weight, 0);
  let roll = rng.float(0, total);
  for (const c of usable) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return usable[usable.length - 1];
}
