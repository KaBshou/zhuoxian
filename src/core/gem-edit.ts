// 玉简（辅助）**编辑层**：把「每条神通 4 槽」从只读变成玩家能改。
//
// 为什么需要这一层：
//   `characterGemLoadout` 会按解锁自动填默认装配，所以「不装 = TTK×2.63」不会成为默认体验；
//   但玩家一旦想换配置，之前**没有任何入口**（`skill-panel.ts` 头部写着「只读」）。
//   6 主动 × 4 槽 × 12 玉简是本作最贵的一层组合，不能改就等于不存在。
//
// 纪律：
//   1. 本文件只碰「装配表」这一个数据结构，不碰战斗、不碰渲染、不碰存档格式
//      （`CharacterState.gemLoadouts` 早就在存档里了）。
//   2. 所有返回值都是**新的数组**，调用方拿 `applyGemLoadout()` 提交；
//      这样单测不需要 mock 会话。
//   3. 校验一律「安静判否」：未解锁 / 不命中标签 / 重复 / 越界 → 返回原装配，不抛异常。
//      存档是玩家能改的东西，脏值不许把面板打崩。
import { defaultGemLoadout, type CharacterState } from './character';
import { characterGemLoadout } from './character';
import { ACTIVE_SKILLS, type ActiveSkillDef } from '../data/skills';
import { GEM_SLOTS, SUPPORT_GEMS, gemAffects, getSupportGem } from '../data/support-gems';

/** 面板里的一行（顺序与 `skill-panel.ts` 一致：按 unlockStep 升序，同名按中文序） */
export interface SkillRow {
  readonly skill: ActiveSkillDef;
  readonly unlocked: boolean;
}

/** 一个可选玉简 */
export interface GemOption {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
}

/** 面板顺序：未解锁的排在后面但不隐藏 —— 玩家要能看到前面还有什么 */
export function orderedSkillRows(ch: CharacterState): SkillRow[] {
  return [...ACTIVE_SKILLS]
    .sort((a, b) => {
      if (a.unlockStep !== b.unlockStep) return a.unlockStep - b.unlockStep;
      return a.name.localeCompare(b.name, 'zh');
    })
    .map((skill) => ({ skill, unlocked: ch.step >= skill.unlockStep }));
}

/** 某条神通**能装**的玉简：已解锁 且 标签命中（`gemAffects`） */
export function gemOptions(ch: CharacterState, skillId: string): GemOption[] {
  const skill = ACTIVE_SKILLS.find((s) => s.id === skillId);
  if (!skill) return [];
  const out: GemOption[] = [];
  for (const g of SUPPORT_GEMS) {
    if (ch.step < g.unlockStep) continue;
    if (!gemAffects(g, skill.tags)) continue;
    out.push({ id: g.id, name: g.name, desc: g.desc });
  }
  return out;
}

/**
 * 某个槽位可轮换的候选（含「空槽」= null，排第一）。
 * 已经装在**其它**槽位的玉简会被排除 —— 同一条神通里装两份一样的玉简没有意义，
 * 而 `characterGemLoadout` 本来就会去重，让玩家看到能选却装不上去才是坏体验。
 */
export function gemSlotOptions(
  ch: CharacterState,
  skillId: string,
  slot: number,
): Array<GemOption | null> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= GEM_SLOTS) return [null];
  const current = characterGemLoadout(ch, skillId);
  const usedElsewhere = new Set(current.filter((_, i) => i !== slot));
  const opts: Array<GemOption | null> = [null];
  for (const g of gemOptions(ch, skillId)) {
    if (usedElsewhere.has(g.id)) continue;
    opts.push(g);
  }
  return opts;
}

