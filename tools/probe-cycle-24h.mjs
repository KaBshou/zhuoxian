/**
 * 盘子里的「24h 周目链」验收位（D138）。
 *
 * 它本身不模拟，只读 `run-timeline` 的 4 份 json（c0..c3）后用 `check-cycle-24h.mjs` 判三条硬线：
 *   ① 累计满级时长 ∈ 24h ±15%；② 相邻周目必须更慢（≥1.05）；③ 死亡 ≤15 次/小时。
 *
 * ⚠ 产物缺失时必须 **SKIP**（不进分母、exit 0），不许红：
 *   这些 json 来自 4 条 `run-timeline --cycle=N --seeds=12 --minutes=900 --post-cap`，合计约 15 分钟。
 *   如果盘子在缺产物时判红，盘子就等于「依赖一次 15 分钟的手工模拟」，任何人换机器/清 tmp 都会
 *   看到一条毫无信息量的红。SKIP 行会明确写出「需先跑哪条命令」。
 *
 * 用法：
 *   node tools/probe-cycle-24h.mjs                       # 默认 tmp/base-c0..c3.json
 *   node tools/probe-cycle-24h.mjs tmp/a0.json ... 3个   # 显式指定 4 份产物
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const argv = process.argv.slice(2).filter((a) => !a.startsWith('http'));
const files = argv.length ? argv : [0, 1, 2, 3].map((c) => path.join('tmp', `base-c${c}.json`));

const missing = files.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.log(`SKIP  24h 周目链（产物缺失 ${missing.length}/${files.length}：${missing.join(', ')}）`);
  console.log('      需先跑 4 条：node tools/run-timeline.mjs --cycle=0 --seeds=12 --minutes=900 --post-cap --talents=off --json=tmp/base-c0.json');
  console.log('                    （--cycle=1/2/3 同理，约 15 分钟；跑完这些文件自动出现）');
  process.exit(0);
}

const res = spawnSync(process.execPath, [path.join(HERE, 'check-cycle-24h.mjs'), ...files], {
  encoding: 'utf8',
});
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

const ok = res.status === 0;
console.log('');
console.log(ok ? '通过 1/1  24h 周目链（累计 / 单调 / 死亡比例）' : '结果：0/1 通过   24h 周目链（见上面 ❌ 行）');
process.exitCode = ok ? 0 : 1;
