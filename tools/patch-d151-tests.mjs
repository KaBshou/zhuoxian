// D151：删除 `ji`（疾行）后，把 6 条测试同步到「速度类只剩 xun」的新事实。
// 原则：**测试钉结构、数值读数据表**；类别分布从「钉死条数」改成「每类 ≥1 + 速度类只剩 xun」。
import fs from 'node:fs';

const P = 'tests/monster-affixes.test.ts';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const rep = (a, b, tag) => {
  if (!t.includes(a)) throw new Error('MISS[' + tag + ']: ' + a.slice(0, 60));
  t = t.replace(a, b);
};

// ① 条目数与类别分布
rep("  it('12 条（8 条通用 + 4 条深层专属），id 唯一，类别分布 3/4/2/3', () => {",
  "  it('11 条（7 条通用 + 4 条深层专属），id 唯一，每类 ≥1（D151 删了疾行）', () => {", 'title');

rep([
  '    expect(MONSTER_AFFIX_DEFS.length).toBe(12);',
  '    const ids = MONSTER_AFFIX_DEFS.map((d) => d.id);',
  '    expect(new Set(ids).size).toBe(12);',
  '    const perCat = { damage: 3, defense: 4, speed: 2, economy: 3 } as const;',
  '    for (const cat of MONSTER_AFFIX_CATEGORIES) {',
  '      expect(MONSTER_AFFIX_DEFS.filter((d) => d.category === cat).length).toBe(perCat[cat]);',
  '      expect(MONSTER_AFFIX_CATEGORY_NAME[cat].length).toBeGreaterThan(0);',
  '    }',
].join('\n'), [
  '    expect(MONSTER_AFFIX_DEFS.length).toBe(11);',
  '    const ids = MONSTER_AFFIX_DEFS.map((d) => d.id);',
  '    expect(new Set(ids).size).toBe(11);',
  '    // D151：**不钉具体条数**（条数是内容侧随时调的量，钉死等于替策划签字）。',
  '    // 钉的是结构不变量：每类 ≥1（某类被清空 = 该类掷不出来了，是真回归）+ id 唯一。',
  '    for (const cat of MONSTER_AFFIX_CATEGORIES) {',
  '      expect(MONSTER_AFFIX_DEFS.filter((d) => d.category === cat).length).toBeGreaterThanOrEqual(1);',
  '      expect(MONSTER_AFFIX_CATEGORY_NAME[cat].length).toBeGreaterThan(0);',
  "    }",
  '    // 速度类现在只剩 `xun` 一条（D151 删了 `ji`）。若有人再加纯移速条目，这条会红 ——',
  '    // 那正是我们要的：移速在挂机里既不加威胁也不加收益（见 monster-affixes.ts 的注释）。',
  "    expect(MONSTER_AFFIX_DEFS.filter((d) => d.category === 'speed').map((d) => d.id)).toEqual(['xun']);",
].join('\n'), 'counts');

rep([
  '    // 层段过滤：层 1~27 只有 8 条通用妖纹，层 28 起才有 12 条。',
  '    expect(affixesForFloor(1).length).toBe(8);',
  '    expect(affixesForFloor(27).length).toBe(8);',
  '    expect(affixesForFloor(28).length).toBe(12);',
].join('\n'), [
  '    // 层段过滤：层 1~27 只有 7 条通用妖纹，层 28 起才有 11 条。',
  '    expect(affixesForFloor(1).length).toBe(7);',
  '    expect(affixesForFloor(27).length).toBe(7);',
  '    expect(affixesForFloor(28).length).toBe(11);',
].join('\n'), 'floorFilter');

// ② 数量加成钳制：用四条仍在的妖纹
rep("    const sum = sumMonsterAffixes(['tan', 'sha', 'hou', 'ji']);",
  "    const sum = sumMonsterAffixes(['tan', 'sha', 'hou', 'chi']);", 'qty');

// ③ 全零 sum 去掉 speedInc
rep(['      armorInc: 0,', '      speedInc: 0,', '      resistInc: 0,'].join('\n'),
  ['      armorInc: 0,', '      resistInc: 0,'].join('\n'), 'zeroSum');

