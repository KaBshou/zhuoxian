// EHP 供给模拟：给角色穿上「sim 装备供给」后再跑逐层 sim。
// 关键：每 10 分钟模拟结束后用穿上的装备重算面板（模拟真实游玩中换装积累）。
// 目的：验证「裸装下界层 13+ 必死」是不是 EHP 供给不足（BALANCE §8 表 G 假设
// 玩家 EHP 按 1.1534/层涨：层 27 气血应约 4085，裸装只有 358）。
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian', configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

const sess = await server.ssrLoadModule('/src/core/session.ts');
const battleM = await server.ssrLoadModule('/src/core/battle.ts');
const chars = await server.ssrLoadModule('/src/core/character.ts');
const prog = await server.ssrLoadModule('/src/core/progression.ts');
const invM = await server.ssrLoadModule('/src/core/inventory.ts');
const basesM = await server.ssrLoadModule('/src/data/bases.ts');
const affixM = await server.ssrLoadModule('/src/data/affixes.ts');
const { createSession, startWave, tickSession, syncBattleFromCharacter } = sess;
const { createBattle, playerBattleFromCharacter } = battleM;
const tables = { bases: basesM.ITEM_BASES, affixes: affixM.AFFIXES };
const DT = 1 / 60;

function charAtFloor(floor) {
  const realm = Math.ceil(floor / 3);
  const target = Math.min(80, (realm - 1) * 9 + 4);
  let ch = chars.createCharacter('yujian');
  while (ch.step < target) ch = chars.gainXp(ch, prog.xpForStep(ch.step));
  return ch;
}

function run(floor, minutes, seed) {
  let ch = charAtFloor(floor);
  const s = createSession({ classId: 'yujian', seed, tables });
  s.character = ch;
  s.floor = floor;
  s.battle = createBattle(playerBattleFromCharacter(ch), ch.turbid, ch);
  startWave(s);
  const frames = minutes * 60 / DT;
  const pickups = [];
  for (let f = 0; f < frames; f++) {
    tickSession(s, DT);
    // 模拟玩家决策：地上有掉落就按 inventory 的换装逻辑处理（含背包）
    while (s.ground.length > 0) {
      const d = s.ground.shift();
      const r = invM.pickup(ch, s.bag, d.item);
      ch = r.character;
      s.bag = r.bag;
      if (r.equipped) pickups.push(d.item.slot);
      s.character = ch; // 必须写回！session 内部用的是 s.character
      syncBattleFromCharacter(s);
    }
    // 每 2 秒把背包里更强的换上（decideEquip 全扫）
    if (f % 120 === 0) {
      for (let i = s.bag.length - 1; i >= 0; i--) {
        const dec = invM.decideEquip(ch, s.bag[i]);
        if (dec.shouldEquip) {
          const r = invM.pickup(ch, s.bag.filter((_, j) => j !== i), s.bag[i]);
          ch = r.character;
          s.bag = r.bag;
          s.character = ch; // 必须写回！
          syncBattleFromCharacter(s);
        }
      }
    }
  }
  const st = chars.characterStats(ch);
  const dmgPerWave = s.battle.damageTaken / Math.max(1, s.wave);
  console.log(`floor=${String(floor).padStart(2)} step=${ch.step} life=${st.life.toFixed(0)} armor=${st.armor.toFixed(0)} | waves=${s.wave} kills=${s.battle.kills} drops=${s.dropsFound} deaths=${s.battle.deaths} dmg/wave=${dmgPerWave.toFixed(0)} 换装次数=${pickups.length}`);
}

console.log('装备供给模拟（会自动捡+换装）:');
for (const f of [1, 5, 9, 13, 18, 27]) run(f, 10, 1000 + f * 77);
await server.close();
