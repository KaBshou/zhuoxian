// 独立验证 D52（自动换装按同部位 itemPower 比）+ D55（已穿件「不会被赌坏」）
//
// 为什么单独写：lead 的 tests/equip-craft.test.ts 是单元级「构造一件装再调函数」，
// 这里跑**真 session**（真掉落、真拾取、真打造都在 tickSession 里），验同两条契约在长时间运行下的行为。
// 定位：**探针，不是单测** —— 真环境、慢、每轮验收跑一次，不进 vitest 门禁（lead m02984 ③）。
//
// 断言（D55 修订版规则，lead m02984）：
//   A. 每一次换装：新件 itemPower **严格大于**旧件（D52：同部位按 itemPower 比）
//   B. 已穿件在「uid 不变」期间：itemPower **不下降**、灵纹**条数不减少**
//      （添灵纹是单调操作，**允许**打在已穿件上；洗/灭/满条兜底重掷是赌，只作用于背包件）
//   C. 哨兵：至少 N 次换装 + 至少 M 帧真的花了通货（否则 A/B 是空断言 —— 防「假绿」）
//
// 跑法：
//   node F:\dsh-work\zhuoxian\tools\verify-d52-d55.mjs                     # 默认 20min × 3 种子
//   node F:\dsh-work\zhuoxian\tools\verify-d52-d55.mjs --minutes=30 --seeds=20261021,20263047
import { createServer } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const MINUTES = Number(args.minutes ?? 20);
const SEEDS = (args.seeds ?? args.seed ?? '20261021,20262034,20263047')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x));
const CLASS = args.class ?? 'yujian';
const DT = 1 / 30;
const SLOTS = ['sword', 'relic', 'crown', 'robe', 'bracer', 'boots', 'belt', 'ring1', 'ring2', 'pendant'];
const CUR = ['huang', 'mie', 'xi'];

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  const sessionMod = await server.ssrLoadModule('/src/core/session.ts');
  const invMod = await server.ssrLoadModule('/src/core/inventory.ts');
  const { ITEM_BASES } = await server.ssrLoadModule('/src/data/bases.ts');
  const { AFFIXES } = await server.ssrLoadModule('/src/data/affixes.ts');
  const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

  const summary = [];

  for (const SEED of SEEDS) {
    console.log(`\n=== seed ${SEED} · ${MINUTES}min ===`);
    const s = sessionMod.createSession({ seed: SEED, classId: CLASS, tables: TABLES });

    const snapshot = () => {
      const out = {};
      for (const k of SLOTS) {
        const it = s.character.equipment[k];
        out[k] = it
          ? { uid: it.uid, power: invMod.itemPower(it), affixCount: it.affixes.length }
          : { uid: '', power: 0, affixCount: 0 };
      }
      return out;
    };
    const pocketTotal = () => CUR.reduce((sum, c) => sum + (s.pocket[c] ?? 0), 0);

    let prev = snapshot();
    let swaps = 0;
    let craftSpends = 0;
    let prevPocket = pocketTotal();
    const swapViolations = [];
    const powerDrops = [];
    const affixDrops = [];
    let wornAffixAdded = 0;

    for (let t = 0; t < MINUTES * 60; t += DT) {
      const spentBefore = prevPocket;
      sessionMod.tickSession(s, DT);
      const now = snapshot();

      for (const k of SLOTS) {
        const b = prev[k];
        const a = now[k];
        if (a.uid !== b.uid) {
          swaps += 1;
          const ok = a.power > b.power;
          if (!ok) swapViolations.push(`${k} ${b.power.toFixed(2)}→${a.power.toFixed(2)}`);
          check(`A 换装 ${k}：新件 itemPower 更高（${b.power.toFixed(2)} → ${a.power.toFixed(2)}）`, ok);
        } else if (b.uid) {
          // D55 修订后的不变量：添灵纹是单调操作（允许打在已穿件上，灵纹“变了”不算违规）；
          // 洗 / 灭 / 满条兜底重掷是赌 → 只作用于背包件 ⇒ 已穿件战力不降、条数不减。
          if (a.power < b.power - 1e-9) powerDrops.push(`${k} ${b.power.toFixed(3)}→${a.power.toFixed(3)}`);
          if (a.affixCount < b.affixCount) affixDrops.push(`${k} 条数 ${b.affixCount}→${a.affixCount}`);
          if (a.affixCount > b.affixCount) wornAffixAdded += 1; // 预期行为：添灵纹落在已穿件
        }
      }
      prev = now;

      const nowPocket = pocketTotal();
      if (nowPocket < spentBefore) craftSpends += 1;
      prevPocket = nowPocket;
    }

    console.log(`  换装 ${swaps} 次 · 打造消费帧 ${craftSpends} · 已穿件被添灵纹 ${wornAffixAdded} 次（预期行为）· 终局层 ${s.floor}/step ${s.character.step}`);
    check('A 全程无「战力更低却换装」', swapViolations.length === 0, swapViolations.slice(0, 5).join(' | ') || `0 次异常 / ${swaps} 次换装`);
    check('B 已穿件 itemPower 从未下降', powerDrops.length === 0, powerDrops.slice(0, 5).join(' | ') || '0 次回归');
    check('B 已穿件灵纹条数从未减少', affixDrops.length === 0, affixDrops.slice(0, 5).join(' | ') || '0 次减少');
    check('C 哨兵：至少 10 次换装（否则 A 是空断言）', swaps >= 10, `实际 ${swaps} 次`);
    check('C 哨兵：至少 5 帧真的花了通货（否则 B 是空断言）', craftSpends >= 5, `实际 ${craftSpends} 帧`);
    summary.push({ SEED, swaps, craftSpends, wornAffixAdded });
  }

  console.log('\n=== 汇总 ===');
  for (const r of summary) {
    console.log(`seed ${r.SEED}: 换装 ${r.swaps} · 打造消费帧 ${r.craftSpends} · 已穿件添灵纹 ${r.wornAffixAdded}`);
  }
  console.log(`\n结果：${failed === 0 ? '通过' : `${failed} 条失败`} · ${SEEDS.length} 种子 × ${MINUTES}min · 断言 A/B 由哨兵 C 兜底（防空跑假绿）`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await server.close();
}
