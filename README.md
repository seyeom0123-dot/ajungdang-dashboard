# 아정당 재무 대시보드

이사 · 청소 · 부동산 사업부의 재무 현황(매출/비용/이익, 사업부별 비중, 건수/객단가, 현금흐름/미수금)을
보여주는 웹 대시보드입니다. 데이터를 직접 입력할 수 있고, 휴대폰·PC에 **앱으로 설치**할 수 있습니다(PWA).

- **프런트엔드:** 바닐라 HTML/CSS/JS + Chart.js (CDN)
- **서버:** Node + Express (Render 배포)
- **DB:** Supabase (Postgres)
- 서버·DB 모두 **무료 티어** 사용

---

## 1. 로컬에서 바로 미리보기 (Supabase 없이)

Supabase를 아직 안 만들었어도, 더미 데이터로 화면을 볼 수 있습니다.

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 접속. 상단 배지에 "더미 데이터(미리보기)"로 표시됩니다.
입력 폼도 동작하지만, 이 모드에서 넣은 데이터는 **서버를 끄면 사라집니다**.

---

## 2. Supabase 연결 (실제 저장)

1. https://supabase.com 에서 무료 프로젝트 생성.
2. 좌측 **SQL Editor** → [db/schema.sql](db/schema.sql) 내용을 붙여넣고 **Run**. (deals 테이블 생성)
3. **Project Settings → API** 에서 두 값을 복사:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` 키 → `SUPABASE_SERVICE_KEY` (⚠️ 비밀키, 외부 노출 금지)
4. `.env.example` 를 복사해 `.env` 파일을 만들고 위 두 값을 채움.
5. 더미 데이터를 DB에 채우려면(선택):
   ```bash
   npm run seed
   ```
   → 2026년 1월부터 이번 달까지 이사/청소/부동산 임시 거래가 들어갑니다. (재실행 시 기존 데이터 삭제 후 재적재)
6. 서버 실행:
   ```bash
   npm start
   ```
   배지가 "Supabase 연결됨"으로 바뀌면 성공.

---

## 3. Render 배포 (무료)

1. 이 폴더를 GitHub 저장소로 push.
2. https://render.com → **New → Web Service** → 저장소 연결.
3. 설정:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. **Environment** 탭에서 환경변수 추가:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   (PORT는 Render가 자동 주입하므로 설정 불필요)
5. 배포 완료 후 나오는 URL로 접속. 휴대폰 브라우저에서 "홈 화면에 추가"로 앱 설치 가능.

> 무료 티어 참고: Render 무료 웹서비스는 트래픽이 없으면 잠들었다가 첫 접속 시 수십 초 깨어나는 지연이 있습니다.

---

## 데이터 구조 (deals 테이블)

| 컬럼 | 의미 |
|---|---|
| deal_date | 거래일 |
| business_unit | 사업부 (이사/청소/부동산) |
| revenue | 매출 |
| cost | 비용/원가 |
| status | 수금상태 (완료/미수) |
| paid_date | 입금일 (미수면 비어 있음) |
| region | 지역 |

모든 지표(순이익, 이익률, 객단가, 미수금 등)는 이 한 테이블에서 계산됩니다.

## 파일 구조

```
server.js        Express 서버 (정적 서빙 + /api/deals GET·POST)
seed.js          더미 데이터 → Supabase 적재
dummy.js         더미 데이터 생성기 (2026-01 ~ 현재)
db/schema.sql    Supabase 테이블 스키마
public/          대시보드 앱 (index.html, style.css, dashboard.js, PWA 파일)
```
