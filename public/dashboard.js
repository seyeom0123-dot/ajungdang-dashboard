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
// 천만원(=1e7) 단위. 값만 반환(단위 라벨은 화면에 별도 표시).
const tenMan = (n) => (n / 1e7).toLocaleString("ko-KR", { maximumFractionDigits: 1 });

// ── 상태 ─────────────────────────────────────────────────────
let ALL = [];
const state = { month: "전체", page: "전체", deptMode: "월별", colFilters: {} };
const charts = {};
let deptScopeDeals = []; // 현재 사업부·월 스코프의 거래(열 필터 적용 전)
let lastDeptScope = null;

// 거래내역 필터 열 정의
const COLS = [
  { key: "deal_date", label: "거래일" },
  { key: "business_unit", label: "사업부" },
  { key: "revenue", label: "매출" },
  { key: "cost", label: "비용" },
  { key: "status", label: "수금상태" },
  { key: "region", label: "지역" },
];
const colValue = (d, key) =>
  key === "revenue" || key === "cost" ? String(d[key]) : key === "region" ? d.region || "" : d[key];
const displayValue = (key, v) =>
  key === "revenue" || key === "cost" ? Number(v).toLocaleString("ko-KR") : key === "region" && v === "" ? "(빈값)" : v;

// ── 데이터 로드 ───────────────────────────────────────────────
async function loadData() {
  const res = await fetch("/api/deals");
  const json = await res.json();
  ALL = json.deals || [];
  lastDeptScope = null; // 데이터 갱신 시 필터 옵션 재구성
  const badge = document.getElementById("source-badge");
  badge.textContent =
    (json.source === "supabase" ? "Supabase 연결됨" : "더미 데이터(미리보기)") +
    ` · ${ALL.length.toLocaleString("ko-KR")}건`;
  render();
}

