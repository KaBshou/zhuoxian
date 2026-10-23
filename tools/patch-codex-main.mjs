// D87 图鉴接线（main.ts 部分）：import + 光标 + K 键/方向键
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const file = 'src/main.ts';
const raw = readFileSync(file, 'utf8');
let c = raw;

const pairs = [
  [
    'import codex',
    `  resetGemLoadout,
} from './core/gem-edit';`,
    `  resetGemLoadout,
} from './core/gem-edit';
import { CODEX_TOTAL, codexProgress, moveCodexCursor } from './core/codex';`,
  ],
  [
    '光标状态',
    `let skillCursor = { skill: 0, slot: 0 };`,
    `let skillCursor = { skill: 0, slot: 0 };
/** 图鉴光标（绝对行号 0..CODEX_TOTAL-1）。和神通面板不会同时开，各存一份 */
let codexCursor = 0;`,
  ],
  [
    'K 键接管',
    `  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）`,
    `  // K = 图鉴（"我收集到哪了"的答案，D87）。
  // 打开时接管 ↑↓ 翻条目：否则方向键会顺手去回刷层 —— 和神通面板是同一个冲突。
  if (renderer.codexVisible) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      codexCursor = moveCodexCursor(codexCursor, e.code === 'ArrowDown' ? 1 : -1, CODEX_TOTAL);
      renderer.setCodexCursor(codexCursor);
      return;
    }
    if (e.code === 'KeyK' || e.code === 'Escape') {
      e.preventDefault();
      renderer.toggleCodex();
      session.log.push({ text: '关闭图鉴', color: '#6d665c', age: 0 });
      return;
    }
  }
  if (e.code === 'KeyK') {
    const on = renderer.toggleCodex();
    if (on) {
      codexCursor = moveCodexCursor(codexCursor, 0, CODEX_TOTAL);
      renderer.setCodexCursor(codexCursor);
      const p = codexProgress(session.codex);
      session.log.push({
        text: '打开图鉴（浊物 ' + p.monsters.got + '/' + p.monsters.total + ' · 传奇 ' + p.legendaries.got + '/' + p.legendaries.total + '）',
        color: '#d4a13c',
        age: 0,
      });
    } else {
      session.log.push({ text: '关闭图鉴', color: '#6d665c', age: 0 });
    }
    return;
  }
  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）`,
  ],
];

for (const [tag, oldText, newText] of pairs) {
  if (!c.includes(oldText)) throw new Error(`MISS ${file} :: ${tag}`);
  c = c.replace(oldText, newText);
}
if (c.length < raw.length) throw new Error(`长度异常 ${file}: ${raw.length} → ${c.length}`);
mkdirSync('tools/_bak', { recursive: true });
copyFileSync(file, `tools/_bak/${file.replace(/[\\/]/g, '_')}.bak`);
writeFileSync(file, c, 'utf8');
console.log(`patched ${file}: ${raw.length} → ${c.length} chars`);
