import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TronGridClient, sumInternalTrxTransfersToOwner } from "../src/lib/tron/trongrid-client";
import { buildPreflightChecks, determineTransactionState } from "../src/lib/tron/transaction";
import fs from "fs";
import path from "path";

describe("TronGridClient Server-Side Unit Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("extracts only native TRX internal transfers returned to the transaction owner", () => {
    const owner = "41abcdef";
    expect(sumInternalTrxTransfersToOwner({ internal_transactions: [
      { transferTo_address: owner.toUpperCase(), callValueInfo: [{ callValue: 1_117_763 }] },
      { transferTo_address: "41other", callValueInfo: [{ callValue: 9_000_000 }] },
      { transferTo_address: owner, callValueInfo: [{ callValue: 123, tokenId: "1002000" }] },
      { transferTo_address: owner, callValueInfo: [{ callValue: -1 }, { callValue: Number.MAX_SAFE_INTEGER }] },
    ] }, owner)).toBe(1_117_763);
    expect(sumInternalTrxTransfersToOwner({ internal_transactions: [] }, owner)).toBeNull();
  });

  it("adds TRON-PRO-API-KEY header server-side when key is present", async () => {
    process.env.TRONGRID_API_KEY = "test-api-key-12345";

    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn().mockImplementation((url, init) => {
      capturedHeaders = init?.headers || {};
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            block_header: { raw_data: { number: 71200000, timestamp: 1727000000 } },
            transactions: [],
          }),
      });
    });

    const client = new TronGridClient("nile");
    const block = await client.getNowBlock("nile");

    expect(block.blockNumber).toBe(71200000);
    expect(capturedHeaders["TRON-PRO-API-KEY"]).toBe("test-api-key-12345");
  });

  it("operates safely when TRONGRID_API_KEY is not set without exposing undefined headers", async () => {
    delete process.env.TRONGRID_API_KEY;

    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn().mockImplementation((url, init) => {
      capturedHeaders = init?.headers || {};
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            block_header: { raw_data: { number: 71200001, timestamp: 1727000001 } },
            transactions: [],
          }),
      });
    });

    const client = new TronGridClient("nile");
    const block = await client.getNowBlock("nile");

    expect(block.blockNumber).toBe(71200001);
    expect(capturedHeaders["TRON-PRO-API-KEY"]).toBeUndefined();
  });

  it("selects correct Mainnet vs Nile base URLs", async () => {
    process.env.TRONGRID_API_KEY = "dummy-key";

    const requestedUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url) => {
      requestedUrls.push(String(url));
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            block_header: { raw_data: { number: 100, timestamp: 1000 } },
          }),
      });
    });

    const client = new TronGridClient("nile");
    await client.getNowBlock("nile");
    await client.getNowBlock("mainnet");

    expect(requestedUrls[0]).toContain("https://nile.trongrid.io");
    expect(requestedUrls[1]).toContain("https://api.trongrid.io");
  });

  it("correctly identifies NOT_FOUND when transaction does not exist", async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}), // Empty object for non-existent tx
      });
    });

    const client = new TronGridClient("nile");
    const receipt = await client.getTransactionInfo("nonexistenthash00000000000000000000000000000000000000000000000000");

    expect(receipt.status).toBe("NOT_FOUND");
  });

  it("correctly identifies PENDING when transaction is in mempool but not yet mined into a block", async () => {
    const txHash = "pendinghash11111111111111111111111111111111111111111111111111111111";

    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes("/wallet/gettransactioninfobyid")) {
        // Receipt is empty while pending in pool
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      if (String(url).includes("/wallet/gettransactionbyid")) {
        // Transaction body is known to node
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              txID: txHash,
              raw_data: { contract: [] },
              ret: [{ contractRet: "SUCCESS" }],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const client = new TronGridClient("nile");
    const receipt = await client.getTransactionInfo(txHash);

    expect(receipt.status).toBe("PENDING");
  });

  it("correctly identifies CONFIRMED when transaction receipt has SUCCESS and blockNumber", async () => {
    const txHash = "confirmedhash222222222222222222222222222222222222222222222222222222";

    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes("/wallet/gettransactioninfobyid")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: txHash,
              blockNumber: 71255555,
              blockTimeStamp: 1727000500000,
              fee: 265000,
              receipt: {
                result: "SUCCESS",
                energy_fee: 15000000,
                net_fee: 265000,
                energy_usage_total: 42000,
                net_usage: 345,
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const client = new TronGridClient("nile");
    const receipt = await client.getTransactionInfo(txHash);

    expect(receipt.status).toBe("CONFIRMED");
    expect(receipt.blockNumber).toBe(71255555);
    expect(receipt.feeSun).toBe(265000);
    expect(receipt.energyFeeSun).toBe(15000000);
    expect(receipt.energyUsageTotal).toBe(42000);
    expect(receipt.netUsage).toBe(345);
  });

  it("does not confirm a block-included transaction without an explicit SUCCESS result", async () => {
    const txHash = "included-no-result-222222222222222222222222222222222222222222222222";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: txHash, blockNumber: 71255558, receipt: {} }),
    });

    const receipt = await new TronGridClient("nile").getTransactionInfo(txHash);

    expect(receipt.status).toBe("PENDING");
    expect(receipt.blockNumber).toBe(71255558);
    expect(receipt.contractResult).toBe("PENDING");
  });

  it("leaves actual fee unavailable when TronGrid omits its total fee field", async () => {
    const txHash = "confirmed-without-fee-22222222222222222222222222222222222222222222";
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes("/wallet/gettransactioninfobyid")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: txHash, blockNumber: 71255557, receipt: { result: "SUCCESS" } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const receipt = await new TronGridClient("nile").getTransactionInfo(txHash);
    expect(receipt.status).toBe("CONFIRMED");
    expect(receipt.feeSun).toBeUndefined();
  });

  it("correctly identifies FAILED when transaction execution reverted or failed", async () => {
    const txHash = "failedhash3333333333333333333333333333333333333333333333333333333333";

    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes("/wallet/gettransactioninfobyid")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: txHash,
              blockNumber: 71255556,
              blockTimeStamp: 1727000503000,
              result: "FAILED",
              receipt: {
                result: "REVERT",
                energy_fee: 20000000,
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const client = new TronGridClient("nile");
    const receipt = await client.getTransactionInfo(txHash);

    expect(receipt.status).toBe("FAILED");
    expect(receipt.contractResult).toBe("REVERT");
  });

  it("handles transient HTTP 429 errors with retry", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve("Too Many Requests"),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            block_header: { raw_data: { number: 71255557, timestamp: 1727000506000 } },
          }),
      });
    });

    const client = new TronGridClient("nile");
    const block = await client.getNowBlock("nile");

    expect(callCount).toBe(2);
    expect(block.blockNumber).toBe(71255557);
  });
});

