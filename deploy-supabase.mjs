// Supabase Management API로 프로젝트 생성 → 표 생성 → 키 확보 → .env 기록.
// 토큰은 환경변수 SB_TOKEN 으로만 받는다(파일로 저장하지 않음).
import { writeFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const TOKEN = process.env.SB_TOKEN;
if (!TOKEN) { console.error("SB_TOKEN 환경변수가 없습니다."); process.exit(1); }
const API = "https://api.supabase.com/v1";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  return json;
}

// 1) 조직 확인
const orgs = await api("GET", "/organizations");
if (!orgs.length) throw new Error("조직이 없습니다. Supabase에 조직을 먼저 만들어주세요.");
const org = orgs[0];
console.log(`조직: ${org.name} (${org.id})`);

// 2) 기존 프로젝트 재사용 or 신규 생성
const projects = await api("GET", "/projects");
let proj = projects.find((p) => p.name === "ajungdang");
if (proj) {
  console.log(`기존 프로젝트 재사용: ${proj.name} (${proj.id})`);
} else {
  const db_pass = randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) + "aA1!";
  console.log("프로젝트 생성 중… (1~2분)");
  proj = await api("POST", "/projects", {
    name: "ajungdang",
    organization_id: org.id,
    region: "ap-northeast-2",
    db_pass,
    plan: "free",
  });
  console.log(`생성 요청됨: ${proj.id}`);
}
const ref = proj.id;

// 3) ACTIVE_HEALTHY 대기
for (let i = 0; i < 40; i++) {
  const p = await api("GET", `/projects/${ref}`);
  console.log(`  상태: ${p.status}`);
  if (p.status === "ACTIVE_HEALTHY") break;
  await sleep(6000);
}

// 4) service_role 키 확보
let serviceKey;
try {
  const keys = await api("GET", `/projects/${ref}/api-keys?reveal=true`);
  const sr = Array.isArray(keys) ? keys.find((k) => k.name === "service_role") : null;
  serviceKey = sr?.api_key;
} catch (e) { console.log("api-keys 조회 경고:", e.message); }
if (!serviceKey) throw new Error("service_role 키를 얻지 못했습니다.");

const url = `https://${ref}.supabase.co`;

// 5) 스키마 실행 (query 엔드포인트, DB 준비까지 재시도)
const schema = await readFile("db/schema.sql", "utf8");
for (let i = 0; i < 10; i++) {
  try {
    await api("POST", `/projects/${ref}/database/query`, { query: schema });
    console.log("스키마 적용 완료");
    break;
  } catch (e) {
    if (i === 9) throw e;
    console.log("  DB 준비 대기 중…");
    await sleep(6000);
  }
}

// 6) .env 기록 (service key는 화면에 출력하지 않음)
await writeFile(".env", `SUPABASE_URL=${url}\nSUPABASE_SERVICE_KEY=${serviceKey}\n`);
console.log(`완료. URL=${url}  (service key는 .env에 저장됨)`);
console.log(`REF=${ref}`);
