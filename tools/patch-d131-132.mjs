// D131/D132：渊痕倍率钳 ×4 + 三条周目成就（20 → 23 条 / 385k → 480k）
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

patch('src/data/cycles.ts', [
  [
    'marks cap const',
    '/** 每周目渊痕产出加成（线性：第 N 周目 = 1 + N × 1.0 = 基础 × (N+1)） */\nexport const CYCLE_MARKS_PER = 1;',
    [
      '/** 每周目渊痕产出加成（线性：第 N 周目 = 1 + N × 1.0 = 基础 × (N+1)） */',
      'export const CYCLE_MARKS_PER = 1;',
      '',
      '/**',
      ' * 渊痕倍率上限（D131）：钳在 ×4。',
      ' *',
      ' * 锚 =「最深一档沉淀 ≥ 1 小时」：夺造化 3.6M ÷ (15 627 × 4) = 57.6min。',
      ' * 不钳的话第 20 周目就是 ×21 ⇒ 11min，渊痕三档全部失去沉淀意义（D45 的有界强化）。',
      ' * 同理绝不做 2^N：渊痕是**固定价**的沉淀货币，指数收入会直接打穿沉淀。',
      ' */',
      'export const CYCLE_MARKS_MAX = 4;',
    ].join('\n'),
  ],
  [
    'marks clamp',
    'export function cycleMarksMul(cycle: number): number {\n  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;\n  return 1 + CYCLE_MARKS_PER * c;\n}',
    'export function cycleMarksMul(cycle: number): number {\n  const c = Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;\n  return Math.min(CYCLE_MARKS_MAX, 1 + CYCLE_MARKS_PER * c);\n}',
  ],
]);

patch('src/data/achievements.ts', [
  [
    'facts cycle',
    '  /** 身上已穿的仙品件数 */\n  readonly xianEquipped: number;\n}',
    '  /** 身上已穿的仙品件数 */\n  readonly xianEquipped: number;\n  /** 当前周目（D132：周目是唯一能提供 10 档以上连续刻度的轴） */\n  readonly cycle: number;\n}',
  ],
  ['empty facts cycle', '  xianEquipped: 0,\n};', '  xianEquipped: 0,\n  cycle: 0,\n};'],
  [
    'cycle defs',
    '  // ── 死亡（幽默的一条，也是"失败不惩罚"的教学）───────────────',
    [
      '  // ── 周目（D132）：唯一的「10 档以上连续刻度」轴。',
      '  // §5.8 体检：20 条里 17 条挤在练级段、满级后只剩 3 条、最大空档 7.6h；',
      '  // cycle-10（≈40h+）正好接住那一段空白。奖励档按梯子位置：前段 15k / 中段 30k / 后段 50k。',
      "  { id: 'cycle-1', name: '再入浊世', desc: '完成第 1 次轮回。', target: 1, reward: 15000, progress: (f) => min(f.cycle, 1) },",
      "  { id: 'cycle-3', name: '三周不悔', desc: '完成第 3 次轮回。', target: 3, reward: 30000, progress: (f) => min(f.cycle, 3) },",
      "  { id: 'cycle-10', name: '十轮如一', desc: '完成第 10 次轮回。', target: 10, reward: 50000, progress: (f) => min(f.cycle, 10) },",
      '  // ── 死亡（幽默的一条，也是"失败不惩罚"的教学）───────────────',
    ].join('\n'),
  ],
]);

patch('src/core/session.ts', [
  [
    'facts cycle',
    '    xianEquipped: xianEquippedCount(s.character),\n  };',
    '    xianEquipped: xianEquippedCount(s.character),\n    cycle: s.cycle,\n  };',
  ],
]);
console.log('done');
