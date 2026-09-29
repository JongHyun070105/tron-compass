import { describe, it, expect } from "vitest";
import {
  buildPreflightChecks,
  buildRedeemPreflightChecks,
  prepareJTrxSupplyPreview,
  prepareJTrxRedeemPreview,
  determineTransactionState,
  computeBalanceDelta,
} from "../src/lib/tron/transaction";
import { JUSTLEND_NILE_CONTRACTS } from "../src/lib/integrations/justlend/contracts";
import * as transaction from "../src/lib/tron/transaction";
import { compassStorage } from "../src/lib/persistence/storage";
import { estimateNileJTrxRedeemTrx, fetchNileJTrxBalance, fetchNileJTrxExchangeRate, fetchTronWalletBalances } from "../src/lib/tron/network";
import { JUSTLEND_VALUATION_SOURCE } from "../src/domain/allocation/valuation";

describe("TRON Execution Layer — Preflight & Preview", () => {
  it("fails closed and records a stop instead of invoking the wallet for an out-of-rule pre-sign edit", async () => {
    const gate = (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview: {
        actionType: "SUPPLY",
        amount: "2280",
        amountRaw: "2280000000",
        network: "NILE",
        targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58,
        method: "mint()",
        estimatedFeeTrx: "15-25 TRX",
        riskNotice: "Nile testnet",
        approvalScope: "Supply TRX",
      },
      approvalShown: true,
      evidence: [{ fetchedAt: new Date().toISOString(), reality: "LIVE_MAINNET" }],
      rulesPassed: false,
      ruleViolation: { ruleId: "R2", actual: "38%", required: "20%" },
      now: Date.now(),
    });
    let invoked = false;
    const result = await (transaction as any).executeIfNileGatePasses(gate, async () => {
      invoked = true;
    });

    expect(result.ready).toBe(false);
    expect(result.stops[0].outcome).toBe("STOPPED");
    expect(result.stops[0].reason).toContain("38% > 20%");
    expect(invoked).toBe(false);
  });

  it("marks evidence UNKNOWN / STALE and records a stop before signing", () => {
    const now = Date.parse("2026-09-28T00:10:00.000Z");
    const gate = (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview: { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" },
      approvedPreview: { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" },
      approvalShown: true,
      evidence: [{ fetchedAt: "2026-09-28T00:00:00.000Z", reality: "LIVE_MAINNET" }],
      rulesPassed: true,
      now,
    });

    expect(gate.ready).toBe(false);
    expect(gate.stops[0].guardId).toBe("MARKET_EVIDENCE_STALE");
    expect(gate.stops[0].reason).toContain("UNKNOWN / STALE");
  });

  it("stops when incentive evidence is missing even if the base APY is fresh", () => {
    const now = Date.parse("2026-09-28T00:10:00.000Z");
    const gate = (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview: { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" },
      approvedPreview: { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" },
      approvalShown: true,
      evidence: [
        { fetchedAt: "2026-09-28T00:09:30.000Z", reality: "LIVE_MAINNET" },
        { fetchedAt: null, reality: "SNAPSHOT" },
      ],
      valuationEvidence: [{ fetchedAt: "2026-09-28T00:09:30.000Z", reality: "LIVE_MAINNET" }],
      rulesPassed: true,
      now,
    });

    expect(gate.ready).toBe(false);
    expect(gate.stops.some((stop: any) => stop.guardId === "MARKET_EVIDENCE_STALE")).toBe(true);
  });

  it("fails closed when holdings lack fresh source-backed USDT-equivalent valuation", () => {
    const gate = (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview: { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" },
      approvedPreview: { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" },
      approvalShown: true,
      evidence: [{ fetchedAt: new Date().toISOString(), reality: "LIVE_MAINNET" }],
      valuationEvidence: [{ holding: { asset: "TRX", amount: "100" }, valuation: null }],
      rulesPassed: true,
      now: Date.now(),
    });

    expect(gate.ready).toBe(false);
    expect(gate.stops.some((stop: any) => stop.guardId === "HOLDING_VALUATION_MISSING" && stop.reason === "Live valuation unavailable — execution paused.")).toBe(true);
  });

  it("allows execution valuation evidence only when the complete USDT-equivalent valuation is fresh", () => {
    const now = Date.parse("2026-09-29T00:00:00.000Z");
    const preview = { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" } as const;
    const gate = (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview,
      approvedPreview: preview,
      approvalShown: true,
      evidence: [{ fetchedAt: new Date(now).toISOString(), reality: "LIVE_MAINNET" }],
      valuationEvidence: [{
        holding: { asset: "TRX", amount: "100" },
        valuation: { asset: "TRX", amount: "100", value: "25", denomination: "USDT", source: JUSTLEND_VALUATION_SOURCE, fetchedAt: new Date(now).toISOString(), reality: "LIVE_MAINNET", stale: false },
      }],
      rulesPassed: true,
      now,
    });
    expect(gate.ready).toBe(true);
  });

  it("blocks execution when a holding valuation is stale or mislabeled USD", () => {
    const now = Date.parse("2026-09-29T00:00:00.000Z");
    const preview = { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" } as const;
    const makeGate = (valuation: Record<string, unknown>) => (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview,
      approvedPreview: preview,
      approvalShown: true,
      evidence: [{ fetchedAt: new Date(now).toISOString(), reality: "LIVE_MAINNET" }],
      valuationEvidence: [{ holding: { asset: "TRX", amount: "100" }, valuation }],
      rulesPassed: true,
      now,
    });
    const stale = makeGate({ asset: "TRX", amount: "100", value: "25", denomination: "USDT", source: JUSTLEND_VALUATION_SOURCE, fetchedAt: new Date(now - 6 * 60 * 1000).toISOString(), reality: "LIVE_MAINNET", stale: false });
    const mislabeled = makeGate({ asset: "TRX", amount: "100", value: "25", denomination: "USD", source: JUSTLEND_VALUATION_SOURCE, fetchedAt: new Date(now).toISOString(), reality: "LIVE_MAINNET", stale: false });
    for (const gate of [stale, mislabeled]) {
      expect(gate.ready).toBe(false);
      expect(gate.stops.some((stop: any) => stop.reason === "Live valuation unavailable — execution paused.")).toBe(true);
    }
  });

  it("stops when the transaction fields changed after the user saw approval", () => {
    const shown = { actionType: "SUPPLY", amount: "1", amountRaw: "1000000", network: "NILE", targetContract: JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58, method: "mint()", estimatedFeeTrx: "15-25 TRX", riskNotice: "Nile", approvalScope: "Supply" };
    const gate = (transaction as any).evaluateNileExecutionSafety({
      network: "Nile Testnet",
      leg: { executabilityClass: "NILE_EXECUTABLE", executionNetwork: "NILE" },
      preview: { ...shown, amount: "2", amountRaw: "2000000" },
      approvedPreview: shown,
      approvalShown: true,
      evidence: [{ fetchedAt: new Date().toISOString(), reality: "LIVE_MAINNET" }],
      rulesPassed: true,
      now: Date.now(),
    });

    expect(gate.ready).toBe(false);
    expect(gate.stops.some((stop: any) => stop.guardId === "APPROVAL_PARITY")).toBe(true);
  });

  it("passes preflight checks when wallet is connected to Nile with sufficient balance", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "nile",
      trxBalance: "150.00",
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("reads jTRX balance using the 8-decimal Nile contract and returns unavailable outside Nile", async () => {
    const balance = await fetchNileJTrxBalance("TUser", {
      contract: async (abi: unknown, address: string) => {
        expect(address).toBe(JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58);
        expect(Array.isArray(abi)).toBe(true);
        return { balanceOf: () => ({ call: async () => "12345678901" }) };
      },
    }, "nile");
    const unavailable = await fetchNileJTrxBalance("TUser", {}, "mainnet");

    expect(balance).toBe("123.45678901");
    expect(unavailable).toBeNull();
  });

  it("reads the exchange rate only from the canonical Nile jTRX contract", async () => {
    let called = false;
    const nileRate = await fetchNileJTrxExchangeRate({
      contract: async (_abi: unknown, address: string) => {
        expect(address).toBe(JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58);
        return { exchangeRateStored: () => ({ call: async () => "200000000000000" }) };
      },
    }, "nile");
    const mainnetRate = await fetchNileJTrxExchangeRate({
      contract: async () => { called = true; throw new Error("must not read a Mainnet contract"); },
    }, "mainnet");
    expect(nileRate?.raw).toBe("200000000000000");
    expect(mainnetRate).toBeNull();
    expect(called).toBe(false);
  });

  it("uses Nile exchangeRateStored for an approximate jTRX redemption quote", () => {
    expect(estimateNileJTrxRedeemTrx("100", "200000000000000")).toBe("2");
    expect(estimateNileJTrxRedeemTrx("0", "200000000000000")).toBeNull();
    expect(estimateNileJTrxRedeemTrx("1", "0")).toBeNull();
  });

  it("computes observed TRX and jTRX deltas at their respective decimal precision", () => {
    expect(computeBalanceDelta("10.123456", "12", 6)).toBe("1.876544");
    expect(computeBalanceDelta("125", "124.125", 8)).toBe("-0.87500000");
    expect(computeBalanceDelta("UNAVAILABLE", "1", 8)).toBeNull();
  });

  it("shows only observed TRX balance and leaves unsupported token balances unavailable", async () => {
    const balances = await fetchTronWalletBalances("TUser", {
      trx: { getBalance: async () => 125_000_000 },
    }, "nile");
    const unavailable = await fetchTronWalletBalances("", {}, "nile");

    expect(balances.trx).toBe("125");
    expect(balances.usdd).toBe("UNAVAILABLE");
    expect(balances.usdt).toBe("UNAVAILABLE");
    expect(unavailable).toEqual({ trx: "UNAVAILABLE", usdd: "UNAVAILABLE", usdt: "UNAVAILABLE" });
  });

  it("parses native TRX in sun without floating point", async () => {
    const balances = await fetchTronWalletBalances("TUser", {
      trx: { getBalance: async () => "1234567" },
    }, "nile");
    expect(balances.trx).toBe("1.234567");
    expect(balances.rawSun).toBe("1234567");
  });

  it("rejects an unsafe JavaScript number instead of recording a rounded balance", async () => {
    const balances = await fetchTronWalletBalances("TUser", {
      trx: { getBalance: async () => Number.MAX_SAFE_INTEGER + 1 },
    }, "nile");
    expect(balances.trx).toBe("UNAVAILABLE");
  });

  it("does not parse an unavailable wallet balance as a real zero", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "Nile Testnet",
      trxBalance: "UNAVAILABLE",
      requiredAmount: "1",
      asset: "TRX",
    });
    expect(result.ready).toBe(false);
    expect(result.currentBalanceTrx).toBe("UNAVAILABLE");
    expect(result.checks.find((check) => check.key === "BALANCE_SUFFICIENT")?.message).toContain("unavailable");
  });

  it("fails preflight check when wallet is not connected", () => {
    const result = buildPreflightChecks({
      isWalletConnected: false,
      currentNetwork: "nile",
      trxBalance: "150.00",
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(false);
    const walletCheck = result.checks.find((c) => c.key === "WALLET_CONNECTED");
    expect(walletCheck?.passed).toBe(false);
  });

  it("fails preflight check when active network is Mainnet instead of Nile", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "mainnet",
      trxBalance: "150.00",
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(false);
    const netCheck = result.checks.find((c) => c.key === "NETWORK_NILE");
    expect(netCheck?.passed).toBe(false);
  });

  it("fails preflight check when balance is insufficient for deposit plus energy buffer", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "nile",
      trxBalance: "55.00", // Needs 50 + 20 = 70 TRX!
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(false);
    const balanceCheck = result.checks.find(
      (c) => c.key === "BALANCE_SUFFICIENT"
    );
    expect(balanceCheck?.passed).toBe(false);
  });

  it("strictly fails preflight check when connected Nile wallet has 0 TRX", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "nile",
      trxBalance: "0.00",
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(false);
    const balanceCheck = result.checks.find(
      (c) => c.key === "BALANCE_SUFFICIENT"
    );
    expect(balanceCheck?.passed).toBe(false);
    expect(result.currentBalanceTrx).toBe("0.00");
    expect(result.requiredTotalTrx).toBe("70.00");
  });

  it("determines correct transaction state across the lifecycle", () => {
    // 1. Failed preflight -> PREFLIGHT_FAILED
    expect(
      determineTransactionState({
        preflightReady: false,
        hasAuthorized: false,
      })
    ).toBe("PREFLIGHT_FAILED");

    // 2. Preflight passed but unauthorized -> REVIEW
    expect(
      determineTransactionState({
        preflightReady: true,
        hasAuthorized: false,
      })
    ).toBe("REVIEW");

    // 3. Preflight passed and user authorized -> READY_TO_SIGN
    expect(
      determineTransactionState({
        preflightReady: true,
        hasAuthorized: true,
      })
    ).toBe("READY_TO_SIGN");

    // 4. Preserves active execution states (SIGNING, BROADCASTING, CONFIRMED, etc.)
    expect(
      determineTransactionState({
        preflightReady: true,
        hasAuthorized: true,
        currentExecutionState: "AWAITING_WALLET_SIGNATURE",
      })
    ).toBe("AWAITING_WALLET_SIGNATURE");

    expect(
      determineTransactionState({
        preflightReady: true,
        hasAuthorized: true,
        currentExecutionState: "CONFIRMED",
      })
    ).toBe("CONFIRMED");
  });

  it("generates correct execution preview for jTRX supply with verified Nile contract", () => {
    const preview = prepareJTrxSupplyPreview("50", "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");

    expect(preview.protocol).toBe("JustLend DAO");
    expect(preview.asset).toBe("TRX");
    expect(preview.amount).toBe("50");
    expect(preview.amountRaw).toBe("50000000"); // 50 * 10^6 sun
    expect(preview.targetContract).toBe(JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58);
    expect(preview.network).toBe("NILE");
    expect(preview.method).toBe("mint()");
  });

  it("passes redeem preflight checks when jTRX balance and TRX fee buffer are sufficient on Nile", () => {
    const result = buildRedeemPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "nile",
      trxBalance: "35.00", // Has 35 TRX (>= 20 TRX fee buffer)
      jTrxBalance: "100.00",
      redeemAmount: "50.00",
    });

    expect(result.ready).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails redeem preflight check when jTRX balance is lower than redeem request", () => {
    const result = buildRedeemPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "nile",
      trxBalance: "35.00",
      jTrxBalance: "30.00", // Only 30 jTRX!
      redeemAmount: "50.00",
    });

    expect(result.ready).toBe(false);
    const balanceCheck = result.checks.find((c) => c.key === "BALANCE_SUFFICIENT");
    expect(balanceCheck?.passed).toBe(false);
  });

  it("fails redeem preflight check when TRX gas/energy buffer is below 20 TRX", () => {
    const result = buildRedeemPreflightChecks({
      isWalletConnected: true,
      walletAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      currentNetwork: "nile",
      trxBalance: "5.00", // Less than 20 TRX fee reserve!
      jTrxBalance: "100.00",
      redeemAmount: "50.00",
    });

    expect(result.ready).toBe(false);
    const feeCheck = result.checks.find((c) => c.key === "ENERGY_FEE_BUFFER");
    expect(feeCheck?.passed).toBe(false);
  });

  it("generates correct execution preview for jTRX redeem calling verified Nile redeem()", () => {
    const preview = prepareJTrxRedeemPreview("100", "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");

    expect(preview.protocol).toBe("JustLend DAO");
    expect(preview.asset).toBe("jTRX");
    expect(preview.amount).toBe("100");
    expect(preview.amountRaw).toBe("10000000000"); // 100 * 10^8 (jTRX 8 decimals)
    expect(preview.targetContract).toBe(JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58);
    expect(preview.network).toBe("NILE");
    expect(preview.method).toBe("redeem(uint256)");
  });
});
