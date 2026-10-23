// 一次性补丁：把「存档面板」接进 main.ts（导入/导出 + 点击 + 键位 + 探针钩子）。
// 教训复用：内联 node -e 传中文/反引号必炸 → 一律补丁文件；锚点唯一性校验。
import fs from 'node:fs';

const p = 'src/main.ts';
const Q = String.fromCharCode(39);
const BT = String.fromCharCode(96);
let c = fs.readFileSync(p, 'utf8');
const before = c.length;

function rep(old, neu, tag) {
  if (!c.includes(old)) throw new Error(`MISS ${tag}`);
  if (c.split(old).length - 1 !== 1) throw new Error(`AMBIGUOUS ${tag}`);
  c = c.replace(old, neu);
}
const q = (s) => Q + s + Q;

// ── 1) imports ─────────────────────────────────────────────
rep(
  `import { ACHIEVEMENT_TOTAL } from ${q('./data/achievements')};`,
  [
    `import { ACHIEVEMENT_TOTAL } from ${q('./data/achievements')};`,
    `import { decodeTransfer, encodeTransfer, transferFailText, transferFileName, transferSummary } from ${q('./core/save-transfer')};`,
    `import { sessionFromSave, sessionToSave } from ${q('./core/save-bridge')};`,
    `import { copyText, downloadText, pickTextFile } from ${q('./ui/file-transfer')};`,
    `import { formatRealm } from ${q('./data/glossary')};`,
    `import { savePanelButtons, type SavePanelAction, type SavePanelPhase } from ${q('./render/save-panel')};`,
  ].join('\n'),
  'imports',
);

// ── 2) PANEL_NAME / CLOSE_HINT ─────────────────────────────
rep(
  `  marks: ${q('渊痕价目表')},\n};`,
  `  marks: ${q('渊痕价目表')},\n  save: ${q('存档')},\n};`,
  'panel-name',
);
rep(
  `  marks: ${q('（再按 M 或点按钮关闭）')},\n};`,
  `  marks: ${q('（再按 M 或点按钮关闭）')},\n  save: ${q('（再按 S 或点按钮关闭）')},\n};`,
  'panel-hint',
);

// ── 3) activatePanel：save 走"打开时给初始 paint"，没有 toggle ──
rep(
  `  } else {\n    renderer.toggleMarksPanel();\n  }`,
  [
    `  } else if (id === ' + ${q('save')} + ') {`,
    `    openSavePanel();`,
    `  } else {`,
    `    renderer.toggleMarksPanel();`,
    `  }`,
  ].join('\n'),
  'activate-branch',
);

