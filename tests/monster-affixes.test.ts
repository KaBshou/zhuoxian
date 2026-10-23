import { describe, expect, it } from 'vitest';
import {
  MONSTER_AFFIX_DEFS,
  MONSTER_AFFIX_CATEGORY_NAME,
  MONSTER_QTY_CAP,
  affixCountRange,
  affixesForFloor,
  getMonsterAffix,
  isMonsterAffixId,
  monsterAffixSuffix,
  rarityOfAffixCount,
  sumMonsterAffixes,
  validateMonsterAffixes,
} from '../src/data/monster-affixes';
import {
  MONSTER_AFFIX_CATEGORIES,
  RARITY_BRACKETS,
  rarityBracketAt,
  rollMonsterAffixIds,
  rollMonsterIdentity,
  rollMonsterRarity,
} from '../src/core/monster-roll';
import { Rng } from '../src/core/rng';
import { ALL_MONSTERS, BOSSES, MONSTERS } from '../src/data/monsters';
import { spawnMonster } from '../src/core/battle';

/** 用同一个种子跑 n 次，统计稀有度分布 */
function sampleRarity(floor: number, n = 20000): Record<string, number> {
  const rng = new Rng(0x5eed1234);
  const out: Record<string, number> = { normal: 0, magic: 0, rare: 0, boss: 0 };
  for (let i = 0; i < n; i++) out[rollMonsterRarity(rng, floor)]! += 1;
  return out;
}

