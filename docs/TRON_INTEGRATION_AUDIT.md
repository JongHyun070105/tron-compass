# TRON 및 TronGrid API 키 연동 감사 보고서 (TRON Integration Audit)

본 문서는 **TRON 공식 개발자 문서(https://developers.tron.network/llms.txt)**를 최우선 진실의 원천(Single Source of Truth)으로 삼아, TRON Compass 프로젝트의 `TRONGRID_API_KEY` 연동 상태, 네트워크 엔드포인트, TronGrid vs TronWeb 책임 분리, Nile 테스트넷 트랜잭션의 독립 사후 검증, JustLend Nile 컨트랙트 실행 정합성 및 실자산/모의 데이터 격리 상태를 교차 검증하고 문서화한 공식 감사 보고서입니다.

---

## 1. 핵심 7대 감사 질의에 대한 공식 보고

| 번호 | 감사 항목 | 결론 | 상세 근거 및 실측 결과 |
|:---:|:---|:---:|:---|
| **1** | **`TRONGRID_API_KEY`가 이전에는 미사용 상태였는가?** | **YES (완전 미사용 확인)** | 초기 감사 결과 `.env.local` 및 문서(README, ARCHITECTURE)에 환경 변수 선언만 존재했을 뿐, `src/` 및 `tests/` 등 어떤 실행 코드에서도 `process.env.TRONGRID_API_KEY`를 참조하거나 HTTP 헤더에 실어 보내는 코드가 전무했습니다. |
| **2** | **현재는 어디에서 사용되는가?** | **서버 전용 클라이언트 및 3개 핵심 라우트** | 1) `src/lib/tron/trongrid-client.ts` (중앙화 싱글톤 클라이언트)<br>2) `src/app/api/health/trongrid/route.ts` (노드 헬스 체크)<br>3) `src/app/api/tron/verify-tx/route.ts` (온체인 트랜잭션 독립 검증)<br>4) `src/app/api/tron/account/route.ts` (계정 잔고 및 에너지/대역폭 리소스 조회) |
| **3** | **서버 사이드 전용(Server-Only)으로 격리되어 있는가?** | **YES (완전 격리 보장)** | `TronGridClient` 내부에 `typeof window !== "undefined"` 런타임 가드가 적용되어 브라우저 번들 실행을 차단하며, 클라이언트 컴포넌트(`"use client"`) 전수 스캔 테스트(`tests/trongrid.test.ts`)를 통해 비밀키 및 헤더 누출이 0건임을 검증했습니다. |
| **4** | **앱이 Nile 트랜잭션을 TronGrid를 통해 독립 검증하는가?** | **YES (결정론적 영수증 검증)** | 브로드캐스트 직후 클라이언트가 직접 체인을 단정하지 않고, Next.js 서버의 `/api/tron/verify-tx`를 통해 Nile TronGrid(`wallet/gettransactioninfobyid`)에 질의하여 `blockNumber` 생성 및 `receipt.result === "SUCCESS"`를 확인한 후에만 `CONFIRMED`로 전이됩니다. |
| **5** | **실제 실행 경로가 TronLink를 필수로 요구하는가?** | **YES (서버 서명 완전 배제)** | 서버에 개인키(Private Key), 니모닉(Mnemonic)을 일체 저장/보관하지 않으며, 트랜잭션 생성 및 서명은 오직 브라우저의 TronLink 확장 프로그램 팝업창을 통한 사용자의 명시적 서명(`window.tronWeb.contract().mint().send()`)에 의해서만 수행됩니다. |
| **6** | **모의/데모 데이터가 실제 지갑 모드로 누출될 수 있는가?** | **NO (원천 차단)** | 모드 스위처를 통해 `isDemoMode: true` (데모 포트폴리오)와 `isDemoMode: false` (실제 지갑 세션)가 상호 배타적으로 격리되며, 실제 지갑 모드 진입 시 데모 잔고(500 TRX) 및 데모 주소는 전면 배제되고 실제 온체인 잔고 및 자원만 렌더링됩니다. |
| **7** | **사용자(인간)가 직접 수행해야 하는 잔여 작업은 무엇인가?** | **실제 TronLink 확장 서명** | 인간 승인(Human-in-the-Loop) 원칙에 따라, Nile 지갑 연결 후 [Approve & Sign] 버튼 클릭 시 나타나는 TronLink 확장 팝업에서 **직접 서명 승인**하는 단계만 인간 사용자의 몫으로 남아 있습니다. |

---

