// 把渊痕测量口子接到 runInstrumentedSession 的 opts 上（此前只加了常量没传参）
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tools/run-timeline.mjs';
let t = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const oldOpts = [
  '      cycle: CYCLE,',
  '      ...(FARM_FROM === undefined ? {} : { farmFrom: FARM_FROM }),',
].join('\n');
const newOpts = [
  '      cycle: CYCLE,',
  '      marksStart: MARKS_START,',
  '      marksPolicy: MARKS_POLICY,',
  '      marksMod,',
  '      ...(FARM_FROM === undefined ? {} : { farmFrom: FARM_FROM }),',
].join('\n');
if (!t.includes(oldOpts)) throw new Error('MISS opts');
t = t.replace(oldOpts, newOpts);

fs.writeFileSync(path.join(ROOT, p), t, 'utf8');
console.log(`patched ${p} (${t.length})`);