describe('妖纹数据（REQ §3 第 8 条）', () => {
  it(
    '数据表契约校验必须为空（lifeInc ≥ 0 / 类别通用池非空 / id 唯一）',
    () => {
    // D153：负 `lifeInc` 的唯一生产者（疾行）已删，契约收窄成「气血只能加」。
    // 这条测试的价值不是「现在没报错」，而是**将来谁把负值偷偷塞回来会立刻红** ——
    // 且报错文案里带 id 与当前值，不用去翻数据表。
    expect(validateMonsterAffixes()).toEqual([]);
  });
  it('11 条（7 条通用 + 4 条深层专属），id 唯一，每类 ≥1（D151 删了疾行）', () => {
    // D148：A 批加 4 条深层专属（炽/蛮/磐/噬）。它们按**通道归属**落类别（炽=抗性、磐=气血，
    // 都是防御），所以类别不再等量 —— 结构性不变量是「每类至多 1 条」（同时永远不会
    // 出现「四条全叠伤害」），而不是「每类等量」。
    expect(MONSTER_AFFIX_DEFS.length).toBe(11);
    const ids = MONSTER_AFFIX_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(11);
    // D151：**不钉具体条数**（条数是内容侧随时调的量，钉死等于替策划签字）。
    // 钉的是结构不变量：每类 ≥1（某类被清空 = 该类掷不出来了，是真回归）+ id 唯一。
    for (const cat of MONSTER_AFFIX_CATEGORIES) {
      expect(MONSTER_AFFIX_DEFS.filter((d) => d.category === cat).length).toBeGreaterThanOrEqual(1);
      expect(MONSTER_AFFIX_CATEGORY_NAME[cat].length).toBeGreaterThan(0);
    }
    // 速度类现在只剩 `xun` 一条（D151 删了 `ji`）。若有人再加纯移速条目，这条会红 ——
    // 那正是我们要的：移速在挂机里既不加威胁也不加收益（见 monster-affixes.ts 的注释）。
    expect(MONSTER_AFFIX_DEFS.filter((d) => d.category === 'speed').map((d) => d.id)).toEqual(['xun']);
    // 层段过滤：层 1~27 只有 7 条通用妖纹，层 28 起才有 11 条。
    expect(affixesForFloor(1).length).toBe(7);
    expect(affixesForFloor(27).length).toBe(7);
    expect(affixesForFloor(28).length).toBe(11);
    expect(affixesForFloor(Number.NaN).length).toBe(7);
  });

  it('深层专属妖纹只在层 28+ 掷出（层 1~27 抽样 2000 次一条都不出现）', () => {
    // D148：这是「层段过滤真的生效」的唯一证据 —— 只测 `affixesForFloor` 的长度
    // 证明不了掷档路径用的是它（`rollMonsterAffixIds` 才是消费者）。
    const deep = new Set(['chi', 'man', 'pan', 'shi-deep']);
    const rngA = new Rng(90210);
    let shallowHits = 0;
    let deepFloorHits = 0;
    for (let i = 0; i < 2000; i++) {
      const ids = rollMonsterAffixIds(rngA, 1 + (i % 27), i % 3 === 0 ? 'rare' : 'magic');
      if (ids.some((id) => deep.has(id))) shallowHits += 1;
    }
    const rngB = new Rng(90210);
    for (let i = 0; i < 2000; i++) {
      const ids = rollMonsterAffixIds(rngB, 28 + (i % 40), i % 3 === 0 ? 'rare' : 'magic');
      if (ids.some((id) => deep.has(id))) deepFloorHits += 1;
    }
    expect(shallowHits).toBe(0);
    expect(deepFloorHits).toBeGreaterThan(300); // 12 条里 4 条是深层 ⇒ 期望 ~1/3 的怪带一条
  });

  it('深处的「噬」是数量 0.20，不与「噬宝 / 贪婪」混为一谈（id 不同）', () => {
    expect(getMonsterAffix('shi-deep')?.dropBonus).toBeCloseTo(0.2, 6);
    expect(getMonsterAffix('shi')?.name).toBe('噬宝');
    expect(getMonsterAffix('shi-deep')?.name).toBe('噬');
    expect(isMonsterAffixId('shi-deep')).toBe(true);
    expect(isMonsterAffixId('shi')).toBe(true);
    // 抗性通道：炽(0.35) + 已有的厚皮(0.20) + 噬宝(0.15) 若同现会被加法汇总钳住
    expect(sumMonsterAffixes(['chi']).resistInc).toBeCloseTo(0.35, 6);
    // 蛮：+70% 攻但出手间隔 ×1.5（D148 的「慢而重」；0.80 → 0.70 是 D148 校准，
    // 让 c3 死亡/小时从 15.68 回到 13.97）。**断言读的是数据表本身**，
    // 不写死数字 —— 校准是数值侧的事，测试只钉「通道与结构」。
    expect(sumMonsterAffixes(['man']).damageInc ?? 0).toBeCloseTo(getMonsterAffix('man')?.damageInc ?? 0, 6);
    expect(sumMonsterAffixes(['man']).damageInc ?? 0).toBeGreaterThan(0.5);
    expect(sumMonsterAffixes(['man']).intervalMul).toBeCloseTo(1.5, 6);
    // 磐：气血 +140%（D148 校准：1.50 → 1.40，1.50 会把首撞层压到 40 破硬线）
    expect(sumMonsterAffixes(['pan']).lifeInc).toBeCloseTo(1.4, 6);
  });

  it('四条妖纹的数量加成钳到 MONSTER_QTY_CAP = 0.24', () => {
    // 贪婪(0.12) + 任意三条 0.05 = 0.27 → 钳到 0.24
    const sum = sumMonsterAffixes(['tan', 'sha', 'hou', 'chi']);
    expect(sum.dropBonus).toBe(MONSTER_QTY_CAP);
    expect(sumMonsterAffixes(['tan']).dropBonus).toBeCloseTo(0.12, 6);
    expect(sumMonsterAffixes([]).dropBonus).toBe(0);
  });

  it('空/脏 id 一律安静判否，不抛也不产生效果', () => {
    expect(sumMonsterAffixes(undefined)).toEqual({
      damageInc: 0,
      lifeInc: 0,
      armorInc: 0,
      resistInc: 0,
      intervalMul: 1,
      dropBonus: 0,
    });
    expect(sumMonsterAffixes(['nope', '', 'sha']).damageInc).toBeCloseTo(0.3, 6);
    expect(isMonsterAffixId('sha')).toBe(true);
    expect(isMonsterAffixId('nope')).toBe(false);
    expect(isMonsterAffixId(7)).toBe(false);
    expect(getMonsterAffix('nope')).toBeUndefined();
  });

  it('条数 ↔ 稀有度双向一致（普通 0 / 魔法 1~2 / 稀有 3~4）', () => {
    expect(affixCountRange('normal')).toEqual([0, 0]);
    expect(affixCountRange('magic')).toEqual([1, 2]);
    expect(affixCountRange('rare')).toEqual([3, 4]);
    expect(affixCountRange('boss')).toEqual([0, 0]);
    expect(rarityOfAffixCount(0)).toBe('normal');
    expect(rarityOfAffixCount(1)).toBe('magic');
    expect(rarityOfAffixCount(2)).toBe('magic');
    expect(rarityOfAffixCount(3)).toBe('rare');
    expect(rarityOfAffixCount(4)).toBe('rare');
    expect(rarityOfAffixCount(Number.NaN)).toBe('normal');
  });

  it('展示串最多两个名字 + 「+N」，没妖纹返回空串', () => {
    expect(monsterAffixSuffix([])).toBe('');
    expect(monsterAffixSuffix(undefined)).toBe('');
    expect(monsterAffixSuffix(['sha'])).toBe(' · 凶煞');
    expect(monsterAffixSuffix(['sha', 'hou'])).toBe(' · 凶煞·厚皮');
    expect(monsterAffixSuffix(['sha', 'hou', 'chi'])).toBe(' · 凶煞·厚皮 +1');
  });
});

