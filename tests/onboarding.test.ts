import { describe, expect, it } from 'vitest';

import {
  TUTORIAL_LENGTH,
  TUTORIAL_STEPS,
  advanceTutorial,
  clampTutorialIndex,
  currentTutorialStep,
  tutorialFinished,
  tutorialProgressText,
} from '../src/core/onboarding';
import type { TutorialFacts } from '../src/core/onboarding';
import { tutorialBoxHeight, wrapTutorialText } from '../src/render/tutorial-overlay';

/** 一个「什么都没发生」的事实快照，各用例只改自己要的那几项 */
function facts(patch: Partial<TutorialFacts> = {}): TutorialFacts {
  return {
    kills: 0,
    dropsFound: 0,
    step: 1,
    floor: 1,
    clearedFloors: 0,
    bossSeen: false,
    keysUsed: new Set<string>(),
    elapsed: 0,
    ...patch,
  };
}

describe('新手引导：条目表', () => {
  it('至少九条，id 不重复且都不为空（条数会随引导补充而涨，断言不许写死）', () => {
    // 为什么不再写死 === 9：补 REQ §2「怎么切换地图」时加了一条 switch-floor，
    // 写死条数就会让「加一条教学内容」变成「改测试」—— 那不是约束，那是绊脚绳。
    expect(TUTORIAL_LENGTH).toBe(TUTORIAL_STEPS.length);
    expect(TUTORIAL_LENGTH).toBeGreaterThanOrEqual(9);
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TUTORIAL_STEPS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
      expect(typeof s.done).toBe('function');
    }
  });

  it('REQ §2「怎么切换地图」有独立一条，且按 ← → 就算教完', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'switch-floor');
    expect(step).toBeDefined();
    expect(step?.text).toContain('←');
    const facts = (keys: string[]): TutorialFacts => ({
      kills: 0,
      dropsFound: 0,
      step: 0,
      floor: 1,
      clearedFloors: 0,
      bossSeen: false,
      keysUsed: new Set(keys),
      elapsed: 0,
    });
    expect(step?.done(facts([]))).toBe(false);
    expect(step?.done(facts(['ArrowLeft']))).toBe(true);
    expect(step?.done(facts(['ArrowRight']))).toBe(true);
  });

  it('每条文案都是「一句话」，不是一段世界观（≤48 字 = 960 宽下正好一行）', () => {
    for (const s of TUTORIAL_STEPS) {
      // 48 个汉字 ≈ 96 半角宽，正好是 960 画布上引导条一行的容量；
      // 超过它就会折成两行、把条子顶高，挤到战斗区。
      expect(s.text.length).toBeLessThanOrEqual(48);
      // 最多两句（最后一条要一次报四个键位，允许两个句号），再多就说明一条里塞了两件事
      expect((s.text.match(/。/g) ?? []).length).toBeLessThanOrEqual(2);
      expect(s.text).not.toContain('\n');
    }
  });

  it('第一件事教「不用按键」，最后一条给全部面板键位', () => {
    expect(TUTORIAL_STEPS[0].id).toBe('awake');
    expect(TUTORIAL_STEPS[0].text).toContain('不必按任何键');
    const outro = TUTORIAL_STEPS[TUTORIAL_LENGTH - 1];
    expect(outro.id).toBe('outro');
    for (const key of ['E', 'G', 'T', 'D']) expect(outro.text).toContain(key);
  });
});

describe('新手引导：脏值夹取', () => {
  it('NaN / null / 字符串 / 未定义一律归 0（存档是玩家能改的）', () => {
    for (const v of [Number.NaN, null, undefined, '3', {}, [], true]) {
      expect(clampTutorialIndex(v)).toBe(0);
    }
  });

  it('负数归 0，超长夹到 LENGTH，小数向下取整', () => {
    expect(clampTutorialIndex(-7)).toBe(0);
    expect(clampTutorialIndex(999)).toBe(TUTORIAL_LENGTH);
    expect(clampTutorialIndex(Number.POSITIVE_INFINITY)).toBe(0); // 非有限数 → 0，不是 LENGTH
    expect(clampTutorialIndex(3.9)).toBe(3);
    expect(clampTutorialIndex(TUTORIAL_LENGTH)).toBe(TUTORIAL_LENGTH);
  });

  it('Infinity 归 0 是有意的：想让引导走完必须传 LENGTH（主程序因此不能用 Infinity）', () => {
    expect(tutorialFinished(Number.POSITIVE_INFINITY)).toBe(false);
    expect(tutorialFinished(TUTORIAL_LENGTH)).toBe(true);
  });
});

