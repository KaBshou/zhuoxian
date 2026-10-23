// D114 尾部硬上限：单种子死亡 ≤60 次（= 验收带上沿 25 的 2.4 倍），超了直接红。
//
// 理由（shuzhi D114）：×5 的死亡序列排序后是 1,3,3,9,16,16,20,27,29,37,90,160
// —— 中位 20 稳在 10~25 带内，但尾部 2/12 在 90~160，恰好把「尾部豁免 ≤2/12」用满。
// 这是「中位掩盖尾部」的第三次（前两次：掉落的「法宝 −3%」假象、满级掩盖 432.8 出窗）。
// **中位描述典型玩家，尾部描述「有多少人的游戏是坏的」—— 验收必须两列都有。**
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\dsh-work\\zhuoxian\\';
const rel = 'tools/run-timeline.mjs';
const path = ROOT + rel;
const raw = readFileSync(path, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
const before = text.length;

function one(tag, oldText, newText) {
  if (text.includes(newText)) return;
  const hits = text.split(oldText).length - 1;
  if (hits !== 1) throw new Error(`[${tag}] 锚点命中 ${hits} 次`);
  text = text.replace(oldText, newText);
}

one(
  'const',
  `const DEATH_LIST_THRESHOLD = 5; // lead m01453：>5 次要单独列`,
  `const DEATH_LIST_THRESHOLD = 5; // lead m01453：>5 次要单独列
/** 单种子死亡硬上限（D114）：中位落在 10~25 带还不够，尾部必须也有线 —— 死锁种子的特征就是 90~160 次。 */
const DEATH_HARD_MAX = 60;
const DEATH_MEDIAN_BAND = [10, 25];`,
);

one(
  'compute',
  `  const totalDeaths = runs.map((r) => r.deaths);`,
  `  const totalDeaths = runs.map((r) => r.deaths);
  const deathMed = med(totalDeaths);
  const deathMax = Math.max(...totalDeaths);
  const deathOver = runs.filter((r) => r.deaths > DEATH_HARD_MAX).map((r) => r.seed);
  const deathHardOk = deathOver.length === 0;
  const deathMedOk = deathMed >= DEATH_MEDIAN_BAND[0] && deathMed <= DEATH_MEDIAN_BAND[1];`,
);

one(
  'print',
  `  console.log(
    \`- 全程死亡：\${totalDeaths.join(' / ')}（中位 \${med(totalDeaths)}）\` +
      \`；>\${DEATH_LIST_THRESHOLD} 次的种子逐条列在表 4\`,
  );`,
  `  console.log(
    \`- 全程死亡：\${totalDeaths.join(' / ')}（中位 \${deathMed}，验收带 \${DEATH_MEDIAN_BAND[0]}~\${DEATH_MEDIAN_BAND[1]}）\` +
      \`；>\${DEATH_LIST_THRESHOLD} 次的种子逐条列在表 4\`,
  );
  console.log(
    \`- 死亡尾部（**D114 硬上限 ≤\${DEATH_HARD_MAX} 次/种子**）：最差 \${deathMax} 次\` +
      (deathHardOk
        ? ' → **通过**'
        : \` → **不通过**：\${deathOver.join(', ')} 超上限（死锁特征：连死 → 逃生阀该生效而没生效）\`) +
      \`｜中位落在 \${DEATH_MEDIAN_BAND[0]}~\${DEATH_MEDIAN_BAND[1]} 带内 → \${deathMedOk ? '通过' : '不通过（只调斜坡斜率，逃生阀不动）'}\`,
  );`,
);

one(
  'verdict',
  `      verdict: { pass, allMaxed, maxedMin, maxedMed, maxedMax, dev, floorMin: worstMaxed, floorLimit: FLOOR_MIN_MINUTES, floorOk, realmMagnitudeOk, deaths: totalDeaths },`,
  `      verdict: {
        pass,
        allMaxed,
        maxedMin,
        maxedMed,
        maxedMax,
        dev,
        floorMin: worstMaxed,
        floorLimit: FLOOR_MIN_MINUTES,
        floorOk,
        realmMagnitudeOk,
        deaths: totalDeaths,
        deathMed,
        deathMax,
        deathHardOk,
        deathMedOk,
      },`,
);

one(
  'hardfail',
  `  const hardFail = !pass || !allMaxed || !formedPassFinal || !structuralOk || !realmMagnitudeOk;
  if (hardFail) {
    console.log('\\n❌ 硬门禁未全部通过（满级时长 / 段② 成型 / 结构性断言），退出码 1');
    process.exitCode = 1;
  }`,
  `  const hardFail =
    !pass || !allMaxed || !formedPassFinal || !structuralOk || !realmMagnitudeOk || !deathHardOk;
  if (hardFail) {
    console.log(
      '\\n❌ 硬门禁未全部通过（满级时长 / 段② 成型 / 结构性断言 / 死亡尾部上限），退出码 1',
    );
    process.exitCode = 1;
  }`,
);

const delta = text.length - before;
if (delta < 200 || delta > 8000) throw new Error(`改动量异常：${delta}`);
mkdirSync(ROOT + 'tools/_bak', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (existsSync(path)) copyFileSync(path, `${ROOT}tools/_bak/run-timeline.mjs.${stamp}.bak`);
writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
console.log(`OK ${rel} ${before} → ${text.length}（+${delta}）`);
