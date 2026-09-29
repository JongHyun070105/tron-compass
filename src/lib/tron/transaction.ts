import { Decimal, parseUnits, SafeMath, toDecimal } from "../math/decimal";
import { JTRX_ABI, JUSTLEND_NILE_CONTRACTS } from "../integrations/justlend/contracts";
import { AllocationLeg, AssetValuation, Holding } from "@/domain/allocation/types";
import { DecisionEvidenceItem, DecisionStopRecord, makeStopRecord } from "@/domain/decision/receipt";

const JUSTLEND_VALUATION_SOURCE = "https://openapi.just.network/lend/jtoken";

export type TransactionLifecycleState =
  | "IDLE"
  | "REVIEW"
  | "PREFLIGHT_FAILED"
  | "READY_TO_SIGN"
  | "AWAITING_WALLET_SIGNATURE"
  | "BROADCASTING"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "REJECTED"
  | "STOPPED"
  | "SIMULATED";

export interface PreflightCheck {
  key: string;
  name: string;
  passed: boolean;
  message: string;
}

export interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
  requiredTotalTrx: string;
  currentBalanceTrx: string;
}

export interface ExecutionPreview {
  actionId: string;
  actionType?: "SUPPLY" | "REDEEM";
  protocol: string;
  product: string;
  asset: string;
  amount: string;
  amountRaw: string;
  network: "NILE";
  targetContract: string;
  method: string;
  estimatedFeeTrx: string;
  approvalScope: string;
  riskNotice: string;
}

export interface NileExecutionGateResult {
  ready: boolean;
  stops: DecisionStopRecord[];
}