describe('新手引导：推进', () => {
  it('下标越界 = 已走完，currentTutorialStep 返回 undefined', () => {
    expect(currentTutorialStep(0)?.id).toBe('awake');
    expect(currentTutorialStep(TUTORIAL_LENGTH)).toBeUndefined();
    expect(currentTutorialStep(-1)?.id).toBe('awake');
  });

  it('杀第一只怪就跳过「awake」，但停在「first-kill」（还没到 3 只）', () => {
    expect(advanceTutorial(0, facts({ kills: 1 }))).toBe(1);
    expect(advanceTutorial(0, facts({ kills: 3 }))).toBe(2);
  });

  it('一次调用可以连跳多条（一口气杀了 5 只、还掉了东西）', () => {
    const next = advanceTutorial(0, facts({ kills: 5, dropsFound: 2 }));
    // awake(杀1) → first-kill(杀3) → first-drop(掉1) 都满足，停在 panel-skill
    expect(next).toBe(3);
    expect(TUTORIAL_STEPS[next].id).toBe('panel-skill');
  });

  it('按了 G 就跳过「按 G 看神通」那一条', () => {
    const f = facts({ kills: 5, dropsFound: 2, keysUsed: new Set(['KeyG']) });
    expect(TUTORIAL_STEPS[advanceTutorial(0, f)].id).toBe('panel-talent');
  });

  it('绝不倒退：已经到第 6 条，即便事实只满足前面几条也留在第 6 条', () => {
    expect(advanceTutorial(6, facts())).toBe(6);
    expect(advanceTutorial(6, facts({ kills: 1 }))).toBe(6);
  });

  it('挂机兜底：什么都不按、什么都没发生，elapsed 够了也会往前走', () => {
    // 放置游戏的引导不能靠玩家操作才能推进 —— 他可能在挂机
    expect(advanceTutorial(0, facts({ elapsed: 0 }))).toBe(0);
    expect(advanceTutorial(0, facts({ elapsed: 8 }))).toBe(1); // awake 的 7 秒兜底
    expect(advanceTutorial(0, facts({ elapsed: 100 }))).toBe(TUTORIAL_LENGTH); // 全部兜底都满足
  });

  it('推进只依赖传进来的事实，不读时间也不改事实', () => {
    const f = facts({ kills: 1 });
    const before = JSON.stringify({ ...f, keysUsed: [...f.keysUsed] });
    advanceTutorial(0, f);
    const after = JSON.stringify({ ...f, keysUsed: [...f.keysUsed] });
    expect(after).toBe(before);
  });

  it('REQ §2「解锁第二张地图」有独立一条，界必须与 tierOfFloor 一致', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'tier');
    expect(step).toBeDefined();
    // 边界口径来自 src/data/monsters.ts 的 tierOfFloor：1~9 一阶 / 10~18 二阶 / 19~27 三阶。
    // 文案写「第十层起」，所以 done 必须是 floor >= 10 —— 写 floor > 10 就与表错开一层。
    const at = (floor: number): TutorialFacts => ({
      kills: 0,
      dropsFound: 0,
      step: 0,
      floor,
      clearedFloors: 0,
      bossSeen: false,
      keysUsed: new Set(),
      elapsed: 0,
    });
    expect(step?.done(at(9))).toBe(false);
    expect(step?.done(at(10))).toBe(true);
    // 两个「阶」必须分开说：渊层阶位按层号、灵纹阶按灵蕴，差约 5 层。
    // 这条钉子防的是「以后有人好心把文案改回『玄阶的怪掉玄阶灵纹』」。
    expect(step?.text).toContain('渊层');
    expect(step?.text).toContain('灵纹阶');
    expect(step?.text).not.toContain('灵蕴也高');
  });

  it('镇守出场就教镇守；通了第一层就教「下一层自己开」；回到打过的层另有一条', () => {
    const bossFacts = facts({ kills: 5, dropsFound: 2, bossSeen: true });
    // 顺序固定：镇守在「floor」之前
    const idxBoss = TUTORIAL_STEPS.findIndex((s) => s.id === 'boss');
    expect(TUTORIAL_STEPS[idxBoss].done(bossFacts)).toBe(true);
    const floorStep = TUTORIAL_STEPS.find((s) => s.id === 'floor');
    expect(floorStep?.done(facts({ clearedFloors: 1 }))).toBe(true);
    expect(floorStep?.done(facts({ clearedFloors: 0, elapsed: 3 }))).toBe(false);
    // 换层（← →）从 floor 里拆出去了：首通是「往下开」，换层是「回去刷」，两件事
    const idxFloor = TUTORIAL_STEPS.findIndex((s) => s.id === 'floor');
    const idxSwitch = TUTORIAL_STEPS.findIndex((s) => s.id === 'switch-floor');
    expect(idxSwitch).toBeGreaterThan(idxFloor);
    const switchStep = TUTORIAL_STEPS[idxSwitch];
    expect(switchStep.done(facts({ keysUsed: new Set(['ArrowRight']) }))).toBe(true);
    expect(switchStep.done(facts({ clearedFloors: 3 }))).toBe(false);
  });
});

