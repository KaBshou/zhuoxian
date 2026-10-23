// 一次性补丁：skills-battle.test.ts 适配「装配制」——
// 旧测试没填 gemLoadout，装配表为空 → gemModsBySkill 全空，断言 0>0 失败（预期内）。
// 修法：makeBattle 加可选 loadout 参数；命中测试里给角色装配 4 条玉简。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/tests/skills-battle.test.ts';
let c = fs.readFileSync(p, 'utf8');

const old1 = `function makeBattle(step = 0) {
  const ch = { ...createCharacter('yujian'), step };
  const p = playerBattleFromCharacter(ch);
  return { ch, state: createBattle(p, ch.turbid, ch) };
}`;
const neu1 = `function makeBattle(step = 0, gemLoadout?: string[]) {
  const ch = { ...createCharacter('yujian'), step, gemLoadout };
  const p = playerBattleFromCharacter(ch);
  return { ch, state: createBattle(p, ch.turbid, ch) };
}`;
if (!c.includes(old1)) { console.error('MISS helper'); process.exit(1); }
c = c.split(old1).join(neu1);

const old2 = `    // 寒水箭 tags = [spell, projectile, single, water]：命中所有 supports 含 spell 的玉简
    const { state } = makeBattle(4);`;
const neu2 = `    // 寒水箭 tags = [spell, projectile, single, water]：命中所有 supports 含 spell 的玉简。
    // 装配制（GEM_SLOTS=4）：必须显式装配，没装配 = 零玉简加成（旧「解锁即全开」已废）。
    const { state } = makeBattle(4, ['menggong', 'jinqie', 'guantou', 'duanjin']);`;
if (!c.includes(old2)) { console.error('MISS hanshui'); process.exit(1); }
c = c.split(old2).join(neu2);

const old3 = `    const { state: s18 } = makeBattle(18);`;
const neu3 = `    const { state: s18 } = makeBattle(18, ['menggong', 'jinqie', 'guantou', 'duanjin']);`;
if (!c.includes(old3)) { console.error('MISS fentian'); process.exit(1); }
c = c.split(old3).join(neu3);

fs.writeFileSync(p, c, 'utf8');
console.log('OK');