export function evaluateNileExecutionSafety(params: {
  network: string;
  leg: Partial<AllocationLeg>;
  preview: ExecutionPreview;
  approvedPreview?: ExecutionPreview | null;
  approvalShown: boolean;
  evidence: Array<Pick<DecisionEvidenceItem, "fetchedAt" | "reality">>;
  valuationEvidence: Array<{ holding: Holding; valuation: AssetValuation | null | undefined }>;
  rulesPassed: boolean;
  ruleViolation?: { ruleId: string; actual: string; required: string; reason?: string };
  now?: number;
  freshnessMs?: number;
}): NileExecutionGateResult {
  const now = params.now ?? Date.now();
  const stops: DecisionStopRecord[] = [];
  const addStop = (guardId: string, reason: string, ruleId: string | null = null) => {
    stops.push(makeStopRecord({
      timestamp: new Date(now).toISOString(),
      stage: "PRE_SIGN",
      ruleId,
      guardId,
      attemptedAction: params.preview.actionType ?? "UNKNOWN",
      attemptedAmount: params.preview.amount ? `${params.preview.amount} ${params.preview.asset}` : null,
      reason,
    }));
  };

  if (!params.rulesPassed) {
    const violation = params.ruleViolation;
    addStop(
      "INVESTMENT_RULES",
      violation
        ? violation.ruleId === "RULES_UNCONFIRMED"
          ? "My Rules must be confirmed before signing."
          : violation.ruleId === "VALUATION_UNAVAILABLE"
          ? "Source-backed USDT-equivalent valuation is unavailable; exposure rules cannot be verified before signing."
          : violation.actual === "UNKNOWN"
            ? `${violation.ruleId} could not be verified: ${violation.reason ?? violation.required}`
          : violation.ruleId === "R2" || violation.ruleId === "MAX_VOLATILE_EXPOSURE"
            ? `${violation.ruleId} violated: ${violation.actual} > ${violation.required}`
            : `${violation.ruleId} violated: ${violation.reason ?? `${violation.actual}; required ${violation.required}`}`
        : "One or more mandatory investment rules did not pass.",
      violation?.ruleId ?? null
    );
  }

  if (!params.network.toLowerCase().includes("nile") || params.preview.network !== "NILE") {
    addStop("NETWORK_NILE", "Execution is only allowed on Nile Testnet.");
  }
  if (params.leg.executabilityClass !== "NILE_EXECUTABLE" || params.leg.executionNetwork !== "NILE") {
    addStop("LEG_NOT_NILE_EXECUTABLE", "Selected allocation leg is not marked NILE_EXECUTABLE.");
  }
  const expectedContract = JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58;
  if (params.preview.targetContract !== expectedContract) {
    addStop("CONTRACT_NOT_ALLOWLISTED", "Target contract is not in the Nile jTRX allowlist.");
  }
  const expectedMethod = params.preview.actionType === "REDEEM" ? "redeem(uint256)" : "mint()";
  if (!params.preview.actionType || params.preview.method !== expectedMethod) {
    addStop("METHOD_NOT_ALLOWED", "Transaction method does not match the approved jTRX action.");
  }
  try {
    const decimals = params.preview.actionType === "REDEEM" ? 8 : 6;
    const expectedRaw = parseUnits(params.preview.amount, decimals);
    if (!/^[1-9][0-9]*$/.test(params.preview.amountRaw) || expectedRaw !== params.preview.amountRaw) {
      addStop("AMOUNT_MISMATCH", "Transaction amount does not match the approved amount in token base units.");
    }
    if (params.preview.actionType === "SUPPLY" && !Number.isSafeInteger(Number(params.preview.amountRaw))) {
      addStop("AMOUNT_OUT_OF_RANGE", "Supply call value exceeds the safe integer range supported by this wallet flow.");
    }
  } catch {
    addStop("AMOUNT_INVALID", "Transaction amount could not be converted safely to token base units.");
  }

  const marketEvidence = params.evidence;
  if (!marketEvidence.length) {
    addStop("MARKET_EVIDENCE_MISSING", "Required market evidence is unavailable.");
  } else {
    for (const item of marketEvidence) {
      const fetchedAt = item.fetchedAt ? Date.parse(item.fetchedAt) : Number.NaN;
      const fresh = Number.isFinite(fetchedAt) && now >= fetchedAt && now - fetchedAt <= (params.freshnessMs ?? 5 * 60 * 1000);
      if (item.reality !== "LIVE_MAINNET" || !fresh) {
        addStop("MARKET_EVIDENCE_STALE", "Required evidence is UNKNOWN / STALE; refresh market evidence before signing.");
        break;
      }
    }
  }

  const valuationEvidence = params.valuationEvidence ?? [];
  if (!valuationEvidence.length) {
    addStop("HOLDING_VALUATION_MISSING", "Live valuation unavailable — execution paused.");
  } else {
    const hasInvalidValuation = valuationEvidence.some(({ holding, valuation }) => {
      let amount: Decimal;
      try {
        amount = new Decimal(holding.amount);
      } catch {
        return true;
      }
      if (!amount.isFinite() || amount.isNegative()) return true;
      if (amount.isZero()) return false;
      if (!valuation) return true;

      let valuationAmount: Decimal;
      let value: Decimal;
      try {
        valuationAmount = new Decimal(valuation.amount);
        value = new Decimal(valuation.value ?? "NaN");
      } catch {
        return true;
      }
      const fetchedAt = valuation.fetchedAt ? Date.parse(valuation.fetchedAt) : Number.NaN;
      const fresh = Number.isFinite(fetchedAt) && now >= fetchedAt && now - fetchedAt <= (params.freshnessMs ?? 5 * 60 * 1000);
      return valuation.asset !== holding.asset ||
        !valuationAmount.isFinite() ||
        !valuationAmount.eq(amount) ||
        !value.isFinite() ||
        !value.gt(0) ||
        valuation.denomination !== "USDT" ||
        valuation.source !== JUSTLEND_VALUATION_SOURCE ||
        valuation.reality !== "LIVE_MAINNET" ||
        valuation.stale !== false ||
        !fresh;
    });
    if (hasInvalidValuation) {
      const missing = valuationEvidence.some(({ valuation }) => !valuation);
      const stale = valuationEvidence.some(({ valuation }) => {
        if (!valuation) return false;
        const fetchedAt = valuation?.fetchedAt ? Date.parse(valuation.fetchedAt) : Number.NaN;
        return valuation?.reality !== "LIVE_MAINNET" || valuation.stale !== false ||
          !Number.isFinite(fetchedAt) || now < fetchedAt || now - fetchedAt > (params.freshnessMs ?? 5 * 60 * 1000);
      });
      addStop(missing ? "HOLDING_VALUATION_MISSING" : stale ? "HOLDING_VALUATION_STALE" : "HOLDING_VALUATION_INVALID", "Live valuation unavailable — execution paused.");
    }
  }

  if (!params.approvalShown || !params.approvedPreview) {
    addStop("APPROVAL_NOT_RECORDED", "Amount, fee, risk, scope, network, contract, and method were not recorded as shown to the user.");
  } else {
    const preview = params.preview;
    const approved = params.approvedPreview;
    const sameShownFields = preview.actionType === approved.actionType &&
      preview.amount === approved.amount &&
      preview.amountRaw === approved.amountRaw &&
      preview.network === approved.network &&
      preview.targetContract === approved.targetContract &&
      preview.method === approved.method &&
      preview.estimatedFeeTrx === approved.estimatedFeeTrx &&
      preview.riskNotice === approved.riskNotice &&
      preview.approvalScope === approved.approvalScope;
    if (!sameShownFields) addStop("APPROVAL_PARITY", "Transaction parameters changed after the user reviewed them.");
  }

  return { ready: stops.length === 0, stops };
}

