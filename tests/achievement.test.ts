// 成就（D87）—— 钉住「只发渊痕、一次性、有界、不走战斗」这四条纪律。
//
// 为什么值得单独一组测试：成就有两类不会报错但会毁掉设计的失败模式：
//   ① 发了修为/战力/掉率（进 §2 供给，触发 D64 棘轮刹车 → 整条时间轴作废）；
//   ② 重复结算（同一条成就反复发渊痕 → 渊痕变无限，D45 明令禁止）。
// 这两条靠看面板一个都发现不了。
import { describe, expect, it } from 'vitest';
import {
  achievementEntries,
  achievementProgressText,
  achievementSummary,
  achievementUnlockText,
  createAchievements,
  hasAchievement,
  moveAchievementCursor,
  newlyUnlocked,
  sanitizeAchievements,
  unlockAchievements,
} from '../src/core/achievement';
import {
  ACHIEVEMENT_DEFS,
  ACHIEVEMENT_REWARD_TOTAL,
  ACHIEVEMENT_TOTAL,
  EMPTY_FACTS,
  type AchievementFacts,
} from '../src/data/achievements';
import { achievementPanelHeight, drawAchievementPanel } from '../src/render/achievement-panel';
import { createSession, sessionAchievementFacts, setFloor, tickSession } from '../src/core/session';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const IDS = ACHIEVEMENT_DEFS.map((a) => a.id);

/** 造一份"全部达标"的事实：每条成就都必然满足 */
function factsAllDone(): AchievementFacts {
  return {
    kills: 1_000_000,
    maxFloor: 76,
      clearedFloors: 76,
    codexMonsters: 999,
    codexLegendaries: 999,
    step: 80,
    deaths: 99,
    xianEquipped: 9,
    xianFound: 999,
    cycle: 10,
  };
}

describe('成就：数据契约（阈值与奖励档）', () => {
  it('总数由数据表决定，不是写死的 20', () => {
    expect(ACHIEVEMENT_TOTAL).toBe(ACHIEVEMENT_DEFS.length);
    expect(ACHIEVEMENT_TOTAL).toBeGreaterThan(10); // 哨兵：表被清空时这条会红
  });

  it('id 唯一且非空，名字/描述非空', () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    for (const def of ACHIEVEMENT_DEFS) {
      expect(def.id.length).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.desc.length).toBeGreaterThan(0);
      expect(def.target).toBeGreaterThan(0);
    }
  });

  it('奖励只有 5k / 15k / 30k / 50k 四档，合计 = ACHIEVEMENT_REWARD_TOTAL', () => {
    const allowed = new Set([5000, 15000, 30000, 50000]);
    let sum = 0;
    for (const def of ACHIEVEMENT_DEFS) {
      expect(allowed.has(def.reward)).toBe(true);
      sum += def.reward;
    }
    expect(sum).toBe(ACHIEVEMENT_REWARD_TOTAL);
  });

  it('奖励总量是"分钟级"不是"小时级"（段④ 产出 ~18.7M，成就 < 3%）', () => {
    // 15 627 渊痕/分 ⇒ 39 万 ≈ 25 分钟
    const minutes = ACHIEVEMENT_REWARD_TOTAL / 15627;
    expect(minutes).toBeLessThan(45);
    expect(minutes).toBeGreaterThan(10);
  });

  it('击杀三档是 500 / 3000 / 11000（阈值 = 时间锚 × 击杀速率，不是整千好看）', () => {
    const targets = ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('kill-')).map((d) => d.target);
    expect(targets.sort((a, b) => a - b)).toEqual([500, 3000, 11000]);
  });

  it('层数只留不与通关重复的节点（19 / 55 / 65 / 76）：10 与 28 分别等价于清完 9 层/27 层', () => {
    const targets = ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('floor-')).map((d) => d.target);
    // D145：封顶 76 与 46 之间空了 30 层、约 2h 无刻度 → 补 55 / 65（只给渊痕、一次性、有界）。
    expect(targets.sort((a, b) => a - b)).toEqual([19, 55, 65, 76]);
    // 同事件发两次奖励 = 玩家以为在追两个进度（shuzhi v4.43 定稿）
    expect(ACHIEVEMENT_DEFS.some((d) => d.id === 'floor-10')).toBe(false);
    expect(ACHIEVEMENT_DEFS.some((d) => d.id === 'floor-28')).toBe(false);
  });
});

