/**
 * 入口 —— 只做组装，不写规则。
 *
 * 这个文件应该永远很短。它做五件事：
 * 1. 读档（没有就建新档）
 * 2. 结算闭关（离线）收益
 * 3. 每帧推进一局游戏 + 画一帧
 * 4. 自动存档（30 秒一次 + 切后台/关页面各一次）
 * 5. 把状态挂到 window 上给探针用（只在开发构建里）
 *
 * 如果哪天这个文件变长了，说明规则漏进了入口层，该往 `core/` 里挪。
 */

/// <reference types="vite/client" />

import { Loop } from './core/loop';
import { Autosaver } from './core/autosave';
import {
  OFFLINE_MIN_SECONDS,
  applyOfflineGain,
  simulateOffline,
} from './core/offline';
import { gainXp } from './core/character';
import { equipmentSummary, pickup } from './core/inventory';
import { RARITY_NAME } from './data/rarity';
import {
  createSession,
  floorSelectableMax,
  setFloor,
  startWave,
  sessionAchievementFacts,
  syncAchievements,
  tickSession,
  drainSoundCues,
  equipFromBag,
  discardFromBag,
  type GameSession,
} from './core/session';
import { createLocalStorageAdapter } from './core/storage';
import { createAudioEngine } from './core/audio';
import { FRAGMENT_TERM, type FragmentElement } from './data/fragments';
import {
  advanceTutorial,
  clampTutorialIndex,
  currentTutorialStep,
  TUTORIAL_LENGTH,
  tutorialFinished,
  tutorialProgressText,
  type TutorialFacts,
} from './core/onboarding';
import { spendMarks } from './core/marks-runtime';
import type { MarkSink } from './data/marks';
import { AFFIXES } from './data/affixes';
import { ITEM_BASES } from './data/bases';
import { BattleRenderer } from './render/battle-renderer';
import { CLASSES, getClass, type ClassId } from './data/classes';
import { indexFromDigit, moveClassIndex, classCardRects } from './render/class-select';
import { hitTestHudButtons, layoutHudButtons, toCanvasPoint, type HudButtonId } from './render/hud-buttons';
import {
  floorCellState,
  floorMapHeight,
  floorMapLayout,
  floorMapWidth,
  hitTestFloorMap,
} from './render/floor-map';
import {
  bagGridLayout,
  bagPanelGeometry,
  hitTestBagGrid,
} from './render/bag-panel';
import { hitTestPaperdoll, paperdollLayout } from './render/paperdoll';
import { HUD_LEFT_X, HUD_PANEL_W, TOP_STRIP_H } from './render/hud-panels';
import { isSlotId } from './data/slots';
import { characterGemLoadout } from './core/character';
import { prestige, prestigeReady } from './core/session';
import { cycleDmgMul, cycleHpMul, cycleMarksMul, cycleName } from './data/cycles';
import {
  applyGemLoadout,
  cycleGemAt,
  gemAtSlot,
  moveSkillCursor,
  moveSlotCursor,
  orderedSkillRows,
  resetGemLoadout,
} from './core/gem-edit';
import {
  CODEX_TOTAL,
  codexEntries,
  codexProgress,
  moveCodexCursor,
  recordLegendary,
  recordMonsterKill,
  recordVariant,
  sanitizeCodex,
} from './core/codex';
import { achievementEntries, achievementSummary, moveAchievementCursor } from './core/achievement';
import { ACHIEVEMENT_TOTAL } from './data/achievements';
import { decodeTransfer, encodeTransfer, transferFailText, transferFileName, transferSummary } from './core/save-transfer';
import { sessionFromSave, sessionToSave } from './core/save-bridge';
import { copyText, downloadText, pickTextFile } from './ui/file-transfer';
import { formatRealm } from './data/glossary';
import { savePanelButtons, type SavePanelAction, type SavePanelPhase } from './render/save-panel';
import { LOGICAL_H, LOGICAL_W, resizeCanvas } from './render/viewport';

const canvas = document.getElementById('stage');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('找不到 #stage 画布，检查 index.html');
}

/**
 * 画布铺满窗口（用户要的「适配整个网页」）。
 *
 * 逻辑分辨率仍是 960×540 —— 这个文件里所有布局与命中测试都按它写 —— 变的只是
 * **后备缓冲的像素数**：resizeCanvas 按「显示宽度 × devicePixelRatio ÷ 960」算出
 * 像素比，把后备缓冲放大并 setTransform，于是大屏上的字是真的按倍数
 * 渲染出来的，而不是把小位图拉大（拉大会糊）。
 *
 * 时机很讲究：必须等 CSS 布局过之后再算（getBoundingClientRect 才有宽度），
 * 所以排一帧；窗口缩放/分屏/换屏都会触发 resize，重算一次即可。
 */
let pixelRatio = 1;
const syncViewport = (): void => {
  pixelRatio = resizeCanvas(canvas);
};
requestAnimationFrame(syncViewport);
window.addEventListener('resize', syncViewport);

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

// ── 1. 读档 ────────────────────────────────────────────────
const storage = createLocalStorageAdapter();
/** 先建一个占位 session 供 Autosaver 的 getter 用，读档成功后替换 */
let session: GameSession = createSession({
  classId: 'yujian',
  seed: Date.now() & 0x7fffffff,
  tables: TABLES,
});
const autosaver = new Autosaver(storage, () => session, TABLES);
const loaded = autosaver.load();

/**
 * 音效引擎（D181）。
 *
 * 三个约束决定它的建法：
 * - **AudioContext 懒创建**：页面没被点过之前建了也发不出声，Chrome 还会打警告；
 *   引擎内部等第一次真播放（或 unlock）时才建；
 * - **静音读档**：玩家上次关掉音效，这次打开不能自己响（存档里的 `muted`）；
 * - 引擎自己吞掉所有异常（没声卡/被策略拦），所以这里不用 try。
 */
const audio = createAudioEngine({
  muted: loaded ? loaded.session.character.muted === true : false,
  volume: loaded ? loaded.session.character.volume : undefined,
});
/** 音量步进 10%：手柄摇杆一样的粗粒度，键盘调不出"精确 37%"也不需要 */
const VOLUME_STEP = 0.1;

/**
 * 两个阶段：新号先选道统（D1：6 职业，开局选一个、之后不能转职），有档直接进。
 *
 * 为什么阶段要显式写出来：选道统时那局占位会话还没开始，如果照着跑
 * 主循环 + 自动存档，会把一个 yujian 的空档写进新档 —— 玩家下次打开
 * 就"已经选过剑修了"，而他从没选过。
 */
type Phase = 'select' | 'play';

let phase: Phase = loaded ? 'play' : 'select';
let pickIndex = 0;
let selectTime = 0;

/**
 * 神通面板光标（G 打开时才有意义）。
 *
 * 为什么状态放在 main.ts 而不是 renderer：面板自己的字段只管「画什么」，
 * 而「玩家选了哪一格」背后是会触发存档的业务状态（改装配 = 改存档里的 gemLoadouts），
 * 按本项目分层纪律，业务状态归入口/核心层，渲染层只读。
 */
let skillCursor = { skill: 0, slot: 0 };
/** 图鉴光标（绝对行号 0..CODEX_TOTAL-1）。和神通面板不会同时开，各存一份 */
let codexCursor = 0;
// 成就光标权威在 main.ts（渲染器只持本帧副本，与图鉴/神通同一条纪律）
let achievementCursor = 0;

/** 把光标同步给渲染层（每次移动后都调一次，避免两处各存一份状态） */
function syncSkillCursor(): void {
  renderer.setSkillCursor(skillCursor);
}

/** 提交一次装配改动：写进 character 后立刻自动存档（配置丢了比掉一件法宝更恼人） */
function commitGemLoadout(skillId: string, next: string[]): void {
  applyGemLoadout(session.character, skillId, next);
  autosaver.saveNow();
}

if (loaded) {
  session = loaded.session;
} else {
  startWave(session);
}

