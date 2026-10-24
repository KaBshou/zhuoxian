// 一条命令走完发布前五道门。
//
// 为什么要它：手打几条命令一定会漏一条，而漏掉的那条通常是 `probe-dist`
// —— 它是唯一能在本地发现「部署到子路径后白屏」的检查（dev 里永远看不到）。
//
// 第五道门（D215）是「死接线审计」：找出「有实现、有测试、但产品路径从不调用」的导出。
// 由来是一串真实事故：D209 浊气觉醒的 chooseAscendancy 从 D1 起就存在、单测一直在跑，
// 但 src 下零调用 ⇒ 六条觉醒效果从来没生效；D207 天赋手动点、D205 floorMinutes、
// D213 四份重复几何都是同族。这类问题不会红、不会崩，只是「玩家永远看不见」。
// 它必须进门禁，否则只能靠人偶尔想起来扫一遍。
//
// 用法：node tools/gate.mjs
// 退出码：0 = 五道全绿；1 = 有红（并打印是哪一道）。
//
// 备注：这里用 spawnSync + stdio:'inherit'，不用 'pipe'。
// 本机沙箱下 Node 用默认 'pipe' 捕获子进程输出会 EPERM，而 'inherit' 不受限。

import { spawnSync } from 'node:child_process';

const GATES = [
  { name: '类型检查', args: ['npx', 'tsc', '--noEmit'] },
  { name: '单测', args: ['npx', 'vitest', 'run'] },
  { name: '死接线审计（D215）', args: ['node', 'tools/audit-dead-wiring.mjs', '--check'] },
  { name: '构建', args: ['npx', 'vite', 'build'] },
  { name: '产物自检（子路径）', args: ['node', 'tools/probe-dist.mjs'] },
];

const results = [];

for (const gate of GATES) {
  process.stdout.write(`\n${'='.repeat(60)}\n▶ ${gate.name}：${gate.args.join(' ')}\n${'='.repeat(60)}\n`);
  const started = Date.now();
  const r = spawnSync(gate.args[0], gate.args.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: process.cwd(),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const code = r.status ?? 1;
  results.push({ name: gate.name, code, seconds });

  if (code !== 0) {
    console.log(`\n❌ 第 ${results.length} 道门「${gate.name}」红了（exit ${code}，${seconds}s）—— 后面的门不再跑。`);
    console.log('   发布流程到此为止。修好再从头跑这五条，不要跳步。');
    process.exit(1);
  }
  console.log(`\n✅ 「${gate.name}」通过（${seconds}s）`);
}

console.log(`\n${'='.repeat(60)}`);
console.log('✅ 五道门全绿，可以发布');
console.log('='.repeat(60));
for (const [i, r] of results.entries()) console.log(`  ${i + 1}. ${r.name}：exit ${r.code}（${r.seconds}s）`);
console.log('\n产物：dist/（纯静态，拖到 Cloudflare Pages 或走 .github/workflows/deploy.yml）');
console.log('细节见 docs/DEPLOY.md。');
