import { describe, it, expect } from "vitest";
import { normalizeJustLendToken, normalizeJustLendMarketList } from "../src/lib/integrations/justlend/normalize";
import { RawJustLendToken } from "../src/lib/integrations/justlend/schemas";
import { JUSTLEND_FALLBACK_FIXTURE } from "../src/lib/integrations/justlend/fixture";
import { fetchJustLendMarkets } from "../src/lib/integrations/justlend/client";
import { fetchUsddEvidence } from "../src/lib/integrations/usdd/client";

describe("JustLend Integration & Normalization", () => {
  it("normalizes a raw jTRX market and marks it as executable on Nile", () => {
    const rawToken: RawJustLendToken = {
      address: "TE2RzoSV3wFK99w6J9UnnZ4vLfXYoxvRwP",
      symbol: "jTRX",
      underlyingSymbol: "TRX",
      underlyingAddress: "",
      underlyingDecimal: 6,
      supplyRate: "0.003170",
      borrowRate: "0.043300",
      exchangeRate: "0.0105",
      cash: "2000000",
      totalBorrows: "180000",
      totalSupply: "200000000",
      reserves: "38000",
    };

    const opp = normalizeJustLendToken(rawToken);
    expect(opp).not.toBeNull();
    expect(opp?.asset).toBe("TRX");
    expect(opp?.executable).toBe(true);
    expect(opp?.executionNetwork).toBe("NILE");
    expect(opp?.nileContractAddress).toBe("TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq");
    expect(opp?.baseApy).toBe("0.003170");
    expect(opp?.totalApy).toBeNull();
    expect(opp?.incentiveApy).toBeNull();
    expect(opp?.reality).toBe("SNAPSHOT");
    expect(opp?.evidenceTerms).toContain("variable by market utilization");
  });

  it("filters out legacy markets ending with OLD", () => {
    const legacyToken: RawJustLendToken = {
      address: "TX7kybeP6UwTBRHLNPYmswFESHfyjm9bAS",
      symbol: "jUSDDOLD",
      underlyingSymbol: "USDDOLD",
      underlyingAddress: "",
      underlyingDecimal: 18,
      supplyRate: "0",
      borrowRate: "0",
      exchangeRate: "1",
      cash: "0",
      totalBorrows: "0",
      totalSupply: "0",
      reserves: "0",
    };

    const opp = normalizeJustLendToken(legacyToken);
    expect(opp).toBeNull();
  });

  it("normalizes fallback fixture list with at least jTRX, jUSDD, and jUSDT", () => {
    const markets = normalizeJustLendMarketList(
      JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
    );
    expect(markets.length).toBeGreaterThanOrEqual(3);
    const symbols = markets.map((m) => m.asset);
    expect(symbols).toContain("TRX");
    expect(symbols).toContain("USDD");
    expect(symbols).toContain("USDT");
  });

  it("keeps mining APY unknown unless the separate source is successfully observed", () => {
    const jUsdd = JUSTLEND_FALLBACK_FIXTURE.data.tokenList.find((token) => token.symbol === "jUSDD") as RawJustLendToken;
    const unavailable = normalizeJustLendToken(jUsdd, "2026-09-29T00:00:00.000Z", "LIVE_MAINNET");
    expect(unavailable?.incentiveApy).toBeNull();
    expect(unavailable?.totalApy).toBeNull();
    expect(unavailable?.incentiveFetchedAt).toBeNull();

    const observed = normalizeJustLendToken(
      jUsdd,
      "2026-09-29T00:00:00.000Z",
      "LIVE_MAINNET",
      { [jUsdd.address]: { USDD: "0.04021273" } },
      "2026-09-29T00:00:02.000Z"
    );
    expect(observed?.incentiveApy).toBe("0.040213");
    expect(observed?.totalApy).toBe((Number(observed?.baseApy) + 0.040213).toFixed(6));
    expect(observed?.incentiveSourceUrl).toBe("https://openapi.just.network/mining/apy");
    expect(observed?.incentiveFetchedAt).toBe("2026-09-29T00:00:02.000Z");
    expect(observed?.incentiveReality).toBe("LIVE_MAINNET");

    const noActiveMining = normalizeJustLendToken(
      jUsdd,
      "2026-09-29T00:00:00.000Z",
      "LIVE_MAINNET",
      {},
      "2026-09-29T00:00:02.000Z"
    );
    expect(noActiveMining?.incentiveApy).toBe("0.000000");
    expect(noActiveMining?.totalApy).toBe(noActiveMining?.baseApy);
  });

  it("fetches market data and returns valid YieldOpportunity array", async () => {
    const res = await fetchJustLendMarkets();
    expect(res.markets.length).toBeGreaterThan(0);
    expect(res.source).toMatch(/live|cache|fallback/);
    for (const market of res.markets.filter((item) => item.incentiveApy !== null)) {
      expect(market.incentiveReality).toBe("LIVE_MAINNET");
      expect(market.incentiveFetchedAt).toBeTruthy();
      expect(market.incentiveSourceUrl).toBe("https://openapi.just.network/mining/apy");
      expect(Number(market.totalApy)).toBeCloseTo(Number(market.baseApy) + Number(market.incentiveApy), 6);
    }
  });
});

describe("USDD Evidence Integration", () => {
  it("fetches USDD evidence with valid collateral ratio and TVL", async () => {
    const evidence = await fetchUsddEvidence();
    expect(evidence.totalSupplyUsd).toContain("$");
    expect(evidence.totalCollateralUsd).toContain("$");
    expect(evidence.collateralRatioPct).toContain("%");
    expect(evidence.vaults.length).toBeGreaterThan(0);
  });
});
