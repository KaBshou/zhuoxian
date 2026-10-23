// 一次性补丁 v4：只补 interface + 两处留痕（createBattle 的初始化已在文件里了）
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const p = `${ROOT}/src/core/battle.ts`;
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(`${ROOT}/tools/_bak/battle.ts.${Date.now()}.bak`, orig, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

if (!c.includes('export interface DamageBreakdown')) {
  repl(
    `export type BattleEventKind =`,
    `/**
 * 一次伤害的拆解留痕（「损伤详解」面板的数据源）。
 *
 * 它不是新算的东西：computeDamage 每一步本身就留了 steps，
 * 这里只负责把"最近一次打出去的那一下"存下来给 UI 读。
 */
export interface DamageBreakdown {
  /** 用什么打的、打的谁（如「御剑术 → 坊市怨客」） */
  readonly label: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly steps: readonly { label: string; before: number; after: number; note?: string }[];
}

export type BattleEventKind =`,
    'interface',
  );
}

if (!/lastBreakdown: DamageBreakdown \| null;/.test(c)) {
  repl(
    `  readonly gemCostMulBySkill: Readonly<Record<string, number>>;
}`,
    `  readonly gemCostMulBySkill: Readonly<Record<string, number>>;
  /** 最近一次打出去的伤害拆解（null = 还没打过）。纯运行时态，不入档 */
  lastBreakdown: DamageBreakdown | null;
}`,
    'state-field',
  );
}

if (!c.includes('普攻 → ')) {
  repl(
    `  target.hp -= res.amount;
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: \`\${res.amount}\`,`,
    `  target.hp -= res.amount;
  state.lastBreakdown = {
    label: \`普攻 → \${target.name}\`,
    amount: res.amount,
    isCrit: res.isCrit,
    steps: res.steps,
  };
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: \`\${res.amount}\`,`,
    'player-strike',
  );
}

if (!c.includes('→ ${target.name}`,\n    amount: res.amount,\n    isCrit: res.isCrit,\n    steps: res.steps,\n  };\n  state.events.push({\n    kind: res.isCrit')) {
  // 神通那处单独判：用「skill.name→target」的 label 是否已存在
  if (!/label: `\$\{skill\.name\} → \$\{target\.name\}`/.test(c)) {
    repl(
      `  target.hp -= res.amount;
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: \`\${skill.name} \${res.amount}\`,`,
      `  target.hp -= res.amount;
  state.lastBreakdown = {
    label: \`\${skill.name} → \${target.name}\`,
    amount: res.amount,
    isCrit: res.isCrit,
    steps: res.steps,
  };
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: \`\${skill.name} \${res.amount}\`,`,
      'skill-strike',
    );
  }
}

if (c.length < orig.length) throw new Error(`拒绝写盘：${c.length} < ${orig.length}`);
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