// ── 探针/回归专用：`?cls=yujian` 直接跳过选道统 ────────────────
// 为什么做成 URL 参数、而不是让每条探针先模拟一次回车：
// `__zhuoxian.reset()` 之后是整页 reload，URL 参数会跟着活下来，按键不会；
// 否则 8 条探针每条都要在每个 navigate/reset 之后补一行"重新选道统"，
// 漏一处就是一片假红（2026-10-22 那次 105→88 的假红就是这么来的）。
// 生产不受影响：没人会给玩家发带 ?cls= 的链接；道统名不在表里就当没传。
const FORCED_CLASS = new URLSearchParams(location.search).get('cls');
if (!loaded && FORCED_CLASS && CLASSES.some((c) => c.id === FORCED_CLASS)) {
  pickIndex = CLASSES.findIndex((c) => c.id === FORCED_CLASS);
  confirmClass();
}

/** 确认道统：建真正的一局，落盘，进 play */
function confirmClass(): void {
  const def = CLASSES[Math.max(0, Math.min(CLASSES.length - 1, pickIndex))];
  session = createSession({
    classId: def.id as ClassId,
    seed: Date.now() & 0x7fffffff,
    tables: TABLES,
  });
  startWave(session);
  phase = 'play';
  session.log.push({ text: `道统既定：${def.name}　入九幽魔渊`, color: '#d4a13c', age: 0 });
  autosaver.saveNow();
}

// ── 1.5 面板开关的唯一入口 ──────────────────────────────────
// 键盘和点击**必须走同一个函数**：两套逻辑各写一遍，迟早出现"按 K 能开、点按钮关不掉"。
// 这个项目已经因为"两个入口各补一遍"吃过亏（伤害有 4 个入口，每个都漏了升华加成）。
/** 面板显示名（日志文案的唯一来源：开/关两处都要用，写两遍必然漂） */
const PANEL_NAME: Record<HudButtonId, string> = {
  detail: '法宝详情',
  breakdown: '损伤详解',
  talent: '周天图',
  skill: '神通面板',
  codex: '图鉴',
  achievement: '成就',
  marks: '渊痕价目表',
  save: '存档',
  floormap: '秘境图',
  bag: '背包',
  sound: '音效',
};

/** 打开时附带的一句"再按什么关"，按键与按钮共用 */
const PANEL_CLOSE_HINT: Record<HudButtonId, string> = {
  detail: '（再按 E 或点按钮关闭）',
  breakdown: '（再按 D 或点按钮关闭）',
  talent: '（再按 T 或点按钮关闭）',
  skill: '（再按 G 或点按钮关闭）',
  codex: '（再按 K 或点按钮关闭）',
  achievement: '（再按 J 或点按钮关闭）',
  marks: '（再按 M 或点按钮关闭）',
  save: '（再按 S 或点按钮关闭）',
  floormap: '（再按 P 或点按钮关闭）',
  bag: '（再按 B 或点按钮关闭）',
  sound: '',
};
function activatePanel(id: HudButtonId): void {
  if (phase !== 'play') return;
  // 音效不是面板：不参与「一次只开一个」的互斥，也不该顺手关掉玩家正开着的面板。
  if (id === 'sound') {
    toggleSound();
    return;
  }
  // 一次只许开一个面板：先记下"这个是不是本来开着"，再全关，最后决定开不开。
  // 不这么做的话点两个按钮就会出现两块面板叠着盖住一半 —— 玩家以为界面坏了（手机上尤其容易连点）。
  const wasOpen = renderer.panelOpen(id);
  renderer.closeAllPanels();
  if (wasOpen) {
    session.log.push({ text: `关闭${PANEL_NAME[id]}`, color: '#6d665c', age: 0 });
    return;
  }
  if (id === 'detail') {
    renderer.toggleDetail();
  } else if (id === 'breakdown') {
    renderer.toggleBreakdown();
  } else if (id === 'talent') {
    renderer.toggleTalent();
  } else if (id === 'skill') {
    renderer.toggleSkill();
    // 打开时把光标夹回有效行：面板可能是在「又解锁了几条神通」之后打开的
    const rows = orderedSkillRows(session.character);
    skillCursor = {
      skill: moveSkillCursor(skillCursor.skill, 0, rows.length),
      slot: moveSlotCursor(skillCursor.slot, 0),
    };
    syncSkillCursor();
  } else if (id === 'codex') {
    renderer.toggleCodex();
    codexCursor = moveCodexCursor(codexCursor, 0, CODEX_TOTAL);
    renderer.setCodexCursor(codexCursor);
  } else if (id === 'achievement') {
    renderer.toggleAchievements();
    // 条目数会随版本变（现在 20），打开时按总数夹一次
    achievementCursor = moveAchievementCursor(achievementCursor, 0, ACHIEVEMENT_TOTAL);
    renderer.setAchievementCursor(achievementCursor);
  } else if (id === 'save') {
    openSavePanel();
  } else if (id === 'bag') {
    renderer.toggleBag();
  } else if (id === 'floormap') {
    renderer.toggleFloorMap();
  } else {
    renderer.toggleMarksPanel();
  }
  // 图鉴要顺带报进度、渊痕要顺带报价 —— 这两个数字就是"为什么要打开它"的答案
  const extra =
    id === 'codex'
      ? (() => {
          const p = codexProgress(session.codex);
          return `；浊物 ${p.monsters.got}/${p.monsters.total} · 传奇 ${p.legendaries.got}/${p.legendaries.total}`;
        })()
      : id === 'marks'
        ? `；现有 ${Math.max(0, Math.floor(session.character.marks ?? 0)).toLocaleString('en-US')}`
        : '';
  session.log.push({ text: `打开${PANEL_NAME[id]}${extra}${PANEL_CLOSE_HINT[id]}`, color: '#d4a13c', age: 0 });
}

/**
 * 当前开着哪些面板（唯一出处）。
 * 为什么要一个函数：`panelsOpen()` 调试钩子、Escape 兜底、以及"一次只开一个"的判断
 * 都需要这份清单 —— 三处各写一遍，加第 10 个面板时必然漏一处（D185 就因为漏了
 * `floormap` 让 Escape 关不掉秘境图，而探针是唯一发现它的东西）。
 */
function openPanelIds(): string[] {
  const open: string[] = [];
  if (renderer.detailVisible) open.push('detail');
  if (renderer.breakdownVisible) open.push('breakdown');
  if (renderer.talentVisible) open.push('talent');
  if (renderer.skillVisible) open.push('skill');
  if (renderer.codexVisible) open.push('codex');
  if (renderer.achievementsVisible) open.push('achievement');
  if (renderer.marksPanelVisible) open.push('marks');
  if (renderer.savePanelVisible) open.push('save');
  if (renderer.floorMapVisible) open.push('floormap');
  if (renderer.bagVisible) open.push('bag');
  return open;
}

// ── 1.6 存档搬家（导出 / 导入） ────────────────────────────
// 存档在 localStorage，按域名隔离：换网址、换设备、清缓存、无痕窗口都会让玩家「打开一看是新的」，
// 而且不报错。对 24 小时内容量的挂机游戏，这是最伤的一种失败 —— 不是被打死，是被清档。

const SAVE_LINES: readonly string[] = [
  '存档只在这台设备的浏览器里（localStorage，按网址隔离）。',
  '清缓存 / 换设备 / 换网址 / 无痕窗口 —— 都会读到新号，而且不会报错。',
  '导出：下载一个 .json 文件，自己收好（发给自己也行）。',
  '导入：选那个文件，会先显示摘要，再点确认才覆盖。',
];

let savePhase: SavePanelPhase = 'idle';
let saveStatus = '';
let saveTone: 'dim' | 'ok' | 'warn' = 'dim';
/** 导入暂存：选完文件先放这里，等玩家点「确认导入」才真正生效（一步覆盖 = 手滑即毁档） */
let pendingImport: { readonly text: string; readonly summary: string } | null = null;

