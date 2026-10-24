import { describe, expect, it } from 'vitest';
import { BOSS_EVERY, bossWaveHint, createSession } from '../src/core/session';
import { MAX_FLOOR } from '../src/data/monsters';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';

/**
 * D194：底栏「还有几波见到镇守」。
 * 判的是三态语义（本波镇守 / 距镇守 N 波 / 下潜中），不是具体排版。
 */
function made(floor?: number, wave?: number) {
  const s = createSession({ classId: 'yujian', seed: 2026, tables: { bases: ITEM_BASES, affixes: AFFIXES } });
  if (typeof floor === 'number') s.floor = floor;
  if (typeof wave === 'number') s.wave = wave;
  return s;
}

describe('bossWaveHint（镇守倒计时）', () => {
  it('第 1 波离镇守还差 9 波', () => {
    expect(bossWaveHint(made(1, 1))).toBe(`距镇守 ${BOSS_EVERY - 1} 波`);
  });

  it('第 9 波只差 1 波（边界，别写成 0 波）', () => {
    expect(bossWaveHint(made(1, 9))).toBe('距镇守 1 波');
  });

  it('第 10 波就是镇守波', () => {
    expect(bossWaveHint(made(1, BOSS_EVERY))).toBe('本波镇守');
  });

  it('第 11 波（下潜后重新数）又回到距镇守 9 波', () => {
    expect(bossWaveHint(made(2, 11))).toBe(`距镇守 ${BOSS_EVERY - 1} 波`);
  });

  it('层 28+ 的无镇守层写「下潜中」而不是「距镇守 N 波」', () => {
    // 28 层没有镇守（无尽层只在 30/35/40/45 出），写「距镇守」会骗玩家等一个不会来的东西
    expect(bossWaveHint(made(28, 3))).toBe('下潜中');
  });

  it('脏值（NaN / 负数波）按第 1 波处理，绝不吐 NaN', () => {
    const a = bossWaveHint(made(1, Number.NaN));
    const b = bossWaveHint(made(1, -5));
    expect(a).toBe(`距镇守 ${BOSS_EVERY - 1} 波`);
    expect(b).toBe(a);
    expect(a.includes('NaN')).toBe(false);
  });

  it('末层写「渊底」——没有镇守也没有下一层，不能让它一直等', () => {
    expect(bossWaveHint(made(MAX_FLOOR, 4))).toBe('渊底');
  });

  it('任何状态下文案里都不出现 NaN / undefined', () => {
    for (const f of [1, 9, 10, 27, 28, 30, MAX_FLOOR]) {
      for (const w of [1, 5, 10, 11, 99]) {
        const text = bossWaveHint(made(f, w));
        expect(text.includes('NaN')).toBe(false);
        expect(text.includes('undefined')).toBe(false);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });
});
