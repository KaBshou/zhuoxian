// D148（shuzhi v4.66 定稿）：A 批 —— 层 28+ 专属妖纹 4 条 + 二阶重复元素 土 → 金
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, raw, t) => {
  const crlf = raw.includes('\r\n');
  fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
};

// ── ① monster-affixes.ts：加 minFloor 字段 + 4 条深层妖纹 ──
{
  const p = 'src/data/monster-affixes.ts';
  const raw = read(p);
  let t = raw.replace(/\r\n/g, '\n');

  const a1 = '  /** 掉落**数量**加成（累加后钳到 `MONSTER_QTY_CAP`） */\n  readonly dropBonus: number;\n}';
  const b1 = [
    '  /** 掉落**数量**加成（累加后钳到 `MONSTER_QTY_CAP`） */',
    '  readonly dropBonus: number;',
    '  /**',
    '   * 从第几层起进入掷档池（省略 = 1，即全层可用）。',
    '   * D148：深层专属妖纹只在这个池子里，避免「层 1 的新手遇到 `磐`（气血 ×2.5）」。',
    '   */',
    '  readonly minFloor?: number;',
    '}',
  ].join('\n');
  if (!t.includes(a1)) throw new Error('MISS interface');
  t = t.replace(a1, b1);

  const a2 = "];\n\nconst AFFIX_BY_ID";
  const b2 = [
    '  // ── 深层专属（D148，层 28+ 才进池）：shuzhi v4.66 的 A 批 —— 不加新通道，',
    '  // 只用已有的 resist / damage / interval / life / dropBonus 五个通道，',
    '  // 每条都把单一通道推到「明显能感觉到」的量级，而不是再摊一层 5%。',
    '  // 为什么不给「每 N 秒给玩家上浊气」：浊气满 → 浊化 5s 伤害 ×2 → 净效应是先送 +100%',
    '  // 输出再罚虚弱（易成正反馈），且浊化 uptime 实测 8.2~8.3%，一动会让深层 TTK 摆 ±30%，',
    '  // 直接作废 §16/§20 的整条基线；更重要是它需要引擎钩子，而 A 批的全部优势是「只改数据」。',
    '  {',
    "    id: 'chi',",
    "    name: '炽',",
    "    category: 'defense',",
    "    desc: '浊火在骨缝里烧了几百年，五行打上去大半被烤散了。',",
    '    resistInc: 0.35,',
    '    dropBonus: 0.05,',
    '    minFloor: DEEP_AFFIX_MIN_FLOOR,',
    '  },',
    '  {',
    "    id: 'man',",
    "    name: '蛮',",
    "    category: 'damage',",
    "    desc: '一具被浊气撑大的躯壳，抡起来砸得慢，可砸中一次就够。',",
    '    damageInc: 0.8,',
    '    intervalMul: 1.5,',
    '    dropBonus: 0.05,',
    '    minFloor: DEEP_AFFIX_MIN_FLOOR,',
    '  },',
    '  {',
    "    id: 'pan',",
    "    name: '磐',",
    "    category: 'defense',",
    "    desc: '整块浊石化成，刀砍进去只留一道白痕。',",
    '    lifeInc: 1.5,',
    '    dropBonus: 0.05,',
    '    minFloor: DEEP_AFFIX_MIN_FLOOR,',
    '  },',
    '  {',
    "    id: 'shi-deep',",
    "    name: '噬',",
    "    category: 'economy',",
    "    desc: '肚里消化着别人的家当，杀了它能一次掏出来。',",
    '    dropBonus: 0.2,',
    '    minFloor: DEEP_AFFIX_MIN_FLOOR,',
    '  },',
    '];',
    '',
    'const AFFIX_BY_ID',
  ].join('\n');
  if (!t.includes(a2)) throw new Error('MISS array end');
  t = t.replace(a2, b2);

  // 常量 + 池子辅助函数（放在 MONSTER_QTY_CAP 之后）
  const a3 = '/** 一只怪合计的数量加成上限（shuzhi 定稿；`LOOT_QUANTITY_CAP 0.58` 不动） */\nexport const MONSTER_QTY_CAP = 0.24;';
  const b3 = [
    '/** 一只怪合计的数量加成上限（shuzhi 定稿；`LOOT_QUANTITY_CAP 0.58` 不动） */',
    'export const MONSTER_QTY_CAP = 0.24;',
    '',
    '/**',
    ' * 深层专属妖纹的起始层（D148）。与 `threatMul` 的斜坡同段（层 22 起渐进门禁、',
    ' * 层 28 起进精英池）—— 层 22~27 是「威胁变疼」，层 28+ 是「精英变硬」，两个梯度不重叠。',
    ' */',
    'export const DEEP_AFFIX_MIN_FLOOR = 28;',
    '',
    '/** 某一层可用的妖纹池（层号脏值按第 1 层算） */',
    'export function affixesForFloor(floor: number): readonly MonsterAffixDef[] {',
    '  const f = Number.isFinite(floor) ? Math.max(1, Math.floor(floor)) : 1;',
    '  return MONSTER_AFFIX_DEFS.filter((d) => f >= (d.minFloor ?? 1));',
    '}',
  ].join('\n');
  if (!t.includes(a3)) throw new Error('MISS cap');
  t = t.replace(a3, b3);

  if (t.length < raw.length) throw new Error('SHRINK affixes');
  write(p, raw, t);
  console.log(`patched ${p}`);
}

