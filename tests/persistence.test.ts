import { describe, expect, it } from "vitest";
import * as persistence from "../src/lib/persistence/storage";
import * as receiptFactory from "../src/domain/decision/receipt";

describe("Decision Receipt persistence", () => {
  it("saves and retrieves receipts by id, then persists appended stop records", async () => {
    expect(typeof (persistence.compassStorage as any).saveDecisionReceipt).toBe("function");
    const receipt = await (receiptFactory as any).createDecisionReceipt({
      id: "persisted-receipt-1",
      parentId: null,
      createdAt: "2026-09-28T00:00:00.000Z",
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
    await (persistence.compassStorage as any).saveDecisionReceipt(receipt);
    const found = await (persistence.compassStorage as any).getDecisionReceiptById(receipt.id);
    const updated = await (persistence.compassStorage as any).updateDecisionReceipt(receipt.id, (value: any) => ({
      ...value,
      stops: [...value.stops, { id: "stop-1", outcome: "STOPPED" }],
    }));

    expect(found.id).toBe(receipt.id);
    expect(updated.stops).toHaveLength(1);
    expect((await (persistence.compassStorage as any).getDecisionReceiptById(receipt.id)).stops).toHaveLength(1);
  });

  it("updates an existing execution by transaction hash without inserting a new execution", async () => {
    const txHash = "c".repeat(64);
    await persistence.compassStorage.recordExecution({
      id: "execution-reconcile-existing",
      planId: "plan-a",
      walletAddress: "TWallet",
      txHash,
      asset: "jTRX",
      amount: "100",
      targetContract: "TContract",
      network: "NILE",
      dataScope: "LIVE_NILE",
      status: "FAILED",
      timestamp: "2026-09-29T00:00:00.000Z",
    });

    const updated = await persistence.compassStorage.updateExecutionByTxHash(txHash, (record) => ({
      ...record,
      status: "CONFIRMED",
    }));
    const matching = (await persistence.compassStorage.getAllExecutions()).filter((item) => item.txHash === txHash);

    expect(updated).toMatchObject({ id: "execution-reconcile-existing", status: "CONFIRMED" });
    expect(matching).toHaveLength(1);
    expect(await persistence.compassStorage.updateExecutionByTxHash("d".repeat(64), (record) => record)).toBeNull();
  });
});
