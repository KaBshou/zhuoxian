// 神通 / 玉简面板（按 G 打开）
//
// 存在理由：本作最贵的一层设计是「6 主动 × 4 辅助槽 × 12 条玉简」的装配组合，
// 如果玩家在画面上只能看到「技能放出去了」却看不到「我装了什么」，这层设计等于不存在。
// 和损伤详解面板（D）、法宝详情面板（E）、周天图面板（T）是同一个问题。
//
// 纪律：**装配只读**。装配的真相在 `character.ts` 的 `characterGemLoadout` / `defaultGemLoadout`，
// 这里绝不自己算「哪条玉简该装上」—— 否则面板和战斗层会给出两套答案
// （本项目已经踩过一次：HUD 与 session 的波次口径不一致）。
// 编辑动作（↑↓/←→/空格/R）由 `main.ts` 调 `core/gem-edit.ts` 执行，面板只负责画光标。
import type { CharacterState } from '../core/character';
import { characterGemLoadout } from '../core/character';
import { channelText } from '../core/gem-power';
import type { GameSession } from '../core/session';
import { ACTIVE_SKILLS, type ActiveSkillDef } from '../data/skills';
import { GEM_SLOTS, SUPPORT_GEMS, getSupportGem } from '../data/support-gems';
import { TAG_NAME } from '../data/tags';

const C = {
  panel: 'rgba(11, 10, 12, 0.9)',
  edge: 'rgba(140, 165, 200, 0.22)',
  text: '#d8d3c4',
  dim: '#6d665c',
  gold: '#d4a13c',
  teal: '#4fd1c5',
  off: 'rgba(70, 64, 56, 0.55)',
};

const W = 700;
const H = 476;
const PAD = 16;
const ROW_H = 62;
const LEFT_W = 420;

/** 元素色：让玩家一眼分出「这条吃哪一系加成」 */
const ELEMENT_COLOR: Record<string, string> = {
  metal: '#c9a24a',
  wood: '#4a7f50',
  water: '#3a72b8',
  fire: '#c25a48',
  earth: '#8a6520',
};

function elementOfSkill(skill: ActiveSkillDef): string | null {
  for (const t of skill.tags) if (ELEMENT_COLOR[t]) return t;
  return null;
}

function tagsText(tags: readonly string[]): string {
  return tags.map((t) => (TAG_NAME as Record<string, string>)[t] ?? t).join('·');
}

/** 按解锁台阶排：未解锁的排在后面但不隐藏 —— 玩家要能看到前面还有什么 */
function orderedSkills(): ActiveSkillDef[] {
  return [...ACTIVE_SKILLS].sort((a, b) => {
    if (a.unlockStep !== b.unlockStep) return a.unlockStep - b.unlockStep;
    return a.name.localeCompare(b.name, 'zh');
  });
}

export interface SkillPanelResult {
  /** 画了几条技能 */
  readonly skillRows: number;
  /** 已解锁玉简条数 */
  readonly gemCount: number;
  /** 光标停在第几行（-1 = 面板没有光标） */
  readonly cursorSkill: number;
  /** 光标停在第几槽（-1 = 面板没有光标） */
  readonly cursorSlot: number;
}

/** 光标位置（由 main.ts 持有，渲染只是照着画） */
export interface SkillCursor {
  readonly skill: number;
  readonly slot: number;
}

