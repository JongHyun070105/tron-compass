/** Sanitized read-only API response fields captured on 2026-09-29. */
export const LIVE_FIXTURE_CAPTURED_AT = "2026-09-29T03:36:35.276Z";

export const JUSTLEND_MARKETS_RESPONSE = {
  code: 0,
  message: "SUCCESS",
  data: {
    tokenList: [
      {
        address: "TE2RzoSV3wFK99w6J9UnnZ4vLfXYoxvRwP",
        symbol: "jTRX",
        underlyingSymbol: "TRX",
        underlyingAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        underlyingDecimal: 6,
        underlyingPriceInTrx: "1.000000000000000000000000000",
        supplyRate: "0.003156311255040000",
        borrowRate: "0.043290630762768000",
        exchangeRate: "0.010589719168466332",
        cash: "2062554012.001262000000000000",
        totalBorrows: "181479674.036078000000000000",
        totalSupply: "211543326079.38725755",
        reserves: "3849270.893329000000000000",
      },
      {
        address: "TKFRELGGoRgiayhwJTNNLqCNjFoLBh3Mnf",
        symbol: "jUSDD",
        underlyingSymbol: "USDD",
        underlyingAddress: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
        underlyingDecimal: 18,
        underlyingPriceInTrx: "2.982502000000000",
        supplyRate: "0.000008521857648000",
        borrowRate: "0.070011141546960000",
        exchangeRate: "0.010012691899808194",
        cash: "398799330.915391239392294346",
        totalBorrows: "51102.325517687710298192",
        totalSupply: "39833237312.23564542",
        reserves: "12500.661549557879450315",
      },
      {
        address: "TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd",
        symbol: "jUSDT",
        underlyingSymbol: "USDT",
        underlyingAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        underlyingDecimal: 6,
        underlyingPriceInTrx: "2.982502000000000000000000000",
        supplyRate: "0.020032682186160000",
        borrowRate: "0.037298237032656000",
        exchangeRate: "0.010870710286952509",
        cash: "90677855.432055000000000000",
        totalBorrows: "133627395.220808000000000000",
        totalSupply: "20598177656.31078770",
        reserves: "388428.911930000000000000",
      },
    ],
  },
} as const;

export const JUSTLEND_MINING_RESPONSE = {
  code: 0,
  message: "SUCCESS",
  data: {
    TKFRELGGoRgiayhwJTNNLqCNjFoLBh3Mnf: { USDD: "0.03996681" },
  },
} as const;

export const USDD_OVERVIEW_RESPONSE = {
  code: 0,
  message: "SUCCESS",
  data: {
    totalSupplyValue: "1541640185.42848281678149455374447182729766775568877979",
    totalCollateralValue: "2259109809.34",
    earnTvl: "212727813.44807586082123443974447182729766775568877979",
    earnSa: "30062863.9397884455154",
    totalSupplyValueDailyChange: "2116374.600144079776330704949515422983170823258341398",
    totalCollateralValueDailyChange: "6726606.44",
  },
} as const;

export const USDD_COLLATERAL_RESPONSE = {
  code: 0,
  message: "SUCCESS",
  data: {
    items: [
      { chain: "tron", vaultType: "TRX-A", lockedValue: 420382330.26, mintedUSDD: 170640774.92, collateralRatio: 2.4571, minCollateralRatio: "1.2", contractAddress: "TJ1VWPvFVq7sVsN7J7dWJVZz4SLT14qRUr" },
      { chain: "tron", vaultType: "TRX-B", lockedValue: 241910084.56, mintedUSDD: 95216654.39, collateralRatio: 2.5257, minCollateralRatio: "1.17", contractAddress: "TGQKnHDQNyc3QeHJ7YxH8wggdg89UVXyvX" },
      { chain: "tron", vaultType: "TRX-C", lockedValue: 503268789, mintedUSDD: 190089610.15, collateralRatio: 2.6404, minCollateralRatio: "1.3", contractAddress: "TPUPPLTYLdbW4jxwD5g2T7ystxsR9HL2mt" },
      { chain: "tron", vaultType: "USDT-A", lockedValue: 660779.88, mintedUSDD: 540218.75, collateralRatio: 1.1979, minCollateralRatio: "1.05", contractAddress: "TDUkQbjrXs6xUbxGCLknWwJHxVTdysXBhy" },
    ],
  },
} as const;
