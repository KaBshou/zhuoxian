/**
 * 传奇效果不变量探针（Node 侧，真模块 + 真数据表，不重算公式）
 *
 * 验的东西（REQ §4「仙品 = 4 条灵纹 + 1 条传奇效果」）：
 *   A. 掉落侧：仙品**必带**一条传奇，且 id 一定在 LEGENDARY_DEFS 里；非仙品不许带
 *   B. 不变量（最容易被后续 patch 破坏的一条）：洗灵石 / 灭灵石 / 满条兜底重铸 / 淬炼
 *      **都不许把 legendary 洗掉或改掉**（`src/core/item.ts:79` 的契约）
 *   C. 传奇的纯数值部分必须走统一修正器管线（不新增加成入口）：太一余烬 = damage/more/0.3
 *      能在 `characterModifiers` 的输出里找到一模一样的条目
 *
 * 与 lead 的 `tests/legendary.test.ts` 分工：那边是单元级、静态构造；这里跑真数据表 + 真算子，
 * 并且是**探针**（每轮验收跑一次），不进 vitest 计数。
 *
 * 三段各自 try/catch：src 正在并发接线时，一段崩不该把另外两段的证据也吃掉。
 *
 * 跑法：node F:\dsh-work\zhuoxian\tools\verify-legendary-invariants.mjs
 *
 * ⚠ 环境纪律（2026-10-22 实测）：探针一律**新起 server**，不要复用跑了很久的 dev server。
 *   module graph 过期时的症状是「kills=0 / 时间不推进 / 面板一片空白」，极容易被误判成产品 bug
 *   （当天 5274 上那个 18:34 起的 server 就让 battle/detail/marks 三条假红，换干净 server 后全绿）。
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({
  root: 'F:/dsh-work/zhuoxian',
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, open: false },
});

let failed = 0;
let passed = 0;
const check = (name, ok, detail) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};
const section = (name, fn) => {
  console.log(`\n── ${name} ──`);
  try {
    return fn();
  } catch (err) {
    check(`${name}：跑通（src 未接线/未就绪时会在这里红）`, false, String(err && err.message ? err.message : err).slice(0, 160));
    return null;
  }
};

try {
  const lootMod = await server.ssrLoadModule('/src/core/loot.ts');
  const itemMod = await server.ssrLoadModule('/src/core/item.ts');
  const craftMod = await server.ssrLoadModule('/src/core/crafting.ts');
  const charMod = await server.ssrLoadModule('/src/core/character.ts');
  const rngMod = await server.ssrLoadModule('/src/core/rng.ts');
  const { ITEM_BASES } = await server.ssrLoadModule('/src/data/bases.ts');
  const { AFFIXES } = await server.ssrLoadModule('/src/data/affixes.ts');
  const legendMod = await server.ssrLoadModule('/src/data/legendary.ts');

  const DEFS = legendMod.LEGENDARY_DEFS;
  const IDS = new Set(DEFS.map((d) => d.id));
  const base = charMod.createCharacter('yujian');
  const withLegend = (it) => itemMod.legendaryOf(it)?.id ?? undefined;
  const labelOf = (it) => itemMod.legendaryLabel(it) ?? '';

  let sample = null;

  section('A 掉落侧', () => {
    const rng = new rngMod.Rng(20261021);
    const byRarity = { fan: [], ling: [], bao: [], xian: [] };
    for (let i = 0; i < 4000; i += 1) {
      // 注意 rollLoot 返回的是 { item, rarity, slot } 包装，不是 Item 本体
      const rolled = lootMod.rollLoot(rng, ITEM_BASES, AFFIXES, { ilvl: 20, rarityBonus: 8 });
      byRarity[rolled.item.rarity].push(rolled.item);
    }
    const xianMiss = byRarity.xian.filter((it) => !it.legendary);
    const xianBad = byRarity.xian.filter((it) => it.legendary && !IDS.has(it.legendary));
    const nonXian = ['fan', 'ling', 'bao'].flatMap((r) => byRarity[r].filter((it) => it.legendary));
    check('A 仙品掉落数量足够做统计（≥20 件）', byRarity.xian.length >= 20, `仙品 ${byRarity.xian.length} 件 / 共 4000 件`);
    check('A 每件仙品都带传奇', xianMiss.length === 0, xianMiss.length ? `漏 ${xianMiss.length} 件` : `0 漏 / ${byRarity.xian.length} 件`);
    check('A 传奇 id 都在 LEGENDARY_DEFS 里', xianBad.length === 0, xianBad.slice(0, 3).map((x) => x.legendary).join(',') || '0 非法');
    check('A 非仙品不许带传奇', nonXian.length === 0, nonXian.length ? `混入 ${nonXian.length} 件` : '0 件');
    const counts = new Set(byRarity.xian.map((it) => it.affixes.length));
    check('A 仙品灵纹固定 4 条（传奇不占灵纹位）', counts.size === 1 && counts.has(4), `条数集合 {${[...counts].join(',')}}`);
    const flagIds = new Set(DEFS.filter((d) => d.flag).map((d) => d.id));
    const modIds = new Set(DEFS.filter((d) => d.mods && d.mods.length).map((d) => d.id));
    check(
      'A 9 条传奇 = 6 数值 + 3 旗子，两类不重叠',
      DEFS.length === 9 && modIds.size === 6 && flagIds.size === 3 && [...flagIds].every((id) => !modIds.has(id)),
      `共 ${DEFS.length}：数值 ${modIds.size} / 旗子 ${flagIds.size}`,
    );
    sample = byRarity.xian[0] ?? null;
    check('A 取样到一件真仙品', Boolean(sample), sample ? `${sample.name} legendary=${sample.legendary}` : 'none');
    return sample;
  });

  section('B 不变量（洗/灭/重铸/淬炼都不许碰 legendary）', () => {
    // 不依赖 A：自己用真工厂 + 真灵纹池造一件仙品。
    // 目的就是让「B 不变量」在掉落侧还没接线时也能独立取证（A 红不该把 B 一起拖红）。
    if (!sample) {
      const rngB = new rngMod.Rng(4242);
      const shell = itemMod.makeItem(
        { slot: 'crown', rarity: 'xian', ilvl: 20, name: '仙品·探针冠', legendary: 'taiyi', uid: 'probe-legend-synth' },
        rngB,
      );
      const synthAffixes = itemMod.rollAffixInstances(AFFIXES, 'crown', 20, 4, rngB);
      sample = { ...shell, affixes: synthAffixes };
      check(
        'B 用 makeItem + rollAffixInstances 合成仙品（不依赖掉落侧）',
        synthAffixes.length === 4,
        `灵纹 ${synthAffixes.length} 条`,
      );
    }
    const before = { id: withLegend(sample), label: labelOf(sample) };
    check('B 取样件确实有传奇', Boolean(before.id), `${before.id}`);

    const ch0 = { ...base, equipment: {} };
    const full = { ...sample, affixes: sample.affixes.slice(0, 4) };
    const runOp = (name, step) => {
      const outItem = (step.bag ?? []).find((x) => x.uid === full.uid) ?? null;
      const after = outItem ? { id: withLegend(outItem), label: labelOf(outItem) } : null;
      check(
        `B ${name}：legendary 原样保留`,
        Boolean(outItem) && after.id === before.id && after.label === before.label,
        outItem ? `${before.id} → ${after.id}` : '算子没返回该件（无法证明，判失败）',
      );
    };
    runOp('洗灵石 craftReroll', craftMod.craftReroll(ch0, [full], AFFIXES, new rngMod.Rng(7)));
    runOp('灭灵石 craftRemoveAffix', craftMod.craftRemoveAffix(ch0, [full], new rngMod.Rng(8)));
    runOp('满条兜底重铸 craftReforgeWorstAffix', craftMod.craftReforgeWorstAffix(ch0, [full], AFFIXES, new rngMod.Rng(9)));

    const refined = itemMod.improveAffixes(sample, 1.1, 1.3);
    const afterRefine = refined.item ? { id: withLegend(refined.item), label: labelOf(refined.item) } : null;
    check(
      'B 淬炼 improveAffixes：legendary 原样保留',
      Boolean(refined.item) && afterRefine.id === before.id && afterRefine.label === before.label,
      `${before.id} → ${afterRefine?.id}`,
    );

    const worn = { ...full, uid: 'probe-legend-worn' };
    const chWorn = { ...base, equipment: { crown: worn } };
    // 背包里再放一件满条仙品：否则 灭/洗 没有合法目标（已穿件被 !isWorn 排除），
    // 这一轮就只会跑黄阶，测试会「看起来通过但其实没验到赌类算子」。
    const bagItem = { ...full, uid: 'probe-legend-bag' };
    const out = craftMod.runCraftPlan(
      chWorn,
      [bagItem],
      { counts: { huang: 20, mie: 20, xi: 20 } },
      AFFIXES,
      new rngMod.Rng(11),
    );
    const wornAfter = out.character.equipment.crown;
    const bagAfter = out.bag.find((x) => x.uid === 'probe-legend-bag');
    check(
      'B 已穿件跑满一轮 runCraftPlan：legendary 原样保留',
      Boolean(wornAfter) && withLegend(wornAfter) === before.id && labelOf(wornAfter) === before.label,
      `${before.id} → ${withLegend(wornAfter)}（花费 ${JSON.stringify(out.spent)}，日志 ${out.messages.length} 条）`,
    );
    check(
      'B 背包件跑满一轮 runCraftPlan（灭/洗真有目标）：legendary 原样保留',
      Boolean(bagAfter) && withLegend(bagAfter) === before.id,
      bagAfter ? `${before.id} → ${withLegend(bagAfter)}` : '背包件丢了',
    );
    check(
      'B 这一轮真的花了赌类通货（灭/洗），不是只跑黄阶',
      (out.spent.mie ?? 0) > 0 || (out.spent.xi ?? 0) > 0,
      `花费 ${JSON.stringify(out.spent)}`,
    );
    return before;
  });

  section('C 数值走统一修正器管线', () => {
    const taiyiDef = DEFS.find((d) => d.id === 'taiyi');
    const taiyi = itemMod.makeItem({ slot: 'crown', rarity: 'xian', ilvl: 20, name: '仙品·探针冠', legendary: 'taiyi' }, new rngMod.Rng(3));
    const chTaiyi = { ...base, equipment: { crown: taiyi } };
    const mods = charMod.characterModifiers(chTaiyi) ?? [];
    const hit = mods.filter((m) => m && m.stat === 'damage' && m.op === 'more' && Math.abs(Number(m.value) - 0.3) < 1e-9);
    check('C 太一余烬的 damage/more/0.3 出现在 characterModifiers 里', hit.length >= 1, `命中 ${hit.length} 条（定义 ${JSON.stringify(taiyiDef?.mods)}）`);
    return hit;
  });

  // ── D. 记录项（不是断言，不参与通过/失败计数）────────────
  // 口径（lead m03171 拍板）：**传奇旗子不进离线收益**。
  // 理由：离线是闭式估算（每杀真掷三分类），不跑战斗循环；killHeal 影响存活、
  // doubleStrike 影响 DPS，都不是收益模型里的量。为它们开特例，离线模型会慢慢
  // 变成第二套战斗逻辑。现在的口径本来就是保守的（离线不推层、离线不死），
  // 少算传奇收益是同一方向的保守。—— 这是口径选择，不是 bug。
  // 这里只把它**钉成可检查的事实**：offline.ts 里不该出现任何旗子/传奇引用。
  section('D 记录项', () => {
    const offlineSrc = readFileSync('F:/dsh-work/zhuoxian/src/core/offline.ts', 'utf8');
    const hits = ['killHeal', 'doubleStrike', 'boomMore', 'legendaryFlags', 'legendary'].filter((k) => offlineSrc.includes(k));
    console.log(
      `  记录  legendary 旗子不影响 offline.ts —— ${hits.length === 0 ? 'offline.ts 零引用（口径成立）' : `发现引用：${hits.join(',')}`}`,
    );
    console.log('  说明  离线是闭式估算、不跑战斗循环，旗子收益不计入 —— 这是口径选择，不是 bug');
    return hits;
  });

  console.log(`\n结果：${failed === 0 ? '通过' : `${failed} 条失败`} · 通过 ${passed} 条`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await server.close();
}