describe('成就：洗档（存档是玩家能改的）', () => {
  it('脏值一律给空档', () => {
    for (const dirty of [undefined, null, 42, 'x', {}, { unlocked: 'nope' }, { unlocked: [1, 2] }]) {
      expect(sanitizeAchievements(dirty)).toEqual({ unlocked: [] });
    }
  });

  it('未知 id / 重复 / 非字符串安静丢弃', () => {
    const s = sanitizeAchievements({ unlocked: ['kill-1', 'nope', 'kill-1', null, 7, 'floor-19'] });
    expect(s.unlocked).toEqual(['kill-1', 'floor-19']);
  });

  it('顺序按数据表归一（同一个档在不同机器上 JSON 一致）', () => {
    const reversed = [...IDS].reverse();
    expect(sanitizeAchievements({ unlocked: reversed }).unlocked).toEqual(IDS);
  });

  it('灌满三倍重复 id 也不会超过 100%', () => {
    const dup = [...IDS, ...IDS, ...IDS];
    const s = sanitizeAchievements({ unlocked: dup });
    expect(s.unlocked.length).toBe(ACHIEVEMENT_TOTAL);
    expect(achievementSummary(s).percent).toBe(100);
  });

  it('差一条就不到 100%', () => {
    const s = sanitizeAchievements({ unlocked: IDS.slice(0, IDS.length - 1) });
    expect(achievementSummary(s).percent).toBeLessThan(100);
  });
});

describe('成就：条目与进度', () => {
  it('空档：条目全锁、进度只有「脚下第一层」那 1 点', () => {
    const entries = achievementEntries(createAchievements(), EMPTY_FACTS);
    expect(entries.length).toBe(ACHIEVEMENT_TOTAL);
    for (const e of entries) {
      expect(e.unlocked).toBe(false);
      // EMPTY_FACTS.maxFloor = 1（玩家一开始就站在第 1 层）⇒ 「走到第 N 层」的进度都是 1，其余全 0
      expect(e.progress).toBe(e.id.startsWith('floor-') ? 1 : 0);
    }
  });

  it('进度是现算的：kills=499 时击杀第一条只差 1', () => {
    const entries = achievementEntries(createAchievements(), { ...EMPTY_FACTS, kills: 499 });
    const first = entries.find((e) => e.target === 500);
    expect(first?.progress).toBe(499);
  });

  it('进度夹在 [0, target]：超额不显示 3000000/11000', () => {
    const entries = achievementEntries(createAchievements(), factsAllDone());
    for (const e of entries) expect(e.progress).toBeLessThanOrEqual(e.target);
  });

  it('顺序固定（与数据表一致，不受解锁顺序影响）', () => {
    const s = sanitizeAchievements({ unlocked: [IDS[3], IDS[1]] });
    expect(achievementEntries(s, EMPTY_FACTS).map((e) => e.id)).toEqual(IDS);
  });
});

describe('成就：结算（一次性、有界）', () => {
  it('无新达成返回原状态引用（热路径每秒都调）', () => {
    const s = createAchievements();
    const r = unlockAchievements(s, EMPTY_FACTS);
    expect(r.state).toBe(s);
    expect(r.unlocked.length).toBe(0);
  });

  it('全部达标时一次结算，条数 = 总数，奖励合计 = 总表', () => {
    const r = unlockAchievements(createAchievements(), factsAllDone());
    expect(r.unlocked.length).toBe(ACHIEVEMENT_TOTAL);
    expect(r.state.unlocked.length).toBe(ACHIEVEMENT_TOTAL);
    expect(achievementSummary(r.state).rewardsEarned).toBe(ACHIEVEMENT_REWARD_TOTAL);
  });

  it('再结算一次什么都不发（不会重复）', () => {
    const first = unlockAchievements(createAchievements(), factsAllDone());
    const again = unlockAchievements(first.state, factsAllDone());
    expect(again.unlocked.length).toBe(0);
    expect(again.state).toBe(first.state);
    expect(achievementSummary(again.state).rewardsEarned).toBe(ACHIEVEMENT_REWARD_TOTAL);
  });

  it('已达成的不算"新达成"', () => {
    const s = sanitizeAchievements({ unlocked: ['kill-1'] });
    const fresh = newlyUnlocked(s, factsAllDone()).map((d) => d.id);
    expect(fresh).not.toContain('kill-1');
    expect(fresh.length).toBe(ACHIEVEMENT_TOTAL - 1);
  });

  it('解锁文案带名字与奖励', () => {
    const def = ACHIEVEMENT_DEFS[0];
    const text = achievementUnlockText(def);
    expect(text).toContain(def.name);
    expect(text).toContain(String(def.reward));
    expect(text).toContain('渊痕');
  });

  it('进度文案形如 "3 / 20（15%）"', () => {
    const s = sanitizeAchievements({ unlocked: IDS.slice(0, 3) });
    expect(achievementProgressText(achievementSummary(s))).toBe(`3 / ${ACHIEVEMENT_TOTAL}（${Math.floor((3 / ACHIEVEMENT_TOTAL) * 100)}%）`);
  });
});

describe('成就：光标', () => {
  it('夹取不环绕', () => {
    expect(moveAchievementCursor(0, -1, ACHIEVEMENT_TOTAL)).toBe(0);
    expect(moveAchievementCursor(ACHIEVEMENT_TOTAL - 1, 1, ACHIEVEMENT_TOTAL)).toBe(ACHIEVEMENT_TOTAL - 1);
    expect(moveAchievementCursor(0, 1, ACHIEVEMENT_TOTAL)).toBe(1);
  });

  it('非有限数归 0 且不吃这次位移', () => {
    expect(moveAchievementCursor(Number.NaN, 1, ACHIEVEMENT_TOTAL)).toBe(0);
    expect(moveAchievementCursor(2, Number.NaN, ACHIEVEMENT_TOTAL)).toBe(0);
  });

  it('count 为 0 / 脏值时给 0', () => {
    expect(moveAchievementCursor(5, 1, 0)).toBe(0);
    expect(moveAchievementCursor(5, 1, Number.NaN)).toBe(0);
  });
});

