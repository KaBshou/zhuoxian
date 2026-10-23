import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('tools/_craft-sources.json', 'utf8'));
const rows = [];
for (const r of d.runs) {
  for (const f of r.floorStats) rows.push({ seed: r.seed, ...f });
}
const byFloor = new Map();
for (const x of rows) {
  let a = byFloor.get(x.floor);
  if (!a) {
    a = { floor: x.floor, minutes: 0, huang: 0, mie: 0, xi: 0 };
    byFloor.set(x.floor, a);
  }
  a.minutes += x.minutes;
  a.huang += x.produced.huang;
  a.mie += x.produced.mie;
  a.xi += x.produced.xi;
}
console.log('| 层 | 停留(min) | 黄 | 灭 | 洗 | 洗/黄 | 洗占比 |');
console.log('|---:|---:|---:|---:|---:|---:|---:|');
for (const a of [...byFloor.values()].sort((x, y) => x.floor - y.floor)) {
  const tot = a.huang + a.mie + a.xi;
  console.log(
    `| ${a.floor} | ${a.minutes.toFixed(1)} | ${a.huang} | ${a.mie} | ${a.xi} | ${(a.xi / a.huang).toFixed(3)} | ${((a.xi / tot) * 100).toFixed(1)}% |`,
  );
}
const ge3 = [...byFloor.values()].filter((a) => a.floor >= 3);
const sum = (k) => ge3.reduce((s, a) => s + a[k], 0);
const h = sum('huang');
const m = sum('mie');
const x = sum('xi');
console.log('');
console.log(`层>=3 合计：黄 ${h} / 灭 ${m} / 洗 ${x} → 洗/黄 ${(x / h).toFixed(3)}（理论 15/45=0.333），洗占比 ${((x / (h + m + x)) * 100).toFixed(1)}%（理论 15%）`);
const low = [...byFloor.values()].filter((a) => a.floor <= 2);
const ls = (k) => low.reduce((s, a) => s + a[k], 0);
console.log(`层<=2 合计：黄 ${ls('huang')} / 灭 ${ls('mie')} / 洗 ${ls('xi')}（minFloor=3 应无洗）→ 层<=2 停留 ${low.reduce((s, a) => s + a.minutes, 0).toFixed(1)}min`);
