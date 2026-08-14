// 더미 생성기 자체 점검. 실행: node selftest.mjs  (npm 불필요)
import { strict as assert } from "node:assert";
import { generateDeals } from "./dummy.js";

const deals = generateDeals(2026, 1);
assert.ok(deals.length > 0, "거래가 생성되어야 함");

const units = new Set(deals.map((d) => d.business_unit));
assert.deepEqual([...units].sort(), ["부동산", "이사", "청소"], "세 사업부 모두 존재");

for (const d of deals) {
  assert.match(d.deal_date, /^2026-\d{2}-\d{2}$/, `거래일은 2026년이어야 함: ${d.deal_date}`);
  assert.ok(d.revenue > 0, "매출 > 0");
  assert.ok(d.cost >= 0 && d.cost < d.revenue, "비용은 0 이상, 매출 미만");
  assert.ok(d.status === "완료" || d.status === "미수", "수금상태 유효");
  // 미수면 입금일 없음, 완료면 입금일 있음
  assert.equal(d.status === "미수", d.paid_date === null, "미수 ↔ 입금일 없음 일치");
}

// 첫 달은 2026-01 이어야 함
const firstMonth = deals.map((d) => d.deal_date.slice(0, 7)).sort()[0];
assert.equal(firstMonth, "2026-01", "첫 달은 2026-01");

console.log(`OK — ${deals.length}건, 사업부 ${units.size}개, 첫 달 ${firstMonth}`);
