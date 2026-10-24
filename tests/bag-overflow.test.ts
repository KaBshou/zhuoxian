import { describe, expect, it } from 'vitest';
import { BAG_CAPACITY, itemPower, pickup, trimBagDetailed } from '../src/core/inventory';
import { createCharacter } from '../src/core/character';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { makeItem } from '../src/core/item';
import { Rng } from '../src/core/rng';

/**
 * D198：背包满时的丢弃不许说谎。
 *
 * `trimBag` 的规则一直是「超了就丢最差的」——但它是静默的，日志还写「收起 X」。
 * 玩家看到「收起」就以为进去了，其实它可能就是被丢掉的那一件。
 * 挂机游戏里「我明明看见了它却没了」是最伤的一种不透明。
 */

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function quietItem(seed: number, ilvl = 15) {
  const rng = new Rng(seed);
  return makeItem({ slot: 'ring', rarity: 'ling', ilvl, name: '试炼指环' }, rng);
}

describe('D198 背包满时的丢弃', () => {
  it('trimBagDetailed：没超就一件不丢', () => {
    const bag = Array.from({ length: 5 }, (_, i) => quietItem(100 + i));
    const res = trimBagDetailed(bag);
    expect(res.bag).toHaveLength(5);
    expect(res.discarded).toHaveLength(0);
  });

  it('trimBagDetailed：超了只丢最差的，且丢弃件可以报出来', () => {
    const bag = Array.from({ length: BAG_CAPACITY + 3 }, (_, i) => quietItem(200 + i, 5 + (i % 40)));
    const res = trimBagDetailed(bag);
    expect(res.bag).toHaveLength(BAG_CAPACITY);
    expect(res.discarded).toHaveLength(3);
    // 留下来的每一件都不比丢掉的更差（用 itemPower 比，不是 ilvl —— 战力由灵纹决定）
    const worstKept = Math.min(...res.bag.map((b) => itemPower(b)));
    const bestDropped = Math.max(...res.discarded.map((b) => itemPower(b)));
    expect(worstKept).toBeGreaterThanOrEqual(bestDropped);
  });

  it('pickup 返回 discarded，且日志不再无条件写「收起」', () => {
    const ch = createCharacter('yujian');
    // 先把背包塞满到上限（用同部位、低灵蕴的件，让自动换装不把它们换上身）
    const bag = Array.from({ length: BAG_CAPACITY }, (_, i) => quietItem(300 + i, 90));
    const junk = quietItem(999, 1);
    const res = pickup(ch, bag, junk);
    expect(res.bag.length).toBeLessThanOrEqual(BAG_CAPACITY);
    // 这件比手里的都差 ⇒ 它自己被丢掉，日志必须说清楚而不是「收起」
    expect(res.discarded.length + (res.equipped ? 1 : 0)).toBeGreaterThan(0);
    if (res.discarded.some((d) => d.uid === junk.uid)) {
      expect(res.message).toContain('背包已满');
      expect(res.message).not.toBe(`收起 ${junk.name}`);
    }
  });

  it('没满的时候日志是干净的（不带「背包已满」这类噪音）', () => {
    const ch = createCharacter('yujian');
    const junk = quietItem(1234, 5);
    // 空背包时戒指位是空的 ⇒ 会直接换上（这本身是对的行为），日志要么「换上」要么「收起」，
    // 但绝不能带「背包已满」—— 那是背包没满时的谎话。
    const res = pickup(ch, [], junk);
    expect(res.discarded).toHaveLength(0);
    expect(res.message).not.toContain('背包已满');
    expect(res.message).toMatch(/^(换上|收起) /);
  });

  it('HUD 背包标题在满时写「· 满」（玩家要知道自己正在丢东西）', async () => {
    const { drawHudStack } = await import('../src/render/hud-panels');
    const { createSession } = await import('../src/core/session');
    const s = createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
    s.bag = Array.from({ length: BAG_CAPACITY }, (_, i) => quietItem(500 + i));
    const texts: string[] = [];
    const noop = () => undefined;
    const ctx = {
      fillText: (t: string) => texts.push(String(t)),
      canvas: { width: 960, height: 540 },
      save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
      arc: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      setLineDash: noop, clip: noop, translate: noop, scale: noop, rotate: noop, drawImage: noop,
      roundRect: noop, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '',
      textAlign: 'left', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '',
    };
    drawHudStack(ctx as unknown as CanvasRenderingContext2D, s, 74);
    const title = texts.find((t) => t.startsWith('背包'));
    expect(title).toBeDefined();
    expect(title).toContain(String(BAG_CAPACITY));
    expect(title).toContain('满');
  });
});
