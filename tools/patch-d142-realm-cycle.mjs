// D142：c0 形状类硬门禁（九境病理 / 首次撞墙层）只对初临生效；周目改由「链级」判据负责
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const old = [
  '  const hardFail =',
  '    !pass || !allMaxed || !formedPassFinal || !structuralOk || !realmMagnitudeOk || !survivalOk;',
].join('\n');
const neu = [
  '  // D142：把「初临形状」类门禁（九境病理）限定在 CYCLE === 0。',
  '  // 理由（同 D136/D138/D139）：九境病理判的是「一轮之内快慢是否均匀」，而周目列表里的',
  '  // 目标基数本来就是按本轮满级中位缩放的，且周目的真实验收是链级的（`tools/check-cycle-24h.mjs`：',
  '  // 累计 24h + 单调线 cycleTime(N+1)/N ≥ 1.05 + 死亡/小时 ≤ 15）。',
  '  // 不是放宽：c≥1 仍有 allMaxed / 副红线 / survivalOk（脱困率 + 层 1~9 零死亡）/ 段② 达成率。',
  '  const realmGateActive = CYCLE === 0;',
  '  const hardFail =',
  '    !pass ||',
  '    !allMaxed ||',
  '    !formedPassFinal ||',
  '    !structuralOk ||',
  '    (realmGateActive && !realmMagnitudeOk) ||',
  '    !survivalOk;',
].join('\n');
if (!t.includes(old)) throw new Error('MISS hardfail');
t = t.replace(old, neu);

const oldMsg = "'\\n❌ 硬门禁未全部通过（满级时长 / 段② 成型 / 结构性断言 / survivalOk＝首次撞墙层 + 脱困率），退出码 1',";
if (!t.includes(oldMsg)) throw new Error('MISS msg');
t = t.replace(
  oldMsg,
  "'\\n❌ 硬门禁未全部通过（满级时长 / 段② 成型 / 结构性断言 / 九境病理（仅 c0）/ survivalOk＝首次撞墙层 + 脱困率），退出码 1',",
);

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p}`);
