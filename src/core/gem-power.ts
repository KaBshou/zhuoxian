/**
 * 玉简装配的**通道估算**（面板显示用，不改战斗）。
 *
 * 存在理由：本作最贵的一层设计是「6 主动 × 4 辅助槽 × 12 条玉简」，
 * 但玩家看不到「我现在装的是 2.43 倍还是 1.02 倍」，这层设计对他就是隐形的。
 *
 * 三条纪律：
 * 1. **绝不自己算伤害**：每条通道都只用 `aggregate()` 读 `gemModifiersFor()` 的产出，
 *    这是全项目唯一的结算入口。这里不做 base 选择、不碰防御、不掷骰。
 * 2. **分通道显示，不合成一个数**：合成一个大倍率一定要替玩家假设「打几只怪、破绽多少」，
 *    而那些假设在面板里是隐形的；分通道每个数都是可解释的（伤害/速度/破绽/范围）。
 * 3. **没进通道的玉简必须看得出来**：回气（击中回气）、驭魔（真元上限）不在四条通道里，
 *    所以额外返回 `utility` 条数，面板写「另有 n 条续航玉简」，不许让玩家以为它们没用。
 */
import type { CharacterState } from './character';
import { characterGemLoadout, characterStats, defaultGemLoadout } from './character';
import { aggregate, type Modifier } from './modifier';
import { ACTIVE_SKILLS, type ActiveSkillDef } from '../data/skills';
import { GEM_SLOTS, gemModifiersFor, getSupportGem } from '../data/support-gems';

/** 四条可显示通道（相对「一条都不装」= 1.00 的倍率） */
export interface GemChannels {
  /** 伤害：increased × more */
  readonly damage: number;
  /** 速度：attack 类吃 attackSpeed、spell 类吃 castSpeed */
  readonly speed: number;
  /** 破绽：期望值比 = (1 + c'·(m'−1)) / (1 + c·(m−1)) */
  readonly crit: number;
  /** 范围 */
  readonly area: number;
  /** 不在上面四条通道里的玉简条数（回气/驭魔这类续航） */
  readonly utility: number;
  /** 实际装了几条 */
  readonly count: number;
}

/** 面板里恒等于 1 的通道不显示（写一堆 ×1.00 只是噪音） */
export const CHANNEL_EPS = 0.005;

function skillById(skillId: string): ActiveSkillDef | undefined {
  return ACTIVE_SKILLS.find((s) => s.id === skillId);
}

function speedStatOf(skill: ActiveSkillDef): 'attackSpeed' | 'castSpeed' {
  return skill.tags.includes('attack') ? 'attackSpeed' : 'castSpeed';
}

function modsOfSkill(ch: CharacterState, skill: ActiveSkillDef, ids: readonly string[]): Modifier[] {
  const gems = ids.map((id) => getSupportGem(id)).filter((g) => g !== undefined);
  return gemModifiersFor(gems, skill.tags);
}

/** 唯一计算路径：`gemChannels` 与 `autoGemChannels` 都走这里，不许各写一遍（本项目踩过两套算法的坑） */
function channelsFor(ch: CharacterState, skill: ActiveSkillDef, ids: readonly string[]): GemChannels {
  const mods = modsOfSkill(ch, skill, ids);
  const tags = skill.tags;
  const speedStat = speedStatOf(skill);
  // ⚠️ `aggregate` 的第三个参数必须传：元素玉简（淬金/浊火/寒浸）的修正器带 `tags: ['metal'|'fire'|'water']`，
  // 不传标签的话它们会被全部过滤掉 —— 面板会把 1.69 显示成 1.00（第一版就踩了，见 tests/gem-power.test.ts）
  const dmg = aggregate(mods, 'damage', tags);

  // 破绽通道：分出「面板已有」与「玉简加的」，比期望而不是比单次
  const st = characterStats(ch);
  const c = Math.min(1, Math.max(0, st.critChance));
  const m = Math.max(1, st.critMulti);
  const gc = aggregate(mods, 'critChance', tags);
  const gm = aggregate(mods, 'critMulti', tags);
  const c2 = Math.min(1, Math.max(0, (c + gc.flat) * (1 + gc.increased) * gc.more));
  const m2 = Math.max(1, (m + gm.flat) * (1 + gm.increased) * gm.more);
  const before = 1 + c * (m - 1);
  const after = 1 + c2 * (m2 - 1);

  const CHANNEL_STATS = new Set<string>(['damage', speedStat, 'area', 'critChance', 'critMulti']);
  const utility = ids.filter((id) => {
    const g = getSupportGem(id);
    if (!g) return false;
    return g.mods.every((mo) => !CHANNEL_STATS.has(mo.stat));
  }).length;

  return {
    damage: (1 + dmg.increased) * dmg.more,
    speed: 1 + aggregate(mods, speedStat, tags).increased,
    crit: before > 0 ? after / before : 1,
    area: 1 + aggregate(mods, 'area', tags).increased,
    utility,
    count: ids.length,
  };
}

/** 某个神通在当前装配下的四条通道倍率（未知神通 → 全 1，安静判否） */
export function gemChannels(ch: CharacterState, skillId: string): GemChannels {
  const skill = skillById(skillId);
  if (!skill) return { damage: 1, speed: 1, crit: 1, area: 1, utility: 0, count: 0 };
  return channelsFor(ch, skill, characterGemLoadout(ch, skillId));
}

/**
 * 「自动装配」的四条通道 —— 面板要和它对比，玩家才知道自己偏离了多少。
 * 注意：这是**默认装配序**算出来的，D77 纪律要求默认序不得随意改动，
 * 否则门禁基线会静默漂移（所有时长/掉落基线跑的都是自动装配）。
 */
export function autoGemChannels(ch: CharacterState, skillId: string): GemChannels {
  const skill = skillById(skillId);
  if (!skill) return { damage: 1, speed: 1, crit: 1, area: 1, utility: 0, count: 0 };
  return channelsFor(ch, skill, defaultGemLoadout(ch, skillId));
}

/** 面板一行的文案（纯函数，单测直接断言语义，不依赖 canvas） */
export function channelText(ch: CharacterState, skillId: string): string {
  const cur = gemChannels(ch, skillId);
  const auto = autoGemChannels(ch, skillId);
  const parts: string[] = [];
  // 只写「玩家实际拿到了什么」：×1.00 的通道是噪音（空装配时整行会只剩「无加成」）
  const push = (label: string, a: number) => {
    if (Math.abs(a - 1) < CHANNEL_EPS) return;
    parts.push(`${label} ×${a.toFixed(2)}`);
  };
  push('伤害', cur.damage);
  push('速度', cur.speed);
  push('破绽', cur.crit);
  push('范围', cur.area);
  if (cur.utility > 0) parts.push(`续航 ${cur.utility} 条`);
  const body = parts.length > 0 ? parts.join('　') : '无加成';

  // 比自动装配差得多时给一句提示（只在自己改坏了的时候出现，不主动说教）
  const ratios = [
    cur.damage / Math.max(1e-6, auto.damage),
    cur.speed / Math.max(1e-6, auto.speed),
    cur.area / Math.max(1e-6, auto.area),
  ];
  const below = Math.min(...ratios) < 0.85;
  const tail = below ? '　（低于自动装配，R 可恢复）' : '';
  return `本神通 ${body}　已装 ${cur.count}/${GEM_SLOTS}${tail}`;
}
