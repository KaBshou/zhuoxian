import { describe, expect, it } from 'vitest';
import { createBattle, playerBattleFromCharacter, spawnMonster, tickBattle, BATTLE_W, BATTLE_H } from '../src/core/battle';
import { createTurbid, tickTurbid, CORRUPTION_DURATION, TURBID_DAMAGE_BONUS } from '../src/core/turbid';
import { characterStats, createCharacter, equip } from '../src/core/character';
import { switchOverridesFor } from '../src/core/talents-runtime';
import { createSession, startWave } from '../src/core/session';
import { makeItem } from '../src/core/item';
import { CRIT_CHANCE_CAP, RESIST_CAP, RESIST_CAP_BONUS_MAX } from '../src/data/stats';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';
import { getMonster } from '../src/data/monsters';
import { Rng } from '../src/core/rng';

/**
 * 天赋开关节点 → 运行时的端到端验证。
 * 五个开关里 speed-demon（遁速）v1 没有战斗用途，不测。
 */

const ch = () => createCharacter('yujian');

/**
 * 给角色点上天赋 + 穿一件「火抗 flat 0.9」的道袍，返回解析后的属性表。
 *
 * 为什么必须穿装备造数据：`characterStats(ch)` 只认角色本身，不接 `talentIds` 参数，
 * 而角色天赋是 `ch.talentIds` 字段 —— 直接传参不生效。要让 0.9 的火抗触发上限夹取，
 * 就得让属性真有来源。0.9 > 0.75 > 0.80，所以三种情况都能区分。
 */
function withEquipMods(base: ReturnType<typeof createCharacter>, ids: readonly string[]) {
  const withTalents = { ...base, talentIds: [...ids] };
  const robe = makeItem(
    { slot: 'robe', rarity: 'bao', ilvl: 10, name: '测试道袍', base: [{ stat: 'resFire', op: 'flat', value: 0.9 }] },
    new Rng(11),
  );
  const r = equip(withTalents, 'robe', robe);
  expect(r.ok).toBe(true);
  return characterStats(r.character);
}

describe('天赋开关 → 运行时', () => {
  it('switchOverridesFor：只产出点亮的开关', () => {
    expect(switchOverridesFor([])).toEqual({});
    const o = switchOverridesFor(['fast-pickup', 'wave-regen-plus']);
    expect(o.pickupDelay).toBe(0.45);
    expect(o.waveEndRegen).toBe(0.35);
    expect(o.turbidBoomBonus).toBeUndefined(); // 没点的开关不该出现
    expect(o.corruptionDuration).toBeUndefined();
  });

  it('turbid-boom-plus：爆发期伤害加成 0.5 → 0.75（同种子对比倍率）', () => {
    const c = ch();
    const def = getMonster('fangshi-yuanke')!;
    const strike = (ids: readonly string[]) => {
      const bt = createTurbid();
      bt.value = 100; // 一帧内攒满 → corrupting
      const b = createBattle(playerBattleFromCharacter(c), bt, c, switchOverridesFor(ids));
      b.monsters = [spawnMonster(def, 1, 1, BATTLE_W / 2 + 40, BATTLE_H / 2)];
      tickBattle(b, 1 / 60, new Rng(7));
      const e = b.events.find((ev) => ev.kind === 'player-hit' || ev.kind === 'player-crit');
      return e?.amount ?? 0;
    };
    const base = strike([]);
    const plus = strike(['turbid-boom-plus']);
    expect(base).toBeGreaterThan(0);
    // 爆发期 mul = (1+bonus)×CORRUPTION_DAMAGE_MUL → 比 = 1.75/1.5
    expect(plus / base).toBeCloseTo((1 + 0.75) / (1 + TURBID_DAMAGE_BONUS), 1);
  });

  it('turbid-extend：爆发 5s → 6s', () => {
    const dur = (ids: readonly string[]) => {
      const st = createTurbid();
      const opts = switchOverridesFor(ids);
      tickTurbid(st, 1 / 60, 100, opts); // 一帧攒满 → corrupting（dt=0 会被守卫挡掉）
      let t = 0;
      while (st.phase === 'corrupting') {
        tickTurbid(st, 1 / 60, 0, opts);
        t += 1 / 60;
      }
      return t;
    };
    expect(dur([])).toBeCloseTo(CORRUPTION_DURATION, 1);
    expect(dur(['turbid-extend'])).toBeCloseTo(6, 1);
  });

  it('createSession 经 talentIds 让 fast-pickup 生效（switches 进 session）', () => {
    const s = createSession({
      classId: 'yujian',
      seed: 77,
      tables: { bases: ITEM_BASES, affixes: AFFIXES },
      talentIds: ['fast-pickup', 'wave-regen-plus'],
    });
    expect(s.switches.pickupDelay).toBe(0.45);
    expect(s.switches.waveEndRegen).toBe(0.35);
    expect(s.character.talentIds).toEqual(['fast-pickup', 'wave-regen-plus']);
  });

  it('不点开关的 session switches 为空、行为与旧版一致', () => {
    const s = createSession({ classId: 'yujian', seed: 77, tables: { bases: ITEM_BASES, affixes: AFFIXES } });
    expect(Object.keys(s.switches).length).toBe(0);
    startWave(s);
    expect(s.battle.boomBonus).toBe(TURBID_DAMAGE_BONUS);
    expect(s.battle.corruptionDur).toBe(CORRUPTION_DURATION);
  });

  // ── D82：身法支线的占位开关改成 resist-cap-plus（抗性上限 0.75 → 0.80）──
  it('resist-cap-plus：真的把抗性上限从 75% 放到 80%（不是只在面板写一行）', () => {
    const mk = (ids: readonly string[]) =>
      withEquipMods(createCharacter('yujian'), ids);
    // 0.9 的火抗：没点开关 → 被夹到 RESIST_CAP 0.75；点了 → 夹到 0.80
    expect(mk([]).resFire).toBeCloseTo(RESIST_CAP, 6);
    expect(mk(['resist-cap-plus']).resFire).toBeCloseTo(RESIST_CAP + RESIST_CAP_BONUS_MAX, 6);
  });

  it('resist-cap-plus 只放开五行抗性，不许顺手放开破绽率/护体', () => {
    const c = withEquipMods(createCharacter('yujian'), ['resist-cap-plus']);
    // 破绽率仍受 CRIT_CHANCE_CAP 约束
    expect(c.critChance).toBeLessThanOrEqual(CRIT_CHANCE_CAP + 1e-9);
    // 护体没有上限，但也不该被这条开关改动
    const noSwitch = withEquipMods(createCharacter('yujian'), []);
    expect(c.armor).toBeCloseTo(noSwitch.armor, 6);
  });

  it('resist-cap-plus 未点亮时 switchOverridesFor 不产出字段', () => {
    expect(switchOverridesFor(['fast-pickup']).resistCapBonus).toBeUndefined();
    expect(switchOverridesFor(['resist-cap-plus']).resistCapBonus).toBe(RESIST_CAP_BONUS_MAX);
  });
});
