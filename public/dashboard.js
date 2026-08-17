// 아정당 재무 대시보드 — 데이터 조회 · 집계 · 차트 · 입력 폼
"use strict";

const UNIT_ORDER = ["이사", "청소", "부동산"];

// CSS 토큰에서 실제 색상 값을 읽어온다(다크모드 자동 반영).
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COLOR = {
  이사: css("--unit-이사"),
  청소: css("--unit-청소"),
  부동산: css("--unit-부동산"),
  accent: css("--accent"),
  cost: css("--cost"),
  profit: css("--profit"),
  unpaid: css("--unpaid"),
  good: css("--good"),
  critical: css("--critical"),
  muted: css("--muted"),
  grid: css("--grid"),
  surface: css("--surface"),
  text2: css("--text-secondary"),
};

// ── 포맷 helpers ──────────────────────────────────────────────
const wonFull = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
function wonShort(n) {
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1) + "억";
  if (a >= 1e4) return Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
  return Math.round(n).toLocaleString("ko-KR");
}
const pct = (x) => (isFinite(x) ? x.toFixed(1) : "0.0") + "%";

// ── 상태 ─────────────────────────────────────────────────────
let ALL = [];
const state = { fromMonth: 1, toMonth: 12, page: "전체", deptMode: "월별" };
const charts = {};

// ── 데이터 로드 ───────────────────────────────────────────────
async function loadData() {
  const res = await fetch("/api/deals");
  const json = await res.json();
  ALL = json.deals || [];
  const badge = document.getElementById("source-badge");
  badge.textContent =
    (json.source === "supabase" ? "Supabase 연결됨" : "더미 데이터(미리보기)") +
    ` · ${ALL.length.toLocaleString("ko-KR")}건`;
  render();
}

// ── 필터 ─────────────────────────────────────────────────────
// 거래일(YYYY-MM-DD)의 월(1~12)이 [fromMonth, toMonth] 범위에 드는지.
function inMonthRange(d) {
  const lo = Math.min(state.fromMonth, state.toMonth);
  const hi = Math.max(state.fromMonth, state.toMonth);
  const m = Number(d.deal_date.slice(5, 7));
  return m >= lo && m <= hi;
}
function filtered() {
  return ALL.filter(inMonthRange);
}
// 특정 사업부의 (월 범위 내) 거래
function deptDeals(unit) {
  return ALL.filter((d) => d.business_unit === unit && inMonthRange(d)).sort((a, b) =>
    a.deal_date < b.deal_date ? -1 : 1
  );
}

// ── 집계 ─────────────────────────────────────────────────────
function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${y.slice(2)}.${Number(m)}월`;
}

function aggregate(deals) {
  const totals = { revenue: 0, cost: 0, count: 0, receivable: 0, receivableCount: 0 };
  const months = {};      // key -> {revenue, cost}
  const unitRevenue = {}; // unit -> revenue
  const unitAgg = {};     // unit -> {revenue, cost, count, receivable}

  for (const d of deals) {
    const rev = Number(d.revenue), cost = Number(d.cost);
    totals.revenue += rev;
    totals.cost += cost;
    totals.count += 1;
    if (d.status === "미수") {
      totals.receivable += rev;
      totals.receivableCount += 1;
    }
    const mk = monthKey(d.deal_date);
    (months[mk] ||= { revenue: 0, cost: 0, byUnit: {} });
    months[mk].revenue += rev;
    months[mk].cost += cost;
    months[mk].byUnit[d.business_unit] = (months[mk].byUnit[d.business_unit] || 0) + rev;

    unitRevenue[d.business_unit] = (unitRevenue[d.business_unit] || 0) + rev;
    (unitAgg[d.business_unit] ||= { revenue: 0, cost: 0, count: 0, receivable: 0 });
    unitAgg[d.business_unit].revenue += rev;
    unitAgg[d.business_unit].cost += cost;
    unitAgg[d.business_unit].count += 1;
    if (d.status === "미수") unitAgg[d.business_unit].receivable += rev;
  }
  return { totals, months, unitRevenue, unitAgg };
}

// ── 렌더 ─────────────────────────────────────────────────────
function render() {
  const isAll = state.page === "전체";
  document.getElementById("dashboard-view").hidden = !isAll;
  document.getElementById("dept-view").hidden = isAll;
  document.getElementById("page-title").textContent = isAll
    ? "이사 · 청소 · 부동산 재무 현황"
    : `${state.page} 재무 상세`;

  if (isAll) {
    const agg = aggregate(filtered());
    renderShareChart(agg.unitRevenue);
    renderShareTable(agg.unitRevenue);
    renderStackedChart(agg.months);
    renderStackedTable(agg.months);
    renderMonthlyChart(agg.months);
    renderMonthlyTable(agg.months);
    renderCollectionChart(agg.unitAgg);
    renderCollectionTable(agg.unitAgg);
  } else {
    renderDeptView(state.page);
  }
}

function sortedMonths(months) {
  return Object.keys(months).sort();
}

// Chart.js 공통 옵션
function baseScales(stacked = false) {
  return {
    x: { stacked, grid: { display: false }, ticks: { color: COLOR.text2 } },
    y: {
      stacked,
      grid: { color: COLOR.grid },
      ticks: { color: COLOR.text2, callback: (v) => wonShort(v) },
    },
  };
}
function moneyTooltip() {
  return {
    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${wonFull(ctx.parsed.y ?? ctx.parsed)}` },
  };
}

