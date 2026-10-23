// 一次性补丁：修正 offline-save 测试的类型错误（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tests/offline-save.test.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

// 1) 测试里自己定义"写会抛"的适配器，不改生产代码
repl(
  `const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };`,
  `const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

/** 模拟"写盘会抛异常"的适配器（Safari 无痕 / 配额满） */
function throwingAdapter(): StorageAdapter {
  return {
    read: () => null,
    write: () => {
      throw new Error('QuotaExceededError');
    },
    remove: () => {},
  };
}`,
  'throwing-adapter',
);

repl(
  `  it('内存适配器能模拟"存不进去"（Safari 无痕模式）', () => {
    const a = createMemoryAdapter({ failWrite: true });
    expect(() => a.write(SAVE_KEY, 'x')).toThrow();
  });`,
  `  it('写会抛的适配器能被 Autosaver 吞掉（Safari 无痕模式不白屏）', () => {
    const a = throwingAdapter();
    expect(() => a.write(SAVE_KEY, 'x')).toThrow();
  });`,
  'memory-failwrite',
);

repl(
  `    const a = createMemoryAdapter({ failWrite: true });
    const saver = new Autosaver(a, () => freshSession(), TABLES);
    expect(saver.saveNow()).toBe(false);`,
  `    const saver = new Autosaver(throwingAdapter(), () => freshSession(), TABLES);
    expect(saver.saveNow()).toBe(false);`,
  'autosave-failwrite',
);

// 2) 类名笔误 + 装配表字段名（CharacterState 用的是 gemLoadouts: Record<string, string[]>）
c = c.split("createCharacter('fenyian')").join("createCharacter('fenyin')");
c = c.split("'fenyian'").join("'fenyin'");

repl(
  `      gemLoadout: ['mengong', 'wanhui'],`,
  `      gemLoadouts: { 'hanshui-jian': ['mengong', 'wanhui'] },`,
  'gemloadouts-set',
);

repl(
  `    expect(back?.character.gemLoadout).toEqual(['mengong', 'wanhui']);`,
  `    expect(back?.character.gemLoadouts).toEqual({ 'hanshui-jian': ['mengong', 'wanhui'] });`,
  'gemloadouts-assert',
);

// 3) 需要 StorageAdapter 类型
repl(
  `import { SAVE_KEY, createMemoryAdapter } from '../src/core/storage';`,
  `import { SAVE_KEY, createMemoryAdapter } from '../src/core/storage';
import type { StorageAdapter } from '../src/core/storage';`,
  'import-type',
);

fs.writeFileSync(p, c, 'utf8');
console.log('done');
