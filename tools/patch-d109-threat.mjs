// D109：分段威胁（层 22+ 怪物伤害 ×8、镇守额外 ×1.5）+ D106 拍板：MAX_FLOOR 46→76。
//
// 背景（D108/D109 实测）：层 27/40 的承伤率 μ 中位 0.00 %/s、致死倍率 K ≥ 3（理论 K*≈11）
// ⇒ 「不是防御通道没接线，是敌人打不疼」，气血/护甲/抗性/护盾四条通道整体没有游戏作用。
// 修法必须**分段**：层 1~21 是教学期（K 大一点没错），层 22+ 才是玩家已有完整装备的地方。
// 全局抬会打破 §16 的 EHP 验收与 §6 的满级时长。
//
// 硬验收（shuzhi）：12 种子满级中位涨幅 ≤3%；超了二档降到 ×5。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';

function patch(rel, edits) {
  const path = ROOT + rel;
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  const before = text.length;
  if (edits.every(([, , newText]) => text.includes(newText))) {
    console.log(`SKIP ${rel}（已是目标状态）`);
    return;
  }
  for (const [tag, oldText, newText] of edits) {
    const hits = text.split(oldText).length - 1;
    if (hits !== 1) throw new Error(`${rel} [${tag}] 锚点命中 ${hits} 次（要求恰好 1 次）`);
    text = text.replace(oldText, newText);
  }
  const delta = text.length - before;
  if (delta < 100 || delta > 6000) throw new Error(`${rel} 改动量异常：${delta}`);
  mkdirSync(ROOT + 'tools/_bak', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${ROOT}tools/_bak/${rel.replace(/[\\/]/g, '_')}.${stamp}.bak`;
  if (existsSync(path)) copyFileSync(path, bak);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
}

patch('src/data/monsters.ts', [
  [
    'max-floor',
    `export const MAX_FLOOR = 46;`,
    `export const MAX_FLOOR = 76;`,
  ],
  [
    'threat-fn',
    `/** 该层打完普通波之后会不会出镇守（层 1~27 每层都有；层 28+ 每 5 层一只） */`,
    `/**
 * 分段威胁（D109）：层 22 起怪物伤害 ×8，镇守额外 ×1.5（合计 ×12）。
 *
 * 为什么必须分段而不是全局：
 *   - 层 1~21 是教学期。实测层 27 的致死倍率 K* ≈ 11（还要挨 100 多下才死），
 *     新手期 K 大一点没错，那里不该被打死；
 *   - 层 22+ 是玩家已经拿齐装备与回复词条的地方，只有在那里「气血/护甲/抗性」才有意义；
 *   - 全局抬会同时打破 §16 的 EHP 验收和 §6 的满级时长（30min 级别的连锁）。
 *
 * 为什么是「伤害」而不是「血量」：抬血量只会让 TTK 变长（更多点击/更久挂机），
 * 抬伤害才让 EHP 重新变成一种资源。两者对满级时长都有影响，但只有伤害能修「防御无意义」。
 *
 * 硬验收：12 种子满级中位涨幅 ≤3%（超了降到 ×5）。
 */
export const DEEP_THREAT_FROM_FLOOR = 22;
export const DEEP_THREAT_MUL = 8;
export const BOSS_THREAT_EXTRA = 1.5;

export function threatMul(floor: number, isBoss: boolean): number {
  if (!Number.isFinite(floor) || floor < DEEP_THREAT_FROM_FLOOR) return 1;
  return DEEP_THREAT_MUL * (isBoss ? BOSS_THREAT_EXTRA : 1);
}

/** 该层打完普通波之后会不会出镇守（层 1~27 每层都有；层 28+ 每 5 层一只） */`,
  ],
]);

patch('src/core/battle.ts', [
  [
    'import-threat',
    `  BASE_MONSTER_DAMAGE,\n`,
    `  BASE_MONSTER_DAMAGE,\n  threatMul,\n`,
  ],
  [
    'apply-threat',
    `    damage: Math.max(1, BASE_MONSTER_DAMAGE * def.dmgMul * s.damage * (1 + affix.damageInc)),`,
    `    // D109 分段威胁：层 22+ ×8、镇守再 ×1.5。层 1~21 恒为 1（教学期不动）。\n` +
      `    damage: Math.max(\n` +
      `      1,\n` +
      `      BASE_MONSTER_DAMAGE * def.dmgMul * s.damage * (1 + affix.damageInc) * threatMul(floor, !!def.boss),\n` +
      `    ),`,
  ],
]);