function paintSavePanel(): void {
  renderer.setSavePanel({ phase: savePhase, lines: SAVE_LINES, status: saveStatus, statusTone: saveTone });
}

function openSavePanel(): void {
  savePhase = 'idle';
  saveStatus = '';
  saveTone = 'dim';
  pendingImport = null;
  paintSavePanel();
}

function closeSavePanel(): void {
  renderer.setSavePanel(null);
  pendingImport = null;
}

function doExport(): void {
  const text = encodeTransfer(sessionToSave(session));
  const name = transferFileName();
  const ok = downloadText(name, text);
  // 剪贴板只是顺手：https / localhost 之外拿不到，失败也不能谎报成功。
  void copyText(text).then((copied) => {
    if (!renderer.savePanelVisible) return;
    saveStatus = ok
      ? (copied ? '已导出并复制到剪贴板：' + name : '已导出：' + name)
      : '导出失败（浏览器不许下载）—— 试试换个浏览器'
    saveTone = ok ? 'ok' : 'warn';
    paintSavePanel();
  });
  saveStatus = ok ? '已导出，正在复制…' : '导出失败（浏览器不许下载）';
  saveTone = ok ? 'ok' : 'warn';
  paintSavePanel();
}

function doImportPick(): void {
  saveStatus = '正在等选择文件…';
  saveTone = 'dim';
  paintSavePanel();
  void pickTextFile().then((text) => {
    if (text === null) {
      saveStatus = '没有选择文件';
      saveTone = 'dim';
      paintSavePanel();
      return;
    }
    const res = decodeTransfer(text);
    if (!res.ok) {
      saveStatus = transferFailText(res.error, res.detail);
      saveTone = 'warn';
      paintSavePanel();
      return;
    }
    const summary = transferSummary(res.state, formatRealm);
    pendingImport = { text, summary };
    savePhase = 'confirm';
    saveStatus = '要导入这份：' + summary;
    saveTone = 'warn';
    paintSavePanel();
  });
}

function doImportConfirm(): void {
  if (pendingImport === null) {
    saveStatus = '没有待导入的存档';
    saveTone = 'warn';
    paintSavePanel();
    return;
  }
  const res = decodeTransfer(pendingImport.text);
  if (!res.ok) {
    saveStatus = transferFailText(res.error, res.detail);
    saveTone = 'warn';
    savePhase = 'idle';
    paintSavePanel();
    return;
  }
  // 覆盖前先把当前进度也存一次：导入失败/导错文件时玩家还有机会从自动存档里捡回来。
  autosaver.saveNow();
  const summary = pendingImport.summary;
  const restored = sessionFromSave(res.state, { tables: TABLES });
  session = restored;
  autosaver.saveNow();
  closeSavePanel();
  session.log.push({ text: '已导入存档：' + summary, color: '#7ddca8', age: 0 });
  pendingImport = null;
}

function doSaveAction(action: SavePanelAction): void {
  if (action === 'export') doExport();
  else if (action === 'import') doImportPick();
  else if (action === 'confirm') doImportConfirm();
  else {
    pendingImport = null;
    savePhase = 'idle';
    saveStatus = '已取消';
    saveTone = 'dim';
    paintSavePanel();
  }
}

/**
 * 切换音效静音（D181）。
 *
 * 三处必须同步：引擎（真正发不发）、存档（刷新后还算数）、渲染器（按钮高亮）。
 * 只改引擎的话，玩家刷新一次声音又回来了 —— 这类小事最招骂。
 */
function toggleSound(): void {
  const muted = audio.toggleMute();
  session.character = { ...session.character, muted };
  renderer.setSoundMuted(muted);
  autosaver.saveNow();
  session.log.push({
    text: muted ? '音效已关闭' : '音效已开启',
    color: muted ? '#6d665c' : '#8eeae2',
    age: 0,
  });
  // 开的时候顺手解锁并播一声：让玩家立刻听到「确实开了」，不用等下一次打怪。
  if (!muted) {
    audio.unlock();
    audio.play('ui');
  }
}

/**
 * 调音量（D182）。[ 降、] 升，步进 10%。
 *
 * 两个细节：
 * - 调到 0 不等于静音：静音是独立开关（v 键），音量 0 只是「听不见但仍在播」。
 *   如果这里顺手把 muted 置真，玩家按 ] 想调回来时会发现还得再按 v，多一步就是坑。
 * - 每次都播一声 'ui' 让玩家当场听到结果 —— 调音量必须有听觉反馈，否则调完不知道有没有生效。
 */
function adjustVolume(delta: number): void {
  const next = Math.min(1, Math.max(0, Math.round((audio.volume + delta) * 100) / 100));
  audio.setVolume(next);
  session.character = { ...session.character, volume: next };
  autosaver.saveNow();
  session.log.push({
    text: `音量 ${Math.round(next * 100)}%`,
    color: next === 0 ? '#6d665c' : '#8eeae2',
    age: 0,
  });
  audio.unlock();
  audio.play('ui');
}

/**
 * 鼠标 / 触屏。
 *
 * 为什么这件事不是"锦上添花"：手机上没有 K/T/G/M/D/E 这些键，连**开局确认道统都要 Enter** ——
 * 也就是说在加这一层之前，「发个链接给朋友、手机点开就能玩」是做不到的，
 * 不是少个快捷键，是链接打不开。
 *
 * 坐标换算不能省：canvas 在 CSS 里是 `max-width:100%`，手机上会被缩小，
 * 直接用 clientX 去比画布坐标，手指点在右半边的按钮上会判到左半边。
 */
