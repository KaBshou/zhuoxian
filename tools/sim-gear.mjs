/**
 * 装备供给验证 —— 回答「穿装备的 sim」这个空缺。
 *
 * 两问：
 *   A) 自动换装到底有没有生效？玩家战力随时间涨多少？（equipped 应从 1 涨到 9）
 *   B) 穿上模拟产出的装备后，层 1~3 的击杀/死亡曲线怎么变？
 *
 * 方法：真实 tick 跑 10 分钟 × 3 种子（与 sim-rate 同口径），每 60 秒记一次
 * 装备件数 / 战力（characterPower）/ 面板 damage / maxHp。
 *
 * 用法：node tools/sim-gear.mjs
 */
import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MINUTES = 10;
const SEEDS = [1, 2, 3];
const DT = 1 / 60;

const server = await createServer({
  root: ROOT,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const { createSession, startWave, tickSession } = await server.ssrLoadModule('/src/core/session.ts');
const { characterPower, equipmentSummary } = await server.ssrLoadModule('/src/core/inventory.ts');
const { characterStats } = await server.ssrLoadModule('/src/core/character.ts');
const { AFFIXES } = await server.ssrLoadModule('/src/data/affixes.ts');
const { ITEM_BASES } = await server.ssrLoadModule('/src/data/bases.ts');

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };
const steps = Math.round((MINUTES * 60) / DT);

const lines = [];
lines.push(`# 装备供给验证 · ${MINUTES} 分钟 × ${SEEDS.length} 种子`);
lines.push('');
lines.push('| 时刻(min) | 种子 | 层 | 装备件数 | 战力 | 面板伤害 | 出手速度 | 气血上限 | 死亡 | 台阶 |');
lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');

for (const seed of SEEDS) {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES });
  startWave(s);
  // 死亡要按「整分钟增量」统计：prevDeaths 每帧都更新的话，打印出来的是最后一帧的死亡数（几乎恒 0）。
  // 这是 lead 发现的「sim-gear 0 死 vs sim-rate 45 死」的唯一根因，修复见 tools/diag-death.mjs。
  let minuteStartDeaths = s.battle.deaths;

  for (let i = 0; i <= steps; i += 1) {
    if (i > 0) tickSession(s, DT);
    if (i % (60 / DT) === 0) {
      const st = characterStats(s.character);
      const equipped = equipmentSummary(s.character).length;
      lines.push(
        `| ${i * DT / 60 | 0} | ${seed} | ${s.floor} | ${equipped} | ` +
          `${Math.round(characterPower(s.character))} | ${st.damage.toFixed(1)} | ` +
          `${st.attackSpeed.toFixed(2)} | ${Math.round(st.life)} | ` +
          `${s.battle.deaths - minuteStartDeaths} | ${s.character.step} |`,
      );
      minuteStartDeaths = s.battle.deaths;
    }
  }
}

console.log(lines.join('\n'));
await server.close();
