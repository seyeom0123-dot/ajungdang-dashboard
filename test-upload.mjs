// 로컬 서버의 양식 다운로드 + 엑셀 업로드 왕복 테스트.
const BASE = "http://localhost:3000";

const before = await (await fetch(`${BASE}/api/deals`)).json();
console.log("업로드 전 건수:", before.deals.length);

// 1) 양식(엑셀) 다운로드
const tpl = await fetch(`${BASE}/api/template`);
const buf = Buffer.from(await tpl.arrayBuffer());
console.log("양식 다운로드:", tpl.status, `${buf.length}B`, tpl.headers.get("content-type"));

// 2) 그 양식을 그대로 업로드 (예시행 3건 포함)
const fd = new FormData();
fd.append("file", new Blob([buf]), "template.xlsx");
const up = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd });
const upJson = await up.json();
console.log("업로드 결과:", up.status, JSON.stringify(upJson));

const after = await (await fetch(`${BASE}/api/deals`)).json();
console.log("업로드 후 건수:", after.deals.length, "(증가", after.deals.length - before.deals.length, ")");
