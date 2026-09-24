# Architecture Decision Records (ADR) — TRON Compass

이 문서는 GWDC 2026 TRON Challenge B 제출작 **TRON Compass**의 주요 제품·엔지니어링 아키텍처 의사결정과 대안 분석을 기록합니다.

---

## ADR-001: 공식 제품명 통일 (`TRON Compass`)

### 배경
초기 마스터 개발 프롬프트의 워킹 타이틀은 `TRON YieldPilot`이었으나, 공식 깃허브 저장소 이름 및 로컬 워크스페이스는 `tron-compass`로 생성되어 있습니다.

### 결정
공식 제품 명칭을 **TRON Compass** (부제: *AI Asset Allocation & Yield Planning Assistant for TRON*)로 확정합니다. UI 타이틀, 메타데이터, 패키지 이름, 문서에 일관되게 `TRON Compass`를 적용하며, Challenge B 요구사항(Needs Analysis, JustLend/USDD 연동, 2+ Viable Plans, Nile 트랜잭션, Replay/Rebalance)과의 정합성을 100% 유지합니다.

---

## ADR-002: 플랫폼 선정 — Desktop-First Responsive Web

### 배경
TRON 생태계 사용자와 심사위원 접점을 고려할 때 Web, Mobile App(Flutter/React Native), Desktop(Electron/Tauri) 중 최적의 플랫폼을 선정해야 합니다.

### 결정
**Desktop-first Responsive Web DApp**을 단일 플랫폼으로 선정합니다.

### 대안 비교
1. **Desktop Native (Electron/Tauri)**:
   - 단점: 심사위원에게 설치 파일을 요구하여 진입 장벽이 높고, 브라우저 확장형 지갑(TronLink)과의 표준 연동 이점이 없음.
2. **Mobile App (Flutter / React Native)**:
   - 단점: 모바일 딥링크 및 외부 지갑 앱 서명 연동(App-to-App) UX의 복잡성이 커져 핵심 DeFi 자산 배분 로직과 무관한 오버헤드 발생.
3. **Responsive Web (선택)**:
   - 장점: TronLink 브라우저 지갑과의 자연스러운 표준 Web3 연동, 단일 배포 URL을 통한 즉각적인 심사 및 3분 데모 시연 가능, 모바일 뷰포트 호환성 확보.

---

## ADR-003: 프레임워크 선정 — Next.js + React + TypeScript

### 배경
순수 클라이언트 SPA(Vite)와 풀스택 웹 프레임워크(Next.js) 중 BFF(Backend For Frontend) 및 보안 요구사항을 충족하는 최적의 스택을 선택해야 합니다.

### 결정
**Next.js (App Router) + React + TypeScript (Strict)** 를 선정합니다.

### 대안 비교
1. **Vite SPA + 별도 백엔드 (FastAPI/Express)**:
   - 단점: 두 개의 배포 환경, CORS 설정, API 키 보호를 위한 다중 인프라 운영 부담.
2. **Next.js 단일 스택 (선택)**:
   - 장점:
     - `GEMINI_API_KEY` 및 `TRONGRID_API_KEY`와 같은 비밀 키를 Route Handler를 통해 서버에 안전하게 은닉.
     - JustLend OpenAPI 및 USDD 데이터 플랫폼에 대한 서버 사이드 프록시, 캐싱, 레이트 리밋 제어 및 CORS 회피.
     - 클라이언트 단일 번들 관리로 1인 개발/해커톤 민첩성 극대화.

---

## ADR-004: 지갑 연동 — 공식 TronWallet Adapter 표준 준수

### 배경
지갑 연동 시 `window.tronLink` 직접 주입 객체에 의존하는 방식과 공식 TronWallet Adapter 표준 라이브러리를 사용하는 방식이 있습니다.

### 결정
공식 `@tronweb3/tronwallet-adapter-react-hooks` 및 `@tronweb3/tronwallet-adapters`를 채택합니다.

### 이유
- TronLink 전용 하드코딩을 탈피하여 향후 WalletConnect, BitKeep, OkxWallet 등 다중 지갑 확장 지원 가능.
- 연결, 해제, 계정 변경, 네트워크 변경 이벤트를 React 생태계의 훅 라이프사이클과 안정적으로 결합.
- 미설치 감지 및 Nile 전환 가이드를 표준화된 인터페이스로 제공.

---

## ADR-005: 네트워크 전략 — Mainnet Insight + Nile Execution 분리

