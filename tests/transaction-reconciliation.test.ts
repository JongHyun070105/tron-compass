import { describe, expect, it } from "vitest";
import { createDecisionReceipt, DecisionReceipt } from "@/domain/decision/receipt";
import { isReceiptEligibleForChainReconciliation, reconcileDecisionReceipt } from "@/domain/decision/transaction-reconciliation";
import { TransactionStatusResult } from "@/lib/tron/transaction";
import { compassStorage } from "@/lib/persistence/storage";

const txHash = "a".repeat(64);

async function makeReceipt(result: DecisionReceipt["execution"]["result"] = "FAILED"): Promise<DecisionReceipt> {
  const created = await createDecisionReceipt({
    id: `reconcile-${result.toLowerCase()}`,
    parentId: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    horizonDays: 90,
    rules: { version: 1, items: [] },
    needsConfirmedAt: null,
    evidence: [],
    screening: { included: [], excluded: [] },
    alternatives: [],
    assumptions: [],
    selection: { planId: "plan-a", selectedAt: null },
    approval: { shown: null },
  });
  return {
    ...created,
    execution: {
      ...created.execution,
      network: "NILE",
      txHash,
      result,
      balanceAction: "REDEEM",
      amountAsset: "jTRX",
      amount: "100",
      amountRaw: "10000000000",
    },
  };
}

function observation(
  status: "PENDING" | "CONFIRMED" | "FAILED" | "NOT_FOUND" | "INVALID_RESPONSE",
  overrides: Partial<TransactionStatusResult["observations"][number]> = {}
): TransactionStatusResult["observations"][number] {
  return {
    txHash,
    status,
    observedAt: "2026-09-29T09:42:00.000Z",
    blockNumber: status === "PENDING" || status === "NOT_FOUND" ? undefined : 71382254,
    contractResult: status === "CONFIRMED" ? "SUCCESS" : status === "FAILED" ? "REVERT" : undefined,
    ...overrides,
  };
}

function chainResult(
  status: TransactionStatusResult["status"],
  observations: TransactionStatusResult["observations"],
  extras: Partial<TransactionStatusResult> = {}
): TransactionStatusResult {
  return { txHash, status, observations, ...extras };
}

describe("persisted Decision Receipt chain reconciliation", () => {
  it.each(["FAILED", "REVERT", "PENDING", "UNKNOWN", "BROADCAST"] as const)("rechecks persisted %s receipts", async (status) => {
    const receipt = await makeReceipt(status);
    expect(isReceiptEligibleForChainReconciliation(receipt)).toBe(true);
  });

  it("repairs a persisted FAILED receipt from exact-hash, block-included SUCCESS", async () => {
    const receipt = await makeReceipt("FAILED");
    const updated = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED")], {
      blockNumber: 71382254,
      contractResult: "SUCCESS",
      feeSun: 7_569_900,
      returnedTrxSun: 1_117_763,
    }), "2026-09-29T09:43:00.000Z");

    expect(updated.id).toBe(receipt.id);
    expect(updated.execution).toMatchObject({
      txHash,
      result: "CONFIRMED",
      blockNumber: 71382254,
      contractResult: "SUCCESS",
      actualFee: "7.5699 TRX",
      returnedTrxAmount: "1.117763",
      balanceEvidenceStatus: "UNAVAILABLE",
      trxBalanceDelta: null,
      jTrxBalanceDelta: null,
      reconciledAt: "2026-09-29T09:43:00.000Z",
    });
    expect(updated.execution.statusHistory).toEqual([
      expect.objectContaining({ status: "FAILED", source: "Persisted application state", observedAt: null, contractResult: null }),
      expect.objectContaining({ status: "CONFIRMED", source: "TronGrid reconciliation", contractResult: "SUCCESS" }),
    ]);
  });

  it("repairs a persisted PENDING receipt to CONFIRMED", async () => {
    const receipt = await makeReceipt("PENDING");
    const updated = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED")]));
    expect(updated.execution.result).toBe("CONFIRMED");
    expect(updated.execution.statusHistory?.[0]).toMatchObject({ status: "PENDING", source: "Persisted application state" });
  });

  it("does not finalize one new failure observation and preserves the persisted failure as history", async () => {
    const receipt = await makeReceipt("FAILED");
    const updated = reconcileDecisionReceipt(receipt, chainResult("PENDING", [observation("FAILED")]));
    expect(updated.execution.result).toBe("PENDING");
    expect(updated.execution.statusHistory).toHaveLength(2);
    expect(updated.execution.statusHistory?.[0]).toMatchObject({ status: "FAILED", source: "Persisted application state", observedAt: null });
    expect(updated.execution.statusHistory?.[1]).toMatchObject({ status: "FAILED", source: "TronGrid reconciliation" });
  });

  it("marks failed only after two identical authoritative failure observations", async () => {
    const receipt = await makeReceipt("PENDING");
    const updated = reconcileDecisionReceipt(receipt, chainResult("FAILED", [
      observation("FAILED"),
      observation("FAILED", { observedAt: "2026-09-29T09:42:01.000Z" }),
    ]));
    expect(updated.execution).toMatchObject({ result: "FAILED", blockNumber: 71382254, contractResult: "REVERT" });
  });

  it("never downgrades an already confirmed transaction after timeout or one inconsistent failure", async () => {
    const receipt = await makeReceipt("FAILED");
    const confirmed = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED")]));
    const afterTimeout = reconcileDecisionReceipt(confirmed, chainResult("PENDING", []));
    const afterSingleRevert = reconcileDecisionReceipt(afterTimeout, chainResult("PENDING", [observation("FAILED")]));
    expect(afterSingleRevert.execution.result).toBe("CONFIRMED");
    expect(afterSingleRevert.execution.contractResult).toBe("SUCCESS");
  });

  it("requires matching hash, a block and explicit SUCCESS before confirming", async () => {
    const receipt = await makeReceipt("FAILED");
    const mismatch = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED", { txHash: "b".repeat(64) })]));
    const noBlock = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED", { blockNumber: undefined })]));
    const noExplicitSuccess = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED", { contractResult: undefined })]));
    expect(mismatch.execution.result).toBe("PENDING");
    expect(noBlock.execution.result).toBe("PENDING");
    expect(noExplicitSuccess.execution.result).toBe("PENDING");
  });

  it("updates the same stored receipt id and does not create a duplicate receipt", async () => {
    const receipt = { ...(await makeReceipt("FAILED")), id: "same-receipt-reconciled-once" };
    await compassStorage.saveDecisionReceipt(receipt);
    const updated = reconcileDecisionReceipt(receipt, chainResult("CONFIRMED", [observation("CONFIRMED")]));
    await compassStorage.saveDecisionReceipt(updated);
    const matching = (await compassStorage.getDecisionReceipts()).filter((item) => item.id === receipt.id);
    expect(matching).toHaveLength(1);
    expect(matching[0].execution.result).toBe("CONFIRMED");
    expect(matching[0].execution.txHash).toBe(txHash);
  });
});
