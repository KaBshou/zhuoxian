// 一次性补丁：修三处「测试写错」的断言（不是实现错）
// ① talents.test.ts:135 期望值 1.14 → 1.07（D38 N1 砍半后 t-dmg 合计 +7%，shuzhi 已改数据）
// ② breakdown-consistency ①：层 4 一阶怪血量断言 >200，是 v4 前的旧数值；v4 后层 4 一阶约 70~110
// ③ breakdown-consistency ④：面板金额与掉血相等只在「怪没死」时成立；怪被一击打死时
//    hp 被夹到 0，观测掉血 = 剩余血量 < 面板金额（溢出伤害）。改成「掉血 = min(面板金额, 出手前血量)」
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}) ${rel}: ${tag}`);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ① 天赋期望值
load('tests/talents.test.ts');
repl('tests/talents.test.ts',
  `    expect(after).toBeCloseTo(before * 1.14, 5);`,
  `    // D38 N1 砍半：t-dmg-1..4 合计 1.5+1.5+2+2 = +7%（原来 3+3+4+4 = +14%）
    expect(after).toBeCloseTo(before * 1.07, 5);`,
  'talents-expect',
);
flush('tests/talents.test.ts');

// ② 层 4 一阶怪血量：用相对断言（比层 1 高、且是个正数），不再写死绝对阈值
load('tests/breakdown-consistency.test.ts');
repl('tests/breakdown-consistency.test.ts',
  `      expect(m.hp, \`一阶普通怪 @ 层 4 血量太低\`).toBeGreaterThan(200);`,
  `      // v4 标定后层 4 一阶怪血约 70~110（BASE_MONSTER_HP=68 × 1.1534^3 × hpMul），
      // 旧断言 >200 是 v4 之前的数值，会让"怪被一击打死"污染后面的掉血对比
      expect(m.hp, \`一阶普通怪 @ 层 4 血量应大于玩家一击的 60 伤害\`).toBeGreaterThan(60);`,
  'floor4-hp',
);
// ③ 溢出伤害
repl('tests/breakdown-consistency.test.ts',
  `        expect(hpBefore - m.hp, '第二次出手：面板金额 ≠ 实际掉血').toBe(second.amount);`,
  `        // 怪被一击打死时 hp 夹到 0，观测掉血 = 剩余血量（< 面板金额，这是溢出伤害，不是不一致）
        expect(hpBefore - m.hp, '第二次出手：掉血应 = min(面板金额, 出手前血量)').toBe(
          Math.min(second.amount, hpBefore),
        );`,
  'overkill',
);
flush('tests/breakdown-consistency.test.ts');
console.log('done');
