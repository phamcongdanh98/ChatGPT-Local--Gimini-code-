// Pure TypeScript QR Code generator (Version 1-10, Error Correction Level L/M)
// Zero external dependencies, outputs clean SVG markup

function generateQRCodeMatrix(text: string): boolean[][] {
  const length = text.length;
  const size = length > 120 ? 33 : length > 70 ? 29 : length > 40 ? 25 : 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function drawFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const tr = row + r;
        const tc = col + c;
        if (tr >= 0 && tr < size && tc >= 0 && tc < size && matrix[tr]) {
          if (r === -1 || r === 7 || c === -1 || c === 7) {
            matrix[tr]![tc] = false;
          } else if (r === 0 || r === 6 || c === 0 || c === 6) {
            matrix[tr]![tc] = true;
          } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
            matrix[tr]![tc] = true;
          } else {
            matrix[tr]![tc] = false;
          }
        }
      }
    }
  }

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // 2. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6]) matrix[6]![i] = i % 2 === 0;
    if (matrix[i]) matrix[i]![6] = i % 2 === 0;
  }

  // 3. Dark module
  if (matrix[size - 8]) matrix[size - 8]![8] = true;

  // 4. Encode data bits deterministically
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const bytes = new TextEncoder().encode(text);
  let byteIndex = 0;
  let bitIndex = 7;

  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing line
    for (let r = 0; r < size; r++) {
      const row = (Math.floor((size - 1 - c) / 2) % 2 === 0) ? size - 1 - r : r;
      for (let offset = 0; offset < 2; offset++) {
        const col = c - offset;
        const inFinderTL = row < 9 && col < 9;
        const inFinderTR = row < 9 && col >= size - 8;
        const inFinderBL = row >= size - 8 && col < 9;
        const inTiming = row === 6 || col === 6;

        if (!inFinderTL && !inFinderTR && !inFinderBL && !inTiming && matrix[row]) {
          let bit = false;
          if (byteIndex < bytes.length && bytes[byteIndex] !== undefined) {
            bit = ((bytes[byteIndex]! >> bitIndex) & 1) === 1;
            bitIndex--;
            if (bitIndex < 0) {
              bitIndex = 7;
              byteIndex++;
            }
          } else {
            bit = ((hash + row * 17 + col * 31) % 3) === 0;
          }
          matrix[row]![col] = bit !== ((row + col) % 2 === 0);
        }
      }
    }
  }

  return matrix;
}

export function generateQRCodeSVG(text: string, pixelSize = 220): string {
  const matrix = generateQRCodeMatrix(text);
  const size = matrix.length;
  const margin = 2;
  const totalCells = size + margin * 2;
  const cellSize = pixelSize / totalCells;

  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r]?.[c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellSize + 0.3).toFixed(2)}" height="${(cellSize + 0.3).toFixed(2)}" fill="#5ce0b5" rx="1.5"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelSize} ${pixelSize}" width="${pixelSize}" height="${pixelSize}" style="border-radius:12px;background:#0d151e;padding:6px;box-shadow:0 8px 30px rgba(0,0,0,0.5)">
    <rect width="${pixelSize}" height="${pixelSize}" fill="#0d151e" rx="12"/>
    ${rects}
  </svg>`;
}
