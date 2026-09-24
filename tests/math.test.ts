import { describe, it, expect } from "vitest";
import {
  toDecimal,
  toDisplayAmount,
  toUsdString,
  toPercentString,
  parseUnits,
  formatUnits,
  SafeMath,
} from "../src/lib/math/decimal";
import {
  calculateHorizonYield,
  calculateEffectiveApy,
  decomposeLegYield,
} from "../src/lib/math/yield";

describe("Decimal Math & Safety", () => {
  it("converts strings and numbers to Decimal safely without precision loss", () => {
    const d1 = toDecimal("123.456789012345678901");
    expect(d1.toString()).toBe("123.456789012345678901");

    expect(toDecimal(null).toString()).toBe("0");
    expect(toDecimal("invalid").toString()).toBe("0");
  });

  it("formats token units between human readable and raw base units (TRX 6 decimals)", () => {
    // 1.5 TRX -> 1,500,000 sun
    const raw = parseUnits("1.5", 6);
    expect(raw).toBe("1500000");

    const formatted = formatUnits("1500000", 6);
    expect(formatted).toBe("1.5");
  });

  it("formats token units for 18 decimals (USDD / TRC20)", () => {
    const raw = parseUnits("250.75", 18);
    expect(raw).toBe("250750000000000000000");

    const formatted = formatUnits("250750000000000000000", 18);
    expect(formatted).toBe("250.75");
  });

  it("handles string formatting correctly", () => {
    expect(toUsdString("1234.567")).toBe("$1234.57");
    expect(toPercentString("0.0525")).toBe("5.25%");
    expect(toDisplayAmount("100.50000", 2)).toBe("100.5");
  });

  it("performs SafeMath operations safely without floating point artifacts", () => {
    // 0.1 + 0.2 in standard JS is 0.30000000000000004
    const sum = SafeMath.add("0.1", "0.2");
    expect(sum.toString()).toBe("0.3");

    const divZero = SafeMath.div("100", "0");
    expect(divZero.toString()).toBe("0");
  });
});

describe("Yield Calculation Engine", () => {
  it("calculates compound horizon yield correctly for 90 days at 10% APY", () => {
    // P = $1000, APY = 10% (0.10), 90 days
    // 1000 * ((1 + 0.10) ^ (90/365) - 1)
    // ~ 23.78 USD
    const yieldUsd = calculateHorizonYield("1000", "0.10", 90);
    const num = parseFloat(yieldUsd);
    expect(num).toBeGreaterThan(23.7);
    expect(num).toBeLessThan(23.9);
  });

  it("returns 0 yield when horizon or rate or principal is zero", () => {
    expect(calculateHorizonYield("1000", "0", 90)).toBe("0");
    expect(calculateHorizonYield("1000", "0.10", 0)).toBe("0");
    expect(calculateHorizonYield("0", "0.10", 90)).toBe("0");
  });

  it("decomposes yield into base, incentive, and costs correctly", () => {
    const decomposition = decomposeLegYield(
      "1000", // $1000
      "0.03", // 3% base APY
      "0.05", // 5% incentive APY
      180,    // 180 days
      "1.50", // $1.5 entry cost
      "1.50"  // $1.5 exit cost
    );

    expect(parseFloat(decomposition.baseYieldUsd)).toBeGreaterThan(0);
    expect(parseFloat(decomposition.incentiveYieldUsd)).toBeGreaterThan(
      parseFloat(decomposition.baseYieldUsd)
    );
    expect(decomposition.totalCostUsd).toBe("3.0000");

    const expectedNet =
      parseFloat(decomposition.baseYieldUsd) +
      parseFloat(decomposition.incentiveYieldUsd) -
      3.0;
    expect(parseFloat(decomposition.netYieldUsd)).toBeCloseTo(expectedNet, 2);
  });
});
