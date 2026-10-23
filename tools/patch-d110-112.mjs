// D110 死亡代价 = b + c-light：死亡 → 本层回到第 1 波（层不降、修为/掉落全保留）+ 复活冷却 6s
// D111 威胁倍率先 ×2 但保持关闭（`DEEP_THREAT_ENABLED = false`），等死亡代价生效后由 12 种子验收再开
// D112 成就 floor-46 → floor-76（替换不新增）
//
// 为什么死亡代价必须以「层」为颗粒度（shuzhi §6.5 的算术）：
//   重开本波 8s × 42 死 = 5.6min / 900min = 0.6%
//   复活冷却 6.5s 单用       = 4.6min / 900min = 0.5%
//   本层重开（半层 ≈ 1.8min）= 76min / 900min = 8.4%  ← 唯一有量级的
// 惩罚只有当它与时间同量级时才是惩罚。
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
  if (delta < 50 || delta > 6000) throw new Error(`${rel} 改动量异常：${delta}`);
  mkdirSync(ROOT + 'tools/_bak', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(path, `${ROOT}tools/_bak/${rel.replace(/[\\/]/g, '_')}.${stamp}.bak`);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
  console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
}

// ① 复活冷却 6 秒（D110-b）
patch('src/core/battle.ts', [
  [
    'revive-const',
    `/** 给浊气加点，处理满值（tickTurbid 负责状态机，这里只负责加分） */`,
    `/**
 * 复活冷却（秒），D110-b：3 → 6。
 *
 * 6 秒的来历不是「感觉上更疼」，而是它必须与「玩家能感知的时间块」同量级：
 * 本游戏一层平均 3.7 分钟、一波约 8 秒。3 秒几乎与波间隔同长（感知不到），
 * 6 秒是「你能注意到自己在等」的最小值，同时 42 次死亡也只有 4.6 分钟（0.5%），
 * 不会把满级时长炸掉 —— 真正的死亡代价是「本层回到第 1 波」（8.4%）。
 */
export const REVIVE_COOLDOWN = 6;

/** 给浊气加点，处理满值（tickTurbid 负责状态机，这里只负责加分） */`,
  ],
  [
    'revive-use',
    `    // 复活要等 3 秒，期间什么都不做 —— 给玩家一个"这里打不过"的明确体感
    state.reviveCooldown = 3;`,
    `    // 复活要等 REVIVE_COOLDOWN 秒，期间什么都不做 —— 给玩家一个"这里打不过"的明确体感
    state.reviveCooldown = REVIVE_COOLDOWN;`,
  ],
]);

// ② 死亡 → 本层回到第 1 波（D110-c-light）
patch('src/core/session.ts', [
  [
    'death-layer-restart',
    `      s.battle.monsters = [];
      s.waveTimer = 0;
      startWave(s);`,
    `      s.battle.monsters = [];
      s.waveTimer = 0;
      // D110-c-light：死亡 → **本层回到第 1 波**（层不降、修为/掉落全保留）。
      // 为什么不是「重开本波」：8s × 42 死 = 0.6%，测不到也感觉不到（实测满级时长一位不差）。
      // 为什么不是「掉层」：放置游戏里掉层会让玩家直接停手，心理成本远大于时间成本。
      // 为什么保留 10% 修为惩罚：它已经写进 DECISIONS，且是「疼但不劝退」的既有口径；
      //   本层重开是时间代价，两者不叠加成双重惩罚（shuzhi D110）。
      s.wave = 0;
      startWave(s);`,
  ],
]);

// ③ 威胁倍率 ×2 + 开关（D111），默认关闭
patch('src/data/monsters.ts', [
  [
    'threat-switch',
    `export const DEEP_THREAT_FROM_FLOOR = 22;
export const DEEP_THREAT_MUL = 1;
export const BOSS_THREAT_EXTRA = 1;

export function threatMul(floor: number, isBoss: boolean): number {
  if (!Number.isFinite(floor) || floor < DEEP_THREAT_FROM_FLOOR) return 1;
  return DEEP_THREAT_MUL * (isBoss ? BOSS_THREAT_EXTRA : 1);
}`,
    `export const DEEP_THREAT_FROM_FLOOR = 22;
export const DEEP_THREAT_MUL = 2;
export const BOSS_THREAT_EXTRA = 1.5;

/**
 * 总开关（D111）：**默认关闭**。
 *
 * 关着的时候倍率不算数 —— 这是有意的，不是漏了开。开它必须同时满足：
 *   1. 死亡代价已生效（D110：本层回到第 1 波 + 6 秒冷却）；
 *   2. 12 种子实测死亡中位 **10~25 次/种子（0.7~1.7 次/小时）**；
 *   3. 满级中位涨幅落在 shuzhi 的验收窗口内。
 * 低于 10 次说明威胁仍然没有意义（防御四通道照样是装饰），高于 25 次说明已经进入劝退区。
 * ×8 被否决的算术：182 死 × 1.8min = +328min ⇒ 满级 ~613min，窗口直接崩。
 */
export const DEEP_THREAT_ENABLED = false;

export function threatMul(floor: number, isBoss: boolean): number {
  if (!DEEP_THREAT_ENABLED) return 1;
  if (!Number.isFinite(floor) || floor < DEEP_THREAT_FROM_FLOOR) return 1;
  return DEEP_THREAT_MUL * (isBoss ? BOSS_THREAT_EXTRA : 1);
}`,
  ],
]);

// ④ 成就 floor-46 → floor-76（D112）
patch('src/data/achievements.ts', [
  [
    'floor-76',
    `  { id: 'floor-46', name: '渊底', desc: '抵达第四十六层。', target: 46, reward: 50000, progress: (f) => min(f.maxFloor, 46) },`,
    `    // D112：封顶从 46 抬到 76 之后，46 只是「76 层里的第 46 层」——既不是阶位边界也不是尽头，
    // 锚 165min 不对应任何里程碑。**封顶是唯一不随调参漂移的离散界线**，所以这条跟着封顶走。
    { id: 'floor-76', name: '渊底', desc: '走到魔渊最深处（第七十六层）。', target: 76, reward: 50000, progress: (f) => min(f.maxFloor, 76) },`,
  ],
]);
