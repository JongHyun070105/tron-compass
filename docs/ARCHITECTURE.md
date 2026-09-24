# System Architecture Specification — TRON Compass

GWDC 2026 TRON Challenge B: **AI Asset Allocation and Yield Planning Assistant for TRON**

---

## 1. 아키텍처 개요 및 설계 철학

TRON Compass는 자연어 대화를 통해 사용자의 투자 기간, 필요 유동성, 위험 선호도를 분석하고, JustLend 및 USDD의 검증된 실시간 데이터를 바탕으로 결정론적(Deterministic) 자산 배분 계획을 수립합니다. 모든 실행은 사용자 명시적 승인 하에 Nile 테스트넷에서 안전하게 이루어지며, 이후 시장 변화에 따른 리밸런싱을 감지하고 제안합니다.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Next.js Responsive Web UI                         │
│   Dashboard  |  AI Planner  |  Plan Comparison  |  Execution  | Replay  │
└───────────────────┬──────────────────────────────────┬─────────────────┘
                    │ (Browser Island)                 │ (HTTP / React Query)
                    ▼                                  ▼
      ┌───────────────────────────┐      ┌───────────────────────────────┐
      │   TronWallet Adapter      │      │        Next.js Route BFF      │
      │   (TronLink / Nile)       │      │   /api/ai/needs               │
      └─────────────┬─────────────┘      │   /api/market/justlend        │
                    │                    │   /api/market/usdd            │
                    ▼                    │   /api/health                 │
      ┌───────────────────────────┐      └──────────────┬────────────────┘
      │   TronWeb Nile Signer     │                     │
      │   (User Signature Gate)   │                     │
      └─────────────┬─────────────┘                     ▼
                    │                    ┌───────────────────────────────┐
                    ▼                    │   External Data Ingestion     │
        TRON Nile Testnet                │   - JustLend OpenAPI / contracts  │
      (Execution & Receipts)             │   - USDD Data Platform            │
                                         └──────────────┬────────────────┘
                                                        │
                                                        ▼
                                         ┌───────────────────────────────┐
                                         │  Deterministic Allocation     │
                                         │  - Hard Constraint Filter     │
                                         │  - Decimal.js Yield Engine    │
                                         │  - Plan A (Liquidity-First)   │
                                         │  - Plan B (Yield-Oriented)    │
                                         └──────────────┬────────────────┘
                                                        │
                                                        ▼
                                         ┌───────────────────────────────┐
                                         │     IndexedDB Persistence     │
                                         │     - Needs, Plans, Snapshots │
                                         │     - Replay & Rebalance Log  │
                                         └───────────────────────────────┘
```

### 핵심 원칙
- **AI understands**: LLM은 사용자 의도 파악과 결과 설명만 담당하며 숫자를 창작하지 않음.
- **Code verifies**: 금융 수식, 수수료, 하드 제약 조건, 마켓 유효성은 순수 코드가 검증.
- **User approves**: 사용자 확인 없는 트랜잭션 서명 및 실행 불가.
- **TRON executes**: 검증된 Nile 스마트 컨트랙트에서 온체인 트랜잭션 수행.

---

## 2. 레이어별 책임 및 데이터 흐름

### A. Presentation Layer (React + Tailwind CSS)
- **Dashboard**: 지갑 상태, 포트폴리오 요약, 실시간 JustLend/USDD 마켓 현황 카드.
- **AI Planner**: 자연어 목표 입력 및 Zod 기반 제약조건 요약(Needs Summary) 확인/수정.
- **Plan Comparison**: 하드 제약조건을 만족하는 최소 2개 계획(Liquidity-First vs Yield-Oriented) 비교.
- **Execution Modal**: 수수료, 승인 범위, 위험 고지 및 사용자 명시적 서명 게이트.
- **Monitor / Replay**: 저장된 과거 계획 대비 현재 상황 비교, 시나리오 리플레이 및 리밸런싱 제안.

### B. BFF & Integration Layer (Next.js Route Handlers)
- `GET /api/market/justlend`: `https://openapi.just.network/lend/jtoken` 프록시, 유효 토큰 필터링, 정규화.
- `GET /api/market/usdd`: `https://app-api.usdd.io/data-platform/overview/info` 및 담보 데이터 연동.
- `POST /api/ai/needs`: Google Gemini API (`GEMINI_API_KEY`)를 안전하게 호출하여 투자 프로필 추출. API 장애 시 `MockLLMProvider`로 graceful fallback.
- `POST /api/ai/explain`: 배분 근거 및 리밸런싱 사유 자연어 생성.

### C. Domain & Engine Layer (Pure TypeScript + Decimal.js)
- **Normalization**: 원시 API 응답을 `YieldOpportunity` 규격으로 변환. Base APY와 Mining Incentive APY를 명확히 분리.
- **Hard Constraints**:
  - `liquidReserveUsd >= minimumLiquidUsd` (최소 유동성 절대 보장)
  - `volatileExposurePct <= maxVolatileExposurePct` (변동성 자산 상한 제한)
  - `totalAllocated <= totalCapital` (보유 자산 초과 배분 금지)
  - `market.status === 'active'` (비활성/레거시 마켓 제외)
  - `market.stale === false` (오래된 데이터 배제)
- **Candidate Generator**: 자산 배분 비중(Stepwise 탐색)으로 유효 포트폴리오 후보군 생성.
- **Plan Comparator**: Liquidity-first (안정성·유동성 우선) 및 Yield-oriented (허용 한도 내 수익 극대화) 플랜 선출.

### D. Wallet & Execution Layer
- `@tronweb3/tronwallet-adapter-react-hooks` 기반 브라우저 지갑 연동.
- Nile 테스트넷 jTRX supply:
  - Contract: `TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq` (Nile jTRX)
  - Method: `mint()` (payable, `callValue`에 TRX sun 전달)
- Pre-flight 검증: 지갑 연결 여부, 체인 ID (Nile), TRX 잔액, 수수료 자원(Energy/Bandwidth) 충족 여부 확인.

### E. Persistence Layer (IndexedDB)
- `tron_compass_db`:
  - `profiles`: 확정된 투자자 요구사항 프로필
  - `snapshots`: 계획 생성 당시의 마켓 상태 스냅샷
  - `plans`: 생성된 배분 계획 및 제약 검증 결과
  - `executions`: 트랜잭션 해시, 실행 상태, 온체인 영수증
  - `rebalance_logs`: 리밸런싱 감지 내역 및 시나리오 리플레이 기록

---

## 3. 보안 및 안전장치 (Fail-Closed)

1. **Non-Custodial First**: 비밀키, 니모닉을 앱에 일절 요청하거나 저장하지 않음.
2. **API Key Isolation**: `GEMINI_API_KEY`와 `TRONGRID_API_KEY`는 서버 환경에만 존재하며 번들에 미포함.
3. **Network Separation**: 메인넷은 오직 READ-ONLY 데이터 수집에만 사용되며, 자산 이동 트랜잭션은 Nile 테스트넷에서만 실행.
4. **Explicit Approval Gate**: 원클릭 자동 투자 금지. 반드시 실행 전 대상 컨트랙트, 수량, 예상 수수료를 표시하고 사용자 지갑 팝업 서명을 요구.
5. **Clear Badging**: 실시간 메인넷 데이터, 나일 테스트넷 실행, 데모 샘플 데이터, 시뮬레이션 리플레이를 뱃지로 시각적으로 엄격히 구별.
