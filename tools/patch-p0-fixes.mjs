// 一次性补丁：修 ceshi v3.1 报告的四个 P0。跑完即弃。
// P0-a 镇守三个常量接线（BOSS_ATTACK_INTERVAL/BOSS_REGEN_*）→ battle.ts
// P0-b ilvl 调用错层 → session.ts 掉落传 floor 不传 tierOfFloor
// P0-c 注释漂移 → monsters.ts（floorOfTier/镇守）/session.ts（WAVE_SIZE/BOSS_EVERY）
import fs from 'node:fs';

function edit(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) { console.error('MISS ' + tag); process.exit(1); }
  c = c.split(old).join(neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK ' + tag);
}

const B = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
const S = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const M = 'F:/dsh-work/zhuoxian/src/data/monsters.ts';

// ── P0-a：battle.ts 接镇守常量 ─────────────────────────────
// 1) import
edit(B,
  "import { BASE_MONSTER_DAMAGE, BASE_MONSTER_HP, scaleOfFloor, xpPerKill } from '../data/monsters';",
  "import {\n  BASE_MONSTER_DAMAGE,\n  BASE_MONSTER_HP,\n  BOSS_ATTACK_INTERVAL,\n  BOSS_REGEN_PERIOD,\n  BOSS_REGEN_RATIO,\n  scaleOfFloor,\n  xpPerKill,\n} from '../data/monsters';",
  'boss-import');
// 2) MonsterInPlay 加 bossRegenTimer
edit(B,
  '  readonly attackInterval: number;',
  '  readonly attackInterval: number;\n  /** 镇守战内自回计时器（非镇守恒 0） */\n  bossRegenTimer: number;',
  'regen-field');
// 3) spawnMonster：镇守覆盖出手间隔 + 初始化计时器
edit(B,
  '    attackInterval: Math.max(0.2, def.attackInterval),',
  '    // D6（BALANCE v2 §11.2）：镇守出手 1 次/5 秒 —— 难度从抗伤转限时 DPS 检查。\n    // 不改的话这三个常量只有定义没有使用点，×25 血就是纯沙包。\n    attackInterval: def.boss ? Math.max(0.2, BOSS_ATTACK_INTERVAL) : Math.max(0.2, def.attackInterval),',
  'boss-interval');
edit(B,
  '    cooldown: 0,\n  };',
  '    cooldown: 0,\n    bossRegenTimer: 0,\n  };',
  'regen-init');
// 4) tickBattle 怪出手段：镇守自回 + 镇守出手节流在 cooldown 重置处体现（interval 已换）
edit(B,
  `      } else if (m.cooldown === 0) {
        monsterStrike(state, m, rng);
        m.cooldown = m.attackInterval;
      }`,
  `      } else if (m.cooldown === 0) {
        if (m.rarity === 'boss') {
          // 战内自回：每 10 秒回 10% 最大气血（BALANCE v2 §11.2）。
          // 没有它会出「玩家 DPS 恰好卡在回复量上，永远打不死但也不会死」的僵局。
          m.bossRegenTimer += d;
          if (m.bossRegenTimer >= BOSS_REGEN_PERIOD) {
            m.bossRegenTimer -= BOSS_REGEN_PERIOD;
            m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BOSS_REGEN_RATIO);
          }
        }
        monsterStrike(state, m, rng);
        m.cooldown = m.attackInterval;
      }`,
  'boss-regen');

// ── P0-b：session.ts 掉落传层不传阶 ─────────────────────────
edit(S,
  `      const item = rollMonsterDrop(
        killed.defId,
        tierOfFloor(killed.tier),
        killed.rarity,
        s.rng,
        s.tables,
      );`,
  `      // killed.tier 实际存的是层（spawnMonster 的 floor），直接透传。
      // 之前包一层 tierOfFloor 会把层 1~9 全压成 ilvl 4，玄/地/天三档词缀永远洗不出。
      const item = rollMonsterDrop(
        killed.defId,
        killed.tier,
        killed.rarity,
        s.rng,
        s.tables,
      );`,
  'ilvl-fix');
