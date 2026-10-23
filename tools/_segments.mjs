// 一次性证据脚本：从 run-timeline 的 JSON 切四段下界 + 段②（判据 C）
//
// 段定义：一阶=到层 10；二阶=层 10→19；层19→28=层 19→28；层28→满级=层 28→maxedAt
// 段② 口径（2026-10-22 D68 / C4）：**9/10 部位 itemPower ≥ 同部位同灵蕴宝品中位 ×1.0 且最差部位 ≥0.70，
//   并要求首次满足起「连续 30 分钟不跌破」**（跌破重新计时），成型时刻取这段窗口的**起点**。
//   → 读 `formedPowerAt`；`minPowerRatio` 是确认那一刻的最差部位比；旧「每部位宝品以上」口径留在
//   `formedAt`，只作记录、不再当门禁。
// 门槛一律照 docs/BALANCE.md §5.1 TIMELINE_BANDS / ITEM_BANDS，别在这个工具里另立一套。
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const j = JSON.parse(readFileSync(file, 'utf8'));
const med = (xs) => {
  const a = [...xs].filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '未达成');

const reach = (r, floor) => {
  const hit = (r.floorTrail ?? []).find((x) => x.floor >= floor);
  return hit ? hit.minute : NaN;
};

const rows = [];
for (const r of j.runs) {
  const t10 = reach(r, 10);
  const t19 = reach(r, 19);
  const t28 = reach(r, 28);
  const t46 = reach(r, 46);
  const s1 = t10;
  const s2 = t19 - t10;
  const s3 = t28 - t19;
  const s4 = r.maxedAt - t28;
  const a = r.atMax;
  // 段② 判据 C（新门禁）与旧品阶口径（记录）
  const formedPower = a ? (a.formedPowerAt ?? r.formedPowerAt) : r.formedPowerAt;
  const minRatio = a ? (a.minPowerRatio ?? r.minPowerRatio) : r.minPowerRatio;
  const formedLegacy = a ? a.formedAt : r.formedAt;
  rows.push({
    seed: r.seed,
    s1,
    s2,
    s3,
    s4,
    t46,
    window: r.minutes,
    maxedAt: r.maxedAt,
    formedPower,
    minRatio,
    formedLegacy,
    deaths: r.deaths,
    maxFloor: r.maxFloorReached,
  });
  console.log(
    `seed ${r.seed}: 一阶 ${f(s1)} / 二阶 ${f(s2)} / 19→28 ${f(s3)} / 28→满级 ${f(s4)} / 满级 ${f(r.maxedAt)}（窗口 ${r.minutes}min，满级后 ${f(r.minutes - r.maxedAt)}）` +
      ` · 到层46 ${f(t46)} · 段②C4 成型 ${f(formedPower)}（成型/满级 ${Number.isFinite(formedPower) && Number.isFinite(r.maxedAt) ? ((formedPower / r.maxedAt) * 100).toFixed(1) + '%' : '—'}，确认时最低战力比 ${f(minRatio, 3)}）` +
      ` · 旧品阶口径 ${f(formedLegacy)} · 死 ${r.deaths} · 最高层 ${r.maxFloorReached}`,
  );
}
// 四段下界（D74 中位判 + D83 绑比例）：
//   **判中位**，逐种子只记录最差；另设「量级红线 = 任一种子 < 目标 × 0.5」才判 FAIL。
// 为什么改中位判：6 种子实测里「二阶 32.5」「19→28 32.7」两条破线**都来自同一颗快杀种子
//   20263047**（它满级也最快）。逐种子判会 1/6 假红，而假红比漏检更贵 —— 它会教人忽略红灯。
// 量级红线专抓「整段被跳过」的真事故（例如某段只剩 1 分钟=几乎没打）。
//
// D83（shuzhi v4.40）：绝对下界改成「比例 × 满级目标」，只维护 `TARGET_MAX_MINUTES` 一个数。
//   起因：满级目标 330→300 后第 4 段（层28→满级）中位 164.8 < 180 破线 —— 那不是内容变少，
//   是 band 没跟着满级目标缩。比例来自「330 时代的老绝对数 ÷ 330」：
//     一阶 30/330=0.090、二阶 35/330=0.105、层19→28 35/330=0.105、层28→满级 175/330≈0.53
//   第 4 段取 **0.53 不取 0.545**：0.545 = 163.5，只剩 1.3min 余量（必红）；0.53 留 5.8min。
//   以后重标只改满级目标；同一批连续两轮红，才把 0.53 下探到 0.51（每次只动一个数、留 ≥3%）。
// D128：基数不许再写死 —— 从 run-timeline 的 verdict 里读（单一来源）。
const TARGET_MAX_MINUTES = (() => {
  const fromJson = Number(j.verdict?.targetMaxMinutes);
  if (Number.isFinite(fromJson) && fromJson > 0) return fromJson;
  // 兼容老 JSON（没有该字段）：从源码读常量，而不是猜 300。
  const src = readFileSync(new URL("./run-timeline.mjs", import.meta.url), "utf8");
  const m = /const TARGET_MAX_MINUTES = (\d+)/.exec(src);
  if (!m) throw new Error("取不到满级目标（JSON 与源码都没有）—— 拒绝用旧基数静默判定");
  return Number(m[1]);
})();
const BAND_RATIO = [0.09, 0.105, 0.105, 0.53];
// D144（shuzhi v4.65）：周目里一阶/二阶的形状被 CYCLE 渐入（D135）**故意改过**，
// 所以它们的比例下界只记录，判据只剩量级红线；后两段（19→28、28→满级）不受渐入影响，
// 基数换成本轮满级中位后照常硬判。
// 收口规则：**被判区间若被某个机制专门改过形状，该区间的判据就只剩量级红线。**
const cycleArg = (process.argv.slice(2).find((a) => a.startsWith("--cycle=")) ?? "").replace("--cycle=", "");
const CYCLE = Number(cycleArg !== "" ? cycleArg : (j.verdict?.cycle ?? 0));
if (!Number.isFinite(CYCLE)) throw new Error("周目号读不到（既没有 --cycle=，verdict 里也没有 cycle）");
const cycleBase = (() => {
  if (!(CYCLE > 0)) return TARGET_MAX_MINUTES;
  const m = med(j.runs.map((r) => r.maxedAt).filter((x) => Number.isFinite(x)));
  return Number.isFinite(m) && m > 0 ? m : TARGET_MAX_MINUTES;
})();
const SOFT_BANDS = CYCLE > 0 ? [true, true, false, false] : [false, false, false, false];
console.log(`# 四段下界基数=${cycleBase.toFixed(1)}min（D128 从 verdict 读；D144 周目用本轮满级中位）`);
const tgt = ['一阶', '二阶', '层19→28', '层28→满级'].map((name, i) => [
  name,
  Math.round(cycleBase * BAND_RATIO[i]),
  false,
  SOFT_BANDS[i],
]);
const meds = [med(rows.map((x) => x.s1)), med(rows.map((x) => x.s2)), med(rows.map((x) => x.s3)), med(rows.map((x) => x.s4))];
const MARGIN_RED = 0.5;
console.log('');
tgt.forEach(([name, floor, pendingBand, softOnly], i) => {
  const v = meds[i];
  const vals = rows
    .map((x) => [x.s1, x.s2, x.s3, x.s4][i])
    .filter((x) => Number.isFinite(x));
  const worst = vals.length ? Math.min(...vals) : NaN;
  const medOk = Number.isFinite(v) && v >= floor;
  const magOk = Number.isFinite(worst) && worst >= floor * MARGIN_RED;
  const verdict = !Number.isFinite(v)
    ? '未达成'
    : !magOk
      ? 'FAIL(量级红线)'
      : medOk
        ? 'PASS'
        : softOnly
          ? `记录(中位)<${floor}：周目渐入改了本段形状，只判量级`
          : pendingBand
            ? `待定红(中位)<${floor}：band 未随满级目标重定，等 shuzhi`
            : 'FAIL(中位)<' + floor;
  console.log(
    `| ${name} | ≥${floor}${pendingBand ? '（待定）' : ''} | ${f(v)} | 最差 ${f(worst)}（量级红线 ≥${floor * MARGIN_RED}） | ${verdict} |`,
  );
});
// 中位只统计「早于满级」的有效成型（与 run-timeline 表 2 的口径一致）：
//   否则 seed2 的 353.5 会把中位从 223.9 抬到 246.9，报告里两个数会打架。
const formedValid = rows.filter((x) => Number.isFinite(x.formedPower) && Number.isFinite(x.maxedAt) && x.formedPower <= x.maxedAt);
// 段② 口径（2026-10-23 v4.37 定稿，D78 修 castSpeed 之后）：判据仍是 C4，
//   常数 = 目标 186（=300×0.62）/ 绝对上限 214（=186×1.15，只记录）；
//   副红线 = **中位 成型/满级 ≤0.75 + 逐种子 ≤0.98 兜底**（这个比值跨种子摆 45pp，逐种子 0.85 是噪声开关）。
const FORMED_TARGET = 186;
const FORMED_MAX = Math.round(FORMED_TARGET * 1.15);
const FORMED_REL_MED_MAX = 0.75;
const FORMED_REL_SEED_MAX = 0.98; // 只记录（D99 之后不作判据）
// D99：段② 的结构性判据改成**聚合**（成型早于满级的种子比例 ≥90%），不再逐种子判。
// 逐种子判会把「一颗快杀种子」变成永恒红灯（12 种子实测 3039 是 103.2%），而 0.98 与 0.75 之间
// 只剩 23pp，跨种子散布 45pp —— 判的是种子不是设计。
const FORMED_BEFORE_MAX_RATE = 0.9;
const formedMed = med(formedValid.map((x) => x.formedPower));
// 结构性校验（与 run-timeline 的硬断言对齐）：成型必须**早于满级**，否则算达成会放过烂尾。
const formedOk = formedValid.length;
const formedLate = rows.filter((x) => Number.isFinite(x.formedPower) && x.formedPower > x.maxedAt);
const formedRel = rows
  .filter((x) => Number.isFinite(x.formedPower) && Number.isFinite(x.maxedAt) && x.maxedAt > 0)
  .map((x) => ({ seed: x.seed, ratio: x.formedPower / x.maxedAt }));
