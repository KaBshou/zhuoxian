// 图鉴（D87）—— 收集进度的唯一真相来源在 core/codex.ts，这里钉住它的契约。
//
// 为什么它值得单独一组测试：图鉴有两条"不会报错但会毁掉体验"的失败模式：
//   ① 存档里出现未知 id / 重复 id → 进度显示超过 100%，或者面板出现空名字；
//   ② 顺序按"解锁先后"排 → 同一个存档在不同机器上行号不同，说"第 3 行"指不清。
// 这两条都只能靠测试钉，靠人眼看面板是看不出来的。
import { describe, expect, it } from 'vitest';
import {
  CODEX_LEGENDARY_TOTAL,
  CODEX_MONSTER_TOTAL,
  CODEX_TOTAL,
  CODEX_VARIANT_TOTAL,
  codexEntries,
  codexProgress,
  codexUnlockText,
  createCodex,
  hasLegendary,
  hasMonster,
  moveCodexCursor,
  recordLegendary,
  recordMonsterKill,
  sanitizeCodex,
} from '../src/core/codex';
import { ALL_MONSTERS } from '../src/data/monsters';
import { ALL_LEGENDARY_DEFS } from '../src/data/legendary';
import { codexPanelHeight, drawCodexPanel } from '../src/render/codex-panel';
import { createSession, sessionAchievementFacts, tickSession } from '../src/core/session';
import { makeItem } from '../src/core/item';
import { Rng } from '../src/core/rng';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const MONSTER_IDS = ALL_MONSTERS.map((m) => m.id);
const LEGENDARY_IDS = ALL_LEGENDARY_DEFS.map((l) => l.id);

describe('图鉴：数据与总数', () => {
  it('总数由数据表决定，不是写死的 15 / 9', () => {
    expect(CODEX_MONSTER_TOTAL).toBe(MONSTER_IDS.length);
    expect(CODEX_LEGENDARY_TOTAL).toBe(LEGENDARY_IDS.length);
    expect(CODEX_TOTAL).toBe(MONSTER_IDS.length + LEGENDARY_IDS.length + CODEX_VARIANT_TOTAL);
    expect(CODEX_TOTAL).toBeGreaterThan(10); // 哨兵：数据表被清空时这条会红
  });

  it('空图鉴：进度 0%，条目全锁', () => {
    const c = createCodex();
    const p = codexProgress(c);
    expect(p.total).toEqual({ got: 0, total: CODEX_TOTAL });
    expect(p.percent).toBe(0);
    const rows = codexEntries(c);
    expect(rows.length).toBe(CODEX_TOTAL);
    expect(rows.every((e) => !e.unlocked)).toBe(true);
  });
});

describe('图鉴：收录', () => {
  it('收录一只浊物；重复收录返回原对象（热路径不复制）', () => {
    const first = MONSTER_IDS[0];
    const a = recordMonsterKill(createCodex(), first);
    expect(hasMonster(a, first)).toBe(true);
    const b = recordMonsterKill(a, first);
    expect(b).toBe(a); // 同一个引用：击杀是热路径，每题都复制没必要
  });

  it('不认识的 id 安静丢掉，不抛', () => {
    const c = createCodex();
    expect(recordMonsterKill(c, 'not-a-monster')).toBe(c);
    expect(recordLegendary(c, 'not-a-legendary')).toBe(c);
    expect(recordMonsterKill(c, '')).toBe(c);
  });

  it('收录顺序永远按数据表，不按击杀先后', () => {
    // 反着杀：后一只先录
    let c = createCodex();
    c = recordMonsterKill(c, MONSTER_IDS[3]);
    c = recordMonsterKill(c, MONSTER_IDS[1]);
    expect(c.monsters).toEqual([MONSTER_IDS[1], MONSTER_IDS[3]]);
  });

  it('传奇同理，且与浊物互不干扰', () => {
    let c = createCodex();
    c = recordLegendary(c, LEGENDARY_IDS[2]);
    expect(c.monsters).toEqual([]);
    expect(hasLegendary(c, LEGENDARY_IDS[2])).toBe(true);
    expect(codexProgress(c).legendaries.got).toBe(1);
    expect(codexProgress(c).monsters.got).toBe(0);
  });

  it('收录播报文案区分浊物与传奇', () => {
    expect(codexUnlockText('monster', '坊市怨客')).toContain('遭遇');
    expect(codexUnlockText('legendary', '太一余烬')).toContain('传奇');
  });
});