// 若 tierOfFloor 不再被使用，import 会报 unused —— 检查
{
  let c = fs.readFileSync(S, 'utf8');
  const uses = (c.match(/tierOfFloor/g) || []).length;
  console.log('tierOfFloor remaining refs in session.ts: ' + uses);
}

// ── P0-c：注释漂移 ─────────────────────────────────────────
edit(M,
  '/** 某阶的镇守 */',
  '/** 某阶的镇守（一阶 1~9 层 / 二阶 10~18 / 三阶 19~27） */',
  'c-boss');
edit(M,
  `/**
 * 阶数 → 主线层（一阶 = 1~3 层，二阶 = 4~6 层，三阶 = 7~9 层）。
 * 同阶内的 3 层用同一种怪，靠层曲线拉开强度。
 */`,
  `/**
 * 阶数 → 该阶第一层（一阶 = 1，二阶 = 10，三阶 = 19；27 层模型）。
 * 同阶内的 9 层用同一种怪，靠层曲线（×8.4 血）拉开强度。
 */`,
  'c-fot');
edit(M,
  ' * 三只镇守（每阶一个，对应 3 / 6 / 9 层的关口）。',
  ' * 三只镇守（每阶一个，对应 9 / 18 / 27 层的关口）。',
  'c-boss2');
edit(M,
  ' * 血量/攻伐不再写绝对值：按 BALANCE §11.1，镇守 = 同层普通浊物 ×25 血、×4 攻，',
  ' * 血量/攻伐不再写绝对值：镇守 = 同层普通浊物 ×25 血、×1.5 攻，',
  'c-boss3');
edit(M,
  '/** 兼容旧调用（spawnRing 传的 tier 参数实际是层）。超过 9 层（无尽层）也 clamp 到有效区间 */',
  '/** 层数 → 阶数（1~9 一阶 / 10~18 二阶 / 19~27 三阶） */',
  'c-tof');
edit(M,
  ' * 血量/攻伐不再写绝对值：按 BALANCE §11.1，镇守 = 同层普通浊物 ×25 血、×4 攻，',
  ' * 血量/攻伐不再写绝对值：镇守 = 同层普通浊物 ×25 血、×1.5 攻，',
  'c-boss3b');
edit(M,
  ` * 主线层数。第一版 3 阶秘境 × 3 层 = 9 层主线（对应九层魔渊）。
 * 无尽层（层 10+）复用第三阶的怪，由层数继续放大 —— 不需要新怪。`,
  ` * 主线层数 = 27（3 阶秘境 × 9 层/阶，对应九层魔渊 × 三段）。
 * 每层 = 10 波，第 10 波镇守；27 层合计约 5.8 小时（BALANCE v2）。`,
  'c-maxfloor');
edit(M,
  "/** 镇守血量 = 同层普通 ×8（BALANCE §11.1 的 ×25 与 60~90s 自相矛盾，层 1 要 230s；\n  *  ×8 时层 1 = 720 血 / dps 9.8 ≈ 73s 正好落窗。攻伐 ×4 保留。） */",
  "/** 镇守血量 = 同层普通 ×25（单场约 4 分钟，血和玩家 DPS 同步缩放，秒数恒定） */",
  'c-bosshp');
edit(M,
  "/** 镇守攻伐 = 同层普通 ×4（BALANCE §11.1 原值保留） */",
  "/** 镇守攻伐 = 同层普通 ×1.5（BALANCE v2 §11.2：×4 会在 15 层一击打掉 60%+ 气血） */",
  'c-bossdmg');
edit(S,
  '/** 每几波来一个镇守 */',
  '/** 每几波来一个镇守（= 每层波数：10 波一层，第 10 波镇守） */',
  'c-bossevery');
edit(S,
  '/** 一波几只普通怪（BALANCE §3：一波 8 只，目标 75 秒） */',
  '/** 一波几只普通怪（BALANCE v2 §3：18 只 ×4.29s ≈ 77s/波，落 60~90s 窗） */',
  'c-wavesize');
edit(S,
  '  /** 当前层（1~27，每层一条怪表索引；每 3 层换一阶的怪表） */',
  '  /** 当前层（1~27；1~9 一阶怪 / 10~18 二阶 / 19~27 三阶） */',
  'c-floorcmt');
console.log('ALL DONE');
