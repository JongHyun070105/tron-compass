import { AllocationLeg } from "./types";

export type PlanExecutabilityClass =
  | "FULLY_NILE_EXECUTABLE"
  | "PARTIALLY_NILE_EXECUTABLE"
  | "ANALYSIS_ONLY";

export function classifyPlanExecutability(
  allocations: Array<Pick<AllocationLeg, "executabilityClass">>
): PlanExecutabilityClass {
  if (!allocations.length) return "ANALYSIS_ONLY";
  const executableCount = allocations.filter((leg) => leg.executabilityClass === "NILE_EXECUTABLE").length;
  if (!executableCount) return "ANALYSIS_ONLY";
  return executableCount === allocations.length
    ? "FULLY_NILE_EXECUTABLE"
    : "PARTIALLY_NILE_EXECUTABLE";
}

export function describePlanExecutability(status: PlanExecutabilityClass): string {
  if (status === "FULLY_NILE_EXECUTABLE") return "Nile execution supported for every leg";
  if (status === "PARTIALLY_NILE_EXECUTABLE") return "Nile execution available for supported legs";
  return "Analysis only · no Nile-executable legs";
}

export function describeLegacyPlanExecutability(status: string): string {
  if (status === "NILE_EXECUTABLE") return "Nile execution supported for every leg";
  if (status === "LIVE_DATA_ONLY") return "Analysis only · no Nile-executable legs";
  if (status === "UNAVAILABLE") return "Unavailable";
  return status.replaceAll("_", " ");
}