describe("Client-Side Secret Isolation Audit", () => {
  it("never references TRONGRID_API_KEY in client components (use client)", () => {
    const srcDir = path.resolve(__dirname, "../src");
    const clientFiles: string[] = [];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, "utf8");
          if (content.includes('"use client"') || content.includes("'use client'")) {
            clientFiles.push(fullPath);
          }
        }
      }
    }

    scanDir(srcDir);
    expect(clientFiles.length).toBeGreaterThan(0);

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toContain("TRONGRID_API_KEY");
      expect(content).not.toContain("TRON-PRO-API-KEY");
      expect(content).not.toContain("NEXT_PUBLIC_TRONGRID_API_KEY");
    }
  });
});

describe("Preflight & Transaction Lifecycle Rigorous Checks", () => {
  it("strictly fails preflight check when balance is 0.00 TRX", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq",
      currentNetwork: "nile",
      trxBalance: "0.00",
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(false);
    const balanceCheck = result.checks.find((c) => c.key === "BALANCE_SUFFICIENT");
    expect(balanceCheck?.passed).toBe(false);
    expect(result.currentBalanceTrx).toBe("0.00");
  });

  it("passes preflight check when balance covers deposit amount plus energy buffer", () => {
    const result = buildPreflightChecks({
      isWalletConnected: true,
      walletAddress: "TKM7w4qFmkXQLEF2MgrQroBYpd5TY7i1pq",
      currentNetwork: "nile",
      trxBalance: "75.00", // 50 deposit + 20 buffer = 70 needed
      requiredAmount: "50.00",
      asset: "TRX",
    });

    expect(result.ready).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("guarantees transaction state is PREFLIGHT_FAILED if preflight is not ready", () => {
    const state = determineTransactionState({
      preflightReady: false,
      hasAuthorized: true,
    });
    expect(state).toBe("PREFLIGHT_FAILED");
  });

  it("transitions to READY_TO_SIGN only when preflight is ready and user authorized", () => {
    const state = determineTransactionState({
      preflightReady: true,
      hasAuthorized: true,
    });
    expect(state).toBe("READY_TO_SIGN");
  });
});