## 2. 공식 TRON 개발자 문서 검토 결과

공식 문서 인덱스(`https://developers.tron.network/llms.txt`)를 통해 확인 및 준수한 공식 엔드포인트 명세:

1. **공식 네트워크 엔드포인트 (Base URLs)**:
   - **TRON Mainnet**: `https://api.trongrid.io`
   - **Nile Testnet**: `https://nile.trongrid.io`
   - **Shasta Testnet**: `https://api.shasta.trongrid.io` (참조용, 본 프로젝트는 Nile 중심)

2. **API 키 인증 헤더 명세**:
   - HTTP 헤더 키: `TRON-PRO-API-KEY: <api-key>`
   - 역할: 요청 식별, 쿼터 추적(일 100,000건), 속도 제한 방지 및 보안 설정.
   - 트랜잭션 서명 권한과는 무관하며, 순수 데이터 쿼리/노드 통신용 인증 수단임.

3. **엔드포인트 책임 분리 (Architecture Responsibility)**:
   - **TronGrid V1 API** (`/v1/accounts/{address}`, `/v1/transactions/{id}/events` 등):
     - 사전 인덱싱된 계층 데이터, 계정 자산 목록, 토큰 전송 이력, 이벤트 로그 조회 전용.
   - **FullNode HTTP API / TronWeb** (`/wallet/getnowblock`, `/wallet/gettransactionbyid`, `/wallet/gettransactioninfobyid`, `/wallet/getaccountresource`):
     - 최신 블록 헤드 조회, 원시 트랜잭션 본문, 온체인 실행 영수증(Receipt), 에너지/대역폭 소모량 산출 전용.
   - **TronLink (Client DApp Provider)**:
     - 트랜잭션 파라미터 확인, 최종 수수료 한도(feeLimit) 승인, 사용자 개인키 서명 및 노드 브로드캐스트.

---

## 3. JustLend Nile 컨트랙트 실행 정합성 교차 검증

Nile 테스트넷 실제 온체인 질의(`wallet/getcontract`)를 통해 검증된 팩트:

- **대상 컨트랙트 주소**: `TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq` (Nile jTRX)
- **온체인 등록 이름**: `JustLend-TRX`
- **호출 메서드**: `mint()`
- **함수 시그니처 및 특성**:
  - `stateMutability: "Payable"`, `inputs: []`, `outputs: []`
  - TRC20 토큰(jUSDT, jUSDD 등)의 `mint(uint256 mintAmount)`와 달리, 네이티브 TRX 풀인 jTRX는 파라미터가 없으며 **`msg.value` (`callValue`)에 원시 sun 단위**로 예치 수량을 실어 보냄.
- **단위 환산**:
  - 1 TRX = 1,000,000 sun (Decimal 6자리).
  - 예: 50 TRX 예치 시 `callValue: 50000000` sun.
- **수수료 및 에너지 한도**:
  - `feeLimit: 100_000_000` sun (100 TRX)을 설정하여 에너지 부족(OUT_OF_ENERGY)으로 인한 리버트 방지.

---

## 4. 온체인 트랜잭션 상태 수명주기 모델

```
[IDLE]
  ↓ (모달 오픈 및 파라미터 로드)
[REVIEW] ← (사전 점검 미충족 시) → [PREFLIGHT_FAILED]
  ↓ (사용자 체크박스 명시적 동의)
[READY_TO_SIGN]
  ↓ (Approve & Sign 클릭)
[AWAITING_WALLET_SIGNATURE] (TronLink 확장 팝업 서명 대기)
  ↓ (사용자 서명 완료)
[BROADCASTING] (txHash 획득)
  ↓ (Next.js 서버 독립 질의 시작)
[CONFIRMING]
  ├─ (Nile TronGrid 영수증 blockNumber & SUCCESS 확인) ──→ [CONFIRMED]
  ├─ (Nile TronGrid 영수증 REVERT/FAILED 확인) ───────────→ [FAILED]
  └─ (지갑 팝업에서 사용자가 서명 취소 시) ──────────────→ [REJECTED]
```

### 절대 규칙 (Invariants):
1. **PENDING 상태의 조기 확정 금지**: 트랜잭션이 풀에만 존재하거나 영수증이 미발급된 `PENDING` 상태일 때 UI를 `CONFIRMED`로 조기 전이하지 않습니다.
2. **단독 증거 원칙**: 로컬 스토리지, 목 데이터, 지갑 콜백 결과만으로는 절대 `CONFIRMED`를 표기하지 않으며, 반드시 Nile TronGrid의 블록 포함 영수증이 확인되어야 합니다.

