import fs from 'node:fs';
function patch(P, edits) {
  let c = fs.readFileSync(P, 'utf8');
  for (const [old, neu, tag] of edits) {
    if (!c.includes(old)) throw new Error('MISS ' + P + ' ' + tag);
    c = c.replace(old, neu);
  }
  fs.writeFileSync(P, c, 'utf8');
  console.log('OK', P);
}
// hud-layout: 期望 9 个按钮（加 sound）
patch('F:/dsh-work/zhuoxian/tests/hud-layout.test.ts', [
  ["      'marks',\n      'save',\n    ]);", "      'marks',\n      'save',\n      'sound',\n    ]);", 'ids'],
]);
