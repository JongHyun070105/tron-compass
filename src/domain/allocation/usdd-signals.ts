import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";

export type UsddHealthGrade = "HEALTHY" | "CAUTION" | "CRITICAL" | "STALE_FALLBACK";

export interface UsddDecisionSignal {
  grade: UsddHealthGrade;
  riskClass: UsddHealthGrade; // Alias for consistent test & rule access
  collateralRatioPct: number;
  priceRiskClass: "LOW" | "MEDIUM" | "HIGH";
  eligibleForConservativePlan: boolean;
  eligibleForYieldPlan: boolean;
  scoreBonus: number; // -20 to +10 adjustment
  reason: string;
  warningNotice?: string;
  isStaleOrFallback: boolean;
  isFallback: boolean;
}

/**
 * Standard thresholds based on TRON DAO Reserve and algorithmic peg design:
 * - >= 130%: Over-collateralized and safe (Health: HEALTHY, Risk: LOW)
 * - 110% - 129.9%: Mild caution (Health: CAUTION, Risk: MEDIUM, ineligible for conservative Plan A)
 * - < 110%: Critical under-collateralization (Health: CRITICAL, Risk: HIGH, excluded from all allocations)
 */
export function evaluateUsddDecisionSignal(
  evidence?: UsddProtocolEvidence | null
): UsddDecisionSignal {
  if (!evidence) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: 130.0,
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false,
      eligibleForYieldPlan: true,
      scoreBonus: -5,
      reason: "USDD 실시간 검증 데이터 부재로 보수적 안전 모드가 적용되었습니다.",
      warningNotice: "USDD 준비금 데이터 검증 대기 중 (안정형 편입 일시 제한)",
      isStaleOrFallback: true,
      isFallback: true,
    };
  }

  // Parse ratio (e.g. "148.20%" or "148.2")
  const evAny = evidence as any;
  const rawRatio = evidence.collateralRatioPct || evAny.collateralRatio || "130";
  const cleanedRatio = parseFloat(rawRatio.replace("%", "").trim());
  const ratio = isNaN(cleanedRatio) ? 130.0 : cleanedRatio;
  const isFallback = evidence.source === "fallback" || evAny.isFallback === true;

  if (isFallback) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: ratio,
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false,
      eligibleForYieldPlan: true,
      scoreBonus: -5,
      reason: `USDD 캐시 스냅샷 기반으로 보수적 안전 모드가 적용되었습니다 (${ratio.toFixed(1)}%).`,
      warningNotice: "USDD 최신 캐시 스냅샷 기반: 안정형 플랜 편입 일시 제한",
      isStaleOrFallback: true,
      isFallback: true,
    };
  }

  if (ratio >= 130.0) {
    return {
      grade: "HEALTHY",
      riskClass: "HEALTHY",
      collateralRatioPct: ratio,
      priceRiskClass: "LOW",
      eligibleForConservativePlan: true,
      eligibleForYieldPlan: true,
      scoreBonus: 5,
      reason: `TRON DAO Reserve 담보율(${ratio.toFixed(1)}%)이 안전 기준(130%)을 상회하여 건전합니다.`,
      isStaleOrFallback: false,
      isFallback: false,
    };
  }

  if (ratio >= 110.0) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: ratio,
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false, // Ineligible for conservative Plan A
      eligibleForYieldPlan: true,
      scoreBonus: -10,
      reason: `USDD 담보율(${ratio.toFixed(1)}%)이 권고 기준(130%)을 밑돌아 안정형 플랜 편입이 제한됩니다.`,
      warningNotice: "USDD 담보비율 주의 구간: 안정형 플랜 제외 및 균형형 제한 편입",
      isStaleOrFallback: false,
      isFallback: false,
    };
  }

  // < 110% Critical
  return {
    grade: "CRITICAL",
    riskClass: "CRITICAL",
    collateralRatioPct: ratio,
    priceRiskClass: "LOW",
    eligibleForConservativePlan: false,
    eligibleForYieldPlan: false,
    scoreBonus: -25,
    reason: `USDD 담보율(${ratio.toFixed(1)}%)이 임계치(110%) 미만으로 급감하여 신규 배분이 차단되었습니다.`,
    warningNotice: "경고: USDD 담보율 위험치 도달로 인한 신규 자산 배분 전면 중단",
    isStaleOrFallback: false,
    isFallback: false,
  };
}
