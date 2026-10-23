import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/render/battle-renderer.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
const BT = String.fromCharCode(96);

function rep(old, neu, tag) {
  if (!c.includes(old)) throw new Error('MISS ' + tag);
  if (c.split(old).length - 1 !== 1) throw new Error('AMBIGUOUS ' + tag);
  c = c.replace(old, neu);
}

// 1) 字段：静音状态（渲染器只持本帧副本，权威在 main.ts）
rep(
  '  private showAchievements = false;',
  '  private showAchievements = false;\n  /** 音效静音（D181）。权威在 main.ts 的 audio engine，这里只持本帧副本画按钮高亮 */\n  private soundMuted = false;',
  'field',
);

// 2) 存取器（放在 panelOpen 之前）
rep(
  '  panelOpen(id: HudButtonId): boolean {',
  '  /** 同步静音状态（main.ts 每次切换后调一次） */\n  setSoundMuted(muted: boolean): void {\n    this.soundMuted = muted === true;\n  }\n\n  get soundMutedState(): boolean {\n    return this.soundMuted;\n  }\n\n  panelOpen(id: HudButtonId): boolean {',
  'accessor',
);

// 3) panelOpen：sound 不是面板
rep(
  "      case 'save':\n        return this.savePaint !== null;",
  "      case 'save':\n        return this.savePaint !== null;\n      case 'sound':\n        // 音效不是面板：它没有遮罩、不参与互斥，所以永远算「没开」。\n        // 不出现在 activeButtons 里会让玩家看不出自己关没关，那一步在 activeButtons 处理。\n        return false;",
  'panelOpen-sound',
);

// 4) activeButtons：静音时高亮（金色边框 = 正在静音）
rep(
  "    if (this.showAchievements) on.push('achievement');",
  "    if (this.showAchievements) on.push('achievement');\n    if (this.soundMuted) on.push('sound');",
  'activeButtons',
);

fs.writeFileSync(P, c, 'utf8');
console.log('OK', before, '->', c.length);
