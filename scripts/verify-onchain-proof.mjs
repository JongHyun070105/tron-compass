const BASE_URL = "https://nile.trongrid.io";

const FLOWS = [
  {
    id: "redeem",
    label: "jTRX Redeem",
    txHash: "4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286",
    expectedBlock: 71382254,
    expectedFeeSun: 7_569_900,
    explorer: "https://nile.tronscan.org/transaction/4a95a27d988af726e79744a98660398133687bab51da45f5fb57ca055e1ea286/overview",
  },
  {
    id: "supply",
    label: "jTRX Supply",
    txHash: "855416e66dc73f0909cb822b28ec64a3a0e9c7b69c7580cb98c70e1971a1b41c",
    expectedBlock: 71376676,
    expectedFeeSun: 6_589_400,
    explorer: "https://nile.tronscan.org/transaction/855416e66dc73f0909cb822b28ec64a3a0e9c7b69c7580cb98c70e1971a1b41c/overview",
  },
];

function headers() {
  const result = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const apiKey = process.env.TRONGRID_API_KEY?.trim();
  if (apiKey) result["TRON-PRO-API-KEY"] = apiKey;
  return result;
}

async function post(endpoint, body) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`${endpoint} returned HTTP ${response.status}`);
  }
  return response.json();
}

function explicitResult(info, transaction) {
  return (
    info?.receipt?.result ??
    info?.result ??
    transaction?.ret?.[0]?.contractRet ??
    null
  );
}

async function verifyFlow(flow) {
  const [info, transaction] = await Promise.all([
    post("/wallet/gettransactioninfobyid", { value: flow.txHash }),
    post("/wallet/gettransactionbyid", { value: flow.txHash }),
  ]);

  const observedHash = info?.id ?? transaction?.txID ?? null;
  const blockNumber = Number.isSafeInteger(info?.blockNumber) ? info.blockNumber : null;
  const result = explicitResult(info, transaction);
  const feeSun = Number.isSafeInteger(info?.fee) ? info.fee : null;

  const checks = {
    exactHash: observedHash?.toLowerCase() === flow.txHash.toLowerCase(),
    includedInBlock: blockNumber !== null && blockNumber > 0,
    explicitSuccess: result === "SUCCESS",
    expectedBlock: blockNumber === flow.expectedBlock,
    expectedFee: feeSun === flow.expectedFeeSun,
  };

  const verified = Object.values(checks).every(Boolean);

  return {
    flow: flow.id,
    label: flow.label,
    network: "nile",
    txHash: flow.txHash,
    explorer: flow.explorer,
    verified,
    observed: {
      blockNumber,
      result,
      feeSun,
      feeTrx: feeSun === null ? null : feeSun / 1_000_000,
      blockTimestamp: info?.blockTimeStamp ?? null,
      contractAddressHex: info?.contract_address ?? null,
      energyUsageTotal: info?.receipt?.energy_usage_total ?? null,
      energyFeeSun: info?.receipt?.energy_fee ?? null,
      netUsage: info?.receipt?.net_usage ?? null,
      netFeeSun: info?.receipt?.net_fee ?? null,
    },
    checks,
  };
}

const results = [];
for (const flow of FLOWS) {
  try {
    results.push(await verifyFlow(flow));
  } catch (error) {
    results.push({
      flow: flow.id,
      label: flow.label,
      network: "nile",
      txHash: flow.txHash,
      explorer: flow.explorer,
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  source: "Nile TronGrid",
  note: "Read-only verification. This script never signs or broadcasts a transaction.",
  results,
};

console.log(JSON.stringify(output, null, 2));

if (results.some((result) => !result.verified)) {
  process.exitCode = 1;
}
