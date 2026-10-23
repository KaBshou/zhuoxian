// 把成就面板接进 main.ts：面板名表 / 关提示 / 键位 J / 调试钩子
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

const pairs = [
  // 1) 面板名表
  [
    "  codex: '图鉴',\n  marks: '渊痕价目表',\n};",
    "  codex: '图鉴',\n  achievement: '成就',\n  marks: '渊痕价目表',\n};",
  ],
  // 2) 关闭提示表
  [
    "  codex: '（再按 K 或点按钮关闭）',\n  marks: '（再按 M 或点按钮关闭）',\n};",
    "  codex: '（再按 K 或点按钮关闭）',\n  achievement: '（再按 J 或点按钮关闭）',\n  marks: '（再按 M 或点按钮关闭）',\n};",
  ],
  // 3) 键位 J（放在 K 之后、M 之前）
  [
    "  if (e.code === 'KeyK') {\n    activatePanel('codex');\n    return;\n  }",
    "  if (e.code === 'KeyK') {\n    activatePanel('codex');\n    return;\n  }\n  // J = 成就（D87）：「有终点」的收集。只读面板，Escape 也由 activatePanel 之外的\n  // 上一条通用分支处理（面板只进不出是玩家最容易被骂的缺口，见 D91.1）。\n  if (renderer.achievementsVisible && e.code === 'Escape') {\n    e.preventDefault();\n    renderer.toggleAchievements();\n    session.log.push({ text: '关闭成就', color: '#6d665c', age: 0 });\n    return;\n  }\n  if (e.code === 'KeyJ') {\n    activatePanel('achievement');\n    return;\n  }",
  ],
];

for (const [oldText, newText] of pairs) {
  if (!raw.includes(oldText)) throw new Error(`MISS: ${oldText.slice(0, 60)}`);
  raw = raw.replace(oldText, newText);
}

if (raw.length < before) throw new Error('长度断言失败');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/main.ts.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`main.ts patched: ${before} -> ${raw.length}`);
