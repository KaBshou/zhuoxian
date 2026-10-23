// patch-talent1.mjs — 把 talentIds 接进 CharacterState + import
import fs from 'node:fs';

function repl(p, old, neu, tag) {
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes(old)) throw new Error('MISS ' + tag);
  if (c.split(old).length - 1 !== 1) throw new Error('NOT-UNIQUE ' + tag);
  c = c.replace(old, neu);
  fs.writeFileSync(p, c, 'utf8');
}

// character.ts: 加字段
repl(
  'src/core/character.ts',
  '  /** 浊气状态 */\n  readonly turbid: TurbidState;\n}',
  '  /** 浊气状态 */\n  readonly turbid: TurbidState;\n  /** 已点的周天图节点 id（可选：老档没有也能读）。\n   *  只存「点了什么」；点数余额 = 收入（纯函数）- 已花，不入档。 */\n  readonly talentIds?: string[];\n}',
  'char-talentIds',
);

// character.ts: import talentModifiers（挂在 turbid import 后面）
repl(
  'src/core/character.ts',
  "import type { TurbidState } from './turbid';",
  "import type { TurbidState } from './turbid';\nimport { talentModifiers } from './talents-runtime';",
  'char-import',
);

// talent-def.ts: 删 TRUNK_IDS 占位段（talents.ts 没用它）
let c = fs.readFileSync('src/data/talent-def.ts', 'utf8');
const i = c.indexOf('/** 主干链（顺序即点序），全职业共享 */');
if (i > 0) {
  c = c.slice(0, i).trimEnd() + '\n';
  fs.writeFileSync('src/data/talent-def.ts', c, 'utf8');
  console.log('trunk placeholder removed');
} else {
  console.log('trunk placeholder already gone');
}

console.log('done');
