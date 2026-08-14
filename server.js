// Render에 배포되는 Node 서버.
// - public/ 정적 파일(대시보드 앱)을 서빙
// - GET  /api/deals  거래 데이터 조회 (Supabase 또는 더미 폴백)
// - POST /api/deals  입력 폼에서 거래 1건 추가

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { generateDeals } from "./dummy.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const supabase = url && key ? createClient(url, key) : null;

// ponytail: Supabase 미설정 시 시작 시점에 한 번만 더미 생성해 메모리에 보관.
// 폴백 모드에서도 입력 폼이 동작하도록 이 배열에 push 한다(서버 재시작 시 초기화됨).
const fallback = supabase ? null : generateDeals();

const UNITS = ["이사", "청소", "부동산"];

// 입력값 검증 (신뢰 경계). 통과하면 정규화된 거래 객체를 반환, 실패하면 문자열(오류) 반환.
function validateDeal(body) {
  const { deal_date, business_unit, revenue, cost, status, region } = body || {};
  if (!deal_date || !/^\d{4}-\d{2}-\d{2}$/.test(deal_date)) return "거래일(YYYY-MM-DD)이 올바르지 않습니다.";
  if (!UNITS.includes(business_unit)) return "사업부는 이사/청소/부동산 중 하나여야 합니다.";
  const rev = Number(revenue);
  const cst = Number(cost);
  if (!Number.isFinite(rev) || rev < 0) return "매출 금액이 올바르지 않습니다.";
  if (!Number.isFinite(cst) || cst < 0) return "비용 금액이 올바르지 않습니다.";
  const st = status === "미수" ? "미수" : "완료";
  return {
    deal_date,
    business_unit,
    revenue: Math.round(rev),
    cost: Math.round(cst),
    status: st,
    paid_date: st === "완료" ? deal_date : null,
    region: (region || "").toString().slice(0, 20) || null,
  };
}

app.get("/api/deals", async (req, res) => {
  if (!supabase) {
    return res.json({ source: "dummy", deals: fallback });
  }
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .order("deal_date", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ source: "supabase", deals: data });
});

app.post("/api/deals", async (req, res) => {
  const deal = validateDeal(req.body);
  if (typeof deal === "string") return res.status(400).json({ error: deal });

  if (!supabase) {
    fallback.push(deal);
    fallback.sort((a, b) => (a.deal_date < b.deal_date ? -1 : 1));
    return res.status(201).json({ source: "dummy", deal });
  }
  const { data, error } = await supabase.from("deals").insert(deal).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ source: "supabase", deal: data });
});

app.listen(port, () => {
  console.log(`서버 실행 중: http://localhost:${port}`);
  console.log(supabase ? "데이터 소스: Supabase" : "데이터 소스: 더미(폴백)");
});