describe('新手引导：进度文本', () => {
  it('下标 +1 显示给人看', () => {
    expect(tutorialProgressText(0)).toBe(`1 / ${TUTORIAL_LENGTH}`);
    expect(tutorialProgressText(8)).toBe(`9 / ${TUTORIAL_LENGTH}`);
  });

  it('走完之后不再显示「10 / 9」这种数字', () => {
    expect(tutorialProgressText(TUTORIAL_LENGTH)).toBe(`${TUTORIAL_LENGTH} / ${TUTORIAL_LENGTH}`);
    expect(tutorialProgressText(999)).toBe(`${TUTORIAL_LENGTH} / ${TUTORIAL_LENGTH}`);
  });
});

describe('引导条：折行与高度', () => {
  it('中文按两个半角宽算：8 个汉字在 16 宽里正好一行', () => {
    const lines = wrapTutorialText('浊气入体你还活着', 16);
    expect(lines).toEqual(['浊气入体你还活着']);
  });

  it('超过宽度就折行，且每行都不超过预算', () => {
    const text = TUTORIAL_STEPS[8].text; // 最长的一条
    const lines = wrapTutorialText(text, 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      let w = 0;
      for (const ch of line) w += (ch.codePointAt(0) ?? 0) < 0x2e80 ? 1 : 2;
      expect(w).toBeLessThanOrEqual(20);
    }
    // 折行不能吞字（把所有行的字拼起来等于原文）
    expect(lines.join('')).toBe(text);
  });

  it('空串返回一个空行（画的时候不留 undefined）', () => {
    expect(wrapTutorialText('', 20)).toEqual(['']);
  });

  it('换行符强制断行（文案里写 \\n 就是硬断）', () => {
    expect(wrapTutorialText('甲\n乙', 20)).toEqual(['甲', '乙']);
  });

  it('预算非法时兜一个下限，不返回空数组', () => {
    expect(wrapTutorialText('浊气', 0).length).toBeGreaterThan(0);
    expect(wrapTutorialText('浊气', Number.NaN)).toEqual(['浊气']);
  });

  it('文字越长条越高，且高度是行数的线性函数（窄画布上长文案才会折行）', () => {
    // 960 宽时 boxW 已经顶到 MAX_BOX_W=640，最长那条也只有一行 —— 比高度要用窄画布
    const narrow = 320;
    const short = tutorialBoxHeight('浊气入体', narrow);
    const long = tutorialBoxHeight(TUTORIAL_STEPS[8].text, narrow);
    expect(long).toBeGreaterThan(short);
    // 与渲染层常量对齐：上下内边距 12×2 + 标题 18 + 每行 20
    const textUnits = Math.floor((Math.max(240, narrow - 60) - 32 - 8) / 6.5);
    const linesLong = wrapTutorialText(TUTORIAL_STEPS[8].text, textUnits).length;
    expect(long).toBe(24 + 18 + linesLong * 20);
    // 960 宽时最长那条也只有一行：引导条不应该在桌面上变成两行
    expect(wrapTutorialText(TUTORIAL_STEPS[8].text, 92).length).toBe(1);
  });
});
