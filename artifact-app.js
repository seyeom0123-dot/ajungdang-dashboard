// 아정당 재무 대시보드 — 자체완결형(배포용) 클라이언트.
// 데이터: 내장 더미(window.__DEALS__) + 브라우저 localStorage에 저장된 사용자 입력.
"use strict";

const UNIT_ORDER = ["이사", "청소", "부동산"];
const LS_KEY = "ajd_user_deals";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COLOR = {
  이사: css("--unit-이사"), 청소: css("--unit-청소"), 부동산: css("--unit-부동산"),
  accent: css("--accent"), good: css("--good"), critical: css("--critical"),
  muted: css("--muted"), grid: css("--grid"), surface: css("--surface"), text2: css("--text-secondary"),
};

const wonFull = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
function wonShort(n) {
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1) + "억";
  if (a >= 1e4) return Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
  return Math.round(n).toLocaleString("ko-KR");
}
const pct = (x) => (isFinite(x) ? x.toFixed(1) : "0.0") + "%";

let ALL = [];
const state = { period: 12, unit: "" };
const charts = {};

function readUser() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function writeUser(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}
function loadData() {
  const user = readUser();
  ALL = (window.__DEALS__ || []).concat(user).sort((a, b) => (a.deal_date < b.deal_date ? -1 : 1));
  document.getElementById("source-badge").textContent =
    `데모 · 브라우저 저장 · ${ALL.length.toLocaleString("ko-KR")}건` +
    (user.length ? ` (내가 추가 ${user.length})` : "");
  render();
}

function cutoffDate() {
  if (!state.period) return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - (state.period - 1), 1);
}
function filtered() {
  const cut = cutoffDate();
  return ALL.filter(
    (d) => (!state.unit || d.business_unit === state.unit) && (!cut || new Date(d.deal_date) >= cut)
  );
}

const monthKey = (s) => s.slice(0, 7);
function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${y.slice(2)}.${Number(m)}월`;
}

function aggregate(deals) {
  const totals = { revenue: 0, cost: 0, count: 0, receivable: 0, receivableCount: 0 };
  const months = {}, unitRevenue = {}, unitAgg = {};
  for (const d of deals) {
    const rev = Number(d.revenue), cost = Number(d.cost);
    totals.revenue += rev; totals.cost += cost; totals.count += 1;
    if (d.status === "미수") { totals.receivable += rev; totals.receivableCount += 1; }
    const mk = monthKey(d.deal_date);
    (months[mk] ||= { revenue: 0, cost: 0, byUnit: {} });
    months[mk].revenue += rev; months[mk].cost += cost;
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

function render() {
  const agg = aggregate(filtered());
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
    .map((c) => `<div class="kpi"><p class="label">${c.label}</p><div class="value">${c.value}</div><div class="sub ${c.cls || ""}">${c.sub}</div></div>`)
    .join("");
}

const sortedMonths = (m) => Object.keys(m).sort();
function baseScales(stacked = false) {
  return {
    x: { stacked, grid: { display: false }, ticks: { color: COLOR.text2 } },
    y: { stacked, grid: { color: COLOR.grid }, ticks: { color: COLOR.text2, callback: (v) => wonShort(v) } },
  };
}
const moneyTooltip = () => ({ callbacks: { label: (ctx) => `${ctx.dataset.label}: ${wonFull(ctx.parsed.y ?? ctx.parsed)}` } });

function renderMonthlyChart(months) {
  const keys = sortedMonths(months);
  draw("chart-monthly", {
    type: "bar",
    data: {
      labels: keys.map(monthLabel),
      datasets: [
        { label: "매출", data: keys.map((k) => months[k].revenue), backgroundColor: COLOR.accent, borderRadius: 4, order: 2 },
        { label: "비용", data: keys.map((k) => months[k].cost), backgroundColor: COLOR.muted, borderRadius: 4, order: 2 },
        { label: "순이익", data: keys.map((k) => months[k].revenue - months[k].cost), type: "line", borderColor: COLOR.good, backgroundColor: COLOR.good, borderWidth: 2, tension: 0.3, pointRadius: 3, order: 1 },
      ],
    },
    options: { scales: baseScales(false), plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: moneyTooltip() } },
  });
}

function renderShareChart(unitRevenue) {
  const units = UNIT_ORDER.filter((u) => unitRevenue[u]);
  const data = units.map((u) => unitRevenue[u]);
  const total = data.reduce((a, b) => a + b, 0) || 1;
  draw("chart-share", {
    type: "doughnut",
    data: { labels: units, datasets: [{ data, backgroundColor: units.map((u) => COLOR[u]), borderColor: COLOR.surface, borderWidth: 2 }] },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { color: COLOR.text2 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${wonFull(ctx.parsed)} (${pct((ctx.parsed / total) * 100)})` } },
      },
    },
  });
}

