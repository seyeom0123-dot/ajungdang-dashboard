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
const state = { fromMonth: 1, toMonth: 12, unit: "" };
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
// 거래일(YYYY-MM-DD)의 월(1~12)이 [fromMonth, toMonth] 범위에 드는 거래만.
function filtered() {
  const lo = Math.min(state.fromMonth, state.toMonth);
  const hi = Math.max(state.fromMonth, state.toMonth);
  return ALL.filter((d) => {
    if (state.unit && d.business_unit !== state.unit) return false;
    const m = Number(d.deal_date.slice(5, 7));
    return m >= lo && m <= hi;
  });
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
  const deals = filtered();
  const agg = aggregate(deals);
  renderKPIs(agg.totals);
  renderMonthlyChart(agg.months);
  renderShareChart(agg.unitRevenue);
  renderStackedChart(agg.months);
  renderCollectionChart(agg.unitAgg);
  renderTable(agg.unitAgg);
}

function renderKPIs(t) {
  const profit = t.revenue - t.cost;
  const margin = t.revenue ? (profit / t.revenue) * 100 : 0;
  const avg = t.count ? t.revenue / t.count : 0;
  const recRate = t.revenue ? (t.receivable / t.revenue) * 100 : 0;
  const cards = [
    { label: "총매출", value: wonShort(t.revenue), sub: `${t.count.toLocaleString("ko-KR")}건` },
    { label: "총비용", value: wonShort(t.cost), sub: `매출 대비 ${pct(t.revenue ? (t.cost / t.revenue) * 100 : 0)}` },
    { label: "순이익", value: wonShort(profit), sub: `이익률 ${pct(margin)}`, cls: profit >= 0 ? "good" : "bad" },
    { label: "총 건수", value: t.count.toLocaleString("ko-KR") + "건", sub: "필터 기준" },
    { label: "평균 객단가", value: wonShort(avg), sub: "건당 평균 매출" },
    { label: "미수금", value: wonShort(t.receivable), sub: `${t.receivableCount}건 · 매출의 ${pct(recRate)}`, cls: "bad" },
  ];
  document.getElementById("kpi-grid").innerHTML = cards
    .map(
      (c) => `<div class="kpi"><p class="label">${c.label}</p>
        <div class="value">${c.value}</div>
        <div class="sub ${c.cls || ""}">${c.sub}</div></div>`
    )
    .join("");
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
        { label: "비용", data: cost, backgroundColor: COLOR.cost, borderRadius: 4, order: 2 },
        {
          label: "순이익", data: profit, type: "line", borderColor: COLOR.profit,
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

function renderTable(unitAgg) {
  const tbody = document.querySelector("#summary-table tbody");
  const units = UNIT_ORDER.filter((u) => unitAgg[u]);
  const sum = { revenue: 0, cost: 0, count: 0, receivable: 0 };
  const rows = units.map((u) => {
    const a = unitAgg[u];
    sum.revenue += a.revenue; sum.cost += a.cost; sum.count += a.count; sum.receivable += a.receivable;
    return rowHtml(`<span class="unit-dot" style="background:${COLOR[u]}"></span>${u}`, a);
  });
  rows.push(rowHtml("합계", sum));
  tbody.innerHTML = rows.join("");
}
function rowHtml(name, a) {
  const profit = a.revenue - a.cost;
  const margin = a.revenue ? (profit / a.revenue) * 100 : 0;
  const avg = a.count ? a.revenue / a.count : 0;
  return `<tr>
    <td>${name}</td>
    <td>${wonShort(a.revenue)}</td>
    <td>${wonShort(a.cost)}</td>
    <td>${wonShort(profit)}</td>
    <td>${pct(margin)}</td>
    <td>${a.count.toLocaleString("ko-KR")}</td>
    <td>${wonShort(avg)}</td>
    <td>${wonShort(a.receivable)}</td>
  </tr>`;
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

  document.querySelectorAll("#unit-filter button").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.unit = btn.dataset.unit;
      setActive("#unit-filter", btn);
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