canvas.addEventListener('pointerdown', (e) => {
  // 鼠标/触屏也是用户手势：手机上没有键盘，只能靠这一下解锁音频。
  audio.unlock();
  const rect = canvas.getBoundingClientRect();
  const pt = toCanvasPoint(e.clientX, e.clientY, rect, LOGICAL_W, LOGICAL_H);
  if (phase === 'select') {
    // 选道统：点卡片 = 选中并确认。一次点击走完，不要求"点一下再点开始"。
    const hit = classCardRects(LOGICAL_W, LOGICAL_H).find(
      (c) => pt.x >= c.x && pt.x <= c.x + c.w && pt.y >= c.y && pt.y <= c.y + c.h,
    );
    if (hit) {
      pickIndex = CLASSES.findIndex((c) => c.id === hit.classId);
      confirmClass();
    }
    return;
  }
  if (renderer.savePanelVisible) {
    const hitSave = savePanelButtons(LOGICAL_W, LOGICAL_H, savePhase).find(
      (b) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h,
    );
    if (hitSave) {
      e.preventDefault();
      doSaveAction(hitSave.id);
      return;
    }
    // 存档面板开着时，**顶部按钮条仍然有效** —— 否则「点同一个按钮关不掉」，
    // 而按钮是手机上关面板的唯一手段（Escape 只在键盘上）。点别处仍然不穿透。
    const hudWhileSave = hitTestHudButtons(pt.x, pt.y, LOGICAL_W);
    if (hudWhileSave) {
      e.preventDefault();
      activatePanel(hudWhileSave.id);
      return;
    }
    return; // 面板开着时，点空白不穿透到下面的 HUD（否则点"空白"会顺手把面板关掉）
  }
  const btn = hitTestHudButtons(pt.x, pt.y, LOGICAL_W);
  if (btn) {
    e.preventDefault();
    activatePanel(btn.id);
    return;
  }
  // 背包面板开着时，点击只对网格生效：点格子看详情、点面板外关面板。
  // 与秘境图同一个理由：面板压在最上层，必须优先于纸娃娃与底下的 HUD。
  if (renderer.bagVisible) {
    const geo = bagPanelGeometry(LOGICAL_W, LOGICAL_H);
    const cell = hitTestBagGrid(pt.x, pt.y, geo);
    if (cell !== null) {
      e.preventDefault();
      renderer.setBagCursor(cell);
      const item = session.bag[cell];
      if (item) {
        session.log.push({ text: '查看 ' + item.name, color: '#6d665c', age: 0 });
      }
      return;
    }
    const inside = pt.x >= geo.x && pt.x < geo.x + geo.w && pt.y >= geo.y && pt.y < geo.y + geo.h;
    if (!inside) {
      e.preventDefault();
      renderer.toggleBag();
      session.log.push({ text: '关闭背包', color: '#6d665c', age: 0 });
    }
    return;
  }
  // 秘境图开着时，点击只对网格生效：点格子跳层、点空白关面板（D185）。
  // 面板压在最上层，所以必须在按钮与纸娃娃之前判。
  if (renderer.floorMapVisible) {
    const mapX = Math.round((LOGICAL_W - floorMapWidth()) / 2);
    const mapY = Math.round((LOGICAL_H - floorMapHeight()) / 2);
    const target = hitTestFloorMap(pt.x, pt.y, mapX, mapY);
    if (target !== null) {
      e.preventDefault();
      const from = session.floor;
      if (setFloor(session, target)) {
        renderer.toggleFloorMap();
        session.log.push({ text: '自第 ' + from + ' 层转入第 ' + target + ' 层', color: '#6b3fa0', age: 0 });
        autosaver.saveNow();
      } else {
        session.log.push({
          text: '第 ' + target + ' 层还去不了（最深 ' + floorSelectableMax(session) + ' 层）',
          color: '#6d665c',
          age: 0,
        });
      }
      return;
    }
    e.preventDefault();
    renderer.toggleFloorMap();
    session.log.push({ text: '关闭秘境图', color: '#6d665c', age: 0 });
    return;
  }
  // 点纸娃娃某一格 = 打开法宝详情并高亮那一格（D178，用户要求"装备在主界面能点开看"）。
  // 必须在按钮条之后判：按钮条压在画面上层，同一坐标两者都可能命中时以按钮为准。
  const cellSlot = hitTestPaperdoll(pt.x, pt.y, HUD_LEFT_X, TOP_STRIP_H + 4, HUD_PANEL_W);
  if (cellSlot) {
    e.preventDefault();
    renderer.closeAllPanels();
    renderer.openDetailAt(cellSlot);
    const summary = equipmentSummary(session.character);
    const equipped = summary.find((it) => it.slot === cellSlot);
    session.log.push({
      text: equipped
        ? `查看 ${equipped.item.name} · ${RARITY_NAME[equipped.item.rarity]}`
        : `查看 ${cellSlot}（空位）`,
      color: '#6d665c',
      age: 0,
    });
    return;
  }
  // 点空白处 = 跳过当前这一条引导（手机上的等价于空格）。
  // 只跳一条、只在引导还没走完时生效 —— 一键全关等于让玩家永远不知道漏了什么。
  if (!tutorialFinished(session.tutorialStep)) {
    session.tutorialStep = clampTutorialIndex(session.tutorialStep + 1);
    tutorialElapsed = 0;
    autosaver.saveNow();
  }
});

// ── 2. 闭关（离线）结算 ────────────────────────────────────
// 只在真有存档、且离开时间够长时才算。用存档里的 rng 状态结算，
// 所以「反复刷新页面」不会重摇出不同的收益（防刷）。
if (loaded && loaded.offlineSeconds >= OFFLINE_MIN_SECONDS) {
  const gain = simulateOffline(session, loaded.offlineSeconds, session.rng);
  applyOfflineGain(session, gain, gainXp, pickup);
  session.offlineReport = {
    minutes: gain.minutes,
    kills: gain.kills,
    xp: gain.xp,
    items: gain.items.length,
    currency: Object.values(gain.currency).reduce((a, b) => a + (b ?? 0), 0),
    gems: Object.values(gain.gems).reduce((a, b) => a + b, 0),
    capped: gain.capped,
    age: 0,
  };
}

// ── 3 & 4. 主循环 + 自动存档 ───────────────────────────────
const renderer = new BattleRenderer(canvas);
// 读档里可能是静音状态，渲染器一开始就要知道（按钮高亮 = 静音中）
renderer.setSoundMuted(audio.muted);

/**
 * 新手引导的运行时状态。
 *
 * `elapsed` 是「当前这一条已经显示了多久」—— 有几条是「看一眼就够」的
 * （浊气是什么、镇守是什么），挂机玩家不按键也必须能走过去，否则他永远
 * 停在第一条上，后面的教学全部看不到。
 * `keysUsed` 让「按 G 看神通」这类条目在玩家真按了之后立刻收掉。
 */
let tutorialElapsed = 0;
const keysUsed = new Set<string>();

/** 收一次事实 → 推进引导（推进了立刻存档，刷新后不重讲） */
function tickTutorial(dt: number): void {
  if (tutorialFinished(session.tutorialStep)) return;
  tutorialElapsed += dt;
  const facts: TutorialFacts = {
    kills: session.kills,
    dropsFound: session.dropsFound,
    step: session.character.step,
    floor: session.floor,
    clearedFloors: session.firstClearedFloors.length,
    bossSeen: session.battle.monsters.some((m) => m.rarity === 'boss'),
    keysUsed,
    elapsed: tutorialElapsed,
  };
  const next = advanceTutorial(session.tutorialStep, facts);
  if (next !== session.tutorialStep) {
    session.tutorialStep = next;
    tutorialElapsed = 0;
    autosaver.saveNow();
  }
}

const loop = new Loop(
  (dt) => {
    if (phase === 'select') {
      selectTime += dt;
      return;
    }
    tickSession(session, dt);
    // 音效（D181）：core 只把「发生了什么」塞进 soundCues，这里每帧取走播放。
    // 放在 tick 之后、渲染之前 —— 音画同一帧对齐，玩家才不会觉得「先响后打」。
    const cues = drainSoundCues(session);
    for (const cue of cues) audio.play(cue);
    autosaver.tick(dt);
    tickTutorial(dt);
    // 闭关摘要显示 12 秒后自然淡出（渲染器只看 age）
    if (session.offlineReport) {
      const age = session.offlineReport.age + dt;
      session.offlineReport = age > 12 ? undefined : { ...session.offlineReport, age };
    }
  },
  () => {
    if (phase === 'select') {
      renderer.renderClassSelect(pickIndex, selectTime);
      return;
    }
    renderer.render(session);
    // 引导条画在最后：它是被设计的最上层，不该被任何面板盖住
    const step = currentTutorialStep(session.tutorialStep);
    if (step) renderer.renderTutorial(step.text, tutorialProgressText(session.tutorialStep));
  },
);

loop.start();

