const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(__dirname, "..", "icons");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writePng(filePath, width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  fs.writeFileSync(
    filePath,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0))
    ])
  );
}

function scale(size, value) {
  return (size * value) / 128;
}

function roundedRectCoverage(x, y, rect, radius) {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;

  if (x < left || x > right || y < top || y > bottom) {
    return 0;
  }

  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 ? 1 : 0;
}

function circleStrokeCoverage(x, y, cx, cy, radius, width) {
  const distance = Math.hypot(x - cx, y - cy);
  return Math.abs(distance - radius) <= width / 2 ? 1 : 0;
}

function arcStrokeCoverage(x, y, cx, cy, radius, width, startAngle, endAngle) {
  if (!circleStrokeCoverage(x, y, cx, cy, radius, width)) {
    return 0;
  }

  const full = Math.PI * 2;
  const angle = (Math.atan2(y - cy, x - cx) + full) % full;
  const start = (startAngle + full) % full;
  const end = (endAngle + full) % full;

  if (start <= end) {
    return angle >= start && angle <= end ? 1 : 0;
  }

  return angle >= start || angle <= end ? 1 : 0;
}

function circleCoverage(x, y, cx, cy, radius) {
  return Math.hypot(x - cx, y - cy) <= radius ? 1 : 0;
}

function polygonCoverage(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside ? 1 : 0;
}

function lineCoverage(x, y, x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py) <= width / 2 ? 1 : 0;
}

function blend(pixel, color, alpha) {
  const sourceAlpha = (color[3] / 255) * alpha;
  const destAlpha = pixel[3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);

  if (outAlpha === 0) {
    return [0, 0, 0, 0];
  }

  return [
    Math.round((color[0] * sourceAlpha + pixel[0] * destAlpha * (1 - sourceAlpha)) / outAlpha),
    Math.round((color[1] * sourceAlpha + pixel[1] * destAlpha * (1 - sourceAlpha)) / outAlpha),
    Math.round((color[2] * sourceAlpha + pixel[2] * destAlpha * (1 - sourceAlpha)) / outAlpha),
    Math.round(outAlpha * 255)
  ];
}

function drawShape(buffer, size, color, coverageFn) {
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      for (const [offsetX, offsetY] of samples) {
        coverage += coverageFn(x + offsetX, y + offsetY);
      }
      coverage /= samples.length;

      if (coverage === 0) {
        continue;
      }

      const index = (y * size + x) * 4;
      const blended = blend(
        [buffer[index], buffer[index + 1], buffer[index + 2], buffer[index + 3]],
        color,
        coverage
      );
      buffer[index] = blended[0];
      buffer[index + 1] = blended[1];
      buffer[index + 2] = blended[2];
      buffer[index + 3] = blended[3];
    }
  }
}

function rect(size, x, y, w, h) {
  return {
    x: scale(size, x),
    y: scale(size, y),
    w: scale(size, w),
    h: scale(size, h)
  };
}

function makeIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);
  const radius = scale(size, 12);
  const center = scale(size, 64);

  drawShape(buffer, size, [248, 250, 252, 255], (x, y) =>
    circleCoverage(x, y, center, center, scale(size, 56))
  );
  drawShape(buffer, size, [13, 148, 136, 255], (x, y) =>
    arcStrokeCoverage(x, y, center, center, scale(size, 49), scale(size, 10), 0.35, 5.65)
  );
  drawShape(buffer, size, [15, 118, 110, 255], (x, y) =>
    polygonCoverage(x, y, [
      [scale(size, 102), scale(size, 26)],
      [scale(size, 118), scale(size, 32)],
      [scale(size, 106), scale(size, 44)]
    ])
  );
  drawShape(buffer, size, [51, 65, 85, 115], (x, y) =>
    circleStrokeCoverage(x, y, center, center, scale(size, 55), Math.max(1, scale(size, 2)))
  );

  const cards = [
    [rect(size, 38, 37, 52, 34), [37, 99, 235, 255]],
    [rect(size, 43, 48, 52, 34), [20, 184, 166, 255]],
    [rect(size, 34, 59, 52, 34), [255, 255, 255, 255]]
  ];

  for (const [shape, color] of cards.slice(0, 2)) {
    drawShape(buffer, size, color, (x, y) => roundedRectCoverage(x, y, shape, radius));
  }

  const frontCard = cards[2][0];
  drawShape(buffer, size, [15, 23, 42, 70], (x, y) =>
    roundedRectCoverage(x, y, rect(size, 37, 62, 52, 34), radius)
  );
  drawShape(buffer, size, cards[2][1], (x, y) =>
    roundedRectCoverage(x, y, frontCard, radius)
  );
  drawShape(buffer, size, [15, 23, 42, 255], (x, y) =>
    lineCoverage(x, y, scale(size, 45), scale(size, 70), scale(size, 75), scale(size, 70), Math.max(1, scale(size, 4)))
  );
  drawShape(buffer, size, [15, 23, 42, 255], (x, y) =>
    lineCoverage(x, y, scale(size, 45), scale(size, 81), scale(size, 67), scale(size, 81), Math.max(1, scale(size, 4)))
  );

  drawShape(buffer, size, [251, 113, 133, 255], (x, y) =>
    circleCoverage(x, y, scale(size, 83), scale(size, 84), scale(size, 7))
  );
  drawShape(buffer, size, [15, 23, 42, 255], (x, y) =>
    circleCoverage(x, y, scale(size, 92), scale(size, 34), scale(size, 4))
  );
  drawShape(buffer, size, [15, 23, 42, 255], (x, y) =>
    circleCoverage(x, y, scale(size, 34), scale(size, 42), scale(size, 4))
  );
  drawShape(buffer, size, [15, 23, 42, 255], (x, y) =>
    circleCoverage(x, y, scale(size, 35), scale(size, 94), scale(size, 4))
  );

  return buffer;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writePng(path.join(OUT_DIR, `icon-${size}.png`), size, size, makeIcon(size));
}
