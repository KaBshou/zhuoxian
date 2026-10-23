import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
function rep(old, neu, tag) {
  if (!c.includes(old)) throw new Error('MISS ' + tag);
  if (c.split(old).length - 1 !== 1) throw new Error('AMBIGUOUS ' + tag);
  c = c.replace(old, neu);
}

// 1) imports：drainSoundCues 挂进 session 的 import 块
rep("  tickSession,\n  type GameSession,\n} from './core/session';",
    "  tickSession,\n  drainSoundCues,\n  type GameSession,\n} from './core/session';",
    'import-session');
rep("import { createLocalStorageAdapter } from './core/storage';",
    "import { createLocalStorageAdapter } from './core/storage';\nimport { createAudioEngine } from './core/audio';",
    'import-audio');

// 2) PANEL_NAME / PANEL_CLOSE_HINT 加 sound（虽然它不是面板，但类型是 Record，缺 key 会 tsc 报错）
rep("  save: '\u5b58\u6863',", "  save: '\u5b58\u6863',\n  sound: '\u97f3\u6548',", 'panel-name');
rep("  save: '\uff08\u518d\u6309 S \u6216\u70b9\u6309\u94ae\u5173\u95ed\uff09',",
    "  save: '\uff08\u518d\u6309 S \u6216\u70b9\u6309\u94ae\u5173\u95ed\uff09',\n  sound: '',",
    'panel-hint');

// 3) activatePanel：sound 在「一次只开一个面板」之前就返回（它不是面板，不该关别人）
rep("function activatePanel(id: HudButtonId): void {\n  if (phase !== 'play') return;",
    "function activatePanel(id: HudButtonId): void {\n  if (phase !== 'play') return;\n  // 音效不是面板：不参与「一次只开一个」的互斥，也不该顺手关掉玩家正开着的面板。\n  if (id === 'sound') {\n    toggleSound();\n    return;\n  }",
    'activate-sound');

// 4) toggleSound：引擎 + 存档 + 渲染器三处保持同步，一处都不许漏
rep("/**\n * 鼠标 / 触屏。",
    "/**\n * 切换音效静音（D181）。\n *\n * 三处必须同步：引擎（真正发不发）、存档（刷新后还算数）、渲染器（按钮高亮）。\n * 只改引擎的话，玩家刷新一次声音又回来了 —— 这类小事最招骂。\n */\nfunction toggleSound(): void {\n  const muted = audio.toggleMute();\n  session.character = { ...session.character, muted };\n  renderer.setSoundMuted(muted);\n  autosaver.saveNow();\n  session.log.push({\n    text: muted ? '\u97f3\u6548\u5df2\u5173\u95ed' : '\u97f3\u6548\u5df2\u5f00\u542f',\n    color: muted ? '#6d665c' : '#8eeae2',\n    age: 0,\n  });\n  // 开的时候顺手解锁并播一声：让玩家立刻听到「确实开了」，不用等下一次打怪。\n  if (!muted) {\n    audio.unlock();\n    audio.play('ui');\n  }\n}\n\n/**\n * 鼠标 / 触屏。",
    'toggleSound');

fs.writeFileSync(P, c, 'utf8');
console.log('OK', before, '->', c.length);
