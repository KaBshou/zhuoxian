// 一次性补丁：D36-B 接线（键盘 ← → 选层 + 调试钩子 + 右下角提示）
import fs from 'node:fs';

const ROOT = 'F:/dsh-work/zhuoxian';
const files = {};
function load(rel) {
  const p = `${ROOT}/${rel}`;
  const c = fs.readFileSync(p, 'utf8');
  files[rel] = { p, orig: c, cur: c };
  fs.writeFileSync(`${ROOT}/tools/_bak/${rel.replace(/\//g, '_')}.${Date.now()}.bak`, c, 'utf8');
}
function repl(rel, old, neu, tag) {
  const f = files[rel];
  const n = f.cur.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}) ${rel}: ${tag}`);
  f.cur = f.cur.replace(old, neu);
  console.log('ok:', rel, tag);
}
function flush(rel) {
  const f = files[rel];
  if (f.cur.length < f.orig.length * 0.98) throw new Error(`拒绝写盘 ${rel}`);
  fs.writeFileSync(f.p, f.cur, 'utf8');
  console.log('flush', rel, f.cur.length, 'B');
}

// ── main.ts：键盘选层 + 钩子 ─────────────────────────────
load('src/main.ts');
repl('src/main.ts',
  `import { createSession, startWave, tickSession, type GameSession } from './core/session';`,
  `import {
  createSession,
  floorSelectableMax,
  setFloor,
  startWave,
  tickSession,
  type GameSession,
} from './core/session';`,
  'imports',
);
repl('src/main.ts',
  `loop.start();`,
  `loop.start();

// ── 3.5 回刷选层（D36-B）────────────────────────────────────
// 左右方向键回刷已到过的层。只在「可回刷」时才响应，越界会被 setFloor 拒绝并给一条日志。
window.addEventListener('keydown', (e) => {
  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
  e.preventDefault();
  const max = floorSelectableMax(session);
  const next = session.floor + (e.code === 'ArrowRight' ? 1 : -1);
  if (!setFloor(session, next)) {
    if (next > max) {
      session.log.push({ text: \`第 \${next} 层还没到过（当前最深 \${max} 层）\`, color: '#6d665c', age: 0 });
    } else if (next < 1) {
      session.log.push({ text: '已经在最深处的第 1 层', color: '#6d665c', age: 0 });
    }
  }
  autosaver.saveNow();
});`,
  'keydown',
);
repl('src/main.ts',
  `      /** 清档（探针验收新号流程用） */
      reset(): void;`,
  `      /** 清档（探针验收新号流程用） */
      reset(): void;
      /** 回刷选层（探针验收 D36-B 用）：返回是否真的换了层 */
      selectFloor(floor: number): boolean;
      /** 当前可选层上限 */
      floorSelectableMax(): number;`,
  'hook-types',
);
repl('src/main.ts',
  `    reset: () => {
      autosaver.clear();
      location.reload();
    },`,
  `    reset: () => {
      autosaver.clear();
      location.reload();
    },
    selectFloor: (floor: number) => {
      const ok = setFloor(session, floor);
      if (ok) autosaver.saveNow();
      return ok;
    },
    floorSelectableMax: () => floorSelectableMax(session),`,
  'hook-impl',
);
flush('src/main.ts');

// ── battle-renderer.ts：右下角加操作提示 ─────────────────
load('src/render/battle-renderer.ts');
repl('src/render/battle-renderer.ts',
  `      \`第 \${s.wave} 波　\${s.floor} 层　击杀 \${s.battle.kills}　掉落 \${s.dropsFound}\`,`,
  `      \`第 \${s.wave} 波　\${s.floor} 层　击杀 \${s.battle.kills}　掉落 \${s.dropsFound}　←→ 回刷\`,`,
  'hint',
);
flush('src/render/battle-renderer.ts');
console.log('done');
