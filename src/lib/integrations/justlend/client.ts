import { RawJustLendResponseSchema, RawJustLendToken } from "./schemas";
import { normalizeJustLendMarketList } from "./normalize";
import { YieldOpportunity } from "@/domain/allocation/types";
import { JUSTLEND_FALLBACK_FIXTURE } from "./fixture";

const JUSTLEND_API_URL = "https://openapi.just.network/lend/jtoken";
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

interface CacheEntry {
  data: YieldOpportunity[];
  timestamp: number;
  source: "live" | "cache" | "fallback";
}

let memoryCache: CacheEntry | null = null;

export async function fetchJustLendMarkets(options?: {
  forceRefresh?: boolean;
}): Promise<{
  markets: YieldOpportunity[];
  source: "live" | "cache" | "fallback";
  fetchedAt: string;
}> {
  const now = Date.now();

  if (
    !options?.forceRefresh &&
    memoryCache &&
    now - memoryCache.timestamp < CACHE_TTL_MS
  ) {
    return {
      markets: memoryCache.data,
      source: "cache",
      fetchedAt: new Date(memoryCache.timestamp).toISOString(),
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const res = await fetch(JUSTLEND_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 30 },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`JustLend upstream returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const parsed = RawJustLendResponseSchema.parse(json);
    const fetchedAt = new Date().toISOString();
    const normalized = normalizeJustLendMarketList(parsed.data.tokenList, fetchedAt);

    memoryCache = {
      data: normalized,
      timestamp: now,
      source: "live",
    };

    return {
      markets: normalized,
      source: "live",
      fetchedAt,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    console.warn(
      "JustLend live API failed, falling back to verified snapshot:",
      err instanceof Error ? err.message : String(err)
    );

    const fallbackFetchedAt = new Date().toISOString();
    const fallbackMarkets = normalizeJustLendMarketList(
      JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[],
      fallbackFetchedAt
    );

    return {
      markets: fallbackMarkets,
      source: "fallback",
      fetchedAt: fallbackFetchedAt,
    };
  }
}