### 배경
Mainnet에서 실제 자산을 무단 전송/예치하는 것은 보안상 금지되며, Nile 테스트넷은 JustLend V2 Vault 등 최신 컨트랙트가 미배포되어 메인넷과 마켓 상태가 다릅니다.

### 결정
두 네트워크의 책임을 철저히 분리합니다:
1. **Mainnet Insight Mode (Read-Only)**:
   - 실시간 JustLend 마켓(24개 jToken, APY, TVL, 이용률) 및 USDD 담보/PSM 데이터를 Mainnet API에서 실시간 조회하여 자산 배분 계획을 수립.
2. **Nile Execution Mode (Write Sandbox)**:
   - 실제 지갑 서명, 온체인 트랜잭션 브로드캐스트, 트랜잭션 해시 수령, 영수증 확인은 Nile 테스트넷에서 수행.
   - Nile에서 실 검증된 V1 jTRX supply 및 지원 마켓을 대상으로 안전하게 실행.
   - UI에 `Market Data: TRON Mainnet` / `Execution: Nile Testnet` 배지를 상시 표시하여 데이터 왜곡을 원천 방지.

---

## ADR-006: AI vs Deterministic Engine 책임 경계

### 핵심 원칙
> **AI understands. Code verifies. User approves. TRON executes.**

### 결정
- **LLM (Gemini 2.5 Flash / Mock Provider)**:
  - 자연어 투자 의도 파악 (Holdings, Time Horizon, Liquidity Need, Risk Preference)
  - 누락된 제약 조건 식별 및 간결한 추가 질의 생성
  - Deterministic 엔진이 계산한 배분 결과 및 리밸런싱 사유를 인간 친화적으로 설명
- **Deterministic Engine (순수 TypeScript + Decimal.js)**:
  - APY, 수수료, 마켓 지원 여부, 컨트랙트 주소, 자산 배분 비율의 절대적 Source of Truth
  - 최소 유동성 확보, 변동성 자산 한도 등 Hard Constraints 검증 (절대 완화 불가)
  - 최소 2개 이상의 Viable Plan (Liquidity-First, Yield-Oriented) 결정론적 산출
  - LLM이 임의로 숫자를 창작하거나 제약 조건을 무시하는 환각(Hallucination) 원천 차단

---

## ADR-007: 금융 연산 정밀도 — Decimal.js 기반 Arbitrary Precision

### 배경
JavaScript 표준 `Number` 타입(IEEE 754 부동소수점)은 금융 잔액, 일별 누적 수익, 토큰 단위 환산(TRX 6자리 sun, USDD 18자리 wei) 시 정밀도 손실과 반올림 오차를 유발합니다.

### 결정
모든 금융 계산(잔액, 가치, APY 수익 추정, 수수료, 배분 비율)에 **`decimal.js`**를 사용합니다.
- 토큰 decimals는 자산별 메타데이터(`underlyingDecimal`)를 명시적으로 조회하여 처리.
- 화면 표시 직전 포맷팅 단계에서만 문자열로 안전하게 변환.

---

## ADR-008: 클라이언트 영속화 — IndexedDB 기반 로컬 저장소

### 배경
해커톤 MVP에서 중앙화 데이터베이스(PostgreSQL/MongoDB)와 사용자 인증(Auth) 시스템을 구축하는 것은 장애 지점을 늘리고 본질적인 Challenge B 평가 요소를 벗어납니다.

### 결정
브라우저 표준 **IndexedDB**를 영속화 계층으로 사용합니다.
- 저장 엔티티: `NeedsProfileRecord`, `MarketSnapshotRecord`, `AllocationPlanRecord`, `ExecutionRecord`, `ReviewRecord`
- 지갑 주소를 네임스페이스 키로 관리.
- 민감한 개인키나 시드 문구는 일절 다루지 않으며 온체인 상태와 로컬 스냅샷의 일치 여부 비교에 집중.

---

## ADR-009: 브라우저 전용 지갑 경계 — Client Island 격리

### 배경
Next.js SSR 과정에서 `window` 또는 `window.tronWeb` 객체에 접근하면 `ReferenceError: window is not defined` 및 Hydration Mismatch 에러가 발생합니다.

### 결정
- 지갑 Provider, TronLink Adapter, 서명 핸들러, 브라우저 이벤트 리스너는 `"use client"` 지시어가 부여된 Client Component Island에 완전히 격리.
- Next.js Dynamic Import (`ssr: false`)를 적용하여 클라이언트 사이드 마운트 이후에만 로드되도록 보장.
