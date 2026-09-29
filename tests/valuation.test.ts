import { describe, expect, it } from "vitest";
import { JUSTLEND_MAINNET_CONTRACTS } from "../src/lib/integrations/justlend/contracts";
import { normalizeJustLendToken } from "../src/lib/integrations/justlend/normalize";
import { RawJustLendTokenSchema } from "../src/lib/integrations/justlend/schemas";
import { getHoldingValue, hasFreshMainnetValuation, valueUserDeclaredHoldings, JUSTLEND_VALUATION_SOURCE } from "../src/domain/allocation/valuation";

const NOW = Date.parse("2026-09-29T00:00:00.000Z");
const FETCHED_AT = new Date(NOW).toISOString();

function liveMarket(asset: "TRX" | "USDT" | "USDD", price: string, fetchedAt = FETCHED_AT) {
  const contract = asset === "TRX"
    ? JUSTLEND_MAINNET_CONTRACTS.jTokens.jTRX
    : asset === "USDT"
      ? JUSTLEND_MAINNET_CONTRACTS.jTokens.jUSDT
      : JUSTLEND_MAINNET_CONTRACTS.jTokens.jUSDD;
  const underlying = asset === "TRX"
    ? ""
    : asset === "USDT"
      ? JUSTLEND_MAINNET_CONTRACTS.usdtToken
      : JUSTLEND_MAINNET_CONTRACTS.usddToken;
  const raw = RawJustLendTokenSchema.parse({
    address: contract.base58,
    symbol: contract.symbol,
    underlyingSymbol: asset,
    underlyingAddress: underlying,
    underlyingDecimal: contract.underlyingDecimals,
    underlyingPriceInTrx: price,
    supplyRate: "0.01",
    cash: "1000000",
    totalBorrows: "2000000",
  });
  return normalizeJustLendToken(raw, fetchedAt, "LIVE_MAINNET")!;
}

describe("JustLend USDT-equivalent valuation", () => {
  it("parses underlyingPriceInTrx and derives declared TRX value in USDT-equivalent", () => {
    const trx = liveMarket("TRX", "1");
    const usdt = liveMarket("USDT", "2.5");
    const [valued] = valueUserDeclaredHoldings([{ asset: "TRX", amount: "2000" }], [trx, usdt], NOW);

    expect(trx.underlyingPriceInTrx).toBe("1");
    expect(valued.valuation).toMatchObject({
      asset: "TRX",
      amount: "2000",
      value: "800",
      denomination: "USDT",
      source: JUSTLEND_VALUATION_SOURCE,
      fetchedAt: FETCHED_AT,
      reality: "LIVE_MAINNET",
      stale: false,
    });
    expect(valued.valuation?.derivation).toContain("USDT-equivalent");
    expect(getHoldingValue(valued, NOW)).toBe("800");
  });

  it("keeps the resulting denomination explicitly USDT-equivalent, never USD", () => {
    const [valued] = valueUserDeclaredHoldings(
      [{ asset: "USDD", amount: "100" }],
      [liveMarket("USDD", "2.4"), liveMarket("USDT", "2.4")],
      NOW,
    );
    expect(valued.valuation?.denomination).toBe("USDT");
    expect(valued.valuation?.value).toBe("100");
  });

  it.each(["0", "not-a-price"])("marks an invalid USDT reference price (%s) unavailable", (price) => {
    const [valued] = valueUserDeclaredHoldings(
      [{ asset: "TRX", amount: "10" }],
      [liveMarket("TRX", "1"), liveMarket("USDT", price)],
      NOW,
    );
    expect(valued.valuation?.reality).toBe("UNAVAILABLE");
    expect(valued.valuation?.value).toBeUndefined();
    expect(getHoldingValue(valued, NOW)).toBeNull();
  });

  it("does not value a holding when its price is missing or from a different snapshot", () => {
    const [missing] = valueUserDeclaredHoldings(
      [{ asset: "TRX", amount: "10" }],
      [liveMarket("USDT", "2.5")],
      NOW,
    );
    const [inconsistent] = valueUserDeclaredHoldings(
      [{ asset: "TRX", amount: "10" }],
      [liveMarket("TRX", "1", new Date(NOW - 1_000).toISOString()), liveMarket("USDT", "2.5")],
      NOW,
    );
    expect(missing.valuation?.reality).toBe("UNAVAILABLE");
    expect(inconsistent.valuation?.reality).toBe("UNAVAILABLE");
  });

  it("marks old market data stale and excludes it from the usable valuation", () => {
    const oldTimestamp = new Date(NOW - 5 * 60 * 1000 - 1).toISOString();
    const [valued] = valueUserDeclaredHoldings(
      [{ asset: "TRX", amount: "10" }],
      [liveMarket("TRX", "1", oldTimestamp), liveMarket("USDT", "2.5", oldTimestamp)],
      NOW,
    );
    expect(valued.valuation?.stale).toBe(true);
    expect(valued.valuation?.value).toBeUndefined();
    expect(hasFreshMainnetValuation({ holdings: [valued], horizonDays: 1, minimumLiquidUsdtEquivalent: "0", riskLevel: "LOW", maxVolatileExposurePct: "1", goal: "BALANCED", missingFields: [], assumptions: [] }, NOW)).toBe(false);
  });

  it("rejects future timestamps and prevents divide-by-zero conversion", () => {
    const [future] = valueUserDeclaredHoldings(
      [{ asset: "TRX", amount: "10" }],
      [liveMarket("TRX", "1", new Date(NOW + 1).toISOString()), liveMarket("USDT", "2.5", new Date(NOW + 1).toISOString())],
      NOW,
    );
    const [zeroReference] = valueUserDeclaredHoldings(
      [{ asset: "TRX", amount: "10" }],
      [liveMarket("TRX", "1"), liveMarket("USDT", "0")],
      NOW,
    );
    expect(future.valuation?.reality).toBe("UNAVAILABLE");
    expect(zeroReference.valuation?.value).toBeUndefined();
    expect(getHoldingValue(zeroReference, NOW)).toBeNull();
  });

  it("rejects a zero value attached to a positive holding", () => {
    expect(getHoldingValue({
      asset: "TRX",
      amount: "1",
      valuation: {
        asset: "TRX",
        amount: "1",
        value: "0",
        denomination: "USDT",
        source: JUSTLEND_VALUATION_SOURCE,
        fetchedAt: FETCHED_AT,
        reality: "LIVE_MAINNET",
        stale: false,
      },
    }, NOW)).toBeNull();
  });
});
