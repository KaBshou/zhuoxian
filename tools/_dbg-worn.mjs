// 排查用：抓「已穿件 uid 未变但 itemPower 下降/灵纹变了」的第一手证据
import { createServer } from 'vite';

const MINUTES = Number(process.argv[2] ?? 20);
const SEED = Number(process.argv[3] ?? 20261021);
const DT = 1 / 30;

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

try {
  const sessionMod = await server.ssrLoadModule('/src/core/session.ts');
  const invMod = await server.ssrLoadModule('/src/core/inventory.ts');
  const { ITEM_BASES } = await server.ssrLoadModule('/src/data/bases.ts');
  const { AFFIXES } = await server.ssrLoadModule('/src/data/affixes.ts');
  const s = sessionMod.createSession({ seed: SEED, classId: 'yujian', tables: { bases: ITEM_BASES, affixes: AFFIXES } });

  const SLOTS = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring1', 'ring2', 'pendant'];
  const snap = (it) => (it ? { uid: it.uid, name: it.name, rarity: it.rarity, ilvl: it.ilvl, power: invMod.itemPower(it), affixes: it.affixes.map((a) => ({ stat: a.stat, value: a.value })) } : null);
  let prev = Object.fromEntries(SLOTS.map((k) => [k, snap(s.character.equipment[k])]));
  let reported = 0;

  for (let t = 0; t < MINUTES * 60 && reported < 5; t += DT) {
    sessionMod.tickSession(s, DT);
    for (const k of SLOTS) {
      const a = snap(s.character.equipment[k]);
      const b = prev[k];
      if (!a || !b || a.uid !== b.uid) {
        prev[k] = a;
        continue;
      }
      const powerDrop = a.power < b.power - 1e-9;
      const affixChange = JSON.stringify(a.affixes) !== JSON.stringify(b.affixes);
      if (powerDrop || affixChange) {
        reported += 1;
        console.log(`\n[${reported}] t=${t.toFixed(1)}s slot=${k} uid=${a.uid} ${a.name}(${a.rarity} ilvl${a.ilvl})`);
        console.log(`   power ${b.power.toFixed(4)} → ${a.power.toFixed(4)}  drop=${powerDrop}`);
        console.log(`   before affixes ${JSON.stringify(b.affixes)}`);
        console.log(`   after  affixes ${JSON.stringify(a.affixes)}`);
        console.log(`   log 尾部：${JSON.stringify((s.log ?? []).slice(-4))}`);
        console.log(`   bag 里有同 uid：${(s.bag ?? []).some((it) => it.uid === a.uid)}  bag 件数 ${s.bag?.length}`);
        prev[k] = a;
      } else {
        prev[k] = a;
      }
    }
  }
  console.log(`\n抓证结束，命中 ${reported} 次；终局层 ${s.floor} step ${s.character.step}`);
} finally {
  await server.close();
}
