// shuzhi 定稿：删 floor-10 / floor-28（与 clear-9 / clear-27 同事件），补 codex-m-12 / xian-3
import fs from 'node:fs';

function patch(path, pairs) {
  let raw = fs.readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  const nl = crlf ? '\r\n' : '\n';
  raw = raw.replace(/\r\n/g, '\n');
  const before = raw.length;
  for (const [oldText, newText] of pairs) {
    if (!raw.includes(oldText)) throw new Error(`MISS in ${path}: ${oldText.slice(0, 60)}`);
    raw = raw.replace(oldText, newText);
  }
  if (raw.length === before) throw new Error(`没有变化 ${path}`);
  if (crlf) raw = raw.replace(/\n/g, nl);
  fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/${path.split('/').pop()}.${Date.now()}.bak`, fs.readFileSync(path));
  fs.writeFileSync(path, raw);
  console.log(`${path.split('/').pop()}: ${before} -> ${raw.length}`);
}

patch('F:/dsh-work/zhuoxian/src/data/achievements.ts', [
  // 删两条与通关重复的层数成就
  [
    "  { id: 'floor-10', name: '入玄', desc: '走到渊层第十层。', target: 10, reward: 5000, progress: (f) => min(f.maxFloor, 10) },\n",
    '',
  ],
  [
    "  { id: 'floor-28', name: '无尽之门', desc: '走进无尽层（第二十八层）。', target: 28, reward: 30000, progress: (f) => min(f.maxFloor, 28) },\n",
    '',
  ],
  // 补两条中段（shuzhi：锚 ~50min / ~80min，正好中段 15k）
  [
    "  { id: 'codex-m-15', name: '识渊', desc: '图鉴收录全部 15 种浊物。', target: 15, reward: 30000, progress: (f) => min(f.codexMonsters, 15) },",
    [
      "  { id: 'codex-m-12', name: '半卷', desc: '图鉴收录 12 种浊物。', target: 12, reward: 15000, progress: (f) => min(f.codexMonsters, 12) },",
      "  { id: 'codex-m-15', name: '识渊', desc: '图鉴收录全部 15 种浊物。', target: 15, reward: 30000, progress: (f) => min(f.codexMonsters, 15) },",
    ].join('\n'),
  ],
  [
    "  { id: 'xian-1', name: '一仙在身', desc: '身上带 1 件仙品。', target: 1, reward: 5000, progress: (f) => min(f.xianEquipped, 1) },",
    [
      "  { id: 'xian-1', name: '一仙在身', desc: '身上带 1 件仙品。', target: 1, reward: 5000, progress: (f) => min(f.xianEquipped, 1) },",
      "  { id: 'xian-3', name: '三仙随身', desc: '身上带 3 件仙品。', target: 3, reward: 15000, progress: (f) => min(f.xianEquipped, 3) },",
    ].join('\n'),
  ],
]);

patch('F:/dsh-work/zhuoxian/tests/achievement.test.ts', [
  // 层数现在只剩两个节点（10 / 28 与通关重复，shuzhi 定稿删掉）
  [
    "  it('层数四档走阶位边界 10 / 19 / 28 / 46', () => {\n    const targets = ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('floor-')).map((d) => d.target);\n    expect(targets.sort((a, b) => a - b)).toEqual([10, 19, 28, 46]);\n  });",
    [
      "  it('层数只留不与通关重复的节点（19 / 46）：10 与 28 分别等价于清完 9 层/27 层', () => {",
      "    const targets = ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('floor-')).map((d) => d.target);",
      '    expect(targets.sort((a, b) => a - b)).toEqual([19, 46]);',
      '    // 同事件发两次奖励 = 玩家以为在追两个进度（shuzhi v4.43 定稿）',
      "    expect(ACHIEVEMENT_DEFS.some((d) => d.id === 'floor-10')).toBe(false);",
      "    expect(ACHIEVEMENT_DEFS.some((d) => d.id === 'floor-28')).toBe(false);",
      '  });',
    ].join('\n'),
  ],
  // 空档那条：只剩 floor-19/46 会是 1
  [
    "      // EMPTY_FACTS.maxFloor = 1（玩家一开始就站在第 1 层）⇒ 四条「走到第 N 层」的进度都是 1，其余全 0\n      expect(e.progress).toBe(e.id.startsWith('floor-') ? 1 : 0);",
    "      // EMPTY_FACTS.maxFloor = 1（玩家一开始就站在第 1 层）⇒ 「走到第 N 层」的进度都是 1，其余全 0\n      expect(e.progress).toBe(e.id.startsWith('floor-') ? 1 : 0);",
  ],
]);
