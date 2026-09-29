import { Holding } from "@/domain/allocation/types";
import { Decimal } from "@/lib/math/decimal";

const SUPPORTED_ASSETS = ["USDD", "USDT", "TRX", "sTRX", "JST", "SUN", "BTT"] as const;
const ASSET_ALTERNATION = SUPPORTED_ASSETS.join("|");

function parsePositiveAmount(value: string): string | null {
  const normalized = value.replace(/,/g, "");
  try {
    const amount = new Decimal(normalized);
    return amount.isFinite() && amount.gt(0) ? normalized : null;
  } catch {
    return null;
  }
}

/** Extracts only hypothetical planning quantities explicitly supplied in user text. */
export function extractGroundedHoldings(userInput: string): Holding[] {
  const grounded = new Map<string, Holding>();

  const pattern = new RegExp(`(?:^|[^\\d.,])([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(${ASSET_ALTERNATION})\\b`, "gi");
  for (const match of userInput.matchAll(pattern)) {
    const asset = match[2].toUpperCase();
    const amount = parsePositiveAmount(match[1]);
    if (amount) grounded.set(asset, { asset, amount, origin: "USER_DECLARED" });
  }
  return [...grounded.values()];
}
