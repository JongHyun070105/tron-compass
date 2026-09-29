import { afterEach, describe, it, expect, vi } from "vitest";
import { normalizeJustLendToken, normalizeJustLendMarketList } from "../src/lib/integrations/justlend/normalize";
import { RawJustLendToken } from "../src/lib/integrations/justlend/schemas";
import { JUSTLEND_FALLBACK_FIXTURE } from "../src/lib/integrations/justlend/fixture";
import { fetchJustLendMarkets } from "../src/lib/integrations/justlend/client";
import { fetchUsddEvidence } from "../src/lib/integrations/usdd/client";
import {
  JUSTLEND_MARKETS_RESPONSE,
  JUSTLEND_MINING_RESPONSE,
  LIVE_FIXTURE_CAPTURED_AT,
  USDD_COLLATERAL_RESPONSE,
  USDD_OVERVIEW_RESPONSE,
} from "./fixtures/live-integrations";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it("normalizes captured JustLend responses with deterministic live evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(LIVE_FIXTURE_CAPTURED_AT));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/mining/apy")
        ? JUSTLEND_MINING_RESPONSE
        : JUSTLEND_MARKETS_RESPONSE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const res = await fetchJustLendMarkets({ forceRefresh: true });
    expect(res.markets.length).toBeGreaterThan(0);
    expect(res.source).toBe("live");
    expect(res.fetchedAt).toBe(LIVE_FIXTURE_CAPTURED_AT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://openapi.just.network/lend/jtoken",
      "https://openapi.just.network/mining/apy",
    ]);
    const trx = res.markets.find((market) => market.asset === "TRX");
    expect(trx?.underlyingPriceInTrx).toBe("1.000000000000000000000000000");
    expect(trx?.baseApy).toBe("0.003156");
    for (const market of res.markets.filter((item) => item.incentiveApy !== null)) {
      expect(market.incentiveReality).toBe("LIVE_MAINNET");
      expect(market.incentiveFetchedAt).toBe(LIVE_FIXTURE_CAPTURED_AT);
      expect(market.incentiveSourceUrl).toBe("https://openapi.just.network/mining/apy");
      expect(Number(market.totalApy)).toBeCloseTo(Number(market.baseApy) + Number(market.incentiveApy), 6);
    }
    const usdd = res.markets.find((market) => market.asset === "USDD");
    expect(usdd?.baseApy).toBe("0.000009");
    expect(usdd?.incentiveApy).toBe("0.039967");
    expect(usdd?.underlyingPriceInTrx).toBe("2.982502000000000");
  });
});

describe("USDD Evidence Integration", () => {
  it("normalizes captured USDD evidence with deterministic source timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(LIVE_FIXTURE_CAPTURED_AT));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("latest-collateral")
        ? USDD_COLLATERAL_RESPONSE
        : USDD_OVERVIEW_RESPONSE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const evidence = await fetchUsddEvidence();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(evidence.totalSupplyUsd).toContain("$");
    expect(evidence.totalCollateralUsd).toContain("$");
    expect(evidence.collateralRatioPct).toContain("%");
    expect(evidence.vaults).toHaveLength(4);
    expect(evidence.source).toBe("live");
    expect(evidence.reality).toBe("LIVE_MAINNET");
    expect(evidence.fetchedAt).toBe(LIVE_FIXTURE_CAPTURED_AT);
    expect(evidence.vaults[0].vaultType).toBe("TRX-A");
  });
});