// ④ 展示串第三条换成仍在的 id
rep("    expect(monsterAffixSuffix(['sha', 'hou', 'ji'])).toBe(' · 凶煞·厚皮 +1');",
  "    expect(monsterAffixSuffix(['sha', 'hou', 'chi'])).toBe(' · 凶煞·厚皮 +1');", 'suffix');

// ⑤ 疾行那一段 → 移速通道已删 + xun 仍生效
rep([
  '    // D150：疾行不再改移速（纯移速通道已删除，实测「有代价无收益」），',
  '    // 改成「快但脆」：出手更快、气血更低。**断言读数据表**，不写死 0.85 / -0.20。',
  "    const jiDef = getMonsterAffix('ji');",
  "    const ji = spawnMonster(def, 12, 1, 100, 100, 'magic', ['ji']);",
  '    expect(ji.speed).toBe(base.speed); // 移速通道已删：再有 speedInc 就是回退',
  '    expect(ji.attackInterval).toBeCloseTo(base.attackInterval * (jiDef?.intervalMul ?? 1), 6);',
  '    expect(ji.attackInterval).toBeLessThan(base.attackInterval);',
  '    expect(ji.maxHp).toBeLessThan(base.maxHp);',
].join('\n'), [
  '    // D151：`ji`（疾行）整条删除 —— 实测它是净负面假词条（击杀率不升反降 2.4%、',
  '    // 承伤/kill 单调 +5.7%，机制见 monster-affixes.ts 顶部注释）。移速通道一并删除，',
  '    // 所以**任何妖纹都不许再改 `speed`**：这条断言就是防它复活。',
  "    for (const id of ['xun', 'sha', 'pan']) {",
  "      expect(spawnMonster(def, 12, 1, 100, 100, 'magic', [id]).speed).toBe(base.speed);",
  '    }',
].join('\n'), 'jiBlock');

// ⑥ 负 lifeInc 的边界测试块整体替换
const negTitle = "  it('`lifeInc` 取负值真能把怪血降下来（不是被 maxHp 地板钳住的死通道）', () => {";
const afterBlock = "  it('四类妖纹的最坏个体单位时间 DPS 不超过 1.63×（shuzhi 的红线）', () => {";
const i0 = t.indexOf(negTitle);
const i1 = t.indexOf(afterBlock);
if (i0 < 0 || i1 < 0 || i1 <= i0) throw new Error('MISS negBlock');
const newBlock = [
  "  it('`lifeInc` 通道真被 spawnMonster 消费，且 maxHp 地板不会吞掉幅度', () => {",
  '    // D151 删掉了唯一的负 lifeInc 条目（疾行），所以「负值会不会被地板钳住」当前不可直接测。',
  '    // 但**通道本身必须是活的**：用正 lifeInc（坚韧）证明乘数真被吃到，并证明最薄的怪',
  '    // 在层 1 的血量远高于地板 —— 将来谁加回负值条目，这条会立刻暴露「-90% 也照样 1 血」。',
  '    const thinnest = [...MONSTERS, ...BOSSES]',
  '      .filter((d) => !d.boss)',
  '      .reduce((a, b) => (a.hpMul <= b.hpMul ? a : b));',
  "    const life = getMonsterAffix('jian')?.lifeInc ?? 0;",
  '    expect(life).toBeGreaterThan(0);',
  '    const plain = spawnMonster(thinnest, 1, 1, 100, 100);',
  "    const jian = spawnMonster(thinnest, 1, 1, 100, 100, 'magic', ['jian']);",
  '    expect(plain.maxHp).toBeGreaterThan(10); // 地板不参与（否则这条测试没有意义）',
  '    expect(jian.maxHp).toBeCloseTo(plain.maxHp * (1 + life), 0);',
  '    expect(jian.maxHp).toBeGreaterThan(plain.maxHp);',
  '  });',
  '',
].join('\n');
t = t.slice(0, i0) + newBlock + t.slice(i1);

// ⑦ 最坏 DPS 枚举里不再有 ji
rep("    for (const spd of ['ji', 'xun']) {", "    for (const spd of ['xun']) {", 'worstSpeed');

fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('patched', P, t.length);
