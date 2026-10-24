import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * 把 PNG 的某块区域打成 ASCII（自解 PNG，零依赖）。
 * 用途：模型没有图像输入，只能靠字符看结构。
 * 用法：node tools/ascii-crop.mjs <png> <x> <y> <w> <h> [cols]
 */
const [file, xs, ys, ws, hs, colsArg] = process.argv.slice(2);
const X = Number(xs);
const Y = Number(ys);
const W = Number(ws);
const H = Number(hs);
const COLS = Number(colsArg ?? 80);

const buf = fs.readFileSync(file);
let pos = 8;
let ihdr = null;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9] };
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  pos += 12 + len;
}
if (!ihdr) throw new Error('no IHDR');
const { w, h, color } = ihdr;
const channels = color === 6 ? 4 : color === 2 ? 3 : color === 0 ? 1 : 4;
const bpp = channels;
const stride = w * bpp;
const raw = zlib.inflateSync(Buffer.concat(idat));
const out = Buffer.alloc(h * stride);
let rp = 0;
for (let y = 0; y < h; y += 1) {
  const filter = raw[rp];
  rp += 1;
  const line = raw.subarray(rp, rp + stride);
  rp += stride;
  const cur = out.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  for (let x = 0; x < stride; x += 1) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev[x];
    const c = x >= bpp ? prev[x - bpp] : 0;
    let v = line[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    cur[x] = v & 0xff;
  }
}
function lum(px, py) {
  const i = py * stride + px * bpp;
  const r = out[i];
  const g = channels >= 3 ? out[i + 1] : r;
  const b = channels >= 3 ? out[i + 2] : r;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
const RAMP = ' .:-=+*#%@';
const rows = Math.max(1, Math.round((COLS * H) / W / 2));
for (let ry = 0; ry < rows; ry += 1) {
  let line = '';
  for (let rx = 0; rx < COLS; rx += 1) {
    const x0 = Math.min(w - 1, Math.round(X + (rx * W) / COLS));
    const x1 = Math.min(w, Math.round(X + ((rx + 1) * W) / COLS));
    const y0 = Math.min(h - 1, Math.round(Y + (ry * H) / rows));
    const y1 = Math.min(h, Math.round(Y + ((ry + 1) * H) / rows));
    let mx = 0;
    for (let py = y0; py < Math.max(y0 + 1, y1); py += 1) {
      for (let px = x0; px < Math.max(x0 + 1, x1); px += 1) {
        const l = lum(px, py);
        if (l > mx) mx = l;
      }
    }
    line += RAMP[Math.min(RAMP.length - 1, Math.floor((mx / 255) * RAMP.length))];
  }
  console.log(`${String(Math.round(Y + (ry * H) / rows)).padStart(4)}|${line}`);
}
console.log(`     (${file} @ ${X},${Y} ${W}x${H} · 图片 ${w}x${h})`);