describe('成就：接到 session（真打了才发渊痕）', () => {
  it('新号成就为空，事实全 0', () => {
    const s = createSession({ classId: 'yujian', seed: 99, tables: TABLES });
    expect(s.achievements).toEqual({ unlocked: [] });
    const f = sessionAchievementFacts(s);
    expect(f.kills).toBe(0);
    expect(f.deaths).toBe(0);
    expect(f.codexMonsters).toBe(0);
  });

  it('打 60 秒不会白送大额成就，且渊痕只来自真达成的条目', () => {
    const s = createSession({ classId: 'yujian', seed: 20261021, tables: TABLES });
    for (let i = 0; i < 60 * 60; i++) tickSession(s, 1 / 60);
    // 60 秒里 legitimately 可能达成「图鉴收录 5 种」（D145 后每阶 6 只、60s 内能见到 5~6 种），
    // 所以不能断言「一条都不解锁」；要断言的是「没有白送大额条目」+「渊痕 = 已解锁条目的奖励和」。
    expect(s.achievements.unlocked).not.toContain('kill-1');
    const rewardSum = ACHIEVEMENT_DEFS.filter((d) => s.achievements.unlocked.includes(d.id))
      .reduce((sum, d) => sum + d.reward, 0);
    expect(s.character.marks ?? 0).toBe(rewardSum);
    expect(s.character.marks ?? 0).toBeLessThanOrEqual(5000);
  });

  it('达成时只加渊痕，不动修为/战力（D87 铁律）', () => {
    const s = createSession({ classId: 'yujian', seed: 11, tables: TABLES });
    s.kills = 500;
    const before = sessionAchievementFacts(s);
    const expectReward = newlyUnlocked(s.achievements, before).reduce((sum, d) => sum + d.reward, 0);
    expect(expectReward).toBeGreaterThan(0);
    const xpBefore = s.character.xp;
    const stepBefore = s.character.step;
    tickSession(s, 1 / 60);
    expect(s.character.marks ?? 0).toBe(expectReward);
    expect(s.character.xp).toBe(xpBefore);
    expect(s.character.step).toBe(stepBefore);
    expect(hasAchievement(s.achievements, 'kill-1')).toBe(true);
  });

  it('同步是幂等的：再 tick 一次不重复发（每秒都在跑这条路径）', () => {
    const s = createSession({ classId: 'yujian', seed: 12, tables: TABLES });
    s.kills = 500;
    tickSession(s, 1 / 60);
    const marksAfterFirst = s.character.marks ?? 0;
    for (let i = 0; i < 120; i++) tickSession(s, 1 / 60);
    expect(s.character.marks ?? 0).toBe(marksAfterFirst);
  });

  it('死亡计数会进档（成就"死一次"靠它）', () => {
    const s = createSession({ classId: 'yujian', seed: 13, tables: TABLES });
    expect(s.deaths).toBe(0);
    // 死亡事件只在 `damagePlayer` 内部产生（battle.ts 的 `if (p.hp <= 0)`），
    // 而 `s.battle.events` 每帧由 session 处理完就清空 —— 从外面手工塞事件会被
    // 下一帧的 `events = []` 吃掉。所以这条只能走真路径：扔到深层去挨打。
    // 层 18 的浊物一下就能打掉开局角色一大截，而玩家的输出远不够清场 ⇒ 必死。
    // setFloor 有越界拒绝（D36-B：不许静默把人扔到没去过的层），所以先放开"到过的最高层"
    s.maxFloorReached = 18;
    expect(setFloor(s, 18)).toBe(true);
    for (let i = 0; i < 60 * 120 && s.deaths === 0; i++) tickSession(s, 1 / 60);
    expect(s.deaths).toBeGreaterThan(0);
    expect(hasAchievement(s.achievements, 'death-1')).toBe(true);
  });
});

describe('成就：面板', () => {
  it('面板高度装得进 540', () => {
    expect(achievementPanelHeight()).toBeLessThan(540);
  });

  it('假 ctx 也能画完（不碰 DOM 测量）', () => {
    let fills = 0;
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
      globalAlpha: 1,
      lineWidth: 1,
      fillRect: () => {
        fills += 1;
      },
      strokeRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      measureText: () => ({ width: 8 }),
    } as unknown as CanvasRenderingContext2D;
    const state = sanitizeAchievements({ unlocked: IDS.slice(0, 2) });
    const r = drawAchievementPanel(ctx, state, factsAllDone(), 960, 540, 1);
    expect(r.rows.length).toBe(ACHIEVEMENT_TOTAL);
    expect(r.got).toBe(2);
    expect(fills).toBeGreaterThanOrEqual(2); // 底板 + 光标
  });
});
