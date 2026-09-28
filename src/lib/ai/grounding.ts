import { Holding } from "@/domain/allocation/types";

const SUPPORTED_ASSETS = ["USDD", "USDT", "TRX", "sTRX", "JST", "SUN", "BTT"] as const;
const ASSET_ALTERNATION = SUPPORTED_ASSETS.join("|");

function parsePositiveAmount(value: string): string | null {
  const normalized = value.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? normalized : null;
}

/** Extracts balances only from an explicit user quantity or a supplied wallet read. */
export function extractGroundedHoldings(
  userInput: string,
  walletHoldings: Array<{ asset: string; amount: string }> = []
): Holding[] {
  const grounded = new Map<string, Holding>();
  for (const holding of walletHoldings) {
    const amount = parsePositiveAmount(holding.amount);
    if (amount && SUPPORTED_ASSETS.some((asset) => asset.toUpperCase() === holding.asset.toUpperCase())) {
      grounded.set(holding.asset.toUpperCase(), { asset: holding.asset.toUpperCase(), amount });
    }
  }

  const pattern = new RegExp(`(?:^|[^\\d.,])([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(${ASSET_ALTERNATION})\\b`, "gi");
  for (const match of userInput.matchAll(pattern)) {
    const asset = match[2].toUpperCase();
    const amount = parsePositiveAmount(match[1]);
    if (amount && !grounded.has(asset)) grounded.set(asset, { asset, amount });
  }
  return [...grounded.values()];
}
