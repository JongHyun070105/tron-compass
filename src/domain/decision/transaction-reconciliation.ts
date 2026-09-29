import { DecisionReceipt, ExecutionStatusObservation } from "@/domain/decision/receipt";
import { formatUnits } from "@/lib/math/decimal";
import { TransactionStatusResult } from "@/lib/tron/transaction";

const TX_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export function isReceiptEligibleForChainReconciliation(receipt: DecisionReceipt): boolean {
  const { execution } = receipt;
  return execution.network?.toLowerCase().includes("nile") === true &&
    typeof execution.txHash === "string" &&
    TX_HASH_PATTERN.test(execution.txHash) &&
    ["FAILED", "REVERT", "PENDING", "UNKNOWN", "BROADCAST"].includes(execution.result);
}

function hasConfirmedObservation(observations: TransactionStatusResult["observations"], hash: string) {
  return observations.some((observation) =>
    observation.txHash?.toLowerCase() === hash.toLowerCase() &&
    observation.status === "CONFIRMED" &&
    Number.isSafeInteger(observation.blockNumber) &&
    (observation.blockNumber ?? 0) > 0 &&
    observation.contractResult === "SUCCESS"
  );
}

function hasRepeatedFailure(observations: TransactionStatusResult["observations"], hash: string) {
  let previous: TransactionStatusResult["observations"][number] | null = null;
  for (const observation of observations) {
    const isExplicitFailure = observation.txHash?.toLowerCase() === hash.toLowerCase() &&
      observation.status === "FAILED" &&
      Number.isSafeInteger(observation.blockNumber) &&
      (observation.blockNumber ?? 0) > 0 &&
      !!observation.contractResult &&
      observation.contractResult !== "SUCCESS";
    if (!isExplicitFailure) {
      previous = null;
      continue;
    }
    if (
      previous &&
      previous.blockNumber === observation.blockNumber &&
      previous.contractResult === observation.contractResult
    ) return true;
    previous = observation;
  }
  return false;
}

function toHistoryObservation(
  observation: TransactionStatusResult["observations"][number]
): ExecutionStatusObservation {
  return {
    status: observation.status,
    source: "TronGrid reconciliation",
    observedAt: observation.observedAt,
    txHash: observation.txHash,
    blockNumber: observation.blockNumber ?? null,
    contractResult: observation.contractResult ?? null,
  };
}

/** Applies bounded chain observations to one existing receipt without replacing its identity or history. */
export function reconcileDecisionReceipt(
  receipt: DecisionReceipt,
  result: TransactionStatusResult,
  reconciledAt: string = new Date().toISOString()
): DecisionReceipt {
  const execution = receipt.execution;
  const txHash = execution.txHash;
  if (
    !txHash ||
    !TX_HASH_PATTERN.test(txHash) ||
    execution.network?.toLowerCase().includes("nile") !== true ||
    result.txHash.toLowerCase() !== txHash.toLowerCase()
  ) return receipt;

  const statusHistory = [...(execution.statusHistory ?? [])];
  if (!statusHistory.length && execution.result !== "PREPARED") {
    statusHistory.push({
      status: execution.result,
      source: "Persisted application state",
      observedAt: null,
      txHash,
      blockNumber: execution.blockNumber,
      contractResult: execution.contractResult ?? null,
    });
  }
  statusHistory.push(...result.observations.map(toHistoryObservation));

  const alreadyConfirmed = execution.result === "CONFIRMED" &&
    (execution.blockNumber ?? 0) > 0 &&
    execution.contractResult === "SUCCESS";
  const confirmed = alreadyConfirmed || hasConfirmedObservation(result.observations, txHash);
  const failed = !confirmed && result.status === "FAILED" && hasRepeatedFailure(result.observations, txHash);

  if (confirmed) {
    const confirmation = [...result.observations].reverse().find((observation) =>
      observation.txHash?.toLowerCase() === txHash.toLowerCase() &&
      observation.status === "CONFIRMED" &&
      (observation.blockNumber ?? 0) > 0 &&
      observation.contractResult === "SUCCESS"
    );
    const hasTrustedBeforeSnapshot = Boolean(
      execution.trxBalanceBefore && execution.jTrxBalanceBefore &&
      execution.trxBalanceAfter && execution.jTrxBalanceAfter &&
      execution.balanceEvidenceStatus === "VERIFIED"
    );
    const returnedTrxAmount = Number.isSafeInteger(result.returnedTrxSun) && (result.returnedTrxSun ?? 0) >= 0
      ? formatUnits(String(result.returnedTrxSun), 6)
      : execution.returnedTrxAmount ?? null;
    return {
      ...receipt,
      execution: {
        ...execution,
        network: "NILE",
        result: "CONFIRMED",
        blockNumber: confirmation?.blockNumber ?? execution.blockNumber,
        contractResult: "SUCCESS",
        actualFee: result.feeSun === undefined ? execution.actualFee : `${formatUnits(String(result.feeSun), 6)} TRX`,
        energyUsed: result.energyUsed ?? execution.energyUsed,
        netUsed: result.netUsed ?? execution.netUsed,
        returnedTrxAmount,
        reconciledAt: alreadyConfirmed ? execution.reconciledAt ?? null : reconciledAt,
        balanceEvidenceStatus: hasTrustedBeforeSnapshot ? "VERIFIED" : "UNAVAILABLE",
        ...(hasTrustedBeforeSnapshot ? {} : { trxBalanceDelta: null, jTrxBalanceDelta: null }),
        statusHistory,
      },
    };
  }

  if (failed) {
    const failure = [...result.observations].reverse().find((observation) =>
      observation.txHash?.toLowerCase() === txHash.toLowerCase() &&
      observation.status === "FAILED" &&
      (observation.blockNumber ?? 0) > 0 &&
      !!observation.contractResult &&
      observation.contractResult !== "SUCCESS"
    );
    return {
      ...receipt,
      execution: {
        ...execution,
        result: "FAILED",
        blockNumber: failure?.blockNumber ?? execution.blockNumber,
        contractResult: failure?.contractResult ?? execution.contractResult,
        reconciledAt,
        statusHistory,
      },
    };
  }

  return {
    ...receipt,
    execution: {
      ...execution,
      result: "PENDING",
      statusHistory,
    },
  };
}