// ── 필터 ─────────────────────────────────────────────────────
// 선택 월(state.month: "전체" 또는 1~12)에 해당하는지.
function inSelectedMonth(d) {
  return state.month === "전체" || Number(d.deal_date.slice(5, 7)) === state.month;
}
function filtered() {
  return ALL.filter(inSelectedMonth);
}
// 특정 사업부의 (선택 월) 거래
function deptDealsForUnit(unit) {
  return ALL.filter((d) => d.business_unit === unit && inSelectedMonth(d)).sort((a, b) =>
    a.deal_date < b.deal_date ? -1 : 1
  );
}
// 열별 다중선택 필터 적용 (열끼리는 AND, 한 열 안의 값끼리는 OR)
function applyColFilters(deals) {
  return deals.filter((d) =>
    COLS.every((c) => {
      const s = state.colFilters[c.key];
      return !s || s.size === 0 || s.has(colValue(d, c.key));
    })
  );
}
// 한 열의 고유값 목록(정렬)
function distinctValues(deals, key) {
  const arr = [...new Set(deals.map((d) => colValue(d, key)))];
  if (key === "revenue" || key === "cost") arr.sort((a, b) => Number(a) - Number(b));
  else arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return arr;
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
  document.getElementById("global-filters").hidden = !isAll; // 사업부 페이지는 자체 드롭박스 사용
  document.getElementById("page-title").textContent = isAll
    ? "이사 · 청소 · 부동산 재무 현황"
    : `${state.page} 재무 상세`;
  syncMonthSelects();

  if (isAll) {
    const agg = aggregate(filtered());
    renderFinanceTable(agg.unitAgg, agg.totals);
    renderStackedChart(agg.months);
    renderStackedTable(agg.months);
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
      ticks: { color: COLOR.text2, callback: (v) => tenMan(v) },
    },
  };
}
// 천만원 단위 툴팁
function tenManTooltip() {
  return {
    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${tenMan(ctx.parsed.y ?? ctx.parsed)}천만원` },
  };
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
      plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: tenManTooltip() },
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
      plugins: { legend: { labels: { color: COLOR.text2 } }, tooltip: tenManTooltip() },
    },
  });
}

// ── 차트별 설명 표 ────────────────────────────────────────────
const mLabel = (key) => `${Number(key.slice(5, 7))}월`;
const dot = (u) => `<span class="unit-dot" style="background:${COLOR[u]}"></span>${u}`;
function tableHTML(headers, rows, cls = "") {
  const head = headers.map((h, i) => `<th${i === 0 ? ' class="lead"' : ""}>${h}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="lead"' : ""}>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="data-table ${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// 재무상태표(선택 월 기준, 천만원): 항목 행 × 사업부·합계 열
function renderFinanceTable(unitAgg, totals) {
  const get = (u) => unitAgg[u] || { revenue: 0, cost: 0, receivable: 0 };
  const op = (a) => a.revenue - a.cost;
  const tRev = totals.revenue, tCost = totals.cost, tRecv = totals.receivable;
  const rows = [
    ["매출", ...UNIT_ORDER.map((u) => tenMan(get(u).revenue)), tenMan(tRev)],
    ["영업비용", ...UNIT_ORDER.map((u) => tenMan(get(u).cost)), tenMan(tCost)],
    ["영업이익", ...UNIT_ORDER.map((u) => tenMan(op(get(u)))), tenMan(tRev - tCost)],
    ["이익률", ...UNIT_ORDER.map((u) => { const a = get(u); return pct(a.revenue ? (op(a) / a.revenue) * 100 : 0); }), pct(tRev ? ((tRev - tCost) / tRev) * 100 : 0)],
    ["수금완료", ...UNIT_ORDER.map((u) => { const a = get(u); return tenMan(a.revenue - a.receivable); }), tenMan(tRev - tRecv)],
    ["미수금", ...UNIT_ORDER.map((u) => tenMan(get(u).receivable)), tenMan(tRecv)],
  ];
  document.getElementById("tbl-finance").innerHTML = tableHTML(["항목", "이사", "청소", "부동산", "합계"], rows, "fin-table");
}

// 월별 사업부별 매출 (천만원 단위)
function renderStackedTable(months) {
  const keys = sortedMonths(months);
  const sums = { 이사: 0, 청소: 0, 부동산: 0 };
  const rows = keys.map((k) => {
    const bu = months[k].byUnit;
    let tot = 0;
    const cells = UNIT_ORDER.map((u) => { sums[u] += bu[u] || 0; tot += bu[u] || 0; return tenMan(bu[u] || 0); });
    return [mLabel(k), ...cells, tenMan(tot)];
  });
  const grand = UNIT_ORDER.reduce((s, u) => s + sums[u], 0);
  rows.push(["합계", ...UNIT_ORDER.map((u) => tenMan(sums[u])), tenMan(grand)]);
  document.getElementById("tbl-stacked").innerHTML = tableHTML(["월", "이사", "청소", "부동산", "합계"], rows);
}

// ── 사업부 상세 뷰 (월 드롭박스 + 열별 콤보박스 필터) ──
function renderDeptView(unit) {
  const isAllMonths = state.month === "전체";
  document.getElementById("dept-monthly-section").hidden = !isAllMonths; // 월별 표는 전체일 때만

  deptScopeDeals = deptDealsForUnit(unit);
  if (isAllMonths) renderDeptMonthlyTable(deptScopeDeals);

  // 사업부/월이 바뀌면 필터 콤보박스를 새 옵션으로 재구성하고 선택 초기화
  const scopeKey = `${unit}|${state.month}`;
  if (scopeKey !== lastDeptScope) {
    lastDeptScope = scopeKey;
    state.colFilters = {};
    buildColFilters(deptScopeDeals);
  }
  refreshDeptTable();
}

// 열별 콤보박스 DOM 생성 (검색 input + 체크박스 옵션)
function buildColFilters(deals) {
  const esc = (s) => String(s).replace(/"/g, "&quot;");
  document.getElementById("col-filters").innerHTML = COLS.map((c) => {
    const opts = distinctValues(deals, c.key)
      .map((v) => {
        const disp = displayValue(c.key, v);
        return `<label class="combo-opt" data-text="${esc(disp)}"><input type="checkbox" value="${esc(v)}" /> <span>${disp}</span></label>`;
      })
      .join("");
    return `<div class="combo" data-col="${c.key}">
      <div class="combo-label">${c.label}<span class="combo-count" data-count></span></div>
      <div class="combo-field">
        <input type="text" class="combo-input" placeholder="전체" autocomplete="off" />
        <div class="combo-panel">${opts || '<div class="combo-empty">값 없음</div>'}</div>
      </div>
    </div>`;
  }).join("");
}

// 열 필터만 적용해 거래내역 표 다시 그림(콤보박스 DOM은 유지)
function refreshDeptTable() {
  renderDeptExcel(applyColFilters(deptScopeDeals));
  const any = Object.values(state.colFilters).some((s) => s && s.size);
  document.getElementById("clear-filters").hidden = !any;
}

// 전체(연간) 월별 표: 월별 / 누적 토글
function renderDeptMonthlyTable(deals) {
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
  const rows = keys.map((k) => {
    cr += byMonth[k].rev; cc += byMonth[k].cost;
    const R = isCum ? cr : byMonth[k].rev, C = isCum ? cc : byMonth[k].cost;
    return [mLabel(k), tenMan(R), tenMan(C), tenMan(R - C)];
  });
  rows.push(["연간 합계", tenMan(cr), tenMan(cc), tenMan(cr - cc)]);
  const heads = isCum ? ["월", "누적 매출", "누적 지출", "누적 이익"] : ["월", "매출", "지출", "영업이익"];
  document.getElementById("dept-monthly-table").innerHTML = tableHTML(heads, rows);
}

// 엑셀 양식 거래 내역 (합계는 하단 고정 tfoot). 필터는 위 콤보박스로.
function renderDeptExcel(deals) {
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
  const empty = `<tr><td class="lead" colspan="6" style="text-align:center;color:var(--muted)">해당 조건의 거래가 없습니다.</td></tr>`;
  const tfoot = deals.length
    ? `<tfoot><tr>
         <td class="lead">합계 (${deals.length.toLocaleString("ko-KR")}건)</td><td class="lead"></td>
         <td>${sRev.toLocaleString("ko-KR")}</td><td>${sCost.toLocaleString("ko-KR")}</td>
         <td class="lead"></td><td class="lead"></td>
       </tr></tfoot>`
    : "";
  document.getElementById("dept-table").innerHTML =
    `<table class="data-table"><thead><tr>
       <th class="lead">거래일</th><th class="lead">사업부</th><th>매출</th><th>비용</th>
       <th class="lead">수금상태</th><th class="lead">지역</th>
     </tr></thead><tbody>${deals.length ? body : empty}</tbody>${tfoot}</table>`;
}

// 사업부별 수금 현황
function renderCollectionTable(unitAgg) {
  const units = UNIT_ORDER.filter((u) => unitAgg[u]);
  let sd = 0, srec = 0;
  const rows = units.map((u) => {
    const a = unitAgg[u], done = a.revenue - a.receivable;
    sd += done; srec += a.receivable;
    return [dot(u), tenMan(done), tenMan(a.receivable), pct(a.revenue ? (a.receivable / a.revenue) * 100 : 0)];
  });
  const tot = sd + srec;
  rows.push(["합계", tenMan(sd), tenMan(srec), pct(tot ? (srec / tot) * 100 : 0)]);
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

// ── 컨트롤 배선 ────────────────────────────────────────────────
function setMonth(v) {
  state.month = v === "전체" ? "전체" : Number(v);
  render(); // 스코프가 바뀌면 renderDeptView가 필터를 재구성
}
function syncMonthSelects() {
  const v = String(state.month);
  const a = document.getElementById("dash-month-select");
  const b = document.getElementById("dept-month-select");
  if (a) a.value = v;
  if (b) b.value = v;
}
function wireControls() {
  document.getElementById("dash-month-select").addEventListener("change", (e) => setMonth(e.target.value));
  document.getElementById("dept-month-select").addEventListener("change", (e) => setMonth(e.target.value));

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

  wireColFilters();
}

// 열별 콤보박스 배선(이벤트 위임 — 콤보박스 DOM은 스코프 변경 시에만 재생성됨)
function wireColFilters() {
  const wrap = document.getElementById("col-filters");
  const setOf = (col) => state.colFilters[col] || (state.colFilters[col] = new Set());
  const countEl = (combo) => combo.querySelector("[data-count]");
  const showCount = (combo, n) => (countEl(combo).textContent = n ? `(${n})` : "");

  wrap.addEventListener("focusin", (e) => {
    if (!e.target.classList.contains("combo-input")) return;
    closeCombos();
    e.target.closest(".combo").classList.add("open");
  });
  wrap.addEventListener("input", (e) => {
    if (!e.target.classList.contains("combo-input")) return;
    const q = e.target.value.trim().toLowerCase();
    const combo = e.target.closest(".combo");
    combo.classList.add("open");
    combo.querySelectorAll(".combo-opt").forEach((opt) =>
      opt.classList.toggle("hidden", q && !(opt.dataset.text || "").toLowerCase().includes(q))
    );
  });
  wrap.addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    const combo = e.target.closest(".combo");
    const set = setOf(combo.dataset.col);
    if (e.target.checked) set.add(e.target.value);
    else set.delete(e.target.value);
    showCount(combo, set.size);
    refreshDeptTable();
  });
  // 입력 후 Enter → 현재 보이는 옵션 모두 선택 (예: "완료" 입력 후 Enter)
  wrap.addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("combo-input") || e.key !== "Enter") return;
    e.preventDefault();
    const combo = e.target.closest(".combo");
    const set = setOf(combo.dataset.col);
    combo.querySelectorAll(".combo-opt:not(.hidden) input[type=checkbox]").forEach((cb) => {
      if (!cb.checked) { cb.checked = true; set.add(cb.value); }
    });
    showCount(combo, set.size);
    refreshDeptTable();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#col-filters")) closeCombos();
  });
  document.getElementById("clear-filters").addEventListener("click", () => {
    state.colFilters = {};
    buildColFilters(deptScopeDeals);
    refreshDeptTable();
  });
}
function closeCombos() {
  document.querySelectorAll(".combo.open").forEach((c) => c.classList.remove("open"));
}
function setActive(group, btn) {
  document.querySelectorAll(`${group} button`).forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}

// ── 시작 ─────────────────────────────────────────────────────
if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = COLOR.text2;
}
wireControls();
loadData();

// 서비스워커 등록(앱 설치 지원)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