export function drawSkillPanel(
  ctx: CanvasRenderingContext2D,
  s: GameSession,
  ch: CharacterState = s.character,
  cursor: SkillCursor | null = null,
): SkillPanelResult {
  const x = (ctx.canvas.width - W) / 2;
  const y = Math.max(20, (ctx.canvas.height - H) / 2);

  // 遮罩：面板下面的一切都按「暂停」读
  ctx.fillStyle = 'rgba(5, 7, 11, 0.72)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, W, H);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.fillText('神通 · 玉简（按 G 关闭）', x + PAD, y + 22);

  const unlocked = SUPPORT_GEMS.filter((g) => ch.step >= g.unlockStep);
  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(
    `已解锁玉简 ${unlocked.length}/${SUPPORT_GEMS.length}　每条神通 ${GEM_SLOTS} 槽`,
    x + 250,
    y + 22,
  );

  // 操作提示：不写清键位，面板就是一张壁纸（改装配是本作唯一需要玩家动脑的组合层）
  ctx.font = '10px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('↑↓ 选神通　←→ 选槽　空格 换玉简　R 恢复自动', x + PAD, y + H - 12);

  const skills = orderedSkills();
  const curSkill = cursor ? Math.max(0, Math.min(skills.length - 1, cursor.skill)) : -1;
  const curSlot = cursor ? Math.max(0, Math.min(GEM_SLOTS - 1, cursor.slot)) : -1;
  let cy = y + 44;

  for (const skill of skills) {
    const rowIndex = skills.indexOf(skill);
    const isCursorRow = rowIndex === curSkill;
    const isUnlocked = ch.step >= skill.unlockStep;
    const el = elementOfSkill(skill);
    const nameColor = !isUnlocked ? C.off : el ? ELEMENT_COLOR[el] : C.text;

    // 光标行：整行描边（比改文字颜色更稳 —— 五行色神通名不能统一改色）
    if (isCursorRow) {
      ctx.strokeStyle = 'rgba(232, 200, 122, 0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + PAD - 4.5, cy - 4.5, LEFT_W + 9, ROW_H - 6);
    }

    ctx.font = 'bold 13px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = nameColor;
    ctx.fillText(skill.name, x + PAD, cy + 9);

    ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(tagsText(skill.tags), x + PAD + 82, cy + 9);

    ctx.textAlign = 'right';
    ctx.fillStyle = isUnlocked ? C.dim : C.gold;
    ctx.fillText(
      isUnlocked
        ? `${skill.manaCost} 真元 · ${skill.cooldown === 0 ? '跟手' : `${skill.cooldown.toFixed(1)}s`}`
        : `第 ${skill.unlockStep} 重解锁`,
      x + PAD + LEFT_W,
      cy + 9,
    );
    ctx.textAlign = 'left';

    // 四个辅助槽
    const gems = characterGemLoadout(ch, skill.id);
    const slotW = (LEFT_W - (GEM_SLOTS - 1) * 5) / GEM_SLOTS;
    for (let i = 0; i < GEM_SLOTS; i++) {
      const sx = x + PAD + i * (slotW + 5);
      const sy = cy + 22;
      const gemId = gems[i];
      const gem = gemId ? getSupportGem(gemId) : undefined;
      ctx.fillStyle = gem ? 'rgba(212, 161, 60, 0.14)' : 'rgba(216, 211, 196, 0.05)';
      ctx.fillRect(sx, sy, slotW, 26);
      ctx.strokeStyle = gem ? 'rgba(212, 161, 60, 0.42)' : 'rgba(216, 211, 196, 0.16)';
      ctx.strokeRect(sx + 0.5, sy + 0.5, slotW - 1, 25);
      ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
      ctx.fillStyle = gem ? C.text : C.dim;
      ctx.fillText(gem ? gem.name : '空槽', sx + 7, sy + 13);
      // 光标槽：金框加粗 + 外侧再描一圈，像素上可分辨（探针据此断言「光标真的画了」）
      if (isCursorRow && i === curSlot) {
        ctx.strokeStyle = 'rgba(240, 214, 140, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, slotW - 2, 24);
        ctx.strokeStyle = 'rgba(240, 214, 140, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 2.5, sy - 2.5, slotW + 5, 31);
        ctx.lineWidth = 1;
      }
    }

    if (!isUnlocked) {
      // 未解锁整行压暗：盖一层半透明黑，比逐个改 fillStyle 便宜且不会漏
      ctx.fillStyle = 'rgba(5, 7, 11, 0.45)';
      ctx.fillRect(x + PAD, cy, LEFT_W, ROW_H - 8);
    }

    cy += ROW_H;
  }

  // 右栏：已解锁玉简清单
  const rx = x + PAD + LEFT_W + 16;
  let ry = y + 46;
  ctx.font = 'bold 12px "Noto Sans SC", system-ui, sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('玉简（辅助）', rx, ry);
  ry += 18;

  ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
  for (const gem of unlocked) {
    ctx.fillStyle = C.dim;
    ctx.fillText('·', rx, ry);
    ctx.fillStyle = C.text;
    ctx.fillText(gem.name, rx + 8, ry);
    ctx.fillStyle = C.dim;
    ctx.fillText(tagsText(gem.supports), rx + 84, ry);
    ry += 16;
    if (ry > y + H - 54) break;
  }
  if (unlocked.length === 0) {
    ctx.fillStyle = C.dim;
    ctx.fillText('（还没有解锁玉简）', rx, ry);
  }

  // 底部一行：说明「自动」是兜底而不是唯一方式（这版可以改了）
  ctx.fillStyle = C.dim;
  ctx.fillText(
    '没改过的神通按解锁自动装满（最优序）；改过之后以你的装配为准，R 恢复自动。',
    x + PAD,
    y + H - 30,
  );

  // 装配通道（shuzhi §15.7：**不给说教，给数字**）——
  // 玩家自己看得懂 ×1.07 对 ×2.43，不需要被教育「乱装会更弱」。
  // 分通道而不是合成一个大倍率：合成必须替玩家假设「打几只怪、破绽多少」，那些假设在面板里是隐形的。
  // 「已装 n/4」是 D76 之后的必需品：摘光不再被自动填回，玩家必须看得见自己是 0/4。
  if (curSkill >= 0 && skills[curSkill]) {
    const cur = skills[curSkill];
    const gems = characterGemLoadout(ch, cur.id);
    ctx.textAlign = 'right';
    ctx.font = '11px "Noto Sans SC", system-ui, sans-serif';
    // 和自动装配一样好就金色（不是「你做对了」的夸奖，是「这个数就是上限」的提示）
    ctx.fillStyle = gems.length >= GEM_SLOTS ? C.gold : C.dim;
    ctx.fillText(channelText(ch, cur.id), x + W - PAD, y + H - 12);
    ctx.textAlign = 'left';
  }

  return { skillRows: skills.length, gemCount: unlocked.length, cursorSkill: curSkill, cursorSlot: curSlot };
}