/** 把装配表归一成「长度 ≤ GEM_SLOTS、去重、只留能装的」 */
function normalize(ch: CharacterState, skillId: string, list: readonly string[]): string[] {
  const allowed = new Set(gemOptions(ch, skillId).map((g) => g.id));
  const out: string[] = [];
  for (const id of list) {
    if (!allowed.has(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= GEM_SLOTS) break;
  }
  return out;
}

/**
 * 直接设置某槽。`gemId = null` 表示清空该槽。
 * 返回**新装配数组**（已归一）；调用方用 `applyGemLoadout` 提交。
 */
export function setGemAt(
  ch: CharacterState,
  skillId: string,
  slot: number,
  gemId: string | null,
): string[] {
  const current = characterGemLoadout(ch, skillId).slice();
  if (!Number.isInteger(slot) || slot < 0 || slot >= GEM_SLOTS) return normalize(ch, skillId, current);
  if (gemId === null) {
    current.splice(slot, 1);
    return normalize(ch, skillId, current);
  }
  // 装到别的槽上就先摘掉（不允许同一玉简占两格）
  const dup = current.indexOf(gemId);
  if (dup >= 0 && dup !== slot) current.splice(dup, 1);
  // 摘完之后目标下标可能已经移位，重新对齐一次
  const next = characterGemLoadout(ch, skillId).slice();
  const at = Math.min(slot, next.length);
  next.splice(at, 0, gemId);
  return normalize(ch, skillId, next);
}

/** 在候选里前后轮换（dir=1 下一个 / -1 上一个，循环）。空槽也在候选里。 */
export function cycleGemAt(
  ch: CharacterState,
  skillId: string,
  slot: number,
  dir: number,
): string[] {
  const current = characterGemLoadout(ch, skillId);
  const cur = current[slot] ?? null;
  const opts = gemSlotOptions(ch, skillId, slot);
  const idx = opts.findIndex((o) => (o ? o.id : null) === cur);
  const step = dir >= 0 ? 1 : -1;
  const base = idx < 0 ? 0 : idx;
  const pick = opts[((base + step) % opts.length + opts.length) % opts.length];
  return setGemAt(ch, skillId, slot, pick ? pick.id : null);
}

/**
 * 恢复「自动装配」：删掉该神通的覆盖项，回到 `defaultGemLoadout`。
 * 这是玩家想「别管了，随便装个最优」的出口，也是把装配弄乱后的后悔药。
 */
export function resetGemLoadout(ch: CharacterState, skillId: string): string[] {
  if (ch.gemLoadouts) delete ch.gemLoadouts[skillId];
  return defaultGemLoadout(ch, skillId);
}

/** 提交：写进 `ch.gemLoadouts`（这是存档里的字段，`save.ts` 早就在写它） */
export function applyGemLoadout(ch: CharacterState, skillId: string, list: readonly string[]): void {
  if (!ch.gemLoadouts) ch.gemLoadouts = {};
  ch.gemLoadouts[skillId] = normalize(ch, skillId, list);
}

/** 光标：技能行上下移动（越界夹取，不环绕 —— 列表短，环绕反而容易迷路） */
export function moveSkillCursor(current: number, dy: number, count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (!Number.isFinite(current)) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(current) + Math.trunc(dy)));
}

/** 光标：槽位左右移动（环绕 —— 只有 4 格，转圈最省按键） */
export function moveSlotCursor(current: number, dx: number): number {
  const n = GEM_SLOTS;
  if (!Number.isFinite(current)) return 0;
  const c = Math.floor(current);
  if (!Number.isFinite(dx)) return ((c % n) + n) % n;
  return (((c + Math.trunc(dx)) % n) + n) % n;
}

/** 选中槽里现在是什么（null = 空槽）；越界安静返回 null */
export function gemAtSlot(ch: CharacterState, skillId: string, slot: number): GemOption | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= GEM_SLOTS) return null;
  const id = characterGemLoadout(ch, skillId)[slot];
  if (!id) return null;
  const def = getSupportGem(id);
  return def ? { id: def.id, name: def.name, desc: def.desc } : null;
}
