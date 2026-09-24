import { z } from "zod";

export const UsddOverviewDataSchema = z.object({
  totalSupplyValue: z.string().optional().default("0"),
  totalCollateralValue: z.string().optional().default("0"),
  earnTvl: z.string().optional().default("0"),
  earnSa: z.string().optional().default("0"),
  totalSupplyValueDailyChange: z.string().optional(),
  totalCollateralValueDailyChange: z.string().optional(),
});

export const UsddOverviewResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: UsddOverviewDataSchema,
});

export const UsddCollateralItemSchema = z.object({
  chain: z.string(),
  vaultType: z.string(),
  lockedValue: z.number().optional().default(0),
  mintedUSDD: z.number().optional().default(0),
  collateralRatio: z.number().optional().default(0),
  minCollateralRatio: z.string().optional().default("1.2"),
  contractAddress: z.string().optional().default(""),
});

export const UsddCollateralResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.object({
    items: z.array(UsddCollateralItemSchema),
  }),
});

export type UsddOverviewData = z.infer<typeof UsddOverviewDataSchema>;
export type UsddCollateralItem = z.infer<typeof UsddCollateralItemSchema>;
