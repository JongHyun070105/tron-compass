import { Decimal } from "@/lib/math/decimal";

export type BalanceEvidenceStatus = "VERIFIED" | "STALE" | "UNAVAILABLE";
export type BalanceAction = "SUPPLY" | "REDEEM";

export interface TokenBalancePair {
  trxBalance: string | null;
  jTrxBalance: string | null;
}

export interface BalanceEvidence {
  status: BalanceEvidenceStatus;
  trxDelta: string | null;
  jTrxDelta: string | null;
}

function delta(before: string | null, after: string | null, decimals: number): Decimal | null {
  if (before === null || after === null) return null;
  try {
    const oldValue = new Decimal(before);
    const newValue = new Decimal(after);
    if (!oldValue.isFinite() || !newValue.isFinite() || oldValue.isNegative() || newValue.isNegative()) return null;
    return newValue.minus(oldValue).toDecimalPlaces(decimals);
  } catch {
    return null;
  }
}

export function validateBalanceEvidence(
  action: BalanceAction,
  before: TokenBalancePair,
  after: TokenBalancePair
): BalanceEvidence {
  const trxDelta = delta(before.trxBalance, after.trxBalance, 6);
  const jTrxDelta = delta(before.jTrxBalance, after.jTrxBalance, 8);
  if (!trxDelta || !jTrxDelta) return { status: "UNAVAILABLE", trxDelta: null, jTrxDelta: null };

  const expectedDirection = action === "SUPPLY"
    ? trxDelta.isNegative() && jTrxDelta.isPositive()
    : trxDelta.isPositive() && jTrxDelta.isNegative();
  if (!expectedDirection) return { status: "STALE", trxDelta: null, jTrxDelta: null };

  return {
    status: "VERIFIED",
    trxDelta: trxDelta.toString(),
    jTrxDelta: jTrxDelta.toString(),
  };
}

export async function refreshBalancesAfterConfirmation<T extends TokenBalancePair>(
  action: BalanceAction,
  before: TokenBalancePair,
  readFresh: () => Promise<T | null>,
  options: {
    retryDelaysMs?: number[];
    wait?: (delayMs: number) => Promise<void>;
  } = {}
): Promise<{ after: T | null; evidence: BalanceEvidence }> {
  const retryDelays = options.retryDelaysMs ?? [1_000, 2_000, 4_000];
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let latest: T | null = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) await wait(retryDelays[attempt - 1]);
    try {
      latest = await readFresh();
    } catch {
      latest = null;
    }
    if (latest) {
      const evidence = validateBalanceEvidence(action, before, latest);
      if (evidence.status === "VERIFIED") return { after: latest, evidence };
    }
  }

  return {
    after: latest,
    evidence: latest
      ? validateBalanceEvidence(action, before, latest)
      : { status: "UNAVAILABLE", trxDelta: null, jTrxDelta: null },
  };
}
