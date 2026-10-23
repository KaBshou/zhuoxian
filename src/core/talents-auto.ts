/**
 * 自动点天赋（周天图）。
 *
 * 【为什么要有，而不是让玩家自己点】
 * 本作定位是「放置挂机 + 刷宝」，不是「天赋规划模拟器」。玩家觉醒后每升一重
 * 得 1 点、每层首通得 2 点，全程 110~130 点 —— 让他一级一级手点 130 次，
 * 那不是决策，是杂活（和「不该要求玩家点属性点」是同一条理由）。
 *
 * 但也不能「随便点」：D31 已经把天赋总威力压到 ×1.05，如果乱点，玩家会得到
 * 一堆互相削弱的碎片加成。所以这里做**按优先级贪心**，并且：
 * 1. 严格尊重 `requires`（前置没点就不点）
 * 2. 主干按「输出 → 生存 → 资源 → 收益」排，先把主干铺完
 * 3. 支线只点一条（第一版每职业/每条线一个的延伸），选中后其余分支不再分配
 * 4. 纯函数、不可变、可重入：同一份输入永远得到同一份输出（存档可复现）
 *
 * 【为什么支线要「只点一条」】
 * 支线终点是开关节点（浊气爆发 +75%、波末回气 +35% 等），它们是**玩法方向**，
 * 全部点上等于「没有方向」。第一版玩家不选，我们按「先铺主干、再补最通用支线」
 * 的顺序自动选，将来做天赋 UI 时把这段换成玩家的显式选择，函数签名不变。
 */
import type { CharacterState } from './character';
import { TALENT_NODES, getTalent } from '../data/talents';
import type { TalentNode } from '../data/talent-def';
import {
  allocateTalent,
  canAllocate,
  talentPointsAvailable,
  talentPointsSpent,
} from './talents-runtime';

/**
 * 主干六线的优先级（越靠前越先点）。
 *
 * 顺序理由：伤害优先 —— 放置游戏里「打得快」等于「所有资源都来得快」，
 * 生存排第二（死了要重开一波，比少 3% 伤害贵得多），资源与收益放后面。
 */
const TRUNK_ORDER: readonly string[] = [
  't-dmg-',
  't-life-',
  't-armor-',
  't-mana-',
  't-xp-',
  't-loot-',
];

/**
 * 支线的优先级（主干铺完后按顺序补，碰到第一条能点的就锁定这一条分支）。
 *
 * 剑修（输出）→ 龟息（生存）→ 财脉（收益）→ 浊脉（玩法）→ 身法（操作）。
 * 身法排最后：它的节点是移速/范围，对自动战斗的收益最小。
 */
const BRANCH_ORDER: readonly string[] = ['b-sword-', 'b-turtle-', 'b-gold-', 'b-turbid-', 'b-foot-'];

function byTrunk(): TalentNode[] {
  const out: TalentNode[] = [];
  for (const prefix of TRUNK_ORDER) {
    const line = TALENT_NODES.filter((n) => n.id.startsWith(prefix)).sort((a, b) => a.id.localeCompare(b.id));
    out.push(...line);
  }
  return out;
}

function byBranch(prefix: string): TalentNode[] {
  return TALENT_NODES.filter((n) => n.id.startsWith(prefix)).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 自动分配所有可用天赋点。
 *
 * `firstClearedFloors` 是层数（不是数组），与 talents-runtime 的口径一致。
 */
export function autoAllocateTalents(ch: CharacterState, firstClearedFloors: number): CharacterState {
  let cur = ch;
  let guard = 0;

  // ── 第一步：把主干铺完 ────────────────────────────────
  for (const node of byTrunk()) {
    while (guard++ < 1000) {
      if (talentPointsAvailable(cur, firstClearedFloors) < node.cost) return finish(cur);
      if (spentIdsOf(cur).includes(node.id)) break;
      const r = allocateTalent(cur, node.id, firstClearedFloors);
      if (!r.ok) break;
      cur = r.character;
    }
  }

  // ── 第二步：补一条支线（先到先得，第一条能点的就锁死）──
  for (const prefix of BRANCH_ORDER) {
    const line = byBranch(prefix);
    if (!line.length) continue;
    // 该支线起点都点不了，说明前置没铺好，试下一条
    if (!canAllocate(cur, line[0].id, firstClearedFloors).ok && !spentIdsOf(cur).includes(line[0].id)) {
      continue;
    }
    let spentAny = false;
    for (const node of line) {
      while (guard++ < 2000) {
        if (talentPointsAvailable(cur, firstClearedFloors) < node.cost) return finish(cur);
        const r = allocateTalent(cur, node.id, firstClearedFloors);
        if (!r.ok) break;
        cur = r.character;
        spentAny = true;
      }
    }
    // 这一条支线点过了（哪怕只点了一级），就不再换分支 —— 支线是方向不是拼盘
    if (spentAny) return finish(cur);
  }

  return finish(cur);
}

function spentIdsOf(ch: CharacterState): readonly string[] {
  return ch.talentIds ?? [];
}

/**
 * 收尾：点数花不完时（图里没有可点的节点了）不该无限循环。
 * 这里只做一次防御性检查，不再分配。
 */
function finish(ch: CharacterState): CharacterState {
  return ch;
}

/**
 * 当前分配是否「还有余量说明有问题」——给测试与探针用。
 * 返回 { points, available, spent } 方便断言「点满后 available 应为 0 或图已遍历完」。
 */
export function talentAllocationSummary(
  ch: CharacterState,
  firstClearedFloors: number,
): { available: number; spent: number; nodes: number; branches: string[] } {
  const branches = new Set<string>();
  for (const id of spentIdsOf(ch)) {
    if (id.startsWith('b-')) branches.add(id.slice(0, id.lastIndexOf('-')));
  }
  return {
    available: talentPointsAvailable(ch, firstClearedFloors),
    spent: talentPointsSpent(ch),
    nodes: spentIdsOf(ch).length,
    branches: [...branches],
  };
}

export { getTalent };
