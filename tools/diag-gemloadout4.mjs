// 诊断 4：mengong vs cuijin 条目逐字节比对。跑完即弃。
import fs from 'node:fs';
const c = fs.readFileSync('F:/dsh-work/zhuoxian/src/data/support-gems.ts', 'utf8');
for (const id of ['mengong', 'cuijin', 'jixie']) {
  const i = c.indexOf(`id: '${id}'`);
  const entry = c.slice(i, c.indexOf('},', i) + 1);
  console.log(`=== ${id} (${entry.length} chars) ===`);
  console.log(entry);
}
