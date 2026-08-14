// 자체완결형 배포 HTML을 만든다: 차트 라이브러리 + 더미데이터 + 앱 로직을 한 파일에 인라인.
// 실행: node build-artifact.mjs  →  dist-artifact.html 생성
import { readFile, writeFile } from "node:fs/promises";
import { generateDeals } from "./dummy.js";

const css = await readFile("public/style.css", "utf8");
const html = await readFile("public/index.html", "utf8");
const chartjs = await readFile("node_modules/chart.js/dist/chart.umd.js", "utf8");
const app = await readFile("artifact-app.js", "utf8");

const mainMatch = html.match(/<main[\s\S]*<\/main>/);
if (!mainMatch) throw new Error("index.html에서 <main>을 찾지 못함");
const main = mainMatch[0];

const deals = generateDeals(2026, 1);
const safe = (s) => s.replace(/<\/script/gi, "<\\/script"); // 인라인 스크립트 조기 종료 방지

const out = `<title>아정당 재무 대시보드</title>
<style>${css}</style>
${main}
<script>${safe(chartjs)}</script>
<script>window.__DEALS__ = ${safe(JSON.stringify(deals))};</script>
<script>${safe(app)}</script>
`;

await writeFile("dist-artifact.html", out);
console.log(`dist-artifact.html 생성 완료 — 거래 ${deals.length}건, 크기 ${(out.length / 1024).toFixed(0)}KB`);
