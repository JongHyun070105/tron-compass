import { describe, it, expect } from "vitest";
import {
  buildPreflightChecks,
  prepareJTrxSupplyPreview,
} from "../src/lib/tron/transaction";
import { JUSTLEND_NILE_CONTRACTS } from "../src/lib/integrations/justlend/contracts";

describe("TRON Execution Layer — Preflight & Preview", () => {
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
});
