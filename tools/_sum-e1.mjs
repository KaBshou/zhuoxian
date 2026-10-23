/** 一次性汇总 _e1-*.json（用完可删；不进交付） */
import { readFileSync } from 'node:fs';

const TARGET = 406;
const modes = ['off', 'deepest21', 'best21'];
for (const m of modes) {
  const j = JSON.parse(readFileSync(`tools/_e1-${m}-3s.json`, 'utf8'));
  console.log(`\n=== ${m} ===`);
  console.log('verdict', JSON.stringify(j.verdict));
  for (const r of j.runs) {
    const a = r.atMax;
    const post = r.minutes - r.maxedAt;
    const mk = r.marks - (r.marksAtMax ?? 0);
    const cur = a ? a.currencyProduced.huang + a.currencyProduced.mie + a.currencyProduced.xi : 0;
    const preDrops = a ? a.dropsFound : r.dropsFound;
    const preGems = a ? a.gemProduced : r.gemProduced;
    // 法宝数必须用 runner 扫 s.ground 的真实落地件数（a.itemDrops / r.itemDrops）。
    // 旧写法 `preDrops - cur - preGems` 是「掷骰数 − 通货 − 玉简」，会把法宝支掷空的 72% 也算成法宝（高估 ~3.4 倍）。
    const preItem = a && Number.isFinite(a.itemDrops) ? a.itemDrops : r.itemDrops;
    const tierSum = a ? a.tierMinutes.reduce((s, x) => s + x.minutes, 0) : 1;
    const share = (t) => ((a.tierMinutes.find((x) => x.tier === t) ?? { minutes: 0 }).minutes / tierSum) * 100;
    console.log(
      `seed ${r.seed}: 满级 ${r.maxedAt.toFixed(1)}min (${(((r.maxedAt - TARGET) / TARGET) * 100).toFixed(1)}%) | ` +
        `满级后 ${post.toFixed(1)}min | 渊痕 ${r.marks} 渊痕/分 ${post > 0 ? (mk / post).toFixed(0) : '—'} | ` +
        `最高层 ${r.maxFloorReached} 终局层 ${r.floor} | 死 ${r.deaths} | 满级前掉落 ${(preDrops / r.maxedAt).toFixed(2)}/分 法宝 ${(preItem / r.maxedAt).toFixed(2)}/分 | ` +
        `满级前阶占比 ${share(1).toFixed(1)}/${share(2).toFixed(1)}/${share(3).toFixed(1)} | 改层 ${r.farmSnaps}`,
    );
  }
}
