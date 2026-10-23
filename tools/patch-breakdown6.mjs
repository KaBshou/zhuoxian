// 一次性补丁：给 skillStrike 补 lastBreakdown 留痕
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/battle.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/battle.ts.${Date.now()}.bak`, orig, 'utf8');

const old = `  target.hp -= res.amount;
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: \`\${skill.name} \${res.amount}\`,`;
const neu = `  target.hp -= res.amount;
  state.lastBreakdown = {
    label: \`\${skill.name} → \${target.name}\`,
    amount: res.amount,
    isCrit: res.isCrit,
    steps: res.steps,
  };
  state.events.push({
    kind: res.isCrit ? 'player-crit' : 'player-hit',
    label: \`\${skill.name} \${res.amount}\`,`;

const n = c.split(old).length - 1;
if (n !== 1) throw new Error(`MISS(${n}): skill-strike`);
c = c.replace(old, neu);
if (c.length < orig.length) throw new Error('拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log('ok', c.length, 'B');
