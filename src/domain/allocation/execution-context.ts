import { AllocationPlan, AssetValuation, EvidenceReality, Holding, NeedsProfile, YieldOpportunity } from "./types";
import { valueUserDeclaredHoldings } from "./valuation";
import type { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";

export type ExecutionActionType = "SUPPLY" | "REDEEM";
export type ExecutionRiskDirection = "INCREASE_EXPOSURE" | "DECREASE_EXPOSURE";
export type ExecutionEvidenceItem = { fetchedAt: string | null; reality: EvidenceReality };

export interface ExecutionEvidenceRefreshResult {
  opportunities: YieldOpportunity[];
  usddEvidence: UsddProtocolEvidence | null;
}

export interface ExecutionEvidenceContext {
  profile: NeedsProfile;
  marketEvidence: ExecutionEvidenceItem[];
  valuationEvidence: Array<{ holding: Holding; valuation: AssetValuation | null | undefined }>;
  liveEvidenceFetchedAt: string | null;
}

export function executionRiskDirection(action: ExecutionActionType): ExecutionRiskDirection {
  return action === "SUPPLY" ? "INCREASE_EXPOSURE" : "DECREASE_EXPOSURE";
}

export async function getPreSignExecutionEvidence(
  action: ExecutionActionType,
  current: ExecutionEvidenceRefreshResult,
  refresh: () => Promise<ExecutionEvidenceRefreshResult>
): Promise<ExecutionEvidenceRefreshResult> {
  return executionRiskDirection(action) === "INCREASE_EXPOSURE" ? refresh() : current;
}

export function buildExecutionEvidenceContext(params: {
  plan: AllocationPlan;
  profile: NeedsProfile;
  opportunities: YieldOpportunity[];
  usddEvidence: UsddProtocolEvidence | null;
  now?: number;
}): ExecutionEvidenceContext {
  const now = params.now ?? Date.now();
  const profile = {
    ...params.profile,
    holdings: valueUserDeclaredHoldings(params.profile.holdings, params.opportunities, now),
  };
  const planIds = new Set(params.plan.allocations.map((item) => item.productId));
  const marketEvidence = params.opportunities
    .filter((item) => planIds.has(item.id))
    .flatMap((item) => [
      { fetchedAt: item.fetchedAt, reality: item.reality },
      { fetchedAt: item.incentiveFetchedAt ?? null, reality: item.incentiveReality ?? "SNAPSHOT" },
    ]);

  if (params.plan.allocations.some((item) => item.asset === "USDD")) {
    marketEvidence.push({
      fetchedAt: params.usddEvidence?.fetchedAt ?? null,
      reality: params.usddEvidence?.reality ?? "SNAPSHOT",
    });
  }

  const evidenceTimes = marketEvidence
    .map((item) => item.fetchedAt ? Date.parse(item.fetchedAt) : Number.NaN)
    .filter((time) => Number.isFinite(time));

  return {
    profile,
    marketEvidence,
    valuationEvidence: profile.holdings.map((holding) => ({ holding, valuation: holding.valuation })),
    liveEvidenceFetchedAt: evidenceTimes.length ? new Date(Math.max(...evidenceTimes)).toISOString() : null,
  };
}

export function executionMarketEvidenceIsFresh(
  evidence: ExecutionEvidenceItem[],
  now: number = Date.now(),
  freshnessMs: number = 5 * 60 * 1000
): boolean {
  return evidence.length > 0 && evidence.every((item) => {
    const fetchedAt = item.fetchedAt ? Date.parse(item.fetchedAt) : Number.NaN;
    return item.reality === "LIVE_MAINNET" && Number.isFinite(fetchedAt) &&
      now >= fetchedAt && now - fetchedAt <= freshnessMs;
  });
}
