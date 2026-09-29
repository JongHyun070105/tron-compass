import {
  InvestmentRule,
  InvestmentRuleType,
  NeedsProfile,
  AllocationLeg,
  YieldOpportunity,
} from "./types";
import { evaluateHardConstraints } from "./constraints";

type DraftRule = Pick<InvestmentRule, "id" | "type" | "predicate" | "value">;

function draftRules(profile: NeedsProfile): DraftRule[] {
  return [
    {
      id: "R1",
      type: "MINIMUM_LIQUIDITY",
      predicate: "GTE",
      value: profile.minimumLiquidUsdtEquivalent,
    },
    {
      id: "R2",
      type: "MAX_VOLATILE_EXPOSURE",
      predicate: "LTE",
      value: profile.maxVolatileExposurePct,
    },
    ...(profile.excludedAssets || []).map((asset, index) => ({
      id: `R${index + 3}`,
      type: "EXCLUDED_ASSET" as const,
      predicate: "NOT_IN" as const,
      value: asset,
    })),
  ];
}

export function buildInvestmentRules(
  profile: NeedsProfile,
  sourceQuote: string | null,
  confirmedAt: string,
  previousRules: InvestmentRule[] = []
): InvestmentRule[] {
  const oldRules = new Map(previousRules.map((rule) => [rule.id, rule]));

  return draftRules(profile).map((draft) => {
    const previous = oldRules.get(draft.id);
    const changed = previous && previous.value !== draft.value;
    return {
      ...draft,
      version: previous ? previous.version + (changed ? 1 : 0) : 1,
      sourceQuote: changed ? sourceQuote : previous?.sourceQuote ?? sourceQuote,
      confirmedAt: changed ? confirmedAt : previous?.confirmedAt ?? confirmedAt,
    };
  });
}

export function amendInvestmentRule(
  rule: InvestmentRule,
  amendment: { value: string; sourceQuote?: string | null; confirmedAt: string; effectiveUntil?: string | null }
): InvestmentRule {
  return {
    ...rule,
    value: amendment.value,
    sourceQuote: amendment.sourceQuote ?? null,
    confirmedAt: amendment.confirmedAt,
    effectiveUntil: amendment.effectiveUntil ?? null,
    version: rule.version + 1,
  };
}

export function getRuleForType(
  rules: InvestmentRule[] | undefined,
  type: InvestmentRuleType
): InvestmentRule | undefined {
  return rules?.find((rule) => rule.type === type);
}

export function evaluateDecisionRules(
  profile: NeedsProfile,
  totalCapitalUsdtEquivalent: string,
  allocations: AllocationLeg[],
  opportunities: YieldOpportunity[],
  now: number = Date.now()
) {
  return evaluateHardConstraints(profile, totalCapitalUsdtEquivalent, allocations, opportunities, now);
}
