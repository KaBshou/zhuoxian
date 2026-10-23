/**
 * shuzhi 三条拍板落地（D14 装配制收口，一次性补丁，跑完即弃）。
 *
 * 拍板内容（依据 shuzhi m04818 的体检数据）：
 * D14-1 槽位结构 = **每神通各自 4 槽**（不是全局共享 4 槽）。
 *   数据依据：每神通 4 槽全部 2.484×（保 92.1%）；全局共享 4 槽 1.537~2.484×
 *   （57~92%，火系比金系矮 38%）——共享表装不下三套（最优 4 条 = 1速度+1元素+拷皮+万汇，
 *   猛攻只对 attack 有效，共享时 spell 神通永远分不到猛攻）。
 * D14-2 解锁自动填默认装配（不装 = TTK×2.63，玩家不点也该有合理战力）。
 * D14-3 总供给 40.85×→37.6× 接受（+8.5% TTK，不再调怪血）。
 *
 * 实现方式（最小改动）：
 * - CharacterState.gemLoadout 从「全局一条表」改为「Record<技能id, string[]>」，
 *   字段名 gemLoadouts（复数），老的单表字段 gemLoadout 删除（存档系统尚未落地，无迁移负担）。
 * - characterGemLoadout(ch, skillId)：取该神通的装配表归一（解锁过滤+去重+截断）。
 * - defaultGemLoadout(skill)：解锁自动填默认装配——按技能标签选最有价值的 4 条。
 * - battle.ts createBattle：按 rotation 里每个神通各自算 gemMods / gemCostMul。
 * - skills-runtime.ts skillModifiers 同步改。
 */
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const C = 'F:/dsh-work/zhuoxian/src/core/character.ts';
const R = 'F:/dsh-work/zhuoxian/src/core/skills-runtime.ts';
const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';

// ── 1. character.ts：字段 gemLoadout → gemLoadouts ──
edit(C,
  `  /** 装配的辅助玉简 id（最多 GEM_SLOTS=4 条；不填 = 没装配，战斗层零玉简加成）。
   *  可选字段：老存档没有它也能读，读回来按 characterGemLoadout 归一。 */
  gemLoadout?: string[];`,
  `  /** 每神通各自的装配表（D14 拍板：每神通 4 槽，不是全局共享 4 槽——
   *  shuzhi 实测共享 4 槽火系只保 57%，装不下三套配置）。
   *  key = 神通 id，value = 辅助玉简 id 列表（最多 GEM_SLOTS=4 条）。
   *  不填该神通 = 按解锁自动填默认装配（characterGemLoadout 兜底）。
   *  可选字段：老存档没有它也能读，读回来按 characterGemLoadout 归一。 */
  gemLoadouts?: Record<string, string[]>;`,
  'field');

// ── 2. character.ts：归一函数带 skillId + 默认装配兜底 ──
edit(C,
  `/** 装配表归一：只留已解锁 + 去重 + 截到 GEM_SLOTS 条。
 *  老存档带未知 id 直接丢弃，不让脏数据进战斗。 */
export function characterGemLoadout(ch: CharacterState): string[] {
  const out: string[] = [];
  for (const id of ch.gemLoadout ?? []) {
    const def = SUPPORT_GEMS.find((g) => g.id === id);
    if (!def || ch.step < def.unlockStep) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= GEM_SLOTS) break;
  }
  return out;
}`,
  `/** 装配表归一：只留已解锁 + 去重 + 截到 GEM_SLOTS 条。
 *  老存档带未知 id 直接丢弃，不让脏数据进战斗。
 *  D14-2：没装配（或装配不足）时按解锁自动填默认装配——
 *  「不装 = TTK×2.63」不能是玩家的默认体验，默认体验必须是有装配的。 */
export function characterGemLoadout(ch: CharacterState, skillId: string): string[] {
  const raw = ch.gemLoadouts?.[skillId];
  const out: string[] = [];
  for (const id of raw ?? []) {
    const def = SUPPORT_GEMS.find((g) => g.id === id);
    if (!def || ch.step < def.unlockStep) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= GEM_SLOTS) break;
  }
  if (raw !== undefined && out.length > 0) return out;
  return defaultGemLoadout(ch, skillId, out);
}

/** 默认装配（解锁自动填）：按技能标签优先级选「命中该神通」的已解锁玉简。
 *  顺序 = 价值序（伤害类 > 穿透/破绽 > 速度 > 回气），
 *  已经装配进去的（out 里的）不算重，只补空位。 */
export function defaultGemLoadout(ch: CharacterState, skillId: string, already: string[] = []): string[] {
  const skill = getActiveSkill(skillId);
  if (!skill) return already.slice(0, GEM_SLOTS);
  const priority = ['wanhui', 'kaopi', 'guantou', 'duanjin', 'mengong', 'jixie', 'cuijin', 'zhuo-huo', 'hanbing', 'kuosan', 'huitou', 'yuanmo'];
  const out = [...already];
  for (const id of priority) {
    if (out.length >= GEM_SLOTS) break;
    if (out.includes(id)) continue;
    const def = SUPPORT_GEMS.find((g) => g.id === id);
    if (!def || ch.step < def.unlockStep) continue;
    if (!gemAffects(def, skill.tags)) continue;
    out.push(id);
  }
  return out.slice(0, GEM_SLOTS);
}`,
  'loadout-fn');

console.log('DONE');
