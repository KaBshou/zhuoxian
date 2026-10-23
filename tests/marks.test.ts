/**
 * 渊痕花法（marks-runtime.ts）的契约测试。
 *
 * 这些测试守的是「渊痕不产生战力」和「钱不能白扣」两条：
 * - 每一档失败路径都必须把 marks 一位不动地留下（提前 return 发生在扣费之前）
 * - 三档效果必须是省时间/换材料/重铸，不许出现伤害或气血
 */
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/core/session';
import { spendMarks } from '../src/core/marks-runtime';
import { makeItem } from '../src/core/item';
import { MARKS_COST, MARK_SINK_NAME, affordableSinks, validateMarks, type MarkSink } from '../src/data/marks';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { Rng } from '../src/core/rng';
import { SLOT_NAME } from '../src/data/slots';
import { itemPower } from '../src/core/inventory';
import { serialize, deserialize } from '../src/core/save';
import { sessionToSave } from '../src/core/save-bridge';

function make() {
  return createSession({
    classId: 'yujian',
    seed: 20261022,
    tables: { bases: ITEM_BASES, affixes: AFFIXES },
  });
}

function giveMarks(s: ReturnType<typeof make>, n: number) {
  (s.character as { marks?: number }).marks = n;
}

describe('渊痕定价表', () => {
  it('validateMarks 无错误，且恰好三档', () => {
    expect(validateMarks()).toEqual([]);
    const sinks = Object.keys(MARKS_COST) as MarkSink[];
    expect(sinks.length).toBe(3);
  });

  it('三档都不给战斗属性（名字里只有省时间/材料/重铸）', () => {
    for (const key of Object.keys(MARK_SINK_NAME) as MarkSink[]) {
      const name = MARK_SINK_NAME[key];
      expect(name.length).toBeGreaterThan(0);
      // 这三档的承诺里不许出现伤害/气血这类词
      expect(name).not.toMatch(/伤害|攻击|气血|护体|暴击/);
    }
  });

  it('affordableSinks 按价格筛，负数/NaN 当 0', () => {
    expect(affordableSinks(0)).toEqual([]);
    expect(affordableSinks(MARKS_COST.rerollCurrency - 1)).toEqual([]);
    expect(affordableSinks(MARKS_COST.rerollCurrency).sort()).toEqual(['rerollCurrency']);
    // 用「最贵那档 + 1」而不是写死数字：定价会随渊痕/分 实测漂移
    const rich = Math.max(MARKS_COST.setStartFloor, MARKS_COST.rerollCurrency, MARKS_COST.divineReforge) + 1;
    expect(affordableSinks(rich).sort()).toEqual(['divineReforge', 'rerollCurrency', 'setStartFloor']);
    expect(affordableSinks(Number.NaN)).toEqual([]);
  });
});

