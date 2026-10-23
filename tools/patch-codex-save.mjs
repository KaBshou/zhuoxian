// D87 图鉴入档：save.ts（ProgressSave + serialize + deserialize）+ save-bridge.ts
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

function patch(file, pairs) {
  const raw = readFileSync(file, 'utf8');
  let c = raw;
  for (const [tag, oldText, newText] of pairs) {
    if (!c.includes(oldText)) throw new Error(`MISS ${file} :: ${tag}`);
    c = c.replace(oldText, newText);
  }
  if (c.length < raw.length * 0.9) throw new Error(`长度异常 ${file}: ${raw.length} → ${c.length}`);
  mkdirSync('tools/_bak', { recursive: true });
  copyFileSync(file, `tools/_bak/${file.replace(/[\\/]/g, '_')}.bak`);
  writeFileSync(file, c, 'utf8');
  console.log(`patched ${file}: ${raw.length} → ${c.length} chars`);
}

patch('src/core/save.ts', [
  [
    'ProgressSave 字段',
    `  readonly tutorialStep?: number;
}`,
    `  readonly tutorialStep?: number;
  /**
   * 图鉴（D87）：已收录的浊物 / 传奇 id。
   *
   * **必须入档**：收集进度是"回不去的进度"，从别的字段算不出来
   * （地上会消失、背包会被换掉）。只存 id —— 名字/描述/百分比全由数据表算（存档铁律）。
   * 读档时由 save-bridge 过 \`sanitizeCodex\` 洗一遍，脏值安静丢弃。
   */
  readonly codex?: { readonly monsters?: readonly string[]; readonly legendaries?: readonly string[] };
}`,
  ],
  [
    'serialize 入参',
    `  maxFloorReached?: number;
  tutorialStep?: number;`,
    `  maxFloorReached?: number;
  tutorialStep?: number;
  codex?: { readonly monsters?: readonly string[]; readonly legendaries?: readonly string[] };`,
  ],
  [
    'serialize 输出',
    `      tutorialStep: Math.max(0, Math.floor(input.tutorialStep ?? 0)),
    },`,
    `      tutorialStep: Math.max(0, Math.floor(input.tutorialStep ?? 0)),
      // 图鉴：只写 id 数组；缺省就是空图鉴（老档没有这个字段 = 什么都没收集到）
      codex: {
        monsters: Array.isArray(input.codex?.monsters) ? [...input.codex.monsters] : [],
        legendaries: Array.isArray(input.codex?.legendaries) ? [...input.codex.legendaries] : [],
      },
    },`,
  ],
  [
    'deserialize',
    `        tutorialStep:
          typeof pr.tutorialStep === 'number' && Number.isFinite(pr.tutorialStep)
            ? Math.max(0, Math.floor(pr.tutorialStep))
            : 0,
      },`,
    `        tutorialStep:
          typeof pr.tutorialStep === 'number' && Number.isFinite(pr.tutorialStep)
            ? Math.max(0, Math.floor(pr.tutorialStep))
            : 0,
        // 图鉴：同样是逐字段重建（漏一行 = 静默清零，和渊痕/引导是同一类事故）。
        // 这里只做"是不是数组"的形状校验，id 合不合法交给 sanitizeCodex（它知道数据表）。
        codex: {
          monsters: Array.isArray((pr.codex as { monsters?: unknown } | undefined)?.monsters)
            ? ((pr.codex as { monsters: unknown[] }).monsters.filter((x): x is string => typeof x === 'string'))
            : [],
          legendaries: Array.isArray((pr.codex as { legendaries?: unknown } | undefined)?.legendaries)
            ? ((pr.codex as { legendaries: unknown[] }).legendaries.filter((x): x is string => typeof x === 'string'))
            : [],
        },
      },`,
  ],
]);

patch('src/core/save-bridge.ts', [
  [
    'sessionToSave',
    `    tutorialStep: s.tutorialStep,`,
    `    tutorialStep: s.tutorialStep,
    codex: { monsters: s.codex?.monsters ?? [], legendaries: s.codex?.legendaries ?? [] },`,
  ],
  [
    'sessionFromSave',
    `  s.tutorialStep = clampTutorialIndex(state.progress.tutorialStep ?? 0);`,
    `  s.tutorialStep = clampTutorialIndex(state.progress.tutorialStep ?? 0);
  // 图鉴：存档是玩家能改的 —— 未知 id / 重复 / 非字符串一律由 sanitizeCodex 安静丢掉，
  // 否则面板会出现"第 23 行是空名字"，或者进度显示 130%。
  s.codex = sanitizeCodex(state.progress.codex);`,
  ],
]);
