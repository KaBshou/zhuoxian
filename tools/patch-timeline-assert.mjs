// 给 run-timeline.mjs 加两条硬断言（shuzhi v4.28 建议）：
//   ① formedAt <= maxedAt（成型必须早于满级，结构性错误不许静默）
//   ② 硬门禁不过 → 进程退出码 1（FAIL 而不是只打一行红字）
// 注意：该文件是 CRLF，统一转 LF 打补丁后原样写回 CRLF。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'tools/run-timeline.mjs');
const raw = fs.readFileSync(FILE, 'utf8');
const before = raw.replace(/\r\n/g, '\n');

const anchor1 = `  const formedPass = formedRuns.length === runs.length && Number.isFinite(formedMed) &&
    formedMed <= FORMED_MAX && formedMed / FORMED_TARGET <= 1.15 && formedMed / FORMED_TARGET >= 0.85;
`;
if (!before.includes(anchor1)) throw new Error('MISS anchor formedPass');

const structural = `  // 结构性断言（shuzhi v4.28）：成型必须早于满级。
  // 若哪天 loot 权重重标导致「满级后才成型」，段② 这一整套判据就失去意义 —— 这是结构性错误，
  // 不能靠人眼看两条时间线，必须自己 FAIL。
  const lateFormed = runs.filter((r) => {
    const fa = preMax(r).formedAt;
    return Number.isFinite(fa) && Number.isFinite(r.maxedAt) && fa > r.maxedAt;
  });
  const structuralOk = lateFormed.length === 0;
  const formedPassFinal = formedPass && structuralOk;
  if (!structuralOk) {
    console.log(
      \`- ❌ **结构性错误**：\${lateFormed.length}/\${runs.length} 个种子「成型晚于满级」（\` +
        lateFormed.map((r) => \`seed \${r.seed} 成型 \${f(preMax(r).formedAt, 1)} > 满级 \${f(r.maxedAt, 1)}\`).join('；') +
        '）',
    );
  }
`;

const anchor2 = `      \`达成 \${formedRuns.length}/\${runs.length} 种子）→ **\${formedPass ? '通过' : '不通过'}**\`,
  );
`;
if (!before.includes(anchor2)) throw new Error('MISS anchor formed print');

let out = before.replace(anchor1, anchor1 + structural);
out = out.replace(anchor2, anchor2.replace('${formedPass ?', '${formedPassFinal ?'));

const anchor3 = `    console.log(\`\\nJSON 已写入 \${JSON_OUT}\`);
  }
}`;
if (!out.includes(anchor3)) throw new Error('MISS anchor json log');

out = out.replace(
  anchor3,
  `    console.log(\`\\nJSON 已写入 \${JSON_OUT}\`);
  }
  // 硬门禁不过 → 退出码 1：让「红」在一行命令里就能看见，不靠人读输出。
  const hardFail = !pass || !allMaxed || !formedPassFinal || !structuralOk;
  if (hardFail) {
    console.log('\\n❌ 硬门禁未全部通过（满级时长 / 段② 成型 / 结构性断言），退出码 1');
    process.exitCode = 1;
  }
}`,
);

if (out.length < before.length) throw new Error(`长度断言失败 ${before.length} -> ${out.length}`);

fs.mkdirSync(path.join(ROOT, 'tools/_bak'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/_bak/run-timeline.mjs.bak-d55'), raw);
const crlf = raw.includes('\r\n');
fs.writeFileSync(FILE, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log(`ok: ${raw.length} -> ${crlf ? out.replace(/\n/g, '\r\n').length : out.length} (CRLF=${crlf})`);
