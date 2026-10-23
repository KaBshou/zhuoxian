// 一次性补丁：寒水箭命中测试改用 step 9 + 可用玉简（guantou/duanjin unlock 9）。
// step 4 + ['mengong','cuijin',...] 里 spell 玉简（jixie）不在装配里 → hanshui 0 模组是「装错了」不是 bug。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/tests/skills-battle.test.ts';
let c = fs.readFileSync(p, 'utf8');

const old1 = "    const { state } = makeBattle(4, ['mengong', 'cuijin', 'guantou', 'duanjin']);";
const neu1 = "    // step 9 才有「命中 spell 的玉简」（贯头/断筋 unlock 9）；装配 = [攻击玉简, 破绽玉简×2]\n    const { state } = makeBattle(9, ['mengong', 'guantou', 'duanjin', 'cuijin']);";
if (!c.includes(old1)) { console.error('MISS 1'); process.exit(1); }
c = c.split(old1).join(neu1);

const old2 = "    const { state: s18 } = makeBattle(18, ['mengong', 'cuijin', 'guantou', 'duanjin']);";
if (c.includes(old2)) {
  c = c.split(old2).join("    const { state: s18 } = makeBattle(18, ['mengong', 'guantou', 'duanjin', 'cuijin']);");
  console.log('OK 2');
} else {
  console.log('SKIP 2 (no s18 line)');
}
fs.writeFileSync(p, c, 'utf8');
console.log('DONE');
