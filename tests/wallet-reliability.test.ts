import { afterEach, describe, expect, it, vi } from "vitest";
import { createDecisionReceipt, DecisionAlternative, verifyDecisionHash } from "@/domain/decision/receipt";
import { formatReceiptAmount, getReceiptBalanceStatus, selectReceiptEvidence } from "@/domain/decision/receipt-presentation";
import { refreshBalancesAfterConfirmation, validateBalanceEvidence } from "@/lib/tron/balance-evidence";
import { JUSTLEND_NILE_CONTRACTS } from "@/lib/integrations/justlend/contracts";
import { fetchTronWalletBalances } from "@/lib/tron/network";
import { detectWalletNetwork, walletSnapshotsMatchReviewed, WalletBalanceSnapshot } from "@/lib/tron/wallet-state";
import { getWalletTronWeb, requestTronLinkAccount, subscribeToTronLinkEvents, TronLinkEventHandlers, TronLinkProvider } from "@/lib/tron/tronlink-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transaction balance evidence", () => {
  const before = { trxBalance: "1000", jTrxBalance: "40" };

  it("requires the expected negative TRX and positive jTRX deltas for Supply", () => {
    expect(validateBalanceEvidence("SUPPLY", before, { trxBalance: "998.5", jTrxBalance: "41" })).toEqual({
      status: "VERIFIED",
      trxDelta: "-1.5",
      jTrxDelta: "1",
    });
    expect(validateBalanceEvidence("SUPPLY", before, { trxBalance: "1000", jTrxBalance: "41" }).status).toBe("STALE");
  });

  it("requires the expected positive TRX and negative jTRX deltas for Redeem", () => {
    expect(validateBalanceEvidence("REDEEM", before, { trxBalance: "1001", jTrxBalance: "39.5" })).toEqual({
      status: "VERIFIED",
      trxDelta: "1",
      jTrxDelta: "-0.5",
    });
    expect(validateBalanceEvidence("REDEEM", before, { trxBalance: "1001", jTrxBalance: "40" }).status).toBe("STALE");
  });

  it("never emits a verified zero delta when either fresh read is unavailable", () => {
    expect(validateBalanceEvidence("SUPPLY", before, { trxBalance: "UNAVAILABLE", jTrxBalance: "41" })).toEqual({
      status: "UNAVAILABLE",
      trxDelta: null,
      jTrxDelta: null,
    });
  });

  it("retries bounded fresh reads and keeps independent before/after snapshots", async () => {
    const frozenBefore = Object.freeze({ ...before });
    const reads = [
      { trxBalance: "1000", jTrxBalance: "41" },
      { trxBalance: "998.5", jTrxBalance: "41.1" },
    ];
    const waits: number[] = [];
    const result = await refreshBalancesAfterConfirmation(
      "SUPPLY",
      frozenBefore,
      async () => reads.shift() ?? null,
      { retryDelaysMs: [10, 20, 40], wait: async (delay) => { waits.push(delay); } }
    );

    expect(waits).toEqual([10]);
    expect(result.evidence.status).toBe("VERIFIED");
    expect(result.after).not.toBe(frozenBefore);
    expect(frozenBefore).toEqual(before);
  });

  it("marks a confirmed old zero-delta Supply receipt stale", async () => {
    const base = await createDecisionReceipt({
      id: "receipt-legacy-balance",
      createdAt: "2026-09-29T00:00:00.000Z",
      rules: { version: 1, items: [] },
      needsConfirmedAt: null,
      evidence: [],
      screening: { included: [], excluded: [] },
      alternatives: [],
      assumptions: [],
      selection: { planId: "plan-a", selectedAt: null },
      approval: { shown: null },
    });
    const legacy = {
      ...base,
      execution: {
        ...base.execution,
        result: "CONFIRMED" as const,
        amountAsset: "TRX",
        trxBalanceBefore: "1035.3212",
        trxBalanceAfter: "1035.3212",
        trxBalanceDelta: "0",
        jTrxBalanceBefore: "84891.1401301",
        jTrxBalanceAfter: "173013.53026218",
        jTrxBalanceDelta: "88122.39013208",
      },
    };
    expect(getReceiptBalanceStatus(legacy)).toBe("STALE");
  });
});

