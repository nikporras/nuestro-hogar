/*
 * Dependency-free PNG icon generator for Nuestro Hogar.
 * Draws the brand gradient (#667eea -> #764ba2) with a white house mark,
 * full-bleed so it doubles as a maskable icon. Uses only Node built-ins.
 *
 *   node scripts/generate-icons.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- CRC32 (for PNG chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

// Point-in-triangle test
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function renderPNG(size) {
  const g1 = [0x66, 0x7e, 0xea]; // #667eea
  const g2 = [0x76, 0x4b, 0xa2]; // #764ba2
  // raw image: each row prefixed with filter byte 0
  const raw = Buffer.alloc((size * 4 + 1) * size);

  // House geometry (normalized to size)
  const cx = size * 0.5;
  const roofApexY = size * 0.30, roofBaseY = size * 0.50;
  const roofHalf = size * 0.26;
  const bodyTop = size * 0.46, bodyBot = size * 0.72;
  const bodyHalf = size * 0.19;
  const doorHalf = size * 0.055, doorTop = size * 0.57;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size); // diagonal gradient
      let r = lerp(g1[0], g2[0], t), g = lerp(g1[1], g2[1], t), b = lerp(g1[2], g2[2], t);

      const roof = inTri(x, y, cx, roofApexY, cx - roofHalf, roofBaseY, cx + roofHalf, roofBaseY);
      const body = x >= cx - bodyHalf && x <= cx + bodyHalf && y >= bodyTop && y <= bodyBot;
      const door = x >= cx - doorHalf && x <= cx + doorHalf && y >= doorTop && y <= bodyBot;

      if ((roof || body) && !door) { r = 255; g = 255; b = 255; }

      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
[192, 512].forEach((s) => {
  const file = path.join(outDir, `icon-${s}.png`);
  fs.writeFileSync(file, renderPNG(s));
  console.log("wrote", file);
});
