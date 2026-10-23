// 成就光标（第二轮）：activatePanel 分支 + 光标状态 + 调试钩子 + import 来源修正
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

const pairs = [
  // 1) ACHIEVEMENT_TOTAL 来自 data/achievements，不是 core/achievement
  [
    "import {\n  ACHIEVEMENT_TOTAL,\n  achievementEntries,\n  achievementSummary,\n  moveAchievementCursor,\n} from './core/achievement';",
    "import { achievementEntries, achievementSummary, moveAchievementCursor } from './core/achievement';",
  ],
  // 2) 补数据表 import
  [
    "import { TUTORIAL_LENGTH, advanceTutorial, clampTutorialIndex, currentTutorialStep, tutorialFinished, tutorialProgressText } from './core/onboarding';",
    "import { TUTORIAL_LENGTH, advanceTutorial, clampTutorialIndex, currentTutorialStep, tutorialFinished, tutorialProgressText } from './core/onboarding';",
  ],
  // 3) activatePanel 加 achievement 分支（原来会掉进 else → 打开渊痕价目表，按 J 开 M 的面板）
  [
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
  ],
  // 4) 光标状态变量
  [
    'let codexCursor = 0;',
    ['let codexCursor = 0;', '// 成就光标权威在 main.ts（渲染器只持本帧副本，与图鉴/神通同一条纪律）', 'let achievementCursor = 0;'].join('\n'),
  ],
  // 5) 调试钩子实现
  [
    '    achievementFacts: () => sessionAchievementFacts(session),',
    [
      '    achievementFacts: () => sessionAchievementFacts(session),',
      '    get achievementCursor() {',
      '      return achievementCursor;',
      '    },',
    ].join('\n'),
  ],
  // 6) 调试钩子类型
  [
    '      achievementFacts(): {',
    ['      /** 成就光标（探针断言「方向键真的动了光标」） */', '      readonly achievementCursor: number;', '      achievementFacts(): {'].join('\n'),
  ],
];

for (const [oldText, newText] of pairs) {
  if (!raw.includes(oldText)) throw new Error(`MISS: ${oldText.slice(0, 60)}`);
  raw = raw.replace(oldText, newText);
}

// 4') 数据表 import（单独处理，避免与上面 2 的 no-op 混淆）
const dataAnchor = "import { codexUnlockText } from './core/codex';";
if (raw.includes(dataAnchor)) throw new Error('unexpected codex import shape');
if (!raw.includes("from './data/achievements'")) {
  const anchor2 = "import { ACHIEVEMENT_TOTAL } from './core/achievement';";
  if (raw.includes(anchor2)) {
    raw = raw.replace(anchor2, "import { ACHIEVEMENT_TOTAL } from './data/achievements';");
  } else {
    const firstImport = raw.indexOf("import { ALL_MONSTERS");
    if (firstImport < 0) throw new Error('MISS data import anchor');
    raw = raw.slice(0, firstImport) + "import { ACHIEVEMENT_TOTAL } from './data/achievements';\n" + raw.slice(firstImport);
  }
}

if (raw.length < before) throw new Error('长度断言失败');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/main.ts.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`main.ts achievement cursor patched: ${before} -> ${raw.length}`);
