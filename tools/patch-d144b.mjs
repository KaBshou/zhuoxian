// D144b：周目号要能从两处拿到 —— run-timeline 的 verdict.cycle（新产物）+ 命令行 --cycle=N（老产物）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');

// ① run-timeline 的 verdict 加 cycle（新产物自带，_segments 就不用问命令行）
{
  const p = 'tools/run-timeline.mjs';
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  const old = '        wallGateActive,';
  const neu = '        wallGateActive,\n        cycle: CYCLE,';
  if (!t.includes(old)) throw new Error('MISS verdict');
  t = t.replace(old, neu);
  fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log(`patched ${p}`);
}

// ② _segments 的周目号：命令行优先（老 json 没有 verdict.cycle）
{
  const p = 'tools/_segments.mjs';
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  const old = 'const CYCLE = Number(j.verdict?.cycle ?? 0);';
  const neu = [
    'const cycleArg = (process.argv.slice(2).find((a) => a.startsWith("--cycle=")) ?? "").replace("--cycle=", "");',
    'const CYCLE = Number(cycleArg !== "" ? cycleArg : (j.verdict?.cycle ?? 0));',
    'if (!Number.isFinite(CYCLE)) throw new Error("周目号读不到（既没有 --cycle=，verdict 里也没有 cycle）");',
  ].join('\n');
  if (!t.includes(old)) throw new Error('MISS cycle');
  t = t.replace(old, neu);
  fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
  console.log(`patched ${p}`);
}
