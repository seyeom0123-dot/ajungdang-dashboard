// 더미 거래 데이터를 생성해 Supabase의 deals 테이블에 적재한다.
// 실행: npm run seed  (환경변수 SUPABASE_URL, SUPABASE_SERVICE_KEY 필요)

import { createClient } from "@supabase/supabase-js";
import { generateDeals } from "./dummy.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("환경변수 SUPABASE_URL, SUPABASE_SERVICE_KEY 를 설정하세요.");
  process.exit(1);
}

const supabase = createClient(url, key);

const deals = generateDeals(); // 2026-01 ~ 현재 달
console.log(`생성한 거래 건수: ${deals.length}`);

// 재실행 대비: 기존 데이터 전부 삭제 후 새로 적재.
const { error: delErr } = await supabase.from("deals").delete().gte("deal_date", "1900-01-01");
if (delErr) {
  console.error("기존 데이터 삭제 실패:", delErr.message);
  process.exit(1);
}

// Supabase는 한 번에 넣을 수 있는 행 수에 제한이 있어 500개씩 나눠 넣는다.
const CHUNK = 500;
for (let i = 0; i < deals.length; i += CHUNK) {
  const chunk = deals.slice(i, i + CHUNK);
  const { error } = await supabase.from("deals").insert(chunk);
  if (error) {
    console.error(`적재 실패 (${i}~):`, error.message);
    process.exit(1);
  }
  console.log(`적재 완료: ${Math.min(i + CHUNK, deals.length)} / ${deals.length}`);
}

console.log("완료! Supabase deals 테이블에 더미 데이터가 들어갔습니다.");
