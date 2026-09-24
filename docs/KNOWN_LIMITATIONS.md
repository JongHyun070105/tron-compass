# Known Limitations — TRON Compass

TRON Compass 개발 및 실행 환경에서 인지된 공식 기술적 제약 사항입니다.

---

## 1. JustLend V2 Vault Nile 미배포
- **상태**: JustLend V2 (Moolah) ERC-4626 Vault 컨트랙트는 TRON Nile 테스트넷에 배포되어 있지 않습니다.
- **대응**: Nile 테스트넷 실행(Execution Sandbox)은 검증된 V1 core jToken(특히 `jTRX` mint)을 기본 타겟으로 사용하며, V2 Vault에 대한 write 시도는 차단됩니다.

## 2. Mainnet Read-Only 강제
- **상태**: 사용자의 실제 자산 안전을 위하여 메인넷 자산 이동 및 스마트 컨트랙트 write 실행은 원천 차단됩니다.
- **대응**: 메인넷은 오직 실시간 마켓 APY, TVL, 이용률 조회를 위한 **Insight Mode**로만 동작하며, 모든 온체인 write 트랜잭션은 Nile 테스트넷에서만 실행됩니다.

## 3. 브라우저 지갑 팝업 승인 (Human-in-the-Loop)
- **상태**: Web3 보안 원칙상 지갑 자동 서명(Auto-signing)이나 비밀키 대리 서명은 불가합니다.
- **대응**: 사용자가 TronLink 팝업에서 직접 'Sign' 버튼을 클릭해야 하며, 테스트 환경에서는 이를 위한 명확한 상태 안내 및 Mock/Manual checklist를 제공합니다.

## 4. 인센티브 APY의 변동성
- **상태**: JustLend 마이닝 보상 및 특별 인센티브는 DAO 거버넌스 및 재단 정책에 따라 조기 종료되거나 비율이 변경될 수 있습니다.
- **대응**: 배분 엔진은 확정적 Base Yield와 변동성 Incentive Yield를 엄격히 분리하여 표시하며, 인센티브 소멸을 가정한 리플레이 시나리오 및 리밸런싱 트리거를 제공합니다.
