// 存档搬家（导出 / 导入）—— 纯逻辑。
//
// 为什么这条测试重要：`localStorage` 按域名隔离，换网址 / 换设备 / 清缓存都会让玩家「打开一看是新的」，
// 而且**不报错**。对 24 小时内容量的挂机游戏，这是最伤的一种失败。导出/导入是唯一的补救通道，
// 所以它的失败路径（选错文件、版本不符、文件坏）必须各有各的说法，不能统一成「导入失败」。
import { describe, expect, it } from 'vitest';
import {
  MAX_TRANSFER_BYTES,
  TRANSFER_FORMAT,
  TRANSFER_MAGIC,
  decodeTransfer,
  encodeTransfer,
  parseTransferYear,
  transferBytes,
  transferFailText,
  transferFileName,
  transferSummary,
} from '../src/core/save-transfer';
import { sessionFromSave, sessionToSave } from '../src/core/save-bridge';
import { createSession } from '../src/core/session';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import { formatRealm } from '../src/data/glossary';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function freshSession(seed = 424242) {
  return createSession({ classId: 'yujian', seed, tables: TABLES });
}

function goodText(): string {
  return encodeTransfer(sessionToSave(freshSession()));
}

describe('往返：导出再导入，境界和层要对得上', () => {
  it('同境界同层同周目', () => {
    const s = freshSession();
    s.character = { ...s.character, step: 17 };
    const text = encodeTransfer(sessionToSave(s));
    const res = decodeTransfer(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const back = sessionFromSave(res.state, { tables: TABLES });
    expect(back.character.step).toBe(17);
    expect(back.character.classId).toBe('yujian');
  });

  it('信封里有 magic / format / exportedAt', () => {
    const text = goodText();
    const raw = JSON.parse(text) as Record<string, unknown>;
    expect(raw.magic).toBe(TRANSFER_MAGIC);
    expect(raw.format).toBe(TRANSFER_FORMAT);
    expect(typeof raw.exportedAt).toBe('number');
  });

  it('导出两次，除时间戳外逐字节相同（说明导出本身不带运行时随机）', () => {
    const s = freshSession();
    // `savedAt` 是 sessionToSave 里打的墙钟，每次不同，属正常；其余必须逐字节一致 ——
    // 否则「同一个档导出两份内容不一样」会让玩家怀疑哪份才是真的。
    const strip = (text: string) => {
      const env = JSON.parse(text) as { save: Record<string, unknown> };
      delete env.save.savedAt;
      return JSON.stringify(env.save);
    };
    expect(strip(encodeTransfer(sessionToSave(s), 1000))).toBe(strip(encodeTransfer(sessionToSave(s), 2000)));
  });
});

describe('失败路径：每种错误都要有各自的说法', () => {
  it('空文本', () => {
    const res = decodeTransfer('   ');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('not-json');
  });

  it('不是 JSON', () => {
    const res = decodeTransfer('这不是存档');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('not-json');
  });

  it('顶层不是对象（"123" / "null"）', () => {
    for (const t of ['123', 'null', '[]']) {
      const res = decodeTransfer(t);
      expect(res.ok).toBe(false);
    }
  });

  it('别家的 json（没有 magic）识别成「不是《浊仙》的存档」', () => {
    const res = decodeTransfer(JSON.stringify({ hello: 'world' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('wrong-app');
  });

  it('信封版本不符', () => {
    const res = decodeTransfer(JSON.stringify({ magic: TRANSFER_MAGIC, format: 999, save: {} }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('wrong-format');
  });

  it('超过 512KB 直接拒绝（不先 JSON.parse 一个 50MB 的文件）', () => {
    const huge = 'x'.repeat(MAX_TRANSFER_BYTES + 10);
    const res = decodeTransfer(huge);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('too-large');
  });

  it('magic 对但存档形状坏 → bad-save，并带上 deserialize 的原因', () => {
    const res = decodeTransfer(JSON.stringify({ magic: TRANSFER_MAGIC, format: TRANSFER_FORMAT, save: { version: 1 } }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('bad-save');
      expect(typeof res.detail).toBe('string');
    }
  });
});

describe('文案与文件名', () => {
  it('每种失败都有非空的人话，且互不相同', () => {
    const texts = (['too-large', 'not-json', 'wrong-app', 'wrong-format', 'bad-save'] as const).map((e) =>
      transferFailText(e),
    );
    for (const t of texts) expect(t.length).toBeGreaterThan(4);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('bad-save 的两种已知原因有专门说法', () => {
    expect(transferFailText('bad-save', 'wrong-version')).toContain('版本');
    expect(transferFailText('bad-save', 'unknown-class')).toContain('道统');
    expect(transferFailText('bad-save')).not.toBe(transferFailText('bad-save', 'wrong-version'));
  });

  it('文件名带时间戳，且是 .json', () => {
    const name = transferFileName(new Date(2026, 9, 23, 8, 5));
    expect(name).toBe('zhuoxian-save-20261023-0805.json');
  });

  it('摘要报四项，且认得出是初临还是第几周目', () => {
    const s = freshSession();
    const text0 = transferSummary(sessionToSave(s), formatRealm);
    expect(text0).toContain('第 1 层');
    expect(text0).toContain('初临');
    expect(text0).toContain('渊痕');
    s.cycle = 3;
    expect(transferSummary(sessionToSave(s), formatRealm)).toContain('第 3 周目');
  });

  it('transferBytes 按 UTF-8 字节算（中文占 3 字节）', () => {
    expect(transferBytes('abc')).toBe(3);
    expect(transferBytes('浊')).toBe(3);
  });

  it('parseTransferYear：能读到导出年份，脏值给 0', () => {
    expect(parseTransferYear(encodeTransfer(sessionToSave(freshSession()), new Date(2026, 9, 23).getTime()))).toBe(2026);
    expect(parseTransferYear('')).toBe(0);
    expect(parseTransferYear('nope')).toBe(0);
  });
});
