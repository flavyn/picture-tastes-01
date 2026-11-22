import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

type Color = [number, number, number];
type Point = [number, number];
type Paint = (x: number, y: number) => Color;
const SIZE = 1024;
const SCALE = 2;
const WIDTH = SIZE * SCALE;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a: Color, b: Color, t: number): Color => a.map((v, i) => v + (b[i] - v) * clamp(t)) as Color;

function createPixelBuffer(): Float32Array {
  return new Float32Array(WIDTH * WIDTH * 3);
}

const pixels = createPixelBuffer();

function blendPixel(x: number, y: number, color: Color, alpha: number): void {
  const i = (y * WIDTH + x) * 3;
  for (let c = 0; c < 3; c++) pixels[i + c] += (color[c] - pixels[i + c]) * alpha;
}

function rasterize(bounds: number[], distance: (x: number, y: number) => number, paint: Paint, opacity = 1, softness = 0.6): void {
  const [left, top, right, bottom] = bounds;
  for (let py = Math.max(0, Math.floor(top * SCALE)); py < Math.min(WIDTH, Math.ceil(bottom * SCALE)); py++) {
    const y = (py + 0.5) / SCALE;
    for (let px = Math.max(0, Math.floor(left * SCALE)); px < Math.min(WIDTH, Math.ceil(right * SCALE)); px++) {
      const x = (px + 0.5) / SCALE;
      const alpha = clamp(0.5 - distance(x, y) / softness) * opacity;
      if (alpha > 0) blendPixel(px, py, paint(x, y), alpha);
    }
  }
}

function radialGradient(cx: number, cy: number, rx: number, ry: number, inner: Color, outer: Color): Paint {
  return (x, y) => mix(inner, outer, Math.hypot((x - cx) / rx, (y - cy) / ry));
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, paint: Paint | Color, angle = 0, opacity = 1, softness = 0.6): void {
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const ex = Math.hypot(rx * cs, ry * sn) + softness;
  const ey = Math.hypot(rx * sn, ry * cs) + softness;
  rasterize([cx - ex, cy - ey, cx + ex, cy + ey], (x, y) => {
    const u = (x - cx) * cs + (y - cy) * sn;
    const v = -(x - cx) * sn + (y - cy) * cs;
    const k0 = Math.hypot(u / rx, v / ry);
    const k1 = Math.hypot(u / (rx * rx), v / (ry * ry));
    return k1 === 0 ? -Math.min(rx, ry) : k0 * (k0 - 1) / k1;
  }, typeof paint === 'function' ? paint : () => paint, opacity, softness);
}

function fillRoundedRect(cx: number, cy: number, w: number, h: number, radius: number, angle: number, paint: Paint | Color, opacity = 1): void {
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const ex = Math.abs(cs) * w / 2 + Math.abs(sn) * h / 2 + 2;
  const ey = Math.abs(sn) * w / 2 + Math.abs(cs) * h / 2 + 2;
  rasterize([cx - ex, cy - ey, cx + ex, cy + ey], (x, y) => {
    const qx = Math.abs((x - cx) * cs + (y - cy) * sn) - w / 2 + radius;
    const qy = Math.abs(-(x - cx) * sn + (y - cy) * cs) - h / 2 + radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  }, typeof paint === 'function' ? paint : () => paint, opacity);
}

