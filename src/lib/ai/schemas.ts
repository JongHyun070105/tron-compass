import { z } from "zod";

export const HoldingSchema = z.object({
  asset: z.string(),
  amount: z.string(),
  estimatedUsd: z.string().optional(),
});

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const GoalSchema = z.enum(["LIQUIDITY", "BALANCED", "YIELD"]);

export const ExtractedProfileSchema = z.object({
  holdings: z.array(HoldingSchema).default([]),
  horizonDays: z.number().int().positive().nullable().default(90),
  minimumLiquidUsd: z.string().nullable().default("300"),
  riskLevel: RiskLevelSchema.nullable().default("LOW"),
  maxVolatileExposurePct: z.string().nullable().default("0.20"),
  goal: GoalSchema.nullable().default("BALANCED"),
  allowedAssets: z.array(z.string()).optional().default([]),
  excludedAssets: z.array(z.string()).optional().default([]),
  missingFields: z.array(z.string()).default([]),
  followUpQuestion: z.string().optional(),
  summary: z.string().default(""),
});

export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;
