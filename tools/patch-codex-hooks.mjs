// D87 图鉴调试钩子（探针用）：type 声明 + window.__zhuoxian 实现
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const file = 'src/main.ts';
const raw = readFileSync(file, 'utf8');
let c = raw;

const pairs = [
  [
    'type 声明',
    `      /** 神通面板光标（探针断言「方向键真的动了光标」） */
      readonly skillCursor: { readonly skill: number; readonly slot: number };`,
    `      /** 神通面板光标（探针断言「方向键真的动了光标」） */
      readonly skillCursor: { readonly skill: number; readonly slot: number };
      /** 图鉴收集进度（探针验收用；百分比是算出来的，不是存的） */
      codex(): { readonly monsters: { got: number; total: number }; readonly legendaries: { got: number; total: number }; readonly percent: number };
      /** 图鉴行（固定顺序：15 浊物 + 9 传奇）。探针不许写死条目数与顺序 */
      codexRows(): Array<{ readonly kind: string; readonly id: string; readonly name: string; readonly unlocked: boolean }>;
      /** 图鉴光标（探针断言「方向键真的动了光标」） */
      readonly codexCursor: number;
      /** 图鉴收集阈值注入（探针造「收集到一半」用；脏 id 会被安静丢弃） */
      unlockCodex(ids: readonly string[]): void;`,
  ],
  [
    '实现',
    `    toggleBreakdown: () => renderer.toggleBreakdown(),`,
    `    toggleBreakdown: () => renderer.toggleBreakdown(),
    codex: () => {
      const p = codexProgress(session.codex);
      return { monsters: p.monsters, legendaries: p.legendaries, percent: p.percent };
    },
    codexRows: () =>
      codexEntries(session.codex).map((e) => ({ kind: e.kind, id: e.id, name: e.name, unlocked: e.unlocked })),
    get codexCursor() {
      return codexCursor;
    },
    unlockCodex: (ids: readonly string[]) => {
      // 探针造场景用：走的是同一个 record 函数，不绕过 sanitize
      let next = session.codex;
      for (const id of ids) {
        next = recordMonsterKill(next, id);
        next = recordLegendary(next, id);
      }
      next = sanitizeCodex(next);
      session.codex = next;
      autosaver.saveNow();
    },`,
  ],
  [
    'import codex 函数',
    `import { CODEX_TOTAL, codexProgress, moveCodexCursor } from './core/codex';`,
    `import {
  CODEX_TOTAL,
  codexEntries,
  codexProgress,
  moveCodexCursor,
  recordLegendary,
  recordMonsterKill,
  sanitizeCodex,
} from './core/codex';`,
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
