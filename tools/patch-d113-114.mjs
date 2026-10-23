// D113 逃生阀：同一层连死 ≥3 次 → 自动回退 1 层（层降、修为/掉落保留、本层进度清零、计数器清零）
// D114 渐进威胁：threat(floor) = min(5, 1 + 0.20 × (floor − 22))
//
// 为什么需要逃生阀（shuzhi D113）：D110 定的「本层回第 1 波、层不降」保住了心理成本，
// **但层不降 = 没有逃生阀**。一旦某层真打不过，玩家就是「6s 冷却 → 回第 1 波 → 再死」的死锁
// （实测种子 2026 死 160 次）。这不是难度，是死锁；渐进威胁只是把死锁从层 22 搬到层 60。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';

function patch(rel, edits) {
  const path = ROOT + rel;
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  const before = text.length;
  for (const [tag, oldText, newText] of edits) {
    if (text.includes(newText)) continue;
    const hits = text.split(oldText).length - 1;
    if (hits !== 1) throw new Error(`${rel} [${tag}] 锚点命中 ${hits} 次（要求恰好 1 次）`);
    text = text.replace(oldText, newText);
  }
  if (text === raw.replace(/\r\n/g, '\n')) {
    console.log(`SKIP ${rel}`);
    return;
  }
  const delta = text.length - before;
  if (delta < 40 || delta > 6000) throw new Error(`${rel} 改动量异常：${delta}`);
  mkdirSync(ROOT + 'tools/_back', { recursive: true });
  mkdirSync(ROOT + 'tools/_bak', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(path, `${ROOT}tools/_bak/${rel.replace(/[\\/]/g, '_')}.${stamp}.bak`);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
}

// ① 逃生阀：连死 3 次退层（D113）
patch('src/core/session.ts', [
  [
    'escape-valve',
    `      s.battle.monsters = [];
      s.waveTimer = 0;
      // D110-c-light：死亡 → **本层回到第 1 波**（层不降、修为/掉落全保留）。`,
    `      // D113 逃生阀：同一层**连续**死 ≥3 次 → 自动回退 1 层。
      //
      // 为什么必须有：D110 定了「本层回第 1 波、层不降」保住了心理成本，
      // 但「层不降 = 没有逃生阀」—— 一旦某层真打不过，玩家就是
      // 「6s 冷却 → 回第 1 波 → 再死」的死锁（实测种子 2026 在威胁 ×5 下死 160 次）。
      // 这不是难度，是死锁；渐进威胁只会把死锁从层 22 搬到层 60。
      //
      // 为什么退 1 层是唯一正解：
      //   - 「刚才清得过的层」永远存在 ⇒ 结构上保证玩家有出路；
      //   - 成本有界：正常死亡 1.8min，只有进入死锁才付 3.7min/次的退层成本；
      //   - 可学习：玩家会明白「这层硬打不过，退一层刷装备再回来」，这正是刷宝循环。
      // 层 1 无处可退时仍按 D110 处理（回第 1 波），不会退到 0 层。
      if (s.floor > 1 && s.floorDeaths >= ESCAPE_VALVE_DEATHS) {
        pushLog(s, \`连死 \${s.floorDeaths} 次，退回第 \${s.floor - 1} 层\`, '#c8553d');
        s.floor -= 1;
        s.maxFloorReached = Math.max(s.maxFloorReached, s.floor);
        s.floorDeaths = 0;
        s.battle.floorDeaths = 0;
        s.battle.monsters = [];
        s.waveTimer = 0;
        s.wave = 0;
        startWave(s);
        continue;
      }
      s.battle.monsters = [];
      s.waveTimer = 0;
      // D110-c-light：死亡 → **本层回到第 1 波**（层不降、修为/掉落全保留）。`,
  ],
]);

// ② 常量（放在 DEATH_XP_PENALTY 旁边，语义上是同一族「死亡成本」）
patch('src/core/session.ts', [
  [
    'escape-const',
    `export const DEATH_XP_PENALTY = 0.1;`,
    `export const DEATH_XP_PENALTY = 0.1;

/**
 * 逃生阀阈值（D113）：同一层**连续**死这么多次就自动回退 1 层。
 *
 * 3 的来历：1~2 次死亡仍属「手滑/装备差一点」，第 3 次说明这层结构上打不过；
 * 再高会让玩家在死锁里多耗 2×1.8min，再低会让「越级挑战」变得没有代价。
 * 换层（下潜或退层）后计数器清零。
 */
export const ESCAPE_VALVE_DEATHS = 3;`,
  ],
]);

// ③ 渐进威胁（D114）
patch('src/data/monsters.ts', [
  [
    'progressive',
    `export const DEEP_THREAT_MUL = 5;
export const BOSS_THREAT_EXTRA = 1.5;`,
    `export const DEEP_THREAT_MUL = 5;
export const BOSS_THREAT_EXTRA = 1.5;

/**
 * 斜坡斜率（D114）：层 22 起每层 +0.20，到 ×5 后钳住。
 *
 *   floor 22 → ×1.00（斜坡起点）
 *   floor 27 → ×2.00（教学期后第一道台阶，与「×2 一刀切实测几乎不死」对齐）
 *   floor 42 → ×5.00（钳住，之后恒 ×5：段④ 终点压力不无限增长）
 *
 * 取 0.20 不取 0.25：0.25 在层 38 就顶到 ×5，斜坡只剩 16 层、玩家来不及「学会」；
 * 0.20 给 20 层过渡带，并用实测锚住了斜坡起点。
 */
export const DEEP_THREAT_SLOPE = 0.2;`,
  ],
  [
    'progressive-use',
    `export function threatMul(floor: number, isBoss: boolean): number {
  if (!DEEP_THREAT_ENABLED) return 1;
  if (!Number.isFinite(floor) || floor < DEEP_THREAT_FROM_FLOOR) return 1;
  return DEEP_THREAT_MUL * (isBoss ? BOSS_THREAT_EXTRA : 1);
}`,
    `export function threatMul(floor: number, isBoss: boolean): number {
  if (!DEEP_THREAT_ENABLED) return 1;
  if (!Number.isFinite(floor) || floor < DEEP_THREAT_FROM_FLOOR) return 1;
  const ramp = 1 + DEEP_THREAT_SLOPE * (Math.floor(floor) - DEEP_THREAT_FROM_FLOOR);
  return Math.min(DEEP_THREAT_MUL, ramp) * (isBoss ? BOSS_THREAT_EXTRA : 1);
}`,
  ],
]);