export async function executeIfNileGatePasses<T>(
  gate: NileExecutionGateResult,
  invoke: () => Promise<T>
): Promise<{ ready: boolean; stops: DecisionStopRecord[]; result?: T }> {
  if (!gate.ready) return { ready: false, stops: gate.stops };
  return { ready: true, stops: [], result: await invoke() };
}

export interface TransactionStatusResult {
  txHash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "NOT_FOUND";
  blockNumber?: number;
  feeSun?: number;
  energyFeeSun?: number;
  contractResult?: string;
  timestamp?: number;
}

/** Returns the observed after-minus-before token balance delta at token precision. */
export function computeBalanceDelta(before: string | null | undefined, after: string | null | undefined, decimals: number): string | null {
  if (!before || !after || !/^\d+(?:\.\d+)?$/.test(before) || !/^\d+(?:\.\d+)?$/.test(after)) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
  try {
    const prior = new Decimal(before);
    const current = new Decimal(after);
    if (!prior.isFinite() || prior.isNegative() || !current.isFinite() || current.isNegative()) return null;
    return current.minus(prior).toFixed(decimals);
  } catch {
    return null;
  }
}

export function determineTransactionState(params: {
  preflightReady: boolean;
  hasAuthorized: boolean;
  currentExecutionState?: TransactionLifecycleState;
}): TransactionLifecycleState {
  if (
    params.currentExecutionState &&
    !["IDLE", "REVIEW", "PREFLIGHT_FAILED", "READY_TO_SIGN"].includes(
      params.currentExecutionState
    )
  ) {
    return params.currentExecutionState;
  }
  if (!params.preflightReady) {
    return "PREFLIGHT_FAILED";
  }
  if (params.hasAuthorized) {
    return "READY_TO_SIGN";
  }
  return "REVIEW";
}

export function buildPreflightChecks(params: {
  isWalletConnected: boolean;
  walletAddress?: string;
  currentNetwork?: string;
  trxBalance: string;
  requiredAmount: string;
  asset: string;
}): PreflightResult {
  const checks: PreflightCheck[] = [];
  let ready = true;

  // 1. Wallet connection
  const hasWallet = params.isWalletConnected && !!params.walletAddress;
  checks.push({
    key: "WALLET_CONNECTED",
    name: "Wallet Connection",
    passed: hasWallet,
    message: hasWallet
      ? `Connected to ${params.walletAddress?.slice(0, 6)}...${params.walletAddress?.slice(-4)}`
      : "No TRON wallet connected. Please connect TronLink.",
  });
  if (!hasWallet) ready = false;

  // 2. Network Check (Nile testnet required for sandbox execution)
  const isNile =
    params.currentNetwork?.toLowerCase().includes("nile") ||
    params.currentNetwork === "0xcd8690";
  checks.push({
    key: "NETWORK_NILE",
    name: "Target Network (Nile)",
    passed: isNile,
    message: isNile
      ? "Active network is Nile Testnet."
      : "Active network is not Nile Testnet. Please switch network in TronLink.",
  });
  if (!isNile) ready = false;

  // 3. Balance sufficiency
  const cleanedBalance = (params.trxBalance || "").replace(/,/g, "").trim();
  const balanceKnown = /^\d+(?:\.\d+)?$/.test(cleanedBalance);
  const cleanedRequired = (params.requiredAmount || "0").replace(/,/g, "").trim() || "0";
  const balance = toDecimal(balanceKnown ? cleanedBalance : "0");
  const required = toDecimal(cleanedRequired);
  // Energy reserve buffer (~20 TRX)
  const requiredTotal = params.asset === "TRX"
    ? required.plus(20)
    : toDecimal(20);

  const hasSufficient = hasWallet && balanceKnown && balance.gte(requiredTotal);
  checks.push({
    key: "BALANCE_SUFFICIENT",
    name: "Sufficient Balance & Energy Buffer",
    passed: hasSufficient,
    message: hasSufficient
      ? `Balance (${balance.toFixed(2)} TRX) covers required amount + 20 TRX resource buffer.`
      : !balanceKnown
        ? "TRX balance is unavailable; refresh wallet data before continuing."
        : `Insufficient TRX balance (${balance.toFixed(2)} TRX). Required: ${requiredTotal.toFixed(2)} TRX (includes 20 TRX buffer).`,
  });
  if (!hasSufficient) ready = false;

  return {
    ready,
    checks,
    requiredTotalTrx: requiredTotal.toFixed(2),
    currentBalanceTrx: balanceKnown ? balance.toFixed(2) : "UNAVAILABLE",
  };
}

