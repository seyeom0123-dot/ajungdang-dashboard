// 시그니처 로고(아이콘+아정당 글씨)에서 왼쪽 ㅇㅈㄷ 아이콘만 잘라 저장한다.
// 열별 불투명 비율을 보고 아이콘(꽉 찬 사각형) 다음의 빈 간격을 경계로 삼는다.
import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const src = PNG.sync.read(await readFile("public/logo.png"));
const { width: W, height: H } = src;
const alphaAt = (x, y) => src.data[(y * W + x) * 4 + 3];

// 열별 불투명 비율
const cov = [];
for (let x = 0; x < W; x++) {
  let n = 0;
  for (let y = 0; y < H; y++) if (alphaAt(x, y) > 128) n++;
  cov[x] = n / H;
}

// 아이콘은 x=0부터 높은 커버리지. 그 뒤 빈 간격(연속 낮은 열)의 시작을 경계로.
let inIcon = false, gapStart = W;
for (let x = 0; x < W; x++) {
  if (cov[x] > 0.35) inIcon = true;
  if (inIcon && cov[x] < 0.06) {
    // 이후 6px 이상 계속 비어 있으면 진짜 간격
    let empty = true;
    for (let k = x; k < Math.min(W, x + 8); k++) if (cov[k] > 0.06) { empty = false; break; }
    if (empty) { gapStart = x; break; }
  }
}
const right = Math.min(W, gapStart + 1);

// 아이콘 세로 경계(투명 여백 트림)
let top = H, bottom = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < right; x++)
    if (alphaAt(x, y) > 128) { if (y < top) top = y; if (y > bottom) bottom = y; }
const pad = 2;
top = Math.max(0, top - pad); bottom = Math.min(H - 1, bottom + pad);

const cw = right, ch = bottom - top + 1;
const out = new PNG({ width: cw, height: ch });
for (let y = 0; y < ch; y++)
  for (let x = 0; x < cw; x++) {
    const s = ((y + top) * W + x) * 4, d = (y * cw + x) * 4;
    out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1];
    out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = src.data[s + 3];
  }
await writeFile("public/logo-icon.png", PNG.sync.write(out));
console.log(`아이콘 크롭: ${cw}x${ch} (원본 ${W}x${H}, 경계 x=${right})`);
