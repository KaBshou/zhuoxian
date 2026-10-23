import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
function rep(old, neu, tag) {
  if (!c.includes(old)) throw new Error('MISS ' + tag);
  if (c.split(old).length - 1 !== 1) throw new Error('AMBIGUOUS ' + tag);
  c = c.replace(old, neu);
}

// 1) 渲染器建好后立刻同步静音状态（否则读档是静音、按钮却不高亮）
rep("const renderer = new BattleRenderer(canvas);",
    "const renderer = new BattleRenderer(canvas);\n// 读档里可能是静音状态，渲染器一开始就要知道（按钮高亮 = 静音中）\nrenderer.setSoundMuted(audio.muted);",
    'renderer-init');

// 2) KeyV：切换音效（放在 KeyS 之后，读提示行是同一个顺序）
rep("  if (e.code === 'KeyS') {\n    e.preventDefault();\n    activatePanel('save');\n    return;\n  }",
    "  if (e.code === 'KeyS') {\n    e.preventDefault();\n    activatePanel('save');\n    return;\n  }\n  if (e.code === 'KeyV') {\n    e.preventDefault();\n    activatePanel('sound');\n    return;\n  }",
    'keyV');

// 3) 首次手势解锁 AudioContext（浏览器策略要求音频由用户手势触发）
rep("window.addEventListener('keydown', (e) => {\n  // ── 选道统阶段：方向键/数字键选，Enter 确认 ──",
    "window.addEventListener('keydown', (e) => {\n  // 任何按键都算一次用户手势：音频引擎借此解锁（浏览器不给「没交互就自动播放」）。\n  audio.unlock();\n  // ── 选道统阶段：方向键/数字键选，Enter 确认 ──",
    'unlock-key');

// 4) 调试钩子：类型声明 + 实现
rep("      /** 真正执行导入（覆盖当前 session） */\n      confirmImport(): boolean;",
    "      /** 真正执行导入（覆盖当前 session） */\n      confirmImport(): boolean;\n      /** 音效状态（D181 探针用） */\n      audio(): { readonly muted: boolean; readonly played: number; readonly failed: number };\n      /** 切换静音（走 UI 同一条路径） */\n      toggleSound(): boolean;",
    'hook-type');
rep("    exportSaveText: () => encodeTransfer(sessionToSave(session)),",
    "    audio: () => ({ muted: audio.muted, played: audio.played, failed: audio.failed }),\n    toggleSound: () => {\n      toggleSound();\n      return audio.muted;\n    },\n    exportSaveText: () => encodeTransfer(sessionToSave(session)),",
    'hook-impl');

fs.writeFileSync(P, c, 'utf8');
console.log('OK', before, '->', c.length);
