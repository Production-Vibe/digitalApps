import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'src', 'public', 'icons');

const BG = [19, 28, 48, 255];
const ACCENT = [37, 99, 235, 255];
const LIGHT = [147, 197, 253, 255];
const WHITE = [255, 255, 255, 255];

let crcTable: Int32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcB]);
}

function encodePng(size: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function fillRect(img: Buffer, size: number, x: number, y: number, w: number, h: number, color: number[]): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(size, Math.round(x + w));
  const y1 = Math.min(size, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * size + xx) * 4;
      img[i] = color[0];
      img[i + 1] = color[1];
      img[i + 2] = color[2];
      img[i + 3] = color[3];
    }
  }
}

const GLYPH_C = [
  '10001', '10001', '10001', '10001',
  '10001', '10001', '11111',
];
const GLYPH_N = [
  '10001', '10001', '11111', '10001',
  '10001', '10001', '10001',
];

function drawGlyph(
  img: Buffer, size: number, grid: string[],
  x: number, y: number, cell: number, edgeSize: number,
): void {
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      if (grid[i][j] !== '1') continue;
      const gx = x + j * cell;
      const gy = y + i * cell;
      fillRect(img, size, gx - edgeSize, gy - edgeSize, cell + edgeSize * 2, cell + edgeSize * 2, ACCENT);
      fillRect(img, size, gx, gy, cell, cell, WHITE);
    }
  }
}

function drawIcon(size: number): Buffer {
  const img = Buffer.alloc(size * size * 4);
  fillRect(img, size, 0, 0, size, size, BG);
  const k = size / 512;
  const r = (x: number, y: number, w: number, h: number, c: number[]): void =>
    fillRect(img, size, x * k, y * k, w * k, h * k, c);

  // подъёмная стрела (бум): ободок + заливка
  r(236, 84, 236, 32, LIGHT);
  r(244, 92, 220, 16, ACCENT);
  // трос и крюк
  r(440, 108, 10, 176, LIGHT);
  r(430, 284, 30, 12, ACCENT);
  r(432, 296, 26, 6, LIGHT);
  // колонна: ободок + заливка + контргруз слева
  r(148, 128, 26, 160, ACCENT);
  r(176, 128, 66, 164, LIGHT);
  r(186, 140, 46, 152, ACCENT);
  // оголовок колонны
  r(168, 118, 82, 12, LIGHT);
  // основание
  r(140, 292, 330, 14, LIGHT);
  r(140, 306, 330, 10, ACCENT);

  // буквы Ц, Н
  const cell = 25 * k;
  const edge = 3 * k;
  const glyphW = 5 * cell;
  const gap = 34 * k;
  const startX = (size - (glyphW * 2 + gap)) / 2;
  const startY = 334 * k;
  drawGlyph(img, size, GLYPH_C, startX, startY, cell, edge);
  drawGlyph(img, size, GLYPH_N, startX + glyphW + gap, startY, cell, edge);

  return encodePng(size, img);
}

mkdirSync(OUT_DIR, { recursive: true });
const files: Array<[string, number]> = [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon-180.png', 180],
];
for (const [name, size] of files) {
  writeFileSync(path.join(OUT_DIR, name), drawIcon(size));
  console.log('created', path.join(OUT_DIR, name), `${size}x${size}`);
}