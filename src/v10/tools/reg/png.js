// Minimal PNG codec on node's zlib: decodes 8-bit greyscale / RGB / RGBA / grey+alpha non-interlaced PNGs
// (what Chromium screenshots produce) to RGBA, and encodes RGBA to PNG. Used by pixdiff.js.
const zlib = require('zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || ![0, 2, 4, 6].includes(ctype)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${inter})`);
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype], stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
    prev = out;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += bpp) {
    if (ctype === 6) { rgba[i * 4] = px[j]; rgba[i * 4 + 1] = px[j + 1]; rgba[i * 4 + 2] = px[j + 2]; rgba[i * 4 + 3] = px[j + 3]; }
    else if (ctype === 2) { rgba[i * 4] = px[j]; rgba[i * 4 + 1] = px[j + 1]; rgba[i * 4 + 2] = px[j + 2]; rgba[i * 4 + 3] = 255; }
    else if (ctype === 0) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[j]; rgba[i * 4 + 3] = 255; }
    else { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[j]; rgba[i * 4 + 3] = px[j + 1]; }
  }
  return { width: w, height: h, data: rgba };
}

function encode({ width, height, data }) {
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (type, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(type, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(width, 0); ih.writeUInt32BE(height, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// count differing pixels over the union of both sizes (pixels outside one image count as different) and build a
// diff image: differing pixels red, the rest a faded copy of A. Returns {count, width, height, bbox, png}.
function diff(a, b) {
  const W = Math.max(a.width, b.width), H = Math.max(a.height, b.height), out = Buffer.alloc(W * H * 4);
  let count = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, inA = x < a.width && y < a.height, inB = x < b.width && y < b.height;
    const ia = (y * a.width + x) * 4, ib = (y * b.width + x) * 4;
    let same = inA && inB;
    if (same) for (let k = 0; k < 4; k++) if (a.data[ia + k] !== b.data[ib + k]) { same = false; break; }
    if (same) { const g = (a.data[ia] * 0.3 + a.data[ia + 1] * 0.59 + a.data[ia + 2] * 0.11) | 0, f = 255 - ((255 - g) >> 2); out[o] = out[o + 1] = out[o + 2] = f; out[o + 3] = 255; }
    else { count++; out[o] = 230; out[o + 1] = 0; out[o + 2] = 40; out[o + 3] = 255; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return { count, width: W, height: H, bbox: count ? [x0, y0, x1, y1] : null, png: count ? encode({ width: W, height: H, data: out }) : null };
}
module.exports = { decode, encode, diff };