export function buildRedeemPreflightChecks(params: {
  isWalletConnected: boolean;
  walletAddress?: string;
  currentNetwork?: string;
  jTrxBalance: string;
  requiredJTrxAmount?: string;
  redeemAmount?: string;
  trxBalanceForFee?: string;
  trxBalance?: string;
}): PreflightResult {
  const checks: PreflightCheck[] = [];
  let ready = true;

  // 1. Wallet connection
  const hasWallet = params.isWalletConnected && !!params.walletAddress;
  checks.push({
    key: "WALLET_CONNECTED",
    name: "Wallet Connection",
    passed: hasWallet,
    message: hasWallet
      ? `Connected to ${params.walletAddress?.slice(0, 6)}...${params.walletAddress?.slice(-4)}`
      : "No TRON wallet connected. Please connect TronLink.",
  });
  if (!hasWallet) ready = false;

  // 2. Network Check (Nile testnet required)
  const isNile =
    params.currentNetwork?.toLowerCase().includes("nile") ||
    params.currentNetwork === "0xcd8690";
  checks.push({
    key: "NETWORK_NILE",
    name: "Target Network (Nile)",
    passed: isNile,
    message: isNile
      ? "Active network is Nile Testnet."
      : "Active network is not Nile Testnet. Please switch network in TronLink.",
  });
  if (!isNile) ready = false;

  // 3. jTRX Balance sufficiency (must hold at least the amount to redeem)
  const rawJTrxBal = params.jTrxBalance || "";
  const rawRequired = params.requiredJTrxAmount || params.redeemAmount || "0";
  const cleanedJTrxBalance = rawJTrxBal.replace(/,/g, "").trim();
  const cleanedRequired = rawRequired.replace(/,/g, "").trim() || "0";
  const jTrxBalanceKnown = /^\d+(?:\.\d+)?$/.test(cleanedJTrxBalance);
  const jTrxBal = toDecimal(jTrxBalanceKnown ? cleanedJTrxBalance : "0");
  const required = toDecimal(cleanedRequired);

  const hasTokens = hasWallet && jTrxBalanceKnown && jTrxBal.gt(0) && jTrxBal.gte(required);
  checks.push({
    key: "BALANCE_SUFFICIENT",
    name: "Sufficient jTRX Position",
    passed: hasTokens,
    message: hasTokens
      ? `Position (${jTrxBal.toFixed(4)} jTRX) is sufficient for redemption of ${required.toFixed(4)} jTRX.`
      : !jTrxBalanceKnown
        ? "jTRX balance is unavailable; read the Nile contract balance before redemption."
        : `Insufficient jTRX position (held: ${jTrxBal.toFixed(4)} jTRX / requested: ${required.toFixed(4)} jTRX). First supply TRX to obtain jTRX tokens.`,
  });
  if (!hasTokens) ready = false;

  // 4. Energy Fee Buffer (needs at least ~20 TRX to pay transaction energy fee)
  const rawTrxBal = params.trxBalanceForFee || params.trxBalance || "";
  const cleanedTrxFeeBal = rawTrxBal.replace(/,/g, "").trim();
  const trxFeeBalanceKnown = /^\d+(?:\.\d+)?$/.test(cleanedTrxFeeBal);
  const trxFeeBal = toDecimal(trxFeeBalanceKnown ? cleanedTrxFeeBal : "0");
  const hasFeeBuffer = hasWallet && trxFeeBalanceKnown && trxFeeBal.gte(20);
  checks.push({
    key: "ENERGY_FEE_BUFFER",
    name: "TRON Energy Buffer",
    passed: hasFeeBuffer,
    message: hasFeeBuffer
      ? `TRX fee buffer (${trxFeeBal.toFixed(2)} TRX) covers network energy requirement (>= 20 TRX).`
      : !trxFeeBalanceKnown
        ? "TRX fee balance is unavailable; refresh wallet data before continuing."
        : `Insufficient TRX for gas/energy (${trxFeeBal.toFixed(2)} TRX). At least 20 TRX is required for Nile smart contract execution.`,
  });
  if (!hasFeeBuffer) ready = false;

  return {
    ready,
    checks,
    requiredTotalTrx: "20.00",
    currentBalanceTrx: trxFeeBalanceKnown ? trxFeeBal.toFixed(2) : "UNAVAILABLE",
  };
}