// ── ② monster-roll.ts：掷档池按层过滤 ──
{
  const p = 'src/core/monster-roll.ts';
  const raw = read(p);
  let t = raw.replace(/\r\n/g, '\n');

  const a1 = 'import {\n  MONSTER_AFFIX_DEFS,\n  affixCountRange,';
  const b1 = 'import {\n  affixCountRange,\n  affixesForFloor,';
  if (!t.includes(a1)) throw new Error('MISS import');
  t = t.replace(a1, b1);

  const a2 = '  const picked: string[] = [];\n  for (const cat of cats) {\n    if (picked.length >= want) break;\n    const pool = MONSTER_AFFIX_DEFS.filter((d) => d.category === cat);\n    if (pool.length === 0) continue;';
  const b2 = [
    '  // D148：池子按层过滤（深层专属妖纹只在层 28+ 出现）。',
    '  // 注意：**先按层过滤再按类别过滤**，两层过滤都必须发生在抽之前 ——',
    '  // 若先抽到 `磐` 再被层过滤掉，rare 会掉回 3 条，稀有度与条数就对不上了。',
    '  const floorPool = affixesForFloor(floor);',
    '  const picked: string[] = [];',
    '  for (const cat of cats) {',
    '    if (picked.length >= want) break;',
    '    const pool = floorPool.filter((d) => d.category === cat);',
    '    if (pool.length === 0) continue;',
  ].join('\n');
  if (!t.includes(a2)) throw new Error('MISS pool');
  t = t.replace(a2, b2);

  if (t.length < raw.length) throw new Error('SHRINK roll');
  write(p, raw, t);
  console.log(`patched ${p}`);
}

// ── ③ monsters.ts：yaowang-shitong earth → metal ──
{
  const p = 'src/data/monsters.ts';
  const raw = read(p);
  let t = raw.replace(/\r\n/g, '\n');
  const a1 = [
    "    id: 'yaowang-shitong',",
    "    name: '药王侍童',",
    '    tier: 2,',
    "    element: 'earth',",
    '    hpMul: 0.95,',
    '    dmgMul: 0.9,',
    '    armor: 20,',
    '    resist: { resEarth: 0.3, resWood: -0.2 },',
  ].join('\n');
  const b1 = [
    "    id: 'yaowang-shitong',",
    "    name: '药王侍童',",
    '    tier: 2,',
    '    // D148（shuzhi v4.66）：earth → metal。理由：玩家的抗性灵纹只有金/火/水三条',
    '    // （五行 v1 只开这三种，REQ D4）⇒ 木/土属性怪的伤害玩家**无法走抗性通道减免**，',
    '    // 等于永久跳过 §16 里 70% 那一半。原本土在三个阶各重复一次（6/18），',
    '    // 改成「一阶重复土、二阶重复金、三阶重复火」⇒ 土 5/18，不可抗族不再被刻意重复。',
    "    element: 'metal',",
    '    hpMul: 0.95,',
    '    dmgMul: 0.9,',
    '    armor: 20,',
    '    resist: { resMetal: 0.3, resFire: -0.2 },',
  ].join('\n');
  if (!t.includes(a1)) throw new Error('MISS yaowang');
  t = t.replace(a1, b1);
  if (t.length < raw.length) throw new Error('SHRINK monsters');
  write(p, raw, t);
  console.log(`patched ${p}`);
}
