import fs from 'node:fs';
const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;
if (!c.includes("canvas.addEventListener('pointerdown', (e) => {")) throw new Error('MISS pointerdown');
c = c.replace("canvas.addEventListener('pointerdown', (e) => {",
  "canvas.addEventListener('pointerdown', (e) => {\n  // 鼠标/触屏也是用户手势：手机上没有键盘，只能靠这一下解锁音频。\n  audio.unlock();");
fs.writeFileSync(P, c, 'utf8');
console.log('OK', before, '->', c.length);
