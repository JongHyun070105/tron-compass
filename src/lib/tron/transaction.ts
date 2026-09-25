import { parseUnits, SafeMath, toDecimal } from "../math/decimal";
import { JTRX_ABI, JUSTLEND_NILE_CONTRACTS } from "../integrations/justlend/contracts";

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
  | "REJECTED";

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

export interface TransactionStatusResult {
  txHash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "NOT_FOUND";
  blockNumber?: number;
  energyFeeSun?: number;
  contractResult?: string;
  timestamp?: number;
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
  const cleanedBalance = (params.trxBalance || "0").replace(/,/g, "").trim() || "0";
  const cleanedRequired = (params.requiredAmount || "0").replace(/,/g, "").trim() || "0";
  const balance = toDecimal(cleanedBalance);
  const required = toDecimal(cleanedRequired);
  // Energy reserve buffer (~20 TRX)
  const requiredTotal = params.asset === "TRX"
    ? required.plus(20)
    : toDecimal(20);

  const hasSufficient = hasWallet && balance.gte(requiredTotal);
  checks.push({
    key: "BALANCE_SUFFICIENT",
    name: "Sufficient Balance & Energy Buffer",
    passed: hasSufficient,
    message: hasSufficient
      ? `Balance (${balance.toFixed(2)} TRX) covers required amount + 20 TRX resource buffer.`
      : `Insufficient TRX balance (${balance.toFixed(2)} TRX). Required: ${requiredTotal.toFixed(2)} TRX (includes 20 TRX buffer).`,
  });
  if (!hasSufficient) ready = false;

  return {
    ready,
    checks,
    requiredTotalTrx: requiredTotal.toFixed(2),
    currentBalanceTrx: balance.toFixed(2),
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
  const rawJTrxBal = params.jTrxBalance || "0";
  const rawRequired = params.requiredJTrxAmount || params.redeemAmount || "0";
  const cleanedJTrxBalance = rawJTrxBal.replace(/,/g, "").trim() || "0";
  const cleanedRequired = rawRequired.replace(/,/g, "").trim() || "0";
  const jTrxBal = toDecimal(cleanedJTrxBalance);
  const required = toDecimal(cleanedRequired);

  const hasTokens = hasWallet && jTrxBal.gt(0) && jTrxBal.gte(required);
  checks.push({
    key: "BALANCE_SUFFICIENT",
    name: "Sufficient jTRX Position",
    passed: hasTokens,
    message: hasTokens
      ? `Position (${jTrxBal.toFixed(4)} jTRX) is sufficient for redemption of ${required.toFixed(4)} jTRX.`
      : `Insufficient jTRX position (held: ${jTrxBal.toFixed(4)} jTRX / requested: ${required.toFixed(4)} jTRX). First supply TRX to obtain jTRX tokens.`,
  });
  if (!hasTokens) ready = false;

  // 4. Energy Fee Buffer (needs at least ~20 TRX to pay transaction energy fee)
  const rawTrxBal = params.trxBalanceForFee || params.trxBalance || "0";
  const cleanedTrxFeeBal = rawTrxBal.replace(/,/g, "").trim() || "0";
  const trxFeeBal = toDecimal(cleanedTrxFeeBal);
  const hasFeeBuffer = hasWallet && trxFeeBal.gte(20);
  checks.push({
    key: "ENERGY_FEE_BUFFER",
    name: "TRON Energy Buffer",
    passed: hasFeeBuffer,
    message: hasFeeBuffer
      ? `TRX fee buffer (${trxFeeBal.toFixed(2)} TRX) covers network energy requirement (>= 20 TRX).`
      : `Insufficient TRX for gas/energy (${trxFeeBal.toFixed(2)} TRX). At least 20 TRX is required for Nile smart contract execution.`,
  });
  if (!hasFeeBuffer) ready = false;

  return {
    ready,
    checks,
    requiredTotalTrx: "20.00",
    currentBalanceTrx: trxFeeBal.toFixed(2),
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

/**
 * Executes jTRX supply on Nile testnet via TronLink provider window.tronWeb.
 */
export async function executeJTrxSupplyOnNile(
  preview: ExecutionPreview,
  tronWebInstance?: any
): Promise<{ txHash: string; status: "BROADCASTED" | "REJECTED" | "FAILED"; message: string }> {
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

    const callValue = parseInt(preview.amountRaw, 10);

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
              energyFeeSun: data.energyFeeSun || 0,
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