function renderStackedChart(months) {
  const keys = sortedMonths(months);
  const units = UNIT_ORDER.filter((u) => keys.some((k) => months[k].byUnit[u]));
  draw("chart-stacked", {
    type: "bar",
    data: {
      labels: keys.map(monthLabel),
      datasets: units.map((u) => ({
        label: u, data: keys.map((k) => months[k].byUnit[u] || 0),
        backgroundColor: COLOR[u], borderColor: COLOR.surface, borderWidth: 2, borderRadius: 3,
      })),
    },
    options: { scales: baseScales(true), plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: moneyTooltip() } },
  });
}

function renderCollectionChart(unitAgg) {
  const units = UNIT_ORDER.filter((u) => unitAgg[u]);
  draw("chart-collection", {
    type: "bar",
    data: {
      labels: units,
      datasets: [
        { label: "수금완료", data: units.map((u) => unitAgg[u].revenue - unitAgg[u].receivable), backgroundColor: COLOR.good, borderColor: COLOR.surface, borderWidth: 2, borderRadius: 3 },
        { label: "미수", data: units.map((u) => unitAgg[u].receivable), backgroundColor: COLOR.critical, borderColor: COLOR.surface, borderWidth: 2, borderRadius: 3 },
      ],
    },
    options: { scales: baseScales(true), plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: moneyTooltip() } },
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
  return `<tr><td>${name}</td><td>${wonShort(a.revenue)}</td><td>${wonShort(a.cost)}</td><td>${wonShort(profit)}</td><td>${pct(margin)}</td><td>${a.count.toLocaleString("ko-KR")}</td><td>${wonShort(avg)}</td><td>${wonShort(a.receivable)}</td></tr>`;
}

function draw(id, config) {
  if (charts[id]) charts[id].destroy();
  config.options = config.options || {};
  config.options.responsive = true;
  config.options.maintainAspectRatio = false;
  charts[id] = new Chart(document.getElementById(id), config);
}

function wireFilters() {
  document.querySelectorAll("#period-filter button").forEach((btn) =>
    btn.addEventListener("click", () => { state.period = Number(btn.dataset.period); setActive("#period-filter", btn); render(); }));
  document.querySelectorAll("#unit-filter button").forEach((btn) =>
    btn.addEventListener("click", () => { state.unit = btn.dataset.unit; setActive("#unit-filter", btn); render(); }));
}
function setActive(group, btn) {
  document.querySelectorAll(`${group} button`).forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}

function validate(v) {
  if (!v.deal_date || !/^\d{4}-\d{2}-\d{2}$/.test(v.deal_date)) return "거래일이 올바르지 않습니다.";
  if (!UNIT_ORDER.includes(v.business_unit)) return "사업부를 선택하세요.";
  const rev = Number(v.revenue), cst = Number(v.cost);
  if (!isFinite(rev) || rev < 0) return "매출 금액이 올바르지 않습니다.";
  if (!isFinite(cst) || cst < 0) return "비용 금액이 올바르지 않습니다.";
  const st = v.status === "미수" ? "미수" : "완료";
  return {
    deal_date: v.deal_date, business_unit: v.business_unit,
    revenue: Math.round(rev), cost: Math.round(cst), status: st,
    paid_date: st === "완료" ? v.deal_date : null,
    region: (v.region || "").toString().slice(0, 20) || null,
  };
}

function wireForm() {
  const form = document.getElementById("entry-form");
  const msg = document.getElementById("entry-message");
  const now = new Date();
  document.getElementById("in-date").value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const deal = validate(Object.fromEntries(new FormData(form).entries()));
    if (typeof deal === "string") { msg.textContent = "오류: " + deal; msg.className = "entry-message err"; return; }
    const user = readUser(); user.push(deal); writeUser(user);
    msg.textContent = "추가되었습니다. (이 브라우저에 저장됨)";
    msg.className = "entry-message ok";
    form.querySelector("#in-revenue").value = "";
    form.querySelector("#in-cost").value = "";
    loadData();
  });
}

if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = COLOR.text2;
}
wireFilters();
wireForm();
loadData();