describe('图鉴：读档清洗（脏值不许把面板打崩）', () => {
  it('非数组/undefined/垃圾 → 空图鉴', () => {
    for (const bad of [undefined, null, 42, 'x', {}, { monsters: 'nope' }]) {
      expect(sanitizeCodex(bad)).toEqual({ monsters: [], legendaries: [], variants: [] });
    }
  });

  it('未知 id、重复 id、非字符串一律丢掉', () => {
    const c = sanitizeCodex({
      monsters: [MONSTER_IDS[2], MONSTER_IDS[2], 'ghost', 7, null, MONSTER_IDS[0]],
      legendaries: [LEGENDARY_IDS[1], 'ghost', false],
    });
    expect(c.monsters).toEqual([MONSTER_IDS[0], MONSTER_IDS[2]]);
    expect(c.legendaries).toEqual([LEGENDARY_IDS[1]]);
  });

  it('进度永远不超过 100%（灌 3 倍重复 id）', () => {
    const many = [...MONSTER_IDS, ...MONSTER_IDS, ...MONSTER_IDS];
    const p = codexProgress(sanitizeCodex({ monsters: many, legendaries: LEGENDARY_IDS, variants: ['variant'] }));
    expect(p.monsters.got).toBe(CODEX_MONSTER_TOTAL);
    expect(p.percent).toBe(100);
    expect(p.total.got).toBe(CODEX_TOTAL);
  });

  it('百分比向下取整：差一条也不显示 100%', () => {
    const all = sanitizeCodex({ monsters: MONSTER_IDS, legendaries: LEGENDARY_IDS }); // 差的就是异变体那一行
    const p = codexProgress(all);
    expect(p.total.got).toBe(CODEX_TOTAL - 1);
    expect(p.percent).toBeLessThan(100);
  });
});

describe('图鉴：条目与光标', () => {
  it('固定顺序：浊物在前、传奇在后，名字不是空的', () => {
    const rows = codexEntries(createCodex());
    expect(rows.slice(0, CODEX_MONSTER_TOTAL).every((e) => e.kind === 'monster')).toBe(true);
    expect(rows[CODEX_MONSTER_TOTAL]?.kind).toBe('variant'); // D160：异变体独立一行，夹在浊物与传奇之间
    expect(rows.slice(CODEX_MONSTER_TOTAL + 1).every((e) => e.kind === 'legendary')).toBe(true);
    expect(rows.every((e) => e.name.length > 0)).toBe(true);
  });

  it('未收录不剧透数值：detail 是「尚未遭遇 / 尚未获得」', () => {
    const rows = codexEntries(createCodex());
    expect(rows.filter((e) => e.kind === 'monster').every((e) => e.detail === '尚未遭遇')).toBe(true);
    expect(rows.filter((e) => e.kind === 'legendary').every((e) => e.detail === '尚未获得')).toBe(true);
  });

  it('收录后才有数值/描述（浊物带阶位，传奇带描述）', () => {
    const c = sanitizeCodex({ monsters: [MONSTER_IDS[0]], legendaries: [LEGENDARY_IDS[0]] });
    const rows = codexEntries(c);
    const m = rows.find((e) => e.id === MONSTER_IDS[0]);
    const l = rows.find((e) => e.id === LEGENDARY_IDS[0]);
    expect(m?.unlocked).toBe(true);
    expect(m?.detail).toContain('阶');
    expect(l?.unlocked).toBe(true);
    expect(l?.detail).not.toBe('尚未获得');
    expect(l?.detail.length).toBeGreaterThan(0);
  });

  it('光标夹取不环绕：负 → 0，超长 → 末行，脏值 → 0', () => {
    expect(moveCodexCursor(0, -3, CODEX_TOTAL)).toBe(0);
    expect(moveCodexCursor(CODEX_TOTAL - 1, 5, CODEX_TOTAL)).toBe(CODEX_TOTAL - 1);
    expect(moveCodexCursor(Number.NaN, 1, CODEX_TOTAL)).toBe(0);
    expect(moveCodexCursor(3, Number.NaN, CODEX_TOTAL)).toBe(3);
    expect(moveCodexCursor(0, 1, 0)).toBe(0); // count 脏值也不能返回 -1
  });
});

