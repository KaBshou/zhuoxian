/**
 * 神通玉简（技能石）作为掉落物。
 * 掉落占比（BALANCE §5）：玉简占 12.5%（0.5/4.0）。
 */
import type { Rng } from '../core/rng';
import { SUPPORT_GEMS, type SupportGemDef } from './support-gems';

/** 玉简占全部掉落的份额（BALANCE §5/§11.3：0.5/4.0 = 12.5%） */
export const GEM_SHARE = 0.125;

/** 掷一枚玉简。只从已解锁池里抽 */
export function rollGemDrop(rng: Rng, unlockedSteps: number): SupportGemDef {
  const pool = SUPPORT_GEMS.filter((g) => g.unlockStep <= unlockedSteps);
  const use = pool.length > 0 ? pool : [SUPPORT_GEMS[0]];
  return use[rng.int(0, use.length - 1)];
}