// ── 3.5 回刷选层（D36-B）────────────────────────────────────
// 左右方向键回刷已到过的层。只在「可回刷」时才响应，越界会被 setFloor 拒绝并给一条日志。
window.addEventListener('keydown', (e) => {
  // 任何按键都算一次用户手势：音频引擎借此解锁（浏览器不给「没交互就自动播放」）。
  audio.unlock();
  // ── 选道统阶段：方向键/数字键选，Enter 确认 ──
  if (phase === 'select') {
    const digit = indexFromDigit(e.code, CLASSES.length);
    if (digit !== null) {
      e.preventDefault();
      pickIndex = digit;
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      confirmClass();
      return;
    }
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, -1, 0);
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, 1, 0);
      return;
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, 0, -1);
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, 0, 1);
      return;
    }
    return;
  }
  // ── play 阶段 ──
  // 先记下玩家按过什么：引导里「按 G 看神通」这类条目在真按了之后立刻收掉，
  // 不等超时 —— 否则老玩家会被一句已经会了的话挡 14 秒。
  keysUsed.add(e.code);

  // ── 神通面板打开时，方向键 / 空格 / R 归面板 ──────────────
  // 冲突：ArrowLeft/Right 平时是回刷层（D36-B），空格平时是「跳过一条引导」。
  // 面板一开就接管这三个键，否则「改装配」和「回刷层」互相打架，
  // 而且空格会在玩家换玉简时顺手把引导跳掉（两个功能一起动，最难查）。
  if (renderer.skillVisible) {
    const rows = orderedSkillRows(session.character);
    const row = rows[skillCursor.skill];
    const skillId = row ? row.skill.id : null;
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      skillCursor = {
        skill: moveSkillCursor(skillCursor.skill, e.code === 'ArrowDown' ? 1 : -1, rows.length),
        slot: skillCursor.slot,
      };
      syncSkillCursor();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      skillCursor = {
        skill: skillCursor.skill,
        slot: moveSlotCursor(skillCursor.slot, e.code === 'ArrowRight' ? 1 : -1),
      };
      syncSkillCursor();
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && skillId) {
      e.preventDefault();
      if (row && row.unlocked) {
        commitGemLoadout(skillId, cycleGemAt(session.character, skillId, skillCursor.slot, 1));
        const picked = gemAtSlot(session.character, skillId, skillCursor.slot);
        session.log.push({
          text: row.skill.name + ' 第 ' + (skillCursor.slot + 1) + ' 槽 → ' + (picked ? picked.name : '空槽'),
          color: '#d4a13c',
          age: 0,
        });
      }
      return;
    }
    if (e.code === 'KeyR' && skillId) {
      e.preventDefault();
      if (row && row.unlocked) {
        // ⚠️ 这里**不能**走 commitGemLoadout：那会把 resetGemLoadout 返回的默认装配
        // 再写回 gemLoadouts 当作「覆盖项」，于是 R 之后覆盖项又出现了，
        // 下次解锁新玉简时默认装配也不会再自动补（探针抓到过这条）。
        resetGemLoadout(session.character, skillId);
        autosaver.saveNow();
        session.log.push({ text: row.skill.name + ' 玉简恢复自动装配', color: '#d4a13c', age: 0 });
      }
      return;
    }
  }
  // 空格 / 回车 = 跳过当前这条（已经懂了就别挡着）。只跳一条，不一键全关：
  // 一键全关等于把引导变成「跳过之后永远不知道漏了什么」。
  if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && !tutorialFinished(session.tutorialStep)) {
    e.preventDefault();
    session.tutorialStep = clampTutorialIndex(session.tutorialStep + 1);
    tutorialElapsed = 0;
    autosaver.saveNow();
    return;
  }
  // E = 法宝详情（"我身上这 9 件到底有什么灵纹"的答案）
  // 所有面板开关都走 activatePanel：键盘与点击共用一份逻辑，否则会出现"按 K 能开、点按钮关不掉"。
  if (e.code === 'KeyE') {
    activatePanel('detail');
    return;
  }
  // G = 神通/玉简面板（"我这条神通到底装了什么玉简"的答案）
  // 6 主动 × 4 槽 × 12 条玉简是本作最贵的一层组合，看不见就等于不存在。
  if (e.code === 'KeyG') {
    activatePanel('skill');
    return;
  }
  // K = 图鉴（"我收集到哪了"的答案，D87）。
  // 打开时接管 ↑↓ 翻条目：否则方向键会顺手去回刷层 —— 和神通面板是同一个冲突。
  // Escape 兜底（D185.1）：以前每个面板各写一条 `if (xxxVisible && Escape)`，
  // 漏写一个就变成「按 Esc 没反应」——玩家会以为界面卡死。这里保留各面板自己的处理
  // （存档面板要清掉待确认的导入），但最前面加一条兜底：还有面板开着就全关。
  if (e.code === 'Escape' && openPanelIds().length > 0) {
    e.preventDefault();
    closeSavePanel();
    renderer.closeAllPanels();
    session.log.push({ text: '关闭面板', color: '#6d665c', age: 0 });
    return;
  }
  if (renderer.codexVisible) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      codexCursor = moveCodexCursor(codexCursor, e.code === 'ArrowDown' ? 1 : -1, CODEX_TOTAL);
      renderer.setCodexCursor(codexCursor);
      return;
    }
    if (e.code === 'KeyK' || e.code === 'Escape') {
      e.preventDefault();
      renderer.toggleCodex();
      session.log.push({ text: '关闭图鉴', color: '#6d665c', age: 0 });
      return;
    }
  }
  if (e.code === 'KeyK') {
    activatePanel('codex');
    return;
  }
  // J = 成就（D87）：「有终点」的收集。打开时接管 ↑↓ 翻条目 ——
  // 否则方向键会顺手去回刷层（与图鉴、神通面板是同一个冲突）。
  if (renderer.achievementsVisible && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    achievementCursor = moveAchievementCursor(achievementCursor, e.code === 'ArrowDown' ? 1 : -1, ACHIEVEMENT_TOTAL);
    renderer.setAchievementCursor(achievementCursor);
    return;
  }
  if (renderer.achievementsVisible && (e.code === 'KeyJ' || e.code === 'Escape')) {
    e.preventDefault();
    renderer.toggleAchievements();
    session.log.push({ text: '关闭成就', color: '#6d665c', age: 0 });
    return;
  }
  if (e.code === 'KeyJ') {
    activatePanel('achievement');
    return;
  }
  // 渊痕价目表（只读面板）：Escape 也能关 —— 图鉴能关、它不能关，玩家会以为卡住了。
  // 放在 M 分支之前：面板开着时 Escape 只关面板，不做别的事。
  if (renderer.marksPanelVisible && e.code === 'Escape') {
    e.preventDefault();
    renderer.toggleMarksPanel();
    session.log.push({ text: '关闭渊痕价目表', color: '#6d665c', age: 0 });
    return;
  }
  // M = 渊痕价目表（满级后唯一还在涨的数字，看不见就等于这个系统不存在）
  if (renderer.savePanelVisible && e.code === 'Escape') {
    e.preventDefault();
    closeSavePanel();
    session.log.push({ text: '关闭存档', color: '#6d665c', age: 0 });
    return;
  }
  if (e.code === 'KeyS') {
    e.preventDefault();
    activatePanel('save');
    return;
  }
  // 背包动作（D189）：空格穿上、X 丢弃。只在面板开着时生效，且光标格必须是真件。
  // 不做二次确认：这两件都是「再点一次就回来」的低风险操作（换下来的会回背包）。
  if (renderer.bagVisible && (e.code === 'Space' || e.code === 'KeyX')) {
    e.preventDefault();
    const index = renderer.bagFocused;
    const r = e.code === 'Space' ? equipFromBag(session, index) : discardFromBag(session, index);
    if (!r.ok) {
      session.log.push({ text: r.message, color: '#6d665c', age: 0 });
    }
    renderer.setBagCursor(renderer.bagFocused);
    autosaver.saveNow();
    return;
  }
  if (e.code === 'KeyB') {
    e.preventDefault();
    activatePanel('bag');
    return;
  }
  if (e.code === 'KeyP') {
    e.preventDefault();
    activatePanel('floormap');
    return;
  }
  if (e.code === 'KeyV') {
    e.preventDefault();
    activatePanel('sound');
    return;
  }
  // [ / ] = 音量 -/+（D182）。放在 V 旁边是因为它们属于同一件事：听起来舒不舒服。
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    e.preventDefault();
    adjustVolume(e.code === 'BracketRight' ? VOLUME_STEP : -VOLUME_STEP);
    return;
  }
  if (e.code === 'KeyM') {
    activatePanel('marks');
    return;
  }
  // L = 锁层挂机开关（D137 方案 d）：需要先花渊痕开定渊
  // 为什么要有它：定渊不再是「跳到已到过的最深层」（那会买走时长、且全重置后从深层起跑等于自杀），
  // 而是「停在一层反复刷」—— 刷修为回层 21、刷仙品回层 46、刷装备回层 76，全靠这一个开关。
  if (e.code === 'KeyL') {
    e.preventDefault();
    if (session.character.diveLockUnlocked !== true) {
      session.log.push({ text: '尚未开定渊（M 面板可查）', color: '#8a8272', age: 0 });
    } else {
      session.diveLock = !session.diveLock;
      session.log.push({
        text: session.diveLock ? '锁层：停在本层反复刷' : '解层：继续下潜',
        color: '#4fd1c5',
        age: 0,
      });
      autosaver.saveNow();
    }
    return;
  }
  // F = 切换五行碎片定向（D104）：未定向 → 金 → 火 → 水 → 未定向
  // 为什么要有手动切换：碎片的全部价值是「我知道我要哪一行的灵纹」，
  // 自动挑就退化成随机加成，定向工具等于没做。
  // N = 轮回（D36-A）：满级后重开一轮，是本项目唯一不可撤销的玩家操作。
  // 未满级时按键不报错、只解释条件 —— 玩家在深层乱按不该看到红字。
  if (e.code === 'KeyN') {
    e.preventDefault();
    if (!prestigeReady(session)) {
      session.log.push({ text: '轮回需先满级（第九境渡劫）', color: '#6d665c', age: 0 });
      return;
    }
    const before = session.cycle;
    if (prestige(session)) {
      autosaver.saveNow();
      session.log.push({
        text: '轮回：' + cycleName(before) + ' → ' + cycleName(session.cycle),
        color: '#d4a13c',
        age: 0,
      });
    }
    return;
  }

  if (e.code === 'KeyF') {
    e.preventDefault();
    const order: readonly (FragmentElement | null)[] = [null, 'metal', 'fire', 'water'];
    const cur = order.indexOf(session.fragmentAim);
    const next = order[(cur + 1) % order.length] ?? null;
    session.fragmentAim = next;
    session.log.push({
      text: next
        ? `定向打造：${FRAGMENT_TERM[next]}行（下次添灵纹时消耗 1 颗）`
        : '已取消定向（不再消耗碎片）',
      color: next ? '#7fb8a0' : '#6d665c',
      age: 0,
    });
    return;
  }
  // D = 损伤详解面板（"我这一下为什么只打出这么点"的答案）
  // T = 周天图（天赋树）。54 个节点必须能看见，否则玩家永远不知道自己点了什么。
  if (e.code === 'KeyT') {
    activatePanel('talent');
    return;
  }
  if (e.code === 'KeyD') {
    activatePanel('breakdown');
    return;
  }
  // 1 / 2 / 3 = 花渊痕的三个口子（D36-A E1）。
  // 为什么要绑键：渊痕只是数字时玩家满级后看着它涨却不知道能干什么，
  // 等于这个系统不存在。键位与 HUD 那行「渊痕 N · 可换」对应。
  const sinkByKey: Record<string, MarkSink> = {
    Digit1: 'rerollCurrency',
    Digit2: 'setStartFloor',
    Digit3: 'divineReforge',
  };
  const sink = sinkByKey[e.code];
  if (sink) {
    e.preventDefault();
    const r = spendMarks(session, sink);
    session.log.push({
      text: r.ok ? r.message : (r.reason ?? '这一档现在换不了'),
      color: r.ok ? '#d4a13c' : '#6d665c',
      age: 0,
    });
    autosaver.saveNow();
    return;
  }
  if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
  e.preventDefault();
  const max = floorSelectableMax(session);
  const next = session.floor + (e.code === 'ArrowRight' ? 1 : -1);
  if (!setFloor(session, next)) {
    if (next > max) {
      session.log.push({ text: `第 ${next} 层还没到过（当前最深 ${max} 层）`, color: '#6d665c', age: 0 });
    } else if (next < 1) {
      session.log.push({ text: '已经在最深处的第 1 层', color: '#6d665c', age: 0 });
    }
  }
  autosaver.saveNow();
});