describe('花钱的三条路径', () => {
  it('渊痕不足：返回 false、给出中文原因、一位不扣', () => {
    const s = make();
    giveMarks(s, MARKS_COST.rerollCurrency - 1);
    const before = s.character.marks;
    const r = spendMarks(s, 'rerollCurrency');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('渊痕不足');
    expect(s.character.marks).toBe(before);
    expect(s.pocket.xi).toBe(0);
  });

  it('聚灵（rerollCurrency）：扣 100000、洗灵石 +1，且不动战力', () => {
    const s = make();
    giveMarks(s, MARKS_COST.rerollCurrency);
    const powerBefore = s.battle.player.damage;
    const r = spendMarks(s, 'rerollCurrency');
    expect(r.ok).toBe(true);
    expect(s.character.marks).toBe(0);
    expect(s.pocket.xi).toBe(1);
    expect(s.battle.player.damage).toBe(powerBefore);
  });

  // D137 方案 d：定渊不再是「跳层」，而是**一次性永久解锁锁层挂机**。
  // 旧语义（跳到 highestFloorReached）在新周目里必然失败：prestige() 把 maxFloorReached 重置成 1，
  // 于是「已经在最深处（第 1 层）」，一分钱花不出去 —— 那正是这条通道被废掉的原因。
  it('定渊（setStartFloor）：一次性解锁，扣 720k，不改层号', () => {
    const s = make();
    giveMarks(s, MARKS_COST.setStartFloor);
    s.maxFloorReached = 5;
    s.floor = 1;
    const r = spendMarks(s, 'setStartFloor');
    expect(r.ok).toBe(true);
    expect(s.character.diveLockUnlocked).toBe(true);
    expect(s.floor).toBe(1); // 不跳层
    expect(s.character.marks).toBe(0);
  });

  it('定渊：已解锁 → false、不扣钱', () => {
    const s = make();
    giveMarks(s, MARKS_COST.setStartFloor * 2);
    expect(spendMarks(s, 'setStartFloor').ok).toBe(true);
    const before = s.character.marks;
    const r = spendMarks(s, 'setStartFloor');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('定渊已开');
    expect(s.character.marks).toBe(before);
  });

  it('夺造化（divineReforge）：重铸身上战力最高法宝的灵纹，扣 1000000', () => {
    const s = make();
    giveMarks(s, MARKS_COST.divineReforge);
    const rng = new Rng(4242);
    const item = makeItem(
      {
        slot: 'robe',
        rarity: 'bao',
        ilvl: 60,
        name: '浊纹道袍',
        base: [{ stat: 'life', op: 'flat', value: 100 }],
        affixes: [
          { defId: 'affix-life-01', name: '厚土', stat: 'life', op: 'flat', value: 20 },
          { defId: 'affix-dmg-01', name: '裂石', stat: 'damage', op: 'increased', value: 0.05 },
        ],
      },
      rng,
    );
    s.character.equipment.robe = item;
    const before = s.character.equipment.robe;
    const r = spendMarks(s, 'divineReforge');
    expect(r.ok).toBe(true);
    expect(s.character.marks).toBe(0);
    const after = s.character.equipment.robe;
    expect(after).toBeDefined();
    // 灵纹条数不变（重掷不是加条），战力不降（拔高到 1.3 上限）
    expect(after!.affixes.length).toBe(2);
    expect(itemPower(after!)).toBeGreaterThanOrEqual(itemPower(before!));
    // 只剩一件事变了：某条灵纹的数值/身份
    expect(JSON.stringify(after!.affixes)).not.toBe(JSON.stringify(before!.affixes));
  });

  it('夺造化：身上没有法宝 → false、不扣钱', () => {
    const s = make();
    giveMarks(s, MARKS_COST.divineReforge);
    (s.character as { equipment: Record<string, unknown> }).equipment = {};
    const before = s.character.marks;
    const r = spendMarks(s, 'divineReforge');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('没有法宝');
    expect(s.character.marks).toBe(before);
  });

  it('夺造化：法宝没有灵纹（凡品）→ false、不扣钱', () => {
    const s = make();
    giveMarks(s, MARKS_COST.divineReforge);
    s.character.equipment.robe = makeItem(
      { slot: 'robe', rarity: 'fan', ilvl: 1, name: '粗布道袍', base: [], affixes: [] },
      new Rng(9),
    );
    s.character.equipment.sword = undefined;
    const before = s.character.marks;
    const r = spendMarks(s, 'divineReforge');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('没有灵纹');
    expect(s.character.marks).toBe(before);
  });

  it('未知档位：返回 false 而不是崩', () => {
    const s = make();
    giveMarks(s, 10_000_000);
    const r = spendMarks(s, 'nope' as MarkSink);
    expect(r.ok).toBe(false);
    expect(s.character.marks).toBe(10_000_000);
  });

  it('部位名取自术语表（防止 UI 里出现裸 id）', () => {
    expect(SLOT_NAME.robe).toBeTruthy();
  });

  it('渊痕能存档往返（deserialize 是逐字段重建的，漏字段=静默清零）', () => {
    const s = make();
    giveMarks(s, 654_321);
    s.maxFloorReached = 12;
    const state = sessionToSave(s);
    expect(state.player.marks).toBe(654_321);
    const back = deserialize(JSON.parse(JSON.stringify(state)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.player.marks).toBe(654_321);
    expect(back.state.progress.maxFloorReached).toBe(12);
  });

  it('满级后击杀产出渊痕、修为不再涨（conversion 只在 session 里发生一次）', async () => {
    const s = make();
    giveMarks(s, 0);
    // 直接推到满级：step 80 是 xpForStep 的终点（Infinity），之后 only marks
    (s.character as { step: number }).step = 80;
    (s.character as { xp: number }).xp = 0;
    const { startWave, tickSession } = await import('../src/core/session');
    startWave(s);
    for (let i = 0; i < 60 * 60 && (s.character.marks ?? 0) === 0; i++) tickSession(s, 1 / 60);
    expect(s.character.step).toBe(80);
    expect(s.character.xp).toBe(0);
    expect(s.character.marks ?? 0).toBeGreaterThan(0);
  });
  it('老档没有 marks 字段：读回来是 0 而不是崩', () => {
    const s = make();
    giveMarks(s, 500_000);
    const state = sessionToSave(s);
    const raw = JSON.parse(JSON.stringify(state)) as { player: Record<string, unknown> };
    delete raw.player.marks;
    const back = deserialize(raw);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.player.marks).toBe(0);
  });
});
