/**
 * 独立验收：新手引导（引路）—— 不读 lead 的 probe-onboarding.mjs，自己从零写一遍。
 *
 * 为什么另写一份：lead 那份和实现是同一人写的，容易「按实现写断言」。
 * 这里只按行为契约验：新号从 0 开始、挂机自动推进、按 G/T 能推进、
 * reload 不重讲、走完条带消失且**不阻塞战斗**（击杀继续涨）。
 *
 * 判据（lead 踩过的坑，已按他的口径避开）：
 *   - 推进是「停在第一条未满足」，不补前置事实按 G 会停在 first-kill 而不是 panel-skill，
 *     所以这里断言的是「单调不减 + 至少前进一条」，不强求跳到某一条。
 *   - 仙金判据：R>95 && R-B>40 && G>B（半透明金压在暗底约 (111,94,54)，用 r>150 会假红）。
 *
 * 跑法：node F:\dsh-work\zhuoxian\tools\probe-onboarding-indep.mjs
 */

import { withPage, assert, summary } from './probe/harness.mjs';

const HOOK_OK = 'typeof window.__zhuoxian === "object" && window.__zhuoxian !== null';
const STEP = 'window.__zhuoxian.tutorialStep';
const PHASE = 'window.__zhuoxian.phase';
const KILLS = 'window.__zhuoxian.session.battle.kills';

/** 底部引导条的金色像素数（画布下方 22% 区域） */
const GOLD_BOTTOM = `(() => {
  const c = document.querySelector('#stage');
  if (!c) return -1;
  const g = c.getContext('2d');
  const y0 = Math.floor(c.height * 0.78);
  const d = g.getImageData(0, y0, c.width, c.height - y0).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 10 && r > 95 && r - b > 40 && gg > b) n += 1;
  }
  return n;
})()`;

