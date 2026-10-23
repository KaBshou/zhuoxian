// 诊断 7：'menggong' vs 'mengong' —— 拼写！查测试与诊断脚本里传的是哪个。跑完即弃。
import fs from 'node:fs';
for (const p of [
  'F:/dsh-work/zhuoxian/tests/skills-battle.test.ts',
  'F:/dsh-work/zhuoxian/tools/diag-gemloadout2.mjs',
  'F:/dsh-work/zhuoxian/tools/diag-gemloadout3.mjs',
]) {
  const c = fs.readFileSync(p, 'utf8');
  const hits = c.match(/meng(?:g?o)n?g?/g) || [];
  console.log(p);
  console.log('  mengong:', (c.match(/'mengong'/g) || []).length, ' menggong:', (c.match(/'menggong'/g) || []).length);
}