/**
 * 清档期间不许写盘。
 *
 * reset() 的实现是「clear + reload」，而 reload 会触发 pagehide/beforeunload 上的 flush()，
 * 于是刚清掉的存档被当前会话原样写回去 —— 表现就是「点了清档，刷新一下进度全回来了」。
 * 这个旗子只在 reset() 里立一次，页面马上 reload，所以不需要复位。
 */
let suppressFlush = false;

/** 切后台 / 关页面时立刻存一次（挂机游戏最怕丢进度） */
function flush(): void {
  if (suppressFlush) return;
  if (phase !== 'play') return;
  autosaver.saveNow();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', flush);
window.addEventListener('beforeunload', flush);

/**
 * 开发期调试钩子。
 *
 * 为什么要有：自动化验收（探针脚本）没法靠「看截图」判断战斗对不对 ——
 * 它需要读到 kills、hp、浊气、掉落这些真实数字。把状态挂到 window 上，
 * 探针就能拿到和玩家看到的是同一份数据，不用另造一套。
 *
 * 只在开发构建里挂，正式构建（`npm run build`）不会有这个对象。
 */
declare global {
  interface Window {
    __zhuoxian?: {
      get session(): GameSession;
      readonly autosaver: Autosaver;
      /** 手动存档（探针验收存档用） */
      save(): boolean;
      /** 清档（探针验收新号流程用） */
      reset(): void;
      /** 回刷选层（探针验收 D36-B 用）：返回是否真的换了层 */
      selectFloor(floor: number): boolean;
      /** 当前可选层上限 */
      floorSelectableMax(): number;
      /** 切换损伤详解面板（探针验收用） */
      toggleBreakdown(): boolean;
      /** 切换法宝详情面板（探针验收用） */
      toggleDetail(): boolean;
      /**
       * 从纸娃娃点开某一件（D178，探针验收用）。
       * 和 `toggleDetail()` 分开：按 E 是「看全部」，点格子是「看这一件」。
       */
      openDetailAtSlot(slot: string): boolean;
      /** 详情面板当前高亮的部位（null = 没从格子进来） */
      readonly detailFocus: string | null;
      /** 详情面板是否开着 */
      readonly detailVisible: boolean;
      /** 关掉所有面板（探针用；等价于玩家点两次按钮） */
      closePanels(): void;
      /**
       * 纸娃娃 10 格的几何（探针用）。
       * 探针**不许自己写死格子坐标** —— 布局改了探针要跟着改，
       * 而写死的探针只会假红或假绿（D128 判据基数单一来源同源纪律）。
       */
      paperdollCells(): Array<{
        readonly slot: string;
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
      }>;
      /** 背包面板是否开着 */
      readonly bagVisible: boolean;
      /** 背包件数（不含空位） */
      readonly bagCount: number;
      /** 背包光标格号 */
      readonly bagCursor: number;
      /** 背包 40 格几何 + 是否有东西 + 光标（探针按几何采样，不写死坐标） */
      bagCells(): Array<{
        readonly index: number;
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
        readonly filled: boolean;
        readonly cursor: boolean;
      }>;
      /** 按格号放光标（探针免键盘路径用） */
      setBagCursor(index: number): void;
      /** 穿上背包第 index 件（探针免键盘路径用，与空格同一函数） */
      equipBagItem(index: number): boolean;
      /** 丢弃背包第 index 件 */
      discardBagItem(index: number): boolean;
      /** 秘境图是否开着 */
      readonly floorMapVisible: boolean;
      /** 秘境图 76 格几何 + 状态（探针用；坐标与绘制同源） */
      floorMapCells(): Array<{
        readonly floor: number;
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
        readonly state: string;
      }>;
      /** 当前阶段（探针验收选道统用） */
      readonly phase: Phase;
      /** 选道统阶段的高亮下标 */
      readonly pickIndex: number;
      /** 六名候选道统的 id（顺序 = 卡片顺序） */
      classIds(): string[];
      /** 直接确认某个道统（探针免键盘路径用） */
      chooseClass(id: string): boolean;
      /** 存档面板的当前状态（探针用它判断有没有打开、在确认阶段、有没有待导入） */
      readonly savePanel: {
        readonly phase: SavePanelPhase;
        readonly status: string;
        readonly pending: boolean;
        readonly visible: boolean;
      };
      /** 导出文本（探针直接拿字符串，不必真触发下载） */
      exportSaveText(): string;
      /** 走「选文件之后」的同一条路径：解码 → 摘要 → 进入确认阶段 */
      stageImportText(text: string): { readonly ok: boolean; readonly message: string };
      /** 真正执行导入（覆盖当前 session） */
      confirmImport(): boolean;
      /** 音效状态（D181 探针用） */
      audio(): {
        readonly muted: boolean;
        readonly volume: number;
        readonly played: number;
        readonly failed: number;
      };
      /** 直接设音量（探针用；与 [ ] 走同一个引擎方法） */
      setAudioVolume(value: number): number;
      /** 切换静音（走 UI 同一条路径） */
      toggleSound(): boolean;
      /** 引导走到第几条（探针验收用；0 = 刚开局） */
      readonly tutorialStep: number;
      /** 引导总条数（探针断言「走完」时要跟这个数比，不许写死 9/10） */
      readonly tutorialLength: number;
  readonly viewport: () => { readonly logicalW: number; readonly logicalH: number; readonly ratio: number };
      /** 一口气把引导推到底（探针不想等 12 秒时用） */
      finishTutorial(): void;
      /** 某条神通当前的装配（探针断言用；与面板画的是同一个来源） */
      gems(skillId: string): string[];
      /** 面板行序 + 解锁状态（探针不许写死神通的 id 与顺序） */
      skillRows(): Array<{ readonly id: string; readonly name: string; readonly unlocked: boolean }>;
      /** 神通面板光标（探针断言「方向键真的动了光标」） */
      readonly skillCursor: { readonly skill: number; readonly slot: number };
      /** 图鉴收集进度（探针验收用；百分比是算出来的，不是存的） */
      codex(): {
        readonly monsters: { got: number; total: number };
        readonly legendaries: { got: number; total: number };
        readonly total: { got: number; total: number };
        readonly percent: number;
      };
      /** 图鉴行（固定顺序：15 浊物 + 9 传奇）。探针不许写死条目数与顺序 */
      codexRows(): Array<{
        readonly kind: string;
        readonly id: string;
        readonly name: string;
        readonly detail: string;
        readonly unlocked: boolean;
      }>;
      /** 图鉴光标（探针断言「方向键真的动了光标」） */
      readonly codexCursor: number;
      /** 图鉴收集阈值注入（探针造「收集到一半」用；脏 id 会被安静丢弃） */
      unlockCodex(ids: readonly string[]): void;
      /** 成就进度（面板标题那一行用的同一份口径） */
      achievements(): {
        readonly got: number;
        readonly total: number;
        readonly percent: number;
        readonly rewardsEarned: number;
        readonly rewardsTotal: number;
      };
      /** 成就行（固定顺序；探针不许写死条目数） */
      achievementRows(): Array<{
        readonly id: string;
        readonly name: string;
        readonly desc: string;
        readonly progress: number;
        readonly target: number;
        readonly unlocked: boolean;
        readonly reward: number;
      }>;
      /** 成就事实（探针造场景用：偷看现算口径，与面板同一份） */
      /**
       * **同步**跑一次成就结算，并把前后快照一起还给探针（D102）。
       *
       * 为什么需要这个钩子：成就只该发渊痕、**不许动修为/战力/掉率**，而「xp 有没有涨」
       * 没法用「等一帧再看 xp」来判 —— 战斗循环每帧都在打怪，0 → 2 的涨幅既可能是
       * 成就给的、也可能只是这期间杀了 1 只（`XP_PER_KILL_PER_FLOOR = 2`）。
       * 这里把「结算」与「读快照」放在同一个同步调用里，中间不跨帧，测量才成立。
       */
      syncAchievementsNow(): {
        readonly xpBefore: number;
        readonly xpAfter: number;
        readonly marksBefore: number;
        readonly marksAfter: number;
        readonly unlockedBefore: number;
        readonly unlockedAfter: number;
      };
      /** 成就光标（探针断言「方向键真的动了光标」） */
      readonly achievementCursor: number;
      /** 五行碎片（D104）：余额 + 当前定向（探针据此断言掉落与消耗真的发生） */
      fragments(): {
        readonly metal: number;
        readonly fire: number;
        readonly water: number;
        readonly aim: string | null;
      };
      setFragmentAim(el: string | null): void;
      /** 周目（D36-A）：号 / 名称 / 是否可轮回 / 当前倍率（探针与 UI 同源） */
      cycleInfo(): {
        readonly cycle: number;
        readonly name: string;
        readonly ready: boolean;
        readonly hpMul: number;
        readonly dmgMul: number;
        readonly marksMul: number;
      };
      /** 锁层挂机（D137）：unlocked = 已开定渊；active = 当前是否锁层 */
      diveLock(): { readonly unlocked: boolean; readonly active: boolean };
      setDiveLock(on: boolean): boolean;
      /** 轮回（未满级返回 false，不改任何状态） */
      prestige(): boolean;
      achievementFacts(): {
        readonly kills: number;
        readonly maxFloor: number;
        readonly clearedFloors: number;
        readonly codexMonsters: number;
        readonly codexLegendaries: number;
        readonly step: number;
        readonly deaths: number;
        readonly xianEquipped: number;
      };
      /** 右上角按钮条的真实布局（探针按它取点击坐标，不许自己抄常量） */
      hudButtons(): Array<{
        readonly id: string;
        readonly label: string;
        readonly key: string;
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
      }>;
      /** 当前开着的面板 id 列表（面板权威在 main.ts，探针读这里不用猜） */
      panelsOpen(): string[];
      /** 选道统阶段的六张卡片矩形（探针点卡片用，不许猜中心） */
      classCards(): Array<{ readonly x: number; readonly y: number; readonly w: number; readonly h: number }>;
      /** 存档面板的按钮矩形（探针点按钮用；布局唯一出处在 save-panel.ts） */
      saveButtons(): Array<{
        readonly id: SavePanelAction;
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
      }>;
    };
  }
}

if (import.meta.env.DEV) {
  window.__zhuoxian = {
    get session() {
      return session;
    },
    autosaver,
    save: () => autosaver.saveNow(),
    reset: () => {
      suppressFlush = true;
      autosaver.clear();
      location.reload();
    },
    selectFloor: (floor: number) => {
      const ok = setFloor(session, floor);
      if (ok) autosaver.saveNow();
      return ok;
    },
    floorSelectableMax: () => floorSelectableMax(session),
    toggleBreakdown: () => renderer.toggleBreakdown(),
    codex: () => {
      const p = codexProgress(session.codex);
      // total 一起透出：探针不该自己拿 15+9 相加（条目数会加，写死就是下一次假红）
      return { monsters: p.monsters, legendaries: p.legendaries, total: p.total, percent: p.percent };
    },
    codexRows: () =>
      codexEntries(session.codex).map((e) => ({
        kind: e.kind,
        id: e.id,
        name: e.name,
        detail: e.detail,
        unlocked: e.unlocked,
      })),
    get codexCursor() {
      return codexCursor;
    },
    unlockCodex: (ids: readonly string[]) => {
      // 探针造场景用：走的是同一个 record 函数，不绕过 sanitize
      let next = session.codex;
      for (const id of ids) {
        // D170：'variant' 是图鉴里独立的一行，不能用 recordMonsterKill 的「浊物 id」通道造
        // （那条路已经改成走产品路径了）。这里直通 recordVariant，探针要构造边界时用。
        if (id === 'variant') {
          next = recordVariant(next);
          continue;
        }
        next = recordMonsterKill(next, id);
        next = recordLegendary(next, id);
      }
      next = sanitizeCodex(next);
      session.codex = next;
      autosaver.saveNow();
    },
    toggleDetail: () => renderer.toggleDetail(),
    openDetailAtSlot: (slot: string) => {
      if (phase !== 'play') return false;
      if (!isSlotId(slot)) return false;
      renderer.closeAllPanels();
      renderer.openDetailAt(slot);
      return renderer.detailVisible;
    },
    get detailFocus() {
      return renderer.detailFocus;
    },
    get detailVisible() {
      return renderer.detailVisible;
    },
    closePanels: () => {
      renderer.closeAllPanels();
    },
    get bagVisible() {
      return renderer.bagVisible;
    },
    get bagCount() {
      return session.bag.length;
    },
    get bagCursor() {
      return renderer.bagFocused;
    },
    bagCells: () => {
      const geo = bagPanelGeometry(LOGICAL_W, LOGICAL_H);
      return bagGridLayout(geo.gridX, geo.gridY).map((c) => ({
        index: c.index,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        filled: session.bag[c.index] !== undefined,
        cursor: renderer.bagFocused === c.index,
      }));
    },
    setBagCursor: (index: number) => {
      renderer.setBagCursor(index);
    },
    equipBagItem: (index: number) => {
      const r = equipFromBag(session, index);
      renderer.setBagCursor(renderer.bagFocused);
      autosaver.saveNow();
      return r.ok;
    },
    discardBagItem: (index: number) => {
      const r = discardFromBag(session, index);
      renderer.setBagCursor(renderer.bagFocused);
      autosaver.saveNow();
      return r.ok;
    },
    get floorMapVisible() {
      return renderer.floorMapVisible;
    },
    floorMapCells: () => {
      const x = Math.round((LOGICAL_W - floorMapWidth()) / 2);
      const y = Math.round((LOGICAL_H - floorMapHeight()) / 2);
      return floorMapLayout(x, y).map((c) => ({
        floor: c.floor,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        state: floorCellState(c.floor, session),
      }));
    },
    paperdollCells: () =>
      paperdollLayout(HUD_LEFT_X, TOP_STRIP_H + 4, HUD_PANEL_W).map((c) => ({
        slot: c.slot,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
      })),
    get phase() {
      return phase;
    },
    get pickIndex() {
      return pickIndex;
    },
    classIds: () => CLASSES.map((d) => d.id),
    chooseClass: (id: string) => {
      if (phase !== 'select') return false;
      const idx = CLASSES.findIndex((d) => d.id === id);
      if (idx < 0) return false;
      pickIndex = idx;
      confirmClass();
      return true;
    },
    get tutorialStep() {
      return session.tutorialStep;
    },
    /** 某条神通当前的装配（探针断言用；与面板画的是同一个来源） */
    gems(skillId: string) {
      return characterGemLoadout(session.character, skillId);
    },
    /** 面板行序 + 解锁状态（探针据此取 id，不写死数据表） */
    skillRows: () =>
      orderedSkillRows(session.character).map((r) => ({
        id: r.skill.id,
        name: r.skill.name,
        unlocked: r.unlocked,
      })),
    /** 面板光标（探针断言「方向键真的动了光标」） */
    get skillCursor() {
      return { skill: skillCursor.skill, slot: skillCursor.slot };
    },
    get savePanel() {
      return {
        phase: savePhase,
        status: saveStatus,
        pending: pendingImport !== null,
        // 必须单独给 visible：关闭态与 idle 态的 phase 都是 'idle'，探针分不出来
        visible: renderer.savePanelVisible,
      };
    },
    audio: () => ({ muted: audio.muted, volume: audio.volume, played: audio.played, failed: audio.failed }),
    setAudioVolume: (value: number) => {
      adjustVolume(value - audio.volume);
      return audio.volume;
    },
    toggleSound: () => {
      toggleSound();
      return audio.muted;
    },
    exportSaveText: () => encodeTransfer(sessionToSave(session)),
    stageImportText: (text: string) => {
      const res = decodeTransfer(text);
      if (!res.ok) return { ok: false, message: transferFailText(res.error, res.detail) };
      pendingImport = { text, summary: transferSummary(res.state, formatRealm) };
      savePhase = 'confirm';
      saveStatus = '要导入这份：' + pendingImport.summary;
      saveTone = 'warn';
      paintSavePanel();
      return { ok: true, message: pendingImport.summary };
    },
    confirmImport: () => {
      if (pendingImport === null) return false;
      doImportConfirm();
      return true;
    },
    /** 画布像素比（后备缓冲 / 逻辑 960）：探针把「逻辑坐标」换算成「缓冲像素」时要乘它 */
  viewport: () => ({ logicalW: LOGICAL_W, logicalH: LOGICAL_H, ratio: pixelRatio }),

  get tutorialLength() {
      return TUTORIAL_LENGTH;
    },
    finishTutorial: () => {
      // 用总条数而不是 Infinity：clampTutorialIndex 对非有限数会归零（脏值保护）
      session.tutorialStep = clampTutorialIndex(TUTORIAL_LENGTH);
      tutorialElapsed = 0;
      autosaver.saveNow();
    },
    // 成就（D87）：面板标题与行都从这里取，探针不用自己算阈值
    achievements: () => achievementSummary(session.achievements),
    achievementRows: () =>
      achievementEntries(session.achievements, sessionAchievementFacts(session)).map((e) => ({
        id: e.id,
        name: e.name,
        desc: e.desc,
        progress: e.progress,
        target: e.target,
        unlocked: e.unlocked,
        reward: e.reward,
      })),
    achievementFacts: () => sessionAchievementFacts(session),
    // 同步结算 + 前后快照（D102）：探针「成就只发渊痕、不动修为」的判据必须**不跨帧**，
    // 否则战斗循环自己打的怪也会让 xp 涨 2 点，断言必假红（实测踩过：xp 0 → 2）。
    syncAchievementsNow: () => {
      const xpBefore = session.character.xp;
      const marksBefore = session.character.marks ?? 0;
      const unlockedBefore = session.achievements.unlocked.length;
      syncAchievements(session);
      return {
        xpBefore,
        xpAfter: session.character.xp,
        marksBefore,
        marksAfter: session.character.marks ?? 0,
        unlockedBefore,
        unlockedAfter: session.achievements.unlocked.length,
      };
    },
    get achievementCursor() {
      return achievementCursor;
    },
    fragments: () => ({
      metal: session.character.fragments?.metal ?? 0,
      fire: session.character.fragments?.fire ?? 0,
      water: session.character.fragments?.water ?? 0,
      aim: session.fragmentAim,
    }),
    diveLock: () => ({
      unlocked: session.character.diveLockUnlocked === true,
      active: session.diveLock === true,
    }),
    setDiveLock: (on: boolean) => {
      if (session.character.diveLockUnlocked !== true) return false;
      session.diveLock = on === true;
      return true;
    },
    cycleInfo: () => ({
      cycle: session.cycle,
      name: cycleName(session.cycle),
      ready: prestigeReady(session),
      hpMul: cycleHpMul(session.cycle),
      dmgMul: cycleDmgMul(session.cycle),
      marksMul: cycleMarksMul(session.cycle),
    }),
    prestige: () => {
      const ok = prestige(session);
      if (ok) autosaver.saveNow();
      return ok;
    },
    setFragmentAim: (el: string | null) => {
      session.fragmentAim =
        el === 'metal' || el === 'fire' || el === 'water' ? el : null;
    },
    // 触屏/鼠标验收用：按钮真实布局 + 卡片真实矩形。探针不许自己抄一套坐标常量
    // （抄了就会在「按钮自适应压窄」「卡片按视口重排」之后静默点空）。
    hudButtons: () => layoutHudButtons(LOGICAL_W, LOGICAL_H).map((b) => ({
      id: b.id,
      label: b.label,
      key: b.key,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
    })),
    panelsOpen: () => openPanelIds(),
    /**
     * 存档面板的按钮矩形（画布坐标）。
     * 布局的唯一出处在 `save-panel.ts` 的 `savePanelButtons` —— 钩子只是把它透出去，
     * 探针不许自己算坐标（算错会变成"按钮点不动"的假红，而这个项目的按钮已经踩过一次）。
     */
    saveButtons: () => savePanelButtons(LOGICAL_W, LOGICAL_H, savePhase).map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
    })),
    classCards: () => classCardRects(LOGICAL_W, LOGICAL_H).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
  };
}