describe('掷档（每只独立，四段递增）', () => {
  it('分段概率与 shuzhi v4.44 定稿一致', () => {
    expect(RARITY_BRACKETS.map((b) => [b.minFloor, b.magic, b.rare])).toEqual([
      [1, 0.08, 0.01],
      [10, 0.1, 0.02],
      [19, 0.12, 0.03],
      [28, 0.15, 0.04],
    ]);
    expect(rarityBracketAt(1).magic).toBe(0.08);
    expect(rarityBracketAt(9).magic).toBe(0.08);
    expect(rarityBracketAt(10).magic).toBe(0.1);
    expect(rarityBracketAt(27).rare).toBe(0.03);
    expect(rarityBracketAt(28).rare).toBe(0.04);
    expect(rarityBracketAt(999).rare).toBe(0.04);
    // 脏层号按第 1 层算
    expect(rarityBracketAt(Number.NaN).magic).toBe(0.08);
  });

  it('实测分布落在目标 ±2pp（层 1 / 10 / 19 / 28）', () => {
    for (const floor of [1, 10, 19, 28]) {
      const b = rarityBracketAt(floor);
      const got = sampleRarity(floor);
      const n = 20000;
      expect(Math.abs(got.magic! / n - b.magic)).toBeLessThan(0.02);
      expect(Math.abs(got.rare! / n - b.rare)).toBeLessThan(0.02);
      expect(Math.abs(got.normal! / n - (1 - b.magic - b.rare))).toBeLessThan(0.02);
      expect(got.boss).toBe(0);
    }
  });

  it('镇守不经过掷档（永远 boss 且零妖纹）', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) {
      const id = rollMonsterIdentity(rng, 20, true);
      expect(id.rarity).toBe('boss');
      expect(id.affixIds).toEqual([]);
    }
  });

  it('条数区间正确：magic 1~2、rare 3~4、normal 0', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 300; i++) {
      const n = rollMonsterAffixIds(rng, 30, 'magic').length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
    for (let i = 0; i < 300; i++) {
      const n = rollMonsterAffixIds(rng, 30, 'rare').length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(rollMonsterAffixIds(rng, 30, 'normal')).toEqual([]);
    expect(rollMonsterAffixIds(rng, 30, 'boss')).toEqual([]);
  });

  it('同类互斥：稀有怪的 3~4 条妖纹类别互不相同（结构防「四层叠伤害」）', () => {
    const rng = new Rng(0xab1e);
    for (let i = 0; i < 2000; i++) {
      const ids = rollMonsterAffixIds(rng, 30, 'rare');
      const cats = ids.map((id) => getMonsterAffix(id)!.category);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });

  it('同种子可复现（掷档不能引入时间/全局状态）', () => {
    const a = rollMonsterIdentity(new Rng(1234), 21, false);
    const b = rollMonsterIdentity(new Rng(1234), 21, false);
    expect(a).toEqual(b);
  });
});

