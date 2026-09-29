const checks = [
  {
    name: "JustLend markets",
    url: "https://openapi.just.network/lend/jtoken",
    validate(payload) {
      const tokens = payload?.code === 0 ? payload?.data?.tokenList : null;
      if (!Array.isArray(tokens)) return false;
      const jTrx = tokens.find((token) => token.symbol === "jTRX");
      const jUsdt = tokens.find((token) => token.symbol === "jUSDT");
      return positive(jTrx?.underlyingPriceInTrx) &&
        nonNegative(jTrx?.supplyRate) &&
        positive(jUsdt?.underlyingPriceInTrx) &&
        nonNegative(jUsdt?.supplyRate);
    },
  },
  {
    name: "JustLend mining APY",
    url: "https://openapi.just.network/mining/apy",
    validate(payload) {
      const markets = payload?.code === 0 ? payload?.data : null;
      return !!markets && typeof markets === "object" && !Array.isArray(markets) &&
        Object.values(markets).every((value) => value?.USDD === undefined || nonNegative(value.USDD));
    },
  },
  {
    name: "USDD overview",
    url: "https://app-api.usdd.io/data-platform/overview/info",
    validate(payload) {
      return payload?.code === 0 &&
        positive(payload?.data?.totalSupplyValue) &&
        positive(payload?.data?.totalCollateralValue) &&
        positive(payload?.data?.earnTvl);
    },
  },
  {
    name: "USDD collateral",
    url: "https://app-api.usdd.io/data-platform/latest-collateral?chain=tron",
    validate(payload) {
      return payload?.code === 0 && Array.isArray(payload?.data?.items) &&
        payload.data.items.length > 0 &&
        payload.data.items.every((item) => typeof item.vaultType === "string");
    },
  },
  {
    name: "Nile TronGrid latest block",
    url: "https://nile.trongrid.io/wallet/getnowblock",
    method: "POST",
    validate(payload) {
      return Number.isSafeInteger(payload?.block_header?.raw_data?.number) &&
        payload.block_header.raw_data.number > 0;
    },
  },
];

function numeric(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0;
}

function nonNegative(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed >= 0;
}

async function runCheck(check) {
  try {
    const response = await fetch(check.url, {
      method: check.method ?? "GET",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: check.method === "POST" ? "{}" : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!check.validate(payload)) throw new Error("response shape or required values were invalid");
    console.log(`PASS ${check.name}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${check.name}: ${message}`);
    return false;
  }
}

const results = await Promise.all(checks.map(runCheck));
console.log(`Live verification: ${results.filter(Boolean).length}/${checks.length} checks passed.`);
if (results.some((passed) => !passed)) process.exitCode = 1;