function renderMonthlyChart(months) {
  const keys = sortedMonths(months);
  const labels = keys.map(monthLabel);
  const revenue = keys.map((k) => months[k].revenue);
  const cost = keys.map((k) => months[k].cost);
  const profit = keys.map((k) => months[k].revenue - months[k].cost);
  draw("chart-monthly", {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "매출", data: revenue, backgroundColor: COLOR.accent, borderRadius: 4, order: 2 },
        { label: "영업비용", data: cost, backgroundColor: COLOR.cost, borderRadius: 4, order: 2 },
        {
          label: "영업이익", data: profit, type: "line", borderColor: COLOR.profit,
          backgroundColor: COLOR.profit, borderWidth: 2, tension: 0.3, pointRadius: 3, order: 1,
        },
      ],
    },
    options: {
      scales: baseScales(false),
      plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: moneyTooltip() },
    },
  });
}

function renderShareChart(unitRevenue) {
  const units = UNIT_ORDER.filter((u) => unitRevenue[u]);
  const data = units.map((u) => unitRevenue[u]);
  const total = data.reduce((a, b) => a + b, 0) || 1;
  draw("chart-share", {
    type: "doughnut",
    data: {
      labels: units,
      datasets: [
        {
          data,
          backgroundColor: units.map((u) => COLOR[u]),
          borderColor: COLOR.surface,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { color: COLOR.text2 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${wonFull(ctx.parsed)} (${pct((ctx.parsed / total) * 100)})`,
          },
        },
      },
    },
  });
}

function renderStackedChart(months) {
  const keys = sortedMonths(months);
  const labels = keys.map(monthLabel);
  const units = UNIT_ORDER.filter((u) => keys.some((k) => months[k].byUnit[u]));
  const datasets = units.map((u) => ({
    label: u,
    data: keys.map((k) => months[k].byUnit[u] || 0),
    backgroundColor: COLOR[u],
    borderColor: COLOR.surface,
    borderWidth: 2,
    borderRadius: 3,
  }));
  draw("chart-stacked", {
    type: "bar",
    data: { labels, datasets },
    options: {
      scales: baseScales(true),
      plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: moneyTooltip() },
    },
  });
}

function renderCollectionChart(unitAgg) {
  const units = UNIT_ORDER.filter((u) => unitAgg[u]);
  const done = units.map((u) => unitAgg[u].revenue - unitAgg[u].receivable);
  const rec = units.map((u) => unitAgg[u].receivable);
  draw("chart-collection", {
    type: "bar",
    data: {
      labels: units,
      datasets: [
        { label: "수금완료", data: done, backgroundColor: COLOR.accent, borderColor: COLOR.surface, borderWidth: 2, borderRadius: 3 },
        { label: "미수", data: rec, backgroundColor: COLOR.unpaid, borderColor: COLOR.surface, borderWidth: 2, borderRadius: 3 },
      ],
    },
    options: {
      scales: baseScales(true),
      plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: moneyTooltip() },
    },
  });
}

// ── 차트별 설명 표 ────────────────────────────────────────────
const mLabel = (key) => `${Number(key.slice(5, 7))}월`;
const dot = (u) => `<span class="unit-dot" style="background:${COLOR[u]}"></span>${u}`;
function tableHTML(headers, rows) {
  const head = headers.map((h, i) => `<th${i === 0 ? ' class="lead"' : ""}>${h}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="lead"' : ""}>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// 사업부별 매출 비중
function renderShareTable(unitRevenue) {
  const units = UNIT_ORDER.filter((u) => unitRevenue[u]);
  const total = units.reduce((s, u) => s + unitRevenue[u], 0) || 1;
  const rows = units.map((u) => [dot(u), wonShort(unitRevenue[u]), pct((unitRevenue[u] / total) * 100)]);
  rows.push(["합계", wonShort(total), "100.0%"]);
  document.getElementById("tbl-share").innerHTML = tableHTML(["사업부", "매출", "비중"], rows);
}

// 월별 사업부별 매출
function renderStackedTable(months) {
  const keys = sortedMonths(months);
  const sums = { 이사: 0, 청소: 0, 부동산: 0 };
  const rows = keys.map((k) => {
    const bu = months[k].byUnit;
    let tot = 0;
    const cells = UNIT_ORDER.map((u) => { sums[u] += bu[u] || 0; tot += bu[u] || 0; return wonShort(bu[u] || 0); });
    return [mLabel(k), ...cells, wonShort(tot)];
  });
  const grand = UNIT_ORDER.reduce((s, u) => s + sums[u], 0);
  rows.push(["합계", ...UNIT_ORDER.map((u) => wonShort(sums[u])), wonShort(grand)]);
  document.getElementById("tbl-stacked").innerHTML = tableHTML(["월", "이사", "청소", "부동산", "합계"], rows);
}

// 월별 매출·비용·순이익
function renderMonthlyTable(months) {
  const keys = sortedMonths(months);
  let sr = 0, sc = 0;
  const rows = keys.map((k) => {
    const rev = months[k].revenue, cost = months[k].cost, pf = rev - cost;
    sr += rev; sc += cost;
    return [mLabel(k), wonShort(rev), wonShort(cost), wonShort(pf), pct(rev ? (pf / rev) * 100 : 0)];
  });
  const gpf = sr - sc;
  rows.push(["합계", wonShort(sr), wonShort(sc), wonShort(gpf), pct(sr ? (gpf / sr) * 100 : 0)]);
  document.getElementById("tbl-monthly").innerHTML = tableHTML(["월", "매출", "영업비용", "영업이익", "이익률"], rows);
}

// ── 사업부 상세 뷰 (월별/연간 매출·지출 + 누적 + 엑셀 양식 거래내역) ──
function renderDeptView(unit) {
  const deals = deptDeals(unit);

  // 1) 월별 매출·지출 상세 (누적 포함)
  const byMonth = {};
  for (const d of deals) {
    const k = monthKey(d.deal_date);
    (byMonth[k] ||= { rev: 0, cost: 0 });
    byMonth[k].rev += Number(d.revenue);
    byMonth[k].cost += Number(d.cost);
  }
  const keys = Object.keys(byMonth).sort();
  const isCum = state.deptMode === "누적";
  let cr = 0, cc = 0;
  const mrows = keys.map((k) => {
    cr += byMonth[k].rev; cc += byMonth[k].cost;
    const R = isCum ? cr : byMonth[k].rev;
    const C = isCum ? cc : byMonth[k].cost;
    return [mLabel(k), wonShort(R), wonShort(C), wonShort(R - C)];
  });
  mrows.push(["연간 합계", wonShort(cr), wonShort(cc), wonShort(cr - cc)]);
  const heads = isCum ? ["월", "누적 매출", "누적 지출", "누적 이익"] : ["월", "매출", "지출", "영업이익"];
  document.getElementById("dept-monthly-table").innerHTML = tableHTML(heads, mrows);

  // 2) 엑셀 양식 거래 내역
  document.getElementById("dept-count").textContent = `${deals.length.toLocaleString("ko-KR")}건`;
  let sRev = 0, sCost = 0;
  const body = deals
    .map((d) => {
      sRev += Number(d.revenue); sCost += Number(d.cost);
      const st = d.status === "미수"
        ? '<span class="st-unpaid">미수</span>'
        : '<span class="st-paid">완료</span>';
      return `<tr>
        <td class="lead">${d.deal_date}</td>
        <td class="lead">${d.business_unit}</td>
        <td>${Number(d.revenue).toLocaleString("ko-KR")}</td>
        <td>${Number(d.cost).toLocaleString("ko-KR")}</td>
        <td class="lead">${st}</td>
        <td class="lead">${d.region || ""}</td>
      </tr>`;
    })
    .join("");
  const totalRow = `<tr>
    <td class="lead">합계</td><td class="lead"></td>
    <td>${sRev.toLocaleString("ko-KR")}</td><td>${sCost.toLocaleString("ko-KR")}</td>
    <td class="lead"></td><td class="lead"></td></tr>`;
  const empty = `<tr><td class="lead" colspan="6" style="text-align:center;color:var(--muted)">해당 기간에 거래가 없습니다.</td></tr>`;
  document.getElementById("dept-table").innerHTML =
    `<table class="data-table"><thead><tr>
       <th class="lead">거래일</th><th class="lead">사업부</th><th>매출</th><th>비용</th>
       <th class="lead">수금상태</th><th class="lead">지역</th>
     </tr></thead><tbody>${deals.length ? body + totalRow : empty}</tbody></table>`;
}

// 사업부별 수금 현황
function renderCollectionTable(unitAgg) {
  const units = UNIT_ORDER.filter((u) => unitAgg[u]);
  let sd = 0, srec = 0;
  const rows = units.map((u) => {
    const a = unitAgg[u], done = a.revenue - a.receivable;
    sd += done; srec += a.receivable;
    return [dot(u), wonShort(done), wonShort(a.receivable), pct(a.revenue ? (a.receivable / a.revenue) * 100 : 0)];
  });
  const tot = sd + srec;
  rows.push(["합계", wonShort(sd), wonShort(srec), pct(tot ? (srec / tot) * 100 : 0)]);
  document.getElementById("tbl-collection").innerHTML = tableHTML(["사업부", "수금완료", "미수", "미수율"], rows);
}

// Chart 생성/재생성 (기존 인스턴스 파기)
function draw(id, config) {
  if (charts[id]) charts[id].destroy();
  config.options = config.options || {};
  config.options.responsive = true;
  config.options.maintainAspectRatio = false;
  charts[id] = new Chart(document.getElementById(id), config);
}

// ── 필터 ──────────────────────────────────────────────────────
function wireFilters() {
  const from = document.getElementById("from-month");
  const to = document.getElementById("to-month");
  const clamp = (v) => Math.min(12, Math.max(1, Math.round(Number(v) || 1)));
  const onMonth = () => {
    state.fromMonth = clamp(from.value);
    state.toMonth = clamp(to.value);
    render();
  };
  from.addEventListener("change", onMonth);
  to.addEventListener("change", onMonth);
  from.addEventListener("input", onMonth);
  to.addEventListener("input", onMonth);

  document.querySelectorAll("#page-menu button").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.page = btn.dataset.page;
      setActive("#page-menu", btn);
      render();
    })
  );

  document.querySelectorAll("#dept-mode button").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.deptMode = btn.dataset.mode;
      setActive("#dept-mode", btn);
      render();
    })
  );
}
function setActive(group, btn) {
  document.querySelectorAll(`${group} button`).forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}

// ── 엑셀 업로드 ───────────────────────────────────────────────
function wireUpload() {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("file-input");
  const msg = document.getElementById("upload-message");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fileInput.files.length) return;
    const data = new FormData();
    data.append("file", fileInput.files[0]);
    msg.textContent = "업로드 중…";
    msg.className = "entry-message";
    try {
      const res = await fetch("/api/upload", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "업로드 실패");
      let text = `${json.inserted.toLocaleString("ko-KR")}건 추가 완료`;
      if (json.skipped) text += ` · 건너뜀 ${json.skipped}건`;
      msg.textContent = text;
      msg.className = "entry-message ok";
      if (json.errors && json.errors.length) msg.textContent += ` (${json.errors[0]} 등)`;
      form.reset();
      await loadData();
    } catch (err) {
      msg.textContent = "오류: " + err.message;
      msg.className = "entry-message err";
    }
  });
}

// ── 시작 ─────────────────────────────────────────────────────
if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = COLOR.text2;
}
wireFilters();
wireUpload();
loadData();

// 서비스워커 등록(앱 설치 지원)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