describe('spawnMonster 应用妖纹', () => {
  const def = MONSTERS[0]!;

  it('不传妖纹时与公式逐位相同（向后兼容硬断言）', () => {
    const m = spawnMonster(def, 12, 1, 100, 100);
    const m2 = spawnMonster(def, 12, 1, 100, 100, 'normal', []);
    expect(m.maxHp).toBe(m2.maxHp);
    expect(m.damage).toBe(m2.damage);
    expect(m.xp).toBe(m2.xp);
    expect(m.armor).toBe(m2.armor);
    expect(m.speed).toBe(m2.speed);
    expect(m.attackInterval).toBe(m2.attackInterval);
  });

  it('伤害 / 气血 / 护体 / 移速 / 出手间隔各自生效', () => {
    const base = spawnMonster(def, 12, 1, 100, 100);
    expect(spawnMonster(def, 12, 1, 100, 100, 'magic', ['sha']).damage).toBeGreaterThan(
      base.damage,
    );
    expect(spawnMonster(def, 12, 1, 100, 100, 'magic', ['jian']).maxHp).toBeGreaterThan(
      base.maxHp,
    );
    // 厚皮走**抗性**通道（D97：原本是护甲 `armorInc 1.0`，实测近乎死词条 ——
    // 玩家伤害全部带五行标签，`mitigationOf` 里护甲只占 30% 权重，
    // 护甲翻倍对元素伤害只让 TTK +0.6~2.8%，且 15 只怪里 2 只 `armor === 0` 翻了还是 0）
    const hou = spawnMonster(def, 12, 1, 100, 100, 'magic', ['hou']);
    expect(hou.armor).toBe(base.armor);
    const resKeys = Object.keys(base.resist ?? {});
    expect(resKeys.length).toBeGreaterThan(0);
    for (const k of resKeys) {
      const before = (base.resist as Record<string, number>)[k]!;
      const after = (hou.resist as Record<string, number>)[k]!;
      expect(after).toBeCloseTo(before * 1.2, 6);
    }
    // D151：`ji`（疾行）整条删除 —— 实测它是净负面假词条（击杀率不升反降 2.4%、
    // 承伤/kill 单调 +5.7%，机制见 monster-affixes.ts 顶部注释）。移速通道一并删除，
    // 所以**任何妖纹都不许再改 `speed`**：这条断言就是防它复活。
    for (const id of ['xun', 'sha', 'pan']) {
      expect(spawnMonster(def, 12, 1, 100, 100, 'magic', [id]).speed).toBe(base.speed);
    }
    expect(
      spawnMonster(def, 12, 1, 100, 100, 'magic', ['xun']).attackInterval,
    ).toBeLessThan(base.attackInterval);
    // 狂怒：伤害更高但出手更慢
    const kuang = spawnMonster(def, 12, 1, 100, 100, 'magic', ['kuang']);
    expect(kuang.damage).toBeGreaterThan(base.damage);
    expect(kuang.attackInterval).toBeGreaterThan(base.attackInterval);
  });

  it('`lifeInc` 通道真被 spawnMonster 消费，且 maxHp 地板不会吞掉幅度', () => {
    // D151 删掉了唯一的负 lifeInc 条目（疾行），所以「负值会不会被地板钳住」当前不可直接测。
    // 但**通道本身必须是活的**：用正 lifeInc（坚韧）证明乘数真被吃到，并证明最薄的怪
    // 在层 1 的血量远高于地板 —— 将来谁加回负值条目，这条会立刻暴露「-90% 也照样 1 血」。
    const thinnest = [...MONSTERS, ...BOSSES]
      .filter((d) => !d.boss)
      .reduce((a, b) => (a.hpMul <= b.hpMul ? a : b));
    const life = getMonsterAffix('jian')?.lifeInc ?? 0;
    expect(life).toBeGreaterThan(0);
    const plain = spawnMonster(thinnest, 1, 1, 100, 100);
    const jian = spawnMonster(thinnest, 1, 1, 100, 100, 'magic', ['jian']);
    expect(plain.maxHp).toBeGreaterThan(10); // 地板不参与（否则这条测试没有意义）
    expect(jian.maxHp).toBeCloseTo(plain.maxHp * (1 + life), 0);
    expect(jian.maxHp).toBeGreaterThan(plain.maxHp);
  });
  it('四类妖纹的最坏个体单位时间 DPS 不超过 1.63×（shuzhi 的红线）', () => {
    const base = spawnMonster(def, 27, 1, 100, 100);
    let worst = 0;
    // 最坏组合 = 伤害最强 × 出手最快：两种都枚举，不靠"想当然"
    for (const dmg of ['sha', 'kuang']) {
      for (const spd of ['xun']) {
        const m = spawnMonster(def, 27, 1, 100, 100, 'rare', [dmg, spd]);
        // D150：`ji` 已从「纯移速」改成「快但脆」（interval 0.85 / life −0.20），
        // `xun` 才是纯出手频率。两条都进最坏组合枚举。
        const dps = m.damage / m.attackInterval;
        const ratio = dps / (base.damage / base.attackInterval);
        worst = Math.max(worst, ratio);
      }
    }
    expect(worst).toBeLessThanOrEqual(1.63);
    expect(worst).toBeGreaterThan(1.0);
  });

  it('噬宝把五行抗性按 increased 放大，空抗性表不新增键', () => {
    const boss = BOSSES[0]!;
    const m = spawnMonster(boss, 10, 1, 100, 100, 'boss', ['shi']);
    const keys = Object.keys(m.resist);
    for (const k of keys) {
      const base = boss.resist?.[k as keyof typeof boss.resist];
      if (typeof base === 'number') {
        // D97：0.25 → 0.15，因为和 `厚皮`（抗性 +20%）共用同一个通道
        expect(m.resist[k as keyof typeof m.resist]!).toBeCloseTo(base * 1.15, 6);
      }
    }
    // 两条同时在身：resistInc 是加法汇总 ⇒ ×1.35（不是 1.2×1.15 = 1.38）
    const both = spawnMonster(boss, 10, 1, 100, 100, 'boss', ['hou', 'shi']);
    for (const k of Object.keys(both.resist)) {
      const base = boss.resist?.[k as keyof typeof boss.resist];
      if (typeof base === 'number') {
        expect(both.resist[k as keyof typeof both.resist]!).toBeCloseTo(base * 1.35, 6);
      }
    }
    const noResist = MONSTERS.find((d) => !d.resist || Object.keys(d.resist).length === 0);
    if (noResist) {
      expect(Object.keys(spawnMonster(noResist, 5, 1, 0, 0, 'magic', ['shi']).resist)).toEqual(
        [],
      );
    }
  });

  it('每只怪都至少有一条五行抗性（否则 `厚皮`/`噬宝` 会被安静吞掉）', () => {
    // D97：这两条妖纹现在都作用在抗性通道上。没有抗性表的怪会让它们变成死词条，
    // 而这种失效**不会报错** —— 只会让变强/变弱的观察结果无从解释。
    const bare = ALL_MONSTERS.filter((d) => !d.resist || Object.keys(d.resist).length === 0);
    expect(bare.map((d) => d.id)).toEqual([]);
  });
});