function strokePath(points: Point[], width: number, color: Color, opacity = 1, softness = 0.7): void {
  // A union of capsule SDFs avoids seams and alpha buildup at the joints.
  const radius = width / 2;
  const pad = radius + softness;
  const segments = points.slice(1).map((p, i) => {
    const a = points[i], dx = p[0] - a[0], dy = p[1] - a[1];
    return { a, dx, dy, length2: dx * dx + dy * dy };
  });
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  rasterize([Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad], (x, y) => {
    let d2 = Infinity;
    for (const s of segments) {
      const t = clamp(((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / (s.length2 || 1));
      const dx = x - s.a[0] - t * s.dx, dy = y - s.a[1] - t * s.dy;
      d2 = Math.min(d2, dx * dx + dy * dy);
    }
    return Math.sqrt(d2) - radius;
  }, () => color, opacity, softness);
}

function drawBackground(): void {
  for (let py = 0; py < WIDTH; py++) {
    for (let px = 0; px < WIDTH; px++) {
      const x = px / SCALE, y = py / SCALE;
      const glow = Math.exp(-(((x - 350) / 650) ** 2 + ((y - 310) / 620) ** 2));
      const vignette = clamp(Math.hypot((x - 512) / 750, (y - 480) / 800));
      const color = mix([35, 25, 23], [133, 92, 60], glow * (1 - vignette * 0.4));
      const grain = 0.45 * Math.sin(x * 1.9 + y * 3.7) + 0.3 * Math.sin(y * 0.13 + Math.sin(x * 0.015));
      const i = (py * WIDTH + px) * 3;
      for (let c = 0; c < 3; c++) pixels[i + c] = color[c] + grain;
    }
  }
}

function drawBowl(): void {
  fillEllipse(523, 859, 370, 64, [14, 10, 9], 0, 0.42, 65);
  fillEllipse(516, 858, 222, 25, [7, 7, 7], 0, 0.65, 22);
  fillEllipse(512, 846, 138, 26, radialGradient(485, 837, 155, 38, [50, 49, 43], [17, 20, 20]));
  rasterize([143, 589, 881, 858], (x, y) => {
    const q = (y - 595) / 258;
    const half = 363 * Math.sqrt(Math.max(0, 1 - q * q));
    return Math.max(Math.abs(x - 512) - half, 595 - y, y - 850);
  }, (x, y) => {
    const light = Math.exp(-(((x - 340) / 190) ** 2)) * (0.38 + 0.32 * (y - 590) / 260);
    let color = mix([15, 23, 25], [78, 86, 81], light);
    const texture = Math.sin(x * 0.75 + Math.sin(y * 0.9)) * Math.sin(y * 1.8 + x * 0.16) * 1.2;
    const band = Math.exp(-(((y - 731) / 70) ** 2)) * Math.exp(-(((x - 260) / 100) ** 2));
    color = mix(color, [94, 100, 88], band * 0.13);
    return color.map(v => v + texture) as Color;
  });
  fillEllipse(512, 596, 367, 167, radialGradient(425, 552, 420, 205, [105, 108, 91], [18, 25, 26]));
  fillEllipse(512, 592, 355, 155, radialGradient(480, 565, 360, 180, [8, 13, 14], [59, 60, 48]));
  fillEllipse(512, 591, 340, 143, radialGradient(455, 560, 370, 170, [77, 39, 16], [19, 19, 14]));
}

function drawBroth(): void {
  fillEllipse(512, 595, 331, 132, radialGradient(447, 569, 350, 154, [198, 111, 28], [78, 35, 13]));
  fillEllipse(487, 602, 285, 105, [220, 126, 29], 0, 0.13, 25);
  for (let i = 0; i < 95; i++) {
    const t = i * 2.399963, r = Math.sqrt((i + 0.5) / 95);
    const x = 512 + Math.cos(t) * r * 313, y = 595 + Math.sin(t) * r * 119;
    const size = 1.1 + (Math.sin(i * 7.3) + 1) * 2.2;
    fillEllipse(x, y, size * 2.1, size * 0.65, [247, 177, 57], 0, 0.32);
    fillEllipse(x - size * 0.5, y - 0.5, size * 0.8, 0.5, [255, 221, 139], 0, 0.5);
  }
  strokePath([[218, 594], [230, 619], [255, 637], [281, 647]], 3.5, [255, 211, 130], 0.65);
  strokePath([[741, 651], [769, 637], [790, 619]], 2, [255, 214, 139], 0.52);
}

function drawNori(): void {
  const angle = -0.28;
  fillRoundedRect(315, 468, 128, 198, 5, angle, (x, y) => {
    const fleck = Math.sin(x * 1.1 + y * 0.8) * Math.sin(y * 1.7 - x * 0.3);
    const fold = Math.sin(x * 0.21 + y * 0.07) * 4;
    return [22 + fleck * 7 + fold, 39 + fleck * 10 + fold, 26 + fleck * 5];
  });
  for (let i = 0; i < 13; i++) {
    const x = 264 + i * 8;
    strokePath([[x - 17, 391 + i * 2.3], [x + 4, 463 + i * 2.3], [x + 22, 530 + i * 2.3]], 0.8, [131, 137, 77], 0.16);
  }
}

function drawNoodles(): void {
  fillEllipse(469, 590, 196, 86, [80, 37, 9], 0, 0.45, 10);
  for (let i = 0; i < 40; i++) {
    const points: Point[] = [];
    const cx = 454 + Math.sin(i * 2.4) * 42;
    const cy = 568 + i * 1.8;
    const rx = 70 + (i % 9) * 11, ry = 19 + (i % 6) * 4;
    const phase = i * 1.7;
    for (let j = 0; j <= 55; j++) {
      const t = phase + j / 55 * Math.PI * 1.92;
      points.push([cx + rx * Math.cos(t) + 7 * Math.sin(t * 3 + i), cy + ry * Math.sin(t) + 4 * Math.cos(t * 4 + i)]);
    }
    strokePath(points.map(([x, y]) => [x + 1.5, y + 3]), 8.3, [89, 43, 11], 0.8);
    strokePath(points, 6.8, [224 + i % 4 * 4, 163 + i % 3 * 6, 63]);
    strokePath(points.map(([x, y]) => [x - 0.5, y - 1.2]), 1.6, [255, 221, 133], 0.75);
  }
}

function drawPork(cx: number, cy: number, angle: number, size: number): void {
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const point = (u: number, v: number): Point => [cx + (u * cs - v * sn) * size, cy + (u * sn + v * cs) * size];
  fillEllipse(cx + 3, cy + 9, 103 * size, 63 * size, [51, 23, 11], angle, 0.6, 9);
  fillEllipse(cx, cy, 103 * size, 63 * size, (x, y) => {
    const u = ((x - cx) * cs + (y - cy) * sn) / size;
    const v = (-(x - cx) * sn + (y - cy) * cs) / size;
    const r = Math.hypot(u / 103, v / 63);
    const char = clamp((r - 0.78) / 0.19 + Math.sin(u * 0.36 + v * 0.12) * 0.14);
    const flesh = mix([205, 128, 90], [242, 184, 132], 0.5 + 0.25 * Math.sin(u * 0.06 + v * 0.12));
    return mix(flesh, [91, 37, 14], char);
  }, angle);
  const spiral: Point[] = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100 * Math.PI * 4.4, r = 4 + i / 100 * 78;
    spiral.push(point(Math.cos(t) * r, Math.sin(t) * r * 0.52));
  }
  strokePath(spiral, 11 * size, [160, 83, 53], 0.8);
  strokePath(spiral.map(([x, y]) => [x - 1, y - 2]), 5.5 * size, [255, 207, 159], 0.9);
  for (let i = 0; i < 17; i++) {
    const t = i * 2.399, r = 0.84 + 0.07 * Math.sin(i * 5);
    const [x, y] = point(Math.cos(t) * 100 * r, Math.sin(t) * 60 * r);
    fillEllipse(x, y, 3.5 * size, 1.5 * size, [62, 25, 12], angle + t, 0.8);
  }
  strokePath([point(-70, -30), point(-45, -43), point(-18, -45)], 2, [255, 228, 177], 0.8);
}

function drawEgg(): void {
  const cx = 655, cy = 654, angle = -0.48;
  fillEllipse(cx + 3, cy + 9, 89, 63, [59, 29, 12], angle, 0.65, 12);
  fillEllipse(cx, cy, 88, 62, radialGradient(628, 626, 110, 90, [255, 245, 208], [194, 155, 106]), angle);
  fillEllipse(cx - 2, cy - 3, 81, 55, radialGradient(632, 629, 110, 85, [255, 252, 226], [234, 215, 170]), angle);
  fillEllipse(665, 657, 44, 37, [195, 93, 8], angle);
  fillEllipse(663, 654, 41, 34, radialGradient(650, 642, 48, 40, [255, 187, 23], [232, 101, 5]), angle);
  fillEllipse(652, 642, 18, 9, [255, 220, 91], angle, 0.48, 4);
  fillEllipse(649, 638, 9, 3, [255, 244, 177], angle, 0.85, 1.3);
  fillEllipse(677, 669, 15, 8, [255, 146, 6], angle, 0.8, 3);
}

function drawScallions(): void {
  for (let i = 0; i < 39; i++) {
    const t = i * 2.39996, r = Math.sqrt((i + 1) / 39);
    const x = 511 + Math.cos(t) * r * 77, y = 531 + Math.sin(t) * r * 36;
    const angle = Math.sin(i * 2.1) * 0.9;
    const rx = 7 + i % 4, ry = 3.3 + i % 3;
    fillEllipse(x + 1, y + 3, rx + 1, ry + 1, [49, 56, 11], angle, 0.6);
    fillEllipse(x, y, rx, ry, i % 4 === 0 ? [171, 195, 86] : [68, 132, 44], angle);
    fillEllipse(x - 0.5, y - 0.6, rx - 2.2, Math.max(1, ry - 1.7), [184, 211, 103], angle);
    fillEllipse(x, y, rx - 3.5, Math.max(0.7, ry - 2.8), [57, 93, 29], angle);
  }
  for (const [x, y, a] of [[368, 655, 0.4], [572, 619, -0.3], [719, 582, -0.6], [429, 620, 0.2]]) {
    fillRoundedRect(x, y, 18, 5, 1, a, [86, 157, 46]);
    fillRoundedRect(x, y - 1, 15, 1.4, 0.5, a, [186, 210, 100]);
  }
}

function drawSteam(): void {
  for (let i = 0; i < 4; i++) {
    const points: Point[] = [];
    for (let j = 0; j <= 36; j++) {
      const t = j / 36;
      points.push([357 + i * 98 + Math.sin(t * 8 + i * 1.5) * (13 + t * 13), 484 - t * (222 + i % 2 * 45)]);
    }
    // Overlapping translucent ribbons soften toward the tip.
    for (let j = 0; j < 3; j++) {
      const portion = points.slice(j * 11, j * 11 + 14);
      strokePath(portion, 9 - j * 1.8, [247, 231, 198], 0.035 - j * 0.007, 15);
      strokePath(portion, 2.3, [255, 242, 220], 0.065 - j * 0.017, 5);
    }
  }
}

function downsample(): Buffer {
  const rows = Buffer.alloc(SIZE * (1 + SIZE * 3));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const target = y * (SIZE * 3 + 1) + 1 + x * 3;
      const source = ((y * 2) * WIDTH + x * 2) * 3;
      for (let c = 0; c < 3; c++) {
        rows[target + c] = Math.round((pixels[source + c] + pixels[source + 3 + c] + pixels[source + WIDTH * 3 + c] + pixels[source + WIDTH * 3 + 3 + c]) / 4);
      }
    }
  }
  return rows;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function encodePng(rows: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function main(): void {
  drawBackground();
  drawBowl();
  drawBroth();
  drawNori();
  drawNoodles();
  drawPork(664, 523, -0.22, 0.98);
  drawPork(713, 576, 0.16, 0.94);
  drawEgg();
  drawScallions();
  drawSteam();
  const png = encodePng(downsample());
  if (png.length > 1_048_576) throw new Error(`PNG exceeds size limit: ${png.length}`);
  const directory = process.env.ENTRY_OUT ?? '/output';
  mkdirSync(directory, { recursive: true });
  const filename = join(directory, 'entry.png');
  writeFileSync(filename, png);
  console.log(`${filename}: ${png.length} bytes`);
}

main();