// ── 4) 存档面板逻辑（插在 activatePanel 之后） ─────────────
rep(
  `/**\n * 鼠标 / 触屏。`,
  [
    '// ── 1.6 存档搬家（导出 / 导入） ────────────────────────────',
    '// 存档在 localStorage，按域名隔离：换网址、换设备、清缓存、无痕窗口都会让玩家「打开一看是新的」，',
    '// 而且不报错。对 24 小时内容量的挂机游戏，这是最伤的一种失败 —— 不是被打死，是被清档。',
    '',
    'const SAVE_LINES: readonly string[] = [',
    `  ${q('存档只在这台设备的浏览器里（localStorage，按网址隔离）。')},`,
    `  ${q('清缓存 / 换设备 / 换网址 / 无痕窗口 —— 都会读到新号，而且不会报错。')},`,
    `  ${q('导出：下载一个 .json 文件，自己收好（发给自己也行）。')},`,
    `  ${q('导入：选那个文件，会先显示摘要，再点确认才覆盖。')},`,
    '];',
    '',
    'let savePhase: SavePanelPhase = ' + q('idle') + ';',
    'let saveStatus = ' + q('') + ';',
    'let saveTone: ' + q('dim') + ' | ' + q('ok') + ' | ' + q('warn') + ' = ' + q('dim') + ';',
    '/** 导入暂存：选完文件先放这里，等玩家点「确认导入」才真正生效（一步覆盖 = 手滑即毁档） */',
    'let pendingImport: { readonly text: string; readonly summary: string } | null = null;',
    '',
    'function paintSavePanel(): void {',
    '  renderer.setSavePanel({ phase: savePhase, lines: SAVE_LINES, status: saveStatus, statusTone: saveTone });',
    '}',
    '',
    'function openSavePanel(): void {',
    '  savePhase = ' + q('idle') + ';',
    '  saveStatus = ' + q('') + ';',
    '  saveTone = ' + q('dim') + ';',
    '  pendingImport = null;',
    '  paintSavePanel();',
    '}',
    '',
    'function closeSavePanel(): void {',
    '  renderer.setSavePanel(null);',
    '  pendingImport = null;',
    '}',
    '',
    'function doExport(): void {',
    '  const text = encodeTransfer(sessionToSave(session));',
    '  const name = transferFileName();',
    '  const ok = downloadText(name, text);',
    '  // 剪贴板只是顺手：https / localhost 之外拿不到，失败也不能谎报成功。',
    '  void copyText(text).then((copied) => {',
    '    if (!renderer.savePanelVisible) return;',
    '    saveStatus = ok',
    '      ? (copied ? ' + q('已导出并复制到剪贴板：') + ' + name : ' + q('已导出：') + ' + name)',
    '      : ' + q('导出失败（浏览器不许下载）—— 试试换个浏览器'),
    '    saveTone = ok ? ' + q('ok') + ' : ' + q('warn') + ';',
    '    paintSavePanel();',
    '  });',
    '  saveStatus = ok ? ' + q('已导出，正在复制…') + ' : ' + q('导出失败（浏览器不许下载）') + ';',
    '  saveTone = ok ? ' + q('ok') + ' : ' + q('warn') + ';',
    '  paintSavePanel();',
    '}',
    '',
    'function doImportPick(): void {',
    '  saveStatus = ' + q('正在等选择文件…') + ';',
    '  saveTone = ' + q('dim') + ';',
    '  paintSavePanel();',
    '  void pickTextFile().then((text) => {',
    '    if (text === null) {',
    '      saveStatus = ' + q('没有选择文件') + ';',
    '      saveTone = ' + q('dim') + ';',
    '      paintSavePanel();',
    '      return;',
    '    }',
    '    const res = decodeTransfer(text);',
    '    if (!res.ok) {',
    '      saveStatus = transferFailText(res.error, res.detail);',
    '      saveTone = ' + q('warn') + ';',
    '      paintSavePanel();',
    '      return;',
    '    }',
    '    const summary = transferSummary(res.state, formatRealm);',
    '    pendingImport = { text, summary };',
    '    savePhase = ' + q('confirm') + ';',
    '    saveStatus = ' + q('要导入这份：') + ' + summary;',
    '    saveTone = ' + q('warn') + ';',
    '    paintSavePanel();',
    '  });',
    '}',
    '',
    'function doImportConfirm(): void {',
    '  if (pendingImport === null) {',
    '    saveStatus = ' + q('没有待导入的存档') + ';',
    '    saveTone = ' + q('warn') + ';',
    '    paintSavePanel();',
    '    return;',
    '  }',
    '  const res = decodeTransfer(pendingImport.text);',
    '  if (!res.ok) {',
    '    saveStatus = transferFailText(res.error, res.detail);',
    '    saveTone = ' + q('warn') + ';',
    '    savePhase = ' + q('idle') + ';',
    '    paintSavePanel();',
    '    return;',
    '  }',
    '  // 覆盖前先把当前进度也存一次：导入失败/导错文件时玩家还有机会从自动存档里捡回来。',
    '  autosaver.saveNow();',
    '  const summary = pendingImport.summary;',
    '  const restored = sessionFromSave(res.state, { tables: TABLES });',
    '  session = restored;',
    '  autosaver.saveNow();',
    '  closeSavePanel();',
    '  session.log.push({ text: ' + q('已导入存档：') + ' + summary, color: ' + q('#7ddca8') + ', age: 0 });',
    '  pendingImport = null;',
    '}',
    '',
    'function doSaveAction(action: SavePanelAction): void {',
    '  if (action === ' + q('export') + ') doExport();',
    '  else if (action === ' + q('import') + ') doImportPick();',
    '  else if (action === ' + q('confirm') + ') doImportConfirm();',
    '  else {',
    '    pendingImport = null;',
    '    savePhase = ' + q('idle') + ';',
    '    saveStatus = ' + q('已取消') + ';',
    '    saveTone = ' + q('dim') + ';',
    '    paintSavePanel();',
    '  }',
    '}',
    '',
    '/**',
    ' * 鼠标 / 触屏。',
  ].join('\n'),
  'save-logic',
);

