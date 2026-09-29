import { describe, expect, it } from "vitest";
import { classifyPlanExecutability } from "../src/domain/allocation/executability";

describe("plan-level Nile executability", () => {
  it("marks a mixed plan partial while leaving per-leg classifications untouched", () => {
    const legs = [
      { executabilityClass: "NILE_EXECUTABLE" as const },
      { executabilityClass: "LIVE_DATA_ONLY" as const },
      { executabilityClass: "LIVE_DATA_ONLY" as const },
    ];

    expect(classifyPlanExecutability(legs)).toBe("PARTIALLY_NILE_EXECUTABLE");
    expect(legs.map((leg) => leg.executabilityClass)).toEqual([
      "NILE_EXECUTABLE", "LIVE_DATA_ONLY", "LIVE_DATA_ONLY",
    ]);
  });

  it("distinguishes fully executable and analysis-only plans", () => {
    expect(classifyPlanExecutability([{ executabilityClass: "NILE_EXECUTABLE" }])).toBe("FULLY_NILE_EXECUTABLE");
    expect(classifyPlanExecutability([])).toBe("ANALYSIS_ONLY");
    expect(classifyPlanExecutability([{ executabilityClass: "LIVE_DATA_ONLY" }])).toBe("ANALYSIS_ONLY");
  });
});
