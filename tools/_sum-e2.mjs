/** 一次性汇总 _e2-*.json（层 28 天花板修复后重跑；用完可删） */
import { readFileSync } from 'node:fs';

const TARGET = 406;
const TOL = 0.15; // 口径变更（lead m02404-4）：3 种子中位 ±15%
const med = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const modes = ['off', 'deepest21', 'best21'];
for (const m of modes) {
  const j = JSON.parse(readFileSync(`tools/_e2-${m}-3s.json`, 'utf8'));
  console.log(`\n=== ${m} ===`);
  const maxed = [];
  const post = [];
  const mpm = [];
  const deepest = [];
  const endFloor = [];
  const dropsPre = [];
  const itemPre = [];
  const share3 = [];
  for (const r of j.runs) {
    const a = r.atMax;
    const p = r.minutes - r.maxedAt;
    const mk = r.marks - (r.marksAtMax ?? 0);
    const cur = a ? a.currencyProduced.huang + a.currencyProduced.mie + a.currencyProduced.xi : 0;
    const preDrops = a ? a.dropsFound : r.dropsFound;
    const preGems = a ? a.gemProduced : r.gemProduced;
    // 法宝数用 runner 扫 s.ground 的真实落地件数；减法口径（dropsFound − 通货 − 玉简）已作废。
    const preItem = a && Number.isFinite(a.itemDrops) ? a.itemDrops : r.itemDrops;
    const tierSum = a ? a.tierMinutes.reduce((s, x) => s + x.minutes, 0) : 1;
    const share = (t) => ((a.tierMinutes.find((x) => x.tier === t) ?? { minutes: 0 }).minutes / tierSum) * 100;
    maxed.push(r.maxedAt);
    post.push(p);
    mpm.push(p > 0 ? mk / p : 0);
    deepest.push(r.maxFloorReached);
    endFloor.push(r.floor);
    dropsPre.push(preDrops / r.maxedAt);
    itemPre.push(preItem / r.maxedAt);
    share3.push(share(3));
    console.log(
      `seed ${r.seed}: 满级 ${r.maxedAt.toFixed(1)}min | 满级后 ${p.toFixed(1)}min | 渊痕 ${r.marks} 渊痕/分 ${(p > 0 ? mk / p : 0).toFixed(0)} | ` +
        `最高层 ${r.maxFloorReached} 终局层 ${r.floor} | 死 ${r.deaths} | 满级前掉落 ${(preDrops / r.maxedAt).toFixed(2)}/分 法宝 ${(preItem / r.maxedAt).toFixed(2)}/分 | ` +
        `满级前阶占比 ${share(1).toFixed(1)}/${share(2).toFixed(1)}/${share(3).toFixed(1)} | 改层 ${r.farmSnaps}`,
    );
  }
  const mmed = med(maxed);
  console.log(
    `-> 满级中位 ${mmed.toFixed(1)}min (${(((mmed - TARGET) / TARGET) * 100).toFixed(1)}%, 判据中位±15% => ${Math.abs(mmed - TARGET) / TARGET <= TOL ? 'PASS' : 'FAIL'}) | ` +
      `满级后段中位 ${med(post).toFixed(1)}min | 渊痕/分中位 ${med(mpm).toFixed(0)} | 最深层 ${Math.min(...deepest)}~${Math.max(...deepest)} | 终局层 ${Math.min(...endFloor)}~${Math.max(...endFloor)} | ` +
      `满级前掉落中位 ${med(dropsPre).toFixed(2)}/分 法宝 ${med(itemPre).toFixed(2)}/分 | 三阶占比中位 ${med(share3).toFixed(1)}%`,
  );
}
