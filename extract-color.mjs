// 로고 PNG에서 대표 파란색(가장 진한/선명한 파랑)을 추출한다.
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const path = process.argv[2];
const buf = await readFile(path);
const png = PNG.sync.read(buf);

let r = 0, g = 0, b = 0, n = 0;
for (let i = 0; i < png.data.length; i += 4) {
  const R = png.data[i], G = png.data[i + 1], B = png.data[i + 2], A = png.data[i + 3];
  if (A < 128) continue;                 // 투명 제외
  if (B <= G || B <= R) continue;         // 파랑 우세 픽셀만
  if (R > 200 && G > 200 && B > 200) continue; // 흰색 제외
  r += R; g += G; b += B; n++;
}
if (!n) { console.log("파랑 픽셀 없음"); process.exit(1); }
const hex = (x) => Math.round(x / n).toString(16).padStart(2, "0");
console.log(`BLUE=#${hex(r)}${hex(g)}${hex(b)}  (샘플 ${n}px)`);
