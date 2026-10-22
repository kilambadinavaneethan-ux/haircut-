const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

function writePngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(width, height, colorFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = writePngChunk('IHDR', ihdrData);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = colorFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = writePngChunk('IDAT', compressed);
  const iendChunk = writePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Color generators
function customerIconShader(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rNorm = dist / (w / 2);

  // Background dark gradient
  let r = 15;
  let g = 23;
  let b = 42;
  let a = 255;

  // Gold circular crest ring
  const ringDist = Math.abs(dist - w * 0.36);
  if (ringDist < w * 0.02) {
    return [245, 158, 11, 255]; // Amber gold
  }

  // Inner gold emblem
  if (dist < w * 0.34) {
    // Subtle radial glow
    r = Math.min(255, 15 + Math.round((1 - rNorm) * 40));
    g = Math.min(255, 23 + Math.round((1 - rNorm) * 50));
    b = Math.min(255, 42 + Math.round((1 - rNorm) * 90));

    // Cross scissor emblem lines
    const onDiag1 = Math.abs(dx - dy) < w * 0.025 && Math.abs(dx) < w * 0.22 && Math.abs(dy) < w * 0.22;
    const onDiag2 = Math.abs(dx + dy) < w * 0.025 && Math.abs(dx) < w * 0.22 && Math.abs(dy) < w * 0.22;
    if (onDiag1 || onDiag2) {
      return [251, 191, 36, 255]; // Bright Gold
    }

    // Central circular gem
    if (dist < w * 0.07) {
      return [245, 158, 11, 255];
    }
  }

  return [r, g, b, a];
}

function staffIconShader(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background deep charcoal
  let r = 9;
  let g = 13;
  let b = 22;
  let a = 255;

  // Cyan diamond border
  const manhattan = (Math.abs(dx) + Math.abs(dy)) / (w / 2);
  if (Math.abs(manhattan - 0.72) < 0.04) {
    return [56, 189, 248, 255]; // Sky Blue
  }

  // Inner tactical crest
  if (manhattan < 0.68) {
    // Crosshair lines
    const onH = Math.abs(dy) < w * 0.02 && Math.abs(dx) < w * 0.22;
    const onV = Math.abs(dx) < w * 0.02 && Math.abs(dy) < w * 0.22;
    if (onH || onV) {
      return [56, 189, 248, 255];
    }
    if (dist < w * 0.08) {
      return [245, 158, 11, 255]; // Amber center
    }
  }

  return [r, g, b, a];
}

function splashShader(isStaff) {
  return function (x, y, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let r = isStaff ? 9 : 15;
    let g = isStaff ? 13 : 23;
    let b = isStaff ? 22 : 42;

    // Center subtle glow
    const glow = Math.max(0, 1 - dist / (w * 0.6));
    if (isStaff) {
      r += Math.round(glow * 20);
      g += Math.round(glow * 45);
      b += Math.round(glow * 60);
    } else {
      r += Math.round(glow * 50);
      g += Math.round(glow * 35);
      b += Math.round(glow * 15);
    }

    // Emblem in center of splash
    if (dist < w * 0.18) {
      const ring = Math.abs(dist - w * 0.16);
      if (ring < w * 0.015) {
        return isStaff ? [56, 189, 248, 255] : [245, 158, 11, 255];
      }
      const onDiag1 = Math.abs(dx - dy) < w * 0.02 && dist < w * 0.12;
      const onDiag2 = Math.abs(dx + dy) < w * 0.02 && dist < w * 0.12;
      if (onDiag1 || onDiag2) {
        return isStaff ? [56, 189, 248, 255] : [251, 191, 36, 255];
      }
    }

    return [Math.min(255, r), Math.min(255, g), Math.min(255, b), 255];
  };
}

// Targets to generate
const targets = [
  {
    dir: path.resolve(__dirname, '../apps/customer/assets'),
    isStaff: false
  },
  {
    dir: path.resolve(__dirname, '../apps/staff/assets'),
    isStaff: true
  }
];

for (const target of targets) {
  if (!fs.existsSync(target.dir)) {
    fs.mkdirSync(target.dir, { recursive: true });
  }

  const shader = target.isStaff ? staffIconShader : customerIconShader;

  console.log(`Generating assets in ${target.dir}...`);

  // 1. icon.png (512x512)
  const icon = createPng(512, 512, shader);
  fs.writeFileSync(path.join(target.dir, 'icon.png'), icon);

  // 2. adaptive-icon.png (512x512)
  const adaptiveIcon = createPng(512, 512, shader);
  fs.writeFileSync(path.join(target.dir, 'adaptive-icon.png'), adaptiveIcon);

  // 3. splash.png (600x1000)
  const splash = createPng(600, 1000, splashShader(target.isStaff));
  fs.writeFileSync(path.join(target.dir, 'splash.png'), splash);

  // 4. favicon.png (48x48)
  const favicon = createPng(48, 48, shader);
  fs.writeFileSync(path.join(target.dir, 'favicon.png'), favicon);

  console.log(`✓ All assets created successfully for ${target.isStaff ? 'Staff' : 'Customer'} App.`);
}
