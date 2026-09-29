import { AllocationPlan, EvidenceReality, InvestmentRule, NeedsProfile, YieldOpportunity } from "@/domain/allocation/types";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import { getRuleForType } from "@/domain/allocation/rules";
import { USDD_POLICY_THRESHOLDS } from "@/domain/allocation/usdd-signals";
import { hasFreshMainnetValuation } from "@/domain/allocation/valuation";
import { PlanExecutabilityClass } from "@/domain/allocation/executability";

export type AssumptionStatus = "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
export type AssumptionThresholdProvenance = "OFFICIAL" | "COMPASS_POLICY" | "USER_DEFINED" | "MARKET_SNAPSHOT";

export interface DecisionEvidenceItem {
  id: string;
  field: string;
  value: string | null;
  source: string;
  fetchedAt: string | null;
  terms: string | null;
  reality: EvidenceReality;
  observedReality?: EvidenceReality;
  blockNumber?: number | null;
}

export interface ScreenedOpportunity {
  opportunityId: string;
  item: string;
  scope: "PLANNING" | "EXECUTION";
  reason: string;
}

export interface DecisionAssumption {
  id: string;
  description: string;
  sourceField: string;
  predicate: "GTE" | "LTE" | "EQUALS";
  threshold: string;
  thresholdProvenance: AssumptionThresholdProvenance;
  status: AssumptionStatus;
  lastCheckedAt: string;
  reason?: string;
}

export interface DecisionAlternative {
  planId: string;
  allocations: AllocationPlan["allocations"];
  valuationStatus?: AllocationPlan["valuationStatus"];
  baseYield: string;
  incentiveYield: string | null;
  estimatedCost: string | null;
  exitCondition: string[];
  risks: string[];
  ruleEvaluation: AllocationPlan["constraintChecks"];
  executionReality: PlanExecutabilityClass | "NILE_EXECUTABLE" | "LIVE_DATA_ONLY" | "UNAVAILABLE";
}

export interface ApprovalShown {
  amount: string;
  estimatedFee: string;
  risks: string[];
  scope: string;
  network: string;
  contract: string;
  method: string;
}

export interface DecisionStopRecord {
  id: string;
  timestamp: string;
  stage: "PRE_SIGN" | "REVIEW" | "REBALANCE";
  ruleId: string | null;
  guardId: string | null;
  attemptedAction: string;
  attemptedAmount: string | null;
  reason: string;
  outcome: "STOPPED";
}

export interface DecisionReview {
  id: string;
  reviewedAt: string;
  title: string;
  mode: "LIVE" | "SIMULATED";
  assumptions: DecisionAssumption[];
  proposalPlanId: string | null;
}

export interface DecisionReceiptDraft {
  id: string;
  parentId?: string | null;
  createdAt: string;
  horizonDays: number | null;
  rules: { version: number; items: InvestmentRule[] };
  needsConfirmedAt: string | null;
  evidence: DecisionEvidenceItem[];
  screening: { included: ScreenedOpportunity[]; excluded: ScreenedOpportunity[] };
  alternatives: DecisionAlternative[];
  assumptions: DecisionAssumption[];
  selection: { planId: string; selectedAt: string | null };
  approval: { shown: ApprovalShown | null; signer?: string | null; approvedAt?: string | null };
}