export function prepareJTrxSupplyPreview(
  amountTrx: string,
  walletAddress: string
): ExecutionPreview {
  const sunAmount = parseUnits(amountTrx, 6);
  return {
    actionId: `exec-jtrx-supply-${Date.now()}`,
    actionType: "SUPPLY",
    protocol: "JustLend DAO",
    product: "jTRX Supply Pool",
    asset: "TRX",
    amount: amountTrx,
    amountRaw: sunAmount,
    network: "NILE",
    targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58,
    method: "mint()",
    estimatedFeeTrx: "15 ~ 25 TRX (Energy fee or burn)",
    approvalScope: `Supply ${amountTrx} TRX to JustLend Nile contract to mint interest-bearing jTRX tokens to ${walletAddress}`,
    riskNotice: "Testnet execution only. No real mainnet funds are at risk.",
  };
}

export function prepareJTrxRedeemPreview(
  amountJTrx: string,
  walletAddress: string
): ExecutionPreview {
  // jTRX has 8 decimals
  const rawJTrxAmount = parseUnits(amountJTrx, 8);
  return {
    actionId: `exec-jtrx-redeem-${Date.now()}`,
    actionType: "REDEEM",
    protocol: "JustLend DAO",
    product: "jTRX Redemption Pool",
    asset: "jTRX",
    amount: amountJTrx,
    amountRaw: rawJTrxAmount,
    network: "NILE",
    targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58,
    method: "redeem(uint256)",
    estimatedFeeTrx: "15 ~ 25 TRX (Energy fee or burn)",
    approvalScope: `Redeem ${amountJTrx} jTRX from JustLend Nile contract to withdraw underlying TRX back to ${walletAddress}`,
    riskNotice: "Testnet execution only. Burns jTRX tokens and credits underlying TRX to wallet.",
  };
}

function assertAllowedJTrxPreview(preview: ExecutionPreview, actionType: "SUPPLY" | "REDEEM"): void {
  const expectedMethod = actionType === "SUPPLY" ? "mint()" : "redeem(uint256)";
  const decimals = actionType === "SUPPLY" ? 6 : 8;
  if (
    preview.actionType !== actionType ||
    preview.network !== "NILE" ||
    preview.targetContract !== JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58 ||
    preview.method !== expectedMethod
  ) {
    throw new Error("Execution preview is outside the Nile jTRX allowlist.");
  }
  const amount = toDecimal(preview.amount);
  if (!amount.isFinite() || amount.lte(0) || parseUnits(preview.amount, decimals) !== preview.amountRaw) {
    throw new Error("Execution amount is invalid or does not match its token base units.");
  }
  if (actionType === "SUPPLY" && !Number.isSafeInteger(Number(preview.amountRaw))) {
    throw new Error("Supply call value exceeds the safe integer range supported by this wallet flow.");
  }
}

/**
 * Executes jTRX supply on Nile testnet via TronLink provider window.tronWeb.
 */
