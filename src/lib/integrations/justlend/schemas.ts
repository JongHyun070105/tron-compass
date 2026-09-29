import { z } from "zod";

export const RawJustLendTokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  underlyingSymbol: z.string().optional().default(""),
  underlyingAddress: z.string().optional().default(""),
  underlyingDecimal: z.number().optional().default(18),
  underlyingPriceInTrx: z.string().optional(),
  supplyRate: z.string().optional().default("0"),
  borrowRate: z.string().optional().default("0"),
  exchangeRate: z.string().optional().default("1"),
  cash: z.string().optional().default("0"),
  totalBorrows: z.string().optional().default("0"),
  totalSupply: z.string().optional().default("0"),
  reserves: z.string().optional().default("0"),
});

export const RawJustLendResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.object({
    tokenList: z.array(RawJustLendTokenSchema),
  }),
});

export const RawJustLendMiningApyResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.record(
    z.string(),
    z.object({
      USDD: z.string().regex(/^\d+(?:\.\d+)?$/),
    })
  ),
});

export type RawJustLendToken = z.infer<typeof RawJustLendTokenSchema>;
export type RawJustLendResponse = z.infer<typeof RawJustLendResponseSchema>;
export type RawJustLendMiningApyResponse = z.infer<typeof RawJustLendMiningApyResponseSchema>;
