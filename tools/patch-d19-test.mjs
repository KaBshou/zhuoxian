// 一次性补丁：D19 落地后，元素伤害测试按「70% 抗性 + 30% 护体」改写（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/foundation.test.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `  it('五行伤害走抗性：100 打 30% 火抗 → 70', () => {
    const r = computeDamage({
      base: 100,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 9999, resist: { resFire: 0.3 }, level: 1 },
    });
    expect(r.amount).toBe(70);
  });`,
  `  it('元素伤害 70% 走抗性 + 30% 走护体（D19）：100 打 30% 火抗 + 满护甲 → 52', () => {
    // 抗性 30% × 0.7 = 21%，护体 9999 打满上限 90% × 0.3 = 27% → 合计减伤 48% → 52
    const r = computeDamage({
      base: 100,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 9999, resist: { resFire: 0.3 }, level: 1 },
    });
    expect(r.amount).toBe(52);
    // 减伤拆解要能算给玩家看，且两条通道都在里面
    expect(mitigationOf(['spell', 'fire'], { armor: 9999, resist: { resFire: 0.3 }, level: 1 })).toBeCloseTo(0.48, 6);
    const step = r.steps.find((s) => s.label === '抗性+护体');
    expect(step).toBeTruthy();
    expect(step?.note).toContain('0.7');
  });

  it('元素伤害但目标没护甲时只吃抗性（不打折也不额外增伤）', () => {
    const r = computeDamage({
      base: 100,
      tags: ['spell', 'fire'],
      modifiers: [],
      isCrit: false,
      roll: null,
      target: { armor: 0, resist: { resFire: 0.3 }, level: 1 },
    });
    expect(r.amount).toBe(70);
  });`,
  'd19-element-test',
);

repl(
  `import { computeDamage`,
  `import { computeDamage, mitigationOf`,
  'import-mitigation-of',
);

if (c.length < orig.length * 0.98) throw new Error(`拒绝写盘：${c.length}B < 原文 ${orig.length}B`);
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
