// D96：九境量级线对「尾部种子」降级为记录项，护栏 = 尾部种子最多 1 颗
// 依据 shuzhi 判 1（v4.45）：
//   量级线抓的是「一错一倍」的系统性错误；尾部种子的偏差是早期 rng 重排的连锁
//   （20265073 改前 341.8 → 改后 362.6，且正是满级出窗那颗）。
//   护栏：同轮 ≥2 颗种子触发 |>50%| 就**不许**降级，直接当系统问题查 ——
//   否则「尾部」会变成万能挡箭牌。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let n = raw.replace(/\r\n/g, '\n');
const before = n.length;

function rep(oldText, newText, tag) {
  if (!n.includes(oldText)) throw new Error(`MISS ${tag}`);
  const count = n.split(oldText).length - 1;
  if (count !== 1) throw new Error(`AMBIGUOUS ${tag}: ${count}`);
  n = n.replace(oldText, newText);
}

rep(
  `  // 逐种子 × 逐境 的量级检查（只看「一错就是一倍」，不看 ±20% 的正常散布）
  const realmMagnitude = [];
  for (const r of runs) {
    for (let j = 1; j <= REALM_COUNT; j++) {
      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;
      if (!Number.isFinite(at)) continue;
      const target = TARGET_REALM_MINUTES[j - 1];
      if (!(target > 0)) continue;
      const dev = (at - target) / target;
      if (Math.abs(dev) > REALM_MAGNITUDE_LIMIT) {
        realmMagnitude.push({ seed: r.seed, realm: j, at, target, dev });
      }
    }
  }
  const realmMagnitudeOk = realmMagnitude.length === 0;
  console.log(
    \`- 九境量级检查（|偏差| ≤ \${Math.round(REALM_MAGNITUDE_LIMIT * 100)}%，**只抓一错一倍**；逐境 ±\${Math.round(REALM_TOLERANCE * 100)}% 只记录）→ **\${realmMagnitudeOk ? "通过" : "不通过"}**\` +
      (realmMagnitudeOk ? "" : \`：\${realmMagnitude.map((x) => \`种子 \${x.seed} 境 \${x.realm} \${f(x.at, 1)}min vs 目标 \${x.target}（\${x.dev > 0 ? "+" : ""}\${f(x.dev * 100, 1)}%）\`).join("；")}\`),
  );`,
  `  // 逐种子 × 逐境 的量级检查（只看「一错就是一倍」，不看 ±20% 的正常散布）
  //
  // D96 尾部种子护栏（shuzhi v4.45 判 1）：
  //   量级线抓的是**系统性**错误（漏乘、单位错、一错一倍）。而尾部种子的偏差是
  //   早期 rng 重排的连锁 —— 20265073 改前就是最慢的 341.8、改后 362.6，且它正是
  //   「满级出窗」那颗。按 v4.34 的口径「九境超差与满级出窗是同一现象，判两次不增信息」，
  //   同一条口径现在补到**硬门禁**上：尾部种子的量级偏差降级为记录项。
  //
  //   **护栏（必须有）**：尾部种子最多降级 1 颗。同轮 ≥2 颗尾部种子触发 |偏差| > 50%
  //   就不许降级，直接当系统问题查 —— 否则「尾部」会变成万能挡箭牌。
  const tailSeedIds = new Set(
    runs.filter((r) => !Number.isFinite(r.maxedAt) || r.maxedAt < MAX_MIN_MINUTES || r.maxedAt > MAX_MAX_MINUTES).map((r) => r.seed),
  );
  const TAIL_SEED_EXEMPT_MAX = 1;
  const tailExemptAllowed = tailSeedIds.size <= TAIL_SEED_EXEMPT_MAX;

  const realmMagnitude = [];
  const realmMagnitudeTail = [];
  for (const r of runs) {
    for (let j = 1; j <= REALM_COUNT; j++) {
      const at = j < REALM_COUNT ? r.realmArrivals[j] : r.maxedAt;
      if (!Number.isFinite(at)) continue;
      const target = TARGET_REALM_MINUTES[j - 1];
      if (!(target > 0)) continue;
      const dev = (at - target) / target;
      if (Math.abs(dev) > REALM_MAGNITUDE_LIMIT) {
        const row = { seed: r.seed, realm: j, at, target, dev };
        // 只有「允许降级」（尾部种子 ≤1 颗）且这颗正是尾部种子，才进记录项
        if (tailExemptAllowed && tailSeedIds.has(r.seed)) realmMagnitudeTail.push(row);
        else realmMagnitude.push(row);
      }
    }
  }
  const realmMagnitudeOk = realmMagnitude.length === 0;
  console.log(
    \`- 九境量级检查（|偏差| ≤ \${Math.round(REALM_MAGNITUDE_LIMIT * 100)}%，**只抓一错一倍**；逐境 ±\${Math.round(REALM_TOLERANCE * 100)}% 只记录）→ **\${realmMagnitudeOk ? "通过" : "不通过"}**\` +
      (realmMagnitudeOk ? "" : \`：\${realmMagnitude.map((x) => \`种子 \${x.seed} 境 \${x.realm} \${f(x.at, 1)}min vs 目标 \${x.target}（\${x.dev > 0 ? "+" : ""}\${f(x.dev * 100, 1)}%）\`).join("；")}\`),
  );
  if (realmMagnitudeTail.length) {
    console.log(
      \`  - 其中**尾部种子降级**（D96，满级出窗 \${[...tailSeedIds].join("/")}，最多豁免 1 颗）：\` +
        realmMagnitudeTail.map((x) => \`种子 \${x.seed} 境 \${x.realm} \${f(x.at, 1)}min vs \${x.target}（\${x.dev > 0 ? "+" : ""}\${f(x.dev * 100, 1)}%）\`).join("；"),
    );
  }
  if (!tailExemptAllowed) {
    console.log(
      \`  - ⚠️ 尾部种子 \${tailSeedIds.size} 颗（\${[...tailSeedIds].join("/")}）> 豁免上限 \${TAIL_SEED_EXEMPT_MAX} ⇒ **不豁免**，按系统性问题查\`,
    );
  }`,
  '九境量级检查',
);

if (n.length === before) throw new Error('没有变化');
if (crlf) n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/run-timeline.mjs.${Date.now()}.bak`, raw);
fs.writeFileSync(p, n);
console.log(`run-timeline.mjs: ${before} -> ${n.length}`);
