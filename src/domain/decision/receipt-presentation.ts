import { DecisionAlternative, DecisionEvidenceItem, DecisionReceipt } from "@/domain/decision/receipt";
import { Decimal } from "@/lib/math/decimal";
import { BalanceAction, validateBalanceEvidence } from "@/lib/tron/balance-evidence";

export function formatReceiptAmount(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "Unavailable";
  try {
    const amount = new Decimal(value);
    if (!amount.isFinite()) return "Unavailable";
    const formatted = amount.toFixed(decimals);
    return formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
  } catch {
    return "Unavailable";
  }
}

export function receiptAssetIds(options: DecisionAlternative[]): Set<string> {
  return new Set(options.flatMap((option) => option.allocations.map((leg) => leg.productId.toLowerCase())));
}

export function selectReceiptEvidence(receipt: DecisionReceipt, options: DecisionAlternative[]): DecisionEvidenceItem[] {
  const ids = receiptAssetIds(options);
  const selectedRuleContext = receipt.rules.items.some((rule) => /usdd/i.test(`${rule.value} ${rule.sourceQuote ?? ""}`));
  const selectedAssumptionContext = receipt.assumptions.some((item) => /usdd/i.test(`${item.sourceField} ${item.description}`));
  return receipt.evidence.filter((item) => {
    if (item.field.startsWith("portfolio.holdings.")) {
      const asset = item.field.split(".")[2]?.toLowerCase();
      return ids.has(asset) && item.field.endsWith(".usdtEquivalentValue");
    }
    if (item.field === "usdd.collateralRatioPct") return selectedRuleContext || selectedAssumptionContext;
    const asset = item.field.split(".")[0]?.toLowerCase();
    if (!ids.has(asset)) return false;
    return item.field.endsWith(".baseApy") || item.field.endsWith(".incentiveApy");
  });
}

export function getReceiptBalanceStatus(receipt: DecisionReceipt): "PENDING" | "VERIFIED" | "STALE" | "UNAVAILABLE" {
  const execution = receipt.execution;
  if (execution.balanceEvidenceStatus) return execution.balanceEvidenceStatus;
  const action = execution.balanceAction ?? (execution.amountAsset === "TRX" ? "SUPPLY" : execution.amountAsset === "jTRX" ? "REDEEM" : null);
  if (!action) return "UNAVAILABLE";
  return validateBalanceEvidence(action as BalanceAction, {
    trxBalance: execution.trxBalanceBefore ?? null,
    jTrxBalance: execution.jTrxBalanceBefore ?? null,
  }, {
    trxBalance: execution.trxBalanceAfter ?? null,
    jTrxBalance: execution.jTrxBalanceAfter ?? null,
  }).status;
}
