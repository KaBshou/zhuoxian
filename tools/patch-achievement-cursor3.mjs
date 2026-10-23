// 成就光标（第三轮）：只做真正的几处改动，每处锚点都先探测再改
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

function mustReplace(oldText, newText, tag) {
  if (!raw.includes(oldText)) throw new Error(`MISS ${tag}`);
  raw = raw.replace(oldText, newText);
}

// 1) import 修正：ACHIEVEMENT_TOTAL 从 data/achievements 取
mustReplace(
  "import {\n  ACHIEVEMENT_TOTAL,\n  achievementEntries,\n  achievementSummary,\n  moveAchievementCursor,\n} from './core/achievement';",
  "import { achievementEntries, achievementSummary, moveAchievementCursor } from './core/achievement';\nimport { ACHIEVEMENT_TOTAL } from './data/achievements';",
  'import',
);

// 2) activatePanel 分支
mustReplace(
  "  } else if (id === 'codex') {\n    renderer.toggleCodex();\n    codexCursor = moveCodexCursor(codexCursor, 0, CODEX_TOTAL);\n    renderer.setCodexCursor(codexCursor);\n  } else {\n    renderer.toggleMarksPanel();\n  }",
  [
    "  } else if (id === 'codex') {",
    '    renderer.toggleCodex();',
    '    codexCursor = moveCodexCursor(codexCursor, 0, CODEX_TOTAL);',
    '    renderer.setCodexCursor(codexCursor);',
    "  } else if (id === 'achievement') {",
    '    renderer.toggleAchievements();',
    '    // 条目数会随版本变（现在 20），打开时按总数夹一次',
    '    achievementCursor = moveAchievementCursor(achievementCursor, 0, ACHIEVEMENT_TOTAL);',
    '    renderer.setAchievementCursor(achievementCursor);',
    '  } else {',
    '    renderer.toggleMarksPanel();',
    '  }',
  ].join('\n'),
  'activatePanel',
);

// 3) 光标状态变量（必须是 let，且在使用点之前声明）
mustReplace(
  'let codexCursor = 0;',
  ['let codexCursor = 0;', '// 成就光标权威在 main.ts（渲染器只持本帧副本，与图鉴/神通同一条纪律）', 'let achievementCursor = 0;'].join('\n'),
  'cursor decl',
);

// 4) 钩子实现
mustReplace(
  '    achievementFacts: () => sessionAchievementFacts(session),',
  ['    achievementFacts: () => sessionAchievementFacts(session),', '    get achievementCursor() {', '      return achievementCursor;', '    },'].join('\n'),
  'hook impl',
);

// 5) 钩子类型
mustReplace(
  '      achievementFacts(): {',
  ['      /** 成就光标（探针断言「方向键真的动了光标」） */', '      readonly achievementCursor: number;', '      achievementFacts(): {'].join('\n'),
  'hook type',
);

if (raw.length < before) throw new Error('长度断言失败');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/main.ts.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`main.ts patched: ${before} -> ${raw.length}`);
