// 给 main.ts 加成就调试钩子 + 底部提示行「J 成就」
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

// 1) 类型声明：放在 codex 钩子之后
const declAnchor = '      /** 右上角按钮条的真实布局（探针按它取点击坐标，不许自己抄常量） */';
if (!raw.includes(declAnchor)) throw new Error('MISS decl anchor');
raw = raw.replace(
  declAnchor,
  [
    '      /** 成就进度（面板标题那一行用的同一份口径） */',
    '      achievements(): {',
    '        readonly got: number;',
    '        readonly total: number;',
    '        readonly percent: number;',
    '        readonly rewardsEarned: number;',
    '        readonly rewardsTotal: number;',
    '      };',
    '      /** 成就行（固定顺序；探针不许写死条目数） */',
    '      achievementRows(): Array<{',
    '        readonly id: string;',
    '        readonly name: string;',
    '        readonly desc: string;',
    '        readonly progress: number;',
    '        readonly target: number;',
    '        readonly unlocked: boolean;',
    '        readonly reward: number;',
    '      }>;',
    '      /** 成就事实（探针造场景用：偷看现算口径，与面板同一份） */',
    '      achievementFacts(): {',
    '        readonly kills: number;',
    '        readonly maxFloor: number;',
    '        readonly clearedFloors: number;',
    '        readonly codexMonsters: number;',
    '        readonly codexLegendaries: number;',
    '        readonly step: number;',
    '        readonly deaths: number;',
    '        readonly xianEquipped: number;',
    '      };',
    declAnchor,
  ].join('\n'),
);

// 2) 实现：放在 hudButtons 实现之前
const implAnchor = '    // 触屏/鼠标验收用：按钮真实布局 + 卡片真实矩形。探针不许自己抄一套坐标常量';
if (!raw.includes(implAnchor)) throw new Error('MISS impl anchor');
raw = raw.replace(
  implAnchor,
  [
    '    // 成就（D87）：面板标题与行都从这里取，探针不用自己算阈值',
    '    achievements: () => achievementSummary(session.achievements),',
    '    achievementRows: () => achievementEntries(session.achievements, sessionAchievementFacts(session)),',
    '    achievementFacts: () => sessionAchievementFacts(session),',
    implAnchor,
  ].join('\n'),
);

// 3) import
const importAnchor = "} from './core/codex';";
if (!raw.includes(importAnchor)) throw new Error('MISS import anchor: codex');
raw = raw.replace(
  importAnchor,
  [
    importAnchor,
    "import { achievementEntries, achievementSummary } from './core/achievement';",
  ].join('\n'),
);

if (!raw.includes("import { hitTestHudButtons")) throw new Error('MISS hud import sanity');

// sessionAchievementFacts：检查是否已经从 session 导入
if (!raw.includes('sessionAchievementFacts')) {
  const sessionImport = "} from './core/session';";
  if (!raw.includes(sessionImport)) throw new Error('MISS session import');
  raw = raw.replace(sessionImport, "  sessionAchievementFacts,\n" + sessionImport);
}

if (raw.length < before) throw new Error('长度断言失败');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/main.ts.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`main.ts hooks patched: ${before} -> ${raw.length}`);
