// Render에 배포되는 Node 서버.
// - public/ 정적 파일(대시보드 앱)을 서빙
// - GET  /api/deals     거래 데이터 조회 (Supabase 또는 더미 폴백)
// - POST /api/upload    엑셀 파일 업로드 → 여러 거래 일괄 추가
// - GET  /api/template  입력용 엑셀 양식 다운로드

import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { generateDeals } from "./dummy.js";

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
  // Supabase는 한 요청당 최대 1000행만 반환하므로 페이지로 나눠 전부 가져온다.
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("deals")
      .select("*")
      .order("deal_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return res.status(500).json({ error: error.message });
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  res.json({ source: "supabase", deals: all });
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

// 엑셀 셀 → 거래일 문자열(YYYY-MM-DD). 날짜 셀(Date)·문자열 모두 처리.
function toDateStr(v) {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v || "").trim().replace(/[./]/g, "-");
  const mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return mm ? `${mm[1]}-${mm[2].padStart(2, "0")}-${mm[3].padStart(2, "0")}` : s;
}

// 엑셀 한 행(머리글 키) → 정규화된 거래 or 오류문자열
function normalizeRow(r) {
  return validateDeal({
    deal_date: toDateStr(r["거래일"]),
    business_unit: String(r["사업부"] || "").trim(),
    revenue: r["매출"],
    cost: r["비용"],
    status: String(r["수금상태"] || "완료").trim(),
    region: r["지역"],
  });
}

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "파일이 없습니다." });
  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("시트를 찾을 수 없습니다.");
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch (e) {
    return res.status(400).json({ error: "엑셀을 읽지 못했습니다: " + e.message });
  }

  const deals = [], errors = [];
  rows.forEach((r, i) => {
    const d = normalizeRow(r);
    if (typeof d === "string") errors.push(`${i + 2}행: ${d}`);
    else deals.push(d);
  });
  if (!deals.length) {
    return res.status(400).json({ error: "유효한 행이 없습니다. 머리글(거래일·사업부·매출·비용·수금상태·지역)과 값을 확인하세요.", errors: errors.slice(0, 5) });
  }

  if (!supabase) {
    fallback.push(...deals);
    fallback.sort((a, b) => (a.deal_date < b.deal_date ? -1 : 1));
    return res.json({ source: "dummy", inserted: deals.length, skipped: errors.length, errors: errors.slice(0, 5) });
  }
  const CHUNK = 500;
  for (let i = 0; i < deals.length; i += CHUNK) {
    const { error } = await supabase.from("deals").insert(deals.slice(i, i + CHUNK));
    if (error) return res.status(500).json({ error: error.message });
  }
  res.json({ source: "supabase", inserted: deals.length, skipped: errors.length, errors: errors.slice(0, 5) });
});

app.get("/api/template", (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["거래일", "사업부", "매출", "비용", "수금상태", "지역"],
    ["2026-01-15", "이사", 800000, 500000, "완료", "서울"],
    ["2026-02-03", "청소", 150000, 90000, "미수", "경기"],
    ["2026-03-10", "부동산", 1200000, 300000, "완료", "인천"],
  ]);
  ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "거래");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=ajungdang-template.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

app.listen(port, () => {
  console.log(`서버 실행 중: http://localhost:${port}`);
  console.log(supabase ? "데이터 소스: Supabase" : "데이터 소스: 더미(폴백)");
});
