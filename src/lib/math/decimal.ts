import { Decimal } from "decimal.js";

// Set high precision for financial safety (40 digits)
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function toDecimal(val: string | number | Decimal | null | undefined): Decimal {
  if (val === null || val === undefined || val === "") {
    return new Decimal(0);
  }
  try {
    return new Decimal(val);
  } catch {
    return new Decimal(0);
  }
}

export function toDisplayAmount(
  val: string | number | Decimal | null | undefined,
  maxDecimals: number = 4,
  minDecimals: number = 0
): string {
  const d = toDecimal(val);
  if (d.isZero()) return "0";
  return d.toFixed(maxDecimals).replace(/\.?0+$/, (match) => {
    if (minDecimals === 0) return "";
    return match.slice(0, minDecimals + 1);
  });
}

export function toUsdString(
  val: string | number | Decimal | null | undefined,
  decimals: number = 2
): string {
  const d = toDecimal(val);
  return `$${d.toFixed(decimals)}`;
}

export function toPercentString(
  val: string | number | Decimal | null | undefined,
  decimals: number = 2
): string {
  const d = toDecimal(val).times(100);
  return `${d.toFixed(decimals)}%`;
}

/**
 * Converts a human readable amount to on-chain raw base unit string.
 * Example: 1.5 TRX (6 decimals) -> "1500000"
 */
export function parseUnits(amountStr: string, decimals: number): string {
  const d = toDecimal(amountStr);
  const factor = new Decimal(10).pow(decimals);
  return d.times(factor).floor().toFixed(0);
}

/** Converts a positive decimal amount only when it fits the token precision exactly. */
export function parseUnitsExact(amountStr: string, decimals: number): string | null {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 30 ||
    !/^\d+(?:\.\d+)?$/.test(amountStr)
  ) return null;
  const [whole, fraction = ""] = amountStr.split(".");
  if (fraction.length > decimals) return null;
  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+/, "") || "0";
  return raw === "0" ? null : raw;
}

/**
 * Converts raw on-chain base units to human readable token amount string.
 * Example: "1500000" sun (6 decimals) -> "1.5"
 */
export function formatUnits(rawStr: string, decimals: number): string {
  const d = toDecimal(rawStr);
  const factor = new Decimal(10).pow(decimals);
  return d.div(factor).toString();
}

export const SafeMath = {
  add: (a: string | number | Decimal, b: string | number | Decimal): Decimal =>
    toDecimal(a).plus(toDecimal(b)),
  sub: (a: string | number | Decimal, b: string | number | Decimal): Decimal =>
    toDecimal(a).minus(toDecimal(b)),
  mul: (a: string | number | Decimal, b: string | number | Decimal): Decimal =>
    toDecimal(a).times(toDecimal(b)),
  div: (a: string | number | Decimal, b: string | number | Decimal): Decimal => {
    const divisor = toDecimal(b);
    if (divisor.isZero()) return new Decimal(0);
    return toDecimal(a).dividedBy(divisor);
  },
  gte: (a: string | number | Decimal, b: string | number | Decimal): boolean =>
    toDecimal(a).greaterThanOrEqualTo(toDecimal(b)),
  lte: (a: string | number | Decimal, b: string | number | Decimal): boolean =>
    toDecimal(a).lessThanOrEqualTo(toDecimal(b)),
  gt: (a: string | number | Decimal, b: string | number | Decimal): boolean =>
    toDecimal(a).greaterThan(toDecimal(b)),
  lt: (a: string | number | Decimal, b: string | number | Decimal): boolean =>
    toDecimal(a).lessThan(toDecimal(b)),
  eq: (a: string | number | Decimal, b: string | number | Decimal): boolean =>
    toDecimal(a).equals(toDecimal(b)),
};
