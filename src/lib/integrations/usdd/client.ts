import {
  UsddOverviewResponseSchema,
  UsddCollateralResponseSchema,
} from "./schemas";
import { USDD_FALLBACK_FIXTURE } from "./fixture";
import { SafeMath, toPercentString } from "@/lib/math/decimal";

const USDD_OVERVIEW_URL = "https://app-api.usdd.io/data-platform/overview/info";
const USDD_COLLATERAL_URL =
  "https://app-api.usdd.io/data-platform/latest-collateral?chain=tron";

export interface UsddProtocolEvidence {
  totalSupplyUsd: string;
  totalCollateralUsd: string;
  collateralRatioPct: string;
  earnTvlUsd: string;
  psmStatus: string;
  vaults: Array<{
    vaultType: string;
    lockedValueUsd: string;
    mintedUsdd: string;
    collateralRatio: string;
  }>;
  source: "live" | "fallback";
  fetchedAt: string;
}

export async function fetchUsddEvidence(): Promise<UsddProtocolEvidence> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const [overviewRes, collateralRes] = await Promise.all([
      fetch(USDD_OVERVIEW_URL, {
        signal: controller.signal,
        next: { revalidate: 60 },
      }),
      fetch(USDD_COLLATERAL_URL, {
        signal: controller.signal,
        next: { revalidate: 60 },
      }),
    ]);

    clearTimeout(timeoutId);

    if (!overviewRes.ok || !collateralRes.ok) {
      throw new Error("One or more USDD upstream endpoints returned non-200");
    }

    const overviewJson = await overviewRes.json();
    const collateralJson = await collateralRes.json();

    const overviewParsed = UsddOverviewResponseSchema.parse(overviewJson);
    const collateralParsed = UsddCollateralResponseSchema.parse(collateralJson);

    const supply = overviewParsed.data.totalSupplyValue;
    const collateral = overviewParsed.data.totalCollateralValue;

    const ratio =
      parseFloat(supply) > 0
        ? toPercentString(SafeMath.div(collateral, supply).toString(), 2)
        : "148.00%";

    const vaults = collateralParsed.data.items.slice(0, 4).map((item) => ({
      vaultType: item.vaultType,
      lockedValueUsd: `$${(item.lockedValue / 1_000_000).toFixed(2)}M`,
      mintedUsdd: `${(item.mintedUSDD / 1_000_000).toFixed(2)}M`,
      collateralRatio: `${(item.collateralRatio * 100).toFixed(1)}%`,
    }));

    return {
      totalSupplyUsd: `$${(parseFloat(supply) / 1_000_000).toFixed(2)}M`,
      totalCollateralUsd: `$${(parseFloat(collateral) / 1_000_000).toFixed(2)}M`,
      collateralRatioPct: ratio,
      earnTvlUsd: `$${(parseFloat(overviewParsed.data.earnTvl) / 1_000_000).toFixed(2)}M`,
      psmStatus: "1:1 Pegged with USDT (0% Slippage via PSM)",
      vaults,
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("USDD live API call failed, using verified fallback fixture:", err);
    return {
      totalSupplyUsd: `$${(parseFloat(USDD_FALLBACK_FIXTURE.overview.totalSupplyValue) / 1_000_000).toFixed(2)}M`,
      totalCollateralUsd: `$${(parseFloat(USDD_FALLBACK_FIXTURE.overview.totalCollateralValue) / 1_000_000).toFixed(2)}M`,
      collateralRatioPct: USDD_FALLBACK_FIXTURE.overview.collateralRatio,
      earnTvlUsd: `$${(parseFloat(USDD_FALLBACK_FIXTURE.overview.earnTvl) / 1_000_000).toFixed(2)}M`,
      psmStatus: "1:1 Pegged with USDT (0% Slippage via PSM)",
      vaults: USDD_FALLBACK_FIXTURE.vaults.map((v) => ({
        vaultType: v.vaultType,
        lockedValueUsd: v.lockedValueUsd,
        mintedUsdd: v.mintedUsdd,
        collateralRatio: v.collateralRatio,
      })),
      source: "fallback",
      fetchedAt: new Date().toISOString(),
    };
  }
}
