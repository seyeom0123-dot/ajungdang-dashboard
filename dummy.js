// 아정당 임시(더미) 거래 데이터 생성기.
// seed.js(Supabase 적재)와 server.js(폴백 미리보기)가 함께 사용한다.
// 2026년 1월부터 현재 달까지 월별로 생성한다.

const REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전"];

// 사업부별 특성: 이사=고단가·중건수, 청소=저단가·고건수, 부동산=초고단가·저건수(중개수수료)
const UNITS = {
  이사:   { deals: [22, 40], revenue: [350000, 1800000], costRate: [0.55, 0.70] },
  청소:   { deals: [55, 100], revenue: [90000, 480000],   costRate: [0.45, 0.62] },
  부동산: { deals: [10, 24],  revenue: [500000, 5200000], costRate: [0.18, 0.38] },
};

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function ymd(date) {
  // 로컬 시간 기준으로 포맷한다. toISOString()은 UTC로 바꿔 KST에서 하루 밀릴 수 있다.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 2026-01부터 현재 달까지의 거래 목록을 생성한다.
export function generateDeals(startYear = 2026, startMonth = 1) {
  const deals = [];
  const now = new Date();
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1); // 이번 달 1일
  const monthCount =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

  for (let m = 0; m < monthCount; m++) {
    const monthStart = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    // 완만한 성장 추세: 뒤쪽 달일수록 물량이 조금 늘어난다.
    const growth = 1 + m * 0.02;

    for (const [unit, cfg] of Object.entries(UNITS)) {
      const count = Math.round(randInt(cfg.deals[0], cfg.deals[1]) * growth);
      for (let i = 0; i < count; i++) {
        const day = randInt(1, daysInMonth);
        const dealDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        const revenue = Math.round(rand(cfg.revenue[0], cfg.revenue[1]) / 1000) * 1000;
        const cost = Math.round((revenue * rand(cfg.costRate[0], cfg.costRate[1])) / 1000) * 1000;

        // 약 82% 수금완료, 나머지는 미수. 최근 달일수록 미수 비율이 조금 높다.
        const isPaid = Math.random() < 0.82 - (monthCount - 1 - m) * 0.005;
        let paidDate = null;
        if (isPaid) {
          const paid = new Date(dealDate);
          paid.setDate(paid.getDate() + randInt(0, 30));
          paidDate = ymd(paid);
        }

        deals.push({
          deal_date: ymd(dealDate),
          business_unit: unit,
          revenue,
          cost,
          status: isPaid ? "완료" : "미수",
          paid_date: paidDate,
          region: pick(REGIONS),
        });
      }
    }
  }

  deals.sort((a, b) => (a.deal_date < b.deal_date ? -1 : 1));
  return deals;
}