describe('图鉴：面板几何', () => {
  it('24 行放得进 960×540 战场（没有滚动条，溢出就是画到屏幕外）', () => {
    const h = codexPanelHeight(createCodex());
    expect(h).toBeLessThan(540);
    expect(h).toBeGreaterThan(200);
  });

  it('drawCodexPanel 在离屏 ctx 上能跑通并返回行数', () => {
    // 用最小的假 ctx：只记录调用，不做像素断言（像素断言交给探针）
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      fillRect: () => calls.push('fillRect'),
      strokeRect: () => calls.push('strokeRect'),
      fillText: (t: string) => calls.push('text:' + t),
      set fillStyle(_v: string) {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set font(_v: string) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
    } as unknown as CanvasRenderingContext2D;
    const r = drawCodexPanel(ctx, createCodex(), 960, 540, 0);
    expect(r.rows).toBe(CODEX_TOTAL);
    expect(r.total).toBe(CODEX_TOTAL);
    expect(r.cursor).toBe(0);
    expect(calls.filter((c) => c === 'fillRect').length).toBeGreaterThanOrEqual(2); // 面板底 + 光标高亮
    expect(calls.some((c) => c === 'text:图鉴')).toBe(true);
  });
});

describe('图鉴：接到 session（击杀/拾取真的会收录）', () => {
  it('新号图鉴为空', () => {
    const s = createSession({ classId: 'yujian', seed: 99, tables: TABLES });
    expect(s.codex).toEqual({ monsters: [], legendaries: [], variants: [] });
  });

  it('打一会儿就有浊物进图鉴，且 id 全合法', () => {
    const s = createSession({ classId: 'yujian', seed: 20261021, tables: TABLES });
    for (let i = 0; i < 60 * 60 && s.kills < 6; i++) tickSession(s, 1 / 60);
    expect(s.kills).toBeGreaterThan(0);
    expect(s.codex.monsters.length).toBeGreaterThan(0);
    for (const id of s.codex.monsters) expect(MONSTER_IDS).toContain(id);
    // 收录条数不能超过"遇到过的种类数"上限
    expect(s.codex.monsters.length).toBeLessThanOrEqual(CODEX_MONSTER_TOTAL);
  });

  it('地上躺着带传奇的法宝 → 自动拾取后收录传奇（判定用掉落物本身）', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    const item = makeItem(
      { slot: 'sword', rarity: 'xian', ilvl: 20, name: '测试仙剑', legendary: LEGENDARY_IDS[0] },
      new Rng(3),
    );
    s.ground.push({ id: 999, x: 480, y: 270, item, age: 0, picked: false });
    for (let i = 0; i < 60 * 5; i++) tickSession(s, 1 / 60);
    expect(s.ground.some((g) => g.id === 999)).toBe(false); // 已经被捡走
    expect(hasLegendary(s.codex, LEGENDARY_IDS[0])).toBe(true);
    // D168：仙品也计入「累计获得件数」（成就 xian-80 的度量）——
    // 与图鉴同一处记账，避免「图鉴收了但成就没算」的第二套口径。
    expect(sessionAchievementFacts(s).xianFound).toBe(1);
  });

  it('D168：xianFound 累计件数，不等于身上同时装备数', () => {
    const s = createSession({ classId: 'yujian', seed: 7, tables: TABLES });
    for (let n = 1; n <= 3; n += 1) {
      const item = makeItem(
        { slot: 'sword', rarity: 'xian', ilvl: 20, name: `测试仙剑 ${n}`, legendary: LEGENDARY_IDS[0] },
        new Rng(10 + n),
      );
      s.ground.push({ id: 900 + n, x: 480, y: 270, item, age: 0, picked: false });
      for (let i = 0; i < 60 * 3; i++) tickSession(s, 1 / 60);
    }
    const facts = sessionAchievementFacts(s);
    expect(facts.xianFound).toBe(3);
    expect(facts.xianEquipped).toBeLessThanOrEqual(1); // 同一槽位只有一件能穿
  });
});

describe('D170 护栏：数据侧的「不可能发生」由测试保证', () => {
  it('MONSTERS + BOSSES 里每个 id 都被图鉴认（否则「未知 id + variant」那条通融分支会被产品路径走到）', () => {
    // 这条防的不是逻辑，是数据：只要有一个拼错的 id，玩家就会在没见到异变体时白拿那一行。
    // 与 D97 的「每只怪至少一条五行抗性」同一类 —— 把「不可能发生」变成「测试保证不可能发生」。
    for (const def of ALL_MONSTERS) {
      const c = recordMonsterKill(createCodex(), def.id);
      expect(c.monsters, `怪 id 未被图鉴认：${def.id}`).toContain(def.id);
    }
  });
});