// ── 5) pointerdown：存档面板的按钮优先 ─────────────────────
rep(
  `  const btn = hitTestHudButtons(pt.x, pt.y, canvas.width);`,
  [
    `  if (renderer.savePanelVisible) {`,
    `    const hitSave = savePanelButtons(canvas.width, canvas.height, savePhase).find(`,
    `      (b) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h,`,
    `    );`,
    `    if (hitSave) {`,
    `      e.preventDefault();`,
    `      doSaveAction(hitSave.id);`,
    `    }`,
    `    return; // 面板开着时，点别处不穿透到下面的 HUD（否则点"空白"会顺手关掉面板）`,
    `  }`,
    `  const btn = hitTestHudButtons(pt.x, pt.y, canvas.width);`,
  ].join('\n'),
  'pointer',
);

// ── 6) 键盘：KeyS 开关 + Escape 关 ─────────────────────────
rep(
  `  if (e.code === 'KeyM') {`,
  [
    `  if (renderer.savePanelVisible && e.code === 'Escape') {`,
    `    e.preventDefault();`,
    `    closeSavePanel();`,
    `    session.log.push({ text: '关闭存档', color: '#6d665c', age: 0 });`,
    `    return;`,
    `  }`,
    `  if (e.code === 'KeyS') {`,
    `    e.preventDefault();`,
    `    activatePanel('save');`,
    `    return;`,
    `  }`,
    `  if (e.code === 'KeyM') {`,
  ].join('\n'),
  'key-s',
);

// ── 7) 探针钩子：让探针能在不点文件选择器的情况下走完整链路 ──
// 注意：类型声明与实现是两处、写法还不同（`readonly tutorialLength: number;` vs `get tutorialLength() {`），
// 锚点必须分开写 —— 拿带 `: number` 的形式去匹配实现会 MISS。
rep(
  `      /** 引导走到第几条（探针验收用；0 = 刚开局） */`,
  [
    `      /** 存档面板的当前状态（探针用它判断有没有打开、在确认阶段、有没有待导入） */`,
    `      readonly savePanel: { readonly phase: SavePanelPhase; readonly status: string; readonly pending: boolean };`,
    `      /** 导出文本（探针直接拿字符串，不必真触发下载） */`,
    `      exportSaveText(): string;`,
    `      /** 走「选文件之后」的同一条路径：解码 → 摘要 → 进入确认阶段 */`,
    `      stageImportText(text: string): { readonly ok: boolean; readonly message: string };`,
    `      /** 真正执行导入（覆盖当前 session） */`,
    `      confirmImport(): boolean;`,
    `      /** 引导走到第几条（探针验收用；0 = 刚开局） */`,
  ].join('\n'),
  'hook-types',
);

rep(
  `    get tutorialLength() {`,
  [
    `    get savePanel() {`,
    `      return { phase: savePhase, status: saveStatus, pending: pendingImport !== null };`,
    `    },`,
    `    exportSaveText: () => encodeTransfer(sessionToSave(session)),`,
    `    stageImportText: (text: string) => {`,
    `      const res = decodeTransfer(text);`,
    `      if (!res.ok) return { ok: false, message: transferFailText(res.error, res.detail) };`,
    `      pendingImport = { text, summary: transferSummary(res.state, formatRealm) };`,
    `      savePhase = 'confirm';`,
    `      saveStatus = '要导入这份：' + pendingImport.summary;`,
    `      saveTone = 'warn';`,
    `      paintSavePanel();`,
    `      return { ok: true, message: pendingImport.summary };`,
    `    },`,
    `    confirmImport: () => {`,
    `      if (pendingImport === null) return false;`,
    `      doImportConfirm();`,
    `      return true;`,
    `    },`,
    `    get tutorialLength() {`,
  ].join('\n'),
  'hook-impl',
);

if (c.length < before) throw new Error('SHRINK 结果比原文短，拒绝写盘');
fs.writeFileSync(p, c, 'utf8');
console.log(`patched main.ts (${before} -> ${c.length} chars)`);