export interface DecisionReceipt extends DecisionReceiptDraft {
  parentId: string | null;
  approval: { shown: ApprovalShown | null; signer: string | null; approvedAt: string | null };
  execution: {
    network: string | null;
    contract: string | null;
    method: string | null;
    callValue: string | null;
    amountAsset?: string | null;
    amount?: string | null;
    amountRaw?: string | null;
    txHash: string | null;
    blockNumber: number | null;
    contractResult?: string | null;
    result: "PREPARED" | "AWAITING_SIGNATURE" | "BROADCAST" | "PENDING" | "CONFIRMED" | "FAILED" | "SIMULATED";
    energyUsed: number | null;
    netUsed: number | null;
    actualFee: string | null;
    balanceBefore: string | null;
    balanceAfter: string | null;
    trxBalanceBefore?: string | null;
    trxBalanceAfter?: string | null;
    jTrxBalanceBefore?: string | null;
    jTrxBalanceAfter?: string | null;
    trxBalanceDelta?: string | null;
    jTrxBalanceDelta?: string | null;
    balanceReality?: "NILE_LIVE" | null;
    balanceAction?: "SUPPLY" | "REDEEM" | null;
    balanceEvidenceStatus?: "PENDING" | "VERIFIED" | "STALE" | "UNAVAILABLE";
  };
  stops: DecisionStopRecord[];
  integrity: { engineVersion: string; decisionHash: string };
  reviews: DecisionReview[];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

export function canonicalizeDecisionJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function hashPayload(receipt: DecisionReceipt | DecisionReceiptDraft) {
  return {
    horizonDays: receipt.horizonDays,
    rules: receipt.rules,
    evidence: receipt.evidence,
    screening: receipt.screening,
    alternatives: receipt.alternatives,
    assumptions: receipt.assumptions,
    selection: receipt.selection,
    approvalShown: receipt.approval.shown,
  };
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeDecisionJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createDecisionReceipt(draft: DecisionReceiptDraft): Promise<DecisionReceipt> {
  const receipt: DecisionReceipt = {
    ...draft,
    parentId: draft.parentId ?? null,
    approval: {
      shown: draft.approval.shown,
      signer: draft.approval.signer ?? null,
      approvedAt: draft.approval.approvedAt ?? null,
    },
    execution: {
      network: null,
      contract: null,
      method: null,
      callValue: null,
      amountAsset: null,
      amount: null,
      amountRaw: null,
      txHash: null,
      blockNumber: null,
      contractResult: null,
      result: "PREPARED",
      energyUsed: null,
      netUsed: null,
      actualFee: null,
      balanceBefore: null,
      balanceAfter: null,
      trxBalanceBefore: null,
      trxBalanceAfter: null,
      jTrxBalanceBefore: null,
      jTrxBalanceAfter: null,
      trxBalanceDelta: null,
      jTrxBalanceDelta: null,
      balanceReality: null,
      balanceAction: null,
      balanceEvidenceStatus: undefined,
    },
    stops: [],
    integrity: { engineVersion: "decision-engine/1.0.0", decisionHash: "" },
    reviews: [],
  };
  receipt.integrity.decisionHash = await sha256(hashPayload(receipt));
  return receipt;
}

export async function verifyDecisionHash(receipt: DecisionReceipt): Promise<boolean> {
  return (await sha256(hashPayload(receipt))) === receipt.integrity.decisionHash;
}

export async function refreshDecisionReceiptIntegrity(receipt: DecisionReceipt): Promise<DecisionReceipt> {
  return {
    ...receipt,
    integrity: {
      ...receipt.integrity,
      decisionHash: await sha256(hashPayload(receipt)),
    },
  };
}

export async function createChildDecisionReceipt(
  parent: DecisionReceipt,
  draft: DecisionReceiptDraft
): Promise<DecisionReceipt> {
  return createDecisionReceipt({ ...draft, parentId: parent.id });
}

export function makeStopRecord(input: Omit<DecisionStopRecord, "id" | "outcome">): DecisionStopRecord {
  return {
    ...input,
    id: `stop-${input.timestamp}-${input.guardId ?? input.ruleId ?? "guard"}`,
    outcome: "STOPPED",
  };
}

export function buildDecisionEvidence(
  opportunities: YieldOpportunity[],
  usddEvidence: UsddProtocolEvidence | null,
  snapshotAt: string,
  profile?: NeedsProfile
): DecisionEvidenceItem[] {
  const items: DecisionEvidenceItem[] = [];
  for (const holding of profile?.holdings ?? []) {
    const valuation = holding.valuation;
    items.push({
      id: `holding-${holding.asset.toLowerCase()}-origin`,
      field: `portfolio.holdings.${holding.asset}.origin`,
      value: holding.origin ?? "USER_DECLARED",
      source: "TRON Compass planning input",
      fetchedAt: null,
      terms: holding.origin === "USER_DECLARED"
        ? "Hypothetical planning quantity explicitly supplied by the user; it is not a connected-wallet balance."
        : holding.origin === "NILE_LIVE"
          ? "Nile testnet balance is execution capacity only and is excluded from the Mainnet planning portfolio."
          : "Synthetic demo fixture; not a wallet observation.",
      reality: "SNAPSHOT",
      observedReality: holding.origin ?? "USER_DECLARED",
    });
    items.push({
      id: `holding-${holding.asset.toLowerCase()}-usdt-equivalent-valuation`,
      field: `portfolio.holdings.${holding.asset}.usdtEquivalentValue`,
      value: valuation?.value ?? null,
      source: valuation?.source ?? "UNAVAILABLE",
      fetchedAt: valuation?.fetchedAt ?? null,
      terms: valuation?.derivation ?? (valuation
        ? "USDT-equivalent holding value; inspect its source, freshness and reality label."
        : "No live USDT-equivalent valuation source is recorded; reserve and exposure calculations are unavailable."),
      reality: "SNAPSHOT",
      observedReality: valuation?.reality ?? "UNAVAILABLE",
    });
  }
  for (const opportunity of opportunities) {
    const reality = opportunity.reality ?? "SNAPSHOT";
    const baseField = `${opportunity.id}.baseApy`;
    items.push({
      id: `${opportunity.id}-base-apy`,
      field: baseField,
      value: opportunity.baseApy,
      source: opportunity.sourceUrl,
      fetchedAt: opportunity.fetchedAt,
      terms: opportunity.evidenceTerms,
      reality: "SNAPSHOT",
      observedReality: reality,
    });
    items.push({
      id: `${opportunity.id}-incentive-apy`,
      field: `${opportunity.id}.incentiveApy`,
      value: opportunity.incentiveApy,
      source: opportunity.incentiveSourceUrl ?? "UNAVAILABLE",
      fetchedAt: opportunity.incentiveFetchedAt ?? null,
      terms: opportunity.incentiveEvidenceTerms ?? (opportunity.incentiveApy === null
        ? "The separate incentive reward feed was not observed; value unavailable."
        : "Reward rate supplied by the linked reward source."),
      reality: "SNAPSHOT",
      observedReality: opportunity.incentiveReality ?? undefined,
    });
    const totalFetchedTimes = [opportunity.fetchedAt, opportunity.incentiveFetchedAt ?? null]
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter(Number.isFinite);
    const totalObservedReality: EvidenceReality | undefined = opportunity.totalApy === null
      ? undefined
      : opportunity.reality === "SIMULATED" || opportunity.incentiveReality === "SIMULATED"
        ? "SIMULATED"
        : opportunity.reality === "LIVE_MAINNET" && opportunity.incentiveReality === "LIVE_MAINNET"
          ? "LIVE_MAINNET"
          : "SNAPSHOT";
    items.push({
      id: `${opportunity.id}-total-apy`,
      field: `${opportunity.id}.totalApy`,
      value: opportunity.totalApy,
      source: opportunity.sourceUrl,
      fetchedAt: totalFetchedTimes.length === 2
        ? new Date(Math.min(...totalFetchedTimes)).toISOString()
        : null,
      terms: `Derived Total APY = baseApy + incentiveApy. Base source: ${opportunity.sourceUrl}; incentive source: ${opportunity.incentiveSourceUrl ?? "unavailable"}. The separate evidence entries retain each source and fetch time.`,
      reality: "SNAPSHOT",
      observedReality: totalObservedReality,
    });
    items.push({
      id: `${opportunity.id}-pool-capacity-source-units`,
      field: `${opportunity.id}.poolCapacitySourceUnits`,
      value: opportunity.poolCapacitySourceUnits,
      source: opportunity.sourceUrl,
      fetchedAt: opportunity.fetchedAt,
      terms: "Sum of source-reported cash and totalBorrows. Source units are not converted to USD by this adapter.",
      reality: "SNAPSHOT",
      observedReality: reality,
    });
    if (opportunity.utilizationPct !== undefined) {
      items.push({
        id: `${opportunity.id}-utilization`,
        field: `${opportunity.id}.utilizationPct`,
        value: opportunity.utilizationPct,
        source: opportunity.sourceUrl,
        fetchedAt: opportunity.fetchedAt,
        terms: "Compass derives totalBorrows / (cash + totalBorrows) from the JustLend response fields.",
        reality: "SNAPSHOT",
        observedReality: reality,
      });
    }
    items.push({
      id: `${opportunity.id}-entry-cost-estimate`,
      field: `${opportunity.id}.estimatedEntryCostUsdtEquivalent`,
      value: opportunity.estimatedEntryCostUsdtEquivalent,
      source: "TRON Compass policy estimate",
      fetchedAt: null,
      terms: "Compass policy estimate in USDT-equivalent; not an observed transaction fee or USD conversion.",
      reality: "SNAPSHOT",
      observedReality: "SNAPSHOT",
    });
    items.push({
      id: `${opportunity.id}-exit-cost-estimate`,
      field: `${opportunity.id}.estimatedExitCostUsdtEquivalent`,
      value: opportunity.estimatedExitCostUsdtEquivalent,
      source: "TRON Compass policy estimate",
      fetchedAt: null,
      terms: "Compass policy estimate in USDT-equivalent; not an observed transaction fee or USD conversion.",
      reality: "SNAPSHOT",
      observedReality: "SNAPSHOT",
    });
  }
  if (usddEvidence) {
    const reality = usddEvidence.reality ?? (usddEvidence.source === "live" ? "LIVE_MAINNET" : "SNAPSHOT");
    items.push({
      id: "usdd-collateral-ratio",
      field: "usdd.collateralRatioPct",
      value: usddEvidence.collateralRatioPct,
      source: usddEvidence.sourceUrl ?? "USDD Data Platform",
      fetchedAt: usddEvidence.fetchedAt,
      terms: "Derived collateral ratio: total collateral divided by total supply.",
      reality: "SNAPSHOT",
      observedReality: reality,
    });
  }
  return items.map((item) => ({ ...item, terms: item.terms || `Frozen at ${snapshotAt}.` }));
}

export function buildDecisionScreening(
  profile: NeedsProfile,
  opportunities: YieldOpportunity[],
  plans: AllocationPlan[]
): { included: ScreenedOpportunity[]; excluded: ScreenedOpportunity[] } {
  const included: ScreenedOpportunity[] = [];
  const excluded: ScreenedOpportunity[] = [];
  const plannedIds = new Set(plans.flatMap((plan) => plan.allocations.map((leg) => leg.productId)));
  const excludedAssets = new Set(profile.excludedAssets ?? []);

  for (const opportunity of opportunities) {
    if (plannedIds.has(opportunity.id)) {
      included.push({
        opportunityId: opportunity.id,
        item: opportunity.product,
        scope: "PLANNING",
        reason: "Included in at least one deterministic plan.",
      });
    } else {
      let reason = "No allocation passed the confirmed holdings and risk rules.";
      if (excludedAssets.has(opportunity.asset)) {
        const rule = profile.investmentRules?.find((item) => item.type === "EXCLUDED_ASSET" && item.value === opportunity.asset);
        reason = `${rule?.id ?? "Investment rule"} excludes ${opportunity.asset}.`;
      } else if (opportunity.asset === "USDD" && opportunity.reality === "SNAPSHOT") {
        reason = "USDD condition is SNAPSHOT; current Compass policy excludes new allocation until live evidence returns.";
      } else if (!profile.holdings.some((holding) => holding.asset === opportunity.asset)) {
        reason = "No matching asset holding is recorded in My Rules inputs.";
      }
      excluded.push({ opportunityId: opportunity.id, item: opportunity.product, scope: "PLANNING", reason });
    }

    if (opportunity.executabilityClass !== "NILE_EXECUTABLE") {
      excluded.push({
        opportunityId: opportunity.id,
        item: opportunity.product,
        scope: "EXECUTION",
        reason: "LIVE_DATA_ONLY — no supported Nile execution route.",
      });
    }
  }
  return { included, excluded };
}

export function buildDecisionAssumptions(
  profile: NeedsProfile,
  plan: AllocationPlan,
  opportunities: YieldOpportunity[],
  usddEvidence: UsddProtocolEvidence | null,
  checkedAt: string
): DecisionAssumption[] {
  const assumptions: DecisionAssumption[] = [];
  let nextId = 1;
  const checkedAtMs = Date.parse(checkedAt);
  const portfolioUsdtEquivalentValuationFresh = hasFreshMainnetValuation(profile, checkedAtMs, 5 * 60 * 1000);
  const isFreshLive = (reality: string | null | undefined, fetchedAt: string | null) => {
    const fetchedAtMs = fetchedAt ? Date.parse(fetchedAt) : Number.NaN;
    return reality === "LIVE_MAINNET" && Number.isFinite(checkedAtMs) &&
      Number.isFinite(fetchedAtMs) && fetchedAtMs <= checkedAtMs &&
      checkedAtMs - fetchedAtMs <= 5 * 60 * 1000;
  };
  for (const leg of plan.allocations) {
    const opportunity = opportunities.find((item) => item.id === leg.productId);
    if (!opportunity) continue;
    assumptions.push({
      id: `A${nextId++}`,
      description: `${leg.productName} base APY remains at or above the value recorded for this decision.`,
      sourceField: `${opportunity.id}.baseApy`,
      predicate: "GTE",
      threshold: leg.baseApy,
      thresholdProvenance: "MARKET_SNAPSHOT",
      status: isFreshLive(opportunity.reality, opportunity.fetchedAt) ? "PASS" : "UNKNOWN",
      lastCheckedAt: checkedAt,
      reason: isFreshLive(opportunity.reality, opportunity.fetchedAt) ? undefined : "Evidence is not a fresh live mainnet observation.",
    });
    if (leg.incentiveApy !== null && Number(leg.incentiveApy) > 0) {
      const incentiveEvidenceFresh = isFreshLive(
        opportunity.incentiveReality,
        opportunity.incentiveFetchedAt ?? null
      );
      assumptions.push({
        id: `A${nextId++}`,
        description: `${leg.productName} incentive reward remains at or above the recorded value.`,
        sourceField: `${opportunity.id}.incentiveApy`,
        predicate: "GTE",
        threshold: leg.incentiveApy,
        thresholdProvenance: "MARKET_SNAPSHOT",
        status: incentiveEvidenceFresh ? "PASS" : "UNKNOWN",
        lastCheckedAt: checkedAt,
        reason: incentiveEvidenceFresh ? undefined : "Incentive evidence is not a fresh live mainnet observation.",
      });
    }
  }
  const liquidityRule = getRuleForType(profile.investmentRules, "MINIMUM_LIQUIDITY");
  if (liquidityRule) {
    const liquid = Number(plan.liquidReserveUsdtEquivalent);
    const required = Number(liquidityRule.value);
    assumptions.push({
      id: `A${nextId++}`,
      description: "The selected plan continues to preserve the user-confirmed liquid reserve.",
      sourceField: "plan.liquidReserveUsdtEquivalent",
      predicate: "GTE",
      threshold: liquidityRule.value,
      thresholdProvenance: "USER_DEFINED",
      status: !portfolioUsdtEquivalentValuationFresh
        ? "UNKNOWN"
        : Number.isFinite(liquid) && liquid >= required ? "PASS" : "FAIL",
      lastCheckedAt: checkedAt,
      reason: portfolioUsdtEquivalentValuationFresh
        ? undefined
        : "Portfolio USDT-equivalent valuations are not fresh LIVE MAINNET evidence.",
    });
  }
  if (plan.allocations.some((leg) => leg.asset === "USDD") && usddEvidence?.collateralRatioPct) {
    assumptions.push({
      id: `A${nextId}`,
      description: "USDD collateral ratio does not fall below the recorded evidence for this decision.",
      sourceField: "usdd.collateralRatioPct",
      predicate: "GTE",
      threshold: String(USDD_POLICY_THRESHOLDS.healthy),
      thresholdProvenance: "COMPASS_POLICY",
      status: isFreshLive(usddEvidence.reality, usddEvidence.fetchedAt) ? "PASS" : "UNKNOWN",
      lastCheckedAt: checkedAt,
    });
  }
  return assumptions;
}

function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value.replace(/[%,$]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateDecisionAssumptions(
  assumptions: DecisionAssumption[],
  currentEvidence: DecisionEvidenceItem[],
  evaluatedAt: string,
  freshnessMs = 5 * 60 * 1000
): DecisionAssumption[] {
  const currentByField = new Map(currentEvidence.map((item) => [item.field, item]));
  const evaluationTime = Date.parse(evaluatedAt);
  return assumptions.map((assumption) => {
    const evidence = currentByField.get(assumption.sourceField);
    if (!evidence || evidence.value === null) {
      return { ...assumption, status: "UNKNOWN", lastCheckedAt: evaluatedAt, reason: "Required evidence is unavailable." };
    }
    const fetchedAt = evidence.fetchedAt ? Date.parse(evidence.fetchedAt) : Number.NaN;
    const isSimulation = evidence.reality === "SIMULATED" || evidence.observedReality === "SIMULATED";
    if (!isSimulation && (!Number.isFinite(fetchedAt) || !Number.isFinite(evaluationTime) || evaluationTime - fetchedAt > freshnessMs || fetchedAt > evaluationTime)) {
      return { ...assumption, status: "UNKNOWN", lastCheckedAt: evaluatedAt, reason: "Required evidence is UNKNOWN / STALE." };
    }
    const actual = parseNumeric(evidence.value);
    const threshold = parseNumeric(assumption.threshold);
    if (actual === null || threshold === null) {
      return { ...assumption, status: "UNKNOWN", lastCheckedAt: evaluatedAt, reason: "Evidence could not be checked numerically." };
    }
    const passed = assumption.predicate === "GTE"
      ? actual >= threshold
      : assumption.predicate === "LTE"
        ? actual <= threshold
        : actual === threshold;
    return {
      ...assumption,
      status: passed ? "PASS" : "FAIL",
      lastCheckedAt: evaluatedAt,
      reason: passed ? undefined : `Recorded threshold ${assumption.predicate} ${assumption.threshold}; current value ${evidence.value}.`,
    };
  });
}