---

## 5. 구현된 서버 아키텍처 및 엔드포인트

### 1) `src/lib/tron/trongrid-client.ts`
- 서버 전용(Server-Only) 싱글톤 클라이언트.
- `TRON-PRO-API-KEY` 환경 변수를 안전하게 주입하여 통신.
- 타임아웃(8000ms), HTTP 429/5xx 재시도(Exponential Backoff), Zod 스키마 검증 완비.
- 비밀값(API 키) 로깅 및 응답 노출 원천 차단.

### 2) `GET /api/health/trongrid`
- Nile 또는 Mainnet 노드의 `/wallet/getnowblock`을 호출하여 인증 통신 및 레이턴시 실측.
- 응답 예시:
  ```json
  {
    "status": "HEALTHY",
    "configured": true,
    "network": "nile",
    "reachable": true,
    "blockNumber": 71260893,
    "txCountInBlock": 4,
    "latencyMs": 142,
    "testedEndpoint": "https://nile.trongrid.io/wallet/getnowblock",
    "timestamp": "2026-09-25T03:54:27.580Z"
  }
  ```

### 3) `POST /api/tron/verify-tx`
- 클라이언트로부터 `txHash`와 `network`를 수신하여 Nile TronGrid에서 트랜잭션 영수증을 직접 검증.
- 유효한 64자리 16진수 해시 검증 및 블록 번호, 에너지/대역폭 수수료 정보 반환.

### 4) `GET /api/tron/account`
- 특정 주소의 TRX 잔고, 토큰 잔고, 가용 대역폭(Bandwidth), 가용 에너지(Energy) 리소스를 서버를 통해 조회.

---

## 6. 대시보드 API 요청 카운터 반영 여부

- **이전 상태**: Today 0 / 100,000 requests.
- **현재 상태**:
  - `GET /api/health/trongrid` 호출 시 카운터 집계.
  - 지갑 연결 및 잔고 조회 시 `/api/tron/account` 호출을 통해 카운터 집계.
  - 트랜잭션 실행 후 서명 검증 시 `/api/tron/verify-tx` 호출을 통해 카운터 집계.
  - 테스트넷 검증 단계에서 실제 인증 헤더(`TRON-PRO-API-KEY`)를 사용한 실호출이 정상 완료되었으므로, TronGrid 대시보드의 사용량 카운터가 유의미하게 갱신됩니다.

---

## 7. 수동 실지갑 테스트 절차 (User Manual Guide)

인간 사용자(Human)가 실제 TronLink 지갑을 통해 종단간(E2E) 실행을 확인하는 절차:

1. **로컬 애플리케이션 실행**:
   ```bash
   pnpm dev
   ```
2. **브라우저 접속**: `http://localhost:3000`
3. **지갑 모드 전환**:
   - 우측 상단 헤더에서 `[데모 포트폴리오]` 대신 `[실제 지갑 (Real)]` 선택.
   - `[지갑 연결 (TronLink)]` 버튼을 클릭하여 본인의 TronLink 지갑 승인.
4. **네트워크 확인**:
   - TronLink 확장 프로그램에서 네트워크가 **Nile Testnet**으로 설정되어 있는지 확인.
   - 보유 TRX 잔고가 0인 경우, 모달 내 Faucet 링크(`https://nileex.io/join/getJoinPage`)를 통해 테스트용 Nile TRX를 지급받음.
5. **실행 모달 진입**:
   - 플랜 비교 화면에서 JustLend Supply 실행 버튼 클릭.
   - 사전 점검 항목(지갑 연결, Nile 네트워크, 잔고 및 20 TRX 에너지 버퍼) 통과 확인.
6. **실행 승인 및 서명**:
   - [명시적 실행 동의] 체크박스 선택 후 `[Approve & Sign Transaction]` 클릭.
   - TronLink 확장 프로그램 팝업창에서 트랜잭션 내용 확인 후 [Sign] 클릭.
7. **독립 사후 검증 확인**:
   - 화면 상태가 `AWAITING_WALLET_SIGNATURE` → `BROADCASTING` → `CONFIRMING`으로 순차 전이.
   - Next.js 서버가 Nile TronGrid에서 최종 영수증을 확인한 후 `CONFIRMED`로 완료됨을 확인.
   - 안내되는 `Nile TronScan 검증 확인` 링크를 클릭하여 블록체인 상의 실기록 확인.
