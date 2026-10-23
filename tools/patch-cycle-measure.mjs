// 给测量工具加 --cycle（周目预置），不改产品逻辑
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(p, text, crlf) {
  fs.writeFileSync(path.join(ROOT, p), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}
function patch(p, edits) {
  const { text, crlf } = read(p);
  let t = text;
  for (const [tag, oldText, newText] of edits) {
    const at = t.indexOf(oldText);
    if (at < 0) throw new Error(`MISS ${p} :: ${tag}`);
    if (t.indexOf(oldText, at + 1) >= 0) throw new Error(`AMBIGUOUS ${p} :: ${tag}`);
    t = t.slice(0, at) + newText + t.slice(at + oldText.length);
  }
  if (t.length < text.length * 0.9) throw new Error(`SHRINK ${p}`);
  write(p, t, crlf);
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

patch('tools/session-runner.mjs', [
  [
    'opts cycle',
    "  const { classId, seed, tables, talentIds = [], autoTalents, minutes, dt, stopAtMaxStep = true } = opts;",
    "  const { classId, seed, tables, talentIds = [], autoTalents, minutes, dt, stopAtMaxStep = true, cycle = 0 } = opts;",
  ],
  [
    'createSession cycle',
    '  const s = sessionMod.createSession({\n    classId,\n    seed,\n    tables,\n    talentIds,',
    '  const s = sessionMod.createSession({\n    classId,\n    seed,\n    tables,\n    talentIds,\n    cycle,',
  ],
]);

patch('tools/run-timeline.mjs', [
  [
    'CYCLE const',
    "const POST_CAP = Boolean(args['post-cap']);",
    [
      "const POST_CAP = Boolean(args['post-cap']);",
      '// 周目预置（D130）：默认 0 = 初临。用来量「周目 N 的满级时长」，不改任何产品常量。',
      'const CYCLE = Math.max(0, Math.floor(Number(args.cycle ?? 0) || 0));',
    ].join('\n'),
  ],
  [
    'pass cycle',
    '      farmMode: FARM_MODE,',
    '      farmMode: FARM_MODE,\n      cycle: CYCLE,',
  ],
]);
console.log('done');