async function main() {
  await withPage(async (page) => {
    // ── 0. 真新号 ────────────────────────────────────────
    await page.eval('window.__zhuoxian.reset()');
    await page.waitMs(1800);
    await page.waitFor(HOOK_OK, 20000);
    const phase0 = await page.eval(PHASE);
    const step0 = await page.eval(STEP);
    assert('reset() 后回到「选道统」阶段', phase0 === 'select', `phase=${phase0}`);
    assert('真新号的引导从第 0 条开始', step0 === 0, `tutorialStep=${step0}`);

    await page.eval('window.__zhuoxian.chooseClass("yujian")');
    await page.waitMs(700);
    const phase1 = await page.eval(PHASE);
    const step1 = await page.eval(STEP);
    assert('选完道统进入战斗，引导仍停在 0', phase1 === 'play' && step1 === 0, `phase=${phase1} step=${step1}`);

    // ── 1. 引导条可见 ────────────────────────────────────
    const gold0 = await page.eval(GOLD_BOTTOM);
    assert('底部出现「引路」金色条带', typeof gold0 === 'number' && gold0 > 200, `底部金色像素=${gold0}`);

    // ── 2. 挂机 9 秒自动推进（不按键） ────────────────────
    // 击杀是离散事件（首杀 6~12s 都可能，取决于怪的位置），固定窗口会假红 ——
    // 用 waitFor 等「真的杀了第一只」再断言，9 秒窗口只留给引导推进。
    const kills0 = await page.eval(KILLS);
    try {
      await page.waitFor(`window.__zhuoxian.session.battle.kills > ${kills0}`, 30000);
    } catch {
      /* 超时下面统一报 */
    }
    const step2 = await page.eval(STEP);
    const kills1 = await page.eval(KILLS);
    assert('挂机 9 秒后引导自己往前走（step ≥ 1）', typeof step2 === 'number' && step2 >= 1, `step ${step1} → ${step2}`);
    assert('引导推进不影响战斗（等到真的击杀）', kills1 > kills0, `kills ${kills0} → ${kills1}（30s 等待）`);

    // ── 3. 按 G / T 能推进到对应条目 ──────────────────────
    // 契约是「停在第一条未满足」：想让 G 推进到 panel-skill，必须先把前面几条的事实补齐
    // （first-kill 要 kills≥3、first-drop 要 dropsFound≥1），否则会停在 first-kill ——
    // 这不是 bug，是探针场景没构造对（lead 踩过同一个坑，我第一版也踩了：step 1 → 1）。
    // 先造事实：等 kills≥3 且 dropsFound≥1，再按 G/T。
    await page.waitFor(
      '(() => { const s = window.__zhuoxian.session; return s.battle.kills >= 3 && s.dropsFound >= 1; })()',
      60000,
    );
    const facts = await page.eval(
      '(() => { const s = window.__zhuoxian.session; return { kills: s.battle.kills, drops: s.dropsFound, step: window.__zhuoxian.tutorialStep }; })()',
    );
    const gBefore = facts.step;
    await page.pressKey('KeyG');
    await page.waitMs(300);
    await page.releaseKey('KeyG');
    await page.waitMs(900);
    const stepG = await page.eval(STEP);
    assert('按 G 后引导不倒退', stepG >= gBefore, `step ${gBefore} → ${stepG}`);
    assert(
      '事实补齐后按 G 能吃掉「按 G 看神通」这一条（step 越过 panel-skill）',
      stepG >= 4,
      `kills=${facts.kills} drops=${facts.drops} step ${gBefore} → ${stepG}（panel-skill 的下标是 3，越过它应 ≥4）`,
    );

    const tBefore = stepG;
    await page.pressKey('KeyT');
    await page.waitMs(300);
    await page.releaseKey('KeyT');
    await page.waitMs(900);
    const stepT = await page.eval(STEP);
    assert('按 T 后引导不倒退', stepT >= tBefore, `step ${tBefore} → ${stepT}`);
    // 至少有一条「按 G/T 推进」的铁证：两键按完必须比挂机那一刻更靠后
    assert(
      'G/T 两条面板引导被吃掉（step 越过 panel-talent）',
      stepT >= 5 || stepT >= 9,
      `挂机时 ${step2} → 按完 G/T ${stepT}（panel-talent 下标 4，越过它应 ≥5）`,
    );

    // ── 4. reload 不重讲 ─────────────────────────────────
    const stepBeforeReload = await page.eval(STEP);
    await page.reload();
    await page.waitMs(1500);
    await page.waitFor(HOOK_OK, 20000);
    const phase2 = await page.eval(PHASE);
    const stepAfterReload = await page.eval(STEP);
    assert('reload 后直接进战斗（不再选道统）', phase2 === 'play', `phase=${phase2}`);
    assert(
      'reload 后引导不重讲（进度不回 0）',
      typeof stepAfterReload === 'number' && stepAfterReload >= stepBeforeReload && stepAfterReload > 0,
      `step ${stepBeforeReload} → ${stepAfterReload}`,
    );

    // ── 5. 走完后条带消失且不阻塞 ─────────────────────────
    // 判据必须拿 `tutorialLength` 而不是写死 9：2026-10-23 引导加了 'switch-floor'
    // 第 10 条，写死 9 会假红（实测 finishTutorial 后 step=10）。
    const tutLen = await page.eval('window.__zhuoxian.tutorialLength');
    await page.eval('window.__zhuoxian.finishTutorial()');
    // 钩子在 reload / 存档瞬间可能短暂缺席（实测 5292 上偶发 `Cannot read properties of undefined`），
    // 读值前一律先等钩子回来，不要拿到 undefined 当失败。
    await page.waitFor(HOOK_OK, 10000);
    await page.waitMs(600);
    const stepDone = await page.eval(STEP);
    // 走完后底部条带应消失（金色像素大幅下降）；这里重新取一次基准，避免用第 2 节的旧值。
    const goldDone = await page.eval(GOLD_BOTTOM);
    assert(
      'finishTutorial() 把引导推到末条（tutorialLength）',
      typeof tutLen === 'number' && stepDone === tutLen,
      `step=${stepDone} / tutorialLength=${tutLen}`,
    );
    assert(
      '引导走完后底部条带没有残留高亮（金色像素低）',
      goldDone >= 0 && goldDone < 600,
      `走完后 ${goldDone}（阈值 600，条带存在时实测 3000+）`,
    );

    const killsA = await page.eval(KILLS);
    // 击杀是离散事件（一波 4 只、首杀要几秒），用 waitFor 而不是固定等 4 秒 ——
    // 固定短窗口会假红（我第一版 4 秒窗口实测 kills 0 → 0，等到 9 秒才杀第一只）。
    let killsB = killsA;
    try {
      await page.waitFor(`window.__zhuoxian.session.battle.kills > ${killsA}`, 30000);
      killsB = await page.eval(KILLS);
    } catch {
      killsB = await page.eval(KILLS);
    }
    assert('引导结束后战斗照常推进（击杀继续涨）', killsB > killsA, `kills ${killsA} → ${killsB}（30s 窗口）`);

    // ── 6. 新增内容验收（lead m03341 第 4 条）─────────────────
    // 6a. 选道统画面要有「两行世界观」（REQ §2「讲一下世界观」）——
    //     先回到 select 阶段，数全画布的米白文字像素（低饱和亮，排除青色玩家与品阶色）。
    await page.eval('window.__zhuoxian.reset()');
    await page.waitMs(1800);
    // reset() 是「清档 + reload」，钩子会在 reload 前后短暂缺席 —— 必须等到**新页面**
    // 进入 select 阶段再读，否则会拿到旧页面的钩子（实测 5292 上偶发 undefined）。
    await page.waitFor('!!(window.__zhuoxian && window.__zhuoxian.phase === "select")', 20000);
    const cream = await page.eval(`(() => {
      const c = document.querySelector('#stage');
      if (!c) return -1;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a < 10) continue;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mn > 150 && mx - mn < 45) n += 1;
      }
      return n;
    })()`);
    assert(
      '选道统画面有两行世界观文字（米白文字像素）',
      typeof cream === 'number' && cream > 120,
      `米白文字像素=${cream}（阈值 120，实测请勿低于它太多）`,
    );

    // 6b. 引导第 8 条（switch-floor）能按 ← → 推进 —— 第 8 条之前的事实补齐太重，
    //     直接把 tutorialStep 摆到 switch-floor 下标（=8），按一次 ArrowRight 看它是否前进。
    await page.eval('window.__zhuoxian.chooseClass("yujian")');
    await page.waitMs(700);
    await page.eval('window.__zhuoxian.session.tutorialStep = 8');
    await page.waitMs(300);
    const beforeKey = await page.eval(STEP);
    await page.pressKey('ArrowRight');
    await page.waitMs(900);
    const afterKey = await page.eval(STEP);
    await page.releaseKey('ArrowRight');
    assert(
      'switch-floor 那条能按 → 推进（不靠 12 秒兜底）',
      afterKey > beforeKey,
      `step ${beforeKey} → ${afterKey}`,
    );

    // 6c. 新增的第 10 条教学「tier」—— **两套「阶」别混（D75）**：
    //     层 10 是「渊层阶位」黄→玄（按层号，9 层一阶）；灵纹阶看灵蕴，是另一套，
    //     层 10 的灵蕴 37 已属灵纹地阶。这里的文案只说渊层阶位，不涉及灵纹阶。
    //     6b 按过一次 → 现在正好停在 tier 这一条（switch-floor 的下一条）。
    //     判据只要「引导条还在 + 把层灌到 10 后能前进到 outro」，不为像素难为自己。
    const tutLen2 = await page.eval('window.__zhuoxian.tutorialLength');
    await page.eval('window.__zhuoxian.session.floor = 10');
    await page.waitMs(1400);
    const stepTier = await page.eval(STEP);
    assert(
      'tier 那条能把引导推到末条（灌层 10 后 step → tutorialLength）',
      typeof tutLen2 === 'number' && tutLen2 >= 11 && stepTier >= tutLen2 - 1,
      `step=${stepTier} / tutorialLength=${tutLen2}`,
    );

    const errs = page.consoleErrors();
    assert('控制台无报错（含 reset/选道统/按键/灌层全流程）', errs.length === 0, errs.length === 0 ? '干净' : errs.join(' | '));
  });

  summary();
}

try {
  await main();
} catch (err) {
  console.error(`onboarding-indep 崩了：${err?.message ?? err}`);
  process.exitCode = 1;
  summary();
}