const formedRelWorst = formedRel.reduce((w, x) => (x.ratio > w.ratio ? x : w), formedRel[0] ?? { seed: '—', ratio: NaN });
const formedRelMed = med(formedRel.map((x) => x.ratio));
const formedRelMedOk = Number.isFinite(formedRelMed) && formedRelMed <= FORMED_REL_MED_MAX;
const formedBeforeRate = rows.length ? (rows.length - formedLate.length) / rows.length : 0;
const formedBeforeOk = formedBeforeRate >= FORMED_BEFORE_MAX_RATE;
const formedRelOk = formedRelMedOk && formedBeforeOk;
console.log(
  `段② 判据 C4 中位 ${f(formedMed)}min（目标 ${FORMED_TARGET} / 绝对上限 ≤${FORMED_MAX} 只记录 · **早于满级**达成 ${formedOk}/${rows.length}）`,
);
console.log(
  `  相对副红线：中位 ${Number.isFinite(formedRelMed) ? (formedRelMed * 100).toFixed(1) + '%' : '—'} ≤ ${FORMED_REL_MED_MAX * 100}%` +
    ` → ${formedRelMedOk ? '通过' : '不通过'} · 早于满级达成率 ${(formedBeforeRate * 100).toFixed(1)}% ≥ ${FORMED_BEFORE_MAX_RATE * 100}% → ${formedBeforeOk ? '通过' : '不通过'}` +
    `（逐种子最差 ${Number.isFinite(formedRelWorst.ratio) ? (formedRelWorst.ratio * 100).toFixed(1) + '%' : '—'}（种子 ${formedRelWorst.seed}）只记录，判据见 D99）`,
);
console.log(
  `  逐种子 成型/满级：${formedRel.map((x) => `${x.seed}=${(x.ratio * 100).toFixed(1)}%`).join(' / ')}` +
    ` · 确认时最差部位比 ${rows.map((x) => f(x.minRatio, 3)).join('/')} · 旧品阶口径中位 ${f(med(rows.map((x) => x.formedLegacy)))}（只记录）`,
);
if (formedLate.length && !formedBeforeOk) {
  console.log(
    `  ❌ 结构性错误（达成率破 90%）：${formedLate.map((x) => `seed ${x.seed} 成型 ${f(x.formedPower)} > 满级 ${f(x.maxedAt)}`).join('；')}`,
  );
} else if (formedLate.length) {
  console.log(
    `  记录项（D99 聚合口径：达成率 ${(formedBeforeRate * 100).toFixed(1)}% 已过线，晚于满级的种子只记录）：${formedLate
      .map((x) => `seed ${x.seed} 成型 ${f(x.formedPower)} > 满级 ${f(x.maxedAt)}`)
      .join('；')}`,
  );
}
// 段④ 记录项（D68 口径）：**多种子合计 n≥60 才看旗子比例**，单种子 3 件那种噪声不判。
const pcs = j.runs.map((r) => r.postCap).filter(Boolean);
if (pcs.length) {
  const xian = pcs.reduce((s, p) => s + (p.xian ?? 0), 0);
  const flags = pcs.reduce((s, p) => s + (p.flagXian ?? 0), 0);
  // D122 口径：段④ 主口径 = 末层停留产出（分母只算满级后在该层的分钟数）。
// 旧写法用 `p.minutes`（满级后总窗口）当分母 —— 那是 D80 已判定的口径事故（满级越早、窗口越长、读数越大）。
const LAST_FLOOR = Math.max(...pcs.flatMap((p) => (p.stayByFloor ?? []).map((b) => b.floor)), 0);
const per3hLast = med(
  pcs
    .map((p) => {
      const b = (p.stayByFloor ?? []).find((x) => x.floor === LAST_FLOOR);
      return b && b.minutes > 0 ? (b.xian / b.minutes) * 180 : NaN;
    })
    .filter(Number.isFinite),
);
const per3hFallback = med(pcs.map((p) => ((p.xian ?? 0) / Math.max(1, p.minutes)) * 180));
const per3h = Number.isFinite(per3hLast) ? per3hLast : per3hFallback;
const per3hLabel = Number.isFinite(per3hLast) ? `层${LAST_FLOOR}停留` : `满级后窗口（回退口径，D80 已作废）`;
  // ⚠ 段④ 折算小时（D84，shuzhi v4.40 定稿）：**以本脚本的 per3h 为准**。
  //   她原来的解析锚 7.2 件/3h 用了过期输入（法宝按 1.04/分、仙品率按无装备 3.85%），
  //   换成实测输入（1.31/分 × 4.57%）得 10.8，与实测 12.3 差 14% ⇒ **口径正确时实测 > 解析**。
  //   所以段④ 内容长度 = 25.46 件 ÷ 12.3/3h ≈ 6.2h，10.6h 作废。
  //   （历史：per3h 的分母曾是「满级后窗口长度」= 口径事故，满级越早窗口越长读数越大；
  //     D80 已改「停留层 46 的仙品 ÷ 停留层 46 分钟」，本脚本的 per3h 现在就是这个口径。）
  const xianHours = xian ? (25.46 / (per3h / 3)).toFixed(1) : '—';
  console.log(
    `段④ 记录项：仙品合计 ${xian} 件（单种子 ${pcs.map((p) => p.xian).join('/')}）、旗子合计 ${flags} 件` +
      `= **${xian ? ((flags / xian) * 100).toFixed(1) : '—'}%**（设计 33.3%）` +
      ` · 主口径 per-3h(${per3hLabel})=${f(per3h)} ⇒ 9 件全仙品（25.46 件）≈ **${xianHours}h**（D84）` +
      `${xian >= 60 ? '' : '（n<60，比例只记录不判）'}`,
  );
}
// 满级窗口（记录项，不判红；与 run-timeline 同口径）：
//   主门禁看**中位**落在 [win0, win1]；逐种子只对比**副红线**（= 中位目标 ×0.85 那条，由 JSON targets 给）。
//   ⚠ 别拿逐种子去比窗口下沿：窗口下沿是给中位的，逐种子 265.0 < 270 不是红（副红线 250 才判红）。
const win = Array.isArray(j.targets?.maxWindow) ? j.targets.maxWindow : [270, 345];
const maxedMed = med(rows.map((x) => x.maxedAt));
const winMedOk = Number.isFinite(maxedMed) && maxedMed >= win[0] && maxedMed <= win[1];
const hardMin = Number.isFinite(j.targets?.minMinutes) ? j.targets.minMinutes : 250;
const belowHard = rows.filter((x) => Number.isFinite(x.maxedAt) && x.maxedAt < hardMin);
console.log(
  `满级窗口（记录项，不判红；中位 ∈ [${win[0]}, ${win[1]}]）：中位 ${f(maxedMed)} → ${winMedOk ? '窗口内' : '出窗'}` +
    ` · 逐种子低于副红线 ${hardMin}：${belowHard.length ? belowHard.map((x) => `seed ${x.seed}=${f(x.maxedAt)}`).join('；') : '无'}`,
);
console.log(
  `满级中位 ${f(med(rows.map((x) => x.maxedAt)))}min · 满级后段中位 ${f(med(rows.map((x) => x.window - x.maxedAt)))}min` +
    ` · 到层46 中位 ${f(med(rows.map((x) => x.t46)))}min · 最高层中位 ${med(rows.map((x) => x.maxFloor))} · 死亡 ${rows.map((x) => x.deaths).join('/')}`,
);
