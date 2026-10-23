import fs from 'node:fs';
const files = [
  ['F:/dsh-work/zhuoxian/tests/hud-buttons.test.ts', [
    ["'achievement', 'marks', 'save'];", "'achievement', 'marks', 'save', 'sound'];"],
  ]],
  ['F:/dsh-work/zhuoxian/tests/hud-layout.test.ts', [
    ["expect(buttons).toHaveLength(8);", "expect(buttons).toHaveLength(9);"],
  ]],
];
for (const [P, edits] of files) {
  let c = fs.readFileSync(P, 'utf8');
  for (const [old, neu] of edits) {
    if (!c.includes(old)) throw new Error('MISS ' + P + ' :: ' + old);
    c = c.replace(old, neu);
  }
  fs.writeFileSync(P, c, 'utf8');
  console.log('OK', P);
}
