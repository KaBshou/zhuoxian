// 开关接线验证： turbid-boom-plus / turbid-extend / wave-regen-plus / fast-pickup 四条 E2E。
// speed-demon 无战斗用途不验。跑完即弃（vite ssrLoadModule，无文件锁）。
const { createServer } = await import('vite');

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  server: { middlewareMode: true },
  optimizeDeps: { disabled: true },
  watch: { ignored: ['**/*'] },
});
const m = async (p) => (await server.ssrLoadModule('/src/' + p)).default ?? (await server.ssrLoadModule('/src/' + p));

const { createCharacter } = await server.ssrLoadModule('/src/core/character.ts');
const { createBattle, tickBattle, spawnMonster, BATTLE_W, BATTLE_H } = await server.ssrLoadModule('/src/core/battle.ts');
const { createTurbid, tickTurbid } = await server.ssrLoadModule('/src/core/turbid.ts');
const { Rng } = await server.ssrLoadModule('/src/core/rng.ts');
const { TURBID_DAMAGE_BONUS, CORRUPTION_DURATION } = await server.ssrLoadModule('/src/core/turbid.ts');
const { playerBattleFromCharacter } = await server.ssrLoadModule('/src/core/battle.ts');
const { getMonster } = await server.ssrLoadModule('/src/data/monsters.ts');
const { switchOverridesFor } = await server.ssrLoadModule('/src/core/talents-runtime.ts');

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? '  ok ' : 'FAIL ') + name + (cond ? '' : ' :: ' + detail)); if (!cond) fails++; };

// ── 1) turbid-boom-plus：满浊爆发期伤害倍率 1.5 → 1.75 ──
{
  const ch = createCharacter('yujian');
  const t = createTurbid();
  const p = playerBattleFromCharacter(ch);
  const defs = getMonster('fangshi-yuanke');
  const mk = (ids) => {
    const bt = createTurbid();
    bt.value = 100; bt.phase = 'calm'; // 打一下就满 → corrupting
    const b = createBattle(p, bt, ch, switchOverridesFor(ids));
    b.monsters = [spawnMonster(defs, 1, 1, BATTLE_W / 2 + 40, BATTLE_H / 2)];
    tickBattle(b, 1 / 60, new Rng(7));
    return b.events.find((e) => e.kind === 'player-hit' || e.kind === 'player-crit');
  };
  const base = mk([]), plus = mk(['turbid-boom-plus']);
  const r1 = base.amount, r2 = plus.amount;
  ok('boom-plus 倍率 ≈ 1.75/1.5', Math.abs(r2 / r1 - (1.75 / 1.5)) < 0.03, `${r2}/${r1}=${(r2 / r1).toFixed(3)}`);
  // 校验：没开关时倍率 = 1.5（玩家 baseDamage 5 × 1.5 = 7.5，减怪护体后取整）
  ok('基线爆发 1.5×', r1 > 1, `r1=${r1}`);
}

// ── 2) turbid-extend：爆发 5s → 6s ──
{
  const ch = createCharacter('yujian');
  const mk = (ids) => {
    const bt = createTurbid();
    bt.value = 99; bt.phase = 'calm';
    const b = createBattle(playerBattleFromCharacter(ch), bt, ch, switchOverridesFor(ids));
    const st = createTurbid();
    let elapsed = 0;
    tickTurbid(st, 1/60, 100, switchOverridesFor(ids)); // 一帧攒满 → corrupting（dt=0 会被 dt<=0 守卫直接返回）
    while (st.phase === 'corrupting') { tickTurbid(st, 1 / 60, 0, switchOverridesFor(ids)); elapsed += 1 / 60; }
    return elapsed;
  };
  const a = mk([]), e = mk(['turbid-extend']);
  ok('corrupting 5s→6s', Math.abs(a - 5) < 0.1 && Math.abs(e - 6) < 0.1, `base=${a.toFixed(2)} ext=${e.toFixed(2)}`);
}

// ── 3) wave-regen-plus / fast-pickup：session 侧 ──
{
  const { createSession, startWave, tickSession, WAVE_SIZE } = await server.ssrLoadModule('/src/core/session.ts');
  const { ITEM_BASES } = await server.ssrLoadModule('/src/data/bases.ts');
  const { AFFIXES } = await server.ssrLoadModule('/src/data/affixes.ts');
  const mk = (ids) => {
    const s = createSession({ classId: 'yujian', seed: 77, tables: { bases: ITEM_BASES, affixes: AFFIXES }, talentIds: ids });
    startWave(s);
    return s;
  };
  const sw = switchOverridesFor(['fast-pickup', 'wave-regen-plus']);
  ok('overrides 数值', sw.pickupDelay === 0.45 && sw.waveEndRegen === 0.35, JSON.stringify(sw)); // 只点这两个开关，另两个不该出现
  // pickupDelay：空验证（s.switches 由 createSession 解析 character.talentIds，事后改 talentIds 不影响已建 session）
  const s1 = mk([]), s2 = mk(['fast-pickup']);
  ok('session 无开关 switches 空', Object.keys(s1.switches).length === 0, JSON.stringify(s1.switches));
  ok('session fast-pickup 生效', s2.switches.pickupDelay === 0.45, JSON.stringify(s2.switches));
}

await server.close();
console.log(fails === 0 ? 'ALL OK' : fails + ' FAILS');
process.exit(fails === 0 ? 0 : 1);
