// 一次性补丁：D19 —— 元素伤害改「70% 走抗性 + 30% 走护体」，护甲从死字段变成真减伤
// 依据：BALANCE §20.16（shuzhi 定稿）。旧行为是二选一（有元素就走抗性、护甲完全不参与），
// 而 12 只怪全带五行标签 → 怪物 armor 字段实战没人读 = 死属性。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/damage.ts';
const orig = fs.readFileSync(p, 'utf8');
if (fs.existsSync('F:/dsh-work/zhuoxian/tools/_bak') === false) fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak');
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/damage.ts.${Date.now()}.bak`, orig, 'utf8');
let c = orig;

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `/** 保底伤害：无论多厚的防御，至少掉 1 点，否则会出现「打不动的怪」= 死局 */
export const MIN_DAMAGE = 1;`,
  `/** 保底伤害：无论多厚的防御，至少掉 1 点，否则会出现「打不动的怪」= 死局 */
export const MIN_DAMAGE = 1;

/**
 * 元素伤害的减伤权重（D19）：70% 走五行抗性、30% 走护体。
 *
 * 为什么不是二选一：旧规则「有元素标签就只吃抗性、护甲完全不参与」，
 * 而全游戏 12 只怪都带五行标签 → 怪物的 armor 字段实战永远读不到 = 死属性。
 * 拆成 7:3 之后：抗性仍是元素防御主力（0.79~0.85 档最安全），护甲负责那 30% 的物理底子，
 * 玩家两个通道都得管，而不是「堆抗性就够」。
 */
export const ELEMENTAL_MITIGATION_SHARE = 0.7;
export const PHYSICAL_MITIGATION_SHARE = 0.3;`,
  'shares',
);

repl(
  `/** 取某个伤害实例对应的抗性值（无属性返回 null） */`,
  `/**
 * 一次伤害对某目标的实际减伤率（0~1，负数表示被增伤）。
 *
 * 单一出口：任何地方想知道「这东西打我到底减多少」，都调它，
 * 不许自己写 (1 - 抗性) 或 (1 - 护甲) —— 两处口径分叉是后期最难查的 bug。
 */
export function mitigationOf(tags: readonly Tag[], target: DefenseProfile | undefined): number {
  const res = resistFor(tags, target);
  const armorRed = target ? armorReduction(target.armor, target.level ?? 1) : 0;
  if (res && armorRed > 0) {
    return ELEMENTAL_MITIGATION_SHARE * res.value + PHYSICAL_MITIGATION_SHARE * armorRed;
  }
  if (res) return res.value;
  return armorRed;
}

/** 取某个伤害实例对应的抗性值（无属性返回 null） */`,
  'mitigation-of',
);

repl(
  `  // ⑦ 防御：五行走抗性，无属性走护甲
  const res = resistFor(tags, input.target);
  if (res) {
    const next = cur * (1 - res.value);
    steps.push({
      label: '五行抗性',
      before: cur,
      after: next,
      note: \`\${(res.value * 100).toFixed(1)}%\`,
    });
    cur = next;
  } else if (input.target) {
    const red = armorReduction(input.target.armor, input.target.level ?? 1);
    if (red > 0) {
      const next = cur * (1 - red);
      steps.push({
        label: '护体减伤',
        before: cur,
        after: next,
        note: \`\${(red * 100).toFixed(1)}%\`,
      });
      cur = next;
    }
  }`,
  `  // ⑦ 防御：元素伤害 70% 走抗性 + 30% 走护体（D19）；无属性伤害全走护体
  const res = resistFor(tags, input.target);
  const armorRed = input.target ? armorReduction(input.target.armor, input.target.level ?? 1) : 0;
  if (res && armorRed > 0) {
    const mix =
      ELEMENTAL_MITIGATION_SHARE * res.value + PHYSICAL_MITIGATION_SHARE * armorRed;
    const next = cur * (1 - mix);
    steps.push({
      label: '抗性+护体',
      before: cur,
      after: next,
      note: \`元素 \${(res.value * 100).toFixed(1)}% ×0.7 + 护体 \${(armorRed * 100).toFixed(1)}% ×0.3 = \${(mix * 100).toFixed(1)}%\`,
    });
    cur = next;
  } else if (res) {
    const next = cur * (1 - res.value);
    steps.push({
      label: '五行抗性',
      before: cur,
      after: next,
      note: \`\${(res.value * 100).toFixed(1)}%\`,
    });
    cur = next;
  } else if (armorRed > 0) {
    const next = cur * (1 - armorRed);
    steps.push({
      label: '护体减伤',
      before: cur,
      after: next,
      note: \`\${(armorRed * 100).toFixed(1)}%\`,
    });
    cur = next;
  }`,
  'mixed-mitigation',
);

if (c.length < orig.length) throw new Error(`拒绝写盘：${c.length}B < 原文 ${orig.length}B`);
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