describe("shared wallet state and compact receipt presentation", () => {
  const reviewedSnapshot: WalletBalanceSnapshot = {
    address: "TReviewedAccount",
    networkId: "nile",
    network: "Nile Testnet",
    trxBalance: "12345678901234567890.123456",
    jTrxBalance: "987.65432101",
    exchangeRateRaw: "1000000000000000000",
    fetchedAt: "2026-09-29T00:00:00.000Z",
  };

  it("requires the same account, supported network and fresh balances before signing", () => {
    expect(walletSnapshotsMatchReviewed(reviewedSnapshot, { ...reviewedSnapshot, fetchedAt: "later" }, "SUPPLY")).toBe(true);
    expect(walletSnapshotsMatchReviewed(reviewedSnapshot, { ...reviewedSnapshot, address: "TOtherAccount" }, "SUPPLY")).toBe(false);
    expect(walletSnapshotsMatchReviewed(reviewedSnapshot, { ...reviewedSnapshot, networkId: "mainnet" }, "SUPPLY")).toBe(false);
    expect(walletSnapshotsMatchReviewed(
      reviewedSnapshot,
      { ...reviewedSnapshot, trxBalance: "12345678901234567890.123457" },
      "SUPPLY"
    )).toBe(false);
    expect(walletSnapshotsMatchReviewed(
      reviewedSnapshot,
      { ...reviewedSnapshot, exchangeRateRaw: "1000000000000000001" },
      "REDEEM"
    )).toBe(false);
  });

  it("fails closed when TronLink explicitly reports an unsupported chain", () => {
    expect(detectWalletNetwork({ fullNode: { host: "https://nile.trongrid.io" } }, "0x94a9059e")).toEqual({
      id: "unknown",
      name: "Unsupported TRON network",
    });
    expect(detectWalletNetwork({}, "0xcd8690dc")).toEqual({ id: "nile", name: "Nile Testnet" });
  });

  it("uses fresh TronGrid account data instead of TronWeb's potentially stale getBalance", async () => {
    const contract = JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      balanceSun: "1234567",
      trc20Balances: { [contract]: "987654321" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", fetchMock);
    const getBalance = vi.fn(async () => 999999999);

    const snapshot = await fetchTronWalletBalances("TMockAddress", { trx: { getBalance } }, "nile", { forceFresh: true });
    expect(snapshot).toMatchObject({ trx: "1.234567", rawSun: "1234567", jTrx: "9.87654321" });
    expect(getBalance).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("fresh="), expect.objectContaining({ cache: "no-store" }));
  });

  it("formats long decimals for people without changing stored receipt values or the integrity hash", async () => {
    const evidence = Array.from({ length: 18 }, (_, index) => ({
      id: `market-${index}-base`,
      field: `${index === 0 ? "jtrx" : `market${index}`}.baseApy`,
      value: "0.0032",
      source: "https://openapi.just.network/lend/jtoken",
      fetchedAt: "2026-09-29T00:00:00.000Z",
      terms: "frozen source evidence",
      reality: "SNAPSHOT" as const,
    }));
    const receipt = await createDecisionReceipt({
      id: "receipt-compact",
      createdAt: "2026-09-29T00:00:00.000Z",
      rules: { version: 1, items: [] },
      needsConfirmedAt: null,
      evidence,
      screening: { included: [], excluded: [] },
      alternatives: [],
      assumptions: [],
      selection: { planId: "plan-a", selectedAt: null },
      approval: { shown: null },
    });
    const selected = {
      planId: "plan-a",
      allocations: [{ productId: "jtrx" }],
    } as unknown as DecisionAlternative;
    const originalJson = JSON.stringify(receipt);
    const visible = selectReceiptEvidence(receipt, [selected]);

    expect(visible.map((item) => item.field)).toEqual(["jtrx.baseApy"]);
    expect(receipt.evidence).toHaveLength(18);
    expect(formatReceiptAmount("670.5779241723894904345412006429501136965")).toBe("670.58");
    expect(formatReceiptAmount("100")).toBe("100");
    expect(JSON.stringify(receipt)).toBe(originalJson);
    expect(await verifyDecisionHash(receipt)).toBe(true);
  });
});

describe("TronLink provider events", () => {
  it("does not use a stale global TronWeb when the injected provider is not ready", () => {
    const staleTronWeb = { defaultAddress: { base58: "TStaleAccount" } };
    vi.stubGlobal("window", { tron: { request: vi.fn(), tronWeb: false }, tronWeb: staleTronWeb });
    expect(getWalletTronWeb()).toBeNull();
  });

  it("uses the modern account request and refresh event names with cleanup", async () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const provider: TronLinkProvider = {
      request: vi.fn(async ({ method }) => method === "eth_requestAccounts" ? ["TTestAccount"] : []),
      on: (event, listener) => { listeners.set(event, listener); },
      removeListener: (event) => { listeners.delete(event); },
    };
    vi.stubGlobal("window", { tron: provider });
    expect(await requestTronLinkAccount()).toBe("TTestAccount");
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });

    const handlers: TronLinkEventHandlers = {
      onAccountsChanged: vi.fn(),
      onChainChanged: vi.fn(),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
    };
    const cleanup = subscribeToTronLinkEvents(provider, handlers);
    expect([...listeners.keys()]).toEqual(["accountsChanged", "chainChanged", "connect", "disconnect"]);
    listeners.get("accountsChanged")?.(["TNextAccount"]);
    listeners.get("chainChanged")?.({ chainId: "0xcd8690dc" });
    listeners.get("connect")?.({ chainId: "0xcd8690dc" });
    listeners.get("disconnect")?.();
    expect(handlers.onAccountsChanged).toHaveBeenCalledWith(["TNextAccount"]);
    expect(handlers.onChainChanged).toHaveBeenCalledWith({ chainId: "0xcd8690dc" });
    expect(handlers.onConnect).toHaveBeenCalledWith({ chainId: "0xcd8690dc" });
    expect(handlers.onDisconnect).toHaveBeenCalledOnce();
    cleanup();
    expect(listeners.size).toBe(0);
  });
});