export async function executeJTrxSupplyOnNile(
  preview: ExecutionPreview,
  tronWebInstance?: any
): Promise<{ txHash: string; status: "BROADCASTED" | "REJECTED" | "FAILED"; message: string }> {
  assertAllowedJTrxPreview(preview, "SUPPLY");
  const tronWeb =
    tronWebInstance ||
    (typeof window !== "undefined" ? (window as any).tronWeb : null);

  if (!tronWeb || !tronWeb.ready) {
    throw new Error("TronWeb instance is not available or wallet is locked.");
  }

  try {
    const contract = await tronWeb.contract(
      JTRX_ABI,
      preview.targetContract
    );

    const callValue = Number(preview.amountRaw);

    // Call mint() with payable value in sun
    const tx = await contract.mint().send({
      callValue,
      feeLimit: 100_000_000, // 100 TRX fee limit for energy
    });

    const txHash = typeof tx === "string" ? tx : tx?.txid || tx?.transaction?.txID;

    if (!txHash) {
      throw new Error("Transaction was broadcasted but no transaction ID was returned.");
    }

    return {
      txHash,
      status: "BROADCASTED",
      message: `Transaction successfully broadcasted to Nile: ${txHash}`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("declined") || msg.includes("reject") || msg.includes("User rejected")) {
      return {
        txHash: "",
        status: "REJECTED",
        message: "User declined or rejected the transaction in wallet popup.",
      };
    }
    throw new Error(`Execution error: ${msg}`);
  }
}

/**
 * Executes jTRX redeem on Nile testnet via TronLink provider window.tronWeb.
 */
export async function executeJTrxRedeemOnNile(
  preview: ExecutionPreview,
  tronWebInstance?: any
): Promise<{ txHash: string; status: "BROADCASTED" | "REJECTED" | "FAILED"; message: string }> {
  assertAllowedJTrxPreview(preview, "REDEEM");
  const tronWeb =
    tronWebInstance ||
    (typeof window !== "undefined" ? (window as any).tronWeb : null);

  if (!tronWeb || !tronWeb.ready) {
    throw new Error("TronWeb instance is not available or wallet is locked.");
  }

  try {
    const contract = await tronWeb.contract(
      JTRX_ABI,
      preview.targetContract
    );

    // Call redeem(uint256 redeemTokens)
    const tx = await contract.redeem(preview.amountRaw).send({
      feeLimit: 100_000_000, // 100 TRX fee limit for energy
    });

    const txHash = typeof tx === "string" ? tx : tx?.txid || tx?.transaction?.txID;

    if (!txHash) {
      throw new Error("Transaction was broadcasted but no transaction ID was returned.");
    }

    return {
      txHash,
      status: "BROADCASTED",
      message: `Redeem transaction successfully broadcasted to Nile: ${txHash}`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("declined") || msg.includes("reject") || msg.includes("User rejected")) {
      return {
        txHash: "",
        status: "REJECTED",
        message: "User declined or rejected the transaction in wallet popup.",
      };
    }
    throw new Error(`Redeem execution error: ${msg}`);
  }
}

/**
 * Polls Nile TronGrid via Next.js server route (/api/tron/verify-tx) with authenticated TRON-PRO-API-KEY.
 * Strictly verifies real on-chain transaction receipt and block inclusion.
 */
export async function pollTransactionStatus(
  txHash: string,
  maxAttempts: number = 10,
  delayMs: number = 2500,
  network: "nile" | "mainnet" = "nile"
): Promise<TransactionStatusResult> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch("/api/tron/verify-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, network }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.status === "CONFIRMED" || data.status === "FAILED") {
            return {
              txHash,
              status: data.status,
              blockNumber: data.blockNumber,
              feeSun: Number.isSafeInteger(data.feeSun) && data.feeSun >= 0 ? data.feeSun : undefined,
              energyFeeSun: Number.isSafeInteger(data.energyFeeSun) && data.energyFeeSun >= 0 ? data.energyFeeSun : undefined,
              contractResult: data.contractResult,
              timestamp: data.blockTimestamp,
            };
          }
          // Status is PENDING or NOT_FOUND, continue polling until included in block
        }
      }
    } catch {
      // Continue polling until maxAttempts
    }

    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    txHash,
    status: "PENDING",
  };
}
