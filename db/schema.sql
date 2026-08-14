-- 아정당 재무 대시보드: 거래 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create table if not exists deals (
  id            uuid primary key default gen_random_uuid(),
  deal_date     date not null,                         -- 거래일
  business_unit text not null                          -- 사업부
                check (business_unit in ('이사', '청소', '부동산')),
  revenue       numeric not null,                      -- 매출
  cost          numeric not null,                      -- 원가/비용
  status        text not null                          -- 수금상태
                check (status in ('완료', '미수')),
  paid_date     date,                                  -- 입금일 (미수면 null)
  region        text,                                  -- 지역
  created_at    timestamptz default now()
);

create index if not exists deals_date_idx on deals (deal_date);
create index if not exists deals_unit_idx on deals (business_unit);
