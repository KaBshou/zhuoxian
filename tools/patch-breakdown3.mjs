// 一次性补丁 v2：损伤详解数据（用各自唯一的 label 行做锚点；同时补 createBattle 初始化）
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

load('src/core/battle.ts');
repl('src/core/battle.ts',
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
repl('src/core/battle.ts',
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
repl('src/core/battle.ts',
  `    gemCostMulBySkill,`,
  `    gemCostMulBySkill,
    lastBreakdown: null,`,
  'create-init',
);
flush('src/core/battle.ts');
console.log('done');
